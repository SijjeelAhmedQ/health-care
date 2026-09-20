import { useMemo, useState } from 'react';
import { Button, Card, Checkbox, Descriptions, Dropdown, Form, Input, List, Modal, Select, Statistic, Tag, Timeline, Upload, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Download, FileText, MoreHorizontal, Pencil, Phone, Plus, ShieldCheck, Upload as UploadIcon, Pill, AlertTriangle, Activity, MessageSquare, Trash2 } from 'lucide-react';
import { SectionCard, StatusTag, KeyValue, EmptyState, PrimaryCell, Avatar } from '@/components/common';
import { DataTable, type DataColumn } from '@/components/tables/DataTable';
import { TrendChart } from '@/components/charts';
import { MedicationFormDrawer } from '@/components/forms/MedicationForm';
import { AllergyFormDrawer, ProblemFormDrawer } from '@/components/forms/ClinicalForms';
import { PatientEditDrawer } from '@/components/forms/PatientForm';
import { AppointmentFormDrawer } from '@/components/forms/AppointmentForm';
import { useAppDispatch, useAppSelector } from '@/store';
import { appointmentSelectors } from '@/store/slices/appointmentSlice';
import { deleteMedication, medicationSelectors, updateMedication } from '@/store/slices/medicationSlice';
import { allergyService, communicationService, contactService, documentService, immunizationService, insuranceService, noteService, problemService, vitalsService, mockDb } from '@/services/api';
import { useAsyncData } from '@/hooks';
import type { Allergy, ClinicalDocument, ClinicalNote, Communication, Immunization, InsurancePolicy, Medication, Patient, PatientContact, Problem } from '@/types/domain';
import { dayjs, formatDate, formatDateTime, formatFileSize, formatTime } from '@/utils/format';

type TabProps = { patient: Patient };

// ------------------------------------------------------------------ Summary
export function SummaryTab({ patient }: TabProps) {
  const navigate = useNavigate();
  const appointments = useAppSelector((s) => appointmentSelectors.selectAll(s).filter((a) => a.patientId === patient.id));
  const meds = useAppSelector((s) => medicationSelectors.selectAll(s).filter((m) => m.patientId === patient.id && m.status === 'Active'));
  const { data: vitals } = useAsyncData(() => vitalsService.all().then((v) => v.filter((x) => x.patientId === patient.id).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))), [patient.id]);
  const problems = mockDb.problems.filter((p) => p.patientId === patient.id && p.status !== 'Resolved');
  const allergies = mockDb.allergies.filter((a) => a.patientId === patient.id && a.status === 'Active');
  const latest = vitals?.[vitals.length - 1];
  const upcoming = appointments.filter((a) => a.date >= dayjs().format('YYYY-MM-DD') && !['Cancelled', 'Completed'].includes(a.status)).slice(0, 3);
  const [apptOpen, setApptOpen] = useState(false);
  return (
    <div className="card-grid">
      <div className="col-8">
        <SectionCard title="Latest vitals" extra={latest && <span className="muted" style={{ fontSize: 12 }}>Recorded {formatDateTime(latest.recordedAt)}</span>}>
          {latest ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
              <Statistic title="Blood pressure" value={`${latest.systolic}/${latest.diastolic}`} suffix="mmHg" valueStyle={{ fontSize: 20, color: latest.systolic > 140 ? '#d64545' : undefined }} />
              <Statistic title="Heart rate" value={latest.heartRate} suffix="bpm" valueStyle={{ fontSize: 20 }} />
              <Statistic title="Temperature" value={latest.temperature} suffix="°C" valueStyle={{ fontSize: 20 }} />
              <Statistic title="SpO₂" value={latest.spo2} suffix="%" valueStyle={{ fontSize: 20 }} />
              <Statistic title="Resp. rate" value={latest.respiratoryRate} suffix="/min" valueStyle={{ fontSize: 20 }} />
              <Statistic title="Weight" value={latest.weightKg} suffix="kg" valueStyle={{ fontSize: 20 }} />
              <Statistic title="BMI" value={latest.bmi} valueStyle={{ fontSize: 20, color: latest.bmi > 30 ? '#d98800' : undefined }} />
              <Statistic title="Pain" value={`${latest.painScore}/10`} valueStyle={{ fontSize: 20 }} />
            </div>
          ) : <EmptyState title="No vitals recorded" />}
          {vitals && vitals.length > 1 && (
            <div style={{ marginTop: 16 }}>
              <TrendChart data={vitals.map((v) => ({ date: dayjs(v.recordedAt).format('MMM D'), Systolic: v.systolic, Diastolic: v.diastolic }))} xKey="date" series={[{ key: 'Systolic', label: 'Systolic' }, { key: 'Diastolic', label: 'Diastolic' }]} height={180} />
            </div>
          )}
        </SectionCard>
      </div>
      <div className="col-4">
        <SectionCard title={<span className="flex items-center gap-2"><AlertTriangle size={15} color="#d64545" /> Allergies</span>} extra={<Button type="link" size="small" onClick={() => navigate(`/patients/${patient.id}/allergies`)}>Manage</Button>}>
          {allergies.length ? allergies.map((a) => (<div key={a.id} className="list-row"><div className="list-row-main"><div className="list-row-title">{a.allergen}</div><div className="list-row-sub">{a.reaction}</div></div><StatusTag status={a.severity} /></div>)) : <span className="muted">No known allergies</span>}
        </SectionCard>
        <SectionCard title="Upcoming appointments" extra={<Button type="link" size="small" icon={<Plus size={13} />} onClick={() => setApptOpen(true)}>Book</Button>}>
          {upcoming.length ? upcoming.map((a) => (<div key={a.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/appointments/${a.id}`)}><CalendarDays size={16} className="muted" /><div className="list-row-main"><div className="list-row-title">{formatDate(a.date)} · {formatTime(a.startTime)}</div><div className="list-row-sub">{a.type} · {a.providerName}</div></div><StatusTag status={a.status} /></div>)) : <span className="muted">None scheduled</span>}
        </SectionCard>
      </div>
      <div className="col-6">
        <SectionCard title={<span className="flex items-center gap-2"><Pill size={15} /> Active medications ({meds.length})</span>} extra={<Button type="link" size="small" onClick={() => navigate(`/patients/${patient.id}/medications`)}>All</Button>}>
          {meds.slice(0, 6).map((m) => (<div key={m.id} className="list-row"><div className="list-row-main"><div className="list-row-title">{m.name} {m.dosage}</div><div className="list-row-sub">{m.route} · {m.frequency} · {m.duration}</div></div><span className="muted" style={{ fontSize: 12 }}>{m.prescribedBy}</span></div>))}
          {!meds.length && <span className="muted">No active medications</span>}
        </SectionCard>
      </div>
      <div className="col-6">
        <SectionCard title={<span className="flex items-center gap-2"><Activity size={15} /> Active problems ({problems.length})</span>} extra={<Button type="link" size="small" onClick={() => navigate(`/patients/${patient.id}/problems`)}>All</Button>}>
          {problems.slice(0, 6).map((p) => (<div key={p.id} className="list-row"><Tag style={{ margin: 0, fontFamily: 'monospace' }}>{p.icd10}</Tag><div className="list-row-main"><div className="list-row-title">{p.description}</div><div className="list-row-sub">Since {formatDate(p.onsetDate)} · {p.diagnosedBy}</div></div><StatusTag status={p.status} /></div>))}
          {!problems.length && <span className="muted">No active problems</span>}
        </SectionCard>
      </div>
      <div className="col-12">
        <SectionCard title="Recent visits">
          <Timeline items={appointments.filter((a) => a.status === 'Completed').slice(-5).reverse().map((a) => ({ color: 'green', children: <div style={{ fontSize: 13 }}><strong>{formatDate(a.date)}</strong> — {a.type} with {a.providerName} <span className="muted">· {a.reason}</span></div> }))} />
          {!appointments.some((a) => a.status === 'Completed') && <span className="muted">No completed visits yet</span>}
        </SectionCard>
      </div>
      <AppointmentFormDrawer open={apptOpen} onOpen={() => setApptOpen(true)} onClose={() => setApptOpen(false)} patient={patient} />
    </div>
  );
}

// ------------------------------------------------------------------ Demographics
export function DemographicsTab({ patient }: TabProps) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="card-grid">
        <div className="col-6">
          <SectionCard title="Personal" extra={<Button size="small" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>Edit</Button>}>
            <KeyValue columns={2} items={[{ label: 'Full name', value: patient.fullName }, { label: 'MRN', value: patient.mrn }, { label: 'Date of birth', value: `${formatDate(patient.dateOfBirth)} (${patient.age} y)` }, { label: 'Gender', value: patient.gender }, { label: 'Blood group', value: patient.bloodGroup }, { label: 'Marital status', value: patient.maritalStatus }, { label: 'Language', value: patient.language }, { label: 'Occupation', value: patient.occupation }, { label: 'Registered', value: formatDate(patient.registeredAt) }, { label: 'Status', value: <StatusTag status={patient.status} /> }]} />
          </SectionCard>
        </div>
        <div className="col-6">
          <SectionCard title="Contact & address">
            <KeyValue columns={2} items={[{ label: 'Phone', value: patient.phone }, { label: 'Email', value: patient.email }, { label: 'Address', value: `${patient.address.line1}${patient.address.line2 ? ', ' + patient.address.line2 : ''}` }, { label: 'City / State', value: `${patient.address.city}, ${patient.address.state} ${patient.address.postalCode}` }, { label: 'Country', value: patient.address.country }, { label: 'Primary provider', value: patient.primaryProviderName }]} />
          </SectionCard>
          <SectionCard title="Emergency contact">
            <KeyValue columns={3} items={[{ label: 'Name', value: patient.emergencyContactName }, { label: 'Relationship', value: patient.emergencyContactRelation }, { label: 'Phone', value: patient.emergencyContactPhone }]} />
          </SectionCard>
        </div>
      </div>
      <PatientEditDrawer patient={patient} open={editing} onOpen={() => setEditing(true)} onClose={() => setEditing(false)} />
    </>
  );
}

// ------------------------------------------------------------------ History
export function HistoryTab({ patient }: TabProps) {
  const problems = mockDb.problems.filter((p) => p.patientId === patient.id);
  const appts = mockDb.appointments.filter((a) => a.patientId === patient.id && a.status === 'Completed');
  const [form] = Form.useForm();
  const history = { surgical: ['Appendectomy (2011)', 'Right knee arthroscopy (2019)'], family: ['Father — Type 2 diabetes, CAD', 'Mother — Hypertension', 'Sibling — Asthma'], social: ['Never smoker', 'Alcohol: occasional (1–2 drinks/week)', 'Exercise: 2× weekly', 'Lives with spouse'] };
  return (
    <div className="card-grid">
      <div className="col-8">
        <SectionCard title="Problem timeline">
          <Timeline mode="left" items={[...problems].sort((a, b) => b.onsetDate.localeCompare(a.onsetDate)).map((p) => ({ label: formatDate(p.onsetDate), color: p.status === 'Resolved' ? 'gray' : p.severity === 'Severe' ? 'red' : 'blue', children: <div><strong>{p.description}</strong> <Tag style={{ marginLeft: 6, fontFamily: 'monospace' }}>{p.icd10}</Tag><div className="muted" style={{ fontSize: 12 }}>{p.status} · diagnosed by {p.diagnosedBy}{p.resolvedDate ? ` · resolved ${formatDate(p.resolvedDate)}` : ''}</div></div> }))} />
        </SectionCard>
        <SectionCard title="Encounter history">
          <List size="small" dataSource={appts.slice(-8).reverse()} renderItem={(a) => (<List.Item><List.Item.Meta title={<span style={{ fontSize: 14 }}>{formatDate(a.date)} — {a.type}</span>} description={`${a.providerName} · ${a.locationName} · ${a.reason}`} /></List.Item>)} locale={{ emptyText: 'No encounters' }} />
        </SectionCard>
      </div>
      <div className="col-4">
        <SectionCard title="Past surgical history"><List size="small" dataSource={history.surgical} renderItem={(i) => <List.Item>{i}</List.Item>} /></SectionCard>
        <SectionCard title="Family history"><List size="small" dataSource={history.family} renderItem={(i) => <List.Item>{i}</List.Item>} /></SectionCard>
        <SectionCard title="Social history">
          <List size="small" dataSource={history.social} renderItem={(i) => <List.Item>{i}</List.Item>} />
          <Form form={form} layout="vertical" style={{ marginTop: 12 }} onFinish={() => message.success('History note added')}>
            <Form.Item name="note" label="Add history note" rules={[{ required: true, message: 'Enter a note' }]}><Input.TextArea rows={2} /></Form.Item>
            <Button htmlType="submit" size="small">Add</Button>
          </Form>
        </SectionCard>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Allergies
export function AllergiesTab({ patient }: TabProps) {
  const { data, loading, reload } = useAsyncData(() => allergyService.all().then((a) => a.filter((x) => x.patientId === patient.id)), [patient.id]);
  const [open, setOpen] = useState(false);
  const columns: DataColumn<Allergy>[] = [
    { key: 'allergen', title: 'Allergen', dataIndex: 'allergen', render: (v: string, r) => <PrimaryCell title={v} subtitle={r.type} /> },
    { key: 'reaction', title: 'Reaction', dataIndex: 'reaction' },
    { key: 'severity', title: 'Severity', dataIndex: 'severity', render: (v: string) => <StatusTag status={v} /> },
    { key: 'onset', title: 'Onset', dataIndex: 'onsetDate', render: (v: string) => formatDate(v) },
    { key: 'by', title: 'Recorded by', dataIndex: 'recordedBy' },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, render: (_, r) => <Dropdown menu={{ items: [{ key: 'inactive', label: 'Mark inactive', onClick: async () => { await allergyService.update(r.id, { status: 'Inactive' }); reload(); } }, { key: 'del', label: 'Delete', danger: true, icon: <Trash2 size={13} />, onClick: async () => { await allergyService.remove(r.id); reload(); } }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Dropdown> },
  ];
  return (
    <>
      <DataTable<Allergy> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['allergen', 'reaction']} filters={[{ key: 'severity', label: 'Severity', options: ['Mild', 'Moderate', 'Severe', 'Life-threatening'] }, { key: 'type', label: 'Type', options: ['Drug', 'Food', 'Environmental', 'Other'] }]} toolbarExtra={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Allergy</Button>} emptyTitle="No allergies recorded" emptyDescription="Say “add allergy penicillin causes rash, severe” to record one by voice." />
      <AllergyFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} patient={patient} onSaved={reload} />
    </>
  );
}

// ------------------------------------------------------------------ Medications
export function MedicationsTab({ patient }: TabProps) {
  const dispatch = useAppDispatch();
  const meds = useAppSelector((s) => medicationSelectors.selectAll(s).filter((m) => m.patientId === patient.id));
  const loading = useAppSelector((s) => s.medications.status === 'loading');
  const [open, setOpen] = useState(false);
  const columns: DataColumn<Medication>[] = [
    { key: 'name', title: 'Medication', dataIndex: 'name', render: (v: string, r) => <PrimaryCell title={`${v} ${r.dosage}`} subtitle={r.indication} /> },
    { key: 'route', title: 'Route', dataIndex: 'route' },
    { key: 'freq', title: 'Frequency', dataIndex: 'frequency' },
    { key: 'dur', title: 'Duration', dataIndex: 'duration' },
    { key: 'start', title: 'Start', dataIndex: 'startDate', render: (v: string) => formatDate(v), sorter: (a, b) => a.startDate.localeCompare(b.startDate) },
    { key: 'end', title: 'End', dataIndex: 'endDate', render: (v?: string) => (v ? formatDate(v) : '—') },
    { key: 'by', title: 'Prescriber', dataIndex: 'prescribedBy', ellipsis: true },
    { key: 'refills', title: 'Refills', dataIndex: 'refills', align: 'right', defaultHidden: true },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, render: (_, r) => <Dropdown menu={{ items: [{ key: 'hold', label: 'Put on hold', onClick: () => dispatch(updateMedication({ id: r.id, patch: { status: 'On Hold' } })) }, { key: 'dc', label: 'Discontinue', onClick: () => dispatch(updateMedication({ id: r.id, patch: { status: 'Discontinued', endDate: dayjs().format('YYYY-MM-DD') } })) }, { type: 'divider' }, { key: 'del', label: 'Delete', danger: true, onClick: () => Modal.confirm({ title: `Delete ${r.name}?`, okButtonProps: { danger: true }, onOk: () => dispatch(deleteMedication(r.id)) }) }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Dropdown> },
  ];
  return (
    <>
      <DataTable<Medication> rowKey="id" columns={columns} data={meds} loading={loading} searchKeys={['name', 'indication', 'prescribedBy']} filters={[{ key: 'status', label: 'Status', options: ['Active', 'Completed', 'Discontinued', 'On Hold'] }, { key: 'route', label: 'Route', options: ['Oral', 'Inhalation', 'Subcutaneous', 'Topical'] }]} toolbarExtra={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Medication</Button>} emptyTitle="No medications" emptyDescription='Say “add Amoxicillin 500 mg twice daily for 7 days”.' />
      <MedicationFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} patient={patient} />
    </>
  );
}

// ------------------------------------------------------------------ Problems
export function ProblemsTab({ patient }: TabProps) {
  const { data, loading, reload } = useAsyncData(() => problemService.all().then((p) => p.filter((x) => x.patientId === patient.id)), [patient.id]);
  const [open, setOpen] = useState(false);
  const columns: DataColumn<Problem>[] = [
    { key: 'icd', title: 'ICD-10', dataIndex: 'icd10', render: (v: string) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag>, width: 100 },
    { key: 'desc', title: 'Diagnosis', dataIndex: 'description' },
    { key: 'sev', title: 'Severity', dataIndex: 'severity', render: (v: string) => <StatusTag status={v} /> },
    { key: 'onset', title: 'Onset', dataIndex: 'onsetDate', render: (v: string) => formatDate(v), sorter: (a, b) => a.onsetDate.localeCompare(b.onsetDate) },
    { key: 'resolved', title: 'Resolved', dataIndex: 'resolvedDate', render: (v?: string) => (v ? formatDate(v) : '—') },
    { key: 'by', title: 'Diagnosed by', dataIndex: 'diagnosedBy', ellipsis: true },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, render: (_, r) => <Dropdown menu={{ items: [{ key: 'res', label: 'Mark resolved', onClick: async () => { await problemService.update(r.id, { status: 'Resolved', resolvedDate: dayjs().format('YYYY-MM-DD') }); reload(); } }, { key: 'chronic', label: 'Mark chronic', onClick: async () => { await problemService.update(r.id, { status: 'Chronic' }); reload(); } }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Dropdown> },
  ];
  return (
    <>
      <DataTable<Problem> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['description', 'icd10']} filters={[{ key: 'status', label: 'Status', options: ['Active', 'Chronic', 'Resolved', 'Inactive'] }]} toolbarExtra={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Diagnosis</Button>} emptyTitle="No problems recorded" />
      <ProblemFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} patient={patient} onSaved={reload} />
    </>
  );
}

// ------------------------------------------------------------------ Immunizations
export function ImmunizationsTab({ patient }: TabProps) {
  const { data, loading, reload } = useAsyncData(() => immunizationService.all().then((i) => i.filter((x) => x.patientId === patient.id)), [patient.id]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const columns: DataColumn<Immunization>[] = [
    { key: 'v', title: 'Vaccine', dataIndex: 'vaccine', render: (v: string, r) => <PrimaryCell title={v} subtitle={`Dose ${r.doseNumber} · ${r.manufacturer}`} /> },
    { key: 'date', title: 'Administered', dataIndex: 'dateAdministered', render: (v: string) => formatDate(v), sorter: (a, b) => a.dateAdministered.localeCompare(b.dateAdministered) },
    { key: 'by', title: 'By', dataIndex: 'administeredBy' },
    { key: 'site', title: 'Site / Route', render: (_, r) => `${r.site} · ${r.route}` },
    { key: 'lot', title: 'Lot #', dataIndex: 'lotNumber', defaultHidden: true },
    { key: 'due', title: 'Next due', dataIndex: 'nextDueDate', render: (v?: string) => (v ? formatDate(v) : '—') },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
  ];
  return (
    <>
      <DataTable<Immunization> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['vaccine', 'lotNumber']} filters={[{ key: 'status', label: 'Status', options: ['Completed', 'Due', 'Overdue', 'Declined'] }]} toolbarExtra={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Record Immunization</Button>} emptyTitle="No immunizations recorded" />
      <Modal title="Record Immunization" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={async (v) => { await immunizationService.create({ patientId: patient.id, vaccine: v.vaccine, doseNumber: v.dose ?? 1, dateAdministered: (v.date ?? dayjs()).format('YYYY-MM-DD'), administeredBy: v.by ?? 'RN', lotNumber: v.lot ?? '', site: v.site ?? 'Left deltoid', route: 'IM', manufacturer: v.manufacturer ?? '', status: 'Completed' }); form.resetFields(); setOpen(false); reload(); }}>
          <Form.Item name="vaccine" label="Vaccine" rules={[{ required: true }]}><Select options={['Influenza (quadrivalent)', 'COVID-19 mRNA', 'Tdap', 'Hepatitis B', 'Pneumococcal (PCV20)', 'Shingles (RZV)', 'MMR', 'HPV'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="dose" label="Dose number"><Select options={[1, 2, 3, 4].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="site" label="Site"><Select options={['Left deltoid', 'Right deltoid', 'Left thigh'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="lot" label="Lot number"><Input /></Form.Item>
          <Form.Item name="manufacturer" label="Manufacturer"><Input /></Form.Item>
          <Form.Item name="by" label="Administered by"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Documents
export function DocumentsTab({ patient }: TabProps) {
  const { data, loading, reload } = useAsyncData(() => documentService.all().then((d) => d.filter((x) => x.patientId === patient.id)), [patient.id]);
  const columns: DataColumn<ClinicalDocument>[] = [
    { key: 't', title: 'Document', dataIndex: 'title', render: (v: string, r) => <PrimaryCell title={<span className="flex items-center gap-2"><FileText size={14} className="muted" /> {v}</span>} subtitle={`${r.fileType} · ${formatFileSize(r.sizeKb)}`} /> },
    { key: 'cat', title: 'Category', dataIndex: 'category' },
    { key: 'by', title: 'Uploaded by', dataIndex: 'uploadedBy' },
    { key: 'at', title: 'Uploaded', dataIndex: 'uploadedAt', render: (v: string) => formatDateTime(v), sorter: (a, b) => a.uploadedAt.localeCompare(b.uploadedAt) },
    { key: 'tags', title: 'Tags', dataIndex: 'tags', render: (t: string[]) => t.map((x) => <Tag key={x}>{x}</Tag>) },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, render: () => <Button type="text" size="small" icon={<Download size={15} />} onClick={() => message.info('Download started (mock)')} /> },
  ];
  return (
    <DataTable<ClinicalDocument> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['title', 'category']} filters={[{ key: 'category', label: 'Category', options: ['Lab Result', 'Imaging', 'Referral Letter', 'Discharge Summary', 'Consent', 'Insurance', 'Other'] }, { key: 'status', label: 'Status', options: ['Final', 'Signed', 'Pending Review', 'Draft'] }]}
      toolbarExtra={<Upload showUploadList={false} beforeUpload={async (file) => { await documentService.create({ patientId: patient.id, patientName: patient.fullName, title: file.name, category: 'Other', fileType: 'PDF', sizeKb: Math.round(file.size / 1024), uploadedBy: 'You', uploadedAt: new Date().toISOString(), status: 'Draft', tags: [] }); message.success('Uploaded'); reload(); return false; }}><Button type="primary" icon={<UploadIcon size={15} />}>Upload</Button></Upload>} emptyTitle="No documents" />
  );
}

// ------------------------------------------------------------------ Notes
export function NotesTab({ patient }: TabProps) {
  const { data, loading, reload } = useAsyncData(() => noteService.all().then((n) => n.filter((x) => x.patientId === patient.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))), [patient.id]);
  const user = useAppSelector((s) => s.auth.user);
  const [form] = Form.useForm();
  const [selected, setSelected] = useState<ClinicalNote | null>(null);
  return (
    <div className="card-grid">
      <div className="col-4">
        <SectionCard title="New note">
          <Form form={form} layout="vertical" onFinish={async (v) => { await noteService.create({ patientId: patient.id, patientName: patient.fullName, type: v.type, title: v.title, author: user?.fullName ?? 'You', createdAt: new Date().toISOString(), status: 'Draft', body: v.body }); form.resetFields(); message.success('Note saved as draft'); reload(); }}>
            <Form.Item name="type" label="Type" initialValue="Progress" rules={[{ required: true }]}><Select options={['Progress', 'SOAP', 'Nursing', 'Procedure', 'Telephone', 'Discharge'].map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Title is required' }]}><Input /></Form.Item>
            <Form.Item name="body" label="Note" rules={[{ required: true, message: 'Note body is required' }]}><Input.TextArea rows={6} /></Form.Item>
            <Button type="primary" htmlType="submit" block>Save Draft</Button>
          </Form>
        </SectionCard>
      </div>
      <div className="col-8">
        <Card loading={loading}>
          {data?.length ? (
            <List itemLayout="vertical" dataSource={data} pagination={{ pageSize: 5, size: 'small' }} renderItem={(n) => (
              <List.Item key={n.id} actions={[<a key="v" onClick={() => setSelected(n)}>View</a>, n.status === 'Draft' && <a key="s" onClick={async () => { await noteService.update(n.id, { status: 'Signed' }); reload(); }}>Sign</a>]} extra={<StatusTag status={n.status} />}>
                <List.Item.Meta avatar={<Avatar name={n.author} size={34} />} title={<span>{n.title} <Tag style={{ marginLeft: 6 }}>{n.type}</Tag></span>} description={`${n.author} · ${formatDateTime(n.createdAt)}`} />
                <div style={{ fontSize: 13, color: '#5b6b7a' }}>{n.body}</div>
              </List.Item>
            )} />
          ) : <EmptyState title="No notes yet" />}
        </Card>
        <Modal open={!!selected} onCancel={() => setSelected(null)} footer={null} title={selected?.title}>
          <p className="muted">{selected?.author} · {selected && formatDateTime(selected.createdAt)} · {selected?.type}</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{selected?.body}</p>
        </Modal>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Insurance
export function InsuranceTab({ patient }: TabProps) {
  const { data, loading, reload } = useAsyncData(() => insuranceService.all().then((i) => i.filter((x) => x.patientId === patient.id)), [patient.id]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  return (
    <>
      <div className="flex justify-between items-center mb-4" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="text-secondary">{data?.length ?? 0} policies on file</span>
        <Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Policy</Button>
      </div>
      <div className="card-grid">
        {(data ?? []).map((p: InsurancePolicy) => (
          <div key={p.id} className="col-6">
            <Card loading={loading} title={<span className="flex items-center gap-2"><ShieldCheck size={16} color="#0f6e8c" /> {p.priority} — {p.provider}</span>} extra={<StatusTag status={p.status} />}>
              <KeyValue columns={2} items={[{ label: 'Plan', value: p.plan }, { label: 'Policy #', value: p.policyNumber }, { label: 'Group #', value: p.groupNumber }, { label: 'Subscriber', value: `${p.subscriberName} (${p.relationship})` }, { label: 'Effective', value: formatDate(p.effectiveDate) }, { label: 'Expires', value: formatDate(p.expiryDate) }, { label: 'Copay', value: `$${p.copay}` }, { label: 'Deductible', value: `$${p.deductible.toLocaleString()}` }, { label: 'Last verified', value: p.verifiedAt ? formatDateTime(p.verifiedAt) : 'Never' }]} />
              <div style={{ marginTop: 14 }} className="flex gap-2">
                <Button size="small" onClick={async () => { await insuranceService.update(p.id, { status: 'Active', verifiedAt: new Date().toISOString() }); message.success('Eligibility verified'); reload(); }}>Verify eligibility</Button>
                <Button size="small" danger onClick={async () => { await insuranceService.remove(p.id); reload(); }}>Remove</Button>
              </div>
            </Card>
          </div>
        ))}
        {!loading && !data?.length && <div className="col-12"><Card><EmptyState title="No insurance on file" action={<Button onClick={() => setOpen(true)}>Add policy</Button>} /></Card></div>}
      </div>
      <Modal title="Add Insurance Policy" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={async (v) => { await insuranceService.create({ patientId: patient.id, priority: v.priority, provider: v.provider, plan: v.plan, policyNumber: v.policyNumber, groupNumber: v.groupNumber ?? '', subscriberName: v.subscriberName ?? patient.fullName, relationship: v.relationship ?? 'Self', effectiveDate: dayjs().format('YYYY-MM-DD'), expiryDate: dayjs().add(1, 'year').format('YYYY-MM-DD'), copay: v.copay ?? 0, deductible: v.deductible ?? 0, status: 'Pending Verification' }); form.resetFields(); setOpen(false); reload(); }}>
          <div className="form-grid cols-2">
            <Form.Item name="priority" label="Priority" initialValue="Secondary" rules={[{ required: true }]}><Select options={['Primary', 'Secondary', 'Tertiary'].map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Form.Item name="provider" label="Insurer" rules={[{ required: true }]}><Select options={['Blue Cross Blue Shield', 'Aetna', 'UnitedHealthcare', 'Cigna', 'Humana', 'Kaiser Permanente', 'Medicare', 'Medicaid'].map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Form.Item name="plan" label="Plan" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="policyNumber" label="Policy number" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="groupNumber" label="Group number"><Input /></Form.Item>
            <Form.Item name="relationship" label="Relationship to subscriber" initialValue="Self"><Select options={['Self', 'Spouse', 'Child', 'Other'].map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Form.Item name="subscriberName" label="Subscriber name"><Input /></Form.Item>
            <Form.Item name="copay" label="Copay ($)"><Input type="number" /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Contacts
export function ContactsTab({ patient }: TabProps) {
  const { data, loading, reload } = useAsyncData(() => contactService.all().then((c) => c.filter((x) => x.patientId === patient.id)), [patient.id]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const columns: DataColumn<PatientContact>[] = [
    { key: 'n', title: 'Name', dataIndex: 'name', render: (v: string, r) => <PrimaryCell title={v} subtitle={r.relationship} avatar={v} /> },
    { key: 'p', title: 'Phone', dataIndex: 'phone', render: (v: string) => <span className="flex items-center gap-2"><Phone size={13} className="muted" />{v}</span> },
    { key: 'e', title: 'Email', dataIndex: 'email', render: (v?: string) => v ?? '—' },
    { key: 'pref', title: 'Preferred', dataIndex: 'preferredContact' },
    { key: 'flags', title: 'Roles', render: (_, r) => <>{r.isEmergency && <Tag color="red">Emergency</Tag>}{r.isGuardian && <Tag color="blue">Guardian</Tag>}</> },
    { key: 'a', title: '', width: 50, render: (_, r) => <Button type="text" size="small" danger icon={<Trash2 size={14} />} onClick={async () => { await contactService.remove(r.id); reload(); }} /> },
  ];
  return (
    <>
      <DataTable<PatientContact> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['name', 'relationship', 'phone']} toolbarExtra={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Contact</Button>} emptyTitle="No contacts" />
      <Modal title="Add Contact" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Save">
        <Form form={form} layout="vertical" onFinish={async (v) => { await contactService.create({ patientId: patient.id, name: v.name, relationship: v.relationship, phone: v.phone, email: v.email, isEmergency: !!v.isEmergency, isGuardian: !!v.isGuardian, preferredContact: v.preferredContact ?? 'Phone' }); form.resetFields(); setOpen(false); reload(); }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="relationship" label="Relationship" rules={[{ required: true }]}><Select options={['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Caregiver', 'Other'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="phone" label="Phone" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email"><Input /></Form.Item>
          <Form.Item name="preferredContact" label="Preferred contact" initialValue="Phone"><Select options={['Phone', 'Email', 'SMS'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="isEmergency" valuePropName="checked"><Checkbox>Emergency contact</Checkbox></Form.Item>
          <Form.Item name="isGuardian" valuePropName="checked"><Checkbox>Legal guardian</Checkbox></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Communication
export function CommunicationTab({ patient }: TabProps) {
  const { data, loading, reload } = useAsyncData(() => communicationService.all().then((c) => c.filter((x) => x.patientId === patient.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp))), [patient.id]);
  const user = useAppSelector((s) => s.auth.user);
  const [form] = Form.useForm();
  const stats = useMemo(() => ({ total: data?.length ?? 0, pending: data?.filter((c) => c.status === 'Pending').length ?? 0, failed: data?.filter((c) => c.status === 'Failed').length ?? 0 }), [data]);
  const columns: DataColumn<Communication>[] = [
    { key: 't', title: 'When', dataIndex: 'timestamp', render: (v: string) => formatDateTime(v), sorter: (a, b) => a.timestamp.localeCompare(b.timestamp), width: 180 },
    { key: 'ch', title: 'Channel', dataIndex: 'channel', render: (v: string, r) => <span>{v} <span className="muted">· {r.direction}</span></span> },
    { key: 's', title: 'Subject', dataIndex: 'subject', render: (v: string, r) => <PrimaryCell title={v} subtitle={r.summary} /> },
    { key: 'st', title: 'Staff', dataIndex: 'staff' },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
  ];
  return (
    <div className="card-grid">
      <div className="col-8">
        <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="metric-card"><div><div className="metric-card-label">Total contacts</div><div className="metric-card-value">{stats.total}</div></div></div>
          <div className="metric-card"><div><div className="metric-card-label">Pending</div><div className="metric-card-value">{stats.pending}</div></div></div>
          <div className="metric-card"><div><div className="metric-card-label">Failed deliveries</div><div className="metric-card-value" style={{ color: stats.failed ? '#d64545' : undefined }}>{stats.failed}</div></div></div>
        </div>
        <DataTable<Communication> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['subject', 'summary', 'staff']} filters={[{ key: 'channel', label: 'Channel', options: ['Phone', 'Email', 'SMS', 'Portal', 'Letter', 'In Person'] }, { key: 'status', label: 'Status', options: ['Completed', 'Pending', 'Scheduled', 'Failed'] }]} emptyTitle="No communication logged" />
      </div>
      <div className="col-4">
        <SectionCard title={<span className="flex items-center gap-2"><MessageSquare size={15} /> Log communication</span>}>
          <Form form={form} layout="vertical" onFinish={async (v) => { await communicationService.create({ patientId: patient.id, channel: v.channel, direction: v.direction, subject: v.subject, summary: v.summary ?? '', staff: user?.fullName ?? 'You', timestamp: new Date().toISOString(), status: 'Completed' }); form.resetFields(); message.success('Logged'); reload(); }}>
            <Form.Item name="channel" label="Channel" initialValue="Phone" rules={[{ required: true }]}><Select options={['Phone', 'Email', 'SMS', 'Portal', 'Letter', 'In Person'].map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Form.Item name="direction" label="Direction" initialValue="Outbound"><Select options={['Inbound', 'Outbound'].map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Form.Item name="subject" label="Subject" rules={[{ required: true, message: 'Subject is required' }]}><Input /></Form.Item>
            <Form.Item name="summary" label="Summary"><Input.TextArea rows={3} /></Form.Item>
            <Button type="primary" htmlType="submit" block>Log</Button>
          </Form>
        </SectionCard>
        <SectionCard title="Preferences">
          <Descriptions size="small" column={1} items={[{ key: '1', label: 'Preferred channel', children: 'SMS' }, { key: '2', label: 'Reminders', children: 'Enabled — 48 h before' }, { key: '3', label: 'Language', children: patient.language }, { key: '4', label: 'Portal', children: <Tag color="green">Enrolled</Tag> }]} />
        </SectionCard>
      </div>
    </div>
  );
}

