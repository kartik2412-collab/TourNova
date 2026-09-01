/**
 * Data freshness policy.
 *
 * Freshness is a *presentation* concept: whether a record that WAS verified can
 * still be presented as current, or must be flagged stale/expired. It never
 * fabricates a value — an EXPIRED record is shown as "Reliable data
 * unavailable" (or clearly labelled expired), not re-presented as current.
 *
 * Thresholds are configuration, not hardcoded assumptions. Defaults:
 *
 *   Crowd observations   30 minutes            FRESHNESS_CROWD_MINUTES
 *   Prices / fares       24 hours              FRESHNESS_PRICE_HOURS
 *   Opening hours         7 days               FRESHNESS_HOURS_HOURS
 *   Business records     30 days               FRESHNESS_BUSINESS_DAYS
 *   Everything else      30 days               FRESHNESS_DEFAULT_DAYS
 *
 * All thresholds come from env vars so they can be tuned per deployment
 * without a code change. A record with neither a verified-at time nor a valid
 * window is UNKNOWN (indistinguishable from "never verified").
 */

export type FreshnessClass = "crowd" | "price" | "hours" | "business" | "default";

export type FreshnessState = "FRESH" | "STALE" | "EXPIRED" | "UNKNOWN";

const DEFAULT_THRESHOLDS_MS: Record<FreshnessClass, number> = {
  crowd: 30 * 60 * 1000,
  price: 24 * 60 * 60 * 1000,
  hours: 7 * 24 * 60 * 60 * 1000,
  business: 30 * 24 * 60 * 60 * 1000,
  default: 30 * 24 * 60 * 60 * 1000,
};

function envMinutes(key: string, fallbackMinutes: number): number {
  const n = Number(process.env[key]);
  if (Number.isFinite(n) && n > 0) return n;
  return fallbackMinutes;
}

/** Threshold (ms) after which a verified record of `cls` is considered stale. */
export function freshnessThresholdMs(cls: FreshnessClass): number {
  const HOUR = 60;
  const DAY = 24 * HOUR;
  switch (cls) {
    case "crowd":
      return envMinutes("FRESHNESS_CROWD_MINUTES", DEFAULT_THRESHOLDS_MS.crowd / 60000) * 60 * 1000;
    case "price":
      return (
        envMinutes("FRESHNESS_PRICE_HOURS", DEFAULT_THRESHOLDS_MS.price / 3600000) *
        HOUR *
        60 *
        1000
      );
    case "hours":
      return (
        envMinutes("FRESHNESS_HOURS_HOURS", DEFAULT_THRESHOLDS_MS.hours / 3600000) *
        HOUR *
        60 *
        1000
      );
    case "business":
      return (
        envMinutes("FRESHNESS_BUSINESS_DAYS", DEFAULT_THRESHOLDS_MS.business / 86400000) *
        DAY *
        60 *
        1000
      );
    default:
      return (
        envMinutes("FRESHNESS_DEFAULT_DAYS", DEFAULT_THRESHOLDS_MS.default / 86400000) *
        DAY *
        60 *
        1000
      );
  }
}

export interface FreshnessInput {
  verifiedAt?: Date | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  freshnessClass?: FreshnessClass;
}

export function freshnessState(input: FreshnessInput, now: Date = new Date()): FreshnessState {
  const cls = input.freshnessClass ?? "default";
  const t = now.getTime();

  // A hard validity window governs regardless of thresholds.
  if (input.validFrom && t < input.validFrom.getTime()) return "UNKNOWN";
  if (input.validUntil && t > input.validUntil.getTime()) return "EXPIRED";

  if (!input.verifiedAt) return "UNKNOWN";

  const age = t - input.verifiedAt.getTime();
  return age <= freshnessThresholdMs(cls) ? "FRESH" : "STALE";
}

export const FRESHNESS_DEFAULTS: Record<FreshnessClass, string> = {
  crowd: "30 minutes",
  price: "24 hours",
  hours: "7 days",
  business: "30 days",
  default: "30 days",
};
