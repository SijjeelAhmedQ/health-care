/**
 * Runtime registry of mounted forms. Each voice-controllable form registers a
 * controller when it mounts (see hooks/useRegisteredForm). The command
 * executor only talks to these controllers — never to the DOM directly.
 */
export type FormValue = string | number | boolean | null | undefined;

export interface FormController {
  formId: string;
  /** Optional instance key when several forms of the same type are mounted. */
  instanceKey?: string;
  isOpen(): boolean;
  open(): void;
  close(): void;
  getValues(): Record<string, FormValue>;
  setValues(values: Record<string, FormValue>): void;
  clearField(field: string): void;
  focusField(field: string): void;
  /** Validate the form; resolves with errors (empty array when valid). */
  validate(): Promise<string[]>;
  /** Perform the real submit (the same thing the Save button does). */
  submit(): Promise<void>;
  /** Human-readable summary for confirmation dialogs. */
  summarize(): Array<{ label: string; value: string }>;
}

type Listener = () => void;

class FormRegistryImpl {
  private controllers = new Map<string, FormController>();
  private order: string[] = [];
  private listeners = new Set<Listener>();

  register(controller: FormController): () => void {
    const key = this.key(controller.formId, controller.instanceKey);
    this.controllers.set(key, controller);
    this.order = [...this.order.filter((k) => k !== key), key];
    this.emit();
    return () => {
      this.controllers.delete(key);
      this.order = this.order.filter((k) => k !== key);
      this.emit();
    };
  }

  get(formId: string, instanceKey?: string): FormController | undefined {
    if (instanceKey) return this.controllers.get(this.key(formId, instanceKey));
    // Most recently registered instance of the form wins.
    for (let i = this.order.length - 1; i >= 0; i--) {
      const c = this.controllers.get(this.order[i]);
      if (c?.formId === formId) return c;
    }
    return undefined;
  }

  has(formId: string) {
    return this.get(formId) !== undefined;
  }

  mounted(): FormController[] {
    return this.order.map((k) => this.controllers.get(k)!).filter(Boolean);
  }

  /** The form the user is currently interacting with (open drawer/modal or a page-level form). */
  active(): FormController | undefined {
    const open = this.mounted().filter((c) => c.isOpen());
    return open[open.length - 1];
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private key(formId: string, instanceKey?: string) {
    return instanceKey ? `${formId}::${instanceKey}` : formId;
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const FormRegistry = new FormRegistryImpl();
