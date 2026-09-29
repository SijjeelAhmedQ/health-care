/**
 * No double booking: a patient, or a provider, can never have two appointments that overlap in time.
 * Checked where appointments are written (the appointment service) and, earlier and more helpfully,
 * wherever they are prepared (the appointment form, the reschedule dialog, the assistant).
 */
import dayjs, { isDayjs } from 'dayjs';
import type { Appointment } from '@/types/domain';

/** Appointments that no longer hold their slot. */
const RELEASED = new Set(['Cancelled', 'No Show']);

export interface Slot {
  /** The appointment being moved — never conflicts with itself. */
  id?: string;
  patientId?: string;
  patientName?: string;
  providerId?: string;
  providerName?: string;
  date: string;
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
  status?: string;
}

export interface Conflict {
  who: 'patient' | 'provider';
  with: Pick<Appointment, 'id' | 'date' | 'startTime' | 'endTime' | 'patientName' | 'providerName'>;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
const range = (s: Slot) => {
  const start = minutes(s.startTime);
  const end = s.endTime ? minutes(s.endTime) : start + (s.durationMinutes ?? 30);
  return [start, end > start ? end : start + 30] as const;
};
const sameProvider = (a: Slot, b: Slot) =>
  (!!a.providerId && a.providerId !== 'unknown' && a.providerId === b.providerId) || (!!a.providerName && a.providerName.toLowerCase() === (b.providerName ?? '').toLowerCase());

/** The first appointment in `booked` that `slot` would overlap — for the same patient or the same provider. */
export function findConflict(booked: Slot[], slot: Slot): Conflict | null {
  if (RELEASED.has(slot.status ?? '') || !slot.date || !slot.startTime) return null;
  const [start, end] = range(slot);
  for (const other of booked) {
    if (other.id && other.id === slot.id) continue;
    if (RELEASED.has(other.status ?? '') || other.date !== slot.date || !other.startTime) continue;
    const [oStart, oEnd] = range(other);
    if (start >= oEnd || oStart >= end) continue;
    const who = slot.patientId && other.patientId === slot.patientId ? 'patient' : sameProvider(slot, other) ? 'provider' : null;
    if (!who) continue;
    const [s, e] = range(other);
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return { who, with: { id: other.id ?? '', date: other.date, startTime: hhmm(s), endTime: hhmm(e), patientName: other.patientName ?? '', providerName: other.providerName ?? '' } };
  }
  return null;
}

/** What a conflict means, in a sentence the provider (and the assistant) can act on. */
export function describeConflict(slot: Slot, conflict: Conflict): string {
  const when = `${dayjs(conflict.with.date).format('D MMM YYYY')} at ${conflict.with.startTime}–${conflict.with.endTime}`;
  return conflict.who === 'patient'
    ? `${slot.patientName || 'This patient'} already has an appointment on ${when}${conflict.with.providerName ? ` with ${conflict.with.providerName}` : ''} — choose another time.`
    : `${slot.providerName || 'The provider'} is already booked on ${when}${conflict.with.patientName ? ` (${conflict.with.patientName})` : ''} — choose another time.`;
}

/** A form's values (antd pickers or plain strings) as a slot. */
export function slotFromValues(values: Record<string, unknown>, extra: Partial<Slot> = {}): Slot {
  const date = isDayjs(values.date) ? values.date.format('YYYY-MM-DD') : String(values.date ?? '');
  const startTime = isDayjs(values.startTime) ? values.startTime.format('HH:mm') : String(values.startTime ?? '');
  const duration = Number(values.durationMinutes ?? 30) || 30;
  return { date, startTime, durationMinutes: duration, providerName: values.providerName ? String(values.providerName) : undefined, status: values.status ? String(values.status) : undefined, ...extra };
}

/**
 * Several appointments about to be saved together (a tab each): each against what is booked and against
 * the ones before it in the same batch. One message per clash.
 */
export function batchConflicts(booked: Slot[], slots: Slot[]): string[] {
  const problems: string[] = [];
  const taken: Slot[] = [...booked];
  slots.forEach((slot, i) => {
    const conflict = findConflict(taken, slot);
    if (conflict) problems.push(`Appointment ${i + 1}: ${describeConflict(slot, conflict)}`);
    taken.push({ ...slot, id: slot.id ?? `batch-${i}` });
  });
  return problems;
}
