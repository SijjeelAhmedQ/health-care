import dayjs from 'dayjs';
import type {
  Allergy,
  Appointment,
  AppointmentStatus,
  AppointmentType,
  AppointmentTypeDef,
  AuditLog,
  AvailabilitySlot,
  ClinicalDocument,
  ClinicalNote,
  Communication,
  Consultation,
  Credential,
  Department,
  ImagingOrder,
  Immunization,
  InsurancePolicy,
  LabOrder,
  LeaveRequest,
  Location,
  Medication,
  Patient,
  PatientContact,
  Permission,
  Prescription,
  Problem,
  Provider,
  Referral,
  Resource,
  Role,
  Room,
  Roster,
  ServiceItem,
  Shift,
  Specialty,
  User,
  Vitals,
} from '@/types/domain';
import { createRng, pad } from './random';

const rng = createRng(20260919);
const TODAY = dayjs('2026-09-19');

const firstNamesM = ['Ahmed', 'John', 'Michael', 'Omar', 'David', 'Ali', 'James', 'Hassan', 'Daniel', 'Yusuf', 'Robert', 'Bilal', 'William', 'Imran', 'Thomas', 'Zain', 'Carlos', 'Noah', 'Ethan', 'Samuel'];
const firstNamesF = ['Sarah', 'Fatima', 'Emily', 'Ayesha', 'Jessica', 'Maryam', 'Emma', 'Zainab', 'Olivia', 'Hira', 'Sophia', 'Amina', 'Isabella', 'Sana', 'Grace', 'Noor', 'Maria', 'Hannah', 'Layla', 'Chloe'];
const lastNames = ['Smith', 'Khan', 'Johnson', 'Ahmed', 'Williams', 'Malik', 'Brown', 'Hussain', 'Jones', 'Qureshi', 'Garcia', 'Raza', 'Miller', 'Siddiqui', 'Davis', 'Shah', 'Rodriguez', 'Iqbal', 'Martinez', 'Farooq', 'Anderson', 'Butt', 'Taylor', 'Chaudhry', 'Wilson', 'Nawaz'];
const cities = [
  ['Austin', 'TX', '787'], ['Houston', 'TX', '770'], ['Dallas', 'TX', '752'], ['Chicago', 'IL', '606'], ['Seattle', 'WA', '981'], ['Denver', 'CO', '802'], ['Phoenix', 'AZ', '850'], ['Boston', 'MA', '021'],
];
const streets = ['Maple Ave', 'Oak Street', 'Cedar Lane', 'Riverside Dr', 'Hillcrest Rd', 'Park Blvd', 'Lakeview Ct', 'Sunset Way', 'Elm Street', 'Willow Rd'];
const insurers = ['Blue Cross Blue Shield', 'Aetna', 'UnitedHealthcare', 'Cigna', 'Humana', 'Kaiser Permanente', 'Medicare', 'Medicaid'];
const plans = ['PPO Gold', 'HMO Silver', 'PPO Platinum', 'EPO Standard', 'HDHP Bronze', 'Medicare Advantage'];
const specialties = ['Family Medicine', 'Internal Medicine', 'Cardiology', 'Pediatrics', 'Dermatology', 'Orthopedics', 'Endocrinology', 'Neurology', 'Psychiatry', 'Obstetrics & Gynecology', 'Pulmonology', 'Gastroenterology'];
const departments = ['Primary Care', 'Cardiology', 'Pediatrics', 'Dermatology', 'Orthopedics', 'Endocrinology', 'Neurology', 'Behavioral Health', 'Women\'s Health', 'Diagnostics'];

// ---------- Locations ----------
export const locations: Location[] = [
  { id: 'loc-1', name: 'Riverside Medical Center', code: 'RMC', type: 'Main Clinic', address: { line1: '1200 Riverside Dr', city: 'Austin', state: 'TX', postalCode: '78701', country: 'USA' }, phone: '(512) 555-0100', email: 'riverside@careflow.health', timezone: 'America/Chicago', openingHours: 'Mon–Fri 7:30–18:00, Sat 9:00–13:00', isActive: true, rooms: 18, providers: 9, manager: 'Linda Park' },
  { id: 'loc-2', name: 'Northgate Family Clinic', code: 'NFC', type: 'Satellite', address: { line1: '455 Northgate Blvd', city: 'Austin', state: 'TX', postalCode: '78753', country: 'USA' }, phone: '(512) 555-0140', email: 'northgate@careflow.health', timezone: 'America/Chicago', openingHours: 'Mon–Fri 8:00–17:00', isActive: true, rooms: 8, providers: 4, manager: 'Marcus Reed' },
  { id: 'loc-3', name: 'Lakeside Specialty Center', code: 'LSC', type: 'Satellite', address: { line1: '88 Lakeside Pkwy', city: 'Round Rock', state: 'TX', postalCode: '78664', country: 'USA' }, phone: '(512) 555-0180', email: 'lakeside@careflow.health', timezone: 'America/Chicago', openingHours: 'Mon–Thu 8:00–18:00, Fri 8:00–15:00', isActive: true, rooms: 12, providers: 5, manager: 'Priya Natarajan' },
  { id: 'loc-4', name: 'CareFlow Virtual Care', code: 'CVC', type: 'Telehealth Hub', address: { line1: '1200 Riverside Dr, Suite 400', city: 'Austin', state: 'TX', postalCode: '78701', country: 'USA' }, phone: '(512) 555-0199', email: 'virtual@careflow.health', timezone: 'America/Chicago', openingHours: 'Daily 7:00–21:00', isActive: true, rooms: 0, providers: 6, manager: 'Sofia Alvarez' },
];

// ---------- Providers ----------
const providerSeeds: Array<[string, string, string, string, string]> = [
  ['Sarah', 'Ahmed', 'MD', 'Family Medicine', 'Primary Care'],
  ['James', 'Carter', 'MD', 'Internal Medicine', 'Primary Care'],
  ['Priya', 'Natarajan', 'MD', 'Cardiology', 'Cardiology'],
  ['Omar', 'Farooq', 'MD', 'Pediatrics', 'Pediatrics'],
  ['Emily', 'Chen', 'DO', 'Dermatology', 'Dermatology'],
  ['Michael', 'Torres', 'MD', 'Orthopedics', 'Orthopedics'],
  ['Ayesha', 'Malik', 'MD', 'Endocrinology', 'Endocrinology'],
  ['David', 'Okafor', 'MD', 'Neurology', 'Neurology'],
  ['Hannah', 'Lindqvist', 'PsyD', 'Psychiatry', 'Behavioral Health'],
  ['Maria', 'Gonzalez', 'MD', 'Obstetrics & Gynecology', 'Women\'s Health'],
  ['Robert', 'Kim', 'MD', 'Pulmonology', 'Primary Care'],
  ['Zainab', 'Hussain', 'NP', 'Family Medicine', 'Primary Care'],
  ['Thomas', 'Wright', 'PA-C', 'Internal Medicine', 'Primary Care'],
  ['Layla', 'Nasser', 'MD', 'Gastroenterology', 'Diagnostics'],
];

export const providers: Provider[] = providerSeeds.map(([first, last, title, specialty, department], i) => {
  const loc = locations[i % 3];
  return {
    id: `prov-${i + 1}`,
    code: `PRV-${pad(i + 1, 3)}`,
    firstName: first,
    lastName: last,
    fullName: `Dr. ${first} ${last}`,
    title,
    specialty,
    department,
    licenseNumber: `TX-${rng.int(100000, 999999)}`,
    licenseState: 'TX',
    licenseExpiry: TODAY.add(rng.int(-30, 900), 'day').format('YYYY-MM-DD'),
    npi: String(rng.int(1000000000, 1999999999)),
    email: `${first.toLowerCase()}.${last.toLowerCase()}@careflow.health`,
    phone: `(512) 555-${pad(rng.int(1000, 9999), 4)}`,
    status: i === 8 ? 'On Leave' : i === 13 ? 'Inactive' : 'Active',
    locationId: loc.id,
    locationName: loc.name,
    employmentType: rng.weighted([['Full-time', 6], ['Part-time', 2], ['Locum', 1], ['Contract', 1]]),
    yearsExperience: rng.int(3, 28),
    languages: rng.pickMany(['English', 'Spanish', 'Urdu', 'Arabic', 'Mandarin', 'Hindi', 'French'], rng.int(1, 3)),
    acceptingNewPatients: rng.bool(0.75),
    rating: rng.float(4.2, 5, 1),
    patientsToday: rng.int(4, 16),
    utilization: rng.int(58, 96),
    bio: `${title === 'NP' ? 'Nurse practitioner' : title === 'PA-C' ? 'Physician assistant' : 'Board-certified physician'} in ${specialty.toLowerCase()} with a focus on evidence-based, patient-centred care.`,
  };
});

// ---------- Patients ----------
const conditionsPool = ['Hypertension', 'Type 2 Diabetes', 'Asthma', 'Hyperlipidemia', 'GERD', 'Hypothyroidism', 'Osteoarthritis', 'Anxiety', 'Depression', 'COPD', 'CKD Stage 2', 'Migraine', 'Atrial Fibrillation', 'Allergic Rhinitis', 'Obesity'];

function makePatient(i: number): Patient {
  const gender = rng.weighted<'Male' | 'Female' | 'Other'>([['Male', 48], ['Female', 50], ['Other', 2]]);
  const firstName = gender === 'Female' ? rng.pick(firstNamesF) : rng.pick(firstNamesM);
  const lastName = rng.pick(lastNames);
  const dob = TODAY.subtract(rng.int(1, 88), 'year').subtract(rng.int(0, 364), 'day');
  const [city, state, zipPrefix] = rng.pick(cities);
  const provider = rng.pick(providers.filter((p) => p.status === 'Active'));
  const status = rng.weighted<Patient['status']>([['Active', 86], ['Inactive', 9], ['Pending', 4], ['Deceased', 1]]);
  const lastVisit = TODAY.subtract(rng.int(1, 400), 'day');
  const hasNext = rng.bool(0.55);
  return {
    id: `pat-${i + 1}`,
    mrn: `MRN-${100000 + i * 7 + rng.int(1, 6)}`,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    dateOfBirth: dob.format('YYYY-MM-DD'),
    age: TODAY.diff(dob, 'year'),
    gender,
    bloodGroup: rng.pick(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const),
    phone: `(${rng.int(200, 989)}) 555-${pad(rng.int(1000, 9999), 4)}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${rng.int(1, 99)}@example.com`,
    address: { line1: `${rng.int(10, 9999)} ${rng.pick(streets)}`, city, state, postalCode: `${zipPrefix}${pad(rng.int(0, 99), 2)}`, country: 'USA' },
    maritalStatus: rng.pick(['Single', 'Married', 'Divorced', 'Widowed'] as const),
    language: rng.weighted([['English', 70], ['Spanish', 15], ['Urdu', 8], ['Arabic', 4], ['Mandarin', 3]]),
    occupation: rng.pick(['Teacher', 'Engineer', 'Retired', 'Student', 'Nurse', 'Accountant', 'Driver', 'Designer', 'Sales', 'Homemaker']),
    insuranceProvider: rng.pick(insurers),
    insurancePlan: rng.pick(plans),
    policyNumber: `POL-${rng.int(10000000, 99999999)}`,
    primaryProviderId: provider.id,
    primaryProviderName: provider.fullName,
    status,
    lastVisit: lastVisit.format('YYYY-MM-DD'),
    nextAppointment: hasNext ? TODAY.add(rng.int(0, 45), 'day').format('YYYY-MM-DD') : undefined,
    registeredAt: TODAY.subtract(rng.int(30, 3000), 'day').format('YYYY-MM-DD'),
    tags: rng.pickMany(conditionsPool, rng.int(0, 3)),
    riskLevel: rng.weighted([['Low', 60], ['Medium', 30], ['High', 10]]),
    emergencyContactName: `${rng.pick([...firstNamesF, ...firstNamesM])} ${lastName}`,
    emergencyContactPhone: `(${rng.int(200, 989)}) 555-${pad(rng.int(1000, 9999), 4)}`,
    emergencyContactRelation: rng.pick(['Spouse', 'Parent', 'Sibling', 'Child', 'Friend']),
  };
}

export const patients: Patient[] = Array.from({ length: 96 }, (_, i) => makePatient(i));
// Guarantee the demo names used in voice examples exist.
Object.assign(patients[0], { firstName: 'John', lastName: 'Smith', fullName: 'John Smith', gender: 'Male', mrn: 'MRN-102934', status: 'Active', age: 54, dateOfBirth: '1972-03-14' });
Object.assign(patients[1], { firstName: 'Ahmed', lastName: 'Khan', fullName: 'Ahmed Khan', gender: 'Male', mrn: 'MRN-104512', status: 'Active', age: 32, dateOfBirth: '1994-07-02' });
Object.assign(patients[2], { firstName: 'Sarah', lastName: 'Johnson', fullName: 'Sarah Johnson', gender: 'Female', mrn: 'MRN-101877', status: 'Active' });
Object.assign(patients[3], { firstName: 'Fatima', lastName: 'Malik', fullName: 'Fatima Malik', gender: 'Female', mrn: 'MRN-107220', status: 'Active' });

// ---------- Appointments ----------
const apptTypes: AppointmentType[] = ['New Patient', 'Follow-up', 'Consultation', 'Procedure', 'Telehealth', 'Annual Physical', 'Urgent', 'Lab Visit', 'Vaccination'];
const reasons = ['Routine follow-up', 'Blood pressure review', 'Medication review', 'Annual wellness visit', 'Chest pain evaluation', 'Diabetes management', 'Skin lesion check', 'Knee pain', 'Headache assessment', 'Lab results review', 'Prenatal visit', 'Vaccination', 'Cough and fever', 'Back pain', 'Anxiety follow-up'];

function makeAppointment(i: number): Appointment {
  const patient = rng.pick(patients);
  const provider = rng.pick(providers.filter((p) => p.status === 'Active'));
  const dayOffset = rng.weighted([[0, 30], [1, 12], [-1, 10], [rng.int(2, 21), 25], [rng.int(-60, -2), 23]]);
  const date = TODAY.add(dayOffset, 'day');
  const hour = rng.int(8, 16);
  const minute = rng.pick([0, 15, 30, 45]);
  const duration = rng.pick([15, 20, 30, 45, 60]);
  const start = date.hour(hour).minute(minute);
  const type = rng.pick(apptTypes);
  let status: AppointmentStatus;
  if (dayOffset < 0) status = rng.weighted([['Completed', 78], ['No Show', 10], ['Cancelled', 12]]);
  else if (dayOffset === 0) status = rng.weighted([['Scheduled', 20], ['Confirmed', 25], ['Checked In', 20], ['In Progress', 10], ['Completed', 20], ['Cancelled', 5]]);
  else status = rng.weighted([['Scheduled', 55], ['Confirmed', 40], ['Rescheduled', 5]]);
  const loc = locations.find((l) => l.id === provider.locationId) ?? locations[0];
  const isTele = type === 'Telehealth';
  return {
    id: `appt-${i + 1}`,
    code: `APT-${20260000 + i + 1}`,
    patientId: patient.id,
    patientName: patient.fullName,
    patientMrn: patient.mrn,
    providerId: provider.id,
    providerName: provider.fullName,
    date: date.format('YYYY-MM-DD'),
    startTime: start.format('HH:mm'),
    endTime: start.add(duration, 'minute').format('HH:mm'),
    durationMinutes: duration,
    type,
    locationId: isTele ? 'loc-4' : loc.id,
    locationName: isTele ? 'CareFlow Virtual Care' : loc.name,
    room: isTele ? undefined : `Exam ${rng.int(1, 12)}`,
    status,
    reason: rng.pick(reasons),
    notes: rng.bool(0.3) ? 'Patient requested morning slot.' : undefined,
    priority: rng.weighted([['Routine', 85], ['Urgent', 12], ['Emergency', 3]]),
    createdAt: date.subtract(rng.int(1, 30), 'day').toISOString(),
    checkedInAt: status === 'Checked In' || status === 'In Progress' ? start.subtract(rng.int(2, 15), 'minute').toISOString() : undefined,
    isTelehealth: isTele,
    reminderSent: rng.bool(0.8),
  };
}

export const appointments: Appointment[] = Array.from({ length: 220 }, (_, i) => makeAppointment(i)).sort((a, b) =>
  `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
);
// Ensure John Smith has a 3:00 PM appointment today for the demo.
Object.assign(appointments[0], {
  patientId: patients[0].id, patientName: 'John Smith', patientMrn: patients[0].mrn, date: TODAY.format('YYYY-MM-DD'),
  startTime: '15:00', endTime: '15:30', durationMinutes: 30, status: 'Confirmed', type: 'Follow-up', providerId: providers[0].id, providerName: providers[0].fullName,
});

export const appointmentTypes: AppointmentTypeDef[] = [
  { id: 'at-1', name: 'New Patient', code: 'NEW', durationMinutes: 45, color: '#2a78d6', department: 'Primary Care', requiresReferral: false, allowOnlineBooking: true, isActive: true, bufferMinutes: 5, description: 'Initial visit for a new patient including full history.' },
  { id: 'at-2', name: 'Follow-up', code: 'FUP', durationMinutes: 20, color: '#1baf7a', department: 'All', requiresReferral: false, allowOnlineBooking: true, isActive: true, bufferMinutes: 0, description: 'Review of an existing condition or treatment plan.' },
  { id: 'at-3', name: 'Consultation', code: 'CON', durationMinutes: 30, color: '#4a3aa7', department: 'Specialty', requiresReferral: true, allowOnlineBooking: false, isActive: true, bufferMinutes: 5, description: 'Specialist consultation.' },
  { id: 'at-4', name: 'Procedure', code: 'PRC', durationMinutes: 60, color: '#eb6834', department: 'Specialty', requiresReferral: true, allowOnlineBooking: false, isActive: true, bufferMinutes: 15, description: 'Minor in-office procedure.' },
  { id: 'at-5', name: 'Telehealth', code: 'TEL', durationMinutes: 20, color: '#e87ba4', department: 'All', requiresReferral: false, allowOnlineBooking: true, isActive: true, bufferMinutes: 0, description: 'Video visit.' },
  { id: 'at-6', name: 'Annual Physical', code: 'PHY', durationMinutes: 45, color: '#008300', department: 'Primary Care', requiresReferral: false, allowOnlineBooking: true, isActive: true, bufferMinutes: 5, description: 'Yearly preventive examination.' },
  { id: 'at-7', name: 'Urgent', code: 'URG', durationMinutes: 20, color: '#e34948', department: 'Primary Care', requiresReferral: false, allowOnlineBooking: false, isActive: true, bufferMinutes: 0, description: 'Same-day urgent care.' },
  { id: 'at-8', name: 'Lab Visit', code: 'LAB', durationMinutes: 15, color: '#eda100', department: 'Diagnostics', requiresReferral: false, allowOnlineBooking: true, isActive: true, bufferMinutes: 0, description: 'Specimen collection only.' },
  { id: 'at-9', name: 'Vaccination', code: 'VAC', durationMinutes: 15, color: '#13839f', department: 'Primary Care', requiresReferral: false, allowOnlineBooking: true, isActive: false, bufferMinutes: 0, description: 'Immunization administration.' },
];

// ---------- Clinical records ----------
const medsPool: Array<[string, string, string, string]> = [
  ['Amoxicillin', '500 mg', 'Oral', 'Three times daily'], ['Lisinopril', '10 mg', 'Oral', 'Once daily'], ['Metformin', '500 mg', 'Oral', 'Twice daily'],
  ['Atorvastatin', '20 mg', 'Oral', 'Once daily at bedtime'], ['Amlodipine', '5 mg', 'Oral', 'Once daily'], ['Levothyroxine', '50 mcg', 'Oral', 'Once daily'],
  ['Omeprazole', '20 mg', 'Oral', 'Once daily'], ['Albuterol', '90 mcg/actuation', 'Inhalation', 'As needed'], ['Sertraline', '50 mg', 'Oral', 'Once daily'],
  ['Ibuprofen', '400 mg', 'Oral', 'Every 8 hours'], ['Losartan', '50 mg', 'Oral', 'Once daily'], ['Gabapentin', '300 mg', 'Oral', 'Three times daily'],
  ['Prednisone', '10 mg', 'Oral', 'Once daily'], ['Insulin glargine', '20 units', 'Subcutaneous', 'Once daily at bedtime'], ['Cetirizine', '10 mg', 'Oral', 'Once daily'],
];

export const medications: Medication[] = Array.from({ length: 180 }, (_, i) => {
  const patient = patients[i % patients.length];
  const [name, dosage, route, frequency] = rng.pick(medsPool);
  const start = TODAY.subtract(rng.int(1, 400), 'day');
  const durationDays = rng.pick([7, 10, 14, 30, 90, 0]);
  const status = rng.weighted<Medication['status']>([['Active', 60], ['Completed', 25], ['Discontinued', 10], ['On Hold', 5]]);
  return {
    id: `med-${i + 1}`,
    patientId: patient.id,
    patientName: patient.fullName,
    name, dosage, route, frequency,
    duration: durationDays ? `${durationDays} days` : 'Ongoing',
    startDate: start.format('YYYY-MM-DD'),
    endDate: durationDays ? start.add(durationDays, 'day').format('YYYY-MM-DD') : undefined,
    prescribedBy: rng.pick(providers).fullName,
    indication: rng.pick(conditionsPool),
    instructions: rng.bool(0.5) ? 'Take with food.' : undefined,
    refills: rng.int(0, 5),
    status,
    isPRN: frequency === 'As needed',
  };
});

export const prescriptions: Prescription[] = Array.from({ length: 120 }, (_, i) => {
  const med = medications[i];
  const provider = providers.find((p) => p.fullName === med.prescribedBy) ?? providers[0];
  return {
    id: `rx-${i + 1}`,
    rxNumber: `RX-${700000 + i}`,
    patientId: med.patientId,
    patientName: med.patientName,
    providerId: provider.id,
    providerName: provider.fullName,
    medicationName: med.name,
    dosage: med.dosage,
    route: med.route,
    frequency: med.frequency,
    duration: med.duration,
    quantity: rng.pick([14, 21, 28, 30, 60, 90]),
    refills: med.refills ?? 0,
    pharmacy: rng.pick(['CVS Pharmacy #1123', 'Walgreens – Riverside', 'H-E-B Pharmacy', 'Costco Pharmacy', 'Amazon Pharmacy']),
    status: rng.weighted([['Sent', 45], ['Filled', 35], ['Draft', 8], ['Cancelled', 7], ['Expired', 5]]),
    issuedAt: med.startDate,
    substitutionAllowed: rng.bool(0.8),
    instructions: med.instructions,
  };
});

const allergenPool: Array<[string, Allergy['type'], string]> = [
  ['Penicillin', 'Drug', 'Rash, hives'], ['Sulfa drugs', 'Drug', 'Rash'], ['Peanuts', 'Food', 'Anaphylaxis'], ['Shellfish', 'Food', 'Swelling, hives'],
  ['Latex', 'Environmental', 'Contact dermatitis'], ['Pollen', 'Environmental', 'Rhinitis'], ['Aspirin', 'Drug', 'Bronchospasm'], ['Eggs', 'Food', 'GI upset'],
  ['Codeine', 'Drug', 'Nausea, vomiting'], ['Dust mites', 'Environmental', 'Sneezing, wheeze'], ['Iodine contrast', 'Drug', 'Hives'],
];

export const allergies: Allergy[] = Array.from({ length: 140 }, (_, i) => {
  const patient = patients[i % patients.length];
  const [allergen, type, reaction] = rng.pick(allergenPool);
  return {
    id: `alg-${i + 1}`, patientId: patient.id, allergen, type, reaction,
    severity: rng.weighted([['Mild', 40], ['Moderate', 35], ['Severe', 20], ['Life-threatening', 5]]),
    status: rng.weighted([['Active', 85], ['Inactive', 10], ['Resolved', 5]]),
    onsetDate: TODAY.subtract(rng.int(100, 6000), 'day').format('YYYY-MM-DD'),
    recordedBy: rng.pick(providers).fullName,
  };
});

const problemPool: Array<[string, string]> = [
  ['I10', 'Essential (primary) hypertension'], ['E11.9', 'Type 2 diabetes mellitus without complications'], ['J45.20', 'Mild intermittent asthma, uncomplicated'],
  ['E78.5', 'Hyperlipidemia, unspecified'], ['K21.9', 'Gastro-esophageal reflux disease without esophagitis'], ['E03.9', 'Hypothyroidism, unspecified'],
  ['M17.11', 'Unilateral primary osteoarthritis, right knee'], ['F41.1', 'Generalized anxiety disorder'], ['F32.A', 'Depression, unspecified'],
  ['J44.9', 'Chronic obstructive pulmonary disease, unspecified'], ['N18.2', 'Chronic kidney disease, stage 2'], ['G43.909', 'Migraine, unspecified'],
  ['I48.91', 'Unspecified atrial fibrillation'], ['J30.9', 'Allergic rhinitis, unspecified'], ['E66.9', 'Obesity, unspecified'], ['J02.9', 'Acute pharyngitis, unspecified'],
];

export const problems: Problem[] = Array.from({ length: 200 }, (_, i) => {
  const patient = patients[i % patients.length];
  const [icd10, description] = rng.pick(problemPool);
  const status = rng.weighted<Problem['status']>([['Active', 45], ['Chronic', 30], ['Resolved', 20], ['Inactive', 5]]);
  const onset = TODAY.subtract(rng.int(30, 4000), 'day');
  return {
    id: `prb-${i + 1}`, patientId: patient.id, icd10, description, status,
    onsetDate: onset.format('YYYY-MM-DD'),
    resolvedDate: status === 'Resolved' ? onset.add(rng.int(10, 300), 'day').format('YYYY-MM-DD') : undefined,
    severity: rng.pick(['Mild', 'Moderate', 'Severe'] as const),
    diagnosedBy: rng.pick(providers).fullName,
  };
});

const vaccines = ['Influenza (quadrivalent)', 'COVID-19 mRNA', 'Tdap', 'Hepatitis B', 'Pneumococcal (PCV20)', 'Shingles (RZV)', 'MMR', 'HPV', 'Hepatitis A', 'Varicella'];
export const immunizations: Immunization[] = Array.from({ length: 160 }, (_, i) => {
  const patient = patients[i % patients.length];
  const date = TODAY.subtract(rng.int(1, 2500), 'day');
  const status = rng.weighted<Immunization['status']>([['Completed', 75], ['Due', 12], ['Overdue', 10], ['Declined', 3]]);
  return {
    id: `imm-${i + 1}`, patientId: patient.id, vaccine: rng.pick(vaccines), doseNumber: rng.int(1, 3),
    dateAdministered: date.format('YYYY-MM-DD'), administeredBy: rng.pick(['RN Jessica Moore', 'RN Daniel Price', 'MA Chloe Bennett', 'RN Amina Yusuf']),
    lotNumber: `LOT-${rng.int(10000, 99999)}`, site: rng.pick(['Left deltoid', 'Right deltoid', 'Left thigh']), route: rng.pick(['IM', 'SC']),
    manufacturer: rng.pick(['Pfizer', 'Moderna', 'GSK', 'Sanofi', 'Merck']),
    nextDueDate: status === 'Completed' ? date.add(365, 'day').format('YYYY-MM-DD') : TODAY.add(rng.int(-40, 60), 'day').format('YYYY-MM-DD'),
    status,
  };
});

export const documents: ClinicalDocument[] = Array.from({ length: 150 }, (_, i) => {
  const patient = patients[i % patients.length];
  const category = rng.pick(['Lab Result', 'Imaging', 'Referral Letter', 'Discharge Summary', 'Consent', 'Insurance', 'Other'] as const);
  return {
    id: `doc-${i + 1}`, patientId: patient.id, patientName: patient.fullName,
    title: `${category} – ${TODAY.subtract(rng.int(1, 700), 'day').format('MMM D, YYYY')}`,
    category, fileType: rng.pick(['PDF', 'PDF', 'PDF', 'DOCX', 'JPG', 'DICOM'] as const), sizeKb: rng.int(80, 9000),
    uploadedBy: rng.pick(['Front Desk', ...providers.slice(0, 5).map((p) => p.fullName)]),
    uploadedAt: TODAY.subtract(rng.int(1, 700), 'day').toISOString(),
    status: rng.weighted([['Final', 55], ['Signed', 25], ['Pending Review', 12], ['Draft', 8]]),
    tags: rng.pickMany(['urgent', 'follow-up', 'external', 'scanned', 'portal'], rng.int(0, 2)),
  };
});

export const notes: ClinicalNote[] = Array.from({ length: 140 }, (_, i) => {
  const patient = patients[i % patients.length];
  const type = rng.pick(['Progress', 'SOAP', 'Nursing', 'Procedure', 'Telephone', 'Discharge'] as const);
  return {
    id: `note-${i + 1}`, patientId: patient.id, patientName: patient.fullName, type,
    title: `${type} note – ${rng.pick(reasons)}`,
    author: rng.pick(providers).fullName,
    createdAt: TODAY.subtract(rng.int(0, 500), 'day').toISOString(),
    status: rng.weighted([['Signed', 70], ['Draft', 20], ['Amended', 10]]),
    body: 'Patient seen for scheduled review. Reports adherence to current regimen. Vitals stable. Plan discussed and patient agrees. Follow-up in 4 weeks.',
  };
});

export const insurancePolicies: InsurancePolicy[] = patients.flatMap((patient, i) => {
  const primary: InsurancePolicy = {
    id: `ins-${i + 1}-p`, patientId: patient.id, priority: 'Primary', provider: patient.insuranceProvider, plan: patient.insurancePlan,
    policyNumber: patient.policyNumber, groupNumber: `GRP-${rng.int(1000, 9999)}`, subscriberName: patient.fullName, relationship: 'Self',
    effectiveDate: TODAY.subtract(rng.int(100, 900), 'day').format('YYYY-MM-DD'), expiryDate: TODAY.add(rng.int(30, 400), 'day').format('YYYY-MM-DD'),
    copay: rng.pick([0, 15, 25, 35, 50]), deductible: rng.pick([500, 1000, 1500, 3000, 5000]),
    status: rng.weighted([['Active', 85], ['Pending Verification', 10], ['Expired', 5]]), verifiedAt: TODAY.subtract(rng.int(1, 60), 'day').toISOString(),
  };
  if (!rng.bool(0.3)) return [primary];
  return [primary, { ...primary, id: `ins-${i + 1}-s`, priority: 'Secondary', provider: rng.pick(insurers), plan: rng.pick(plans), policyNumber: `POL-${rng.int(10000000, 99999999)}`, relationship: 'Spouse', subscriberName: `${rng.pick(firstNamesF)} ${patient.lastName}` }];
});

export const patientContacts: PatientContact[] = patients.flatMap((patient, i) => [
  { id: `pc-${i + 1}-1`, patientId: patient.id, name: patient.emergencyContactName, relationship: patient.emergencyContactRelation, phone: patient.emergencyContactPhone, email: undefined, isEmergency: true, isGuardian: patient.age < 18, preferredContact: 'Phone' as const },
  ...(rng.bool(0.5) ? [{ id: `pc-${i + 1}-2`, patientId: patient.id, name: `${rng.pick(firstNamesM)} ${patient.lastName}`, relationship: rng.pick(['Sibling', 'Child', 'Friend']), phone: `(${rng.int(200, 989)}) 555-${pad(rng.int(1000, 9999), 4)}`, email: undefined, isEmergency: false, isGuardian: false, preferredContact: 'SMS' as const }] : []),
]);

export const communications: Communication[] = Array.from({ length: 200 }, (_, i) => {
  const patient = patients[i % patients.length];
  return {
    id: `com-${i + 1}`, patientId: patient.id,
    channel: rng.pick(['Phone', 'Email', 'SMS', 'Portal', 'Letter', 'In Person'] as const),
    direction: rng.pick(['Inbound', 'Outbound'] as const),
    subject: rng.pick(['Appointment reminder', 'Lab results available', 'Prescription refill request', 'Billing inquiry', 'Referral confirmation', 'Follow-up call', 'Insurance verification']),
    summary: 'Contact logged by staff. No further action required at this time.',
    staff: rng.pick(['Front Desk', 'Nurse Line', 'Billing Team', providers[0].fullName]),
    timestamp: TODAY.subtract(rng.int(0, 200), 'day').hour(rng.int(8, 17)).toISOString(),
    status: rng.weighted([['Completed', 75], ['Pending', 12], ['Scheduled', 8], ['Failed', 5]]),
  };
});

export const vitals: Vitals[] = patients.flatMap((patient, i) =>
  Array.from({ length: 5 }, (_, k) => {
    const w = rng.float(52, 110, 1);
    const h = rng.int(150, 192);
    return {
      id: `vit-${i}-${k}`, patientId: patient.id, recordedAt: TODAY.subtract(k * rng.int(20, 60) + 1, 'day').toISOString(),
      systolic: rng.int(105, 158), diastolic: rng.int(62, 96), heartRate: rng.int(56, 98), respiratoryRate: rng.int(12, 20),
      temperature: rng.float(36.3, 37.6, 1), spo2: rng.int(94, 100), weightKg: w, heightCm: h, bmi: Number((w / ((h / 100) ** 2)).toFixed(1)), painScore: rng.int(0, 6),
    };
  }),
);

export const consultations: Consultation[] = Array.from({ length: 90 }, (_, i) => {
  const appt = appointments[i * 2] ?? appointments[i];
  const dayDiff = dayjs(appt.date).diff(TODAY, 'day');
  return {
    id: `cons-${i + 1}`, patientId: appt.patientId, patientName: appt.patientName, providerId: appt.providerId, providerName: appt.providerName,
    appointmentId: appt.id, date: appt.date, chiefComplaint: appt.reason,
    status: dayDiff < 0 ? rng.weighted([['Completed', 80], ['Pending Sign-off', 15], ['Cancelled', 5]]) : dayDiff === 0 ? rng.weighted([['In Progress', 50], ['Completed', 30], ['Pending Sign-off', 20]]) : 'In Progress',
    diagnosis: rng.pick(problemPool)[1], durationMinutes: rng.int(10, 45),
  };
});

const labTests: Array<[string, string, string]> = [
  ['Complete Blood Count', 'Hematology', 'Whole blood'], ['Basic Metabolic Panel', 'Chemistry', 'Serum'], ['Lipid Panel', 'Chemistry', 'Serum'], ['HbA1c', 'Chemistry', 'Whole blood'],
  ['TSH', 'Endocrine', 'Serum'], ['Urinalysis', 'Urine', 'Urine'], ['Liver Function Tests', 'Chemistry', 'Serum'], ['Vitamin D, 25-OH', 'Chemistry', 'Serum'],
  ['PT/INR', 'Coagulation', 'Plasma'], ['Urine Culture', 'Microbiology', 'Urine'], ['Troponin I', 'Cardiac', 'Serum'], ['Ferritin', 'Hematology', 'Serum'],
];
export const labOrders: LabOrder[] = Array.from({ length: 130 }, (_, i) => {
  const patient = patients[(i * 3) % patients.length];
  const [testName, panel, specimen] = rng.pick(labTests);
  const ordered = TODAY.subtract(rng.int(0, 90), 'day');
  const status = rng.weighted<LabOrder['status']>([['Ordered', 20], ['Collected', 15], ['In Progress', 15], ['Resulted', 45], ['Cancelled', 5]]);
  return {
    id: `lab-${i + 1}`, orderNumber: `LAB-${300000 + i}`, patientId: patient.id, patientName: patient.fullName, providerName: rng.pick(providers).fullName,
    testName, panel, priority: rng.weighted([['Routine', 80], ['Urgent', 15], ['STAT', 5]]), status,
    orderedAt: ordered.toISOString(), resultedAt: status === 'Resulted' ? ordered.add(rng.int(1, 3), 'day').toISOString() : undefined,
    specimen, lab: rng.pick(['Quest Diagnostics', 'LabCorp', 'In-house Lab']), abnormal: status === 'Resulted' ? rng.bool(0.25) : undefined, fasting: rng.bool(0.4),
  };
});

export const imagingOrders: ImagingOrder[] = Array.from({ length: 80 }, (_, i) => {
  const patient = patients[(i * 5) % patients.length];
  const modality = rng.pick(['X-Ray', 'CT', 'MRI', 'Ultrasound', 'Mammography', 'PET'] as const);
  const ordered = TODAY.subtract(rng.int(0, 60), 'day');
  const status = rng.weighted<ImagingOrder['status']>([['Ordered', 20], ['Scheduled', 25], ['Performed', 15], ['Reported', 35], ['Cancelled', 5]]);
  return {
    id: `img-${i + 1}`, orderNumber: `IMG-${500000 + i}`, patientId: patient.id, patientName: patient.fullName, providerName: rng.pick(providers).fullName,
    modality, bodyPart: rng.pick(['Chest', 'Abdomen', 'Left knee', 'Lumbar spine', 'Brain', 'Right shoulder', 'Pelvis', 'Cervical spine']),
    priority: rng.weighted([['Routine', 80], ['Urgent', 15], ['STAT', 5]]), status, orderedAt: ordered.toISOString(),
    scheduledFor: status !== 'Ordered' && status !== 'Cancelled' ? ordered.add(rng.int(1, 10), 'day').hour(rng.int(8, 16)).toISOString() : undefined,
    facility: rng.pick(['Riverside Imaging', 'Austin Radiology Associates', 'Lakeside Diagnostics']), contrast: modality === 'CT' || modality === 'MRI' ? rng.bool(0.5) : false,
    clinicalIndication: rng.pick(['Persistent pain', 'Rule out fracture', 'Follow-up of known lesion', 'Screening', 'Headache evaluation', 'Shortness of breath']),
  };
});

export const referrals: Referral[] = Array.from({ length: 70 }, (_, i) => {
  const patient = patients[(i * 7) % patients.length];
  const created = TODAY.subtract(rng.int(0, 120), 'day');
  return {
    id: `ref-${i + 1}`, referralNumber: `REF-${80000 + i}`, patientId: patient.id, patientName: patient.fullName,
    referringProvider: rng.pick(providers.slice(0, 4)).fullName,
    referredTo: rng.pick(['Dr. Alan Whitaker (Cardiology)', 'Dr. Meera Iyer (Endocrinology)', 'Austin Ortho Group', 'Central Texas Neurology', 'Dr. Yara Haddad (Dermatology)', 'Texas GI Associates']),
    specialty: rng.pick(specialties), reason: rng.pick(['Specialist evaluation', 'Second opinion', 'Procedure required', 'Ongoing management', 'Abnormal imaging finding']),
    priority: rng.weighted([['Routine', 75], ['Urgent', 20], ['Emergency', 5]]),
    status: rng.weighted([['Pending', 20], ['Sent', 25], ['Accepted', 20], ['Scheduled', 15], ['Completed', 15], ['Declined', 5]]),
    createdAt: created.toISOString(), expiresAt: created.add(90, 'day').format('YYYY-MM-DD'), insuranceAuth: rng.bool(0.6) ? `AUTH-${rng.int(100000, 999999)}` : undefined,
  };
});

export const credentials: Credential[] = providers.flatMap((p, i) => {
  const types: Credential['type'][] = ['Medical License', 'Board Certification', 'DEA Registration', 'BLS/ACLS', 'Malpractice Insurance'];
  return types.map((type, k) => {
    const expiry = TODAY.add(rng.int(-60, 900), 'day');
    const daysLeft = expiry.diff(TODAY, 'day');
    return {
      id: `cred-${i}-${k}`, providerId: p.id, providerName: p.fullName, type, name: type === 'Board Certification' ? `ABMS – ${p.specialty}` : type,
      issuer: rng.pick(['Texas Medical Board', 'American Board of Medical Specialties', 'DEA', 'American Heart Association', 'MedPro Group']),
      number: `${type.slice(0, 3).toUpperCase()}-${rng.int(100000, 999999)}`, issuedDate: expiry.subtract(2, 'year').format('YYYY-MM-DD'), expiryDate: expiry.format('YYYY-MM-DD'),
      status: daysLeft < 0 ? 'Expired' : daysLeft < 90 ? 'Expiring Soon' : rng.bool(0.05) ? 'Pending' : 'Valid', verifiedBy: 'Credentialing Office',
    };
  });
});

// ---------- Roster ----------
const shiftDefs: Array<[Shift['type'], string, string]> = [['Morning', '07:00', '15:00'], ['Afternoon', '12:00', '20:00'], ['Evening', '15:00', '23:00'], ['Night', '23:00', '07:00'], ['On Call', '18:00', '08:00']];
export const shifts: Shift[] = Array.from({ length: 240 }, (_, i) => {
  const p = providers[i % providers.length];
  const [type, startTime, endTime] = rng.weighted(shiftDefs.map((d) => [d, d[0] === 'Night' ? 1 : d[0] === 'On Call' ? 1 : 4] as [typeof d, number]));
  const date = TODAY.add(rng.int(-14, 28), 'day');
  return {
    id: `shift-${i + 1}`, providerId: p.id, providerName: p.fullName, date: date.format('YYYY-MM-DD'), startTime, endTime, type,
    locationName: p.locationName, department: p.department,
    status: date.isBefore(TODAY, 'day') ? 'Completed' : rng.weighted([['Scheduled', 55], ['Confirmed', 38], ['Swapped', 5], ['Cancelled', 2]]),
  };
});

export const rosters: Roster[] = Array.from({ length: 12 }, (_, i) => {
  const start = TODAY.startOf('week').add((i - 6) * 7, 'day');
  return {
    id: `roster-${i + 1}`, name: `${rng.pick(departments)} – Week of ${start.format('MMM D')}`, department: rng.pick(departments), locationName: rng.pick(locations).name,
    startDate: start.format('YYYY-MM-DD'), endDate: start.add(6, 'day').format('YYYY-MM-DD'),
    status: i < 6 ? 'Archived' : i < 9 ? 'Published' : 'Draft', shiftCount: rng.int(20, 60), providerCount: rng.int(4, 12), createdBy: 'Linda Park', createdAt: start.subtract(14, 'day').toISOString(),
  };
});

export const leaveRequests: LeaveRequest[] = Array.from({ length: 30 }, (_, i) => {
  const p = providers[i % providers.length];
  const start = TODAY.add(rng.int(-30, 90), 'day');
  const days = rng.int(1, 10);
  return {
    id: `leave-${i + 1}`, providerId: p.id, providerName: p.fullName, type: rng.pick(['Annual', 'Sick', 'Conference', 'Parental', 'Unpaid', 'Study'] as const),
    startDate: start.format('YYYY-MM-DD'), endDate: start.add(days - 1, 'day').format('YYYY-MM-DD'), days,
    status: rng.weighted([['Pending', 30], ['Approved', 55], ['Rejected', 10], ['Cancelled', 5]]), reason: rng.pick(['Family vacation', 'Medical conference', 'Personal', 'Illness', 'CME course']),
    approver: 'Linda Park', requestedAt: start.subtract(rng.int(7, 40), 'day').toISOString(),
  };
});

export const availability: AvailabilitySlot[] = providers.flatMap((p, i) =>
  (['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const).filter(() => rng.bool(0.8)).map((day, k) => ({
    id: `avail-${i}-${k}`, providerId: p.id, providerName: p.fullName, dayOfWeek: day, startTime: rng.pick(['08:00', '08:30', '09:00']), endTime: rng.pick(['16:00', '17:00', '17:30']),
    locationName: p.locationName, slotMinutes: rng.pick([15, 20, 30]), type: rng.weighted([['In Person', 60], ['Both', 30], ['Telehealth', 10]]), isActive: true,
  })),
);

// ---------- Practice ----------
export const departmentList: Department[] = departments.map((name, i) => ({
  id: `dept-${i + 1}`, name, code: name.split(/\s|&/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4),
  head: providers[i % providers.length].fullName, locationName: locations[i % 3].name, providers: rng.int(2, 9), staff: rng.int(3, 14), extension: `${rng.int(100, 499)}`, isActive: i !== 9 || rng.bool(0.5),
  description: `${name} department providing outpatient services.`,
}));

export const specialtyList: Specialty[] = specialties.map((name, i) => ({
  id: `spec-${i + 1}`, name, code: name.slice(0, 3).toUpperCase(), category: i < 2 ? 'Primary Care' : i === 5 ? 'Surgical' : i === 8 ? 'Allied Health' : 'Medical',
  providers: providers.filter((p) => p.specialty === name).length, defaultAppointmentMinutes: rng.pick([15, 20, 30, 45]), isActive: true,
}));

export const services: ServiceItem[] = [
  ['Office Visit – New Patient (Level 3)', '99203', 'Evaluation & Management', 45, 185], ['Office Visit – Established (Level 3)', '99213', 'Evaluation & Management', 20, 120],
  ['Office Visit – Established (Level 4)', '99214', 'Evaluation & Management', 30, 175], ['Annual Wellness Visit', 'G0439', 'Preventive', 45, 210], ['Telehealth Visit', '99441', 'Telehealth', 20, 95],
  ['ECG, 12-lead', '93000', 'Diagnostics', 15, 65], ['Spirometry', '94010', 'Diagnostics', 20, 80], ['Influenza Vaccine', '90686', 'Immunization', 10, 40], ['Venipuncture', '36415', 'Laboratory', 10, 18],
  ['Joint Injection – Major', '20610', 'Procedure', 20, 190], ['Skin Lesion Removal', '11400', 'Procedure', 30, 240], ['Wound Care – Simple Repair', '12001', 'Procedure', 30, 210], ['Depression Screening', '96127', 'Behavioral Health', 10, 25],
].map(([name, cpt, category, dur, price], i) => ({
  id: `svc-${i + 1}`, name: name as string, code: `SVC-${pad(i + 1, 3)}`, cptCode: cpt as string, category: category as string, department: rng.pick(departments), durationMinutes: dur as number, price: price as number,
  taxable: false, requiresAuth: i === 9 || i === 10, isActive: true,
}));

export const rooms: Room[] = locations.slice(0, 3).flatMap((loc, li) =>
  Array.from({ length: li === 0 ? 12 : 6 }, (_, k) => ({
    id: `room-${li}-${k}`, name: k < 4 || li > 0 ? `Exam ${k + 1}` : k === 4 ? 'Procedure Room A' : k === 5 ? 'Lab' : k === 6 ? 'Imaging Suite' : `Consult ${k - 6}`,
    code: `${loc.code}-${pad(k + 1, 2)}`, locationName: loc.name, floor: k < 6 ? '1' : '2',
    type: k < 4 || li > 0 ? 'Exam Room' : k === 4 ? 'Procedure Room' : k === 5 ? 'Lab' : k === 6 ? 'Imaging' : 'Consultation', capacity: rng.int(2, 6),
    equipment: rng.pickMany(['Exam table', 'Otoscope', 'BP monitor', 'ECG', 'Ultrasound', 'Scale', 'Computer', 'Spirometer'], rng.int(2, 4)),
    status: rng.weighted([['Available', 55], ['Occupied', 30], ['Cleaning', 10], ['Maintenance', 5]]),
  })),
);

export const resources: Resource[] = [
  ['Portable Ultrasound – Butterfly iQ+', 'Device'], ['ECG Machine – GE MAC 2000', 'Equipment'], ['Spirometer – Vitalograph', 'Device'], ['Defibrillator – Zoll AED Plus', 'Equipment'],
  ['Autoclave – Tuttnauer', 'Equipment'], ['Wheelchair #1', 'Equipment'], ['Wheelchair #2', 'Equipment'], ['Vaccine Refrigerator', 'Equipment'], ['Patient Transport Van', 'Vehicle'],
  ['Telehealth Cart', 'Device'], ['EHR License Pack (50 seats)', 'Software License'], ['Dermatoscope – DermLite DL4', 'Device'],
].map(([name, type], i) => ({
  id: `res-${i + 1}`, name, type: type as Resource['type'], serialNumber: `SN-${rng.int(100000, 999999)}`, locationName: rng.pick(locations.slice(0, 3)).name,
  assignedTo: rng.bool(0.5) ? rng.pick(providers).fullName : undefined, status: rng.weighted([['Available', 50], ['In Use', 35], ['Maintenance', 10], ['Retired', 5]]),
  purchaseDate: TODAY.subtract(rng.int(200, 2000), 'day').format('YYYY-MM-DD'), warrantyUntil: TODAY.add(rng.int(-100, 800), 'day').format('YYYY-MM-DD'),
  lastService: TODAY.subtract(rng.int(10, 200), 'day').format('YYYY-MM-DD'), nextService: TODAY.add(rng.int(5, 200), 'day').format('YYYY-MM-DD'),
}));

// ---------- Users / security ----------
const roleNames = ['Administrator', 'Physician', 'Nurse', 'Receptionist', 'Billing', 'Pharmacist', 'Lab Technician', 'Practice Manager'] as const;
const permissionSeeds: Array<[string, string, string, boolean]> = [
  ['patients.view', 'Patients', 'View patients', false], ['patients.create', 'Patients', 'Register patients', false], ['patients.edit', 'Patients', 'Edit demographics', false], ['patients.delete', 'Patients', 'Delete patients', true],
  ['patients.export', 'Patients', 'Export patient data', true], ['clinical.view', 'Clinical', 'View clinical records', false], ['clinical.notes.sign', 'Clinical', 'Sign clinical notes', true], ['clinical.prescribe', 'Clinical', 'Create prescriptions', true],
  ['clinical.orders', 'Clinical', 'Place lab/imaging orders', false], ['appointments.view', 'Appointments', 'View appointments', false], ['appointments.manage', 'Appointments', 'Create / reschedule / cancel', false],
  ['providers.manage', 'Providers', 'Manage providers & credentials', false], ['roster.manage', 'Roster', 'Manage rosters & shifts', false], ['roster.approve_leave', 'Roster', 'Approve leave requests', false],
  ['practice.manage', 'Practice', 'Manage locations, rooms, services', false], ['users.manage', 'Users', 'Manage users & roles', true], ['audit.view', 'Security', 'View audit logs', true],
  ['config.manage', 'Configuration', 'Change system configuration', true], ['reports.view', 'Reports', 'View reports', false], ['reports.export', 'Reports', 'Export reports', true], ['billing.manage', 'Billing', 'Manage billing', false],
];
export const permissions: Permission[] = permissionSeeds.map(([key, module, name, sensitive], i) => ({ id: `perm-${i + 1}`, key, module, name, description: `${name} within the ${module} module.`, sensitive }));

const rolePerms: Record<(typeof roleNames)[number], string[]> = {
  Administrator: permissions.map((p) => p.key),
  Physician: ['patients.view', 'patients.edit', 'clinical.view', 'clinical.notes.sign', 'clinical.prescribe', 'clinical.orders', 'appointments.view', 'appointments.manage', 'reports.view'],
  Nurse: ['patients.view', 'patients.edit', 'clinical.view', 'clinical.orders', 'appointments.view', 'appointments.manage'],
  Receptionist: ['patients.view', 'patients.create', 'patients.edit', 'appointments.view', 'appointments.manage'],
  Billing: ['patients.view', 'billing.manage', 'reports.view', 'reports.export'],
  Pharmacist: ['patients.view', 'clinical.view', 'clinical.prescribe'],
  'Lab Technician': ['patients.view', 'clinical.view', 'clinical.orders'],
  'Practice Manager': ['patients.view', 'appointments.view', 'providers.manage', 'roster.manage', 'roster.approve_leave', 'practice.manage', 'reports.view', 'reports.export', 'users.manage'],
};

const avatarColors = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948', '#0f6e8c'];
const staffNames: Array<[string, string, (typeof roleNames)[number]]> = [
  ['Linda', 'Park', 'Practice Manager'], ['Marcus', 'Reed', 'Administrator'], ['Jessica', 'Moore', 'Nurse'], ['Daniel', 'Price', 'Nurse'], ['Chloe', 'Bennett', 'Receptionist'],
  ['Amina', 'Yusuf', 'Nurse'], ['Kevin', 'Walsh', 'Billing'], ['Nadia', 'Rahman', 'Pharmacist'], ['Tom', 'Becker', 'Lab Technician'], ['Sofia', 'Alvarez', 'Receptionist'], ['Grace', 'Liu', 'Billing'], ['Ryan', 'Patel', 'Administrator'],
];
export const users: User[] = [
  ...providers.map<User>((p, i) => ({
    id: `user-p-${i + 1}`, username: `${p.firstName[0].toLowerCase()}${p.lastName.toLowerCase()}`, firstName: p.firstName, lastName: p.lastName, fullName: p.fullName, email: p.email, phone: p.phone,
    role: 'Physician', department: p.department, locationName: p.locationName, status: p.status === 'Inactive' ? 'Inactive' : 'Active',
    lastLogin: TODAY.subtract(rng.int(0, 10), 'day').hour(rng.int(7, 18)).toISOString(), createdAt: TODAY.subtract(rng.int(200, 1500), 'day').toISOString(), mfaEnabled: rng.bool(0.7), providerId: p.id, avatarColor: avatarColors[i % avatarColors.length],
  })),
  ...staffNames.map<User>(([first, last, role], i) => ({
    id: `user-s-${i + 1}`, username: `${first[0].toLowerCase()}${last.toLowerCase()}`, firstName: first, lastName: last, fullName: `${first} ${last}`, email: `${first.toLowerCase()}.${last.toLowerCase()}@careflow.health`,
    phone: `(512) 555-${pad(rng.int(1000, 9999), 4)}`, role, department: rng.pick(departments), locationName: rng.pick(locations).name,
    status: i === 10 ? 'Locked' : i === 11 ? 'Pending Invite' : 'Active', lastLogin: TODAY.subtract(rng.int(0, 5), 'day').hour(rng.int(7, 18)).toISOString(),
    createdAt: TODAY.subtract(rng.int(60, 1200), 'day').toISOString(), mfaEnabled: rng.bool(0.6), avatarColor: avatarColors[(i + 3) % avatarColors.length],
  })),
];

export const roles: Role[] = roleNames.map((name, i) => ({
  id: `role-${i + 1}`, name, description: `${name} role with default ${name.toLowerCase()} permissions.`, users: users.filter((u) => u.role === name).length,
  permissions: rolePerms[name], isSystem: i < 3, updatedAt: TODAY.subtract(rng.int(1, 200), 'day').toISOString(),
}));

export const auditLogs: AuditLog[] = Array.from({ length: 260 }, (_, i) => {
  const user = rng.pick(users);
  const action = rng.weighted<AuditLog['action']>([['View', 40], ['Update', 20], ['Create', 15], ['Login', 10], ['Logout', 5], ['Delete', 3], ['Export', 3], ['Print', 2], ['Failed Login', 2]]);
  const entity = rng.pick(['Patient', 'Appointment', 'Medication', 'Prescription', 'User', 'Role', 'Configuration', 'Report', 'Session']);
  return {
    id: `audit-${i + 1}`, timestamp: TODAY.subtract(rng.int(0, 30), 'day').hour(rng.int(6, 22)).minute(rng.int(0, 59)).toISOString(), user: user.fullName, action, entity,
    entityId: `${entity.slice(0, 3).toUpperCase()}-${rng.int(1000, 99999)}`, ipAddress: `10.${rng.int(0, 20)}.${rng.int(0, 255)}.${rng.int(1, 254)}`,
    outcome: action === 'Failed Login' ? 'Failure' : rng.weighted([['Success', 94], ['Warning', 5], ['Failure', 1]]),
    details: action === 'Failed Login' ? 'Invalid password (attempt 2 of 5)' : `${action} ${entity.toLowerCase()} record`,
  };
});

export const TODAY_ISO = TODAY.format('YYYY-MM-DD');
