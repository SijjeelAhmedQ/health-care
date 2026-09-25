/**
 * Chat model adapters with native tool calling.
 *
 * Every adapter takes the conversation plus the tool schemas and returns one
 * assistant turn: text, tool calls, or both. The agent loop
 * (services/ai/agent/agent.ts) never depends on which runtime answered.
 *
 *  - OllamaChat            Ollama /api/chat (qwen3.5:4b) — the default
 *  - OpenAICompatibleChat  llama.cpp server, LM Studio, mlx_lm.server, vLLM
 *  - BridgeChat            the Python bridge's /api/chat (python/app.py)
 */
import type { ToolCall } from '@/types/ai';
import type { AIConfig } from '../config';

export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}

/** Conversation messages in Ollama's shape (the other adapters translate). */
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }> }
  | { role: 'tool'; content: string; tool_name: string };

export interface ToolSchema {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatTurn {
  content: string;
  toolCalls: ToolCall[];
  /** Prompt tokens the runtime reused from its cache / had to process — for the trace. */
  usage?: { promptTokens?: number; cachedTokens?: number; outputTokens?: number; ms?: number };
}

export interface ChatOptions {
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatLLM {
  readonly name: string;
  chat(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): Promise<ChatTurn>;
  /** Load the model and prime the cache with the static prefix (system prompt + tools). */
  /** Resolves with the error message when the runtime could not load the model, or null. */
  warmUp?(messages: ChatMessage[], tools: ToolSchema[]): Promise<string | null>;
  /** The model is already in memory (so a warm-up only primes the cache), when the runtime can tell. */
  isLoaded?(): Promise<boolean>;
  healthCheck?(): Promise<boolean>;
  dispose?(): void;
}

async function post(url: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ModelUnavailableError(`${url} responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }
    return res;
  } catch (e) {
    if (e instanceof ModelUnavailableError) throw e;
    if (signal?.aborted) throw e;
    if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') throw new ModelUnavailableError(`The model did not answer within ${Math.round(timeoutMs / 1000)} s`);
    throw new ModelUnavailableError(`Could not reach the model at ${url}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const trimSlash = (u: string) => u.replace(/\/$/, '');

/** Ollama returns arguments as an object; some builds return a JSON string. */
function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

export class OllamaChat implements ChatLLM {
  readonly name: string;
  /** Keep the model resident between utterances so only the first call pays the load cost. */
  static readonly KEEP_ALIVE = '30m';
  /**
   * Qwen 3.5 is a hybrid (recurrent) model: llama.cpp cannot roll its cache back to an arbitrary
   * token, it keeps checkpoints of the recurrent state at the END of each prompt and at END-508,
   * and a request resumes from the last checkpoint inside the prefix it shares with the previous
   * one. A warm-up whose user turn is ~490 one-token words therefore parks a checkpoint just
   * before the user turn — at the end of the static system prompt and tool schemas — and every
   * real request only processes its own CONTEXT and utterance (~1 s instead of ~8 s on a
   * GTX 1650). Slightly under 508 on purpose: a checkpoint past the shared prefix is useless.
   */
  static readonly WARM_UP_PAD_TOKENS = 490;
  private keepAliveTimer?: ReturnType<typeof setInterval>;
  private primed: { messages: ChatMessage[]; tools: ToolSchema[] } | null = null;

  constructor(private readonly cfg: AIConfig['llm']) {
    this.name = `ollama:${cfg.model}`;
    // Re-ping well inside KEEP_ALIVE so the model is never unloaded while the app is open.
    if (typeof window !== 'undefined') this.keepAliveTimer = setInterval(() => this.primed && void this.warmUp(this.primed.messages, this.primed.tools), 20 * 60 * 1000);
  }

  dispose() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
  }

  private body(messages: ChatMessage[], tools: ToolSchema[], maxTokens: number) {
    return {
      model: this.cfg.model,
      messages,
      tools,
      stream: false,
      think: false,
      keep_alive: OllamaChat.KEEP_ALIVE,
      options: { temperature: 0, num_predict: maxTokens, num_ctx: this.cfg.numCtx, num_gpu: this.cfg.numGpu },
    };
  }

  async chat(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): Promise<ChatTurn> {
    const started = Date.now();
    const res = await post(`${trimSlash(this.cfg.apiUrl)}/api/chat`, this.body(messages, tools, options?.maxTokens ?? 512), this.cfg.timeoutMs, options?.signal);
    const data = (await res.json()) as {
      message?: { content?: string; tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }> };
      prompt_eval_count?: number;
      prompt_eval_cached_count?: number;
      eval_count?: number;
    };
    const toolCalls = (data.message?.tool_calls ?? [])
      .filter((c) => c.function?.name)
      .map((c) => ({ name: c.function!.name!, arguments: parseArguments(c.function!.arguments) }));
    return {
      content: data.message?.content ?? '',
      toolCalls,
      usage: { promptTokens: data.prompt_eval_count, cachedTokens: data.prompt_eval_cached_count, outputTokens: data.eval_count, ms: Date.now() - started },
    };
  }

  /**
   * One token of output: loads the model and parks a cache checkpoint at the end of `prefix` — the
   * part every request starts with — so a request only processes what follows it.
   */
  async warmUp(prefix: ChatMessage[], tools: ToolSchema[]): Promise<string | null> {
    this.primed = { messages: prefix, tools };
    const padded: ChatMessage[] = [...prefix, { role: 'user', content: Array(OllamaChat.WARM_UP_PAD_TOKENS).fill('x').join(' ') }];
    try {
      await post(`${trimSlash(this.cfg.apiUrl)}/api/chat`, this.body(padded, tools, 1), Math.max(this.cfg.timeoutMs, 300000));
      return null;
    } catch (e) {
      // At app start the runtime may simply not be up yet; the first real request reports it too.
      return (e as Error).message;
    }
  }

  async isLoaded(): Promise<boolean> {
    try {
      const res = await fetch(`${trimSlash(this.cfg.apiUrl)}/api/ps`);
      if (!res.ok) return false;
      const data = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
      return (data.models ?? []).some((m) => m.name === this.cfg.model || m.model === this.cfg.model);
    } catch {
      return false;
    }
  }

  async healthCheck() {
    try {
      return (await fetch(`${trimSlash(this.cfg.apiUrl)}/api/tags`)).ok;
    } catch {
      return false;
    }
  }
}

/** Ollama-shaped history -> OpenAI-shaped history. */
function toOpenAI(messages: ChatMessage[]) {
  let callId = 0;
  const pending: string[] = [];
  return messages.map((m) => {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const calls = m.tool_calls.map((c) => {
        const id = `call_${callId++}`;
        pending.push(id);
        return { id, type: 'function', function: { name: c.function.name, arguments: JSON.stringify(c.function.arguments) } };
      });
      return { role: 'assistant', content: m.content || null, tool_calls: calls };
    }
    if (m.role === 'tool') return { role: 'tool', content: m.content, tool_call_id: pending.shift() ?? `call_${callId}` };
    return { role: m.role, content: m.content };
  });
}

export class OpenAICompatibleChat implements ChatLLM {
  readonly name: string;
  constructor(private readonly cfg: AIConfig['llm']) {
    this.name = `openai-compatible:${cfg.model}`;
  }
  async chat(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): Promise<ChatTurn> {
    const started = Date.now();
    const res = await post(
      `${trimSlash(this.cfg.apiUrl)}/v1/chat/completions`,
      { model: this.cfg.model, messages: toOpenAI(messages), tools, temperature: 0, max_tokens: options?.maxTokens ?? 512 },
      this.cfg.timeoutMs,
      options?.signal,
    );
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const msg = data.choices?.[0]?.message;
    return {
      content: msg?.content ?? '',
      toolCalls: (msg?.tool_calls ?? []).filter((c) => c.function?.name).map((c) => ({ name: c.function!.name!, arguments: parseArguments(c.function!.arguments) })),
      usage: { promptTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens, ms: Date.now() - started },
    };
  }
  async healthCheck() {
    try {
      return (await fetch(`${trimSlash(this.cfg.apiUrl)}/v1/models`)).ok;
    } catch {
      return false;
    }
  }
}

/** The Python bridge forwards to whichever runtime it is configured for. */
export class BridgeChat implements ChatLLM {
  readonly name: string;
  constructor(private readonly cfg: AIConfig['llm']) {
    this.name = `bridge:${cfg.model}`;
  }
  async chat(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): Promise<ChatTurn> {
    const started = Date.now();
    const res = await post(
      `${trimSlash(this.cfg.apiUrl)}/api/chat`,
      { model: this.cfg.model, messages, tools, options: { temperature: 0, num_predict: options?.maxTokens ?? 512, num_ctx: this.cfg.numCtx, num_gpu: this.cfg.numGpu } },
      this.cfg.timeoutMs,
      options?.signal,
    );
    const data = (await res.json()) as { content?: string; tool_calls?: Array<{ name: string; arguments: unknown }> };
    return { content: data.content ?? '', toolCalls: (data.tool_calls ?? []).map((c) => ({ name: c.name, arguments: parseArguments(c.arguments) })), usage: { ms: Date.now() - started } };
  }
  async healthCheck() {
    try {
      return (await fetch(`${trimSlash(this.cfg.apiUrl)}/api/health`)).ok;
    } catch {
      return false;
    }
  }
}

export function createChatLLM(llm: AIConfig['llm']): ChatLLM {
  switch (llm.provider) {
    case 'openai-compatible':
      return new OpenAICompatibleChat(llm);
    case 'bridge':
      return new BridgeChat(llm);
    case 'ollama':
    default:
      return new OllamaChat(llm);
  }
}
