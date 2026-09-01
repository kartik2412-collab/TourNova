import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/auth-service";
import { readTokenFromRequest } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * GET /api/auth/session
 * Returns the current session summary (or authenticated:false). Used by client
 * components to reflect auth state. Includes the CSRF token so that server
 * components can embed it in forms.
 */
export async function GET(request: NextRequest) {
  const token = readTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ ok: true, authenticated: false });
  }

  const ctx = await getCurrentSession(db, token);
  if (!ctx) {
    return NextResponse.json({ ok: true, authenticated: false });
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      role: ctx.user.role,
    },
    csrfToken: ctx.session.csrfToken,
  });
}
