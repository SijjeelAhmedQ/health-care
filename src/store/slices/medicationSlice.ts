import { createAsyncThunk, createEntityAdapter, createSlice } from '@reduxjs/toolkit';
import { medicationService, prescriptionService } from '@/services/api';
import type { Medication, Prescription } from '@/types/domain';
import type { RootState } from '..';

const medAdapter = createEntityAdapter<Medication>({ sortComparer: (a, b) => b.startDate.localeCompare(a.startDate) });
const rxAdapter = createEntityAdapter<Prescription>({ sortComparer: (a, b) => b.issuedAt.localeCompare(a.issuedAt) });

interface MedicationState {
  medications: ReturnType<typeof medAdapter.getInitialState>;
  prescriptions: ReturnType<typeof rxAdapter.getInitialState>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: MedicationState = {
  medications: medAdapter.getInitialState(),
  prescriptions: rxAdapter.getInitialState(),
  status: 'idle',
  error: null,
};

export const fetchMedications = createAsyncThunk('medications/fetchAll', async () => medicationService.all());
export const fetchPrescriptions = createAsyncThunk('medications/fetchPrescriptions', async () => prescriptionService.all());
export const createMedication = createAsyncThunk('medications/create', async (input: Omit<Medication, 'id'>) => medicationService.create(input));
export const updateMedication = createAsyncThunk('medications/update', async ({ id, patch }: { id: string; patch: Partial<Medication> }) =>
  medicationService.update(id, patch),
);
export const deleteMedication = createAsyncThunk('medications/delete', async (id: string) => {
  await medicationService.remove(id);
  return id;
});
export const createPrescription = createAsyncThunk('medications/createPrescription', async (input: Omit<Prescription, 'id'>) =>
  prescriptionService.create(input),
);
export const updatePrescription = createAsyncThunk('medications/updatePrescription', async ({ id, patch }: { id: string; patch: Partial<Prescription> }) =>
  prescriptionService.update(id, patch),
);

const medicationSlice = createSlice({
  name: 'medications',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMedications.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchMedications.fulfilled, (state, action) => {
        state.status = 'succeeded';
        medAdapter.setAll(state.medications, action.payload);
      })
      .addCase(fetchMedications.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to load medications';
      })
      .addCase(fetchPrescriptions.fulfilled, (state, action) => {
        rxAdapter.setAll(state.prescriptions, action.payload);
      })
      .addCase(createMedication.fulfilled, (state, action) => {
        medAdapter.addOne(state.medications, action.payload);
      })
      .addCase(updateMedication.fulfilled, (state, action) => {
        medAdapter.upsertOne(state.medications, action.payload);
      })
      .addCase(deleteMedication.fulfilled, (state, action) => {
        medAdapter.removeOne(state.medications, action.payload);
      })
      .addCase(createPrescription.fulfilled, (state, action) => {
        rxAdapter.addOne(state.prescriptions, action.payload);
      })
      .addCase(updatePrescription.fulfilled, (state, action) => {
        rxAdapter.upsertOne(state.prescriptions, action.payload);
      });
  },
});

export const medicationSelectors = medAdapter.getSelectors<RootState>((s) => s.medications.medications);
export const prescriptionSelectors = rxAdapter.getSelectors<RootState>((s) => s.medications.prescriptions);
export default medicationSlice.reducer;
