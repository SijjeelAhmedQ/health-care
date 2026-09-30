import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { documentService, imagingOrderService, labOrderService, noteService, referralService } from '@/services/api';
import { buildInboxItems, type InboxItem } from '@/services/inbox/inboxModel';

/**
 * The Inbox is a read-only view over existing clinical records, so this slice
 * only loads them and remembers which items the user has ticked off.
 *
 * "Reviewed" is a presentation state that belongs to this screen — it is kept
 * here and in localStorage, and deliberately does not touch the underlying lab,
 * imaging, referral, note or document records.
 */
const REVIEWED_KEY = 'careflow.inbox.reviewed';

const readReviewed = (): string[] => {
  try {
    const raw = localStorage.getItem(REVIEWED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

const writeReviewed = (ids: string[]) => {
  try {
    localStorage.setItem(REVIEWED_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable — the tick marks just won't survive a reload */
  }
};

/** A provider's note on an Inbox record ("Test is good"). Kept beside the record, like "reviewed". */
export interface InboxComment {
  id: string;
  text: string;
  author: string;
  /** ISO timestamp. */
  at: string;
}

const COMMENTS_KEY = 'careflow.inbox.comments';

const readComments = (): Record<string, InboxComment[]> => {
  try {
    const raw = localStorage.getItem(COMMENTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, InboxComment[]>) : {};
  } catch {
    return {};
  }
};

const writeComments = (comments: Record<string, InboxComment[]>) => {
  try {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
  } catch {
    /* storage unavailable — comments last for this session only */
  }
};

interface InboxState {
  items: InboxItem[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  reviewedIds: string[];
  /** Comments by Inbox item id, oldest first. */
  comments: Record<string, InboxComment[]>;
}

const initialState: InboxState = {
  items: [],
  status: 'idle',
  error: null,
  reviewedIds: readReviewed(),
  comments: readComments(),
};

let commentCounter = 0;

export const fetchInbox = createAsyncThunk('inbox/fetchAll', async () => {
  const [labs, imaging, referrals, notes, documents] = await Promise.all([
    labOrderService.all(),
    imagingOrderService.all(),
    referralService.all(),
    noteService.all(),
    documentService.all(),
  ]);
  return buildInboxItems({ labs, imaging, referrals, notes, documents });
});

const inboxSlice = createSlice({
  name: 'inbox',
  initialState,
  reducers: {
    markReviewed(state, action: PayloadAction<string | string[]>) {
      const ids = Array.isArray(action.payload) ? action.payload : [action.payload];
      state.reviewedIds = [...new Set([...state.reviewedIds, ...ids])];
      writeReviewed(state.reviewedIds);
    },
    markUnreviewed(state, action: PayloadAction<string | string[]>) {
      const ids = new Set(Array.isArray(action.payload) ? action.payload : [action.payload]);
      state.reviewedIds = state.reviewedIds.filter((id) => !ids.has(id));
      writeReviewed(state.reviewedIds);
    },
    /** The same comment on one or many records (e.g. every abnormal result). */
    addComments: {
      reducer(state, action: PayloadAction<{ itemIds: string[]; text: string; author: string; at: string; ids: string[] }>) {
        const { itemIds, text, author, at, ids } = action.payload;
        itemIds.forEach((itemId, i) => {
          state.comments[itemId] = [...(state.comments[itemId] ?? []), { id: ids[i], text, author, at }];
        });
        writeComments(state.comments);
      },
      prepare(payload: { itemIds: string[]; text: string; author: string }) {
        const at = new Date().toISOString();
        return { payload: { ...payload, at, ids: payload.itemIds.map(() => `cmt-${Date.now().toString(36)}-${(commentCounter++).toString(36)}`) } };
      },
    },
    removeComment(state, action: PayloadAction<{ itemId: string; commentId: string }>) {
      const { itemId, commentId } = action.payload;
      state.comments[itemId] = (state.comments[itemId] ?? []).filter((c) => c.id !== commentId);
      if (!state.comments[itemId].length) delete state.comments[itemId];
      writeComments(state.comments);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInbox.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchInbox.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchInbox.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to load the inbox';
      });
  },
});

export const inboxActions = inboxSlice.actions;
export default inboxSlice.reducer;
