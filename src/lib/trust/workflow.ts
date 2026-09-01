import { and, count, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  dataSources,
  sourceRecords,
  dataSubmissions,
  verifications,
  userReports,
  users,
  sourceClassificationEnum,
  verificationStatusEnum,
  workflowStatusEnum,
  type ReviewDecision,
} from "@/lib/db/schema";
import type { Database } from "@/lib/db";
import { requirePermission, type Role } from "@/lib/auth/permissions";
import { writeAudit, auditActions } from "@/lib/auth/audit";

/**
 * DATA TRUST WORKFLOW
 * -------------------
 * The reusable pipeline for externally sourced or user-submitted information:
 *
 *   DISCOVERED → SUBMITTED → VALIDATING → PENDING_VERIFICATION → VERIFIED → PUBLISHED
 *
 *   terminal / side states: REJECTED · CONFLICT · EXPIRED · UNAVAILABLE
 *
 * A submission always carries provenance (its source record → data source).
 * Reviewers act on submissions; every decision writes a `verifications` row AND
 * an audit entry. The public layer never reads an un-verified value as fact and
 * never silently chooses between conflicting sources — CONFLICT is shown until a
 * reviewer resolves it.
 */

export class TrustError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustError";
  }
}

// --- State machine (pure, unit-testable) ------------------------------------

const TRANSITIONS: Record<string, ReadonlySet<ReviewDecision>> = {
  [workflowStatusEnum.DISCOVERED]: new Set(["REOPEN", "REJECT", "UNAVAILABLE"]),
  [workflowStatusEnum.SUBMITTED]: new Set([
    "APPROVE",
    "REJECT",
    "CONFLICT",
    "UNAVAILABLE",
    "REOPEN",
  ]),
  [workflowStatusEnum.VALIDATING]: new Set(["APPROVE", "REJECT", "CONFLICT", "UNAVAILABLE"]),
  [workflowStatusEnum.PENDING_VERIFICATION]: new Set([
    "APPROVE",
    "REJECT",
    "CONFLICT",
    "UNAVAILABLE",
  ]),
  [workflowStatusEnum.VERIFIED]: new Set([
    "APPROVE",
    "PUBLISH",
    "REJECT",
    "CONFLICT",
    "UNAVAILABLE",
    "EXPIRE",
  ]),
  [workflowStatusEnum.PUBLISHED]: new Set(["REJECT", "EXPIRE", "UNAVAILABLE"]),
  [workflowStatusEnum.REJECTED]: new Set(["REOPEN"]),
  [workflowStatusEnum.CONFLICT]: new Set(["APPROVE", "REJECT", "UNAVAILABLE", "EXPIRE", "REOPEN"]),
  [workflowStatusEnum.EXPIRED]: new Set(["REOPEN"]),
  [workflowStatusEnum.UNAVAILABLE]: new Set(["REOPEN"]),
};

/** Display-status value stored on the provenance record / user report. */
const NOTIFICATION_STATUS_BY_DECISION: Record<ReviewDecision, string> = {
  APPROVE: verificationStatusEnum.VERIFIED,
  PUBLISH: verificationStatusEnum.LIVE,
  REJECT: "REJECTED",
  CONFLICT: verificationStatusEnum.CONFLICT,
  UNAVAILABLE: verificationStatusEnum.UNAVAILABLE,
  EXPIRE: verificationStatusEnum.EXPIRED,
  REOPEN: "",
};

export function nextStatusOf(current: string, decision: ReviewDecision): string | null {
  const allowed = TRANSITIONS[current];
  if (!allowed || !allowed.has(decision)) return null;
  switch (decision) {
    case "APPROVE":
      return workflowStatusEnum.VERIFIED;
    case "PUBLISH":
      return workflowStatusEnum.PUBLISHED;
    case "REJECT":
      return workflowStatusEnum.REJECTED;
    case "CONFLICT":
      return workflowStatusEnum.CONFLICT;
    case "UNAVAILABLE":
      return workflowStatusEnum.UNAVAILABLE;
    case "EXPIRE":
      return workflowStatusEnum.EXPIRED;
    case "REOPEN":
      return workflowStatusEnum.SUBMITTED;
  }
}

// --- Provenance-shaped reading ------------------------------------------------

const submissionSelect = () => ({
  submission: dataSubmissions,
  sourceRecord: sourceRecords,
  source: dataSources,
  submitter: { id: users.id, email: users.email, name: users.name, role: users.role },
});

export type SubmissionWithProvenance = Awaited<ReturnType<typeof loadWithProvenance>>;

async function loadWithProvenance(db: Database, id: string) {
  const rows = await db
    .select(submissionSelect())
    .from(dataSubmissions)
    .innerJoin(sourceRecords, eq(dataSubmissions.sourceRecordId, sourceRecords.id))
    .innerJoin(dataSources, eq(sourceRecords.dataSourceId, dataSources.id))
    .leftJoin(users, eq(dataSubmissions.submittedById, users.id))
    .where(eq(dataSubmissions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row;
}

export type SubmissionListItem = NonNullable<Awaited<ReturnType<typeof loadWithProvenance>>> & {
  verificationsCount: number;
};

export async function listSubmissions(
  db: Database,
  opts: { status?: string; limit?: number } = {},
): Promise<SubmissionListItem[]> {
  const limit = Math.min(opts.limit ?? 100, 200);
  const where = opts.status ? eq(dataSubmissions.workflowStatus, opts.status) : undefined;

  const rows = await db
    .select(submissionSelect())
    .from(dataSubmissions)
    .innerJoin(sourceRecords, eq(dataSubmissions.sourceRecordId, sourceRecords.id))
    .innerJoin(dataSources, eq(sourceRecords.dataSourceId, dataSources.id))
    .leftJoin(users, eq(dataSubmissions.submittedById, users.id))
    .where(where)
    .orderBy(desc(dataSubmissions.createdAt))
    .limit(limit);

  const items: SubmissionListItem[] = rows.map((row) => ({ ...row, verificationsCount: 0 }));
  const ids = items.map((i) => i.submission.id);
  if (ids.length > 0) {
    const counts = await db
      .select({ id: verifications.submissionId, n: count() })
      .from(verifications)
      .where(inArray(verifications.submissionId, ids))
      .groupBy(verifications.submissionId);
    const map = new Map(counts.map((c) => [c.id, c.n]));
    for (const item of items) {
      item.verificationsCount = map.get(item.submission.id) ?? 0;
    }
  }
  return items;
}

export async function getSubmission(db: Database, id: string) {
  return loadWithProvenance(db, id);
}

export async function pendingSubmissionCount(db: Database): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(dataSubmissions)
    .where(eq(dataSubmissions.workflowStatus, workflowStatusEnum.PENDING_VERIFICATION));
  return rows[0]?.n ?? 0;
}

// --- Creation ----------------------------------------------------------------

/**
 * Find or create the per-user USER_SUBMITTED source so reports stay traceable.
 * The source is created inactive and unclassified-as-trusted, like every other
 * source.
 */
async function ensureUserSource(
  db: Database,
  user: { id: string; email: string; name?: string | null },
): Promise<string> {
  const existing = await db
    .select({ id: dataSources.id })
    .from(dataSources)
    .where(
      and(
        eq(dataSources.sourceType, sourceClassificationEnum.USER_SUBMITTED),
        eq(dataSources.createdById, user.id),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;

  const id = randomUUID();
  await db.insert(dataSources).values({
    id,
    name: `User report — ${user.email}`,
    sourceType: sourceClassificationEnum.USER_SUBMITTED,
    organizationName: user.name?.trim() || user.email,
    description: "Community-submitted report; never trusted until verified.",
    createdById: user.id,
    isInternal: false,
    isActive: false,
  });
  return id;
}

export interface SubmitUserReportInput {
  userId: string;
  userEmail: string;
  userName?: string | null;
  targetType: string;
  targetId: string;
  reportType: string;
  payload?: string | null;
  note?: string | null;
  ipAddress?: string | null;
}

/** User-submitted report → user_reports + source + source record + submission. */
export async function submitUserReport(db: Database, input: SubmitUserReportInput) {
  const sourceId = await ensureUserSource(db, {
    id: input.userId,
    email: input.userEmail,
    name: input.userName,
  });

  await db.insert(userReports).values({
    id: randomUUID(),
    userId: input.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    reportType: input.reportType,
    payload: input.payload ?? null,
    verificationStatus: verificationStatusEnum.USER_REPORTED,
  });

  const sourceRecordId = randomUUID();
  await db.insert(sourceRecords).values({
    id: sourceRecordId,
    dataSourceId: sourceId,
    entityType: input.targetType,
    entityId: input.targetId,
    rawValue: input.payload ?? null,
    value: input.payload ?? null,
    verificationStatus: verificationStatusEnum.USER_REPORTED,
  });

  const submissionId = randomUUID();
  await db.insert(dataSubmissions).values({
    id: submissionId,
    sourceRecordId,
    submittedById: input.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    payload: input.payload ?? null,
    note: input.note ?? null,
    workflowStatus: workflowStatusEnum.SUBMITTED,
  });

  await writeAudit(db, {
    userId: input.userId,
    action: auditActions.SUBMISSION_CREATED,
    entityType: "data_submission",
    entityId: submissionId,
    metadata: {
      targetType: input.targetType,
      targetId: input.targetId,
      reportType: input.reportType,
    },
    ipAddress: input.ipAddress,
  });

  return loadWithProvenance(db, submissionId);
}

export interface IngestSubmissionInput {
  submittedById?: string | null;
  sourceId: string;
  targetType: string;
  targetId: string;
  rawValue?: string | null;
  value?: string | null;
  referenceUrl?: string | null;
  payload?: string | null;
  note?: string | null;
  ipAddress?: string | null;
}

/** Authority/ingest: register a discovered claim from an existing source. */
export async function createIngestSubmission(db: Database, input: IngestSubmissionInput) {
  const sourceRecordId = randomUUID();
  const submissionId = randomUUID();

  await db.insert(sourceRecords).values({
    id: sourceRecordId,
    dataSourceId: input.sourceId,
    entityType: input.targetType,
    entityId: input.targetId,
    rawValue: input.rawValue ?? input.payload ?? null,
    value: input.value ?? input.payload ?? null,
    referenceUrl: input.referenceUrl ?? null,
    verificationStatus: verificationStatusEnum.UNAVAILABLE,
  });

  await db.insert(dataSubmissions).values({
    id: submissionId,
    sourceRecordId,
    submittedById: input.submittedById ?? null,
    targetType: input.targetType,
    targetId: input.targetId,
    payload: input.payload ?? null,
    note: input.note ?? null,
    workflowStatus: workflowStatusEnum.DISCOVERED,
  });

  await writeAudit(db, {
    userId: input.submittedById ?? null,
    action: auditActions.SUBMISSION_CREATED,
    entityType: "data_submission",
    entityId: submissionId,
    metadata: { targetType: input.targetType, targetId: input.targetId, kind: "ingest" },
    ipAddress: input.ipAddress,
  });

  return loadWithProvenance(db, submissionId);
}

// --- Internal lifecycle steps (automated pipelines) --------------------------

export async function advanceSubmission(
  db: Database,
  submissionId: string,
  to: "SUBMITTED" | "VALIDATING" | "PENDING_VERIFICATION",
): Promise<void> {
  const target = workflowStatusEnum[to];
  const [submission] = await db
    .select({ workflowStatus: dataSubmissions.workflowStatus })
    .from(dataSubmissions)
    .where(eq(dataSubmissions.id, submissionId))
    .limit(1);
  if (!submission) throw new TrustError("Submission not found.");

  const expectedFrom =
    to === "SUBMITTED"
      ? workflowStatusEnum.DISCOVERED
      : to === "VALIDATING"
        ? workflowStatusEnum.SUBMITTED
        : workflowStatusEnum.VALIDATING;

  if (submission.workflowStatus !== expectedFrom) {
    throw new TrustError(`Cannot move a ${submission.workflowStatus} submission to ${to}.`);
  }

  await db
    .update(dataSubmissions)
    .set({ workflowStatus: target, updatedAt: new Date() })
    .where(eq(dataSubmissions.id, submissionId));
}

// --- Reviewer decisions ------------------------------------------------------

export interface ReviewInput {
  submissionId: string;
  reviewer: { id: string; role: Role | string };
  decision: ReviewDecision;
  reason?: string | null;
  confidence?: string | null;
  conflictWithId?: string | null;
  ipAddress?: string | null;
}

export async function reviewSubmission(db: Database, input: ReviewInput) {
  requirePermission(input.reviewer.role, "REVIEW_VERIFICATIONS");

  const current = await loadWithProvenance(db, input.submissionId);
  if (!current) throw new TrustError("Submission not found.");

  const from = current.submission.workflowStatus;
  const next = nextStatusOf(from, input.decision);
  if (!next) {
    throw new TrustError(`Decision ${input.decision} is not allowed from status ${from}.`);
  }

  if (input.decision === "CONFLICT" && !input.conflictWithId) {
    throw new TrustError("Flagging a conflict requires the conflicting submission id.");
  }

  await db
    .update(dataSubmissions)
    .set({
      workflowStatus: next,
      reason: input.reason?.trim() || null,
      conflictWithId: input.decision === "CONFLICT" ? (input.conflictWithId ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(dataSubmissions.id, input.submissionId));

  // Record the decision when it produces a notification/display status.
  const notifyStatus = NOTIFICATION_STATUS_BY_DECISION[input.decision];
  if (notifyStatus) {
    await db.insert(verifications).values({
      id: randomUUID(),
      sourceRecordId: current.sourceRecord.id,
      submissionId: input.submissionId,
      verifiedById: input.reviewer.id,
      decision: input.decision,
      verificationStatus: notifyStatus,
      confidence: input.confidence ?? "UNKNOWN",
      note: input.reason?.trim() || null,
      lastVerifiedAt: new Date(),
    });

    const sourceUpdate: Partial<typeof sourceRecords.$inferInsert> = {
      verificationStatus: notifyStatus,
    };
    if (input.decision === "APPROVE" || input.decision === "PUBLISH") {
      sourceUpdate.verifiedAt = new Date();
    }
    await db
      .update(sourceRecords)
      .set(sourceUpdate)
      .where(eq(sourceRecords.id, current.sourceRecord.id));

    if (current.submission.userReportId) {
      await db
        .update(userReports)
        .set({ verificationStatus: notifyStatus, updatedAt: new Date() })
        .where(eq(userReports.id, current.submission.userReportId));
    }
  }

  await writeAudit(db, {
    userId: input.reviewer.id,
    action:
      input.decision === "PUBLISH"
        ? auditActions.SUBMISSION_PUBLISHED
        : auditActions.SUBMISSION_DECISION,
    entityType: "data_submission",
    entityId: input.submissionId,
    metadata: { decision: input.decision, fromStatus: from, toStatus: next },
    ipAddress: input.ipAddress,
  });

  // Resolve a conflict when one side of a conflicting pair is approved.
  if (
    input.decision === "APPROVE" &&
    current.submission.conflictWithId &&
    from === workflowStatusEnum.CONFLICT
  ) {
    const otherId = current.submission.conflictWithId;
    await db
      .update(dataSubmissions)
      .set({
        workflowStatus: workflowStatusEnum.REJECTED,
        reason: `Resolved in favour of submission ${input.submissionId}.`,
        updatedAt: new Date(),
      })
      .where(eq(dataSubmissions.id, otherId));

    const other = await loadWithProvenance(db, otherId);
    if (other) {
      await db.insert(verifications).values({
        id: randomUUID(),
        sourceRecordId: other.sourceRecord.id,
        submissionId: otherId,
        verifiedById: input.reviewer.id,
        decision: "REJECT",
        verificationStatus: "REJECTED",
        confidence: input.confidence ?? "UNKNOWN",
        note: `Resolved in favour of submission ${input.submissionId}.`,
        lastVerifiedAt: new Date(),
      });
      await writeAudit(db, {
        userId: input.reviewer.id,
        action: auditActions.SUBMISSION_DECISION,
        entityType: "data_submission",
        entityId: otherId,
        metadata: { decision: "REJECT", resolution: `accepted:${input.submissionId}` },
        ipAddress: input.ipAddress,
      });
    }
  }

  return loadWithProvenance(db, input.submissionId);
}

/** Serialisable shape for the public/API layer. */
export function serializeSubmission(
  row: NonNullable<Awaited<ReturnType<typeof loadWithProvenance>>>,
) {
  return {
    id: row.submission.id,
    targetType: row.submission.targetType,
    targetId: row.submission.targetId,
    payload: row.submission.payload,
    note: row.submission.note,
    reason: row.submission.reason,
    workflowStatus: row.submission.workflowStatus,
    conflictWithId: row.submission.conflictWithId,
    createdAt: row.submission.createdAt.toISOString(),
    updatedAt: row.submission.updatedAt.toISOString(),
    source: {
      id: row.source.id,
      name: row.source.name,
      sourceType: row.source.sourceType,
      organizationName: row.source.organizationName,
      referenceUrl: row.source.referenceUrl,
      reliability: row.source.reliability,
    },
    sourceRecord: {
      id: row.sourceRecord.id,
      collectedAt: row.sourceRecord.collectedAt.toISOString(),
      verifiedAt: row.sourceRecord.verifiedAt?.toISOString() ?? null,
      validUntil: row.sourceRecord.validUntil?.toISOString() ?? null,
      rawValue: row.sourceRecord.rawValue,
      verificationStatus: row.sourceRecord.verificationStatus,
    },
    submittedBy: row.submitter
      ? { id: row.submitter.id, email: row.submitter.email, name: row.submitter.name }
      : null,
  };
}
