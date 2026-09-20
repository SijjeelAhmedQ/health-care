import dayjs, { type Dayjs } from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { createAppointment } from '@/store/slices/appointmentSlice';
import { patientSelectors } from '@/store/slices/patientSlice';
import { providerSelectors } from '@/store/slices/providerSlice';
import type { Appointment, AppointmentType, Patient } from '@/types/domain';
import { FormGrid, FormSection } from '@/components/common';
import { RegisteredFormCard, RegisteredFormDrawer, type FormHelpers } from './RegisteredForm';
import { CheckboxField, DateField, NumberField, PatientSelectField, ProviderSelectField, SelectField, TextField, TimeField } from './fields';
import { mockDb } from '@/services/api';

export interface AppointmentValues {
  patientName: string;
  providerName: string;
  date: Dayjs;
  startTime: Dayjs;
  durationMinutes?: number;
  type?: AppointmentType;
  locationName?: string;
  room?: string;
  priority?: Appointment['priority'];
  reason: string;
  isTelehealth?: boolean;
  sendReminder?: boolean;
  notes?: string;
}

const formId = 'appointment';

export function AppointmentFields({ fc, lockPatient }: FormHelpers<AppointmentValues> & { lockPatient?: boolean }) {
  return (
    <>
      <FormSection title="Who">
        <FormGrid>
          <PatientSelectField formId={formId} fc={fc} span={2} disabled={lockPatient} />
          <ProviderSelectField formId={formId} fc={fc} span={2} />
        </FormGrid>
      </FormSection>
      <FormSection title="When">
        <FormGrid>
          <DateField formId={formId} name="date" fc={fc} />
          <TimeField formId={formId} name="startTime" fc={fc} />
          <NumberField formId={formId} name="durationMinutes" fc={fc} min={5} max={240} suffix="min" />
          <SelectField formId={formId} name="type" fc={fc} />
        </FormGrid>
      </FormSection>
      <FormSection title="Where & Why">
        <FormGrid>
          <SelectField formId={formId} name="locationName" fc={fc} span={2} />
          <SelectField formId={formId} name="room" fc={fc} options={mockDb.rooms.filter((r) => r.type === 'Exam Room').map((r) => `${r.name} (${r.locationName.split(' ')[0]})`)} />
          <SelectField formId={formId} name="priority" fc={fc} />
          <TextField formId={formId} name="reason" fc={fc} span={4} placeholder="Chief complaint / reason for visit" />
          <CheckboxField formId={formId} name="isTelehealth" fc={fc} />
          <CheckboxField formId={formId} name="sendReminder" fc={fc} />
          <TextField formId={formId} name="notes" fc={fc} span={4} textarea rows={2} placeholder="Internal scheduling notes" />
        </FormGrid>
      </FormSection>
    </>
  );
}

export function useAppointmentSubmit(onSaved?: (a: Appointment) => void) {
  const dispatch = useAppDispatch();
  const patients = useAppSelector(patientSelectors.selectAll);
  const providers = useAppSelector(providerSelectors.selectAll);
  return async (v: AppointmentValues) => {
    const patient = patients.find((p) => p.fullName === v.patientName);
    const provider = providers.find((p) => p.fullName === v.providerName);
    const duration = v.durationMinutes ?? 30;
    const start = v.startTime;
    const location = mockDb.locations.find((l) => l.name === v.locationName) ?? mockDb.locations.find((l) => l.id === provider?.locationId) ?? mockDb.locations[0];
    const input: Omit<Appointment, 'id'> = {
      code: `APT-${Math.floor(20270000 + Math.random() * 9999)}`,
      patientId: patient?.id ?? 'unknown',
      patientName: patient?.fullName ?? v.patientName,
      patientMrn: patient?.mrn ?? '—',
      providerId: provider?.id ?? 'unknown',
      providerName: provider?.fullName ?? v.providerName,
      date: v.date.format('YYYY-MM-DD'),
      startTime: start.format('HH:mm'),
      endTime: start.add(duration, 'minute').format('HH:mm'),
      durationMinutes: duration,
      type: v.type ?? 'Follow-up',
      locationId: v.isTelehealth ? 'loc-4' : location.id,
      locationName: v.isTelehealth ? 'CareFlow Virtual Care' : location.name,
      room: v.room,
      status: 'Scheduled',
      reason: v.reason,
      notes: v.notes,
      priority: v.priority ?? 'Routine',
      createdAt: new Date().toISOString(),
      isTelehealth: !!v.isTelehealth,
      reminderSent: !!v.sendReminder,
    };
    const created = await dispatch(createAppointment(input)).unwrap();
    onSaved?.(created);
  };
}

const defaults = (patient?: Patient): Partial<AppointmentValues> => ({
  patientName: patient?.fullName,
  date: dayjs().add(1, 'day'),
  durationMinutes: 30,
  type: 'Follow-up',
  priority: 'Routine',
  sendReminder: true,
  locationName: 'Riverside Medical Center',
});

export function AppointmentFormDrawer({ open, onOpen, onClose, patient, onSaved }: { open: boolean; onOpen: () => void; onClose: () => void; patient?: Patient; onSaved?: (a: Appointment) => void }) {
  const submit = useAppointmentSubmit(onSaved);
  return (
    <RegisteredFormDrawer<AppointmentValues> formId={formId} title="Create Appointment" description="Book a visit. The appointment is only created after you confirm." open={open} onOpen={onOpen} onClose={onClose} onSubmit={submit} initialValues={defaults(patient)} width={720}>
      {(h) => <AppointmentFields {...h} lockPatient={!!patient} />}
    </RegisteredFormDrawer>
  );
}

export function AppointmentFormCard({ onSaved, initial }: { onSaved?: (a: Appointment) => void; initial?: Partial<AppointmentValues> }) {
  const submit = useAppointmentSubmit(onSaved);
  return (
    <RegisteredFormCard<AppointmentValues> formId={formId} title="Appointment" onSubmit={submit} initialValues={{ ...defaults(), ...initial }} successMessage="Appointment booked">
      {(h) => <AppointmentFields {...h} />}
    </RegisteredFormCard>
  );
}
