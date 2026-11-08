import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { pool } from '../../src/db';

export const app: Express = createApp();

let cachedApp: Express | null = null;
export function getApp(): Express {
  cachedApp ??= app;
  return cachedApp;
}

const SYSTEM_ACCOUNTS_SQL = `
  INSERT INTO ledger_accounts (id, code, name, type, currency, balance_minor, is_system)
  VALUES
    ('00000000-0000-4000-8000-000000000001', 'SYS:PAYMENT_CLEARING', 'Payment clearing (sandbox cash)', 'ASSET', 'NGN', 0, true),
    ('00000000-0000-4000-8000-000000000002', 'SYS:PLATFORM_REVENUE', 'Platform revenue', 'REVENUE', 'NGN', 0, true),
    ('00000000-0000-4000-8000-000000000003', 'SYS:TRANSFER_CLEARING', 'Internal transfer clearing', 'LIABILITY', 'NGN', 0, true)
  ON CONFLICT (code) DO NOTHING;
`;

const BANKS_SQL = `
  INSERT INTO banks (code, name) VALUES
    ('058', 'GTBank'),
    ('044', 'Access Bank'),
    ('057', 'Zenith Bank')
  ON CONFLICT (code) DO NOTHING;
`;

/** Wipes all data between tests while keeping the schema intact. */
export async function resetDatabase(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      idempotency_records,
      webhook_events,
      audit_logs,
      notifications,
      withdrawals,
      transfers,
      beneficiaries,
      payments,
      transactions,
      ledger_entries,
      ledger_transactions,
      wallets,
      ledger_accounts,
      transaction_pins,
      otp_tokens,
      refresh_tokens,
      device_sessions,
      users,
      banks
    RESTART IDENTITY CASCADE
  `);
  await pool.query(SYSTEM_ACCOUNTS_SQL);
  await pool.query(BANKS_SQL);
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export interface TestUser {
  id: string;
  email: string;
  phone: string;
  password: string;
  pin: string;
  accessToken: string;
  refreshToken: string;
  walletTag: string;
  balanceMinor: number;
}

let userCounter = 0;

export interface RegisterOptions {
  fullName?: string;
  password?: string;
  phone?: string;
  email?: string;
  verifyEmail?: boolean;
  setPin?: boolean;
}

export function uniqueEmail(prefix = 'user'): string {
  userCounter += 1;
  return `${prefix}.${Date.now()}.${userCounter}@payflow.test`;
}

export function uniquePhone(): string {
  userCounter += 1;
  const suffix = String(100_000_000 + userCounter).slice(-9);
  return `+2348${suffix}`;
}

export async function registerUser(options: RegisterOptions = {}): Promise<TestUser & { demoCode?: string }> {
  const email = options.email ?? uniqueEmail();
  const phone = options.phone ?? uniquePhone();
  const password = options.password ?? 'Flow1234';

  const response = await request(getApp())
    .post('/api/auth/register')
    .send({
      fullName: options.fullName ?? 'Ada Test',
      email,
      phone,
      password,
      confirmPassword: password,
      device: { deviceId: `device-${userCounter}`, deviceName: 'Jest', platform: 'android' },
    });

  if (response.status !== 201) {
    throw new Error(`Registration failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  const { user, tokens, wallet, verification } = response.body.data;
  const result: TestUser & { demoCode?: string } = {
    id: user.id,
    email,
    phone,
    password,
    pin: '1234',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    walletTag: wallet.walletTag,
    balanceMinor: 0,
    demoCode: verification?.demoCode,
  };

  if (options.verifyEmail !== false) {
    const verify = await request(getApp())
      .post('/api/auth/verify-email')
      .set('Authorization', `Bearer ${result.accessToken}`)
      .send({ code: verification.demoCode });
    if (verify.status !== 200) {
      throw new Error(`Email verification failed: ${verify.status} ${JSON.stringify(verify.body)}`);
    }
  }

  if (options.setPin !== false) {
    const pinResponse = await request(getApp())
      .patch('/api/profile/pin')
      .set('Authorization', `Bearer ${result.accessToken}`)
      .send({ newPin: result.pin, password });
    if (pinResponse.status !== 200) {
      throw new Error(`PIN setup failed: ${pinResponse.status} ${JSON.stringify(pinResponse.body)}`);
    }
  }

  return result;
}

/** Funds a wallet through the demo payment flow (real ledger credit). */
export async function fundWallet(user: TestUser, amountMinor: number): Promise<void> {
  const init = await request(getApp())
    .post('/api/payments/initialize')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .set('Idempotency-Key', `fund-${user.id}-${amountMinor}-${Date.now()}`)
    .send({ amountMinor, channel: 'DEMO' });

  if (init.status !== 201) {
    throw new Error(`Funding init failed: ${init.status} ${JSON.stringify(init.body)}`);
  }

  const confirm = await request(getApp())
    .post('/api/payments/demo/confirm')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ reference: init.body.data.reference });

  if (confirm.status !== 200) {
    throw new Error(`Funding confirm failed: ${confirm.status} ${JSON.stringify(confirm.body)}`);
  }

  user.balanceMinor += amountMinor;
}

export async function getBalance(user: TestUser): Promise<number> {
  const response = await request(getApp())
    .get('/api/wallet/balance')
    .set('Authorization', `Bearer ${user.accessToken}`);
  return response.body.data.balanceMinor;
}

export function authHeader(user: TestUser): Record<string, string> {
  return { Authorization: `Bearer ${user.accessToken}` };
}

export function idempotencyKey(prefix = 'key'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
