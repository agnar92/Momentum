// Testy dla czystej logiki w docs/js/app.js (obecnie tylko komparator
// sortowania tabeli — reszta pliku jest scisle sprzezona z DOM/renderowaniem).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { compareRows } = require(path.join("..", "..", "docs", "js", "app.js"));

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
