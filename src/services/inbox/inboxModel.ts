/**
 * The Inbox reads four existing clinical record types and presents them as one
 * workqueue: lab results, radiology reports, referrals and discharge summaries.
 *
 * Nothing here changes those records. Each source row is normalised into an
 * `InboxItem` for the list, while the detail view reads the fields that only
 * that source has (a result value, a report body, a referral destination…).
 */
import dayjs from 'dayjs';
import type { ClinicalDocument, ClinicalNote, ImagingOrder, LabOrder, Referral } from '@/types/domain';

export const inboxCategories = ['lab', 'radiology', 'referral', 'discharge'] as const;
export type InboxCategory = (typeof inboxCategories)[number];

/** What the category switcher can show: one source, or every source together. */
export const inboxViews = ['all', ...inboxCategories] as const;
export type InboxView = (typeof inboxViews)[number];
export const isInboxView = (value?: string): value is InboxView => !!value && (inboxViews as readonly string[]).includes(value);

export interface InboxCategoryMeta {
  /** Label for the category switcher. */
  label: string;
  /** Used where horizontal space is tight (phones). */
  shortLabel: string;
  /** What a single item is called, e.g. "lab result". */
  singular: string;
  /** Its plural — spelled out, because "discharge summarys" is not a word. */
  plural: string;
  /** Sentence shown when the category is empty. */
  emptyHint: string;
  /** Column heading for the "who sent it" field — it differs per source. */
  fromLabel: string;
  dateLabel: string;
}

export const categoryMeta: Record<InboxCategory, InboxCategoryMeta> = {
  lab: {
    label: 'Lab',
    shortLabel: 'Lab',
    singular: 'lab result',
    plural: 'lab results',
    emptyHint: 'No lab results have arrived for this selection.',
    fromLabel: 'Laboratory',
    dateLabel: 'Resulted',
  },
  radiology: {
    label: 'Radiology',
    shortLabel: 'Rad',
    singular: 'radiology report',
    plural: 'radiology reports',
    emptyHint: 'No radiology reports have arrived for this selection.',
    fromLabel: 'Facility',
    dateLabel: 'Reported',
  },
  referral: {
    label: 'Referrals',
    shortLabel: 'Referrals',
    singular: 'referral',
    plural: 'referrals',
    emptyHint: 'No referrals for this selection.',
    fromLabel: 'Referred to',
    dateLabel: 'Created',
  },
  discharge: {
    label: 'Discharge Summary',
    shortLabel: 'Discharge',
    singular: 'discharge summary',
    plural: 'discharge summaries',
    emptyHint: 'No discharge summaries for this selection.',
    fromLabel: 'Author',
    dateLabel: 'Received',
  },
};

/** How a status reads on screen. Never the only signal — the label is always shown too. */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface InboxResultRow {
  test: string;
  value: string;
  referenceRange?: string;
  abnormal?: boolean;
  specimen?: string;
  notes?: string;
}

export interface InboxItem {
  /** Unique across categories: two sources could share a numeric id. */
  id: string;
  category: InboxCategory;
  sourceId: string;
  subject: string;
  patientId: string;
  patientName: string;
  /** Who it came from — lab, facility, specialist or author. */
  from: string;
  /** When it landed in the inbox (ISO). */
  receivedAt: string;
  status: string;
  statusTone: StatusTone;
  priority?: string;
  /** True when a clinician needs to look at this one before the others. */
  attention: boolean;
  attentionReason?: string;
  /** One line of context for the list row. */
  preview: string;
  /** Key facts for the detail header, straight from the source record. */
  meta: Array<{ label: string; value: string }>;
  /** Report or letter text, where the source has one. */
  body?: string;
  /** Structured result, for labs. */
  result?: InboxResultRow;
}

const iso = (value?: string) => (value ? dayjs(value).toISOString() : dayjs().toISOString());
const date = (value?: string) => (value ? dayjs(value).format('D MMM YYYY') : '—');

const URGENT = new Set(['STAT', 'Urgent', 'Emergency', 'High']);

function labTone(status: LabOrder['status'], abnormal?: boolean): StatusTone {
  if (abnormal) return 'danger';
  if (status === 'Resulted') return 'success';
  if (status === 'Cancelled') return 'neutral';
  return 'info';
}

function labItem(lab: LabOrder): InboxItem {
  const abnormal = lab.abnormal === true;
  const urgent = URGENT.has(lab.priority);
  return {
    id: `lab:${lab.id}`,
    category: 'lab',
    sourceId: lab.id,
    subject: lab.testName,
    patientId: lab.patientId,
    patientName: lab.patientName,
    from: lab.lab,
    receivedAt: iso(lab.resultedAt ?? lab.orderedAt),
    status: abnormal ? 'Abnormal' : lab.status,
    statusTone: labTone(lab.status, abnormal),
    priority: lab.priority,
    attention: abnormal || urgent,
    attentionReason: abnormal ? 'Result outside reference range' : urgent ? `${lab.priority} priority` : undefined,
    preview: lab.result ? `${lab.result}${lab.referenceRange ? ` · reference ${lab.referenceRange}` : ''}` : `${lab.panel} · ${lab.specimen}`,
    meta: [
      { label: 'Order number', value: lab.orderNumber },
      { label: 'Panel', value: lab.panel },
      { label: 'Specimen', value: lab.specimen },
      { label: 'Ordered by', value: lab.providerName },
      { label: 'Ordered', value: date(lab.orderedAt) },
      { label: 'Resulted', value: date(lab.resultedAt) },
      { label: 'Fasting', value: lab.fasting ? 'Yes' : 'No' },
    ],
    result: {
      test: lab.testName,
      value: lab.result ?? '—',
      referenceRange: lab.referenceRange,
      abnormal,
      specimen: lab.specimen,
      notes: lab.resultNotes,
    },
  };
}

function imagingItem(order: ImagingOrder): InboxItem {
  const urgent = URGENT.has(order.priority);
  return {
    id: `radiology:${order.id}`,
    category: 'radiology',
    sourceId: order.id,
    subject: `${order.modality} — ${order.bodyPart}`,
    patientId: order.patientId,
    patientName: order.patientName,
    from: order.facility,
    receivedAt: iso(order.scheduledFor ?? order.orderedAt),
    status: order.status,
    statusTone: order.status === 'Reported' ? 'success' : order.status === 'Cancelled' ? 'neutral' : 'info',
    priority: order.priority,
    attention: urgent,
    attentionReason: urgent ? `${order.priority} priority` : undefined,
    preview: order.clinicalIndication,
    meta: [
      { label: 'Order number', value: order.orderNumber },
      { label: 'Modality', value: order.modality },
      { label: 'Body part', value: order.bodyPart },
      { label: 'Contrast', value: order.contrast ? 'With contrast' : 'None' },
      { label: 'Ordered by', value: order.providerName },
      { label: 'Ordered', value: date(order.orderedAt) },
      { label: 'Performed', value: date(order.scheduledFor) },
    ],
    body: `Clinical indication: ${order.clinicalIndication}.\n\nExamination: ${order.modality} of ${order.bodyPart}${order.contrast ? ' with contrast' : ''}, performed at ${order.facility}.`,
  };
}

function referralItem(referral: Referral): InboxItem {
  const urgent = URGENT.has(referral.priority);
  const declined = referral.status === 'Declined';
  return {
    id: `referral:${referral.id}`,
    category: 'referral',
    sourceId: referral.id,
    subject: `${referral.specialty} referral`,
    patientId: referral.patientId,
    patientName: referral.patientName,
    from: referral.referredTo,
    receivedAt: iso(referral.createdAt),
    status: referral.status,
    statusTone: declined ? 'danger' : referral.status === 'Completed' || referral.status === 'Accepted' ? 'success' : referral.status === 'Pending' ? 'warning' : 'info',
    priority: referral.priority,
    attention: declined || urgent,
    attentionReason: declined ? 'Referral was declined' : urgent ? `${referral.priority} priority` : undefined,
    preview: referral.reason,
    meta: [
      { label: 'Referral number', value: referral.referralNumber },
      { label: 'Specialty', value: referral.specialty },
      { label: 'Referred to', value: referral.referredTo },
      { label: 'Referred by', value: referral.referringProvider },
      { label: 'Created', value: date(referral.createdAt) },
      { label: 'Expires', value: date(referral.expiresAt) },
      ...(referral.insuranceAuth ? [{ label: 'Insurance auth', value: referral.insuranceAuth }] : []),
    ],
    body: `Reason for referral: ${referral.reason}.`,
  };
}

function dischargeNoteItem(note: ClinicalNote): InboxItem {
  const draft = note.status === 'Draft';
  return {
    id: `discharge:note:${note.id}`,
    category: 'discharge',
    sourceId: note.id,
    subject: note.title,
    patientId: note.patientId,
    patientName: note.patientName,
    from: note.author,
    receivedAt: iso(note.createdAt),
    status: note.status,
    statusTone: note.status === 'Signed' ? 'success' : draft ? 'warning' : 'info',
    attention: draft,
    attentionReason: draft ? 'Unsigned draft' : undefined,
    preview: note.body.slice(0, 140),
    meta: [
      { label: 'Type', value: note.type },
      { label: 'Author', value: note.author },
      { label: 'Received', value: date(note.createdAt) },
      { label: 'Status', value: note.status },
    ],
    body: note.body,
  };
}

function dischargeDocumentItem(doc: ClinicalDocument): InboxItem {
  const pending = doc.status === 'Pending Review';
  return {
    id: `discharge:doc:${doc.id}`,
    category: 'discharge',
    sourceId: doc.id,
    subject: doc.title,
    patientId: doc.patientId ?? '',
    patientName: doc.patientName ?? 'Unassigned',
    from: doc.uploadedBy,
    receivedAt: iso(doc.uploadedAt),
    status: doc.status,
    statusTone: doc.status === 'Final' || doc.status === 'Signed' ? 'success' : pending ? 'warning' : 'info',
    attention: pending,
    attentionReason: pending ? 'Awaiting review' : undefined,
    preview: `${doc.fileType} document${doc.tags.length ? ` · ${doc.tags.join(', ')}` : ''}`,
    meta: [
      { label: 'Category', value: doc.category },
      { label: 'File type', value: doc.fileType },
      { label: 'Size', value: doc.sizeKb > 1024 ? `${(doc.sizeKb / 1024).toFixed(1)} MB` : `${doc.sizeKb} KB` },
      { label: 'Uploaded by', value: doc.uploadedBy },
      { label: 'Received', value: date(doc.uploadedAt) },
    ],
  };
}

export interface InboxSources {
  labs: LabOrder[];
  imaging: ImagingOrder[];
  referrals: Referral[];
  notes: ClinicalNote[];
  documents: ClinicalDocument[];
}

/**
 * Build the workqueue. Only records that have actually arrived are included:
 * a lab that has been resulted, a study that has been reported, any referral,
 * and discharge summaries filed as notes or documents.
 */
export function buildInboxItems({ labs, imaging, referrals, notes, documents }: InboxSources): InboxItem[] {
  const items: InboxItem[] = [
    ...labs.filter((l) => l.status === 'Resulted').map(labItem),
    ...imaging.filter((o) => o.status === 'Reported').map(imagingItem),
    ...referrals.map(referralItem),
    ...notes.filter((n) => n.type === 'Discharge').map(dischargeNoteItem),
    ...documents.filter((d) => d.category === 'Discharge Summary').map(dischargeDocumentItem),
  ];
  return items.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

/** Everything a row can be matched against when the user types in the search box. */
export function inboxSearchText(item: InboxItem): string {
  return `${item.subject} ${item.patientName} ${item.from} ${item.status} ${item.preview} ${item.priority ?? ''}`.toLowerCase();
}

/**
 * One search box for the whole queue. Every word typed must match somewhere:
 * patient name, NHI, phone number, subject, sender, status, the preview, any
 * detail on the item, or the date it arrived (typed as DD/MM/YYYY or "12 Sep").
 */
export function matchesInboxQuery(item: InboxItem, query: string, patient?: { mrn: string; phone: string }): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const received = dayjs(item.receivedAt);
  const haystack = [
    inboxSearchText(item),
    patient?.mrn ?? '',
    patient?.phone ?? '',
    item.meta.map((m) => m.value).join(' '),
    received.format('DD/MM/YYYY'),
    received.format('D MMM YYYY'),
  ]
    .join(' ')
    .toLowerCase();
  const phoneDigits = (patient?.phone ?? '').replace(/\D/g, '');
  return words.every((word) => {
    if (haystack.includes(word)) return true;
    // "555 2611" or "5552611" both find (210) 555-2611.
    const digits = word.replace(/\D/g, '');
    return digits.length >= 3 && digits.length === word.replace(/[\s()+-]/g, '').length && phoneDigits.includes(digits);
  });
}

export const statusToneClass: Record<StatusTone, string> = {
  neutral: 'is-neutral',
  info: 'is-info',
  success: 'is-success',
  warning: 'is-warning',
  danger: 'is-danger',
};
