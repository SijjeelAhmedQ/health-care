import { createAsyncThunk, createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { appointmentService } from '@/services/api';
import type { Appointment } from '@/types/domain';
import type { RootState } from '..';

const adapter = createEntityAdapter<Appointment>({
  sortComparer: (a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
});

interface ExtraState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  currentAppointmentId: string | null;
  calendarView: 'day' | 'week' | 'month';
  calendarDate: string;
}

const initialState = adapter.getInitialState<ExtraState>({
  status: 'idle',
  error: null,
  currentAppointmentId: null,
  calendarView: 'week',
  calendarDate: new Date().toISOString().slice(0, 10),
});

export const fetchAppointments = createAsyncThunk('appointments/fetchAll', async () => appointmentService.all());
export const createAppointment = createAsyncThunk('appointments/create', async (input: Omit<Appointment, 'id'>) => appointmentService.create(input));
export const updateAppointment = createAsyncThunk('appointments/update', async ({ id, patch }: { id: string; patch: Partial<Appointment> }) =>
  appointmentService.update(id, patch),
);
export const deleteAppointment = createAsyncThunk('appointments/delete', async (id: string) => {
  await appointmentService.remove(id);
  return id;
});

const appointmentSlice = createSlice({
  name: 'appointments',
  initialState,
  reducers: {
    setCurrentAppointment(state, action: PayloadAction<string | null>) {
      state.currentAppointmentId = action.payload;
    },
    setCalendarView(state, action: PayloadAction<ExtraState['calendarView']>) {
      state.calendarView = action.payload;
    },
    setCalendarDate(state, action: PayloadAction<string>) {
      state.calendarDate = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAppointments.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchAppointments.fulfilled, (state, action) => {
        state.status = 'succeeded';
        adapter.setAll(state, action.payload);
      })
      .addCase(fetchAppointments.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to load appointments';
      })
      .addCase(createAppointment.fulfilled, (state, action) => {
        adapter.addOne(state, action.payload);
      })
      .addCase(updateAppointment.fulfilled, (state, action) => {
        adapter.upsertOne(state, action.payload);
      })
      .addCase(deleteAppointment.fulfilled, (state, action) => {
        adapter.removeOne(state, action.payload);
      });
  },
});

export const { setCurrentAppointment, setCalendarView, setCalendarDate } = appointmentSlice.actions;
export const appointmentSelectors = adapter.getSelectors<RootState>((s) => s.appointments);
export default appointmentSlice.reducer;
