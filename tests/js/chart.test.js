const test = require("node:test");
const assert = require("node:assert");
const { sma, macd, macdCrossDown, ticks, chartSvg, infoLines, titleText, windowRange, sliderRect, sliderMode, sliderDrag, sliderJump, zoomWindow, sliderSvg } = require("../../docs/js/chart.js");

test("sma and ticks", () => {
    assert.deepStrictEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
    assert.deepStrictEqual(ticks(10, 100, 7), [20, 40, 60, 80, 100]);
    assert.deepStrictEqual(ticks(0, 10), []);
});

test("macd cross down like calc.macd_cross_down", () => {
    const closes = [];
    for (let i = 1; i < 60; i++) closes.push(i);
    for (let i = 1; i < 15; i++) closes.push(60 - i * 2);
    const h = macd(closes).hist, x = macdCrossDown(h);
    assert.ok(x.length && h[x[x.length - 1]] < 0 && h[x[x.length - 1] - 1] >= 0);
});

function weekly(n) {
    const d = [], c = [];
    for (let i = 0; i < n; i++) {
        d.push(new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10));
        c.push(50 + i);
    }
    return { d, o: c, h: c.map((v) => v + 1), l: c.map((v) => v - 1), c, v: c.map(() => 1e6) };
}

test("chart draws green line, MACD stop and returns geometry", () => {
    const res = chartSvg(weekly(150), { glb: 120, macd_stop: 150 }, 1000, 600);
    assert.ok(res.svg.includes("GREEN LINE 120.00 · kupno do 132.00") && res.svg.includes('stroke-dasharray="5 4"'));
    assert.strictEqual(res.geom.n, 150);
    assert.strictEqual(chartSvg(weekly(1), null, 800, 600), null);
});

test("info lines and title", () => {
    assert.deepStrictEqual(infoLines(weekly(3), 1).slice(0, 2), ["tydz. 2024-01-08", "O 51.00  H 52.00"]);
    assert.strictEqual(titleText("X", { company: "Xco", glb_pct: 4, turnover: 6e7 }), "X  ·  Xco  ·  do linii +4.0%  ·  obrót 60 mln $/dzień");
});

test("slider window, drag, jump, zoom", () => {
    assert.deepStrictEqual(windowRange(156), [0, 156]);
    assert.deepStrictEqual(windowRange(156, 5, 40), [28, 40]);            // minimum 12 tygodni
    const [x0, x1] = sliderRect(156, 52, null, 164);
    assert.deepStrictEqual([x0, x1], [4 + 104 / 156 * 156, 160]);
    assert.strictEqual(sliderMode(x0 + 2, x0, x1), "left");
    assert.strictEqual(sliderMode((x0 + x1) / 2, x0, x1), "move");
    assert.strictEqual(sliderMode(10, x0, x1), "jump");
    assert.deepStrictEqual(sliderDrag("move", [52, null], -1000, 156, 164), [52, 52]);
    assert.deepStrictEqual(sliderDrag("left", [52, null], -52, 156, 164), [104, 156]);
    assert.deepStrictEqual(sliderJump(4, 156, 52, 164), [52, 52]);
    assert.deepStrictEqual(zoomWindow(156, null, null, 0.5), [78, 156]);
    assert.ok(sliderSvg(weekly(156).c, 52, null, 400, 46).includes("52 tyg."));
});

test("chart window keeps indicators from full history", () => {
    const full = chartSvg(weekly(156), null, 1000, 600), win = chartSvg(weekly(156), null, 1000, 600, 52, 100);
    assert.strictEqual(win.geom.n, 52);
    assert.strictEqual(win.geom.i0, 48);
    assert.strictEqual(full.geom.i0, 0);
    assert.deepStrictEqual(infoLines(weekly(156), win.geom.i0)[0], "tydz. " + weekly(156).d[48]);
});

test("layout like desktop: RS panel on top, quarterly revenue bars, no C/C52 or EPS panel", () => {
    const w = weekly(156), spx = { d: w.d, c: w.c.map((x) => x * 4) };
    const qs = [{ quarter: w.d[100], rev: 1e9, rev_rr: 30 }, { quarter: w.d[113], rev: 1.2e9, rev_rr: 12 }];
    const res = chartSvg(w, { qs, eps_q: [[w.d[100], 1.2]] }, 1000, 700, null, null, [], null, spx);
    assert.ok(res.svg.includes("+30%") && res.svg.includes("+12%") && res.svg.includes("RS Line (akcja / SPY)"));
    assert.ok(!res.svg.includes("Cena/Cena 52 tyg.") && !res.svg.includes("EPS kw"));
    assert.ok(res.geom.rs[1] < res.geom.price[0] && res.geom.vol[1] < res.geom.rev[0] && res.geom.rev[1] < res.geom.macd[0]);
    assert.ok(!("spx" in res.geom) && !("eps" in res.geom));
});

test("RWB, Stochastic and Blue Dot like calc.py; daily chart mode", () => {
    const { rwb, blueDots, stochK } = require("../../docs/js/chart.js");
    const n = 160, c = [];
    for (let i = 0; i < n; i++) c.push(50 + i * 0.4);
    const top = c[149];
    c.splice(150, 4, top - 3, top - 6, top - 7, top - 1);   // korekta w trendzie i odbicie: %K przecina 20 w górę
    const h = c.map((x) => x + 1), l = c.map((x) => x - 1);
    assert.ok(rwb(c)[148] && !rwb(Array.from({ length: 80 }, (_, i) => 100 - i))[79]);
    assert.ok(stochK(h, l, c)[151] < 20 && stochK(h, l, c)[153] > 20);
    assert.deepStrictEqual(blueDots(h, l, c, 40), [153]);
    assert.deepStrictEqual(blueDots(h, l, c, 1e9), []);
    const d = c.map((_, i) => `2026-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`);
    const res = chartSvg({ d, o: c, h, l, c, v: c.map(() => 1e6) }, { glb: 40 }, 1000, 700, null, null, [], null, null, "D");
    assert.ok(res.svg.includes("GREEN LINE 40.00") && !res.svg.includes("MACD (12"));
    assert.ok(res.svg.includes("GMMA: szybkie EMA (czerwone) / wolne (niebieskie) · jasne tło = RWB · ● Blue Dot"));   // styl „linia + RWB”
    assert.ok(res.svg.includes('r="4" fill="#4aa3ff"'));
    const bars = chartSvg({ d, o: c, h, l, c, v: c.map(() => 1e6) }, { glb: 40 }, 1000, 700, null, null, [], null, null, "D", false);
    assert.ok(bars.svg.includes("EMA 8  EMA 10  EMA 20  SMA 50 · ● Blue Dot") && bars.svg.includes('r="4" fill="#4aa3ff"'));   // słupki + średnie, Blue Dot też
    assert.ok(!res.svg.includes("Blue Dot 2026-") && !res.svg.includes("stop pod Low"));
    assert.ok(!res.svg.includes("Przychody kw.") && !res.svg.includes("Stochastic (10, 1) dzienny"));   // dzienny: bez przychodów i panelu Stochastic
    assert.strictEqual(res.geom.rev, null);
});

test("GLB exit method hides the MACD stop; position plan draws −10 % stop and half-sell level", () => {
    const w = weekly(150), row = { glb: 120, macd_stop: 150 };
    const plan = { stopInit: 135, halfAt: 140, peak: 175 };
    const macd = chartSvg(w, row, 1000, 600).svg, glbm = chartSvg(w, { ...row, exit: "GLB", plan }, 1000, 600).svg;
    assert.ok(!macd.includes("wyjście: zamknięcie tyg. pod linią") && glbm.includes("wyjście: zamknięcie tyg. pod linią"));
    assert.ok(glbm.includes("½ przy 140.00 (−20 % od szczytu 175.00)") && glbm.includes("stop −10 % 135.00") && glbm.includes('stroke-dasharray="2 3"'));
});

test("earnings E markers and ruler text like desktop", () => {
    const { earningsIndices, rulerText } = require("../../docs/js/chart.js");
    const w = weekly(60);
    assert.deepStrictEqual(earningsIndices(w.d, [w.d[10], "2024-03-13"], "W"), [10]);   // 2024-03-13 jest w tygodniu od 2024-03-11 (indeks 10)
    assert.deepStrictEqual(earningsIndices(["2024-01-02", "2024-01-03"], ["2024-01-01", "2024-01-03"], "D"), [1]);
    const svg = chartSvg(w, { glb: 60, earn: [[w.d[40], 5.2, null]] }, 1000, 700).svg;
    assert.ok(svg.includes(">E<title>WYNIKI · " + w.d[40] + " · EPS +5.2% · przychody N/D</title>"));
    assert.strictEqual(rulerText(100, 125, 3, 11, "W"), "+25.0 % · 8 tyg. · 100.00 → 125.00");
});

test("RS Line like Deepvue on the weekly chart", () => {
    const { rsLine } = require("../../docs/js/chart.js");
    assert.deepStrictEqual(rsLine([10, 20, null], [5, 4, 2]), [2, 5, null]);
    const w = weekly(150), spx = { d: w.d, c: w.c.map((_, i) => 400 - i) };   // SPY spada, akcja rośnie -> nowe szczyty RS
    const svg = chartSvg(w, { rs: 61 }, 1000, 700, null, null, [], null, spx).svg;
    assert.ok(svg.includes("+61 pp") && svg.includes("RS Line (akcja / SPY) · średnia 52 tyg.") && !svg.includes("RS Rating"));
    assert.ok(chartSvg(w, { glb: 40, rs: 61 }, 1000, 700, null, null, [], null, spx, "D").svg.includes("+61 pp"));
});

test("weekly layout reserves a readable mobile MACD panel and shortens mobile labels", () => {
    const w = weekly(156), spx = { d: w.d, c: w.c.map((x) => x * 4) };
    const g = require("../../docs/js/chart.js").geometry(390, 700, 52, "W");
    assert.ok(g.macd[1] - g.macd[0] > 80, "MACD should have a real panel, not a thin strip");
    const svg = chartSvg(w, { rs: 61 }, 390, 700, null, null, [], null, spx).svg;
    assert.ok(svg.includes("RS / MA 52 tyg.") && svg.includes("MACD 12·26·9"));
});

test("relative volume: weekly vs 10 weeks, daily vs 50 sessions", () => {
    const { relVolume } = require("../../docs/js/chart.js");
    assert.ok(Math.abs(relVolume(Array(10).fill(10).concat([25]), 10) - 2.5) < 1e-9);
    assert.strictEqual(relVolume([10, 10], 10), null);
    const w = weekly(60);
    w.v[59] = w.v[58] * 3;
    assert.ok(chartSvg(w, null, 1000, 700).svg.includes("Wolumen · śr. 10 tyg. · RVol 3.0×"));
});

test("axis labels do not overlap", () => {
    const { axisSpots } = require("../../docs/js/chart.js");
    assert.deepStrictEqual(axisSpots(100, 105, null), [116, null]);
    assert.deepStrictEqual(axisSpots(100, 95, 300), [84, 300]);
    assert.deepStrictEqual(axisSpots(100, 200, 110), [200, 116]);
});


test("Deepvue-style RS markers: RS high with price (green) and before price (pink)", () => {
    const { rsMarkers } = require("../../docs/js/chart.js");
    assert.deepStrictEqual(rsMarkers([1, 1, 1, 1.2, 1.3], [10, 10, 10, 11, 9], 3), { 3: true, 4: false });
    const n = 300, d = [], c = [], h = [], l = [], spy = [];
    for (let i = 0; i < n; i++) {
        d.push(new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));
        c.push(100); h.push(101); l.push(99); spy.push(500 - i);
    }
    const res = chartSvg({ d, o: c, h, l, c, v: c.map(() => 1e6) }, { rs: 12 }, 1000, 700, null, null, [], null, { d, c: spy }, "D", false);
    assert.ok(res.svg.includes("szczyt RS przed ceną") && res.svg.includes("+12 pp"));
});
