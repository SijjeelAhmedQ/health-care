import { useEffect, useMemo, useRef, useState, type Key, type ReactNode } from 'react';
import { Badge, Button, Card, Checkbox, Dropdown, Input, Pagination, Select, Table, Tooltip, type TableProps } from 'antd';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { Columns3, Download, Filter, Search, X } from 'lucide-react';
import { EmptyState } from '@/components/common';
import { useDebouncedValue, useResponsive } from '@/hooks';
import { scrollMainToTop } from '@/utils/scroll';
import { ListRegistry } from '@/registry/listRegistry';

export interface FilterDef {
  key: string;
  label: string;
  options: string[];
  /** Custom accessor when the filter key is not a plain property */
  accessor?: (row: never) => string;
}

export type DataColumn<T> = ColumnType<T> & {
  key: string;
  title: ReactNode;
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Mobile card layout: 'primary' is the card headline, 'hidden' is dropped, 'full' spans the card. */
  mobile?: 'primary' | 'hidden' | 'full' | 'actions';
};

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
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  pageSize?: number;
  size?: TableProps<T>['size'];
  /** Externally controlled search text (e.g. from ?q= or voice) */
  search?: string;
  onSearchChange?: (value: string) => void;
  title?: ReactNode;
  /** What the rows are ("patients", "medications") — names the list for the assistant, which can then search, filter and page it. */
  listName?: string;
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
  listName,
  card = true,
  exportable,
  expandable,
  summary,
}: Props<T>) {
  const { isMobile } = useResponsive();
  const [internalSearch, setInternalSearch] = useState('');
  const search = controlledSearch ?? internalSearch;
  const setSearch = (v: string) => (onSearchChange ? onSearchChange(v) : setInternalSearch(v));
  const debounced = useDebouncedValue(search, 200);
  const [activeFilters, setActiveFilters] = useState<Record<string, string | undefined>>({});
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)));
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(pageSize);

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
  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0 || !!search;
  const clearAll = () => { setActiveFilters({}); setSearch(''); setPage(1); };
  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  // A search or filter that shrinks the list never leaves the user on a page that no longer exists.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // The assistant reaches the list through the registry, using the same state as the controls.
  const live = useRef({ search, activeFilters, page, pageCount, shown: filtered.length, total: data?.length ?? 0, setSearch, clearAll });
  live.current = { search, activeFilters, page, pageCount, shown: filtered.length, total: data?.length ?? 0, setSearch, clearAll };
  // Registered again only when what the list offers changes, not on every render.
  const filterSpec = JSON.stringify(filters.map((f) => ({ key: f.key, label: f.label, options: f.options })));
  const searchable = !!searchKeys?.length;
  useEffect(() => {
    if (!listName) return undefined;
    return ListRegistry.register({
      name: listName,
      filters: JSON.parse(filterSpec) as Array<{ key: string; label: string; options: string[] }>,
      searchable,
      state: () => {
        const s = live.current;
        return { search: s.search, filters: Object.fromEntries(Object.entries(s.activeFilters).filter(([, v]) => !!v)) as Record<string, string>, page: s.page, pageCount: s.pageCount, shown: s.shown, total: s.total };
      },
      setSearch: (q) => {
        live.current.setSearch(q);
        setPage(1);
      },
      setFilter: (key, value) => {
        setActiveFilters((prev) => ({ ...prev, [key]: value ?? undefined }));
        setPage(1);
      },
      clearAll: () => live.current.clearAll(),
      setPage: (p) => setPage(Math.min(Math.max(1, p), live.current.pageCount)),
    });
  }, [listName, filterSpec, searchable]);

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

  const emptyNode = (
    <EmptyState
      title={emptyTitle ?? (hasActiveFilters ? 'No matching records' : 'No records yet')}
      description={emptyDescription ?? (hasActiveFilters ? 'No results for the current search and filters. Try different words or clear the filters.' : undefined)}
      action={hasActiveFilters ? <Button icon={<X size={14} />} onClick={clearAll}>Clear search and filters</Button> : emptyAction}
    />
  );

  // ---------------------------------------------------------------- mobile
  if (isMobile) {
    const primary = columns.find((c) => c.mobile === 'primary') ?? columns.find((c) => c.hideable === false) ?? columns[0];
    const actionsCol = columns.find((c) => c.mobile === 'actions') ?? columns.find((c) => c.key === 'a' || c.key === 'actions' || c.key === 'x');
    const fieldCols = columns.filter(
      (c) => c !== primary && c !== actionsCol && c.mobile !== 'hidden' && !hidden.has(c.key) && (c.title !== '' || c.mobile === 'full'),
    );
    const start = (page - 1) * rowsPerPage;
    const pageRows = filtered.slice(start, start + rowsPerPage);

    const renderCell = (col: DataColumn<T>, row: T, index: number): ReactNode => {
      const value = 'dataIndex' in col && col.dataIndex ? (row as Record<string, unknown>)[col.dataIndex as string] : undefined;
      return col.render ? (col.render(value, row, index) as ReactNode) : ((value as ReactNode) ?? '—');
    };

    const body = (
      <>
        <div className="data-table-mobile-toolbar">
          {title && <div className="data-table-title">{title}</div>}
          <div className="data-table-mobile-row">
            {searchKeys && (
              <Input
                allowClear
                size="large"
                prefix={<Search size={16} className="muted" />}
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                aria-label="Search list"
              />
            )}
            {filters.length > 0 && (
              <Badge count={activeFilterCount} size="small">
                <Button
                  size="large"
                  icon={<Filter size={16} />}
                  onClick={() => setShowMobileFilters((v) => !v)}
                  aria-expanded={showMobileFilters}
                  aria-label="Filters"
                />
              </Badge>
            )}
          </div>
          {showMobileFilters && filters.length > 0 && (
            <div className="data-table-mobile-filters">
              {filters.map((f) => (
                <Select
                  key={f.key}
                  allowClear
                  placeholder={f.label}
                  value={activeFilters[f.key]}
                  onChange={(v) => { setActiveFilters((prev) => ({ ...prev, [f.key]: v })); setPage(1); }}
                  options={f.options.map((o) => ({ value: o, label: o }))}
                  aria-label={f.label}
                />
              ))}
              {hasActiveFilters && (
                <Button className="clear-all" icon={<X size={14} />} onClick={clearAll} block>
                  Clear all filters
                </Button>
              )}
            </div>
          )}
          {toolbarExtra && <div className="flex gap-2 wrap">{toolbarExtra}</div>}
          <div className="data-table-mobile-summary">
            <span>{loading ? 'Loading…' : `${filtered.length} result${filtered.length === 1 ? '' : 's'}`}</span>
            {exportable && !loading && filtered.length > 0 && (
              <Button type="link" size="small" icon={<Download size={14} />} onClick={exportCsv}>Export</Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="mobile-cards">
            {[0, 1, 2].map((i) => <div key={i} className="mobile-card" style={{ height: 96 }} />)}
          </div>
        ) : pageRows.length ? (
          <>
            <div className="mobile-cards">
              {pageRows.map((row, i) => {
                const key = String((row as Record<string, unknown>)[rowKey]);
                return (
                  <div
                    key={key}
                    className={`mobile-card ${onRowClick ? 'is-clickable' : ''}`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    role={onRowClick ? 'button' : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
                  >
                    <div className="mobile-card-head">
                      <div className="mobile-card-primary">{renderCell(primary, row, start + i)}</div>
                      {actionsCol && (
                        <div className="mobile-card-actions" onClick={(e) => e.stopPropagation()}>
                          {renderCell(actionsCol, row, start + i)}
                        </div>
                      )}
                    </div>
                    {fieldCols.length > 0 && (
                      <div className="mobile-card-fields">
                        {fieldCols.map((c) => (
                          <div key={c.key} className={`mobile-card-field ${c.mobile === 'full' ? 'full' : ''}`}>
                            <div className="mobile-card-field-label">{typeof c.title === 'string' ? c.title : c.key}</div>
                            <div className="mobile-card-field-value">{renderCell(c, row, start + i)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {filtered.length > rowsPerPage && (
              <div className="mobile-cards-pagination">
                <Pagination
                  simple
                  current={page}
                  pageSize={rowsPerPage}
                  total={filtered.length}
                  onChange={(p) => { setPage(p); scrollMainToTop('smooth'); }}
                />
              </div>
            )}
          </>
        ) : (
          <div className="mobile-cards-empty">{emptyNode}</div>
        )}
      </>
    );

    return card ? <Card className="data-table-card">{body}</Card> : body;
  }

  // ---------------------------------------------------------------- desktop
  const table = (
    <>
      <div className="data-table-toolbar">
        {title && <div className="data-table-title">{title}</div>}
        {searchKeys && (
          <Input
            allowClear
            className="data-table-search"
            prefix={<Search size={15} className="muted" />}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            aria-label="Search table"
          />
        )}
        {filters.map((f) => (
          <Select
            key={f.key}
            allowClear
            className="data-table-filter"
            placeholder={f.label}
            value={activeFilters[f.key]}
            onChange={(v) => { setActiveFilters((prev) => ({ ...prev, [f.key]: v })); setPage(1); }}
            options={f.options.map((o) => ({ value: o, label: o }))}
            aria-label={`Filter by ${f.label}`}
          />
        ))}
        {hasActiveFilters && (
          <Button type="text" icon={<X size={14} />} onClick={clearAll}>
            Clear
          </Button>
        )}
        {!loading && data && <span className="data-table-result-count">{filtered.length} of {data.length}</span>}
        <div className="data-table-toolbar-spacer" />
        {selectedKeys.length > 0 && <span className="data-table-selection">{selectedKeys.length} selected</span>}
        {toolbarExtra}
        {exportable && (
          <Tooltip title="Download the filtered rows as CSV">
            <Button icon={<Download size={15} />} onClick={exportCsv} aria-label="Export CSV" />
          </Tooltip>
        )}
        <Dropdown
          trigger={['click']}
          dropdownRender={() => (
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 10, minWidth: 220 }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, padding: '0 6px 6px' }}>
                Show columns
              </div>
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
                    {typeof c.title === 'string' && c.title ? c.title : c.key}
                  </Checkbox>
                </div>
              ))}
            </div>
          )}
        >
          <Tooltip title="Choose columns">
            <Button icon={<Columns3 size={15} />} aria-label="Choose columns" />
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
        pagination={{
          current: page,
          pageSize: rowsPerPage,
          onChange: (p, s) => {
            setPage(s !== rowsPerPage ? 1 : p);
            setRowsPerPage(s);
          },
          showSizeChanger: true,
          showTotal: (t, r) => `${r[0]}–${r[1]} of ${t}`,
          size: 'small',
          hideOnSinglePage: filtered.length <= rowsPerPage,
        }}
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
        locale={{ emptyText: loading ? ' ' : emptyNode }}
      />
    </>
  );

  return card ? <Card className="data-table-card">{table}</Card> : table;
}
