/**
 * Field definitions for every form the application has: one per entity
 * (patient, medication, diagnosis, task, recall, appointment).
 *
 * This is the single source of truth for a form's fields. The form components
 * render from it, validation reads `required` from it, and the assistant's tool
 * schemas are generated from it — field names, types, the allowed options of
 * every select and the `hint` on free-text fields. Nothing about the forms is
 * restated anywhere else.
 */
import type { RecordKind } from '@/types/records';

export type FieldType = 'text' | 'textarea' | 'select' | 'date' | 'time' | 'number' | 'checkbox';

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  /** The fixed choices of a select. */
  options?: string[];
  /** A select whose choices are live data rather than a fixed list. */
  optionsFrom?: 'providers';
  /** Format guidance for free-text values, given to the model with the tool schema. */
  hint?: string;
  required?: boolean;
  /** Presentation formatting applied to a value before it is set (e.g. capitalising a name). */
  normalize?: (raw: string) => string;
  /**
   * The names the app already holds for this kind of record are the likely values: a close
   * misspelling from speech recognition ("metforman") is matched to one of them.
   */
  knownFrom?: RecordKind;
}

export interface FormDefinition {
  id: string;
  title: string;
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

/** "amoxicillin" -> "Amoxicillin": names are displayed capitalised whoever typed them. */
export const normalizeName = (raw: string): string => raw.trim().replace(/(^|\s)([a-z])/g, (_, sp: string, c: string) => sp + c.toUpperCase());

export const forms: FormDefinition[] = [
  {
    id: 'patient',
    title: 'Patient',
    submitLabel: 'Save Patient',
    sensitiveDescription: 'Save this patient record',
    fields: [
      { name: 'firstName', label: 'First Name', type: 'text', required: true, normalize: normalizeName },
      { name: 'lastName', label: 'Last Name', type: 'text', required: true, normalize: normalizeName },
      { name: 'dateOfBirth', label: 'Date of Birth', type: 'date', required: true },
      { name: 'age', label: 'Age', type: 'number', hint: 'Age in years; an approximate date of birth is derived from it' },
      { name: 'gender', label: 'Gender', type: 'select', options: GENDER_OPTIONS, required: true },
      { name: 'bloodGroup', label: 'Blood Group', type: 'select', options: BLOOD_GROUP_OPTIONS },
      { name: 'maritalStatus', label: 'Marital Status', type: 'select', options: MARITAL_OPTIONS },
      { name: 'language', label: 'Preferred Language', type: 'select', options: LANGUAGE_OPTIONS },
      { name: 'occupation', label: 'Occupation', type: 'text' },
      { name: 'phone', label: 'Phone', type: 'text', required: true, hint: 'Digits exactly as spoken' },
      { name: 'email', label: 'Email', type: 'text' },
      { name: 'addressLine1', label: 'Address', type: 'text', normalize: normalizeName },
      { name: 'city', label: 'City', type: 'text', normalize: normalizeName },
      { name: 'state', label: 'State', type: 'text', normalize: normalizeName },
      { name: 'postalCode', label: 'Postal Code', type: 'text' },
      { name: 'insuranceProvider', label: 'Insurance Provider', type: 'select', options: INSURER_OPTIONS },
      { name: 'policyNumber', label: 'Policy Number', type: 'text' },
      { name: 'primaryProviderName', label: 'Primary Provider', type: 'select', optionsFrom: 'providers' },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive', 'Deceased', 'Pending'] },
      { name: 'emergencyContactName', label: 'Emergency Contact Name', type: 'text', normalize: normalizeName },
      { name: 'emergencyContactPhone', label: 'Emergency Contact Phone', type: 'text' },
      { name: 'emergencyContactRelation', label: 'Relationship', type: 'select', options: ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Other'] },
    ],
  },
  {
    id: 'medication',
    title: 'Medication',
    submitLabel: 'Save Medication',
    sensitiveDescription: 'Save this medication to the patient record',
    fields: [
      { name: 'medicationName', label: 'Medication Name', type: 'text', required: true, normalize: normalizeName, knownFrom: 'medication', hint: "The drug the provider named, e.g. 'Metformin'" },
      { name: 'dosage', label: 'Dosage', type: 'text', required: true, hint: "Strength with its unit, e.g. '500 mg', '10 ml', '2 puffs'" },
      { name: 'route', label: 'Route', type: 'select', options: ROUTE_OPTIONS },
      { name: 'frequency', label: 'Frequency', type: 'select', options: FREQUENCY_OPTIONS, required: true, hint: 'How many times a day: Once daily = 1, Twice daily = 2, Three times daily = 3, Four times daily = 4' },
      { name: 'duration', label: 'Duration', type: 'text', hint: "How long to take it, e.g. '7 days', '3 months'" },
      { name: 'startDate', label: 'Start Date', type: 'date' },
      { name: 'endDate', label: 'End Date', type: 'date' },
      { name: 'indication', label: 'Indication', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', options: MEDICATION_STATUS_OPTIONS },
      { name: 'prescribedBy', label: 'Prescribed By', type: 'select', optionsFrom: 'providers' },
      { name: 'refills', label: 'Refills', type: 'number' },
      { name: 'isPRN', label: 'As Needed (PRN)', type: 'checkbox' },
      { name: 'instructions', label: 'Instructions', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    id: 'diagnosis',
    title: 'Diagnosis',
    submitLabel: 'Save Diagnosis',
    sensitiveDescription: 'Add this diagnosis to the problem list',
    fields: [
      { name: 'description', label: 'Diagnosis', type: 'text', required: true, normalize: normalizeName, knownFrom: 'diagnosis' },
      { name: 'icd10', label: 'ICD-10 Code', type: 'text', hint: "Only when the clinician says the code, e.g. 'I10'" },
      { name: 'status', label: 'Status', type: 'select', options: DIAGNOSIS_STATUS_OPTIONS },
      { name: 'severity', label: 'Severity', type: 'select', options: SEVERITY_OPTIONS },
      { name: 'onsetDate', label: 'Onset Date', type: 'date' },
      { name: 'diagnosedBy', label: 'Diagnosed By', type: 'select', optionsFrom: 'providers' },
      { name: 'notes', label: 'Clinical Notes', type: 'textarea' },
    ],
  },
  {
    id: 'task',
    title: 'Task',
    submitLabel: 'Save Task',
    sensitiveDescription: 'Save this task for the patient',
    fields: [
      { name: 'title', label: 'Task', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'select', options: TASK_CATEGORY_OPTIONS },
      { name: 'assignedTo', label: 'Assigned To', type: 'select', optionsFrom: 'providers' },
      { name: 'dueDate', label: 'Due Date', type: 'date', required: true },
      { name: 'priority', label: 'Priority', type: 'select', options: TASK_PRIORITY_OPTIONS },
      { name: 'status', label: 'Status', type: 'select', options: TASK_STATUS_OPTIONS },
      { name: 'description', label: 'Details', type: 'textarea' },
    ],
  },
  {
    id: 'recall',
    title: 'Recall',
    submitLabel: 'Save Recall',
    sensitiveDescription: 'Add this recall to the patient record',
    fields: [
      { name: 'reason', label: 'Reason', type: 'text', required: true },
      { name: 'type', label: 'Recall Type', type: 'select', options: RECALL_TYPE_OPTIONS },
      { name: 'dueDate', label: 'Due Date', type: 'date', required: true },
      { name: 'priority', label: 'Priority', type: 'select', options: ['Normal', 'High'] },
      { name: 'status', label: 'Status', type: 'select', options: RECALL_STATUS_OPTIONS },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    id: 'appointment',
    title: 'Appointment',
    submitLabel: 'Book Appointment',
    sensitiveDescription: 'Book this appointment',
    fields: [
      { name: 'providerName', label: 'Provider', type: 'select', required: true, optionsFrom: 'providers', hint: 'Defaults to the signed-in provider when not said' },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'startTime', label: 'Time', type: 'time', required: true },
      { name: 'durationMinutes', label: 'Duration (minutes)', type: 'number', hint: 'Defaults to 30' },
      { name: 'type', label: 'Appointment Type', type: 'select', options: APPOINTMENT_TYPE_OPTIONS },
      { name: 'reason', label: 'Reason for Visit', type: 'text', required: true },
      { name: 'locationName', label: 'Location', type: 'select', options: LOCATION_OPTIONS },
      { name: 'status', label: 'Status', type: 'select', options: APPOINTMENT_STATUS_OPTIONS },
      { name: 'priority', label: 'Priority', type: 'select', options: PRIORITY_OPTIONS },
      { name: 'isTelehealth', label: 'Telehealth Visit', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
];


const formById = new Map(forms.map((f) => [f.id, f]));

export type FieldScalar = string | number | boolean;
export type CoerceResult = { ok: true; value: FieldScalar } | { ok: false; error: string };

export const FieldRegistry = {
  forms: () => forms,
  getForm: (id: string) => formById.get(id),

  /** A field of a form by its exact name. */
  resolveField(formId: string, fieldName: string): FieldDefinition | undefined {
    return formById.get(formId)?.fields.find((f) => f.name === fieldName);
  },

  /**
   * Coerce a value to what the field's control holds, or explain why it cannot be.
   * Selects take one of their options (case-insensitive), dates YYYY-MM-DD, times HH:mm.
   */
  coerceValue(field: FieldDefinition, raw: FieldScalar): CoerceResult {
    switch (field.type) {
      case 'checkbox':
        return typeof raw === 'boolean' ? { ok: true, value: raw } : { ok: false, error: `${field.name} must be true or false` };
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
        return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `${field.name} must be a number` };
      }
      case 'date': {
        const v = String(raw).trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(v) ? { ok: true, value: v } : { ok: false, error: `${field.name} must be a date in YYYY-MM-DD format` };
      }
      case 'time': {
        const v = String(raw).trim();
        return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? { ok: true, value: v } : { ok: false, error: `${field.name} must be a 24-hour time in HH:mm format` };
      }
      case 'select': {
        const v = String(raw).trim();
        if (!field.options) return { ok: true, value: v };
        const hit = field.options.find((o) => o.toLowerCase() === v.toLowerCase());
        return hit ? { ok: true, value: hit } : { ok: false, error: `${field.name} must be one of: ${field.options.join(', ')}` };
      }
      default: {
        const v = String(raw).trim();
        return { ok: true, value: field.normalize ? field.normalize(v) : v };
      }
    }
  },

  missingRequired(formId: string, values: Record<string, unknown>): FieldDefinition[] {
    const form = formById.get(formId);
    if (!form) return [];
    return form.fields.filter((f) => f.required && (values[f.name] === undefined || values[f.name] === '' || values[f.name] === null));
  },
};
