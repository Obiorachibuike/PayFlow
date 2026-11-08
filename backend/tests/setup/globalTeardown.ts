import EmbeddedPostgres from 'embedded-postgres';

declare global {
  // eslint-disable-next-line no-var
  var __PAYFLOW_PG__: EmbeddedPostgres | undefined;
}

/** Stops the throwaway PostgreSQL cluster started in globalSetup. */
export default async function globalTeardown(): Promise<void> {
  const pg = globalThis.__PAYFLOW_PG__;
  if (!pg) return;
  try {
    await pg.stop();
  } catch {
    // The server may already have exited; nothing else to do.
  }
}
