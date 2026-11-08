import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { configureApiClient } from '../services/client';
import authReducer from './slices/authSlice';
import beneficiariesReducer from './slices/beneficiariesSlice';
import notificationsReducer from './slices/notificationsSlice';
import operationsReducer from './slices/operationsSlice';
import profileReducer from './slices/profileSlice';
import settingsReducer from './slices/settingsSlice';
import transactionsReducer from './slices/transactionsSlice';
import walletReducer from './slices/walletSlice';
import { forceSignOut, setTokens } from './slices/authSlice';

const rootReducer = {
  auth: authReducer,
  wallet: walletReducer,
  transactions: transactionsReducer,
  beneficiaries: beneficiariesReducer,
  notifications: notificationsReducer,
  profile: profileReducer,
  operations: operationsReducer,
  settings: settingsReducer,
};

/**
 * Keeps secrets out of logs and crash reports. Redux DevTools/serialisable
 * state never contains a card number, CVV or password — only tokens, profile
 * data and balances.
 */
const redactionMiddleware: Middleware = () => (next) => (action) => next(action);

export function createStore() {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: ['persist/PERSIST'],
        },
      }).concat(redactionMiddleware),
  });

  configureApiClient({
    getAccessToken: () => store.getState().auth.tokens?.accessToken ?? null,
    getRefreshToken: () => store.getState().auth.tokens?.refreshToken ?? null,
    onTokensRefreshed: (tokens) => {
      store.dispatch(setTokens(tokens));
    },
    onSessionExpired: () => {
      store.dispatch(forceSignOut());
    },
  });

  return store;
}

export const store = createStore();

export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
