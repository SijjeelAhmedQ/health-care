/**
 * The five patient-scoped record types (medication, diagnosis, task, recall,
 * appointment) behave identically: load all, create, update, delete, and always
 * read back through the selected patient. One factory keeps that behaviour — and
 * therefore the data consistency rules — in a single place.
 */
import { createAsyncThunk, createEntityAdapter, createSlice, type EntityState } from '@reduxjs/toolkit';
import { appointmentService, diagnosisService, medicationService, recallService, taskService } from '@/services/api';
import type { Appointment, Diagnosis, Medication, Recall, Task } from '@/types/domain';

export interface RecordService<T extends { id: string }> {
  all(): Promise<T[]>;
  create(input: Omit<T, 'id'> & Partial<Pick<T, 'id'>>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

type RecordState<T> = EntityState<T, string> & { status: 'idle' | 'loading' | 'succeeded' | 'failed'; error: string | null };

/**
 * The slice of the store these five slices own, declared explicitly rather than
 * inferred from RootState — inferring it would make the store's own type depend
 * on itself.
 */
export interface RecordsState {
  medications: RecordState<Medication>;
  diagnoses: RecordState<Diagnosis>;
  tasks: RecordState<Task>;
  recalls: RecordState<Recall>;
  appointments: RecordState<Appointment>;
}

function createRecordSlice<T extends { id: string; patientId: string }>(
  name: string,
  service: RecordService<T>,
  selectState: (s: RecordsState) => RecordState<T>,
  sortComparer?: (a: T, b: T) => number,
) {
  const adapter = createEntityAdapter<T>({ sortComparer });
  const initialState = adapter.getInitialState({ status: 'idle' as const, error: null as string | null }) as RecordState<T>;

  const fetchAll = createAsyncThunk(`${name}/fetchAll`, () => service.all());
  const createOne = createAsyncThunk(`${name}/create`, (input: Omit<T, 'id'>) => service.create(input));
  const updateOne = createAsyncThunk(`${name}/update`, ({ id, patch }: { id: string; patch: Partial<T> }) => service.update(id, patch));
  const removeOne = createAsyncThunk(`${name}/delete`, async (id: string) => {
    await service.remove(id);
    return id;
  });

  const slice = createSlice({
    name,
    initialState,
    reducers: {},
    extraReducers: (builder) => {
      builder
        .addCase(fetchAll.pending, (state) => {
          state.status = 'loading';
        })
        .addCase(fetchAll.fulfilled, (state, action) => {
          state.status = 'succeeded';
          adapter.setAll(state as RecordState<T>, action.payload);
        })
        .addCase(fetchAll.rejected, (state, action) => {
          state.status = 'failed';
          state.error = action.error.message ?? `Failed to load ${name}`;
        })
        .addCase(createOne.fulfilled, (state, action) => {
          adapter.addOne(state as RecordState<T>, action.payload);
        })
        .addCase(updateOne.fulfilled, (state, action) => {
          adapter.upsertOne(state as RecordState<T>, action.payload);
        })
        .addCase(removeOne.fulfilled, (state, action) => {
          adapter.removeOne(state as RecordState<T>, action.payload);
        });
    },
  });

  const selectors = adapter.getSelectors(selectState);

  return {
    reducer: slice.reducer,
    fetchAll,
    create: createOne,
    update: updateOne,
    remove: removeOne,
    selectors,
    /** Records belonging to one patient — the only selector the module pages use. */
    selectByPatient: (state: RecordsState, patientId: string | null): T[] =>
      patientId ? selectors.selectAll(state).filter((r) => r.patientId === patientId) : [],
    selectStatus: (state: RecordsState) => selectState(state).status,
  };
}

export const medicationsSlice = createRecordSlice<Medication>('medications', medicationService, (s) => s.medications, (a, b) =>
  b.startDate.localeCompare(a.startDate),
);
export const diagnosesSlice = createRecordSlice<Diagnosis>('diagnoses', diagnosisService, (s) => s.diagnoses, (a, b) =>
  b.onsetDate.localeCompare(a.onsetDate),
);
export const tasksSlice = createRecordSlice<Task>('tasks', taskService, (s) => s.tasks, (a, b) => a.dueDate.localeCompare(b.dueDate));
export const recallsSlice = createRecordSlice<Recall>('recalls', recallService, (s) => s.recalls, (a, b) => a.dueDate.localeCompare(b.dueDate));
export const appointmentsSlice = createRecordSlice<Appointment>('appointments', appointmentService, (s) => s.appointments, (a, b) =>
  `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`),
);

/** Every record slice, keyed by the module it belongs to. Used by the voice executor. */
export const recordSlices = {
  medication: medicationsSlice,
  diagnosis: diagnosesSlice,
  task: tasksSlice,
  recall: recallsSlice,
  appointment: appointmentsSlice,
} as const;

export type RecordKind = keyof typeof recordSlices;
export const recordKinds = Object.keys(recordSlices) as RecordKind[];
