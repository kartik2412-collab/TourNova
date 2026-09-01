import { pgTable, text, doublePrecision, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { confidenceEnum } from "./provenance";

/**
 * GEO / COORDINATES (Milestone 3C)
 * --------------------------------
 * TourNova NEVER invents a coordinate. Geo-features (map, nearby, directions)
 * must only ever work from coordinates that carry provenance:
 *
 *   1. A candidate is recorded with full attribution — who provided it, on what
 *      basis (manual entry from an official document, a geocoding provider
 *      result, a field survey), the exact query text used, and the provider's
 *      own place name / reference.
 *   2. Candidates enter PENDING_REVIEW. A geocoding provider's output is never
 *      trusted as-is ("candidate, not truth"); only an authorized reviewer can
 *      mark a candidate APPROVED.
 *   3. Downstream geo features consume APPROVED candidates only.
 *
 * This table is polymorphic (entityType/entityId), matching how the ingestion
 * items and source records reference their subjects, so any domain entity can
 * be geolocated through the same audited path.
 */

export const coordinateCandidateStatusEnum = {
  PENDING_REVIEW: "PENDING_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

/** How a candidate was obtained — the WHAT of its provenance. */
export const coordinateCandidateSourceEnum = {
  MANUAL: "MANUAL", // entered by a reviewer from an official document / survey
  GEOCODING: "GEOCODING", // resolved by a geocoding provider (see geo/providers)
  FIELD: "FIELD", // captured on-site (field survey / GPS fix)
  PREDICTED: "PREDICTED", // inferred / interpolated — never trusted without review
} as const;

export type CoordinateCandidateStatus =
  (typeof coordinateCandidateStatusEnum)[keyof typeof coordinateCandidateStatusEnum];
export type CoordinateCandidateSource =
  (typeof coordinateCandidateSourceEnum)[keyof typeof coordinateCandidateSourceEnum];

export const coordinateCandidates = pgTable(
  "coordinate_candidates",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // Polymorphic subject of the coordinate (e.g. entityType "attraction",
    // entityId the destination slug / ingestion canonical key).
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    // How the coordinate was obtained (see coordinateCandidateSourceEnum).
    source: text("source").notNull().default(coordinateCandidateSourceEnum.MANUAL),
    // Provider id from the GEOCODE_PROVIDERS registry (or "manual" for MANUAL).
    provider: text("provider"),
    // The exact query text that was geocoded — critical provenance.
    query: text("query"),
    // The provider's returned (or authoritative) place name.
    placeName: text("place_name"),
    // Reliability of this candidate (never an implicit trust claim).
    confidence: text("confidence").notNull().default(confidenceEnum.UNKNOWN),
    // Required attribution text for this provider's data.
    attribution: text("attribution"),
    // A stable reference: provider result link or the source document URL.
    referenceUrl: text("reference_url"),
    notes: text("notes"),
    status: text("status").notNull().default(coordinateCandidateStatusEnum.PENDING_REVIEW),
    // Who submitted the candidate into review.
    submittedById: text("submitted_by_id").references(() => users.id, { onDelete: "set null" }),
    // Review trail.
    decision: text("decision"),
    decisionNote: text("decision_note"),
    decidedById: text("decided_by_id").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("coord_candidates_entity_idx").on(table.entityType, table.entityId),
    index("coord_candidates_status_idx").on(table.status),
    index("coord_candidates_provider_idx").on(table.provider),
  ],
);
