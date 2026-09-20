import { describe, expect, it } from 'vitest';
import { interpret, parseMedicationPhrase, parseAppointmentPhrase, parsePatientPhrase, splitClauses } from '../ruleBasedInterpreter';
import { parseCommands, validateCommands, CommandParseError } from '../commandParser';
import { parseDateTime } from '../dateParser';
import { PageRegistry } from '@/registry/pageRegistry';
import { FieldRegistry } from '@/registry/fieldRegistry';
import type { AIContext } from '@/types/ai';
import dayjs from 'dayjs';

const ctx = (over: Partial<AIContext> = {}): AIContext => ({
  currentPageId: 'dashboard', currentPageTitle: 'Executive Dashboard', currentPageNumber: 1, currentPatientId: null, currentPatientName: null, currentProviderId: null,
  openFormId: null, openFormFields: [], pendingSlot: null, awaitingConfirmation: false, recentTranscripts: [], ...over,
});

describe('PageRegistry.resolve', () => {
  it('resolves aliases, titles, ids and page numbers', () => {
    expect(PageRegistry.resolve('patient search')?.id).toBe('patient-search');
    expect(PageRegistry.resolve('the calendar')?.id).toBe('appointment-calendar');
    expect(PageRegistry.resolve('page 30')?.id).toBe('prescriptions');
    expect(PageRegistry.resolve(29)?.id).toBe('medications');
    expect(PageRegistry.resolve('user management')?.id).toBe('user-dashboard');
    expect(PageRegistry.resolve('flux capacitor')).toBeUndefined();
  });
  it('matches concrete paths back to pages', () => {
    expect(PageRegistry.matchPath('/patients/pat-1/allergies')?.id).toBe('patient-allergies');
    expect(PageRegistry.matchPath('/patients/search')?.id).toBe('patient-search');
    expect(PageRegistry.matchPath('/clinical/medications')?.id).toBe('medications');
  });
});

describe('navigation commands', () => {
  it.each(['go to patient search', 'open patient search', 'take me to patient search', 'navigate to patient search', 'show patient search', 'i want patient search'])('"%s" -> navigate patient-search', (t) => {
    expect(interpret(t, ctx())).toEqual([{ action: 'navigate', target: 'patient-search' }]);
  });
  it('supports page numbers', () => {
    expect(interpret('go to page 20', ctx())).toEqual([{ action: 'navigate', target: 20 }]);
    expect(interpret('open page 30', ctx())).toEqual([{ action: 'navigate', target: 30 }]);
  });
  it('handles go back / home', () => {
    expect(interpret('go back', ctx())).toEqual([{ action: 'go_back' }]);
    expect(interpret('go home', ctx())).toEqual([{ action: 'go_home' }]);
  });
  it('prefers patient sections when a patient is in context', () => {
    const c = ctx({ currentPatientId: 'pat-1', currentPatientName: 'John Smith', currentPageId: 'patient-profile' });
    expect(interpret('open medications', c)).toEqual([{ action: 'navigate', target: 'patient-medications' }]);
    expect(interpret('open allergies', c)).toEqual([{ action: 'navigate', target: 'patient-allergies' }]);
  });
  it('returns unknown for unmapped pages', () => {
    expect(interpret('go to the flux capacitor', ctx())[0].action).toBe('unknown');
    // "open <words>" with no matching page is treated as a patient lookup (executor reports "no patient found").
    expect(interpret('open the flux capacitor', ctx())[0].action).toBe('open_patient');
  });
});

describe('multi-step utterances', () => {
  it('splits "go to page 30 and add medication"', () => {
    expect(splitClauses('go to page 30 and add medication')).toEqual(['go to page 30', 'add medication']);
    expect(interpret('go to page 30 and add medication', ctx())).toEqual([{ action: 'navigate', target: 30 }, { action: 'add_medication' }]);
  });
  it('does not split medication names containing "and"', () => {
    expect(splitClauses('add amoxicillin and clavulanate 500 mg')).toEqual(['add amoxicillin and clavulanate 500 mg']);
  });
});

describe('patient commands', () => {
  it('search patient', () => {
    expect(interpret('search patient ahmed khan', ctx())).toEqual([{ action: 'search_patient', query: 'Ahmed Khan' }]);
    expect(interpret('find ahmed', ctx())).toEqual([{ action: 'search_patient', query: 'Ahmed' }]);
  });
  it('open patient by name', () => {
    expect(interpret('open john smith', ctx())).toEqual([{ action: 'open_patient', name: 'John Smith' }]);
    expect(interpret('open patient john smith', ctx())).toEqual([{ action: 'open_patient', name: 'John Smith' }]);
    expect(interpret("open john smith's medications", ctx())).toEqual([{ action: 'open_patient', name: 'John Smith', section: 'medications' }]);
  });
});

describe('medication parsing', () => {
  it('extracts structured medication fields and never invents missing ones', () => {
    const f = parseMedicationPhrase('amoxicillin 500 milligrams orally twice daily for seven days');
    expect(f).toEqual({ medicationName: 'Amoxicillin', dosage: '500 mg', route: 'Oral', frequency: 'Twice daily', duration: '7 days' });
    expect(parseMedicationPhrase('lisinopril')).toEqual({ medicationName: 'Lisinopril' });
  });
  it('produces an add_medication command', () => {
    const cmds = interpret('add amoxicillin 500 mg twice daily for 7 days', ctx());
    expect(cmds[0].action).toBe('add_medication');
    expect((cmds[0] as { fields: Record<string, string> }).fields.frequency).toBe('Twice daily');
    expect(interpret('add medication', ctx())).toEqual([{ action: 'add_medication' }]);
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

describe('appointment & patient parsing', () => {
  it('parses date/time phrases', () => {
    const now = dayjs('2026-09-19T10:00:00');
    expect(parseDateTime('tomorrow at 3 pm', now)).toMatchObject({ date: '2026-09-20', time: '15:00' });
    expect(parseDateTime('on september 25 at 9:30 am', now)).toMatchObject({ date: '2026-09-25', time: '09:30' });
    expect(parseDateTime('next monday at noon', now)).toMatchObject({ date: '2026-09-21', time: '12:00' });
  });
  it('parses appointment phrase', () => {
    const f = parseAppointmentPhrase('for ahmed with dr sarah tomorrow at 3 pm for chest pain');
    expect(f.patientName).toBe('Ahmed');
    expect(f.providerName).toBe('Sarah');
    expect(f.startTime).toBe('15:00');
    expect(f.reason).toBe('Chest Pain');
  });
  it('parses patient registration phrase', () => {
    const f = parsePatientPhrase('ahmed khan, male, 32 years old');
    expect(f).toMatchObject({ firstName: 'Ahmed', lastName: 'Khan', gender: 'Male', age: 32 });
    expect(interpret('add patient ahmed khan, male, 32 years old', ctx())[0].action).toBe('register_patient');
  });
});

describe('confirmation boundary', () => {
  it.each(['save it', 'yes', 'submit', 'confirm', 'yes, save it', 'go ahead'])('"%s" -> confirm', (t) => {
    expect(interpret(t, ctx({ awaitingConfirmation: true }))).toEqual([{ action: 'confirm' }]);
  });
  it.each(['cancel', 'no', 'never mind', "don't save", 'discard'])('"%s" -> cancel', (t) => {
    expect(interpret(t, ctx())).toEqual([{ action: 'cancel' }]);
  });
  it('a bare value answers a pending slot question (original casing preserved)', () => {
    const c = ctx({ pendingSlot: { formId: 'medication', field: 'dosage', label: 'Dosage' }, openFormId: 'medication' });
    expect(interpret('500 mg', c)).toEqual([{ action: 'fill_field', formId: 'medication', field: 'dosage', value: '500 mg' }]);
    const p = ctx({ pendingSlot: { formId: 'prescription', field: 'patientName', label: 'Patient' }, openFormId: 'prescription' });
    expect(interpret('John Smith', p)).toEqual([{ action: 'fill_field', formId: 'prescription', field: 'patientName', value: 'John Smith' }]);
  });
  it('a full medication phrase answering "what medication?" fills every parsed field', () => {
    const c = ctx({ pendingSlot: { formId: 'prescription', field: 'medicationName', label: 'Medication Name' }, openFormId: 'prescription' });
    expect(interpret('Amoxicillin 500 mg orally twice daily for seven days', c)).toEqual([{ action: 'fill_form', formId: 'prescription', fields: { medicationName: 'Amoxicillin', dosage: '500 mg', route: 'Oral', frequency: 'Twice daily', duration: '7 days' } }]);
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
    const raw = '<think>hmm</think>Sure! ```json\n[{"action":"navigate","target":"patient-search"}]\n``` done';
    expect(parseCommands(raw)).toEqual([{ action: 'navigate', target: 'patient-search' }]);
  });
  it('accepts {"commands":[...]} envelopes and single objects', () => {
    expect(parseCommands('{"commands":[{"action":"go_back"}]}')).toEqual([{ action: 'go_back' }]);
    expect(parseCommands('{"action":"confirm"}')).toEqual([{ action: 'confirm' }]);
  });
  it('rejects invalid commands', () => {
    expect(() => parseCommands('[{"action":"delete_database"}]')).toThrow(CommandParseError);
    expect(() => parseCommands('not json at all')).toThrow(CommandParseError);
    expect(() => validateCommands([{ action: 'fill_form', fields: 'oops' }])).toThrow(CommandParseError);
  });
});
