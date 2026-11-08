import { http } from './client';
import type {
  AuthUser,
  InitializeFundingResult,
  TransferReceipt,
  VerifyFundingResult,
  WithdrawalResponse,
  Bank,
  Beneficiary,
  DeviceSession,
  FailedOperation,
  Notification,
  ProfileResponse,
  Receipt,
  RecipientLookup,
  Transaction,
  Wallet,
  WalletBalance,
} from '../types/api';

export interface DeviceContext {
  deviceId: string;
  deviceName?: string;
  platform?: 'ios' | 'android' | 'web';
  appVersion?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  device: DeviceContext;
}

export interface VerifyDemoCode {
  /** Only ever returned while the backend runs in DEMO_MODE. */
  demoCode?: string;
  expiresAt?: string;
}

export const authApi = {
  register: (input: RegisterInput) =>
    http.post<{ user: AuthUser; tokens: AuthTokens; wallet: Wallet; verification: VerifyDemoCode }>(
      '/auth/register',
      input,
    ),
  login: (input: { email: string; password: string; device: DeviceContext }) =>
    http.post<{ user: AuthUser; tokens: AuthTokens; wallet: Wallet }>('/auth/login', input, { skipAuth: true }),
  refresh: (refreshToken: string) =>
    http.post<AuthTokens>('/auth/refresh', { refreshToken }, { skipAuth: true }),
  logout: (refreshToken: string) => http.post<{ success: boolean }>('/auth/logout', { refreshToken }),
  verifyEmail: (code: string) =>
    http.post<{ user: AuthUser; verified: boolean; verification?: VerifyDemoCode }>('/auth/verify-email', {
      code,
    }),
  resendVerification: () =>
    http.post<{ sent: boolean; verification?: VerifyDemoCode }>('/auth/resend-verification', {}),
  forgotPassword: (email: string) =>
    http.post<{ sent: boolean; resetToken?: string; verification?: VerifyDemoCode }>(
      '/auth/forgot-password',
      { email },
      { skipAuth: true },
    ),
  resetPassword: (input: { token: string; password: string; confirmPassword: string }) =>
    http.post<{ success: boolean }>('/auth/reset-password', input, { skipAuth: true }),
};

export const walletApi = {
  get: () => http.get<{ wallet: Wallet; stats: WalletStatsLite; recentTransactions: Transaction[] }>('/wallet'),
  balance: () => http.get<WalletBalance>('/wallet/balance'),
  transactions: (query?: { limit?: number; cursor?: string; direction?: 'ALL' | 'in' | 'out'; status?: string }) =>
    http.withMeta<Transaction[]>('/wallet/transactions', { query }),
  ledger: (limit = 50) => http.withMeta<LedgerEntry[]>('/wallet/ledger', { query: { limit } }),
};

export interface WalletStatsLite {
  totalReceivedMinor: number;
  totalReceivedFormatted: string;
  totalSentMinor: number;
  totalSentFormatted: string;
  monthSpentMinor: number;
  monthSpentFormatted: string;
  monthReceivedMinor: number;
  monthReceivedFormatted: string;
  pendingOutMinor: number;
  pendingOutFormatted: string;
  transactionCount: number;
}

export interface LedgerEntry {
  id: string;
  direction: 'DEBIT' | 'CREDIT';
  amountMinor: number;
  amountFormatted: string;
  description: string | null;
  reference: string | null;
  type: string;
  createdAt: string;
}

export const transactionsApi = {
  list: (query?: {
    limit?: number;
    cursor?: string;
    status?: string;
    type?: string;
    direction?: 'ALL' | 'in' | 'out';
    search?: string;
  }) => http.withMeta<Transaction[]>('/transactions', { query }),
  get: (id: string) => http.get<Transaction>(`/transactions/${id}`),
  receipt: (id: string) => http.get<Receipt>(`/transactions/${id}/receipt`),
  /** Local record of an operation that failed or is still pending in the UI. */
  failures: () => [] as FailedOperation[],
};

export const transfersApi = {
  /** Resolves an email, phone or wallet tag to a PayFlow recipient. */
  resolveRecipient: (recipient: { email?: string; phone?: string; walletTag?: string }) =>
    http.post<{ recipient: RecipientLookup }>('/transfers/resolve-recipient', recipient),
  send: (
    input: {
      recipient: { email?: string; phone?: string; walletTag?: string };
      amountMinor: number;
      description?: string;
      pin: string;
    },
    idempotencyKey: string,
  ) => http.post<TransferReceipt>('/transfers', input, { idempotencyKey }),
};

export const paymentsApi = {
  initialize: (
    input: { amountMinor: number; channel: 'PAYSTACK' | 'DEMO'; simulate?: 'success' | 'failure' },
    idempotencyKey: string,
  ) => http.post<InitializeFundingResult>('/payments/initialize', input, { idempotencyKey }),
  verify: (reference: string) => http.get<VerifyFundingResult>(`/payments/verify/${reference}`),
  demoConfirm: (reference: string) =>
    http.post<VerifyFundingResult>('/payments/demo/confirm', { reference }),
  /**
   * Funding is *never* credited from the mobile callback. This only asks the
   * server to re-verify the reference with Paystack; the wallet moves only when
   * the server confirms status, amount and currency.
   */
  confirm: (reference: string) => paymentsApi.verify(reference),
};

export const withdrawalsApi = {
  create: (
    input: {
      amountMinor: number;
      beneficiaryId?: string;
      bankCode?: string;
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
      narration?: string;
      pin: string;
    },
    idempotencyKey: string,
  ) => http.post<WithdrawalResponse>('/withdrawals', input, { idempotencyKey }),
  list: (limit = 20) => http.withMeta<Array<Record<string, unknown>>>('/withdrawals', { query: { limit } }),
};

export const beneficiariesApi = {
  list: () => http.withMeta<Beneficiary[]>('/beneficiaries'),
  banks: () => http.withMeta<Bank[]>('/banks'),
  create: (input: { bankCode: string; accountNumber: string; accountName: string; isDefault?: boolean }) =>
    http.post<Beneficiary>('/beneficiaries', input),
  update: (id: string, input: { accountName?: string; isDefault?: boolean }) =>
    http.patch<Beneficiary>(`/beneficiaries/${id}`, input),
  remove: (id: string) => http.delete<{ success: boolean }>(`/beneficiaries/${id}`),
  resolveAccount: (accountNumber: string, bankCode: string) =>
    http.post<{
      accountNumber: string;
      resolvedName: string;
      verificationStatus: 'SIMULATED';
      note: string;
      bankCode: string;
    }>('/beneficiaries/resolve-account', { accountNumber, bankCode }),
};

export const notificationsApi = {
  list: (query?: { limit?: number; cursor?: string; unreadOnly?: boolean }) =>
    http.withMeta<Notification[]>('/notifications', { query }),
  markRead: (id: string) => http.patch<Notification>(`/notifications/${id}/read`, {}),
  markAllRead: () => http.post<{ updated: number }>('/notifications/read-all', {}),
  registerPushToken: (pushToken: string) =>
    http.post<{ registered: boolean }>('/notifications/push-token', { pushToken }),
};

export const profileApi = {
  get: () => http.get<ProfileResponse>('/profile'),
  update: (input: {
    fullName?: string;
    avatarColor?: string;
    themePreference?: 'SYSTEM' | 'LIGHT' | 'DARK';
    biometricEnabled?: boolean;
    notifyPush?: boolean;
    notifyEmail?: boolean;
    notifySecurity?: boolean;
  }) => http.patch<{ user: AuthUser }>('/profile', input),
  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    http.patch<{ success: boolean; reauthenticate: boolean }>('/profile/password', input),
  changePin: (input: { newPin: string; currentPin?: string; password?: string }) =>
    http.patch<{ success: boolean; pinConfigured: boolean; changed: boolean }>('/profile/pin', input),
  setBiometrics: (enabled: boolean) =>
    http.post<{ success: boolean; biometricEnabled: boolean }>('/profile/biometrics', { enabled }),
  sessions: () => http.withMeta<DeviceSession[]>('/profile/sessions'),
  revokeSession: (id: string) => http.delete<{ success: boolean }>(`/profile/sessions/${id}`),
};
