import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import {
  users,
  dataSubmissions,
  verifications,
  sourceRecords,
  auditLogs,
  dataSources,
  workflowStatusEnum,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import {
  submitUserReport,
  createIngestSubmission,
  advanceSubmission,
  reviewSubmission,
  listSubmissions,
  getSubmission,
  pendingSubmissionCount,
  TrustError,
} from "@/lib/trust/workflow";

let db: Database;
let admin: { id: string; email: string; role: string };
let tourist: { id: string; email: string; role: string };

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

async function reviewActions(db2: Database, userId: string) {
  return db2
    .select({ action: auditLogs.action })
    .from(auditLogs)
    .where(eq(auditLogs.userId, userId));
}

beforeAll(async () => {
  const setup = await createTestDb();
  db = setup.db;
  admin = await makeUser(db, "admin@tournova.test", "ADMIN");
  tourist = await makeUser(db, "tourist@example.com", "TOURIST");
});

describe("submitUserReport", () => {
  it("wires a user report into the trust pipeline with provenance", async () => {
    const sub = await submitUserReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      userName: "traveler",
      targetType: "restaurant",
      targetId: "dhaba-patna",
      reportType: "observation",
      payload: "Closed on Mondays",
    });
    expect(sub).not.toBeNull();
    expect(sub!.submission.workflowStatus).toBe(workflowStatusEnum.SUBMITTED);
    expect(sub!.source.sourceType).toBe("USER_SUBMITTED");
    expect(sub!.source.name).toContain(tourist.email);
    expect(sub!.sourceRecord.verificationStatus).toBe("USER_REPORTED");
    expect(sub!.submitter?.id).toBe(tourist.id);
  });
});

describe("createIngestSubmission", () => {
  it("creates a DISCOVERED submission from an existing source", async () => {
    const sourceId = randomUUID();
    await db.insert(dataSources).values({
      id: sourceId,
      name: "ASI official notice",
      sourceType: "OFFICIAL_GOVERNMENT",
    });
    const sub = await createIngestSubmission(db, {
      submittedById: admin.id,
      sourceId,
      targetType: "attraction",
      targetId: "gateway",
      rawValue: "Open 8am-5pm",
    });
    expect(sub).not.toBeNull();
    expect(sub!.submission.workflowStatus).toBe(workflowStatusEnum.DISCOVERED);
  });
});

describe("advanceSubmission", () => {
  it("walks SUBMITTED → VALIDATING → PENDING_VERIFICATION and counts pending", async () => {
    const sub = await submitUserReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      targetType: "price",
      targetId: "auto-rickshaw-delhi",
      reportType: "observation",
      payload: "50 rupees",
    });
    if (!sub) throw new Error("expected submission");

    await advanceSubmission(db, sub.submission.id, "VALIDATING");
    const mid = await getSubmission(db, sub.submission.id);
    expect(mid!.submission.workflowStatus).toBe(workflowStatusEnum.VALIDATING);

    await expect(
      advanceSubmission(db, sub.submission.id, "PENDING_VERIFICATION"),
    ).resolves.toBeUndefined();
    const queued = await getSubmission(db, sub.submission.id);
    expect(queued!.submission.workflowStatus).toBe(workflowStatusEnum.PENDING_VERIFICATION);

    const pending = await pendingSubmissionCount(db);
    expect(pending).toBeGreaterThanOrEqual(1);

    const listed = await listSubmissions(db, { status: workflowStatusEnum.PENDING_VERIFICATION });
    expect(listed.some((s) => s.submission.id === sub.submission.id)).toBe(true);
  });

  it("rejects an illegal step", async () => {
    const sub = await submitUserReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      targetType: "attraction",
      targetId: "taj",
      reportType: "observation",
    });
    if (!sub) throw new Error("expected submission");
    await expect(advanceSubmission(db, sub.submission.id, "SUBMITTED")).rejects.toThrow(TrustError);
  });
});

describe("reviewSubmission", () => {
  it("approves a pending submission → VERIFIED with verification + audit", async () => {
    const sub = await submitUserReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      targetType: "hours",
      targetId: "museum-jaipur",
      reportType: "observation",
      payload: "Open until 7pm",
    });
    if (!sub) throw new Error("expected submission");
    await advanceSubmission(db, sub.submission.id, "VALIDATING");
    await advanceSubmission(db, sub.submission.id, "PENDING_VERIFICATION");

    const reviewed = await reviewSubmission(db, {
      submissionId: sub.submission.id,
      reviewer: { id: admin.id, role: "ADMIN" as const },
      decision: "APPROVE",
      confidence: "HIGH",
      ipAddress: "127.0.0.1",
    });
    expect(reviewed!.submission.workflowStatus).toBe(workflowStatusEnum.VERIFIED);

    const verifs = await db
      .select({ decision: verifications.decision, status: verifications.verificationStatus })
      .from(verifications)
      .where(eq(verifications.submissionId, sub.submission.id));
    expect(verifs).toHaveLength(1);
    expect(verifs[0]).toMatchObject({ decision: "APPROVE", status: "VERIFIED" });

    const record = await db
      .select({ status: sourceRecords.verificationStatus, verifiedAt: sourceRecords.verifiedAt })
      .from(sourceRecords)
      .where(eq(sourceRecords.id, sub.sourceRecord.id));
    expect(record[0]!.status).toBe("VERIFIED");
    expect(record[0]!.verifiedAt).not.toBeNull();

    const actions = await reviewActions(db, admin.id);
    expect(actions.some((a) => a.action === "SUBMISSION_DECISION")).toBe(true);
  });

  it("rejects an invalid decision from the current state", async () => {
    const sub = await submitUserReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      targetType: "attraction",
      targetId: "qutub",
      reportType: "observation",
      payload: "Entry 100 rupees",
    });
    if (!sub) throw new Error("expected submission");
    await expect(
      reviewSubmission(db, {
        submissionId: sub.submission.id,
        reviewer: { id: admin.id, role: "ADMIN" as const },
        decision: "PUBLISH", // not allowed from SUBMITTED
      }),
    ).rejects.toThrow(TrustError);
  });

  it("requires conflictWithId to flag a conflict", async () => {
    const sub = await submitUserReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      targetType: "price",
      targetId: "auto-rickshaw-mumbai",
      reportType: "observation",
      payload: "80 rupees",
    });
    if (!sub) throw new Error("expected submission");
    await expect(
      reviewSubmission(db, {
        submissionId: sub.submission.id,
        reviewer: { id: admin.id, role: "ADMIN" as const },
        decision: "CONFLICT",
      }),
    ).rejects.toThrow(TrustError);
  });

  it("flags a conflict when given the other side", async () => {
    const a = await submitUserReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      targetType: "price",
      targetId: "taxi-delhi-airport",
      reportType: "observation",
      payload: "300 rupees",
    });
    const b = await submitUserReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      targetType: "price",
      targetId: "taxi-delhi-airport",
      reportType: "observation",
      payload: "450 rupees",
    });
    if (!a || !b) throw new Error("expected submissions");

    const conflicted = await reviewSubmission(db, {
      submissionId: a!.submission.id,
      reviewer: { id: admin.id, role: "ADMIN" as const },
      decision: "CONFLICT",
      conflictWithId: b!.submission.id,
    });
    expect(conflicted!.submission.workflowStatus).toBe(workflowStatusEnum.CONFLICT);
  });

  it("auto-resolves the losing side when one of a conflicting pair is approved", async () => {
    const a = await submitUserReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      targetType: "price",
      targetId: "hotel-udaipur-lake",
      reportType: "observation",
      payload: "4000 rupees",
    });
    const b = await submitUserReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      targetType: "price",
      targetId: "hotel-udaipur-lake",
      reportType: "observation",
      payload: "5500 rupees",
    });
    if (!a || !b) throw new Error("expected submissions");

    await reviewSubmission(db, {
      submissionId: a!.submission.id,
      reviewer: { id: admin.id, role: "ADMIN" as const },
      decision: "CONFLICT",
      conflictWithId: b!.submission.id,
    });

    const winner = await reviewSubmission(db, {
      submissionId: a!.submission.id,
      reviewer: { id: admin.id, role: "ADMIN" as const },
      decision: "APPROVE",
      confidence: "HIGH",
    });
    expect(winner!.submission.workflowStatus).toBe(workflowStatusEnum.VERIFIED);

    const loser = await getSubmission(db, b!.submission.id);
    expect(loser!.submission.workflowStatus).toBe(workflowStatusEnum.REJECTED);

    const notes = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.entityId, b!.submission.id), eq(auditLogs.action, "SUBMISSION_DECISION")),
      );
    expect(notes.length).toBeGreaterThanOrEqual(1);
  });

  it("blocks reviewers without REVIEW_VERIFICATIONS", async () => {
    const sub = await submitUserReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      targetType: "attraction",
      targetId: "lal-bagh",
      reportType: "observation",
      payload: "Greenhouse open",
    });
    if (!sub) throw new Error("expected submission");
    await expect(
      reviewSubmission(db, {
        submissionId: sub.submission.id,
        reviewer: { id: tourist.id, role: "TOURIST" as const },
        decision: "APPROVE",
      }),
    ).rejects.toThrow();
  });
});

describe("data integrity", () => {
  it("keeps a one-to-one submission ↔ source record via FK", async () => {
    const sub = await submitUserReport(db, {
      userId: tourist.id,
      userEmail: tourist.email,
      targetType: "event",
      targetId: "harbour-fest-2026",
      reportType: "observation",
      payload: "Polo float",
    });
    if (!sub) throw new Error("expected submission");
    const orphan = await db
      .select({ id: dataSubmissions.id })
      .from(dataSubmissions)
      .leftJoin(sourceRecords, eq(dataSubmissions.sourceRecordId, sourceRecords.id))
      .where(eq(dataSubmissions.id, sub.submission.id));
    expect(orphan).toHaveLength(1);
  });
});
