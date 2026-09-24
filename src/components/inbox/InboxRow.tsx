import { memo } from 'react';
import { Checkbox } from 'antd';
import { Archive } from 'lucide-react';
import dayjs from 'dayjs';
import type { InboxItem } from '@/services/inbox/inboxModel';
import { priorityOf } from '@/services/inbox/inboxInsights';
import { CategoryMark, PriorityMark, StatusLabel, fullWhen, shortWhen, typeTag } from './inboxUi';

interface Props {
  item: InboxItem;
  selected: boolean;
  isFiled: boolean;
  isChecked: boolean;
  /** The patient's NHI, when the patient is known. */
  mrn?: string;
  showType: boolean;
  /** Both handlers must be stable: a row only re-renders when its own state changes. */
  onSelect: (item: InboxItem) => void;
  onCheck: (ids: string[], on: boolean) => void;
  /** 1-based place in the list, shown while voice control is on. */
  position?: number;
}

/**
 * One queue row. Memoised because the queue holds hundreds of them: opening or
 * ticking an item should repaint two rows, not the whole list.
 */
export const InboxRow = memo(function InboxRow({ item, selected, isFiled, isChecked, mrn, showType, onSelect, onCheck, position }: Props) {
  const critical = priorityOf(item) === 'critical';
  return (
    <li
      data-id={item.id}
      className={`ibx-row ${selected ? 'is-selected' : ''} ${isFiled ? 'is-filed' : 'is-unfiled'} ${item.attention ? 'is-attention' : ''} ${critical ? 'is-critical' : ''} ${isChecked ? 'is-checked' : ''}`}
    >
      <Checkbox
        className="ibx-row-check"
        checked={isChecked}
        onChange={(e) => onCheck([item.id], e.target.checked)}
        aria-label={`Select ${item.subject} for ${item.patientName}`}
      />
      <button
        type="button"
        className="ibx-msg"
        onClick={() => onSelect(item)}
        aria-current={selected ? 'true' : undefined}
        aria-label={`${isFiled ? '' : 'Unfiled. '}${item.attention ? `Needs attention: ${item.attentionReason}. ` : ''}${item.patientName}, ${item.subject}, ${item.status}, received ${dayjs(item.receivedAt).format('D MMMM YYYY')}`}
      >
        <span className="ibx-row-unread" aria-hidden />
        {position !== undefined && (
          <span className="ibx-row-pos" aria-hidden title={`Say “open record ${position}”`}>
            {position}
          </span>
        )}
        <CategoryMark category={item.category} />
        <span className="ibx-row-main">
          <span className="ibx-row-top">
            <span className="ibx-row-patient">{item.patientName}</span>
            {mrn && <span className="ibx-row-nhi">{mrn}</span>}
            {/* Compact rows drop the third line, so urgency and filing move up here as icons. */}
            <span className="ibx-row-marks" aria-hidden>
              <PriorityMark item={item} iconOnly />
              {isFiled && <Archive size={12} className="ibx-row-filed-icon" />}
            </span>
            <time className="ibx-row-time" dateTime={item.receivedAt} title={fullWhen(item.receivedAt)}>
              {shortWhen(item.receivedAt)}
            </time>
          </span>
          <span className="ibx-row-subject">
            {showType && <span className={`ibx-row-type is-${item.category}`}>{typeTag[item.category]}</span>}
            <span className="ibx-row-subject-text">{item.subject}</span>
            {/* compact rows have no third line, so the status joins the subject there */}
            <span className="ibx-row-status-inline">
              <StatusLabel item={item} quiet={item.statusTone !== 'danger'} />
            </span>
          </span>
          <span className="ibx-row-bottom">
            <StatusLabel item={item} quiet={item.statusTone !== 'danger'} />
            <span className="ibx-row-preview">{item.preview}</span>
            <PriorityMark item={item} />
            {isFiled && (
              <span className="ibx-row-filed">
                <Archive size={11} aria-hidden /> Filed
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
});
