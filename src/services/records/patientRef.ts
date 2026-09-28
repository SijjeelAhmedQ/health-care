/**
 * How a record form names its patient: "James Ahmed (MRN-100373)". Readable wherever the value is
 * shown (the form, the confirmation, the assistant's CONTEXT) and unique even when two patients
 * share a name — so a record is never saved against the wrong one.
 */
import type { Patient } from '@/types/domain';

export const patientRef = (p: Pick<Patient, 'fullName' | 'mrn'>) => `${p.fullName} (${p.mrn})`;

/** The patient a form value names: its reference ("Name (MRN)") or its id. */
export function findPatientByRef<P extends Pick<Patient, 'id' | 'fullName' | 'mrn'>>(all: P[], ref: unknown): P | undefined {
  if (typeof ref !== 'string' || !ref.trim()) return undefined;
  const value = ref.trim();
  return all.find((p) => patientRef(p) === value) ?? all.find((p) => p.id === value);
}

/** "James Ahmed (MRN-100373)" -> "James Ahmed". */
export const patientRefName = (ref: unknown) => (typeof ref === 'string' ? ref.replace(/\s*\([^)]*\)\s*$/, '') : '');
