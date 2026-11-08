import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { ok, paginated } from '../../utils/respond';
import * as beneficiariesService from './beneficiaries.service';

export const beneficiariesRouter = Router();

const createSchema = z.object({
  bankCode: z.string().trim().min(2).max(10),
  accountNumber: z.string().trim().max(20),
  accountName: z.string().trim().min(2).max(80),
  isDefault: z.boolean().optional(),
});

const updateSchema = z.object({
  accountName: z.string().trim().min(2).max(80).optional(),
  isDefault: z.boolean().optional(),
});

beneficiariesRouter.get('/', requireAuth, async (req, res) => {
  const items = await beneficiariesService.listBeneficiaries(req.auth!.userId);
  paginated(res, items, { count: items.length });
});

beneficiariesRouter.post('/', requireAuth, async (req, res) => {
  const input = createSchema.parse(req.body);
  beneficiariesService.assertAccountNumber(input.accountNumber);
  const beneficiary = await beneficiariesService.createBeneficiary({ userId: req.auth!.userId, ...input });
  ok(res, beneficiary, 201);
});

/** Mock account-name resolution — explicitly labelled as simulated. */
beneficiariesRouter.post('/resolve-account', requireAuth, async (req, res) => {
  const { accountNumber, bankCode } = z
    .object({ accountNumber: z.string().regex(/^\d{10}$/), bankCode: z.string().min(2).max(10) })
    .parse(req.body);
  beneficiariesService.assertAccountNumber(accountNumber);
  const resolution = beneficiariesService.resolveAccountMock(accountNumber);
  ok(res, { ...resolution, bankCode });
});

beneficiariesRouter.patch('/:id', requireAuth, async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const input = updateSchema.parse(req.body);
  const beneficiary = await beneficiariesService.updateBeneficiary(req.auth!.userId, id, input);
  ok(res, beneficiary);
});

beneficiariesRouter.delete('/:id', requireAuth, async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await beneficiariesService.deleteBeneficiary(req.auth!.userId, id);
  ok(res, { success: true });
});

export const banksRouter = Router();

banksRouter.get('/', async (_req, res) => {
  const banks = await beneficiariesService.listBanks();
  paginated(res, banks, { count: banks.length });
});
