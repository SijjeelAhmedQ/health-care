/**
 * Types shared by the assistant: the model decides what to do by calling
 * tools (services/ai/agent/tools.ts); these are the shapes that flow between
 * the model, the agent loop, the tool runtime and the UI.
 */
import type { EntityKind } from './records';

export type FieldValues = Record<string, string | number | boolean>;

/** Kept as a name for the entities the assistant can create, update and delete. */
export type AIRecordKind = EntityKind;

/** One tool call the model made. */
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** What a tool reports back — to the model (as the tool message) and to the UI trace. */
export interface ToolResult {
  ok: boolean;
  /** What happened, in plain words. The model reads this; a question or confirmation is shown to the user as is. */
  message: string;
  /** Structured data for the model: lists of records, patients, the provider's day… */
  data?: unknown;
  /**
   * The application is now waiting for the user — a question about a missing value or a
   * confirmation before saving/deleting. The turn ends and `message` is the reply.
   */
  awaitUser?: boolean;
  /**
   * The turn is over and `message` is the reply — nothing can follow it in the same turn
   * (the model itself is being replaced, or the provider signed out).
   */
  final?: boolean;
  /** The reply to this turn is worth hearing (information the user asked for, a question). */
  speak?: boolean;
  fieldsModified?: Array<{ formId: string; field: string; value: string }>;
}

/** A snapshot of where the user is, given to the model with every utterance. */
export interface AIContext {
  today: string;
  /** The next seven dates with their weekdays, so "next Tuesday" resolves without arithmetic. */
  nextDays: string;
  /** Dates weeks and months ahead ("in two weeks", "in 3 months"), for the same reason. */
  laterDates: string;
  now: string;
  providerName: string | null;
  currentPageId: string | null;
  currentPageTitle: string | null;
  currentPatientId: string | null;
  currentPatientName: string | null;
  /** The open dialog/form and what it holds. */
  openForm: { id: string; values: Record<string, unknown>; entries: number } | null;
  /** The question the assistant asked and is waiting on. */
  pendingQuestion: { formId: string; field: string; question: string } | null;
  /** What saying "yes" would do right now. */
  pendingConfirmation: { kind: PendingConfirmation['kind']; description: string } | null;
  /** The Inbox, when it is on screen. */
  inbox: { view: string; items: number; openItem: string | null; query: string } | null;
  /** The patient search on screen (Patients page). */
  patientSearch: { query: string; results: number } | null;
  /** The list (table) on screen: what it shows and how it can be filtered. */
  list: { name: string; shown: number; total: number; page: number; pageCount: number; search: string; filters: Record<string, string>; filterable: string } | null;
  /** Items extracted in the AI Summary, waiting to be added. */
  extracted: string | null;
  /** The Care Plan dialog, when open: its records by kind. */
  carePlan: string | null;
}

/**
 * Something that will change data once the user confirms it: saving a form, or
 * deleting a record. Nothing destructive happens until it is confirmed.
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

/** One step of an agent turn, for the trace and the debug panel. */
export type AgentStep =
  | { id: string; type: 'model'; startedAt: number; finishedAt?: number; content?: string; toolCalls?: ToolCall[]; error?: string }
  | { id: string; type: 'tool'; startedAt: number; finishedAt?: number; call: ToolCall; result?: ToolResult };

export interface DebugTrace {
  transcript: string;
  provider: string;
  /** The CONTEXT block the model received with the utterance. */
  context: string;
  steps: AgentStep[];
  reply?: string;
  fieldsModified: Array<{ formId: string; field: string; value: string }>;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

/** Structured information the model extracted from a dictated clinical note. */
export interface ExtractedItem {
  /** Fields matching the target form's field names, ready to review and save. */
  fields: FieldValues;
  /** The words in the note this came from — shown so the user can check the AI. */
  quote?: string;
}

export interface ExtractionResult {
  transcript: string;
  provider: string;
  items: Record<Exclude<AIRecordKind, 'patient'>, ExtractedItem[]>;
  /** Anything the model was unsure about — surfaced instead of guessed. */
  questions: string[];
}
