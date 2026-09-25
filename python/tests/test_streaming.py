"""
StreamingSession without the speech model: a fake decoder reports how much
audio it was given. Synthetic audio (tone bursts, zeros) drives the energy
VAD; real recorded speech under room noise drives Silero VAD — the case a
microphone with automatic gain produces, where an energy VAD never hears the
pause and the utterance never ends.

    cd python && .venv/Scripts/python -m unittest discover -s tests -v
"""
from __future__ import annotations

import asyncio
import itertools
import sys
import time
import unittest
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.streaming import SAMPLE_RATE, StreamConfig, StreamingSession, quietest_cut  # noqa: E402
from services.vad import EnergyVAD, SileroVAD  # noqa: E402

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "speech_add_metformin.wav"
rng = np.random.default_rng(0)


def room_noise(seconds: float, rms: float) -> np.ndarray:
    return (rng.standard_normal(int(seconds * SAMPLE_RATE)) * rms).astype(np.float32)


def recorded_speech() -> np.ndarray:
    with wave.open(str(FIXTURE)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0


def speech(seconds: float) -> np.ndarray:
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return (0.2 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(seconds * SAMPLE_RATE), dtype=np.float32)


def fake_decode(pcm: np.ndarray) -> str:
    return f"{len(pcm) / SAMPLE_RATE:.1f}s"


async def stream(chunks: list[np.ndarray], config: StreamConfig | None = None, realtime: bool = False, vad=None, decode=fake_decode) -> list[dict]:
    events: list[dict] = []

    async def emit(e: dict) -> None:
        events.append(e)

    session = StreamingSession(decode, emit, config or StreamConfig(endpoint_ms=500, partial_interval_ms=300), vad=vad or EnergyVAD())
    audio = np.concatenate(chunks)
    step = SAMPLE_RATE // 10  # 100 ms blocks, like the browser sends
    for i in range(0, len(audio), step):
        await session.feed(audio[i : i + step])
        await asyncio.sleep(0.01 if realtime else 0)
    await asyncio.sleep(0.05)
    await session.flush()
    await asyncio.sleep(0.05)
    await session.close()
    return events


class SileroEndpointingTest(unittest.TestCase):
    """Real speech, real room noise — the utterance must end on the pause, whatever the noise."""

    @classmethod
    def setUpClass(cls):
        try:
            SileroVAD()
        except Exception as exc:  # noqa: BLE001
            raise unittest.SkipTest(f"Silero VAD not available: {exc}")

    def test_utterance_ends_on_the_pause_even_with_room_noise(self):
        speech = recorded_speech()
        # A decoder whose text always changes, and no length limit: only the VAD can end the utterance.
        config = StreamConfig(endpoint_ms=900, partial_interval_ms=300, stable_ms=10**9, max_utterance_s=10**6)
        for rms in (0.0, 0.01, 0.02, 0.04, 0.08):
            counter = itertools.count()
            audio = [room_noise(0.3, rms), speech + room_noise(len(speech) / SAMPLE_RATE, rms), room_noise(3.0, rms)]
            events = asyncio.run(stream(audio, config, vad=SileroVAD(), decode=lambda pcm, c=counter: f"text {next(c)}"))
            with self.subTest(noise_rms=rms):
                self.assertEqual(sum(e["type"] == "final" for e in events), 1)

    def test_noise_alone_is_never_an_utterance(self):
        events = asyncio.run(stream([room_noise(5.0, 0.04)], vad=SileroVAD()))
        self.assertEqual(events, [])


class SafetyNetTest(unittest.TestCase):
    """Even when every frame sounds like speech (a TV in the room), an utterance ends."""

    def test_the_transcript_stopped_changing(self):
        config = StreamConfig(endpoint_ms=10**6, partial_interval_ms=300, stable_ms=1500, max_utterance_s=10**6)
        events = asyncio.run(stream([speech(6.0)], config, realtime=True, decode=lambda pcm: "same words"))
        final = [e for e in events if e["type"] == "final"]
        self.assertGreaterEqual(len(final), 1)
        self.assertEqual(final[0]["text"], "same words")

    def test_a_slow_decode_does_not_end_the_utterance_while_speech_continues(self):
        # Each partial takes longer than stable_ms of audio to decode, and every one finds new words:
        # the words spoken during a decode are unknown, not unchanged, so only the pause ends the utterance.
        counter = itertools.count()

        def slow(pcm):
            time.sleep(0.2)
            return f"text {next(counter)}"

        config = StreamConfig(endpoint_ms=900, partial_interval_ms=100, stable_ms=300, max_utterance_s=10**6)
        events = asyncio.run(stream([speech(10.0), silence(1.5)], config, realtime=True, decode=slow))
        self.assertEqual(sum(e["type"] == "final" for e in events), 1)

    def test_the_utterance_is_too_long(self):
        config = StreamConfig(endpoint_ms=10**6, partial_interval_ms=10**6, stable_ms=10**9, max_utterance_s=2.0)
        events = asyncio.run(stream([speech(5.0)], config))
        self.assertGreaterEqual(sum(e["type"] == "final" for e in events), 2)


class StreamingSessionTest(unittest.TestCase):
    def test_one_utterance_gives_start_partials_end_and_one_final(self):
        events = asyncio.run(stream([silence(0.5), speech(2.0), silence(1.0)], realtime=True))
        types = [e["type"] for e in events]
        self.assertEqual(types[0], "speech_start")
        self.assertIn("partial", types)
        self.assertEqual(types.count("final"), 1)
        self.assertLess(types.index("speech_end"), types.index("final"))
        final = next(e for e in events if e["type"] == "final")
        # 2 s of speech + pre-roll + a short tail; trailing silence is trimmed before the final decode.
        self.assertAlmostEqual(float(final["text"][:-1]), 2.3, delta=0.35)

    def test_silence_alone_produces_nothing(self):
        events = asyncio.run(stream([silence(3.0)]))
        self.assertEqual(events, [])

    def test_a_pause_splits_two_utterances(self):
        events = asyncio.run(stream([speech(1.0), silence(1.0), speech(1.0), silence(1.0)]))
        self.assertEqual([e["type"] for e in events if e["type"] in ("speech_start", "final")], ["speech_start", "final", "speech_start", "final"])

    def test_a_short_breath_does_not_end_the_utterance(self):
        events = asyncio.run(stream([speech(1.0), silence(0.3), speech(1.0), silence(1.0)]))
        self.assertEqual(sum(e["type"] == "final" for e in events), 1)

    def test_flush_finishes_speech_that_is_still_going(self):
        events = asyncio.run(stream([speech(1.5)]))
        self.assertEqual(events[-1]["type"], "final")

    def test_long_speech_is_committed_in_pieces_and_joined(self):
        config = StreamConfig(endpoint_ms=500, partial_interval_ms=300, max_segment_s=3.0)
        events = asyncio.run(stream([speech(4.0), silence(0.3), speech(4.0), silence(1.0)], config, realtime=True))
        final = next(e for e in events if e["type"] == "final")
        pieces = final["text"].split()
        self.assertGreater(len(pieces), 1)  # committed text + the decoded tail
        self.assertAlmostEqual(sum(float(p[:-1]) for p in pieces), 8.6, delta=0.8)

    def test_quietest_cut_lands_in_the_pause(self):
        audio = np.concatenate([speech(2.0), silence(0.5), speech(2.0)])
        cut = quietest_cut(audio, 0, len(audio))
        self.assertTrue(2.0 * SAMPLE_RATE <= cut <= 2.5 * SAMPLE_RATE)

    def test_client_config_overrides_only_known_positive_values(self):
        config = StreamConfig()
        config.update({"endpoint_ms": 700, "nonsense": 1, "partial_interval_ms": -5})
        self.assertEqual(config.endpoint_ms, 700)
        self.assertFalse(hasattr(config, "nonsense"))
        self.assertGreater(config.partial_interval_ms, 0)


class SecondOpinionTest(unittest.TestCase):
    """A second recogniser re-hears each finished utterance with the app's vocabulary as its prompt."""

    def run_session(self, chunks, refine, vocabulary=None):
        events: list[dict] = []
        heard: list[tuple[int, str | None]] = []
        main_prompts: list[str | None] = []
        self.main_prompts = main_prompts

        async def emit(e: dict) -> None:
            events.append(e)

        def second(pcm, prompt):
            heard.append((len(pcm), prompt))
            return refine(pcm)

        def main(pcm, prompt=None):
            main_prompts.append(prompt)
            return "select patient gems and milk"

        async def go():
            session = StreamingSession(main, emit, StreamConfig(endpoint_ms=500, partial_interval_ms=300), vad=EnergyVAD(), refine=second)
            session.vocabulary = vocabulary
            audio = np.concatenate(chunks)
            for i in range(0, len(audio), SAMPLE_RATE // 10):
                await session.feed(audio[i : i + SAMPLE_RATE // 10])
            await session.flush()
            await session.close()

        asyncio.run(go())
        return [e for e in events if e["type"] == "final"], heard

    def test_the_final_carries_both_versions_and_the_vocabulary_reaches_the_second(self):
        finals, heard = self.run_session([silence(0.3), speech(1.5), silence(1.0)], lambda pcm: "Select patient James Ahmed.", vocabulary="James Ahmed, Metformin")
        self.assertEqual(finals, [{"type": "final", "text": "select patient gems and milk", "alt": "Select patient James Ahmed."}])
        self.assertEqual(heard[0][1], "James Ahmed, Metformin")
        # The main recogniser gets the vocabulary as well (Whisper uses it; Omi ignores it).
        self.assertIn("James Ahmed, Metformin", self.main_prompts)
        self.assertGreater(heard[0][0], SAMPLE_RATE)  # the whole utterance, not a tail

    def test_a_failing_second_recogniser_never_costs_the_transcript(self):
        def broken(pcm):
            raise RuntimeError("whisper crashed")

        finals, _ = self.run_session([silence(0.3), speech(1.5), silence(1.0)], broken)
        self.assertEqual(finals, [{"type": "final", "text": "select patient gems and milk"}])


if __name__ == "__main__":
    unittest.main()
