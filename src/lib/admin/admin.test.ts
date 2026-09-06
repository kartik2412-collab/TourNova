import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import {
  auditLogs,
  attractions,
  coordinateCandidates,
  crowdObservations,
  dataSources,
  destinations,
  ingestionItems,
  ingestionRuns,
  priceRecords,
  sourceConflicts,
  sourceRecords,
  users,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { getDashboardSummary, getAttentionQueue } from "@/lib/admin/dashboard";
import { getDataQualitySummary, listQualityIssues } from "@/lib/admin/data-quality";
import { listRecentAuditLogs } from "@/lib/admin/audit";

let db: Database;
let admin: { id: string; email: string };

async function makeUser(database: Database, email: string, role: string) {
  const id = randomUUID();
  await database.insert(users).values({
    id,
    email,
    name: email.split("@")[0],
    passwordHash: await hashPassword("test-pass-123"),
    role,
  });
  return { id, email };
}

async function makeSource(database: Database, name: string, active: boolean) {
  const id = randomUUID();
  await database.insert(dataSources).values({
    id,
    name,
    sourceType: "OFFICIAL_GOVERNMENT",
    isActive: active,
  });
  return id;
}

async function makeRun(database: Database, sourceId: string) {
  const id = randomUUID();
  await database.insert(ingestionRuns).values({ id, sourceId });
  return id;
}

async function makeItem(
  database: Database,
  runId: string,
  sourceId: string,
  status: string,
  overrides: Partial<typeof ingestionItems.$inferInsert> = {},
) {
  const entityId = overrides.entityId ?? randomUUID();
  await database.insert(ingestionItems).values({
    id: randomUUID(),
    runId,
    sourceId,
    entityType: "destination",
    entityId,
    name: overrides.name ?? `Place ${entityId.slice(0, 4)}`,
    districtName: overrides.districtName !== undefined ? overrides.districtName : "Mehsana",
    latitude: overrides.latitude !== undefined ? overrides.latitude : "23.6",
    longitude: overrides.longitude !== undefined ? overrides.longitude : "72.3",
    rawData: overrides.rawData ?? JSON.stringify({ description: "A real description." }),
    normalizedData:
      overrides.normalizedData ?? JSON.stringify({ description: "A real description." }),
    status,
  });
  return entityId;
}

async function makeRecord(database: Database, sourceId: string, value: string) {
  const id = randomUUID();
  await database.insert(sourceRecords).values({
    id,
    dataSourceId: sourceId,
    entityType: "destination",
    entityId: randomUUID(),
    rawValue: value,
    value,
    verificationStatus: "VERIFIED",
  });
  return id;
}

beforeAll(async () => {
  const setup = await createTestDb();
  db = setup.db;
  admin = await makeUser(db, "admin@tournova.test", "ADMIN");
});

describe("getDashboardSummary (empty database)", () => {
  it("returns honest zero counts", async () => {
    const fresh = (await createTestDb()).db;
    const summary = await getDashboardSummary(fresh);
    expect(summary).toEqual({
      pendingIngestion: 0,
      openConflicts: 0,
      pendingPriceReports: 0,
      pendingCrowdReports: 0,
      publishedRecords: 0,
      unavailableRecords: 0,
      activeSources: 0,
      totalDestinations: 0,
      pendingGeoCandidates: 0,
      recentAuditCount: 0,
    });
  });
});

describe("getDashboardSummary (seeded)", () => {
  it("counts every metric from real database rows", async () => {
    const srcActive = await makeSource(db, "Active source", true);
    await makeSource(db, "Inactive source", false);
    const run = await makeRun(db, srcActive);

    await makeItem(db, run, srcActive, "PENDING_REVIEW");
    await makeItem(db, run, srcActive, "APPROVED");
    await makeItem(db, run, srcActive, "UNAVAILABLE");
    await makeItem(db, run, srcActive, "REJECTED");

    const recordA = await makeRecord(db, srcActive, "100");
    const recordB = await makeRecord(db, srcActive, "200");
    await db.insert(sourceConflicts).values({
      id: randomUUID(),
      entityType: "destination",
      entityId: randomUUID(),
      recordAId: recordA,
      recordBId: recordB,
      valueA: "100",
      valueB: "200",
      status: "OPEN",
    });

    await db.insert(priceRecords).values({
      id: randomUUID(),
      targetType: "attraction",
      targetId: randomUUID(),
      category: "OTHER",
      priceType: "USER_REPORT",
      amount: "50",
      verificationStatus: "USER_REPORTED",
    });

    const destId = randomUUID();
    await db.insert(destinations).values({ id: destId, slug: randomUUID(), name: "Dest" });
    const attractionId = randomUUID();
    await db.insert(attractions).values({
      id: attractionId,
      slug: randomUUID(),
      destinationId: destId,
      name: "Attraction",
    });
    await db.insert(crowdObservations).values({
      id: randomUUID(),
      attractionId,
      sourceType: "USER_REPORTED",
      verificationStatus: "USER_REPORTED",
    });

    await db.insert(coordinateCandidates).values({
      id: randomUUID(),
      entityType: "destination",
      entityId: randomUUID(),
      latitude: 23.6,
      longitude: 72.3,
      status: "PENDING_REVIEW",
    });

    await db.insert(auditLogs).values({
      userId: admin.id,
      action: "INGESTION_ITEM_DECIDED",
      entityType: "ingestion_item",
    });

    const summary = await getDashboardSummary(db);
    expect(summary.pendingIngestion).toBe(1);
    expect(summary.openConflicts).toBe(1);
    expect(summary.pendingPriceReports).toBe(1);
    expect(summary.pendingCrowdReports).toBe(1);
    expect(summary.publishedRecords).toBe(1);
    expect(summary.unavailableRecords).toBe(1);
    expect(summary.activeSources).toBe(1);
    expect(summary.totalDestinations).toBe(1);
    expect(summary.pendingGeoCandidates).toBe(1);
    expect(summary.recentAuditCount).toBeGreaterThanOrEqual(1);
  });
});

describe("getAttentionQueue", () => {
  it("returns an empty queue when nothing needs attention", async () => {
    const fresh = (await createTestDb()).db;
    const queue = await getAttentionQueue(fresh);
    expect(queue).toEqual([]);
  });

  it("prioritises conflicts over pending review", async () => {
    const fresh = (await createTestDb()).db;
    const src = await makeSource(fresh, "S", true);
    const run = await makeRun(fresh, src);
    await makeItem(fresh, run, src, "PENDING_REVIEW");
    const ra = await makeRecord(fresh, src, "a");
    const rb = await makeRecord(fresh, src, "b");
    await fresh.insert(sourceConflicts).values({
      id: randomUUID(),
      entityType: "destination",
      entityId: randomUUID(),
      recordAId: ra,
      recordBId: rb,
      valueA: "a",
      valueB: "b",
      status: "OPEN",
    });
    const queue = await getAttentionQueue(fresh);
    expect(queue.length).toBe(2);
    expect(queue[0].type).toBe("conflict");
    expect(queue[0].priority).toBe(1);
    expect(queue[1].type).toBe("ingestion");
  });
});

describe("getDataQualitySummary", () => {
  it("reports real completeness gaps without inventing them", async () => {
    const fresh = (await createTestDb()).db;
    const src = await makeSource(fresh, "Quality source", true);
    const run = await makeRun(fresh, src);

    await makeItem(fresh, run, src, "APPROVED", {
      latitude: null,
      longitude: "72.3",
      normalizedData: "{}",
      rawData: "{}",
      districtName: null,
    });
    await makeItem(fresh, run, src, "APPROVED", { latitude: "23.6", longitude: "72.3" });
    await makeItem(fresh, run, src, "PENDING_REVIEW", {
      latitude: "23.6",
      longitude: "72.3",
    });

    const summary = await getDataQualitySummary(fresh);
    expect(summary.pendingReview).toBe(1);
    expect(summary.approved).toBe(2);
    expect(summary.missingCoordinates).toBe(1);
    expect(summary.missingDescription).toBe(1);
    expect(summary.missingDistrict).toBe(1);

    const issues = await listQualityIssues(fresh, { limit: 5 });
    const kinds = issues.map((i) => i.kind);
    expect(kinds).toContain("missing_coordinates");
    expect(kinds).toContain("missing_description");
    expect(kinds).toContain("missing_district");
    expect(issues.length).toBeLessThanOrEqual(5);
  });
});

describe("listRecentAuditLogs", () => {
  it("never leaks secret or session data", async () => {
    await db.insert(auditLogs).values([
      {
        userId: admin.id,
        action: "USER_ROLE_CHANGED",
        entityType: "user",
        metadata: JSON.stringify({ newRole: "ADMIN" }),
      },
      {
        userId: null,
        action: "SECURITY_EVENT",
        entityType: "request",
      },
    ]);
    const entries = await listRecentAuditLogs(db, { limit: 50 });
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (const entry of entries) {
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain("passwordHash");
      expect(serialized).not.toContain("tokenHash");
      expect(serialized).not.toContain("csrfToken");
      expect(serialized).not.toContain("DATABASE_URL");
      expect(serialized).not.toContain("AUTH_SECRET");
      expect(serialized).not.toContain("newRole");
    }
    expect(entries.every((e) => typeof e.action === "string")).toBe(true);
  });

  it("filters by action and respects the limit", async () => {
    const entries = await listRecentAuditLogs(db, { action: "SECURITY_EVENT", limit: 1 });
    expect(entries.length).toBeLessThanOrEqual(1);
    for (const e of entries) expect(e.action).toBe("SECURITY_EVENT");
  });
});
