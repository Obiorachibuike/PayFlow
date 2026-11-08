import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { beneficiariesApi } from '../../services/api';
import { ApiError } from '../../services/client';
import type { Bank, Beneficiary } from '../../types/api';

export interface BeneficiariesState {
  items: Beneficiary[];
  banks: Bank[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  resolvedName: { accountNumber: string; resolvedName: string; note: string } | null;
}

const initialState: BeneficiariesState = {
  items: [],
  banks: [],
  loading: false,
  saving: false,
  error: null,
  resolvedName: null,
};

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'We could not load your beneficiaries.';
}

export const fetchBeneficiaries = createAsyncThunk<Beneficiary[], void, { rejectValue: string }>(
  'beneficiaries/fetch',
  async (_arg, { rejectWithValue }) => {
    try {
      const result = await beneficiariesApi.list();
      return result.data;
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

export const fetchBanks = createAsyncThunk<Bank[], void, { rejectValue: string }>(
  'beneficiaries/banks',
  async (_arg, { rejectWithValue }) => {
    try {
      const result = await beneficiariesApi.banks();
      return result.data;
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

export const createBeneficiary = createAsyncThunk<
  Beneficiary,
  { bankCode: string; accountNumber: string; accountName: string; isDefault?: boolean },
  { rejectValue: string }
>('beneficiaries/create', async (input, { rejectWithValue }) => {
  try {
    return await beneficiariesApi.create(input);
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const updateBeneficiary = createAsyncThunk<
  Beneficiary,
  { id: string; accountName?: string; isDefault?: boolean },
  { rejectValue: string }
>('beneficiaries/update', async ({ id, ...input }, { rejectWithValue }) => {
  try {
    return await beneficiariesApi.update(id, input);
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

export const deleteBeneficiary = createAsyncThunk<string, string, { rejectValue: string }>(
  'beneficiaries/delete',
  async (id, { rejectWithValue }) => {
    try {
      await beneficiariesApi.remove(id);
      return id;
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** Mock name lookup — the response is always labelled simulated in the UI. */
export const resolveAccount = createAsyncThunk<
  { accountNumber: string; resolvedName: string; note: string },
  { accountNumber: string; bankCode: string },
  { rejectValue: string }
>('beneficiaries/resolve', async (input, { rejectWithValue }) => {
  try {
    const result = await beneficiariesApi.resolveAccount(input.accountNumber, input.bankCode);
    return { accountNumber: result.accountNumber, resolvedName: result.resolvedName, note: result.note };
  } catch (error) {
    return rejectWithValue(messageOf(error));
  }
});

const beneficiariesSlice = createSlice({
  name: 'beneficiaries',
  initialState,
  reducers: {
    clearResolvedName(state) {
      state.resolvedName = null;
    },
    clearBeneficiariesError(state) {
      state.error = null;
    },
    resetBeneficiaries: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBeneficiaries.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBeneficiaries.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchBeneficiaries.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? null;
      })
      .addCase(fetchBanks.fulfilled, (state, action) => {
        state.banks = action.payload;
      })
      .addCase(createBeneficiary.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(createBeneficiary.fulfilled, (state, action) => {
        state.saving = false;
        const next = action.payload.isDefault ? state.items.map((item) => ({ ...item, isDefault: false })) : state.items;
        state.items = [action.payload, ...next.filter((item) => item.id !== action.payload.id)];
      })
      .addCase(createBeneficiary.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload ?? null;
      })
      .addCase(updateBeneficiary.fulfilled, (state, action) => {
        state.items = state.items.map((item) =>
          item.id === action.payload.id
            ? action.payload
            : action.payload.isDefault
              ? { ...item, isDefault: false }
              : item,
        );
      })
      .addCase(deleteBeneficiary.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
      })
      .addCase(resolveAccount.fulfilled, (state, action) => {
        state.resolvedName = action.payload;
      })
      .addCase(resolveAccount.rejected, (state, action) => {
        state.error = action.payload ?? null;
      });
  },
});

export const { clearResolvedName, clearBeneficiariesError, resetBeneficiaries } = beneficiariesSlice.actions;

export default beneficiariesSlice.reducer;
