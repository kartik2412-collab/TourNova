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
import { recordSourceCheck } from "@/lib/trust/sources";
import { recordSourceCheckSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * POST /api/data/sources/:id/check
 * Record a mechanical availability check (reachability / fetch attempt). Logs
 * last_checked_at (+ last_successful_fetch_at on success). Never changes
 * classification, reliability, ingestion status or the live flag on its own.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = recordSourceCheckSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");

  const { id } = await params;
  await recordSourceCheck(db, {
    actor: { id: ctx.user.id, role: ctx.user.role },
    sourceId: id,
    ok: parsed.data.ok,
    note: parsed.data.note,
    ipAddress: clientIp(request),
  });
  return jsonOk({ recorded: true, ok: parsed.data.ok });
}
