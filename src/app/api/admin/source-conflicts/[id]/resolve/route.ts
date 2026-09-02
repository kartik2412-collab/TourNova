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
import { resolveSourceConflict, SourceError } from "@/lib/trust/sources";
import { resolveConflictDecisionSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * POST /api/admin/source-conflicts/:id/resolve
 * Close an OPEN source conflict with an explicit human decision (ADMIN-only).
 *
 * Body (canonical conflict-decisions, see validation.ts):
 *   { decision: "KEEP_A", acceptedRecordId: "<recordA id>", note? }
 *   { decision: "KEEP_B", acceptedRecordId: "<recordB id>", note? }
 *   { decision: "REJECT_BOTH", note? }
 *   { decision: "MERGE" } → 400 (recognised but unsupported)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Per-IP throttle for admin resolution attempts (existing application limiter).
  const limited = apiLimiter.check(`resolve-conflict:${clientIp(request)}:${id}`);
  if (!limited.allowed) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }

  let ctx;
  try {
    ctx = await requireApiUser(request, db, permissions.MANAGE_DATA_SOURCES);
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
  const parsed = resolveConflictDecisionSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");

  try {
    await resolveSourceConflict(db, {
      actor: { id: ctx.user.id, role: ctx.user.role },
      conflictId: id,
      resolution: parsed.data,
      note: parsed.data.note,
      ipAddress: clientIp(request),
    });
  } catch (err) {
    if (err instanceof SourceError) return jsonError(400, err.message);
    return toErrorResponse(err);
  }
  return jsonOk({ resolved: true, decision: parsed.data.decision });
}
