import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../../db';
import { otpTokens } from '../../db/schema';
import { AppError, ErrorCodes } from '../../utils/errors';
import { generateNumericCode, sha256 } from '../../utils/crypto';

export type OtpPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'PHONE_VERIFICATION' | 'LOGIN_2FA';

const MAX_OTP_ATTEMPTS = 5;

function hashOtp(purpose: OtpPurpose, code: string): string {
  return sha256(`${purpose}:${code}`);
}

export interface IssuedOtp {
  code: string;
  expiresAt: Date;
}

/** Issues a one-time code, invalidating any previous unconsumed code of the same purpose. */
export async function issueOtp(tx: Tx, userId: string, purpose: OtpPurpose, ttlMinutes = 10): Promise<IssuedOtp> {
  await tx
    .update(otpTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpTokens.userId, userId), eq(otpTokens.type, purpose), isNull(otpTokens.consumedAt)));

  const code = generateNumericCode(6);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await tx.insert(otpTokens).values({
    userId,
    type: purpose,
    codeHash: hashOtp(purpose, code),
    expiresAt,
  });

  return { code, expiresAt };
}

/** Validates and consumes an OTP, tracking attempts to prevent brute force. */
export async function consumeOtp(tx: Tx, userId: string, purpose: OtpPurpose, code: string): Promise<void> {
  const [record] = await tx
    .select()
    .from(otpTokens)
    .where(and(eq(otpTokens.userId, userId), eq(otpTokens.type, purpose), isNull(otpTokens.consumedAt)))
    .orderBy(desc(otpTokens.createdAt))
    .limit(1)
    .for('update');

  if (!record) {
    throw new AppError(400, ErrorCodes.INVALID_OTP, 'No active code found. Please request a new one.');
  }

  if (record.expiresAt.getTime() < Date.now()) {
    await tx.update(otpTokens).set({ consumedAt: new Date() }).where(eq(otpTokens.id, record.id));
    throw new AppError(400, ErrorCodes.OTP_EXPIRED, 'This code has expired. Please request a new one.');
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new AppError(429, ErrorCodes.OTP_ATTEMPTS_EXCEEDED, 'Too many incorrect attempts. Request a new code.');
  }

  if (record.codeHash !== hashOtp(purpose, code)) {
    await tx
      .update(otpTokens)
      .set({ attempts: record.attempts + 1 })
      .where(eq(otpTokens.id, record.id));
    throw new AppError(400, ErrorCodes.INVALID_OTP, 'That code is not correct');
  }

  await tx.update(otpTokens).set({ consumedAt: new Date() }).where(eq(otpTokens.id, record.id));
}
