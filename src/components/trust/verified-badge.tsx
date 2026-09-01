import { Badge } from "@/components/ui/card";

/**
 * What a verification status MEANS to a traveller.
 * Mirrors the schema's verificationStatusEnum labels.
 */
const STATUS_LABELS: Record<string, { label: string; hint: string }> = {
  VERIFIED: {
    label: "Verified",
    hint: "Confirmed by a reviewer against a source. Treated as fact.",
  },
  LIVE: {
    label: "Live",
    hint: "Currently streaming/authoritative, verified and surfaced in real time.",
  },
  USER_REPORTED: {
    label: "User-reported",
    hint: "Shared by a traveller. Not independently confirmed yet.",
  },
  ESTIMATED: {
    label: "Estimated",
    hint: "Calculated from legitimate signals. Indicated as an estimate.",
  },
  PREDICTED: {
    label: "Predicted",
    hint: "A model forecast with a transparent method. Not a measurement.",
  },
  CONFLICT: {
    label: "In conflict",
    hint: "Sources disagree. Shown as unresolved until a reviewer settles it.",
  },
  EXPIRED: {
    label: "Expired",
    hint: "Was verified but is no longer current. Not shown as fresh.",
  },
  UNAVAILABLE: {
    label: "Unavailable",
    hint: "No reliable data right now. We say so rather than guess.",
  },
  REJECTED: {
    label: "Rejected",
    hint: "Reviewed and not accepted. Not shown as fact.",
  },
  DEMO: {
    label: "Demo",
    hint: "Prototype/simulation data, clearly labelled. Never shown as live.",
  },
};

export interface VerifiedBadgeProps {
  status?: string | null;
  showHint?: boolean;
}

/** Badge with accessible hint for any verification status. */
export function VerifiedBadge({ status = "UNAVAILABLE", showHint = false }: VerifiedBadgeProps) {
  const key = (status ?? "UNAVAILABLE").toUpperCase();
  const meta = STATUS_LABELS[key] ?? {
    label: status ?? "Unavailable",
    hint: "Status not yet classified.",
  };

  return (
    <span className="inline-flex items-center gap-1.5" title={meta.hint}>
      <Badge className="uppercase" color={badgeColor(key)}>
        {meta.label}
      </Badge>
      {showHint ? <span className="text-xs text-muted-foreground">{meta.hint}</span> : null}
    </span>
  );
}

function badgeColor(
  status: string,
): "success" | "warning" | "destructive" | "info" | "muted" | "default" {
  if (status === "LIVE" || status === "VERIFIED") return "success";
  if (status === "USER_REPORTED" || status === "ESTIMATED" || status === "PREDICTED")
    return "warning";
  if (status === "CONFLICT" || status === "REJECTED") return "destructive";
  if (status === "DEMO") return "info";
  if (status === "EXPIRED" || status === "UNAVAILABLE") return "muted";
  return "default";
}
