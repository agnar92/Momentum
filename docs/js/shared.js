// ============================================================
// MODUŁ WSPÓLNY dla index.html/app.js, rebalance.html/rebalance.js,
// rebalance_pl.html/rebalance_pl.js i chart.html/chart.js (+ chart-render.js)
// — zwykły <script> tag ładowany PRZED każdym z tych plików na wszystkich
// czterech stronach (bez modułów/bundlera, patrz "no build step" w
// CLAUDE.md), więc stałe/funkcje poniżej są zwykłymi globalami dzielonymi
// między stronami, tak jak js/chart-render.js już dzieli silnik wykresu
// między index.html/chart.html (patrz komentarz na górze tamtego pliku).
// rebalance_pl.js to bliźniacza kopia rebalance.js dla WIG20/mWIG40 zamiast
// SP500/Nasdaq100/Dow Jones (osobny, w pełni automatyczny rebalanser PL,
// patrz komentarz na górze rebalance_pl.js) — korzysta z dokładnie tych
// samych globali stąd co rebalance.js.
//
// Trafia tu WYŁĄCZNIE kod, który był bajt-w-bajt (albo funkcjonalnie)
// identyczny w co najmniej dwóch z tych plików — np. STAGE_LABELS/
// STAGE_COLORS/stageCellHtml żyły osobno w app.js i w rebalance.js
// (bo strony nie miały wspólnego modułu), a compareRows/comparePickerRows to
// dwie nazwy tej samej funkcji. Rzeczy, które tylko WYGLĄDAJĄ podobnie, ale
// mają inną semantykę — np. rebalance.js własny, jednoargumentowy
// tvSymbolFor(ticker) (do eksportu CSV, domyślnie NASDAQ:, patrz currencyOf)
// kontra dwuargumentowy tvSymbolFor(ticker, universe) tutaj (do linków
// TradingView, domyślnie bez prefiksu) — zostają tam, gdzie są.
//
// Dla test runnera Node (tests/js/*.test.js, `require()` zamiast <script>)
// każdy plik, który korzysta z globali zdefiniowanych tutaj, doczepia je do
// globalThis na samej górze (patrz blok "typeof require" w app.js/
// rebalance.js/chart.js/chart-render.js) — w przeglądarce ta gałąź się nie
// wykonuje (require nie istnieje), więc zachowanie stron się nie zmienia.
// ============================================================

const UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES", "WIG20", "MWIG40", "SWIG80"];

// Pełne etykiety z dopiskiem "Momentum" — używane na dashboardzie/stronie
// wykresu (tytuły zakładek/drawera, etykieta tickera). rebalance.js ma
// WŁASNĄ, celowo krótszą wersję bez tego dopisku (pasuje lepiej do przycisków/
// chipów Kroku 1/2) — to nie jest ten sam produkt, więc nie żyje tutaj.
const UNIVERSE_LABELS = {
    SP500: "S&P 500 Momentum",
    NASDAQ100: "Nasdaq 100 Momentum",
    DOWJONES: "Dow Jones Momentum",
    WIG20: "WIG20 Momentum",
    MWIG40: "mWIG40 Momentum",
    SWIG80: "sWIG80 Momentum",
};

// WIG20/mWIG40/sWIG80 są notowane w PLN (a nie USD jak reszta uniwersów) i na GPW w
// TradingView (stąd sufiks "GPW:" w tvSymbolFor) — patrz formatPrice.
const PLN_UNIVERSES = new Set(["WIG20", "MWIG40", "SWIG80"]);

function formatPrice(price, universe) {
    return PLN_UNIVERSES.has(universe) ? `${price.toFixed(2)} zł` : `$${price.toFixed(2)}`;
}

function tvSymbolFor(ticker, universe) {
    return PLN_UNIVERSES.has(universe) ? `GPW:${ticker}` : ticker;
}

// Link do PEŁNEJ strony TradingView (nie osadzony widget) dla danego tickera.
function tvUrlFor(ticker, universe) {
    return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbolFor(ticker, universe))}`;
}

// Na telefonie przyciski "TradingView" maja otwierac APLIKACJE mobilna z tym
// tickerem zamiast strony w przegladarce:
// - Android: link `intent://` z pakietem com.tradingview.tradingviewapp — system
//   otwiera od razu aplikacje, a gdy nie jest zainstalowana, przegladarka
//   przechodzi na S.browser_fallback_url (zwykla strona tradingview.com).
// - iOS: Universal Link — ten sam https-owy adres tradingview.com, ale otwarty
//   w TEJ SAMEJ karcie (location.href), bo iOS przekazuje link do aplikacji
//   tylko przy nawigacji w biezacej karcie; window.open(_blank) laduje zawsze
//   Safari. Bez aplikacji po prostu otwiera sie strona (wstecz wraca tutaj).
// - Desktop: bez zmian — pelny wykres w nowej karcie.
function tvMobilePlatform(ua, maxTouchPoints) {
    if (/Android/i.test(ua)) return "android";
    // iPadOS 13+ przedstawia sie jako "Macintosh", odrozniamy go po dotyku.
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return "ios";
    return null;
}

function tvAndroidIntentUrl(ticker, universe) {
    const webUrl = tvUrlFor(ticker, universe);
    const path = webUrl.replace(/^https:\/\//, "");
    return `intent://${path}#Intent;scheme=https;package=com.tradingview.tradingviewapp;` +
        `S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
}

function openTradingView(ticker, universe) {
    const platform = typeof navigator === "undefined"
        ? null
        : tvMobilePlatform(navigator.userAgent || "", navigator.maxTouchPoints || 0);
    if (platform === "android") {
        window.location.href = tvAndroidIntentUrl(ticker, universe);
    } else if (platform === "ios") {
        window.location.href = tvUrlFor(ticker, universe);
    } else {
        window.open(tvUrlFor(ticker, universe), "_blank", "noopener");
    }
}

// Klasyfikacja etapow Weinsteina (Stage Analysis) dolaczona przez run_query.py
// (_compute_weinstein_stage_series) do kazdego tygodnia wykresu 10:30 — patrz
// weekly_chart.stage/signal/volume/buying_volume/buying_volume_ratio. Etykiety/
// kolory tylko do wyswietlania, logika klasyfikacji zyje wylacznie w backendzie.
const STAGE_LABELS = {
    "1": "Etap 1 — Baza",
    "2A": "Etap 2A — Świeże wybicie",
    "2B": "Etap 2B — Kontynuacja trendu",
    "3": "Etap 3 — Szczyt / dystrybucja",
    "4": "Etap 4 — Spadek",
};
const STAGE_DESCRIPTIONS = {
    "1": "Cena w ciasnej bazie (trading range) w pobliżu EMA20 — czekaj na wybicie ponad opór bazy.",
    "2A": "Świeże wybicie ponad opór bazy, potwierdzone wolumenem — klasyczny punkt wejścia.",
    "2B": "Trend trwa — kolejne wybicia kolejnych baz to punkty dokupienia (\"pyramiding\").",
    "3": "Trend się wypłaszcza po wzroście — rozważ realizację zysków, unikaj nowych wejść.",
    "4": "Cena pod opadającą EMA20 — trend spadkowy, poza rynkiem / bez nowych pozycji.",
};
const STAGE_COLORS = { "1": "#8a8f9c", "2A": "#2ecc71", "2B": "#26a65b", "3": "#e0a72e", "4": "#e0455a" };
// Musi byc zgodne z STAGE_BREAKOUT_VOLUME_RATIO w run_query.py — koloruje slupki wolumenu.
const STAGE_BREAKOUT_VOLUME_RATIO = 1.5;
// Kolory prostokatow bazy na wykresie 10:30 (patrz "bases" w weekly_chart,
// _compute_weinstein_stage_series) — "stage1" to prawdziwe dno POWYZEJ Etapu 4,
// "stage2" to kazda inna baza (kontynuacja trwajacej fali Etapu 2, patrz
// docstring w run_query.py).
const BASE_BOX_COLORS = { stage1: "#8b6dd6", stage2: "#565c6b" };

// Mała kropka + skrót etapu do kolumny "Etap" w tabelach momentum (renderTable/
// renderRsmScreenerTable/renderTtmSqueezeTable w app.js, renderPickerTable w
// rebalance.js) — ten sam STAGE_COLORS/STAGE_LABELS co odznaka nad wykresem
// (renderStageBadge, w chart-render.js).
function stageCellHtml(stage) {
    if (!stage || !STAGE_LABELS[stage]) return '<span class="stage-cell" style="color:var(--text-faint)">—</span>';
    return `<span class="stage-cell" style="color:${STAGE_COLORS[stage]}" title="${STAGE_LABELS[stage]}">`
        + `<span class="stage-dot" style="background:${STAGE_COLORS[stage]}"></span>${stage}</span>`;
}

// Komparator wierszy tabeli: sortowanie tekstowe bez uwzględniania wielkości
// liter, numeryczne dla reszty pól. Współdzielony przez wszystkie sortowalne
// tabele (renderTable/renderRsmScreenerTable/renderTtmSqueezeTable w app.js,
// renderPickerTable w rebalance.js).
function compareRows(a, b, sortKey, sortDir) {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (typeof va === "string") { va = va.toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
}

// Eksport wyłącznie dla test runnera Node (tests/js/shared.test.js) — nie
// ładowany i bez efektu w przeglądarce (module tam nie istnieje).
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        UNIVERSES, UNIVERSE_LABELS, PLN_UNIVERSES, formatPrice, tvSymbolFor, tvUrlFor,
        tvMobilePlatform, tvAndroidIntentUrl, openTradingView,
        STAGE_LABELS, STAGE_DESCRIPTIONS, STAGE_COLORS, STAGE_BREAKOUT_VOLUME_RATIO, BASE_BOX_COLORS,
        stageCellHtml, compareRows,
    };
}
