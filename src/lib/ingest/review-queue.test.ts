import { beforeEach, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import {
  attractions,
  auditLogs,
  dataSources,
  dataSubmissions,
  ingestionItems,
  ingestionItemStatusEnum,
  ingestionRuns,
  sourceConflicts,
  sourceConflictStatusEnum,
  sourceRecords,
  users,
  verifications,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import {
  decideItem,
  decideItemsBatch,
  BatchReviewError,
  listItems,
  listReviewQueue,
} from "./review";
import { flagSourceConflictUnchecked, resolveSourceConflict } from "@/lib/trust/sources";
import { MAX_BATCH_REVIEW_SIZE } from "@/lib/validation";

let db: Database;
let admin: { id: string; email: string; role: string; name: string };
let tourist: { id: string; role: string };
let sourceId: string;
let runId: string;

beforeEach(async () => {
  const setup = await createTestDb();
  db = setup.db;

  const adminId = randomUUID();
  await db.insert(users).values({
    id: adminId,
    email: "admin-queue@tournova.test",
    name: "Admin Queue",
    passwordHash: await hashPassword("test-pass-123"),
    role: "ADMIN",
  });
  admin = { id: adminId, email: "admin-queue@tournova.test", role: "ADMIN", name: "Admin Queue" };

  const touristId = randomUUID();
  await db.insert(users).values({
    id: touristId,
    email: "tourist-queue@tournova.test",
    name: "Tourist Queue",
    passwordHash: await hashPassword("test-pass-123"),
    role: "TOURIST",
  });
  tourist = { id: touristId, role: "TOURIST" };

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

interface ItemFixture {
  itemId: string;
  submissionId: string;
  sourceRecordId: string;
}

/** Create a PENDING_REVIEW ingestion item backed by a source record + submission. */
async function createItemFixture(opts: {
  entityId: string;
  entityType?: string;
  name: string;
  category?: string;
  districtName?: string;
  value?: string;
}): Promise<ItemFixture> {
  const sourceRecordId = randomUUID();
  const value = opts.value ?? JSON.stringify({ name: opts.name });
  await db.insert(sourceRecords).values({
    id: sourceRecordId,
    dataSourceId: sourceId,
    entityType: opts.entityType ?? "attraction",
    entityId: opts.entityId,
    rawValue: value,
    value,
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

async function itemStatus(id: string) {
  const rows = await db
    .select({ status: ingestionItems.status })
    .from(ingestionItems)
    .where(eq(ingestionItems.id, id));
  return rows[0]?.status ?? null;
}

/** Flag an OPEN conflict between an existing fixture record and a brand-new record. */
async function flagConflictFor(opts: {
  entityId: string;
  recordAId: string;
  valueB: string;
}): Promise<string> {
  const recBId = randomUUID();
  await db.insert(sourceRecords).values({
    id: recBId,
    dataSourceId: sourceId,
    entityType: "attraction",
    entityId: opts.entityId,
    rawValue: opts.valueB,
    value: opts.valueB,
    verificationStatus: "USER_REPORTED",
  });
  const conflict = await flagSourceConflictUnchecked(db, {
    entityType: "attraction",
    entityId: opts.entityId,
    recordAId: opts.recordAId,
    recordBId: recBId,
    note: "Test conflict",
  });
  return conflict.id;
}

async function auditActionCounts() {
  const audits = await db.select({ action: auditLogs.action }).from(auditLogs);
  return {
    itemDecided: audits.filter((a) => a.action === "INGESTION_ITEM_DECIDED").length,
    batchDecided: audits.filter((a) => a.action === "INGESTION_BATCH_DECIDED").length,
  };
}

async function verificationCount() {
  const rows = await db.select({ n: count() }).from(verifications);
  return rows[0]?.n ?? 0;
}

describe("Review queue (Chunk 4)", () => {
  it("paginates with deterministic ordering and reports totals", async () => {
    for (let i = 0; i < 5; i++) {
      await createItemFixture({ entityId: `queue-entity-${i}`, name: `Queue Fort ${i}` });
    }

    const p1 = await listReviewQueue(db, {
      status: ingestionItemStatusEnum.PENDING_REVIEW,
      page: 1,
      limit: 2,
    });
    expect(p1.total).toBe(5);
    expect(p1.pageSize).toBe(2);
    expect(p1.items).toHaveLength(2);

    const p2 = await listReviewQueue(db, {
      status: ingestionItemStatusEnum.PENDING_REVIEW,
      page: 2,
      limit: 2,
    });
    const p3 = await listReviewQueue(db, {
      status: ingestionItemStatusEnum.PENDING_REVIEW,
      page: 3,
      limit: 2,
    });
    expect(p2.items).toHaveLength(2);
    expect(p3.items).toHaveLength(1);

    const allIds = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
    expect(allIds).toHaveLength(5);
    expect(new Set(allIds).size).toBe(5);

    const again = await listReviewQueue(db, {
      status: ingestionItemStatusEnum.PENDING_REVIEW,
      page: 2,
      limit: 2,
    });
    expect(again.items.map((i) => i.id)).toEqual(p2.items.map((i) => i.id));
  });

  it("filters by sourceId, entityType and runId", async () => {
    const { itemId } = await createItemFixture({
      entityId: "filter-entity",
      name: "Filterable Fort",
    });

    const bySource = await listReviewQueue(db, { sourceId });
    expect(bySource.items.map((i) => i.id)).toContain(itemId);

    const byType = await listReviewQueue(db, { entityType: "attraction" });
    expect(byType.items.map((i) => i.id)).toContain(itemId);

    const byRun = await listReviewQueue(db, { runId });
    expect(byRun.items.map((i) => i.id)).toContain(itemId);

    const byWrongRun = await listReviewQueue(db, { runId: randomUUID() });
    expect(byWrongRun.items).toHaveLength(0);
    expect(byWrongRun.total).toBe(0);
  });

  it("searches by name and entity id", async () => {
    await createItemFixture({ entityId: "search-entity", name: "Sundial Gate" });
    await createItemFixture({ entityId: "other-entity", name: "Quiet Pond" });

    const byName = await listReviewQueue(db, { search: "sundial" });
    expect(byName.items.map((i) => i.name)).toEqual(["Sundial Gate"]);

    const byId = await listReviewQueue(db, { search: "search-entity" });
    expect(byId.items.map((i) => i.entityId)).toEqual(["search-entity"]);

    const noMatch = await listReviewQueue(db, { search: "zzz-nothing" });
    expect(noMatch.total).toBe(0);
  });

  it("filters items by open conflicts and shows the conflict count", async () => {
    const disputed = await createItemFixture({
      entityId: "conflict-entity-a",
      name: "Disputed Fort",
      value: JSON.stringify({ name: "Disputed Fort" }),
    });
    await flagConflictFor({
      entityId: "conflict-entity-a",
      recordAId: disputed.sourceRecordId,
      valueB: JSON.stringify({ name: "Wrong Disputed", locality: "elsewhere" }),
    });

    const clean = await createItemFixture({ entityId: "clean-entity", name: "Clean Fort" });

    const open = await listReviewQueue(db, { conflict: "open" });
    expect(open.items.map((i) => i.id)).toEqual([disputed.itemId]);
    expect(open.items[0]!.openConflicts).toBe(1);

    const none = await listReviewQueue(db, { conflict: "none" });
    expect(none.items.map((i) => i.id)).toEqual([clean.itemId]);

    const any = await listReviewQueue(db, { conflict: "any" });
    expect(any.items).toHaveLength(2);
  });

  it("listItems stays backward compatible and queue views are plain JSON values", async () => {
    const { itemId } = await createItemFixture({ entityId: "compat-entity", name: "Compat Fort" });
    const items = await listItems(db, { status: ingestionItemStatusEnum.PENDING_REVIEW });
    expect(items.map((i) => i.id)).toContain(itemId);

    const view = items.find((i) => i.id === itemId);
    expect(view).toMatchObject({
      status: "PENDING_REVIEW",
      decision: "NONE",
      submissionWorkflow: "PENDING_VERIFICATION",
      category: "HERITAGE",
      districtName: "Patan",
    });
    // Queue views expose structured JSON pods, never raw database secrets.
    expect(view!.rawData).toBeNull();
    expect(view!.normalizedData).toBeNull();
    for (const key of Object.keys(view!) as Array<keyof typeof view>) {
      expect(["passwordHash", "sessionToken", "hash", "secret"].includes(String(key))).toBe(false);
    }
  });
});

describe("Conflict safety around decisions (Chunk 4)", () => {
  it("blocks APPROVE while the item's source record is in an OPEN conflict", async () => {
    const item = await createItemFixture({
      entityId: "blocked-entity",
      name: "Blocked Fort",
      value: JSON.stringify({ name: "Blocked Fort" }),
    });
    await flagConflictFor({
      entityId: "blocked-entity",
      recordAId: item.sourceRecordId,
      valueB: JSON.stringify({ name: "Other Blocked" }),
    });

    await expect(
      decideItem(db, { itemId: item.itemId, reviewer: admin, decision: "APPROVE" }),
    ).rejects.toThrow(/open source conflict/);
    expect(await itemStatus(item.itemId)).toBe(ingestionItemStatusEnum.PENDING_REVIEW);
  });

  it("allows REJECT / UNAVAILABLE even on an entity with an OPEN conflict", async () => {
    const item = await createItemFixture({
      entityId: "rejectable-conflict",
      name: "Rejectable In Dispute",
      value: JSON.stringify({ name: "Rejectable In Dispute" }),
    });
    await flagConflictFor({
      entityId: "rejectable-conflict",
      recordAId: item.sourceRecordId,
      valueB: JSON.stringify({ name: "Other" }),
    });

    await decideItem(db, {
      itemId: item.itemId,
      reviewer: admin,
      decision: "REJECT",
      reason: "Spam.",
    });
    expect(await itemStatus(item.itemId)).toBe(ingestionItemStatusEnum.REJECTED);
  });

  it("approving an item is allowed while a DIFFERENT entity has an open conflict", async () => {
    const disputed = await createItemFixture({
      entityId: "disputed-other",
      name: "Disputed Other",
      value: JSON.stringify({ name: "Disputed Other" }),
    });
    await flagConflictFor({
      entityId: "disputed-other",
      recordAId: disputed.sourceRecordId,
      valueB: JSON.stringify({ name: "Wrong" }),
    });

    const clean = await createItemFixture({
      entityId: "clean-to-approve",
      name: "Clean To Approve",
    });

    await decideItem(db, { itemId: clean.itemId, reviewer: admin, decision: "APPROVE" });
    expect(await itemStatus(clean.itemId)).toBe(ingestionItemStatusEnum.APPROVED);
  });

  it("after KEEP_A resolution, the accepted side approves and the losing side mirrors REJECT, never APPROVE", async () => {
    const accepted = await createItemFixture({
      entityId: "keep-a-entity",
      name: "Accepted Fort",
      value: JSON.stringify({ name: "Accepted Fort" }),
    });
    const losing = await createItemFixture({
      entityId: "keep-a-entity",
      name: "Losing Fort",
      value: JSON.stringify({ name: "Losing Fort", locality: "wrong" }),
    });

    const conflict = await flagSourceConflictUnchecked(db, {
      entityType: "attraction",
      entityId: "keep-a-entity",
      recordAId: accepted.sourceRecordId,
      recordBId: losing.sourceRecordId,
    });

    await resolveSourceConflict(db, {
      actor: { id: admin.id, role: admin.role },
      conflictId: conflict.id,
      resolution: { decision: "KEEP_A", acceptedRecordId: accepted.sourceRecordId },
      note: "A is the official name",
    });

    await decideItem(db, { itemId: accepted.itemId, reviewer: admin, decision: "APPROVE" });
    expect(await itemStatus(accepted.itemId)).toBe(ingestionItemStatusEnum.APPROVED);

    await expect(
      decideItem(db, { itemId: losing.itemId, reviewer: admin, decision: "APPROVE" }),
    ).rejects.toThrow(/retired by a conflict resolution/);

    await decideItem(db, { itemId: losing.itemId, reviewer: admin, decision: "REJECT" });
    expect(await itemStatus(losing.itemId)).toBe(ingestionItemStatusEnum.REJECTED);

    const open = await db
      .select()
      .from(sourceConflicts)
      .where(eq(sourceConflicts.status, sourceConflictStatusEnum.OPEN));
    expect(open).toHaveLength(0);
  });
});

describe("Safe batch review (Chunk 4)", () => {
  it("approves a batch atomically with verifications, audits, relational sync and no duplicates", async () => {
    const items = [
      await createItemFixture({ entityId: "batch-entity-1", name: "Batch One" }),
      await createItemFixture({ entityId: "batch-entity-2", name: "Batch Two" }),
      await createItemFixture({ entityId: "batch-entity-3", name: "Batch Three" }),
    ];
    const ids = items.map((i) => i.itemId);

    const result = await decideItemsBatch(db, {
      ids,
      reviewer: admin,
      decision: "APPROVE",
      reason: "All match the official listing.",
    });
    expect(result.applied).toBe(3);
    expect(result.ids).toEqual(ids);

    for (const i of items) {
      expect(await itemStatus(i.itemId)).toBe(ingestionItemStatusEnum.APPROVED);
    }

    const atts = await db.select().from(attractions);
    expect(atts.map((a) => a.id).sort()).toEqual([
      "batch-entity-1",
      "batch-entity-2",
      "batch-entity-3",
    ]);
    expect(atts.map((a) => a.name)).toEqual(["Batch One", "Batch Two", "Batch Three"]);

    expect(await verificationCount()).toBe(3);
    const audits = await auditActionCounts();
    expect(audits.itemDecided).toBe(3);
    expect(audits.batchDecided).toBe(1);
  });

  it("all-or-nothing: one bad id rolls the entire batch back", async () => {
    const good = [
      await createItemFixture({ entityId: "rollback-b-1", name: "Rollback One" }),
      await createItemFixture({ entityId: "rollback-b-2", name: "Rollback Two" }),
    ];
    const missing = randomUUID();

    await expect(
      decideItemsBatch(db, {
        ids: [good[0]!.itemId, missing, good[1]!.itemId],
        reviewer: admin,
        decision: "APPROVE",
      }),
    ).rejects.toThrow(BatchReviewError);

    for (const g of good) {
      expect(await itemStatus(g.itemId)).toBe(ingestionItemStatusEnum.PENDING_REVIEW);
    }
    expect(await verificationCount()).toBe(0);
    const audits = await auditActionCounts();
    expect(audits.itemDecided).toBe(0);
    expect(audits.batchDecided).toBe(0);
  });

  it("rejects empty, oversized and duplicate batches before touching the DB", async () => {
    await expect(
      decideItemsBatch(db, { ids: [], reviewer: admin, decision: "APPROVE" }),
    ).rejects.toThrow(/at least one/);

    const tooMany = Array.from({ length: MAX_BATCH_REVIEW_SIZE + 1 }, () => randomUUID());
    await expect(
      decideItemsBatch(db, { ids: tooMany, reviewer: admin, decision: "APPROVE" }),
    ).rejects.toThrow(/limited to/);

    const a = randomUUID();
    const b = randomUUID();
    await expect(
      decideItemsBatch(db, { ids: [a, a, b], reviewer: admin, decision: "APPROVE" }),
    ).rejects.toThrow(/Duplicate/);
  });

  it("rejects a NONE decision and a non-ADMIN reviewer", async () => {
    const { itemId } = await createItemFixture({
      entityId: "batch-perm-entity",
      name: "Perm Fort",
    });

    await expect(
      decideItemsBatch(db, { ids: [itemId], reviewer: admin, decision: "NONE" }),
    ).rejects.toThrow(/must be APPROVE/);

    await expect(
      decideItemsBatch(db, { ids: [itemId], reviewer: tourist, decision: "APPROVE" }),
    ).rejects.toThrow(/permission/);
    expect(await itemStatus(itemId)).toBe(ingestionItemStatusEnum.PENDING_REVIEW);
  });

  it("an open-conflict item fails the whole batch and nothing is applied", async () => {
    const clean = await createItemFixture({ entityId: "batch-clean", name: "Clean Batch Fort" });
    const disputed = await createItemFixture({
      entityId: "batch-disputed",
      name: "Disputed Batch Fort",
      value: JSON.stringify({ name: "Disputed Batch Fort" }),
    });
    await flagConflictFor({
      entityId: "batch-disputed",
      recordAId: disputed.sourceRecordId,
      valueB: JSON.stringify({ name: "Wrong" }),
    });

    await expect(
      decideItemsBatch(db, {
        ids: [clean.itemId, disputed.itemId],
        reviewer: admin,
        decision: "APPROVE",
      }),
    ).rejects.toThrow(/open source conflict/);

    expect(await itemStatus(clean.itemId)).toBe(ingestionItemStatusEnum.PENDING_REVIEW);
    expect(await itemStatus(disputed.itemId)).toBe(ingestionItemStatusEnum.PENDING_REVIEW);
    const atts = await db.select().from(attractions);
    expect(atts).toHaveLength(0);
  });
});
