/**
 * Deterministic command executor.
 *
 * Takes validated AICommands and performs them through the registries
 * (PageRegistry, FormRegistry, FieldRegistry, RecordRegistry, NavigationRegistry)
 * and Redux. No DOM queries, no arbitrary code — every action is an explicit
 * tool below.
 *
 * Two rules are absolute:
 *   1. Nothing that depends on a patient runs without a selected patient.
 *   2. Nothing is saved or deleted without an explicit confirmation.
 */
import type { AICommand, AIRecordKind, FieldValues, InboxTarget, PendingConfirmation } from '@/types/ai';
import type { Patient } from '@/types/domain';
import dayjs from 'dayjs';
import { categoryMeta, type InboxItem, type InboxView } from '@/services/inbox/inboxModel';
import { InboxVoiceRegistry, getConfirmFiling, inboxNoun, ordinalWord, type InboxVoiceController } from '@/services/inbox/inboxVoice';
import { FieldRegistry, type FieldDefinition, type FormDefinition } from '@/registry/fieldRegistry';
import { FormRegistry, type FormController } from '@/registry/formRegistry';
import { NavigationRegistry } from '@/registry/navigationRegistry';
import { PageRegistry, type PageDefinition } from '@/registry/pageRegistry';
import { RecordRegistry, recordLabels, recordPageId, type RecordController } from '@/registry/recordRegistry';
import { matchRecord, recordLabel, recordSpoken, recordSummary, type AnyRecord } from '@/services/records/recordMapping';
import type { PendingSlot } from '@/store/slices/voiceSlice';
import { parseMedicationList } from './ruleBasedInterpreter';
import { splitMedicationNames } from './drugLexicon';
import { ageToDob } from './dateParser';

export interface ExecutorState {
  currentPageId: string | null;
  currentTab: string | null;
  currentPatientId: string | null;
  currentPatientName: string | null;
  openFormId: string | null;
  pendingConfirmation: PendingConfirmation | null;
  pendingSlot: PendingSlot | null;
  sidebarCollapsed: boolean;
  dashboardSummaryOpen: boolean;
}

export interface ExecutorDeps {
  getState(): ExecutorState;
  navigate(path: string): void;
  back(): void;
  setCurrentPatient(id: string | null): void;
  setActiveTab(pageId: string, tab: string): void;
  setOpenForm(formId: string | null): void;
  setPendingConfirmation(p: PendingConfirmation | null): void;
  setPendingSlot(s: PendingSlot | null): void;
  setPatientSearch(query: string): void;
  toggleSidebar(): void;
  /** Show or hide the dashboard summary docked to the right of the screen. */
  setDashboardSummary(open: boolean): void;
  resolvePatientByName(name: string): Promise<Patient[]>;
  /** The selected patient, or undefined. */
  getPatient(): Patient | undefined;
  /** Records of one kind belonging to the selected patient. */
  getRecords(kind: AIRecordKind): AnyRecord[];
  deleteRecord(kind: AIRecordKind, id: string): Promise<void>;
  /** Speak a reply (read-back commands). */
  speak(text: string): void;
  /** A narrative overview of the selected patient, built from real data only. */
  describePatient(): string;
  /** Turn the microphone off / on ("stop listening", "start listening"). */
  stopListening?(): void;
  startListening?(): void;
  /** Show the voice command reference. */
  openHelp?(): void;
  /** The text in the patient search, and the patients it shows — in on-screen order. */
  getPatientSearch?(): string;
  findPatients?(query: string): Patient[];
}

/** Where a command came from: spoken (or typed to the assistant), or a button / the command palette. */
export type CommandOrigin = 'voice' | 'ui';

export interface ExecutionResult {
  ok: boolean;
  tool: string;
  message: string;
  /** When true the executor stops processing subsequent commands in the batch. */
  stop?: boolean;
  requiresConfirmation?: boolean;
  /** The reply should be read aloud (read-back / summary commands). */
  speak?: boolean;
  fieldsModified?: Array<{ formId: string; field: string; value: string }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(probe: () => T | undefined | null | false, timeoutMs = 3000, interval = 50): Promise<T | undefined> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = probe();
    if (v) return v;
    await sleep(interval);
  }
  return undefined;
}

/** Record kinds that only make sense with a patient in context (all but the patient itself). */
const PATIENT_SCOPED: ReadonlySet<AIRecordKind> = new Set(['medication', 'diagnosis', 'task', 'recall', 'appointment']);

export class CommandExecutor {
  /** Who asked for the command being executed. Voice opens the Inbox on the selected patient. */
  private origin: CommandOrigin = 'ui';
  /** Where the last record opened by voice sat in the list — "next" after it was filed out of view. */
  private lastInboxIndex = -1;

  constructor(private readonly deps: ExecutorDeps) {}

  /** Execute a batch in order. Stops at confirmation boundaries / errors. */
  async executeAll(commands: AICommand[], onStep?: (index: number, result: ExecutionResult) => void): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    for (let i = 0; i < commands.length; i++) {
      const result = await this.execute(commands[i]);
      results.push(result);
      onStep?.(i, result);
      if (result.stop || !result.ok) break;
    }
    return results;
  }

  async execute(command: AICommand, origin: CommandOrigin = 'ui'): Promise<ExecutionResult> {
    this.origin = origin;
    try {
      switch (command.action) {
        case 'navigate':
          return this.navigate(command.target);
        case 'go_back':
          // In the Inbox, "go back" by voice leaves the open record — like the "‹ Inbox" button.
          if (this.origin === 'voice' && InboxVoiceRegistry.get()?.snapshot().openItem) return this.inboxClose();
          this.deps.back();
          return ok('go_back', 'Going back.');
        case 'go_home':
          return this.navigate('dashboard');
        case 'toggle_sidebar':
          this.deps.toggleSidebar();
          return ok('toggle_sidebar', 'Toggled the sidebar.');

        // ---- patient context ----
        case 'search_patient':
          return this.searchPatient(command.query);
        case 'select_patient':
          return this.selectPatient(command);
        case 'open_patient':
          return this.selectPatient(command);
        case 'clear_patient':
          this.deps.setCurrentPatient(null);
          this.deps.navigate(PageRegistry.get('patients')!.path);
          return ok('clear_patient', 'Cleared the selected patient. Choose a patient to continue.');

        // ---- records ----
        case 'add_record':
          return this.addRecord(command.kind, command.fields, command.records);
        case 'update_record':
          return this.updateRecord(command.kind, command.match, command.recordId, command.fields);
        case 'delete_record':
          return this.requestDelete(command.kind, command.match, command.recordId);
        case 'search_records':
          return this.searchRecords(command.kind, command.query);
        case 'read_records':
          return this.readRecords(command.kind);
        case 'summarize_patient':
          return this.summarizePatient();

        // ---- legacy verb aliases ----
        case 'add_medication':
          return this.addRecord('medication', command.fields, command.medications);
        case 'create_appointment':
          return this.addRecord('appointment', command.fields);
        case 'register_patient':
          return this.addRecord('patient', command.fields);

        // ---- forms ----
        case 'open_form':
          return this.openForm(command.formId);
        case 'close_form':
          return this.closeForm(command.formId);
        case 'fill_form':
          return this.fillForm(command.formId, command.fields, 'fill_form', command.entries);
        case 'add_entry':
          return this.addEntry(command.formId);
        case 'fill_field':
          return this.fillForm(command.formId, { [command.field]: command.value });
        case 'select_dropdown':
          return this.fillForm(command.formId, { [command.field]: command.value }, 'select_dropdown');
        case 'set_checkbox':
          return this.fillForm(command.formId, { [command.field]: command.checked }, 'set_checkbox');
        case 'focus_field':
          return this.focusField(command.formId, command.field);
        case 'clear_field':
          return this.clearField(command.formId, command.field);
        case 'submit_form':
          return this.requestSubmit(command.formId);
        case 'confirm':
          return this.confirm();
        case 'cancel':
          return this.cancel();
        case 'ask_user':
          return this.askUser(command.question, command.field, command.formId);

        // ---- ui ----
        case 'scroll':
          return this.scroll(command.direction, command.section);
        case 'open_tab':
          return this.openTab(command.tab);
        case 'open_dashboard_summary':
          return this.openDashboardSummary();
        case 'close_dashboard_summary':
          return this.closeDashboardSummary();
        case 'stop_listening':
          this.deps.stopListening?.();
          return ok('stop_listening', 'Voice control is off. Tap the microphone to start again.');
        case 'start_listening':
          this.deps.startListening?.();
          return ok('start_listening', 'Listening — say a command.');
        case 'select_patient_at':
          return this.selectPatientAt(command.position, command.single);

        // ---- inbox ----
        case 'inbox_view':
          return this.inboxView(command.view);
        case 'inbox_search':
          return this.inboxSearch(command.query, command.view);
        case 'inbox_clear_search':
          return this.inboxClearSearch();
        case 'inbox_open':
          return this.inboxOpen(command.target, command.category);
        case 'inbox_close':
          return this.inboxClose();
        case 'inbox_file':
          return this.inboxFile(command.file, command.target ?? 'this', command.category);
        case 'inbox_scope':
          return this.inboxScope(command.scope);
        case 'inbox_select_patient':
          return this.inboxSelectPatient();

        case 'help':
          if (InboxVoiceRegistry.get()) {
            this.deps.openHelp?.();
            return ok('help', 'Here is what you can say in the Inbox — for example "open the first record", "file this", "next", "search blood test" or "stop listening".');
          }
          return ok(
            'help',
            'Try: "select patient Ahmed Khan", "open medications", "add diagnosis hypertension", "add task blood pressure monitoring due next Friday", "set recall for review in 3 months", "read the medication list", "give me a summary of this patient", "delete the metformin", "save it", "cancel".',
          );
        case 'respond':
          return ok('respond', command.message);
        case 'unknown':
          return { ok: false, tool: 'unknown', message: `${command.reason ?? "Sorry, I didn't understand that."} Try a full command, e.g. "open diagnoses" or "add medication".`, stop: true };
        default:
          return { ok: false, tool: 'unknown', message: 'Unsupported command.', stop: true };
      }
    } catch (e) {
      return { ok: false, tool: command.action, message: (e as Error).message || 'Something went wrong executing that command.', stop: true };
    }
  }

  // ---------------------------------------------------------------- navigation

  /** Patient-dependent pages are refused (politely) while no patient is selected. */
  private requirePatient(what: string): ExecutionResult | null {
    const state = this.deps.getState();
    if (state.currentPatientId) return null;
    this.deps.navigate(PageRegistry.get('patients')!.path);
    return {
      ok: false,
      tool: 'require_patient',
      message: `No patient is selected, so I can't ${what}. I've opened the Patient module — say "select patient" followed by the name.`,
      stop: true,
    };
  }

  private async navigate(target: string | number): Promise<ExecutionResult> {
    const page = PageRegistry.resolve(target);
    if (!page) return { ok: false, tool: 'navigate_to_page', message: `I couldn't find a page for "${target}".`, stop: true };
    return this.navigateToPage(page);
  }

  private async navigateToPage(page: PageDefinition): Promise<ExecutionResult> {
    // "Open Inbox" by voice opens it on the selected patient (buttons and the palette keep the whole queue).
    if (page.module === 'inbox' && this.origin === 'voice') return this.inboxView((page.tab as InboxView | undefined) ?? 'all');
    if (page.requiresPatient) {
      const blocked = this.requirePatient(`open ${page.title}`);
      if (blocked) return blocked;
    }
    const path = PageRegistry.buildPath(page);
    if (!path) return { ok: false, tool: 'navigate_to_page', message: `Missing information to open ${page.title}.`, stop: true };
    this.deps.navigate(path);
    await waitFor(() => NavigationRegistry.pathname() === path, 2500);
    if (page.parentId && page.tab) this.deps.setActiveTab(page.parentId, page.tab);
    await sleep(120); // allow the lazy page to mount and register its forms
    return ok('navigate_to_page', `Opened ${page.title} (page ${page.number}).`);
  }

  private async searchPatient(query: string): Promise<ExecutionResult> {
    this.deps.setPatientSearch(query);
    const page = PageRegistry.get('patients')!;
    this.deps.navigate(`${page.path}?q=${encodeURIComponent(query)}`);
    await sleep(150);
    RecordRegistry.get('patient')?.setSearch(query);
    const matches = await this.deps.resolvePatientByName(query);
    if (matches.length === 1) return ok('search_patient', `Found ${matches[0].fullName} (${matches[0].mrn}). Say "select patient ${matches[0].fullName}" to work on them.`);
    return ok('search_patient', matches.length ? `Found ${matches.length} patients matching "${query}".` : `No patient matches "${query}". Showing the patient list.`);
  }

  private async selectPatient(cmd: { name?: string; mrn?: string; patientId?: string; section?: string }): Promise<ExecutionResult> {
    let patient: Patient | undefined;
    if (cmd.patientId) {
      this.deps.setCurrentPatient(cmd.patientId);
      patient = this.deps.getPatient();
    } else {
      const query = cmd.name ?? cmd.mrn ?? '';
      if (!query) return { ok: false, tool: 'select_patient', message: 'Which patient should I select?', stop: true };
      const matches = await this.deps.resolvePatientByName(query);
      if (matches.length === 1) patient = matches[0];
      else {
        await this.searchPatient(query);
        return {
          ok: matches.length > 0,
          tool: 'select_patient',
          message: matches.length
            ? `${matches.length} patients match "${query}": ${matches.slice(0, 4).map((p) => `${p.fullName} (${p.mrn})`).join(', ')}. Which one?`
            : `No patient named "${query}" was found. Showing the patient list.`,
          stop: true,
        };
      }
      this.deps.setCurrentPatient(patient.id);
    }

    await sleep(80);
    const name = patient?.fullName ?? 'The patient';
    const targetPage = cmd.section ? PageRegistry.resolve(cmd.section) ?? PageRegistry.get('dashboard')! : PageRegistry.get('dashboard')!;
    await this.navigateToPage(targetPage);
    return ok('select_patient', `${name} is now the selected patient. ${targetPage.title} is open.`);
  }

  // ------------------------------------------------------------------- records

  /** Navigate to the module page that hosts a record kind and wait for it to register. */
  private async ensureRecordPage(kind: AIRecordKind): Promise<RecordController | ExecutionResult> {
    const page = PageRegistry.get(recordPageId[kind])!;
    const state = this.deps.getState();
    const alreadyThere = state.currentPageId === page.id || (!!state.currentPageId && FieldRegistry.getForm(kind)?.pages.includes(state.currentPageId));
    if (!alreadyThere || !RecordRegistry.get(kind)) {
      const nav = await this.navigateToPage(page);
      if (!nav.ok) return nav;
    }
    const controller = await waitFor(() => RecordRegistry.get(kind), 4000);
    if (!controller) return { ok: false, tool: 'open_record_page', message: `I couldn't open the ${recordLabels[kind].singular} module.`, stop: true };
    return controller;
  }

  private async addRecord(kind: AIRecordKind, fields?: FieldValues, records?: FieldValues[]): Promise<ExecutionResult> {
    if (PATIENT_SCOPED.has(kind)) {
      const blocked = this.requirePatient(`add a ${recordLabels[kind].singular}`);
      if (blocked) return blocked;
    }
    const controller = await this.ensureRecordPage(kind);
    if ('ok' in controller) return controller;

    controller.openCreate();
    const form = await waitFor(() => FormRegistry.get(kind), 3000);
    if (!form) return { ok: false, tool: 'add_record', message: `The ${recordLabels[kind].singular} form did not open.`, stop: true };
    await waitFor(() => form.isOpen(), 1500);
    this.deps.setOpenForm(kind);
    this.deps.setPendingConfirmation(null);

    const def = FieldRegistry.getForm(kind)!;
    const payload = fields ?? {};
    if (!Object.keys(payload).length && !(records?.length ?? 0)) {
      // Nothing was dictated beyond the verb: ask for the first thing the form needs.
      const missing = FieldRegistry.missingRequired(kind, form.getValues());
      if (missing.length) {
        const next = missing[0];
        const question = `${def.title} form is open. What ${next.label.toLowerCase()}?`;
        this.deps.setPendingSlot({ formId: kind, field: next.name, label: next.label, question });
        form.focusField(next.name);
        return { ok: true, tool: `add_${kind}`, message: question, stop: true };
      }
      return ok(`add_${kind}`, `${def.title} form is open.`);
    }
    return this.fillForm(kind, payload, `add_${kind}`, records);
  }

  private async updateRecord(kind: AIRecordKind, match?: string, recordId?: string, fields?: FieldValues): Promise<ExecutionResult> {
    if (PATIENT_SCOPED.has(kind)) {
      const blocked = this.requirePatient(`update a ${recordLabels[kind].singular}`);
      if (blocked) return blocked;
    }
    const rows = this.records(kind);
    const found = this.resolveOne(kind, rows, match ?? recordId, 'update');
    if ('ok' in found) return found;

    const controller = await this.ensureRecordPage(kind);
    if ('ok' in controller) return controller;
    if (!controller.openEdit(found.record.id)) {
      return { ok: false, tool: 'update_record', message: `I couldn't open that ${recordLabels[kind].singular} for editing.`, stop: true };
    }
    const form = await waitFor(() => FormRegistry.get(kind), 3000);
    if (!form) return { ok: false, tool: 'update_record', message: `The ${recordLabels[kind].singular} form did not open.`, stop: true };
    await waitFor(() => form.isOpen(), 1500);
    this.deps.setOpenForm(kind);

    const label = recordLabel(kind, found.record);
    if (!fields || !Object.keys(fields).length) {
      this.deps.setPendingConfirmation(null);
      return { ok: true, tool: 'update_record', message: `${label} is open for editing. What should I change?`, stop: true };
    }
    const filled = await this.fillForm(kind, fields, 'update_record');
    return { ...filled, message: `${label}: ${filled.message}` };
  }

  private async requestDelete(kind: AIRecordKind, match?: string, recordId?: string): Promise<ExecutionResult> {
    if (PATIENT_SCOPED.has(kind)) {
      const blocked = this.requirePatient(`delete a ${recordLabels[kind].singular}`);
      if (blocked) return blocked;
    }
    // "delete this patient" with nothing else said means the selected patient.
    const current = this.deps.getPatient();
    const rows = kind === 'patient' && !match && !recordId ? (current ? [current as AnyRecord] : []) : this.records(kind);
    const found = this.resolveOne(kind, rows, match ?? recordId, 'delete');
    if ('ok' in found) return found;

    const label = recordLabel(kind, found.record);
    // Show the record before asking, so "yes" is never a blind answer.
    await this.ensureRecordPage(kind).catch(() => undefined);
    RecordRegistry.get(kind)?.setSearch(label);

    this.deps.setPendingSlot(null);
    this.deps.setPendingConfirmation({
      kind: 'delete',
      formId: kind,
      formTitle: `Delete ${recordLabels[kind].singular}`,
      summary: recordSummary(kind, found.record),
      description: `Permanently delete this ${recordLabels[kind].singular}`,
      recordKind: kind,
      recordId: found.record.id,
    });
    return {
      ok: true,
      tool: 'request_delete_confirmation',
      message: `This will permanently delete ${recordLabels[kind].singular} “${label}”. Say “yes, delete it” to confirm, or “cancel”.`,
      requiresConfirmation: true,
      speak: true,
      stop: true,
    };
  }

  private async searchRecords(kind: AIRecordKind, query: string): Promise<ExecutionResult> {
    if (PATIENT_SCOPED.has(kind)) {
      const blocked = this.requirePatient(`search ${recordLabels[kind].plural}`);
      if (blocked) return blocked;
    }
    const controller = await this.ensureRecordPage(kind);
    if ('ok' in controller) return controller;
    controller.setSearch(query);
    const rows = kind === 'patient' ? [] : this.records(kind);
    const hits = matchRecord(kind, rows as Array<AnyRecord & { id: string }>, query).candidates.length;
    return ok('search_records', `Searching ${recordLabels[kind].plural} for "${query}"${kind === 'patient' ? '' : ` — ${hits} match${hits === 1 ? '' : 'es'}`}.`);
  }

  private async readRecords(kind: AIRecordKind): Promise<ExecutionResult> {
    if (kind === 'patient') {
      const patient = this.deps.getPatient();
      if (!patient) return this.requirePatient('read the patient details')!;
      const message = recordSpoken('patient', patient) + `. Phone ${patient.phone}. Primary provider ${patient.primaryProviderName}.`;
      this.deps.speak(message);
      return { ...ok('read_patient', message), speak: true };
    }
    const blocked = this.requirePatient(`read the ${recordLabels[kind].plural}`);
    if (blocked) return blocked;

    const rows = this.records(kind);
    const patientName = this.deps.getState().currentPatientName ?? 'this patient';
    if (!rows.length) {
      const message = `${patientName} has no ${recordLabels[kind].plural} recorded.`;
      this.deps.speak(message);
      return { ...ok('read_records', message), speak: true };
    }
    const shown = rows.slice(0, 6);
    const lines = shown.map((r, i) => `${i + 1}. ${recordSpoken(kind, r)}`);
    const more = rows.length > shown.length ? `\nAnd ${rows.length - shown.length} more.` : '';
    const message = `${patientName} has ${rows.length} ${rows.length === 1 ? recordLabels[kind].singular : recordLabels[kind].plural}:\n${lines.join('\n')}${more}`;
    this.deps.speak(message);
    await this.navigateToPage(PageRegistry.get(recordPageId[kind])!);
    return { ...ok('read_records', message), speak: true };
  }

  private async summarizePatient(): Promise<ExecutionResult> {
    const blocked = this.requirePatient('summarise the patient');
    if (blocked) return blocked;
    const narrative = this.deps.describePatient();
    this.deps.speak(narrative);
    return { ...ok('summarize_patient', narrative), speak: true };
  }

  private records(kind: AIRecordKind): AnyRecord[] {
    return this.deps.getRecords(kind);
  }

  /** Resolve a spoken phrase to exactly one record, or explain why it could not. */
  private resolveOne(kind: AIRecordKind, rows: AnyRecord[], query: string | undefined, verb: string): { record: AnyRecord } | ExecutionResult {
    if (!rows.length) {
      return { ok: false, tool: `${verb}_record`, message: `There are no ${recordLabels[kind].plural} to ${verb} for this patient.`, stop: true };
    }
    const { match, candidates } = matchRecord(kind, rows as Array<AnyRecord & { id: string }>, query);
    if (match) return { record: match };
    if (!candidates.length) {
      return {
        ok: false,
        tool: `${verb}_record`,
        message: `I couldn't find a ${recordLabels[kind].singular} matching "${query ?? ''}". The patient has: ${rows.slice(0, 5).map((r) => recordLabel(kind, r)).join(', ')}.`,
        stop: true,
      };
    }
    return {
      ok: false,
      tool: `${verb}_record`,
      message: `Several ${recordLabels[kind].plural} match: ${candidates.slice(0, 5).map((r) => recordLabel(kind, r)).join(', ')}. Which one should I ${verb}?`,
      stop: true,
    };
  }

  // -------------------------------------------------------------------- forms

  private async ensureForm(formId: string): Promise<{ def: FormDefinition; controller: FormController } | ExecutionResult> {
    const def = FieldRegistry.getForm(formId) ?? FieldRegistry.resolveForm(formId, this.deps.getState().currentPageId);
    if (!def) return { ok: false, tool: 'open_form', message: `There is no form called "${formId}".`, stop: true };

    let controller = FormRegistry.get(def.id);
    if (!controller) {
      const kind = def.id as AIRecordKind;
      const page = PageRegistry.get(recordPageId[kind] ?? def.pages[0]);
      if (page) {
        const nav = await this.navigateToPage(page);
        if (!nav.ok) return nav;
      }
      controller = await waitFor(() => FormRegistry.get(def.id), 4000);
    }
    if (!controller) return { ok: false, tool: 'open_form', message: `The ${def.title} form is not available on this page.`, stop: true };
    return { def, controller };
  }

  private async openForm(formId: string): Promise<ExecutionResult> {
    const kind = (FieldRegistry.resolveForm(formId)?.id ?? formId) as AIRecordKind;
    if (recordPageId[kind]) return this.addRecord(kind);
    const res = await this.ensureForm(formId);
    if ('ok' in res) return res;
    if (!res.controller.isOpen()) res.controller.open();
    await waitFor(() => res.controller.isOpen(), 1500);
    this.deps.setOpenForm(res.def.id);
    this.deps.setPendingConfirmation(null);
    return ok('open_form', `${res.def.title} form is open.`);
  }

  private async closeForm(formId?: string): Promise<ExecutionResult> {
    const controller = formId ? FormRegistry.get(formId) : FormRegistry.active();
    if (!controller) return ok('close_form', 'No form is open.');
    controller.close();
    this.deps.setOpenForm(null);
    this.deps.setPendingConfirmation(null);
    this.deps.setPendingSlot(null);
    return ok('close_form', 'Form closed.');
  }

  private resolveTargetForm(formId?: string): string | undefined {
    const state = this.deps.getState();
    return formId ?? state.pendingSlot?.formId ?? state.openFormId ?? FormRegistry.active()?.formId ?? FieldRegistry.formsForPage(state.currentPageId)[0]?.id;
  }

  private async fillForm(formId: string | undefined, fields: FieldValues, tool = 'fill_form', entries?: FieldValues[]): Promise<ExecutionResult> {
    const targetId = this.resolveTargetForm(formId);
    if (!targetId) return { ok: false, tool, message: 'There is no form to fill on this page. Open a form first.', stop: true };
    const res = await this.ensureForm(targetId);
    if ('ok' in res) return res;
    const { def, controller } = res;
    if (!controller.isOpen()) {
      controller.open();
      await waitFor(() => controller.isOpen(), 1500);
    }
    this.deps.setOpenForm(def.id);

    // One field set per record. A medication name that still holds several drugs or a whole spoken
    // phrase ("amoxicillin 500 mg twice daily") is split here, whichever model produced it.
    const requested = entries && entries.length > 1 ? entries : [fields];
    const expanded = requested.flatMap((f) => this.expandMedicationFields(def, f));
    const asList = expanded.length > 1 && !!controller.entries;
    const skipped = controller.entries ? [] : expanded.slice(1);
    const targets = asList ? expanded : [expanded[0]];

    const modified: ExecutionResult['fieldsModified'] = [];
    const unknown = new Set<string>();
    const activeBlank = isBlank(def, controller.getValues());
    for (let i = 0; i < targets.length; i++) {
      const normalized = await this.normalizeFields(def, controller, targets[i]);
      normalized.unknown.forEach((u) => unknown.add(u));
      modified.push(...normalized.modified);
      if (!Object.keys(normalized.values).length) continue;
      if (i === 0 && (!asList || activeBlank)) controller.setValues(normalized.values);
      else controller.entries!.add(normalized.values);
    }
    this.deps.setPendingSlot(null);

    const notes: string[] = [];
    if (unknown.size) notes.push(`ignored unknown field${unknown.size > 1 ? 's' : ''}: ${[...unknown].join(', ')}`);
    if (skipped.length) notes.push(`this form takes one record at a time — add the rest afterwards`);
    return this.nextStep(def, controller, tool, modified, notes);
  }

  /** "Add another" — open a blank tab on a multi-entry form. */
  private async addEntry(formId?: string): Promise<ExecutionResult> {
    const targetId = this.resolveTargetForm(formId);
    const controller = targetId ? FormRegistry.get(targetId) : undefined;
    const def = targetId ? FieldRegistry.getForm(targetId) : undefined;
    if (!controller || !def || !controller.isOpen()) return { ok: false, tool: 'add_entry', message: 'No form is open.', stop: true };
    if (!controller.entries) return { ok: false, tool: 'add_entry', message: `The ${def.title} form holds one record at a time.`, stop: true };
    const index = controller.entries.add({});
    this.deps.setPendingConfirmation(null);
    const primary = primaryField(def);
    if (primary) {
      const question = `What ${primary.label.toLowerCase()} for ${def.title.toLowerCase()} ${index + 1}?`;
      this.deps.setPendingSlot({ formId: def.id, field: primary.name, label: primary.label, question });
      controller.focusField(primary.name);
      return { ok: true, tool: 'add_entry', message: question, stop: true };
    }
    return ok('add_entry', `Added ${def.title.toLowerCase()} ${index + 1}.`);
  }

  /** Split a medication field set whose name still carries several drugs or a whole spoken phrase. */
  private expandMedicationFields(def: FormDefinition, fields: FieldValues): FieldValues[] {
    const name = fields.medicationName;
    if (typeof name !== 'string' || def.id !== 'medication') return [fields];
    const rest = Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'medicationName'));
    if (/\d+\s*(mg|mcg|g|ml|units?|milligrams?|micrograms?)\b/i.test(name)) {
      const parsed = parseMedicationList(name).filter((m) => m.medicationName);
      if (parsed.length) return parsed.map((m) => ({ ...m, ...rest }));
      return [fields];
    }
    const names = splitMedicationNames(name);
    if (names.length <= 1) return [fields];
    return names.map((n) => ({ ...rest, medicationName: n }));
  }

  /** Map spoken field names to real fields and normalize the values. */
  private async normalizeFields(def: FormDefinition, controller: FormController, fields: FieldValues) {
    const incoming: FieldValues = { ...fields };
    // Patient form: a spoken age satisfies the required date of birth (approximate, editable before saving).
    if (def.id === 'patient' && incoming.age !== undefined && incoming.dateOfBirth === undefined && !controller.getValues().dateOfBirth) {
      const age = Number(String(incoming.age).replace(/\D/g, ''));
      if (age > 0 && age < 130) incoming.dateOfBirth = ageToDob(age);
    }
    const values: Record<string, string | number | boolean> = {};
    const modified: NonNullable<ExecutionResult['fieldsModified']> = [];
    const unknown: string[] = [];
    for (const [rawField, rawValue] of Object.entries(incoming)) {
      if (rawValue === undefined || rawValue === null || rawValue === '') continue;
      const field = FieldRegistry.resolveField(def.id, rawField);
      if (!field) {
        unknown.push(rawField);
        continue;
      }
      const value = FieldRegistry.normalizeValue(field, rawValue);
      values[field.name] = value;
      modified.push({ formId: def.id, field: field.name, value: String(value) });
    }
    return { values, modified, unknown };
  }

  /**
   * After a fill: ask for the first missing required field (switching to the entry that needs it on
   * a multi-entry form), or offer to save once every entry is complete.
   */
  private nextStep(def: FormDefinition, controller: FormController, tool: string, modified: NonNullable<ExecutionResult['fieldsModified']>, notes: string[]): ExecutionResult {
    const all = controller.entries ? controller.entries.getAll() : [controller.getValues()];
    const multi = all.length > 1;
    const primary = primaryField(def);
    const nameOf = (values: Record<string, unknown>, i: number) => (primary && values[primary.name] ? String(values[primary.name]) : `${def.title.toLowerCase()} ${i + 1}`);
    const filledSummary = multi
      ? modified.filter((m) => m.field === primary?.name).map((m) => m.value).join(', ')
      : modified.map((m) => `${FieldRegistry.resolveField(def.id, m.field)?.label ?? m.field}: ${m.value}`).join(', ');
    const note = notes.length ? ` (${notes.join('; ')})` : '';

    for (let i = 0; i < all.length; i++) {
      const missing = FieldRegistry.missingRequired(def.id, all[i]);
      if (!missing.length) continue;
      if (controller.entries && controller.entries.active() !== i) controller.entries.setActive(i);
      const next = missing[0];
      const question = `What ${next.label.toLowerCase()}${multi ? ` for ${nameOf(all[i], i)}` : ''}?`;
      this.deps.setPendingConfirmation(null);
      this.deps.setPendingSlot({ formId: def.id, field: next.name, label: next.label, question });
      controller.focusField(next.name);
      return { ok: true, tool, message: `${filledSummary ? `Filled ${filledSummary}. ` : ''}${question}${note}`, fieldsModified: modified, stop: true };
    }

    this.deps.setPendingConfirmation({ kind: 'form', formId: def.id, formTitle: def.title, summary: controller.summarize(), description: def.sensitiveDescription });
    const what = multi ? `${def.title} form completed with ${all.length} entries — ${all.map(nameOf).join(', ')}` : `${def.title} form completed${filledSummary ? ` — ${filledSummary}` : ''}`;
    return {
      ok: true,
      tool,
      message: `${what}.${note} Please review, then say "save it" to ${def.sensitiveDescription.toLowerCase()} or "cancel".`,
      fieldsModified: modified,
      requiresConfirmation: true,
      stop: true,
    };
  }

  private async focusField(formId: string | undefined, fieldName: string): Promise<ExecutionResult> {
    const targetId = this.resolveTargetForm(formId);
    const controller = targetId ? FormRegistry.get(targetId) : undefined;
    if (!targetId || !controller) return { ok: false, tool: 'focus_form_field', message: 'No form is open.', stop: true };
    const field = FieldRegistry.resolveField(targetId, fieldName);
    if (!field) return { ok: false, tool: 'focus_form_field', message: `I couldn't find a field called "${fieldName}".`, stop: true };
    controller.focusField(field.name);
    return ok('focus_form_field', `Focused ${field.label}.`);
  }

  private async clearField(formId: string | undefined, fieldName: string): Promise<ExecutionResult> {
    const targetId = this.resolveTargetForm(formId);
    const controller = targetId ? FormRegistry.get(targetId) : undefined;
    if (!targetId || !controller) return { ok: false, tool: 'clear_field', message: 'No form is open.', stop: true };
    const field = FieldRegistry.resolveField(targetId, fieldName);
    if (!field) return { ok: false, tool: 'clear_field', message: `I couldn't find a field called "${fieldName}".`, stop: true };
    controller.clearField(field.name);
    return ok('clear_field', `Cleared ${field.label}.`, [{ formId: targetId, field: field.name, value: '' }]);
  }

  // ------------------------------------------------------------ confirmation

  private async requestSubmit(formId?: string): Promise<ExecutionResult> {
    const state = this.deps.getState();
    if (state.pendingConfirmation) return this.confirm();
    const targetId = this.resolveTargetForm(formId);
    const controller = targetId ? FormRegistry.get(targetId) : undefined;
    const def = targetId ? FieldRegistry.getForm(targetId) : undefined;
    if (!controller || !def || !controller.isOpen()) return { ok: false, tool: 'submit_form', message: 'There is nothing to save right now.', stop: true };
    const missing = FieldRegistry.missingRequired(def.id, controller.getValues());
    if (missing.length) {
      const next = missing[0];
      this.deps.setPendingSlot({ formId: def.id, field: next.name, label: next.label, question: `What ${next.label.toLowerCase()}?` });
      return { ok: true, tool: 'submit_form', message: `I still need the ${next.label.toLowerCase()} before saving. What ${next.label.toLowerCase()}?`, stop: true };
    }
    this.deps.setPendingConfirmation({ kind: 'form', formId: def.id, formTitle: def.title, summary: controller.summarize(), description: def.sensitiveDescription });
    return { ok: true, tool: 'request_confirmation', message: `Ready to ${def.sensitiveDescription.toLowerCase()}. Say "yes" to confirm or "cancel".`, requiresConfirmation: true, stop: true };
  }

  /** The only place where data is actually written or removed. */
  private async confirm(): Promise<ExecutionResult> {
    const state = this.deps.getState();
    const pending = state.pendingConfirmation;
    if (!pending) return { ok: false, tool: 'confirm', message: 'There is nothing waiting for confirmation.', stop: true };

    if (pending.kind === 'inbox_file') return this.confirmInboxFile(pending);

    if (pending.kind === 'delete' && pending.recordKind && pending.recordId) {
      await this.deps.deleteRecord(pending.recordKind, pending.recordId);
      this.deps.setPendingConfirmation(null);
      return ok('delete_after_confirmation', `${pending.summary[0]?.value ?? recordLabels[pending.recordKind].singular} deleted.`);
    }

    const controller = FormRegistry.get(pending.formId);
    if (!controller) {
      this.deps.setPendingConfirmation(null);
      return { ok: false, tool: 'confirm', message: 'The form is no longer open, so nothing was saved.', stop: true };
    }
    const errors = await controller.validate();
    if (errors.length) return { ok: false, tool: 'confirm', message: `The form has validation errors: ${errors.slice(0, 3).join('; ')}. Please fix them before saving.`, stop: true };
    await controller.submit();
    this.deps.setPendingConfirmation(null);
    this.deps.setPendingSlot(null);
    this.deps.setOpenForm(null);
    return ok('save_after_confirmation', `${pending.formTitle} saved successfully.`);
  }

  private async cancel(): Promise<ExecutionResult> {
    const state = this.deps.getState();
    const wasDelete = state.pendingConfirmation?.kind === 'delete';
    const wasFiling = state.pendingConfirmation?.kind === 'inbox_file' ? state.pendingConfirmation : null;
    const hadPending = !!state.pendingConfirmation || !!state.pendingSlot;
    this.deps.setPendingConfirmation(null);
    this.deps.setPendingSlot(null);
    if (wasDelete) return ok('cancel_command', 'Cancelled — nothing was deleted.');
    if (wasFiling) return ok('cancel_command', `Cancelled — the record was not ${wasFiling.inboxFile ? 'filed' : 'moved back to unfiled'}.`);
    const active = FormRegistry.active();
    if (active) {
      active.close();
      this.deps.setOpenForm(null);
      return ok('cancel_command', 'Cancelled — the form was closed and nothing was saved.');
    }
    return ok('cancel_command', hadPending ? 'Cancelled. Nothing was saved.' : 'Okay, cancelled.');
  }

  private async askUser(question: string, field?: string, formId?: string): Promise<ExecutionResult> {
    const targetId = this.resolveTargetForm(formId);
    if (field && targetId) {
      const def = FieldRegistry.resolveField(targetId, field);
      if (def) this.deps.setPendingSlot({ formId: targetId, field: def.name, label: def.label, question });
    }
    return { ok: true, tool: 'ask_user', message: question, stop: true };
  }

  // ------------------------------------------------------------------- misc

  private async scroll(direction?: 'up' | 'down' | 'top' | 'bottom', section?: string): Promise<ExecutionResult> {
    if (section) {
      const found = NavigationRegistry.scrollTo(section);
      return found ? ok('scroll_to_section', `Scrolled to ${section}.`) : { ok: false, tool: 'scroll_to_section', message: `I couldn't find a section called "${section}" on this page.`, stop: true };
    }
    NavigationRegistry.scrollBy(direction ?? 'down');
    return ok('scroll', `Scrolled ${direction ?? 'down'}.`);
  }

  /** Tabs only exist in the Summary module; each one is a real page. */
  private async openTab(tab: string): Promise<ExecutionResult> {
    const q = tab.toLowerCase().trim().replace(/\s+tab$/, '');
    const summaryTabs = PageRegistry.all().filter((p) => p.parentId === 'summary');
    const page =
      summaryTabs.find((p) => p.tab === q.replace(/\s+/g, '-')) ??
      summaryTabs.find((p) => p.aliases.some((a) => a === q || a.includes(q))) ??
      summaryTabs.find((p) => p.title.toLowerCase().includes(q));
    if (page) return this.navigateToPage(page);
    const target = PageRegistry.resolve(q);
    if (target) return this.navigateToPage(target);
    return { ok: false, tool: 'open_tab', message: `There is no "${tab}" tab. The Summary module has AI Summary, Medication, Recall, Appointment, Diagnosis and Task.`, stop: true };
  }

  /**
   * "Show dashboard summary" — open the Dashboard and dock the summary of it to
   * the right of the screen. It is a patient view, so a patient must be selected.
   */
  private async openDashboardSummary(): Promise<ExecutionResult> {
    const blocked = this.requirePatient('show the dashboard summary');
    if (blocked) return blocked;
    const navigated = await this.navigateToPage(PageRegistry.get('dashboard')!);
    if (!navigated.ok) return navigated;
    this.deps.setDashboardSummary(true);
    const name = this.deps.getState().currentPatientName ?? 'this patient';
    return ok('open_dashboard_summary', `Opened the dashboard summary for ${name} on the right. Say "close dashboard summary" to close it.`);
  }

  private async closeDashboardSummary(): Promise<ExecutionResult> {
    if (!this.deps.getState().dashboardSummaryOpen) return ok('close_dashboard_summary', 'The dashboard summary is not open.');
    this.deps.setDashboardSummary(false);
    return ok('close_dashboard_summary', 'Closed the dashboard summary.');
  }

  // ------------------------------------------------------------ patient list

  /** "Open the first patient" — the Nth row of the patient search, exactly as it is on screen. */
  private async selectPatientAt(position: number, single?: boolean): Promise<ExecutionResult> {
    const query = (this.deps.getPatientSearch?.() ?? '').trim();
    const onList = this.deps.getState().currentPageId === 'patients';
    if (!query && !onList) return fail('select_patient_at', 'Search for a patient first — say "search patient" followed by a name or MRN.');
    const matches = this.deps.findPatients?.(query) ?? [];
    const what = query ? ` matching “${query}”` : '';
    if (!matches.length) return fail('select_patient_at', `No patient${what} was found. Try another name, or search by MRN.`);
    if (single && matches.length > 1) {
      return fail('select_patient_at', `${matches.length} patients match${query ? ` “${query}”` : ''}. Say "open the first patient", "open the second patient", or the full name.`);
    }
    if (position > matches.length) {
      return fail('select_patient_at', `There is no ${ordinalWord(position)} patient in the list — there ${matches.length === 1 ? 'is only one' : `are ${matches.length}`}.`);
    }
    return this.selectPatient({ patientId: matches[position - 1].id });
  }

  // ------------------------------------------------------------------- inbox

  /** Nothing the Inbox does for a patient happens without one selected. */
  private requireInboxPatient(): ExecutionResult | null {
    if (this.deps.getState().currentPatientId) return null;
    return fail('require_patient', 'Please select a patient first. Say "search patient" followed by a name.');
  }

  /** The mounted Inbox — opened first (on the selected patient) when it is not on screen. */
  private async ensureInbox(view: InboxView = 'all'): Promise<InboxVoiceController | ExecutionResult> {
    let controller = InboxVoiceRegistry.get();
    if (!controller) {
      const patientId = this.deps.getState().currentPatientId;
      this.deps.navigate(`/inbox/${view}${patientId ? `?patient=${encodeURIComponent(patientId)}` : ''}`);
      controller = await waitFor(() => InboxVoiceRegistry.get(), 5000);
      if (!controller) return fail('open_inbox', 'I couldn’t open the Inbox.');
    }
    const ready = controller;
    await waitFor(() => !ready.snapshot().loading, 5000);
    return ready;
  }

  private async showView(controller: InboxVoiceController, view: InboxView) {
    if (controller.snapshot().view === view) return;
    controller.setView(view);
    await waitFor(() => controller.snapshot().view === view, 2500);
    await sleep(40);
  }

  private describeList(controller: InboxVoiceController): string {
    const snap = controller.snapshot();
    const noun = inboxNoun[snap.view];
    const unfiled = snap.items.filter((i) => !snap.isFiled(i.id)).length;
    const scope = snap.scopePatientId && snap.scopePatientId === this.deps.getState().currentPatientId ? ` for ${this.deps.getState().currentPatientName ?? 'the selected patient'}` : '';
    if (!snap.items.length) return `There are no ${noun.many}${scope} in the current list.`;
    return `${snap.items.length} ${snap.items.length === 1 ? noun.one : noun.many}${scope}, ${unfiled} unfiled.`;
  }

  private async inboxView(view: InboxView): Promise<ExecutionResult> {
    const controller = await this.ensureInbox(view);
    if ('ok' in controller) return controller;
    await this.showView(controller, view);
    const label = view === 'all' ? 'all Inbox items' : categoryMeta[view].label;
    return ok('inbox_view', `Showing ${label}. ${this.describeList(controller)}`);
  }

  private async inboxSearch(query: string, view?: InboxView): Promise<ExecutionResult> {
    const controller = await this.ensureInbox(view);
    if ('ok' in controller) return controller;
    if (view) await this.showView(controller, view);
    controller.setQuery(query);
    await waitFor(() => controller.snapshot().query === query, 2000);
    await sleep(40);
    const snap = controller.snapshot();
    const where = snap.view === 'all' ? 'the Inbox' : categoryMeta[snap.view].label;
    if (!query) return ok('inbox_search', `Showing ${where}. ${this.describeList(controller)}`);
    if (!snap.items.length) return ok('inbox_search', `Nothing in ${where} matches “${query}”. Say "clear search" to see everything again.`);
    const noun = inboxNoun[snap.view];
    return ok('inbox_search', `Found ${snap.items.length} ${snap.items.length === 1 ? noun.one : noun.many} matching “${query}” in ${where}. Say "open the first record" to read one.`);
  }

  private async inboxClearSearch(): Promise<ExecutionResult> {
    const controller = InboxVoiceRegistry.get();
    if (!controller) return fail('inbox_clear_search', 'The Inbox is not open — say "open Inbox" first.');
    controller.setQuery('');
    await waitFor(() => controller.snapshot().query === '', 2000);
    return ok('inbox_clear_search', `Search cleared. ${this.describeList(controller)}`);
  }

  /** Resolve "this", "next", "the second referral" against the list on screen — or explain why not. */
  private resolveInboxTarget(controller: InboxVoiceController, target: InboxTarget, category: InboxView | undefined, verb: 'open' | 'file' | 'unfile'): { item: InboxItem; position?: number; noun: string } | ExecutionResult {
    const snap = controller.snapshot();
    const kind = category ?? 'all';
    const noun = inboxNoun[kind];
    const list = kind === 'all' ? snap.items : snap.items.filter((i) => i.category === kind);

    if (target === 'this') {
      if (snap.openItem) return { item: snap.openItem, noun: noun.one };
      const ticked = snap.checkedIds.length === 1 ? snap.items.find((i) => i.id === snap.checkedIds[0]) : undefined;
      if (ticked) return { item: ticked, noun: noun.one };
      return fail(`inbox_${verb}`, 'Please open or select a record first — for example say "open the first record".');
    }
    if (!list.length) {
      return fail(`inbox_${verb}`, kind === 'all' ? 'There are no Inbox records to open in the current list.' : `There are no ${noun.many} in the current list.`);
    }
    if (target === 'next' || target === 'previous') {
      const open = snap.openItem;
      let index = open ? list.findIndex((i) => i.id === open.id) : -1;
      // The open record left the list (filed under "Unfiled only"): its neighbour moved into its place.
      if (open && index < 0 && this.lastInboxIndex >= 0) index = target === 'next' ? this.lastInboxIndex - 1 : this.lastInboxIndex;
      if (!open) {
        if (target === 'previous') return fail(`inbox_${verb}`, 'Please open a record first — for example say "open the first record".');
        return { item: list[0], position: 1, noun: noun.one };
      }
      const next = index + (target === 'next' ? 1 : -1);
      if (next >= list.length) return fail(`inbox_${verb}`, `That was the last ${noun.one} in the list.`);
      if (next < 0) return fail(`inbox_${verb}`, `This is the first ${noun.one} in the list.`);
      return { item: list[next], position: next + 1, noun: noun.one };
    }
    const position = target === 'last' ? list.length : target;
    if (position > list.length) {
      return fail(`inbox_${verb}`, `There is no ${ordinalWord(position)} ${noun.one} in the current list — there ${list.length === 1 ? 'is only one' : `are ${list.length}`}.`);
    }
    return { item: list[position - 1], position, noun: noun.one };
  }

  private async inboxOpen(target: InboxTarget, category?: InboxView): Promise<ExecutionResult> {
    const blocked = this.requireInboxPatient();
    if (blocked) return blocked;
    const controller = await this.ensureInbox();
    if ('ok' in controller) return controller;
    const snap = controller.snapshot();
    if (target === 'this' && snap.openItem) return ok('inbox_open', `“${snap.openItem.subject}” is already open.`);

    const found = this.resolveInboxTarget(controller, target, category, 'open');
    if ('ok' in found) return found;
    const { item, position } = found;
    controller.open(item);
    await waitFor(() => controller.snapshot().openItem?.id === item.id, 2500);
    this.lastInboxIndex = controller.snapshot().items.findIndex((i) => i.id === item.id);

    const state = this.deps.getState();
    const which = position ? `the ${ordinalWord(position)} ${found.noun}` : 'the record';
    const filed = controller.snapshot().isFiled(item.id) ? ' It is already filed.' : '';
    const otherPatient = state.currentPatientId && item.patientId !== state.currentPatientId ? ` Note: this belongs to ${item.patientName}, not the selected patient.` : '';
    return ok('inbox_open', `Opened ${which}: ${categoryMeta[item.category].singular} “${item.subject}” for ${item.patientName}.${filed}${otherPatient}`);
  }

  private async inboxClose(): Promise<ExecutionResult> {
    const controller = InboxVoiceRegistry.get();
    if (!controller) return fail('inbox_close', 'The Inbox is not open.');
    if (!controller.snapshot().openItem) return ok('inbox_close', 'No record is open.');
    controller.close();
    await waitFor(() => !controller.snapshot().openItem, 2000);
    return ok('inbox_close', 'Closed the record.');
  }

  private async inboxFile(file: boolean, target: InboxTarget, category?: InboxView): Promise<ExecutionResult> {
    const verb = file ? 'file' : 'unfile';
    const blocked = this.requireInboxPatient();
    if (blocked) return blocked;
    const controller = InboxVoiceRegistry.get();
    if (!controller) return fail(`inbox_${verb}`, 'Open the Inbox first — say "open Inbox".');
    const found = this.resolveInboxTarget(controller, target, category, verb);
    if ('ok' in found) return found;
    const { item } = found;

    // Patient safety: filing acts on the selected patient's records only.
    const state = this.deps.getState();
    if (item.patientId !== state.currentPatientId) {
      return fail(
        `inbox_${verb}`,
        `This record belongs to ${item.patientName}, not the selected patient${state.currentPatientName ? ` (${state.currentPatientName})` : ''}. Nothing was ${file ? 'filed' : 'changed'}. Say "select this patient" first if you mean ${item.patientName}.`,
      );
    }
    const isFiled = controller.snapshot().isFiled(item.id);
    if (file && isFiled) return ok(`inbox_${verb}`, `“${item.subject}” is already filed.`);
    if (!file && !isFiled) return ok(`inbox_${verb}`, `“${item.subject}” is not filed.`);

    if (getConfirmFiling()) {
      this.deps.setPendingSlot(null);
      this.deps.setPendingConfirmation({
        kind: 'inbox_file',
        formId: 'inbox',
        formTitle: file ? 'File this record?' : 'Unfile this record?',
        summary: [
          { label: 'Record', value: item.subject },
          { label: 'Type', value: categoryMeta[item.category].singular.replace(/^./, (c) => c.toUpperCase()) },
          { label: 'Patient', value: item.patientName },
          { label: 'Received', value: dayjs(item.receivedAt).format('D MMM YYYY') },
        ],
        description: file ? 'Mark this record as reviewed and filed' : 'Move this record back to the unfiled queue',
        inboxItemIds: [item.id],
        inboxFile: file,
      });
      return {
        ok: true,
        tool: 'request_inbox_file_confirmation',
        message: `${file ? 'File' : 'Unfile'} “${item.subject}” for ${item.patientName}? Say “yes” to confirm or “cancel”.`,
        requiresConfirmation: true,
        stop: true,
      };
    }
    controller.file([item.id], file);
    return ok(`inbox_${verb}`, file ? `Record filed — “${item.subject}”.` : `Record moved back to unfiled — “${item.subject}”.`);
  }

  private async confirmInboxFile(pending: PendingConfirmation): Promise<ExecutionResult> {
    this.deps.setPendingConfirmation(null);
    const controller = InboxVoiceRegistry.get();
    if (!controller) return fail('confirm', 'The Inbox is no longer open, so nothing was changed.');
    if (!this.deps.getState().currentPatientId) return fail('confirm', 'Please select a patient first. Nothing was changed.');
    const ids = pending.inboxItemIds ?? [];
    if (!ids.length) return fail('confirm', 'There is no record to file.');
    controller.file(ids, pending.inboxFile !== false);
    return ok('inbox_file_after_confirmation', pending.inboxFile !== false ? 'Record filed successfully.' : 'Record moved back to unfiled.');
  }

  private async inboxScope(scope: 'patient' | 'all'): Promise<ExecutionResult> {
    const controller = await this.ensureInbox();
    if ('ok' in controller) return controller;
    if (scope === 'all') {
      controller.setPatientScope(null);
      await waitFor(() => controller.snapshot().scopePatientId === null, 2000);
      return ok('inbox_scope', `Showing every patient's items. ${this.describeList(controller)}`);
    }
    const blocked = this.requireInboxPatient();
    if (blocked) return blocked;
    const patientId = this.deps.getState().currentPatientId!;
    controller.setPatientScope(patientId);
    await waitFor(() => controller.snapshot().scopePatientId === patientId, 2000);
    return ok('inbox_scope', `Showing ${this.deps.getState().currentPatientName ?? 'the selected patient'}'s items only. ${this.describeList(controller)}`);
  }

  private async inboxSelectPatient(): Promise<ExecutionResult> {
    const controller = InboxVoiceRegistry.get();
    const item = controller?.snapshot().openItem;
    if (!item) return fail('inbox_select_patient', 'Please open a record first — its patient is the one I will select.');
    if (!item.patientId) return fail('inbox_select_patient', 'This record is not linked to a patient.');
    if (item.patientId === this.deps.getState().currentPatientId) return ok('inbox_select_patient', `${item.patientName} is already the selected patient.`);
    this.deps.setCurrentPatient(item.patientId);
    return ok('inbox_select_patient', `${item.patientName} is now the selected patient.`);
  }
}

function fail(tool: string, message: string): ExecutionResult {
  return { ok: false, tool, message, stop: true };
}

function ok(tool: string, message: string, fieldsModified?: ExecutionResult['fieldsModified']): ExecutionResult {
  return { ok: true, tool, message, fieldsModified };
}

/** The field that names a record (medication name, diagnosis, task title…). */
function primaryField(def: FormDefinition): FieldDefinition | undefined {
  return def.fields.find((f) => f.required && f.type === 'text') ?? def.fields.find((f) => f.required);
}

/** True when none of the record-defining required fields have a value. */
function isBlank(def: FormDefinition, values: Record<string, unknown>): boolean {
  return def.fields.filter((f) => f.required).every((f) => values[f.name] === undefined || values[f.name] === '' || values[f.name] === null);
}
