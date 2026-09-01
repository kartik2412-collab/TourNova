"use client";

import { useEffect } from "react";
import { DestinationMap, type MapPoint } from "./destination-map";
import type { MapProviderConfig } from "@/lib/geo/map-provider";

/**
 * Client shell for the public map page. Renders the map and registers the
 * offline tile-cache service worker (see public/map-sw.js) unless explicitly
 * disabled via NEXT_PUBLIC_MAP_OFFLINE_CACHE=0.
 */
export function MapShell({
  provider,
  points,
}: {
  provider: MapProviderConfig;
  points: MapPoint[];
}) {
  useEffect(() => {
    const enabled = (process.env.NEXT_PUBLIC_MAP_OFFLINE_CACHE ?? "1") === "1";
    if ("serviceWorker" in navigator && enabled) {
      void navigator.serviceWorker.register("/map-sw.js").catch(() => undefined);
    }
  }, []);

  return <DestinationMap provider={provider} points={points} />;
}
