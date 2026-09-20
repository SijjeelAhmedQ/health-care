/**
 * Application command registry. Voice, the command palette (Ctrl+K) and
 * regular UI buttons all end up executing the same commands, so behaviour is
 * identical regardless of the input channel.
 */
import type { AICommand } from '@/types/ai';
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
  /** Whether running this command is a data mutation (always confirmed). */
  sensitive?: boolean;
  run(ctx: AppCommandContext): void | Promise<unknown>;
  pageId?: string;
}

const iconForModule: Record<PageDefinition['module'], string> = {
  dashboard: 'LayoutDashboard',
  patients: 'Users',
  clinical: 'Stethoscope',
  appointments: 'CalendarDays',
  providers: 'UserRound',
  roster: 'CalendarClock',
  practice: 'Building2',
  users: 'ShieldCheck',
  configuration: 'Settings',
  reports: 'BarChart3',
  dev: 'TerminalSquare',
};

const navigationCommands: AppCommand[] = PageRegistry.all()
  .filter((pg) => !pg.requiresContext)
  .map((pg) => ({
    id: `nav:${pg.id}`,
    title: `Go to ${pg.title}`,
    group: moduleLabels[pg.module],
    keywords: [pg.title.toLowerCase(), ...pg.aliases, `page ${pg.number}`, String(pg.number)],
    icon: iconForModule[pg.module],
    pageId: pg.id,
    run: (ctx) => ctx.execute({ action: 'navigate', target: pg.id }),
  }));

const actionCommands: AppCommand[] = [
  { id: 'act:add-patient', title: 'Register New Patient', group: 'Actions', keywords: ['add patient', 'new patient', 'register'], icon: 'UserPlus', run: (ctx) => ctx.execute({ action: 'register_patient' }) },
  { id: 'act:create-appointment', title: 'Create Appointment', group: 'Actions', keywords: ['book', 'schedule', 'new appointment'], icon: 'CalendarPlus', run: (ctx) => ctx.execute({ action: 'create_appointment' }) },
  { id: 'act:add-medication', title: 'Add Medication', group: 'Actions', keywords: ['medication', 'prescribe', 'drug'], icon: 'Pill', run: (ctx) => ctx.execute({ action: 'add_medication' }) },
  { id: 'act:search-patient', title: 'Search Patients', group: 'Actions', keywords: ['find', 'lookup', 'patient'], icon: 'Search', shortcut: '/', run: (ctx) => ctx.execute({ action: 'navigate', target: 'patient-search' }) },
  { id: 'act:start-consultation', title: 'Start Consultation', group: 'Actions', keywords: ['encounter', 'visit', 'consult'], icon: 'ClipboardPlus', run: (ctx) => ctx.execute({ action: 'navigate', target: 'consultation' }) },
  { id: 'act:order-lab', title: 'Order Lab Test', group: 'Actions', keywords: ['lab', 'order', 'test'], icon: 'FlaskConical', run: async (ctx) => { await ctx.execute({ action: 'navigate', target: 'lab-orders' }); await ctx.execute({ action: 'open_form', formId: 'lab-order' }); } },
  { id: 'act:new-referral', title: 'New Referral', group: 'Actions', keywords: ['refer', 'referral'], icon: 'Send', run: async (ctx) => { await ctx.execute({ action: 'navigate', target: 'referrals' }); await ctx.execute({ action: 'open_form', formId: 'referral' }); } },
  { id: 'act:add-user', title: 'Create User', group: 'Actions', keywords: ['user', 'invite', 'account'], icon: 'UserCog', run: (ctx) => ctx.execute({ action: 'navigate', target: 'create-user' }) },
  { id: 'sys:voice', title: 'Open Voice Assistant', group: 'System', keywords: ['voice', 'mic', 'speak', 'assistant'], icon: 'Mic', shortcut: 'Ctrl+Shift+V', run: (ctx) => ctx.openVoicePanel() },
  { id: 'sys:debug', title: 'Toggle Debug Panel', group: 'System', keywords: ['debug', 'developer', 'trace'], icon: 'Bug', shortcut: 'Ctrl+Shift+D', run: (ctx) => ctx.toggleDebugPanel() },
  { id: 'sys:sidebar', title: 'Toggle Sidebar', group: 'System', keywords: ['sidebar', 'menu', 'collapse'], icon: 'PanelLeft', shortcut: 'Ctrl+B', run: (ctx) => ctx.toggleSidebar() },
  { id: 'sys:back', title: 'Go Back', group: 'System', keywords: ['back', 'previous'], icon: 'ArrowLeft', run: (ctx) => ctx.execute({ action: 'go_back' }) },
  { id: 'sys:voice-console', title: 'Open Voice Test Console', group: 'System', keywords: ['console', 'test', 'mock voice'], icon: 'TerminalSquare', run: (ctx) => ctx.execute({ action: 'navigate', target: 'voice-console' }) },
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
