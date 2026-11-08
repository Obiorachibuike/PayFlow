import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  ledgerTransactions,
  payments,
  transactions,
  transfers,
  wallets,
  withdrawals,
} from '../../db/schema';
import type { Transaction } from '../../db/schema';
import { ErrorCodes, notFound } from '../../utils/errors';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../utils/pagination';
import { serializeReceipt, serializeTransaction } from '../../utils/serializers';

export async function getUserWalletIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), isNull(wallets.deletedAt)));
  return rows.map((row) => row.id);
}

export interface ListTransactionsOptions {
  userId: string;
  limit: number;
  cursor?: string;
  status?: Transaction['status'] | 'ALL';
  type?: Transaction['type'] | 'ALL';
  direction?: 'in' | 'out' | 'ALL';
  search?: string;
  from?: Date;
  to?: Date;
}

export interface TransactionListItem {
  id: string;
  walletIds: Set<string>;
  row: Transaction;
}

export async function listTransactions(options: ListTransactionsOptions) {
  const walletIds = await getUserWalletIds(options.userId);
  if (walletIds.length === 0) {
    return { items: [], meta: { limit: options.limit, hasMore: false, nextCursor: null } };
  }

  const conditions = [
    or(inArray(transactions.senderWalletId, walletIds), inArray(transactions.recipientWalletId, walletIds)),
  ];

  if (options.direction === 'in') conditions.push(inArray(transactions.recipientWalletId, walletIds));
  if (options.direction === 'out') conditions.push(inArray(transactions.senderWalletId, walletIds));
  if (options.status && options.status !== 'ALL') conditions.push(eq(transactions.status, options.status));
  if (options.type && options.type !== 'ALL') conditions.push(eq(transactions.type, options.type));
  if (options.from) conditions.push(gte(transactions.createdAt, options.from));
  if (options.to) conditions.push(lte(transactions.createdAt, options.to));

  if (options.search) {
    const term = `%${options.search.trim()}%`;
    conditions.push(
      or(
        sql`${transactions.reference} ILIKE ${term}`,
        sql`COALESCE(${transactions.description}, '') ILIKE ${term}`,
        sql`COALESCE(${transactions.senderName}, '') ILIKE ${term}`,
        sql`COALESCE(${transactions.recipientName}, '') ILIKE ${term}`,
      )!,
    );
  }

  if (options.cursor) {
    const cursor = decodeKeysetCursor(options.cursor);
    conditions.push(
      sql`(${transactions.createdAt}, ${transactions.id}) < (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
    );
  }

  const rows = await db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.createdAt), desc(transactions.id))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const last = page[page.length - 1];
  const viewerWalletIds = new Set(walletIds);

  return {
    items: page.map((row) => serializeTransaction(row, { viewerWalletIds })),
    meta: {
      limit: options.limit,
      hasMore,
      nextCursor: hasMore && last ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id }) : null,
      count: page.length,
    },
  };
}

export interface TransactionDetail {
  transaction: Transaction;
  withdrawal: {
    bankName: string;
    accountName: string;
    accountNumberLast4: string;
    simulated: boolean;
    beneficiaryId: string | null;
  } | null;
  ledgerReference: string | null;
}

export async function getTransactionForUser(userId: string, transactionId: string): Promise<TransactionDetail> {
  const walletIds = await getUserWalletIds(userId);

  const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
  if (!row) throw notFound(ErrorCodes.TRANSACTION_NOT_FOUND, 'Transaction not found');

  const participates =
    row.initiatedByUserId === userId ||
    (row.senderWalletId !== null && walletIds.includes(row.senderWalletId)) ||
    (row.recipientWalletId !== null && walletIds.includes(row.recipientWalletId));

  if (!participates) {
    throw notFound(ErrorCodes.TRANSACTION_NOT_FOUND, 'Transaction not found');
  }

  const [withdrawalRow] = await db.select().from(withdrawals).where(eq(withdrawals.transactionId, row.id)).limit(1);
  const [ledgerRow] = await db
    .select({ reference: ledgerTransactions.reference })
    .from(ledgerTransactions)
    .where(eq(ledgerTransactions.transactionId, row.id))
    .limit(1);

  return {
    transaction: row,
    withdrawal: withdrawalRow
      ? {
          bankName: withdrawalRow.bankName,
          accountName: withdrawalRow.accountName,
          accountNumberLast4: withdrawalRow.accountNumberLast4,
          simulated: withdrawalRow.simulated,
          beneficiaryId: withdrawalRow.beneficiaryId,
        }
      : null,
    ledgerReference: ledgerRow?.reference ?? null,
  };
}

export async function getTransactionResponse(userId: string, transactionId: string) {
  const walletIds = await getUserWalletIds(userId);
  const detail = await getTransactionForUser(userId, transactionId);
  return {
    ...serializeTransaction(detail.transaction, { viewerWalletIds: new Set(walletIds) }),
    withdrawal: detail.withdrawal,
    ledgerReference: detail.ledgerReference,
  };
}

export async function buildReceipt(userId: string, transactionId: string) {
  const walletIds = await getUserWalletIds(userId);
  const detail = await getTransactionForUser(userId, transactionId);
  const { transaction } = detail;

  const [senderWallet] = transaction.senderWalletId
    ? await db
        .select({ walletTag: wallets.walletTag })
        .from(wallets)
        .where(eq(wallets.id, transaction.senderWalletId))
        .limit(1)
    : [];
  const [recipientWallet] = transaction.recipientWalletId
    ? await db
        .select({ walletTag: wallets.walletTag })
        .from(wallets)
        .where(eq(wallets.id, transaction.recipientWalletId))
        .limit(1)
    : [];
  const [payment] = await db.select().from(payments).where(eq(payments.transactionId, transaction.id)).limit(1);

  void walletIds;

  return serializeReceipt({
    transaction,
    ledgerReference: detail.ledgerReference,
    senderWalletTag: senderWallet?.walletTag ?? null,
    recipientWalletTag: recipientWallet?.walletTag ?? null,
    withdrawal: detail.withdrawal,
    payment: payment ?? null,
  });
}

export async function getTransferByTransactionId(transactionId: string) {
  const [row] = await db.select().from(transfers).where(eq(transfers.transactionId, transactionId)).limit(1);
  return row ?? null;
}
