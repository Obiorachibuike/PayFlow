import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Request } from 'express';
import { db } from '../db';
import { idempotencyRecords } from '../db/schema';
import { AppError, ErrorCodes, badRequest, pgErrorCode } from '../utils/errors';

const TTL_HOURS = 24;
const WAIT_STEP_MS = 150;
const WAIT_ATTEMPTS = 12;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === '23505';
}

export function requireIdempotencyKey(req: Request): string {
  const header = req.headers['idempotency-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (!key || key.trim().length < 8 || key.length > 200) {
    throw badRequest(
      ErrorCodes.IDEMPOTENCY_KEY_REQUIRED,
      'A valid Idempotency-Key header (8-200 characters) is required for this operation',
    );
  }
  return key.trim();
}

export interface IdempotentResult<T> {
  status: number;
  body: T;
  replayed: boolean;
}

/**
 * Executes a state-changing financial operation at most once per idempotency key.
 *
 * A reservation row is inserted before the handler runs, so two concurrent
 * requests with the same key can never both execute: the second waits for the
 * first to finish and then replays its stored response.
 */
export async function withIdempotency<T>(
  { userId, scope, key, requestBody }: { userId: string; scope: string; key: string; requestBody: unknown },
  handler: () => Promise<{ status: number; body: T; resourceId?: string }>,
): Promise<IdempotentResult<T>> {
  const requestHash = crypto.createHash('sha256').update(stableStringify(requestBody)).digest('hex');
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);

  try {
    await db.insert(idempotencyRecords).values({
      userId,
      scope,
      key,
      requestHash,
      statusCode: 0,
      expiresAt,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
      const [record] = await db
        .select()
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.userId, userId),
            eq(idempotencyRecords.scope, scope),
            eq(idempotencyRecords.key, key),
          ),
        )
        .limit(1);

      if (!record) break;

      if (record.requestHash !== requestHash) {
        throw new AppError(
          422,
          ErrorCodes.IDEMPOTENCY_KEY_REUSED,
          'This idempotency key was already used with a different request body',
        );
      }

      if (record.statusCode !== 0 && record.responseBody) {
        return { status: record.statusCode, body: record.responseBody as T, replayed: true };
      }

      await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
    }

    throw new AppError(
      409,
      ErrorCodes.IDEMPOTENCY_IN_PROGRESS,
      'An identical request is still being processed. Please retry in a moment.',
    );
  }

  try {
    const result = await handler();
    await db
      .update(idempotencyRecords)
      .set({
        statusCode: result.status,
        responseBody: result.body as Record<string, unknown>,
        resourceId: result.resourceId ?? null,
      })
      .where(
        and(
          eq(idempotencyRecords.userId, userId),
          eq(idempotencyRecords.scope, scope),
          eq(idempotencyRecords.key, key),
        ),
      );
    return { status: result.status, body: result.body, replayed: false };
  } catch (error) {
    // Nothing was committed by the handler, so the key is released for retries.
    await db
      .delete(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.userId, userId),
          eq(idempotencyRecords.scope, scope),
          eq(idempotencyRecords.key, key),
          eq(idempotencyRecords.statusCode, 0),
        ),
      )
      .catch(() => undefined);
    throw error;
  }
}
