import { and, count, desc, eq, isNull, or } from "drizzle-orm";
import {
  coordinateCandidates,
  dataSources,
  ingestionItems,
  ingestionItemStatusEnum,
  sourceConflicts,
} from "@/lib/db/schema";
import type { Database } from "@/lib/db";

/**
 * ADMIN DATA-QUALITY SERVICE
 * --------------------------
 * Read-only diagnostic indicators computed from real database state.
 * This is a diagnostic queue, NOT an automatic repair system.
 * No fabricated or estimated values are ever returned.
 */

export interface DataQualitySummary {
  pendingReview: number;
  approved: number;
  rejected: number;
  unavailable: number;
  openConflicts: number;
  missingCoordinates: number;
  pendingCoordinateCandidates: number;
  missingName: number;
  missingDistrict: number;
  missingDescription: number;
  sourcesUnclassified: number;
  sourcesInactive: number;
}

export interface QualityIssue {
  kind:
    | "missing_coordinates"
    | "missing_description"
    | "missing_district"
    | "unclassified_source"
    | "inactive_source";
  entityType: string;
  entityId: string;
  entityName: string | null;
  detail: string;
}

export async function getDataQualitySummary(db: Database): Promise<DataQualitySummary> {
  const [
    [pendingReview],
    [approved],
    [rejected],
    [unavailable],
    [openConflicts],
    [missingCoordinates],
    [pendingCoordinateCandidates],
    [missingName],
    [missingDistrict],
    [missingDescription],
    [sourcesUnclassified],
    [sourcesInactive],
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(ingestionItems)
      .where(eq(ingestionItems.status, ingestionItemStatusEnum.PENDING_REVIEW)),
    db
      .select({ n: count() })
      .from(ingestionItems)
      .where(eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED)),
    db
      .select({ n: count() })
      .from(ingestionItems)
      .where(eq(ingestionItems.status, ingestionItemStatusEnum.REJECTED)),
    db
      .select({ n: count() })
      .from(ingestionItems)
      .where(eq(ingestionItems.status, ingestionItemStatusEnum.UNAVAILABLE)),
    db.select({ n: count() }).from(sourceConflicts).where(eq(sourceConflicts.status, "OPEN")),
    db
      .select({ n: count() })
      .from(ingestionItems)
      .where(
        and(
          eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED),
          or(
            isNull(ingestionItems.latitude),
            isNull(ingestionItems.longitude),
            eq(ingestionItems.latitude, ""),
            eq(ingestionItems.longitude, ""),
          ),
        ),
      ),
    db
      .select({ n: count() })
      .from(coordinateCandidates)
      .where(eq(coordinateCandidates.status, "PENDING_REVIEW")),
    db
      .select({ n: count() })
      .from(ingestionItems)
      .where(
        and(
          eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED),
          or(isNull(ingestionItems.name), eq(ingestionItems.name, "")),
        ),
      ),
    db
      .select({ n: count() })
      .from(ingestionItems)
      .where(
        and(
          eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED),
          or(isNull(ingestionItems.districtName), eq(ingestionItems.districtName, "")),
        ),
      ),
    db
      .select({ n: count() })
      .from(ingestionItems)
      .where(
        and(
          eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED),
          or(
            isNull(ingestionItems.normalizedData),
            or(isNull(ingestionItems.rawData), eq(ingestionItems.normalizedData, "{}")),
            eq(ingestionItems.rawData, "{}"),
          ),
        ),
      ),
    db.select({ n: count() }).from(dataSources).where(eq(dataSources.sourceType, "UNKNOWN")),
    db.select({ n: count() }).from(dataSources).where(eq(dataSources.isActive, false)),
  ]);

  return {
    pendingReview: pendingReview?.n ?? 0,
    approved: approved?.n ?? 0,
    rejected: rejected?.n ?? 0,
    unavailable: unavailable?.n ?? 0,
    openConflicts: openConflicts?.n ?? 0,
    missingCoordinates: missingCoordinates?.n ?? 0,
    pendingCoordinateCandidates: pendingCoordinateCandidates?.n ?? 0,
    missingName: missingName?.n ?? 0,
    missingDistrict: missingDistrict?.n ?? 0,
    missingDescription: missingDescription?.n ?? 0,
    sourcesUnclassified: sourcesUnclassified?.n ?? 0,
    sourcesInactive: sourcesInactive?.n ?? 0,
  };
}

/** Concrete, real issues drawn from the database — used by the command centre. */
export async function listQualityIssues(
  db: Database,
  opts: { limit?: number } = {},
): Promise<QualityIssue[]> {
  const limit = Math.min(opts.limit ?? 20, 100);

  const [missingCoords, missingDescriptions, missingDistricts, inactiveSources] = await Promise.all(
    [
      db
        .select({
          entityType: ingestionItems.entityType,
          entityId: ingestionItems.entityId,
          entityName: ingestionItems.name,
        })
        .from(ingestionItems)
        .where(
          and(
            eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED),
            or(
              isNull(ingestionItems.latitude),
              isNull(ingestionItems.longitude),
              eq(ingestionItems.latitude, ""),
              eq(ingestionItems.longitude, ""),
            ),
          ),
        )
        .orderBy(desc(ingestionItems.createdAt))
        .limit(limit),
      db
        .select({
          entityType: ingestionItems.entityType,
          entityId: ingestionItems.entityId,
          entityName: ingestionItems.name,
        })
        .from(ingestionItems)
        .where(
          and(
            eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED),
            or(
              isNull(ingestionItems.normalizedData),
              isNull(ingestionItems.rawData),
              eq(ingestionItems.normalizedData, "{}"),
              eq(ingestionItems.rawData, "{}"),
            ),
          ),
        )
        .orderBy(desc(ingestionItems.createdAt))
        .limit(limit),
      db
        .select({
          entityType: ingestionItems.entityType,
          entityId: ingestionItems.entityId,
          entityName: ingestionItems.name,
        })
        .from(ingestionItems)
        .where(
          and(
            eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED),
            or(isNull(ingestionItems.districtName), eq(ingestionItems.districtName, "")),
          ),
        )
        .orderBy(desc(ingestionItems.createdAt))
        .limit(limit),
      db
        .select({
          entityType: dataSources.sourceType,
          entityId: dataSources.id,
          entityName: dataSources.name,
        })
        .from(dataSources)
        .where(eq(dataSources.isActive, false))
        .orderBy(desc(dataSources.createdAt))
        .limit(limit),
    ],
  );

  const issues: QualityIssue[] = [
    ...missingCoords.map((r) => ({
      kind: "missing_coordinates" as const,
      entityType: r.entityType,
      entityId: r.entityId,
      entityName: r.entityName,
      detail: "Approved record has no coordinates.",
    })),
    ...missingDescriptions.map((r) => ({
      kind: "missing_description" as const,
      entityType: r.entityType,
      entityId: r.entityId,
      entityName: r.entityName,
      detail: "Approved record has no description.",
    })),
    ...missingDistricts.map((r) => ({
      kind: "missing_district" as const,
      entityType: r.entityType,
      entityId: r.entityId,
      entityName: r.entityName,
      detail: "Approved record has no district.",
    })),
    ...inactiveSources.map((r) => ({
      kind: "inactive_source" as const,
      entityType: r.entityType,
      entityId: r.entityId,
      entityName: r.entityName,
      detail: "Source is inactive.",
    })),
  ];

  return issues;
}
