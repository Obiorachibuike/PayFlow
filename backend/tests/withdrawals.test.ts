import request from 'supertest';
import { pool } from '../src/db';
import { withTransaction } from '../src/db/transaction';
import { reconcileLedger } from '../src/modules/ledger/ledger.service';
import {
  authHeader,
  closePool,
  fundWallet,
  getApp,
  getBalance,
  idempotencyKey,
  registerUser,
  resetDatabase,
  type TestUser,
} from './helpers/harness';

const app = getApp();

let alice: TestUser;

beforeEach(async () => {
  await resetDatabase();
  alice = await registerUser({ fullName: 'Alice Adeyemi' });
  await fundWallet(alice, 500_000); // ₦5,000.00
});

afterAll(async () => {
  await closePool();
});

function withdraw(body: Record<string, unknown>, key = idempotencyKey('withdraw')) {
  return request(app)
    .post('/api/withdrawals')
    .set({ ...authHeader(alice), 'Idempotency-Key': key })
    .send(body);
}

const adHocAccount = {
  bankCode: '058',
  bankName: 'GTBank',
  accountName: 'Ada Test',
  accountNumber: '0123456789',
};

describe('simulated withdrawals', () => {
  it('moves money out of the wallet and records a demonstrably simulated payout', async () => {
    const balanceBefore = await getBalance(alice);

    const response = await withdraw({ ...adHocAccount, amountMinor: 120_000, pin: alice.pin });

    expect(response.status).toBe(201);
    expect(response.body.data.withdrawal).toMatchObject({
      status: 'SUCCESSFUL',
      amountMinor: 120_000,
      bankName: 'GTBank',
      accountName: 'Ada Test',
      accountNumberMasked: '******6789',
      simulated: true,
    });
    expect(response.body.data.receipt.simulated).toBe(true);
    expect(response.body.data.receipt.branding.name).toBe('PayFlow');

    expect(await getBalance(alice)).toBe(balanceBefore - 120_000);
  });

  it('keeps the ledger balanced and the wallet balance reconcilable', async () => {
    await withdraw({ ...adHocAccount, amountMinor: 150_000, pin: alice.pin });

    const result = await withTransaction((tx) => reconcileLedger(tx));
    expect(result.ok).toBe(true);
    expect(result.discrepancies).toHaveLength(0);

    const rows = await pool.query<{ wallet_id: string; balance_minor: string; ledger_balance: string }>(`
      SELECT w.id AS wallet_id,
             w.balance_minor::text AS balance_minor,
             COALESCE(SUM(
               CASE WHEN e.direction = 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END
             ), 0)::text AS ledger_balance
        FROM wallets w
        JOIN ledger_entries e ON e.ledger_account_id = w.ledger_account_id
       GROUP BY w.id, w.balance_minor
    `);

    for (const row of rows.rows) {
      expect(row.balance_minor).toBe(row.ledger_balance);
    }
  });

  it('rejects a withdrawal signed with the wrong PIN and does not move money', async () => {
    const balanceBefore = await getBalance(alice);
    const response = await withdraw({ ...adHocAccount, amountMinor: 100_000, pin: '9999' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PIN_INVALID');
    expect(await getBalance(alice)).toBe(balanceBefore);
  });

  it('refuses to overdraw the wallet', async () => {
    const response = await withdraw({ ...adHocAccount, amountMinor: 5_000_000, pin: alice.pin });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await getBalance(alice)).toBe(500_000);
  });

  it('enforces the minimum and maximum withdrawal limits', async () => {
    const tooSmall = await withdraw({ ...adHocAccount, amountMinor: 500, pin: alice.pin });
    expect(tooSmall.status).toBe(400);
    expect(tooSmall.body.error.code).toBe('LIMIT_EXCEEDED');

    const tooLarge = await withdraw({ ...adHocAccount, amountMinor: 900_000_000, pin: alice.pin });
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.error.code).toBe('LIMIT_EXCEEDED');

    expect(await getBalance(alice)).toBe(500_000);
  });

  it('requires either a saved beneficiary or full bank details', async () => {
    const response = await withdraw({ amountMinor: 100_000, pin: alice.pin });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('validates the account number format', async () => {
    const response = await withdraw({
      ...adHocAccount,
      accountNumber: '123',
      amountMinor: 100_000,
      pin: alice.pin,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires an idempotency key', async () => {
    const response = await request(app)
      .post('/api/withdrawals')
      .set(authHeader(alice))
      .send({ ...adHocAccount, amountMinor: 100_000, pin: alice.pin });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('debits the wallet exactly once for a repeated idempotency key', async () => {
    const key = idempotencyKey('withdraw-once');
    const body = { ...adHocAccount, amountMinor: 70_000, pin: alice.pin };

    const first = await withdraw(body, key);
    const second = await withdraw(body, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.withdrawal.reference).toBe(first.body.data.withdrawal.reference);
    expect(await getBalance(alice)).toBe(500_000 - 70_000);
  });

  it('refuses to reuse an idempotency key with a different payload', async () => {
    const key = idempotencyKey('withdraw-reuse');
    await withdraw({ ...adHocAccount, amountMinor: 70_000, pin: alice.pin }, key);

    const response = await withdraw({ ...adHocAccount, amountMinor: 80_000, pin: alice.pin }, key);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await getBalance(alice)).toBe(500_000 - 70_000);
  });

  it('can withdraw to a saved beneficiary', async () => {
    const beneficiary = await request(app)
      .post('/api/beneficiaries')
      .set(authHeader(alice))
      .send({ bankCode: '044', accountNumber: '0987654321', accountName: 'Access Savings' });

    expect(beneficiary.status).toBe(201);
    expect(beneficiary.body.data.verificationStatus).toBe('UNVERIFIED');
    expect(beneficiary.body.data.verified).toBe(false);

    const response = await withdraw({
      beneficiaryId: beneficiary.body.data.id,
      amountMinor: 100_000,
      pin: alice.pin,
      narration: 'Rent',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.withdrawal).toMatchObject({
      bankName: 'Access Bank',
      accountName: 'Access Savings',
      accountNumberMasked: '******4321',
    });
  });

  it('notifies the user that the payout was simulated', async () => {
    await withdraw({ ...adHocAccount, amountMinor: 100_000, pin: alice.pin });

    const notifications = await request(app).get('/api/notifications').set(authHeader(alice));
    expect(notifications.status).toBe(200);

    const types = notifications.body.data.map((item: { type: string }) => item.type);
    expect(types).toContain('WITHDRAWAL_PROCESSED');

    const withdrawalNote = notifications.body.data.find(
      (item: { type: string }) => item.type === 'WITHDRAWAL_PROCESSED',
    );
    expect(withdrawalNote.body).toMatch(/demo/i);
  });

  it('lists withdrawals and exposes a single withdrawal to its owner', async () => {
    const created = await withdraw({ ...adHocAccount, amountMinor: 100_000, pin: alice.pin });
    const id = created.body.data.withdrawal.withdrawalId;

    const list = await request(app).get('/api/withdrawals').set(authHeader(alice));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(id);

    const single = await request(app).get(`/api/withdrawals/${id}`).set(authHeader(alice));
    expect(single.status).toBe(200);
    expect(single.body.data.id).toBe(id);
  });

  it('hides another user’s withdrawal', async () => {
    const created = await withdraw({ ...adHocAccount, amountMinor: 100_000, pin: alice.pin });
    const intruder = await registerUser({ fullName: 'Mallory Musa' });

    const response = await request(app)
      .get(`/api/withdrawals/${created.body.data.withdrawal.withdrawalId}`)
      .set(authHeader(intruder));

    expect(response.status).toBe(404);
  });

  it('records the withdrawal in the audit log', async () => {
    await withdraw({ ...adHocAccount, amountMinor: 100_000, pin: alice.pin });

    const audit = await pool.query<{ action: string; metadata: unknown }>(
      `SELECT action, metadata FROM audit_logs WHERE action = 'withdrawal.simulated'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.metadata).toMatchObject({ simulated: true });
  });
});
