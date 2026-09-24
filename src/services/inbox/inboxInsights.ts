/**
 * The summaries and the add-cards shown beside an inbox item.
 *
 * Every card offers the same four record types the application manages
 * (medication, diagnosis, recall, task) plus a message draft. Where the
 * document itself supplies the content — a result value against its own
 * reference range, the indication a requester wrote, the interval a repeat test
 * implies — the card arrives pre-filled and is marked as derived. Where it does
 * not, the card arrives blank for the clinician to complete: nothing clinical
 * is ever invented, and nothing is stored until Add or Save is pressed.
 */
import dayjs from 'dayjs';
import {
  DIAGNOSIS_STATUS_OPTIONS,
  FREQUENCY_OPTIONS,
  RECALL_TYPE_OPTIONS,
  ROUTE_OPTIONS,
  TASK_CATEGORY_OPTIONS,
  TASK_PRIORITY_OPTIONS,
} from '@/registry/fieldRegistry';
import type { InboxItem } from './inboxModel';

export type SuggestionKind = 'medication' | 'diagnosis' | 'recall' | 'task' | 'email';
export type SuggestionFieldType = 'text' | 'textarea' | 'select' | 'date';

export interface SuggestionField {
  /** Matches the field name in the record's form, so values map straight across. */
  key: string;
  label: string;
  type: SuggestionFieldType;
  value: string;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  /** The headline field, shown on the collapsed card. */
  primary?: boolean;
  /** Shown under the headline on the collapsed card. */
  secondary?: boolean;
}

export interface InboxSuggestion {
  id: string;
  kind: SuggestionKind;
  /** Card heading, e.g. "ADD RECALL". */
  label: string;
  /** Primary button, e.g. "Add recall". */
  actionLabel: string;
  fields: SuggestionField[];
  /** Why this was offered, and where its content came from. */
  basis: string;
  /** True when the document supplied the content; false when the card is blank. */
  derived: boolean;
}

const sentence = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

/** One paragraph about this item, quoting its own values. */
export function buildResultSummary(item: InboxItem): string {
  switch (item.category) {
    case 'lab': {
      if (!item.result || item.result.value === '—') return sentence(`${item.subject} has been received from ${item.from}`);
      const range = item.result.referenceRange ? ` (reference ${item.result.referenceRange})` : '';
      const verdict = item.result.abnormal
        ? 'falls outside the reference range and warrants clinical correlation'
        : 'is within the reference range';
      return sentence(`${item.subject} ${item.result.value}${range} ${verdict}`);
    }
    case 'radiology':
      return sentence(`${item.subject} reported by ${item.from}. Clinical indication: ${item.preview}`);
    case 'referral':
      return sentence(`${item.subject} to ${item.from} is ${item.status.toLowerCase()}. Reason given: ${item.preview}`);
    case 'discharge':
      return sentence(`${item.subject} received from ${item.from}, ${item.status.toLowerCase()}`);
  }
}

/** Provenance line added to whatever is created from an inbox item. */
const provenance = (item: InboxItem) =>
  `From ${item.subject} received ${dayjs(item.receivedAt).format('D MMM YYYY')} (${item.from}).`;

/**
 * The four record types, always offered, plus a draft message.
 *
 * `derived` says whether the content came from the document. A blank card is an
 * honest answer: the record says nothing about, say, a medication, so the
 * clinician types it.
 */
export function buildSuggestions(item: InboxItem): InboxSuggestion[] {
  const summary = buildResultSummary(item);
  const needsWork = item.attention || ['Pending', 'Draft', 'Pending Review', 'Sent'].includes(item.status);
  // Only a document that states a problem in words can pre-fill a diagnosis.
  // A number on its own never becomes one.
  const statedCondition = item.category === 'radiology' || item.category === 'referral' ? item.preview : '';

  const recallInterval =
    item.category === 'lab'
      ? { months: 3, reason: `Repeat ${item.subject}`, type: 'Lab Test' }
      : item.category === 'radiology'
        ? { months: 6, reason: `Review ${item.subject}`, type: 'Follow-up' }
        : item.category === 'referral'
          ? { months: 1, reason: `Follow up ${item.subject}`, type: 'Follow-up' }
          : { months: 1, reason: 'Post-discharge review', type: 'Follow-up' };

  return [
    {
      id: `${item.id}:medication`,
      kind: 'medication',
      label: 'ADD MEDICATION',
      actionLabel: 'Add medication',
      derived: false,
      basis: 'No medication is named in this document — enter one to record it against this patient.',
      fields: [
        { key: 'medicationName', label: 'Medication', type: 'text', value: '', required: true, primary: true, placeholder: 'e.g. Amoxicillin' },
        { key: 'dosage', label: 'Dosage', type: 'text', value: '', required: true, placeholder: 'e.g. 500 mg' },
        { key: 'frequency', label: 'Frequency', type: 'select', value: '', options: FREQUENCY_OPTIONS, required: true },
        { key: 'route', label: 'Route', type: 'select', value: 'Oral', options: ROUTE_OPTIONS },
        { key: 'indication', label: 'Indication', type: 'text', value: item.subject },
        { key: 'notes', label: 'Notes', type: 'textarea', value: provenance(item), secondary: true },
      ],
    },
    {
      id: `${item.id}:diagnosis`,
      kind: 'diagnosis',
      label: 'ADD DIAGNOSIS',
      actionLabel: 'Add diagnosis',
      derived: !!statedCondition,
      basis: statedCondition
        ? `Wording taken from the ${item.category === 'radiology' ? 'clinical indication on the report' : 'reason for referral'} — confirm before saving.`
        : 'This document states a result, not a diagnosis. Enter one if you are recording it.',
      fields: [
        {
          key: 'description',
          label: 'Diagnosis',
          type: 'text',
          value: statedCondition,
          required: true,
          primary: true,
          placeholder: 'e.g. Hypertension',
        },
        { key: 'status', label: 'Status', type: 'select', value: 'Active', options: DIAGNOSIS_STATUS_OPTIONS },
        { key: 'onsetDate', label: 'Onset date', type: 'date', value: dayjs(item.receivedAt).format('YYYY-MM-DD') },
        { key: 'notes', label: 'Notes', type: 'textarea', value: `${summary} ${provenance(item)}`, secondary: true },
      ],
    },
    {
      id: `${item.id}:recall`,
      kind: 'recall',
      label: 'ADD RECALL',
      actionLabel: 'Add recall',
      derived: true,
      basis: `Suggested interval for a ${item.category === 'lab' ? 'repeat test' : 'follow-up'} — adjust the date to suit.`,
      fields: [
        { key: 'reason', label: 'Reason', type: 'text', value: recallInterval.reason, required: true, primary: true },
        { key: 'type', label: 'Recall group', type: 'select', value: recallInterval.type, options: RECALL_TYPE_OPTIONS },
        {
          key: 'dueDate',
          label: 'Recall date',
          type: 'date',
          value: dayjs().add(recallInterval.months, 'month').format('YYYY-MM-DD'),
          required: true,
        },
        { key: 'priority', label: 'Priority', type: 'select', value: item.attention ? 'High' : 'Normal', options: ['Normal', 'High'] },
        { key: 'notes', label: 'Notes', type: 'textarea', value: `${summary} ${provenance(item)}`, secondary: true },
      ],
    },
    {
      id: `${item.id}:task`,
      kind: 'task',
      label: 'ADD TASK',
      actionLabel: 'Add task',
      derived: true,
      basis: item.attentionReason ? `${item.attentionReason}.` : `Status is ${item.status.toLowerCase()}.`,
      fields: [
        { key: 'title', label: 'Task', type: 'text', value: `Review ${item.subject}`, required: true, primary: true },
        {
          key: 'category',
          label: 'Category',
          type: 'select',
          value: item.category === 'referral' ? 'Referral' : item.category === 'discharge' ? 'Documentation' : 'Lab Follow-up',
          options: TASK_CATEGORY_OPTIONS,
        },
        {
          key: 'dueDate',
          label: 'Due date',
          type: 'date',
          value: dayjs().add(needsWork ? 3 : 7, 'day').format('YYYY-MM-DD'),
          required: true,
        },
        { key: 'priority', label: 'Priority', type: 'select', value: item.attention ? 'High' : 'Normal', options: TASK_PRIORITY_OPTIONS },
        { key: 'description', label: 'Details', type: 'textarea', value: `${summary} ${provenance(item)}`, secondary: true },
      ],
    },
    {
      id: `${item.id}:email`,
      kind: 'email',
      label: 'DRAFT MESSAGE',
      actionLabel: 'Copy draft',
      derived: true,
      basis: 'Drafted from this item only. Copy it into your usual channel — nothing is sent from here.',
      fields: [
        {
          key: 'message',
          label: 'Message',
          type: 'textarea',
          value: `Kia ora,\n\nYour ${item.subject.toLowerCase()} from ${dayjs(item.receivedAt).format('D MMM YYYY')} has been reviewed. ${summary} Please get in touch if you would like to discuss it.\n\nNgā mihi`,
          primary: true,
        },
      ],
    },
  ];
}

export type PriorityLevel = 'critical' | 'high' | 'normal';

/**
 * How urgently an item wants a clinician: STAT / emergency work is critical,
 * anything flagged for attention (abnormal, declined, unsigned, urgent) is high.
 */
export function priorityOf(item: InboxItem): PriorityLevel {
  if (item.priority === 'STAT' || item.priority === 'Emergency') return 'critical';
  if (item.attention || item.priority === 'Urgent' || item.priority === 'High') return 'high';
  return 'normal';
}

/** Numbers for the priority counters. */
export function countByPriority(items: InboxItem[]): { critical: number; high: number; normal: number } {
  const counts = { critical: 0, high: 0, normal: 0 };
  for (const item of items) counts[priorityOf(item)] += 1;
  return counts;
}
