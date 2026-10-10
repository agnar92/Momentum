// Config lintera wylacznie dla CI (npm run lint) — nie ma wplywu na
// wdrazana strone w docs/, ktora pozostaje plain HTML/JS bez build stepu.
"use strict";

// Globale przegladarki oraz globale dzielone miedzy zwyklymi <script> tagami
// (bez modulow/bundlera): js/shared.js (tvUrlFor, compareRows) i js/qol.js (toast/offline/loading) sa ladowane PRZED
// watchlist.js — patrz komentarze na gorze tych plikow.
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
    fundMiniModel: "readonly",
    fundMiniHtml: "readonly",
    macdWeeklyState: "readonly",
    posMiniSvg: "readonly",
    CSS: "readonly",
    tvUrlFor: "readonly",
    compareRows: "readonly",
    showToast: "readonly",
    showSheet: "readonly",
    closeSheet: "readonly",
    initConnStatus: "readonly",
    hideLoadingOverlay: "readonly",
    // docs/js/book.js (ładowany PRZED chart.js)
    bookLogTicks: "readonly",
    bookAxisFmt: "readonly",
    bookSvg: "readonly",
    computeBook: "readonly",
    shiftBook: "readonly",
    // docs/js/darvas.js (ładowany po chart.js, PRZED watchlist.js)
    darvasBoxes: "readonly",
    darvasSvg: "readonly",
    darvasBoxInfo: "readonly",
    darvasStatus: "readonly",
    darvasPinStatus: "readonly",
    darvasOverview: "readonly",
    darvasCupGeometry: "readonly",
    darvasCupStatus: "readonly",
    darvasFlatStatus: "readonly",
    darvasPatternBoxes: "readonly",
    DARVAS_NEW_WEEKS: "readonly",
    DARVAS_STOP_PCT: "readonly",
    darvasBoxSheetHtml: "readonly",
    // docs/js/chart.js (ładowany PRZED watchlist.js)
    niceTicks: "readonly",
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
    annSyncPositionLines: "readonly",
    annPositionLineValue: "readonly",
    ANN_DIR_LABELS: "readonly",
    annEdit: "readonly",
    annPen: "readonly",
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
