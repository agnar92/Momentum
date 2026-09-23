// Testy dla docs/js/chart-modal.js — mechanizm wykresu spółki (okienko modalne
// + panel TradingView + pełny ekran) wydzielony z app.js, żeby signals.js
// mogło go współdzielić (patrz CLAUDE.md). Tylko findRsEntry jest tu
// "czyste" (poza DOM); reszta pliku jest ściśle sprzężona z DOM/renderowaniem,
// zgodnie z konwencją całego tego modułu (patrz tests/js/chart-render.test.js).
//
// chart-modal.js samo NIE deklaruje `state` (czyta go jako zwykły global,
// dostarczany w przeglądarce przez app.js/signals.js — patrz komentarz na
// górze chart-modal.js) — więc test sam ustawia globalny `state` przed
// wywołaniem, dokładnie tak jak strona robi to przy starcie.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

global.state = { data: {} };
const { findRsEntry } = require(path.join("..", "..", "docs", "js", "chart-modal.js"));

function emptyStateData() {
    return {
        SP500: { constituents: [] }, NASDAQ100: { constituents: [] }, DOWJONES: { constituents: [] },
        WIG20: { constituents: [] }, MWIG40: { constituents: [] }, SWIG80: { constituents: [] },
    };
}

// findRsEntry: od zmiany na zyczenie uzytkownika ("wszystkie spolki z SP500,
// Nasdaq100" do wyszukiwania/wykresow/RSM) czyta all_constituents (CALE
// uniwersum, patrz run_query.py FULL_COVERAGE_UNIVERSES), nie tylko
// constituents (biezacy decyl) — z fallbackiem na constituents dla starszego,
// jeszcze niezmigrowanego JSON-a w cache service workera.

test("findRsEntry finds a ticker that is only in all_constituents, not in constituents (outside the decile)", () => {
    global.state.data = emptyStateData();
    global.state.data.SP500.constituents = [
        { ticker: "AAA", weekly_chart: { dates: [] } },
    ];
    global.state.data.SP500.all_constituents = [
        { ticker: "AAA", weekly_chart: { dates: [] } },
        { ticker: "TYL", in_selection: false, weekly_chart: { dates: ["2026-01-05"] } },
    ];

    const entry = findRsEntry("TYL", "SP500");
    assert.ok(entry);
    assert.equal(entry.ticker, "TYL");
    assert.equal(entry.universe, "SP500");
});

test("findRsEntry falls back to constituents when all_constituents is absent (equal-weight universe / stale cache)", () => {
    global.state.data = emptyStateData();
    global.state.data.DOWJONES.constituents = [
        { ticker: "BBB", weekly_chart: { dates: [] } },
    ];

    const entry = findRsEntry("BBB", "DOWJONES");
    assert.ok(entry);
    assert.equal(entry.ticker, "BBB");
});

test("findRsEntry returns null when the ticker has no weekly_chart", () => {
    global.state.data = emptyStateData();
    global.state.data.SP500.all_constituents = [{ ticker: "NOCHART", weekly_chart: null }];
    assert.equal(findRsEntry("NOCHART", "SP500"), null);
});
