/** The five record types that belong to a patient and are managed in the Summary. */
export const RECORD_KINDS = ['medication', 'diagnosis', 'task', 'recall', 'appointment'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/** Everything the application creates, updates and deletes: the patient plus their records. */
export const ENTITY_KINDS = ['patient', ...RECORD_KINDS] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];
