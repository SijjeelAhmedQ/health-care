import dayjs, { type Dayjs } from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { createPatient, updatePatient } from '@/store/slices/patientSlice';
import { providerSelectors } from '@/store/slices/providerSlice';
import type { Patient } from '@/types/domain';
import { FormGrid, FormSection } from '@/components/common';
import { RegisteredFormCard, RegisteredFormDrawer, type FormHelpers } from './RegisteredForm';
import { CheckboxField, DateField, NumberField, ProviderSelectField, SelectField, TextField } from './fields';

export interface PatientValues {
  firstName: string;
  lastName: string;
  dateOfBirth: Dayjs;
  age?: number;
  gender: Patient['gender'];
  bloodGroup?: Patient['bloodGroup'];
  maritalStatus?: Patient['maritalStatus'];
  language?: string;
  occupation?: string;
  phone: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  insuranceProvider?: string;
  insurancePlan?: string;
  policyNumber?: string;
  primaryProviderName?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  consentToContact?: boolean;
  notes?: string;
}

const formId = 'patient';

/** Address sub-form — reused by patient + practice forms. */
export function AddressFields({ fc, prefix = '' }: { fc: FormHelpers<PatientValues>['fc']; prefix?: string }) {
  return (
    <FormGrid>
      <TextField formId={formId} name={`${prefix}addressLine1`} fc={fc} span={2} label="Address Line 1" placeholder="Street address" />
      <TextField formId={formId} name={`${prefix}addressLine2`} fc={fc} span={2} label="Address Line 2" placeholder="Apt, suite, unit" />
      <TextField formId={formId} name={`${prefix}city`} fc={fc} label="City" />
      <TextField formId={formId} name={`${prefix}state`} fc={fc} label="State" />
      <TextField formId={formId} name={`${prefix}postalCode`} fc={fc} label="Postal Code" />
      <TextField formId={formId} name={`${prefix}country`} fc={fc} label="Country" />
    </FormGrid>
  );
}

export function InsuranceFields({ fc }: { fc: FormHelpers<PatientValues>['fc'] }) {
  return (
    <FormGrid>
      <SelectField formId={formId} name="insuranceProvider" fc={fc} span={2} />
      <TextField formId={formId} name="insurancePlan" fc={fc} placeholder="e.g. PPO Gold" />
      <TextField formId={formId} name="policyNumber" fc={fc} placeholder="Member / policy ID" />
    </FormGrid>
  );
}

export function PatientFields({ fc }: FormHelpers<PatientValues>) {
  return (
    <>
      <FormSection title="Demographics">
        <FormGrid>
          <TextField formId={formId} name="firstName" fc={fc} />
          <TextField formId={formId} name="lastName" fc={fc} />
          <DateField formId={formId} name="dateOfBirth" fc={fc} />
          <NumberField formId={formId} name="age" fc={fc} min={0} max={130} />
          <SelectField formId={formId} name="gender" fc={fc} />
          <SelectField formId={formId} name="bloodGroup" fc={fc} />
          <SelectField formId={formId} name="maritalStatus" fc={fc} />
          <SelectField formId={formId} name="language" fc={fc} />
          <TextField formId={formId} name="occupation" fc={fc} span={2} />
          <ProviderSelectField formId={formId} name="primaryProviderName" fc={fc} span={2} />
        </FormGrid>
      </FormSection>
      <FormSection title="Contact">
        <FormGrid>
          <TextField formId={formId} name="phone" fc={fc} span={2} placeholder="(555) 555-0100" rules={[{ pattern: /[\d\s()+-]{7,}/, message: 'Enter a valid phone number' }]} />
          <TextField formId={formId} name="email" fc={fc} span={2} rules={[{ type: 'email', message: 'Enter a valid email' }]} />
        </FormGrid>
        <AddressFields fc={fc} />
      </FormSection>
      <FormSection title="Insurance">
        <InsuranceFields fc={fc} />
      </FormSection>
      <FormSection title="Emergency Contact">
        <FormGrid>
          <TextField formId={formId} name="emergencyContactName" fc={fc} span={2} />
          <TextField formId={formId} name="emergencyContactPhone" fc={fc} />
          <SelectField formId={formId} name="emergencyContactRelation" fc={fc} />
        </FormGrid>
      </FormSection>
      <FormSection title="Consent & Notes">
        <FormGrid>
          <CheckboxField formId={formId} name="consentToContact" fc={fc} span={4} label="Patient consents to appointment reminders and communication via phone/SMS/email" />
          <TextField formId={formId} name="notes" fc={fc} span={4} textarea rows={3} />
        </FormGrid>
      </FormSection>
    </>
  );
}

export function usePatientSubmit(onSaved?: (p: Patient) => void, existing?: Patient) {
  const dispatch = useAppDispatch();
  const providers = useAppSelector(providerSelectors.selectAll);
  return async (v: PatientValues) => {
    const provider = providers.find((p) => p.fullName === v.primaryProviderName) ?? providers[0];
    const dob = v.dateOfBirth ?? (v.age ? dayjs().subtract(v.age, 'year') : dayjs());
    const base: Omit<Patient, 'id'> = {
      mrn: existing?.mrn ?? `MRN-${Math.floor(110000 + Math.random() * 89999)}`,
      firstName: v.firstName,
      lastName: v.lastName,
      fullName: `${v.firstName} ${v.lastName}`,
      dateOfBirth: dob.format('YYYY-MM-DD'),
      age: v.age ?? dayjs().diff(dob, 'year'),
      gender: v.gender,
      bloodGroup: v.bloodGroup ?? 'Unknown',
      phone: v.phone,
      email: v.email ?? '',
      address: { line1: v.addressLine1 ?? '', line2: v.addressLine2, city: v.city ?? '', state: v.state ?? '', postalCode: v.postalCode ?? '', country: v.country ?? 'USA' },
      maritalStatus: v.maritalStatus ?? 'Unknown',
      language: v.language ?? 'English',
      occupation: v.occupation,
      insuranceProvider: v.insuranceProvider ?? 'Self-pay',
      insurancePlan: v.insurancePlan ?? '',
      policyNumber: v.policyNumber ?? '',
      primaryProviderId: provider?.id ?? '',
      primaryProviderName: provider?.fullName ?? '',
      status: existing?.status ?? 'Active',
      registeredAt: existing?.registeredAt ?? dayjs().format('YYYY-MM-DD'),
      tags: existing?.tags ?? [],
      riskLevel: existing?.riskLevel ?? 'Low',
      emergencyContactName: v.emergencyContactName ?? '',
      emergencyContactPhone: v.emergencyContactPhone ?? '',
      emergencyContactRelation: v.emergencyContactRelation ?? '',
      lastVisit: existing?.lastVisit,
      nextAppointment: existing?.nextAppointment,
    };
    const saved = existing ? await dispatch(updatePatient({ id: existing.id, patch: base })).unwrap() : await dispatch(createPatient(base)).unwrap();
    onSaved?.(saved);
  };
}

export function patientToValues(p: Patient): Partial<PatientValues> {
  return {
    firstName: p.firstName, lastName: p.lastName, dateOfBirth: dayjs(p.dateOfBirth), age: p.age, gender: p.gender, bloodGroup: p.bloodGroup, maritalStatus: p.maritalStatus, language: p.language, occupation: p.occupation,
    phone: p.phone, email: p.email, addressLine1: p.address.line1, addressLine2: p.address.line2, city: p.address.city, state: p.address.state, postalCode: p.address.postalCode, country: p.address.country,
    insuranceProvider: p.insuranceProvider, insurancePlan: p.insurancePlan, policyNumber: p.policyNumber, primaryProviderName: p.primaryProviderName,
    emergencyContactName: p.emergencyContactName, emergencyContactPhone: p.emergencyContactPhone, emergencyContactRelation: p.emergencyContactRelation, consentToContact: true,
  };
}

export function PatientFormCard({ onSaved }: { onSaved?: (p: Patient) => void }) {
  const submit = usePatientSubmit(onSaved);
  return (
    <RegisteredFormCard<PatientValues> formId={formId} title="Patient" onSubmit={submit} initialValues={{ country: 'USA', language: 'English', consentToContact: true }} successMessage="Patient registered">
      {(h) => <PatientFields {...h} />}
    </RegisteredFormCard>
  );
}

export function PatientEditDrawer({ patient, open, onOpen, onClose, onSaved }: { patient: Patient; open: boolean; onOpen: () => void; onClose: () => void; onSaved?: (p: Patient) => void }) {
  const submit = usePatientSubmit(onSaved, patient);
  return (
    <RegisteredFormDrawer<PatientValues> formId={formId} title="Edit Demographics" open={open} onOpen={onOpen} onClose={onClose} onSubmit={submit} initialValues={patientToValues(patient)} width={760} submitLabel="Save Changes">
      {(h) => <PatientFields {...h} />}
    </RegisteredFormDrawer>
  );
}
