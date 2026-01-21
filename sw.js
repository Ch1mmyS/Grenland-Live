const CACHE_NAME = "grenland-live-sport-v5"; // <-- ØK versjon når du endrer SW

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",

  // Ikoner (om du har disse)
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Installer: cache kun app-filer (ikke data/*.json)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Aktiver: rydd gamle cacher
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ✅ KRITISK: aldri cache JSON /data – alltid hent ferskt
  // Dette fikser “ikke oppdatert samtidig”.
  if (url.pathname.includes("/data/") || url.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
    );
    return;
  }

  // ✅ App-filer: cache-first for speed
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((res) => {
        // cache svar for senere
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(()=>{});
        return res;
      });
    })
  );
});
