"""
CareFlow local AI bridge.

A minimal FastAPI service that exposes the two local models the frontend needs:

  POST /api/stt   multipart audio  -> {"text": "..."}          (omi-health/omi-med-stt-v1)
  POST /api/llm   {"transcript","context","system_prompt"} -> {"raw": "...", "commands": [...]}   (qwen3.5:4b)
  GET  /api/health                                            -> runtime status

The frontend talks to it when VITE_STT_PROVIDER=http and/or VITE_LLM_PROVIDER=http.
Each model runtime is an adapter in services/ so you can swap MLX <-> GGUF <-> Ollama
without touching the API surface. Run with:

    cd python
    python -m venv .venv && .venv/Scripts/activate      (Windows)  |  source .venv/bin/activate (macOS/Linux)
    pip install -r requirements.txt
    uvicorn app:app --host 127.0.0.1 --port 8765 --reload
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CAREFLOW_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
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
        "stt": {"engine": stt_engine.name, "ready": stt_engine.is_ready()},
        "llm": {"engine": llm.name, "model": llm.model, "ready": llm.is_ready()},
    }


@app.post("/api/stt")
async def transcribe(audio: UploadFile = File(...)) -> dict[str, str]:
    if not stt_engine.is_ready():
        raise HTTPException(status_code=503, detail=f"STT engine '{stt_engine.name}' is not available. See python/services/stt.py")
    suffix = os.path.splitext(audio.filename or "speech.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio.read())
        path = tmp.name
    try:
        text = stt_engine.transcribe(path)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    return {"text": text}


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
