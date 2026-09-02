import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  crowdObservations,
  crowdSourceEnum,
  dataSources,
  dataSubmissions,
  sourceClassificationEnum,
  sourceRecords,
  users,
  verificationStatusEnum,
  workflowStatusEnum,
  type ReviewDecision,
} from "@/lib/db/schema";
import type { Database } from "@/lib/db";
import { freshnessState, type FreshnessState } from "@/lib/data-policy";
import { reviewSubmission } from "@/lib/trust/workflow";
import { requirePermission, type Role } from "@/lib/auth/permissions";
import { writeAudit, auditActions } from "@/lib/auth/audit";

/**
 * PUBLIC CROWD CATALOG (Milestone 7 — Crowd Intelligence)
 * --------------------------------------------------------
 * Public users receive ONLY verified or live crowd observations.
 * Unverified community claims remain hidden in USER_REPORTED status until an
 * administrator reviews and approves them.
 */

export const PUBLIC_CROWD_STATUSES = [
  verificationStatusEnum.VERIFIED,
  verificationStatusEnum.LIVE,
] as const;

export class CrowdReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrowdReportError";
  }
}

const CROWD_STATUS_BY_DECISION: Record<string, string> = {
  APPROVE: verificationStatusEnum.VERIFIED,
  REJECT: "REJECTED",
  REOPEN: verificationStatusEnum.USER_REPORTED,
  UNAVAILABLE: verificationStatusEnum.UNAVAILABLE,
};

export type CrowdDecision = "APPROVE" | "REJECT" | "REOPEN" | "UNAVAILABLE";

export interface PublicCrowdObservation {
  id: string;
  attractionId: string;
  sourceType: string;
  count: number | null;
  capacity: number | null;
  crowdLevel: number | null;
  locale: string;
  capturedAt: Date;
  verifiedAt: Date | null;
  isDemo: boolean;
  freshness: FreshnessState;
  source: {
    id: string;
    name: string;
    organizationName: string | null;
    reliability: string;
  };
}

export interface CrowdListOptions {
  entityId?: string;
}

const crowdSelect = {
  id: crowdObservations.id,
  attractionId: crowdObservations.attractionId,
  sourceType: crowdObservations.sourceType,
  count: crowdObservations.count,
  capacity: crowdObservations.capacity,
  crowdLevel: crowdObservations.crowdLevel,
  locale: crowdObservations.locale,
  capturedAt: crowdObservations.capturedAt,
  isDemo: crowdObservations.isDemo,
  verifiedAt: sourceRecords.verifiedAt,
  sourceId: sourceRecords.dataSourceId,
  sourceName: dataSources.name,
  organizationName: dataSources.organizationName,
  sourceReliability: dataSources.reliability,
} as const;

export async function listPublicCrowd(
  db: Database,
  opts: CrowdListOptions = {},
): Promise<PublicCrowdObservation[]> {
  const conditions = [inArray(crowdObservations.verificationStatus, PUBLIC_CROWD_STATUSES)];
  if (opts.entityId?.trim()) {
    conditions.push(eq(crowdObservations.attractionId, opts.entityId.trim()));
  }

  const rows = await db
    .select(crowdSelect)
    .from(crowdObservations)
    .innerJoin(sourceRecords, eq(crowdObservations.sourceRecordId, sourceRecords.id))
    .innerJoin(dataSources, eq(sourceRecords.dataSourceId, dataSources.id))
    .where(and(...conditions))
    .orderBy(desc(crowdObservations.capturedAt));

  return rows.map((r) => ({
    id: r.id,
    attractionId: r.attractionId,
    sourceType: r.sourceType,
    count: r.count,
    capacity: r.capacity,
    crowdLevel: r.crowdLevel,
    locale: r.locale,
    capturedAt: r.capturedAt,
    verifiedAt: r.verifiedAt,
    isDemo: r.isDemo,
    freshness: freshnessState({
      verifiedAt: r.verifiedAt ?? r.capturedAt,
      freshnessClass: "crowd",
    }),
    source: {
      id: r.sourceId,
      name: r.sourceName,
      organizationName: r.organizationName ?? null,
      reliability: r.sourceReliability,
    },
  }));
}

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

export interface SubmitCrowdReportInput {
  userId: string;
  userEmail: string;
  userName?: string | null;
  targetType: string;
  targetId: string;
  crowdLevel?: number | null;
  count?: number | null;
  capacity?: number | null;
  description?: string | null;
  note?: string | null;
  ipAddress?: string | null;
}

export interface CrowdReportSubmitted {
  id: string;
  observationId: string;
  submissionId: string;
  targetType: string;
  targetId: string;
  crowdLevel: number | null;
  count: number | null;
  capacity: number | null;
  verificationStatus: string;
  workflowStatus: string;
}

export async function submitCrowdReport(
  db: Database,
  input: SubmitCrowdReportInput,
): Promise<CrowdReportSubmitted> {
  const payload = JSON.stringify({
    crowdLevel: input.crowdLevel ?? null,
    count: input.count ?? null,
    capacity: input.capacity ?? null,
    description: input.description ?? "",
  });

  const sourceId = await ensureUserSource(db, {
    id: input.userId,
    email: input.userEmail,
    name: input.userName,
  });

  const sourceRecordId = randomUUID();
  await db.insert(sourceRecords).values({
    id: sourceRecordId,
    dataSourceId: sourceId,
    entityType: input.targetType,
    entityId: input.targetId,
    rawValue: payload,
    value: payload,
    verificationStatus: verificationStatusEnum.USER_REPORTED,
  });

  const submissionId = randomUUID();
  await db.insert(dataSubmissions).values({
    id: submissionId,
    sourceRecordId,
    submittedById: input.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    payload,
    note: input.note ?? null,
    workflowStatus: workflowStatusEnum.SUBMITTED,
  });

  const observationId = randomUUID();
  await db.insert(crowdObservations).values({
    id: observationId,
    attractionId: input.targetId,
    sourceType: crowdSourceEnum.USER_REPORTED,
    count: input.count ?? null,
    capacity: input.capacity ?? null,
    crowdLevel: input.crowdLevel ?? null,
    verificationStatus: verificationStatusEnum.USER_REPORTED,
    sourceRecordId,
    capturedAt: new Date(),
  });

  await writeAudit(db, {
    userId: input.userId,
    action: auditActions.CROWD_REPORT_SUBMITTED,
    entityType: "crowd_observation",
    entityId: observationId,
    metadata: {
      targetType: input.targetType,
      targetId: input.targetId,
      crowdLevel: input.crowdLevel ?? null,
      count: input.count ?? null,
    },
    ipAddress: input.ipAddress,
  });

  return {
    id: observationId,
    observationId,
    submissionId,
    targetType: input.targetType,
    targetId: input.targetId,
    crowdLevel: input.crowdLevel ?? null,
    count: input.count ?? null,
    capacity: input.capacity ?? null,
    verificationStatus: verificationStatusEnum.USER_REPORTED,
    workflowStatus: workflowStatusEnum.SUBMITTED,
  };
}

export interface AdminCrowdReportView {
  id: string;
  attractionId: string;
  sourceType: string;
  crowdLevel: number | null;
  count: number | null;
  capacity: number | null;
  note: string | null;
  verificationStatus: string;
  workflowStatus: string;
  sourceName: string;
  submitterEmail: string | null;
  capturedAt: Date;
  submittedAt: Date;
  decidedAt: Date | null;
}

export async function listCrowdReports(
  db: Database,
  opts: { limit?: number } = {},
): Promise<AdminCrowdReportView[]> {
  const limit = Math.min(opts.limit ?? 200, 200);
  const rows = await db
    .select({
      id: crowdObservations.id,
      attractionId: crowdObservations.attractionId,
      sourceType: crowdObservations.sourceType,
      crowdLevel: crowdObservations.crowdLevel,
      count: crowdObservations.count,
      capacity: crowdObservations.capacity,
      note: dataSubmissions.note,
      verificationStatus: crowdObservations.verificationStatus,
      workflowStatus: dataSubmissions.workflowStatus,
      sourceName: dataSources.name,
      submitterEmail: users.email,
      capturedAt: crowdObservations.capturedAt,
      submittedAt: crowdObservations.createdAt,
      decidedAt: dataSubmissions.updatedAt,
    })
    .from(crowdObservations)
    .innerJoin(sourceRecords, eq(crowdObservations.sourceRecordId, sourceRecords.id))
    .innerJoin(dataSources, eq(sourceRecords.dataSourceId, dataSources.id))
    .innerJoin(dataSubmissions, eq(dataSubmissions.sourceRecordId, sourceRecords.id))
    .leftJoin(users, eq(dataSubmissions.submittedById, users.id))
    .where(eq(crowdObservations.sourceType, crowdSourceEnum.USER_REPORTED))
    .orderBy(desc(crowdObservations.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    decidedAt:
      r.decidedAt && r.workflowStatus !== workflowStatusEnum.SUBMITTED ? r.decidedAt : null,
  }));
}

export interface DecideCrowdReportInput {
  observationId: string;
  reviewer: { id: string; role: Role | string };
  decision: CrowdDecision;
  note?: string | null;
  ipAddress?: string | null;
}

export async function decideCrowdReport(
  db: Database,
  input: DecideCrowdReportInput,
): Promise<{ id: string; verificationStatus: string }> {
  requirePermission(input.reviewer.role, "REVIEW_VERIFICATIONS");

  const [record] = await db
    .select({
      id: crowdObservations.id,
      sourceType: crowdObservations.sourceType,
      sourceRecordId: crowdObservations.sourceRecordId,
    })
    .from(crowdObservations)
    .where(eq(crowdObservations.id, input.observationId))
    .limit(1);
  if (!record) throw new CrowdReportError("Crowd report not found.");
  if (record.sourceType !== crowdSourceEnum.USER_REPORTED) {
    throw new CrowdReportError("Only user crowd reports can be decided through this flow.");
  }
  if (!record.sourceRecordId) throw new CrowdReportError("Crowd report has no provenance.");

  const [submission] = await db
    .select({ id: dataSubmissions.id })
    .from(dataSubmissions)
    .where(eq(dataSubmissions.sourceRecordId, record.sourceRecordId))
    .limit(1);
  if (!submission) throw new CrowdReportError("Crowd report has no linked submission.");

  const decision = input.decision as ReviewDecision;

  await reviewSubmission(db, {
    submissionId: submission.id,
    reviewer: input.reviewer,
    decision,
    reason: input.note ?? null,
    ipAddress: input.ipAddress ?? null,
  });

  await db
    .update(crowdObservations)
    .set({
      verificationStatus: CROWD_STATUS_BY_DECISION[input.decision],
      updatedAt: new Date(),
    })
    .where(eq(crowdObservations.id, input.observationId));

  await writeAudit(db, {
    userId: input.reviewer.id,
    action: auditActions.CROWD_REPORT_DECIDED,
    entityType: "crowd_observation",
    entityId: input.observationId,
    metadata: { decision: input.decision },
    ipAddress: input.ipAddress,
  });

  return {
    id: input.observationId,
    verificationStatus: CROWD_STATUS_BY_DECISION[input.decision],
  };
}
