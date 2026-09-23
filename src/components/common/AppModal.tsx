import { useState, type ReactNode } from 'react';
import { Button, Form, Modal, type FormInstance, type ModalProps } from 'antd';
import { AlertTriangle, Save, X } from 'lucide-react';

/** Widths that keep dialogs readable: sm for a few fields, lg for two-column forms. */
export const modalWidths = { sm: 480, md: 600, lg: 720, xl: 860 } as const;
export type ModalSize = keyof typeof modalWidths;

interface AppModalProps extends Omit<ModalProps, 'title' | 'footer' | 'width' | 'onCancel'> {
  title: ReactNode;
  /** One line under the title explaining what the dialog does. */
  description?: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  size?: ModalSize;
  width?: number;
  onClose: () => void;
  footer?: ReactNode | null;
  /** Small text on the left of the footer (e.g. "* required"). */
  footerHint?: ReactNode;
  compact?: boolean;
}

/**
 * The one dialog shell used everywhere: consistent header (icon + title + description), scrollable body,
 * sticky footer, full-screen on phones, Esc / mask close.
 */
export function AppModal({ title, description, icon, danger, size = 'md', width, onClose, footer, footerHint, compact, className, children, ...rest }: AppModalProps) {
  return (
    <Modal
      {...rest}
      width={width ?? modalWidths[size]}
      onCancel={onClose}
      className={['app-modal', compact ? 'compact' : '', className ?? ''].filter(Boolean).join(' ')}
      closeIcon={<X size={18} aria-hidden />}
      centered
      title={
        <>
          {icon && <span className={`app-modal-title-icon ${danger ? 'danger' : ''}`}>{icon}</span>}
          <span>
            <div className="app-modal-title-text">{title}</div>
            {description && <div className="app-modal-description">{description}</div>}
          </span>
        </>
      }
      footer={
        footer === null ? null : footer !== undefined ? (
          <>
            {footerHint && <span className="app-modal-footer-hint">{footerHint}</span>}
            {footer}
          </>
        ) : (
          <>
            {footerHint && <span className="app-modal-footer-hint">{footerHint}</span>}
            <Button onClick={onClose}>Close</Button>
          </>
        )
      }
    >
      {children}
    </Modal>
  );
}

interface FormModalProps<T> {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  size?: ModalSize;
  width?: number;
  onClose: () => void;
  /** Called with validated values; may be async. The dialog closes and resets once it resolves. */
  onSubmit: (values: T) => Promise<void> | void;
  form?: FormInstance<T>;
  initialValues?: Partial<T>;
  submitLabel?: string;
  submitIcon?: ReactNode;
  danger?: boolean;
  children: ReactNode;
  /** Keep the dialog open after a successful submit (e.g. "save and add another"). */
  keepOpen?: boolean;
  extraActions?: ReactNode;
  requiredHint?: boolean;
}

/**
 * A modal that hosts a plain antd Form: validation on save, saving state on the primary button,
 * "unsaved changes" guard on close, reset after success.
 */
export function FormModal<T extends object>({ open, title, description, icon, size = 'md', width, onClose, onSubmit, form: externalForm, initialValues, submitLabel = 'Save', submitIcon, danger, children, keepOpen, extraActions, requiredHint = true }: FormModalProps<T>) {
  const [form] = Form.useForm<T>(externalForm);
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (form.isFieldsTouched()) {
      Modal.confirm({
        title: 'Discard unsaved changes?',
        icon: <AlertTriangle size={20} color="#d98800" style={{ marginRight: 12, flexShrink: 0 }} />,
        content: 'The information you entered has not been saved.',
        okText: 'Discard',
        okButtonProps: { danger: true },
        cancelText: 'Keep editing',
        centered: true,
        onOk: () => { form.resetFields(); onClose(); },
      });
      return;
    }
    form.resetFields();
    onClose();
  };

  const finish = async (values: T) => {
    setSaving(true);
    try {
      await onSubmit(values);
      form.resetFields();
      if (!keepOpen) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open={open}
      title={title}
      description={description}
      icon={icon}
      danger={danger}
      size={size}
      width={width}
      onClose={close}
      destroyOnHidden={false}
      maskClosable={false}
      footerHint={requiredHint ? <span className="form-required-hint"><span className="mark">*</span> Required field</span> : undefined}
      footer={
        <>
          {extraActions}
          <Button onClick={close} disabled={saving}>Cancel</Button>
          <Button type="primary" danger={danger} icon={submitIcon ?? <Save size={14} />} loading={saving} onClick={() => form.submit()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <Form<T> form={form} layout="vertical" initialValues={initialValues as never} onFinish={(v) => void finish(v)} requiredMark scrollToFirstError>
        {children}
      </Form>
    </AppModal>
  );
}

/** Confirmation dialog for destructive or important actions with a clearly labelled primary action. */
export function confirmAction({ title, content, okText = 'Confirm', danger, onOk }: { title: ReactNode; content?: ReactNode; okText?: string; danger?: boolean; onOk: () => unknown }) {
  Modal.confirm({
    title,
    content,
    okText,
    cancelText: 'Cancel',
    okButtonProps: { danger },
    centered: true,
    icon: <AlertTriangle size={20} color={danger ? '#d64545' : '#d98800'} style={{ marginRight: 12, flexShrink: 0 }} />,
    onOk: () => { void onOk(); },
  });
}
