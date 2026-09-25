/**
 * The Inbox, operated through the assistant in the real application. A
 * scripted model makes the tool calls; the real Inbox page carries them out:
 * find and select a patient, open the Inbox on them, change category, open
 * records by position, file and unfile with a confirmation, step to the next
 * record — and sign out, which must leave no patient and no conversation behind.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { store } from '@/store';
import { router } from '@/app/router';
import { login, logout } from '@/store/slices/authSlice';
import { fetchPatients, patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { fetchInbox, inboxActions } from '@/store/slices/inboxSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { InboxVoiceRegistry, setConfirmFiling } from '@/services/inbox/inboxVoice';
import { call, type ScriptedLLM } from '@/services/ai/__tests__/fakes';
import { installBrowserStubs, pageText, renderAppAt, say, unmountApp, useScriptedModel, wait, waitUntil } from './harness';

const TIMEOUT = 60000;
let model: ScriptedLLM;

beforeAll(installBrowserStubs);
afterEach(unmountApp);

beforeEach(async () => {
  setConfirmFiling(true);
  store.dispatch(voiceActions.resetVoice());
  store.dispatch(inboxActions.markUnreviewed(store.getState().inbox.reviewedIds));
  await store.dispatch(login({ username: 'sahmed', password: 'demo' })).unwrap();
  await store.dispatch(fetchPatients()).unwrap();
  await store.dispatch(fetchInbox()).unwrap();
  model = useScriptedModel();
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

  it('only provider accounts can sign in', async () => {
    await store.dispatch(logout()).unwrap();
    const admin = await store.dispatch(login({ username: 'mreed', password: 'demo' }));
    expect(admin.meta.requestStatus).toBe('rejected');
    expect(store.getState().auth.error).toMatch(/not a provider account/);
    const unknown = await store.dispatch(login({ username: 'nobody', password: 'demo' }));
    expect(unknown.meta.requestStatus).toBe('rejected');
  }, TIMEOUT);

  it('signing out ends the assistant and forgets the conversation', async () => {
    store.dispatch(setCurrentPatient(john().id));
    await renderAppAt('/inbox/all', () => !!InboxVoiceRegistry.get());
    model.calls([call('inbox_open_item', { target: 1 })], 'Opened it.');
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

describe('the Inbox through the assistant', () => {
  it('patient → Inbox → category → record → file → unfile → next → close', async () => {
    await renderAppAt('/patients', () => pageText().includes('Add patient'));
    expect(store.getState().patients.currentPatientId).toBeNull();

    // Patient: search, then select by position in the list on screen.
    model.calls([call('search_patients', { query: 'John Smith' })], 'Found John Smith.');
    await say('find John Smith');
    await waitUntil(() => router.state.location.search.includes('q='));
    expect((model.lastToolResults()[0].data as Array<{ name: string }>)[0].name).toBe('John Smith');
    model.calls([call('select_patient', { list_position: 1 })], 'John Smith selected.');
    await say('open the first one');
    await waitUntil(() => store.getState().patients.currentPatientId === john().id);

    // The Inbox opens on that patient.
    model.calls([call('inbox_show', { category: 'all' })], 'Here is the Inbox.');
    await say('open my inbox');
    await waitUntil(() => !!InboxVoiceRegistry.get() && !inbox().snapshot().loading);
    expect(router.state.location.pathname).toBe('/inbox/all');
    expect(new URLSearchParams(router.state.location.search).get('patient')).toBe(john().id);
    expect(inbox().snapshot().items.every((i) => i.patientId === john().id)).toBe(true);

    model.calls([call('inbox_show', { category: 'lab' })], 'Showing lab results.');
    await say('show the lab results');
    await waitUntil(() => router.state.location.pathname === '/inbox/lab');
    expect(inbox().snapshot().view).toBe('lab');

    // A record by position — its content goes back to the model.
    const first = inbox().snapshot().items[0];
    model.calls([call('inbox_open_item', { target: 1 })], 'Opened the first result.');
    await say('open the first one');
    await waitUntil(() => openItemId() === first.id);
    expect((model.lastToolResults()[0].data as { subject: string }).subject).toBe(first.subject);

    // File: staged, shown, and done only after the user's yes.
    model.then({ calls: [call('inbox_file_item', { file: true })] });
    await say('file this');
    expect(store.getState().voice.pendingConfirmation?.kind).toBe('inbox_file');
    expect(pageText()).toContain('File this record?');
    expect(store.getState().inbox.reviewedIds).not.toContain(first.id);
    model.calls([call('confirm_pending_action')], 'Filed.');
    await say('yes');
    await waitUntil(() => store.getState().inbox.reviewedIds.includes(first.id));

    model.then({ calls: [call('inbox_file_item', { file: false })] });
    await say('unfile it');
    model.calls([call('confirm_pending_action')], 'Moved back.');
    await say('yes');
    await waitUntil(() => !store.getState().inbox.reviewedIds.includes(first.id));

    const second = inbox().snapshot().items[1];
    if (second) {
      model.calls([call('inbox_open_item', { target: 'next' })], 'Next one.');
      await say('next');
      await waitUntil(() => openItemId() === second.id);
    }

    model.calls([call('go_back')], 'Closed.');
    await say('close it');
    await waitUntil(() => !openItemId());

    model.calls([call('stop_listening')], 'Microphone off.');
    await say('stop listening');
    expect(store.getState().voice.micActive).toBe(false);
  }, TIMEOUT);

  it('refuses to file without a selected patient, and tells the model why', async () => {
    store.dispatch(setCurrentPatient(null));
    await renderAppAt('/inbox/all', () => !!InboxVoiceRegistry.get());
    await waitUntil(() => !inbox().snapshot().loading);
    model.then({ calls: [call('inbox_open_item', { target: 1 })] }, { calls: [call('inbox_file_item', { file: true })] }, { content: 'Please select the patient first.' });
    await say('file the first record');
    expect(model.lastToolResults().at(-1)?.message).toMatch(/not the selected patient/);
    expect(store.getState().voice.pendingConfirmation).toBeNull();
    expect(store.getState().inbox.reviewedIds).toEqual([]);
  }, TIMEOUT);

  it('explains a position that is not in the list', async () => {
    store.dispatch(setCurrentPatient(john().id));
    await renderAppAt(`/inbox/referral?patient=${john().id}`, () => !!InboxVoiceRegistry.get());
    await waitUntil(() => !inbox().snapshot().loading);
    const count = inbox().snapshot().items.length;
    model.calls([call('inbox_open_item', { target: count + 1 })], 'There are not that many.');
    await say(`open record number ${count + 1}`);
    expect(openItemId()).toBeNull();
    expect(model.lastToolResults()[0].message).toMatch(/There is no .* record — the list has/);
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
    // No assistant confirmation is involved in a click.
    expect(store.getState().voice.pendingConfirmation).toBeNull();
  }, TIMEOUT);
});
