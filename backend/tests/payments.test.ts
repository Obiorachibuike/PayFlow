import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { pool } from '../src/db';
import {
  authHeader,
  closePool,
  getApp,
  getBalance,
  idempotencyKey,
  registerUser,
  resetDatabase,
  type TestUser,
} from './helpers/harness';

const app = getApp();
const WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET!;

interface MockPaystackState {
  verifyStatus: 'success' | 'failed' | 'abandoned';
  amountOverrideMinor: number | null;
  currency: string;
  lastReference: string | null;
  lastAmountMinor: number | null;
  verifyCalls: number;
}

const mock: MockPaystackState = {
  verifyStatus: 'success',
  amountOverrideMinor: null,
  currency: 'NGN',
  lastReference: null,
  lastAmountMinor: null,
  verifyCalls: 0,
};

let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '';

    if (req.method === 'POST' && url === '/transaction/initialize') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const payload = JSON.parse(body) as { reference: string; amount: string; email: string };
        mock.lastReference = payload.reference;
        mock.lastAmountMinor = Number(payload.amount);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            status: true,
            message: 'Authorization URL created',
            data: {
              authorization_url: `https://checkout.paystack.test/${payload.reference}`,
              access_code: 'test_access_code',
              reference: payload.reference,
            },
          }),
        );
      });
      return;
    }

    if (req.method === 'GET' && url.startsWith('/transaction/verify/')) {
      mock.verifyCalls += 1;
      const reference = decodeURIComponent(url.split('/').pop() ?? '');
      const amount = mock.amountOverrideMinor ?? mock.lastAmountMinor ?? 0;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: true,
          message: 'Verification successful',
          data: {
            id: 987654321,
            status: mock.verifyStatus,
            reference,
            amount,
            currency: mock.currency,
            channel: 'card',
            paid_at: new Date().toISOString(),
            gateway_response: mock.verifyStatus === 'success' ? 'Successful' : 'Declined',
          },
        }),
      );
      return;
    }

    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  process.env.PAYSTACK_BASE_URL = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
});

let user: TestUser;

beforeEach(async () => {
  await resetDatabase();
  user = await registerUser();
  mock.verifyStatus = 'success';
  mock.amountOverrideMinor = null;
  mock.currency = 'NGN';
  mock.verifyCalls = 0;
});

function signWebhook(body: string, secret = WEBHOOK_SECRET): string {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

async function initializePaystack(amountMinor = 150_000) {
  const response = await request(app)
    .post('/api/payments/initialize')
    .set({ ...authHeader(user), 'Idempotency-Key': idempotencyKey('init') })
    .send({ amountMinor, channel: 'PAYSTACK' });
  return response;
}

describe('POST /api/payments/initialize', () => {
  it('creates a pending payment and returns the sandbox checkout URL', async () => {
    const response = await initializePaystack(150_000);

    expect(response.status).toBe(201);
    expect(response.body.data.channel).toBe('PAYSTACK');
    expect(response.body.data.authorizationUrl).toContain('checkout.paystack.test');
    expect(response.body.data.amountMinor).toBe(150_000);

    const payments = await pool.query('SELECT status, provider FROM payments');
    expect(payments.rows[0]).toMatchObject({ status: 'PENDING', provider: 'PAYSTACK' });
  });

  it('enforces funding limits', async () => {
    const tooSmall = await request(app)
      .post('/api/payments/initialize')
      .set({ ...authHeader(user), 'Idempotency-Key': idempotencyKey('min') })
      .send({ amountMinor: 100, channel: 'PAYSTACK' });
    expect(tooSmall.status).toBe(400);
    expect(tooSmall.body.error.code).toBe('LIMIT_EXCEEDED');

    const tooLarge = await request(app)
      .post('/api/payments/initialize')
      .set({ ...authHeader(user), 'Idempotency-Key': idempotencyKey('max') })
      .send({ amountMinor: 900_000_000, channel: 'PAYSTACK' });
    expect(tooLarge.status).toBe(400);
  });

  it('is idempotent per key', async () => {
    const key = idempotencyKey('same');
    const [first, second] = await Promise.all([
      request(app)
        .post('/api/payments/initialize')
        .set({ ...authHeader(user), 'Idempotency-Key': key })
        .send({ amountMinor: 100_000, channel: 'PAYSTACK' }),
      request(app)
        .post('/api/payments/initialize')
        .set({ ...authHeader(user), 'Idempotency-Key': key })
        .send({ amountMinor: 100_000, channel: 'PAYSTACK' }),
    ]);

    expect([first.status, second.status]).toContain(201);
    expect(second.body.data.reference).toBe(first.body.data.reference);

    const payments = await pool.query('SELECT count(*)::int AS count FROM payments');
    expect(payments.rows[0].count).toBe(1);
  });

  it('rejects a reused key with a different body', async () => {
    const key = idempotencyKey('reuse');
    await request(app)
      .post('/api/payments/initialize')
      .set({ ...authHeader(user), 'Idempotency-Key': key })
      .send({ amountMinor: 100_000, channel: 'PAYSTACK' });

    const mismatch = await request(app)
      .post('/api/payments/initialize')
      .set({ ...authHeader(user), 'Idempotency-Key': key })
      .send({ amountMinor: 200_000, channel: 'PAYSTACK' });

    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('GET /api/payments/verify/:reference', () => {
  it('credits the wallet only after server-side verification', async () => {
    const init = await initializePaystack(150_000);
    const reference = init.body.data.reference;

    // Before verification nothing is credited.
    expect(await getBalance(user)).toBe(0);

    const verify = await request(app)
      .get(`/api/payments/verify/${reference}`)
      .set(authHeader(user));

    expect(verify.status).toBe(200);
    expect(verify.body.data.status).toBe('SUCCESSFUL');
    expect(verify.body.data.credited).toBe(true);
    expect(verify.body.data.walletBalanceMinor).toBe(150_000);
    expect(mock.verifyCalls).toBe(1);

    // Re-verification is idempotent.
    const again = await request(app).get(`/api/payments/verify/${reference}`).set(authHeader(user));
    expect(again.body.data.alreadyProcessed).toBe(true);
    expect(again.body.data.credited).toBe(false);
    expect(await getBalance(user)).toBe(150_000);
  });

  it('refuses to credit when the verified amount does not match', async () => {
    const init = await initializePaystack(150_000);
    const reference = init.body.data.reference;

    mock.amountOverrideMinor = 1_000; // provider says a different amount

    const verify = await request(app)
      .get(`/api/payments/verify/${reference}`)
      .set(authHeader(user));

    expect(verify.status).toBe(409);
    expect(verify.body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');
    expect(await getBalance(user)).toBe(0);

    const payment = await pool.query('SELECT status FROM payments');
    expect(payment.rows[0].status).toBe('FAILED');
  });

  it('refuses to credit when the verified currency does not match', async () => {
    const init = await initializePaystack(150_000);
    mock.currency = 'USD';

    const verify = await request(app)
      .get(`/api/payments/verify/${init.body.data.reference}`)
      .set(authHeader(user));

    expect(verify.status).toBe(409);
    expect(verify.body.error.code).toBe('PAYMENT_CURRENCY_MISMATCH');
    expect(await getBalance(user)).toBe(0);
  });

  it('marks a failed provider payment as failed without crediting', async () => {
    const init = await initializePaystack(150_000);
    mock.verifyStatus = 'failed';

    const verify = await request(app)
      .get(`/api/payments/verify/${init.body.data.reference}`)
      .set(authHeader(user));

    expect(verify.status).toBe(200);
    expect(verify.body.data.status).toBe('FAILED');
    expect(verify.body.data.credited).toBe(false);
    expect(await getBalance(user)).toBe(0);

    const notifications = await pool.query(
      `SELECT type FROM notifications WHERE user_id = $1 ORDER BY created_at`,
      [user.id],
    );
    expect(notifications.rows.map((row) => row.type)).toContain('TRANSACTION_FAILED');
  });

  it('reports pending payments without crediting', async () => {
    const init = await initializePaystack(150_000);
    mock.verifyStatus = 'abandoned';

    const verify = await request(app)
      .get(`/api/payments/verify/${init.body.data.reference}`)
      .set(authHeader(user));

    expect(verify.body.data.status).toBe('PENDING');
    expect(await getBalance(user)).toBe(0);
  });

  it('does not let another user verify someone else’s payment', async () => {
    const init = await initializePaystack(150_000);
    const stranger = await registerUser();

    const verify = await request(app)
      .get(`/api/payments/verify/${init.body.data.reference}`)
      .set(authHeader(stranger));

    // Verification is server-side and credits the payment owner only.
    expect(verify.status).toBe(200);
    expect(await getBalance(user)).toBe(150_000);
    expect(await getBalance(stranger)).toBe(0);
  });
});

describe('POST /api/payments/webhooks/paystack', () => {
  function buildEvent(reference: string, event = 'charge.success') {
    const body = JSON.stringify({
      event,
      data: {
        id: 987654321,
        reference,
        amount: mock.lastAmountMinor,
        currency: 'NGN',
        status: 'success',
        paid_at: new Date().toISOString(),
      },
    });
    return { body, signature: signWebhook(body) };
  }

  it('rejects a payload with an invalid signature', async () => {
    const init = await initializePaystack(120_000);
    const { body } = buildEvent(init.body.data.reference);

    const response = await request(app)
      .post('/api/payments/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'deadbeef')
      .send(body);

    expect(response.status).toBe(401);
    expect(await getBalance(user)).toBe(0);
  });

  it('credits a verified charge once and ignores duplicate deliveries', async () => {
    const init = await initializePaystack(120_000);
    const { body, signature } = buildEvent(init.body.data.reference);

    const first = await request(app)
      .post('/api/payments/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(body);

    expect(first.status).toBe(200);
    expect(first.body.outcome).toBe('processed');
    expect(await getBalance(user)).toBe(120_000);

    const duplicate = await request(app)
      .post('/api/payments/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(body);

    expect(duplicate.status).toBe(200);
    expect(duplicate.body.outcome).toBe('duplicate');
    expect(await getBalance(user)).toBe(120_000);

    const events = await pool.query('SELECT count(*)::int AS count FROM webhook_events');
    expect(events.rows[0].count).toBe(1);
  });

  it('ignores events it does not handle', async () => {
    const init = await initializePaystack(120_000);
    const { body, signature } = buildEvent(init.body.data.reference, 'customeridentification.success');

    const response = await request(app)
      .post('/api/payments/webhooks/paystack')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', signature)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.outcome).toBe('ignored');
    expect(await getBalance(user)).toBe(0);
  });
});

describe('demo funding', () => {
  it('supports a simulated failure without crediting', async () => {
    const init = await request(app)
      .post('/api/payments/initialize')
      .set({ ...authHeader(user), 'Idempotency-Key': idempotencyKey('demofail') })
      .send({ amountMinor: 80_000, channel: 'DEMO', simulate: 'failure' });

    const confirm = await request(app)
      .post('/api/payments/demo/confirm')
      .set(authHeader(user))
      .send({ reference: init.body.data.reference });

    expect(confirm.status).toBe(200);
    expect(confirm.body.data.status).toBe('FAILED');
    expect(await getBalance(user)).toBe(0);
  });

  it('will not confirm a Paystack payment through the demo endpoint', async () => {
    const init = await initializePaystack(50_000);

    const confirm = await request(app)
      .post('/api/payments/demo/confirm')
      .set(authHeader(user))
      .send({ reference: init.body.data.reference });

    expect(confirm.status).toBe(400);
    expect(confirm.body.error.code).toBe('DEMO_ONLY');
  });
});
