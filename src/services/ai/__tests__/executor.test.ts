import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandExecutor, type ExecutorDeps, type ExecutorState } from '../commandExecutor';
import { FormRegistry, type FormController, type FormValue } from '@/registry/formRegistry';
import { NavigationRegistry } from '@/registry/navigationRegistry';
import { RecordRegistry } from '@/registry/recordRegistry';
import type { AIRecordKind } from '@/types/ai';
import type { Medication, Patient, Task } from '@/types/domain';
import type { AnyRecord } from '@/services/records/recordMapping';

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

/** A tabbed medication form: several records, the active one addressed by the plain controller methods. */
function fakeMultiForm(formId: string) {
  let open = false;
  let items: Record<string, FormValue>[] = [{}];
  let active = 0;
  const submit = vi.fn(async () => undefined);
  const controller: FormController = {
    formId,
    isOpen: () => open,
    open: () => { open = true; },
    close: () => { open = false; items = [{}]; active = 0; },
    getValues: () => items[active],
    setValues: (v) => { items[active] = { ...items[active], ...v }; },
    clearField: (f) => { delete items[active][f]; },
    focusField: vi.fn(),
    validate: async () => items.flatMap((it, i) => (it.medicationName && it.dosage && it.frequency ? [] : [`Medication ${i + 1} incomplete`])),
    submit,
    summarize: () => items.map((it, i) => ({ label: `${i + 1}. ${String(it.medicationName ?? '')}`, value: `${String(it.dosage ?? '')} ${String(it.frequency ?? '')}` })),
    entries: {
      count: () => items.length,
      active: () => active,
      setActive: (i) => { active = i; },
      add: (v) => { items.push({ ...v }); active = items.length - 1; return active; },
      getAll: () => items,
    },
  };
  return { controller, submit, get items() { return items; }, get active() { return active; }, get open() { return open; } };
}

/** Stands in for a mounted module page: it owns the create/edit dialog. */
function fakeRecordPage(kind: AIRecordKind, form: { controller: FormController }) {
  const openCreate = vi.fn(() => form.controller.open());
  const openEdit = vi.fn((_id: string) => {
    form.controller.open();
    return true;
  });
  const setSearch = vi.fn();
  const unregister = RecordRegistry.register({ kind, openCreate, openEdit, setSearch });
  return { openCreate, openEdit, setSearch, unregister };
}

const PATIENT: Patient = { id: 'pat-1', fullName: 'John Smith', mrn: 'MRN-1', age: 42, gender: 'Male', phone: '555-0100', primaryProviderName: 'Dr. Sarah Ahmed' } as Patient;

const MEDS: Medication[] = [
  { id: 'med-1', patientId: 'pat-1', name: 'Metformin', dosage: '850 mg', frequency: 'Twice daily', route: 'Oral', status: 'Active', startDate: '2026-01-02' } as Medication,
  { id: 'med-2', patientId: 'pat-1', name: 'Lisinopril', dosage: '10 mg', frequency: 'Once daily', route: 'Oral', status: 'Active', startDate: '2026-02-10' } as Medication,
];

const TASKS: Task[] = [
  { id: 'task-1', patientId: 'pat-1', title: 'Blood pressure monitoring', category: 'Monitoring', status: 'Open', dueDate: '2026-03-01', assignedTo: 'Dr. Sarah Ahmed', priority: 'Normal' } as Task,
];

function makeDeps(state: Partial<ExecutorState> = {}, records: Partial<Record<AIRecordKind, AnyRecord[]>> = {}) {
  const s: ExecutorState = {
    currentPageId: 'medications',
    currentTab: null,
    currentPatientId: 'pat-1',
    currentPatientName: 'John Smith',
    openFormId: null,
    pendingConfirmation: null,
    pendingSlot: null,
    sidebarCollapsed: false,
    ...state,
  };
  const data: Partial<Record<AIRecordKind, AnyRecord[]>> = { medication: MEDS, task: TASKS, ...records };
  const deleted: Array<{ kind: AIRecordKind; id: string }> = [];
  const spoken: string[] = [];
  const deps: ExecutorDeps = {
    getState: () => s,
    navigate: vi.fn((path: string) => {
      NavigationRegistry.setPathname(path);
      const byPath: Record<string, string> = {
        '/medications': 'medications',
        '/diagnoses': 'diagnoses',
        '/tasks': 'tasks',
        '/recalls': 'recalls',
        '/appointments': 'appointments',
        '/patients': 'patients',
        '/dashboard': 'dashboard',
        '/summary': 'summary',
        '/summary/diagnosis': 'summary-diagnosis',
      };
      s.currentPageId = byPath[path.split('?')[0]] ?? s.currentPageId;
    }),
    back: vi.fn(),
    setCurrentPatient: vi.fn((id) => {
      s.currentPatientId = id;
      s.currentPatientName = id ? 'John Smith' : null;
    }),
    setActiveTab: vi.fn(),
    setOpenForm: vi.fn((id) => { s.openFormId = id; }),
    setPendingConfirmation: vi.fn((p) => { s.pendingConfirmation = p; }),
    setPendingSlot: vi.fn((p) => { s.pendingSlot = p; }),
    setPatientSearch: vi.fn(),
    toggleSidebar: vi.fn(),
    resolvePatientByName: vi.fn(async (name: string) =>
      name.toLowerCase() === 'john smith'
        ? [PATIENT]
        : name.toLowerCase() === 'ahmed'
          ? ([{ id: 'pat-2', fullName: 'Ahmed Khan' }, { id: 'pat-3', fullName: 'Ahmed Raza' }] as Patient[])
          : [],
    ),
    getPatient: () => (s.currentPatientId ? PATIENT : undefined),
    getRecords: (kind) => data[kind] ?? [],
    deleteRecord: vi.fn(async (kind: AIRecordKind, id: string) => {
      deleted.push({ kind, id });
    }),
    speak: (text: string) => { spoken.push(text); },
    describePatient: () => 'John Smith, 42 years old, male. Active problem list: Hypertension.',
  };
  return { deps, state: s, deleted, spoken };
}

describe('CommandExecutor', () => {
  beforeEach(() => {
    FormRegistry.mounted().forEach((c) => c.close());
    NavigationRegistry.setPathname('/dashboard');
  });

  it('navigates by page id and by page number', async () => {
    const { deps } = makeDeps();
    const ex = new CommandExecutor(deps);
    const r = await ex.execute({ action: 'navigate', target: 'medications' });
    expect(r.ok).toBe(true);
    expect(deps.navigate).toHaveBeenCalledWith('/medications');
    const r2 = await ex.execute({ action: 'navigate', target: 5 });
    expect(deps.navigate).toHaveBeenCalledWith('/diagnoses');
    expect(r2.message).toContain('page 5');
  });

  it('refuses every patient-dependent page while no patient is selected', async () => {
    const { deps } = makeDeps({ currentPatientId: null, currentPatientName: null });
    const ex = new CommandExecutor(deps);
    for (const target of ['dashboard', 'medications', 'diagnoses', 'tasks', 'recalls', 'appointments', 'summary']) {
      const r = await ex.execute({ action: 'navigate', target });
      expect(r.ok).toBe(false);
      expect(r.message).toContain('No patient is selected');
    }
    expect(deps.navigate).toHaveBeenCalledWith('/patients');
  });

  it('refuses to add, update or delete records without a patient', async () => {
    const { deps } = makeDeps({ currentPatientId: null, currentPatientName: null });
    const ex = new CommandExecutor(deps);
    expect((await ex.execute({ action: 'add_record', kind: 'medication' })).ok).toBe(false);
    expect((await ex.execute({ action: 'update_record', kind: 'task', match: 'blood pressure' })).ok).toBe(false);
    expect((await ex.execute({ action: 'delete_record', kind: 'recall', match: 'review' })).ok).toBe(false);
    expect(deps.deleteRecord).not.toHaveBeenCalled();
  });

  it('select_patient sets the context and opens the dashboard; an ambiguous name asks which one', async () => {
    const { deps } = makeDeps({ currentPatientId: null, currentPatientName: null });
    const ex = new CommandExecutor(deps);
    const r = await ex.execute({ action: 'select_patient', name: 'John Smith' });
    expect(deps.setCurrentPatient).toHaveBeenCalledWith('pat-1');
    expect(r.message).toContain('selected patient');
    expect(deps.navigate).toHaveBeenCalledWith('/dashboard');

    const r2 = await ex.execute({ action: 'select_patient', name: 'Ahmed' });
    expect(r2.message).toContain('Which one?');
  });

  it('add_record fills the form, asks for missing required data, then requests confirmation — never saves by itself', async () => {
    const { deps, state } = makeDeps();
    const form = fakeForm('medication');
    const unregisterForm = FormRegistry.register(form.controller);
    const page = fakeRecordPage('medication', form);
    const ex = new CommandExecutor(deps);

    const r1 = await ex.execute({ action: 'add_record', kind: 'medication', fields: { medicationName: 'Amoxicillin', dosage: '500 milligrams' } });
    expect(page.openCreate).toHaveBeenCalled();
    expect(form.open).toBe(true);
    expect(form.values.medicationName).toBe('Amoxicillin');
    expect(form.values.dosage).toBe('500 mg');
    expect(r1.message).toContain('What frequency?');
    expect(state.pendingConfirmation).toBeNull();

    const r2 = await ex.execute({ action: 'fill_field', field: 'frequency', value: 'twice a day' });
    expect(form.values.frequency).toBe('Twice daily');
    expect(r2.requiresConfirmation).toBe(true);
    expect(state.pendingConfirmation?.kind).toBe('form');
    expect(form.submit).not.toHaveBeenCalled();

    const saved = await ex.execute({ action: 'confirm' });
    expect(saved.ok).toBe(true);
    expect(form.submit).toHaveBeenCalledTimes(1);
    unregisterForm();
    page.unregister();
  });

  it('update_record opens the matching record for editing and stops at the confirmation', async () => {
    const { deps, state } = makeDeps();
    const form = fakeForm('medication', { medicationName: 'Metformin', dosage: '850 mg', frequency: 'Twice daily' });
    const unregisterForm = FormRegistry.register(form.controller);
    const page = fakeRecordPage('medication', form);
    const ex = new CommandExecutor(deps);

    const r = await ex.execute({ action: 'update_record', kind: 'medication', match: 'metformin', fields: { dosage: '1000 mg' } });
    expect(page.openEdit).toHaveBeenCalledWith('med-1');
    expect(form.values.dosage).toBe('1000 mg');
    expect(r.requiresConfirmation).toBe(true);
    expect(form.submit).not.toHaveBeenCalled();
    expect(state.pendingConfirmation?.kind).toBe('form');
    unregisterForm();
    page.unregister();
  });

  it('delete_record asks first and only deletes after an explicit confirmation', async () => {
    const { deps, state, deleted } = makeDeps();
    const ex = new CommandExecutor(deps);

    const asked = await ex.execute({ action: 'delete_record', kind: 'medication', match: 'metformin' });
    expect(asked.requiresConfirmation).toBe(true);
    expect(asked.message).toContain('permanently delete');
    expect(state.pendingConfirmation).toMatchObject({ kind: 'delete', recordKind: 'medication', recordId: 'med-1' });
    expect(deps.deleteRecord).not.toHaveBeenCalled();

    const done = await ex.execute({ action: 'confirm' });
    expect(done.ok).toBe(true);
    expect(deleted).toEqual([{ kind: 'medication', id: 'med-1' }]);
    expect(state.pendingConfirmation).toBeNull();
  });

  it('cancelling a staged deletion deletes nothing', async () => {
    const { deps, state } = makeDeps();
    const ex = new CommandExecutor(deps);
    await ex.execute({ action: 'delete_record', kind: 'medication', match: 'lisinopril' });
    const cancelled = await ex.execute({ action: 'cancel' });
    expect(cancelled.message).toContain('nothing was deleted');
    expect(deps.deleteRecord).not.toHaveBeenCalled();
    expect(state.pendingConfirmation).toBeNull();
  });

  it('an ambiguous or unknown delete target is never guessed', async () => {
    const { deps } = makeDeps({}, { medication: [...MEDS, { id: 'med-3', patientId: 'pat-1', name: 'Metformin XR', dosage: '500 mg', frequency: 'Once daily', route: 'Oral', status: 'Active', startDate: '2026-02-01' } as Medication] });
    const ex = new CommandExecutor(deps);
    const ambiguous = await ex.execute({ action: 'delete_record', kind: 'medication', match: 'met' });
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.message).toContain('Which one');
    const missing = await ex.execute({ action: 'delete_record', kind: 'medication', match: 'aspirin' });
    expect(missing.ok).toBe(false);
    expect(missing.message).toContain("couldn't find");
    expect(deps.deleteRecord).not.toHaveBeenCalled();
  });

  it('read_records reads the patient list back and speaks it', async () => {
    const { deps, spoken } = makeDeps();
    const r = await new CommandExecutor(deps).execute({ action: 'read_records', kind: 'medication' });
    expect(r.ok).toBe(true);
    expect(r.speak).toBe(true);
    expect(r.message).toContain('Metformin 850 mg');
    expect(spoken).toHaveLength(1);
  });

  it('summarize_patient speaks an overview built from real data', async () => {
    const { deps, spoken } = makeDeps();
    const r = await new CommandExecutor(deps).execute({ action: 'summarize_patient' });
    expect(r.message).toContain('John Smith');
    expect(spoken[0]).toContain('Hypertension');
  });

  it('validation errors block saving', async () => {
    const { deps } = makeDeps();
    const form = fakeForm('medication', { dosage: '10 mg', frequency: 'Once daily' });
    const unregister = FormRegistry.register(form.controller);
    form.controller.open();
    const ex = new CommandExecutor(deps);
    deps.setPendingConfirmation({ kind: 'form', formId: 'medication', formTitle: 'Medication', summary: [], description: 'save' });
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

  it('splits a full medication phrase that a model put into the name field', async () => {
    const { deps } = makeDeps();
    const form = fakeForm('medication');
    const unregister = FormRegistry.register(form.controller);
    await new CommandExecutor(deps).execute({ action: 'fill_field', formId: 'medication', field: 'medicationName', value: 'amoxicillin 500 milligrams orally twice daily for seven days' });
    expect(form.values).toMatchObject({ medicationName: 'Amoxicillin', dosage: '500 mg', route: 'Oral', frequency: 'Twice daily', duration: '7 days' });
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

  it('several medications fill one tab each and the missing dosages are asked for in turn', async () => {
    const { deps, state } = makeDeps();
    const form = fakeMultiForm('medication');
    const unregisterForm = FormRegistry.register(form.controller);
    const page = fakeRecordPage('medication', form);
    const ex = new CommandExecutor(deps);
    const shared = { frequency: 'Twice daily', duration: '10 days' };

    const r1 = await ex.execute({
      action: 'add_record',
      kind: 'medication',
      fields: { medicationName: 'Panadol', ...shared },
      records: [{ medicationName: 'Panadol', ...shared }, { medicationName: 'Paracetamol', ...shared }, { medicationName: 'Metformin', ...shared }],
    });
    expect(form.items.map((m) => m.medicationName)).toEqual(['Panadol', 'Paracetamol', 'Metformin']);
    expect(form.items.every((m) => m.frequency === 'Twice daily' && m.duration === '10 days')).toBe(true);
    expect(r1.message).toContain('What dosage for Panadol?');

    await ex.execute({ action: 'fill_field', field: 'dosage', value: '500 mg' });
    await ex.execute({ action: 'fill_field', field: 'dosage', value: '650 mg' });
    const r4 = await ex.execute({ action: 'fill_field', field: 'dosage', value: '850 mg' });
    expect(form.items.map((m) => m.dosage)).toEqual(['500 mg', '650 mg', '850 mg']);
    expect(r4.requiresConfirmation).toBe(true);
    expect(state.pendingConfirmation?.summary).toHaveLength(3);
    expect(form.submit).not.toHaveBeenCalled();

    const saved = await ex.execute({ action: 'confirm' });
    expect(saved.ok).toBe(true);
    expect(form.submit).toHaveBeenCalledTimes(1);
    unregisterForm();
    page.unregister();
  });

  it('splits a run of drug names that a model joined into one medicationName', async () => {
    const { deps } = makeDeps();
    const form = fakeMultiForm('medication');
    const unregister = FormRegistry.register(form.controller);
    const page = fakeRecordPage('medication', form);
    await new CommandExecutor(deps).execute({ action: 'add_record', kind: 'medication', fields: { medicationName: 'panadol paracetamol metformin', frequency: 'twice daily', duration: '10 days' } });
    expect(form.items.map((m) => m.medicationName)).toEqual(['Panadol', 'Paracetamol', 'Metformin']);
    unregister();
    page.unregister();
  });

  it('open_tab moves between the Summary tabs', async () => {
    const { deps } = makeDeps({ currentPageId: 'summary' });
    const r = await new CommandExecutor(deps).execute({ action: 'open_tab', tab: 'diagnosis' });
    expect(r.ok).toBe(true);
    expect(deps.navigate).toHaveBeenCalledWith('/summary/diagnosis');
  });
});
