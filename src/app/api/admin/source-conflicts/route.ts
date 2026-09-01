import { NextResponse, type NextRequest } from "next/server";
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
import { flagSourceConflict, listSourceConflicts } from "@/lib/trust/sources";
import { flagSourceConflictSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * GET  /api/admin/source-conflicts  — list registered source conflicts.
 * POST /api/admin/source-conflicts  — flag a conflict between two source records
 *                                     that disagree about the same entity.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiUser(request, db, permissions.MANAGE_DATA_SOURCES);
  } catch (err) {
    return toErrorResponse(err);
  }
  const conflicts = await listSourceConflicts(db);
  return jsonOk({ conflicts });
}

export async function POST(request: NextRequest) {
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
  const parsed = flagSourceConflictSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");

  const conflict = await flagSourceConflict(db, {
    actor: { id: ctx.user.id, role: ctx.user.role },
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    recordAId: parsed.data.recordAId,
    recordBId: parsed.data.recordBId,
    note: parsed.data.note,
    ipAddress: clientIp(request),
  });
  return NextResponse.json(
    {
      ok: true,
      conflict: {
        id: conflict.id,
        status: conflict.status,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        valueA: conflict.valueA,
        valueB: conflict.valueB,
      },
    },
    { status: 201 },
  );
}
