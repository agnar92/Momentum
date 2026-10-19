"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { flowSma, trend1030, mansfieldRS, flowPerf, flowBreakout, flowSortStocks, chart1030Svg, flowStatRows } = require("../../docs/js/flow.js");

const ramp = (n, a, b) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

test("flowSma: null dopóki okno niepełne, luka w danych = null", () => {
    assert.deepEqual(flowSma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
    assert.deepEqual(flowSma([1, null, 3, 4], 2), [null, null, null, 3.5]);
});

test("trend1030: rosnący / spadający / boczny", () => {
    assert.equal(trend1030(ramp(60, 10, 30)).state, "up");
    assert.equal(trend1030(ramp(60, 30, 10)).state, "down");
    const flat = ramp(60, 10, 30).concat(ramp(6, 29, 24));   // krótki spadek pod SMA 30, a SMA 30 jeszcze rośnie
    assert.equal(trend1030(flat).state, "flat");
    assert.equal(trend1030(ramp(20, 1, 2)).state, "na");      // < 30 tygodni
});

test("mansfieldRS: walor rosnący szybciej niż rynek > 0, wolniej < 0", () => {
    const spx = ramp(80, 100, 120);
    assert.ok(mansfieldRS(ramp(80, 100, 160), spx) > 0);
    assert.ok(mansfieldRS(ramp(80, 100, 105), spx) < 0);
    assert.equal(mansfieldRS(ramp(40, 1, 2), ramp(40, 1, 2)), null);   // < 52 tygodni
});

test("flowPerf: zmiany tygodniowe i od początku roku", () => {
    const c = [100, 110, 121], weeks = ["2025-12-26", "2026-01-02", "2026-01-09"];
    const p = flowPerf(c, weeks);
    assert.ok(Math.abs(p.w - 10) < 1e-9);
    assert.ok(Math.abs(p.ytd - 21) < 1e-9);
    assert.equal(p.m, null);
    assert.equal(p.hi52, 0);
});

test("flowBreakout / flowSortStocks: wybicia pierwsze, potem najbliżej punktu kupna (box albo GLB)", () => {
    const st = [
        { ticker: "A", dv_state: "READY", dv_dist: 4, glb_state: "WAIT", glb_dist: 1.5 },
        { ticker: "B", dv_state: "OUT", glb_state: "NONE" },
        { ticker: "C", dv_state: "BUY" },
        { ticker: "D", dv_state: "WAIT", dv_dist: 0.5 },
        { ticker: "E", glb_state: "ABOVE", glb_dist: -9 },
        { ticker: "F", glb_state: "WAIT", glb_dist: 40 },
    ];
    assert.equal(flowBreakout(st[0]).key, 1.5);
    assert.match(flowBreakout(st[0]).text, /green line/);
    assert.equal(flowBreakout(st[1]).key, null);
    assert.deepEqual(flowSortStocks(st).map(s => s.ticker), ["C", "D", "A", "B", "E", "F"]);
});

test("chart1030Svg i flowStatRows: rysują wykres i tabelkę", () => {
    const c = ramp(120, 50, 90), weeks = Array.from({ length: 120 }, (_, i) => new Date(Date.UTC(2024, 0, 5 + 7 * i)).toISOString().slice(0, 10));
    const svg = chart1030Svg(c, weeks, { w: 400, h: 200 });
    assert.match(svg, /<svg/);
    assert.equal((svg.match(/<polyline/g) || []).length, 3);
    assert.match(chart1030Svg([], []), /Brak danych/);
    const { rows, trend, mrs } = flowStatRows(c, weeks, ramp(120, 50, 60));
    assert.equal(trend.state, "up");
    assert.ok(mrs > 0);
    assert.ok(rows.some(r => r[0] === "Mansfield RS"));
});
