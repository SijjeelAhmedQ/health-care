import { Button } from 'antd';
import { Bot } from 'lucide-react';
import { AppModal } from '@/components/common/AppModal';
import { getVoiceController } from '@/services/ai/voiceController';

/** "open_page" -> "Open page". */
const humanise = (name: string) => name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** The first sentence of a tool description is what it does. */
const firstSentence = (text: string) => text.split('\n')[0].split(/(?<=\.)\s/)[0];

/**
 * "What can the assistant do?" — the list of tools the model can call, read
 * from the tool registry itself, so it always matches what the assistant can
 * actually do. There are no fixed phrases to learn: say it in your own words.
 */
export function AssistantHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const tools = getVoiceController().tools.filter((t) => !['record_note_findings', 'wait_for_more_speech'].includes(t.name));
  return (
    <AppModal
      open
      onClose={onClose}
      title="What the assistant can do"
      description="Ask in your own words, in English. The assistant decides which of these to use, and several at once when you ask for several things."
      icon={<Bot size={18} />}
      size="lg"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <ul className="assistant-help">
        {tools.map((t) => (
          <li key={t.name}>
            <strong>{humanise(t.name)}</strong>
            <span className="muted">{firstSentence(t.description)}</span>
          </li>
        ))}
      </ul>
      <p className="muted" style={{ marginBottom: 0, fontSize: 12.5 }}>
        Saving and deleting always wait for your confirmation. Turn the microphone on with the assistant button or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>.
      </p>
    </AppModal>
  );
}
