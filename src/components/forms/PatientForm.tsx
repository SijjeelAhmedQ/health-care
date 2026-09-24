import { useEffect, useMemo } from 'react';
import { Form } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { UserRound } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { createPatient, updatePatient } from '@/store/slices/patientSlice';
import { providerSelectors } from '@/store/slices/providerSlice';
import type { Patient } from '@/types/domain';
import type { FieldValues } from '@/types/ai';
import { FormGrid, FormSection } from '@/components/common';
import { RegisteredFormModal, type FormHelpers } from './RegisteredForm';
import { toFormInitialValues } from './RecordForms';
import { DateField, NumberField, ProviderSelectField, SelectField, TextField } from './fields';

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
  city?: string;
  state?: string;
  postalCode?: string;
  insuranceProvider?: string;
  policyNumber?: string;
  primaryProviderName?: string;
  status?: Patient['status'];
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
}

const formId = 'patient';

export function PatientFields({ fc }: FormHelpers<PatientValues>) {
  return (
    <>
      <FormSection title="Demographics" description="The details that identify the patient across the practice.">
        <FormGrid>
          <TextField formId={formId} name="firstName" fc={fc} />
          <TextField formId={formId} name="lastName" fc={fc} />
          <DateField formId={formId} name="dateOfBirth" fc={fc} />
          <NumberField formId={formId} name="age" fc={fc} min={0} max={130} help="Filled automatically from the date of birth" />
          <SelectField formId={formId} name="gender" fc={fc} />
          <SelectField formId={formId} name="bloodGroup" fc={fc} />
          <SelectField formId={formId} name="maritalStatus" fc={fc} />
          <SelectField formId={formId} name="language" fc={fc} />
          <TextField formId={formId} name="occupation" fc={fc} span={2} />
          <ProviderSelectField formId={formId} name="primaryProviderName" fc={fc} span={2} label="Primary Provider" />
          <SelectField formId={formId} name="status" fc={fc} span={2} />
        </FormGrid>
      </FormSection>
      <FormSection title="Contact">
        <FormGrid>
          <TextField formId={formId} name="phone" fc={fc} span={2} placeholder="(555) 555-0100" rules={[{ pattern: /[\d\s()+-]{7,}/, message: 'Enter a valid phone number' }]} />
          <TextField formId={formId} name="email" fc={fc} span={2} rules={[{ type: 'email', message: 'Enter a valid email' }]} />
          <TextField formId={formId} name="addressLine1" fc={fc} span={2} placeholder="Street address" />
          <TextField formId={formId} name="city" fc={fc} />
          <TextField formId={formId} name="state" fc={fc} />
          <TextField formId={formId} name="postalCode" fc={fc} />
        </FormGrid>
      </FormSection>
      <FormSection title="Insurance">
        <FormGrid>
          <SelectField formId={formId} name="insuranceProvider" fc={fc} span={2} />
          <TextField formId={formId} name="policyNumber" fc={fc} span={2} placeholder="Member / policy ID" />
        </FormGrid>
      </FormSection>
      <FormSection title="Emergency contact">
        <FormGrid>
          <TextField formId={formId} name="emergencyContactName" fc={fc} span={2} />
          <TextField formId={formId} name="emergencyContactPhone" fc={fc} />
          <SelectField formId={formId} name="emergencyContactRelation" fc={fc} />
        </FormGrid>
      </FormSection>
    </>
  );
}

export function patientToValues(p: Patient): Partial<PatientValues> {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    dateOfBirth: dayjs(p.dateOfBirth),
    age: p.age,
    gender: p.gender,
    bloodGroup: p.bloodGroup,
    maritalStatus: p.maritalStatus,
    language: p.language,
    occupation: p.occupation,
    phone: p.phone,
    email: p.email,
    addressLine1: p.address.line1,
    city: p.address.city,
    state: p.address.state,
    postalCode: p.address.postalCode,
    insuranceProvider: p.insuranceProvider,
    policyNumber: p.policyNumber,
    primaryProviderName: p.primaryProviderName,
    status: p.status,
    emergencyContactName: p.emergencyContactName,
    emergencyContactPhone: p.emergencyContactPhone,
    emergencyContactRelation: p.emergencyContactRelation,
  };
}

interface Props {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Editing an existing patient; omitted when registering a new one. */
  patient?: Patient;
  prefill?: FieldValues;
  onSaved?: (patient: Patient, wasNew: boolean) => void;
}

/**
 * Add / update a patient. Registered for voice control under the `patient`
 * form id, so "add patient Bilal Hussain, male, 32 years old" fills this same
 * dialog and waits for the user to confirm before anything is saved.
 */
export function PatientFormModal({ open, onOpen, onClose, patient, prefill, onSaved }: Props) {
  const dispatch = useAppDispatch();
  const providers = useAppSelector(providerSelectors.selectAll);
  const [form] = Form.useForm<PatientValues>();
  const editing = !!patient;

  const initialValues = useMemo<Partial<PatientValues>>(
    () =>
      patient
        ? patientToValues(patient)
        : ({ language: 'English', status: 'Active', ...toFormInitialValues('patient', prefill) } as Partial<PatientValues>),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patient, JSON.stringify(prefill ?? {})],
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(initialValues as PatientValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialValues]);

  // A spoken age ("32 years old") is enough — keep the two in step so the required DOB is never blocking.
  const age = Form.useWatch('age', form);
  const dob = Form.useWatch('dateOfBirth', form);
  useEffect(() => {
    if (age && !dob) form.setFieldValue('dateOfBirth', dayjs().subtract(Number(age), 'year'));
    else if (dob && !age) form.setFieldValue('age', dayjs().diff(dob, 'year'));
  }, [age, dob, form]);

  const submit = async (v: PatientValues) => {
    const provider = providers.find((p) => p.fullName === v.primaryProviderName) ?? providers[0];
    const birth = v.dateOfBirth ?? (v.age ? dayjs().subtract(v.age, 'year') : dayjs());
    const base: Omit<Patient, 'id'> = {
      mrn: patient?.mrn ?? `MRN-${Math.floor(110000 + Math.random() * 89999)}`,
      firstName: v.firstName,
      lastName: v.lastName,
      fullName: `${v.firstName} ${v.lastName}`.trim(),
      dateOfBirth: birth.format('YYYY-MM-DD'),
      age: dayjs().diff(birth, 'year'),
      gender: v.gender,
      bloodGroup: v.bloodGroup ?? 'Unknown',
      phone: v.phone,
      email: v.email ?? '',
      address: {
        line1: v.addressLine1 ?? '',
        city: v.city ?? '',
        state: v.state ?? '',
        postalCode: v.postalCode ?? '',
        country: patient?.address.country ?? 'USA',
      },
      maritalStatus: v.maritalStatus ?? 'Unknown',
      language: v.language ?? 'English',
      occupation: v.occupation,
      insuranceProvider: v.insuranceProvider ?? 'Self-pay',
      insurancePlan: patient?.insurancePlan ?? '',
      policyNumber: v.policyNumber ?? '',
      primaryProviderId: provider?.id ?? '',
      primaryProviderName: v.primaryProviderName ?? provider?.fullName ?? '',
      status: v.status ?? patient?.status ?? 'Active',
      registeredAt: patient?.registeredAt ?? dayjs().format('YYYY-MM-DD'),
      tags: patient?.tags ?? [],
      riskLevel: patient?.riskLevel ?? 'Low',
      emergencyContactName: v.emergencyContactName ?? '',
      emergencyContactPhone: v.emergencyContactPhone ?? '',
      emergencyContactRelation: v.emergencyContactRelation ?? '',
      lastVisit: patient?.lastVisit,
      nextAppointment: patient?.nextAppointment,
    };
    const saved = patient ? await dispatch(updatePatient({ id: patient.id, patch: base })).unwrap() : await dispatch(createPatient(base)).unwrap();
    onSaved?.(saved, !patient);
  };

  return (
    <RegisteredFormModal<PatientValues>
      formId={formId}
      title={editing ? 'Edit Patient' : 'Add Patient'}
      icon={<UserRound size={18} />}
      description={editing ? `Update ${patient.fullName}'s details.` : 'Register a new patient. They become the selected patient once saved.'}
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      onSubmit={submit}
      initialValues={initialValues}
      form={form}
      size="xl"
      submitLabel={editing ? 'Save Changes' : 'Save Patient'}
    >
      {(h) => <PatientFields {...h} />}
    </RegisteredFormModal>
  );
}
