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
import { decideCrowdReportSchema } from "@/lib/validation";
import { decideCrowdReport, CrowdReportError } from "@/lib/catalog/crowd";

export const runtime = "nodejs";

/**
 * POST /api/admin/crowd/:id/decision
 * Reviewer decision on a USER_REPORTED crowd observation claim. Runs the claim through the
 * normal trust workflow (verifications row + audit) and only on APPROVE turns
 * the observation record VERIFIED so /crowd may legally show it. Requires
 * REVIEW_VERIFICATIONS + CSRF; user reports are never auto-approved.
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
  const parsed = decideCrowdReportSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const result = await decideCrowdReport(db, {
      observationId: id,
      reviewer: { id: ctx.user.id, role: ctx.user.role as Role },
      decision: parsed.data.decision,
      note: parsed.data.note,
      ipAddress: clientIp(request),
    });
    return jsonOk({ result });
  } catch (err) {
    if (err instanceof CrowdReportError) return jsonError(400, err.message);
    return toErrorResponse(err);
  }
}
