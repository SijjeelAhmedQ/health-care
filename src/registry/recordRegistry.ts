/**
 * Runtime registry of mounted module pages (Medication, Diagnosis, Task,
 * Recall, Appointment, Patient).
 *
 * The voice executor reads and writes data through Redux, but anything that
 * involves the *user interface* — opening the create dialog, opening a record
 * for editing, typing into the list search box — goes through the controller a
 * page registers here when it mounts. No DOM queries anywhere.
 */
import type { AIRecordKind } from '@/types/ai';

export interface RecordController {
  kind: AIRecordKind;
  /** Open the blank create dialog (the same one the "Add" button opens). */
  openCreate(): void;
  /** Open an existing record for editing. Returns false when the id is unknown here. */
  openEdit(id: string): boolean;
  /** Type into the list's search box so the user sees what was searched. */
  setSearch(query: string): void;
  /** Highlight a row after voice touched it. */
  highlight?(id: string): void;
}

type Listener = () => void;

class RecordRegistryImpl {
  private controllers = new Map<AIRecordKind, RecordController>();
  private listeners = new Set<Listener>();

  register(controller: RecordController): () => void {
    this.controllers.set(controller.kind, controller);
    this.emit();
    return () => {
      if (this.controllers.get(controller.kind) === controller) this.controllers.delete(controller.kind);
      this.emit();
    };
  }

  get(kind: AIRecordKind): RecordController | undefined {
    return this.controllers.get(kind);
  }

  mounted(): AIRecordKind[] {
    return [...this.controllers.keys()];
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const RecordRegistry = new RecordRegistryImpl();

/** Module page that hosts each record kind — used to navigate before opening a dialog. */
export const recordPageId: Record<AIRecordKind, string> = {
  patient: 'patients',
  medication: 'medications',
  diagnosis: 'diagnoses',
  task: 'tasks',
  recall: 'recalls',
  appointment: 'appointments',
};

export const recordLabels: Record<AIRecordKind, { singular: string; plural: string }> = {
  patient: { singular: 'patient', plural: 'patients' },
  medication: { singular: 'medication', plural: 'medications' },
  diagnosis: { singular: 'diagnosis', plural: 'diagnoses' },
  task: { singular: 'task', plural: 'tasks' },
  recall: { singular: 'recall', plural: 'recalls' },
  appointment: { singular: 'appointment', plural: 'appointments' },
};
