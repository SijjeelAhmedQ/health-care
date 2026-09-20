/**
 * LLM provider adapters. All of them implement `LLMProvider` so the voice
 * controller never depends on a specific runtime (Ollama, llama.cpp, MLX,
 * python bridge, or the deterministic mock).
 */
import type { AICommand, AIContext, LLMProvider } from '@/types/ai';
import { parseCommands } from '../commandParser';
import { buildSystemPrompt } from '../prompt';
import { interpret } from '../ruleBasedInterpreter';
import type { AIConfig } from '../config';

export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new ModelUnavailableError(`Model request timed out after ${timeoutMs}ms`);
    throw new ModelUnavailableError(`Could not reach model runtime at ${url}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Deterministic interpreter — no model required. */
export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock (rule-based)';
  async generateCommands(transcript: string, context: AIContext) {
    await new Promise((r) => setTimeout(r, 250)); // simulate inference latency for realistic UI states
    const commands = interpret(transcript, context);
    return { commands, raw: JSON.stringify(commands, null, 2) };
  }
  async healthCheck() {
    return true;
  }
}

/** Ollama /api/chat (qwen3.5:4b). */
export class OllamaLLMProvider implements LLMProvider {
  readonly name: string;
  constructor(private readonly baseUrl: string, private readonly model: string, private readonly timeoutMs: number) {
    this.name = `ollama:${model}`;
  }
  async generateCommands(transcript: string, context: AIContext): Promise<{ commands: AICommand[]; raw: string }> {
    const res = await fetchWithTimeout(
      `${this.baseUrl.replace(/\/$/, '')}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: 'json',
          options: { temperature: 0, num_predict: 400 },
          think: false,
          messages: [
            { role: 'system', content: buildSystemPrompt(context) },
            { role: 'user', content: transcript },
          ],
        }),
      },
      this.timeoutMs,
    );
    if (!res.ok) throw new ModelUnavailableError(`Ollama responded ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    const raw = data.message?.content ?? '';
    return { commands: parseCommands(raw), raw };
  }
  async healthCheck() {
    try {
      const res = await fetchWithTimeout(`${this.baseUrl.replace(/\/$/, '')}/api/tags`, { method: 'GET' }, 2500);
      return res.ok;
    } catch {
      return false;
    }
  }
}

/** OpenAI-compatible /v1/chat/completions — llama.cpp server, LM Studio, MLX server, vLLM. */
export class OpenAICompatibleLLMProvider implements LLMProvider {
  readonly name: string;
  constructor(private readonly baseUrl: string, private readonly model: string, private readonly timeoutMs: number) {
    this.name = `openai-compatible:${model}`;
  }
  async generateCommands(transcript: string, context: AIContext) {
    const res = await fetchWithTimeout(
      `${this.baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: 400,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildSystemPrompt(context) + '\nWrap the array as {"commands":[...]}.' },
            { role: 'user', content: transcript },
          ],
        }),
      },
      this.timeoutMs,
    );
    if (!res.ok) throw new ModelUnavailableError(`LLM server responded ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? '';
    return { commands: parseCommands(raw), raw };
  }
  async healthCheck() {
    try {
      const res = await fetchWithTimeout(`${this.baseUrl.replace(/\/$/, '')}/v1/models`, { method: 'GET' }, 2500);
      return res.ok;
    } catch {
      return false;
    }
  }
}

/** Python bridge (python/app.py) — POST { transcript, context } -> { commands, raw }. */
export class HttpBridgeLLMProvider implements LLMProvider {
  readonly name = 'python-bridge';
  constructor(private readonly url: string, private readonly timeoutMs: number) {}
  async generateCommands(transcript: string, context: AIContext) {
    const res = await fetchWithTimeout(
      this.url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript, context, system_prompt: buildSystemPrompt(context) }) },
      this.timeoutMs,
    );
    if (!res.ok) throw new ModelUnavailableError(`Bridge responded ${res.status}`);
    const data = (await res.json()) as { raw?: string; commands?: unknown };
    const raw = data.raw ?? JSON.stringify(data.commands ?? '');
    return { commands: parseCommands(raw), raw };
  }
  async healthCheck() {
    try {
      const res = await fetchWithTimeout(this.url.replace(/\/api\/.*$/, '/api/health'), { method: 'GET' }, 2500);
      return res.ok;
    } catch {
      return false;
    }
  }
}

export function createLLMProvider(config: AIConfig): LLMProvider {
  if (config.mode === 'mock') return new MockLLMProvider();
  switch (config.llm.provider) {
    case 'ollama':
      return new OllamaLLMProvider(config.llm.apiUrl, config.llm.model, config.llm.timeoutMs);
    case 'openai-compatible':
      return new OpenAICompatibleLLMProvider(config.llm.apiUrl, config.llm.model, config.llm.timeoutMs);
    case 'http':
      return new HttpBridgeLLMProvider(config.llm.apiUrl, config.llm.timeoutMs);
    default:
      return new MockLLMProvider();
  }
}
