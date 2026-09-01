import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import { users, auditLogs, coordinateCandidateStatusEnum } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { AuthorizationError } from "@/lib/auth/permissions";
import {
  submitCoordinateCandidate,
  decideCoordinateCandidate,
  listCoordinateCandidates,
  GeoError,
} from "@/lib/geo/candidates";
import { auditActions } from "@/lib/auth/audit";

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

beforeAll(async () => {
  const setup = await createTestDb();
  db = setup.db;
  admin = await makeUser(db, "admin@tournova.test", "ADMIN");
  tourist = await makeUser(db, "tourist@example.com", "TOURIST");
});

describe("submitCoordinateCandidate", () => {
  it("records a plausible candidate in PENDING_REVIEW with provenance and an audit row", async () => {
    const candidate = await submitCoordinateCandidate(db, {
      entityType: "attraction",
      entityId: "siddhpur-vav",
      latitude: 23.847,
      longitude: 72.083,
      source: "MANUAL",
      provider: "manual",
      query: "Siddhpur stepwell official listing",
      notes: "Coordinate taken from the official heritage board.",
      submittedBy: admin,
    });

    expect(candidate.status).toBe(coordinateCandidateStatusEnum.PENDING_REVIEW);
    expect(candidate.source).toBe("MANUAL");
    expect(candidate.provider).toBe("manual");
    expect(candidate.latitude).toBe(23.847);

    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, auditActions.COORDINATE_CANDIDATE_SUBMITTED));
    expect(audits).toHaveLength(1);
    expect(audits[0].entityId).toBe("siddhpur-vav");
  });

  it("rejects a candidate from a geocoder whose id is not in the registry", async () => {
    await expect(
      submitCoordinateCandidate(db, {
        entityType: "attraction",
        entityId: "some-place",
        latitude: 23.1,
        longitude: 72.5,
        source: "GEOCODING",
        provider: "not-a-real-provider",
        submittedBy: admin,
      }),
    ).rejects.toThrow(GeoError);
  });

  it("rejects mechanically invalid coordinates (0,0 origin)", async () => {
    await expect(
      submitCoordinateCandidate(db, {
        entityType: "attraction",
        entityId: "nowhere",
        latitude: 0,
        longitude: 0,
        submittedBy: admin,
      }),
    ).rejects.toThrow(/Coordinate rejected/);
  });

  it("requires REVIEW_VERIFICATIONS permission", async () => {
    await expect(
      submitCoordinateCandidate(db, {
        entityType: "attraction",
        entityId: "no-perm",
        latitude: 23.1,
        longitude: 72.5,
        submittedBy: tourist,
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});

describe("decideCoordinateCandidate", () => {
  it("lets a reviewer approve a candidate and then blocks re-decision", async () => {
    const candidate = await submitCoordinateCandidate(db, {
      entityType: "attraction",
      entityId: "approve-me",
      latitude: 23.85,
      longitude: 72.12,
      submittedBy: admin,
    });

    const decided = await decideCoordinateCandidate(db, {
      candidateId: candidate.id,
      decision: "APPROVED",
      note: "Matches the gazetteer reference.",
      reviewer: admin,
    });
    expect(decided.status).toBe(coordinateCandidateStatusEnum.APPROVED);
    expect(decided.decision).toBe("APPROVED");

    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, auditActions.COORDINATE_CANDIDATE_DECIDED));
    expect(audits).toHaveLength(1);

    await expect(
      decideCoordinateCandidate(db, {
        candidateId: candidate.id,
        decision: "REJECTED",
        reviewer: admin,
      }),
    ).rejects.toThrow(/PENDING_REVIEW/);
  });

  it("records a rejection with a note", async () => {
    const candidate = await submitCoordinateCandidate(db, {
      entityType: "attraction",
      entityId: "reject-me",
      latitude: 23.5,
      longitude: 72.4,
      submittedBy: admin,
    });
    const decided = await decideCoordinateCandidate(db, {
      candidateId: candidate.id,
      decision: "REJECTED",
      note: "Points to the wrong tank, not the monument.",
      reviewer: admin,
    });
    expect(decided.status).toBe(coordinateCandidateStatusEnum.REJECTED);
    expect(decided.decisionNote).toBe("Points to the wrong tank, not the monument.");
  });
});

describe("listCoordinateCandidates", () => {
  it("lists by entity and status", async () => {
    await submitCoordinateCandidate(db, {
      entityType: "attraction",
      entityId: "list-target",
      latitude: 23.1,
      longitude: 72.1,
      submittedBy: admin,
    });
    const pending = await listCoordinateCandidates(db, {
      entityType: "attraction",
      entityId: "list-target",
      status: coordinateCandidateStatusEnum.PENDING_REVIEW,
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].submittedByName).toBe("admin");
  });
});
