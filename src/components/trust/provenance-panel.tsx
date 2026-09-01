import { VerifiedBadge } from "./verified-badge";
import { FreshnessIndicator, type FreshnessIndicatorProps } from "./freshness-indicator";

export interface ProvenanceInfo {
  sourceName: string;
  sourceType: string;
  organizationName?: string | null;
  referenceUrl?: string | null;
  reliability?: string | null;
  collectedAt?: string | null;
  verifiedAt?: string | null;
  validUntil?: string | null;
  status?: string | null;
}

export interface ProvenancePanelProps {
  info: ProvenanceInfo;
  freshness?: FreshnessIndicatorProps;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * "Where does this number come from?" panel.
 * Renders the source + record trail a traveller can rely on. Never invented —
 * whatever is not known is shown explicitly.
 */
export function ProvenancePanel({ info, freshness }: ProvenancePanelProps) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Source", info.sourceName],
    ["Type", info.sourceType],
    ["Organisation", info.organizationName || "—"],
    ["Reliability", info.reliability || "Unknown"],
    ["Collected", formatDate(info.collectedAt)],
    ["Verified", formatDate(info.verifiedAt)],
    ["Valid until", formatDate(info.validUntil)],
  ];

  return (
    <section
      aria-labelledby="provenance-heading"
      className="rounded-lg border border-border bg-muted/30 p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="provenance-heading" className="text-sm font-semibold">
          Data provenance
        </h3>
        <div className="flex items-center gap-2">
          <VerifiedBadge status={info.status} />
          {freshness ? <FreshnessIndicator {...freshness} compact /> : null}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {rows.map(([term, detail]) => (
          <div key={term} className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{term}</dt>
            <dd className="truncate font-medium" title={String(detail)}>
              {detail}
            </dd>
          </div>
        ))}
      </dl>

      {info.referenceUrl ? (
        <p className="mt-3 text-xs">
          Reference:{" "}
          <a
            href={info.referenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80"
          >
            {info.referenceUrl}
          </a>
        </p>
      ) : null}
    </section>
  );
}
