/**
 * MAP PROVIDER ABSTRACTION (Milestone 3D)
 * =======================================
 * The map your browser draws comes from a CONFIGURED tile/GL provider — nothing
 * is hardcoded into components and no provider API key is shipped in the repo.
 *
 * Resolution order (server-rendered and passed to the client as plain data):
 *   1. `NEXT_PUBLIC_MAP_PROVIDER` names a registered provider below;
 *   2. `NEXT_PUBLIC_MAP_TILE_URL` overrides the raster tile template;
 *   3. otherwise the public OpenStreetMap raster tiles are used (no key).
 *
 * A provider that requires a token is only selected when that token is present
 * in the environment. The client map component is deliberately dependency-free:
 * it renders plain <img> tiles and an SVG marker layer, so switching a provider
 * is a config change, not a code change.
 */

export interface MapProviderConfig {
  id: string;
  name: string;
  kind: "RASTER" | "GL";
  /** `{z}/{x}/{y}` (and optional `{s}`) tile template. */
  tileTemplate: string | null;
  /** Subdomains for tile template, e.g. "abc". */
  subdomains: string;
  /** HTML attribution string rendered over the map (required by OSM policy). */
  attributionHtml: string;
  requiresKey: boolean;
  configEnvKeys: string[];
  minZoom: number;
  maxZoom: number;
  defaultCenter: { latitude: number; longitude: number };
  defaultZoom: number;
}

const OSM_DEFAULTS = {
  name: "OpenStreetMap (standard raster)",
  tileTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  subdomains: "",
  attributionHtml:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  requiresKey: false,
  configEnvKeys: [],
  kind: "RASTER" as const,
  minZoom: 3,
  maxZoom: 18,
  defaultZoom: 7,
};

export function resolveMapProvider(
  env: Record<string, string | undefined> = process.env,
): MapProviderConfig {
  const providerId = env.NEXT_PUBLIC_MAP_PROVIDER?.trim();
  const override = env.NEXT_PUBLIC_MAP_TILE_URL?.trim();

  if (providerId && providerId !== "osm") {
    if (providerId === "mapbox-raster") {
      const token = env.MAPBOX_ACCESS_TOKEN?.trim();
      if (token) {
        const template =
          override ??
          "https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token={token}";
        return {
          ...OSM_DEFAULTS,
          id: "mapbox-raster",
          kind: "RASTER",
          name: "Mapbox (streets raster)",
          tileTemplate: template,
          defaultCenter: { latitude: 22.3, longitude: 71.4 },
          attributionHtml:
            '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">Mapbox</a> &copy; OpenStreetMap',
          requiresKey: true,
          configEnvKeys: ["MAPBOX_ACCESS_TOKEN"],
        };
      }
    }
    // Unknown or unconfigured provider → fall back to OSM rather than break.
  }

  return {
    ...OSM_DEFAULTS,
    id: override ? "custom-raster" : "osm",
    tileTemplate: override ?? OSM_DEFAULTS.tileTemplate,
    defaultCenter: { latitude: 22.3, longitude: 71.4 },
  };
}

/** True when the resolved template is safe to paste into an <img> src. */
export function isValidTileTemplate(template: string | null): boolean {
  if (!template) return false;
  return (
    /^https:\/\//i.test(template) &&
    /{z}/.test(template) &&
    /{x}/.test(template) &&
    /{y}/.test(template)
  );
}

/** Build a concrete tile URL for one tile. */
export function tileUrl(cfg: MapProviderConfig, z: number, x: number, y: number): string {
  const template = cfg.tileTemplate ?? "";
  const subdomain = cfg.subdomains ? cfg.subdomains[(x + y) % cfg.subdomains.length] : "";
  return template
    .replace("{token}", "")
    .replace("{s}", subdomain)
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

/** Web-Mercator projection helpers used by the lightweight marker layer. */
export function lonLatToWorld(lon: number, lat: number): { x: number; y: number } {
  const x = (lon + 180) / 360;
  const latRad = (lat * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
  return { x, y };
}

export function worldToLonLat(x: number, y: number): { latitude: number; longitude: number } {
  const lon = x * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { latitude: lat, longitude: lon };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
