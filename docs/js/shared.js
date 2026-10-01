// ============================================================
// MODUŁ WSPÓLNY dla index.html/watchlist.js i ep.html/ep.js — zwykły <script>
// ładowany PRZED każdym z tych plików (bez modułów/bundlera, patrz "no build
// step" w CLAUDE.md), więc stałe/funkcje poniżej są zwykłymi globalami.
// Dla test runnera Node (tests/js/*.test.js) plik, który korzysta z tych
// globali, doczepia je do globalThis na samej górze (blok "typeof require").
// ============================================================

// Link do PEŁNEJ strony TradingView (nie osadzony widget) dla danego tickera.
function tvUrlFor(ticker) {
    return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker)}`;
}

// Komparator wierszy tabeli: sortowanie tekstowe bez uwzględniania wielkości
// liter, numeryczne dla reszty pól. Współdzielony przez wszystkie sortowalne
// tabele (tabele listy obserwowanej w watchlist.js).
function compareRows(a, b, sortKey, sortDir) {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (typeof va === "string") { va = va.toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
}

// ============================================================
// BUDOWANIE OSADZONYCH WIDGETÓW TRADINGVIEW (embed-widget-*.js) — wydzielone
// tutaj z js/chart-modal.js, gdy dokładnie to samo budowanie bloku widgetu
// zaczęło być potrzebne DRUGI raz, w js/ep.js (sekcja EP — patrz komentarz
// na górze tamtego pliku): skaner gapów (Screener), Top Stories i wykres
// 1-minutowy z VWAP w oknie EP to trzy kolejne osadzone widgety zbudowane
// dokładnie tym samym mechanizmem co panel "Dane spółki"/zakładka
// "⚡ 1 min + VWAP" na chart-modal.js. `buildTvWidgetBlock(spec, configArg)`
// jest celowo generyczne w drugim argumencie — na chart-modal.js zawsze jest
// to symbol TradingView (np. "GPW:PKN"), ale ep.js przekazuje tam też np.
// nazwę presetu screenera ("top_gainers") — spec.config(configArg) i tak
// tylko przekazuje tę wartość dalej, więc nazwa "tvSymbol" byłaby myląca.
// TV_1MIN_VWAP_WIDGET (dawniej TV_ORB_WIDGET, tylko w chart-modal.js) też
// żyje teraz tutaj z tego samego powodu — identyczny widget (Advanced Chart,
// interwał "1", studium VWAP@tv-basicstudies) jest teraz potrzebny osobno w
// zakładce "⚡ 1 min + VWAP" (Breakout/screenery na signals.html) ORAZ w
// oknie EP (dziennik EP na ep.html, patrz renderEpChartModal w js/ep.js).
// ============================================================
const TV_EMBED_BASE = "https://s3.tradingview.com/external-embedding/";

const TV_1MIN_VWAP_WIDGET = {
    src: `${TV_EMBED_BASE}embed-widget-advanced-chart.js`,
    heightPx: 600,
    autosizeFill: true,
    config: symbol => ({
        autosize: true,
        symbol,
        interval: "1",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "pl",
        allow_symbol_change: true,
        calendar: false,
        studies: ["VWAP@tv-basicstudies"],
        support_host: "https://www.tradingview.com",
    }),
};

function buildTvWidgetBlock(spec, configArg) {
    const block = document.createElement("div");
    block.className = "tv-widget-block";
    if (spec.heightPx) block.style.height = `${spec.heightPx}px`;

    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    if (spec.autosizeFill) {
        // Jak w chart-modal.js: kontener na 100%/100%, wewnętrzny div na
        // calc(100% - 32px) — te 32px rezerwują miejsce na pasek atrybucji
        // TradingView u dołu widgetu, inaczej autosize go przykrywa.
        container.style.height = "100%";
        container.style.width = "100%";
        widgetDiv.style.height = "calc(100% - 32px)";
        widgetDiv.style.width = "100%";
    }
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = spec.src;
    script.async = true;
    script.textContent = JSON.stringify(spec.config(configArg));
    container.appendChild(script);

    block.appendChild(container);
    return block;
}

// Eksport wyłącznie dla test runnera Node (tests/js/shared.test.js) — nie
// ładowany i bez efektu w przeglądarce (module tam nie istnieje).
if (typeof module !== "undefined" && module.exports) {
    module.exports = { tvUrlFor, compareRows, TV_EMBED_BASE, TV_1MIN_VWAP_WIDGET, buildTvWidgetBlock };
}
