import type { FreshnessState } from "@/lib/data-policy";

/** Tailwind classes for a freshness badge (shared by cards and detail). */
export function freshnessBadge(state: FreshnessState): string {
  switch (state) {
    case "FRESH":
      return "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700";
    case "STALE":
      return "rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning";
    case "EXPIRED":
      return "rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive";
    default:
      return "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground";
  }
}
