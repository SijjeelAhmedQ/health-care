import { useMemo, useState } from 'react';
import { Button, Card, Drawer, Segmented, Select, Space, Tooltip, Tag, Descriptions } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Video } from 'lucide-react';
import { PageHeader, StatusTag } from '@/components/common';
import { AppointmentFormDrawer } from '@/components/forms/AppointmentForm';
import { useAppDispatch, useAppSelector } from '@/store';
import { appointmentSelectors, setCalendarDate, setCalendarView } from '@/store/slices/appointmentSlice';
import { providerSelectors } from '@/store/slices/providerSlice';
import { mockDb } from '@/services/api';
import type { Appointment } from '@/types/domain';
import { dayjs, formatTime } from '@/utils/format';

const typeColor = Object.fromEntries(mockDb.appointmentTypes.map((t) => [t.name, t.color]));
const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i);

function Chip({ a, onClick }: { a: Appointment; onClick: () => void }) {
  return (
    <Tooltip title={`${a.patientName} · ${a.type} · ${a.providerName} · ${a.status}`}>
      <div className="appt-chip" style={{ borderLeftColor: typeColor[a.type] ?? '#0f6e8c', opacity: ['Cancelled', 'No Show'].includes(a.status) ? 0.5 : 1 }} onClick={onClick}>
        <b>{formatTime(a.startTime)} {a.patientName}</b>
        <span className="muted">{a.type}{a.isTelehealth ? ' · video' : ''}</span>
      </div>
    </Tooltip>
  );
}

export default function AppointmentCalendarPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const all = useAppSelector(appointmentSelectors.selectAll);
  const providers = useAppSelector(providerSelectors.selectAll);
  const view = useAppSelector((s) => s.appointments.calendarView);
  const dateStr = useAppSelector((s) => s.appointments.calendarDate);
  const date = dayjs(dateStr);
  const [filters, setFilters] = useState<{ provider?: string; location?: string; type?: string; status?: string }>({});
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => all.filter((a) => (!filters.provider || a.providerId === filters.provider) && (!filters.location || a.locationName === filters.location) && (!filters.type || a.type === filters.type) && (!filters.status || a.status === filters.status)), [all, filters]);

  const days = useMemo(() => {
    if (view === 'day') return [date];
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => date.startOf('week').add(i, 'day'));
    const start = date.startOf('month').startOf('week');
    return Array.from({ length: 42 }, (_, i) => start.add(i, 'day'));
  }, [view, date]);

  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    filtered.forEach((a) => m.set(a.date, [...(m.get(a.date) ?? []), a]));
    return m;
  }, [filtered]);

  const move = (dir: -1 | 1) => dispatch(setCalendarDate(date.add(dir, view === 'day' ? 'day' : view === 'week' ? 'week' : 'month').format('YYYY-MM-DD')));
  const title = view === 'day' ? date.format('dddd, MMMM D, YYYY') : view === 'week' ? `${days[0].format('MMM D')} – ${days[6].format('MMM D, YYYY')}` : date.format('MMMM YYYY');

  return (
    <>
      <PageHeader
        title="Appointment Calendar"
        subtitle={`${filtered.filter((a) => days.some((d) => d.format('YYYY-MM-DD') === a.date)).length} appointments in view`}
        actions={
          <>
            <Segmented value={view} onChange={(v) => dispatch(setCalendarView(v as typeof view))} options={[{ label: 'Day', value: 'day' }, { label: 'Week', value: 'week' }, { label: 'Month', value: 'month' }]} />
            <Button type="primary" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>New Appointment</Button>
          </>
        }
      />
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
        <div className="flex items-center gap-2 wrap">
          <Space>
            <Button icon={<ChevronLeft size={16} />} onClick={() => move(-1)} aria-label="Previous" />
            <Button onClick={() => dispatch(setCalendarDate(dayjs().format('YYYY-MM-DD')))}>Today</Button>
            <Button icon={<ChevronRight size={16} />} onClick={() => move(1)} aria-label="Next" />
          </Space>
          <strong style={{ fontSize: 15, marginLeft: 8, marginRight: 'auto' }}>{title}</strong>
          <Select allowClear placeholder="Provider" style={{ minWidth: 180 }} value={filters.provider} onChange={(v) => setFilters((f) => ({ ...f, provider: v }))} options={providers.map((p) => ({ value: p.id, label: p.fullName }))} />
          <Select allowClear placeholder="Location" style={{ minWidth: 180 }} value={filters.location} onChange={(v) => setFilters((f) => ({ ...f, location: v }))} options={mockDb.locations.map((l) => ({ value: l.name, label: l.name }))} />
          <Select allowClear placeholder="Type" style={{ minWidth: 140 }} value={filters.type} onChange={(v) => setFilters((f) => ({ ...f, type: v }))} options={mockDb.appointmentTypes.map((t) => ({ value: t.name, label: t.name }))} />
          <Select allowClear placeholder="Status" style={{ minWidth: 140 }} value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={['Scheduled', 'Confirmed', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show'].map((s) => ({ value: s, label: s }))} />
        </div>
      </Card>

      {view === 'month' ? (
        <div className="month-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="month-head">{d}</div>)}
          {days.map((d) => {
            const key = d.format('YYYY-MM-DD');
            const list = byDay.get(key) ?? [];
            return (
              <div key={key} className={`month-cell ${d.month() !== date.month() ? 'other' : ''}`} onDoubleClick={() => { dispatch(setCalendarDate(key)); dispatch(setCalendarView('day')); }}>
                <div className="month-cell-date" style={d.isSame(dayjs(), 'day') ? { color: '#0f6e8c' } : undefined}>{d.date()}</div>
                {list.slice(0, 3).map((a) => <Chip key={a.id} a={a} onClick={() => setSelected(a)} />)}
                {list.length > 3 && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>+{list.length - 3} more</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="calendar-scroll">
          <div className={`calendar-grid ${view === 'day' ? 'single' : ''}`} style={{ ['--cols' as string]: days.length }}>
            <div className="calendar-head" style={{ borderLeft: 'none' }} />
            {days.map((d) => (
              <div key={d.toString()} className={`calendar-head ${d.isSame(dayjs(), 'day') ? 'today' : ''}`}>
                {d.format('ddd')} <span style={{ fontWeight: 400 }}>{d.format('D')}</span>
                <div className="muted" style={{ fontSize: 11 }}>{(byDay.get(d.format('YYYY-MM-DD')) ?? []).length} appts</div>
              </div>
            ))}
            {HOURS.map((h) => (
              <div key={h} style={{ display: 'contents' }}>
                <div className="calendar-time">{dayjs().hour(h).minute(0).format('h A')}</div>
                {days.map((d) => {
                  const list = (byDay.get(d.format('YYYY-MM-DD')) ?? []).filter((a) => Number(a.startTime.slice(0, 2)) === h);
                  return (
                    <div key={d.toString() + h} className="calendar-cell" onDoubleClick={() => setCreateOpen(true)}>
                      {list.map((a) => <Chip key={a.id} a={a} onClick={() => setSelected(a)} />)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 wrap" style={{ marginTop: 12 }}>
        {mockDb.appointmentTypes.filter((t) => t.isActive).map((t) => <span key={t.id} className="flex items-center" style={{ fontSize: 12 }}><span className="status-dot" style={{ background: t.color }} />{t.name}</span>)}
      </div>

      <Drawer title="Appointment" open={!!selected} onClose={() => setSelected(null)} width={420} extra={selected && <Button type="primary" size="small" onClick={() => navigate(`/appointments/${selected.id}`)}>Open details</Button>}>
        {selected && (
          <Descriptions column={1} size="small" items={[
            { key: 'p', label: 'Patient', children: <a onClick={() => navigate(`/patients/${selected.patientId}`)}>{selected.patientName}</a> },
            { key: 'w', label: 'When', children: `${dayjs(selected.date).format('ddd, MMM D')} · ${formatTime(selected.startTime)} – ${formatTime(selected.endTime)}` },
            { key: 'pr', label: 'Provider', children: selected.providerName },
            { key: 't', label: 'Type', children: <Tag color={typeColor[selected.type]}>{selected.type}</Tag> },
            { key: 'l', label: 'Location', children: <span className="flex items-center gap-2">{selected.isTelehealth && <Video size={14} />}{selected.locationName}{selected.room ? ` · ${selected.room}` : ''}</span> },
            { key: 'r', label: 'Reason', children: selected.reason },
            { key: 's', label: 'Status', children: <StatusTag status={selected.status} /> },
            { key: 'pri', label: 'Priority', children: <StatusTag status={selected.priority} /> },
          ]} />
        )}
      </Drawer>
      <AppointmentFormDrawer open={createOpen} onOpen={() => setCreateOpen(true)} onClose={() => setCreateOpen(false)} />
    </>
  );
}
