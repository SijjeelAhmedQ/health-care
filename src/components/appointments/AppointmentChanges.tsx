import { useEffect, useMemo } from 'react';
import { Form, Tag, Tooltip, message } from 'antd';
import { CalendarClock, CalendarX2, MessageSquareText } from 'lucide-react';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { appointmentsSlice } from '@/store/slices/recordSlices';
import { patientSelectors } from '@/store/slices/patientSlice';
import { Avatar, FormGrid } from '@/components/common';
import { RegisteredFormModal } from '@/components/forms/RegisteredForm';
import { DateField, NumberField, TextField, TimeField } from '@/components/forms/fields';
import { batchConflicts, slotFromValues } from '@/services/appointments/conflicts';
import type { Appointment, Patient } from '@/types/domain';

/**
 * Cancelling and rescheduling an appointment — the same dialogs, flags and notes wherever an appointment is
 * shown: the provider's My Appointments and the patient's Appointments tab. Every change carries the
 * provider's reason, and the patient is told what changed and why.
 */

type AnyValues = Record<string, unknown>;
type Notice = NonNullable<Appointment['patientNotices']>[number];

/** Appointments that are over, one way or another: nothing left to cancel or move. */
const CLOSED = new Set(['Cancelled', 'No Show', 'Completed']);
export const isChangeable = (a: Appointment) => !CLOSED.has(a.status) && !dayjs(`${a.date}T${a.startTime}`).isBefore(dayjs());

const when = (date: string, time: string) => `${dayjs(date).format('ddd D MMM YYYY')} at ${dayjs(`2000-01-01T${time}`).format('h:mm A')}`;

/**
 * What the patient is told — by SMS to their phone, or by email when there is no phone — in plain words,
 * with the provider's reason.
 */
export function patientNotice(kind: Notice['kind'], a: Appointment, patient: Pick<Patient, 'firstName' | 'phone' | 'email'> | undefined, reason: string, moved?: { date: string; time: string }): Notice {
  const hello = `Hello ${patient?.firstName ?? a.patientName.split(' ')[0]},`;
  const text =
    kind === 'cancelled'
      ? `${hello} your appointment with ${a.providerName} on ${when(a.date, a.startTime)} has been cancelled. Reason: ${reason} Please call the clinic to book a new time.`
      : `${hello} your appointment with ${a.providerName} has been moved from ${when(a.date, a.startTime)} to ${when(moved!.date, moved!.time)}. Reason: ${reason}`;
  const channel: Notice['channel'] = patient?.phone ? 'SMS' : 'Email';
  return { kind, channel, to: channel === 'SMS' ? patient?.phone ?? '' : patient?.email ?? '', message: text.replace(/\.\s*\./g, '.'), at: new Date().toISOString() };
}

/** Cancelled / Rescheduled, at a glance — shown next to the status in every appointment grid. */
export function AppointmentChangeFlags({ a }: { a: Appointment }) {
  const moves = a.rescheduleHistory?.length ?? 0;
  return (
    <span className="appt-flags">
      {a.status === 'Cancelled' && (
        <Tag color="red" icon={<CalendarX2 size={12} />} className="appt-flag">
          Cancelled
        </Tag>
      )}
      {moves > 0 && (
        <Tag color="gold" icon={<CalendarClock size={12} />} className="appt-flag">
          Rescheduled{moves > 1 ? ` ×${moves}` : ''}
        </Tag>
      )}
    </span>
  );
}

/**
 * Why it changed, and what the patient was told: the cancellation note, the latest reschedule note (from
 * → to), and the message sent to the patient. Nothing when the appointment was never changed.
 */
export function AppointmentChangeNotes({ a, compact }: { a: Appointment; compact?: boolean }) {
  const move = a.rescheduleHistory?.at(-1);
  const notice = a.patientNotices?.at(-1);
  // In a grid cell a dash says "no changes"; elsewhere nothing is shown.
  if (!(a.status === 'Cancelled' && a.cancellationNote) && !move && !notice) return compact ? <span className="muted">—</span> : null;
  return (
    <span className={`appt-notes ${compact ? 'is-compact' : ''}`}>
      {a.status === 'Cancelled' && a.cancellationNote && (
        <span className="appt-note is-cancel">
          <strong>Cancellation note:</strong> {a.cancellationNote}
        </span>
      )}
      {move && (
        <span className="appt-note is-move">
          <strong>Reschedule note:</strong> {dayjs(move.fromDate).format('D MMM')} {move.fromTime} → {dayjs(move.toDate).format('D MMM')} {move.toTime} — {move.comment}
        </span>
      )}
      {notice && (
        <Tooltip title={notice.message}>
          <span className="appt-note is-told">
            <MessageSquareText size={12} /> Patient told by {notice.channel}
            {notice.to ? ` (${notice.to})` : ''} · {dayjs(notice.at).format('D MMM, h:mm A')}
          </span>
        </Tooltip>
      )}
    </span>
  );
}

/** What is being changed, shown at the top of both dialogs. */
function AppointmentSummary({ a }: { a: Appointment }) {
  return (
    <div className="schedule-dialog-summary">
      <Avatar name={a.patientName} size={32} />
      <div>
        <strong>{a.patientName}</strong> <span className="muted">{a.patientMrn}</span>
        <div className="muted">
          {dayjs(a.date).format('ddd D MMM YYYY')} · {a.startTime}–{a.endTime} · {a.providerName} · {a.reason || '—'}
        </div>
      </div>
    </div>
  );
}

const usePatientOf = (a: Appointment | null) => useAppSelector((s) => (a ? patientSelectors.selectById(s, a.patientId) : undefined));

/** Cancel with a note; the appointment stays on record as cancelled and the patient is told why. */
export function CancelAppointmentDialog({ appointment, onClose }: { appointment: Appointment | null; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [form] = Form.useForm<AnyValues>();
  const a = appointment;
  const patient = usePatientOf(a);
  const submit = async (values: AnyValues) => {
    if (!a) return;
    const note = String(values.cancellationNote ?? '').trim();
    const notice = patientNotice('cancelled', a, patient, note);
    await dispatch(
      appointmentsSlice.update({
        id: a.id,
        patch: { status: 'Cancelled', cancelledAt: new Date().toISOString(), cancellationNote: note, patientNotices: [...(a.patientNotices ?? []), notice] },
      }),
    ).unwrap();
    message.success(`Appointment with ${a.patientName} cancelled — ${a.patientName.split(' ')[0]} was told by ${notice.channel}`);
  };
  return (
    <RegisteredFormModal<AnyValues>
      formId="appointment_cancel"
      title="Cancel appointment"
      description={a ? `It stays on record as cancelled, with your note — and ${a.patientName} is told, with the same reason.` : undefined}
      icon={<CalendarX2 size={18} />}
      size="md"
      open={!!a}
      onOpen={() => undefined}
      onClose={onClose}
      onSubmit={submit}
      form={form}
    >
      {({ fc }) => (
        <>
          {a && <AppointmentSummary a={a} />}
          <TextField formId="appointment_cancel" name="cancellationNote" fc={fc} textarea rows={3} placeholder="e.g. Patient admitted to hospital; will rebook after discharge" />
        </>
      )}
    </RegisteredFormModal>
  );
}

/** Move to a new slot with a comment; never onto a double booking; the patient is told the new time and why. */
export function RescheduleAppointmentDialog({ appointment, onClose }: { appointment: Appointment | null; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const booked = useAppSelector(appointmentsSlice.selectors.selectAll);
  const [form] = Form.useForm<AnyValues>();
  const a = appointment;
  const patient = usePatientOf(a);
  // Starts on the current slot, so only what changes has to be changed.
  const initialValues = useMemo<AnyValues>(
    () => (a ? { date: dayjs(a.date), startTime: dayjs(`2000-01-01T${a.startTime}`), durationMinutes: a.durationMinutes } : {}),
    [a],
  );
  useEffect(() => {
    if (!a) return;
    form.resetFields();
    form.setFieldsValue(initialValues as never);
  }, [a, form, initialValues]);

  // No double booking: the new slot against every other appointment of this patient and this provider.
  const checkAll = (all: AnyValues[]) =>
    a ? batchConflicts(booked, all.map((v) => slotFromValues(v, { id: a.id, patientId: a.patientId, patientName: a.patientName, providerId: a.providerId, providerName: a.providerName }))) : [];

  const submit = async (values: AnyValues) => {
    if (!a) return;
    const slot = slotFromValues(values);
    const duration = Number(values.durationMinutes ?? a.durationMinutes) || a.durationMinutes;
    const endTime = dayjs(`2000-01-01T${slot.startTime}`).add(duration, 'minute').format('HH:mm');
    const comment = String(values.comment ?? '').trim();
    const move = { fromDate: a.date, fromTime: a.startTime, toDate: slot.date, toTime: slot.startTime, comment, at: new Date().toISOString(), by: user?.fullName ?? 'Provider' };
    const notice = patientNotice('rescheduled', a, patient, comment, { date: slot.date, time: slot.startTime });
    await dispatch(
      appointmentsSlice.update({
        id: a.id,
        patch: {
          date: slot.date,
          startTime: slot.startTime,
          endTime,
          durationMinutes: duration,
          rescheduleHistory: [...(a.rescheduleHistory ?? []), move],
          patientNotices: [...(a.patientNotices ?? []), notice],
        },
      }),
    ).unwrap();
    message.success(`Moved ${a.patientName}'s appointment to ${dayjs(slot.date).format('D MMM')} at ${slot.startTime} — ${a.patientName.split(' ')[0]} was told by ${notice.channel}`);
  };

  return (
    <RegisteredFormModal<AnyValues>
      formId="appointment_reschedule"
      title="Reschedule appointment"
      description={a ? `Pick the new date and time — no double bookings for the patient or the provider. ${a.patientName} is told the new time and your reason.` : undefined}
      icon={<CalendarClock size={18} />}
      size="md"
      open={!!a}
      onOpen={() => undefined}
      onClose={onClose}
      onSubmit={submit}
      initialValues={initialValues}
      form={form}
      checkAll={checkAll}
    >
      {({ fc }) => (
        <>
          {a && <AppointmentSummary a={a} />}
          <FormGrid cols={3}>
            <DateField formId="appointment_reschedule" name="date" fc={fc} />
            <TimeField formId="appointment_reschedule" name="startTime" fc={fc} />
            <NumberField formId="appointment_reschedule" name="durationMinutes" fc={fc} min={5} max={240} suffix="min" />
          </FormGrid>
          <TextField formId="appointment_reschedule" name="comment" fc={fc} textarea rows={3} placeholder="e.g. Patient asked for an evening slot" />
        </>
      )}
    </RegisteredFormModal>
  );
}
