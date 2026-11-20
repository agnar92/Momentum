// Config lintera wyłącznie dla CI (npm run lint) — strona w docs/ pozostaje plain HTML/JS bez build stepu.
"use strict";

const browserGlobals = {
    window: "readonly", document: "readonly", localStorage: "readonly", fetch: "readonly", console: "readonly", location: "readonly",
    URLSearchParams: "readonly", module: "readonly", history: "readonly",
    W: "readonly", WY: "readonly",   // docs/js/wspolne.js i wykresy.js (ładowane przed lista.js / spolka.js)
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
