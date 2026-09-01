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
import { verifySubmissionSchema } from "@/lib/validation";
import { reviewSubmission, serializeSubmission, TrustError } from "@/lib/trust/workflow";

export const runtime = "nodejs";

/**
 * POST /api/data/submissions/:id/verify
 * Reviewer action: APPROVE | REJECT | CONFLICT | UNAVAILABLE | EXPIRE | PUBLISH |
 * REOPEN. Requires REVIEW_VERIFICATIONS. Records a verification row + audit.
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
  const parsed = verifySubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const updated = await reviewSubmission(db, {
      submissionId: id,
      reviewer: { id: ctx.user.id, role: ctx.user.role as Role },
      decision: parsed.data.decision,
      reason: parsed.data.reason,
      confidence: parsed.data.confidence,
      conflictWithId: parsed.data.conflictWithId,
      ipAddress: clientIp(request),
    });
    if (!updated) return jsonError(404, "Submission not found.");
    return jsonOk({ submission: serializeSubmission(updated) });
  } catch (err) {
    if (err instanceof TrustError) return jsonError(400, err.message);
    return toErrorResponse(err);
  }
}
