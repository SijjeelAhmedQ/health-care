import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaChat } from '../providers/llm';
import { buildTools } from '../agent/tools';
import { toToolSchema } from '../agent/tool';
import { SYSTEM_PROMPT } from '../agent/prompt';

const cfg = { provider: 'ollama' as const, apiUrl: 'http://ollama.test', model: 'qwen3.5:9b', timeoutMs: 5000, numGpu: 99, numCtx: 12288, maxSteps: 8 };

describe('OllamaChat — the context window always fits the instructions and tools', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('grows past the configured window when the system prompt and tool schemas need it, and stays put between requests', async () => {
    const sent: Array<{ options: { num_ctx: number; num_predict: number } }> = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ message: { content: 'ok' }, done_reason: 'stop' }), { status: 200 });
    });
    const llm = new OllamaChat(cfg);
    llm.dispose();
    const tools = buildTools().map(toToolSchema);
    const messages = [{ role: 'system' as const, content: SYSTEM_PROMPT }, { role: 'user' as const, content: 'open the dashboard' }];
    await llm.chat(messages, tools);
    await llm.chat([...messages, { role: 'user' as const, content: 'and the inbox' }], tools);

    const fixedTokens = (JSON.stringify(tools).length + SYSTEM_PROMPT.length) / 3.6; // as measured on Qwen 3.5
    expect(sent[0].options.num_ctx).toBeGreaterThan(fixedTokens + 2048);
    expect(sent[0].options.num_ctx).toBeGreaterThanOrEqual(cfg.numCtx);
    expect(sent[1].options.num_ctx).toBe(sent[0].options.num_ctx); // no reload between requests
    expect(sent[0].options.num_predict).toBeGreaterThan(1000); // room for a tool call with many records
  });

  it('keeps the configured window when it is already big enough', async () => {
    const sent: Array<{ options: { num_ctx: number } }> = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ message: { content: '' }, done_reason: 'length' }), { status: 200 });
    });
    const llm = new OllamaChat({ ...cfg, numCtx: 65536 });
    llm.dispose();
    const turn = await llm.chat([{ role: 'system', content: 'short' }], []);
    expect(sent[0].options.num_ctx).toBe(65536);
    expect(turn.truncated).toBe(true);
  });
});
