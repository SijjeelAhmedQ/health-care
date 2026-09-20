import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from 'antd';
import * as icons from 'lucide-react';
import { CommandRegistry, type AppCommand } from '@/registry/commandRegistry';
import { useAppDispatch, useAppSelector } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { logout } from '@/store/slices/authSlice';
import { getVoiceController } from '@/services/ai/voiceController';

type IconName = keyof typeof icons;
function Icon({ name }: { name?: string }) {
  const Cmp = (name && (icons[name as IconName] as icons.LucideIcon)) || icons.ChevronRight;
  return <Cmp size={16} className="muted" />;
}

export function CommandPalette() {
  const open = useAppSelector((s) => s.ui.commandPaletteOpen);
  const dispatch = useAppDispatch();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => CommandRegistry.search(query), [query]);
  const grouped = useMemo(() => {
    const map = new Map<string, AppCommand[]>();
    results.forEach((c) => map.set(c.group, [...(map.get(c.group) ?? []), c]));
    return [...map.entries()];
  }, [results]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('.command-palette-item.active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const close = () => dispatch(uiActions.setCommandPaletteOpen(false));

  const run = (cmd: AppCommand) => {
    close();
    const controller = getVoiceController();
    void cmd.run({
      execute: (command) => controller.executeCommand(command),
      toggleDebugPanel: () => dispatch(uiActions.setDebugPanelOpen(true)),
      toggleSidebar: () => dispatch(uiActions.toggleSidebar()),
      openVoicePanel: () => {
        dispatch(voiceActions.setPanelOpen(true));
        controller.startListening();
      },
      signOut: () => dispatch(logout()),
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) run(results[active]);
    } else if (e.key === 'Escape') {
      close();
    }
  };

  // Natural-language fallback: if nothing matches, send to the voice interpreter.
  const nlFallback = query.trim() && results.length === 0;

  return (
    <Modal open={open} onCancel={close} footer={null} closable={false} className="command-palette" width={620} destroyOnHidden centered={false} style={{ top: 80 }}>
      <div className="command-palette-input">
        <icons.Search size={18} className="muted" />
        <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} placeholder="Type a command or page name…" aria-label="Command palette" />
        <kbd>esc</kbd>
      </div>
      <div className="command-palette-list" ref={listRef} role="listbox">
        {nlFallback ? (
          <div
            className="command-palette-item active"
            onClick={() => {
              close();
              void getVoiceController().handleTranscript(query);
            }}
          >
            <icons.Sparkles size={16} className="muted" />
            <div>
              <div className="command-palette-item-title">Ask the assistant: “{query}”</div>
              <div className="command-palette-item-sub">Interpret as a natural-language voice command</div>
            </div>
          </div>
        ) : (
          grouped.map(([group, cmds]) => (
            <div key={group}>
              <div className="command-palette-group">{group}</div>
              {cmds.map((cmd) => {
                const idx = results.indexOf(cmd);
                return (
                  <div key={cmd.id} role="option" aria-selected={idx === active} className={`command-palette-item ${idx === active ? 'active' : ''}`} onMouseEnter={() => setActive(idx)} onClick={() => run(cmd)}>
                    <Icon name={cmd.icon} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="command-palette-item-title">{cmd.title}</div>
                      {cmd.pageId && <div className="command-palette-item-sub">{cmd.keywords.find((k) => k.startsWith('page '))}</div>}
                    </div>
                    {cmd.shortcut && <kbd>{cmd.shortcut}</kbd>}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
      <div className="command-palette-footer">
        <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> run</span>
        <span><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd> voice</span>
        <span style={{ marginLeft: 'auto' }}>Voice and palette share the same command registry</span>
      </div>
    </Modal>
  );
}
