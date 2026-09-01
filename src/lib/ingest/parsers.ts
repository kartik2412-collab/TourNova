import {
  canonicalDestinationKey,
  decodeHtmlEntities,
  isWellFormedUrl,
  toFiniteNumber,
} from "./text";
import { SUPPORTED_CATEGORIES, type IngestCategory } from "./sources";
import type { NormalizedDestination, RawDestination, ValidationResult } from "./types";

/**
 * PARSERS & NORMALIZERS
 * =====================
 * Convert a fetched document (HTML or extracted PDF text) into validated,
 * normalized candidate records. These are pure functions — fully unit-testable
 * without the network, and never fabricate fields the source did not provide.
 */

// Gujarat bounds for the pilot (rough state envelope; strictly to reject
// impossible values, never to invent coordinates).
const GUJARAT_LAT_MIN = 20.0;
const GUJARAT_LAT_MAX = 24.7;
const GUJARAT_LON_MIN = 68.0;
const GUJARAT_LON_MAX = 74.5;

const GT_BASE = "https://www.gujarattourism.com";

function absolutizeUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  try {
    return new URL(href, GT_BASE).toString();
  } catch {
    return href;
  }
}

/**
 * Parse a Gujarat Tourism "trail" listing page. Cards look like:
 *   <a href="https://…/uparkot-fort.html"><img …/><span>Uparkot Fort
 *       <span class="locationName">Junagadh</span></span></a>
 * We only accept anchors that carry the locationName sub-span (real destination
 * cards), so nav links and promos are naturally excluded.
 */
export function parseGujaratTrailHtml(
  html: string,
  ctx: { pageUrl: string; category?: string | null },
): RawDestination[] {
  const items: RawDestination[] = [];
  const seen = new Set<string>();
  // Match the whole card anchor so the name capture can never bleed across
  // neighbouring elements: the name span is immediately preceded by the image
  // (or nothing) and the anchor is closed right after the name span.
  const re =
    /<a\b[^>]*href="([^"]+)"[^>]*>(?:\s*<img\b[^>]*>\s*)?<span\b[^>]*>([^<]*)<span[^>]*class="locationName"[^>]*>([^<]*)<\/span>[^<]*<\/span>[^<]*<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const rawName = decodeHtmlEntities(m[2]);
    const rawDistrict = decodeHtmlEntities(m[3]);
    const name = rawName
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const districtName = rawDistrict
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) continue;

    const referenceUrl = absolutizeUrl(href.trim());
    const key = canonicalDestinationKey(name, districtName);
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      entityType: "destination",
      name,
      key,
      districtName: districtName || null,
      locality: ctx.category ? null : null,
      referenceUrl,
      category: (ctx.category as IngestCategory | null) ?? null,
      raw: {
        name,
        districtName: districtName || null,
        referenceUrl,
        category: ctx.category ?? null,
        pageUrl: ctx.pageUrl,
        "data-collection": "gujarattourism.com trail listing page",
      },
    });
  }
  return items;
}

/**
 * Official Gujarat districts + the aliases used in the ASI document.
 * Only used to split monument rows into (name, locality, district) — the
 * vocabulary is factual administrative reference data, not invented facts.
 */
const GUJARAT_DISTRICTS: [string, ...string[]][] = [
  ["Ahmedabad"],
  ["Amreli"],
  ["Anand"],
  ["Aravalli"],
  ["Banaskantha"],
  ["Bharuch"],
  ["Bhavnagar"],
  ["Botad"],
  ["Chhota Udaipur", "Chhotaudepur"],
  ["Dahod", "Dohad"],
  ["Dang", "Dangs"],
  ["Devbhoomi Dwarka", "Dwarka"],
  ["Gandhinagar"],
  ["Gir Somnath", "Somnath"],
  ["Jamnagar"],
  ["Junagadh"],
  ["Kachchh", "Kutch"],
  ["Kheda"],
  ["Mahisagar"],
  ["Mehsana", "Mahesana"],
  ["Morbi"],
  ["Narmada"],
  ["Navsari"],
  ["Panchmahal", "Panch Mahals", "Panchmahals"],
  ["Patan"],
  ["Porbandar"],
  ["Rajkot"],
  ["Sabarkantha"],
  ["Surat"],
  ["Surendranagar"],
  ["Tapi"],
  ["Vadodara", "Baroda"],
  ["Valsad"],
];

const DISTRICT_ALIAS_TO_CANONICAL: Record<string, string> = Object.fromEntries(
  GUJARAT_DISTRICTS.flatMap(([canonical, ...aliases]) =>
    [canonical, ...aliases].map((a) => [a.toLowerCase(), canonical]),
  ),
);

/** Rows outside the Gujarat list that may appear in bundled ASI documents. */
const NON_GUJARAT_TAIL_TOKENS = ["daman", "diu"];

function isJunkAsiLine(line: string): boolean {
  const l = line.toLowerCase();
  if (!line || /^\s*$/.test(line)) return true;
  if (/^(page)\s*\d+/i.test(line)) return true;
  if (/^[\d\s()|.\-]*$/.test(line)) return true;
  if (
    /(sl\.?\s*no|list of centrally|vadodara circle|rajkot circle|monuments\/?sites|j:jurisdiction|uttar?adra|gujarat\s*$)/i.test(
      l,
    )
  )
    return true;
  if (/^[-|]+\s*$/.test(line)) return true;
  return false;
}

function splitAsiRow(line: string): {
  name: string;
  locality: string | null;
  district: string | null;
} {
  let cleaned = line
    .replace(/[\u00a0\u200b]/g, " ")
    .replace(/\s*\|+\s*/g, " ")
    .trim();
  const lower = cleaned.toLowerCase();
  for (const token of NON_GUJARAT_TAIL_TOKENS) {
    if (lower.endsWith(" " + token)) return { name: "", locality: null, district: null };
  }

  // Strip a leading enumerator ("1.", "42 ", "43. ").
  cleaned = cleaned.replace(/^\d+\s*[\.\)]?\s*/, "").trim();
  // "Sl.No." style or "(26)" artifacts.
  cleaned = cleaned.replace(/^\(?\d+\s*\)?\s*/, "").trim();
  if (!cleaned) return { name: "", locality: null, district: null };

  const words = cleaned.split(/\s+/);

  // The district column may be one or two words (e.g. "Devbhoomi Dwarka") and a
  // wrapped monument name may keep trailing text AFTER the locality+district
  // pair. Pick the LAST recognized district so the pair is found wherever it
  // sits in the row; everything else becomes the monument name.
  let mStart = -1;
  let mTake = 0;
  let mEnd = -1;
  for (let start = 0; start < words.length; start += 1) {
    if (start + 1 < words.length) {
      const canon =
        DISTRICT_ALIAS_TO_CANONICAL[`${words[start]} ${words[start + 1]}`.toLowerCase()];
      if (canon && start + 1 > mEnd) {
        mStart = start;
        mTake = 2;
        mEnd = start + 1;
      }
    }
    const canon = DISTRICT_ALIAS_TO_CANONICAL[words[start].toLowerCase()];
    if (canon && start > mEnd) {
      mStart = start;
      mTake = 1;
      mEnd = start;
    }
  }

  if (mStart < 0) {
    // No district recognised: keep the row, flag for review (never guess).
    return { name: cleaned, locality: null, district: null };
  }

  const district =
    DISTRICT_ALIAS_TO_CANONICAL[
      words
        .slice(mStart, mStart + mTake)
        .join(" ")
        .toLowerCase()
    ];
  const locality = mStart > 0 ? words[mStart - 1] : null;
  const name = [...words.slice(0, mStart - (locality ? 1 : 0)), ...words.slice(mStart + mTake)]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return { name: locality ?? district, locality: null, district };
  return { name, locality, district };
}

/**
 * The ASI document bundles every state's list; keep only the section identified
 * by `heading` (e.g. "Gujarat (Vadodara Circle and Rajkot Circle)"). Returns the
 * original lines when the heading is not found so the caller can flag it.
 */
function sliceAsiSection(lines: string[], heading: string): string[] {
  const listPat = /List of Centrally Protected/;
  let start = -1;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (listPat.test(lines[i]) && (lines[i + 1] ?? "").includes(heading)) {
      start = i;
      break;
    }
    if (
      lines[i].includes("List of Centrally Protected") &&
      lines[i].includes(heading.split(" ")[0])
    ) {
      start = i;
      break;
    }
  }
  if (start < 0) return lines;

  let end = lines.length;
  for (let i = start + 1; i < lines.length - 1; i += 1) {
    if (listPat.test(lines[i]) && !(lines[i + 1] ?? "").includes(heading)) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
}

/**
 * Split normalized ASI lines into logical rows. A row starts with a row number
 * ("1. …"); continuation lines (wrapped monument names) are joined to it. Page
 * numbers, repeated table headers and circle/section labels are dropped without
 * ending the current row, so a name split across a page boundary is rejoined.
 */
function groupAsiRows(lines: string[]): string[] {
  const rows: string[] = [];
  let buffer: string[] = [];
  const rowStart = /^\d{1,4}\.?\)?\s/;

  for (const line of lines) {
    if (isJunkAsiLine(line)) continue;
    if (rowStart.test(line)) {
      if (buffer.length) rows.push(buffer.join(" "));
      buffer = [line];
    } else if (buffer.length) {
      buffer.push(line);
    } else {
      // A non-junk line without a row number (synthetic/unbundled input) is a row itself.
      buffer = [line];
    }
  }
  if (buffer.length) rows.push(buffer.join(" "));
  return rows;
}

/**
 * Parse text lines produced from the official ASI monuments PDF. When
 * `sectionHeading` is given, only that state's section of the bundled national
 * document is kept.
 */
export function parseAsiLines(
  text: string,
  ctx: { category?: string; sectionHeading?: string } = {},
): RawDestination[] {
  const items: RawDestination[] = [];
  const seen = new Set<string>();

  let lines = text.split(/\r?\n/).map((l) => l.trim());
  if (ctx.sectionHeading) lines = sliceAsiSection(lines, ctx.sectionHeading);

  for (const row of groupAsiRows(lines)) {
    const parsed = splitAsiRow(row);
    if (!parsed.name) continue;

    const key = canonicalDestinationKey(parsed.name, parsed.district ?? parsed.locality);
    // The numbered register may list several monuments with the same
    // name+district but different localities (e.g. two "Jami Masjid" in
    // Ahmedabad district). Dedup within the run on the full identity so no
    // listed monument is silently dropped; `key` remains the cross-source key.
    const duplicateKey = canonicalDestinationKey(
      parsed.name,
      [parsed.locality, parsed.district].filter(Boolean).join(" "),
    );
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);

    items.push({
      entityType: "destination",
      name: parsed.name,
      key,
      duplicateKey,
      districtName: parsed.district,
      locality: parsed.locality,
      category: ctx.category ?? "heritage",
      raw: {
        name: parsed.name,
        locality: parsed.locality,
        district: parsed.district,
        guardRail:
          "ASI centrally protected monument — structure is legally protected; facts are limited to the official list.",
      },
    });
  }
  return items;
}

/** Normalize a raw item into the fields that become `normalized_data`. */
export function normalizeDestination(raw: RawDestination): NormalizedDestination {
  const latitude = toFiniteNumber(raw.latitude);
  const longitude = toFiniteNumber(raw.longitude);
  return {
    name: raw.name,
    category: raw.category ?? null,
    districtName: raw.districtName ?? null,
    locality: raw.locality ?? null,
    latitude,
    longitude,
    referenceUrl: isWellFormedUrl(raw.referenceUrl) ? raw.referenceUrl : null,
    description: raw.description ?? null,
  };
}

/** Validate a parsed item. Mechanical checks only — never a trust judgement. */
export function validateRawDestination(raw: RawDestination): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw.name || !raw.name.trim()) {
    errors.push("missing required field: name");
  }

  if (raw.referenceUrl && !isWellFormedUrl(raw.referenceUrl)) {
    errors.push("referenceUrl is not a well-formed http(s) URL");
  }

  if (raw.category && !(SUPPORTED_CATEGORIES as readonly string[]).includes(raw.category)) {
    errors.push(`unsupported category: ${raw.category}`);
  }

  const lat = toFiniteNumber(raw.latitude);
  const lng = toFiniteNumber(raw.longitude);
  if (
    (raw.latitude != null && raw.longitude == null) ||
    (raw.latitude == null && raw.longitude != null)
  ) {
    errors.push("incomplete coordinates: latitude and longitude must be provided together");
  } else if (lat != null && lng != null) {
    if (lat < -90 || lat > 90) errors.push("invalid coordinates: latitude out of range");
    if (lng < -180 || lng > 180) errors.push("invalid coordinates: longitude out of range");
    if (
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180 &&
      (lat < GUJARAT_LAT_MIN ||
        lat > GUJARAT_LAT_MAX ||
        lng < GUJARAT_LON_MIN ||
        lng > GUJARAT_LON_MAX)
    ) {
      errors.push("invalid coordinates: outside the Gujarat pilot bounding box");
    }
  } else {
    warnings.push("no coordinates available from this source");
  }

  if (!raw.districtName) warnings.push("no district available from this source");

  return { ok: errors.length === 0, errors, warnings };
}
