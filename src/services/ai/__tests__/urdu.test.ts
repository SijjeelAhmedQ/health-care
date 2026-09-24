import { describe, expect, it } from 'vitest';
import { translateUrdu } from '../urdu/translator';
import { interpret } from '../ruleBasedInterpreter';
import type { AIContext } from '@/types/ai';
import dayjs from 'dayjs';

const ctx = (over: Partial<AIContext> = {}): AIContext => ({
  currentPageId: 'dashboard', currentPageTitle: 'Dashboard', currentPageNumber: 1, currentPatientId: 'pat-1', currentPatientName: 'John Smith', currentTab: null,
  openFormId: null, openFormFields: [], pendingSlot: null, awaitingConfirmation: false, recentTranscripts: [], ...over,
});
const t = (s: string) => translateUrdu(s).text;

describe('translateUrdu — detection', () => {
  it('passes plain English through untouched', () => {
    for (const s of ['Go to page 30 and add medication', 'open john smith', 'set dosage to 250 mg', 'show me the main dashboard', 'let me see patient search', 'do it', 'no', 'save it']) {
      expect(translateUrdu(s)).toEqual({ text: s, detected: false, language: 'en' });
    }
  });
  it('detects Roman Urdu and Urdu script', () => {
    expect(translateUrdu('page tees par jao').language).toBe('roman-ur');
    expect(translateUrdu('پیج تیس پر جاؤ').language).toBe('ur');
  });
});

describe('translateUrdu — the requested example', () => {
  it('page number tees par jao or ek dawai add karo …', () => {
    expect(t('page number tees par jao or ek dawai add karo amoxcillin 500 mg twice daily paanch dino ke liay')).toBe('go to page 30 and add medication amoxicillin 500 mg twice daily for 5 days');
    expect(interpret('page number tees par jao or ek dawai add karo amoxcillin 500 mg twice daily paanch dino ke liay', ctx())).toEqual([
      { action: 'navigate', target: 30 },
      { action: 'add_record', kind: 'medication', fields: { medicationName: 'Amoxicillin', dosage: '500 mg', frequency: 'Twice daily', duration: '5 days' } },
    ]);
  });
  it('same command in Urdu script', () => {
    expect(interpret('پیج نمبر تیس پر جاؤ اور ایک دوائی ایڈ کرو اموکسیسلن 500 ملی گرام دن میں دو بار پانچ دن کے لیے', ctx())).toEqual([
      { action: 'navigate', target: 30 },
      { action: 'add_record', kind: 'medication', fields: { medicationName: 'Amoxicillin', dosage: '500 mg', frequency: 'Twice daily', duration: '5 days' } },
    ]);
  });
  it('fully Urdu frequency / duration / route / food', () => {
    expect(t('amoxicillin 500 mg muun se din mein do bar saat din ke liye khanay ke baad')).toBe('amoxicillin 500 mg orally twice daily for 7 days after food');
    expect(interpret('dawai add karo amoxicillin 500 mg muun se din mein do bar saat din ke liye khanay ke baad', ctx())).toEqual([
      { action: 'add_record', kind: 'medication', fields: { medicationName: 'Amoxicillin', dosage: '500 mg', route: 'Oral', frequency: 'Twice daily', duration: '7 days', instructions: 'After Food.' } },
    ]);
  });
});

describe('translateUrdu — navigation', () => {
  it.each([
    ['page tees par jao', 'go to page 30'],
    ['page number chalees pe chalo', 'go to page 40'],
    ['tees number page kholo', 'go to page 30'],
    ['page 12 par jana hai', 'go to page 12'],
    ['patient search par jao', 'go to patient search'],
    ['mareez ki talash par jao', 'go to patient search'],
    ['appointment calendar kholo', 'open appointment calendar'],
    ['dashboard dikhao', 'show dashboard'],
    ['user management par le jao', 'go to user management'],
    ['wapas jao', 'go back'],
    ['peeche jao', 'go back'],
    ['home jao', 'go home'],
    ['neeche jao', 'scroll down'],
    ['upar scroll karo', 'scroll up'],
    ['sab se upar jao', 'scroll top'],
    ['allergies tab kholo', 'open allergies tab'],
    ['sidebar band karo', 'toggle sidebar'],
    ['madad karo', 'help'],
  ])('%s → %s', (input, expected) => {
    expect(t(input)).toBe(expected);
  });
  it('produces navigate commands', () => {
    expect(interpret('page tees par jao', ctx())).toEqual([{ action: 'navigate', target: 30 }]);
    expect(interpret('صفحہ نمبر بیس پر جائیں', ctx())).toEqual([{ action: 'navigate', target: 20 }]);
    expect(interpret('mareez ki talash par jao', ctx())).toEqual([{ action: 'navigate', target: 'patients' }]);
    expect(interpret('واپس جاؤ', ctx())).toEqual([{ action: 'go_back' }]);
    expect(interpret('medications kholo', ctx({ currentPatientId: 'pat-1', currentPageId: 'dashboard' }))).toEqual([{ action: 'navigate', target: 'medications' }]);
  });
});

describe('translateUrdu — patients', () => {
  it('search, open, sections', () => {
    expect(interpret('ahmed khan ko dhoondo', ctx())).toEqual([{ action: 'search_patient', query: 'Ahmed Khan' }]);
    expect(interpret('mareez ahmed khan search karo', ctx())).toEqual([{ action: 'search_patient', query: 'Ahmed Khan' }]);
    expect(interpret('mareez john smith kholo', ctx())).toEqual([{ action: 'select_patient', name: 'John Smith' }]);
    expect(interpret('john smith kholo', ctx())).toEqual([{ action: 'select_patient', name: 'John Smith' }]);
    expect(interpret('john smith ki dawaiyan dikhao', ctx())).toEqual([{ action: 'select_patient', name: 'John Smith', section: 'medications' }]);
    expect(interpret('مریض جان سمتھ کھولو', ctx())).toEqual([{ action: 'select_patient', name: 'John Smith' }]);
    expect(interpret('john smith ki file kholo', ctx())).toEqual([{ action: 'select_patient', name: 'John Smith' }]);
  });
  it('registration with demographics', () => {
    const cmds = interpret('naya mareez add karo bilal hussain mard 32 saal', ctx());
    expect(cmds[0]).toMatchObject({ action: 'add_record', kind: 'patient' });
    expect((cmds[0] as { fields: Record<string, unknown> }).fields).toMatchObject({ firstName: 'Bilal', lastName: 'Hussain', gender: 'Male', age: 32 });
    expect(interpret('naya mareez add karo', ctx())).toEqual([{ action: 'add_record', kind: 'patient' }]);
    expect(interpret('bilal hussain naam ka naya mareez register karo', ctx())[0]).toMatchObject({ action: 'add_record', kind: 'patient', fields: { firstName: 'Bilal', lastName: 'Hussain' } });
  });
});

describe('translateUrdu — appointments', () => {
  it('builds an appointment with provider, date, time and reason for the selected patient', () => {
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
    expect(t('ahmed khan ke liye dr sarah ke saath kal shaam 3 baje appointment banao seene mein dard ke liye')).toBe('create appointment for ahmed khan with dr sarah tomorrow at 3 pm for chest pain');
    expect(interpret('ahmed khan ke liye dr sarah ke saath kal shaam 3 baje appointment banao seene mein dard ke liye', ctx())).toEqual([
      // The patient is the selected one, so a spoken name is not copied onto the appointment.
      { action: 'add_record', kind: 'appointment', fields: { providerName: 'Sarah', date: tomorrow, startTime: '15:00', reason: 'Chest Pain' } },
    ]);
    expect(interpret('naya appointment banao', ctx())).toEqual([{ action: 'add_record', kind: 'appointment' }]);
    expect(interpret('اپائنٹمنٹ بناؤ', ctx())).toEqual([{ action: 'add_record', kind: 'appointment' }]);
  });
  it('morning times and weekdays', () => {
    expect(t('subah 9 baje')).toBe('at 9 am');
    expect(t('agle peer ko')).toBe('next monday');
    expect(t('parso dopahar 2 baje')).toBe('day after tomorrow at 2 pm');
  });
});

describe('translateUrdu — forms and fields', () => {
  it('medication form open / fill', () => {
    expect(interpret('dawai add karo', ctx())).toEqual([{ action: 'add_record', kind: 'medication' }]);
    expect(interpret('ek nayi dawai add karo', ctx())).toEqual([{ action: 'add_record', kind: 'medication' }]);
    expect(interpret('دوائی ایڈ کرو', ctx())).toEqual([{ action: 'add_record', kind: 'medication' }]);
    expect(interpret('panadol 500 mg din mein teen bar likho', ctx())).toEqual([{ action: 'add_record', kind: 'medication', fields: { medicationName: 'Panadol', dosage: '500 mg', frequency: 'Three times daily' } }]);
    expect(interpret('metformin 500 mg subah shaam 1 mahine ke liye', ctx({ openFormId: 'medication' }))).toEqual([{ action: 'fill_form', formId: 'medication', fields: { medicationName: 'Metformin', dosage: '500 mg', frequency: 'Twice daily', duration: '1 month' } }]);
    expect(t('raat ko sone se pehle')).toBe('at bedtime');
    expect(t('zaroorat par')).toBe('as needed');
  });
  it('field-level commands need an open form', () => {
    expect(interpret('dosage ko 250 mg karo', ctx({ openFormId: 'medication' }))).toEqual([{ action: 'fill_field', formId: 'medication', field: 'dosage', value: '250 mg' }]);
    expect(interpret('khuraak 250 mg rakho', ctx({ openFormId: 'medication' }))).toEqual([{ action: 'fill_field', formId: 'medication', field: 'dosage', value: '250 mg' }]);
    expect(interpret('خوراک 250 ملی گرام کرو', ctx({ openFormId: 'medication' }))).toEqual([{ action: 'fill_field', formId: 'medication', field: 'dosage', value: '250 mg' }]);
    expect(interpret('notes saaf karo', ctx({ openFormId: 'medication' }))).toEqual([{ action: 'clear_field', formId: 'medication', field: 'notes' }]);
    expect(interpret('prn tick karo', ctx({ openFormId: 'medication' }))).toEqual([{ action: 'set_checkbox', formId: 'medication', field: 'isPRN', checked: true }]);
  });
  it('diagnosis with details', () => {
    expect(interpret('tashkhees add karo hypertension', ctx())).toEqual([{ action: 'add_record', kind: 'diagnosis', fields: { description: 'Hypertension' } }]);
    expect(interpret('تشخیص ایڈ کرو hypertension', ctx())).toEqual([{ action: 'add_record', kind: 'diagnosis', fields: { description: 'Hypertension' } }]);
  });
  it('slot answers in Urdu are translated values', () => {
    const c = ctx({ openFormId: 'medication', pendingSlot: { formId: 'medication', field: 'frequency', label: 'Frequency' } });
    expect(interpret('din mein do bar', c)).toEqual([{ action: 'fill_field', formId: 'medication', field: 'frequency', value: 'twice daily' }]);
    const d = ctx({ openFormId: 'medication', pendingSlot: { formId: 'medication', field: 'duration', label: 'Duration' } });
    expect(interpret('paanch din', d)).toEqual([{ action: 'fill_field', formId: 'medication', field: 'duration', value: 'for 5 days' }]);
  });
});

describe('translateUrdu — confirmation boundary', () => {
  it.each(['haan', 'ji haan', 'theek hai', 'haan save karo', 'save karo', 'save kar do', 'bilkul', 'ji', 'محفوظ کرو', 'جی ہاں', 'ٹھیک ہے', 'theek hai save kar dein'])('"%s" → confirm', (s) => {
    expect(interpret(s, ctx())).toEqual([{ action: 'confirm' }]);
  });
  it.each(['nahi', 'nahin', 'rehne do', 'cancel karo', 'chhor do', 'mat karo', 'نہیں', 'رہنے دو', 'ji nahi'])('"%s" → cancel', (s) => {
    expect(interpret(s, ctx())).toEqual([{ action: 'cancel' }]);
  });
  it('explicit form save is submit_form, close is cancel/close', () => {
    // "save the form" is treated as a confirmation by the English interpreter (same as "save it").
    expect(interpret('form save karo', ctx())).toEqual([{ action: 'confirm' }]);
    expect(t('dawai save karo')).toBe('save the medication');
    expect(t('nuskha bhejo')).toBe('save the prescription');
    expect(interpret('appointment book karo', ctx())).toEqual([{ action: 'add_record', kind: 'appointment' }]);
    expect(interpret('form band karo', ctx())).toEqual([{ action: 'cancel' }]);
  });
});

describe('translateUrdu — multi-step and connectors', () => {
  it('splits on aur / phir / uske baad and keeps drug names together', () => {
    expect(t('patient search par jao phir ahmed khan dhoondo')).toBe('go to patient search and search patient ahmed khan');
    expect(t('page 30 kholo uske baad dawai add karo')).toBe('go to page 30 and add medication');
    expect(t('amoxicillin aur clavulanate 500 mg likho')).toBe('add amoxicillin and clavulanate 500 mg');
    expect(interpret('page 29 par jao aur dawai add karo', ctx())).toEqual([{ action: 'navigate', target: 29 }, { action: 'add_record', kind: 'medication' }]);
  });
  it('handles Urdu digits and punctuation', () => {
    expect(t('پیج ۳۰ پر جاؤ۔')).toBe('go to page 30');
    expect(t('Page 30 par jao!')).toBe('go to page 30');
  });
});

describe('translateUrdu — dashboard summary widget', () => {
  it('opens and closes the dock from Roman Urdu', () => {
    expect(t('dashboard summary dikhao')).toBe('show dashboard summary');
    expect(t('dashboard summary kholo')).toBe('show dashboard summary');
    expect(t('dashboard summary band karo')).toBe('close dashboard summary');
    expect(interpret('dashboard summary dikhao', ctx())).toEqual([{ action: 'open_dashboard_summary' }]);
    expect(interpret('dashboard summary band karo', ctx())).toEqual([{ action: 'close_dashboard_summary' }]);
  });
});
