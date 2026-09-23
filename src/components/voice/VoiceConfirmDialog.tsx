import { Button } from 'antd';
import { Trash2, TriangleAlert } from 'lucide-react';
import { useAppSelector } from '@/store';
import { getVoiceController } from '@/services/ai/voiceController';
import { AppModal } from '@/components/common/AppModal';

/**
 * Destructive voice actions never happen silently.
 *
 * When the assistant is asked to delete something it stages the deletion and
 * this dialog shows exactly which record is about to go. It is dismissed by
 * saying "cancel", pressing Cancel, or confirming — by voice or by button.
 */
export function VoiceConfirmDialog() {
  const pending = useAppSelector((s) => s.voice.pendingConfirmation);
  const open = pending?.kind === 'delete';

  if (!open || !pending) return null;
  const controller = getVoiceController();
  const label = pending.summary[0]?.value ?? 'this record';

  return (
    <AppModal
      open
      danger
      size="sm"
      icon={<TriangleAlert size={18} />}
      title={pending.formTitle}
      description="Asked for by voice — confirm before anything is removed."
      onClose={() => void controller.handleTranscript('cancel')}
      footer={
        <>
          <Button onClick={() => void controller.handleTranscript('cancel')}>Cancel</Button>
          <Button type="primary" danger icon={<Trash2 size={15} />} onClick={() => void controller.handleTranscript('yes')}>
            Delete
          </Button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        <strong>{label}</strong> will be permanently deleted. This cannot be undone.
      </p>
      <div className="confirm-summary">
        {pending.summary.slice(0, 6).map((s) => (
          <div key={s.label}>
            <span className="muted">{s.label}</span>
            <span>{s.value}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
        Say <strong>“yes, delete it”</strong> to confirm or <strong>“cancel”</strong> to keep it.
      </p>
    </AppModal>
  );
}
