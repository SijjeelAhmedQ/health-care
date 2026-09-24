/**
 * Inbox filtering, sorting and grouping — kept apart from the components so the
 * rules can be read (and tested) in one place.
 *
 * One search box covers what used to be four identifier fields (patient name,
 * NHI, phone, date received); the attribute filters sit behind a single
 * "Filters" button and show as removable chips once they are in use.
 */
import dayjs from 'dayjs';
import type { Patient } from '@/types/domain';
import { matchesInboxQuery, type InboxItem, type InboxView } from '@/services/inbox/inboxModel';
import { buildSuggestions, priorityOf } from '@/services/inbox/inboxInsights';

export type FiledFilter = 'all' | 'filed' | 'unfiled';
export type AiFilter = 'all' | 'suggestions' | 'attention';
export type ReceivedFilter = 'any' | 'today' | '7d' | '30d' | 'custom';
export type InboxSort = 'newest' | 'oldest' | 'priority' | 'patient';
/** How much each row shows: a preview line (comfortable) or just the essentials (compact). */
export type InboxDensity = 'comfortable' | 'compact';

export interface InboxFilters {
  /** Free text: patient name, NHI, phone, subject, sender, status, date… */
  query: string;
  subject?: string;
  status?: string;
  filed: FiledFilter;
  category: InboxView;
  provider?: string;
  sender?: string;
  ai: AiFilter;
  received: ReceivedFilter;
  /** Custom range, ISO dates (inclusive), used when received = 'custom'. */
  from?: string;
  to?: string;
}

export const emptyFilters = (category: InboxView): InboxFilters => ({
  query: '',
  subject: undefined,
  status: undefined,
  filed: 'all',
  category,
  provider: undefined,
  sender: undefined,
  ai: 'all',
  received: 'any',
  from: undefined,
  to: undefined,
});

/** Filters that narrow the list (the category and the search box are shown elsewhere). */
export function activeFilterCount(f: InboxFilters): number {
  return [f.subject, f.status, f.provider, f.sender, f.filed !== 'all', f.ai !== 'all', f.received !== 'any'].filter(Boolean).length;
}

export const isFiltered = (f: InboxFilters) => activeFilterCount(f) > 0 || f.query.trim() !== '';

/**
 * Saved searches from the previous inbox used separate patient / NHI / phone /
 * date boxes. They still load: those values become the search text.
 */
export function normalizeSaved(saved: Partial<InboxFilters> & Record<string, unknown>, fallback: InboxView): InboxFilters {
  const legacy = ['patient', 'nhi', 'phone', 'date'].map((k) => (typeof saved[k] === 'string' ? (saved[k] as string).trim() : '')).filter(Boolean);
  const base = emptyFilters((saved.category as InboxView | undefined) ?? fallback);
  return {
    ...base,
    query: [typeof saved.query === 'string' ? saved.query : '', ...legacy].filter(Boolean).join(' '),
    subject: saved.subject ?? undefined,
    status: saved.status ?? undefined,
    filed: saved.filed ?? 'all',
    provider: saved.provider ?? undefined,
    sender: saved.sender ?? undefined,
    ai: saved.ai ?? 'all',
    received: saved.received ?? 'any',
    from: saved.from ?? undefined,
    to: saved.to ?? undefined,
  };
}

/** Who ordered, referred or wrote it — the "provider" of an item. */
export const providerOf = (item: InboxItem) =>
  item.meta.find((m) => m.label === 'Ordered by' || m.label === 'Referred by' || m.label === 'Author' || m.label === 'Uploaded by')?.value ?? '';

function receivedMatches(item: InboxItem, f: InboxFilters, now = dayjs()): boolean {
  const at = dayjs(item.receivedAt);
  switch (f.received) {
    case 'today':
      return at.isSame(now, 'day');
    case '7d':
      return !at.isBefore(now.subtract(7, 'day').startOf('day'));
    case '30d':
      return !at.isBefore(now.subtract(30, 'day').startOf('day'));
    case 'custom':
      if (f.from && at.isBefore(dayjs(f.from).startOf('day'))) return false;
      if (f.to && at.isAfter(dayjs(f.to).endOf('day'))) return false;
      return true;
    default:
      return true;
  }
}

export function applyFilters(
  items: InboxItem[],
  f: InboxFilters,
  ctx: { filed: Set<string>; patientById: Map<string, Patient> },
): InboxItem[] {
  return items.filter((item) => {
    if (f.category !== 'all' && item.category !== f.category) return false;
    if (!matchesInboxQuery(item, f.query, ctx.patientById.get(item.patientId))) return false;
    if (f.subject && item.subject !== f.subject) return false;
    if (f.status && item.status !== f.status) return false;
    if (f.filed === 'filed' && !ctx.filed.has(item.id)) return false;
    if (f.filed === 'unfiled' && ctx.filed.has(item.id)) return false;
    if (f.sender && item.from !== f.sender) return false;
    if (f.provider && !item.meta.some((m) => m.value === f.provider)) return false;
    if (f.ai === 'attention' && !item.attention) return false;
    // Every item carries a draft message, so "has suggestions" means more than that.
    if (f.ai === 'suggestions' && buildSuggestions(item).length <= 1) return false;
    if (!receivedMatches(item, f)) return false;
    return true;
  });
}

const priorityRank = { critical: 0, high: 1, normal: 2 } as const;

export function sortItems(items: InboxItem[], sort: InboxSort): InboxItem[] {
  const byNewest = (a: InboxItem, b: InboxItem) => b.receivedAt.localeCompare(a.receivedAt);
  const copy = [...items];
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    case 'priority':
      return copy.sort((a, b) => priorityRank[priorityOf(a)] - priorityRank[priorityOf(b)] || byNewest(a, b));
    case 'patient':
      return copy.sort((a, b) => a.patientName.localeCompare(b.patientName) || byNewest(a, b));
    default:
      return copy.sort(byNewest);
  }
}

export interface ItemGroup {
  key: string;
  label: string;
  items: InboxItem[];
}

/** Section headings that make a long queue scannable: by day, by urgency, or by patient initial. */
export function groupItems(items: InboxItem[], sort: InboxSort, now = dayjs()): ItemGroup[] {
  const groups: ItemGroup[] = [];
  const push = (key: string, label: string, item: InboxItem) => {
    const last = groups[groups.length - 1];
    if (last && last.key.split('#')[0] === key) last.items.push(item);
    // A bucket can only recur if the order is unusual; keep React keys unique regardless.
    else groups.push({ key: groups.some((g) => g.key.split('#')[0] === key) ? `${key}#${groups.length}` : key, label, items: [item] });
  };
  for (const item of items) {
    if (sort === 'priority') {
      const level = priorityOf(item);
      push(level, level === 'critical' ? 'Critical' : level === 'high' ? 'Needs attention' : 'Routine', item);
    } else if (sort === 'patient') {
      const letter = item.patientName.trim()[0]?.toUpperCase() ?? '#';
      push(letter, letter, item);
    } else {
      const at = dayjs(item.receivedAt);
      // Imaging is dated by when it is scheduled, which can be ahead of today.
      if (at.isAfter(now.endOf('day'))) push('upcoming', 'Dated ahead', item);
      else if (at.isSame(now, 'day')) push('today', 'Today', item);
      else if (at.isSame(now.subtract(1, 'day'), 'day')) push('yesterday', 'Yesterday', item);
      else if (at.isAfter(now.subtract(7, 'day').startOf('day'))) push('week', 'Earlier this week', item);
      else push(at.format('YYYY-MM'), at.isSame(now, 'year') ? at.format('MMMM') : at.format('MMMM YYYY'), item);
    }
  }
  return groups;
}

export const receivedLabels: Record<ReceivedFilter, string> = {
  any: 'Any time',
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  custom: 'Custom range',
};

export const sortLabels: Record<InboxSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  priority: 'Most urgent first',
  patient: 'Patient A–Z',
};

/** Removable chips for the filters in use, in reading order. */
export function filterChips(f: InboxFilters): Array<{ key: keyof InboxFilters | 'range'; label: string; clear: Partial<InboxFilters> }> {
  const chips: Array<{ key: keyof InboxFilters | 'range'; label: string; clear: Partial<InboxFilters> }> = [];
  if (f.filed !== 'all') chips.push({ key: 'filed', label: f.filed === 'unfiled' ? 'Unfiled only' : 'Filed only', clear: { filed: 'all' } });
  if (f.ai !== 'all') chips.push({ key: 'ai', label: f.ai === 'attention' ? 'Needs attention' : 'Has suggestions', clear: { ai: 'all' } });
  if (f.status) chips.push({ key: 'status', label: `Status: ${f.status}`, clear: { status: undefined } });
  if (f.received !== 'any') {
    const label =
      f.received === 'custom'
        ? `Received ${f.from ? dayjs(f.from).format('D MMM') : '…'} – ${f.to ? dayjs(f.to).format('D MMM') : '…'}`
        : `Received: ${receivedLabels[f.received].toLowerCase()}`;
    chips.push({ key: 'range', label, clear: { received: 'any', from: undefined, to: undefined } });
  }
  if (f.subject) chips.push({ key: 'subject', label: `Subject: ${f.subject}`, clear: { subject: undefined } });
  if (f.provider) chips.push({ key: 'provider', label: `Provider: ${f.provider}`, clear: { provider: undefined } });
  if (f.sender) chips.push({ key: 'sender', label: `From: ${f.sender}`, clear: { sender: undefined } });
  return chips;
}
