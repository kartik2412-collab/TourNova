import Link from "next/link";
import { ShieldCheck, ArrowRight, MapPin } from "lucide-react";
import { freshnessBadge } from "@/lib/catalog/freshness-badge";
import type { DestinationDetail } from "@/lib/catalog/discover";
import { DestinationImage } from "@/components/visual/destination-image";

/**
 * A verified destination card (visual redesign).
 * Shows only what a reviewed source actually supplied — missing fields render
 * as an explicit "unavailable" note, never as fabricated content.
 */
export function DestinationCard({ destination }: { destination: DestinationDetail }) {
  const href = `/discover/${encodeURIComponent(destination.entityId)}`;

  return (
    <Link
      href={href}
      className="card-interactive group flex flex-col overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="relative">
        <DestinationImage
          entityId={destination.entityId}
          category={destination.category}
          name={destination.name}
          className="h-44 w-full"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {destination.category ? (
            <span className="rounded-full bg-white/85 px-2.5 py-0.5 text-xs font-medium text-gray-800 backdrop-blur">
              {destination.category}
            </span>
          ) : null}
        </div>
        <span
          className={`absolute right-3 top-3 rounded-full bg-white/85 px-2.5 py-0.5 text-xs font-medium backdrop-blur ${freshnessBadge(
            destination.freshness,
          )}`}
        >
          {destination.freshness}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold">{destination.name ?? destination.entityId}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {destination.districtName ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {destination.districtName}
            </span>
          ) : null}
          {destination.locality ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
              {destination.locality}
            </span>
          ) : null}
        </div>

        {destination.description ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {destination.description}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            Description unavailable from the source.
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Verified</span>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
            Explore
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </div>

        <p className="truncate text-xs text-muted-foreground">
          Source: <span className="font-medium text-foreground">{destination.source.name}</span>
          {destination.verifiedAt ? (
            <span className="ml-1">· {destination.verifiedAt.toISOString().slice(0, 10)}</span>
          ) : null}
        </p>
      </div>
    </Link>
  );
}
