import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface NavigationEntry {
  pageId: string | null;
  path: string;
  title: string;
  timestamp: number;
}

interface NavigationState {
  currentPageId: string | null;
  currentPath: string;
  currentTitle: string;
  /** Currently active tab per page id (voice "open allergies" etc.) */
  activeTabs: Record<string, string>;
  /** Registered form ids currently mounted, most recent last */
  mountedForms: string[];
  openFormId: string | null;
  history: NavigationEntry[];
  recentPages: NavigationEntry[];
}

const initialState: NavigationState = {
  currentPageId: null,
  currentPath: '/',
  currentTitle: '',
  activeTabs: {},
  mountedForms: [],
  openFormId: null,
  history: [],
  recentPages: [],
};

const navigationSlice = createSlice({
  name: 'navigation',
  initialState,
  reducers: {
    setCurrentPage(state, action: PayloadAction<{ pageId: string | null; path: string; title: string }>) {
      const { pageId, path, title } = action.payload;
      state.currentPageId = pageId;
      state.currentPath = path;
      state.currentTitle = title;
      const entry: NavigationEntry = { pageId, path, title, timestamp: Date.now() };
      state.history = [entry, ...state.history].slice(0, 50);
      if (pageId) {
        state.recentPages = [entry, ...state.recentPages.filter((e) => e.pageId !== pageId)].slice(0, 8);
      }
    },
    setActiveTab(state, action: PayloadAction<{ pageId: string; tab: string }>) {
      state.activeTabs[action.payload.pageId] = action.payload.tab;
    },
    formMounted(state, action: PayloadAction<string>) {
      if (!state.mountedForms.includes(action.payload)) state.mountedForms.push(action.payload);
    },
    formUnmounted(state, action: PayloadAction<string>) {
      state.mountedForms = state.mountedForms.filter((id) => id !== action.payload);
      if (state.openFormId === action.payload) state.openFormId = null;
    },
    setOpenForm(state, action: PayloadAction<string | null>) {
      state.openFormId = action.payload;
    },
  },
});

export const navigationActions = navigationSlice.actions;
export default navigationSlice.reducer;
