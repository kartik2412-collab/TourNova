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
import { permissions } from "@/lib/auth/permissions";
import { apiLimiter } from "@/lib/auth/rate-limit";
import { batchReviewIngestionItemsSchema } from "@/lib/validation";
import { decideItemsBatch, BatchReviewError } from "@/lib/ingest/review";
import { TrustError } from "@/lib/trust/workflow";

export const runtime = "nodejs";

/**
 * POST /api/admin/ingestion/batch
 * Safe batch review (Chunk 4): apply the SAME decision (APPROVE | REJECT |
 * UNAVAILABLE) and reason to up to 50 PENDING_REVIEW ingestion items at once.
 *
 *   body: { ids: string[], decision, reason?, confidence? }
 *
 * - ADMIN-only (MANAGE_INGESTION) + CSRF + per-IP throttle.
 * - ALL-OR-NOTHING: the whole batch rides one transaction; if any single item
 *   fails (missing id, already decided, open source conflict, …) nothing is
 *   applied. The response names the failing item id.
 * - Every item decision reuses the single-item pipeline (decideItem), so
 *   verifications, audits and relational sync behave exactly like one-by-one.
 */
export async function POST(request: NextRequest) {
  const limited = apiLimiter.check(`batch-ingest-review:${clientIp(request)}`);
  if (!limited.allowed) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }

  let ctx;
  try {
    ctx = await requireApiUser(request, db, permissions.MANAGE_INGESTION);
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
  const parsed = batchReviewIngestionItemsSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const result = await decideItemsBatch(db, {
      ids: parsed.data.ids,
      reviewer: { id: ctx.user.id, role: ctx.user.role },
      decision: parsed.data.decision,
      reason: parsed.data.reason,
      confidence: parsed.data.confidence,
      ipAddress: clientIp(request),
    });
    return jsonOk({
      applied: result.applied,
      ids: result.ids,
      decision: parsed.data.decision,
    });
  } catch (err) {
    if (err instanceof BatchReviewError) {
      return jsonError(400, `${err.message} Nothing was changed in this batch.`);
    }
    if (err instanceof TrustError) return jsonError(400, err.message);
    return toErrorResponse(err);
  }
}
