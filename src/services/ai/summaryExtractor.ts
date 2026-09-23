/**
 * AI Summary extraction.
 *
 * A clinician dictates one paragraph that mixes medication, diagnosis, task,
 * recall and appointment information. The local Qwen model turns it into
 * structured items, which are shown for review — nothing is written to the
 * patient record until the user saves each item.
 *
 * When no model is reachable the same job is done deterministically by the
 * rule-based parsers, so the feature never degrades into a dead button.
 */
import dayjs from 'dayjs';
import type { ExtractedItem, ExtractionResult, FieldValues, LLMProvider } from '@/types/ai';
import { FieldRegistry } from '@/registry/fieldRegistry';
import { parseAppointmentPhrase, parseMedicationList, parseRecallPhrase } from './ruleBasedInterpreter';
import { parseDateTime } from './dateParser';

export type ExtractionKind = 'medication' | 'diagnosis' | 'task' | 'recall' | 'appointment';
export const extractionKinds: ExtractionKind[] = ['medication', 'diagnosis', 'task', 'recall', 'appointment'];

const emptyItems = (): ExtractionResult['items'] => ({ medication: [], diagnosis: [], task: [], recall: [], appointment: [] });

export function buildExtractionPrompt(): string {
  const fields = (formId: string) =>
    FieldRegistry.getForm(formId)!
      .fields.filter((f) => !['notes', 'description'].includes(f.name) || formId === 'diagnosis')
      .map((f) => f.name)
      .join('|');

  return `You read a clinician's dictated paragraph about ONE patient and extract the actions it contains.
Return ONLY JSON: {"medication":[],"diagnosis":[],"task":[],"recall":[],"appointment":[],"questions":[]}

RULES
- Extract only what the clinician actually said. Never invent a drug, dose, date, diagnosis or name.
- Omit any field that was not said. An empty array is correct when that category was not mentioned.
- Put the exact words each item came from in "quote".
- Dates: absolute YYYY-MM-DD, resolved against TODAY in the user message ("next week" = TODAY + 7 days, "in two weeks" = TODAY + 14 days, "after three months" = TODAY + 3 months). Times: HH:mm (24h).
- Normalize: "twice a day"->"Twice daily", "orally"->"Oral", "500 milligrams"->"500 mg", "seven days"->"7 days".
- A follow-up VISIT with a date/time is an appointment. "Bring the patient back / recall / review in X" is a recall. Something a staff member must do is a task.
- If something is ambiguous or clinically significant but incomplete, add a short question to "questions" instead of guessing.

ITEM FIELDS
medication: ${fields('medication')}
diagnosis: ${fields('diagnosis')}
task: ${fields('task')}
recall: ${fields('recall')}
appointment: ${fields('appointment')}

EXAMPLE (TODAY = 2026-01-10)
Paragraph: "Start the patient on metformin 500 mg twice daily for 30 days, schedule a follow-up appointment next week, add hypertension as a diagnosis, create a task for blood pressure monitoring, and recall the patient after two weeks."
{"medication":[{"medicationName":"Metformin","dosage":"500 mg","frequency":"Twice daily","duration":"30 days","quote":"metformin 500 mg twice daily for 30 days"}],
"diagnosis":[{"description":"Hypertension","status":"Active","quote":"add hypertension as a diagnosis"}],
"task":[{"title":"Blood pressure monitoring","category":"Monitoring","quote":"create a task for blood pressure monitoring"}],
"recall":[{"reason":"Patient recall","type":"Follow-up","dueDate":"2026-01-24","quote":"recall the patient after two weeks"}],
"appointment":[{"date":"2026-01-17","type":"Follow-up","reason":"Follow-up","quote":"schedule a follow-up appointment next week"}],
"questions":[]}`;
}

/** Strip code fences / prose the model may wrap around the JSON. */
function parseJsonLoose(raw: string): Record<string, unknown> | null {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Keep only fields the target form actually has, normalized to the values the form expects. */
function sanitize(kind: ExtractionKind, raw: Record<string, unknown>): ExtractedItem | null {
  const fields: FieldValues = {};
  let quote: string | undefined;
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined || value === '') continue;
    if (key === 'quote') {
      quote = String(value);
      continue;
    }
    const field = FieldRegistry.resolveField(kind, key);
    if (!field) continue;
    if (typeof value === 'object') continue;
    fields[field.name] = FieldRegistry.normalizeValue(field, value as string | number | boolean);
  }
  return Object.keys(fields).length ? { fields, quote } : null;
}

const CATEGORY_PATTERNS: Array<[ExtractionKind, RegExp, number]> = [
  ['appointment', /\b(appointment|book (?:her|him|them)?|schedule (?:a|an|the)?\s*(?:follow[- ]?up|visit|consult)|see (?:her|him|them) (?:on|at)|visit on)\b/i, 3],
  ['recall', /\b(recall|bring (?:her|him|them) back|call (?:her|him|them) back in|review in|repeat (?:the )?(?:labs|bloods|test)|screening|remind (?:the )?patient)\b/i, 3],
  ['task', /\b(task|to-?do|monitor|monitoring|chase|arrange|make sure|check (?:her|his|their)|send (?:a )?(?:letter|referral)|follow[- ]?up call|educate)\b/i, 2],
  ['diagnosis', /\b(diagnos\w*|problem list|condition|has been diagnosed|add .* as a (?:diagnosis|problem))\b/i, 3],
  ['medication', /\b(start\w*|prescrib\w*|give|commence|continue|stop|increase|decrease|medication|tablet|capsule|mg|mcg|daily|twice|three times|bd|tds|prn)\b/i, 2],
];

/** Split a dictated paragraph into the clauses that each carry one instruction. */
export function splitDictation(text: string): string[] {
  return text
    .split(/[.;!?\n]+|,?\s+and then\s+|,\s*(?=(?:also|then|next|please|add|start|create|schedule|book|recall|remind|set)\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

const CONDITION_WORDS = /\b(hypertension|diabetes|asthma|copd|anaemia|anemia|depression|anxiety|migraine|obesity|hyperlipidemia|hypothyroidism|arthritis|gerd|reflux|infection|pneumonia|uti|ckd|atrial fibrillation)\b/i;

/** Deterministic extraction — used when no model is reachable, and to sanity-check the model. */
export function extractWithRules(transcript: string): ExtractionResult['items'] {
  const items = emptyItems();
  for (const clause of splitDictation(transcript)) {
    const lower = clause.toLowerCase();
    let best: ExtractionKind | null = null;
    let bestScore = 0;
    for (const [kind, pattern, weight] of CATEGORY_PATTERNS) {
      if (!pattern.test(lower)) continue;
      // A dose or an explicit condition name is strong evidence, whatever else the clause says.
      const bonus = (kind === 'medication' && /\d+\s*(mg|mcg|g|ml|units?)\b/i.test(lower) ? 3 : 0) + (kind === 'diagnosis' && CONDITION_WORDS.test(lower) && /diagnos/i.test(lower) ? 3 : 0);
      const score = weight + bonus;
      if (score > bestScore) {
        bestScore = score;
        best = kind;
      }
    }
    if (!best) continue;

    switch (best) {
      case 'medication': {
        const phrase = clause.replace(/^.*?\b(?:start(?:ing)?|prescrib\w*|give|commence|continue|add|put (?:her|him|them) on|on)\b\s*/i, '').replace(/\bthe patient on\b/i, '');
        for (const med of parseMedicationList(phrase)) {
          const item = sanitize('medication', med as Record<string, unknown>);
          if (item?.fields.medicationName) items.medication.push({ ...item, quote: clause });
        }
        break;
      }
      case 'diagnosis': {
        const m = clause.match(/(?:diagnosis of|diagnosed with|add)\s+(.+?)(?:\s+(?:as a |to the )?(?:diagnosis|problem list).*)?$/i);
        const description = (m?.[1] ?? clause).replace(/\b(a|an|the|as|patient|new)\b/gi, ' ').replace(/\s+/g, ' ').trim();
        const item = sanitize('diagnosis', { description, status: 'Active' });
        if (item) items.diagnosis.push({ ...item, quote: clause });
        break;
      }
      case 'task': {
        const dt = parseDateTime(clause);
        const title = (dt.rest || clause)
          .replace(/^.*?\b(?:create|add|make|set up|raise)\b\s*(?:a |an )?(?:task|to-?do)\b\s*(?:for|to|:)?\s*/i, '')
          .replace(/^\s*(?:please|and)\s+/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        const item = sanitize('task', { title: title || clause, dueDate: dt.date, category: /monitor/i.test(clause) ? 'Monitoring' : undefined });
        if (item) items.task.push({ ...item, quote: clause });
        break;
      }
      case 'recall': {
        const fields = parseRecallPhrase(clause.replace(/^.*?\brecall\b\s*(?:the\s+)?(?:patient)?\s*/i, ''));
        if (!fields.reason || String(fields.reason).length < 3) fields.reason = 'Patient recall';
        const item = sanitize('recall', fields as Record<string, unknown>);
        if (item) items.recall.push({ ...item, quote: clause });
        break;
      }
      case 'appointment': {
        const fields = parseAppointmentPhrase(clause);
        delete fields.patientName; // the appointment always belongs to the selected patient
        if (!fields.reason) fields.reason = /follow/i.test(clause) ? 'Follow-up' : 'Consultation';
        const item = sanitize('appointment', fields as Record<string, unknown>);
        if (item) items.appointment.push({ ...item, quote: clause });
        break;
      }
    }
  }
  return items;
}

/**
 * Extract structured items from a dictated paragraph, preferring the local Qwen
 * model and falling back to the deterministic parsers.
 */
export async function extractFromTranscript(transcript: string, llm: LLMProvider): Promise<ExtractionResult> {
  const text = transcript.trim();
  if (!text) return { transcript: '', provider: 'none', items: emptyItems(), questions: [], raw: '' };

  if (llm.complete) {
    try {
      const raw = await llm.complete(buildExtractionPrompt(), `TODAY: ${dayjs().format('YYYY-MM-DD')}\nParagraph: ${text}`);
      const parsed = parseJsonLoose(raw);
      if (parsed) {
        const items = emptyItems();
        for (const kind of extractionKinds) {
          // The model may use either the singular key or the plural one.
          const list = (parsed[kind] ?? parsed[`${kind}s`] ?? (kind === 'diagnosis' ? parsed.diagnoses : undefined)) as unknown;
          if (!Array.isArray(list)) continue;
          for (const entry of list) {
            if (!entry || typeof entry !== 'object') continue;
            const item = sanitize(kind, entry as Record<string, unknown>);
            if (item) items[kind].push(item);
          }
        }
        const questions = Array.isArray(parsed.questions) ? (parsed.questions as unknown[]).map(String).filter(Boolean) : [];
        const found = extractionKinds.reduce((n, k) => n + items[k].length, 0);
        // An empty model answer on a paragraph that clearly contains instructions is a model
        // failure, not an empty paragraph — fall back rather than show the user nothing.
        if (found > 0) return { transcript: text, provider: llm.name, items, questions, raw };
      }
    } catch {
      /* fall through to the deterministic path */
    }
  }

  const items = extractWithRules(text);
  return { transcript: text, provider: 'rules (deterministic)', items, questions: [], raw: '' };
}
