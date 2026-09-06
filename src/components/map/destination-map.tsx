"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type MapProviderConfig,
  clamp,
  isValidTileTemplate,
  lonLatToWorld,
  tileUrl,
  worldToLonLat,
} from "@/lib/geo/map-provider";

/**
 * Dependency-free interactive map — Milestone 3D.
 *
 * Renders configured raster tiles behind an SVG/button marker layer in the same
 * web-mercator space, clusters nearby points so the set scales to India-wide
 * data, and keeps every control keyboard-accessible.
 *
 * Honesty rule: this component only ever receives APPROVED coordinate
 * candidates (see src/app/map/page.tsx). If there are none it renders the
 * empty state supplied by the caller — never a fabricated pin.
 */

export interface MapPoint {
  id: string;
  name: string;
  category: string | null;
  latitude: number;
  longitude: number;
  href: string;
}

interface Cluster {
  x: number;
  y: number;
  points: MapPoint[];
}

const TILE_SIZE = 256;
const CLUSTER_PX = 44;

export function DestinationMap({
  provider,
  points,
}: {
  provider: MapProviderConfig;
  points: MapPoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(() =>
    clamp(provider.defaultZoom, provider.minZoom, provider.maxZoom),
  );
  const [center, setCenter] = useState(provider.defaultCenter);
  const [size, setSize] = useState({ w: 960, h: 560 });
  const [selected, setSelected] = useState<MapPoint | null>(null);

  // Keep a live mirror of the view for pointer/drag math (updated post-render).
  const view = useRef({ zoom, center, size });
  useEffect(() => {
    view.current = { zoom, center, size };
  }, [zoom, center, size]);

  // Track container size (markers and tiles are drawn from the same centerPx).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setSize({ w: rect.width, h: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    void Promise.resolve().then(update);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, []);

  const scale = TILE_SIZE * Math.pow(2, zoom);
  const centerWorld = useMemo(
    () => lonLatToWorld(center.longitude, center.latitude),
    [center.longitude, center.latitude],
  );
  const centerPx = { x: centerWorld.x * scale, y: centerWorld.y * scale };
  const viewW = size.w;
  const viewH = size.h;

  const visibleTiles = useMemo(() => {
    const n = Math.pow(2, zoom);
    const minX = Math.max(0, Math.floor((centerPx.x - viewW / 2) / TILE_SIZE));
    const maxX = Math.min(n - 1, Math.floor((centerPx.x + viewW / 2) / TILE_SIZE));
    const minY = Math.max(0, Math.floor((centerPx.y - viewH / 2) / TILE_SIZE));
    const maxY = Math.min(n - 1, Math.floor((centerPx.y + viewH / 2) / TILE_SIZE));
    const tiles: { key: string; z: number; x: number; y: number; px: number; py: number }[] = [];
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        tiles.push({
          key: `${zoom}-${x}-${y}`,
          z: zoom,
          x,
          y,
          px: x * TILE_SIZE - (centerPx.x - viewW / 2),
          py: y * TILE_SIZE - (centerPx.y - viewH / 2),
        });
      }
    }
    return tiles;
  }, [zoom, centerPx.x, centerPx.y, viewW, viewH]);

  const maybeZoom = useCallback(
    (delta: number, atPx?: { x: number; y: number }) => {
      const v = view.current;
      const next = clamp(v.zoom + delta, provider.minZoom, provider.maxZoom);
      if (next === v.zoom) return;
      const s = TILE_SIZE * Math.pow(2, v.zoom);
      const sNext = TILE_SIZE * Math.pow(2, next);
      const cxp = lonLatToWorld(v.center.longitude, v.center.latitude).x * s;
      const cyp = lonLatToWorld(v.center.longitude, v.center.latitude).y * s;
      const anchor = atPx ?? { x: v.size.w / 2, y: v.size.h / 2 };
      const wx = cxp + (anchor.x - v.size.w / 2);
      const wy = cyp + (anchor.y - v.size.h / 2);
      const nextPx = {
        x: wx * (sNext / s) - (anchor.x - v.size.w / 2),
        y: wy * (sNext / s) - (anchor.y - v.size.h / 2),
      };
      setZoom(next);
      setCenter(worldToLonLat(nextPx.x / sNext, nextPx.y / sNext));
    },
    [provider.minZoom, provider.maxZoom],
  );

  const maybePan = useCallback((dx: number, dy: number) => {
    const v = view.current;
    const s = TILE_SIZE * Math.pow(2, v.zoom);
    const c = lonLatToWorld(v.center.longitude, v.center.latitude);
    const next = worldToLonLat((c.x * s - dx) / s, (c.y * s - dy) / s);
    setCenter(next);
  }, []);

  const drag = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      maybePan(e.clientX - drag.current.x, e.clientY - drag.current.y);
      drag.current = { x: e.clientX, y: e.clientY };
    },
    [maybePan],
  );

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      maybeZoom(e.deltaY < 0 ? 1 : -1, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [maybeZoom],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const key = e.key;
      if (key === "Escape") {
        setSelected(null);
        return;
      }
      const step = e.shiftKey ? 200 : 80;
      switch (key) {
        case "ArrowLeft":
          maybePan(step, 0);
          break;
        case "ArrowRight":
          maybePan(-step, 0);
          break;
        case "ArrowUp":
          maybePan(0, step);
          break;
        case "ArrowDown":
          maybePan(0, -step);
          break;
        case "+":
        case "=":
          maybeZoom(1);
          break;
        case "-":
        case "_":
          maybeZoom(-1);
          break;
        case "0":
          setZoom(clamp(provider.defaultZoom, provider.minZoom, provider.maxZoom));
          setCenter(provider.defaultCenter);
          break;
        default:
          return;
      }
      e.preventDefault();
    },
    [
      maybePan,
      maybeZoom,
      provider.defaultZoom,
      provider.minZoom,
      provider.maxZoom,
      provider.defaultCenter,
    ],
  );

  const clusters = useMemo<Cluster[]>(() => {
    const projected = points.map((p) => {
      const w = lonLatToWorld(p.longitude, p.latitude);
      return {
        p,
        x: w.x * scale - (centerPx.x - viewW / 2),
        y: w.y * scale - (centerPx.y - viewH / 2),
      };
    });
    const out: Cluster[] = [];
    for (const pr of projected) {
      const bucket = out.find(
        (c) => Math.abs(c.x - pr.x) <= CLUSTER_PX && Math.abs(c.y - pr.y) <= CLUSTER_PX,
      );
      if (bucket) {
        bucket.points.push(pr.p);
        bucket.x = (bucket.x * (bucket.points.length - 1) + pr.x) / bucket.points.length;
        bucket.y = (bucket.y * (bucket.points.length - 1) + pr.y) / bucket.points.length;
      } else {
        out.push({ x: pr.x, y: pr.y, points: [pr.p] });
      }
    }
    return out;
  }, [points, scale, centerPx.x, centerPx.y, viewW, viewH]);

  const handleClusterClick = useCallback(
    (c: Cluster) => {
      if (c.points.length === 1) {
        setSelected(c.points[0]);
        return;
      }
      const avgW =
        c.points.reduce((sum, q) => sum + lonLatToWorld(q.longitude, q.latitude).x, 0) /
        c.points.length;
      const avgH =
        c.points.reduce((sum, q) => sum + lonLatToWorld(q.longitude, q.latitude).y, 0) /
        c.points.length;
      setZoom((z) => clamp(z + 1, provider.minZoom, provider.maxZoom));
      setCenter(worldToLonLat(avgW, avgH));
    },
    [provider.minZoom, provider.maxZoom],
  );

  if (!isValidTileTemplate(provider.tileTemplate)) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
        Map tiles are not configured ({provider.id}). Set NEXT_PUBLIC_MAP_TILE_URL to a raster tile
        template.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Interactive map of verified destinations"
      aria-describedby="map-instructions"
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 Escape"
      tabIndex={0}
      className="relative h-[60vh] min-h-[380px] w-full touch-none select-none overflow-hidden rounded-lg border border-border"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
    >
      <p id="map-instructions" className="sr-only">
        Use the arrow keys to pan the map, + and — to zoom in and out, 0 to reset the view, and
        Escape to close the selected destination details.
      </p>
      {visibleTiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element -- external raster tiles, loaded unoptimized by design
        <img
          key={t.key}
          src={tileUrl(provider, t.z, t.x, t.y)}
          alt=""
          draggable={false}
          loading="lazy"
          className="pointer-events-none absolute"
          style={{ left: t.px, top: t.py, width: TILE_SIZE, height: TILE_SIZE }}
        />
      ))}

      {/* Marker / cluster layer */}
      <div className="pointer-events-none absolute inset-0">
        {clusters.map((c) => {
          const isSingle = c.points.length === 1;
          const marker = c.points[0];
          return (
            <button
              key={isSingle ? marker.id : `cluster-${Math.round(c.x)}-${Math.round(c.y)}`}
              type="button"
              aria-label={
                isSingle ? marker.name : `${c.points.length} destinations near this point`
              }
              onClick={() => handleClusterClick(c)}
              className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-black/15 text-xs font-semibold shadow-md transition-transform hover:scale-110"
              style={{
                left: c.x,
                top: c.y,
                width: isSingle ? 22 : 30,
                height: isSingle ? 22 : 30,
                background: isSingle ? "#b45309" : "#7c2d12",
                color: "white",
              }}
            >
              {isSingle ? "•" : c.points.length}
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => maybeZoom(1)}
          className="rounded-md border border-border bg-background/90 px-3 py-1 text-sm font-semibold shadow hover:bg-muted"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => maybeZoom(-1)}
          className="rounded-md border border-border bg-background/90 px-3 py-1 text-sm font-semibold shadow hover:bg-muted"
        >
          −
        </button>
        <button
          type="button"
          aria-label="Reset map view"
          onClick={() => {
            setZoom(clamp(provider.defaultZoom, provider.minZoom, provider.maxZoom));
            setCenter(provider.defaultCenter);
          }}
          className="rounded-md border border-border bg-background/90 px-2 py-1 text-xs shadow hover:bg-muted"
        >
          Reset
        </button>
      </div>

      {selected ? (
        <div
          role="dialog"
          aria-label={`${selected.name} details`}
          className="absolute bottom-3 left-3 max-w-xs rounded-lg border border-border bg-background/95 p-3 shadow-lg"
        >
          <p className="text-sm font-semibold">{selected.name}</p>
          {selected.category ? (
            <p className="mt-1 text-xs text-muted-foreground">{selected.category}</p>
          ) : null}
          <a href={selected.href} className="mt-2 inline-block text-xs text-accent underline">
            Open destination →
          </a>
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setSelected(null)}
            className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute bottom-1 right-1 rounded bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: provider.attributionHtml }}
      />
    </div>
  );
}
