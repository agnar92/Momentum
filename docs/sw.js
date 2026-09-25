const CACHE = "momentum-shell-v28";
const SHELL = [
  "index.html", "signals.html", "rebalance.html", "rebalance_pl.html", "chart.html", "strategy.html", "ep.html",
  "css/style.css",
  "js/app.js", "js/signals.js", "js/rebalance.js", "js/rebalance_pl.js", "js/chart.js", "js/chart-render.js",
  "js/chart-modal.js", "js/shared.js", "js/minicharts.js",
  "js/table-render.js", "js/qol.js", "js/pull-to-refresh.js", "js/strategy.js", "js/ep.js",
  "js/vendor/chart.umd.min.js", "js/vendor/chartjs-plugin-zoom.min.js",
  "js/vendor/chartjs-plugin-annotation.min.js", "js/vendor/xlsx.full.min.js",
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
  // Chart.js/wtyczki zoom+annotation/SheetJS byly kiedys ladowane z CDN
  // (cdn.jsdelivr.net) i celowo pomijane tutaj — teraz sa zvendorowane
  // lokalnie (js/vendor/*.min.js, patrz SHELL powyzej), wiec faktycznie
  // dzialaja offline i przechodza przez zwykla siec-najpierw strategie
  // ponizej jak reszta powloki. Ten guard nadal ma sens dla naprawde
  // zewnetrznych zasobow, ktore MUSZA zostac zewnetrzne (widgety TradingView,
  // s3.tradingview.com/external-embedding — patrz app.js::TV_PAGE_WIDGETS) —
  // te dzialaja tylko online, z ich wlasnej domeny, i nigdy nie beda
  // vendorowane/cache'owane offline.
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => { caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; })
      .catch(() => caches.match(e.request))
  );
});
