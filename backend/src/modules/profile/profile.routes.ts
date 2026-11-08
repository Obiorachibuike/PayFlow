import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { ok, paginated } from '../../utils/respond';
import { passwordSchema } from '../auth/auth.schemas';
import * as profileService from './profile.service';

export const profileRouter = Router();

const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[A-Za-z][A-Za-z'\-\s.]+$/)
    .optional(),
  avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  themePreference: z.enum(['SYSTEM', 'LIGHT', 'DARK']).optional(),
  biometricEnabled: z.boolean().optional(),
  notifyPush: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  notifySecurity: z.boolean().optional(),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: passwordSchema,
});

const pinSchema = z.object({
  newPin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  currentPin: z.string().regex(/^\d{4}$/).optional(),
  password: z.string().min(1).max(72).optional(),
});

profileRouter.get('/', requireAuth, async (req, res) => {
  const profile = await profileService.getProfile(req.auth!.userId);
  ok(res, profile);
});

profileRouter.patch('/', requireAuth, async (req, res) => {
  const input = updateProfileSchema.parse(req.body);
  const user = await profileService.updateProfile(req.auth!.userId, input);
  ok(res, { user });
});

profileRouter.patch('/password', requireAuth, authLimiter, async (req, res) => {
  const input = passwordChangeSchema.parse(req.body);
  const result = await profileService.updatePassword(req.auth!.userId, input.currentPassword, input.newPassword);
  ok(res, result);
});

profileRouter.patch('/pin', requireAuth, authLimiter, async (req, res) => {
  const input = pinSchema.parse(req.body);
  const result = await profileService.updatePin(req.auth!.userId, input);
  ok(res, result);
});

profileRouter.post('/biometrics', requireAuth, async (req, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  const result = await profileService.setBiometrics(req.auth!.userId, enabled, req.auth!.sessionId);
  ok(res, result);
});

profileRouter.get('/sessions', requireAuth, async (req, res) => {
  const sessions = await profileService.listSessions(req.auth!.userId, req.auth!.sessionId);
  paginated(res, sessions, { count: sessions.length });
});

profileRouter.delete('/sessions/:id', requireAuth, async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const result = await profileService.revokeSession(req.auth!.userId, id);
  ok(res, result);
});
