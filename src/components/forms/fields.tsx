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
  help?: string;
  disabled?: boolean;
}

function useDef(formId: string, name: string) {
  const def = FieldRegistry.resolveField(formId, name);
  return { label: def?.label ?? name, required: def?.required ?? false, options: def?.options };
}

const spanClass = (span?: number) => (span && span > 1 ? `span-${span}` : undefined);

export function TextField({ formId, name, fc, span, rules, placeholder, label, help, disabled, textarea, rows }: BaseFieldProps & { textarea?: boolean; rows?: number }) {
  const def = useDef(formId, name);
  return (
    <Form.Item name={name} label={label ?? def.label} className={[spanClass(span), fc(name)].filter(Boolean).join(' ')} rules={[{ required: def.required, message: `${def.label} is required` }, ...(rules ?? [])]} help={help}>
      {textarea ? <Input.TextArea rows={rows ?? 3} placeholder={placeholder} disabled={disabled} /> : <Input placeholder={placeholder} disabled={disabled} />}
    </Form.Item>
  );
}

export function SelectField({ formId, name, fc, span, rules, placeholder, label, options, help, disabled, mode }: BaseFieldProps & { options?: string[]; mode?: 'multiple' | 'tags' }) {
  const def = useDef(formId, name);
  const opts = options ?? def.options ?? [];
  return (
    <Form.Item name={name} label={label ?? def.label} className={[spanClass(span), fc(name)].filter(Boolean).join(' ')} rules={[{ required: def.required, message: `${def.label} is required` }, ...(rules ?? [])]} help={help}>
      <Select showSearch allowClear mode={mode} placeholder={placeholder ?? `Select ${(label ?? def.label).toLowerCase()}`} options={opts.map((o) => ({ value: o, label: o }))} disabled={disabled} optionFilterProp="label" />
    </Form.Item>
  );
}

export function PatientSelectField({ formId, name = 'patientName', fc, span, disabled }: Omit<BaseFieldProps, 'name'> & { name?: string }) {
  const def = useDef(formId, name);
  const patients = useAppSelector(patientSelectors.selectAll);
  return (
    <Form.Item name={name} label={def.label} className={[spanClass(span), fc(name)].filter(Boolean).join(' ')} rules={[{ required: def.required, message: 'Patient is required' }]}>
      <Select showSearch allowClear placeholder="Search patient by name or MRN" disabled={disabled} optionFilterProp="label" options={patients.map((p) => ({ value: p.fullName, label: `${p.fullName} · ${p.mrn}` }))} />
    </Form.Item>
  );
}

export function ProviderSelectField({ formId, name = 'providerName', fc, span, label }: Omit<BaseFieldProps, 'name'> & { name?: string }) {
  const def = useDef(formId, name);
  const providers = useAppSelector(providerSelectors.selectAll);
  return (
    <Form.Item name={name} label={label ?? def.label} className={[spanClass(span), fc(name)].filter(Boolean).join(' ')} rules={[{ required: def.required, message: 'Provider is required' }]}>
      <Select showSearch allowClear placeholder="Select provider" optionFilterProp="label" options={providers.filter((p) => p.status !== 'Inactive').map((p) => ({ value: p.fullName, label: `${p.fullName} · ${p.specialty}` }))} />
    </Form.Item>
  );
}

export function DateField({ formId, name, fc, span, rules, label, disabled }: BaseFieldProps) {
  const def = useDef(formId, name);
  return (
    <Form.Item name={name} label={label ?? def.label} className={[spanClass(span), fc(name)].filter(Boolean).join(' ')} rules={[{ required: def.required, message: `${def.label} is required` }, ...(rules ?? [])]}>
      <DatePicker style={{ width: '100%' }} format="MMM D, YYYY" disabled={disabled} />
    </Form.Item>
  );
}

export function TimeField({ formId, name, fc, span, label }: BaseFieldProps) {
  const def = useDef(formId, name);
  return (
    <Form.Item name={name} label={label ?? def.label} className={[spanClass(span), fc(name)].filter(Boolean).join(' ')} rules={[{ required: def.required, message: `${def.label} is required` }]}>
      <TimePicker style={{ width: '100%' }} format="h:mm A" minuteStep={5} use12Hours />
    </Form.Item>
  );
}

export function NumberField({ formId, name, fc, span, label, min, max, suffix }: BaseFieldProps & { min?: number; max?: number; suffix?: string }) {
  const def = useDef(formId, name);
  return (
    <Form.Item name={name} label={label ?? def.label} className={[spanClass(span), fc(name)].filter(Boolean).join(' ')} rules={[{ required: def.required, message: `${def.label} is required` }]}>
      <InputNumber style={{ width: '100%' }} min={min} max={max} addonAfter={suffix} />
    </Form.Item>
  );
}

export function SwitchField({ formId, name, fc, span, label }: BaseFieldProps) {
  const def = useDef(formId, name);
  return (
    <Form.Item name={name} label={label ?? def.label} valuePropName="checked" className={[spanClass(span), fc(name)].filter(Boolean).join(' ')}>
      <Switch />
    </Form.Item>
  );
}

export function CheckboxField({ formId, name, fc, span, label }: BaseFieldProps) {
  const def = useDef(formId, name);
  return (
    <Form.Item name={name} valuePropName="checked" className={[spanClass(span), fc(name)].filter(Boolean).join(' ')} style={{ alignSelf: 'end' }}>
      <Checkbox>{label ?? def.label}</Checkbox>
    </Form.Item>
  );
}
