import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { env } from '../config/env';

/**
 * Minimal, deterministic SQL migration runner.
 *
 * Migrations live in `backend/drizzle/*.sql` and are applied in filename order.
 * Applied migrations are tracked in `schema_migrations`, so the runner is safe to
 * execute on every boot (used by the local preview script and by CI).
 */
export const MIGRATIONS_DIR = path.resolve(__dirname, '../../drizzle');

export async function runMigrations(connectionString = env.DATABASE_URL): Promise<string[]> {
  const pool = new Pool({ connectionString, max: 2 });
  const applied: string[] = [];
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((row) => row.name));

    for (const file of files) {
      if (done.has(file)) continue;
      const sqlText = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sqlText);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
  return applied;
}

if (require.main === module) {
  runMigrations()
    .then((applied) => {
      // eslint-disable-next-line no-console
      console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Database already up to date');
      process.exit(0);
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exit(1);
    });
}
