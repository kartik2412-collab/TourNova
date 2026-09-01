import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signUp, AuthError } from "@/lib/auth/auth-service";
import { authLimiter, clientIp } from "@/lib/auth/rate-limit";
import { signUpSchema } from "@/lib/validation";
import { jsonError } from "@/lib/auth/guards";

export const runtime = "nodejs";

/**
 * POST /api/auth/signup
 * Creates a TOURIST account. Roles are never selectable at signup — they are
 * granted by an ADMIN afterwards.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = authLimiter.check(`signup:${ip}`);
  if (!limited.allowed) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const parsed = signUpSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const user = await signUp(db, { ...parsed.data, ipAddress: ip });
    return NextResponse.json(
      { ok: true, user: { id: user.id, email: user.email, role: user.role } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AuthError) return jsonError(400, err.message);
    return jsonError(500, "An unexpected error occurred.");
  }
}
