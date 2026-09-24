/**
 * The Inbox's spoken vocabulary: the same intent in many phrasings maps to one
 * structured command, positions and categories are read correctly, and none of
 * it leaks into other modules.
 */
import { describe, expect, it } from 'vitest';
import { interpret, looksLikeCommand } from '../ruleBasedInterpreter';
import { isCompleteShortCommand, parseInboxSearch } from '../inboxGrammar';
import { inboxVoiceCommandGroups } from '@/components/inbox/inboxVoiceCommands';
import type { AICommand, AIContext } from '@/types/ai';

const ctx = (over: Partial<AIContext> = {}): AIContext => ({
  currentPageId: 'inbox-all',
  currentPageTitle: 'Inbox — All',
  currentPageNumber: 20,
  currentPatientId: 'pat-1',
  currentPatientName: 'John Smith',
  currentTab: 'all',
  openFormId: null,
  openFormFields: [],
  pendingSlot: null,
  awaitingConfirmation: false,
  recentTranscripts: [],
  ...over,
});

const one = (text: string, context = ctx()): AICommand => {
  const out = interpret(text, context);
  expect(out, `"${text}" → ${JSON.stringify(out)}`).toHaveLength(1);
  return out[0];
};

describe('inbox: filing', () => {
  it.each(['File this', 'file this record', 'File it', 'Mark this as filed', 'put this in filed', 'mark as reviewed', 'file the current record', 'Could you file this'])('"%s" files the open record', (text) => {
    expect(one(text)).toEqual({ action: 'inbox_file', file: true, target: 'this' });
  });

  it.each(['Unfile this', 'unfile this record', 'Remove this from filed', 'remove from filed', 'Mark this as unfiled', 'mark as unfiled', 'move it back to unfiled', 'on file this', 'un file this'])('"%s" unfiles the open record', (text) => {
    expect(one(text)).toEqual({ action: 'inbox_file', file: false, target: 'this' });
  });

  it('reads a position for filing', () => {
    expect(one('File the first record')).toEqual({ action: 'inbox_file', file: true, target: 1 });
    expect(one('file second record')).toEqual({ action: 'inbox_file', file: true, target: 2 });
    expect(one('Unfile first record')).toEqual({ action: 'inbox_file', file: false, target: 1 });
    expect(one('file the third referral')).toEqual({ action: 'inbox_file', file: true, target: 3, category: 'referral' });
  });
});

describe('inbox: opening records', () => {
  it.each([
    ['Open first record', 1],
    ['Open the first one', 1],
    ['Show first record', 1],
    ['Open record number one', 1],
    ['open the 2nd record', 2],
    ['Open second record', 2],
    ['Open third record', 3],
    ['open record 4', 4],
    ['second one', 2],
    ['show me the first record', 1],
  ])('"%s" opens position %i', (text, position) => {
    expect(one(text)).toEqual({ action: 'inbox_open', target: position });
  });

  it('reads the category the user named', () => {
    expect(one('Open the first lab')).toEqual({ action: 'inbox_open', target: 1, category: 'lab' });
    expect(one('Open the second referral')).toEqual({ action: 'inbox_open', target: 2, category: 'referral' });
    expect(one('Open third radiology record')).toEqual({ action: 'inbox_open', target: 3, category: 'radiology' });
    expect(one('open the last discharge summary')).toEqual({ action: 'inbox_open', target: 'last', category: 'discharge' });
  });

  it.each(['Next', 'next one', 'Open the next record', 'open next', 'go to the next one'])('"%s" steps forward', (text) => {
    expect(one(text)).toEqual({ action: 'inbox_open', target: 'next' });
  });
  it.each(['Previous', 'Open the previous record', 'previous one'])('"%s" steps back', (text) => {
    expect(one(text)).toEqual({ action: 'inbox_open', target: 'previous' });
  });

  it('"open this record" and closing', () => {
    expect(one('Open this record')).toEqual({ action: 'inbox_open', target: 'this' });
    expect(one('Close this record')).toEqual({ action: 'inbox_close' });
    expect(one('close it')).toEqual({ action: 'inbox_close' });
    expect(one('back to the list')).toEqual({ action: 'inbox_close' });
  });

  it('"close it" still cancels while a question is open', () => {
    expect(one('close it', ctx({ awaitingConfirmation: true }))).toEqual({ action: 'cancel' });
  });
});

describe('inbox: categories and search', () => {
  it.each([
    ['Show Lab', 'lab'],
    ['show lab results', 'lab'],
    ['Show Radiology', 'radiology'],
    ['Show Referrals', 'referral'],
    ['Show Discharge Summary', 'discharge'],
    ['show discharge summaries', 'discharge'],
    ['Show all Inbox items', 'all'],
    ['show all', 'all'],
    ['open the lab tab', 'lab'],
    ['Open Lab', 'lab'],
    ['Open RAD', 'radiology'],
    ['open rad reports', 'radiology'],
    ['Open Referrals', 'referral'],
    ['Open Discharge Summary', 'discharge'],
  ])('"%s" → %s', (text, view) => {
    expect(one(text)).toEqual({ action: 'inbox_view', view });
  });

  it('category commands also work from another module', () => {
    expect(one('Show Radiology', ctx({ currentPageId: 'dashboard' }))).toEqual({ action: 'inbox_view', view: 'radiology' });
    expect(one('show all inbox items', ctx({ currentPageId: 'medications' }))).toEqual({ action: 'inbox_view', view: 'all' });
  });

  it('searches with the category taken out of the words', () => {
    expect(one('Search lab results')).toEqual({ action: 'inbox_search', query: '', view: 'lab' });
    expect(one('Search for blood test')).toEqual({ action: 'inbox_search', query: 'blood', view: 'lab' });
    expect(one('Search MRI')).toEqual({ action: 'inbox_search', query: 'mri', view: 'radiology' });
    expect(one('Search for cardiology referral')).toEqual({ action: 'inbox_search', query: 'cardiology', view: 'referral' });
    expect(one('Search discharge summary')).toEqual({ action: 'inbox_search', query: '', view: 'discharge' });
    expect(one('search john smith')).toEqual({ action: 'inbox_search', query: 'john smith' });
    expect(one('Clear search')).toEqual({ action: 'inbox_clear_search' });
  });

  it('"search patient …" is still a patient search in the Inbox', () => {
    expect(one('search patient John Smith')).toEqual({ action: 'search_patient', query: 'John Smith' });
  });

  it('a results search spoken elsewhere goes to the Inbox', () => {
    expect(one('search MRI', ctx({ currentPageId: 'dashboard' }))).toEqual({ action: 'inbox_search', query: 'mri', view: 'radiology' });
  });

  it('parses search phrases', () => {
    expect(parseInboxSearch('referrals to cardiology')).toEqual({ query: 'cardiology', view: 'referral' });
    expect(parseInboxSearch('x-ray')).toEqual({ query: 'x-ray', view: 'radiology' });
  });

  it('patient scope', () => {
    expect(one("show this patient's items")).toEqual({ action: 'inbox_scope', scope: 'patient' });
    expect(one('Show all patients')).toEqual({ action: 'inbox_scope', scope: 'all' });
    expect(one('select this patient')).toEqual({ action: 'inbox_select_patient' });
  });
});

describe('inbox vocabulary stays in the Inbox', () => {
  const dashboard = ctx({ currentPageId: 'dashboard' });
  it('positions and filing mean nothing on other pages', () => {
    expect(interpret('file this', dashboard)[0].action).not.toBe('inbox_file');
    expect(interpret('open first record', dashboard)[0].action).not.toBe('inbox_open');
    expect(interpret('next', dashboard)[0].action).not.toBe('inbox_open');
  });
  it('module commands still work in the Inbox', () => {
    expect(one('open medications')).toEqual({ action: 'navigate', target: 'medications' });
    expect(one('open inbox')).toEqual({ action: 'navigate', target: 'inbox' });
    expect(one('add task call the lab tomorrow').action).toBe('add_record');
    expect(one('yes', ctx({ awaitingConfirmation: true }))).toEqual({ action: 'confirm' });
  });
});

describe('voice on / off', () => {
  it.each(['Stop listening', 'Mic off', 'Turn off microphone', 'turn the mic off', 'Cancel voice', 'Exit voice mode', 'stop'])('"%s" turns the microphone off', (text) => {
    expect(one(text)).toEqual({ action: 'stop_listening' });
    expect(one(text, ctx({ currentPageId: 'dashboard' }))).toEqual({ action: 'stop_listening' });
  });
  it('a bare "stop" still cancels a pending question', () => {
    expect(one('stop', ctx({ awaitingConfirmation: true }))).toEqual({ action: 'cancel' });
  });
  it.each(['What can I say?', 'Show voice commands', 'voice commands', 'help'])('"%s" opens the command list', (text) => {
    expect(one(text)).toEqual({ action: 'help' });
  });
  it('short commands are recognised as complete', () => {
    expect(isCompleteShortCommand('next', ctx())).toBe(true);
    expect(isCompleteShortCommand('file it', ctx())).toBe(true);
    expect(isCompleteShortCommand('mic off', ctx({ currentPageId: 'dashboard' }))).toBe(true);
    // "next friday" answers a due-date question elsewhere — it is not a command.
    expect(isCompleteShortCommand('next friday', ctx({ currentPageId: 'tasks' }))).toBe(false);
    expect(looksLikeCommand('next friday')).toBe(false);
  });
});

describe('patients by voice', () => {
  const patients = ctx({ currentPageId: 'patients' });
  it('finds and selects', () => {
    expect(one('Find John Smith', patients)).toEqual({ action: 'search_patient', query: 'John Smith' });
    expect(one('look up John Smith', ctx({ currentPageId: 'dashboard' }))).toEqual({ action: 'search_patient', query: 'John Smith' });
    expect(one('search for John Smith', patients)).toEqual({ action: 'search_patient', query: 'John Smith' });
    expect(one('Search patient with MRN 102934', patients)).toEqual({ action: 'search_patient', query: '102934' });
    expect(one('Select John Smith', patients)).toEqual({ action: 'select_patient', name: 'John Smith' });
    expect(one('Open first patient', patients)).toEqual({ action: 'select_patient_at', position: 1 });
    expect(one('open the second one', patients)).toEqual({ action: 'select_patient_at', position: 2 });
    expect(one('open patient', patients)).toEqual({ action: 'select_patient_at', position: 1, single: true });
  });
});

describe('the help sheet only lists commands that work', () => {
  for (const group of inboxVoiceCommandGroups) {
    for (const { say } of group.commands) {
      it(`${group.title}: "${say}"`, () => {
        const context = ctx({
          currentPageId: group.context === 'patients' ? 'patients' : 'inbox-all',
          awaitingConfirmation: /^(?:yes|cancel)$/i.test(say),
        });
        const out = interpret(say, context);
        expect(out.length).toBeGreaterThan(0);
        expect(out.every((c) => c.action !== 'unknown'), `"${say}" → ${JSON.stringify(out)}`).toBe(true);
      });
    }
  }
});
