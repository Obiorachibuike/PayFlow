import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import type { Tx } from '../../db';
import { withTransaction } from '../../db/transaction';
import { payments, transactions, wallets, webhookEvents as webhookEventTable } from '../../db/schema';
import type { Payment } from '../../db/schema';
import { env, limits } from '../../config/env';
import { logger } from '../../config/logger';
import {
  AppError,
  ErrorCodes,
  badRequest,
  conflict,
  notFound,
  serviceUnavailable,
} from '../../utils/errors';
import { generateReference } from '../../utils/references';
import { formatNaira, toApiAmount } from '../../utils/money';
import { serializePayment, serializeTransaction } from '../../utils/serializers';
import { recordAudit } from '../audit/audit.service';
import { postLedgerTransaction, SYSTEM_LEDGER_ACCOUNTS } from '../ledger/ledger.service';
import { createNotification } from '../notifications/notifications.service';
import { getUserWalletIds } from '../transactions/transactions.service';
import { getWalletForUser, getWalletForUserInTx } from '../wallet/wallet.service';
import { getProvider, type ProviderName } from './providers';

export interface InitializePaymentParams {
  userId: string;
  email: string;
  amountMinor: bigint;
  channel: ProviderName;
  simulate?: 'success' | 'failure';
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface InitializePaymentResponse {
  reference: string;
  channel: ProviderName;
  status: string;
  amountMinor: number;
  amountFormatted: string;
  currency: string;
  authorizationUrl: string | null;
  accessCode: string | null;
  demo: boolean;
  message: string;
}

export async function initializePayment(params: InitializePaymentParams): Promise<InitializePaymentResponse> {
  const { amountMinor } = params;

  if (amountMinor < limits.minFundingMinor) {
    throw badRequest(ErrorCodes.LIMIT_EXCEEDED, `Minimum top-up is ${formatNaira(limits.minFundingMinor)}`);
  }
  if (amountMinor > limits.maxFundingMinor) {
    throw badRequest(ErrorCodes.LIMIT_EXCEEDED, `Maximum top-up is ${formatNaira(limits.maxFundingMinor)}`);
  }

  const wallet = await getWalletForUser(params.userId);
  if (wallet.status !== 'ACTIVE') {
    throw conflict(ErrorCodes.WALLET_FROZEN, 'Your wallet cannot be funded right now');
  }
  if (wallet.balanceMinor + amountMinor > limits.maxWalletBalanceMinor) {
    throw badRequest(
      ErrorCodes.WALLET_BALANCE_LIMIT,
      `Wallet balance limit is ${formatNaira(limits.maxWalletBalanceMinor)}`,
    );
  }

  const provider = getProvider(params.channel);
  const reference = generateReference('PAY');

  const created = await withTransaction(async (tx) => {
    const [transaction] = await tx
      .insert(transactions)
      .values({
        reference,
        type: 'FUNDING',
        status: 'PENDING',
        amountMinor,
        currency: wallet.currency,
        description: 'Wallet funding',
        recipientWalletId: wallet.id,
        recipientName: wallet.accountName,
        initiatedByUserId: params.userId,
        metadata: { channel: params.channel },
      })
      .returning();

    if (!transaction) throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not create funding request');

    const [payment] = await tx
      .insert(payments)
      .values({
        reference,
        transactionId: transaction.id,
        userId: params.userId,
        walletId: wallet.id,
        provider: params.channel,
        status: 'PENDING',
        amountMinor,
        currency: wallet.currency,
        metadata: params.simulate ? { simulate: params.simulate } : {},
      })
      .returning();

    if (!payment) throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not create payment');

    return { transaction, payment };
  });

  try {
    const initialized = await provider.initialize({
      email: params.email,
      amountMinor,
      currency: wallet.currency,
      reference,
      callbackUrl: `${env.APP_BASE_URL}/api/payments/callback`,
      metadata: { userId: params.userId, reference },
    });

    await db
      .update(payments)
      .set({
        authorizationUrl: initialized.authorizationUrl,
        accessCode: initialized.accessCode,
        providerReference: initialized.providerReference,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, created.payment.id));

    await recordAudit(db, {
      actorUserId: params.userId,
      action: 'payment.initialized',
      entityType: 'payment',
      entityId: created.payment.id,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      metadata: { provider: params.channel, amountMinor: amountMinor.toString() },
    });

    return {
      reference,
      channel: params.channel,
      status: 'PENDING',
      amountMinor: toApiAmount(amountMinor),
      amountFormatted: formatNaira(amountMinor),
      currency: wallet.currency,
      authorizationUrl: initialized.authorizationUrl,
      accessCode: initialized.accessCode,
      demo: params.channel === 'DEMO',
      message:
        params.channel === 'DEMO'
          ? 'Demo funding request created. Confirm it from the app to simulate a successful sandbox payment.'
          : 'Complete the payment in the Paystack sandbox checkout, then PayFlow will verify it server-side.',
    };
  } catch (error) {
    await failPayment(reference, 'Payment provider initialization failed');
    throw error;
  }
}

async function failPayment(reference: string, reason: string): Promise<void> {
  try {
    await withTransaction(async (tx) => {
      const [payment] = await tx.select().from(payments).where(eq(payments.reference, reference)).limit(1).for('update');
      if (!payment || payment.status === 'SUCCESSFUL') return;

      await tx
        .update(payments)
        .set({ status: 'FAILED', gatewayResponse: reason, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));

      if (payment.transactionId) {
        await tx
          .update(transactions)
          .set({ status: 'FAILED', failureReason: reason, updatedAt: new Date() })
          .where(eq(transactions.id, payment.transactionId));
      }
    });
  } catch (error) {
    logger.error({ err: error, reference }, 'Could not mark payment as failed');
  }
}

export interface VerifyPaymentResultDto {
  reference: string;
  status: 'SUCCESSFUL' | 'FAILED' | 'PENDING';
  alreadyProcessed: boolean;
  credited: boolean;
  amountMinor: number;
  amountFormatted: string;
  currency: string;
  walletBalanceMinor: number;
  walletBalanceFormatted: string;
  payment: ReturnType<typeof serializePayment> | null;
  transaction: ReturnType<typeof serializeTransaction> | null;
  message: string;
}

/**
 * Verifies a payment with the provider and, only when the provider confirms the
 * exact reference/amount/currency, credits the wallet through the ledger.
 *
 * This function is idempotent: repeated calls (client retries, duplicate webhooks)
 * never credit twice.
 */
export async function verifyPayment(
  reference: string,
  { source }: { source: 'client' | 'webhook' | 'demo' },
): Promise<VerifyPaymentResultDto> {
  const [payment] = await db.select().from(payments).where(eq(payments.reference, reference)).limit(1);
  if (!payment) throw notFound(ErrorCodes.NOT_FOUND, 'Payment not found');

  const wallet = await db
    .select({ id: wallets.id, balanceMinor: wallets.balanceMinor, currency: wallets.currency })
    .from(wallets)
    .where(eq(wallets.id, payment.walletId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!wallet) throw notFound(ErrorCodes.WALLET_NOT_FOUND, 'Wallet not found');

  if (payment.status === 'SUCCESSFUL') {
    const existingTransaction = payment.transactionId
      ? await db.select().from(transactions).where(eq(transactions.id, payment.transactionId)).limit(1)
      : [];
    const walletIds = await getUserWalletIds(payment.userId);
    return {
      reference,
      status: 'SUCCESSFUL',
      alreadyProcessed: true,
      credited: false,
      amountMinor: toApiAmount(payment.amountMinor),
      amountFormatted: formatNaira(payment.amountMinor),
      currency: payment.currency,
      walletBalanceMinor: toApiAmount(wallet.balanceMinor),
      walletBalanceFormatted: formatNaira(wallet.balanceMinor),
      payment: serializePayment(payment),
      transaction: existingTransaction[0]
        ? serializeTransaction(existingTransaction[0], { viewerWalletIds: new Set(walletIds) })
        : null,
      message: 'This payment has already been verified and credited.',
    };
  }

  const provider = getProvider(payment.provider);

  if (source === 'demo' && payment.provider !== 'DEMO') {
    throw badRequest(ErrorCodes.DEMO_ONLY, 'Only demo payments can be confirmed through this endpoint');
  }

  const verification =
    payment.provider === 'DEMO'
      ? {
          status:
            (payment.metadata as Record<string, unknown> | null)?.simulate === 'failure'
              ? ('failed' as const)
              : ('success' as const),
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          reference: payment.reference,
          providerReference: payment.providerReference,
          channel: 'demo',
          paidAt: new Date(),
          gatewayResponse: 'Simulated demo payment approved',
          raw: { simulated: true } as Record<string, unknown>,
        }
      : await provider.verify(reference);

  if (verification.status !== 'success') {
    const failed = verification.status === 'failed';
    await withTransaction(async (tx) => {
      const [locked] = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1).for('update');
      if (!locked || locked.status === 'SUCCESSFUL') return;

      await tx
        .update(payments)
        .set({
          status: failed ? 'FAILED' : 'PENDING',
          gatewayResponse: verification.gatewayResponse,
          verifiedAt: new Date(),
          verifyPayload: verification.raw,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      if (payment.transactionId) {
        await tx
          .update(transactions)
          .set({
            status: failed ? 'FAILED' : 'PENDING',
            failureReason: failed ? verification.gatewayResponse ?? 'Payment failed' : null,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, payment.transactionId));
      }

      if (failed) {
        await createNotification(tx, {
          userId: payment.userId,
          type: 'TRANSACTION_FAILED',
          title: 'Top-up failed',
          body: `Your ${formatNaira(payment.amountMinor)} top-up was not completed. Ref ${payment.reference}`,
          data: { reference: payment.reference },
        });
      }
    });

    const [refreshed] = await db.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
    return {
      reference,
      status: failed ? 'FAILED' : 'PENDING',
      alreadyProcessed: false,
      credited: false,
      amountMinor: toApiAmount(payment.amountMinor),
      amountFormatted: formatNaira(payment.amountMinor),
      currency: payment.currency,
      walletBalanceMinor: toApiAmount(wallet.balanceMinor),
      walletBalanceFormatted: formatNaira(wallet.balanceMinor),
      payment: refreshed ? serializePayment(refreshed) : null,
      transaction: null,
      message: failed
        ? 'The payment provider reported that this payment failed. No funds were credited.'
        : 'This payment is still pending with the provider.',
    };
  }

  // Trusted verification passed — now check the money details before crediting.
  if (verification.currency !== payment.currency) {
    await failPayment(payment.reference, 'Currency mismatch during verification');
    await recordAudit(db, {
      actorUserId: payment.userId,
      action: 'payment.currency_mismatch',
      entityType: 'payment',
      entityId: payment.id,
      metadata: { expected: payment.currency, received: verification.currency },
    });
    throw new AppError(
      409,
      ErrorCodes.PAYMENT_CURRENCY_MISMATCH,
      'Verified payment currency does not match the expected currency.',
    );
  }

  if (verification.amountMinor !== payment.amountMinor) {
    await failPayment(payment.reference, 'Amount mismatch during verification');
    await recordAudit(db, {
      actorUserId: payment.userId,
      action: 'payment.amount_mismatch',
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        expectedMinor: payment.amountMinor.toString(),
        receivedMinor: verification.amountMinor.toString(),
      },
    });
    throw new AppError(
      409,
      ErrorCodes.PAYMENT_AMOUNT_MISMATCH,
      'Verified payment amount does not match the expected amount. No funds were credited.',
    );
  }

  const credited = await creditVerifiedPayment({
    payment,
    verification: {
      channel: verification.channel,
      paidAt: verification.paidAt,
      gatewayResponse: verification.gatewayResponse,
      raw: verification.raw,
      providerReference: verification.providerReference,
    },
    source,
  });

  const [finalPayment] = await db.select().from(payments).where(eq(payments.id, payment.id)).limit(1);
  const [finalWallet] = await db.select().from(wallets).where(eq(wallets.id, payment.walletId)).limit(1);
  const walletIds = await getUserWalletIds(payment.userId);
  const [finalTransaction] = credited.transactionId
    ? await db.select().from(transactions).where(eq(transactions.id, credited.transactionId)).limit(1)
    : [];

  return {
    reference,
    status: 'SUCCESSFUL',
    alreadyProcessed: !credited.newlyCredited,
    credited: credited.newlyCredited,
    amountMinor: toApiAmount(payment.amountMinor),
    amountFormatted: formatNaira(payment.amountMinor),
    currency: payment.currency,
    walletBalanceMinor: toApiAmount(finalWallet?.balanceMinor ?? wallet.balanceMinor),
    walletBalanceFormatted: formatNaira(finalWallet?.balanceMinor ?? wallet.balanceMinor),
    payment: finalPayment ? serializePayment(finalPayment) : null,
    transaction: finalTransaction
      ? serializeTransaction(finalTransaction, { viewerWalletIds: new Set(walletIds) })
      : null,
    message: credited.newlyCredited
      ? `${formatNaira(payment.amountMinor)} was added to your PayFlow wallet.`
      : 'This payment has already been verified and credited.',
  };
}

interface CreditParams {
  payment: Payment;
  verification: {
    channel: string | null;
    paidAt: Date | null;
    gatewayResponse: string | null;
    raw: Record<string, unknown>;
    providerReference: string | null;
  };
  source: 'client' | 'webhook' | 'demo';
}

/** The single place where a verified payment turns into a wallet credit. */
async function creditVerifiedPayment({ payment, verification, source }: CreditParams) {
  return withTransaction(async (tx: Tx) => {
    const [locked] = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1).for('update');
    if (!locked) throw notFound(ErrorCodes.NOT_FOUND, 'Payment not found');
    if (locked.status === 'SUCCESSFUL') {
      return { newlyCredited: false, transactionId: locked.transactionId };
    }

    const wallet = await getWalletForUserInTx(tx, payment.userId);
    if (wallet.status !== 'ACTIVE') {
      throw conflict(ErrorCodes.WALLET_FROZEN, 'Wallet is not active');
    }
    if (wallet.balanceMinor + payment.amountMinor > limits.maxWalletBalanceMinor) {
      throw badRequest(
        ErrorCodes.WALLET_BALANCE_LIMIT,
        `Crediting this payment would exceed the wallet balance limit of ${formatNaira(limits.maxWalletBalanceMinor)}`,
      );
    }

    const transactionId =
      locked.transactionId ??
      (
        await tx
          .insert(transactions)
          .values({
            reference: locked.reference,
            type: 'FUNDING',
            status: 'PROCESSING',
            amountMinor: locked.amountMinor,
            currency: locked.currency,
            description: 'Wallet funding',
            recipientWalletId: wallet.id,
            recipientName: wallet.accountName,
            initiatedByUserId: payment.userId,
          })
          .returning({ id: transactions.id })
      )[0]?.id;

    if (!transactionId) throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not resolve transaction');

    await postLedgerTransaction(tx, {
      type: 'FUNDING',
      description: `Wallet funding ${locked.reference}`,
      transactionId,
      reference: `LTX-${locked.reference}`,
      legs: [
        {
          ledgerAccountId: SYSTEM_LEDGER_ACCOUNTS.PAYMENT_CLEARING,
          direction: 'DEBIT',
          amountMinor: locked.amountMinor,
        },
        {
          ledgerAccountId: wallet.ledgerAccountId,
          direction: 'CREDIT',
          amountMinor: locked.amountMinor,
          walletId: wallet.id,
        },
      ],
      metadata: { provider: locked.provider, source },
    });

    const now = new Date();
    await tx
      .update(payments)
      .set({
        status: 'SUCCESSFUL',
        transactionId,
        providerReference: verification.providerReference ?? locked.providerReference,
        channel: verification.channel,
        gatewayResponse: verification.gatewayResponse,
        paidAt: verification.paidAt ?? now,
        verifiedAt: now,
        verifyPayload: verification.raw,
        updatedAt: now,
      })
      .where(eq(payments.id, locked.id));

    await tx
      .update(transactions)
      .set({ status: 'SUCCESSFUL', completedAt: now, updatedAt: now })
      .where(eq(transactions.id, transactionId));

    await createNotification(tx, {
      userId: payment.userId,
      type: 'WALLET_FUNDED',
      title: 'Wallet funded',
      body: `${formatNaira(locked.amountMinor)} was added to your wallet. Ref ${locked.reference}`,
      data: { reference: locked.reference, transactionId },
    });

    await recordAudit(tx, {
      actorUserId: payment.userId,
      action: 'payment.verified',
      entityType: 'payment',
      entityId: locked.id,
      metadata: {
        amountMinor: locked.amountMinor.toString(),
        provider: locked.provider,
        source,
      },
    });

    return { newlyCredited: true, transactionId };
  });
}

/** Provider webhook ingestion (signature already verified upstream). */
export async function handlePaystackWebhook(rawBody: Buffer, signature: string | undefined) {
  const provider = getProvider('PAYSTACK');

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    throw new AppError(401, ErrorCodes.INVALID_WEBHOOK_SIGNATURE, 'Invalid webhook signature');
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw badRequest(ErrorCodes.VALIDATION_ERROR, 'Webhook payload is not valid JSON');
  }

  const event = String(payload.event ?? 'unknown');
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const eventId = data.id
    ? `paystack:${event}:${String(data.id)}`
    : `paystack:${event}:${String(data.reference ?? 'unknown')}:${rawBody.length}`;

  // Duplicate webhook deliveries are rejected by the unique event id.
  const inserted = await db
    .insert(webhookEventTable)
    .values({
      provider: 'PAYSTACK',
      eventId,
      eventType: event,
      signatureValid: true,
      payload,
      status: 'RECEIVED',
    })
    .onConflictDoNothing({ target: webhookEventTable.eventId })
    .returning({ id: webhookEventTable.id });

  if (inserted.length === 0) {
    logger.info({ eventId }, 'Duplicate webhook delivery ignored');
    return { status: 'duplicate' as const, eventId };
  }

  const reference = typeof data.reference === 'string' ? data.reference : null;

  try {
    if (event === 'charge.success' && reference) {
      await verifyPayment(reference, { source: 'webhook' });
      await db
        .update(webhookEventTable)
        .set({ status: 'PROCESSED', processedAt: new Date() })
        .where(eq(webhookEventTable.eventId, eventId));
      return { status: 'processed' as const, eventId };
    }

    if ((event === 'charge.failed' || event === 'transfer.failed') && reference) {
      await failPayment(reference, 'Provider reported the charge as failed');
      await db
        .update(webhookEventTable)
        .set({ status: 'PROCESSED', processedAt: new Date() })
        .where(eq(webhookEventTable.eventId, eventId));
      return { status: 'processed' as const, eventId };
    }

    await db
      .update(webhookEventTable)
      .set({ status: 'IGNORED', processedAt: new Date() })
      .where(eq(webhookEventTable.eventId, eventId));
    return { status: 'ignored' as const, eventId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook error';
    logger.error({ err: error, eventId }, 'Webhook processing failed');
    await db
      .update(webhookEventTable)
      .set({ status: 'FAILED', error: message.slice(0, 500) })
      .where(eq(webhookEventTable.eventId, eventId));
    // Acknowledge the delivery: the event row is recorded so it can be replayed.
    return { status: 'failed' as const, eventId, message };
  }
}
