import type { FreshnessState } from "@/lib/data-policy";
import { FRESHNESS_DEFAULTS, type FreshnessClass } from "@/lib/data-policy";

/**
 * Freshness indicator — server component. Receives the freshness state
 * calculated by `freshnessState()` in the page so policy stays in one place.
 */

const STATE_META: Record<FreshnessState, { label: string; hint: string; dot: string }> = {
  FRESH: {
    label: "Fresh",
    hint: "Verified recently. Safe to rely on.",
    dot: "bg-success",
  },
  STALE: {
    label: "Stale",
    hint: "Was verified, but could be out of date. Check before relying on it.",
    dot: "bg-warning",
  },
  EXPIRED: {
    label: "Expired",
    hint: "This data is no longer current. We do not present expired values as fresh.",
    dot: "bg-destructive",
  },
  UNKNOWN: {
    label: "Unverified",
    hint: "No verified timestamp or validity window for this record.",
    dot: "bg-muted-foreground",
  },
};

export interface FreshnessIndicatorProps {
  state: FreshnessState;
  freshnessClass?: FreshnessClass;
  compact?: boolean;
}

export function FreshnessIndicator({
  state,
  freshnessClass,
  compact = false,
}: FreshnessIndicatorProps) {
  const meta = STATE_META[state] ?? STATE_META.UNKNOWN;
  const policy = freshnessClass ? FRESHNESS_DEFAULTS[freshnessClass] : undefined;

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={`${meta.hint}${policy ? ` Policy: refresh within ${policy}.` : ""}`}
    >
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden="true" />
      <span className="font-medium text-foreground">{meta.label}</span>
      {policy && !compact ? (
        <span className="hidden sm:inline">· fresh within {policy}</span>
      ) : null}
    </span>
  );
}
