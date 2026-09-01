import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  coordinateCandidates,
  coordinateCandidateStatusEnum,
  coordinateCandidateSourceEnum,
  confidenceEnum,
  users,
  type CoordinateCandidateSource,
} from "@/lib/db/schema";
import { requirePermission, type Role } from "@/lib/auth/permissions";
import { writeAudit, auditActions } from "@/lib/auth/audit";
import { evaluateCandidate } from "./validate";
import { resolveGeoProvider } from "./providers";

/**
 * COORDINATE CANDIDATES SERVICE (Milestone 3C)
 * ============================================
 * Coordinates are entered into review, never trusted. `submitCoordinateCandidate`
 * stores a candidate with full provenance (source kind, provider, query text,
 * attribution) in PENDING_REVIEW. Geocoding-provider output is treated exactly
 * like manual entry at this stage: a candidate. Only an authorized reviewer can
 * approve it, and downstream geo features read APPROVED candidates only.
 */

export class GeoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeoError";
  }
}

export interface CoordinateCandidateView {
  id: string;
  entityType: string;
  entityId: string;
  latitude: number;
  longitude: number;
  source: string;
  provider: string | null;
  query: string | null;
  placeName: string | null;
  confidence: string;
  attribution: string | null;
  referenceUrl: string | null;
  status: string;
  decision: string | null;
  decisionNote: string | null;
  submittedByName: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
}

export interface SubmitCandidateInput {
  entityType: string;
  entityId: string;
  latitude: number;
  longitude: number;
  source?: CoordinateCandidateSource;
  provider?: string | null;
  query?: string | null;
  placeName?: string | null;
  confidence?: string | null;
  attribution?: string | null;
  referenceUrl?: string | null;
  notes?: string | null;
  submittedBy: { id: string; role: Role | string };
  ipAddress?: string | null;
}

export interface DecideCandidateInput {
  candidateId: string;
  decision: "APPROVED" | "REJECTED";
  note?: string | null;
  reviewer: { id: string; role: Role | string };
  ipAddress?: string | null;
}

export async function submitCoordinateCandidate(
  db: Database,
  input: SubmitCandidateInput,
): Promise<CoordinateCandidateView> {
  requirePermission(input.submittedBy.role, "REVIEW_VERIFICATIONS");

  const verdict = evaluateCandidate({
    latitude: input.latitude,
    longitude: input.longitude,
  });
  if (!verdict.ok) {
    throw new GeoError(`Coordinate rejected: ${verdict.issues.join("; ")}`);
  }

  let provider = input.provider ?? null;
  if (
    (input.source ?? coordinateCandidateSourceEnum.MANUAL) === coordinateCandidateSourceEnum.MANUAL
  ) {
    provider = provider && provider !== "manual" ? provider : "manual";
  }
  if (provider && provider !== "manual" && !resolveGeoProvider(provider)) {
    throw new GeoError(`Unknown geocoding provider "${provider}" — see geo/providers registry.`);
  }

  const [row] = await db
    .insert(coordinateCandidates)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      latitude: input.latitude,
      longitude: input.longitude,
      source: input.source ?? coordinateCandidateSourceEnum.MANUAL,
      provider,
      query: input.query?.trim() || null,
      placeName: input.placeName?.trim() || null,
      confidence: input.confidence ?? confidenceEnum.UNKNOWN,
      attribution: input.attribution?.trim() || null,
      referenceUrl: input.referenceUrl?.trim() || null,
      notes: input.notes?.trim() || null,
      status: coordinateCandidateStatusEnum.PENDING_REVIEW,
      submittedById: input.submittedBy.id,
    })
    .returning();

  await writeAudit(db, {
    userId: input.submittedBy.id,
    action: auditActions.COORDINATE_CANDIDATE_SUBMITTED,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: {
      candidateId: row.id,
      source: row.source,
      provider,
      status: coordinateCandidateStatusEnum.PENDING_REVIEW,
    },
    ipAddress: input.ipAddress,
  });

  return toView(row, null);
}

export async function listCoordinateCandidates(
  db: Database,
  opts: { entityType?: string; entityId?: string; status?: string; limit?: number } = {},
): Promise<CoordinateCandidateView[]> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const conditions = [];
  if (opts.entityType) conditions.push(eq(coordinateCandidates.entityType, opts.entityType));
  if (opts.entityId) conditions.push(eq(coordinateCandidates.entityId, opts.entityId));
  if (opts.status) conditions.push(eq(coordinateCandidates.status, opts.status));

  const rows = await db
    .select({
      c: coordinateCandidates,
      submittedName: users.name,
    })
    .from(coordinateCandidates)
    .leftJoin(users, eq(coordinateCandidates.submittedById, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(coordinateCandidates.createdAt))
    .limit(limit);
  return rows.map((r) => toView(r.c, r.submittedName));
}

export async function decideCoordinateCandidate(
  db: Database,
  input: DecideCandidateInput,
): Promise<CoordinateCandidateView> {
  requirePermission(input.reviewer.role, "REVIEW_VERIFICATIONS");

  const [row] = await db
    .select({ c: coordinateCandidates, submittedName: users.name })
    .from(coordinateCandidates)
    .leftJoin(users, eq(coordinateCandidates.submittedById, users.id))
    .where(eq(coordinateCandidates.id, input.candidateId))
    .limit(1);
  if (!row) throw new GeoError("Coordinate candidate not found.");
  if (row.c.status !== coordinateCandidateStatusEnum.PENDING_REVIEW) {
    throw new GeoError(
      `Only PENDING_REVIEW candidates can be decided (current status: ${row.c.status}).`,
    );
  }

  const [updated] = await db
    .update(coordinateCandidates)
    .set({
      status: input.decision,
      decision: input.decision === "APPROVED" ? "APPROVED" : "REJECTED",
      decisionNote: input.note?.trim() || null,
      decidedById: input.reviewer.id,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(coordinateCandidates.id, input.candidateId))
    .returning();

  await writeAudit(db, {
    userId: input.reviewer.id,
    action: auditActions.COORDINATE_CANDIDATE_DECIDED,
    entityType: updated.entityType,
    entityId: updated.entityId,
    metadata: {
      candidateId: updated.id,
      decision: updated.decision,
      toStatus: updated.status,
    },
    ipAddress: input.ipAddress,
  });

  return toView(updated, row.submittedName);
}

function toView(
  c: typeof coordinateCandidates.$inferSelect,
  submittedName: string | null,
): CoordinateCandidateView {
  return {
    id: c.id,
    entityType: c.entityType,
    entityId: c.entityId,
    latitude: c.latitude,
    longitude: c.longitude,
    source: c.source,
    provider: c.provider,
    query: c.query,
    placeName: c.placeName,
    confidence: c.confidence,
    attribution: c.attribution,
    referenceUrl: c.referenceUrl,
    status: c.status,
    decision: c.decision,
    decisionNote: c.decisionNote,
    submittedByName: submittedName,
    submittedAt: c.createdAt,
    decidedAt: c.decidedAt,
  };
}
