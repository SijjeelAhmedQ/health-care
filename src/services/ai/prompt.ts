import type { AIContext } from '@/types/ai';
import { FieldRegistry, type FormDefinition } from '@/registry/fieldRegistry';
import { PageRegistry } from '@/registry/pageRegistry';

/**
 * Prompt for the local Qwen model. The model's only job is to translate natural
 * language into one of the structured commands below. Application behaviour is
 * deterministic and lives in commandExecutor.ts.
 *
 * Why the split into a STATIC system prompt and a per-request user message:
 * Qwen 3.5 is a hybrid (recurrent-state) model, so llama.cpp cannot roll its
 * cache back to an arbitrary token. It only keeps checkpoints of the recurrent
 * state at the END of each prompt and at END-508, and on the next request
 * resumes from the last checkpoint that lies inside the shared prefix. On a
 * GTX 1650 prompt processing runs at ~75 tok/s, so anything that changes the
 * system prompt (page, open form, today's date) costs ~7 s per command.
 *
 * With a byte-for-byte identical system prompt on every request, a padded
 * warm-up (see OllamaLLMProvider.warmUp) parks a checkpoint just before the
 * user turn, and each real command only pays for its own ~60 tokens (<1 s).
 * Nothing in buildSystemPrompt() may therefore depend on runtime state; all of
 * that goes through buildUserMessage().
 */
export function buildSystemPrompt(): string {
  const describeForm = (f: FormDefinition) =>
    `${f.id}: ${f.fields.map((fd) => `${fd.name}${fd.required ? '*' : ''}${fd.options ? `(${fd.options.slice(0, 4).join('|')}${fd.options.length > 4 ? '|…' : ''})` : ''}`).join(', ')}`;
  const pageIds = PageRegistry.all()
    .map((p) => `${p.number} ${p.id}`)
    .join(' · ');

  return `Convert a clinician's spoken command into JSON for CareFlow, a patient-centric practice-management UI.
The app has exactly eight modules: Dashboard, Patient, Medication, Diagnosis, Task, Recall, Appointment, Summary.
ONE patient is selected at a time; every medication, diagnosis, task, recall and appointment belongs to that selected patient.
The user message has a CONTEXT line (today's date, current page, selected patient, open form, pending question) and a COMMAND line.
Output ONLY {"commands":[...]} — commands in order, no prose. "X and Y" → two commands.

RULES
- Never invent data; include only values the user said. Omit unknown fields.
- Normalize: "twice a day"→"Twice daily", "orally"→"Oral", "500 milligrams"→"500 mg", "seven days"→"7 days", dates→YYYY-MM-DD (relative to today from CONTEXT), times→HH:mm.
- Adding/changing/removing a record → add_record / update_record / delete_record with the right "kind".
- kind is one of: medication, diagnosis, task, recall, appointment, patient.
- delete_record NEVER deletes on its own — the app asks the user to confirm. Still emit it when the user asks to delete.
- "match" identifies an existing record in plain words ("the metformin", "blood pressure task").
- submit_form only on explicit save/submit/send. "save it"/"yes"/"theek hai"→confirm. "cancel"/"no"→cancel.
- Choosing who to work on → select_patient{name}. Looking someone up → search_patient{query}.
- Reading data aloud → read_records{kind}. A whole-patient overview → summarize_patient.
- "dashboard summary" (the panel on the right) → open_dashboard_summary / close_dashboard_summary. A spoken overview stays summarize_patient.
- Summary tabs → open_tab{tab} with tab one of: ai-summary, medication, recall, appointment, diagnosis, task.
- navigate target = page NUMBER the user said, else the closest id from PAGES.
- Several drugs in one sentence → ONE add_record{kind:"medication"} with "records":[one per drug]; shared frequency/duration on each. Never join names.
- If a pending question is open and the user gives a plain value → fill_field; if they give more (a full medication phrase) → fill_form with every field said.
- INBOX (lab, radiology, referral, discharge items): category → inbox_view{view}; search → inbox_search{query,view?}; "open the second record"/"next" → inbox_open{target:2|"next"|"previous"|"this"|"last",category?}; "file this"/"unfile it" → inbox_file{file:true|false,target?}. Positions count the list on screen.
- "stop listening"/"mic off"/"exit voice mode" → stop_listening. "open first patient" → select_patient_at{position:1}.
- Unmappable → {"action":"unknown","reason":"..."}.

COMMANDS
navigate{target} · go_back · go_home · open_tab{tab} · scroll{direction|section} · toggle_sidebar · open_dashboard_summary · close_dashboard_summary
select_patient{name} · search_patient{query} · clear_patient
add_record{kind,fields?,records?[]} · update_record{kind,match,fields?} · delete_record{kind,match} · search_records{kind,query} · read_records{kind} · summarize_patient
open_form{formId} · close_form · fill_form{formId?,fields} · fill_field{field,value} · select_dropdown{field,value} · set_checkbox{field,checked} · clear_field{field} · focus_field{field} · add_entry
submit_form · confirm · cancel · ask_user{question,field?} · respond{message} · unknown{reason}
inbox_view{view:all|lab|radiology|referral|discharge} · inbox_search{query,view?} · inbox_clear_search · inbox_open{target,category?} · inbox_close · inbox_file{file,target?,category?} · inbox_scope{scope:patient|all} · inbox_select_patient
stop_listening · start_listening · select_patient_at{position} · help

PAGES (number id)
${pageIds}

FORM FIELDS (* required)
${FieldRegistry.forms().map(describeForm).join('\n')}

EXAMPLES (CONTEXT omitted; today = 2026-01-10 where a date matters)
"select patient ahmed khan" → {"commands":[{"action":"select_patient","name":"Ahmed Khan"}]}
"open medications" → {"commands":[{"action":"navigate","target":"medications"}]}
"go to page 5" → {"commands":[{"action":"navigate","target":5}]}
"add amoxicillin 500 mg orally twice daily for seven days" → {"commands":[{"action":"add_record","kind":"medication","fields":{"medicationName":"Amoxicillin","dosage":"500 mg","route":"Oral","frequency":"Twice daily","duration":"7 days"}}]}
"add panadol and metformin twice daily for 10 days" → {"commands":[{"action":"add_record","kind":"medication","fields":{"medicationName":"Panadol","frequency":"Twice daily","duration":"10 days"},"records":[{"medicationName":"Panadol","frequency":"Twice daily","duration":"10 days"},{"medicationName":"Metformin","frequency":"Twice daily","duration":"10 days"}]}]}
"add diagnosis hypertension" → {"commands":[{"action":"add_record","kind":"diagnosis","fields":{"description":"Hypertension"}}]}
"create a task for blood pressure monitoring due next friday" → {"commands":[{"action":"add_record","kind":"task","fields":{"title":"Blood pressure monitoring","category":"Monitoring","dueDate":"2026-01-16"}}]}
"recall the patient in two weeks for a blood pressure review" → {"commands":[{"action":"add_record","kind":"recall","fields":{"type":"Follow-up","reason":"Blood pressure review","dueDate":"2026-01-24"}}]}
"book an appointment next tuesday at 3 pm for chest pain" → {"commands":[{"action":"add_record","kind":"appointment","fields":{"date":"2026-01-13","startTime":"15:00","reason":"Chest pain"}}]}
"mark the blood pressure task as completed" → {"commands":[{"action":"update_record","kind":"task","match":"blood pressure","fields":{"status":"Completed"}}]}
"delete the metformin" → {"commands":[{"action":"delete_record","kind":"medication","match":"metformin"}]}
"read the medication list" → {"commands":[{"action":"read_records","kind":"medication"}]}
"give me a summary of this patient" → {"commands":[{"action":"summarize_patient"}]}
"show me dashboard summary" → {"commands":[{"action":"open_dashboard_summary"}]}
"close dashboard summary" → {"commands":[{"action":"close_dashboard_summary"}]}
"open summary and show me the diagnosis tab" → {"commands":[{"action":"navigate","target":"summary"},{"action":"open_tab","tab":"diagnosis"}]}
"add patient bilal hussain, male, 32 years old" → {"commands":[{"action":"add_record","kind":"patient","fields":{"firstName":"Bilal","lastName":"Hussain","gender":"Male","age":32}}]}
"set dosage to 250 mg" → {"commands":[{"action":"fill_field","field":"dosage","value":"250 mg"}]}
"save it" → {"commands":[{"action":"confirm"}]}
"open the second referral" → {"commands":[{"action":"inbox_open","target":2,"category":"referral"}]}
"file this" → {"commands":[{"action":"inbox_file","file":true,"target":"this"}]}`;
}

/** The per-request part: runtime context on one line, then the transcript. */
export function buildUserMessage(transcript: string, context: AIContext): string {
  const pending = context.pendingSlot ? `${context.pendingSlot.label} (${context.pendingSlot.formId}.${context.pendingSlot.field})` : 'none';
  return `CONTEXT: today ${new Date().toISOString().slice(0, 10)} | page ${context.currentPageId ?? 'none'} (#${context.currentPageNumber ?? '-'}) | tab ${context.currentTab ?? 'none'} | selected patient ${context.currentPatientName ?? 'NONE — patient-dependent commands need one'} | open form ${context.openFormId ?? 'none'} | awaiting confirmation ${context.awaitingConfirmation ? 'YES' : 'no'} | pending question ${pending}
COMMAND: ${transcript}`;
}
