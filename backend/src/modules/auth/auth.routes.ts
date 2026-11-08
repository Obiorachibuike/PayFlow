import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { authLimiter, otpLimiter } from '../../middleware/rateLimit';
import { created, ok } from '../../utils/respond';
import * as authService from './auth.service';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schemas';

export const authRouter = Router();

authRouter.post('/register', authLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  const device = authService.deviceContextFromRequest(req);
  const result = await authService.register(input, device);
  created(res, result);
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const device = authService.deviceContextFromRequest(req);
  const result = await authService.login(input, device);
  ok(res, result);
});

authRouter.post('/refresh', authLimiter, async (req, res) => {
  const input = refreshSchema.parse(req.body);
  const device = authService.deviceContextFromRequest(req);
  const result = await authService.refresh(input.refreshToken, device);
  ok(res, result);
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  const input = logoutSchema.parse(req.body ?? {});
  await authService.logout(req.auth!.userId, input.refreshToken, input.allDevices, req, req.auth!.sessionId);
  ok(res, { success: true });
});

authRouter.post('/forgot-password', authLimiter, async (req, res) => {
  const input = forgotPasswordSchema.parse(req.body);
  const result = await authService.forgotPassword(input.email);
  ok(res, {
    ...result,
    message: 'If an account exists for that email, a reset code has been sent.',
  });
});

authRouter.post('/reset-password', authLimiter, async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(input.email, input.code, input.newPassword);
  ok(res, { success: true, message: 'Password updated. Please sign in with your new password.' });
});

authRouter.post('/verify-email', otpLimiter, requireAuth, async (req, res) => {
  const input = verifyEmailSchema.parse(req.body);
  const result = await authService.verifyEmail(req.auth!.userId, input.code);
  ok(res, result);
});

authRouter.post('/resend-verification', otpLimiter, requireAuth, async (req, res) => {
  const result = await authService.resendVerification(req.auth!.userId);
  ok(res, result);
});
