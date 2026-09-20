/**
 * Static field definitions for every voice-fillable form.
 * The executor uses these to (1) map spoken field names/aliases to real field
 * names, (2) normalize spoken values to option values, and (3) know which
 * fields are required before offering to save.
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
export const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Unknown'];
export const APPOINTMENT_TYPE_OPTIONS = ['New Patient', 'Follow-up', 'Consultation', 'Procedure', 'Telehealth', 'Annual Physical', 'Urgent', 'Lab Visit', 'Vaccination'];
export const PRIORITY_OPTIONS = ['Routine', 'Urgent', 'Emergency'];
export const SEVERITY_OPTIONS = ['Mild', 'Moderate', 'Severe', 'Life-threatening'];
export const ALLERGY_TYPE_OPTIONS = ['Drug', 'Food', 'Environmental', 'Other'];
export const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
export const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed', 'Unknown'];
export const LANGUAGE_OPTIONS = ['English', 'Spanish', 'Urdu', 'Arabic', 'Mandarin', 'Hindi', 'French'];
export const INSURER_OPTIONS = ['Blue Cross Blue Shield', 'Aetna', 'UnitedHealthcare', 'Cigna', 'Humana', 'Kaiser Permanente', 'Medicare', 'Medicaid', 'Self-pay'];
export const LOCATION_OPTIONS = ['Riverside Medical Center', 'Northgate Family Clinic', 'Lakeside Specialty Center', 'CareFlow Virtual Care'];
export const SPECIALTY_OPTIONS = ['Family Medicine', 'Internal Medicine', 'Cardiology', 'Pediatrics', 'Dermatology', 'Orthopedics', 'Endocrinology', 'Neurology', 'Psychiatry', 'Obstetrics & Gynecology', 'Pulmonology', 'Gastroenterology'];
export const DEPARTMENT_OPTIONS = ['Primary Care', 'Cardiology', 'Pediatrics', 'Dermatology', 'Orthopedics', 'Endocrinology', 'Neurology', 'Behavioral Health', "Women's Health", 'Diagnostics'];
export const ROLE_OPTIONS = ['Administrator', 'Physician', 'Nurse', 'Receptionist', 'Billing', 'Pharmacist', 'Lab Technician', 'Practice Manager'];

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

const yesNo = (raw: string) => /^(yes|true|on|checked|enable|enabled|allowed|allow)$/i.test(raw.trim());

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
    id: 'medication',
    title: 'Medication',
    aliases: ['medication form', 'add medication', 'new medication', 'medication'],
    pages: ['medications', 'patient-medications', 'consultation'],
    submitLabel: 'Save Medication',
    sensitiveDescription: 'Save this medication to the patient record',
    fields: [
      { name: 'patientName', label: 'Patient', type: 'text', aliases: ['patient', 'for patient'] },
      { name: 'medicationName', label: 'Medication Name', type: 'text', aliases: ['medication', 'drug', 'name', 'medicine'], required: true },
      { name: 'dosage', label: 'Dosage', type: 'text', aliases: ['dose', 'strength', 'amount'], required: true, normalize: normalizeDosage },
      { name: 'route', label: 'Route', type: 'select', options: ROUTE_OPTIONS, synonyms: routeSynonyms, aliases: ['route of administration', 'how taken'] },
      { name: 'frequency', label: 'Frequency', type: 'select', options: FREQUENCY_OPTIONS, synonyms: frequencySynonyms, aliases: ['how often', 'times a day', 'schedule'], required: true },
      { name: 'duration', label: 'Duration', type: 'text', aliases: ['for how long', 'length', 'course'], normalize: normalizeDuration },
      { name: 'startDate', label: 'Start Date', type: 'date', aliases: ['start', 'starting', 'from'] },
      { name: 'endDate', label: 'End Date', type: 'date', aliases: ['end', 'until', 'stop date'] },
      { name: 'indication', label: 'Indication', type: 'text', aliases: ['reason', 'for', 'condition', 'diagnosis'] },
      { name: 'refills', label: 'Refills', type: 'number', aliases: ['refill', 'repeats'], normalize: (r) => Number(r.replace(/\D/g, '')) || 0 },
      { name: 'isPRN', label: 'As Needed (PRN)', type: 'checkbox', aliases: ['prn', 'as needed'], normalize: yesNo },
      { name: 'instructions', label: 'Instructions', type: 'textarea', aliases: ['directions', 'sig', 'patient instructions'] },
      { name: 'notes', label: 'Notes', type: 'textarea', aliases: ['comment', 'comments', 'note'] },
    ],
  },
  {
    id: 'prescription',
    title: 'Prescription',
    aliases: ['prescription form', 'new prescription', 'prescription', 'prescribe', 'rx'],
    pages: ['prescriptions'],
    submitLabel: 'Send Prescription',
    sensitiveDescription: 'Create and send this prescription to the pharmacy',
    fields: [
      { name: 'patientName', label: 'Patient', type: 'text', aliases: ['patient', 'for patient'], required: true },
      { name: 'medicationName', label: 'Medication Name', type: 'text', aliases: ['medication', 'drug', 'medicine', 'name'], required: true },
      { name: 'dosage', label: 'Dosage', type: 'text', aliases: ['dose', 'strength'], required: true, normalize: normalizeDosage },
      { name: 'route', label: 'Route', type: 'select', options: ROUTE_OPTIONS, synonyms: routeSynonyms },
      { name: 'frequency', label: 'Frequency', type: 'select', options: FREQUENCY_OPTIONS, synonyms: frequencySynonyms, aliases: ['how often'], required: true },
      { name: 'duration', label: 'Duration', type: 'text', aliases: ['for how long', 'course'], normalize: normalizeDuration },
      { name: 'quantity', label: 'Quantity', type: 'number', aliases: ['qty', 'amount', 'tablets', 'count'], normalize: (r) => Number(r.replace(/\D/g, '')) || 0 },
      { name: 'refills', label: 'Refills', type: 'number', aliases: ['refill', 'repeats'], normalize: (r) => Number(r.replace(/\D/g, '')) || 0 },
      { name: 'pharmacy', label: 'Pharmacy', type: 'select', options: ['CVS Pharmacy #1123', 'Walgreens – Riverside', 'H-E-B Pharmacy', 'Costco Pharmacy', 'Amazon Pharmacy'], synonyms: { cvs: 'CVS Pharmacy #1123', walgreens: 'Walgreens – Riverside', heb: 'H-E-B Pharmacy', 'h-e-b': 'H-E-B Pharmacy', costco: 'Costco Pharmacy', amazon: 'Amazon Pharmacy' } },
      { name: 'substitutionAllowed', label: 'Generic Substitution Allowed', type: 'checkbox', aliases: ['substitution', 'generic allowed', 'generic'], normalize: yesNo },
      { name: 'instructions', label: 'Instructions (Sig)', type: 'textarea', aliases: ['sig', 'directions'] },
    ],
  },
  {
    id: 'appointment',
    title: 'Appointment',
    aliases: ['appointment form', 'create appointment', 'new appointment', 'book appointment', 'appointment'],
    pages: ['create-appointment', 'appointment-calendar', 'appointment-dashboard', 'patient-profile', 'patient-summary'],
    submitLabel: 'Book Appointment',
    sensitiveDescription: 'Book this appointment',
    fields: [
      { name: 'patientName', label: 'Patient', type: 'text', aliases: ['patient', 'for', 'for patient', 'with patient'], required: true },
      { name: 'providerName', label: 'Provider', type: 'select', aliases: ['doctor', 'with', 'clinician', 'physician', 'dr'], required: true },
      { name: 'date', label: 'Date', type: 'date', aliases: ['on', 'day', 'appointment date'], required: true },
      { name: 'startTime', label: 'Time', type: 'time', aliases: ['at', 'start time', 'time'], required: true },
      { name: 'durationMinutes', label: 'Duration (minutes)', type: 'number', aliases: ['duration', 'length', 'minutes'], normalize: (r) => Number(r.replace(/\D/g, '')) || 30 },
      { name: 'type', label: 'Appointment Type', type: 'select', options: APPOINTMENT_TYPE_OPTIONS, aliases: ['visit type', 'kind'], synonyms: { 'follow up': 'Follow-up', followup: 'Follow-up', 'follow-up': 'Follow-up', new: 'New Patient', 'new patient': 'New Patient', telehealth: 'Telehealth', video: 'Telehealth', virtual: 'Telehealth', physical: 'Annual Physical', annual: 'Annual Physical', urgent: 'Urgent', lab: 'Lab Visit', vaccination: 'Vaccination', vaccine: 'Vaccination', consult: 'Consultation', consultation: 'Consultation', procedure: 'Procedure' } },
      { name: 'locationName', label: 'Location', type: 'select', options: LOCATION_OPTIONS, aliases: ['clinic', 'site', 'where'], synonyms: { riverside: 'Riverside Medical Center', northgate: 'Northgate Family Clinic', lakeside: 'Lakeside Specialty Center', virtual: 'CareFlow Virtual Care', telehealth: 'CareFlow Virtual Care' } },
      { name: 'room', label: 'Room', type: 'text', aliases: ['exam room'] },
      { name: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS, synonyms: { routine: 'Routine', normal: 'Routine', urgent: 'Urgent', emergency: 'Emergency', stat: 'Emergency' } },
      { name: 'reason', label: 'Reason for Visit', type: 'text', aliases: ['reason', 'because', 'complaint', 'for'], required: true },
      { name: 'isTelehealth', label: 'Telehealth Visit', type: 'checkbox', aliases: ['telehealth', 'video visit', 'virtual'], normalize: yesNo },
      { name: 'sendReminder', label: 'Send Reminder', type: 'checkbox', aliases: ['reminder'], normalize: yesNo },
      { name: 'notes', label: 'Notes', type: 'textarea', aliases: ['note', 'comments'] },
    ],
  },
  {
    id: 'patient',
    title: 'Patient Registration',
    aliases: ['patient form', 'registration form', 'register patient', 'new patient form', 'patient'],
    pages: ['patient-registration', 'patient-demographics', 'patient-profile'],
    submitLabel: 'Save Patient',
    sensitiveDescription: 'Register this patient',
    fields: [
      { name: 'firstName', label: 'First Name', type: 'text', aliases: ['first', 'given name', 'forename'], required: true },
      { name: 'lastName', label: 'Last Name', type: 'text', aliases: ['last', 'surname', 'family name'], required: true },
      { name: 'dateOfBirth', label: 'Date of Birth', type: 'date', aliases: ['dob', 'birth date', 'birthday', 'born'], required: true },
      { name: 'age', label: 'Age', type: 'number', aliases: ['years old', 'aged'], normalize: (r) => Number(r.replace(/\D/g, '')) || 0 },
      { name: 'gender', label: 'Gender', type: 'select', options: GENDER_OPTIONS, synonyms: genderSynonyms, aliases: ['sex'], required: true },
      { name: 'bloodGroup', label: 'Blood Group', type: 'select', options: BLOOD_GROUP_OPTIONS, aliases: ['blood type'], synonyms: { 'a positive': 'A+', 'a negative': 'A-', 'b positive': 'B+', 'b negative': 'B-', 'ab positive': 'AB+', 'ab negative': 'AB-', 'o positive': 'O+', 'o negative': 'O-' } },
      { name: 'maritalStatus', label: 'Marital Status', type: 'select', options: MARITAL_OPTIONS, aliases: ['marital'] },
      { name: 'language', label: 'Preferred Language', type: 'select', options: LANGUAGE_OPTIONS, aliases: ['speaks', 'language'] },
      { name: 'occupation', label: 'Occupation', type: 'text', aliases: ['job', 'works as', 'profession'] },
      { name: 'phone', label: 'Phone', type: 'text', aliases: ['phone number', 'mobile', 'cell', 'telephone', 'number'], required: true },
      { name: 'email', label: 'Email', type: 'text', aliases: ['email address', 'e-mail'] },
      { name: 'addressLine1', label: 'Address Line 1', type: 'text', aliases: ['address', 'street', 'lives at'] },
      { name: 'addressLine2', label: 'Address Line 2', type: 'text', aliases: ['apartment', 'suite', 'unit'] },
      { name: 'city', label: 'City', type: 'text', aliases: ['town'] },
      { name: 'state', label: 'State', type: 'text', aliases: ['province', 'region'] },
      { name: 'postalCode', label: 'Postal Code', type: 'text', aliases: ['zip', 'zip code', 'postcode'] },
      { name: 'country', label: 'Country', type: 'text' },
      { name: 'insuranceProvider', label: 'Insurance Provider', type: 'select', options: INSURER_OPTIONS, aliases: ['insurer', 'insurance', 'insurance company'] },
      { name: 'insurancePlan', label: 'Insurance Plan', type: 'text', aliases: ['plan'] },
      { name: 'policyNumber', label: 'Policy Number', type: 'text', aliases: ['policy', 'member id', 'policy id'] },
      { name: 'primaryProviderName', label: 'Primary Provider', type: 'select', aliases: ['primary care provider', 'pcp', 'doctor', 'provider'] },
      { name: 'emergencyContactName', label: 'Emergency Contact Name', type: 'text', aliases: ['emergency contact', 'next of kin'] },
      { name: 'emergencyContactPhone', label: 'Emergency Contact Phone', type: 'text', aliases: ['emergency phone', 'emergency number'] },
      { name: 'emergencyContactRelation', label: 'Relationship', type: 'select', options: ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Other'], aliases: ['relation', 'relationship'] },
      { name: 'consentToContact', label: 'Consent to Contact', type: 'checkbox', aliases: ['consent'], normalize: yesNo },
      { name: 'notes', label: 'Notes', type: 'textarea', aliases: ['note', 'comments'] },
    ],
  },
  {
    id: 'allergy',
    title: 'Allergy',
    aliases: ['allergy form', 'add allergy', 'new allergy', 'allergy'],
    pages: ['patient-allergies', 'consultation'],
    submitLabel: 'Save Allergy',
    sensitiveDescription: 'Record this allergy on the patient chart',
    fields: [
      { name: 'allergen', label: 'Allergen', type: 'text', aliases: ['allergic to', 'allergy', 'substance'], required: true },
      { name: 'type', label: 'Type', type: 'select', options: ALLERGY_TYPE_OPTIONS, synonyms: { medication: 'Drug', drug: 'Drug', medicine: 'Drug', food: 'Food', environmental: 'Environmental', environment: 'Environmental', other: 'Other' } },
      { name: 'reaction', label: 'Reaction', type: 'text', aliases: ['causes', 'symptoms', 'reacts with'], required: true },
      { name: 'severity', label: 'Severity', type: 'select', options: SEVERITY_OPTIONS, synonyms: { mild: 'Mild', moderate: 'Moderate', severe: 'Severe', 'life threatening': 'Life-threatening', anaphylaxis: 'Life-threatening', 'life-threatening': 'Life-threatening' }, required: true },
      { name: 'onsetDate', label: 'Onset Date', type: 'date', aliases: ['since', 'onset', 'started'] },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive', 'Resolved'] },
      { name: 'notes', label: 'Notes', type: 'textarea', aliases: ['note', 'comments'] },
    ],
  },
  {
    id: 'problem',
    title: 'Problem / Diagnosis',
    aliases: ['diagnosis form', 'add diagnosis', 'new diagnosis', 'problem form', 'add problem', 'diagnosis', 'problem'],
    pages: ['diagnosis', 'patient-problems', 'consultation'],
    submitLabel: 'Save Diagnosis',
    sensitiveDescription: 'Add this diagnosis to the problem list',
    fields: [
      { name: 'patientName', label: 'Patient', type: 'text', aliases: ['patient', 'for patient'] },
      { name: 'icd10', label: 'ICD-10 Code', type: 'text', aliases: ['icd', 'icd code', 'code', 'icd10'] },
      { name: 'description', label: 'Diagnosis', type: 'text', aliases: ['diagnosis', 'condition', 'problem', 'name'], required: true },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Chronic', 'Resolved', 'Inactive'] },
      { name: 'severity', label: 'Severity', type: 'select', options: ['Mild', 'Moderate', 'Severe'], synonyms: { mild: 'Mild', moderate: 'Moderate', severe: 'Severe' } },
      { name: 'onsetDate', label: 'Onset Date', type: 'date', aliases: ['onset', 'since', 'started'] },
      { name: 'isPrimary', label: 'Primary Diagnosis', type: 'checkbox', aliases: ['primary'], normalize: yesNo },
      { name: 'notes', label: 'Clinical Notes', type: 'textarea', aliases: ['note', 'notes', 'comments'] },
    ],
  },
  {
    id: 'provider',
    title: 'Provider',
    aliases: ['provider form', 'add provider', 'new provider', 'provider'],
    pages: ['provider-list', 'provider-profile'],
    submitLabel: 'Save Provider',
    sensitiveDescription: 'Save this provider',
    fields: [
      { name: 'firstName', label: 'First Name', type: 'text', aliases: ['first'], required: true },
      { name: 'lastName', label: 'Last Name', type: 'text', aliases: ['last', 'surname'], required: true },
      { name: 'title', label: 'Title', type: 'select', options: ['MD', 'DO', 'NP', 'PA-C', 'PsyD', 'RN'], aliases: ['credential', 'designation'] },
      { name: 'specialty', label: 'Specialty', type: 'select', options: SPECIALTY_OPTIONS, aliases: ['speciality', 'specialist in'], required: true },
      { name: 'department', label: 'Department', type: 'select', options: DEPARTMENT_OPTIONS, aliases: ['dept'] },
      { name: 'licenseNumber', label: 'License Number', type: 'text', aliases: ['license', 'licence'] },
      { name: 'npi', label: 'NPI', type: 'text', aliases: ['npi number'] },
      { name: 'email', label: 'Email', type: 'text' },
      { name: 'phone', label: 'Phone', type: 'text', aliases: ['phone number', 'mobile'] },
      { name: 'locationName', label: 'Location', type: 'select', options: LOCATION_OPTIONS, aliases: ['clinic', 'site'] },
      { name: 'employmentType', label: 'Employment Type', type: 'select', options: ['Full-time', 'Part-time', 'Locum', 'Contract'], aliases: ['employment'] },
      { name: 'acceptingNewPatients', label: 'Accepting New Patients', type: 'checkbox', normalize: yesNo },
      { name: 'bio', label: 'Bio', type: 'textarea', aliases: ['biography', 'about'] },
    ],
  },
  {
    id: 'user',
    title: 'User',
    aliases: ['user form', 'add user', 'new user', 'create user', 'user'],
    pages: ['create-user', 'user-list', 'user-dashboard'],
    submitLabel: 'Create User',
    sensitiveDescription: 'Create this user account',
    fields: [
      { name: 'firstName', label: 'First Name', type: 'text', aliases: ['first'], required: true },
      { name: 'lastName', label: 'Last Name', type: 'text', aliases: ['last', 'surname'], required: true },
      { name: 'email', label: 'Email', type: 'text', required: true },
      { name: 'phone', label: 'Phone', type: 'text', aliases: ['phone number'] },
      { name: 'username', label: 'Username', type: 'text', aliases: ['login', 'user name'] },
      { name: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS, aliases: ['as', 'role of'], required: true, synonyms: { admin: 'Administrator', administrator: 'Administrator', doctor: 'Physician', physician: 'Physician', nurse: 'Nurse', receptionist: 'Receptionist', 'front desk': 'Receptionist', billing: 'Billing', pharmacist: 'Pharmacist', lab: 'Lab Technician', 'lab technician': 'Lab Technician', manager: 'Practice Manager', 'practice manager': 'Practice Manager' } },
      { name: 'department', label: 'Department', type: 'select', options: DEPARTMENT_OPTIONS },
      { name: 'locationName', label: 'Location', type: 'select', options: LOCATION_OPTIONS, aliases: ['clinic', 'site'] },
      { name: 'mfaEnabled', label: 'Require MFA', type: 'checkbox', aliases: ['mfa', 'two factor', '2fa'], normalize: yesNo },
      { name: 'sendInvite', label: 'Send Invitation Email', type: 'checkbox', aliases: ['invite'], normalize: yesNo },
    ],
  },
  {
    id: 'lab-order',
    title: 'Lab Order',
    aliases: ['lab order form', 'order lab', 'new lab order', 'lab order', 'order labs'],
    pages: ['lab-orders', 'consultation'],
    submitLabel: 'Place Order',
    sensitiveDescription: 'Place this lab order',
    fields: [
      { name: 'patientName', label: 'Patient', type: 'text', aliases: ['patient', 'for patient'], required: true },
      { name: 'testName', label: 'Test', type: 'select', options: ['Complete Blood Count', 'Basic Metabolic Panel', 'Lipid Panel', 'HbA1c', 'TSH', 'Urinalysis', 'Liver Function Tests', 'Vitamin D, 25-OH', 'PT/INR', 'Urine Culture', 'Troponin I', 'Ferritin'], aliases: ['test', 'lab test', 'panel'], required: true, synonyms: { cbc: 'Complete Blood Count', 'blood count': 'Complete Blood Count', bmp: 'Basic Metabolic Panel', lipids: 'Lipid Panel', 'lipid panel': 'Lipid Panel', a1c: 'HbA1c', hba1c: 'HbA1c', tsh: 'TSH', thyroid: 'TSH', urinalysis: 'Urinalysis', lft: 'Liver Function Tests', 'liver function': 'Liver Function Tests', 'vitamin d': 'Vitamin D, 25-OH', inr: 'PT/INR', troponin: 'Troponin I', ferritin: 'Ferritin' } },
      { name: 'priority', label: 'Priority', type: 'select', options: ['Routine', 'Urgent', 'STAT'], synonyms: { routine: 'Routine', urgent: 'Urgent', stat: 'STAT', emergency: 'STAT' } },
      { name: 'specimen', label: 'Specimen', type: 'select', options: ['Whole blood', 'Serum', 'Plasma', 'Urine', 'Swab'] },
      { name: 'lab', label: 'Laboratory', type: 'select', options: ['Quest Diagnostics', 'LabCorp', 'In-house Lab'], aliases: ['laboratory', 'send to'] },
      { name: 'fasting', label: 'Fasting Required', type: 'checkbox', aliases: ['fasting'], normalize: yesNo },
      { name: 'clinicalNotes', label: 'Clinical Notes', type: 'textarea', aliases: ['notes', 'indication', 'reason'] },
    ],
  },
  {
    id: 'referral',
    title: 'Referral',
    aliases: ['referral form', 'new referral', 'refer', 'referral'],
    pages: ['referrals', 'consultation'],
    submitLabel: 'Send Referral',
    sensitiveDescription: 'Send this referral',
    fields: [
      { name: 'patientName', label: 'Patient', type: 'text', aliases: ['patient'], required: true },
      { name: 'specialty', label: 'Specialty', type: 'select', options: SPECIALTY_OPTIONS, aliases: ['refer to', 'speciality'], required: true },
      { name: 'referredTo', label: 'Referred To', type: 'text', aliases: ['to', 'specialist', 'doctor'] },
      { name: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS, synonyms: { routine: 'Routine', urgent: 'Urgent', emergency: 'Emergency' } },
      { name: 'reason', label: 'Reason', type: 'textarea', aliases: ['because', 'for', 'reason for referral'], required: true },
      { name: 'insuranceAuth', label: 'Insurance Authorization #', type: 'text', aliases: ['authorization', 'auth number'] },
    ],
  },
  {
    id: 'shift',
    title: 'Shift',
    aliases: ['shift form', 'add shift', 'new shift', 'shift'],
    pages: ['shift-management', 'roster-calendar', 'create-roster', 'roster-dashboard'],
    submitLabel: 'Save Shift',
    sensitiveDescription: 'Save this shift to the roster',
    fields: [
      { name: 'providerName', label: 'Provider', type: 'select', aliases: ['doctor', 'staff', 'for'], required: true },
      { name: 'date', label: 'Date', type: 'date', aliases: ['on'], required: true },
      { name: 'type', label: 'Shift Type', type: 'select', options: ['Morning', 'Afternoon', 'Evening', 'Night', 'On Call'], synonyms: { morning: 'Morning', am: 'Morning', afternoon: 'Afternoon', evening: 'Evening', pm: 'Evening', night: 'Night', overnight: 'Night', 'on call': 'On Call', oncall: 'On Call' }, required: true },
      { name: 'startTime', label: 'Start Time', type: 'time', aliases: ['from', 'starts'] },
      { name: 'endTime', label: 'End Time', type: 'time', aliases: ['to', 'until', 'ends'] },
      { name: 'locationName', label: 'Location', type: 'select', options: LOCATION_OPTIONS, aliases: ['clinic', 'site'] },
      { name: 'department', label: 'Department', type: 'select', options: DEPARTMENT_OPTIONS },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    id: 'leave',
    title: 'Leave Request',
    aliases: ['leave form', 'request leave', 'new leave request', 'leave request', 'time off request'],
    pages: ['leave-management'],
    submitLabel: 'Submit Request',
    sensitiveDescription: 'Submit this leave request',
    fields: [
      { name: 'providerName', label: 'Staff Member', type: 'select', aliases: ['provider', 'for', 'doctor'], required: true },
      { name: 'type', label: 'Leave Type', type: 'select', options: ['Annual', 'Sick', 'Conference', 'Parental', 'Unpaid', 'Study'], synonyms: { annual: 'Annual', vacation: 'Annual', holiday: 'Annual', sick: 'Sick', illness: 'Sick', conference: 'Conference', parental: 'Parental', maternity: 'Parental', paternity: 'Parental', unpaid: 'Unpaid', study: 'Study' }, required: true },
      { name: 'startDate', label: 'Start Date', type: 'date', aliases: ['from', 'starting'], required: true },
      { name: 'endDate', label: 'End Date', type: 'date', aliases: ['to', 'until'], required: true },
      { name: 'reason', label: 'Reason', type: 'textarea', aliases: ['because'] },
    ],
  },
];

const formById = new Map(forms.map((f) => [f.id, f]));

const norm = (s: string) => s.toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

export const FieldRegistry = {
  forms: () => forms,
  getForm: (id: string) => formById.get(id),
  formsForPage: (pageId: string | null) => (pageId ? forms.filter((f) => f.pages.includes(pageId)) : []),

  /** Resolve a spoken form name ("medication form", "prescription") to a form id. */
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
