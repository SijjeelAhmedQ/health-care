"""
What Omi Med STT can run on this machine, and which of it is selected.

* `SttSettings` — the chosen model, engine, backend, threads and streaming
  timings. Saved to python/stt_settings.json by the Configuration page (the
  CAREFLOW_STT_* environment variables are only the first-run defaults).
* `catalog()` — every Omi Med STT model the bridge can use: the published
  builds it knows, plus any other `omi-health/omi-med-stt*` model already in
  the Hugging Face cache (download one and it shows up). Each says whether it
  is downloaded and whether it can run here.
* `backends()` — the parakeet.cpp backends (cpu / cuda / vulkan): installed,
  buildable from source on this machine, or not possible, and why.
"""
from __future__ import annotations

import json
import os
import platform
import shutil
import sys
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Any

SETTINGS_FILE = Path(__file__).resolve().parents[1] / "stt_settings.json"
#: ONNX models are downloaded here (a plain folder: the Hugging Face cache needs symlinks on Windows).
MODELS_DIR = Path(__file__).resolve().parents[1] / "models"

#: Published Omi Med STT builds. Anything else under omi-health/omi-med-stt* in the cache is discovered.
KNOWN_MODELS: list[dict[str, Any]] = [
    {"repo": "omi-health/omi-med-stt-v1-gguf", "engine": "gguf", "gguf_file": "omi-med-stt-v1-q8_0.gguf", "label": "Omi Med STT v1 · GGUF q8_0 (CPU / CUDA / Vulkan)", "download_mb": 930},
    {"repo": "omi-health/omi-med-stt-v1-mlx-q8", "engine": "mlx", "label": "Omi Med STT v1 · MLX 8-bit (Apple Silicon)", "download_mb": 700},
    {"repo": "omi-health/omi-med-stt-v1-mlx", "engine": "mlx", "label": "Omi Med STT v1 · MLX full precision (Apple Silicon)", "download_mb": 1300},
    # NVIDIA Parakeet-TDT 0.6B v2 (English, general — Omi Med STT is a medical fine-tune of Parakeet-TDT),
    # as ONNX through onnx-asr: CPU, or the GPU through ONNX Runtime's CUDA provider.
    {"repo": "istupakov/parakeet-tdt-0.6b-v2-onnx", "engine": "onnx", "onnx_model": "nemo-parakeet-tdt-0.6b-v2", "label": "NVIDIA Parakeet-TDT 0.6B v2 · ONNX (CPU / GPU)", "download_mb": {"int8": 630, "fp32": 2360}},
]
BACKENDS = ["cpu", "cuda", "vulkan"]
ONNX_BACKENDS = ["cpu", "cuda"]
#: GPU memory an ONNX Parakeet needs, measured: int8 ~300 MB (its quantized layers still run on the CPU),
#: fp32 ~2.4 GB of weights plus working memory.
ONNX_GPU_NEED_MB = {"int8": 400, "fp32": 2800}
#: int8: ~630 MB, fastest on the CPU. fp32: ~2.4 GB, the one that really runs on a GPU.
PRECISIONS = ["int8", "fp32"]


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def is_apple_silicon() -> bool:
    return sys.platform == "darwin" and platform.machine() in {"arm64", "aarch64"}


@dataclass
class SttSettings:
    engine: str = field(default_factory=lambda: "mlx" if is_apple_silicon() else "gguf")
    repo: str = field(default_factory=lambda: "omi-health/omi-med-stt-v1-mlx-q8" if is_apple_silicon() else "omi-health/omi-med-stt-v1-gguf")
    gguf_file: str | None = field(default_factory=lambda: None if is_apple_silicon() else "omi-med-stt-v1-q8_0.gguf")
    backend: str = field(default_factory=lambda: os.getenv("CAREFLOW_STT_BACKEND", "cpu").lower())
    #: CPU threads for parakeet.cpp (0 = the runtime's default).
    threads: int = field(default_factory=lambda: _env_int("CAREFLOW_STT_THREADS", 0))
    #: Pause that ends an utterance.
    endpoint_ms: int = field(default_factory=lambda: _env_int("CAREFLOW_STT_ENDPOINT_MS", 900))
    #: How often the partial transcript is refreshed while speaking.
    partial_ms: int = field(default_factory=lambda: _env_int("CAREFLOW_STT_PARTIAL_MS", 500))
    #: ONNX models: int8 or fp32 weights.
    precision: str = "int8"
    #: engine "remote": the GPU server that transcribes (e.g. a Kaggle T4 behind localtunnel) and its key.
    remote_url: str = ""
    remote_key: str = ""
    #: Which speech model the remote server runs for us: whisper (best with non-US accents) | omi | parakeet.
    remote_engine: str = "whisper"
    #: Keep every utterance's audio and transcript in python/recordings (see services/diagnostics).
    record: bool = False
    #: A second recogniser that re-hears each finished utterance with the app's names as a vocabulary
    #: ("" = off). Its version goes to the assistant next to Omi's (see streaming.py).
    #: Off by default: on the provider's own recordings it helped as often as it misled the assistant,
    #: and it adds 1–3 s per command (see README, "Second recogniser").
    refine: str = field(default_factory=lambda: os.getenv("CAREFLOW_STT_REFINE", ""))

    @classmethod
    def load(cls) -> "SttSettings":
        base = cls()
        env_engine = os.getenv("CAREFLOW_STT_ENGINE", "").lower()
        if env_engine == "mock":
            base.engine = "mock"
        if SETTINGS_FILE.exists():
            try:
                saved = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
                known = {f.name for f in fields(cls)}
                for k, v in saved.items():
                    if k in known:
                        setattr(base, k, v)
            except (OSError, ValueError):
                pass  # a damaged file falls back to the defaults
        return base

    def save(self) -> None:
        SETTINGS_FILE.write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _cached_repos() -> dict[str, list[str]]:
    """Omi Med STT repos in the Hugging Face cache → the files they hold."""
    try:
        from huggingface_hub import scan_cache_dir

        info = scan_cache_dir()
    except Exception:  # noqa: BLE001 — no cache yet
        return {}
    out: dict[str, list[str]] = {}
    for repo in info.repos:
        if repo.repo_type == "model" and repo.repo_id.startswith("omi-health/omi-med-stt"):
            out[repo.repo_id] = sorted({f.file_name for rev in repo.revisions for f in rev.files})
    return out


def _mlx_runtime_ready() -> tuple[bool, str]:
    if not is_apple_silicon():
        return False, "MLX builds run only on Apple Silicon Macs"
    try:
        import mlx.core  # type: ignore  # noqa: F401
        from omi_stt import mlx_runtime  # type: ignore  # noqa: F401
    except Exception:  # noqa: BLE001
        return False, "Install the MLX runtime: pip install -U 'omi-med-stt[mlx]'"
    return True, ""


def _onnx_runtime_ready() -> tuple[bool, str]:
    try:
        import onnx_asr  # type: ignore  # noqa: F401
        import onnxruntime  # type: ignore  # noqa: F401
    except Exception:  # noqa: BLE001
        return False, "Install the ONNX runtime: pip install -U \"onnx-asr[hub]\" onnxruntime-gpu"
    return True, ""


def gpu_free_mb() -> int | None:
    """Free memory on the NVIDIA GPU (None when it cannot be read)."""
    import subprocess

    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10).stdout
        return int(out.strip().splitlines()[0])
    except Exception:  # noqa: BLE001
        return None


def onnx_model_name(repo: str) -> str | None:
    return next((m.get("onnx_model") for m in KNOWN_MODELS if m["repo"] == repo and m["engine"] == "onnx"), None)


def onnx_backends() -> list[dict[str, Any]]:
    """CPU always; the GPU when ONNX Runtime has its CUDA provider (onnxruntime-gpu with CUDA/cuDNN matching the driver)."""
    try:
        import onnxruntime as ort  # type: ignore

        if hasattr(ort, "preload_dlls"):
            ort.preload_dlls()
        providers = ort.get_available_providers()
    except Exception as exc:  # noqa: BLE001
        return [{"id": b, "installed": False, "available": False, "reason": f"ONNX Runtime is not installed ({exc})"} for b in ONNX_BACKENDS]
    cuda = "CUDAExecutionProvider" in providers
    return [
        {"id": "cpu", "installed": True, "available": True, "reason": ""},
        {"id": "cuda", "installed": cuda, "available": cuda, "reason": "" if cuda else "Needs onnxruntime-gpu with CUDA 12 / cuDNN 9 (see python/requirements.txt)"},
    ]


def catalog() -> list[dict[str, Any]]:
    cached = _cached_repos()
    mlx_ok, mlx_reason = _mlx_runtime_ready()
    models: list[dict[str, Any]] = []
    seen: set[tuple[str, str | None]] = set()

    def add(repo: str, engine: str, gguf_file: str | None, label: str, download_mb: int | None) -> None:
        if (repo, gguf_file) in seen:
            return
        seen.add((repo, gguf_file))
        files = cached.get(repo, [])
        downloaded = (gguf_file in files) if engine == "gguf" else bool(files)
        available, reason = (True, "") if engine == "gguf" else (mlx_ok, mlx_reason)
        models.append(
            {
                "id": f"{repo}::{gguf_file}" if gguf_file else repo,
                "repo": repo,
                "engine": engine,
                "gguf_file": gguf_file,
                "label": label,
                "downloaded": downloaded,
                "download_mb": None if downloaded else download_mb,
                "available": available,
                "reason": reason,
            }
        )

    onnx_ok, onnx_reason = _onnx_runtime_ready()
    models.append(
        {
            "id": "remote",
            "repo": "remote",
            "engine": "remote",
            "gguf_file": None,
            "label": "Remote GPU server — Parakeet-TDT 0.6B v2 fp32 (e.g. Kaggle T4)",
            "downloaded": True,
            "download_mb": None,
            "available": True,
            "reason": "",
        }
    )
    for m in KNOWN_MODELS:
        if m["engine"] == "onnx":
            folder = MODELS_DIR / m["repo"].split("/")[-1]
            have = {p.name for p in folder.glob("*.onnx")} if folder.exists() else set()
            models.append(
                {
                    "id": m["repo"],
                    "repo": m["repo"],
                    "engine": "onnx",
                    "gguf_file": None,
                    "label": m["label"],
                    "downloaded": "encoder-model.int8.onnx" in have or "encoder-model.onnx" in have,
                    "downloaded_precisions": [p for p, f in (("int8", "encoder-model.int8.onnx"), ("fp32", "encoder-model.onnx")) if f in have],
                    "download_mb": m["download_mb"]["int8"],
                    "download_mb_by_precision": m["download_mb"],
                    "available": onnx_ok,
                    "reason": onnx_reason,
                }
            )
            continue
        add(m["repo"], m["engine"], m.get("gguf_file"), m["label"], m.get("download_mb"))
    # Anything else of Omi Med STT already downloaded — e.g. a newer release.
    for repo, files in cached.items():
        ggufs = [f for f in files if f.endswith(".gguf")]
        for g in ggufs:
            add(repo, "gguf", g, f"{repo.split('/')[-1]} · {g}", None)
        if not ggufs and "mlx" in repo:
            add(repo, "mlx", None, f"{repo.split('/')[-1]} (MLX)", None)
    return models


def backends() -> list[dict[str, Any]]:
    try:
        from omi_stt import cpp_runtime as rt  # type: ignore
    except Exception as exc:  # noqa: BLE001
        return [{"id": b, "installed": False, "available": False, "reason": f"omi-med-stt is not installed ({exc})"} for b in BACKENDS]
    cmake = shutil.which("cmake") is not None
    out = []
    for b in BACKENDS:
        installed = any(p.exists() for p in rt._cached_parakeet_lib_candidates(b))
        prebuilt = rt._prebuilt_bundle_asset(b) is not None
        if installed or prebuilt:
            out.append({"id": b, "installed": installed, "available": True, "reason": "" if installed else "Downloaded on first use"})
            continue
        missing = []
        if not cmake:
            missing.append("CMake")
        if b == "cuda" and not (shutil.which("nvcc") or os.getenv("CUDA_PATH")):
            missing.append("the CUDA Toolkit")
        if b == "vulkan" and not os.getenv("VULKAN_SDK"):
            missing.append("the Vulkan SDK")
        if missing:
            out.append({"id": b, "installed": False, "available": False, "reason": f"Building it needs {', '.join(missing)}"})
        else:
            out.append({"id": b, "installed": False, "available": True, "reason": "Built from source on first use (takes several minutes)"})
    return out


#: The second-opinion recognisers the Configuration page offers (measured on the provider's recordings).
REFINERS: list[dict[str, Any]] = [
    {"id": "", "label": "Off — Omi Med STT only", "note": "Fastest; names and drug names are often misheard"},
    {"id": "base.en", "label": "Whisper base.en + the app's vocabulary", "note": "About 1–2 s more per command; most names and drugs right"},
    {"id": "small.en", "label": "Whisper small.en + the app's vocabulary", "note": "About 4–5 s more per command; the most accurate"},
]


def validate(s: SttSettings) -> str | None:
    """Why these settings cannot run here, or None."""
    if s.refine not in {r["id"] for r in REFINERS}:
        return f"Unknown second recogniser {s.refine!r}"
    if not (200 <= s.endpoint_ms <= 5000):
        return "The pause that ends an utterance must be between 200 and 5000 ms"
    if not (200 <= s.partial_ms <= 5000):
        return "The partial transcript interval must be between 200 and 5000 ms"
    if s.threads < 0 or s.threads > 64:
        return "Threads must be between 0 (automatic) and 64"
    if s.engine == "mock":
        return None
    if s.engine == "remote":
        if not s.remote_url.startswith(("http://", "https://")):
            return "Give the remote GPU server's address, e.g. https://your-name.loca.lt"
        if not s.remote_key:
            return "Give the key the remote GPU server was started with (CAREFLOW_KEY)"
        return None
    model = next((m for m in catalog() if m["repo"] == s.repo and m["engine"] == s.engine and (s.engine != "gguf" or m["gguf_file"] == s.gguf_file)), None)
    if model is None:
        return f"Unknown model {s.repo}{f' ({s.gguf_file})' if s.gguf_file else ''}"
    if not model["available"]:
        return model["reason"]
    if s.engine == "onnx":
        if s.precision not in PRECISIONS:
            return f"Unknown precision {s.precision}"
        backend = next((b for b in onnx_backends() if b["id"] == s.backend), None)
        if backend is None:
            return f"Unknown device {s.backend} for an ONNX model (cpu or cuda)"
        if not backend["available"]:
            return backend["reason"]
        if s.backend == "cuda":
            free = gpu_free_mb()
            need = ONNX_GPU_NEED_MB[s.precision]
            if free is not None and free < need:
                return (
                    f"The GPU has {free} MB free and {s.precision} Parakeet needs about {need} MB there. "
                    "On a 4 GB card the language model (Qwen) already fills it; loading this too would push both into shared memory and slow everything down. Use the CPU, or a smaller language model."
                )
    if s.engine == "gguf":
        backend = next((b for b in backends() if b["id"] == s.backend), None)
        if backend is None:
            return f"Unknown backend {s.backend}"
        if not backend["available"]:
            return backend["reason"]
    return None
