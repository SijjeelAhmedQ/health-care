/**
 * Where a turn's time goes on the real model: prompt tokens processed vs. reused from the cache,
 * and prompt vs. generation time, over a sequence shaped exactly like the app's (warm-up, a turn
 * with a tool call and its follow-up, then the next turn with history).
 *
 *   npm run eval:llm -- cache
 */
import { it } from 'vitest';
import dayjs from 'dayjs';
import * as db from '@/services/mock/mockDb';
import { OllamaChat, type ChatMessage } from '@/services/ai/providers/llm';
import { buildTools } from '@/services/ai/agent/tools';
import { toToolSchema } from '@/services/ai/agent/tool';
import { buildSessionMessage, buildUserMessage, SESSION_ACK, SYSTEM_PROMPT, type Exchange } from '@/services/ai/agent/prompt';
import type { AIContext } from '@/types/ai';

const MODEL = process.env.EVAL_MODEL ?? 'qwen3.5:4b';
const URL = 'http://127.0.0.1:11434/api/chat';
const tools = buildTools().map(toToolSchema);
const options = { temperature: 0, num_predict: 256, num_ctx: 12288, num_gpu: 99 };

const ctx = (page: string): AIContext => {
  const t = dayjs();
  return {
    today: t.format('YYYY-MM-DD (dddd)'), nextDays: '', laterDates: '', now: t.format('HH:mm'), providerName: db.providers[0].fullName,
    currentPageId: page, currentPageTitle: page, currentPatientId: null, currentPatientName: null,
    openForm: null, pendingQuestion: null, pendingConfirmation: null, inbox: null, patientSearch: null, list: null, extracted: null,
  } as AIContext;
};

async function call(label: string, messages: ChatMessage[], maxTokens = 256) {
  const started = Date.now();
  const res = await fetch(URL, { method: 'POST', body: JSON.stringify({ model: MODEL, messages, tools, stream: false, think: false, keep_alive: '30m', options: { ...options, num_predict: maxTokens } }) });
  const d = (await res.json()) as Record<string, any>;
  const ms = (ns?: number) => Math.round((ns ?? 0) / 1e6);
  console.log(
    `${label.padEnd(34)} total ${String(Date.now() - started).padStart(5)} ms | prompt ${d.prompt_eval_count} tok (cached ${d.prompt_eval_cached_count ?? '?'}) ${ms(d.prompt_eval_duration)} ms | output ${d.eval_count} tok ${ms(d.eval_duration)} ms | load ${ms(d.load_duration)} ms`,
  );
  return d.message as ChatMessage;
}

it('cache behaviour across turns', async () => {
  new OllamaChat({ provider: 'ollama', apiUrl: 'http://127.0.0.1:11434', model: MODEL, timeoutMs: 600000, numGpu: 99, numCtx: 12288, maxSteps: 8 }).dispose();
  // Exactly the agent's layout: system + tools, the day's SESSION exchange, then CONTEXT + SAID.
  const prefix: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildSessionMessage(ctx('dashboard')) },
    { role: 'assistant', content: SESSION_ACK },
  ];
  const pad: ChatMessage = { role: 'user', content: Array(OllamaChat.WARM_UP_PAD_TOKENS).fill('x').join(' ') };
  await call('warm-up (padded)', [...prefix, pad], 1);
  await call('warm-up again (should be cached)', [...prefix, pad], 1);

  const earlier: Exchange[] = [];
  for (const [said, page] of [['go to patients', 'dashboard'], ['open the inbox', 'patients'], ['open configuration', 'inbox'], ['go back', 'configuration']]) {
    const user: ChatMessage = { role: 'user', content: buildUserMessage(said, ctx(page), earlier) };
    const msgs: ChatMessage[] = [...prefix, user];
    const first = await call(`turn "${said}" — first call`, msgs);
    const calls = (first as any).tool_calls ?? [];
    msgs.push({ role: 'assistant', content: first.content ?? '', tool_calls: calls });
    for (const c of calls) msgs.push({ role: 'tool', tool_name: c.function.name, content: JSON.stringify({ ok: true, message: `Opened ${page}.` }) } as ChatMessage);
    const second = await call(`turn "${said}" — follow-up`, msgs);
    earlier.push({ said, reply: second.content || 'Done.' });
  }
}, 1800000);
