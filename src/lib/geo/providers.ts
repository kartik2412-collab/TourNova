/**
 * GEO SERVICES PROVIDER REGISTRY (Milestone 3C)
 * =============================================
 * Map / geocoding / routing providers are ABSTRACTED behind a registry. No
 * provider is hardcoded into the platform code; everything routes through the
 * provider id recorded on each coordinate candidate and (planned) map config.
 *
 * Each entry documents what the provider needs, its attribution/terms, its
 * limits and its reliability — an honest "read the terms before you turn it
 * on" record, NOT a claim of trust. A provider whose required configuration is
 * absent is simply NOT considered configured and its candidates cannot be
 * produced.
 *
 * Remote providers intentionally ship DISABLED and key required: we do not
 * invent credentials, and no candidate is ever silently geocoded by default.
 * The `manual` provider (an authorized reviewer recording a coordinate from an
 * official source/survey) requires no external service.
 */

export type GeoProviderKind = "MANUAL" | "REMOTE";

export interface GeoProviderDef {
  id: string;
  name: string;
  kind: GeoProviderKind;
  /** Required env var names; all must be present (and non-empty) to count as configured. */
  configEnvKeys: string[];
  attribution: string;
  termsUrl: string | null;
  rateLimits: string;
  reliability: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  notes: string;
}

export const GEOCODE_PROVIDERS: readonly GeoProviderDef[] = [
  {
    id: "manual",
    name: "Manual entry by reviewer",
    kind: "MANUAL",
    configEnvKeys: [],
    attribution: "Recorded by an authorized TourNova reviewer from an official document or survey.",
    termsUrl: null,
    rateLimits: "n/a — review-time action, never automated.",
    reliability: "HIGH",
    notes:
      "The only geocoding source that is always available. Used when an official record (government page, gazette, survey report) states a coordinate or an authoritative place can be matched to a known location during review.",
  },
  {
    id: "nominatim",
    name: "OpenStreetMap Nominatim",
    kind: "REMOTE",
    configEnvKeys: ["NOMINATIM_BASE_URL", "NOMINATIM_REFERER", "NOMINATIM_EMAIL"],
    attribution: "© OpenStreetMap contributors",
    termsUrl: "https://operations.osmfoundation.org/policies/nominatim/",
    rateLimits:
      "Usage policy limits automated volume (≈1 req/s typical friendly use); a valid contact (referer + email) is required by policy. Provided results must carry full attribution.",
    reliability: "MEDIUM",
    notes:
      "Nominatim results are candidates, never final truth: village/vicinity-level matching dominates for scattered monuments, and result quality depends on OSM coverage. Requires a self-hosted or service-provided base URL plus policy-required contact info. Never batch-blast it.",
  },
  {
    id: "google-places",
    name: "Google Places (Geocoding)",
    kind: "REMOTE",
    configEnvKeys: ["GOOGLE_MAPS_API_KEY"],
    attribution: "© Google",
    termsUrl: "https://cloud.google.com/maps-platform/terms",
    rateLimits:
      "Billed quota with per-minute and per-day caps configured by the operator; geocoding has a cost per request.",
    reliability: "HIGH",
    notes:
      "Serving-layer data from Google serves PUBLIC maps under restricted terms; a browser API key must be restricted to the app origin. Results are candidates subject to review. Requires the operator to obtain a real key — we never embed one.",
  },
  {
    id: "mapbox",
    name: "Mapbox Geocoding",
    kind: "REMOTE",
    configEnvKeys: ["MAPBOX_ACCESS_TOKEN"],
    attribution: "© Mapbox © OpenStreetMap",
    termsUrl: "https://www.mapbox.com/legal/tos",
    rateLimits: "Quota depends on paid Mapbox plan; map tiles and geocoding are billed separately.",
    reliability: "HIGH",
    notes:
      "Popular choice for the vector map tiles + geocoding combination. Needs an operator-provided access token; public tokens must be scoped/restricted (never secret ones).",
  },
];

export const GEOCODE_PROVIDER_REGISTRY: Readonly<Record<string, GeoProviderDef>> = Object.freeze(
  Object.fromEntries(GEOCODE_PROVIDERS.map((p) => [p.id, p])) as Record<string, GeoProviderDef>,
);

export function resolveGeoProvider(id: string): GeoProviderDef | null {
  return GEOCODE_PROVIDER_REGISTRY[id] ?? null;
}

/** A remote provider is configured only when every required env key is set and non-blank. */
export function isGeoProviderConfigured(def: GeoProviderDef): boolean {
  if (def.kind === "MANUAL") return true;
  return def.configEnvKeys.every((key) => {
    const value = process.env[key]?.trim();
    return value !== undefined && value.length > 0 && !isPlaceholder(value);
  });
}

function isPlaceholder(value: string): boolean {
  return /(your_|placeholder|changeme|xxxx|your-)/i.test(value);
}

/** Short, human description of a provider's configuration status. */
export function geoProviderStatusText(def: GeoProviderDef): string {
  if (def.kind === "MANUAL") return `${def.name} — always available`;
  const missing = def.configEnvKeys.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    return `${def.name} — NOT configured (missing: ${missing.join(", ")})`;
  }
  return `${def.name} — configured (enabled)`;
}
