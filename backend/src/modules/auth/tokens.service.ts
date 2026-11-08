import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../../db';
import { db } from '../../db';
import { deviceSessions, refreshTokens, users } from '../../db/schema';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError, ErrorCodes, unauthorized } from '../../utils/errors';
import { randomHex, sha256, timingSafeEqualHex } from '../../utils/crypto';
import { recordAudit } from '../audit/audit.service';

const ACCESS_ISSUER = 'payflow';
const ACCESS_AUDIENCE = 'payflow-mobile';

export interface AccessTokenPayload {
  sub: string;
  sid: string | null;
  typ: 'access';
  jti: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(userId: string, sessionId: string | null): string {
  const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    sub: userId,
    sid: sessionId,
    typ: 'access',
    jti: crypto.randomUUID(),
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: ACCESS_ISSUER,
    audience: ACCESS_AUDIENCE,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: ACCESS_ISSUER,
      audience: ACCESS_AUDIENCE,
      algorithms: ['HS256'],
    }) as AccessTokenPayload;
    if (payload.typ !== 'access') throw new Error('wrong token type');
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, ErrorCodes.TOKEN_EXPIRED, 'Access token expired');
    }
    throw unauthorized('Invalid access token', ErrorCodes.INVALID_TOKEN);
  }
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: Date;
  sessionId: string | null;
}

export interface DeviceContext {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
  ipAddress?: string;
  userAgent?: string;
}

function accessTokenTtlSeconds(): number {
  const match = /^(\d+)([smhd])$/.exec(env.ACCESS_TOKEN_TTL);
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit ?? 'm'] ?? 60);
}

/** Creates or refreshes the device session used to bind refresh token families. */
async function upsertDeviceSession(tx: Tx, userId: string, device: DeviceContext): Promise<string | null> {
  if (!device.deviceId) return null;
  const [session] = await tx
    .insert(deviceSessions)
    .values({
      userId,
      deviceId: device.deviceId,
      deviceName: device.deviceName ?? null,
      platform: device.platform ?? null,
      appVersion: device.appVersion ?? null,
      ipAddress: device.ipAddress ?? null,
      userAgent: device.userAgent ?? null,
      lastActiveAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [deviceSessions.userId, deviceSessions.deviceId],
      set: {
        deviceName: device.deviceName ?? null,
        platform: device.platform ?? null,
        appVersion: device.appVersion ?? null,
        ipAddress: device.ipAddress ?? null,
        userAgent: device.userAgent ?? null,
        lastActiveAt: new Date(),
        revokedAt: null,
      },
    })
    .returning({ id: deviceSessions.id });
  return session?.id ?? null;
}

async function insertRefreshToken(
  tx: Tx,
  { userId, sessionId, familyId }: { userId: string; sessionId: string | null; familyId?: string },
): Promise<{ token: string; expiresAt: Date; familyId: string; tokenHash: string }> {
  const token = randomHex(48);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const family = familyId ?? crypto.randomUUID();

  await tx.insert(refreshTokens).values({
    tokenHash,
    familyId: family,
    userId,
    deviceSessionId: sessionId,
    expiresAt,
  });

  return { token, expiresAt, familyId: family, tokenHash };
}

/** Issues a fresh access/refresh pair (used by login and registration). */
export async function issueTokens(
  tx: Tx,
  userId: string,
  device: DeviceContext,
): Promise<IssuedTokens> {
  const sessionId = await upsertDeviceSession(tx, userId, device);
  const refresh = await insertRefreshToken(tx, { userId, sessionId });
  return {
    accessToken: signAccessToken(userId, sessionId),
    refreshToken: refresh.token,
    accessTokenExpiresIn: accessTokenTtlSeconds(),
    refreshTokenExpiresAt: refresh.expiresAt,
    sessionId,
  };
}

export interface RotatedTokens extends IssuedTokens {
  userId: string;
}

/** Returned instead of throwing so the revocation can commit (see below). */
export interface RefreshReuseDetected {
  reused: true;
  userId: string;
}

/**
 * Refresh token rotation with reuse detection.
 *
 * If a token that was already rotated is presented again, the entire family is
 * revoked (the device is treated as compromised) and a security alert is logged.
 */
export async function rotateRefreshToken(
  tx: Tx,
  presentedToken: string,
  device: DeviceContext,
): Promise<RotatedTokens | RefreshReuseDetected> {
  const tokenHash = sha256(presentedToken);
  const [existing] = await tx
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1)
    .for('update');

  if (!existing) {
    throw unauthorized('Invalid refresh token', ErrorCodes.INVALID_TOKEN);
  }

  if (existing.revokedAt) {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), revokedReason: 'reuse_detected' })
      .where(and(eq(refreshTokens.familyId, existing.familyId), isNull(refreshTokens.revokedAt)));

    await tx
      .update(deviceSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(deviceSessions.userId, existing.userId), isNull(deviceSessions.revokedAt)));

    await recordAudit(tx, {
      actorUserId: existing.userId,
      action: 'auth.refresh_reuse_detected',
      entityType: 'refresh_token_family',
      entityId: existing.familyId,
      ipAddress: device.ipAddress ?? null,
      userAgent: device.userAgent ?? null,
    });

    logger.warn({ userId: existing.userId, familyId: existing.familyId }, 'Refresh token reuse detected');

    // The revocation above must COMMIT, so the caller throws after the
    // transaction returns rather than rolling it back from inside.
    return { reused: true, userId: existing.userId };
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    throw new AppError(401, ErrorCodes.TOKEN_EXPIRED, 'Refresh token expired');
  }

  const [user] = await tx.select().from(users).where(eq(users.id, existing.userId)).limit(1);
  if (!user || user.deletedAt || user.status !== 'ACTIVE') {
    throw new AppError(403, ErrorCodes.ACCOUNT_SUSPENDED, 'This account is not active');
  }

  const rotated = await insertRefreshToken(tx, {
    userId: existing.userId,
    sessionId: existing.deviceSessionId,
    familyId: existing.familyId,
  });

  await tx
    .update(refreshTokens)
    .set({
      revokedAt: new Date(),
      usedAt: new Date(),
      replacedByHash: rotated.tokenHash,
      revokedReason: 'rotated',
    })
    .where(eq(refreshTokens.id, existing.id));

  if (existing.deviceSessionId) {
    await tx
      .update(deviceSessions)
      .set({ lastActiveAt: new Date(), revokedAt: null })
      .where(eq(deviceSessions.id, existing.deviceSessionId));
  }

  return {
    userId: existing.userId,
    accessToken: signAccessToken(existing.userId, existing.deviceSessionId),
    refreshToken: rotated.token,
    accessTokenExpiresIn: accessTokenTtlSeconds(),
    refreshTokenExpiresAt: rotated.expiresAt,
    sessionId: existing.deviceSessionId,
  };
}

export async function revokeRefreshToken(tx: Tx, presentedToken: string, reason = 'logout'): Promise<void> {
  const tokenHash = sha256(presentedToken);
  await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
}

export async function revokeAllRefreshTokens(
  tx: Tx,
  userId: string,
  reason = 'logout_all',
  exceptTokenHash?: string,
): Promise<number> {
  const conditions = [eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)];
  if (exceptTokenHash) {
    conditions.push(sql`${refreshTokens.tokenHash} <> ${exceptTokenHash}`);
  }
  const rows = await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(...conditions))
    .returning({ id: refreshTokens.id });
  return rows.length;
}

/** Revokes every device session for a user (password reset, forced sign-out). */
export async function revokeAllDeviceSessions(tx: Tx, userId: string): Promise<number> {
  const rows = await tx
    .update(deviceSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(deviceSessions.userId, userId), isNull(deviceSessions.revokedAt)))
    .returning({ id: deviceSessions.id });
  return rows.length;
}

export async function revokeDeviceSessionInTx(tx: Tx, userId: string, sessionId: string): Promise<boolean> {
  const rows = await tx
    .update(deviceSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(deviceSessions.id, sessionId),
        eq(deviceSessions.userId, userId),
        isNull(deviceSessions.revokedAt),
      ),
    )
    .returning({ id: deviceSessions.id });

  // Revoking an already-revoked session is a no-op so callers can 404 instead
  // of reporting a success that changed nothing.
  if (rows.length === 0) return false;

  await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date(), revokedReason: 'session_revoked' })
    .where(and(eq(refreshTokens.deviceSessionId, sessionId), isNull(refreshTokens.revokedAt)));

  return true;
}

export async function revokeDeviceSession(userId: string, sessionId: string): Promise<boolean> {
  return db.transaction((tx) => revokeDeviceSessionInTx(tx, userId, sessionId));
}

export function safeTokenEquals(a: string, b: string): boolean {
  return timingSafeEqualHex(a, b);
}
