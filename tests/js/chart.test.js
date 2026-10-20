const test = require("node:test");
const assert = require("node:assert");
const { sma, macd, macdCrossDown, ticks, chartSvg, infoLines, titleText } = require("../../docs/js/chart.js");

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
