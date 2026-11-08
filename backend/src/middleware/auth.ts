import type { NextFunction, Request, Response } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { deviceSessions, users } from '../db/schema';
import { verifyAccessToken } from '../modules/auth/tokens.service';
import { AppError, ErrorCodes, forbidden, unauthorized } from '../utils/errors';

export interface AuthContext {
  userId: string;
  sessionId: string | null;
  tokenId: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

/**
 * Verifies the access token, then re-checks the account + device session in the
 * database. Access tokens are short lived, but revocation must still take effect
 * immediately for security-sensitive actions.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req);
    if (!token) throw unauthorized('Missing bearer token');

    const payload = verifyAccessToken(token);

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        status: users.status,
        deletedAt: users.deletedAt,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user || user.deletedAt) {
      throw unauthorized('Account not found', ErrorCodes.INVALID_TOKEN);
    }
    if (user.status !== 'ACTIVE') {
      throw forbidden(ErrorCodes.ACCOUNT_SUSPENDED, 'This account is not active');
    }

    if (payload.sid) {
      const [session] = await db
        .select({ id: deviceSessions.id })
        .from(deviceSessions)
        .where(and(eq(deviceSessions.id, payload.sid), isNull(deviceSessions.revokedAt)))
        .limit(1);
      if (!session) {
        throw unauthorized('Session has been revoked. Please sign in again.', ErrorCodes.INVALID_TOKEN);
      }
    }

    req.auth = {
      userId: user.id,
      sessionId: payload.sid,
      tokenId: payload.jti,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      fullName: user.fullName,
    };
    next();
  } catch (error) {
    next(error);
  }
}

/** Server-side gate for every endpoint that can move money. */
export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(unauthorized());
    return;
  }
  if (!req.auth.emailVerified) {
    next(
      new AppError(
        403,
        ErrorCodes.EMAIL_NOT_VERIFIED,
        'Verify your email address before moving money.',
      ),
    );
    return;
  }
  next();
}

export function requireAuthContext(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
