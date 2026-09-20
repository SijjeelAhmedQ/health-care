import dayjs, { type Dayjs } from 'dayjs';
import { useAppSelector } from '@/store';
import { patientSelectors } from '@/store/slices/patientSlice';
import { allergyService, imagingOrderService, labOrderService, problemService, referralService } from '@/services/api';
import type { Allergy, ImagingOrder, LabOrder, Patient, Problem, Referral } from '@/types/domain';
import { FormGrid } from '@/components/common';
import { RegisteredFormDrawer } from './RegisteredForm';
import { CheckboxField, DateField, PatientSelectField, ProviderSelectField, SelectField, TextField } from './fields';

interface DrawerBase<T> {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  patient?: Patient;
  onSaved?: (record: T) => void;
}

function usePatientResolver(patient?: Patient) {
  const patients = useAppSelector(patientSelectors.selectAll);
  return (name?: string) => patient ?? patients.find((p) => p.fullName === name);
}

// ---------------------------------------------------------------- Allergy
interface AllergyValues { allergen: string; type?: Allergy['type']; reaction: string; severity: Allergy['severity']; onsetDate?: Dayjs; status?: Allergy['status']; notes?: string }

export function AllergyFormDrawer({ open, onOpen, onClose, patient, onSaved }: DrawerBase<Allergy>) {
  const user = useAppSelector((s) => s.auth.user);
  const formId = 'allergy';
  const submit = async (v: AllergyValues) => {
    const saved = await allergyService.create({
      patientId: patient?.id ?? 'unknown', allergen: v.allergen, type: v.type ?? 'Other', reaction: v.reaction, severity: v.severity, status: v.status ?? 'Active',
      onsetDate: v.onsetDate?.format('YYYY-MM-DD'), recordedBy: user?.fullName ?? 'Unknown', notes: v.notes,
    });
    onSaved?.(saved);
  };
  return (
    <RegisteredFormDrawer<AllergyValues> formId={formId} title="Add Allergy" description={patient ? `Recording for ${patient.fullName}` : undefined} open={open} onOpen={onOpen} onClose={onClose} onSubmit={submit} initialValues={{ status: 'Active', type: 'Drug' }}>
      {({ fc }) => (
        <FormGrid cols={2}>
          <TextField formId={formId} name="allergen" fc={fc} span={2} placeholder="e.g. Penicillin" />
          <SelectField formId={formId} name="type" fc={fc} />
          <SelectField formId={formId} name="severity" fc={fc} />
          <TextField formId={formId} name="reaction" fc={fc} span={2} placeholder="e.g. Rash, hives" />
          <DateField formId={formId} name="onsetDate" fc={fc} />
          <SelectField formId={formId} name="status" fc={fc} />
          <TextField formId={formId} name="notes" fc={fc} span={2} textarea />
        </FormGrid>
      )}
    </RegisteredFormDrawer>
  );
}

// ---------------------------------------------------------------- Problem / Diagnosis
interface ProblemValues { patientName?: string; icd10?: string; description: string; status?: Problem['status']; severity?: Problem['severity']; onsetDate?: Dayjs; isPrimary?: boolean; notes?: string }

export function ProblemFormDrawer({ open, onOpen, onClose, patient, onSaved }: DrawerBase<Problem>) {
  const user = useAppSelector((s) => s.auth.user);
  const resolve = usePatientResolver(patient);
  const formId = 'problem';
  const submit = async (v: ProblemValues) => {
    const target = resolve(v.patientName);
    const saved = await problemService.create({
      patientId: target?.id ?? 'unknown', icd10: v.icd10 ?? '—', description: v.description, status: v.status ?? 'Active', onsetDate: (v.onsetDate ?? dayjs()).format('YYYY-MM-DD'),
      severity: v.severity ?? 'Moderate', diagnosedBy: user?.fullName ?? 'Unknown', notes: v.notes,
    });
    onSaved?.(saved);
  };
  return (
    <RegisteredFormDrawer<ProblemValues> formId={formId} title="Add Diagnosis" open={open} onOpen={onOpen} onClose={onClose} onSubmit={submit} initialValues={{ patientName: patient?.fullName, status: 'Active', severity: 'Moderate', onsetDate: dayjs() }}>
      {({ fc }) => (
        <FormGrid cols={2}>
          <PatientSelectField formId={formId} fc={fc} span={2} disabled={!!patient} />
          <TextField formId={formId} name="icd10" fc={fc} placeholder="e.g. I10" />
          <TextField formId={formId} name="description" fc={fc} placeholder="e.g. Essential hypertension" />
          <SelectField formId={formId} name="status" fc={fc} />
          <SelectField formId={formId} name="severity" fc={fc} />
          <DateField formId={formId} name="onsetDate" fc={fc} />
          <CheckboxField formId={formId} name="isPrimary" fc={fc} />
          <TextField formId={formId} name="notes" fc={fc} span={2} textarea />
        </FormGrid>
      )}
    </RegisteredFormDrawer>
  );
}

// ---------------------------------------------------------------- Lab order
interface LabValues { patientName: string; testName: string; priority?: LabOrder['priority']; specimen?: string; lab?: string; fasting?: boolean; clinicalNotes?: string; providerName?: string }

export function LabOrderFormDrawer({ open, onOpen, onClose, patient, onSaved }: DrawerBase<LabOrder>) {
  const user = useAppSelector((s) => s.auth.user);
  const resolve = usePatientResolver(patient);
  const formId = 'lab-order';
  const submit = async (v: LabValues) => {
    const target = resolve(v.patientName);
    const saved = await labOrderService.create({
      orderNumber: `LAB-${Math.floor(310000 + Math.random() * 9999)}`, patientId: target?.id ?? 'unknown', patientName: target?.fullName ?? v.patientName, providerName: v.providerName ?? user?.fullName ?? 'Unknown',
      testName: v.testName, panel: 'Custom', priority: v.priority ?? 'Routine', status: 'Ordered', orderedAt: new Date().toISOString(), specimen: v.specimen ?? 'Serum', lab: v.lab ?? 'In-house Lab', fasting: !!v.fasting,
    });
    onSaved?.(saved);
  };
  return (
    <RegisteredFormDrawer<LabValues> formId={formId} title="New Lab Order" open={open} onOpen={onOpen} onClose={onClose} onSubmit={submit} initialValues={{ patientName: patient?.fullName, priority: 'Routine', lab: 'In-house Lab', specimen: 'Serum' }}>
      {({ fc }) => (
        <FormGrid cols={2}>
          <PatientSelectField formId={formId} fc={fc} disabled={!!patient} />
          <ProviderSelectField formId={formId} fc={fc} label="Ordering Provider" />
          <SelectField formId={formId} name="testName" fc={fc} span={2} />
          <SelectField formId={formId} name="priority" fc={fc} />
          <SelectField formId={formId} name="specimen" fc={fc} />
          <SelectField formId={formId} name="lab" fc={fc} />
          <CheckboxField formId={formId} name="fasting" fc={fc} />
          <TextField formId={formId} name="clinicalNotes" fc={fc} span={2} textarea placeholder="Clinical indication" />
        </FormGrid>
      )}
    </RegisteredFormDrawer>
  );
}

// ---------------------------------------------------------------- Imaging order
interface ImagingValues { patientName: string; modality: ImagingOrder['modality']; bodyPart: string; priority?: ImagingOrder['priority']; facility?: string; contrast?: boolean; clinicalIndication: string; scheduledFor?: Dayjs }

export function ImagingOrderFormDrawer({ open, onOpen, onClose, patient, onSaved }: DrawerBase<ImagingOrder>) {
  const user = useAppSelector((s) => s.auth.user);
  const resolve = usePatientResolver(patient);
  const formId = 'imaging-order';
  const submit = async (v: ImagingValues) => {
    const target = resolve(v.patientName);
    const saved = await imagingOrderService.create({
      orderNumber: `IMG-${Math.floor(510000 + Math.random() * 9999)}`, patientId: target?.id ?? 'unknown', patientName: target?.fullName ?? v.patientName, providerName: user?.fullName ?? 'Unknown',
      modality: v.modality, bodyPart: v.bodyPart, priority: v.priority ?? 'Routine', status: v.scheduledFor ? 'Scheduled' : 'Ordered', orderedAt: new Date().toISOString(), scheduledFor: v.scheduledFor?.toISOString(),
      facility: v.facility ?? 'Riverside Imaging', contrast: !!v.contrast, clinicalIndication: v.clinicalIndication,
    });
    onSaved?.(saved);
  };
  return (
    <RegisteredFormDrawer<ImagingValues> formId={formId} title="New Imaging Order" open={open} onOpen={onOpen} onClose={onClose} onSubmit={submit} initialValues={{ patientName: patient?.fullName, priority: 'Routine', facility: 'Riverside Imaging' }} submitLabel="Place Order">
      {({ fc }) => (
        <FormGrid cols={2}>
          <PatientSelectField formId="lab-order" fc={fc} disabled={!!patient} />
          <SelectField formId={formId} name="modality" fc={fc} label="Modality" options={['X-Ray', 'CT', 'MRI', 'Ultrasound', 'Mammography', 'PET']} rules={[{ required: true }]} />
          <TextField formId={formId} name="bodyPart" fc={fc} label="Body Part" rules={[{ required: true, message: 'Body part is required' }]} />
          <SelectField formId={formId} name="priority" fc={fc} label="Priority" options={['Routine', 'Urgent', 'STAT']} />
          <SelectField formId={formId} name="facility" fc={fc} label="Facility" options={['Riverside Imaging', 'Austin Radiology Associates', 'Lakeside Diagnostics']} />
          <DateField formId={formId} name="scheduledFor" fc={fc} label="Scheduled For" />
          <CheckboxField formId={formId} name="contrast" fc={fc} label="With contrast" />
          <TextField formId={formId} name="clinicalIndication" fc={fc} span={2} textarea label="Clinical Indication" rules={[{ required: true, message: 'Indication is required' }]} />
        </FormGrid>
      )}
    </RegisteredFormDrawer>
  );
}

// ---------------------------------------------------------------- Referral
interface ReferralValues { patientName: string; specialty: string; referredTo?: string; priority?: Referral['priority']; reason: string; insuranceAuth?: string }

export function ReferralFormDrawer({ open, onOpen, onClose, patient, onSaved }: DrawerBase<Referral>) {
  const user = useAppSelector((s) => s.auth.user);
  const resolve = usePatientResolver(patient);
  const formId = 'referral';
  const submit = async (v: ReferralValues) => {
    const target = resolve(v.patientName);
    const saved = await referralService.create({
      referralNumber: `REF-${Math.floor(81000 + Math.random() * 999)}`, patientId: target?.id ?? 'unknown', patientName: target?.fullName ?? v.patientName, referringProvider: user?.fullName ?? 'Unknown',
      referredTo: v.referredTo ?? `${v.specialty} specialist`, specialty: v.specialty, reason: v.reason, priority: v.priority ?? 'Routine', status: 'Pending',
      createdAt: new Date().toISOString(), expiresAt: dayjs().add(90, 'day').format('YYYY-MM-DD'), insuranceAuth: v.insuranceAuth,
    });
    onSaved?.(saved);
  };
  return (
    <RegisteredFormDrawer<ReferralValues> formId={formId} title="New Referral" open={open} onOpen={onOpen} onClose={onClose} onSubmit={submit} initialValues={{ patientName: patient?.fullName, priority: 'Routine' }}>
      {({ fc }) => (
        <FormGrid cols={2}>
          <PatientSelectField formId={formId} fc={fc} span={2} disabled={!!patient} />
          <SelectField formId={formId} name="specialty" fc={fc} />
          <TextField formId={formId} name="referredTo" fc={fc} placeholder="Specialist or practice" />
          <SelectField formId={formId} name="priority" fc={fc} />
          <TextField formId={formId} name="insuranceAuth" fc={fc} />
          <TextField formId={formId} name="reason" fc={fc} span={2} textarea />
        </FormGrid>
      )}
    </RegisteredFormDrawer>
  );
}
