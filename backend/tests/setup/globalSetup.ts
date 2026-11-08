import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { runMigrations } from '../../src/db/migrate';

const PORT = 55433;
const DATABASE = 'payflow_test';
const DATA_DIR = process.env.PAYFLOW_TEST_DB_DIR ?? '/tmp/payflow-test-pgdata';
const CONNECTION_STRING = `postgresql://payflow:payflow@127.0.0.1:${PORT}/${DATABASE}`;

declare global {
  // eslint-disable-next-line no-var
  var __PAYFLOW_PG__: EmbeddedPostgres | undefined;
}

async function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Boots a throwaway PostgreSQL cluster for the whole Jest run and applies the
 * real SQL migrations. This makes the ledger tests genuinely end-to-end.
 */
export default async function globalSetup(): Promise<void> {
  const fresh = !fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'payflow',
    password: 'payflow',
    port: PORT,
    database: DATABASE,
    persistent: false,
  });

  if (fresh) {
    await pg.initialise();
  }

  // Reuse an already-running cluster (e.g. left over from a previous run).
  if (!(await isPortOpen(PORT))) {
    await pg.start();
  }

  try {
    await pg.createDatabase(DATABASE);
  } catch (error) {
    if (!String((error as Error).message).includes('already exists')) throw error;
  }

  await runMigrations(CONNECTION_STRING);

  globalThis.__PAYFLOW_PG__ = pg;
}
