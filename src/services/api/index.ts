/**
 * Domain services for the eight modules of the application
 * (Dashboard, Patient, Medication, Diagnosis, Task, Recall, Appointment, Summary).
 *
 * Each service exposes a small, intention-revealing API backed by a mock
 * repository today; a Python/REST backend can be plugged in by replacing
 * `createMockRepository` with an HTTP repository satisfying `Repository<T>`.
 */
import * as db from '@/services/mock/mockDb';
import type {
  Appointment,
  ClinicalDocument,
  ClinicalNote,
  Diagnosis,
  ImagingOrder,
  LabOrder,
  Medication,
  Patient,
  Provider,
  Recall,
  Referral,
  Task,
  User,
} from '@/types/domain';
import { createMockRepository, delay } from './repository';

/** Everything that hangs off a patient is queried the same way. */
interface PatientScoped {
  patientId: string;
}

function withPatientScope<T extends PatientScoped & { id: string }>(repo: ReturnType<typeof createMockRepository<T>>) {
  return {
    ...repo,
    /** Every record belonging to one patient. Never returns another patient's data. */
    async byPatient(patientId: string): Promise<T[]> {
      const all = await repo.all();
      return all.filter((r) => r.patientId === patientId);
    },
  };
}

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
  /** Best-effort resolver for voice commands: "select John Smith" -> patient. */
  async resolveByName(name: string): Promise<Patient[]> {
    const q = name.trim().toLowerCase();
    const all = await patientRepo.all();
    const exact = all.filter((p) => p.fullName.toLowerCase() === q || p.mrn.toLowerCase() === q);
    if (exact.length) return exact;
    const tokens = q.split(/\s+/).filter(Boolean);
    return all.filter((p) => tokens.every((t) => p.fullName.toLowerCase().includes(t))).slice(0, 5);
  },
};

// ---- Patient-scoped clinical data ----
export const medicationService = withPatientScope(createMockRepository<Medication>(db.medications, { persistKey: 'careflow.medications' }));
export const diagnosisService = withPatientScope(createMockRepository<Diagnosis>(db.problems, { persistKey: 'careflow.diagnoses' }));
export const taskService = withPatientScope(createMockRepository<Task>(db.tasks, { persistKey: 'careflow.tasks' }));
export const recallService = withPatientScope(createMockRepository<Recall>(db.recalls, { persistKey: 'careflow.recalls' }));

// ---- Appointments ----
const appointmentRepo = createMockRepository<Appointment>(db.appointments, { persistKey: 'careflow.appointments' });
export const appointmentService = {
  ...withPatientScope(appointmentRepo),
  async byDate(date: string) {
    const all = await appointmentRepo.all();
    return all.filter((a) => a.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
  },
};

// ---- Incoming clinical correspondence (the Inbox) ----
// Read-only workqueues: results, reports, letters and summaries that arrive for
// a patient. The Inbox presents them; the records themselves are unchanged.
export const labOrderService = withPatientScope(createMockRepository<LabOrder>(db.labOrders, { persistKey: 'careflow.labs' }));
export const imagingOrderService = withPatientScope(createMockRepository<ImagingOrder>(db.imagingOrders, { persistKey: 'careflow.imaging' }));
export const referralService = withPatientScope(createMockRepository<Referral>(db.referrals, { persistKey: 'careflow.referrals' }));
export const noteService = withPatientScope(createMockRepository<ClinicalNote>(db.notes, { persistKey: 'careflow.notes' }));
export const documentService = createMockRepository<ClinicalDocument>(db.documents);

// ---- Providers (used to attribute records; not a navigable module) ----
const providerRepo = createMockRepository<Provider>(db.providers, { persistKey: 'careflow.providers' });
export const providerService = {
  ...providerRepo,
  async resolveByName(name: string) {
    const q = name.trim().toLowerCase().replace(/^(?:dr\.?|doctor)\s+/, '');
    const all = await providerRepo.all();
    const exact = all.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase() === q || p.fullName.toLowerCase() === name.trim().toLowerCase());
    if (exact.length) return exact;
    const tokens = q.split(/\s+/).filter(Boolean);
    return all.filter((p) => {
      const hay = `${p.firstName} ${p.lastName}`.toLowerCase();
      return tokens.every((t) => hay.split(' ').some((w) => w === t || w.startsWith(t)));
    });
  },
};

// ---- Auth ----
export interface AuthSession {
  token: string;
  user: User;
  expiresAt: string;
}
export const authService = {
  async login(username: string, _password: string): Promise<AuthSession> {
    await delay(400);
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
