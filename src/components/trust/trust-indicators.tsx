import { Badge } from "@/components/ui/card";
import {
  verificationLabel,
  relativeTime,
  completeness,
  publicExplanation,
  adminExplanation,
} from "@/lib/trust/display";
import type { FreshnessState } from "@/lib/data-policy";

/* -------------------------------------------------------------------------- */
/*  VerificationStatus — compact badge with label                              */
/* -------------------------------------------------------------------------- */

export function VerificationStatus({
  status,
  className = "",
}: {
  status?: string | null;
  className?: string;
}) {
  const v = verificationLabel(status);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} title={v.hint}>
      <Badge color={v.color}>{v.text}</Badge>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  RelativeTime — compact relative timestamp                                  */
/* -------------------------------------------------------------------------- */

export function RelativeTime({
  date,
  prefix = "",
  className = "",
}: {
  date: Date | string | null | undefined;
  prefix?: string;
  className?: string;
}) {
  if (!date) {
    return (
      <span className={`text-xs text-muted-foreground ${className}`}>
        {prefix ? `${prefix} ` : ""}Verification time unavailable
      </span>
    );
  }
  return (
    <span className={`text-xs text-muted-foreground ${className}`}>
      {prefix ? `${prefix} ` : ""}
      {relativeTime(date)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  FreshnessLabel — inline freshness with relative time                       */
/* -------------------------------------------------------------------------- */

const FRESHNESS_STYLE: Record<FreshnessState, string> = {
  FRESH: "text-emerald-600",
  STALE: "text-warning",
  EXPIRED: "text-destructive",
  UNKNOWN: "text-muted-foreground",
};

export function FreshnessLabel({
  state,
  verifiedAt,
  className = "",
}: {
  state: FreshnessState;
  verifiedAt?: Date | string | null;
  className?: string;
}) {
  const style = FRESHNESS_STYLE[state] ?? FRESHNESS_STYLE.UNKNOWN;
  const label =
    state === "UNKNOWN"
      ? "Not yet verified"
      : state === "FRESH"
        ? "Verified"
        : state === "STALE"
          ? "Was verified"
          : "Expired";

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
      <span className={`font-medium ${style}`}>{label}</span>
      {verifiedAt && state !== "UNKNOWN" ? (
        <span className="text-muted-foreground">{relativeTime(verifiedAt)}</span>
      ) : state === "UNKNOWN" ? (
        <span className="text-muted-foreground">Verification time unavailable</span>
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  UnavailabilityExplanation — why data is not shown                          */
/* -------------------------------------------------------------------------- */

export function UnavailabilityExplanation({
  status,
  variant = "public",
  className = "",
}: {
  status?: string | null;
  variant?: "public" | "admin";
  className?: string;
}) {
  const text = variant === "admin" ? adminExplanation(status) : publicExplanation(status);
  return <p className={`text-xs leading-relaxed text-muted-foreground ${className}`}>{text}</p>;
}

/* -------------------------------------------------------------------------- */
/*  CompletenessIndicator — field presence summary                             */
/* -------------------------------------------------------------------------- */

export function CompletenessIndicator({
  fields,
  className = "",
}: {
  fields: Partial<Record<string, unknown>>;
  className?: string;
}) {
  const result = completeness(fields);
  if (!result) return null;

  return (
    <div className={`text-xs ${className}`}>
      <p className="mb-1 text-muted-foreground">
        Data completeness: {result.presentCount}/{result.totalFields}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {result.fields.map((f) => (
          <span key={f.name} className={f.present ? "text-foreground" : "text-muted-foreground"}>
            {f.present ? "✓" : "○"} {f.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  LastReviewed — reviewer info for admin                                     */
/* -------------------------------------------------------------------------- */

export function LastReviewed({
  reviewerId,
  decidedAt,
  reason,
  className = "",
}: {
  reviewerId?: string | null;
  decidedAt?: string | Date | null;
  reason?: string | null;
  className?: string;
}) {
  if (!reviewerId) {
    return <p className={`text-xs text-muted-foreground ${className}`}>Not reviewed yet</p>;
  }

  return (
    <div className={`text-xs ${className}`}>
      <p className="text-muted-foreground">
        Reviewed by: <span className="font-medium text-foreground">{reviewerId}</span>
      </p>
      {decidedAt ? (
        <p className="text-muted-foreground">
          Reviewed: <span className="font-medium text-foreground">{relativeTime(decidedAt)}</span>
        </p>
      ) : null}
      {reason ? (
        <p className="mt-0.5 text-muted-foreground">
          Reason: <span className="text-foreground">{reason}</span>
        </p>
      ) : null}
    </div>
  );
}
