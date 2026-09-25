/**
 * Central page registry. Every routed page is registered here with a stable
 * number, id, path and description. The router, sidebar, command palette and
 * the assistant's tools all resolve pages through this registry — the model is
 * handed the page ids and descriptions from here and never guesses routes.
 */
import type { RecordKind } from '@/types/records';

export type PageModule = 'dashboard' | 'patient' | 'inbox' | 'summary' | 'configuration';

export interface PageDefinition {
  number: number;
  id: string;
  path: string;
  title: string;
  module: PageModule;
  /** Words the command palette and global search match against. */
  keywords: string[];
  /**
   * The page works on the selected patient. Without one it must not be opened:
   * the router shows the patient picker instead.
   */
  requiresPatient?: boolean;
  /** Some pages are tabs of a parent page; the tab key is the last path segment. */
  parentId?: string;
  tab?: string;
  /** The record kind a Summary tab manages. */
  recordKind?: RecordKind;
  hideInSidebar?: boolean;
  /** What the page is for — shown in the UI and given to the assistant verbatim. */
  description: string;
}

const p = (
  number: number,
  id: string,
  path: string,
  title: string,
  module: PageModule,
  description: string,
  extra: Partial<PageDefinition> = {},
): PageDefinition => ({ number, id, path, title, module, description, keywords: [], ...extra });

export const pages: PageDefinition[] = [
  p(1, 'dashboard', '/dashboard', 'Dashboard', 'dashboard', "The signed-in provider's dashboard: today's schedule, upcoming appointments, their open tasks, recalls due for their patients and unfiled Inbox items.", {
    keywords: ['home', 'overview', 'my day', 'schedule'],
  }),
  p(2, 'patients', '/patients', 'Patients', 'patient', 'Search, select, add, update and delete patients. Selecting a patient sets the context for the Summary.', {
    keywords: ['patient list', 'find patient', 'select patient'],
  }),
  p(3, 'inbox', '/inbox', 'Inbox', 'inbox', 'Incoming lab results, radiology reports, referrals and discharge summaries.', {
    keywords: ['results', 'correspondence', 'lab', 'radiology', 'referral', 'discharge'],
  }),
  p(4, 'summary', '/summary', 'Summary', 'summary', "The selected patient's chart. Medications, diagnoses, tasks, recalls and appointments are all managed here, one tab each, plus the AI Summary tab for dictated notes.", {
    requiresPatient: true,
    keywords: ['chart', 'patient summary', 'record'],
  }),

  p(16, 'configuration', '/configuration', 'Configuration', 'configuration', 'Choose the AI models: the language model the assistant runs on (any model installed in Ollama) and the Omi Med STT speech model, backend and timings.', {
    keywords: ['settings', 'models', 'ollama', 'speech', 'omi', 'stt', 'llm'],
  }),

  // Summary tabs — real routes so every tab has a URL.
  p(5, 'summary-ai', '/summary/ai-summary', 'AI Summary', 'summary', 'Dictate or paste a clinical note; the AI extracts medications, diagnoses, tasks, recalls and appointments for review.', {
    requiresPatient: true, parentId: 'summary', tab: 'ai-summary', hideInSidebar: true, keywords: ['dictate', 'note', 'extract'],
  }),
  p(6, 'summary-medication', '/summary/medication', 'Medications', 'summary', "The selected patient's medications: add, edit, stop and delete.", {
    requiresPatient: true, parentId: 'summary', tab: 'medication', recordKind: 'medication', hideInSidebar: true, keywords: ['meds', 'drugs', 'prescriptions'],
  }),
  p(7, 'summary-diagnosis', '/summary/diagnosis', 'Diagnoses', 'summary', "The selected patient's problem list: add, edit, resolve and delete diagnoses.", {
    requiresPatient: true, parentId: 'summary', tab: 'diagnosis', recordKind: 'diagnosis', hideInSidebar: true, keywords: ['problems', 'conditions', 'icd'],
  }),
  p(8, 'summary-task', '/summary/task', 'Tasks', 'summary', 'Work owed to the selected patient: follow-up calls, monitoring, paperwork.', {
    requiresPatient: true, parentId: 'summary', tab: 'task', recordKind: 'task', hideInSidebar: true, keywords: ['to do', 'todo'],
  }),
  p(9, 'summary-recall', '/summary/recall', 'Recalls', 'summary', 'Reminders to bring the selected patient back: reviews, screening, repeat labs, vaccinations.', {
    requiresPatient: true, parentId: 'summary', tab: 'recall', recordKind: 'recall', hideInSidebar: true, keywords: ['reminders', 'bring back'],
  }),
  p(10, 'summary-appointment', '/summary/appointment', 'Appointments', 'summary', "The selected patient's past and upcoming appointments: book, reschedule, cancel.", {
    requiresPatient: true, parentId: 'summary', tab: 'appointment', recordKind: 'appointment', hideInSidebar: true, keywords: ['visits', 'bookings'],
  }),

  // Inbox categories — real routes, so every category has a URL.
  p(11, 'inbox-all', '/inbox/all', 'Inbox — All', 'inbox', 'Every Inbox item.', { parentId: 'inbox', tab: 'all', hideInSidebar: true }),
  p(12, 'inbox-lab', '/inbox/lab', 'Inbox — Lab', 'inbox', 'Lab results.', { parentId: 'inbox', tab: 'lab', hideInSidebar: true }),
  p(13, 'inbox-radiology', '/inbox/radiology', 'Inbox — Radiology', 'inbox', 'Radiology reports.', { parentId: 'inbox', tab: 'radiology', hideInSidebar: true }),
  p(14, 'inbox-referral', '/inbox/referral', 'Inbox — Referrals', 'inbox', 'Referral letters.', { parentId: 'inbox', tab: 'referral', hideInSidebar: true }),
  p(15, 'inbox-discharge', '/inbox/discharge', 'Inbox — Discharge Summary', 'inbox', 'Discharge summaries.', { parentId: 'inbox', tab: 'discharge', hideInSidebar: true }),
];

const byId = new Map(pages.map((pg) => [pg.id, pg]));
const byNumber = new Map(pages.map((pg) => [pg.number, pg]));

export const PageRegistry = {
  all: () => pages,
  get: (id: string) => byId.get(id),
  getByNumber: (n: number) => byNumber.get(n),
  /** The navigation entries — one per module. */
  sidebarPages: () => pages.filter((pg) => !pg.hideInSidebar),
  /** The Summary tabs, in display order. */
  summaryTabs: () => pages.filter((pg) => pg.parentId === 'summary'),
  /** The Summary tab that manages a record kind. */
  recordTab: (kind: RecordKind) => pages.find((pg) => pg.recordKind === kind)!,

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
};

export const moduleLabels: Record<PageModule, string> = {
  dashboard: 'Dashboard',
  patient: 'Patients',
  inbox: 'Inbox',
  summary: 'Summary',
  configuration: 'Configuration',
};

/** Module home paths, used by breadcrumbs and the module switcher. */
export const moduleHome: Record<PageModule, string> = {
  dashboard: '/dashboard',
  patient: '/patients',
  inbox: '/inbox',
  summary: '/summary',
  configuration: '/configuration',
};
