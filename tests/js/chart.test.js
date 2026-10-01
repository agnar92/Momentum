// Testy czystej logiki docs/js/chart.js (model i skale wykresu w stylu MarketSmith).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    niceTicks, makeYScale, numericExtent, weekIndexForDate, buildChartModel, chartSvg, chartReadout, polyline,
} = require(path.join("..", "..", "docs", "js", "chart.js"));

const WEEKS = ["2026-01-02", "2026-01-09", "2026-01-16", "2026-04-03", "2026-07-03"];

function charts(over = {}) {
    return {
        weeks: WEEKS, spx: [100, 101, 102, 103, 104],
        stocks: {
            AAA: {
                o: [10, 11, 12, 13, 14], h: [11, 12, 13, 14, 15], l: [9, 10, 11, 12, 13], c: [10.5, 11.5, null, 13.5, 14.5],
                v: [1000, 2000, 1500, 1800, 2500], sma10: [null, null, 11, 12, 13], sma40: [null, null, null, null, 12],
                eps: [{ d: "2025-10-01", e: 1.0, g: null }, { d: "2026-01-10", e: 1.2, g: 20 }, { d: "2026-07-01", e: 1.6, g: 33 }],
                eps_next: { d: "2026-10-20", e: 1.8 },
            },
        },
        ...over,
    };
}

test("niceTicks returns round steps inside the range", () => {
    assert.deepEqual(niceTicks(0, 100, 5), [0, 20, 40, 60, 80, 100]);
    assert.deepEqual(niceTicks(3, 47, 4), [20, 40]);
    assert.deepEqual(niceTicks(5, 5), [5]);
    assert.deepEqual(niceTicks(NaN, 1), []);
});

test("makeYScale maps larger values higher (smaller y) inside the box", () => {
    const y = makeYScale(0, 10, 100, 200);
    assert.equal(y(0), 300);
    assert.equal(y(10), 100);
    assert.equal(y(5), 200);
});

test("numericExtent ignores nulls and returns null for empty input", () => {
    assert.deepEqual(numericExtent([[1, null, 5], [3, NaN]]), [1, 5]);
    assert.equal(numericExtent([[null], []]), null);
});

test("weekIndexForDate picks the first week ending on or after the date, -1 after the window", () => {
    assert.equal(weekIndexForDate(WEEKS, "2026-01-02"), 0);
    assert.equal(weekIndexForDate(WEEKS, "2026-01-10"), 2);
    assert.equal(weekIndexForDate(WEEKS, "2025-10-01"), 0);
    assert.equal(weekIndexForDate(WEEKS, "2026-07-04"), -1);
    assert.equal(weekIndexForDate([], "2026-01-01"), -1);
});

test("buildChartModel: RS line = price / benchmark, EPS quarters mapped to weeks, last bar index", () => {
    const m = buildChartModel(charts(), "AAA", { rs_rating: 94 });
    assert.equal(m.n, 5);
    assert.equal(m.rs[0], 10.5 / 100);
    assert.equal(m.rs[2], null);                         // brak ceny => brak RS
    assert.equal(m.lastIdx, 4);
    assert.equal(m.rsRating, 94);
    assert.deepEqual(m.eps.map(q => q.week), [0, 2, 4]);  // 2026-01-10 -> tydzień 2026-01-16 (indeks 2)
    assert.deepEqual(m.epsNext, { d: "2026-10-20", e: 1.8 });
    assert.equal(buildChartModel(charts(), "ZZZ", null), null);
});

test("buildChartModel works without a benchmark (no RS line)", () => {
    const m = buildChartModel(charts({ spx: null }), "AAA", null);
    assert.ok(m.rs.every(v => v === null));
    assert.equal(m.rsRating, null);
});

test("chartSvg renders bars, benchmark, RS label, EPS labels and handles empty EPS", () => {
    const svg = chartSvg(buildChartModel(charts(), "AAA", { rs_rating: 94 }));
    assert.match(svg, /^<svg id="chartSvg"/);
    assert.match(svg, /S&amp;P 500/);
    assert.match(svg, /RS Rating 94/);
    assert.match(svg, />\+33%</);
    const noEps = charts();
    noEps.stocks.AAA.eps = [];
    assert.match(chartSvg(buildChartModel(noEps, "AAA", null)), /Brak danych o EPS/);
    assert.match(chartSvg(buildChartModel(charts({ spx: null }), "AAA", null)), /Brak danych benchmarku/);
});

test("chartReadout formats a week and is empty for missing bars", () => {
    const m = buildChartModel(charts(), "AAA", null);
    assert.match(chartReadout(m, 0), /2026-01-02 · O 10\.00 H 11\.00 L 9\.00 C 10\.50/);
    assert.equal(chartReadout(m, 2), "");
    assert.equal(chartReadout(m, 99), "");
});

test("polyline breaks the line on gaps", () => {
    const out = polyline([[0, 0], [1, 1], null, [3, 3], [4, 4], null, [6, 6]], "#fff");
    assert.equal((out.match(/<polyline/g) || []).length, 2);   // pojedynczy punkt nie tworzy linii
});
