/**
 * Every tool the assistant can call. The model chooses among these on its own;
 * nothing else decides what an utterance means.
 *
 * Schemas are generated from the registries rather than written out: page ids
 * and descriptions from the PageRegistry, record fields (names, types, select
 * options, format hints) from the FieldRegistry. Adding a field to a form or a
 * page to the app changes what the model is told automatically.
 *
 * The tool list is identical on every request (nothing session-specific is in
 * it), so the runtime keeps it in its prompt cache. Live data the model needs —
 * provider names, patients, records — comes back from the tools themselves.
 */
import { z } from 'zod';
import { FieldRegistry, type FieldDefinition } from '@/registry/fieldRegistry';
import { PageRegistry } from '@/registry/pageRegistry';
import { RECORD_KINDS, type RecordKind } from '@/types/records';
import type { FieldValues } from '@/types/ai';
import { defineTool, noArgs, type Tool } from './tool';

const plural: Record<RecordKind, string> = { medication: 'medications', diagnosis: 'diagnoses', task: 'tasks', recall: 'recalls', appointment: 'appointments' };

/** Accept an option in any letter case, return it exactly as the option is written. */
function optionEnum(options: string[]) {
  return z.preprocess((v) => (typeof v === 'string' ? (options.find((o) => o.toLowerCase() === v.trim().toLowerCase()) ?? v) : v), z.enum(options as [string, ...string[]]));
}

function fieldSchema(field: FieldDefinition): z.ZodTypeAny {
  // The field name already says what it is; the description only carries what the name does not.
  // Whether a field is required is not the model's concern: a value the provider did not say is left
  // out and the app asks for it — telling the model "required" only tempts it to make one up.
  const notes = [field.hint ?? ''].filter(Boolean);
  let schema: z.ZodTypeAny;
  switch (field.type) {
    case 'number':
      schema = z.number();
      break;
    case 'checkbox':
      schema = z.boolean();
      break;
    case 'date':
      schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
      notes.push('YYYY-MM-DD');
      break;
    case 'time':
      schema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use 24-hour HH:mm');
      notes.push('HH:mm');
      break;
    case 'select':
      schema = field.options ? optionEnum(field.options) : z.string();
      if (field.optionsFrom === 'providers') notes.push("a provider's name");
      break;
    default:
      schema = z.string();
  }
  return notes.length ? schema.optional().describe(notes.join('; ')) : schema.optional();
}

/** The fields of a form as an object schema: every field optional (the app asks for missing required ones). */
function formSchema(formId: string) {
  const def = FieldRegistry.getForm(formId)!;
  return z.object(Object.fromEntries(def.fields.map((f) => [f.name, fieldSchema(f)])));
}

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const recordKind = z.enum(RECORD_KINDS);
const inboxTarget = z
  .union([z.number().int().positive(), z.enum(['this', 'next', 'previous', 'last'])])
  .describe('A position in the Inbox list on screen (1 = first), or this / next / previous / last');

export function buildTools(): Tool[] {
  const pages = PageRegistry.all();
  const pageIds = pages.map((p) => p.id) as [string, ...string[]];
  const pageList = pages.map((p) => `${p.id} (${p.title}${p.requiresPatient ? ', needs a patient' : ''})`).join(', ');
  const patientFields = formSchema('patient');
  const patientFieldNames = FieldRegistry.getForm('patient')!.fields.map((f) => f.name) as [string, ...string[]];
  const summaryTabs = PageRegistry.summaryTabs().map((p) => p.id) as [string, ...string[]];

  const tools: Tool[] = [
    // ---------------------------------------------------------------- pages
    defineTool({
      name: 'open_page',
      description: `Open a page or a Summary tab: ${pageList}.`,
      parameters: z.object({ page: z.enum(pageIds).describe('Page id') }),
      progress: ({ page }) => `Opening ${PageRegistry.get(page)?.title ?? page}…`,
      run: ({ page }, { runtime }) => runtime.openPage(page),
    }),
    defineTool({
      name: 'go_back',
      description: 'Go back to the previous screen (in the Inbox: close the open record).',
      parameters: noArgs,
      run: async (_, { runtime }) => runtime.goBack(),
    }),
    defineTool({
      name: 'scroll_page',
      description: 'Scroll the current page.',
      parameters: z.object({ direction: z.enum(['up', 'down', 'top', 'bottom']) }),
      run: async ({ direction }, { runtime }) => runtime.scroll(direction),
    }),
    defineTool({
      name: 'dashboard_summary_panel',
      description:
        "Show (or hide) the summary of the provider's day in the panel on the right of the Dashboard. Use it whenever the provider asks for a summary or overview of their day or dashboard; the summary is shown there, not in your reply.",
      parameters: z.object({ open: z.boolean() }),
      progress: () => 'Opening your dashboard summary…',
      run: ({ open }, { runtime }) => runtime.setDashboardPanel(open),
    }),
    defineTool({
      name: 'control_list',
      description:
        'Search, filter or page the list on screen (see CONTEXT: list on screen), e.g. {"filter": "Status", "value": "Active"}, {"page": "next"}, {"search": "khan"}, {"clear": true}.',
      parameters: z.object({
        search: z.string().optional().describe('Text to search for; "" clears the search'),
        filter: z.string().optional().describe('A filter of the list, by its name'),
        value: z.string().optional().describe('The option to filter by; "all" removes that filter'),
        clear: z.boolean().optional().describe('Clear the search and every filter'),
        page: z.union([z.number().int().positive(), z.enum(['next', 'previous', 'first', 'last'])]).optional(),
      }),
      run: (args, { runtime }) => runtime.controlList(args),
    }),
    defineTool({
      name: 'patient_summary_panel',
      description: 'Show or hide the panel docked on the right that summarises the selected patient at a glance.',
      parameters: z.object({ open: z.boolean() }),
      run: async ({ open }, { runtime }) => runtime.setPatientPanel(open),
    }),

    // ------------------------------------------------------------- patients
    defineTool({
      name: 'search_patients',
      description: 'Find patients by name, MRN or phone. Shows the results on the Patients page (numbered in on-screen order) and returns them with their ids.',
      parameters: z.object({ query: z.string().min(1) }),
      progress: ({ query }) => `Searching patients for “${query}”…`,
      run: ({ query }, { runtime }) => runtime.searchPatients(query),
    }),
    defineTool({
      name: 'select_patient',
      description:
        'Make a patient the selected patient — the one the Summary, records and Inbox filing work on — and open their Summary (or the given Summary tab). Identify the patient by id, full name or MRN as the provider said it (no need to search first), or by position in the patient list on screen.',
      parameters: z.object({
        patient: z.string().optional().describe('Patient id, full name or MRN'),
        list_position: z.number().int().positive().optional().describe('Position in the patient search results on screen (1 = first)'),
        open_tab: z.enum(summaryTabs).optional().describe('Summary tab to open after selecting'),
      }),
      progress: ({ patient }) => `Selecting ${patient ?? 'the patient'}…`,
      run: ({ patient, list_position, open_tab }, { runtime }) => runtime.selectPatient({ patient, position: list_position, page: open_tab }),
    }),
    defineTool({
      name: 'clear_selected_patient',
      description: 'Stop working on the selected patient (no patient selected afterwards).',
      parameters: noArgs,
      run: async (_, { runtime }) => runtime.clearPatient(),
    }),
    defineTool({
      name: 'create_patient',
      description: 'Add a new patient: opens the new-patient form from any page, filled with whatever details were said (none is fine — the app asks for what is missing, and for confirmation before saving).',
      parameters: patientFields,
      progress: () => 'Opening the new patient form…',
      run: (fields, { runtime }) => runtime.createRecords('patient', [fields as FieldValues]),
    }),
    defineTool({
      name: 'edit_patient',
      description:
        "Change an existing patient's details: opens their form and changes only the fields given. With ask_for_field instead of changes, asks the user for that field's new value. Omit patient and list_position for the selected patient.",
      parameters: z.object({
        patient: z.string().optional().describe('Patient id, full name or MRN'),
        list_position: z.number().int().positive().optional().describe('Position in the patient search results on screen'),
        changes: z.record(z.string(), scalar).optional().describe('Only the fields to change — same names and formats as create_patient'),
        ask_for_field: z.enum(patientFieldNames).optional().describe('A field the user wants to change without having said the new value'),
      }),
      progress: () => 'Opening the patient for editing…',
      run: ({ patient, list_position, changes, ask_for_field }, { runtime }) =>
        runtime.editPatient({ patient, position: list_position, changes: changes as FieldValues | undefined, askFor: ask_for_field }),
    }),
    defineTool({
      name: 'delete_patient',
      description: 'Delete a patient. Shows the patient and asks the user to confirm; nothing is deleted until they do.',
      parameters: z.object({
        patient: z.string().optional().describe('Patient id, full name or MRN; omit for the selected patient'),
        list_position: z.number().int().positive().optional().describe('Position in the patient search results on screen'),
      }),
      run: ({ patient, list_position }, { runtime }) => runtime.deletePatient(patient, list_position),
    }),

    // -------------------------------------------------------------- records
    defineTool({
      name: 'add_care_plan',
      description:
        'Add records of SEVERAL kinds at once — e.g. medications plus a diagnosis, a task, a recall and an appointment said in one request. Opens the Care Plan on the Summary: one tab per kind, one tab per record, all filled with what was said, saved together after one confirmation. Give patient to select that patient first. Each list uses the same fields as the matching add_* tool; a dose, frequency or duration said once for several drugs applies to each of them.',
      parameters: z.object({
        patient: z.string().optional().describe('Patient full name, id or MRN when the provider names one; omit for the selected patient'),
        ...Object.fromEntries(RECORD_KINDS.map((kind) => [plural[kind], z.array(formSchema(kind)).optional()])),
      }),
      progress: () => 'Opening the care plan…',
      run: (args, { runtime }) => {
        const { patient, ...lists } = args as { patient?: string } & Record<string, FieldValues[] | undefined>;
        return runtime.addCarePlan({ patient, items: Object.fromEntries(RECORD_KINDS.map((kind) => [kind, lists[plural[kind]] ?? []])) });
      },
    }),
    ...RECORD_KINDS.map((kind) =>
      defineTool({
        name: `add_${plural[kind]}`,
        description: `Add one or more ${plural[kind]} (and nothing else) to the selected patient: opens the ${kind} form (one tab per ${kind}) filled with what was said. The app asks for missing required fields and for confirmation before saving. With records of other kinds in the same request use add_care_plan.`,
        parameters: z.object({ [plural[kind]]: z.array(formSchema(kind)).min(1) }),
        progress: () => `Opening the ${kind} form…`,
        run: (args, { runtime }) => runtime.createRecords(kind, (args as Record<string, FieldValues[]>)[plural[kind]]),
      }),
    ),
    defineTool({
      name: 'update_record',
      description:
        "Change an existing record of the selected patient: opens it for editing and writes only the given changes, then asks for confirmation. `changes` uses the same field names and values as the matching add_* tool (e.g. {\"status\": \"Discontinued\"}, {\"dueDate\": \"2026-10-01\"}).",
      parameters: z.object({
        kind: recordKind,
        record: z.string().describe("The record's id if you have it, otherwise its name/title as the user said it — no need to look it up first"),
        changes: z.record(z.string(), scalar).describe('Field name → new value'),
      }),
      progress: ({ kind }) => `Opening the ${kind} for editing…`,
      run: ({ kind, record, changes }, { runtime }) => runtime.updateRecord(kind, record, changes),
    }),
    defineTool({
      name: 'delete_record',
      description: 'Delete a record of the selected patient. Shows it and asks the user to confirm; nothing is deleted until they do.',
      parameters: z.object({ kind: recordKind, record: z.string().describe("The record's id if you have it, otherwise its name/title as the user said it — no need to look it up first") }),
      run: ({ kind, record }, { runtime }) => runtime.deleteRecord(kind, record),
    }),
    defineTool({
      name: 'list_records',
      description: "The SELECTED PATIENT's records of one kind (with ids), shown in their Summary tab — to answer questions about that patient's records or find a record's id. Not for the provider's own schedule (get_provider_overview).",
      parameters: z.object({ kind: recordKind, status: z.string().optional().describe('Only records with this status, e.g. Active, Open, Due') }),
      progress: ({ kind }) => `Reading the ${plural[kind]}…`,
      run: ({ kind, status }, { runtime }) => runtime.listRecords(kind, status),
    }),

    // ---------------------------------------------------------------- forms
    defineTool({
      name: 'fill_open_form',
      description:
        'Set fields on the form that is open now (see CONTEXT: open form and its values) — e.g. {"frequency": "Twice daily"}. Use it to answer a pending question or to change what the form holds. Arguments are the form\'s own field names, in the same formats as the add_* tools.',
      parameters: z.object({}).catchall(scalar),
      progress: () => 'Filling the form…',
      run: (fields, { runtime }) => runtime.fillOpenForm(fields as FieldValues),
    }),
    defineTool({
      name: 'clear_form_field',
      description: 'Empty one field of the open form.',
      parameters: z.object({ field: z.string() }),
      run: async ({ field }, { runtime }) => runtime.clearFormField(field),
    }),
    defineTool({
      name: 'save_open_form',
      description: 'The user asked to save the open form. If a save is already waiting for their confirmation, this is that confirmation and it saves; otherwise it checks the form and asks them to confirm.',
      parameters: noArgs,
      run: (_, { runtime }) => runtime.saveOpenForm(),
    }),
    defineTool({
      name: 'confirm_pending_action',
      description:
        'Carry out the pending save / delete / filing shown in CONTEXT. Call it ONLY when the user has just said yes / confirm / save / delete it in reply to that pending confirmation — never on your own initiative.',
      parameters: noArgs,
      progress: () => 'Applying…',
      run: (_, { runtime }) => runtime.confirm(),
    }),
    defineTool({
      name: 'cancel_pending_action',
      description: 'The user said no / cancel / stop: drop the pending confirmation or question and close the open form without saving.',
      parameters: noArgs,
      run: async (_, { runtime }) => runtime.cancel(),
    }),

    // ---------------------------------------------------------- information
    defineTool({
      name: 'get_provider_overview',
      description:
        "Data about the signed-in provider's own day (appointments today and this week, open tasks, recalls due, unfiled Inbox) to answer a specific question such as \"when is my next appointment\" — answer in one sentence. For a summary or overview of the day use dashboard_summary_panel instead.",
      parameters: noArgs,
      progress: () => 'Checking your schedule…',
      run: async (_, { runtime }) => runtime.providerOverview(),
    }),
    defineTool({
      name: 'get_patient_summary',
      description: "An overview of the selected patient built from their records: conditions, medications, tasks, recalls and appointments. Use it when asked about the patient as a whole.",
      parameters: noArgs,
      progress: () => 'Summarising the patient…',
      run: async (_, { runtime }) => runtime.patientSummary(),
    }),

    // ---------------------------------------------------------------- inbox
    defineTool({
      name: 'inbox_show',
      description: 'Open the Inbox (lab results, radiology reports, referrals, discharge summaries) and set what it shows. Returns the list on screen, numbered.',
      parameters: z.object({
        category: z.enum(['all', 'lab', 'radiology', 'referral', 'discharge']).optional(),
        scope: z.enum(['selected_patient', 'all_patients']).optional().describe("Only the selected patient's items, or every patient's"),
        search: z.string().optional().describe('Text to search for; an empty string clears the search'),
      }),
      progress: () => 'Opening the Inbox…',
      run: (args, { runtime }) => runtime.inboxShow(args),
    }),
    defineTool({
      name: 'inbox_open_item',
      description: 'Open an Inbox record to read it. Returns its content.',
      parameters: z.object({ target: inboxTarget }),
      progress: () => 'Opening the record…',
      run: ({ target }, { runtime }) => runtime.inboxOpen(target),
    }),
    defineTool({
      name: 'inbox_file_item',
      description: 'File an Inbox record as reviewed (file = true) or move it back to unfiled (file = false). Only records of the selected patient; asks for confirmation.',
      parameters: z.object({ file: z.boolean(), target: inboxTarget.optional() }),
      run: async ({ file, target }, { runtime }) => runtime.inboxFile(file, target ?? 'this'),
    }),
    defineTool({
      name: 'inbox_select_item_patient',
      description: "Make the open Inbox record's patient the selected patient.",
      parameters: noArgs,
      run: async (_, { runtime }) => runtime.inboxSelectPatient(),
    }),

    // ------------------------------------------------------------ AI Summary
    defineTool({
      name: 'add_extracted_item',
      description: 'Open an item the AI Summary extracted from a note (see CONTEXT) in its form, pre-filled, to review and save.',
      parameters: z.object({ kind: recordKind, position: z.number().int().positive().default(1).describe('Which of the items of that kind (1 = first)') }),
      run: ({ kind, position }, { runtime }) => runtime.addExtractedItem(kind, position),
    }),

    // --------------------------------------------------------- configuration
    defineTool({
      name: 'get_ai_configuration',
      description: 'The AI models in use and what is available: the language model (runtime, model, settings) with every installed model, and the Omi Med STT speech model, backend, threads and timings with every model and backend this machine can run.',
      parameters: noArgs,
      progress: () => 'Reading the AI configuration…',
      run: (_, { runtime }) => runtime.aiConfiguration(),
    }),
    defineTool({
      name: 'set_language_model',
      description: 'Change the language model the assistant runs on, or its settings. The model must be installed (get_ai_configuration lists them) and able to call tools. Only give what the provider asked to change.',
      parameters: z.object({
        model: z.string().optional().describe('Installed model name, e.g. qwen3.5:2b'),
        runtime: z.enum(['ollama', 'openai-compatible', 'bridge']).optional(),
        server_url: z.string().optional(),
        context_window: z.number().int().optional().describe('Tokens'),
        gpu_layers: z.number().int().min(0).optional().describe('99 = whole model on the GPU, 0 = CPU'),
        timeout_seconds: z.number().int().positive().optional(),
        max_steps: z.number().int().min(1).max(12).optional(),
      }),
      progress: () => 'Changing the language model…',
      run: (args, { runtime }) => runtime.setLanguageModel(args),
    }),
    defineTool({
      name: 'set_speech_recognition',
      description: 'Change the speech recognition settings (Omi Med STT or NVIDIA Parakeet). Only give what the provider asked to change.',
      parameters: z.object({
        model: z.string().optional().describe('Words from the speech model name, e.g. "omi", "parakeet", "mlx 8-bit"'),
        backend: z.enum(['cpu', 'cuda', 'vulkan']).optional().describe('cuda = the GPU'),
        precision: z.enum(['int8', 'fp32']).optional().describe('Parakeet only'),
        cpu_threads: z.number().int().min(0).max(64).optional().describe('0 = automatic'),
        pause_ms: z.number().int().min(200).max(5000).optional().describe('The pause that ends a sentence'),
        live_text_ms: z.number().int().min(200).max(5000).optional().describe('How often the live text refreshes'),
      }),
      progress: () => 'Changing speech recognition…',
      run: (args, { runtime }) => runtime.setSpeechRecognition(args),
    }),

    // ------------------------------------------------------------ application
    defineTool({
      name: 'sign_out',
      description: 'Sign the provider out of the application.',
      parameters: noArgs,
      run: async (_, { runtime }) => runtime.signOut(),
    }),
    defineTool({
      name: 'spoken_replies',
      description: 'Turn the spoken (read-aloud) replies on or off.',
      parameters: z.object({ on: z.boolean() }),
      run: async ({ on }, { runtime }) => runtime.setSpokenReplies(on),
    }),
    defineTool({
      name: 'sidebar',
      description: 'Collapse or expand the navigation sidebar.',
      parameters: z.object({ collapsed: z.boolean() }),
      run: async ({ collapsed }, { runtime }) => runtime.setSidebarCollapsed(collapsed),
    }),
    defineTool({
      name: 'show_help',
      description: 'Show the list of everything the assistant can do.',
      parameters: noArgs,
      run: async (_, { runtime }) => runtime.openHelp(),
    }),

    // ---------------------------------------------------------------- voice
    defineTool({
      name: 'stop_listening',
      description: 'Turn the microphone off (the user said stop listening, mic off, that is all…).',
      parameters: noArgs,
      run: async (_, { runtime }) => runtime.stopListening(),
    }),
    defineTool({
      name: 'wait_for_more_speech',
      description: 'What was said is an unfinished fragment (cut off mid-sentence). Nothing is done; it is joined with what the user says next.',
      parameters: noArgs,
      run: async () => ({ ok: true, message: 'Waiting for the rest of the sentence.' }),
    }),
    defineTool({
      name: 'take_clinical_note',
      description:
        'The user is dictating a clinical note about the selected patient (findings, medications, diagnoses, follow-ups in running speech) rather than giving a command. Pass the note text; it opens in the AI Summary where the items are extracted for review. Without a note, starts dictation.',
      parameters: z.object({ note: z.string().optional().describe('The dictated note, word for word') }),
      run: async ({ note }, { runtime }) => runtime.takeNote(note),
    }),
    defineTool({
      name: 'record_note_findings',
      description: 'ONLY when the message says TASK: EXTRACT. Report every item found in the clinical note. Never use it for a spoken command.',
      parameters: z.object({
        ...Object.fromEntries(
          RECORD_KINDS.map((kind) => [plural[kind], z.array(z.record(z.string(), scalar)).optional().describe(`Items with the same fields as add_${plural[kind]}, plus "quote": the words of the note`)]),
        ),
        questions: z.array(z.string()).optional().describe('Anything ambiguous or incomplete, as a short question — instead of guessing'),
      }),
      run: async () => ({ ok: false, message: 'record_note_findings is only for extracting a note. For a dictated note use take_clinical_note.' }),
    }),
  ];
  return tools;
}

export const NOTE_FINDINGS_TOOL = 'record_note_findings';
export const WAIT_TOOL = 'wait_for_more_speech';
export const recordPlural = plural;
