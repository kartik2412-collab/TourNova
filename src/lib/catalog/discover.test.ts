import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import {
  coordinateCandidates,
  dataSources,
  dataSubmissions,
  ingestionItems,
  ingestionRuns,
  ingestionItemStatusEnum,
  sourceConflicts,
  sourceRecords,
  users,
  workflowStatusEnum,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import {
  listVerifiedDestinations,
  listDestinationFacets,
  getVerifiedDestination,
} from "./discover";
import { loadMapPageData } from "./map-data";

let db: Database;
let admin: { id: string; email: string; role: string };

async function seedDestination(opts: {
  entityId: string;
  name?: string;
  category?: string;
  districtName?: string;
  locality?: string;
  status?: string;
  verifiedAt?: Date | null;
  normalizedData?: string | null;
}) {
  const sourceId = randomUUID();
  await db.insert(dataSources).values({
    id: sourceId,
    name: "Test Authority — verified listings",
    organizationName: "Test Authority",
    referenceUrl: "https://example.com/listings",
    sourceType: "OFFICIAL_AUTHORITY",
    license: "CC BY 4.0",
    ingestionStatus: "INGESTED",
    isInternal: false,
    isActive: false,
  });

  const runId = randomUUID();
  await db.insert(ingestionRuns).values({
    id: runId,
    sourceId,
    status: "SUCCEEDED",
    discoveredCount: 1,
    importedCount: 1,
  });

  const recordId = randomUUID();
  await db.insert(sourceRecords).values({
    id: recordId,
    dataSourceId: sourceId,
    entityType: "attraction",
    entityId: opts.entityId,
    rawValue: opts.name ?? opts.entityId,
    value: opts.name ?? opts.entityId,
    referenceUrl: "https://example.com/listings/" + opts.entityId,
    verificationStatus:
      opts.status === ingestionItemStatusEnum.APPROVED ? "VERIFIED" : "UNAVAILABLE",
    verifiedAt: opts.verifiedAt ?? null,
  });

  const submissionId = randomUUID();
  await db.insert(dataSubmissions).values({
    id: submissionId,
    sourceRecordId: recordId,
    targetType: "attraction",
    targetId: opts.entityId,
    payload: opts.name ?? opts.entityId,
    workflowStatus:
      opts.status === ingestionItemStatusEnum.APPROVED
        ? workflowStatusEnum.VERIFIED
        : workflowStatusEnum.PENDING_VERIFICATION,
  });

  const itemId = randomUUID();
  await db.insert(ingestionItems).values({
    id: itemId,
    runId,
    sourceId,
    entityType: "attraction",
    entityId: opts.entityId,
    name: opts.name ?? opts.entityId,
    category: opts.category ?? null,
    districtName: opts.districtName ?? null,
    locality: opts.locality ?? null,
    referenceUrl: "https://example.com/listings/" + opts.entityId,
    rawData: JSON.stringify({ name: opts.name ?? opts.entityId }),
    normalizedData: opts.normalizedData ?? null,
    status: opts.status ?? ingestionItemStatusEnum.PENDING_REVIEW,
    decision: opts.status === ingestionItemStatusEnum.APPROVED ? "APPROVE" : "NONE",
    sourceRecordId: recordId,
    submissionId,
  });

  return { itemId, runId, sourceId, recordId, submissionId };
}

beforeAll(async () => {
  const setup = await createTestDb();
  db = setup.db;
  const adminId = randomUUID();
  await db.insert(users).values({
    id: adminId,
    email: "admin@tournova.test",
    name: "Admin",
    passwordHash: await hashPassword("test-pass-123"),
    role: "ADMIN",
  });
  admin = { id: adminId, email: "admin@tournova.test", role: "ADMIN" };
});

describe("listVerifiedDestinations", () => {
  it("returns only APPROVED items, without inventing missing values", async () => {
    const now = new Date();
    await seedDestination({
      entityId: "approved-fort",
      name: "Approved Fort",
      category: "heritage",
      districtName: "Junagadh",
      locality: "Citadel",
      status: ingestionItemStatusEnum.APPROVED,
      verifiedAt: now,
      normalizedData: JSON.stringify({ description: "A verified description." }),
    });
    await seedDestination({
      entityId: "pending-fort",
      name: "Pending Fort",
      status: ingestionItemStatusEnum.PENDING_REVIEW,
    });

    const list = await listVerifiedDestinations(db);
    const matched = list.filter(
      (d) => d.entityId.startsWith("approved-") || d.entityId === "pending-fort",
    );
    expect(matched).toHaveLength(1);
    expect(matched[0].entityId).toBe("approved-fort");
    expect(matched[0].name).toBe("Approved Fort");
    expect(matched[0].description).toBe("A verified description.");
    expect(matched[0].source.organizationName).toBe("Test Authority");
    expect(matched[0].freshness).toBe("FRESH");
  });

  it("filters by query, category and district", async () => {
    await seedDestination({
      entityId: "temple-with-sculptures",
      name: "Sculpture Temple",
      category: "religious",
      districtName: "Mehsana",
      status: ingestionItemStatusEnum.APPROVED,
    });
    await seedDestination({
      entityId: "paleolithic-caves",
      name: "Paleolithic Caves",
      category: "heritage",
      districtName: "Mehsana",
      status: ingestionItemStatusEnum.APPROVED,
    });

    const byQuery = await listVerifiedDestinations(db, { query: "Sculpture" });
    expect(byQuery.map((d) => d.entityId)).toContain("temple-with-sculptures");
    expect(byQuery.map((d) => d.entityId)).not.toContain("paleolithic-caves");

    const byCategory = await listVerifiedDestinations(db, { category: "religious" });
    expect(byCategory).toHaveLength(1);
    expect(byCategory[0].entityId).toBe("temple-with-sculptures");

    const byDistrict = await listVerifiedDestinations(db, { district: "Mehsana" });
    expect(byDistrict.length).toBeGreaterThanOrEqual(2);
  });
});

describe("listDestinationFacets", () => {
  it("returns distinct categories and districts of the approved set", async () => {
    const facets = await listDestinationFacets(db);
    expect(facets.categories).toContain("heritage");
    expect(facets.categories).toContain("religious");
    expect(facets.districts).toContain("Junagadh");
  });
});

describe("getVerifiedDestination", () => {
  it("attaches approved coordinates and open conflicts", async () => {
    await seedDestination({
      entityId: "siddhpur-stepwell",
      name: "Siddhpur Stepwell",
      category: "heritage",
      districtName: "Patan",
      status: ingestionItemStatusEnum.APPROVED,
      verifiedAt: new Date(),
    });

    const ccId = randomUUID();
    await db.insert(coordinateCandidates).values({
      id: ccId,
      entityType: "attraction",
      entityId: "siddhpur-stepwell",
      latitude: 23.847,
      longitude: 72.083,
      source: "MANUAL",
      provider: "manual",
      placeName: "Siddhpur stepwell (official)",
      attribution: "Test Authority survey",
      status: "APPROVED",
      decision: "APPROVED",
      decidedById: admin.id,
      decidedAt: new Date(),
    });

    const [recA] = await db
      .select({ id: sourceRecords.id, dataSourceId: sourceRecords.dataSourceId })
      .from(sourceRecords)
      .where(eq(sourceRecords.entityId, "siddhpur-stepwell"))
      .limit(1);
    const recB = randomUUID();
    await db.insert(sourceRecords).values({
      id: recB,
      dataSourceId: recA!.dataSourceId,
      entityType: "attraction",
      entityId: "siddhpur-stepwell",
      rawValue: "Siddhpur Vav",
      value: "Siddhpur Vav",
      verificationStatus: "UNAVAILABLE",
    });
    await db.insert(sourceConflicts).values({
      id: randomUUID(),
      entityType: "attraction",
      entityId: "siddhpur-stepwell",
      recordAId: recA!.id,
      recordBId: recB,
      valueA: "Siddhpur Stepwell",
      valueB: "Siddhpur Vav",
      status: "OPEN",
      createdById: admin.id,
    });

    const dest = await getVerifiedDestination(db, "siddhpur-stepwell");
    expect(dest).not.toBeNull();
    expect(dest!.coordinates).toHaveLength(1);
    expect(dest!.coordinates[0]!.latitude).toBe(23.847);
    expect(dest!.conflicts).toHaveLength(1);
    expect(dest!.conflicts[0]!.valueA).toBe("Siddhpur Stepwell");
    expect(dest!.conflicts[0]!.valueB).toBe("Siddhpur Vav");
  });

  it("returns null for an entity with no approved destination", async () => {
    const dest = await getVerifiedDestination(db, "does-not-exist");
    expect(dest).toBeNull();
  });
});

describe("loadMapPageData", () => {
  it("shows a pin only for entities whose item AND coordinate are approved", async () => {
    await seedDestination({
      entityId: "mapped-fort",
      name: "Mapped Fort",
      status: ingestionItemStatusEnum.APPROVED,
      verifiedAt: new Date(),
    });
    await seedDestination({
      entityId: "unmapped-fort",
      name: "Unmapped Fort",
      status: ingestionItemStatusEnum.APPROVED,
      verifiedAt: new Date(),
    });

    await db.insert(coordinateCandidates).values({
      id: randomUUID(),
      entityType: "attraction",
      entityId: "mapped-fort",
      latitude: 23.0,
      longitude: 72.0,
      source: "MANUAL",
      provider: "manual",
      status: "APPROVED",
      decision: "APPROVED",
      decidedById: admin.id,
      decidedAt: new Date(),
    });
    // An approved candidate whose entity was never approved → must NOT appear.
    await db.insert(coordinateCandidates).values({
      id: randomUUID(),
      entityType: "attraction",
      entityId: "ghost",
      latitude: 23.1,
      longitude: 72.1,
      source: "MANUAL",
      provider: "manual",
      status: "APPROVED",
      decision: "APPROVED",
      decidedById: admin.id,
      decidedAt: new Date(),
    });

    const data = await loadMapPageData(db);
    const ids = data.points.map((p) => p.id);
    expect(ids).toContain("attraction:mapped-fort");
    expect(ids).not.toContain("attraction:ghost");
    expect(data.points.find((p) => p.id === "attraction:mapped-fort")!.name).toBe("Mapped Fort");
  });
});
