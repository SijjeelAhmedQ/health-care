/**
 * Boot the real application in jsdom.
 *
 * This is the test that catches "it compiles but the page is blank": it renders
 * the actual providers, router, layout and pages, and checks the rules the whole
 * product rests on — you must sign in, you must select a patient before any
 * patient-dependent module renders, and the banner tells you who that is.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { store } from '@/store';
import { login, logout } from '@/store/slices/authSlice';
import { fetchPatients, patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { router } from '@/app/router';
import { installBrowserStubs, pageText, renderAppAt, unmountApp, waitUntil } from './harness';

const TIMEOUT = 30000;

beforeAll(installBrowserStubs);
afterEach(unmountApp);

async function signIn() {
  await store.dispatch(login({ username: 'mreed', password: 'demo' })).unwrap();
  await store.dispatch(fetchPatients()).unwrap();
}

describe('application smoke test', () => {
  beforeEach(() => {
    store.dispatch(setCurrentPatient(null));
  });

  it('renders the sign-in screen when nobody is authenticated', async () => {
    store.dispatch(logout());
    await renderAppAt('/dashboard');
    expect(await waitUntil(() => pageText().includes('Sign in'))).toBe(true);
  }, TIMEOUT);

  it('sends you to the patient list when a module needs a patient', async () => {
    await signIn();
    await renderAppAt('/dashboard', () => pageText().includes('Select a patient to open'));

    // Redirected to the list, told why, and the module has not rendered.
    expect(router.state.location.pathname).toBe('/patients');
    expect(pageText()).toContain('Select a patient to open Dashboard');
    expect(pageText()).not.toContain('Active medications');
  }, TIMEOUT);

  it('starts on the patient list after signing in, then opens the dashboard once a patient is picked', async () => {
    await signIn();
    // The front door: no patient in context yet.
    await renderAppAt('/', () => pageText().includes('Add patient'));
    expect(router.state.location.pathname).toBe('/patients');

    // Picking someone from the list is how the workflow starts.
    const firstRow = document.querySelector('.mobile-card, .table-row-clickable') as HTMLElement | null;
    expect(firstRow, 'the patient list should render selectable rows').not.toBeNull();
    firstRow!.click();

    expect(await waitUntil(() => router.state.location.pathname === '/dashboard')).toBe(true);
    expect(store.getState().patients.currentPatientId).not.toBeNull();
    expect(await waitUntil(() => pageText().includes('Active medications'))).toBe(true);
  }, TIMEOUT);

  it('renders the dashboard and the patient banner once a patient is selected', async () => {
    await signIn();
    const patient = patientSelectors.selectAll(store.getState())[0];
    store.dispatch(setCurrentPatient(patient.id));

    await renderAppAt('/dashboard', () => pageText().includes('Active medications'));

    const text = pageText();
    expect(text).toContain(patient.fullName);
    expect(text).toContain(patient.mrn);
    expect(text).toContain('Active medications');
    // The banner's quick overview of every record type.
    for (const label of ['Medication', 'Diagnosis', 'Task', 'Recall', 'Appointment']) {
      expect(text, `banner is missing ${label}`).toContain(label);
    }
  }, TIMEOUT);

  it('renders the Patient module without a selected patient', async () => {
    await signIn();
    await renderAppAt('/patients');

    const text = pageText();
    expect(text).toContain('Add patient');
    expect(text).toContain('None selected');
  }, TIMEOUT);

  it('renders the Summary module with all six tabs', async () => {
    await signIn();
    store.dispatch(setCurrentPatient(patientSelectors.selectAll(store.getState())[0].id));

    await renderAppAt('/summary', () => pageText().includes('AI Summary'));

    const text = pageText();
    for (const tab of ['AI Summary', 'Medication', 'Recall', 'Appointment', 'Diagnosis', 'Task']) {
      expect(text, `missing tab: ${tab}`).toContain(tab);
    }
    // The AI Summary tab is the default one and is ready to dictate into.
    expect(text).toContain('Dictate what happened');
  }, TIMEOUT);

  it('shows every module in the navigation and nothing else', async () => {
    await signIn();
    store.dispatch(setCurrentPatient(patientSelectors.selectAll(store.getState())[0].id));

    await renderAppAt('/dashboard');

    const text = pageText();
    for (const module of ['Dashboard', 'Patient', 'Medication', 'Diagnosis', 'Task', 'Recall', 'Appointment', 'Summary']) {
      expect(text, `navigation is missing ${module}`).toContain(module);
    }
    for (const removed of ['Providers', 'Roster', 'Practice Management', 'User Management', 'Reports', 'Configuration']) {
      expect(text, `${removed} should no longer exist`).not.toContain(removed);
    }
  }, TIMEOUT);
});
