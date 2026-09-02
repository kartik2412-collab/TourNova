import { and, asc, count, desc, eq, ilike, inArray, not, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  attractions,
  destinations,
  districts,
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
  workflowStatusEnum,
  type IngestionItemDecision,
} from "@/lib/db/schema";
import { freshnessState, type FreshnessClass } from "@/lib/data-policy";
import { requirePermission, permissions, type Role } from "@/lib/auth/permissions";
import { writeAudit, auditActions } from "@/lib/auth/audit";
import { reviewSubmission, TrustError } from "@/lib/trust/workflow";
import { MAX_BATCH_REVIEW_SIZE } from "@/lib/validation";

/**
 * INGESTION REVIEW SURFACE (Milestone 3B, Phases 4 + Chunk 4)
 * ===========================================================
 * Every ingestion item lands in PENDING_REVIEW. The review queue is served to
 * ADMINs (ADMIN-only MANAGE_INGESTION — Chunk 4) with pagination, filters,
 * text search and deterministic ordering. Decisions are APPROVE / REJECT /
 * UNAVAILABLE and are applied through the existing trust workflow (permission-
 * gated, verification-writing, audit-logging) — the review never bypasses it.
 *
 * SAFETY (Chunk 4):
 *  - Batch review is all-or-nothing and capped at MAX_BATCH_REVIEW_SIZE.
 *  - APPROVE is blocked while the item's source record is one side of an OPEN
 *    `source_conflicts` row: a winner is never picked behind the human's back.
 *    The conflict must be resolved first (KEEP_A / KEEP_B / REJECT_BOTH).
 *  - An item whose submission was retired by a conflict resolution can be
 *    mirrored to REJECTED / UNAVAILABLE (never APPROVED) so the queue stays
 *    clear without ever publishing the losing side.
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

export interface ReviewQueueOpts {
  status?: string;
  runId?: string;
  sourceId?: string;
  entityType?: string;
  search?: string;
  conflict?: "open" | "none" | "any";
  page?: number;
  limit?: number;
}

export interface ReviewQueuePage {
  items: IngestionItemView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Queue items are ordered deterministically (created_at DESC, id ASC) so any
 * page boundary is stable across refreshes. `conflict=open` keeps only items
 * whose entity has an OPEN `source_conflicts` row; `conflict=none` excludes
 * them; `any` (default) applies no conflict filter.
 */
export function listItems(
  db: Database,
  opts: Omit<ReviewQueueOpts, "conflict"> & { conflict?: ReviewQueueOpts["conflict"] } = {},
): Promise<IngestionItemView[]> {
  return listReviewQueue(db, opts).then((p) => p.items);
}

export async function listReviewQueue(
  db: Database,
  opts: ReviewQueueOpts = {},
): Promise<ReviewQueuePage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(opts.limit ?? 200, 500);
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [];
  if (opts.status) conditions.push(eq(ingestionItems.status, opts.status));
  if (opts.runId) conditions.push(eq(ingestionItems.runId, opts.runId));
  if (opts.sourceId) conditions.push(eq(ingestionItems.sourceId, opts.sourceId));
  if (opts.entityType) conditions.push(eq(ingestionItems.entityType, opts.entityType));
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    const searchCond = or(
      ilike(ingestionItems.name, q),
      ilike(ingestionItems.entityId, q),
      ilike(ingestionItems.locality, q),
      ilike(ingestionItems.districtName, q),
    );
    if (searchCond) conditions.push(searchCond);
  }

  const conflictFilter = opts.conflict ?? "any";
  if (conflictFilter !== "any") {
    const openPairs = await loadOpenConflictPairs(db);
    if (conflictFilter === "open" && openPairs.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }
    if (openPairs.length > 0) {
      const openCond = or(
        ...openPairs.map((p) =>
          and(eq(ingestionItems.entityType, p.entityType), eq(ingestionItems.entityId, p.entityId)),
        ),
      );
      if (openCond) {
        conditions.push(conflictFilter === "open" ? openCond : not(openCond));
      }
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totals] = await db.select({ n: count() }).from(ingestionItems).where(where);
  const total = totals?.n ?? 0;

  const rows = await db
    .select({
      item: ingestionItems,
      sourceName: dataSources.name,
      workflowStatus: dataSubmissions.workflowStatus,
    })
    .from(ingestionItems)
    .innerJoin(dataSources, eq(ingestionItems.sourceId, dataSources.id))
    .leftJoin(dataSubmissions, eq(ingestionItems.submissionId, dataSubmissions.id))
    .where(where)
    .orderBy(desc(ingestionItems.createdAt), asc(ingestionItems.id))
    .limit(pageSize)
    .offset(offset);

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

  const items = rows.map((r) => {
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

  return { items, total, page, pageSize };
}

/** Distinct (entityType, entityId) pairs that currently hold an OPEN conflict. */
async function loadOpenConflictPairs(
  db: Database,
): Promise<Array<{ entityType: string; entityId: string }>> {
  const rows = await db
    .select({
      entityType: sourceConflicts.entityType,
      entityId: sourceConflicts.entityId,
    })
    .from(sourceConflicts)
    .where(eq(sourceConflicts.status, sourceConflictStatusEnum.OPEN));
  const seen = new Set<string>();
  const pairs: Array<{ entityType: string; entityId: string }> = [];
  for (const r of rows) {
    const key = `${r.entityType}:${r.entityId}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ entityType: r.entityType, entityId: r.entityId });
    }
  }
  return pairs;
}

function safeJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseDescriptionFromBlobs(
  normalizedData: string | null,
  rawData: string | null,
): string | null {
  const candidates = [normalizedData, rawData];
  for (const blob of candidates) {
    if (!blob) continue;
    try {
      const parsed = JSON.parse(blob) as Record<string, unknown>;
      for (const key of ["description", "overview", "summary"]) {
        const value = parsed[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    } catch {}
  }
  return null;
}

export async function syncRelationalEntity(
  db: Database,
  item: typeof ingestionItems.$inferSelect,
): Promise<void> {
  const description = parseDescriptionFromBlobs(item.normalizedData, item.rawData);
  const lat = item.latitude != null && !isNaN(Number(item.latitude)) ? Number(item.latitude) : null;
  const lng =
    item.longitude != null && !isNaN(Number(item.longitude)) ? Number(item.longitude) : null;

  let districtId: string | null = null;
  if (item.districtName) {
    const [d] = await db
      .select({ id: districts.id })
      .from(districts)
      .where(ilike(districts.name, item.districtName.trim()))
      .limit(1);
    if (d) districtId = d.id;
  }

  if (item.entityType === "destination") {
    // 1. Upsert destination
    const [existingDest] = await db
      .select({ id: destinations.id })
      .from(destinations)
      .where(eq(destinations.id, item.entityId))
      .limit(1);

    if (existingDest) {
      await db
        .update(destinations)
        .set({
          name: item.name ?? existingDest.id,
          description: description ?? undefined,
          districtId: districtId ?? undefined,
          latitude: lat ?? undefined,
          longitude: lng ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(destinations.id, item.entityId));
    } else {
      await db.insert(destinations).values({
        id: item.entityId,
        slug: item.entityId,
        name: item.name ?? item.entityId,
        description,
        districtId,
        latitude: lat,
        longitude: lng,
      });
    }

    // 2. Upsert attraction with same ID so attraction FK constraints resolve for destination entity IDs
    const [existingAtt] = await db
      .select({ id: attractions.id })
      .from(attractions)
      .where(eq(attractions.id, item.entityId))
      .limit(1);

    if (existingAtt) {
      await db
        .update(attractions)
        .set({
          destinationId: item.entityId,
          name: item.name ?? existingAtt.id,
          category: item.category ?? "OTHER",
          description: description ?? undefined,
          latitude: lat ?? undefined,
          longitude: lng ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(attractions.id, item.entityId));
    } else {
      await db.insert(attractions).values({
        id: item.entityId,
        slug: item.entityId,
        destinationId: item.entityId,
        name: item.name ?? item.entityId,
        category: item.category ?? "OTHER",
        description,
        latitude: lat,
        longitude: lng,
      });
    }
  } else {
    // Entity type is attraction or other entity
    let parentDestId = item.entityId;
    const [existingParent] = await db
      .select({ id: destinations.id })
      .from(destinations)
      .where(eq(destinations.id, item.entityId))
      .limit(1);

    if (existingParent) {
      parentDestId = existingParent.id;
    } else if (districtId) {
      const [distDest] = await db
        .select({ id: destinations.id })
        .from(destinations)
        .where(eq(destinations.districtId, districtId))
        .limit(1);
      if (distDest) {
        parentDestId = distDest.id;
      }
    }

    if (!existingParent) {
      await db
        .insert(destinations)
        .values({
          id: parentDestId,
          slug: parentDestId,
          name: item.name ?? parentDestId,
          districtId,
          latitude: lat,
          longitude: lng,
        })
        .onConflictDoNothing();
    }

    // Upsert attraction
    const [existingAtt] = await db
      .select({ id: attractions.id })
      .from(attractions)
      .where(eq(attractions.id, item.entityId))
      .limit(1);

    if (existingAtt) {
      await db
        .update(attractions)
        .set({
          destinationId: parentDestId,
          name: item.name ?? existingAtt.id,
          category: item.category ?? "OTHER",
          description: description ?? undefined,
          latitude: lat ?? undefined,
          longitude: lng ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(attractions.id, item.entityId));
    } else {
      await db.insert(attractions).values({
        id: item.entityId,
        slug: item.entityId,
        destinationId: parentDestId,
        name: item.name ?? item.entityId,
        category: item.category ?? "OTHER",
        description,
        latitude: lat,
        longitude: lng,
      });
    }
  }
}

async function hasOpenConflictForRecord(db: Database, sourceRecordId: string): Promise<boolean> {
  const rows = await db
    .select({ id: sourceConflicts.id })
    .from(sourceConflicts)
    .where(
      and(
        eq(sourceConflicts.status, sourceConflictStatusEnum.OPEN),
        or(
          eq(sourceConflicts.recordAId, sourceRecordId),
          eq(sourceConflicts.recordBId, sourceRecordId),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function decideItem(db: Database, input: DecideItemInput): Promise<boolean> {
  requirePermission(input.reviewer.role, permissions.MANAGE_INGESTION);
  if (input.decision === ingestionItemDecisionEnum.NONE) {
    throw new TrustError("A review decision must be APPROVE, REJECT or UNAVAILABLE.");
  }

  return await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    const [item] = await txDb
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

    const [submission] = await txDb
      .select({ workflowStatus: dataSubmissions.workflowStatus })
      .from(dataSubmissions)
      .where(eq(dataSubmissions.id, item.submissionId))
      .limit(1);
    if (!submission) throw new TrustError("The linked submission no longer exists.");

    // Chunk 4 conflict safety: a source record that is one side of an OPEN
    // source conflict must not be approved — that would pick a winner behind
    // the human's back. Resolve the conflict first (KEEP_A / KEEP_B /
    // REJECT_BOTH); the resolution retires the losing side through the queue.
    if (
      input.decision === ingestionItemDecisionEnum.APPROVE &&
      item.sourceRecordId &&
      (await hasOpenConflictForRecord(txDb, item.sourceRecordId))
    ) {
      throw new TrustError(
        "This item's source record is part of an open source conflict. Resolve the conflict before approving.",
      );
    }

    // A submission retired by conflict resolution is REJECTED at the workflow
    // level while its item may still sit in PENDING_REVIEW. It can never be
    // approved again — fail loudly rather than publish the losing side.
    if (
      input.decision === ingestionItemDecisionEnum.APPROVE &&
      submission.workflowStatus === workflowStatusEnum.REJECTED
    ) {
      throw new TrustError(
        "This item's submission was retired by a conflict resolution and can no longer be approved.",
      );
    }

    // Mirror path: the linked submission is already terminal REJECTED (retired
    // by conflict resolution). REJECT / UNAVAILABLE never publish anything, so
    // mirror the human decision on the item + audit without touching workflow.
    if (
      input.decision !== ingestionItemDecisionEnum.APPROVE &&
      submission.workflowStatus === workflowStatusEnum.REJECTED
    ) {
      const mirrorStatus =
        input.decision === ingestionItemDecisionEnum.REJECT
          ? ingestionItemStatusEnum.REJECTED
          : ingestionItemStatusEnum.UNAVAILABLE;
      await txDb
        .update(ingestionItems)
        .set({
          status: mirrorStatus,
          decision: input.decision,
          reviewerId: input.reviewer.id,
          decidedAt: new Date(),
          reason: input.reason?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(ingestionItems.id, input.itemId));
      await writeAudit(txDb, {
        userId: input.reviewer.id,
        action: auditActions.INGESTION_ITEM_DECIDED,
        entityType: "ingestion_item",
        entityId: input.itemId,
        metadata: { decision: input.decision, toStatus: mirrorStatus, retiredByConflict: true },
        ipAddress: input.ipAddress,
      });
      return true;
    }

    // Apply via the trust workflow so provenance/verifications/audit all land.
    await reviewSubmission(txDb, {
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

    await txDb
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

    if (input.decision === ingestionItemDecisionEnum.APPROVE) {
      await syncRelationalEntity(txDb, item);
    }

    await writeAudit(txDb, {
      userId: input.reviewer.id,
      action: auditActions.INGESTION_ITEM_DECIDED,
      entityType: "ingestion_item",
      entityId: input.itemId,
      metadata: { decision: input.decision, toStatus: nextStatus },
      ipAddress: input.ipAddress,
    });

    return true;
  });
}

// --- Safe batch review (Chunk 4) ---------------------------------------------

/**
 * Zero-or-n work: either EVERY item in the batch is decided with the same
 * action, or (if any single item fails for any reason) the whole batch rolls
 * back and nothing is changed. Reuses `decideItem` per item so every decision
 * goes through the exact same workflow / verification / audit / sync path.
 */
export class BatchReviewError extends Error {
  readonly itemId: string;

  constructor(itemId: string, message: string) {
    super(`Batch review failed for item ${itemId}: ${message}`);
    this.name = "BatchReviewError";
    this.itemId = itemId;
  }
}

export interface DecideBatchInput {
  ids: string[];
  reviewer: { id: string; role: Role | string };
  decision: IngestionItemDecision;
  reason?: string | null;
  confidence?: string | null;
  ipAddress?: string | null;
}

export interface BatchDecideResult {
  applied: number;
  ids: string[];
}

export async function decideItemsBatch(
  db: Database,
  input: DecideBatchInput,
): Promise<BatchDecideResult> {
  requirePermission(input.reviewer.role, permissions.MANAGE_INGESTION);
  if (input.decision === ingestionItemDecisionEnum.NONE) {
    throw new TrustError("A batch review decision must be APPROVE, REJECT or UNAVAILABLE.");
  }
  const ids = [...input.ids];
  if (ids.length === 0) {
    throw new TrustError("A batch review needs at least one item.");
  }
  if (ids.length > MAX_BATCH_REVIEW_SIZE) {
    throw new TrustError(`A batch review is limited to ${MAX_BATCH_REVIEW_SIZE} items at a time.`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new TrustError("Duplicate item ids in a batch review are not allowed.");
  }

  return await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    for (const itemId of ids) {
      try {
        await decideItem(txDb, {
          itemId,
          reviewer: input.reviewer,
          decision: input.decision,
          reason: input.reason ?? null,
          confidence: input.confidence ?? null,
          ipAddress: input.ipAddress ?? null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error.";
        throw new BatchReviewError(itemId, message);
      }
    }
    await writeAudit(txDb, {
      userId: input.reviewer.id,
      action: auditActions.INGESTION_BATCH_DECIDED,
      entityType: "ingestion_item",
      metadata: { decision: input.decision, count: ids.length, itemIds: ids },
      ipAddress: input.ipAddress ?? null,
    });
    return { applied: ids.length, ids: [...ids] };
  });
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

// --- Reviewer-speed counters & next-pending (Micro Chunk B) -------------------

export interface ReviewStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  unavailable: number;
  skippedDuplicate: number;
  reviewed: number;
  openConflicts: number;
}

/**
 * Global review counters from real database state (Micro Chunk B). Unlike the
 * per-page `total`, these are computed across ALL ingestion items so the
 * reviewer sees true progress. `reviewed` = decided (non-pending) items.
 * `openConflicts` counts distinct entities holding an OPEN source conflict.
 */
export async function getReviewStats(db: Database): Promise<ReviewStats> {
  const rows = await db
    .select({ status: ingestionItems.status, n: count() })
    .from(ingestionItems)
    .groupBy(ingestionItems.status);

  const byStatus = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    byStatus.set(r.status, r.n);
    total += r.n;
  }

  const pending = byStatus.get(ingestionItemStatusEnum.PENDING_REVIEW) ?? 0;
  const approved = byStatus.get(ingestionItemStatusEnum.APPROVED) ?? 0;
  const rejected = byStatus.get(ingestionItemStatusEnum.REJECTED) ?? 0;
  const unavailable = byStatus.get(ingestionItemStatusEnum.UNAVAILABLE) ?? 0;
  const skippedDuplicate = byStatus.get(ingestionItemStatusEnum.SKIPPED_DUPLICATE) ?? 0;

  const severityRows = await db
    .select({ entityId: sourceConflicts.entityId, entityType: sourceConflicts.entityType })
    .from(sourceConflicts)
    .where(eq(sourceConflicts.status, sourceConflictStatusEnum.OPEN));
  const seen = new Set<string>();
  for (const r of severityRows) seen.add(`${r.entityType}:${r.entityId}`);

  return {
    total,
    pending,
    approved,
    rejected,
    unavailable,
    skippedDuplicate,
    reviewed: approved + rejected + unavailable + skippedDuplicate,
    openConflicts: seen.size,
  };
}

export interface NextPendingOpts {
  runId?: string;
  sourceId?: string;
  entityType?: string;
  search?: string;
  conflict?: "open" | "none" | "any";
}

/**
 * Return the single next PENDING_REVIEW item after `currentId` (or the first
 * pending item when `currentId` is null), respecting the same deterministic
 * queue ordering and filters as listReviewQueue(). Returns null when the queue
 * is exhausted (the reviewer is at the end). Never bypasses conflict safety —
 * it only *selects* the next candidate; approval still runs through decideItem
 * which enforces conflict / MANAGE_INGESTION rules server-side.
 */
export async function nextPendingItem(
  db: Database,
  opts: NextPendingOpts = {},
  currentId: string | null = null,
): Promise<IngestionItemView | null> {
  const page = await listReviewQueue(db, {
    status: ingestionItemStatusEnum.PENDING_REVIEW,
    runId: opts.runId,
    sourceId: opts.sourceId,
    entityType: opts.entityType,
    search: opts.search,
    conflict: opts.conflict ?? "any",
    page: 1,
    limit: 500,
  });

  const candidates = page.items;
  if (candidates.length === 0) return null;
  if (currentId === null) return candidates[0] ?? null;

  const idx = candidates.findIndex((i) => i.id === currentId);
  if (idx === -1) return null;
  return candidates[idx + 1] ?? null;
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
