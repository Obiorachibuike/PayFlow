import type { Request } from 'express';
import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { env, isTest } from '../config/env';
import { ErrorCodes } from '../utils/errors';

export interface LimiterOptions {
  windowMs?: number;
  limit?: number;
  keyPrefix: string;
  message?: string;
  /** Keyed per authenticated user when available, otherwise per IP. */
  perUser?: boolean;
}

/**
 * Rate limiting is applied per route family. In tests the limiter is disabled by
 * default (except in the dedicated rate-limit test, which builds its own).
 */
export function createRateLimiter({
  windowMs = env.RATE_LIMIT_WINDOW_MS,
  limit = env.RATE_LIMIT_MAX,
  keyPrefix,
  message = 'Too many requests. Please slow down and try again shortly.',
  perUser = false,
}: LimiterOptions) {
  const options: Partial<Options> = {
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest && process.env.PAYFLOW_TEST_RATE_LIMIT !== 'on',
    keyGenerator: (req: Request) => {
      if (perUser && req.auth?.userId) return `${keyPrefix}:${req.auth.userId}`;
      // ipKeyGenerator normalises IPv6 addresses into a single /56 bucket so a
      // client cannot evade the limiter by rotating through its IPv6 range.
      return `${keyPrefix}:${ipKeyGenerator(req.ip ?? 'unknown')}`;
    },
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: ErrorCodes.RATE_LIMITED, message },
      });
    },
  };

  return rateLimit(options as Options);
}

export const globalLimiter = createRateLimiter({ keyPrefix: 'global' });

export const authLimiter = createRateLimiter({
  keyPrefix: 'auth',
  limit: env.AUTH_RATE_LIMIT_MAX,
  message: 'Too many authentication attempts. Please wait a moment before trying again.',
});

export const financialLimiter = createRateLimiter({
  keyPrefix: 'financial',
  limit: 60,
  perUser: true,
  message: 'Too many financial operations. Please wait a moment before trying again.',
});

export const otpLimiter = createRateLimiter({
  keyPrefix: 'otp',
  limit: 10,
  message: 'Too many verification attempts. Please request a new code later.',
});
