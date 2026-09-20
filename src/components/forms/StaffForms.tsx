import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { createProvider, updateProvider } from '@/store/slices/providerSlice';
import { roleService, userService, mockDb } from '@/services/api';
import type { Provider, Role, User, UserRoleName } from '@/types/domain';
import { FormGrid, FormSection } from '@/components/common';
import { RegisteredFormCard, RegisteredFormDrawer, type FormHelpers } from './RegisteredForm';
import { CheckboxField, SelectField, TextField } from './fields';
import { Checkbox, Form } from 'antd';

// ---------------------------------------------------------------- Provider
interface ProviderValues { firstName: string; lastName: string; title?: string; specialty: string; department?: string; licenseNumber?: string; npi?: string; email?: string; phone?: string; locationName?: string; employmentType?: Provider['employmentType']; acceptingNewPatients?: boolean; bio?: string }
const providerFormId = 'provider';

export function ProviderFormDrawer({ open, onOpen, onClose, existing, onSaved }: { open: boolean; onOpen: () => void; onClose: () => void; existing?: Provider; onSaved?: (p: Provider) => void }) {
  const dispatch = useAppDispatch();
  const submit = async (v: ProviderValues) => {
    const loc = mockDb.locations.find((l) => l.name === v.locationName) ?? mockDb.locations[0];
    const base: Omit<Provider, 'id'> = {
      code: existing?.code ?? `PRV-${Math.floor(100 + Math.random() * 899)}`, firstName: v.firstName, lastName: v.lastName, fullName: `Dr. ${v.firstName} ${v.lastName}`, title: v.title ?? 'MD', specialty: v.specialty, department: v.department ?? 'Primary Care',
      licenseNumber: v.licenseNumber ?? '', licenseState: 'TX', licenseExpiry: existing?.licenseExpiry ?? dayjs().add(2, 'year').format('YYYY-MM-DD'), npi: v.npi ?? '', email: v.email ?? '', phone: v.phone ?? '', status: existing?.status ?? 'Active',
      locationId: loc.id, locationName: loc.name, employmentType: v.employmentType ?? 'Full-time', yearsExperience: existing?.yearsExperience ?? 0, languages: existing?.languages ?? ['English'], acceptingNewPatients: !!v.acceptingNewPatients,
      rating: existing?.rating ?? 0, patientsToday: existing?.patientsToday ?? 0, utilization: existing?.utilization ?? 0, bio: v.bio,
    };
    const saved = existing ? await dispatch(updateProvider({ id: existing.id, patch: base })).unwrap() : await dispatch(createProvider(base)).unwrap();
    onSaved?.(saved);
  };
  return (
    <RegisteredFormDrawer<ProviderValues> formId={providerFormId} title={existing ? 'Edit Provider' : 'Add Provider'} open={open} onOpen={onOpen} onClose={onClose} onSubmit={submit} width={720}
      initialValues={existing ? { ...existing, acceptingNewPatients: existing.acceptingNewPatients } : { title: 'MD', employmentType: 'Full-time', acceptingNewPatients: true }}>
      {({ fc }) => (
        <>
          <FormSection title="Identity">
            <FormGrid>
              <TextField formId={providerFormId} name="firstName" fc={fc} />
              <TextField formId={providerFormId} name="lastName" fc={fc} />
              <SelectField formId={providerFormId} name="title" fc={fc} />
              <SelectField formId={providerFormId} name="specialty" fc={fc} />
              <SelectField formId={providerFormId} name="department" fc={fc} span={2} />
              <SelectField formId={providerFormId} name="employmentType" fc={fc} span={2} />
            </FormGrid>
          </FormSection>
          <FormSection title="Credentials & Contact">
            <FormGrid>
              <TextField formId={providerFormId} name="licenseNumber" fc={fc} />
              <TextField formId={providerFormId} name="npi" fc={fc} />
              <TextField formId={providerFormId} name="email" fc={fc} rules={[{ type: 'email' }]} />
              <TextField formId={providerFormId} name="phone" fc={fc} />
              <SelectField formId={providerFormId} name="locationName" fc={fc} span={2} />
              <CheckboxField formId={providerFormId} name="acceptingNewPatients" fc={fc} span={2} />
              <TextField formId={providerFormId} name="bio" fc={fc} span={4} textarea />
            </FormGrid>
          </FormSection>
        </>
      )}
    </RegisteredFormDrawer>
  );
}

// ---------------------------------------------------------------- User
export interface UserValues { firstName: string; lastName: string; email: string; phone?: string; username?: string; role: UserRoleName; department?: string; locationName?: string; mfaEnabled?: boolean; sendInvite?: boolean }
const userFormId = 'user';

export function UserFields({ fc }: FormHelpers<UserValues>) {
  return (
    <>
      <FormSection title="Account">
        <FormGrid>
          <TextField formId={userFormId} name="firstName" fc={fc} />
          <TextField formId={userFormId} name="lastName" fc={fc} />
          <TextField formId={userFormId} name="email" fc={fc} rules={[{ type: 'email', message: 'Enter a valid email' }]} />
          <TextField formId={userFormId} name="phone" fc={fc} />
          <TextField formId={userFormId} name="username" fc={fc} help="Leave blank to generate from the name" />
          <SelectField formId={userFormId} name="role" fc={fc} />
          <SelectField formId={userFormId} name="department" fc={fc} />
          <SelectField formId={userFormId} name="locationName" fc={fc} />
        </FormGrid>
      </FormSection>
      <FormSection title="Security">
        <FormGrid>
          <CheckboxField formId={userFormId} name="mfaEnabled" fc={fc} span={2} />
          <CheckboxField formId={userFormId} name="sendInvite" fc={fc} span={2} />
        </FormGrid>
      </FormSection>
    </>
  );
}

export function useUserSubmit(onSaved?: (u: User) => void, existing?: User) {
  return async (v: UserValues) => {
    const base: Omit<User, 'id'> = {
      username: v.username || `${v.firstName[0]}${v.lastName}`.toLowerCase(), firstName: v.firstName, lastName: v.lastName, fullName: `${v.firstName} ${v.lastName}`, email: v.email, phone: v.phone ?? '', role: v.role,
      department: v.department ?? 'Primary Care', locationName: v.locationName ?? mockDb.locations[0].name, status: existing?.status ?? (v.sendInvite ? 'Pending Invite' : 'Active'), lastLogin: existing?.lastLogin,
      createdAt: existing?.createdAt ?? new Date().toISOString(), mfaEnabled: !!v.mfaEnabled, avatarColor: existing?.avatarColor ?? '#0f6e8c',
    };
    const saved = existing ? await userService.update(existing.id, base) : await userService.create(base);
    onSaved?.(saved);
  };
}

export function UserFormCard({ onSaved }: { onSaved?: (u: User) => void }) {
  const submit = useUserSubmit(onSaved);
  return (
    <RegisteredFormCard<UserValues> formId={userFormId} title="User" onSubmit={submit} initialValues={{ mfaEnabled: true, sendInvite: true }} successMessage="User created">
      {(h) => <UserFields {...h} />}
    </RegisteredFormCard>
  );
}

export function UserFormDrawer({ open, onOpen, onClose, existing, onSaved }: { open: boolean; onOpen: () => void; onClose: () => void; existing?: User; onSaved?: (u: User) => void }) {
  const submit = useUserSubmit(onSaved, existing);
  return (
    <RegisteredFormDrawer<UserValues> formId={userFormId} title={existing ? 'Edit User' : 'Create User'} open={open} onOpen={onOpen} onClose={onClose} onSubmit={submit} initialValues={existing ?? { mfaEnabled: true, sendInvite: true }} width={700}>
      {(h) => <UserFields {...h} />}
    </RegisteredFormDrawer>
  );
}

// ---------------------------------------------------------------- Role (not voice-registered; plain drawer using the same shell)
interface RoleValues { name: string; description: string; permissions: string[] }

export function RoleFormDrawer({ open, onOpen, onClose, existing, onSaved }: { open: boolean; onOpen: () => void; onClose: () => void; existing?: Role; onSaved?: (r: Role) => void }) {
  const permissions = useAppSelector(() => mockDb.permissions);
  const submit = async (v: RoleValues) => {
    const base: Omit<Role, 'id'> = { name: v.name, description: v.description, permissions: v.permissions, users: existing?.users ?? 0, isSystem: existing?.isSystem ?? false, updatedAt: new Date().toISOString() };
    const saved = existing ? await roleService.update(existing.id, base) : await roleService.create(base);
    onSaved?.(saved);
  };
  const modules = [...new Set(permissions.map((p) => p.module))];
  return (
    <RegisteredFormDrawer<RoleValues> formId="role" title={existing ? 'Edit Role' : 'Create Role'} open={open} onOpen={onOpen} onClose={onClose} onSubmit={submit} initialValues={existing ?? { permissions: [] }} submitLabel="Save Role" width={640}>
      {({ fc }) => (
        <>
          <FormGrid cols={2}>
            <TextField formId="role" name="name" fc={fc} label="Role Name" rules={[{ required: true, message: 'Name is required' }]} />
            <TextField formId="role" name="description" fc={fc} label="Description" />
          </FormGrid>
          <Form.Item name="permissions" label="Permissions">
            <Checkbox.Group style={{ width: '100%' }}>
              {modules.map((m) => (
                <div key={m} style={{ marginBottom: 12, width: '100%' }}>
                  <div className="form-section-title" style={{ margin: '0 0 8px' }}>{m}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                    {permissions.filter((p) => p.module === m).map((p) => (
                      <Checkbox key={p.key} value={p.key}>{p.name}{p.sensitive && <span className="muted"> (sensitive)</span>}</Checkbox>
                    ))}
                  </div>
                </div>
              ))}
            </Checkbox.Group>
          </Form.Item>
        </>
      )}
    </RegisteredFormDrawer>
  );
}
