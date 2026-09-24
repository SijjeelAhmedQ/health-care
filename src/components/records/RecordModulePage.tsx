import type { ReactNode } from 'react';
import { Button } from 'antd';
import { Plus } from 'lucide-react';
import { PageHeader, MetricCard, MetricGrid, type MetricProps } from '@/components/common';
import { DataTable, type DataColumn, type FilterDef } from '@/components/tables/DataTable';
import type { RecordKind } from '@/components/forms/RecordForms';
import { useRecordModule, type RecordOf } from './useRecordModule';

interface Props<K extends RecordKind> {
  kind: K;
  title: string;
  subtitle: string;
  addLabel: string;
  /** Columns without the actions column — that one is added here so every module behaves the same. */
  columns: DataColumn<RecordOf<K>>[];
  searchKeys: Array<keyof RecordOf<K> & string>;
  searchPlaceholder: string;
  filters?: FilterDef[];
  metrics: (rows: RecordOf<K>[]) => MetricProps[];
  emptyTitle: string;
  emptyDescription: ReactNode;
  /** Rendered under the metrics (e.g. a chart). */
  children?: ReactNode;
}

/**
 * The shared shape of the five record modules: search, add, edit, delete with
 * an explicit confirmation, live metrics, and voice control — only the columns,
 * filters and metrics differ per module.
 */
export function RecordModulePage<K extends RecordKind>({
  kind,
  title,
  subtitle,
  addLabel,
  columns,
  searchKeys,
  searchPlaceholder,
  filters,
  metrics,
  emptyTitle,
  emptyDescription,
  children,
}: Props<K>) {
  const { rows, loading, search, setSearch, openCreate, openEdit, actions, formModal } = useRecordModule(kind, title);

  const actionsColumn: DataColumn<RecordOf<K>> = {
    key: 'actions',
    title: '',
    width: 96,
    align: 'right',
    hideable: false,
    mobile: 'actions',
    render: (_: unknown, row: RecordOf<K>) => actions(row),
  };

  const metricCards = metrics(rows);

  return (
    <div className="page page-fill">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>
            {addLabel}
          </Button>
        }
      />

      {metricCards.length > 0 && (
        <MetricGrid>
          {metricCards.map((m) => (
            <MetricCard key={m.label} {...m} loading={loading && rows.length === 0} />
          ))}
        </MetricGrid>
      )}

      {children}

      <DataTable<RecordOf<K>>
        columns={[...columns, actionsColumn]}
        data={rows}
        loading={loading && rows.length === 0}
        rowKey={'id' as keyof RecordOf<K> & string}
        searchKeys={searchKeys}
        searchPlaceholder={searchPlaceholder}
        search={search}
        onSearchChange={setSearch}
        filters={filters}
        onRowClick={(row) => openEdit(row)}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyAction={
          <Button type="primary" icon={<Plus size={15} />} onClick={openCreate}>
            {addLabel}
          </Button>
        }
        exportable
        pageSize={10}
      />

      {formModal}
    </div>
  );
}
