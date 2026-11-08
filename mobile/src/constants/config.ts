import Constants from 'expo-constants';

/**
 * Runtime configuration.
 *
 * `EXPO_PUBLIC_API_BASE_URL` is inlined at build time (see app.config.js). The
 * mobile client never holds a Paystack secret key — funding is initialised by
 * the backend and the app only ever receives a hosted checkout URL.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string; demoMode?: boolean };

export const API_BASE_URL: string = extra.apiBaseUrl ?? 'http://localhost:4000';

export const API_URL = `${API_BASE_URL.replace(/\/$/, '')}/api`;

export const DEMO_MODE = extra.demoMode !== false;

export const APP = {
  name: 'PayFlow',
  currency: 'NGN',
  currencySymbol: '₦',
  minTransferMinor: 1_000,
  maxTransferMinor: 50_000_000,
  minFundingMinor: 10_000,
  maxFundingMinor: 100_000_000,
  minWithdrawalMinor: 10_000,
  maxWithdrawalMinor: 50_000_000,
} as const;

export const TIMEOUTS = {
  requestMs: 20_000,
} as const;

/**
 * PayFlow is a portfolio demo: every naira in the app is simulated or sandbox
 * money. This banner text is surfaced in the UI so nobody mistakes it for a
 * licensed financial product.
 */
export const DEMO_NOTICE =
  'Demo environment. PayFlow is a portfolio project — every balance, transfer and payout is simulated or runs on Paystack test keys. No real money moves.';
