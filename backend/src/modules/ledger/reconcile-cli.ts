/**
 * Ledger reconciliation CLI.
 *
 * Verifies the two invariants that keep PayFlow honest:
 *   1. every ledger transaction balances (debits === credits), and
 *   2. every wallet's cached balance equals the sum of its ledger entries.
 *
 * Run with `npm run db:reconcile`. Exits non-zero when anything drifts, so it
 * can be wired into CI or a cron job.
 */
import { withTransaction } from '../../db/transaction';
import { closeDatabase } from '../../db';
import { reconcileLedger, type ReconciliationResult } from './ledger.service';

function formatMinor(minor: string): string {
  return (BigInt(minor) / 100n).toLocaleString('en-NG', { minimumFractionDigits: 2 });
}

async function main(): Promise<void> {
  const result: ReconciliationResult = await withTransaction((tx) => reconcileLedger(tx));

  /* eslint-disable no-console */
  console.log('PayFlow ledger reconciliation');
  console.log('─────────────────────────────');
  console.log(`Accounts checked:   ${result.accountsChecked}`);
  console.log(`Wallets checked:    ${result.walletsChecked}`);
  console.log(`Total debits (₦):   ${formatMinor(result.totalDebitsMinor)}`);
  console.log(`Total credits (₦):  ${formatMinor(result.totalCreditsMinor)}`);
  console.log(`Discrepancies:      ${result.discrepancies.length}`);

  if (result.ok) {
    console.log('\n✅ Ledger is balanced and every wallet matches its ledger entries.');
    return;
  }

  console.error('\n❌ Ledger discrepancies detected:');
  for (const discrepancy of result.discrepancies) {
    console.error(
      `  • ${discrepancy.kind} ${discrepancy.id}: expected ₦${formatMinor(
        discrepancy.expectedMinor,
      )}, found ₦${formatMinor(discrepancy.actualMinor)}`,
    );
  }
  /* eslint-enable no-console */

  throw new Error(`Ledger reconciliation failed with ${result.discrepancies.length} discrepancy(ies)`);
}

main()
  .then(() => closeDatabase())
  .then(() => process.exit(0))
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error);
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
