#!/usr/bin/env node
/**
 * Local development database for PayFlow.
 *
 * Starts a real PostgreSQL server (binaries bundled with the `embedded-postgres`
 * npm package) inside /tmp so contributors don't need a system install, applies
 * migrations and seeds demo data.
 *
 * Usage:
 *   node scripts/dev-db.mjs            # start + migrate + seed
 *   node scripts/dev-db.mjs --reset    # wipe data and start fresh
 *
 * The connection string is printed at the end — put it in backend/.env.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');

const PORT = Number(process.env.PAYFLOW_DB_PORT ?? 55432);
const USER = 'payflow';
const PASSWORD = 'payflow';
const DATABASE = 'payflow';
const dataDir = process.env.PAYFLOW_DB_DIR ?? '/tmp/payflow-pgdata';
const reset = process.argv.includes('--reset');

if (reset && fs.existsSync(dataDir)) {
  fs.rmSync(dataDir, { recursive: true, force: true });
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  database: DATABASE,
  persistent: true,
});

const connectionString = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`;

async function main() {
  const fresh = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  if (fresh) {
    console.log('▶ Initialising PostgreSQL cluster in', dataDir);
    await pg.initialise();
  }

  console.log('▶ Starting PostgreSQL on port', PORT);
  await pg.start();

  // `initialise()` creates the cluster, not the application database.
  try {
    await pg.createDatabase(DATABASE);
    console.log('▶ Created database', DATABASE);
  } catch (error) {
    if (!String(error?.message ?? error).includes('already exists')) throw error;
  }

  console.log('▶ Applying migrations');
  execFileSync('npx', ['tsx', 'src/db/migrate.ts'], {
    cwd: backendDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: connectionString },
  });

  console.log('▶ Seeding demo data');
  execFileSync('npx', ['tsx', 'scripts/seed.ts'], {
    cwd: backendDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: connectionString },
  });

  console.log('\n✅ PayFlow database ready');
  console.log('   DATABASE_URL=' + connectionString);
  console.log('   Press Ctrl+C to stop.\n');

  const shutdown = async () => {
    console.log('\n▶ Stopping PostgreSQL');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(async (error) => {
  console.error('Failed to start the development database:', error);
  try {
    await pg.stop();
  } catch {}
  process.exit(1);
});
