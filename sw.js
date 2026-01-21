// sw.js — SAFE (avoid stale caching)
const CACHE_NAME = "grenland-live-shell-v3";

const STATIC_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isJS = url.pathname.endsWith("app.js");
  const isCSS = url.pathname.endsWith("styles.css");
  const isJSON = url.pathname.endsWith(".json");

  if (isJS || isCSS || isJSON) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
