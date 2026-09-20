import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AICommand, DebugTrace, ExecutionStep, PendingConfirmation } from '@/types/ai';

export type VoiceStatus =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'processing'
  | 'executing'
  | 'confirmation_required'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface VoiceTurn {
  id: string;
  transcript: string;
  response: string;
  status: 'ok' | 'error' | 'cancelled' | 'confirmation';
  timestamp: number;
}

export interface PendingSlot {
  formId: string;
  field: string;
  label: string;
  question: string;
}

interface VoiceState {
  enabled: boolean;
  panelOpen: boolean;
  status: VoiceStatus;
  transcript: string;
  interimTranscript: string;
  commands: AICommand[];
  currentAction: string | null;
  response: string | null;
  requiresConfirmation: boolean;
  pendingConfirmation: PendingConfirmation | null;
  pendingSlot: PendingSlot | null;
  error: string | null;
  history: VoiceTurn[];
  trace: DebugTrace | null;
  traceHistory: DebugTrace[];
  sttProvider: string;
  llmProvider: string;
  micSupported: boolean;
  lastCommandAt: number | null;
}

const initialState: VoiceState = {
  enabled: true,
  panelOpen: false,
  status: 'idle',
  transcript: '',
  interimTranscript: '',
  commands: [],
  currentAction: null,
  response: null,
  requiresConfirmation: false,
  pendingConfirmation: null,
  pendingSlot: null,
  error: null,
  history: [],
  trace: null,
  traceHistory: [],
  sttProvider: 'mock',
  llmProvider: 'mock',
  micSupported: true,
  lastCommandAt: null,
};

const voiceSlice = createSlice({
  name: 'voice',
  initialState,
  reducers: {
    setPanelOpen(state, action: PayloadAction<boolean>) {
      state.panelOpen = action.payload;
    },
    setStatus(state, action: PayloadAction<VoiceStatus>) {
      state.status = action.payload;
      if (action.payload === 'listening') {
        state.error = null;
        state.interimTranscript = '';
      }
    },
    setInterimTranscript(state, action: PayloadAction<string>) {
      state.interimTranscript = action.payload;
    },
    setTranscript(state, action: PayloadAction<string>) {
      state.transcript = action.payload;
      state.interimTranscript = '';
    },
    setCommands(state, action: PayloadAction<AICommand[]>) {
      state.commands = action.payload;
    },
    setCurrentAction(state, action: PayloadAction<string | null>) {
      state.currentAction = action.payload;
    },
    setResponse(state, action: PayloadAction<string | null>) {
      state.response = action.payload;
    },
    setPendingConfirmation(state, action: PayloadAction<PendingConfirmation | null>) {
      state.pendingConfirmation = action.payload;
      state.requiresConfirmation = action.payload !== null;
      if (action.payload) state.status = 'confirmation_required';
    },
    setPendingSlot(state, action: PayloadAction<PendingSlot | null>) {
      state.pendingSlot = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      if (action.payload) state.status = 'error';
    },
    pushHistory(state, action: PayloadAction<VoiceTurn>) {
      state.history = [action.payload, ...state.history].slice(0, 30);
      state.lastCommandAt = action.payload.timestamp;
    },
    setTrace(state, action: PayloadAction<DebugTrace | null>) {
      state.trace = action.payload;
    },
    updateTraceStep(state, action: PayloadAction<ExecutionStep>) {
      if (!state.trace) return;
      const idx = state.trace.steps.findIndex((s) => s.id === action.payload.id);
      if (idx === -1) state.trace.steps.push(action.payload);
      else state.trace.steps[idx] = action.payload;
    },
    finalizeTrace(state, action: PayloadAction<Partial<DebugTrace> | undefined>) {
      if (!state.trace) return;
      state.trace = { ...state.trace, ...(action.payload ?? {}), finishedAt: Date.now() };
      state.traceHistory = [state.trace, ...state.traceHistory].slice(0, 20);
    },
    setProviders(state, action: PayloadAction<{ stt: string; llm: string }>) {
      state.sttProvider = action.payload.stt;
      state.llmProvider = action.payload.llm;
    },
    setMicSupported(state, action: PayloadAction<boolean>) {
      state.micSupported = action.payload;
    },
    setEnabled(state, action: PayloadAction<boolean>) {
      state.enabled = action.payload;
    },
    resetVoice(state) {
      state.status = 'idle';
      state.transcript = '';
      state.interimTranscript = '';
      state.commands = [];
      state.currentAction = null;
      state.response = null;
      state.requiresConfirmation = false;
      state.pendingConfirmation = null;
      state.pendingSlot = null;
      state.error = null;
    },
    clearHistory(state) {
      state.history = [];
      state.traceHistory = [];
      state.trace = null;
    },
  },
});

export const voiceActions = voiceSlice.actions;
export default voiceSlice.reducer;
