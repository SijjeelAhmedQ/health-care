/**
 * LLM provider adapters. All of them implement `LLMProvider` so the voice
 * controller never depends on a specific runtime (Ollama, llama.cpp, MLX,
 * python bridge, or the deterministic mock).
 */
import type { AICommand, AIContext, LLMProvider } from '@/types/ai';
import { parseCommands } from '../commandParser';
import { buildSystemPrompt, buildUserMessage } from '../prompt';
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
  /** No model here — the caller falls back to its deterministic path. */
  async complete(): Promise<string> {
    throw new ModelUnavailableError('No language model is configured (mock mode)');
  }
  async healthCheck() {
    return true;
  }
}

/** Ollama /api/chat (qwen3.5:4b). */
export class OllamaLLMProvider implements LLMProvider {
  readonly name: string;
  /** Keep the model resident between utterances so only the first call pays the load cost. */
  static readonly KEEP_ALIVE = '30m';
  /** Re-ping well inside KEEP_ALIVE so the model is never unloaded while the app is open. */
  static readonly KEEP_ALIVE_PING_MS = 20 * 60 * 1000;
  /**
   * llama.cpp checkpoints the recurrent state of hybrid models (Qwen 3.5) at END and END-508 of each
   * prompt. A warm-up whose user turn is ~490 one-token words therefore leaves a checkpoint a few
   * tokens *before* the user turn, i.e. right at the end of the (static) system prompt. Every real
   * command then resumes from there and only processes its own ~60 tokens instead of ~508 (~0.5 s
   * instead of ~7 s at the ~75 tok/s a GTX 1650 manages for this architecture). Slightly under 508
   * on purpose: a checkpoint past the shared prefix is useless, one a few tokens early costs ~50 ms.
   */
  static readonly WARM_UP_PAD_TOKENS = 490;
  private keepAliveTimer?: ReturnType<typeof setInterval>;
  constructor(private readonly baseUrl: string, private readonly model: string, private readonly timeoutMs: number, private readonly numGpu = 99, private readonly numCtx = 4096) {
    this.name = `ollama:${model}`;
    void this.warmUp();
    if (typeof window !== 'undefined') this.keepAliveTimer = setInterval(() => void this.ping(), OllamaLLMProvider.KEEP_ALIVE_PING_MS);
  }
  dispose() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
  }
  /**
   * Fire-and-forget at app start: load the model, run the static system prompt through it once
   * (the slow part, off the user's first command) and park the prefix checkpoint — see WARM_UP_PAD_TOKENS.
   */
  warmUp() {
    return this.primeCache(Array(OllamaLLMProvider.WARM_UP_PAD_TOKENS).fill('x').join(' '), 90000);
  }
  /** Cheap periodic keep-alive: resumes from the parked checkpoint, so it costs a few tokens, not a re-read. */
  ping() {
    return this.primeCache('ping', 30000);
  }
  private async primeCache(userContent: string, timeoutMs: number) {
    try {
      await fetchWithTimeout(
        `${this.baseUrl.replace(/\/$/, '')}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            stream: false,
            format: 'json',
            keep_alive: OllamaLLMProvider.KEEP_ALIVE,
            think: false,
            options: { temperature: 0, num_predict: 1, num_ctx: this.numCtx, num_gpu: this.numGpu },
            messages: [
              { role: 'system', content: buildSystemPrompt() },
              { role: 'user', content: userContent },
            ],
          }),
        },
        timeoutMs,
      );
    } catch {
      /* runtime not up yet — the first real request will report it */
    }
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
          // Ollama's JSON mode constrains output to a single object, so the array is wrapped in an envelope.
          format: 'json',
          keep_alive: OllamaLLMProvider.KEEP_ALIVE,
          // Full GPU offload (num_gpu) + a small context keep the whole model in VRAM on 4 GB cards.
          options: { temperature: 0, num_predict: 300, num_ctx: this.numCtx, num_gpu: this.numGpu },
          think: false,
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: buildUserMessage(transcript, context) },
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
  /** Free-form JSON completion (AI Summary extraction) — a different system prompt from the command one. */
  async complete(systemPrompt: string, userMessage: string, options?: { timeoutMs?: number; maxTokens?: number }): Promise<string> {
    const res = await fetchWithTimeout(
      `${this.baseUrl.replace(/\/$/, '')}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: 'json',
          keep_alive: OllamaLLMProvider.KEEP_ALIVE,
          think: false,
          options: { temperature: 0, num_predict: options?.maxTokens ?? 700, num_ctx: this.numCtx, num_gpu: this.numGpu },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
      },
      options?.timeoutMs ?? Math.max(this.timeoutMs, 45000),
    );
    if (!res.ok) throw new ModelUnavailableError(`Ollama responded ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? '';
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
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: buildUserMessage(transcript, context) },
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
  async complete(systemPrompt: string, userMessage: string, options?: { timeoutMs?: number; maxTokens?: number }): Promise<string> {
    const res = await fetchWithTimeout(
      `${this.baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: options?.maxTokens ?? 700,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
      },
      options?.timeoutMs ?? Math.max(this.timeoutMs, 45000),
    );
    if (!res.ok) throw new ModelUnavailableError(`LLM server responded ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? '';
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
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript, context, system_prompt: buildSystemPrompt(), user_message: buildUserMessage(transcript, context) }) },
      this.timeoutMs,
    );
    if (!res.ok) throw new ModelUnavailableError(`Bridge responded ${res.status}`);
    const data = (await res.json()) as { raw?: string; commands?: unknown };
    const raw = data.raw ?? JSON.stringify(data.commands ?? '');
    return { commands: parseCommands(raw), raw };
  }
  /** The bridge takes any system prompt + user message, so extraction reuses the same endpoint. */
  async complete(systemPrompt: string, userMessage: string, options?: { timeoutMs?: number }): Promise<string> {
    const res = await fetchWithTimeout(
      this.url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: userMessage, system_prompt: systemPrompt, user_message: userMessage }) },
      options?.timeoutMs ?? Math.max(this.timeoutMs, 45000),
    );
    if (!res.ok) throw new ModelUnavailableError(`Bridge responded ${res.status}`);
    const data = (await res.json()) as { raw?: string };
    return data.raw ?? '';
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
      return new OllamaLLMProvider(config.llm.apiUrl, config.llm.model, config.llm.timeoutMs, config.llm.numGpu, config.llm.numCtx);
    case 'openai-compatible':
      return new OpenAICompatibleLLMProvider(config.llm.apiUrl, config.llm.model, config.llm.timeoutMs);
    case 'http':
      return new HttpBridgeLLMProvider(config.llm.apiUrl, config.llm.timeoutMs);
    default:
      return new MockLLMProvider();
  }
}
