import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandExecutor, type ExecutorDeps, type ExecutorState } from '../commandExecutor';
import { FormRegistry, type FormController, type FormValue } from '@/registry/formRegistry';
import { NavigationRegistry } from '@/registry/navigationRegistry';
import type { Patient, Provider } from '@/types/domain';

/** Minimal in-memory form controller standing in for a mounted Ant Design form. */
function fakeForm(formId: string, initial: Record<string, FormValue> = {}) {
  let open = false;
  let values: Record<string, FormValue> = { ...initial };
  const submit = vi.fn(async () => undefined);
  const controller: FormController = {
    formId,
    isOpen: () => open,
    open: () => { open = true; },
    close: () => { open = false; },
    getValues: () => values,
    setValues: (v) => { values = { ...values, ...v }; },
    clearField: (f) => { delete values[f]; },
    focusField: vi.fn(),
    validate: async () => (values.medicationName ? [] : ['Medication Name is required']),
    submit,
    summarize: () => Object.entries(values).map(([label, value]) => ({ label, value: String(value) })),
  };
  return { controller, submit, get values() { return values; }, get open() { return open; } };
}

function makeDeps(state: Partial<ExecutorState> = {}) {
  const s: ExecutorState = { currentPageId: 'medications', currentPatientId: null, currentPatientName: null, currentProviderId: null, openFormId: null, pendingConfirmation: null, pendingSlot: null, sidebarCollapsed: false, ...state };
  const deps: ExecutorDeps = {
    getState: () => s,
    navigate: vi.fn((path: string) => { NavigationRegistry.setPathname(path); s.currentPageId = path === '/clinical/medications' ? 'medications' : path === '/patients/search' ? 'patient-search' : path.startsWith('/patients/pat-1') ? 'patient-profile' : s.currentPageId; }),
    back: vi.fn(),
    setCurrentPatient: vi.fn((id) => { s.currentPatientId = id; }),
    setCurrentProvider: vi.fn(),
    setActiveTab: vi.fn(),
    setOpenForm: vi.fn((id) => { s.openFormId = id; }),
    setPendingConfirmation: vi.fn((p) => { s.pendingConfirmation = p; }),
    setPendingSlot: vi.fn((p) => { s.pendingSlot = p; }),
    setPatientSearch: vi.fn(),
    toggleSidebar: vi.fn(),
    resolvePatientByName: vi.fn(async (name: string) => (name.toLowerCase() === 'john smith' ? [{ id: 'pat-1', fullName: 'John Smith' } as Patient] : name.toLowerCase() === 'ahmed' ? [{ id: 'pat-2', fullName: 'Ahmed Khan' } as Patient, { id: 'pat-3', fullName: 'Ahmed Raza' } as Patient] : [])),
    resolveProviderByName: vi.fn(async () => [] as Provider[]),
  };
  return { deps, state: s };
}

describe('CommandExecutor', () => {
  beforeEach(() => {
    // Fresh registry per test.
    FormRegistry.mounted().forEach((c) => c.close());
    NavigationRegistry.setPathname('/dashboard');
  });

  it('navigate_to_page resolves pages by id and number', async () => {
    const { deps } = makeDeps();
    const ex = new CommandExecutor(deps);
    const r = await ex.execute({ action: 'navigate', target: 'patient-search' });
    expect(r.ok).toBe(true);
    expect(deps.navigate).toHaveBeenCalledWith('/patients/search');
    const r2 = await ex.execute({ action: 'navigate', target: 30 });
    expect(deps.navigate).toHaveBeenCalledWith('/clinical/prescriptions');
    expect(r2.message).toContain('page 30');
  });

  it('refuses patient-scoped pages without a patient in context', async () => {
    const { deps } = makeDeps();
    const r = await new CommandExecutor(deps).execute({ action: 'navigate', target: 'patient-allergies' });
    expect(r.ok).toBe(false);
    expect(deps.navigate).toHaveBeenCalledWith('/patients/search');
  });

  it('search_patient navigates with the query', async () => {
    const { deps } = makeDeps();
    const r = await new CommandExecutor(deps).execute({ action: 'search_patient', query: 'Ahmed Khan' });
    expect(r.ok).toBe(true);
    expect(deps.setPatientSearch).toHaveBeenCalledWith('Ahmed Khan');
    expect(deps.navigate).toHaveBeenCalledWith('/patients/search?q=Ahmed%20Khan');
  });

  it('open_patient opens a unique match and falls back to search on ambiguity', async () => {
    const { deps } = makeDeps();
    const ex = new CommandExecutor(deps);
    const r = await ex.execute({ action: 'open_patient', name: 'John Smith' });
    expect(r.ok).toBe(true);
    expect(deps.setCurrentPatient).toHaveBeenCalledWith('pat-1');
    expect(deps.navigate).toHaveBeenCalledWith('/patients/pat-1');
    const r2 = await ex.execute({ action: 'open_patient', name: 'Ahmed' });
    expect(r2.message).toContain('2 patients');
  });

  it('fill_medication_form fills fields, asks for missing required data, then requests confirmation — never saves by itself', async () => {
    const { deps, state } = makeDeps();
    const form = fakeForm('medication');
    const unregister = FormRegistry.register(form.controller);
    const ex = new CommandExecutor(deps);

    const r1 = await ex.execute({ action: 'add_medication', fields: { medicationName: 'Amoxicillin', dosage: '500 milligrams' } });
    expect(form.open).toBe(true);
    expect(form.values.medicationName).toBe('Amoxicillin');
    expect(form.values.dosage).toBe('500 mg');
    expect(r1.message).toContain('What frequency?');
    expect(state.pendingSlot?.field).toBe('frequency');
    expect(state.pendingConfirmation).toBeNull();

    const r2 = await ex.execute({ action: 'fill_field', field: 'frequency', value: 'twice a day' });
    expect(form.values.frequency).toBe('Twice daily');
    expect(r2.requiresConfirmation).toBe(true);
    expect(state.pendingConfirmation?.formId).toBe('medication');
    expect(form.submit).not.toHaveBeenCalled();
    unregister();
  });

  it('confirm saves only after explicit confirmation; cancel closes without saving', async () => {
    const { deps, state } = makeDeps();
    const form = fakeForm('medication', { medicationName: 'Lisinopril', dosage: '10 mg', frequency: 'Once daily' });
    const unregister = FormRegistry.register(form.controller);
    const ex = new CommandExecutor(deps);

    const notPending = await ex.execute({ action: 'confirm' });
    expect(notPending.ok).toBe(false);

    form.controller.open();
    const req = await ex.execute({ action: 'submit_form' });
    expect(req.requiresConfirmation).toBe(true);
    expect(form.submit).not.toHaveBeenCalled();

    const saved = await ex.execute({ action: 'confirm' });
    expect(saved.ok).toBe(true);
    expect(saved.tool).toBe('save_after_confirmation');
    expect(form.submit).toHaveBeenCalledTimes(1);
    expect(state.pendingConfirmation).toBeNull();

    form.controller.open();
    await ex.execute({ action: 'submit_form' });
    const cancelled = await ex.execute({ action: 'cancel' });
    expect(cancelled.ok).toBe(true);
    expect(form.open).toBe(false);
    expect(form.submit).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('validation errors block saving', async () => {
    const { deps } = makeDeps();
    const form = fakeForm('medication', { dosage: '10 mg', frequency: 'Once daily' });
    const unregister = FormRegistry.register(form.controller);
    form.controller.open();
    const ex = new CommandExecutor(deps);
    deps.setPendingConfirmation({ formId: 'medication', formTitle: 'Medication', summary: [], description: 'save' });
    const r = await ex.execute({ action: 'confirm' });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('validation');
    expect(form.submit).not.toHaveBeenCalled();
    unregister();
  });

  it('ignores unknown fields rather than guessing', async () => {
    const { deps } = makeDeps();
    const form = fakeForm('medication', { medicationName: 'X', dosage: '1 mg', frequency: 'Once daily' });
    const unregister = FormRegistry.register(form.controller);
    const r = await new CommandExecutor(deps).execute({ action: 'fill_form', formId: 'medication', fields: { colour: 'blue' } });
    expect(r.message).toContain('ignored unknown field');
    expect(form.values.colour).toBeUndefined();
    unregister();
  });

  it('unknown and invalid commands stop the batch', async () => {
    const { deps } = makeDeps();
    const ex = new CommandExecutor(deps);
    const results = await ex.executeAll([{ action: 'unknown', reason: 'nope' }, { action: 'go_back' }]);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(deps.back).not.toHaveBeenCalled();
  });

  it('executeAll performs multi-step navigation then stops at the confirmation boundary', async () => {
    const { deps, state } = makeDeps({ currentPageId: 'dashboard' });
    const form = fakeForm('medication');
    const unregister = FormRegistry.register(form.controller);
    const ex = new CommandExecutor(deps);
    const results = await ex.executeAll([
      { action: 'navigate', target: 29 },
      { action: 'add_medication', fields: { medicationName: 'Amoxicillin', dosage: '500 mg', frequency: 'Twice daily', duration: 'seven days' } },
      { action: 'submit_form' },
    ]);
    expect(deps.navigate).toHaveBeenCalledWith('/clinical/medications');
    expect(results).toHaveLength(2); // submit_form never ran
    expect(results[1].requiresConfirmation).toBe(true);
    expect(form.values.duration).toBe('7 days');
    expect(form.submit).not.toHaveBeenCalled();
    expect(state.pendingConfirmation).not.toBeNull();
    unregister();
  });
});
