import { useMemo } from 'react';
import { Button, List, Progress, Tag, Timeline } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, CalendarDays, CalendarPlus, ClipboardList, Mic, Pill, Stethoscope, UserPlus, Users } from 'lucide-react';
import { PageHeader, MetricCard, MetricGrid, SectionCard, StatusTag, Avatar, EmptyState } from '@/components/common';
import { BarsChart, DonutChart } from '@/components/charts';
import { useAppSelector } from '@/store';
import { appointmentSelectors } from '@/store/slices/appointmentSlice';
import { patientSelectors } from '@/store/slices/patientSlice';
import { providerSelectors } from '@/store/slices/providerSlice';
import { mockDb } from '@/services/api';
import { dayjs, formatTime, fromNow } from '@/utils/format';
import { getVoiceController } from '@/services/ai/voiceController';

const TODAY = dayjs().format('YYYY-MM-DD');

export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const appointments = useAppSelector(appointmentSelectors.selectAll);
  const patients = useAppSelector(patientSelectors.selectAll);
  const providers = useAppSelector(providerSelectors.selectAll);
  const loading = useAppSelector((s) => s.appointments.status === 'loading');
  const voice = useAppSelector((s) => s.voice);

  const todays = useMemo(() => appointments.filter((a) => a.date === TODAY), [appointments]);
  const stats = useMemo(() => {
    const byStatus = todays.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }), {});
    return {
      appointmentsToday: todays.length,
      patientsToday: new Set(todays.map((a) => a.patientId)).size,
      pendingConsults: mockDb.consultations.filter((c) => c.status === 'In Progress' || c.status === 'Pending Sign-off').length,
      availableProviders: providers.filter((p) => p.status === 'Active').length,
      byStatus,
      waiting: byStatus['Checked In'] ?? 0,
    };
  }, [todays, providers]);

  const weekly = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = dayjs().subtract(6 - i, 'day');
        const dayAppts = appointments.filter((a) => a.date === d.format('YYYY-MM-DD'));
        return { day: d.format('ddd'), Completed: dayAppts.filter((a) => a.status === 'Completed').length, Scheduled: dayAppts.filter((a) => !['Completed', 'Cancelled', 'No Show'].includes(a.status)).length, 'No-show': dayAppts.filter((a) => a.status === 'No Show').length };
      }),
    [appointments],
  );
  const byType = useMemo(() => {
    const counts = appointments.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.type]: (acc[a.type] ?? 0) + 1 }), {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([type, count]) => ({ type, count }));
  }, [appointments]);
  const statusDonut = Object.entries(stats.byStatus).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  const recentPatients = useMemo(() => [...patients].sort((a, b) => (b.lastVisit ?? '').localeCompare(a.lastVisit ?? '')).slice(0, 6), [patients]);
  const upcoming = todays.filter((a) => !['Completed', 'Cancelled', 'No Show'].includes(a.status)).slice(0, 6);

  const activity = [
    { color: 'green', text: `Dr. Sarah Ahmed completed consultation for ${mockDb.consultations[0]?.patientName}`, time: '8 min ago' },
    { color: 'blue', text: 'Front desk checked in 3 patients at Riverside', time: '15 min ago' },
    { color: 'orange', text: 'HbA1c result flagged abnormal for Ahmed Khan', time: '32 min ago' },
    { color: 'blue', text: 'New patient registered: Fatima Malik', time: '1 h ago' },
    { color: 'gray', text: 'Roster for Week 39 published by Linda Park', time: '2 h ago' },
  ];

  return (
    <>
      <PageHeader
        title="Executive Dashboard"
        subtitle={`${dayjs().format('dddd, MMMM D, YYYY')} · ${mockDb.locations.length} locations · ${providers.length} providers`}
        actions={
          <>
            <Button icon={<UserPlus size={15} />} onClick={() => navigate('/patients/register')}>Register Patient</Button>
            <Button type="primary" icon={<CalendarPlus size={15} />} onClick={() => navigate('/appointments/create')}>New Appointment</Button>
          </>
        }
      />
      <MetricGrid>
        <MetricCard label="Today's appointments" value={stats.appointmentsToday} icon={<CalendarDays size={20} />} loading={loading} delta={{ value: '+8%', direction: 'up', label: 'vs last week' }} onClick={() => navigate('/appointments')} />
        <MetricCard label="Patients today" value={stats.patientsToday} icon={<Users size={20} />} tone="info" loading={loading} delta={{ value: `${stats.waiting} waiting`, direction: 'flat' }} onClick={() => navigate('/appointments/queue')} />
        <MetricCard label="Pending consultations" value={stats.pendingConsults} icon={<Stethoscope size={20} />} tone="warning" loading={loading} onClick={() => navigate('/clinical')} />
        <MetricCard label="Providers available" value={`${stats.availableProviders}/${providers.length}`} icon={<Activity size={20} />} tone="success" loading={loading} onClick={() => navigate('/providers/availability')} />
        <MetricCard label="Active medications" value={mockDb.medications.filter((m) => m.status === 'Active').length} icon={<Pill size={20} />} tone="neutral" onClick={() => navigate('/clinical/medications')} />
      </MetricGrid>

      <div className="card-grid">
        <div className="col-8">
          <SectionCard title="Appointments — last 7 days" extra={<Button type="link" size="small" onClick={() => navigate('/reports/appointments')}>Report</Button>}>
            <BarsChart data={weekly} xKey="day" stacked series={[{ key: 'Completed', label: 'Completed' }, { key: 'Scheduled', label: 'Scheduled' }, { key: 'No-show', label: 'No-show' }]} height={260} />
          </SectionCard>
        </div>
        <div className="col-4">
          <SectionCard title="Today's appointment status">
            {statusDonut.length ? <DonutChart data={statusDonut} height={200} /> : <EmptyState title="No appointments today" />}
          </SectionCard>
        </div>
        <div className="col-4">
          <SectionCard title="Upcoming today" extra={<Button type="link" size="small" onClick={() => navigate('/appointments/queue')}>Queue</Button>}>
            {upcoming.length ? (
              upcoming.map((a) => (
                <div key={a.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/appointments/${a.id}`)}>
                  <div style={{ width: 64, fontWeight: 600, fontSize: 13 }}>{formatTime(a.startTime)}</div>
                  <div className="list-row-main">
                    <div className="list-row-title">{a.patientName}</div>
                    <div className="list-row-sub">{a.type} · {a.providerName}</div>
                  </div>
                  <StatusTag status={a.status} />
                </div>
              ))
            ) : (
              <EmptyState title="All caught up" description="No remaining appointments today." />
            )}
          </SectionCard>
        </div>
        <div className="col-4">
          <SectionCard title="Provider availability" extra={<Button type="link" size="small" onClick={() => navigate('/providers/availability')}>All</Button>}>
            {providers.slice(0, 6).map((p) => (
              <div key={p.id} className="list-row">
                <Avatar name={p.fullName} size={32} />
                <div className="list-row-main">
                  <div className="list-row-title">{p.fullName}</div>
                  <div className="list-row-sub">{p.specialty} · {p.patientsToday} pts today</div>
                </div>
                <div style={{ width: 90 }}>
                  <Progress percent={p.utilization} size="small" showInfo={false} strokeColor={p.utilization > 90 ? '#eb6834' : '#0f6e8c'} />
                </div>
                <StatusTag status={p.status} />
              </div>
            ))}
          </SectionCard>
        </div>
        <div className="col-4">
          <SectionCard title="Alerts">
            <List
              size="small"
              dataSource={[
                { t: 'Queue wait > 15 min at Riverside', s: 'warning' },
                { t: '2 credentials expiring within 30 days', s: 'warning' },
                { t: '5 lab results awaiting review', s: 'info' },
                { t: 'Vaccine refrigerator temperature alert cleared', s: 'success' },
              ]}
              renderItem={(it) => (
                <List.Item style={{ padding: '8px 0' }}>
                  <AlertTriangle size={15} color={it.s === 'warning' ? '#d98800' : it.s === 'info' ? '#2a78d6' : '#0f9d58'} style={{ marginRight: 10, flexShrink: 0 }} />
                  <span style={{ fontSize: 13 }}>{it.t}</span>
                </List.Item>
              )}
            />
          </SectionCard>
        </div>
        <div className="col-4">
          <SectionCard title="Appointments by type">
            <BarsChart data={byType} xKey="type" horizontal series={[{ key: 'count', label: 'Appointments' }]} height={230} />
          </SectionCard>
        </div>
        <div className="col-4">
          <SectionCard title="Recent patients" extra={<Button type="link" size="small" onClick={() => navigate('/patients')}>All patients</Button>}>
            {recentPatients.map((p) => (
              <div key={p.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/patients/${p.id}`)}>
                <Avatar name={p.fullName} size={32} />
                <div className="list-row-main">
                  <div className="list-row-title">{p.fullName}</div>
                  <div className="list-row-sub">{p.mrn} · last visit {fromNow(p.lastVisit)}</div>
                </div>
                <StatusTag status={p.riskLevel} />
              </div>
            ))}
          </SectionCard>
        </div>
        <div className="col-4">
          <SectionCard title="Recent activity">
            <Timeline items={activity.map((a) => ({ color: a.color, children: <div style={{ fontSize: 13 }}>{a.text}<div className="muted" style={{ fontSize: 11 }}>{a.time}</div></div> }))} />
          </SectionCard>
        </div>
        <div className="col-6">
          <SectionCard title="Quick actions">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {[
                { label: 'Patient search', icon: <Users size={16} />, path: '/patients/search' },
                { label: 'Start consultation', icon: <Stethoscope size={16} />, path: '/clinical/consultation' },
                { label: 'Calendar', icon: <CalendarDays size={16} />, path: '/appointments/calendar' },
                { label: 'Medications', icon: <Pill size={16} />, path: '/clinical/medications' },
                { label: 'Roster', icon: <ClipboardList size={16} />, path: '/roster' },
                { label: 'Reports', icon: <Activity size={16} />, path: '/reports' },
              ].map((q) => (
                <Button key={q.label} icon={q.icon} onClick={() => navigate(q.path)} style={{ justifyContent: 'flex-start', height: 44 }}>{q.label}</Button>
              ))}
            </div>
          </SectionCard>
        </div>
        <div className="col-6">
          <SectionCard title="Voice assistant & system status">
            <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
              <Mic size={18} color={voice.status === 'listening' ? '#d64545' : '#0f6e8c'} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Assistant {voice.status === 'idle' ? 'ready' : voice.status.replace('_', ' ')}</div>
                <div className="muted" style={{ fontSize: 12 }}>STT: {voice.sttProvider} · LLM: {voice.llmProvider}</div>
              </div>
              <Button type="primary" icon={<Mic size={14} />} onClick={() => getVoiceController().startListening()}>Speak</Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
              {[['Mock API', 'Operational'], ['Voice pipeline', voice.llmProvider.startsWith('mock') ? 'Mock mode' : 'Local model'], ['Registered pages', '85'], ['Last command', voice.lastCommandAt ? fromNow(new Date(voice.lastCommandAt).toISOString()) : '—']].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between" style={{ padding: '6px 10px', background: 'var(--color-surface-muted)', borderRadius: 8 }}>
                  <span className="muted">{k}</span>
                  <Tag color={v === 'Operational' ? 'green' : 'default'} style={{ margin: 0 }}>{v}</Tag>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
