import { useMemo, useState, type Key, type ReactNode } from 'react';
import { Button, Card, Checkbox, Dropdown, Input, Select, Table, Tooltip, type TableProps } from 'antd';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { Columns3, Download, Search, X } from 'lucide-react';
import { EmptyState } from '@/components/common';
import { useDebouncedValue } from '@/hooks';

export interface FilterDef {
  key: string;
  label: string;
  options: string[];
  /** Custom accessor when the filter key is not a plain property */
  accessor?: (row: never) => string;
}

export type DataColumn<T> = ColumnType<T> & { key: string; title: ReactNode; hideable?: boolean; defaultHidden?: boolean };

interface Props<T extends object> {
  columns: DataColumn<T>[];
  data: T[] | undefined;
  loading?: boolean;
  rowKey: keyof T & string;
  /** Row properties to full-text search */
  searchKeys?: Array<keyof T & string>;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  onSelectionChange?: (keys: Key[], rows: T[]) => void;
  toolbarExtra?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  pageSize?: number;
  size?: TableProps<T>['size'];
  /** Externally controlled search text (e.g. from ?q= or voice) */
  search?: string;
  onSearchChange?: (value: string) => void;
  title?: ReactNode;
  card?: boolean;
  exportable?: boolean;
  expandable?: TableProps<T>['expandable'];
  summary?: TableProps<T>['summary'];
}

export function DataTable<T extends object>({
  columns,
  data,
  loading,
  rowKey,
  searchKeys,
  searchPlaceholder = 'Search…',
  filters = [],
  onRowClick,
  selectable,
  onSelectionChange,
  toolbarExtra,
  emptyTitle,
  emptyDescription,
  emptyAction,
  pageSize = 10,
  size = 'middle',
  search: controlledSearch,
  onSearchChange,
  title,
  card = true,
  exportable,
  expandable,
  summary,
}: Props<T>) {
  const [internalSearch, setInternalSearch] = useState('');
  const search = controlledSearch ?? internalSearch;
  const setSearch = (v: string) => (onSearchChange ? onSearchChange(v) : setInternalSearch(v));
  const debounced = useDebouncedValue(search, 200);
  const [activeFilters, setActiveFilters] = useState<Record<string, string | undefined>>({});
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)));
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data;
    if (debounced.trim() && searchKeys?.length) {
      const q = debounced.trim().toLowerCase();
      rows = rows.filter((r) => searchKeys.some((k) => String((r as Record<string, unknown>)[k] ?? '').toLowerCase().includes(q)));
    }
    for (const [key, value] of Object.entries(activeFilters)) {
      if (!value) continue;
      const def = filters.find((f) => f.key === key);
      rows = rows.filter((r) => String(def?.accessor ? def.accessor(r as never) : (r as Record<string, unknown>)[key]) === value);
    }
    return rows;
  }, [data, debounced, searchKeys, activeFilters, filters]);

  const visibleColumns = useMemo<ColumnsType<T>>(() => columns.filter((c) => !hidden.has(c.key)), [columns, hidden]);
  const hasActiveFilters = Object.values(activeFilters).some(Boolean) || !!search;

  const exportCsv = () => {
    const cols = visibleColumns.filter((c) => 'dataIndex' in c && c.dataIndex);
    const header = cols.map((c) => String(c.title)).join(',');
    const lines = filtered.map((r) => cols.map((c) => JSON.stringify((r as Record<string, unknown>)[(c as ColumnType<T>).dataIndex as string] ?? '')).join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'export.csv';
    a.click();
  };

  const table = (
    <>
      <div className="data-table-toolbar">
        {title && <div style={{ fontWeight: 600, fontSize: 15, marginRight: 4 }}>{title}</div>}
        {searchKeys && (
          <Input
            allowClear
            prefix={<Search size={15} className="muted" />}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 260, maxWidth: '100%' }}
            aria-label="Search table"
          />
        )}
        {filters.map((f) => (
          <Select
            key={f.key}
            allowClear
            placeholder={f.label}
            value={activeFilters[f.key]}
            onChange={(v) => setActiveFilters((prev) => ({ ...prev, [f.key]: v }))}
            options={f.options.map((o) => ({ value: o, label: o }))}
            style={{ minWidth: 150 }}
            aria-label={f.label}
          />
        ))}
        {hasActiveFilters && (
          <Button type="text" size="small" icon={<X size={14} />} onClick={() => { setActiveFilters({}); setSearch(''); }}>
            Clear
          </Button>
        )}
        <div className="data-table-toolbar-spacer" />
        {selectedKeys.length > 0 && <span className="text-secondary" style={{ fontSize: 13 }}>{selectedKeys.length} selected</span>}
        {toolbarExtra}
        {exportable && (
          <Tooltip title="Export CSV">
            <Button icon={<Download size={15} />} onClick={exportCsv} aria-label="Export CSV" />
          </Tooltip>
        )}
        <Dropdown
          trigger={['click']}
          dropdownRender={() => (
            <div style={{ background: '#fff', borderRadius: 8, boxShadow: 'var(--shadow-lg)', padding: 8, minWidth: 200 }}>
              {columns.map((c) => (
                <div key={c.key} style={{ padding: '4px 6px' }}>
                  <Checkbox
                    checked={!hidden.has(c.key)}
                    disabled={c.hideable === false}
                    onChange={(e) => {
                      const next = new Set(hidden);
                      if (e.target.checked) next.delete(c.key);
                      else next.add(c.key);
                      setHidden(next);
                    }}
                  >
                    {typeof c.title === 'string' ? c.title : c.key}
                  </Checkbox>
                </div>
              ))}
            </div>
          )}
        >
          <Tooltip title="Columns">
            <Button icon={<Columns3 size={15} />} aria-label="Toggle columns" />
          </Tooltip>
        </Dropdown>
      </div>
      <Table<T>
        size={size}
        rowKey={rowKey}
        loading={loading}
        columns={visibleColumns}
        dataSource={filtered}
        expandable={expandable}
        summary={summary}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize, showSizeChanger: true, showTotal: (t, r) => `${r[0]}–${r[1]} of ${t}`, size: 'small' }}
        rowSelection={
          selectable
            ? {
                selectedRowKeys: selectedKeys,
                onChange: (keys, rows) => {
                  setSelectedKeys(keys);
                  onSelectionChange?.(keys, rows);
                },
              }
            : undefined
        }
        onRow={onRowClick ? (row) => ({ onClick: () => onRowClick(row), className: 'table-row-clickable' }) : undefined}
        locale={{ emptyText: loading ? ' ' : <EmptyState title={emptyTitle ?? (hasActiveFilters ? 'No matching records' : 'No records')} description={emptyDescription ?? (hasActiveFilters ? 'Try adjusting your search or filters.' : undefined)} action={emptyAction} /> }}
      />
    </>
  );

  return card ? <Card className="data-table-card">{table}</Card> : table;
}
