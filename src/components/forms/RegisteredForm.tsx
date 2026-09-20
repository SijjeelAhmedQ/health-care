import { useState, type ReactNode } from 'react';
import { Alert, Button, Card, Drawer, Form, Space, message, type FormInstance } from 'antd';
import { Save, X } from 'lucide-react';
import { useRegisteredForm } from '@/hooks';
import { useAppSelector } from '@/store';
import { FieldRegistry } from '@/registry/fieldRegistry';

export interface FormHelpers<T> {
  form: FormInstance<T>;
  /** className for a Form.Item that was just filled by voice */
  fc: (name: string) => string | undefined;
}

interface BaseProps<T extends object> {
  formId: string;
  title: string;
  onSubmit: (values: T) => Promise<void> | void;
  initialValues?: Partial<T>;
  children: (helpers: FormHelpers<T>) => ReactNode;
  submitLabel?: string;
  instanceKey?: string;
  extraActions?: ReactNode;
}

interface DrawerProps<T extends object> extends BaseProps<T> {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  width?: number;
  description?: string;
}

function VoiceBanner({ formId }: { formId: string }) {
  const pending = useAppSelector((s) => s.voice.pendingConfirmation);
  const slot = useAppSelector((s) => s.voice.pendingSlot);
  if (pending?.formId === formId) {
    return <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Filled by voice — review before saving" description={`Say “save it” or click ${FieldRegistry.getForm(formId)?.submitLabel ?? 'Save'} to confirm. Nothing has been saved yet.`} />;
  }
  if (slot?.formId === formId) {
    return <Alert type="info" showIcon style={{ marginBottom: 16 }} message={slot.question} description={`The assistant is waiting for the ${slot.label.toLowerCase()}.`} />;
  }
  return null;
}

/** A drawer-hosted form that is registered for voice control. */
export function RegisteredFormDrawer<T extends object>({ formId, title, description, open, onOpen, onClose, onSubmit, initialValues, children, submitLabel, width = 620, instanceKey, extraActions }: DrawerProps<T>) {
  const [form] = Form.useForm<T>();
  const [saving, setSaving] = useState(false);
  const def = FieldRegistry.getForm(formId);

  const submit = async (values: T) => {
    setSaving(true);
    try {
      await onSubmit(values);
      message.success(`${title} saved`);
      form.resetFields();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const { fieldClass } = useRegisteredForm<T>({ formId, form, isOpen: open, open: onOpen, close: () => { form.resetFields(); onClose(); }, onSubmit: submit, instanceKey });

  return (
    <Drawer
      title={title}
      open={open}
      onClose={() => { form.resetFields(); onClose(); }}
      width={width}
      footer={
        <div className="flex gap-2" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {extraActions}
          <Button icon={<X size={14} />} onClick={() => { form.resetFields(); onClose(); }}>Cancel</Button>
          <Button type="primary" icon={<Save size={14} />} loading={saving} onClick={() => form.submit()}>
            {submitLabel ?? def?.submitLabel ?? 'Save'}
          </Button>
        </div>
      }
    >
      {description && <p className="text-secondary" style={{ marginTop: 0 }}>{description}</p>}
      <VoiceBanner formId={formId} />
      <Form<T> form={form} layout="vertical" initialValues={initialValues as never} onFinish={(v) => void submit(v)} requiredMark="optional" scrollToFirstError>
        {children({ form, fc: fieldClass })}
      </Form>
    </Drawer>
  );
}

interface CardProps<T extends object> extends BaseProps<T> {
  onCancel?: () => void;
  loading?: boolean;
  successMessage?: string;
}

/** A page-level form (e.g. Patient Registration) registered for voice control. */
export function RegisteredFormCard<T extends object>({ formId, title, onSubmit, onCancel, initialValues, children, submitLabel, instanceKey, extraActions, loading, successMessage }: CardProps<T>) {
  const [form] = Form.useForm<T>();
  const [saving, setSaving] = useState(false);
  const def = FieldRegistry.getForm(formId);

  const submit = async (values: T) => {
    setSaving(true);
    try {
      await onSubmit(values);
      message.success(successMessage ?? `${title} saved`);
    } finally {
      setSaving(false);
    }
  };

  const { fieldClass } = useRegisteredForm<T>({ formId, form, isOpen: true, open: () => undefined, close: () => form.resetFields(), onSubmit: submit, instanceKey });

  return (
    <Card loading={loading}>
      <VoiceBanner formId={formId} />
      <Form<T> form={form} layout="vertical" initialValues={initialValues as never} onFinish={(v) => void submit(v)} requiredMark="optional" scrollToFirstError>
        {children({ form, fc: fieldClass })}
        <div className="sticky-actions">
          {extraActions}
          <Space>
            <Button onClick={() => { form.resetFields(); onCancel?.(); }}>Reset</Button>
            <Button type="primary" htmlType="submit" icon={<Save size={14} />} loading={saving}>
              {submitLabel ?? def?.submitLabel ?? 'Save'}
            </Button>
          </Space>
        </div>
      </Form>
    </Card>
  );
}
