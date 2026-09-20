import { useEffect, useMemo } from 'react';
import { Button, Card, Descriptions, Skeleton, Tabs, Tag, Tooltip } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CalendarPlus, Pill, Stethoscope, Phone, Mail, MapPin } from 'lucide-react';
import { PageHeader, StatusTag, Avatar, EmptyState } from '@/components/common';
import { useAppDispatch, useAppSelector } from '@/store';
import { patientSelectors, setCurrentPatient } from '@/store/slices/patientSlice';
import { navigationActions } from '@/store/slices/navigationSlice';
import { mockDb } from '@/services/api';
import { formatDate } from '@/utils/format';
import { AllergiesTab, CommunicationTab, ContactsTab, DemographicsTab, DocumentsTab, HistoryTab, ImmunizationsTab, InsuranceTab, MedicationsTab, NotesTab, ProblemsTab, SummaryTab } from './PatientTabs';

const TABS = ['summary', 'demographics', 'history', 'allergies', 'medications', 'problems', 'immunizations', 'documents', 'notes', 'insurance', 'contacts', 'communication'] as const;
type Tab = (typeof TABS)[number];
const tabLabels: Record<Tab, string> = { summary: 'Summary', demographics: 'Demographics', history: 'Medical History', allergies: 'Allergies', medications: 'Medications', problems: 'Problems', immunizations: 'Immunizations', documents: 'Documents', notes: 'Notes', insurance: 'Insurance', contacts: 'Contacts', communication: 'Communication' };

export default function PatientProfilePage() {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const patient = useAppSelector((s) => (id ? patientSelectors.selectById(s, id) : undefined));
  const loading = useAppSelector((s) => s.patients.status === 'loading' || s.patients.status === 'idle');
  const activeTabFromState = useAppSelector((s) => s.navigation.activeTabs['patient-profile']);
  const activeTab: Tab = (TABS as readonly string[]).includes(tab ?? '') ? (tab as Tab) : (TABS as readonly string[]).includes(activeTabFromState ?? '') && !tab ? (activeTabFromState as Tab) : 'summary';

  useEffect(() => {
    if (id) dispatch(setCurrentPatient(id));
  }, [id, dispatch]);

  useEffect(() => {
    if (tab) dispatch(navigationActions.setActiveTab({ pageId: 'patient-profile', tab }));
  }, [tab, dispatch]);

  const allergies = useMemo(() => mockDb.allergies.filter((a) => a.patientId === id && a.status === 'Active'), [id]);
  const activeMeds = useMemo(() => mockDb.medications.filter((m) => m.patientId === id && m.status === 'Active').length, [id]);

  if (loading && !patient) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (!patient) return <EmptyState title="Patient not found" description="The patient record may have been removed." action={<Button onClick={() => navigate('/patients')}>Back to patient list</Button>} />;

  return (
    <>
      <PageHeader
        title={patient.fullName}
        breadcrumbs={[{ title: <a onClick={() => navigate('/dashboard')}>Home</a> }, { title: <a onClick={() => navigate('/patients')}>Patients</a> }, { title: patient.fullName }, { title: tabLabels[activeTab] }]}
        actions={
          <>
            <Button icon={<Pill size={15} />} onClick={() => navigate(`/patients/${patient.id}/medications`)}>Medications</Button>
            <Button icon={<Stethoscope size={15} />} onClick={() => navigate(`/clinical/consultation?patient=${patient.id}`)}>Start Consultation</Button>
            <Button type="primary" icon={<CalendarPlus size={15} />} onClick={() => navigate(`/appointments/create?patient=${patient.id}`)}>Book Appointment</Button>
          </>
        }
        extra={
          <Card style={{ marginTop: 12 }} styles={{ body: { padding: 16 } }}>
            <div className="flex gap-3 wrap" style={{ alignItems: 'center' }}>
              <Avatar name={patient.fullName} size={56} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="flex items-center gap-2 wrap">
                  <strong style={{ fontSize: 16 }}>{patient.fullName}</strong>
                  <StatusTag status={patient.status} />
                  <Tag>{patient.mrn}</Tag>
                  <Tag color={patient.riskLevel === 'High' ? 'red' : patient.riskLevel === 'Medium' ? 'gold' : 'green'}>{patient.riskLevel} risk</Tag>
                </div>
                <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>
                  {patient.age} y · {patient.gender} · DOB {formatDate(patient.dateOfBirth)} · Blood {patient.bloodGroup} · PCP {patient.primaryProviderName}
                </div>
                <div className="flex gap-3 wrap muted" style={{ fontSize: 12, marginTop: 6 }}>
                  <span className="flex items-center gap-2"><Phone size={12} /> {patient.phone}</span>
                  <span className="flex items-center gap-2"><Mail size={12} /> {patient.email}</span>
                  <span className="flex items-center gap-2"><MapPin size={12} /> {patient.address.city}, {patient.address.state}</span>
                </div>
              </div>
              <Descriptions size="small" column={{ xs: 2, md: 4 }} style={{ minWidth: 300 }} items={[
                { key: 'a', label: 'Allergies', children: allergies.length ? <Tooltip title={allergies.map((a) => a.allergen).join(', ')}><span style={{ color: '#d64545', fontWeight: 600 }} className="flex items-center gap-2"><AlertTriangle size={13} /> {allergies.length}</span></Tooltip> : 'None known' },
                { key: 'm', label: 'Active meds', children: activeMeds },
                { key: 'l', label: 'Last visit', children: formatDate(patient.lastVisit) },
                { key: 'n', label: 'Next appt', children: patient.nextAppointment ? formatDate(patient.nextAppointment) : '—' },
              ]} />
            </div>
          </Card>
        }
      />
      <Tabs
        activeKey={activeTab}
        onChange={(k) => navigate(`/patients/${patient.id}/${k}`)}
        items={TABS.map((t) => ({ key: t, label: tabLabels[t] }))}
        tabBarStyle={{ marginBottom: 16 }}
        size="middle"
        tabBarGutter={20}
      />
      {activeTab === 'summary' && <SummaryTab patient={patient} />}
      {activeTab === 'demographics' && <DemographicsTab patient={patient} />}
      {activeTab === 'history' && <HistoryTab patient={patient} />}
      {activeTab === 'allergies' && <AllergiesTab patient={patient} />}
      {activeTab === 'medications' && <MedicationsTab patient={patient} />}
      {activeTab === 'problems' && <ProblemsTab patient={patient} />}
      {activeTab === 'immunizations' && <ImmunizationsTab patient={patient} />}
      {activeTab === 'documents' && <DocumentsTab patient={patient} />}
      {activeTab === 'notes' && <NotesTab patient={patient} />}
      {activeTab === 'insurance' && <InsuranceTab patient={patient} />}
      {activeTab === 'contacts' && <ContactsTab patient={patient} />}
      {activeTab === 'communication' && <CommunicationTab patient={patient} />}
    </>
  );
}
