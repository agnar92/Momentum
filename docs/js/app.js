
// UNIVERSES/UNIVERSE_LABELS/PLN_UNIVERSES/formatPrice/tvSymbolFor/tvUrlFor/
// STAGE_LABELS/STAGE_COLORS/stageCellHtml/compareRows żyją teraz w
// js/shared.js, współdzielonym przez index.html/rebalance.html/chart.html
// (patrz komentarz na górze tamtego pliku) — index.html musi ładować
// js/shared.js PRZED tym plikiem. initConnStatus/hideLoadingOverlay/
// showToast żyją analogicznie w js/qol.js (patrz komentarz na górze tamtego
// pliku), ładowanym tuż po shared.js. Node (tests/js/) nie ładuje <script>
// tagów, więc odtwarzamy to samo współdzielenie globali ręcznie tylko tam.
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./qol.js"));
}

// Uniwersa z WŁASNĄ zakładką/tabelą momentum w dashboardzie (sidebar + drawer).
// SP500/NASDAQ100 były stąd kiedyś usunięte (ekran RSM je i tak obejmował), ale
// wróciły na życzenie użytkownika jako pełne replikacje indeksów momentum —
// SP500 to replikacja S&P 500 Momentum Index (ETF SPMO), NASDAQ100 analogicznie
// Nasdaq 100 Momentum. Tabela pokazuje `constituents` (selekcja top-kwintyla z
// wagami z compute_weights), nie `all_constituents`.
const SIDEBAR_TAB_UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES", "WIG20", "MWIG40", "SWIG80"];

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
    const panelOwn = document.getElementById("chartPanelOwn");
    const panelTv = document.getElementById("chartPanelTv");
    if (!tabOwn || !tabTv || !panelOwn || !panelTv) return;

    function setView(view) {
        state.chartView = view;
        tabOwn.classList.toggle("active", view === "own");
        tabTv.classList.toggle("active", view === "tv");
        panelOwn.hidden = view !== "own";
        panelTv.hidden = view !== "tv";
        if (view === "tv") renderTvOverviewPanel(state.selectedTicker, state.selectedUniverse);
    }

    tabOwn.addEventListener("click", () => setView("own"));
    tabTv.addEventListener("click", () => setView("tv"));
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

// Domyślne suwaki screenera Wybicie (patrz opis nad classifyWybicie).
const WYBICIE_DEFAULT_WINDOW_WEEKS = 6;
const WYBICIE_DEFAULT_MONITOR_WEEKS = 6;
const WYBICIE_SETTINGS_KEY = "momentum_dashboard_wybicie";

// Domyślne suwaki screenera Continuation (patrz opis nad classifyContinuation).
const CONTINUATION_DEFAULT_MAX_SQUEEZE_DAYS = 30;
const CONTINUATION_DEFAULT_FIRE_LOOKBACK_DAYS = 5;
const CONTINUATION_DEFAULT_MIN_MOMENTUM_PCT = 20;
const CONTINUATION_SETTINGS_KEY = "momentum_dashboard_continuation";

const state = {
    data: {},
    selectedTicker: null,
    selectedUniverse: null,
    currentRsEntry: null,
    drawerOpen: false,
    drawerUniverse: "SP500",
    chartView: "own",
    stageFilter: "ALL",
    sortKey: "rank",
    sortDir: "asc",
    wybicieWindowWeeks: WYBICIE_DEFAULT_WINDOW_WEEKS,
    wybicieMonitorWeeks: WYBICIE_DEFAULT_MONITOR_WEEKS,
    contMaxSqueezeDays: CONTINUATION_DEFAULT_MAX_SQUEEZE_DAYS,
    contFireLookbackDays: CONTINUATION_DEFAULT_FIRE_LOOKBACK_DAYS,
    contMinMomentumPct: CONTINUATION_DEFAULT_MIN_MOMENTUM_PCT,
};

async function loadData() {
    for (const u of UNIVERSES) {
        try {
            const res = await fetch(`data/${u.toLowerCase()}.json`, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            state.data[u] = await res.json();
        } catch (e) {
            console.error(`Nie udało się wczytać danych dla ${u}:`, e);
            state.data[u] = { universe: u, ref_date: null, n_constituents: 0, constituents: [] };
        }
    }
    // docs/data/global_equity_momentum.json i docs/data/relative_strength.json NIE
    // są już tu wczytywane — GEM przestał być czymś do oglądania na dashboardzie
    // (przeniesiony jako silnik wyboru do rebalance.js, patrz CLAUDE.md), a panel
    // Wybicie/TTM Squeeze poniżej budują się bezpośrednio z wykresów
    // dołączonych do KAŻDEGO constituenta w state.data (patrz process_universe/
    // export_json w run_query.py), więc nie potrzebują osobnego leaderboardu.
}

// ============================================================
// WYBICIE — SCREENER (zastąpił dawne zakładki "RSM Stabilne"/"RSM Wzrostowe",
// na wyraźną prośbę użytkownika): spółki, u których JEDNOCZEŚNIE
//   1. tygodniowy MACD (macd_chart.macd, patrz compute_macd_chart w
//      run_query.py) przeciął linię zera W GÓRĘ,
//   2. linia RS 52 tyg. z panelu TTM Squeeze (mansfield_chart.rsm_long — ta
//      sama, którą rysuje renderRelativeStrengthChart na panelu TTM Squeeze)
//      przecięła linię zera W GÓRĘ,
//   3. histogram TTM Squeeze (ttm_squeeze_chart.histogram) jest dodatni.
// "Przeciął" = wartość jest TERAZ > 0, a wcześniej była <= 0 — liczymy, ile
// tygodni temu nastąpiło OSTATNIE takie przecięcie (weeksSinceZeroCrossUp).
// Dwa parametry, każdy z własnym suwakiem nad tabelą (#wybicieControls):
//   - OKNO WYBICIA (state.wybicieWindowWeeks): maks. odstęp w tygodniach między
//     przecięciem MACD a przecięciem RS 52 tyg. — oba sygnały muszą przyjść
//     blisko siebie, żeby liczyć się jako jedno wybicie (0 = ten sam tydzień).
//   - MONITOROWANIE PO WYBICIU (state.wybicieMonitorWeeks): przez ile tygodni
//     po wybiciu (= późniejszym z dwóch przecięć, bo dopiero wtedy oba warunki
//     są spełnione) spółka zostaje na liście — pod warunkiem, że MACD, RS 52
//     tyg. i histogram TTM wciąż są nad zerem (spadek któregokolwiek pod zero
//     zdejmuje ją z listy od razu).
// Każdy wskaźnik ma własną tablicę dat, więc "teraz" to ostatni tydzień z
// NIE-null wartością w danej serii (ten sam caveat co w classifyTtmSqueeze —
// najnowszy tydzień bywa null).
// ============================================================
// WYBICIE_DEFAULT_* / WYBICIE_SETTINGS_KEY — zadeklarowane nad `state` (potrzebne tam jako wartości startowe).

function latestNonNullIdx(arr) {
    if (!arr) return -1;
    let i = arr.length - 1;
    while (i >= 0 && arr[i] == null) i--;
    return i;
}

// Ile tygodni temu seria przecięła zero w górę (1 = w ostatnim tygodniu), albo
// null, gdy teraz nie jest > 0 albo w oknie lookbacku (domyślnie cała seria)
// ani razu nie była <= 0.
function weeksSinceZeroCrossUp(arr, lookback = Infinity) {
    const nowIdx = latestNonNullIdx(arr);
    if (nowIdx < 0 || !(arr[nowIdx] > 0)) return null;
    for (let k = 1; k <= lookback; k++) {
        const j = nowIdx - k;
        if (j < 0) return null;
        if (arr[j] != null && arr[j] <= 0) return k;
    }
    return null;
}

// Zwraca null, gdy spółka nie spełnia wszystkich warunków (albo brakuje
// danych) — celowo wyselekcjonowany screener, nie pełna lista.
function classifyWybicie(ticker, universe, c, opts = {}) {
    const windowWeeks = opts.windowWeeks ?? state.wybicieWindowWeeks;
    const monitorWeeks = opts.monitorWeeks ?? state.wybicieMonitorWeeks;
    const macd = c.macd_chart && c.macd_chart.macd;
    const rsLong = c.mansfield_chart && c.mansfield_chart.rsm_long;
    const hist = c.ttm_squeeze_chart && c.ttm_squeeze_chart.histogram;
    if (!macd || !rsLong || !hist) return null;

    const macdCrossWeeks = weeksSinceZeroCrossUp(macd);
    if (macdCrossWeeks == null) return null;
    const rsCrossWeeks = weeksSinceZeroCrossUp(rsLong);
    if (rsCrossWeeks == null) return null;
    if (Math.abs(macdCrossWeeks - rsCrossWeeks) > windowWeeks) return null;
    const breakoutWeeks = Math.min(macdCrossWeeks, rsCrossWeeks);
    if (breakoutWeeks > monitorWeeks) return null;
    const histIdx = latestNonNullIdx(hist);
    if (histIdx < 0 || !(hist[histIdx] > 0)) return null;

    return {
        ticker, universe, sector: c.sector, price: c.price,
        momentum_pct: c.momentum_pct,
        current_stage: c.weekly_chart && c.weekly_chart.current_stage,
        macdNow: macd[latestNonNullIdx(macd)],
        macdCrossWeeks,
        rsLongNow: rsLong[latestNonNullIdx(rsLong)],
        rsCrossWeeks,
        breakoutWeeks,
        histNow: hist[histIdx],
    };
}

// Lista połączona ze WSZYSTKICH uniwersów (all_constituents — całe uniwersa,
// nie tylko bieżący top-decyl), bez duplikatów: spółka obecna w dwóch
// uniwersach naraz (np. SP500 i NASDAQ100) pojawia się raz, z pierwszego
// uniwersum w kolejności UNIVERSES. Sortowanie: najświeższe wybicie na górze,
// potem mocniejszy histogram.
function combinedWybicieCandidates(opts = {}) {
    const rows = [];
    const seen = new Set();
    UNIVERSES.forEach(u => {
        const universeData = state.data[u] || {};
        (universeData.all_constituents || universeData.constituents || []).forEach(c => {
            if (seen.has(c.ticker)) return;
            const r = classifyWybicie(c.ticker, u, c, opts);
            if (!r) return;
            seen.add(c.ticker);
            rows.push(r);
        });
    });
    rows.sort((a, b) => (a.breakoutWeeks - b.breakoutWeeks) || (b.histNow - a.histNow));
    return rows;
}

// ============================================================
// TTM SQUEEZE — SCREENER: szuka spółek z Momentum (momentum_score > 0),
// które przeszły przez WIELOTYGODNIOWĄ konsolidację (Bollinger Bands ściśnięte
// wewnątrz kanału Kellera — "squeeze", patrz compute_ttm_squeeze_chart w
// run_query.py) i albo WCIĄŻ w niej trwają dłużej niż TTM_SQUEEZE_MIN_
// CONSOLIDATION_WEEKS tygodni (status "consolidating" — kandydat do
// obserwacji), albo WŁAŚNIE z takiej konsolidacji wybiły się w ostatnich
// TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS tygodniach (status "fired" — świeży
// początek nowego ruchu, dokładnie to, o co prosił użytkownik: "akcje, które
// zaczynają ruszać po takiej konsolidacji"). Stałe MUSZĄ być zsynchronizowane
// z tymi samymi stałymi w run_query.py.
// ============================================================
const TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS = 5;
const TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS = 3;

// Klasyfikuje jedną spółkę na podstawie jej ttm_squeeze_chart. Zwraca null gdy
// brakuje danych, gdy spółka akurat nie ma Momentum (momentum_score <= 0), albo
// gdy nie pasuje do żadnego z dwóch statusów (squeeze trwający zbyt krótko,
// dawno wygasłe wybicie itd.) — celowo wyselekcjonowany screener, nie pełna
// lista wszystkich spółek.
function classifyTtmSqueeze(ticker, universe, c) {
    if (!(c.momentum_score > 0)) return null;
    const t = c.ttm_squeeze_chart;
    if (!t || !t.dates || t.dates.length === 0) return null;
    // Ostatni element bywa jeszcze niedomknięty (aktualny tydzień bywa null,
    // zanim run_query.py doliczy pełne dane) — cofamy się do ostatniego tygodnia, który faktycznie ma
    // policzony squeeze_on.
    let nowIdx = t.dates.length - 1;
    while (nowIdx >= 0 && t.squeeze_on[nowIdx] == null) nowIdx--;
    if (nowIdx < 0) return null;

    const squeezeOn = t.squeeze_on[nowIdx];
    const squeezeCount = t.squeeze_count[nowIdx];
    const weeksSinceFire = t.weeks_since_fire[nowIdx];
    const fireConsolidationWeeks = t.fire_consolidation_weeks[nowIdx];
    const histNow = t.histogram[nowIdx];

    const isConsolidating = squeezeOn === true && squeezeCount > TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS;
    const isFired = weeksSinceFire != null && weeksSinceFire <= TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS
        && fireConsolidationWeeks != null && fireConsolidationWeeks > TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS;
    if (!isConsolidating && !isFired) return null;

    return {
        ticker, universe, sector: c.sector, price: c.price,
        momentum_pct: c.momentum_pct,
        current_stage: c.weekly_chart && c.weekly_chart.current_stage,
        status: isFired ? "fired" : "consolidating",
        consolidation_weeks: isFired ? fireConsolidationWeeks : squeezeCount,
        weeks_since_fire: isFired ? weeksSinceFire : null,
        histNow,
    };
}

// Zwraca listę połączoną ze WSZYSTKICH 6 uniwersów (patrz combinedWybicieCandidates
// powyżej — ten sam wzorzec: całe kwalifikujące się uniwersa, nie tylko
// bieżący top-decyl dla SP500/NASDAQ100), posortowaną: najpierw świeże
// wybicia (najnowsze na górze), potem trwające konsolidacje (najdłuższe na
// górze — najbardziej "ściśnięte").
function combinedTtmSqueezeCandidates() {
    const rows = [];
    UNIVERSES.forEach(u => {
        const universeData = state.data[u] || {};
        (universeData.all_constituents || universeData.constituents || []).forEach(c => {
            const r = classifyTtmSqueeze(c.ticker, u, c);
            if (r) rows.push(r);
        });
    });
    rows.sort((a, b) => {
        if (a.status !== b.status) return a.status === "fired" ? -1 : 1;
        if (a.status === "fired") return a.weeks_since_fire - b.weeks_since_fire;
        return b.consolidation_weeks - a.consolidation_weeks;
    });
    return rows;
}

// ============================================================
// CONTINUATION — SCREENER (na wyraźną prośbę użytkownika): spółka JUŻ jest
// w dynamicznym Etapie 2 na wykresie TYGODNIOWYM, a na wykresie DZIENNYM
// robi krótką pauzę (TTM Squeeze na D1) — moment "dołączenia do trendu"
// z celem ~10-20%. Tylko filtr sygnałów: wejście/wyjście użytkownik
// decyduje sam.
// Trend (tydzień): current_stage 2A/2B, momentum_score > 0, momentum 12M-1M
//   >= suwak "Min. momentum", RS 26 tyg. (mansfield_chart.rsm_medium) > 0
//   (silniejsza od swojego indeksu), cena nad dzienną SMA50.
// Setup (dzień, daily_squeeze z run_query.py::compute_daily_squeeze):
//   - "squeeze" 🌀 — squeeze trwa od CONTINUATION_MIN_SQUEEZE_DAYS do suwaka
//     "Maks. squeeze" sesji (krótka konsolidacja w trendzie, nie długa baza),
//   - "fired" 🔥 — squeeze odpalił w ostatnich "Wybicie w ciągu" sesjach po
//     konsolidacji od CONTINUATION_MIN_SQUEEZE_DAYS do "Maks. squeeze" sesji
//     (ten sam limit — chodzi o KRÓTKĄ pauzę), a histogram D1 jest
//     dodatni (wybicie w GÓRĘ, nie w dół).
// ============================================================
const CONTINUATION_MIN_SQUEEZE_DAYS = 3;

function classifyContinuation(ticker, universe, c, opts = {}) {
    const maxSqueezeDays = opts.maxSqueezeDays ?? state.contMaxSqueezeDays;
    const fireLookbackDays = opts.fireLookbackDays ?? state.contFireLookbackDays;
    const minMomentumPct = opts.minMomentumPct ?? state.contMinMomentumPct;

    const stage = c.weekly_chart && c.weekly_chart.current_stage;
    if (stage !== "2A" && stage !== "2B") return null;
    if (!(c.momentum_score > 0) || !(c.momentum_pct >= minMomentumPct)) return null;
    const rsMed = c.mansfield_chart && c.mansfield_chart.rsm_medium;
    const rsIdx = latestNonNullIdx(rsMed);
    if (rsIdx < 0 || !(rsMed[rsIdx] > 0)) return null;
    const d = c.daily_squeeze;
    if (!d || !(d.sma50_pct > 0)) return null;

    let status = null;
    if (d.squeeze_on && d.squeeze_days >= CONTINUATION_MIN_SQUEEZE_DAYS && d.squeeze_days <= maxSqueezeDays) {
        status = "squeeze";
    } else if (!d.squeeze_on && d.days_since_fire != null && d.days_since_fire <= fireLookbackDays
        && d.fire_consolidation_days != null && d.fire_consolidation_days >= CONTINUATION_MIN_SQUEEZE_DAYS
        && d.fire_consolidation_days <= maxSqueezeDays && d.histogram > 0) {
        status = "fired";
    }
    if (!status) return null;

    return {
        ticker, universe, sector: c.sector, price: c.price,
        momentum_pct: c.momentum_pct,
        current_stage: stage,
        rs_medium: rsMed[rsIdx],
        status,
        squeeze_days: status === "squeeze" ? d.squeeze_days : d.fire_consolidation_days,
        days_since_fire: status === "fired" ? d.days_since_fire : null,
        histogram: d.histogram,
        histogram_rising: d.histogram_prev != null && d.histogram > d.histogram_prev,
        recent_squeeze: d.recent_squeeze || [],
        sma50_pct: d.sma50_pct,
        high_20d_pct: d.high_20d_pct,
        return_1m_pct: d.return_1m_pct,
    };
}

// Wszystkie uniwersa, bez duplikatów (pierwsze wystąpienie w kolejności
// UNIVERSES wygrywa — jak combinedWybicieCandidates). Kolejność: świeże
// wybicia z D1 squeeze'a (najnowsze na górze), potem trwające squeeze'y
// (najmocniejsze momentum 12M na górze).
function combinedContinuationCandidates(opts = {}) {
    const rows = [];
    const seen = new Set();
    UNIVERSES.forEach(u => {
        const universeData = state.data[u] || {};
        (universeData.all_constituents || universeData.constituents || []).forEach(c => {
            if (seen.has(c.ticker)) return;
            const r = classifyContinuation(c.ticker, u, c, opts);
            if (r) { rows.push(r); seen.add(c.ticker); }
        });
    });
    rows.sort((a, b) => {
        if (a.status !== b.status) return a.status === "fired" ? -1 : 1;
        if (a.status === "fired" && a.days_since_fire !== b.days_since_fire) return a.days_since_fire - b.days_since_fire;
        return b.momentum_pct - a.momentum_pct;
    });
    return rows;
}

// ============================================================
// SIDEBAR (kwadraty z top 10 tickerów na indeks)
// ============================================================
function renderSidebarTiles() {
    SIDEBAR_TAB_UNIVERSES.forEach(u => {
        const container = document.getElementById(`tiles-${u}`);
        container.innerHTML = "";
        const top10 = (state.data[u].constituents || []).slice(0, 10);
        top10.forEach(c => {
            const tile = document.createElement("div");
            tile.className = "ticker-tile";
            tile.textContent = c.ticker;
            tile.title = `${c.ticker} — ${UNIVERSE_LABELS[u]} #${c.rank} · waga ${c.weight_pct.toFixed(2)}%`;
            tile.dataset.ticker = c.ticker;
            tile.dataset.universe = u;
            if (c.ticker === state.selectedTicker) tile.classList.add("selected");
            tile.addEventListener("click", () => selectTicker(c.ticker, u));
            container.appendChild(tile);
        });
        if (top10.length === 0) {
            const empty = document.createElement("div");
            empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
            empty.textContent = "brak danych";
            container.appendChild(empty);
        }
    });
}

// Sidebar: kafelki screenera Wybicie (patrz combinedWybicieCandidates powyżej).
function renderWybiciePanel() {
    const container = document.getElementById("tiles-WYBICIE");
    if (!container) return;

    const rows = combinedWybicieCandidates();
    const meta = document.getElementById("wybicieMeta");
    if (meta) meta.textContent = `${rows.length} spółek`;

    container.innerHTML = "";
    rows.forEach(r => {
        const tile = document.createElement("div");
        tile.className = "ticker-tile";
        tile.textContent = r.ticker;
        tile.title = `${r.ticker} — ${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")} · `
            + `wybicie ${r.breakoutWeeks} tyg. temu · MACD > 0 od ${r.macdCrossWeeks} tyg. · RS 52 tyg. > 0 od ${r.rsCrossWeeks} tyg. · histogram TTM ${r.histNow.toFixed(2)}`;
        tile.dataset.ticker = r.ticker;
        tile.dataset.universe = r.universe;
        if (r.ticker === state.selectedTicker) tile.classList.add("selected");
        tile.addEventListener("click", () => selectTicker(r.ticker, r.universe));
        container.appendChild(tile);
    });
    if (rows.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
        empty.textContent = "brak danych";
        container.appendChild(empty);
    }
}

// Sidebar: kafelki screenera TTM Squeeze (patrz combinedTtmSqueezeCandidates
// powyżej) — ten sam wzorzec co renderWybiciePanel, jedna wspólna, już posortowana
// lista (świeże wybicia przed trwającymi konsolidacjami).
function renderTtmSqueezePanel() {
    const container = document.getElementById("tiles-TTM-squeeze");
    if (!container) return;

    const rows = combinedTtmSqueezeCandidates();
    const meta = document.getElementById("ttmSqueezeMeta");
    if (meta) meta.textContent = `${rows.length} spółek`;

    container.innerHTML = "";
    rows.forEach(r => {
        const tile = document.createElement("div");
        tile.className = "ticker-tile";
        tile.textContent = r.ticker;
        tile.title = r.status === "fired"
            ? `${r.ticker} — ${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")} · `
                + `wybicie ${r.weeks_since_fire} tyg. temu, po ${r.consolidation_weeks} tyg. konsolidacji`
            : `${r.ticker} — ${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")} · `
                + `w konsolidacji od ${r.consolidation_weeks} tyg.`;
        tile.dataset.ticker = r.ticker;
        tile.dataset.universe = r.universe;
        if (r.ticker === state.selectedTicker) tile.classList.add("selected");
        tile.addEventListener("click", () => selectTicker(r.ticker, r.universe));
        container.appendChild(tile);
    });
    if (rows.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
        empty.textContent = "brak danych";
        container.appendChild(empty);
    }
}

// Sidebar: kafelki screenera Continuation (patrz combinedContinuationCandidates).
function renderContinuationPanel() {
    const container = document.getElementById("tiles-CONTINUATION");
    if (!container) return;

    const rows = combinedContinuationCandidates();
    const meta = document.getElementById("continuationMeta");
    if (meta) meta.textContent = `${rows.length} spółek`;

    container.innerHTML = "";
    rows.forEach(r => {
        const tile = document.createElement("div");
        tile.className = "ticker-tile";
        tile.textContent = r.ticker;
        tile.title = `${r.ticker} — ${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")} · Etap ${r.current_stage} · `
            + (r.status === "fired"
                ? `D1 squeeze odpalił ${r.days_since_fire} sesji temu (po ${r.squeeze_days} sesjach)`
                : `D1 squeeze od ${r.squeeze_days} sesji`);
        tile.dataset.ticker = r.ticker;
        tile.dataset.universe = r.universe;
        if (r.ticker === state.selectedTicker) tile.classList.add("selected");
        tile.addEventListener("click", () => selectTicker(r.ticker, r.universe));
        container.appendChild(tile);
    });
    if (rows.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
        empty.textContent = "brak danych";
        container.appendChild(empty);
    }
}

// Kazdy ticker z glownego uniwersum (state.data[u].all_constituents — CALE
// uniwersum, nie tylko decyl, patrz FULL_COVERAGE_UNIVERSES/_build_full_universe_records
// w run_query.py; dla uniwersow rownowazonych rowne "constituents") ma wlasny
// weekly_chart/mansfield_chart — wystarczy odczytac go wprost stamtad. Screenery
// Wybicie/TTM Squeeze (powyzej) to osobne, wyselekcjonowane widoki, nie zrodlo
// danych do samego wykresu.
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
    document.querySelectorAll("#momentumTableBody tr, #wybicieTableBody tr, #ttmSqueezeTableBody tr, #continuationTableBody tr").forEach(tr => {
        tr.classList.toggle("row-selected", tr.dataset.ticker === ticker);
    });
    state.currentRsEntry = findRsEntry(ticker, universe);
    updateChartArea();
    // Na telefonie nie ma miejsca na tabelę i wykres naraz — wybranie spółki
    // przełącza widok na pełnoekranowy wykres (jak w apce TradingView).
    if (window.matchMedia("(max-width: 640px)").matches) {
        document.querySelector(".workspace").classList.add("mobile-chart-view");
    }
}

// Przełącza zakładkę drawer na uniwersum danego tickera (żeby podświetlenie
// w tabeli/kafelkach było spójne) i pokazuje jego wykres. Gdy uniwersum nie ma
// własnej zakładki (patrz SIDEBAR_TAB_UNIVERSES), wynik wyszukiwania Ctrl+K
// tylko aktualizuje wybór/wykres, bez przełączania drawera na nieistniejącą
// zakładkę.
function jumpToTicker(ticker, universe) {
    const hasTab = !!document.querySelector(`.drawer-tab[data-universe="${universe}"]`);
    document.querySelectorAll(".drawer-tab").forEach(t => t.classList.toggle("active", t.dataset.universe === universe));
    if (hasTab) {
        state.drawerUniverse = universe;
        showDrawerTable(universe);
    }
    selectTicker(ticker, universe);
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
// #toggleSqueezeBtn. Mansfield RS ma tu już WŁASNY przycisk
// (#rsMansfieldToggleBtn tuż nad jego panelem, patrz initMansfieldControls w
// chart-render.js) — działa tak samo w obu trybach, więc nie jest częścią tego
// paska.
//
// #rs_chart normalnie siedzi wewnątrz .chart-panel/.charts-area, oba z
// "overflow: hidden" — a to CZYŚCI (przycina) każdego potomka, NAWET z
// position:fixed, do granic tego przodka (to nie jest kwestia pozycjonowania,
// tylko malowania). Samo position:fixed + z-index NIE wystarczyłoby więc do
// prawdziwego pełnego ekranu — dlatego kontener jest tu fizycznie
// przenoszony do document.body na czas trybu pełnoekranowego (i wracany na
// dokładnie to samo miejsce przy wyjściu) zamiast polegać na przycinaniu się
// przodków. Przenoszenie węzła <canvas> w DOM nie czyści jego zawartości ani
// nie niszczy instancji Chart.js podpiętej do niego.
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

// STAGE_LABELS/STAGE_DESCRIPTIONS/STAGE_COLORS/STAGE_BREAKOUT_VOLUME_RATIO/
// BASE_BOX_COLORS/stageCellHtml (klasyfikacja etapow Weinsteina dolaczona
// przez run_query.py do kazdego tygodnia wykresu 10:30) zyja teraz w
// js/shared.js, wspoldzielonym przez index.html/rebalance.html/chart.html —
// patrz komentarz na gorze tamtego pliku.

// Filtr etapow nad glowna tabela (#stageFilterBar) — "2" obejmuje zarowno 2A
// jak i 2B (uzytkownik mysli o "Etapie 2" jako calosci, nie osobno o
// swiezym wybiciu vs kontynuacji), reszta to dokladne dopasowanie.
function matchesStageFilter(stage) {
    if (state.stageFilter === "ALL") return true;
    if (!stage) return false;
    if (state.stageFilter === "2") return stage === "2A" || stage === "2B";
    return stage === state.stageFilter;
}

function initStageFilter() {
    const bar = document.getElementById("stageFilterBar");
    if (!bar) return;
    bar.querySelectorAll(".stage-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            state.stageFilter = btn.dataset.stage;
            bar.querySelectorAll(".stage-filter-btn").forEach(b => b.classList.toggle("active", b === btn));
            renderActiveDrawerTable();
        });
    });
}

// renderStageBadge/rollingMean/alignMansfieldToDates/alignSqueezeToDates/
// alignMacdToDates/fmtPlDate/syncChartsCrosshair/renderRelativeStrengthChart/
// applyMansfieldPanelVisibility/initMansfieldControls zyja teraz w
// js/chart-render.js, wspoldzielonym z chart.html — patrz komentarz na gorze
// tamtego pliku. updateChartArea() (nizej, w sekcji OBSZAR WYKRESU) woła
// renderRelativeStrengthChart(symbol, rsEntry) i destroyChartInstances() jak
// dotychczas.

// ============================================================
// SZUFLADA TABEL (>>> rozwiń / <<< zwiń)
// ============================================================
function initDrawer() {
    const toggleBtn = document.getElementById("toggleDrawerBtn");
    const drawer = document.getElementById("tableDrawer");

    toggleBtn.addEventListener("click", () => {
        state.drawerOpen = !state.drawerOpen;
        drawer.classList.toggle("open", state.drawerOpen);
        toggleBtn.textContent = state.drawerOpen ? "<<<" : ">>>";
    });

    // Kliknięcie gdziekolwiek poza rozwiniętą szufladą (np. w obszar wykresu)
    // ją zwija — tak jak zwykle zachowują się nakładane panele w nowoczesnych
    // aplikacjach. Sam przycisk >>>/<<< ma już własną obsługę kliknięcia
    // powyżej, więc jest tu wykluczony, żeby nie zwijać i od razu rozwijać.
    document.addEventListener("click", (ev) => {
        if (!state.drawerOpen) return;
        if (drawer.contains(ev.target) || toggleBtn.contains(ev.target)) return;
        state.drawerOpen = false;
        drawer.classList.remove("open");
        toggleBtn.textContent = ">>>";
    });

    document.querySelectorAll(".drawer-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".drawer-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            state.drawerUniverse = tab.dataset.universe;
            showDrawerTable(state.drawerUniverse);
        });
    });

    document.querySelectorAll("table.momentum-table thead th").forEach(th => {
        th.addEventListener("click", () => {
            const key = th.dataset.key;
            if (!key) return; // kolumny bez sortowania (Etap, TV)
            if (state.sortKey === key) {
                state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
            } else {
                state.sortKey = key;
                state.sortDir = "asc";
            }
            updateSortHeaderClasses();
            renderActiveDrawerTable();
        });
    });
}

function updateSortHeaderClasses() {
    document.querySelectorAll("table.momentum-table thead th").forEach(th => {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.dataset.key === state.sortKey) {
            th.classList.add(state.sortDir === "asc" ? "sort-asc" : "sort-desc");
        }
    });
}

// compareRows (komparator wierszy tabeli, uzywany tu i przez
// renderPickerTable w rebalance.js) zyje teraz w js/shared.js.

// Przełącza, która tabela w drawerze jest widoczna (pełna tabela uniwersum,
// tabela screenera Wybicie — patrz renderWybicieTable — albo tabela screenera
// TTM Squeeze, patrz renderTtmSqueezeTable) i renderuje jej zawartość. Na
// telefonie sidebar z kafelkami jest ukryty (patrz CSS @media max-width:640px),
// więc to jedyny sposób dotarcia do tych zakładek w pionie.
function showDrawerTable(universe) {
    const isWybicie = universe === "WYBICIE";
    const isTtmSqueeze = universe === "TTM_SQUEEZE";
    const isContinuation = universe === "CONTINUATION";
    document.getElementById("momentumTable").hidden = isWybicie || isTtmSqueeze || isContinuation;
    document.getElementById("wybicieTable").hidden = !isWybicie;
    const wybicieControls = document.getElementById("wybicieControls");
    if (wybicieControls) wybicieControls.hidden = !isWybicie;
    document.getElementById("ttmSqueezeTable").hidden = !isTtmSqueeze;
    document.getElementById("continuationTable").hidden = !isContinuation;
    const continuationControls = document.getElementById("continuationControls");
    if (continuationControls) continuationControls.hidden = !isContinuation;
    // Screenery obejmuja CALE uniwersa i kazda spolka niesie wlasny
    // current_stage — filtr etapow ma tu wiec sens tak samo jak w pelnej
    // tabeli uniwersum.
    const stageFilterBar = document.getElementById("stageFilterBar");
    if (stageFilterBar) stageFilterBar.hidden = false;
    document.getElementById("drawerTitle").textContent = isWybicie
        ? "Pełna tabela — Wybicie"
        : isTtmSqueeze
            ? "Pełna tabela — TTM Squeeze"
            : isContinuation
                ? "Continuation — Etap 2 + krótki squeeze D1"
                : `Pełna tabela — ${UNIVERSE_LABELS[universe]}`;
    renderActiveDrawerTable();
}

// Dispatcher wywolywany zarowno po przelaczeniu zakladki (showDrawerTable) jak
// i po zmianie filtra etapu (initStageFilter) i po sortowaniu naglowka
// (initDrawer) — zeby zmiana filtra/sortowania odswiezala WLASNIE aktywna
// tabele, a nie zawsze renderTable().
function renderActiveDrawerTable() {
    if (state.drawerUniverse === "WYBICIE") renderWybicieTable();
    else if (state.drawerUniverse === "TTM_SQUEEZE") renderTtmSqueezeTable();
    else if (state.drawerUniverse === "CONTINUATION") renderContinuationTable();
    else renderTable();
}

function crossWeeksHtml(weeks) {
    return weeks === 1 ? "w ost. tyg." : `${weeks} tyg. temu`;
}

function wybicieRowHtml(r, position) {
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${r.ticker}</td>
        <td>${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")}</td>
        <td>${r.sector || ""}</td>
        <td>${formatPrice(r.price, r.universe)}</td>
        <td>${crossWeeksHtml(r.breakoutWeeks)}</td>
        <td class="positive" title="MACD przeciął zero w górę ${crossWeeksHtml(r.macdCrossWeeks)}">${r.macdNow.toFixed(2)} <span class="cross-age">(${crossWeeksHtml(r.macdCrossWeeks)})</span></td>
        <td class="positive" title="RS 52 tyg. przeciął zero w górę ${crossWeeksHtml(r.rsCrossWeeks)}">${r.rsLongNow.toFixed(2)} <span class="cross-age">(${crossWeeksHtml(r.rsCrossWeeks)})</span></td>
        <td class="positive">${r.histNow.toFixed(2)}</td>
        <td>${stageCellHtml(r.current_stage)}</td>
        <td>${tvRowButtonHtml(r.ticker, r.universe)}</td>
    `;
}

// Tekst linijki meta nad tabelą, wspólny dla Wybicia i TTM Squeeze — obie
// płaskie, wielo-uniwersalne listy liczą "brak danych" po tym, czy
// JAKIKOLWIEK z uniwersów ma już ref_date (a nie po jednym konkretnym
// uniwersum, jak w renderTable poniżej).
function flatScreenerMetaText(allRows, rows) {
    const refDates = UNIVERSES.map(u => state.data[u].ref_date).filter(Boolean);
    if (!refDates.length) return "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).";
    let text = `Rebalans: ${refDates[0]} · `;
    text += state.stageFilter === "ALL"
        ? `${allRows.length} spółek`
        : `${rows.length} z ${allRows.length} spółek (etap ${state.stageFilter === "2" ? "2A/2B" : state.stageFilter})`;
    return text;
}

// Tabela screenera Wybicie — sortowalna (compareRows po data-key z
// index.html, patrz initDrawer) i filtrowalna po etapie, tak jak pozostałe
// tabele, na płaskiej, wielo-uniwersalnej liście z combinedWybicieCandidates().
function renderWybicieTable() {
    const allRows = combinedWybicieCandidates();

    renderScreenerTable({
        tbody: document.getElementById("wybicieTableBody"),
        metaEl: document.getElementById("drawerMeta"),
        allRows,
        matchesStage: state.stageFilter === "ALL" ? null : (r => matchesStageFilter(r.current_stage)),
        sortKey: state.sortKey, sortDir: state.sortDir,
        colspan: 11,
        emptyAllMsg: `Brak spółek z wybiciem w ostatnich ${state.wybicieMonitorWeeks} tyg. (MACD i RS 52 tyg. przecięły zero w odstępie ≤ ${state.wybicieWindowWeeks} tyg., histogram TTM dodatni).`,
        emptyFilteredMsg: "Żadna spółka nie pasuje do wybranego etapu.",
        metaText: (rows) => flatScreenerMetaText(allRows, rows),
        rowKey: r => r.ticker,
        isSelected: r => r.ticker === state.selectedTicker,
        rowHtml: (r, i) => wybicieRowHtml(r, i + 1),
        onRowClick: r => selectTicker(r.ticker, r.universe),
        afterRender: bindTvRowButtons,
    });
}

// Suwaki nad tabelą Wybicie (#wybicieControls): okno wybicia i czas
// monitorowania po wybiciu (patrz opis nad classifyWybicie). Wartości
// zapamiętywane per przeglądarka w localStorage — tylko wygoda, strona działa
// też bez niego (try/catch — tryb prywatny itp.).
function initWybicieControls() {
    try {
        const saved = JSON.parse(localStorage.getItem(WYBICIE_SETTINGS_KEY) || "null");
        if (saved) {
            if (Number.isFinite(saved.windowWeeks)) state.wybicieWindowWeeks = saved.windowWeeks;
            if (Number.isFinite(saved.monitorWeeks)) state.wybicieMonitorWeeks = saved.monitorWeeks;
        }
    } catch (e) { /* brak localStorage — zostają domyślne */ }

    const bind = (inputId, valueId, stateKey) => {
        const input = document.getElementById(inputId);
        const valueEl = document.getElementById(valueId);
        if (!input) return;
        input.value = state[stateKey];
        if (valueEl) valueEl.textContent = `${state[stateKey]} tyg.`;
        input.addEventListener("input", () => {
            state[stateKey] = Number(input.value);
            if (valueEl) valueEl.textContent = `${state[stateKey]} tyg.`;
            try {
                localStorage.setItem(WYBICIE_SETTINGS_KEY, JSON.stringify({
                    windowWeeks: state.wybicieWindowWeeks, monitorWeeks: state.wybicieMonitorWeeks,
                }));
            } catch (e) { /* ignoruj */ }
            renderWybiciePanel();
            if (state.drawerUniverse === "WYBICIE") renderWybicieTable();
        });
    };
    bind("wybicieWindowInput", "wybicieWindowValue", "wybicieWindowWeeks");
    bind("wybicieMonitorInput", "wybicieMonitorValue", "wybicieMonitorWeeks");
}

function ttmSqueezeStatusHtml(r) {
    return r.status === "fired"
        ? `<span class="squeeze-status squeeze-status-fired">🔥 Wybicie (${r.weeks_since_fire} tyg. temu)</span>`
        : `<span class="squeeze-status squeeze-status-consolidating">🌀 Konsolidacja</span>`;
}

function ttmSqueezeRowHtml(r, position) {
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${r.ticker}</td>
        <td>${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")}</td>
        <td>${r.sector}</td>
        <td>${formatPrice(r.price, r.universe)}</td>
        <td class="${r.momentum_pct >= 0 ? "positive" : "negative"}">${r.momentum_pct.toFixed(2)}%</td>
        <td>${ttmSqueezeStatusHtml(r)}</td>
        <td>${r.consolidation_weeks} tyg.</td>
        <td>${stageCellHtml(r.current_stage)}</td>
        <td>${tvRowButtonHtml(r.ticker, r.universe)}</td>
    `;
}

// Tabela screenera TTM Squeeze — sortowalna (compareRows po data-key z
// index.html, patrz initDrawer) i filtrowalna po etapie (matchesStageFilter/
// #stageFilterBar), tak jak pełna tabela uniwersum (renderTable) i tabela
// Wybicie (renderWybicieTable), na płaskiej, wielo-uniwersalnej liście z
// combinedTtmSqueezeCandidates() (już posortowanej: wybicia przed
// konsolidacjami — ta kolejność bazowa jest tu nadpisywana sortowaniem
// użytkownika, jeśli jakieś wybrał, patrz compareRows).
function renderTtmSqueezeTable() {
    const allRows = combinedTtmSqueezeCandidates();

    renderScreenerTable({
        tbody: document.getElementById("ttmSqueezeTableBody"),
        metaEl: document.getElementById("drawerMeta"),
        allRows,
        matchesStage: state.stageFilter === "ALL" ? null : (r => matchesStageFilter(r.current_stage)),
        sortKey: state.sortKey, sortDir: state.sortDir,
        colspan: 10,
        emptyAllMsg: "Brak danych.",
        emptyFilteredMsg: "Żadna spółka nie pasuje do wybranego etapu.",
        metaText: (rows) => flatScreenerMetaText(allRows, rows),
        rowKey: r => r.ticker,
        isSelected: r => r.ticker === state.selectedTicker,
        rowHtml: (r, i) => ttmSqueezeRowHtml(r, i + 1),
        onRowClick: r => selectTicker(r.ticker, r.universe),
        afterRender: bindTvRowButtons,
    });
}

// Pasek kropek jak na TradingView: czerwona = squeeze w danej sesji, szara =
// brak squeeze'a (ostatnie DAILY_SQUEEZE_RECENT_DAYS sesji, najnowsza z prawej).
function squeezeDotsHtml(recent) {
    const dots = (recent || []).map(v =>
        `<span class="sq-dot ${v === 1 ? "sq-dot-on" : v === 0 ? "sq-dot-off" : "sq-dot-na"}"></span>`).join("");
    return `<span class="sq-dots" title="TTM Squeeze D1, ostatnie ${(recent || []).length} sesji (czerwona = squeeze)">${dots}</span>`;
}

function continuationStatusHtml(r) {
    return r.status === "fired"
        ? `<span class="squeeze-status squeeze-status-fired">🔥 Odpalił ${r.days_since_fire === 0 ? "dziś" : `${r.days_since_fire} ses. temu`}</span>`
        : `<span class="squeeze-status squeeze-status-consolidating">🌀 Squeeze</span>`;
}

function signedPctHtml(v) {
    if (v == null) return "—";
    return `<span class="${v >= 0 ? "positive" : "negative"}">${v >= 0 ? "+" : ""}${v.toFixed(1)}%</span>`;
}

function continuationRowHtml(r, position) {
    const arrow = r.histogram_rising ? "↑" : "↓";
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${r.ticker}</td>
        <td>${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")}</td>
        <td>${r.sector || ""}</td>
        <td>${formatPrice(r.price, r.universe)}</td>
        <td class="positive">${r.momentum_pct.toFixed(1)}%</td>
        <td class="positive">${r.rs_medium.toFixed(1)}</td>
        <td>${continuationStatusHtml(r)}</td>
        <td>${r.squeeze_days} ses.</td>
        <td>${squeezeDotsHtml(r.recent_squeeze)}</td>
        <td class="${r.histogram >= 0 ? "positive" : "negative"}" title="Histogram TTM D1 ${r.histogram_rising ? "rośnie" : "spada"}">${r.histogram.toFixed(2)} ${arrow}</td>
        <td>${signedPctHtml(r.sma50_pct)}</td>
        <td title="Odległość od najwyższego High z 20 sesji">${signedPctHtml(r.high_20d_pct)}</td>
        <td>${stageCellHtml(r.current_stage)}</td>
        <td>${tvRowButtonHtml(r.ticker, r.universe)}</td>
    `;
}

function renderContinuationTable() {
    const allRows = combinedContinuationCandidates();

    renderScreenerTable({
        tbody: document.getElementById("continuationTableBody"),
        metaEl: document.getElementById("drawerMeta"),
        allRows,
        matchesStage: state.stageFilter === "ALL" ? null : (r => matchesStageFilter(r.current_stage)),
        sortKey: state.sortKey, sortDir: state.sortDir,
        colspan: 15,
        emptyAllMsg: `Brak spółek w Etapie 2 (momentum ≥ ${state.contMinMomentumPct}%, RS 26 tyg. > 0, nad SMA50 D1) z krótkim squeeze D1 (≤ ${state.contMaxSqueezeDays} sesji) albo wybiciem z niego w ostatnich ${state.contFireLookbackDays} sesjach.`,
        emptyFilteredMsg: "Żadna spółka nie pasuje do wybranego etapu.",
        metaText: (rows) => flatScreenerMetaText(allRows, rows),
        rowKey: r => r.ticker,
        isSelected: r => r.ticker === state.selectedTicker,
        rowHtml: (r, i) => continuationRowHtml(r, i + 1),
        onRowClick: r => selectTicker(r.ticker, r.universe),
        afterRender: bindTvRowButtons,
    });
}

// Suwaki nad tabelą Continuation (#continuationControls) — ten sam wzorzec co
// initWybicieControls, własny klucz localStorage.
function initContinuationControls() {
    try {
        const saved = JSON.parse(localStorage.getItem(CONTINUATION_SETTINGS_KEY) || "null");
        if (saved) {
            if (Number.isFinite(saved.maxSqueezeDays)) state.contMaxSqueezeDays = saved.maxSqueezeDays;
            if (Number.isFinite(saved.fireLookbackDays)) state.contFireLookbackDays = saved.fireLookbackDays;
            if (Number.isFinite(saved.minMomentumPct)) state.contMinMomentumPct = saved.minMomentumPct;
        }
    } catch (e) { /* brak localStorage — zostają domyślne */ }

    const bind = (inputId, valueId, stateKey, unit) => {
        const input = document.getElementById(inputId);
        const valueEl = document.getElementById(valueId);
        if (!input) return;
        input.value = state[stateKey];
        if (valueEl) valueEl.textContent = `${state[stateKey]}${unit}`;
        input.addEventListener("input", () => {
            state[stateKey] = Number(input.value);
            if (valueEl) valueEl.textContent = `${state[stateKey]}${unit}`;
            try {
                localStorage.setItem(CONTINUATION_SETTINGS_KEY, JSON.stringify({
                    maxSqueezeDays: state.contMaxSqueezeDays,
                    fireLookbackDays: state.contFireLookbackDays,
                    minMomentumPct: state.contMinMomentumPct,
                }));
            } catch (e) { /* ignoruj */ }
            renderContinuationPanel();
            if (state.drawerUniverse === "CONTINUATION") renderContinuationTable();
        });
    };
    bind("contMaxSqueezeInput", "contMaxSqueezeValue", "contMaxSqueezeDays", " ses.");
    bind("contFireLookbackInput", "contFireLookbackValue", "contFireLookbackDays", " ses.");
    bind("contMinMomentumInput", "contMinMomentumValue", "contMinMomentumPct", "%");
}

function renderTable() {
    const d = state.data[state.drawerUniverse];
    const allRows = d.constituents || [];
    // Ustawiane przez beforeRender ponizej, PO filtrze/sortowaniu — pasek wagi
    // skaluje sie wzgledem najwiekszej wagi wsrod AKTUALNIE WIDOCZNYCH wierszy
    // (po filtrze etapu), nie calego uniwersum.
    let maxWeight = 1;

    renderScreenerTable({
        tbody: document.getElementById("momentumTableBody"),
        metaEl: document.getElementById("drawerMeta"),
        allRows,
        matchesStage: state.stageFilter === "ALL" ? null : (r => matchesStageFilter(r.weekly_chart && r.weekly_chart.current_stage)),
        sortKey: state.sortKey, sortDir: state.sortDir,
        colspan: 12,
        emptyAllMsg: "Brak danych.",
        emptyFilteredMsg: "Żadna spółka nie pasuje do wybranego etapu.",
        metaText: (rows) => {
            if (!d.ref_date) return "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).";
            let text = `Rebalans: ${d.ref_date} · `;
            text += state.stageFilter === "ALL"
                ? `${d.n_constituents} spółek`
                : `${rows.length} z ${allRows.length} spółek (etap ${state.stageFilter === "2" ? "2A/2B" : state.stageFilter})`;
            if (d.cap_scaled_due_to_infeasibility) {
                text += " · ⚠ cap 9% przeskalowany (za mało spółek by cap był wykonalny)";
            }
            if (d.n_missing_fmc > 0) {
                text += ` · ${d.n_missing_fmc} pominiętych (brak Market Value w CSV)`;
            }
            return text;
        },
        metaTitle: () => d.fmc_note || "",
        beforeRender: (rows) => { maxWeight = rows.length ? Math.max(...rows.map(r => r.weight_pct), 0.01) : 1; },
        rowKey: r => r.ticker,
        isSelected: r => r.ticker === state.selectedTicker,
        rowHtml: (r) => `
            <td><span class="rank-badge">${r.rank}</span></td>
            <td class="ticker-cell">${r.ticker}</td>
            <td>${r.sector}</td>
            <td>${formatPrice(r.price, state.drawerUniverse)}</td>
            <td class="${r.momentum_pct >= 0 ? "positive" : "negative"}">${r.momentum_pct.toFixed(2)}%</td>
            <td>${r.momentum_window}</td>
            <td>${r.volatility_pct.toFixed(2)}%</td>
            <td class="${r.z_score >= 0 ? "positive" : "negative"}">${r.z_score.toFixed(3)}</td>
            <td>${r.momentum_score.toFixed(3)}</td>
            <td>
                <span class="weight-bar-bg"><span class="weight-bar-fill" style="width:${(r.weight_pct / maxWeight * 100).toFixed(0)}%"></span></span>
                ${r.weight_pct.toFixed(2)}%
            </td>
            <td>${stageCellHtml(r.weekly_chart && r.weekly_chart.current_stage)}</td>
            <td>${tvRowButtonHtml(r.ticker, state.drawerUniverse)}</td>
        `,
        onRowClick: r => selectTicker(r.ticker, state.drawerUniverse),
        afterRender: bindTvRowButtons,
    });
}

// ============================================================
// SZYBKIE SZUKANIE (Ctrl/Cmd+K albo po prostu zacznij pisać) —
// jak paleta poleceń w VSCode/Notion czy wyszukiwarka na TradingView.
// ============================================================
let cmdkIndex = [];
let cmdkMatches = [];
let cmdkSelectedIndex = 0;

// Indeks szukania obejmuje CALE uniwersum (all_constituents), nie tylko biezacy
// decyl — patrz FULL_COVERAGE_UNIVERSES/_build_full_universe_records w run_query.py.
// Dla uniwersow rownowazonych (DOWJONES/WIG20/MWIG40) all_constituents jest rowne
// constituents, wiec fallback ponizej jest tylko zabezpieczeniem na starszy,
// jeszcze niezmigrowany JSON w cache service workera.
function buildSearchIndex() {
    const byTicker = {};
    UNIVERSES.forEach(u => {
        (state.data[u].all_constituents || state.data[u].constituents || []).forEach(c => {
            if (!byTicker[c.ticker]) byTicker[c.ticker] = { ticker: c.ticker, sector: c.sector, universes: [] };
            byTicker[c.ticker].universes.push(u);
        });
    });
    cmdkIndex = Object.values(byTicker).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function openCmdk(seed) {
    const overlay = document.getElementById("cmdkOverlay");
    const input = document.getElementById("cmdkInput");
    overlay.style.display = "flex";
    input.value = seed || "";
    renderCmdkResults(input.value);
    input.focus();
}

function closeCmdk() {
    document.getElementById("cmdkOverlay").style.display = "none";
}

function renderCmdkResults(query) {
    const q = query.trim().toUpperCase();
    cmdkMatches = (q
        ? cmdkIndex.filter(i => i.ticker.includes(q))
            .sort((a, b) => (a.ticker.startsWith(q) === b.ticker.startsWith(q)) ? 0 : (a.ticker.startsWith(q) ? -1 : 1))
        : cmdkIndex
    ).slice(0, 20);
    cmdkSelectedIndex = 0;

    const results = document.getElementById("cmdkResults");
    if (cmdkMatches.length === 0) {
        results.innerHTML = `<div class="cmdk-empty">Brak wyników</div>`;
        return;
    }
    results.innerHTML = cmdkMatches.map((m, i) => `
        <div class="cmdk-result${i === 0 ? " selected" : ""}" data-idx="${i}">
            <span class="cmdk-ticker">${m.ticker}</span>
            <span class="cmdk-sector">${m.sector}</span>
            <span class="cmdk-universe">${m.universes.map(u => UNIVERSE_LABELS[u].replace(" Momentum", "")).join(" + ")}</span>
        </div>
    `).join("");
    results.querySelectorAll(".cmdk-result").forEach(el => {
        el.addEventListener("mouseenter", () => {
            cmdkSelectedIndex = Number(el.dataset.idx);
            updateCmdkSelectionHighlight();
        });
        el.addEventListener("click", () => confirmCmdkSelection());
    });
}

// Getter wylacznie dla test runnera Node (tests/js/) — `cmdkIndex` jest
// modulowym `let`, wiec samo wyeksportowanie jego wartosci przy starcie
// modulu nie odzwierciedlaloby pozniejszych wywolan buildSearchIndex().
function getCmdkIndex() {
    return cmdkIndex;
}

function updateCmdkSelectionHighlight() {
    document.querySelectorAll(".cmdk-result").forEach(el => {
        el.classList.toggle("selected", Number(el.dataset.idx) === cmdkSelectedIndex);
    });
    document.querySelector(".cmdk-result.selected")?.scrollIntoView({ block: "nearest" });
}

function moveCmdkSelection(delta) {
    if (cmdkMatches.length === 0) return;
    cmdkSelectedIndex = (cmdkSelectedIndex + delta + cmdkMatches.length) % cmdkMatches.length;
    updateCmdkSelectionHighlight();
}

function confirmCmdkSelection() {
    const m = cmdkMatches[cmdkSelectedIndex];
    if (!m) return;
    closeCmdk();
    jumpToTicker(m.ticker, m.universes[0]);
}

function initCmdk() {
    const overlay = document.getElementById("cmdkOverlay");
    const input = document.getElementById("cmdkInput");

    document.getElementById("cmdkTrigger").addEventListener("click", () => openCmdk());
    input.addEventListener("input", () => renderCmdkResults(input.value));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeCmdk(); });

    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            openCmdk();
            return;
        }
        const isOpen = overlay.style.display !== "none";
        if (isOpen) {
            if (e.key === "Escape") { closeCmdk(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); moveCmdkSelection(1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); moveCmdkSelection(-1); }
            else if (e.key === "Enter") { e.preventDefault(); confirmCmdkSelection(); }
            return;
        }
        // Nie przechwytuj pisania w polach formularza — zacznij szukać tylko
        // gdy piszesz "po prostu na stronie" (tak jak Spotlight na macOS).
        const tag = document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            openCmdk(e.key);
        }
    });
}

// ============================================================
// INIT
// ============================================================
// typeof document check: pozwala wczytać ten plik przez `require()` w testach
// Node (patrz tests/js/) bez uruchamiania inicjalizacji strony — w przeglądarce
// document zawsze istnieje, więc zachowanie się nie zmienia.
if (typeof document !== "undefined") {
    (async function init() {
        initConnStatus();
        await loadData();
        initWybicieControls();
        initContinuationControls();
        renderSidebarTiles();
        renderWybiciePanel();
        renderTtmSqueezePanel();
        renderContinuationPanel();
        initDrawer();
        initOpenTvButton();
        initResetZoomButton();
        initMansfieldControls();
        initChartViewTabs();
        initChartFullscreen();
        initStageFilter();
        updateSortHeaderClasses();
        renderTable(); // renderowane od razu (nie tylko po rozwinięciu) — na mobile lista jest domyślnym widokiem
        buildSearchIndex();
        initCmdk();
        document.getElementById("chartBackBtn").addEventListener("click", () => {
            document.querySelector(".workspace").classList.remove("mobile-chart-view");
        });
        // Domyslnie wybrana spolka: pierwsza z domyslnej zakladki drawera
        // (state.drawerUniverse, dzis SP500 — replikacja SPMO).
        const defaultRows = (state.data[state.drawerUniverse] || {}).constituents || [];
        if (defaultRows.length > 0) {
            state.selectedTicker = defaultRows[0].ticker;
            state.selectedUniverse = state.drawerUniverse;
            // Bez tego domyslna spolka zawsze pokazywala "Brak wlasnego
            // wykresu" — currentRsEntry ustawial dotad tylko selectTicker().
            state.currentRsEntry = findRsEntry(state.selectedTicker, state.selectedUniverse);
        }
        updateChartArea();
        hideLoadingOverlay();
    })();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
}

// Eksport wyłącznie dla test runnera Node (tests/js/) — nie ładowany
// i bez efektu w przeglądarce (module tam nie istnieje).
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        compareRows,
        weeksSinceZeroCrossUp, classifyWybicie, combinedWybicieCandidates, classifyTtmSqueeze, combinedTtmSqueezeCandidates,
        classifyContinuation, combinedContinuationCandidates, state,
        findRsEntry, buildSearchIndex, getCmdkIndex,
    };
}

