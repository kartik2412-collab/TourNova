import { and, eq, inArray, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  dataSources,
  sourceRecords,
  sourceConflicts,
  dataSubmissions,
  verifications,
  confidenceEnum,
  sourceClassificationEnum,
  sourceAccessMethodEnum,
  geographicCoverageEnum,
  freshnessClassEnum,
  ingestionStatusEnum,
  sourceConflictStatusEnum,
  sourceConflictResolutionEnum,
  sourceConflictDecisionEnum,
  workflowStatusEnum,
  type IngestionStatus,
} from "@/lib/db/schema";
import type { Database } from "@/lib/db";
import { requirePermission, type Role } from "@/lib/auth/permissions";
import { writeAudit, auditActions } from "@/lib/auth/audit";
import { AuthError } from "@/lib/auth/auth-service";

/**
 * SOURCE REGISTRY — preparation for data ingestion.
 *
 * A source is a named origin of information with registry metadata (who, where,
 * licence, access method, freshness, coverage). Three core rules drive this
 * module:
 *
 *   1. A source is NEVER automatically classified as trusted.
 *      - `sourceType` (classification) defaults to UNKNOWN.
 *      - `reliability` defaults to UNKNOWN.
 *      - `isActive` is always false at creation and can only be turned on after
 *        a human confirmed the classification.
 *   2. Ingestion status moves only through EXPLICIT transitions
 *      (`advanceIngestionStatus`). Availability checks update timestamps but
 *      never move a source forward on their own.
 *   3. Conflicting records become a `source_conflicts` row; conflicts are
 *      resolved by a human, never merged silently.
 *
 * All mutations require MANAGE_DATA_SOURCES (ADMIN).
 */

export type { Role };

export const SOURCE_CLASSIFICATIONS_ALL = Object.values(sourceClassificationEnum) as string[];

export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceError";
  }
}

export function isSourceClassification(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Object.values(sourceClassificationEnum).includes(
      value as (typeof sourceClassificationEnum)[keyof typeof sourceClassificationEnum],
    )
  );
}

function assertInEnum<T extends Record<string, string>>(
  value: unknown,
  valueLabel: string,
  lookup: T,
): asserts value is T[keyof T] {
  if (typeof value !== "string" || !(value in lookup)) {
    throw new SourceError(`${valueLabel} is not a recognised value.`);
  }
}

export interface CreateSourceInput {
  name: string;
  sourceType?: string;
  organizationName?: string | null;
  referenceUrl?: string | null;
  description?: string | null;
  contact?: string | null;
  license?: string | null;
  usageTerms?: string | null;
  accessMethod?: string;
  reliability?: string;
  updateFrequency?: string;
  freshnessClass?: string;
  geographicCoverage?: string;
  notes?: string | null;
}

export async function createSource(
  db: Database,
  input: {
    actor: { id: string; role: Role | string };
    source: CreateSourceInput;
    ipAddress?: string | null;
  },
): Promise<typeof dataSources.$inferSelect> {
  requirePermission(input.actor.role, "MANAGE_DATA_SOURCES");

  const classification = input.source.sourceType ?? sourceClassificationEnum.UNKNOWN;
  assertInEnum(classification, "sourceType", sourceClassificationEnum);
  if (input.source.accessMethod)
    assertInEnum(input.source.accessMethod, "accessMethod", sourceAccessMethodEnum);
  if (input.source.reliability)
    assertInEnum(input.source.reliability, "reliability", confidenceEnum);
  if (input.source.updateFrequency)
    assertInEnum(input.source.updateFrequency, "updateFrequency", {
      REAL_TIME: "REAL_TIME",
      HOURLY: "HOURLY",
      DAILY: "DAILY",
      WEEKLY: "WEEKLY",
      MONTHLY: "MONTHLY",
      ON_UPDATE: "ON_UPDATE",
      MANUAL: "MANUAL",
      UNKNOWN: "UNKNOWN",
    });
  if (input.source.freshnessClass)
    assertInEnum(input.source.freshnessClass, "freshnessClass", freshnessClassEnum);
  if (input.source.geographicCoverage)
    assertInEnum(input.source.geographicCoverage, "geographicCoverage", geographicCoverageEnum);

  const id = randomUUID();
  const [row] = await db
    .insert(dataSources)
    .values({
      id,
      name: input.source.name,
      // A source never claims trust by default: classification and reliability
      // stay UNKNOWN/DISCOVERED/inactive until a human confirms them.
      sourceType: classification,
      organizationName: input.source.organizationName ?? null,
      referenceUrl: input.source.referenceUrl || null,
      description: input.source.description ?? null,
      contact: input.source.contact ?? null,
      license: input.source.license ?? null,
      usageTerms: input.source.usageTerms ?? null,
      accessMethod: input.source.accessMethod ?? sourceAccessMethodEnum.UNKNOWN,
      reliability: input.source.reliability ?? confidenceEnum.UNKNOWN,
      updateFrequency: input.source.updateFrequency ?? "MANUAL",
      freshnessClass: input.source.freshnessClass ?? freshnessClassEnum.DEFAULT,
      geographicCoverage: input.source.geographicCoverage ?? geographicCoverageEnum.UNKNOWN,
      notes: input.source.notes ?? null,
      ingestionStatus: ingestionStatusEnum.DISCOVERED,
      createdById: input.actor.id,
      isInternal: false,
      isActive: false, // a source is NEVER live until explicitly enabled
    })
    .returning();

  await writeAudit(db, {
    userId: input.actor.id,
    action: auditActions.SOURCE_CREATED,
    entityType: "data_source",
    entityId: id,
    metadata: { sourceType: classification },
    ipAddress: input.ipAddress,
  });

  return row;
}

export interface UpdateSourceInput {
  name?: string;
  organizationName?: string | null;
  referenceUrl?: string | null;
  description?: string | null;
  contact?: string | null;
  license?: string | null;
  usageTerms?: string | null;
  accessMethod?: string;
  reliability?: string;
  updateFrequency?: string;
  freshnessClass?: string;
  geographicCoverage?: string;
  notes?: string | null;
  sourceType?: string;
  isActive?: boolean;
}

export async function updateSource(
  db: Database,
  input: {
    actor: { id: string; role: Role | string };
    sourceId: string;
    patch: UpdateSourceInput;
    ipAddress?: string | null;
  },
): Promise<typeof dataSources.$inferSelect> {
  requirePermission(input.actor.role, "MANAGE_DATA_SOURCES");

  if (input.patch.sourceType)
    assertInEnum(input.patch.sourceType, "sourceType", sourceClassificationEnum);
  if (input.patch.accessMethod)
    assertInEnum(input.patch.accessMethod, "accessMethod", sourceAccessMethodEnum);
  if (input.patch.reliability) assertInEnum(input.patch.reliability, "reliability", confidenceEnum);
  if (input.patch.freshnessClass)
    assertInEnum(input.patch.freshnessClass, "freshnessClass", freshnessClassEnum);
  if (input.patch.geographicCoverage)
    assertInEnum(input.patch.geographicCoverage, "geographicCoverage", geographicCoverageEnum);
  if (input.patch.updateFrequency)
    assertInEnum(input.patch.updateFrequency, "updateFrequency", {
      REAL_TIME: "REAL_TIME",
      HOURLY: "HOURLY",
      DAILY: "DAILY",
      WEEKLY: "WEEKLY",
      MONTHLY: "MONTHLY",
      ON_UPDATE: "ON_UPDATE",
      MANUAL: "MANUAL",
      UNKNOWN: "UNKNOWN",
    });

  // A source can only become LIVE after its classification has been confirmed
  // by a human. This keeps trust a deliberate act, never an accident.
  if (input.patch.isActive === true) {
    const [current] = await db
      .select({ classificationVerifiedAt: dataSources.classificationVerifiedAt })
      .from(dataSources)
      .where(eq(dataSources.id, input.sourceId))
      .limit(1);
    if (!current) throw new AuthError("Source not found.");
    if (!current.classificationVerifiedAt) {
      throw new SourceError("A source cannot be activated until its classification is confirmed.");
    }
  }

  const [row] = await db
    .update(dataSources)
    .set({ ...input.patch, updatedAt: new Date() })
    .where(eq(dataSources.id, input.sourceId))
    .returning();
  if (!row) throw new AuthError("Source not found.");

  await writeAudit(db, {
    userId: input.actor.id,
    action: auditActions.SOURCE_UPDATED,
    entityType: "data_source",
    entityId: input.sourceId,
    metadata: { patch: Object.keys(input.patch) },
    ipAddress: input.ipAddress,
  });

  return row;
}

/**
 * Explicitly record that a reviewer confirmed the source's classification
 * (e.g. that it genuinely is a government or official body). Confirming a
 * classification is NOT the same as activating the source — `isActive` is
 * untouched here and must be set separately.
 */
export async function confirmSourceClassification(
  db: Database,
  input: {
    actor: { id: string; role: Role | string };
    sourceId: string;
    note?: string | null;
    ipAddress?: string | null;
  },
): Promise<void> {
  requirePermission(input.actor.role, "MANAGE_DATA_SOURCES");
  const [row] = await db
    .update(dataSources)
    .set({
      classificationVerifiedById: input.actor.id,
      classificationVerifiedAt: new Date(),
      notes: input.note?.trim() || undefined,
      updatedAt: new Date(),
    })
    .where(eq(dataSources.id, input.sourceId))
    .returning({ id: dataSources.id });
  if (!row) throw new AuthError("Source not found.");

  await writeAudit(db, {
    userId: input.actor.id,
    action: auditActions.SOURCE_CLASSIFICATION_VERIFIED,
    entityType: "data_source",
    entityId: input.sourceId,
    ipAddress: input.ipAddress,
  });
}

// --- Ingestion lifecycle -----------------------------------------------------

/**
 * Allowed ingestion transitions. Every move is explicit; nothing auto-advances.
 */
export const INGESTION_TRANSITIONS: Record<string, readonly IngestionStatus[]> = {
  DISCOVERED: ["ACCESSIBLE", "REVIEW_REQUIRED", "UNAVAILABLE"],
  ACCESSIBLE: ["INGESTED", "REVIEW_REQUIRED", "UNAVAILABLE"],
  INGESTED: ["VALIDATED", "REVIEW_REQUIRED", "UNAVAILABLE"],
  VALIDATED: ["REVIEW_REQUIRED", "PUBLISHED", "UNAVAILABLE"],
  REVIEW_REQUIRED: ["VALIDATED", "INGESTED", "UNAVAILABLE"],
  PUBLISHED: ["REVIEW_REQUIRED", "UNAVAILABLE"],
  UNAVAILABLE: ["DISCOVERED", "REVIEW_REQUIRED"],
};

/**
 * Pure transition rule used by both the permission-gated `advanceIngestionStatus`
 * and by automated ingestion pipelines (which run as the system, not a user).
 */
export function assertIngestionTransition(current: string, to: string): void {
  if (current === to) throw new SourceError(`Source is already ${to}.`);
  const allowed = INGESTION_TRANSITIONS[current] as readonly string[] | undefined;
  if (!allowed?.includes(to)) {
    throw new SourceError(`Cannot move a ${current} source to ${to}.`);
  }
}

/**
 * Move a source to the next ingestion step. PUBLISHED additionally requires a
 * human-confirmed classification — a source can never become trusted purely by
 * reaching a state.
 */
export async function advanceIngestionStatus(
  db: Database,
  input: {
    actor: { id: string; role: Role | string };
    sourceId: string;
    to: IngestionStatus;
    note?: string | null;
    ipAddress?: string | null;
  },
): Promise<void> {
  requirePermission(input.actor.role, "MANAGE_DATA_SOURCES");

  const [current] = await db
    .select({
      ingestionStatus: dataSources.ingestionStatus,
      classificationVerifiedAt: dataSources.classificationVerifiedAt,
    })
    .from(dataSources)
    .where(eq(dataSources.id, input.sourceId))
    .limit(1);
  if (!current) throw new AuthError("Source not found.");

  assertIngestionTransition(current.ingestionStatus, input.to);
  if (input.to === ingestionStatusEnum.PUBLISHED && !current.classificationVerifiedAt) {
    throw new SourceError("A source cannot be PUBLISHED until its classification is confirmed.");
  }

  await db
    .update(dataSources)
    .set({ ingestionStatus: input.to, updatedAt: new Date() })
    .where(eq(dataSources.id, input.sourceId));

  await writeAudit(db, {
    userId: input.actor.id,
    action: auditActions.SOURCE_INGESTION_ADVANCED,
    entityType: "data_source",
    entityId: input.sourceId,
    metadata: { toStatus: input.to },
    ipAddress: input.ipAddress,
  });
}

/**
 * Record a mechanical availability check (URL/API reachability, document
 * retrieval). This logs `last_checked_at` (and `last_successful_fetch_at` when
 * the check succeeded) but NEVER changes classification, reliability, ingestion
 * status or `isActive` — an automated check is not a trust decision.
 */
export async function recordSourceCheck(
  db: Database,
  input: {
    actor: { id: string; role: Role | string };
    sourceId: string;
    ok: boolean;
    note?: string | null;
    ipAddress?: string | null;
  },
): Promise<void> {
  requirePermission(input.actor.role, "MANAGE_DATA_SOURCES");

  const [row] = await db
    .update(dataSources)
    .set({
      lastCheckedAt: new Date(),
      lastSuccessfulFetchAt: input.ok ? new Date() : dataSources.lastSuccessfulFetchAt,
      notes: input.note?.trim() || undefined,
      updatedAt: new Date(),
    })
    .where(eq(dataSources.id, input.sourceId))
    .returning({ id: dataSources.id });
  if (!row) throw new AuthError("Source not found.");

  await writeAudit(db, {
    userId: input.actor.id,
    action: auditActions.SOURCE_CHECKED,
    entityType: "data_source",
    entityId: input.sourceId,
    metadata: { ok: input.ok },
    ipAddress: input.ipAddress,
  });
}

// --- Conflicts ---------------------------------------------------------------

export interface FlagConflictInput {
  actor: { id: string; role: Role | string };
  entityType: string;
  entityId: string;
  recordAId: string;
  recordBId: string;
  note?: string | null;
  ipAddress?: string | null;
}

/**
 * Permission-free variant used by automated ingestion pipelines (which run as
 * the system, not a user). All consistency/idempotency rules still apply.
 */
export async function flagSourceConflictUnchecked(
  db: Database,
  input: { createdById?: string | null } & Omit<FlagConflictInput, "actor" | "ipAddress">,
): Promise<typeof sourceConflicts.$inferSelect> {
  const records = await db
    .select({
      id: sourceRecords.id,
      entityType: sourceRecords.entityType,
      entityId: sourceRecords.entityId,
      value: sourceRecords.value,
    })
    .from(sourceRecords)
    .where(or(eq(sourceRecords.id, input.recordAId), eq(sourceRecords.id, input.recordBId)));
  const byId = new Map(records.map((r) => [r.id, r]));
  const a = byId.get(input.recordAId);
  const b = byId.get(input.recordBId);
  if (!a || !b) throw new SourceError("Both source records must exist.");
  if (
    a.entityType !== input.entityType ||
    a.entityId !== input.entityId ||
    b.entityType !== input.entityType ||
    b.entityId !== input.entityId
  ) {
    throw new SourceError("Both records must refer to the same entity.");
  }
  if ((a.value ?? "") === (b.value ?? "")) {
    throw new SourceError("Records with equal values are not a conflict.");
  }

  // Idempotency: an open conflict for the same pair returns the existing row.
  const existing = await db
    .select()
    .from(sourceConflicts)
    .where(
      and(
        eq(sourceConflicts.status, sourceConflictStatusEnum.OPEN),
        or(
          and(
            eq(sourceConflicts.recordAId, input.recordAId),
            eq(sourceConflicts.recordBId, input.recordBId),
          ),
          and(
            eq(sourceConflicts.recordAId, input.recordBId),
            eq(sourceConflicts.recordBId, input.recordAId),
          ),
        ),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const id = randomUUID();
  const [row] = await db
    .insert(sourceConflicts)
    .values({
      id,
      entityType: input.entityType,
      entityId: input.entityId,
      recordAId: input.recordAId,
      recordBId: input.recordBId,
      valueA: a.value ?? null,
      valueB: b.value ?? null,
      status: sourceConflictStatusEnum.OPEN,
      createdById: input.createdById ?? null,
      note: input.note ?? null,
    })
    .returning();

  await writeAudit(db, {
    userId: input.createdById ?? null,
    action: auditActions.SOURCE_CONFLICT_FLAGGED,
    entityType: "source_conflict",
    entityId: id,
  });

  return row;
}

/**
 * Register a conflict between two source records for the same entity. The
 * records must exist, refer to the same entity, and carry DIFFERENT values —
 * equal values are not a conflict. Flagging an already-open pair is idempotent
 * (returns the existing row) rather than creating duplicates.
 */
export async function flagSourceConflict(
  db: Database,
  input: FlagConflictInput,
): Promise<typeof sourceConflicts.$inferSelect> {
  requirePermission(input.actor.role, "MANAGE_DATA_SOURCES");
  return flagSourceConflictUnchecked(db, {
    createdById: input.actor.id,
    entityType: input.entityType,
    entityId: input.entityId,
    recordAId: input.recordAId,
    recordBId: input.recordBId,
    note: input.note,
  });
}

/**
 * CANONICAL conflict-decisions (Chunk 3).
 *
 * Every caller resolves a conflict through this one union. KEEP_A / KEEP_B carry
 * the accepted record id explicitly so the human's choice is always recorded;
 * REJECT_BOTH keeps neither; MERGE is recognised but unsupported by the current
 * conflict data model (rejected below, never persisted).
 */
export type ConflictDecision =
  | { decision: typeof sourceConflictDecisionEnum.KEEP_A; acceptedRecordId: string }
  | { decision: typeof sourceConflictDecisionEnum.KEEP_B; acceptedRecordId: string }
  | { decision: typeof sourceConflictDecisionEnum.REJECT_BOTH }
  | { decision: typeof sourceConflictDecisionEnum.MERGE };

/**
 * Map a canonical decision to the value persisted on `source_conflicts.resolution`
 * (the legacy storage vocabulary). MERGE is never persisted.
 */
export function toStoredConflictResolution(decision: ConflictDecision): string {
  switch (decision.decision) {
    case sourceConflictDecisionEnum.KEEP_A:
      return sourceConflictResolutionEnum.ACCEPT_RECORD_A;
    case sourceConflictDecisionEnum.KEEP_B:
      return sourceConflictResolutionEnum.ACCEPT_RECORD_B;
    case sourceConflictDecisionEnum.REJECT_BOTH:
      return sourceConflictResolutionEnum.REJECT_BOTH;
    case sourceConflictDecisionEnum.MERGE:
      throw new SourceError("MERGE is not supported by the conflict data model.");
  }
}

/**
 * Submission statuses that still allow a record to move toward PUBLISHED. On
 * resolution, submissions backed by the rejected record(s) in these states are
 * retired (REJECTED) so only the accepted record remains eligible.
 */
const PUBLISHABLE_SUBMISSION_STATUSES = [
  workflowStatusEnum.SUBMITTED,
  workflowStatusEnum.VALIDATING,
  workflowStatusEnum.PENDING_VERIFICATION,
  workflowStatusEnum.VERIFIED,
  workflowStatusEnum.CONFLICT,
] as const;

/**
 * Resolve an OPEN conflict with an explicit human decision.
 *
 *   KEEP_A / KEEP_B — both original source records are preserved; the accepted
 *     record id is recorded on the conflict; candidate submissions backed by the
 *     NON-accepted record are retired through the normal workflow so only the
 *     accepted record can go on to be APPROVED → PUBLISHED.
 *   REJECT_BOTH     — neither record becomes published; active submissions of
 *     both records are retired; the records themselves stay for auditability.
 *   MERGE           — rejected with a clear error: the current schema has no
 *     safe, human-controlled merge model.
 *
 * ADMIN-only (MANAGE_DATA_SOURCES). Writes a canonical audit entry.
 */
export async function resolveSourceConflict(
  db: Database,
  input: {
    actor: { id: string; role: Role | string };
    conflictId: string;
    resolution: ConflictDecision;
    note?: string | null;
    ipAddress?: string | null;
  },
): Promise<void> {
  requirePermission(input.actor.role, "MANAGE_DATA_SOURCES");

  const [current] = await db
    .select()
    .from(sourceConflicts)
    .where(eq(sourceConflicts.id, input.conflictId))
    .limit(1);
  if (!current) throw new SourceError("Conflict not found.");
  if (current.status !== sourceConflictStatusEnum.OPEN) {
    throw new SourceError(
      `Only open conflicts can be resolved (current status: ${current.status}).`,
    );
  }

  const decision = input.resolution;
  if (decision.decision === sourceConflictDecisionEnum.MERGE) {
    throw new SourceError(
      "MERGE is not supported: the conflict data model has no safe, human-controlled merge operation. Choose KEEP_A, KEEP_B, or REJECT_BOTH.",
    );
  }

  let acceptedRecordId: string | null = null;
  if (decision.decision === sourceConflictDecisionEnum.KEEP_A) {
    if (decision.acceptedRecordId !== current.recordAId) {
      throw new SourceError(
        "acceptedRecordId must be the record chosen by the decision (record A for KEEP_A).",
      );
    }
    acceptedRecordId = current.recordAId;
  } else if (decision.decision === sourceConflictDecisionEnum.KEEP_B) {
    if (decision.acceptedRecordId !== current.recordBId) {
      throw new SourceError(
        "acceptedRecordId must be the record chosen by the decision (record B for KEEP_B).",
      );
    }
    acceptedRecordId = current.recordBId;
  }

  const storedResolution = toStoredConflictResolution(decision);
  const rejectedRecordIds =
    decision.decision === sourceConflictDecisionEnum.REJECT_BOTH
      ? [current.recordAId, current.recordBId]
      : decision.decision === sourceConflictDecisionEnum.KEEP_A
        ? [current.recordBId]
        : [current.recordAId];

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    await txDb
      .update(sourceConflicts)
      .set({
        status: sourceConflictStatusEnum.RESOLVED,
        resolution: storedResolution,
        acceptedRecordId,
        resolvedById: input.actor.id,
        resolvedAt: new Date(),
        resolutionNote: input.note?.trim() || null,
      })
      .where(eq(sourceConflicts.id, current.id));

    // Retire candidate submissions backed by the rejected record(s) so only the
    // accepted record (or none, for REJECT_BOTH) can reach the publication gate.
    const rejectedSubmissions = await txDb
      .select()
      .from(dataSubmissions)
      .where(
        and(
          inArray(dataSubmissions.sourceRecordId, rejectedRecordIds),
          inArray(dataSubmissions.workflowStatus, PUBLISHABLE_SUBMISSION_STATUSES),
        ),
      );
    for (const sub of rejectedSubmissions) {
      await txDb
        .update(dataSubmissions)
        .set({
          workflowStatus: workflowStatusEnum.REJECTED,
          reason: `Rejected by conflict resolution ${current.id}.`,
          updatedAt: new Date(),
        })
        .where(eq(dataSubmissions.id, sub.id));
      await txDb.insert(verifications).values({
        id: randomUUID(),
        sourceRecordId: sub.sourceRecordId,
        submissionId: sub.id,
        verifiedById: input.actor.id,
        decision: "REJECT",
        verificationStatus: "REJECTED",
        confidence: "UNKNOWN",
        note: `Rejected by conflict resolution ${current.id}.`,
        lastVerifiedAt: new Date(),
      });
      await writeAudit(txDb, {
        userId: input.actor.id,
        action: auditActions.SUBMISSION_DECISION,
        entityType: "data_submission",
        entityId: sub.id,
        metadata: { decision: "REJECT", resolution: current.id },
        ipAddress: input.ipAddress,
      });
    }

    await writeAudit(txDb, {
      userId: input.actor.id,
      action: auditActions.SOURCE_CONFLICT_RESOLVED,
      entityType: "source_conflict",
      entityId: current.id,
      metadata:
        decision.decision === sourceConflictDecisionEnum.REJECT_BOTH
          ? { resolution: "rejected_both", decision: decision.decision }
          : {
              resolution: `accepted:${acceptedRecordId ?? ""}`,
              decision: decision.decision,
              accepted: acceptedRecordId,
            },
      ipAddress: input.ipAddress,
    });
  });
}

export async function listSourceConflicts(
  db: Database,
  opts: { status?: string; limit?: number } = {},
): Promise<(typeof sourceConflicts.$inferSelect)[]> {
  const limit = Math.min(opts.limit ?? 100, 200);
  const where = opts.status ? eq(sourceConflicts.status, opts.status) : undefined;
  return db
    .select()
    .from(sourceConflicts)
    .where(where)
    .orderBy(sourceConflicts.createdAt)
    .limit(limit);
}

// --- Read surfaces -----------------------------------------------------------

export interface SourceListItem {
  id: string;
  name: string;
  sourceType: string;
  organizationName: string | null;
  referenceUrl: string | null;
  license: string | null;
  usageTerms: string | null;
  accessMethod: string;
  reliability: string;
  updateFrequency: string;
  freshnessClass: string;
  geographicCoverage: string;
  ingestionStatus: string;
  lastCheckedAt: Date | null;
  lastSuccessfulFetchAt: Date | null;
  isActive: boolean;
  isInternal: boolean;
  classificationVerifiedAt: Date | null;
  createdAt: Date;
}

export async function listSources(db: Database): Promise<SourceListItem[]> {
  const rows = await db
    .select({
      id: dataSources.id,
      name: dataSources.name,
      sourceType: dataSources.sourceType,
      organizationName: dataSources.organizationName,
      referenceUrl: dataSources.referenceUrl,
      license: dataSources.license,
      usageTerms: dataSources.usageTerms,
      accessMethod: dataSources.accessMethod,
      reliability: dataSources.reliability,
      updateFrequency: dataSources.updateFrequency,
      freshnessClass: dataSources.freshnessClass,
      geographicCoverage: dataSources.geographicCoverage,
      ingestionStatus: dataSources.ingestionStatus,
      lastCheckedAt: dataSources.lastCheckedAt,
      lastSuccessfulFetchAt: dataSources.lastSuccessfulFetchAt,
      isActive: dataSources.isActive,
      isInternal: dataSources.isInternal,
      classificationVerifiedAt: dataSources.classificationVerifiedAt,
      createdAt: dataSources.createdAt,
    })
    .from(dataSources)
    .orderBy(dataSources.createdAt);
  return rows;
}
