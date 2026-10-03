// Config lintera wylacznie dla CI (npm run lint) — nie ma wplywu na
// wdrazana strone w docs/, ktora pozostaje plain HTML/JS bez build stepu.
"use strict";

// Globale przegladarki oraz globale dzielone miedzy zwyklymi <script> tagami
// (bez modulow/bundlera): js/shared.js (tvUrlFor, compareRows, widgety
// TradingView) i js/qol.js (toast/offline/loading) sa ladowane PRZED
// watchlist.js i ep.js — patrz komentarze na gorze tych plikow.
const browserGlobals = {
    window: "readonly",
    document: "readonly",
    navigator: "readonly",
    localStorage: "readonly",
    fetch: "readonly",
    console: "readonly",
    confirm: "readonly",
    alert: "readonly",
    location: "readonly",
    getComputedStyle: "readonly",
    setTimeout: "readonly",
    clearTimeout: "readonly",
    module: "readonly",
    URL: "readonly",
    // require pojawia sie tylko w galezi `typeof require === "function" &&
    // typeof window === "undefined"` na gorze plikow (Node/tests/js/).
    require: "readonly",
    escapeHtml: "readonly",
    patternExplain: "readonly",
    tvUrlFor: "readonly",
    compareRows: "readonly",
    TV_EMBED_BASE: "readonly",
    TV_1MIN_VWAP_WIDGET: "readonly",
    buildTvWidgetBlock: "readonly",
    showToast: "readonly",
    initConnStatus: "readonly",
    hideLoadingOverlay: "readonly",
    // docs/js/chart.js (ładowany PRZED watchlist.js)
    renderStockChart: "readonly",
    dateToIndex: "readonly",
    indexToDate: "readonly",
    cupArcPoints: "readonly",
    miniChartSvg: "readonly",
    estimateText: "readonly",
    // docs/js/annotate.js (ładowany PRZED watchlist.js); annStore/annCurrent/annOnRedraw to `let` — przypisywane tylko tam i w watchlist.js
    alertRows: "readonly",
    annRefresh: "readonly",
    annSave: "readonly",
    annLoad: "readonly",
    annHide: "readonly",
    annOverlay: "readonly",
    annExportJson: "readonly",
    annInitUI: "readonly",
    annSyncTools: "readonly",
    mergeImport: "readonly",
    ANN_KIND_LABELS: "readonly",
    ANN_NEAR_PCT: "readonly",
    ANN_DIR_LABELS: "readonly",
    annEdit: "readonly",
    annStore: "writable",
    annCurrent: "writable",
    annOnSave: "writable",
    annWriteLocal: "readonly",
    mergeStores: "readonly",
    // docs/js/sync.js (ładowany PRZED watchlist.js)
    syncInit: "readonly",
    // docs/js/watchlist.js używane przez sync.js (ładowanego wcześniej)
    prefsStore: "writable",
    mergePrefs: "readonly",
    prefsNormalize: "readonly",
    prefsApply: "readonly",
    prefsWriteLocal: "readonly",
    setInterval: "readonly",
};

const nodeGlobals = {
    require: "readonly",
    module: "readonly",
    process: "readonly",
    console: "readonly",
    global: "readonly",
};

module.exports = [
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
