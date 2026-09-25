"""
Where the AI runs — the top-level switch (Configuration → Where the AI runs).

  local   speech recognition and the language model run on this computer (Omi / Parakeet, local Ollama)
  remote  both run on a remote GPU server (python/kaggle/careflow_gpu_server.py, e.g. a Kaggle T4):
          speech recognition as the `remote` STT engine, the language model through the bridge's
          /ollama proxy — the app keeps talking to the bridge, the bridge forwards.

Saved in python/compute_settings.json (gitignored: it holds the server key). The local speech
settings are remembered while remote, so switching back restores exactly what was running.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import httpx

COMPUTE_FILE = Path(__file__).resolve().parents[1] / "compute_settings.json"


@dataclass
class ComputeSettings:
    mode: str = "local"
    remote_url: str = ""
    remote_key: str = ""
    #: The speech model the remote server runs for us: whisper (best with non-US accents) | omi.
    remote_engine: str = "whisper"
    #: The speech settings that ran on this computer before switching to remote.
    local_stt: dict[str, Any] | None = field(default=None)

    @classmethod
    def load(cls) -> "ComputeSettings":
        try:
            data = json.loads(COMPUTE_FILE.read_text(encoding="utf-8"))
            return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
        except (OSError, ValueError, TypeError):
            return cls()

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
