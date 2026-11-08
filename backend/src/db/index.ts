import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env, isTest } from '../config/env';
import { logger } from '../config/logger';
import * as schema from './schema';

/**
 * Connection pool. Tests use a single connection so that row locks and
 * statement-level state are predictable.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: isTest ? 10 : 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'payflow-api',
});

pool.on('error', (error) => {
  logger.error({ err: error }, 'Unexpected PostgreSQL pool error');
});

export const db = drizzle(pool, { schema });

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbClient = Database | Tx;

export async function checkDatabaseHealth(): Promise<{ ok: boolean; latencyMs: number }> {
  const startedAt = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch {
    return { ok: false, latencyMs: Date.now() - startedAt };
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export { schema };
