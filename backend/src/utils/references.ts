import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomBlock(length: number): string {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/**
 * Human-readable, collision-resistant references:
 *   PF-FND-20261108-7K3M9Q2B
 * References are unique per table (database unique constraint) and are also used
 * as provider references and webhook correlation keys.
 */
export function generateReference(prefix: 'FND' | 'TRF' | 'WDR' | 'PAY' | 'LTX' | 'RCP'): string {
  const now = new Date();
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
    now.getUTCDate(),
  ).padStart(2, '0')}`;
  return `PF-${prefix}-${date}-${randomBlock(8)}`;
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}
