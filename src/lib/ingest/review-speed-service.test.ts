import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import {
  dataSources,
  dataSubmissions,
  ingestionItems,
  ingestionItemStatusEnum,
  ingestionRuns,
  sourceRecords,
  users,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { decideItem, getReviewStats, listReviewQueue, nextPendingItem } from "./review";
import { flagSourceConflictUnchecked } from "@/lib/trust/sources";

let db: Database;
let admin: { id: string; role: string };
let sourceId: string;
let runId: string;

beforeEach(async () => {
  const setup = await createTestDb();
  db = setup.db;

  const adminId = randomUUID();
  await db.insert(users).values({
    id: adminId,
    email: "admin-speed@tournova.test",
    name: "Admin Speed",
    passwordHash: await hashPassword("test-pass-123"),
    role: "ADMIN",
  });
  admin = { id: adminId, role: "ADMIN" };

  sourceId = randomUUID();
  await db.insert(dataSources).values({
    id: sourceId,
    name: "Speed Feed",
    organizationName: "Board",
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

interface Fixture {
  itemId: string;
  submissionId: string;
}

async function makeItem(opts: { name: string; createdAt?: Date }): Promise<Fixture> {
  const sourceRecordId = randomUUID();
  const value = JSON.stringify({ name: opts.name });
  await db.insert(sourceRecords).values({
    id: sourceRecordId,
    dataSourceId: sourceId,
    entityType: "attraction",
    entityId: randomUUID(),
    rawValue: value,
    value,
    verificationStatus: "USER_REPORTED",
  });

  const submissionId = randomUUID();
  await db.insert(dataSubmissions).values({
    id: submissionId,
    sourceRecordId,
    targetType: "attraction",
    targetId: randomUUID(),
    payload: opts.name,
    workflowStatus: "PENDING_VERIFICATION",
  });

  const itemId = randomUUID();
  await db.insert(ingestionItems).values({
    id: itemId,
    runId,
    sourceId,
    entityType: "attraction",
    entityId: randomUUID(),
    name: opts.name,
    category: "HERITAGE",
    districtName: "Patan",
    status: ingestionItemStatusEnum.PENDING_REVIEW,
    decision: "NONE",
    sourceRecordId,
    submissionId,
    createdAt: opts.createdAt ?? new Date(),
  });

  return { itemId, submissionId };
}

describe("getReviewStats (Micro Chunk B)", () => {
  it("reports totals and reviewed counts from real data", async () => {
    const pending = await makeItem({ name: "P1" });
    const approved = await makeItem({ name: "A1" });
    const rejected = await makeItem({ name: "R1" });

    await decideItem(db, { itemId: approved.itemId, reviewer: admin, decision: "APPROVE" });
    await decideItem(db, { itemId: rejected.itemId, reviewer: admin, decision: "REJECT" });

    const stats = await getReviewStats(db);
    expect(stats.total).toBe(3);
    expect(stats.pending).toBe(1);
    expect(stats.approved).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.unavailable).toBe(0);
    expect(stats.reviewed).toBe(2);
    expect(stats.openConflicts).toBe(0);
    void pending;
  });

  it("counts open conflicts by distinct entity", async () => {
    const entityId = `conflict-entity-${randomUUID()}`;

    const a = await makeItem({ name: "Disputed A" });
    const recA = (
      await db
        .select({ sourceRecordId: ingestionItems.sourceRecordId })
        .from(ingestionItems)
        .where(eq(ingestionItems.id, a.itemId))
    )[0]!.sourceRecordId!;

    // Point record A at the conflict entity so both sides share its id.
    await db.update(sourceRecords).set({ entityId }).where(eq(sourceRecords.id, recA));

    // Create a second real source record to be side B of the conflict.
    const recBId = randomUUID();
    const valueB = JSON.stringify({ name: "Disputed B" });
    await db.insert(sourceRecords).values({
      id: recBId,
      dataSourceId: sourceId,
      entityType: "attraction",
      entityId,
      rawValue: valueB,
      value: valueB,
      verificationStatus: "USER_REPORTED",
    });

    await flagSourceConflictUnchecked(db, {
      entityType: "attraction",
      entityId,
      recordAId: recA,
      recordBId: recBId,
    });

    const stats = await getReviewStats(db);
    expect(stats.openConflicts).toBe(1);
  });
});

describe("nextPendingItem (Micro Chunk B)", () => {
  it("returns the first pending item, then the next in deterministic order", async () => {
    const first = await makeItem({ name: "First", createdAt: new Date("2025-01-01") });
    const second = await makeItem({ name: "Second", createdAt: new Date("2025-01-02") });
    const third = await makeItem({ name: "Third", createdAt: new Date("2025-01-03") });

    // newest first
    const firstNext = await nextPendingItem(db, {}, null);
    expect(firstNext?.id).toBe(third.itemId);
    const secondNext = await nextPendingItem(db, {}, third.itemId);
    expect(secondNext?.id).toBe(second.itemId);
    const thirdNext = await nextPendingItem(db, {}, second.itemId);
    expect(thirdNext?.id).toBe(first.itemId);

    // end of queue after exhausting all
    const end = await nextPendingItem(db, {}, first.itemId);
    expect(end).toBeNull();
  });

  it("skips non-pending items when selecting next", async () => {
    const decided = await makeItem({ name: "Decided" });
    const pending = await makeItem({ name: "Still Pending" });
    await decideItem(db, { itemId: decided.itemId, reviewer: admin, decision: "APPROVE" });

    const next = await nextPendingItem(db, {}, null);
    // pending should be returned (the decided one is not PENDING anymore)
    expect(next?.id).toBe(pending.itemId);
  });

  it("respected the search filter", async () => {
    const alpha = await makeItem({ name: "Alpha Fort" });
    await makeItem({ name: "Beta Pond" });

    const next = await nextPendingItem(db, { search: "alpha" }, null);
    expect(next?.id).toBe(alpha.itemId);
  });

  it("returns null when the queue is empty", async () => {
    const next = await nextPendingItem(db, {}, null);
    expect(next).toBeNull();
  });
});

describe("Save & Next behavior (Micro Chunk B)", () => {
  it("after a decision, the next pending item is the first remaining in queue order", async () => {
    const a = await makeItem({ name: "A", createdAt: new Date("2025-01-01") });
    const b = await makeItem({ name: "B", createdAt: new Date("2025-01-02") });
    const c = await makeItem({ name: "C", createdAt: new Date("2025-01-03") });

    // decide the newest (C) via the authoritative decision path
    await decideItem(db, { itemId: c.itemId, reviewer: admin, decision: "UNAVAILABLE" });

    // After deciding C, the pending set is {B, A}; next is B (newest first).
    const afterC = await nextPendingItem(db, {}, null);
    expect(afterC?.id).toBe(b.itemId);

    // Save & Next again — the reviewer decides B next, leaving {A}.
    await decideItem(db, { itemId: b.itemId, reviewer: admin, decision: "APPROVE" });
    const afterB = await nextPendingItem(db, {}, null);
    expect(afterB?.id).toBe(a.itemId);

    // End of queue.
    await decideItem(db, { itemId: a.itemId, reviewer: admin, decision: "REJECT" });
    const end = await nextPendingItem(db, {}, null);
    expect(end).toBeNull();
  });

  it("the listReviewQueue ordering is the source of truth for next", async () => {
    const a = await makeItem({ name: "A", createdAt: new Date("2025-01-01") });
    const b = await makeItem({ name: "B", createdAt: new Date("2025-01-02") });

    const page = await listReviewQueue(db, {
      status: ingestionItemStatusEnum.PENDING_REVIEW,
      page: 1,
      limit: 100,
    });
    const idsInOrder = page.items.map((i) => i.id);
    expect(idsInOrder).toEqual([b.itemId, a.itemId]);

    const first = await nextPendingItem(db, {}, null);
    expect(first?.id).toBe(idsInOrder[0]);
  });
});
