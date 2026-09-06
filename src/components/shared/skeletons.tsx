import type { ReactNode } from "react";

/**
 * Lightweight skeleton loading primitives for the TourNova visual language.
 * Server-compatible (no hooks). Each piece uses the muted pulse treatment and
 * mirrors the final layout's shapes so navigation never flashes a blank screen
 * or causes big layout jumps. Skeletons are decorative: every element is marked
 * `aria-hidden` and the container announces one descriptive loading label.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  const hasRounding = /\brounded(?:-\S+)?\b/.test(className);
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-muted ${hasRounding ? "" : "rounded-md"} ${className}`}
    />
  );
}

/** Accessible wrapper that announces a single loading label for the page. */
export function SkeletonPage({
  label,
  children,
  className = "",
}: {
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Mirrors PageHeader: gradient hero block with icon, eyebrow, title, copy. */
export function SkeletonHeader({ eyebrow = true }: { eyebrow?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-background to-accent/5 p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-10 rounded-xl" />
        {eyebrow ? <Skeleton className="h-4 w-28" /> : null}
      </div>
      <Skeleton className="mt-4 h-8 w-3/5 max-w-md" />
      <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
      <Skeleton className="mt-2 h-4 w-4/5 max-w-xl" />
    </div>
  );
}

/** Mirrors DestinationCard: image block + content lines inside a card. */
export function SkeletonCard() {
  return (
    <div className="skeleton-card animate-pulse overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="h-44 w-full rounded-none border-0" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="mt-2 flex items-center justify-between pt-1">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-4 w-14" />
        </div>
      </div>
    </div>
  );
}

/** Responsive card grid, matching the catalog grid gaps at each breakpoint. */
export function SkeletonGrid({
  count = 6,
  columns = "grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
}: {
  count?: number;
  columns?: string;
}) {
  return (
    <div className={`grid ${columns}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** List rows, matching the Nearby result rows. */
export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mirrors the map canvas footprint so the shell never pops in late. */
export function SkeletonMap() {
  return (
    <div className="skeleton-map relative h-[60vh] min-h-[380px] w-full overflow-hidden rounded-lg border border-border bg-muted/40">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>
      <Skeleton className="absolute bottom-3 left-3 h-3 w-24 rounded-full opacity-60" />
    </div>
  );
}

/** Mirrors the search/filter form cards (search bar + selects + submit). */
export function SkeletonForm() {
  return (
    <div className="animate-pulse flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card sm:flex-row sm:items-end">
      <div className="flex-1">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-1.5 h-11 w-full rounded-xl" />
      </div>
      <div className="w-full sm:w-36">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-1.5 h-11 w-full rounded-xl" />
      </div>
      <Skeleton className="h-11 w-24 rounded-xl" />
    </div>
  );
}

/** Mirrors the destination detail page layout (hero + metadata + panels). */
export function DetailSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="skeleton-hero overflow-hidden rounded-2xl border border-border">
        <Skeleton className="h-52 w-full rounded-none border-0 sm:h-72" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-9 w-3/5 max-w-md" />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-7 w-32 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-2/3" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-3/4" />
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </div>
      </div>
    </div>
  );
}

/** Mirrors the admin panels: nav pills + stat cards + a tall content block. */
export function AdminSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl border border-border" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
