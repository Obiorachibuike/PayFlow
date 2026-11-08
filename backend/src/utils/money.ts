/**
 * Money helpers. Every amount in PayFlow is an integer number of minor units
 * (kobo for NGN). Floating point arithmetic is banned for monetary values.
 */

export const CURRENCY = 'NGN' as const;
export const MINOR_UNITS_PER_UNIT = 100n;

/** Hard ceiling so that BigInt values always survive a JSON round-trip. */
export const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Converts a human amount ("1,250.50" | "1250.5" | 1250.5) into kobo. */
export function toMinorUnits(value: string | number): bigint {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new MoneyError('Amount is not a finite number');
    if (!Number.isInteger(value * 100)) {
      // Avoid float drift such as 0.1 + 0.2 by round-tripping through a string.
      return toMinorUnits(value.toFixed(2));
    }
  }
  const raw = typeof value === 'number' ? value.toFixed(2) : value.trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(raw)) {
    throw new MoneyError(`Invalid amount: ${value}`);
  }
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const padded = `${fraction}00`.slice(0, 2);
  const minor = BigInt(whole) * MINOR_UNITS_PER_UNIT + BigInt(padded);
  return negative ? -minor : minor;
}

/** Formats kobo as a plain decimal string, e.g. 125050n -> "1250.50". */
export function fromMinorUnits(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / MINOR_UNITS_PER_UNIT;
  const fraction = (abs % MINOR_UNITS_PER_UNIT).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Formats kobo for display, e.g. 125050n -> "₦1,250.50". */
export function formatNaira(
  minor: bigint,
  { withSymbol = true, currency = CURRENCY as string }: { withSymbol?: boolean; currency?: string } = {},
): string {
  const plain = fromMinorUnits(minor);
  const [whole = '0', fraction = '00'] = plain.split('.');
  const negative = whole.startsWith('-');
  const digits = negative ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = currency === 'NGN' ? '₦' : `${currency} `;
  return `${negative ? '-' : ''}${withSymbol ? symbol : ''}${grouped}.${fraction}`;
}

/**
 * The public API serialises money as JSON numbers. That is exact for every
 * realistic amount because JS integers are safe up to 2^53-1 kobo (~₦90trn).
 */
export function toApiAmount(minor: bigint): number {
  if (minor > MAX_SAFE_MINOR || minor < -MAX_SAFE_MINOR) {
    throw new MoneyError('Amount exceeds the safe JSON integer range');
  }
  return Number(minor);
}

export function assertPositive(minor: bigint, field = 'amount'): void {
  if (minor <= 0n) throw new MoneyError(`${field} must be greater than zero`);
}

export function withinRange(minor: bigint, min: bigint, max: bigint): boolean {
  return minor >= min && minor <= max;
}

export function sumMinor(values: Array<bigint | number | null | undefined>): bigint {
  return values.reduce<bigint>((acc, value) => {
    if (value === null || value === undefined) return acc;
    return acc + (typeof value === 'bigint' ? value : BigInt(Math.trunc(value)));
  }, 0n);
}
