import crypto from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../../db';
import { db } from '../../db';
import { ledgerAccounts, transactions, users, wallets } from '../../db/schema';
import type { Wallet } from '../../db/schema';
import { AppError, ErrorCodes, notFound } from '../../utils/errors';
import { generateWalletTag } from '../../utils/crypto';
import { formatNaira, toApiAmount } from '../../utils/money';
import { serializeTransaction, serializeWallet } from '../../utils/serializers';

const WALLET_CURRENCY = 'NGN';

export interface WalletWithOwner extends Wallet {
  accountName: string;
  email: string;
}

async function generateUniqueWalletTag(tx: Tx): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const tag = generateWalletTag();
    const [existing] = await tx
      .select({ id: wallets.id })
      .from(wallets)
      .where(eq(wallets.walletTag, tag))
      .limit(1);
    if (!existing) return tag;
  }
  throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not allocate a wallet identifier');
}

/**
 * Every user gets exactly one ledger-backed wallet per currency. The wallet's
 * balance is never written directly by callers — only the ledger service may
 * mutate it, in the same transaction that appends balanced entries.
 */
export async function createWalletForUser(
  tx: Tx,
  userId: string,
  currency = WALLET_CURRENCY,
): Promise<Wallet> {
  const [existing] = await tx
    .select()
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.currency, currency)))
    .limit(1);
  if (existing) return existing;

  const walletId = crypto.randomUUID();
  const [account] = await tx
    .insert(ledgerAccounts)
    .values({
      code: `WALLET:${walletId}`,
      name: `Wallet liability ${walletId.slice(0, 8)}`,
      type: 'LIABILITY',
      currency,
      isSystem: false,
    })
    .returning({ id: ledgerAccounts.id });

  if (!account) throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not create ledger account');

  const [wallet] = await tx
    .insert(wallets)
    .values({
      id: walletId,
      userId,
      currency,
      walletTag: await generateUniqueWalletTag(tx),
      ledgerAccountId: account.id,
    })
    .returning();

  if (!wallet) throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not create wallet');
  return wallet;
}

export async function getWalletForUser(userId: string): Promise<WalletWithOwner> {
  const [row] = await db
    .select({
      wallet: wallets,
      accountName: users.fullName,
      email: users.email,
    })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(and(eq(wallets.userId, userId), eq(wallets.currency, WALLET_CURRENCY), isNull(wallets.deletedAt)))
    .limit(1);

  if (!row) throw notFound(ErrorCodes.WALLET_NOT_FOUND, 'Wallet not found');
  return { ...row.wallet, accountName: row.accountName, email: row.email };
}

export async function getWalletForUserInTx(tx: Tx, userId: string): Promise<WalletWithOwner> {
  const [row] = await tx
    .select({ wallet: wallets, accountName: users.fullName, email: users.email })
    .from(wallets)
    .innerJoin(users, eq(users.id, wallets.userId))
    .where(and(eq(wallets.userId, userId), eq(wallets.currency, WALLET_CURRENCY), isNull(wallets.deletedAt)))
    .limit(1);
  if (!row) throw notFound(ErrorCodes.WALLET_NOT_FOUND, 'Wallet not found');
  return { ...row.wallet, accountName: row.accountName, email: row.email };
}

export interface WalletStats {
  totalReceivedMinor: bigint;
  totalSentMinor: bigint;
  monthSpentMinor: bigint;
  monthReceivedMinor: bigint;
  pendingOutMinor: bigint;
  transactionCount: number;
}

export async function getWalletStats(walletId: string): Promise<WalletStats> {
  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(amount_minor) FILTER (WHERE recipient_wallet_id = ${walletId}::uuid AND status = 'SUCCESSFUL'), 0)::text AS received,
      COALESCE(SUM(amount_minor) FILTER (WHERE sender_wallet_id = ${walletId}::uuid AND status = 'SUCCESSFUL'), 0)::text AS sent,
      COALESCE(SUM(amount_minor) FILTER (WHERE sender_wallet_id = ${walletId}::uuid AND status = 'SUCCESSFUL' AND created_at >= date_trunc('month', now())), 0)::text AS month_spent,
      COALESCE(SUM(amount_minor) FILTER (WHERE recipient_wallet_id = ${walletId}::uuid AND status = 'SUCCESSFUL' AND created_at >= date_trunc('month', now())), 0)::text AS month_received,
      COALESCE(SUM(amount_minor) FILTER (WHERE sender_wallet_id = ${walletId}::uuid AND status IN ('PENDING', 'PROCESSING')), 0)::text AS pending_out,
      COUNT(*)::text AS tx_count
    FROM transactions
    WHERE sender_wallet_id = ${walletId}::uuid OR recipient_wallet_id = ${walletId}::uuid
  `);

  const row = result.rows[0] as Record<string, string> | undefined;
  return {
    totalReceivedMinor: BigInt(row?.received ?? '0'),
    totalSentMinor: BigInt(row?.sent ?? '0'),
    monthSpentMinor: BigInt(row?.month_spent ?? '0'),
    monthReceivedMinor: BigInt(row?.month_received ?? '0'),
    pendingOutMinor: BigInt(row?.pending_out ?? '0'),
    transactionCount: Number(row?.tx_count ?? 0),
  };
}

export function serializeWalletStats(stats: WalletStats) {
  return {
    totalReceivedMinor: toApiAmount(stats.totalReceivedMinor),
    totalReceivedFormatted: formatNaira(stats.totalReceivedMinor),
    totalSentMinor: toApiAmount(stats.totalSentMinor),
    totalSentFormatted: formatNaira(stats.totalSentMinor),
    monthSpentMinor: toApiAmount(stats.monthSpentMinor),
    monthSpentFormatted: formatNaira(stats.monthSpentMinor),
    monthReceivedMinor: toApiAmount(stats.monthReceivedMinor),
    monthReceivedFormatted: formatNaira(stats.monthReceivedMinor),
    pendingOutMinor: toApiAmount(stats.pendingOutMinor),
    pendingOutFormatted: formatNaira(stats.pendingOutMinor),
    transactionCount: stats.transactionCount,
  };
}

/** Recent activity used by the dashboard card. */
export async function getRecentTransactions(walletId: string, limit = 5) {
  const rows = await db
    .select()
    .from(transactions)
    .where(sql`${transactions.senderWalletId} = ${walletId}::uuid OR ${transactions.recipientWalletId} = ${walletId}::uuid`)
    .orderBy(desc(transactions.createdAt))
    .limit(limit);

  const viewerWalletIds = new Set([walletId]);
  return rows.map((row) => serializeTransaction(row, { viewerWalletIds }));
}

export async function getFullWalletResponse(userId: string) {
  const wallet = await getWalletForUser(userId);
  const [stats, recent] = await Promise.all([getWalletStats(wallet.id), getRecentTransactions(wallet.id, 5)]);
  return {
    wallet: serializeWallet(wallet, wallet.accountName),
    stats: serializeWalletStats(stats),
    recentTransactions: recent,
  };
}

/** Ledger transparency: the user can inspect the entries behind their balance. */
export async function getWalletLedgerEntries(walletId: string, limit = 50) {
  const result = await db.execute(sql`
    SELECT e.id,
           e.direction::text AS direction,
           e.amount_minor::text AS amount_minor,
           e.created_at,
           lt.reference AS ledger_reference,
           lt.description,
           lt.type::text AS type,
           a.code AS account_code,
           a.balance_minor::text AS account_balance
      FROM ledger_entries e
      JOIN ledger_transactions lt ON lt.id = e.ledger_transaction_id
      JOIN ledger_accounts a ON a.id = e.ledger_account_id
      JOIN wallets w ON w.ledger_account_id = a.id
     WHERE w.id = ${walletId}::uuid
     ORDER BY e.created_at DESC
     LIMIT ${limit}
  `);

  return (result.rows as Array<Record<string, string>>).map((row) => ({
    id: row.id,
    direction: row.direction,
    amountMinor: Number(row.amount_minor),
    ledgerReference: row.ledger_reference,
    description: row.description,
    type: row.type,
    accountCode: row.account_code,
    accountBalanceMinor: Number(row.account_balance),
    createdAt: row.created_at,
  }));
}
