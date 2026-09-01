import { and, asc, eq, ilike, or } from "drizzle-orm";
import {
  coordinateCandidates,
  dataSources,
  ingestionItems,
  ingestionItemStatusEnum,
  sourceConflicts,
  sourceRecords,
} from "@/lib/db/schema";
import { freshnessState } from "@/lib/data-policy";
import type { Database } from "@/lib/db";
import type { FreshnessState } from "@/lib/data-policy";

/**
 * PUBLIC CATALOG (Milestone 4)
 * ----------------------------
 * Discover lists destinations that a human reviewer has APPROVED. A source's
 * words are never shown as fact before review, and values a source did not
 * provide are left absent (never invented). Every card carries its provenance:
 * which source said it, when, and at what freshness.
 */

export interface PublicSource {
  id: string;
  name: string;
  sourceType: string;
  organizationName: string | null;
  reliability: string;
}

export interface PublicCoordinate {
  latitude: number;
  longitude: number;
  placeName: string | null;
  attribution: string | null;
}

export interface ConflictNotice {
  valueA: string | null;
  valueB: string | null;
}

export interface DestinationDetail {
  entityType: string;
  entityId: string;
  name: string | null;
  category: string | null;
  districtName: string | null;
  locality: string | null;
  description: string | null;
  referenceUrl: string | null;
  collectedAt: Date;
  verifiedAt: Date | null;
  freshness: FreshnessState;
  source: PublicSource;
  coordinates: PublicCoordinate[];
  conflicts: ConflictNotice[];
}

function parseDescription(normalizedData: string | null, rawData: string | null): string | null {
  const candidates = [normalizedData, rawData];
  for (const blob of candidates) {
    if (!blob) continue;
    try {
      const parsed = JSON.parse(blob) as Record<string, unknown>;
      for (const key of ["description", "overview", "summary"]) {
        const value = parsed[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    } catch {
      // Not JSON — ignore, never surface a half-parsed value.
    }
  }
  return null;
}

const destinationSelect = {
  entityType: ingestionItems.entityType,
  entityId: ingestionItems.entityId,
  name: ingestionItems.name,
  category: ingestionItems.category,
  districtName: ingestionItems.districtName,
  locality: ingestionItems.locality,
  referenceUrl: ingestionItems.referenceUrl,
  rawData: ingestionItems.rawData,
  normalizedData: ingestionItems.normalizedData,
  collectedAt: ingestionItems.collectedAt,
  sourceId: ingestionItems.sourceId,
  sourceName: dataSources.name,
  sourceType: dataSources.sourceType,
  organizationName: dataSources.organizationName,
  sourceReliability: dataSources.reliability,
  verifiedAt: sourceRecords.verifiedAt,
} as const;

interface DestinationRow {
  entityType: string;
  entityId: string;
  name: string | null;
  category: string | null;
  districtName: string | null;
  locality: string | null;
  referenceUrl: string | null;
  rawData: string | null;
  normalizedData: string | null;
  collectedAt: Date;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  organizationName: string | null;
  sourceReliability: string;
  verifiedAt: Date | null;
}

function toDestination(row: DestinationRow): DestinationDetail {
  return {
    entityType: row.entityType,
    entityId: row.entityId,
    name: row.name,
    category: row.category,
    districtName: row.districtName,
    locality: row.locality,
    description: parseDescription(row.normalizedData, row.rawData),
    referenceUrl: row.referenceUrl,
    collectedAt: row.collectedAt,
    verifiedAt: row.verifiedAt,
    freshness: freshnessState({
      verifiedAt: row.verifiedAt,
      freshnessClass: "default",
    }),
    source: {
      id: row.sourceId,
      name: row.sourceName,
      sourceType: row.sourceType,
      organizationName: row.organizationName,
      reliability: row.sourceReliability,
    },
    coordinates: [],
    conflicts: [],
  };
}

export interface DestinationListOptions {
  query?: string;
  category?: string;
  district?: string;
  limit?: number;
}

export async function listVerifiedDestinations(
  db: Database,
  opts: DestinationListOptions = {},
): Promise<DestinationDetail[]> {
  const limit = Math.min(opts.limit ?? 100, 200);
  const conds = [eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED)];
  if (opts.query?.trim()) {
    conds.push(
      or(
        ilike(ingestionItems.name, `%${opts.query.trim()}%`),
        ilike(ingestionItems.locality, `%${opts.query.trim()}%`),
        ilike(ingestionItems.districtName, `%${opts.query.trim()}%`),
      )!,
    );
  }
  if (opts.category?.trim()) conds.push(eq(ingestionItems.category, opts.category.trim()));
  if (opts.district?.trim()) conds.push(eq(ingestionItems.districtName, opts.district.trim()));

  const rows = await db
    .select(destinationSelect)
    .from(ingestionItems)
    .innerJoin(dataSources, eq(ingestionItems.sourceId, dataSources.id))
    .leftJoin(sourceRecords, eq(ingestionItems.sourceRecordId, sourceRecords.id))
    .where(and(...conds))
    .orderBy(asc(ingestionItems.name), asc(ingestionItems.entityId))
    .limit(limit);

  return rows.map((r) => toDestination(r));
}

export async function listDestinationFacets(db: Database): Promise<{
  categories: string[];
  districts: string[];
}> {
  const rows = await db
    .select({
      category: ingestionItems.category,
      districtName: ingestionItems.districtName,
    })
    .from(ingestionItems)
    .where(eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED));
  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean) as string[])].sort();
  const districts = [
    ...new Set(rows.map((r) => r.districtName).filter(Boolean) as string[]),
  ].sort();
  return { categories, districts };
}

export async function getVerifiedDestination(
  db: Database,
  entityId: string,
): Promise<DestinationDetail | null> {
  const rows = await db
    .select(destinationSelect)
    .from(ingestionItems)
    .innerJoin(dataSources, eq(ingestionItems.sourceId, dataSources.id))
    .leftJoin(sourceRecords, eq(ingestionItems.sourceRecordId, sourceRecords.id))
    .where(
      and(
        eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED),
        eq(ingestionItems.entityId, entityId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const dest = toDestination(row);

  const [coords, conflicts] = await Promise.all([
    db
      .select({
        latitude: coordinateCandidates.latitude,
        longitude: coordinateCandidates.longitude,
        placeName: coordinateCandidates.placeName,
        attribution: coordinateCandidates.attribution,
      })
      .from(coordinateCandidates)
      .where(
        and(
          eq(coordinateCandidates.entityId, entityId),
          eq(coordinateCandidates.status, "APPROVED"),
        ),
      ),
    db
      .select({
        valueA: sourceConflicts.valueA,
        valueB: sourceConflicts.valueB,
      })
      .from(sourceConflicts)
      .where(
        and(
          eq(sourceConflicts.entityType, dest.entityType),
          eq(sourceConflicts.entityId, entityId),
          eq(sourceConflicts.status, "OPEN"),
        ),
      ),
  ]);

  dest.coordinates = coords.map((c) => ({
    latitude: c.latitude,
    longitude: c.longitude,
    placeName: c.placeName ?? null,
    attribution: c.attribution ?? null,
  }));
  dest.conflicts = conflicts.map((c) => ({ valueA: c.valueA ?? null, valueB: c.valueB ?? null }));
  return dest;
}
