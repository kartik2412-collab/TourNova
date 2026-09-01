/**
 * TourNova map offline cache (Milestone 3D).
 *
 * A minimal cache-first service worker for map TILES only. Once a tile has been
 * fetched successfully, it is stored and served from cache on subsequent views
 * (offline maps for previously visited regions). Non-GET requests are ignored,
 * and only https GET image requests are cached. The worker never caches
 * application JSON or anything containing credentials/CSRF.
 *
 * Register from src/components/map/map-shell.tsx.
 */

const MAP_CACHE = "tournova-map-tiles-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== MAP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isTileRequest =
    req.method === "GET" &&
    /^https:/.test(url.protocol) &&
    /\.(png|jpe?g|webp|avif)(\?|$)/i.test(url.pathname);

  if (!isTileRequest) return;

  event.respondWith(
    caches.open(MAP_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && (res.headers.get("content-type") || "").startsWith("image/")) {
          await cache.put(req, res.clone());
        }
        return res;
      } catch {
        return new Response("", { status: 503 });
      }
    }),
  );
});
