"""
Where the AI runs — the top-level switch (Configuration → Where the AI runs).

  local       speech recognition and the language model run on this computer (Omi / Parakeet, local Ollama)
  remote      both run on a remote GPU server (python/kaggle/careflow_gpu_server.py, e.g. a Kaggle T4):
              speech recognition as the `remote` STT engine, the language model through the bridge's
              /ollama proxy — the app keeps talking to the bridge, the bridge forwards.
  openrouter  the language model is a cloud model on OpenRouter (through the bridge's /openrouter proxy,
              which adds the key — the browser never holds it); speech recognition stays on this computer.

Saved in python/compute_settings.json (gitignored: it holds the server key). The local speech
settings are remembered while remote, so switching back restores exactly what was running.
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import httpx

COMPUTE_FILE = Path(__file__).resolve().parents[1] / "compute_settings.json"


@dataclass
class ComputeSettings:
    #: Where the language model runs: local | remote (the Kaggle GPU) | openrouter.
    mode: str = "local"
    #: Where speech recognition runs: local | remote (the Kaggle GPU) — on its own, so Whisper on Kaggle
    #: can serve an OpenRouter model as well as Qwen there.
    speech: str = "local"
    remote_url: str = ""
    remote_key: str = ""
    #: The speech model the remote server runs for us: whisper (best with non-US accents) | omi.
    remote_engine: str = "whisper"
    #: The speech settings that ran on this computer before switching to remote.
    local_stt: dict[str, Any] | None = field(default=None)
    #: OpenRouter: the API key (kept here only — this file is gitignored) and the model chosen.
    openrouter_key: str = ""
    openrouter_model: str = "openai/gpt-6-sol"

    @classmethod
    def load(cls) -> "ComputeSettings":
        try:
            data = json.loads(COMPUTE_FILE.read_text(encoding="utf-8"))
            settings = cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
            if "speech" not in data:  # saved before speech had a place of its own: it went with the model
                settings.speech = "remote" if settings.mode == "remote" else "local"
        except (OSError, ValueError, TypeError):
            settings = cls()
        # The OpenRouter key may also come from the environment (OPENROUTER_API_KEY) instead of this file.
        if not settings.openrouter_key and os.getenv("OPENROUTER_API_KEY"):
            settings.openrouter_key = os.environ["OPENROUTER_API_KEY"].strip()
        return settings

    def save(self) -> None:
        COMPUTE_FILE.write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")

    def remote_headers(self) -> dict[str, str]:
        # localtunnel shows a reminder page instead of forwarding unless this header is set.
        return {"bypass-tunnel-reminder": "true", "X-CareFlow-Key": self.remote_key}


def probe_remote(url: str, key: str) -> dict[str, Any]:
    """The remote server's /health (speech model, GPU, Ollama's models), or an error that says why not."""
    try:
        from .netfix import install

        install()  # connect through the tunnel address that answers (one of Cloudflare's may not, from here)
        with httpx.Client(transport=httpx.HTTPTransport(retries=1), timeout=20) as client:
            res = client.get(f"{url.rstrip('/')}/health", headers={"bypass-tunnel-reminder": "true", "X-CareFlow-Key": key})
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Cannot reach the remote GPU server at {url} ({exc})") from exc
    if res.status_code == 404:
        raise RuntimeError(
            f"{url} is not the CareFlow GPU server (it has no /health) — this address belongs to another program, "
            "e.g. an older test server in the notebook. Use the address careflow_kaggle.ipynb prints"
        )
    if res.status_code != 200:
        try:
            detail = res.json().get("detail")
        except ValueError:
            detail = res.text[:200]
        raise RuntimeError(f"The remote GPU server answered {res.status_code}: {detail}")
    return res.json()


OPENROUTER = "https://openrouter.ai"


def openrouter_headers(key: str) -> dict[str, str]:
    """What every OpenRouter request carries: the key, and who is calling (shown on openrouter.ai)."""
    return {"Authorization": f"Bearer {key}", "HTTP-Referer": "http://localhost/careflow", "X-Title": "CareFlow"}


def probe_openrouter(key: str) -> dict[str, Any]:
    """Whether OpenRouter accepts the key, and its credit — or an error that says why not."""
    try:
        with httpx.Client(timeout=20) as client:
            res = client.get(f"{OPENROUTER}/api/v1/key", headers=openrouter_headers(key))
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Cannot reach OpenRouter ({exc})") from exc
    if res.status_code in (401, 403):
        raise RuntimeError("OpenRouter rejected the key — check it on openrouter.ai/keys")
    if res.status_code != 200:
        raise RuntimeError(f"OpenRouter answered {res.status_code}: {res.text[:200]}")
    data = (res.json() or {}).get("data") or {}
    return {"ok": True, "label": data.get("label"), "usage": data.get("usage"), "limit": data.get("limit"), "limit_remaining": data.get("limit_remaining"), "free_tier": data.get("is_free_tier")}
