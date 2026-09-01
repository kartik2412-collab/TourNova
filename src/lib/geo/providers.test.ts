import { afterEach, describe, expect, it } from "vitest";
import {
  GEOCODE_PROVIDER_REGISTRY,
  GEOCODE_PROVIDERS,
  isGeoProviderConfigured,
  resolveGeoProvider,
} from "@/lib/geo/providers";

const PROVIDER_KEYS = ["GEOCODING", "MANUAL", "REMOTE"] as const;

const ENV_BACKUP: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
  if (ENV_BACKUP[key] === undefined) ENV_BACKUP[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  for (const key of Object.keys(ENV_BACKUP)) {
    setEnv(key, ENV_BACKUP[key]);
    delete ENV_BACKUP[key];
  }
});

describe("geocode provider registry", () => {
  it("registers the manual plus documented remote providers", () => {
    expect(resolveGeoProvider("manual")).not.toBeNull();
    expect(resolveGeoProvider("nominatim")).not.toBeNull();
    expect(resolveGeoProvider("google-places")).not.toBeNull();
    expect(resolveGeoProvider("mapbox")).not.toBeNull();
    expect(resolveGeoProvider("does-not-exist")).toBeNull();
  });

  it("ids are unique and every entry resolves", () => {
    const ids = new Set(GEOCODE_PROVIDERS.map((p) => p.id));
    expect(ids.size).toBe(GEOCODE_PROVIDERS.length);
    for (const p of GEOCODE_PROVIDERS) {
      expect(resolveGeoProvider(p.id)).toBe(p);
      expect(PROVIDER_KEYS.includes(p.kind)).toBe(true);
    }
  });

  it("manual is always configured and needs no keys", () => {
    const manual = resolveGeoProvider("manual")!;
    expect(manual.kind).toBe("MANUAL");
    expect(manual.configEnvKeys).toEqual([]);
    expect(isGeoProviderConfigured(manual)).toBe(true);
  });

  it("remote providers are not configured until every key is present and non-placeholder", () => {
    const nominatim = resolveGeoProvider("nominatim")!;
    setEnv("NOMINATIM_BASE_URL", "https://nominatim.example.test");
    setEnv("NOMINATIM_REFERER", "https://tournova.example.test");
    setEnv("NOMINATIM_EMAIL", "dev@tournova.test");
    expect(isGeoProviderConfigured(nominatim)).toBe(true);

    setEnv("NOMINATIM_EMAIL", undefined);
    expect(isGeoProviderConfigured(nominatim)).toBe(false);

    setEnv("NOMINATIM_EMAIL", "your_email@example.com");
    expect(isGeoProviderConfigured(nominatim)).toBe(false);
  });

  it("exposes the registry as a frozen map for lookups", () => {
    expect(GEOCODE_PROVIDER_REGISTRY["mapbox"].id).toBe("mapbox");
    expect(Object.isFrozen(GEOCODE_PROVIDER_REGISTRY)).toBe(true);
  });
});
