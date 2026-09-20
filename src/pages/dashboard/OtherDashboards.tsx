import { useMemo, useState } from 'react';
import { Button, Progress, Segmented, Select, Table, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, Building2, CalendarDays, Clock, DollarSign, FlaskConical, Pill, Receipt, Stethoscope, TrendingUp, UserRound, Users } from 'lucide-react';
import { PageHeader, MetricCard, MetricGrid, SectionCard, StatusTag, Avatar, PrimaryCell } from '@/components/common';
import { BarsChart, DonutChart, TrendChart } from '@/components/charts';
import { useAppSelector } from '@/store';
import { appointmentSelectors } from '@/store/slices/appointmentSlice';
import { providerSelectors } from '@/store/slices/providerSlice';
import { patientSelectors } from '@/store/slices/patientSlice';
import { mockDb } from '@/services/api';
import { dayjs, formatCurrency, formatTime } from '@/utils/format';

const TODAY = dayjs().format('YYYY-MM-DD');
const months = Array.from({ length: 12 }, (_, i) => dayjs().subtract(11 - i, 'month').format('MMM'));
const seeded = (i: number, base: number, spread: number) => Math.round(base + Math.sin(i * 1.7) * spread + (i % 3) * spread * 0.2);

// ------------------------------------------------------------------ Practice
export function PracticeDashboard() {
  const navigate = useNavigate();
  const appointments = useAppSelector(appointmentSelectors.selectAll);
  const patients = useAppSelector(patientSelectors.selectAll);
  const [location, setLocation] = useState<string>('all');
  const filtered = location === 'all' ? appointments : appointments.filter((a) => a.locationName === location);
  const byLocation = mockDb.locations.map((l) => ({ location: l.name.split(' ')[0], Today: appointments.filter((a) => a.locationName === l.name && a.date === TODAY).length, 'This week': appointments.filter((a) => a.locationName === l.name && dayjs(a.date).isSame(dayjs(), 'week')).length }));
  const growth = months.map((m, i) => ({ month: m, 'New patients': seeded(i, 38, 9), 'Returning': seeded(i + 4, 210, 30) }));
  const newThisMonth = patients.filter((p) => dayjs(p.registeredAt).isSame(dayjs(), 'month')).length;
  return (
    <>
      <PageHeader title="Practice Dashboard" subtitle="Cross-location view of volume, capacity and patient growth" actions={<Select value={location} onChange={setLocation} style={{ width: 240 }} options={[{ value: 'all', label: 'All locations' }, ...mockDb.locations.map((l) => ({ value: l.name, label: l.name }))]} />} />
      <MetricGrid>
        <MetricCard label="Active patients" value={patients.filter((p) => p.status === 'Active').length} icon={<Users size={20} />} delta={{ value: `+${newThisMonth} this month`, direction: 'up' }} onClick={() => navigate('/patients')} />
        <MetricCard label="Appointments this week" value={filtered.filter((a) => dayjs(a.date).isSame(dayjs(), 'week')).length} icon={<CalendarDays size={20} />} tone="info" />
        <MetricCard label="Locations" value={mockDb.locations.length} icon={<Building2 size={20} />} tone="neutral" onClick={() => navigate('/practice/locations')} />
        <MetricCard label="Avg. room utilization" value="74%" icon={<Activity size={20} />} tone="success" delta={{ value: '+3 pts', direction: 'up' }} />
        <MetricCard label="No-show rate" value="6.8%" icon={<AlertTriangle size={20} />} tone="warning" delta={{ value: '-0.4 pts', direction: 'down', label: 'improving' }} />
      </MetricGrid>
      <div className="card-grid">
        <div className="col-8"><SectionCard title="Patient volume — 12 months"><TrendChart data={growth} xKey="month" series={[{ key: 'New patients', label: 'New patients' }, { key: 'Returning', label: 'Returning' }]} /></SectionCard></div>
        <div className="col-4"><SectionCard title="Appointments by location"><BarsChart data={byLocation} xKey="location" series={[{ key: 'Today', label: 'Today' }, { key: 'This week', label: 'This week' }]} height={260} /></SectionCard></div>
        <div className="col-6">
          <SectionCard title="Departments" extra={<Button type="link" size="small" onClick={() => navigate('/practice/departments')}>Manage</Button>}>
            <Table size="small" pagination={false} rowKey="id" dataSource={mockDb.departmentList.slice(0, 6)} columns={[{ title: 'Department', dataIndex: 'name' }, { title: 'Head', dataIndex: 'head' }, { title: 'Providers', dataIndex: 'providers', align: 'right' }, { title: 'Staff', dataIndex: 'staff', align: 'right' }, { title: 'Status', dataIndex: 'isActive', render: (v: boolean) => <StatusTag status={v ? 'Active' : 'Inactive'} /> }]} />
          </SectionCard>
        </div>
        <div className="col-6">
          <SectionCard title="Locations" extra={<Button type="link" size="small" onClick={() => navigate('/practice/locations')}>All</Button>}>
            {mockDb.locations.map((l) => (
              <div key={l.id} className="list-row">
                <Building2 size={18} className="muted" />
                <div className="list-row-main"><div className="list-row-title">{l.name}</div><div className="list-row-sub">{l.type} · {l.rooms} rooms · {l.providers} providers</div></div>
                <div style={{ width: 120 }}><Progress percent={60 + (l.rooms % 5) * 8} size="small" /></div>
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Provider
export function ProviderDashboard() {
  const navigate = useNavigate();
  const providers = useAppSelector(providerSelectors.selectAll);
  const appointments = useAppSelector(appointmentSelectors.selectAll);
  const user = useAppSelector((s) => s.auth.user);
  const [providerId, setProviderId] = useState<string | undefined>(user?.providerId ?? undefined);
  const provider = providers.find((p) => p.id === providerId) ?? providers[0];
  const mine = useMemo(() => appointments.filter((a) => a.providerId === provider?.id), [appointments, provider]);
  const today = mine.filter((a) => a.date === TODAY);
  const week = Array.from({ length: 7 }, (_, i) => { const d = dayjs().startOf('week').add(i, 'day'); return { day: d.format('ddd'), Visits: mine.filter((a) => a.date === d.format('YYYY-MM-DD')).length }; });
  const pendingSign = mockDb.consultations.filter((c) => c.providerId === provider?.id && c.status === 'Pending Sign-off');
  const labs = mockDb.labOrders.filter((l) => l.providerName === provider?.fullName && l.status === 'Resulted').slice(0, 5);
  if (!provider) return <PageHeader title="Provider Dashboard" />;
  return (
    <>
      <PageHeader title="Provider Dashboard" subtitle={`${provider.fullName} · ${provider.specialty} · ${provider.locationName}`} actions={<><Select value={provider.id} onChange={setProviderId} style={{ width: 240 }} showSearch optionFilterProp="label" options={providers.map((p) => ({ value: p.id, label: p.fullName }))} /><Button type="primary" icon={<Stethoscope size={15} />} onClick={() => navigate('/clinical/consultation')}>Start Consultation</Button></>} />
      <MetricGrid>
        <MetricCard label="My appointments today" value={today.length} icon={<CalendarDays size={20} />} onClick={() => navigate('/appointments/calendar')} />
        <MetricCard label="Waiting to be seen" value={today.filter((a) => a.status === 'Checked In').length} icon={<Clock size={20} />} tone="warning" onClick={() => navigate('/appointments/queue')} />
        <MetricCard label="Notes pending sign-off" value={pendingSign.length} icon={<Stethoscope size={20} />} tone="error" onClick={() => navigate('/clinical/notes')} />
        <MetricCard label="Results to review" value={labs.length} icon={<FlaskConical size={20} />} tone="info" onClick={() => navigate('/clinical/labs')} />
        <MetricCard label="Utilization" value={`${provider.utilization}%`} icon={<TrendingUp size={20} />} tone="success" />
      </MetricGrid>
      <div className="card-grid">
        <div className="col-8">
          <SectionCard title="Today's schedule">
            <Table size="small" rowKey="id" pagination={false} dataSource={today} onRow={(r) => ({ onClick: () => navigate(`/appointments/${r.id}`), className: 'table-row-clickable' })} columns={[{ title: 'Time', dataIndex: 'startTime', render: formatTime, width: 90 }, { title: 'Patient', dataIndex: 'patientName', render: (v: string, r) => <PrimaryCell title={v} subtitle={r.patientMrn} avatar={v} /> }, { title: 'Type', dataIndex: 'type' }, { title: 'Reason', dataIndex: 'reason', ellipsis: true }, { title: 'Room', dataIndex: 'room', render: (v?: string) => v ?? 'Virtual' }, { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> }]} locale={{ emptyText: 'No appointments today' }} />
          </SectionCard>
        </div>
        <div className="col-4"><SectionCard title="Visits this week"><BarsChart data={week} xKey="day" series={[{ key: 'Visits', label: 'Visits' }]} height={220} /></SectionCard></div>
        <div className="col-6">
          <SectionCard title="Pending sign-off" extra={<Button type="link" size="small" onClick={() => navigate('/clinical/notes')}>All notes</Button>}>
            {pendingSign.slice(0, 5).map((c) => (<div key={c.id} className="list-row"><Avatar name={c.patientName} size={30} /><div className="list-row-main"><div className="list-row-title">{c.patientName}</div><div className="list-row-sub">{c.date} · {c.chiefComplaint}</div></div><Button size="small" onClick={() => navigate(`/clinical/consultation?patient=${c.patientId}`)}>Review</Button></div>))}
            {!pendingSign.length && <span className="muted">Nothing pending.</span>}
          </SectionCard>
        </div>
        <div className="col-6">
          <SectionCard title="Recent results" extra={<Button type="link" size="small" onClick={() => navigate('/clinical/labs')}>Labs</Button>}>
            {labs.map((l) => (<div key={l.id} className="list-row"><FlaskConical size={16} className="muted" /><div className="list-row-main"><div className="list-row-title">{l.testName} — {l.patientName}</div><div className="list-row-sub">{dayjs(l.resultedAt).format('MMM D')} · {l.lab}</div></div>{l.abnormal ? <Tag color="red">Abnormal</Tag> : <Tag color="green">Normal</Tag>}</div>))}
          </SectionCard>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Operations
export function OperationsDashboard() {
  const navigate = useNavigate();
  const appointments = useAppSelector(appointmentSelectors.selectAll);
  const today = appointments.filter((a) => a.date === TODAY);
  const hourly = Array.from({ length: 10 }, (_, i) => { const h = 8 + i; return { hour: dayjs().hour(h).format('hA'), Arrivals: today.filter((a) => Number(a.startTime.slice(0, 2)) === h).length, Capacity: 6 }; });
  const rooms = mockDb.rooms;
  const roomStatus = ['Available', 'Occupied', 'Cleaning', 'Maintenance'].map((s) => ({ name: s, value: rooms.filter((r) => r.status === s).length }));
  const staffOn = mockDb.shifts.filter((s) => s.date === TODAY);
  return (
    <>
      <PageHeader title="Operations Dashboard" subtitle="Live view of patient flow, rooms and staffing" actions={<Segmented options={['Live', 'Today', 'Week']} defaultValue="Live" />} />
      <MetricGrid>
        <MetricCard label="Checked in" value={today.filter((a) => a.status === 'Checked In').length} icon={<Users size={20} />} tone="info" onClick={() => navigate('/appointments/queue')} />
        <MetricCard label="Avg. wait time" value="12 min" icon={<Clock size={20} />} tone="warning" delta={{ value: '+2 min', direction: 'down' }} />
        <MetricCard label="Rooms available" value={`${roomStatus[0].value}/${rooms.length}`} icon={<Building2 size={20} />} tone="success" onClick={() => navigate('/practice/rooms')} />
        <MetricCard label="Staff on shift" value={staffOn.length} icon={<UserRound size={20} />} onClick={() => navigate('/roster')} />
        <MetricCard label="Cancellations today" value={today.filter((a) => a.status === 'Cancelled').length} icon={<AlertTriangle size={20} />} tone="error" />
      </MetricGrid>
      <div className="card-grid">
        <div className="col-8"><SectionCard title="Arrivals vs capacity by hour"><BarsChart data={hourly} xKey="hour" series={[{ key: 'Arrivals', label: 'Arrivals' }, { key: 'Capacity', label: 'Capacity' }]} /></SectionCard></div>
        <div className="col-4"><SectionCard title="Room status"><DonutChart data={roomStatus} height={200} /></SectionCard></div>
        <div className="col-6">
          <SectionCard title="Room board" extra={<Button type="link" size="small" onClick={() => navigate('/practice/rooms')}>Manage</Button>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {rooms.slice(0, 12).map((r) => (<div key={r.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 10 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div><div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>{r.locationName.split(' ')[0]}</div><StatusTag status={r.status} /></div>))}
            </div>
          </SectionCard>
        </div>
        <div className="col-6">
          <SectionCard title="Staff on shift today" extra={<Button type="link" size="small" onClick={() => navigate('/roster/shifts')}>Shifts</Button>}>
            <Table size="small" pagination={false} rowKey="id" dataSource={staffOn.slice(0, 8)} columns={[{ title: 'Staff', dataIndex: 'providerName' }, { title: 'Shift', dataIndex: 'type' }, { title: 'Hours', render: (_, r) => `${formatTime(r.startTime)} – ${formatTime(r.endTime)}` }, { title: 'Location', dataIndex: 'locationName', ellipsis: true }, { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> }]} />
          </SectionCard>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Financial
export function FinancialOverview() {
  const [range, setRange] = useState('12m');
  const revenue = months.map((m, i) => ({ month: m, Revenue: seeded(i, 412000, 48000), Collections: seeded(i + 1, 372000, 44000) }));
  const payerMix = [{ name: 'Commercial', value: 46 }, { name: 'Medicare', value: 28 }, { name: 'Medicaid', value: 14 }, { name: 'Self-pay', value: 12 }];
  const ar = [{ bucket: '0–30', Amount: 182000 }, { bucket: '31–60', Amount: 76000 }, { bucket: '61–90', Amount: 41000 }, { bucket: '91–120', Amount: 22000 }, { bucket: '120+', Amount: 18000 }];
  const topServices = mockDb.services.slice(0, 6).map((s, i) => ({ ...s, volume: 120 - i * 14, revenue: (120 - i * 14) * s.price }));
  return (
    <>
      <PageHeader title="Financial Overview" subtitle="Revenue, collections and receivables across the practice" actions={<Segmented value={range} onChange={(v) => setRange(String(v))} options={[{ label: '3M', value: '3m' }, { label: '6M', value: '6m' }, { label: '12M', value: '12m' }]} />} />
      <MetricGrid>
        <MetricCard label="Revenue (MTD)" value={formatCurrency(438200)} icon={<DollarSign size={20} />} tone="success" delta={{ value: '+6.2%', direction: 'up', label: 'vs last month' }} />
        <MetricCard label="Collections (MTD)" value={formatCurrency(391400)} icon={<Receipt size={20} />} delta={{ value: '89.3% rate', direction: 'flat' }} />
        <MetricCard label="Outstanding A/R" value={formatCurrency(339000)} icon={<TrendingUp size={20} />} tone="warning" delta={{ value: '38 days', direction: 'down', label: 'avg. days in A/R' }} />
        <MetricCard label="Claims denied" value="4.1%" icon={<AlertTriangle size={20} />} tone="error" delta={{ value: '-0.6 pts', direction: 'down' }} />
        <MetricCard label="Avg. revenue / visit" value={formatCurrency(168)} icon={<Activity size={20} />} tone="info" />
      </MetricGrid>
      <div className="card-grid">
        <div className="col-8"><SectionCard title="Revenue vs collections"><TrendChart data={revenue.slice(range === '3m' ? 9 : range === '6m' ? 6 : 0)} xKey="month" series={[{ key: 'Revenue', label: 'Revenue' }, { key: 'Collections', label: 'Collections' }]} formatValue={(v) => `$${Math.round(v / 1000)}k`} /></SectionCard></div>
        <div className="col-4"><SectionCard title="Payer mix (%)"><DonutChart data={payerMix} height={200} /></SectionCard></div>
        <div className="col-5 col-6"><SectionCard title="A/R aging"><BarsChart data={ar} xKey="bucket" series={[{ key: 'Amount', label: 'Outstanding' }]} formatValue={(v) => `$${Math.round(v / 1000)}k`} height={240} /></SectionCard></div>
        <div className="col-6">
          <SectionCard title="Top services by revenue">
            <Table size="small" pagination={false} rowKey="id" dataSource={topServices} columns={[{ title: 'Service', dataIndex: 'name', ellipsis: true }, { title: 'CPT', dataIndex: 'cptCode', width: 80 }, { title: 'Volume', dataIndex: 'volume', align: 'right' }, { title: 'Revenue', dataIndex: 'revenue', align: 'right', render: (v: number) => formatCurrency(v) }]} />
          </SectionCard>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Clinical overview
export function ClinicalOverview() {
  const navigate = useNavigate();
  const problems = mockDb.problems.filter((p) => p.status === 'Active' || p.status === 'Chronic');
  const topDx = Object.entries(problems.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.description.split(',')[0]]: (acc[p.description.split(',')[0]] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([dx, count]) => ({ dx: dx.length > 28 ? dx.slice(0, 28) + '…' : dx, count }));
  const labStatus = ['Ordered', 'Collected', 'In Progress', 'Resulted'].map((s) => ({ name: s, value: mockDb.labOrders.filter((l) => l.status === s).length }));
  const abnormal = mockDb.labOrders.filter((l) => l.abnormal).slice(0, 6);
  const immunizationDue = mockDb.immunizations.filter((i) => i.status === 'Due' || i.status === 'Overdue');
  return (
    <>
      <PageHeader title="Clinical Overview" subtitle="Population health, orders and clinical quality indicators" />
      <MetricGrid>
        <MetricCard label="Active problems" value={problems.length} icon={<Stethoscope size={20} />} onClick={() => navigate('/clinical/diagnosis')} />
        <MetricCard label="Active medications" value={mockDb.medications.filter((m) => m.status === 'Active').length} icon={<Pill size={20} />} tone="info" onClick={() => navigate('/clinical/medications')} />
        <MetricCard label="Abnormal results" value={mockDb.labOrders.filter((l) => l.abnormal).length} icon={<FlaskConical size={20} />} tone="error" onClick={() => navigate('/clinical/labs')} />
        <MetricCard label="Immunizations due" value={immunizationDue.length} icon={<AlertTriangle size={20} />} tone="warning" />
        <MetricCard label="Open referrals" value={mockDb.referrals.filter((r) => ['Pending', 'Sent', 'Accepted'].includes(r.status)).length} icon={<Activity size={20} />} tone="neutral" onClick={() => navigate('/clinical/referrals')} />
      </MetricGrid>
      <div className="card-grid">
        <div className="col-7 col-8"><SectionCard title="Most common active diagnoses"><BarsChart data={topDx} xKey="dx" horizontal series={[{ key: 'count', label: 'Patients' }]} height={280} /></SectionCard></div>
        <div className="col-4"><SectionCard title="Lab order pipeline"><DonutChart data={labStatus} height={200} /></SectionCard></div>
        <div className="col-6">
          <SectionCard title="Abnormal results needing review" extra={<Button type="link" size="small" onClick={() => navigate('/clinical/labs')}>All labs</Button>}>
            <Table size="small" pagination={false} rowKey="id" dataSource={abnormal} columns={[{ title: 'Patient', dataIndex: 'patientName' }, { title: 'Test', dataIndex: 'testName' }, { title: 'Resulted', dataIndex: 'resultedAt', render: (v: string) => dayjs(v).format('MMM D') }, { title: 'Provider', dataIndex: 'providerName', ellipsis: true }]} />
          </SectionCard>
        </div>
        <div className="col-6">
          <SectionCard title="Quality measures">
            {[['Diabetes: HbA1c tested in last 6 months', 82], ['Hypertension: BP controlled (<140/90)', 71], ['Annual wellness visit completed', 64], ['Influenza vaccination (65+)', 58], ['Depression screening documented', 77]].map(([label, pct]) => (
              <div key={String(label)} style={{ marginBottom: 12 }}><div className="flex justify-between" style={{ fontSize: 13, marginBottom: 4 }}><span>{label}</span><strong>{pct}%</strong></div><Progress percent={Number(pct)} showInfo={false} size="small" strokeColor={Number(pct) >= 75 ? '#0f9d58' : Number(pct) >= 60 ? '#d98800' : '#d64545'} /></div>
            ))}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
