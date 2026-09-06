import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DestinationMap, type MapPoint } from "./destination-map";
import type { MapProviderConfig } from "@/lib/geo/map-provider";

const render = (el: ReactElement) => renderToStaticMarkup(el);

const provider: MapProviderConfig = {
  id: "osm-test",
  name: "OpenStreetMap (test)",
  kind: "RASTER",
  tileTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  subdomains: "",
  attributionHtml: "© OpenStreetMap contributors",
  requiresKey: false,
  configEnvKeys: [],
  minZoom: 3,
  maxZoom: 18,
  defaultZoom: 7,
  defaultCenter: { latitude: 22.3, longitude: 71.4 },
};

const points: MapPoint[] = [
  {
    id: "p1",
    name: "Rani Ki Vav",
    category: "heritage",
    latitude: 23.8587,
    longitude: 72.1018,
    href: "/discover/rani-ki-vav",
  },
  {
    id: "p2",
    name: "Somnath Temple",
    category: "spiritual",
    latitude: 20.888,
    longitude: 70.401,
    href: "/discover/somnath",
  },
];

describe("DestinationMap accessibility", () => {
  it("exposes a focusable map region wired to keyboard instructions", () => {
    const html = render(createElement(DestinationMap, { provider, points }));
    expect(html).toContain('role="application"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-describedby="map-instructions"');
    expect(html).toContain(
      'aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 Escape"',
    );
    expect(html).toContain("Use the arrow keys to pan the map");
    expect(html).toContain("Escape to close the selected destination details");
  });

  it("labels every marker and control for assistive technology", () => {
    const html = render(createElement(DestinationMap, { provider, points }));
    expect(html).toContain('aria-label="Rani Ki Vav"');
    expect(html).toContain('aria-label="Somnath Temple"');
    expect(html).toContain('aria-label="Zoom in"');
    expect(html).toContain('aria-label="Zoom out"');
    expect(html).toContain('aria-label="Reset map view"');
  });
});
