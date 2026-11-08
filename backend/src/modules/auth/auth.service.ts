import { and, eq, isNull } from 'drizzle-orm';
import type { Request } from 'express';
import { db } from '../../db';
import { withTransaction } from '../../db/transaction';
import { transactionPins, users } from '../../db/schema';
import type { User } from '../../db/schema';
import { env, isProduction } from '../../config/env';
import { logger } from '../../config/logger';
import {
  AppError,
  ErrorCodes,
  badRequest,
  conflict,
  forbidden,
  tooManyRequests,
  unauthorized,
} from '../../utils/errors';
import { hashPassword, verifyPassword } from '../../utils/crypto';
import { serializeUser } from '../../utils/serializers';
import { recordAudit } from '../audit/audit.service';
import { createNotification } from '../notifications/notifications.service';
import { createWalletForUser } from '../wallet/wallet.service';
import { consumeOtp, issueOtp } from './otp.service';
import {
  issueTokens,
  revokeAllDeviceSessions,
  revokeAllRefreshTokens,
  revokeDeviceSessionInTx,
  revokeRefreshToken,
  rotateRefreshToken,
  type DeviceContext,
  type IssuedTokens,
} from './tokens.service';
import type { LoginInput, RegisterInput } from './auth.schemas';

// A real bcrypt hash used to equalise timing when an account does not exist.
const DUMMY_HASH = '$2b$12$K4rGZ8q0jM1z5bW7cS9xyePq0h1uJm6iC2nQ5vX8dY3tR4wZ7aB1C';

export function deviceContextFromRequest(req: Request): DeviceContext {
  const body = req.body as { device?: Record<string, unknown> } | undefined;
  const device = (body?.device ?? {}) as Record<string, string | undefined>;
  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    platform: device.platform,
    appVersion: device.appVersion,
    ipAddress: req.ip ?? undefined,
    userAgent: req.headers['user-agent']?.slice(0, 300),
  };
}

function demoCode(code: string): string | undefined {
  return env.DEMO_MODE && !isProduction ? code : undefined;
}

export interface AuthResult {
  user: ReturnType<typeof serializeUser>;
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresIn: number;
    refreshTokenExpiresAt: Date;
  };
  wallet: { id: string; walletTag: string; currency: string };
  verification?: { required: boolean; email: string; demoCode?: string; expiresAt?: Date };
}

export async function register(input: RegisterInput, device: DeviceContext): Promise<AuthResult> {
  const existingEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existingEmail.length > 0) {
    throw conflict(ErrorCodes.EMAIL_TAKEN, 'An account with this email already exists');
  }
  const existingPhone = await db.select({ id: users.id }).from(users).where(eq(users.phone, input.phone)).limit(1);
  if (existingPhone.length > 0) {
    throw conflict(ErrorCodes.PHONE_TAKEN, 'An account with this phone number already exists');
  }

  const passwordHash = await hashPassword(input.password);

  return withTransaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        passwordHash,
      })
      .returning();

    if (!user) throw new AppError(500, ErrorCodes.INTERNAL_ERROR, 'Could not create account');

    const wallet = await createWalletForUser(tx, user.id);
    const otp = await issueOtp(tx, user.id, 'EMAIL_VERIFICATION', 30);
    const tokens = await issueTokens(tx, user.id, device);

    await createNotification(tx, {
      userId: user.id,
      type: 'SYSTEM',
      title: 'Welcome to PayFlow',
      body: 'Your wallet is ready. Verify your email to start moving money.',
      data: { flow: 'onboarding' },
    });

    await recordAudit(tx, {
      actorUserId: user.id,
      action: 'auth.register',
      entityType: 'user',
      entityId: user.id,
      ipAddress: device.ipAddress ?? null,
      userAgent: device.userAgent ?? null,
    });

    return {
      user: serializeUser(user),
      tokens: publicTokens(tokens),
      wallet: { id: wallet.id, walletTag: wallet.walletTag, currency: wallet.currency },
      verification: {
        required: true,
        email: user.email,
        demoCode: demoCode(otp.code),
        expiresAt: otp.expiresAt,
      },
    };
  });
}

function publicTokens(tokens: IssuedTokens) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessTokenExpiresIn: tokens.accessTokenExpiresIn,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
  };
}

function isLocked(user: User): boolean {
  return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
}

export async function login(input: LoginInput, device: DeviceContext): Promise<AuthResult> {
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  if (!user || user.deletedAt) {
    await verifyPassword(input.password, DUMMY_HASH);
    throw unauthorized('Email or password is incorrect', ErrorCodes.INVALID_CREDENTIALS);
  }

  if (user.status !== 'ACTIVE') {
    throw forbidden(ErrorCodes.ACCOUNT_SUSPENDED, 'This account is not active. Contact support.');
  }

  if (isLocked(user)) {
    throw tooManyRequests(
      ErrorCodes.ACCOUNT_LOCKED,
      'Too many failed attempts. Try again later.',
      { lockedUntil: user.lockedUntil },
    );
  }

  const passwordValid = await verifyPassword(input.password, user.passwordHash);

  if (!passwordValid) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= env.LOGIN_MAX_FAILED_ATTEMPTS;
    await db
      .update(users)
      .set({
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60 * 1000) : user.lockedUntil,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await recordAudit(db, {
      actorUserId: user.id,
      action: shouldLock ? 'auth.login_locked' : 'auth.login_failed',
      entityType: 'user',
      entityId: user.id,
      ipAddress: device.ipAddress ?? null,
      userAgent: device.userAgent ?? null,
      metadata: { attempts },
    });

    if (shouldLock) {
      throw tooManyRequests(ErrorCodes.ACCOUNT_LOCKED, 'Too many failed attempts. Your account is temporarily locked.');
    }
    throw unauthorized('Email or password is incorrect', ErrorCodes.INVALID_CREDENTIALS);
  }

  return withTransaction(async (tx) => {
    await tx
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const tokens = await issueTokens(tx, user.id, device);
    const wallet = await createWalletForUser(tx, user.id);

    await recordAudit(tx, {
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ipAddress: device.ipAddress ?? null,
      userAgent: device.userAgent ?? null,
    });

    const [pin] = await tx
      .select({ id: transactionPins.id })
      .from(transactionPins)
      .where(eq(transactionPins.userId, user.id))
      .limit(1);

    return {
      user: serializeUser({ ...user, lastLoginAt: new Date() }),
      tokens: publicTokens(tokens),
      wallet: { id: wallet.id, walletTag: wallet.walletTag, currency: wallet.currency },
      pinConfigured: Boolean(pin),
    } as AuthResult & { pinConfigured: boolean };
  });
}

export async function refresh(refreshToken: string, device: DeviceContext) {
  const result = await withTransaction(async (tx) => {
    const rotated = await rotateRefreshToken(tx, refreshToken, device);
    if ('reused' in rotated) return rotated;
    const [user] = await tx.select().from(users).where(eq(users.id, rotated.userId)).limit(1);
    if (!user) throw unauthorized('Account not found', ErrorCodes.INVALID_TOKEN);
    return { user: serializeUser(user), tokens: publicTokens(rotated) };
  });

  if ('reused' in result) {
    throw new AppError(
      401,
      ErrorCodes.TOKEN_REUSE_DETECTED,
      'This session was ended for security reasons. Please sign in again.',
    );
  }

  return result;
}

export async function logout(
  userId: string,
  refreshToken: string | undefined,
  allDevices: boolean,
  req?: Request,
  sessionId?: string | null,
) {
  await withTransaction(async (tx) => {
    if (allDevices) {
      await revokeAllRefreshTokens(tx, userId, 'logout_all');
      await revokeAllDeviceSessions(tx, userId);
    } else {
      if (refreshToken) await revokeRefreshToken(tx, refreshToken, 'logout');
      // Revoking the device session invalidates the still-live access token too.
      if (sessionId) await revokeDeviceSessionInTx(tx, userId, sessionId);
    }
    await recordAudit(tx, {
      actorUserId: userId,
      action: allDevices ? 'auth.logout_all' : 'auth.logout',
      ipAddress: req?.ip ?? null,
      userAgent: req?.headers['user-agent']?.slice(0, 300) ?? null,
    });
  });
}

export async function forgotPassword(email: string): Promise<{ emailSent: boolean; demoCode?: string; expiresAt?: Date }> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // Always answer identically so that the endpoint cannot be used to enumerate accounts.
  if (!user || user.deletedAt) {
    logger.info({ email }, 'Password reset requested for unknown email');
    return { emailSent: true };
  }

  const otp = await withTransaction(async (tx) => {
    const issued = await issueOtp(tx, user.id, 'PASSWORD_RESET', 15);
    await recordAudit(tx, {
      actorUserId: user.id,
      action: 'auth.password_reset_requested',
      entityType: 'user',
      entityId: user.id,
    });
    return issued;
  });

  return { emailSent: true, demoCode: demoCode(otp.code), expiresAt: otp.expiresAt };
}

export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.deletedAt) {
    throw badRequest(ErrorCodes.INVALID_OTP, 'That reset code is not valid');
  }

  const passwordHash = await hashPassword(newPassword);

  await withTransaction(async (tx) => {
    await consumeOtp(tx, user.id, 'PASSWORD_RESET', code);
    await tx
      .update(users)
      .set({
        passwordHash,
        passwordUpdatedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await revokeAllRefreshTokens(tx, user.id, 'password_reset');
    await revokeAllDeviceSessions(tx, user.id);

    await recordAudit(tx, {
      actorUserId: user.id,
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: user.id,
    });

    await createNotification(tx, {
      userId: user.id,
      type: 'SECURITY_ALERT',
      title: 'Password changed',
      body: 'Your PayFlow password was reset. All other sessions were signed out.',
    });
  });
}

export async function verifyEmail(userId: string, code: string) {
  return withTransaction(async (tx) => {
    await consumeOtp(tx, userId, 'EMAIL_VERIFICATION', code);
    const [user] = await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), kycStatus: 'PENDING', updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)))
      .returning();

    if (!user) {
      const [already] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!already) throw unauthorized('Account not found');
      return { user: serializeUser(already), alreadyVerified: true };
    }

    await recordAudit(tx, {
      actorUserId: userId,
      action: 'auth.email_verified',
      entityType: 'user',
      entityId: userId,
    });

    await createNotification(tx, {
      userId,
      type: 'SYSTEM',
      title: 'Email verified',
      body: 'You can now add money, transfer funds and withdraw from your wallet.',
    });

    return { user: serializeUser(user), alreadyVerified: false };
  });
}

export async function resendVerification(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw unauthorized('Account not found');
  if (user.emailVerifiedAt) {
    return { alreadyVerified: true as const };
  }
  const otp = await withTransaction((tx) => issueOtp(tx, userId, 'EMAIL_VERIFICATION', 30));
  return {
    alreadyVerified: false as const,
    demoCode: demoCode(otp.code),
    expiresAt: otp.expiresAt,
    email: user.email,
  };
}
