import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import {
  coordinateCandidates,
  coordinateCandidateStatusEnum,
  dataSources,
  dataSubmissions,
  ingestionItemStatusEnum,
  ingestionItems,
  ingestionRuns,
  sourceConflictStatusEnum,
  sourceConflicts,
  sourceRecords,
  workflowStatusEnum,
} from "@/lib/db/schema";
import { loadApprovedLocations } from "./map-data";
import { listVerifiedDestinations } from "./discover";

let db: Database;

/**
 * Verified-only public surfaces.
 *
 * The map, Nearby picker and Discover catalog must consume ONLY the approved
 * set. `loadApprovedLocations` is the shared source of truth for the map pins
 * and the Nearby `from` picker, so its invariants are regression-guarded here:
 * an entity appears only when BOTH its coordinate candidate AND its ingestion
 * item are approved, deduped to the most recently approved coordinate.
 *
 * The final block guards the Rani Ki Vav-style shape from production: an OPEN
 * (unresolved) conflict plus an APPROVED coordinate candidate for an entity
 * whose item is not approved must NEVER surface publicly — matching the
 * current database state exactly.
 */

interface SeededEntity {
  itemId: string;
  recordAId: string;
  recordBId: string | null;
}

async function seedEntity(opts: {
  entityId: string;
  name: string;
  status: string;
  recordB?: boolean;
}): Promise<SeededEntity> {
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
  });

  const recordAId = randomUUID();
  await db.insert(sourceRecords).values({
    id: recordAId,
    dataSourceId: sourceId,
    entityType: "attraction",
    entityId: opts.entityId,
    rawValue: opts.name,
    value: opts.name,
    verificationStatus:
      opts.status === ingestionItemStatusEnum.APPROVED ? "VERIFIED" : "UNAVAILABLE",
  });

  let recordBId: string | null = null;
  if (opts.recordB) {
    recordBId = randomUUID();
    await db.insert(sourceRecords).values({
      id: recordBId,
      dataSourceId: sourceId,
      entityType: "attraction",
      entityId: opts.entityId,
      rawValue: "alternate claim",
      value: "alternate claim",
      verificationStatus: "UNAVAILABLE",
    });
  }

  const submissionId = randomUUID();
  await db.insert(dataSubmissions).values({
    id: submissionId,
    sourceRecordId: recordAId,
    targetType: "attraction",
    targetId: opts.entityId,
    payload: opts.name,
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
    name: opts.name,
    status: opts.status,
    decision: opts.status === ingestionItemStatusEnum.APPROVED ? "APPROVE" : "NONE",
    sourceRecordId: recordAId,
    submissionId,
  });

  return { itemId, recordAId, recordBId };
}

async function seedCoordinate(opts: {
  entityId: string;
  status: string;
  latitude: number;
  longitude: number;
  decidedAt?: Date;
}) {
  await db.insert(coordinateCandidates).values({
    id: randomUUID(),
    entityType: "attraction",
    entityId: opts.entityId,
    latitude: opts.latitude,
    longitude: opts.longitude,
    source: "MANUAL",
    provider: "manual",
    status: opts.status,
    decision: opts.status === coordinateCandidateStatusEnum.APPROVED ? "APPROVED" : "REJECTED",
    decidedAt: opts.decidedAt ?? null,
  });
}

beforeAll(async () => {
  const setup = await createTestDb();
  db = setup.db;
});

describe("loadApprovedLocations (map + Nearby shared source)", () => {
  it("includes an entity only when BOTH its item and its coordinate are approved", async () => {
    await seedEntity({
      entityId: "both-approved",
      name: "Both Approved",
      status: ingestionItemStatusEnum.APPROVED,
    });
    await seedCoordinate({
      entityId: "both-approved",
      status: coordinateCandidateStatusEnum.APPROVED,
      latitude: 23.05,
      longitude: 72.05,
    });

    // Approved coordinate but item still in review → must NOT appear (RKV shape).
    await seedEntity({
      entityId: "approved-coord-pending-item",
      name: "Pending Item",
      status: ingestionItemStatusEnum.PENDING_REVIEW,
    });
    await seedCoordinate({
      entityId: "approved-coord-pending-item",
      status: coordinateCandidateStatusEnum.APPROVED,
      latitude: 23.1,
      longitude: 72.1,
    });

    // Approved item but coordinate rejected → must NOT appear.
    await seedEntity({
      entityId: "rejected-coord-approved-item",
      name: "Rejected Coord",
      status: ingestionItemStatusEnum.APPROVED,
    });
    await seedCoordinate({
      entityId: "rejected-coord-approved-item",
      status: coordinateCandidateStatusEnum.REJECTED,
      latitude: 23.2,
      longitude: 72.2,
    });

    const locations = await loadApprovedLocations(db);
    const ids = locations.map((l) => l.entityId);
    expect(ids).toContain("both-approved");
    expect(ids).not.toContain("approved-coord-pending-item");
    expect(ids).not.toContain("rejected-coord-approved-item");
  });

  it("returns one row per entity, favouring the most recently approved coordinate", async () => {
    await seedEntity({
      entityId: "multi-coord",
      name: "Multi Coord",
      status: ingestionItemStatusEnum.APPROVED,
    });
    await seedCoordinate({
      entityId: "multi-coord",
      status: coordinateCandidateStatusEnum.APPROVED,
      latitude: 10.0,
      longitude: 10.0,
      decidedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await seedCoordinate({
      entityId: "multi-coord",
      status: coordinateCandidateStatusEnum.APPROVED,
      latitude: 20.0,
      longitude: 20.0,
      decidedAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    const matches = (await loadApprovedLocations(db)).filter((l) => l.entityId === "multi-coord");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.latitude).toBe(20.0);
    expect(matches[0]!.longitude).toBe(20.0);
  });
});

describe("Rani Ki Vav-style conflict protection", () => {
  it("keeps a disputed entity unpublished while its conflict stays OPEN and its item is not approved", async () => {
    const entityId = "rani-ki-vav-patan";
    const seeded = await seedEntity({
      entityId,
      name: "Rani Ki Vav",
      recordB: true,
      status: ingestionItemStatusEnum.PENDING_REVIEW,
    });
    // An approved coordinate candidate exists (as in production) but must not
    // surface on the map / Nearby while the entity itself is unpublished.
    await seedCoordinate({
      entityId,
      status: coordinateCandidateStatusEnum.APPROVED,
      latitude: 23.8585,
      longitude: 72.1018,
    });
    // OPEN / NONE conflict — the exact protected production shape.
    await db.insert(sourceConflicts).values({
      id: randomUUID(),
      entityType: "attraction",
      entityId,
      recordAId: seeded.recordAId,
      recordBId: seeded.recordBId!,
      valueA: "Rani Ki Vav",
      valueB: "Rani-ki-Vav (stepwell)",
      status: sourceConflictStatusEnum.OPEN,
    });

    const openConflicts = await db
      .select({ id: sourceConflicts.id, status: sourceConflicts.status })
      .from(sourceConflicts)
      .where(
        and(
          eq(sourceConflicts.entityId, entityId),
          eq(sourceConflicts.status, sourceConflictStatusEnum.OPEN),
        ),
      );
    expect(openConflicts).toHaveLength(1);

    const mapLocations = await loadApprovedLocations(db);
    expect(mapLocations.map((l) => l.entityId)).not.toContain(entityId);

    const catalog = await listVerifiedDestinations(db);
    expect(catalog.map((d) => d.entityId)).not.toContain(entityId);
  });
});
