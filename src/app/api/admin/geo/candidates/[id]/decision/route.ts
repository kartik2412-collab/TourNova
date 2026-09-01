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
import { decideCoordinateCandidateSchema } from "@/lib/validation";
import { decideCoordinateCandidate, GeoError } from "@/lib/geo/candidates";

export const runtime = "nodejs";

/**
 * POST /api/admin/geo/candidates/:id/decision
 * Reviewer decision (APPROVED | REJECTED) on a PENDING_REVIEW coordinate
 * candidate. Requires REVIEW_VERIFICATIONS + CSRF. Only a human decision moves
 * a candidate forward — geocoder output is never auto-approved.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }
  const parsed = decideCoordinateCandidateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const candidate = await decideCoordinateCandidate(db, {
      candidateId: id,
      decision: parsed.data.decision,
      note: parsed.data.note,
      reviewer: { id: ctx.user.id, role: ctx.user.role as Role },
      ipAddress: clientIp(request),
    });
    return jsonOk({ candidate });
  } catch (err) {
    if (err instanceof GeoError) return jsonError(400, err.message);
    return toErrorResponse(err);
  }
}
