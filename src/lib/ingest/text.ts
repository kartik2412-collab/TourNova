/**
 * Text helpers shared by the ingestion parsers: HTML entity decoding, URL
 * validation and canonical-key generation (for dedup across sources/time).
 */

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  amp39: "'",
  nbsp: " ",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201c",
  rdquo: "\u201d",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  "amp;#39": "'",
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9A-Fa-f]+|[a-zA-Z0-9]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (entity.startsWith("#")) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    const lower = entity.toLowerCase();
    if (entity !== lower) {
      const named = HTML_ENTITIES[lower];
      if (named) return named;
    }
    return HTML_ENTITIES[entity] ?? match;
  });
}

export function stripHtmlTags(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(input: string): string {
  const lower = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return lower;
}

/** Canonical entity key used for dedup + cross-source conflict detection. */
export function canonicalDestinationKey(name: string, district?: string | null): string {
  const parts = [slugify(name ?? ""), district ? slugify(district) : ""].filter(Boolean);
  return parts.length > 0 ? parts.join("-") : `unknown-${Date.now()}`;
}

const ABSOLUTE_URL_RE = /^https?:\/\/[^\s<>"'`]+$/i;

export function isWellFormedUrl(value: unknown): value is string {
  if (typeof value !== "string" || !ABSOLUTE_URL_RE.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Stable JSON for comparisons/diffs (key order independent). */
export function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalSerialize(v)).join(",")}]`;
  const out: Record<string, string> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const v = (value as Record<string, unknown>)[key] ?? null;
    if (v === undefined) continue;
    out[key] = canonicalSerialize(v);
  }
  return `{${Object.entries(out)
    .map(([k, v]) => `${JSON.stringify(k)}:${v}`)
    .join(",")}}`;
}
