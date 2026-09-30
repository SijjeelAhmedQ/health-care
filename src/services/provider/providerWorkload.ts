/**
 * The signed-in provider's workload, derived from the practice's data.
 *
 * One pure function so the Dashboard page and the assistant's
 * `get_provider_overview` tool always report exactly the same numbers.
 */
import dayjs from 'dayjs';
import type { Appointment, Patient, Provider, Recall, Task } from '@/types/domain';
import type { InboxItem } from '@/services/inbox/inboxModel';

const CLOSED_APPOINTMENT = new Set(['Cancelled', 'No Show', 'Completed']);
const OPEN_TASK = new Set(['Open', 'In Progress']);

export interface ProviderWorkloadInput {
  provider: Provider;
  patients: Patient[];
  appointments: Appointment[];
  tasks: Task[];
  recalls: Recall[];
  inbox: InboxItem[];
  reviewedInboxIds: string[];
  /** Injected for tests; defaults to now. */
  today?: dayjs.Dayjs;
}

export interface ProviderWorkload {
  provider: Provider;
  /** Patients whose primary provider this is. */
  panel: Patient[];
  /** Every appointment booked with this provider. */
  appointments: Appointment[];
  /** Today's appointments in time order, including completed and cancelled ones. */
  today: Appointment[];
  /** The next appointment today that has not happened yet. */
  nextToday?: Appointment;
  /** Booked (not cancelled or completed) appointments from tomorrow through the next 7 days. */
  upcoming: Appointment[];
  /** Open tasks assigned to this provider, most urgent first. */
  openTasks: Task[];
  overdueTasks: Task[];
  /** Recalls that are due for patients on this provider's panel. */
  dueRecalls: Recall[];
  overdueRecalls: Recall[];
  /** Unfiled Inbox items for patients on this provider's panel. */
  unfiledInbox: InboxItem[];
  /** Appointments per day for the next 14 days. */
  dailyLoad: Array<{ day: string; date: string; booked: number }>;
  /** Today's appointments by status. */
  todayByStatus: Array<{ name: string; value: number }>;
  /** Next 30 days of booked appointments by visit type. */
  upcomingByType: Array<{ name: string; value: number }>;
}

function countBy<T>(rows: T[], key: (row: T) => string) {
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(key(r), (counts.get(key(r)) ?? 0) + 1));
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

const byWhen = (a: Appointment, b: Appointment) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);

export function buildProviderWorkload(input: ProviderWorkloadInput): ProviderWorkload {
  const { provider } = input;
  const now = input.today ?? dayjs();
  const todayIso = now.format('YYYY-MM-DD');
  const nowTime = now.format('HH:mm');
  const startOfToday = now.startOf('day');

  const panel = input.patients.filter((p) => p.primaryProviderId === provider.id);
  const panelIds = new Set(panel.map((p) => p.id));
  const appointments = input.appointments.filter((a) => a.providerId === provider.id).sort(byWhen);
  const today = appointments.filter((a) => a.date === todayIso);
  const nextToday = today.find((a) => a.startTime >= nowTime && !CLOSED_APPOINTMENT.has(a.status));

  const weekEnd = startOfToday.add(8, 'day');
  const upcoming = appointments.filter((a) => {
    const d = dayjs(a.date);
    return d.isAfter(startOfToday.add(1, 'day').subtract(1, 'ms')) && d.isBefore(weekEnd) && a.date !== todayIso && !CLOSED_APPOINTMENT.has(a.status);
  });

  const priorityRank: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
  const openTasks = input.tasks
    .filter((t) => t.assignedTo === provider.fullName && OPEN_TASK.has(t.status))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9));
  const overdueTasks = openTasks.filter((t) => dayjs(t.dueDate).isBefore(startOfToday));

  const dueRecalls = input.recalls.filter((r) => panelIds.has(r.patientId) && r.status === 'Due').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdueRecalls = dueRecalls.filter((r) => dayjs(r.dueDate).isBefore(startOfToday));

  const reviewed = new Set(input.reviewedInboxIds);
  const unfiledInbox = input.inbox
    .filter((i) => panelIds.has(i.patientId) && !reviewed.has(i.id))
    .sort((a, b) => Number(b.attention) - Number(a.attention) || b.receivedAt.localeCompare(a.receivedAt));

  const dailyLoad = Array.from({ length: 14 }, (_, i) => {
    const d = startOfToday.add(i, 'day');
    const iso = d.format('YYYY-MM-DD');
    return { day: i === 0 ? 'Today' : d.format('ddd D'), date: iso, booked: appointments.filter((a) => a.date === iso && a.status !== 'Cancelled').length };
  });

  const monthEnd = startOfToday.add(31, 'day');
  const next30 = appointments.filter((a) => !dayjs(a.date).isBefore(startOfToday) && dayjs(a.date).isBefore(monthEnd) && !CLOSED_APPOINTMENT.has(a.status));

  return {
    provider,
    panel,
    appointments,
    today,
    nextToday,
    upcoming,
    openTasks,
    overdueTasks,
    dueRecalls,
    overdueRecalls,
    unfiledInbox,
    dailyLoad,
    todayByStatus: countBy(today, (a) => a.status),
    upcomingByType: countBy(next30, (a) => a.type),
  };
}
