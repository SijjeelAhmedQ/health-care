/**
 * The assistant → real UI → stored data.
 *
 * A scripted model stands in for Qwen and makes the tool calls; everything
 * after that is the real application: the tools open the real Ant Design
 * dialogs, fill the real fields, and only a confirmation from the user (in a
 * later turn, or the button) writes to the store. The safety rules are proven
 * end to end — no patient, no write; no confirmation, no save or delete; and
 * the model cannot confirm on the user's behalf.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { store } from '@/store';
import { login } from '@/store/slices/authSlice';
import { fetchPatients, patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { fetchProviders } from '@/store/slices/providerSlice';
import dayjs from 'dayjs';
import { appointmentsSlice, diagnosesSlice, recordSlices } from '@/store/slices/recordSlices';
import { RECORD_KINDS } from '@/types/records';
import { voiceActions } from '@/store/slices/voiceSlice';
import { RecordRegistry } from '@/registry/recordRegistry';
import { router } from '@/app/router';
import { call, type ScriptedLLM } from '@/services/ai/__tests__/fakes';
import { installBrowserStubs, pageText, renderAppAt, say, unmountApp, useScriptedModel, waitUntil } from './harness';

const TIMEOUT = 30000;
let model: ScriptedLLM;

beforeAll(installBrowserStubs);

const patientDiagnoses = () => {
  const patientId = store.getState().patients.currentPatientId;
  return diagnosesSlice.selectors.selectAll(store.getState()).filter((d) => d.patientId === patientId);
};
const inputValue = (id: string) => (document.querySelector(`#${id}`) as HTMLInputElement | null)?.value;

beforeEach(async () => {
  store.dispatch(voiceActions.resetVoice());
  await store.dispatch(login({ username: 'sahmed', password: 'demo' })).unwrap();
  await store.dispatch(fetchPatients()).unwrap();
  await store.dispatch(fetchProviders()).unwrap();
  await store.dispatch(diagnosesSlice.fetchAll()).unwrap();
  store.dispatch(setCurrentPatient(patientSelectors.selectAll(store.getState())[0].id));
  model = useScriptedModel();
});

afterEach(unmountApp);

describe('the assistant against the real application', () => {
  it('opens the real diagnosis form from a tool call, and saves only on the user’s later "yes"', async () => {
    await renderAppAt('/summary/diagnosis');
    await waitUntil(() => !!RecordRegistry.get('diagnosis'));
    const before = patientDiagnoses().length;

    // The model asks for the form AND tries to confirm in the same turn: the confirm is refused.
    model.then({ calls: [call('add_diagnoses', { diagnoses: [{ description: 'Hypertension', status: 'Active' }] })] });
    await say('add hypertension as a diagnosis');
    expect(pageText()).toContain('Add Diagnosis');
    expect(inputValue('description')).toBe('Hypertension');
    expect(store.getState().voice.pendingConfirmation?.kind).toBe('form');
    expect(store.getState().voice.response).toMatch(/confirm/i);
    expect(patientDiagnoses()).toHaveLength(before);

    model.calls([call('confirm_pending_action')], 'Saved.');
    await say('yes save it');
    await waitUntil(() => patientDiagnoses().length === before + 1);
    expect(patientDiagnoses().some((d) => d.description === 'Hypertension')).toBe(true);
    expect(store.getState().voice.pendingConfirmation).toBeNull();
  }, TIMEOUT);

  it('a model that tries to save in the same turn it filled the form never gets to — the turn waits for the user', async () => {
    await renderAppAt('/summary/diagnosis');
    await waitUntil(() => !!RecordRegistry.get('diagnosis'));
    const before = patientDiagnoses().length;
    model.then({ calls: [call('add_diagnoses', { diagnoses: [{ description: 'Asthma' }] }), call('confirm_pending_action')] });
    await say('add asthma');
    expect(store.getState().voice.pendingConfirmation?.kind).toBe('form');
    expect(model.requests).toHaveLength(1); // the loop stopped at the confirmation
    expect(patientDiagnoses()).toHaveLength(before);
  }, TIMEOUT);

  it('stages a deletion, shows it, and removes the record only after confirmation', async () => {
    await renderAppAt('/summary/diagnosis');
    await waitUntil(() => !!RecordRegistry.get('diagnosis'));
    model.then({ calls: [call('add_diagnoses', { diagnoses: [{ description: 'Dictated Condition' }] })] });
    await say('add dictated condition');
    model.calls([call('confirm_pending_action')], 'Saved.');
    await say('yes');
    await waitUntil(() => patientDiagnoses().some((d) => d.description === 'Dictated Condition'));
    const before = patientDiagnoses().length;

    model.then({ calls: [call('delete_record', { kind: 'diagnosis', record: 'dictated condition' })] });
    await say('delete the dictated condition');
    expect(store.getState().voice.pendingConfirmation?.kind).toBe('delete');
    expect(pageText()).toContain('will be permanently deleted');
    expect(patientDiagnoses()).toHaveLength(before);

    model.calls([call('cancel_pending_action')], 'Kept it.');
    await say('no keep it');
    expect(store.getState().voice.pendingConfirmation).toBeNull();
    expect(patientDiagnoses()).toHaveLength(before);

    model.then({ calls: [call('delete_record', { kind: 'diagnosis', record: 'Dictated Condition' })] });
    await say('delete it');
    model.calls([call('confirm_pending_action')], 'Deleted.');
    await say('yes delete it');
    await waitUntil(() => patientDiagnoses().length === before - 1);
    expect(patientDiagnoses().some((d) => d.description === 'Dictated Condition')).toBe(false);
  }, TIMEOUT);

  it('arguments that break the schema never reach the app — the error goes back and the model corrects itself', async () => {
    await renderAppAt('/summary/medication');
    await waitUntil(() => !!RecordRegistry.get('medication'));
    const med = { medicationName: 'Metformin', dosage: '500 mg', frequency: 'Twice daily' };
    model.then({ calls: [call('add_medications', { medications: [{ ...med, startDate: 'tomorrow' }] })] }, { calls: [call('add_medications', { medications: [{ ...med, startDate: '2026-09-25' }] })] });
    await say('metformin 500 mg twice daily starting tomorrow');
    expect(model.requests).toHaveLength(2);
    expect(model.requests[1].filter((m) => m.role === 'tool')[0].content).toMatch(/startDate: use YYYY-MM-DD/);
    expect(inputValue('medicationName')).toBe('Metformin');
    expect(store.getState().voice.pendingConfirmation?.kind).toBe('form');
  }, TIMEOUT);

  it('creates, edits and deletes a patient with the real patient form — each write waits for a yes', async () => {
    await renderAppAt('/patients');
    await waitUntil(() => !!RecordRegistry.get('patient'));
    const findOlivia = () => patientSelectors.selectAll(store.getState()).find((p) => p.fullName === 'Olivia Testcase');

    model.then({ calls: [call('create_patient', { firstName: 'Olivia', lastName: 'Testcase', dateOfBirth: '1990-01-10', gender: 'Female', phone: '0300 1234567' })] });
    await say('new patient Olivia Testcase, born 10 January 1990, female, phone 0300 1234567');
    expect(pageText()).toContain('Add Patient');
    expect(inputValue('firstName')).toBe('Olivia');
    expect(findOlivia()).toBeUndefined();
    model.calls([call('confirm_pending_action')], 'Saved.');
    await say('save');
    await waitUntil(() => !!findOlivia());
    expect(findOlivia()).toMatchObject({ dateOfBirth: '1990-01-10', gender: 'Female', phone: '0300 1234567' });

    model.then({ calls: [call('edit_patient', { patient: 'Olivia Testcase', changes: { phone: '0311 7654321' } })] });
    await say("change Olivia Testcase's phone to 0311 7654321");
    expect(pageText()).toContain('Edit Patient');
    expect(findOlivia()!.phone).toBe('0300 1234567');
    model.calls([call('confirm_pending_action')], 'Saved.');
    await say('yes');
    await waitUntil(() => findOlivia()?.phone === '0311 7654321');

    model.then({ calls: [call('delete_patient', { patient: 'Olivia Testcase' })] });
    await say('delete Olivia Testcase');
    expect(store.getState().voice.pendingConfirmation?.recordKind).toBe('patient');
    model.calls([call('confirm_pending_action')], 'Deleted.');
    await say('yes delete');
    await waitUntil(() => !findOlivia());
  }, TIMEOUT);

  it('refuses to add anything while no patient is selected, and says why to the model', async () => {
    store.dispatch(setCurrentPatient(null));
    await renderAppAt('/dashboard');
    model.calls([call('add_medications', { medications: [{ medicationName: 'Aspirin' }] })], 'Please select a patient first.');
    await say('add aspirin');
    expect(model.lastToolResults()[0]).toMatchObject({ ok: false });
    expect(model.lastToolResults()[0].message).toMatch(/no patient is selected/i);
    expect(pageText()).not.toContain('Add Medication');
  }, TIMEOUT);

  it('selecting a patient opens their Summary', async () => {
    store.dispatch(setCurrentPatient(null));
    await renderAppAt('/dashboard');
    const target = patientSelectors.selectAll(store.getState())[5];
    model.calls([call('select_patient', { patient: target.mrn, open_tab: 'summary-medication' })], `Opened ${target.fullName}.`);
    await say(`open ${target.fullName}'s medications`);
    await waitUntil(() => router.state.location.pathname === '/summary/medication');
    expect(store.getState().patients.currentPatientId).toBe(target.id);
  }, TIMEOUT);

  it('answers about the signed-in provider’s own day from their real schedule', async () => {
    await store.dispatch(appointmentsSlice.fetchAll()).unwrap();
    await renderAppAt('/dashboard');
    model.calls([call('get_provider_overview')], 'You have a full day.');
    await say('what does my day look like');
    const result = model.lastToolResults()[0];
    const providerId = store.getState().auth.user!.providerId;
    const mine = appointmentsSlice.selectors.selectAll(store.getState()).filter((a) => a.providerId === providerId);
    expect(result.ok).toBe(true);
    const data = result.data as { provider: string; today: Array<{ id: string }> };
    expect(data.provider).toBe(store.getState().auth.user!.fullName);
    expect(data.today.every((a) => mine.some((m) => m.id === a.id))).toBe(true);
  }, TIMEOUT);

  it('a dictated note lands in the AI Summary and its extracted items are listed for review', async () => {
    await renderAppAt('/summary');
    const note = 'Start amlodipine 5 mg once daily and add hypertension.';
    model
      .calls([call('take_clinical_note', { note })], 'Extracting your note.')
      .then({ calls: [call('record_note_findings', { medications: [{ medicationName: 'Amlodipine', dosage: '5 mg', frequency: 'Once daily', quote: 'Start amlodipine 5 mg once daily' }], diagnoses: [{ description: 'Hypertension' }] })] });
    await say(note);
    await waitUntil(() => router.state.location.pathname === '/summary/ai-summary');
    await waitUntil(() => pageText().includes('Amlodipine'));
    expect(pageText()).toContain('Amlodipine');
    expect(pageText()).toContain('Hypertension');
  }, TIMEOUT);

  it('"give me my dashboard summary" opens the summary beside the Dashboard; the reply stays one line', async () => {
    await store.dispatch(appointmentsSlice.fetchAll()).unwrap();
    await renderAppAt('/patients');
    model.calls([call('dashboard_summary_panel', { open: true })], 'Your summary is on the right.');
    await say('give me my dashboard summary');
    await waitUntil(() => !!document.querySelector('aside[aria-label="Dashboard summary"]'));
    expect(router.state.location.pathname).toBe('/dashboard');
    const panel = document.querySelector('aside[aria-label="Dashboard summary"]')!;
    expect(panel.textContent).toContain("Today's schedule");
    expect(panel.textContent).toContain('Your day');
    expect(model.lastToolResults()[0].message).toBe('Your dashboard summary is open on the right.');
    expect(store.getState().voice.response).toBe('Your summary is on the right.');
    expect(document.querySelector('.app-shell')!.className).toContain('has-right-dock');
  }, TIMEOUT);

  it('"go to patients and select james ahmed and create a task for blood pressure monitoring" — one step after another', async () => {
    store.dispatch(setCurrentPatient(null));
    await renderAppAt('/dashboard');
    model.then(
      { calls: [call('open_page', { page: 'patients' })] },
      { calls: [call('select_patient', { patient: 'James Ahmed' })] },
      { calls: [call('add_tasks', { tasks: [{ title: 'Blood pressure monitoring' }] })] },
    );
    await say('go to patients and select james ahmed and create a task for blood pressure monitoring');
    await waitUntil(() => pageText().includes('Add Task'));
    const selected = patientSelectors.selectById(store.getState(), store.getState().patients.currentPatientId ?? '');
    expect(selected?.fullName).toBe('James Ahmed');
    expect(router.state.location.pathname).toBe('/summary/task');
    expect(inputValue('title')).toBe('Blood pressure monitoring');
    // Nothing is saved until the provider confirms.
    expect(store.getState().voice.pendingConfirmation?.kind).toBe('form');
    expect(model.requests).toHaveLength(3);
  }, TIMEOUT);

  it('one request with medications, a diagnosis, a task, a recall and an appointment fills one care plan, saved together on "yes"', async () => {
    store.dispatch(setCurrentPatient(null));
    for (const kind of RECORD_KINDS) await store.dispatch((recordSlices[kind] as (typeof recordSlices)['medication']).fetchAll()).unwrap();
    await renderAppAt('/patients');
    const med = { dosage: '500 mg', frequency: 'Twice daily', duration: '30 days' };
    const tuesday = dayjs().day() < 2 ? dayjs().day(2) : dayjs().add(1, 'week').day(2);
    model.then({
      calls: [
        call('add_care_plan', {
          patient: 'James Ahmed',
          medications: ['Metformin', 'Panadol', 'Gabapentin', 'Rituximab'].map((medicationName) => ({ medicationName, ...med })),
          diagnoses: [{ description: 'Hypertension' }],
          tasks: [{ title: 'Blood pressure monitoring', category: 'Monitoring' }],
          recalls: [{ reason: 'Follow-up review', dueDate: dayjs().add(2, 'week').format('YYYY-MM-DD') }],
          appointments: [{ date: tuesday.format('YYYY-MM-DD'), startTime: '15:00', type: 'Follow-up', reason: 'Follow-up' }],
        }),
      ],
    });
    await say('goto patients select James Ahmed and add medication metformin, panadol, gabapentin, rituximab 500 mg twice daily for 30 days, add hypertension as a diagnosis, create a task for blood pressure monitoring, recall the patient after two weeks, and schedule a follow-up appointment next Tuesday at 3 pm');
    await waitUntil(() => pageText().includes('Care plan (8)'));

    const patient = patientSelectors.selectById(store.getState(), store.getState().patients.currentPatientId ?? '')!;
    expect(patient.fullName).toBe('James Ahmed');
    expect(router.state.location.pathname.startsWith('/summary')).toBe(true);
    const values = (field: string) => [...document.querySelectorAll<HTMLInputElement>(`.care-plan-modal [id$="_${field}"]`)].map((el) => el.value);
    expect(values('medicationName')).toEqual(['Metformin', 'Panadol', 'Gabapentin', 'Rituximab']);
    expect(values('dosage')).toEqual(['500 mg', '500 mg', '500 mg', '500 mg']);
    expect(values('duration')).toEqual(['30 days', '30 days', '30 days', '30 days']);
    expect(values('description')).toContain('Hypertension');
    expect(values('title')).toEqual(['Blood pressure monitoring']);
    expect(values('reason')).toEqual(['Follow-up review', 'Follow-up']);
    const kindTabs = [...document.querySelectorAll('.care-plan-kinds > .ant-tabs-nav .ant-tabs-tab')].map((t) => t.textContent?.trim());
    expect(kindTabs).toEqual(['Medication4', 'Diagnosis1', 'Task1', 'Recall1', 'Appointment1']);
    expect(store.getState().voice.pendingConfirmation?.formId).toBe('care_plan');

    const owned = (kind: (typeof RECORD_KINDS)[number]) => (recordSlices[kind].selectors.selectAll(store.getState()) as Array<{ patientId: string }>).filter((r) => r.patientId === patient.id).length;
    const before = Object.fromEntries(RECORD_KINDS.map((k) => [k, owned(k)]));
    model.calls([call('confirm_pending_action')], 'Saved.');
    await say('yes save it');
    await waitUntil(() => owned('appointment') === before.appointment + 1);
    expect(owned('medication')).toBe(before.medication + 4);
    expect(owned('diagnosis')).toBe(before.diagnosis + 1);
    expect(owned('task')).toBe(before.task + 1);
    expect(owned('recall')).toBe(before.recall + 1);
    const appt = (appointmentsSlice.selectors.selectAll(store.getState()) as Array<{ patientId: string; date: string; startTime: string }>).filter((a) => a.patientId === patient.id);
    expect(appt.some((a) => a.date === tuesday.format('YYYY-MM-DD') && a.startTime === '15:00')).toBe(true);
    expect(store.getState().voice.pendingConfirmation).toBeNull();
    expect(pageText()).not.toContain('Care plan (');
  }, TIMEOUT);

  it('a record the model adds while the care plan is open joins it as a new tab', async () => {
    await renderAppAt('/summary/medication');
    model.then({ calls: [call('add_care_plan', { medications: [{ medicationName: 'Metformin', dosage: '500 mg', frequency: 'Twice daily' }], tasks: [{ title: 'Blood pressure monitoring' }] })] });
    await say('add metformin 500 mg twice daily and a task for blood pressure monitoring');
    await waitUntil(() => pageText().includes('Care plan (2)'));
    const kindTabs = () => [...document.querySelectorAll('.care-plan-kinds > .ant-tabs-nav .ant-tabs-tab')].map((t) => t.textContent?.trim());
    // Only the kinds that were said get a tab.
    expect(kindTabs()).toEqual(['Medication1', 'Task1']);
    model.then({ calls: [call('add_diagnoses', { diagnoses: [{ description: 'Hypertension' }] })] });
    await say('also add hypertension as a diagnosis');
    await waitUntil(() => pageText().includes('Care plan (3)'));
    expect(kindTabs()).toEqual(['Medication1', 'Diagnosis1', 'Task1']);
    const values = (field: string) => [...document.querySelectorAll<HTMLInputElement>(`.care-plan-modal [id$="_${field}"]`)].map((el) => el.value);
    expect(values('medicationName')).toEqual(['Metformin']);
    expect(values('description')).toContain('Hypertension');
    expect(store.getState().voice.pendingConfirmation?.formId).toBe('care_plan');
  }, TIMEOUT);

  it('filters and pages the real patient list by voice', async () => {
    store.dispatch(setCurrentPatient(null));
    await renderAppAt('/patients', () => pageText().includes('Add patient'));
    const rows = () => document.querySelectorAll('.mobile-card, .table-row-clickable').length;
    await waitUntil(() => rows() > 0);
    model.calls([call('control_list', { filter: 'Gender', value: 'female' })], 'Showing female patients.');
    await say('show only female patients');
    const females = patientSelectors.selectAll(store.getState()).filter((p) => p.gender === 'Female').length;
    await waitUntil(() => pageText().includes(`${females} result`) || pageText().includes(`${females} of`));
    expect(model.lastToolResults()[0].message).toMatch(new RegExp(`patients list shows ${females} of \\d+ \\(Gender: Female\\), page 1 of`));
    model.calls([call('control_list', { page: 'next' })], 'Page 2.');
    await say('next page');
    expect(model.lastToolResults()[0].message).toMatch(/page 2 of/);
    model.calls([call('control_list', { filter: 'Gender', value: 'purple' })], 'Gender can only be Male, Female, Other or Unknown.');
    await say('show only purple patients');
    expect(model.lastToolResults()[0].message).toMatch(/Gender can be: Male, Female, Other, Unknown/);
  }, TIMEOUT);
});
