import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { userReports } from "./userReports";

/**
 * DATA SOURCES & PROVENANCE
 * --------------------------
 * This module is the architectural core of the TourNova "data truth" policy.
 *
 * Every important factual data point in the platform must be traceable to a
 * source. Sources are ranked by a generic priority hierarchy (see README /
 * docs/DATA_TRUTH.md). Rather than storing only a final value, we persist the
 * relationship between a data point and the source(s) it came from.
 *
 * A source REGISTRY entry (see `dataSources`) records WHO a fact came from and
 * HOW it can be reached — never a claim of trust. Classification and trust are
 * separate concerns:
 *   - `sourceType`  = the source's classification (taxonomy below).
 *   - `reliability` = a reliability assessment (HIGH/MEDIUM/LOW/UNKNOWN).
 *   - `ingestionStatus` = how far ingestion of this source has progressed.
 *
 * Both classification and reliability START at UNKNOWN and a source is NEVER
 * automatically classified as trusted: creation defaults to
 * UNKNOWN/DISCOVERED/inactive, an `is_active` flag must be set explicitly by an
 * administrator, and publishing a source (ingestion PUBLISHED) requires a
 * confirmed classification.
 *
 * Trust ordering implied by the classification hierarchy (highest to lowest):
 *   1. OFFICIAL_GOVERNMENT   national/state/statutory government bodies
 *   2. OFFICIAL_AUTHORITY    official destination or tourism authority/body
 *   3. OPEN_DATA             structured open datasets / authorized open feeds
 *   4. VERIFIED_BUSINESS     verified business/operator source
 *   5. USER_SUBMITTED        user/community-submitted contribution
 *   6. THIRD_PARTY           any third-party source not fitting the above
 *   7. UNKNOWN               not yet classified — never a trust claim
 */

export const sourceClassificationEnum = {
  OFFICIAL_GOVERNMENT: "OFFICIAL_GOVERNMENT",
  OFFICIAL_AUTHORITY: "OFFICIAL_AUTHORITY",
  OPEN_DATA: "OPEN_DATA",
  VERIFIED_BUSINESS: "VERIFIED_BUSINESS",
  USER_SUBMITTED: "USER_SUBMITTED",
  THIRD_PARTY: "THIRD_PARTY",
  UNKNOWN: "UNKNOWN",
} as const;

/** How the source's data can be reached (API, document, webpage, …). */
export const sourceAccessMethodEnum = {
  API: "API",
  DOCUMENT: "DOCUMENT",
  WEBPAGE: "WEBPAGE",
  DATABASE: "DATABASE",
  FILE: "FILE",
  OTHER: "OTHER",
  UNKNOWN: "UNKNOWN",
} as const;

/** Declared/known geographic coverage of a source's data. */
export const geographicCoverageEnum = {
  GLOBAL: "GLOBAL",
  NATIONAL: "NATIONAL",
  STATE: "STATE",
  DISTRICT: "DISTRICT",
  LOCAL: "LOCAL",
  UNKNOWN: "UNKNOWN",
} as const;

/**
 * Which freshness class governs a source's records (see src/lib/data-policy.ts
 * for the class → threshold mapping). Values are lowercase to match the
 * `FreshnessClass` type used by the presentation layer.
 */
export const freshnessClassEnum = {
  CROWD: "crowd",
  PRICE: "price",
  HOURS: "hours",
  BUSINESS: "business",
  DEFAULT: "default",
} as const;

/**
 * Ingestion lifecycle of a source within the registry.
 *
 *   DISCOVERED       registered / found, nothing fetched yet
 *   ACCESSIBLE       reachable and checked (URL/API responds)
 *   INGESTED         data has been fetched at least once
 *   VALIDATED        fetched data passed technical validation
 *   REVIEW_REQUIRED  waiting on a human reviewer
 *   PUBLISHED        source is live — powers PUBLIC data (needs confirmed
 *                    classification + explicit activation)
 *   UNAVAILABLE      source is unreachable / retired / unusable
 *
 * Transitions are ALWAYS explicit operations; availability checks never move a
 * source forward automatically, and PUBLISHED can never be reached without a
 * human-confirmed classification.
 */
export const ingestionStatusEnum = {
  DISCOVERED: "DISCOVERED",
  ACCESSIBLE: "ACCESSIBLE",
  INGESTED: "INGESTED",
  VALIDATED: "VALIDATED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  PUBLISHED: "PUBLISHED",
  UNAVAILABLE: "UNAVAILABLE",
} as const;

/** Lifecycle of a registered data-source conflict (two records disagree). */
export const sourceConflictStatusEnum = {
  OPEN: "OPEN",
  RESOLVED: "RESOLVED",
  SUPERSEDED: "SUPERSEDED",
} as const;

/** How a source conflict was resolved (stored on `source_conflicts.resolution`). */
export const sourceConflictResolutionEnum = {
  NONE: "NONE",
  ACCEPT_RECORD_A: "ACCEPT_RECORD_A",
  ACCEPT_RECORD_B: "ACCEPT_RECORD_B",
  REJECT_BOTH: "REJECT_BOTH",
} as const;

/**
 * CANONICAL conflict-decisions (Chunk 3).
 *
 * This is the ONE decision model used by every caller that resolves a conflict
 * (validation schema → API route → service → admin UI → audit). Each value names
 * the human decision explicitly:
 *
 *   KEEP_A      keep source A's record (record `recordAId` is accepted)
 *   KEEP_B      keep source B's record (record `recordBId` is accepted)
 *   REJECT_BOTH keep neither record; both stay in history but are not published
 *   MERGE       recognised but deliberately UNSUPPORTED — the current conflict
 *               schema has no safe, human-controlled merge model, so the service
 *               rejects it with a clear error and it is never persisted.
 *
 * `sourceConflictResolutionEnum` above remains for backward-compatible STORAGE of
 * already-written rows; `sourceConflictDecisionEnum` is what callers must send.
 */
export const sourceConflictDecisionEnum = {
  KEEP_A: "KEEP_A",
  KEEP_B: "KEEP_B",
  MERGE: "MERGE",
  REJECT_BOTH: "REJECT_BOTH",
} as const;

/**
 * How often a source is expected to refresh (real-time means pushes/updates on
 * an ongoing basis). Used for freshness heuristics and monitoring.
 */
export const updateFrequencyEnum = {
  REAL_TIME: "REAL_TIME",
  HOURLY: "HOURLY",
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  ON_UPDATE: "ON_UPDATE",
  MANUAL: "MANUAL",
  UNKNOWN: "UNKNOWN",
} as const;

export const verificationStatusEnum = {
  VERIFIED: "VERIFIED",
  LIVE: "LIVE",
  ESTIMATED: "ESTIMATED",
  USER_REPORTED: "USER_REPORTED",
  PREDICTED: "PREDICTED",
  UNAVAILABLE: "UNAVAILABLE",
  DEMO: "DEMO",
  EXPIRED: "EXPIRED",
  CONFLICT: "CONFLICT",
} as const;

/**
 * Lifecycle of a data submission as it moves through the trust workflow.
 *
 *   DISCOVERED               a candidate fact has been found (auto/ingest)
 *        ↓
 *   SUBMITTED                formally submitted into the workflow
 *        ↓
 *   VALIDATING               being validated (syntactic/source checks)
 *        ↓
 *   PENDING_VERIFICATION     waiting on a human reviewer
 *        ↓
 *   VERIFIED                 confirmed by an authorized reviewer
 *        ↓
 *   PUBLISHED                promoted to public display / live data
 *
 * Terminal / side states: REJECTED, CONFLICT, EXPIRED, UNAVAILABLE (a submission
 * can also be REOPENED back to SUBMITTED from any resolved state).
 */
export const workflowStatusEnum = {
  DISCOVERED: "DISCOVERED",
  SUBMITTED: "SUBMITTED",
  VALIDATING: "VALIDATING",
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  VERIFIED: "VERIFIED",
  PUBLISHED: "PUBLISHED",
  REJECTED: "REJECTED",
  CONFLICT: "CONFLICT",
  EXPIRED: "EXPIRED",
  UNAVAILABLE: "UNAVAILABLE",
} as const;

/** A reviewer decision on a submission. Mirrors the trust-workflow actions. */
export const reviewDecisionEnum = {
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  CONFLICT: "CONFLICT",
  UNAVAILABLE: "UNAVAILABLE",
  EXPIRE: "EXPIRE",
  PUBLISH: "PUBLISH",
  REOPEN: "REOPEN",
} as const;

export type WorkflowStatus = (typeof workflowStatusEnum)[keyof typeof workflowStatusEnum];
export type ReviewDecision = (typeof reviewDecisionEnum)[keyof typeof reviewDecisionEnum];
export type IngestionStatus = (typeof ingestionStatusEnum)[keyof typeof ingestionStatusEnum];
export type SourceConflictStatus =
  (typeof sourceConflictStatusEnum)[keyof typeof sourceConflictStatusEnum];
export type SourceConflictResolution =
  (typeof sourceConflictResolutionEnum)[keyof typeof sourceConflictResolutionEnum];
export type SourceConflictDecision =
  (typeof sourceConflictDecisionEnum)[keyof typeof sourceConflictDecisionEnum];
export type SourceClassification =
  (typeof sourceClassificationEnum)[keyof typeof sourceClassificationEnum];

export const confidenceEnum = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  UNKNOWN: "UNKNOWN",
} as const;

/** A named, reusable source of information (an organization, feed, dataset, or user). */
export const dataSources = pgTable(
  "data_sources",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    // Classification taxonomy (see sourceClassificationEnum). NEVER a claim of
    // trust on its own — starts at UNKNOWN and needs confirmation to count.
    sourceType: text("source_type").notNull().default(sourceClassificationEnum.UNKNOWN),
    // e.g. "Gujarat Tourism", "ASI", "OpenStreetMap", "Municipal Corporation"
    organizationName: text("organization_name"),
    // Canonical/official URL for the source itself (the "official URL" of the
    // registry). Per-record reference URLs live on source_records.reference_url.
    referenceUrl: text("reference_url"),
    // Free-form description of where this source's data comes from.
    description: text("description"),
    // Optional contact / attribution detail for the source.
    contact: text("contact"),
    // The license (e.g. "CC BY 4.0", "National Data Sharing Policy") governing use.
    license: text("license"),
    // Free-form usage terms / attribution / restrictions beyond the license.
    usageTerms: text("usage_terms"),
    // How the data can be reached: API | DOCUMENT | WEBPAGE | DATABASE | FILE.
    accessMethod: text("access_method").notNull().default(sourceAccessMethodEnum.UNKNOWN),
    // Source-level reliability assessment (never a claim of live truth).
    reliability: text("reliability").notNull().default(confidenceEnum.UNKNOWN),
    // How often this source is expected to refresh.
    updateFrequency: text("update_frequency").notNull().default(updateFrequencyEnum.MANUAL),
    // Which freshness policy governs records from this source.
    freshnessClass: text("freshness_class").notNull().default(freshnessClassEnum.DEFAULT),
    // Declared geographic coverage of the source's data.
    geographicCoverage: text("geographic_coverage")
      .notNull()
      .default(geographicCoverageEnum.UNKNOWN),
    // Last automated availability check (never implies data changed).
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    // Last time a fetch/check actually produced data.
    lastSuccessfulFetchAt: timestamp("last_successful_fetch_at", { withTimezone: true }),
    // How far ingestion of this source has progressed (see ingestionStatusEnum).
    ingestionStatus: text("ingestion_status").notNull().default(ingestionStatusEnum.DISCOVERED),
    // Reviewer notes about the source (licence, caveats, known gaps).
    notes: text("notes"),
    // Who CHECKED the classification (e.g. that a source truly is OFFICIAL_GOVERNMENT).
    // A source never claims an official/authoritative classification by default.
    classificationVerifiedById: text("classification_verified_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    classificationVerifiedAt: timestamp("classification_verified_at", { withTimezone: true }),
    // Whether this source is operated/verified internally.
    isInternal: boolean("is_internal").notNull().default(false),
    // Whether the source is currently considered trustworthy enough to power LIVE data.
    isActive: boolean("is_active").notNull().default(false),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("data_sources_type_idx").on(table.sourceType),
    index("data_sources_ingestion_idx").on(table.ingestionStatus),
  ],
);

/**
 * A specific record captured from a data source at a point in time.
 * This is the link between a factual value and its provenance.
 *
 * The `entityType`/`entityId` pair is a lightweight polymorphic reference to
 * whichever domain record this record is about (a price, a crowd observation,
 * opening hours, etc.). This keeps provenance generic while future modules can
 * type-specific link tables for stronger typing if needed.
 */
export const sourceRecords = pgTable(
  "source_records",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    dataSourceId: text("data_source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    // Snapshot of the raw value/claim as provided by the source.
    rawValue: text("raw_value"),
    // Canonical value derived from this source (nullable when only raw exists).
    value: text("value"),
    // Source-provided reference URL for THIS specific record/claim.
    referenceUrl: text("reference_url"),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
    // Freshness window for THIS record (nullable → governed by data-policy defaults).
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    // Last time this record's value was confirmed (mirrors verifications).
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationStatus: text("verification_status")
      .notNull()
      .default(verificationStatusEnum.UNAVAILABLE),
  },
  (table) => [
    index("source_records_entity_idx").on(table.entityType, table.entityId),
    index("source_records_source_idx").on(table.dataSourceId),
  ],
);

/** A human/automated verification event for a source record. */
export const verifications = pgTable(
  "verifications",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    sourceRecordId: text("source_record_id")
      .notNull()
      .references(() => sourceRecords.id, { onDelete: "cascade" }),
    // Which submission this decision acted on (when the review went through the
    // trust workflow). Kept nullable so direct source-record checks work too.
    submissionId: text("submission_id").references(() => dataSubmissions.id, {
      onDelete: "set null",
    }),
    verifiedById: text("verified_by_id").references(() => users.id, { onDelete: "set null" }),
    // The reviewer decision when part of a workflow review.
    decision: text("decision"),
    verificationStatus: text("verification_status").notNull(),
    confidence: text("confidence").notNull().default(confidenceEnum.UNKNOWN),
    // Last time this value was checked and confirmed.
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }).notNull().defaultNow(),
    // Freshness window (in hours) after which the value should be re-verified.
    freshnessHours: integer("freshness_hours"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("verifications_record_idx").on(table.sourceRecordId),
    index("verifications_submission_idx").on(table.submissionId),
  ],
);

/**
 * A registered CONFLICT between two source records: two sources (or two
 * versions of one source) claim different values for the same entity.
 *
 * Conflicts are never auto-resolved and never silently merged. They exist so a
 * reviewer can see both sides with their provenance and pick one (or reject
 * both). `valueA`/`valueB` snapshot the disputed values at flag time for
 * display even if the records are later edited.
 */
export const sourceConflicts = pgTable(
  "source_conflicts",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // Polymorphic subject the conflicting claims are about.
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    recordAId: text("record_a_id")
      .notNull()
      .references(() => sourceRecords.id, { onDelete: "cascade" }),
    recordBId: text("record_b_id")
      .notNull()
      .references(() => sourceRecords.id, { onDelete: "cascade" }),
    valueA: text("value_a"),
    valueB: text("value_b"),
    status: text("status").notNull().default(sourceConflictStatusEnum.OPEN),
    // Resolution choice once a reviewer closes the conflict.
    resolution: text("resolution").notNull().default(sourceConflictResolutionEnum.NONE),
    // The ACTUAL source record the reviewer accepted (for KEEP_A/KEEP_B).
    // NULL for REJECT_BOTH. Persisted explicitly so "what won" never has to be
    // re-derived positionally from recordAId/recordBId, and so the rejected side
    // can be kept out of publication by the existing workflow.
    acceptedRecordId: text("accepted_record_id").references(() => sourceRecords.id, {
      onDelete: "set null",
    }),
    resolvedById: text("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    // Who flagged the conflict and any note at flag time.
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("source_conflicts_entity_idx").on(table.entityType, table.entityId),
    index("source_conflicts_status_idx").on(table.status),
    index("source_conflicts_records_idx").on(table.recordAId, table.recordBId),
    index("source_conflicts_accepted_idx").on(table.acceptedRecordId),
  ],
);

/**
 * The trust-workflow envelope: a candidate claim (a source record) proposed for
 * an entity, moving through DISCOVERED → SUBMITTED → VALIDATING →
 * PENDING_VERIFICATION → VERIFIED → PUBLISHED (or REJECTED / CONFLICT /
 * EXPIRED / UNAVAILABLE).
 *
 * This is the reusable workflow for externally sourced OR user-submitted
 * information. Domain modules (user reports, prices, crowd, businesses) push
 * their candidate facts here; reviewers act on these envelopes; publication
 * materialises the value for public display.
 */
export const dataSubmissions = pgTable(
  "data_submissions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // The specific captured claim being submitted (always traceable to a source).
    sourceRecordId: text("source_record_id")
      .notNull()
      .references(() => sourceRecords.id, { onDelete: "cascade" }),
    // Optional link when this submission originated from a user report.
    userReportId: text("user_report_id").references(() => userReports.id, {
      onDelete: "set null",
    }),
    // Who submitted the claim into the workflow.
    submittedById: text("submitted_by_id").references(() => users.id, { onDelete: "set null" }),
    // Polymorphic subject the claim is about.
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    // The submitted value/body (for quick display; the raw value lives on the
    // source record).
    payload: text("payload"),
    // Free-form notes attached at submission time.
    note: text("note"),
    // Last decision reason (rejection/conflict/expiry explanation).
    reason: text("reason"),
    workflowStatus: text("workflow_status").notNull().default(workflowStatusEnum.SUBMITTED),
    // When flagged CONFLICT, the other submission this one conflicts with.
    conflictWithId: text("conflict_with_id").references((): AnyPgColumn => dataSubmissions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("data_submissions_status_idx").on(table.workflowStatus),
    index("data_submissions_target_idx").on(table.targetType, table.targetId),
    index("data_submissions_user_idx").on(table.submittedById),
  ],
);

/** Audit log of trusted data changes (who/what/when/why for sensitive mutations). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    // JSON payload describing the change.
    metadata: text("metadata"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_logs_entity_idx").on(table.entityType, table.entityId)],
);
