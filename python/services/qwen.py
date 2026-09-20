"""
Qwen 3.5 4B command generator.

Runtimes (CAREFLOW_LLM_RUNTIME):
  ollama    -> http://127.0.0.1:11434 /api/chat with model qwen3.5:4b (default)
  llamacpp  -> any OpenAI-compatible server (llama.cpp `llama-server`, LM Studio, MLX `mlx_lm.server`)

The system prompt is built by the frontend (services/ai/prompt.ts) so the page/form
registry stays the single source of truth. This module only handles transport and
JSON-mode inference; the frontend validates the result against its Zod schema.
"""
from __future__ import annotations

import json
import os
from typing import Any

import httpx


class QwenCommandGenerator:
    def __init__(self) -> None:
        self.runtime = os.getenv("CAREFLOW_LLM_RUNTIME", "ollama").lower()
        self.base_url = os.getenv("CAREFLOW_LLM_URL", "http://127.0.0.1:11434" if self.runtime == "ollama" else "http://127.0.0.1:8080")
        self.model = os.getenv("CAREFLOW_LLM_MODEL", "qwen3.5:4b")
        self.timeout = float(os.getenv("CAREFLOW_LLM_TIMEOUT", "30"))

    @property
    def name(self) -> str:
        return f"{self.runtime} ({self.base_url})"

    def is_ready(self) -> bool:
        try:
            url = f"{self.base_url}/api/tags" if self.runtime == "ollama" else f"{self.base_url}/v1/models"
            return httpx.get(url, timeout=2.5).status_code == 200
        except Exception:  # noqa: BLE001
            return False

    def generate(self, transcript: str, system_prompt: str, context: dict[str, Any]) -> str:
        messages = [
            {"role": "system", "content": system_prompt or "Return a JSON array of commands."},
            {"role": "user", "content": transcript},
        ]
        if self.runtime == "ollama":
            payload = {
                "model": self.model,
                "messages": messages,
                "stream": False,
                "format": "json",
                "think": False,
                "options": {"temperature": 0, "num_predict": 400},
            }
            r = httpx.post(f"{self.base_url}/api/chat", json=payload, timeout=self.timeout)
            r.raise_for_status()
            return r.json().get("message", {}).get("content", "")

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0,
            "max_tokens": 400,
            "response_format": {"type": "json_object"},
        }
        r = httpx.post(f"{self.base_url}/v1/chat/completions", json=payload, timeout=self.timeout)
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        # llama.cpp json_object mode returns an object; unwrap {"commands": [...]} if present
        try:
            data = json.loads(content)
            if isinstance(data, dict) and "commands" in data:
                return json.dumps(data["commands"])
        except json.JSONDecodeError:
            pass
        return content
