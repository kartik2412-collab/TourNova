import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  dataSources,
  dataSubmissions,
  priceRecords,
  priceTypeEnum,
  sourceClassificationEnum,
  sourceRecords,
  users,
  verificationStatusEnum,
  workflowStatusEnum,
  type ReviewDecision,
} from "@/lib/db/schema";
import type { Database } from "@/lib/db";
import { reviewSubmission } from "@/lib/trust/workflow";
import { requirePermission, type Role } from "@/lib/auth/permissions";
import { writeAudit, auditActions } from "@/lib/auth/audit";

/**
 * PRICE REPORTS (Milestone 6 residual — capture → review)
 * --------------------------------------------------------
 * A community price report is a CLAIM, never a fact. It is stored as an
 * unverified price record (priceType = USER_REPORT, verificationStatus =
 * USER_REPORTED) linked to the per-user source + source record + submission,
 * so a reviewer can decide it through the normal trust workflow. Only after a
 * reviewer APPROVEs does the record become VERIFIED and therefore visible on
 * the public /fairprice page. REJECT / REOPEN / UNAVAILABLE never surface it.
 */

export class PriceReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceReportError";
  }
}

/** Display status applied to the price record by each reviewer decision. */
const PRICE_STATUS_BY_DECISION: Record<string, string> = {
  APPROVE: verificationStatusEnum.VERIFIED,
  REJECT: "REJECTED",
  REOPEN: verificationStatusEnum.USER_REPORTED,
  UNAVAILABLE: verificationStatusEnum.UNAVAILABLE,
};

export type PriceDecision = "APPROVE" | "REJECT" | "REOPEN" | "UNAVAILABLE";

export interface SubmitPriceReportInput {
  userId: string;
  userEmail: string;
  userName?: string | null;
  targetType: string;
  targetId: string;
  category: string;
  amount: number;
  currency: string;
  description?: string | null;
  note?: string | null;
  ipAddress?: string | null;
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

export interface PriceReportSubmitted {
  id: string;
  priceRecordId: string;
  submissionId: string;
  targetType: string;
  targetId: string;
  category: string;
  amount: number;
  currency: string;
  verificationStatus: string;
  workflowStatus: string;
}

export async function submitPriceReport(
  db: Database,
  input: SubmitPriceReportInput,
): Promise<PriceReportSubmitted> {
  const payload = JSON.stringify({
    amount: input.amount,
    currency: input.currency,
    category: input.category,
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

  const priceRecordId = randomUUID();
  await db.insert(priceRecords).values({
    id: priceRecordId,
    targetType: input.targetType,
    targetId: input.targetId,
    category: input.category,
    priceType: priceTypeEnum.USER_REPORT,
    amount: input.amount.toString(),
    currency: input.currency,
    description: input.description ?? null,
    verificationStatus: verificationStatusEnum.USER_REPORTED,
    sourceRecordId,
  });

  await writeAudit(db, {
    userId: input.userId,
    action: auditActions.PRICE_REPORT_SUBMITTED,
    entityType: "price_record",
    entityId: priceRecordId,
    metadata: {
      targetType: input.targetType,
      targetId: input.targetId,
      category: input.category,
      amount: input.amount,
      currency: input.currency,
    },
    ipAddress: input.ipAddress,
  });

  return {
    id: priceRecordId,
    priceRecordId,
    submissionId,
    targetType: input.targetType,
    targetId: input.targetId,
    category: input.category,
    amount: input.amount,
    currency: input.currency,
    verificationStatus: verificationStatusEnum.USER_REPORTED,
    workflowStatus: workflowStatusEnum.SUBMITTED,
  };
}

export interface AdminPriceReportView {
  id: string;
  targetType: string;
  targetId: string;
  category: string;
  amount: number;
  currency: string;
  description: string | null;
  note: string | null;
  priceType: string;
  verificationStatus: string;
  workflowStatus: string;
  sourceName: string;
  submitterEmail: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
}

export async function listPriceReports(
  db: Database,
  opts: { limit?: number } = {},
): Promise<AdminPriceReportView[]> {
  const limit = Math.min(opts.limit ?? 200, 200);
  const rows = await db
    .select({
      id: priceRecords.id,
      targetType: priceRecords.targetType,
      targetId: priceRecords.targetId,
      category: priceRecords.category,
      amount: priceRecords.amount,
      currency: priceRecords.currency,
      description: priceRecords.description,
      note: dataSubmissions.note,
      priceType: priceRecords.priceType,
      verificationStatus: priceRecords.verificationStatus,
      workflowStatus: dataSubmissions.workflowStatus,
      sourceName: dataSources.name,
      submitterEmail: users.email,
      submittedAt: priceRecords.createdAt,
      decidedAt: dataSubmissions.updatedAt,
    })
    .from(priceRecords)
    .innerJoin(sourceRecords, eq(priceRecords.sourceRecordId, sourceRecords.id))
    .innerJoin(dataSources, eq(sourceRecords.dataSourceId, dataSources.id))
    .innerJoin(dataSubmissions, eq(dataSubmissions.sourceRecordId, sourceRecords.id))
    .leftJoin(users, eq(dataSubmissions.submittedById, users.id))
    .where(eq(priceRecords.priceType, priceTypeEnum.USER_REPORT))
    .orderBy(desc(priceRecords.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    decidedAt:
      r.decidedAt && r.workflowStatus !== workflowStatusEnum.SUBMITTED ? r.decidedAt : null,
  }));
}

export interface DecidePriceReportInput {
  priceRecordId: string;
  reviewer: { id: string; role: Role | string };
  decision: PriceDecision;
  note?: string | null;
  ipAddress?: string | null;
}

export async function decidePriceReport(
  db: Database,
  input: DecidePriceReportInput,
): Promise<{ id: string; verificationStatus: string }> {
  requirePermission(input.reviewer.role, "REVIEW_VERIFICATIONS");

  const [record] = await db
    .select({
      id: priceRecords.id,
      priceType: priceRecords.priceType,
      sourceRecordId: priceRecords.sourceRecordId,
    })
    .from(priceRecords)
    .where(eq(priceRecords.id, input.priceRecordId))
    .limit(1);
  if (!record) throw new PriceReportError("Price report not found.");
  if (record.priceType !== priceTypeEnum.USER_REPORT) {
    throw new PriceReportError("Only user price reports can be decided through this flow.");
  }
  if (!record.sourceRecordId) throw new PriceReportError("Price report has no provenance.");

  const [submission] = await db
    .select({ id: dataSubmissions.id })
    .from(dataSubmissions)
    .where(eq(dataSubmissions.sourceRecordId, record.sourceRecordId))
    .limit(1);
  if (!submission) throw new PriceReportError("Price report has no linked submission.");

  const decision = input.decision as ReviewDecision;

  await reviewSubmission(db, {
    submissionId: submission.id,
    reviewer: input.reviewer,
    decision,
    reason: input.note ?? null,
    ipAddress: input.ipAddress ?? null,
  });

  await db
    .update(priceRecords)
    .set({
      verificationStatus: PRICE_STATUS_BY_DECISION[input.decision],
      updatedAt: new Date(),
    })
    .where(eq(priceRecords.id, input.priceRecordId));

  await writeAudit(db, {
    userId: input.reviewer.id,
    action: auditActions.PRICE_REPORT_DECIDED,
    entityType: "price_record",
    entityId: input.priceRecordId,
    metadata: { decision: input.decision },
    ipAddress: input.ipAddress,
  });

  return { id: input.priceRecordId, verificationStatus: PRICE_STATUS_BY_DECISION[input.decision] };
}
