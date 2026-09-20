"""
Speech-to-text engines for **Omi Med STT v1** (0.6B, Parakeet-TDT based).

Runtime package: `omi-med-stt` (https://github.com/Omi-Health/omi-med-stt-runtime).
Model artifacts, selected with CAREFLOW_STT_ENGINE:

  gguf     omi-health/omi-med-stt-v1-gguf      q8_0 GGUF via patched parakeet.cpp  (Linux / Windows CPU)
  mlx      omi-health/omi-med-stt-v1-mlx       full-precision MLX                   (Apple Silicon)
  mlx-q8   omi-health/omi-med-stt-v1-mlx-q8    8-bit MLX                            (Apple Silicon, default on macOS)
  auto     picks mlx-q8 on Apple Silicon, gguf everywhere else
  mock     canned transcript for wiring tests

The GGUF engine keeps the parakeet.cpp model resident in memory (C API) so each
speech segment is transcribed in well under a second; the CLI-per-request path
would otherwise reload the model on every call.
"""
from __future__ import annotations

import os
import platform
import sys
import threading
from pathlib import Path

MLX_REPOS = {
    "mlx": "omi-health/omi-med-stt-v1-mlx",
    "mlx-q8": "omi-health/omi-med-stt-v1-mlx-q8",
}
GGUF_REPO = "omi-health/omi-med-stt-v1-gguf"


class BaseSTT:
    name = "base"
    model_id = ""

    def is_ready(self) -> bool:
        return False

    def transcribe(self, audio_path: str) -> str:  # pragma: no cover - interface
        raise NotImplementedError

    def info(self) -> dict:
        return {"engine": self.name, "model": self.model_id, "ready": self.is_ready()}


class OmiGgufSTT(BaseSTT):
    """omi-med-stt-v1-gguf through parakeet.cpp, model loaded once and reused.

    CAREFLOW_STT_BACKEND selects the parakeet.cpp backend:
      cpu    (default) prebuilt bundle, no toolchain needed
      cuda   NVIDIA GPU  — built from source on first run (needs CMake + CUDA Toolkit + MSVC/GCC)
      vulkan any GPU     — built from source (needs CMake + Vulkan SDK)
    On a 4 GB card shared with Qwen, CPU is usually the better choice (0.8 s / segment).
    """

    model_id = GGUF_REPO

    def __init__(self) -> None:
        self.backend = os.getenv("CAREFLOW_STT_BACKEND", "cpu").lower()
        self.name = f"gguf (omi-med-stt-v1-gguf / parakeet.cpp {self.backend})"
        self._capi = None
        self._lock = threading.Lock()
        self._error: str | None = None
        try:
            from omi_stt import cpp_runtime  # type: ignore

            self._rt = cpp_runtime
        except Exception as exc:  # noqa: BLE001
            self._rt = None
            self._error = f"omi-med-stt is not installed ({exc}). Run: pip install -U omi-med-stt"
            return
        if os.getenv("CAREFLOW_STT_PRELOAD", "1") not in {"0", "false", "no"}:
            try:
                self._load()
            except Exception as exc:  # noqa: BLE001
                self._error = str(exc)

    def _load(self) -> None:
        """Resolve (download if needed) the GGUF + parakeet.cpp bundle and load the model."""
        rt = self._rt
        model_path = rt._download_or_resolve_gguf(GGUF_REPO, rt.DEFAULT_GGUF_FILE, rt.DEFAULT_GGUF_REVISION, True)
        lib = rt._find_parakeet_lib(auto_install=True, backend=self.backend)
        threads = int(os.getenv("CAREFLOW_STT_THREADS", "0")) or rt._default_cpp_threads(self.backend)
        self._capi = rt._ParakeetCAPI(lib, model_path, "tdt", self.backend, threads)
        self._model_path = model_path
        self._error = None

    def is_ready(self) -> bool:
        return self._rt is not None and self._error is None

    def transcribe(self, audio_path: str) -> str:
        if self._rt is None:
            raise RuntimeError(self._error or "omi-med-stt unavailable")
        with self._lock:
            if self._capi is None:
                self._load()
            try:
                import numpy as np
                from omi_stt.audio import linear_resample, read_audio  # type: ignore

                audio, sr = read_audio(audio_path)  # WAV/FLAC via libsndfile, webm/ogg/m4a via bundled ffmpeg
                pcm = np.ascontiguousarray(linear_resample(audio, sr, 16000), dtype=np.float32)
                if pcm.size < 1600:  # < 0.1 s — nothing to transcribe
                    return ""
                # Skip near-silent audio (VAD false positives) — the model would otherwise raise on it.
                rms = float((pcm.astype("float64") ** 2).mean() ** 0.5)
                if rms < 0.003:
                    return ""
                try:
                    return self._rt._render_unknown_tokens(self._capi.transcribe_pcm(pcm)).strip()
                except RuntimeError as exc:
                    # parakeet.cpp reports "empty transcript" for audio with no recognizable speech; that is
                    # simply silence/noise, not a failure.
                    if "empty transcript" in str(exc).lower():
                        return ""
                    raise
            except RuntimeError as exc:
                if "empty transcript" in str(exc).lower():
                    return ""
                # Public API fallback (C API only — the prebuilt bundle ships no CLI executable).
                os.environ.setdefault("OMI_MED_STT_CPP_REQUIRE_CAPI", "1")
                try:
                    texts = self._rt.transcribe_cpp([audio_path], GGUF_REPO, cpp_backend=self.backend)
                    return (texts[0] if texts else "").strip()
                except RuntimeError as inner:
                    if "empty transcript" in str(inner).lower():
                        return ""
                    raise

    def info(self) -> dict:
        d = super().info()
        d.update({"gguf_file": getattr(self._rt, "DEFAULT_GGUF_FILE", None), "backend": self.backend, "error": self._error, "resident": self._capi is not None})
        return d


class OmiMlxSTT(BaseSTT):
    """omi-med-stt-v1-mlx / -mlx-q8 through parakeet-mlx (Apple Silicon only)."""

    def __init__(self, variant: str) -> None:
        self.model_id = MLX_REPOS[variant]
        self.name = f"{variant} ({self.model_id.split('/')[-1]} / parakeet-mlx)"
        self._error: str | None = None
        try:
            from omi_stt import mlx_runtime  # type: ignore

            self._rt = mlx_runtime
            import mlx.core  # type: ignore  # noqa: F401
        except Exception as exc:  # noqa: BLE001
            self._rt = None
            self._error = f"MLX runtime unavailable on this machine ({exc}). Install with: pip install -U 'omi-med-stt[mlx]' (Apple Silicon only)"

    def is_ready(self) -> bool:
        return self._rt is not None

    def transcribe(self, audio_path: str) -> str:
        if self._rt is None:
            raise RuntimeError(self._error)
        texts = self._rt.transcribe_mlx([audio_path], self.model_id)
        return (texts[0] if texts else "").strip()

    def info(self) -> dict:
        d = super().info()
        d["error"] = self._error
        return d


class MockSTT(BaseSTT):
    name = "mock"
    model_id = "none"

    def is_ready(self) -> bool:
        return True

    def transcribe(self, audio_path: str) -> str:
        return os.getenv("CAREFLOW_STT_MOCK_TEXT", "go to patient search")


def _is_apple_silicon() -> bool:
    return sys.platform == "darwin" and platform.machine() in {"arm64", "aarch64"}


def create_stt_engine() -> BaseSTT:
    engine = os.getenv("CAREFLOW_STT_ENGINE", "auto").lower()
    if engine == "auto":
        engine = "mlx-q8" if _is_apple_silicon() else "gguf"
    if engine in MLX_REPOS:
        return OmiMlxSTT(engine)
    if engine == "mock":
        return MockSTT()
    return OmiGgufSTT()
