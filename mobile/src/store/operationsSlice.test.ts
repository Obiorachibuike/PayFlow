import { configureStore } from '@reduxjs/toolkit';
import { ApiError } from '../services/client';
import operationsReducer, {
  clearIdempotencyKey,
  sendTransfer,
  setIdempotencyKey,
} from './slices/operationsSlice';

const mockSend = jest.fn();
type SendCall = [unknown, string];
const calls = () => mockSend.mock.calls as unknown as SendCall[];

jest.mock('../services/api', () => ({
  transfersApi: {
    send: (...args: unknown[]) => mockSend(...args),
  },
  withdrawalsApi: { create: jest.fn() },
  paymentsApi: { initialize: jest.fn(), verify: jest.fn(), demoConfirm: jest.fn() },
}));

const TRANSFER_INPUT = {
  recipient: { email: 'tunde@payflow.demo' },
  amountMinor: 150_000,
  pin: '1234',
};

const TRANSFER_RESPONSE = {
  transaction: {
    id: 'tx-1',
    reference: 'PF-TRF-1',
    status: 'SUCCESSFUL',
    type: 'TRANSFER_OUT' as const,
    direction: 'out' as const,
    amountMinor: 150_000,
    recipientName: 'Tunde',
    createdAt: new Date().toISOString(),
  },
  walletBalanceMinor: 850_000,
  receipt: {
    reference: 'PF-TRF-1',
    status: 'SUCCESSFUL',
    type: 'TRANSFER_OUT',
    direction: 'out',
    amountMinor: 150_000,
    amountFormatted: '₦1,500.00',
    currency: 'NGN',
    title: 'Transfer to Tunde',
    counterparty: 'Tunde',
    createdAt: new Date().toISOString(),
    simulated: true,
  },
};

function makeStore() {
  return configureStore({ reducer: { operations: operationsReducer } });
}

describe('operationsSlice idempotency', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('mints a key, keeps it across a failed attempt and clears it after success', async () => {
    const store = makeStore();

    // First attempt fails after leaving the server (the response never arrives).
    mockSend.mockRejectedValueOnce(new ApiError(500, 'SERVER_ERROR', 'Network hiccup'));
    await store.dispatch(sendTransfer(TRANSFER_INPUT));

    const firstKey = calls()[0]?.[1];
    expect(firstKey).toMatch(/\S/);
    expect(store.getState().operations.pendingIdempotencyKeys['transfers.create']).toBe(firstKey);

    // The retry must reuse the same key: a transfer that actually succeeded
    // server-side is replayed instead of executed twice.
    mockSend.mockResolvedValueOnce(TRANSFER_RESPONSE);
    await store.dispatch(sendTransfer(TRANSFER_INPUT));

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(calls()[1]?.[1]).toBe(firstKey);
    expect(store.getState().operations.pendingIdempotencyKeys['transfers.create']).toBeUndefined();
    expect(store.getState().operations.lastTransfer).not.toBeNull();
  });

  it('honours a key that was supplied outside the thunk', async () => {
    const store = makeStore();
    store.dispatch(setIdempotencyKey({ scope: 'transfers.create', key: 'fixed-key' }));
    mockSend.mockResolvedValueOnce(TRANSFER_RESPONSE);

    await store.dispatch(sendTransfer(TRANSFER_INPUT));

    expect(calls()[0]?.[1]).toBe('fixed-key');
  });

  it('clears a key on demand', () => {
    const store = makeStore();
    store.dispatch(setIdempotencyKey({ scope: 'withdrawals.create', key: 'k' }));
    store.dispatch(clearIdempotencyKey('withdrawals.create'));
    expect(store.getState().operations.pendingIdempotencyKeys['withdrawals.create']).toBeUndefined();
  });
});
