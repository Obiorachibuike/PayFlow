import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { withTransaction } from '../../db/transaction';
import { deviceSessions, transactionPins } from '../../db/schema';
import { users } from '../../db/schema';
import { AppError, ErrorCodes, badRequest, notFound } from '../../utils/errors';
import { serializeDeviceSession, serializeUser } from '../../utils/serializers';
import { recordAudit } from '../audit/audit.service';
import { createNotification } from '../notifications/notifications.service';
import {
  assertAccountPassword,
  changePassword,
  hasPin,
  setTransactionPin,
  verifyTransactionPin,
} from '../security/pin.service';
import { revokeAllDeviceSessions, revokeAllRefreshTokens, revokeDeviceSession } from '../auth/tokens.service';
import { getFullWalletResponse } from '../wallet/wallet.service';

export async function getProfile(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound(ErrorCodes.NOT_FOUND, 'Account not found');

  const [pin] = await db
    .select({
      id: transactionPins.id,
      failedAttempts: transactionPins.failedAttempts,
      lockedUntil: transactionPins.lockedUntil,
    })
    .from(transactionPins)
    .where(eq(transactionPins.userId, userId))
    .limit(1);

  const sessions = await db
    .select({ id: deviceSessions.id })
    .from(deviceSessions)
    .where(and(eq(deviceSessions.userId, userId), isNull(deviceSessions.revokedAt)));

  const walletResponse = await getFullWalletResponse(userId);

  return {
    user: serializeUser(user),
    wallet: walletResponse.wallet,
    stats: walletResponse.stats,
    security: {
      pinConfigured: Boolean(pin),
      pinLockedUntil: pin?.lockedUntil ?? null,
      biometricEnabled: user.biometricEnabled,
      emailVerified: Boolean(user.emailVerifiedAt),
      activeSessions: sessions.length,
      kycStatus: user.kycStatus,
    },
  };
}

export interface UpdateProfileInput {
  fullName?: string;
  avatarColor?: string;
  themePreference?: 'SYSTEM' | 'LIGHT' | 'DARK';
  biometricEnabled?: boolean;
  notifyPush?: boolean;
  notifyEmail?: boolean;
  notifySecurity?: boolean;
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const [user] = await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!user) throw notFound(ErrorCodes.NOT_FOUND, 'Account not found');

  await recordAudit(db, {
    actorUserId: userId,
    action: 'profile.updated',
    entityType: 'user',
    entityId: userId,
    metadata: { fields: Object.keys(input) },
  });

  return serializeUser(user);
}

export async function updatePassword(userId: string, currentPassword: string, newPassword: string) {
  if (currentPassword === newPassword) {
    throw badRequest(ErrorCodes.VALIDATION_ERROR, 'New password must be different from the current password');
  }

  await withTransaction(async (tx) => {
    await assertAccountPassword(tx, userId, currentPassword);
    await changePassword(tx, userId, newPassword);
    await revokeAllRefreshTokens(tx, userId, 'password_change');
    await revokeAllDeviceSessions(tx, userId);
    await recordAudit(tx, {
      actorUserId: userId,
      action: 'profile.password_changed',
      entityType: 'user',
      entityId: userId,
    });
    await createNotification(tx, {
      userId,
      type: 'SECURITY_ALERT',
      title: 'Password changed',
      body: 'Your password was updated and all sessions were signed out. Sign in again with your new password.',
    });
  });

  return { success: true, reauthenticate: true };
}

export interface SetPinInput {
  newPin: string;
  currentPin?: string;
  password?: string;
}

/**
 * Creates or changes the transaction PIN. The PIN itself is never stored in
 * plaintext and never returned by the API.
 */
export async function updatePin(userId: string, input: SetPinInput) {
  const exists = await hasPin(userId);

  if (exists) {
    if (input.currentPin) {
      await verifyTransactionPin(userId, input.currentPin);
    } else if (input.password) {
      await withTransaction((tx) => assertAccountPassword(tx, userId, input.password!));
    } else {
      throw new AppError(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'Provide your current transaction PIN or account password to change the PIN',
      );
    }
  } else if (!input.password) {
    throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Enter your account password to create a transaction PIN');
  } else {
    await withTransaction((tx) => assertAccountPassword(tx, userId, input.password!));
  }

  await withTransaction(async (tx) => {
    await setTransactionPin(tx, userId, input.newPin, { replaceExisting: exists });
  });

  return { success: true, pinConfigured: true, changed: exists };
}

export async function listSessions(userId: string, currentSessionId?: string | null) {
  const rows = await db
    .select()
    .from(deviceSessions)
    .where(and(eq(deviceSessions.userId, userId), isNull(deviceSessions.revokedAt)))
    .orderBy(desc(deviceSessions.lastActiveAt));

  return rows.map((row) => serializeDeviceSession(row, currentSessionId ?? undefined));
}

export async function revokeSession(userId: string, sessionId: string) {
  const revoked = await revokeDeviceSession(userId, sessionId);
  if (!revoked) throw notFound(ErrorCodes.NOT_FOUND, 'Session not found');
  await recordAudit(db, {
    actorUserId: userId,
    action: 'profile.session_revoked',
    entityType: 'device_session',
    entityId: sessionId,
  });
  return { success: true };
}

export async function setBiometrics(userId: string, enabled: boolean, sessionId?: string | null) {
  await db.update(users).set({ biometricEnabled: enabled, updatedAt: new Date() }).where(eq(users.id, userId));
  if (sessionId) {
    await db
      .update(deviceSessions)
      .set({ biometricEnabled: enabled })
      .where(and(eq(deviceSessions.id, sessionId), eq(deviceSessions.userId, userId)));
  }
  await recordAudit(db, {
    actorUserId: userId,
    action: enabled ? 'profile.biometrics_enabled' : 'profile.biometrics_disabled',
    entityType: 'user',
    entityId: userId,
  });
  return { success: true, biometricEnabled: enabled };
}
