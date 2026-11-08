import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { paymentsApi, transfersApi, withdrawalsApi } from '../../services/api';
import { ApiError } from '../../services/client';
import { uuid } from '../../utils/id';
import type {
  InitializeFundingResult,
  RecipientLookup,
  Transaction,
  TransferReceipt,
  VerifyFundingResult,
  WithdrawalResponse,
} from '../../types/api';

export interface OperationsState {
  sending: boolean;
  withdrawing: boolean;
  funding: boolean;
  verifying: boolean;
  looking: boolean;
  lastTransfer: TransferReceipt | null;
  lastWithdrawal: WithdrawalResponse | null;
  lastFunding: InitializeFundingResult | null;
  lastVerification: VerifyFundingResult | null;
  lastTransaction: Transaction | null;
  lookup: RecipientLookup | null;
  error: string | null;
  errorCode: string | null;
  /** Kept until the money actually moves so a retry cannot double-charge. */
  pendingIdempotencyKeys: Record<string, string>;
}

const initialState: OperationsState = {
  sending: false,
  withdrawing: false,
  funding: false,
  verifying: false,
  looking: false,
  lastTransfer: null,
  lastWithdrawal: null,
  lastFunding: null,
  lastVerification: null,
  lastTransaction: null,
  lookup: null,
  error: null,
  errorCode: null,
  pendingIdempotencyKeys: {},
};

function failure(error: unknown): { message: string; code: string | null } {
  if (error instanceof ApiError) return { message: error.message, code: error.code };
  if (error instanceof Error) return { message: error.message, code: null };
  return { message: 'Something went wrong. Please try again.', code: null };
}

export const lookupRecipient = createAsyncThunk<
  RecipientLookup,
  { email?: string; phone?: string; walletTag?: string },
  { rejectValue: { message: string; code: string | null } }
>('operations/lookup', async (recipient, { rejectWithValue }) => {
  try {
    const result = await transfersApi.resolveRecipient(recipient);
    return result.recipient;
  } catch (error) {
    return rejectWithValue(failure(error));
  }
});

export interface SendTransferInput {
  recipient: { email?: string; phone?: string; walletTag?: string };
  amountMinor: number;
  description?: string;
  pin: string;
}

export const sendTransfer = createAsyncThunk<
  TransferReceipt,
  SendTransferInput,
  { rejectValue: { message: string; code: string | null } }
>('operations/sendTransfer', async (input, { rejectWithValue }) => {
  // A fresh key per attempt keeps a retry from creating a second transfer.
  const key = uuid();
  try {
    return await transfersApi.send(input, key);
  } catch (error) {
    return rejectWithValue(failure(error));
  }
});

export interface WithdrawInput {
  amountMinor: number;
  beneficiaryId?: string;
  bankCode?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  narration?: string;
  pin: string;
}

export const withdraw = createAsyncThunk<
  WithdrawalResponse,
  WithdrawInput,
  { rejectValue: { message: string; code: string | null } }
>('operations/withdraw', async (input, { rejectWithValue }) => {
  try {
    return await withdrawalsApi.create(input, uuid());
  } catch (error) {
    return rejectWithValue(failure(error));
  }
});

export const initializeFunding = createAsyncThunk<
  InitializeFundingResult,
  { amountMinor: number; channel: 'PAYSTACK' | 'DEMO'; simulate?: 'success' | 'failure' },
  { rejectValue: { message: string; code: string | null } }
>('operations/initializeFunding', async (input, { rejectWithValue }) => {
  try {
    // Funding is idempotent server-side: a retry with the same key cannot create
    // a second payment intent.
    return await paymentsApi.initialize(input, uuid());
  } catch (error) {
    return rejectWithValue(failure(error));
  }
});

/**
 * Re-checks a payment with the server. The wallet is only credited by the
 * backend after it confirms status, amount and currency with the provider, so
 * this never trusts the mobile callback.
 */
export const verifyFunding = createAsyncThunk<
  VerifyFundingResult,
  string,
  { rejectValue: { message: string; code: string | null } }
>('operations/verifyFunding', async (reference, { rejectWithValue }) => {
  try {
    return await paymentsApi.verify(reference);
  } catch (error) {
    return rejectWithValue(failure(error));
  }
});

export const confirmDemoFunding = createAsyncThunk<
  VerifyFundingResult,
  string,
  { rejectValue: { message: string; code: string | null } }
>('operations/confirmDemoFunding', async (reference, { rejectWithValue }) => {
  try {
    return await paymentsApi.demoConfirm(reference);
  } catch (error) {
    return rejectWithValue(failure(error));
  }
});

const operationsSlice = createSlice({
  name: 'operations',
  initialState,
  reducers: {
    clearOperationError(state) {
      state.error = null;
      state.errorCode = null;
    },
    clearLookup(state) {
      state.lookup = null;
    },
    clearLastResults(state) {
      state.lastTransfer = null;
      state.lastWithdrawal = null;
      state.lastFunding = null;
      state.lastVerification = null;
      state.lastTransaction = null;
    },
    resetOperations: () => initialState,
  },
  extraReducers: (builder) => {
    const fail = (
      state: OperationsState,
      action: PayloadAction<{ message: string; code: string | null } | undefined>,
    ) => {
      state.sending = false;
      state.withdrawing = false;
      state.funding = false;
      state.verifying = false;
      state.looking = false;
      state.error = action.payload?.message ?? 'Something went wrong.';
      state.errorCode = action.payload?.code ?? null;
    };

    builder
      .addCase(lookupRecipient.pending, (state) => {
        state.looking = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(lookupRecipient.fulfilled, (state, action) => {
        state.looking = false;
        state.lookup = action.payload;
      })
      .addCase(lookupRecipient.rejected, fail)
      .addCase(sendTransfer.pending, (state) => {
        state.sending = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(sendTransfer.fulfilled, (state, action) => {
        state.sending = false;
        state.lastTransfer = action.payload;
      })
      .addCase(sendTransfer.rejected, fail)
      .addCase(withdraw.pending, (state) => {
        state.withdrawing = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(withdraw.fulfilled, (state, action) => {
        state.withdrawing = false;
        state.lastWithdrawal = action.payload;
      })
      .addCase(withdraw.rejected, fail)
      .addCase(initializeFunding.pending, (state) => {
        state.funding = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(initializeFunding.fulfilled, (state, action) => {
        state.funding = false;
        state.lastFunding = action.payload;
      })
      .addCase(initializeFunding.rejected, fail)
      .addCase(verifyFunding.pending, (state) => {
        state.verifying = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(verifyFunding.fulfilled, (state, action) => {
        state.verifying = false;
        state.lastVerification = action.payload;
        state.lastTransaction = action.payload.transaction;
      })
      .addCase(verifyFunding.rejected, fail)
      .addCase(confirmDemoFunding.pending, (state) => {
        state.verifying = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(confirmDemoFunding.fulfilled, (state, action) => {
        state.verifying = false;
        state.lastVerification = action.payload;
        state.lastTransaction = action.payload.transaction;
      })
      .addCase(confirmDemoFunding.rejected, fail);
  },
});

export const { clearOperationError, clearLookup, clearLastResults, resetOperations } = operationsSlice.actions;

export default operationsSlice.reducer;
