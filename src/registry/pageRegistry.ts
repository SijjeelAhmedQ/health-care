/**
 * Central page registry. Every routed page is registered here with a stable
 * number, id, path and voice aliases. The router, sidebar, command palette and
 * the voice command executor all resolve pages through this registry — the LLM
 * never guesses routes.
 */
export type PageModule = 'dashboard' | 'patient' | 'inbox' | 'medication' | 'diagnosis' | 'task' | 'recall' | 'appointment' | 'summary';

export interface PageDefinition {
  number: number;
  id: string;
  path: string;
  title: string;
  module: PageModule;
  /** Natural-language aliases used by the interpreter + palette search. */
  aliases: string[];
  /**
   * The page works on the selected patient. Without one it must not be opened:
   * the router shows the patient picker instead.
   */
  requiresPatient?: boolean;
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
  p(1, 'dashboard', '/dashboard', 'Dashboard', 'dashboard', ['dashboard', 'home', 'overview', 'patient dashboard', 'main dashboard'], {
    requiresPatient: true,
    description: 'Overview of the selected patient: medications, diagnoses, tasks, recalls and appointments.',
  }),
  p(2, 'patients', '/patients', 'Patient', 'patient', ['patient', 'patients', 'patient list', 'patient search', 'search patient', 'find patient', 'select patient', 'change patient', 'patient module'], {
    description: 'Search, select, add, update and delete patients. Selecting a patient sets the context for every other module.',
  }),
  p(3, 'inbox', '/inbox', 'Inbox', 'inbox', ['inbox', 'my inbox', 'provider inbox', 'results inbox', 'incoming', 'correspondence', 'inbox module'], {
    description: 'Incoming lab results, radiology reports, referrals and discharge summaries.',
  }),
  p(4, 'medications', '/medications', 'Medication', 'medication', ['medication', 'medications', 'meds', 'drugs', 'medicine', 'medication module'], {
    requiresPatient: true,
    description: "The selected patient's medications.",
  }),
  p(5, 'diagnoses', '/diagnoses', 'Diagnosis', 'diagnosis', ['diagnosis', 'diagnoses', 'problem list', 'problems', 'conditions', 'diagnosis module'], {
    requiresPatient: true,
    description: "The selected patient's diagnoses.",
  }),
  p(6, 'tasks', '/tasks', 'Task', 'task', ['task', 'tasks', 'to do', 'todo', 'to-do list', 'task module'], {
    requiresPatient: true,
    description: "Work owed to the selected patient.",
  }),
  p(7, 'recalls', '/recalls', 'Recall', 'recall', ['recall', 'recalls', 'reminder', 'reminders', 'follow up reminder', 'recall module'], {
    requiresPatient: true,
    description: 'Reminders to bring the selected patient back.',
  }),
  p(8, 'appointments', '/appointments', 'Appointment', 'appointment', ['appointment', 'appointments', 'schedule', 'scheduling', 'bookings', 'appointment module'], {
    requiresPatient: true,
    description: "The selected patient's appointments.",
  }),
  p(9, 'summary', '/summary', 'Summary', 'summary', ['summary', 'summary module', 'patient summary'], {
    requiresPatient: true,
    description: 'AI summary plus every record type for the selected patient.',
  }),

  // Inbox categories — real routes, so "open the radiology inbox" lands on a URL.
  p(16, 'inbox-lab', '/inbox/lab', 'Inbox — Lab', 'inbox', ['lab inbox', 'lab results inbox', 'inbox lab', 'lab tab'], {
    parentId: 'inbox', tab: 'lab', hideInSidebar: true,
  }),
  p(17, 'inbox-radiology', '/inbox/radiology', 'Inbox — Radiology', 'inbox', ['radiology inbox', 'rad inbox', 'imaging inbox', 'inbox radiology', 'radiology tab'], {
    parentId: 'inbox', tab: 'radiology', hideInSidebar: true,
  }),
  p(18, 'inbox-referral', '/inbox/referral', 'Inbox — Referrals', 'inbox', ['referral inbox', 'referrals inbox', 'inbox referrals', 'referral tab'], {
    parentId: 'inbox', tab: 'referral', hideInSidebar: true,
  }),
  p(19, 'inbox-discharge', '/inbox/discharge', 'Inbox — Discharge Summary', 'inbox', ['discharge inbox', 'discharge summary inbox', 'discharge summaries', 'inbox discharge', 'discharge tab'], {
    parentId: 'inbox', tab: 'discharge', hideInSidebar: true,
  }),

  // Summary tabs — real routes so voice ("show me the diagnosis tab") lands on a URL.
  p(10, 'summary-ai', '/summary/ai-summary', 'AI Summary', 'summary', ['ai summary', 'ai summary tab', 'voice summary', 'ai tab'], {
    requiresPatient: true, parentId: 'summary', tab: 'ai-summary', hideInSidebar: true,
  }),
  p(11, 'summary-medication', '/summary/medication', 'Summary — Medication', 'summary', ['medication tab', 'summary medication'], {
    requiresPatient: true, parentId: 'summary', tab: 'medication', hideInSidebar: true,
  }),
  p(12, 'summary-recall', '/summary/recall', 'Summary — Recall', 'summary', ['recall tab', 'summary recall'], {
    requiresPatient: true, parentId: 'summary', tab: 'recall', hideInSidebar: true,
  }),
  p(13, 'summary-appointment', '/summary/appointment', 'Summary — Appointment', 'summary', ['appointment tab', 'summary appointment'], {
    requiresPatient: true, parentId: 'summary', tab: 'appointment', hideInSidebar: true,
  }),
  p(14, 'summary-diagnosis', '/summary/diagnosis', 'Summary — Diagnosis', 'summary', ['diagnosis tab', 'summary diagnosis'], {
    requiresPatient: true, parentId: 'summary', tab: 'diagnosis', hideInSidebar: true,
  }),
  p(15, 'summary-task', '/summary/task', 'Summary — Task', 'summary', ['task tab', 'summary task'], {
    requiresPatient: true, parentId: 'summary', tab: 'task', hideInSidebar: true,
  }),
];

const byId = new Map(pages.map((pg) => [pg.id, pg]));
const byNumber = new Map(pages.map((pg) => [pg.number, pg]));

export const PageRegistry = {
  all: () => pages,
  get: (id: string) => byId.get(id),
  getByNumber: (n: number) => byNumber.get(n),
  byModule: (module: PageModule) => pages.filter((pg) => pg.module === module),
  /** The navigation entries — one per module. */
  sidebarPages: () => pages.filter((pg) => !pg.hideInSidebar),

  /** Match a concrete pathname to a page definition. */
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

  /** Build the concrete path for a page (no page takes route params today). */
  buildPath(page: PageDefinition, params: Record<string, string | undefined> = {}): string | null {
    const missing: string[] = [];
    const path = page.path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      const value = params[key];
      if (!value) missing.push(key);
      return value ?? '';
    });
    return missing.length ? null : path;
  },

  /**
   * Resolve a natural-language target ("medications", "page 3", 3, "diagnosis tab")
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

export const moduleLabels: Record<PageModule, string> = {
  dashboard: 'Dashboard',
  patient: 'Patient',
  inbox: 'Inbox',
  medication: 'Medication',
  diagnosis: 'Diagnosis',
  task: 'Task',
  recall: 'Recall',
  appointment: 'Appointment',
  summary: 'Summary',
};

/** Module home paths, used by breadcrumbs and the module switcher. */
export const moduleHome: Record<PageModule, string> = {
  dashboard: '/dashboard',
  patient: '/patients',
  inbox: '/inbox',
  medication: '/medications',
  diagnosis: '/diagnoses',
  task: '/tasks',
  recall: '/recalls',
  appointment: '/appointments',
  summary: '/summary',
};
