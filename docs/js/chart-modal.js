// UNIVERSE_LABELS/tvSymbolFor/tvUrlFor/STAGE_COLORS zyja w js/shared.js,
// latestNonNullIdx w js/minicharts.js, renderRelativeStrengthChart/
// renderStageBadge/destroyChartInstances/resetChartZoom/rs*ChartInstance w
// js/chart-render.js — wszystkie ladowane PRZED tym plikiem (patrz kolejnosc
// <script> w index.html/signals.html). Node (tests/js/) nie laduje <script>
// tagow, wiec odtwarzamy to samo wspoldzielenie globali recznie tylko tam.
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./minicharts.js"));
}

// ============================================================
// WSPÓLNY MECHANIZM WYŚWIETLANIA WYKRESU SPÓŁKI (okienko modalne + panel
// TradingView + tryb pełnoekranowy) — wydzielony z app.js, żeby mógł go
// współdzielić index.html ("Indeksy") ORAZ signals.html ("Sygnały", ekstrakcja
// zakładek Wybicie/TTM Squeeze/Continuation z dashboardu — patrz CLAUDE.md):
// obie strony mają własne tabele/kafelki, których wiersz/kafelek po kliknięciu
// ma otworzyć DOKŁADNIE ten sam wykres w tym samym okienku, więc duplikowanie
// tego kodu w dwóch plikach byłoby dokładnie tym "copy-paste zamiast jednego
// wspólnego produktu", co ten projekt już wcześniej niejednokrotnie
// refaktoryzował (patrz geneza js/shared.js). Strona-konsument (app.js/
// signals.js) deklaruje WŁASNY `state` (data/selectedTicker/selectedUniverse/
// currentRsEntry/chartView) — funkcje tutaj czytają go jako zwykły global,
// dokładnie tak samo jak np. js/chart-render.js już czyta STAGE_LABELS z
// shared.js, tylko w odwrotnym kierunku (plik załadowany PRZED stroną, którą
// ta strona potem wywołuje).
// ============================================================

// ============================================================
// PANEL "Dane spółki (TradingView)" — pełna, jednostronicowa "wizytówka"
// spółki złożona z darmowych, osadzonych widgetów TradingView, 1:1 wg wzorca
// z oficjalnego tutoriala TradingView "Build a page"
// (tradingview.com/widget-docs/tutorials/iframe/build-page/demo/): pasek
// Ticker Tape, nagłówek Symbol Info, pełny interaktywny Advanced Chart,
// Profil spółki, Dane fundamentalne, a na dole dwie kolumny — Analiza
// techniczna (gauge) i oś czasu newsów.
//
// Advanced Chart wraca tu świadomie — wcześniej był usunięty z GŁÓWNEGO
// panelu wykresu (patrz CLAUDE.md) wyłącznie dlatego, że dołożenie do niego
// symbolu porównawczego (compare) potrafiło uderzyć w limity darmowego
// konta. Tutaj configu NIE rozszerzamy o compare — to inny, osobny widget na
// osobnej zakładce, więc tamten problem go nie dotyczy.
//
// Configi i wysokości bloków są 1:1 ze źródłem tego samego tutoriala, który
// użytkownik dostarczył jako gotowy plik HTML — przepisane stąd co do pola:
// per-widget `heightPx` odpowiada tamtejszym CSS regułom `#advanced-chart{
// height:500px}` itd. (symbol-info celowo BEZ wymuszonej wysokości, tak jak
// tam), `height:"100%"` w configu zamiast twardej liczby pikseli (rozmiar
// nadaje kontener, nie sam widget), a Advanced Chart zachowuje tamtejszą
// specjalną budowę DOM: `autosize:true` + wewnętrzny
// `.tradingview-widget-container__widget` na `calc(100% - 32px)` (te 32px to
// pasek atrybucji TradingView u dołu widgetu). Jedyna świadoma zmiana wobec
// źródła to `colorTheme`/`theme:"dark"` + `isTransparent:true` (tam gdzie
// widget to wspiera) — dzięki temu każdy blok pokazuje się na tle
// .tv-widget-block/.chart-panel (var(--panel)) zamiast rysować własne,
// osobne tło, więc wygląda spójnie z resztą apki bez dodatkowego CSS.
//
// Każdy config bierze symbol jako funkcję (ticker-tape ma stałą, niezależną
// od wybranej spółki listę indeksów/benchmarków — stąd konfigFn, która
// argument po prostu ignoruje). Osadzone <script> nie mają API do podmiany
// symbolu w locie, więc renderTvOverviewPanel przy każdej zmianie tickera
// buduje WSZYSTKIE bloki od zera.
// ============================================================
const TV_EMBED_BASE = "https://s3.tradingview.com/external-embedding/";

const TV_TICKER_TAPE_SYMBOLS = [
    { proName: "AMEX:SPY", title: "S&P 500" },
    { proName: "NASDAQ:QQQ", title: "Nasdaq 100" },
    { proName: "AMEX:DIA", title: "Dow Jones" },
    { proName: "GPW:WIG20", title: "WIG20" },
];

// Widgety pełnej szerokości, w kolejności od góry.
const TV_PAGE_WIDGETS = [
    {
        src: `${TV_EMBED_BASE}embed-widget-ticker-tape.js`,
        config: () => ({
            symbols: TV_TICKER_TAPE_SYMBOLS,
            showSymbolLogo: true,
            isTransparent: false,
            displayMode: "adaptive",
            colorTheme: "dark",
            locale: "pl",
        }),
    },
    {
        // Bez heightPx — jak w źródle, symbol-info sizuje się naturalnie.
        src: `${TV_EMBED_BASE}embed-widget-symbol-info.js`,
        config: symbol => ({ symbol, width: "100%", locale: "pl", colorTheme: "dark", isTransparent: true }),
    },
    {
        src: `${TV_EMBED_BASE}embed-widget-advanced-chart.js`,
        heightPx: 500,
        autosizeFill: true,
        config: symbol => ({
            autosize: true,
            symbol,
            interval: "D",
            timezone: "Etc/UTC",
            theme: "dark",
            style: "1",
            locale: "pl",
            allow_symbol_change: true,
            calendar: false,
            support_host: "https://www.tradingview.com",
        }),
    },
    {
        src: `${TV_EMBED_BASE}embed-widget-symbol-profile.js`,
        heightPx: 390,
        config: symbol => ({ symbol, width: "100%", height: "100%", locale: "pl", colorTheme: "dark", isTransparent: true }),
    },
    {
        src: `${TV_EMBED_BASE}embed-widget-financials.js`,
        heightPx: 490,
        config: symbol => ({ symbol, width: "100%", height: "100%", colorTheme: "dark", isTransparent: true, displayMode: "adaptive", locale: "pl" }),
    },
];

// Dolny wiersz — dwie kolumny obok siebie (patrz .tv-widget-row w style.css).
const TV_PAGE_WIDGETS_ROW = [
    {
        src: `${TV_EMBED_BASE}embed-widget-technical-analysis.js`,
        heightPx: 425,
        config: symbol => ({
            symbol,
            width: "100%",
            height: "100%",
            interval: "15m",
            isTransparent: true,
            showIntervalTabs: true,
            displayMode: "single",
            locale: "pl",
            colorTheme: "dark",
        }),
    },
    {
        src: `${TV_EMBED_BASE}embed-widget-timeline.js`,
        heightPx: 425,
        config: symbol => ({
            feedMode: "symbol",
            symbol,
            width: "100%",
            height: "100%",
            colorTheme: "dark",
            isTransparent: true,
            displayMode: "regular",
            locale: "pl",
        }),
    },
];

// ============================================================
// ZAKŁADKA "⚡ 1 min + VWAP" — na wyraźną prośbę użytkownika, jako pomoc przy
// ręcznym monitorowaniu Opening Range Breakout (ORB) po wybiciu z
// konsolidacji (np. screener Qullamaggie na stronie Sygnały — patrz
// CLAUDE.md/signals.js dla pełnego opisu strategii). Świadomie NIE
// automatyzujemy wykrywania samego ORB: wymagałoby to danych śróddziennych
// (minutowych), których ten pipeline w ogóle nie pobiera (yfinance daily bars,
// tygodniowy cykl odświeżania) — dodanie fetchu 1-minutowych świec byłoby
// osobną, dużo większą zmianą architektury (live/dzienne odświeżanie zamiast
// cotygodniowego). Zamiast tego jeden osadzony widget TradingView Advanced
// Chart na interwale 1 min ze studium VWAP (resetuje się co sesję, jak w
// TradingView) — użytkownik patrzy na zakres z pierwszych minut sesji i sam
// decyduje o wejściu/stop-lossie. Ten sam wzorzec budowy bloku
// (buildTvWidgetBlock) co panel "Dane spółki", tylko jeden widget zamiast
// całej "wizytówki".
// ============================================================
const TV_ORB_WIDGET = {
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

// Ten sam wzorzec przebudowy panelu od zera co renderTvOverviewPanel (osadzony
// widget TradingView nie ma API do podmiany symbolu w locie).
function renderOrbPanel(ticker, universe) {
    const container = document.getElementById("orbContainer");
    const empty = document.getElementById("orbEmpty");
    if (!container) return;
    container.querySelectorAll(".tv-widget-block").forEach(el => el.remove());
    if (!ticker) {
        if (empty) empty.hidden = false;
        return;
    }
    if (empty) empty.hidden = true;
    container.appendChild(buildTvWidgetBlock(TV_ORB_WIDGET, tvSymbolFor(ticker, universe)));
}

function buildTvWidgetBlock(spec, tvSymbol) {
    const block = document.createElement("div");
    block.className = "tv-widget-block";
    if (spec.heightPx) block.style.height = `${spec.heightPx}px`;

    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    if (spec.autosizeFill) {
        // Jak w źródle: kontener na 100%/100%, wewnętrzny div na
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
    script.textContent = JSON.stringify(spec.config(tvSymbol));
    container.appendChild(script);

    block.appendChild(container);
    return block;
}

// Przebudowuje CAŁĄ zawartość panelu TV (nie da się podmienić symbolu w już
// zainicjalizowanym widgecie TradingView) — wołane przy przełączeniu na
// zakładkę "Dane spółki" i przy każdej zmianie wybranego tickera, o ile ta
// zakładka jest akurat aktywna (patrz updateChartArea/state.chartView).
function renderTvOverviewPanel(ticker, universe) {
    const container = document.getElementById("tvOverviewContainer");
    const empty = document.getElementById("tvOverviewEmpty");
    if (!container) return;
    container.querySelectorAll(".tv-widget-block, .tv-widget-row").forEach(el => el.remove());
    if (!ticker) {
        if (empty) empty.hidden = false;
        return;
    }
    if (empty) empty.hidden = true;
    const tvSymbol = tvSymbolFor(ticker, universe);
    TV_PAGE_WIDGETS.forEach(spec => container.appendChild(buildTvWidgetBlock(spec, tvSymbol)));
    const row = document.createElement("div");
    row.className = "tv-widget-row";
    TV_PAGE_WIDGETS_ROW.forEach(spec => row.appendChild(buildTvWidgetBlock(spec, tvSymbol)));
    container.appendChild(row);
}

function initChartViewTabs() {
    const tabOwn = document.getElementById("chartViewTabOwn");
    const tabTv = document.getElementById("chartViewTabTv");
    const tabOrb = document.getElementById("chartViewTabOrb");
    const panelOwn = document.getElementById("chartPanelOwn");
    const panelTv = document.getElementById("chartPanelTv");
    const panelOrb = document.getElementById("chartPanelOrb");
    if (!tabOwn || !tabTv || !panelOwn || !panelTv) return;

    function setView(view) {
        state.chartView = view;
        tabOwn.classList.toggle("active", view === "own");
        tabTv.classList.toggle("active", view === "tv");
        if (tabOrb) tabOrb.classList.toggle("active", view === "orb");
        panelOwn.hidden = view !== "own";
        panelTv.hidden = view !== "tv";
        if (panelOrb) panelOrb.hidden = view !== "orb";
        if (view === "tv") renderTvOverviewPanel(state.selectedTicker, state.selectedUniverse);
        if (view === "orb") renderOrbPanel(state.selectedTicker, state.selectedUniverse);
    }

    tabOwn.addEventListener("click", () => setView("own"));
    tabTv.addEventListener("click", () => setView("tv"));
    if (tabOrb) tabOrb.addEventListener("click", () => setView("orb"));
}

// Mały przycisk-link "TV" do wiersza tabeli — otwiera tradingview.com w nowej
// karcie, bez zaznaczania wiersza (stopPropagation, zeby klik nie odpalal tez
// selectTicker na <tr>).
function tvRowButtonHtml(ticker, universe) {
    return `<button type="button" class="tv-row-btn" data-ticker="${ticker}" data-universe="${universe}" title="Otwórz ${ticker} w TradingView (nowa karta)">TV</button>`;
}

function bindTvRowButtons(container) {
    container.querySelectorAll(".tv-row-btn").forEach(btn => {
        btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            window.open(tvUrlFor(btn.dataset.ticker, btn.dataset.universe), "_blank", "noopener");
        });
    });
}

// ============================================================
// SIDEBAR: kafelek "mówi" bez klikania — pasek u dołu w kolorze etapu
// Weinsteina + kropka w rogu (zielona = RS 52 tyg. > 0, czerwona = < 0).
// Współdzielone przez renderSidebarTiles (app.js) i renderWybiciePanel/
// renderTtmSqueezePanel/renderContinuationPanel (signals.js).
// ============================================================
function decorateTile(tile, stage, rsLong) {
    const color = stage && STAGE_COLORS[stage];
    if (color) tile.style.boxShadow = `inset 0 -3px 0 ${color}`;
    const extra = [];
    if (stage) extra.push(`Etap ${stage}`);
    if (rsLong != null && Number.isFinite(rsLong)) {
        const dot = document.createElement("span");
        dot.className = `tile-rs-dot ${rsLong >= 0 ? "tile-rs-up" : "tile-rs-down"}`;
        tile.appendChild(dot);
        extra.push(`RS 52 tyg. ${rsLong >= 0 ? "+" : ""}${rsLong.toFixed(1)}`);
    }
    if (extra.length) tile.title += ` · ${extra.join(" · ")}`;
}

function latestRsLong(c) {
    const arr = c && c.mansfield_chart && c.mansfield_chart.rsm_long;
    const i = latestNonNullIdx(arr);
    return i >= 0 ? arr[i] : null;
}

// Kazdy ticker z glownego uniwersum (state.data[u].all_constituents — CALE
// uniwersum, nie tylko decyl, patrz FULL_COVERAGE_UNIVERSES/_build_full_universe_records
// w run_query.py; dla uniwersow rownowazonych rowne "constituents") ma wlasny
// weekly_chart/mansfield_chart — wystarczy odczytac go wprost stamtad. Screenery
// Wybicie/TTM Squeeze/Continuation (patrz signals.js) to osobne, wyselekcjonowane
// widoki, nie zrodlo danych do samego wykresu.
function findRsEntry(ticker, universe) {
    const universeData = state.data[universe];
    const list = (universeData && (universeData.all_constituents || universeData.constituents)) || [];
    const universeEntry = list.find(c => c.ticker === ticker);
    return (universeEntry && universeEntry.weekly_chart) ? { ...universeEntry, universe } : null;
}

function selectTicker(ticker, universe) {
    state.selectedTicker = ticker;
    state.selectedUniverse = universe;
    document.querySelectorAll(".ticker-tile").forEach(t => {
        t.classList.toggle("selected", t.dataset.ticker === ticker);
    });
    // Selektor po klasie (nie po konkretnych ID tabel) — dziala identycznie na
    // index.html (momentumTable) i signals.html (wybicie/ttmSqueeze/
    // continuation/winners), ktore maja rozne zestawy tabel o klasie .momentum-table.
    document.querySelectorAll("table.momentum-table tbody tr").forEach(tr => {
        tr.classList.toggle("row-selected", tr.dataset.ticker === ticker);
    });
    state.currentRsEntry = findRsEntry(ticker, universe);
    // Okienko najpierw, render potem — Chart.js mierzy canvas przy tworzeniu,
    // a w ukrytym (display:none) okienku miałby zerowy rozmiar.
    openChartModal();
    updateChartArea();
}

// ============================================================
// OKIENKO Z WYKRESEM (pop-up nad pełnoekranową tabelą) — na prośbę
// użytkownika zamiast wykresu na stałe obok/pod tabelą: klik w spółkę otwiera
// okienko, ✕ / Esc / klik w przyciemnione tło zamyka.
// ============================================================
function openChartModal() {
    const modal = document.getElementById("chartModal");
    if (modal) modal.hidden = false;
}

function closeChartModal() {
    const modal = document.getElementById("chartModal");
    if (!modal || modal.hidden) return;
    // Wykresy niszczymy PRZED ukryciem okienka: ukrycie żywego wykresu
    // planuje w Chart.js resize (ResizeObserver + rAF), a zniszczenie go
    // chwilę później (ponowne otwarcie) rzucało błędy "ownerDocument"/"fullSize".
    destroyChartInstances();
    modal.hidden = true;
}

function initChartModal() {
    const modal = document.getElementById("chartModal");
    if (!modal) return;
    document.getElementById("chartModalClose").addEventListener("click", closeChartModal);
    modal.addEventListener("click", (ev) => { if (ev.target === modal) closeChartModal(); });
    // Rejestrowane PRZED initChartFullscreen: przy włączonym pełnym ekranie
    // wykresu Esc najpierw zamyka tylko pełny ekran (tamten handler), a nie
    // całe okienko.
    document.addEventListener("keydown", (ev) => {
        if (ev.key !== "Escape" || chartFullscreenActive) return;
        const cmdk = document.getElementById("cmdkOverlay");
        if (cmdk && cmdk.style.display !== "none") return;
        closeChartModal();
    });
}

// ============================================================
// OBSZAR WYKRESU: zawsze własny wykres tygodniowy Siły Relatywnej (stage
// analysis — "wykres 10:30" + oscylator Mansfield RS, patrz
// renderRelativeStrengthChart), z jednym przyciskiem "Otwórz w TradingView"
// (#openTvBtn) do pełnej strony tradingview.com w nowej karcie zamiast
// osadzonego widgetu — patrz initOpenTvButton. Gdy dana spółka nie ma
// własnego wykresu (np. za mało historii cen), pokazujemy #noChartMessage
// zamiast pustych paneli — przycisk TV dziala zawsze, niezaleznie od tego.
// Wlasny "silnik" wykresu (renderRelativeStrengthChart i wszystko, co go
// obsluguje — rsChartInstance itd.) zyje teraz w js/chart-render.js,
// wspoldzielonym z chart.html — patrz komentarz na gorze tamtego pliku.
// ============================================================

// Tryb pełnoekranowy wykresu 10:30 (patrz initChartFullscreen) — poza nim
// wolumen/MACD/Squeeze są zawsze widoczne (jak dotychczas); w środku są
// domyślnie schowane i włączane osobno przez #toggleVolumeBtn/#toggleMacdBtn/
// #toggleSqueezeBtn, żeby na wąskim ekranie telefonu dać głównemu wykresowi
// (cena + SMA + bazy Darvasa) jak najwięcej miejsca zamiast trzymać wszystkie
// panele zawsze włączone. Mansfield RS NIE jest już tu wymieniony — ma teraz
// WŁASNY, jeden wspólny przełącznik (#rsMansfieldToggleBtn/
// initMansfieldControls w chart-render.js), działający identycznie w obu
// trybach zamiast osobnej wersji tylko na pełny ekran (patrz komentarz przy
// applyMansfieldPanelVisibility w chart-render.js).
let chartFullscreenActive = false;
const chartFullscreenExtras = { volume: false, macd: false, squeeze: false };

function updateChartArea() {
    const symbol = state.selectedTicker;
    const rsEntry = state.currentRsEntry;
    const hasRsChart = !!(rsEntry && rsEntry.weekly_chart);

    const noChartMsg = document.getElementById("noChartMessage");
    const rsChartPanel = document.getElementById("rsChartPanel");
    const rsVolumePanel = document.getElementById("rsVolumePanel");
    const rsMacdPanel = document.getElementById("rsMacdPanel");
    const rsSqueezePanel = document.getElementById("rsSqueezePanel");
    const stageLegend = document.getElementById("stageLegend");
    if (noChartMsg) noChartMsg.hidden = hasRsChart;
    if (rsChartPanel) rsChartPanel.hidden = !hasRsChart;
    if (rsVolumePanel) rsVolumePanel.hidden = !hasRsChart || (chartFullscreenActive && !chartFullscreenExtras.volume);
    if (rsMacdPanel) rsMacdPanel.hidden = !hasRsChart || (chartFullscreenActive && !chartFullscreenExtras.macd);
    if (rsSqueezePanel) rsSqueezePanel.hidden = !hasRsChart || (chartFullscreenActive && !chartFullscreenExtras.squeeze);
    if (stageLegend) stageLegend.hidden = !hasRsChart;

    if (hasRsChart) {
        renderRelativeStrengthChart(symbol, rsEntry);
    } else {
        renderStageBadge(null);
        destroyChartInstances();
    }
    updateChartTickerLabel();
    if (state.chartView === "tv") renderTvOverviewPanel(symbol, state.selectedUniverse);
    if (state.chartView === "orb") renderOrbPanel(symbol, state.selectedUniverse);
}

// Ticker + uniwersum (+ sektor, gdy znany) wybranej spółki, wyświetlane po
// prawo od przycisków "Otwórz w TradingView" / "Resetuj zoom" — na telefonie
// (PWA) wykres zajmuje cały ekran i bez tego nie widać, na co się patrzy.
function updateChartTickerLabel() {
    const label = document.getElementById("chartTickerLabel");
    if (!label) return;
    const ticker = state.selectedTicker;
    if (!ticker) {
        label.textContent = "";
        return;
    }
    const parts = [ticker];
    const universe = state.selectedUniverse;
    if (universe && UNIVERSE_LABELS[universe]) parts.push(UNIVERSE_LABELS[universe].replace(" Momentum", ""));
    if (state.currentRsEntry && state.currentRsEntry.sector) parts.push(state.currentRsEntry.sector);
    label.textContent = parts.join(" · ");
}

function initOpenTvButton() {
    const btn = document.getElementById("openTvBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
        if (!state.selectedTicker) return;
        window.open(tvUrlFor(state.selectedTicker, state.selectedUniverse), "_blank", "noopener");
    });
}

// resetChartZoom() zyje teraz w js/chart-render.js (wspoldzielona z
// chart.html) — #resetZoomBtn tutaj to dashboardowy przycisk normalnego
// widoku, #fsResetZoomBtn to dodatkowy przycisk w trybie pełnoekranowym
// (patrz initChartFullscreen), ktorego chart.html nie ma.
function initResetZoomButton() {
    const btn = document.getElementById("resetZoomBtn");
    if (btn) btn.addEventListener("click", resetChartZoom);
    const fsBtn = document.getElementById("fsResetZoomBtn");
    if (fsBtn) fsBtn.addEventListener("click", resetChartZoom);
}

// Tryb pełnoekranowy — świadomie CSS-owa nakładka (position: fixed na
// #rs_chart) zamiast prawdziwego Element.requestFullscreen(): w PWA
// uruchomionym z ekranu głównego na iOS ta przeglądarkowa API bywa
// niedostępna/rzuca błędem (apka i tak już działa bez chrome'u przeglądarki),
// więc nakładka position:fixed działa spójnie wszędzie, patrz .chart-fullscreen
// w style.css. Wolumen/MACD/Squeeze są w tym trybie domyślnie schowane (patrz
// updateChartArea) i włączane osobno przez #toggleVolumeBtn/#toggleMacdBtn/
// #toggleSqueezeBtn.
function initChartFullscreen() {
    const container = document.getElementById("rs_chart");
    const enterBtn = document.getElementById("chartFullscreenBtn");
    const closeBtn = document.getElementById("chartFullscreenCloseBtn");
    const extrasBar = document.getElementById("chartFullscreenExtras");
    const volBtn = document.getElementById("toggleVolumeBtn");
    const macdBtn = document.getElementById("toggleMacdBtn");
    const squeezeBtn = document.getElementById("toggleSqueezeBtn");
    if (!container || !enterBtn) return;

    const originalParent = container.parentElement;
    const originalNextSibling = container.nextElementSibling;

    function setFullscreen(active) {
        chartFullscreenActive = active;
        if (active) {
            document.body.appendChild(container);
        } else {
            originalParent.insertBefore(container, originalNextSibling);
        }
        container.classList.toggle("chart-fullscreen", active);
        if (extrasBar) extrasBar.hidden = !active;
        enterBtn.hidden = active;
        updateChartArea();
        // Chart.js ma responsive:true + maintainAspectRatio:false, więc
        // ResizeObserver na canvasie sam łapie zmianę rozmiaru kontenera —
        // to ręczne .resize() to tylko zabezpieczenie na wypadek nierównego
        // timingu tego observera na iOS Safari zaraz po przeniesieniu węzła.
        window.requestAnimationFrame(() => {
            if (rsChartInstance) rsChartInstance.resize();
            if (rsVolumeChartInstance) rsVolumeChartInstance.resize();
            if (rsMacdChartInstance) rsMacdChartInstance.resize();
            if (rsSqueezeChartInstance) rsSqueezeChartInstance.resize();
            if (rsMansfieldChartInstance) rsMansfieldChartInstance.resize();
        });
    }

    enterBtn.addEventListener("click", () => setFullscreen(true));
    if (closeBtn) closeBtn.addEventListener("click", () => setFullscreen(false));
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && chartFullscreenActive) setFullscreen(false);
    });
    if (volBtn) {
        volBtn.addEventListener("click", () => {
            chartFullscreenExtras.volume = !chartFullscreenExtras.volume;
            volBtn.classList.toggle("active", chartFullscreenExtras.volume);
            updateChartArea();
        });
    }
    if (macdBtn) {
        macdBtn.addEventListener("click", () => {
            chartFullscreenExtras.macd = !chartFullscreenExtras.macd;
            macdBtn.classList.toggle("active", chartFullscreenExtras.macd);
            updateChartArea();
        });
    }
    if (squeezeBtn) {
        squeezeBtn.addEventListener("click", () => {
            chartFullscreenExtras.squeeze = !chartFullscreenExtras.squeeze;
            squeezeBtn.classList.toggle("active", chartFullscreenExtras.squeeze);
            updateChartArea();
        });
    }
}

// Eksport wyłącznie dla test runnera Node (tests/js/chart-modal.test.js) —
// nie ładowany i bez efektu w przeglądarce (module tam nie istnieje). Tylko
// findRsEntry jest tu naprawdę "czyste" (poza DOM) — testy same ustawiają
// globalny `state` przed wywołaniem, tak jak strona (app.js/signals.js) robi
// to przy starcie.
if (typeof module !== "undefined" && module.exports) {
    module.exports = { findRsEntry };
}
