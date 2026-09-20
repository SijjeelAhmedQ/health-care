/**
 * Deterministic command executor.
 *
 * Takes validated AICommands and performs them through the registries
 * (PageRegistry, FormRegistry, FieldRegistry, NavigationRegistry) and Redux.
 * No DOM queries, no arbitrary code — every action is an explicit tool below.
 * Sensitive actions (saving/submitting) never run without an explicit confirm.
 */
import type { AICommand, FieldValues, PendingConfirmation } from '@/types/ai';
import type { Patient, Provider } from '@/types/domain';
import { FieldRegistry, type FormDefinition } from '@/registry/fieldRegistry';
import { FormRegistry, type FormController } from '@/registry/formRegistry';
import { NavigationRegistry } from '@/registry/navigationRegistry';
import { PageRegistry, type PageDefinition } from '@/registry/pageRegistry';
import type { PendingSlot } from '@/store/slices/voiceSlice';
import { parseMedicationPhrase } from './ruleBasedInterpreter';
import { ageToDob } from './dateParser';

export interface ExecutorState {
  currentPageId: string | null;
  currentPatientId: string | null;
  currentPatientName: string | null;
  currentProviderId: string | null;
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
  setCurrentProvider(id: string | null): void;
  setActiveTab(pageId: string, tab: string): void;
  setOpenForm(formId: string | null): void;
  setPendingConfirmation(p: PendingConfirmation | null): void;
  setPendingSlot(s: PendingSlot | null): void;
  setPatientSearch(query: string): void;
  toggleSidebar(): void;
  resolvePatientByName(name: string): Promise<Patient[]>;
  resolveProviderByName(name: string): Promise<Provider[]>;
  /** Optional: used for waiting until a route/page finished mounting. */
  now?: () => number;
}

export interface ExecutionResult {
  ok: boolean;
  tool: string;
  message: string;
  /** When true the executor stops processing subsequent commands in the batch. */
  stop?: boolean;
  requiresConfirmation?: boolean;
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
          return this.navigate(command.target, command.params);
        case 'go_back':
          this.deps.back();
          return ok('go_back', 'Going back.');
        case 'go_home':
          return this.navigate('dashboard');
        case 'toggle_sidebar':
          this.deps.toggleSidebar();
          return ok('toggle_sidebar', 'Toggled the sidebar.');
        case 'search_patient':
          return this.searchPatient(command.query);
        case 'open_patient':
          return this.openPatient(command);
        case 'open_patient_section':
          return this.openPatientSection(command.section);
        case 'open_provider':
          return this.openProvider(command.name, command.providerId);
        case 'open_appointment':
          if (command.appointmentId) return this.navigate('appointment-details', { id: command.appointmentId });
          return this.navigate('appointment-search');
        case 'open_form':
          return this.openForm(command.formId);
        case 'close_form':
          return this.closeForm(command.formId);
        case 'fill_form':
          return this.fillForm(command.formId, command.fields);
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
        case 'scroll':
          return this.scroll(command.direction, command.section);
        case 'open_tab':
          return this.openTab(command.tab);
        case 'open_modal':
          return this.openForm(command.modalId);
        case 'close_modal':
          return this.closeForm();
        case 'submit_form':
          return this.requestSubmit(command.formId);
        case 'confirm':
          return this.confirm();
        case 'cancel':
          return this.cancel();
        case 'ask_user':
          return this.askUser(command.question, command.field, command.formId);
        case 'add_medication':
          return this.compositeForm('medication', command.fields);
        case 'create_appointment':
          return this.compositeForm('appointment', command.fields);
        case 'register_patient':
          return this.compositeForm('patient', command.fields);
        case 'help':
          return ok('help', 'Try: "Go to patient search", "Open John Smith", "Go to page 30 and add medication", "Add Amoxicillin 500 mg twice daily for 7 days", "Create an appointment for Ahmed tomorrow at 3 PM", "Save it", "Cancel".');
        case 'respond':
          return ok('respond', command.message);
        case 'unknown':
          return { ok: false, tool: 'unknown', message: `${command.reason ?? "Sorry, I didn't understand that."} Try a full command, e.g. "go to patient search" or "add medication".`, stop: true };
        default:
          return { ok: false, tool: 'unknown', message: 'Unsupported command.', stop: true };
      }
    } catch (e) {
      return { ok: false, tool: command.action, message: (e as Error).message || 'Something went wrong executing that command.', stop: true };
    }
  }

  // ---------------------------------------------------------------- navigation

  private resolvePageForContext(target: string | number): PageDefinition | undefined {
    const page = PageRegistry.resolve(target);
    if (!page) return undefined;
    // "medications" while a patient is in context -> patient medications tab
    const state = this.deps.getState();
    if (state.currentPatientId) {
      const patientVariant: Record<string, string> = { medications: 'patient-medications', 'clinical-notes': 'patient-notes', 'clinical-documents': 'patient-documents', diagnosis: 'patient-problems' };
      const alt = patientVariant[page.id];
      if (alt && typeof target === 'string' && !/page\s*\d+/.test(target) && Number.isNaN(Number(target)) && state.currentPageId?.startsWith('patient-')) {
        return PageRegistry.get(alt) ?? page;
      }
    }
    return page;
  }

  private async navigate(target: string | number, params?: Record<string, string>): Promise<ExecutionResult> {
    const page = this.resolvePageForContext(target);
    if (!page) return { ok: false, tool: 'navigate_to_page', message: `I couldn't find a page for "${target}".`, stop: true };

    const state = this.deps.getState();
    const ctxParams: Record<string, string | undefined> = {
      patientId: state.currentPatientId ?? undefined,
      providerId: state.currentProviderId ?? undefined,
      ...params,
    };
    if (page.requiresContext === 'patientId' && !ctxParams.patientId && !params?.id) {
      this.deps.navigate(PageRegistry.get('patient-search')!.path);
      return { ok: false, tool: 'navigate_to_page', message: `"${page.title}" belongs to a patient. Please open a patient first — I've taken you to Patient Search.`, stop: true };
    }
    if (page.requiresContext === 'providerId' && !ctxParams.providerId && !params?.id) {
      this.deps.navigate(PageRegistry.get('provider-list')!.path);
      return { ok: false, tool: 'navigate_to_page', message: `Please open a provider first — showing the provider list.`, stop: true };
    }
    const path = PageRegistry.buildPath(page, { ...ctxParams, id: params?.id ?? (page.requiresContext ? ctxParams[page.requiresContext] : undefined) });
    if (!path) return { ok: false, tool: 'navigate_to_page', message: `Missing information to open ${page.title}.`, stop: true };

    this.deps.navigate(path);
    await waitFor(() => NavigationRegistry.pathname() === path, 2500);
    if (page.parentId && page.tab) this.deps.setActiveTab(page.parentId, page.tab);
    await sleep(120); // allow lazy page to mount + register forms
    return ok('navigate_to_page', `Opened ${page.title} (page ${page.number}).`);
  }

  private async searchPatient(query: string): Promise<ExecutionResult> {
    this.deps.setPatientSearch(query);
    const page = PageRegistry.get('patient-search')!;
    this.deps.navigate(`${page.path}?q=${encodeURIComponent(query)}`);
    await sleep(150);
    return ok('search_patient', `Searching patients for "${query}".`);
  }

  private async openPatient(cmd: Extract<AICommand, { action: 'open_patient' }>): Promise<ExecutionResult> {
    let patient: Patient | undefined;
    if (cmd.patientId) {
      this.deps.setCurrentPatient(cmd.patientId);
      const res = await this.navigate(cmd.section ? this.sectionPageId(cmd.section) : 'patient-profile', { id: cmd.patientId });
      return { ...res, tool: 'open_patient' };
    }
    const query = cmd.name ?? cmd.mrn ?? '';
    if (!query) return { ok: false, tool: 'open_patient', message: 'Which patient should I open?', stop: true };
    const matches = await this.deps.resolvePatientByName(query);
    if (matches.length === 1 || (matches.length > 1 && matches[0].fullName.toLowerCase() === query.toLowerCase())) patient = matches[0];
    if (!patient) {
      await this.searchPatient(query);
      return {
        ok: matches.length > 0,
        tool: 'open_patient',
        message: matches.length ? `I found ${matches.length} patients matching "${query}". Please pick one from the search results.` : `No patient named "${query}" was found. Showing patient search.`,
        stop: true,
      };
    }
    this.deps.setCurrentPatient(patient.id);
    const res = await this.navigate(cmd.section ? this.sectionPageId(cmd.section) : 'patient-profile', { id: patient.id });
    return { ...res, tool: 'open_patient', message: `${patient.fullName}'s ${cmd.section ? cmd.section : 'profile'} is open.` };
  }

  private sectionPageId(section: string): string {
    const q = section.toLowerCase().trim();
    const page = PageRegistry.all().find((p) => p.parentId === 'patient-profile' && (p.tab === q || p.aliases.includes(q) || p.title.toLowerCase().includes(q)));
    return page?.id ?? PageRegistry.resolve(`patient ${q}`)?.id ?? 'patient-profile';
  }

  private async openPatientSection(section: string): Promise<ExecutionResult> {
    const state = this.deps.getState();
    if (!state.currentPatientId) {
      this.deps.navigate(PageRegistry.get('patient-search')!.path);
      return { ok: false, tool: 'open_patient_section', message: 'No patient is open. Please open a patient first.', stop: true };
    }
    const res = await this.navigate(this.sectionPageId(section), { id: state.currentPatientId });
    return { ...res, tool: 'open_patient_section' };
  }

  private async openProvider(name?: string, providerId?: string): Promise<ExecutionResult> {
    if (providerId) {
      this.deps.setCurrentProvider(providerId);
      return { ...(await this.navigate('provider-profile', { id: providerId })), tool: 'open_provider' };
    }
    if (!name) return { ok: false, tool: 'open_provider', message: 'Which provider should I open?', stop: true };
    const matches = await this.deps.resolveProviderByName(name);
    if (matches.length !== 1) {
      this.deps.navigate(`${PageRegistry.get('provider-list')!.path}?q=${encodeURIComponent(name)}`);
      return { ok: matches.length > 0, tool: 'open_provider', message: matches.length ? `Several providers match "${name}". Please pick one.` : `No provider named "${name}" found.`, stop: true };
    }
    this.deps.setCurrentProvider(matches[0].id);
    const res = await this.navigate('provider-profile', { id: matches[0].id });
    return { ...res, tool: 'open_provider', message: `${matches[0].fullName}'s profile is open.` };
  }

  // -------------------------------------------------------------------- forms

  private async ensureForm(formId: string): Promise<{ def: FormDefinition; controller: FormController } | ExecutionResult> {
    const def = FieldRegistry.getForm(formId) ?? FieldRegistry.resolveForm(formId, this.deps.getState().currentPageId);
    if (!def) return { ok: false, tool: 'open_form', message: `There is no form called "${formId}".`, stop: true };

    let controller = FormRegistry.get(def.id);
    if (!controller) {
      // Navigate to the best page hosting the form (prefer patient-scoped page when a patient is in context).
      const state = this.deps.getState();
      const hostPage = def.pages.find((p) => (state.currentPatientId ? PageRegistry.get(p)?.requiresContext === 'patientId' : !PageRegistry.get(p)?.requiresContext)) ?? def.pages.find((p) => !PageRegistry.get(p)?.requiresContext) ?? def.pages[0];
      const nav = await this.navigate(hostPage);
      if (!nav.ok) return nav;
      controller = await waitFor(() => FormRegistry.get(def.id), 4000);
    }
    if (!controller) return { ok: false, tool: 'open_form', message: `The ${def.title} form is not available on this page.`, stop: true };
    return { def, controller };
  }

  private async openForm(formId: string): Promise<ExecutionResult> {
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

  private async fillForm(formId: string | undefined, fields: FieldValues, tool = 'fill_form'): Promise<ExecutionResult> {
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

    // Safety net: if a whole medication phrase landed in the name field ("amoxicillin 500 mg twice daily"),
    // split it into its structured fields so no spoken information is lost, whichever model produced it.
    const incoming: FieldValues = { ...fields };
    const nameValue = incoming.medicationName;
    if (typeof nameValue === 'string' && /\d+\s*(mg|mcg|g|ml|units?|milligrams?|micrograms?)\b/i.test(nameValue) && FieldRegistry.resolveField(def.id, 'medicationName')) {
      const parsed = parseMedicationPhrase(nameValue);
      if (parsed.medicationName) Object.assign(incoming, parsed, Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'medicationName')));
    }

    // Patient form: a spoken age is enough to satisfy the required date of birth (approximate, editable before saving).
    if (def.id === 'patient' && incoming.age !== undefined && incoming.dateOfBirth === undefined && !controller.getValues().dateOfBirth) {
      const age = Number(String(incoming.age).replace(/\D/g, ''));
      if (age > 0 && age < 130) incoming.dateOfBirth = ageToDob(age);
    }

    const values: Record<string, string | number | boolean> = {};
    const modified: ExecutionResult['fieldsModified'] = [];
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
    // Resolve fuzzy patient / provider names to real records.
    if (typeof values.patientName === 'string' && FieldRegistry.resolveField(def.id, 'patientName')) {
      const matches = await this.deps.resolvePatientByName(values.patientName);
      if (matches.length === 1) values.patientName = matches[0].fullName;
    }
    if (typeof values.providerName === 'string' && FieldRegistry.resolveField(def.id, 'providerName')) {
      const matches = await this.deps.resolveProviderByName(values.providerName);
      if (matches.length === 1) values.providerName = matches[0].fullName;
    }
    if (Object.keys(values).length) controller.setValues(values);
    this.deps.setPendingSlot(null);

    // Decide next step: ask for missing required fields or offer to save.
    const current = controller.getValues();
    const missing = FieldRegistry.missingRequired(def.id, current);
    const filledSummary = modified.map((m) => `${FieldRegistry.resolveField(def.id, m.field)?.label ?? m.field}: ${m.value}`).join(', ');
    const unknownNote = unknown.length ? ` (ignored unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')})` : '';

    if (missing.length) {
      const next = missing[0];
      const question = `What ${next.label.toLowerCase()}?`;
      this.deps.setPendingConfirmation(null);
      this.deps.setPendingSlot({ formId: def.id, field: next.name, label: next.label, question });
      controller.focusField(next.name);
      return { ok: true, tool, message: `${filledSummary ? `Filled ${filledSummary}. ` : ''}${question}${unknownNote}`, fieldsModified: modified, stop: true };
    }
    this.deps.setPendingConfirmation({ formId: def.id, formTitle: def.title, summary: controller.summarize(), description: def.sensitiveDescription });
    return {
      ok: true,
      tool,
      message: `${def.title} form completed${filledSummary ? ` — ${filledSummary}` : ''}.${unknownNote} Please review, then say "save it" to ${def.sensitiveDescription.toLowerCase()} or "cancel".`,
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

  private async compositeForm(requested: 'medication' | 'appointment' | 'patient', fields?: FieldValues): Promise<ExecutionResult> {
    const state = this.deps.getState();
    let formId: string = requested;
    // "Add medication" on the Prescriptions page should use the prescription form (same medication fields)
    // rather than navigating away — any form on the current page that carries the primary field qualifies.
    if (requested === 'medication' && state.currentPageId && !FieldRegistry.getForm(requested)!.pages.includes(state.currentPageId)) {
      const alt = FieldRegistry.formsForPage(state.currentPageId).find((f) => f.fields.some((x) => x.name === 'medicationName'));
      if (alt) formId = alt.id;
    }
    const def = FieldRegistry.getForm(formId)!;
    const onHostPage = state.currentPageId ? def.pages.includes(state.currentPageId) : false;
    if (!onHostPage) {
      const target = requested === 'medication' ? (state.currentPatientId ? 'patient-medications' : 'medications') : requested === 'appointment' ? 'create-appointment' : 'patient-registration';
      const nav = await this.navigate(target);
      if (!nav.ok) return nav;
    }
    const opened = await this.openForm(formId);
    if (!opened.ok) return opened;
    const merged: FieldValues = { ...(fields ?? {}) };
    if (formId !== 'patient' && state.currentPatientName && !merged.patientName && FieldRegistry.resolveField(formId, 'patientName')) merged.patientName = state.currentPatientName;
    if (Object.keys(merged).length === 0) {
      const missing = FieldRegistry.missingRequired(formId, FormRegistry.get(formId)?.getValues() ?? {});
      if (missing.length) {
        const next = missing[0];
        const question = `${def.title} form is open. What ${next.label.toLowerCase()}?`;
        this.deps.setPendingSlot({ formId, field: next.name, label: next.label, question });
        return { ok: true, tool: `open_${formId}_form`, message: question, stop: true };
      }
      return { ...opened, tool: `open_${formId}_form` };
    }
    const filled = await this.fillForm(formId, merged, `fill_${formId}_form`);
    return filled;
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
    this.deps.setPendingConfirmation({ formId: def.id, formTitle: def.title, summary: controller.summarize(), description: def.sensitiveDescription });
    return { ok: true, tool: 'request_confirmation', message: `Ready to ${def.sensitiveDescription.toLowerCase()}. Say "yes" to confirm or "cancel".`, requiresConfirmation: true, stop: true };
  }

  private async confirm(): Promise<ExecutionResult> {
    const state = this.deps.getState();
    const pending = state.pendingConfirmation;
    if (!pending) return { ok: false, tool: 'confirm', message: 'There is nothing waiting for confirmation.', stop: true };
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
    const hadPending = !!state.pendingConfirmation || !!state.pendingSlot;
    this.deps.setPendingConfirmation(null);
    this.deps.setPendingSlot(null);
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

  private async openTab(tab: string): Promise<ExecutionResult> {
    const state = this.deps.getState();
    if (!state.currentPageId) return { ok: false, tool: 'open_tab', message: 'No page is open.', stop: true };
    // Patient profile tabs are registered as pages — reuse that mapping.
    const child = PageRegistry.all().find((p) => p.parentId && p.parentId === (PageRegistry.get(state.currentPageId!)?.parentId ?? state.currentPageId) && (p.tab === tab.toLowerCase() || p.aliases.includes(tab.toLowerCase())));
    if (child) return this.navigate(child.id);
    this.deps.setActiveTab(state.currentPageId, tab.toLowerCase().replace(/\s+/g, '-'));
    return ok('open_tab', `Opened the ${tab} tab.`);
  }
}

function ok(tool: string, message: string, fieldsModified?: ExecutionResult['fieldsModified']): ExecutionResult {
  return { ok: true, tool, message, fieldsModified };
}
