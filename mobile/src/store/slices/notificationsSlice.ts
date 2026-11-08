import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { notificationsApi } from '../../services/api';
import { ApiError } from '../../services/client';
import type { Notification } from '../../types/api';

export interface NotificationsState {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  /** Local feed entry pushed when a transaction fails or stays pending. */
  local: Notification[];
}

const initialState: NotificationsState = {
  items: [],
  unreadCount: 0,
  loading: false,
  error: null,
  local: [],
};

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'We could not load your notifications.';
}

export const fetchNotifications = createAsyncThunk<
  { items: Notification[]; unreadCount: number },
  void,
  { rejectValue: string }
>('notifications/fetch', async (_arg, { rejectWithValue }) => {
  try {
    const result = await notificationsApi.list({ limit: 30 });
    const items = result.data;
    return {
      items,
      unreadCount: (result.meta?.unread as number | undefined) ?? items.filter((item) => !item.readAt).length,
    };
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const markRead = createAsyncThunk<string, string, { rejectValue: string }>(
  'notifications/markRead',
  async (id, { rejectWithValue }) => {
    try {
      await notificationsApi.markRead(id);
      return id;
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

export const markAllRead = createAsyncThunk<number, void, { rejectValue: string }>(
  'notifications/markAllRead',
  async (_arg, { rejectWithValue }) => {
    try {
      const result = await notificationsApi.markAllRead();
      return result.updated;
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    pushLocalNotification(state, action: PayloadAction<Omit<Notification, 'id' | 'createdAt'>>) {
      state.local = [
        { ...action.payload, id: `local-${Date.now()}`, createdAt: new Date().toISOString() },
        ...state.local,
      ].slice(0, 20);
    },
    dismissLocalNotification(state, action: PayloadAction<string>) {
      state.local = state.local.filter((item) => item.id !== action.payload);
    },
    clearLocalNotifications(state) {
      state.local = [];
    },
    resetNotifications: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.items;
        state.unreadCount = action.payload.unreadCount;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? null;
      })
      .addCase(markRead.fulfilled, (state, action) => {
        state.items = state.items.map((item) =>
          item.id === action.payload ? { ...item, readAt: new Date().toISOString() } : item,
        );
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      })
      .addCase(markAllRead.fulfilled, (state) => {
        const now = new Date().toISOString();
        state.items = state.items.map((item) => ({ ...item, readAt: item.readAt ?? now }));
        state.unreadCount = 0;
      });
  },
});

export const { pushLocalNotification, dismissLocalNotification, clearLocalNotifications, resetNotifications } =
  notificationsSlice.actions;

export default notificationsSlice.reducer;
