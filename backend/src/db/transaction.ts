import { sql } from 'drizzle-orm';
import { db } from './index';
import type { Tx } from './index';
import { logger } from '../config/logger';

export type IsolationLevel = 'read committed' | 'repeatable read' | 'serializable';

interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  /** Retries on serialisation failures / deadlocks. Only ever used for idempotent work. */
  maxRetries?: number;
  label?: string;
}

const RETRYABLE_CODES = new Set(['40001', '40P01']);

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * Runs `fn` inside a database transaction. Financial mutations always run at
 * SERIALIZABLE isolation so that concurrent balance checks cannot interleave.
 */
export async function withTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  { isolationLevel = 'serializable', maxRetries = 3, label = 'transaction' }: TransactionOptions = {},
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      return await db.transaction(
        async (tx) => {
          // Fail fast instead of queueing indefinitely behind a lock holder.
          await tx.execute(sql`SET LOCAL lock_timeout = '8s'`);
          await tx.execute(sql`SET LOCAL statement_timeout = '20s'`);
          return fn(tx);
        },
        { isolationLevel },
      );
    } catch (error) {
      const code = errorCode(error);
      const retryable = code !== undefined && RETRYABLE_CODES.has(code);
      if (!retryable || attempt >= maxRetries) {
        throw error;
      }
      const delay = 25 * attempt + Math.floor(Math.random() * 25);
      logger.warn({ code, attempt, label }, 'Retrying database transaction after a serialisation conflict');
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Locks a set of rows with `SELECT ... FOR UPDATE` in a deterministic order to
 * avoid deadlocks between concurrent transfers.
 */
export async function lockLedgerAccounts(tx: Tx, accountIds: string[]): Promise<Map<string, { id: string; balanceMinor: bigint; type: string; code: string }>> {
  const unique = [...new Set(accountIds)].sort();
  if (unique.length === 0) return new Map();
  const rows = await tx.execute(
    sql`SELECT id, balance_minor AS "balanceMinor", type::text AS type, code
          FROM ledger_accounts
         WHERE id IN (${sql.join(unique.map((id) => sql`${id}::uuid`), sql`, `)})
         ORDER BY id
           FOR UPDATE`,
  );
  const result = new Map<string, { id: string; balanceMinor: bigint; type: string; code: string }>();
  for (const row of rows.rows as Array<{ id: string; balanceMinor: string; type: string; code: string }>) {
    result.set(row.id, {
      id: row.id,
      balanceMinor: BigInt(row.balanceMinor),
      type: row.type,
      code: row.code,
    });
  }
  return result;
}
