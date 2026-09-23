/**
 * The summaries and suggested actions shown beside an inbox item.
 *
 * Everything here is derived from the record itself — the result value against
 * its own reference range, the status the sender gave it, the indication the
 * requester wrote. Nothing is inferred beyond what the document states, and no
 * suggestion is saved until the user confirms it in a form.
 */
import dayjs from 'dayjs';
import type { FieldValues } from '@/types/ai';
import type { InboxCategory, InboxItem } from './inboxModel';

export type SuggestionKind = 'diagnosis' | 'recall' | 'task' | 'email';

export interface InboxSuggestion {
  id: string;
  kind: SuggestionKind;
  /** Card heading, e.g. "ADD RECALL". */
  label: string;
  /** Primary button, e.g. "Add recall". */
  actionLabel: string;
  /** Editable body text the user reviews. */
  text: string;
  /** Pre-fill for the application's existing form. */
  prefill: FieldValues;
  /** Where the suggestion came from, so it can be judged. */
  basis: string;
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

/** Follow-up the record itself points to. An empty list is a valid answer. */
export function buildSuggestions(item: InboxItem): InboxSuggestion[] {
  const out: InboxSuggestion[] = [];
  const needsWork = item.attention || ['Pending', 'Draft', 'Pending Review', 'Sent'].includes(item.status);

  // Diagnosis — only where the document states a clinical problem in words. A
  // number on its own is never turned into a diagnosis.
  const statesCondition = (item.category === 'radiology' || item.category === 'referral') && !!item.preview;
  if (statesCondition) {
    out.push({
      id: `${item.id}:diagnosis`,
      kind: 'diagnosis',
      label: 'ADD DIAGNOSIS',
      actionLabel: 'Add diagnosis',
      text: item.preview,
      basis: `Wording taken from the ${item.category === 'radiology' ? 'clinical indication on the report' : 'reason for referral'} — confirm before saving.`,
      prefill: {
        description: item.preview,
        status: 'Active',
        notes: `Recorded from ${item.subject} received ${dayjs(item.receivedAt).format('D MMM YYYY')} (${item.from}).`,
      },
    });
  }

  if (needsWork) {
    const dueDate = dayjs().add(item.attention ? 3 : 7, 'day').format('YYYY-MM-DD');
    out.push({
      id: `${item.id}:task`,
      kind: 'task',
      label: 'ADD TASK',
      actionLabel: 'Add task',
      text: item.attentionReason ? `${item.subject} — ${item.attentionReason.toLowerCase()}. Review and action.` : `Review ${item.subject} and action.`,
      basis: item.attentionReason ?? `Status is ${item.status.toLowerCase()}.`,
      prefill: {
        title: `Review ${item.subject}`,
        category: item.category === 'referral' ? 'Referral' : item.category === 'discharge' ? 'Documentation' : 'Lab Follow-up',
        priority: item.attention ? 'High' : 'Normal',
        dueDate,
        description: buildResultSummary(item),
      },
    });
  }

  // Recall — repeat testing or a review interval the item implies.
  const recallInterval: Partial<Record<InboxCategory, { months: number; reason: string; type: string }>> = {
    lab: { months: 3, reason: `Repeat ${item.subject}`, type: 'Lab Test' },
    radiology: { months: 6, reason: `Review ${item.subject}`, type: 'Follow-up' },
    referral: { months: 1, reason: `Follow up ${item.subject}`, type: 'Follow-up' },
    discharge: { months: 1, reason: `Post-discharge review`, type: 'Follow-up' },
  };
  const recall = recallInterval[item.category];
  if (recall && needsWork) {
    out.push({
      id: `${item.id}:recall`,
      kind: 'recall',
      label: 'ADD RECALL',
      actionLabel: 'Add recall',
      text: `${recall.reason} in ${recall.months} month${recall.months === 1 ? '' : 's'}. ${buildResultSummary(item)}`,
      basis: `Suggested interval for a ${item.category === 'lab' ? 'repeat test' : 'follow-up'} — adjust the date to suit.`,
      prefill: {
        reason: recall.reason,
        type: recall.type,
        dueDate: dayjs().add(recall.months, 'month').format('YYYY-MM-DD'),
        priority: item.attention ? 'High' : 'Normal',
        notes: buildResultSummary(item),
      },
    });
  }

  // A draft the user can copy — the application does not send messages.
  out.push({
    id: `${item.id}:email`,
    kind: 'email',
    label: 'DRAFT MESSAGE',
    actionLabel: 'Copy draft',
    text: `Kia ora,\n\nYour ${item.subject.toLowerCase()} from ${dayjs(item.receivedAt).format('D MMM YYYY')} has been reviewed. ${buildResultSummary(item)} Please get in touch if you would like to discuss it.\n\nNgā mihi`,
    basis: 'Drafted from this item only. Copy it into your usual channel — nothing is sent from here.',
    prefill: {},
  });

  return out;
}

/** Numbers for the priority counters in the filter bar. */
export function countByPriority(items: InboxItem[]): { critical: number; high: number; normal: number } {
  let critical = 0;
  let high = 0;
  let normal = 0;
  for (const item of items) {
    if (item.priority === 'STAT' || item.priority === 'Emergency') critical += 1;
    else if (item.attention || item.priority === 'Urgent' || item.priority === 'High') high += 1;
    else normal += 1;
  }
  return { critical, high, normal };
}
