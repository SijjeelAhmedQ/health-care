import dayjs, { type Dayjs } from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { createMedication, createPrescription } from '@/store/slices/medicationSlice';
import { patientSelectors } from '@/store/slices/patientSlice';
import { providerSelectors } from '@/store/slices/providerSlice';
import type { Medication, Patient, Prescription } from '@/types/domain';
import { FormGrid, FormSection } from '@/components/common';
import { RegisteredFormDrawer } from './RegisteredForm';
import { CheckboxField, DateField, NumberField, PatientSelectField, ProviderSelectField, SelectField, TextField } from './fields';

interface DrawerBase {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Lock the form to a patient (patient profile context). */
  patient?: Patient;
  onSaved?: () => void;
}

interface MedicationValues {
  patientName: string;
  medicationName: string;
  dosage: string;
  route?: string;
  frequency: string;
  duration?: string;
  startDate?: Dayjs;
  endDate?: Dayjs;
  indication?: string;
  refills?: number;
  isPRN?: boolean;
  instructions?: string;
  notes?: string;
  prescribedBy?: string;
}

export function MedicationFormDrawer({ open, onOpen, onClose, patient, onSaved }: DrawerBase) {
  const dispatch = useAppDispatch();
  const patients = useAppSelector(patientSelectors.selectAll);
  const user = useAppSelector((s) => s.auth.user);
  const formId = 'medication';

  const submit = async (v: MedicationValues) => {
    const target = patient ?? patients.find((p) => p.fullName === v.patientName);
    const input: Omit<Medication, 'id'> = {
      patientId: target?.id ?? 'unknown',
      patientName: target?.fullName ?? v.patientName,
      name: v.medicationName,
      dosage: v.dosage,
      route: v.route ?? 'Oral',
      frequency: v.frequency,
      duration: v.duration ?? 'Ongoing',
      startDate: (v.startDate ?? dayjs()).format('YYYY-MM-DD'),
      endDate: v.endDate?.format('YYYY-MM-DD'),
      prescribedBy: v.prescribedBy ?? user?.fullName ?? 'Unknown',
      indication: v.indication,
      instructions: v.instructions,
      notes: v.notes,
      refills: v.refills ?? 0,
      status: 'Active',
      isPRN: v.isPRN,
    };
    await dispatch(createMedication(input)).unwrap();
    onSaved?.();
  };

  return (
    <RegisteredFormDrawer<MedicationValues>
      formId={formId}
      title="Add Medication"
      description="Record a medication on the patient's active medication list. Saving requires confirmation."
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      onSubmit={submit}
      initialValues={{ patientName: patient?.fullName, route: 'Oral', startDate: dayjs(), refills: 0 }}
    >
      {({ fc }) => (
        <>
          <FormSection title="Patient">
            <FormGrid cols={2}>
              <PatientSelectField formId={formId} fc={fc} span={2} disabled={!!patient} />
            </FormGrid>
          </FormSection>
          <FormSection title="Medication">
            <FormGrid cols={2}>
              <TextField formId={formId} name="medicationName" fc={fc} span={2} placeholder="e.g. Amoxicillin" />
              <TextField formId={formId} name="dosage" fc={fc} placeholder="e.g. 500 mg" />
              <SelectField formId={formId} name="route" fc={fc} />
              <SelectField formId={formId} name="frequency" fc={fc} />
              <TextField formId={formId} name="duration" fc={fc} placeholder="e.g. 7 days" />
              <DateField formId={formId} name="startDate" fc={fc} />
              <DateField formId={formId} name="endDate" fc={fc} />
              <TextField formId={formId} name="indication" fc={fc} placeholder="Reason for medication" />
              <NumberField formId={formId} name="refills" fc={fc} min={0} max={12} />
              <ProviderSelectField formId={formId} name="prescribedBy" fc={fc} label="Prescribed By" />
              <CheckboxField formId={formId} name="isPRN" fc={fc} />
            </FormGrid>
          </FormSection>
          <FormSection title="Instructions">
            <FormGrid cols={2}>
              <TextField formId={formId} name="instructions" fc={fc} span={2} textarea rows={2} placeholder="e.g. Take with food" />
              <TextField formId={formId} name="notes" fc={fc} span={2} textarea rows={2} />
            </FormGrid>
          </FormSection>
        </>
      )}
    </RegisteredFormDrawer>
  );
}

interface PrescriptionValues {
  patientName: string;
  providerName?: string;
  medicationName: string;
  dosage: string;
  route?: string;
  frequency: string;
  duration?: string;
  quantity?: number;
  refills?: number;
  pharmacy?: string;
  substitutionAllowed?: boolean;
  instructions?: string;
}

export function PrescriptionFormDrawer({ open, onOpen, onClose, patient, onSaved }: DrawerBase) {
  const dispatch = useAppDispatch();
  const patients = useAppSelector(patientSelectors.selectAll);
  const providers = useAppSelector(providerSelectors.selectAll);
  const user = useAppSelector((s) => s.auth.user);
  const formId = 'prescription';

  const submit = async (v: PrescriptionValues) => {
    const target = patient ?? patients.find((p) => p.fullName === v.patientName);
    const provider = providers.find((p) => p.fullName === v.providerName) ?? providers.find((p) => p.id === user?.providerId);
    const input: Omit<Prescription, 'id'> = {
      rxNumber: `RX-${Math.floor(700000 + Math.random() * 99999)}`,
      patientId: target?.id ?? 'unknown',
      patientName: target?.fullName ?? v.patientName,
      providerId: provider?.id ?? 'unknown',
      providerName: provider?.fullName ?? user?.fullName ?? 'Unknown',
      medicationName: v.medicationName,
      dosage: v.dosage,
      route: v.route ?? 'Oral',
      frequency: v.frequency,
      duration: v.duration ?? 'Ongoing',
      quantity: v.quantity ?? 30,
      refills: v.refills ?? 0,
      pharmacy: v.pharmacy ?? 'CVS Pharmacy #1123',
      status: 'Sent',
      issuedAt: dayjs().format('YYYY-MM-DD'),
      substitutionAllowed: v.substitutionAllowed ?? true,
      instructions: v.instructions,
    };
    await dispatch(createPrescription(input)).unwrap();
    onSaved?.();
  };

  return (
    <RegisteredFormDrawer<PrescriptionValues>
      formId={formId}
      title="New Prescription"
      description="Create an electronic prescription. It is transmitted to the pharmacy only after you confirm."
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      onSubmit={submit}
      initialValues={{ patientName: patient?.fullName, route: 'Oral', quantity: 30, refills: 0, substitutionAllowed: true, pharmacy: 'CVS Pharmacy #1123' }}
    >
      {({ fc }) => (
        <>
          <FormSection title="Patient & Prescriber">
            <FormGrid cols={2}>
              <PatientSelectField formId={formId} fc={fc} disabled={!!patient} />
              <ProviderSelectField formId={formId} fc={fc} label="Prescriber" />
            </FormGrid>
          </FormSection>
          <FormSection title="Medication">
            <FormGrid cols={2}>
              <TextField formId={formId} name="medicationName" fc={fc} span={2} placeholder="e.g. Amoxicillin" />
              <TextField formId={formId} name="dosage" fc={fc} placeholder="e.g. 500 mg" />
              <SelectField formId={formId} name="route" fc={fc} />
              <SelectField formId={formId} name="frequency" fc={fc} />
              <TextField formId={formId} name="duration" fc={fc} placeholder="e.g. 7 days" />
              <NumberField formId={formId} name="quantity" fc={fc} min={1} />
              <NumberField formId={formId} name="refills" fc={fc} min={0} max={12} />
            </FormGrid>
          </FormSection>
          <FormSection title="Dispensing">
            <FormGrid cols={2}>
              <SelectField formId={formId} name="pharmacy" fc={fc} />
              <CheckboxField formId={formId} name="substitutionAllowed" fc={fc} />
              <TextField formId={formId} name="instructions" fc={fc} span={2} textarea rows={2} placeholder="Sig — e.g. Take 1 tablet by mouth twice daily with food" />
            </FormGrid>
          </FormSection>
        </>
      )}
    </RegisteredFormDrawer>
  );
}
