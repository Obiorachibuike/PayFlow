/**
 * Canonical application error type. Every API failure is expressed as one of
 * these so that responses stay consistent and never leak internals.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(statusCode: number, code: string, message: string, details?: unknown, expose = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);

export const unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);

export const forbidden = (code: string, message: string, details?: unknown) =>
  new AppError(403, code, message, details);

export const notFound = (code: string, message: string) => new AppError(404, code, message);

export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);

export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(422, code, message, details);

export const tooManyRequests = (code: string, message: string, details?: unknown) =>
  new AppError(429, code, message, details);

export const serviceUnavailable = (code: string, message: string, details?: unknown) =>
  new AppError(503, code, message, details);

export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  PHONE_TAKEN: 'PHONE_TAKEN',
  FORBIDDEN: 'FORBIDDEN',
  PIN_NOT_SET: 'PIN_NOT_SET',
  PIN_INVALID: 'PIN_INVALID',
  PIN_LOCKED: 'PIN_LOCKED',
  PIN_ALREADY_SET: 'PIN_ALREADY_SET',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  WALLET_FROZEN: 'WALLET_FROZEN',
  WALLET_BALANCE_LIMIT: 'WALLET_BALANCE_LIMIT',
  RECIPIENT_NOT_FOUND: 'RECIPIENT_NOT_FOUND',
  SELF_TRANSFER: 'SELF_TRANSFER',
  TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',
  DUPLICATE_REFERENCE: 'DUPLICATE_REFERENCE',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
  PAYMENT_PROVIDER_UNAVAILABLE: 'PAYMENT_PROVIDER_UNAVAILABLE',
  PAYMENT_VERIFICATION_FAILED: 'PAYMENT_VERIFICATION_FAILED',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  PAYMENT_CURRENCY_MISMATCH: 'PAYMENT_CURRENCY_MISMATCH',
  PAYMENT_ALREADY_PROCESSED: 'PAYMENT_ALREADY_PROCESSED',
  INVALID_WEBHOOK_SIGNATURE: 'INVALID_WEBHOOK_SIGNATURE',
  INVALID_OTP: 'INVALID_OTP',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_ATTEMPTS_EXCEEDED: 'OTP_ATTEMPTS_EXCEEDED',
  BENEFICIARY_NOT_FOUND: 'BENEFICIARY_NOT_FOUND',
  DUPLICATE_BENEFICIARY: 'DUPLICATE_BENEFICIARY',
  INVALID_ACCOUNT_DETAILS: 'INVALID_ACCOUNT_DETAILS',
  BANK_NOT_FOUND: 'BANK_NOT_FOUND',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE: 'UNPROCESSABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  DEMO_ONLY: 'DEMO_ONLY',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Drizzle wraps driver errors (`DrizzleQueryError`), so the PostgreSQL error code
 * can live on the error itself or on `cause`.
 */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === 'object' && 'code' in current) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    }
    current = (current as { cause?: unknown })?.cause;
  }
  return undefined;
}

export function pgErrorConstraint(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === 'object' && 'constraint' in current) {
      const constraint = (current as { constraint?: unknown }).constraint;
      if (typeof constraint === 'string') return constraint;
    }
    current = (current as { cause?: unknown })?.cause;
  }
  return undefined;
}
