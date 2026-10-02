// Testy czystej logiki docs/js/chart.js (model i skale wykresu w stylu MarketSmith).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    patternExplain, defaultWindowLength, niceTicks, makeYScale, makeLogScale, logTicks, numericExtent, sliceModel, rsNewHighFlags, rollingMean, weekIndexForDate, buildChartModel, chartSvg, chartReadout, polyline,
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
                tl: { lines: [{ kind: "res", x0: "2026-01-09", y0: 15, x1: "2026-07-03", y1: 15, touches: 3 },
                              { kind: "sup", x0: "2025-12-01", y0: 8, x1: "2026-07-03", y1: 12, touches: 2 }], pattern: "kanał", state: "wybicie" },
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
    assert.match(svg, /Rating 94/);
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
    assert.match(chartSvg(m, { log: true }), /skala log\./);
    assert.doesNotMatch(chartSvg(m, {}), /skala log\./);
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
    assert.match(wide, /viewBox="0 0 1000 710"/);
    assert.match(compact, /viewBox="0 0 560 800"/);
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

test("buildChartModel maps trend lines to indexes; sliceModel shifts and drops them", () => {
    const m = buildChartModel(charts(), "AAA", null);
    assert.deepEqual(m.lines.map(l => [l.kind, l.i0, l.i1]), [["res", 1, 4], ["sup", 0, 4]]);
    assert.deepEqual(m.trend, { pattern: "kanał", state: "wybicie", breakout: null, info: null });
    const s = sliceModel(m, 2);
    assert.deepEqual(s.lines.map(l => [l.i0, l.i1]), [[-2, 1], [-3, 1]]);
    assert.equal(s.smas[0].values.length, 2);
    assert.equal(s.volAvg.length, 2);
});

test("chartSvg draws trend lines, breakout marker and a legend strip", () => {
    const svg = chartSvg(buildChartModel(charts(), "AAA", { rs_rating: 90 }));
    assert.match(svg, /Opór \(3 dotknięć\)/);
    assert.match(svg, /Wsparcie \(2 dotknięć\)/);
    assert.match(svg, /wybicie z linii trendu/);
    assert.match(svg, /SMA 10 tyg\./);
    assert.match(svg, /średnia 10 tyg\./);
});

test("dailyCharts: SMA 10/20, oś = dni, wyniki sprzed okna pominięte", () => {
    const { dailyCharts, buildChartModel } = require("../../docs/js/chart.js");
    const charts = {
        weeks: ["2026-01-02"], days: ["2026-01-01", "2026-01-02"], spx_d: [100, 101],
        stocks: { X: { c: [1], day: { o: [1, 2], h: [1, 2], l: [1, 2], c: [1, 2], v: [1, 1], sma10: [1, 2], sma20: [1, 1.8] }, eps: [{ d: "2025-06-01", e: 1, g: null }, { d: "2026-01-02", e: 2, g: 5 }], eps_next: null } },
    };
    const d = dailyCharts(charts);
    assert.strictEqual(d.daily, true);
    const m = buildChartModel(d, "X", null);
    assert.strictEqual(m.n, 2);
    assert.deepStrictEqual(m.smas.map(x => x.label), ["SMA 10", "SMA 20"]);
    assert.deepStrictEqual(m.eps.map(q => q.week), [1]);
    assert.strictEqual(dailyCharts({ weeks: [] }), null);
});

test("cup base is drawn as an arc with the depth label; indexes shift with sliceModel", () => {
    const c = charts();
    c.stocks.AAA.bases = [{ start: "2026-01-09", low_date: "2026-01-16", end: "2026-07-03", peak: 15, low: 11, end_close: 14, depth_pct: 26.7, type: "cup", open: false },
                          { start: "2026-01-09", low_date: "2026-01-16", end: "2026-07-03", peak: 15, low: 13, depth_pct: 13, type: "flat", open: false }];
    const m = buildChartModel(c, "AAA", null);
    assert.deepEqual(m.cups.map(x => [x.i0, x.iLow, x.i1]), [[1, 2, 4]]);   // tylko typ cup
    const svg = chartSvg(m);
    assert.match(svg, /−26\.7%<\/text>/);
    assert.match(svg, /<title>Cup −26\.7%<\/title>/);
    assert.deepEqual(sliceModel(m, 2).cups.map(x => [x.i0, x.iLow, x.i1]), [[-2, -1, 1]]);
});

test("legend shows breakout volume confirmation", () => {
    const c = charts();
    c.stocks.AAA.tl.breakout = { date: "2026-07-03", vol_ratio: 2.1, confirmed: true };
    assert.match(chartSvg(buildChartModel(c, "AAA", null)), /wolumen ×2\.1 śr\. ✓ potwierdzone/);
    c.stocks.AAA.tl.breakout = { date: "2026-07-03", vol_ratio: 0.8, confirmed: false };
    assert.match(chartSvg(buildChartModel(c, "AAA", null)), /bez potwierdzenia/);
});

test("clampWindow i sliceModel(m, n, end) wycinają okno z historii", () => {
    const { clampWindow } = require("../../docs/js/chart.js");
    assert.deepEqual(clampWindow(null, 100, 52), { n: 52, end: 100 });
    assert.deepEqual(clampWindow({ n: 5, end: 500 }, 100, 52), { n: 15, end: 100 });
    assert.deepEqual(clampWindow({ n: 40, end: 10 }, 100, 52), { n: 40, end: 40 });
});

test("RS dots use precomputed 52-week highs; RS leading price gets a larger ring; legend shows relative change", () => {
    const c = charts();
    Object.assign(c.stocks.AAA, { rs_hi: [0, 0, 0, 1, 1], px_hi: [0, 0, 0, 0, 1], rs_line: { state: "przed ceną", dist_pct: -1 } });
    const m = buildChartModel(c, "AAA", { rs_rating: 90 });
    assert.deepEqual(m.rsNewHigh, [false, false, false, true, true]);
    const svg = chartSvg(m);
    assert.match(svg, /RS przed ceną/);
    assert.match(svg, /vs S&amp;P w oknie/);
    assert.match(svg, /RS na maks\. przed ceną/);
});

test("patternExplain describes the flag, volume dry-up and breakout; pole is drawn", () => {
    const c = charts();
    c.stocks.AAA.tl = {
        lines: c.stocks.AAA.tl.lines, pattern: "flaga", state: "wybicie",
        breakout: { date: "2026-07-03", vol_ratio: 2.3, confirmed: true },
        info: { type: "flaga", pole_gain: 34, pole_start: "2026-01-09", pole_end: "2026-04-03", pole_low: 11, pole_high: 15, length: 14, depth: 8.2, vol_ratio: 0.6, touches: 3 },
    };
    const m = buildChartModel(c, "AAA", null);
    const txt = patternExplain(m);
    assert.match(txt, /Flaga: maszt \+34%/);
    assert.match(txt, /schnie — dobry znak/);
    assert.match(txt, /potwierdzone/);
    assert.match(chartSvg(m), /maszt \+34%/);
    assert.equal(patternExplain(buildChartModel(charts(), "AAA", null)), "");   // brak info => brak opisu
    c.stocks.AAA.tl = null;
    assert.equal(patternExplain(buildChartModel(c, "AAA", null)), "");
});

test("defaultWindowLength prefers the remembered length, else built-in defaults", () => {
    assert.equal(defaultWindowLength({ daily: true, n: 252 }, {}), 42);
    assert.equal(defaultWindowLength({ daily: true, n: 252 }, { windowLen: 120 }), 120);
    assert.equal(defaultWindowLength({ daily: false, n: 104 }, {}), 104);
    assert.equal(defaultWindowLength({ daily: false, n: 104 }, { compact: true }), 52);
    assert.equal(defaultWindowLength({ daily: true, n: 252 }, { windowLen: 0 }), 42);   // zły zapis => domyślne
});

test("futureDates skips weekends for daily and steps by week otherwise", () => {
    const { futureDates } = require("../../docs/js/chart.js");
    assert.deepEqual(futureDates("2026-10-01", 4, true), ["2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"]);   // czwartek -> pt, pn, wt, śr
    assert.deepEqual(futureDates("2026-10-01", 2, false), ["2026-10-08", "2026-10-15"]);
});

test("buildChartModel with pad adds empty future slots to every array; defaults show only a little of them", () => {
    const m = buildChartModel(charts(), "AAA", null, { pad: true });
    assert.equal(m.pad, 4);
    assert.equal(m.n, 5 + 4);
    [m.o, m.h, m.l, m.c, m.v, m.rs, m.volAvg, m.rsNewHigh, m.spx, ...m.smas.map(x => x.values)].forEach(a => assert.equal(a.length, 9));
    assert.equal(m.c[8], null);
    assert.equal(m.lastIdx, 4);                                        // ostatnia prawdziwa świeca
    assert.equal(m.weeks[5], "2026-07-10");                            // kolejne tygodnie po 2026-07-03
    assert.equal(defaultWindowLength(m, {}), 5 - 0 + 1);               // tygodniowo: całość prawdziwych świec + 1 puste
    const s = sliceModel(m, 3, 6);                                     // okno kończy się 1 puste miejsce po ostatniej świecy
    assert.equal(s.lastShown, true);
    assert.equal(sliceModel(m, 3, 3).lastShown, false);                // okno kończy się przed ostatnią świecą
    assert.equal(require("../../docs/js/chart.js").clampWindow(null, 40, 20, 26).end, 26);
    assert.ok(chartSvg(s).includes("<svg"));                           // pusta prawa strona rysuje się bez błędów
});

test("a cup that started before the first bar is kept with negative indexes (partial arc), not dropped", () => {
    const c = charts();
    c.stocks.AAA.bases = [{ start: "2025-11-28", low_date: "2025-12-26", end: "2026-01-16", peak: 15, low: 11, end_close: 14, depth_pct: 26.7, type: "cup", open: false }];
    const m = buildChartModel(c, "AAA", null);
    assert.equal(m.cups.length, 1);
    assert.ok(m.cups[0].i0 < 0 && m.cups[0].iLow < 0 && m.cups[0].i1 === 2);
    assert.match(chartSvg(m), /<title>Cup −26\.7%<\/title>/);
});

test("SMA colours differ from the candle colours", () => {
    const m = buildChartModel(charts(), "AAA", null);
    m.smas.forEach(x => assert.ok(!["#2ecc71", "#3fbf6e", "#e0455a"].includes(x.color)));
});

test("pickLayout: compact wins, wide for full screen, default otherwise; wide layout renders", () => {
    const { pickLayout, CHART_LAYOUT, CHART_LAYOUT_WIDE } = require("../../docs/js/chart.js");
    assert.equal(pickLayout({}), CHART_LAYOUT);
    assert.equal(pickLayout({ wide: true }), CHART_LAYOUT_WIDE);
    assert.notEqual(pickLayout({ compact: true, wide: true }), CHART_LAYOUT_WIDE);
    assert.match(chartSvg(buildChartModel(charts(), "AAA", null), { wide: true }), /viewBox="0 0 1600 800"/);
});

test("fitLayout fills the requested box: panels stack in order and fit the height; narrow cells get a two-row legend", () => {
    const { fitLayout } = require("../../docs/js/chart.js");
    const L = fitLayout(620, 600);
    assert.equal(L.width, 620);
    assert.ok(L.height >= 590 && L.height <= 612, String(L.height));
    assert.ok(L.bench.y < L.legend.y && L.legend.y < L.price.y && L.price.y < L.volume.y && L.volume.y < L.eps.y && L.eps.y < L.axisY);
    assert.ok(L.price.h > L.volume.h && L.price.h > L.eps.h);
    assert.equal(fitLayout(500, 600).legendRows, 2);
    assert.equal(L.legendRows, 1);
    assert.equal(fitLayout(900, 400).legendRows, 1);
    const svg = chartSvg(buildChartModel(charts(), "AAA", null), { fit: { w: 620, h: 600 } });
    assert.match(svg, new RegExp(`viewBox="0 0 620 ${L.height}"`));
});

const EST = {
    f: "2026-10-02", pt: { low: 46, mean: 60, median: 61, high: 74 },
    p: {
        "0y": { avg: 1.2, n: 6, u30: 5, d30: 0, h: [["2026-07-04", 0.8], ["2026-09-02", 1.0], ["2026-10-02", 1.2]] },
        "+1y": { avg: 1.3, n: 6, h: [["2026-07-04", 1.5], ["2026-10-02", 1.3]] },
    },
};

test("estimateChange / estimateSeries / estimateText summarise price targets and EPS revisions", () => {
    const { estimateChange, estimateSeries, estimateText } = require("../../docs/js/chart.js");
    assert.equal(Math.round(estimateChange(EST.p["0y"].h, 90)), 50);          // 0.8 -> 1.2
    assert.equal(Math.round(estimateChange(EST.p["0y"].h, 30)), 20);          // 1.0 -> 1.2
    assert.equal(estimateChange([["2026-10-02", 1]], 30), null);
    assert.deepEqual(estimateSeries(EST).map(s => s.key), ["0y", "+1y"]);
    assert.equal(estimateSeries({ p: { "0y": { h: [["2026-10-02", 1]] } } }).length, 0);   // jeden punkt to jeszcze nie linia
    const t = estimateText(EST, 50);
    assert.match(t, /Cena celu: śr\. \$60 \(\+20\.0%\), zakres \$46–\$74/);
    assert.match(t, /EPS bież\. rok: 1\.2 \(30d \+20\.0%, 90d \+50\.0%, rewizje 30d ↑5 ↓0\), 6 analityków/);
    assert.match(estimateText(null, 50), /Brak estymat/);
});

test("chartSvg draws the price-target bracket and the consensus EPS panel only when estimates are given", () => {
    const m = buildChartModel(charts(), "AAA", null);
    const off = chartSvg(m, {});
    assert.ok(!/Konsensus EPS/.test(off) && !/Cena celu analityków/.test(off));
    const on = chartSvg(m, { estimates: EST });
    assert.match(on, /Cena celu analityków: śr\. \$60/);
    assert.match(on, /Konsensus EPS \(zmiana %\)/);
    assert.match(on, /\+50%/);                                                  // koniec linii bieżącego roku względem początku historii
    const clipped = chartSvg(m, { estimates: { ...EST, pt: { low: 5, mean: 60, median: 60, high: 900 } } });
    assert.match(clipped, /↑ \$900/);                                          // skrajny cel przycięty w skali, prawdziwa wartość w etykiecie
    assert.match(clipped, /↓ \$5/);
});
