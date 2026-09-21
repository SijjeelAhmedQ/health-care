/**
 * Deterministic natural-language interpreter.
 *
 * Used (a) as the "mock" LLM so the whole voice workflow can be developed and
 * tested without any model running, and (b) as a safety fallback when the
 * local Qwen model is unavailable or returns invalid output.
 *
 * It only produces structured AICommands — it never touches the UI.
 */
import type { AICommand, AIContext, FieldValues } from '@/types/ai';
import { FieldRegistry, FREQUENCY_OPTIONS, normalizeDosage, normalizeDuration } from '@/registry/fieldRegistry';
import { PageRegistry } from '@/registry/pageRegistry';
import { ageToDob, parseDateTime } from './dateParser';
import { translateUrdu } from './urdu/translator';

const NAV_VERBS = '(?:go to|goto|open|navigate to|take me to|show me|show|i want|i want to see|bring up|switch to|display|view|load|jump to|head to|let\'s go to|lets go to|move to)';
const OTHER_FORM_WORDS = /^(?:patient|appointment|allergy|diagnosis|problem|referral|user|provider|shift|leave|lab|imaging|prescription|note|roster|room|location)\b/;
const ACTION_VERB_START = /^(go|goto|open|add|create|fill|search|find|navigate|show|start|save|submit|book|schedule|register|select|set|check|uncheck|scroll|close|cancel|order|prescribe|look|take|switch|new|refer)\b/;

/** True when an utterance starts with an application verb (i.e. is a command, not a plain value). */
export const looksLikeCommand = (text: string): boolean => ACTION_VERB_START.test(normalizeTranscript(text)) || CONFIRM_RE.test(normalizeTranscript(text)) || CANCEL_RE.test(normalizeTranscript(text));

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

/** Split "go to page 30 and add medication" into ordered clauses. */
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
  const namePart = text.split('|')[0].replace(/\b(medication|medicine|drug|the|a|an|of|patient|add|prescribe|new|with|fill|form)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (namePart) fields.medicationName = capitalize(namePart);
  return fields;
}

const capitalize = (s: string) => s.replace(/(^|\s)([a-z])/g, (_, sp: string, c: string) => sp + c.toUpperCase()).trim();

// ----------------------------------------------------------------------------
// Appointment phrase parsing: "for Ahmed with Dr Sarah tomorrow at 3 pm for chest pain"
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
// Patient phrase parsing: "Ahmed Khan, male, 32 years old, phone 555 0100"
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

// ----------------------------------------------------------------------------
// Main interpreter
// ----------------------------------------------------------------------------
const CONFIRM_RE = /^(?:yes|yes,? (?:save|submit|confirm|do it|go ahead|please)(?: it)?|yeah|yep|save(?: it| this| the form| now)?|submit(?: it| the form)?|confirm(?: it)?|go ahead|proceed|do it|ok save(?: it)?|okay save(?: it)?|that's correct|correct|looks good|approve)$/;
const CANCEL_RE = /^(?:no|nope|cancel(?: it| that| this)?|stop|never ?mind|discard(?: it)?|abort|forget it|don't save|do not save|undo|clear(?: the form| it)?|close(?: it| the form| this)?|dismiss)$/;
const PATIENT_SECTION_MAP: Record<string, string> = {
  medications: 'patient-medications',
  'clinical-notes': 'patient-notes',
  'clinical-documents': 'patient-documents',
  diagnosis: 'patient-problems',
};

export function interpretClause(clause: string, ctx: AIContext, rawClause?: string): AICommand[] {
  const t = clause.trim();
  if (!t) return [];

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
  const scrollTo = t.match(/^scroll to (?:the )?(.+)$/) ?? t.match(/^(?:jump|go) to (?:the )?(.+?) section$/);
  if (scrollTo) return [{ action: 'scroll', section: scrollTo[1] }];

  // --- page numbers ---
  const pageNum = t.match(new RegExp(`^(?:${NAV_VERBS}\\s+)?(?:the )?page (?:number )?(\\d{1,3})$`));
  if (pageNum) return [{ action: 'navigate', target: Number(pageNum[1]) }];

  // --- tabs ---
  const tab = t.match(/^(?:open|switch to|show|go to|select) (?:the )?(.+?) tab$/);
  if (tab) return [{ action: 'open_tab', tab: tab[1] }];

  // --- appointment ---
  if (/^(?:create|new|book|schedule|make|add|open)(?: an?| the)? (?:new )?appointment(?: form)?$/.test(t)) return [{ action: 'create_appointment' }];
  const appt = t.match(/^(?:create|new|book|schedule|make|add|set up)(?: an?| the)? (?:new )?appointment\s+(.+)$/);
  if (appt) return [{ action: 'create_appointment', fields: parseAppointmentPhrase(appt[1]) }];

  // --- patient registration ---
  if (/^(?:add|register|create|new)(?: a| the)? (?:new )?patient(?: registration| form)?$/.test(t)) return [{ action: 'register_patient' }];
  const reg = t.match(/^(?:add|register|create|new)(?: a| the)? (?:new )?patient\s+(?:named |called )?(.+)$/);
  if (reg) return [{ action: 'register_patient', fields: parsePatientPhrase(reg[1]) }];

  // --- medication ---
  if (/^(?:add|new|create|open|start)(?: a| the)? (?:new )?medication(?: form)?$/.test(t) || /^(?:add|new) (?:a )?(?:medication|med|drug)$/.test(t)) return [{ action: 'add_medication' }];
  const medFill = t.match(/^(?:fill(?: in| out)? (?:the )?medication(?: form)? with|add (?:the )?medication|add (?:the )?med|add (?:the )?drug|prescribe|add|medication)\s+(.+)$/);
  if (medFill && !OTHER_FORM_WORDS.test(medFill[1]) && looksLikeMedication(medFill[1])) return [{ action: 'add_medication', fields: parseMedicationPhrase(medFill[1]) }];

  // --- prescription ---
  if (/^(?:new|create|add|open|start|write)(?: a)? prescription(?: form)?$/.test(t)) return [{ action: 'open_form', formId: 'prescription' }];
  const rx = t.match(/^(?:prescribe|write (?:a )?prescription for|new prescription(?: for)?|create (?:a )?prescription for)\s+(.+)$/);
  if (rx && looksLikeMedication(rx[1])) return [{ action: 'open_form', formId: 'prescription' }, { action: 'fill_form', formId: 'prescription', fields: parseMedicationPhrase(rx[1]) }];

  // --- search ---
  const search = t.match(/^(?:search|find|look up|lookup|search for|look for)(?: (?:the |a )?patient)?(?: for| named| called)?\s+(.+)$/);
  if (search) return [{ action: 'search_patient', query: capitalize(search[1].replace(/^patient\s+/, '')) }];
  if (/^(?:search|find)(?: a)? patients?$/.test(t)) return [{ action: 'navigate', target: 'patient-search' }];

  // --- generic forms: "open allergy form", "add allergy", "new referral" ---
  const formOpen = t.match(/^(?:open|add|new|create|start|record|log)(?: an?| the)? (?:new )?(.+?)(?: form)?$/);
  if (formOpen) {
    const form = FieldRegistry.resolveForm(formOpen[1], ctx.currentPageId, true);
    if (form && !PageRegistry.resolve(formOpen[1])?.aliases.includes(formOpen[1])) {
      if (form.id === 'medication') return [{ action: 'add_medication' }];
      if (form.id === 'appointment') return [{ action: 'create_appointment' }];
      if (form.id === 'patient') return [{ action: 'register_patient' }];
      return [{ action: 'open_form', formId: form.id }];
    }
  }
  const formOpenWithDetails = t.match(/^(?:add|record|log|new)(?: an?| the)? (allergy|diagnosis|problem|referral|lab order|shift|leave)(?: to| for| of)?\s+(.+)$/);
  if (formOpenWithDetails) {
    const form = FieldRegistry.resolveForm(formOpenWithDetails[1], ctx.currentPageId);
    if (form) {
      const primary = form.fields.find((f) => f.required) ?? form.fields[0];
      const fields: FieldValues = { [primary.name]: capitalize(formOpenWithDetails[2]) };
      if (form.id === 'allergy') {
        const m = formOpenWithDetails[2].match(/^(.+?)(?:\s+(?:causes|causing|reaction|with)\s+(.+?))?(?:\s+(mild|moderate|severe|life[- ]threatening))?$/);
        if (m) {
          fields.allergen = capitalize(m[1]);
          if (m[2]) fields.reaction = capitalize(m[2]);
          if (m[3]) fields.severity = FieldRegistry.normalizeValue(FieldRegistry.resolveField('allergy', 'severity')!, m[3]);
        }
      }
      return [{ action: 'open_form', formId: form.id }, { action: 'fill_form', formId: form.id, fields }];
    }
  }

  // --- field level ---
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
  const clear = t.match(/^(?:clear|empty|remove|delete)(?: the)? (.+?)(?: field| value)?$/);
  if (clear && ctx.openFormId) {
    const field = FieldRegistry.resolveField(ctx.openFormId, clear[1]);
    if (field) return [{ action: 'clear_field', formId: ctx.openFormId, field: field.name }];
  }
  const focus = t.match(/^(?:focus(?: on)?|go to|jump to|move to|select)(?: the)? (.+?)(?: field| box| input)$/);
  if (focus && ctx.openFormId) {
    const field = FieldRegistry.resolveField(ctx.openFormId, focus[1]);
    if (field) return [{ action: 'focus_field', formId: ctx.openFormId, field: field.name }];
  }

  // --- navigation to a registered page wins over patient-name heuristics ---
  const navEarly = t.match(new RegExp(`^${NAV_VERBS}\\s+(?:the |my )?(.+)$`));
  if (navEarly) {
    const target = navEarly[1].replace(/\s+(?:page|screen|section|module|view)$/, '').trim();
    const page = PageRegistry.resolve(target);
    if (page && (page.aliases.includes(target) || page.title.toLowerCase() === target || page.id === target.replace(/\s+/g, '-'))) {
      const finalPage = ctx.currentPatientId && PATIENT_SECTION_MAP[page.id] ? PageRegistry.get(PATIENT_SECTION_MAP[page.id]) ?? page : page;
      return [{ action: 'navigate', target: finalPage.id }];
    }
  }

  // --- explicit patient / provider ---
  const openPatient = t.match(/^(?:open|show|load|pull up|bring up|go to|view)(?: the)? (?:patient|chart for|chart of|record for|record of|file for)\s+(.+)$/);
  if (openPatient) {
    const sec = openPatient[1].match(/^(.+?)(?:'s|s') (.+)$/);
    if (sec) return [{ action: 'open_patient', name: capitalize(sec[1]), section: sec[2] }];
    return [{ action: 'open_patient', name: capitalize(openPatient[1]) }];
  }
  const openProvider = t.match(/^(?:open|show|view|go to)(?: the)? (?:provider|doctor|dr\.?|clinician)\s+(.+?)(?: profile)?$/);
  if (openProvider) return [{ action: 'open_provider', name: capitalize(openProvider[1]) }];
  const possessive = t.match(/^(?:open|show|go to|view)\s+(.+?)(?:'s|s') (.+)$/);
  if (possessive) return [{ action: 'open_patient', name: capitalize(possessive[1]), section: possessive[2] }];

  // --- navigation ---
  const nav = t.match(new RegExp(`^${NAV_VERBS}\\s+(?:the |my )?(.+)$`)) ?? (PageRegistry.resolve(t) ? [t, t] : null);
  if (nav) {
    const target = nav[1].replace(/\s+(?:page|screen|section|module|view)$/, '').trim();
    let page = PageRegistry.resolve(target);
    if (page) {
      if (ctx.currentPatientId && PATIENT_SECTION_MAP[page.id]) page = PageRegistry.get(PATIENT_SECTION_MAP[page.id]) ?? page;
      return [{ action: 'navigate', target: page.id }];
    }
    const form = FieldRegistry.resolveForm(target, ctx.currentPageId);
    if (form) return [{ action: 'open_form', formId: form.id }];
    // "open John Smith" — treat 1–3 capitalizable words as a patient name.
    if (/^[a-z]+(?:\s[a-z]+){0,2}$/.test(target) && /^(?:open|show|load|pull up|bring up|view)/.test(t)) return [{ action: 'open_patient', name: capitalize(target) }];
    return [{ action: 'unknown', reason: `I couldn't find a page called "${target}".` }];
  }

  // --- save/submit without confirmation words ---
  if (/^(?:save|submit|send|book|place)(?: the| this)? (?:form|medication|appointment|patient|prescription|order|referral|record|changes|it)$/.test(t)) return [{ action: 'submit_form' }];

  // --- pending slot answer (multi-turn) ---
  if (ctx.pendingSlot) {
    const slotForm = ctx.pendingSlot.formId;
    // A full medication phrase given in answer to "what medication?" is parsed into all its fields.
    if ((slotForm === 'medication' || slotForm === 'prescription') && /\d+\s*(mg|mcg|g|ml|units?)\b/.test(t)) {
      const parsed = parseMedicationPhrase(t);
      if (parsed.medicationName && Object.keys(parsed).length > 1) return [{ action: 'fill_form', formId: slotForm, fields: parsed }];
    }
    return [{ action: 'fill_field', formId: slotForm, field: ctx.pendingSlot.field, value: (rawClause ?? clause).trim() }];
  }

  // --- bare medication phrase while a medication form is open ---
  if ((ctx.openFormId === 'medication' || ctx.openFormId === 'prescription') && looksLikeMedication(t)) {
    return [{ action: 'fill_form', formId: ctx.openFormId, fields: parseMedicationPhrase(t) }];
  }

  return [{ action: 'unknown', reason: `I didn't understand "${clause}".` }];
}

function looksLikeMedication(phrase: string): boolean {
  return /\d+\s*(mg|mcg|g|ml|units?)\b/.test(phrase) || /\b(daily|twice|once|bid|tid|qid|prn|as needed|every \d+ hours|tablet|capsule)\b/.test(phrase) || /^[a-z]+(?:\s[a-z]+)?$/.test(phrase.trim());
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
    // Carry forward context between clauses: "open medication form and set dosage to 500 mg".
    for (const c of cmds) {
      if (c.action === 'open_form') workingCtx = { ...workingCtx, openFormId: c.formId };
      if (c.action === 'add_medication') workingCtx = { ...workingCtx, openFormId: 'medication' };
      if (c.action === 'create_appointment') workingCtx = { ...workingCtx, openFormId: 'appointment' };
      if (c.action === 'register_patient') workingCtx = { ...workingCtx, openFormId: 'patient' };
      if (c.action === 'navigate') workingCtx = { ...workingCtx, currentPageId: typeof c.target === 'string' ? c.target : PageRegistry.getByNumber(c.target)?.id ?? null };
    }
  }
  return commands;
}
