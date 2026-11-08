import type { DbClient } from '../../db';
import { auditLogs } from '../../db/schema';

export interface AuditInput {
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only security/audit trail. Never include passwords, PINs, tokens or
 * provider secrets in `metadata`.
 */
export async function recordAudit(client: DbClient, input: AuditInput): Promise<void> {
  await client.insert(auditLogs).values({
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: input.metadata,
  });
}
