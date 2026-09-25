"""
Qwen 3.5 4B chat with native tool calling.

The frontend owns the conversation, the tool schemas and the tool execution
(services/ai/agent). This module only forwards one chat turn to the local
runtime and returns the assistant message — text and/or tool calls — in
Ollama's shape, whichever runtime answered.

Runtimes (CAREFLOW_LLM_RUNTIME):
  ollama    -> http://127.0.0.1:11434 /api/chat           (default, model qwen3.5:4b)
  llamacpp  -> any OpenAI-compatible server /v1/chat/completions (llama.cpp `llama-server`, LM Studio, `mlx_lm.server`)
"""
from __future__ import annotations

import json
import os
from typing import Any

import httpx


class QwenChat:
    def __init__(self) -> None:
        self.runtime = os.getenv("CAREFLOW_LLM_RUNTIME", "ollama").lower()
        self.base_url = os.getenv("CAREFLOW_LLM_URL", "http://127.0.0.1:11434" if self.runtime == "ollama" else "http://127.0.0.1:8080")
        self.model = os.getenv("CAREFLOW_LLM_MODEL", "qwen3.5:4b")
        self.timeout = float(os.getenv("CAREFLOW_LLM_TIMEOUT", "120"))

    @property
    def name(self) -> str:
        return f"{self.runtime} ({self.base_url})"

    def is_ready(self) -> bool:
        try:
            url = f"{self.base_url}/api/tags" if self.runtime == "ollama" else f"{self.base_url}/v1/models"
            return httpx.get(url, timeout=2.5).status_code == 200
        except Exception:  # noqa: BLE001
            return False

    async def list_models(self) -> list[dict[str, Any]]:
        """The runtime's models, in Ollama's /api/tags shape."""
        async with httpx.AsyncClient(timeout=10) as client:
            if self.runtime == "ollama":
                r = await client.get(f"{self.base_url}/api/tags")
                r.raise_for_status()
                return r.json().get("models", [])
            r = await client.get(f"{self.base_url}/v1/models")
            r.raise_for_status()
            return [{"name": m.get("id"), "model": m.get("id")} for m in r.json().get("data", [])]

    async def chat(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]], options: dict[str, Any], model: str | None = None) -> dict[str, Any]:
        """One assistant turn: {"content": str, "tool_calls": [{"name", "arguments"}]}. `model` overrides the configured one."""
        model = model or self.model
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            if self.runtime == "ollama":
                payload = {"model": model, "messages": messages, "tools": tools, "stream": False, "think": False, "keep_alive": "30m", "options": options}
                r = await client.post(f"{self.base_url}/api/chat", json=payload)
                r.raise_for_status()
                msg = r.json().get("message", {})
                calls = [{"name": c["function"]["name"], "arguments": c["function"].get("arguments") or {}} for c in msg.get("tool_calls") or []]
                return {"content": msg.get("content", ""), "tool_calls": calls}

            payload = {
                "model": model,
                "messages": [_to_openai(m) for m in messages],
                "tools": tools,
                "temperature": options.get("temperature", 0),
                "max_tokens": options.get("num_predict", 512),
            }
            r = await client.post(f"{self.base_url}/v1/chat/completions", json=payload)
            r.raise_for_status()
            msg = r.json()["choices"][0]["message"]
            calls = []
            for c in msg.get("tool_calls") or []:
                args = c["function"].get("arguments") or "{}"
                calls.append({"name": c["function"]["name"], "arguments": json.loads(args) if isinstance(args, str) else args})
            return {"content": msg.get("content") or "", "tool_calls": calls}


def _to_openai(message: dict[str, Any]) -> dict[str, Any]:
    """Ollama-shaped history -> OpenAI-shaped history (tool calls carry string arguments and ids)."""
    if message.get("role") == "assistant" and message.get("tool_calls"):
        return {
            "role": "assistant",
            "content": message.get("content") or "",
            "tool_calls": [
                {"id": f"call_{i}", "type": "function", "function": {"name": c["function"]["name"], "arguments": json.dumps(c["function"].get("arguments") or {})}}
                for i, c in enumerate(message["tool_calls"])
            ],
        }
    if message.get("role") == "tool":
        return {"role": "tool", "content": message.get("content", ""), "tool_call_id": message.get("tool_call_id", "call_0")}
    return {"role": message["role"], "content": message.get("content", "")}
