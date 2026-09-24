import type { ReactNode } from 'react';
import { Button } from 'antd';
import { FileSearch, FolderCheck, Inbox, Mic, MousePointerClick, UserRound, Volume2 } from 'lucide-react';
import { AppModal } from '@/components/common/AppModal';
import { inboxVoiceCommandGroups, type VoiceCommandGroup } from '@/components/inbox/inboxVoiceCommands';

const groupIcon: Record<VoiceCommandGroup['id'], ReactNode> = {
  patient: <UserRound size={15} aria-hidden />,
  inbox: <Inbox size={15} aria-hidden />,
  search: <FileSearch size={15} aria-hidden />,
  records: <MousePointerClick size={15} aria-hidden />,
  filing: <FolderCheck size={15} aria-hidden />,
  voice: <Volume2 size={15} aria-hidden />,
};

/**
 * "What can I say?" in the Inbox — the Voice Assistant's Inbox commands, by
 * task. Clicking a phrase sends it to the assistant, exactly as if spoken.
 */
export function InboxVoiceHelp({ open, onClose, onTry }: { open: boolean; onClose: () => void; onTry: (phrase: string) => void }) {
  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Inbox voice commands"
      description="Say any of these to the Voice Assistant while the microphone is on — or click one to run it. Close enough is fine: “open the first one” works as well as “open first record”."
      icon={<Mic size={18} />}
      size="lg"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="ibx-vhelp">
        {inboxVoiceCommandGroups.map((group) => (
          <section key={group.id} className={`ibx-vhelp-group is-${group.id}`} aria-labelledby={`ibx-vhelp-${group.id}`}>
            <h3 id={`ibx-vhelp-${group.id}`}>
              <span className="ibx-vhelp-icon">{groupIcon[group.id]}</span>
              {group.title}
            </h3>
            <p>{group.hint}</p>
            <ul>
              {group.commands.map((c) => (
                <li key={c.say}>
                  <button
                    type="button"
                    className="ibx-vhelp-say"
                    onClick={() => {
                      onClose();
                      onTry(c.say);
                    }}
                    title="Run this command"
                  >
                    “{c.say}”
                  </button>
                  <span className="ibx-vhelp-does">{c.does}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="ibx-vhelp-note">
        Turn the microphone back on with the Voice Assistant button or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> — a switched-off microphone cannot hear “start listening”.
      </p>
    </AppModal>
  );
}
