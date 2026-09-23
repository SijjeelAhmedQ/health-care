/**
 * Application command registry. Voice, the command palette (Ctrl+K) and regular
 * UI buttons all execute the same commands, so behaviour is identical whichever
 * way the user asks.
 */
import type { AICommand, AIRecordKind } from '@/types/ai';
import { PageRegistry, moduleLabels, type PageDefinition } from './pageRegistry';

export interface AppCommandContext {
  /** Execute a structured AI command through the deterministic executor. */
  execute(command: AICommand): Promise<unknown>;
  toggleDebugPanel(): void;
  toggleSidebar(): void;
  openVoicePanel(): void;
  signOut(): void;
}

export interface AppCommand {
  id: string;
  title: string;
  group: string;
  keywords: string[];
  /** lucide icon name (resolved by the palette) */
  icon?: string;
  shortcut?: string;
  run(ctx: AppCommandContext): void | Promise<unknown>;
  pageId?: string;
}

const iconForModule: Record<PageDefinition['module'], string> = {
  dashboard: 'LayoutDashboard',
  patient: 'Users',
  inbox: 'Inbox',
  medication: 'Pill',
  diagnosis: 'Stethoscope',
  task: 'ListChecks',
  recall: 'Repeat',
  appointment: 'CalendarDays',
  summary: 'ClipboardList',
};

const navigationCommands: AppCommand[] = PageRegistry.all().map((pg) => ({
  id: `nav:${pg.id}`,
  title: pg.parentId ? `Open ${pg.title}` : `Go to ${pg.title}`,
  group: pg.parentId ? 'Summary tabs' : 'Modules',
  keywords: [pg.title.toLowerCase(), ...pg.aliases, `page ${pg.number}`, String(pg.number)],
  icon: iconForModule[pg.module],
  pageId: pg.id,
  run: (ctx) => ctx.execute({ action: 'navigate', target: pg.id }),
}));

const addCommands: AppCommand[] = (
  [
    ['medication', 'Add Medication', 'Pill', ['prescribe', 'drug', 'medicine']],
    ['diagnosis', 'Add Diagnosis', 'Stethoscope', ['problem', 'condition', 'icd']],
    ['task', 'Add Task', 'ListChecks', ['to do', 'todo', 'follow up']],
    ['recall', 'Add Recall', 'Repeat', ['reminder', 'bring back', 'review']],
    ['appointment', 'Add Appointment', 'CalendarPlus', ['book', 'schedule', 'visit']],
    ['patient', 'Add Patient', 'UserPlus', ['register', 'new patient']],
  ] as Array<[AIRecordKind, string, string, string[]]>
).map(([kind, title, icon, keywords]) => ({
  id: `act:add-${kind}`,
  title,
  group: 'Actions',
  keywords: [kind, `add ${kind}`, `new ${kind}`, ...keywords],
  icon,
  run: (ctx) => ctx.execute({ action: 'add_record', kind }),
}));

const readCommands: AppCommand[] = (['medication', 'diagnosis', 'task', 'recall', 'appointment'] as AIRecordKind[]).map((kind) => ({
  id: `act:read-${kind}`,
  title: `Read ${moduleLabels[kind as keyof typeof moduleLabels] ?? kind} list aloud`,
  group: 'Actions',
  keywords: ['read', 'speak', 'aloud', kind],
  icon: 'Volume2',
  run: (ctx) => ctx.execute({ action: 'read_records', kind }),
}));

const actionCommands: AppCommand[] = [
  { id: 'act:select-patient', title: 'Select / change patient', group: 'Actions', keywords: ['patient', 'switch', 'change', 'context'], icon: 'UserRoundCog', run: (ctx) => ctx.execute({ action: 'navigate', target: 'patients' }) },
  { id: 'act:summary', title: 'Summarise this patient', group: 'Actions', keywords: ['summary', 'overview', 'brief'], icon: 'Sparkles', run: (ctx) => ctx.execute({ action: 'summarize_patient' }) },
  ...addCommands,
  ...readCommands,
  { id: 'sys:voice', title: 'Open Voice Assistant', group: 'System', keywords: ['voice', 'mic', 'speak', 'assistant'], icon: 'Mic', shortcut: 'Ctrl+Shift+V', run: (ctx) => ctx.openVoicePanel() },
  { id: 'sys:debug', title: 'Toggle Debug Panel', group: 'System', keywords: ['debug', 'developer', 'trace'], icon: 'Bug', shortcut: 'Ctrl+Shift+D', run: (ctx) => ctx.toggleDebugPanel() },
  { id: 'sys:sidebar', title: 'Toggle Sidebar', group: 'System', keywords: ['sidebar', 'menu', 'collapse'], icon: 'PanelLeft', shortcut: 'Ctrl+B', run: (ctx) => ctx.toggleSidebar() },
  { id: 'sys:back', title: 'Go Back', group: 'System', keywords: ['back', 'previous'], icon: 'ArrowLeft', run: (ctx) => ctx.execute({ action: 'go_back' }) },
  { id: 'sys:signout', title: 'Sign Out', group: 'System', keywords: ['logout', 'sign out', 'exit'], icon: 'LogOut', run: (ctx) => ctx.signOut() },
];

const all = [...actionCommands, ...navigationCommands];
const byId = new Map(all.map((c) => [c.id, c]));

export const CommandRegistry = {
  all: () => all,
  get: (id: string) => byId.get(id),
  search(query: string, limit = 40): AppCommand[] {
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, limit);
    const scored = all
      .map((cmd) => {
        const title = cmd.title.toLowerCase();
        let score = 0;
        if (title === q) score = 100;
        else if (title.startsWith(q)) score = 80;
        else if (title.includes(q)) score = 60;
        else if (cmd.keywords.some((k) => k === q)) score = 55;
        else if (cmd.keywords.some((k) => k.includes(q))) score = 40;
        else if (q.split(/\s+/).every((tok) => title.includes(tok) || cmd.keywords.some((k) => k.includes(tok)))) score = 30;
        return { cmd, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.cmd);
  },
};
