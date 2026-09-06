import { desc, eq } from "drizzle-orm";
import { auditLogs, users } from "@/lib/db/schema";
import type { Database } from "@/lib/db";

/**
 * ADMIN AUDIT SERVICE
 * -------------------
 * Read-only access to recent audit log entries.
 * Never exposes: passwords, session tokens, AUTH_SECRET, DATABASE_URL.
 */

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

export async function listRecentAuditLogs(
  db: Database,
  opts: { limit?: number; action?: string } = {},
): Promise<AuditEntry[]> {
  const limit = Math.min(opts.limit ?? 50, 200);

  const baseQuery = db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      actorEmail: users.email,
      actorName: users.name,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  if (opts.action) {
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        actorEmail: users.email,
        actorName: users.name,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(eq(auditLogs.action, opts.action))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
    return rows.map(toAuditEntry);
  }

  const rows = await baseQuery;
  return rows.map(toAuditEntry);
}

function toAuditEntry(row: {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  ipAddress: string | null;
  createdAt: Date;
}): AuditEntry {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actorEmail: row.actorEmail,
    actorName: row.actorName,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
  };
}
