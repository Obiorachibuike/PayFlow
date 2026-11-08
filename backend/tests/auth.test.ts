import request from 'supertest';
import { closePool, getApp, registerUser, resetDatabase, uniqueEmail, uniquePhone } from './helpers/harness';

const app = getApp();

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closePool();
});

describe('POST /api/auth/register', () => {
  it('creates a user, a ledger-backed wallet and a first session', async () => {
    const email = uniqueEmail('register');
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Chidi Nwosu',
        email,
        phone: uniquePhone(),
        password: 'Flow1234',
        confirmPassword: 'Flow1234',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.user.emailVerified).toBe(false);
    expect(response.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(response.body.data.wallet.walletTag).toMatch(/^PF-\d{4}-\d{4}$/);
    // Demo mode echoes the verification code so the flow is testable end to end.
    expect(response.body.data.verification.demoCode).toMatch(/^\d{6}$/);
    expect(response.body.data.user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate emails and duplicate phone numbers', async () => {
    const email = uniqueEmail('dup');
    const phone = uniquePhone();
    const payload = {
      fullName: 'Ada Dup',
      email,
      phone,
      password: 'Flow1234',
      confirmPassword: 'Flow1234',
    };

    expect((await request(app).post('/api/auth/register').send(payload)).status).toBe(201);

    const duplicateEmail = await request(app)
      .post('/api/auth/register')
      .send({ ...payload, phone: uniquePhone() });
    expect(duplicateEmail.status).toBe(409);
    expect(duplicateEmail.body.error.code).toBe('EMAIL_TAKEN');

    const duplicatePhone = await request(app)
      .post('/api/auth/register')
      .send({ ...payload, email: uniqueEmail('dup2') });
    expect(duplicatePhone.status).toBe(409);
    expect(duplicatePhone.body.error.code).toBe('PHONE_TAKEN');
  });

  it('validates password strength and confirmation', async () => {
    const base = {
      fullName: 'Weak Password',
      email: uniqueEmail('weak'),
      phone: uniquePhone(),
    };

    const weak = await request(app)
      .post('/api/auth/register')
      .send({ ...base, password: 'short', confirmPassword: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');

    const mismatch = await request(app)
      .post('/api/auth/register')
      .send({ ...base, password: 'Flow1234', confirmPassword: 'Flow12345' });
    expect(mismatch.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with valid credentials and rejects invalid ones', async () => {
    const user = await registerUser({ email: uniqueEmail('login') });

    const success = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    expect(success.status).toBe(200);
    expect(success.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(success.body.data.pinConfigured).toBe(true);

    const failure = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPass1' });
    expect(failure.status).toBe(401);
    expect(failure.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('locks the account after repeated failed attempts', async () => {
    const user = await registerUser({ email: uniqueEmail('lock') });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/auth/login').send({ email: user.email, password: 'WrongPass1' });
    }

    const locked = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('does not reveal whether an email exists', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@payflow.test', password: 'Flow1234' });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Email or password is incorrect');
  });
});

describe('refresh token rotation', () => {
  it('rotates the refresh token and invalidates the previous one', async () => {
    const user = await registerUser();

    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.data.tokens.refreshToken).not.toBe(user.refreshToken);

    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    // Reuse detection revokes the whole family, including the rotated token.
    const afterDetection = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first.body.data.tokens.refreshToken });
    expect(afterDetection.status).toBe(401);
  });

  it('logout revokes the session so the access token stops working', async () => {
    const user = await registerUser();

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ refreshToken: user.refreshToken });
    expect(logout.status).toBe(200);

    const afterLogout = await request(app)
      .get('/api/wallet')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(afterLogout.status).toBe(401);
  });
});

describe('email verification and password reset', () => {
  it('requires a valid verification code before money can move', async () => {
    const user = await registerUser({ verifyEmail: false });

    const blocked = await request(app)
      .post('/api/payments/initialize')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('Idempotency-Key', 'unverified-init-001')
      .send({ amountMinor: 50_000, channel: 'DEMO' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const wrongCode = await request(app)
      .post('/api/auth/verify-email')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ code: '000000' });
    expect(wrongCode.status).toBe(400);

    const correct = await request(app)
      .post('/api/auth/verify-email')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ code: user.demoCode });
    expect(correct.status).toBe(200);
    expect(correct.body.data.user.emailVerified).toBe(true);
  });

  it('resets the password with a one-time code and revokes old sessions', async () => {
    const user = await registerUser();

    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    expect(forgot.status).toBe(200);
    const code = forgot.body.data.demoCode;
    expect(code).toMatch(/^\d{6}$/);

    const reset = await request(app).post('/api/auth/reset-password').send({
      email: user.email,
      code,
      newPassword: 'BrandNew123',
      confirmPassword: 'BrandNew123',
    });
    expect(reset.status).toBe(200);

    const oldSession = await request(app)
      .get('/api/wallet')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(oldSession.status).toBe(401);

    const oldPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'BrandNew123' });
    expect(newPassword.status).toBe(200);
  });

  it('answers identically for unknown emails on forgot-password', async () => {
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ghost@payflow.test' });
    expect(response.status).toBe(200);
    expect(response.body.data.demoCode).toBeUndefined();
  });
});

describe('authorization', () => {
  it('rejects requests without a bearer token', async () => {
    expect((await request(app).get('/api/wallet')).status).toBe(401);
    expect((await request(app).get('/api/transactions')).status).toBe(401);
  });

  it('rejects a tampered access token', async () => {
    const user = await registerUser();
    const tampered = `${user.accessToken.slice(0, -4)}beef`;
    const response = await request(app).get('/api/wallet').set('Authorization', `Bearer ${tampered}`);
    expect(response.status).toBe(401);
  });
});
