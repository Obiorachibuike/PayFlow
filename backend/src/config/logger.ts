import pino from 'pino';
import { env, isProduction } from './env';

/**
 * Structured logger with aggressive redaction. Passwords, tokens, PINs and
 * provider secrets must never reach the log stream.
 */
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  base: { service: 'payflow-api', env: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.body.password',
      'req.body.currentPassword',
      'req.body.newPassword',
      'req.body.confirmPassword',
      'req.body.pin',
      'req.body.currentPin',
      'req.body.newPin',
      'req.body.refreshToken',
      'req.body.token',
      'req.body.code',
      'req.body.otp',
      'res.headers["set-cookie"]',
      'password',
      'passwordHash',
      'pin',
      'pinHash',
      'token',
      'refreshToken',
      'accessToken',
      'authorization',
      'secret',
      'PAYSTACK_SECRET_KEY',
      'PAYSTACK_WEBHOOK_SECRET',
    ],
    censor: '[REDACTED]',
  },
  transport: !isProduction && env.NODE_ENV !== 'test' ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } : undefined,
});

export type Logger = typeof logger;
