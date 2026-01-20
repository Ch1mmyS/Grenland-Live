const CACHE_NAME = "grenland-live-sport-v3";

const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",

  // Datafiler (alle dine)
  "/data/champions.json",
  "/data/eliteserien.json",
  "/data/laliga.json",
  "/data/obos.json",
  "/data/premier_league.json",
  "/data/handball_vm_2026_damer.json",
  "/data/handball_vm_2026_menn.json",
  "/data/vintersport_kvinner.json",
  "/data/vintersport_menn.json",
  "/data/vm2026.json",

  "/data/event_sources.json",
  "/data/pubs.json",
  "/data/jam_rules.json",
  "/data/quiz_rules.json",

  // (football.json ligger, men brukes ikke)
  "/data/football.json",

  // Ikoner
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(()=>{});
        return res;
      }).catch(() => cached);
    })
  );
});
