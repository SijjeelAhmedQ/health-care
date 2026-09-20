import { useMemo, useState, type ReactNode } from 'react';
import { Button, Card, DatePicker, Select, Table, Tag, message } from 'antd';
import { Download, FileBarChart, Printer, RefreshCw } from 'lucide-react';
import { PageHeader, MetricCard, MetricGrid, SectionCard, StatusTag } from '@/components/common';
import { BarsChart, DonutChart, TrendChart } from '@/components/charts';
import { mockDb } from '@/services/api';
import { dayjs, formatCurrency, formatDate } from '@/utils/format';
import { LOCATION_OPTIONS } from '@/registry/fieldRegistry';

const months = Array.from({ length: 12 }, (_, i) => dayjs().subtract(11 - i, 'month'));
const seeded = (i: number, base: number, spread: number) => Math.round(base + Math.sin(i * 1.3) * spread + (i % 4) * spread * 0.15);

interface ReportShellProps { title: string; subtitle: string; metrics: ReactNode; children: ReactNode; extraFilters?: ReactNode }

/** Shared report chrome: filters row, export/print actions, metrics and body. */
function ReportShell({ title, subtitle, metrics, children, extraFilters }: ReportShellProps) {
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(30, 'day'), dayjs()]);
  const [location, setLocation] = useState<string | undefined>();
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={<><Button icon={<RefreshCw size={15} />} onClick={() => message.success('Report refreshed')}>Refresh</Button><Button icon={<Printer size={15} />} onClick={() => window.print()}>Print</Button><Button type="primary" icon={<Download size={15} />} onClick={() => message.success('Export queued — CSV will download shortly (mock)')}>Export</Button></>} />
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
        <div className="flex items-center gap-2 wrap">
          <DatePicker.RangePicker value={range} onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])} presets={[{ label: 'Last 7 days', value: [dayjs().subtract(7, 'day'), dayjs()] }, { label: 'Last 30 days', value: [dayjs().subtract(30, 'day'), dayjs()] }, { label: 'This quarter', value: [dayjs().startOf('month').subtract(2, 'month'), dayjs()] }, { label: 'Year to date', value: [dayjs().startOf('year'), dayjs()] }]} />
          <Select allowClear placeholder="All locations" style={{ minWidth: 200 }} value={location} onChange={setLocation} options={LOCATION_OPTIONS.map((l) => ({ value: l, label: l }))} />
          {extraFilters}
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Generated {dayjs().format('MMM D, YYYY h:mm A')}</span>
        </div>
      </Card>
      {metrics}
      {children}
    </>
  );
}

// ------------------------------------------------------------------ 80 Clinical reports
export function ClinicalReportsPage() {
  const problems = mockDb.problems;
  const topDx = Object.entries(problems.reduce<Record<string, number>>((a, p) => ({ ...a, [p.icd10]: (a[p.icd10] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([code, count]) => ({ code, description: problems.find((p) => p.icd10 === code)?.description ?? '', count, pct: Math.round((count / problems.length) * 100) }));
  const ordersTrend = months.map((m, i) => ({ month: m.format('MMM'), Labs: seeded(i, 95, 18), Imaging: seeded(i + 2, 38, 9), Referrals: seeded(i + 4, 24, 6) }));
  const medClasses = [{ name: 'Cardiovascular', value: 38 }, { name: 'Antidiabetic', value: 22 }, { name: 'Antibiotic', value: 17 }, { name: 'Respiratory', value: 13 }, { name: 'Other', value: 10 }];
  return (
    <ReportShell title="Clinical Reports" subtitle="Diagnoses, orders, medications and documentation quality" metrics={
      <MetricGrid>
        <MetricCard label="Encounters" value={mockDb.consultations.length} icon={<FileBarChart size={20} />} />
        <MetricCard label="Notes signed within 48 h" value="91%" icon={<FileBarChart size={20} />} tone="success" delta={{ value: '+3 pts', direction: 'up' }} />
        <MetricCard label="Orders placed" value={mockDb.labOrders.length + mockDb.imagingOrders.length} icon={<FileBarChart size={20} />} tone="info" />
        <MetricCard label="Abnormal result follow-up" value="86%" icon={<FileBarChart size={20} />} tone="warning" />
      </MetricGrid>}>
      <div className="card-grid">
        <div className="col-8"><SectionCard title="Orders by month"><TrendChart data={ordersTrend} xKey="month" series={[{ key: 'Labs', label: 'Labs' }, { key: 'Imaging', label: 'Imaging' }, { key: 'Referrals', label: 'Referrals' }]} /></SectionCard></div>
        <div className="col-4"><SectionCard title="Active medications by class (%)"><DonutChart data={medClasses} height={190} /></SectionCard></div>
        <div className="col-12"><SectionCard title="Top 10 diagnoses"><Table size="small" pagination={false} rowKey="code" dataSource={topDx} columns={[{ title: 'ICD-10', dataIndex: 'code', render: (v: string) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag> }, { title: 'Diagnosis', dataIndex: 'description' }, { title: 'Patients', dataIndex: 'count', align: 'right' }, { title: 'Share', dataIndex: 'pct', align: 'right', render: (v: number) => `${v}%` }]} /></SectionCard></div>
      </div>
    </ReportShell>
  );
}

// ------------------------------------------------------------------ 81 Patient reports
export function PatientReportsPage() {
  const patients = mockDb.patients;
  const ageBands = [['0–17', 0, 17], ['18–34', 18, 34], ['35–49', 35, 49], ['50–64', 50, 64], ['65+', 65, 200]].map(([band, lo, hi]) => ({ band, Male: patients.filter((p) => p.gender === 'Male' && p.age >= Number(lo) && p.age <= Number(hi)).length, Female: patients.filter((p) => p.gender === 'Female' && p.age >= Number(lo) && p.age <= Number(hi)).length }));
  const insurers = Object.entries(patients.reduce<Record<string, number>>((a, p) => ({ ...a, [p.insuranceProvider]: (a[p.insuranceProvider] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));
  const growth = months.map((m, i) => ({ month: m.format('MMM'), 'New registrations': seeded(i, 36, 8) }));
  const risk = ['Low', 'Medium', 'High'].map((r) => ({ risk: r, count: patients.filter((p) => p.riskLevel === r).length }));
  return (
    <ReportShell title="Patient Reports" subtitle="Demographics, panel growth, risk stratification and payer mix" extraFilters={<Select allowClear placeholder="Risk level" style={{ width: 140 }} options={['Low', 'Medium', 'High'].map((r) => ({ value: r, label: r }))} />} metrics={
      <MetricGrid>
        <MetricCard label="Total patients" value={patients.length} icon={<FileBarChart size={20} />} />
        <MetricCard label="Active" value={patients.filter((p) => p.status === 'Active').length} icon={<FileBarChart size={20} />} tone="success" />
        <MetricCard label="Avg. age" value={Math.round(patients.reduce((s, p) => s + p.age, 0) / patients.length)} icon={<FileBarChart size={20} />} tone="info" />
        <MetricCard label="High risk" value={patients.filter((p) => p.riskLevel === 'High').length} icon={<FileBarChart size={20} />} tone="error" />
        <MetricCard label="Seen in last 12 months" value={`${Math.round((patients.filter((p) => p.lastVisit && dayjs(p.lastVisit).isAfter(dayjs().subtract(1, 'year'))).length / patients.length) * 100)}%`} icon={<FileBarChart size={20} />} tone="neutral" />
      </MetricGrid>}>
      <div className="card-grid">
        <div className="col-6"><SectionCard title="Age & sex distribution"><BarsChart data={ageBands} xKey="band" series={[{ key: 'Male', label: 'Male' }, { key: 'Female', label: 'Female' }]} height={240} /></SectionCard></div>
        <div className="col-6"><SectionCard title="New registrations — 12 months"><TrendChart data={growth} xKey="month" series={[{ key: 'New registrations', label: 'New registrations' }]} height={240} /></SectionCard></div>
        <div className="col-6"><SectionCard title="Payer mix"><DonutChart data={insurers} height={200} /></SectionCard></div>
        <div className="col-6"><SectionCard title="Risk stratification"><BarsChart data={risk} xKey="risk" series={[{ key: 'count', label: 'Patients' }]} height={200} /></SectionCard></div>
      </div>
    </ReportShell>
  );
}

// ------------------------------------------------------------------ 82 Appointment reports
export function AppointmentReportsPage() {
  const appts = mockDb.appointments;
  const past = appts.filter((a) => a.date < dayjs().format('YYYY-MM-DD'));
  const outcomes = ['Completed', 'Cancelled', 'No Show'].map((s) => ({ name: s, value: past.filter((a) => a.status === s).length }));
  const byType = Object.entries(appts.reduce<Record<string, number>>((a, x) => ({ ...a, [x.type]: (a[x.type] ?? 0) + 1 }), {})).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  const byDow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => ({ day: d, Appointments: appts.filter((a) => dayjs(a.date).format('ddd') === d).length }));
  const leadTime = months.map((m, i) => ({ month: m.format('MMM'), 'Avg. lead time (days)': seeded(i, 9, 2), 'Avg. wait (min)': seeded(i + 1, 12, 3) }));
  const byLocation = mockDb.locations.map((l) => { const list = appts.filter((a) => a.locationName === l.name); return { location: l.name, total: list.length, completed: list.filter((a) => a.status === 'Completed').length, noShow: list.filter((a) => a.status === 'No Show').length, tele: list.filter((a) => a.isTelehealth).length }; });
  return (
    <ReportShell title="Appointment Reports" subtitle="Volume, outcomes, no-show rates and access metrics" extraFilters={<Select allowClear placeholder="Visit type" style={{ width: 160 }} options={mockDb.appointmentTypes.map((t) => ({ value: t.name, label: t.name }))} />} metrics={
      <MetricGrid>
        <MetricCard label="Appointments" value={appts.length} icon={<FileBarChart size={20} />} />
        <MetricCard label="Completion rate" value={`${Math.round((outcomes[0].value / Math.max(1, past.length)) * 100)}%`} icon={<FileBarChart size={20} />} tone="success" />
        <MetricCard label="No-show rate" value={`${Math.round((outcomes[2].value / Math.max(1, past.length)) * 100)}%`} icon={<FileBarChart size={20} />} tone="error" />
        <MetricCard label="Telehealth share" value={`${Math.round((appts.filter((a) => a.isTelehealth).length / appts.length) * 100)}%`} icon={<FileBarChart size={20} />} tone="info" />
        <MetricCard label="Avg. lead time" value="9 days" icon={<FileBarChart size={20} />} tone="neutral" />
      </MetricGrid>}>
      <div className="card-grid">
        <div className="col-8"><SectionCard title="Access metrics"><TrendChart data={leadTime} xKey="month" series={[{ key: 'Avg. lead time (days)', label: 'Lead time (days)' }, { key: 'Avg. wait (min)', label: 'Wait (min)' }]} /></SectionCard></div>
        <div className="col-4"><SectionCard title="Outcomes (past appointments)"><DonutChart data={outcomes} height={190} /></SectionCard></div>
        <div className="col-6"><SectionCard title="By visit type"><BarsChart data={byType} xKey="type" horizontal series={[{ key: 'count', label: 'Appointments' }]} height={260} /></SectionCard></div>
        <div className="col-6"><SectionCard title="By day of week"><BarsChart data={byDow} xKey="day" series={[{ key: 'Appointments', label: 'Appointments' }]} height={260} /></SectionCard></div>
        <div className="col-12"><SectionCard title="By location"><Table size="small" pagination={false} rowKey="location" dataSource={byLocation} columns={[{ title: 'Location', dataIndex: 'location' }, { title: 'Total', dataIndex: 'total', align: 'right' }, { title: 'Completed', dataIndex: 'completed', align: 'right' }, { title: 'No-shows', dataIndex: 'noShow', align: 'right' }, { title: 'No-show %', align: 'right', render: (_, r) => `${Math.round((r.noShow / Math.max(1, r.total)) * 100)}%` }, { title: 'Telehealth', dataIndex: 'tele', align: 'right' }]} /></SectionCard></div>
      </div>
    </ReportShell>
  );
}

// ------------------------------------------------------------------ 83 Provider reports
export function ProviderReportsPage() {
  const rows = mockDb.providers.map((p, i) => { const mine = mockDb.appointments.filter((a) => a.providerId === p.id); return { ...p, visits: mine.length, completed: mine.filter((a) => a.status === 'Completed').length, rvu: seeded(i, 420, 90), revenue: seeded(i, 68000, 14000), noShow: Math.round((mine.filter((a) => a.status === 'No Show').length / Math.max(1, mine.length)) * 100) }; }).sort((a, b) => b.rvu - a.rvu);
  const chart = rows.slice(0, 10).map((r) => ({ provider: r.lastName, 'Work RVUs': r.rvu }));
  const bySpecialty = Object.entries(rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.specialty]: (a[r.specialty] ?? 0) + r.visits }), {})).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([specialty, visits]) => ({ specialty, visits }));
  return (
    <ReportShell title="Provider Reports" subtitle="Productivity (wRVU), panel size, utilization and quality by provider" extraFilters={<Select allowClear placeholder="Specialty" style={{ width: 180 }} options={[...new Set(rows.map((r) => r.specialty))].map((s) => ({ value: s, label: s }))} />} metrics={
      <MetricGrid>
        <MetricCard label="Total wRVUs" value={rows.reduce((s, r) => s + r.rvu, 0).toLocaleString()} icon={<FileBarChart size={20} />} />
        <MetricCard label="Avg. visits / provider" value={Math.round(rows.reduce((s, r) => s + r.visits, 0) / rows.length)} icon={<FileBarChart size={20} />} tone="info" />
        <MetricCard label="Avg. utilization" value={`${Math.round(rows.reduce((s, r) => s + r.utilization, 0) / rows.length)}%`} icon={<FileBarChart size={20} />} tone="success" />
        <MetricCard label="Avg. rating" value={(rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1)} icon={<FileBarChart size={20} />} tone="warning" />
      </MetricGrid>}>
      <div className="card-grid">
        <div className="col-7 col-8"><SectionCard title="Work RVUs — top 10"><BarsChart data={chart} xKey="provider" series={[{ key: 'Work RVUs', label: 'Work RVUs' }]} height={240} /></SectionCard></div>
        <div className="col-4"><SectionCard title="Visits by specialty"><BarsChart data={bySpecialty} xKey="specialty" horizontal series={[{ key: 'visits', label: 'Visits' }]} height={240} /></SectionCard></div>
        <div className="col-12"><SectionCard title="Provider scorecard"><Table size="small" rowKey="id" dataSource={rows} pagination={false} scroll={{ x: 'max-content' }} columns={[{ title: 'Provider', dataIndex: 'fullName' }, { title: 'Specialty', dataIndex: 'specialty' }, { title: 'Visits', dataIndex: 'visits', align: 'right', sorter: (a, b) => a.visits - b.visits }, { title: 'Completed', dataIndex: 'completed', align: 'right' }, { title: 'wRVU', dataIndex: 'rvu', align: 'right', sorter: (a, b) => a.rvu - b.rvu }, { title: 'Revenue', dataIndex: 'revenue', align: 'right', render: (v: number) => formatCurrency(v) }, { title: 'Utilization', dataIndex: 'utilization', align: 'right', render: (v: number) => `${v}%` }, { title: 'No-show %', dataIndex: 'noShow', align: 'right' }, { title: 'Rating', dataIndex: 'rating', align: 'right' }, { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> }]} /></SectionCard></div>
      </div>
    </ReportShell>
  );
}

// ------------------------------------------------------------------ 84 Practice reports
export function PracticeReportsPage() {
  const revenue = months.map((m, i) => ({ month: m.format('MMM'), Revenue: seeded(i, 412000, 46000), Expenses: seeded(i + 3, 318000, 22000) }));
  const byLoc = mockDb.locations.map((l, i) => ({ location: l.name.split(' ')[0], Revenue: seeded(i, 140000, 60000) }));
  const kpis = [['Room utilization', '74%', 'good'], ['Staff-to-provider ratio', '2.4 : 1', 'good'], ['Patient satisfaction (NPS)', '62', 'good'], ['Average days in A/R', '38', 'warning'], ['Claim denial rate', '4.1%', 'warning'], ['Cost per visit', formatCurrency(112), 'good']];
  return (
    <ReportShell title="Practice Reports" subtitle="Operational and financial performance across the organisation" metrics={
      <MetricGrid>
        <MetricCard label="Revenue (12 mo)" value={formatCurrency(revenue.reduce((s, r) => s + r.Revenue, 0))} icon={<FileBarChart size={20} />} tone="success" />
        <MetricCard label="Operating margin" value="22.8%" icon={<FileBarChart size={20} />} delta={{ value: '+1.4 pts', direction: 'up' }} />
        <MetricCard label="Visits (12 mo)" value={(mockDb.appointments.length * 11).toLocaleString()} icon={<FileBarChart size={20} />} tone="info" />
        <MetricCard label="Active locations" value={mockDb.locations.filter((l) => l.isActive).length} icon={<FileBarChart size={20} />} tone="neutral" />
      </MetricGrid>}>
      <div className="card-grid">
        <div className="col-8"><SectionCard title="Revenue vs expenses"><TrendChart data={revenue} xKey="month" series={[{ key: 'Revenue', label: 'Revenue' }, { key: 'Expenses', label: 'Expenses' }]} formatValue={(v) => `$${Math.round(v / 1000)}k`} /></SectionCard></div>
        <div className="col-4"><SectionCard title="Revenue by location"><BarsChart data={byLoc} xKey="location" horizontal series={[{ key: 'Revenue', label: 'Revenue' }]} formatValue={(v) => `$${Math.round(v / 1000)}k`} height={260} /></SectionCard></div>
        <div className="col-12"><SectionCard title="Key performance indicators"><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>{kpis.map(([k, v, tone]) => <div key={String(k)} style={{ padding: 14, border: '1px solid var(--color-border)', borderRadius: 10 }}><div className="muted" style={{ fontSize: 12 }}>{k}</div><div style={{ fontSize: 22, fontWeight: 700, color: tone === 'warning' ? '#d98800' : undefined }}>{v}</div></div>)}</div></SectionCard></div>
      </div>
    </ReportShell>
  );
}

// ------------------------------------------------------------------ 85 Audit reports
export function AuditReportsPage() {
  const logs = mockDb.auditLogs;
  const byAction = Object.entries(logs.reduce<Record<string, number>>((a, l) => ({ ...a, [l.action]: (a[l.action] ?? 0) + 1 }), {})).map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count);
  const daily = Array.from({ length: 14 }, (_, i) => { const d = dayjs().subtract(13 - i, 'day'); const list = logs.filter((l) => dayjs(l.timestamp).isSame(d, 'day')); return { day: d.format('MMM D'), Events: list.length, Failures: list.filter((l) => l.outcome !== 'Success').length }; });
  const topUsers = Object.entries(logs.reduce<Record<string, number>>((a, l) => ({ ...a, [l.user]: (a[l.user] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([user, events]) => ({ user, events, phiViews: logs.filter((l) => l.user === user && l.action === 'View' && l.entity === 'Patient').length, exports: logs.filter((l) => l.user === user && (l.action === 'Export' || l.action === 'Print')).length }));
  const flagged = useMemo(() => logs.filter((l) => l.action === 'Failed Login' || l.action === 'Export' || l.action === 'Delete').slice(0, 10), [logs]);
  return (
    <ReportShell title="Audit Reports" subtitle="Compliance view of PHI access, exports and security events" extraFilters={<Select allowClear placeholder="Action" style={{ width: 150 }} options={byAction.map((a) => ({ value: a.action, label: a.action }))} />} metrics={
      <MetricGrid>
        <MetricCard label="Audit events" value={logs.length} icon={<FileBarChart size={20} />} />
        <MetricCard label="PHI views" value={logs.filter((l) => l.action === 'View' && l.entity === 'Patient').length} icon={<FileBarChart size={20} />} tone="info" />
        <MetricCard label="Exports & prints" value={logs.filter((l) => l.action === 'Export' || l.action === 'Print').length} icon={<FileBarChart size={20} />} tone="warning" />
        <MetricCard label="Failed logins" value={logs.filter((l) => l.action === 'Failed Login').length} icon={<FileBarChart size={20} />} tone="error" />
        <MetricCard label="Users audited" value={new Set(logs.map((l) => l.user)).size} icon={<FileBarChart size={20} />} tone="neutral" />
      </MetricGrid>}>
      <div className="card-grid">
        <div className="col-8"><SectionCard title="Daily events — 14 days"><BarsChart data={daily} xKey="day" series={[{ key: 'Events', label: 'Events' }, { key: 'Failures', label: 'Failures / warnings' }]} height={240} /></SectionCard></div>
        <div className="col-4"><SectionCard title="Events by action"><BarsChart data={byAction.slice(0, 6)} xKey="action" horizontal series={[{ key: 'count', label: 'Events' }]} height={240} /></SectionCard></div>
        <div className="col-6"><SectionCard title="Most active users"><Table size="small" pagination={false} rowKey="user" dataSource={topUsers} columns={[{ title: 'User', dataIndex: 'user' }, { title: 'Events', dataIndex: 'events', align: 'right' }, { title: 'PHI views', dataIndex: 'phiViews', align: 'right' }, { title: 'Exports', dataIndex: 'exports', align: 'right', render: (v: number) => <span style={{ color: v > 2 ? '#d98800' : undefined }}>{v}</span> }]} /></SectionCard></div>
        <div className="col-6"><SectionCard title="Flagged events"><Table size="small" pagination={false} rowKey="id" dataSource={flagged} columns={[{ title: 'When', dataIndex: 'timestamp', render: (v: string) => formatDate(v, 'MMM D, h:mm A') }, { title: 'User', dataIndex: 'user', ellipsis: true }, { title: 'Action', dataIndex: 'action', render: (v: string) => <Tag color={v === 'Failed Login' || v === 'Delete' ? 'red' : 'orange'}>{v}</Tag> }, { title: 'Entity', dataIndex: 'entity' }]} /></SectionCard></div>
      </div>
    </ReportShell>
  );
}
