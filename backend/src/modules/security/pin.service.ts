import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { withTransaction } from '../../db/transaction';
import type { Tx } from '../../db';
import { transactionPins, users } from '../../db/schema';
import { env } from '../../config/env';
import { AppError, ErrorCodes, badRequest, notFound } from '../../utils/errors';
import { hashPassword, hashPin, verifyPassword, verifyPin } from '../../utils/crypto';
import { recordAudit } from '../audit/audit.service';
import { createNotification } from '../notifications/notifications.service';

export const PIN_REGEX = /^\d{4}$/;

export function assertPinFormat(pin: string): void {
  if (!PIN_REGEX.test(pin)) {
    throw badRequest(ErrorCodes.VALIDATION_ERROR, 'Transaction PIN must be exactly 4 digits');
  }
}

export async function hasPin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: transactionPins.id })
    .from(transactionPins)
    .where(eq(transactionPins.userId, userId))
    .limit(1);
  return Boolean(row);
}

/**
 * Verifies a transaction PIN in its own committed transaction so that failed
 * attempts are always recorded, even when the surrounding money movement aborts.
 *
 * The PIN is a server-side authorisation factor: biometrics on the device are a
 * convenience layer only and never substitute for this check.
 */
export async function verifyTransactionPin(userId: string, pin: string): Promise<void> {
  assertPinFormat(pin);

  await withTransaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(transactionPins)
      .where(eq(transactionPins.userId, userId))
      .limit(1)
      .for('update');

    if (!record) {
      throw new AppError(
        409,
        ErrorCodes.PIN_NOT_SET,
        'Set up a 4-digit transaction PIN before moving money.',
      );
    }

    if (record.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
      throw new AppError(
        429,
        ErrorCodes.PIN_LOCKED,
        'Transaction PIN is temporarily locked after too many incorrect attempts.',
        { lockedUntil: record.lockedUntil },
      );
    }

    const valid = await verifyPin(pin, record.pinHash);

    if (!valid) {
      const attempts = record.failedAttempts + 1;
      const shouldLock = attempts >= env.PIN_MAX_FAILED_ATTEMPTS;
      await tx
        .update(transactionPins)
        .set({
          failedAttempts: shouldLock ? 0 : attempts,
          lockedUntil: shouldLock ? new Date(Date.now() + env.PIN_LOCK_MINUTES * 60 * 1000) : record.lockedUntil,
          updatedAt: new Date(),
        })
        .where(eq(transactionPins.id, record.id));

      await recordAudit(tx, {
        actorUserId: userId,
        action: shouldLock ? 'security.pin_locked' : 'security.pin_failed',
        entityType: 'transaction_pin',
        entityId: record.id,
        metadata: { attempts },
      });

      if (shouldLock) {
        throw new AppError(
          429,
          ErrorCodes.PIN_LOCKED,
          'Too many incorrect PIN attempts. Transaction PIN is locked temporarily.',
        );
      }
      throw new AppError(400, ErrorCodes.PIN_INVALID, 'Incorrect transaction PIN');
    }

    await tx
      .update(transactionPins)
      .set({ failedAttempts: 0, lockedUntil: null, lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(transactionPins.id, record.id));
  });
}

export async function setTransactionPin(
  tx: Tx,
  userId: string,
  pin: string,
  { replaceExisting = false }: { replaceExisting?: boolean } = {},
): Promise<void> {
  assertPinFormat(pin);
  const [existing] = await tx
    .select({ id: transactionPins.id })
    .from(transactionPins)
    .where(eq(transactionPins.userId, userId))
    .limit(1);

  if (existing && !replaceExisting) {
    throw new AppError(409, ErrorCodes.PIN_ALREADY_SET, 'A transaction PIN is already set');
  }

  const pinHash = await hashPin(pin);
  if (existing) {
    await tx
      .update(transactionPins)
      .set({ pinHash, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(transactionPins.id, existing.id));
  } else {
    await tx.insert(transactionPins).values({ userId, pinHash });
  }

  await recordAudit(tx, {
    actorUserId: userId,
    action: existing ? 'security.pin_changed' : 'security.pin_created',
    entityType: 'transaction_pin',
    entityId: userId,
  });

  await createNotification(tx, {
    userId,
    type: 'SECURITY_ALERT',
    title: existing ? 'Transaction PIN updated' : 'Transaction PIN created',
    body: 'Your 4-digit transaction PIN was saved. Never share this PIN with anyone.',
  });
}

/** Changing the PIN requires the current account password (server-verified). */
export async function assertAccountPassword(tx: Tx, userId: string, password: string): Promise<void> {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound(ErrorCodes.NOT_FOUND, 'Account not found');
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new AppError(401, ErrorCodes.INVALID_CREDENTIALS, 'Password is incorrect');
}

export async function changePassword(tx: Tx, userId: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await tx
    .update(users)
    .set({ passwordHash, passwordUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
}
