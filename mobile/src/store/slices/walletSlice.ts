import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { walletApi, type LedgerEntry, type WalletStatsLite } from '../../services/api';
import { ApiError } from '../../services/client';
import type { Transaction, Wallet, WalletBalance } from '../../types/api';

export interface WalletState {
  wallet: Wallet | null;
  balance: WalletBalance | null;
  stats: WalletStatsLite | null;
  recent: Transaction[];
  ledger: LedgerEntry[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdatedAt: string | null;
}

const initialState: WalletState = {
  wallet: null,
  balance: null,
  stats: null,
  recent: [],
  ledger: [],
  loading: false,
  refreshing: false,
  error: null,
  lastUpdatedAt: null,
};

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'We could not load your wallet.';
}

export const fetchWallet = createAsyncThunk<
  { wallet: Wallet; stats: WalletStatsLite; recentTransactions: Transaction[] },
  void,
  { rejectValue: string }
>('wallet/fetch', async (_arg, { rejectWithValue }) => {
  try {
    return await walletApi.get();
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const refreshBalance = createAsyncThunk<WalletBalance, void, { rejectValue: string }>(
  'wallet/refreshBalance',
  async (_arg, { rejectWithValue }) => {
    try {
      return await walletApi.balance();
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

export const fetchLedger = createAsyncThunk<LedgerEntry[], number | undefined, { rejectValue: string }>(
  'wallet/ledger',
  async (limit, { rejectWithValue }) => {
    try {
      const result = await walletApi.ledger(limit ?? 50);
      return result.data;
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    applyBalance(state, action: PayloadAction<number>) {
      if (state.balance) {
        state.balance = { ...state.balance, balanceMinor: action.payload };
      }
      if (state.wallet) {
        state.wallet = { ...state.wallet, balanceMinor: action.payload };
      }
    },
    applyLocalDebit(state, action: PayloadAction<number>) {
      const next = (state.balance?.balanceMinor ?? 0) - action.payload;
      if (state.balance) state.balance = { ...state.balance, balanceMinor: Math.max(0, next) };
      if (state.wallet) state.wallet = { ...state.wallet, balanceMinor: Math.max(0, next) };
    },
    mergeTransaction(state, action: PayloadAction<Transaction>) {
      state.recent = [action.payload, ...state.recent.filter((item) => item.id !== action.payload.id)].slice(0, 8);
    },
    clearWalletError(state) {
      state.error = null;
    },
    resetWallet: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWallet.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWallet.fulfilled, (state, action) => {
        state.loading = false;
        state.wallet = action.payload.wallet;
        state.stats = action.payload.stats;
        state.recent = action.payload.recentTransactions;
        state.balance = state.balance
          ? { ...state.balance, balanceMinor: action.payload.wallet.balanceMinor }
          : state.balance;
        state.lastUpdatedAt = new Date().toISOString();
      })
      .addCase(fetchWallet.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'We could not load your wallet.';
      })
      .addCase(refreshBalance.pending, (state) => {
        state.refreshing = true;
      })
      .addCase(refreshBalance.fulfilled, (state, action) => {
        state.refreshing = false;
        state.balance = action.payload;
        if (state.wallet) {
          state.wallet = { ...state.wallet, balanceMinor: action.payload.balanceMinor };
        }
        state.lastUpdatedAt = new Date().toISOString();
      })
      .addCase(refreshBalance.rejected, (state, action) => {
        state.refreshing = false;
        state.error = action.payload ?? null;
      })
      .addCase(fetchLedger.fulfilled, (state, action) => {
        state.ledger = action.payload;
      });
  },
});

export const { applyBalance, applyLocalDebit, mergeTransaction, clearWalletError, resetWallet } = walletSlice.actions;

export default walletSlice.reducer;
