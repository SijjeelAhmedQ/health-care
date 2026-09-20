import { useMemo, useState } from 'react';
import { Button, Dropdown, Modal, Tag, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Download, FileText, FlaskConical, MoreHorizontal, Pill, Plus, Scan, Send, Activity, ClipboardList, CheckCircle2 } from 'lucide-react';
import { PageHeader, MetricCard, MetricGrid, StatusTag, PrimaryCell } from '@/components/common';
import { DataTable, type DataColumn } from '@/components/tables/DataTable';
import { MedicationFormDrawer, PrescriptionFormDrawer } from '@/components/forms/MedicationForm';
import { ImagingOrderFormDrawer, LabOrderFormDrawer, ProblemFormDrawer, ReferralFormDrawer } from '@/components/forms/ClinicalForms';
import { useAppDispatch, useAppSelector } from '@/store';
import { medicationSelectors, prescriptionSelectors, updateMedication, updatePrescription, deleteMedication } from '@/store/slices/medicationSlice';
import { patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { useAsyncData } from '@/hooks';
import { documentService, imagingOrderService, labOrderService, problemService, referralService } from '@/services/api';
import type { ClinicalDocument, ImagingOrder, LabOrder, Medication, Prescription, Problem, Referral } from '@/types/domain';
import { dayjs, formatDate, formatDateTime, formatFileSize } from '@/utils/format';

function usePatientLink() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  return (patientId: string, tab?: string) => {
    dispatch(setCurrentPatient(patientId));
    navigate(`/patients/${patientId}${tab ? `/${tab}` : ''}`);
  };
}

// ------------------------------------------------------------------ Medications (page 29)
export function MedicationsPage() {
  const dispatch = useAppDispatch();
  const meds = useAppSelector(medicationSelectors.selectAll);
  const loading = useAppSelector((s) => s.medications.status === 'loading');
  const currentPatient = useAppSelector((s) => (s.patients.currentPatientId ? patientSelectors.selectById(s, s.patients.currentPatientId) : undefined));
  const [open, setOpen] = useState(false);
  const openPatient = usePatientLink();
  const stats = useMemo(() => ({ active: meds.filter((m) => m.status === 'Active').length, hold: meds.filter((m) => m.status === 'On Hold').length, ending: meds.filter((m) => m.endDate && dayjs(m.endDate).diff(dayjs(), 'day') >= 0 && dayjs(m.endDate).diff(dayjs(), 'day') <= 7).length, prn: meds.filter((m) => m.isPRN).length }), [meds]);
  const columns: DataColumn<Medication>[] = [
    { key: 'name', title: 'Medication', dataIndex: 'name', hideable: false, render: (v: string, r) => <PrimaryCell title={`${v} ${r.dosage}`} subtitle={r.indication} />, sorter: (a, b) => a.name.localeCompare(b.name) },
    { key: 'patient', title: 'Patient', dataIndex: 'patientName', render: (v: string, r) => <a onClick={() => openPatient(r.patientId, 'medications')}>{v}</a> },
    { key: 'route', title: 'Route', dataIndex: 'route' },
    { key: 'freq', title: 'Frequency', dataIndex: 'frequency' },
    { key: 'dur', title: 'Duration', dataIndex: 'duration' },
    { key: 'start', title: 'Start', dataIndex: 'startDate', render: (v: string) => formatDate(v), sorter: (a, b) => a.startDate.localeCompare(b.startDate), defaultSortOrder: 'descend' },
    { key: 'by', title: 'Prescriber', dataIndex: 'prescribedBy', ellipsis: true, defaultHidden: true },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string, r) => <>{<StatusTag status={v} />}{r.isPRN && <Tag style={{ marginLeft: 4 }}>PRN</Tag>}</> },
    { key: 'a', title: '', width: 50, hideable: false, render: (_, r) => <Dropdown trigger={['click']} menu={{ items: [{ key: 'p', label: 'Open patient', onClick: () => openPatient(r.patientId, 'medications') }, { key: 'hold', label: 'Put on hold', onClick: () => dispatch(updateMedication({ id: r.id, patch: { status: 'On Hold' } })) }, { key: 'resume', label: 'Resume', onClick: () => dispatch(updateMedication({ id: r.id, patch: { status: 'Active' } })) }, { key: 'dc', label: 'Discontinue', onClick: () => dispatch(updateMedication({ id: r.id, patch: { status: 'Discontinued', endDate: dayjs().format('YYYY-MM-DD') } })) }, { type: 'divider' }, { key: 'del', label: 'Delete', danger: true, onClick: () => Modal.confirm({ title: `Delete ${r.name} for ${r.patientName}?`, okButtonProps: { danger: true }, onOk: () => dispatch(deleteMedication(r.id)) }) }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Dropdown> },
  ];
  return (
    <>
      <PageHeader title="Medication Management" subtitle={currentPatient ? `Patient in context: ${currentPatient.fullName} — voice “add medication” will target this patient` : 'All active and historical medications across the practice'} actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Medication</Button>} />
      <MetricGrid>
        <MetricCard label="Active medications" value={stats.active} icon={<Pill size={20} />} loading={loading} />
        <MetricCard label="On hold" value={stats.hold} icon={<AlertTriangle size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Ending within 7 days" value={stats.ending} icon={<Activity size={20} />} tone="info" loading={loading} />
        <MetricCard label="PRN medications" value={stats.prn} icon={<ClipboardList size={20} />} tone="neutral" loading={loading} />
      </MetricGrid>
      <DataTable<Medication> rowKey="id" columns={columns} data={meds} loading={loading} searchKeys={['name', 'patientName', 'indication', 'prescribedBy']} searchPlaceholder="Search medication or patient…" filters={[{ key: 'status', label: 'Status', options: ['Active', 'Completed', 'Discontinued', 'On Hold'] }, { key: 'route', label: 'Route', options: ['Oral', 'Inhalation', 'Subcutaneous', 'Topical', 'Intravenous'] }, { key: 'frequency', label: 'Frequency', options: ['Once daily', 'Twice daily', 'Three times daily', 'As needed', 'Every 8 hours'] }]} exportable pageSize={15} emptyTitle="No medications" emptyDescription='Say “add Amoxicillin 500 mg twice daily for 7 days”.' />
      <MedicationFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} patient={currentPatient} />
    </>
  );
}

// ------------------------------------------------------------------ Prescriptions (page 30)
export function PrescriptionsPage() {
  const dispatch = useAppDispatch();
  const rx = useAppSelector(prescriptionSelectors.selectAll);
  const loading = useAppSelector((s) => s.medications.status === 'loading');
  const currentPatient = useAppSelector((s) => (s.patients.currentPatientId ? patientSelectors.selectById(s, s.patients.currentPatientId) : undefined));
  const [open, setOpen] = useState(false);
  const openPatient = usePatientLink();
  const columns: DataColumn<Prescription>[] = [
    { key: 'rx', title: 'Rx #', dataIndex: 'rxNumber', width: 110, render: (v: string) => <span className="mono">{v}</span> },
    { key: 'med', title: 'Medication', dataIndex: 'medicationName', hideable: false, render: (v: string, r) => <PrimaryCell title={`${v} ${r.dosage}`} subtitle={`${r.route} · ${r.frequency} · ${r.duration}`} /> },
    { key: 'patient', title: 'Patient', dataIndex: 'patientName', render: (v: string, r) => <a onClick={() => openPatient(r.patientId, 'medications')}>{v}</a> },
    { key: 'prov', title: 'Prescriber', dataIndex: 'providerName', ellipsis: true },
    { key: 'qty', title: 'Qty / Refills', render: (_, r) => `${r.quantity} / ${r.refills}`, align: 'right' },
    { key: 'pharm', title: 'Pharmacy', dataIndex: 'pharmacy', ellipsis: true },
    { key: 'issued', title: 'Issued', dataIndex: 'issuedAt', render: (v: string) => formatDate(v), sorter: (a, b) => a.issuedAt.localeCompare(b.issuedAt), defaultSortOrder: 'descend' },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, hideable: false, render: (_, r) => <Dropdown trigger={['click']} menu={{ items: [{ key: 'send', label: 'Send to pharmacy', disabled: r.status !== 'Draft', onClick: () => dispatch(updatePrescription({ id: r.id, patch: { status: 'Sent' } })) }, { key: 'filled', label: 'Mark filled', onClick: () => dispatch(updatePrescription({ id: r.id, patch: { status: 'Filled' } })) }, { key: 'cancel', label: 'Cancel prescription', danger: true, onClick: () => Modal.confirm({ title: `Cancel ${r.rxNumber}?`, okButtonProps: { danger: true }, onOk: () => dispatch(updatePrescription({ id: r.id, patch: { status: 'Cancelled' } })) }) }, { key: 'print', label: 'Print', onClick: () => message.info('Printing (mock)') }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Dropdown> },
  ];
  return (
    <>
      <PageHeader title="Prescription Management" subtitle="Electronic prescriptions, refills and pharmacy transmission" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>New Prescription</Button>} />
      <MetricGrid>
        <MetricCard label="Sent today" value={rx.filter((r) => r.status === 'Sent' && r.issuedAt === dayjs().format('YYYY-MM-DD')).length} icon={<Send size={20} />} loading={loading} />
        <MetricCard label="Awaiting pharmacy" value={rx.filter((r) => r.status === 'Sent').length} icon={<Pill size={20} />} tone="info" loading={loading} />
        <MetricCard label="Drafts" value={rx.filter((r) => r.status === 'Draft').length} icon={<ClipboardList size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Filled (30 days)" value={rx.filter((r) => r.status === 'Filled' && dayjs(r.issuedAt).isAfter(dayjs().subtract(30, 'day'))).length} icon={<CheckCircle2 size={20} />} tone="success" loading={loading} />
      </MetricGrid>
      <DataTable<Prescription> rowKey="id" columns={columns} data={rx} loading={loading} searchKeys={['medicationName', 'patientName', 'rxNumber', 'providerName']} filters={[{ key: 'status', label: 'Status', options: ['Draft', 'Sent', 'Filled', 'Cancelled', 'Expired'] }, { key: 'pharmacy', label: 'Pharmacy', options: ['CVS Pharmacy #1123', 'Walgreens – Riverside', 'H-E-B Pharmacy', 'Costco Pharmacy', 'Amazon Pharmacy'] }]} exportable pageSize={15} />
      <PrescriptionFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} patient={currentPatient} />
    </>
  );
}

// ------------------------------------------------------------------ Diagnosis (page 27)
export function DiagnosisPage() {
  const { data, loading, reload } = useAsyncData(() => problemService.all());
  const patients = useAppSelector(patientSelectors.selectAll);
  const currentPatient = useAppSelector((s) => (s.patients.currentPatientId ? patientSelectors.selectById(s, s.patients.currentPatientId) : undefined));
  const [open, setOpen] = useState(false);
  const openPatient = usePatientLink();
  const nameOf = (id: string) => patients.find((p) => p.id === id)?.fullName ?? id;
  const columns: DataColumn<Problem>[] = [
    { key: 'icd', title: 'ICD-10', dataIndex: 'icd10', width: 100, render: (v: string) => <Tag style={{ fontFamily: 'monospace' }}>{v}</Tag> },
    { key: 'desc', title: 'Diagnosis', dataIndex: 'description', hideable: false },
    { key: 'p', title: 'Patient', dataIndex: 'patientId', render: (v: string) => <a onClick={() => openPatient(v, 'problems')}>{nameOf(v)}</a> },
    { key: 'sev', title: 'Severity', dataIndex: 'severity', render: (v: string) => <StatusTag status={v} /> },
    { key: 'onset', title: 'Onset', dataIndex: 'onsetDate', render: (v: string) => formatDate(v), sorter: (a, b) => a.onsetDate.localeCompare(b.onsetDate), defaultSortOrder: 'descend' },
    { key: 'by', title: 'Diagnosed by', dataIndex: 'diagnosedBy', ellipsis: true },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, render: (_, r) => <Dropdown trigger={['click']} menu={{ items: [{ key: 'res', label: 'Mark resolved', onClick: async () => { await problemService.update(r.id, { status: 'Resolved', resolvedDate: dayjs().format('YYYY-MM-DD') }); reload(); } }, { key: 'chr', label: 'Mark chronic', onClick: async () => { await problemService.update(r.id, { status: 'Chronic' }); reload(); } }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Dropdown> },
  ];
  return (
    <>
      <PageHeader title="Diagnosis" subtitle="Problem list and ICD-10 coded diagnoses across patients" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Add Diagnosis</Button>} />
      <MetricGrid>
        <MetricCard label="Active" value={data?.filter((p) => p.status === 'Active').length ?? 0} icon={<Activity size={20} />} loading={loading} />
        <MetricCard label="Chronic" value={data?.filter((p) => p.status === 'Chronic').length ?? 0} icon={<ClipboardList size={20} />} tone="info" loading={loading} />
        <MetricCard label="Severe" value={data?.filter((p) => p.severity === 'Severe' && p.status !== 'Resolved').length ?? 0} icon={<AlertTriangle size={20} />} tone="error" loading={loading} />
        <MetricCard label="Resolved (90 days)" value={data?.filter((p) => p.resolvedDate && dayjs(p.resolvedDate).isAfter(dayjs().subtract(90, 'day'))).length ?? 0} icon={<CheckCircle2 size={20} />} tone="success" loading={loading} />
      </MetricGrid>
      <DataTable<Problem> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['description', 'icd10', 'diagnosedBy']} filters={[{ key: 'status', label: 'Status', options: ['Active', 'Chronic', 'Resolved', 'Inactive'] }, { key: 'severity', label: 'Severity', options: ['Mild', 'Moderate', 'Severe'] }]} exportable pageSize={15} />
      <ProblemFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} patient={currentPatient} onSaved={reload} />
    </>
  );
}

// ------------------------------------------------------------------ Lab orders (page 31)
export function LabOrdersPage() {
  const { data, loading, reload } = useAsyncData(() => labOrderService.all());
  const currentPatient = useAppSelector((s) => (s.patients.currentPatientId ? patientSelectors.selectById(s, s.patients.currentPatientId) : undefined));
  const [open, setOpen] = useState(false);
  const openPatient = usePatientLink();
  const columns: DataColumn<LabOrder>[] = [
    { key: 'n', title: 'Order #', dataIndex: 'orderNumber', width: 110, render: (v: string) => <span className="mono">{v}</span> },
    { key: 't', title: 'Test', dataIndex: 'testName', hideable: false, render: (v: string, r) => <PrimaryCell title={v} subtitle={`${r.panel} · ${r.specimen}${r.fasting ? ' · fasting' : ''}`} /> },
    { key: 'p', title: 'Patient', dataIndex: 'patientName', render: (v: string, r) => <a onClick={() => openPatient(r.patientId)}>{v}</a> },
    { key: 'prov', title: 'Ordered by', dataIndex: 'providerName', ellipsis: true },
    { key: 'pri', title: 'Priority', dataIndex: 'priority', render: (v: string) => <StatusTag status={v} /> },
    { key: 'lab', title: 'Lab', dataIndex: 'lab', defaultHidden: true },
    { key: 'ordered', title: 'Ordered', dataIndex: 'orderedAt', render: (v: string) => formatDateTime(v), sorter: (a, b) => a.orderedAt.localeCompare(b.orderedAt), defaultSortOrder: 'descend' },
    { key: 'res', title: 'Result', render: (_, r) => (r.status === 'Resulted' ? (r.abnormal ? <Tag color="red">Abnormal</Tag> : <Tag color="green">Normal</Tag>) : <span className="muted">—</span>) },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, render: (_, r) => <Dropdown trigger={['click']} menu={{ items: [{ key: 'c', label: 'Mark collected', onClick: async () => { await labOrderService.update(r.id, { status: 'Collected' }); reload(); } }, { key: 'r', label: 'Enter result', onClick: async () => { await labOrderService.update(r.id, { status: 'Resulted', resultedAt: new Date().toISOString(), abnormal: false }); reload(); } }, { key: 'x', label: 'Cancel order', danger: true, onClick: async () => { await labOrderService.update(r.id, { status: 'Cancelled' }); reload(); } }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Dropdown> },
  ];
  return (
    <>
      <PageHeader title="Lab Orders" subtitle="Order, track and review laboratory tests" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>New Lab Order</Button>} />
      <MetricGrid>
        <MetricCard label="Open orders" value={data?.filter((l) => ['Ordered', 'Collected', 'In Progress'].includes(l.status)).length ?? 0} icon={<FlaskConical size={20} />} loading={loading} />
        <MetricCard label="STAT / urgent" value={data?.filter((l) => l.priority !== 'Routine' && l.status !== 'Resulted').length ?? 0} icon={<AlertTriangle size={20} />} tone="error" loading={loading} />
        <MetricCard label="Resulted (7 days)" value={data?.filter((l) => l.resultedAt && dayjs(l.resultedAt).isAfter(dayjs().subtract(7, 'day'))).length ?? 0} icon={<CheckCircle2 size={20} />} tone="success" loading={loading} />
        <MetricCard label="Abnormal to review" value={data?.filter((l) => l.abnormal).length ?? 0} icon={<Activity size={20} />} tone="warning" loading={loading} />
      </MetricGrid>
      <DataTable<LabOrder> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['testName', 'patientName', 'orderNumber', 'providerName']} filters={[{ key: 'status', label: 'Status', options: ['Ordered', 'Collected', 'In Progress', 'Resulted', 'Cancelled'] }, { key: 'priority', label: 'Priority', options: ['Routine', 'Urgent', 'STAT'] }, { key: 'lab', label: 'Lab', options: ['Quest Diagnostics', 'LabCorp', 'In-house Lab'] }]} exportable pageSize={15} />
      <LabOrderFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} patient={currentPatient} onSaved={reload} />
    </>
  );
}

// ------------------------------------------------------------------ Imaging (page 32)
export function ImagingOrdersPage() {
  const { data, loading, reload } = useAsyncData(() => imagingOrderService.all());
  const currentPatient = useAppSelector((s) => (s.patients.currentPatientId ? patientSelectors.selectById(s, s.patients.currentPatientId) : undefined));
  const [open, setOpen] = useState(false);
  const openPatient = usePatientLink();
  const columns: DataColumn<ImagingOrder>[] = [
    { key: 'n', title: 'Order #', dataIndex: 'orderNumber', width: 110, render: (v: string) => <span className="mono">{v}</span> },
    { key: 'm', title: 'Study', hideable: false, render: (_, r) => <PrimaryCell title={`${r.modality} — ${r.bodyPart}`} subtitle={`${r.clinicalIndication}${r.contrast ? ' · with contrast' : ''}`} /> },
    { key: 'p', title: 'Patient', dataIndex: 'patientName', render: (v: string, r) => <a onClick={() => openPatient(r.patientId)}>{v}</a> },
    { key: 'prov', title: 'Ordered by', dataIndex: 'providerName', ellipsis: true },
    { key: 'pri', title: 'Priority', dataIndex: 'priority', render: (v: string) => <StatusTag status={v} /> },
    { key: 'fac', title: 'Facility', dataIndex: 'facility', ellipsis: true },
    { key: 'sched', title: 'Scheduled', dataIndex: 'scheduledFor', render: (v?: string) => (v ? formatDateTime(v) : <span className="muted">Not scheduled</span>) },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, render: (_, r) => <Dropdown trigger={['click']} menu={{ items: [{ key: 's', label: 'Schedule', onClick: async () => { await imagingOrderService.update(r.id, { status: 'Scheduled', scheduledFor: dayjs().add(3, 'day').hour(10).toISOString() }); reload(); } }, { key: 'p', label: 'Mark performed', onClick: async () => { await imagingOrderService.update(r.id, { status: 'Performed' }); reload(); } }, { key: 'r', label: 'Attach report', onClick: async () => { await imagingOrderService.update(r.id, { status: 'Reported' }); reload(); } }, { key: 'x', label: 'Cancel', danger: true, onClick: async () => { await imagingOrderService.update(r.id, { status: 'Cancelled' }); reload(); } }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Dropdown> },
  ];
  return (
    <>
      <PageHeader title="Imaging Orders" subtitle="Radiology orders, scheduling and reports" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>New Imaging Order</Button>} />
      <MetricGrid>
        <MetricCard label="Awaiting scheduling" value={data?.filter((i) => i.status === 'Ordered').length ?? 0} icon={<Scan size={20} />} loading={loading} />
        <MetricCard label="Scheduled" value={data?.filter((i) => i.status === 'Scheduled').length ?? 0} icon={<ClipboardList size={20} />} tone="info" loading={loading} />
        <MetricCard label="Awaiting report" value={data?.filter((i) => i.status === 'Performed').length ?? 0} icon={<AlertTriangle size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Reported (30 days)" value={data?.filter((i) => i.status === 'Reported').length ?? 0} icon={<CheckCircle2 size={20} />} tone="success" loading={loading} />
      </MetricGrid>
      <DataTable<ImagingOrder> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['patientName', 'bodyPart', 'orderNumber', 'clinicalIndication']} filters={[{ key: 'modality', label: 'Modality', options: ['X-Ray', 'CT', 'MRI', 'Ultrasound', 'Mammography', 'PET'] }, { key: 'status', label: 'Status', options: ['Ordered', 'Scheduled', 'Performed', 'Reported', 'Cancelled'] }, { key: 'priority', label: 'Priority', options: ['Routine', 'Urgent', 'STAT'] }]} exportable pageSize={15} />
      <ImagingOrderFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} patient={currentPatient} onSaved={reload} />
    </>
  );
}

// ------------------------------------------------------------------ Referrals (page 33)
export function ReferralsPage() {
  const { data, loading, reload } = useAsyncData(() => referralService.all());
  const currentPatient = useAppSelector((s) => (s.patients.currentPatientId ? patientSelectors.selectById(s, s.patients.currentPatientId) : undefined));
  const [open, setOpen] = useState(false);
  const openPatient = usePatientLink();
  const columns: DataColumn<Referral>[] = [
    { key: 'n', title: 'Ref #', dataIndex: 'referralNumber', width: 100, render: (v: string) => <span className="mono">{v}</span> },
    { key: 'p', title: 'Patient', dataIndex: 'patientName', hideable: false, render: (v: string, r) => <a onClick={() => openPatient(r.patientId)}>{v}</a> },
    { key: 'to', title: 'Referred to', dataIndex: 'referredTo', render: (v: string, r) => <PrimaryCell title={v} subtitle={r.specialty} /> },
    { key: 'from', title: 'Referring', dataIndex: 'referringProvider', ellipsis: true },
    { key: 'reason', title: 'Reason', dataIndex: 'reason', ellipsis: true },
    { key: 'pri', title: 'Priority', dataIndex: 'priority', render: (v: string) => <StatusTag status={v} /> },
    { key: 'auth', title: 'Auth #', dataIndex: 'insuranceAuth', render: (v?: string) => v ?? <Tag color="gold">Needs auth</Tag> },
    { key: 'created', title: 'Created', dataIndex: 'createdAt', render: (v: string) => formatDate(v), sorter: (a, b) => a.createdAt.localeCompare(b.createdAt), defaultSortOrder: 'descend' },
    { key: 'exp', title: 'Expires', dataIndex: 'expiresAt', render: (v: string) => formatDate(v), defaultHidden: true },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 50, render: (_, r) => <Dropdown trigger={['click']} menu={{ items: [{ key: 's', label: 'Send', onClick: async () => { await referralService.update(r.id, { status: 'Sent' }); reload(); } }, { key: 'acc', label: 'Mark accepted', onClick: async () => { await referralService.update(r.id, { status: 'Accepted' }); reload(); } }, { key: 'c', label: 'Mark completed', onClick: async () => { await referralService.update(r.id, { status: 'Completed' }); reload(); } }, { key: 'x', label: 'Decline', danger: true, onClick: async () => { await referralService.update(r.id, { status: 'Declined' }); reload(); } }] }}><Button type="text" size="small" icon={<MoreHorizontal size={16} />} /></Dropdown> },
  ];
  return (
    <>
      <PageHeader title="Referrals" subtitle="Outbound specialist referrals and authorization tracking" actions={<Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>New Referral</Button>} />
      <MetricGrid>
        <MetricCard label="Pending" value={data?.filter((r) => r.status === 'Pending').length ?? 0} icon={<Send size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Awaiting acceptance" value={data?.filter((r) => r.status === 'Sent').length ?? 0} icon={<ClipboardList size={20} />} tone="info" loading={loading} />
        <MetricCard label="Needs authorization" value={data?.filter((r) => !r.insuranceAuth && !['Completed', 'Declined'].includes(r.status)).length ?? 0} icon={<AlertTriangle size={20} />} tone="error" loading={loading} />
        <MetricCard label="Completed (90 days)" value={data?.filter((r) => r.status === 'Completed').length ?? 0} icon={<CheckCircle2 size={20} />} tone="success" loading={loading} />
      </MetricGrid>
      <DataTable<Referral> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['patientName', 'referredTo', 'specialty', 'referralNumber']} filters={[{ key: 'status', label: 'Status', options: ['Pending', 'Sent', 'Accepted', 'Scheduled', 'Completed', 'Declined'] }, { key: 'priority', label: 'Priority', options: ['Routine', 'Urgent', 'Emergency'] }]} exportable pageSize={15} />
      <ReferralFormDrawer open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} patient={currentPatient} onSaved={reload} />
    </>
  );
}

// ------------------------------------------------------------------ Clinical documents (page 34)
export function ClinicalDocumentsPage() {
  const { data, loading, reload } = useAsyncData(() => documentService.all());
  const openPatient = usePatientLink();
  const columns: DataColumn<ClinicalDocument>[] = [
    { key: 't', title: 'Document', dataIndex: 'title', hideable: false, render: (v: string, r) => <PrimaryCell title={<span className="flex items-center gap-2"><FileText size={14} className="muted" />{v}</span>} subtitle={`${r.fileType} · ${formatFileSize(r.sizeKb)}`} /> },
    { key: 'p', title: 'Patient', dataIndex: 'patientName', render: (v: string, r) => (r.patientId ? <a onClick={() => openPatient(r.patientId!, 'documents')}>{v}</a> : '—') },
    { key: 'cat', title: 'Category', dataIndex: 'category' },
    { key: 'by', title: 'Uploaded by', dataIndex: 'uploadedBy' },
    { key: 'at', title: 'Uploaded', dataIndex: 'uploadedAt', render: (v: string) => formatDateTime(v), sorter: (a, b) => a.uploadedAt.localeCompare(b.uploadedAt), defaultSortOrder: 'descend' },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    { key: 'a', title: '', width: 90, render: (_, r) => <>{r.status === 'Pending Review' && <Button type="link" size="small" onClick={async () => { await documentService.update(r.id, { status: 'Signed' }); reload(); }}>Sign</Button>}<Button type="text" size="small" icon={<Download size={15} />} onClick={() => message.info('Download (mock)')} /></> },
  ];
  return (
    <>
      <PageHeader title="Clinical Documents" subtitle="Practice-wide document library — results, letters, consents and scans" />
      <MetricGrid>
        <MetricCard label="Documents" value={data?.length ?? 0} icon={<FileText size={20} />} loading={loading} />
        <MetricCard label="Pending review" value={data?.filter((d) => d.status === 'Pending Review').length ?? 0} icon={<AlertTriangle size={20} />} tone="warning" loading={loading} />
        <MetricCard label="Uploaded this week" value={data?.filter((d) => dayjs(d.uploadedAt).isSame(dayjs(), 'week')).length ?? 0} icon={<Activity size={20} />} tone="info" loading={loading} />
        <MetricCard label="Storage used" value={`${((data?.reduce((s, d) => s + d.sizeKb, 0) ?? 0) / 1024 / 1024).toFixed(2)} GB`} icon={<ClipboardList size={20} />} tone="neutral" loading={loading} />
      </MetricGrid>
      <DataTable<ClinicalDocument> rowKey="id" columns={columns} data={data} loading={loading} searchKeys={['title', 'patientName', 'category']} filters={[{ key: 'category', label: 'Category', options: ['Lab Result', 'Imaging', 'Referral Letter', 'Discharge Summary', 'Consent', 'Insurance', 'Other'] }, { key: 'status', label: 'Status', options: ['Final', 'Signed', 'Pending Review', 'Draft'] }, { key: 'fileType', label: 'Type', options: ['PDF', 'DOCX', 'JPG', 'PNG', 'DICOM'] }]} exportable pageSize={15} />
    </>
  );
}
