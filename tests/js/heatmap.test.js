const test = require("node:test");
const assert = require("node:assert");
const { heatMetrics, squarify, heatColor, heatmapHtml } = require("../../docs/js/heatmap.js");

test("squarify: powierzchnie proporcjonalne do wag i wypełniają prostokąt", () => {
    const out = squarify([{ w: 6 }, { w: 3 }, { w: 2 }, { w: 1 }], 0, 0, 100, 80);
    assert.strictEqual(out.length, 4);
    const area = out.reduce((a, r) => a + r.dw * r.dh, 0);
    assert.ok(Math.abs(area - 8000) < 1e-6);
    const big = out.find(r => r.w === 6), small = out.find(r => r.w === 1);
    assert.ok(Math.abs(big.dw * big.dh / (small.dw * small.dh) - 6) < 1e-6);
    out.forEach(r => assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.dw <= 100 + 1e-9 && r.y + r.dh <= 80 + 1e-9));
});

test("heatMetrics: dobra spółka zielona, brak danych szary", () => {
    const g = heatMetrics({ eps_q0_yoy: 80, sales_qq: 40, rs_rating: 95, accdis: "A", climax_top: false }, { regime: "uptrend", distDays: 2 });
    const c = g.find(x => x.title.startsWith("Zyski kw"));
    assert.ok(c.score > 0.5);
    assert.strictEqual(c.items.find(i => i.label === "Sprzedaż kw.").score, 1);
    assert.strictEqual(g.find(x => x.title.startsWith("Rynek")).score, 0.88 > 0 ? g.find(x => x.title.startsWith("Rynek")).score : 0);
    const none = heatMetrics({}, null);
    assert.ok(none.every(x => x.score === null));
    assert.strictEqual(heatColor(null), "#3a3f49");
});

test("heatmapHtml: zawiera podkategorie i kafelki", () => {
    const h = heatmapHtml({ eps_q0_yoy: 30, rs_rating: 70 }, { regime: "correction", distDays: 6 });
    assert.match(h, /Zyski kwartalne/);
    assert.match(h, /hm-t/);
    assert.match(h, /Ogólnie/);
});
