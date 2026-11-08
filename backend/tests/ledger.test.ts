import request from 'supertest';
import { pool } from '../src/db';
import { withTransaction } from '../src/db/transaction';
import {
  postLedgerTransaction,
  reconcileLedger,
  SYSTEM_LEDGER_ACCOUNTS,
} from '../src/modules/ledger/ledger.service';
import { AppError } from '../src/utils/errors';
import {
  authHeader,
  closePool,
  fundWallet,
  getApp,
  idempotencyKey,
  registerUser,
  resetDatabase,
  type TestUser,
} from './helpers/harness';

const app = getApp();

let alice: TestUser;
let bob: TestUser;

beforeEach(async () => {
  await resetDatabase();
  alice = await registerUser();
  bob = await registerUser();
  await fundWallet(alice, 200_000);
});

afterAll(async () => {
  await closePool();
});

async function transfer(amountMinor: number) {
  return request(app)
    .post('/api/transfers')
    .set({ ...authHeader(alice), 'Idempotency-Key': idempotencyKey('ledger') })
    .send({ recipient: { email: bob.email }, amountMinor, pin: alice.pin });
}

describe('double-entry ledger', () => {
  it('keeps every ledger transaction balanced', async () => {
    await transfer(50_000);
    await transfer(25_000);

    const unbalanced = await pool.query(`
      SELECT lt.id
        FROM ledger_transactions lt
        JOIN ledger_entries e ON e.ledger_transaction_id = lt.id
       GROUP BY lt.id
      HAVING SUM(CASE WHEN e.direction = 'DEBIT' THEN e.amount_minor ELSE 0 END)
          <> SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount_minor ELSE 0 END)
    `);
    expect(unbalanced.rows).toHaveLength(0);

    const totals = await pool.query(`
      SELECT
        COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'DEBIT'), 0)::text AS debits,
        COALESCE(SUM(amount_minor) FILTER (WHERE direction = 'CREDIT'), 0)::text AS credits
      FROM ledger_entries
    `);
    expect(totals.rows[0].debits).toBe(totals.rows[0].credits);
  });

  it('derives the wallet balance from the ledger and reconciles cleanly', async () => {
    await transfer(50_000);

    const wallets = await pool.query(`
      SELECT w.id, w.balance_minor::text AS wallet_balance, a.balance_minor::text AS account_balance
        FROM wallets w
        JOIN ledger_accounts a ON a.id = w.ledger_account_id
       ORDER BY w.created_at
    `);

    for (const row of wallets.rows) {
      expect(row.wallet_balance).toBe(row.account_balance);
    }

    const [aliceWallet] = wallets.rows;
    expect(Number(aliceWallet.wallet_balance)).toBe(150_000);

    const reconciliation = await withTransaction((tx) => reconcileLedger(tx));
    expect(reconciliation.ok).toBe(true);
    expect(reconciliation.discrepancies).toHaveLength(0);
    expect(reconciliation.totalDebitsMinor).toBe(reconciliation.totalCreditsMinor);
  });

  it('writes the expected entries for a funding and an internal transfer', async () => {
    await transfer(50_000);

    const funding = await pool.query(`
      SELECT a.code, e.direction::text AS direction, e.amount_minor::text AS amount
        FROM ledger_entries e
        JOIN ledger_accounts a ON a.id = e.ledger_account_id
        JOIN ledger_transactions lt ON lt.id = e.ledger_transaction_id
       WHERE lt.type = 'FUNDING'
       ORDER BY a.code
    `);
    expect(funding.rows).toEqual([
      { code: 'SYS:PAYMENT_CLEARING', direction: 'DEBIT', amount: '200000' },
      { code: expect.stringMatching(/^WALLET:/), direction: 'CREDIT', amount: '200000' },
    ]);

    const transferEntries = await pool.query(`
      SELECT a.code, e.direction::text AS direction, e.amount_minor::text AS amount
        FROM ledger_entries e
        JOIN ledger_accounts a ON a.id = e.ledger_account_id
        JOIN ledger_transactions lt ON lt.id = e.ledger_transaction_id
       WHERE lt.type = 'TRANSFER_OUT'
    `);
    expect(transferEntries.rows).toHaveLength(2);
    expect(transferEntries.rows.filter((row) => row.direction === 'DEBIT')).toHaveLength(1);
    expect(transferEntries.rows.filter((row) => row.direction === 'CREDIT')).toHaveLength(1);
  });

  it('makes ledger entries immutable at the database level', async () => {
    const entry = await pool.query('SELECT id FROM ledger_entries LIMIT 1');
    const entryId = entry.rows[0].id as string;

    await expect(
      pool.query('UPDATE ledger_entries SET amount_minor = 1 WHERE id = $1', [entryId]),
    ).rejects.toThrow(/append-only/);

    await expect(pool.query('DELETE FROM ledger_entries WHERE id = $1', [entryId])).rejects.toThrow(
      /append-only/,
    );
  });

  it('rejects unbalanced ledger transactions', async () => {
    const wallet = await pool.query(
      `SELECT ledger_account_id FROM wallets WHERE user_id = $1`,
      [alice.id],
    );
    const walletAccountId = wallet.rows[0].ledger_account_id as string;

    await expect(
      withTransaction((tx) =>
        postLedgerTransaction(tx, {
          type: 'ADJUSTMENT',
          description: 'Deliberately unbalanced',
          legs: [
            { ledgerAccountId: walletAccountId, direction: 'DEBIT', amountMinor: 1_000n },
            {
              ledgerAccountId: SYSTEM_LEDGER_ACCOUNTS.PAYMENT_CLEARING,
              direction: 'CREDIT',
              amountMinor: 999n,
            },
          ],
        }),
      ),
    ).rejects.toThrow(/Unbalanced ledger transaction/);
  });

  it('refuses to overdraw a wallet even if called directly', async () => {
    const wallet = await pool.query(
      `SELECT ledger_account_id, balance_minor::text AS balance FROM wallets WHERE user_id = $1`,
      [bob.id],
    );
    const walletAccountId = wallet.rows[0].ledger_account_id as string;
    expect(Number(wallet.rows[0].balance)).toBe(0);

    await expect(
      withTransaction((tx) =>
        postLedgerTransaction(tx, {
          type: 'TRANSFER_OUT',
          description: 'Overdraw attempt',
          legs: [
            { ledgerAccountId: walletAccountId, direction: 'DEBIT', amountMinor: 5_000n },
            {
              ledgerAccountId: SYSTEM_LEDGER_ACCOUNTS.PAYMENT_CLEARING,
              direction: 'CREDIT',
              amountMinor: 5_000n,
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('never credits a demo payment twice', async () => {
    const init = await request(app)
      .post('/api/payments/initialize')
      .set({ ...authHeader(bob), 'Idempotency-Key': idempotencyKey('double') })
      .send({ amountMinor: 40_000, channel: 'DEMO' });

    const reference = init.body.data.reference;

    const first = await request(app)
      .post('/api/payments/demo/confirm')
      .set(authHeader(bob))
      .send({ reference });
    expect(first.status).toBe(200);
    expect(first.body.data.credited).toBe(true);

    const second = await request(app)
      .post('/api/payments/demo/confirm')
      .set(authHeader(bob))
      .send({ reference });
    expect(second.status).toBe(200);
    expect(second.body.data.credited).toBe(false);
    expect(second.body.data.alreadyProcessed).toBe(true);

    const balance = await request(app).get('/api/wallet/balance').set(authHeader(bob));
    expect(balance.body.data.balanceMinor).toBe(40_000);

    const fundingEntries = await pool.query(`
      SELECT count(*)::int AS count
        FROM ledger_entries e
        JOIN ledger_transactions lt ON lt.id = e.ledger_transaction_id
       WHERE lt.type = 'FUNDING'
    `);
    // 1 seeded funding (alice) + 1 for bob's top-up.
    expect(fundingEntries.rows[0].count).toBe(4);
  });

  it('exposes the wallet ledger entries to its owner', async () => {
    const response = await request(app).get('/api/wallet/ledger').set(authHeader(alice));
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data[0]).toMatchObject({
      direction: expect.stringMatching(/^(DEBIT|CREDIT)$/),
      ledgerReference: expect.stringMatching(/^LTX-/),
      accountCode: expect.stringMatching(/^WALLET:/),
    });
  });
});
