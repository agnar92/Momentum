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
    assert.ok(res.svg.includes("GREEN LINE 120.00") && res.svg.includes('stroke-dasharray="5 4"'));
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

test("S&P 500 panel and quarterly revenue bars", () => {
    const w = weekly(156), spx = { d: w.d, c: w.c.map((x) => x * 4) };
    const qs = [{ quarter: w.d[100], rev: 1e9, rev_rr: 30 }, { quarter: w.d[113], rev: 1.2e9, rev_rr: 12 }];
    const res = chartSvg(w, { qs }, 1000, 700, null, null, [], null, spx);
    assert.ok(res.svg.includes("S&amp;P 500 (SPY)") && res.svg.includes("+30%") && res.svg.includes("+12%"));
    assert.ok(res.geom.spx[1] < res.geom.price[0] && res.geom.vol[1] < res.geom.rev[0] && res.geom.rev[1] < res.geom.macd[0]);
    assert.ok(chartSvg(w, null, 1000, 700).svg.includes("brak danych SPY"));
});
