import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { signIn, AuthError } from "@/lib/auth/auth-service";
import { authLimiter, clientIp } from "@/lib/auth/rate-limit";
import { signInSchema } from "@/lib/validation";
import { sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { jsonError } from "@/lib/auth/guards";

export const runtime = "nodejs";

/**
 * POST /api/auth/signin
 * Credentials authentication. On success:
 *  - a server-side session is created (DB row, hashed token),
 *  - an HttpOnly SameSite=Lax session cookie is set on the response.
 * Never returns token/password internals.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const parsed = signInSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid credentials.");
  }

  const key = `signin:${parsed.data.email.toLowerCase()}:${ip}`;
  const limited = authLimiter.check(key);
  if (!limited.allowed) {
    return jsonError(429, "Too many sign-in attempts. Please try again later.");
  }

  try {
    const { ctx, token } = await signIn(db, {
      ...parsed.data,
      ipAddress: ip,
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.json({
      ok: true,
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        role: ctx.user.role,
      },
      csrfToken: ctx.session.csrfToken,
    });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (err) {
    if (err instanceof AuthError) return jsonError(400, err.message);
    return jsonError(500, "An unexpected error occurred.");
  }
}
