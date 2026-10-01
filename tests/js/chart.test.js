// Testy czystej logiki docs/js/chart.js (model i skale wykresu w stylu MarketSmith).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    niceTicks, makeYScale, makeLogScale, logTicks, numericExtent, sliceModel, rsNewHighFlags, rollingMean, weekIndexForDate, buildChartModel, chartSvg, chartReadout, polyline,
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
                bases: [{ start: "2026-01-09", end: "2026-04-03", peak: 15, low: 11, depth_pct: 26.7, weeks: 5, type: "cup", open: false, pivot: 15, contractions: [12.0, 6.5], vcp: true },
                        { start: "2026-04-03", end: "2026-07-03", peak: 15, low: 13, depth_pct: 13.3, weeks: 4, type: "flat", open: true, pivot: 15, contractions: [], vcp: false }],
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

test("makeLogScale gives equal distances for equal ratios", () => {
    const y = makeLogScale(1, 100, 0, 200);
    assert.ok(Math.abs(y(1) - 200) < 1e-9 && Math.abs(y(100)) < 1e-9);
    assert.ok(Math.abs((y(1) - y(10)) - (y(10) - y(100))) < 1e-9);
});

test("logTicks uses 1/2/5 steps and falls back to denser steps for narrow ranges", () => {
    assert.deepEqual(logTicks(1, 1000), [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]);
    assert.ok(logTicks(100, 150).length >= 3);
    assert.deepEqual(logTicks(0, 10), []);
});

test("chartSvg in log mode labels the scale and keeps rendering bars", () => {
    const m = buildChartModel(charts(), "AAA", null);
    assert.match(chartSvg(m, { log: true }), /skala logarytmiczna/);
    assert.doesNotMatch(chartSvg(m, {}), /skala logarytmiczna/);
});

test("sliceModel keeps the last n weeks and shifts EPS weeks, dropping those cut off", () => {
    const m = buildChartModel(charts(), "AAA", null);          // 5 tygodni, EPS na tygodniach 0, 2, 4
    const s = sliceModel(m, 3);
    assert.equal(s.n, 3);
    assert.deepEqual(s.weeks, WEEKS.slice(2));
    assert.deepEqual(s.eps.map(q => q.week), [0, 2]);            // dawny tydzień 0 odcięty, 2 -> 0, 4 -> 2
    assert.equal(s.lastIdx, 2);
    assert.equal(s.c.length, 3);
    assert.equal(sliceModel(m, 10), m);                          // krótszy niż okno => bez zmian
});

test("chartSvg compact layout uses the narrow viewBox and larger fonts", () => {
    const m = buildChartModel(charts(), "AAA", { rs_rating: 94 });
    const wide = chartSvg(m, {});
    const compact = chartSvg(m, { compact: true });
    assert.match(wide, /viewBox="0 0 1000 690"/);
    assert.match(compact, /viewBox="0 0 560 740"/);
    assert.match(wide, /font-size="11"/);
    assert.match(compact, /font-size="16\.5"/);
});

test("rsNewHighFlags marks only new window highs after the warm-up weeks", () => {
    const rs = Array.from({ length: 20 }, (_, i) => (i === 14 ? 0.5 : 1 + i * 0.1));   // rośnie, jedno wklęśnięcie w tyg. 14
    const flags = rsNewHighFlags(rs);
    assert.equal(flags[5], false);                 // za wcześnie (rozgrzewka)
    assert.equal(flags[12], true);
    assert.equal(flags[14], false);                // spadek, nie maksimum
    assert.equal(flags[19], true);
    assert.deepEqual(rsNewHighFlags([null, 1]).slice(0, 2), [false, false]);
});

test("rollingMean needs a full finite window", () => {
    assert.deepEqual(rollingMean([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
    assert.deepEqual(rollingMean([1, null, 3, 4], 2), [null, null, null, 3.5]);
});

test("buildChartModel maps bases to week indexes; sliceModel shifts and drops them", () => {
    const m = buildChartModel(charts(), "AAA", null);
    assert.deepEqual(m.bases.map(b => [b.i0, b.i1]), [[1, 3], [3, 4]]);   // koniec w 2026-07-03 = ostatni tydzień
    const s = sliceModel(m, 2);                                          // zostają tygodnie 3-4
    assert.deepEqual(s.bases.map(b => [b.i0, b.i1]), [[0, 0], [0, 1]]);
    assert.equal(s.volAvg.length, 2);
    assert.equal(s.rsNewHigh.length, 2);
});

test("chartSvg draws base boxes with depth/VCP label and a pivot line for the open base", () => {
    const svg = chartSvg(buildChartModel(charts(), "AAA", { rs_rating: 90 }));
    assert.match(svg, /Cup base −26\.7% · 5 tyg\. · VCP/);
    assert.match(svg, /Flat base −13\.3% · 4 tyg\./);
    assert.match(svg, /pivot 15\.00 \(/);
    assert.match(svg, /średnia 10 tyg\./);
});
