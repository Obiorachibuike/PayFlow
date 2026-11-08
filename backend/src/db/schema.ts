/**
 * PayFlow database schema — PostgreSQL via Drizzle ORM.
 *
 * Money: every monetary column is BIGINT in MINOR UNITS (kobo for NGN).
 *        Never floating point, never a numeric with decimals.
 *
 * Ledger: `ledger_entries` is append-only. Immutability is enforced by a
 *         PostgreSQL trigger added in the init migration. Wallet balances are
 *         projections that are only mutated inside the same DB transaction that
 *         appends balanced ledger entries.
 */
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'SUSPENDED', 'CLOSED']);
export const kycStatusEnum = pgEnum('kyc_status', ['UNVERIFIED', 'PENDING', 'VERIFIED']);
export const walletStatusEnum = pgEnum('wallet_status', ['ACTIVE', 'FROZEN', 'CLOSED']);
export const transactionTypeEnum = pgEnum('transaction_type', [
  'FUNDING',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'WITHDRAWAL',
  'REFUND',
  'PAYMENT',
  'ADJUSTMENT',
]);
export const transactionStatusEnum = pgEnum('transaction_status', [
  'PENDING',
  'PROCESSING',
  'SUCCESSFUL',
  'FAILED',
  'REVERSED',
]);
export const ledgerAccountTypeEnum = pgEnum('ledger_account_type', [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
]);
export const entryDirectionEnum = pgEnum('entry_direction', ['DEBIT', 'CREDIT']);
export const paymentChannelEnum = pgEnum('payment_channel', ['PAYSTACK', 'DEMO']);
export const paymentStatusEnum = pgEnum('payment_status', [
  'PENDING',
  'SUCCESSFUL',
  'FAILED',
  'ABANDONED',
]);
export const verificationStatusEnum = pgEnum('verification_status', [
  'UNVERIFIED',
  'PENDING',
  'VERIFIED',
  'SIMULATED',
  'FAILED',
]);
export const otpTypeEnum = pgEnum('otp_type', [
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'PHONE_VERIFICATION',
  'LOGIN_2FA',
]);
export const notificationTypeEnum = pgEnum('notification_type', [
  'WALLET_FUNDED',
  'TRANSFER_RECEIVED',
  'TRANSFER_SENT',
  'WITHDRAWAL_PROCESSED',
  'TRANSACTION_FAILED',
  'TRANSACTION_PENDING',
  'SECURITY_ALERT',
  'SYSTEM',
]);
export const webhookStatusEnum = pgEnum('webhook_status', [
  'RECEIVED',
  'PROCESSED',
  'IGNORED',
  'FAILED',
]);
export const themePreferenceEnum = pgEnum('theme_preference', ['SYSTEM', 'LIGHT', 'DARK']);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    phone: text('phone').notNull().unique(),
    fullName: text('full_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true }).notNull().defaultNow(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    kycStatus: kycStatusEnum('kyc_status').notNull().default('UNVERIFIED'),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    avatarColor: text('avatar_color').notNull().default('#39FF14'),
    themePreference: themePreferenceEnum('theme_preference').notNull().default('SYSTEM'),
    biometricEnabled: boolean('biometric_enabled').notNull().default(false),
    notifyPush: boolean('notify_push').notNull().default(true),
    notifyEmail: boolean('notify_email').notNull().default(true),
    notifySecurity: boolean('notify_security').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('idx_users_status').on(t.status), index('idx_users_created_at').on(t.createdAt)],
);

export const transactionPins = pgTable('transaction_pins', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  pinHash: text('pin_hash').notNull(),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const deviceSessions = pgTable(
  'device_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    deviceName: text('device_name'),
    platform: text('platform'),
    appVersion: text('app_version'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    biometricEnabled: boolean('biometric_enabled').notNull().default(false),
    pushToken: text('push_token'),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_device_sessions_user_device').on(t.userId, t.deviceId),
    index('idx_device_sessions_user_revoked').on(t.userId, t.revokedAt),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    familyId: uuid('family_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceSessionId: uuid('device_session_id').references(() => deviceSessions.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    replacedByHash: text('replaced_by_hash'),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_refresh_tokens_user_revoked').on(t.userId, t.revokedAt),
    index('idx_refresh_tokens_family').on(t.familyId),
    index('idx_refresh_tokens_expires').on(t.expiresAt),
  ],
);

export const otpTokens = pgTable(
  'otp_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: otpTypeEnum('type').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_otp_tokens_user_type').on(t.userId, t.type),
    index('idx_otp_tokens_expires').on(t.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Wallet & ledger
// ---------------------------------------------------------------------------

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    type: ledgerAccountTypeEnum('type').notNull(),
    currency: text('currency').notNull().default('NGN'),
    balanceMinor: bigint('balance_minor', { mode: 'bigint' }).notNull().default(sql`0`),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_ledger_accounts_type').on(t.type)],
);

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull().default('NGN'),
    walletTag: text('wallet_tag').notNull().unique(),
    balanceMinor: bigint('balance_minor', { mode: 'bigint' }).notNull().default(sql`0`),
    status: walletStatusEnum('status').notNull().default('ACTIVE'),
    ledgerAccountId: uuid('ledger_account_id')
      .notNull()
      .unique()
      .references(() => ledgerAccounts.id),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_wallets_user_currency').on(t.userId, t.currency),
    index('idx_wallets_status').on(t.status),
  ],
);

export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference').notNull().unique(),
    transactionId: uuid('transaction_id').unique(),
    type: transactionTypeEnum('type').notNull(),
    description: text('description').notNull(),
    currency: text('currency').notNull().default('NGN'),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_ledger_transactions_posted').on(t.postedAt), index('idx_ledger_transactions_type').on(t.type)],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ledgerTransactionId: uuid('ledger_transaction_id')
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: 'restrict' }),
    ledgerAccountId: uuid('ledger_account_id')
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: 'restrict' }),
    direction: entryDirectionEnum('direction').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull().default('NGN'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ledger_entries_account').on(t.ledgerAccountId, t.createdAt),
    index('idx_ledger_entries_transaction').on(t.ledgerTransactionId),
  ],
);

// ---------------------------------------------------------------------------
// Transactions (canonical journal) + typed records
// ---------------------------------------------------------------------------

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference').notNull().unique(),
    type: transactionTypeEnum('type').notNull(),
    status: transactionStatusEnum('status').notNull().default('PENDING'),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    feeMinor: bigint('fee_minor', { mode: 'bigint' }).notNull().default(sql`0`),
    currency: text('currency').notNull().default('NGN'),
    description: text('description'),
    senderWalletId: uuid('sender_wallet_id').references(() => wallets.id),
    recipientWalletId: uuid('recipient_wallet_id').references(() => wallets.id),
    senderName: text('sender_name'),
    recipientName: text('recipient_name'),
    initiatedByUserId: uuid('initiated_by_user_id')
      .notNull()
      .references(() => users.id),
    failureReason: text('failure_reason'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_transactions_sender').on(t.senderWalletId, t.createdAt),
    index('idx_transactions_recipient').on(t.recipientWalletId, t.createdAt),
    index('idx_transactions_initiator').on(t.initiatedByUserId, t.createdAt),
    index('idx_transactions_status').on(t.status, t.createdAt),
    index('idx_transactions_type').on(t.type, t.createdAt),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference').notNull().unique(),
    transactionId: uuid('transaction_id')
      .unique()
      .references(() => transactions.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    provider: paymentChannelEnum('provider').notNull(),
    providerReference: text('provider_reference'),
    status: paymentStatusEnum('status').notNull().default('PENDING'),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull().default('NGN'),
    authorizationUrl: text('authorization_url'),
    accessCode: text('access_code'),
    channel: text('channel'),
    gatewayResponse: text('gateway_response'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifyPayload: jsonb('verify_payload').$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_payments_user').on(t.userId, t.createdAt),
    index('idx_payments_status').on(t.status),
    index('idx_payments_provider_reference').on(t.providerReference),
  ],
);

export const transfers = pgTable(
  'transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .unique()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id),
    fromWalletId: uuid('from_wallet_id')
      .notNull()
      .references(() => wallets.id),
    toWalletId: uuid('to_wallet_id')
      .notNull()
      .references(() => wallets.id),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_transfers_sender').on(t.senderUserId, t.createdAt),
    index('idx_transfers_recipient').on(t.recipientUserId, t.createdAt),
  ],
);

export const beneficiaries = pgTable(
  'beneficiaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bankCode: text('bank_code').notNull(),
    bankName: text('bank_name').notNull(),
    accountNumber: text('account_number').notNull(),
    accountNumberLast4: text('account_number_last4').notNull(),
    accountName: text('account_name').notNull(),
    verifiedStatus: verificationStatusEnum('verified_status').notNull().default('UNVERIFIED'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_beneficiaries_user_bank_account').on(t.userId, t.bankCode, t.accountNumber),
    index('idx_beneficiaries_user').on(t.userId, t.deletedAt),
  ],
);

export const withdrawals = pgTable(
  'withdrawals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .unique()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id),
    beneficiaryId: uuid('beneficiary_id').references(() => beneficiaries.id),
    bankName: text('bank_name').notNull(),
    bankCode: text('bank_code').notNull(),
    accountName: text('account_name').notNull(),
    accountNumberLast4: text('account_number_last4').notNull(),
    simulated: boolean('simulated').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_withdrawals_user').on(t.userId, t.createdAt)],
);

export const banks = pgTable('banks', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Platform / operations
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_notifications_user_created').on(t.userId, t.createdAt),
    index('idx_notifications_user_read').on(t.userId, t.readAt),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_audit_logs_actor').on(t.actorUserId, t.createdAt),
    index('idx_audit_logs_action').on(t.action, t.createdAt),
  ],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: paymentChannelEnum('provider').notNull(),
    eventId: text('event_id').notNull().unique(),
    eventType: text('event_type'),
    signatureValid: boolean('signature_valid').notNull().default(false),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: webhookStatusEnum('status').notNull().default('RECEIVED'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(1),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_webhook_events_provider').on(t.provider, t.createdAt), index('idx_webhook_events_status').on(t.status)],
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code').notNull().default(0),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    resourceId: text('resource_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('uq_idempotency_user_scope_key').on(t.userId, t.scope, t.key),
    index('idx_idempotency_expires').on(t.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations (used by drizzle's relational query helper in a few places)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  wallets: many(wallets),
  notifications: many(notifications),
}));

export const walletsRelations = relations(wallets, ({ one }) => ({
  user: one(users, { fields: [wallets.userId], references: [users.id] }),
  ledgerAccount: one(ledgerAccounts, {
    fields: [wallets.ledgerAccountId],
    references: [ledgerAccounts.id],
  }),
}));

export const ledgerTransactionsRelations = relations(ledgerTransactions, ({ many, one }) => ({
  entries: many(ledgerEntries),
  transaction: one(transactions, {
    fields: [ledgerTransactions.transactionId],
    references: [transactions.id],
  }),
}));

// ---------------------------------------------------------------------------
// Enum value types
// ---------------------------------------------------------------------------
export type UserStatus = (typeof userStatusEnum.enumValues)[number];
export type KycStatus = (typeof kycStatusEnum.enumValues)[number];
export type WalletStatus = (typeof walletStatusEnum.enumValues)[number];
export type TransactionType = (typeof transactionTypeEnum.enumValues)[number];
export type TransactionStatus = (typeof transactionStatusEnum.enumValues)[number];
export type LedgerAccountType = (typeof ledgerAccountTypeEnum.enumValues)[number];
export type EntryDirection = (typeof entryDirectionEnum.enumValues)[number];
export type PaymentChannel = (typeof paymentChannelEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type VerificationStatus = (typeof verificationStatusEnum.enumValues)[number];
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;
export type LedgerAccount = typeof ledgerAccounts.$inferSelect;
export type LedgerTransaction = typeof ledgerTransactions.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type Beneficiary = typeof beneficiaries.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Bank = typeof banks.$inferSelect;
export type DeviceSession = typeof deviceSessions.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type TransactionPin = typeof transactionPins.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type IdempotencyRecord = typeof idempotencyRecords.$inferSelect;
