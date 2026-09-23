import { DatePicker, Form, Input, InputNumber, Select, Switch, TimePicker, Checkbox } from 'antd';
import type { Rule } from 'antd/es/form';
import { FieldRegistry } from '@/registry/fieldRegistry';
import { useAppSelector } from '@/store';
import { patientSelectors } from '@/store/slices/patientSlice';
import { providerSelectors } from '@/store/slices/providerSlice';

interface BaseFieldProps {
  formId: string;
  name: string;
  fc: (name: string) => string | undefined;
  span?: 1 | 2 | 3 | 4;
  rules?: Rule[];
  placeholder?: string;
  label?: string;
  /** Guidance shown under the field, before the user makes a mistake. */
  help?: string;
  disabled?: boolean;
}

function useDef(formId: string, name: string) {
  const def = FieldRegistry.resolveField(formId, name);
  return { label: def?.label ?? name, required: def?.required ?? false, options: def?.options };
}

const spanClass = (span?: number) => (span && span > 1 ? `span-${span}` : undefined);
const cls = (span: number | undefined, fc: (n: string) => string | undefined, name: string) =>
  [spanClass(span), fc(name)].filter(Boolean).join(' ') || undefined;

/** Messages say what to do, not just what is wrong. */
const requiredRule = (label: string, how = 'Enter'): Rule => ({ required: true, message: `${how} ${label.toLowerCase()}` });
const selectRule = (label: string): Rule => ({ required: true, message: `Select ${label.toLowerCase()}` });

export function TextField({ formId, name, fc, span, rules, placeholder, label, help, disabled, textarea, rows }: BaseFieldProps & { textarea?: boolean; rows?: number }) {
  const def = useDef(formId, name);
  const text = label ?? def.label;
  return (
    <Form.Item
      name={name}
      label={text}
      className={cls(span, fc, name)}
      rules={def.required ? [requiredRule(text), ...(rules ?? [])] : (rules ?? [])}
      extra={help}
    >
      {textarea ? <Input.TextArea rows={rows ?? 3} placeholder={placeholder} disabled={disabled} /> : <Input placeholder={placeholder} disabled={disabled} allowClear />}
    </Form.Item>
  );
}

export function SelectField({ formId, name, fc, span, rules, placeholder, label, options, help, disabled, mode }: BaseFieldProps & { options?: string[]; mode?: 'multiple' | 'tags' }) {
  const def = useDef(formId, name);
  const opts = options ?? def.options ?? [];
  const text = label ?? def.label;
  return (
    <Form.Item
      name={name}
      label={text}
      className={cls(span, fc, name)}
      rules={def.required ? [selectRule(text), ...(rules ?? [])] : (rules ?? [])}
      extra={help}
    >
      <Select
        showSearch
        allowClear
        mode={mode}
        placeholder={placeholder ?? (mode ? `Select one or more ${text.toLowerCase()}` : `Select ${text.toLowerCase()}`)}
        options={opts.map((o) => ({ value: o, label: o }))}
        disabled={disabled}
        optionFilterProp="label"
        notFoundContent={<span className="muted" style={{ fontSize: 13 }}>No match — check the spelling</span>}
      />
    </Form.Item>
  );
}

export function PatientSelectField({ formId, name = 'patientName', fc, span, disabled }: Omit<BaseFieldProps, 'name'> & { name?: string }) {
  const def = useDef(formId, name);
  const patients = useAppSelector(patientSelectors.selectAll);
  return (
    <Form.Item
      name={name}
      label={def.label}
      className={cls(span, fc, name)}
      rules={def.required ? [{ required: true, message: 'Select the patient this is for' }] : []}
      extra={disabled ? 'Locked to the patient whose chart you are in.' : undefined}
    >
      <Select
        showSearch
        allowClear
        placeholder="Search by name or MRN"
        disabled={disabled}
        optionFilterProp="label"
        options={patients.map((p) => ({ value: p.fullName, label: `${p.fullName} · ${p.mrn}` }))}
        notFoundContent={<span className="muted" style={{ fontSize: 13 }}>No patient matches — try the MRN</span>}
      />
    </Form.Item>
  );
}

export function ProviderSelectField({ formId, name = 'providerName', fc, span, label }: Omit<BaseFieldProps, 'name'> & { name?: string }) {
  const def = useDef(formId, name);
  const providers = useAppSelector(providerSelectors.selectAll);
  return (
    <Form.Item
      name={name}
      label={label ?? def.label}
      className={cls(span, fc, name)}
      rules={def.required ? [{ required: true, message: 'Select a provider' }] : []}
    >
      <Select
        showSearch
        allowClear
        placeholder="Search by name or specialty"
        optionFilterProp="label"
        options={providers.filter((p) => p.status !== 'Inactive').map((p) => ({ value: p.fullName, label: `${p.fullName} · ${p.specialty}` }))}
        notFoundContent={<span className="muted" style={{ fontSize: 13 }}>No provider matches</span>}
      />
    </Form.Item>
  );
}

export function DateField({ formId, name, fc, span, rules, label, disabled, help }: BaseFieldProps) {
  const def = useDef(formId, name);
  const text = label ?? def.label;
  return (
    <Form.Item
      name={name}
      label={text}
      className={cls(span, fc, name)}
      rules={def.required ? [{ required: true, message: `Pick ${text.toLowerCase()}` }, ...(rules ?? [])] : (rules ?? [])}
      extra={help}
    >
      <DatePicker style={{ width: '100%' }} format="MMM D, YYYY" disabled={disabled} placeholder="Select date" inputReadOnly={false} />
    </Form.Item>
  );
}

export function TimeField({ formId, name, fc, span, label, help }: BaseFieldProps) {
  const def = useDef(formId, name);
  const text = label ?? def.label;
  return (
    <Form.Item
      name={name}
      label={text}
      className={cls(span, fc, name)}
      rules={def.required ? [{ required: true, message: `Pick ${text.toLowerCase()}` }] : []}
      extra={help}
    >
      <TimePicker style={{ width: '100%' }} format="h:mm A" minuteStep={5} use12Hours placeholder="Select time" />
    </Form.Item>
  );
}

export function NumberField({ formId, name, fc, span, label, min, max, suffix, help }: BaseFieldProps & { min?: number; max?: number; suffix?: string }) {
  const def = useDef(formId, name);
  const text = label ?? def.label;
  return (
    <Form.Item
      name={name}
      label={text}
      className={cls(span, fc, name)}
      rules={def.required ? [{ required: true, message: `Enter ${text.toLowerCase()}` }] : []}
      extra={help ?? (min !== undefined && max !== undefined ? `Between ${min} and ${max}` : undefined)}
    >
      <InputNumber style={{ width: '100%' }} min={min} max={max} addonAfter={suffix} placeholder="—" />
    </Form.Item>
  );
}

export function SwitchField({ formId, name, fc, span, label, help }: BaseFieldProps) {
  const def = useDef(formId, name);
  return (
    <Form.Item name={name} label={label ?? def.label} valuePropName="checked" className={cls(span, fc, name)} extra={help}>
      <Switch />
    </Form.Item>
  );
}

export function CheckboxField({ formId, name, fc, span, label, help }: BaseFieldProps) {
  const def = useDef(formId, name);
  return (
    <Form.Item name={name} valuePropName="checked" className={cls(span, fc, name)} style={{ alignSelf: 'end' }} extra={help}>
      <Checkbox>{label ?? def.label}</Checkbox>
    </Form.Item>
  );
}
