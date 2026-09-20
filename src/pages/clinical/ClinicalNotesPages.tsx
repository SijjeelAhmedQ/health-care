import { useMemo, useState } from 'react';
import { Button, Card, Col, Form, Input, List, Modal, Progress, Row, Select, Steps, Tag, Timeline, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Clock, FileSignature, Plus, Stethoscope, Users, Target } from 'lucide-react';
import { PageHeader, MetricCard, MetricGrid, SectionCard, StatusTag, PrimaryCell, Avatar, EmptyState } from '@/components/common';
import { DataTable, type DataColumn } from '@/components/tables/DataTable';
import { BarsChart } from '@/components/charts';
import { useAppSelector } from '@/store';
import { patientSelectors } from '@/store/slices/patientSlice';
import { useAsyncData } from '@/hooks';
import { consultationService, noteService, mockDb } from '@/services/api';
import type { ClinicalNote, Consultation } from '@/types/domain';
import { dayjs, formatDate, formatDateTime } from '@/utils/format';

// ------------------------------------------------------------------ Consultation dashboard
export function ConsultationDashboardPage() {
  const navigate = useNavigate();
  const { data, loading } = useAsyncData(() => consultationService.all());
  const today = dayjs().format('YYYY-MM-DD');
  const stats = useMemo(() => ({ today: data?.filter((c) => c.date === today).length ?? 0, inProgress: data?.filter((c) => c.status === 'In Progress').length ?? 0, pending: data?.filter((c) => c.status === 'Pending Sign-off').length ?? 0, avg: Math.round((data?.reduce((s, c) => s + (c.durationMinutes ?? 0), 0) ?? 0) / Math.max(1, data?.length ?? 1)) }), [data, today]);
  const byProvider = useMemo(() => Object.entries((data ?? []).reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.providerName.replace('Dr. ', '')]: (acc[c.providerName.replace('Dr. ', '')] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([provider, count]) => ({ provider, count })), [data]);
  const columns: DataColumn<Consultation>[] = [
    { key: 'p', title: 'Patient', dataIndex: 'patientName', render: (v: string, r) => <PrimaryCell title={v} subtitle={r.chiefComplaint} avatar={v} /> },
    { key: 'prov', title: 'Provider', dataIndex: 'providerName' },
    { key: 'd', title: 'Date', dataIndex: 'date', render: (v: string) => formatDate(v), sorter: (a, b) => a.date.localeCompare(b.date), defaultSortOrder: 'descend' },
    { key: 'dx', title: 'Diagnosis', dataIndex: 'diagnosis', ellipsis: true },
    { key: 'dur', title: 'Duration', dataIndex: 'durationMinutes', render: (v?: number) => (v ? `${v} min` : '—'), align: 'right' },
    { key: 's', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 90, render: (_, r) => <Button size="small" onClick={() => navigate(`/clinical/consultation?patient=${r.patientId}`)}>{r.status === 'Completed' ? 'View' : 'Continue'}</Button> },
  ];
  return (
    <>
      <PageHeader title="Consultation Dashboard" subtitle="Encounters in progress, awaiting sign-off and completed" actions={<Button type="primary" icon={<Stethoscope size={15} />} onClick={() => navigate('/clinical/consultation')}>New Consultation</Button>} />
      <MetricGrid>
        <MetricCard label="Consultations today" value={stats.today} icon={<ClipboardList size={20} />} loading={loading} />
        <MetricCard label="In progress" value={stats.inProgress} icon={<Clock size={20} />} tone="info" loading={loading} />
        <MetricCard label="Pending sign-off" value={stats.pending} icon={<FileSignature size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Avg. duration" value={`${stats.avg} min`} icon={<Users size={20} />} tone="neutral" loading={loading} />
      </MetricGrid>
      <div className="card-grid">
        <div className="col-8"><DataTable<Consultation> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['patientName', 'providerName', 'chiefComplaint', 'diagnosis']} filters={[{ key: 'status', label: 'Status', options: ['In Progress', 'Pending Sign-off', 'Completed', 'Cancelled'] }]} /></div>
        <div className="col-4"><SectionCard title="Consultations by provider"><BarsChart data={byProvider} xKey="provider" horizontal series={[{ key: 'count', label: 'Consultations' }]} height={300} /></SectionCard></div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Clinical notes
export function ClinicalNotesPage() {
  const { data, loading, reload } = useAsyncData(() => noteService.all().then((n) => [...n].sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
  const [selected, setSelected] = useState<ClinicalNote | null>(null);
  const navigate = useNavigate();
  const columns: DataColumn<ClinicalNote>[] = [
    { key: 't', title: 'Note', dataIndex: 'title', render: (v: string, r) => <PrimaryCell title={v} subtitle={r.patientName} /> },
    { key: 'type', title: 'Type', dataIndex: 'type', render: (v: string) => <Tag>{v}</Tag> },
    { key: 'a', title: 'Author', dataIndex: 'author' },
    { key: 'c', title: 'Created', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v), sorter: (a, b) => a.createdAt.localeCompare(b.createdAt) },
    { key: 's', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'x', title: '', width: 130, render: (_, r) => <><Button size="small" type="link" onClick={() => setSelected(r)}>View</Button>{r.status === 'Draft' && <Button size="small" type="link" onClick={async () => { await noteService.update(r.id, { status: 'Signed' }); message.success('Signed'); reload(); }}>Sign</Button>}</> },
  ];
  return (
    <>
      <PageHeader title="Clinical Notes" subtitle="Progress, nursing, procedure and telephone notes across all patients" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => navigate('/clinical/soap')}>New SOAP Note</Button>} />
      <MetricGrid>
        <MetricCard label="Total notes" value={data?.length ?? 0} icon={<ClipboardList size={20} />} loading={loading} />
        <MetricCard label="Drafts" value={data?.filter((n) => n.status === 'Draft').length ?? 0} icon={<Clock size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Signed this week" value={data?.filter((n) => n.status === 'Signed' && dayjs(n.createdAt).isSame(dayjs(), 'week')).length ?? 0} icon={<CheckCircle2 size={20} />} tone="success" loading={loading} />
      </MetricGrid>
      <DataTable<ClinicalNote> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['title', 'patientName', 'author']} filters={[{ key: 'type', label: 'Type', options: ['Progress', 'SOAP', 'Nursing', 'Procedure', 'Telephone', 'Discharge'] }, { key: 'status', label: 'Status', options: ['Draft', 'Signed', 'Amended'] }]} exportable />
      <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} title={selected?.title} width={640}>
        <p className="muted">{selected?.patientName} · {selected?.author} · {selected && formatDateTime(selected.createdAt)}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>{selected?.body}</p>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ SOAP notes
export function SoapNotesPage() {
  const [params] = useSearchParams();
  const patients = useAppSelector(patientSelectors.selectAll);
  const currentPatientId = useAppSelector((s) => s.patients.currentPatientId);
  const user = useAppSelector((s) => s.auth.user);
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const { data: recent, reload } = useAsyncData(() => noteService.all().then((n) => n.filter((x) => x.type === 'SOAP').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8)));
  const values = Form.useWatch([], form) as Record<string, string> | undefined;
  const completeness = ['subjective', 'objective', 'assessment', 'plan'].filter((k) => values?.[k]?.trim()).length * 25;
  const save = async (status: 'Draft' | 'Signed') => {
    const v = await form.validateFields();
    const patient = patients.find((p) => p.id === v.patientId);
    await noteService.create({ patientId: v.patientId, patientName: patient?.fullName ?? '', type: 'SOAP', title: `SOAP – ${v.subjective?.slice(0, 40) ?? 'Visit'}`, author: user?.fullName ?? 'Provider', createdAt: new Date().toISOString(), status, body: `S: ${v.subjective}\n\nO: ${v.objective}\n\nA: ${v.assessment}\n\nP: ${v.plan}` });
    message.success(status === 'Signed' ? 'SOAP note signed' : 'Draft saved');
    form.resetFields(['subjective', 'objective', 'assessment', 'plan']);
    reload();
  };
  return (
    <>
      <PageHeader title="SOAP Notes" subtitle="Structured Subjective · Objective · Assessment · Plan documentation" />
      <Row gutter={20}>
        <Col xs={24} lg={16}>
          <Card>
            <Form form={form} layout="vertical" initialValues={{ patientId: params.get('patient') ?? currentPatientId ?? undefined }}>
              <Row gutter={16}>
                <Col xs={24} md={12}><Form.Item name="patientId" label="Patient" rules={[{ required: true, message: 'Select a patient' }]}><Select showSearch optionFilterProp="label" options={patients.map((p) => ({ value: p.id, label: `${p.fullName} · ${p.mrn}` }))} /></Form.Item></Col>
                <Col xs={12} md={6}><Form.Item name="encounterType" label="Encounter" initialValue="Office visit"><Select options={['Office visit', 'Telehealth', 'Hospital follow-up', 'Phone'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
                <Col xs={12} md={6}><Form.Item label="Completeness"><Progress percent={completeness} size="small" /></Form.Item></Col>
              </Row>
              <Steps size="small" current={step} onChange={setStep} items={[{ title: 'Subjective' }, { title: 'Objective' }, { title: 'Assessment' }, { title: 'Plan' }]} style={{ marginBottom: 16 }} />
              <Form.Item name="subjective" label="S — Subjective" rules={[{ required: true, message: 'Subjective is required' }]} help="Patient's own description: symptoms, history, concerns."><Input.TextArea rows={4} onFocus={() => setStep(0)} /></Form.Item>
              <Form.Item name="objective" label="O — Objective" rules={[{ required: true, message: 'Objective is required' }]} help="Vitals, exam findings, results."><Input.TextArea rows={4} onFocus={() => setStep(1)} /></Form.Item>
              <Form.Item name="assessment" label="A — Assessment" rules={[{ required: true, message: 'Assessment is required' }]} help="Diagnosis / differential and clinical reasoning."><Input.TextArea rows={3} onFocus={() => setStep(2)} /></Form.Item>
              <Form.Item name="plan" label="P — Plan" rules={[{ required: true, message: 'Plan is required' }]} help="Treatment, orders, education, follow-up."><Input.TextArea rows={4} onFocus={() => setStep(3)} /></Form.Item>
              <div className="sticky-actions">
                <Button onClick={() => void save('Draft')}>Save Draft</Button>
                <Button type="primary" icon={<FileSignature size={14} />} onClick={() => void save('Signed')}>Sign Note</Button>
              </div>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <SectionCard title="Recent SOAP notes">
            <List size="small" dataSource={recent ?? []} renderItem={(n) => (<List.Item><List.Item.Meta avatar={<Avatar name={n.patientName} size={30} />} title={<span style={{ fontSize: 13 }}>{n.patientName}</span>} description={<span style={{ fontSize: 12 }}>{formatDateTime(n.createdAt)} · {n.author}</span>} /><StatusTag status={n.status} /></List.Item>)} locale={{ emptyText: <EmptyState title="No SOAP notes yet" /> }} />
          </SectionCard>
          <SectionCard title="Documentation tips">
            <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: '#5b6b7a', lineHeight: 1.7 }}>
              <li>Quote the patient where helpful in Subjective.</li>
              <li>Record measurable findings only in Objective.</li>
              <li>Link each diagnosis to supporting findings.</li>
              <li>Plan should include follow-up interval and return precautions.</li>
            </ul>
          </SectionCard>
        </Col>
      </Row>
    </>
  );
}

// ------------------------------------------------------------------ Treatment plan
export function TreatmentPlanPage() {
  const patients = useAppSelector(patientSelectors.selectAll);
  const currentPatientId = useAppSelector((s) => s.patients.currentPatientId);
  const [patientId, setPatientId] = useState<string | undefined>(currentPatientId ?? undefined);
  const patient = patients.find((p) => p.id === patientId);
  const problems = mockDb.problems.filter((p) => p.patientId === patientId && p.status !== 'Resolved');
  const meds = mockDb.medications.filter((m) => m.patientId === patientId && m.status === 'Active');
  const [form] = Form.useForm();
  const goals = [
    { title: 'Blood pressure < 130/80', target: 'Dec 2026', progress: 65, status: 'On track' },
    { title: 'HbA1c < 7.0%', target: 'Mar 2027', progress: 40, status: 'Behind' },
    { title: 'Weight loss 5 kg', target: 'Jun 2027', progress: 25, status: 'On track' },
  ];
  return (
    <>
      <PageHeader title="Treatment Plan" subtitle="Longitudinal care goals, interventions and monitoring" actions={<Select showSearch placeholder="Select patient" style={{ width: 260 }} value={patientId} onChange={setPatientId} optionFilterProp="label" options={patients.map((p) => ({ value: p.id, label: `${p.fullName} · ${p.mrn}` }))} />} />
      {!patient ? <Card><EmptyState title="Select a patient" description="Choose a patient to view or build their treatment plan." /></Card> : (
        <div className="card-grid">
          <div className="col-8">
            <SectionCard title={<span className="flex items-center gap-2"><Target size={15} /> Care goals</span>} extra={<Button size="small" icon={<Plus size={13} />} onClick={() => message.info('Add a goal in the form below')}>Add Goal</Button>}>
              {goals.map((g) => (<div key={g.title} style={{ marginBottom: 14 }}><div className="flex justify-between" style={{ fontSize: 13, marginBottom: 4 }}><strong>{g.title}</strong><span className="muted">Target {g.target} · <Tag color={g.status === 'On track' ? 'green' : 'gold'} style={{ margin: 0 }}>{g.status}</Tag></span></div><Progress percent={g.progress} size="small" /></div>))}
            </SectionCard>
            <SectionCard title="Plan builder">
              <Form form={form} layout="vertical" onFinish={() => message.success('Treatment plan saved (mock)')}>
                <Row gutter={16}>
                  <Col xs={24} md={12}><Form.Item name="problem" label="Problem addressed" rules={[{ required: true }]}><Select options={problems.map((p) => ({ value: p.id, label: `${p.icd10} — ${p.description}` }))} /></Form.Item></Col>
                  <Col xs={24} md={12}><Form.Item name="goal" label="Goal" rules={[{ required: true }]}><Input placeholder="e.g. BP < 130/80 within 3 months" /></Form.Item></Col>
                  <Col xs={24} md={8}><Form.Item name="interventions" label="Interventions"><Select mode="multiple" options={['Medication optimization', 'Dietary counselling', 'Exercise programme', 'Home BP monitoring', 'Smoking cessation', 'Referral', 'Patient education'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
                  <Col xs={12} md={8}><Form.Item name="monitoring" label="Monitoring"><Select options={['Every visit', 'Monthly', 'Quarterly', 'Every 6 months'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
                  <Col xs={12} md={8}><Form.Item name="review" label="Review date"><Input type="date" /></Form.Item></Col>
                  <Col xs={24} md={12}><Form.Item name="responsible" label="Responsible clinician"><Select options={mockDb.providers.map((p) => ({ value: p.id, label: p.fullName }))} /></Form.Item></Col>
                  <Col xs={24} md={12}><Form.Item name="patientAgreement" label="Patient agreement"><Select options={['Agreed', 'Partially agreed', 'Declined'].map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
                  <Col span={24}><Form.Item name="notes" label="Notes"><Input.TextArea rows={3} /></Form.Item></Col>
                </Row>
                <Button type="primary" htmlType="submit">Save Plan Item</Button>
              </Form>
            </SectionCard>
          </div>
          <div className="col-4">
            <SectionCard title="Active problems">{problems.map((p) => <div key={p.id} className="list-row"><Tag style={{ fontFamily: 'monospace', margin: 0 }}>{p.icd10}</Tag><div className="list-row-main"><div className="list-row-title">{p.description}</div></div></div>)}{!problems.length && <span className="muted">None</span>}</SectionCard>
            <SectionCard title="Current medications">{meds.map((m) => <div key={m.id} className="list-row"><div className="list-row-main"><div className="list-row-title">{m.name} {m.dosage}</div><div className="list-row-sub">{m.frequency}</div></div></div>)}{!meds.length && <span className="muted">None</span>}</SectionCard>
            <SectionCard title="Plan history"><Timeline items={[{ children: 'Plan reviewed — goals updated', color: 'blue' }, { children: 'Lisinopril increased to 20 mg', color: 'green' }, { children: 'Initial plan created', color: 'gray' }]} /></SectionCard>
          </div>
        </div>
      )}
    </>
  );
}
