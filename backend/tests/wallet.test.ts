import request from 'supertest';
import { closePool, fundWallet, getApp, getBalance, idempotencyKey, registerUser, resetDatabase, authHeader, type TestUser } from './helpers/harness';

const app = getApp();

let alice: TestUser;
let bob: TestUser;

beforeEach(async () => {
  await resetDatabase();
  alice = await registerUser({ fullName: 'Alice Adeyemi' });
  bob = await registerUser({ fullName: 'Bob Balogun' });
  await fundWallet(alice, 300_000); // ₦3,000.00
});

afterAll(async () => {
  await closePool();
});

async function transferToBob(amountMinor: number) {
  const response = await request(app)
    .post('/api/transfers')
    .set({ ...authHeader(alice), 'Idempotency-Key': idempotencyKey('history') })
    .send({ recipient: { email: bob.email }, amountMinor, pin: alice.pin });
  expect(response.status).toBe(201);
  return response.body.data;
}

describe('wallet', () => {
  it('returns the wallet with Naira-formatted amounts', async () => {
    const response = await request(app).get('/api/wallet').set(authHeader(alice));

    expect(response.status).toBe(200);
    expect(response.body.data.wallet).toMatchObject({
      currency: 'NGN',
      balanceMinor: 300_000,
      balanceFormatted: '₦3,000.00',
      status: 'ACTIVE',
    });
    expect(response.body.data.wallet.maskedWalletTag).toMatch(/^PF-\*\*\*\*-\d{4}$/);
  });

  it('reports the balance and derived available balance', async () => {
    const response = await request(app).get('/api/wallet/balance').set(authHeader(alice));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      balanceMinor: 300_000,
      availableMinor: 300_000,
      pendingOutMinor: 0,
      currency: 'NGN',
    });
    expect(response.body.data.balanceFormatted).toBe('₦3,000.00');
  });

  it('never exposes another user’s wallet', async () => {
    const mine = await request(app).get('/api/wallet').set(authHeader(alice));
    const theirs = await request(app).get('/api/wallet').set(authHeader(bob));

    expect(theirs.body.data.wallet.id).not.toBe(mine.body.data.wallet.id);
    expect(theirs.body.data.wallet.balanceMinor).toBe(0);
  });

  it('tracks money in and money out across the ledger', async () => {
    await transferToBob(120_000);

    const aliceWallet = await request(app).get('/api/wallet').set(authHeader(alice));
    const bobWallet = await request(app).get('/api/wallet').set(authHeader(bob));

    expect(aliceWallet.body.data.wallet.balanceMinor).toBe(180_000);
    expect(bobWallet.body.data.wallet.balanceMinor).toBe(120_000);
    expect(bobWallet.body.data.stats.totalReceivedMinor).toBe(120_000);
  });
});

describe('transaction history', () => {
  it('lists transactions newest first with signed amounts and direction', async () => {
    await transferToBob(50_000);
    await transferToBob(30_000);

    const response = await request(app).get('/api/transactions').set(authHeader(alice));

    expect(response.status).toBe(200);
    const items = response.body.data as Array<Record<string, unknown>>;

    // funding (in), transfer out, transfer out
    expect(items.length).toBeGreaterThanOrEqual(3);
    const outs = items.filter((item) => item.direction === 'out');
    const ins = items.filter((item) => item.direction === 'in');

    expect(outs).toHaveLength(2);
    expect(ins).toHaveLength(1);
    for (const item of outs) {
      expect(item.signedAmountMinor).toBeLessThan(0);
      expect(String(item.signedAmountFormatted).startsWith('-')).toBe(true);
    }
    for (const item of ins) {
      expect(item.signedAmountMinor).toBeGreaterThan(0);
      expect(String(item.signedAmountFormatted).startsWith('+')).toBe(true);
    }

    const timestamps = items.map((item) => new Date(item.createdAt as string).getTime());
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
  });

  it('filters by direction', async () => {
    await transferToBob(50_000);

    const inbound = await request(app)
      .get('/api/transactions?direction=in')
      .set(authHeader(alice));
    const outbound = await request(app)
      .get('/api/transactions?direction=out')
      .set(authHeader(alice));

    expect(inbound.body.data.every((item: { direction: string }) => item.direction === 'in')).toBe(true);
    expect(outbound.body.data.every((item: { direction: string }) => item.direction === 'out')).toBe(true);
  });

  it('filters by type', async () => {
    await transferToBob(50_000);

    const funding = await request(app)
      .get('/api/transactions?type=FUNDING')
      .set(authHeader(alice));

    expect(funding.body.data).toHaveLength(1);
    expect(funding.body.data[0].type).toBe('FUNDING');
  });

  it('paginates with a keyset cursor', async () => {
    for (const amount of [10_000, 20_000, 30_000, 40_000, 50_000]) {
      await transferToBob(amount);
    }

    const firstPage = await request(app)
      .get('/api/transactions?limit=3')
      .set(authHeader(alice));

    expect(firstPage.body.data).toHaveLength(3);
    expect(firstPage.body.meta.hasMore).toBe(true);
    expect(firstPage.body.meta.nextCursor).toEqual(expect.any(String));

    const secondPage = await request(app)
      .get(`/api/transactions?limit=3&cursor=${encodeURIComponent(firstPage.body.meta.nextCursor)}`)
      .set(authHeader(alice));

    const firstIds = firstPage.body.data.map((item: { id: string }) => item.id);
    const secondIds = secondPage.body.data.map((item: { id: string }) => item.id);

    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);

    const all = await request(app).get('/api/transactions?limit=50').set(authHeader(alice));
    expect(all.body.data.length).toBeGreaterThanOrEqual(6);
  });

  it('searches by reference and counterparty', async () => {
    await transferToBob(25_000);

    const byName = await request(app).get('/api/transactions?search=Balogun').set(authHeader(alice));
    expect(byName.body.data.length).toBeGreaterThanOrEqual(1);

    const reference = (await request(app).get('/api/transactions?limit=1').set(authHeader(alice))).body
      .data[0].reference as string;
    const byReference = await request(app)
      .get(`/api/transactions?search=${encodeURIComponent(reference)}`)
      .set(authHeader(alice));
    expect(byReference.body.data[0].reference).toBe(reference);
  });

  it('exposes a transaction and a branded receipt to its owner only', async () => {
    const transfer = await transferToBob(45_000);
    const id = transfer.transaction.id ?? transfer.transactionId;

    const mine = await request(app).get(`/api/transactions/${id}`).set(authHeader(alice));
    expect(mine.status).toBe(200);
    expect(mine.body.data.id).toBe(id);

    const receipt = await request(app).get(`/api/transactions/${id}/receipt`).set(authHeader(alice));
    expect(receipt.status).toBe(200);
    expect(receipt.body.data).toMatchObject({
      reference: mine.body.data.reference,
      amountMinor: 45_000,
      currency: 'NGN',
    });
    expect(receipt.body.data.branding).toMatchObject({ name: 'PayFlow', currency: 'NGN' });
    expect(receipt.body.data.simulated).toBe(true);

    const intruder = await registerUser({ fullName: 'Mallory Musa' });
    const theirs = await request(app).get(`/api/transactions/${id}`).set(authHeader(intruder));
    expect(theirs.status).toBe(404);
  });

  it('rejects an unknown transaction id', async () => {
    const response = await request(app)
      .get('/api/transactions/00000000-0000-4000-8000-000000000999')
      .set(authHeader(alice));

    expect(response.status).toBe(404);
  });

  it('keeps a wallet-scoped transaction feed', async () => {
    await transferToBob(50_000);

    const response = await request(app).get('/api/wallet/transactions?limit=10').set(authHeader(bob));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].direction).toBe('in');
    expect(response.body.data[0].amountMinor).toBe(50_000);
  });
});

describe('notifications', () => {
  it('lists unread notifications and marks them read', async () => {
    await transferToBob(50_000);

    const list = await request(app).get('/api/notifications').set(authHeader(bob));
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);

    const unreadBefore = list.body.data.filter((item: { readAt: string | null }) => !item.readAt);
    expect(unreadBefore.length).toBeGreaterThanOrEqual(1);

    const markRead = await request(app)
      .patch(`/api/notifications/${unreadBefore[0].id}/read`)
      .set(authHeader(bob));
    expect(markRead.status).toBe(200);
    expect(markRead.body.data.readAt).not.toBeNull();

    const unreadOnly = await request(app).get('/api/notifications?unreadOnly=true').set(authHeader(bob));
    expect(unreadOnly.body.data.some((item: { id: string }) => item.id === unreadBefore[0].id)).toBe(false);

    const readAll = await request(app).post('/api/notifications/read-all').set(authHeader(bob));
    expect(readAll.status).toBe(200);
    expect(readAll.body.data.updated).toBeGreaterThanOrEqual(1);
  });

  it('registers a push token for the current device session', async () => {
    const response = await request(app)
      .post('/api/notifications/push-token')
      .set(authHeader(alice))
      .send({ pushToken: 'ExponentPushToken[test-token-123456]' });

    expect(response.status).toBe(200);
    expect(response.body.data.registered).toBe(true);
  });

  it('ignores a malformed push token', async () => {
    const response = await request(app)
      .post('/api/notifications/push-token')
      .set(authHeader(alice))
      .send({ pushToken: 'x' });

    expect(response.status).toBe(400);
  });
});

describe('platform endpoints', () => {
  it('answers the health check', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.data ?? response.body).toMatchObject({ status: expect.any(String) });
  });

  it('serves the OpenAPI documentation', async () => {
    const response = await request(app).get('/api/docs/').set('Accept', 'text/html');
    expect(response.status).toBe(200);
  });

  it('returns a typed error envelope for unknown routes', async () => {
    const response = await request(app).get('/api/does-not-exist').set(authHeader(alice));

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: expect.any(String), message: expect.any(String) });
    expect(response.body.requestId).toEqual(expect.any(String));
  });

  it('rejects requests without a bearer token', async () => {
    const response = await request(app).get('/api/wallet');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
