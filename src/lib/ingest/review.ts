import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  dataSources,
  dataSubmissions,
  ingestionRuns,
  ingestionItems,
  ingestionChanges,
  sourceConflicts,
  sourceRecords,
  verifications,
  auditLogs,
  ingestionItemStatusEnum,
  ingestionItemDecisionEnum,
  sourceConflictStatusEnum,
  type IngestionItemDecision,
} from "@/lib/db/schema";
import { freshnessState, type FreshnessClass } from "@/lib/data-policy";
import { requirePermission, type Role } from "@/lib/auth/permissions";
import { writeAudit, auditActions } from "@/lib/auth/audit";
import { reviewSubmission, TrustError } from "@/lib/trust/workflow";

/**
 * INGESTION REVIEW SURFACE (Milestone 3B, Phase 4)
 * ================================================
 * Every ingestion item lands in PENDING_REVIEW. Authorized reviewers (AUTHORITY
 * / ADMIN via REVIEW_VERIFICATIONS) decide APPROVE / REJECT / UNAVAILABLE. The
 * decision is applied to the linked trust-workflow submission, so the existing
 * (permission-gated, verification-writing, audit-logging) path is reused — the
 * review never bypasses it.
 */

export interface DecideItemInput {
  itemId: string;
  reviewer: { id: string; role: Role | string };
  decision: IngestionItemDecision;
  reason?: string | null;
  confidence?: string | null;
  ipAddress?: string | null;
}

interface TargetFieldChange {
  field: string;
  kind: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface IngestionItemView {
  id: string;
  runId: string;
  sourceId: string;
  sourceName: string;
  entityType: string;
  entityId: string;
  name: string | null;
  category: string | null;
  districtName: string | null;
  locality: string | null;
  latitude: string | null;
  longitude: string | null;
  referenceUrl: string | null;
  rawData: Record<string, unknown> | null;
  normalizedData: Record<string, unknown> | null;
  status: string;
  decision: string;
  reason: string | null;
  reviewerId: string | null;
  decidedAt: Date | null;
  collectionTimestamp: Date;
  submissionId: string | null;
  submissionWorkflow: string | null;
  openConflicts: number;
  changes: TargetFieldChange[];
}

export function listItems(
  db: Database,
  opts: { status?: string; runId?: string; limit?: number } = {},
) {
  return loadItems(db, opts);
}

async function loadItems(
  db: Database,
  opts: { status?: string; runId?: string; limit?: number } = {},
): Promise<IngestionItemView[]> {
  const limit = Math.min(opts.limit ?? 200, 500);
  const conditions = [];
  if (opts.status) conditions.push(eq(ingestionItems.status, opts.status));
  if (opts.runId) conditions.push(eq(ingestionItems.runId, opts.runId));

  const rows = await db
    .select({
      item: ingestionItems,
      sourceName: dataSources.name,
      workflowStatus: dataSubmissions.workflowStatus,
    })
    .from(ingestionItems)
    .innerJoin(dataSources, eq(ingestionItems.sourceId, dataSources.id))
    .leftJoin(dataSubmissions, eq(ingestionItems.submissionId, dataSubmissions.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ingestionItems.createdAt))
    .limit(limit);

  const ids = rows.map((r) => r.item.id);
  const changesByItem = new Map<string, TargetFieldChange[]>();
  if (ids.length > 0) {
    const changes = await db
      .select()
      .from(ingestionChanges)
      .where(inArray(ingestionChanges.itemId, ids))
      .orderBy(asc(ingestionChanges.createdAt));
    for (const c of changes) {
      const list = changesByItem.get(c.itemId) ?? [];
      list.push({ field: c.field, kind: c.kind, oldValue: c.oldValue, newValue: c.newValue });
      changesByItem.set(c.itemId, list);
    }
  }

  // Open conflicts per entity (bulk).
  const entityKeys = new Set(rows.map((r) => `${r.item.entityType}:${r.item.entityId}`));
  const conflictCount = new Map<string, number>();
  if (entityKeys.size > 0) {
    const conflictRows = await db
      .select({
        entityType: sourceConflicts.entityType,
        entityId: sourceConflicts.entityId,
      })
      .from(sourceConflicts)
      .where(
        and(
          eq(sourceConflicts.status, sourceConflictStatusEnum.OPEN),
          inArray(
            sourceConflicts.entityId,
            [...entityKeys].map((k) => k.split(":").slice(1).join(":")),
          ),
        ),
      );
    for (const r of conflictRows) {
      const key = `${r.entityType}:${r.entityId}`;
      if (entityKeys.has(key)) {
        conflictCount.set(key, (conflictCount.get(key) ?? 0) + 1);
      }
    }
  }

  return rows.map((r) => {
    const item = r.item;
    return {
      id: item.id,
      runId: item.runId,
      sourceId: item.sourceId,
      sourceName: r.sourceName,
      entityType: item.entityType,
      entityId: item.entityId,
      name: item.name,
      category: item.category,
      districtName: item.districtName,
      locality: item.locality,
      latitude: item.latitude,
      longitude: item.longitude,
      referenceUrl: item.referenceUrl,
      rawData: safeJson(item.rawData),
      normalizedData: safeJson(item.normalizedData),
      status: item.status,
      decision: item.decision,
      reason: item.reason,
      reviewerId: item.reviewerId,
      decidedAt: item.decidedAt,
      collectionTimestamp: item.collectedAt,
      submissionId: item.submissionId,
      submissionWorkflow: r.workflowStatus ?? null,
      openConflicts: conflictCount.get(`${item.entityType}:${item.entityId}`) ?? 0,
      changes: changesByItem.get(item.id) ?? [],
    };
  });
}

function safeJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function decideItem(db: Database, input: DecideItemInput): Promise<boolean> {
  requirePermission(input.reviewer.role, "REVIEW_VERIFICATIONS");
  if (input.decision === ingestionItemDecisionEnum.NONE) {
    throw new TrustError("A review decision must be APPROVE, REJECT or UNAVAILABLE.");
  }

  const [item] = await db
    .select()
    .from(ingestionItems)
    .where(eq(ingestionItems.id, input.itemId))
    .limit(1);
  if (!item) throw new TrustError("Ingestion item not found.");
  if (item.status !== ingestionItemStatusEnum.PENDING_REVIEW) {
    throw new TrustError(
      `Only PENDING_REVIEW items can be decided (current status: ${item.status}).`,
    );
  }
  if (!item.submissionId) {
    throw new TrustError("This item has no linked submission and cannot be decided.");
  }

  // Apply via the trust workflow so provenance/verifications/audit all land.
  await reviewSubmission(db, {
    submissionId: item.submissionId,
    reviewer: input.reviewer,
    decision: input.decision as "APPROVE" | "REJECT" | "UNAVAILABLE",
    reason: input.reason ?? null,
    confidence: input.confidence ?? "UNKNOWN",
    ipAddress: input.ipAddress ?? null,
  });

  const nextStatus =
    input.decision === ingestionItemDecisionEnum.APPROVE
      ? ingestionItemStatusEnum.APPROVED
      : input.decision === ingestionItemDecisionEnum.REJECT
        ? ingestionItemStatusEnum.REJECTED
        : ingestionItemStatusEnum.UNAVAILABLE;

  await db
    .update(ingestionItems)
    .set({
      status: nextStatus,
      decision: input.decision,
      reviewerId: input.reviewer.id,
      decidedAt: new Date(),
      reason: input.reason?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(ingestionItems.id, input.itemId));

  await writeAudit(db, {
    userId: input.reviewer.id,
    action: auditActions.INGESTION_ITEM_DECIDED,
    entityType: "ingestion_item",
    entityId: input.itemId,
    metadata: { decision: input.decision, toStatus: nextStatus },
    ipAddress: input.ipAddress,
  });

  return true;
}

export interface IngestionRunView {
  id: string;
  sourceId: string;
  sourceName: string;
  status: string;
  urls: string[];
  fetchedUrl: string | null;
  httpStatus: number | null;
  contentType: string | null;
  discoveredCount: number;
  importedCount: number;
  reviewRequiredCount: number;
  duplicateCount: number;
  rejectedCount: number;
  unavailableCount: number;
  error: string | null;
  note: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export async function listRuns(
  db: Database,
  opts: { status?: string; limit?: number } = {},
): Promise<IngestionRunView[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const where = opts.status ? eq(ingestionRuns.status, opts.status) : undefined;
  const rows = await db
    .select({ run: ingestionRuns, sourceName: dataSources.name })
    .from(ingestionRuns)
    .innerJoin(dataSources, eq(ingestionRuns.sourceId, dataSources.id))
    .where(where)
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.run.id,
    sourceId: r.run.sourceId,
    sourceName: r.sourceName,
    status: r.run.status,
    urls: safeJsonArray(r.run.urls),
    fetchedUrl: r.run.fetchedUrl,
    httpStatus: r.run.httpStatus,
    contentType: r.run.contentType,
    discoveredCount: r.run.discoveredCount,
    importedCount: r.run.importedCount,
    reviewRequiredCount: r.run.reviewRequiredCount,
    duplicateCount: r.run.duplicateCount,
    rejectedCount: r.run.rejectedCount,
    unavailableCount: r.run.unavailableCount,
    error: r.run.error,
    note: r.run.note,
    startedAt: r.run.startedAt,
    finishedAt: r.run.finishedAt,
  }));
}

function safeJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// --- Item detail (Milestone 3C) ----------------------------------------------
// One item's FULL review surface: the item itself, its audit trail, any open
// conflicts with both sides' provenance (sources + reference URLs), duplicate
// records of the same entity, source-registry metadata, freshness of the
// underlying source record, and the verification trail.

export interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ConflictPair {
  id: string;
  status: string;
  resolution: string;
  note: string | null;
  resolutionNote: string | null;
  createdAt: Date;
  valueA: Record<string, unknown> | null;
  valueB: Record<string, unknown> | null;
  recordAId: string;
  recordBId: string;
  sourceAName: string | null;
  sourceBName: string | null;
  referenceUrlA: string | null;
  referenceUrlB: string | null;
  rawValueA: string | null;
  rawValueB: string | null;
}

export interface DuplicateInfo {
  itemId: string;
  sourceName: string;
  name: string | null;
  status: string;
  createdAt: Date;
}

export interface FreshnessInfo {
  freshnessClass: string;
  collectionTimestamp: Date;
  validityWindow: { validFrom: Date | null; validUntil: Date | null };
  verifiedAt: Date | null;
  verificationStatus: string | null;
  state: string;
}

export interface VerificationInfo {
  id: string;
  decision: string | null;
  verificationStatus: string;
  confidence: string;
  note: string | null;
  createdAt: Date;
}

export interface ItemSourceMetadata {
  id: string;
  name: string;
  organizationName: string | null;
  sourceType: string | null;
  accessMethod: string | null;
  updateFrequency: string | null;
  freshnessClass: string | null;
  license: string | null;
  usageTerms: string | null;
  referenceUrl: string | null;
  ingestionStatus: string | null;
  reliability: string | null;
  isActive: boolean;
  isInternal: boolean;
}

export interface IngestionItemDetail extends IngestionItemView {
  source: ItemSourceMetadata;
  audits: AuditEntry[];
  conflicts: ConflictPair[];
  duplicates: DuplicateInfo[];
  freshness: FreshnessInfo;
  verifications: VerificationInfo[];
}

export async function getItemDetail(db: Database, itemId: string): Promise<IngestionItemDetail> {
  const [row] = await db
    .select({
      item: ingestionItems,
      sourceName: dataSources.name,
      workflowStatus: dataSubmissions.workflowStatus,
    })
    .from(ingestionItems)
    .innerJoin(dataSources, eq(ingestionItems.sourceId, dataSources.id))
    .leftJoin(dataSubmissions, eq(ingestionItems.submissionId, dataSubmissions.id))
    .where(eq(ingestionItems.id, itemId))
    .limit(1);
  if (!row) throw new TrustError("Ingestion item not found.");

  const item = row.item;
  const base: IngestionItemView = {
    id: item.id,
    runId: item.runId,
    sourceId: item.sourceId,
    sourceName: row.sourceName,
    entityType: item.entityType,
    entityId: item.entityId,
    name: item.name,
    category: item.category,
    districtName: item.districtName,
    locality: item.locality,
    latitude: item.latitude,
    longitude: item.longitude,
    referenceUrl: item.referenceUrl,
    rawData: safeJson(item.rawData),
    normalizedData: safeJson(item.normalizedData),
    status: item.status,
    decision: item.decision,
    reason: item.reason,
    reviewerId: item.reviewerId,
    decidedAt: item.decidedAt,
    collectionTimestamp: item.collectedAt,
    submissionId: item.submissionId,
    submissionWorkflow: row.workflowStatus ?? null,
    openConflicts: 0,
    changes: [],
  };

  const [freshness, audits, conflicts, duplicates, verificationsList, sourceMeta] =
    await Promise.all([
      loadFreshness(db, item),
      loadAudits(db, item),
      loadConflicts(db, item),
      loadDuplicates(db, item),
      loadVerifications(db, item),
      loadSourceMetadata(db, item.sourceId),
    ]);

  base.openConflicts = conflicts.filter((c) => c.status === sourceConflictStatusEnum.OPEN).length;
  const changes = await db
    .select()
    .from(ingestionChanges)
    .where(eq(ingestionChanges.itemId, itemId))
    .orderBy(asc(ingestionChanges.createdAt));
  base.changes = changes.map((c) => ({
    field: c.field,
    kind: c.kind,
    oldValue: c.oldValue,
    newValue: c.newValue,
  }));

  return {
    ...base,
    source: sourceMeta,
    audits,
    conflicts,
    duplicates,
    freshness,
    verifications: verificationsList,
  };
}

async function loadSourceMetadata(db: Database, sourceId: string): Promise<ItemSourceMetadata> {
  const [s] = await db.select().from(dataSources).where(eq(dataSources.id, sourceId)).limit(1);
  return {
    id: s.id,
    name: s.name,
    organizationName: s.organizationName,
    sourceType: s.sourceType,
    accessMethod: s.accessMethod,
    updateFrequency: s.updateFrequency,
    freshnessClass: s.freshnessClass,
    license: s.license,
    usageTerms: s.usageTerms,
    referenceUrl: s.referenceUrl,
    ingestionStatus: s.ingestionStatus,
    reliability: s.reliability,
    isActive: s.isActive,
    isInternal: s.isInternal,
  };
}

async function loadAudits(
  db: Database,
  item: typeof ingestionItems.$inferSelect,
): Promise<AuditEntry[]> {
  const ids = [item.id];
  if (item.submissionId) ids.push(item.submissionId);
  const rows = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        inArray(auditLogs.entityId, ids),
        inArray(auditLogs.entityType, ["ingestion_item", "data_submission", "source_record"]),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);
  return rows
    .filter(
      (a) => a.entityId === item.id || (item.submissionId && a.entityId === item.submissionId),
    )
    .map((a) => ({
      id: a.id,
      userId: a.userId,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      metadata: safeJson(a.metadata),
      createdAt: a.createdAt,
    }));
}

async function loadConflicts(
  db: Database,
  item: typeof ingestionItems.$inferSelect,
): Promise<ConflictPair[]> {
  const conflicts = await db
    .select()
    .from(sourceConflicts)
    .where(
      and(
        eq(sourceConflicts.entityType, item.entityType),
        eq(sourceConflicts.entityId, item.entityId),
      ),
    )
    .orderBy(desc(sourceConflicts.createdAt))
    .limit(100);

  if (conflicts.length === 0) return [];

  const recordIds = conflicts.flatMap((c) => [c.recordAId, c.recordBId]);
  const recordMeta = new Map<
    string,
    { sourceName: string | null; referenceUrl: string | null; rawValue: string | null }
  >();
  if (recordIds.length > 0) {
    const records = await db
      .select({
        id: sourceRecords.id,
        sourceName: dataSources.name,
        referenceUrl: sourceRecords.referenceUrl,
        rawValue: sourceRecords.rawValue,
      })
      .from(sourceRecords)
      .innerJoin(dataSources, eq(sourceRecords.dataSourceId, dataSources.id))
      .where(inArray(sourceRecords.id, recordIds));
    for (const r of records) {
      recordMeta.set(r.id, {
        sourceName: r.sourceName,
        referenceUrl: r.referenceUrl,
        rawValue: r.rawValue,
      });
    }
  }

  return conflicts.map((c) => {
    const a = recordMeta.get(c.recordAId);
    const b = recordMeta.get(c.recordBId);
    return {
      id: c.id,
      status: c.status,
      resolution: c.resolution,
      note: c.note,
      resolutionNote: c.resolutionNote,
      createdAt: c.createdAt,
      valueA: safeJson(c.valueA),
      valueB: safeJson(c.valueB),
      recordAId: c.recordAId,
      recordBId: c.recordBId,
      sourceAName: a?.sourceName ?? null,
      sourceBName: b?.sourceName ?? null,
      referenceUrlA: a?.referenceUrl ?? null,
      referenceUrlB: b?.referenceUrl ?? null,
      rawValueA: a?.rawValue ?? null,
      rawValueB: b?.rawValue ?? null,
    };
  });
}

async function loadDuplicates(
  db: Database,
  item: typeof ingestionItems.$inferSelect,
): Promise<DuplicateInfo[]> {
  const rows = await db
    .select({
      id: ingestionItems.id,
      sourceName: dataSources.name,
      name: ingestionItems.name,
      status: ingestionItems.status,
      createdAt: ingestionItems.createdAt,
    })
    .from(ingestionItems)
    .innerJoin(dataSources, eq(ingestionItems.sourceId, dataSources.id))
    .where(
      and(
        eq(ingestionItems.entityId, item.entityId),
        eq(ingestionItems.status, ingestionItemStatusEnum.SKIPPED_DUPLICATE),
        sql`${ingestionItems.id} <> ${item.id}`,
      ),
    )
    .orderBy(desc(ingestionItems.createdAt))
    .limit(50);
  return rows.map((r) => ({
    itemId: r.id,
    sourceName: r.sourceName,
    name: r.name,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

async function loadVerifications(
  db: Database,
  item: typeof ingestionItems.$inferSelect,
): Promise<VerificationInfo[]> {
  if (!item.submissionId) return [];
  const rows = await db
    .select()
    .from(verifications)
    .where(eq(verifications.submissionId, item.submissionId))
    .orderBy(desc(verifications.createdAt))
    .limit(50);
  return rows.map((v) => ({
    id: v.id,
    decision: v.decision,
    verificationStatus: v.verificationStatus,
    confidence: v.confidence,
    note: v.note,
    createdAt: v.createdAt,
  }));
}

async function loadFreshness(
  db: Database,
  item: typeof ingestionItems.$inferSelect,
): Promise<FreshnessInfo> {
  const [src] = await db
    .select({ freshnessClass: dataSources.freshnessClass })
    .from(dataSources)
    .where(eq(dataSources.id, item.sourceId))
    .limit(1);

  let verifiedAt: Date | null = null;
  let validFrom: Date | null = null;
  let validUntil: Date | null = null;
  let verificationStatus: string | null = null;

  if (item.submissionId) {
    const [sub] = await db
      .select({
        sourceRecordId: dataSubmissions.sourceRecordId,
        createdAt: dataSubmissions.createdAt,
      })
      .from(dataSubmissions)
      .where(eq(dataSubmissions.id, item.submissionId))
      .limit(1);
    if (sub?.sourceRecordId) {
      const [rec] = await db
        .select({
          validFrom: sourceRecords.validFrom,
          validUntil: sourceRecords.validUntil,
          verifiedAt: sourceRecords.verifiedAt,
          verificationStatus: sourceRecords.verificationStatus,
        })
        .from(sourceRecords)
        .where(eq(sourceRecords.id, sub.sourceRecordId))
        .limit(1);
      if (rec) {
        validFrom = rec.validFrom;
        validUntil = rec.validUntil;
        verifiedAt = rec.verifiedAt;
        verificationStatus = rec.verificationStatus;
      }
    }
  }

  const state = freshnessState({
    verifiedAt,
    validFrom,
    validUntil,
    freshnessClass: (src?.freshnessClass as FreshnessClass) ?? "default",
  });

  return {
    freshnessClass: src?.freshnessClass ?? "default",
    collectionTimestamp: item.collectedAt,
    validityWindow: { validFrom, validUntil },
    verifiedAt,
    verificationStatus,
    state,
  };
}
