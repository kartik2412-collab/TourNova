import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/db";
import {
  dataSources,
  ingestionRuns,
  ingestionItems,
  ingestionChanges,
  ingestionRunStatusEnum,
  ingestionItemStatusEnum,
  ingestionItemDecisionEnum,
  ingestionChangeKindEnum,
} from "@/lib/db/schema";
import { writeAudit, auditActions } from "@/lib/auth/audit";
import { SourceError } from "@/lib/trust/sources";
import { flagSourceConflictUnchecked } from "@/lib/trust/sources";
import { createIngestSubmission, advanceSubmission } from "@/lib/trust/workflow";
import { fetchSourceDocument, FetchError } from "./fetch";
import {
  parseGujaratTrailHtml,
  parseAsiLines,
  normalizeDestination,
  validateRawDestination,
} from "./parsers";
import { getIngestSourceConfig, type IngestSourceConfig } from "./sources";
import { canonicalSerialize } from "./text";
import type { RawDestination, NormalizedDestination } from "./types";

/**
 * SOURCED INGESTION PIPELINE (Milestone 3B)
 * =========================================
 * runIngestion() fetches a REAL source, parses, validates, dedupes, persists
 * provenance and puts every candidate in front of a human reviewer. It is the
 * ONLY component that both talks to the network and writes to the database.
 *
 * Governance this module is responsible for:
 *   - No fabrication: only fields parsed from the source are stored. Sources
 *     that cannot be fetched raise FetchError → the run ends FAILED (or PARTIAL)
 *     with the failure recorded — never invented data.
 *   - Nothing is trusted just because it came from a website: candidates land
 *     in data_submissions at PENDING_VERIFICATION, and an item is only ever
 *     approved/rejected/unavailable by a human reviewer.
 *   - Idempotency: re-running with unchanged normalized data produces
 *     SKIPPED_DUPLICATE items; changed data produces PENDING_REVIEW items with a
 *     field-level diff in ingestion_changes.
 *   - Provenance preserved per item: source, source record, submission,
 *     collectedAt, reference URL, freshness class (via source).
 *
 * The function itself requires no user permission — CLI runs it as the system.
 * All user-facing routes must call it behind the appropriate permission gate.
 */

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}

export interface RunDocumentOverride {
  /** Raw HTML document (for html-based parsers). */
  html?: string;
  /** Pre-extracted PDF text lines (for the ASI lines parser). */
  pdfText?: string;
  statusCode?: number;
  contentType?: string | null;
}

export interface IngestionRunOptions {
  /** Registry key of the source to ingest (see INGEST_SOURCE_REGISTRY). */
  sourceKey: string;
  /**
   * Test/dev override: map an exact fetch target URL to a canned document.
   * NEVER used when talking to a real source — production always fetches live.
   */
  documentOverride?: Record<string, RunDocumentOverride>;
  note?: string | null;
  /** Hard cap on candidates imported per run (default 1000; tests use small). */
  maxItems?: number;
  runId?: string;
}

export interface IngestionRunSummary {
  runId: string;
  sourceKey: string;
  sourceId: string;
  status: string;
  discoveredCount: number;
  importedCount: number;
  changedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  unavailableCount: number;
  conflictCount: number;
  reviewRequiredCount: number;
  errors: string[];
  urls: string[];
  httpStatus?: number;
  contentType?: string | null;
  startedAt: Date;
  finishedAt: Date;
}

/** Fields that matter when diffing / conflict-checking entity values. */
const NORMALIZED_FIELDS = [
  "name",
  "category",
  "districtName",
  "locality",
  "latitude",
  "longitude",
] as const;

const RUNNING_WINDOW_MS = 30 * 60 * 1000;

export async function runIngestion(
  db: Database,
  opts: IngestionRunOptions,
): Promise<IngestionRunSummary> {
  const config = getIngestSourceConfig(opts.sourceKey);
  const sourceId = await ensureIngestSource(db, config);
  const runId = opts.runId ?? randomUUID();
  const startedAt = new Date();

  // Prevent concurrent rounds for the same source.
  const [active] = await db
    .select({ status: ingestionRuns.status, startedAt: ingestionRuns.startedAt })
    .from(ingestionRuns)
    .where(
      and(
        eq(ingestionRuns.sourceId, sourceId),
        eq(ingestionRuns.status, ingestionRunStatusEnum.RUNNING),
      ),
    )
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(1);
  if (active && startedAt.getTime() - active.startedAt.getTime() < RUNNING_WINDOW_MS) {
    throw new IngestError(
      `An ingestion run for ${opts.sourceKey} is already running (started ${active.startedAt.toISOString()}).`,
    );
  }

  await db.insert(ingestionRuns).values({
    id: runId,
    sourceId,
    status: ingestionRunStatusEnum.RUNNING,
    note: opts.note ?? null,
    startedAt,
  });
  await writeAudit(db, {
    action: auditActions.INGESTION_RUN_STARTED,
    entityType: "ingestion_run",
    entityId: runId,
    metadata: { sourceKey: opts.sourceKey, sourceId },
  });

  const summary: IngestionRunSummary = {
    runId,
    sourceKey: opts.sourceKey,
    sourceId,
    status: ingestionRunStatusEnum.RUNNING,
    discoveredCount: 0,
    importedCount: 0,
    changedCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
    unavailableCount: 0,
    conflictCount: 0,
    reviewRequiredCount: 0,
    errors: [],
    urls: [],
    httpStatus: undefined,
    contentType: null,
    startedAt,
    finishedAt: startedAt,
  };

  const byUrlItems = new Map<string, RawDestination[]>();
  const errors: string[] = [];

  // 1) Fetch every target URL (or inject a test override document).
  for (const target of config.fetchTargets) {
    const override = opts.documentOverride?.[target.url];
    if (opts.documentOverride && !override) continue;
    try {
      const content = override
        ? {
            text: override.html ?? override.pdfText ?? "",
            statusCode: override.statusCode ?? 200,
            contentType: override.contentType ?? null,
          }
        : await fetchSourceDocument(target.url);

      if (!summary.urls.includes(target.url)) summary.urls.push(target.url);
      if (summary.httpStatus === undefined) summary.httpStatus = content.statusCode;
      if (!summary.contentType && content.contentType) summary.contentType = content.contentType;

      const raw =
        config.parser === "asi-lines"
          ? parseAsiLines(content.text, {
              category: target.category ?? undefined,
              sectionHeading: config.sectionHeading,
            })
          : parseGujaratTrailHtml(content.text, {
              pageUrl: target.url,
              category: target.category,
            });
      byUrlItems.set(target.url, raw);
      summary.discoveredCount += raw.length;
    } catch (err) {
      const message =
        err instanceof FetchError
          ? `Failed to fetch ${target.url} (HTTP ${err.statusCode ?? "?"}): ${err.message}`
          : `Failed to process ${target.url}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(message);
    }
  }

  if (errors.length === config.fetchTargets.length) {
    await finishRun(db, runId, ingestionRunStatusEnum.FAILED, sourceId, errors, summary);
    return summary;
  }

  // 2) Dedupe across targets within this run. The within-run identity is the
  // source's full identity (duplicateKey) when present, since some sources list
  // distinct entities sharing a canonical name+district key.
  const seenInRun = new Set<string>();
  const candidates: RawDestination[] = [];
  for (const raw of byUrlItems.values()) {
    for (const item of raw) {
      const runKey = item.duplicateKey ?? item.key;
      if (seenInRun.has(runKey)) {
        summary.duplicateCount += 1;
        await insertSkippedItem(
          db,
          runId,
          sourceId,
          item,
          normalizeDestination(item),
          "Duplicate within this run.",
        );
        continue;
      }
      seenInRun.add(runKey);
      candidates.push(item);
    }
  }

  const maxItems = opts.maxItems ?? 1000;

  // 3) Validate → persist each candidate.
  for (const candidate of candidates.slice(0, maxItems)) {
    const validation = validateRawDestination(candidate);
    if (!validation.ok) {
      await insertRejectedItem(db, runId, sourceId, candidate, validation.errors);
      summary.rejectedCount += 1;
      continue;
    }
    const normalized = normalizeDestination(candidate);

    // Idempotency: unchanged since the previous import of this entity.
    const previous = await latestItemForEntity(db, sourceId, candidate.entityType, candidate.key);
    const prevNormalizedData = previous ? prevNormalized(previous.normalizedData) : null;
    const prevValues = prevNormalizedData ? significantValues(prevNormalizedData) : null;
    if (previous && prevValues === significantValues(normalized)) {
      await insertSkippedItem(
        db,
        runId,
        sourceId,
        candidate,
        normalized,
        "Unchanged since the previous run.",
      );
      summary.duplicateCount += 1;
      continue;
    }

    summary.importedCount += 1;
    summary.reviewRequiredCount += 1;
    if (previous) summary.changedCount += 1;

    // Provenance: source record + submission, advanced to PENDING_VERIFICATION.
    const provenance = await createIngestSubmission(db, {
      sourceId,
      targetType: candidate.entityType,
      targetId: candidate.key,
      rawValue: canonicalSerialize(candidate.raw),
      value: canonicalSerialize(normalized),
      referenceUrl: candidate.referenceUrl,
      payload: normalized.name,
      note: `Imported by ${config.name}`,
    });
    if (!provenance) {
      throw new IngestError(`Failed to create provenance for ${candidate.key}.`);
    }
    await advanceSubmission(db, provenance.submission.id, "SUBMITTED");
    await advanceSubmission(db, provenance.submission.id, "VALIDATING");
    await advanceSubmission(db, provenance.submission.id, "PENDING_VERIFICATION");

    const itemId = randomUUID();
    const changes = diffNormalized(prevNormalized(previous?.normalizedData), normalized);
    await db.insert(ingestionItems).values({
      id: itemId,
      runId,
      sourceId,
      entityType: candidate.entityType,
      entityId: candidate.key,
      name: normalized.name,
      category: normalized.category ?? null,
      districtName: normalized.districtName ?? null,
      locality: normalized.locality ?? null,
      latitude: normalized.latitude != null ? String(normalized.latitude) : null,
      longitude: normalized.longitude != null ? String(normalized.longitude) : null,
      referenceUrl: normalized.referenceUrl ?? null,
      rawData: canonicalSerialize(candidate.raw),
      normalizedData: canonicalSerialize(normalized),
      status: ingestionItemStatusEnum.PENDING_REVIEW,
      decision: ingestionItemDecisionEnum.NONE,
      sourceRecordId: provenance.sourceRecord.id,
      submissionId: provenance.submission.id,
      collectedAt: new Date(),
    });
    if (changes.length > 0) {
      await db.insert(ingestionChanges).values(
        changes.map((c) => ({
          itemId,
          field: c.field,
          kind: c.kind,
          oldValue: c.oldValue,
          newValue: c.newValue,
        })),
      );
    }

    await writeAudit(db, {
      action: auditActions.INGESTION_ITEM_CREATED,
      entityType: "ingestion_item",
      entityId: itemId,
      metadata: { entityKey: candidate.key, changed: previous ? true : false },
    });

    // Cross-source conflict detection (never auto-resolved).
    summary.conflictCount += await detectCrossSourceConflicts(
      db,
      sourceId,
      candidate,
      normalized,
      provenance.sourceRecord.id,
    );
  }

  summary.errors = errors;
  summary.status =
    errors.length > 0 ? ingestionRunStatusEnum.PARTIAL : ingestionRunStatusEnum.SUCCEEDED;
  summary.finishedAt = new Date();

  await finishRun(db, runId, summary.status, sourceId, errors, summary);
  return summary;
}

// --- Internals --------------------------------------------------------------

async function finishRun(
  db: Database,
  runId: string,
  status: string,
  sourceId: string,
  errors: string[],
  summary: IngestionRunSummary,
): Promise<void> {
  const finishedAt = new Date();
  summary.finishedAt = finishedAt;
  summary.status = status;
  summary.errors = errors;
  await db
    .update(ingestionRuns)
    .set({
      status,
      fetchedUrl: summary.urls[0] ?? null,
      urls: JSON.stringify(summary.urls),
      httpStatus: summary.httpStatus ?? null,
      contentType: summary.contentType ?? null,
      discoveredCount: summary.discoveredCount,
      importedCount: summary.importedCount,
      reviewRequiredCount: summary.reviewRequiredCount,
      duplicateCount: summary.duplicateCount,
      rejectedCount: summary.rejectedCount,
      unavailableCount: summary.unavailableCount,
      error: errors.length > 0 ? errors.join(" | ") : null,
      finishedAt,
    })
    .where(eq(ingestionRuns.id, runId));

  await db
    .update(dataSources)
    .set({
      lastCheckedAt: finishedAt,
      lastSuccessfulFetchAt:
        status === ingestionRunStatusEnum.FAILED ? dataSources.lastSuccessfulFetchAt : finishedAt,
      notes: `${summary.sourceKey} run ${status.toLowerCase()} at ${finishedAt.toISOString()}.`,
      updatedAt: finishedAt,
    })
    .where(eq(dataSources.id, sourceId));

  await writeAudit(db, {
    action: auditActions.INGESTION_RUN_FINISHED,
    entityType: "ingestion_run",
    entityId: runId,
    metadata: {
      status,
      discovered: summary.discoveredCount,
      imported: summary.importedCount,
      duplicates: summary.duplicateCount,
      rejected: summary.rejectedCount,
    },
  });

  // Reflect what the pipeline demonstrably did: the source was fetched.
  if (status === ingestionRunStatusEnum.SUCCEEDED || status === ingestionRunStatusEnum.PARTIAL) {
    await advanceSourceToIngested(db, sourceId);
  }
}

/**
 * Permission-free copy of the source lifecycle rule: a successful pipeline run
 * proves data was fetched, so the source may move
 * DISCOVERED → ACCESSIBLE → INGESTED. It never swings toward REVIEW_REQUIRED,
 * PUBLISHED, or any trust-related state — those stay human-only.
 */
async function advanceSourceToIngested(db: Database, sourceId: string): Promise<void> {
  const [current] = await db
    .select({ ingestionStatus: dataSources.ingestionStatus })
    .from(dataSources)
    .where(eq(dataSources.id, sourceId))
    .limit(1);
  if (!current) return;
  const steps: Record<string, string> = { DISCOVERED: "ACCESSIBLE", ACCESSIBLE: "INGESTED" };
  let currentStatus = current.ingestionStatus;
  let guard = 0;
  while (steps[currentStatus] && guard < 3) {
    const next = steps[currentStatus];
    await db
      .update(dataSources)
      .set({ ingestionStatus: next, updatedAt: new Date() })
      .where(eq(dataSources.id, sourceId));
    currentStatus = next;
    guard += 1;
  }
}

/** Find the source by name (idempotent) or create it per the registry config. */
async function ensureIngestSource(db: Database, config: IngestSourceConfig): Promise<string> {
  const existing = await db
    .select({ id: dataSources.id })
    .from(dataSources)
    .where(eq(dataSources.name, config.name))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const id = randomUUID();
  await db.insert(dataSources).values({
    id,
    name: config.name,
    organizationName: config.organizationName,
    referenceUrl: config.referenceUrl,
    sourceType: config.classification,
    license: config.license,
    usageTerms: config.usageTerms,
    accessMethod: config.accessMethod,
    geographicCoverage: config.geographicCoverage,
    freshnessClass: config.freshnessClass,
    updateFrequency: config.updateFrequency,
    description: config.notes ?? null,
    ingestionStatus: "DISCOVERED",
    isInternal: false,
    isActive: false,
  });
  return id;
}

async function latestItemForEntity(
  db: Database,
  sourceId: string,
  entityType: string,
  entityId: string,
) {
  const [row] = await db
    .select()
    .from(ingestionItems)
    .where(
      and(
        eq(ingestionItems.sourceId, sourceId),
        eq(ingestionItems.entityType, entityType),
        eq(ingestionItems.entityId, entityId),
      ),
    )
    .orderBy(desc(ingestionItems.createdAt))
    .limit(1);
  return row ?? null;
}

function prevNormalized(json: string | null): NormalizedDestination | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as NormalizedDestination;
  } catch {
    return null;
  }
}

function significantValues(n: NormalizedDestination): string {
  return JSON.stringify([
    n.name,
    n.category ?? null,
    n.districtName ?? null,
    n.locality ?? null,
    n.latitude ?? null,
    n.longitude ?? null,
  ]);
}

interface FieldChange {
  field: string;
  kind: string;
  oldValue: string | null;
  newValue: string | null;
}

function diffNormalized(
  previous: NormalizedDestination | null,
  next: NormalizedDestination,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const f of NORMALIZED_FIELDS) {
    const prevVal = previous ? ((previous as unknown as Record<string, unknown>)[f] ?? null) : "";
    const nextVal = (next as unknown as Record<string, unknown>)[f] ?? null;
    if (String(prevVal ?? "") !== String(nextVal ?? "")) {
      changes.push({
        field: f,
        kind: previous ? ingestionChangeKindEnum.CHANGED : ingestionChangeKindEnum.ADDED,
        oldValue: prevVal && prevVal !== "" ? String(prevVal) : null,
        newValue: nextVal != null && nextVal !== "" ? String(nextVal) : null,
      });
    }
  }
  return changes;
}

async function insertRejectedItem(
  db: Database,
  runId: string,
  sourceId: string,
  candidate: RawDestination,
  errors: string[],
): Promise<void> {
  const itemId = randomUUID();
  const normalized = normalizeDestination(candidate);
  await db.insert(ingestionItems).values({
    id: itemId,
    runId,
    sourceId,
    entityType: candidate.entityType,
    entityId: candidate.key,
    name: candidate.name,
    category: candidate.category ?? null,
    districtName: candidate.districtName ?? null,
    locality: candidate.locality ?? null,
    latitude: normalized.latitude != null ? String(normalized.latitude) : null,
    longitude: normalized.longitude != null ? String(normalized.longitude) : null,
    referenceUrl: candidate.referenceUrl ?? null,
    rawData: canonicalSerialize(candidate.raw),
    normalizedData: canonicalSerialize(normalized),
    status: ingestionItemStatusEnum.REJECTED,
    decision: ingestionItemDecisionEnum.REJECT,
    reason: errors.join("; "),
  });
  await writeAudit(db, {
    action: auditActions.INGESTION_ITEM_AUTO_REJECTED,
    entityType: "ingestion_item",
    entityId: itemId,
    metadata: { entityKey: candidate.key, reason: errors },
  });
}

async function insertSkippedItem(
  db: Database,
  runId: string,
  sourceId: string,
  candidate: RawDestination,
  normalized: NormalizedDestination,
  reason: string,
): Promise<void> {
  await db.insert(ingestionItems).values({
    id: randomUUID(),
    runId,
    sourceId,
    entityType: candidate.entityType,
    entityId: candidate.key,
    name: candidate.name,
    category: candidate.category ?? null,
    districtName: candidate.districtName ?? null,
    locality: candidate.locality ?? null,
    latitude: normalized.latitude != null ? String(normalized.latitude) : null,
    longitude: normalized.longitude != null ? String(normalized.longitude) : null,
    referenceUrl: candidate.referenceUrl ?? null,
    rawData: canonicalSerialize(candidate.raw),
    normalizedData: canonicalSerialize(normalized),
    status: ingestionItemStatusEnum.SKIPPED_DUPLICATE,
    decision: ingestionItemDecisionEnum.NONE,
    reason,
  });
}

/** Flag conflicts between this candidate and other sources' records for the
 *  same entity. Idempotent; never auto-resolved. */
async function detectCrossSourceConflicts(
  db: Database,
  currentSourceId: string,
  candidate: RawDestination,
  normalized: NormalizedDestination,
  recordBId: string,
): Promise<number> {
  const rivals = await db
    .select()
    .from(ingestionItems)
    .where(
      and(
        eq(ingestionItems.entityType, candidate.entityType),
        eq(ingestionItems.entityId, candidate.key),
        ne(ingestionItems.sourceId, currentSourceId),
        inArray(ingestionItems.status, [
          ingestionItemStatusEnum.PENDING_REVIEW,
          ingestionItemStatusEnum.APPROVED,
        ]),
      ),
    )
    .limit(20);
  let flagged = 0;
  for (const rival of rivals) {
    if (!rival.sourceRecordId) continue;
    const rivalNorm = prevNormalized(rival.normalizedData);
    if (!rivalNorm) continue;
    if (significantValues(rivalNorm) === significantValues(normalized)) continue;
    try {
      await flagSourceConflictUnchecked(db, {
        entityType: candidate.entityType,
        entityId: candidate.key,
        recordAId: rival.sourceRecordId,
        recordBId,
        note: `Different values for '${candidate.name}' reported by independent sources; awaiting human review.`,
      });
      flagged += 1;
    } catch (err) {
      if (err instanceof SourceError && err.message.includes("not a conflict")) continue;
      throw err;
    }
  }
  return flagged;
}
