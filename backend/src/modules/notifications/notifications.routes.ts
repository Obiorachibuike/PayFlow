import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { ok, paginated } from '../../utils/respond';
import * as notificationsService from './notifications.service';

export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, async (req, res) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      cursor: z.string().max(200).optional(),
      unreadOnly: z.coerce.boolean().optional(),
    })
    .parse(req.query);

  const result = await notificationsService.listNotifications({
    userId: req.auth!.userId,
    limit: query.limit,
    cursor: query.cursor,
    unreadOnly: query.unreadOnly,
  });
  paginated(res, result.items, result.meta);
});

notificationsRouter.patch('/:id/read', requireAuth, async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const notification = await notificationsService.markNotificationRead(req.auth!.userId, id);
  ok(res, notification);
});

notificationsRouter.post('/read-all', requireAuth, async (req, res) => {
  const updated = await notificationsService.markAllNotificationsRead(req.auth!.userId);
  ok(res, { updated });
});

notificationsRouter.post('/push-token', requireAuth, async (req, res) => {
  const { pushToken } = z.object({ pushToken: z.string().min(8).max(300) }).parse(req.body);
  await notificationsService.registerPushToken(req.auth!.userId, req.auth!.sessionId, pushToken);
  ok(res, { registered: true });
});
