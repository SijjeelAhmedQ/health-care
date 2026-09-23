/**
 * Deterministic natural-language interpreter.
 *
 * Used (a) as the "mock" LLM so the whole voice workflow can be developed and
 * tested without any model running, (b) as the fast path in front of Qwen, and
 * (c) as a safety fallback when the model is unavailable or returns invalid
 * output.
 *
 * It only produces structured AICommands — it never touches the UI.
 */
import dayjs from 'dayjs';
import type { AICommand, AIContext, AIRecordKind, FieldValues } from '@/types/ai';
import { FieldRegistry, FREQUENCY_OPTIONS, normalizeDosage, normalizeDuration } from '@/registry/fieldRegistry';
import { PageRegistry } from '@/registry/pageRegistry';
import { ageToDob, parseDateTime } from './dateParser';
import { isKnownDrug, protectCombinations, splitMedicationNames } from './drugLexicon';
import { translateUrdu } from './urdu/translator';

const NAV_VERBS =
  '(?:go to|goto|open|navigate to|take me to|show me|show|i want|i want to see|bring up|switch to|display|view|load|jump to|head to|let\'s go to|lets go to|move to)';
const ACTION_VERB_START =
  /^(go|goto|open|add|create|fill|search|find|navigate|show|start|save|submit|book|schedule|register|select|set|check|uncheck|scroll|close|cancel|prescribe|look|take|switch|new|record|log|enter|recall|delete|remove|update|change|edit|mark|complete|stop|read|tell|list|what|summarize|summarise|give)\b/;

/** True when an utterance starts with an application verb (i.e. is a command, not a plain value). */
export const looksLikeCommand = (text: string): boolean =>
  ACTION_VERB_START.test(normalizeTranscript(text)) || CONFIRM_RE.test(normalizeTranscript(text)) || CANCEL_RE.test(normalizeTranscript(text));

/** Urdu / Roman Urdu is translated to the English command language first; English passes through. */
export const normalizeTranscript = (raw: string): string =>
  translateUrdu(raw)
    .text.toLowerCase()
    .replace(/[“”"]/g, '')
    .replace(/[.!?]+$/g, '')
    .replace(/\bplease\b/g, '')
    .replace(/\b(?:hey|ok|okay)\s+(?:careflow|assistant|computer)\b,?/g, '')
    .replace(/\bmilligrams?\b/g, 'mg')
    .replace(/\bmicrograms?\b/g, 'mcg')
    .replace(/\bmillilit(?:er|re)s?\b/g, 'ml')
    .replace(/\s+/g, ' ')
    .trim();

/** Split "open medications and add panadol" into ordered clauses. */
export function splitClauses(text: string): string[] {
  const parts = text.split(/\s*(?:,\s*then|\band then\b|\bthen\b|;)\s*/);
  const out: string[] = [];
  for (const part of parts) {
    const sub = part.split(/\s+and\s+/);
    let buffer = sub[0];
    for (let i = 1; i < sub.length; i++) {
      if (ACTION_VERB_START.test(sub[i])) {
        out.push(buffer);
        buffer = sub[i];
      } else {
        buffer += ` and ${sub[i]}`;
      }
    }
    out.push(buffer);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

// ----------------------------------------------------------------------------
// Record kinds
// ----------------------------------------------------------------------------

/** Spoken words -> record kind. Longest first so "medication review" never becomes "review". */
const KIND_SYNONYMS: Array<[RegExp, AIRecordKind]> = [
  [/\b(?:medications?|meds?|drugs?|medicines?|prescriptions?)\b/, 'medication'],
  [/\b(?:diagnos(?:is|es|ises)|problems?|conditions?)\b/, 'diagnosis'],
  [/\b(?:tasks?|to-?dos?)\b/, 'task'],
  [/\b(?:recalls?|reminders?)\b/, 'recall'],
  [/\b(?:appointments?|visits?|bookings?)\b/, 'appointment'],
  [/\b(?:patients?)\b/, 'patient'],
];

export function kindFromText(text: string): AIRecordKind | undefined {
  for (const [re, kind] of KIND_SYNONYMS) if (re.test(text)) return kind;
  return undefined;
}

/** The record kind the current page is about — the default for "delete this one". */
export function kindFromPage(pageId: string | null): AIRecordKind | undefined {
  if (!pageId) return undefined;
  const map: Record<string, AIRecordKind> = {
    medications: 'medication',
    'summary-medication': 'medication',
    diagnoses: 'diagnosis',
    'summary-diagnosis': 'diagnosis',
    tasks: 'task',
    'summary-task': 'task',
    recalls: 'recall',
    'summary-recall': 'recall',
    appointments: 'appointment',
    'summary-appointment': 'appointment',
    patients: 'patient',
  };
  return map[pageId];
}

// ----------------------------------------------------------------------------
// Medication phrase parsing: "amoxicillin 500 mg orally twice daily for 7 days"
// ----------------------------------------------------------------------------
const FREQ_SYNONYMS = FieldRegistry.getForm('medication')!.fields.find((f) => f.name === 'frequency')!.synonyms!;
const ROUTE_SYNONYMS = FieldRegistry.getForm('medication')!.fields.find((f) => f.name === 'route')!.synonyms!;

export function parseMedicationPhrase(phrase: string): FieldValues {
  let text = ` ${phrase.toLowerCase().trim()} `;
  const fields: FieldValues = {};

  const dur = text.match(/\bfor (\d+|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|thirty) (day|week|month)s?\b/);
  if (dur) {
    fields.duration = normalizeDuration(`${dur[1]} ${dur[2]}s`);
    text = text.replace(dur[0], ' ');
  }
  const dose = text.match(/\b(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?|milligrams?|micrograms?|grams?)\b(?:\s*\/\s*(\d+(?:\.\d+)?)\s*(mg|ml))?/);
  if (dose) {
    fields.dosage = normalizeDosage(dose[0].trim());
    text = text.replace(dose[0], ' | ');
  }
  // Frequency — longest synonym first so "three times daily" beats "daily".
  const freqKeys = [...Object.keys(FREQ_SYNONYMS), ...FREQUENCY_OPTIONS.map((o) => o.toLowerCase())].sort((a, b) => b.length - a.length);
  for (const key of freqKeys) {
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(text)) {
      fields.frequency = FREQ_SYNONYMS[key] ?? FREQUENCY_OPTIONS.find((o) => o.toLowerCase() === key) ?? key;
      text = text.replace(re, ' | ');
      break;
    }
  }
  const routeKeys = Object.keys(ROUTE_SYNONYMS).sort((a, b) => b.length - a.length);
  for (const key of routeKeys) {
    const re = new RegExp(`\\b${key}\\b`);
    if (re.test(text)) {
      fields.route = ROUTE_SYNONYMS[key];
      text = text.replace(re, ' | ');
      break;
    }
  }
  const prn = text.match(/\b(as needed|prn|when needed)\b/);
  if (prn) {
    fields.isPRN = true;
    if (!fields.frequency) fields.frequency = 'As needed';
    text = text.replace(prn[0], ' | ');
  }
  const indication = text.match(/\bfor ([a-z][a-z\s-]+?)(?=\s*(?:\||$))/);
  if (indication && !/^(?:the |a |him|her|them)/.test(indication[1])) {
    fields.indication = indication[1].trim();
    text = text.replace(indication[0], ' | ');
  }
  const instr = text.match(/\b(?:with|after|before) (?:food|meals?|breakfast|dinner)\b/);
  if (instr) {
    fields.instructions = capitalize(instr[0].trim()) + '.';
    text = text.replace(instr[0], ' | ');
  }
  // Whatever precedes the first separator is the medication name.
  const namePart = text
    .split('|')[0]
    .replace(/\b(medication|medicine|drug|the|a|an|of|patient|add|prescribe|new|with|fill|form)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (namePart) fields.medicationName = capitalize(namePart);
  return fields;
}

/** Fields that, when spoken once at the end of a list, apply to every medication in it. */
const SHARED_MED_FIELDS = ['frequency', 'duration', 'route', 'indication', 'instructions', 'isPRN'] as const;

/**
 * Parse a phrase that may name several medications into one field set per medication.
 *
 *   "panadol paracetamol metformin twice daily for 10 days"
 *     -> Panadol / Paracetamol / Metformin, each Twice daily for 10 days
 *   "panadol 500 mg twice daily and metformin 850 mg once daily"
 *     -> two fully independent medications
 *
 * Dosage is never shared between medications; the schedule fields are shared only when
 * exactly one medication in the list mentions them.
 */
export function parseMedicationList(phrase: string): FieldValues[] {
  let text = protectCombinations(phrase.toLowerCase().trim());
  if (!text) return [];
  // A known drug name directly after a dose starts a new medication: "panadol 500 mg metformin 850 mg".
  text = text.replace(/(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?|milligrams?|micrograms?))\s+([a-z][a-z/-]*)/g, (m, dose: string, next: string) =>
    isKnownDrug(next) ? `${dose} and ${next}` : m,
  );
  const parts = text.split(/\s*(?:,|;)\s*|\s+(?:and|aur)\s+/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const part of parts) {
    const prev = chunks[chunks.length - 1];
    if (prev && !parseMedicationPhrase(part).medicationName) chunks[chunks.length - 1] = `${prev} ${part}`;
    else chunks.push(part);
  }
  const meds: FieldValues[] = [];
  for (const chunk of chunks) {
    const parsed = parseMedicationPhrase(chunk);
    const names = parsed.medicationName ? splitMedicationNames(String(parsed.medicationName)) : [];
    if (names.length <= 1) {
      meds.push(parsed);
      continue;
    }
    const { medicationName: _name, ...rest } = parsed;
    names.forEach((n) => meds.push({ medicationName: capitalize(n), ...rest }));
  }
  if (meds.length <= 1) return meds;
  for (const key of SHARED_MED_FIELDS) {
    const holders = meds.filter((m) => m[key] !== undefined);
    if (holders.length === 1) for (const m of meds) if (m[key] === undefined) m[key] = holders[0][key];
  }
  return meds;
}

const capitalize = (s: string) => s.replace(/(^|[\s/])([a-z])/g, (_, sp: string, c: string) => sp + c.toUpperCase()).trim();

// ----------------------------------------------------------------------------
// Diagnosis: "hypertension", "type 2 diabetes, chronic"
// ----------------------------------------------------------------------------
export function parseDiagnosisPhrase(phrase: string): FieldValues {
  const fields: FieldValues = {};
  let text = ` ${phrase.toLowerCase().trim()} `;
  const icd = text.match(/\b([a-z]\d{2}(?:\.\d{1,3})?)\b/i);
  if (icd) {
    fields.icd10 = icd[1].toUpperCase();
    text = text.replace(icd[0], ' ');
  }
  const status = text.match(/\b(active|chronic|resolved|inactive)\b/);
  if (status) {
    fields.status = capitalize(status[1]);
    text = text.replace(status[0], ' ');
  }
  const severity = text.match(/\b(mild|moderate|severe)\b/);
  if (severity) {
    fields.severity = capitalize(severity[1]);
    text = text.replace(severity[0], ' ');
  }
  const dt = parseDateTime(text);
  if (dt.date) {
    fields.onsetDate = dt.date;
    text = ` ${dt.rest} `;
  }
  const description = text
    .replace(/\b(diagnosis|diagnoses|problem|condition|of|the|a|an|as|to|patient|add|new|icd|code|since|with)\b/g, ' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (description) fields.description = capitalize(description);
  return fields;
}

// ----------------------------------------------------------------------------
// Task: "blood pressure monitoring due next friday, high priority"
// ----------------------------------------------------------------------------
const TASK_CATEGORY_FIELD = FieldRegistry.getForm('task')!.fields.find((f) => f.name === 'category')!;

export function parseTaskPhrase(phrase: string): FieldValues {
  const fields: FieldValues = {};
  const dt = parseDateTime(phrase);
  if (dt.date) fields.dueDate = dt.date;
  let text = ` ${dt.rest} `;

  const after = text.match(/\b(?:due )?(?:in|within|after)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(day|week|month)s?\b/);
  if (after && !fields.dueDate) {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
    const n = Number.isNaN(Number(after[1])) ? words[after[1]] : Number(after[1]);
    if (n) fields.dueDate = dayjs().add(n, after[2] as 'day' | 'week' | 'month').format('YYYY-MM-DD');
    text = text.replace(after[0], ' ');
  }
  const priority = text.match(/\b(low|normal|high|urgent)\s*(?:priority)?\b/);
  if (priority && /priority|urgent/.test(priority[0])) {
    fields.priority = capitalize(priority[1]);
    text = text.replace(priority[0], ' ');
  }
  for (const [syn, value] of Object.entries(TASK_CATEGORY_FIELD.synonyms ?? {})) {
    if (new RegExp(`\\b${syn}\\b`).test(text)) {
      fields.category = value;
      break;
    }
  }
  const title = text
    .replace(/\b(task|to-?do|due|by|on|for|the|a|an|create|add|new|set|please)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (title) fields.title = capitalize(title);
  return fields;
}

// ----------------------------------------------------------------------------
// Recall: "for blood pressure review in 3 months"
// ----------------------------------------------------------------------------
const RECALL_TYPE_FIELD = FieldRegistry.getForm('recall')!.fields.find((f) => f.name === 'type')!;

export function parseRecallPhrase(phrase: string): FieldValues {
  const fields: FieldValues = {};
  const dt = parseDateTime(phrase);
  if (dt.date) fields.dueDate = dt.date;
  let text = ` ${dt.rest} `;
  // "after 6 weeks" / "every 6 months" are recall intervals the date parser does not know.
  const after = text.match(/\b(?:after|every|within|in)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(day|week|month|year)s?\b/);
  if (after && !fields.dueDate) {
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
    const n = Number.isNaN(Number(after[1])) ? words[after[1]] : Number(after[1]);
    if (n) fields.dueDate = dayjs().add(n, after[2] as 'day' | 'week' | 'month' | 'year').format('YYYY-MM-DD');
    text = text.replace(after[0], ' ');
  }
  const typeKeys = [...Object.keys(RECALL_TYPE_FIELD.synonyms ?? {}), ...(RECALL_TYPE_FIELD.options ?? []).map((o) => o.toLowerCase())].sort((a, b) => b.length - a.length);
  for (const key of typeKeys) {
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(text)) {
      fields.type = FieldRegistry.normalizeValue(RECALL_TYPE_FIELD, key);
      break;
    }
  }
  if (/\b(urgent|urgently|high priority)\b/.test(text)) {
    fields.priority = 'High';
    text = text.replace(/\b(urgent|urgently|high priority)\b/, ' ');
  }
  const reason = text
    .replace(/\b(recall|reminder|the|a|an|of|patient|add|set|create|schedule|new|for|to|on|in|at|due)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (reason) fields.reason = capitalize(reason);
  return fields;
}

// ----------------------------------------------------------------------------
// Appointment: "with Dr Sarah tomorrow at 3 pm for chest pain"
// ----------------------------------------------------------------------------
export function parseAppointmentPhrase(phrase: string): FieldValues {
  const fields: FieldValues = {};
  const dt = parseDateTime(phrase);
  if (dt.date) fields.date = dt.date;
  if (dt.time) fields.startTime = dt.time;
  let text = ` ${dt.rest} `;

  const typeField = FieldRegistry.getForm('appointment')!.fields.find((f) => f.name === 'type')!;
  for (const [syn, value] of Object.entries(typeField.synonyms ?? {})) {
    const re = new RegExp(`\\b(?:a |an )?${syn}(?: appointment| visit)?\\b`);
    if (re.test(text) && syn !== 'new') {
      fields.type = value;
      text = text.replace(re, ' ');
      break;
    }
  }
  const STOP = '(?!(?:for|with|at|on|in|tomorrow|today|next|this|because|regarding|about)\\b)';
  const patient = text.match(new RegExp(`\\bfor (?:patient )?(${STOP}[a-z]+(?:\\s${STOP}[a-z]+)?)(?=\\s|$)`));
  if (patient && !/^(?:a|an|the|chest|follow|routine|review|pain|check)\b/.test(patient[1])) {
    fields.patientName = capitalize(patient[1]);
    text = text.replace(patient[0], ' ');
  }
  const provider = text.match(new RegExp(`\\bwith (?:dr\\.?|doctor|provider)?\\s*(${STOP}[a-z]+(?:\\s${STOP}[a-z]+)?)`));
  if (provider) {
    fields.providerName = capitalize(provider[1]);
    text = text.replace(provider[0], ' ');
  }
  const reason = text.match(/\b(?:for|because of|regarding|about|reason)\s+([a-z][a-z\s-]+)$/);
  if (reason) fields.reason = capitalize(reason[1].trim());
  const location = FieldRegistry.getForm('appointment')!.fields.find((f) => f.name === 'locationName')!;
  for (const [syn, value] of Object.entries(location.synonyms ?? {})) {
    if (new RegExp(`\\b(?:at|in) ${syn}\\b`).test(text)) {
      fields.locationName = value;
      break;
    }
  }
  if (/\b(urgent|urgently)\b/.test(text)) fields.priority = 'Urgent';
  return fields;
}

// ----------------------------------------------------------------------------
// Patient: "Ahmed Khan, male, 32 years old, phone 555 0100"
// ----------------------------------------------------------------------------
export function parsePatientPhrase(phrase: string): FieldValues {
  const fields: FieldValues = {};
  let text = ` ${phrase.toLowerCase()} `;
  const gender = text.match(/\b(male|female|man|woman|boy|girl|non-binary|other)\b/);
  if (gender) {
    fields.gender = FieldRegistry.normalizeValue(FieldRegistry.resolveField('patient', 'gender')!, gender[1]);
    text = text.replace(gender[0], ' | ');
  }
  const age = text.match(/\b(\d{1,3})\s*(?:years? old|yo|y\/o|years)\b|\baged? (\d{1,3})\b/);
  if (age) {
    const n = Number(age[1] ?? age[2]);
    fields.age = n;
    fields.dateOfBirth = ageToDob(n);
    text = text.replace(age[0], ' | ');
  }
  const dob = text.match(/\b(?:born|dob|date of birth)\s*(?:on|is)?\s*([a-z0-9\s\/-]+?)(?=\s*(?:,|\||$))/);
  if (dob) {
    const parsed = parseDateTime(dob[1]);
    if (parsed.date) fields.dateOfBirth = parsed.date;
    text = text.replace(dob[0], ' | ');
  }
  const phone = text.match(/\b(?:phone|mobile|cell|number)\s*(?:is|number)?\s*([\d\s()+-]{7,})/);
  if (phone) {
    fields.phone = phone[1].trim();
    text = text.replace(phone[0], ' | ');
  }
  const email = text.match(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/);
  if (email) {
    fields.email = email[0];
    text = text.replace(email[0], ' | ');
  }
  const blood = text.match(/\bblood (?:group|type) ([abo]{1,2}\s*(?:positive|negative|\+|-))/);
  if (blood) {
    fields.bloodGroup = FieldRegistry.normalizeValue(FieldRegistry.resolveField('patient', 'bloodGroup')!, blood[1].replace(/\s+/g, ' '));
    text = text.replace(blood[0], ' | ');
  }
  const lang = text.match(/\bspeaks ([a-z]+)\b/);
  if (lang) {
    fields.language = capitalize(lang[1]);
    text = text.replace(lang[0], ' | ');
  }
  const namePart = text.split(/[|,]/)[0].replace(/\b(patient|register|add|new|create|named|name|called|is|a|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (namePart) {
    const parts = namePart.split(' ');
    fields.firstName = capitalize(parts[0]);
    if (parts.length > 1) fields.lastName = capitalize(parts.slice(1).join(' '));
  }
  return fields;
}

/** Parse the detail phrase for whichever record kind is being added. */
export function parseRecordPhrase(kind: AIRecordKind, phrase: string): FieldValues {
  switch (kind) {
    case 'medication':
      return parseMedicationList(phrase)[0] ?? {};
    case 'diagnosis':
      return parseDiagnosisPhrase(phrase);
    case 'task':
      return parseTaskPhrase(phrase);
    case 'recall':
      return parseRecallPhrase(phrase);
    case 'appointment': {
      const fields = parseAppointmentPhrase(phrase);
      delete fields.patientName; // appointments always belong to the selected patient
      return fields;
    }
    case 'patient':
      return parsePatientPhrase(phrase);
  }
}

// ----------------------------------------------------------------------------
// Main interpreter
// ----------------------------------------------------------------------------
const CONFIRM_RE =
  /^(?:yes|yes,? (?:save|submit|confirm|delete|do it|go ahead|please)(?: it)?|yeah|yep|save(?: it| this| the form| now)?|submit(?: it| the form)?|confirm(?: it)?|delete it|go ahead|proceed|do it|ok save(?: it)?|okay save(?: it)?|that's correct|correct|looks good|approve)$/;
const CANCEL_RE =
  /^(?:no|nope|cancel(?: it| that| this)?|stop|never ?mind|discard(?: it)?|abort|forget it|don't save|do not save|don't delete|undo|clear(?: the form| it)?|close(?: it| the form| this)?|dismiss)$/;

const KIND_WORDS = 'medications?|meds?|drugs?|medicines?|diagnos(?:is|es)|problems?|conditions?|tasks?|to-?dos?|recalls?|reminders?|appointments?|visits?|patients?';

export function interpretClause(clause: string, ctx: AIContext, rawClause?: string): AICommand[] {
  const t = clause.trim();
  if (!t) return [];
  const pageKind = kindFromPage(ctx.currentPageId);

  // --- confirmation boundary ---
  if (CONFIRM_RE.test(t)) return [{ action: 'confirm' }];
  if (CANCEL_RE.test(t)) return [{ action: 'cancel' }];
  if (/^(?:help|what can i say|what can you do|commands|show help)$/.test(t)) return [{ action: 'help' }];
  if (/^(?:go |take me |navigate )?back$/.test(t) || /^(?:go back|previous page)$/.test(t)) return [{ action: 'go_back' }];
  if (/^(?:go |take me )?home$/.test(t) || /^(?:go to |open )?(?:the )?home ?page$/.test(t)) return [{ action: 'go_home' }];
  if (/^(?:collapse|expand|toggle|hide|show) (?:the )?(?:sidebar|side bar|menu|navigation)$/.test(t)) return [{ action: 'toggle_sidebar' }];

  // --- scrolling ---
  const scroll = t.match(/^scroll(?: to)?(?: the)? (up|down|top|bottom)$/) ?? t.match(/^(?:scroll|page) (up|down)$/);
  if (scroll) return [{ action: 'scroll', direction: scroll[1] as 'up' | 'down' | 'top' | 'bottom' }];
  const scrollTo = t.match(/^scroll to (?:the )?(.+)$/);
  if (scrollTo) return [{ action: 'scroll', section: scrollTo[1] }];

  // --- page numbers ---
  const pageNum = t.match(new RegExp(`^(?:${NAV_VERBS}\\s+)?(?:the )?page (?:number )?(\\d{1,3})$`));
  if (pageNum) return [{ action: 'navigate', target: Number(pageNum[1]) }];

  // --- summary tabs ---
  const tab = t.match(/^(?:open|switch to|show me|show|go to|select|display)\s+(?:the\s+)?(.+?)\s+tab$/);
  if (tab) return [{ action: 'open_tab', tab: tab[1] }];

  // --- patient summary / read-back ---
  if (/^(?:give me |generate |read |tell me |show me )?(?:an? )?(?:patient |dashboard |clinical )?summary(?: of| for)?(?: this| the)?(?: patient)?$/.test(t) || /^summari[sz]e (?:this |the )?patient$/.test(t) || /^(?:what is|whats|tell me about) (?:the )?patient(?:'s)? (?:situation|status|overview)$/.test(t)) {
    return [{ action: 'summarize_patient' }];
  }
  const read = t.match(new RegExp(`^(?:read|read out|read me|tell me|list|show me|what are|what's|whats)\\s+(?:the |this |their |patient'?s? )*(${KIND_WORDS})(?:\\s+(?:list|information|info|details|record|records))?$`));
  if (read) {
    const kind = kindFromText(read[1]);
    if (kind) return [{ action: 'read_records', kind }];
  }
  if (/^(?:read|tell me|show me)\s+(?:the )?patient(?:'s)? (?:information|info|details|demographics)$/.test(t)) return [{ action: 'read_records', kind: 'patient' }];

  // --- patient context ---
  const selectPatient = t.match(/^(?:select|switch to|change to|set|use|work on|choose|pick|load|open)\s+(?:the\s+)?patient\s+(.+)$/) ?? t.match(/^(?:change|switch)\s+patient\s+to\s+(.+)$/);
  if (selectPatient) return [{ action: 'select_patient', name: capitalize(selectPatient[1].trim()) }];
  if (/^(?:change|switch|select|choose) (?:the )?patient$/.test(t)) return [{ action: 'navigate', target: 'patients' }];
  if (/^(?:clear|deselect|remove) (?:the )?(?:selected )?patient$/.test(t)) return [{ action: 'clear_patient' }];

  const searchPatient = t.match(/^(?:search|find|look up|lookup|search for|look for)\s+(?:the |a )?patients?\s*(?:for|named|called)?\s*(.+)$/);
  if (searchPatient) return [{ action: 'search_patient', query: capitalize(searchPatient[1].trim()) }];
  if (/^(?:search|find)(?: a| the)? patients?$/.test(t)) return [{ action: 'navigate', target: 'patients' }];

  // --- search within a module ---
  const searchRecords = t.match(new RegExp(`^(?:search|find|filter|look for)\\s+(?:the\\s+)?(${KIND_WORDS})\\s+(?:for|named|called|matching|with)?\\s*(.+)$`));
  if (searchRecords) {
    const kind = kindFromText(searchRecords[1]);
    if (kind) return kind === 'patient' ? [{ action: 'search_patient', query: capitalize(searchRecords[2]) }] : [{ action: 'search_records', kind, query: searchRecords[2].trim() }];
  }

  // --- delete ---
  const del = t.match(new RegExp(`^(?:delete|remove|cancel)\\s+(?:the\\s+|this\\s+)?(?:(${KIND_WORDS})\\s+)?(.*)$`));
  if (del && /^(?:delete|remove)/.test(t)) {
    const kind = (del[1] && kindFromText(del[1])) || pageKind || kindFromText(del[2] ?? '');
    // "remove the blood pressure task" — the kind word names the module, not the record.
    const match = (del[2] ?? '')
      .replace(/^(?:called|named|for)\s+/, '')
      .replace(new RegExp(`\\b(?:${KIND_WORDS}|record|entry)\\b`, 'g'), ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (kind) return [{ action: 'delete_record', kind, ...(match ? { match } : {}) }];
  }

  // --- update: "mark the blood pressure task as completed", "stop the metformin" ---
  const mark = t.match(new RegExp(`^(?:mark|set)\\s+(?:the\\s+)?(.+?)\\s+(?:${KIND_WORDS})?\\s*as\\s+(.+)$`)) ?? t.match(/^(?:mark|set)\s+(?:the\s+)?(.+?)\s+(?:to|as)\s+(completed|complete|done|cancelled|canceled|in progress|active|resolved|chronic|inactive|scheduled|discontinued|on hold)$/);
  if (mark) {
    const kind = kindFromText(t) ?? pageKind;
    if (kind) {
      const statusField = FieldRegistry.resolveField(kind, 'status');
      if (statusField) {
        const value = FieldRegistry.normalizeValue(statusField, mark[2].trim());
        const match = mark[1].replace(new RegExp(`\\b(?:${KIND_WORDS})\\b`, 'g'), '').trim();
        return [{ action: 'update_record', kind, match, fields: { status: value } }];
      }
    }
  }
  const stop = t.match(/^(?:stop|discontinue)\s+(?:the\s+)?(.+?)(?:\s+medication)?$/);
  if (stop && (pageKind === 'medication' || /medication|drug/.test(t) || isKnownDrug(stop[1].split(' ')[0]))) {
    return [{ action: 'update_record', kind: 'medication', match: stop[1].trim(), fields: { status: 'Discontinued' } }];
  }
  const completeTask = t.match(/^(?:complete|finish)\s+(?:the\s+)?(?:task\s+)?(.+?)(?:\s+task)?$/);
  if (completeTask && (pageKind === 'task' || /\btask\b/.test(t))) {
    return [{ action: 'update_record', kind: 'task', match: completeTask[1].replace(/\btask\b/g, '').trim(), fields: { status: 'Completed' } }];
  }

  // "change the metformin dosage to 1000 mg"
  const changeField = t.match(/^(?:change|update|edit|modify|set)\s+(?:the\s+)?(.+?)(?:'s)?\s+([a-z ]+?)\s+to\s+(.+)$/);
  if (changeField && !ctx.openFormId) {
    const kind = kindFromText(t) ?? pageKind;
    if (kind) {
      const field = FieldRegistry.resolveField(kind, changeField[2].trim());
      if (field) {
        const match = changeField[1].replace(new RegExp(`\\b(?:${KIND_WORDS})\\b`, 'g'), '').trim();
        return [{ action: 'update_record', kind, match, fields: { [field.name]: changeField[3].trim() } }];
      }
    }
  }
  // "update the metformin" / "edit patient Ahmed Khan"
  const openEdit = t.match(new RegExp(`^(?:update|edit|change|modify)\\s+(?:the\\s+)?(?:(${KIND_WORDS})\\s+)?(.+)$`));
  if (openEdit) {
    const kind = (openEdit[1] && kindFromText(openEdit[1])) || pageKind;
    if (kind) return [{ action: 'update_record', kind, match: openEdit[2].trim() }];
  }

  // --- "add another" while a tabbed form is open ---
  if (ctx.openFormId && /^(?:add|new|create)(?: an| one)? (?:another|more|next|second|third)(?: medication| med| drug| one| entry| tab)?$/.test(t)) {
    return [{ action: 'add_entry', formId: ctx.openFormId }];
  }

  // --- add: "add medication panadol", "add diagnosis hypertension", "set recall ..." ---
  // "open medications" is navigation; "open the medication form" opens the dialog.
  const openFormBare = t.match(new RegExp(`^(?:open|start|show)\\s+(?:an?\\s+|the\\s+)?(?:new\\s+)?(${KIND_WORDS})\\s+form$`));
  if (openFormBare) {
    const kind = kindFromText(openFormBare[1]);
    if (kind) return [{ action: 'add_record', kind }];
  }
  const addBare = t.match(new RegExp(`^(?:add|create|new|book|schedule|register|record|log|set)\\s+(?:an?\\s+|the\\s+)?(?:new\\s+)?(${KIND_WORDS})(?:\\s+form)?$`));
  if (addBare) {
    const kind = kindFromText(addBare[1]);
    if (kind) return [{ action: 'add_record', kind }];
  }
  const addWithDetail = t.match(
    new RegExp(`^(?:add|create|new|book|schedule|register|record|log|set|prescribe)\\s+(?:an?\\s+|the\\s+)?(?:new\\s+)?(${KIND_WORDS})\\s+(?:for|of|to|named|called|:)?\\s*(.+)$`),
  );
  if (addWithDetail) {
    const kind = kindFromText(addWithDetail[1]);
    if (kind) {
      const phrase = addWithDetail[2].trim();
      if (kind === 'medication') {
        const list = parseMedicationList(phrase);
        return [list.length > 1 ? { action: 'add_record', kind, fields: list[0], records: list } : { action: 'add_record', kind, fields: list[0] ?? {} }];
      }
      return [{ action: 'add_record', kind, fields: parseRecordPhrase(kind, phrase) }];
    }
  }
  // "recall the patient in two weeks" — the verb itself names the kind.
  const recallVerb = t.match(/^recall(?: the)?(?: patient)?(?: for| in| after)?\s+(.+)$/);
  if (recallVerb) return [{ action: 'add_record', kind: 'recall', fields: parseRecallPhrase(recallVerb[1]) }];
  // "prescribe amoxicillin 500 mg twice daily"
  const prescribe = t.match(/^(?:prescribe|start (?:the )?(?:patient )?on|put (?:the )?patient on)\s+(.+)$/);
  if (prescribe && looksLikeMedication(prescribe[1])) {
    const list = parseMedicationList(prescribe[1]);
    return [list.length > 1 ? { action: 'add_record', kind: 'medication', fields: list[0], records: list } : { action: 'add_record', kind: 'medication', fields: list[0] ?? {} }];
  }
  /**
   * "add panadol and metformin twice daily" — no kind word spoken. The module the user is
   * looking at decides; anywhere else, a phrase that reads like a drug is a medication.
   */
  const addGeneric = t.match(/^(?:add|create|new|record|log)\s+(?:an?\s+|the\s+)?(.+)$/);
  if (addGeneric) {
    const phrase = addGeneric[1].trim();
    if (pageKind && pageKind !== 'medication') return [{ action: 'add_record', kind: pageKind, fields: parseRecordPhrase(pageKind, phrase) }];
    if (looksLikeMedication(phrase)) {
      const list = parseMedicationList(phrase);
      return [list.length > 1 ? { action: 'add_record', kind: 'medication', fields: list[0], records: list } : { action: 'add_record', kind: 'medication', fields: list[0] ?? {} }];
    }
  }

  // --- field level (a form is open) ---
  const setField = t.match(/^(?:set|change|update|make|put|enter|type|fill(?: in)?)(?: the)? (.+?) (?:to|as|with|=) (.+)$/) ?? t.match(/^(?:the )?(.+?) (?:is|should be|equals) (.+)$/);
  if (setField && ctx.openFormId) {
    const field = FieldRegistry.resolveField(ctx.openFormId, setField[1]);
    if (field) return [{ action: 'fill_field', formId: ctx.openFormId, field: field.name, value: setField[2] }];
  }
  const select = t.match(/^(?:select|choose|pick) (.+?) (?:for|in|as|under)(?: the)? (.+)$/);
  if (select && ctx.openFormId) {
    const field = FieldRegistry.resolveField(ctx.openFormId, select[2]);
    if (field) return [{ action: 'select_dropdown', formId: ctx.openFormId, field: field.name, value: select[1] }];
  }
  const check = t.match(/^(check|uncheck|tick|untick|enable|disable|turn on|turn off)(?: the)? (.+)$/);
  if (check && ctx.openFormId) {
    const field = FieldRegistry.resolveField(ctx.openFormId, check[2]);
    if (field) return [{ action: 'set_checkbox', formId: ctx.openFormId, field: field.name, checked: /^(check|tick|enable|turn on)$/.test(check[1]) }];
  }
  const clear = t.match(/^(?:clear|empty)(?: the)? (.+?)(?: field| value)?$/);
  if (clear && ctx.openFormId) {
    const field = FieldRegistry.resolveField(ctx.openFormId, clear[1]);
    if (field) return [{ action: 'clear_field', formId: ctx.openFormId, field: field.name }];
  }
  const focus = t.match(/^(?:focus(?: on)?|go to|jump to|move to|select)(?: the)? (.+?)(?: field| box| input)$/);
  if (focus && ctx.openFormId) {
    const field = FieldRegistry.resolveField(ctx.openFormId, focus[1]);
    if (field) return [{ action: 'focus_field', formId: ctx.openFormId, field: field.name }];
  }
  if (/^(?:close|cancel)(?: the)? form$/.test(t)) return [{ action: 'close_form' }];

  // --- "show John Smith's medications" — switch patient and open that module ---
  const possessive = t.match(/^(?:open|show|show me|go to|view|display)\s+(.+?)(?:'s|s')\s+(.+)$/);
  if (possessive) {
    const section = possessive[2].replace(/\s+(?:page|screen|section|module|view|list)$/, '').trim();
    return [{ action: 'select_patient', name: capitalize(possessive[1]), section }];
  }

  // --- navigation ---
  const nav = t.match(new RegExp(`^${NAV_VERBS}\\s+(?:the |my )?(.+)$`)) ?? (PageRegistry.resolve(t) ? [t, t] : null);
  if (nav) {
    const target = nav[1].replace(/\s+(?:page|screen|section|module|view)$/, '').trim();
    const page = PageRegistry.resolve(target);
    if (page) return [{ action: 'navigate', target: page.id }];
    const form = FieldRegistry.resolveForm(target, ctx.currentPageId);
    if (form) return [{ action: 'add_record', kind: form.id as AIRecordKind }];
    // "open Ahmed Khan" — 1–3 plain words are read as a patient name.
    if (/^[a-z]+(?:\s[a-z]+){0,2}$/.test(target) && /^(?:open|show|load|pull up|bring up|view|switch to)/.test(t)) {
      return [{ action: 'select_patient', name: capitalize(target) }];
    }
    return [{ action: 'unknown', reason: `I couldn't find a page called "${target}".` }];
  }

  // --- save/submit without confirmation words ---
  if (/^(?:save|submit|send|book|place)(?: the| this)? (?:form|medication|appointment|patient|diagnosis|task|recall|record|changes|it)$/.test(t)) return [{ action: 'submit_form' }];

  // --- pending slot answer (multi-turn) ---
  if (ctx.pendingSlot) {
    const slotForm = ctx.pendingSlot.formId;
    if (slotForm === 'medication' && /\d+\s*(mg|mcg|g|ml|units?)\b/.test(t)) {
      const list = parseMedicationList(t);
      const parsed = list[0];
      if (list.length > 1) return [{ action: 'fill_form', formId: slotForm, fields: parsed, entries: list }];
      if (parsed?.medicationName && Object.keys(parsed).length > 1) return [{ action: 'fill_form', formId: slotForm, fields: parsed }];
    }
    return [{ action: 'fill_field', formId: slotForm, field: ctx.pendingSlot.field, value: (rawClause ?? clause).trim() }];
  }

  // --- bare medication phrase while the medication form is open ---
  if (ctx.openFormId === 'medication' && looksLikeMedication(t)) {
    const list = parseMedicationList(t);
    return [{ action: 'fill_form', formId: 'medication', fields: list[0] ?? {}, ...(list.length > 1 ? { entries: list } : {}) }];
  }

  return [{ action: 'unknown', reason: `I didn't understand "${clause}".` }];
}

function looksLikeMedication(phrase: string): boolean {
  if (/\d+\s*(mg|mcg|g|ml|units?)\b/.test(phrase) || /\b(daily|twice|once|bid|tid|qid|prn|as needed|every \d+ hours|tablet|capsule)\b/.test(phrase)) return true;
  const names = splitMedicationNames(phrase);
  if (names.length > 1 || names.some((n) => n.split(' ').some(isKnownDrug))) return true;
  return /^[a-z]+(?:\s[a-z]+)?$/.test(phrase.trim());
}

export function interpret(transcript: string, ctx: AIContext): AICommand[] {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) return [{ action: 'unknown', reason: 'Empty transcript' }];
  // A single confirmation/cancel word should never be split.
  if (CONFIRM_RE.test(normalized)) return [{ action: 'confirm' }];
  if (CANCEL_RE.test(normalized)) return [{ action: 'cancel' }];
  const clauses = splitClauses(normalized);
  // Raw text is only used as a verbatim slot answer; for Urdu input the translation is the usable form.
  const source = translateUrdu(transcript).text;
  const rawSingle = clauses.length === 1 ? source.trim().replace(/[.!?]+$/g, '') : undefined;
  const commands: AICommand[] = [];
  let workingCtx = { ...ctx };
  for (const clause of clauses) {
    const cmds = interpretClause(clause, workingCtx, rawSingle);
    commands.push(...cmds);
    // Carry context forward between clauses: "open medications and add panadol".
    for (const c of cmds) {
      if (c.action === 'open_form') workingCtx = { ...workingCtx, openFormId: c.formId };
      if (c.action === 'add_record' || c.action === 'update_record') workingCtx = { ...workingCtx, openFormId: c.kind };
      if (c.action === 'add_medication') workingCtx = { ...workingCtx, openFormId: 'medication' };
      if (c.action === 'create_appointment') workingCtx = { ...workingCtx, openFormId: 'appointment' };
      if (c.action === 'register_patient') workingCtx = { ...workingCtx, openFormId: 'patient' };
      if (c.action === 'navigate') {
        workingCtx = { ...workingCtx, currentPageId: typeof c.target === 'string' ? c.target : (PageRegistry.getByNumber(c.target)?.id ?? null) };
      }
    }
  }
  return commands;
}
