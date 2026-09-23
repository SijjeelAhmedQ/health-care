import { Button, Input, Select, Tooltip } from 'antd';
import { Bookmark, CircleAlert, CircleCheck, Info, RotateCcw, Save, Search, TriangleAlert } from 'lucide-react';
import { categoryMeta, inboxCategories, type InboxCategory } from '@/services/inbox/inboxModel';

export interface InboxFilters {
  patient: string;
  nhi: string;
  date: string;
  phone: string;
  subject?: string;
  status?: string;
  filed: 'all' | 'filed' | 'unfiled';
  category: InboxCategory;
  provider?: string;
  sender?: string;
  ai: 'all' | 'suggestions' | 'attention';
}

export const emptyFilters = (category: InboxCategory): InboxFilters => ({
  patient: '',
  nhi: '',
  date: '',
  phone: '',
  subject: undefined,
  status: undefined,
  filed: 'all',
  category,
  provider: undefined,
  sender: undefined,
  ai: 'all',
});

interface Props {
  value: InboxFilters;
  onChange: (next: Partial<InboxFilters>) => void;
  onSearch: () => void;
  onReset: () => void;
  onSaveCriteria: () => void;
  onLoadSaved: (name: string) => void;
  savedNames: string[];
  /** Distinct values from the items currently in scope. */
  options: { subjects: string[]; statuses: string[]; providers: string[]; senders: string[] };
  counts: { critical: number; high: number; normal: number };
  unfiledCount: number;
  isFiltered: boolean;
}

/**
 * The search strip: patient identifiers first, then the message attributes, then
 * the queue-wide counters. Everything here filters the list that follows.
 */
export function InboxFilterBar({
  value,
  onChange,
  onSearch,
  onReset,
  onSaveCriteria,
  onLoadSaved,
  savedNames,
  options,
  counts,
  unfiledCount,
  isFiltered,
}: Props) {
  const toOptions = (values: string[]) => values.map((v) => ({ value: v, label: v }));

  return (
    <div className="ibx-filterbar">
      <div className="ibx-filter-row">
        <Input
          allowClear
          className="ibx-f ibx-f-patient"
          placeholder="Patient name"
          value={value.patient}
          onChange={(e) => onChange({ patient: e.target.value })}
          onPressEnter={onSearch}
          aria-label="Filter by patient name"
        />
        <Input
          allowClear
          className="ibx-f"
          placeholder="NHI"
          value={value.nhi}
          onChange={(e) => onChange({ nhi: e.target.value })}
          onPressEnter={onSearch}
          aria-label="Filter by NHI"
        />
        <Input
          allowClear
          className="ibx-f"
          placeholder="DD/MM/YYYY"
          value={value.date}
          onChange={(e) => onChange({ date: e.target.value })}
          onPressEnter={onSearch}
          aria-label="Filter by date received"
        />
        <Input
          allowClear
          className="ibx-f"
          placeholder="Phone"
          value={value.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          onPressEnter={onSearch}
          aria-label="Filter by phone"
        />
        <Select
          allowClear
          className="ibx-f ibx-f-wide"
          placeholder="Message Subject (All)"
          value={value.subject}
          onChange={(v) => onChange({ subject: v })}
          options={toOptions(options.subjects)}
          showSearch
          optionFilterProp="label"
          aria-label="Filter by subject"
        />
        <Select
          allowClear
          className="ibx-f"
          placeholder="Status (All)"
          value={value.status}
          onChange={(v) => onChange({ status: v })}
          options={toOptions(options.statuses)}
          aria-label="Filter by status"
        />
        <Select
          className="ibx-f"
          value={value.filed}
          onChange={(v) => onChange({ filed: v })}
          aria-label="Filter by filing state"
          options={[
            { value: 'all', label: 'All' },
            { value: 'unfiled', label: 'Unfiled' },
            { value: 'filed', label: 'Filed' },
          ]}
        />
        <Select
          className="ibx-f ibx-f-wide"
          value={value.category}
          onChange={(v) => onChange({ category: v })}
          aria-label="Filter by category"
          options={inboxCategories.map((c) => ({ value: c, label: categoryMeta[c].label }))}
        />
        <Select
          allowClear
          className="ibx-f ibx-f-wide"
          placeholder="All providers"
          value={value.provider}
          onChange={(v) => onChange({ provider: v })}
          options={toOptions(options.providers)}
          showSearch
          optionFilterProp="label"
          aria-label="Filter by provider"
        />
        <Select
          allowClear
          className="ibx-f ibx-f-wide"
          placeholder="Sender (All)"
          value={value.sender}
          onChange={(v) => onChange({ sender: v })}
          options={toOptions(options.senders)}
          showSearch
          optionFilterProp="label"
          aria-label="Filter by sender"
        />
        <Select
          className="ibx-f ibx-f-narrow"
          value={value.ai}
          onChange={(v) => onChange({ ai: v })}
          aria-label="Filter by AI suggestions"
          options={[
            { value: 'all', label: 'AI (All)' },
            { value: 'suggestions', label: 'Has suggestions' },
            { value: 'attention', label: 'Needs attention' },
          ]}
        />
        <Button className="ibx-btn-reset" icon={<RotateCcw size={13} />} onClick={onReset}>
          Reset
        </Button>
        <Button type="primary" className="ibx-btn-search" icon={<Search size={14} />} onClick={onSearch}>
          Search
        </Button>

        <span className={`ibx-flag ${isFiltered ? 'is-on' : ''}`}>{isFiltered ? '• Filtered' : '• Unfiltered'}</span>
        <Tooltip title="Identifiers narrow the queue; message fields narrow what is left. Results update as you type.">
          <span className="ibx-info" role="img" aria-label="How filtering works">
            <Info size={14} />
          </span>
        </Tooltip>

        <span className="ibx-counters">
          <span className="ibx-counter is-critical">
            <CircleAlert size={12} aria-hidden /> Critical <b>{counts.critical}</b>
          </span>
          <span className="ibx-counter is-high">
            <TriangleAlert size={12} aria-hidden /> High <b>{counts.high}</b>
          </span>
          <span className="ibx-counter is-normal">
            <CircleCheck size={12} aria-hidden /> Normal <b>{counts.normal}</b>
          </span>
        </span>
      </div>

      <div className="ibx-filter-row is-secondary">
        <Tooltip title="The patient and category filters are applied first, then the rest.">
          <span className="ibx-info" role="img" aria-label="Filter order">
            <Info size={14} />
          </span>
        </Tooltip>
        <span className="ibx-applied">Applied: {value.category ? categoryMeta[value.category].label : 'Primary'} filter</span>

        <Select
          className="ibx-saved"
          placeholder="Saved"
          value={undefined}
          onChange={onLoadSaved}
          options={savedNames.map((n) => ({ value: n, label: n }))}
          notFoundContent={<span className="muted">No saved searches yet</span>}
          suffixIcon={<Bookmark size={13} />}
          aria-label="Load a saved search"
        />
        <Button icon={<Save size={13} />} onClick={onSaveCriteria}>
          Save Search Criteria
        </Button>
        <Button onClick={onSearch}>Update &amp; Search</Button>

        <span className="ibx-unfiled">
          Number of Unfiled Records: <b>{unfiledCount}</b>
        </span>
      </div>
    </div>
  );
}
