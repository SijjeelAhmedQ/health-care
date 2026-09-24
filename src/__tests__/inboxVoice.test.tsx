/**
 * The Inbox, operated by voice from start to finish in the real application:
 * sign in (no patient), find and select a patient, open the Inbox, change
 * category, search, open records by position, file and unfile with a spoken
 * confirmation, step to the next record — and sign out, which must leave no
 * patient behind.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { store } from '@/store';
import { router } from '@/app/router';
import { login, logout } from '@/store/slices/authSlice';
import { fetchPatients, patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { fetchInbox, inboxActions } from '@/store/slices/inboxSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { InboxVoiceRegistry, setConfirmFiling } from '@/services/inbox/inboxVoice';
import { installBrowserStubs, pageText, renderAppAt, say, unmountApp, wait, waitUntil } from './harness';

const TIMEOUT = 60000;

beforeAll(installBrowserStubs);
afterEach(unmountApp);

beforeEach(async () => {
  setConfirmFiling(true);
  store.dispatch(voiceActions.resetVoice());
  store.dispatch(inboxActions.markUnreviewed(store.getState().inbox.reviewedIds));
  await store.dispatch(login({ username: 'mreed', password: 'demo' })).unwrap();
  await store.dispatch(fetchPatients()).unwrap();
  await store.dispatch(fetchInbox()).unwrap();
});

const john = () => patientSelectors.selectAll(store.getState()).find((p) => p.fullName === 'John Smith')!;
const inbox = () => InboxVoiceRegistry.get()!;
const openItemId = () => new URLSearchParams(router.state.location.search).get('item');

describe('patient context and sign-in', () => {
  it('a new sign-in starts with no patient, and signing out clears the selection', async () => {
    store.dispatch(setCurrentPatient(john().id));
    await store.dispatch(logout()).unwrap();
    expect(store.getState().patients.currentPatientId).toBeNull();
    expect(localStorage.getItem('careflow.selectedPatientId')).toBeNull();

    store.dispatch(setCurrentPatient(john().id));
    await store.dispatch(login({ username: 'sahmed', password: 'demo' })).unwrap();
    expect(store.getState().patients.currentPatientId).toBeNull();
    expect(store.getState().patients.recentPatientIds).toEqual([]);
  }, TIMEOUT);

  it('signing out ends voice control and forgets the conversation', async () => {
    store.dispatch(setCurrentPatient(john().id));
    await renderAppAt('/inbox/all', () => !!InboxVoiceRegistry.get());
    await say('open the first record');
    expect(store.getState().voice.history.length).toBeGreaterThan(0);

    await store.dispatch(logout()).unwrap();
    await waitUntil(() => pageText().includes('Sign in'));
    expect(store.getState().patients.currentPatientId).toBeNull();
    expect(store.getState().voice.history).toEqual([]);
    expect(store.getState().voice.micActive).toBe(false);
    expect(store.getState().voice.pendingConfirmation).toBeNull();
  }, TIMEOUT);
});

describe('the Inbox by voice', () => {
  it('patient → Inbox → search → record → file → next, all spoken', async () => {
    await renderAppAt('/patients', () => pageText().includes('Add patient'));
    expect(store.getState().patients.currentPatientId).toBeNull();

    // Patient
    await say('search patient John Smith');
    await waitUntil(() => router.state.location.search.includes('q='));
    await say('open first patient');
    await waitUntil(() => store.getState().patients.currentPatientId === john().id);
    expect(store.getState().patients.currentPatientId).toBe(john().id);

    // Inbox, opened on that patient
    await say('open inbox');
    await waitUntil(() => !!InboxVoiceRegistry.get() && !inbox().snapshot().loading);
    expect(router.state.location.pathname).toBe('/inbox/all');
    expect(new URLSearchParams(router.state.location.search).get('patient')).toBe(john().id);
    expect(inbox().snapshot().items.length).toBeGreaterThan(0);
    expect(inbox().snapshot().items.every((i) => i.patientId === john().id)).toBe(true);
    expect(document.querySelector('.ibx-scope-toggle')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.ibx-scope-toggle')?.textContent).toContain('John Smith only');
    // The Inbox is driven by the application's one Voice Assistant — still there, with its Inbox hints.
    expect(document.querySelector('.voice-fab')).not.toBeNull();
    expect(document.querySelector('.voice-panel')).not.toBeNull();
    // The Inbox's voice options live on the Inbox page, not inside the assistant.
    expect(document.querySelector('.ibx-head .ibx-voice-setting')).not.toBeNull();
    expect(document.querySelector('.ibx-head .ibx-voice-help-btn')).not.toBeNull();
    expect(document.querySelector('.voice-panel')?.textContent).not.toContain('Voice commands');
    expect(document.querySelector('.voice-panel')?.textContent).not.toContain('Confirm voice filing');

    // Category and search
    await say('open rad');
    await waitUntil(() => router.state.location.pathname === '/inbox/radiology');
    expect(inbox().snapshot().view).toBe('radiology');
    await say('show lab');
    await waitUntil(() => router.state.location.pathname === '/inbox/lab');
    expect(inbox().snapshot().view).toBe('lab');
    expect(new URLSearchParams(router.state.location.search).get('patient')).toBe(john().id);

    await say('search lab results');
    expect(store.getState().voice.status === 'error').toBe(false);

    // Record by position
    const first = inbox().snapshot().items[0];
    await say('open first record');
    await waitUntil(() => openItemId() === first.id);
    expect(openItemId()).toBe(first.id);
    expect(store.getState().voice.response).toContain('Opened the first record');

    // File, with a spoken confirmation, through the page's own filing
    await say('file this');
    expect(store.getState().voice.pendingConfirmation?.kind).toBe('inbox_file');
    expect(pageText()).toContain('File this record?');
    expect(pageText()).toContain('Yes, file');
    expect(store.getState().inbox.reviewedIds).not.toContain(first.id);
    await say('yes');
    await waitUntil(() => store.getState().inbox.reviewedIds.includes(first.id));
    expect(store.getState().inbox.reviewedIds).toContain(first.id);
    expect(store.getState().voice.response).toBe('Record filed successfully.');

    // Unfile, then cancel a second attempt
    await say('unfile this');
    await say('yes');
    await waitUntil(() => !store.getState().inbox.reviewedIds.includes(first.id));
    expect(store.getState().inbox.reviewedIds).not.toContain(first.id);

    // Next record — the microphone did not need to be restarted for any of this
    const second = inbox().snapshot().items[1];
    if (second) {
      await say('next');
      await waitUntil(() => openItemId() === second.id);
      expect(openItemId()).toBe(second.id);
    }

    // Close, help, stop
    await say('close this record');
    await waitUntil(() => !openItemId());
    expect(openItemId()).toBeNull();

    await say('what can I say');
    await waitUntil(() => store.getState().voice.helpOpen);
    expect(pageText()).toContain('Inbox voice commands');
    store.dispatch(voiceActions.setHelpOpen(false));

    // The same sheet opens from the button on the Inbox page.
    (document.querySelector('.ibx-voice-help-btn') as HTMLButtonElement).click();
    await waitUntil(() => store.getState().voice.helpOpen);
    expect(store.getState().voice.helpOpen).toBe(true);
    store.dispatch(voiceActions.setHelpOpen(false));

    // The switch on the Inbox page turns the spoken confirmation off.
    (document.querySelector('.ibx-voice-setting button') as HTMLButtonElement).click();
    await waitUntil(() => localStorage.getItem('careflow.inbox.voice.confirmFiling') === 'false');
    expect(localStorage.getItem('careflow.inbox.voice.confirmFiling')).toBe('false');
    setConfirmFiling(true);

    await say('stop listening');
    expect(store.getState().voice.response).toContain('Voice control is off');
    expect(store.getState().voice.micActive).toBe(false);
  }, TIMEOUT);

  it('refuses record actions without a patient and says why', async () => {
    store.dispatch(setCurrentPatient(null));
    await renderAppAt('/inbox/all', () => !!InboxVoiceRegistry.get());
    await waitUntil(() => !inbox().snapshot().loading);

    await say('open the first record');
    expect(openItemId()).toBeNull();
    expect(store.getState().voice.error).toMatch(/^Please select a patient first/);

    await say('file the first record');
    expect(store.getState().voice.pendingConfirmation).toBeNull();
    expect(store.getState().inbox.reviewedIds).toEqual([]);
  }, TIMEOUT);

  it('explains a position that is not in the list', async () => {
    store.dispatch(setCurrentPatient(john().id));
    await renderAppAt(`/inbox/referral?patient=${john().id}`, () => !!InboxVoiceRegistry.get());
    await waitUntil(() => !inbox().snapshot().loading);
    const count = inbox().snapshot().items.length;

    await say(`open record number ${count + 1}`);
    expect(openItemId()).toBeNull();
    expect(store.getState().voice.error).toContain('in the current list');
  }, TIMEOUT);

  it('the patient toggle shows only the selected patient, or everyone — and is always there', async () => {
    const toggle = () => document.querySelector('.ibx-scope-toggle') as HTMLButtonElement;
    const patientIds = () => new Set(inbox().snapshot().items.map((i) => i.patientId));

    // No patient: the toggle is there, off, and cannot switch on.
    store.dispatch(setCurrentPatient(null));
    await renderAppAt('/inbox/all', () => !!document.querySelector('.ibx-msg'));
    expect(toggle()).not.toBeNull();
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(toggle().textContent).toContain('All patients');
    toggle().click();
    await wait(200);
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(patientIds().size).toBeGreaterThan(1);

    // With a patient: on → only theirs, off → everyone again.
    store.dispatch(setCurrentPatient(john().id));
    await wait(150); // let the page re-render with the selected patient
    toggle().click();
    await waitUntil(() => toggle().getAttribute('aria-pressed') === 'true');
    expect(toggle().textContent).toContain('John Smith only');
    expect([...patientIds()]).toEqual([john().id]);

    // Still there with a record open.
    (document.querySelector('.ibx-msg') as HTMLElement).click();
    await waitUntil(() => !!openItemId());
    expect(toggle()).not.toBeNull();

    toggle().click();
    await waitUntil(() => toggle().getAttribute('aria-pressed') === 'false');
    expect(toggle().textContent).toContain('All patients');
    expect(patientIds().size).toBeGreaterThan(1);
  }, TIMEOUT);

  it('keeps mouse filing exactly as it was', async () => {
    store.dispatch(setCurrentPatient(john().id));
    await renderAppAt('/inbox/all', () => !!document.querySelector('.ibx-msg'));
    (document.querySelector('.ibx-msg') as HTMLElement).click();
    await waitUntil(() => !!openItemId());
    const id = openItemId()!;
    const fileButton = Array.from(document.querySelectorAll('.ibx-dbar-actions button')).find((b) => b.textContent?.trim() === 'File') as HTMLButtonElement;
    fileButton.click();
    await waitUntil(() => store.getState().inbox.reviewedIds.includes(id));
    expect(store.getState().inbox.reviewedIds).toContain(id);
    // No voice confirmation is involved in a click.
    expect(store.getState().voice.pendingConfirmation).toBeNull();
  }, TIMEOUT);
});
