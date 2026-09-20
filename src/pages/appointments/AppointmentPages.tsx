import { useMemo, useState } from 'react';
import { Button, Card, Col, DatePicker, Dropdown, Form, Input, Modal, Row, Select, Steps, Switch, Tag, Timeline, message } from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarDays, CalendarPlus, CheckCircle2, Clock, MoreHorizontal, Plus, Search, UserCheck, Users, Video, XCircle, AlertTriangle, ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, MetricCard, MetricGrid, SectionCard, StatusTag, PrimaryCell, EmptyState, KeyValue, Avatar } from '@/components/common';
import { DataTable, type DataColumn } from '@/components/tables/DataTable';
import { BarsChart, DonutChart } from '@/components/charts';
import { AppointmentFormCard, AppointmentFormDrawer } from '@/components/forms/AppointmentForm';
import { useAppDispatch, useAppSelector } from '@/store';
import { appointmentSelectors, deleteAppointment, updateAppointment } from '@/store/slices/appointmentSlice';
import { patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { providerSelectors } from '@/store/slices/providerSlice';
import { appointmentTypeService, mockDb } from '@/services/api';
import { useAsyncData } from '@/hooks';
import type { Appointment, AppointmentStatus, AppointmentTypeDef } from '@/types/domain';
import { dayjs, formatDate, formatDateTime, formatTime } from '@/utils/format';

const TODAY = dayjs().format('YYYY-MM-DD');
const STATUSES: AppointmentStatus[] = ['Scheduled', 'Confirmed', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show', 'Rescheduled'];
const TYPES = mockDb.appointmentTypes.map((t) => t.name);
const LOCATIONS = mockDb.locations.map((l) => l.name);

function useAppointmentColumns(): DataColumn<Appointment>[] {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const setStatus = (a: Appointment, status: AppointmentStatus) => dispatch(updateAppointment({ id: a.id, patch: { status, checkedInAt: status === 'Checked In' ? new Date().toISOString() : a.checkedInAt } }));
  return [
    { key: 'when', title: 'Date & Time', hideable: false, render: (_, a) => <PrimaryCell title={`${formatDate(a.date)} · ${formatTime(a.startTime)}`} subtitle={`${a.durationMinutes} min · ${a.code}`} />, sorter: (a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`) },
    { key: 'patient', title: 'Patient', dataIndex: 'patientName', render: (v: string, a) => <PrimaryCell title={<a onClick={(e) => { e.stopPropagation(); dispatch(setCurrentPatient(a.patientId)); navigate(`/patients/${a.patientId}`); }}>{v}</a>} subtitle={a.patientMrn} avatar={v} /> },
    { key: 'provider', title: 'Provider', dataIndex: 'providerName', ellipsis: true },
    { key: 'type', title: 'Type', dataIndex: 'type', render: (v: string, a) => <span className="flex items-center gap-2">{a.isTelehealth && <Video size={13} className="muted" />}{v}</span> },
    { key: 'location', title: 'Location', dataIndex: 'locationName', ellipsis: true, render: (v: string, a) => `${v}${a.room ? ` · ${a.room}` : ''}` },
    { key: 'reason', title: 'Reason', dataIndex: 'reason', ellipsis: true, defaultHidden: true },
    { key: 'priority', title: 'Priority', dataIndex: 'priority', render: (v: string) => <StatusTag status={v} />, width: 100 },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} />, width: 120 },
    {
      key: 'a', title: '', width: 50, hideable: false, fixed: 'right',
      render: (_, a) => (
        <Dropdown trigger={['click']} menu={{ items: [
          { key: 'open', label: 'Open details', onClick: () => navigate(`/appointments/${a.id}`) },
          { key: 'confirm', label: 'Confirm', disabled: a.status !== 'Scheduled', onClick: () => setStatus(a, 'Confirmed') },
          { key: 'checkin', label: 'Check in', icon: <UserCheck size={14} />, disabled: !['Scheduled', 'Confirmed'].includes(a.status), onClick: () => setStatus(a, 'Checked In') },
          { key: 'start', label: 'Start visit', disabled: a.status !== 'Checked In', onClick: () => setStatus(a, 'In Progress') },
          { key: 'complete', label: 'Complete', disabled: a.status !== 'In Progress', onClick: () => setStatus(a, 'Completed') },
          { type: 'divider' },
          { key: 'noshow', label: 'Mark no-show', onClick: () => setStatus(a, 'No Show') },
          { key: 'cancel', label: 'Cancel appointment', danger: true, icon: <XCircle size={14} />, onClick: () => Modal.confirm({ title: `Cancel appointment for ${a.patientName}?`, content: 'The patient will be notified.', okText: 'Cancel appointment', okButtonProps: { danger: true }, onOk: () => setStatus(a, 'Cancelled') }) },
        ] }}>
          <Button type="text" size="small" icon={<MoreHorizontal size={16} />} onClick={(e) => e.stopPropagation()} aria-label="Row actions" />
        </Dropdown>
      ),
    },
  ];
}

// ------------------------------------------------------------------ Dashboard (35)
export function AppointmentDashboardPage() {
  const navigate = useNavigate();
  const appts = useAppSelector(appointmentSelectors.selectAll);
  const loading = useAppSelector((s) => s.appointments.status === 'loading');
  const columns = useAppointmentColumns();
  const today = useMemo(() => appts.filter((a) => a.date === TODAY), [appts]);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = dayjs().startOf('week').add(i, 'day'); const list = appts.filter((a) => a.date === d.format('YYYY-MM-DD')); return { day: d.format('ddd'), Booked: list.length, Telehealth: list.filter((a) => a.isTelehealth).length }; }), [appts]);
  const byStatus = STATUSES.map((s) => ({ name: s, value: today.filter((a) => a.status === s).length })).filter((s) => s.value > 0);
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Appointment Dashboard" subtitle={`${today.length} appointments today across ${new Set(today.map((a) => a.locationName)).size} locations`} actions={<><Button icon={<CalendarDays size={15} />} onClick={() => navigate('/appointments/calendar')}>Calendar</Button><Button type="primary" icon={<CalendarPlus size={15} />} onClick={() => setOpen(true)}>New Appointment</Button></>} />
      <MetricGrid>
        <MetricCard label="Today" value={today.length} icon={<CalendarDays size={20} />} loading={loading} />
        <MetricCard label="Checked in / waiting" value={today.filter((a) => a.status === 'Checked In').length} icon={<Users size={20} />} tone="info" loading={loading} onClick={() => navigate('/appointments/queue')} />
        <MetricCard label="In progress" value={today.filter((a) => a.status === 'In Progress').length} icon={<Clock size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Completed" value={today.filter((a) => a.status === 'Completed').length} icon={<CheckCircle2 size={20} />} tone="success" loading={loading} />
        <MetricCard label="Cancelled / no-show" value={today.filter((a) => ['Cancelled', 'No Show'].includes(a.status)).length} icon={<XCircle size={20} />} tone="error" loading={loading} />
      </MetricGrid>
      <div className="card-grid">
        <div className="col-8"><SectionCard title="This week"><BarsChart data={week} xKey="day" series={[{ key: 'Booked', label: 'Booked' }, { key: 'Telehealth', label: 'Telehealth' }]} height={240} /></SectionCard></div>
        <div className="col-4"><SectionCard title="Today by status">{byStatus.length ? <DonutChart data={byStatus} height={190} /> : <EmptyState title="No appointments today" />}</SectionCard></div>
      </div>
      <DataTable<Appointment> title="Today's appointments" rowKey="id" columns={columns} data={today} loading={loading} searchKeys={['patientName', 'providerName', 'reason', 'code']} filters={[{ key: 'status', label: 'Status', options: STATUSES }, { key: 'providerName', label: 'Provider', options: [...new Set(appts.map((a) => a.providerName))] }]} onRowClick={(a) => navigate(`/appointments/${a.id}`)} emptyTitle="No appointments today" emptyAction={<Button type="primary" onClick={() => setOpen(true)}>Book one</Button>} />
      <AppointmentFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} />
    </>
  );
}

// ------------------------------------------------------------------ Search (36)
export function AppointmentSearchPage() {
  const navigate = useNavigate();
  const appts = useAppSelector(appointmentSelectors.selectAll);
  const providers = useAppSelector(providerSelectors.selectAll);
  const columns = useAppointmentColumns();
  const [form] = Form.useForm();
  const [criteria, setCriteria] = useState<Record<string, unknown>>({});
  const results = useMemo(() => {
    const q = String(criteria.q ?? '').trim().toLowerCase();
    const range = criteria.range as [dayjs.Dayjs, dayjs.Dayjs] | undefined;
    return appts.filter((a) => (!q || a.patientName.toLowerCase().includes(q) || a.code.toLowerCase().includes(q) || a.patientMrn.toLowerCase().includes(q)) && (!criteria.provider || a.providerId === criteria.provider) && (!criteria.status || a.status === criteria.status) && (!criteria.type || a.type === criteria.type) && (!criteria.location || a.locationName === criteria.location) && (!range || (a.date >= range[0].format('YYYY-MM-DD') && a.date <= range[1].format('YYYY-MM-DD'))));
  }, [appts, criteria]);
  return (
    <>
      <PageHeader title="Appointment Search" subtitle="Find appointments by patient, code, provider, date range or status" actions={<Button type="primary" icon={<CalendarPlus size={15} />} onClick={() => navigate('/appointments/create')}>New Appointment</Button>} />
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" onValuesChange={(_, all) => setCriteria(all)}>
          <Row gutter={16}>
            <Col xs={24} md={8}><Form.Item name="q" label="Patient, MRN or appointment code"><Input allowClear prefix={<Search size={15} className="muted" />} placeholder="e.g. John Smith or APT-2026" /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item name="range" label="Date range"><DatePicker.RangePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12} md={4}><Form.Item name="provider" label="Provider"><Select allowClear showSearch optionFilterProp="label" options={providers.map((p) => ({ value: p.id, label: p.fullName }))} /></Form.Item></Col>
            <Col xs={12} md={4}><Form.Item name="status" label="Status"><Select allowClear options={STATUSES.map((s) => ({ value: s, label: s }))} /></Form.Item></Col>
            <Col xs={12} md={4}><Form.Item name="type" label="Type"><Select allowClear options={TYPES.map((s) => ({ value: s, label: s }))} /></Form.Item></Col>
            <Col xs={12} md={4}><Form.Item name="location" label="Location"><Select allowClear options={LOCATIONS.map((s) => ({ value: s, label: s }))} /></Form.Item></Col>
          </Row>
          <Button onClick={() => { form.resetFields(); setCriteria({}); }}>Clear filters</Button>
          <span className="muted" style={{ marginLeft: 12, fontSize: 13 }}>{results.length} appointments</span>
        </Form>
      </Card>
      <DataTable<Appointment> rowKey="id" columns={columns} data={results} onRowClick={(a) => navigate(`/appointments/${a.id}`)} exportable pageSize={15} />
    </>
  );
}

// ------------------------------------------------------------------ Create (38)
export function CreateAppointmentPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const patients = useAppSelector(patientSelectors.selectAll);
  const currentPatientId = useAppSelector((s) => s.patients.currentPatientId);
  const patientId = params.get('patient') ?? currentPatientId;
  const patient = patients.find((p) => p.id === patientId);
  const appts = useAppSelector(appointmentSelectors.selectAll);
  const upcoming = appts.filter((a) => a.date >= TODAY && !['Cancelled', 'Completed'].includes(a.status)).slice(0, 5);
  return (
    <>
      <PageHeader title="Create Appointment" subtitle={patient ? `Booking for ${patient.fullName} (${patient.mrn})` : 'Book a visit for any patient. Say “create an appointment for Ahmed tomorrow at 3 PM”.'} />
      <Row gutter={20}>
        <Col xs={24} lg={16}><AppointmentFormCard initial={{ patientName: patient?.fullName }} onSaved={(a) => navigate(`/appointments/${a.id}`)} /></Col>
        <Col xs={24} lg={8}>
          <SectionCard title="Booking guidance">
            <Steps direction="vertical" size="small" current={1} items={[{ title: 'Select patient & provider' }, { title: 'Pick date, time and visit type' }, { title: 'Confirm location and reason' }, { title: 'Review and book' }]} />
          </SectionCard>
          <SectionCard title="Next available slots">
            {['09:00', '09:30', '11:15', '14:00', '15:45'].map((t, i) => <div key={t} className="list-row"><Clock size={14} className="muted" /><div className="list-row-main"><div className="list-row-title">{dayjs().add(i < 2 ? 1 : 2, 'day').format('ddd, MMM D')} · {formatTime(t)}</div><div className="list-row-sub">{mockDb.providers[i % 4].fullName}</div></div><Tag color="green" style={{ margin: 0 }}>Open</Tag></div>)}
          </SectionCard>
          <SectionCard title="Upcoming">{upcoming.map((a) => <div key={a.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/appointments/${a.id}`)}><div className="list-row-main"><div className="list-row-title">{a.patientName}</div><div className="list-row-sub">{formatDate(a.date)} · {formatTime(a.startTime)}</div></div><StatusTag status={a.status} /></div>)}</SectionCard>
        </Col>
      </Row>
    </>
  );
}

// ------------------------------------------------------------------ Details (39)
export function AppointmentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const appt = useAppSelector((s) => (id ? appointmentSelectors.selectById(s, id) : undefined));
  const loading = useAppSelector((s) => s.appointments.status !== 'succeeded');
  const [editOpen, setEditOpen] = useState(false);
  const [noteForm] = Form.useForm();
  if (!appt) return loading ? <Card loading /> : <EmptyState title="Appointment not found" action={<Button onClick={() => navigate('/appointments')}>Back</Button>} />;
  const flow: AppointmentStatus[] = ['Scheduled', 'Confirmed', 'Checked In', 'In Progress', 'Completed'];
  const stepIndex = flow.indexOf(appt.status);
  const setStatus = (status: AppointmentStatus) => dispatch(updateAppointment({ id: appt.id, patch: { status, checkedInAt: status === 'Checked In' ? new Date().toISOString() : appt.checkedInAt } }));
  const patientAppts = mockDb.appointments.filter((a) => a.patientId === appt.patientId && a.id !== appt.id).slice(-5).reverse();
  return (
    <>
      <PageHeader
        title={`Appointment ${appt.code}`}
        subtitle={`${appt.patientName} with ${appt.providerName} — ${formatDate(appt.date)} at ${formatTime(appt.startTime)}`}
        breadcrumbs={[{ title: <a onClick={() => navigate('/dashboard')}>Home</a> }, { title: <a onClick={() => navigate('/appointments')}>Appointments</a> }, { title: appt.code }]}
        actions={
          <>
            <Button icon={<Pencil size={15} />} onClick={() => setEditOpen(true)}>Reschedule</Button>
            {stepIndex >= 0 && stepIndex < flow.length - 1 && <Button type="primary" icon={<ArrowRight size={15} />} onClick={() => setStatus(flow[stepIndex + 1])}>{flow[stepIndex + 1] === 'Checked In' ? 'Check In' : flow[stepIndex + 1] === 'In Progress' ? 'Start Visit' : flow[stepIndex + 1] === 'Completed' ? 'Complete Visit' : 'Confirm'}</Button>}
            <Dropdown menu={{ items: [{ key: 'ns', label: 'Mark no-show', onClick: () => setStatus('No Show') }, { key: 'c', label: 'Cancel appointment', danger: true, onClick: () => Modal.confirm({ title: 'Cancel this appointment?', okButtonProps: { danger: true }, onOk: () => setStatus('Cancelled') }) }, { key: 'd', label: 'Delete', danger: true, icon: <Trash2 size={14} />, onClick: () => Modal.confirm({ title: 'Delete permanently?', okButtonProps: { danger: true }, onOk: async () => { await dispatch(deleteAppointment(appt.id)); navigate('/appointments'); } }) }] }}><Button icon={<MoreHorizontal size={16} />} /></Dropdown>
          </>
        }
      />
      {['Cancelled', 'No Show'].includes(appt.status) ? <Card style={{ marginBottom: 16 }}><span className="flex items-center gap-2" style={{ color: '#d64545' }}><AlertTriangle size={16} /> This appointment is marked <StatusTag status={appt.status} /></span></Card> : (
        <Card style={{ marginBottom: 16 }}><Steps size="small" current={stepIndex} items={flow.map((s) => ({ title: s }))} /></Card>
      )}
      <div className="card-grid">
        <div className="col-8">
          <SectionCard title="Details">
            <KeyValue columns={3} items={[{ label: 'Patient', value: <a onClick={() => { dispatch(setCurrentPatient(appt.patientId)); navigate(`/patients/${appt.patientId}`); }}>{appt.patientName}</a> }, { label: 'MRN', value: appt.patientMrn }, { label: 'Provider', value: appt.providerName }, { label: 'Date', value: formatDate(appt.date) }, { label: 'Time', value: `${formatTime(appt.startTime)} – ${formatTime(appt.endTime)} (${appt.durationMinutes} min)` }, { label: 'Type', value: appt.type }, { label: 'Location', value: appt.locationName }, { label: 'Room', value: appt.room ?? (appt.isTelehealth ? 'Virtual' : '—') }, { label: 'Priority', value: <StatusTag status={appt.priority} /> }, { label: 'Reason', value: appt.reason }, { label: 'Reminder sent', value: appt.reminderSent ? 'Yes' : 'No' }, { label: 'Checked in at', value: appt.checkedInAt ? formatDateTime(appt.checkedInAt) : '—' }]} />
            {appt.notes && <div style={{ marginTop: 16, padding: 12, background: 'var(--color-surface-muted)', borderRadius: 8, fontSize: 13 }}><strong>Notes:</strong> {appt.notes}</div>}
          </SectionCard>
          <SectionCard title="Visit notes">
            <Form form={noteForm} layout="vertical" onFinish={(v) => { dispatch(updateAppointment({ id: appt.id, patch: { notes: v.notes } })); message.success('Notes updated'); }} initialValues={{ notes: appt.notes }}>
              <Form.Item name="notes"><Input.TextArea rows={3} placeholder="Front-desk or scheduling notes" /></Form.Item>
              <Button htmlType="submit">Save Notes</Button>
              <Button type="link" onClick={() => navigate(`/clinical/consultation?patient=${appt.patientId}`)}>Start clinical consultation →</Button>
            </Form>
          </SectionCard>
        </div>
        <div className="col-4">
          <SectionCard title="Patient">
            <div className="flex items-center gap-3"><Avatar name={appt.patientName} size={44} /><div><div style={{ fontWeight: 600 }}>{appt.patientName}</div><div className="muted" style={{ fontSize: 12 }}>{appt.patientMrn}</div></div></div>
            <Button block style={{ marginTop: 12 }} onClick={() => { dispatch(setCurrentPatient(appt.patientId)); navigate(`/patients/${appt.patientId}`); }}>Open patient profile</Button>
          </SectionCard>
          <SectionCard title="Timeline">
            <Timeline items={[{ color: 'blue', children: <div style={{ fontSize: 13 }}>Created<div className="muted" style={{ fontSize: 11 }}>{formatDateTime(appt.createdAt)}</div></div> }, ...(appt.reminderSent ? [{ color: 'green', children: <div style={{ fontSize: 13 }}>Reminder sent</div> }] : []), ...(appt.checkedInAt ? [{ color: 'green', children: <div style={{ fontSize: 13 }}>Checked in<div className="muted" style={{ fontSize: 11 }}>{formatDateTime(appt.checkedInAt)}</div></div> }] : []), { color: 'gray', children: <div style={{ fontSize: 13 }}>Current status: {appt.status}</div> }]} />
          </SectionCard>
          <SectionCard title="Other appointments">{patientAppts.map((a) => <div key={a.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/appointments/${a.id}`)}><div className="list-row-main"><div className="list-row-title">{formatDate(a.date)}</div><div className="list-row-sub">{a.type} · {a.providerName}</div></div><StatusTag status={a.status} /></div>)}{!patientAppts.length && <span className="muted">None</span>}</SectionCard>
        </div>
      </div>
      <AppointmentFormDrawer open={editOpen} onOpen={() => setEditOpen(true)} onClose={() => setEditOpen(false)} onSaved={() => { setStatus('Rescheduled'); }} />
    </>
  );
}

// ------------------------------------------------------------------ Queue (40)
export function AppointmentQueuePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const appts = useAppSelector(appointmentSelectors.selectAll);
  const [location, setLocation] = useState<string | undefined>();
  const today = appts.filter((a) => a.date === TODAY && (!location || a.locationName === location));
  const lanes: Array<{ title: string; status: AppointmentStatus; next?: AppointmentStatus; nextLabel?: string; tone: string }> = [
    { title: 'Scheduled', status: 'Scheduled', next: 'Confirmed', nextLabel: 'Confirm', tone: '#2a78d6' },
    { title: 'Confirmed', status: 'Confirmed', next: 'Checked In', nextLabel: 'Check in', tone: '#13839f' },
    { title: 'Waiting', status: 'Checked In', next: 'In Progress', nextLabel: 'Start visit', tone: '#d98800' },
    { title: 'In room', status: 'In Progress', next: 'Completed', nextLabel: 'Complete', tone: '#4a3aa7' },
    { title: 'Completed', status: 'Completed', tone: '#0f9d58' },
  ];
  const waiting = today.filter((a) => a.status === 'Checked In');
  const avgWait = waiting.length ? Math.round(waiting.reduce((s, a) => s + dayjs().diff(dayjs(a.checkedInAt ?? new Date()), 'minute'), 0) / waiting.length) : 0;
  return (
    <>
      <PageHeader title="Appointment Queue" subtitle="Live patient flow for today — drag-free kanban with one-click status advance" actions={<Select allowClear placeholder="All locations" style={{ width: 240 }} value={location} onChange={setLocation} options={LOCATIONS.map((l) => ({ value: l, label: l }))} />} />
      <MetricGrid>
        <MetricCard label="Waiting" value={waiting.length} icon={<Users size={20} />} tone="warning" />
        <MetricCard label="Avg. wait" value={`${Math.max(0, avgWait)} min`} icon={<Clock size={20} />} tone={avgWait > 15 ? 'error' : 'success'} />
        <MetricCard label="In room" value={today.filter((a) => a.status === 'In Progress').length} icon={<UserCheck size={20} />} tone="info" />
        <MetricCard label="Remaining today" value={today.filter((a) => ['Scheduled', 'Confirmed'].includes(a.status)).length} icon={<CalendarDays size={20} />} />
      </MetricGrid>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
        {lanes.map((lane) => {
          const items = today.filter((a) => a.status === lane.status).sort((a, b) => a.startTime.localeCompare(b.startTime));
          return (
            <Card key={lane.status} size="small" title={<span className="flex items-center gap-2"><span className="status-dot" style={{ background: lane.tone }} />{lane.title} <Tag style={{ marginLeft: 'auto' }}>{items.length}</Tag></span>} styles={{ body: { padding: 8, background: 'var(--color-surface-muted)', minHeight: 300 } }}>
              {items.map((a) => (
                <Card key={a.id} size="small" style={{ marginBottom: 8, borderLeft: `3px solid ${lane.tone}` }} styles={{ body: { padding: 10 } }}>
                  <div className="flex justify-between" style={{ fontSize: 13 }}><strong style={{ cursor: 'pointer' }} onClick={() => navigate(`/appointments/${a.id}`)}>{a.patientName}</strong><span className="muted">{formatTime(a.startTime)}</span></div>
                  <div className="muted" style={{ fontSize: 12 }}>{a.type} · {a.providerName.replace('Dr. ', '')}</div>
                  {a.status === 'Checked In' && a.checkedInAt && <div style={{ fontSize: 11, color: dayjs().diff(dayjs(a.checkedInAt), 'minute') > 15 ? '#d64545' : '#8a97a4', marginTop: 2 }}>Waiting {Math.max(0, dayjs().diff(dayjs(a.checkedInAt), 'minute'))} min{a.room ? ` · ${a.room}` : ''}</div>}
                  {lane.next && <Button size="small" type="primary" ghost block style={{ marginTop: 8 }} onClick={() => dispatch(updateAppointment({ id: a.id, patch: { status: lane.next!, checkedInAt: lane.next === 'Checked In' ? new Date().toISOString() : a.checkedInAt } }))}>{lane.nextLabel}</Button>}
                </Card>
              ))}
              {!items.length && <div className="muted" style={{ textAlign: 'center', padding: 20, fontSize: 12 }}>Empty</div>}
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ History (41)
export function AppointmentHistoryPage() {
  const navigate = useNavigate();
  const appts = useAppSelector(appointmentSelectors.selectAll);
  const columns = useAppointmentColumns();
  const past = useMemo(() => appts.filter((a) => a.date < TODAY).sort((a, b) => b.date.localeCompare(a.date)), [appts]);
  const monthly = useMemo(() => Array.from({ length: 6 }, (_, i) => { const m = dayjs().subtract(5 - i, 'month'); const list = past.filter((a) => dayjs(a.date).isSame(m, 'month')); return { month: m.format('MMM'), Completed: list.filter((a) => a.status === 'Completed').length, 'No Show': list.filter((a) => a.status === 'No Show').length, Cancelled: list.filter((a) => a.status === 'Cancelled').length }; }), [past]);
  return (
    <>
      <PageHeader title="Appointment History" subtitle={`${past.length} past appointments · ${Math.round((past.filter((a) => a.status === 'No Show').length / Math.max(1, past.length)) * 100)}% no-show rate`} />
      <div className="card-grid"><div className="col-12"><SectionCard title="Outcomes — last 6 months"><BarsChart data={monthly} xKey="month" stacked series={[{ key: 'Completed', label: 'Completed' }, { key: 'No Show', label: 'No show' }, { key: 'Cancelled', label: 'Cancelled' }]} height={220} /></SectionCard></div></div>
      <DataTable<Appointment> rowKey="id" columns={columns} data={past} searchKeys={['patientName', 'providerName', 'code', 'reason']} filters={[{ key: 'status', label: 'Outcome', options: ['Completed', 'Cancelled', 'No Show'] }, { key: 'type', label: 'Type', options: TYPES }, { key: 'locationName', label: 'Location', options: LOCATIONS }]} onRowClick={(a) => navigate(`/appointments/${a.id}`)} exportable pageSize={15} />
    </>
  );
}

// ------------------------------------------------------------------ Types (42)
export function AppointmentTypesPage() {
  const { data, loading, reload } = useAsyncData(() => appointmentTypeService.all());
  const [editing, setEditing] = useState<AppointmentTypeDef | null | 'new'>(null);
  const [form] = Form.useForm();
  const columns: DataColumn<AppointmentTypeDef>[] = [
    { key: 'n', title: 'Type', dataIndex: 'name', hideable: false, render: (v: string, t) => <span className="flex items-center gap-2"><span className="status-dot" style={{ background: t.color, width: 12, height: 12 }} /><strong>{v}</strong><Tag style={{ marginLeft: 4 }}>{t.code}</Tag></span> },
    { key: 'd', title: 'Description', dataIndex: 'description', ellipsis: true },
    { key: 'dur', title: 'Duration', dataIndex: 'durationMinutes', render: (v: number) => `${v} min`, align: 'right' },
    { key: 'buf', title: 'Buffer', dataIndex: 'bufferMinutes', render: (v: number) => `${v} min`, align: 'right' },
    { key: 'dept', title: 'Department', dataIndex: 'department' },
    { key: 'ref', title: 'Referral', dataIndex: 'requiresReferral', render: (v: boolean) => (v ? <Tag color="orange">Required</Tag> : '—') },
    { key: 'online', title: 'Online booking', dataIndex: 'allowOnlineBooking', render: (v: boolean, t) => <Switch size="small" checked={v} onChange={async (c) => { await appointmentTypeService.update(t.id, { allowOnlineBooking: c }); reload(); }} /> },
    { key: 'active', title: 'Active', dataIndex: 'isActive', render: (v: boolean, t) => <Switch size="small" checked={v} onChange={async (c) => { await appointmentTypeService.update(t.id, { isActive: c }); reload(); }} /> },
    { key: 'a', title: '', width: 60, render: (_, t) => <Button type="text" size="small" icon={<Pencil size={14} />} onClick={() => { setEditing(t); form.setFieldsValue(t); }} /> },
  ];
  return (
    <>
      <PageHeader title="Appointment Types" subtitle="Visit types, default durations, buffers and booking rules" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => { setEditing('new'); form.resetFields(); }}>New Type</Button>} />
      <DataTable<AppointmentTypeDef> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['name', 'code', 'department']} filters={[{ key: 'department', label: 'Department', options: ['Primary Care', 'Specialty', 'Diagnostics', 'All'] }]} pageSize={12} />
      <Modal title={editing === 'new' ? 'New Appointment Type' : 'Edit Appointment Type'} open={!!editing} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Save" width={560}>
        <Form form={form} layout="vertical" onFinish={async (v) => { if (editing === 'new') await appointmentTypeService.create({ ...v, isActive: true, color: v.color ?? '#0f6e8c' }); else if (editing) await appointmentTypeService.update(editing.id, v); setEditing(null); message.success('Saved'); reload(); }}>
          <div className="form-grid cols-2">
            <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input maxLength={4} /></Form.Item>
            <Form.Item name="durationMinutes" label="Duration (min)" rules={[{ required: true }]}><Input type="number" /></Form.Item>
            <Form.Item name="bufferMinutes" label="Buffer (min)" initialValue={0}><Input type="number" /></Form.Item>
            <Form.Item name="department" label="Department"><Select options={['Primary Care', 'Specialty', 'Diagnostics', 'All'].map((d) => ({ value: d, label: d }))} /></Form.Item>
            <Form.Item name="color" label="Color"><Input type="color" /></Form.Item>
            <Form.Item name="requiresReferral" label="Requires referral" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="allowOnlineBooking" label="Allow online booking" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="description" label="Description" className="span-2"><Input.TextArea rows={2} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Status management (43)
export function AppointmentStatusPage() {
  const dispatch = useAppDispatch();
  const appts = useAppSelector(appointmentSelectors.selectAll);
  const columns = useAppointmentColumns();
  const [selected, setSelected] = useState<Appointment[]>([]);
  const [bulkStatus, setBulkStatus] = useState<AppointmentStatus>('Confirmed');
  const upcoming = useMemo(() => appts.filter((a) => a.date >= TODAY).sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)), [appts]);
  const counts = STATUSES.map((s) => ({ status: s, count: upcoming.filter((a) => a.status === s).length }));
  const rules = [
    { from: 'Scheduled', to: 'Confirmed', trigger: 'Patient confirms via SMS/portal or staff confirmation' },
    { from: 'Confirmed', to: 'Checked In', trigger: 'Front desk check-in or kiosk' },
    { from: 'Checked In', to: 'In Progress', trigger: 'Provider starts encounter' },
    { from: 'In Progress', to: 'Completed', trigger: 'Encounter signed' },
    { from: 'Scheduled / Confirmed', to: 'No Show', trigger: 'Auto after 30 min past start time' },
    { from: 'Any', to: 'Cancelled', trigger: 'Staff or patient cancellation (reason required)' },
  ];
  return (
    <>
      <PageHeader title="Appointment Status Management" subtitle="Bulk status updates, workflow rules and status distribution" />
      <div className="card-grid">
        <div className="col-8">
          <SectionCard title="Upcoming appointments by status">
            <BarsChart data={counts} xKey="status" series={[{ key: 'count', label: 'Appointments' }]} height={220} />
          </SectionCard>
        </div>
        <div className="col-4">
          <SectionCard title="Workflow rules">
            {rules.map((r) => <div key={r.to + r.from} style={{ fontSize: 12.5, marginBottom: 8 }}><StatusTag status={r.from.split(' / ')[0]} /> → <StatusTag status={r.to} /><div className="muted" style={{ marginTop: 2 }}>{r.trigger}</div></div>)}
          </SectionCard>
        </div>
      </div>
      <DataTable<Appointment>
        rowKey="id" columns={columns} data={upcoming} searchKeys={['patientName', 'providerName', 'code']} filters={[{ key: 'status', label: 'Status', options: STATUSES }]} selectable onSelectionChange={(_, rows) => setSelected(rows)} pageSize={15}
        toolbarExtra={<><Select value={bulkStatus} onChange={setBulkStatus} style={{ width: 150 }} options={STATUSES.map((s) => ({ value: s, label: s }))} /><Button type="primary" disabled={!selected.length} onClick={() => Modal.confirm({ title: `Set ${selected.length} appointment(s) to ${bulkStatus}?`, onOk: () => { selected.forEach((a) => dispatch(updateAppointment({ id: a.id, patch: { status: bulkStatus } }))); message.success('Updated'); } })}>Apply to {selected.length || ''} selected</Button></>}
      />
    </>
  );
}

