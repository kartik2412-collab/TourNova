import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, toErrorResponse, jsonOk } from "@/lib/auth/guards";
import { permissions } from "@/lib/auth/permissions";
import { listUsers } from "@/lib/auth/auth-service";

export const runtime = "nodejs";

/**
 * GET /api/admin/users
 * Admin user list (no password hashes, no session internals).
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiUser(request, db, permissions.MANAGE_USERS);
  } catch (err) {
    return toErrorResponse(err);
  }
  const users = await listUsers(db);
  return jsonOk({ users });
}
