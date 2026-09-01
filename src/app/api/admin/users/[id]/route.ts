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
import { updateUserSchema } from "@/lib/validation";
import { updateUserRole, setUserActive, AuthError } from "@/lib/auth/auth-service";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/users/:id
 * Admin: change role and/or activeness. Role changes revoke the target user's
 * sessions and write an audit record. Requires MANAGE_USERS.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireApiUser(request, db, permissions.MANAGE_USERS);
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
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input.");

  const { id } = await params;
  const actor = { id: ctx.user.id, role: ctx.user.role };
  const ip = clientIp(request);

  try {
    if (parsed.data.role !== undefined) {
      await updateUserRole(db, {
        actorRole: actor.role,
        actorId: actor.id,
        targetUserId: id,
        role: parsed.data.role,
        ipAddress: ip,
      });
    }
    if (parsed.data.isActive !== undefined) {
      await setUserActive(db, {
        actorRole: actor.role,
        actorId: actor.id,
        targetUserId: id,
        isActive: parsed.data.isActive,
        ipAddress: ip,
      });
    }
    if (parsed.data.role === undefined && parsed.data.isActive === undefined) {
      return jsonError(400, "Provide role and/or isActive to update.");
    }
  } catch (err) {
    if (err instanceof AuthError) return jsonError(400, err.message);
    return toErrorResponse(err);
  }

  const { listUsers } = await import("@/lib/auth/auth-service");
  const users = await listUsers(db);
  const updated = users.find((u) => u.id === id);
  return jsonOk({ user: updated ?? null, revokeNote: "Sessions for this user were revoked." });
}
