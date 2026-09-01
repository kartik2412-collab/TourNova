import { describe, expect, it } from "vitest";
import {
  clamp,
  isValidTileTemplate,
  lonLatToWorld,
  resolveMapProvider,
  tileUrl,
  worldToLonLat,
} from "./map-provider";

describe("resolveMapProvider", () => {
  it("falls back to public OSM raster when nothing is configured", () => {
    const cfg = resolveMapProvider({});
    expect(cfg.id).toBe("osm");
    expect(cfg.requiresKey).toBe(false);
    expect(cfg.tileTemplate).toContain("tile.openstreetmap.org");
    expect(isValidTileTemplate(cfg.tileTemplate)).toBe(true);
  });

  it("honors a custom raster tile URL", () => {
    const cfg = resolveMapProvider({
      NEXT_PUBLIC_MAP_TILE_URL: "https://cdn.example.com/{z}/{x}/{y}.png",
    });
    expect(cfg.id).toBe("custom-raster");
    expect(cfg.tileTemplate).toBe("https://cdn.example.com/{z}/{x}/{y}.png");
  });

  it("never selects a keyed provider without its token", () => {
    const cfg = resolveMapProvider({ NEXT_PUBLIC_MAP_PROVIDER: "mapbox-raster" });
    expect(cfg.id).toBe("osm");
    expect(cfg.requiresKey).toBe(false);
  });
});

describe("tile math", () => {
  it("builds concrete tile URLs with token subdomains", () => {
    const cfg = resolveMapProvider({});
    const url = tileUrl(cfg, 7, 65, 32);
    expect(url).toBe("https://tile.openstreetmap.org/7/65/32.png");
  });

  it("round-trips world projections", () => {
    const { x, y } = lonLatToWorld(71.4, 22.3);
    const back = worldToLonLat(x, y);
    expect(back.longitude).toBeCloseTo(71.4, 6);
    expect(back.latitude).toBeCloseTo(22.3, 6);
  });

  it("substitutes a subdomain deterministically", () => {
    const cfg = {
      ...resolveMapProvider({}),
      subdomains: "abc",
      tileTemplate: "https://cdn.example.com/{s}/{z}/{x}/{y}.png",
    };
    const u1 = tileUrl(cfg, 5, 10, 3);
    const u2 = tileUrl(cfg, 5, 10, 3);
    expect(u1).toBe(u2);
    const sub = u1.match(/cdn\.example\.com\/([abc])\//)?.[1];
    expect(sub).toBeDefined();
    expect("abc").toContain(sub);
  });
});

describe("geometric helpers", () => {
  it("clamps into range", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-2, 0, 3)).toBe(0);
    expect(clamp(1, 0, 3)).toBe(1);
  });
});
