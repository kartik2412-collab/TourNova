import { safeEqual } from "./password";

/**
 * CSRF protection — synchronizer-token pattern.
 *
 * Each session carries a random `csrfToken` (stored in the `sessions` row and
 * embedded in state-changing forms/server pages). Mutating endpoints require it
 * in the `x-csrf-token` header (or form body) and compare it constant-time
 * against the session token. Combined with the SameSite=Lax session cookie this
 * provides defence-in-depth against cross-site request forgery.
 *
 * The token is NEVER sent in a readable cookie and never written to logs.
 */
export function validateCsrf(
  sessionCsrfToken: string | null | undefined,
  provided: unknown,
): boolean {
  if (typeof sessionCsrfToken !== "string" || sessionCsrfToken.length === 0) return false;
  if (typeof provided !== "string" || provided.length === 0) return false;
  return safeEqual(sessionCsrfToken, provided);
}
