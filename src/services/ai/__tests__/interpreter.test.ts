import { describe, expect, it } from 'vitest';
import {
  interpret,
  parseAppointmentPhrase,
  parseDiagnosisPhrase,
  parseMedicationList,
  parseMedicationPhrase,
  parsePatientPhrase,
  parseRecallPhrase,
  parseTaskPhrase,
  splitClauses,
} from '../ruleBasedInterpreter';
import { splitMedicationNames } from '../drugLexicon';
import { parseCommands, validateCommands, coalesceMedicationCommands, CommandParseError } from '../commandParser';
import { parseDateTime } from '../dateParser';
import { PageRegistry } from '@/registry/pageRegistry';
import { FieldRegistry } from '@/registry/fieldRegistry';
import type { AIContext } from '@/types/ai';
import dayjs from 'dayjs';

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

describe('PageRegistry.resolve', () => {
  it('resolves aliases, titles, ids and page numbers', () => {
    expect(PageRegistry.resolve('medications')?.id).toBe('medications');
    expect(PageRegistry.resolve('problem list')?.id).toBe('diagnoses');
    expect(PageRegistry.resolve('page 9')?.id).toBe('summary');
    expect(PageRegistry.resolve(4)?.id).toBe('medications');
    expect(PageRegistry.resolve(3)?.id).toBe('inbox');
    expect(PageRegistry.resolve('flux capacitor')).toBeUndefined();
  });
  it('matches concrete paths back to pages', () => {
    expect(PageRegistry.matchPath('/medications')?.id).toBe('medications');
    expect(PageRegistry.matchPath('/summary/diagnosis')?.id).toBe('summary-diagnosis');
    expect(PageRegistry.matchPath('/patients')?.id).toBe('patients');
  });
  it('exposes one sidebar entry per module, in navigation order', () => {
    expect(PageRegistry.sidebarPages().map((p) => p.module)).toEqual([
      'dashboard', 'patient', 'inbox', 'medication', 'diagnosis', 'task', 'recall', 'appointment', 'summary',
    ]);
  });
});

describe('navigation commands', () => {
  it.each(['go to medications', 'open medications', 'take me to medications', 'navigate to medications', 'show medications'])('"%s" -> navigate medications', (t) => {
    expect(interpret(t, ctx())).toEqual([{ action: 'navigate', target: 'medications' }]);
  });
  it('supports page numbers', () => {
    expect(interpret('go to page 5', ctx())).toEqual([{ action: 'navigate', target: 5 }]);
    expect(interpret('open page 9', ctx())).toEqual([{ action: 'navigate', target: 9 }]);
  });
  it('handles go back / home', () => {
    expect(interpret('go back', ctx())).toEqual([{ action: 'go_back' }]);
    expect(interpret('go home', ctx())).toEqual([{ action: 'go_home' }]);
  });
  it('switches Summary tabs', () => {
    expect(interpret('show me the diagnosis tab', ctx())).toEqual([{ action: 'open_tab', tab: 'diagnosis' }]);
    expect(interpret('open the ai summary tab', ctx())).toEqual([{ action: 'open_tab', tab: 'ai summary' }]);
  });
  it('chains navigation and a tab switch', () => {
    expect(interpret('open summary and show me the task tab', ctx())).toEqual([
      { action: 'navigate', target: 'summary' },
      { action: 'open_tab', tab: 'task' },
    ]);
  });
});

describe('patient context commands', () => {
  it('selects a patient', () => {
    expect(interpret('select patient ahmed khan', ctx())).toEqual([{ action: 'select_patient', name: 'Ahmed Khan' }]);
    expect(interpret('switch to patient john smith', ctx())).toEqual([{ action: 'select_patient', name: 'John Smith' }]);
    expect(interpret('change patient to ahmed khan', ctx())).toEqual([{ action: 'select_patient', name: 'Ahmed Khan' }]);
  });
  it('searches for a patient', () => {
    expect(interpret('search patient ahmed khan', ctx())).toEqual([{ action: 'search_patient', query: 'Ahmed Khan' }]);
  });
  it('clears the context', () => {
    expect(interpret('clear the selected patient', ctx())).toEqual([{ action: 'clear_patient' }]);
  });
});

describe('record commands', () => {
  it('adds each record kind', () => {
    expect(interpret('add medication', ctx())).toEqual([{ action: 'add_record', kind: 'medication' }]);
    expect(interpret('add task', ctx())).toEqual([{ action: 'add_record', kind: 'task' }]);
    expect(interpret('add recall', ctx())).toEqual([{ action: 'add_record', kind: 'recall' }]);
    expect(interpret('add appointment', ctx())).toEqual([{ action: 'add_record', kind: 'appointment' }]);
    expect(interpret('add diagnosis', ctx())).toEqual([{ action: 'add_record', kind: 'diagnosis' }]);
  });
  it('adds a diagnosis with details', () => {
    expect(interpret('add diagnosis hypertension', ctx())).toEqual([{ action: 'add_record', kind: 'diagnosis', fields: { description: 'Hypertension' } }]);
  });
  it('adds a task with a due date', () => {
    const cmd = interpret('add task blood pressure monitoring due in 2 weeks', ctx())[0] as { action: string; kind: string; fields: Record<string, string> };
    expect(cmd.action).toBe('add_record');
    expect(cmd.kind).toBe('task');
    expect(cmd.fields.title).toContain('Blood Pressure Monitoring');
    expect(cmd.fields.dueDate).toBe(dayjs().add(2, 'week').format('YYYY-MM-DD'));
  });
  it('adds a recall with a relative due date', () => {
    const cmd = interpret('set recall for blood pressure review in 3 months', ctx())[0] as { action: string; kind: string; fields: Record<string, string> };
    expect(cmd).toMatchObject({ action: 'add_record', kind: 'recall' });
    expect(cmd.fields.reason).toBe('Blood Pressure Review');
    expect(cmd.fields.dueDate).toBe(dayjs().add(3, 'month').format('YYYY-MM-DD'));
  });
  it('deletes by description, never silently', () => {
    expect(interpret('delete the metformin', ctx({ currentPageId: 'medications' }))).toEqual([{ action: 'delete_record', kind: 'medication', match: 'metformin' }]);
    expect(interpret('delete medication metformin', ctx())).toEqual([{ action: 'delete_record', kind: 'medication', match: 'metformin' }]);
    expect(interpret('remove the blood pressure task', ctx())).toEqual([{ action: 'delete_record', kind: 'task', match: 'blood pressure' }]);
  });
  it('updates a record by status', () => {
    expect(interpret('mark the blood pressure task as completed', ctx())).toEqual([
      { action: 'update_record', kind: 'task', match: 'blood pressure', fields: { status: 'Completed' } },
    ]);
    expect(interpret('stop the metformin', ctx({ currentPageId: 'medications' }))).toEqual([
      { action: 'update_record', kind: 'medication', match: 'metformin', fields: { status: 'Discontinued' } },
    ]);
  });
  it('opens a record for editing', () => {
    expect(interpret('update medication metformin', ctx())).toEqual([{ action: 'update_record', kind: 'medication', match: 'metformin' }]);
  });
  it('reads a list back and summarises the patient', () => {
    expect(interpret('read the medication list', ctx())).toEqual([{ action: 'read_records', kind: 'medication' }]);
    expect(interpret('list the tasks', ctx())).toEqual([{ action: 'read_records', kind: 'task' }]);
    expect(interpret('give me a summary of this patient', ctx())).toEqual([{ action: 'summarize_patient' }]);
    expect(interpret('summarize patient', ctx())).toEqual([{ action: 'summarize_patient' }]);
  });
  it('searches within a module', () => {
    expect(interpret('search medications for metformin', ctx())).toEqual([{ action: 'search_records', kind: 'medication', query: 'metformin' }]);
  });
});

describe('multi-step utterances', () => {
  it('splits "go to medications and add panadol"', () => {
    expect(splitClauses('go to medications and add panadol')).toEqual(['go to medications', 'add panadol']);
  });
  it('does not split medication names containing "and"', () => {
    expect(splitClauses('add amoxicillin and clavulanate 500 mg')).toEqual(['add amoxicillin and clavulanate 500 mg']);
  });
});

describe('medication parsing', () => {
  it('extracts structured medication fields and never invents missing ones', () => {
    const f = parseMedicationPhrase('amoxicillin 500 milligrams orally twice daily for seven days');
    expect(f).toEqual({ medicationName: 'Amoxicillin', dosage: '500 mg', route: 'Oral', frequency: 'Twice daily', duration: '7 days' });
    expect(parseMedicationPhrase('lisinopril')).toEqual({ medicationName: 'Lisinopril' });
  });
  it('produces an add_record command for medication', () => {
    const cmds = interpret('add medication amoxicillin 500 mg twice daily for 7 days', ctx());
    expect(cmds[0]).toMatchObject({ action: 'add_record', kind: 'medication' });
    expect((cmds[0] as { fields: Record<string, string> }).fields.frequency).toBe('Twice daily');
  });
  it('normalizes frequency & route synonyms via FieldRegistry', () => {
    const freq = FieldRegistry.resolveField('medication', 'how often')!;
    expect(FieldRegistry.normalizeValue(freq, 'bid')).toBe('Twice daily');
    expect(FieldRegistry.normalizeValue(freq, 'three times a day')).toBe('Three times daily');
    const route = FieldRegistry.resolveField('medication', 'route')!;
    expect(FieldRegistry.normalizeValue(route, 'by mouth')).toBe('Oral');
    const dose = FieldRegistry.resolveField('medication', 'dose')!;
    expect(FieldRegistry.normalizeValue(dose, '500 milligrams')).toBe('500 mg');
  });
  it('reports missing required fields', () => {
    expect(FieldRegistry.missingRequired('medication', { medicationName: 'Amoxicillin' }).map((f) => f.name)).toEqual(['dosage', 'frequency']);
  });
});

describe('diagnosis, task, appointment and patient parsing', () => {
  it('parses a diagnosis phrase', () => {
    expect(parseDiagnosisPhrase('hypertension')).toMatchObject({ description: 'Hypertension' });
    expect(parseDiagnosisPhrase('type 2 diabetes, chronic')).toMatchObject({ description: 'Type 2 Diabetes', status: 'Chronic' });
    expect(parseDiagnosisPhrase('asthma I10 mild')).toMatchObject({ icd10: 'I10', severity: 'Mild' });
  });
  it('parses a task phrase', () => {
    const f = parseTaskPhrase('blood pressure monitoring due next friday high priority');
    expect(f.title).toContain('Blood Pressure Monitoring');
    expect(f.priority).toBe('High');
    expect(f.category).toBe('Monitoring');
  });
  it('parses date/time phrases', () => {
    const now = dayjs('2026-09-19T10:00:00');
    expect(parseDateTime('tomorrow at 3 pm', now)).toMatchObject({ date: '2026-09-20', time: '15:00' });
    expect(parseDateTime('on september 25 at 9:30 am', now)).toMatchObject({ date: '2026-09-25', time: '09:30' });
    expect(parseDateTime('next monday at noon', now)).toMatchObject({ date: '2026-09-21', time: '12:00' });
  });
  it('parses an appointment phrase', () => {
    const f = parseAppointmentPhrase('with dr sarah tomorrow at 3 pm for chest pain');
    expect(f.providerName).toBe('Sarah');
    expect(f.startTime).toBe('15:00');
    expect(f.reason).toBe('Chest Pain');
  });
  it('parses a patient registration phrase', () => {
    const f = parsePatientPhrase('ahmed khan, male, 32 years old');
    expect(f).toMatchObject({ firstName: 'Ahmed', lastName: 'Khan', gender: 'Male', age: 32 });
    expect(interpret('add patient ahmed khan, male, 32 years old', ctx())[0]).toMatchObject({ action: 'add_record', kind: 'patient' });
  });
  it('parses a recall with a relative due date', () => {
    const f = parseRecallPhrase('for blood pressure review in 3 months');
    expect(f.reason).toBe('Blood Pressure Review');
    expect(f.type).toBe('Follow-up');
    expect(f.dueDate).toBe(dayjs().add(3, 'month').format('YYYY-MM-DD'));
    expect(parseRecallPhrase('flu vaccine after 6 weeks')).toMatchObject({ type: 'Vaccination', dueDate: dayjs().add(6, 'week').format('YYYY-MM-DD') });
  });
});

describe('confirmation boundary', () => {
  it.each(['save it', 'yes', 'submit', 'confirm', 'yes, save it', 'go ahead', 'delete it'])('"%s" -> confirm', (t) => {
    expect(interpret(t, ctx({ awaitingConfirmation: true }))).toEqual([{ action: 'confirm' }]);
  });
  it.each(['cancel', 'no', 'never mind', "don't save", "don't delete", 'discard'])('"%s" -> cancel', (t) => {
    expect(interpret(t, ctx())).toEqual([{ action: 'cancel' }]);
  });
  it('a bare value answers a pending slot question (original casing preserved)', () => {
    const c = ctx({ pendingSlot: { formId: 'medication', field: 'dosage', label: 'Dosage' }, openFormId: 'medication' });
    expect(interpret('500 mg', c)).toEqual([{ action: 'fill_field', formId: 'medication', field: 'dosage', value: '500 mg' }]);
    const p = ctx({ pendingSlot: { formId: 'task', field: 'title', label: 'Task' }, openFormId: 'task' });
    expect(interpret('Chase the lab results', p)).toEqual([{ action: 'fill_field', formId: 'task', field: 'title', value: 'Chase the lab results' }]);
  });
  it('a full medication phrase answering "what medication?" fills every parsed field', () => {
    const c = ctx({ pendingSlot: { formId: 'medication', field: 'medicationName', label: 'Medication Name' }, openFormId: 'medication' });
    expect(interpret('Amoxicillin 500 mg orally twice daily for seven days', c)).toEqual([
      { action: 'fill_form', formId: 'medication', fields: { medicationName: 'Amoxicillin', dosage: '500 mg', route: 'Oral', frequency: 'Twice daily', duration: '7 days' } },
    ]);
  });
  it('field-level edits target the open form', () => {
    const c = ctx({ openFormId: 'medication' });
    expect(interpret('set dosage to 250 mg', c)).toEqual([{ action: 'fill_field', formId: 'medication', field: 'dosage', value: '250 mg' }]);
    expect(interpret('check as needed', c)).toEqual([{ action: 'set_checkbox', formId: 'medication', field: 'isPRN', checked: true }]);
    expect(interpret('clear the notes', c)).toEqual([{ action: 'clear_field', formId: 'medication', field: 'notes' }]);
  });
});

describe('command parser / schema validation', () => {
  it('parses JSON from noisy model output', () => {
    const raw = '<think>hmm</think>Sure! ```json\n[{"action":"navigate","target":"medications"}]\n``` done';
    expect(parseCommands(raw)).toEqual([{ action: 'navigate', target: 'medications' }]);
  });
  it('accepts {"commands":[...]} envelopes and single objects', () => {
    expect(parseCommands('{"commands":[{"action":"go_back"}]}')).toEqual([{ action: 'go_back' }]);
    expect(parseCommands('{"action":"confirm"}')).toEqual([{ action: 'confirm' }]);
  });
  it('accepts the record commands the model is asked for', () => {
    expect(parseCommands('{"commands":[{"action":"delete_record","kind":"medication","match":"metformin"}]}')).toEqual([
      { action: 'delete_record', kind: 'medication', match: 'metformin' },
    ]);
    expect(parseCommands('{"action":"read_records","kind":"task"}')).toEqual([{ action: 'read_records', kind: 'task' }]);
  });
  it('folds one medication command per drug into a single tabbed command', () => {
    const merged = coalesceMedicationCommands([
      { action: 'navigate', target: 3 },
      { action: 'add_record', kind: 'medication', fields: { medicationName: 'Panadol' } },
      { action: 'add_record', kind: 'medication', fields: { medicationName: 'Paracetamol' } },
      { action: 'add_record', kind: 'medication', fields: { medicationName: 'Gabapentin', dosage: '300 mg' } },
      { action: 'submit_form' },
    ]);
    expect(merged).toHaveLength(3);
    expect(merged[1]).toEqual({
      action: 'add_record',
      kind: 'medication',
      fields: { medicationName: 'Panadol' },
      records: [{ medicationName: 'Panadol' }, { medicationName: 'Paracetamol' }, { medicationName: 'Gabapentin', dosage: '300 mg' }],
    });
  });
  it('rejects invalid commands', () => {
    expect(() => parseCommands('[{"action":"delete_database"}]')).toThrow(CommandParseError);
    expect(() => parseCommands('not json at all')).toThrow(CommandParseError);
    expect(() => validateCommands([{ action: 'fill_form', fields: 'oops' }])).toThrow(CommandParseError);
    expect(() => validateCommands([{ action: 'delete_record', kind: 'everything' }])).toThrow(CommandParseError);
  });
});

describe('several medications in one utterance', () => {
  it('splits a spoken run of drug names using the lexicon', () => {
    expect(splitMedicationNames('panadol paracetamol metformin')).toEqual(['panadol', 'paracetamol', 'metformin']);
    expect(splitMedicationNames('panadol extra and brufen syrup')).toEqual(['panadol extra', 'brufen syrup']);
    expect(splitMedicationNames('vitamin d')).toEqual(['vitamin d']);
    expect(splitMedicationNames('amoxicillin and clavulanate')).toEqual(['amoxicillin and clavulanate']);
    expect(splitMedicationNames('zorbafex ultra')).toEqual(['zorbafex ultra']);
  });
  it('shares frequency/duration spoken once across every medication, never the dosage', () => {
    const shared = { frequency: 'Twice daily', duration: '10 days' };
    expect(parseMedicationList('panadol paracetamol metformin twice daily for 10 days')).toEqual([
      { medicationName: 'Panadol', ...shared },
      { medicationName: 'Paracetamol', ...shared },
      { medicationName: 'Metformin', ...shared },
    ]);
    expect(parseMedicationList('panadol 500 mg and metformin 850 mg twice daily for 10 days')).toEqual([
      { medicationName: 'Panadol', dosage: '500 mg', ...shared },
      { medicationName: 'Metformin', dosage: '850 mg', ...shared },
    ]);
  });
  it('keeps independent schedules independent', () => {
    expect(parseMedicationList('panadol 500 mg twice daily and metformin 850 mg once daily')).toEqual([
      { medicationName: 'Panadol', dosage: '500 mg', frequency: 'Twice daily' },
      { medicationName: 'Metformin', dosage: '850 mg', frequency: 'Once daily' },
    ]);
  });
  it('keeps combination products as one medication', () => {
    expect(parseMedicationList('amoxicillin and clavulanate 500 mg twice daily')).toEqual([{ medicationName: 'Amoxicillin/Clavulanate', dosage: '500 mg', frequency: 'Twice daily' }]);
  });
  it('produces one add_record command carrying every medication', () => {
    const cmds = interpret('add medication panadol paracetamol metformin twice daily for 10 days', ctx());
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ action: 'add_record', kind: 'medication', fields: { medicationName: 'Panadol' } });
    const meds = (cmds[0] as { records: Array<Record<string, string>> }).records;
    expect(meds.map((m) => m.medicationName)).toEqual(['Panadol', 'Paracetamol', 'Metformin']);
    expect(meds.every((m) => m.frequency === 'Twice daily' && m.duration === '10 days')).toBe(true);
  });
  it('fills several tabs while the medication form is open', () => {
    const open = ctx({ openFormId: 'medication' });
    expect((interpret('brufen and panadol three times daily', open)[0] as { entries?: unknown[] }).entries).toHaveLength(2);
    expect(interpret('add another', open)).toEqual([{ action: 'add_entry', formId: 'medication' }]);
  });
  it('works after Roman-Urdu translation', () => {
    const cmds = interpret('panadol aur metformin din mein do bar das din ke liye add karo', ctx());
    expect(cmds[0]).toMatchObject({ action: 'add_record', kind: 'medication' });
    const meds = (cmds[0] as { records: Array<Record<string, string>> }).records;
    expect(meds.map((m) => m.medicationName)).toEqual(['Panadol', 'Metformin']);
    expect(meds[0]).toMatchObject({ frequency: 'Twice daily', duration: '10 days' });
  });
});
