import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

/** Accepts 0803…, 803…, +234803… and normalises to E.164 (+234…). */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .transform((value) => {
    if (value.startsWith('+234')) return value;
    if (value.startsWith('234')) return `+${value}`;
    if (value.startsWith('0')) return `+234${value.slice(1)}`;
    return `+234${value}`;
  })
  .refine((value) => /^\+234[789]\d{9}$/.test(value), 'Enter a valid Nigerian phone number');

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your full name')
  .max(80)
  .regex(/^[A-Za-z][A-Za-z'\-\s.]+$/, 'Name may only contain letters, spaces, hyphens and apostrophes');

export const deviceSchema = z
  .object({
    deviceId: z.string().min(4).max(128).optional(),
    deviceName: z.string().max(120).optional(),
    platform: z.enum(['ios', 'android', 'web', 'unknown']).optional(),
    appVersion: z.string().max(32).optional(),
  })
  .optional();

export const registerSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    device: deviceSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(72),
  device: deviceSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
  device: deviceSchema,
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20).max(200).optional(),
  allDevices: z.boolean().optional().default(false),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const verifyEmailSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
