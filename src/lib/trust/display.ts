/**
 * Trust display helpers — pure, deterministic functions for the trust-polish UI.
 *
 * All inputs come from the existing database schema. No data is invented.
 * Every function is side-effect-free and safe to call from both server and
 * client components.
 */

/* -------------------------------------------------------------------------- */
/*  Verification status labels                                                */
/* -------------------------------------------------------------------------- */

export type BadgeColor = "success" | "warning" | "destructive" | "muted";

export interface VerificationLabel {
  text: string;
  hint: string;
  color: BadgeColor;
}

const VERIFICATION_LABELS: Record<string, VerificationLabel> = {
  VERIFIED: {
    text: "Verified",
    hint: "Confirmed against a source. Treated as fact.",
    color: "success",
  },
  LIVE: { text: "Live", hint: "Currently streaming or authoritative data.", color: "success" },
  USER_REPORTED: {
    text: "Not yet verified",
    hint: "Submitted by a traveller. Not independently confirmed.",
    color: "warning",
  },
  ESTIMATED: {
    text: "Estimated",
    hint: "Derived from legitimate signals, not directly measured.",
    color: "warning",
  },
  PREDICTED: {
    text: "Predicted",
    hint: "Model forecast with a transparent method.",
    color: "warning",
  },
  CONFLICT: {
    text: "Conflict",
    hint: "Sources disagree. Awaiting reviewer resolution.",
    color: "destructive",
  },
  EXPIRED: { text: "Expired", hint: "Was verified but is no longer current.", color: "muted" },
  UNAVAILABLE: {
    text: "Unavailable",
    hint: "No reliable data available. TourNova does not guess.",
    color: "muted",
  },
  REJECTED: { text: "Rejected", hint: "Reviewed and not accepted.", color: "muted" },
  DEMO: { text: "Demo", hint: "Simulation data. Never presented as live.", color: "muted" },
};

export function verificationLabel(status?: string | null): VerificationLabel {
  const key = (status ?? "UNAVAILABLE").toUpperCase();
  return (
    VERIFICATION_LABELS[key] ?? {
      text: status ?? "Unavailable",
      hint: "Status not yet classified.",
      color: "muted",
    }
  );
}

/* -------------------------------------------------------------------------- */
/*  Relative time formatting                                                  */
/* -------------------------------------------------------------------------- */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Map an absolute timestamp to a compact relative-time string. */
export function relativeTime(date: Date | string, now: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const t = d.getTime();
  if (!Number.isFinite(t)) return "unknown time";

  const diff = now.getTime() - t;
  if (diff < 0) return "just now";
  if (diff < 10 * SECOND) return "just now";
  if (diff < MINUTE) return `${Math.floor(diff / SECOND)}s ago`;
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }
  if (diff < WEEK) {
    const d2 = Math.floor(diff / DAY);
    return d2 === 1 ? "yesterday" : `${d2} days ago`;
  }
  if (diff < MONTH) {
    const w = Math.floor(diff / WEEK);
    return w === 1 ? "1 week ago" : `${w} weeks ago`;
  }
  if (diff < YEAR) {
    const m = Math.floor(diff / MONTH);
    return m === 1 ? "1 month ago" : `${m} months ago`;
  }
  const y = Math.floor(diff / YEAR);
  return y === 1 ? "1 year ago" : `${y} years ago`;
}

/* -------------------------------------------------------------------------- */
/*  "Why unavailable?" explanations                                           */
/* -------------------------------------------------------------------------- */

/** Explanation for the general public (no internal jargon). */
export function publicExplanation(status?: string | null): string {
  const key = (status ?? "UNAVAILABLE").toUpperCase();
  switch (key) {
    case "UNAVAILABLE":
      return "No reliable data available right now. TourNova does not show invented information.";
    case "EXPIRED":
      return "This data was verified in the past but is no longer current. We do not present expired values as fresh.";
    case "CONFLICT":
      return "Conflicting source records exist. A human reviewer must resolve this before the data can be shown.";
    case "REJECTED":
      return "This record was reviewed and not accepted for publication.";
    case "DEMO":
      return "This is demonstration data, not live information. It is clearly labelled and never shown as real-time data.";
    case "USER_REPORTED":
      return "This was reported by a traveller and has not yet been independently confirmed by a reviewer.";
    default:
      return "Data not yet available.";
  }
}

/** Explanation for admins with slightly more detail. */
export function adminExplanation(status?: string | null): string {
  const key = (status ?? "UNAVAILABLE").toUpperCase();
  switch (key) {
    case "UNAVAILABLE":
      return "Not publicly available — this record has not completed human verification.";
    case "EXPIRED":
      return "Expired — the verification window has lapsed. Needs re-verification to be shown as fresh.";
    case "CONFLICT":
      return "Conflict — conflicting source records require human resolution before approval.";
    case "REJECTED":
      return "Rejected — a reviewer decided this record should not be published.";
    case "DEMO":
      return "Demo data — simulation content, clearly labelled and never shown as live.";
    case "USER_REPORTED":
      return "User-reported — submitted but not yet independently verified by a reviewer.";
    default:
      return "Status not determined. Awaiting review.";
  }
}

/* -------------------------------------------------------------------------- */
/*  Data completeness                                                         */
/* -------------------------------------------------------------------------- */

export interface FieldPresence {
  name: string;
  present: boolean;
}

export interface CompletenessResult {
  presentCount: number;
  totalFields: number;
  fields: FieldPresence[];
}

/**
 * Evaluate data completeness for a destination / attraction record.
 *
 * Only inspects fields that exist in the current schema. Returns null when
 * there are fewer than 3 trustworthy fields to evaluate (not enough to
 * produce a meaningful indicator).
 */
export function completeness(fields: Partial<Record<string, unknown>>): CompletenessResult | null {
  const EXPECTED_FIELDS: Array<{ key: string; label: string }> = [
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "districtName", label: "District" },
    { key: "locality", label: "Locality" },
    { key: "category", label: "Category" },
    { key: "referenceUrl", label: "Source URL" },
    { key: "latitude", label: "Coordinates" },
    { key: "longitude", label: "Coordinates" },
    { key: "verifiedAt", label: "Verification" },
  ];

  const present = new Map<string, boolean>();
  const seenLabels = new Set<string>();
  for (const { key, label } of EXPECTED_FIELDS) {
    if (!seenLabels.has(label)) seenLabels.add(label);
    const value = fields[key];
    const isSet =
      value != null && value !== "" && !(typeof value === "string" && value.trim() === "");
    if (isSet) present.set(label, true);
  }

  // Coordinates require BOTH lat and lon to count.
  const hasLat = fields.latitude != null && String(fields.latitude).trim() !== "";
  const hasLon = fields.longitude != null && String(fields.longitude).trim() !== "";
  const hasCoords = hasLat && hasLon;
  if (hasCoords) present.set("Coordinates", true);

  // Deduplicated label list (Coordinates counted once).
  const labels = [...seenLabels];
  const fieldList: FieldPresence[] = labels.map((label) => ({
    name: label,
    present: label === "Coordinates" ? hasCoords : Boolean(present.get(label)),
  }));

  const presentCount = fieldList.filter((f) => f.present).length;
  const totalFields = labels.length;

  // Need at least 3 fields present to produce a meaningful indicator.
  if (presentCount < 3) return null;

  return { presentCount, totalFields, fields: fieldList };
}
