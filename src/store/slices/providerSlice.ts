import { createAsyncThunk, createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { providerService } from '@/services/api';
import type { Provider } from '@/types/domain';
import type { RootState } from '..';

const adapter = createEntityAdapter<Provider>({ sortComparer: (a, b) => a.lastName.localeCompare(b.lastName) });

interface ExtraState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  currentProviderId: string | null;
}

const initialState = adapter.getInitialState<ExtraState>({ status: 'idle', error: null, currentProviderId: null });

export const fetchProviders = createAsyncThunk('providers/fetchAll', async () => providerService.all());
export const createProvider = createAsyncThunk('providers/create', async (input: Omit<Provider, 'id'>) => providerService.create(input));
export const updateProvider = createAsyncThunk('providers/update', async ({ id, patch }: { id: string; patch: Partial<Provider> }) =>
  providerService.update(id, patch),
);

const providerSlice = createSlice({
  name: 'providers',
  initialState,
  reducers: {
    setCurrentProvider(state, action: PayloadAction<string | null>) {
      state.currentProviderId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProviders.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchProviders.fulfilled, (state, action) => {
        state.status = 'succeeded';
        adapter.setAll(state, action.payload);
      })
      .addCase(fetchProviders.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to load providers';
      })
      .addCase(createProvider.fulfilled, (state, action) => {
        adapter.addOne(state, action.payload);
      })
      .addCase(updateProvider.fulfilled, (state, action) => {
        adapter.upsertOne(state, action.payload);
      });
  },
});

export const { setCurrentProvider } = providerSlice.actions;
export const providerSelectors = adapter.getSelectors<RootState>((s) => s.providers);
export default providerSlice.reducer;
