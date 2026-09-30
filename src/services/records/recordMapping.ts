/**
 * One description of each record type, shared by the Summary tabs, the
 * assistant's tools and the AI Summary. Everything here is pure: how a record is named,
 * how it is summarised for a confirmation dialog, and how a name the user
 * said is matched to an existing record.
 */
import dayjs from 'dayjs';
import type { EntityKind } from '@/types/records';
import type { Appointment, Diagnosis, Medication, Patient, Recall, Task } from '@/types/domain';

export type AnyRecord = Medication | Diagnosis | Task | Recall | Appointment | Patient;

const date = (value?: string) => (value ? dayjs(value).format('D MMM YYYY') : '—');
const time = (value?: string) => (value ? dayjs(`2000-01-01T${value}`).format('h:mm A') : '');

/** The one line that names a record in a list, a confirmation or a sentence. */
export function recordLabel(kind: EntityKind, row: AnyRecord): string {
  switch (kind) {
    case 'medication':
      return (row as Medication).name;
    case 'diagnosis':
      return (row as Diagnosis).description;
    case 'task':
      return (row as Task).title;
    case 'recall':
      return (row as Recall).reason;
    case 'appointment': {
      const a = row as Appointment;
      return `${a.type} on ${date(a.date)}`;
    }
    case 'patient':
      return (row as Patient).fullName;
  }
}

/** Secondary line: the detail that distinguishes two similar records. */
export function recordSubtitle(kind: EntityKind, row: AnyRecord): string {
  switch (kind) {
    case 'medication': {
      const m = row as Medication;
      return [m.dosage, m.frequency, m.route].filter(Boolean).join(' · ');
    }
    case 'diagnosis': {
      const d = row as Diagnosis;
      return [d.icd10, d.status, `onset ${date(d.onsetDate)}`].filter(Boolean).join(' · ');
    }
    case 'task': {
      const t = row as Task;
      return [t.category, `due ${date(t.dueDate)}`, t.assignedTo].filter(Boolean).join(' · ');
    }
    case 'recall': {
      const r = row as Recall;
      return [r.type, `due ${date(r.dueDate)}`, r.status].filter(Boolean).join(' · ');
    }
    case 'appointment': {
      const a = row as Appointment;
      return [time(a.startTime), a.providerName, a.status].filter(Boolean).join(' · ');
    }
    case 'patient': {
      const p = row as Patient;
      return [p.mrn, `${p.age}y`, p.gender].filter(Boolean).join(' · ');
    }
  }
}

/** Key/value pairs shown before a destructive action, so the user sees exactly what goes. */
export function recordSummary(kind: EntityKind, row: AnyRecord): Array<{ label: string; value: string }> {
  const pairs: Array<[string, string | number | boolean | undefined]> = (() => {
    switch (kind) {
      case 'medication': {
        const m = row as Medication;
        return [['Medication', m.name], ['Dosage', m.dosage], ['Frequency', m.frequency], ['Route', m.route], ['Duration', m.duration], ['Status', m.status], ['Started', date(m.startDate)]];
      }
      case 'diagnosis': {
        const d = row as Diagnosis;
        return [['Diagnosis', d.description], ['ICD-10', d.icd10], ['Status', d.status], ['Severity', d.severity], ['Onset', date(d.onsetDate)]];
      }
      case 'task': {
        const t = row as Task;
        return [['Task', t.title], ['Category', t.category], ['Due', date(t.dueDate)], ['Priority', t.priority], ['Status', t.status], ['Assigned to', t.assignedTo]];
      }
      case 'recall': {
        const r = row as Recall;
        return [['Reason', r.reason], ['Type', r.type], ['Due', date(r.dueDate)], ['Priority', r.priority], ['Status', r.status]];
      }
      case 'appointment': {
        const a = row as Appointment;
        return [['Type', a.type], ['Date', date(a.date)], ['Time', time(a.startTime)], ['Provider', a.providerName], ['Reason', a.reason], ['Status', a.status]];
      }
      case 'patient': {
        const p = row as Patient;
        return [['Name', p.fullName], ['MRN', p.mrn], ['Date of birth', date(p.dateOfBirth)], ['Gender', p.gender], ['Phone', p.phone]];
      }
    }
  })();
  return pairs.filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([label, value]) => ({ label, value: String(value) }));
}

/** Everything a spoken phrase may be matched against. */
export function recordSearchText(kind: EntityKind, row: AnyRecord): string {
  return `${recordLabel(kind, row)} ${recordSubtitle(kind, row)}`.toLowerCase();
}

/** The date a record belongs to — used for sorting and "what is due" questions. */
export function recordDate(kind: EntityKind, row: AnyRecord): string {
  switch (kind) {
    case 'medication':
      return (row as Medication).startDate;
    case 'diagnosis':
      return (row as Diagnosis).onsetDate;
    case 'task':
      return (row as Task).dueDate;
    case 'recall':
      return (row as Recall).dueDate;
    case 'appointment':
      return (row as Appointment).date;
    case 'patient':
      return (row as Patient).registeredAt;
  }
}

export function recordStatus(kind: EntityKind, row: AnyRecord): string {
  switch (kind) {
    case 'medication':
      return (row as Medication).status;
    case 'diagnosis':
      return (row as Diagnosis).status;
    case 'task':
      return (row as Task).status;
    case 'recall':
      return (row as Recall).status;
    case 'appointment':
      return (row as Appointment).status;
    case 'patient':
      return (row as Patient).status;
  }
}

export interface MatchResult<T> {
  /** The single record the phrase identifies. Undefined when there is no match, or more than one. */
  match?: T;
  /** Every candidate, so the caller can ask the user to choose. */
  candidates: T[];
}

/**
 * Match a spoken phrase ("the metformin", "blood pressure task") to one record.
 * Deliberately strict: when several records match, nothing is chosen — the
 * caller asks the user which one rather than guessing.
 */
export function matchRecord<T extends { id: string }>(kind: EntityKind, rows: T[], query: string | undefined): MatchResult<T> {
  if (!rows.length) return { candidates: [] };
  const q = (query ?? '').toLowerCase().replace(/^(?:the|this|that|my)\s+/, '').replace(/\s+(?:record|entry)$/, '').trim();
  if (!q) return { candidates: rows.length === 1 ? rows : [], match: rows.length === 1 ? rows[0] : undefined };

  const byId = rows.find((r) => r.id === query);
  if (byId) return { match: byId, candidates: [byId] };

  const scored = rows
    .map((row) => {
      const label = recordLabel(kind, row as unknown as AnyRecord).toLowerCase();
      const haystack = recordSearchText(kind, row as unknown as AnyRecord);
      let score = 0;
      if (label === q) score = 100;
      else if (label.startsWith(q)) score = 80;
      else if (label.includes(q)) score = 70;
      else if (haystack.includes(q)) score = 50;
      else {
        const tokens = q.split(/\s+/).filter((t) => t.length > 2);
        if (tokens.length && tokens.every((t) => haystack.includes(t))) score = 40;
      }
      return { row, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { candidates: [] };
  const best = scored[0];
  const tied = scored.filter((s) => s.score === best.score);
  return { match: tied.length === 1 ? best.row : undefined, candidates: scored.map((s) => s.row) };
}
