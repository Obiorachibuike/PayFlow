import { Router } from 'express';
import { z } from 'zod';
import { withTransaction } from '../../db/transaction';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { ok, paginated } from '../../utils/respond';
import { formatNaira, toApiAmount } from '../../utils/money';
import { serializeWallet } from '../../utils/serializers';
import { listTransactions } from '../transactions/transactions.service';
import * as walletService from './wallet.service';

export const walletRouter = Router();

walletRouter.get('/', requireAuth, async (req, res) => {
  const wallet = await walletService.getFullWalletResponse(req.auth!.userId);
  ok(res, wallet);
});

walletRouter.get('/balance', requireAuth, async (req, res) => {
  const wallet = await walletService.getWalletForUser(req.auth!.userId);
  const stats = await walletService.getWalletStats(wallet.id);
  ok(res, {
    walletId: wallet.id,
    currency: wallet.currency,
    balanceMinor: toApiAmount(wallet.balanceMinor),
    balanceFormatted: formatNaira(wallet.balanceMinor, { currency: wallet.currency }),
    availableMinor: toApiAmount(wallet.balanceMinor - stats.pendingOutMinor),
    availableFormatted: formatNaira(wallet.balanceMinor - stats.pendingOutMinor, { currency: wallet.currency }),
    pendingOutMinor: toApiAmount(stats.pendingOutMinor),
    status: wallet.status,
    asOf: new Date(),
  });
});

walletRouter.get('/transactions', requireAuth, async (req, res) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      cursor: z.string().max(200).optional(),
      status: z.enum(['ALL', 'PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REVERSED']).default('ALL'),
      direction: z.enum(['ALL', 'in', 'out']).default('ALL'),
    })
    .parse(req.query);

  const { items, meta } = await listTransactions({
    userId: req.auth!.userId,
    limit: query.limit,
    cursor: query.cursor,
    status: query.status,
    direction: query.direction,
  });
  paginated(res, items, meta);
});

walletRouter.get('/ledger', requireAuth, async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
  const wallet = await walletService.getWalletForUser(req.auth!.userId);
  const entries = await walletService.getWalletLedgerEntries(wallet.id, limit);
  paginated(res, entries, { limit, count: entries.length });
});

/** Idempotent wallet creation for additional currencies (NGN today). */
walletRouter.post('/', requireAuth, requireVerifiedEmail, async (req, res) => {
  const { currency } = z.object({ currency: z.enum(['NGN']).default('NGN') }).parse(req.body ?? {});
  const wallet = await withTransaction((tx) =>
    walletService.createWalletForUser(tx, req.auth!.userId, currency),
  );
  const account = await walletService.getWalletForUser(req.auth!.userId);
  ok(res, serializeWallet({ ...wallet, ...account }, account.accountName), 201);
});
