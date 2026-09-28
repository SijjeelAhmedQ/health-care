import { useState } from 'react';
import { Button, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Mail, Phone, UserRound, UserRoundCog } from 'lucide-react';
import dayjs from 'dayjs';
import { Avatar } from '@/components/common';
import { useSelectedPatient } from '@/hooks/usePatientData';
import { PatientPicker } from './PatientPicker';

/**
 * The persistent answer to "which patient am I working on?".
 *
 * Rendered above every patient-dependent page: who the patient is, how to
 * reach them, and an obvious way to switch patient. Their records are counted
 * in the Summary's own tabs right below.
 */
export function SelectedPatientBanner() {
  const patient = useSelectedPatient();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!patient) return null;
  return (
    <>
      {/* Identity · switch — one row on wide screens, two on narrower ones. */}
      <section className="patient-banner" aria-label={`Selected patient: ${patient.fullName}`}>
        <div className="patient-banner-grid">
          <div className="patient-banner-identity">
            <Avatar name={patient.fullName} size={48} />
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
            <Button icon={<ClipboardList size={15} />} onClick={() => navigate('/summary')}>
              Open summary
            </Button>
          </div>

        </div>
      </section>

      <PatientPicker open={pickerOpen} onClose={() => setPickerOpen(false)} title="Change patient" />
    </>
  );
}
