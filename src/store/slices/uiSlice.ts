import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  commandPaletteOpen: boolean;
  debugPanelOpen: boolean;
  globalSearchQuery: string;
  notificationsOpen: boolean;
  /** The dashboard summary docked to the right of the screen ("show dashboard summary"). */
  dashboardSummaryOpen: boolean;
  /** Generic overlay registry state: id -> open */
  overlays: Record<string, boolean>;
}

const initialState: UiState = {
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  commandPaletteOpen: false,
  debugPanelOpen: false,
  globalSearchQuery: '',
  notificationsOpen: false,
  dashboardSummaryOpen: false,
  overlays: {},
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.sidebarCollapsed = action.payload;
    },
    setMobileSidebarOpen(state, action: PayloadAction<boolean>) {
      state.mobileSidebarOpen = action.payload;
    },
    setCommandPaletteOpen(state, action: PayloadAction<boolean>) {
      state.commandPaletteOpen = action.payload;
    },
    setDebugPanelOpen(state, action: PayloadAction<boolean>) {
      state.debugPanelOpen = action.payload;
    },
    setGlobalSearchQuery(state, action: PayloadAction<string>) {
      state.globalSearchQuery = action.payload;
    },
    setNotificationsOpen(state, action: PayloadAction<boolean>) {
      state.notificationsOpen = action.payload;
    },
    setDashboardSummaryOpen(state, action: PayloadAction<boolean>) {
      state.dashboardSummaryOpen = action.payload;
    },
    setOverlay(state, action: PayloadAction<{ id: string; open: boolean }>) {
      state.overlays[action.payload.id] = action.payload.open;
    },
    closeAllOverlays(state) {
      state.overlays = {};
    },
  },
});

export const uiActions = uiSlice.actions;
export default uiSlice.reducer;
