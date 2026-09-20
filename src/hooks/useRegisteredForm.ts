import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormInstance } from 'antd';
import dayjs, { isDayjs } from 'dayjs';
import { FieldRegistry } from '@/registry/fieldRegistry';
import { FormRegistry, type FormController, type FormValue } from '@/registry/formRegistry';

interface Options<T> {
  formId: string;
  form: FormInstance<T>;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** The same handler the Save button calls. */
  onSubmit: (values: T) => Promise<void> | void;
  instanceKey?: string;
}

/**
 * Registers an Ant Design form with the FormRegistry so the voice executor can
 * open it, fill it, validate it and (only after confirmation) submit it.
 * Returns a helper to highlight fields that were just filled by voice.
 */
export function useRegisteredForm<T extends object>({ formId, form, isOpen, open, close, onSubmit, instanceKey }: Options<T>) {
  const [voiceFields, setVoiceFields] = useState<Record<string, number>>({});
  const latest = useRef({ isOpen, open, close, onSubmit });
  latest.current = { isOpen, open, close, onSubmit };
  const def = useMemo(() => FieldRegistry.getForm(formId), [formId]);

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

    const controller: FormController = {
      formId,
      instanceKey,
      isOpen: () => latest.current.isOpen,
      open: () => latest.current.open(),
      close: () => latest.current.close(),
      getValues: () => {
        const raw = form.getFieldsValue(true) as Record<string, unknown>;
        return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, fromFormValue(v, k)]));
      },
      setValues: (values) => {
        const converted = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, toFormValue(k, v)]));
        form.setFieldsValue(converted as never);
        setVoiceFields((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(values).map((k) => [k, Date.now()])) }));
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
        try {
          await form.validateFields();
          return [];
        } catch (e) {
          const err = e as { errorFields?: Array<{ name: unknown[]; errors: string[] }> };
          return (err.errorFields ?? []).map((f) => f.errors[0] ?? `${f.name.join('.')} is invalid`);
        }
      },
      submit: async () => {
        const values = await form.validateFields();
        await latest.current.onSubmit(values as T);
      },
      summarize: () => {
        const values = controller.getValues();
        const fields = def?.fields ?? Object.keys(values).map((k) => ({ name: k, label: k }));
        return fields
          .filter((f) => values[f.name] !== undefined && values[f.name] !== '' && values[f.name] !== null && values[f.name] !== false)
          .map((f) => ({ label: f.label, value: String(values[f.name]) }));
      },
    };
    return FormRegistry.register(controller);
  }, [formId, form, def, instanceKey]);

  // Fade highlight out after a moment.
  useEffect(() => {
    if (!Object.keys(voiceFields).length) return;
    const t = setTimeout(() => setVoiceFields({}), 2500);
    return () => clearTimeout(t);
  }, [voiceFields]);

  const fieldClass = useCallback((name: string) => (voiceFields[name] ? 'voice-filled' : undefined), [voiceFields]);

  return { fieldClass, definition: def };
}
