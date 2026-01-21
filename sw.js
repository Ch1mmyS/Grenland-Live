// sw.js — Grenland Live (SAFE) — do NOT cache app.js, styles.css, or data/*.json
const CACHE_NAME = "grenland-live-shell-v2";

const STATIC_SHELL = [
  "./",
  "./index.html",
  "./manifest.json"
];

// Install: cache only shell
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL))
  );
});

// Activate: remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Fetch: never cache JS/CSS/JSON
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  const isJS = url.pathname.endsWith("app.js");
  const isCSS = url.pathname.endsWith("styles.css");
  const isJSON = url.pathname.endsWith(".json");

  if (isJS || isCSS || isJSON) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
