/**
 * Live evaluation of the model's tool choices — runs against the real local
 * Qwen (Ollama), not a mock. Each case gives the model an utterance and a
 * CONTEXT exactly as the app would, and checks the first tool calls it makes.
 *
 *   npm run eval:llm                       (Ollama at http://127.0.0.1:11434, qwen3.5:4b)
 *   EVAL_LLM_MODEL=qwen3.5:4b EVAL_ONLY=med npm run eval:llm
 *
 * It prints a table of every case (pass/fail, latency, what the model called)
 * and fails if the pass rate drops below EVAL_MIN_PASS (default 0.85).
 */
import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import * as db from '@/services/mock/mockDb';
import type { AIContext, ToolCall } from '@/types/ai';
import { OllamaChat, type ChatMessage } from '../providers/llm';
import { buildTools } from '../agent/tools';
import { toToolSchema } from '../agent/tool';
import { buildUserMessage, SYSTEM_PROMPT } from '../agent/prompt';

const today = dayjs();
const iso = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');
const nextWeekday = (day: number) => {
  const d = today.day();
  return today.add(((day - d + 7) % 7) || 7, 'day');
};

const patient = db.patients[3];
const provider = db.providers[0];

const baseContext = (over: Partial<AIContext> = {}): AIContext => ({
  today: today.format('YYYY-MM-DD (dddd)'),
  nextDays: Array.from({ length: 7 }, (_, i) => today.add(i + 1, 'day').format('ddd YYYY-MM-DD')).join(', '),
  laterDates: [...[1, 2, 3, 4].map((n) => `${n} week${n > 1 ? 's' : ''} ${today.add(n, 'week').format('YYYY-MM-DD')}`), ...[1, 2, 3, 6].map((n) => `${n} month${n > 1 ? 's' : ''} ${today.add(n, 'month').format('YYYY-MM-DD')}`), `1 year ${today.add(1, 'year').format('YYYY-MM-DD')}`].join(', '),
  now: '10:30',
  providerName: provider.fullName,
  currentPageId: 'summary',
  currentPageTitle: 'Summary',
  currentPatientId: patient.id,
  currentPatientName: patient.fullName,
  openForm: null,
  pendingQuestion: null,
  pendingConfirmation: null,
  inbox: null,
  patientSearch: null,
  list: null,
  extracted: null,
  carePlan: null,
  ...over,
});

type Check = (calls: ToolCall[]) => string | null;
interface Case {
  id: string;
  said: string;
  context?: Partial<AIContext>;
  check: Check;
  /**
   * When the model looks something up first, the tool result it gets back — the eval then
   * continues one more model step and checks the calls made after seeing it.
   */
  lookup?: Record<string, unknown>;
}

const first = (calls: ToolCall[]) => calls[0];
const named = (name: string, more?: (c: ToolCall) => string | null): Check => (calls) => {
  const c = calls.find((x) => x.name === name);
  if (!c) return `expected ${name}, got ${calls.map((x) => x.name).join(', ') || 'no tool'}`;
  return more ? more(c) : null;
};
const arg = (c: ToolCall, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], c.arguments);
const eq = (path: string, value: unknown) => (c: ToolCall) => (String(arg(c, path)).toLowerCase() === String(value).toLowerCase() ? null : `${path}: expected ${value}, got ${JSON.stringify(arg(c, path))}`);
const all = (...checks: Array<(c: ToolCall) => string | null>) => (c: ToolCall) => checks.map((f) => f(c)).find(Boolean) ?? null;
const includes = (path: string, text: string) => (c: ToolCall) => (String(arg(c, path) ?? '').toLowerCase().includes(text.toLowerCase()) ? null : `${path}: expected to contain "${text}", got ${JSON.stringify(arg(c, path))}`);

const medForm = { id: 'medication', values: { medicationName: 'Metformin', dosage: '500 mg' }, entries: 1 };

const cases: Case[] = [
  { id: 'nav-dashboard', said: 'open the dashboard', context: { currentPatientId: null, currentPatientName: null, currentPageId: 'patients', currentPageTitle: 'Patients' }, check: named('open_page', eq('page', 'dashboard')) },
  { id: 'nav-patients', said: 'go to patients', check: named('open_page', eq('page', 'patients')) },
  {
    id: 'nav-tab',
    said: 'show me the diagnosis tab',
    check: (calls) => (calls.some((c) => (c.name === 'open_page' && arg(c, 'page') === 'summary-diagnosis') || (c.name === 'select_patient' && arg(c, 'open_tab') === 'summary-diagnosis')) ? null : `expected the diagnosis tab, got ${calls.map((c) => c.name).join(', ')}`),
  },
  {
    id: 'select-patient',
    said: `select patient ${db.patients[10].fullName}`,
    context: { currentPatientId: null, currentPatientName: null },
    check: (calls) => (calls.some((c) => (c.name === 'select_patient' || c.name === 'search_patients') && String(c.arguments.patient ?? c.arguments.query ?? '').includes(db.patients[10].lastName)) ? null : `expected select/search for ${db.patients[10].fullName}, got ${JSON.stringify(calls)}`),
  },
  { id: 'search-patient', said: 'find patient khan', check: named('search_patients', includes('query', 'khan')) },
  {
    id: 'med-spoken',
    said: 'add metformin 500 milligrams two times a day for ten days',
    check: named('add_medications', all(eq('medications.0.medicationName', 'Metformin'), eq('medications.0.dosage', '500 mg'), eq('medications.0.frequency', 'Twice daily'), eq('medications.0.duration', '10 days'))),
  },
  {
    id: 'med-two',
    said: 'add panadol and ibuprofen 400 mg three times a day',
    check: named('add_medications', (c) => ((arg(c, 'medications') as unknown[] | undefined)?.length === 2 ? eq('medications.1.frequency', 'Three times daily')(c) : `expected 2 medications, got ${JSON.stringify(arg(c, 'medications'))}`)),
  },
  { id: 'med-stt-artifact', said: 'Admetformin 500 mg twice daily for 10 days.', check: named('add_medications', all(eq('medications.0.medicationName', 'Metformin'), eq('medications.0.frequency', 'Twice daily'))) },
  { id: 'diagnosis', said: 'add hypertension as a diagnosis', check: named('add_diagnoses', includes('diagnoses.0.description', 'hypertension')) },
  { id: 'task-date', said: 'create a task for blood pressure monitoring due on friday', check: named('add_tasks', all(includes('tasks.0.title', 'blood pressure'), eq('tasks.0.dueDate', iso(nextWeekday(5))))) },
  { id: 'task-tomorrow', said: 'create a task to follow up the lab results by tomorrow', check: named('add_tasks', eq('tasks.0.dueDate', iso(today.add(1, 'day')))) },
  { id: 'recall', said: 'recall the patient in two weeks for a blood pressure review', check: named('add_recalls', all(eq('recalls.0.dueDate', iso(today.add(14, 'day'))), includes('recalls.0.reason', 'blood pressure'))) },
  { id: 'appointment', said: 'book a follow up appointment next tuesday at 3 pm for chest pain', check: named('add_appointments', all(eq('appointments.0.date', iso(nextWeekday(2))), eq('appointments.0.startTime', '15:00'))) },
  {
    id: 'confirm-yes',
    said: 'yes save it',
    context: { openForm: { ...medForm, values: { ...medForm.values, frequency: 'Twice daily' } }, pendingConfirmation: { kind: 'form', description: 'Save this medication to the patient record: Medication Metformin, Dosage 500 mg' } },
    check: (calls) => (calls.some((c) => c.name === 'confirm_pending_action' || c.name === 'save_open_form') ? null : `expected the save to be confirmed, got ${calls.map((c) => c.name).join(', ')}`),
  },
  { id: 'confirm-go-ahead', said: 'yes go ahead', context: { pendingConfirmation: { kind: 'delete', description: 'Permanently delete this medication: Medication Metformin' } }, check: named('confirm_pending_action') },
  { id: 'cancel', said: 'no cancel that', context: { openForm: medForm, pendingConfirmation: { kind: 'form', description: 'Save this medication to the patient record' } }, check: named('cancel_pending_action') },
  { id: 'no-self-confirm', said: 'add aspirin 75 mg once daily', check: (calls) => (calls.some((c) => c.name === 'confirm_pending_action') ? 'confirmed without the user' : named('add_medications')(calls)) },
  {
    id: 'answer-question',
    said: 'twice a day',
    context: { openForm: medForm, pendingQuestion: { formId: 'medication', field: 'frequency', question: 'What frequency?' } },
    check: named('fill_open_form', eq('frequency', 'Twice daily')),
  },
  {
    id: 'my-schedule',
    said: 'when is my next appointment today',
    check: (calls) => (calls.some((c) => c.name === 'get_provider_overview' || c.name === 'dashboard_summary_panel') ? null : `expected the provider's day, got ${calls.map((c) => c.name).join(', ')}`),
  },
  { id: 'add-patient-intent', said: 'I want to add patient', context: { currentPageId: 'patients', currentPageTitle: 'Patients', currentPatientId: null, currentPatientName: null }, check: named('create_patient') },
  { id: 'dashboard-summary', said: 'give me my dashboard summary', check: named('dashboard_summary_panel', eq('open', true)) },
  { id: 'open-dashboard-summary', said: 'Open dashboard summary.', check: named('dashboard_summary_panel', eq('open', true)) },
  { id: 'switch-model', said: 'switch the language model to qwen 3.5 2b', check: named('set_language_model', includes('model', '2b')) },
  { id: 'speech-pause', said: 'make the speech pause 1.2 seconds', check: named('set_speech_recognition', eq('pause_ms', 1200)) },
  { id: 'which-models', said: 'which AI models are available', check: named('get_ai_configuration') },
  {
    id: 'list-filter',
    said: 'show only the active medications',
    context: { currentPageId: 'summary-medication', currentPageTitle: 'Medications', list: { name: 'medications', shown: 14, total: 14, page: 1, pageCount: 2, search: '', filters: {}, filterable: 'Status (Active|Completed|Discontinued|On Hold), Route (Oral|Intravenous|Topical)' } },
    check: (calls) => {
      const c = calls.find((x) => x.name === 'control_list');
      if (c) return all(includes('filter', 'status'), eq('value', 'Active'))(c);
      return calls.some((x) => x.name === 'list_records' && arg(x, 'status') === 'Active') ? null : `expected control_list, got ${JSON.stringify(calls)}`;
    },
  },
  {
    id: 'list-next-page',
    said: 'next page',
    context: { currentPageId: 'patients', currentPageTitle: 'Patients', list: { name: 'patients', shown: 96, total: 96, page: 1, pageCount: 10, search: '', filters: {}, filterable: 'Status (Active|Inactive), Gender (Male|Female)' } },
    check: named('control_list', eq('page', 'next')),
  },
  { id: 'add-extracted', said: 'add the medication from the summary', context: { currentPageId: 'summary-ai', currentPageTitle: 'AI Summary', extracted: 'medication ×1, diagnosis ×1' }, check: named('add_extracted_item', eq('kind', 'medication')) },
  { id: 'sign-out', said: 'sign me out', check: named('sign_out') },
  { id: 'inbox-open-page', said: 'Open the inbox.', check: (calls) => (calls.some((c) => c.name === 'inbox_show' || (c.name === 'open_page' && String(arg(c, 'page')).startsWith('inbox'))) ? null : `expected the inbox, got ${calls.map((c) => c.name).join(', ')}`) },
  { id: 'inbox-radiology', said: 'show me the radiology reports', check: named('inbox_show', eq('category', 'radiology')) },
  { id: 'inbox-search', said: 'search hemoglobin in the inbox', context: { currentPageId: 'inbox-all', currentPageTitle: 'Inbox — All', inbox: { view: 'all', items: 7, openItem: null, query: '' } }, check: named('inbox_show', includes('search', 'hemoglobin')) },
  { id: 'inbox-file', said: 'file this one', context: { currentPageId: 'inbox-lab', currentPageTitle: 'Inbox — Lab', inbox: { view: 'lab', items: 5, openItem: 'CBC with differential', query: '' } }, check: named('inbox_file_item', eq('file', true)) },
  { id: 'inbox-next', said: 'next record', context: { currentPageId: 'inbox-lab', currentPageTitle: 'Inbox — Lab', inbox: { view: 'lab', items: 5, openItem: 'CBC with differential', query: '' } }, check: named('inbox_open_item', eq('target', 'next')) },
  { id: 'inbox-back', said: 'go back to the list', context: { currentPageId: 'inbox-lab', currentPageTitle: 'Inbox — Lab', inbox: { view: 'lab', items: 5, openItem: 'CBC with differential', query: '' } }, check: named('go_back') },
  { id: 'inbox-patient', said: 'select this patient', context: { currentPageId: 'inbox-lab', currentPageTitle: 'Inbox — Lab', currentPatientId: null, currentPatientName: null, inbox: { view: 'lab', items: 5, openItem: 'CBC with differential', query: '' } }, check: named('inbox_select_item_patient') },
  { id: 'mute', said: 'stop reading your answers out loud', check: named('spoken_replies', eq('on', false)) },
  { id: 'patient-summary', said: 'give me a summary of this patient', check: named('get_patient_summary') },
  {
    id: 'delete',
    said: 'delete the metformin',
    lookup: { ok: true, message: 'John has 2 medications.', data: [{ id: 'med-7', label: 'Metformin', details: '500 mg · Oral', status: 'Active' }, { id: 'med-9', label: 'Lisinopril', details: '10 mg · Oral', status: 'Active' }] },
    check: named('delete_record', all(eq('kind', 'medication'), (c) => (/metformin|med-7/i.test(String(arg(c, 'record'))) ? null : `record: expected metformin or med-7, got ${JSON.stringify(arg(c, 'record'))}`))),
  },
  {
    id: 'update-task',
    said: 'mark the blood pressure task as completed',
    lookup: { ok: true, message: 'John has 1 open task.', data: [{ id: 'task-3', label: 'Blood pressure monitoring', details: 'Monitoring', status: 'Open' }] },
    check: named('update_record', all(eq('kind', 'task'), eq('changes.status', 'Completed'), (c) => (/blood pressure|task-3/i.test(String(arg(c, 'record'))) ? null : `record: got ${JSON.stringify(arg(c, 'record'))}`))),
  },
  { id: 'med-3x', said: 'paracetamol 500 mg three times a day for five days', check: named('add_medications', all(eq('medications.0.frequency', 'Three times daily'), eq('medications.0.duration', '5 days'))) },
  { id: 'inbox-lab', said: 'show me the lab results in the inbox', check: named('inbox_show', eq('category', 'lab')) },
  { id: 'inbox-open', said: 'open the first one', context: { currentPageId: 'inbox-all', currentPageTitle: 'Inbox — All', inbox: { view: 'all', items: 7, openItem: null, query: '' } }, check: named('inbox_open_item', eq('target', 1)) },
  { id: 'stop', said: 'stop listening', check: named('stop_listening') },
  { id: 'fragment', said: 'and then I want to', check: named('wait_for_more_speech') },
  {
    id: 'note',
    said: 'Patient came in with headaches for two weeks, blood pressure is 160 over 100, start amlodipine 5 mg once daily, add hypertension to the problem list and bring her back in one month to recheck the pressure',
    check: (calls) => (calls.some((c) => c.name === 'take_clinical_note') || (calls.some((c) => c.name === 'add_medications') && calls.some((c) => c.name === 'add_diagnoses')) ? null : `expected take_clinical_note (or the matching add_* calls), got ${calls.map((c) => c.name).join(', ')}`),
  },
];

const MODEL = process.env.EVAL_LLM_MODEL ?? 'qwen3.5:4b';
const URL = process.env.EVAL_LLM_URL ?? 'http://127.0.0.1:11434';
const ONLY = process.env.EVAL_ONLY;
const MIN_PASS = Number(process.env.EVAL_MIN_PASS ?? 0.85);

describe('live model: tool choice', () => {
  it(
    'chooses the right tools',
    async () => {
      const llm = new OllamaChat({ provider: 'ollama', apiUrl: URL, model: MODEL, timeoutMs: 240000, numGpu: 99, numCtx: 12288, maxSteps: 6 });
      llm.dispose();
      const tools = buildTools().map(toToolSchema);
      const selected = cases.filter((c) => !ONLY || c.id.includes(ONLY));
      const rows: Array<{ id: string; pass: boolean; ms: number; prompt?: number; cached?: number; called: string; why?: string }> = [];

      // Warm-up exactly as the app does at start: loads the model and parks the cache checkpoint.
      const started = Date.now();
      await llm.warmUp([{ role: 'system', content: SYSTEM_PROMPT }], tools);
      console.log(`warm-up: ${Date.now() - started} ms, tools ${tools.length}, schema chars ${JSON.stringify(tools).length}`);

      for (const c of selected) {
        const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserMessage(c.said, baseContext(c.context)) }];
        let turn = await llm.chat(messages, tools);
        let steps = 1;
        // A lookup first is allowed: answer it and let the model take its next step.
        if (c.lookup && turn.toolCalls.length && turn.toolCalls.every((t) => t.name === 'list_records')) {
          const first = turn;
          messages.push(
            { role: 'assistant', content: first.content, tool_calls: first.toolCalls.map((t) => ({ function: { name: t.name, arguments: t.arguments } })) },
            ...first.toolCalls.map((t) => ({ role: 'tool' as const, tool_name: t.name, content: JSON.stringify(c.lookup) })),
          );
          turn = await llm.chat(messages, tools);
          turn = { ...turn, usage: { ms: (first.usage?.ms ?? 0) + (turn.usage?.ms ?? 0) } };
          steps = 2;
        }
        const why = c.check(turn.toolCalls);
        rows.push({
          id: c.id,
          pass: !why,
          ms: turn.usage?.ms ?? 0,
          prompt: turn.usage?.promptTokens,
          cached: turn.usage?.cachedTokens,
          called: (steps > 1 ? '[after lookup] ' : '') + (turn.toolCalls.map((t) => `${t.name}(${JSON.stringify(t.arguments)})`).join(' ; ') || `text: ${turn.content.slice(0, 80)}`),
          why: why ?? undefined,
        });
        console.log(`${why ? 'FAIL' : 'pass'}  ${c.id.padEnd(18)} ${String(turn.usage?.ms).padStart(6)} ms  ${rows[rows.length - 1].called}${why ? `\n      -> ${why}` : ''}`);
      }
      const passed = rows.filter((r) => r.pass).length;
      const avg = Math.round(rows.reduce((n, r) => n + r.ms, 0) / rows.length);
      console.log(`\n${passed}/${rows.length} passed (${Math.round((passed / rows.length) * 100)}%), average first-step latency ${avg} ms`);
      console.log(`SUMMARY model=${MODEL} passed=${passed}/${rows.length} avg_ms=${avg} warmup_ms=${Date.now() - started - rows.reduce((n, r) => n + r.ms, 0)} failed=${rows.filter((r) => !r.pass).map((r) => r.id).join(',')}`);
      expect(passed / rows.length).toBeGreaterThanOrEqual(MIN_PASS);
      void first;
    },
    60 * 60 * 1000,
  );
});
