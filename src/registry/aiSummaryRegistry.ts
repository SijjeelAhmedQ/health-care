/**
 * The AI Summary tab, reachable by the assistant while it is on screen: the
 * items extracted from the dictated note, and the action that opens one of
 * them in its form (pre-filled, saved only after confirmation). No DOM queries.
 */
import type { FieldValues } from '@/types/ai';
import type { RecordKind } from '@/types/records';

export interface ExtractedItemRef {
  kind: RecordKind;
  /** 1-based position among the items of that kind still on screen. */
  position: number;
  fields: FieldValues;
}

export interface AiSummaryController {
  items(): ExtractedItemRef[];
  /** Open the item's form, pre-filled. False when there is no such item. */
  add(kind: RecordKind, position: number): boolean;
  /** Extract the given note (or the text already in the box). */
  extract(note?: string): void;
}

let current: AiSummaryController | undefined;

export const AiSummaryRegistry = {
  register(controller: AiSummaryController) {
    current = controller;
    return () => {
      if (current === controller) current = undefined;
    };
  },
  get: () => current,
};
