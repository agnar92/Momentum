// Config lintera wylacznie dla CI (npm run lint) — nie ma wplywu na
// wdrazana strone w docs/, ktora pozostaje plain HTML/JS bez build stepu.
"use strict";

const browserGlobals = {
    window: "readonly",
    document: "readonly",
    navigator: "readonly",
    localStorage: "readonly",
    fetch: "readonly",
    console: "readonly",
    confirm: "readonly",
    alert: "readonly",
    Chart: "readonly",
    XLSX: "readonly",
    TradingView: "readonly",
    getComputedStyle: "readonly",
    location: "readonly",
    module: "readonly",
    Blob: "readonly",
    URL: "readonly",
    URLSearchParams: "readonly",
    history: "readonly",
    // require: zwykle NIE jest globalem przegladarki — pojawia sie tylko w
    // gałęzi `typeof require === "function" && typeof window === "undefined"`
    // na gorze app.js/rebalance.js/chart.js/chart-render.js, ktora w Node
    // (tests/js/) recznie doczepia eksporty js/shared.js i/lub js/qol.js do
    // globalThis (bo Node nie laduje <script> tagow tak jak przegladarka) —
    // w przegladarce ta galaz sie nie wykonuje. Patrz komentarz na gorze
    // shared.js/qol.js.
    require: "readonly",
    // Zdefiniowane w docs/js/chart-render.js, wspoldzielonym przez zwykly
    // <script> tag (bez modulow/bundlera) z docs/js/app.js i docs/js/chart.js
    // — patrz komentarz na gorze chart-render.js. Ten sam wzorzec co
    // Chart/XLSX/TradingView powyzej (globalne, dostarczone przez inny plik
    // <script>, nie zdefiniowane lokalnie w pliku, ktory je uzywa).
    renderRelativeStrengthChart: "readonly",
    renderStageBadge: "readonly",
    destroyChartInstances: "readonly",
    resetChartZoom: "readonly",
    initMansfieldControls: "readonly",
    rsChartInstance: "readonly",
    rsVolumeChartInstance: "readonly",
    rsMacdChartInstance: "readonly",
    rsMansfieldChartInstance: "readonly",
    rsSqueezeChartInstance: "readonly",
    // Zdefiniowane w docs/js/shared.js, wspoldzielonym przez zwykly <script>
    // tag z index.html/rebalance.html/chart.html (patrz komentarz na gorze
    // tamtego pliku) — ten sam wzorzec co powyzej dla chart-render.js.
    UNIVERSES: "readonly",
    UNIVERSE_LABELS: "readonly",
    PLN_UNIVERSES: "readonly",
    formatPrice: "readonly",
    tvSymbolFor: "readonly",
    tvUrlFor: "readonly",
    STAGE_LABELS: "readonly",
    STAGE_DESCRIPTIONS: "readonly",
    STAGE_COLORS: "readonly",
    STAGE_BREAKOUT_VOLUME_RATIO: "readonly",
    BASE_BOX_COLORS: "readonly",
    stageCellHtml: "readonly",
    compareRows: "readonly",
    // Zdefiniowane w docs/js/table-render.js, wspoldzielonym przez zwykly
    // <script> tag z docs/js/app.js i docs/js/rebalance.js — patrz komentarz
    // na gorze table-render.js. Ten sam wzorzec co powyzej dla
    // chart-render.js/shared.js. compareRows (powyzej) jest zdefiniowane w
    // js/shared.js i uzywane jako domyslny komparator wewnatrz
    // table-render.js (odwrotny kierunek tego samego wzorca — plik
    // zaladowany PRZED app.js odwoluje sie do funkcji, ktora zdefiniuje ono
    // PO zaladowaniu, ale w praktyce dopiero przy pierwszym wywolaniu
    // renderScreenerTable(), gdy wszystkie skrypty juz sa zaladowane).
    renderScreenerTable: "readonly",
    // Zdefiniowane w docs/js/qol.js, wspoldzielonym przez zwykly <script> tag
    // z index.html/rebalance.html/chart.html — patrz komentarz na gorze
    // qol.js. Ten sam wzorzec co powyzej dla chart-render.js/shared.js.
    // Zdefiniowane w docs/js/minicharts.js (wspólne mini-wykresy tabel) —
    // ten sam wzorzec co shared.js/table-render.js powyżej.
    latestNonNullIdx: "readonly",
    sparkPoints: "readonly",
    sparkPath: "readonly",
    seriesRange: "readonly",
    sparkSqueezeBars: "readonly",
    weeklySparkSvg: "readonly",
    dailySparkSvg: "readonly",
    RS_BAR_CAP: "readonly",
    rsBarHtml: "readonly",
    ttmMiniSvg: "readonly",
    MINI_WEEKS: "readonly",
    miniVisualFields: "readonly",
    zeroLineSparkSvg: "readonly",
    crossIndexInTail: "readonly",
    findConstituent: "readonly",
    BULLET_TOLERANCE_PCT: "readonly",
    bulletHtml: "readonly",
    stageBreakdown: "readonly",
    PULLBACK_BAND_PCT: "readonly",
    pullbackHtml: "readonly",
    showToast: "readonly",
    initConnStatus: "readonly",
    hideLoadingOverlay: "readonly",
};

const nodeGlobals = {
    require: "readonly",
    module: "readonly",
    process: "readonly",
    console: "readonly",
    global: "readonly",
};

module.exports = [
    // Biblioteki firm trzecich zvendorowane lokalnie (patrz "Chart.js/its two
    // plugins/SheetJS are vendored locally" w CLAUDE.md) — kopiowane 1:1 z npm,
    // nie nasz kod, nie ma sensu ich lintowac (i tak zalewaja bledami/ostrzezeniami
    // reguly pisane pod ten projekt).
    { ignores: ["docs/js/vendor/**"] },
    {
        files: ["docs/js/**/*.js"],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: "script",
            globals: browserGlobals,
        },
        rules: {
            // caughtErrors: "none" -- `catch (e) { return default; }` jest tu
            // celowym wzorcem cichego pominiecia bledu (np. brak localStorage/JSON),
            // nie pomylka.
            "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
            "no-undef": "error",
            eqeqeq: ["error", "smart"],
            "no-new": "warn",
        },
    },
    {
        files: ["tests/js/**/*.js"],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: "commonjs",
            globals: nodeGlobals,
        },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "error",
        },
    },
];
