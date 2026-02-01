// /sw.js — Grenland Live (SAFE CACHE)
// Målet: IKKE låse deg på gamle filer.
// - HTML/CSS/JS: network-first
// - JSON: aldri cache (alltid ferskt)

const VERSION = "gl-v18";
const CORE = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/calendar.js",
  "/calendar.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE.map(u => `${u}?v=${Date.now()}`));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== VERSION ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ikke cache JSON i det hele tatt
  if (url.pathname.endsWith(".json")) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  // Network-first for HTML/CSS/JS
  if (
    url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js")
  ){
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // Default: cache-first
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const fresh = await fetch(req);
    const cache = await caches.open(VERSION);
    cache.put(req, fresh.clone());
    return fresh;
  })());
});
