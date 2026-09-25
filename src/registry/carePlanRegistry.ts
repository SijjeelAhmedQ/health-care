/**
 * The Care Plan dialog, reachable by the assistant while the Summary is on
 * screen: one dialog with a tab per record kind (Medication, Diagnosis, Task,
 * Recall, Appointment), and inside each a tab per record — so "metformin,
 * Panadol and gabapentin, hypertension, a BP task, a recall and a follow-up"
 * is reviewed in one place and saved with one confirmation.
 *
 * Every record tab is also a normal registered form (FormRegistry, formId =
 * its kind, instanceKey = CARE_PLAN_INSTANCE + entry id), so answering a
 * question or correcting a value goes through fill_open_form as usual.
 */
import type { FieldValues } from '@/types/ai';
import type { RecordKind } from '@/types/records';
import type { FormValue } from '@/registry/formRegistry';

/** The id a care-plan save is staged under (PendingConfirmation.formId). */
export const CARE_PLAN_FORM_ID = 'care_plan';
/** Prefix of the instanceKey of every record form inside the care plan. */
export const CARE_PLAN_INSTANCE = 'care-plan:';

export type CarePlanItems = Partial<Record<RecordKind, FieldValues[]>>;

export interface CarePlanEntryRef {
  id: string;
  kind: RecordKind;
  /** Live values, in registry format (dates YYYY-MM-DD, times HH:mm). */
  values: Record<string, FormValue>;
}

export interface CarePlanController {
  isOpen(): boolean;
  /** Open the dialog with these records (replacing whatever it held). */
  open(items: CarePlanItems): void;
  /** Add records to the open dialog: one new tab each. */
  add(items: CarePlanItems): void;
  /** Every record tab once mounted, in kind order. */
  entries(): CarePlanEntryRef[];
  /** Bring a record tab to the front. */
  focus(id: string): void;
  close(): void;
  /** Errors across every record (empty when all can be saved). */
  validate(): Promise<string[]>;
  /** Save every record; resolves with how many were saved. */
  submit(): Promise<number>;
  summarize(): Array<{ label: string; value: string }>;
}

let current: CarePlanController | undefined;

export const CarePlanRegistry = {
  register(controller: CarePlanController) {
    current = controller;
    return () => {
      if (current === controller) current = undefined;
    };
  },
  get: () => current,
  /** True while the dialog is open. */
  isOpen: () => !!current?.isOpen(),
};
