import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../../db';
import { lockLedgerAccounts } from '../../db/transaction';
import {
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  wallets,
} from '../../db/schema';
import type { LedgerAccountType, TransactionType } from '../../db/schema';
import { AppError, ErrorCodes, conflict, notFound } from '../../utils/errors';
import { generateReference } from '../../utils/references';

export const SYSTEM_LEDGER_ACCOUNTS = {
  PAYMENT_CLEARING: '00000000-0000-4000-8000-000000000001',
  PLATFORM_REVENUE: '00000000-0000-4000-8000-000000000002',
  TRANSFER_CLEARING: '00000000-0000-4000-8000-000000000003',
} as const;

export type EntryDirection = 'DEBIT' | 'CREDIT';

export interface LedgerLegInput {
  ledgerAccountId: string;
  direction: EntryDirection;
  amountMinor: bigint;
  /** When the account backs a user wallet, the wallet projection is updated too. */
  walletId?: string;
}

export interface PostLedgerParams {
  type: TransactionType;
  description: string;
  legs: LedgerLegInput[];
  currency?: string;
  reference?: string;
  transactionId?: string | null;
  metadata?: Record<string, unknown>;
  /** Error code raised when a credit-normal account would go negative. */
  insufficientFundsCode?: string;
  insufficientFundsMessage?: string;
}

export interface PostedLedgerTransaction {
  id: string;
  reference: string;
  entryCount: number;
  totalMinor: bigint;
}

/** Accounts whose natural balance increases on the CREDIT side. */
const CREDIT_NORMAL: ReadonlySet<LedgerAccountType> = new Set(['LIABILITY', 'EQUITY', 'REVENUE']);

function signedDelta(type: LedgerAccountType, direction: EntryDirection, amountMinor: bigint): bigint {
  const creditNormal = CREDIT_NORMAL.has(type);
  const increases = direction === (creditNormal ? 'CREDIT' : 'DEBIT');
  return increases ? amountMinor : -amountMinor;
}

/**
 * Posts one balanced, immutable double-entry ledger transaction.
 *
 * Must be called inside a database transaction. The caller is responsible for
 * the surrounding business validation (limits, PIN, kyc, ...), but this function
 * is the single place in the codebase where balances change.
 */
export async function postLedgerTransaction(tx: Tx, params: PostLedgerParams): Promise<PostedLedgerTransaction> {
  const currency = params.currency ?? 'NGN';
  const legs = params.legs;

  if (legs.length < 2) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'A ledger transaction requires at least two entries');
  }

  let debitTotal = 0n;
  let creditTotal = 0n;
  const seen = new Set<string>();

  for (const leg of legs) {
    if (leg.amountMinor <= 0n) {
      throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Ledger entry amounts must be positive');
    }
    if (seen.has(leg.ledgerAccountId)) {
      throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'A ledger transaction cannot reference the same account twice');
    }
    seen.add(leg.ledgerAccountId);
    if (leg.direction === 'DEBIT') debitTotal += leg.amountMinor;
    else creditTotal += leg.amountMinor;
  }

  if (debitTotal !== creditTotal) {
    throw new AppError(
      500,
      ErrorCodes.INTERNAL_ERROR,
      `Unbalanced ledger transaction: debits ${debitTotal} != credits ${creditTotal}`,
    );
  }

  const accountIds = legs.map((leg) => leg.ledgerAccountId);
  const locked = await lockLedgerAccounts(tx, accountIds);

  for (const accountId of accountIds) {
    if (!locked.has(accountId)) {
      throw notFound(ErrorCodes.NOT_FOUND, `Ledger account ${accountId} not found`);
    }
  }

  const reference = params.reference ?? generateReference('LTX');
  const [ledgerTransaction] = await tx
    .insert(ledgerTransactions)
    .values({
      reference,
      transactionId: params.transactionId ?? null,
      type: params.type,
      description: params.description,
      currency,
      metadata: params.metadata,
    })
    .returning({ id: ledgerTransactions.id, reference: ledgerTransactions.reference });

  if (!ledgerTransaction) {
    throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Failed to create ledger transaction');
  }

  await tx.insert(ledgerEntries).values(
    legs.map((leg) => ({
      ledgerTransactionId: ledgerTransaction.id,
      ledgerAccountId: leg.ledgerAccountId,
      direction: leg.direction,
      amountMinor: leg.amountMinor,
      currency,
    })),
  );

  // Apply the resulting balance for every touched account. The balance read above
  // is protected by SELECT ... FOR UPDATE, so no other transaction can interleave.
  for (const leg of legs) {
    const account = locked.get(leg.ledgerAccountId)!;
    const delta = signedDelta(account.type as LedgerAccountType, leg.direction, leg.amountMinor);
    const nextBalance = account.balanceMinor + delta;

    if (nextBalance < 0n) {
      throw new AppError(
        409,
        params.insufficientFundsCode ?? ErrorCodes.INSUFFICIENT_FUNDS,
        params.insufficientFundsMessage ?? 'Insufficient funds for this transaction',
        { accountCode: account.code, availableMinor: Number(account.balanceMinor) },
      );
    }

    await tx
      .update(ledgerAccounts)
      .set({ balanceMinor: nextBalance, updatedAt: new Date() })
      .where(eq(ledgerAccounts.id, leg.ledgerAccountId));

    if (leg.walletId) {
      const walletUpdate = await tx
        .update(wallets)
        .set({ balanceMinor: nextBalance, lastActivityAt: new Date(), updatedAt: new Date() })
        .where(and(eq(wallets.id, leg.walletId), eq(wallets.ledgerAccountId, leg.ledgerAccountId)))
        .returning({ id: wallets.id });

      if (walletUpdate.length === 0) {
        throw new AppError(
          500,
          ErrorCodes.INTERNAL_ERROR,
          'Wallet projection does not match the posted ledger account',
        );
      }
    }
  }

  return {
    id: ledgerTransaction.id,
    reference: ledgerTransaction.reference,
    entryCount: legs.length,
    totalMinor: debitTotal,
  };
}

export interface ReconciliationResult {
  ok: boolean;
  accountsChecked: number;
  walletsChecked: number;
  totalDebitsMinor: string;
  totalCreditsMinor: string;
  discrepancies: Array<{
    kind: 'ledger_account' | 'wallet' | 'imbalance';
    id: string;
    expectedMinor: string;
    actualMinor: string;
  }>;
}

/**
 * Independently recomputes every balance from the immutable entries and compares
 * it with the materialised projections. Used by tests and by `npm run db:reconcile`.
 */
export async function reconcileLedger(tx: Tx): Promise<ReconciliationResult> {
  const discrepancies: ReconciliationResult['discrepancies'] = [];

  const totals = await tx.execute(sql`
    SELECT
      COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'DEBIT'), 0)::text AS debits,
      COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'CREDIT'), 0)::text AS credits
    FROM ledger_entries
  `);
  const totalsRow = totals.rows[0] as { debits: string; credits: string };
  if (BigInt(totalsRow.debits) !== BigInt(totalsRow.credits)) {
    discrepancies.push({
      kind: 'imbalance',
      id: 'global',
      expectedMinor: totalsRow.debits,
      actualMinor: totalsRow.credits,
    });
  }

  const recomputed = await tx.execute(sql`
    SELECT a.id,
           a.type::text AS type,
           a.balance_minor::text AS stored,
           COALESCE(SUM(
             CASE
               WHEN a.type IN ('LIABILITY', 'EQUITY', 'REVENUE') THEN
                 CASE e.direction WHEN 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END
               ELSE
                 CASE e.direction WHEN 'DEBIT' THEN e.amount_minor ELSE -e.amount_minor END
             END
           ), 0)::text AS computed
      FROM ledger_accounts a
      LEFT JOIN ledger_entries e ON e.ledger_account_id = a.id
     GROUP BY a.id, a.type, a.balance_minor
  `);

  for (const row of recomputed.rows as Array<{ id: string; stored: string; computed: string }>) {
    if (BigInt(row.stored) !== BigInt(row.computed)) {
      discrepancies.push({
        kind: 'ledger_account',
        id: row.id,
        expectedMinor: row.computed,
        actualMinor: row.stored,
      });
    }
  }

  const walletRows = await tx.execute(sql`
    SELECT w.id,
           w.balance_minor::text AS stored,
           a.balance_minor::text AS account_balance
      FROM wallets w
      JOIN ledger_accounts a ON a.id = w.ledger_account_id
  `);

  for (const row of walletRows.rows as Array<{ id: string; stored: string; account_balance: string }>) {
    if (BigInt(row.stored) !== BigInt(row.account_balance)) {
      discrepancies.push({
        kind: 'wallet',
        id: row.id,
        expectedMinor: row.account_balance,
        actualMinor: row.stored,
      });
    }
  }

  return {
    ok: discrepancies.length === 0,
    accountsChecked: recomputed.rows.length,
    walletsChecked: walletRows.rows.length,
    totalDebitsMinor: totalsRow.debits,
    totalCreditsMinor: totalsRow.credits,
    discrepancies,
  };
}

/** Reads the authoritative ledger balance for a wallet (bypassing the projection). */
export async function getLedgerBalanceForWallet(tx: Tx, walletId: string): Promise<bigint> {
  const result = await tx.execute(sql`
    SELECT COALESCE(SUM(
             CASE a.type
               WHEN 'LIABILITY' THEN CASE e.direction WHEN 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END
               ELSE CASE e.direction WHEN 'DEBIT' THEN e.amount_minor ELSE -e.amount_minor END
             END
           ), 0)::text AS balance
      FROM wallets w
      JOIN ledger_accounts a ON a.id = w.ledger_account_id
      LEFT JOIN ledger_entries e ON e.ledger_account_id = a.id
     WHERE w.id = ${walletId}::uuid
  `);
  const row = result.rows[0] as { balance: string } | undefined;
  return BigInt(row?.balance ?? '0');
}

/** Guards a reversal flow: a posted ledger transaction can never be modified. */
export function assertReversible(currentStatus: string): void {
  if (currentStatus === 'REVERSED') {
    throw conflict(ErrorCodes.CONFLICT, 'Transaction has already been reversed');
  }
}
