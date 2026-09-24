import { createAsyncThunk, createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { patientService } from '@/services/api';
import type { Patient } from '@/types/domain';
import type { RootState } from '..';
import { hasPersistedSession, login, logout } from './authSlice';

const adapter = createEntityAdapter<Patient>({ sortComparer: (a, b) => a.lastName.localeCompare(b.lastName) });

/**
 * The selected patient survives a reload — it is the context the whole app works in.
 * It never survives a sign-out: every sign-in starts with no patient selected.
 */
const SELECTED_KEY = 'careflow.selectedPatientId';
const readSelected = (): string | null => {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
};
const writeSelected = (id: string | null) => {
  try {
    if (id) localStorage.setItem(SELECTED_KEY, id);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    /* storage unavailable — the context still works for this session */
  }
};

interface PatientExtraState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  /** The patient every patient-dependent module works on. Null = nothing may be created or changed. */
  currentPatientId: string | null;
  recentPatientIds: string[];
  lastSearch: string;
}

// A stored selection without a signed-in session (signed out, or the session expired) is stale.
if (!hasPersistedSession()) writeSelected(null);

const initialState = adapter.getInitialState<PatientExtraState>({
  status: 'idle',
  error: null,
  currentPatientId: hasPersistedSession() ? readSelected() : null,
  recentPatientIds: [],
  lastSearch: '',
});

export const fetchPatients = createAsyncThunk('patients/fetchAll', async () => patientService.all());
export const createPatient = createAsyncThunk('patients/create', async (input: Omit<Patient, 'id'>) => patientService.create(input));
export const updatePatient = createAsyncThunk('patients/update', async ({ id, patch }: { id: string; patch: Partial<Patient> }) =>
  patientService.update(id, patch),
);
export const deletePatient = createAsyncThunk('patients/delete', async (id: string) => {
  await patientService.remove(id);
  return id;
});

const patientSlice = createSlice({
  name: 'patients',
  initialState,
  reducers: {
    setCurrentPatient(state, action: PayloadAction<string | null>) {
      state.currentPatientId = action.payload;
      writeSelected(action.payload);
      if (action.payload) {
        state.recentPatientIds = [action.payload, ...state.recentPatientIds.filter((id) => id !== action.payload)].slice(0, 8);
      }
    },
    setLastSearch(state, action: PayloadAction<string>) {
      state.lastSearch = action.payload;
    },
  },
  extraReducers: (builder) => {
    /** Patient safety: no patient context outlives the session it was chosen in. */
    const clearContext = (state: typeof initialState) => {
      state.currentPatientId = null;
      state.recentPatientIds = [];
      state.lastSearch = '';
      writeSelected(null);
    };
    builder
      // Cleared the moment sign-out starts, not after the server answers.
      .addCase(logout.pending, clearContext)
      .addCase(logout.fulfilled, clearContext)
      // A new sign-in always starts with no patient selected.
      .addCase(login.fulfilled, clearContext)
      .addCase(fetchPatients.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchPatients.fulfilled, (state, action) => {
        state.status = 'succeeded';
        adapter.setAll(state, action.payload);
        // A stored selection that no longer exists must not leave a stale context behind.
        if (state.currentPatientId && !action.payload.some((p) => p.id === state.currentPatientId)) {
          state.currentPatientId = null;
          writeSelected(null);
        }
      })
      .addCase(fetchPatients.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to load patients';
      })
      .addCase(createPatient.fulfilled, (state, action) => {
        adapter.addOne(state, action.payload);
      })
      .addCase(updatePatient.fulfilled, (state, action) => {
        adapter.upsertOne(state, action.payload);
      })
      .addCase(deletePatient.fulfilled, (state, action) => {
        adapter.removeOne(state, action.payload);
        state.recentPatientIds = state.recentPatientIds.filter((id) => id !== action.payload);
        if (state.currentPatientId === action.payload) {
          state.currentPatientId = null;
          writeSelected(null);
        }
      });
  },
});

export const { setCurrentPatient, setLastSearch } = patientSlice.actions;
export const patientSelectors = adapter.getSelectors<RootState>((s) => s.patients);
export const selectCurrentPatient = (s: RootState) => (s.patients.currentPatientId ? patientSelectors.selectById(s, s.patients.currentPatientId) : undefined);
export default patientSlice.reducer;
