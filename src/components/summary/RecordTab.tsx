import type { ReactNode } from 'react';
import { Button } from 'antd';
import dayjs from 'dayjs';
import { AlarmClock, CalendarCheck, CalendarDays, CheckCircle2, CircleDashed, ClipboardList, ListChecks, Pill, Plus, Repeat, Stethoscope, TriangleAlert } from 'lucide-react';
import type { Appointment, Diagnosis, Medication, Recall, Task } from '@/types/domain';
import type { RecordKind } from '@/types/records';
import { FieldRegistry } from '@/registry/fieldRegistry';
import { MetricCard, MetricGrid, PrimaryCell, StatusTag, type MetricProps } from '@/components/common';
import { DataTable, type DataColumn, type FilterDef } from '@/components/tables/DataTable';
import { useRecordModule, type RecordOf } from '@/components/records/useRecordModule';
import { formatDate, formatTime } from '@/utils/format';

const today = () => dayjs().startOf('day');
const isOverdue = (date: string) => dayjs(date).isBefore(today());

/** Filter dropdowns take their choices from the form definition, so they never drift from the form. */
const filterOn = (kind: RecordKind, ...fields: string[]): FilterDef[] =>
  fields.map((name) => {
    const def = FieldRegistry.resolveField(kind, name)!;
    return { key: name, label: def.label, options: def.options ?? [] };
  });

interface TabConfig<K extends RecordKind> {
  noun: { one: string; many: string };
  columns: DataColumn<RecordOf<K>>[];
  searchKeys: Array<keyof RecordOf<K> & string>;
  filters: FilterDef[];
  metrics: (rows: RecordOf<K>[]) => MetricProps[];
}

const medication: TabConfig<'medication'> = {
  noun: { one: 'medication', many: 'medications' },
  columns: [
    {
      key: 'name',
      title: 'Medication',
      dataIndex: 'name',
      hideable: false,
      mobile: 'primary',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, row: Medication) => <PrimaryCell title={row.name} subtitle={[row.dosage, row.route].filter(Boolean).join(' · ')} />,
    },
    { key: 'frequency', title: 'Frequency', dataIndex: 'frequency' },
    { key: 'duration', title: 'Duration', dataIndex: 'duration' },
    { key: 'startDate', title: 'Started', dataIndex: 'startDate', render: (v: string) => formatDate(v), sorter: (a, b) => a.startDate.localeCompare(b.startDate) },
    { key: 'indication', title: 'Indication', dataIndex: 'indication', defaultHidden: true, render: (v?: string) => v ?? '—' },
    { key: 'prescribedBy', title: 'Prescribed by', dataIndex: 'prescribedBy', defaultHidden: true },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
  ],
  searchKeys: ['name', 'dosage', 'frequency', 'route', 'indication', 'status', 'prescribedBy'],
  filters: filterOn('medication', 'status', 'route'),
  metrics: (rows) => [
    { label: 'Active', value: rows.filter((r) => r.status === 'Active').length, icon: <CheckCircle2 size={18} />, tone: 'success', hint: 'Currently being taken' },
    { label: 'On hold', value: rows.filter((r) => r.status === 'On Hold').length, icon: <CircleDashed size={18} />, tone: 'warning', hint: 'Paused, not stopped' },
    { label: 'As needed (PRN)', value: rows.filter((r) => r.isPRN).length, icon: <AlarmClock size={18} />, tone: 'info', hint: 'Taken only when required' },
    { label: 'Total', value: rows.length, icon: <Pill size={18} />, tone: 'neutral', hint: 'Every medication ever recorded' },
  ],
};

const diagnosis: TabConfig<'diagnosis'> = {
  noun: { one: 'diagnosis', many: 'diagnoses' },
  columns: [
    {
      key: 'description',
      title: 'Diagnosis',
      dataIndex: 'description',
      hideable: false,
      mobile: 'primary',
      sorter: (a, b) => a.description.localeCompare(b.description),
      render: (_, row: Diagnosis) => <PrimaryCell title={row.description} subtitle={row.icd10 ? `ICD-10 ${row.icd10}` : undefined} />,
    },
    { key: 'onsetDate', title: 'Onset', dataIndex: 'onsetDate', render: (v: string) => formatDate(v), sorter: (a, b) => a.onsetDate.localeCompare(b.onsetDate) },
    { key: 'severity', title: 'Severity', dataIndex: 'severity', render: (v: string) => <StatusTag status={v} /> },
    { key: 'diagnosedBy', title: 'Diagnosed by', dataIndex: 'diagnosedBy', defaultHidden: true },
    { key: 'notes', title: 'Notes', dataIndex: 'notes', defaultHidden: true, mobile: 'full', render: (v?: string) => v ?? '—' },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
  ],
  searchKeys: ['description', 'icd10', 'status', 'severity', 'diagnosedBy'],
  filters: filterOn('diagnosis', 'status', 'severity'),
  metrics: (rows) => [
    { label: 'Active', value: rows.filter((r) => r.status === 'Active').length, icon: <TriangleAlert size={18} />, tone: 'warning', hint: 'Currently being treated' },
    { label: 'Chronic', value: rows.filter((r) => r.status === 'Chronic').length, icon: <Repeat size={18} />, tone: 'info', hint: 'Long-term conditions' },
    { label: 'Resolved', value: rows.filter((r) => r.status === 'Resolved').length, icon: <CheckCircle2 size={18} />, tone: 'success' },
    { label: 'Total', value: rows.length, icon: <Stethoscope size={18} />, tone: 'neutral' },
  ],
};

const openTask = (t: Task) => t.status === 'Open' || t.status === 'In Progress';

const task: TabConfig<'task'> = {
  noun: { one: 'task', many: 'tasks' },
  columns: [
    {
      key: 'title',
      title: 'Task',
      dataIndex: 'title',
      hideable: false,
      mobile: 'primary',
      sorter: (a, b) => a.title.localeCompare(b.title),
      render: (_, row: Task) => <PrimaryCell title={row.title} subtitle={row.category} />,
    },
    {
      key: 'dueDate',
      title: 'Due',
      dataIndex: 'dueDate',
      sorter: (a, b) => a.dueDate.localeCompare(b.dueDate),
      render: (v: string, row: Task) => (
        <span className={isOverdue(v) && openTask(row) ? 'is-overdue' : undefined}>
          {formatDate(v)}
          {isOverdue(v) && openTask(row) && <span className="overdue-chip">Overdue</span>}
        </span>
      ),
    },
    { key: 'assignedTo', title: 'Assigned to', dataIndex: 'assignedTo' },
    { key: 'priority', title: 'Priority', dataIndex: 'priority', render: (v: string) => <StatusTag status={v} /> },
    { key: 'description', title: 'Details', dataIndex: 'description', defaultHidden: true, mobile: 'full', render: (v?: string) => v ?? '—' },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
  ],
  searchKeys: ['title', 'category', 'assignedTo', 'status', 'priority', 'description'],
  filters: filterOn('task', 'status', 'priority', 'category'),
  metrics: (rows) => [
    { label: 'Open', value: rows.filter(openTask).length, icon: <ListChecks size={18} />, tone: 'primary' },
    { label: 'Overdue', value: rows.filter((r) => openTask(r) && isOverdue(r.dueDate)).length, icon: <TriangleAlert size={18} />, tone: 'error', hint: 'Open tasks past their due date' },
    { label: 'Completed', value: rows.filter((r) => r.status === 'Completed').length, icon: <CheckCircle2 size={18} />, tone: 'success' },
    { label: 'Total', value: rows.length, icon: <ClipboardList size={18} />, tone: 'neutral' },
  ],
};

const recall: TabConfig<'recall'> = {
  noun: { one: 'recall', many: 'recalls' },
  columns: [
    {
      key: 'reason',
      title: 'Recall',
      dataIndex: 'reason',
      hideable: false,
      mobile: 'primary',
      sorter: (a, b) => a.reason.localeCompare(b.reason),
      render: (_, row: Recall) => <PrimaryCell title={row.reason} subtitle={row.type} />,
    },
    {
      key: 'dueDate',
      title: 'Due',
      dataIndex: 'dueDate',
      sorter: (a, b) => a.dueDate.localeCompare(b.dueDate),
      render: (v: string, row: Recall) => (
        <span className={isOverdue(v) && row.status === 'Due' ? 'is-overdue' : undefined}>
          {formatDate(v)}
          {isOverdue(v) && row.status === 'Due' && <span className="overdue-chip">Overdue</span>}
        </span>
      ),
    },
    { key: 'priority', title: 'Priority', dataIndex: 'priority', render: (v: string) => <StatusTag status={v} /> },
    { key: 'createdBy', title: 'Created by', dataIndex: 'createdBy', defaultHidden: true },
    { key: 'notes', title: 'Notes', dataIndex: 'notes', defaultHidden: true, mobile: 'full', render: (v?: string) => v ?? '—' },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
  ],
  searchKeys: ['reason', 'type', 'status', 'priority', 'notes'],
  filters: filterOn('recall', 'status', 'type'),
  metrics: (rows) => [
    { label: 'Due now', value: rows.filter((r) => r.status === 'Due').length, icon: <Repeat size={18} />, tone: 'warning' },
    { label: 'Overdue', value: rows.filter((r) => r.status === 'Due' && isOverdue(r.dueDate)).length, icon: <TriangleAlert size={18} />, tone: 'error' },
    { label: 'Scheduled', value: rows.filter((r) => r.status === 'Scheduled').length, icon: <CalendarCheck size={18} />, tone: 'info', hint: 'An appointment has been booked' },
    { label: 'Completed', value: rows.filter((r) => r.status === 'Completed').length, icon: <CheckCircle2 size={18} />, tone: 'success' },
  ],
};

const upcomingOf = (rows: Appointment[]) =>
  rows
    .filter((r) => !dayjs(r.date).isBefore(today()) && !['Cancelled', 'No Show', 'Completed'].includes(r.status))
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));

const appointment: TabConfig<'appointment'> = {
  noun: { one: 'appointment', many: 'appointments' },
  columns: [
    {
      key: 'date',
      title: 'When',
      dataIndex: 'date',
      hideable: false,
      mobile: 'primary',
      sorter: (a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
      render: (_, row: Appointment) => <PrimaryCell title={`${formatDate(row.date)} · ${formatTime(row.startTime)}`} subtitle={`${row.type} · ${row.durationMinutes} min`} />,
    },
    { key: 'providerName', title: 'Provider', dataIndex: 'providerName' },
    { key: 'reason', title: 'Reason', dataIndex: 'reason', mobile: 'full' },
    { key: 'locationName', title: 'Location', dataIndex: 'locationName', defaultHidden: true },
    { key: 'priority', title: 'Priority', dataIndex: 'priority', defaultHidden: true, render: (v: string) => <StatusTag status={v} /> },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
  ],
  searchKeys: ['date', 'type', 'providerName', 'reason', 'status', 'locationName'],
  filters: filterOn('appointment', 'status', 'type'),
  metrics: (rows) => {
    const upcoming = upcomingOf(rows);
    return [
      { label: 'Upcoming', value: upcoming.length, icon: <CalendarDays size={18} />, tone: 'primary', hint: 'Today or later, not cancelled' },
      { label: 'Next visit', value: upcoming.length ? formatDate(upcoming[0].date, 'D MMM') : '—', icon: <CalendarCheck size={18} />, tone: 'info' },
      { label: 'Completed', value: rows.filter((r) => r.status === 'Completed').length, icon: <CheckCircle2 size={18} />, tone: 'success' },
      { label: 'Cancelled / no show', value: rows.filter((r) => r.status === 'Cancelled' || r.status === 'No Show').length, icon: <TriangleAlert size={18} />, tone: 'warning' },
    ];
  },
};

const configs: { [K in RecordKind]: TabConfig<K> } = { medication, diagnosis, task, recall, appointment };

/**
 * One Summary tab: every record of one kind for the selected patient, with
 * live metrics, search, filters, and add / edit / delete. The Summary is the
 * only place these records are managed.
 */
export function RecordTab<K extends RecordKind>({ kind }: { kind: K }) {
  const config = configs[kind] as TabConfig<K>;
  const { rows, loading, patient, search, setSearch, openCreate, openEdit, actions, formModal } = useRecordModule(kind);
  const who = patient?.fullName ?? 'this patient';
  const addButton: ReactNode = (
    <Button type="primary" icon={<Plus size={15} />} onClick={openCreate}>
      Add {config.noun.one}
    </Button>
  );

  const actionsColumn: DataColumn<RecordOf<K>> = {
    key: 'actions',
    title: '',
    width: 96,
    align: 'right',
    hideable: false,
    mobile: 'actions',
    render: (_: unknown, row: RecordOf<K>) => actions(row),
  };

  return (
    <div className="record-tab">
      <MetricGrid>
        {config.metrics(rows).map((m) => (
          <MetricCard key={m.label} {...m} loading={loading && rows.length === 0} />
        ))}
      </MetricGrid>
      <DataTable<RecordOf<K>>
        card={false}
        columns={[...config.columns, actionsColumn]}
        data={rows}
        loading={loading && rows.length === 0}
        rowKey={'id' as keyof RecordOf<K> & string}
        searchKeys={config.searchKeys}
        searchPlaceholder={`Search ${config.noun.many}…`}
        search={search}
        onSearchChange={setSearch}
        filters={config.filters}
        onRowClick={(row) => openEdit(row)}
        title={`${rows.length} ${rows.length === 1 ? config.noun.one : config.noun.many} for ${who}`}
        listName={config.noun.many}
        toolbarExtra={addButton}
        emptyTitle={`No ${config.noun.many} recorded`}
        emptyDescription={`Nothing here yet for ${who}. Add one, or ask the assistant.`}
        emptyAction={addButton}
        exportable
        pageSize={10}
      />
      {formModal}
    </div>
  );
}
