import { useMemo, useState } from 'react';
import { Button, Card, Checkbox, Col, Descriptions, Dropdown, Form, Input, InputNumber, List, Modal, Row, Select, Switch, Table, Tabs, Tag, Timeline, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { Activity, AlertTriangle, Globe, KeyRound, Lock, MoreHorizontal, Pencil, Plus, Shield, ShieldCheck, UserCog, UserPlus, Users, Download, Trash2 } from 'lucide-react';
import { PageHeader, MetricCard, MetricGrid, SectionCard, StatusTag, PrimaryCell, KeyValue, Avatar, EmptyState } from '@/components/common';
import { DataTable, type DataColumn } from '@/components/tables/DataTable';
import { BarsChart, DonutChart } from '@/components/charts';
import { RoleFormDrawer, UserFormCard, UserFormDrawer } from '@/components/forms/StaffForms';
import { useAppSelector } from '@/store';
import { useAsyncData } from '@/hooks';
import { auditLogService, permissionService, roleService, userService, mockDb } from '@/services/api';
import type { AuditLog, Permission, Role, User } from '@/types/domain';
import { dayjs, formatDateTime, fromNow } from '@/utils/format';
import { ROLE_OPTIONS, DEPARTMENT_OPTIONS, LOCATION_OPTIONS } from '@/registry/fieldRegistry';

function useUserColumns(reload: () => void): DataColumn<User>[] {
  const navigate = useNavigate();
  return [
    { key: 'n', title: 'User', dataIndex: 'fullName', hideable: false, render: (v: string, u) => <PrimaryCell title={v} subtitle={`@${u.username} · ${u.email}`} avatar={v} />, sorter: (a, b) => a.lastName.localeCompare(b.lastName) },
    { key: 'r', title: 'Role', dataIndex: 'role', render: (v: string) => <Tag color={v === 'Administrator' ? 'purple' : v === 'Physician' ? 'blue' : 'default'}>{v}</Tag> },
    { key: 'd', title: 'Department', dataIndex: 'department', ellipsis: true },
    { key: 'l', title: 'Location', dataIndex: 'locationName', ellipsis: true, defaultHidden: true },
    { key: 'mfa', title: 'MFA', dataIndex: 'mfaEnabled', render: (v: boolean) => (v ? <Tag color="green">On</Tag> : <Tag color="orange">Off</Tag>), width: 70 },
    { key: 'll', title: 'Last login', dataIndex: 'lastLogin', render: (v?: string) => (v ? fromNow(v) : 'Never'), sorter: (a, b) => (a.lastLogin ?? '').localeCompare(b.lastLogin ?? '') },
    { key: 's', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, hideable: false, render: (_, u) => <Dropdown trigger={['click']} menu={{ items: [{ key: 'o', label: 'Open profile', onClick: () => navigate(`/users/${u.id}`) }, { key: 'reset', label: 'Send password reset', icon: <KeyRound size={14} />, onClick: () => message.success(`Reset email sent to ${u.email}`) }, { key: 'lock', label: u.status === 'Locked' ? 'Unlock account' : 'Lock account', icon: <Lock size={14} />, onClick: async () => { await userService.update(u.id, { status: u.status === 'Locked' ? 'Active' : 'Locked' }); reload(); } }, { key: 'deact', label: u.status === 'Inactive' ? 'Reactivate' : 'Deactivate', danger: u.status !== 'Inactive', onClick: async () => { await userService.update(u.id, { status: u.status === 'Inactive' ? 'Active' : 'Inactive' }); reload(); } }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} onClick={(e) => e.stopPropagation()} /></Dropdown> },
  ];
}

// ------------------------------------------------------------------ Dashboard (65)
export function UserDashboardPage() {
  const navigate = useNavigate();
  const { data: users, loading, reload } = useAsyncData(() => userService.all());
  const { data: audit } = useAsyncData(() => auditLogService.all());
  const columns = useUserColumns(reload);
  const byRole = useMemo(() => ROLE_OPTIONS.map((r) => ({ role: r.replace('Practice ', ''), count: (users ?? []).filter((u) => u.role === r).length })).filter((r) => r.count), [users]);
  const statusDonut = ['Active', 'Inactive', 'Locked', 'Pending Invite'].map((s) => ({ name: s, value: (users ?? []).filter((u) => u.status === s).length })).filter((s) => s.value);
  const recentLogins = (audit ?? []).filter((a) => a.action === 'Login' || a.action === 'Failed Login').slice(0, 6);
  return (
    <>
      <PageHeader title="User Management" subtitle="Accounts, roles, permissions and access oversight" actions={<><Button icon={<Shield size={15} />} onClick={() => navigate('/users/roles')}>Roles</Button><Button type="primary" icon={<UserPlus size={15} />} onClick={() => navigate('/users/create')}>Create User</Button></>} />
      <MetricGrid>
        <MetricCard label="Total users" value={users?.length ?? 0} icon={<Users size={20} />} loading={loading} onClick={() => navigate('/users/list')} />
        <MetricCard label="Active" value={users?.filter((u) => u.status === 'Active').length ?? 0} icon={<Activity size={20} />} tone="success" loading={loading} />
        <MetricCard label="MFA enabled" value={`${Math.round(((users?.filter((u) => u.mfaEnabled).length ?? 0) / Math.max(1, users?.length ?? 1)) * 100)}%`} icon={<ShieldCheck size={20} />} tone="info" loading={loading} />
        <MetricCard label="Locked / pending" value={users?.filter((u) => u.status === 'Locked' || u.status === 'Pending Invite').length ?? 0} icon={<AlertTriangle size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Failed logins (30d)" value={audit?.filter((a) => a.action === 'Failed Login').length ?? 0} icon={<Lock size={20} />} tone="error" onClick={() => navigate('/users/audit-logs')} />
      </MetricGrid>
      <div className="card-grid">
        <div className="col-5 col-6"><SectionCard title="Users by role"><BarsChart data={byRole} xKey="role" horizontal series={[{ key: 'count', label: 'Users' }]} height={260} /></SectionCard></div>
        <div className="col-3 col-6"><SectionCard title="Account status"><DonutChart data={statusDonut} height={180} /></SectionCard></div>
        <div className="col-4 col-12"><SectionCard title="Recent sign-in activity" extra={<Button type="link" size="small" onClick={() => navigate('/users/audit-logs')}>Audit logs</Button>}>{recentLogins.map((a) => <div key={a.id} className="list-row"><Avatar name={a.user} size={28} /><div className="list-row-main"><div className="list-row-title">{a.user}</div><div className="list-row-sub">{a.ipAddress} · {fromNow(a.timestamp)}</div></div><StatusTag status={a.action === 'Failed Login' ? 'Failure' : 'Success'} /></div>)}</SectionCard></div>
      </div>
      <DataTable<User> title="Recently active users" rowKey="id" columns={columns} data={[...(users ?? [])].sort((a, b) => (b.lastLogin ?? '').localeCompare(a.lastLogin ?? '')).slice(0, 8)} loading={loading} onRowClick={(u) => navigate(`/users/${u.id}`)} pageSize={8} />
    </>
  );
}

// ------------------------------------------------------------------ List (66)
export function UserListPage() {
  const navigate = useNavigate();
  const { data, loading, reload } = useAsyncData(() => userService.all());
  const columns = useUserColumns(reload);
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="User List" subtitle={`${data?.length ?? 0} staff accounts`} actions={<Button type="primary" icon={<UserPlus size={15} />} onClick={() => setOpen(true)}>Create User</Button>} />
      <DataTable<User> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['fullName', 'email', 'username', 'role']} filters={[{ key: 'role', label: 'Role', options: ROLE_OPTIONS }, { key: 'status', label: 'Status', options: ['Active', 'Inactive', 'Locked', 'Pending Invite'] }, { key: 'department', label: 'Department', options: DEPARTMENT_OPTIONS }, { key: 'locationName', label: 'Location', options: LOCATION_OPTIONS }]} onRowClick={(u) => navigate(`/users/${u.id}`)} selectable exportable pageSize={15} />
      <UserFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} onSaved={reload} />
    </>
  );
}

// ------------------------------------------------------------------ Create (67)
export function CreateUserPage() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Create User" subtitle="Provision a staff account, assign a role and send an invitation" />
      <Row gutter={20}>
        <Col xs={24} lg={16}><UserFormCard onSaved={(u) => navigate(`/users/${u.id}`)} /></Col>
        <Col xs={24} lg={8}>
          <SectionCard title="Role permissions preview">
            <List size="small" dataSource={mockDb.roles} renderItem={(r) => <List.Item><List.Item.Meta title={<span style={{ fontSize: 13 }}>{r.name}</span>} description={<span style={{ fontSize: 12 }}>{r.permissions.length} permissions · {r.users} users</span>} /></List.Item>} />
          </SectionCard>
          <SectionCard title="Security defaults"><ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: '#5b6b7a', lineHeight: 1.8 }}><li>MFA is required for clinical and admin roles.</li><li>Invitations expire after 72 hours.</li><li>Initial password must be changed on first login.</li></ul></SectionCard>
        </Col>
      </Row>
    </>
  );
}

// ------------------------------------------------------------------ Profile (68)
export function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: user, loading, reload } = useAsyncData(() => userService.get(id!), [id]);
  const { data: audit } = useAsyncData(() => auditLogService.all().then((a) => a.filter((x) => x.user === user?.fullName).slice(0, 20)), [user?.fullName]);
  const [edit, setEdit] = useState(false);
  const role = mockDb.roles.find((r) => r.name === user?.role);
  if (!user) return loading ? <Card loading /> : <EmptyState title="User not found" action={<Button onClick={() => navigate('/users/list')}>Back</Button>} />;
  return (
    <>
      <PageHeader title={user.fullName} breadcrumbs={[{ title: <a onClick={() => navigate('/dashboard')}>Home</a> }, { title: <a onClick={() => navigate('/users')}>User Management</a> }, { title: user.fullName }]} actions={<><Button icon={<KeyRound size={15} />} onClick={() => message.success('Password reset email sent')}>Reset Password</Button><Button type="primary" icon={<Pencil size={15} />} onClick={() => setEdit(true)}>Edit User</Button></>} />
      <div className="card-grid">
        <div className="col-4">
          <SectionCard title="Account">
            <div className="flex items-center gap-3" style={{ marginBottom: 14 }}><Avatar name={user.fullName} size={52} color={user.avatarColor} /><div><div style={{ fontWeight: 600, fontSize: 15 }}>{user.fullName}</div><div className="muted" style={{ fontSize: 12 }}>@{user.username}</div><StatusTag status={user.status} /></div></div>
            <KeyValue columns={1} items={[{ label: 'Email', value: user.email }, { label: 'Phone', value: user.phone }, { label: 'Role', value: user.role }, { label: 'Department', value: user.department }, { label: 'Location', value: user.locationName }, { label: 'Created', value: formatDateTime(user.createdAt) }, { label: 'Last login', value: user.lastLogin ? formatDateTime(user.lastLogin) : 'Never' }]} />
          </SectionCard>
          <SectionCard title="Security">
            <div className="flex justify-between items-center" style={{ marginBottom: 10 }}><span>Multi-factor authentication</span><Switch checked={user.mfaEnabled} onChange={async (c) => { await userService.update(user.id, { mfaEnabled: c }); reload(); }} /></div>
            <div className="flex justify-between items-center" style={{ marginBottom: 10 }}><span>Account locked</span><Switch checked={user.status === 'Locked'} onChange={async (c) => { await userService.update(user.id, { status: c ? 'Locked' : 'Active' }); reload(); }} /></div>
            <Button danger block icon={<Trash2 size={14} />} onClick={() => Modal.confirm({ title: 'Deactivate this account?', okButtonProps: { danger: true }, onOk: async () => { await userService.update(user.id, { status: 'Inactive' }); reload(); } })}>Deactivate</Button>
          </SectionCard>
        </div>
        <div className="col-8">
          <Tabs items={[
            { key: 'perms', label: `Effective permissions (${role?.permissions.length ?? 0})`, children: <Card><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>{mockDb.permissions.filter((p) => role?.permissions.includes(p.key)).map((p) => <div key={p.key} className="flex items-center gap-2" style={{ fontSize: 13, padding: '6px 8px', background: 'var(--color-surface-muted)', borderRadius: 6 }}><ShieldCheck size={14} color="#0f9d58" /> {p.name}{p.sensitive && <Tag color="orange" style={{ marginLeft: 'auto' }}>sensitive</Tag>}</div>)}</div></Card> },
            { key: 'activity', label: 'Activity', children: <Card>{audit?.length ? <Timeline items={audit.map((a) => ({ color: a.outcome === 'Success' ? 'green' : 'red', children: <div style={{ fontSize: 13 }}><strong>{a.action}</strong> {a.entity} <span className="mono muted">{a.entityId}</span><div className="muted" style={{ fontSize: 11 }}>{formatDateTime(a.timestamp)} · {a.ipAddress}</div></div> }))} /> : <EmptyState title="No recent activity" />}</Card> },
            { key: 'sessions', label: 'Sessions', children: <Card><Table size="small" pagination={false} rowKey="id" dataSource={[{ id: 1, device: 'Chrome · Windows 11', ip: '10.2.14.55', started: dayjs().subtract(2, 'hour').toISOString(), current: true }, { id: 2, device: 'Safari · iPhone', ip: '10.2.90.12', started: dayjs().subtract(1, 'day').toISOString(), current: false }]} columns={[{ title: 'Device', dataIndex: 'device' }, { title: 'IP', dataIndex: 'ip' }, { title: 'Started', dataIndex: 'started', render: (v: string) => formatDateTime(v) }, { title: '', render: (_, r) => (r.current ? <Tag color="green">Current</Tag> : <Button size="small" onClick={() => message.success('Session revoked')}>Revoke</Button>) }]} /></Card> },
          ]} />
        </div>
      </div>
      <UserFormDrawer open={edit} onOpen={() => setEdit(true)} onClose={() => setEdit(false)} existing={user} onSaved={reload} />
    </>
  );
}

// ------------------------------------------------------------------ Roles (69)
export function RolesPage() {
  const { data, loading, reload } = useAsyncData(() => roleService.all());
  const [editing, setEditing] = useState<Role | null | 'new'>(null);
  const columns: DataColumn<Role>[] = [
    { key: 'n', title: 'Role', dataIndex: 'name', hideable: false, render: (v: string, r) => <PrimaryCell title={<span className="flex items-center gap-2"><Shield size={14} className="muted" />{v}{r.isSystem && <Tag style={{ marginLeft: 4 }}>System</Tag>}</span>} subtitle={r.description} /> },
    { key: 'u', title: 'Users', dataIndex: 'users', align: 'right', sorter: (a, b) => a.users - b.users },
    { key: 'p', title: 'Permissions', dataIndex: 'permissions', render: (p: string[]) => <span>{p.length} <span className="muted">({p.filter((k) => mockDb.permissions.find((x) => x.key === k)?.sensitive).length} sensitive)</span></span> },
    { key: 'up', title: 'Updated', dataIndex: 'updatedAt', render: (v: string) => fromNow(v) },
    { key: 'a', title: '', width: 90, render: (_, r) => <><Button type="text" size="small" icon={<Pencil size={14} />} onClick={() => setEditing(r)} />{!r.isSystem && <Button type="text" size="small" danger icon={<Trash2 size={14} />} onClick={() => Modal.confirm({ title: `Delete role ${r.name}?`, okButtonProps: { danger: true }, onOk: async () => { await roleService.remove(r.id); reload(); } })} />}</> },
  ];
  return (
    <>
      <PageHeader title="Roles" subtitle="Role definitions that bundle permissions for staff groups" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>Create Role</Button>} />
      <DataTable<Role> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['name', 'description']} pageSize={10} expandable={{ expandedRowRender: (r) => <div className="flex gap-2 wrap">{r.permissions.map((k) => <Tag key={k}>{k}</Tag>)}</div> }} />
      <RoleFormDrawer open={!!editing} onOpen={() => setEditing('new')} onClose={() => setEditing(null)} existing={editing === 'new' ? undefined : editing ?? undefined} onSaved={reload} />
    </>
  );
}

// ------------------------------------------------------------------ Permissions matrix (70)
export function PermissionsPage() {
  const { data: perms, loading } = useAsyncData(() => permissionService.all());
  const { data: roles, reload } = useAsyncData(() => roleService.all());
  const modules = [...new Set((perms ?? []).map((p) => p.module))];
  const toggle = async (role: Role, key: string) => { const next = role.permissions.includes(key) ? role.permissions.filter((k) => k !== key) : [...role.permissions, key]; await roleService.update(role.id, { permissions: next, updatedAt: new Date().toISOString() }); reload(); };
  return (
    <>
      <PageHeader title="Permissions" subtitle="Permission matrix — toggle what each role can do" actions={<Button icon={<Download size={15} />} onClick={() => message.info('Matrix exported (mock)')}>Export</Button>} />
      <Card loading={loading} styles={{ body: { padding: 0, overflowX: 'auto' } }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900, fontSize: 13 }}>
          <thead><tr><th style={{ textAlign: 'left', padding: 10, background: 'var(--color-surface-subtle)', minWidth: 260 }}>Permission</th>{(roles ?? []).map((r) => <th key={r.id} style={{ padding: 10, background: 'var(--color-surface-subtle)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5b6b7a', borderLeft: '1px solid var(--color-border)' }}>{r.name}</th>)}</tr></thead>
          {modules.map((m) => (
              <tbody key={m}>
                <tr><td colSpan={(roles?.length ?? 0) + 1} style={{ padding: '8px 10px', background: 'var(--color-surface-muted)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#5b6b7a', borderTop: '1px solid var(--color-border)' }}>{m}</td></tr>
                {(perms ?? []).filter((p: Permission) => p.module === m).map((p) => (
                  <tr key={p.key} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '8px 10px' }}><div>{p.name}{p.sensitive && <Tag color="orange" style={{ marginLeft: 6 }}>sensitive</Tag>}</div><div className="muted mono" style={{ fontSize: 11 }}>{p.key}</div></td>
                    {(roles ?? []).map((r) => <td key={r.id} style={{ textAlign: 'center', borderLeft: '1px solid var(--color-border)' }}><Checkbox checked={r.permissions.includes(p.key)} disabled={r.name === 'Administrator'} onChange={() => toggle(r, p.key)} aria-label={`${r.name} ${p.name}`} /></td>)}
                  </tr>
                ))}
              </tbody>
            ))}
        </table>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ Access control (71)
export function AccessControlPage() {
  const [form] = Form.useForm();
  const [ipForm] = Form.useForm();
  const [ips, setIps] = useState([{ id: 1, cidr: '10.0.0.0/8', label: 'Clinic network', enabled: true }, { id: 2, cidr: '203.0.113.42/32', label: 'Billing vendor VPN', enabled: true }, { id: 3, cidr: '198.51.100.0/24', label: 'Remote staff (legacy)', enabled: false }]);
  return (
    <>
      <PageHeader title="Access Control" subtitle="Authentication policies, session rules and network restrictions" />
      <Row gutter={20}>
        <Col xs={24} lg={14}>
          <Card title="Authentication & session policy">
            <Form form={form} layout="vertical" onFinish={() => message.success('Access policy saved')} initialValues={{ mfaRoles: ['Administrator', 'Physician', 'Practice Manager'], sessionTimeout: 30, maxSessions: 3, lockoutAttempts: 5, lockoutMinutes: 15, passwordLength: 12, passwordExpiry: 90, sso: true, rememberDevice: false, breakGlass: true }}>
              <div className="form-grid cols-2">
                <Form.Item name="mfaRoles" label="Roles requiring MFA" className="span-2"><Select mode="multiple" options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))} /></Form.Item>
                <Form.Item name="sessionTimeout" label="Idle session timeout (minutes)"><InputNumber min={5} max={480} style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="maxSessions" label="Max concurrent sessions"><InputNumber min={1} max={10} style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="lockoutAttempts" label="Lock after failed attempts"><InputNumber min={3} max={10} style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="lockoutMinutes" label="Lockout duration (minutes)"><InputNumber min={5} max={1440} style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="passwordLength" label="Minimum password length"><InputNumber min={8} max={64} style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="passwordExpiry" label="Password expiry (days)"><InputNumber min={0} max={365} style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="sso" label="Allow SSO (SAML / OIDC)" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item name="rememberDevice" label="Allow “remember this device” for MFA" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item name="breakGlass" label="Enable break-glass emergency access (audited)" valuePropName="checked" className="span-2"><Switch /></Form.Item>
              </div>
              <Button type="primary" htmlType="submit">Save Policy</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <SectionCard title={<span className="flex items-center gap-2"><Globe size={15} /> IP allow-list</span>}>
            <Table size="small" pagination={false} rowKey="id" dataSource={ips} columns={[{ title: 'CIDR', dataIndex: 'cidr', render: (v: string) => <span className="mono">{v}</span> }, { title: 'Label', dataIndex: 'label' }, { title: '', dataIndex: 'enabled', render: (v: boolean, r) => <Switch size="small" checked={v} onChange={(c) => setIps((l) => l.map((x) => (x.id === r.id ? { ...x, enabled: c } : x)))} /> }]} />
            <Form form={ipForm} layout="inline" style={{ marginTop: 12, gap: 8 }} onFinish={(v) => { setIps((l) => [...l, { id: Date.now(), cidr: v.cidr, label: v.label ?? '', enabled: true }]); ipForm.resetFields(); }}>
              <Form.Item name="cidr" rules={[{ required: true, pattern: /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/, message: 'Enter a CIDR' }]}><Input placeholder="192.168.1.0/24" style={{ width: 160 }} /></Form.Item>
              <Form.Item name="label"><Input placeholder="Label" style={{ width: 140 }} /></Form.Item>
              <Button htmlType="submit" icon={<Plus size={14} />}>Add</Button>
            </Form>
          </SectionCard>
          <SectionCard title="Data access rules">
            <Descriptions size="small" column={1} items={[{ key: '1', label: 'Patient records', children: 'Restricted to treating team + assigned location' }, { key: '2', label: 'Behavioral health notes', children: 'Break-glass only for non-BH staff' }, { key: '3', label: 'Exports', children: 'Require Practice Manager approval' }, { key: '4', label: 'Audit retention', children: '7 years' }]} />
          </SectionCard>
        </Col>
      </Row>
    </>
  );
}

// ------------------------------------------------------------------ Audit logs (72)
export function AuditLogsPage() {
  const { data, loading } = useAsyncData(() => auditLogService.all().then((a) => [...a].sort((x, y) => y.timestamp.localeCompare(x.timestamp))));
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const user = useAppSelector((s) => s.auth.user);
  const columns: DataColumn<AuditLog>[] = [
    { key: 't', title: 'Timestamp', dataIndex: 'timestamp', hideable: false, render: (v: string) => formatDateTime(v), sorter: (a, b) => a.timestamp.localeCompare(b.timestamp), width: 190 },
    { key: 'u', title: 'User', dataIndex: 'user', render: (v: string) => <PrimaryCell title={v} avatar={v} /> },
    { key: 'a', title: 'Action', dataIndex: 'action', render: (v: string) => <Tag color={v === 'Delete' || v === 'Failed Login' ? 'red' : v === 'Export' || v === 'Print' ? 'orange' : v === 'Create' ? 'green' : 'default'}>{v}</Tag> },
    { key: 'e', title: 'Entity', render: (_, a) => <span>{a.entity} <span className="mono muted">{a.entityId}</span></span> },
    { key: 'ip', title: 'IP', dataIndex: 'ipAddress', render: (v: string) => <span className="mono">{v}</span> },
    { key: 'd', title: 'Details', dataIndex: 'details', ellipsis: true },
    { key: 'o', title: 'Outcome', dataIndex: 'outcome', render: (v: string) => <StatusTag status={v} /> },
  ];
  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Immutable record of who did what, when and from where" actions={<Button icon={<Download size={15} />} onClick={() => message.info(`Export requested by ${user?.fullName ?? 'user'} (mock)`)}>Export</Button>} />
      <MetricGrid>
        <MetricCard label="Events (30 days)" value={data?.length ?? 0} icon={<Activity size={20} />} loading={loading} />
        <MetricCard label="Failed logins" value={data?.filter((a) => a.action === 'Failed Login').length ?? 0} icon={<Lock size={20} />} tone="error" loading={loading} />
        <MetricCard label="Exports / prints" value={data?.filter((a) => a.action === 'Export' || a.action === 'Print').length ?? 0} icon={<Download size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Deletions" value={data?.filter((a) => a.action === 'Delete').length ?? 0} icon={<Trash2 size={20} />} tone="neutral" loading={loading} />
        <MetricCard label="Distinct users" value={new Set(data?.map((a) => a.user)).size} icon={<UserCog size={20} />} tone="info" loading={loading} />
      </MetricGrid>
      <DataTable<AuditLog> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['user', 'entity', 'entityId', 'details', 'ipAddress']} filters={[{ key: 'action', label: 'Action', options: ['Create', 'Update', 'Delete', 'View', 'Login', 'Logout', 'Export', 'Print', 'Failed Login'] }, { key: 'entity', label: 'Entity', options: ['Patient', 'Appointment', 'Medication', 'Prescription', 'User', 'Role', 'Configuration', 'Report', 'Session'] }, { key: 'outcome', label: 'Outcome', options: ['Success', 'Warning', 'Failure'] }]} onRowClick={setSelected} exportable pageSize={20} />
      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} title="Audit event">
        {selected && <KeyValue columns={1} items={[{ label: 'Timestamp', value: formatDateTime(selected.timestamp) }, { label: 'User', value: selected.user }, { label: 'Action', value: selected.action }, { label: 'Entity', value: `${selected.entity} ${selected.entityId}` }, { label: 'IP address', value: selected.ipAddress }, { label: 'Outcome', value: <StatusTag status={selected.outcome} /> }, { label: 'Details', value: selected.details }, { label: 'Event id', value: <span className="mono">{selected.id}</span> }]} />}
      </Modal>
    </>
  );
}

