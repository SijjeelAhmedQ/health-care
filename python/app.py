"""
CareFlow local AI bridge.

A small FastAPI service in front of the two local models:

  WS   /ws/stt     live streaming transcription with Omi Med STT v1
                   client -> binary frames of 16 kHz mono PCM (int16 little-endian)
                             {"type": "config", ...}  tune the stream (see services/streaming.StreamConfig)
                             {"type": "flush"}        finish the current utterance now
                   server -> {"type": "ready"} | speech_start | partial | speech_end | final | error
  POST /api/chat   one Qwen 3.5 4B chat turn with tool calling
                   {"messages": [...], "tools": [...], "options": {...}} -> {"content": str, "tool_calls": [...]}
  GET  /api/llm/models            the models the bridge's LLM runtime has (for the bridge provider)
  GET  /api/config/stt            the selected Omi Med STT settings, every model and backend available here
  PUT  /api/config/stt            select another model / backend / timings (saved to stt_settings.json)
  GET  /api/health runtime status

Run with:

    cd python
    python -m venv .venv && .venv/Scripts/activate      (Windows)  |  source .venv/bin/activate (macOS/Linux)
    pip install -r requirements.txt
    omi-med-stt install-cpp --cpp-backend cpu     (Windows/Linux; downloads parakeet.cpp + the q8_0 GGUF)
    uvicorn app:app --host 127.0.0.1 --port 8765
"""
from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dataclasses import replace

from fastapi import Request, Response

from services.compute import ComputeSettings, probe_remote
from services.netfix import install as install_netfix
from services.diagnostics import RECORDINGS_DIR, Recorder
from services.qwen import QwenChat
from services.stt_catalog import PRECISIONS, REFINERS, SttSettings, backends, catalog, onnx_backends, validate
from services.streaming import StreamConfig, StreamingSession
from services.vad import create_vad
from services.stt_worker import ProcessSTT

app = FastAPI(title="CareFlow Local AI Bridge", version="2.0.0")
# Any local origin (Vite dev 5173, preview 4173, LAN IP, custom port) may call the bridge.
# Extra explicit origins can be added with CAREFLOW_ALLOWED_ORIGINS (comma separated).
LOCAL_ORIGIN = r"^https?://(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$"
EXTRA_ORIGINS = [o for o in os.getenv("CAREFLOW_ALLOWED_ORIGINS", "").split(",") if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=EXTRA_ORIGINS,
    allow_origin_regex=LOCAL_ORIGIN,
    allow_methods=["*"],
    allow_headers=["*"],
)

# The Omi model runs in its own process (see services/stt_worker.py for why).
stt_settings = SttSettings.load()
stt_engine = ProcessSTT(stt_settings.as_dict())
# Load (and on first run download) the VAD now, so the first stream does not wait for it.
_vad, vad_warning = create_vad()
llm = QwenChat()
recorder = Recorder()


def start_refiner(model: str) -> ProcessSTT | None:
    """The second recogniser (Whisper + the app's vocabulary), in its own process like Omi."""
    return ProcessSTT({"engine": "whisper", "model": model, "threads": 4}) if model else None


refiner = start_refiner(stt_settings.refine)


def refine_utterance(pcm: np.ndarray, vocabulary: str | None) -> str:
    current = refiner
    if current is None or not current.is_ready():
        return ""
    return current.transcribe_pcm(pcm, vocabulary)


def record_utterance(audio: np.ndarray, text: str, info: dict) -> None:
    if stt_settings.record:
        recorder.save_utterance(audio, text, info)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "stt": {**stt_engine.info(), "streaming": "/ws/stt", "vad": _vad.name, "vad_warning": vad_warning, "refiner": refiner.info() if refiner else None},
        "llm": {"engine": llm.name, "model": llm.model, "ready": llm.is_ready()},
    }


@app.websocket("/ws/stt")
async def stream_stt(ws: WebSocket) -> None:
    origin = ws.headers.get("origin", "")
    if origin and not (re.match(LOCAL_ORIGIN, origin) or origin in EXTRA_ORIGINS):
        await ws.close(code=1008)
        return
    await ws.accept()
    if not stt_engine.is_ready():
        await ws.send_json({"type": "error", "fatal": True, "message": f"STT engine '{stt_engine.name}' is not available: {stt_engine.info().get('error')}"})
        await ws.close()
        return

    async def emit(event: dict) -> None:
        try:
            await ws.send_json(event)
        except (WebSocketDisconnect, RuntimeError):
            pass  # client already gone

    session = StreamingSession(
        stt_engine.transcribe_pcm,
        emit,
        StreamConfig(endpoint_ms=stt_settings.endpoint_ms, partial_interval_ms=stt_settings.partial_ms),
        on_final=record_utterance,
        refine=refine_utterance,
    )
    await ws.send_json({"type": "ready", "engine": stt_engine.name, "model": stt_engine.model_id, "record": stt_settings.record, "refine": stt_settings.refine})
    try:
        while True:
            message = await ws.receive()
            if message["type"] == "websocket.disconnect":
                break
            if message.get("bytes") is not None:
                pcm = np.frombuffer(message["bytes"], dtype="<i2").astype(np.float32) / 32768.0
                await session.feed(pcm)
            elif message.get("text"):
                control = json.loads(message["text"])
                if control.get("type") == "config":
                    if "vocabulary" in control:
                        # The names the app knows right now — the second recogniser's prompt.
                        session.vocabulary = str(control.get("vocabulary") or "")[:2000] or None
                    session.config.update({k: v for k, v in control.items() if k not in ("type", "vocabulary")})
                elif control.get("type") == "flush":
                    await session.flush()
                    await emit({"type": "flushed"})
    except WebSocketDisconnect:
        pass
    finally:
        await session.close()


class ChatRequest(BaseModel):
    model: str | None = None
    messages: list[dict[str, Any]]
    tools: list[dict[str, Any]] = []
    options: dict[str, Any] = {}


@app.post("/api/chat")
async def chat(req: ChatRequest) -> dict[str, Any]:
    try:
        return await llm.chat(req.messages, req.tools, req.options, req.model)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"LLM runtime '{llm.name}' failed: {exc}") from exc


# ---- configuration ------------------------------------------------------------

#: Settings that need the model reloaded; the others (timings) apply to the next stream.
ENGINE_FIELDS = ("engine", "repo", "gguf_file", "backend", "threads", "precision", "remote_url", "remote_key", "remote_engine")


def stt_config() -> dict[str, Any]:
    return {"settings": stt_settings.as_dict(), "models": catalog(), "backends": backends(), "onnx_backends": onnx_backends(), "precisions": PRECISIONS, "engine": stt_engine.info(), "refiners": REFINERS, "refiner": refiner.info() if refiner else None}


@app.get("/api/config/stt")
async def get_stt_config() -> dict[str, Any]:
    return await run_in_threadpool(stt_config)


class SttSettingsBody(BaseModel):
    engine: str
    repo: str
    gguf_file: str | None = None
    backend: str = "cpu"
    threads: int = 0
    endpoint_ms: int = 900
    partial_ms: int = 500
    precision: str = "int8"
    remote_url: str = ""
    remote_key: str = ""
    remote_engine: str = "whisper"
    record: bool = False
    refine: str = ""


@app.put("/api/config/stt")
async def put_stt_config(body: SttSettingsBody) -> dict[str, Any]:
    return await apply_stt(SttSettings(**body.model_dump()))


async def apply_stt(wanted: SttSettings) -> dict[str, Any]:
    """Validate, load (the running model serves until the new one is ready), save."""
    global stt_settings, refiner
    problem = await run_in_threadpool(validate, wanted)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    # Reload when the model changes — or when the running one failed (e.g. the remote server was down at start).
    if not stt_engine.is_ready() or any(getattr(wanted, f) != getattr(stt_settings, f) for f in ENGINE_FIELDS):
        # Loads (and if needed downloads or builds) the new model; the current one serves until it is ready.
        info = await run_in_threadpool(stt_engine.switch, wanted.as_dict())
        if not info.get("ready"):
            raise HTTPException(status_code=409, detail=f"The model could not be loaded, so the previous one is still in use: {info.get('error')}")
    if wanted.refine != stt_settings.refine:
        old = refiner
        new = await run_in_threadpool(start_refiner, wanted.refine)
        if new is not None and not new.is_ready():
            new.close()
            raise HTTPException(status_code=409, detail=f"The second recogniser could not be loaded: {new.info().get('error')}")
        refiner = new
        if old is not None:
            old.close()
    stt_settings = wanted
    stt_settings.save()
    return await run_in_threadpool(stt_config)


# ---- where the AI runs: this computer, or a remote GPU (Kaggle) for both models --------------

compute = ComputeSettings.load()
# Tunnel hosts resolve to several addresses and from some networks one never answers: connect through
# the one that does (see services/netfix.py).
install_netfix()
REMOTE_TRANSPORT = lambda: httpx.AsyncHTTPTransport(retries=1)  # noqa: E731
LOCAL_OLLAMA = os.getenv("CAREFLOW_LLM_URL", "http://127.0.0.1:11434")
#: Speech settings that belong to this computer (restored when switching back from the remote GPU).
LOCAL_STT_FIELDS = ("engine", "repo", "gguf_file", "backend", "threads", "precision")


async def compute_status() -> dict[str, Any]:
    remote = None
    if compute.mode == "remote":
        try:
            remote = await run_in_threadpool(probe_remote, compute.remote_url, compute.remote_key)
        except RuntimeError as exc:
            remote = {"ok": False, "error": str(exc)}
    return {"mode": compute.mode, "remote_url": compute.remote_url, "remote_engine": compute.remote_engine, "has_key": bool(compute.remote_key), "remote": remote, "stt": stt_engine.info()}


@app.get("/api/config/compute")
async def get_compute() -> dict[str, Any]:
    return await compute_status()


class ComputeBody(BaseModel):
    mode: str
    remote_url: str = ""
    remote_key: str = ""
    remote_engine: str = "whisper"


@app.put("/api/config/compute")
async def put_compute(body: ComputeBody) -> dict[str, Any]:
    """Move both models: speech recognition (STT engine) and the language model (the /ollama proxy)."""
    global compute
    if body.mode not in ("local", "remote"):
        raise HTTPException(status_code=400, detail="mode is local or remote")
    if body.mode == "remote":
        url = body.remote_url.strip().rstrip("/")
        key = body.remote_key or compute.remote_key  # an empty key field keeps the saved one
        if not url.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="Give the remote GPU server's address, e.g. https://your-name.loca.lt")
        if not key:
            raise HTTPException(status_code=400, detail="Give the key the remote GPU server was started with (CAREFLOW_KEY)")
        try:
            health = await run_in_threadpool(probe_remote, url, key)
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=f"{exc}. Nothing was switched.") from exc
        if not (health.get("ollama") or {}).get("ok"):
            raise HTTPException(status_code=409, detail=f"The remote server's language model is not ready: {(health.get('ollama') or {}).get('error', 'no Ollama')}. Nothing was switched.")
        local_stt = compute.local_stt if stt_settings.engine == "remote" else {f: getattr(stt_settings, f) for f in LOCAL_STT_FIELDS}
        engines = health.get("engines") or {}
        if engines and body.remote_engine not in engines:
            raise HTTPException(status_code=409, detail=f"The remote server has no {body.remote_engine} speech model (it loaded {', '.join(engines)}). Nothing was switched.")
        await apply_stt(replace(stt_settings, engine="remote", repo="remote", gguf_file=None, remote_url=url, remote_key=key, remote_engine=body.remote_engine))
        compute = ComputeSettings(mode="remote", remote_url=url, remote_key=key, remote_engine=body.remote_engine, local_stt=local_stt)
    else:
        if stt_settings.engine == "remote":
            back = compute.local_stt or {"engine": "gguf", "repo": "omi-health/omi-med-stt-v1-gguf", "gguf_file": "omi-med-stt-v1-q8_0.gguf", "backend": "cpu"}
            await apply_stt(replace(stt_settings, **back))
        compute = replace(compute, mode="local")
    compute.save()
    return await compute_status()


@app.api_route("/ollama/{path:path}", methods=["GET", "POST", "DELETE"])
async def ollama_proxy(path: str, request: Request) -> Response:
    """
    The app's language model endpoint: Ollama's own API, forwarded to this computer's Ollama or to the
    remote GPU server's — so switching where the AI runs changes no URL in the app.
    """
    if compute.mode == "remote":
        target, headers = f"{compute.remote_url}/ollama/{path}", compute.remote_headers()
    else:
        target, headers = f"{LOCAL_OLLAMA}/{path}", {}
    headers["Content-Type"] = request.headers.get("content-type", "application/json")
    body = await request.body()
    # A free tunnel drops a request now and then (its own 502/503/504 page): try again — a chat request
    # has no side effects. The server's own answers (4xx, JSON) are passed on as they are.
    attempts = 3 if compute.mode == "remote" else 1
    for attempt in range(attempts):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(900.0, connect=15.0), transport=REMOTE_TRANSPORT()) as client:
                res = await client.request(request.method, target, content=body, headers=headers)
        except httpx.HTTPError as exc:
            if attempt + 1 < attempts:
                continue
            raise HTTPException(status_code=502, detail=f"The language model at {'the remote GPU server' if compute.mode == 'remote' else LOCAL_OLLAMA} is not reachable: {exc}") from exc
        tunnel_dropped = res.status_code in (502, 503, 504, 524) and not res.headers.get("content-type", "").startswith("application/json")
        if tunnel_dropped and attempt + 1 < attempts:
            await asyncio.sleep(2)
            continue
        if tunnel_dropped:
            raise HTTPException(status_code=502, detail=f"The tunnel to the remote GPU server dropped the request {attempts} times ({res.status_code}). Check that the Kaggle notebook is still running.")
        return Response(content=res.content, status_code=res.status_code, media_type=res.headers.get("content-type"))
    raise HTTPException(status_code=502, detail="The remote GPU server did not answer")


@app.post("/api/diagnostics/trace")
async def diagnostics_trace(trace: dict[str, Any]) -> dict[str, Any]:
    """What the assistant did with a transcript — kept next to the audio while recording is on."""
    if not stt_settings.record:
        return {"recorded": False}
    await run_in_threadpool(recorder.save_trace, trace)
    return {"recorded": True, "folder": str(RECORDINGS_DIR)}


@app.get("/api/llm/models")
async def llm_models() -> dict[str, Any]:
    try:
        return {"runtime": llm.name, "models": await llm.list_models()}
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"LLM runtime '{llm.name}' is not reachable: {exc}") from exc
