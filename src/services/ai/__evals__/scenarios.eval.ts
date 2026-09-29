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
import { FormRegistry } from '@/registry/formRegistry';
import { getVoiceController } from '@/services/ai/voiceController';
import { OllamaChat } from '@/services/ai/providers/llm';
import { FakeMic } from '@/services/ai/__tests__/fakes';
import { installBrowserStubs, pageText, renderAppAt, unmountApp, wait, waitUntil } from '@/__tests__/harness';

const MODEL = process.env.EVAL_MODEL ?? 'qwen3.5:4b';
/** GPU layers: 99 = all; EVAL_NUM_GPU=auto lets Ollama fit what it can (a model bigger than the GPU). */
const NUM_GPU = process.env.EVAL_NUM_GPU === 'auto' ? (undefined as unknown as number) : Number(process.env.EVAL_NUM_GPU ?? 99);
const llm = new OllamaChat({ provider: 'ollama', apiUrl: process.env.EVAL_LLM_URL ?? 'http://127.0.0.1:11434', model: MODEL, timeoutMs: 900000, numGpu: NUM_GPU, numCtx: 12288, maxSteps: 8 });

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
  const errors = [state.voice.error, ...modelSteps.map((s) => (s.type === 'model' ? s.error : undefined))].filter(Boolean);
  const out = { said, ms: Date.now() - started, modelCalls, modelMs, errors, plan: state.voice.plan?.map((s) => `${s.status}: ${s.text}`) ?? null, calls, reply: state.voice.response, path: router.state.location.pathname, patient, dialog: openDialog(), pending: state.voice.pendingConfirmation?.kind ?? null };
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
  await store.dispatch(login({ username: 'lwhite', password: 'demo' })).unwrap();
  await store.dispatch(fetchPatients()).unwrap();
  await store.dispatch(fetchProviders()).unwrap();
  store.dispatch(setCurrentPatient(null));
  // Long requests are split into steps first, as in the app (EVAL_PLAN=0 to compare without).
  getVoiceController().reconfigure({ llm, stt: new FakeMic(), planSteps: process.env.EVAL_PLAN !== '0' });
  await renderAppAt('/dashboard');
});

afterEach(unmountApp);

describe(`multi-step requests — ${MODEL}`, () => {
  it('warms up', async () => {
    expect(await getVoiceController().warmUp()).toBeNull();
  });

  it('1: patients → select Harry White → task form filled for blood pressure monitoring', async () => {
    const r = await run('go to patients and select harry white and create a task for blood pressure monitoring');
    expect(r.patient).toBe('Harry White');
    expect(r.dialog?.title).toMatch(/task/i);
    expect(Object.values(r.dialog?.values ?? {}).join(' ')).toMatch(/blood pressure/i);
    expect(pageText()).toContain('Harry White');
  });

  it('2: patients → select Harry White → inbox → first record', async () => {
    const r = await run('go to patients and select harry white and goto inbox and select first record');
    expect(r.patient).toBe('Harry White');
    expect(r.path).toMatch(/^\/inbox/);
    expect(r.calls.some((c) => c.startsWith('inbox_open_item') && c.includes('-> ok'))).toBe(true);
  });

  it('3: medication in the same sentence', async () => {
    const r = await run('go to patients and select harry white and add metformin 500 mg twice daily');
    expect(r.patient).toBe('Harry White');
    expect(r.dialog?.title).toMatch(/medication/i);
    expect(Object.values(r.dialog?.values ?? {}).join(' ')).toMatch(/metformin/i);
  });

  it('4: diagnosis in the same sentence', async () => {
    const r = await run('open patients, select harry white and add a diagnosis of hypertension');
    expect(r.patient).toBe('Harry White');
    expect(r.dialog?.title).toMatch(/diagnos/i);
    expect(Object.values(r.dialog?.values ?? {}).join(' ')).toMatch(/hypertension/i);
  });

  it('5: recall in the same sentence', async () => {
    const r = await run('go to patients, select harry white and create a recall for an annual physical in 3 months');
    expect(r.patient).toBe('Harry White');
    expect(r.dialog?.title).toMatch(/recall/i);
  });

  it('7: the same care-plan request, as the provider meant it (clean text)', async () => {
    const r = await run(
      'Go to patients, select Harry White and add medication metformin, panadol, gabapentin and rituximab 500 mg twice daily for 30 days, create a task for blood pressure monitoring, recall the patient after two weeks and schedule a follow-up appointment next Tuesday at 3 pm',
    );
    const kinds = [...document.querySelectorAll('.care-plan-kinds > .ant-tabs-nav .ant-tabs-tab')].map((t) => t.textContent?.trim() ?? '');
    console.log('care plan tabs:', kinds, '| reply:', r.reply);
    for (const kind of ['Medication', 'Task', 'Recall', 'Appointment']) expect(kinds.some((k) => k.startsWith(kind))).toBe(true);
  });

  it('8: four appointments for four patients, said in one breath', async () => {
    const r = await run(
      'crate four appointments against Dr Lucy White appointment is for Blood Pressure monitoring add appoint ment for today after 6 pm Liam Martin, Harry White, Lucas Martin, Lily Martin',
    );
    const whose = (FormRegistry.get('appointment')?.entries?.getAll() ?? []).map((v) => String(v.patient ?? '').replace(/\s*\(.*\)$/, ''));
    console.log('appointments for:', whose, '| reply:', r.reply);
    expect(r.dialog?.title).toMatch(/Add Appointment \(4\)/);
    expect(new Set(whose)).toEqual(new Set(['Liam Martin', 'Harry White', 'Lucas Martin', 'Lily Martin']));
  });

  /** The patient tabs of the open record form, and each entry's patient and name. */
  const multi = (kind: string, primary: string) => {
    const tabs = [...document.querySelectorAll('.entry-patient-tabs .ant-tabs-tab')].map((t) => t.textContent?.trim() ?? '');
    const entries = (FormRegistry.get(kind)?.entries?.getAll() ?? []).map((v) => `${String(v.patient ?? '').replace(/\s*\(.*\)$/, '')}: ${String(v[primary] ?? '')}`);
    console.log(`${kind} patient tabs:`, tabs, '| entries:', entries);
    return { tabs, entries };
  };

  it('9: the same three medications for each of four patients', async () => {
    // The provider's own words (their transcript).
    await run('Add the following medications to each of the four patients: Liam Martin, Harry White, Lucas Martin, and Lily Martin.  Panadol 500 mg — twice daily for 50 days Paracetamol 500 mg — twice daily for 50 days Gabapentin 500 mg — twice daily for 50 days');
    const { tabs, entries } = multi('medication', 'medicationName');
    expect(tabs).toHaveLength(4);
    for (const who of ['Liam Martin', 'Harry White', 'Lucas Martin', 'Lily Martin'])
      for (const drug of ['Panadol', 'Paracetamol', 'Gabapentin']) expect(entries).toContain(`${who}: ${drug}`);
  });

  it('10: a different time for each patient', async () => {
    await run('Create four appointments with Dr. Lucy White for today for blood pressure monitoring: Liam Martin at 6 pm, Harry White at 7 pm, Lucas Martin at 8 pm, Lily Martin at 9 pm');
    const all = FormRegistry.get('appointment')?.entries?.getAll() ?? [];
    const time = (who: string) => {
      const v = all.find((e) => String(e.patient ?? '').startsWith(who))?.startTime;
      return v && typeof v === 'object' && 'format' in v ? (v as { format: (f: string) => string }).format('HH:mm') : String(v);
    };
    console.log('appointment times:', ['Liam Martin', 'Harry White', 'Lucas Martin', 'Lily Martin'].map((w) => `${w} ${time(w)}`));
    expect([time('Liam Martin'), time('Harry White'), time('Lucas Martin'), time('Lily Martin')]).toEqual(['18:00', '19:00', '20:00', '21:00']);
  });

  it('11: different medications for different patients, never mixed', async () => {
    await run('Add Panadol to Liam Martin, Metformin to Harry White, and Gabapentin 500 mg twice daily for 30 days to Lucas Martin');
    const { entries } = multi('medication', 'medicationName');
    expect(entries).toEqual(expect.arrayContaining(['Liam Martin: Panadol', 'Harry White: Metformin', 'Lucas Martin: Gabapentin']));
    expect(entries).toHaveLength(3);
  });

  // Exactly what speech recognition produced for the provider's spoken request (the recall came out garbled).
  it('6: the spoken care-plan request — medications, task, recall and appointment all survive', async () => {
    const r = await run(
      'Go to Patients. Select Harry White, Add Medications, Metformin, Panadol, Gabapentin, Rituximab, 500 mg twice daily for 30 days. Create a task.  unclear Pressure Monitoring. Recall the patient after two weeks and schedule a follow up appointment next Tuesday at 3 p.m.',
    );
    expect(r.patient).toBe('Harry White');
    // The care plan dialog, tab by tab: every kind that was said is there.
    const kinds = [...document.querySelectorAll('.care-plan-kinds > .ant-tabs-nav .ant-tabs-tab')].map((t) => t.textContent?.trim() ?? '');
    console.log('care plan tabs:', kinds, '| reply:', r.reply);
    for (const kind of ['Medication', 'Task', 'Recall', 'Appointment']) expect(kinds.some((k) => k.startsWith(kind))).toBe(true);
    expect(r.reply).not.toMatch(/do not fill it yourself/);
  });
});
