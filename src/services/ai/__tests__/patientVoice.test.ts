/**
 * Patient management by voice: add, update, delete, search and select.
 *
 * The interpreter half checks what each spoken sentence means; the executor half
 * checks the safety rules — the right patient or none, only the fields that were
 * said, and never a save or a delete without an explicit word from the user.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interpret } from '../ruleBasedInterpreter';
import { CommandExecutor, type ExecutorDeps, type ExecutorState } from '../commandExecutor';
import { FormRegistry, type FormController, type FormValue } from '@/registry/formRegistry';
import { NavigationRegistry } from '@/registry/navigationRegistry';
import { RecordRegistry } from '@/registry/recordRegistry';
import type { AIContext, AIRecordKind } from '@/types/ai';
import type { Patient } from '@/types/domain';

const ctx = (over: Partial<AIContext> = {}): AIContext => ({
  currentPageId: 'dashboard',
  currentPageTitle: 'Dashboard',
  currentPageNumber: 1,
  currentPatientId: 'pat-1',
  currentPatientName: 'John Smith',
  currentTab: null,
  openFormId: null,
  openFormFields: [],
  pendingSlot: null,
  awaitingConfirmation: false,
  recentTranscripts: [],
  ...over,
});
const one = (text: string, c: AIContext = ctx()) => interpret(text, c);
const patientForm = ctx({ currentPageId: 'patients', openFormId: 'patient' });

describe('interpreting patient commands', () => {
  it('add: opens the form, with whatever details were said', () => {
    for (const text of ['Add a new patient', 'Create a new patient']) expect(one(text)).toEqual([{ action: 'add_record', kind: 'patient' }]);
    for (const text of ['Add patient John Smith', 'Create patient John Smith', 'Create a patient named John Smith']) {
      expect(one(text)).toEqual([{ action: 'add_record', kind: 'patient', fields: { firstName: 'John', lastName: 'Smith' } }]);
    }
    expect(one('Add patient John Smith, date of birth January 10 1990')).toEqual([
      { action: 'add_record', kind: 'patient', fields: { firstName: 'John', lastName: 'Smith', dateOfBirth: '1990-01-10' } },
    ]);
  });

  it('add: labelled fields, also across the full stops the speech engine inserts', () => {
    expect(one('Add a new patient with first name John, last name Smith')[0]).toMatchObject({ action: 'add_record', kind: 'patient', fields: { firstName: 'john', lastName: 'smith' } });
    const dictated = one('Add a new patient. First name John, last name Smith, date of birth January 10, 1990.');
    expect(dictated).toEqual([{ action: 'add_record', kind: 'patient', fields: { firstName: 'john', lastName: 'smith', dateOfBirth: '1990-01-10' } }]);
    expect(one('add patient John Smith, gender male, phone 0300 1234567, email john at gmail dot com')[0]).toMatchObject({
      fields: { firstName: 'John', lastName: 'Smith', gender: 'Male', phone: '0300 1234567', email: 'john@gmail.com' },
    });
  });

  it('dictating into the open patient form fills only the fields said', () => {
    expect(one('First name John, last name Smith', patientForm)).toEqual([{ action: 'fill_form', formId: 'patient', fields: { firstName: 'john', lastName: 'smith' } }]);
    expect(one('date of birth January 10 1990', patientForm)).toEqual([{ action: 'fill_form', formId: 'patient', fields: { dateOfBirth: '1990-01-10' } }]);
    expect(one('change phone number to 0300 1234567', patientForm)).toEqual([{ action: 'fill_form', formId: 'patient', fields: { phone: '0300 1234567' } }]);
    // An answer to the pending question keeps every word, even one that starts like a label.
    const slot = ctx({ ...patientForm, pendingSlot: { formId: 'patient', field: 'addressLine1', label: 'Address' } });
    expect(one('street 5 block b', slot)).toEqual([{ action: 'fill_field', formId: 'patient', field: 'addressLine1', value: 'street 5 block b' }]);
  });

  it('save: "save patient" saves — it never navigates to the Patient page', () => {
    for (const text of ['Save patient', 'Submit patient', 'Save this patient', 'Save changes', 'Submit changes']) {
      expect(one(text)).toEqual([{ action: 'submit_form' }]);
      expect(one(text, patientForm)).toEqual([{ action: 'submit_form' }]);
    }
    // "Update patient" saves while the patient form is open, and opens the selected patient otherwise.
    expect(one('Update patient', patientForm)).toEqual([{ action: 'submit_form' }]);
    expect(one('Update patient')).toEqual([{ action: 'update_record', kind: 'patient' }]);
  });

  it('update: finds the patient by name, from any page', () => {
    for (const text of ['Update John Smith', 'Edit John Smith', 'Open John Smith for editing', 'Edit patient John Smith']) {
      expect(one(text)).toEqual([{ action: 'update_record', kind: 'patient', match: 'john smith' }]);
    }
    expect(one("Change John Smith's phone number")).toEqual([{ action: 'update_record', kind: 'patient', match: 'john smith', field: 'phone' }]);
    expect(one("Update John Smith's address")).toEqual([{ action: 'update_record', kind: 'patient', match: 'john smith', field: 'addressLine1' }]);
    expect(one("Change John Smith's date of birth")).toEqual([{ action: 'update_record', kind: 'patient', match: 'john smith', field: 'dateOfBirth' }]);
    const phone = [{ action: 'update_record', kind: 'patient', match: 'john smith', fields: { phone: '03001234567' } }];
    expect(one('Update John Smith, phone number is 03001234567')).toEqual(phone);
    expect(one("Change John Smith's phone number to 03001234567")).toEqual(phone);
    expect(one('Update John Smith. Phone number is 03001234567.')).toEqual(phone);
  });

  it('update / delete: on another module page a bare name stays that module’s record', () => {
    const meds = ctx({ currentPageId: 'medications' });
    expect(one('update the metformin', meds)).toEqual([{ action: 'update_record', kind: 'medication', match: 'metformin' }]);
    expect(one('delete John Smith', meds)[0]).toMatchObject({ kind: 'medication' });
    // …unless the word "patient" or a patient-only field says otherwise.
    expect(one('delete patient John Smith', meds)).toEqual([{ action: 'delete_record', kind: 'patient', match: 'john smith' }]);
    expect(one("change John Smith's phone number to 123 4567", meds)[0]).toMatchObject({ kind: 'patient', match: 'john smith' });
    // Drugs and pronouns are never read as a person's name.
    expect(one('update the metformin')[0].action).toBe('unknown');
    expect(one('delete the metformin')[0].action).toBe('unknown');
  });

  it('delete: stages a deletion by name; the list position works on the patient list', () => {
    for (const text of ['Delete John Smith', 'Remove John Smith', 'Delete patient John Smith']) {
      expect(one(text)).toEqual([{ action: 'delete_record', kind: 'patient', match: 'john smith' }]);
    }
    const list = ctx({ currentPageId: 'patients' });
    expect(one('Delete the second patient')).toEqual([{ action: 'delete_record', kind: 'patient', position: 2 }]);
    expect(one('delete the second one', list)).toEqual([{ action: 'delete_record', kind: 'patient', position: 2 }]);
    expect(one('edit the first one', list)).toEqual([{ action: 'update_record', kind: 'patient', position: 1 }]);
  });

  it('confirm / cancel a deletion — "delete it" only ever confirms a deletion', () => {
    const deleting = ctx({ awaitingConfirmation: true, pendingConfirmationKind: 'delete' });
    for (const text of ['Yes', 'Yes, delete', 'Confirm delete', 'Delete the patient', 'Yes. Delete it.']) expect(one(text, deleting)).toEqual([{ action: 'confirm' }]);
    for (const text of ['No', 'Cancel', "Don't delete", 'No, cancel', 'do not delete']) expect(one(text, deleting)).toEqual([{ action: 'cancel' }]);
    // A form waiting to be saved is not deleted — nor saved — by "yes, delete".
    const saving = ctx({ ...patientForm, awaitingConfirmation: true, pendingConfirmationKind: 'form' });
    expect(one('Yes, delete', saving)[0].action).toBe('respond');
    expect(one('Delete it', saving)[0].action).toBe('respond');
  });

  it('search and select keep working', () => {
    expect(one('Search for John Smith')).toEqual([{ action: 'search_patient', query: 'John Smith' }]);
    expect(one('Find John Smith')).toEqual([{ action: 'search_patient', query: 'John Smith' }]);
    expect(one('Find patient John Smith')).toEqual([{ action: 'search_patient', query: 'John Smith' }]);
    expect(one('Open John Smith')).toEqual([{ action: 'select_patient', name: 'John Smith' }]);
    expect(one('Select John Smith')).toEqual([{ action: 'select_patient', name: 'John Smith' }]);
    expect(one('Select the second patient')).toEqual([{ action: 'select_patient_at', position: 2 }]);
    expect(one('Open the second result')).toEqual([{ action: 'select_patient_at', position: 2 }]);
  });

  it('paragraph: a spoken or pasted description fills every field it mentions', () => {
    const paragraph =
      'Add a new patient. His name is John Smith. He was born on 10th January 1990. He is male and married. His phone number is 0300 1234567 and his email is john.smith@gmail.com. He lives at House 12, Street 5, Gulberg, Lahore. He works as a teacher and speaks Urdu. His blood group is O positive. His emergency contact is his wife Sara Smith, 0301 7654321.';
    expect(one(paragraph)).toEqual([
      {
        action: 'add_record',
        kind: 'patient',
        fields: {
          firstName: 'John', lastName: 'Smith', dateOfBirth: '1990-01-10', gender: 'Male', maritalStatus: 'Married', phone: '0300 1234567', email: 'john.smith@gmail.com',
          addressLine1: 'house 12, street 5, gulberg, lahore', occupation: 'Teacher', language: 'Urdu', bloodGroup: 'O+',
          emergencyContactName: 'Sara Smith', emergencyContactRelation: 'Spouse', emergencyContactPhone: '0301 7654321',
        },
      },
    ]);
    expect(one('Register a new patient with the following details: name Ayesha Khan, date of birth 5 March 1985, female, mobile 0333 5557777, lives in Karachi, insurance with Aetna, policy number AET-55821')[0]).toMatchObject({
      action: 'add_record',
      fields: { firstName: 'Ayesha', lastName: 'Khan', dateOfBirth: '1985-03-05', gender: 'Female', phone: '0333 5557777', city: 'Karachi', insuranceProvider: 'aetna', policyNumber: 'AET-55821' },
    });
    // A description on the Patient page starts a new patient form (nothing is saved).
    expect(one('Omar Farooq, male, 45 years old, phone 0321 4445566, lives at 7 Canal Road', ctx({ currentPageId: 'patients' }))).toEqual([
      { action: 'add_record', kind: 'patient', fields: { firstName: 'Omar', lastName: 'Farooq', gender: 'Male', age: 45, phone: '0321 4445566', addressLine1: '7 canal road' } },
    ]);
  });

  it('paragraph: an update carries only what it mentions; sentences into an open form fill it', () => {
    expect(one('Update John Smith. His new phone number is 0311 9998888 and he now lives at House 99, DHA Phase 5, Lahore.')).toEqual([
      { action: 'update_record', kind: 'patient', match: 'john smith', fields: { phone: '0311 9998888', addressLine1: 'house 99, dha phase 5, lahore' } },
    ]);
    expect(one('He was born on 10th January 1990 and he is male', patientForm)).toEqual([{ action: 'fill_form', formId: 'patient', fields: { dateOfBirth: '1990-01-10', gender: 'Male' } }]);
    // Gender is only ever taken from a word that says it — never from "he" or "she".
    expect(one('He was born on 10th January 1990', patientForm)).toEqual([{ action: 'fill_form', formId: 'patient', fields: { dateOfBirth: '1990-01-10' } }]);
    // A plain answer to the pending question is still that answer.
    const slot = (field: string) => ctx({ ...patientForm, pendingSlot: { formId: 'patient', field, label: field } });
    expect(one('house 12 street 5 gulberg lahore', slot('addressLine1'))).toEqual([{ action: 'fill_field', formId: 'patient', field: 'addressLine1', value: 'house 12 street 5 gulberg lahore' }]);
    expect(one('John Smith', slot('firstName'))).toEqual([{ action: 'fill_field', formId: 'patient', field: 'firstName', value: 'John Smith' }]);
    // A second command in the same breath still runs.
    expect(one('add patient John Smith and open medications')).toEqual([
      { action: 'add_record', kind: 'patient', fields: { firstName: 'John', lastName: 'Smith' } },
      { action: 'navigate', target: 'medications' },
    ]);
  });

  it('voice off only on an explicit phrase', () => {
    for (const text of ['Mic off', 'Stop listening', 'Stop voice control', 'Cancel voice', 'Turn off microphone']) expect(one(text)).toEqual([{ action: 'stop_listening' }]);
  });
});

// ---------------------------------------------------------------------------- executor

/** A patient form: opening it for a patient loads their saved values, like the real dialog. */
function fakePatientForm() {
  let open = false;
  let values: Record<string, FormValue> = {};
  const submit = vi.fn(async () => undefined);
  const controller: FormController = {
    formId: 'patient',
    isOpen: () => open,
    open: () => { open = true; },
    close: () => { open = false; values = {}; },
    getValues: () => values,
    setValues: (v) => { values = { ...values, ...v }; },
    clearField: (f) => { delete values[f]; },
    focusField: vi.fn(),
    validate: async () => [],
    submit,
    summarize: () => Object.entries(values).map(([label, value]) => ({ label, value: String(value) })),
  };
  return { controller, submit, load: (v: Record<string, FormValue>) => { values = { ...v }; open = true; }, get values() { return values; } };
}

const P = (id: string, first: string, last: string, extra: Partial<Patient> = {}): Patient =>
  ({ id, firstName: first, lastName: last, fullName: `${first} ${last}`, mrn: `MRN-${id}`, dateOfBirth: '1980-05-01', gender: 'Male', phone: '555-0100', email: '', primaryProviderName: 'Dr. Reed', ...extra }) as Patient;

const PATIENTS = [P('1', 'John', 'Smith'), P('2', 'John', 'Smith', { dateOfBirth: '1992-03-04' }), P('3', 'Jane', 'Doe', { phone: '555-0199' }), P('4', 'Mary', 'Johnson')];

function setup(state: Partial<ExecutorState> = {}, patients: Patient[] = PATIENTS) {
  const s: ExecutorState = {
    currentPageId: 'dashboard', currentTab: null, currentPatientId: null, currentPatientName: null, openFormId: null,
    pendingConfirmation: null, pendingSlot: null, sidebarCollapsed: false, dashboardSummaryOpen: false, ...state,
  };
  let search = '';
  const form = fakePatientForm();
  const deps: ExecutorDeps = {
    getState: () => s,
    navigate: vi.fn((path: string) => {
      NavigationRegistry.setPathname(path.split('?')[0]);
      if (path.startsWith('/patients')) s.currentPageId = 'patients';
      if (path.startsWith('/dashboard')) s.currentPageId = 'dashboard';
    }),
    back: vi.fn(),
    setCurrentPatient: vi.fn((id) => { s.currentPatientId = id; }),
    setActiveTab: vi.fn(),
    setOpenForm: vi.fn((id) => { s.openFormId = id; }),
    setPendingConfirmation: vi.fn((p) => { s.pendingConfirmation = p; }),
    setPendingSlot: vi.fn((p) => { s.pendingSlot = p; }),
    setPatientSearch: vi.fn((q: string) => { search = q; }),
    toggleSidebar: vi.fn(),
    setDashboardSummary: vi.fn(),
    resolvePatientByName: vi.fn(async (name: string) => patients.filter((p) => p.fullName.toLowerCase() === name.toLowerCase())),
    getPatient: () => patients.find((p) => p.id === s.currentPatientId),
    getRecords: (kind: AIRecordKind) => (kind === 'patient' ? patients : []),
    deleteRecord: vi.fn(async () => undefined),
    speak: vi.fn(),
    describePatient: () => '',
    getPatientSearch: () => search,
    findPatients: (q: string) => patients.filter((p) => [p.fullName, p.mrn].some((v) => v.toLowerCase().includes(q.trim().toLowerCase()))),
  };
  const openEdit = vi.fn((id: string) => {
    const p = patients.find((x) => x.id === id);
    if (!p) return false;
    form.load({ firstName: p.firstName, lastName: p.lastName, dateOfBirth: p.dateOfBirth, gender: p.gender, phone: p.phone });
    return true;
  });
  const openCreate = vi.fn(() => form.load({}));
  const page = { kind: 'patient' as const, openCreate, openEdit, setSearch: vi.fn((q: string) => { search = q; }) };
  const unregister = [RecordRegistry.register(page), FormRegistry.register(form.controller)];
  return { ex: new CommandExecutor(deps), deps, state: s, form, page, cleanup: () => unregister.forEach((u) => u()) };
}

describe('executing patient commands', () => {
  beforeEach(() => {
    FormRegistry.mounted().forEach((c) => c.close());
    NavigationRegistry.setPathname('/dashboard');
  });

  it('update: changes only the fields said, and waits for "save changes"', async () => {
    const { ex, form, page, state, cleanup } = setup();
    const r = await ex.execute({ action: 'update_record', kind: 'patient', match: 'jane doe', fields: { phone: '0300 1234567' } }, 'voice');
    expect(page.openEdit).toHaveBeenCalledWith('3');
    expect(form.values).toMatchObject({ firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1980-05-01', gender: 'Male', phone: '0300 1234567' });
    expect(r.message).toContain('Jane Doe');
    expect(form.submit).not.toHaveBeenCalled();
    expect(state.pendingConfirmation?.kind).toBe('form');

    await ex.execute({ action: 'submit_form' }, 'voice');
    expect(form.submit).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('update: a field named without a value is asked for', async () => {
    const { ex, state, cleanup } = setup();
    const r = await ex.execute({ action: 'update_record', kind: 'patient', match: 'jane doe', field: 'phone' }, 'voice');
    expect(state.pendingSlot).toMatchObject({ formId: 'patient', field: 'phone' });
    expect(r.message).toContain('What is the new phone for Jane Doe?');
    expect(r.message).toContain('555-0199');
    cleanup();
  });

  it('update: two patients with the same name — asks, never guesses, and keeps what was said', async () => {
    const { ex, form, page, state, cleanup } = setup();
    const r = await ex.execute({ action: 'update_record', kind: 'patient', match: 'john smith', fields: { phone: '111 2222' } }, 'voice');
    expect(r.ok).toBe(false);
    expect(page.openEdit).not.toHaveBeenCalled();
    expect(r.message).toMatch(/2 patients match "john smith": 1\. John Smith \(MRN-1, born 1 May 1980\); 2\. John Smith \(MRN-2, born 4 Mar 1992\)/);
    expect(r.message).toContain('edit the second one');
    expect(state.currentPageId).toBe('patients');

    await ex.execute({ action: 'update_record', kind: 'patient', position: 2 }, 'voice');
    expect(page.openEdit).toHaveBeenCalledWith('2');
    expect(form.values.phone).toBe('111 2222');
    expect(form.submit).not.toHaveBeenCalled();
    cleanup();
  });

  it('update: an exact name wins over partial matches; an unknown name changes nothing', async () => {
    const { ex, page, cleanup } = setup({}, [P('1', 'John', 'Smith'), P('5', 'John', 'Smithson')]);
    await ex.execute({ action: 'update_record', kind: 'patient', match: 'john smith' }, 'voice');
    expect(page.openEdit).toHaveBeenCalledWith('1');
    const none = await ex.execute({ action: 'update_record', kind: 'patient', match: 'zed nobody' }, 'voice');
    expect(none.ok).toBe(false);
    expect(none.message).toContain('Nothing was changed');
    // "John" alone is two different people: ask.
    const partial = await ex.execute({ action: 'update_record', kind: 'patient', match: 'john' }, 'voice');
    expect(partial.ok).toBe(false);
    expect(partial.message).toContain('Which one?');
    expect(page.openEdit).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('update: a date that cannot be read leaves the saved date alone', async () => {
    const { ex, form, cleanup } = setup();
    const r = await ex.execute({ action: 'update_record', kind: 'patient', match: 'jane doe', fields: { dateOfBirth: 'sometime last spring-ish' } }, 'voice');
    expect(form.values.dateOfBirth).toBe('1980-05-01');
    expect(r.message).toContain("couldn't understand the date of birth");
    const ok = await ex.execute({ action: 'fill_field', formId: 'patient', field: 'dateOfBirth', value: '10th of January 1990' }, 'voice');
    expect(ok.ok).toBe(true);
    expect(form.values.dateOfBirth).toBe('1990-01-10');
    cleanup();
  });

  it('delete: identifies the patient, asks, and deletes only after "yes"', async () => {
    const { ex, deps, state, cleanup } = setup();
    const r = await ex.execute({ action: 'delete_record', kind: 'patient', match: 'jane doe' }, 'voice');
    expect(r.message).toContain('I found Jane Doe (MRN-3, born 1 May 1980). Do you want me to delete this patient?');
    expect(state.pendingConfirmation).toMatchObject({ kind: 'delete', recordKind: 'patient', recordId: '3' });
    expect(deps.deleteRecord).not.toHaveBeenCalled();

    await ex.execute({ action: 'cancel' }, 'voice');
    expect(state.pendingConfirmation).toBeNull();
    expect(deps.deleteRecord).not.toHaveBeenCalled();

    await ex.execute({ action: 'delete_record', kind: 'patient', match: 'jane doe' }, 'voice');
    await ex.execute({ action: 'confirm' }, 'voice');
    expect(deps.deleteRecord).toHaveBeenCalledWith('patient', '3');
    cleanup();
  });

  it('delete: two patients with the same name — asks which, then "delete the second one" stages that one', async () => {
    const { ex, deps, state, cleanup } = setup();
    const r = await ex.execute({ action: 'delete_record', kind: 'patient', match: 'john smith' }, 'voice');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('delete the second one');
    expect(state.pendingConfirmation).toBeNull();

    await ex.execute({ action: 'delete_record', kind: 'patient', position: 2 }, 'voice');
    expect(state.pendingConfirmation).toMatchObject({ kind: 'delete', recordId: '2' });
    expect(deps.deleteRecord).not.toHaveBeenCalled();
    cleanup();
  });

  it('add: "What first name?" answered with a full name fills both names', async () => {
    const { ex, form, state, cleanup } = setup({ currentPageId: 'patients' });
    const r = await ex.execute({ action: 'add_record', kind: 'patient' }, 'voice');
    expect(r.message).toContain('What first name?');
    await ex.execute({ action: 'fill_field', formId: 'patient', field: state.pendingSlot!.field, value: 'john smith' }, 'voice');
    expect(form.values).toMatchObject({ firstName: 'John', lastName: 'Smith' });
    expect(form.submit).not.toHaveBeenCalled();
    cleanup();
  });
});
