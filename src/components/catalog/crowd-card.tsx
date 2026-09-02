import { Card } from "@/components/ui/card";
import { freshnessBadge } from "@/lib/catalog/freshness-badge";
import type { PublicCrowdObservation } from "@/lib/catalog/crowd";

function getCrowdLevelLabel(level: number | null): { label: string; style: string } {
  if (level == null) return { label: "Unknown Level", style: "text-muted-foreground" };
  if (level < 30) return { label: `Low (${level}%)`, style: "text-emerald-700 font-semibold" };
  if (level < 60) return { label: `Moderate (${level}%)`, style: "text-amber-700 font-semibold" };
  if (level < 85) return { label: `High (${level}%)`, style: "text-orange-700 font-semibold" };
  return { label: `Very High (${level}%)`, style: "text-red-700 font-semibold" };
}

function fmtTime(date: Date): string {
  return new Date(date).toLocaleString();
}

/** One public (VERIFIED/LIVE) crowd observation record with its type + provenance. */
export function CrowdCard({ observation }: { observation: PublicCrowdObservation }) {
  const levelInfo = getCrowdLevelLabel(observation.crowdLevel);
  const countText =
    observation.count != null
      ? observation.capacity != null
        ? `${observation.count} / ${observation.capacity} visitors`
        : `${observation.count} visitors`
      : null;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Crowd Status
          </p>
          <p className={`mt-1 text-lg ${levelInfo.style}`}>{levelInfo.label}</p>
          {countText && <p className="mt-1 text-sm text-muted-foreground">{countText}</p>}
        </div>
        <span className={freshnessBadge(observation.freshness)}>{observation.freshness}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
          {observation.sourceType}
        </span>
        {observation.isDemo && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-800">
            DEMO/SIMULATION
          </span>
        )}
        <span>
          from <span className="font-medium text-foreground">{observation.source.name}</span>
        </span>
        <span>· Captured: {fmtTime(observation.capturedAt)}</span>
      </div>

      <div className="mt-3 border-t pt-2 flex items-center justify-between text-xs text-muted-foreground">
        {observation.verifiedAt ? (
          <span>Verified: {fmtTime(observation.verifiedAt)}</span>
        ) : (
          <span>Verified record</span>
        )}
        <a
          href={`/discover/${encodeURIComponent(observation.attractionId)}`}
          className="text-accent underline hover:opacity-80"
        >
          View destination →
        </a>
      </div>
    </Card>
  );
}
