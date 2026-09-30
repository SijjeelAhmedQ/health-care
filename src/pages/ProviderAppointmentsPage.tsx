import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Segmented, Tooltip } from 'antd';
import { CalendarCheck2, CalendarClock, CalendarDays, CalendarX2, History, MapPin, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { appointmentsSlice } from '@/store/slices/recordSlices';
import { setCurrentPatient } from '@/store/slices/patientSlice';
import { selectCurrentProvider } from '@/hooks/useProviderData';
import { Avatar, InlineEmpty, MetricCard, MetricGrid, PageHeader, StatusTag } from '@/components/common';
import { AppointmentChangeFlags, AppointmentChangeNotes, CancelAppointmentDialog, RescheduleAppointmentDialog, isChangeable } from '@/components/appointments/AppointmentChanges';
import { ScheduleRegistry, type ScheduleView } from '@/registry/scheduleRegistry';
import type { Appointment } from '@/types/domain';

/** Appointments that are over, one way or another: nothing left to cancel or move. */
const CLOSED = new Set(['Cancelled', 'No Show', 'Completed']);

const views: Array<{ value: ScheduleView; label: string }> = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'today', label: 'Today' },
  { value: 'past', label: 'Past' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

const dayHeading = (date: string) => {
  const diff = dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day');
  const label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : dayjs(date).format('dddd');
  return { label, date: dayjs(date).format('D MMM YYYY') };
};

/**
 * The provider's own appointments — every appointment booked WITH them, across their patients. Not a
 * patient's appointments (those live in each patient's Summary): the same bookings seen from the
 * provider's side. Cancel with a note, reschedule with a comment, see who each one is with.
 */
export default function ProviderAppointmentsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const provider = useAppSelector(selectCurrentProvider);
  const all = useAppSelector(appointmentsSlice.selectors.selectAll);
  const loading = useAppSelector((s) => s.appointments.status === 'loading' || s.appointments.status === 'idle');
  const [view, setView] = useState<ScheduleView>('upcoming');
  const [search, setSearch] = useState('');
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [moving, setMoving] = useState<Appointment | null>(null);

  const mine = useMemo(() => (provider ? all.filter((a) => a.providerId === provider.id) : []), [all, provider]);
  const today = dayjs().format('YYYY-MM-DD');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inView = (a: Appointment) => {
      const past = a.date < today;
      switch (view) {
        case 'today':
          return a.date === today;
        case 'upcoming':
          return !past && a.status !== 'Cancelled';
        case 'past':
          return past;
        case 'cancelled':
          return a.status === 'Cancelled';
        default:
          return true;
      }
    };
    const matches = (a: Appointment) => !q || `${a.patientName} ${a.patientMrn} ${a.reason} ${a.type}`.toLowerCase().includes(q);
    const rows = mine.filter((a) => inView(a) && matches(a));
    const byWhen = (a: Appointment, b: Appointment) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);
    return view === 'past' || view === 'cancelled' ? rows.sort((a, b) => byWhen(b, a)) : rows.sort(byWhen);
  }, [mine, view, search, today]);

  const days = useMemo(() => {
    const groups = new Map<string, Appointment[]>();
    shown.forEach((a) => groups.set(a.date, [...(groups.get(a.date) ?? []), a]));
    return [...groups.entries()];
  }, [shown]);

  const metrics = useMemo(() => {
    const active = (a: Appointment) => !CLOSED.has(a.status);
    const weekEnd = dayjs().add(7, 'day').format('YYYY-MM-DD');
    const monthAgo = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    return {
      today: mine.filter((a) => a.date === today && active(a)).length,
      week: mine.filter((a) => a.date >= today && a.date <= weekEnd && active(a)).length,
      moved: mine.filter((a) => (a.rescheduleHistory?.length ?? 0) > 0 && a.date >= today).length,
      cancelled: mine.filter((a) => a.status === 'Cancelled' && a.date >= monthAgo).length,
    };
  }, [mine, today]);

  const minesRef = useRef(mine);
  minesRef.current = mine;
  const openCancel = useCallback((id: string) => {
    const a = minesRef.current.find((x) => x.id === id);
    if (!a || !isChangeable(a)) return false;
    setMoving(null);
    setCancelling(a);
    return true;
  }, []);
  const openReschedule = useCallback((id: string) => {
    const a = minesRef.current.find((x) => x.id === id);
    if (!a || !isChangeable(a)) return false;
    setCancelling(null);
    setMoving(a);
    return true;
  }, []);

  // The assistant works this page through the same handlers as the buttons.
  useEffect(() => ScheduleRegistry.register({ setView, setSearch, openCancel, openReschedule }), [openCancel, openReschedule]);

  const openPatient = (a: Appointment) => {
    dispatch(setCurrentPatient(a.patientId));
    navigate('/summary/appointment');
  };

  return (
    <div className="page">
      <PageHeader
        title="My Appointments"
        subtitle={`Appointments booked with ${provider?.fullName ?? 'you'} — every patient, in one agenda. A patient's own appointments are in their Summary.`}
      />
      <MetricGrid>
        <MetricCard label="Today" value={metrics.today} icon={<CalendarDays size={19} />} tone="primary" hint="Still to see today" loading={loading && !mine.length} />
        <MetricCard label="Next 7 days" value={metrics.week} icon={<CalendarClock size={19} />} tone="neutral" hint="Booked and not cancelled" loading={loading && !mine.length} />
        <MetricCard label="Rescheduled" value={metrics.moved} icon={<History size={19} />} tone="warning" hint="Upcoming ones you moved" loading={loading && !mine.length} />
        <MetricCard label="Cancelled" value={metrics.cancelled} icon={<CalendarX2 size={19} />} tone="neutral" hint="In the last 30 days" loading={loading && !mine.length} />
      </MetricGrid>

      <div className="schedule-card">
        <div className="schedule-toolbar">
          <Segmented value={view} onChange={(v) => setView(v as ScheduleView)} options={views} />
          <Input.Search allowClear placeholder="Search by patient, MRN or reason" value={search} onChange={(e) => setSearch(e.target.value)} className="schedule-search" aria-label="Search appointments" />
        </div>

        {days.length === 0 ? (
          <InlineEmpty icon={<CalendarCheck2 size={20} />}>
            {search ? `No appointments match "${search}".` : view === 'today' ? 'Nothing booked with you today.' : view === 'cancelled' ? 'No cancelled appointments.' : 'No appointments here.'}
          </InlineEmpty>
        ) : (
          <div className="schedule-days">
            {days.map(([date, rows]) => {
              const head = dayHeading(date);
              return (
                <section key={date} className="schedule-day" aria-label={`${head.label} ${head.date}`}>
                  <header className="schedule-day-head">
                    <strong>{head.label}</strong>
                    <span className="muted">{head.date}</span>
                    <span className="schedule-day-count">{rows.length}</span>
                  </header>
                  <ul className="schedule-list">
                    {rows.map((a) => (
                      <li key={a.id} className={`schedule-row ${a.status === 'Cancelled' ? 'is-cancelled' : ''}`} data-appointment={a.id}>
                        <div className="schedule-time">
                          <strong>{a.startTime}</strong>
                          <span className="muted">{a.endTime}</span>
                        </div>
                        <button type="button" className="schedule-patient" onClick={() => openPatient(a)} title={`Open ${a.patientName}'s Summary`}>
                          <Avatar name={a.patientName} size={34} />
                          <span>
                            <strong>{a.patientName}</strong>
                            <span className="muted">{a.patientMrn}</span>
                          </span>
                        </button>
                        <div className="schedule-what">
                          <span>
                            {a.type} · {a.reason || '—'}
                          </span>
                          <span className="muted">
                            {a.isTelehealth ? <Video size={12} /> : <MapPin size={12} />} {a.isTelehealth ? 'Telehealth' : a.locationName}
                          </span>
                          <AppointmentChangeNotes a={a} />
                        </div>
                        <div className="schedule-status">
                          {a.status !== 'Cancelled' && <StatusTag status={a.status} />}
                          <AppointmentChangeFlags a={a} />
                        </div>
                        <div className="schedule-actions">
                          <Tooltip title={isChangeable(a) ? '' : 'Past, completed or cancelled appointments cannot be changed'}>
                            <Button size="small" disabled={!isChangeable(a)} onClick={() => openReschedule(a.id)}>
                              Reschedule
                            </Button>
                          </Tooltip>
                          <Button size="small" danger disabled={!isChangeable(a)} onClick={() => openCancel(a.id)}>
                            Cancel
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <CancelAppointmentDialog appointment={cancelling} onClose={() => setCancelling(null)} />
      <RescheduleAppointmentDialog appointment={moving} onClose={() => setMoving(null)} />
    </div>
  );
}
