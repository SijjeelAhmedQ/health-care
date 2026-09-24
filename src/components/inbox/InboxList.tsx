import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Checkbox, Dropdown, Tooltip } from 'antd';
import { Archive, ArchiveRestore, CheckCheck, Ellipsis, FilterX, RefreshCw, SearchX, ServerCrash, X } from 'lucide-react';
import type { Patient } from '@/types/domain';
import { categoryMeta, type InboxItem, type InboxView } from '@/services/inbox/inboxModel';
import type { ItemGroup } from './inboxFilters';
import { CategoryIcon, viewLabel } from './inboxUi';
import { InboxRow } from './InboxRow';

interface Props {
  groups: ItemGroup[];
  view: InboxView;
  /** Name each row's type in words — needed when several types share the list. */
  showType: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedId?: string;
  filed: Set<string>;
  patientById: Map<string, Patient>;
  onSelect: (item: InboxItem) => void;
  /** Rows ticked for a bulk action. */
  checked: Set<string>;
  onCheck: (ids: string[], on: boolean) => void;
  onBulkFile: (ids: string[], file: boolean) => void;
  /** Items in this list that are not filed yet. */
  unfiledCount: number;
  /** Why the list might be empty, so the empty state can say the right thing. */
  emptyReason: { anyInView: boolean; anyAtAll: boolean; query: string; filtered: boolean; onlyUnfiled: boolean };
  onClearSearch: () => void;
  onClearFilters: () => void;
  onShowFiled: () => void;
  /** Number the rows (1, 2, 3…) so a spoken "open the third record" can be matched by eye. */
  showPositions?: boolean;
}

function SkeletonRows() {
  return (
    <div className="ibx-skel" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the inbox…</span>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="ibx-skel-row" style={{ animationDelay: `${i * 70}ms` }}>
          <span className="ibx-sk ibx-sk-mark" />
          <div className="ibx-skel-lines">
            <span className="ibx-sk" style={{ width: `${48 + ((i * 17) % 30)}%` }} />
            <span className="ibx-sk" style={{ width: `${62 + ((i * 11) % 25)}%` }} />
            <span className="ibx-sk is-thin" style={{ width: `${40 + ((i * 23) % 35)}%` }} />
          </div>
          <span className="ibx-sk ibx-sk-time" />
        </div>
      ))}
    </div>
  );
}

function ListState({ icon, title, children, action, tone }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode; tone?: 'success' | 'danger' }) {
  return (
    <div className={`ibx-state ${tone ? `is-${tone}` : ''}`} role="status">
      <span className="ibx-state-icon">{icon}</span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="ibx-state-action">{action}</div>}
    </div>
  );
}

/**
 * The queue. Each row answers, in reading order: who is it about, what is it,
 * what state is it in, and does it need me first. Everything else waits for
 * the detail view.
 */
export function InboxList({
  groups,
  view,
  showType,
  loading,
  error,
  onRetry,
  selectedId,
  filed,
  patientById,
  onSelect,
  checked,
  onCheck,
  onBulkFile,
  unfiledCount,
  emptyReason,
  onClearSearch,
  onClearFilters,
  onShowFiled,
  showPositions,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const items = groups.flatMap((g) => g.items);
  const ids = items.map((i) => i.id);
  const checkedHere = ids.filter((id) => checked.has(id));
  const allChecked = !!ids.length && checkedHere.length === ids.length;

  // Keep the open row in view when it changes from the keyboard or from Next / Previous.
  useEffect(() => {
    if (!selectedId) return;
    const row = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-id]') ?? []).find((el) => el.dataset.id === selectedId);
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedId]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
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

  const head = (
    <div className={`ibx-listhead ${checkedHere.length ? 'is-bulk' : ''}`}>
      <Checkbox
        className="ibx-listhead-check"
        checked={allChecked}
        indeterminate={!!checkedHere.length && !allChecked}
        disabled={!ids.length}
        onChange={(e) => onCheck(ids, e.target.checked)}
        aria-label={allChecked ? 'Deselect all items' : 'Select all items in this list'}
      />
      {checkedHere.length ? (
        <>
          <span className="ibx-listhead-text">
            <b>{checkedHere.length}</b> selected
          </span>
          <div className="ibx-listhead-actions">
            <Button size="small" type="primary" icon={<Archive size={13} />} onClick={() => onBulkFile(checkedHere, true)}>
              File
            </Button>
            <Button size="small" icon={<ArchiveRestore size={13} />} onClick={() => onBulkFile(checkedHere, false)}>
              Unfile
            </Button>
            <Tooltip title="Clear selection">
              <Button size="small" type="text" icon={<X size={14} />} onClick={() => onCheck(checkedHere, false)} aria-label="Clear selection" />
            </Tooltip>
          </div>
        </>
      ) : (
        <>
          <span className="ibx-listhead-text">
            {items.length} item{items.length === 1 ? '' : 's'}
            <span className="ibx-listhead-sep" aria-hidden>
              ·
            </span>
            <span className={unfiledCount ? 'ibx-listhead-unfiled' : undefined}>{unfiledCount} unfiled</span>
          </span>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [{ key: 'file-all', icon: <CheckCheck size={14} />, label: `File all ${unfiledCount} unfiled`, disabled: !unfiledCount }],
              onClick: () => onBulkFile(items.filter((i) => !filed.has(i.id)).map((i) => i.id), true),
            }}
          >
            <Button size="small" type="text" icon={<Ellipsis size={16} />} aria-label="List actions" />
          </Dropdown>
        </>
      )}
    </div>
  );

  let body: ReactNode;
  if (loading) body = <SkeletonRows />;
  else if (error && !emptyReason.anyAtAll)
    body = (
      <ListState
        tone="danger"
        icon={<ServerCrash size={26} />}
        title="The inbox could not be loaded"
        action={
          <Button type="primary" icon={<RefreshCw size={14} />} onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {error}. Nothing was changed — try again, or carry on elsewhere and come back.
      </ListState>
    );
  else if (!items.length) {
    const { anyInView, anyAtAll, query, filtered, onlyUnfiled } = emptyReason;
    if (!anyAtAll)
      body = (
        <ListState icon={<CheckCheck size={26} />} tone="success" title="Your inbox is empty">
          New lab results, radiology reports, referrals and discharge summaries appear here as they arrive.
        </ListState>
      );
    else if (!anyInView)
      body = (
        <ListState icon={<CategoryIcon view={view} size={26} />} title={`No ${view === 'all' ? 'items' : categoryMeta[view].plural} yet`}>
          {view === 'all' ? 'Nothing has arrived yet.' : categoryMeta[view].emptyHint.replace(' for this selection', '')}
        </ListState>
      );
    else if (onlyUnfiled)
      body = (
        <ListState
          icon={<CheckCheck size={26} />}
          tone="success"
          title="All caught up"
          action={<Button onClick={onShowFiled}>Show filed items</Button>}
        >
          Every {view === 'all' ? 'item' : categoryMeta[view].singular} here has been filed.
        </ListState>
      );
    else if (query && !filtered)
      body = (
        <ListState icon={<SearchX size={26} />} title={`No results for “${query}”`} action={<Button onClick={onClearSearch}>Clear search</Button>}>
          Search looks at patient name, NHI, phone, test or subject, sender and date. Check the spelling, or try fewer words.
        </ListState>
      );
    else
      body = (
        <ListState
          icon={<FilterX size={26} />}
          title="Nothing matches these filters"
          action={
            <Button type="primary" onClick={onClearFilters}>
              Clear all filters
            </Button>
          }
        >
          Remove a filter or two to widen the list{view !== 'all' ? `, or look in All` : ''}.
        </ListState>
      );
  } else {
    let position = 0;
    body = (
      <div className={`ibx-msglist ${checkedHere.length ? 'has-checked' : ''} ${showPositions ? 'has-positions' : ''}`} ref={listRef} onKeyDown={onKeyDown} aria-label={`${viewLabel[view]} items`} data-scroll-region="inbox-list">
        {groups.map((group) => (
          <section key={group.key} className="ibx-group" aria-label={group.label}>
            <h3 className="ibx-group-head">
              {group.label}
              <span>{group.items.length}</span>
            </h3>
            <ul>
              {group.items.map((item) => (
                <InboxRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  isFiled={filed.has(item.id)}
                  isChecked={checked.has(item.id)}
                  mrn={patientById.get(item.patientId)?.mrn}
                  showType={showType}
                  onSelect={onSelect}
                  onCheck={onCheck}
                  position={showPositions ? ++position : undefined}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="ibx-list">
      {head}
      {error && emptyReason.anyAtAll && (
        <div className="ibx-list-warn" role="alert">
          <span>Couldn’t refresh — showing what was loaded before.</span>
          <Button size="small" type="link" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      {body}
    </div>
  );
}
