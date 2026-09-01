import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { dataSources, sourceRecords, dataSubmissions } from "./provenance";

/**
 * INGESTION PIPELINE ENVELOPES
 * ----------------------------
 * Milestone 3B: the repeatable, provenance-preserving ingestion pipeline.
 *
 * Every automated run against a real source is captured as an `ingestionRuns`
 * row with per-record `ingestionItems` (parsed/validated/deduped candidates)
 * and field-level `ingestionChanges` (diff vs the previous import) so an
 * administrator can review before anything is trusted.
 *
 * Governance invariants these tables help enforce:
 *   - Nothing is ever trusted just because it came from a website. Items start
 *     PENDING_REVIEW and everything is decided by a human (APPROVE / REJECT /
 *     UNAVAILABLE); running the ingestion again never re-publishes anything.
 *   - Each item retains: source, source record, collected timestamp, reference
 *     URL, freshness class, verification state (via its linked submission).
 *   - Re-running an ingestion with unchanged data produces SKIPPED_DUPLICATE
 *     items (idempotency) — never new source records.
 *   - Malformed input is auto-REJECTED with a reason; an unreachable source is
 *     marked UNAVAILABLE at the source level.
 */

export const ingestionRunStatusEnum = {
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
} as const;

export const ingestionItemStatusEnum = {
  PENDING_REVIEW: "PENDING_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  UNAVAILABLE: "UNAVAILABLE",
  SKIPPED_DUPLICATE: "SKIPPED_DUPLICATE",
} as const;

export const ingestionItemDecisionEnum = {
  NONE: "NONE",
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  UNAVAILABLE: "UNAVAILABLE",
} as const;

export const ingestionChangeKindEnum = {
  ADDED: "ADDED",
  CHANGED: "CHANGED",
} as const;

export type IngestionRunStatus =
  (typeof ingestionRunStatusEnum)[keyof typeof ingestionRunStatusEnum];
export type IngestionItemStatus =
  (typeof ingestionItemStatusEnum)[keyof typeof ingestionItemStatusEnum];
export type IngestionItemDecision =
  (typeof ingestionItemDecisionEnum)[keyof typeof ingestionItemDecisionEnum];
export type IngestionChangeKind =
  (typeof ingestionChangeKindEnum)[keyof typeof ingestionChangeKindEnum];

/** One automated ingestion run against one source (fetch → parse → validate → persist). */
export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "set null" }),
    status: text("status").notNull().default(ingestionRunStatusEnum.RUNNING),
    // URL(s) actually fetched during the run.
    fetchedUrl: text("fetched_url"),
    urls: text("urls"),
    httpStatus: integer("http_status"),
    contentType: text("content_type"),
    // Outcome counts for reporting.
    discoveredCount: integer("discovered_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    reviewRequiredCount: integer("review_required_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    unavailableCount: integer("unavailable_count").notNull().default(0),
    // Last failure detail (non-fatal per-document failures are reported too).
    error: text("error"),
    note: text("note"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ingestion_runs_source_idx").on(table.sourceId),
    index("ingestion_runs_status_idx").on(table.status),
  ],
);

/** A single parsed, validated, deduped candidate produced by an ingestion run. */
export const ingestionItems = pgTable(
  "ingestion_items",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: text("run_id")
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "cascade" }),
    // Polymorphic subject (e.g. entityType="destination", entityId=<canonical key>).
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    name: text("name"),
    category: text("category"),
    districtName: text("district_name"),
    locality: text("locality"),
    latitude: text("latitude"),
    longitude: text("longitude"),
    // Source URL for THIS specific record.
    referenceUrl: text("reference_url"),
    // JSON snapshot of the raw claimed fields as parsed from the source.
    rawData: text("raw_data"),
    // JSON snapshot of the normalized/validated fields.
    normalizedData: text("normalized_data"),
    // Human review status (PENDING_REVIEW → APPROVED/REJECTED/UNAVAILABLE,
    // or SKIPPED_DUPLICATE when unchanged across runs).
    status: text("status").notNull().default(ingestionItemStatusEnum.PENDING_REVIEW),
    decision: text("decision").notNull().default(ingestionItemDecisionEnum.NONE),
    reviewerId: text("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    reason: text("reason"),
    // Linked provenance artifacts created for this item.
    sourceRecordId: text("source_record_id").references(() => sourceRecords.id, {
      onDelete: "set null",
    }),
    submissionId: text("submission_id").references(() => dataSubmissions.id, {
      onDelete: "set null",
    }),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ingestion_items_source_idx").on(table.sourceId),
    index("ingestion_items_entity_idx").on(table.entityType, table.entityId),
    index("ingestion_items_status_idx").on(table.status),
  ],
);

/** Field-level diff for an item vs the previous import of the same source. */
export const ingestionChanges = pgTable(
  "ingestion_changes",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    itemId: text("item_id")
      .notNull()
      .references(() => ingestionItems.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    kind: text("kind").notNull().default(ingestionChangeKindEnum.ADDED),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ingestion_changes_item_idx").on(table.itemId)],
);
