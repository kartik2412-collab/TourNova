import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/db";
import { AuthorizationError, requirePermission, type Permission } from "./permissions";
import { AuthError, getCurrentSession, type SessionContext } from "./auth-service";
import { readTokenFromRequest } from "./session";
import { validateCsrf } from "./csrf";
import { writeAudit, auditActions } from "./audit";
import { clientIp } from "./rate-limit";

/**
 * Server-side guard helpers for route handlers.
 *
 * Every mutating API endpoint must:
 *   1. read the session token from the request cookie,
 *   2. resolve the session + user (authorization), and
 *   3. for state-changing requests, verify the CSRF synchronizer token.
 *
 * These helpers centralise that logic so a missing check is unlikely.
 */

export class UnauthorizedError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Resolve the calling user from the request cookie, or throw 401.
 * When `permission` is given, also enforces it (403).
 */
export async function requireApiUser(
  request: NextRequest,
  server: Database,
  permission?: Permission,
): Promise<SessionContext> {
  const token = readTokenFromRequest(request);
  if (!token) throw new UnauthorizedError();
  const ctx = await getCurrentSession(server, token);
  if (!ctx) throw new UnauthorizedError();
  if (permission) {
    requirePermission(ctx.user.role as never, permission);
  }
  return ctx;
}

/**
 * Verify the request carries the session's CSRF token. **Must** be called for
 * every state-changing request (defence-in-depth on top of SameSite cookies).
 */
export function assertCsrf(context: { session: { csrfToken: string } }, provided: string): void {
  if (!validateCsrf(context.session.csrfToken, provided)) {
    throw new AuthorizationError("CSRF validation failed. Refresh and try again.");
  }
}

/** Log a security event (forbidden attempt, CSRF failure) without secrets. */
export async function logSecurityEvent(
  server: Database,
  input: { userId?: string | null; kind: string; metadata?: Record<string, unknown> },
) {
  await writeAudit(server, {
    userId: input.userId ?? null,
    action: auditActions.SECURITY_EVENT,
    entityType: "request",
    metadata: { kind: input.kind, ...input.metadata },
  }).catch(() => {});
}

// --- Response helpers -------------------------------------------------------

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function jsonOk(data: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: true, ...data });
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) return jsonError(401, err.message);
  if (err instanceof AuthorizationError) return jsonError(403, err.message);
  if (err instanceof AuthError) return jsonError(400, err.message);
  return jsonError(500, "An unexpected error occurred.");
}

export { AuthError, clientIp };
