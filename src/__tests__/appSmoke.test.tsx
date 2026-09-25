/**
 * Boot the real application in jsdom.
 *
 * This is the test that catches "it compiles but the page is blank": it renders
 * the actual providers, router, layout and pages, and checks the rules the whole
 * product rests on — you sign in as a provider and land on your own dashboard,
 * the Summary needs a selected patient, and every patient record is managed in
 * the Summary's tabs.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { store } from '@/store';
import { login, logout } from '@/store/slices/authSlice';
import { fetchPatients, patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { router } from '@/app/router';
import { fetchProviders } from '@/store/slices/providerSlice';
import { appointmentsSlice } from '@/store/slices/recordSlices';
import { installBrowserStubs, pageText, renderAppAt, unmountApp, waitUntil } from './harness';

const TIMEOUT = 30000;

beforeAll(installBrowserStubs);
afterEach(unmountApp);

async function signIn() {
  await store.dispatch(login({ username: 'sahmed', password: 'demo' })).unwrap();
  await store.dispatch(fetchPatients()).unwrap();
  await store.dispatch(fetchProviders()).unwrap();
  await store.dispatch(appointmentsSlice.fetchAll()).unwrap();
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

  it("lands on the signed-in provider's own dashboard — no patient needed", async () => {
    await signIn();
    await renderAppAt('/', () => pageText().includes("Today's appointments"));
    expect(router.state.location.pathname).toBe('/dashboard');
    const user = store.getState().auth.user!;
    const text = pageText();
    expect(text).toContain(user.fullName);
    for (const section of ["Today's appointments", 'Next 7 days', 'My open tasks', 'Recalls due', 'Unfiled Inbox', "Today's schedule", 'Coming up']) {
      expect(text, `dashboard is missing ${section}`).toContain(section);
    }
    // It is not a patient view: no patient banner.
    expect(document.querySelector('.patient-banner')).toBeNull();
  }, TIMEOUT);

  it('sends you to the patient list when the Summary needs a patient', async () => {
    await signIn();
    await renderAppAt('/summary', () => pageText().includes('Select a patient to open'));
    expect(router.state.location.pathname).toBe('/patients');
    expect(pageText()).toContain('Select a patient to open Summary');
  }, TIMEOUT);

  it('picking a patient from the list opens their Summary, with the patient banner', async () => {
    await signIn();
    await renderAppAt('/patients', () => pageText().includes('Add patient'));
    const firstRow = document.querySelector('.mobile-card, .table-row-clickable') as HTMLElement | null;
    expect(firstRow, 'the patient list should render selectable rows').not.toBeNull();
    firstRow!.click();
    expect(await waitUntil(() => router.state.location.pathname.startsWith('/summary'))).toBe(true);
    const patient = patientSelectors.selectById(store.getState(), store.getState().patients.currentPatientId!)!;
    expect(await waitUntil(() => pageText().includes(patient.mrn))).toBe(true);
    expect(document.querySelector('.patient-banner')).not.toBeNull();
  }, TIMEOUT);

  it('renders the Patient module without a selected patient', async () => {
    await signIn();
    await renderAppAt('/patients');
    const text = pageText();
    expect(text).toContain('Add patient');
    expect(text).toContain('None selected');
  }, TIMEOUT);

  it('the Summary holds every record type, one tab each, managed right there', async () => {
    await signIn();
    store.dispatch(setCurrentPatient(patientSelectors.selectAll(store.getState())[0].id));
    await renderAppAt('/summary/medication', () => pageText().includes('Add medication'));
    const text = pageText();
    for (const tab of ['AI Summary', 'Medications', 'Diagnoses', 'Tasks', 'Recalls', 'Appointments']) {
      expect(text, `missing tab: ${tab}`).toContain(tab);
    }
    // The tab is a full manager: metrics, search and the add button.
    expect(text).toContain('Add medication');
    expect(document.querySelector('.record-tab .metric-grid, .record-tab .metric-card')).not.toBeNull();
  }, TIMEOUT);

  it('the navigation has Dashboard, Patients, Inbox and Summary — the record modules are gone', async () => {
    await signIn();
    store.dispatch(setCurrentPatient(patientSelectors.selectAll(store.getState())[0].id));
    // jsdom has no media queries, so the app renders its phone layout: the bottom navigation.
    await renderAppAt('/dashboard', () => document.querySelectorAll('.mobile-nav-item').length > 0);
    const menu = Array.from(document.querySelectorAll('.mobile-nav-item')).map((el) => el.textContent?.trim());
    expect(menu).toEqual(['Dashboard', 'Patients', 'Inbox', 'Summary', 'Menu']);
    for (const path of ['/medications', '/diagnoses', '/tasks', '/recalls', '/appointments']) {
      await router.navigate(path);
      await waitUntil(() => pageText().includes('Page not found'));
      expect(pageText(), `${path} should no longer exist`).toContain('Page not found');
    }
  }, TIMEOUT);
});
