const CACHE = "momentum-shell-v80";
const SHELL = [
  "index.html", "ep.html",
  "css/style.css",
  "js/watchlist.js", "js/chart.js", "js/annotate.js", "js/sync.js", "js/shared.js", "js/qol.js", "js/pull-to-refresh.js", "js/ep.js",
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

// Wszystko na tej samej domenie — dane watchlisty ORAZ powłoka aplikacji (HTML/CSS/JS) — idzie
// najpierw przez sieć, offline -> ostatnia znana wersja z cache. Kod jest często zmieniany, więc
// świeżość ma priorytet nad ładowaniem z cache (cache-first potrafił serwować stary skrypt długo
// po wdrożeniu poprawki). Zasoby zewnętrzne (widgety TradingView) przeglądarka pobiera sama.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => { caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; })
      .catch(() => caches.match(e.request))
  );
});
