"""
Speech-to-text engines for **Omi Med STT v1** (0.6B, Parakeet-TDT based).

Runtime package: `omi-med-stt` (https://github.com/Omi-Health/omi-med-stt-runtime).
Engines (the Configuration page chooses one; see services/stt_catalog.py):

  gguf     a GGUF build of Omi Med STT (default omi-health/omi-med-stt-v1-gguf, q8_0)
           through patched parakeet.cpp — backend cpu (prebuilt), cuda or vulkan (built from source)
  mlx      an MLX build (omi-health/omi-med-stt-v1-mlx or -mlx-q8) through parakeet-mlx (Apple Silicon)
  onnx     an ONNX speech model through onnx-asr — NVIDIA Parakeet-TDT 0.6B v2 — int8 or fp32, on the
           CPU or the GPU (ONNX Runtime's CUDA provider; no CUDA Toolkit needed)
  remote   a GPU server elsewhere (python/kaggle/careflow_gpu_server.py, e.g. on a Kaggle T4) — the
           bridge keeps streaming and voice detection, the server only transcribes
  whisper  faster-whisper (base.en / small.en, CPU int8) — not the main recogniser: it re-hears each
           finished utterance with a vocabulary prompt of the app's names (see streaming.py `refine`)
  mock     fixed transcript for wiring tests

Every engine takes 16 kHz mono float32 PCM (`transcribe_pcm`) — the live
streaming session (services/streaming.py) feeds it straight from the
microphone. The GGUF engine keeps the parakeet.cpp model resident in memory
(C API) so a few seconds of speech decode in well under a second.
"""
from __future__ import annotations

import os
import tempfile
import threading
import time
import wave

import numpy as np

MLX_REPOS = {
    "mlx": "omi-health/omi-med-stt-v1-mlx",
    "mlx-q8": "omi-health/omi-med-stt-v1-mlx-q8",
}
GGUF_REPO = "omi-health/omi-med-stt-v1-gguf"
SAMPLE_RATE = 16000


class BaseSTT:
    name = "base"
    model_id = ""

    def is_ready(self) -> bool:
        return False

    def transcribe_pcm(self, pcm: np.ndarray, prompt: str | None = None) -> str:  # pragma: no cover - interface
        """Transcribe 16 kHz mono float32 PCM in [-1, 1]. Returns "" for silence. `prompt`: words to expect
        (names, drugs) — used by engines that support it, ignored by the rest."""
        raise NotImplementedError

    def info(self) -> dict:
        return {"engine": self.name, "model": self.model_id, "ready": self.is_ready()}


def _is_empty_transcript_error(exc: Exception) -> bool:
    # parakeet.cpp reports "empty transcript" for audio with no recognizable speech; that is
    # silence or noise, not a failure.
    return "empty transcript" in str(exc).lower()


class OmiGgufSTT(BaseSTT):
    """A GGUF build of Omi Med STT through parakeet.cpp, model loaded once and reused.

    backend selects the parakeet.cpp build:
      cpu    (default) prebuilt bundle, no toolchain needed
      cuda   NVIDIA GPU  — built from source on first use (needs CMake + CUDA Toolkit + MSVC/GCC)
      vulkan any GPU     — built from source (needs CMake + Vulkan SDK)
    On a 4 GB card shared with Qwen, CPU is the better choice.
    """

    def __init__(self, repo: str = GGUF_REPO, gguf_file: str | None = None, backend: str = "cpu", threads: int = 0) -> None:
        self.model_id = repo
        self.backend = backend
        self.threads = threads
        self._gguf_file = gguf_file
        self.name = f"gguf ({repo.split('/')[-1]} / parakeet.cpp {backend})"
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
        default = self.model_id == rt.DEFAULT_GGUF_REPO
        gguf_file = self._gguf_file or rt.DEFAULT_GGUF_FILE
        # The default model is pinned to the revision the runtime was verified with; others track main.
        revision = rt.DEFAULT_GGUF_REVISION if default and gguf_file == rt.DEFAULT_GGUF_FILE else None
        model_path = rt._download_or_resolve_gguf(self.model_id, gguf_file, revision, True)
        lib = rt._find_parakeet_lib(auto_install=True, backend=self.backend)
        threads = self.threads or rt._default_cpp_threads(self.backend)
        self._capi = rt._ParakeetCAPI(lib, model_path, "tdt", self.backend, threads)
        self._error = None

    def is_ready(self) -> bool:
        return self._rt is not None and self._error is None

    def transcribe_pcm(self, pcm: np.ndarray, prompt: str | None = None) -> str:
        if self._rt is None:
            raise RuntimeError(self._error or "omi-med-stt unavailable")
        with self._lock:
            if self._capi is None:
                self._load()
            try:
                text = self._capi.transcribe_pcm(np.ascontiguousarray(pcm, dtype=np.float32))
            except RuntimeError as exc:
                if _is_empty_transcript_error(exc):
                    return ""
                raise
            return self._rt._render_unknown_tokens(text).strip()

    def info(self) -> dict:
        d = super().info()
        d.update({"gguf_file": self._gguf_file or getattr(self._rt, "DEFAULT_GGUF_FILE", None), "backend": self.backend, "threads": self.threads, "error": self._error, "resident": self._capi is not None})
        return d


class OmiMlxSTT(BaseSTT):
    """An MLX build of Omi Med STT through parakeet-mlx (Apple Silicon only)."""

    def __init__(self, repo: str) -> None:
        self.model_id = repo
        self.name = f"mlx ({repo.split('/')[-1]} / parakeet-mlx)"
        self._error: str | None = None
        self._lock = threading.Lock()
        try:
            from omi_stt import mlx_runtime  # type: ignore

            self._rt = mlx_runtime
            import mlx.core  # type: ignore  # noqa: F401
        except Exception as exc:  # noqa: BLE001
            self._rt = None
            self._error = f"MLX runtime unavailable on this machine ({exc}). Install with: pip install -U 'omi-med-stt[mlx]' (Apple Silicon only)"

    def is_ready(self) -> bool:
        return self._rt is not None

    def transcribe_pcm(self, pcm: np.ndarray, prompt: str | None = None) -> str:
        if self._rt is None:
            raise RuntimeError(self._error)
        # The MLX runtime reads audio files, so the segment is handed over as a 16-bit WAV.
        fd, path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        try:
            with wave.open(path, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(SAMPLE_RATE)
                w.writeframes((np.clip(pcm, -1.0, 1.0) * 32767).astype("<i2").tobytes())
            with self._lock:
                texts = self._rt.transcribe_mlx([path], self.model_id)
            return (texts[0] if texts else "").strip()
        finally:
            try:
                os.remove(path)
            except OSError:
                pass

    def info(self) -> dict:
        d = super().info()
        d["error"] = self._error
        return d


class MockSTT(BaseSTT):
    """Returns CAREFLOW_STT_MOCK_TEXT for any audio — for wiring tests without the model."""

    name = "mock"
    model_id = "none"

    def is_ready(self) -> bool:
        return True

    def transcribe_pcm(self, pcm: np.ndarray, prompt: str | None = None) -> str:
        return os.getenv("CAREFLOW_STT_MOCK_TEXT", "open the dashboard")


class OnnxAsrSTT(BaseSTT):
    """
    An ONNX speech model through onnx-asr (NVIDIA Parakeet-TDT 0.6B v2). Downloaded into python/models
    (a plain folder — the Hugging Face cache needs symlink rights on Windows). On the GPU, ONNX Runtime's
    CUDA provider runs it; the CUDA/cuDNN libraries come from pip and must match the driver's CUDA version.
    Measured on the provider's recordings: as accurate as Omi Med STT, ~40% faster on the CPU (int8).
    """

    def __init__(self, repo: str, model: str, precision: str = "int8", backend: str = "cpu") -> None:
        import onnxruntime as ort
        from huggingface_hub import snapshot_download

        from .stt_catalog import MODELS_DIR

        if hasattr(ort, "preload_dlls"):
            ort.preload_dlls()  # the CUDA/cuDNN libraries installed with pip
        ort.set_default_logger_severity(3)  # errors only: the CUDA provider warns about every CPU↔GPU copy
        import onnx_asr

        folder = MODELS_DIR / repo.split("/")[-1]
        weights = ["*.int8.onnx"] if precision == "int8" else ["encoder-model.onnx", "encoder-model.onnx.data", "decoder_joint-model.onnx"]
        snapshot_download(repo, local_dir=str(folder), allow_patterns=["config.json", "vocab.txt", "nemo128.onnx", *weights])
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if backend == "cuda" else ["CPUExecutionProvider"]
        self._model = onnx_asr.load_model(model, str(folder), quantization="int8" if precision == "int8" else None, providers=providers)
        self._lock = threading.Lock()
        self.model_id = repo
        self.backend = backend
        self.precision = precision
        self.name = f"onnx ({repo.split('/')[-1]} / {precision} / {backend})"
        # Decode once now: the first run builds the GPU kernels, and a device problem shows here, not mid-sentence.
        self._model.recognize(np.zeros(SAMPLE_RATE, dtype=np.float32), sample_rate=SAMPLE_RATE)

    def is_ready(self) -> bool:
        return True

    def transcribe_pcm(self, pcm: np.ndarray, prompt: str | None = None) -> str:
        with self._lock:
            return str(self._model.recognize(np.ascontiguousarray(pcm, dtype=np.float32), sample_rate=SAMPLE_RATE)).strip()

    def info(self) -> dict:
        return {**super().info(), "backend": self.backend, "precision": self.precision}


class RemoteSTT(BaseSTT):
    """
    Transcription on a remote GPU server (python/kaggle/careflow_gpu_server.py). The microphone stream,
    voice detection and partial/final logic stay here; each piece of speech is POSTed as 16-bit PCM.
    """

    def __init__(self, url: str, key: str = "", engine: str = "") -> None:
        import httpx

        self._url = url.rstrip("/")
        #: Which of the server's speech models to use ("" = its default): whisper | omi | parakeet.
        self._engine = engine
        # localtunnel shows a reminder page instead of forwarding unless this header is set.
        headers = {"bypass-tunnel-reminder": "true", "X-CareFlow-Key": key}
        from .netfix import install

        install()  # connect through the tunnel address that answers (one of Cloudflare's may not, from here)
        self._client = httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0), headers=headers, transport=httpx.HTTPTransport(retries=1))
        started = time.perf_counter()
        try:
            res = self._client.get(f"{self._url}/health")
        except httpx.HTTPError as exc:
            raise RuntimeError(f"cannot reach the remote GPU server at {self._url} ({exc})") from exc
        if res.status_code != 200:
            detail = res.json().get("detail") if res.headers.get("content-type", "").startswith("application/json") else res.text[:200]
            raise RuntimeError(f"the remote GPU server answered {res.status_code}: {detail}")
        info = res.json()
        self.latency_ms = round((time.perf_counter() - started) * 1000)
        engines = info.get("engines") or {}
        if engine and engines and engine not in engines:
            raise RuntimeError(f"the remote GPU server has no {engine} speech model (it has {', '.join(engines)})")
        chosen = engines.get(engine) or {}
        self.model_id = str(chosen.get("model") or info.get("model", "remote"))
        self.device = str(chosen.get("device") or info.get("device", "?"))
        self.gpu = info.get("gpu")
        self.name = f"remote ({self.model_id} on {self.device}{f' — {self.gpu}' if self.gpu else ''})"

    def is_ready(self) -> bool:
        return True

    def transcribe_pcm(self, pcm: np.ndarray, prompt: str | None = None) -> str:
        body = (np.clip(pcm, -1.0, 1.0) * 32767).astype("<i2").tobytes()
        params = {k: v for k, v in (("engine", self._engine), ("prompt", prompt or "")) if v}
        for attempt in range(2):
            res = self._client.post(f"{self._url}/transcribe", params=params, content=body, headers={"Content-Type": "application/octet-stream"})
            # A free tunnel drops a request now and then (its own HTML 502/503/504): send it once more.
            if res.status_code in (502, 503, 504, 524) and not res.headers.get("content-type", "").startswith("application/json") and attempt == 0:
                continue
            break
        res.raise_for_status()
        return str(res.json().get("text", "")).strip()

    def info(self) -> dict:
        return {**super().info(), "backend": self.device, "gpu": self.gpu, "url": self._url, "latency_ms": self.latency_ms}


class WhisperSTT(BaseSTT):
    """
    faster-whisper on the CPU. Whisper takes a text prompt — the names and drugs the app knows — and
    then hears them far more reliably than Omi does (measured on the provider's own recordings:
    21/24 names and drug names right with small.en + vocabulary, against 9/24).
    """

    MODELS = {"base.en", "small.en"}

    def __init__(self, model: str, threads: int = 4) -> None:
        from faster_whisper import WhisperModel

        if model not in self.MODELS:
            raise ValueError(f"unknown Whisper model {model}")
        self.model_id = model
        self.name = f"whisper ({model}, cpu int8)"
        self._model = WhisperModel(model, device="cpu", compute_type="int8", cpu_threads=threads)
        self._lock = threading.Lock()

    def is_ready(self) -> bool:
        return True

    def transcribe_pcm(self, pcm: np.ndarray, prompt: str | None = None) -> str:
        with self._lock:
            segments, _ = self._model.transcribe(
                np.ascontiguousarray(pcm, dtype=np.float32),
                beam_size=5,
                initial_prompt=prompt or None,
                condition_on_previous_text=False,
                vad_filter=False,
            )
            return " ".join(s.text.strip() for s in segments).strip()


def create_stt_engine(settings: dict | None = None) -> BaseSTT:
    """Build the engine described by `settings` (see services/stt_catalog.SttSettings)."""
    s = settings or {}
    engine = str(s.get("engine") or "gguf").lower()
    if engine == "mock":
        return MockSTT()
    if engine == "remote":
        return RemoteSTT(str(s.get("remote_url") or ""), str(s.get("remote_key") or ""), str(s.get("remote_engine") or ""))
    if engine == "onnx":
        from .stt_catalog import onnx_model_name

        repo = str(s.get("repo") or "")
        model = onnx_model_name(repo)
        if not model:
            raise ValueError(f"unknown ONNX speech model {repo}")
        return OnnxAsrSTT(repo, model, precision=str(s.get("precision") or "int8"), backend=str(s.get("backend") or "cpu").lower())
    if engine == "whisper":
        return WhisperSTT(str(s.get("model") or "base.en"), threads=int(s.get("threads") or 4))
    if engine == "mlx":
        return OmiMlxSTT(str(s.get("repo") or MLX_REPOS["mlx-q8"]))
    return OmiGgufSTT(
        repo=str(s.get("repo") or GGUF_REPO),
        gguf_file=s.get("gguf_file") or None,
        backend=str(s.get("backend") or "cpu").lower(),
        threads=int(s.get("threads") or 0),
    )
