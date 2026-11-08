import { env } from '../config/env';
import type {
  Beneficiary,
  DeviceSession,
  Notification,
  Payment,
  Transaction,
  User,
  Wallet,
} from '../db/schema';
import { formatNaira, toApiAmount } from './money';

export const APP_BRAND = {
  name: 'PayFlow',
  tagline: 'Your money. Your control. Your flow.',
  supportEmail: 'support@payflow.demo',
  currency: 'NGN',
} as const;

export function maskWalletTag(walletTag: string): string {
  const digits = walletTag.replace(/\D/g, '');
  if (digits.length < 4) return 'PF-****-****';
  return `PF-****-${digits.slice(-4)}`;
}

export function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function serializeUser(user: User) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    initials: initialsOf(user.fullName),
    avatarColor: user.avatarColor,
    status: user.status,
    kycStatus: user.kycStatus,
    emailVerified: Boolean(user.emailVerifiedAt),
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    biometricEnabled: user.biometricEnabled,
    themePreference: user.themePreference,
    notifications: {
      push: user.notifyPush,
      email: user.notifyEmail,
      security: user.notifySecurity,
    },
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export function serializeWallet(wallet: Wallet, accountName: string) {
  return {
    id: wallet.id,
    walletTag: wallet.walletTag,
    maskedWalletTag: maskWalletTag(wallet.walletTag),
    accountName,
    currency: wallet.currency,
    balanceMinor: toApiAmount(wallet.balanceMinor),
    balanceFormatted: formatNaira(wallet.balanceMinor, { currency: wallet.currency }),
    status: wallet.status,
    lastActivityAt: wallet.lastActivityAt,
    createdAt: wallet.createdAt,
  };
}

export type TransactionDirection = 'in' | 'out';

export interface TransactionViewer {
  walletIds: Set<string>;
  userId: string;
}

export function directionFor(transaction: Transaction, viewer: TransactionViewer): TransactionDirection {
  if (transaction.recipientWalletId && viewer.walletIds.has(transaction.recipientWalletId)) return 'in';
  if (transaction.senderWalletId && viewer.walletIds.has(transaction.senderWalletId)) return 'out';
  return transaction.type === 'TRANSFER_IN' || transaction.type === 'FUNDING' ? 'in' : 'out';
}

function titleFor(transaction: Transaction, direction: TransactionDirection, withdrawalAccountName?: string | null): string {
  switch (transaction.type) {
    case 'FUNDING':
      return 'Wallet funding';
    case 'TRANSFER_IN':
      return transaction.senderName ? `Transfer from ${transaction.senderName}` : 'Transfer received';
    case 'TRANSFER_OUT':
      // One canonical journal row backs both sides of an internal transfer, so the
      // label follows the viewer's direction rather than the stored type.
      if (direction === 'in') {
        return transaction.senderName ? `Transfer from ${transaction.senderName}` : 'Transfer received';
      }
      return transaction.recipientName ? `Transfer to ${transaction.recipientName}` : 'Transfer sent';
    case 'WITHDRAWAL':
      return withdrawalAccountName ? `Withdrawal to ${withdrawalAccountName}` : 'Withdrawal';
    case 'REFUND':
      return 'Refund';
    case 'PAYMENT':
      return 'Payment';
    case 'ADJUSTMENT':
      return 'Adjustment';
    default:
      return direction === 'in' ? 'Money in' : 'Money out';
  }
}

export interface SerializeTransactionOptions {
  withdrawalAccountName?: string | null;
  viewerWalletIds?: Set<string>;
}

export function serializeTransaction(transaction: Transaction, options: SerializeTransactionOptions = {}) {
  const viewer: TransactionViewer = {
    walletIds: options.viewerWalletIds ?? new Set(),
    userId: transaction.initiatedByUserId,
  };
  const direction = directionFor(transaction, viewer);
  const signed =
    direction === 'in'
      ? transaction.amountMinor
      : -transaction.amountMinor;

  const counterparty =
    direction === 'in'
      ? transaction.senderName ?? null
      : transaction.recipientName ?? options.withdrawalAccountName ?? null;

  return {
    id: transaction.id,
    reference: transaction.reference,
    type: transaction.type,
    status: transaction.status,
    direction,
    title: titleFor(transaction, direction, options.withdrawalAccountName),
    counterparty,
    description: transaction.description,
    amountMinor: toApiAmount(transaction.amountMinor),
    signedAmountMinor: toApiAmount(signed),
    amountFormatted: formatNaira(transaction.amountMinor, { currency: transaction.currency }),
    signedAmountFormatted: `${direction === 'in' ? '+' : '-'}${formatNaira(transaction.amountMinor, {
      currency: transaction.currency,
    })}`,
    feeMinor: toApiAmount(transaction.feeMinor),
    currency: transaction.currency,
    senderName: transaction.senderName,
    recipientName: transaction.recipientName,
    failureReason: transaction.failureReason,
    createdAt: transaction.createdAt,
    completedAt: transaction.completedAt,
    metadata: transaction.metadata ?? null,
  };
}

export interface ReceiptOptions {
  transaction: Transaction;
  ledgerReference?: string | null;
  senderWalletTag?: string | null;
  recipientWalletTag?: string | null;
  withdrawal?: {
    bankName: string;
    accountName: string;
    accountNumberLast4: string;
    simulated: boolean;
  } | null;
  payment?: Payment | null;
}

export function serializeReceipt({
  transaction,
  ledgerReference,
  senderWalletTag,
  recipientWalletTag,
  withdrawal,
  payment,
}: ReceiptOptions) {
  const simulated =
    Boolean(withdrawal?.simulated) ||
    transaction.type === 'WITHDRAWAL' ||
    transaction.type === 'TRANSFER_IN' ||
    transaction.type === 'TRANSFER_OUT' ||
    (payment ? payment.provider === 'DEMO' : env.DEMO_MODE);

  return {
    id: transaction.id,
    reference: transaction.reference,
    issuedAt: transaction.completedAt ?? transaction.createdAt,
    branding: APP_BRAND,
    status: transaction.status,
    type: transaction.type,
    amountMinor: toApiAmount(transaction.amountMinor),
    amountFormatted: formatNaira(transaction.amountMinor, { currency: transaction.currency }),
    feeMinor: toApiAmount(transaction.feeMinor),
    currency: transaction.currency,
    description: transaction.description ?? null,
    sender: {
      name: transaction.senderName ?? 'PayFlow',
      walletTag: senderWalletTag ? maskWalletTag(senderWalletTag) : null,
    },
    recipient: {
      name: withdrawal?.accountName ?? transaction.recipientName ?? 'PayFlow wallet',
      walletTag: recipientWalletTag ? maskWalletTag(recipientWalletTag) : null,
      bankName: withdrawal?.bankName ?? null,
      accountNumberMasked: withdrawal ? `******${withdrawal.accountNumberLast4}` : null,
    },
    ledgerReference: ledgerReference ?? null,
    channel: payment?.provider ?? null,
    providerReference: payment?.providerReference ?? null,
    environment: env.PAYSTACK_SECRET_KEY?.startsWith('sk_test') ? 'SANDBOX' : 'DEMO',
    simulated,
    disclaimer: simulated
      ? 'Simulated transaction. PayFlow operates with sandbox funds only — no real money moved.'
      : 'Sandbox payment. Processed in the PayFlow demo environment.',
  };
}

export function serializeNotification(notification: Notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data ?? null,
    read: Boolean(notification.readAt),
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

export function serializeBeneficiary(beneficiary: Beneficiary) {
  return {
    id: beneficiary.id,
    bankCode: beneficiary.bankCode,
    bankName: beneficiary.bankName,
    accountName: beneficiary.accountName,
    accountNumberMasked: `******${beneficiary.accountNumberLast4}`,
    accountNumberLast4: beneficiary.accountNumberLast4,
    verificationStatus: beneficiary.verifiedStatus,
    verified: beneficiary.verifiedStatus === 'VERIFIED',
    isDefault: beneficiary.isDefault,
    createdAt: beneficiary.createdAt,
    updatedAt: beneficiary.updatedAt,
  };
}

export function serializeDeviceSession(session: DeviceSession, currentSessionId?: string) {
  return {
    id: session.id,
    deviceId: session.deviceId,
    deviceName: session.deviceName ?? 'Unknown device',
    platform: session.platform,
    appVersion: session.appVersion,
    biometricEnabled: session.biometricEnabled,
    lastActiveAt: session.lastActiveAt,
    createdAt: session.createdAt,
    revoked: Boolean(session.revokedAt),
    current: session.id === currentSessionId,
  };
}

export function serializePayment(payment: Payment) {
  return {
    id: payment.id,
    reference: payment.reference,
    provider: payment.provider,
    providerReference: payment.providerReference,
    status: payment.status,
    amountMinor: toApiAmount(payment.amountMinor),
    amountFormatted: formatNaira(payment.amountMinor, { currency: payment.currency }),
    currency: payment.currency,
    channel: payment.channel,
    authorizationUrl: payment.authorizationUrl,
    paidAt: payment.paidAt,
    verifiedAt: payment.verifiedAt,
    createdAt: payment.createdAt,
  };
}
