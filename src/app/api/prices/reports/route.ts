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
import { submitPriceReportSchema } from "@/lib/validation";
import { submitPriceReport } from "@/lib/catalog/prices";

export const runtime = "nodejs";

/**
 * POST /api/prices/reports
 * An authenticated user submits a price CLAIM for an attraction. The claim is
 * stored with priceType = USER_REPORT / verificationStatus = USER_REPORTED and
 * enters the trust workflow as SUBMITTED — it is never shown publicly and can
 * never directly modify trusted or live price records. A reviewer decides it
 * via /api/admin/prices/:id/decision.
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
  const parsed = submitPriceReportSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  const report = await submitPriceReport(db, {
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    userName: ctx.user.name,
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    category: parsed.data.category,
    amount: parsed.data.amount,
    currency: parsed.data.currency,
    description: parsed.data.description || null,
    note: parsed.data.note || null,
    ipAddress: clientIp(request),
  });

  return NextResponse.json({ ok: true, report }, { status: 201 });
}
