import { useEffect, useRef, type KeyboardEvent } from 'react';
import { inboxViews, type InboxView } from '@/services/inbox/inboxModel';
import { CategoryIcon, viewLabel, viewShortLabel } from './inboxUi';

export interface ViewCounts {
  total: number;
  unfiled: number;
  attention: number;
}

interface Props {
  active: InboxView;
  counts: Record<InboxView, ViewCounts>;
  onSelect: (view: InboxView) => void;
}

/**
 * The five queues as a switcher. Each one says how much is still to be filed,
 * and a marked count shows where something needs attention — so the clinician
 * knows where to go before opening anything.
 */
export function InboxCategoryNav({ active, counts, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // On narrow screens the strip scrolls sideways: keep the open queue in view.
  useEffect(() => {
    const reveal = () => {
      const track = ref.current;
      const tab = track?.querySelector<HTMLElement>('.ibx-cat.is-active');
      if (!track || !tab || track.scrollWidth <= track.clientWidth) return;
      track.scrollLeft = tab.offsetLeft - (track.clientWidth - tab.offsetWidth) / 2;
    };
    reveal();
    // Tab widths change once the web font has loaded.
    let live = true;
    void document.fonts?.ready.then(() => live && reveal());
    return () => {
      live = false;
    };
  }, [active, counts]);

  // Left / right move between queues, like any tab strip.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('.ibx-cat') ?? []);
    const index = buttons.findIndex((b) => b === document.activeElement);
    const next = buttons[(index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <nav className="ibx-cats" aria-label="Inbox categories">
      <div className="ibx-cats-track" ref={ref} onKeyDown={onKeyDown}>
        {inboxViews.map((view) => {
          const c = counts[view];
          const isActive = view === active;
          const description = `${c.unfiled} unfiled of ${c.total}${c.attention ? `, ${c.attention} need attention` : ''}`;
          return (
            <button
              key={view}
              type="button"
              className={`ibx-cat is-${view} ${isActive ? 'is-active' : ''} ${c.unfiled === 0 ? 'is-clear' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`${viewLabel[view]}: ${description}`}
              title={description}
              onClick={() => onSelect(view)}
            >
              <span className="ibx-cat-icon">
                <CategoryIcon view={view} size={15} />
              </span>
              <span className="ibx-cat-label">
                <span className="ibx-cat-long">{viewLabel[view]}</span>
                <span className="ibx-cat-short">{viewShortLabel[view]}</span>
              </span>
              <span className="ibx-cat-count">{c.unfiled}</span>
              {c.attention > 0 && (
                <span className="ibx-cat-alert" aria-hidden>
                  {c.attention}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
