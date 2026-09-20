import { createAsyncThunk, createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { patientService } from '@/services/api';
import type { Patient } from '@/types/domain';
import type { RootState } from '..';

const adapter = createEntityAdapter<Patient>({ sortComparer: (a, b) => a.lastName.localeCompare(b.lastName) });

interface PatientExtraState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  /** Patient currently in context (open profile) — used by the voice assistant. */
  currentPatientId: string | null;
  recentPatientIds: string[];
  lastSearch: string;
}

const initialState = adapter.getInitialState<PatientExtraState>({
  status: 'idle',
  error: null,
  currentPatientId: null,
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
      if (action.payload) {
        state.recentPatientIds = [action.payload, ...state.recentPatientIds.filter((id) => id !== action.payload)].slice(0, 8);
      }
    },
    setLastSearch(state, action: PayloadAction<string>) {
      state.lastSearch = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPatients.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchPatients.fulfilled, (state, action) => {
        state.status = 'succeeded';
        adapter.setAll(state, action.payload);
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
        if (state.currentPatientId === action.payload) state.currentPatientId = null;
      });
  },
});

export const { setCurrentPatient, setLastSearch } = patientSlice.actions;
export const patientSelectors = adapter.getSelectors<RootState>((s) => s.patients);
export const selectCurrentPatient = (s: RootState) => (s.patients.currentPatientId ? patientSelectors.selectById(s, s.patients.currentPatientId) : undefined);
export default patientSlice.reducer;
