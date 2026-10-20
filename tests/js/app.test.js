const test = require("node:test");
const assert = require("node:assert");
const { cell, visibleRows, fileName, isSignal, weekInProgress } = require("../../docs/js/app.js");

test("cell formats", () => {
    assert.strictEqual(cell(1234.5, "p"), "1,234.50");
    assert.strictEqual(cell(3.21, "%"), "+3.2");
    assert.strictEqual(cell(-1, "%"), "-1.0");
    assert.strictEqual(cell(75e6, "m"), "75");
    assert.strictEqual(cell(true, "b"), "✓");
    assert.strictEqual(cell(null, "p"), "");
});

const ROWS = [
    { ticker: "A", company: "Alpha", ok: true, glb_state: "POD", dopm: 9 },
    { ticker: "B", company: "Beta", ok: true, glb_state: "SYGNAŁ", dopm: 4 },
    { ticker: "C", company: "Gamma", ok: false, glb_state: "WYBICIE", dopm: 20 },
    { ticker: "D", company: "Delta", ok: true, glb_state: "NAD", dopm: null },
];

test("default order: signal+ok first, then ok, by Δ operating margin", () => {
    assert.deepStrictEqual(visibleRows(ROWS, {}).map((r) => r.ticker), ["B", "A", "D", "C"]);
    assert.deepStrictEqual(visibleRows(ROWS, { onlyOk: true }).map((r) => r.ticker), ["B", "A", "D"]);
    assert.ok(isSignal(ROWS[1]) && !isSignal(ROWS[2]));
});

test("search and column sort keep empty values last", () => {
    assert.deepStrictEqual(visibleRows(ROWS, { search: "ga" }).map((r) => r.ticker), ["C"]);
    assert.deepStrictEqual(visibleRows(ROWS, { sort: { key: "dopm", dir: -1 } }).map((r) => r.ticker), ["C", "A", "B", "D"]);
    assert.deepStrictEqual(visibleRows(ROWS, { sort: { key: "dopm", dir: 1 } }).map((r) => r.ticker), ["B", "A", "C", "D"]);
});

test("file name matches watchlist.file_name", () => {
    assert.strictEqual(fileName("^GSPC"), "_GSPC.json");
    assert.strictEqual(fileName("BRK-B"), "BRK-B.json");
});

test("week in progress until Saturday", () => {
    assert.ok(weekInProgress("2026-10-19", "2026-10-20T12:00:00Z"));
    assert.ok(!weekInProgress("2026-10-12", "2026-10-17T03:20:00Z"));
});
