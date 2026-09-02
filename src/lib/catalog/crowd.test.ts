import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import {
  attractions,
  crowdObservations,
  crowdSourceEnum,
  dataSources,
  destinations,
  sourceRecords,
  users,
  verificationStatusEnum,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { decideCrowdReport, listCrowdReports, listPublicCrowd, submitCrowdReport } from "./crowd";

let db: Database;
let admin: { id: string; email: string; role: string };
let tourist: { id: string; email: string; name: string };

beforeAll(async () => {
  const setup = await createTestDb();
  db = setup.db;

  const adminId = randomUUID();
  await db.insert(users).values({
    id: adminId,
    email: "admin@tournova.test",
    name: "Admin Reviewer",
    passwordHash: await hashPassword("test-pass-123"),
    role: "ADMIN",
  });
  admin = { id: adminId, email: "admin@tournova.test", role: "ADMIN" };

  const touristId = randomUUID();
  await db.insert(users).values({
    id: touristId,
    email: "tourist@tournova.test",
    name: "Tourist User",
    passwordHash: await hashPassword("test-pass-123"),
    role: "TOURIST",
  });
  tourist = { id: touristId, email: "tourist@tournova.test", name: "Tourist User" };
});

async function ensureAttractionExists(attractionId: string) {
  const destId = randomUUID();
  await db
    .insert(destinations)
    .values({
      id: destId,
      slug: `dest-${attractionId}-${randomUUID().slice(0, 6)}`,
      name: `Destination for ${attractionId}`,
    })
    .onConflictDoNothing();

  await db
    .insert(attractions)
    .values({
      id: attractionId,
      slug: `attraction-${attractionId}-${randomUUID().slice(0, 6)}`,
      destinationId: destId,
      name: `Attraction ${attractionId}`,
    })
    .onConflictDoNothing();
}

async function seedCrowdObservation(opts: {
  attractionId: string;
  crowdLevel: number;
  status: string;
  verifiedAt?: Date | null;
  capturedAt?: Date;
}) {
  await ensureAttractionExists(opts.attractionId);

  const sourceId = randomUUID();
  await db.insert(dataSources).values({
    id: sourceId,
    name: "Statue of Unity Traffic Counter",
    organizationName: "Gujarat Tourism Board",
    referenceUrl: "https://example.com/counters",
    sourceType: "AUTHORITATIVE_API",
    ingestionStatus: "PUBLISHED",
    isInternal: false,
    isActive: true,
    reliability: "HIGH",
  });

  const recordId = randomUUID();
  await db.insert(sourceRecords).values({
    id: recordId,
    dataSourceId: sourceId,
    entityType: "attraction",
    entityId: opts.attractionId,
    rawValue: String(opts.crowdLevel),
    value: String(opts.crowdLevel),
    referenceUrl: "https://example.com/counters",
    verificationStatus: opts.status,
    verifiedAt: opts.verifiedAt ?? null,
  });

  await db.insert(crowdObservations).values({
    id: randomUUID(),
    attractionId: opts.attractionId,
    sourceType: crowdSourceEnum.AUTHORITATIVE,
    count: 450,
    capacity: 1000,
    crowdLevel: opts.crowdLevel,
    verificationStatus: opts.status,
    sourceRecordId: recordId,
    capturedAt: opts.capturedAt ?? new Date(),
  });
}

describe("Public Crowd Catalog (listPublicCrowd)", () => {
  it("returns ONLY verified/live observations, hiding unverified and rejected observations", async () => {
    await seedCrowdObservation({
      attractionId: "statue-of-unity",
      crowdLevel: 45,
      status: verificationStatusEnum.LIVE,
      verifiedAt: new Date(),
    });

    await seedCrowdObservation({
      attractionId: "gir-national-park",
      crowdLevel: 90,
      status: verificationStatusEnum.USER_REPORTED,
    });

    const publicCrowd = await listPublicCrowd(db);
    expect(publicCrowd).toHaveLength(1);
    expect(publicCrowd[0]!.attractionId).toBe("statue-of-unity");
    expect(publicCrowd[0]!.crowdLevel).toBe(45);
    expect(publicCrowd[0]!.source.name).toBe("Statue of Unity Traffic Counter");
    expect(publicCrowd[0]!.source.reliability).toBe("HIGH");
  });

  it("filters public crowd observations by entityId", async () => {
    const byEntity = await listPublicCrowd(db, { entityId: "statue-of-unity" });
    expect(byEntity).toHaveLength(1);

    const none = await listPublicCrowd(db, { entityId: "non-existent-park" });
    expect(none).toHaveLength(0);
  });

  it("distinguishes FRESH vs STALE observations correctly based on age", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await seedCrowdObservation({
      attractionId: "old-fort",
      crowdLevel: 20,
      status: verificationStatusEnum.VERIFIED,
      verifiedAt: twoHoursAgo,
      capturedAt: twoHoursAgo,
    });

    const results = await listPublicCrowd(db, { entityId: "old-fort" });
    expect(results).toHaveLength(1);
    expect(results[0]!.freshness).toBe("STALE");
  });

  it("returns empty array when no verified observations exist", async () => {
    const emptyResults = await listPublicCrowd(db, { entityId: "empty-place" });
    expect(emptyResults).toHaveLength(0);
  });
});

describe("Community Crowd Reporting & Admin Review Workflow", () => {
  let submittedObsId: string;

  it("allows authenticated user to submit a crowd report which stays hidden as unverified claim", async () => {
    await ensureAttractionExists("sun-temple-modhera");

    const submitted = await submitCrowdReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      userName: tourist.name,
      targetType: "attraction",
      targetId: "sun-temple-modhera",
      crowdLevel: 75,
      count: 300,
      capacity: 400,
      description: "Very busy at noon",
      note: "Observed live in person",
    });

    submittedObsId = submitted.observationId;
    expect(submitted.verificationStatus).toBe("USER_REPORTED");
    expect(submitted.workflowStatus).toBe("SUBMITTED");

    // Must be hidden from public crowd catalog
    const publicList = await listPublicCrowd(db, { entityId: "sun-temple-modhera" });
    expect(publicList).toHaveLength(0);

    // Must appear in admin report queue
    const adminQueue = await listCrowdReports(db);
    const found = adminQueue.find((r) => r.id === submittedObsId);
    expect(found).toBeDefined();
    expect(found!.crowdLevel).toBe(75);
    expect(found!.submitterEmail).toBe(tourist.email);
  });

  it("admin rejection keeps observation hidden and updates status to REJECTED", async () => {
    const result = await decideCrowdReport(db, {
      observationId: submittedObsId,
      reviewer: admin,
      decision: "REJECT",
      note: "Unverified claims",
    });

    expect(result.verificationStatus).toBe("REJECTED");

    // Remains hidden from public crowd catalog
    const publicList = await listPublicCrowd(db, { entityId: "sun-temple-modhera" });
    expect(publicList).toHaveLength(0);
  });

  it("admin approval promotes observation to VERIFIED and surfaces it publicly", async () => {
    await ensureAttractionExists("rann-of-kutch");

    // Submit a new report
    const newReport = await submitCrowdReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      userName: tourist.name,
      targetType: "attraction",
      targetId: "rann-of-kutch",
      crowdLevel: 40,
      count: 200,
      capacity: 500,
      description: "Moderate sunset crowd",
    });

    // Admin approves
    const decisionResult = await decideCrowdReport(db, {
      observationId: newReport.observationId,
      reviewer: admin,
      decision: "APPROVE",
      note: "Confirmed with ticket counter",
    });

    expect(decisionResult.verificationStatus).toBe("VERIFIED");

    // Now MUST be publicly visible!
    const publicList = await listPublicCrowd(db, { entityId: "rann-of-kutch" });
    expect(publicList).toHaveLength(1);
    expect(publicList[0]!.crowdLevel).toBe(40);
    expect(publicList[0]!.count).toBe(200);
  });
});
