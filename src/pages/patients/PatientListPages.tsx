import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, DatePicker, Dropdown, Form, Input, Row, Select, Space, Tag, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarPlus, Eye, MoreHorizontal, Pencil, Search, UserPlus, Users, UserX, Activity, Trash2 } from 'lucide-react';
import { PageHeader, MetricCard, MetricGrid, StatusTag, PrimaryCell, EmptyState } from '@/components/common';
import { DataTable, type DataColumn } from '@/components/tables/DataTable';
import { PatientFormCard } from '@/components/forms/PatientForm';
import { useAppDispatch, useAppSelector } from '@/store';
import { deletePatient, patientSelectors, setCurrentPatient, setLastSearch } from '@/store/slices/patientSlice';
import type { Patient } from '@/types/domain';
import { formatDate } from '@/utils/format';
import { GENDER_OPTIONS, INSURER_OPTIONS } from '@/registry/fieldRegistry';
import { providerSelectors } from '@/store/slices/providerSlice';

function usePatientColumns(onOpen: (p: Patient) => void): DataColumn<Patient>[] {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  return [
    { key: 'name', title: 'Patient', dataIndex: 'fullName', hideable: false, sorter: (a, b) => a.lastName.localeCompare(b.lastName), render: (_, p) => <PrimaryCell title={p.fullName} subtitle={p.mrn} avatar={p.fullName} /> },
    { key: 'age', title: 'Age / Sex', render: (_, p) => `${p.age}y · ${p.gender[0]}`, sorter: (a, b) => a.age - b.age, width: 100 },
    { key: 'dob', title: 'DOB', dataIndex: 'dateOfBirth', render: (v: string) => formatDate(v), defaultHidden: true },
    { key: 'phone', title: 'Phone', dataIndex: 'phone' },
    { key: 'email', title: 'Email', dataIndex: 'email', defaultHidden: true, ellipsis: true },
    { key: 'provider', title: 'Primary Provider', dataIndex: 'primaryProviderName', ellipsis: true },
    { key: 'insurance', title: 'Insurance', dataIndex: 'insuranceProvider', ellipsis: true },
    { key: 'lastVisit', title: 'Last Visit', dataIndex: 'lastVisit', render: (v: string) => formatDate(v), sorter: (a, b) => (a.lastVisit ?? '').localeCompare(b.lastVisit ?? '') },
    { key: 'next', title: 'Next Appt', dataIndex: 'nextAppointment', render: (v?: string) => (v ? formatDate(v) : <span className="muted">—</span>) },
    { key: 'risk', title: 'Risk', dataIndex: 'riskLevel', render: (v: string) => <StatusTag status={v} />, width: 90 },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} />, width: 100 },
    {
      key: 'actions', title: '', width: 56, fixed: 'right', hideable: false,
      render: (_, p) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'open', icon: <Eye size={14} />, label: 'Open profile', onClick: () => onOpen(p) },
              { key: 'edit', icon: <Pencil size={14} />, label: 'Edit demographics', onClick: () => { dispatch(setCurrentPatient(p.id)); navigate(`/patients/${p.id}/demographics`); } },
              { key: 'appt', icon: <CalendarPlus size={14} />, label: 'Book appointment', onClick: () => { dispatch(setCurrentPatient(p.id)); navigate(`/appointments/create?patient=${p.id}`); } },
              { type: 'divider' },
              { key: 'delete', icon: <Trash2 size={14} />, label: 'Delete patient', danger: true, onClick: () => { void dispatch(deletePatient(p.id)); message.success('Patient deleted'); } },
            ],
          }}
        >
          <Button type="text" size="small" icon={<MoreHorizontal size={16} />} onClick={(e) => e.stopPropagation()} aria-label="Row actions" />
        </Dropdown>
      ),
    },
  ];
}

export function PatientListPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const patients = useAppSelector(patientSelectors.selectAll);
  const loading = useAppSelector((s) => s.patients.status === 'loading');
  const open = (p: Patient) => { dispatch(setCurrentPatient(p.id)); navigate(`/patients/${p.id}`); };
  const columns = usePatientColumns(open);
  const stats = useMemo(() => ({ active: patients.filter((p) => p.status === 'Active').length, high: patients.filter((p) => p.riskLevel === 'High').length, newMonth: patients.filter((p) => p.registeredAt >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).length }), [patients]);
  return (
    <>
      <PageHeader title="Patient List" subtitle={`${patients.length} patients across all locations`} actions={<><Button icon={<Search size={15} />} onClick={() => navigate('/patients/search')}>Advanced Search</Button><Button type="primary" icon={<UserPlus size={15} />} onClick={() => navigate('/patients/register')}>Register Patient</Button></>} />
      <MetricGrid>
        <MetricCard label="Total patients" value={patients.length} icon={<Users size={20} />} loading={loading} />
        <MetricCard label="Active" value={stats.active} icon={<Activity size={20} />} tone="success" loading={loading} />
        <MetricCard label="High risk" value={stats.high} icon={<UserX size={20} />} tone="error" loading={loading} />
        <MetricCard label="New (30 days)" value={stats.newMonth} icon={<UserPlus size={20} />} tone="info" loading={loading} />
      </MetricGrid>
      <DataTable<Patient>
        rowKey="id" columns={columns} data={patients} loading={loading} searchKeys={['fullName', 'mrn', 'phone', 'email']} searchPlaceholder="Search name, MRN, phone…"
        filters={[{ key: 'status', label: 'Status', options: ['Active', 'Inactive', 'Pending', 'Deceased'] }, { key: 'riskLevel', label: 'Risk', options: ['Low', 'Medium', 'High'] }, { key: 'gender', label: 'Gender', options: GENDER_OPTIONS }, { key: 'insuranceProvider', label: 'Insurance', options: INSURER_OPTIONS }]}
        onRowClick={open} selectable exportable pageSize={15}
        emptyTitle="No patients yet" emptyAction={<Button type="primary" onClick={() => navigate('/patients/register')}>Register the first patient</Button>}
      />
    </>
  );
}

export function PatientSearchPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [params, setParams] = useSearchParams();
  const patients = useAppSelector(patientSelectors.selectAll);
  const providers = useAppSelector(providerSelectors.selectAll);
  const lastSearch = useAppSelector((s) => s.patients.lastSearch);
  const [form] = Form.useForm();
  const [criteria, setCriteria] = useState<Record<string, string | undefined>>({ q: params.get('q') ?? lastSearch ?? '' });

  useEffect(() => {
    const q = params.get('q');
    if (q !== null) {
      setCriteria((c) => ({ ...c, q }));
      form.setFieldValue('q', q);
    }
  }, [params, form]);

  const results = useMemo(() => {
    const q = (criteria.q ?? '').trim().toLowerCase();
    const anyCriteria = q || criteria.gender || criteria.provider || criteria.insurance || criteria.status || criteria.dob || criteria.city;
    if (!anyCriteria) return [];
    return patients.filter((p) => {
      if (q && !(p.fullName.toLowerCase().includes(q) || p.mrn.toLowerCase().includes(q) || p.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '#') || p.email.toLowerCase().includes(q))) return false;
      if (criteria.gender && p.gender !== criteria.gender) return false;
      if (criteria.provider && p.primaryProviderName !== criteria.provider) return false;
      if (criteria.insurance && p.insuranceProvider !== criteria.insurance) return false;
      if (criteria.status && p.status !== criteria.status) return false;
      if (criteria.dob && p.dateOfBirth !== criteria.dob) return false;
      if (criteria.city && !p.address.city.toLowerCase().includes(criteria.city.toLowerCase())) return false;
      return true;
    });
  }, [patients, criteria]);

  const open = (p: Patient) => { dispatch(setCurrentPatient(p.id)); navigate(`/patients/${p.id}`); };
  const columns = usePatientColumns(open);

  return (
    <>
      <PageHeader title="Patient Search" subtitle="Find patients by name, MRN, phone, date of birth or demographics" actions={<Button type="primary" icon={<UserPlus size={15} />} onClick={() => navigate('/patients/register')}>Register Patient</Button>} />
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" initialValues={{ q: criteria.q }} onValuesChange={(_, all) => { const next = { ...all, dob: all.dob ? all.dob.format('YYYY-MM-DD') : undefined }; setCriteria(next); dispatch(setLastSearch(all.q ?? '')); if (all.q !== params.get('q')) setParams(all.q ? { q: all.q } : {}, { replace: true }); }}>
          <Row gutter={16}>
            <Col xs={24} md={12} lg={8}><Form.Item name="q" label="Name, MRN, phone or email"><Input allowClear prefix={<Search size={15} className="muted" />} placeholder="e.g. John Smith or MRN-102934" autoFocus /></Form.Item></Col>
            <Col xs={12} md={6} lg={4}><Form.Item name="dob" label="Date of birth"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12} md={6} lg={3}><Form.Item name="gender" label="Gender"><Select allowClear options={GENDER_OPTIONS.map((g) => ({ value: g, label: g }))} /></Form.Item></Col>
            <Col xs={12} md={8} lg={4}><Form.Item name="provider" label="Primary provider"><Select allowClear showSearch options={providers.map((p) => ({ value: p.fullName, label: p.fullName }))} /></Form.Item></Col>
            <Col xs={12} md={8} lg={3}><Form.Item name="insurance" label="Insurance"><Select allowClear options={INSURER_OPTIONS.map((g) => ({ value: g, label: g }))} /></Form.Item></Col>
            <Col xs={12} md={8} lg={2}><Form.Item name="status" label="Status"><Select allowClear options={['Active', 'Inactive', 'Pending'].map((g) => ({ value: g, label: g }))} /></Form.Item></Col>
          </Row>
          <Space>
            <Button onClick={() => { form.resetFields(); setCriteria({}); setParams({}); }}>Clear</Button>
            <span className="muted" style={{ fontSize: 13 }}>{results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Enter search criteria to find patients'}</span>
            {criteria.q && <Tag>“{criteria.q}”</Tag>}
          </Space>
        </Form>
      </Card>
      {results.length || Object.values(criteria).some(Boolean) ? (
        <DataTable<Patient> rowKey="id" columns={columns} data={results} onRowClick={open} pageSize={10} emptyTitle="No patients match" emptyDescription="Check the spelling or broaden your criteria." emptyAction={<Button type="primary" onClick={() => navigate('/patients/register')}>Register new patient</Button>} />
      ) : (
        <Card><EmptyState icon={<Search size={44} strokeWidth={1.4} />} title="Search for a patient" description='Try the voice assistant: "Search patient Ahmed Khan" or "Open John Smith".' /></Card>
      )}
    </>
  );
}

export function PatientRegistrationPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  return (
    <>
      <PageHeader title="Patient Registration" subtitle="Create a new patient record. Fields marked optional can be completed later." />
      <PatientFormCard onSaved={(p) => { dispatch(setCurrentPatient(p.id)); navigate(`/patients/${p.id}`); }} />
    </>
  );
}
