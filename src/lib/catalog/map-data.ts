import { and, count, desc, eq } from "drizzle-orm";
import { coordinateCandidates, ingestionItems, ingestionItemStatusEnum } from "@/lib/db/schema";
import { resolveMapProvider } from "@/lib/geo/map-provider";
import type { Database } from "@/lib/db";
import type { MapPoint } from "@/components/map/destination-map";

/**
 * MAP DATA (Milestone 3D)
 * -----------------------
 * The public map is drawn ONLY from APPROVED coordinate candidates. A candidate
 * is a coordinate offered by a reviewer or a geocoding provider; until a human
 * marks it APPROVED it is never shown publicly. If an approved candidate's
 * entity is not itself approved for publication, it is not shown either.
 */

export interface MapPageData {
  points: MapPoint[];
  verifiedDestinationCount: number;
  pendingCandidatesCount: number;
}

export async function loadMapPageData(db: Database): Promise<MapPageData> {
  const [candidates, counts] = await Promise.all([
    db
      .select({
        latitude: coordinateCandidates.latitude,
        longitude: coordinateCandidates.longitude,
        entityType: coordinateCandidates.entityType,
        entityId: coordinateCandidates.entityId,
        placeName: coordinateCandidates.placeName,
        decidedAt: coordinateCandidates.decidedAt,
        itemName: ingestionItems.name,
        itemCategory: ingestionItems.category,
      })
      .from(coordinateCandidates)
      .leftJoin(
        ingestionItems,
        and(
          eq(coordinateCandidates.entityType, ingestionItems.entityType),
          eq(coordinateCandidates.entityId, ingestionItems.entityId),
          eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED),
        ),
      )
      .where(eq(coordinateCandidates.status, "APPROVED"))
      .orderBy(desc(coordinateCandidates.decidedAt)),
    db
      .select({ n: count() })
      .from(coordinateCandidates)
      .where(eq(coordinateCandidates.status, "PENDING_REVIEW")),
  ]);

  // One pin per entity — the most recently approved candidate wins. Only
  // entities whose item is itself APPROVED for publication are shown.
  const seen = new Set<string>();
  const points: MapPoint[] = [];
  for (const c of candidates) {
    if (c.itemName === null) continue;
    const key = `${c.entityType}:${c.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push({
      id: key,
      name: c.itemName ?? c.placeName ?? c.entityId,
      category: c.itemCategory,
      latitude: c.latitude,
      longitude: c.longitude,
      href: `/discover/${encodeURIComponent(c.entityId)}`,
    });
  }

  return {
    points,
    verifiedDestinationCount: points.length,
    pendingCandidatesCount: counts[0]?.n ?? 0,
  };
}

export { resolveMapProvider };
