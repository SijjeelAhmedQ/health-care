/**
 * Domain services. Each service exposes a small, intention-revealing API.
 * They are backed by mock repositories today; a Python/REST backend can be
 * plugged in by replacing `createMockRepository` with an HTTP repository that
 * satisfies the same `Repository<T>` contract.
 */
import * as db from '@/services/mock/mockDb';
import type {
  Allergy, Appointment, AppointmentTypeDef, AuditLog, AvailabilitySlot, ClinicalDocument, ClinicalNote, Communication, Consultation, Credential,
  Department, ImagingOrder, Immunization, InsurancePolicy, LabOrder, LeaveRequest, Location, Medication, Patient, PatientContact, Permission,
  Prescription, Problem, Provider, Referral, Resource, Role, Room, Roster, ServiceItem, Shift, Specialty, User, Vitals,
} from '@/types/domain';
import { createMockRepository, delay } from './repository';

// ---- Patients ----
const patientRepo = createMockRepository<Patient>(db.patients, { persistKey: 'careflow.patients' });
export const patientService = {
  ...patientRepo,
  async search(query: string, limit = 8): Promise<Patient[]> {
    await delay(120);
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const all = await patientRepo.all();
    return all
      .filter((p) => p.fullName.toLowerCase().includes(q) || p.mrn.toLowerCase().includes(q) || p.phone.includes(q) || p.email.toLowerCase().includes(q))
      .slice(0, limit);
  },
  /** Best-effort resolver for voice commands: "open John Smith" -> patient. */
  async resolveByName(name: string): Promise<Patient[]> {
    const q = name.trim().toLowerCase();
    const all = await patientRepo.all();
    const exact = all.filter((p) => p.fullName.toLowerCase() === q);
    if (exact.length) return exact;
    const tokens = q.split(/\s+/).filter(Boolean);
    return all.filter((p) => tokens.every((t) => p.fullName.toLowerCase().includes(t))).slice(0, 5);
  },
};

export const allergyService = createMockRepository<Allergy>(db.allergies, { persistKey: 'careflow.allergies' });
export const problemService = createMockRepository<Problem>(db.problems, { persistKey: 'careflow.problems' });
export const immunizationService = createMockRepository<Immunization>(db.immunizations);
export const documentService = createMockRepository<ClinicalDocument>(db.documents);
export const noteService = createMockRepository<ClinicalNote>(db.notes, { persistKey: 'careflow.notes' });
export const insuranceService = createMockRepository<InsurancePolicy>(db.insurancePolicies);
export const contactService = createMockRepository<PatientContact>(db.patientContacts);
export const communicationService = createMockRepository<Communication>(db.communications);
export const vitalsService = createMockRepository<Vitals>(db.vitals);

// ---- Clinical ----
export const medicationService = createMockRepository<Medication>(db.medications, { persistKey: 'careflow.medications' });
export const prescriptionService = createMockRepository<Prescription>(db.prescriptions, { persistKey: 'careflow.prescriptions' });
export const consultationService = createMockRepository<Consultation>(db.consultations);
export const labOrderService = createMockRepository<LabOrder>(db.labOrders, { persistKey: 'careflow.labs' });
export const imagingOrderService = createMockRepository<ImagingOrder>(db.imagingOrders, { persistKey: 'careflow.imaging' });
export const referralService = createMockRepository<Referral>(db.referrals, { persistKey: 'careflow.referrals' });

// ---- Appointments ----
const appointmentRepo = createMockRepository<Appointment>(db.appointments, { persistKey: 'careflow.appointments' });
export const appointmentService = {
  ...appointmentRepo,
  async byDate(date: string) {
    const all = await appointmentRepo.all();
    return all.filter((a) => a.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
  },
  async byRange(start: string, end: string) {
    const all = await appointmentRepo.all();
    return all.filter((a) => a.date >= start && a.date <= end);
  },
  async byPatient(patientId: string) {
    const all = await appointmentRepo.all();
    return all.filter((a) => a.patientId === patientId);
  },
};
export const appointmentTypeService = createMockRepository<AppointmentTypeDef>(db.appointmentTypes);

// ---- Providers ----
const providerRepo = createMockRepository<Provider>(db.providers, { persistKey: 'careflow.providers' });
export const providerService = {
  ...providerRepo,
  async resolveByName(name: string) {
    const q = name.trim().toLowerCase().replace(/^(?:dr\.?|doctor)\s+/, '');
    const all = await providerRepo.all();
    const exact = all.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase() === q || p.fullName.toLowerCase() === name.trim().toLowerCase());
    if (exact.length) return exact;
    // Order-independent token match so "Ahmed Sarah" / "Sarah" / "Dr Ahmed" all find Dr. Sarah Ahmed.
    const tokens = q.split(/\s+/).filter(Boolean);
    return all.filter((p) => {
      const hay = `${p.firstName} ${p.lastName}`.toLowerCase();
      return tokens.every((t) => hay.split(' ').some((w) => w === t || w.startsWith(t)));
    });
  },
};
export const credentialService = createMockRepository<Credential>(db.credentials);
export const availabilityService = createMockRepository<AvailabilitySlot>(db.availability);

// ---- Roster ----
export const shiftService = createMockRepository<Shift>(db.shifts, { persistKey: 'careflow.shifts' });
export const rosterService = createMockRepository<Roster>(db.rosters, { persistKey: 'careflow.rosters' });
export const leaveService = createMockRepository<LeaveRequest>(db.leaveRequests, { persistKey: 'careflow.leave' });

// ---- Practice ----
export const locationService = createMockRepository<Location>(db.locations);
export const departmentService = createMockRepository<Department>(db.departmentList);
export const specialtyService = createMockRepository<Specialty>(db.specialtyList);
export const serviceCatalogService = createMockRepository<ServiceItem>(db.services);
export const roomService = createMockRepository<Room>(db.rooms);
export const resourceService = createMockRepository<Resource>(db.resources);

// ---- Users & security ----
export const userService = createMockRepository<User>(db.users, { persistKey: 'careflow.users' });
export const roleService = createMockRepository<Role>(db.roles);
export const permissionService = createMockRepository<Permission>(db.permissions);
export const auditLogService = createMockRepository<AuditLog>(db.auditLogs);

// ---- Auth ----
export interface AuthSession {
  token: string;
  user: User;
  expiresAt: string;
}
export const authService = {
  async login(username: string, _password: string): Promise<AuthSession> {
    await delay(500);
    const user = db.users.find((u) => u.username === username || u.email === username) ?? db.users.find((u) => u.role === 'Administrator')!;
    return { token: `mock-${Date.now()}`, user, expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString() };
  },
  async logout() {
    await delay(100);
  },
  async me(): Promise<User> {
    await delay(80);
    return db.users.find((u) => u.role === 'Administrator')!;
  },
};

export { db as mockDb };
