// Config lintera wyłącznie dla CI (npm run lint) — strona w docs/ pozostaje plain HTML/JS bez build stepu.
"use strict";

const browserGlobals = {
    window: "readonly", document: "readonly", navigator: "readonly", localStorage: "readonly", fetch: "readonly",
    console: "readonly", location: "readonly", setTimeout: "readonly", clearTimeout: "readonly", CSS: "readonly",
    URL: "readonly", setInterval: "readonly", clearInterval: "readonly", TextDecoder: "readonly", Blob: "readonly", caches: "readonly", Notification: "readonly", requestAnimationFrame: "readonly", self: "readonly", module: "readonly",
    require: "readonly",   // tylko w testach (chart.js sprawdza typeof require)
    // docs/js/lines.js i chart.js (ładowane PRZED app.js)
    dateIndex: "readonly", lineAt: "readonly", hitLine: "readonly", snapPrice: "readonly", snapHorizontal: "readonly", evalAlerts: "readonly", snapshot: "readonly", positionPlan: "readonly", positionStatus: "readonly", MAX_POSITIONS: "readonly", rulerText: "readonly",
    chartSvg: "readonly", infoLines: "readonly", titleText: "readonly", sliderSvg: "readonly", sliderRect: "readonly",
    sliderMode: "readonly", sliderDrag: "readonly", sliderJump: "readonly", zoomWindow: "readonly", windowRange: "readonly",
};
const nodeGlobals = { require: "readonly", module: "readonly", process: "readonly", console: "readonly" };

module.exports = [
    {
        files: ["docs/**/*.js"],
        languageOptions: { ecmaVersion: 2021, sourceType: "script", globals: browserGlobals },
        rules: { "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }], "no-undef": "error", eqeqeq: ["error", "smart"] },
    },
    {
        files: ["tests/js/**/*.js"],
        languageOptions: { ecmaVersion: 2021, sourceType: "commonjs", globals: nodeGlobals },
        rules: { "no-unused-vars": "warn", "no-undef": "error" },
    },
];
