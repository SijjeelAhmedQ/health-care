/** Shared healthcare domain model used by the mock services and (later) the real API. */

export type ID = string;

export type Gender = 'Male' | 'Female' | 'Other' | 'Unknown';
export type PatientStatus = 'Active' | 'Inactive' | 'Deceased' | 'Pending';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'Unknown';

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface Patient {
  id: ID;
  mrn: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string; // ISO date
  age: number;
  gender: Gender;
  bloodGroup: BloodGroup;
  phone: string;
  email: string;
  address: Address;
  maritalStatus: 'Single' | 'Married' | 'Divorced' | 'Widowed' | 'Unknown';
  language: string;
  occupation?: string;
  insuranceProvider: string;
  insurancePlan: string;
  policyNumber: string;
  primaryProviderId: ID;
  primaryProviderName: string;
  status: PatientStatus;
  lastVisit?: string;
  nextAppointment?: string;
  registeredAt: string;
  tags: string[];
  riskLevel: 'Low' | 'Medium' | 'High';
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
}

export interface Allergy {
  id: ID;
  patientId: ID;
  allergen: string;
  type: 'Drug' | 'Food' | 'Environmental' | 'Other';
  reaction: string;
  severity: 'Mild' | 'Moderate' | 'Severe' | 'Life-threatening';
  status: 'Active' | 'Inactive' | 'Resolved';
  onsetDate?: string;
  recordedBy: string;
  notes?: string;
}

export type MedicationStatus = 'Active' | 'Completed' | 'Discontinued' | 'On Hold';

export interface Medication {
  id: ID;
  patientId: ID;
  patientName: string;
  name: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  startDate: string;
  endDate?: string;
  prescribedBy: string;
  indication?: string;
  instructions?: string;
  notes?: string;
  refills?: number;
  status: MedicationStatus;
  isPRN?: boolean;
}

export interface Prescription {
  id: ID;
  rxNumber: string;
  patientId: ID;
  patientName: string;
  providerId: ID;
  providerName: string;
  medicationName: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: number;
  refills: number;
  pharmacy: string;
  status: 'Draft' | 'Sent' | 'Filled' | 'Cancelled' | 'Expired';
  issuedAt: string;
  substitutionAllowed: boolean;
  instructions?: string;
}

export type DiagnosisStatus = 'Active' | 'Resolved' | 'Chronic' | 'Inactive';

/** A diagnosis on the patient's problem list. */
export interface Problem {
  id: ID;
  patientId: ID;
  patientName?: string;
  icd10: string;
  description: string;
  status: DiagnosisStatus;
  onsetDate: string;
  resolvedDate?: string;
  severity: 'Mild' | 'Moderate' | 'Severe';
  diagnosedBy: string;
  notes?: string;
}

/** The Diagnosis module works on the problem list; the two names are interchangeable. */
export type Diagnosis = Problem;

export type TaskStatus = 'Open' | 'In Progress' | 'Completed' | 'Cancelled';
export type TaskPriority = 'Low' | 'Normal' | 'High' | 'Urgent';
export type TaskCategory =
  | 'Follow-up'
  | 'Monitoring'
  | 'Referral'
  | 'Documentation'
  | 'Medication Review'
  | 'Lab Follow-up'
  | 'Patient Education'
  | 'Other';

/** A piece of work a staff member owes this patient. */
export interface Task {
  id: ID;
  patientId: ID;
  patientName: string;
  title: string;
  category: TaskCategory;
  description?: string;
  assignedTo: string;
  dueDate: string; // YYYY-MM-DD
  priority: TaskPriority;
  status: TaskStatus;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface Immunization {
  id: ID;
  patientId: ID;
  vaccine: string;
  doseNumber: number;
  dateAdministered: string;
  administeredBy: string;
  lotNumber: string;
  site: string;
  route: string;
  manufacturer: string;
  nextDueDate?: string;
  status: 'Completed' | 'Due' | 'Overdue' | 'Declined';
}

export interface ClinicalDocument {
  id: ID;
  patientId?: ID;
  patientName?: string;
  title: string;
  category: 'Lab Result' | 'Imaging' | 'Referral Letter' | 'Discharge Summary' | 'Consent' | 'Insurance' | 'Other';
  fileType: 'PDF' | 'DOCX' | 'JPG' | 'PNG' | 'DICOM';
  sizeKb: number;
  uploadedBy: string;
  uploadedAt: string;
  status: 'Final' | 'Draft' | 'Pending Review' | 'Signed';
  tags: string[];
}

export interface ClinicalNote {
  id: ID;
  patientId: ID;
  patientName: string;
  type: 'Progress' | 'SOAP' | 'Nursing' | 'Procedure' | 'Telephone' | 'Discharge';
  title: string;
  author: string;
  createdAt: string;
  status: 'Draft' | 'Signed' | 'Amended';
  body: string;
}

export interface InsurancePolicy {
  id: ID;
  patientId: ID;
  priority: 'Primary' | 'Secondary' | 'Tertiary';
  provider: string;
  plan: string;
  policyNumber: string;
  groupNumber: string;
  subscriberName: string;
  relationship: 'Self' | 'Spouse' | 'Child' | 'Other';
  effectiveDate: string;
  expiryDate: string;
  copay: number;
  deductible: number;
  status: 'Active' | 'Expired' | 'Pending Verification';
  verifiedAt?: string;
}

export interface PatientContact {
  id: ID;
  patientId: ID;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  isEmergency: boolean;
  isGuardian: boolean;
  preferredContact: 'Phone' | 'Email' | 'SMS';
  notes?: string;
}

export interface Communication {
  id: ID;
  patientId: ID;
  channel: 'Phone' | 'Email' | 'SMS' | 'Portal' | 'Letter' | 'In Person';
  direction: 'Inbound' | 'Outbound';
  subject: string;
  summary: string;
  staff: string;
  timestamp: string;
  status: 'Completed' | 'Pending' | 'Failed' | 'Scheduled';
}

export interface Vitals {
  id: ID;
  patientId: ID;
  recordedAt: string;
  systolic: number;
  diastolic: number;
  heartRate: number;
  respiratoryRate: number;
  temperature: number;
  spo2: number;
  weightKg: number;
  heightCm: number;
  bmi: number;
  painScore: number;
}

export type ProviderStatus = 'Active' | 'On Leave' | 'Inactive';

export interface Provider {
  id: ID;
  code: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title: string;
  specialty: string;
  department: string;
  licenseNumber: string;
  licenseState: string;
  licenseExpiry: string;
  npi: string;
  email: string;
  phone: string;
  status: ProviderStatus;
  locationId: ID;
  locationName: string;
  employmentType: 'Full-time' | 'Part-time' | 'Locum' | 'Contract';
  yearsExperience: number;
  languages: string[];
  acceptingNewPatients: boolean;
  rating: number;
  patientsToday: number;
  utilization: number;
  bio?: string;
}

export interface Credential {
  id: ID;
  providerId: ID;
  providerName: string;
  type: 'Medical License' | 'Board Certification' | 'DEA Registration' | 'BLS/ACLS' | 'Malpractice Insurance' | 'Fellowship';
  name: string;
  issuer: string;
  number: string;
  issuedDate: string;
  expiryDate: string;
  status: 'Valid' | 'Expiring Soon' | 'Expired' | 'Pending';
  verifiedBy?: string;
}

export type AppointmentStatus =
  | 'Scheduled'
  | 'Confirmed'
  | 'Checked In'
  | 'In Progress'
  | 'Completed'
  | 'Cancelled'
  | 'No Show'
  | 'Rescheduled';

export type AppointmentType =
  | 'New Patient'
  | 'Follow-up'
  | 'Consultation'
  | 'Procedure'
  | 'Telehealth'
  | 'Annual Physical'
  | 'Urgent'
  | 'Lab Visit'
  | 'Vaccination';

export interface Appointment {
  id: ID;
  code: string;
  patientId: ID;
  patientName: string;
  patientMrn: string;
  providerId: ID;
  providerName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;
  durationMinutes: number;
  type: AppointmentType;
  locationId: ID;
  locationName: string;
  room?: string;
  status: AppointmentStatus;
  reason: string;
  notes?: string;
  priority: 'Routine' | 'Urgent' | 'Emergency';
  createdAt: string;
  checkedInAt?: string;
  isTelehealth: boolean;
  reminderSent: boolean;
}

export interface AppointmentTypeDef {
  id: ID;
  name: string;
  code: string;
  durationMinutes: number;
  color: string;
  department: string;
  requiresReferral: boolean;
  allowOnlineBooking: boolean;
  isActive: boolean;
  bufferMinutes: number;
  description: string;
}

export interface Consultation {
  id: ID;
  patientId: ID;
  patientName: string;
  providerId: ID;
  providerName: string;
  appointmentId?: ID;
  date: string;
  chiefComplaint: string;
  status: 'In Progress' | 'Completed' | 'Pending Sign-off' | 'Cancelled';
  diagnosis?: string;
  durationMinutes?: number;
}

export interface LabOrder {
  id: ID;
  orderNumber: string;
  patientId: ID;
  patientName: string;
  providerName: string;
  testName: string;
  panel: string;
  priority: 'Routine' | 'STAT' | 'Urgent';
  status: 'Ordered' | 'Collected' | 'In Progress' | 'Resulted' | 'Cancelled';
  orderedAt: string;
  resultedAt?: string;
  specimen: string;
  lab: string;
  abnormal?: boolean;
  fasting: boolean;
  /** Result value as reported, e.g. "7.2 %" or "Normal". Present once status is Resulted. */
  result?: string;
  referenceRange?: string;
  resultNotes?: string;
}

export type RecallType = 'Follow-up' | 'Screening' | 'Vaccination' | 'Lab Test' | 'Medication Review' | 'Chronic Care Review' | 'Other';
export type RecallStatus = 'Due' | 'Scheduled' | 'Completed' | 'Cancelled';

/** A reminder that the patient should be brought back (follow-up, screening, repeat labs…). */
export interface Recall {
  id: ID;
  patientId: ID;
  patientName: string;
  type: RecallType;
  reason: string;
  dueDate: string; // YYYY-MM-DD
  priority: 'Normal' | 'High';
  status: RecallStatus;
  createdBy: string;
  createdAt: string;
  notes?: string;
  appointmentId?: ID;
}

export interface ImagingOrder {
  id: ID;
  orderNumber: string;
  patientId: ID;
  patientName: string;
  providerName: string;
  modality: 'X-Ray' | 'CT' | 'MRI' | 'Ultrasound' | 'Mammography' | 'PET';
  bodyPart: string;
  priority: 'Routine' | 'STAT' | 'Urgent';
  status: 'Ordered' | 'Scheduled' | 'Performed' | 'Reported' | 'Cancelled';
  orderedAt: string;
  scheduledFor?: string;
  facility: string;
  contrast: boolean;
  clinicalIndication: string;
}

export interface Referral {
  id: ID;
  referralNumber: string;
  patientId: ID;
  patientName: string;
  referringProvider: string;
  referredTo: string;
  specialty: string;
  reason: string;
  priority: 'Routine' | 'Urgent' | 'Emergency';
  status: 'Pending' | 'Sent' | 'Accepted' | 'Scheduled' | 'Completed' | 'Declined';
  createdAt: string;
  expiresAt: string;
  insuranceAuth?: string;
}

export type ShiftType = 'Morning' | 'Afternoon' | 'Evening' | 'Night' | 'On Call';

export interface Shift {
  id: ID;
  providerId: ID;
  providerName: string;
  date: string;
  startTime: string;
  endTime: string;
  type: ShiftType;
  locationName: string;
  department: string;
  status: 'Scheduled' | 'Confirmed' | 'Swapped' | 'Cancelled' | 'Completed';
  notes?: string;
}

export interface Roster {
  id: ID;
  name: string;
  department: string;
  locationName: string;
  startDate: string;
  endDate: string;
  status: 'Draft' | 'Published' | 'Archived';
  shiftCount: number;
  providerCount: number;
  createdBy: string;
  createdAt: string;
}

export interface LeaveRequest {
  id: ID;
  providerId: ID;
  providerName: string;
  type: 'Annual' | 'Sick' | 'Conference' | 'Parental' | 'Unpaid' | 'Study';
  startDate: string;
  endDate: string;
  days: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  reason: string;
  approver?: string;
  requestedAt: string;
}

export interface AvailabilitySlot {
  id: ID;
  providerId: ID;
  providerName: string;
  dayOfWeek: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  startTime: string;
  endTime: string;
  locationName: string;
  slotMinutes: number;
  type: 'In Person' | 'Telehealth' | 'Both';
  isActive: boolean;
}

export interface Location {
  id: ID;
  name: string;
  code: string;
  type: 'Main Clinic' | 'Satellite' | 'Hospital' | 'Telehealth Hub';
  address: Address;
  phone: string;
  email: string;
  timezone: string;
  openingHours: string;
  isActive: boolean;
  rooms: number;
  providers: number;
  manager: string;
}

export interface Department {
  id: ID;
  name: string;
  code: string;
  head: string;
  locationName: string;
  providers: number;
  staff: number;
  extension: string;
  isActive: boolean;
  description: string;
}

export interface Specialty {
  id: ID;
  name: string;
  code: string;
  category: 'Primary Care' | 'Surgical' | 'Medical' | 'Diagnostic' | 'Allied Health';
  providers: number;
  defaultAppointmentMinutes: number;
  isActive: boolean;
}

export interface ServiceItem {
  id: ID;
  name: string;
  code: string;
  cptCode: string;
  category: string;
  department: string;
  durationMinutes: number;
  price: number;
  taxable: boolean;
  requiresAuth: boolean;
  isActive: boolean;
}

export interface Room {
  id: ID;
  name: string;
  code: string;
  locationName: string;
  floor: string;
  type: 'Exam Room' | 'Procedure Room' | 'Consultation' | 'Lab' | 'Imaging' | 'Waiting Area' | 'Office';
  capacity: number;
  equipment: string[];
  status: 'Available' | 'Occupied' | 'Maintenance' | 'Cleaning';
}

export interface Resource {
  id: ID;
  name: string;
  type: 'Equipment' | 'Vehicle' | 'Device' | 'Software License';
  serialNumber: string;
  locationName: string;
  assignedTo?: string;
  status: 'Available' | 'In Use' | 'Maintenance' | 'Retired';
  purchaseDate: string;
  warrantyUntil: string;
  lastService: string;
  nextService: string;
}

export type UserRoleName = 'Administrator' | 'Physician' | 'Nurse' | 'Receptionist' | 'Billing' | 'Pharmacist' | 'Lab Technician' | 'Practice Manager';

export interface User {
  id: ID;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRoleName;
  department: string;
  locationName: string;
  status: 'Active' | 'Inactive' | 'Locked' | 'Pending Invite';
  lastLogin?: string;
  createdAt: string;
  mfaEnabled: boolean;
  providerId?: ID;
  avatarColor: string;
}

export interface Role {
  id: ID;
  name: UserRoleName | string;
  description: string;
  users: number;
  permissions: string[];
  isSystem: boolean;
  updatedAt: string;
}

export interface Permission {
  id: ID;
  key: string;
  module: string;
  name: string;
  description: string;
  sensitive: boolean;
}

export interface AuditLog {
  id: ID;
  timestamp: string;
  user: string;
  action: 'Create' | 'Update' | 'Delete' | 'View' | 'Login' | 'Logout' | 'Export' | 'Print' | 'Failed Login';
  entity: string;
  entityId: string;
  ipAddress: string;
  outcome: 'Success' | 'Failure' | 'Warning';
  details: string;
}

export interface ActivityItem {
  id: ID;
  type: 'appointment' | 'patient' | 'medication' | 'lab' | 'system' | 'note';
  title: string;
  description: string;
  timestamp: string;
  actor: string;
}

export interface AlertItem {
  id: ID;
  severity: 'info' | 'warning' | 'error' | 'success';
  title: string;
  description: string;
  timestamp: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListQuery {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  filters?: Record<string, string | string[] | undefined>;
}
