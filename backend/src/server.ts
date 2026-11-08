import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { checkDatabaseHealth, closeDatabase } from './db';
import { runMigrations } from './db/migrate';

async function main(): Promise<void> {
  if (process.env.RUN_MIGRATIONS_ON_BOOT === 'true') {
    const applied = await runMigrations();
    logger.info({ applied }, 'Database migrations checked');
  }

  const health = await checkDatabaseHealth();
  if (!health.ok) {
    logger.error('Database is not reachable — starting anyway so /api/health reports the problem');
  }

  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, demoMode: env.DEMO_MODE },
      `PayFlow API listening on http://0.0.0.0:${env.PORT}`,
    );
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down PayFlow API');
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start PayFlow API');
  process.exit(1);
});
