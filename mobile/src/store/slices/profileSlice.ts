import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { profileApi } from '../../services/api';
import { ApiError } from '../../services/client';
import type { AuthUser, DeviceSession, ProfileResponse } from '../../types/api';

export interface ProfileState {
  profile: ProfileResponse | null;
  sessions: DeviceSession[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  notice: string | null;
}

const initialState: ProfileState = {
  profile: null,
  sessions: [],
  loading: false,
  saving: false,
  error: null,
  notice: null,
};

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'We could not update your profile.';
}

export const fetchProfile = createAsyncThunk<ProfileResponse, void, { rejectValue: string }>(
  'profile/fetch',
  async (_arg, { rejectWithValue }) => {
    try {
      return await profileApi.get();
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

export const updateProfile = createAsyncThunk<
  AuthUser,
  Parameters<typeof profileApi.update>[0],
  { rejectValue: string }
>('profile/update', async (input, { rejectWithValue }) => {
  try {
    const result = await profileApi.update(input);
    return result.user;
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const changePassword = createAsyncThunk<
  string,
  { currentPassword: string; newPassword: string },
  { rejectValue: string }
>('profile/changePassword', async (input, { rejectWithValue }) => {
  try {
    await profileApi.changePassword(input);
    return 'Password updated. Sign in again on your other devices.';
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const changePin = createAsyncThunk<
  string,
  { newPin: string; currentPin?: string; password?: string },
  { rejectValue: string }
>('profile/changePin', async (input, { rejectWithValue }) => {
  try {
    const result = await profileApi.changePin(input);
    return result.changed ? 'Transaction PIN updated.' : 'Transaction PIN created.';
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const setBiometrics = createAsyncThunk<boolean, boolean, { rejectValue: string }>(
  'profile/setBiometrics',
  async (enabled, { rejectWithValue }) => {
    try {
      const result = await profileApi.setBiometrics(enabled);
      return result.biometricEnabled;
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

export const fetchSessions = createAsyncThunk<DeviceSession[], void, { rejectValue: string }>(
  'profile/sessions',
  async (_arg, { rejectWithValue }) => {
    try {
      const result = await profileApi.sessions();
      return result.data;
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

export const revokeSession = createAsyncThunk<string, string, { rejectValue: string }>(
  'profile/revokeSession',
  async (id, { rejectWithValue }) => {
    try {
      await profileApi.revokeSession(id);
      return id;
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

const profileSlice = createSlice({
  name: 'profile',
  initialState,
  reducers: {
    clearProfileError(state) {
      state.error = null;
    },
    clearProfileNotice(state) {
      state.notice = null;
    },
    resetProfile: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProfile.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.profile = action.payload;
      })
      .addCase(fetchProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? null;
      })
      .addCase(updateProfile.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.saving = false;
        state.notice = 'Profile updated.';
        if (state.profile) state.profile = { ...state.profile, user: action.payload };
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload ?? null;
      })
      .addCase(changePassword.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(changePassword.fulfilled, (state, action) => {
        state.saving = false;
        state.notice = action.payload;
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload ?? null;
      })
      .addCase(changePin.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(changePin.fulfilled, (state, action) => {
        state.saving = false;
        state.notice = action.payload;
        if (state.profile) {
          state.profile = {
            ...state.profile,
            security: { ...state.profile.security, pinConfigured: true },
          };
        }
      })
      .addCase(changePin.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload ?? null;
      })
      .addCase(setBiometrics.fulfilled, (state, action) => {
        if (state.profile) {
          state.profile = {
            ...state.profile,
            user: { ...state.profile.user, biometricEnabled: action.payload },
            security: { ...state.profile.security, biometricEnabled: action.payload },
          };
        }
      })
      .addCase(fetchSessions.fulfilled, (state, action) => {
        state.sessions = action.payload;
      })
      .addCase(revokeSession.fulfilled, (state, action) => {
        state.sessions = state.sessions.filter((session) => session.id !== action.payload);
      });
  },
});

export const { clearProfileError, clearProfileNotice, resetProfile } = profileSlice.actions;

export default profileSlice.reducer;
