// @vitest-environment jsdom
/**
 * One long spoken request, end to end, on any model: how long understanding (the plan) and execution
 * (the tool calls) take, how many model calls, what it cost, and whether every record came out right.
 *
 *   OpenRouter (through the bridge):  EVAL_PROVIDER=openrouter EVAL_MODEL=openai/gpt-oss-120b npm run eval:llm -- carePlanBench
 *   Ollama (Kaggle through the bridge, or any Ollama):  EVAL_LLM_URL=http://127.0.0.1:8765/ollama EVAL_MODEL=qwen3.5:9b npm run eval:llm -- carePlanBench
 *
 * EVAL_RUNS (default 1) repeats it; the results go to EVAL_OUT (JSON lines) when set.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import dayjs from 'dayjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { store } from '@/store';
import { login } from '@/store/slices/authSlice';
import { fetchPatients, patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { fetchProviders } from '@/store/slices/providerSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { router } from '@/app/router';
import { CarePlanRegistry } from '@/registry/carePlanRegistry';
import { FormRegistry } from '@/registry/formRegistry';
import { getVoiceController } from '@/services/ai/voiceController';
import { plansLongRequests } from '@/services/ai/config';
import { OllamaChat, OpenAICompatibleChat, type ChatLLM } from '@/services/ai/providers/llm';
import { FakeMic } from '@/services/ai/__tests__/fakes';
import { installBrowserStubs, renderAppAt, unmountApp, wait, waitUntil } from '@/__tests__/harness';

const SAID =
  'Goto patients select Tom Baker and add medication metformin,  Panadol, gabapentin, rituximab  500 mg twice daily for 30 days, add hypertension as a diagnosis, create a task for blood pressure monitoring, recall the patient after two weeks, and schedule a follow-up appointment next Tuesday at 3 pm.';

const PROVIDER = process.env.EVAL_PROVIDER ?? 'ollama';
const MODEL = process.env.EVAL_MODEL ?? 'qwen3.5:4b';
const RUNS = Number(process.env.EVAL_RUNS ?? 1);
/** $ per million tokens [input, output] — for the cost line (OpenRouter prices). */
const PRICE = (process.env.EVAL_PRICE ?? '0,0').split(',').map(Number);

// EVAL_PROVIDER=kaggle: Ollama on the Kaggle GPU, straight to the server the bridge has saved (its
// address and key read from python/compute_settings.json — the key is only ever sent to that server).
let kaggleUrl = '';
if (PROVIDER === 'kaggle') {
  const saved = JSON.parse(readFileSync(`${process.cwd()}/python/compute_settings.json`, 'utf-8')) as { remote_url: string; remote_key: string };
  kaggleUrl = saved.remote_url.replace(/\/$/, '');
  const base = globalThis.fetch;
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).startsWith(kaggleUrl) ? base(input, { ...init, headers: { ...(init?.headers as Record<string, string>), 'X-CareFlow-Key': saved.remote_key } }) : base(input, init);
}

const llm: ChatLLM =
  PROVIDER === 'kaggle'
    ? new OllamaChat({ provider: 'ollama', apiUrl: `${kaggleUrl}/ollama`, model: MODEL, timeoutMs: 900000, maxSteps: 8 } as never)
    : PROVIDER === 'openrouter'
    ? new OpenAICompatibleChat({ provider: 'openai-compatible', apiUrl: process.env.EVAL_LLM_URL ?? 'http://127.0.0.1:8765/openrouter/api', model: MODEL, timeoutMs: 300000, maxSteps: 8 } as never)
    : new OllamaChat({ provider: 'ollama', apiUrl: process.env.EVAL_LLM_URL ?? 'http://127.0.0.1:11434', model: MODEL, timeoutMs: 900000, numGpu: 99, maxSteps: 8 } as never);

let tokens = { input: 0, cached: 0, output: 0 };
const chat = llm.chat.bind(llm);
llm.chat = async (...args: Parameters<typeof chat>) => {
  const answer = await chat(...args);
  const u = answer.usage;
  tokens = { input: tokens.input + (u?.promptTokens ?? 0), cached: tokens.cached + (u?.cachedTokens ?? 0), output: tokens.output + (u?.outputTokens ?? 0) };
  console.log(`  model call ${u?.ms} ms — in ${u?.promptTokens} (cached ${u?.cachedTokens ?? '?'}), out ${u?.outputTokens} → ${answer.toolCalls.map((c) => c.name).join(', ') || 'text'}`);
  return answer;
};

const lower = (v: unknown) => String(v ?? '').toLowerCase();

/** What the provider asked for, one line each: [label, passed]. */
function score(patient: string | null) {
  const entries = CarePlanRegistry.get()?.isOpen() ? CarePlanRegistry.get()!.entries() : [];
  // Without a care plan, a single record form may hold them.
  const open = FormRegistry.active();
  const fromForm = !entries.length && open?.isOpen() ? (open.entries?.getAll() ?? [open.getValues()]).map((values) => ({ kind: open.formId, values })) : [];
  const all = [...entries, ...fromForm] as Array<{ kind: string; values: Record<string, unknown> }>;
  const of = (kind: string) => all.filter((e) => e.kind === kind).map((e) => e.values);
  const meds = of('medication');
  const today = dayjs();
  // "next Tuesday": the coming Tuesday — said on a Tuesday, the one a week on.
  const tuesday = today.add(((2 - today.day() + 7) % 7) || 7, 'day').format('YYYY-MM-DD');
  const med = (name: string) => meds.find((m) => lower(m.medicationName).includes(name));
  const checks: Array<[string, boolean]> = [
    ['patient Tom Baker selected', patient === 'Tom Baker'],
    ...['metformin', 'panadol', 'gabapentin', 'rituximab'].map((n): [string, boolean] => {
      const m = med(n);
      return [`${n} 500 mg, twice daily, 30 days`, !!m && lower(m.dosage).replace(/\s/g, '') === '500mg' && /twice/.test(lower(m.frequency)) && /30\s*day/.test(lower(m.duration))];
    }),
    ['no extra medications', meds.length === 4],
    ['diagnosis Hypertension', of('diagnosis').some((d) => /hypertension/.test(lower(d.description)))],
    ['task blood pressure monitoring', of('task').some((t) => /blood pressure/.test(lower(t.title)))],
    [`recall due ${today.add(14, 'day').format('YYYY-MM-DD')}`, of('recall').some((r) => String(r.dueDate) === today.add(14, 'day').format('YYYY-MM-DD'))],
    [`appointment ${tuesday} 15:00`, of('appointment').some((a) => String(a.date) === tuesday && String(a.startTime) === '15:00')],
    // A reason only in the provider's own words: "a follow-up appointment" names the visit; no recall reason was said.
    ['appointment reason "Follow-up" (said)', of('appointment').some((a) => /^follow[- ]?up$/.test(lower(a.reason).trim()))],
    ['recall reason left for the provider (not said)', of('recall').length > 0 && of('recall').every((r) => !lower(r.reason).trim())],
    ['nothing saved without a yes', !!store.getState().voice.pendingConfirmation || !!store.getState().voice.pendingSlot],
  ];
  return { checks, entries: all.map((e) => `${e.kind}: ${JSON.stringify(e.values)}`) };
}

beforeAll(() => {
  installBrowserStubs();
});

beforeEach(async () => {
  store.dispatch(voiceActions.resetVoice());
  await store.dispatch(login({ username: 'lwhite', password: 'demo' })).unwrap();
  await store.dispatch(fetchPatients()).unwrap();
  await store.dispatch(fetchProviders()).unwrap();
  store.dispatch(setCurrentPatient(null));
  // As the app does for this model (EVAL_PLAN=0 / 1 to force it).
  getVoiceController().reconfigure({ llm, stt: new FakeMic(), planSteps: process.env.EVAL_PLAN === undefined ? plansLongRequests({ model: MODEL, planSteps: true }) : process.env.EVAL_PLAN !== '0' });
  await renderAppAt('/dashboard');
});

afterEach(unmountApp);

describe(`care plan request — ${PROVIDER}:${MODEL}`, () => {
  it('warms up', async () => {
    expect(await getVoiceController().warmUp()).toBeNull();
  });

  for (let n = 1; n <= RUNS; n++) {
    it(`run ${n}`, async () => {
      tokens = { input: 0, cached: 0, output: 0 };
      const started = Date.now();
      await getVoiceController().handleTranscript(SAID);
      await waitUntil(() => router.state.navigation.state === 'idle');
      await wait(400);
      const total = Date.now() - started;
      const state = store.getState();
      const steps = state.voice.trace?.steps ?? [];
      const models = steps.filter((s) => s.type === 'model');
      const ms = (s: (typeof steps)[number]) => (s.finishedAt ?? 0) - s.startedAt;
      // Understanding: the first model call (the plan, or the first tool choice when there is none).
      const understanding = models[0] ? ms(models[0]) : 0;
      const modelMs = models.reduce((t, s) => t + ms(s), 0);
      const tools = steps.filter((s) => s.type === 'tool');
      const patient = patientSelectors.selectById(state, state.patients.currentPatientId ?? '')?.fullName ?? null;
      const { checks, entries } = score(patient);
      const passed = checks.filter(([, ok]) => ok).length;
      const cost = ((tokens.input - tokens.cached) * PRICE[0] + tokens.cached * PRICE[0] * 0.25 + tokens.output * PRICE[1]) / 1e6;
      const result = {
        model: `${PROVIDER}:${MODEL}`,
        run: n,
        totalS: +(total / 1000).toFixed(1),
        understandingS: +(understanding / 1000).toFixed(1),
        executionS: +((total - understanding) / 1000).toFixed(1),
        modelS: +(modelMs / 1000).toFixed(1),
        toolsS: +(tools.reduce((t, s) => t + ms(s), 0) / 1000).toFixed(1),
        modelCalls: models.length,
        toolCalls: tools.map((s) => (s.type === 'tool' ? `${s.call.name}${s.result?.ok ? '' : '✗'}` : '')),
        refused: tools.flatMap((s) => (s.type === 'tool' && !s.result?.ok ? [`${s.call.name}(${JSON.stringify(s.call.arguments)}) → ${s.result?.message ?? ''}`] : [])),
        plan: state.voice.plan?.map((s) => s.text) ?? null,
        score: `${passed}/${checks.length}`,
        failed: checks.filter(([, ok]) => !ok).map(([label]) => label),
        tokens,
        costUsd: +cost.toFixed(4),
        reply: state.voice.response,
        error: state.voice.error,
        entries,
      };
      console.log(JSON.stringify(result, null, 2));
      if (process.env.EVAL_OUT) appendFileSync(process.env.EVAL_OUT, JSON.stringify(result) + '\n');
    });
  }
});
