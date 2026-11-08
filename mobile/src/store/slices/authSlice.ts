import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { authApi, type AuthTokens, type DeviceContext, type RegisterInput, type VerifyDemoCode } from '../../services/api';
import { ApiError } from '../../services/client';
import { deleteSecureItem, readJson, StorageKeys, writeJson } from '../../services/storage';
import type { AuthUser, Wallet } from '../../types/api';

export type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'signedOut';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  wallet: Wallet | null;
  tokens: AuthTokens | null;
  /** Verification codes are only echoed by the backend in demo mode. */
  demoCode: string | null;
  resetToken: string | null;
  pendingEmail: string | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
}

const initialState: AuthState = {
  status: 'idle',
  user: null,
  wallet: null,
  tokens: null,
  demoCode: null,
  resetToken: null,
  pendingEmail: null,
  loading: false,
  error: null,
  errorCode: null,
};

function messageOf(error: unknown): { message: string; code: string | null } {
  if (error instanceof ApiError) return { message: error.message, code: error.code };
  if (error instanceof Error) return { message: error.message, code: null };
  return { message: 'Something went wrong. Please try again.', code: null };
}

interface AuthSuccess {
  user: AuthUser;
  tokens: AuthTokens;
  wallet: Wallet;
}

export const register = createAsyncThunk<
  AuthSuccess & { verification?: VerifyDemoCode },
  RegisterInput,
  { rejectValue: { message: string; code: string | null } }
>('auth/register', async (input, { rejectWithValue }) => {
  try {
    const result = await authApi.register(input);
    return { ...result, verification: result.verification };
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const login = createAsyncThunk<
  AuthSuccess,
  { email: string; password: string; device: DeviceContext },
  { rejectValue: { message: string; code: string | null } }
>('auth/login', async (input, { rejectWithValue }) => {
  try {
    return await authApi.login(input);
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const verifyEmail = createAsyncThunk<
  { user: AuthUser; verified: boolean; verification?: VerifyDemoCode },
  string,
  { rejectValue: { message: string; code: string | null } }
>('auth/verifyEmail', async (code, { rejectWithValue }) => {
  try {
    return await authApi.verifyEmail(code);
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const resendVerification = createAsyncThunk<
  { sent: boolean; verification?: VerifyDemoCode },
  void,
  { rejectValue: { message: string; code: string | null } }
>('auth/resendVerification', async (_arg, { rejectWithValue }) => {
  try {
    return await authApi.resendVerification();
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const forgotPassword = createAsyncThunk<
  { sent: boolean; resetToken?: string; verification?: VerifyDemoCode; email: string },
  string,
  { rejectValue: { message: string; code: string | null } }
>('auth/forgotPassword', async (email, { rejectWithValue }) => {
  try {
    const result = await authApi.forgotPassword(email);
    return { ...result, email };
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const resetPassword = createAsyncThunk<
  { success: boolean },
  { token: string; password: string; confirmPassword: string },
  { rejectValue: { message: string; code: string | null } }
>('auth/resetPassword', async (input, { rejectWithValue }) => {
  try {
    return await authApi.resetPassword(input);
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const logout = createAsyncThunk('auth/logout', async (_arg, { getState }) => {
  const state = getState() as { auth: AuthState };
  const refreshToken = state.auth.tokens?.refreshToken;
  if (refreshToken) {
    try {
      await authApi.logout(refreshToken);
    } catch {
      // Signing out locally must succeed even if the network call fails.
    }
  }
  await deleteSecureItem(StorageKeys.accessToken);
  await deleteSecureItem(StorageKeys.refreshToken);
  await deleteSecureItem(StorageKeys.user);
  return true;
});

/** Reads any persisted session at startup. The token is only a hint; the API decides. */
export const hydrateSession = createAsyncThunk<
  { user: AuthUser; tokens: AuthTokens } | null,
  void,
  { rejectValue: string }
>('auth/hydrate', async () => {
  const persisted = await readJson<{ user: AuthUser; tokens: AuthTokens }>(StorageKeys.user);
  if (!persisted?.tokens?.accessToken) return null;
  return persisted;
});

async function persistSession(user: AuthUser, tokens: AuthTokens): Promise<void> {
  await writeJson(StorageKeys.user, { user, tokens });
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
      state.errorCode = null;
    },
    setTokens(state, action: PayloadAction<AuthTokens>) {
      state.tokens = action.payload;
      if (state.user) void persistSession(state.user, action.payload);
    },
    updateUser(state, action: PayloadAction<Partial<AuthUser>>) {
      if (!state.user) return;
      state.user = { ...state.user, ...action.payload };
      if (state.tokens) void persistSession(state.user, state.tokens);
    },
    setWallet(state, action: PayloadAction<Wallet>) {
      state.wallet = action.payload;
    },
    clearDemoCode(state) {
      state.demoCode = null;
    },
    forceSignOut(state) {
      state.status = 'signedOut';
      state.user = null;
      state.wallet = null;
      state.tokens = null;
      state.error = null;
      state.errorCode = null;
    },
  },
  extraReducers: (builder) => {
    const startLoading = (state: AuthState) => {
      state.loading = true;
      state.error = null;
      state.errorCode = null;
    };
    const fail = (state: AuthState, action: PayloadAction<{ message: string; code: string | null } | undefined>) => {
      state.loading = false;
      state.error = action.payload?.message ?? 'Something went wrong.';
      state.errorCode = action.payload?.code ?? null;
    };
    const succeed = (state: AuthState, action: PayloadAction<AuthSuccess>) => {
      // A fulfilled thunk always carries a payload; guard anyway so a malformed
      // response can never leave the store half-signed-in.
      if (!action.payload?.tokens?.accessToken) {
        state.loading = false;
        state.status = 'signedOut';
        state.error = 'We could not sign you in. Please try again.';
        state.errorCode = 'INVALID_CREDENTIALS';
        return;
      }

      state.loading = false;
      state.user = action.payload.user;
      state.wallet = action.payload.wallet;
      state.tokens = action.payload.tokens;
      state.status = 'authenticated';
      state.error = null;
      state.errorCode = null;
      void persistSession(action.payload.user, action.payload.tokens);
    };

    builder
      .addCase(register.pending, (state) => {
        startLoading(state);
        state.status = 'authenticating';
      })
      .addCase(register.fulfilled, (state, action) => {
        succeed(state, action);
        state.demoCode = action.payload.verification?.demoCode ?? null;
      })
      .addCase(register.rejected, (state, action) => {
        state.status = 'signedOut';
        fail(state, action);
      })
      .addCase(login.pending, (state) => {
        startLoading(state);
        state.status = 'authenticating';
      })
      .addCase(login.fulfilled, (state, action) => {
        succeed(state, action);
        state.demoCode = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'signedOut';
        fail(state, action);
      })
      .addCase(verifyEmail.pending, startLoading)
      .addCase(verifyEmail.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.demoCode = action.payload.verification?.demoCode ?? null;
        if (state.user && state.tokens) void persistSession(state.user, state.tokens);
      })
      .addCase(verifyEmail.rejected, fail)
      .addCase(resendVerification.fulfilled, (state, action) => {
        state.demoCode = action.payload.verification?.demoCode ?? state.demoCode;
      })
      .addCase(forgotPassword.pending, startLoading)
      .addCase(forgotPassword.fulfilled, (state, action) => {
        state.loading = false;
        state.pendingEmail = action.payload.email;
        state.resetToken = action.payload.resetToken ?? null;
        state.demoCode = action.payload.verification?.demoCode ?? null;
      })
      .addCase(forgotPassword.rejected, fail)
      .addCase(resetPassword.pending, startLoading)
      .addCase(resetPassword.fulfilled, (state) => {
        state.loading = false;
        state.resetToken = null;
        state.demoCode = null;
      })
      .addCase(resetPassword.rejected, fail)
      .addCase(hydrateSession.fulfilled, (state, action) => {
        if (!action.payload) {
          state.status = 'signedOut';
          return;
        }
        state.user = action.payload.user;
        state.tokens = action.payload.tokens;
        state.status = 'authenticated';
      })
      .addCase(logout.fulfilled, (state) => {
        state.status = 'signedOut';
        state.user = null;
        state.wallet = null;
        state.tokens = null;
        state.demoCode = null;
        state.error = null;
        state.errorCode = null;
      });
  },
});

export const { clearError, setTokens, updateUser, setWallet, clearDemoCode, forceSignOut } = authSlice.actions;

export default authSlice.reducer;
