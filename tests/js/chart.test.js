// Testy czystej logiki docs/js/chart.js (model i skale wykresu w stylu MarketSmith).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    patternExplain, defaultWindowLength, niceTicks, epsMultiple, makeYScale, makeLogScale, logTicks, numericExtent, sliceModel, rsNewHighFlags, rollingMean, weekIndexForDate, buildChartModel, chartSvg, chartReadout, polyline, pivotFromStock, swingLabels, volumeSpikes, fmtVol,
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

test("buildChartModel with patterns: false drops bases, flags, pivot, climax and the book annotations but keeps SMA / EPS / volume", () => {
    const ch = charts();
    ch.stocks.AAA.bases = [{ type: "flat", start: "2026-01-02", end: "2026-01-30", pivot: 11, weeks: 5, low: 9, open: true }];
    ch.stocks.AAA.tl = { pattern: "flaga", state: "wybicie", lines: [], info: null };
    ch.stocks.AAA.climax = { date: "2026-01-30" };
    const on = buildChartModel(ch, "AAA", { price: 11, base_type: "flat", pivot: 11 });
    const off = buildChartModel(ch, "AAA", { price: 11, base_type: "flat", pivot: 11 }, { patterns: false });
    assert.ok(on.trend && on.climax && on.book);
    assert.equal(off.trend, null); assert.equal(off.climax, null); assert.equal(off.book, null); assert.equal(off.pivot, null);
    assert.deepEqual(off.cups, []); assert.deepEqual(off.lines, []);
    assert.equal(off.eps.length, on.eps.length); assert.equal(off.v.length, on.v.length);
});

test("buildChartModel works without a benchmark (no RS line)", () => {
    const m = buildChartModel(charts({ spx: null }), "AAA", null);
    assert.ok(m.rs.every(v => v === null));
    assert.equal(m.rsRating, null);
});

test("chartSvg renders bars, S&P 500 overlay, RS label, EPS labels and handles empty EPS", () => {
    const svg = chartSvg(buildChartModel(charts(), "AAA", { rs_rating: 94 }));
    assert.match(svg, /^<svg id="chartSvg"/);
    assert.match(svg, /S&amp;P 500/);
    assert.match(svg, /Rating 94/);
    assert.match(svg, />\+33%</);
    const noEps = charts();
    noEps.stocks.AAA.eps = [];
    assert.match(chartSvg(buildChartModel(noEps, "AAA", null)), /Brak danych o EPS/);
    assert.doesNotMatch(chartSvg(buildChartModel(charts({ spx: null }), "AAA", null)), /S&amp;P 500 \d/);   // bez benchmarku nie ma linii
});

test("price bars are HLC: no open tick, colour by close vs previous close", () => {
    const m = buildChartModel(charts(), "AAA", null);
    const svg = chartSvg(m, {});
    const bars = svg.match(/<g stroke="[^"]+" stroke-width="[\d.]+"><line[^>]*\/><line[^>]*\/><\/g>/g) || [];
    assert.ok(bars.length > 0, "każdy słupek = pion H–L + kreska zamknięcia po obu stronach");
    assert.equal(bars.every(b => (b.match(/<line/g) || []).length === 2), true);
    // kreska zamknięcia sięga w lewo i w prawo od pionu (x1 < x pionu < x2)
    const [, v, tick] = bars[0].match(/<line x1="([\d.-]+)" x2="\1"[^>]*\/><line x1="([\d.-]+)" x2="([\d.-]+)"/) ? [0, bars[0].match(/<line x1="([\d.-]+)" x2="\1"/)[1], bars[0].match(/<line x1="([\d.-]+)" x2="([\d.-]+)"[^>]*\/><\/g>/)] : [];
    assert.ok(Number(tick[1]) < Number(v) && Number(v) < Number(tick[2]));
});

test("chartReadout formats a week and is empty for missing bars", () => {
    const m = buildChartModel(charts(), "AAA", null);
    assert.match(chartReadout(m, 0), /2026-01-02 · H 11\.00 L 9\.00 C 10\.50/);
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

test("cup base is drawn as an arc with the depth label; indexes shift with sliceModel", () => {
    const c = charts();
    c.stocks.AAA.bases = [{ start: "2026-01-09", low_date: "2026-01-16", end: "2026-07-03", peak: 15, low: 11, end_close: 14, depth_pct: 26.7, type: "cup", open: false },
                          { start: "2026-01-09", low_date: "2026-01-16", end: "2026-07-03", peak: 15, low: 13, depth_pct: 13, type: "flat", open: false }];
    const m = buildChartModel(c, "AAA", null);
    assert.deepEqual(m.cups.map(x => [x.i0, x.iLow, x.i1]), [[1, 2, 4]]);   // tylko typ cup
    const svg = chartSvg(m, { book: true });
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
    assert.equal(defaultWindowLength({ n: 312 }, {}), 156);                       // 3 lata z 6 dostępnych
    assert.equal(defaultWindowLength({ n: 312 }, { windowLen: 120 }), 120);
    assert.equal(defaultWindowLength({ n: 104 }, {}), 104);
    assert.equal(defaultWindowLength({ n: 104 }, { compact: true }), 52);
    assert.equal(defaultWindowLength({ n: 312 }, { windowLen: 0 }), 156);         // zły zapis => domyślne
});

test("futureDates steps by week", () => {
    const { futureDates } = require("../../docs/js/chart.js");
    assert.deepEqual(futureDates("2026-10-01", 2), ["2026-10-08", "2026-10-15"]);
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
    assert.match(chartSvg(m, { book: true }), /<title>Cup −26\.7%<\/title>/);
});

test("SMA colours differ from the candle colours", () => {
    const m = buildChartModel(charts(), "AAA", null);
    m.smas.forEach(x => assert.ok(!["#2ecc71", "#3fbf6e", "#e0455a"].includes(x.color)));
});

test("pickLayout: compact wins, wide for full screen, default otherwise; wide layout renders", () => {
    const { pickLayout, CHART_LAYOUT, CHART_LAYOUT_WIDE } = require("../../docs/js/chart.js");
    assert.equal(pickLayout({ estimates: {} }), CHART_LAYOUT);          // tryb estymat zachowuje duży dolny panel
    const plain = pickLayout({});
    assert.equal(plain.height, CHART_LAYOUT.height);                    // ta sama wysokość całości…
    assert.ok(plain.eps.h < 60 && plain.price.h > CHART_LAYOUT.price.h);   // …ale dolny panel to tylko tabela, a wykres cen jest wyższy
    assert.equal(plain.axisY, CHART_LAYOUT.axisY);                      // oś czasu nie przesuwa się
    assert.ok(plain.volume.y + plain.volume.h < plain.eps.y && plain.eps.y + plain.eps.h < plain.axisY);
    assert.equal(pickLayout({ wide: true, estimates: {} }), CHART_LAYOUT_WIDE);
    assert.notEqual(pickLayout({ compact: true, wide: true }), CHART_LAYOUT_WIDE);
    assert.match(chartSvg(buildChartModel(charts(), "AAA", null), { wide: true }), /viewBox="0 0 1600 800"/);
});

test("fitLayout fills the requested box: panels stack in order and fit the height; narrow cells get a two-row legend", () => {
    const { fitLayout } = require("../../docs/js/chart.js");
    const L = fitLayout(620, 600);
    assert.equal(L.width, 620);
    assert.ok(L.height >= 590 && L.height <= 612, String(L.height));
    assert.equal(L.bench.h, 0);                                                        // S&P 500 nie ma osobnego paska (nałożony na cenę)
    assert.ok(L.legend.y < L.price.y && L.price.y < L.volume.y && L.volume.y < L.eps.y && L.eps.y < L.axisY);
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

test("swingLabels picks the most important local highs and lows and keeps them apart", () => {
    const h = [10, 11, 12, 11, 10, 11, 14, 11, 10, 11, 12, 13, 12, 11, 10];
    const l = h.map(v => v - 2);
    const sw = swingLabels(h, l, h.length - 1, 2);
    const highs = sw.filter(s => s.type === "H");
    assert.equal(highs[0].price, 14);                                   // najwyższy szczyt pierwszy
    assert.ok(highs.every((a, i) => highs.every((b, j) => i === j || Math.abs(a.i - b.i) >= 4)));   // nie bliżej niż 2k
    assert.ok(sw.some(s => s.type === "L" && s.price === 8));            // dołek 8 przy świecy 4 albo 8
    assert.deepEqual(swingLabels([5, 5, 5], [4, 4, 4], 2, 1).filter(s => s.type === "H").length, 1);   // remis: tylko pierwsza świeca
});

test("volumeSpikes needs a clear multiple of the average and spacing; fmtVol uses K and M", () => {
    const v = [100, 100, 400, 100, 380, 100, 100, 100, 700, 100];
    const avg = v.map(() => 100);
    const got = volumeSpikes(v, avg, 3, 1.5, 3).map(s => s.i).sort((a, b) => a - b);
    assert.deepEqual(got, [2, 8]);                 // 400 i 380 są zbyt blisko — zostaje większy
    assert.deepEqual(volumeSpikes(v, avg.map(() => 1000), 3), []);
    assert.equal(fmtVol(14400), "14.4M");
    assert.equal(fmtVol(820), "820K");
});

test("pivotFromStock: base pivot from the open base start, else the flag resistance, else null", () => {
    const bases = [{ open: false, start: "2025-01-03" }, { open: true, start: "2026-03-06" }];
    assert.deepEqual(pivotFromStock({ base_type: "cup", pivot: 98.4 }, bases), { price: 98.4, date: "2026-03-06", kind: "baza", active: false, risky: true });
    assert.equal(pivotFromStock({ base_type: "cup", base_handle: true, pivot: 98.4 }, bases).risky, false);   // cup z rączką = bez ostrzeżenia, bez rączki = ryzykowny setup
    assert.equal(pivotFromStock({ base_type: "cup", pivot: 98.4, pivot_state: "wybicie" }, bases).active, true);   // pivot aktywny (wybicie na wolumenie) = zielona linia, nieaktywny = biała
    assert.deepEqual(pivotFromStock({ tlw_level: 50, tlw_state: "przy oporze" }, []), { price: 50, date: null, kind: "flaga", active: false });
    assert.equal(pivotFromStock({ tlw_level: 50 }, []), null);       // poziom bez wykrytego stanu nie jest pivotem
    assert.equal(pivotFromStock(null, []), null);
});

test("pivotFromStock ignores corrections / deep corrections and levels far from the price (STM: pivot 81 vs price 57)", () => {
    const stm = { base_type: "deep", pivot: 81.19, price: 57.26, tlw_level: 54.15, tlw_state: "wybicie" };
    assert.deepEqual(pivotFromStock(stm, []), { price: 54.15, date: null, kind: "flaga", active: true });          // nie 81,19: głęboka korekta to nie baza do zakupu
    assert.equal(pivotFromStock({ base_type: "correction", pivot: 60, price: 58 }, []), null);
    assert.equal(pivotFromStock({ base_type: "cup", pivot: 81.19, price: 57.26 }, []), null);       // kupowalna baza, ale 42 % od ceny
    assert.deepEqual(pivotFromStock({ base_type: "cup", pivot: 81.19, price: 57.26, tlw_level: 56, tlw_state: "przy oporze" }, []).price, 56);
    assert.deepEqual(pivotFromStock({ tlw_level: 20, tlw_state: "przy oporze", price: 19.5 }, []), { price: 20, date: null, kind: "flaga", active: false });
});

test("chartSvg: breakout triangle points up under the breakout bar; extended price drops the buy/stop zone; unconfirmed close gets no triangle", () => {
    const n = 30;
    const weeks = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 2) + i * 7 * 86400000).toISOString().slice(0, 10));
    const arr = f => weeks.map((_, i) => f(i));
    const mk = (breakout, price, tlState = "wybicie") => ({
        weeks, spx: arr(() => 5000), stocks: { X: {
            o: arr(i => 10 + i * 0.01), h: arr(i => 10.5 + i * 0.01), l: arr(i => 9.5 + i * 0.01), c: arr(i => (i === n - 1 ? price : 10 + i * 0.01)), v: arr(() => 100),
            sma10: arr(() => 10), sma40: arr(() => 10),
            tl: { lines: [{ kind: "res", x0: weeks[10], y0: 10.3, x1: weeks[n - 1], y1: 10.3, touches: 2 }], pattern: "korytarz", state: tlState, breakout, info: { type: "korytarz", length: 14, depth: 5, pole_gain: null, touches: 2 } },
            eps: [], bases: [] } } });
    const stock = { price: 10.6, tlw_level: 10.3, tlw_state: "wybicie" };
    const bo = { date: weeks[n - 3], vol_ratio: 2, confirmed: true };
    const m = buildChartModel(mk(bo, 10.6), "X", stock, { pad: true });
    const svg = chartSvg(m, {});
    const tri = svg.match(/<path d="M([\d.]+),([\d.]+) L([\d.]+),([\d.]+) L([\d.]+),([\d.]+) Z" fill="[^"]+"><title>Wybicie z linii trendu/);
    assert.ok(tri, "trójkąt wybicia istnieje");
    assert.ok(parseFloat(tri[4]) > parseFloat(tri[2]) && parseFloat(tri[6]) > parseFloat(tri[2]), "wierzchołek u góry — strzałka w górę");
    const xs = [...svg.matchAll(/<line x1="([\d.]+)" x2="\1" y1="[\d.]+" y2="[\d.]+" stroke="#22d3ee"/g)];
    assert.ok(xs.length === 1 && Math.abs(parseFloat(xs[0][1]) - parseFloat(tri[1])) < 0.2, "trójkąt stoi pod świecą tygodnia wybicia, nie pod ostatnią");
    assert.match(svg, />opór 10\.30</);                      // 10,6 vs 10,3 = +2,9 % — jeszcze w strefie zakupu: sam poziom, bez dopisku o cenie
    assert.match(svg, /strefa zakupu do \+5 %/);
    const far = chartSvg(buildChartModel(mk(bo, 11.0), "X", { price: 11.0, tlw_level: 10.3, tlw_state: "wybicie" }, { pad: true }), {});
    assert.match(far, /opór 10\.30 · cena \+6\.8%/);
    assert.doesNotMatch(far, /strefa zakupu|stop loss 5–8/);   // cena poza +5 %: bez strefy zakupu i stopu
    const weak = chartSvg(buildChartModel(mk({ ...bo, confirmed: false, vol_ratio: 0.7 }, 10.6, "bez wolumenu"), "X", stock, { pad: true }), {});
    assert.doesNotMatch(weak, /Wybicie z linii trendu: zamknięcie/);
    assert.match(weak, /nad linią, bez wolumenu ×0\.7</);
});


test("chartSvg: EPS marks strip, TTM line with dashed forecast, pivot zones and volume labels", () => {
    const c = charts();
    c.stocks.AAA.eps = [
        { d: "2025-10-01", e: 1.0, g: 10, t: null }, { d: "2026-01-10", e: 1.2, g: 20, t: 4.0 }, { d: "2026-04-01", e: 1.4, g: 25, t: 4.4 }, { d: "2026-07-01", e: 1.6, g: 33, t: 4.9 },
    ];
    c.stocks.AAA.eps_next = { d: "2026-10-20", e: 1.8, t: 5.1 };
    const m = buildChartModel(c, "AAA", { base_type: "flat", pivot: 14.9, tl_state: null }, { pad: true });
    const svg = chartSvg(m);
    assert.match(svg, /EPS \(4 kw\., TTM\) ┄ prognoza/);               // linia zysków jest NA wykresie cen i ma wpis w legendzie
    assert.doesNotMatch(svg, />EPS 4\.9</);                            // bez podpisu przy fioletowej linii: wartości EPS są w pasku pod wykresem
    assert.doesNotMatch(svg, /prog\. 5\.1/);                           // przerywany odcinek do prognozy zostaje, ale bez podpisu
    assert.match(svg, /stroke-dasharray="4 3"/);
    assert.match(svg, />\+33%</);                                      // etykieta r/r (pasek znaczników i tabela)
    assert.match(svg, /pivot 14\.90/);
    assert.match(svg, /strefa zakupu do \+5 %/);
    assert.match(svg, /stop loss 5–8 %/);
    const geom = {};
    chartSvg(m, { geomOut: geom });
    assert.ok(geom.L.marks.h > 0 && geom.L.eps.h < 60);               // pasek znaczników pod cenami, dolny panel tylko na tabelę
    const none = chartSvg(buildChartModel(charts(), "AAA", null, { pad: true }));
    assert.ok(!/pivot \d/.test(none));
});

test("window without a report explains the last known one instead of claiming there is no data", () => {
    const c = charts();
    c.stocks.AAA.eps = [{ d: "2026-01-10", e: 1.2, g: 20, t: null }];
    const m = buildChartModel(c, "AAA", null);
    const cut = sliceModel(m, 2, 5);                                  // okno bez raportu
    assert.equal(cut.eps.length, 0);
    assert.match(chartSvg(cut), /Brak raportu w oknie · ostatni 2026-01-10/);
});

test("fitLayout on a short screen drops the quarterly table so the price panel keeps the height (no S&P strip anywhere)", () => {
    const { fitLayout, pickLayout } = require("../../docs/js/chart.js");
    const tall = fitLayout(374, 600);
    assert.ok(tall.bench.h === 0 && tall.eps.h >= 36);
    const short = fitLayout(828, 262);
    assert.equal(short.bench.h, 0);
    assert.equal(short.eps.h, 0);
    assert.ok(short.price.h >= 100, String(short.price.h));
    assert.ok(short.height <= 262 + 6, String(short.height));                        // układ mieści się w dostępnym miejscu
    const L = pickLayout({ fit: { w: 828, h: 262 }, compact: true });
    assert.equal(L.eps.h, 0);                                                         // compactEpsPanel nie rusza zerowego panelu
    const svg = chartSvg(buildChartModel(charts(), "AAA", { rs_rating: 90 }), { fit: { w: 828, h: 262 }, compact: true, hideLabels: true });
    assert.ok(!/Brak danych benchmarku/.test(svg));
    assert.match(svg, /viewBox="0 0 828 /);
});

test("phone fit layout: viewBox equals the fitted pixel box (no scaling of a fixed 560x800 canvas)", () => {
    const svg = chartSvg(buildChartModel(charts(), "AAA", null), { fit: { w: 374, h: 560 }, compact: true, hideLabels: true });
    const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    assert.equal(Number(vb[1]), 374);
    assert.ok(Math.abs(Number(vb[2]) - 560) <= 16, vb[2]);
});

test("placeLabels: no overlaps, stays inside bounds, important labels win, low priority ones are dropped when there is no room", () => {
    const { placeLabels, labelBox } = require("../../docs/js/chart.js");
    const bounds = { x0: 0, x1: 200, y0: 0, y1: 100 };
    const mk = (text, x, y, prio, over = {}) => ({ text, x, y, anchor: "middle", size: 10, bold: false, prio, ...over });
    const out = placeLabels([mk("98.41", 100, 50, 2), mk("pivot 98.41", 100, 50, 9), mk("97.10", 100, 50, 2)], bounds);
    const shown = out.filter(l => !l.dropped);
    assert.equal(out[1].x, 100); assert.equal(out[1].y, 50);                  // priorytet 9 zostaje na swoim miejscu
    for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
        const a = labelBox(shown[i], shown[i].x, shown[i].y), b = labelBox(shown[j], shown[j].x, shown[j].y);
        assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, `${shown[i].text} nachodzi na ${shown[j].text}`);
    }
    const edge = placeLabels([mk("98.41 długa etykieta", 195, 3, 5, { anchor: "start" })], bounds)[0];
    const eb = labelBox(edge, edge.x, edge.y);
    assert.ok(eb.x1 <= 200 && eb.x0 >= 0 && eb.y0 >= 0, "etykieta wypchnięta w granice wykresu");
    const crowd = Array.from({ length: 60 }, () => mk("111.11", 100, 50, 1));
    const res = placeLabels(crowd, { x0: 80, x1: 120, y0: 40, y1: 60 });
    assert.ok(res.some(l => l.dropped), "gdy brak miejsca, najmniej ważne są pomijane");
    const must = placeLabels([mk("a", 50, 50, 9), mk("b", 50, 50, 9)], { x0: 40, x1: 60, y0: 45, y1: 55 });
    assert.ok(must.every(l => !l.dropped), "etykiety o prio >= 8 nigdy nie są pomijane");
});

test("pinchWindow zooms the time axis around the pinch centre; panWindow drags the window like a finance app", () => {
    const { pinchWindow, panWindow } = require("../../docs/js/chart.js");
    const start = { n: 60, end: 200, dist: 100, frac: 0.5 };
    const closer = pinchWindow(start, 200, 252);                      // palce rozsunięte 2× => okno 2× krótsze (przybliżenie)
    assert.equal(closer.n, 30);
    assert.equal(closer.end - closer.n / 2, 200 - 30);                // środek okna bez zmian (frac 0,5): 170
    const wider = pinchWindow(start, 50, 252);                        // palce zbliżone => oddalenie
    assert.equal(wider.n, 120);
    assert.equal(pinchWindow(start, 10, 100).n, 100);                 // nie więcej niż cała historia
    assert.equal(pinchWindow(start, 100000, 252).n, 15);              // nie mniej niż MIN_WINDOW
    const left = pinchWindow({ n: 60, end: 200, dist: 100, frac: 0 }, 200, 252);   // środek przy lewym brzegu: lewy brzeg zostaje
    assert.equal(left.end - left.n, 140);
    assert.deepEqual(panWindow({ n: 50, end: 200 }, 100, 500, 252), { n: 50, end: 190 });   // w prawo = wstecz w czasie
    assert.deepEqual(panWindow({ n: 50, end: 200 }, -100, 500, 252), { n: 50, end: 210 });
    assert.equal(panWindow({ n: 50, end: 60 }, 5000, 500, 252).end, 50);                    // nie za początek danych
    assert.equal(panWindow({ n: 50, end: 250 }, -5000, 500, 252).end, 252);
});

test("buildChartModel / chartSvg: sell climax top and distribution mark the signal weeks", () => {
    const { buildChartModel, chartSvg } = require("../../docs/js/chart.js");
    const weeks = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 0, 2) + i * 7 * 86400000).toISOString().slice(0, 10));
    const arr = v => weeks.map(() => v);
    const charts = { weeks, spx: arr(5000), stocks: { X: { o: arr(10), h: arr(11), l: arr(9), c: arr(10), v: arr(100), sma10: arr(10), sma40: arr(10), eps: [], bases: [],
        climax: { date: weeks[27], runup_pct: 40, week_gain_pct: 22, vol_ratio: 3.1, reversal: true, gap: false, late: false, conf: 1 },
        distribution: { date: weeks[20], vol_ratio: 2.4, change_pct: 0.4, close_pos: 0.3 } } } };
    const m = buildChartModel(charts, "X", { ticker: "X" }, {});
    assert.equal(m.climax.date, weeks[27]);
    const svg = chartSvg(m, {});
    assert.match(svg, new RegExp(`Sell climax top \\(tydzień do ${weeks[27]}\\)`));
    assert.match(svg, new RegExp(`Dystrybucja bez wzrostu ceny \\(tydzień do ${weeks[20]}\\)`));
    const clean = chartSvg(buildChartModel(charts, "X", { ticker: "X" }, { patterns: false }), {});
    assert.doesNotMatch(clean, /Sell climax top \(tydzień|Dystrybucja bez wzrostu/);
    charts.stocks.X.climax = null;
    assert.doesNotMatch(chartSvg(buildChartModel(charts, "X", { ticker: "X" }, {}), {}), /Sell climax top \(tydzień/);
});


test("fundMiniModel: cena, EPS TTM i RS na osi tygodni", () => {
    const { fundMiniModel, fundMiniHtml } = require("../../docs/js/chart.js");
    const weeks = Array.from({ length: 10 }, (_, i) => `2025-01-${String(i + 1).padStart(2, "0")}`);
    const charts = { weeks, spx: weeks.map(() => 100), stocks: { X: {
        c: [10, 11, 12, 13, 14, 15, 16, 17, 18, 20],
        eps: [{ d: "2025-01-03", e: 1, g: 5, t: 4 }, { d: "2025-01-08", e: 1, g: 5, t: 5 }, { d: "2025-01-02", e: 1, g: null, t: null }],
        eps_next: { d: "2025-02-01", e: 1.2, t: 5.5 },
    } } };
    const m = fundMiniModel(charts, "X");
    assert.equal(m.eps.length, 2);
    assert.equal(m.priceChg, 100);
    assert.equal(m.epsChg, 25);
    assert.equal(m.next, 5.5);
    assert.equal(fundMiniModel(charts, "NOPE"), null);
    assert.match(fundMiniHtml(m), /<svg/);
});

test("fundVerdict: poziom zależy od liczby zielonych sygnałów", () => {
    const { fundVerdict } = require("../../docs/js/chart.js");
    assert.equal(fundVerdict([1, 1, 1, 1, 1]).level, "good");
    assert.equal(fundVerdict([1, 1, 1, -1, -1]).level, "mixed");
    assert.equal(fundVerdict([1, -1, -1, -1, 0]).level, "bad");
    assert.equal(fundVerdict([1, 0, 0, 0, 0]).level, "unknown");
});

test("S&P 500 is a thin line in the top band of the price panel (own scale, no separate frame) like in the book", () => {
    const m = buildChartModel(charts(), "AAA", null);
    const svg = chartSvg(m);
    assert.match(svg, /fill="none" stroke="#9aa3b2" stroke-width="1\.3"/);   // linia S&P w panelu cen
    assert.match(svg, />S&amp;P 500 104\.00</);                                    // podpis z ostatnią wartością
    const none = chartSvg(buildChartModel(charts({ spx: null }), "AAA", null));
    assert.doesNotMatch(none, /S&amp;P 500 \d/);
});

test("pivotFromStock: wykres tygodniowy bierze pivot / base_type (pola dzienne dbase_* są ignorowane)", () => {
    const s = { price: 100, base_type: "flat", pivot: 102, dbase_type: "double_bottom", dpivot: 104 };
    assert.equal(pivotFromStock(s, []).price, 102);
    assert.equal(pivotFromStock({ price: 100, dbase_type: "htf", dpivot: 103 }, []), null);
    assert.equal(pivotFromStock({ price: 100, base_type: "ascending", pivot: 103 }, []).price, 103);
});


test("zoomWindow: płynny zoom zachowuje punkt kotwiczenia i granice", () => {
    const { zoomWindow } = require("../../docs/js/chart.js");
    const z = zoomWindow({ n: 100, end: 200 }, 0.5, 0.5, 312);
    assert.equal(z.n, 50);
    assert.equal(z.end - z.n / 2, 150);                       // środek okna bez zmian
    assert.equal(zoomWindow({ n: 100, end: 200 }, 100, 0.5, 312).n, 312);   // nie więcej niż całość
    assert.equal(zoomWindow({ n: 100, end: 200 }, 0.001, 0.5, 312).n, 15);   // nie mniej niż MIN_WINDOW
    const edge = zoomWindow({ n: 100, end: 312 }, 0.5, 1, 312);   // kotwica na prawym brzegu: koniec zostaje
    assert.equal(edge.end, 312);
});

test("sliceModel: linia EPS zachowuje raporty spoza okna (nie znika po zmianie suwaka)", () => {
    const { sliceModel } = require("../../docs/js/chart.js");
    const eps = [{ week: 5, t: 1 }, { week: 40, t: 2 }, { week: 90, t: 3 }];
    const m = { n: 100, weeks: Array.from({ length: 100 }, (_, i) => String(i)), o: [], h: [], l: [], c: [], v: [], smas: [], spx: null, rs: [], eps, lines: [], cups: [], rsNewHigh: [], pxNewHigh: null, volAvg: [], book: null, lastIdx: 99, pole: null };
    const arr = new Array(100).fill(1);
    Object.assign(m, { o: arr, h: arr, l: arr, c: arr, v: arr, rs: arr, rsNewHigh: arr, volAvg: arr });
    const s = sliceModel(m, 20, 60);   // okno [40, 60): w środku tylko raport z tygodnia 40
    assert.equal(s.eps.length, 1);
    assert.equal(s.epsLine.length, 3);   // ale linia zna wszystkie raporty (z przesuniętymi tygodniami)
    assert.deepEqual(s.epsLine.map(q => q.week), [-35, 0, 50]);
    const s2 = sliceModel(m, 20, 30);   // okno [10, 30): żaden raport w środku, linia nadal ma 3 punkty
    assert.equal(s2.eps.length, 0);
    assert.equal(s2.epsLine.length, 3);
});

test("epsMultiple: 20× jak w książce, a gdy linia zysków przy 20× wypada poza cenami okna (EPS > 10 przy cenie 100, albo EPS bardzo niski) — najbliższy równy mnożnik", () => {
    assert.equal(epsMultiple([4, 4.5, 5], 60, 140), 20);                // 20× EPS 4,5 = 90 mieści się w cenach 60–140
    assert.equal(epsMultiple([10, 11, 12], 60, 140), 10);               // 20× EPS 11 = 220 (poza) → 10× = 110
    assert.equal(epsMultiple([18, 18.4], 200, 600), 20);                // DELL: 20× = 368 mieści się
    assert.equal(epsMultiple([0.14, 0.19, 0.22, 0.35, 0.9], 12, 128), 160); // MXL: mediana EPS 0,22 → 20× = 4,4 poniżej cen okna → 160× (35 w środku zakresu)
    assert.equal(epsMultiple([], 10, 20), 20);
    assert.equal(epsMultiple([-1, 0], 10, 20), 20);
});

test("chartSvg: linia zysków podzielona na odcinki (ujemny EPS) — KAŻDY odcinek ma przycięcie do panelu cen, nie wychodzi pod wykres", () => {
    const polys = polyline([[0, 0], [10, 10], null, [20, 20], [30, 30]], "#c58bff", 2.2);
    assert.ok((polys.match(/<polyline/g) || []).length >= 2);
    assert.equal(polys.replace(/<polyline/g, "<polyline CLIP").match(/<polyline CLIP/g).length, (polys.match(/<polyline/g) || []).length);
});


test("macdSeries: EMA jak w TradingView (SMA jako ziarno), na prostej rampie MACD → (26−12)/2 · nachylenie", () => {
    const { emaSeries, macdSeries } = require("../../docs/js/chart.js");
    const ramp = Array.from({ length: 300 }, (_, i) => 100 + i);
    const e = emaSeries([1, 2, 3, 4, 5], 3);
    assert.deepEqual(e.slice(0, 2), [null, null]);
    assert.equal(e[2], 2);                                     // ziarno = SMA z pierwszych 3
    assert.equal(e[3], 4 * 0.5 + 2 * 0.5);                     // alpha = 2 / (3 + 1)
    const { macd, signal, hist } = macdSeries(ramp);
    assert.equal(macd[24], null);                              // MACD zaczyna się po 26 zamknięciach
    assert.ok(Math.abs(macd[299] - 7) < 0.05, `MACD ${macd[299]}`);   // opóźnienie EMA(n) = (n−1)/2 tygodnia → 12,5 − 5,5 = 7
    assert.ok(Math.abs(signal[299] - 7) < 0.05 && Math.abs(hist[299]) < 0.05);
});

test("macdWeeklyState: przecięcie w dół (hist < 0 po hist ≥ 0), data i dołek świecy sygnału; stan nad sygnałem bez przecięcia", () => {
    const { macdWeeklyState } = require("../../docs/js/chart.js");
    const n = 120, up = 80;
    const c = Array.from({ length: n }, (_, i) => (i < up ? 100 * Math.pow(1.01, i) : 100 * Math.pow(1.01, up) * Math.pow(0.98, i - up)));   // wzrost wykładniczy (hist > 0), potem spadek 2 % tygodniowo
    const l = c.map(v => v - 1);
    const weeks = c.map((_, i) => new Date(Date.UTC(2024, 0, 5) + i * 7 * 86400000).toISOString().slice(0, 10));
    const st = macdWeeklyState({ weeks, c, l });
    assert.equal(st.state, "below");
    assert.ok(st.crossDown > up && st.crossDown < up + 12, `crossDown ${st.crossDown}`);
    assert.ok(st.hist[st.crossDown] < 0 && st.hist[st.crossDown - 1] >= 0);
    assert.equal(st.crossLow, l[st.crossDown]);
    assert.equal(st.crossDownDate, weeks[st.crossDown]);
    assert.equal(st.weeksSinceDown, st.last - st.crossDown);
    const rising = macdWeeklyState({ weeks: weeks.slice(0, up), c: c.slice(0, up), l: l.slice(0, up) });
    assert.equal(rising.state, "above");
    assert.equal(rising.crossDown, null);
    assert.equal(macdWeeklyState({ weeks: ["2024-01-05"], c: [1], l: [1] }), null);          // za krótka historia
    const padded = macdWeeklyState({ weeks: [...weeks, "2027-01-01"], c: [...c, null], l: [...l, null] });   // puste przyszłe miejsca są pomijane
    assert.equal(padded.last, n - 1);
});

test("posMiniSvg: miniatura z ceną, liniami wejścia / stopu / nowego stopu, MACD i znacznikiem przecięcia", () => {
    const { macdWeeklyState, posMiniSvg } = require("../../docs/js/chart.js");
    const n = 120;
    const c = Array.from({ length: n }, (_, i) => (i < 80 ? 100 * Math.pow(1.01, i) : 100 * Math.pow(1.01, 80) * Math.pow(0.98, i - 80)));
    const l = c.map(v => v - 1);
    const weeks = c.map((_, i) => new Date(Date.UTC(2024, 0, 5) + i * 7 * 86400000).toISOString().slice(0, 10));
    const st = macdWeeklyState({ weeks, c, l });
    const svg = posMiniSvg({ c, l }, weeks, { entry: 120, stop: 110 }, { code: "RAISE", newStop: st.crossLow }, st, { ticker: "X" });
    assert.match(svg, /^<svg class="pos-mini-svg"/);
    assert.ok(svg.includes("MACD") && svg.includes("sygnał") && svg.includes("wej.") && svg.includes("stop") && svg.includes("nowy"));
    assert.match(svg, /<polygon/);                                      // ▼ przecięcia w dół
    assert.equal(posMiniSvg({ c }, weeks, null, null, null), "");
    // „stop już wyżej” (KEEP) nie rysuje proponowanego stopu, a etykiety poziomów leżą ≥ 9 px od siebie
    const keep = posMiniSvg({ c, l }, weeks, { entry: 120, stop: 119.5 }, { code: "KEEP", newStop: 100 }, st, { ticker: "X" });
    assert.ok(!keep.includes("nowy"));
    const ys = [...keep.matchAll(/<text x="[\d.]+" y="([\d.]+)" font-size="8" fill="#(?:8a8f9c|ff5d5d)"/g)].map(m => +m[1]).sort((a, b) => a - b);
    assert.equal(ys.length, 2);
    assert.ok(ys[1] - ys[0] >= 9 - 1e-6);
});

test("chartSvg: baza flat to pudełko Darvasa (obrys + góra + stop −8 %), bez przerywanej linii pivotu i stref", () => {
    const c = charts();
    c.stocks.AAA.bases = [{ start: "2026-01-09", end: "2026-07-03", peak: 15, low: 12, pivot: 15, depth_pct: 20, type: "flat", open: true }];
    const m = buildChartModel(c, "AAA", { base_type: "flat", pivot: 15, tl_state: null }, { pad: true });
    assert.ok(m.box && m.box.top === 15 && m.box.low === 12 && m.box.stop === 13.8);
    const svg = chartSvg(m);
    assert.match(svg, /stop −8% 13\.80/);
    assert.match(svg, /Pudełko \(12–15\)/);
    assert.doesNotMatch(svg, /strefa zakupu do/);
    assert.doesNotMatch(svg, /pivot 15\.00/);
});
