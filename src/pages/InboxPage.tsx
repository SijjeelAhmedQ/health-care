import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, message } from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchInbox, inboxActions } from '@/store/slices/inboxSlice';
import { patientSelectors } from '@/store/slices/patientSlice';
import { useLocalStorage, useResponsive } from '@/hooks';
import { inboxCategories, type InboxCategory, type InboxItem } from '@/services/inbox/inboxModel';
import { buildSuggestions, countByPriority } from '@/services/inbox/inboxInsights';
import { InboxFilterBar, emptyFilters, type InboxFilters } from '@/components/inbox/InboxFilterBar';
import { InboxMessageList } from '@/components/inbox/InboxMessageList';
import { InboxReadingPane } from '@/components/inbox/InboxReadingPane';
import { InboxAiPanel } from '@/components/inbox/InboxAiPanel';

type ItemFlags = { portal: boolean; confidential: boolean; inactive: boolean };
const noFlags: ItemFlags = { portal: false, confidential: false, inactive: false };

const isCategory = (value?: string): value is InboxCategory => !!value && (inboxCategories as readonly string[]).includes(value);

/**
 * The Inbox: filters across the top, the message queue on the left, the item
 * being read in the middle, and the assistant on the right. Below the desktop
 * breakpoint the three columns stack down to one.
 */
export default function InboxPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { category: categoryParam } = useParams<{ category?: string }>();
  const [params, setParams] = useSearchParams();
  const { isDesktop } = useResponsive();

  const category: InboxCategory = isCategory(categoryParam) ? categoryParam : 'lab';
  const openId = params.get('item') ?? undefined;

  const items = useAppSelector((s) => s.inbox.items);
  const status = useAppSelector((s) => s.inbox.status);
  const loadError = useAppSelector((s) => s.inbox.error);
  const filedIds = useAppSelector((s) => s.inbox.reviewedIds);
  const patients = useAppSelector(patientSelectors.selectAll);
  const currentPatientId = useAppSelector((s) => s.patients.currentPatientId);

  const [filters, setFilters] = useState<InboxFilters>(() => emptyFilters(category));
  const [applied, setApplied] = useState<InboxFilters>(() => emptyFilters(category));
  const [savedSearches, setSavedSearches] = useLocalStorage<Record<string, InboxFilters>>('careflow.inbox.savedSearches', {});
  const [flags, setFlags] = useLocalStorage<Record<string, ItemFlags>>('careflow.inbox.viewFlags', {});

  useEffect(() => {
    if (status === 'idle') void dispatch(fetchInbox());
  }, [dispatch, status]);

  // The route owns the category, so a bookmark or a voice command lands correctly.
  useEffect(() => {
    setFilters((f) => ({ ...f, category }));
    setApplied((f) => ({ ...f, category }));
  }, [category]);

  const filedSet = useMemo(() => new Set(filedIds), [filedIds]);
  const inCategory = useMemo(() => items.filter((i) => i.category === applied.category), [items, applied.category]);
  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  const options = useMemo(
    () => ({
      subjects: [...new Set(inCategory.map((i) => i.subject))].sort().slice(0, 60),
      statuses: [...new Set(inCategory.map((i) => i.status))].sort(),
      providers: [
        ...new Set(
          inCategory
            .map((i) => i.meta.find((m) => m.label === 'Ordered by' || m.label === 'Referred by' || m.label === 'Author' || m.label === 'Uploaded by')?.value ?? '')
            .filter(Boolean),
        ),
      ]
        .sort()
        .slice(0, 60),
      senders: [...new Set(inCategory.map((i) => i.from))].sort().slice(0, 60),
    }),
    [inCategory],
  );

  const filtered = useMemo(() => {
    const f = applied;
    const patientQuery = f.patient.trim().toLowerCase();
    const nhiQuery = f.nhi.trim().toLowerCase();
    const phoneQuery = f.phone.replace(/\D/g, '');
    const dateQuery = f.date.trim();

    return inCategory.filter((item) => {
      if (patientQuery && !item.patientName.toLowerCase().includes(patientQuery)) return false;
      if (nhiQuery && !(patientById.get(item.patientId)?.mrn.toLowerCase() ?? '').includes(nhiQuery)) return false;
      if (phoneQuery && !(patientById.get(item.patientId)?.phone.replace(/\D/g, '') ?? '').includes(phoneQuery)) return false;
      if (dateQuery && !dayjs(item.receivedAt).format('DD/MM/YYYY').includes(dateQuery)) return false;
      if (f.subject && item.subject !== f.subject) return false;
      if (f.status && item.status !== f.status) return false;
      if (f.filed === 'filed' && !filedSet.has(item.id)) return false;
      if (f.filed === 'unfiled' && filedSet.has(item.id)) return false;
      if (f.sender && item.from !== f.sender) return false;
      if (f.provider && !item.meta.some((m) => m.value === f.provider)) return false;
      if (f.ai === 'attention' && !item.attention) return false;
      // Every item carries a draft message, so "has suggestions" means more than that.
      if (f.ai === 'suggestions' && buildSuggestions(item).length <= 1) return false;
      return true;
    });
  }, [inCategory, applied, filedSet, patientById]);

  const openItem = useMemo(() => filtered.find((i) => i.id === openId) ?? items.find((i) => i.id === openId), [filtered, items, openId]);
  const openIndex = useMemo(() => filtered.findIndex((i) => i.id === openId), [filtered, openId]);
  const openPatient = openItem ? patientById.get(openItem.patientId) : undefined;

  const counts = useMemo(() => countByPriority(filtered), [filtered]);
  const unfiledCount = useMemo(() => filtered.filter((i) => !filedSet.has(i.id)).length, [filtered, filedSet]);
  const isFiltered = useMemo(() => {
    const base = emptyFilters(applied.category);
    return (Object.keys(base) as Array<keyof InboxFilters>).some((k) => applied[k] !== base[k]);
  }, [applied]);

  const setParam = useCallback(
    (key: string, value?: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const select = useCallback((item: InboxItem) => setParam('item', item.id), [setParam]);
  const step = (delta: number) => {
    const next = filtered[openIndex + delta];
    if (next) select(next);
  };

  const resetFilters = () => {
    const base = emptyFilters(applied.category);
    setFilters(base);
    setApplied(base);
  };

  const onFilterChange = (next: Partial<InboxFilters>) => {
    const merged = { ...filters, ...next };
    setFilters(merged);
    // The category is a route, not a filter: changing it navigates.
    if (next.category && next.category !== applied.category) {
      navigate(`/inbox/${next.category}`);
      return;
    }
    setApplied(merged);
  };

  const toggleFiled = (item: InboxItem) => {
    if (filedSet.has(item.id)) dispatch(inboxActions.markUnreviewed(item.id));
    else dispatch(inboxActions.markReviewed(item.id));
  };

  const fileAll = () => {
    const ids = filtered.filter((i) => !filedSet.has(i.id)).map((i) => i.id);
    if (!ids.length) return;
    dispatch(inboxActions.markReviewed(ids));
    message.success(`${ids.length} item${ids.length === 1 ? '' : 's'} filed`);
  };

  const itemFlags = openItem ? (flags[openItem.id] ?? noFlags) : noFlags;
  const toggleFlag = (flag: keyof ItemFlags) => {
    if (!openItem) return;
    const current = flags[openItem.id] ?? noFlags;
    setFlags({ ...flags, [openItem.id]: { ...current, [flag]: !current[flag] } });
  };

  return (
    <div className="ibx">
      <InboxFilterBar
        value={filters}
        onChange={onFilterChange}
        onSearch={() => setApplied(filters)}
        onReset={resetFilters}
        onSaveCriteria={() => {
          const name = `${filters.category} · ${dayjs().format('DD/MM HH:mm')}`;
          setSavedSearches({ ...savedSearches, [name]: filters });
          message.success('Search criteria saved');
        }}
        onLoadSaved={(name) => {
          const saved = savedSearches[name];
          if (!saved) return;
          setFilters(saved);
          setApplied(saved);
          if (saved.category !== applied.category) navigate(`/inbox/${saved.category}`);
        }}
        savedNames={Object.keys(savedSearches)}
        options={options}
        counts={counts}
        unfiledCount={unfiledCount}
        isFiltered={isFiltered}
      />

      {status === 'failed' && (
        <Alert
          type="error"
          showIcon
          className="ibx-error"
          message="The inbox could not be loaded"
          description={loadError ?? 'Nothing was changed. Try again, or continue elsewhere in the app.'}
          action={
            <Button size="small" onClick={() => void dispatch(fetchInbox())}>
              Try again
            </Button>
          }
        />
      )}

      <div className={`ibx-body ${!isDesktop && openItem ? 'is-reading' : ''}`}>
        <section className="ibx-col ibx-col-list" aria-label="Inbox items">
          <div className="ibx-col-head">
            <span>
              {filtered.length} item{filtered.length === 1 ? '' : 's'} · {unfiledCount} unfiled
            </span>
            <Button size="small" type="link" onClick={fileAll} disabled={!unfiledCount}>
              File all
            </Button>
          </div>
          <InboxMessageList
            items={filtered}
            loading={status === 'loading' && !items.length}
            selectedId={openId}
            filedIds={filedSet}
            onSelect={select}
            patient={openPatient}
            patientLine={openItem?.preview}
            patientFlag={openItem?.attention ? 'High' : 'Normal'}
            filtersActive={isFiltered}
            onClearFilters={resetFilters}
          />
        </section>

        <section className="ibx-col ibx-col-read" aria-label="Selected item">
          <InboxReadingPane
            item={openItem}
            patient={openPatient}
            filed={!!openItem && filedSet.has(openItem.id)}
            onToggleFiled={toggleFiled}
            position={{ index: openIndex >= 0 ? openIndex + 1 : 0, total: filtered.length }}
            onPrevious={() => step(-1)}
            onNext={() => step(1)}
            flags={itemFlags}
            onToggleFlag={toggleFlag}
            onBack={() => setParam('item', undefined)}
            showBack={!isDesktop}
          />
        </section>

        <section className="ibx-col ibx-col-ai" aria-label="Assistant">
          <InboxAiPanel
            item={openItem}
            patient={openPatient}
            isCurrentPatient={!!openPatient && openPatient.id === currentPatientId}
            unfiledCount={unfiledCount}
          />
        </section>
      </div>
    </div>
  );
}
