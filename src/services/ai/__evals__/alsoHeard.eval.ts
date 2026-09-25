/**
 * Does a second recogniser's version help the model? The provider's own recorded commands, as the
 * live bridge heard them (Omi = SAID, Whisper base.en + the app's vocabulary = ALSO HEARD): the
 * model's first tool calls with SAID only, and with both.
 *
 *   npm run eval:llm -- alsoHeard
 */
import { it } from 'vitest';
import dayjs from 'dayjs';
import * as db from '@/services/mock/mockDb';
import { OllamaChat, type ChatMessage } from '@/services/ai/providers/llm';
import { buildTools } from '@/services/ai/agent/tools';
import { toToolSchema } from '@/services/ai/agent/tool';
import { buildSessionMessage, buildUserMessage, SESSION_ACK, SYSTEM_PROMPT } from '@/services/ai/agent/prompt';
import type { AIContext } from '@/types/ai';

const MODEL = process.env.EVAL_MODEL ?? 'qwen3.5:4b';

// [what was said, SAID (Omi, live), ALSO HEARD (Whisper base.en + vocabulary, live)]
const HEARD: Array<[string, string, string]> = [
  ['Select patient James Ahmed', 'Select patient gems and milk.', 'I see that patient, James Ahmed.'],
  ['Select patient Fatima Malik', 'Select patient pharma voluntek', 'Select patient for normal look.'],
  ['Select patient Sarah Johnson', 'Select Patient Sara John Sun', 'Select patient, Sarah Jones, Senator.'],
  ['Add metformin 500 mg twice daily for 10 days. Add amlodipine', 'Add matfolmin 500mg twice daily for 10 days. Add amlodepine', 'Admaxone means I want an Mg twice daily for 10 days, and Amlodipine.'],
  ['Add type 2 diabetes mellitus. Add hypertension as a diagnosis', 'Add type 2 diabetes militias add hypertension as a diagnosis.', 'Type 2 diabetes mellitus, and Hypertension as a diagnosis.'],
  ['Go to patients and select James Ahmed and go to inbox and select first record', 'Go to Patients and select James Ambrose and go to Inbox and select first report.', 'Go to patients and select games and go to indoors and select first report.'],
  ['File this record', 'File this is the code.', 'Find this requirement.'],
  ['Unfile this record', 'unforgiving cord', "And so I'll just record."],
  ['Add hyperlipidemia', 'Add hyperlipidemia', 'And Hyperlipidemia.'],
  ['Add metformin 500 mg twice daily for 10 days', 'Admetsormin Admetsormin Admetsormin 500mg twice daily for 10 days', 'And next week, they have Metformin, and Metformin 500 and G2 is there in four tendings.'],
  ['Go to patients and select James Ahmed and create a task for blood pressure monitoring', 'Go to patients and select gems animals and create a task force monitoring.', 'Go to patients and select gyms and carry it to 10 hours. Go to patients and carry it to 10 hours. Go to patients and select gyms and carry it to 10 hours.'],
  ['Open the inbox', 'Open the inbox', 'Open their inbox.'],
];

it('SAID alone vs SAID + ALSO HEARD', async () => {
  const llm = new OllamaChat({ provider: 'ollama', apiUrl: 'http://127.0.0.1:11434', model: MODEL, timeoutMs: 600000, numGpu: 99, numCtx: 12288, maxSteps: 8 });
  llm.dispose();
  const tools = buildTools().map(toToolSchema);
  const t = dayjs();
  const patient = db.patients.find((p) => p.fullName === 'John Smith')!;
  const ctx = (page: string): AIContext => ({
    today: t.format('YYYY-MM-DD (dddd)'), nextDays: '', laterDates: '', now: t.format('HH:mm'), providerName: db.providers[0].fullName,
    currentPageId: page, currentPageTitle: page, currentPatientId: page === 'inbox-lab' ? patient.id : page === 'summary' ? patient.id : null, currentPatientName: page === 'patients' ? null : patient.fullName,
    openForm: null, pendingQuestion: null, pendingConfirmation: null, inbox: page === 'inbox-lab' ? { view: 'lab', items: 6, openItem: 'CBC with differential', query: '' } : null,
    patientSearch: null, list: null, extracted: null, carePlan: null,
  }) as AIContext;
  const prefix: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildSessionMessage(ctx('dashboard')) }, { role: 'assistant', content: SESSION_ACK }];
  await llm.warmUp(prefix, tools);
  const show = (calls: Array<{ name: string; arguments: unknown }>, content: string) => calls.map((c) => `${c.name}(${JSON.stringify(c.arguments)})`).join(' ; ') || `text: ${content.slice(0, 80)}`;
  for (const [truth, said, alt] of HEARD) {
    const page = /file|unfile/i.test(truth) ? 'inbox-lab' : /^select|^go to/i.test(truth) ? 'patients' : 'summary';
    const a = await llm.chat([...prefix, { role: 'user', content: buildUserMessage(said, ctx(page)) }], tools);
    const b = await llm.chat([...prefix, { role: 'user', content: buildUserMessage(said, ctx(page), [], alt) }], tools);
    console.log(`\nTRUTH  ${truth}\n  SAID only : ${show(a.toolCalls, a.content)}\n  + ALSO    : ${show(b.toolCalls, b.content)}`);
  }
}, 1800000);
