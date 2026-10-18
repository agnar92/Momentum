"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { glbAnalyze, glbOrders, glbCardSvg } = require("../../docs/js/glb.js");

const G = { m0: "2025-01", c: [100, 110, 120, 112, 115, 118], partial: false, line: 120, lm: "2025-03", ath: ["2025-03", 120], full: true, stop: 118.8, state: "WAIT" };

test("glbAnalyze: czeka pod linią, wybicie, brak linii", () => {
    const a = glbAnalyze(G, 115);
    assert.equal(a.state, "WAIT");
    assert.equal(a.stop, 118.8);
    assert.ok(Math.abs(a.dist - 4.35) < 0.01);
    assert.match(a.text, /kup, gdy cena > 120\.00/);
    assert.equal(glbAnalyze({ ...G, state: "BREAK" }, 121).state, "BREAK");
    assert.equal(glbAnalyze({ ...G, line: null, lm: null }, 115).state, "NONE");
    assert.equal(glbAnalyze(null, 115).state, "NONE");
});

test("glbOrders: ≤ 10 % pod linią i zamknięcia nad linią ≤ +5 % (BREAK i ABOVE), kupna pierwsze", () => {
    const st = [
        { ticker: "A", price: 95, glb_line: 100, glb_stop: 99, glb_state: "WAIT", glb_dist: 5.3, glb_month: "2025-01", glb_age: 8 },
        { ticker: "B", price: 80, glb_line: 100, glb_stop: 99, glb_state: "WAIT", glb_dist: 25 },
        { ticker: "C", price: 103, glb_line: 100, glb_stop: 99, glb_state: "BREAK", glb_dist: -2.9 },
        { ticker: "D", price: 110, glb_line: 100, glb_stop: 99, glb_state: "BREAK", glb_dist: -9.1 },
        { ticker: "E", price: 110, glb_line: 100, glb_stop: 99, glb_state: "ABOVE", glb_dist: -9.1 },
        { ticker: "F", price: 101, glb_line: 100, glb_stop: 99, glb_state: "ABOVE", glb_dist: -1 },
    ];
    const o = glbOrders(st, { capital: 1 }, (acct, entry, stop) => ({ shares: 1, entry, stop }));
    assert.deepEqual(o.map(x => x.ticker), ["F", "C", "A"]);
    assert.equal(o[1].entry, 103);
    assert.equal(o[1].fresh, true);
    assert.equal(o[0].fresh, false);
    assert.equal(o[2].entry, 100);
    assert.equal(o[2].stop, 99);
    assert.deepEqual(o[2].size, { shares: 1, entry: 100, stop: 99 });
});

test("glbCardSvg: rysuje kartę z green line i bez danych", () => {
    const svg = glbCardSvg(G, 115, { bookTitle: "AAA — Test" });
    assert.match(svg, /GLB•Card/);
    assert.match(svg, /Kup &gt; 120\.00|Kup > 120\.00/);
    assert.match(svg, /AAA — Test/);
    assert.match(glbCardSvg(null, 1), /Brak danych GLB/);
    assert.match(glbCardSvg({ ...G, lm: "2001-05" }, 115), /poza kartą/);
});
