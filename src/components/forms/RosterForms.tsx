import dayjs, { type Dayjs } from 'dayjs';
import { useAppSelector } from '@/store';
import { providerSelectors } from '@/store/slices/providerSlice';
import { leaveService, rosterService, shiftService } from '@/services/api';
import type { LeaveRequest, Roster, Shift } from '@/types/domain';
import { FormGrid } from '@/components/common';
import { RegisteredFormCard, RegisteredFormDrawer } from './RegisteredForm';
import { DateField, ProviderSelectField, SelectField, TextField, TimeField } from './fields';

interface DrawerBase<T> { open: boolean; onOpen: () => void; onClose: () => void; onSaved?: (record: T) => void; initialDate?: string }

interface ShiftValues { providerName: string; date: Dayjs; type: Shift['type']; startTime?: Dayjs; endTime?: Dayjs; locationName?: string; department?: string; notes?: string }
const shiftDefaults: Record<Shift['type'], [string, string]> = { Morning: ['07:00', '15:00'], Afternoon: ['12:00', '20:00'], Evening: ['15:00', '23:00'], Night: ['23:00', '07:00'], 'On Call': ['18:00', '08:00'] };

export function ShiftFormDrawer({ open, onOpen, onClose, onSaved, initialDate }: DrawerBase<Shift>) {
  const providers = useAppSelector(providerSelectors.selectAll);
  const formId = 'shift';
  const submit = async (v: ShiftValues) => {
    const provider = providers.find((p) => p.fullName === v.providerName);
    const [ds, de] = shiftDefaults[v.type];
    const saved = await shiftService.create({
      providerId: provider?.id ?? 'unknown', providerName: provider?.fullName ?? v.providerName, date: v.date.format('YYYY-MM-DD'), startTime: v.startTime?.format('HH:mm') ?? ds, endTime: v.endTime?.format('HH:mm') ?? de,
      type: v.type, locationName: v.locationName ?? provider?.locationName ?? '', department: v.department ?? provider?.department ?? '', status: 'Scheduled', notes: v.notes,
    });
    onSaved?.(saved);
  };
  return (
    <RegisteredFormDrawer<ShiftValues> formId={formId} title="Add Shift" open={open} onOpen={onOpen} onClose={onClose} onSubmit={submit} initialValues={{ type: 'Morning', date: initialDate ? dayjs(initialDate) : dayjs() }}>
      {({ fc }) => (
        <FormGrid cols={2}>
          <ProviderSelectField formId={formId} fc={fc} span={2} />
          <DateField formId={formId} name="date" fc={fc} />
          <SelectField formId={formId} name="type" fc={fc} />
          <TimeField formId={formId} name="startTime" fc={fc} />
          <TimeField formId={formId} name="endTime" fc={fc} />
          <SelectField formId={formId} name="locationName" fc={fc} />
          <SelectField formId={formId} name="department" fc={fc} />
          <TextField formId={formId} name="notes" fc={fc} span={2} textarea />
        </FormGrid>
      )}
    </RegisteredFormDrawer>
  );
}

interface LeaveValues { providerName: string; type: LeaveRequest['type']; startDate: Dayjs; endDate: Dayjs; reason?: string }

export function LeaveFormDrawer({ open, onOpen, onClose, onSaved }: DrawerBase<LeaveRequest>) {
  const providers = useAppSelector(providerSelectors.selectAll);
  const formId = 'leave';
  const submit = async (v: LeaveValues) => {
    const provider = providers.find((p) => p.fullName === v.providerName);
    const saved = await leaveService.create({
      providerId: provider?.id ?? 'unknown', providerName: provider?.fullName ?? v.providerName, type: v.type, startDate: v.startDate.format('YYYY-MM-DD'), endDate: v.endDate.format('YYYY-MM-DD'),
      days: v.endDate.diff(v.startDate, 'day') + 1, status: 'Pending', reason: v.reason ?? '', requestedAt: new Date().toISOString(),
    });
    onSaved?.(saved);
  };
  return (
    <RegisteredFormDrawer<LeaveValues> formId={formId} title="Request Leave" open={open} onOpen={onOpen} onClose={onClose} onSubmit={submit} initialValues={{ type: 'Annual' }}>
      {({ fc }) => (
        <FormGrid cols={2}>
          <ProviderSelectField formId={formId} fc={fc} span={2} />
          <SelectField formId={formId} name="type" fc={fc} span={2} />
          <DateField formId={formId} name="startDate" fc={fc} />
          <DateField formId={formId} name="endDate" fc={fc} />
          <TextField formId={formId} name="reason" fc={fc} span={2} textarea />
        </FormGrid>
      )}
    </RegisteredFormDrawer>
  );
}

interface RosterValues { name: string; department: string; locationName: string; startDate: Dayjs; endDate: Dayjs; shiftPattern?: string; minStaff?: string; includeOnCall?: boolean; notes?: string }

export function RosterFormCard({ onSaved }: { onSaved?: (r: Roster) => void }) {
  const user = useAppSelector((s) => s.auth.user);
  const submit = async (v: RosterValues) => {
    const saved = await rosterService.create({
      name: v.name, department: v.department, locationName: v.locationName, startDate: v.startDate.format('YYYY-MM-DD'), endDate: v.endDate.format('YYYY-MM-DD'), status: 'Draft', shiftCount: 0, providerCount: 0,
      createdBy: user?.fullName ?? 'Unknown', createdAt: new Date().toISOString(),
    });
    onSaved?.(saved);
  };
  return (
    <RegisteredFormCard<RosterValues> formId="roster" title="Roster" onSubmit={submit} submitLabel="Create Draft Roster" initialValues={{ startDate: dayjs().startOf('week').add(7, 'day'), endDate: dayjs().startOf('week').add(13, 'day'), shiftPattern: 'Standard 3-shift', minStaff: '2 providers + 1 nurse' }} successMessage="Roster created">
      {({ fc }) => (
        <FormGrid>
          <TextField formId="roster" name="name" fc={fc} span={2} label="Roster Name" rules={[{ required: true, message: 'Name is required' }]} placeholder="e.g. Primary Care – Week 39" />
          <SelectField formId="shift" name="department" fc={fc} rules={[{ required: true, message: 'Department is required' }]} />
          <SelectField formId="shift" name="locationName" fc={fc} rules={[{ required: true, message: 'Location is required' }]} />
          <DateField formId="leave" name="startDate" fc={fc} />
          <DateField formId="leave" name="endDate" fc={fc} />
          <SelectField formId="roster" name="shiftPattern" fc={fc} label="Shift Pattern" options={['Standard 3-shift', '2-shift (12h)', 'Day only', 'Custom']} />
          <TextField formId="roster" name="minStaff" fc={fc} label="Minimum Staffing" />
          <TextField formId="roster" name="notes" fc={fc} span={4} label="Notes" textarea />
        </FormGrid>
      )}
    </RegisteredFormCard>
  );
}
