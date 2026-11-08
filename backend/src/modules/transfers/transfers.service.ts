import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import type { Tx } from '../../db';
import { withTransaction } from '../../db/transaction';
import { transactions, transfers, users, wallets } from '../../db/schema';
import { limits } from '../../config/env';
import { AppError, ErrorCodes, badRequest, conflict, notFound } from '../../utils/errors';
import { generateReference } from '../../utils/references';
import { formatNaira, toApiAmount } from '../../utils/money';
import { maskWalletTag, serializeTransaction } from '../../utils/serializers';
import { recordAudit } from '../audit/audit.service';
import { postLedgerTransaction } from '../ledger/ledger.service';
import { createNotification } from '../notifications/notifications.service';
import { verifyTransactionPin } from '../security/pin.service';
import { getUserWalletIds } from '../transactions/transactions.service';
import { getWalletForUserInTx } from '../wallet/wallet.service';

export interface RecipientReference {
  email?: string;
  phone?: string;
  walletTag?: string;
}

export interface ResolvedRecipient {
  recipient: {
    name: string;
    walletTag: string;
    maskedWalletTag: string;
    avatarColor: string;
    walletId: string;
    userId: string;
  };
}

async function findRecipient(client: Tx | typeof db, reference: RecipientReference) {
  const conditions = [];
  if (reference.email) conditions.push(eq(users.email, reference.email.trim().toLowerCase()));
  if (reference.phone) conditions.push(eq(users.phone, reference.phone.trim()));
  if (reference.walletTag) conditions.push(eq(wallets.walletTag, reference.walletTag.trim().toUpperCase()));

  if (conditions.length === 0) {
    throw badRequest(
      ErrorCodes.VALIDATION_ERROR,
      'Provide an email address, phone number or PayFlow wallet ID',
    );
  }

  const [row] = await client
    .select({
      userId: users.id,
      fullName: users.fullName,
      avatarColor: users.avatarColor,
      status: users.status,
      walletId: wallets.id,
      ledgerAccountId: wallets.ledgerAccountId,
      walletTag: wallets.walletTag,
      walletStatus: wallets.status,
      walletCurrency: wallets.currency,
    })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(and(or(...conditions), isNull(wallets.deletedAt), isNull(users.deletedAt)))
    .limit(1);

  return row ?? null;
}

/** Public recipient lookup used to confirm the recipient before sending money. */
export async function resolveRecipient(reference: RecipientReference): Promise<ResolvedRecipient> {
  const row = await findRecipient(db, reference);
  if (!row) {
    throw notFound(
      ErrorCodes.RECIPIENT_NOT_FOUND,
      'No PayFlow wallet matches those details. Check the email, phone or wallet ID.',
    );
  }
  if (row.status !== 'ACTIVE' || row.walletStatus !== 'ACTIVE') {
    throw conflict(ErrorCodes.WALLET_FROZEN, 'This recipient cannot receive money right now');
  }

  // Only the minimum needed to confirm a recipient is exposed.
  return {
    recipient: {
      name: row.fullName,
      walletTag: row.walletTag,
      maskedWalletTag: maskWalletTag(row.walletTag),
      avatarColor: row.avatarColor,
      walletId: row.walletId,
      userId: row.userId,
    },
  };
}

async function assertDailyOutflowLimit(tx: Tx, walletIds: string[], additionalMinor: bigint): Promise<void> {
  if (walletIds.length === 0) return;
  const result = await tx.execute(sql`
    SELECT COALESCE(SUM(amount_minor), 0)::text AS total
      FROM transactions
     WHERE sender_wallet_id IN (${sql.join(walletIds.map((id) => sql`${id}::uuid`), sql`, `)})
       AND status = 'SUCCESSFUL'
       AND type IN ('TRANSFER_OUT', 'WITHDRAWAL')
       AND created_at >= date_trunc('day', now())
  `);
  const total = BigInt((result.rows[0] as { total: string } | undefined)?.total ?? '0');
  if (total + additionalMinor > limits.dailyOutflowLimitMinor) {
    throw new AppError(
      409,
      ErrorCodes.LIMIT_EXCEEDED,
      `Daily outflow limit is ${formatNaira(limits.dailyOutflowLimitMinor)}. You have ${formatNaira(
        limits.dailyOutflowLimitMinor - total,
      )} left today.`,
      { limitMinor: toApiAmount(limits.dailyOutflowLimitMinor), usedMinor: toApiAmount(total) },
    );
  }
}

export interface CreateTransferInput {
  userId: string;
  recipient: RecipientReference;
  amountMinor: bigint;
  description?: string;
  pin: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface TransferResult {
  transactionId: string;
  reference: string;
  status: string;
  amountMinor: number;
  walletBalanceMinor: number;
  recipientName: string;
  createdAt: Date;
}

export async function createTransfer(input: CreateTransferInput): Promise<TransferResult> {
  if (input.amountMinor < limits.minTransferMinor) {
    throw badRequest(
      ErrorCodes.LIMIT_EXCEEDED,
      `Minimum transfer amount is ${formatNaira(limits.minTransferMinor)}`,
    );
  }
  if (input.amountMinor > limits.maxTransferMinor) {
    throw badRequest(
      ErrorCodes.LIMIT_EXCEEDED,
      `Maximum transfer amount is ${formatNaira(limits.maxTransferMinor)}`,
    );
  }

  // PIN verification commits independently so failed attempts are always counted.
  await verifyTransactionPin(input.userId, input.pin);

  return withTransaction(async (tx) => {
    const sender = await getWalletForUserInTx(tx, input.userId);
    if (sender.status !== 'ACTIVE') {
      throw conflict(ErrorCodes.WALLET_FROZEN, 'Your wallet is not active');
    }

    const recipient = await findRecipient(tx, input.recipient);
    if (!recipient) {
      throw notFound(ErrorCodes.RECIPIENT_NOT_FOUND, 'Recipient not found');
    }
    if (recipient.userId === input.userId) {
      throw badRequest(ErrorCodes.SELF_TRANSFER, 'You cannot send money to your own wallet');
    }
    if (recipient.status !== 'ACTIVE' || recipient.walletStatus !== 'ACTIVE') {
      throw conflict(ErrorCodes.WALLET_FROZEN, 'This recipient cannot receive money right now');
    }
    if (recipient.walletCurrency !== sender.currency) {
      throw badRequest(ErrorCodes.VALIDATION_ERROR, 'Currency mismatch between wallets');
    }

    // Authoritative balance read: the wallet projection is only ever written by
    // the ledger service, so this is the ledger-backed number.
    if (sender.balanceMinor < input.amountMinor) {
      throw new AppError(409, ErrorCodes.INSUFFICIENT_FUNDS, 'Insufficient wallet balance', {
        balanceMinor: toApiAmount(sender.balanceMinor),
      });
    }

    const walletIds = await getUserWalletIds(input.userId);
    await assertDailyOutflowLimit(tx, walletIds, input.amountMinor);

    const reference = generateReference('TRF');
    const [transaction] = await tx
      .insert(transactions)
      .values({
        reference,
        type: 'TRANSFER_OUT',
        status: 'PROCESSING',
        amountMinor: input.amountMinor,
        currency: sender.currency,
        description: input.description ?? null,
        senderWalletId: sender.id,
        recipientWalletId: recipient.walletId,
        senderName: sender.accountName,
        recipientName: recipient.fullName,
        initiatedByUserId: input.userId,
      })
      .returning();

    if (!transaction) throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not create transaction');

    await postLedgerTransaction(tx, {
      type: 'TRANSFER_OUT',
      description: `Internal transfer ${reference}`,
      transactionId: transaction.id,
      reference: `LTX-${reference}`,
      legs: [
        {
          ledgerAccountId: sender.ledgerAccountId,
          direction: 'DEBIT',
          amountMinor: input.amountMinor,
          walletId: sender.id,
        },
        {
          ledgerAccountId: recipient.ledgerAccountId,
          direction: 'CREDIT',
          amountMinor: input.amountMinor,
          walletId: recipient.walletId,
        },
      ],
      metadata: { transfer: true, from: sender.id, to: recipient.walletId },
      insufficientFundsCode: ErrorCodes.INSUFFICIENT_FUNDS,
      insufficientFundsMessage: 'Insufficient wallet balance',
    });

    await tx.insert(transfers).values({
      transactionId: transaction.id,
      senderUserId: input.userId,
      recipientUserId: recipient.userId,
      fromWalletId: sender.id,
      toWalletId: recipient.walletId,
      note: input.description ?? null,
    });

    const completedAt = new Date();
    await tx
      .update(transactions)
      .set({ status: 'SUCCESSFUL', completedAt, updatedAt: completedAt })
      .where(eq(transactions.id, transaction.id));

    const [updatedSender] = await tx
      .select({ balanceMinor: wallets.balanceMinor })
      .from(wallets)
      .where(eq(wallets.id, sender.id))
      .limit(1);

    await createNotification(tx, {
      userId: input.userId,
      type: 'TRANSFER_SENT',
      title: 'Transfer sent',
      body: `${formatNaira(input.amountMinor)} sent to ${recipient.fullName}. Ref ${reference}`,
      data: { transactionId: transaction.id, reference },
    });

    await createNotification(tx, {
      userId: recipient.userId,
      type: 'TRANSFER_RECEIVED',
      title: 'Money received',
      body: `${formatNaira(input.amountMinor)} from ${sender.accountName}. Ref ${reference}`,
      data: { transactionId: transaction.id, reference },
    });

    await recordAudit(tx, {
      actorUserId: input.userId,
      action: 'transfer.created',
      entityType: 'transaction',
      entityId: transaction.id,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { amountMinor: input.amountMinor.toString(), recipientUserId: recipient.userId },
    });

    return {
      transactionId: transaction.id,
      reference,
      status: 'SUCCESSFUL',
      amountMinor: toApiAmount(input.amountMinor),
      walletBalanceMinor: toApiAmount(updatedSender?.balanceMinor ?? sender.balanceMinor - input.amountMinor),
      recipientName: recipient.fullName,
      createdAt: completedAt,
    };
  });
}

export async function getTransferForUser(userId: string, transferId: string) {
  const [row] = await db
    .select({
      transfer: transfers,
      transaction: transactions,
    })
    .from(transfers)
    .innerJoin(transactions, eq(transactions.id, transfers.transactionId))
    .where(eq(transfers.id, transferId))
    .limit(1);

  if (!row) throw notFound(ErrorCodes.TRANSACTION_NOT_FOUND, 'Transfer not found');
  if (row.transfer.senderUserId !== userId && row.transfer.recipientUserId !== userId) {
    throw notFound(ErrorCodes.TRANSACTION_NOT_FOUND, 'Transfer not found');
  }

  const walletIds = new Set([row.transfer.fromWalletId, row.transfer.toWalletId]);

  return {
    id: row.transfer.id,
    note: row.transfer.note,
    transaction: serializeTransaction(row.transaction, { viewerWalletIds: walletIds }),
  };
}
