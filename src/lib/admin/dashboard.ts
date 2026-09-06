import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  auditLogs,
  coordinateCandidates,
  crowdObservations,
  dataSources,
  ingestionItems,
  ingestionItemStatusEnum,
  priceRecords,
  sourceConflicts,
  verificationStatusEnum,
} from "@/lib/db/schema";
import type { Database } from "@/lib/db";

/**
 * ADMIN DASHBOARD SERVICE
 * -----------------------
 * Aggregated, efficient queries for the command-center overview.
 * Each function issues the minimum number of queries needed.
 * All counts come from real database state — never fabricated.
 */

export interface DashboardSummary {
  pendingIngestion: number;
  openConflicts: number;
  pendingPriceReports: number;
  pendingCrowdReports: number;
  publishedRecords: number;
  unavailableRecords: number;
  activeSources: number;
  totalDestinations: number;
  pendingGeoCandidates: number;
  recentAuditCount: number;
}

export async function getDashboardSummary(db: Database): Promise<DashboardSummary> {
  const [
    [pendingIngestion],
    [openConflicts],
    [pendingPriceReports],
    [pendingCrowdReports],
    [publishedRecords],
    [unavailableRecords],
    [activeSources],
    [totalDestinations],
    [pendingGeoCandidates],
    [recentAuditCount],
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(ingestionItems)
      .where(eq(ingestionItems.status, ingestionItemStatusEnum.PENDING_REVIEW)),
    db.select({ n: count() }).from(sourceConflicts).where(eq(sourceConflicts.status, "OPEN")),
    db
      .select({ n: count() })
      .from(priceRecords)
      .where(
        and(
          eq(priceRecords.priceType, "USER_REPORT"),
          eq(priceRecords.verificationStatus, verificationStatusEnum.USER_REPORTED),
        ),
      ),
    db
      .select({ n: count() })
      .from(crowdObservations)
      .where(eq(crowdObservations.verificationStatus, verificationStatusEnum.USER_REPORTED)),
    db
      .select({ n: count() })
      .from(ingestionItems)
      .where(eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED)),
    db
      .select({ n: count() })
      .from(ingestionItems)
      .where(eq(ingestionItems.status, ingestionItemStatusEnum.UNAVAILABLE)),
    db.select({ n: count() }).from(dataSources).where(eq(dataSources.isActive, true)),
    db
      .select({ n: count() })
      .from(ingestionItems)
      .where(eq(ingestionItems.status, ingestionItemStatusEnum.APPROVED)),
    db
      .select({ n: count() })
      .from(coordinateCandidates)
      .where(eq(coordinateCandidates.status, "PENDING_REVIEW")),
    db
      .select({ n: count() })
      .from(auditLogs)
      .where(sql`${auditLogs.createdAt} > NOW() - INTERVAL '7 days'`),
  ]);

  return {
    pendingIngestion: pendingIngestion?.n ?? 0,
    openConflicts: openConflicts?.n ?? 0,
    pendingPriceReports: pendingPriceReports?.n ?? 0,
    pendingCrowdReports: pendingCrowdReports?.n ?? 0,
    publishedRecords: publishedRecords?.n ?? 0,
    unavailableRecords: unavailableRecords?.n ?? 0,
    activeSources: activeSources?.n ?? 0,
    totalDestinations: totalDestinations?.n ?? 0,
    pendingGeoCandidates: pendingGeoCandidates?.n ?? 0,
    recentAuditCount: recentAuditCount?.n ?? 0,
  };
}

export interface AttentionItem {
  id: string;
  type: "conflict" | "ingestion" | "price_report" | "crowd_report" | "geo_candidate";
  entity: string;
  source: string;
  status: string;
  submittedAt: Date;
  priority: number;
}

export async function getAttentionQueue(db: Database): Promise<AttentionItem[]> {
  const [conflicts, pendingItems, priceReports, crowdReports, geoCandidates] = await Promise.all([
    db
      .select({
        id: sourceConflicts.id,
        entity: sourceConflicts.entityId,
        status: sourceConflicts.status,
        submittedAt: sourceConflicts.createdAt,
      })
      .from(sourceConflicts)
      .where(eq(sourceConflicts.status, "OPEN"))
      .orderBy(desc(sourceConflicts.createdAt))
      .limit(10),
    db
      .select({
        id: ingestionItems.id,
        entity: ingestionItems.name,
        status: ingestionItems.status,
        sourceId: ingestionItems.sourceId,
        submittedAt: ingestionItems.createdAt,
      })
      .from(ingestionItems)
      .where(eq(ingestionItems.status, ingestionItemStatusEnum.PENDING_REVIEW))
      .orderBy(desc(ingestionItems.createdAt))
      .limit(10),
    db
      .select({
        id: priceRecords.id,
        entity: priceRecords.targetId,
        status: priceRecords.verificationStatus,
        submittedAt: priceRecords.createdAt,
      })
      .from(priceRecords)
      .where(
        and(
          eq(priceRecords.priceType, "USER_REPORT"),
          eq(priceRecords.verificationStatus, verificationStatusEnum.USER_REPORTED),
        ),
      )
      .orderBy(desc(priceRecords.createdAt))
      .limit(10),
    db
      .select({
        id: crowdObservations.id,
        entity: crowdObservations.attractionId,
        status: crowdObservations.verificationStatus,
        submittedAt: crowdObservations.createdAt,
      })
      .from(crowdObservations)
      .where(eq(crowdObservations.verificationStatus, verificationStatusEnum.USER_REPORTED))
      .orderBy(desc(crowdObservations.createdAt))
      .limit(10),
    db
      .select({
        id: coordinateCandidates.id,
        entity: coordinateCandidates.entityId,
        status: coordinateCandidates.status,
        submittedAt: coordinateCandidates.createdAt,
      })
      .from(coordinateCandidates)
      .where(eq(coordinateCandidates.status, "PENDING_REVIEW"))
      .orderBy(desc(coordinateCandidates.createdAt))
      .limit(10),
  ]);

  const items: AttentionItem[] = [
    ...conflicts.map((c) => ({
      id: c.id,
      type: "conflict" as const,
      entity: c.entity,
      source: "",
      status: c.status,
      submittedAt: c.submittedAt,
      priority: 1,
    })),
    ...pendingItems.map((i) => ({
      id: i.id,
      type: "ingestion" as const,
      entity: i.entity ?? i.id,
      source: i.sourceId,
      status: i.status,
      submittedAt: i.submittedAt,
      priority: 2,
    })),
    ...priceReports.map((p) => ({
      id: p.id,
      type: "price_report" as const,
      entity: p.entity,
      source: "",
      status: p.status,
      submittedAt: p.submittedAt,
      priority: 3,
    })),
    ...crowdReports.map((c) => ({
      id: c.id,
      type: "crowd_report" as const,
      entity: c.entity,
      source: "",
      status: c.status,
      submittedAt: c.submittedAt,
      priority: 4,
    })),
    ...geoCandidates.map((g) => ({
      id: g.id,
      type: "geo_candidate" as const,
      entity: g.entity,
      source: "",
      status: g.status,
      submittedAt: g.submittedAt,
      priority: 5,
    })),
  ];

  items.sort(
    (a, b) => a.priority - b.priority || b.submittedAt.getTime() - a.submittedAt.getTime(),
  );
  return items.slice(0, 30);
}
