import { useEffect, useMemo, useReducer, useRef } from 'react';
import { Form, Tabs } from 'antd';
import { CalendarPlus, ListChecks, Pill, Repeat, Stethoscope } from 'lucide-react';
import dayjs, { type Dayjs } from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { providerSelectors } from '@/store/slices/providerSlice';
import { recordSlices } from '@/store/slices/recordSlices';
import { useSelectedPatient } from '@/hooks/usePatientData';
import type { EntryStore } from '@/hooks';
import type { AIRecordKind, FieldValues } from '@/types/ai';
import type { Appointment, Diagnosis, Medication, Recall, Task } from '@/types/domain';
import { FormGrid, FormSection } from '@/components/common';
import { RegisteredFormModal } from './RegisteredForm';
import { CheckboxField, DateField, NumberField, ProviderSelectField, SelectField, TextField, TimeField } from './fields';

export type RecordKind = Exclude<AIRecordKind, 'patient'>;
type AnyValues = Record<string, unknown>;

const icons: Record<RecordKind, React.ReactNode> = {
  medication: <Pill size={18} />,
  diagnosis: <Stethoscope size={18} />,
  task: <ListChecks size={18} />,
  recall: <Repeat size={18} />,
  appointment: <CalendarPlus size={18} />,
};

const titles: Record<RecordKind, string> = {
  medication: 'Medication',
  diagnosis: 'Diagnosis',
  task: 'Task',
  recall: 'Recall',
  appointment: 'Appointment',
};

const asDate = (v: unknown): string | undefined => (dayjs.isDayjs(v) ? (v as Dayjs).format('YYYY-MM-DD') : typeof v === 'string' && v ? v : undefined);
const asTime = (v: unknown): string | undefined => (dayjs.isDayjs(v) ? (v as Dayjs).format('HH:mm') : typeof v === 'string' && v ? v : undefined);
const str = (v: unknown, fallback = ''): string => (v === undefined || v === null || v === '' ? fallback : String(v));
const num = (v: unknown, fallback: number): number => (v === undefined || v === null || v === '' ? fallback : Number(v) || fallback);

/** Domain record -> antd form values (dates become Dayjs so the pickers show them). */
export function recordToFormValues(kind: RecordKind, row: Medication | Diagnosis | Task | Recall | Appointment): AnyValues {
  switch (kind) {
    case 'medication': {
      const m = row as Medication;
      return {
        medicationName: m.name, dosage: m.dosage, route: m.route, frequency: m.frequency, duration: m.duration,
        startDate: m.startDate ? dayjs(m.startDate) : undefined, endDate: m.endDate ? dayjs(m.endDate) : undefined,
        indication: m.indication, status: m.status, prescribedBy: m.prescribedBy, refills: m.refills ?? 0,
        isPRN: m.isPRN ?? false, instructions: m.instructions, notes: m.notes,
      };
    }
    case 'diagnosis': {
      const d = row as Diagnosis;
      return {
        description: d.description, icd10: d.icd10, status: d.status, severity: d.severity,
        onsetDate: d.onsetDate ? dayjs(d.onsetDate) : undefined, diagnosedBy: d.diagnosedBy, notes: d.notes,
      };
    }
    case 'task': {
      const t = row as Task;
      return {
        title: t.title, category: t.category, assignedTo: t.assignedTo, dueDate: t.dueDate ? dayjs(t.dueDate) : undefined,
        priority: t.priority, status: t.status, description: t.description,
      };
    }
    case 'recall': {
      const r = row as Recall;
      return {
        reason: r.reason, type: r.type, dueDate: r.dueDate ? dayjs(r.dueDate) : undefined,
        priority: r.priority, status: r.status, notes: r.notes,
      };
    }
    case 'appointment': {
      const a = row as Appointment;
      return {
        providerName: a.providerName, date: a.date ? dayjs(a.date) : undefined, startTime: a.startTime ? dayjs(`2000-01-01T${a.startTime}`) : undefined,
        durationMinutes: a.durationMinutes, type: a.type, reason: a.reason, locationName: a.locationName,
        status: a.status, priority: a.priority, isTelehealth: a.isTelehealth, notes: a.notes,
      };
    }
  }
}

/** Fresh-record defaults, so a dictated record is complete enough to save. */
function defaultValues(kind: RecordKind, authorName: string): AnyValues {
  switch (kind) {
    case 'medication':
      return { route: 'Oral', startDate: dayjs(), refills: 0, status: 'Active', prescribedBy: authorName };
    case 'diagnosis':
      return { status: 'Active', severity: 'Moderate', onsetDate: dayjs(), diagnosedBy: authorName };
    case 'task':
      return { category: 'Follow-up', priority: 'Normal', status: 'Open', assignedTo: authorName, dueDate: dayjs().add(7, 'day') };
    case 'recall':
      return { type: 'Follow-up', priority: 'Normal', status: 'Due' };
    case 'appointment':
      return { type: 'Follow-up', durationMinutes: 30, status: 'Scheduled', priority: 'Routine', locationName: 'Riverside Medical Center', isTelehealth: false };
  }
}

interface SaveContext {
  patientId: string;
  patientName: string;
  patientMrn: string;
  authorName: string;
  providerId?: string;
  existing?: Medication | Diagnosis | Task | Recall | Appointment;
}

/** antd form values -> the domain record that gets stored. Always bound to the selected patient. */
export function formValuesToRecord(kind: RecordKind, values: AnyValues, ctx: SaveContext): Record<string, unknown> {
  const base = { patientId: ctx.patientId, patientName: ctx.patientName };
  switch (kind) {
    case 'medication': {
      const prev = ctx.existing as Medication | undefined;
      return {
        ...base,
        name: str(values.medicationName, prev?.name ?? ''),
        dosage: str(values.dosage, prev?.dosage ?? ''),
        route: str(values.route, prev?.route ?? 'Oral'),
        frequency: str(values.frequency, prev?.frequency ?? ''),
        duration: str(values.duration, prev?.duration ?? 'Ongoing'),
        startDate: asDate(values.startDate) ?? prev?.startDate ?? dayjs().format('YYYY-MM-DD'),
        endDate: asDate(values.endDate),
        prescribedBy: str(values.prescribedBy, prev?.prescribedBy ?? ctx.authorName),
        indication: str(values.indication) || undefined,
        instructions: str(values.instructions) || undefined,
        notes: str(values.notes) || undefined,
        refills: num(values.refills, prev?.refills ?? 0),
        status: str(values.status, prev?.status ?? 'Active'),
        isPRN: values.isPRN === true,
      };
    }
    case 'diagnosis': {
      const prev = ctx.existing as Diagnosis | undefined;
      return {
        ...base,
        description: str(values.description, prev?.description ?? ''),
        icd10: str(values.icd10, prev?.icd10 ?? ''),
        status: str(values.status, prev?.status ?? 'Active'),
        severity: str(values.severity, prev?.severity ?? 'Moderate'),
        onsetDate: asDate(values.onsetDate) ?? prev?.onsetDate ?? dayjs().format('YYYY-MM-DD'),
        resolvedDate: str(values.status) === 'Resolved' ? prev?.resolvedDate ?? dayjs().format('YYYY-MM-DD') : undefined,
        diagnosedBy: str(values.diagnosedBy, prev?.diagnosedBy ?? ctx.authorName),
        notes: str(values.notes) || undefined,
      };
    }
    case 'task': {
      const prev = ctx.existing as Task | undefined;
      const status = str(values.status, prev?.status ?? 'Open');
      return {
        ...base,
        title: str(values.title, prev?.title ?? ''),
        category: str(values.category, prev?.category ?? 'Follow-up'),
        description: str(values.description) || undefined,
        assignedTo: str(values.assignedTo, prev?.assignedTo ?? ctx.authorName),
        dueDate: asDate(values.dueDate) ?? prev?.dueDate ?? dayjs().add(7, 'day').format('YYYY-MM-DD'),
        priority: str(values.priority, prev?.priority ?? 'Normal'),
        status,
        createdBy: prev?.createdBy ?? ctx.authorName,
        createdAt: prev?.createdAt ?? new Date().toISOString(),
        completedAt: status === 'Completed' ? prev?.completedAt ?? new Date().toISOString() : undefined,
      };
    }
    case 'recall': {
      const prev = ctx.existing as Recall | undefined;
      return {
        ...base,
        reason: str(values.reason, prev?.reason ?? ''),
        type: str(values.type, prev?.type ?? 'Follow-up'),
        dueDate: asDate(values.dueDate) ?? prev?.dueDate ?? dayjs().add(1, 'month').format('YYYY-MM-DD'),
        priority: str(values.priority, prev?.priority ?? 'Normal'),
        status: str(values.status, prev?.status ?? 'Due'),
        notes: str(values.notes) || undefined,
        createdBy: prev?.createdBy ?? ctx.authorName,
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      };
    }
    case 'appointment': {
      const prev = ctx.existing as Appointment | undefined;
      const start = asTime(values.startTime) ?? prev?.startTime ?? '09:00';
      const duration = num(values.durationMinutes, prev?.durationMinutes ?? 30);
      const end = dayjs(`2000-01-01T${start}`).add(duration, 'minute').format('HH:mm');
      return {
        ...base,
        code: prev?.code ?? `APT-${Math.floor(100000 + Math.random() * 899999)}`,
        patientMrn: ctx.patientMrn,
        providerId: prev?.providerId ?? ctx.providerId ?? 'unknown',
        providerName: str(values.providerName, prev?.providerName ?? ''),
        date: asDate(values.date) ?? prev?.date ?? dayjs().format('YYYY-MM-DD'),
        startTime: start,
        endTime: end,
        durationMinutes: duration,
        type: str(values.type, prev?.type ?? 'Follow-up'),
        locationId: prev?.locationId ?? 'loc-1',
        locationName: str(values.locationName, prev?.locationName ?? 'Riverside Medical Center'),
        room: prev?.room,
        status: str(values.status, prev?.status ?? 'Scheduled'),
        reason: str(values.reason, prev?.reason ?? ''),
        notes: str(values.notes) || undefined,
        priority: str(values.priority, prev?.priority ?? 'Routine'),
        createdAt: prev?.createdAt ?? new Date().toISOString(),
        checkedInAt: prev?.checkedInAt,
        isTelehealth: values.isTelehealth === true,
        reminderSent: prev?.reminderSent ?? false,
      };
    }
  }
}

interface Props {
  kind: RecordKind;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Editing an existing record; omitted when adding a new one. */
  record?: Medication | Diagnosis | Task | Recall | Appointment;
  /** Values to pre-fill a new record with (used by the AI Summary). */
  prefill?: FieldValues;
  onSaved?: () => void;
}

/**
 * The create/edit dialog for the five patient record types.
 *
 * It registers itself with the FormRegistry under its record kind, so the voice
 * executor opens, fills, validates and submits exactly the same form the user
 * sees — nothing is saved until the form is submitted.
 */
export function RecordFormModal({ kind, open, onOpen, onClose, record, prefill, onSaved }: Props) {
  const dispatch = useAppDispatch();
  const patient = useSelectedPatient();
  const user = useAppSelector((s) => s.auth.user);
  const providers = useAppSelector(providerSelectors.selectAll);
  const [form] = Form.useForm<AnyValues>();
  // Every record slice has the same shape; picking one concrete type keeps the
  // dispatch calls below monomorphic instead of a five-way thunk union.
  const slice = recordSlices[kind] as (typeof recordSlices)['medication'];
  const authorName = user?.fullName ?? 'Unknown';
  const editing = !!record;

  const initialValues = useMemo<AnyValues>(() => {
    if (record) return recordToFormValues(kind, record);
    return { ...defaultValues(kind, authorName), ...(prefill ?? {}) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, record, authorName, JSON.stringify(prefill ?? {})]);

  // Re-seed the form whenever it is opened for a different record (edit vs add).
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(initialValues as never);
    itemsRef.current = [{}];
    activeRef.current = 0;
    rerender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialValues]);

  // Multi-entry support: "add panadol and metformin" fills one tab per record and
  // saves them together after a single review.
  const itemsRef = useRef<AnyValues[]>([{}]);
  const activeRef = useRef(0);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const count = itemsRef.current.length;
  const primaryName = { medication: 'medicationName', diagnosis: 'description', task: 'title', recall: 'reason', appointment: 'reason' }[kind];
  const liveLabel = Form.useWatch(primaryName, form) as string | undefined;

  const snapshotActive = () => {
    const live = form.getFieldsValue(true) as AnyValues;
    itemsRef.current = itemsRef.current.map((it, i) => (i === activeRef.current ? live : it));
  };
  const load = (values: AnyValues) => {
    form.resetFields();
    form.setFieldsValue({ ...initialValues, ...values } as never);
  };
  const switchTo = (index: number) => {
    if (index === activeRef.current || index < 0 || index >= itemsRef.current.length) return;
    snapshotActive();
    activeRef.current = index;
    load(itemsRef.current[index]);
    rerender();
  };
  const addEntry = (values: AnyValues = {}) => {
    snapshotActive();
    itemsRef.current = [...itemsRef.current, values];
    activeRef.current = itemsRef.current.length - 1;
    load(values);
    rerender();
    return activeRef.current;
  };
  const removeEntry = (index: number) => {
    if (itemsRef.current.length <= 1) return;
    snapshotActive();
    itemsRef.current = itemsRef.current.filter((_, i) => i !== index);
    activeRef.current = Math.min(activeRef.current > index ? activeRef.current - 1 : activeRef.current, itemsRef.current.length - 1);
    load(itemsRef.current[activeRef.current]);
    rerender();
  };
  const entries: EntryStore<AnyValues> = {
    get items() {
      return itemsRef.current;
    },
    get active() {
      return activeRef.current;
    },
    setActive: switchTo,
    add: addEntry,
  };

  const submit = async (values: AnyValues) => {
    if (!patient) throw new Error('No patient is selected — select a patient before saving.');
    const provider = providers.find((p) => p.fullName === values.providerName);
    const payload = formValuesToRecord(kind, values, {
      patientId: patient.id,
      patientName: patient.fullName,
      patientMrn: patient.mrn,
      authorName,
      providerId: provider?.id,
      existing: record,
    });
    if (record) await dispatch(slice.update({ id: record.id, patch: payload as never })).unwrap();
    else await dispatch(slice.create(payload as never)).unwrap();
    onSaved?.();
  };

  const title = editing ? `Edit ${titles[kind]}` : `Add ${titles[kind]}${count > 1 ? ` (${count})` : ''}`;
  const description = patient
    ? editing
      ? `Update this ${titles[kind].toLowerCase()} for ${patient.fullName}.`
      : count > 1
        ? `${count} ${titles[kind].toLowerCase()}s will be saved for ${patient.fullName} once you confirm.`
        : `This ${titles[kind].toLowerCase()} will be saved for ${patient.fullName}.`
    : 'Select a patient first.';

  return (
    <RegisteredFormModal<AnyValues>
      formId={kind}
      title={title}
      icon={icons[kind]}
      description={description}
      open={open}
      onOpen={onOpen}
      onClose={onClose}
      onSubmit={submit}
      initialValues={initialValues}
      form={form}
      entries={editing ? undefined : entries}
      submitLabel={editing ? `Update ${titles[kind]}` : undefined}
      header={
        !editing && count > 1 ? (
          <Tabs
            type="editable-card"
            size="small"
            activeKey={String(activeRef.current)}
            onChange={(k) => switchTo(Number(k))}
            onEdit={(key, action) => (action === 'add' ? addEntry() : removeEntry(Number(key)))}
            items={itemsRef.current.map((it, i) => ({
              key: String(i),
              label: (i === activeRef.current ? liveLabel : (it[primaryName] as string)) || `${titles[kind]} ${i + 1}`,
              closable: count > 1,
            }))}
            style={{ marginBottom: 8 }}
          />
        ) : undefined
      }
    >
      {({ fc }) => <RecordFields kind={kind} fc={fc} />}
    </RegisteredFormModal>
  );
}

function RecordFields({ kind, fc }: { kind: RecordKind; fc: (name: string) => string | undefined }) {
  const formId = kind;
  switch (kind) {
    case 'medication':
      return (
        <>
          <FormSection title="Medication">
            <FormGrid cols={2}>
              <TextField formId={formId} name="medicationName" fc={fc} span={2} placeholder="e.g. Amoxicillin" />
              <TextField formId={formId} name="dosage" fc={fc} placeholder="e.g. 500 mg" />
              <SelectField formId={formId} name="route" fc={fc} />
              <SelectField formId={formId} name="frequency" fc={fc} />
              <TextField formId={formId} name="duration" fc={fc} placeholder="e.g. 7 days" />
              <DateField formId={formId} name="startDate" fc={fc} />
              <DateField formId={formId} name="endDate" fc={fc} help="Leave empty for ongoing medication" />
            </FormGrid>
          </FormSection>
          <FormSection title="Clinical detail">
            <FormGrid cols={2}>
              <TextField formId={formId} name="indication" fc={fc} placeholder="Reason for medication" />
              <SelectField formId={formId} name="status" fc={fc} />
              <ProviderSelectField formId={formId} name="prescribedBy" fc={fc} label="Prescribed By" />
              <NumberField formId={formId} name="refills" fc={fc} min={0} max={12} />
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
      );
    case 'diagnosis':
      return (
        <>
          <FormSection title="Diagnosis">
            <FormGrid cols={2}>
              <TextField formId={formId} name="description" fc={fc} span={2} placeholder="e.g. Hypertension" />
              <TextField formId={formId} name="icd10" fc={fc} placeholder="e.g. I10" help="Optional — leave empty if unknown" />
              <DateField formId={formId} name="onsetDate" fc={fc} />
              <SelectField formId={formId} name="status" fc={fc} />
              <SelectField formId={formId} name="severity" fc={fc} />
              <ProviderSelectField formId={formId} name="diagnosedBy" fc={fc} label="Diagnosed By" span={2} />
            </FormGrid>
          </FormSection>
          <FormSection title="Notes">
            <FormGrid cols={2}>
              <TextField formId={formId} name="notes" fc={fc} span={2} textarea rows={3} />
            </FormGrid>
          </FormSection>
        </>
      );
    case 'task':
      return (
        <>
          <FormSection title="Task">
            <FormGrid cols={2}>
              <TextField formId={formId} name="title" fc={fc} span={2} placeholder="e.g. Blood pressure monitoring" />
              <SelectField formId={formId} name="category" fc={fc} />
              <ProviderSelectField formId={formId} name="assignedTo" fc={fc} label="Assigned To" />
              <DateField formId={formId} name="dueDate" fc={fc} />
              <SelectField formId={formId} name="priority" fc={fc} />
              <SelectField formId={formId} name="status" fc={fc} span={2} />
            </FormGrid>
          </FormSection>
          <FormSection title="Details">
            <FormGrid cols={2}>
              <TextField formId={formId} name="description" fc={fc} span={2} textarea rows={3} placeholder="What exactly needs to happen?" />
            </FormGrid>
          </FormSection>
        </>
      );
    case 'recall':
      return (
        <>
          <FormSection title="Recall">
            <FormGrid cols={2}>
              <TextField formId={formId} name="reason" fc={fc} span={2} placeholder="e.g. Blood pressure review" />
              <SelectField formId={formId} name="type" fc={fc} />
              <DateField formId={formId} name="dueDate" fc={fc} />
              <SelectField formId={formId} name="priority" fc={fc} />
              <SelectField formId={formId} name="status" fc={fc} />
            </FormGrid>
          </FormSection>
          <FormSection title="Notes">
            <FormGrid cols={2}>
              <TextField formId={formId} name="notes" fc={fc} span={2} textarea rows={3} />
            </FormGrid>
          </FormSection>
        </>
      );
    case 'appointment':
      return (
        <>
          <FormSection title="When">
            <FormGrid cols={2}>
              <DateField formId={formId} name="date" fc={fc} />
              <TimeField formId={formId} name="startTime" fc={fc} />
              <NumberField formId={formId} name="durationMinutes" fc={fc} min={5} max={240} suffix="min" />
              <SelectField formId={formId} name="type" fc={fc} />
            </FormGrid>
          </FormSection>
          <FormSection title="Who and where">
            <FormGrid cols={2}>
              <ProviderSelectField formId={formId} name="providerName" fc={fc} />
              <SelectField formId={formId} name="locationName" fc={fc} />
              <SelectField formId={formId} name="status" fc={fc} />
              <SelectField formId={formId} name="priority" fc={fc} />
              <CheckboxField formId={formId} name="isTelehealth" fc={fc} />
            </FormGrid>
          </FormSection>
          <FormSection title="Reason">
            <FormGrid cols={2}>
              <TextField formId={formId} name="reason" fc={fc} span={2} placeholder="e.g. Blood pressure follow-up" />
              <TextField formId={formId} name="notes" fc={fc} span={2} textarea rows={2} />
            </FormGrid>
          </FormSection>
        </>
      );
  }
}
