"""
Speech-to-text adapters for omi-health/omi-med-stt-v1 (0.6B).

Three interchangeable engines — pick with CAREFLOW_STT_ENGINE:

  mlx   -> omi-health/omi-med-stt-v1-mlx (or -mlx-q8) via `mlx-whisper`   (Apple Silicon)
  gguf  -> omi-health/omi-med-stt-v1-gguf via whisper.cpp python bindings  (any platform)
  mock  -> returns a canned transcript, for wiring tests

All engines expose the same tiny interface so app.py never cares which runs.
The model repos follow the Whisper architecture, so Whisper-compatible runtimes load them.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path


class BaseSTT:
    name = "base"

    def is_ready(self) -> bool:
        return False

    def transcribe(self, audio_path: str) -> str:  # pragma: no cover - interface
        raise NotImplementedError


def _to_wav16k(audio_path: str) -> str:
    """Browsers send webm/ogg; most runtimes want 16 kHz mono WAV. Requires ffmpeg on PATH."""
    out = str(Path(audio_path).with_suffix(".wav"))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", audio_path, "-ar", "16000", "-ac", "1", out], check=True)
    return out


class MlxSTT(BaseSTT):
    """omi-med-stt on Apple Silicon through mlx-whisper."""

    name = "mlx (omi-med-stt-v1-mlx)"

    def __init__(self) -> None:
        self.repo = os.getenv("CAREFLOW_STT_MODEL", "omi-health/omi-med-stt-v1-mlx-q8")
        try:
            import mlx_whisper  # type: ignore

            self._mlx = mlx_whisper
        except Exception:  # noqa: BLE001
            self._mlx = None

    def is_ready(self) -> bool:
        return self._mlx is not None

    def transcribe(self, audio_path: str) -> str:
        wav = _to_wav16k(audio_path)
        result = self._mlx.transcribe(wav, path_or_hf_repo=self.repo, language="en")
        return (result.get("text") or "").strip()


class GgufSTT(BaseSTT):
    """omi-med-stt GGUF through whisper.cpp (pywhispercpp)."""

    name = "gguf (omi-med-stt-v1-gguf / whisper.cpp)"

    def __init__(self) -> None:
        self.model_path = os.getenv("CAREFLOW_STT_MODEL_PATH", "models/omi-med-stt-v1.gguf")
        self._model = None
        try:
            from pywhispercpp.model import Model  # type: ignore

            if Path(self.model_path).exists():
                self._model = Model(self.model_path, n_threads=int(os.getenv("CAREFLOW_STT_THREADS", "4")))
        except Exception:  # noqa: BLE001
            self._model = None

    def is_ready(self) -> bool:
        return self._model is not None

    def transcribe(self, audio_path: str) -> str:
        wav = _to_wav16k(audio_path)
        segments = self._model.transcribe(wav, language="en")
        return " ".join(seg.text.strip() for seg in segments).strip()


class MockSTT(BaseSTT):
    name = "mock"

    def is_ready(self) -> bool:
        return True

    def transcribe(self, audio_path: str) -> str:
        return os.getenv("CAREFLOW_STT_MOCK_TEXT", "go to patient search")


def create_stt_engine() -> BaseSTT:
    engine = os.getenv("CAREFLOW_STT_ENGINE", "gguf").lower()
    if engine == "mlx":
        return MlxSTT()
    if engine == "mock":
        return MockSTT()
    return GgufSTT()
