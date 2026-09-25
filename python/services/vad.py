"""
Voice activity detection for the live stream: is there speech in this frame?

`SileroVAD` — a small neural VAD (Silero VAD v5, ~2 MB ONNX, CPU). It tells
speech from background noise, so an utterance ends when the speaker stops even
in a noisy room or with a microphone whose automatic gain raises the noise
floor between sentences. It is downloaded on first use to python/models/.

`EnergyVAD` — loudness against an adaptive noise floor. Used only when the
Silero model cannot be loaded (e.g. offline on first run); it is reliable in a
quiet room only, and the bridge says so in /api/health.

Both look at 32 ms frames (512 samples at 16 kHz) and return a speech
probability in [0, 1].
"""
from __future__ import annotations

import hashlib
import urllib.request
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16000
FRAME = 512  # 32 ms — the window Silero VAD v5 takes at 16 kHz

MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "silero_vad.onnx"
MODEL_URL = "https://raw.githubusercontent.com/snakers4/silero-vad/master/src/silero_vad/data/silero_vad.onnx"
MODEL_SHA256 = "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"


class SileroVAD:
    name = "silero-vad v5"
    CONTEXT = 64  # samples of the previous window the model expects in front of each one

    _session = None  # the ONNX session is shared; each stream keeps its own recurrent state

    def __init__(self) -> None:
        if SileroVAD._session is None:
            SileroVAD._session = self._load()
        self.reset()

    @staticmethod
    def _load():
        import onnxruntime as ort  # type: ignore

        if not MODEL_PATH.exists():
            MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
            tmp = MODEL_PATH.with_suffix(".download")
            urllib.request.urlretrieve(MODEL_URL, tmp)  # noqa: S310 — fixed https URL, checksum verified below
            if hashlib.sha256(tmp.read_bytes()).hexdigest() != MODEL_SHA256:
                tmp.unlink(missing_ok=True)
                raise RuntimeError("the downloaded Silero VAD model failed its checksum")
            tmp.replace(MODEL_PATH)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        return ort.InferenceSession(str(MODEL_PATH), sess_options=options, providers=["CPUExecutionProvider"])

    def reset(self) -> None:
        self._state = np.zeros((2, 1, 128), dtype=np.float32)
        self._context = np.zeros(self.CONTEXT, dtype=np.float32)

    def __call__(self, frame: np.ndarray) -> float:
        x = np.concatenate((self._context, frame.astype(np.float32, copy=False)))[None, :]
        prob, self._state = SileroVAD._session.run(None, {"input": x, "state": self._state, "sr": np.array(SAMPLE_RATE, dtype=np.int64)})
        self._context = frame[-self.CONTEXT :].astype(np.float32, copy=False)
        return float(prob[0, 0])


class EnergyVAD:
    """Loudness against an adaptive noise floor — the fallback when Silero is unavailable."""

    name = "energy (fallback)"

    def __init__(self, min_rms: float = 0.01, ratio: float = 3.0) -> None:
        self.min_rms = min_rms
        self.ratio = ratio
        self.reset()

    def reset(self) -> None:
        self.floor = 0.004

    def __call__(self, frame: np.ndarray) -> float:
        rms = float(np.sqrt(np.mean(frame.astype(np.float64) ** 2)))
        threshold = max(self.min_rms, self.floor * self.ratio)
        # The floor follows quiet audio down at once and loud audio up slowly, so steady noise
        # raises it over a few seconds instead of counting as speech forever.
        self.floor = rms if rms < self.floor else self.floor * 0.995 + rms * 0.005
        return min(1.0, rms / (2 * threshold))


def create_vad():
    """Silero if it can be loaded, otherwise the energy fallback (and why)."""
    try:
        return SileroVAD(), None
    except Exception as exc:  # noqa: BLE001
        return EnergyVAD(), f"Silero VAD unavailable ({exc}); using the energy fallback, which needs a quiet room"
