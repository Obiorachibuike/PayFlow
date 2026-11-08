/**
 * Form validation.
 *
 * The server re-validates everything it receives; these checks exist to give the
 * user fast feedback and to stop obviously invalid requests leaving the device.
 */

export const NIGERIAN_PHONE_REGEX = /^0[789][01]\d{8}$/;
export const E164_NG_PHONE_REGEX = /^\+234[789][01]\d{8}$/;

export function isValidEmail(email: string): boolean {
  const value = email.trim();
  if (value.length < 6 || value.length > 254) return false;
  if (/\s/.test(value)) return false;
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(value);
}

/** Accepts 0803…, +234803… and normalises to +234803…. */
export function normaliseNigerianPhone(input: string): string | null {
  const value = input.replace(/[\s()-]/g, '');
  if (NIGERIAN_PHONE_REGEX.test(value)) return `+234${value.slice(1)}`;
  if (E164_NG_PHONE_REGEX.test(value)) return value;
  return null;
}

export function isValidNigerianPhone(input: string): boolean {
  return normaliseNigerianPhone(input) !== null;
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  hints: string[];
}

export function passwordStrength(password: string): PasswordStrength {
  const hints: string[] = [];
  if (password.length < 8) hints.push('At least 8 characters');
  if (!/[a-z]/.test(password)) hints.push('A lowercase letter');
  if (!/[A-Z]/.test(password)) hints.push('An uppercase letter');
  if (!/\d/.test(password)) hints.push('A number');

  if (password.length < 8 || hints.length > 2) {
    return { score: 0, label: password.length < 8 ? 'Too short' : 'Weak', hints };
  }
  if (hints.length === 2) return { score: 1, label: 'Weak', hints };
  if (hints.length === 1) return { score: 2, label: 'Fair', hints };
  if (password.length >= 12 && /[^A-Za-z0-9]/.test(password)) {
    return { score: 4, label: 'Strong', hints };
  }
  return { score: 3, label: 'Good', hints };
}

export function isStrongEnoughPassword(password: string): boolean {
  return passwordStrength(password).score >= 2;
}

export function isValidTransactionPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function isWeakPin(pin: string): boolean {
  if (!isValidTransactionPin(pin)) return true;
  // 0000, 1111 … 9999 and simple runs like 1234 / 4321 are rejected.
  if (/^(\d)\1{3}$/.test(pin)) return true;
  return ['1234', '4321', '0123', '3210', '2580', '0852'].includes(pin);
}

export function isValidNigerianAccountNumber(accountNumber: string): boolean {
  return /^\d{10}$/.test(accountNumber.trim());
}

export function isValidFullName(name: string): boolean {
  return /^[A-Za-z][A-Za-z'\-\s.]{1,79}$/.test(name.trim());
}

/** The backend returns this code when a wallet tag, email or phone is unknown. */
export function isValidWalletTag(tag: string): boolean {
  return /^PF-\d{4}-\d{4}$/i.test(tag.trim());
}
