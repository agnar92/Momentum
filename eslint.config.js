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
    // Zdefiniowane w docs/js/chart-render.js, wspoldzielonym przez zwykly
    // <script> tag (bez modulow/bundlera) z docs/js/app.js i docs/js/chart.js
    // — patrz komentarz na gorze chart-render.js. Ten sam wzorzec co
    // Chart/XLSX/TradingView powyzej (globalne, dostarczone przez inny plik
    // <script>, nie zdefiniowane lokalnie w pliku, ktory je uzywa).
    renderRelativeStrengthChart: "readonly",
    renderStageBadge: "readonly",
    destroyChartInstances: "readonly",
    resetChartZoom: "readonly",
    rsChartInstance: "readonly",
    rsVolumeChartInstance: "readonly",
    rsMansfieldChartInstance: "readonly",
    rsSqueezeChartInstance: "readonly",
    STAGE_LABELS: "readonly",
    STAGE_COLORS: "readonly",
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
