/**
 * The command palette's entries (Ctrl+K). Each runs the same runtime action
 * the assistant's tools use (services/ai/agent/runtime.ts), so a palette entry
 * and a spoken request behave identically. Anything typed that is not an entry
 * goes to the assistant as a request in plain words.
 */
import type { ToolResult } from '@/types/ai';
import type { EntityKind } from '@/types/records';
import type { AppRuntime } from '@/services/ai/agent/runtime';
import { PageRegistry, type PageDefinition } from './pageRegistry';

export interface AppCommandContext {
  /** Run a runtime action (the same code the assistant's tools run). */
  act(action: (runtime: AppRuntime) => ToolResult | Promise<ToolResult>): Promise<ToolResult>;
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
  summary: 'ClipboardList',
  configuration: 'Settings',
};

const iconForKind: Record<EntityKind, string> = {
  patient: 'UserPlus',
  medication: 'Pill',
  diagnosis: 'Stethoscope',
  task: 'ListChecks',
  recall: 'Repeat',
  appointment: 'CalendarPlus',
};

const navigationCommands: AppCommand[] = PageRegistry.all().map((pg) => ({
  id: `nav:${pg.id}`,
  title: pg.parentId ? `Open ${pg.title}` : `Go to ${pg.title}`,
  group: pg.parentId === 'summary' ? 'Summary tabs' : pg.parentId ? 'Inbox' : 'Modules',
  keywords: [pg.title.toLowerCase(), ...pg.keywords, `page ${pg.number}`, String(pg.number)],
  icon: pg.recordKind ? iconForKind[pg.recordKind] : iconForModule[pg.module],
  pageId: pg.id,
  run: (ctx) => ctx.act((r) => r.openPage(pg.id)),
}));

const addCommands: AppCommand[] = (['patient', 'medication', 'diagnosis', 'task', 'recall', 'appointment'] as EntityKind[]).map((kind) => ({
  id: `act:add-${kind}`,
  title: `Add ${kind}`,
  group: 'Actions',
  keywords: [kind, `new ${kind}`],
  icon: iconForKind[kind],
  run: (ctx) => ctx.act((r) => r.createRecords(kind, [{}])),
}));

const actionCommands: AppCommand[] = [
  { id: 'act:select-patient', title: 'Select / change patient', group: 'Actions', keywords: ['patient', 'switch', 'change'], icon: 'UserRoundCog', run: (ctx) => ctx.act((r) => r.openPage('patients')) },
  { id: 'act:patient-panel', title: 'Show patient summary panel', group: 'Actions', keywords: ['summary panel', 'side panel', 'overview'], icon: 'PanelRight', run: (ctx) => ctx.act((r) => r.setPatientPanel(true)) },
  { id: 'act:patient-panel-close', title: 'Close patient summary panel', group: 'Actions', keywords: ['close panel', 'hide summary'], icon: 'PanelRightClose', run: (ctx) => ctx.act((r) => r.setPatientPanel(false)) },
  ...addCommands,
  { id: 'sys:voice', title: 'Open the assistant', group: 'System', keywords: ['voice', 'mic', 'speak', 'assistant'], icon: 'Mic', shortcut: 'Ctrl+Shift+V', run: (ctx) => ctx.openVoicePanel() },
  { id: 'sys:debug', title: 'Toggle Debug Panel', group: 'System', keywords: ['debug', 'developer', 'trace'], icon: 'Bug', shortcut: 'Ctrl+Shift+D', run: (ctx) => ctx.toggleDebugPanel() },
  { id: 'sys:sidebar', title: 'Toggle Sidebar', group: 'System', keywords: ['sidebar', 'menu', 'collapse'], icon: 'PanelLeft', shortcut: 'Ctrl+B', run: (ctx) => ctx.toggleSidebar() },
  { id: 'sys:back', title: 'Go Back', group: 'System', keywords: ['back', 'previous'], icon: 'ArrowLeft', run: (ctx) => ctx.act((r) => r.goBack()) },
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
