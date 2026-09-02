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
import { decidePriceReportSchema } from "@/lib/validation";
import { decidePriceReport, PriceReportError } from "@/lib/catalog/prices";

export const runtime = "nodejs";

/**
 * POST /api/admin/prices/:id/decision
 * Reviewer decision on a USER_REPORT price claim. Runs the claim through the
 * normal trust workflow (verifications row + audit) and only on APPROVE turns
 * the price record VERIFIED so /fairprice may legally show it. Requires
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
  const parsed = decidePriceReportSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const result = await decidePriceReport(db, {
      priceRecordId: id,
      reviewer: { id: ctx.user.id, role: ctx.user.role as Role },
      decision: parsed.data.decision,
      note: parsed.data.note,
      ipAddress: clientIp(request),
    });
    return jsonOk({ result });
  } catch (err) {
    if (err instanceof PriceReportError) return jsonError(400, err.message);
    return toErrorResponse(err);
  }
}
