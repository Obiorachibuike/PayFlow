import request from 'supertest';
import { pool } from '../src/db';
import {
  authHeader,
  closePool,
  getApp,
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
});

afterAll(async () => {
  await closePool();
});

function createBeneficiary(
  user: TestUser,
  body: Record<string, unknown> = {
    bankCode: '058',
    accountNumber: '0123456789',
    accountName: 'Ada Test',
  },
) {
  return request(app).post('/api/beneficiaries').set(authHeader(user)).send(body);
}

describe('beneficiaries', () => {
  it('saves a beneficiary and never claims the account was verified', async () => {
    const response = await createBeneficiary(alice);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      bankCode: '058',
      bankName: 'GTBank',
      accountName: 'Ada Test',
      accountNumberLast4: '6789',
      accountNumberMasked: '******6789',
      verificationStatus: 'UNVERIFIED',
      verified: false,
    });

    const stored = await pool.query<{ account_number: string }>(
      'SELECT account_number FROM beneficiaries WHERE id = $1',
      [response.body.data.id],
    );
    expect(stored.rows[0]?.account_number).toBe('0123456789');
  });

  it('lists only the owner’s beneficiaries', async () => {
    await createBeneficiary(alice);
    await createBeneficiary(bob, {
      bankCode: '044',
      accountNumber: '0987654321',
      accountName: 'Bob Savings',
    });

    const list = await request(app).get('/api/beneficiaries').set(authHeader(alice));

    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].accountName).toBe('Ada Test');
  });

  it('rejects an account number that is not 10 digits', async () => {
    const response = await createBeneficiary(alice, {
      bankCode: '058',
      accountNumber: '12345',
      accountName: 'Short Account',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_ACCOUNT_DETAILS');
  });

  it('rejects an unknown bank code', async () => {
    const response = await createBeneficiary(alice, {
      bankCode: '999',
      accountNumber: '0123456789',
      accountName: 'Ghost Bank',
    });

    expect(response.status).toBe(404);
  });

  it('prevents saving the same account twice', async () => {
    const first = await createBeneficiary(alice);
    expect(first.status).toBe(201);

    const second = await createBeneficiary(alice);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DUPLICATE_BENEFICIARY');
  });

  it('keeps only one default beneficiary', async () => {
    const first = await createBeneficiary(alice, {
      bankCode: '058',
      accountNumber: '0123456789',
      accountName: 'First Account',
      isDefault: true,
    });
    const second = await createBeneficiary(alice, {
      bankCode: '044',
      accountNumber: '0987654321',
      accountName: 'Second Account',
      isDefault: true,
    });

    const list = await request(app).get('/api/beneficiaries').set(authHeader(alice));
    const defaults = list.body.data.filter((item: { isDefault: boolean }) => item.isDefault);

    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(second.body.data.id);
    expect(first.body.data.isDefault).toBe(true);
  });

  it('renames a beneficiary but never its bank details', async () => {
    const created = await createBeneficiary(alice);

    const response = await request(app)
      .patch(`/api/beneficiaries/${created.body.data.id}`)
      .set(authHeader(alice))
      .send({ accountName: 'Renamed Account', accountNumber: '0000000000' });

    expect(response.status).toBe(200);
    expect(response.body.data.accountName).toBe('Renamed Account');
    expect(response.body.data.accountNumberLast4).toBe('6789');
  });

  it('soft deletes a beneficiary so withdrawal history stays intact', async () => {
    const created = await createBeneficiary(alice);

    const deleted = await request(app)
      .delete(`/api/beneficiaries/${created.body.data.id}`)
      .set(authHeader(alice));

    expect(deleted.status).toBe(200);

    const list = await request(app).get('/api/beneficiaries').set(authHeader(alice));
    expect(list.body.data).toHaveLength(0);

    const rows = await pool.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM beneficiaries WHERE id = $1',
      [created.body.data.id],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.deleted_at).not.toBeNull();
  });

  it('does not let another user touch a beneficiary', async () => {
    const created = await createBeneficiary(alice);

    const patch = await request(app)
      .patch(`/api/beneficiaries/${created.body.data.id}`)
      .set(authHeader(bob))
      .send({ accountName: 'Hijacked' });

    const del = await request(app)
      .delete(`/api/beneficiaries/${created.body.data.id}`)
      .set(authHeader(bob));

    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
  });

  it('resolves an account name with an explicitly simulated lookup', async () => {
    const response = await request(app)
      .post('/api/beneficiaries/resolve-account')
      .set(authHeader(alice))
      .send({ accountNumber: '0123456789', bankCode: '058' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      accountNumber: '0123456789',
      verificationStatus: 'SIMULATED',
    });
    expect(response.body.data.resolvedName).toEqual(expect.any(String));
    expect(response.body.data.note).toMatch(/not contacted the bank/i);
  });

  it('publishes the bank list', async () => {
    const response = await request(app).get('/api/banks').set(authHeader(alice));

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(3);
    expect(response.body.data).toEqual(
      expect.arrayContaining([{ code: '058', name: 'GTBank' }]),
    );
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/beneficiaries');
    expect(response.status).toBe(401);
  });
});
