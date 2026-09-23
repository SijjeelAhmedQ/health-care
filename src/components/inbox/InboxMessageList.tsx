import { useCallback, useRef, type KeyboardEvent } from 'react';
import { Button, Tooltip } from 'antd';
import { ChevronDown, Filter, Pin } from 'lucide-react';
import dayjs from 'dayjs';
import { EmptyState } from '@/components/common';
import type { Patient } from '@/types/domain';
import type { InboxItem } from '@/services/inbox/inboxModel';

interface Props {
  items: InboxItem[];
  loading: boolean;
  selectedId?: string;
  filedIds: Set<string>;
  onSelect: (item: InboxItem) => void;
  /** Header card: the patient the current selection belongs to. */
  patient?: Patient;
  patientLine?: string;
  patientFlag?: 'High' | 'Normal';
  onClearFilters: () => void;
  filtersActive: boolean;
}

function Skeleton() {
  return (
    <div className="ibx-skeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the inbox…</span>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="ibx-skeleton-row">
          <span className="ibx-sk ibx-sk-title" />
          <span className="ibx-sk ibx-sk-date" />
        </div>
      ))}
    </div>
  );
}

/**
 * The message column: who the thread is about, then every item for them in
 * date order. Unfiled items stay visually loud until they are dealt with.
 */
export function InboxMessageList({
  items,
  loading,
  selectedId,
  filedIds,
  onSelect,
  patient,
  patientLine,
  patientFlag,
  onClearFilters,
  filtersActive,
}: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('.ibx-msg') ?? []);
    const index = buttons.findIndex((b) => b === document.activeElement);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    if (next >= 0 && next < buttons.length) {
      event.preventDefault();
      buttons[next].focus();
      buttons[next].click();
    }
  }, []);

  return (
    <div className="ibx-messages">
      {patient && (
        <div className="ibx-patient-card">
          <span className="ibx-avatar" aria-hidden>
            {patient.firstName[0]}
            {patient.lastName[0]}
          </span>
          <div className="ibx-patient-card-main">
            <div className="ibx-patient-card-top">
              <strong>{patient.fullName}</strong>
              <span className="ibx-patient-card-icons">
                <Tooltip title="This patient stays at the top while you work through their items">
                  <Pin size={13} aria-label="Pinned patient" />
                </Tooltip>
                <Filter size={13} aria-hidden />
                <ChevronDown size={13} aria-hidden />
              </span>
            </div>
            <div className="ibx-patient-card-nhi">
              NHI: {patient.mrn} · {patient.age}y
            </div>
            {patientLine && <p className="ibx-patient-card-line">{patientLine}</p>}
            {patientFlag && <span className={`ibx-flagpill is-${patientFlag.toLowerCase()}`}>{patientFlag}</span>}
          </div>
        </div>
      )}

      {loading ? (
        <Skeleton />
      ) : !items.length ? (
        <div className="ibx-messages-empty">
          <EmptyState
            title={filtersActive ? 'Nothing matches these filters' : 'Nothing in this queue'}
            description={filtersActive ? 'Widen the dates or clear the filters to see everything again.' : 'New results, reports, referrals and summaries will appear here as they arrive.'}
            action={filtersActive ? <Button onClick={onClearFilters}>Reset filters</Button> : undefined}
          />
        </div>
      ) : (
        <ul className="ibx-msglist" ref={listRef} onKeyDown={onKeyDown} aria-label="Inbox items">
          {items.map((item) => {
            const filed = filedIds.has(item.id);
            const selected = item.id === selectedId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`ibx-msg ${selected ? 'is-selected' : ''} ${filed ? 'is-filed' : 'is-unfiled'} ${item.attention ? 'is-attention' : ''}`}
                  onClick={() => onSelect(item)}
                  aria-current={selected ? 'true' : undefined}
                  aria-label={`${item.subject}, ${item.patientName}, ${dayjs(item.receivedAt).format('D MMMM YYYY')}, ${item.status}${filed ? ', filed' : ', unfiled'}`}
                >
                  <span className="ibx-msg-title">{item.subject}</span>
                  <span className="ibx-msg-date">{dayjs(item.receivedAt).format('DD/MM/YYYY')}</span>
                  <span className="ibx-msg-patient">{item.patientName}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
