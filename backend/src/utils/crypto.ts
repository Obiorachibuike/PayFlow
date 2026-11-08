import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/** Cryptographically strong hex string. */
export function randomHex(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hmacSha512Hex(secret: string, payload: Buffer | string): string {
  return crypto.createHmac('sha512', secret).update(payload).digest('hex');
}

export function hmacSha256Hex(secret: string, payload: Buffer | string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** Transaction PINs are short, so they are hashed with the same careful cost. */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, env.BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(pin, hash);
  } catch {
    return false;
  }
}

/** 6-digit numeric OTP. */
export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  const value = crypto.randomInt(0, max);
  return value.toString().padStart(digits, '0');
}

export function generateWalletTag(): string {
  const digits = () => crypto.randomInt(1000, 9999).toString();
  return `PF-${digits()}-${digits()}`;
}

export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '');
  return `******${digits.slice(-4)}`;
}

export function accountNumberLast4(accountNumber: string): string {
  return accountNumber.replace(/\D/g, '').slice(-4);
}

export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

export function hashDeviceFingerprint(value: string): string {
  return sha256(value).slice(0, 32);
}
