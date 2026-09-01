import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, toErrorResponse, jsonOk } from "@/lib/auth/guards";
import { listLiveSessions } from "@/lib/auth/auth-service";

export const runtime = "nodejs";

/**
 * GET /api/auth/me/sessions
 * Own account: live sessions (id, timestamps, last IP/UA). No hashes/tokens.
 */
export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireApiUser(request, db);
  } catch (err) {
    return toErrorResponse(err);
  }
  const sessions = await listLiveSessions(db, ctx.user.id);
  return jsonOk({
    sessions: sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
    })),
  });
}
