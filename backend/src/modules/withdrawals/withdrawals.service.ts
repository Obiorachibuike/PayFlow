import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { withTransaction } from '../../db/transaction';
import { beneficiaries, transactions, withdrawals } from '../../db/schema';
import { limits } from '../../config/env';
import { AppError, ErrorCodes, badRequest, conflict, notFound } from '../../utils/errors';
import { generateReference } from '../../utils/references';
import { formatNaira, toApiAmount } from '../../utils/money';
import { recordAudit } from '../audit/audit.service';
import { postLedgerTransaction, SYSTEM_LEDGER_ACCOUNTS } from '../ledger/ledger.service';
import { createNotification } from '../notifications/notifications.service';
import { verifyTransactionPin } from '../security/pin.service';
import { getWalletForUserInTx } from '../wallet/wallet.service';

export interface CreateWithdrawalInput {
  userId: string;
  amountMinor: bigint;
  beneficiaryId?: string;
  bankCode?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  narration?: string;
  pin: string;
  ipAddress?: string | null;
  userAgent?: string | null;
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
  createdAt: Date;
}

async function assertDailyOutflowLimit(userId: string, additionalMinor: bigint): Promise<void> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(t.amount_minor), 0)::text AS total
      FROM transactions t
      JOIN wallets w ON w.id = t.sender_wallet_id
     WHERE w.user_id = ${userId}::uuid
       AND t.status = 'SUCCESSFUL'
       AND t.type IN ('TRANSFER_OUT', 'WITHDRAWAL')
       AND t.created_at >= date_trunc('day', now())
  `);
  const total = BigInt((result.rows[0] as { total: string } | undefined)?.total ?? '0');
  if (total + additionalMinor > limits.dailyOutflowLimitMinor) {
    throw new AppError(
      409,
      ErrorCodes.LIMIT_EXCEEDED,
      `Daily outflow limit is ${formatNaira(limits.dailyOutflowLimitMinor)}.`,
      { limitMinor: toApiAmount(limits.dailyOutflowLimitMinor), usedMinor: toApiAmount(total) },
    );
  }
}

/**
 * Simulated bank withdrawal. There is no payout provider configured, so the
 * money leaves the wallet (real double-entry movement) and settles into the
 * PayFlow clearing account. The record is explicitly flagged `simulated: true`
 * and is never presented as a real bank payout.
 */
export async function createWithdrawal(input: CreateWithdrawalInput): Promise<WithdrawalResult> {
  if (input.amountMinor < limits.minWithdrawalMinor) {
    throw badRequest(ErrorCodes.LIMIT_EXCEEDED, `Minimum withdrawal is ${formatNaira(limits.minWithdrawalMinor)}`);
  }
  if (input.amountMinor > limits.maxWithdrawalMinor) {
    throw badRequest(ErrorCodes.LIMIT_EXCEEDED, `Maximum withdrawal is ${formatNaira(limits.maxWithdrawalMinor)}`);
  }

  let bank: { bankName: string; bankCode: string; accountName: string; accountNumber: string; beneficiaryId: string | null };

  if (input.beneficiaryId) {
    const [beneficiary] = await db
      .select()
      .from(beneficiaries)
      .where(
        and(
          eq(beneficiaries.id, input.beneficiaryId),
          eq(beneficiaries.userId, input.userId),
          isNull(beneficiaries.deletedAt),
        ),
      )
      .limit(1);

    if (!beneficiary) throw notFound(ErrorCodes.BENEFICIARY_NOT_FOUND, 'Beneficiary not found');

    bank = {
      bankName: beneficiary.bankName,
      bankCode: beneficiary.bankCode,
      accountName: beneficiary.accountName,
      accountNumber: beneficiary.accountNumber,
      beneficiaryId: beneficiary.id,
    };
  } else {
    if (!input.bankCode || !input.bankName || !input.accountName || !input.accountNumber) {
      throw badRequest(
        ErrorCodes.VALIDATION_ERROR,
        'Select a saved beneficiary or provide the bank name, code, account name and number',
      );
    }
    if (!/^\d{10}$/.test(input.accountNumber)) {
      throw badRequest(ErrorCodes.INVALID_ACCOUNT_DETAILS, 'Account number must be 10 digits');
    }
    bank = {
      bankName: input.bankName,
      bankCode: input.bankCode,
      accountName: input.accountName,
      accountNumber: input.accountNumber,
      beneficiaryId: null,
    };
  }

  // PIN verification commits independently from the money movement.
  await verifyTransactionPin(input.userId, input.pin);
  await assertDailyOutflowLimit(input.userId, input.amountMinor);

  return withTransaction(async (tx) => {
    const wallet = await getWalletForUserInTx(tx, input.userId);
    if (wallet.status !== 'ACTIVE') {
      throw conflict(ErrorCodes.WALLET_FROZEN, 'Your wallet is not active');
    }
    if (wallet.balanceMinor < input.amountMinor) {
      throw new AppError(409, ErrorCodes.INSUFFICIENT_FUNDS, 'Insufficient wallet balance', {
        balanceMinor: toApiAmount(wallet.balanceMinor),
      });
    }

    const reference = generateReference('WDR');
    const now = new Date();

    const [transaction] = await tx
      .insert(transactions)
      .values({
        reference,
        type: 'WITHDRAWAL',
        status: 'PROCESSING',
        amountMinor: input.amountMinor,
        currency: wallet.currency,
        description: input.narration ?? `Withdrawal to ${bank.bankName}`,
        senderWalletId: wallet.id,
        senderName: wallet.accountName,
        recipientName: bank.accountName,
        initiatedByUserId: input.userId,
        metadata: { simulated: true, bankCode: bank.bankCode },
      })
      .returning();

    if (!transaction) throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not create withdrawal');

    await postLedgerTransaction(tx, {
      type: 'WITHDRAWAL',
      description: `Simulated withdrawal ${reference}`,
      transactionId: transaction.id,
      reference: `LTX-${reference}`,
      legs: [
        {
          ledgerAccountId: wallet.ledgerAccountId,
          direction: 'DEBIT',
          amountMinor: input.amountMinor,
          walletId: wallet.id,
        },
        {
          ledgerAccountId: SYSTEM_LEDGER_ACCOUNTS.PAYMENT_CLEARING,
          direction: 'CREDIT',
          amountMinor: input.amountMinor,
        },
      ],
      metadata: { simulated: true },
      insufficientFundsCode: ErrorCodes.INSUFFICIENT_FUNDS,
      insufficientFundsMessage: 'Insufficient wallet balance',
    });

    const [withdrawal] = await tx
      .insert(withdrawals)
      .values({
        transactionId: transaction.id,
        userId: input.userId,
        walletId: wallet.id,
        beneficiaryId: bank.beneficiaryId,
        bankName: bank.bankName,
        bankCode: bank.bankCode,
        accountName: bank.accountName,
        accountNumberLast4: bank.accountNumber.slice(-4),
        simulated: true,
      })
      .returning();

    await tx
      .update(transactions)
      .set({ status: 'SUCCESSFUL', completedAt: now, updatedAt: now })
      .where(eq(transactions.id, transaction.id));

    await createNotification(tx, {
      userId: input.userId,
      type: 'WITHDRAWAL_PROCESSED',
      title: 'Withdrawal processed (demo)',
      body: `${formatNaira(input.amountMinor)} withdrawal to ${bank.bankName} ••••${bank.accountNumber.slice(-4)} completed in demo mode.`,
      data: { reference, transactionId: transaction.id },
    });

    await recordAudit(tx, {
      actorUserId: input.userId,
      action: 'withdrawal.simulated',
      entityType: 'transaction',
      entityId: transaction.id,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { amountMinor: input.amountMinor.toString(), simulated: true },
    });

    return {
      transactionId: transaction.id,
      withdrawalId: withdrawal!.id,
      reference,
      status: 'SUCCESSFUL' as const,
      amountMinor: toApiAmount(input.amountMinor),
      walletBalanceMinor: toApiAmount(wallet.balanceMinor - input.amountMinor),
      bankName: bank.bankName,
      accountName: bank.accountName,
      accountNumberMasked: `******${bank.accountNumber.slice(-4)}`,
      simulated: true as const,
      createdAt: now,
    };
  });
}

export async function listWithdrawals(userId: string, limit = 20) {
  const rows = await db
    .select({ withdrawal: withdrawals, transaction: transactions })
    .from(withdrawals)
    .innerJoin(transactions, eq(transactions.id, withdrawals.transactionId))
    .where(eq(withdrawals.userId, userId))
    .orderBy(desc(withdrawals.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.withdrawal.id,
    reference: row.transaction.reference,
    transactionId: row.transaction.id,
    status: row.transaction.status,
    amountMinor: toApiAmount(row.transaction.amountMinor),
    amountFormatted: formatNaira(row.transaction.amountMinor),
    bankName: row.withdrawal.bankName,
    accountName: row.withdrawal.accountName,
    accountNumberMasked: `******${row.withdrawal.accountNumberLast4}`,
    simulated: row.withdrawal.simulated,
    createdAt: row.withdrawal.createdAt,
  }));
}

export async function getWithdrawal(userId: string, withdrawalId: string) {
  const [row] = await db
    .select({ withdrawal: withdrawals, transaction: transactions })
    .from(withdrawals)
    .innerJoin(transactions, eq(transactions.id, withdrawals.transactionId))
    .where(and(eq(withdrawals.id, withdrawalId), eq(withdrawals.userId, userId)))
    .limit(1);

  if (!row) throw notFound(ErrorCodes.TRANSACTION_NOT_FOUND, 'Withdrawal not found');

  return {
    id: row.withdrawal.id,
    reference: row.transaction.reference,
    transactionId: row.transaction.id,
    status: row.transaction.status,
    amountMinor: toApiAmount(row.transaction.amountMinor),
    amountFormatted: formatNaira(row.transaction.amountMinor),
    bankName: row.withdrawal.bankName,
    bankCode: row.withdrawal.bankCode,
    accountName: row.withdrawal.accountName,
    accountNumberMasked: `******${row.withdrawal.accountNumberLast4}`,
    simulated: row.withdrawal.simulated,
    createdAt: row.withdrawal.createdAt,
    completedAt: row.transaction.completedAt,
  };
}
