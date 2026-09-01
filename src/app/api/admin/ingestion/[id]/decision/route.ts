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
import { decideIngestionItemSchema } from "@/lib/validation";
import { decideItem } from "@/lib/ingest/review";
import { TrustError } from "@/lib/trust/workflow";

export const runtime = "nodejs";

/**
 * POST /api/admin/ingestion/:id/decision
 * Review decision on one PENDING_REVIEW ingestion item.
 * decision: APPROVE | REJECT | UNAVAILABLE. Requires REVIEW_VERIFICATIONS + CSRF.
 * Applies the decision through the existing trust workflow (submission review),
 * which writes verifications + audit, then mirrors it onto the ingestion item.
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
  const parsed = decideIngestionItemSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    await decideItem(db, {
      itemId: id,
      reviewer: { id: ctx.user.id, role: ctx.user.role as Role },
      decision: parsed.data.decision,
      reason: parsed.data.reason,
      confidence: parsed.data.confidence,
      ipAddress: clientIp(request),
    });
    return jsonOk({ itemId: id, decision: parsed.data.decision });
  } catch (err) {
    if (err instanceof TrustError) return jsonError(400, err.message);
    return toErrorResponse(err);
  }
}
