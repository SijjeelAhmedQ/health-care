import { useMemo } from 'react';
import { Button } from 'antd';
import { Plus } from 'lucide-react';
import { useRecordModule } from '@/components/records/useRecordModule';
import type { RecordKind } from '@/components/forms/RecordForms';
import { PrimaryCell, StatusTag } from '@/components/common';
import { DataTable, type DataColumn } from '@/components/tables/DataTable';
import { recordDate, recordLabel, recordSearchText, recordStatus, recordSubtitle, type AnyRecord } from '@/services/records/recordMapping';
import { formatDate } from '@/utils/format';

const dateHeading: Record<RecordKind, string> = {
  medication: 'Started',
  diagnosis: 'Onset',
  task: 'Due',
  recall: 'Due',
  appointment: 'Date',
};

const addLabel: Record<RecordKind, string> = {
  medication: 'Add medication',
  diagnosis: 'Add diagnosis',
  task: 'Add task',
  recall: 'Add recall',
  appointment: 'Add appointment',
};

/**
 * One Summary tab: the selected patient's real records of a single kind, with
 * the same add / edit / delete behaviour as the module itself.
 */
export function SummaryRecordTab({ kind }: { kind: RecordKind }) {
  const { rows, loading, patient, search, setSearch, openCreate, openEdit, actions, formModal } = useRecordModule(kind);

  // The tab searches across everything that names a record, not a fixed column list.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => recordSearchText(kind, row as AnyRecord).includes(q));
  }, [rows, search, kind]);

  const columns: DataColumn<AnyRecord & { id: string }>[] = [
    {
      key: 'label',
      title: 'Record',
      hideable: false,
      mobile: 'primary',
      render: (_, row) => <PrimaryCell title={recordLabel(kind, row)} subtitle={recordSubtitle(kind, row)} />,
    },
    {
      key: 'date',
      title: dateHeading[kind],
      width: 140,
      sorter: (a, b) => recordDate(kind, a).localeCompare(recordDate(kind, b)),
      render: (_, row) => formatDate(recordDate(kind, row)),
    },
    {
      key: 'status',
      title: 'Status',
      width: 130,
      render: (_, row) => <StatusTag status={recordStatus(kind, row)} />,
    },
    {
      key: 'actions',
      title: '',
      width: 90,
      align: 'right',
      hideable: false,
      mobile: 'actions',
      render: (_, row) => actions(row as never),
    },
  ];

  return (
    <>
      <DataTable<AnyRecord & { id: string }>
        card={false}
        columns={columns}
        data={filtered as Array<AnyRecord & { id: string }>}
        loading={loading && rows.length === 0}
        rowKey="id"
        searchKeys={[]}
        searchPlaceholder={`Search ${kind}s…`}
        search={search}
        onSearchChange={setSearch}
        onRowClick={(row) => openEdit(row as never)}
        title={`${rows.length} ${kind}${rows.length === 1 ? '' : 's'} for ${patient?.fullName ?? 'this patient'}`}
        toolbarExtra={
          <Button type="primary" icon={<Plus size={15} />} onClick={openCreate}>
            {addLabel[kind]}
          </Button>
        }
        emptyTitle={`No ${kind}s recorded`}
        emptyDescription={`Nothing here yet for ${patient?.fullName ?? 'this patient'}.`}
        emptyAction={
          <Button type="primary" icon={<Plus size={15} />} onClick={openCreate}>
            {addLabel[kind]}
          </Button>
        }
        pageSize={8}
      />
      {formModal}
    </>
  );
}
