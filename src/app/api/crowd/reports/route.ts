import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  requireApiUser,
  assertCsrf,
  toErrorResponse,
  jsonError,
  clientIp,
  logSecurityEvent,
} from "@/lib/auth/guards";
import { submitCrowdReportSchema } from "@/lib/validation";
import { submitCrowdReport } from "@/lib/catalog/crowd";

export const runtime = "nodejs";

/**
 * POST /api/crowd/reports
 * An authenticated user submits a crowd observation CLAIM for an attraction.
 * The claim is stored with sourceType = USER_REPORTED / verificationStatus =
 * USER_REPORTED and enters the trust workflow as SUBMITTED — it is never shown
 * publicly and can never directly modify trusted or live crowd records. A
 * reviewer decides it via /api/admin/crowd/:id/decision.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireApiUser(request, db);
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
  const parsed = submitCrowdReportSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  const report = await submitCrowdReport(db, {
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    userName: ctx.user.name,
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    crowdLevel: parsed.data.crowdLevel ?? null,
    count: parsed.data.count ?? null,
    capacity: parsed.data.capacity ?? null,
    description: parsed.data.description || null,
    note: parsed.data.note || null,
    ipAddress: clientIp(request),
  });

  return NextResponse.json({ ok: true, report }, { status: 201 });
}
