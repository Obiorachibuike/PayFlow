import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { requireIdempotencyKey, withIdempotency } from '../../middleware/idempotency';
import { financialLimiter } from '../../middleware/rateLimit';
import { ok, paginated } from '../../utils/respond';
import { buildReceipt } from '../transactions/transactions.service';
import * as withdrawalsService from './withdrawals.service';

export const withdrawalsRouter = Router();

const createWithdrawalSchema = z
  .object({
    amountMinor: z.number().int().positive(),
    beneficiaryId: z.string().uuid().optional(),
    bankCode: z.string().min(2).max(10).optional(),
    bankName: z.string().min(2).max(80).optional(),
    accountName: z.string().min(2).max(80).optional(),
    accountNumber: z.string().regex(/^\d{10}$/).optional(),
    narration: z.string().trim().max(140).optional(),
    pin: z.string().regex(/^\d{4}$/, 'Enter your 4-digit transaction PIN'),
  })
  .refine((value) => Boolean(value.beneficiaryId) || Boolean(value.accountNumber), {
    message: 'Choose a beneficiary or provide bank account details',
  });

withdrawalsRouter.post('/', requireAuth, requireVerifiedEmail, financialLimiter, async (req, res) => {
  const key = requireIdempotencyKey(req);
  const input = createWithdrawalSchema.parse(req.body);

  const result = await withIdempotency(
    { userId: req.auth!.userId, scope: 'withdrawals.create', key, requestBody: input },
    async () => {
      const withdrawal = await withdrawalsService.createWithdrawal({
        userId: req.auth!.userId,
        amountMinor: BigInt(input.amountMinor),
        beneficiaryId: input.beneficiaryId,
        bankCode: input.bankCode,
        bankName: input.bankName,
        accountName: input.accountName,
        accountNumber: input.accountNumber,
        narration: input.narration,
        pin: input.pin,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']?.slice(0, 300),
      });

      const receipt = await buildReceipt(req.auth!.userId, withdrawal.transactionId);

      return {
        status: 201,
        resourceId: withdrawal.withdrawalId,
        body: { withdrawal, receipt },
      };
    },
  );

  ok(res, result.body, result.status);
});

withdrawalsRouter.get('/', requireAuth, async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(50).default(20).parse(req.query.limit);
  const withdrawals = await withdrawalsService.listWithdrawals(req.auth!.userId, limit);
  paginated(res, withdrawals, { limit, hasMore: false, nextCursor: null });
});

withdrawalsRouter.get('/:id', requireAuth, async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const withdrawal = await withdrawalsService.getWithdrawal(req.auth!.userId, id);
  ok(res, withdrawal);
});
