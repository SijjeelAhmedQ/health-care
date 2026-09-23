/**
 * Voice → real UI → stored data.
 *
 * The executor tests use fake forms; this one drives the actual application:
 * a spoken command opens the real Ant Design dialog, fills the real fields, and
 * only a spoken confirmation writes to the store. It also proves the two safety
 * rules end to end — no patient, no write; no confirmation, no delete.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { store } from '@/store';
import { login } from '@/store/slices/authSlice';
import { fetchPatients, patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { diagnosesSlice } from '@/store/slices/recordSlices';
import { voiceActions } from '@/store/slices/voiceSlice';
import { RecordRegistry } from '@/registry/recordRegistry';
import { installBrowserStubs, pageText, renderAppAt, say, unmountApp, waitUntil } from './harness';

const TIMEOUT = 30000;

beforeAll(installBrowserStubs);

const patientDiagnoses = () => {
  const patientId = store.getState().patients.currentPatientId;
  return diagnosesSlice.selectors.selectAll(store.getState()).filter((d) => d.patientId === patientId);
};

beforeEach(async () => {
  store.dispatch(voiceActions.resetVoice());
  await store.dispatch(login({ username: 'mreed', password: 'demo' })).unwrap();
  await store.dispatch(fetchPatients()).unwrap();
  await store.dispatch(diagnosesSlice.fetchAll()).unwrap();
  store.dispatch(setCurrentPatient(patientSelectors.selectAll(store.getState())[0].id));
});

afterEach(unmountApp);

describe('voice control against the real application', () => {
  it('opens the real diagnosis form, fills it, and saves only after "save it"', async () => {
    await renderAppAt('/diagnoses');
    await waitUntil(() => !!RecordRegistry.get('diagnosis'));
    const before = patientDiagnoses().length;

    await say('add diagnosis hypertension');

    // The dialog is open with the dictated value in it, and nothing has been saved yet.
    expect(pageText()).toContain('Add Diagnosis');
    expect((document.querySelector('#description') as HTMLInputElement | null)?.value).toBe('Hypertension');
    expect(store.getState().voice.pendingConfirmation?.kind).toBe('form');
    expect(patientDiagnoses()).toHaveLength(before);

    await say('save it');
    await waitUntil(() => patientDiagnoses().length === before + 1);

    const after = patientDiagnoses();
    expect(after).toHaveLength(before + 1);
    expect(after.some((d) => d.description === 'Hypertension')).toBe(true);
    expect(store.getState().voice.pendingConfirmation).toBeNull();
  }, TIMEOUT);

  it('stages a spoken deletion and removes the record only after confirmation', async () => {
    await renderAppAt('/diagnoses');
    await waitUntil(() => !!RecordRegistry.get('diagnosis'));

    await say('add diagnosis dictated condition');
    await say('save it');
    await waitUntil(() => patientDiagnoses().some((d) => d.description === 'Dictated Condition'));
    const before = patientDiagnoses().length;

    await say('delete the dictated condition');

    // Staged, shown, and still there.
    const pending = store.getState().voice.pendingConfirmation;
    expect(pending?.kind).toBe('delete');
    expect(pending?.recordKind).toBe('diagnosis');
    expect(pageText()).toContain('will be permanently deleted');
    expect(patientDiagnoses()).toHaveLength(before);

    await say('cancel');
    expect(store.getState().voice.pendingConfirmation).toBeNull();
    expect(patientDiagnoses()).toHaveLength(before);

    await say('delete the dictated condition');
    await say('yes');
    await waitUntil(() => patientDiagnoses().length === before - 1);
    expect(patientDiagnoses().some((d) => d.description === 'Dictated Condition')).toBe(false);
  }, TIMEOUT);

  it('refuses to add anything while no patient is selected', async () => {
    store.dispatch(setCurrentPatient(null));
    await renderAppAt('/patients');

    await say('add diagnosis hypertension');

    expect(store.getState().voice.response).toContain('No patient is selected');
    expect(store.getState().voice.pendingConfirmation).toBeNull();
    expect(pageText()).not.toContain('Add Diagnosis');
  }, TIMEOUT);

  it('switches patient by voice and refreshes the context', async () => {
    await renderAppAt('/dashboard');
    const [first, second] = patientSelectors.selectAll(store.getState());
    expect(store.getState().patients.currentPatientId).toBe(first.id);

    await say(`select patient ${second.fullName}`);
    await waitUntil(() => store.getState().patients.currentPatientId === second.id);

    expect(store.getState().patients.currentPatientId).toBe(second.id);
    expect(await waitUntil(() => pageText().includes(second.fullName))).toBe(true);
  }, TIMEOUT);

  it('reads a record list back for the selected patient', async () => {
    await renderAppAt('/dashboard');
    await say('read the diagnosis list');
    const response = store.getState().voice.response ?? '';
    const expected = patientDiagnoses();
    if (expected.length) expect(response).toContain(expected[0].description);
    else expect(response).toContain('no diagnoses recorded');
  }, TIMEOUT);
});
