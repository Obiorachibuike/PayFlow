/**
 * Test environment. Runs before any module is imported so config/env.ts picks
 * these values up. The database is a real PostgreSQL instance started by
 * globalSetup.ts — never a mock, because ledger correctness is the point.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://payflow:payflow@127.0.0.1:55433/payflow_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-000000000000000000000000001';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-00000000000000000000000002';
process.env.ACCESS_TOKEN_TTL = '15m';
process.env.REFRESH_TOKEN_TTL_DAYS = '30';
process.env.BCRYPT_ROUNDS = '4';
process.env.DEMO_MODE = 'true';
process.env.PAYMENT_PROVIDER = 'paystack';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_payflow_tests_000000000000000000000';
process.env.PAYSTACK_PUBLIC_KEY = 'pk_test_payflow_tests_000000000000000000000';
process.env.PAYSTACK_WEBHOOK_SECRET = 'sk_test_payflow_tests_000000000000000000000';
process.env.APP_BASE_URL = 'http://localhost:4000';
process.env.LOGIN_MAX_FAILED_ATTEMPTS = '5';
process.env.PIN_MAX_FAILED_ATTEMPTS = '5';
process.env.MIN_FUNDING_MINOR = '10000';
process.env.MAX_FUNDING_MINOR = '100000000';
process.env.MIN_TRANSFER_MINOR = '1000';
process.env.MAX_TRANSFER_MINOR = '50000000';
process.env.MIN_WITHDRAWAL_MINOR = '10000';
process.env.MAX_WITHDRAWAL_MINOR = '50000000';
process.env.MAX_WALLET_BALANCE_MINOR = '500000000';
process.env.DAILY_OUTFLOW_LIMIT_MINOR = '100000000';
