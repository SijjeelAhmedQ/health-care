import { useEffect, useMemo, useState } from 'react';
import { Button, Card, DatePicker, Descriptions, Dropdown, Form, Input, Modal, Progress, Rate, Select, Table, Tabs, Tag, message } from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Award, CalendarDays, Clock, MoreHorizontal, Pencil, Plus, ShieldAlert, Star, Stethoscope, TrendingUp, UserRound, Users, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PageHeader, MetricCard, MetricGrid, SectionCard, StatusTag, PrimaryCell, KeyValue, Avatar, EmptyState } from '@/components/common';
import { DataTable, type DataColumn } from '@/components/tables/DataTable';
import { BarsChart, TrendChart } from '@/components/charts';
import { ProviderFormDrawer } from '@/components/forms/StaffForms';
import { useAppDispatch, useAppSelector } from '@/store';
import { providerSelectors, setCurrentProvider, updateProvider } from '@/store/slices/providerSlice';
import { appointmentSelectors } from '@/store/slices/appointmentSlice';
import { useAsyncData } from '@/hooks';
import { credentialService, mockDb } from '@/services/api';
import type { AvailabilitySlot, Credential, Provider } from '@/types/domain';
import { dayjs, formatDate, formatTime } from '@/utils/format';
import { SPECIALTY_OPTIONS, LOCATION_OPTIONS } from '@/registry/fieldRegistry';

// ------------------------------------------------------------------ List (44)
export function ProviderListPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [params] = useSearchParams();
  const providers = useAppSelector(providerSelectors.selectAll);
  const loading = useAppSelector((s) => s.providers.status === 'loading');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');
  useEffect(() => setSearch(params.get('q') ?? ''), [params]);
  const openProvider = (p: Provider) => { dispatch(setCurrentProvider(p.id)); navigate(`/providers/${p.id}`); };
  const columns: DataColumn<Provider>[] = [
    { key: 'n', title: 'Provider', dataIndex: 'fullName', hideable: false, render: (v: string, p) => <PrimaryCell title={v} subtitle={`${p.title} · ${p.code}`} avatar={v} />, sorter: (a, b) => a.lastName.localeCompare(b.lastName) },
    { key: 's', title: 'Specialty', dataIndex: 'specialty' },
    { key: 'd', title: 'Department', dataIndex: 'department', defaultHidden: true },
    { key: 'l', title: 'Location', dataIndex: 'locationName', ellipsis: true },
    { key: 'e', title: 'Employment', dataIndex: 'employmentType' },
    { key: 'lic', title: 'License', dataIndex: 'licenseNumber', render: (v: string, p) => <PrimaryCell title={v} subtitle={`exp ${formatDate(p.licenseExpiry)}`} />, defaultHidden: true },
    { key: 'today', title: 'Today', dataIndex: 'patientsToday', align: 'right', render: (v: number) => `${v} pts` },
    { key: 'u', title: 'Utilization', dataIndex: 'utilization', render: (v: number) => <Progress percent={v} size="small" style={{ width: 90 }} strokeColor={v > 90 ? '#eb6834' : undefined} />, sorter: (a, b) => a.utilization - b.utilization },
    { key: 'r', title: 'Rating', dataIndex: 'rating', render: (v: number) => <span className="flex items-center gap-2"><Star size={13} fill="#eda100" color="#eda100" />{v}</span> },
    { key: 'new', title: 'New patients', dataIndex: 'acceptingNewPatients', render: (v: boolean) => (v ? <Tag color="green">Accepting</Tag> : <Tag>Closed</Tag>) },
    { key: 'st', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, hideable: false, render: (_, p) => <Dropdown trigger={['click']} menu={{ items: [{ key: 'o', label: 'Open profile', onClick: () => openProvider(p) }, { key: 'sched', label: 'View schedule', onClick: () => navigate(`/providers/schedule?provider=${p.id}`) }, { key: 'leave', label: p.status === 'On Leave' ? 'Mark active' : 'Mark on leave', onClick: () => dispatch(updateProvider({ id: p.id, patch: { status: p.status === 'On Leave' ? 'Active' : 'On Leave' } })) }, { key: 'toggle', label: p.acceptingNewPatients ? 'Stop accepting new patients' : 'Accept new patients', onClick: () => dispatch(updateProvider({ id: p.id, patch: { acceptingNewPatients: !p.acceptingNewPatients } })) }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} onClick={(e) => e.stopPropagation()} /></Dropdown> },
  ];
  return (
    <>
      <PageHeader title="Provider List" subtitle={`${providers.length} providers · ${providers.filter((p) => p.acceptingNewPatients).length} accepting new patients`} actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Provider</Button>} />
      <MetricGrid>
        <MetricCard label="Active providers" value={providers.filter((p) => p.status === 'Active').length} icon={<UserRound size={20} />} loading={loading} />
        <MetricCard label="On leave" value={providers.filter((p) => p.status === 'On Leave').length} icon={<Clock size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Avg. utilization" value={`${Math.round(providers.reduce((s, p) => s + p.utilization, 0) / Math.max(1, providers.length))}%`} icon={<TrendingUp size={20} />} tone="info" loading={loading} />
        <MetricCard label="Specialties" value={new Set(providers.map((p) => p.specialty)).size} icon={<Stethoscope size={20} />} tone="neutral" loading={loading} />
      </MetricGrid>
      <DataTable<Provider> rowKey="id" columns={columns} data={providers} loading={loading} search={search} onSearchChange={setSearch} searchKeys={['fullName', 'specialty', 'department', 'licenseNumber', 'npi']} filters={[{ key: 'specialty', label: 'Specialty', options: SPECIALTY_OPTIONS }, { key: 'locationName', label: 'Location', options: LOCATION_OPTIONS }, { key: 'status', label: 'Status', options: ['Active', 'On Leave', 'Inactive'] }, { key: 'employmentType', label: 'Employment', options: ['Full-time', 'Part-time', 'Locum', 'Contract'] }]} onRowClick={openProvider} exportable pageSize={15} />
      <ProviderFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} />
    </>
  );
}

// ------------------------------------------------------------------ Profile (45/46)
export function ProviderProfilePage() {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const provider = useAppSelector((s) => (id ? providerSelectors.selectById(s, id) : undefined));
  const loading = useAppSelector((s) => s.providers.status !== 'succeeded');
  const appts = useAppSelector((s) => appointmentSelectors.selectAll(s).filter((a) => a.providerId === id));
  const [edit, setEdit] = useState(false);
  useEffect(() => { if (id) dispatch(setCurrentProvider(id)); }, [id, dispatch]);
  const creds = useMemo(() => mockDb.credentials.filter((c) => c.providerId === id), [id]);
  const avail = useMemo(() => mockDb.availability.filter((a) => a.providerId === id), [id]);
  const patients = useMemo(() => mockDb.patients.filter((p) => p.primaryProviderId === id), [id]);
  if (!provider) return loading ? <Card loading /> : <EmptyState title="Provider not found" action={<Button onClick={() => navigate('/providers')}>Back</Button>} />;
  const monthly = Array.from({ length: 6 }, (_, i) => { const m = dayjs().subtract(5 - i, 'month'); return { month: m.format('MMM'), Visits: appts.filter((a) => dayjs(a.date).isSame(m, 'month') && a.status === 'Completed').length + 20 + i * 3 }; });
  return (
    <>
      <PageHeader
        title={provider.fullName}
        breadcrumbs={[{ title: <a onClick={() => navigate('/dashboard')}>Home</a> }, { title: <a onClick={() => navigate('/providers')}>Providers</a> }, { title: provider.fullName }]}
        actions={<><Button icon={<CalendarDays size={15} />} onClick={() => navigate(`/providers/schedule?provider=${provider.id}`)}>Schedule</Button><Button type="primary" icon={<Pencil size={15} />} onClick={() => setEdit(true)}>Edit Provider</Button></>}
        extra={
          <Card style={{ marginTop: 12 }} styles={{ body: { padding: 16 } }}>
            <div className="flex gap-3 wrap items-center">
              <Avatar name={provider.fullName} size={56} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="flex items-center gap-2 wrap"><strong style={{ fontSize: 16 }}>{provider.fullName}, {provider.title}</strong><StatusTag status={provider.status} />{provider.acceptingNewPatients && <Tag color="green">Accepting new patients</Tag>}</div>
                <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>{provider.specialty} · {provider.department} · {provider.locationName}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{provider.email} · {provider.phone} · NPI {provider.npi}</div>
              </div>
              <Descriptions size="small" column={{ xs: 2, md: 4 }} items={[{ key: '1', label: 'Rating', children: <span className="flex items-center gap-2"><Rate disabled allowHalf value={provider.rating} style={{ fontSize: 12 }} /> {provider.rating}</span> }, { key: '2', label: 'Utilization', children: `${provider.utilization}%` }, { key: '3', label: 'Patients today', children: provider.patientsToday }, { key: '4', label: 'Experience', children: `${provider.yearsExperience} yrs` }]} />
            </div>
          </Card>
        }
      />
      <Tabs
        activeKey={tab ?? 'details'}
        onChange={(k) => navigate(`/providers/${provider.id}${k === 'details' ? '' : `/${k}`}`)}
        items={[
          { key: 'details', label: 'Details', children: (
            <div className="card-grid">
              <div className="col-6"><SectionCard title="Professional details"><KeyValue columns={2} items={[{ label: 'Provider code', value: provider.code }, { label: 'Title', value: provider.title }, { label: 'Specialty', value: provider.specialty }, { label: 'Department', value: provider.department }, { label: 'Employment', value: provider.employmentType }, { label: 'Languages', value: provider.languages.join(', ') }, { label: 'License', value: `${provider.licenseNumber} (${provider.licenseState})` }, { label: 'License expiry', value: formatDate(provider.licenseExpiry) }, { label: 'NPI', value: provider.npi }, { label: 'Location', value: provider.locationName }]} /><p className="text-secondary" style={{ marginTop: 16, fontSize: 13 }}>{provider.bio}</p></SectionCard></div>
              <div className="col-6"><SectionCard title="Completed visits — 6 months"><TrendChart data={monthly} xKey="month" series={[{ key: 'Visits', label: 'Visits' }]} height={220} /></SectionCard>
                <SectionCard title="Weekly availability">{avail.length ? <Table size="small" pagination={false} rowKey="id" dataSource={avail} columns={[{ title: 'Day', dataIndex: 'dayOfWeek' }, { title: 'Hours', render: (_, a) => `${formatTime(a.startTime)} – ${formatTime(a.endTime)}` }, { title: 'Slot', dataIndex: 'slotMinutes', render: (v: number) => `${v} min` }, { title: 'Type', dataIndex: 'type' }]} /> : <span className="muted">No availability configured</span>}</SectionCard></div>
            </div>
          ) },
          { key: 'schedule', label: `Appointments (${appts.length})`, children: <Table size="small" rowKey="id" dataSource={[...appts].sort((a, b) => b.date.localeCompare(a.date))} pagination={{ pageSize: 10 }} onRow={(a) => ({ onClick: () => navigate(`/appointments/${a.id}`), className: 'table-row-clickable' })} columns={[{ title: 'Date', dataIndex: 'date', render: (v: string) => formatDate(v) }, { title: 'Time', dataIndex: 'startTime', render: formatTime }, { title: 'Patient', dataIndex: 'patientName' }, { title: 'Type', dataIndex: 'type' }, { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> }]} /> },
          { key: 'credentials', label: `Credentials (${creds.length})`, children: <Table size="small" rowKey="id" dataSource={creds} pagination={false} columns={[{ title: 'Credential', dataIndex: 'name' }, { title: 'Type', dataIndex: 'type' }, { title: 'Issuer', dataIndex: 'issuer' }, { title: 'Number', dataIndex: 'number' }, { title: 'Expires', dataIndex: 'expiryDate', render: (v: string) => formatDate(v) }, { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> }]} /> },
          { key: 'patients', label: `Panel (${patients.length})`, children: <Table size="small" rowKey="id" dataSource={patients} pagination={{ pageSize: 10 }} onRow={(p) => ({ onClick: () => navigate(`/patients/${p.id}`), className: 'table-row-clickable' })} columns={[{ title: 'Patient', dataIndex: 'fullName' }, { title: 'MRN', dataIndex: 'mrn' }, { title: 'Age', dataIndex: 'age' }, { title: 'Last visit', dataIndex: 'lastVisit', render: (v: string) => formatDate(v) }, { title: 'Risk', dataIndex: 'riskLevel', render: (v: string) => <StatusTag status={v} /> }]} /> },
        ]}
      />
      <ProviderFormDrawer open={edit} onOpen={() => setEdit(true)} onClose={() => setEdit(false)} existing={provider} />
    </>
  );
}

// ------------------------------------------------------------------ Availability (47)
export function ProviderAvailabilityPage() {
  const providers = useAppSelector(providerSelectors.selectAll);
  const appts = useAppSelector(appointmentSelectors.selectAll);
  const [date, setDate] = useState(dayjs());
  const [location, setLocation] = useState<string | undefined>();
  const dayName = date.format('ddd') as AvailabilitySlot['dayOfWeek'];
  const rows = providers.filter((p) => !location || p.locationName === location).map((p) => {
    const slot = mockDb.availability.find((a) => a.providerId === p.id && a.dayOfWeek === dayName);
    const booked = appts.filter((a) => a.providerId === p.id && a.date === date.format('YYYY-MM-DD') && !['Cancelled'].includes(a.status));
    const capacity = slot ? Math.round((dayjs(`2000-01-01T${slot.endTime}`).diff(dayjs(`2000-01-01T${slot.startTime}`), 'minute')) / slot.slotMinutes) : 0;
    const onLeave = mockDb.leaveRequests.some((l) => l.providerId === p.id && l.status === 'Approved' && date.format('YYYY-MM-DD') >= l.startDate && date.format('YYYY-MM-DD') <= l.endDate);
    return { ...p, slot, booked: booked.length, capacity, free: Math.max(0, capacity - booked.length), onLeave };
  });
  const available = rows.filter((r) => r.slot && !r.onLeave && r.status === 'Active');
  return (
    <>
      <PageHeader title="Provider Availability" subtitle={`Who is available on ${date.format('dddd, MMM D')} and how many open slots remain`} actions={<><Button onClick={() => setDate(date.subtract(1, 'day'))}>‹</Button><Button onClick={() => setDate(dayjs())}>Today</Button><Button onClick={() => setDate(date.add(1, 'day'))}>›</Button><Select allowClear placeholder="Location" style={{ width: 220 }} value={location} onChange={setLocation} options={LOCATION_OPTIONS.map((l) => ({ value: l, label: l }))} /></>} />
      <MetricGrid>
        <MetricCard label="Available providers" value={available.length} icon={<CheckCircle2 size={20} />} tone="success" />
        <MetricCard label="Open slots" value={available.reduce((s, r) => s + r.free, 0)} icon={<Clock size={20} />} tone="info" />
        <MetricCard label="On leave" value={rows.filter((r) => r.onLeave).length} icon={<AlertTriangle size={20} />} tone="warning" />
        <MetricCard label="Not scheduled" value={rows.filter((r) => !r.slot && !r.onLeave).length} icon={<UserRound size={20} />} tone="neutral" />
      </MetricGrid>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {rows.map((r) => (
          <Card key={r.id} size="small" styles={{ body: { padding: 14 } }}>
            <div className="flex items-center gap-3"><Avatar name={r.fullName} size={38} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{r.fullName}</div><div className="muted" style={{ fontSize: 12 }}>{r.specialty} · {r.locationName.split(' ')[0]}</div></div>{r.onLeave ? <Tag color="gold">On leave</Tag> : r.status !== 'Active' ? <StatusTag status={r.status} /> : r.slot ? <Tag color={r.free > 0 ? 'green' : 'red'}>{r.free > 0 ? `${r.free} open` : 'Full'}</Tag> : <Tag>Off</Tag>}</div>
            {r.slot && !r.onLeave && <div style={{ marginTop: 10 }}><div className="flex justify-between muted" style={{ fontSize: 12 }}><span>{formatTime(r.slot.startTime)} – {formatTime(r.slot.endTime)} · {r.slot.type}</span><span>{r.booked}/{r.capacity} booked</span></div><Progress percent={Math.round((r.booked / Math.max(1, r.capacity)) * 100)} size="small" showInfo={false} strokeColor={r.free === 0 ? '#d64545' : '#0f6e8c'} /></div>}
          </Card>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Schedule (48)
export function ProviderSchedulePage() {
  const [params] = useSearchParams();
  const providers = useAppSelector(providerSelectors.selectAll);
  const appts = useAppSelector(appointmentSelectors.selectAll);
  const navigate = useNavigate();
  const [providerId, setProviderId] = useState<string>(params.get('provider') ?? providers[0]?.id ?? '');
  const [weekStart, setWeekStart] = useState(dayjs().startOf('week'));
  useEffect(() => { if (!providerId && providers[0]) setProviderId(providers[0].id); }, [providers, providerId]);
  const provider = providers.find((p) => p.id === providerId);
  const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));
  const mine = appts.filter((a) => a.providerId === providerId);
  const shifts = mockDb.shifts.filter((s) => s.providerId === providerId);
  return (
    <>
      <PageHeader title="Provider Schedule" subtitle={provider ? `${provider.fullName} — week of ${weekStart.format('MMM D, YYYY')}` : 'Select a provider'} actions={<><Select showSearch optionFilterProp="label" style={{ width: 240 }} value={providerId} onChange={setProviderId} options={providers.map((p) => ({ value: p.id, label: p.fullName }))} /><Button onClick={() => setWeekStart(weekStart.subtract(1, 'week'))}>‹</Button><Button onClick={() => setWeekStart(dayjs().startOf('week'))}>This week</Button><Button onClick={() => setWeekStart(weekStart.add(1, 'week'))}>›</Button></>} />
      <div className="calendar-scroll">
        <div className="calendar-grid" style={{ ['--cols' as string]: 7, gridTemplateColumns: 'repeat(7, minmax(150px, 1fr))' }}>
          {days.map((d) => {
            const key = d.format('YYYY-MM-DD');
            const shift = shifts.find((s) => s.date === key);
            const avail = mockDb.availability.find((a) => a.providerId === providerId && a.dayOfWeek === d.format('ddd'));
            return (
              <div key={key} style={{ display: 'contents' }}>
                <div className={`calendar-head ${d.isSame(dayjs(), 'day') ? 'today' : ''}`} style={{ gridRow: 1 }}>{d.format('ddd D')}<div className="muted" style={{ fontSize: 11 }}>{shift ? `${shift.type} shift` : avail ? `${formatTime(avail.startTime)}–${formatTime(avail.endTime)}` : 'Off'}</div></div>
              </div>
            );
          })}
          {days.map((d) => {
            const key = d.format('YYYY-MM-DD');
            const dayAppts = mine.filter((a) => a.date === key).sort((a, b) => a.startTime.localeCompare(b.startTime));
            return (
              <div key={key + 'b'} className="calendar-cell" style={{ minHeight: 320, gridRow: 2 }}>
                {dayAppts.map((a) => <div key={a.id} className="appt-chip" style={{ borderLeftColor: mockDb.appointmentTypes.find((t) => t.name === a.type)?.color ?? '#0f6e8c' }} onClick={() => navigate(`/appointments/${a.id}`)}><b>{formatTime(a.startTime)} {a.patientName}</b><span className="muted">{a.type}</span></div>)}
                {!dayAppts.length && <div className="muted" style={{ fontSize: 12, textAlign: 'center', paddingTop: 20 }}>No appointments</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="card-grid" style={{ marginTop: 20 }}>
        <div className="col-4"><MetricCard label="Appointments this week" value={mine.filter((a) => days.some((d) => d.format('YYYY-MM-DD') === a.date)).length} icon={<CalendarDays size={20} />} /></div>
        <div className="col-4"><MetricCard label="Shifts this week" value={shifts.filter((s) => days.some((d) => d.format('YYYY-MM-DD') === s.date)).length} icon={<Clock size={20} />} tone="info" /></div>
        <div className="col-4"><MetricCard label="Telehealth" value={mine.filter((a) => a.isTelehealth && days.some((d) => d.format('YYYY-MM-DD') === a.date)).length} icon={<Users size={20} />} tone="neutral" /></div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Performance (49)
export function ProviderPerformancePage() {
  const providers = useAppSelector(providerSelectors.selectAll);
  const appts = useAppSelector(appointmentSelectors.selectAll);
  const rows = providers.map((p) => { const mine = appts.filter((a) => a.providerId === p.id); const completed = mine.filter((a) => a.status === 'Completed').length; const noShow = mine.filter((a) => a.status === 'No Show').length; return { ...p, total: mine.length, completed, noShowRate: mine.length ? Math.round((noShow / mine.length) * 100) : 0, avgDuration: Math.round(mine.reduce((s, a) => s + a.durationMinutes, 0) / Math.max(1, mine.length)) }; }).sort((a, b) => b.completed - a.completed);
  const chart = rows.slice(0, 8).map((r) => ({ provider: r.lastName, Completed: r.completed, Utilization: r.utilization }));
  return (
    <>
      <PageHeader title="Provider Performance" subtitle="Productivity, utilization and patient experience by provider" />
      <MetricGrid>
        <MetricCard label="Top performer" value={rows[0]?.fullName ?? '—'} icon={<Award size={20} />} tone="success" />
        <MetricCard label="Avg. utilization" value={`${Math.round(rows.reduce((s, r) => s + r.utilization, 0) / Math.max(1, rows.length))}%`} icon={<TrendingUp size={20} />} />
        <MetricCard label="Avg. rating" value={(rows.reduce((s, r) => s + r.rating, 0) / Math.max(1, rows.length)).toFixed(1)} icon={<Star size={20} />} tone="warning" />
        <MetricCard label="Avg. no-show rate" value={`${Math.round(rows.reduce((s, r) => s + r.noShowRate, 0) / Math.max(1, rows.length))}%`} icon={<AlertTriangle size={20} />} tone="error" />
      </MetricGrid>
      <div className="card-grid"><div className="col-12"><SectionCard title="Completed visits by provider"><BarsChart data={chart} xKey="provider" series={[{ key: 'Completed', label: 'Completed visits' }]} height={240} /></SectionCard></div></div>
      <Card><Table size="small" rowKey="id" dataSource={rows} pagination={false} scroll={{ x: 'max-content' }} columns={[{ title: 'Provider', dataIndex: 'fullName', render: (v: string, r) => <PrimaryCell title={v} subtitle={r.specialty} avatar={v} /> }, { title: 'Visits', dataIndex: 'total', align: 'right', sorter: (a, b) => a.total - b.total }, { title: 'Completed', dataIndex: 'completed', align: 'right', sorter: (a, b) => a.completed - b.completed }, { title: 'No-show %', dataIndex: 'noShowRate', align: 'right', render: (v: number) => <span style={{ color: v > 10 ? '#d64545' : undefined }}>{v}%</span> }, { title: 'Avg. visit', dataIndex: 'avgDuration', align: 'right', render: (v: number) => `${v} min` }, { title: 'Utilization', dataIndex: 'utilization', render: (v: number) => <Progress percent={v} size="small" style={{ width: 120 }} />, sorter: (a, b) => a.utilization - b.utilization }, { title: 'Rating', dataIndex: 'rating', render: (v: number) => <Rate disabled allowHalf value={v} style={{ fontSize: 12 }} /> }, { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> }]} /></Card>
    </>
  );
}

// ------------------------------------------------------------------ Credentials (50)
export function ProviderCredentialsPage() {
  const { data, loading, reload } = useAsyncData(() => credentialService.all());
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const providers = useAppSelector(providerSelectors.selectAll);
  const columns: DataColumn<Credential>[] = [
    { key: 'p', title: 'Provider', dataIndex: 'providerName', hideable: false, render: (v: string) => <PrimaryCell title={v} avatar={v} /> },
    { key: 'n', title: 'Credential', dataIndex: 'name', render: (v: string, c) => <PrimaryCell title={v} subtitle={c.type} /> },
    { key: 'i', title: 'Issuer', dataIndex: 'issuer', ellipsis: true },
    { key: 'num', title: 'Number', dataIndex: 'number', render: (v: string) => <span className="mono">{v}</span> },
    { key: 'iss', title: 'Issued', dataIndex: 'issuedDate', render: (v: string) => formatDate(v), defaultHidden: true },
    { key: 'exp', title: 'Expires', dataIndex: 'expiryDate', render: (v: string) => { const d = dayjs(v).diff(dayjs(), 'day'); return <span style={{ color: d < 0 ? '#d64545' : d < 90 ? '#d98800' : undefined }}>{formatDate(v)} <span className="muted">({d < 0 ? `${-d}d ago` : `${d}d`})</span></span>; }, sorter: (a, b) => a.expiryDate.localeCompare(b.expiryDate), defaultSortOrder: 'ascend' },
    { key: 'v', title: 'Verified by', dataIndex: 'verifiedBy', defaultHidden: true },
    { key: 's', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, render: (_, c) => <Dropdown trigger={['click']} menu={{ items: [{ key: 'r', label: 'Renew (+2 years)', onClick: async () => { await credentialService.update(c.id, { expiryDate: dayjs(c.expiryDate).add(2, 'year').format('YYYY-MM-DD'), status: 'Valid' }); message.success('Renewed'); reload(); } }, { key: 'v', label: 'Mark verified', onClick: async () => { await credentialService.update(c.id, { verifiedBy: 'Credentialing Office', status: 'Valid' }); reload(); } }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Dropdown> },
  ];
  return (
    <>
      <PageHeader title="Provider Credentials" subtitle="Licenses, board certifications, DEA registrations and insurance" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Credential</Button>} />
      <MetricGrid>
        <MetricCard label="Total credentials" value={data?.length ?? 0} icon={<Award size={20} />} loading={loading} />
        <MetricCard label="Expiring within 90 days" value={data?.filter((c) => c.status === 'Expiring Soon').length ?? 0} icon={<ShieldAlert size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Expired" value={data?.filter((c) => c.status === 'Expired').length ?? 0} icon={<AlertTriangle size={20} />} tone="error" loading={loading} />
        <MetricCard label="Pending verification" value={data?.filter((c) => c.status === 'Pending').length ?? 0} icon={<Clock size={20} />} tone="info" loading={loading} />
      </MetricGrid>
      <DataTable<Credential> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['providerName', 'name', 'number', 'issuer']} filters={[{ key: 'type', label: 'Type', options: ['Medical License', 'Board Certification', 'DEA Registration', 'BLS/ACLS', 'Malpractice Insurance'] }, { key: 'status', label: 'Status', options: ['Valid', 'Expiring Soon', 'Expired', 'Pending'] }]} exportable pageSize={15} />
      <Modal title="Add Credential" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={async (v) => { const p = providers.find((x) => x.id === v.providerId); await credentialService.create({ providerId: v.providerId, providerName: p?.fullName ?? '', type: v.type, name: v.name, issuer: v.issuer, number: v.number, issuedDate: dayjs().format('YYYY-MM-DD'), expiryDate: v.expiry.format('YYYY-MM-DD'), status: 'Pending' }); setOpen(false); form.resetFields(); reload(); }}>
          <Form.Item name="providerId" label="Provider" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={providers.map((p) => ({ value: p.id, label: p.fullName }))} /></Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}><Select options={['Medical License', 'Board Certification', 'DEA Registration', 'BLS/ACLS', 'Malpractice Insurance', 'Fellowship'].map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="issuer" label="Issuer" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="number" label="Number"><Input /></Form.Item>
          <Form.Item name="expiry" label="Expiry date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

