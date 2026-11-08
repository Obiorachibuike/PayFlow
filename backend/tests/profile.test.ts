import request from 'supertest';
import { pool } from '../src/db';
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

/** Registers a second device for a user and returns its tokens. */
async function loginSecondDevice(user: TestUser) {
  const response = await request(app).post('/api/auth/login').send({
    email: user.email,
    password: user.password,
    device: { deviceId: `device-second-${Date.now()}`, deviceName: 'Pixel 8', platform: 'android' },
  });
  expect(response.status).toBe(200);
  return response.body.data.tokens as { accessToken: string; refreshToken: string };
}

beforeEach(async () => {
  await resetDatabase();
  alice = await registerUser({ fullName: 'Alice Adeyemi' });
  bob = await registerUser({ fullName: 'Bob Balogun' });
  await fundWallet(alice, 200_000);
  await fundWallet(bob, 200_000);
});

afterAll(async () => {
  await closePool();
});

function transfer(user: TestUser, amountMinor: number, pin: string) {
  return request(app)
    .post('/api/transfers')
    .set({ ...authHeader(user), 'Idempotency-Key': idempotencyKey('pin') })
    .send({ recipient: { email: bob.email }, amountMinor, pin });
}

describe('profile', () => {
  it('returns the profile, wallet summary and security posture', async () => {
    const response = await request(app).get('/api/profile').set(authHeader(alice));

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({
      email: alice.email,
      fullName: 'Alice Adeyemi',
      emailVerified: true,
      initials: 'AA',
    });
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(response.body.data.security).toMatchObject({
      pinConfigured: true,
      emailVerified: true,
    });
    expect(response.body.data.wallet.balanceMinor).toBe(200_000);
  });

  it('updates theme and notification preferences', async () => {
    const response = await request(app)
      .patch('/api/profile')
      .set(authHeader(alice))
      .send({ themePreference: 'DARK', notifyPush: false, avatarColor: '#39FF14' });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({
      themePreference: 'DARK',
      notifications: { push: false },
      avatarColor: '#39FF14',
    });

    const persisted = await request(app).get('/api/profile').set(authHeader(alice));
    expect(persisted.body.data.user.themePreference).toBe('DARK');
  });

  it('rejects an unsupported theme or malformed colour', async () => {
    const theme = await request(app)
      .patch('/api/profile')
      .set(authHeader(alice))
      .send({ themePreference: 'NEON' });
    const colour = await request(app)
      .patch('/api/profile')
      .set(authHeader(alice))
      .send({ avatarColor: 'green' });

    expect(theme.status).toBe(400);
    expect(colour.status).toBe(400);
    expect(theme.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid display name', async () => {
    const response = await request(app)
      .patch('/api/profile')
      .set(authHeader(alice))
      .send({ fullName: 'A1ice' });

    expect(response.status).toBe(400);
  });
});

describe('password management', () => {
  it('refuses the wrong current password', async () => {
    const response = await request(app)
      .patch('/api/profile/password')
      .set(authHeader(alice))
      .send({ currentPassword: 'WrongPass1', newPassword: 'NewFlow5678' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('refuses to reuse the same password', async () => {
    const response = await request(app)
      .patch('/api/profile/password')
      .set(authHeader(alice))
      .send({ currentPassword: alice.password, newPassword: alice.password });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('changes the password, invalidates other sessions and signs every device out', async () => {
    const secondDevice = await loginSecondDevice(alice);

    const response = await request(app)
      .patch('/api/profile/password')
      .set(authHeader(alice))
      .send({ currentPassword: alice.password, newPassword: 'NewFlow5678' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ success: true, reauthenticate: true });

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: alice.email, password: alice.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/auth/login').send({
      email: alice.email,
      password: 'NewFlow5678',
      device: { deviceId: 'device-after-reset', deviceName: 'Pixel 9', platform: 'android' },
    });
    expect(newLogin.status).toBe(200);

    // Only the device that just signed in is left; the old one was signed out.
    const sessions = await request(app)
      .get('/api/profile/sessions')
      .set({ Authorization: `Bearer ${newLogin.body.data.tokens.accessToken}` });
    expect(sessions.body.data).toHaveLength(1);
    expect(sessions.body.data[0].deviceName).toBe('Pixel 9');

    // Presenting a refresh token that was already revoked is treated as token
    // theft: the rotation family is revoked and the replay is rejected.
    const reusedRefresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: secondDevice.refreshToken });
    expect(reusedRefresh.status).toBe(401);
  });

  it('stores the new password only as a hash', async () => {
    await request(app)
      .patch('/api/profile/password')
      .set(authHeader(alice))
      .send({ currentPassword: alice.password, newPassword: 'NewFlow5678' });

    const rows = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [alice.id],
    );
    expect(rows.rows[0]?.password_hash).not.toContain('NewFlow5678');
    expect(rows.rows[0]?.password_hash?.startsWith('$2')).toBe(true);
  });
});

describe('transaction PIN', () => {
  it('changes the PIN when the current PIN is supplied', async () => {
    const response = await request(app)
      .patch('/api/profile/pin')
      .set(authHeader(alice))
      .send({ newPin: '4321', currentPin: '1234' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ success: true, pinConfigured: true, changed: true });

    const oldPin = await transfer(alice, 10_000, '1234');
    expect(oldPin.status).toBe(400);
    expect(oldPin.body.error.code).toBe('PIN_INVALID');

    const newPin = await transfer(alice, 10_000, '4321');
    expect(newPin.status).toBe(201);
  });

  it('refuses a PIN change without the current PIN or password', async () => {
    const response = await request(app)
      .patch('/api/profile/pin')
      .set(authHeader(alice))
      .send({ newPin: '4321' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('allows a PIN reset with the account password', async () => {
    const response = await request(app)
      .patch('/api/profile/pin')
      .set(authHeader(alice))
      .send({ newPin: '8080', password: alice.password });

    expect(response.status).toBe(200);

    const ok = await transfer(alice, 10_000, '8080');
    expect(ok.status).toBe(201);
  });

  it('rejects a PIN that is not four digits and never stores it in plaintext', async () => {
    const response = await request(app)
      .patch('/api/profile/pin')
      .set(authHeader(alice))
      .send({ newPin: '12', currentPin: '1234' });

    expect(response.status).toBe(400);

    const rows = await pool.query<{ pin_hash: string }>(
      'SELECT pin_hash FROM transaction_pins WHERE user_id = $1',
      [alice.id],
    );
    expect(rows.rows[0]?.pin_hash).not.toBe('1234');
  });
});

describe('device sessions and biometrics', () => {
  it('lists sessions and flags the current one', async () => {
    await loginSecondDevice(alice);

    const response = await request(app).get('/api/profile/sessions').set(authHeader(alice));

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    expect(response.body.data.filter((item: { current: boolean }) => item.current)).toHaveLength(1);
  });

  it('revokes a session once and only for its owner', async () => {
    const second = await loginSecondDevice(alice);
    const sessions = await request(app)
      .get('/api/profile/sessions')
      .set({ Authorization: `Bearer ${second.accessToken}` });

    const target = sessions.body.data.find((item: { current: boolean }) => item.current);

    const revoked = await request(app)
      .delete(`/api/profile/sessions/${target.id}`)
      .set({ Authorization: `Bearer ${second.accessToken}` });
    expect(revoked.status).toBe(200);

    const again = await request(app)
      .delete(`/api/profile/sessions/${target.id}`)
      .set(authHeader(alice));
    expect(again.status).toBe(404);

    const intruder = await request(app)
      .delete(`/api/profile/sessions/${target.id}`)
      .set(authHeader(bob));
    expect(intruder.status).toBe(404);
  });

  it('treats biometrics as a local convenience toggle only', async () => {
    const enabled = await request(app)
      .post('/api/profile/biometrics')
      .set(authHeader(alice))
      .send({ enabled: true });

    expect(enabled.status).toBe(200);
    expect(enabled.body.data.biometricEnabled).toBe(true);

    const profile = await request(app).get('/api/profile').set(authHeader(alice));
    expect(profile.body.data.security.biometricEnabled).toBe(true);

    // A biometric flag alone must never authorise a debit: the PIN is still required.
    const withoutPin = await request(app)
      .post('/api/transfers')
      .set({ ...authHeader(alice), 'Idempotency-Key': idempotencyKey('biometric') })
      .send({ recipient: { email: bob.email }, amountMinor: 5_000 });
    expect(withoutPin.status).toBe(400);

    const disabled = await request(app)
      .post('/api/profile/biometrics')
      .set(authHeader(alice))
      .send({ enabled: false });
    expect(disabled.body.data.biometricEnabled).toBe(false);
  });
});
