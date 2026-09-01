import { auditLogs } from "@/lib/db/schema";
import type { Database } from "@/lib/db";

/**
 * Audit log — the "who / what / when / why" record of sensitive actions.
 *
 * Every trust and administration mutation writes an audit row. The vocabulary
 * below is the canonical set of actions; new actions should be added here so
 * the log stays predictable for reporting.
 *
 * SECURITY RULES:
 * - Never write passwords, session tokens, CSRF tokens or hashes to the log.
 * - `metadata` holds small JSON facts (e.g. role before/after); never secrets.
 */

export const auditActions = {
  USER_SIGNUP: "USER_SIGNUP",
  USER_SIGNIN_SUCCESS: "USER_SIGNIN_SUCCESS",
  USER_SIGNIN_FAILED: "USER_SIGNIN_FAILED",
  USER_SIGNOUT: "USER_SIGNOUT",
  USER_PASSWORD_CHANGED: "USER_PASSWORD_CHANGED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  USER_ACTIVITY_CHANGED: "USER_ACTIVITY_CHANGED",
  USER_SESSIONS_REVOKED: "USER_SESSIONS_REVOKED",
  SOURCE_CREATED: "SOURCE_CREATED",
  SOURCE_UPDATED: "SOURCE_UPDATED",
  SOURCE_CLASSIFICATION_VERIFIED: "SOURCE_CLASSIFICATION_VERIFIED",
  SOURCE_INGESTION_ADVANCED: "SOURCE_INGESTION_ADVANCED",
  SOURCE_CHECKED: "SOURCE_CHECKED",
  SOURCE_CONFLICT_FLAGGED: "SOURCE_CONFLICT_FLAGGED",
  SOURCE_CONFLICT_RESOLVED: "SOURCE_CONFLICT_RESOLVED",
  SUBMISSION_CREATED: "SUBMISSION_CREATED",
  SUBMISSION_DECISION: "SUBMISSION_DECISION",
  SUBMISSION_PUBLISHED: "SUBMISSION_PUBLISHED",
  DATA_EXPIRED: "DATA_EXPIRED",
  INGESTION_RUN_STARTED: "INGESTION_RUN_STARTED",
  INGESTION_RUN_FINISHED: "INGESTION_RUN_FINISHED",
  INGESTION_ITEM_CREATED: "INGESTION_ITEM_CREATED",
  INGESTION_ITEM_AUTO_REJECTED: "INGESTION_ITEM_AUTO_REJECTED",
  INGESTION_ITEM_DECIDED: "INGESTION_ITEM_DECIDED",
  COORDINATE_CANDIDATE_SUBMITTED: "COORDINATE_CANDIDATE_SUBMITTED",
  COORDINATE_CANDIDATE_DECIDED: "COORDINATE_CANDIDATE_DECIDED",
  SECURITY_EVENT: "SECURITY_EVENT",
} as const;

export type AuditAction = (typeof auditActions)[keyof typeof auditActions];

export interface AuditEntryInput {
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function writeAudit(db: Database, input: AuditEntryInput): Promise<void> {
  await db.insert(auditLogs).values({
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    ipAddress: input.ipAddress ?? null,
  });
}
