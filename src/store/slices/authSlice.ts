import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { authService, type AuthSession } from '@/services/api';
import type { User } from '@/types/domain';

interface AuthState {
  user: User | null;
  token: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'error';
  error: string | null;
}

const STORAGE_KEY = 'careflow.session';

function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

const persisted = loadSession();

const initialState: AuthState = {
  user: persisted?.user ?? null,
  token: persisted?.token ?? null,
  status: persisted ? 'authenticated' : 'idle',
  error: null,
};

export const login = createAsyncThunk('auth/login', async (creds: { username: string; password: string }) => {
  const session = await authService.login(creds.username, creds.password);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
});

export const logout = createAsyncThunk('auth/logout', async () => {
  await authService.logout();
  localStorage.removeItem(STORAGE_KEY);
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload.user;
        state.token = action.payload.token;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.error.message ?? 'Login failed';
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.status = 'idle';
      });
  },
});

export const { setUser } = authSlice.actions;
export default authSlice.reducer;
