import { useState } from 'react';
import { Button, Input, Tooltip } from 'antd';
import { MessageSquare, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '@/store';
import { inboxActions, type InboxComment } from '@/store/slices/inboxSlice';
import { useCurrentProvider } from '@/hooks/useProviderData';

const NONE: InboxComment[] = [];

/**
 * The provider's comments on an Inbox record — "Test is good", "Repeat in 3 months" — oldest first,
 * with a box to add one. The assistant adds comments through the same store action.
 */
export function InboxComments({ itemId }: { itemId: string }) {
  const dispatch = useAppDispatch();
  const comments = useAppSelector((s) => s.inbox.comments[itemId] ?? NONE);
  const provider = useCurrentProvider();
  const [draft, setDraft] = useState('');
  const author = provider?.fullName ?? 'You';

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    dispatch(inboxActions.addComments({ itemIds: [itemId], text, author }));
    setDraft('');
  };

  return (
    <section className="ibx-section ibx-comments" aria-labelledby="ibx-sec-comments">
      <h3 id="ibx-sec-comments" className="ibx-section-title">
        Comments{comments.length ? ` · ${comments.length}` : ''}
      </h3>
      {comments.length > 0 && (
        <ul className="ibx-comment-list">
          {comments.map((c) => (
            <li key={c.id} className="ibx-comment">
              <span className="ibx-comment-icon" aria-hidden>
                <MessageSquare size={13} />
              </span>
              <div className="ibx-comment-body">
                <p>{c.text}</p>
                <span className="muted">
                  {c.author} · {dayjs(c.at).format('D MMM YYYY, h:mm A')}
                </span>
              </div>
              {c.author === author && (
                <Tooltip title="Delete comment">
                  <Button type="text" size="small" aria-label="Delete comment" icon={<Trash2 size={13} />} onClick={() => dispatch(inboxActions.removeComment({ itemId, commentId: c.id }))} />
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="ibx-comment-add">
        <Input.TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a comment for this record…"
          autoSize={{ minRows: 1, maxRows: 4 }}
          aria-label="Comment"
        />
        <Button type="primary" size="small" onClick={add} disabled={!draft.trim()}>
          Add comment
        </Button>
      </div>
    </section>
  );
}
