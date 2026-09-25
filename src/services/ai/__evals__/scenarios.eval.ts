// @vitest-environment jsdom
/**
 * Multi-step spoken requests, end to end, against the real local model: qwen3.5:4b chooses the
 * tools, and the real application (router, store, dialogs) carries them out. Each scenario states
 * what must be true on screen afterwards.
 *
 *   npm run eval:llm -- scenarios
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { store } from '@/store';
import { login } from '@/store/slices/authSlice';
import { fetchPatients, patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { fetchProviders } from '@/store/slices/providerSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { router } from '@/app/router';
import { getVoiceController } from '@/services/ai/voiceController';
import { OllamaChat } from '@/services/ai/providers/llm';
import { FakeMic } from '@/services/ai/__tests__/fakes';
import { installBrowserStubs, pageText, renderAppAt, unmountApp, wait, waitUntil } from '@/__tests__/harness';

const MODEL = process.env.EVAL_MODEL ?? 'qwen3.5:4b';
const llm = new OllamaChat({ provider: 'ollama', apiUrl: 'http://127.0.0.1:11434', model: MODEL, timeoutMs: 600000, numGpu: 99, numCtx: 12288, maxSteps: 8 });

// Log what each model call cost: prompt tokens processed vs. reused from the cache, and time.
const chat = llm.chat.bind(llm);
llm.chat = async (...args: Parameters<typeof chat>) => {
  const answer = await chat(...args);
  const u = answer.usage;
  console.log(`  model call: ${u?.ms} ms — prompt ${u?.promptTokens} (cached ${u?.cachedTokens ?? '?'}), output ${u?.outputTokens} → ${answer.toolCalls.map((c) => c.name).join(', ') || 'text'}`);
  return answer;
};

/** What the open dialog holds: its title and every filled field. */
function openDialog() {
  const modal = [...document.querySelectorAll('.ant-modal')].at(-1);
  if (!modal) return null;
  const values: Record<string, string> = {};
  modal.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[id], textarea[id]').forEach((el) => {
    if (el.value) values[el.id] = el.value;
  });
  modal.querySelectorAll('.ant-select').forEach((sel) => {
    const id = sel.querySelector('input[id]')?.id;
    const shown = sel.querySelector('.ant-select-selection-item')?.textContent;
    if (id && shown) values[id] = shown;
  });
  return { title: modal.querySelector('.ant-modal-title')?.textContent ?? '', values };
}

async function run(said: string) {
  const started = Date.now();
  await getVoiceController().handleTranscript(said);
  await waitUntil(() => router.state.navigation.state === 'idle');
  await wait(400);
  const state = store.getState();
  const trace = state.voice.trace;
  const calls = (trace?.steps ?? []).flatMap((s) => (s.type === 'tool' ? [`${s.call.name}(${JSON.stringify(s.call.arguments)}) -> ${s.result?.ok ? 'ok' : 'FAIL'}: ${s.result?.message ?? ''}`] : []));
  const modelSteps = (trace?.steps ?? []).filter((s) => s.type === 'model');
  const modelCalls = modelSteps.length;
  const modelMs = modelSteps.map((s) => (s.finishedAt ?? 0) - s.startedAt);
  const patient = patientSelectors.selectById(state, state.patients.currentPatientId ?? '')?.fullName ?? null;
  const out = { said, ms: Date.now() - started, modelCalls, modelMs, calls, reply: state.voice.response, path: router.state.location.pathname, patient, dialog: openDialog(), pending: state.voice.pendingConfirmation?.kind ?? null };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

beforeAll(async () => {
  installBrowserStubs();
  const tools = getVoiceController().tools;
  expect(tools.length).toBeGreaterThan(10);
});

beforeEach(async () => {
  store.dispatch(voiceActions.resetVoice());
  await store.dispatch(login({ username: 'sahmed', password: 'demo' })).unwrap();
  await store.dispatch(fetchPatients()).unwrap();
  await store.dispatch(fetchProviders()).unwrap();
  store.dispatch(setCurrentPatient(null));
  getVoiceController().reconfigure({ llm, stt: new FakeMic() });
  await renderAppAt('/dashboard');
});

afterEach(unmountApp);

describe(`multi-step requests — ${MODEL}`, () => {
  it('warms up', async () => {
    expect(await getVoiceController().warmUp()).toBeNull();
  });

  it('1: patients → select James Ahmed → task form filled for blood pressure monitoring', async () => {
    const r = await run('go to patients and select james ahmed and create a task for blood pressure monitoring');
    expect(r.patient).toBe('James Ahmed');
    expect(r.dialog?.title).toMatch(/task/i);
    expect(Object.values(r.dialog?.values ?? {}).join(' ')).toMatch(/blood pressure/i);
    expect(pageText()).toContain('James Ahmed');
  });

  it('2: patients → select James Ahmed → inbox → first record', async () => {
    const r = await run('go to patients and select james ahmed and goto inbox and select first record');
    expect(r.patient).toBe('James Ahmed');
    expect(r.path).toMatch(/^\/inbox/);
    expect(r.calls.some((c) => c.startsWith('inbox_open_item') && c.includes('-> ok'))).toBe(true);
  });

  it('3: medication in the same sentence', async () => {
    const r = await run('go to patients and select james ahmed and add metformin 500 mg twice daily');
    expect(r.patient).toBe('James Ahmed');
    expect(r.dialog?.title).toMatch(/medication/i);
    expect(Object.values(r.dialog?.values ?? {}).join(' ')).toMatch(/metformin/i);
  });

  it('4: diagnosis in the same sentence', async () => {
    const r = await run('open patients, select james ahmed and add a diagnosis of hypertension');
    expect(r.patient).toBe('James Ahmed');
    expect(r.dialog?.title).toMatch(/diagnos/i);
    expect(Object.values(r.dialog?.values ?? {}).join(' ')).toMatch(/hypertension/i);
  });

  it('5: recall in the same sentence', async () => {
    const r = await run('go to patients, select james ahmed and create a recall for an annual physical in 3 months');
    expect(r.patient).toBe('James Ahmed');
    expect(r.dialog?.title).toMatch(/recall/i);
  });
});
