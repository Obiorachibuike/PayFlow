import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { requireIdempotencyKey, withIdempotency } from '../../middleware/idempotency';
import { financialLimiter } from '../../middleware/rateLimit';
import { badRequest } from '../../utils/errors';
import { ok } from '../../utils/respond';
import { buildReceipt } from '../transactions/transactions.service';
import * as transfersService from './transfers.service';

export const transfersRouter = Router();

const recipientSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().min(7).max(20).optional(),
    walletTag: z.string().trim().min(6).max(24).optional(),
  })
  .refine((value) => Boolean(value.email || value.phone || value.walletTag), {
    message: 'Provide an email, phone number or wallet ID',
  });

const createTransferSchema = z.object({
  recipient: recipientSchema,
  amountMinor: z.number().int().positive(),
  description: z.string().trim().max(140).optional(),
  pin: z.string().regex(/^\d{4}$/, 'Enter your 4-digit transaction PIN'),
});

transfersRouter.post('/resolve-recipient', requireAuth, async (req, res) => {
  const recipient = recipientSchema.parse(req.body);
  const result = await transfersService.resolveRecipient(recipient);
  ok(res, result);
});

transfersRouter.post('/', requireAuth, requireVerifiedEmail, financialLimiter, async (req, res) => {
  const key = requireIdempotencyKey(req);
  const input = createTransferSchema.parse(req.body);

  const result = await withIdempotency(
    {
      userId: req.auth!.userId,
      scope: 'transfers.create',
      key,
      requestBody: { ...input, amountMinor: input.amountMinor },
    },
    async () => {
      const transfer = await transfersService.createTransfer({
        userId: req.auth!.userId,
        recipient: input.recipient,
        amountMinor: BigInt(input.amountMinor),
        description: input.description,
        pin: input.pin,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']?.slice(0, 300),
      });

      const receipt = await buildReceipt(req.auth!.userId, transfer.transactionId);

      return {
        status: 201,
        resourceId: transfer.transactionId,
        body: {
          transaction: {
            id: transfer.transactionId,
            reference: transfer.reference,
            status: transfer.status,
            type: 'TRANSFER_OUT' as const,
            direction: 'out' as const,
            amountMinor: transfer.amountMinor,
            recipientName: transfer.recipientName,
            createdAt: transfer.createdAt,
          },
          walletBalanceMinor: transfer.walletBalanceMinor,
          receipt,
        },
      };
    },
  );

  ok(res, result.body, result.status);
});

transfersRouter.get('/:id', requireAuth, async (req, res) => {
  const id = z.string().uuid('Invalid transfer id').parse(req.params.id);
  const transfer = await transfersService.getTransferForUser(req.auth!.userId, id);
  if (!transfer) throw badRequest('NOT_FOUND', 'Transfer not found');
  ok(res, transfer);
});
