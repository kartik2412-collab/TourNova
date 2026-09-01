import { Card } from "@/components/ui/card";
import { freshnessBadge } from "@/lib/catalog/freshness-badge";
import type { DestinationDetail } from "@/lib/catalog/discover";

/**
 * A verified destination card (Milestone 4). Shows only what a reviewed source
 * actually supplied — missing fields render as an explicit "unavailable" note,
 * never as fabricated content.
 */
export function DestinationCard({ destination }: { destination: DestinationDetail }) {
  const href = `/discover/${encodeURIComponent(destination.entityId)}`;
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold">
            <a href={href} className="hover:underline">
              {destination.name ?? destination.entityId}
            </a>
          </h3>
          <span className={freshnessBadge(destination.freshness)}>{destination.freshness}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {destination.category ? (
            <span className="rounded-full bg-muted px-2 py-0.5">{destination.category}</span>
          ) : null}
          {destination.districtName ? (
            <span className="rounded-full bg-muted px-2 py-0.5">{destination.districtName}</span>
          ) : null}
          {destination.locality ? <span>· {destination.locality}</span> : null}
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
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            Verified from{" "}
            <span className="font-medium text-foreground">{destination.source.name}</span>
          </span>
          {destination.verifiedAt ? (
            <span>{destination.verifiedAt.toISOString().slice(0, 10)}</span>
          ) : null}
          <a href={href} className="text-accent underline underline-offset-2">
            Open details →
          </a>
        </div>
      </div>
    </Card>
  );
}
