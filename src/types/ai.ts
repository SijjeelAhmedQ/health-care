/**
 * Structured command contract between the AI layer and the application.
 * The LLM (or the rule-based interpreter) must produce one of these; anything
 * else is rejected by the parser before it reaches the executor.
 */
import { z } from 'zod';

export const FieldValuesSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));
export type FieldValues = z.infer<typeof FieldValuesSchema>;

const NavigateSchema = z.object({
  action: z.literal('navigate'),
  /** Page id (e.g. "patient-search") or page number (e.g. 30). */
  target: z.union([z.string(), z.number()]),
  params: z.record(z.string(), z.string()).optional(),
});
const GoBackSchema = z.object({ action: z.literal('go_back') });
const GoHomeSchema = z.object({ action: z.literal('go_home') });
const SearchPatientSchema = z.object({ action: z.literal('search_patient'), query: z.string().min(1) });
const OpenPatientSchema = z.object({
  action: z.literal('open_patient'),
  name: z.string().optional(),
  mrn: z.string().optional(),
  patientId: z.string().optional(),
  /** Optional section to open right away, e.g. "medications" */
  section: z.string().optional(),
});
const OpenPatientSectionSchema = z.object({ action: z.literal('open_patient_section'), section: z.string() });
const OpenProviderSchema = z.object({ action: z.literal('open_provider'), name: z.string().optional(), providerId: z.string().optional() });
const OpenAppointmentSchema = z.object({ action: z.literal('open_appointment'), appointmentId: z.string().optional(), patientName: z.string().optional() });
const OpenFormSchema = z.object({ action: z.literal('open_form'), formId: z.string() });
const CloseFormSchema = z.object({ action: z.literal('close_form'), formId: z.string().optional() });
const FillFormSchema = z.object({
  action: z.literal('fill_form'),
  formId: z.string().optional(),
  fields: FieldValuesSchema,
});
const FillFieldSchema = z.object({ action: z.literal('fill_field'), field: z.string(), value: z.union([z.string(), z.number(), z.boolean()]), formId: z.string().optional() });
const SelectDropdownSchema = z.object({ action: z.literal('select_dropdown'), field: z.string(), value: z.string(), formId: z.string().optional() });
const SetCheckboxSchema = z.object({ action: z.literal('set_checkbox'), field: z.string(), checked: z.boolean(), formId: z.string().optional() });
const FocusFieldSchema = z.object({ action: z.literal('focus_field'), field: z.string(), formId: z.string().optional() });
const ClearFieldSchema = z.object({ action: z.literal('clear_field'), field: z.string(), formId: z.string().optional() });
const ScrollSchema = z.object({ action: z.literal('scroll'), direction: z.enum(['up', 'down', 'top', 'bottom']).optional(), section: z.string().optional() });
const OpenTabSchema = z.object({ action: z.literal('open_tab'), tab: z.string() });
const OpenModalSchema = z.object({ action: z.literal('open_modal'), modalId: z.string() });
const CloseModalSchema = z.object({ action: z.literal('close_modal') });
const SubmitFormSchema = z.object({ action: z.literal('submit_form'), formId: z.string().optional() });
const ConfirmSchema = z.object({ action: z.literal('confirm') });
const CancelSchema = z.object({ action: z.literal('cancel') });
const AskUserSchema = z.object({ action: z.literal('ask_user'), question: z.string(), field: z.string().optional(), formId: z.string().optional() });
const AddMedicationSchema = z.object({ action: z.literal('add_medication'), fields: FieldValuesSchema.optional() });
const CreateAppointmentSchema = z.object({ action: z.literal('create_appointment'), fields: FieldValuesSchema.optional() });
const RegisterPatientSchema = z.object({ action: z.literal('register_patient'), fields: FieldValuesSchema.optional() });
const ToggleSidebarSchema = z.object({ action: z.literal('toggle_sidebar') });
const HelpSchema = z.object({ action: z.literal('help') });
const RespondSchema = z.object({ action: z.literal('respond'), message: z.string() });
const UnknownSchema = z.object({ action: z.literal('unknown'), reason: z.string().optional() });

export const AICommandSchema = z.discriminatedUnion('action', [
  NavigateSchema, GoBackSchema, GoHomeSchema, SearchPatientSchema, OpenPatientSchema, OpenPatientSectionSchema, OpenProviderSchema, OpenAppointmentSchema,
  OpenFormSchema, CloseFormSchema, FillFormSchema, FillFieldSchema, SelectDropdownSchema, SetCheckboxSchema, FocusFieldSchema, ClearFieldSchema, ScrollSchema,
  OpenTabSchema, OpenModalSchema, CloseModalSchema, SubmitFormSchema, ConfirmSchema, CancelSchema, AskUserSchema, AddMedicationSchema, CreateAppointmentSchema,
  RegisterPatientSchema, ToggleSidebarSchema, HelpSchema, RespondSchema, UnknownSchema,
]);

export type AICommand = z.infer<typeof AICommandSchema>;
export type AICommandAction = AICommand['action'];

/** The LLM may return a single command or an ordered list (multi-step: "go to page 30 and add medication"). */
export const AICommandListSchema = z.union([AICommandSchema, z.array(AICommandSchema).min(1)]).transform((v) => (Array.isArray(v) ? v : [v]));

/** Actions that mutate data and therefore need explicit user confirmation. */
export const SENSITIVE_ACTIONS: ReadonlySet<AICommandAction> = new Set(['submit_form']);

export interface AIContext {
  currentPageId: string | null;
  currentPageTitle: string | null;
  currentPageNumber: number | null;
  currentPatientId: string | null;
  currentPatientName: string | null;
  currentProviderId: string | null;
  openFormId: string | null;
  openFormFields: string[];
  pendingSlot: { formId: string; field: string; label: string } | null;
  awaitingConfirmation: boolean;
  recentTranscripts: string[];
}

export interface LLMProvider {
  readonly name: string;
  generateCommands(transcript: string, context: AIContext): Promise<{ commands: AICommand[]; raw: string }>;
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

export interface PendingConfirmation {
  formId: string;
  formTitle: string;
  summary: Array<{ label: string; value: string }>;
  description: string;
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
