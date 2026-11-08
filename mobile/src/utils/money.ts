/**
 * Money utilities.
 *
 * Every amount in PayFlow is an integer number of minor units (kobo). Floats are
 * never used to hold money; this module is the only place that converts to and
 * from human-readable strings.
 */

export const CURRENCY_SYMBOL = '₦';

/** Formats minor units as Naira, e.g. 123456 -> "₦1,234.56". */
export function formatNaira(minor: number | bigint, options: { withSymbol?: boolean } = {}): string {
  const { withSymbol = true } = options;
  const value = typeof minor === 'bigint' ? minor : BigInt(Math.trunc(minor));
  const negative = value < 0n;
  const absolute = negative ? -value : value;

  const whole = absolute / 100n;
  const fraction = absolute % 100n;

  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = `${grouped}.${fraction.toString().padStart(2, '0')}`;
  return `${negative ? '-' : ''}${withSymbol ? CURRENCY_SYMBOL : ''}${text}`;
}

/** Formats a signed amount, e.g. 5000 -> "+₦50.00", -5000 -> "-₦50.00". */
export function formatSignedNaira(minor: number, options: { withSymbol?: boolean } = {}): string {
  const sign = minor > 0 ? '+' : minor < 0 ? '-' : '';
  return `${sign}${formatNaira(Math.abs(minor), options)}`;
}

/** Compact naira label for charts and tiles, e.g. 1250000 -> "₦12.5k". */
export function formatCompactNaira(minor: number): string {
  const naira = Math.abs(minor) / 100;
  const sign = minor < 0 ? '-' : '';
  if (naira >= 1_000_000) return `${sign}${CURRENCY_SYMBOL}${(naira / 1_000_000).toFixed(1)}m`;
  if (naira >= 1_000) return `${sign}${CURRENCY_SYMBOL}${(naira / 1_000).toFixed(1)}k`;
  return `${sign}${CURRENCY_SYMBOL}${naira.toFixed(0)}`;
}

/**
 * Parses user input typed in naira into integer minor units.
 * Accepts "1,250", "1250.5", "₦1,250.00" and returns 125000 (or 125050).
 * Returns null when the text is not a usable amount.
 */
export function parseNairaToMinor(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, '');
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return null;

  const [wholePart = '0', fractionPart = ''] = cleaned.split('.');
  if (fractionPart.length > 2) return null;

  const whole = wholePart === '' ? 0 : Number(wholePart);
  const fraction = Number(fractionPart.padEnd(2, '0') || '0');
  if (!Number.isFinite(whole) || !Number.isFinite(fraction)) return null;

  const minor = whole * 100 + fraction;
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Renders minor units as the value of an amount text field, e.g. 125000 -> "1,250.00". */
export function minorToInputValue(minor: number): string {
  const negative = minor < 0;
  const absolute = Math.abs(Math.trunc(minor));
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction.toString().padStart(2, '0')}` : ''}`;
}

/** True when the amount is a positive integer number of kobo. */
export function isValidMinorAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Applies a percentage fee and rounds to the nearest kobo (half up). */
export function applyPercentageFee(minor: number, percent: number): { feeMinor: number; totalMinor: number } {
  const feeMinor = Math.round((minor * percent) / 100);
  return { feeMinor, totalMinor: minor + feeMinor };
}
