import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { signOut } from "@/lib/auth/auth-service";
import { sessionCookieOptions, SESSION_COOKIE, readTokenFromRequest } from "@/lib/auth/session";
import { assertCsrf } from "@/lib/auth/guards";
import { clientIp } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/auth/signout
 * Revokes the current session server-side and clears the cookie.
 * Requires the session's CSRF token via the x-csrf-token header.
 */
export async function POST(request: NextRequest) {
  const token = readTokenFromRequest(request);
  if (!token) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  }

  // CSRF check: needs the session row for its csrf token. Resolve the session
  // without throwing for people who are already signed out.
  const { getCurrentSession } = await import("@/lib/auth/auth-service");
  const ctx = await getCurrentSession(db, token);
  if (ctx) {
    try {
      assertCsrf(ctx, request.headers.get("x-csrf-token") ?? "");
    } catch {
      return NextResponse.json({ ok: false, error: "CSRF validation failed." }, { status: 403 });
    }
  }

  await signOut(db, token, clientIp(request));

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
