// sw.js — SAFE (avoid caching app.js/styles/data)
const CACHE_NAME = "grenland-live-shell-v1";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k !== CACHE_NAME) ? caches.delete(k) : null)))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache these (prevents stale JS + JSON)
  const isAppJs = url.pathname.endsWith("/app.js") || url.pathname.endsWith("app.js");
  const isCss = url.pathname.endsWith("/styles.css") || url.pathname.endsWith("styles.css");
  const isData = url.pathname.includes("/Grenland-Live/data/") || url.pathname.endsWith(".json");

  if (isAppJs || isCss || isData) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
