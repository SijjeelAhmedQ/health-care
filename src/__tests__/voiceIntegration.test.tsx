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

  it('adds, updates and deletes a patient by voice — saving and deleting only on an explicit word', async () => {
    await renderAppAt('/patients');
    await waitUntil(() => !!RecordRegistry.get('patient'));
    const findOlivia = () => patientSelectors.selectAll(store.getState()).find((p) => p.fullName === 'Olivia Testcase');

    // Add: the form is filled, and nothing is saved until "save patient".
    await say('Add a new patient. First name Olivia, last name Testcase, date of birth January 10 1990, gender female, phone 0300 1234567');
    expect(pageText()).toContain('Add Patient');
    expect((document.querySelector('#firstName') as HTMLInputElement | null)?.value).toBe('Olivia');
    expect(findOlivia()).toBeUndefined();
    await say('save patient');
    await waitUntil(() => !!findOlivia());
    const added = findOlivia()!;
    expect(added).toMatchObject({ dateOfBirth: '1990-01-10', gender: 'Female', phone: '0300 1234567' });

    // Update: only the phone changes, and only after "save changes".
    await say('Update Olivia Testcase, phone number is 0311 7654321');
    expect(pageText()).toContain('Edit Patient');
    expect(findOlivia()!.phone).toBe('0300 1234567');
    await say('save changes');
    await waitUntil(() => findOlivia()?.phone === '0311 7654321');
    expect(findOlivia()).toMatchObject({ id: added.id, dateOfBirth: '1990-01-10', gender: 'Female', phone: '0311 7654321' });

    // Delete: asks first; "no" keeps the patient, "yes, delete" removes them.
    await say('Delete Olivia Testcase');
    expect(store.getState().voice.response).toContain('Do you want me to delete this patient?');
    await say('no');
    expect(findOlivia()).toBeDefined();
    await say('Delete Olivia Testcase');
    await say('yes, delete');
    await waitUntil(() => !findOlivia());
    expect(findOlivia()).toBeUndefined();
  }, TIMEOUT);

  it('fills the real patient form from a pasted paragraph and saves only on "save patient"', async () => {
    await renderAppAt('/patients');
    await waitUntil(() => !!RecordRegistry.get('patient'));
    const find = () => patientSelectors.selectAll(store.getState()).find((p) => p.fullName === 'Nadia Paragraph');

    await say(
      'Add a new patient. Her name is Nadia Paragraph. She was born on 5 March 1985. She is female and married. Her phone number is 0333 5557777 and her email is nadia@example.com. She lives at House 12, Street 5, Gulberg. She works as a teacher. Her blood group is B positive. Her emergency contact is her husband Kamran Paragraph, 0301 7654321.',
    );
    expect(find()).toBeUndefined();
    await say('save patient');
    await waitUntil(() => !!find());
    expect(find()).toMatchObject({
      dateOfBirth: '1985-03-05', gender: 'Female', maritalStatus: 'Married', phone: '0333 5557777', email: 'nadia@example.com', occupation: 'Teacher', bloodGroup: 'B+',
      address: expect.objectContaining({ line1: 'House 12, Street 5, Gulberg' }),
      emergencyContactName: 'Kamran Paragraph', emergencyContactRelation: 'Spouse', emergencyContactPhone: '0301 7654321',
    });
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

  it('docks the dashboard summary on the right and closes it again', async () => {
    await renderAppAt('/medications');

    await say('please show me dashboard summary');
    await waitUntil(() => store.getState().ui.dashboardSummaryOpen);

    // It moved to the dashboard and the widget is on screen with the patient's data.
    expect(store.getState().navigation.currentPageId).toBe('dashboard');
    expect(store.getState().ui.dashboardSummaryOpen).toBe(true);
    const dock = document.querySelector('.dash-dock');
    expect(dock).not.toBeNull();
    expect(dock?.textContent).toContain('Dashboard Summary');
    expect(dock?.textContent).toContain(patientSelectors.selectAll(store.getState())[0].fullName);

    await say('close dashboard summary');
    await waitUntil(() => !store.getState().ui.dashboardSummaryOpen);
    expect(document.querySelector('.dash-dock')).toBeNull();
  }, TIMEOUT);

  it('still understands the dashboard summary when the engine hears "somebody"', async () => {
    await renderAppAt('/medications');

    // What Chrome actually sends back when the user says "summary".
    await say('please show me dashboard somebody');
    await waitUntil(() => store.getState().ui.dashboardSummaryOpen);

    expect(store.getState().navigation.currentPageId).toBe('dashboard');
    expect(document.querySelector('.dash-dock')).not.toBeNull();
    // The panel shows what was understood, and the debug trace keeps what was heard.
    expect(store.getState().voice.transcript).toBe('please show me dashboard summary');
    expect(store.getState().voice.trace?.rawTranscript).toBe('please show me dashboard somebody');

    await say('close dashboard somebody');
    await waitUntil(() => !store.getState().ui.dashboardSummaryOpen);
    expect(document.querySelector('.dash-dock')).toBeNull();
  }, TIMEOUT);

  it('will not dock the dashboard summary without a patient', async () => {
    store.dispatch(setCurrentPatient(null));
    await renderAppAt('/patients');

    await say('show dashboard summary');

    expect(store.getState().voice.response).toContain('No patient is selected');
    expect(store.getState().ui.dashboardSummaryOpen).toBe(false);
    expect(document.querySelector('.dash-dock')).toBeNull();
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
