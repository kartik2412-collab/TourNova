/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Used to throttle authentication endpoints (per identity + IP) and generic
 * API abuse (per IP). State is per-process only — documented limitation for a
 * single-instance deployment; a shared store (e.g. Redis) is the swap when the
 * platform runs multi-instance.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAfterMs: number;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly limit: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Returns whether a request for `key` is allowed, and bumps the counter. */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const entries = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    const allowed = entries.length < this.limit;
    if (allowed) {
      entries.push(now);
      this.hits.set(key, entries);
    }
    if (this.hits.size > 100_000) this.hits.clear(); // crude memory guard
    const oldest = entries[0] ?? now;
    return {
      allowed,
      remaining: Math.max(0, this.limit - entries.length),
      resetAfterMs: Math.max(0, this.windowMs - (now - oldest)),
    };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

// --- Application-wide limiters ---

/** Sign-in / sign-up: aggressively throttled per (identity + IP). */
export const authLimiter = new RateLimiter(10, 15 * 60 * 1000);

/** Generic mutating API calls per IP. */
export const apiLimiter = new RateLimiter(120, 60 * 1000);

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
