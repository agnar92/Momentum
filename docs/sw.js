const CACHE = "momentum-shell-v1";
const SHELL = [
  "index.html", "rebalance.html",
  "css/style.css", "js/app.js", "js/rebalance.js",
  "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // nie ruszamy CDN (TradingView, SheetJS)

  if (url.pathname.includes("/data/")) {
    // Dane momentum: najpierw sieć (mają być świeże), offline -> ostatnia znana wersja z cache.
    e.respondWith(
      fetch(e.request)
        .then((res) => { caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Powłoka aplikacji: cache natychmiast, w tle odśwież na później.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((res) => { caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
