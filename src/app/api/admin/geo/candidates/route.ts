import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  requireApiUser,
  assertCsrf,
  toErrorResponse,
  jsonError,
  jsonOk,
  clientIp,
  logSecurityEvent,
} from "@/lib/auth/guards";
import { permissions, type Role } from "@/lib/auth/permissions";
import { listCoordinateCandidatesSchema, createCoordinateCandidateSchema } from "@/lib/validation";
import {
  submitCoordinateCandidate,
  listCoordinateCandidates,
  GeoError,
} from "@/lib/geo/candidates";

export const runtime = "nodejs";

/**
 * GET /api/admin/geo/candidates[?entityType=][&entityId=][&status=][&limit=]
 * POST /api/admin/geo/candidates
 *
 * M3C: coordinate candidates — every coordinate TourNova may show enters as a
 * PENDING_REVIEW candidate with provenance, never as truth. Requires
 * REVIEW_VERIFICATIONS; POST also requires CSRF.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiUser(request, db, permissions.REVIEW_VERIFICATIONS);
  } catch (err) {
    return toErrorResponse(err);
  }

  const url = new URL(request.url);
  const parsed = listCoordinateCandidatesSchema.safeParse({
    entityType: url.searchParams.get("entityType") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return jsonError(400, "Invalid query parameters.");

  const candidates = await listCoordinateCandidates(db, parsed.data);
  return jsonOk({ candidates, count: candidates.length });
}

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireApiUser(request, db, permissions.REVIEW_VERIFICATIONS);
  } catch (err) {
    return toErrorResponse(err);
  }
  try {
    assertCsrf(ctx, request.headers.get("x-csrf-token") ?? "");
  } catch (err) {
    await logSecurityEvent(db, { userId: ctx.user.id, kind: "csrf_failed" });
    return toErrorResponse(err);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }
  const parsed = createCoordinateCandidateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const candidate = await submitCoordinateCandidate(db, {
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      source: parsed.data.source,
      provider: parsed.data.provider,
      query: parsed.data.query,
      placeName: parsed.data.placeName,
      confidence: parsed.data.confidence,
      attribution: parsed.data.attribution,
      referenceUrl: parsed.data.referenceUrl || null,
      notes: parsed.data.notes,
      submittedBy: { id: ctx.user.id, role: ctx.user.role as Role },
      ipAddress: clientIp(request),
    });
    return jsonOk({ candidate });
  } catch (err) {
    if (err instanceof GeoError) return jsonError(400, err.message);
    return toErrorResponse(err);
  }
}
