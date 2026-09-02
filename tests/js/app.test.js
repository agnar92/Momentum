// Testy dla czystej logiki w docs/js/app.js (obecnie tylko komparator
// sortowania tabeli — reszta pliku jest scisle sprzezona z DOM/renderowaniem).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { compareRows, rollingMean, alignMansfieldToDates, fmtPlDate } = require(path.join("..", "..", "docs", "js", "app.js"));

test("compareRows sorts numerically ascending", () => {
    const rows = [{ rank: 3 }, { rank: 1 }, { rank: 2 }];
    rows.sort((a, b) => compareRows(a, b, "rank", "asc"));
    assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
});

test("compareRows sorts numerically descending", () => {
    const rows = [{ weight_pct: 1 }, { weight_pct: 3 }, { weight_pct: 2 }];
    rows.sort((a, b) => compareRows(a, b, "weight_pct", "desc"));
    assert.deepEqual(rows.map((r) => r.weight_pct), [3, 2, 1]);
});

test("compareRows sorts strings case-insensitively", () => {
    const rows = [{ ticker: "banana" }, { ticker: "Apple" }, { ticker: "cherry" }];
    rows.sort((a, b) => compareRows(a, b, "ticker", "asc"));
    assert.deepEqual(rows.map((r) => r.ticker), ["Apple", "banana", "cherry"]);
});

test("compareRows treats equal values as a tie (stable order)", () => {
    const rows = [{ rank: 1, id: "a" }, { rank: 1, id: "b" }];
    assert.equal(compareRows(rows[0], rows[1], "rank", "asc"), 0);
});

test("rollingMean averages the trailing window, using a shorter window for the first points", () => {
    const values = [10, 20, 30, 40, 50];
    const out = rollingMean(values, 3);
    assert.deepEqual(out, [10, 15, 20, 30, 40]);
});

test("rollingMean skips null values inside the window instead of propagating null", () => {
    const values = [10, null, 30];
    const out = rollingMean(values, 3);
    assert.deepEqual(out, [10, 10, 20]);
});

test("rollingMean returns null only when every value in the window (so far) is null", () => {
    const values = [null, null, 30];
    const out = rollingMean(values, 3);
    assert.deepEqual(out, [null, null, 30]);
});

test("alignMansfieldToDates pads with null before the Mansfield window's own start date", () => {
    const fullDates = ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22"];
    const mansfieldData = { dates: ["2026-01-15", "2026-01-22"], rsm_short: [1, 2], rsm_medium: [10, 20] };
    const aligned = alignMansfieldToDates(mansfieldData, fullDates);
    assert.deepEqual(aligned.short, [null, null, 1, 2]);
    assert.deepEqual(aligned.medium, [null, null, 10, 20]);
});

test("alignMansfieldToDates returns an all-null series when no Mansfield date matches", () => {
    const fullDates = ["2025-01-01", "2025-01-08"];
    const mansfieldData = { dates: ["2026-01-15"], rsm_short: [1], rsm_medium: [10] };
    const aligned = alignMansfieldToDates(mansfieldData, fullDates);
    assert.deepEqual(aligned.short, [null, null]);
    assert.deepEqual(aligned.medium, [null, null]);
});

test("fmtPlDate converts an ISO date to dd.mm.yyyy", () => {
    assert.equal(fmtPlDate("2026-03-09"), "09.03.2026");
    assert.equal(fmtPlDate("2026-12-31"), "31.12.2026");
});
