/**
 * Structured command contract between the AI layer and the application.
 * The LLM (or the rule-based interpreter) must produce one of these; anything
 * else is rejected by the parser before it reaches the executor.
 */
import { z } from 'zod';

export const FieldValuesSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));
export type FieldValues = z.infer<typeof FieldValuesSchema>;

/** The six record types the application manages. Everything except `patient` hangs off the selected patient. */
export const RecordKindSchema = z.enum(['patient', 'medication', 'diagnosis', 'task', 'recall', 'appointment']);
export type AIRecordKind = z.infer<typeof RecordKindSchema>;

const NavigateSchema = z.object({
  action: z.literal('navigate'),
  /** Page id (e.g. "medications") or page number (e.g. 3). */
  target: z.union([z.string(), z.number()]),
  params: z.record(z.string(), z.string()).optional(),
});
const GoBackSchema = z.object({ action: z.literal('go_back') });
const GoHomeSchema = z.object({ action: z.literal('go_home') });

// ---- patient context -------------------------------------------------------
const SearchPatientSchema = z.object({ action: z.literal('search_patient'), query: z.string().min(1) });
/** Make a patient the active context for every module. */
const SelectPatientSchema = z.object({
  action: z.literal('select_patient'),
  name: z.string().optional(),
  mrn: z.string().optional(),
  patientId: z.string().optional(),
  /** Optional module to open right away, e.g. "medications". */
  section: z.string().optional(),
});
const ClearPatientSchema = z.object({ action: z.literal('clear_patient') });

// ---- records ---------------------------------------------------------------
const AddRecordSchema = z.object({
  action: z.literal('add_record'),
  kind: RecordKindSchema,
  fields: FieldValuesSchema.optional(),
  /** Several records in one utterance ("add panadol and metformin"); `fields` is the first entry. */
  records: z.array(FieldValuesSchema).optional(),
});
const UpdateRecordSchema = z.object({
  action: z.literal('update_record'),
  kind: RecordKindSchema,
  /** Free text identifying the record ("the metformin", "blood pressure task"). */
  match: z.string().optional(),
  recordId: z.string().optional(),
  fields: FieldValuesSchema.optional(),
});
const DeleteRecordSchema = z.object({
  action: z.literal('delete_record'),
  kind: RecordKindSchema,
  match: z.string().optional(),
  recordId: z.string().optional(),
});
const SearchRecordsSchema = z.object({ action: z.literal('search_records'), kind: RecordKindSchema, query: z.string() });
/** Read a record list back to the user (spoken + shown). */
const ReadRecordsSchema = z.object({ action: z.literal('read_records'), kind: RecordKindSchema });
/** A spoken overview of the selected patient, built only from data that exists. */
const SummarizePatientSchema = z.object({ action: z.literal('summarize_patient') });

// ---- legacy verb aliases (kept so older model outputs still work) ----------
const AddMedicationSchema = z.object({
  action: z.literal('add_medication'),
  fields: FieldValuesSchema.optional(),
  medications: z.array(FieldValuesSchema).optional(),
});
const CreateAppointmentSchema = z.object({ action: z.literal('create_appointment'), fields: FieldValuesSchema.optional() });
const RegisterPatientSchema = z.object({ action: z.literal('register_patient'), fields: FieldValuesSchema.optional() });
const OpenPatientSchema = z.object({ action: z.literal('open_patient'), name: z.string().optional(), mrn: z.string().optional(), patientId: z.string().optional(), section: z.string().optional() });

// ---- forms -----------------------------------------------------------------
const OpenFormSchema = z.object({ action: z.literal('open_form'), formId: z.string() });
const CloseFormSchema = z.object({ action: z.literal('close_form'), formId: z.string().optional() });
const FillFormSchema = z.object({
  action: z.literal('fill_form'),
  formId: z.string().optional(),
  fields: FieldValuesSchema,
  /** Several records for a multi-entry form (e.g. one medication per tab). `fields` is the first entry. */
  entries: z.array(FieldValuesSchema).optional(),
});
/** "Add another" on a multi-entry form: opens a blank tab next to the current record. */
const AddEntrySchema = z.object({ action: z.literal('add_entry'), formId: z.string().optional() });
const FillFieldSchema = z.object({ action: z.literal('fill_field'), field: z.string(), value: z.union([z.string(), z.number(), z.boolean()]), formId: z.string().optional() });
const SelectDropdownSchema = z.object({ action: z.literal('select_dropdown'), field: z.string(), value: z.string(), formId: z.string().optional() });
const SetCheckboxSchema = z.object({ action: z.literal('set_checkbox'), field: z.string(), checked: z.boolean(), formId: z.string().optional() });
const FocusFieldSchema = z.object({ action: z.literal('focus_field'), field: z.string(), formId: z.string().optional() });
const ClearFieldSchema = z.object({ action: z.literal('clear_field'), field: z.string(), formId: z.string().optional() });
const SubmitFormSchema = z.object({ action: z.literal('submit_form'), formId: z.string().optional() });

// ---- ui --------------------------------------------------------------------
const ScrollSchema = z.object({ action: z.literal('scroll'), direction: z.enum(['up', 'down', 'top', 'bottom']).optional(), section: z.string().optional() });
const OpenTabSchema = z.object({ action: z.literal('open_tab'), tab: z.string() });
const ConfirmSchema = z.object({ action: z.literal('confirm') });
const CancelSchema = z.object({ action: z.literal('cancel') });
const AskUserSchema = z.object({ action: z.literal('ask_user'), question: z.string(), field: z.string().optional(), formId: z.string().optional() });
const ToggleSidebarSchema = z.object({ action: z.literal('toggle_sidebar') });
/** Open the docked dashboard summary on the right of the screen (navigates to the Dashboard first). */
const OpenDashboardSummarySchema = z.object({ action: z.literal('open_dashboard_summary') });
const CloseDashboardSummarySchema = z.object({ action: z.literal('close_dashboard_summary') });
const HelpSchema = z.object({ action: z.literal('help') });

// ---- voice -----------------------------------------------------------------
/** "Stop listening", "mic off", "exit voice mode": the microphone goes off until the user turns it on again. */
const StopListeningSchema = z.object({ action: z.literal('stop_listening') });
const StartListeningSchema = z.object({ action: z.literal('start_listening') });
/** "Open the first patient" — the Nth patient in the current patient search. */
const SelectPatientAtSchema = z.object({
  action: z.literal('select_patient_at'),
  position: z.number().int().positive(),
  /** "Open patient" with no number: only act when the search found exactly one patient. */
  single: z.boolean().optional(),
});

// ---- inbox -----------------------------------------------------------------
export const InboxViewSchema = z.enum(['all', 'lab', 'radiology', 'referral', 'discharge']);
/**
 * Which Inbox record a command is about: a 1-based position in the list on
 * screen, a step from the open record, or the open record itself.
 */
export const InboxTargetSchema = z.union([z.number().int().positive(), z.enum(['this', 'next', 'previous', 'last'])]);
export type InboxTarget = z.infer<typeof InboxTargetSchema>;
const InboxViewCommandSchema = z.object({ action: z.literal('inbox_view'), view: InboxViewSchema });
const InboxSearchSchema = z.object({ action: z.literal('inbox_search'), query: z.string(), view: InboxViewSchema.optional() });
const InboxClearSearchSchema = z.object({ action: z.literal('inbox_clear_search') });
const InboxOpenSchema = z.object({ action: z.literal('inbox_open'), target: InboxTargetSchema, category: InboxViewSchema.optional() });
const InboxCloseSchema = z.object({ action: z.literal('inbox_close') });
/** File (file: true) or unfile (file: false) one record. Staged for confirmation when the user asked for that. */
const InboxFileSchema = z.object({ action: z.literal('inbox_file'), file: z.boolean(), target: InboxTargetSchema.optional(), category: InboxViewSchema.optional() });
/** Limit the Inbox to the selected patient's items, or show every patient again. */
const InboxScopeSchema = z.object({ action: z.literal('inbox_scope'), scope: z.enum(['patient', 'all']) });
/** Make the open record's patient the selected patient. */
const InboxSelectPatientSchema = z.object({ action: z.literal('inbox_select_patient') });
const RespondSchema = z.object({ action: z.literal('respond'), message: z.string() });
const UnknownSchema = z.object({ action: z.literal('unknown'), reason: z.string().optional() });

export const AICommandSchema = z.discriminatedUnion('action', [
  NavigateSchema, GoBackSchema, GoHomeSchema,
  SearchPatientSchema, SelectPatientSchema, ClearPatientSchema, OpenPatientSchema,
  AddRecordSchema, UpdateRecordSchema, DeleteRecordSchema, SearchRecordsSchema, ReadRecordsSchema, SummarizePatientSchema,
  AddMedicationSchema, CreateAppointmentSchema, RegisterPatientSchema,
  OpenFormSchema, CloseFormSchema, FillFormSchema, AddEntrySchema, FillFieldSchema, SelectDropdownSchema, SetCheckboxSchema, FocusFieldSchema, ClearFieldSchema, SubmitFormSchema,
  ScrollSchema, OpenTabSchema, ConfirmSchema, CancelSchema, AskUserSchema, ToggleSidebarSchema, OpenDashboardSummarySchema, CloseDashboardSummarySchema, HelpSchema, RespondSchema, UnknownSchema,
  StopListeningSchema, StartListeningSchema, SelectPatientAtSchema,
  InboxViewCommandSchema, InboxSearchSchema, InboxClearSearchSchema, InboxOpenSchema, InboxCloseSchema, InboxFileSchema, InboxScopeSchema, InboxSelectPatientSchema,
]);

export type AICommand = z.infer<typeof AICommandSchema>;
export type AICommandAction = AICommand['action'];

/** The LLM may return a single command or an ordered list (multi-step: "open summary and show diagnoses"). */
export const AICommandListSchema = z.union([AICommandSchema, z.array(AICommandSchema).min(1)]).transform((v) => (Array.isArray(v) ? v : [v]));

/** Actions that mutate data and therefore never run without an explicit confirmation. */
export const SENSITIVE_ACTIONS: ReadonlySet<AICommandAction> = new Set(['submit_form', 'delete_record']);

export interface AIContext {
  currentPageId: string | null;
  currentPageTitle: string | null;
  currentPageNumber: number | null;
  currentPatientId: string | null;
  currentPatientName: string | null;
  /** Active tab on a tabbed page (the Summary module). */
  currentTab: string | null;
  openFormId: string | null;
  openFormFields: string[];
  pendingSlot: { formId: string; field: string; label: string } | null;
  awaitingConfirmation: boolean;
  recentTranscripts: string[];
}

export interface LLMProvider {
  readonly name: string;
  generateCommands(transcript: string, context: AIContext): Promise<{ commands: AICommand[]; raw: string }>;
  /** Free-form completion used by the AI Summary extractor. Optional: not every provider supports it. */
  complete?(systemPrompt: string, userMessage: string, options?: { timeoutMs?: number; maxTokens?: number }): Promise<string>;
  healthCheck?(): Promise<boolean>;
}

export interface SpeechToTextProvider {
  readonly name: string;
  /** True when the provider streams interim results via the browser (Web Speech API). */
  readonly supportsStreaming: boolean;
  transcribe(audio: Blob): Promise<string>;
  healthCheck?(): Promise<boolean>;
}

export interface ExecutionStep {
  id: string;
  command: AICommand;
  tool: string;
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed' | 'awaiting_confirmation';
  message: string;
  startedAt: number;
  finishedAt?: number;
}

/**
 * Something that will change data once the user confirms it: saving a form, or
 * deleting a record. Nothing destructive happens until `confirm` arrives.
 */
export interface PendingConfirmation {
  /** 'form' = save what is in the open form. 'delete' = remove an existing record. 'inbox_file' = file / unfile Inbox items. */
  kind: 'form' | 'delete' | 'inbox_file';
  /** Form id for a save; record kind for a delete. */
  formId: string;
  formTitle: string;
  summary: Array<{ label: string; value: string }>;
  description: string;
  recordKind?: AIRecordKind;
  recordId?: string;
  /** Inbox items to file or unfile (kind 'inbox_file'). */
  inboxItemIds?: string[];
  /** True to file, false to move back to unfiled (kind 'inbox_file'). */
  inboxFile?: boolean;
}

export interface DebugTrace {
  rawTranscript: string;
  normalizedTranscript: string;
  provider: string;
  rawModelOutput: string;
  commands: AICommand[];
  context: AIContext | null;
  steps: ExecutionStep[];
  fieldsModified: Array<{ formId: string; field: string; value: string }>;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

/** Structured information the Qwen model extracted from a dictated paragraph. */
export interface ExtractedItem {
  /** Fields matching the target form's field names, ready to review and save. */
  fields: FieldValues;
  /** The words in the transcript this came from — shown so the user can check the AI. */
  quote?: string;
}

export interface ExtractionResult {
  transcript: string;
  provider: string;
  items: Record<Exclude<AIRecordKind, 'patient'>, ExtractedItem[]>;
  /** Anything the model was unsure about — surfaced instead of guessed. */
  questions: string[];
  raw: string;
}
