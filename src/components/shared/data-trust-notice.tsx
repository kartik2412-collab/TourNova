import { ShieldCheck } from "lucide-react";

/**
 * Data-truth notice.
 *
 * TourNova never fabricates factual tourism information. Where reliable data
 * is not yet available we say so explicitly ("Reliable data unavailable")
 * instead of inventing a value. This component renders that disclosure and is
 * used by every placeholder module.
 */
export function DataTrustNotice({
  message = "Reliable data unavailable. TourNova never shows invented prices, crowd counts, opening hours or contact details. Live data will appear here once it is sourced and verified.",
  className = "",
}: {
  message?: string;
  className?: string;
}) {
  return (
    <aside
      aria-label="Data availability notice"
      className={`flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm leading-relaxed ${className}`}
    >
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
      <p className="text-muted-foreground">{message}</p>
    </aside>
  );
}
