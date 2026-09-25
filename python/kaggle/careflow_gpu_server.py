"""
CareFlow's AI on a remote GPU — e.g. a Kaggle notebook's T4 (16 GB): both models in one place.

Configuration → "Where the AI runs" → Kaggle GPU switches the whole assistant here:

  * speech recognition — Whisper large-v3-turbo on the GPU (default: best with non-US accents, takes the
    app's names as a prompt) and Omi Med STT v1; CAREFLOW_STT lists what to load (whisper,omi,parakeet). The bridge on the provider's
    computer keeps the microphone stream, voice detection and live text; it sends each piece of speech here.
        POST /transcribe?engine=whisper&prompt=...   body: 16 kHz mono 16-bit PCM  →  {"text": "...", "ms": 123}
  * the language model — Ollama with qwen3.5:4b on the same GPU, reached through
        /ollama/<Ollama API path>     e.g. POST /ollama/api/chat
  * GET /health  →  the speech model, the GPU, and the models Ollama has

Every request must carry the header `X-CareFlow-Key: <CAREFLOW_KEY>` — a tunnel URL is public.

Kaggle notebook (Settings → Accelerator: GPU T4, Internet: on), one cell each:

    !curl -fsSL https://ollama.com/install.sh | sh
    !nohup ollama serve > ollama.log 2>&1 &
    !sleep 5; ollama pull qwen3.5:4b
    !pip install -q omi-med-stt faster-whisper fastapi uvicorn httpx
    # Omi Med STT on the GPU: builds parakeet.cpp for CUDA (Kaggle has CMake and the CUDA Toolkit; a few minutes)
    !omi-med-stt install-cpp --cpp-backend cuda
    # upload this file to /kaggle/working/careflow_gpu_server.py, then:
    !CAREFLOW_KEY=choose-a-long-secret nohup python /kaggle/working/careflow_gpu_server.py > server.log 2>&1 &
    !sleep 60; tail -5 server.log          # "... ready on cuda" when the speech model is loaded
    !npx --yes localtunnel --port 8000     # prints https://<name>.loca.lt — put it in Configuration

Put the printed address and the same key in CareFlow's Configuration → Where the AI runs → Kaggle GPU.
(For Parakeet v2 instead: pip install "onnx-asr[hub]" onnxruntime-gpu, and start with CAREFLOW_STT=parakeet.)
"""
from __future__ import annotations

import os
import time

import httpx
import numpy as np
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Request, Response

#: The speech models to load, the first is the default: whisper (best with non-US accents) | omi | parakeet.
STT = [e.strip() for e in os.getenv("CAREFLOW_STT", "whisper,omi").lower().split(",") if e.strip()]
KEY = os.getenv("CAREFLOW_KEY", "")
OLLAMA = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
SAMPLE_RATE = 16000


def load_omi():
    """Omi Med STT v1 (GGUF q8_0) through parakeet.cpp — the CUDA build on a GPU, else the prebuilt CPU one."""
    from omi_stt import cpp_runtime as rt  # type: ignore

    model_path = rt._download_or_resolve_gguf(rt.DEFAULT_GGUF_REPO, rt.DEFAULT_GGUF_FILE, rt.DEFAULT_GGUF_REVISION, True)
    for backend in [os.getenv("CAREFLOW_STT_BACKEND", "cuda"), "cpu"]:
        try:
            lib = rt._find_parakeet_lib(auto_install=True, backend=backend)
            capi = rt._ParakeetCAPI(lib, model_path, "tdt", backend, rt._default_cpp_threads(backend))
        except Exception as exc:  # noqa: BLE001 — no CUDA build: fall back to the CPU one, and say so
            print(f"Omi Med STT on {backend} failed: {exc}", flush=True)
            continue

        def recognize(pcm: np.ndarray, prompt: str | None = None) -> str:
            try:
                return rt._render_unknown_tokens(capi.transcribe_pcm(np.ascontiguousarray(pcm, dtype=np.float32))).strip()
            except RuntimeError as exc:
                if "empty transcript" in str(exc).lower():  # silence or noise
                    return ""
                raise

        return f"omi-med-stt-v1 (gguf q8_0)", backend, recognize
    raise RuntimeError("Omi Med STT could not be loaded on the GPU or the CPU")


def load_parakeet():
    """NVIDIA Parakeet-TDT 0.6B v2 through onnx-asr (fp32 by default; CAREFLOW_MODEL_PATH / CAREFLOW_QUANT optional)."""
    import onnxruntime as ort

    try:  # CUDA/cuDNN from pip, when the image has no system-wide ones
        ort.preload_dlls()
    except Exception:  # noqa: BLE001
        pass
    import onnx_asr

    name = os.getenv("CAREFLOW_MODEL", "nemo-parakeet-tdt-0.6b-v2")
    device = "cuda" if "CUDAExecutionProvider" in ort.get_available_providers() else "cpu"
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if device == "cuda" else ["CPUExecutionProvider"]
    model = onnx_asr.load_model(name, os.getenv("CAREFLOW_MODEL_PATH") or None, quantization=os.getenv("CAREFLOW_QUANT") or None, providers=providers)
    return name, device, lambda pcm, prompt=None: str(model.recognize(pcm, sample_rate=SAMPLE_RATE)).strip()


def load_whisper():
    """
    Whisper large-v3-turbo (faster-whisper), fp16 on the GPU. Trained on speech from all over the world,
    it hears non-US accents far better than Omi / Parakeet; the app's names (patients, drugs, diagnoses)
    come with every request as its prompt.
    """
    from faster_whisper import WhisperModel

    size = os.getenv("CAREFLOW_WHISPER", "large-v3-turbo")
    try:
        model, device = WhisperModel(size, device="cuda", compute_type="float16"), "cuda"
        list(model.transcribe(np.zeros(SAMPLE_RATE, dtype=np.float32), language="en")[0])  # the CUDA libraries load only here
    except Exception as exc:  # noqa: BLE001
        print(f"Whisper on cuda failed: {exc}", flush=True)
        model, device = WhisperModel(size, device="cpu", compute_type="int8"), "cpu"

    def recognize(pcm: np.ndarray, prompt: str | None = None) -> str:
        segments, _ = model.transcribe(pcm, language="en", beam_size=5, initial_prompt=prompt or None, condition_on_previous_text=False, vad_filter=False, without_timestamps=True)
        text = " ".join(s.text.strip() for s in segments).strip()
        # On near-silence Whisper can read its prompt back ("Patients: ..."): that is not speech.
        if prompt and len(text) > 20 and text.rstrip(".") in prompt:
            return ""
        return text

    return f"whisper-{size}", device, recognize


LOADERS = {"whisper": load_whisper, "omi": load_omi, "parakeet": load_parakeet}
ENGINES: dict[str, tuple[str, str, object]] = {}
for engine in STT:
    try:
        name, device, fn = LOADERS[engine]()
        fn(np.zeros(SAMPLE_RATE, dtype=np.float32))  # first run builds the GPU kernels now, not mid-sentence
        ENGINES[engine] = (name, device, fn)
        print(f"{name} ready on {device}", flush=True)
    except Exception as exc:  # noqa: BLE001 — the other engines still serve
        print(f"{engine} could not be loaded: {exc}", flush=True)
if not ENGINES:
    raise SystemExit("No speech model could be loaded")
DEFAULT = next(iter(ENGINES))
MODEL, DEVICE, _ = ENGINES[DEFAULT]

app = FastAPI(title="CareFlow GPU speech recognition")


def check_key(key: str) -> None:
    if not KEY:
        raise HTTPException(status_code=503, detail="Set CAREFLOW_KEY on the server: without it anyone with the tunnel URL could use it")
    if key != KEY:
        raise HTTPException(status_code=401, detail="Wrong or missing X-CareFlow-Key")


@app.get("/health")
def health(x_careflow_key: str = Header(default="")) -> dict:
    check_key(x_careflow_key)
    gpu = None
    if DEVICE == "cuda":
        try:
            import subprocess

            gpu = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.used,memory.total", "--format=csv,noheader"], capture_output=True, text=True, timeout=10).stdout.strip()
        except Exception:  # noqa: BLE001
            pass
    try:
        tags = httpx.get(f"{OLLAMA}/api/tags", timeout=5).json()
        ollama = {"ok": True, "models": [m.get("name") for m in tags.get("models", [])]}
    except Exception as exc:  # noqa: BLE001
        ollama = {"ok": False, "error": f"Ollama is not running on this server ({exc})"}
    engines = {e: {"model": m, "device": d} for e, (m, d, _) in ENGINES.items()}
    return {"ok": True, "model": MODEL, "device": DEVICE, "default": DEFAULT, "engines": engines, "gpu": gpu, "ollama": ollama}


@app.api_route("/ollama/{path:path}", methods=["GET", "POST", "DELETE"])
async def ollama_proxy(path: str, request: Request, x_careflow_key: str = Header(default="")) -> Response:
    """The language model: Ollama's own API, unchanged (chat, tags, ps, generate…)."""
    check_key(x_careflow_key)
    async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=10.0)) as client:
        res = await client.request(request.method, f"{OLLAMA}/{path}", content=await request.body(), headers={"Content-Type": request.headers.get("content-type", "application/json")})
    return Response(content=res.content, status_code=res.status_code, media_type=res.headers.get("content-type"))


@app.post("/transcribe")
async def transcribe(request: Request, engine: str = "", prompt: str = "", x_careflow_key: str = Header(default="")) -> dict:
    """16-bit PCM in; `engine` picks the speech model (default: the first loaded), `prompt` is the app's vocabulary."""
    check_key(x_careflow_key)
    if engine and engine not in ENGINES:
        raise HTTPException(status_code=400, detail=f"No {engine} speech model here (loaded: {', '.join(ENGINES)})")
    recognize = ENGINES[engine or DEFAULT][2]
    body = await request.body()
    if len(body) % 2:
        raise HTTPException(status_code=400, detail="Expected 16-bit PCM")
    pcm = np.frombuffer(body, dtype="<i2").astype(np.float32) / 32768.0
    if len(pcm) < SAMPLE_RATE // 10:
        return {"text": "", "ms": 0}
    started = time.perf_counter()
    text = recognize(pcm, prompt or None)
    return {"text": text, "ms": round((time.perf_counter() - started) * 1000)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")), log_level="warning")
