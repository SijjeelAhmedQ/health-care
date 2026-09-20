import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import authReducer from './slices/authSlice';
import patientReducer from './slices/patientSlice';
import appointmentReducer from './slices/appointmentSlice';
import providerReducer from './slices/providerSlice';
import medicationReducer from './slices/medicationSlice';
import uiReducer from './slices/uiSlice';
import voiceReducer from './slices/voiceSlice';
import navigationReducer from './slices/navigationSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    patients: patientReducer,
    appointments: appointmentReducer,
    providers: providerReducer,
    medications: medicationReducer,
    ui: uiReducer,
    voice: voiceReducer,
    navigation: navigationReducer,
  },
  middleware: (getDefault) =>
    getDefault({
      serializableCheck: false,
    }),
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
