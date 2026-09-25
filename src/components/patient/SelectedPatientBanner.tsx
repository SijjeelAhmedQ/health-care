import { useState } from 'react';
import { Button, Tag, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ClipboardList, ListChecks, Mail, Phone, Pill, Repeat, Stethoscope, UserRound, UserRoundCog } from 'lucide-react';
import dayjs from 'dayjs';
import { Avatar } from '@/components/common';
import { usePatientOverview, useSelectedPatient } from '@/hooks/usePatientData';
import { PageRegistry } from '@/registry/pageRegistry';
import { PatientPicker } from './PatientPicker';

interface QuickStat {
  key: string;
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  to: string;
  tone?: 'normal' | 'warning';
}

/**
 * The persistent answer to "which patient am I working on?".
 *
 * Rendered above every patient-dependent page: demographics on the left, a live
 * overview of the patient's medications, diagnoses, tasks, recalls and
 * appointments on the right, and an obvious way to switch patient.
 */
export function SelectedPatientBanner() {
  const patient = useSelectedPatient();
  const overview = usePatientOverview();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!patient) return null;
  const { counts, highlights } = overview;

  const stats: QuickStat[] = [
    {
      key: 'medication',
      label: 'Medication',
      value: String(counts.medication),
      hint: `${highlights.activeMedications} active of ${counts.medication}`,
      icon: <Pill size={15} />,
      to: PageRegistry.recordTab('medication').path,
    },
    {
      key: 'diagnosis',
      label: 'Diagnosis',
      value: String(counts.diagnosis),
      hint: `${highlights.activeDiagnoses} active or chronic`,
      icon: <Stethoscope size={15} />,
      to: PageRegistry.recordTab('diagnosis').path,
    },
    {
      key: 'task',
      label: 'Task',
      value: String(highlights.openTasks),
      hint: highlights.overdueTasks ? `${highlights.overdueTasks} overdue of ${highlights.openTasks} open` : `${highlights.openTasks} open of ${counts.task}`,
      icon: <ListChecks size={15} />,
      to: PageRegistry.recordTab('task').path,
      tone: highlights.overdueTasks ? 'warning' : 'normal',
    },
    {
      key: 'recall',
      label: 'Recall',
      value: String(highlights.dueRecalls),
      hint: `${highlights.dueRecalls} due of ${counts.recall}`,
      icon: <Repeat size={15} />,
      to: PageRegistry.recordTab('recall').path,
      tone: highlights.dueRecalls ? 'warning' : 'normal',
    },
    {
      key: 'appointment',
      label: 'Appointment',
      value: highlights.nextAppointment ? dayjs(highlights.nextAppointment.date).format('D MMM') : '—',
      hint: highlights.nextAppointment
        ? `Next: ${highlights.nextAppointment.type} with ${highlights.nextAppointment.providerName}`
        : `No upcoming appointment (${counts.appointment} in history)`,
      icon: <CalendarDays size={15} />,
      to: PageRegistry.recordTab('appointment').path,
    },
  ];

  return (
    <>
      {/* Identity · record overview · switch — one row on wide screens, two on narrower ones. */}
      <section className="patient-banner" aria-label={`Selected patient: ${patient.fullName}`}>
        <div className="patient-banner-grid">
          <div className="patient-banner-identity">
            <Avatar name={patient.fullName} size={42} />
            <div className="patient-banner-who">
              <div className="patient-banner-name">
                <span className="patient-banner-fullname">{patient.fullName}</span>
                <Tag color={patient.status === 'Active' ? 'green' : 'default'}>{patient.status}</Tag>
                {patient.riskLevel === 'High' && <Tag color="red">High risk</Tag>}
              </div>
              <div className="patient-banner-demographics sep-list">
                <span><strong>{patient.mrn}</strong></span>
                <span>{patient.age} yrs · {patient.gender}</span>
                <span>DOB {dayjs(patient.dateOfBirth).format('D MMM YYYY')}</span>
                <span>Blood {patient.bloodGroup}</span>
              </div>
              <div className="patient-banner-contacts sep-list">
                <span><Phone size={12} aria-hidden /> {patient.phone}</span>
                <span className="patient-banner-email"><Mail size={12} aria-hidden /> {patient.email}</span>
                <span><UserRound size={12} aria-hidden /> {patient.primaryProviderName}</span>
              </div>
            </div>
          </div>

          <div className="patient-banner-switch">
            <Button icon={<UserRoundCog size={15} />} onClick={() => setPickerOpen(true)}>
              Change patient
            </Button>
            <Button type="text" size="small" icon={<ClipboardList size={14} />} onClick={() => navigate('/summary')}>
              Open summary
            </Button>
          </div>

        </div>
      </section>

      <PatientPicker open={pickerOpen} onClose={() => setPickerOpen(false)} title="Change patient" />
    </>
  );
}
