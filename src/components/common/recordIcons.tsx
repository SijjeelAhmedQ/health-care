import { CalendarDays, ListChecks, Pill, Repeat, Stethoscope, type LucideIcon } from 'lucide-react';
import type { RecordKind } from '@/types/records';

const icons: Record<RecordKind, LucideIcon> = {
  medication: Pill,
  diagnosis: Stethoscope,
  task: ListChecks,
  recall: Repeat,
  appointment: CalendarDays,
};

/** The icon that stands for a record kind everywhere in the app. */
export function RecordIcon({ kind, size = 15 }: { kind: RecordKind; size?: number }) {
  const Icon = icons[kind];
  return <Icon size={size} aria-hidden />;
}
