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
import type { AICommand, AIRecordKind, FieldValues, PendingConfirmation } from '@/types/ai';
import type { Patient } from '@/types/domain';
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
}

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

  async execute(command: AICommand): Promise<ExecutionResult> {
    try {
      switch (command.action) {
        case 'navigate':
          return this.navigate(command.target);
        case 'go_back':
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
        case 'help':
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
    const hadPending = !!state.pendingConfirmation || !!state.pendingSlot;
    this.deps.setPendingConfirmation(null);
    this.deps.setPendingSlot(null);
    if (wasDelete) return ok('cancel_command', 'Cancelled — nothing was deleted.');
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
