import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '../../db';
import { withTransaction } from '../../db/transaction';
import { banks, beneficiaries } from '../../db/schema';
import type { Beneficiary } from '../../db/schema';
import { AppError, ErrorCodes, conflict, notFound, pgErrorCode } from '../../utils/errors';
import { accountNumberLast4 } from '../../utils/crypto';
import { serializeBeneficiary } from '../../utils/serializers';
import { recordAudit } from '../audit/audit.service';

export interface CreateBeneficiaryInput {
  userId: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  isDefault?: boolean;
}

async function findBank(code: string) {
  const [bank] = await db.select().from(banks).where(eq(banks.code, code)).limit(1);
  if (!bank) throw notFound(ErrorCodes.BANK_NOT_FOUND, 'We could not find that bank');
  return bank;
}

export async function listBeneficiaries(userId: string) {
  const rows = await db
    .select()
    .from(beneficiaries)
    .where(and(eq(beneficiaries.userId, userId), isNull(beneficiaries.deletedAt)))
    .orderBy(asc(beneficiaries.bankName), asc(beneficiaries.accountName));
  return rows.map(serializeBeneficiary);
}

export async function getBeneficiaryOrThrow(userId: string, id: string): Promise<Beneficiary> {
  const [row] = await db
    .select()
    .from(beneficiaries)
    .where(and(eq(beneficiaries.id, id), eq(beneficiaries.userId, userId), isNull(beneficiaries.deletedAt)))
    .limit(1);
  if (!row) throw notFound(ErrorCodes.BENEFICIARY_NOT_FOUND, 'Beneficiary not found');
  return row;
}

export async function createBeneficiary(input: CreateBeneficiaryInput) {
  const bank = await findBank(input.bankCode);

  try {
    return await withTransaction(async (tx) => {
      if (input.isDefault) {
        await tx
          .update(beneficiaries)
          .set({ isDefault: false })
          .where(eq(beneficiaries.userId, input.userId));
      }

      const [row] = await tx
        .insert(beneficiaries)
        .values({
          userId: input.userId,
          bankCode: bank.code,
          bankName: bank.name,
          accountNumber: input.accountNumber,
          accountNumberLast4: accountNumberLast4(input.accountNumber),
          accountName: input.accountName,
          // The name came from the user, not from a bank lookup, so it is not
          // presented as verified. PayFlow labels these as "unverified".
          verifiedStatus: 'UNVERIFIED',
          isDefault: input.isDefault ?? false,
        })
        .returning();

      await recordAudit(tx, {
        actorUserId: input.userId,
        action: 'beneficiary.created',
        entityType: 'beneficiary',
        entityId: row!.id,
      });

      return serializeBeneficiary(row!);
    });
  } catch (error) {
    if (pgErrorCode(error) === '23505') {
      throw conflict(ErrorCodes.DUPLICATE_BENEFICIARY, 'This beneficiary is already saved');
    }
    throw error;
  }
}

export interface UpdateBeneficiaryInput {
  accountName?: string;
  isDefault?: boolean;
}

export async function updateBeneficiary(userId: string, id: string, input: UpdateBeneficiaryInput) {
  await getBeneficiaryOrThrow(userId, id);

  return withTransaction(async (tx) => {
    if (input.isDefault) {
      await tx
        .update(beneficiaries)
        .set({ isDefault: false })
        .where(and(eq(beneficiaries.userId, userId), ne(beneficiaries.id, id)));
    }

    const [row] = await tx
      .update(beneficiaries)
      .set({
        ...(input.accountName ? { accountName: input.accountName } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(beneficiaries.id, id), eq(beneficiaries.userId, userId)))
      .returning();

    if (!row) throw notFound(ErrorCodes.BENEFICIARY_NOT_FOUND, 'Beneficiary not found');

    await recordAudit(tx, {
      actorUserId: userId,
      action: 'beneficiary.updated',
      entityType: 'beneficiary',
      entityId: id,
      metadata: { ...input },
    });

    return serializeBeneficiary(row);
  });
}

/** Soft delete keeps historical withdrawals pointing at a valid row. */
export async function deleteBeneficiary(userId: string, id: string) {
  await getBeneficiaryOrThrow(userId, id);
  await withTransaction(async (tx) => {
    await tx
      .update(beneficiaries)
      .set({ deletedAt: new Date(), isDefault: false, updatedAt: new Date() })
      .where(and(eq(beneficiaries.id, id), eq(beneficiaries.userId, userId)));
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'beneficiary.deleted',
      entityType: 'beneficiary',
      entityId: id,
    });
  });
}

/**
 * Mock name resolution. This is clearly NOT a real bank lookup and the UI must
 * not present the result as verified account ownership.
 */
export function resolveAccountMock(accountNumber: string) {
  const bank = null;
  const names = ['ADEBAYO OKAFOR', 'CHIAMAKA NNODIM', 'IBRAHIM MUSA', 'FUNMILAYO ADEYEMI', 'TUNDE BALOGUN'];
  const index = Number(accountNumber.slice(-2)) % names.length;
  return {
    accountNumber,
    resolvedName: names[index] ?? names[0]!,
    verificationStatus: 'SIMULATED' as const,
    bank,
    note: 'Simulated name lookup for the demo environment. PayFlow has not contacted the bank.',
  };
}

export async function listBanks() {
  const rows = await db.select().from(banks).where(eq(banks.isActive, true)).orderBy(asc(banks.name));
  return rows.map((bank) => ({ code: bank.code, name: bank.name }));
}

export function assertAccountNumber(accountNumber: string): void {
  if (!/^\d{10}$/.test(accountNumber)) {
    throw new AppError(400, ErrorCodes.INVALID_ACCOUNT_DETAILS, 'Nigerian account numbers are 10 digits');
  }
}
