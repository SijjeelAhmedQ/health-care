"""
Omi Med STT in its own process.

parakeet.cpp aborts the whole process when it cannot allocate its compute
buffer (`GGML_ASSERT(ctx->mem_buffer != NULL)`) — which happens whenever the
machine's commit limit is reached, e.g. with Qwen loaded in Ollama on a
machine without a page file. Running the engine in a worker process means
such an abort costs one utterance, not the bridge: the worker is restarted on
the next request and the WebSocket sessions stay up. Decoding also runs off
the event loop, so audio keeps streaming in while a segment is decoded.
"""
from __future__ import annotations

import multiprocessing as mp
import threading
from multiprocessing.connection import Connection

import numpy as np

from .stt import BaseSTT


def _serve(conn: Connection, settings: dict) -> None:
    """Worker process main: load the engine, then decode requests until the pipe closes."""
    from .stt import create_stt_engine

    try:
        engine = create_stt_engine(settings)
    except Exception as exc:  # noqa: BLE001 — reported to the bridge, which keeps the previous engine
        conn.send(("failed", str(exc)))
        return
    conn.send(("info", engine.info()))
    while True:
        try:
            request = conn.recv()
        except EOFError:
            return
        if request is None:  # shut down
            return
        audio, prompt = request
        pcm = np.frombuffer(audio, dtype=np.float32)
        try:
            conn.send(("ok", engine.transcribe_pcm(pcm, prompt) if prompt else engine.transcribe_pcm(pcm)))
        except Exception as exc:  # noqa: BLE001 — reported to the caller, the worker keeps serving
            conn.send(("error", str(exc)))


class ProcessSTT(BaseSTT):
    """Proxy to an STT engine running in a worker process. Restarts the worker if it dies."""

    def __init__(self, settings: dict) -> None:
        self._lock = threading.Lock()
        self._info: dict = {"engine": "starting", "model": "", "ready": False}
        self.settings = dict(settings)
        self._proc, self._conn, self._info = self._spawn(self.settings)
        self.name = self._info.get("engine", "omi-med-stt")
        self.model_id = self._info.get("model", "")

    @staticmethod
    def _spawn(settings: dict):
        ctx = mp.get_context("spawn")
        conn, child = ctx.Pipe()
        proc = ctx.Process(target=_serve, args=(child, settings), name="omi-stt-worker", daemon=True)
        proc.start()
        child.close()
        try:
            kind, info = conn.recv()  # blocks until the model is loaded
        except EOFError:
            kind, info = "failed", "the STT worker exited while loading the model (out of memory?)"
        if kind != "info":
            info = {"engine": "failed", "model": settings.get("repo", ""), "ready": False, "error": str(info)}
        return proc, conn, info

    def _start(self) -> None:
        self._proc, self._conn, self._info = self._spawn(self.settings)
        self.name = self._info.get("engine", "omi-med-stt")
        self.model_id = self._info.get("model", "")

    def switch(self, settings: dict) -> dict:
        """Load another engine / model / backend. The running one keeps serving until the new one is ready;
        if the new one fails to load, the old one stays and the error is returned."""
        proc, conn, info = self._spawn(settings)
        if not info.get("ready"):
            if proc.is_alive():
                proc.terminate()
            return info
        with self._lock:
            old_proc, old_conn = self._proc, self._conn
            self._proc, self._conn, self._info, self.settings = proc, conn, info, dict(settings)
            self.name = info.get("engine", "omi-med-stt")
            self.model_id = info.get("model", "")
        try:
            old_conn.send(None)
        except (BrokenPipeError, OSError):
            pass
        old_proc.join(timeout=3)
        if old_proc.is_alive():
            old_proc.terminate()
        return info

    def is_ready(self) -> bool:
        return bool(self._info.get("ready")) and self._proc.is_alive()

    def transcribe_pcm(self, pcm: np.ndarray, prompt: str | None = None) -> str:
        with self._lock:
            if not self._proc.is_alive():
                self._start()
            try:
                self._conn.send((np.ascontiguousarray(pcm, dtype=np.float32).tobytes(), prompt))
                kind, value = self._conn.recv()
            except (EOFError, BrokenPipeError, ConnectionResetError) as exc:
                # The native runtime died mid-decode: bring a fresh worker up for the next request.
                self._start()
                raise RuntimeError(f"the STT worker stopped ({exc}); it has been restarted") from exc
        if kind == "error":
            raise RuntimeError(value)
        return value

    def info(self) -> dict:
        return {**self._info, "ready": self.is_ready(), "process": self._proc.pid}

    def close(self) -> None:
        try:
            self._conn.send(None)
        except (BrokenPipeError, OSError):
            pass
        self._proc.join(timeout=2)
