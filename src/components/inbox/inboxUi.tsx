/**
 * The Inbox's small visual vocabulary, shared by the list and the detail view:
 * what each category looks like, how a status reads, how urgency is marked and
 * how a timestamp is written. Colour is never the only signal — every mark
 * carries an icon and words.
 */
import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, CircleDot, CircleMinus, Clock3, FileText, FlaskConical, Inbox, ScanLine, Send, TriangleAlert } from 'lucide-react';
import dayjs from 'dayjs';
import { categoryMeta, type InboxCategory, type InboxItem, type InboxView, type StatusTone } from '@/services/inbox/inboxModel';
import { priorityOf } from '@/services/inbox/inboxInsights';

export const viewLabel: Record<InboxView, string> = {
  all: 'All',
  lab: categoryMeta.lab.label,
  radiology: categoryMeta.radiology.label,
  referral: categoryMeta.referral.label,
  discharge: categoryMeta.discharge.label,
};

/** Short labels where horizontal space is tight. */
export const viewShortLabel: Record<InboxView, string> = {
  all: 'All',
  lab: 'Lab',
  radiology: 'Radiology',
  referral: 'Referrals',
  discharge: 'Discharge',
};

/** The type named in one word, for rows where several types share the list. */
export const typeTag: Record<InboxCategory, string> = {
  lab: 'Lab',
  radiology: 'Radiology',
  referral: 'Referral',
  discharge: 'Discharge',
};

export function CategoryIcon({ view, size = 15 }: { view: InboxView; size?: number }) {
  const props = { size, 'aria-hidden': true, strokeWidth: 1.9 } as const;
  switch (view) {
    case 'lab':
      return <FlaskConical {...props} />;
    case 'radiology':
      return <ScanLine {...props} />;
    case 'referral':
      return <Send {...props} />;
    case 'discharge':
      return <FileText {...props} />;
    default:
      return <Inbox {...props} />;
  }
}

/** The tinted square that identifies an item's type at a glance. */
export function CategoryMark({ category, size = 'md' }: { category: InboxCategory; size?: 'sm' | 'md' }) {
  return (
    <span className={`ibx-catmark is-${category} is-${size}`} title={categoryMeta[category].label}>
      <CategoryIcon view={category} size={size === 'sm' ? 13 : 15} />
    </span>
  );
}

const toneIcon: Record<StatusTone, ReactNode> = {
  danger: <CircleAlert size={13} aria-hidden />,
  warning: <Clock3 size={13} aria-hidden />,
  success: <CircleCheck size={13} aria-hidden />,
  info: <CircleDot size={13} aria-hidden />,
  neutral: <CircleMinus size={13} aria-hidden />,
};

/** A status in words, with an icon for its tone. */
export function StatusLabel({ item, quiet }: { item: InboxItem; quiet?: boolean }) {
  return (
    <span className={`ibx-status is-${item.statusTone} ${quiet ? 'is-quiet' : ''}`}>
      {toneIcon[item.statusTone]}
      {item.status}
    </span>
  );
}

/** Urgency, only when there is some: routine items carry no mark at all. */
export function PriorityMark({ item, withReason, iconOnly }: { item: InboxItem; withReason?: boolean; iconOnly?: boolean }) {
  const level = priorityOf(item);
  if (level === 'normal') return null;
  const label = level === 'critical' ? item.priority ?? 'Critical' : 'Attention';
  if (iconOnly)
    return (
      <span className={`ibx-priority-icon is-${level}`} title={item.attentionReason ?? label}>
        {level === 'critical' ? <CircleAlert size={13} aria-hidden /> : <TriangleAlert size={13} aria-hidden />}
      </span>
    );
  return (
    <span className={`ibx-priority is-${level}`} title={item.attentionReason ?? `${item.priority} priority`}>
      {level === 'critical' ? <CircleAlert size={12} aria-hidden /> : <TriangleAlert size={12} aria-hidden />}
      <span>{withReason && item.attentionReason ? item.attentionReason : label}</span>
    </span>
  );
}

/** "14:05" today, "Yesterday", "Mon" this week, "12 Sep" this year, "12 Sep 2025" before. */
export function shortWhen(iso: string, now = dayjs()): string {
  const at = dayjs(iso);
  if (at.isAfter(now.endOf('day'))) return at.format('D MMM');
  if (at.isSame(now, 'day')) return at.format('HH:mm');
  if (at.isSame(now.subtract(1, 'day'), 'day')) return 'Yesterday';
  if (at.isAfter(now.subtract(6, 'day').startOf('day'))) return at.format('ddd');
  if (at.isSame(now, 'year')) return at.format('D MMM');
  return at.format('D MMM YYYY');
}

export const fullWhen = (iso: string) => dayjs(iso).format('dddd D MMMM YYYY, HH:mm');

/** "3 days ago" — used next to the full date in the detail header. */
export function relativeWhen(iso: string, now = dayjs()): string {
  const at = dayjs(iso);
  const days = now.startOf('day').diff(at.startOf('day'), 'day');
  if (days < 0) return `in ${-days} day${days === -1 ? '' : 's'}`;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  const months = now.diff(at, 'month');
  if (months < 12) return `${Math.max(1, months)} month${months <= 1 ? '' : 's'} ago`;
  const years = now.diff(at, 'year');
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
