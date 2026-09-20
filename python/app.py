"""
CareFlow local AI bridge.

A minimal FastAPI service that exposes the two local models the frontend needs:

  POST /api/stt   multipart audio  -> {"text": "...", "model": "omi-health/omi-med-stt-v1-gguf"}
  POST /api/llm   {"transcript","context","system_prompt"} -> {"raw": "...", "commands": [...]}   (qwen3.5:4b)
  GET  /api/health                                            -> runtime status

The frontend talks to it when VITE_STT_PROVIDER=http and/or VITE_LLM_PROVIDER=http.
Each model runtime is an adapter in services/ so you can swap MLX <-> GGUF <-> Ollama
without touching the API surface. Run with:

    cd python
    python -m venv .venv && .venv/Scripts/activate      (Windows)  |  source .venv/bin/activate (macOS/Linux)
    pip install -r requirements.txt
    omi-med-stt install-cpp --cpp-backend cpu     (Windows/Linux; downloads parakeet.cpp + the q8_0 GGUF)
    uvicorn app:app --host 127.0.0.1 --port 8765
"""
from __future__ import annotations

import json
import os
import tempfile
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.qwen import QwenCommandGenerator
from services.stt import create_stt_engine

app = FastAPI(title="CareFlow Local AI Bridge", version="1.0.0")
# Any local origin (Vite dev 5173, preview 4173, LAN IP, custom port) may call the bridge.
# Extra explicit origins can be added with CAREFLOW_ALLOWED_ORIGINS (comma separated).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.getenv("CAREFLOW_ALLOWED_ORIGINS", "").split(",") if o],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)

stt_engine = create_stt_engine()
llm = QwenCommandGenerator()


class LLMRequest(BaseModel):
    transcript: str
    context: dict[str, Any] | None = None
    system_prompt: str | None = None


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "stt": stt_engine.info(),
        "llm": {"engine": llm.name, "model": llm.model, "ready": llm.is_ready()},
    }


@app.post("/api/stt")
async def transcribe(audio: UploadFile = File(...)) -> dict[str, Any]:
    if not stt_engine.is_ready():
        raise HTTPException(status_code=503, detail=f"STT engine '{stt_engine.name}' is not available: {stt_engine.info().get('error')}")
    suffix = os.path.splitext(audio.filename or "speech.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio.read())
        path = tmp.name
    try:
        text = stt_engine.transcribe(path)
    except Exception as exc:  # noqa: BLE001 — never 500 on a bad segment; the mic must keep working
        return {"text": "", "model": stt_engine.model_id, "engine": stt_engine.name, "error": str(exc)[:300]}
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    return {"text": text, "model": stt_engine.model_id, "engine": stt_engine.name}


@app.post("/api/llm")
def generate(req: LLMRequest) -> dict[str, Any]:
    if not llm.is_ready():
        raise HTTPException(status_code=503, detail=f"LLM runtime '{llm.name}' is not reachable")
    raw = llm.generate(req.transcript, req.system_prompt or "", req.context or {})
    commands: Any = None
    try:
        commands = json.loads(raw)
    except json.JSONDecodeError:
        commands = None  # the frontend parser tolerates prose/fences and validates the schema
    return {"raw": raw, "commands": commands}
