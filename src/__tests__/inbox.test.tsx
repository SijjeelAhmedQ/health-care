/**
 * The Inbox, driven through the real application.
 *
 * It checks the things the module promises: four queues over existing records,
 * an item opens into the reading pane with its assistant beside it, filing is a
 * presentation state (the underlying records are untouched), and no suggestion
 * can be acted on for anyone but the selected patient.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { store } from '@/store';
import { router } from '@/app/router';
import { login } from '@/store/slices/authSlice';
import { fetchPatients, patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { fetchInbox, inboxActions } from '@/store/slices/inboxSlice';
import { buildInboxItems, inboxCategories } from '@/services/inbox/inboxModel';
import { buildResultSummary, buildSuggestions } from '@/services/inbox/inboxInsights';
import { documentService, imagingOrderService, labOrderService, noteService, referralService } from '@/services/api';
import { installBrowserStubs, pageText, renderAppAt, unmountApp, wait, waitUntil } from './harness';

const TIMEOUT = 30000;

beforeAll(installBrowserStubs);
afterEach(unmountApp);

beforeEach(async () => {
  store.dispatch(inboxActions.markUnreviewed(store.getState().inbox.reviewedIds));
  await store.dispatch(login({ username: 'mreed', password: 'demo' })).unwrap();
  await store.dispatch(fetchPatients()).unwrap();
  await store.dispatch(fetchInbox()).unwrap();
});

const firstRow = () => document.querySelector('.ibx-msg') as HTMLElement | null;
const buttonWith = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

describe('inbox model', () => {
  it('builds one queue from the four existing record types', async () => {
    const [labs, imaging, referrals, notes, documents] = await Promise.all([
      labOrderService.all(),
      imagingOrderService.all(),
      referralService.all(),
      noteService.all(),
      documentService.all(),
    ]);
    const items = buildInboxItems({ labs, imaging, referrals, notes, documents });

    for (const category of inboxCategories) {
      expect(items.filter((i) => i.category === category).length, `no ${category} items`).toBeGreaterThan(0);
    }
    // Only correspondence that has actually arrived belongs in an inbox.
    expect(items.filter((i) => i.category === 'lab').length).toBe(labs.filter((l) => l.status === 'Resulted').length);
    expect(items.filter((i) => i.category === 'radiology').length).toBe(imaging.filter((o) => o.status === 'Reported').length);
    // Newest first.
    const dates = items.map((i) => i.receivedAt);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
    // An abnormal lab is flagged rather than left to be spotted.
    const abnormal = items.find((i) => i.category === 'lab' && i.result?.abnormal);
    expect(abnormal?.attention).toBe(true);
  });

  it('summarises and suggests only from what the record says', async () => {
    const labs = await labOrderService.all();
    const items = buildInboxItems({ labs, imaging: [], referrals: [], notes: [], documents: [] });
    const abnormal = items.find((i) => i.result?.abnormal)!;
    // Routine: in range and not urgent, so nothing is outstanding on it.
    const normal = items.find((i) => i.result && !i.result.abnormal && !i.attention)!;

    // The summary quotes the item's own value and range.
    expect(buildResultSummary(abnormal)).toContain(abnormal.result!.value);
    expect(buildResultSummary(abnormal)).toContain('outside the reference range');
    expect(buildResultSummary(normal)).toContain('within the reference range');

    // A number is never turned into a diagnosis.
    expect(buildSuggestions(abnormal).some((s) => s.kind === 'diagnosis')).toBe(false);
    // An abnormal result does raise follow-up; a routine one only offers a draft.
    expect(buildSuggestions(abnormal).map((s) => s.kind)).toEqual(expect.arrayContaining(['task', 'recall']));
    expect(buildSuggestions(normal).map((s) => s.kind)).toEqual(['email']);
    // Every suggestion states where it came from.
    expect(buildSuggestions(abnormal).every((s) => s.basis.length > 0)).toBe(true);
  });
});

describe('inbox module', () => {
  it('opens on the lab queue with the filter strip in place', async () => {
    await renderAppAt('/inbox', () => !!firstRow());

    expect(router.state.location.pathname).toBe('/inbox/lab');
    const text = pageText();
    for (const control of ['Message Subject (All)', 'Status (All)', 'All providers', 'Sender (All)', 'Search', 'Reset']) {
      expect(text, `filter control missing: ${control}`).toContain(control);
    }
    expect(text).toContain('Number of Unfiled Records:');
    expect(text).toMatch(/Critical|High|Normal/);
  }, TIMEOUT);

  it('each of the four categories is its own route and lists only its own items', async () => {
    for (const [category, label] of [
      ['lab', 'Lab'],
      ['radiology', 'Radiology'],
      ['referral', 'Referrals'],
      ['discharge', 'Discharge Summary'],
    ] as const) {
      await renderAppAt(`/inbox/${category}`, () => pageText().includes('Applied:'));
      const shown = store.getState().inbox.items.filter((i) => i.category === category);
      expect(shown.length, `${category} should have items`).toBeGreaterThan(0);
      expect(pageText(), `${category} header`).toContain(`Applied: ${label} filter`);
      expect(pageText()).toContain(`${shown.length} items`);
      await unmountApp();
    }
  }, TIMEOUT);

  it('opens an item into the reading pane and keeps it in the URL', async () => {
    await renderAppAt('/inbox/lab', () => !!firstRow());

    firstRow()!.click();
    expect(await waitUntil(() => !!new URLSearchParams(router.state.location.search).get('item'))).toBe(true);

    const openId = new URLSearchParams(router.state.location.search).get('item')!;
    const item = store.getState().inbox.items.find((i) => i.id === openId)!;
    expect(await waitUntil(() => pageText().includes('RESULT STATUS'))).toBe(true);

    const text = pageText();
    expect(text).toContain(item.patientName);
    expect(text).toContain('DIAGNOSTIC COMMENTS');
    expect(text).toContain('Order number');
    // The assistant reads the same item.
    expect(text).toContain('Result Summary');
  }, TIMEOUT);

  it('filing an item changes only the inbox view, not the record', async () => {
    const item = store.getState().inbox.items.find((i) => i.category === 'lab')!;
    const before = await labOrderService.get(item.sourceId);

    await renderAppAt('/inbox/lab', () => !!firstRow());
    store.dispatch(inboxActions.markReviewed(item.id));
    await wait(80);

    expect(store.getState().inbox.reviewedIds).toContain(item.id);
    // The lab order itself is exactly as it was.
    expect(await labOrderService.get(item.sourceId)).toEqual(before);
  }, TIMEOUT);

  it('keeps suggested actions bound to the selected patient', async () => {
    const items = store.getState().inbox.items;
    const patients = patientSelectors.selectAll(store.getState());
    // An item that actually raises follow-up, for somebody we are not working on.
    const item = items.find((i) => i.category === 'lab' && i.attention)!;
    const other = patients.find((p) => p.id !== item.patientId)!;
    store.dispatch(setCurrentPatient(other.id));

    await renderAppAt(`/inbox/lab?item=${encodeURIComponent(item.id)}`, () => pageText().includes('Select patient'));

    expect(pageText()).toContain(`Select ${item.patientName} to act on these suggestions`);
    const suggestion = buttonWith('Add task') ?? buttonWith('Add recall');
    expect(suggestion?.disabled, 'suggestions must not be actionable for the wrong patient').toBe(true);

    buttonWith('Select patient')!.click();
    expect(await waitUntil(() => store.getState().patients.currentPatientId === item.patientId)).toBe(true);
    expect(await waitUntil(() => !pageText().includes('to act on these suggestions'))).toBe(true);
    expect(
      await waitUntil(() => {
        const button = buttonWith('Add task') ?? buttonWith('Add recall');
        return !!button && !button.disabled;
      }),
    ).toBe(true);
  }, TIMEOUT);

  it('is reachable without a selected patient', async () => {
    store.dispatch(setCurrentPatient(null));
    await renderAppAt('/inbox/lab', () => pageText().includes('Number of Unfiled Records:'));

    // No redirect to the patient list: the inbox spans patients by design.
    expect(router.state.location.pathname).toBe('/inbox/lab');
    expect(pageText()).not.toContain('Select a patient to open');
  }, TIMEOUT);
});
