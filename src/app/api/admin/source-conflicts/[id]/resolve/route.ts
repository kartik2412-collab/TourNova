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
import { resolveSourceConflict } from "@/lib/trust/sources";
import { resolveSourceConflictSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * POST /api/admin/source-conflicts/:id/resolve
 * Close an OPEN source conflict by accepting one record (or rejecting both).
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
  const parsed = resolveSourceConflictSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");

  const { id } = await params;
  await resolveSourceConflict(db, {
    actor: { id: ctx.user.id, role: ctx.user.role },
    conflictId: id,
    resolution: parsed.data.resolution,
    note: parsed.data.note,
    ipAddress: clientIp(request),
  });
  return jsonOk({ resolved: true, resolution: parsed.data.resolution });
}
