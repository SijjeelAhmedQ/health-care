import { useMemo, useState } from 'react';
import { Button, Card, Dropdown, Form, Modal, Select, Switch, Table, Tag, TimePicker, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CalendarDays, CheckCircle2, Clock, MoreHorizontal, Plus, Users, AlertTriangle, XCircle, Sun, Moon, Sunset } from 'lucide-react';
import { PageHeader, MetricCard, MetricGrid, SectionCard, StatusTag, PrimaryCell, Avatar } from '@/components/common';
import { DataTable, type DataColumn } from '@/components/tables/DataTable';
import { BarsChart, DonutChart } from '@/components/charts';
import { LeaveFormDrawer, RosterFormCard, ShiftFormDrawer } from '@/components/forms/RosterForms';
import { useAppSelector } from '@/store';
import { providerSelectors } from '@/store/slices/providerSlice';
import { useAsyncData } from '@/hooks';
import { availabilityService, leaveService, rosterService, shiftService } from '@/services/api';
import type { AvailabilitySlot, LeaveRequest, Roster, Shift } from '@/types/domain';
import { dayjs, formatDate, formatDateTime, formatTime } from '@/utils/format';
import { DEPARTMENT_OPTIONS, LOCATION_OPTIONS } from '@/registry/fieldRegistry';

const TODAY = dayjs().format('YYYY-MM-DD');
const shiftColor: Record<Shift['type'], string> = { Morning: '#eda100', Afternoon: '#2a78d6', Evening: '#eb6834', Night: '#4a3aa7', 'On Call': '#e87ba4' };
const shiftIcon = (t: Shift['type']) => (t === 'Morning' ? <Sun size={13} /> : t === 'Night' ? <Moon size={13} /> : <Sunset size={13} />);

// ------------------------------------------------------------------ Dashboard (51)
export function RosterDashboardPage() {
  const navigate = useNavigate();
  const { data: shifts, loading } = useAsyncData(() => shiftService.all());
  const { data: rosters } = useAsyncData(() => rosterService.all());
  const { data: leaves } = useAsyncData(() => leaveService.all());
  const today = useMemo(() => (shifts ?? []).filter((s) => s.date === TODAY), [shifts]);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = dayjs().startOf('week').add(i, 'day'); const list = (shifts ?? []).filter((s) => s.date === d.format('YYYY-MM-DD')); return { day: d.format('ddd'), Morning: list.filter((s) => s.type === 'Morning').length, Afternoon: list.filter((s) => s.type === 'Afternoon').length, Evening: list.filter((s) => s.type === 'Evening').length, Night: list.filter((s) => s.type === 'Night' || s.type === 'On Call').length }; }), [shifts]);
  const byDept = useMemo(() => Object.entries(today.reduce<Record<string, number>>((a, s) => ({ ...a, [s.department]: (a[s.department] ?? 0) + 1 }), {})).map(([name, value]) => ({ name, value })).slice(0, 5), [today]);
  const pendingLeave = (leaves ?? []).filter((l) => l.status === 'Pending');
  return (
    <>
      <PageHeader title="Roster Dashboard" subtitle="Staffing coverage, published rosters and pending requests" actions={<><Button icon={<CalendarDays size={15} />} onClick={() => navigate('/roster/calendar')}>Calendar</Button><Button type="primary" icon={<Plus size={15} />} onClick={() => navigate('/roster/create')}>Create Roster</Button></>} />
      <MetricGrid>
        <MetricCard label="On shift today" value={today.length} icon={<Users size={20} />} loading={loading} />
        <MetricCard label="Published rosters" value={(rosters ?? []).filter((r) => r.status === 'Published').length} icon={<CheckCircle2 size={20} />} tone="success" />
        <MetricCard label="Draft rosters" value={(rosters ?? []).filter((r) => r.status === 'Draft').length} icon={<CalendarClock size={20} />} tone="info" onClick={() => navigate('/roster/create')} />
        <MetricCard label="Pending leave requests" value={pendingLeave.length} icon={<AlertTriangle size={20} />} tone="warning" onClick={() => navigate('/roster/leave')} />
        <MetricCard label="Coverage gaps (7 days)" value={2} icon={<XCircle size={20} />} tone="error" />
      </MetricGrid>
      <div className="card-grid">
        <div className="col-8"><SectionCard title="Shifts this week by type"><BarsChart data={week} xKey="day" stacked series={[{ key: 'Morning', label: 'Morning' }, { key: 'Afternoon', label: 'Afternoon' }, { key: 'Evening', label: 'Evening' }, { key: 'Night', label: 'Night / on call' }]} height={240} /></SectionCard></div>
        <div className="col-4"><SectionCard title="Today by department">{byDept.length ? <DonutChart data={byDept} height={190} /> : <span className="muted">No shifts today</span>}</SectionCard></div>
        <div className="col-6">
          <SectionCard title="Rosters" extra={<Button type="link" size="small" onClick={() => navigate('/roster/create')}>New</Button>}>
            <Table size="small" pagination={false} rowKey="id" dataSource={(rosters ?? []).slice(0, 6)} columns={[{ title: 'Roster', dataIndex: 'name', ellipsis: true }, { title: 'Period', render: (_, r) => `${formatDate(r.startDate, 'MMM D')} – ${formatDate(r.endDate, 'MMM D')}` }, { title: 'Shifts', dataIndex: 'shiftCount', align: 'right' }, { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> }]} />
          </SectionCard>
        </div>
        <div className="col-6">
          <SectionCard title="Pending leave" extra={<Button type="link" size="small" onClick={() => navigate('/roster/leave')}>Manage</Button>}>
            {pendingLeave.slice(0, 5).map((l) => <div key={l.id} className="list-row"><Avatar name={l.providerName} size={30} /><div className="list-row-main"><div className="list-row-title">{l.providerName}</div><div className="list-row-sub">{l.type} · {formatDate(l.startDate, 'MMM D')} – {formatDate(l.endDate, 'MMM D')} ({l.days}d)</div></div><StatusTag status={l.status} /></div>)}
            {!pendingLeave.length && <span className="muted">No pending requests</span>}
          </SectionCard>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Create roster (52)
export function CreateRosterPage() {
  const navigate = useNavigate();
  const { data: rosters, reload } = useAsyncData(() => rosterService.all());
  const columns: DataColumn<Roster>[] = [
    { key: 'n', title: 'Roster', dataIndex: 'name', hideable: false },
    { key: 'd', title: 'Department', dataIndex: 'department' },
    { key: 'l', title: 'Location', dataIndex: 'locationName', ellipsis: true },
    { key: 'p', title: 'Period', render: (_, r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}` },
    { key: 's', title: 'Shifts / Staff', render: (_, r) => `${r.shiftCount} / ${r.providerCount}`, align: 'right' },
    { key: 'st', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, render: (_, r) => <Dropdown trigger={['click']} menu={{ items: [{ key: 'pub', label: 'Publish', disabled: r.status !== 'Draft', onClick: async () => { await rosterService.update(r.id, { status: 'Published' }); message.success('Roster published'); reload(); } }, { key: 'arch', label: 'Archive', onClick: async () => { await rosterService.update(r.id, { status: 'Archived' }); reload(); } }, { key: 'cal', label: 'Open in calendar', onClick: () => navigate('/roster/calendar') }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Dropdown> },
  ];
  return (
    <>
      <PageHeader title="Create Roster" subtitle="Define a roster period, then add shifts from Shift Management or the calendar" />
      <div className="card-grid">
        <div className="col-7 col-8"><RosterFormCard onSaved={() => reload()} /></div>
        <div className="col-4"><SectionCard title="How rostering works"><ol style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: '#5b6b7a', lineHeight: 1.8 }}><li>Create a draft roster for a department and period.</li><li>Add shifts (or copy last week) in Shift Management.</li><li>Check leave conflicts and coverage gaps.</li><li>Publish — staff are notified and the calendar updates.</li></ol></SectionCard></div>
      </div>
      <DataTable<Roster> title="Existing rosters" rowKey="id" columns={columns} data={rosters} searchKeys={['name', 'department']} filters={[{ key: 'status', label: 'Status', options: ['Draft', 'Published', 'Archived'] }]} pageSize={8} />
    </>
  );
}

// ------------------------------------------------------------------ Roster calendar (53)
export function RosterCalendarPage() {
  const { data: shifts, reload } = useAsyncData(() => shiftService.all());
  const [weekStart, setWeekStart] = useState(dayjs().startOf('week'));
  const [dept, setDept] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [initialDate, setInitialDate] = useState<string | undefined>();
  const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));
  const list = (shifts ?? []).filter((s) => !dept || s.department === dept);
  const staff = [...new Set(list.map((s) => s.providerName))].sort();
  return (
    <>
      <PageHeader title="Roster Calendar" subtitle={`Week of ${weekStart.format('MMM D, YYYY')} · ${list.filter((s) => days.some((d) => d.format('YYYY-MM-DD') === s.date)).length} shifts`} actions={<><Button onClick={() => setWeekStart(weekStart.subtract(1, 'week'))}>‹</Button><Button onClick={() => setWeekStart(dayjs().startOf('week'))}>This week</Button><Button onClick={() => setWeekStart(weekStart.add(1, 'week'))}>›</Button><Select allowClear placeholder="Department" style={{ width: 190 }} value={dept} onChange={setDept} options={DEPARTMENT_OPTIONS.map((d) => ({ value: d, label: d }))} /><Button type="primary" icon={<Plus size={15} />} onClick={() => { setInitialDate(undefined); setOpen(true); }}>Add Shift</Button></>} />
      <Card styles={{ body: { padding: 0, overflowX: 'auto' } }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead><tr><th style={{ textAlign: 'left', padding: 10, fontSize: 12, color: '#5b6b7a', background: 'var(--color-surface-subtle)', minWidth: 180 }}>Staff</th>{days.map((d) => <th key={d.toString()} style={{ padding: 10, fontSize: 12, color: d.isSame(dayjs(), 'day') ? '#0f6e8c' : '#5b6b7a', background: 'var(--color-surface-subtle)', borderLeft: '1px solid var(--color-border)' }}>{d.format('ddd D')}</th>)}</tr></thead>
          <tbody>
            {staff.map((name) => (
              <tr key={name} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: 8 }}><PrimaryCell title={name} subtitle={list.find((s) => s.providerName === name)?.department} avatar={name} /></td>
                {days.map((d) => {
                  const key = d.format('YYYY-MM-DD');
                  const cell = list.filter((s) => s.providerName === name && s.date === key);
                  return (
                    <td key={key} style={{ padding: 4, borderLeft: '1px solid var(--color-border)', verticalAlign: 'top', minWidth: 110, cursor: 'pointer' }} onDoubleClick={() => { setInitialDate(key); setOpen(true); }}>
                      {cell.map((s) => <div key={s.id} className="appt-chip" style={{ borderLeftColor: shiftColor[s.type], marginBottom: 4, opacity: s.status === 'Cancelled' ? 0.5 : 1 }}><b className="flex items-center gap-2">{shiftIcon(s.type)} {s.type}</b><span className="muted">{formatTime(s.startTime)}–{formatTime(s.endTime)}</span></div>)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="flex gap-3 wrap" style={{ marginTop: 12, fontSize: 12 }}>{Object.entries(shiftColor).map(([t, c]) => <span key={t} className="flex items-center"><span className="status-dot" style={{ background: c }} />{t}</span>)}<span className="muted">· Double-click a cell to add a shift</span></div>
      <ShiftFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} onSaved={reload} initialDate={initialDate} />
    </>
  );
}

// ------------------------------------------------------------------ Shift management (54)
export function ShiftManagementPage() {
  const { data, loading, reload } = useAsyncData(() => shiftService.all());
  const [open, setOpen] = useState(false);
  const upcoming = useMemo(() => (data ?? []).filter((s) => s.date >= TODAY).sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)), [data]);
  const columns: DataColumn<Shift>[] = [
    { key: 'd', title: 'Date', dataIndex: 'date', hideable: false, render: (v: string, s) => <PrimaryCell title={formatDate(v, 'ddd, MMM D')} subtitle={`${formatTime(s.startTime)} – ${formatTime(s.endTime)}`} />, sorter: (a, b) => a.date.localeCompare(b.date) },
    { key: 'p', title: 'Staff', dataIndex: 'providerName', render: (v: string) => <PrimaryCell title={v} avatar={v} /> },
    { key: 't', title: 'Shift', dataIndex: 'type', render: (v: Shift['type']) => <Tag color={shiftColor[v]} style={{ color: '#fff' }}>{v}</Tag> },
    { key: 'dept', title: 'Department', dataIndex: 'department' },
    { key: 'l', title: 'Location', dataIndex: 'locationName', ellipsis: true },
    { key: 'n', title: 'Notes', dataIndex: 'notes', ellipsis: true, defaultHidden: true },
    { key: 's', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, render: (_, s) => <Dropdown trigger={['click']} menu={{ items: [{ key: 'c', label: 'Confirm', onClick: async () => { await shiftService.update(s.id, { status: 'Confirmed' }); reload(); } }, { key: 'sw', label: 'Mark swapped', onClick: async () => { await shiftService.update(s.id, { status: 'Swapped' }); reload(); } }, { key: 'x', label: 'Cancel shift', danger: true, onClick: () => Modal.confirm({ title: 'Cancel this shift?', okButtonProps: { danger: true }, onOk: async () => { await shiftService.update(s.id, { status: 'Cancelled' }); reload(); } }) }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Dropdown> },
  ];
  return (
    <>
      <PageHeader title="Shift Management" subtitle="Upcoming shifts, confirmations and swaps" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Shift</Button>} />
      <MetricGrid>
        <MetricCard label="Upcoming shifts" value={upcoming.length} icon={<CalendarClock size={20} />} loading={loading} />
        <MetricCard label="Unconfirmed" value={upcoming.filter((s) => s.status === 'Scheduled').length} icon={<Clock size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Night / on-call" value={upcoming.filter((s) => s.type === 'Night' || s.type === 'On Call').length} icon={<Moon size={20} />} tone="info" loading={loading} />
        <MetricCard label="Swapped" value={upcoming.filter((s) => s.status === 'Swapped').length} icon={<Users size={20} />} tone="neutral" loading={loading} />
      </MetricGrid>
      <DataTable<Shift> rowKey="id" columns={columns} data={upcoming} loading={loading} searchKeys={['providerName', 'department', 'locationName']} filters={[{ key: 'type', label: 'Shift type', options: ['Morning', 'Afternoon', 'Evening', 'Night', 'On Call'] }, { key: 'status', label: 'Status', options: ['Scheduled', 'Confirmed', 'Swapped', 'Cancelled'] }, { key: 'locationName', label: 'Location', options: LOCATION_OPTIONS }]} exportable pageSize={15} />
      <ShiftFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} onSaved={reload} />
    </>
  );
}

// ------------------------------------------------------------------ Availability management (55)
export function AvailabilityManagementPage() {
  const providers = useAppSelector(providerSelectors.selectAll);
  const { data, loading, reload } = useAsyncData(() => availabilityService.all());
  const [providerId, setProviderId] = useState<string | undefined>(providers[0]?.id);
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const mine = (data ?? []).filter((a) => !providerId || a.providerId === providerId);
  const columns: DataColumn<AvailabilitySlot>[] = [
    { key: 'p', title: 'Provider', dataIndex: 'providerName', render: (v: string) => <PrimaryCell title={v} avatar={v} /> },
    { key: 'd', title: 'Day', dataIndex: 'dayOfWeek', sorter: (a, b) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(a.dayOfWeek) - ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(b.dayOfWeek), defaultSortOrder: 'ascend' },
    { key: 'h', title: 'Hours', render: (_, a) => `${formatTime(a.startTime)} – ${formatTime(a.endTime)}` },
    { key: 's', title: 'Slot length', dataIndex: 'slotMinutes', render: (v: number) => `${v} min` },
    { key: 't', title: 'Visit type', dataIndex: 'type' },
    { key: 'l', title: 'Location', dataIndex: 'locationName', ellipsis: true },
    { key: 'act', title: 'Active', dataIndex: 'isActive', render: (v: boolean, a) => <Switch size="small" checked={v} onChange={async (c) => { await availabilityService.update(a.id, { isActive: c }); reload(); }} /> },
    { key: 'x', title: '', width: 50, render: (_, a) => <Button type="text" size="small" danger icon={<XCircle size={14} />} onClick={async () => { await availabilityService.remove(a.id); reload(); }} /> },
  ];
  return (
    <>
      <PageHeader title="Availability Management" subtitle="Weekly working hours and bookable slot templates per provider" actions={<><Select allowClear showSearch optionFilterProp="label" placeholder="All providers" style={{ width: 240 }} value={providerId} onChange={setProviderId} options={providers.map((p) => ({ value: p.id, label: p.fullName }))} /><Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Hours</Button></>} />
      <DataTable<AvailabilitySlot> rowKey="id" columns={columns} data={mine} loading={loading} searchKeys={['providerName', 'locationName']} filters={[{ key: 'type', label: 'Visit type', options: ['In Person', 'Telehealth', 'Both'] }]} pageSize={15} emptyTitle="No availability configured" />
      <Modal title="Add Working Hours" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={async (v) => { const p = providers.find((x) => x.id === v.providerId); for (const day of v.days as AvailabilitySlot['dayOfWeek'][]) { await availabilityService.create({ providerId: v.providerId, providerName: p?.fullName ?? '', dayOfWeek: day, startTime: v.range[0].format('HH:mm'), endTime: v.range[1].format('HH:mm'), locationName: v.location ?? p?.locationName ?? '', slotMinutes: v.slot, type: v.type, isActive: true }); } setOpen(false); form.resetFields(); reload(); }} initialValues={{ providerId, slot: 20, type: 'In Person', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] }}>
          <Form.Item name="providerId" label="Provider" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={providers.map((p) => ({ value: p.id, label: p.fullName }))} /></Form.Item>
          <Form.Item name="days" label="Days" rules={[{ required: true }]}><Select mode="multiple" options={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => ({ value: d, label: d }))} /></Form.Item>
          <Form.Item name="range" label="Hours" rules={[{ required: true }]}><TimePicker.RangePicker format="h:mm A" use12Hours minuteStep={15} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="slot" label="Slot length (min)"><Select options={[10, 15, 20, 30, 45, 60].map((v) => ({ value: v, label: `${v} min` }))} /></Form.Item>
          <Form.Item name="type" label="Visit type"><Select options={['In Person', 'Telehealth', 'Both'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="location" label="Location"><Select allowClear options={LOCATION_OPTIONS.map((v) => ({ value: v, label: v }))} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Leave management (56)
export function LeaveManagementPage() {
  const { data, loading, reload } = useAsyncData(() => leaveService.all());
  const [open, setOpen] = useState(false);
  const user = useAppSelector((s) => s.auth.user);
  const act = async (l: LeaveRequest, status: LeaveRequest['status']) => { await leaveService.update(l.id, { status, approver: user?.fullName }); message.success(`Request ${status.toLowerCase()}`); reload(); };
  const columns: DataColumn<LeaveRequest>[] = [
    { key: 'p', title: 'Staff', dataIndex: 'providerName', hideable: false, render: (v: string) => <PrimaryCell title={v} avatar={v} /> },
    { key: 't', title: 'Type', dataIndex: 'type', render: (v: string) => <Tag>{v}</Tag> },
    { key: 'd', title: 'Dates', render: (_, l) => <PrimaryCell title={`${formatDate(l.startDate, 'MMM D')} – ${formatDate(l.endDate, 'MMM D, YYYY')}`} subtitle={`${l.days} day${l.days === 1 ? '' : 's'}`} />, sorter: (a, b) => a.startDate.localeCompare(b.startDate) },
    { key: 'r', title: 'Reason', dataIndex: 'reason', ellipsis: true },
    { key: 'req', title: 'Requested', dataIndex: 'requestedAt', render: (v: string) => formatDateTime(v), defaultHidden: true },
    { key: 'ap', title: 'Approver', dataIndex: 'approver', render: (v?: string) => v ?? '—' },
    { key: 's', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 160, render: (_, l) => l.status === 'Pending' ? <><Button size="small" type="primary" onClick={() => act(l, 'Approved')}>Approve</Button> <Button size="small" danger onClick={() => act(l, 'Rejected')}>Reject</Button></> : l.status === 'Approved' && l.startDate > TODAY ? <Button size="small" onClick={() => act(l, 'Cancelled')}>Cancel</Button> : null },
  ];
  const balance = [['Annual', 20, 12], ['Sick', 10, 3], ['Conference', 5, 2], ['Study', 5, 0]] as const;
  return (
    <>
      <PageHeader title="Leave Management" subtitle="Approve time-off requests and monitor coverage impact" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Request Leave</Button>} />
      <MetricGrid>
        <MetricCard label="Pending approval" value={data?.filter((l) => l.status === 'Pending').length ?? 0} icon={<Clock size={20} />} tone="warning" loading={loading} />
        <MetricCard label="On leave today" value={data?.filter((l) => l.status === 'Approved' && l.startDate <= TODAY && l.endDate >= TODAY).length ?? 0} icon={<Users size={20} />} tone="info" loading={loading} />
        <MetricCard label="Approved (next 30 days)" value={data?.filter((l) => l.status === 'Approved' && l.startDate > TODAY && dayjs(l.startDate).diff(dayjs(), 'day') <= 30).length ?? 0} icon={<CheckCircle2 size={20} />} tone="success" loading={loading} />
        <MetricCard label="Rejected (YTD)" value={data?.filter((l) => l.status === 'Rejected').length ?? 0} icon={<XCircle size={20} />} tone="error" loading={loading} />
      </MetricGrid>
      <div className="card-grid">
        <div className="col-8"><DataTable<LeaveRequest> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['providerName', 'reason']} filters={[{ key: 'status', label: 'Status', options: ['Pending', 'Approved', 'Rejected', 'Cancelled'] }, { key: 'type', label: 'Type', options: ['Annual', 'Sick', 'Conference', 'Parental', 'Unpaid', 'Study'] }]} pageSize={12} /></div>
        <div className="col-4"><SectionCard title="Typical leave entitlement (per provider)">{balance.map(([type, total, used]) => <div key={type} style={{ marginBottom: 12 }}><div className="flex justify-between" style={{ fontSize: 13 }}><span>{type}</span><span className="muted">{used}/{total} days</span></div><div style={{ height: 6, background: 'var(--color-surface-muted)', borderRadius: 3, marginTop: 4 }}><div style={{ width: `${(used / total) * 100}%`, height: '100%', background: '#0f6e8c', borderRadius: 3 }} /></div></div>)}</SectionCard></div>
      </div>
      <LeaveFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} onSaved={reload} />
    </>
  );
}
