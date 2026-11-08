import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { requireIdempotencyKey, withIdempotency } from '../../middleware/idempotency';
import { financialLimiter } from '../../middleware/rateLimit';
import { ok } from '../../utils/respond';
import { toMinorUnits } from '../../utils/money';
import { badRequest } from '../../utils/errors';
import * as paymentsService from './payments.service';

export const paymentsRouter = Router();

export const initializePaymentSchema = z.object({
  amountMinor: z.number().int().positive().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  channel: z.enum(['PAYSTACK', 'DEMO']).default('PAYSTACK'),
  simulate: z.enum(['success', 'failure']).optional(),
});

export function resolveAmountMinor(input: { amountMinor?: number; amount?: string | number }): bigint {
  if (input.amountMinor !== undefined) return BigInt(input.amountMinor);
  if (input.amount !== undefined) {
    const minor = toMinorUnits(input.amount);
    if (minor <= 0n) throw badRequest('VALIDATION_ERROR', 'Amount must be greater than zero');
    return minor;
  }
  throw badRequest('VALIDATION_ERROR', 'Provide amountMinor (integer kobo) or amount (naira)');
}

paymentsRouter.post('/initialize', requireAuth, requireVerifiedEmail, financialLimiter, async (req, res) => {
  const key = requireIdempotencyKey(req);
  const input = initializePaymentSchema.parse(req.body);
  const amountMinor = resolveAmountMinor(input);

  const result = await withIdempotency(
    { userId: req.auth!.userId, scope: 'payments.initialize', key, requestBody: { ...input, amountMinor: amountMinor.toString() } },
    async () => {
      const body = await paymentsService.initializePayment({
        userId: req.auth!.userId,
        email: req.auth!.email,
        amountMinor,
        channel: input.channel,
        simulate: input.simulate,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']?.slice(0, 300),
      });
      return { status: 201, body };
    },
  );

  ok(res, result.body, result.status);
});

paymentsRouter.get('/verify/:reference', requireAuth, async (req, res) => {
  const reference = z.string().min(4).max(120).parse(req.params.reference);
  const result = await paymentsService.verifyPayment(reference, { source: 'client' });
  ok(res, result);
});

/** Demo-only confirmation endpoint. Mirrors the provider verification flow exactly. */
paymentsRouter.post('/demo/confirm', requireAuth, requireVerifiedEmail, financialLimiter, async (req, res) => {
  const { reference } = z.object({ reference: z.string().min(4).max(120) }).parse(req.body);
  const result = await paymentsService.verifyPayment(reference, { source: 'demo' });
  ok(res, result);
});

/**
 * Paystack webhook. The HMAC-SHA512 signature is validated against the exact
 * request bytes (captured by the JSON body parser's `verify` hook), never a
 * re-serialised object.
 */
paymentsRouter.post(
  '/webhooks/paystack',
  async (req, res) => {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const signatureHeader = req.headers['x-paystack-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const result = await paymentsService.handlePaystackWebhook(rawBody, signature);
    // Always 200 once the delivery has been recorded, so Paystack stops retrying.
    res.status(200).json({ received: true, outcome: result.status });
  },
);
