import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormInstance } from 'antd';
import dayjs, { isDayjs } from 'dayjs';
import { FieldRegistry } from '@/registry/fieldRegistry';
import { FormRegistry, type FormController, type FormValue } from '@/registry/formRegistry';

/**
 * Multi-entry (tabbed) forms keep a snapshot of every entry's antd values; the active entry lives
 * in the form itself. The dialog owns this state — the hook only exposes it to the voice executor.
 */
export interface EntryStore<T> {
  items: Partial<T>[];
  active: number;
  setActive: (index: number) => void;
  /** Add an entry from already-converted antd values and make it active; returns its index. */
  add: (values: Partial<T>) => number;
}

interface Options<T> {
  formId: string;
  form: FormInstance<T>;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** The same handler the Save button calls. */
  onSubmit: (values: T) => Promise<void> | void;
  instanceKey?: string;
  entries?: EntryStore<T>;
}

/**
 * Registers an Ant Design form with the FormRegistry so the voice executor can
 * open it, fill it, validate it and (only after confirmation) submit it.
 * Returns a helper to highlight fields that were just filled by voice, plus the list of every field
 * voice has filled since the form was opened (drives the "Filled by voice" banner).
 */
export function useRegisteredForm<T extends object>({ formId, form, isOpen, open, close, onSubmit, instanceKey, entries }: Options<T>) {
  const [voiceFields, setVoiceFields] = useState<Record<string, number>>({});
  // Every field voice has filled since the form opened — cleared on close/save, not faded.
  const [voiceFilledFields, setVoiceFilledFields] = useState<string[]>([]);
  const latest = useRef({ isOpen, open, close, onSubmit, entries });
  latest.current = { isOpen, open, close, onSubmit, entries };
  const def = useMemo(() => FieldRegistry.getForm(formId), [formId]);
  const multi = !!entries;

  const markVoiceFilled = useCallback((names: string[]) => {
    if (!names.length) return;
    setVoiceFields((prev) => ({ ...prev, ...Object.fromEntries(names.map((k) => [k, Date.now()])) }));
    setVoiceFilledFields((prev) => [...prev, ...names.filter((n) => !prev.includes(n))]);
  }, []);
  const clearVoiceFilled = useCallback(() => setVoiceFilledFields([]), []);

  useEffect(() => {
    const toFormValue = (name: string, value: FormValue): unknown => {
      const field = def?.fields.find((f) => f.name === name);
      if (value === null || value === undefined) return value;
      if (field?.type === 'date' && typeof value === 'string') {
        const d = dayjs(value);
        return d.isValid() ? d : undefined;
      }
      if (field?.type === 'time' && typeof value === 'string') {
        const d = dayjs(`2000-01-01T${value.length === 5 ? value : value.padStart(5, '0')}`);
        return d.isValid() ? d : undefined;
      }
      return value;
    };
    const fromFormValue = (value: unknown, name: string): FormValue => {
      if (isDayjs(value)) {
        const field = def?.fields.find((f) => f.name === name);
        return field?.type === 'time' ? value.format('HH:mm') : value.format('YYYY-MM-DD');
      }
      if (Array.isArray(value)) return value.join(', ');
      if (value === null || value === undefined) return value as FormValue;
      if (typeof value === 'object') return JSON.stringify(value);
      return value as FormValue;
    };

    const toRegistryValues = (raw: Record<string, unknown>) => Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, fromFormValue(v, k)]));
    const liveValues = () => toRegistryValues(form.getFieldsValue(true) as Record<string, unknown>);
    /** Every entry as registry values, the active one read live from the form. */
    const allEntries = (): Record<string, FormValue>[] => {
      const store = latest.current.entries;
      if (!store) return [liveValues()];
      return store.items.map((snap, i) => (i === store.active ? liveValues() : toRegistryValues(snap as Record<string, unknown>)));
    };
    const entryLabel = (values: Record<string, FormValue>, i: number) => {
      const primary = def?.fields.find((f) => f.required && f.type === 'text') ?? def?.fields.find((f) => f.required);
      const name = primary ? values[primary.name] : undefined;
      return name ? String(name) : `${def?.title ?? formId} ${i + 1}`;
    };

    const controller: FormController = {
      formId,
      instanceKey,
      entries: multi
        ? {
            count: () => latest.current.entries?.items.length ?? 1,
            active: () => latest.current.entries?.active ?? 0,
            setActive: (i) => latest.current.entries?.setActive(i),
            add: (values) => {
              const converted = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, toFormValue(k, v)])) as Partial<T>;
              const index = latest.current.entries?.add(converted) ?? 0;
              markVoiceFilled(Object.keys(values));
              return index;
            },
            getAll: allEntries,
          }
        : undefined,
      isOpen: () => latest.current.isOpen,
      open: () => latest.current.open(),
      close: () => latest.current.close(),
      getValues: liveValues,
      setValues: (values) => {
        const converted = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, toFormValue(k, v)]));
        form.setFieldsValue(converted as never);
        markVoiceFilled(Object.keys(values));
        const first = Object.keys(values)[0];
        if (first) {
          try {
            form.scrollToField(first as never, { block: 'center', behavior: 'smooth' });
          } catch {
            /* field may not be mounted */
          }
        }
      },
      clearField: (field) => {
        form.setFieldValue(field as never, undefined as never);
      },
      focusField: (field) => {
        try {
          form.scrollToField(field as never, { block: 'center', behavior: 'smooth' });
          const instance = form.getFieldInstance(field as never) as { focus?: () => void } | undefined;
          instance?.focus?.();
        } catch {
          /* ignore */
        }
      },
      validate: async () => {
        const errors: string[] = [];
        try {
          await form.validateFields();
        } catch (e) {
          const err = e as { errorFields?: Array<{ name: unknown[]; errors: string[] }> };
          errors.push(...(err.errorFields ?? []).map((f) => f.errors[0] ?? `${f.name.join('.')} is invalid`));
        }
        // Inactive entries are not mounted in antd, so their required fields are checked through the registry.
        const store = latest.current.entries;
        if (store) {
          allEntries().forEach((values, i) => {
            if (i === store.active) return;
            for (const f of FieldRegistry.missingRequired(formId, values)) errors.push(`${entryLabel(values, i)}: ${f.label} is required`);
          });
        }
        return errors;
      },
      submit: async () => {
        const values = await form.validateFields();
        await latest.current.onSubmit(values as T);
      },
      summarize: () => {
        const entriesValues = allEntries();
        if (entriesValues.length > 1) {
          // One line per entry: "Panadol — Dosage: 500 mg, Frequency: Twice daily, Duration: 10 days".
          const keyFields = (def?.fields ?? []).filter((f) => (f.required || ['duration', 'route'].includes(f.name)) && f.name !== 'patientName');
          return entriesValues.map((values, i) => ({
            label: `${i + 1}. ${entryLabel(values, i)}`,
            value: keyFields.filter((f) => values[f.name] !== undefined && values[f.name] !== '' && values[f.name] !== null && String(values[f.name]) !== entryLabel(values, i)).map((f) => `${f.label}: ${String(values[f.name])}`).join(', ') || '—',
          }));
        }
        const values = entriesValues[0];
        const fields = def?.fields ?? Object.keys(values).map((k) => ({ name: k, label: k }));
        return fields
          .filter((f) => values[f.name] !== undefined && values[f.name] !== '' && values[f.name] !== null && values[f.name] !== false)
          .map((f) => ({ label: f.label, value: String(values[f.name]) }));
      },
    };
    return FormRegistry.register(controller);
  }, [formId, form, def, instanceKey, multi, markVoiceFilled]);

  // A closed form has nothing left to review.
  useEffect(() => {
    if (!isOpen) setVoiceFilledFields([]);
  }, [isOpen]);

  // Fade highlight out after a moment.
  useEffect(() => {
    if (!Object.keys(voiceFields).length) return;
    const t = setTimeout(() => setVoiceFields({}), 2500);
    return () => clearTimeout(t);
  }, [voiceFields]);

  const fieldClass = useCallback((name: string) => (voiceFields[name] ? 'voice-filled' : undefined), [voiceFields]);

  return { fieldClass, voiceFilledFields, clearVoiceFilled, definition: def };
}
