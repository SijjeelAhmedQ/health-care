import { useState } from 'react';
import { Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Switch, Tag, TimePicker, Upload, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Building2, DoorOpen, Layers, MapPin, Package, Plus, Stethoscope, Wrench, Users, Clock, Phone, Mail, Globe, Upload as UploadIcon, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, MetricCard, MetricGrid, SectionCard, StatusTag, PrimaryCell, KeyValue, FormSection, FormGrid } from '@/components/common';
import { DataTable, type DataColumn } from '@/components/tables/DataTable';
import { BarsChart } from '@/components/charts';
import { useAsyncData } from '@/hooks';
import { departmentService, locationService, resourceService, roomService, serviceCatalogService, specialtyService, mockDb } from '@/services/api';
import type { Department, Location, Resource, Room, ServiceItem, Specialty } from '@/types/domain';
import { formatCurrency, formatDate } from '@/utils/format';
import { LOCATION_OPTIONS, DEPARTMENT_OPTIONS } from '@/registry/fieldRegistry';

// ------------------------------------------------------------------ Practice management (57)
export function PracticeManagementPage() {
  const navigate = useNavigate();
  const tiles = [
    { title: 'Practice Profile', desc: 'Legal entity, branding, contact details and hours', icon: <Building2 size={22} />, path: '/practice/profile' },
    { title: 'Locations', desc: `${mockDb.locations.length} clinics and telehealth hubs`, icon: <MapPin size={22} />, path: '/practice/locations' },
    { title: 'Departments', desc: `${mockDb.departmentList.length} departments`, icon: <Layers size={22} />, path: '/practice/departments' },
    { title: 'Specialties', desc: `${mockDb.specialtyList.length} specialties`, icon: <Stethoscope size={22} />, path: '/practice/specialties' },
    { title: 'Services', desc: `${mockDb.services.length} billable services & fee schedule`, icon: <Package size={22} />, path: '/practice/services' },
    { title: 'Rooms', desc: `${mockDb.rooms.length} rooms across locations`, icon: <DoorOpen size={22} />, path: '/practice/rooms' },
    { title: 'Resources', desc: `${mockDb.resources.length} equipment & assets`, icon: <Wrench size={22} />, path: '/practice/resources' },
  ];
  const byLoc = mockDb.locations.map((l) => ({ location: l.name.split(' ')[0], Rooms: l.rooms, Providers: l.providers }));
  return (
    <>
      <PageHeader title="Practice Management" subtitle="Configure the organisation: locations, departments, services and physical resources" />
      <MetricGrid>
        <MetricCard label="Locations" value={mockDb.locations.length} icon={<MapPin size={20} />} onClick={() => navigate('/practice/locations')} />
        <MetricCard label="Departments" value={mockDb.departmentList.length} icon={<Layers size={20} />} tone="info" onClick={() => navigate('/practice/departments')} />
        <MetricCard label="Providers" value={mockDb.providers.length} icon={<Users size={20} />} tone="success" onClick={() => navigate('/providers')} />
        <MetricCard label="Rooms available" value={mockDb.rooms.filter((r) => r.status === 'Available').length} icon={<DoorOpen size={20} />} tone="neutral" onClick={() => navigate('/practice/rooms')} />
      </MetricGrid>
      <div className="card-grid">
        <div className="col-8">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {tiles.map((t) => (
              <Card key={t.path} hoverable onClick={() => navigate(t.path)} styles={{ body: { padding: 16 } }}>
                <div className="flex gap-3"><div className="metric-card-icon" style={{ background: '#e6f3f7', color: '#0f6e8c' }}>{t.icon}</div><div><div style={{ fontWeight: 600 }}>{t.title}</div><div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{t.desc}</div></div></div>
              </Card>
            ))}
          </div>
        </div>
        <div className="col-4"><SectionCard title="Capacity by location"><BarsChart data={byLoc} xKey="location" series={[{ key: 'Rooms', label: 'Rooms' }, { key: 'Providers', label: 'Providers' }]} height={260} /></SectionCard></div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Practice profile (58)
export function PracticeProfilePage() {
  const [form] = Form.useForm();
  return (
    <>
      <PageHeader title="Practice Profile" subtitle="Organisation identity, legal registration, contact channels and operating hours" />
      <Row gutter={20}>
        <Col xs={24} lg={16}>
          <Card>
            <Form form={form} layout="vertical" onFinish={() => message.success('Practice profile saved')} initialValues={{ name: 'CareFlow Medical Group', legalName: 'CareFlow Medical Group, PLLC', taxId: '74-3312890', npi: '1932456789', type: 'Multi-specialty group', phone: '(512) 555-0100', fax: '(512) 555-0101', email: 'hello@careflow.health', website: 'https://careflow.health', line1: '1200 Riverside Dr', city: 'Austin', state: 'TX', zip: '78701', country: 'USA', timezone: 'America/Chicago', currency: 'USD', openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], portal: true, onlineBooking: true }}>
              <FormSection title="Identity">
                <FormGrid>
                  <Form.Item name="name" label="Practice name" className="span-2" rules={[{ required: true }]}><Input /></Form.Item>
                  <Form.Item name="legalName" label="Legal name" className="span-2"><Input /></Form.Item>
                  <Form.Item name="type" label="Practice type"><Select options={['Solo practice', 'Single-specialty group', 'Multi-specialty group', 'FQHC', 'Hospital-owned'].map((v) => ({ value: v, label: v }))} /></Form.Item>
                  <Form.Item name="taxId" label="Tax ID (EIN)"><Input /></Form.Item>
                  <Form.Item name="npi" label="Group NPI"><Input /></Form.Item>
                  <Form.Item name="logo" label="Logo"><Upload showUploadList={false} beforeUpload={() => false}><Button icon={<UploadIcon size={14} />}>Upload</Button></Upload></Form.Item>
                </FormGrid>
              </FormSection>
              <FormSection title="Contact">
                <FormGrid>
                  <Form.Item name="phone" label="Main phone"><Input prefix={<Phone size={13} className="muted" />} /></Form.Item>
                  <Form.Item name="fax" label="Fax"><Input /></Form.Item>
                  <Form.Item name="email" label="Email"><Input prefix={<Mail size={13} className="muted" />} /></Form.Item>
                  <Form.Item name="website" label="Website"><Input prefix={<Globe size={13} className="muted" />} /></Form.Item>
                  <Form.Item name="line1" label="Address" className="span-2"><Input /></Form.Item>
                  <Form.Item name="city" label="City"><Input /></Form.Item>
                  <Form.Item name="state" label="State"><Input /></Form.Item>
                  <Form.Item name="zip" label="Postal code"><Input /></Form.Item>
                  <Form.Item name="country" label="Country"><Input /></Form.Item>
                </FormGrid>
              </FormSection>
              <FormSection title="Operations">
                <FormGrid>
                  <Form.Item name="timezone" label="Time zone"><Select options={['America/Chicago', 'America/New_York', 'America/Denver', 'America/Los_Angeles'].map((v) => ({ value: v, label: v }))} /></Form.Item>
                  <Form.Item name="currency" label="Currency"><Select options={['USD', 'EUR', 'GBP', 'PKR'].map((v) => ({ value: v, label: v }))} /></Form.Item>
                  <Form.Item name="openDays" label="Open days" className="span-2"><Select mode="multiple" options={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((v) => ({ value: v, label: v }))} /></Form.Item>
                  <Form.Item name="hours" label="Default hours" className="span-2"><TimePicker.RangePicker format="h:mm A" use12Hours style={{ width: '100%' }} /></Form.Item>
                  <Form.Item name="portal" label="Patient portal" valuePropName="checked"><Switch /></Form.Item>
                  <Form.Item name="onlineBooking" label="Online booking" valuePropName="checked"><Switch /></Form.Item>
                </FormGrid>
              </FormSection>
              <div className="sticky-actions"><Button onClick={() => form.resetFields()}>Reset</Button><Button type="primary" htmlType="submit">Save Profile</Button></div>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <SectionCard title="Summary"><KeyValue columns={1} items={[{ label: 'Locations', value: mockDb.locations.length }, { label: 'Departments', value: mockDb.departmentList.length }, { label: 'Providers', value: mockDb.providers.length }, { label: 'Staff accounts', value: mockDb.users.length }, { label: 'Active patients', value: mockDb.patients.filter((p) => p.status === 'Active').length }]} /></SectionCard>
          <SectionCard title="Accreditation"><div className="flex gap-2 wrap"><Tag color="green">HIPAA compliant</Tag><Tag color="blue">NCQA PCMH Level 3</Tag><Tag color="purple">Joint Commission</Tag></div><p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Last audit: {formatDate('2026-04-12')}</p></SectionCard>
        </Col>
      </Row>
    </>
  );
}

// ------------------------------------------------------------------ Locations (59)
export function LocationsPage() {
  const { data, loading, reload } = useAsyncData(() => locationService.all());
  const [editing, setEditing] = useState<Location | null | 'new'>(null);
  const [form] = Form.useForm();
  const columns: DataColumn<Location>[] = [
    { key: 'n', title: 'Location', dataIndex: 'name', hideable: false, render: (v: string, l) => <PrimaryCell title={v} subtitle={`${l.code} · ${l.type}`} /> },
    { key: 'a', title: 'Address', render: (_, l) => `${l.address.line1}, ${l.address.city}, ${l.address.state} ${l.address.postalCode}`, ellipsis: true },
    { key: 'p', title: 'Phone', dataIndex: 'phone' },
    { key: 'h', title: 'Hours', dataIndex: 'openingHours', ellipsis: true },
    { key: 'm', title: 'Manager', dataIndex: 'manager' },
    { key: 'r', title: 'Rooms', dataIndex: 'rooms', align: 'right' },
    { key: 'pr', title: 'Providers', dataIndex: 'providers', align: 'right' },
    { key: 's', title: 'Active', dataIndex: 'isActive', render: (v: boolean, l) => <Switch size="small" checked={v} onChange={async (c) => { await locationService.update(l.id, { isActive: c }); reload(); }} /> },
    { key: 'x', title: '', width: 60, render: (_, l) => <Button type="text" size="small" icon={<Pencil size={14} />} onClick={() => { setEditing(l); form.setFieldsValue({ ...l, ...l.address }); }} /> },
  ];
  return (
    <>
      <PageHeader title="Locations" subtitle="Clinics, satellite sites and virtual care hubs" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => { setEditing('new'); form.resetFields(); }}>Add Location</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 20 }}>
        {(data ?? []).map((l) => <Card key={l.id} size="small" styles={{ body: { padding: 14 } }}><div className="flex gap-3"><div className="metric-card-icon" style={{ background: '#e6f3f7', color: '#0f6e8c' }}><Building2 size={20} /></div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{l.name}</div><div className="muted" style={{ fontSize: 12 }}>{l.type} · {l.address.city}</div><div className="flex gap-2" style={{ marginTop: 8, fontSize: 12 }}><Tag style={{ margin: 0 }}>{l.rooms} rooms</Tag><Tag style={{ margin: 0 }}>{l.providers} providers</Tag><StatusTag status={l.isActive ? 'Active' : 'Inactive'} /></div></div></div></Card>)}
      </div>
      <DataTable<Location> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['name', 'code', 'manager']} filters={[{ key: 'type', label: 'Type', options: ['Main Clinic', 'Satellite', 'Hospital', 'Telehealth Hub'] }]} pageSize={10} />
      <Modal title={editing === 'new' ? 'Add Location' : 'Edit Location'} open={!!editing} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Save" width={640}>
        <Form form={form} layout="vertical" onFinish={async (v) => { const base = { name: v.name, code: v.code, type: v.type, address: { line1: v.line1, city: v.city, state: v.state, postalCode: v.postalCode, country: 'USA' }, phone: v.phone ?? '', email: v.email ?? '', timezone: 'America/Chicago', openingHours: v.openingHours ?? '', manager: v.manager ?? '', rooms: v.rooms ?? 0, providers: v.providers ?? 0, isActive: true }; if (editing === 'new') await locationService.create(base); else if (editing) await locationService.update(editing.id, base); setEditing(null); message.success('Saved'); reload(); }}>
          <div className="form-grid cols-2">
            <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input maxLength={4} /></Form.Item>
            <Form.Item name="type" label="Type" rules={[{ required: true }]}><Select options={['Main Clinic', 'Satellite', 'Hospital', 'Telehealth Hub'].map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Form.Item name="manager" label="Manager"><Input /></Form.Item>
            <Form.Item name="line1" label="Address" className="span-2"><Input /></Form.Item>
            <Form.Item name="city" label="City"><Input /></Form.Item>
            <Form.Item name="state" label="State"><Input /></Form.Item>
            <Form.Item name="postalCode" label="Postal code"><Input /></Form.Item>
            <Form.Item name="phone" label="Phone"><Input /></Form.Item>
            <Form.Item name="email" label="Email"><Input /></Form.Item>
            <Form.Item name="openingHours" label="Opening hours"><Input placeholder="Mon–Fri 8:00–17:00" /></Form.Item>
            <Form.Item name="rooms" label="Rooms"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="providers" label="Providers"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Departments (60)
export function DepartmentsPage() {
  const { data, loading, reload } = useAsyncData(() => departmentService.all());
  const [editing, setEditing] = useState<Department | null | 'new'>(null);
  const [form] = Form.useForm();
  const columns: DataColumn<Department>[] = [
    { key: 'n', title: 'Department', dataIndex: 'name', hideable: false, render: (v: string, d) => <PrimaryCell title={v} subtitle={d.code} /> },
    { key: 'h', title: 'Head', dataIndex: 'head' },
    { key: 'l', title: 'Location', dataIndex: 'locationName', ellipsis: true },
    { key: 'p', title: 'Providers', dataIndex: 'providers', align: 'right' },
    { key: 's', title: 'Staff', dataIndex: 'staff', align: 'right' },
    { key: 'e', title: 'Ext.', dataIndex: 'extension' },
    { key: 'd', title: 'Description', dataIndex: 'description', ellipsis: true, defaultHidden: true },
    { key: 'a', title: 'Active', dataIndex: 'isActive', render: (v: boolean, d) => <Switch size="small" checked={v} onChange={async (c) => { await departmentService.update(d.id, { isActive: c }); reload(); }} /> },
    { key: 'x', title: '', width: 60, render: (_, d) => <Button type="text" size="small" icon={<Pencil size={14} />} onClick={() => { setEditing(d); form.setFieldsValue(d); }} /> },
  ];
  return (
    <>
      <PageHeader title="Departments" subtitle="Clinical and administrative departments with their leadership" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => { setEditing('new'); form.resetFields(); }}>Add Department</Button>} />
      <DataTable<Department> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['name', 'head', 'code']} filters={[{ key: 'locationName', label: 'Location', options: LOCATION_OPTIONS }]} pageSize={12} />
      <Modal title={editing === 'new' ? 'Add Department' : 'Edit Department'} open={!!editing} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={async (v) => { const base = { ...v, providers: v.providers ?? 0, staff: v.staff ?? 0, isActive: true, description: v.description ?? '' }; if (editing === 'new') await departmentService.create(base); else if (editing) await departmentService.update(editing.id, base); setEditing(null); reload(); }}>
          <div className="form-grid cols-2">
            <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input maxLength={4} /></Form.Item>
            <Form.Item name="head" label="Department head"><Select showSearch options={mockDb.providers.map((p) => ({ value: p.fullName, label: p.fullName }))} /></Form.Item>
            <Form.Item name="locationName" label="Location"><Select options={LOCATION_OPTIONS.map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Form.Item name="extension" label="Phone extension"><Input /></Form.Item>
            <Form.Item name="providers" label="Providers"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="staff" label="Support staff"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="description" label="Description" className="span-2"><Input.TextArea rows={2} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Specialties (61)
export function SpecialtiesPage() {
  const { data, loading, reload } = useAsyncData(() => specialtyService.all());
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const columns: DataColumn<Specialty>[] = [
    { key: 'n', title: 'Specialty', dataIndex: 'name', hideable: false, render: (v: string, s) => <PrimaryCell title={v} subtitle={s.code} /> },
    { key: 'c', title: 'Category', dataIndex: 'category', render: (v: string) => <Tag>{v}</Tag> },
    { key: 'p', title: 'Providers', dataIndex: 'providers', align: 'right', sorter: (a, b) => a.providers - b.providers },
    { key: 'd', title: 'Default appt.', dataIndex: 'defaultAppointmentMinutes', render: (v: number) => `${v} min` },
    { key: 'a', title: 'Active', dataIndex: 'isActive', render: (v: boolean, s) => <Switch size="small" checked={v} onChange={async (c) => { await specialtyService.update(s.id, { isActive: c }); reload(); }} /> },
  ];
  return (
    <>
      <PageHeader title="Specialties" subtitle="Clinical specialties offered and their scheduling defaults" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Specialty</Button>} />
      <DataTable<Specialty> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['name', 'code']} filters={[{ key: 'category', label: 'Category', options: ['Primary Care', 'Surgical', 'Medical', 'Diagnostic', 'Allied Health'] }]} pageSize={15} />
      <Modal title="Add Specialty" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={async (v) => { await specialtyService.create({ ...v, providers: 0, isActive: true }); setOpen(false); form.resetFields(); reload(); }} initialValues={{ defaultAppointmentMinutes: 30, category: 'Medical' }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input maxLength={4} /></Form.Item>
          <Form.Item name="category" label="Category"><Select options={['Primary Care', 'Surgical', 'Medical', 'Diagnostic', 'Allied Health'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="defaultAppointmentMinutes" label="Default appointment length (min)"><InputNumber min={5} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Services (62)
export function ServicesPage() {
  const { data, loading, reload } = useAsyncData(() => serviceCatalogService.all());
  const [editing, setEditing] = useState<ServiceItem | null | 'new'>(null);
  const [form] = Form.useForm();
  const columns: DataColumn<ServiceItem>[] = [
    { key: 'n', title: 'Service', dataIndex: 'name', hideable: false, render: (v: string, s) => <PrimaryCell title={v} subtitle={`${s.code} · CPT ${s.cptCode}`} /> },
    { key: 'c', title: 'Category', dataIndex: 'category' },
    { key: 'd', title: 'Department', dataIndex: 'department', ellipsis: true },
    { key: 'dur', title: 'Duration', dataIndex: 'durationMinutes', render: (v: number) => `${v} min`, align: 'right' },
    { key: 'p', title: 'Price', dataIndex: 'price', render: (v: number) => formatCurrency(v), align: 'right', sorter: (a, b) => a.price - b.price },
    { key: 'auth', title: 'Prior auth', dataIndex: 'requiresAuth', render: (v: boolean) => (v ? <Tag color="orange">Required</Tag> : '—') },
    { key: 'a', title: 'Active', dataIndex: 'isActive', render: (v: boolean, s) => <Switch size="small" checked={v} onChange={async (c) => { await serviceCatalogService.update(s.id, { isActive: c }); reload(); }} /> },
    { key: 'x', title: '', width: 90, render: (_, s) => <><Button type="text" size="small" icon={<Pencil size={14} />} onClick={() => { setEditing(s); form.setFieldsValue(s); }} /><Button type="text" size="small" danger icon={<Trash2 size={14} />} onClick={() => Modal.confirm({ title: `Remove ${s.name}?`, okButtonProps: { danger: true }, onOk: async () => { await serviceCatalogService.remove(s.id); reload(); } })} /></> },
  ];
  return (
    <>
      <PageHeader title="Services" subtitle="Service catalogue, CPT mapping and fee schedule" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => { setEditing('new'); form.resetFields(); }}>Add Service</Button>} />
      <MetricGrid>
        <MetricCard label="Services" value={data?.length ?? 0} icon={<Package size={20} />} loading={loading} />
        <MetricCard label="Avg. price" value={formatCurrency((data?.reduce((s, x) => s + x.price, 0) ?? 0) / Math.max(1, data?.length ?? 1))} icon={<Layers size={20} />} tone="info" loading={loading} />
        <MetricCard label="Require prior auth" value={data?.filter((s) => s.requiresAuth).length ?? 0} icon={<Clock size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Categories" value={new Set(data?.map((s) => s.category)).size} icon={<Stethoscope size={20} />} tone="neutral" loading={loading} />
      </MetricGrid>
      <DataTable<ServiceItem> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['name', 'code', 'cptCode', 'category']} filters={[{ key: 'category', label: 'Category', options: [...new Set(mockDb.services.map((s) => s.category))] }]} exportable pageSize={15} />
      <Modal title={editing === 'new' ? 'Add Service' : 'Edit Service'} open={!!editing} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={async (v) => { const base = { ...v, taxable: false, isActive: true, requiresAuth: !!v.requiresAuth }; if (editing === 'new') await serviceCatalogService.create(base); else if (editing) await serviceCatalogService.update(editing.id, base); setEditing(null); reload(); }}>
          <div className="form-grid cols-2">
            <Form.Item name="name" label="Service name" className="span-2" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="code" label="Internal code" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="cptCode" label="CPT code" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="category" label="Category"><Select options={['Evaluation & Management', 'Preventive', 'Telehealth', 'Diagnostics', 'Immunization', 'Laboratory', 'Procedure', 'Behavioral Health'].map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Form.Item name="department" label="Department"><Select options={DEPARTMENT_OPTIONS.map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Form.Item name="durationMinutes" label="Duration (min)"><InputNumber min={5} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="price" label="Price (USD)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="requiresAuth" label="Requires prior authorization" valuePropName="checked"><Switch /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Rooms (63)
export function RoomsPage() {
  const { data, loading, reload } = useAsyncData(() => roomService.all());
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const columns: DataColumn<Room>[] = [
    { key: 'n', title: 'Room', dataIndex: 'name', hideable: false, render: (v: string, r) => <PrimaryCell title={v} subtitle={`${r.code} · Floor ${r.floor}`} /> },
    { key: 't', title: 'Type', dataIndex: 'type' },
    { key: 'l', title: 'Location', dataIndex: 'locationName', ellipsis: true },
    { key: 'c', title: 'Capacity', dataIndex: 'capacity', align: 'right' },
    { key: 'e', title: 'Equipment', dataIndex: 'equipment', render: (e: string[]) => e.map((x) => <Tag key={x} style={{ marginBottom: 2 }}>{x}</Tag>) },
    { key: 's', title: 'Status', dataIndex: 'status', render: (v: Room['status'], r) => <Select size="small" value={v} style={{ width: 130 }} onChange={async (s) => { await roomService.update(r.id, { status: s }); reload(); }} options={['Available', 'Occupied', 'Cleaning', 'Maintenance'].map((o) => ({ value: o, label: <StatusTag status={o} /> }))} /> },
  ];
  return (
    <>
      <PageHeader title="Rooms" subtitle="Exam, procedure and consultation rooms with live status" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Room</Button>} />
      <MetricGrid>
        {(['Available', 'Occupied', 'Cleaning', 'Maintenance'] as const).map((s) => <MetricCard key={s} label={s} value={data?.filter((r) => r.status === s).length ?? 0} icon={<DoorOpen size={20} />} tone={s === 'Available' ? 'success' : s === 'Occupied' ? 'info' : s === 'Cleaning' ? 'warning' : 'error'} loading={loading} />)}
      </MetricGrid>
      <DataTable<Room> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['name', 'code', 'locationName']} filters={[{ key: 'type', label: 'Type', options: ['Exam Room', 'Procedure Room', 'Consultation', 'Lab', 'Imaging', 'Waiting Area', 'Office'] }, { key: 'locationName', label: 'Location', options: LOCATION_OPTIONS }, { key: 'status', label: 'Status', options: ['Available', 'Occupied', 'Cleaning', 'Maintenance'] }]} pageSize={15} />
      <Modal title="Add Room" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={async (v) => { await roomService.create({ ...v, equipment: v.equipment ?? [], status: 'Available' }); setOpen(false); form.resetFields(); reload(); }} initialValues={{ type: 'Exam Room', capacity: 3, floor: '1' }}>
          <Form.Item name="name" label="Room name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="locationName" label="Location" rules={[{ required: true }]}><Select options={LOCATION_OPTIONS.map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="type" label="Type"><Select options={['Exam Room', 'Procedure Room', 'Consultation', 'Lab', 'Imaging', 'Waiting Area', 'Office'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="floor" label="Floor"><Input /></Form.Item>
          <Form.Item name="capacity" label="Capacity"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="equipment" label="Equipment"><Select mode="tags" options={['Exam table', 'Otoscope', 'BP monitor', 'ECG', 'Ultrasound', 'Scale', 'Computer', 'Spirometer'].map((v) => ({ value: v, label: v }))} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Resources (64)
export function ResourcesPage() {
  const { data, loading, reload } = useAsyncData(() => resourceService.all());
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const columns: DataColumn<Resource>[] = [
    { key: 'n', title: 'Resource', dataIndex: 'name', hideable: false, render: (v: string, r) => <PrimaryCell title={v} subtitle={`${r.type} · SN ${r.serialNumber}`} /> },
    { key: 'l', title: 'Location', dataIndex: 'locationName', ellipsis: true },
    { key: 'a', title: 'Assigned to', dataIndex: 'assignedTo', render: (v?: string) => v ?? <span className="muted">Unassigned</span> },
    { key: 'w', title: 'Warranty', dataIndex: 'warrantyUntil', render: (v: string) => <span style={{ color: v < new Date().toISOString().slice(0, 10) ? '#d64545' : undefined }}>{formatDate(v)}</span> },
    { key: 'ls', title: 'Last service', dataIndex: 'lastService', render: (v: string) => formatDate(v), defaultHidden: true },
    { key: 'ns', title: 'Next service', dataIndex: 'nextService', render: (v: string) => formatDate(v), sorter: (a, b) => a.nextService.localeCompare(b.nextService) },
    { key: 's', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'x', title: '', width: 120, render: (_, r) => <Button size="small" onClick={async () => { await resourceService.update(r.id, { lastService: new Date().toISOString().slice(0, 10), status: 'Available' }); message.success('Service logged'); reload(); }}>Log service</Button> },
  ];
  return (
    <>
      <PageHeader title="Resources" subtitle="Medical equipment, devices, vehicles and licenses" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Resource</Button>} />
      <MetricGrid>
        <MetricCard label="Total assets" value={data?.length ?? 0} icon={<Wrench size={20} />} loading={loading} />
        <MetricCard label="In maintenance" value={data?.filter((r) => r.status === 'Maintenance').length ?? 0} icon={<Clock size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Service due (30 days)" value={data?.filter((r) => r.nextService <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)).length ?? 0} icon={<Package size={20} />} tone="error" loading={loading} />
        <MetricCard label="Warranty expired" value={data?.filter((r) => r.warrantyUntil < new Date().toISOString().slice(0, 10)).length ?? 0} icon={<Layers size={20} />} tone="neutral" loading={loading} />
      </MetricGrid>
      <DataTable<Resource> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['name', 'serialNumber', 'assignedTo']} filters={[{ key: 'type', label: 'Type', options: ['Equipment', 'Vehicle', 'Device', 'Software License'] }, { key: 'status', label: 'Status', options: ['Available', 'In Use', 'Maintenance', 'Retired'] }, { key: 'locationName', label: 'Location', options: LOCATION_OPTIONS }]} exportable pageSize={12} />
      <Modal title="Add Resource" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={async (v) => { const today = new Date().toISOString().slice(0, 10); await resourceService.create({ ...v, status: 'Available', purchaseDate: today, lastService: today, nextService: v.nextService ?? today, warrantyUntil: v.warrantyUntil ?? today }); setOpen(false); form.resetFields(); reload(); }} initialValues={{ type: 'Equipment' }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="type" label="Type"><Select options={['Equipment', 'Vehicle', 'Device', 'Software License'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="serialNumber" label="Serial number" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="locationName" label="Location" rules={[{ required: true }]}><Select options={LOCATION_OPTIONS.map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="assignedTo" label="Assigned to"><Select allowClear showSearch options={mockDb.providers.map((p) => ({ value: p.fullName, label: p.fullName }))} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
