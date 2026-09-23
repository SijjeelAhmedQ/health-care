import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Tag, Tooltip, message } from 'antd';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, Pencil, Trash2, UserPlus, UserRoundCheck } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { deletePatient, patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { usePatientOverview } from '@/hooks/usePatientData';
import { RecordRegistry } from '@/registry/recordRegistry';
import { PageRegistry } from '@/registry/pageRegistry';
import type { Patient } from '@/types/domain';
import { Avatar, MetricCard, MetricGrid, PageHeader, StatusTag, confirmAction } from '@/components/common';
import { DataTable, type DataColumn } from '@/components/tables/DataTable';
import { PatientFormModal } from '@/components/forms/PatientForm';
import { formatDate } from '@/utils/format';

/**
 * The Patient module — the entry point of the whole application.
 *
 * Searching and selecting a patient here sets the context every other module
 * works in; adding, updating and deleting patients also lives here.
 */
export default function PatientModulePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { needsPatientFor?: string } };
  const [params, setParams] = useSearchParams();
  const patients = useAppSelector(patientSelectors.selectAll);
  const loading = useAppSelector((s) => s.patients.status === 'loading' || s.patients.status === 'idle');
  const currentPatientId = useAppSelector((s) => s.patients.currentPatientId);
  const overview = usePatientOverview();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | undefined>();

  // A voice search ("search patient Ahmed") lands here with ?q= — keep the box in step.
  useEffect(() => {
    const q = params.get('q');
    if (q !== null && q !== search) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const patientsRef = useRef(patients);
  patientsRef.current = patients;

  const openCreate = useCallback(() => {
    setEditing(undefined);
    setFormOpen(true);
  }, []);
  const openEdit = useCallback((patient: Patient) => {
    setEditing(patient);
    setFormOpen(true);
  }, []);

  useEffect(
    () =>
      RecordRegistry.register({
        kind: 'patient',
        openCreate,
        openEdit: (id) => {
          const found = patientsRef.current.find((p) => p.id === id);
          if (!found) return false;
          openEdit(found);
          return true;
        },
        setSearch: (q) => {
          setSearch(q);
          setParams(q ? { q } : {}, { replace: true });
        },
      }),
    [openCreate, openEdit, setParams],
  );

  /** The route the guard interrupted, if any — that is where selecting should land. */
  const pendingDestination = location.state?.needsPatientFor;
  const pendingPage = pendingDestination ? PageRegistry.matchPath(pendingDestination) : undefined;

  /**
   * Selecting a patient is the start of the workflow: the context is set and the
   * user is taken into it — to the module they were heading for, or the dashboard.
   */
  const select = (patient: Patient) => {
    dispatch(setCurrentPatient(patient.id));
    message.success(`${patient.fullName} is now the selected patient`);
    navigate(pendingDestination ?? '/dashboard');
  };

  const remove = (patient: Patient) => {
    const isCurrent = patient.id === currentPatientId;
    confirmAction({
      title: 'Delete this patient?',
      danger: true,
      okText: 'Delete patient',
      content: (
        <div>
          <p style={{ marginTop: 0 }}>
            <strong>{patient.fullName}</strong> ({patient.mrn}) will be permanently removed. This cannot be undone.
          </p>
          {isCurrent && <p className="muted" style={{ marginBottom: 0 }}>This is the patient you are currently working on — the context will be cleared.</p>}
        </div>
      ),
      onOk: async () => {
        await dispatch(deletePatient(patient.id)).unwrap();
        message.success(`${patient.fullName} deleted`);
      },
    });
  };

  const columns: DataColumn<Patient>[] = [
    {
      key: 'fullName',
      title: 'Patient',
      dataIndex: 'fullName',
      hideable: false,
      mobile: 'primary',
      sorter: (a, b) => a.lastName.localeCompare(b.lastName),
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <Avatar name={row.fullName} size={34} />
          <div className="table-primary-cell">
            <strong>
              {row.fullName}
              {row.id === currentPatientId && <Tag color="blue" style={{ marginInlineStart: 8 }}>Selected</Tag>}
            </strong>
            <span>{row.mrn} · {row.age}y {row.gender}</span>
          </div>
        </div>
      ),
    },
    { key: 'phone', title: 'Phone', dataIndex: 'phone' },
    { key: 'primaryProviderName', title: 'Primary provider', dataIndex: 'primaryProviderName' },
    { key: 'lastVisit', title: 'Last visit', dataIndex: 'lastVisit', render: (v?: string) => formatDate(v), sorter: (a, b) => (a.lastVisit ?? '').localeCompare(b.lastVisit ?? '') },
    { key: 'riskLevel', title: 'Risk', dataIndex: 'riskLevel', defaultHidden: true, render: (v: string) => <StatusTag status={v} /> },
    { key: 'status', title: 'Status', dataIndex: 'status', render: (v: string) => <StatusTag status={v} /> },
    {
      key: 'actions',
      title: '',
      width: 190,
      align: 'right',
      hideable: false,
      mobile: 'actions',
      render: (_, row) => (
        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
          <Button
            size="small"
            type={row.id === currentPatientId ? 'default' : 'primary'}
            icon={<UserRoundCheck size={14} />}
            onClick={() => select(row)}
            disabled={row.id === currentPatientId}
          >
            {row.id === currentPatientId ? 'Selected' : 'Select'}
          </Button>
          <Tooltip title="Edit patient">
            <Button type="text" size="small" icon={<Pencil size={15} />} onClick={() => openEdit(row)} aria-label={`Edit ${row.fullName}`} />
          </Tooltip>
          <Tooltip title="Delete patient">
            <Button type="text" size="small" danger icon={<Trash2 size={15} />} onClick={() => remove(row)} aria-label={`Delete ${row.fullName}`} />
          </Tooltip>
        </div>
      ),
    },
  ];

  const selected = patients.find((p) => p.id === currentPatientId);

  return (
    <>
      <PageHeader
        title="Patient"
        subtitle="Search for a patient and select them. The selected patient is the context for the dashboard, medications, diagnoses, tasks, recalls, appointments and the summary."
        actions={
          <>
            {selected && (
              <Button icon={<LayoutDashboard size={15} />} onClick={() => navigate('/dashboard')}>
                Open dashboard
              </Button>
            )}
            <Button type="primary" icon={<UserPlus size={16} />} onClick={openCreate}>
              Add patient
            </Button>
          </>
        }
      />

      {pendingDestination && !selected && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Select a patient to open ${pendingPage?.title ?? 'that module'}`}
          description="Every module except this one works on one patient at a time. Pick someone below and you will be taken straight there."
        />
      )}

      <MetricGrid>
        <MetricCard label="Patients" value={patients.length} tone="primary" hint="Everyone registered at this practice" />
        <MetricCard label="Selected patient" value={selected ? selected.fullName : 'None selected'} tone={selected ? 'success' : 'warning'} hint={selected ? `MRN ${selected.mrn}` : 'Pick a patient to unlock the other modules'} />
        <MetricCard label="Their records" value={selected ? overview.counts.medication + overview.counts.diagnosis + overview.counts.task + overview.counts.recall + overview.counts.appointment : '—'} tone="info" hint="Medications, diagnoses, tasks, recalls and appointments" />
        <MetricCard label="Active patients" value={patients.filter((p) => p.status === 'Active').length} tone="neutral" />
      </MetricGrid>

      <DataTable<Patient>
        columns={columns}
        data={patients}
        loading={loading}
        rowKey="id"
        searchKeys={['fullName', 'mrn', 'phone', 'email', 'primaryProviderName']}
        searchPlaceholder="Search by name, MRN, phone or email…"
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setParams(v ? { q: v } : {}, { replace: true });
        }}
        filters={[
          { key: 'status', label: 'Status', options: ['Active', 'Inactive', 'Deceased', 'Pending'] },
          { key: 'gender', label: 'Gender', options: ['Male', 'Female', 'Other', 'Unknown'] },
          { key: 'riskLevel', label: 'Risk', options: ['Low', 'Medium', 'High'] },
        ]}
        onRowClick={(row) => select(row)}
        emptyTitle="No patients match"
        emptyDescription="Try a different name or search by MRN."
        emptyAction={
          <Button type="primary" icon={<UserPlus size={15} />} onClick={openCreate}>
            Add patient
          </Button>
        }
        exportable
        pageSize={10}
      />

      <PatientFormModal
        open={formOpen}
        onOpen={() => setFormOpen(true)}
        onClose={() => {
          setFormOpen(false);
          setEditing(undefined);
        }}
        patient={editing}
        onSaved={(patient, wasNew) => {
          // A newly registered patient becomes the context straight away — that is
          // almost always what you want next, and it keeps the banner truthful.
          if (wasNew) dispatch(setCurrentPatient(patient.id));
        }}
      />
    </>
  );
}
