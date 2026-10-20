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

test("scanner filter", () => {
    const rows = ROWS.map((r, i) => ({ ...r, scanners: i % 2 ? ["S1", "S2"] : ["S1"] }));
    assert.deepStrictEqual(visibleRows(rows, { scanner: "S2" }).map((r) => r.ticker), ["B", "D"]);
    assert.strictEqual(visibleRows(rows, { scanner: null }).length, 4);
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

test("column filters combine with AND", () => {
    const { passFilters, activeFilters, FILTER_PRESETS } = require("../../docs/js/app.js");
    const rows = [
        { ticker: "A", ok: true, glb_state: "NAD", macd: "nad", glb_pct: 15, turnover: 80e6 },
        { ticker: "B", ok: true, glb_state: "NAD", macd: "pod", glb_pct: 12, turnover: 60e6 },
        { ticker: "C", ok: false, glb_state: "POD", macd: "nad", glb_pct: -5, turnover: null },
    ];
    const f = FILTER_PRESETS.find(([n]) => n === "Nad GLB + MACD dodatni")[1];
    assert.deepStrictEqual(rows.filter((r) => passFilters(r, f)).map((r) => r.ticker), ["A"]);
    assert.deepStrictEqual(visibleRows(rows, { filters: { turnover: { min: 70 } } }).map((r) => r.ticker), ["A"]);
    assert.deepStrictEqual(visibleRows(rows, { filters: { glb_pct: { max: 12 }, ok: { in: ["nie"] } } }).map((r) => r.ticker), ["C"]);
    assert.strictEqual(activeFilters({ a: { in: [] }, b: { min: 1 }, c: {} }), 1);
});

test("potential stars, slowdown cell and filters", () => {
    const { passFilters } = require("../../docs/js/app.js");
    assert.strictEqual(cell(2, "n"), "★★☆");
    assert.strictEqual(cell("HAMUJE+MB", "w"), "⚠⚠ + marża");
    assert.strictEqual(cell(null, "w"), "");
    assert.ok(passFilters({ pot: 4 }, { pot: { min: 3 } }) && !passFilters({ pot: 2 }, { pot: { min: 3 } }));
    assert.ok(passFilters({ slow: null }, { slow: { in: ["—"] } }) && !passFilters({ slow: "HAMUJE" }, { slow: { in: ["—"] } }));
});

test("default order: strong (Δ op. margin ≥ 10 pp) with GLB signal first", () => {
    const rows = [{ ticker: "A", ok: true, glb_state: "SYGNAŁ", dopm: 5 }, { ticker: "B", ok: true, strong: true, glb_state: "WYBICIE", dopm: 11 },
        { ticker: "C", ok: true, strong: true, glb_state: "POD", dopm: 30 }, { ticker: "D", ok: false, dopm: 50 }];
    assert.deepStrictEqual(visibleRows(rows, {}).map((r) => r.ticker), ["B", "A", "C", "D"]);
});
