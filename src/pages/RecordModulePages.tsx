import dayjs from 'dayjs';
import { AlarmClock, CalendarCheck, CalendarDays, CheckCircle2, CircleDashed, ClipboardList, ListChecks, Pill, Repeat, Stethoscope, TriangleAlert } from 'lucide-react';
import type { Appointment, Diagnosis, Medication, Recall, Task } from '@/types/domain';
import { PrimaryCell, StatusTag, type MetricProps } from '@/components/common';
import type { DataColumn } from '@/components/tables/DataTable';
import { RecordModulePage } from '@/components/records/RecordModulePage';
import { formatDate, formatTime } from '@/utils/format';

const today = () => dayjs().startOf('day');
const isOverdue = (date: string) => dayjs(date).isBefore(today());

/* ------------------------------------------------------------------ Medication */

const medicationColumns: DataColumn<Medication>[] = [
  {
    key: 'name',
    title: 'Medication',
    dataIndex: 'name',
    hideable: false,
    mobile: 'primary',
    sorter: (a, b) => a.name.localeCompare(b.name),
    render: (_, row) => <PrimaryCell title={row.name} subtitle={[row.dosage, row.route].filter(Boolean).join(' · ')} />,
  },
  { key: 'frequency', title: 'Frequency', dataIndex: 'frequency' },
  { key: 'duration', title: 'Duration', dataIndex: 'duration' },
  { key: 'startDate', title: 'Started', dataIndex: 'startDate', render: (v: string) => formatDate(v), sorter: (a, b) => a.startDate.localeCompare(b.startDate) },
  { key: 'indication', title: 'Indication', dataIndex: 'indication', defaultHidden: true, render: (v?: string) => v ?? '—' },
  { key: 'prescribedBy', title: 'Prescribed by', dataIndex: 'prescribedBy', defaultHidden: true },
  { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
];

export function MedicationPage() {
  return (
    <RecordModulePage<'medication'>
      kind="medication"
      title="Medication"
      subtitle="Every medication recorded for the selected patient. Adding, changing or stopping a medication here updates the dashboard and summary immediately."
      addLabel="Add medication"
      columns={medicationColumns}
      searchKeys={['name', 'dosage', 'frequency', 'route', 'indication', 'status', 'prescribedBy']}
      searchPlaceholder="Search medications by name, dose or indication…"
      filters={[
        { key: 'status', label: 'Status', options: ['Active', 'Completed', 'Discontinued', 'On Hold'] },
        { key: 'route', label: 'Route', options: ['Oral', 'Intravenous', 'Intramuscular', 'Subcutaneous', 'Topical', 'Inhalation'] },
      ]}
      metrics={(rows): MetricProps[] => [
        { label: 'Total medications', value: rows.length, icon: <Pill size={18} />, tone: 'primary', hint: 'Every medication ever recorded for this patient' },
        { label: 'Active', value: rows.filter((r) => r.status === 'Active').length, icon: <CheckCircle2 size={18} />, tone: 'success', hint: 'Currently being taken' },
        { label: 'On hold', value: rows.filter((r) => r.status === 'On Hold').length, icon: <CircleDashed size={18} />, tone: 'warning', hint: 'Paused, not stopped' },
        { label: 'As needed (PRN)', value: rows.filter((r) => r.isPRN).length, icon: <AlarmClock size={18} />, tone: 'info', hint: 'Taken only when required' },
      ]}
      emptyTitle="No medications recorded"
      emptyDescription="This patient has no medications yet. Add one, or say “add amoxicillin 500 mg twice daily for 7 days”."
    />
  );
}

/* ------------------------------------------------------------------- Diagnosis */

const diagnosisColumns: DataColumn<Diagnosis>[] = [
  {
    key: 'description',
    title: 'Diagnosis',
    dataIndex: 'description',
    hideable: false,
    mobile: 'primary',
    sorter: (a, b) => a.description.localeCompare(b.description),
    render: (_, row) => <PrimaryCell title={row.description} subtitle={row.icd10 ? `ICD-10 ${row.icd10}` : undefined} />,
  },
  { key: 'onsetDate', title: 'Onset', dataIndex: 'onsetDate', render: (v: string) => formatDate(v), sorter: (a, b) => a.onsetDate.localeCompare(b.onsetDate) },
  { key: 'severity', title: 'Severity', dataIndex: 'severity', render: (v: string) => <StatusTag status={v} /> },
  { key: 'diagnosedBy', title: 'Diagnosed by', dataIndex: 'diagnosedBy', defaultHidden: true },
  { key: 'notes', title: 'Notes', dataIndex: 'notes', defaultHidden: true, mobile: 'full', render: (v?: string) => v ?? '—' },
  { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
];

export function DiagnosisPage() {
  return (
    <RecordModulePage<'diagnosis'>
      kind="diagnosis"
      title="Diagnosis"
      subtitle="The selected patient's problem list. Active and chronic diagnoses drive the dashboard overview and the AI summary."
      addLabel="Add diagnosis"
      columns={diagnosisColumns}
      searchKeys={['description', 'icd10', 'status', 'severity', 'diagnosedBy']}
      searchPlaceholder="Search diagnoses by name or ICD-10 code…"
      filters={[
        { key: 'status', label: 'Status', options: ['Active', 'Chronic', 'Resolved', 'Inactive'] },
        { key: 'severity', label: 'Severity', options: ['Mild', 'Moderate', 'Severe'] },
      ]}
      metrics={(rows): MetricProps[] => [
        { label: 'Total diagnoses', value: rows.length, icon: <Stethoscope size={18} />, tone: 'primary' },
        { label: 'Active', value: rows.filter((r) => r.status === 'Active').length, icon: <TriangleAlert size={18} />, tone: 'warning', hint: 'Currently being treated' },
        { label: 'Chronic', value: rows.filter((r) => r.status === 'Chronic').length, icon: <Repeat size={18} />, tone: 'info', hint: 'Long-term conditions' },
        { label: 'Resolved', value: rows.filter((r) => r.status === 'Resolved').length, icon: <CheckCircle2 size={18} />, tone: 'success' },
      ]}
      emptyTitle="No diagnoses recorded"
      emptyDescription="This patient has no diagnoses yet. Add one, or say “add diagnosis hypertension”."
    />
  );
}

/* ------------------------------------------------------------------------ Task */

const taskColumns: DataColumn<Task>[] = [
  {
    key: 'title',
    title: 'Task',
    dataIndex: 'title',
    hideable: false,
    mobile: 'primary',
    sorter: (a, b) => a.title.localeCompare(b.title),
    render: (_, row) => <PrimaryCell title={row.title} subtitle={row.category} />,
  },
  {
    key: 'dueDate',
    title: 'Due',
    dataIndex: 'dueDate',
    sorter: (a, b) => a.dueDate.localeCompare(b.dueDate),
    render: (v: string, row) => (
      <span className={isOverdue(v) && row.status !== 'Completed' && row.status !== 'Cancelled' ? 'is-overdue' : undefined}>
        {formatDate(v)}
        {isOverdue(v) && row.status !== 'Completed' && row.status !== 'Cancelled' && <span className="overdue-chip">Overdue</span>}
      </span>
    ),
  },
  { key: 'assignedTo', title: 'Assigned to', dataIndex: 'assignedTo' },
  { key: 'priority', title: 'Priority', dataIndex: 'priority', render: (v: string) => <StatusTag status={v} /> },
  { key: 'description', title: 'Details', dataIndex: 'description', defaultHidden: true, mobile: 'full', render: (v?: string) => v ?? '—' },
  { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
];

export function TaskPage() {
  return (
    <RecordModulePage<'task'>
      kind="task"
      title="Task"
      subtitle="Work owed to the selected patient — follow-up calls, monitoring, paperwork. Overdue tasks are flagged on the dashboard."
      addLabel="Add task"
      columns={taskColumns}
      searchKeys={['title', 'category', 'assignedTo', 'status', 'priority', 'description']}
      searchPlaceholder="Search tasks by title, category or assignee…"
      filters={[
        { key: 'status', label: 'Status', options: ['Open', 'In Progress', 'Completed', 'Cancelled'] },
        { key: 'priority', label: 'Priority', options: ['Low', 'Normal', 'High', 'Urgent'] },
        { key: 'category', label: 'Category', options: ['Follow-up', 'Monitoring', 'Referral', 'Documentation', 'Medication Review', 'Lab Follow-up', 'Patient Education', 'Other'] },
      ]}
      metrics={(rows): MetricProps[] => [
        { label: 'Open tasks', value: rows.filter((r) => r.status === 'Open' || r.status === 'In Progress').length, icon: <ListChecks size={18} />, tone: 'primary' },
        {
          label: 'Overdue',
          value: rows.filter((r) => (r.status === 'Open' || r.status === 'In Progress') && isOverdue(r.dueDate)).length,
          icon: <TriangleAlert size={18} />,
          tone: 'error',
          hint: 'Open tasks past their due date',
        },
        { label: 'Completed', value: rows.filter((r) => r.status === 'Completed').length, icon: <CheckCircle2 size={18} />, tone: 'success' },
        { label: 'Total', value: rows.length, icon: <ClipboardList size={18} />, tone: 'neutral' },
      ]}
      emptyTitle="No tasks for this patient"
      emptyDescription="Nothing is outstanding. Add a task, or say “add task blood pressure monitoring due next Friday”."
    />
  );
}

/* ---------------------------------------------------------------------- Recall */

const recallColumns: DataColumn<Recall>[] = [
  {
    key: 'reason',
    title: 'Recall',
    dataIndex: 'reason',
    hideable: false,
    mobile: 'primary',
    sorter: (a, b) => a.reason.localeCompare(b.reason),
    render: (_, row) => <PrimaryCell title={row.reason} subtitle={row.type} />,
  },
  {
    key: 'dueDate',
    title: 'Due',
    dataIndex: 'dueDate',
    sorter: (a, b) => a.dueDate.localeCompare(b.dueDate),
    render: (v: string, row) => (
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
];

export function RecallPage() {
  return (
    <RecordModulePage<'recall'>
      kind="recall"
      title="Recall"
      subtitle="Reminders to bring the selected patient back — reviews, screening, repeat labs and vaccinations."
      addLabel="Add recall"
      columns={recallColumns}
      searchKeys={['reason', 'type', 'status', 'priority', 'notes']}
      searchPlaceholder="Search recalls by reason or type…"
      filters={[
        { key: 'status', label: 'Status', options: ['Due', 'Scheduled', 'Completed', 'Cancelled'] },
        { key: 'type', label: 'Type', options: ['Follow-up', 'Screening', 'Vaccination', 'Lab Test', 'Medication Review', 'Chronic Care Review', 'Other'] },
      ]}
      metrics={(rows): MetricProps[] => [
        { label: 'Due now', value: rows.filter((r) => r.status === 'Due').length, icon: <Repeat size={18} />, tone: 'warning' },
        { label: 'Overdue', value: rows.filter((r) => r.status === 'Due' && isOverdue(r.dueDate)).length, icon: <TriangleAlert size={18} />, tone: 'error' },
        { label: 'Scheduled', value: rows.filter((r) => r.status === 'Scheduled').length, icon: <CalendarCheck size={18} />, tone: 'info', hint: 'An appointment has been booked' },
        { label: 'Completed', value: rows.filter((r) => r.status === 'Completed').length, icon: <CheckCircle2 size={18} />, tone: 'success' },
      ]}
      emptyTitle="No recalls set"
      emptyDescription="This patient has no recalls. Add one, or say “set recall for blood pressure review in 3 months”."
    />
  );
}

/* ----------------------------------------------------------------- Appointment */

const appointmentColumns: DataColumn<Appointment>[] = [
  {
    key: 'date',
    title: 'When',
    dataIndex: 'date',
    hideable: false,
    mobile: 'primary',
    sorter: (a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
    render: (_, row) => <PrimaryCell title={`${formatDate(row.date)} · ${formatTime(row.startTime)}`} subtitle={`${row.type} · ${row.durationMinutes} min`} />,
  },
  { key: 'providerName', title: 'Provider', dataIndex: 'providerName' },
  { key: 'reason', title: 'Reason', dataIndex: 'reason', mobile: 'full' },
  { key: 'locationName', title: 'Location', dataIndex: 'locationName', defaultHidden: true },
  { key: 'priority', title: 'Priority', dataIndex: 'priority', defaultHidden: true, render: (v: string) => <StatusTag status={v} /> },
  { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
];

export function AppointmentPage() {
  return (
    <RecordModulePage<'appointment'>
      kind="appointment"
      title="Appointment"
      subtitle="Past and upcoming appointments for the selected patient. Booking here updates the banner, dashboard and summary."
      addLabel="Add appointment"
      columns={appointmentColumns}
      searchKeys={['date', 'type', 'providerName', 'reason', 'status', 'locationName']}
      searchPlaceholder="Search appointments by date, provider or reason…"
      filters={[
        { key: 'status', label: 'Status', options: ['Scheduled', 'Confirmed', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show', 'Rescheduled'] },
        { key: 'type', label: 'Type', options: ['New Patient', 'Follow-up', 'Consultation', 'Procedure', 'Telehealth', 'Annual Physical', 'Urgent', 'Lab Visit', 'Vaccination'] },
      ]}
      metrics={(rows): MetricProps[] => {
        const upcoming = rows.filter((r) => !dayjs(r.date).isBefore(today()) && !['Cancelled', 'No Show', 'Completed'].includes(r.status));
        return [
          { label: 'Upcoming', value: upcoming.length, icon: <CalendarDays size={18} />, tone: 'primary', hint: 'Today or later, not cancelled' },
          { label: 'Next visit', value: upcoming.length ? formatDate(upcoming.sort((a, b) => a.date.localeCompare(b.date))[0].date, 'D MMM') : '—', icon: <CalendarCheck size={18} />, tone: 'info' },
          { label: 'Completed', value: rows.filter((r) => r.status === 'Completed').length, icon: <CheckCircle2 size={18} />, tone: 'success' },
          { label: 'Cancelled / no show', value: rows.filter((r) => r.status === 'Cancelled' || r.status === 'No Show').length, icon: <TriangleAlert size={18} />, tone: 'warning' },
        ];
      }}
      emptyTitle="No appointments"
      emptyDescription="This patient has no appointments. Add one, or say “add appointment next Tuesday at 3 pm for a follow-up”."
    />
  );
}
