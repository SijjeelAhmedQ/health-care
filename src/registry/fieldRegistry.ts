/**
 * Static field definitions for every voice-fillable form.
 * The executor uses these to (1) map spoken field names/aliases to real field
 * names, (2) normalize spoken values to option values, and (3) know which
 * fields are required before offering to save.
 *
 * There is exactly one form per record type the application manages:
 * patient, medication, diagnosis, task, recall and appointment.
 */
export type FieldType = 'text' | 'textarea' | 'select' | 'date' | 'time' | 'datetime' | 'number' | 'checkbox' | 'switch' | 'multiselect';

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  aliases?: string[];
  options?: string[];
  /** Synonyms that map to an option: { 'bid': 'Twice daily' } */
  synonyms?: Record<string, string>;
  required?: boolean;
  /** Custom normalizer applied before setting the value. */
  normalize?: (raw: string) => string | number | boolean;
}

export interface FormDefinition {
  id: string;
  title: string;
  aliases: string[];
  /** Page ids where this form is available. */
  pages: string[];
  fields: FieldDefinition[];
  submitLabel: string;
  /** Human-readable description of what saving does (shown in confirmation). */
  sensitiveDescription: string;
}

export const FREQUENCY_OPTIONS = ['Once daily', 'Twice daily', 'Three times daily', 'Four times daily', 'Every 4 hours', 'Every 6 hours', 'Every 8 hours', 'Every 12 hours', 'Once weekly', 'At bedtime', 'As needed'];
export const ROUTE_OPTIONS = ['Oral', 'Intravenous', 'Intramuscular', 'Subcutaneous', 'Topical', 'Inhalation', 'Sublingual', 'Rectal', 'Ophthalmic', 'Otic', 'Nasal', 'Transdermal'];
export const MEDICATION_STATUS_OPTIONS = ['Active', 'Completed', 'Discontinued', 'On Hold'];
export const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Unknown'];
export const APPOINTMENT_TYPE_OPTIONS = ['New Patient', 'Follow-up', 'Consultation', 'Procedure', 'Telehealth', 'Annual Physical', 'Urgent', 'Lab Visit', 'Vaccination'];
export const APPOINTMENT_STATUS_OPTIONS = ['Scheduled', 'Confirmed', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show', 'Rescheduled'];
export const PRIORITY_OPTIONS = ['Routine', 'Urgent', 'Emergency'];
export const DIAGNOSIS_STATUS_OPTIONS = ['Active', 'Chronic', 'Resolved', 'Inactive'];
export const SEVERITY_OPTIONS = ['Mild', 'Moderate', 'Severe'];
export const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
export const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed', 'Unknown'];
export const LANGUAGE_OPTIONS = ['English', 'Spanish', 'Urdu', 'Arabic', 'Mandarin', 'Hindi', 'French'];
export const INSURER_OPTIONS = ['Blue Cross Blue Shield', 'Aetna', 'UnitedHealthcare', 'Cigna', 'Humana', 'Kaiser Permanente', 'Medicare', 'Medicaid', 'Self-pay'];
export const LOCATION_OPTIONS = ['Riverside Medical Center', 'Northgate Family Clinic', 'Lakeside Specialty Center', 'CareFlow Virtual Care'];
export const RECALL_TYPE_OPTIONS = ['Follow-up', 'Screening', 'Vaccination', 'Lab Test', 'Medication Review', 'Chronic Care Review', 'Other'];
export const RECALL_STATUS_OPTIONS = ['Due', 'Scheduled', 'Completed', 'Cancelled'];
export const TASK_CATEGORY_OPTIONS = ['Follow-up', 'Monitoring', 'Referral', 'Documentation', 'Medication Review', 'Lab Follow-up', 'Patient Education', 'Other'];
export const TASK_STATUS_OPTIONS = ['Open', 'In Progress', 'Completed', 'Cancelled'];
export const TASK_PRIORITY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent'];

const frequencySynonyms: Record<string, string> = {
  'once a day': 'Once daily', 'once daily': 'Once daily', daily: 'Once daily', 'every day': 'Once daily', qd: 'Once daily', od: 'Once daily', 'one time a day': 'Once daily', 'once per day': 'Once daily',
  'twice a day': 'Twice daily', 'twice daily': 'Twice daily', bid: 'Twice daily', 'two times a day': 'Twice daily', 'two times daily': 'Twice daily', 'twice per day': 'Twice daily', 'every 12 hours': 'Every 12 hours', q12h: 'Every 12 hours',
  'three times a day': 'Three times daily', 'three times daily': 'Three times daily', tid: 'Three times daily', 'thrice daily': 'Three times daily', 'every 8 hours': 'Every 8 hours', q8h: 'Every 8 hours',
  'four times a day': 'Four times daily', 'four times daily': 'Four times daily', qid: 'Four times daily', 'every 6 hours': 'Every 6 hours', q6h: 'Every 6 hours', 'every 4 hours': 'Every 4 hours', q4h: 'Every 4 hours',
  weekly: 'Once weekly', 'once a week': 'Once weekly', 'once weekly': 'Once weekly', 'at night': 'At bedtime', 'at bedtime': 'At bedtime', bedtime: 'At bedtime', qhs: 'At bedtime', nightly: 'At bedtime',
  'as needed': 'As needed', prn: 'As needed', 'when needed': 'As needed', 'when required': 'As needed',
};

const routeSynonyms: Record<string, string> = {
  oral: 'Oral', orally: 'Oral', 'by mouth': 'Oral', po: 'Oral', mouth: 'Oral', tablet: 'Oral', capsule: 'Oral',
  iv: 'Intravenous', intravenous: 'Intravenous', intravenously: 'Intravenous', im: 'Intramuscular', intramuscular: 'Intramuscular', intramuscularly: 'Intramuscular',
  subcut: 'Subcutaneous', sc: 'Subcutaneous', subq: 'Subcutaneous', subcutaneous: 'Subcutaneous', subcutaneously: 'Subcutaneous', topical: 'Topical', topically: 'Topical', cream: 'Topical',
  inhaled: 'Inhalation', inhaler: 'Inhalation', inhalation: 'Inhalation', sublingual: 'Sublingual', 'under the tongue': 'Sublingual', rectal: 'Rectal', 'eye drops': 'Ophthalmic', ophthalmic: 'Ophthalmic',
  'ear drops': 'Otic', otic: 'Otic', nasal: 'Nasal', 'nasal spray': 'Nasal', patch: 'Transdermal', transdermal: 'Transdermal',
};

const genderSynonyms: Record<string, string> = { male: 'Male', man: 'Male', m: 'Male', boy: 'Male', female: 'Female', woman: 'Female', f: 'Female', girl: 'Female', other: 'Other', 'non-binary': 'Other', nonbinary: 'Other', unknown: 'Unknown' };

const recallTypeSynonyms: Record<string, string> = {
  'follow up': 'Follow-up', followup: 'Follow-up', 'follow-up': 'Follow-up', review: 'Follow-up', checkup: 'Follow-up', 'check up': 'Follow-up',
  screening: 'Screening', screen: 'Screening', mammogram: 'Screening', 'pap smear': 'Screening', colonoscopy: 'Screening',
  vaccination: 'Vaccination', vaccine: 'Vaccination', immunization: 'Vaccination', booster: 'Vaccination',
  lab: 'Lab Test', labs: 'Lab Test', 'lab test': 'Lab Test', 'blood test': 'Lab Test', 'repeat labs': 'Lab Test',
  'medication review': 'Medication Review', 'med review': 'Medication Review',
  'chronic care': 'Chronic Care Review', 'diabetes review': 'Chronic Care Review', 'annual review': 'Chronic Care Review', other: 'Other',
};

const taskCategorySynonyms: Record<string, string> = {
  'follow up': 'Follow-up', followup: 'Follow-up', 'follow-up': 'Follow-up', call: 'Follow-up',
  monitor: 'Monitoring', monitoring: 'Monitoring', check: 'Monitoring', 'blood pressure monitoring': 'Monitoring', observation: 'Monitoring',
  referral: 'Referral', refer: 'Referral', document: 'Documentation', documentation: 'Documentation', paperwork: 'Documentation', note: 'Documentation',
  'medication review': 'Medication Review', 'med review': 'Medication Review', 'lab follow up': 'Lab Follow-up', 'lab follow-up': 'Lab Follow-up', labs: 'Lab Follow-up',
  education: 'Patient Education', educate: 'Patient Education', teaching: 'Patient Education', other: 'Other',
};

const yesNo = (raw: string) => /^(yes|true|on|checked|enable|enabled|allowed|allow)$/i.test(raw.trim());
const toInt = (fallback = 0) => (raw: string) => Number(String(raw).replace(/\D/g, '')) || fallback;

/** "amoxicillin" -> "Amoxicillin" (LLMs often return lower-case drug names). */
export const normalizeName = (raw: string): string => raw.trim().replace(/(^|\s)([a-z])/g, (_, sp: string, c: string) => sp + c.toUpperCase());

export const normalizeDosage = (raw: string): string =>
  raw
    .trim()
    .replace(/\bmilligrams?\b/gi, 'mg')
    .replace(/\bmicrograms?\b/gi, 'mcg')
    .replace(/\bgrams?\b/gi, 'g')
    .replace(/\bmillilit(er|re)s?\b/gi, 'mL')
    .replace(/\bunits?\b/gi, 'units')
    .replace(/(\d)\s*(mg|mcg|g|mL|units)\b/g, '$1 $2');

export const normalizeDuration = (raw: string): string => {
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fourteen: 14, twenty: 20, thirty: 30 };
  const m = raw.trim().toLowerCase().match(/(\d+|[a-z]+)\s*(day|week|month|year)s?/);
  if (!m) return raw.trim();
  const n = Number.isNaN(Number(m[1])) ? words[m[1]] : Number(m[1]);
  if (!n) return raw.trim();
  return `${n} ${m[2]}${n === 1 ? '' : 's'}`;
};

export const forms: FormDefinition[] = [
  {
    id: 'patient',
    title: 'Patient',
    aliases: ['patient form', 'registration form', 'register patient', 'new patient form', 'add patient', 'patient'],
    pages: ['patients'],
    submitLabel: 'Save Patient',
    sensitiveDescription: 'Save this patient record',
    fields: [
      { name: 'firstName', label: 'First Name', type: 'text', aliases: ['first', 'given name', 'forename'], required: true, normalize: normalizeName },
      { name: 'lastName', label: 'Last Name', type: 'text', aliases: ['last', 'surname', 'family name'], required: true, normalize: normalizeName },
      { name: 'dateOfBirth', label: 'Date of Birth', type: 'date', aliases: ['dob', 'birth date', 'birthday', 'born'], required: true },
      { name: 'age', label: 'Age', type: 'number', aliases: ['years old', 'aged'], normalize: toInt() },
      { name: 'gender', label: 'Gender', type: 'select', options: GENDER_OPTIONS, synonyms: genderSynonyms, aliases: ['sex'], required: true },
      { name: 'bloodGroup', label: 'Blood Group', type: 'select', options: BLOOD_GROUP_OPTIONS, aliases: ['blood type'], synonyms: { 'a positive': 'A+', 'a negative': 'A-', 'b positive': 'B+', 'b negative': 'B-', 'ab positive': 'AB+', 'ab negative': 'AB-', 'o positive': 'O+', 'o negative': 'O-' } },
      { name: 'maritalStatus', label: 'Marital Status', type: 'select', options: MARITAL_OPTIONS, aliases: ['marital'] },
      { name: 'language', label: 'Preferred Language', type: 'select', options: LANGUAGE_OPTIONS, aliases: ['speaks', 'language'] },
      { name: 'occupation', label: 'Occupation', type: 'text', aliases: ['job', 'works as', 'profession'] },
      { name: 'phone', label: 'Phone', type: 'text', aliases: ['phone number', 'mobile', 'cell', 'telephone', 'number'], required: true },
      { name: 'email', label: 'Email', type: 'text', aliases: ['email address', 'e-mail'] },
      { name: 'addressLine1', label: 'Address', type: 'text', aliases: ['address', 'street', 'lives at', 'street address'], normalize: normalizeName },
      { name: 'city', label: 'City', type: 'text', aliases: ['town'], normalize: normalizeName },
      { name: 'state', label: 'State', type: 'text', aliases: ['province', 'region'], normalize: normalizeName },
      { name: 'postalCode', label: 'Postal Code', type: 'text', aliases: ['zip', 'zip code', 'postcode'] },
      { name: 'insuranceProvider', label: 'Insurance Provider', type: 'select', options: INSURER_OPTIONS, aliases: ['insurer', 'insurance', 'insurance company'] },
      { name: 'policyNumber', label: 'Policy Number', type: 'text', aliases: ['policy', 'member id', 'policy id'] },
      { name: 'primaryProviderName', label: 'Primary Provider', type: 'select', aliases: ['primary care provider', 'pcp', 'doctor', 'provider'] },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive', 'Deceased', 'Pending'] },
      { name: 'emergencyContactName', label: 'Emergency Contact Name', type: 'text', aliases: ['emergency contact', 'next of kin'], normalize: normalizeName },
      { name: 'emergencyContactPhone', label: 'Emergency Contact Phone', type: 'text', aliases: ['emergency phone', 'emergency number', 'emergency contact number'] },
      { name: 'emergencyContactRelation', label: 'Relationship', type: 'select', options: ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Other'], aliases: ['relation', 'relationship'] },
    ],
  },
  {
    id: 'medication',
    title: 'Medication',
    aliases: ['medication form', 'add medication', 'new medication', 'medicine', 'drug', 'medication'],
    pages: ['medications', 'summary-medication'],
    submitLabel: 'Save Medication',
    sensitiveDescription: 'Save this medication to the patient record',
    fields: [
      { name: 'medicationName', label: 'Medication Name', type: 'text', aliases: ['medication', 'drug', 'name', 'medicine'], required: true, normalize: normalizeName },
      { name: 'dosage', label: 'Dosage', type: 'text', aliases: ['dose', 'strength', 'amount'], required: true, normalize: normalizeDosage },
      { name: 'route', label: 'Route', type: 'select', options: ROUTE_OPTIONS, synonyms: routeSynonyms, aliases: ['route of administration', 'how taken'] },
      { name: 'frequency', label: 'Frequency', type: 'select', options: FREQUENCY_OPTIONS, synonyms: frequencySynonyms, aliases: ['how often', 'times a day', 'schedule'], required: true },
      { name: 'duration', label: 'Duration', type: 'text', aliases: ['for how long', 'length', 'course'], normalize: normalizeDuration },
      { name: 'startDate', label: 'Start Date', type: 'date', aliases: ['start', 'starting', 'from'] },
      { name: 'endDate', label: 'End Date', type: 'date', aliases: ['end', 'until', 'stop date'] },
      { name: 'indication', label: 'Indication', type: 'text', aliases: ['reason', 'for', 'condition'] },
      { name: 'status', label: 'Status', type: 'select', options: MEDICATION_STATUS_OPTIONS, synonyms: { active: 'Active', ongoing: 'Active', completed: 'Completed', finished: 'Completed', stopped: 'Discontinued', discontinued: 'Discontinued', stop: 'Discontinued', hold: 'On Hold', 'on hold': 'On Hold', paused: 'On Hold' } },
      { name: 'prescribedBy', label: 'Prescribed By', type: 'select', aliases: ['prescriber', 'doctor', 'by'] },
      { name: 'refills', label: 'Refills', type: 'number', aliases: ['refill', 'repeats'], normalize: toInt() },
      { name: 'isPRN', label: 'As Needed (PRN)', type: 'checkbox', aliases: ['prn', 'as needed'], normalize: yesNo },
      { name: 'instructions', label: 'Instructions', type: 'textarea', aliases: ['directions', 'sig', 'patient instructions'] },
      { name: 'notes', label: 'Notes', type: 'textarea', aliases: ['comment', 'comments', 'note'] },
    ],
  },
  {
    id: 'diagnosis',
    title: 'Diagnosis',
    aliases: ['diagnosis form', 'add diagnosis', 'new diagnosis', 'problem', 'condition', 'diagnosis'],
    pages: ['diagnoses', 'summary-diagnosis'],
    submitLabel: 'Save Diagnosis',
    sensitiveDescription: 'Add this diagnosis to the problem list',
    fields: [
      { name: 'description', label: 'Diagnosis', type: 'text', aliases: ['diagnosis', 'condition', 'problem', 'name'], required: true, normalize: normalizeName },
      { name: 'icd10', label: 'ICD-10 Code', type: 'text', aliases: ['icd', 'icd code', 'code', 'icd10'] },
      { name: 'status', label: 'Status', type: 'select', options: DIAGNOSIS_STATUS_OPTIONS, synonyms: { active: 'Active', current: 'Active', chronic: 'Chronic', 'long term': 'Chronic', resolved: 'Resolved', cured: 'Resolved', inactive: 'Inactive' } },
      { name: 'severity', label: 'Severity', type: 'select', options: SEVERITY_OPTIONS, synonyms: { mild: 'Mild', moderate: 'Moderate', severe: 'Severe' } },
      { name: 'onsetDate', label: 'Onset Date', type: 'date', aliases: ['onset', 'since', 'started', 'diagnosed on'] },
      { name: 'diagnosedBy', label: 'Diagnosed By', type: 'select', aliases: ['doctor', 'by', 'clinician'] },
      { name: 'notes', label: 'Clinical Notes', type: 'textarea', aliases: ['note', 'notes', 'comments'] },
    ],
  },
  {
    id: 'task',
    title: 'Task',
    aliases: ['task form', 'add task', 'new task', 'to do', 'todo', 'task'],
    pages: ['tasks', 'summary-task'],
    submitLabel: 'Save Task',
    sensitiveDescription: 'Save this task for the patient',
    fields: [
      { name: 'title', label: 'Task', type: 'text', aliases: ['task', 'what', 'name', 'title', 'description'], required: true, normalize: (r) => r.charAt(0).toUpperCase() + r.slice(1) },
      { name: 'category', label: 'Category', type: 'select', options: TASK_CATEGORY_OPTIONS, synonyms: taskCategorySynonyms, aliases: ['type', 'kind'] },
      { name: 'assignedTo', label: 'Assigned To', type: 'select', aliases: ['assign to', 'assignee', 'owner', 'for', 'who'] },
      { name: 'dueDate', label: 'Due Date', type: 'date', aliases: ['due', 'by', 'when', 'on'], required: true },
      { name: 'priority', label: 'Priority', type: 'select', options: TASK_PRIORITY_OPTIONS, synonyms: { low: 'Low', normal: 'Normal', routine: 'Normal', high: 'High', important: 'High', urgent: 'Urgent', asap: 'Urgent' } },
      { name: 'status', label: 'Status', type: 'select', options: TASK_STATUS_OPTIONS, synonyms: { open: 'Open', new: 'Open', 'in progress': 'In Progress', started: 'In Progress', doing: 'In Progress', done: 'Completed', completed: 'Completed', finished: 'Completed', cancelled: 'Cancelled', canceled: 'Cancelled' } },
      { name: 'description', label: 'Details', type: 'textarea', aliases: ['detail', 'details', 'notes', 'note'] },
    ],
  },
  {
    id: 'recall',
    title: 'Recall',
    aliases: ['recall form', 'add recall', 'set recall', 'recall reminder', 'reminder', 'recall'],
    pages: ['recalls', 'summary-recall'],
    submitLabel: 'Save Recall',
    sensitiveDescription: 'Add this recall to the patient record',
    fields: [
      { name: 'reason', label: 'Reason', type: 'text', aliases: ['for', 'purpose', 'why', 'description', 'what'], required: true, normalize: (r) => r.charAt(0).toUpperCase() + r.slice(1) },
      { name: 'type', label: 'Recall Type', type: 'select', options: RECALL_TYPE_OPTIONS, aliases: ['kind', 'category'], synonyms: recallTypeSynonyms },
      { name: 'dueDate', label: 'Due Date', type: 'date', aliases: ['due', 'date', 'when', 'on', 'by'], required: true },
      { name: 'priority', label: 'Priority', type: 'select', options: ['Normal', 'High'], synonyms: { normal: 'Normal', routine: 'Normal', high: 'High', urgent: 'High', important: 'High' } },
      { name: 'status', label: 'Status', type: 'select', options: RECALL_STATUS_OPTIONS, synonyms: { due: 'Due', scheduled: 'Scheduled', booked: 'Scheduled', completed: 'Completed', done: 'Completed', cancelled: 'Cancelled', canceled: 'Cancelled' } },
      { name: 'notes', label: 'Notes', type: 'textarea', aliases: ['note', 'comments'] },
    ],
  },
  {
    id: 'appointment',
    title: 'Appointment',
    aliases: ['appointment form', 'create appointment', 'new appointment', 'book appointment', 'appointment'],
    pages: ['appointments', 'summary-appointment'],
    submitLabel: 'Book Appointment',
    sensitiveDescription: 'Book this appointment',
    fields: [
      { name: 'providerName', label: 'Provider', type: 'select', aliases: ['doctor', 'with', 'clinician', 'physician', 'dr'], required: true },
      { name: 'date', label: 'Date', type: 'date', aliases: ['on', 'day', 'appointment date'], required: true },
      { name: 'startTime', label: 'Time', type: 'time', aliases: ['at', 'start time', 'time'], required: true },
      { name: 'durationMinutes', label: 'Duration (minutes)', type: 'number', aliases: ['duration', 'length', 'minutes'], normalize: toInt(30) },
      { name: 'type', label: 'Appointment Type', type: 'select', options: APPOINTMENT_TYPE_OPTIONS, aliases: ['visit type', 'kind'], synonyms: { 'follow up': 'Follow-up', followup: 'Follow-up', 'follow-up': 'Follow-up', new: 'New Patient', 'new patient': 'New Patient', telehealth: 'Telehealth', video: 'Telehealth', virtual: 'Telehealth', physical: 'Annual Physical', annual: 'Annual Physical', urgent: 'Urgent', lab: 'Lab Visit', vaccination: 'Vaccination', vaccine: 'Vaccination', consult: 'Consultation', consultation: 'Consultation', procedure: 'Procedure' } },
      { name: 'reason', label: 'Reason for Visit', type: 'text', aliases: ['reason', 'because', 'complaint', 'for'], required: true },
      { name: 'locationName', label: 'Location', type: 'select', options: LOCATION_OPTIONS, aliases: ['clinic', 'site', 'where'], synonyms: { riverside: 'Riverside Medical Center', northgate: 'Northgate Family Clinic', lakeside: 'Lakeside Specialty Center', virtual: 'CareFlow Virtual Care', telehealth: 'CareFlow Virtual Care' } },
      { name: 'status', label: 'Status', type: 'select', options: APPOINTMENT_STATUS_OPTIONS, synonyms: { scheduled: 'Scheduled', booked: 'Scheduled', confirmed: 'Confirmed', 'checked in': 'Checked In', arrived: 'Checked In', 'in progress': 'In Progress', completed: 'Completed', done: 'Completed', cancelled: 'Cancelled', canceled: 'Cancelled', 'no show': 'No Show', rescheduled: 'Rescheduled' } },
      { name: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS, synonyms: { routine: 'Routine', normal: 'Routine', urgent: 'Urgent', emergency: 'Emergency', stat: 'Emergency' } },
      { name: 'isTelehealth', label: 'Telehealth Visit', type: 'checkbox', aliases: ['telehealth', 'video visit', 'virtual'], normalize: yesNo },
      { name: 'notes', label: 'Notes', type: 'textarea', aliases: ['note', 'comments'] },
    ],
  },
];

const formById = new Map(forms.map((f) => [f.id, f]));

const norm = (s: string) => s.toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

export const FieldRegistry = {
  forms: () => forms,
  getForm: (id: string) => formById.get(id),
  formsForPage: (pageId: string | null) => (pageId ? forms.filter((f) => f.pages.includes(pageId)) : []),

  /** Resolve a spoken form name ("medication form", "diagnosis") to a form id. */
  resolveForm(nameOrId: string, preferPageId?: string | null, exact = false): FormDefinition | undefined {
    const q = norm(nameOrId);
    if (formById.has(q)) return formById.get(q);
    const candidates = forms.filter((f) => f.id === q || f.aliases.some((a) => norm(a) === q || (!exact && q.includes(norm(a)))));
    if (preferPageId) {
      const onPage = candidates.find((f) => f.pages.includes(preferPageId));
      if (onPage) return onPage;
    }
    return candidates[0];
  },

  /** Resolve a spoken field name to its definition within a form. */
  resolveField(formId: string, fieldName: string): FieldDefinition | undefined {
    const form = formById.get(formId);
    if (!form) return undefined;
    const q = norm(fieldName);
    return (
      form.fields.find((f) => f.name === fieldName) ??
      form.fields.find((f) => norm(f.name) === q || norm(f.label) === q) ??
      form.fields.find((f) => f.aliases?.some((a) => norm(a) === q)) ??
      form.fields.find((f) => norm(f.label).includes(q) || q.includes(norm(f.label)))
    );
  },

  /** Normalize a raw spoken value into the value the form control expects. */
  normalizeValue(field: FieldDefinition, raw: string | number | boolean): string | number | boolean {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return field.type === 'text' || field.type === 'textarea' ? String(raw) : raw;
    const value = raw.trim();
    if (field.normalize) return field.normalize(value);
    if (field.type === 'checkbox' || field.type === 'switch') return yesNo(value);
    if (field.type === 'number') return Number(value.replace(/[^\d.]/g, '')) || 0;
    if (field.type === 'select' || field.type === 'multiselect') {
      const lower = value.toLowerCase();
      if (field.synonyms?.[lower]) return field.synonyms[lower];
      const exact = field.options?.find((o) => o.toLowerCase() === lower);
      if (exact) return exact;
      const partial = field.options?.find((o) => o.toLowerCase().includes(lower) || lower.includes(o.toLowerCase()));
      if (partial) return partial;
      const synonymHit = field.synonyms && Object.entries(field.synonyms).find(([k]) => lower.includes(k));
      if (synonymHit) return synonymHit[1];
      return value; // allow free-text selects (e.g. provider names)
    }
    return value;
  },

  missingRequired(formId: string, values: Record<string, unknown>): FieldDefinition[] {
    const form = formById.get(formId);
    if (!form) return [];
    return form.fields.filter((f) => f.required && (values[f.name] === undefined || values[f.name] === '' || values[f.name] === null));
  },
};
