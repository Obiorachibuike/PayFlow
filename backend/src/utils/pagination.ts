import { z } from 'zod';
import { badRequest } from './errors';

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export interface PageMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export function buildPageMeta<T extends { id: string }>(rows: T[], limit: number): { rows: T[]; meta: PageMeta } {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
  return { rows: page, meta: { limit, nextCursor, hasMore } };
}

/** Decodes an opaque cursor into a UUID, rejecting malformed input. */
export function parseCursor(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(cursor)) {
    throw badRequest('VALIDATION_ERROR', 'Invalid pagination cursor');
  }
  return cursor;
}

/**
 * Keyset cursor: base64url("<createdAt ISO>|<uuid>"). Stable under inserts in a
 * way that offsets are not, which matters for a ledger-backed feed.
 */
export interface KeysetCursor {
  createdAt: Date;
  id: string;
}

export function encodeKeysetCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, 'utf8').toString('base64url');
}

export function decodeKeysetCursor(cursor: string): KeysetCursor {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [iso, id] = decoded.split('|');
    const createdAt = new Date(iso ?? '');
    if (!id || Number.isNaN(createdAt.getTime())) throw new Error('bad cursor');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('bad id');
    return { createdAt, id };
  } catch {
    throw badRequest('VALIDATION_ERROR', 'Invalid pagination cursor');
  }
}
