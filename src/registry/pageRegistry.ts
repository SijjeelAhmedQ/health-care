/**
 * Central page registry. Every routed page is registered here with a stable
 * number, id, path and voice aliases. The router, sidebar, breadcrumbs,
 * command palette and the voice command executor all resolve pages through
 * this registry — the LLM never guesses routes.
 */
export type PageModule =
  | 'dashboard'
  | 'patients'
  | 'clinical'
  | 'appointments'
  | 'providers'
  | 'roster'
  | 'practice'
  | 'users'
  | 'configuration'
  | 'reports'
  | 'dev';

export interface PageDefinition {
  number: number;
  id: string;
  path: string;
  title: string;
  module: PageModule;
  /** Natural-language aliases used by the interpreter + palette search. */
  aliases: string[];
  /** Route param the page needs (e.g. patient id). Resolved from context when navigating by voice. */
  requiresContext?: 'patientId' | 'providerId' | 'appointmentId' | 'userId';
  /** Some pages are tabs of a parent page; the executor selects the tab after navigating. */
  parentId?: string;
  tab?: string;
  hideInSidebar?: boolean;
  description?: string;
}

const p = (
  number: number,
  id: string,
  path: string,
  title: string,
  module: PageModule,
  aliases: string[] = [],
  extra: Partial<PageDefinition> = {},
): PageDefinition => ({ number, id, path, title, module, aliases, ...extra });

export const pages: PageDefinition[] = [
  // A. Dashboards
  p(1, 'dashboard', '/dashboard', 'Executive Dashboard', 'dashboard', ['home', 'dashboard', 'executive dashboard', 'main dashboard', 'overview']),
  p(2, 'practice-dashboard', '/dashboard/practice', 'Practice Dashboard', 'dashboard', ['practice dashboard', 'practice overview']),
  p(3, 'provider-dashboard', '/dashboard/provider', 'Provider Dashboard', 'dashboard', ['provider dashboard', 'my dashboard', 'doctor dashboard', 'clinician dashboard']),
  p(4, 'operations-dashboard', '/dashboard/operations', 'Operations Dashboard', 'dashboard', ['operations dashboard', 'operations', 'ops dashboard']),
  p(5, 'financial-overview', '/dashboard/financial', 'Financial Overview', 'dashboard', ['financial overview', 'finance', 'financial dashboard', 'revenue']),
  p(6, 'clinical-overview', '/dashboard/clinical', 'Clinical Overview', 'dashboard', ['clinical overview', 'clinical dashboard']),

  // B. Patient management
  p(7, 'patient-search', '/patients/search', 'Patient Search', 'patients', ['patient search', 'search patients', 'find patient', 'search patient', 'find a patient', 'look up patient']),
  p(8, 'patient-list', '/patients', 'Patient List', 'patients', ['patient list', 'patients', 'all patients', 'patient directory']),
  p(9, 'patient-registration', '/patients/register', 'Patient Registration', 'patients', ['patient registration', 'register patient', 'new patient', 'add patient', 'create patient', 'registration']),
  p(10, 'patient-demographics', '/patients/:id/demographics', 'Patient Demographics', 'patients', ['demographics', 'patient demographics', 'patient details'], { requiresContext: 'patientId', parentId: 'patient-profile', tab: 'demographics', hideInSidebar: true }),
  p(11, 'patient-profile', '/patients/:id', 'Patient Profile', 'patients', ['patient profile', 'patient chart', 'chart', 'profile'], { requiresContext: 'patientId', hideInSidebar: true }),
  p(12, 'patient-summary', '/patients/:id/summary', 'Patient Summary', 'patients', ['patient summary', 'summary'], { requiresContext: 'patientId', parentId: 'patient-profile', tab: 'summary', hideInSidebar: true }),
  p(13, 'patient-history', '/patients/:id/history', 'Medical History', 'patients', ['medical history', 'patient history', 'history', 'past medical history'], { requiresContext: 'patientId', parentId: 'patient-profile', tab: 'history', hideInSidebar: true }),
  p(14, 'patient-allergies', '/patients/:id/allergies', 'Allergies', 'patients', ['allergies', 'patient allergies', 'allergy list'], { requiresContext: 'patientId', parentId: 'patient-profile', tab: 'allergies', hideInSidebar: true }),
  p(15, 'patient-medications', '/patients/:id/medications', 'Patient Medications', 'patients', ['patient medications', 'medication list', 'meds', 'current medications'], { requiresContext: 'patientId', parentId: 'patient-profile', tab: 'medications', hideInSidebar: true }),
  p(16, 'patient-problems', '/patients/:id/problems', 'Problems / Diagnoses', 'patients', ['problems', 'problem list', 'patient problems', 'patient diagnoses', 'diagnoses list'], { requiresContext: 'patientId', parentId: 'patient-profile', tab: 'problems', hideInSidebar: true }),
  p(17, 'patient-immunizations', '/patients/:id/immunizations', 'Immunizations', 'patients', ['immunizations', 'vaccinations', 'vaccines', 'immunisations'], { requiresContext: 'patientId', parentId: 'patient-profile', tab: 'immunizations', hideInSidebar: true }),
  p(18, 'patient-documents', '/patients/:id/documents', 'Patient Documents', 'patients', ['patient documents', 'documents', 'files', 'attachments'], { requiresContext: 'patientId', parentId: 'patient-profile', tab: 'documents', hideInSidebar: true }),
  p(19, 'patient-notes', '/patients/:id/notes', 'Patient Notes', 'patients', ['patient notes', 'notes'], { requiresContext: 'patientId', parentId: 'patient-profile', tab: 'notes', hideInSidebar: true }),
  p(20, 'patient-insurance', '/patients/:id/insurance', 'Patient Insurance', 'patients', ['insurance', 'patient insurance', 'coverage', 'insurance details'], { requiresContext: 'patientId', parentId: 'patient-profile', tab: 'insurance', hideInSidebar: true }),
  p(21, 'patient-contacts', '/patients/:id/contacts', 'Patient Contacts', 'patients', ['contacts', 'patient contacts', 'emergency contacts', 'next of kin'], { requiresContext: 'patientId', parentId: 'patient-profile', tab: 'contacts', hideInSidebar: true }),
  p(22, 'patient-communication', '/patients/:id/communication', 'Communication History', 'patients', ['communication', 'communication history', 'messages', 'patient communication'], { requiresContext: 'patientId', parentId: 'patient-profile', tab: 'communication', hideInSidebar: true }),

  // C. Clinical
  p(23, 'consultation-dashboard', '/clinical', 'Consultation Dashboard', 'clinical', ['consultation dashboard', 'clinical', 'consultations', 'clinical home']),
  p(24, 'consultation', '/clinical/consultation', 'Consultation', 'clinical', ['consultation', 'start consultation', 'new consultation', 'encounter', 'visit note']),
  p(25, 'clinical-notes', '/clinical/notes', 'Clinical Notes', 'clinical', ['clinical notes', 'progress notes', 'notes list']),
  p(26, 'soap-notes', '/clinical/soap', 'SOAP Notes', 'clinical', ['soap', 'soap notes', 'soap note']),
  p(27, 'diagnosis', '/clinical/diagnosis', 'Diagnosis', 'clinical', ['diagnosis', 'diagnoses', 'add diagnosis', 'icd', 'icd 10']),
  p(28, 'treatment-plan', '/clinical/treatment-plan', 'Treatment Plan', 'clinical', ['treatment plan', 'treatment', 'care plan', 'plan']),
  p(29, 'medications', '/clinical/medications', 'Medication Management', 'clinical', ['medications', 'medication', 'medication management', 'medication page', 'meds page', 'drugs']),
  p(30, 'prescriptions', '/clinical/prescriptions', 'Prescription Management', 'clinical', ['prescriptions', 'prescription', 'prescription management', 'rx', 'e-prescribing']),
  p(31, 'lab-orders', '/clinical/labs', 'Lab Orders', 'clinical', ['labs', 'lab orders', 'laboratory', 'order labs', 'lab']),
  p(32, 'imaging-orders', '/clinical/imaging', 'Imaging Orders', 'clinical', ['imaging', 'imaging orders', 'radiology', 'x-ray', 'scans']),
  p(33, 'referrals', '/clinical/referrals', 'Referrals', 'clinical', ['referrals', 'referral', 'refer patient']),
  p(34, 'clinical-documents', '/clinical/documents', 'Clinical Documents', 'clinical', ['clinical documents', 'document library', 'all documents']),

  // D. Appointments
  p(35, 'appointment-dashboard', '/appointments', 'Appointment Dashboard', 'appointments', ['appointments', 'appointment', 'appointment dashboard', 'scheduling', 'appointment page']),
  p(36, 'appointment-search', '/appointments/search', 'Appointment Search', 'appointments', ['appointment search', 'search appointments', 'find appointment']),
  p(37, 'appointment-calendar', '/appointments/calendar', 'Appointment Calendar', 'appointments', ['calendar', 'appointment calendar', 'schedule view', 'the calendar']),
  p(38, 'create-appointment', '/appointments/create', 'Create Appointment', 'appointments', ['create appointment', 'new appointment', 'book appointment', 'schedule appointment', 'add appointment']),
  p(39, 'appointment-details', '/appointments/:id', 'Appointment Details', 'appointments', ['appointment details'], { requiresContext: 'appointmentId', hideInSidebar: true }),
  p(40, 'appointment-queue', '/appointments/queue', 'Appointment Queue', 'appointments', ['queue', 'appointment queue', 'waiting room', 'check in queue', 'waiting list']),
  p(41, 'appointment-history', '/appointments/history', 'Appointment History', 'appointments', ['appointment history', 'past appointments', 'visit history']),
  p(42, 'appointment-types', '/appointments/types', 'Appointment Types', 'appointments', ['appointment types', 'visit types']),
  p(43, 'appointment-status', '/appointments/status', 'Appointment Status Management', 'appointments', ['appointment status', 'status management', 'status board']),

  // E. Providers
  p(44, 'provider-list', '/providers', 'Provider List', 'providers', ['providers', 'provider list', 'doctors', 'clinicians', 'physicians', 'staff directory']),
  p(45, 'provider-profile', '/providers/:id', 'Provider Profile', 'providers', ['provider profile', 'doctor profile'], { requiresContext: 'providerId', hideInSidebar: true }),
  p(46, 'provider-details', '/providers/:id/details', 'Provider Details', 'providers', ['provider details'], { requiresContext: 'providerId', parentId: 'provider-profile', tab: 'details', hideInSidebar: true }),
  p(47, 'provider-availability', '/providers/availability', 'Provider Availability', 'providers', ['availability', 'provider availability', 'who is available', 'available providers']),
  p(48, 'provider-schedule', '/providers/schedule', 'Provider Schedule', 'providers', ['provider schedule', 'doctor schedule', 'schedule']),
  p(49, 'provider-performance', '/providers/dashboard', 'Provider Performance', 'providers', ['provider performance', 'provider stats', 'provider metrics']),
  p(50, 'provider-credentials', '/providers/credentials', 'Provider Credentials', 'providers', ['credentials', 'provider credentials', 'licenses', 'certifications', 'credentialing']),

  // F. Roster
  p(51, 'roster-dashboard', '/roster', 'Roster Dashboard', 'roster', ['roster', 'roster dashboard', 'rostering', 'staff roster']),
  p(52, 'create-roster', '/roster/create', 'Create Roster', 'roster', ['create roster', 'new roster', 'build roster']),
  p(53, 'roster-calendar', '/roster/calendar', 'Roster Calendar', 'roster', ['roster calendar', 'shift calendar']),
  p(54, 'shift-management', '/roster/shifts', 'Shift Management', 'roster', ['shifts', 'shift management', 'manage shifts']),
  p(55, 'availability-management', '/roster/availability', 'Availability Management', 'roster', ['availability management', 'manage availability', 'working hours']),
  p(56, 'leave-management', '/roster/leave', 'Leave Management', 'roster', ['leave', 'leave management', 'time off', 'vacation', 'leave requests']),

  // G. Practice
  p(57, 'practice-management', '/practice', 'Practice Management', 'practice', ['practice management', 'practice', 'practice admin']),
  p(58, 'practice-profile', '/practice/profile', 'Practice Profile', 'practice', ['practice profile', 'practice details', 'organisation profile', 'organization profile']),
  p(59, 'locations', '/practice/locations', 'Locations', 'practice', ['locations', 'clinics', 'sites', 'facilities']),
  p(60, 'departments', '/practice/departments', 'Departments', 'practice', ['departments', 'department']),
  p(61, 'specialties', '/practice/specialties', 'Specialties', 'practice', ['specialties', 'specialities', 'specialty']),
  p(62, 'services', '/practice/services', 'Services', 'practice', ['services', 'service catalog', 'service catalogue', 'procedures list', 'fee schedule']),
  p(63, 'rooms', '/practice/rooms', 'Rooms', 'practice', ['rooms', 'exam rooms', 'room management']),
  p(64, 'resources', '/practice/resources', 'Resources', 'practice', ['resources', 'equipment', 'assets']),

  // H. Users
  p(65, 'user-dashboard', '/users', 'User Management', 'users', ['user management', 'users dashboard', 'user dashboard', 'users']),
  p(66, 'user-list', '/users/list', 'User List', 'users', ['user list', 'all users', 'staff accounts', 'accounts']),
  p(67, 'create-user', '/users/create', 'Create User', 'users', ['create user', 'new user', 'add user', 'invite user']),
  p(68, 'user-profile', '/users/:id', 'User Profile', 'users', ['user profile'], { requiresContext: 'userId', hideInSidebar: true }),
  p(69, 'roles', '/users/roles', 'Roles', 'users', ['roles', 'user roles', 'role management']),
  p(70, 'permissions', '/users/permissions', 'Permissions', 'users', ['permissions', 'permission matrix']),
  p(71, 'access-control', '/users/access-control', 'Access Control', 'users', ['access control', 'access policies', 'ip restrictions']),
  p(72, 'audit-logs', '/users/audit-logs', 'Audit Logs', 'users', ['audit logs', 'audit log', 'audit trail', 'activity log']),

  // I. Configuration
  p(73, 'general-configuration', '/configuration', 'General Configuration', 'configuration', ['configuration', 'settings', 'general configuration', 'general settings', 'config']),
  p(74, 'clinical-configuration', '/configuration/clinical', 'Clinical Configuration', 'configuration', ['clinical configuration', 'clinical settings']),
  p(75, 'appointment-configuration', '/configuration/appointments', 'Appointment Configuration', 'configuration', ['appointment configuration', 'appointment settings', 'scheduling settings']),
  p(76, 'medication-configuration', '/configuration/medications', 'Medication Configuration', 'configuration', ['medication configuration', 'medication settings', 'formulary']),
  p(77, 'notification-configuration', '/configuration/notifications', 'Notification Configuration', 'configuration', ['notification configuration', 'notifications', 'notification settings', 'reminders settings']),
  p(78, 'security-configuration', '/configuration/security', 'Security Configuration', 'configuration', ['security configuration', 'security settings', 'security']),
  p(79, 'system-preferences', '/configuration/preferences', 'System Preferences', 'configuration', ['system preferences', 'preferences', 'system settings']),

  // J. Reports
  p(80, 'clinical-reports', '/reports', 'Clinical Reports', 'reports', ['reports', 'clinical reports', 'reporting']),
  p(81, 'patient-reports', '/reports/patients', 'Patient Reports', 'reports', ['patient reports', 'patient report']),
  p(82, 'appointment-reports', '/reports/appointments', 'Appointment Reports', 'reports', ['appointment reports', 'appointment report', 'scheduling reports']),
  p(83, 'provider-reports', '/reports/providers', 'Provider Reports', 'reports', ['provider reports', 'provider report', 'productivity report']),
  p(84, 'practice-reports', '/reports/practice', 'Practice Reports', 'reports', ['practice reports', 'practice report']),
  p(85, 'audit-reports', '/reports/audit', 'Audit Reports', 'reports', ['audit reports', 'audit report', 'compliance report']),

  // Dev tooling
  p(90, 'voice-console', '/dev/voice-console', 'Voice Test Console', 'dev', ['voice console', 'voice test console', 'test console', 'developer console']),
];

const byId = new Map(pages.map((pg) => [pg.id, pg]));
const byNumber = new Map(pages.map((pg) => [pg.number, pg]));

export const PageRegistry = {
  all: () => pages,
  get: (id: string) => byId.get(id),
  getByNumber: (n: number) => byNumber.get(n),
  byModule: (module: PageModule) => pages.filter((pg) => pg.module === module),
  sidebarPages: () => pages.filter((pg) => !pg.hideInSidebar && pg.module !== 'dev'),

  /** Match a concrete pathname (e.g. /patients/pat-1/allergies) to a page definition. */
  matchPath(pathname: string): PageDefinition | undefined {
    const clean = pathname.replace(/\/+$/, '') || '/';
    let best: PageDefinition | undefined;
    let bestScore = -1;
    for (const pg of pages) {
      const pattern = new RegExp('^' + pg.path.replace(/:[a-zA-Z]+/g, '[^/]+') + '$');
      if (pattern.test(clean)) {
        const score = pg.path.split('/').length + (pg.path.includes(':') ? 0 : 1);
        if (score > bestScore) {
          best = pg;
          bestScore = score;
        }
      }
    }
    return best;
  },

  /** Build the concrete path for a page using context params. */
  buildPath(page: PageDefinition, params: Record<string, string | undefined> = {}): string | null {
    let path = page.path;
    const missing: string[] = [];
    path = path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      const value = params[key] ?? (key === 'id' ? params[contextKeyToParam(page.requiresContext)] : undefined);
      if (!value) missing.push(key);
      return value ?? '';
    });
    return missing.length ? null : path;
  },

  /**
   * Resolve a natural-language target ("medications", "page 30", 30, "patient search")
   * to a page definition. Deterministic; scores alias overlap.
   */
  resolve(target: string | number): PageDefinition | undefined {
    if (typeof target === 'number') return byNumber.get(target);
    const raw = target.trim().toLowerCase();
    if (!raw) return undefined;
    const numMatch = raw.match(/^(?:page\s*)?(\d{1,3})$/);
    if (numMatch) return byNumber.get(Number(numMatch[1]));
    if (byId.has(raw)) return byId.get(raw);
    const slug = raw.replace(/\s+/g, '-');
    if (byId.has(slug)) return byId.get(slug);

    let best: PageDefinition | undefined;
    let bestScore = 0;
    for (const pg of pages) {
      const candidates = [pg.title.toLowerCase(), pg.id.replace(/-/g, ' '), ...pg.aliases];
      for (const c of candidates) {
        let score = 0;
        if (c === raw) score = 100;
        else if (raw.includes(c)) score = 60 + c.length; // longer alias contained in the phrase wins
        else if (c.includes(raw) && raw.length >= 4) score = 40 + raw.length;
        if (score > bestScore) {
          bestScore = score;
          best = pg;
        }
      }
    }
    return bestScore >= 40 ? best : undefined;
  },
};

function contextKeyToParam(ctx?: PageDefinition['requiresContext']): string {
  return ctx ?? 'id';
}

export const moduleLabels: Record<PageModule, string> = {
  dashboard: 'Dashboard',
  patients: 'Patients',
  clinical: 'Clinical',
  appointments: 'Appointments',
  providers: 'Providers',
  roster: 'Roster',
  practice: 'Practice Management',
  users: 'User Management',
  configuration: 'Configuration',
  reports: 'Reports',
  dev: 'Developer',
};
