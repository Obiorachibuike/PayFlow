import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const booleanFromString = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined) return defaultValue;
      if (typeof value === 'boolean') return value;
      return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    });

const intFromString = (defaultValue: number, min?: number, max?: number) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === '') return defaultValue;
      const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
      if (Number.isNaN(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be an integer' });
        return z.NEVER;
      }
      return parsed;
    })
    .refine((value) => (min === undefined ? true : value >= min), {
      message: `must be >= ${min}`,
    })
    .refine((value) => (max === undefined ? true : value <= max), {
      message: `must be <= ${max}`,
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intFromString(4000, 1, 65535),
  APP_BASE_URL: z.string().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('*'),

  DATABASE_URL: z
    .string()
    .default('postgresql://payflow:payflow@localhost:5432/payflow?schema=public'),

  JWT_ACCESS_SECRET: z.string().min(24).default('dev-access-secret-change-me-please-0001'),
  JWT_REFRESH_SECRET: z.string().min(24).default('dev-refresh-secret-change-me-please-01'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: intFromString(30, 1, 365),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: intFromString(30, 5, 1440),

  BCRYPT_ROUNDS: intFromString(12, 4, 15),

  /** Demo mode enables simulated funding, OTP echo and demo bank lookups. */
  DEMO_MODE: booleanFromString(true),
  /** When true, failed demo payments are possible via `simulate: "failure"`. */
  DEMO_ALLOW_FAILURES: booleanFromString(true),

  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  PAYSTACK_BASE_URL: z.string().default('https://api.paystack.co'),
  PAYMENT_PROVIDER: z.enum(['paystack', 'demo']).default('paystack'),

  RATE_LIMIT_WINDOW_MS: intFromString(60_000, 1000),
  RATE_LIMIT_MAX: intFromString(300, 1),
  AUTH_RATE_LIMIT_MAX: intFromString(20, 1),
  LOGIN_MAX_FAILED_ATTEMPTS: intFromString(5, 1, 50),
  LOGIN_LOCK_MINUTES: intFromString(15, 1, 1440),
  PIN_MAX_FAILED_ATTEMPTS: intFromString(5, 1, 50),
  PIN_LOCK_MINUTES: intFromString(15, 1, 1440),

  MIN_FUNDING_MINOR: intFromString(10_000, 1),
  MAX_FUNDING_MINOR: intFromString(100_000_000, 1),
  MIN_TRANSFER_MINOR: intFromString(1_000, 1),
  MAX_TRANSFER_MINOR: intFromString(50_000_000, 1),
  MIN_WITHDRAWAL_MINOR: intFromString(10_000, 1),
  MAX_WITHDRAWAL_MINOR: intFromString(50_000_000, 1),
  MAX_WALLET_BALANCE_MINOR: intFromString(500_000_000, 1),
  DAILY_OUTFLOW_LIMIT_MINOR: intFromString(100_000_000, 1),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const corsOrigins = env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((o) => o.trim());

/** Paystack is only usable when a secret key has actually been configured. */
export const paystackConfigured = Boolean(env.PAYSTACK_SECRET_KEY && env.PAYSTACK_SECRET_KEY.startsWith('sk_'));

export const limits = {
  minFundingMinor: BigInt(env.MIN_FUNDING_MINOR),
  maxFundingMinor: BigInt(env.MAX_FUNDING_MINOR),
  minTransferMinor: BigInt(env.MIN_TRANSFER_MINOR),
  maxTransferMinor: BigInt(env.MAX_TRANSFER_MINOR),
  minWithdrawalMinor: BigInt(env.MIN_WITHDRAWAL_MINOR),
  maxWithdrawalMinor: BigInt(env.MAX_WITHDRAWAL_MINOR),
  maxWalletBalanceMinor: BigInt(env.MAX_WALLET_BALANCE_MINOR),
  dailyOutflowLimitMinor: BigInt(env.DAILY_OUTFLOW_LIMIT_MINOR),
} as const;
