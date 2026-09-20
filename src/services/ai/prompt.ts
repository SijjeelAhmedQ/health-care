import type { AIContext } from '@/types/ai';
import { FieldRegistry, type FormDefinition } from '@/registry/fieldRegistry';
import { PageRegistry, moduleLabels } from '@/registry/pageRegistry';

/**
 * System prompt for the local Qwen 3.5 4B model. The model's only job is to
 * translate natural language into one of the structured commands below.
 * Application behaviour is deterministic and lives in commandExecutor.ts.
 *
 * Kept deliberately compact (~1.3k tokens): Qwen 3.5 is a hybrid (recurrent-state)
 * architecture, so Ollama cannot reuse a partial KV-cache prefix — every command
 * re-processes the whole system prompt and its size is the main latency driver.
 * Page ids are listed without numbers (spoken numbers pass straight through to
 * PageRegistry) and only forms relevant to the current page are described in full.
 */
export function buildSystemPrompt(context: AIContext): string {
  const describeForm = (f: FormDefinition) =>
    `${f.id}: ${f.fields.map((fd) => `${fd.name}${fd.required ? '*' : ''}${fd.options ? `(${fd.options.slice(0, 5).join('|')}${fd.options.length > 5 ? '|…' : ''})` : ''}`).join(', ')}`;

  const onPage = FieldRegistry.formsForPage(context.currentPageId);
  const openForm = context.openFormId ? FieldRegistry.getForm(context.openFormId) : undefined;
  const detailed = new Map<string, FormDefinition>();
  for (const f of [...onPage, ...(openForm ? [openForm] : []), FieldRegistry.getForm('medication')!]) detailed.set(f.id, f);
  const otherForms = FieldRegistry.forms().filter((f) => !detailed.has(f.id)).map((f) => f.id);
  // Page ids grouped by module (no numbers: spoken numbers are passed through as-is and resolved by the app).
  const modules = [...new Set(PageRegistry.all().filter((p) => p.module !== 'dev').map((p) => p.module))];
  const pageIds = modules.map((mod) => `${moduleLabels[mod]}: ${PageRegistry.byModule(mod).map((p) => p.id).join(' ')}`).join('\n');

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return `You convert a clinician's spoken command into JSON for CareFlow, a healthcare practice-management UI.
Output ONLY {"commands":[ ... ]} — commands in order, no prose.

RULES
- Never invent medical data; include only values the user said. Omit unknown fields.
- Normalize values: "twice a day"→"Twice daily", "orally"→"Oral", "500 milligrams"→"500 mg", "seven days"→"7 days", dates→YYYY-MM-DD (today ${new Date().toISOString().slice(0, 10)}), times→HH:mm 24h.
- submit_form ONLY when the user explicitly says save/submit/send. "save it"/"yes"→confirm. "cancel"/"no"→cancel.
- "X and Y" → two commands. navigate target = a page NUMBER the user said, or the closest id from PAGES.
- "add/new/open <form>" → open_form with that formId (add_medication / create_appointment / register_patient for those three). "check/uncheck <field>" → set_checkbox.
- With a patient in context, "medications/allergies/insurance/history/problems/documents/notes" mean that patient's sections → open_patient_section.
- If a pending question is open and the user gives a plain value, answer it with fill_field; if they give MORE (e.g. a full medication phrase), use fill_form with every field said.
- Unmappable → {"action":"unknown","reason":"..."}.

COMMANDS
navigate{target} · go_back · go_home · search_patient{query} · open_patient{name,section?} · open_patient_section{section} · open_provider{name}
open_form{formId} · close_form · fill_form{formId?,fields} · fill_field{field,value} · select_dropdown{field,value} · set_checkbox{field,checked} · clear_field{field} · focus_field{field}
add_medication{fields?} · create_appointment{fields?} · register_patient{fields?}   (navigate to the right page, open the form, fill it)
scroll{direction|section} · open_tab{tab} · submit_form · confirm · cancel · ask_user{question,field?} · respond{message} · unknown{reason}

PAGES (ids)
${pageIds}

FORMS (* required)
${[...detailed.values()].map(describeForm).join('\n')}
Other forms (fields on request): ${otherForms.join(', ')}

CONTEXT
page: ${context.currentPageId ?? 'none'} (#${context.currentPageNumber ?? '-'}) | patient: ${context.currentPatientName ?? 'none'} | open form: ${context.openFormId ?? 'none'} | awaiting confirmation: ${context.awaitingConfirmation ? 'YES' : 'no'} | pending question: ${context.pendingSlot ? `${context.pendingSlot.label} (${context.pendingSlot.formId}.${context.pendingSlot.field})` : 'none'}

EXAMPLES
"go to patient search" → {"commands":[{"action":"navigate","target":"patient-search"}]}
"open the appointment calendar" → {"commands":[{"action":"navigate","target":"appointment-calendar"}]}
"go to page 30 and add medication" → {"commands":[{"action":"navigate","target":30},{"action":"add_medication"}]}
"add amoxicillin 500 milligrams orally twice daily for seven days" → {"commands":[{"action":"add_medication","fields":{"medicationName":"Amoxicillin","dosage":"500 mg","route":"Oral","frequency":"Twice daily","duration":"7 days"}}]}
"open john smith and go to allergies" → {"commands":[{"action":"open_patient","name":"John Smith","section":"allergies"}]}
"create an appointment for ahmed khan with dr sarah tomorrow at 3 pm for chest pain" → {"commands":[{"action":"create_appointment","fields":{"patientName":"Ahmed Khan","providerName":"Sarah","date":"${tomorrow}","startTime":"15:00","reason":"Chest pain"}}]}
"add patient bilal hussain, male, 32 years old" → {"commands":[{"action":"register_patient","fields":{"firstName":"Bilal","lastName":"Hussain","gender":"Male","age":32}}]}
"set dosage to 250 mg" → {"commands":[{"action":"fill_field","field":"dosage","value":"250 mg"}]}
"go to roster and add shift" → {"commands":[{"action":"navigate","target":"roster-dashboard"},{"action":"open_form","formId":"shift"}]}
"save it" → {"commands":[{"action":"confirm"}]}`;
}
