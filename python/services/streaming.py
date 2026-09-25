"""
Live streaming transcription with Omi Med STT.

The browser streams 16 kHz mono PCM over a WebSocket as the user speaks. A
`StreamingSession` turns that stream into utterances and transcripts:

  * voice activity detection on 32 ms frames with a neural VAD (Silero,
    services/vad.py) that tells speech from background noise, and a pre-roll
    so the first syllable is never clipped;
  * while someone is speaking, the utterance so far is re-decoded every
    `partial_interval_ms` and sent as a `partial` transcript, so words appear
    on screen while they are being said;
  * a pause of `endpoint_ms` ends the utterance: the audio is decoded one last
    time and sent as the `final` transcript;
  * speech longer than `max_segment_s` is committed piece by piece at the
    quietest moment near the limit, so decoding cost never grows without bound
    and long dictation streams just as smoothly as a short command;
  * two safety nets end an utterance even if the VAD keeps hearing "speech"
    (a TV, a noisy corridor): the transcript has stopped changing for
    `stable_ms`, or the utterance reached `max_utterance_s`.

Parakeet-TDT (the architecture Omi Med STT is built on) decodes whole
segments, not token-by-token, so "streaming" here means incremental
re-decoding of a bounded window — the standard way to stream an offline ASR
model. Nothing here depends on the transport: the WebSocket handler in app.py
feeds samples in and forwards the events out.

Events sent to the client:
  {"type": "speech_start"}
  {"type": "partial", "text": "..."}   the utterance so far (replaces the previous partial)
  {"type": "speech_end"}               pause detected, final decode running
  {"type": "final", "text": "..."}     the finished utterance
  {"type": "error", "message": "..."}  a decode failed; the session keeps running
"""
from __future__ import annotations

import asyncio
import os
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Awaitable, Callable

import numpy as np

from .vad import FRAME, SAMPLE_RATE, create_vad

FRAME_MS = FRAME * 1000 // SAMPLE_RATE  # 32

Decode = Callable[[np.ndarray], str]
Emit = Callable[[dict], Awaitable[None]]


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass
class StreamConfig:
    """Tuning for one stream. Every value can be overridden by the client's `config` message."""

    #: Silence after speech that ends an utterance.
    endpoint_ms: int = field(default_factory=lambda: _env_int("CAREFLOW_STT_ENDPOINT_MS", 900))
    #: Consecutive voiced time needed before speech is considered to have started.
    min_speech_ms: int = 96
    #: Audio kept from before the speech onset.
    preroll_ms: int = 300
    #: How often the partial transcript is refreshed while speaking.
    partial_interval_ms: int = field(default_factory=lambda: _env_int("CAREFLOW_STT_PARTIAL_MS", 500))
    #: Uncommitted audio longer than this is committed at a quiet point.
    max_segment_s: float = 12.0
    #: VAD probability above which a frame is speech …
    speech_prob: float = 0.5
    #: … and below which a frame counts towards the pause that ends the utterance (hysteresis).
    silence_prob: float = 0.35
    #: The transcript has not changed across this much decoded audio while "speech" continues: the speaker has stopped.
    stable_ms: int = 3000
    #: No utterance is longer than this (long ones are committed in chunks, so this only bounds a stuck VAD).
    max_utterance_s: float = 60.0

    def update(self, values: dict) -> None:
        for key, value in values.items():
            if hasattr(self, key) and isinstance(value, (int, float)) and value > 0:
                setattr(self, key, type(getattr(self, key))(value))


def quietest_cut(audio: np.ndarray, lo: int, hi: int, window: int = 4800, hop: int = 800) -> int:
    """Sample index of the quietest `window` inside [lo, hi) — where a segment can be cut without splitting a word."""
    if hi - lo <= window:
        return hi
    seg = audio[lo:hi].astype(np.float64) ** 2
    csum = np.concatenate(([0.0], np.cumsum(seg)))
    starts = np.arange(0, len(seg) - window, hop)
    energies = csum[starts + window] - csum[starts]
    best = int(starts[int(np.argmin(energies))])
    return lo + best + window // 2


class StreamingSession:
    def __init__(
        self,
        decode: Decode,
        emit: Emit,
        config: StreamConfig | None = None,
        vad: Callable[[np.ndarray], float] | None = None,
        on_final: Callable[[np.ndarray, str, dict], None] | None = None,
        refine: Callable[[np.ndarray, str | None], str] | None = None,
    ) -> None:
        self._decode_fn = decode
        self._emit = emit
        #: Sees each finished utterance's audio and transcript (voice diagnostics).
        self._on_final = on_final
        #: A second recogniser that re-hears each finished utterance with `vocabulary` as its prompt;
        #: its text is sent as the final's `alt`. It runs while Omi decodes, so it adds little delay.
        self._refine = refine
        #: The names the app knows right now (patients, drugs, diagnoses, providers) — set by the client.
        self.vocabulary: str | None = None
        self.config = config or StreamConfig()
        self._vad = vad or create_vad()[0]
        self._loop = asyncio.get_running_loop()
        self._lock = asyncio.Lock()  # one decode at a time, in order
        self._pending = np.zeros(0, dtype=np.float32)  # samples not yet framed
        self._reset_utterance()
        self._preroll: deque[np.ndarray] = deque(maxlen=max(1, self.config.preroll_ms // FRAME_MS))
        self._partial_task: asyncio.Task | None = None
        self._closed = False

    # ------------------------------------------------------------------ state

    def _reset_utterance(self) -> None:
        self._in_speech = False
        self._voiced_ms = 0
        self._silence_ms = 0
        self._frames: list[np.ndarray] = []
        self._audio: np.ndarray | None = None  # cached concatenation of _frames
        self._committed: list[str] = []
        self._offset = 0  # first sample not yet covered by `_committed`
        self._last_partial_samples = 0
        self._last_text = ""
        self._text_changed_at = 0  # utterance sample index when the partial transcript last changed
        self._text_checked_at = 0  # utterance sample index covered by the latest finished partial
        self._utterance_id = getattr(self, "_utterance_id", 0) + 1

    def _utterance_audio(self) -> np.ndarray:
        if self._audio is None or len(self._audio) != sum(len(f) for f in self._frames):
            self._audio = np.concatenate(self._frames) if self._frames else np.zeros(0, dtype=np.float32)
        return self._audio

    # ------------------------------------------------------------------ input

    async def feed(self, samples: np.ndarray) -> None:
        """Accept any number of 16 kHz float32 samples."""
        if self._closed:
            return
        self._pending = np.concatenate((self._pending, samples.astype(np.float32, copy=False)))
        while len(self._pending) >= FRAME:
            frame, self._pending = self._pending[:FRAME], self._pending[FRAME:]
            await self._on_frame(frame)

    async def flush(self) -> None:
        """End of stream: whatever is being said is finished and transcribed now."""
        if self._in_speech:
            await self._finalize()

    async def close(self) -> None:
        self._closed = True
        if self._partial_task:
            self._partial_task.cancel()

    # ------------------------------------------------------------------ VAD

    async def _on_frame(self, frame: np.ndarray) -> None:
        cfg = self.config
        prob = self._vad(frame)

        if not self._in_speech:
            self._preroll.append(frame)
            if prob >= cfg.speech_prob:
                self._voiced_ms += FRAME_MS
                if self._voiced_ms >= cfg.min_speech_ms:
                    self._in_speech = True
                    self._silence_ms = 0
                    self._frames = list(self._preroll)
                    self._preroll.clear()
                    await self._emit({"type": "speech_start"})
            else:
                self._voiced_ms = 0
            return

        self._frames.append(frame)
        # Hysteresis: once speaking, a less certain frame still counts as speech.
        if prob >= cfg.silence_prob:
            self._silence_ms = 0
        else:
            self._silence_ms += FRAME_MS
            if self._silence_ms >= cfg.endpoint_ms:
                return await self._end()

        total = sum(len(f) for f in self._frames)
        # Safety nets: the words stopped changing, or the utterance is simply too long.
        # "Stopped changing" is judged on audio the partials have actually decoded: while a slow decode
        # is still running, the words spoken meanwhile are unknown, not unchanged.
        if self._last_text and (self._text_checked_at - self._text_changed_at) * 1000 >= cfg.stable_ms * SAMPLE_RATE:
            return await self._end()
        if total >= cfg.max_utterance_s * SAMPLE_RATE:
            return await self._end()

        if total - self._offset > cfg.max_segment_s * SAMPLE_RATE and not self._lock.locked():
            self._spawn(self._commit_chunk())
        elif (total - self._last_partial_samples) * 1000 >= cfg.partial_interval_ms * SAMPLE_RATE and not self._lock.locked():
            self._last_partial_samples = total
            self._spawn(self._partial())

    async def _end(self) -> None:
        await self._emit({"type": "speech_end"})
        await self._finalize()

    # ------------------------------------------------------------------ decoding

    def _spawn(self, coro: Awaitable[None]) -> None:
        self._partial_task = asyncio.ensure_future(coro)

    async def _decode(self, pcm: np.ndarray) -> str:
        if len(pcm) < SAMPLE_RATE // 10:  # < 100 ms: nothing to transcribe
            return ""
        # The app's vocabulary goes to the recogniser too: engines that take a prompt (Whisper) use it.
        args = (pcm, self.vocabulary) if self.vocabulary else (pcm,)
        return (await self._loop.run_in_executor(None, self._decode_fn, *args)).strip()

    async def _second_opinion(self, audio: np.ndarray) -> str:
        if len(audio) < SAMPLE_RATE // 4:
            return ""
        try:
            return (await self._loop.run_in_executor(None, self._refine, audio, self.vocabulary)).strip()
        except Exception:  # noqa: BLE001 — the second opinion is optional; Omi's transcript still goes out
            return ""

    def _text(self, tail: str) -> str:
        return " ".join(t for t in [*self._committed, tail] if t).strip()

    async def _partial(self) -> None:
        async with self._lock:
            utterance = self._utterance_id
            decoded_upto = sum(len(f) for f in self._frames)
            try:
                tail = await self._decode(self._utterance_audio()[self._offset :])
            except Exception as exc:  # noqa: BLE001 — a failed partial is not worth interrupting speech for
                await self._emit({"type": "error", "message": f"partial decode failed: {exc}"[:300]})
                return
            if utterance == self._utterance_id and self._in_speech:
                text = self._text(tail)
                if text != self._last_text:
                    self._last_text = text
                    self._text_changed_at = decoded_upto
                self._text_checked_at = decoded_upto
                if text:
                    await self._emit({"type": "partial", "text": text})

    async def _commit_chunk(self) -> None:
        """Decode the oldest part of a long utterance, cut at a quiet point, and keep its text."""
        async with self._lock:
            utterance = self._utterance_id
            audio = self._utterance_audio()
            limit = self._offset + int(self.config.max_segment_s * SAMPLE_RATE)
            cut = quietest_cut(audio, max(self._offset, limit - 4 * SAMPLE_RATE), min(limit, len(audio)))
            try:
                text = await self._decode(audio[self._offset : cut])
            except Exception as exc:  # noqa: BLE001
                await self._emit({"type": "error", "message": f"decode failed: {exc}"[:300]})
                return
            if utterance != self._utterance_id:
                return
            if text:
                self._committed.append(text)
            self._offset = cut
            if self._committed:
                await self._emit({"type": "partial", "text": self._text("")})

    async def _finalize(self) -> None:
        # Close the utterance first so frames arriving meanwhile start a new one.
        frames, committed, offset = self._frames, self._committed, self._offset
        silence_ms = self._silence_ms
        self._reset_utterance()
        async with self._lock:
            audio = np.concatenate(frames) if frames else np.zeros(0, dtype=np.float32)
            # Trailing silence adds decode time and nothing else; keep a short tail for the last phoneme.
            trailing = max(0, silence_ms - 200) * SAMPLE_RATE // 1000
            if trailing:
                audio = audio[: max(offset, len(audio) - trailing)]
            started = time.perf_counter()
            second = asyncio.ensure_future(self._second_opinion(audio)) if self._refine is not None else None
            try:
                tail = await self._decode(audio[offset:])
            except Exception as exc:  # noqa: BLE001
                await self._emit({"type": "error", "message": f"decode failed: {exc}"[:300]})
                tail = ""
            text = " ".join(t for t in [*committed, tail] if t).strip()
            alt = await second if second is not None else ""
            # Whisper invents words for noise ("Thank you."); only speech Omi heard gets a second version.
            event = {"type": "final", "text": text, **({"alt": alt} if text and alt else {})}
            await self._emit(event)
            if self._on_final is not None:
                info = {"final_decode_ms": round((time.perf_counter() - started) * 1000), "chunks": len(committed) + 1, "endpoint_ms": self.config.endpoint_ms, **({"alt": alt} if alt else {})}
                try:
                    await asyncio.to_thread(self._on_final, audio, text, info)
                except Exception:  # noqa: BLE001 — diagnostics never break recognition
                    pass
