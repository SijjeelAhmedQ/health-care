/**
 * Inbox voice commands in the executor, against a stand-in Inbox page: the
 * executor only calls the page's own handlers, positions follow the list on
 * screen, nothing patient-specific runs without the right patient, and filing
 * waits for a yes when confirmation is on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandExecutor, type ExecutorDeps, type ExecutorState } from '../commandExecutor';
import { InboxVoiceRegistry, setConfirmFiling, type InboxVoiceController } from '@/services/inbox/inboxVoice';
import type { InboxItem, InboxView } from '@/services/inbox/inboxModel';
import type { Patient } from '@/types/domain';

const item = (id: string, category: InboxItem['category'], patientId = 'pat-1', patientName = 'John Smith'): InboxItem => ({
  id,
  category,
  sourceId: id,
  subject: `${category} ${id}`,
  patientId,
  patientName,
  from: 'Lab',
  receivedAt: '2026-09-01T10:00:00.000Z',
  status: 'Resulted',
  statusTone: 'success',
  attention: false,
  preview: '',
  meta: [],
});

const ITEMS = [item('a', 'lab'), item('b', 'referral'), item('c', 'lab'), item('d', 'referral'), item('e', 'radiology', 'pat-2', 'Mary Jones')];

/** A stand-in Inbox page: list, open item, filing and search, like the real one. */
function fakeInbox(items = ITEMS) {
  const state = { view: 'all' as InboxView, query: '', openId: undefined as string | undefined, filed: new Set<string>(), scope: null as string | null };
  const list = () => items.filter((i) => (state.view === 'all' || i.category === state.view) && i.subject.includes(state.query));
  const controller: InboxVoiceController = {
    snapshot: () => {
      const visible = list();
      const openItem = items.find((i) => i.id === state.openId);
      return {
        view: state.view,
        items: visible,
        openItem,
        openIndex: visible.findIndex((i) => i.id === state.openId),
        isFiled: (id) => state.filed.has(id),
        query: state.query,
        scopePatientId: state.scope,
        checkedIds: [],
        loading: false,
      };
    },
    setView: vi.fn((v: InboxView) => { state.view = v; }),
    setQuery: vi.fn((q: string) => { state.query = q; }),
    open: vi.fn((i: InboxItem) => { state.openId = i.id; }),
    close: vi.fn(() => { state.openId = undefined; }),
    file: vi.fn((ids: string[], file: boolean) => ids.forEach((id) => (file ? state.filed.add(id) : state.filed.delete(id)))),
    setPatientScope: vi.fn((id: string | null) => { state.scope = id; }),
  };
  const unregister = InboxVoiceRegistry.register(controller);
  return { controller, state, unregister };
}

function makeDeps(over: Partial<ExecutorState> = {}) {
  const s: ExecutorState = {
    currentPageId: 'inbox-all',
    currentTab: 'all',
    currentPatientId: 'pat-1',
    currentPatientName: 'John Smith',
    openFormId: null,
    pendingConfirmation: null,
    pendingSlot: null,
    sidebarCollapsed: false,
    dashboardSummaryOpen: false,
    ...over,
  };
  const patients = [{ id: 'pat-1', fullName: 'John Smith', mrn: 'MRN-1' }, { id: 'pat-3', fullName: 'John Brown', mrn: 'MRN-3' }] as Patient[];
  const deps: ExecutorDeps = {
    getState: () => s,
    navigate: vi.fn(),
    back: vi.fn(),
    setCurrentPatient: vi.fn((id) => { s.currentPatientId = id; }),
    setActiveTab: vi.fn(),
    setOpenForm: vi.fn(),
    setPendingConfirmation: vi.fn((p) => { s.pendingConfirmation = p; }),
    setPendingSlot: vi.fn((p) => { s.pendingSlot = p; }),
    setPatientSearch: vi.fn(),
    toggleSidebar: vi.fn(),
    setDashboardSummary: vi.fn(),
    resolvePatientByName: vi.fn(async () => []),
    getPatient: () => patients.find((p) => p.id === s.currentPatientId),
    getRecords: () => [],
    deleteRecord: vi.fn(),
    speak: vi.fn(),
    describePatient: () => '',
    stopListening: vi.fn(),
    openHelp: vi.fn(),
    getPatientSearch: () => 'john',
    findPatients: (q: string) => patients.filter((p) => p.fullName.toLowerCase().includes(q.toLowerCase())),
  };
  return { deps, state: s };
}

let inbox: ReturnType<typeof fakeInbox>;
beforeEach(() => {
  inbox = fakeInbox();
  setConfirmFiling(true);
});
afterEach(() => inbox.unregister());

describe('opening records by position', () => {
  it('counts the list on screen, and within a named category', async () => {
    const ex = new CommandExecutor(makeDeps().deps);
    let r = await ex.execute({ action: 'inbox_open', target: 2 }, 'voice');
    expect(r.ok).toBe(true);
    expect(inbox.controller.open).toHaveBeenLastCalledWith(ITEMS[1]);
    expect(r.message).toContain('second record');

    r = await ex.execute({ action: 'inbox_open', target: 2, category: 'lab' }, 'voice');
    expect(inbox.controller.open).toHaveBeenLastCalledWith(ITEMS[2]);
    expect(r.message).toContain('second lab result');
  });

  it('says so when the position does not exist — and opens nothing', async () => {
    const ex = new CommandExecutor(makeDeps().deps);
    const r = await ex.execute({ action: 'inbox_open', target: 3, category: 'referral' }, 'voice');
    expect(r.ok).toBe(false);
    expect(r.message).toBe('There is no third referral in the current list — there are 2.');
    expect(inbox.controller.open).not.toHaveBeenCalled();
  });

  it('steps with next / previous from the open record', async () => {
    const ex = new CommandExecutor(makeDeps().deps);
    await ex.execute({ action: 'inbox_open', target: 'next' }, 'voice'); // nothing open → first
    expect(inbox.state.openId).toBe('a');
    await ex.execute({ action: 'inbox_open', target: 'next' }, 'voice');
    expect(inbox.state.openId).toBe('b');
    await ex.execute({ action: 'inbox_open', target: 'previous' }, 'voice');
    expect(inbox.state.openId).toBe('a');
    const r = await ex.execute({ action: 'inbox_open', target: 'previous' }, 'voice');
    expect(r.ok).toBe(false);
    expect(r.message).toBe('This is the first record in the list.');
  });

  it('reports an empty list', async () => {
    const ex = new CommandExecutor(makeDeps().deps);
    await ex.execute({ action: 'inbox_search', query: 'nothing matches this' }, 'voice');
    const r = await ex.execute({ action: 'inbox_open', target: 1 }, 'voice');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('There are no Inbox records to open');
  });
});

describe('patient safety', () => {
  it('does nothing patient-specific without a selected patient', async () => {
    const ex = new CommandExecutor(makeDeps({ currentPatientId: null, currentPatientName: null }).deps);
    for (const cmd of [{ action: 'inbox_open', target: 1 }, { action: 'inbox_file', file: true, target: 1 }] as const) {
      const r = await ex.execute(cmd, 'voice');
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/^Please select a patient first/);
    }
    expect(inbox.controller.open).not.toHaveBeenCalled();
    expect(inbox.controller.file).not.toHaveBeenCalled();
  });

  it('will not file another patient’s record', async () => {
    const ex = new CommandExecutor(makeDeps().deps);
    const r = await ex.execute({ action: 'inbox_file', file: true, target: 5 }, 'voice');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('belongs to Mary Jones, not the selected patient (John Smith)');
    expect(inbox.controller.file).not.toHaveBeenCalled();
  });

  it('asks for an open record before "file this"', async () => {
    const ex = new CommandExecutor(makeDeps().deps);
    const r = await ex.execute({ action: 'inbox_file', file: true, target: 'this' }, 'voice');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/^Please open or select a record first/);
  });
});

describe('filing', () => {
  it('asks "File this record?" and files only after a yes — through the page handler', async () => {
    const { deps, state } = makeDeps();
    const ex = new CommandExecutor(deps);
    await ex.execute({ action: 'inbox_open', target: 1 }, 'voice');
    const asked = await ex.execute({ action: 'inbox_file', file: true, target: 'this' }, 'voice');
    expect(asked.requiresConfirmation).toBe(true);
    expect(state.pendingConfirmation?.kind).toBe('inbox_file');
    expect(state.pendingConfirmation?.formTitle).toBe('File this record?');
    expect(inbox.controller.file).not.toHaveBeenCalled();

    const done = await ex.execute({ action: 'confirm' }, 'voice');
    expect(done.message).toBe('Record filed successfully.');
    expect(inbox.controller.file).toHaveBeenCalledWith(['a'], true);
    expect(state.pendingConfirmation).toBeNull();
  });

  it('cancelling leaves the record as it was', async () => {
    const { deps } = makeDeps();
    const ex = new CommandExecutor(deps);
    await ex.execute({ action: 'inbox_file', file: true, target: 1 }, 'voice');
    const r = await ex.execute({ action: 'cancel' }, 'voice');
    expect(r.message).toBe('Cancelled — the record was not filed.');
    expect(inbox.controller.file).not.toHaveBeenCalled();
  });

  it('files straight away when confirmation is turned off, and unfiles', async () => {
    setConfirmFiling(false);
    const ex = new CommandExecutor(makeDeps().deps);
    let r = await ex.execute({ action: 'inbox_file', file: true, target: 3 }, 'voice');
    expect(r.message).toContain('Record filed');
    expect(inbox.state.filed.has('c')).toBe(true);
    r = await ex.execute({ action: 'inbox_file', file: true, target: 3 }, 'voice');
    expect(r.message).toContain('already filed');
    r = await ex.execute({ action: 'inbox_file', file: false, target: 3 }, 'voice');
    expect(r.message).toContain('moved back to unfiled');
    expect(inbox.state.filed.has('c')).toBe(false);
  });
});

describe('search, categories and voice', () => {
  it('switches category and searches through the page', async () => {
    const ex = new CommandExecutor(makeDeps().deps);
    const r = await ex.execute({ action: 'inbox_search', query: 'c', view: 'lab' }, 'voice');
    expect(inbox.controller.setView).toHaveBeenCalledWith('lab');
    expect(inbox.controller.setQuery).toHaveBeenCalledWith('c');
    expect(r.message).toContain('Found 1 lab result matching “c”');
    await ex.execute({ action: 'inbox_clear_search' }, 'voice');
    expect(inbox.state.query).toBe('');
  });

  it('"go back" by voice closes the open record', async () => {
    const { deps } = makeDeps();
    const ex = new CommandExecutor(deps);
    await ex.execute({ action: 'inbox_open', target: 1 }, 'voice');
    await ex.execute({ action: 'go_back' }, 'voice');
    expect(inbox.controller.close).toHaveBeenCalled();
    expect(deps.back).not.toHaveBeenCalled();
  });

  it('stop listening and help reach the controller', async () => {
    const { deps } = makeDeps();
    const ex = new CommandExecutor(deps);
    await ex.execute({ action: 'stop_listening' }, 'voice');
    expect(deps.stopListening).toHaveBeenCalled();
    await ex.execute({ action: 'help' }, 'voice');
    expect(deps.openHelp).toHaveBeenCalled();
  });

  it('opens the Inbox on the selected patient when asked by voice', async () => {
    inbox.unregister();
    const { deps } = makeDeps({ currentPageId: 'dashboard' });
    (deps.navigate as ReturnType<typeof vi.fn>).mockImplementation(() => {
      inbox = fakeInbox();
    });
    const ex = new CommandExecutor(deps);
    const r = await ex.execute({ action: 'navigate', target: 'inbox' }, 'voice');
    expect(r.ok).toBe(true);
    expect(deps.navigate).toHaveBeenCalledWith('/inbox/all?patient=pat-1');
  });
});

describe('patients by position', () => {
  it('selects the Nth match and refuses an ambiguous "open patient"', async () => {
    const { deps, state } = makeDeps({ currentPageId: 'patients', currentPatientId: null });
    const ex = new CommandExecutor(deps);
    const ambiguous = await ex.execute({ action: 'select_patient_at', position: 1, single: true }, 'voice');
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.message).toContain('2 patients match');
    expect(state.currentPatientId).toBeNull();

    const missing = await ex.execute({ action: 'select_patient_at', position: 3 }, 'voice');
    expect(missing.message).toBe('There is no third patient in the list — there are 2.');

    await ex.execute({ action: 'select_patient_at', position: 2 }, 'voice');
    expect(deps.setCurrentPatient).toHaveBeenCalledWith('pat-3');
  });
});
