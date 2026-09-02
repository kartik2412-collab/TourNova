import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import {
  attractions,
  dataSources,
  dataSubmissions,
  destinations,
  ingestionItems,
  ingestionRuns,
  ingestionItemStatusEnum,
  sourceRecords,
  users,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { decideItem } from "./review";
import { submitCrowdReport } from "@/lib/catalog/crowd";

let db: Database;
let admin: { id: string; email: string; role: string; name: string };
let sourceId: string;
let runId: string;

beforeAll(async () => {
  const setup = await createTestDb();
  db = setup.db;

  const adminId = randomUUID();
  await db.insert(users).values({
    id: adminId,
    email: "admin-sync@tournova.test",
    name: "Admin Reviewer",
    passwordHash: await hashPassword("test-pass-123"),
    role: "ADMIN",
  });
  admin = { id: adminId, email: "admin-sync@tournova.test", role: "ADMIN", name: "Admin Reviewer" };

  sourceId = randomUUID();
  await db.insert(dataSources).values({
    id: sourceId,
    name: "Gujarat Tourism Test Feed",
    organizationName: "Gujarat Tourism Board",
    sourceType: "OFFICIAL_AUTHORITY",
    ingestionStatus: "INGESTED",
    isInternal: false,
    isActive: true,
  });

  runId = randomUUID();
  await db.insert(ingestionRuns).values({
    id: runId,
    sourceId,
    status: "SUCCEEDED",
    discoveredCount: 1,
    importedCount: 1,
  });
});

async function createIngestionItemFixture(opts: {
  entityId: string;
  entityType?: string;
  name: string;
  category?: string;
  districtName?: string;
}) {
  const sourceRecordId = randomUUID();
  await db.insert(sourceRecords).values({
    id: sourceRecordId,
    dataSourceId: sourceId,
    entityType: opts.entityType ?? "attraction",
    entityId: opts.entityId,
    rawValue: JSON.stringify({ name: opts.name }),
    value: JSON.stringify({ name: opts.name }),
    verificationStatus: "USER_REPORTED",
  });

  const submissionId = randomUUID();
  await db.insert(dataSubmissions).values({
    id: submissionId,
    sourceRecordId,
    targetType: opts.entityType ?? "attraction",
    targetId: opts.entityId,
    payload: opts.name,
    workflowStatus: "PENDING_VERIFICATION",
  });

  const itemId = randomUUID();
  await db.insert(ingestionItems).values({
    id: itemId,
    runId,
    sourceId,
    entityType: opts.entityType ?? "attraction",
    entityId: opts.entityId,
    name: opts.name,
    category: opts.category ?? "HERITAGE",
    districtName: opts.districtName ?? "Patan",
    status: ingestionItemStatusEnum.PENDING_REVIEW,
    decision: "NONE",
    sourceRecordId,
    submissionId,
  });

  return { itemId, submissionId, sourceRecordId };
}

describe("Approval → Relational Synchronization (Chunk 2)", () => {
  it("1. Approving an ingestion item creates the required relational records in attractions & destinations", async () => {
    const { itemId } = await createIngestionItemFixture({
      entityId: "rani-ki-vav-sync-test",
      entityType: "attraction",
      name: "Rani Ki Vav Patan",
      districtName: "Patan",
    });

    const success = await decideItem(db, {
      itemId,
      reviewer: admin,
      decision: "APPROVE",
      reason: "Verified against ASI source",
    });

    expect(success).toBe(true);

    // Verify item status updated
    const items = await db
      .select({ status: ingestionItems.status })
      .from(ingestionItems)
      .where(eq(ingestionItems.id, itemId));
    expect(items[0]?.status).toBe("APPROVED");

    // Verify relational attraction row exists
    const atts = await db
      .select()
      .from(attractions)
      .where(eq(attractions.id, "rani-ki-vav-sync-test"));
    expect(atts).toHaveLength(1);
    expect(atts[0]!.name).toBe("Rani Ki Vav Patan");

    // Verify relational destination row exists
    const dests = await db
      .select()
      .from(destinations)
      .where(eq(destinations.id, atts[0]!.destinationId));
    expect(dests.length).toBeGreaterThan(0);
  });

  it("2. Re-approving / synchronizing an already-synchronized item updates existing records without duplicate creation", async () => {
    const attsBefore = await db.select().from(attractions);
    const countBefore = attsBefore.length;

    // Create item for an already-synchronized entity ID
    const { itemId } = await createIngestionItemFixture({
      entityId: "rani-ki-vav-sync-test",
      entityType: "attraction",
      name: "Rani Ki Vav Patan (Updated Name)",
      districtName: "Patan",
    });

    await decideItem(db, {
      itemId,
      reviewer: admin,
      decision: "APPROVE",
      reason: "Second approval run",
    });

    const attsAfter = await db.select().from(attractions);
    expect(attsAfter.length).toBe(countBefore); // No new duplicates

    const updatedAtt = attsAfter.find((a) => a.id === "rani-ki-vav-sync-test");
    expect(updatedAtt).toBeDefined();
    expect(updatedAtt!.name).toBe("Rani Ki Vav Patan (Updated Name)");
  });

  it("3. Downstream crowd report creation references the synchronized attraction without foreign key failure", async () => {
    // Submit crowd report for the synchronized attraction ID "rani-ki-vav-sync-test"
    const crowdReport = await submitCrowdReport(db, {
      userId: admin.id,
      userEmail: admin.email,
      userName: admin.name,
      targetType: "attraction",
      targetId: "rani-ki-vav-sync-test",
      crowdLevel: 60,
      count: 150,
      capacity: 300,
    });

    expect(crowdReport).toBeDefined();
    expect(crowdReport.targetId).toBe("rani-ki-vav-sync-test");
    expect(crowdReport.verificationStatus).toBe("USER_REPORTED");
  });

  it("4. Approval failure (transaction error) rolls back approval state, leaving item PENDING_REVIEW", async () => {
    // Create an item with a submission that will fail during reviewSubmission or sync
    const { itemId, submissionId } = await createIngestionItemFixture({
      entityId: "rollback-test-entity",
      entityType: "attraction",
      name: "Rollback Test Spot",
    });

    // Delete submission to trigger a TrustError inside transaction after decideItem starts
    await db.delete(dataSubmissions).where(eq(dataSubmissions.id, submissionId));

    await expect(
      decideItem(db, {
        itemId,
        reviewer: admin,
        decision: "APPROVE",
      }),
    ).rejects.toThrow();

    // Verify item remains PENDING_REVIEW due to transaction rollback
    const items = await db
      .select({ status: ingestionItems.status })
      .from(ingestionItems)
      .where(eq(ingestionItems.id, itemId));
    expect(items[0]?.status).toBe("PENDING_REVIEW");

    // Verify attraction was not created
    const atts = await db
      .select()
      .from(attractions)
      .where(eq(attractions.id, "rollback-test-entity"));
    expect(atts).toHaveLength(0);
  });

  it("5. Conflict / unapproved records (REJECT decision) do not synchronize relational entities", async () => {
    const { itemId } = await createIngestionItemFixture({
      entityId: "rejected-test-entity",
      entityType: "attraction",
      name: "Rejected Fake Site",
    });

    await decideItem(db, {
      itemId,
      reviewer: admin,
      decision: "REJECT",
      reason: "Spam or unverified entry",
    });

    const items = await db
      .select({ status: ingestionItems.status })
      .from(ingestionItems)
      .where(eq(ingestionItems.id, itemId));
    expect(items[0]?.status).toBe("REJECTED");

    const atts = await db
      .select()
      .from(attractions)
      .where(eq(attractions.id, "rejected-test-entity"));
    expect(atts).toHaveLength(0);
  });
});
