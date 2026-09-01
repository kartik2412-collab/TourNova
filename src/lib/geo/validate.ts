import { GUJARAT_BOUNDS, expanded, isInside, type Bounds } from "./limits";

/**
 * Coordinate validation — pure functions shared by the admin API and the ingest
 * pipeline. A coordinate must pass these mechanical checks before it is ever
 * stored as a candidate. This is NOT a truth check: a valid-looking coordinate
 * can still be wrong; it simply cannot be malformed or nonsense.
 */

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export interface CoordinateLike {
  latitude: number;
  longitude: number;
}

/**
 * Parses a coordinate string into {latitude, longitude}.
 * Accepts "23.85,72.12", "23.85 72.12", "23.85N 72.12E", "-23.85,72.12".
 * Returns null when the string cannot be interpreted as a pair.
 */
export function parseCoordinate(input: string): CoordinateLike | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/[\s,;/]+/).filter((p) => p.length > 0);
  if (parts.length !== 2) return null;

  const parsed = parts.map(parseDegree);
  if (!parsed[0] || !parsed[1]) return null;
  return { latitude: parsed[0], longitude: parsed[1] };
}

function parseDegree(token: string): number | null {
  const m = /^([+-]?\d+(?:\.\d+)?)\s*([NSEW])$/i.exec(token);
  if (m) {
    let value = Number(m[1]);
    const suffix = m[2].toUpperCase();
    if (suffix === "S" || suffix === "W") value = -value;
    return Number.isFinite(value) ? value : null;
  }
  const plain = Number(token);
  return Number.isFinite(plain) ? plain : null;
}

export interface CandidateVerdict {
  ok: boolean;
  issues: string[];
}

/**
 * Evaluates a candidate coordinate: finite, in valid lat/lon range, not a
 * meaningless origin, and (when `bounds` is provided) plausibly inside the
 * region — with a small margin so boundary values pass.
 */
export function evaluateCandidate(
  candidate: CoordinateLike,
  opts: { bounds?: Bounds; marginDegrees?: number } = {},
): CandidateVerdict {
  const issues: string[] = [];

  if (!isValidLatitude(candidate.latitude)) {
    issues.push(`latitude ${candidate.latitude} is outside the valid range [-90, 90]`);
  }
  if (!isValidLongitude(candidate.longitude)) {
    issues.push(`longitude ${candidate.longitude} is outside the valid range [-180, 180]`);
  }

  if (candidate.latitude === 0 && candidate.longitude === 0) {
    issues.push("coordinate is 0,0 — the origin. Treat as missing, not real.");
  }

  const bounds = opts.bounds ?? GUJARAT_BOUNDS;
  const margin = opts.marginDegrees ?? 0.05;
  if (!isInside(candidate, expanded(bounds, margin))) {
    issues.push(
      `coordinate (${candidate.latitude}, ${candidate.longitude}) is outside the region of operation`,
    );
  }

  return { ok: issues.length === 0, issues };
}
