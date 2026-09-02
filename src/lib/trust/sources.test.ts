import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import {
  users,
  dataSources,
  sourceRecords,
  sourceConflicts,
  dataSubmissions,
  auditLogs,
  sourceConflictStatusEnum,
  sourceConflictResolutionEnum,
  sourceConflictDecisionEnum,
  workflowStatusEnum,
  ingestionStatusEnum,
  type IngestionStatus,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import {
  SOURCE_CLASSIFICATIONS_ALL,
  createSource,
  updateSource,
  confirmSourceClassification,
  advanceIngestionStatus,
  recordSourceCheck,
  flagSourceConflict,
  resolveSourceConflict,
  toStoredConflictResolution,
  SourceError,
} from "@/lib/trust/sources";
import { AuthorizationError } from "@/lib/auth/permissions";
import { auditActions } from "@/lib/auth/audit";

let db: Database;
let admin: { id: string; email: string; role: string };
let tourist: { id: string; email: string; role: string };

beforeAll(async () => {
  const setup = await createTestDb();
  db = setup.db;
  admin = await makeUser(db, "admin@tournova.test", "ADMIN");
  tourist = await makeUser(db, "tourist@example.com", "TOURIST");
});

async function makeUser(database: Database, email: string, role: string) {
  const id = randomUUID();
  await database.insert(users).values({
    id,
    email,
    name: email.split("@")[0],
    passwordHash: await hashPassword("test-pass-123"),
    role,
  });
  return { id, email, role };
}

async function makeRecord(
  database: Database,
  sourceId: string,
  entityType: string,
  entityId: string,
  value: string,
) {
  const [row] = await database
    .insert(sourceRecords)
    .values({
      id: randomUUID(),
      dataSourceId: sourceId,
      entityType,
      entityId,
      rawValue: value,
      value,
    })
    .returning();
  return row;
}

async function pair() {
  const s1 = await createSource(db, {
    actor: { id: admin.id, role: "ADMIN" as const },
    source: { name: "Conflict source A" },
  });
  const s2 = await createSource(db, {
    actor: { id: admin.id, role: "ADMIN" as const },
    source: { name: "Conflict source B" },
  });
  const a = await makeRecord(db, s1.id, "price", "entry-fee-temple", "100 INR");
  const b = await makeRecord(db, s2.id, "price", "entry-fee-temple", "150 INR");
  return { s1, s2, a, b };
}

async function makeSubmission(
  database: Database,
  sourceRecordId: string,
  status: string = workflowStatusEnum.PENDING_VERIFICATION,
) {
  const [row] = await database
    .insert(dataSubmissions)
    .values({
      id: randomUUID(),
      sourceRecordId,
      targetType: "price",
      targetId: "entry-fee-temple",
      payload: "candidate",
      workflowStatus: status,
    })
    .returning();
  return row;
}

async function sourceRow(id: string) {
  const rows = await db.select().from(dataSources).where(eq(dataSources.id, id));
  return rows[0];
}

async function advance(sourceId: string, to: IngestionStatus, by: string = admin.id) {
  await advanceIngestionStatus(db, {
    actor: { id: by, role: "ADMIN" as const },
    sourceId,
    to,
  });
}

describe("registry taxonomy", () => {
  it("has exactly the seven required classifications", () => {
    expect(SOURCE_CLASSIFICATIONS_ALL).toEqual([
      "OFFICIAL_GOVERNMENT",
      "OFFICIAL_AUTHORITY",
      "OPEN_DATA",
      "VERIFIED_BUSINESS",
      "USER_SUBMITTED",
      "THIRD_PARTY",
      "UNKNOWN",
    ]);
  });

  it("has exactly the seven required ingestion statuses", () => {
    expect(Object.values(ingestionStatusEnum)).toEqual([
      "DISCOVERED",
      "ACCESSIBLE",
      "INGESTED",
      "VALIDATED",
      "REVIEW_REQUIRED",
      "PUBLISHED",
      "UNAVAILABLE",
    ]);
  });
});

describe("createSource — trust defaults", () => {
  it("creates a source as UNKNOWN / inactive / DISCOVERED / unreliable", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Some municipal webpage" },
    });
    expect(source.sourceType).toBe("UNKNOWN");
    expect(source.reliability).toBe("UNKNOWN");
    expect(source.accessMethod).toBe("UNKNOWN");
    expect(source.geographicCoverage).toBe("UNKNOWN");
    expect(source.freshnessClass).toBe("default");
    expect(source.ingestionStatus).toBe("DISCOVERED");
    expect(source.isActive).toBe(false);
    expect(source.isInternal).toBe(false);
    expect(source.classificationVerifiedAt).toBeNull();
  });

  it("never treats an explicit classification as a trust claim", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Gujarat official site", sourceType: "OFFICIAL_GOVERNMENT" },
    });
    expect(source.sourceType).toBe("OFFICIAL_GOVERNMENT");
    expect(source.classificationVerifiedAt).toBeNull();
    expect(source.classificationVerifiedById).toBeNull();
    expect(source.isActive).toBe(false);
  });

  it("records registry metadata fields", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: {
        name: "ASI notice board",
        sourceType: "OFFICIAL_AUTHORITY",
        referenceUrl: "https://asi.gov.in/notices",
        license: "CC BY 4.0",
        usageTerms: "Attribution required",
        accessMethod: "WEBPAGE",
        updateFrequency: "WEEKLY",
        geographicCoverage: "STATE",
        notes: "Board at monument entrance",
      },
    });
    expect(source.referenceUrl).toBe("https://asi.gov.in/notices");
    expect(source.license).toBe("CC BY 4.0");
    expect(source.usageTerms).toBe("Attribution required");
    expect(source.accessMethod).toBe("WEBPAGE");
    expect(source.updateFrequency).toBe("WEEKLY");
    expect(source.geographicCoverage).toBe("STATE");
    expect(source.freshnessClass).toBe("default");
  });

  it("rejects an unknown classification value", async () => {
    await expect(
      createSource(db, {
        actor: { id: admin.id, role: "ADMIN" as const },
        source: { name: "Bad source", sourceType: "GOVERNMENT" as string },
      }),
    ).rejects.toThrow(SourceError);
  });

  it("rejects an unknown reliability / access method value", async () => {
    await expect(
      createSource(db, {
        actor: { id: admin.id, role: "ADMIN" as const },
        source: { name: "Bad reliability", reliability: "AMBIGUOUS" as string },
      }),
    ).rejects.toThrow(SourceError);
    await expect(
      createSource(db, {
        actor: { id: admin.id, role: "ADMIN" as const },
        source: { name: "Bad access", accessMethod: "FTP2" as string },
      }),
    ).rejects.toThrow(SourceError);
  });

  it("blocks creation without MANAGE_DATA_SOURCES", async () => {
    await expect(
      createSource(db, {
        actor: { id: tourist.id, role: "TOURIST" as const },
        source: { name: "Tourist attempted" },
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("writes a SOURCE_CREATED audit row with no credential data", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Audited source" },
    });
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.entityId, source.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe(auditActions.SOURCE_CREATED);
    expect(JSON.parse(rows[0]!.metadata ?? "{}")).toEqual({ sourceType: "UNKNOWN" });
  });
});

describe("activation requires a confirmed classification", () => {
  it("refuses to activate an unconfirmed source", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Unconfirmed source" },
    });
    await expect(
      updateSource(db, {
        actor: { id: admin.id, role: "ADMIN" as const },
        sourceId: source.id,
        patch: { isActive: true },
      }),
    ).rejects.toThrow(SourceError);
  });

  it("confirms classification without changing isActive, then allows activation separately", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "To be confirmed", sourceType: "OFFICIAL_AUTHORITY" },
    });

    await confirmSourceClassification(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      sourceId: source.id,
      note: "Verified against official site",
    });

    const afterConfirm = await sourceRow(source.id);
    expect(afterConfirm!.classificationVerifiedAt).not.toBeNull();
    // Confirming classification is NOT trusting: still not live.
    expect(afterConfirm!.isActive).toBe(false);

    const activated = await updateSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      sourceId: source.id,
      patch: { isActive: true },
    });
    expect(activated.isActive).toBe(true);
  });
});

describe("ingestion status transitions", () => {
  it("walks an allowed path explicitly", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Transitions source" },
    });
    await advance(source.id, "ACCESSIBLE");
    await advance(source.id, "INGESTED");
    await advance(source.id, "VALIDATED");
    await advance(source.id, "REVIEW_REQUIRED");
    await advance(source.id, "INGESTED");
    expect((await sourceRow(source.id))!.ingestionStatus).toBe("INGESTED");
  });

  it("rejects a transition that skips a step", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Skip source" },
    });
    await expect(advance(source.id, "INGESTED")).rejects.toThrow(SourceError);
  });

  it("rejects an invalid direction", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Reverse source" },
    });
    await advance(source.id, "ACCESSIBLE");
    await expect(advance(source.id, "DISCOVERED")).rejects.toThrow(SourceError);
  });

  it("records a UNAVAILABLE reachable from the start state", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Unavailable source" },
    });
    await advance(source.id, "UNAVAILABLE");
    expect((await sourceRow(source.id))!.ingestionStatus).toBe("UNAVAILABLE");
  });

  it("never auto-publishes: PUBLISHED requires a confirmed classification", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Unconfirmed publish" },
    });
    await advance(source.id, "ACCESSIBLE");
    await advance(source.id, "INGESTED");
    await advance(source.id, "VALIDATED");
    await expect(advance(source.id, "PUBLISHED")).rejects.toThrow(SourceError);
  });

  it("allows PUBLISHED once the classification is confirmed", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Confirmed publish", sourceType: "OFFICIAL_GOVERNMENT" },
    });
    await confirmSourceClassification(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      sourceId: source.id,
    });
    await advance(source.id, "ACCESSIBLE");
    await advance(source.id, "INGESTED");
    await advance(source.id, "VALIDATED");
    await advance(source.id, "PUBLISHED");
    expect((await sourceRow(source.id))!.ingestionStatus).toBe("PUBLISHED");
  });

  it("blocks non-admins from advancing a source", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Tourist advance" },
    });
    await expect(
      advanceIngestionStatus(db, {
        actor: { id: tourist.id, role: "TOURIST" as const },
        sourceId: source.id,
        to: "ACCESSIBLE",
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("records an audit entry for each advance", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Audited advance" },
    });
    await advance(source.id, "ACCESSIBLE");
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.entityId, source.id));
    expect(rows.some((r) => r.action === auditActions.SOURCE_INGESTION_ADVANCED)).toBe(true);
  });
});

describe("recordSourceCheck — checks never decide trust", () => {
  it("success updates both timestamps and never moves status", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Checked source" },
    });
    await recordSourceCheck(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      sourceId: source.id,
      ok: true,
      note: "200 OK",
    });
    const row = await sourceRow(source.id);
    expect(row!.lastCheckedAt).not.toBeNull();
    expect(row!.lastSuccessfulFetchAt).not.toBeNull();
    // An automated check is NOT a trust decision.
    expect(row!.ingestionStatus).toBe("DISCOVERED");
    expect(row!.isActive).toBe(false);
    expect(row!.sourceType).toBe("UNKNOWN");
    expect(row!.reliability).toBe("UNKNOWN");
  });

  it("failure only records last_checked_at", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Failed check source" },
    });
    await recordSourceCheck(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      sourceId: source.id,
      ok: false,
    });
    const row = await sourceRow(source.id);
    expect(row!.lastCheckedAt).not.toBeNull();
    expect(row!.lastSuccessfulFetchAt).toBeNull();
    expect(row!.ingestionStatus).toBe("DISCOVERED");
  });

  it("writes a SOURCE_CHECKED audit entry", async () => {
    const source = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Check audit" },
    });
    await recordSourceCheck(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      sourceId: source.id,
      ok: true,
    });
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.entityId, source.id));
    expect(
      rows.some((r) => r.action === auditActions.SOURCE_CHECKED && r.metadata === '{"ok":true}'),
    ).toBe(true);
  });
});

describe("source conflicts", () => {
  it("flags an OPEN conflict between disagreeing records with value snapshots", async () => {
    const { a, b } = await pair();
    const conflict = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordAId: a.id,
      recordBId: b.id,
      note: "Two sources disagree",
    });
    expect(conflict.status).toBe(sourceConflictStatusEnum.OPEN);
    expect(conflict.valueA).toBe("100 INR");
    expect(conflict.valueB).toBe("150 INR");
    expect(conflict.createdById).toBe(admin.id);
  });

  it("refuses records that are not about the same entity", async () => {
    const s = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Mismatch source" },
    });
    const c1 = await makeRecord(db, s.id, "price", "entity-x", "10");
    const c2 = await makeRecord(db, s.id, "price", "entity-y", "20");
    await expect(
      flagSourceConflict(db, {
        actor: { id: admin.id, role: "ADMIN" as const },
        entityType: "price",
        entityId: "entity-x",
        recordAId: c1.id,
        recordBId: c2.id,
      }),
    ).rejects.toThrow(SourceError);
  });

  it("refuses equal values — that is not a conflict", async () => {
    const s = await createSource(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      source: { name: "Equal source" },
    });
    const c1 = await makeRecord(db, s.id, "price", "same-value", "50");
    const c2 = await makeRecord(db, s.id, "price", "same-value", "50");
    await expect(
      flagSourceConflict(db, {
        actor: { id: admin.id, role: "ADMIN" as const },
        entityType: "price",
        entityId: "same-value",
        recordAId: c1.id,
        recordBId: c2.id,
      }),
    ).rejects.toThrow(SourceError);
  });

  it("refuses missing records", async () => {
    await expect(
      flagSourceConflict(db, {
        actor: { id: admin.id, role: "ADMIN" as const },
        entityType: "price",
        entityId: "x",
        recordAId: randomUUID(),
        recordBId: randomUUID(),
      }),
    ).rejects.toThrow(SourceError);
  });

  it("is idempotent for an already-open pair (either order)", async () => {
    const { a, b } = await pair();
    const first = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordAId: a.id,
      recordBId: b.id,
    });
    const again = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordBId: a.id,
      recordAId: b.id,
    });
    expect(again.id).toBe(first.id);
    const openRows = await db
      .select({ id: sourceConflicts.id })
      .from(sourceConflicts)
      .where(
        and(
          eq(sourceConflicts.status, sourceConflictStatusEnum.OPEN),
          or(
            and(eq(sourceConflicts.recordAId, a.id), eq(sourceConflicts.recordBId, b.id)),
            and(eq(sourceConflicts.recordAId, b.id), eq(sourceConflicts.recordBId, a.id)),
          ),
        ),
      );
    expect(openRows).toHaveLength(1);
  });

  it("maps canonical conflict-decisions to the stored vocabulary", () => {
    expect(toStoredConflictResolution({ decision: "KEEP_A", acceptedRecordId: "x" })).toBe(
      sourceConflictResolutionEnum.ACCEPT_RECORD_A,
    );
    expect(toStoredConflictResolution({ decision: "KEEP_B", acceptedRecordId: "x" })).toBe(
      sourceConflictResolutionEnum.ACCEPT_RECORD_B,
    );
    expect(toStoredConflictResolution({ decision: "REJECT_BOTH" })).toBe(
      sourceConflictResolutionEnum.REJECT_BOTH,
    );
    expect(() => toStoredConflictResolution({ decision: "MERGE" })).toThrow(SourceError);
  });

  it("KEEP_A resolves the conflict and records the accepted record explicitly", async () => {
    const { a, b } = await pair();
    const subA = await makeSubmission(db, a.id, workflowStatusEnum.PENDING_VERIFICATION);
    const subB = await makeSubmission(db, b.id, workflowStatusEnum.PENDING_VERIFICATION);
    const conflict = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordAId: a.id,
      recordBId: b.id,
    });
    await resolveSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      conflictId: conflict.id,
      resolution: { decision: sourceConflictDecisionEnum.KEEP_A, acceptedRecordId: a.id },
      note: "A reflects the gazetted rate",
    });
    const row = await db.select().from(sourceConflicts).where(eq(sourceConflicts.id, conflict.id));
    expect(row[0]!.status).toBe(sourceConflictStatusEnum.RESOLVED);
    expect(row[0]!.resolution).toBe(sourceConflictResolutionEnum.ACCEPT_RECORD_A);
    expect(row[0]!.acceptedRecordId).toBe(a.id);
    expect(row[0]!.resolvedById).toBe(admin.id);
    expect(row[0]!.resolvedAt).not.toBeNull();

    // Both original records are preserved.
    expect(await db.select().from(sourceRecords).where(eq(sourceRecords.id, a.id))).toHaveLength(1);
    expect(await db.select().from(sourceRecords).where(eq(sourceRecords.id, b.id))).toHaveLength(1);

    // The accepted side stays eligible; the rejected side is retired.
    const [sa] = await db
      .select({ status: dataSubmissions.workflowStatus })
      .from(dataSubmissions)
      .where(eq(dataSubmissions.id, subA.id));
    const [sb] = await db
      .select({ status: dataSubmissions.workflowStatus })
      .from(dataSubmissions)
      .where(eq(dataSubmissions.id, subB.id));
    expect(sa!.status).toBe(workflowStatusEnum.PENDING_VERIFICATION);
    expect(sb!.status).toBe(workflowStatusEnum.REJECTED);
  });

  it("KEEP_B resolves the conflict and records the accepted record explicitly", async () => {
    const { a, b } = await pair();
    const conflict = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordAId: a.id,
      recordBId: b.id,
    });
    await resolveSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      conflictId: conflict.id,
      resolution: { decision: sourceConflictDecisionEnum.KEEP_B, acceptedRecordId: b.id },
      note: "B is the verified figure",
    });
    const row = await db.select().from(sourceConflicts).where(eq(sourceConflicts.id, conflict.id));
    expect(row[0]!.status).toBe(sourceConflictStatusEnum.RESOLVED);
    expect(row[0]!.resolution).toBe(sourceConflictResolutionEnum.ACCEPT_RECORD_B);
    expect(row[0]!.acceptedRecordId).toBe(b.id);
    expect(row[0]!.resolvedById).toBe(admin.id);
  });

  it("REJECT_BOTH resolves the conflict without accepting either record", async () => {
    const { a, b } = await pair();
    const subA = await makeSubmission(db, a.id, workflowStatusEnum.PENDING_VERIFICATION);
    const subB = await makeSubmission(db, b.id, workflowStatusEnum.PENDING_VERIFICATION);
    const conflict = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordAId: a.id,
      recordBId: b.id,
    });
    await resolveSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      conflictId: conflict.id,
      resolution: { decision: sourceConflictDecisionEnum.REJECT_BOTH },
      note: "Neither figure is supportable",
    });
    const row = await db.select().from(sourceConflicts).where(eq(sourceConflicts.id, conflict.id));
    expect(row[0]!.status).toBe(sourceConflictStatusEnum.RESOLVED);
    expect(row[0]!.resolution).toBe(sourceConflictResolutionEnum.REJECT_BOTH);
    expect(row[0]!.acceptedRecordId).toBeNull();

    // Both records stay in history but neither may be published.
    const [sa] = await db
      .select({ status: dataSubmissions.workflowStatus })
      .from(dataSubmissions)
      .where(eq(dataSubmissions.id, subA.id));
    const [sb] = await db
      .select({ status: dataSubmissions.workflowStatus })
      .from(dataSubmissions)
      .where(eq(dataSubmissions.id, subB.id));
    expect(sa!.status).toBe(workflowStatusEnum.REJECTED);
    expect(sb!.status).toBe(workflowStatusEnum.REJECTED);
    expect(await db.select().from(sourceRecords).where(eq(sourceRecords.id, a.id))).toHaveLength(1);
    expect(await db.select().from(sourceRecords).where(eq(sourceRecords.id, b.id))).toHaveLength(1);
  });

  it("rejects an accepted record that does not belong to the conflict", async () => {
    const { a, b } = await pair();
    const { a: other } = await pair();
    const conflict = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordAId: a.id,
      recordBId: b.id,
    });
    await expect(
      resolveSourceConflict(db, {
        actor: { id: admin.id, role: "ADMIN" as const },
        conflictId: conflict.id,
        resolution: { decision: sourceConflictDecisionEnum.KEEP_A, acceptedRecordId: other.id },
      }),
    ).rejects.toThrow(SourceError);

    const row = await db.select().from(sourceConflicts).where(eq(sourceConflicts.id, conflict.id));
    expect(row[0]!.status).toBe(sourceConflictStatusEnum.OPEN);
  });

  it("rejects resolving an already-resolved conflict", async () => {
    const { a, b } = await pair();
    const conflict = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordAId: a.id,
      recordBId: b.id,
    });
    await resolveSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      conflictId: conflict.id,
      resolution: { decision: sourceConflictDecisionEnum.KEEP_A, acceptedRecordId: a.id },
    });
    await expect(
      resolveSourceConflict(db, {
        actor: { id: admin.id, role: "ADMIN" as const },
        conflictId: conflict.id,
        resolution: { decision: sourceConflictDecisionEnum.REJECT_BOTH },
      }),
    ).rejects.toThrow(/Only open conflicts/);
  });

  it("rejects resolving a nonexistent conflict", async () => {
    await expect(
      resolveSourceConflict(db, {
        actor: { id: admin.id, role: "ADMIN" as const },
        conflictId: "does-not-exist",
        resolution: { decision: sourceConflictDecisionEnum.REJECT_BOTH },
      }),
    ).rejects.toThrow(/Conflict not found/);
  });

  it("recognises MERGE but refuses it: no merge model exists", async () => {
    const { a, b } = await pair();
    const conflict = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordAId: a.id,
      recordBId: b.id,
    });
    await expect(
      resolveSourceConflict(db, {
        actor: { id: admin.id, role: "ADMIN" as const },
        conflictId: conflict.id,
        resolution: { decision: sourceConflictDecisionEnum.MERGE },
      }),
    ).rejects.toThrow(/MERGE is not supported/);

    const row = await db.select().from(sourceConflicts).where(eq(sourceConflicts.id, conflict.id));
    expect(row[0]!.status).toBe(sourceConflictStatusEnum.OPEN);
    expect(row[0]!.resolution).toBe(sourceConflictResolutionEnum.NONE);
    expect(row[0]!.acceptedRecordId).toBeNull();
  });

  it("blocks tourists from flagging or resolving conflicts", async () => {
    const { a, b } = await pair();
    const conflict = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordAId: a.id,
      recordBId: b.id,
    });
    await expect(
      flagSourceConflict(db, {
        actor: { id: tourist.id, role: "TOURIST" as const },
        entityType: "price",
        entityId: "entry-fee-temple",
        recordAId: a.id,
        recordBId: b.id,
      }),
    ).rejects.toThrow(AuthorizationError);
    await expect(
      resolveSourceConflict(db, {
        actor: { id: tourist.id, role: "TOURIST" as const },
        conflictId: conflict.id,
        resolution: { decision: sourceConflictDecisionEnum.REJECT_BOTH },
      }),
    ).rejects.toThrow(AuthorizationError);

    const row = await db.select().from(sourceConflicts).where(eq(sourceConflicts.id, conflict.id));
    expect(row[0]!.status).toBe(sourceConflictStatusEnum.OPEN);
  });

  it("writes canonical SOURCE_CONFLICT_RESOLVED audits (accepted / rejected_both)", async () => {
    const { a, b } = await pair();
    await makeSubmission(db, a.id, workflowStatusEnum.PENDING_VERIFICATION);
    const conflict = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordAId: a.id,
      recordBId: b.id,
    });
    await resolveSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      conflictId: conflict.id,
      resolution: { decision: sourceConflictDecisionEnum.KEEP_A, acceptedRecordId: a.id },
    });
    const conflictRows = await db
      .select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, conflict.id));
    const actions = conflictRows.map((r) => r.action).sort();
    expect(actions).toEqual([
      auditActions.SOURCE_CONFLICT_FLAGGED,
      auditActions.SOURCE_CONFLICT_RESOLVED,
    ]);
    const resolvedAudit = conflictRows.find(
      (r) => r.action === auditActions.SOURCE_CONFLICT_RESOLVED,
    );
    const meta = JSON.parse(resolvedAudit!.metadata ?? "{}") as {
      resolution?: string;
      decision?: string;
      accepted?: string;
    };
    expect(meta.resolution).toBe(`accepted:${a.id}`);
    expect(meta.accepted).toBe(a.id);
  });

  it("writes rejected_both in the audit for REJECT_BOTH", async () => {
    const { a, b } = await pair();
    const conflict = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordAId: a.id,
      recordBId: b.id,
    });
    await resolveSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      conflictId: conflict.id,
      resolution: { decision: sourceConflictDecisionEnum.REJECT_BOTH },
    });
    const rows = await db
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, conflict.id),
          eq(auditLogs.action, auditActions.SOURCE_CONFLICT_RESOLVED),
        ),
      );
    const meta = JSON.parse(rows[0]!.metadata ?? "{}") as { resolution?: string };
    expect(meta.resolution).toBe("rejected_both");
  });

  it("lets the existing Rani Ki Vav / Rani - ki - vav conflict resolve safely as KEEP_A", async () => {
    const { s1, s2 } = await pair();
    const raniGujarat = await makeRecord(
      db,
      s1.id,
      "destination",
      "rani-ki-vav-patan",
      JSON.stringify({
        name: "Rani Ki Vav",
        referenceUrl: "https://www.gujarattourism.com/north-zone/patan/rani-ki-vav.html",
      }),
    );
    const raniAsi = await makeRecord(
      db,
      s2.id,
      "destination",
      "rani-ki-vav-patan",
      JSON.stringify({ name: "Rani - ki - vav", locality: "Anavadapati" }),
    );
    const conflict = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "destination",
      entityId: "rani-ki-vav-patan",
      recordAId: raniGujarat.id,
      recordBId: raniAsi.id,
      note: "Different values for the same monument reported by independent sources.",
    });
    expect(conflict.status).toBe(sourceConflictStatusEnum.OPEN);

    await resolveSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      conflictId: conflict.id,
      resolution: { decision: sourceConflictDecisionEnum.KEEP_A, acceptedRecordId: raniGujarat.id },
      note: "Gujarat Tourism record carries the official reference URL.",
    });

    const row = await db.select().from(sourceConflicts).where(eq(sourceConflicts.id, conflict.id));
    expect(row[0]!.status).toBe(sourceConflictStatusEnum.RESOLVED);
    expect(row[0]!.resolution).toBe(sourceConflictResolutionEnum.ACCEPT_RECORD_A);
    expect(row[0]!.acceptedRecordId).toBe(raniGujarat.id);
    expect(
      (await db.select().from(sourceRecords).where(eq(sourceRecords.id, raniGujarat.id))).length,
    ).toBe(1);
    expect(
      (await db.select().from(sourceRecords).where(eq(sourceRecords.id, raniAsi.id))).length,
    ).toBe(1);
  });

  it("lists open conflicts", async () => {
    const { a: c1, b: c2 } = await pair();
    const flagged = await flagSourceConflict(db, {
      actor: { id: admin.id, role: "ADMIN" as const },
      entityType: "price",
      entityId: "entry-fee-temple",
      recordAId: c1.id,
      recordBId: c2.id,
    });
    const items = await db
      .select()
      .from(sourceConflicts)
      .where(eq(sourceConflicts.status, sourceConflictStatusEnum.OPEN));
    expect(items.some((c) => c.id === flagged.id)).toBe(true);
  });
});
