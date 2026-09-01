import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { revokeAllMySessions } from "@/lib/auth/auth-service";
import {
  requireApiUser,
  assertCsrf,
  toErrorResponse,
  clientIp,
  logSecurityEvent,
} from "@/lib/auth/guards";
import { sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * POST /api/auth/me/revoke-sessions
 * Own account: end every live session on this account, including the current
 * one, and clear the session cookie.
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

  await revokeAllMySessions(db, ctx.user.id, clientIp(request));

  const response = NextResponse.json({ ok: true, revoked: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
