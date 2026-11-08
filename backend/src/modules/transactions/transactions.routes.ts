import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { ok, paginated } from '../../utils/respond';
import * as transactionsService from './transactions.service';

export const transactionsRouter = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
  status: z.enum(['ALL', 'PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REVERSED']).default('ALL'),
  type: z
    .enum(['ALL', 'FUNDING', 'TRANSFER_IN', 'TRANSFER_OUT', 'WITHDRAWAL', 'REFUND', 'PAYMENT', 'ADJUSTMENT'])
    .default('ALL'),
  direction: z.enum(['ALL', 'in', 'out']).default('ALL'),
  search: z.string().trim().max(80).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

transactionsRouter.get('/', requireAuth, async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const { items, meta } = await transactionsService.listTransactions({
    userId: req.auth!.userId,
    limit: query.limit,
    cursor: query.cursor,
    status: query.status,
    type: query.type,
    direction: query.direction,
    search: query.search,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });
  paginated(res, items, meta);
});

transactionsRouter.get('/:id', requireAuth, async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const transaction = await transactionsService.getTransactionResponse(req.auth!.userId, id);
  ok(res, transaction);
});

transactionsRouter.get('/:id/receipt', requireAuth, async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const receipt = await transactionsService.buildReceipt(req.auth!.userId, id);
  ok(res, receipt);
});
