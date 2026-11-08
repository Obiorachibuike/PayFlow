import { and, count, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db';
import type { DbClient } from '../../db';
import { notifications } from '../../db/schema';
import type { Notification } from '../../db/schema';
import { notFound } from '../../utils/errors';
import { parseCursor } from '../../utils/pagination';
import { serializeNotification } from '../../utils/serializers';

export type NotificationType = Notification['type'];

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Persists an in-app notification. Delivery to the device is handled by the
 * mobile app (local notifications) and, when push credentials are configured, by
 * Expo push notifications — this row is the source of truth.
 */
export async function createNotification(client: DbClient, input: CreateNotificationInput): Promise<void> {
  await client.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    data: input.data,
  });
}

export interface ListNotificationsOptions {
  userId: string;
  limit: number;
  cursor?: string;
  unreadOnly?: boolean;
}

export async function listNotifications({ userId, limit, cursor, unreadOnly }: ListNotificationsOptions) {
  const cursorId = parseCursor(cursor);
  const conditions = [eq(notifications.userId, userId)];
  if (unreadOnly) conditions.push(isNull(notifications.readAt));
  if (cursorId) conditions.push(lt(notifications.id, cursorId));

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const unreadRows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  const unread = Number(unreadRows[0]?.value ?? 0);

  return {
    items: page.map(serializeNotification),
    meta: {
      limit,
      hasMore,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
      unreadCount: unread,
    },
  };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const [row] = await db
    .update(notifications)
    .set({ readAt: sql`COALESCE(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning();

  if (!row) throw notFound('NOT_FOUND', 'Notification not found');
  return serializeNotification(row);
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(rows[0]?.value ?? 0);
}

export async function registerPushToken(userId: string, deviceSessionId: string | null, pushToken: string) {
  if (!deviceSessionId) return;
  await db.execute(sql`
    UPDATE device_sessions
       SET push_token = ${pushToken}
     WHERE id = ${deviceSessionId}::uuid AND user_id = ${userId}::uuid
  `);
}
