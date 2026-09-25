import { describe, expect, it, vi } from 'vitest';
import { Agent } from '../agent/agent';
import { AppRuntime } from '../agent/runtime';
import { buildTools } from '../agent/tools';
import { parseArgs, toToolSchema } from '../agent/tool';
import { SYSTEM_PROMPT } from '../agent/prompt';
import { FieldRegistry } from '@/registry/fieldRegistry';
import { PageRegistry } from '@/registry/pageRegistry';
import type { AIContext, ToolResult } from '@/types/ai';
import { ScriptedLLM, call } from './fakes';

const context: AIContext = {
  today: '2026-09-24 (Thursday)',
  nextDays: 'Fri 2026-09-25, Sat 2026-09-26',
  laterDates: '1 week 2026-10-01',
  now: '10:30',
  providerName: 'Dr. Sarah Ahmed',
  currentPageId: 'summary',
  currentPageTitle: 'Summary',
  currentPatientId: 'pat-1',
  currentPatientName: 'John Smith',
  openForm: null,
  pendingQuestion: null,
  pendingConfirmation: null,
  inbox: null,
  patientSearch: null,
  list: null,
  extracted: null,
  carePlan: null,
};

/** A runtime whose actions are spies, so the loop can be tested on its own. */
function makeAgent(llm: ScriptedLLM, overrides: Partial<Record<keyof AppRuntime, unknown>> = {}) {
  const runtime = {
    beginTurn: vi.fn(),
    endTurn: vi.fn(),
    openPage: vi.fn(async (page: string): Promise<ToolResult> => ({ ok: true, message: `Opened ${page}.` })),
    createRecords: vi.fn(async (): Promise<ToolResult> => ({ ok: true, message: 'Medication form ready. Review it, then confirm.', awaitUser: true })),
    patientSummary: vi.fn((): ToolResult => ({ ok: true, message: 'John Smith, 42.', speak: true })),
    listRecords: vi.fn(async (): Promise<ToolResult> => ({ ok: true, message: '2 medications.', data: [{ id: 'med-1', label: 'Metformin' }] })),
    ...overrides,
  } as unknown as AppRuntime;
  const agent = new Agent(llm, runtime, () => context, 6);
  agent.setTools(buildTools());
  return { agent, runtime };
}

describe('tool schemas come from the registries', () => {
  const tools = buildTools();
  const schema = (name: string) => toToolSchema(tools.find((t) => t.name === name)!).function.parameters as Record<string, any>;

  it('every page in the registry is a choice of open_page, and nothing else is', () => {
    expect(schema('open_page').properties.page.enum).toEqual(PageRegistry.all().map((p) => p.id));
  });

  it('record fields and select options are generated, not written out', () => {
    const med = schema('add_medications').properties.medications.items;
    const fields = FieldRegistry.getForm('medication')!.fields.map((f) => f.name);
    expect(Object.keys(med.properties)).toEqual(fields);
    expect(med.properties.frequency.enum).toEqual(FieldRegistry.resolveField('medication', 'frequency')!.options);
    expect(med.properties.startDate.description).toMatch(/YYYY-MM-DD/);
  });

  it('the tool list is identical on every build (so the runtime can cache it)', () => {
    expect(JSON.stringify(buildTools().map(toToolSchema))).toBe(JSON.stringify(tools.map(toToolSchema)));
  });

  it('schemas are inlined — no $ref for a small model to follow', () => {
    expect(JSON.stringify(tools.map(toToolSchema))).not.toContain('$ref');
  });

  it('arguments are validated: options match in any letter case, nulls count as omitted, bad values are explained', () => {
    const add = tools.find((t) => t.name === 'add_medications')!;
    const good = parseArgs(add, { medications: [{ medicationName: 'Aspirin', frequency: 'ONCE DAILY', route: null }] });
    expect(good).toEqual({ ok: true, args: { medications: [{ medicationName: 'Aspirin', frequency: 'Once daily' }] } });
    const bad = parseArgs(add, { medications: [{ medicationName: 'Aspirin', startDate: 'next week' }] });
    expect(bad.ok).toBe(false);
    expect((bad as { error: string }).error).toMatch(/startDate: use YYYY-MM-DD/);
  });

  it('the system prompt is static (cacheable): no dates, names or page state in it', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(SYSTEM_PROMPT).not.toContain('John Smith');
  });
});

describe('agent loop', () => {
  it('runs the tools the model calls, feeds the results back, and returns the model reply', async () => {
    const llm = new ScriptedLLM().calls([call('list_records', { kind: 'medication' })], 'He takes Metformin.');
    const { agent, runtime } = makeAgent(llm);
    const outcome = await agent.run('what medications is he on');
    expect(runtime.listRecords).toHaveBeenCalledWith('medication', undefined);
    expect(outcome.reply).toBe('He takes Metformin.');
    expect(llm.lastToolResults()).toEqual([{ name: 'list_records', ok: true, message: '2 medications.', data: [{ id: 'med-1', label: 'Metformin' }] }]);
    // The model saw the CONTEXT block and the utterance.
    expect(llm.requests[0].at(-1)?.content).toMatch(/CONTEXT[\s\S]*selected patient: John Smith[\s\S]*SAID: what medications is he on/);
  });

  it('after an action the model decides whether the request has more parts — here it is done', async () => {
    const llm = new ScriptedLLM().calls([call('open_page', { page: 'dashboard' })], 'Your dashboard is open.');
    const { agent, runtime } = makeAgent(llm);
    const outcome = await agent.run('go to my dashboard');
    expect(runtime.openPage).toHaveBeenCalledWith('dashboard');
    expect(llm.requests).toHaveLength(2);
    expect(outcome.reply).toBe('Your dashboard is open.');
  });

  it('a multi-part request is carried out step by step: page, patient, then the form', async () => {
    const llm = new ScriptedLLM().then(
      { calls: [call('open_page', { page: 'patients' })] },
      { calls: [call('select_patient', { patient: 'James Ahmed' })] },
      { calls: [call('add_tasks', { tasks: [{ title: 'Blood pressure monitoring' }] })] },
    );
    const { agent, runtime } = makeAgent(llm, {
      selectPatient: vi.fn(async () => ({ ok: true, message: 'James Ahmed is selected; their Summary is open.' })),
      createRecords: vi.fn(async () => ({ ok: true, message: 'The task form is open — confirm to save.', awaitUser: true })),
    });
    const outcome = await agent.run('go to patients and select james ahmed and create a task for blood pressure monitoring');
    expect(runtime.openPage).toHaveBeenCalledWith('patients');
    expect(runtime.selectPatient).toHaveBeenCalledWith(expect.objectContaining({ patient: 'James Ahmed' }));
    expect(runtime.createRecords).toHaveBeenCalledWith('task', [{ title: 'Blood pressure monitoring' }]);
    expect(llm.requests).toHaveLength(3);
    expect(outcome.awaitingUser).toBe(true);
  });

  it('a batch that mixes an action with a lookup goes back to the model', async () => {
    const llm = new ScriptedLLM().calls([call('open_page', { page: 'summary' }), call('list_records', { kind: 'medication' })], 'Two medications.');
    const { agent } = makeAgent(llm);
    const outcome = await agent.run('open his chart and tell me his meds');
    expect(llm.requests).toHaveLength(2);
    expect(outcome.reply).toBe('Two medications.');
  });

  it('a failed action is never the answer: the model sees the error', async () => {
    const llm = new ScriptedLLM().calls([call('open_page', { page: 'summary' })], 'Please select a patient first.');
    const { agent } = makeAgent(llm, { openPage: vi.fn(async () => ({ ok: false, message: 'No patient is selected.' })) });
    const outcome = await agent.run('open the summary');
    expect(llm.requests).toHaveLength(2);
    expect(outcome.reply).toBe('Please select a patient first.');
  });

  it('a call that keeps giving the same result is a loop: the model is told once, then the turn ends', async () => {
    const search = call('open_page', { page: 'patients' });
    const llm = new ScriptedLLM().then({ calls: [search] }, { calls: [search] }, { calls: [search] }, { calls: [search] }, { content: 'never reached' });
    const { agent, runtime } = makeAgent(llm);
    const outcome = await agent.run('find gems ml');
    expect(runtime.openPage).toHaveBeenCalledTimes(3);
    expect(llm.requests[2].at(-1)?.content).toMatch(/Same call, same result as before/);
    expect(outcome.reply).toBe('Opened patients.');
    expect(outcome.speak).toBe(true);
  });

  it('repeating a call whose result changes is progress, not a loop ("next page" twice)', async () => {
    let page = 1;
    const next = call('control_list', { page: 'next' });
    const llm = new ScriptedLLM().then({ calls: [next] }, { calls: [next] }, { calls: [next] }, { content: 'On page 4.' });
    const { agent } = makeAgent(llm, { controlList: vi.fn(async () => ({ ok: true, message: `Page ${++page}.` })) });
    expect((await agent.run('three pages forward')).reply).toBe('On page 4.');
  });

  it('invalid arguments go back to the model as an error it can correct — nothing runs', async () => {
    const llm = new ScriptedLLM().then({ calls: [call('open_page', { page: 'the moon' })] }, { calls: [call('open_page', { page: 'patients' })] }, { content: 'The patient list is open.' });
    const { agent, runtime } = makeAgent(llm);
    const outcome = await agent.run('show patients');
    expect(runtime.openPage).toHaveBeenCalledTimes(1);
    expect(runtime.openPage).toHaveBeenCalledWith('patients');
    const firstResults = llm.requests[1].filter((m) => m.role === 'tool');
    expect(firstResults[0].content).toMatch(/Invalid arguments for open_page/);
    expect(outcome.reply).toBe('The patient list is open.');
  });

  it('an unknown tool is reported back, not crashed on', async () => {
    const llm = new ScriptedLLM().calls([call('launch_rockets')], 'Sorry, I cannot do that.');
    const { agent } = makeAgent(llm);
    await agent.run('launch');
    expect(llm.lastToolResults()[0].message).toMatch(/There is no tool "launch_rockets"/);
  });

  it('ends the turn as soon as the app needs the user (a question or a confirmation)', async () => {
    const llm = new ScriptedLLM().then({ calls: [call('add_medications', { medications: [{ medicationName: 'Aspirin' }] }), call('open_page', { page: 'dashboard' })] });
    const { agent, runtime } = makeAgent(llm);
    const outcome = await agent.run('add aspirin');
    expect(outcome.awaitingUser).toBe(true);
    expect(outcome.reply).toMatch(/Review it, then confirm/);
    expect(runtime.openPage).not.toHaveBeenCalled(); // the rest waits for the user's answer
    expect(llm.requests).toHaveLength(1);
  });

  it('several tools in one turn run in order', async () => {
    const order: string[] = [];
    const llm = new ScriptedLLM().calls([call('open_page', { page: 'summary' }), call('list_records', { kind: 'medication' })], 'He takes Metformin.');
    const { agent } = makeAgent(llm, {
      openPage: vi.fn(async () => (order.push('open'), { ok: true, message: 'ok' })),
      listRecords: vi.fn(async () => (order.push('list'), { ok: true, message: 'ok', data: [] })),
    });
    await agent.run('open his chart and tell me his meds');
    expect(order).toEqual(['open', 'list']);
  });

  it('an unfinished fragment is deferred: nothing runs', async () => {
    const llm = new ScriptedLLM().then({ calls: [call('wait_for_more_speech')] });
    const { agent, runtime } = makeAgent(llm);
    const outcome = await agent.run('and then I want to');
    expect(outcome.deferred).toBe(true);
    expect(runtime.openPage).not.toHaveBeenCalled();
  });

  it('stops after maxSteps model calls', async () => {
    const llm = new ScriptedLLM();
    for (let i = 0; i < 10; i++) llm.then({ calls: [call('list_records', { kind: 'task' })] });
    // Each result differs, so the loop guard does not step in: only maxSteps ends it.
    let n = 0;
    const { agent } = makeAgent(llm, { listRecords: vi.fn(async () => ({ ok: true, message: `${++n} tasks.` })) });
    const outcome = await agent.run('loop forever');
    expect(llm.requests).toHaveLength(6);
    expect(outcome.reply).toBe('6 tasks.');
  });

  it('gives the model the second recogniser\'s version when it differs — and not when it says the same', async () => {
    const llm = new ScriptedLLM().then({ content: 'Selected.' }, { content: 'Done.' });
    const { agent } = makeAgent(llm);
    await agent.run('select patient gems and milk', {}, undefined, 'Select patient James Ahmed.');
    expect(llm.requests[0].at(-1)?.content).toMatch(/SAID: select patient gems and milk\nALSO HEARD: Select patient James Ahmed\.$/);
    await agent.run('go to patients', {}, undefined, 'Go to patients.');
    expect(llm.requests[1].at(-1)?.content).toMatch(/SAID: go to patients$/);
  });

  it('remembers recent exchanges inside CONTEXT, so follow-ups make sense and the prompt keeps its shape', async () => {
    const llm = new ScriptedLLM().then({ content: 'Hello!' }, { content: 'Yes.' });
    const { agent } = makeAgent(llm);
    await agent.run('hello');
    await agent.run('are you there');
    const [first, second] = llm.requests;
    // Same layout every time: system, the day's SESSION exchange, then this utterance.
    expect(second.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(second.slice(0, 3)).toEqual(first.slice(0, 3));
    expect(second[1].content).toMatch(/^SESSION\ntoday: /);
    expect(second[3].content).toMatch(/earlier: "hello" → Hello!\n\nSAID: are you there$/);
  });

  it('extracts a clinical note through record_note_findings, retrying when the model does not call it', async () => {
    const llm = new ScriptedLLM().then(
      { content: 'Sure, here you go.' },
      {
        calls: [
          call('record_note_findings', {
            medications: [{ medicationName: 'Amlodipine', dosage: '5 mg', frequency: 'once daily', quote: 'start amlodipine 5 mg once daily' }],
            diagnoses: [{ description: 'Hypertension', status: 'Active' }],
            questions: ['Which pharmacy?'],
          }),
        ],
      },
    );
    const { agent } = makeAgent(llm);
    const result = await agent.extractNote('BP high, start amlodipine 5 mg once daily, hypertension.');
    expect(llm.requests).toHaveLength(2);
    expect(llm.requests[0].at(-1)?.content).toMatch(/TASK: EXTRACT/);
    expect(result.items.medication).toEqual([{ fields: { medicationName: 'Amlodipine', dosage: '5 mg', frequency: 'Once daily' }, quote: 'start amlodipine 5 mg once daily' }]);
    expect(result.items.diagnosis[0].fields.description).toBe('Hypertension');
    expect(result.questions).toEqual(['Which pharmacy?']);
  });
});
