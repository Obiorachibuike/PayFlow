/** Shapes returned by the PayFlow API. Mirrors `backend/src/utils/serializers.ts`. */

export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown> | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

export interface Page<T> {
  items: T[];
  meta: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
    count?: number;
  };
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  initials: string;
  avatarColor: string;
  status: string;
  kycStatus: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  phoneVerified: boolean;
  biometricEnabled: boolean;
  themePreference: 'SYSTEM' | 'LIGHT' | 'DARK';
  notifications: { push: boolean; email: boolean; security: boolean };
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Wallet {
  id: string;
  walletTag: string;
  maskedWalletTag: string;
  accountName: string;
  currency: string;
  balanceMinor: number;
  balanceFormatted: string;
  status: string;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface WalletBalance {
  walletId: string;
  currency: string;
  balanceMinor: number;
  balanceFormatted: string;
  availableMinor: number;
  availableFormatted: string;
  pendingOutMinor: number;
  status: string;
  asOf: string;
}

export interface WalletStats {
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

export type TransactionType =
  | 'FUNDING'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'WITHDRAWAL'
  | 'REFUND'
  | 'PAYMENT'
  | 'ADJUSTMENT';

export type TransactionStatus = 'PENDING' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED' | 'REVERSED';

export interface Transaction {
  id: string;
  reference: string;
  type: TransactionType;
  status: TransactionStatus;
  direction: 'in' | 'out';
  title: string;
  counterparty: string | null;
  description: string | null;
  amountMinor: number;
  signedAmountMinor: number;
  amountFormatted: string;
  signedAmountFormatted: string;
  feeMinor: number;
  currency: string;
  senderName: string | null;
  recipientName: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
  metadata: Record<string, unknown> | null;
}

export interface Receipt {
  id: string;
  reference: string;
  issuedAt: string;
  status: TransactionStatus;
  type: TransactionType;
  amountMinor: number;
  amountFormatted: string;
  feeMinor: number;
  currency: string;
  branding: { name: string; tagline: string; supportEmail: string; currency: string };
  simulated: boolean;
  senderName: string | null;
  recipientName: string | null;
  senderWalletTag: string | null;
  recipientWalletTag: string | null;
  ledgerReference: string | null;
  narration: string | null;
  withdrawal?: {
    bankName: string;
    accountName: string;
    accountNumberLast4: string;
    simulated: boolean;
  } | null;
  payment?: { provider: string; channel: string | null; reference: string | null } | null;
}

export interface Beneficiary {
  id: string;
  bankCode: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  accountNumberLast4: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'SIMULATED';
  verified: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Bank {
  code: string;
  name: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface DeviceSession {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: string | null;
  appVersion: string | null;
  biometricEnabled: boolean;
  lastActiveAt: string;
  createdAt: string;
  revoked: boolean;
  current: boolean;
}

export interface Payment {
  id: string;
  reference: string;
  provider: 'PAYSTACK' | 'DEMO';
  providerReference: string | null;
  status: TransactionStatus;
  amountMinor: number;
  amountFormatted: string;
  currency: string;
  channel: string | null;
  authorizationUrl: string | null;
  paidAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface TransferResult {
  transactionId: string;
  transferId: string;
  reference: string;
  status: TransactionStatus;
  amountMinor: number;
  feeMinor: number;
  recipient: { name: string; walletTag: string };
  walletBalanceMinor: number;
  receipt: Receipt;
  createdAt: string;
}

export interface WithdrawalResult {
  transactionId: string;
  withdrawalId: string;
  reference: string;
  status: 'SUCCESSFUL';
  amountMinor: number;
  walletBalanceMinor: number;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  simulated: true;
  createdAt: string;
  receipt: Receipt;
}

export interface RecipientLookup {
  walletTag: string;
  maskedWalletTag: string;
  name: string;
  initials: string;
  avatarColor: string;
  verified: boolean;
}

export interface SecuritySummary {
  pinConfigured: boolean;
  pinLockedUntil: string | null;
  biometricEnabled: boolean;
  emailVerified: boolean;
  activeSessions: number;
  kycStatus: string;
}

export interface ProfileResponse {
  user: AuthUser;
  wallet: Wallet;
  stats: WalletStats;
  security: SecuritySummary;
}

export interface FailedOperation {
  id: string;
  kind: 'transfer' | 'withdrawal' | 'funding' | 'unknown';
  reference: string | null;
  amountMinor: number | null;
  message: string;
  createdAt: string;
  status: 'FAILED' | 'PENDING';
}

export interface InitializeFundingResult {
  reference: string;
  channel: 'PAYSTACK' | 'DEMO';
  status: string;
  amountMinor: number;
  amountFormatted: string;
  currency: string;
  authorizationUrl: string | null;
  accessCode: string | null;
  demo: boolean;
  message: string;
}

export interface VerifyFundingResult {
  reference: string;
  status: 'SUCCESSFUL' | 'FAILED' | 'PENDING';
  alreadyProcessed: boolean;
  credited: boolean;
  amountMinor: number;
  amountFormatted: string;
  currency: string;
  walletBalanceMinor: number;
  walletBalanceFormatted: string;
  payment: Payment | null;
  transaction: Transaction | null;
  message: string;
}

export interface TransferReceipt {
  transaction: {
    id: string;
    reference: string;
    status: string;
    type: 'TRANSFER_OUT';
    direction: 'out';
    amountMinor: number;
    recipientName: string;
    createdAt: string;
  };
  walletBalanceMinor: number;
  receipt: Receipt;
}

export interface WithdrawalResponse {
  withdrawal: WithdrawalResult;
  receipt: Receipt;
}
