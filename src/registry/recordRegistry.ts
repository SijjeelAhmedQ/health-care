/**
 * Runtime registry of mounted record lists (the Patients page and the Summary
 * tabs for medications, diagnoses, tasks, recalls and appointments).
 *
 * The assistant reads and writes data through Redux, but anything that
 * involves the *user interface* — opening the create dialog, opening a record
 * for editing, typing into the list search box — goes through the controller a
 * page registers here when it mounts. No DOM queries anywhere.
 */
import type { EntityKind } from '@/types/records';

export interface RecordController {
  kind: EntityKind;
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
  private controllers = new Map<EntityKind, RecordController>();
  private listeners = new Set<Listener>();

  register(controller: RecordController): () => void {
    this.controllers.set(controller.kind, controller);
    this.emit();
    return () => {
      if (this.controllers.get(controller.kind) === controller) this.controllers.delete(controller.kind);
      this.emit();
    };
  }

  get(kind: EntityKind): RecordController | undefined {
    return this.controllers.get(kind);
  }

  mounted(): EntityKind[] {
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

export const recordLabels: Record<EntityKind, { singular: string; plural: string }> = {
  patient: { singular: 'patient', plural: 'patients' },
  medication: { singular: 'medication', plural: 'medications' },
  diagnosis: { singular: 'diagnosis', plural: 'diagnoses' },
  task: { singular: 'task', plural: 'tasks' },
  recall: { singular: 'recall', plural: 'recalls' },
  appointment: { singular: 'appointment', plural: 'appointments' },
};
