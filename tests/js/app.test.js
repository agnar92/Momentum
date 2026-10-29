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
    { ticker: "A", company: "Alpha", ok: true, glb_state: "POD", glb_pct: -3, dopm: 9 },
    { ticker: "B", company: "Beta", ok: true, glb_state: "SYGNAŁ", glb_pct: 6, dopm: 4 },
    { ticker: "C", company: "Gamma", ok: false, glb_state: "WYBICIE", glb_pct: 2, dopm: 20 },
    { ticker: "D", company: "Delta", ok: true, glb_state: "NAD", glb_pct: 14, dopm: null },
];

test("default order like desktop: conditions + signal, then conditions, then nearest the Green Line", () => {
    assert.deepStrictEqual(visibleRows(ROWS, {}).map((r) => r.ticker), ["B", "A", "D", "C"]);
    assert.ok(isSignal(ROWS[1]) && isSignal(ROWS[2]) && !isSignal(ROWS[3]));
    const two = [{ ticker: "X", ok: true, glb_state: "SYGNAŁ", glb_pct: 8 }, { ticker: "Y", ok: true, glb_state: "WYBICIE", glb_pct: 1 }];
    assert.deepStrictEqual(visibleRows(two, {}).map((r) => r.ticker), ["Y", "X"]);
});
test("signal only 0–10 % above the Green Line; Blue Dot is informational", () => {
    assert.ok(!isSignal({ glb_state: "WYBICIE", glb_pct: 14 }));
    assert.ok(!isSignal({ glb_state: "BLUE DOT", glb_pct: 15 }));
    assert.ok(!isSignal({ glb_state: "POD" }));
});

test("rules preset: signal 0–10 % and conditions", () => {
    const { passFilters, FILTER_PRESETS } = require("../../docs/js/app.js");
    const f = FILTER_PRESETS[0][1];
    assert.deepStrictEqual(ROWS.filter((r) => passFilters(r, f)).map((r) => r.ticker), ["B"]);
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

test("default order: same distance to the line -> higher RS 52 weeks first", () => {
    const rows = [{ ticker: "A", ok: true, glb_state: "SYGNAŁ", glb_pct: 5, rs: 10 }, { ticker: "B", ok: true, glb_state: "SYGNAŁ", glb_pct: 5, rs: 90 }];
    assert.deepStrictEqual(visibleRows(rows, {}).map((r) => r.ticker), ["B", "A"]);
});
test("columns and presets like the desktop app", () => {
    const { FILTER_PRESETS, COLUMNS } = require("../../docs/js/app.js");
    const keys = COLUMNS.map(([k]) => k);
    for (const k of ["sector_rs", "eps_rating", "pattern", "pattern_pct", "peg", "pegy", "dgm", "quarter", "cc52w", "ok", "slow"]) assert.ok(keys.includes(k), k);
    for (const k of ["vol52", "rs_rating", "blb", "blb_state"]) assert.ok(!keys.includes(k), k);
    assert.strictEqual(FILTER_PRESETS.length, 10);
    assert.strictEqual(cell(0.987, "x2"), "0.99");
    assert.strictEqual(cell(83.4, "i"), "83");
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

test("RWB weeks column sorts ascending first and number columns get from–to filters (EPS Rating, RVol, RWB)", () => {
    const { COLUMNS, NUMERIC_FORMATS, passFilters } = require("../../docs/js/app.js");
    const keys = COLUMNS.map(([k]) => k);
    assert.ok(keys.includes("rwb_weeks") && !keys.includes("rvol_d"));
    const numeric = COLUMNS.filter(([, , f]) => NUMERIC_FORMATS.includes(f)).map(([k]) => k);
    for (const k of ["eps_rating", "rwb_weeks", "rvol_w", "ps", "peg", "pegy", "cc52w"]) assert.ok(numeric.includes(k), k);
    assert.ok(!numeric.includes("ticker") && !numeric.includes("ok"));
    assert.ok(passFilters({ eps_rating: 85 }, { eps_rating: { min: 80, max: 99 } }) && !passFilters({ eps_rating: 70 }, { eps_rating: { min: 80 } }));
    assert.ok(!passFilters({ rwb_weeks: null }, { rwb_weeks: { min: 0 } }));   // puste = brak RWB
    assert.strictEqual(cell(3, "i"), "3");
});

test("skaner CEM10: domyślna kolejność = ranking po momentum 12-1, reszta po staremu", () => {
    const rows = [{ ticker: "C", cem_rank: 3, mom121: 50 }, { ticker: "A", cem_rank: 1, mom121: 90 }, { ticker: "B", cem_rank: 2, mom121: 70 }];
    assert.deepStrictEqual(visibleRows(rows, {}).map((r) => r.ticker), ["A", "B", "C"]);
    assert.deepStrictEqual(visibleRows(rows, { sort: { key: "mom121", dir: -1 } }).map((r) => r.ticker), ["A", "B", "C"]);
});
