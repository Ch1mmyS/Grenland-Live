const CACHE = "grenland-live-v2";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./calendar.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Data: network-first (unngår “sticky 0 kamper”)
  if (url.pathname.includes("/data/") || url.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Core: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
