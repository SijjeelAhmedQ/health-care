"""
Opt-in voice diagnostics (Configuration → Speech recognition → "Record voice commands").

While it is on, every utterance the stream finalises is kept as it reached the recogniser, so a
misunderstood command can be replayed and measured instead of guessed at:

  python/recordings/<date>/<time>-<id>.wav   the utterance audio (16 kHz mono)
  python/recordings/<date>/utterances.jsonl  one line per utterance: transcript, level, clipping, timing
  python/recordings/<date>/traces.jsonl      what the assistant did with each transcript (sent by the app)

Nothing leaves this machine; delete the folder to discard it.
"""
from __future__ import annotations

import json
import threading
import time
import wave
from pathlib import Path
from typing import Any

import numpy as np

RECORDINGS_DIR = Path(__file__).resolve().parent.parent / "recordings"
SAMPLE_RATE = 16000


def audio_stats(audio: np.ndarray) -> dict[str, float]:
    """Loudness facts that explain most recognition failures: too quiet, clipped, or cut short."""
    if len(audio) == 0:
        return {"duration_s": 0.0, "rms_dbfs": -120.0, "peak_dbfs": -120.0, "clipped_pct": 0.0}
    rms = float(np.sqrt(np.mean(np.square(audio, dtype=np.float64))))
    peak = float(np.max(np.abs(audio)))
    return {
        "duration_s": round(len(audio) / SAMPLE_RATE, 2),
        "rms_dbfs": round(20 * np.log10(max(rms, 1e-6)), 1),
        "peak_dbfs": round(20 * np.log10(max(peak, 1e-6)), 1),
        "clipped_pct": round(100 * float(np.mean(np.abs(audio) >= 0.99)), 2),
    }


class Recorder:
    def __init__(self, root: Path = RECORDINGS_DIR) -> None:
        self.root = root
        self._lock = threading.Lock()
        self._seq = 0

    def _day(self) -> Path:
        folder = self.root / time.strftime("%Y-%m-%d")
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def _append(self, name: str, entry: dict[str, Any]) -> None:
        with self._lock, open(self._day() / name, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def save_utterance(self, audio: np.ndarray, text: str, info: dict[str, Any]) -> str:
        with self._lock:
            self._seq += 1
            seq = self._seq
        stamp = time.strftime("%H%M%S")
        wav_path = self._day() / f"{stamp}-{seq:04d}.wav"
        pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2")
        with wave.open(str(wav_path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SAMPLE_RATE)
            w.writeframes(pcm.tobytes())
        self._append("utterances.jsonl", {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "wav": wav_path.name, "text": text, **audio_stats(audio), **info})
        return wav_path.name

    def save_trace(self, trace: dict[str, Any]) -> None:
        self._append("traces.jsonl", {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), **trace})
