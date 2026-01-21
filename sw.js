// sw.js — SAFE VERSION (no cache for app.js / data)
// Prevents stale JS + JSON issues on GitHub Pages

const CACHE_NAME = "grenland-live-static-v1";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Install: cache ONLY static shell (not JS/data)
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - NEVER cache app.js, styles.css, data/*.json
// - Network first for everything else
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Do NOT cache dynamic content
  if (
    url.pathname.endsWith("app.js") ||
    url.pathname.endsWith("styles.css") ||
    url.pathname.startsWith("/Grenland-Live/data/")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
