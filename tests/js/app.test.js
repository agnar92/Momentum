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

test("default order uses breakout signals without reapplying extra fundamental conditions", () => {
    assert.deepStrictEqual(visibleRows(ROWS, {}).map((r) => r.ticker), ["B", "C", "A", "D"]);
    assert.deepStrictEqual(visibleRows(ROWS, { filters: {} }).map((r) => r.ticker), ["B", "C", "A", "D"]);
    assert.ok(isSignal(ROWS[1]) && isSignal(ROWS[2]));
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
    assert.deepStrictEqual(visibleRows(rows, { filters: { glb_pct: { max: 12 }, macd: { in: ["nad"] } } }).map((r) => r.ticker), ["C"]);
    assert.strictEqual(activeFilters({ a: { in: [] }, b: { min: 1 }, c: {} }), 1);
});

test("P/S and RS cells, slowdown cell and filters", () => {
    const { passFilters } = require("../../docs/js/app.js");
    assert.strictEqual(cell(12.345, "x"), "12.3");
    assert.strictEqual(cell(62.1, "%"), "+62.1");
    assert.strictEqual(cell("HAMUJE+MB", "w"), "⚠⚠ + marża");
    assert.strictEqual(cell(null, "w"), "");
    assert.ok(passFilters({ rs: 60 }, { rs: { min: 50 } }) && !passFilters({ rs: 20 }, { rs: { min: 50 } }));
    assert.ok(passFilters({ slow: null }, { slow: { in: ["—"] } }) && !passFilters({ slow: "HAMUJE" }, { slow: { in: ["—"] } }));
});

test("default order: conditions + GLB signal first, then by relative strength", () => {
    const rows = [{ ticker: "A", ok: true, glb_state: "SYGNAŁ", rs: 55 }, { ticker: "B", ok: true, glb_state: "WYBICIE", rs: 90 },
        { ticker: "C", ok: true, glb_state: "POD", rs: 120 }, { ticker: "D", ok: false, rs: 300 }];
    assert.deepStrictEqual(visibleRows(rows, {}).map((r) => r.ticker), ["B", "A", "D", "C"]);
});

test("volatility column and presets", () => {
    const { passFilters, FILTER_PRESETS, COLUMNS } = require("../../docs/js/app.js");
    assert.ok(COLUMNS.some(([k]) => k === "vol52"));
    const f = FILTER_PRESETS.find(([n]) => n === "Ruchliwe: zmienność ≥ 0,50")[1];
    assert.ok(passFilters({ vol52: 0.62 }, f) && !passFilters({ vol52: 0.31 }, f) && !passFilters({ vol52: null }, f));
    const g = FILTER_PRESETS.find(([n]) => n.startsWith("Ruchliwe (zmienność ≥ 0,50) + nad GLB"))[1];
    assert.ok(passFilters({ vol52: 0.7, glb_state: "WYBICIE" }, g) && !passFilters({ vol52: 0.7, glb_state: "POD" }, g));
    assert.strictEqual(cell(0.5234, "r"), "0.52");
});

test("energy column and presets", () => {
    const { passFilters, FILTER_PRESETS, COLUMNS } = require("../../docs/js/app.js");
    assert.ok(COLUMNS.some(([k]) => k === "energy"));
    const f = FILTER_PRESETS.find(([n]) => n === "Energia ≥ 0,20 + nad GLB")[1];
    assert.ok(passFilters({ energy: 0.25, glb_state: "SYGNAŁ" }, f) && !passFilters({ energy: 0.15, glb_state: "SYGNAŁ" }, f) && !passFilters({ energy: 0.3, glb_state: "POD" }, f));
});

test("SMA 10 > 30 filter and preset", () => {
    const { passFilters, filterValue, FILTER_PRESETS } = require("../../docs/js/app.js");
    assert.strictEqual(filterValue({ trend: true }, "trend"), "tak");
    assert.strictEqual(filterValue({ trend: null }, "trend"), "nie");
    const f = FILTER_PRESETS.find(([n]) => n.startsWith("Przebicie GLB + SMA 10 > 30"))[1];
    assert.ok(passFilters({ trend: true, glb_state: "NAD" }, f) && !passFilters({ trend: false, glb_state: "NAD" }, f));
});

test("fundamentals are not a table column", () => {
    const { COLUMNS, TEXT_COLS } = require("../../docs/js/app.js");
    assert.ok(!COLUMNS.some(([key]) => key === "fundamentals"));
    assert.ok(!TEXT_COLS.includes("fundamentals"));
});
