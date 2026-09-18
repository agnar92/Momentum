const CACHE = "momentum-shell-v6";
const SHELL = [
  "index.html", "rebalance.html", "chart.html",
  "css/style.css",
  "js/app.js", "js/rebalance.js", "js/chart.js", "js/chart-render.js", "js/qol.js", "js/pull-to-refresh.js",
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

// Wszystko na tej samej domenie — dane momentum ORAZ powłoka aplikacji
// (HTML/CSS/JS) — idzie najpierw przez sieć, offline -> ostatnia znana wersja
// z cache. Wcześniej powłoka miała ODWROTNĄ strategię (cache natychmiast,
// sieć w tle "na później") — to spowodowało realny, zgłoszony przez
// użytkownika bug: rebalance.js przekierowujący do wykresu zmienił swój
// docelowy adres DWA razy w jeden dzień (najpierw index.html?...&fullscreen=1,
// potem chart.html), a przeglądarka z już zainstalowanym starym Service
// Workerem i zacache'owanym starym js/rebalance.js nadal pokazywała stare
// zachowanie (klik w wiersz prowadził donikąd/"pustej strony") aż nowy SW w
// końcu przejął kontrolę — co przy tamtej strategii mogło zająć więcej niż
// jedno odświeżenie. Kod tej strony jest wciąż aktywnie rozwijany (częste
// zmiany), więc świeżość ma tu większy priorytet niż błyskawiczne ładowanie z
// cache — offline pozostaje fallbackiem, nie domyślnym zachowaniem.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // nie ruszamy CDN (Chart.js, SheetJS)

  e.respondWith(
    fetch(e.request)
      .then((res) => { caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; })
      .catch(() => caches.match(e.request))
  );
});
