import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { transactionsApi } from '../../services/api';
import { ApiError } from '../../services/client';
import type { Receipt, Transaction } from '../../types/api';

export interface TransactionFilters {
  status: 'ALL' | 'PENDING' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED' | 'REVERSED';
  type:
    | 'ALL'
    | 'FUNDING'
    | 'TRANSFER_IN'
    | 'TRANSFER_OUT'
    | 'WITHDRAWAL'
    | 'REFUND'
    | 'PAYMENT'
    | 'ADJUSTMENT';
  direction: 'ALL' | 'in' | 'out';
  search: string;
}

export interface TransactionsState {
  items: Transaction[];
  filters: TransactionFilters;
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  selected: Transaction | null;
  receipt: Receipt | null;
  loadingReceipt: boolean;
}

const initialState: TransactionsState = {
  items: [],
  filters: { status: 'ALL', type: 'ALL', direction: 'ALL', search: '' },
  cursor: null,
  hasMore: false,
  loading: false,
  refreshing: false,
  loadingMore: false,
  error: null,
  selected: null,
  receipt: null,
  loadingReceipt: false,
};

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'We could not load your transactions.';
}

export const fetchTransactions = createAsyncThunk<
  { items: Transaction[]; cursor: string | null; hasMore: boolean; replaced: boolean },
  { refresh?: boolean } | undefined,
  { rejectValue: string; state: { transactions: TransactionsState } }
>('transactions/fetch', async (arg, { getState, rejectWithValue }) => {
  const { filters, cursor } = getState().transactions;
  const refresh = arg?.refresh ?? true;
  try {
    const result = await transactionsApi.list({
      limit: 20,
      cursor: refresh ? undefined : (cursor ?? undefined),
      status: filters.status,
      type: filters.type,
      direction: filters.direction,
      search: filters.search || undefined,
    });
    return {
      items: result.data,
      cursor: (result.meta?.nextCursor as string | null) ?? null,
      hasMore: Boolean(result.meta?.hasMore),
      replaced: refresh,
    };
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const fetchTransaction = createAsyncThunk<Transaction, string, { rejectValue: string }>(
  'transactions/fetchOne',
  async (id, { rejectWithValue }) => {
    try {
      return await transactionsApi.get(id);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

export const fetchReceipt = createAsyncThunk<Receipt, string, { rejectValue: string }>(
  'transactions/receipt',
  async (id, { rejectWithValue }) => {
    try {
      return await transactionsApi.receipt(id);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

const transactionsSlice = createSlice({
  name: 'transactions',
  initialState,
  reducers: {
    setFilter(state, action: PayloadAction<Partial<TransactionFilters>>) {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters(state) {
      state.filters = initialState.filters;
    },
    clearSelected(state) {
      state.selected = null;
      state.receipt = null;
    },
    prependTransaction(state, action: PayloadAction<Transaction>) {
      state.items = [action.payload, ...state.items.filter((item) => item.id !== action.payload.id)];
    },
    clearTransactionsError(state) {
      state.error = null;
    },
    resetTransactions: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTransactions.pending, (state, action) => {
        if (action.meta.arg?.refresh === false) state.loadingMore = true;
        else if (state.items.length === 0) state.loading = true;
        else state.refreshing = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.refreshing = false;
        state.loadingMore = false;
        state.cursor = action.payload.cursor;
        state.hasMore = action.payload.hasMore;
        state.items = action.payload.replaced
          ? action.payload.items
          : [...state.items, ...action.payload.items.filter((item) => !state.items.some((x) => x.id === item.id))];
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading = false;
        state.refreshing = false;
        state.loadingMore = false;
        state.error = action.payload ?? 'We could not load your transactions.';
      })
      .addCase(fetchTransaction.fulfilled, (state, action) => {
        state.selected = action.payload;
      })
      .addCase(fetchReceipt.pending, (state) => {
        state.loadingReceipt = true;
      })
      .addCase(fetchReceipt.fulfilled, (state, action) => {
        state.loadingReceipt = false;
        state.receipt = action.payload;
      })
      .addCase(fetchReceipt.rejected, (state, action) => {
        state.loadingReceipt = false;
        state.error = action.payload ?? null;
      });
  },
});

export const { setFilter, clearFilters, clearSelected, prependTransaction, clearTransactionsError, resetTransactions } =
  transactionsSlice.actions;

export default transactionsSlice.reducer;
