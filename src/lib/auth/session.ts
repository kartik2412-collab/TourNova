import { randomBytes, createHash } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Sessions — server-side, revocable, opaque tokens.
 *
 * The browser cookie holds a random 256-bit token. The database stores only
 * its SHA-256 hash (see `sessions` table), so a DB leak is not a session leak.
 * Tokens are looked up per request; revoking a row kills the session.
 *
 * Cookie settings: HttpOnly, SameSite=Lax (defense-in-depth against CSRF),
 * Secure in production, scoped to the session TTL.
 */

export const SESSION_COOKIE = "tn_session";

export const SESSION_TTL_DAYS = (() => {
  const n = Number(process.env.AUTH_SESSION_TTL_DAYS);
  if (Number.isFinite(n) && n > 0 && n <= 365) return n;
  return 30;
})();

export function sessionTtlMs(): number {
  return SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateCsrfToken(): string {
  return randomBytes(16).toString("base64url");
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}

const COOKIE_RE = /(?:^|;\s*)tn_session=([^;]+)/;

/** Extract the session token from a request's Cookie header. */
export function readTokenFromRequest(request: Request | NextRequest): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = COOKIE_RE.exec(cookieHeader);
  return match ? decodeURIComponent(match[1]) : null;
}

export function parseCookiesHeader(cookieHeader: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}
