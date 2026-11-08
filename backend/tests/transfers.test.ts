import request from 'supertest';
import { pool } from '../src/db';
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
let bob: TestUser;

beforeEach(async () => {
  await resetDatabase();
  alice = await registerUser({ fullName: 'Alice Adeyemi' });
  bob = await registerUser({ fullName: 'Bob Balogun' });
  await fundWallet(alice, 100_000); // ₦1,000.00
});

afterAll(async () => {
  await closePool();
});

function sendTransfer(
  user: TestUser,
  body: Record<string, unknown>,
  key = idempotencyKey('transfer'),
) {
  return request(app)
    .post('/api/transfers')
    .set({ ...authHeader(user), 'Idempotency-Key': key })
    .send(body);
}

describe('POST /api/transfers/resolve-recipient', () => {
  it('resolves a recipient by email, phone and wallet tag', async () => {
    for (const recipient of [{ email: bob.email }, { phone: bob.phone }, { walletTag: bob.walletTag }]) {
      const response = await request(app)
        .post('/api/transfers/resolve-recipient')
        .set(authHeader(alice))
        .send(recipient);
      expect(response.status).toBe(200);
      expect(response.body.data.recipient.name).toBe('Bob Balogun');
      expect(response.body.data.recipient.maskedWalletTag).toMatch(/^PF-\*\*\*\*-\d{4}$/);
    }
  });

  it('returns 404 for an unknown recipient', async () => {
    const response = await request(app)
      .post('/api/transfers/resolve-recipient')
      .set(authHeader(alice))
      .send({ email: 'nobody@payflow.test' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RECIPIENT_NOT_FOUND');
  });
});

describe('POST /api/transfers', () => {
  it('moves money atomically between wallets and returns a receipt', async () => {
    const response = await sendTransfer(alice, {
      recipient: { email: bob.email },
      amountMinor: 25_000,
      description: 'Lunch',
      pin: alice.pin,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.transaction.status).toBe('SUCCESSFUL');
    expect(response.body.data.transaction.amountMinor).toBe(25_000);
    expect(response.body.data.walletBalanceMinor).toBe(75_000);
    expect(response.body.data.receipt.reference).toBe(response.body.data.transaction.reference);
    expect(response.body.data.receipt.simulated).toBe(true);

    expect(await getBalance(alice)).toBe(75_000);
    expect(await getBalance(bob)).toBe(25_000);

    // The recipient sees the same journal row from the incoming side.
    const bobFeed = await request(app).get('/api/transactions').set(authHeader(bob));
    expect(bobFeed.body.data).toHaveLength(1);
    expect(bobFeed.body.data[0].direction).toBe('in');
    expect(bobFeed.body.data[0].title).toBe('Transfer from Alice Adeyemi');
    expect(bobFeed.body.data[0].signedAmountMinor).toBe(25_000);
  });

  it('rejects transfers that exceed the available balance', async () => {
    const response = await sendTransfer(alice, {
      recipient: { email: bob.email },
      amountMinor: 500_000,
      pin: alice.pin,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await getBalance(alice)).toBe(100_000);
    expect(await getBalance(bob)).toBe(0);

    const rows = await pool.query('SELECT count(*)::int AS count FROM transfers');
    expect(rows.rows[0].count).toBe(0);
  });

  it('rejects a transfer to your own wallet', async () => {
    const response = await sendTransfer(alice, {
      recipient: { walletTag: alice.walletTag },
      amountMinor: 10_000,
      pin: alice.pin,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SELF_TRANSFER');
  });

  it('requires the transaction PIN and rejects a wrong one', async () => {
    const wrong = await sendTransfer(alice, {
      recipient: { email: bob.email },
      amountMinor: 10_000,
      pin: '9999',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('PIN_INVALID');

    const missing = await sendTransfer(alice, undefined as never, idempotencyKey());
    expect(missing.status).toBe(400);

    const correct = await sendTransfer(alice, {
      recipient: { email: bob.email },
      amountMinor: 10_000,
      pin: alice.pin,
    });
    expect(correct.status).toBe(201);
  });

  it('requires a transaction PIN to be configured', async () => {
    const carol = await registerUser({ setPin: false });
    await fundWallet(carol, 50_000);

    const response = await sendTransfer(carol, {
      recipient: { email: bob.email },
      amountMinor: 10_000,
      pin: '1234',
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PIN_NOT_SET');
  });

  it('enforces minimum and maximum transfer amounts', async () => {
    const tooSmall = await sendTransfer(alice, {
      recipient: { email: bob.email },
      amountMinor: 100,
      pin: alice.pin,
    });
    expect(tooSmall.status).toBe(400);
    expect(tooSmall.body.error.code).toBe('LIMIT_EXCEEDED');

    const tooLarge = await sendTransfer(alice, {
      recipient: { email: bob.email },
      amountMinor: 50_000_001,
      pin: alice.pin,
    });
    expect(tooLarge.status).toBe(400);
  });

  it('requires an idempotency key', async () => {
    const response = await request(app)
      .post('/api/transfers')
      .set(authHeader(alice))
      .send({ recipient: { email: bob.email }, amountMinor: 10_000, pin: alice.pin });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('replays the original result when the same idempotency key is retried', async () => {
    const key = idempotencyKey('retry');
    const payload = { recipient: { email: bob.email }, amountMinor: 10_000, pin: alice.pin };

    const first = await sendTransfer(alice, payload, key);
    const second = await sendTransfer(alice, payload, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.transaction.reference).toBe(first.body.data.transaction.reference);

    expect(await getBalance(bob)).toBe(10_000);
    const rows = await pool.query('SELECT count(*)::int AS count FROM transfers');
    expect(rows.rows[0].count).toBe(1);
  });

  it('executes only once when the same key is sent concurrently', async () => {
    const key = idempotencyKey('concurrent');
    const payload = { recipient: { email: bob.email }, amountMinor: 10_000, pin: alice.pin };

    const [first, second] = await Promise.all([
      sendTransfer(alice, payload, key),
      sendTransfer(alice, payload, key),
    ]);

    // Either the loser waits and replays the stored response (201 twice with the
    // same reference) or it is asked to retry (409). Money must move exactly once.
    expect([first.status, second.status].every((status) => status === 201 || status === 409)).toBe(true);
    expect([first.status, second.status]).toContain(201);
    if (first.status === 201 && second.status === 201) {
      expect(second.body.data.transaction.reference).toBe(first.body.data.transaction.reference);
    }
    expect(await getBalance(bob)).toBe(10_000);

    const rows = await pool.query('SELECT count(*)::int AS count FROM transfers');
    expect(rows.rows[0].count).toBe(1);
  });

  it('prevents double spending under concurrent requests', async () => {
    // Each request needs 60% of the balance; both together cannot succeed.
    const payload = (): Record<string, unknown> => ({
      recipient: { email: bob.email },
      amountMinor: 60_000,
      pin: alice.pin,
    });

    const results = await Promise.all([
      sendTransfer(alice, payload(), idempotencyKey('race-a')),
      sendTransfer(alice, payload(), idempotencyKey('race-b')),
    ]);

    const successes = results.filter((result) => result.status === 201);
    const failures = results.filter((result) => result.status === 409);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const aliceBalance = await getBalance(alice);
    expect(aliceBalance).toBe(40_000);
    expect(aliceBalance).toBeGreaterThanOrEqual(0);
    expect(await getBalance(bob)).toBe(60_000);
  });

  it('blocks money movement until the email is verified', async () => {
    const unverified = await registerUser({ verifyEmail: false, setPin: false });
    const response = await sendTransfer(unverified, {
      recipient: { email: bob.email },
      amountMinor: 10_000,
      pin: '1234',
    });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('GET /api/transfers/:id', () => {
  it('returns the transfer for a participant and 404 for everyone else', async () => {
    const created = await sendTransfer(alice, {
      recipient: { email: bob.email },
      amountMinor: 20_000,
      pin: alice.pin,
    });

    const transfers = await pool.query('SELECT id FROM transfers LIMIT 1');
    const transferId = transfers.rows[0].id as string;

    const asAlice = await request(app).get(`/api/transfers/${transferId}`).set(authHeader(alice));
    expect(asAlice.status).toBe(200);
    expect(asAlice.body.data.transaction.reference).toBe(created.body.data.transaction.reference);

    const stranger = await registerUser();
    const asStranger = await request(app).get(`/api/transfers/${transferId}`).set(authHeader(stranger));
    expect(asStranger.status).toBe(404);
  });
});
