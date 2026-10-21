const test = require("node:test");
const assert = require("node:assert");
const { dateIndex, lineAt, lineCross, hitLine, snapPrice, stateAlerts, evalAlerts } = require("../../docs/js/lines.js");

const D = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02"];

test("dateIndex: exact or previous week", () => {
    assert.strictEqual(dateIndex(D, "2026-01-19"), 2);
    assert.strictEqual(dateIndex(D, "2026-01-21"), 2);
    assert.strictEqual(dateIndex(D, "2025-12-01"), -1);
    assert.strictEqual(dateIndex(D, "2027-01-01"), 4);
});

test("lineAt interpolates on log price and extends right", () => {
    const ln = { d1: D[0], p1: 10, d2: D[2], p2: 40 };
    assert.ok(Math.abs(lineAt(ln, D, 1) - 20) < 1e-9);
    assert.ok(Math.abs(lineAt(ln, D, 4) - 160) < 1e-9);
    assert.strictEqual(lineAt({ d1: D[1], p1: 1, d2: D[1], p2: 2 }, D, 3), null);
});

test("lineCross on the last week", () => {
    const flat = { d1: D[0], p1: 100, d2: D[1], p2: 100 };
    assert.strictEqual(lineCross(flat, { d: D, c: [90, 95, 96, 98, 101] }), "up");
    assert.strictEqual(lineCross(flat, { d: D, c: [90, 95, 96, 102, 99] }), "down");
    assert.strictEqual(lineCross(flat, { d: D, c: [90, 95, 96, 98, 99] }), null);
    assert.strictEqual(lineCross({ d1: D[4], p1: 100, d2: "2026-02-20", p2: 100 }, { d: D, c: [90, 95, 96, 98, 101] }), null);   // oba punkty w ostatnim tygodniu
});

test("hitLine prefers endpoints, then body and extension", () => {
    const segs = [{ id: "a", x1: 0, y1: 0, x2: 100, y2: 0, xe: 200, ye: 0 }];
    assert.deepStrictEqual(hitLine(segs, 3, 2, 7), { id: "a", part: "p1" });
    assert.deepStrictEqual(hitLine(segs, 50, 4, 7), { id: "a", part: "body" });
    assert.deepStrictEqual(hitLine(segs, 150, 3, 7), { id: "a", part: "body" });
    assert.strictEqual(hitLine(segs, 50, 20, 7), null);
});

test("snapPrice to High / Low within tolerance", () => {
    const yf = (p) => 200 - p;
    assert.strictEqual(snapPrice(57, 60, 40, yf, 143, 8), 60);
    assert.strictEqual(snapPrice(50, 60, 40, yf, 150, 8), 50);
});

test("stateAlerts and evalAlerts deduplicate per week", () => {
    const prev = { glb_state: "POD", macd: "nad", macd_stop: 90, price: 95, ok: false };
    const row = { ticker: "A", glb_state: "WYBICIE", glb: 100, macd: "pod", macd_stop: 105, price: 104, ok: true };
    assert.strictEqual(stateAlerts(prev, row).length, 4);
    const st = { lines: { A: [{ id: "x", d1: D[0], p1: 100, d2: D[1], p2: 100 }] }, watch: { A: prev }, log: [] };
    const series = { d: D, c: [90, 95, 96, 98, 104] };
    const fresh = evalAlerts(st, () => row, () => series, "2026-02-07T08:00:00Z", D[4]);
    assert.strictEqual(fresh.length, 5);
    assert.strictEqual(st.watch.A.glb_state, "WYBICIE");
    assert.strictEqual(evalAlerts(st, () => row, () => series, "2026-02-07T09:00:00Z", D[4]).length, 0);
    st.lines.A[0].alert = false;
    st.log = [];
    assert.strictEqual(evalAlerts(st, () => row, () => series, "x", D[4]).length, 0);
});

test("positionPlan: stop −10 %, half at −20 % from the peak close since entry, GLB exit", () => {
    const { positionPlan } = require("../../docs/js/lines.js");
    const data = { d: D, c: [100, 120, 150, 130, 118] };
    const pl = positionPlan({ since: D[1], price: 120 }, data, { glb: 125 });
    assert.ok(Math.abs(pl.stopInit - 108) < 1e-9 && pl.peak === 150 && Math.abs(pl.halfAt - 120) < 1e-9);
    assert.ok(pl.half && pl.glbExit && pl.last === 118);
    const early = positionPlan({ since: D[1], price: 120 }, { d: D.slice(0, 3), c: [100, 120, 150] }, { glb: 110 });
    assert.ok(!early.half && !early.glbExit);
});

test("evalAlerts: half-sell alert for a position once per peak, GLB exit for watched", () => {
    const st = { lines: {}, watch: { X: { glb_state: "SYGNAŁ", macd: "nad", price: 130, ok: true } }, pos: { X: { since: D[1], price: 120 } }, log: [] };
    const row = { ticker: "X", glb: 125, glb_state: "POD", macd: "nad", price: 118, ok: true };
    const series = { d: D, c: [100, 120, 150, 130, 118] };
    const fresh = evalAlerts(st, () => row, () => series, "now", D[4]);
    assert.ok(fresh.some((a) => a.msg.includes("sprzedaj połowę")) && fresh.some((a) => a.msg.includes("pod Green Line")));
    assert.strictEqual(evalAlerts(st, () => row, () => series, "later", D[4]).length, 0);
});

test("positionStatus: what to do with a position now", () => {
    const { positionStatus } = require("../../docs/js/lines.js");
    const pl = { last: 100, stopInit: 108, half: true, glbExit: true };
    assert.deepStrictEqual(positionStatus(pl, { slow: "HAMUJE" }, "GLB"), ["STOP −10 %", "WYJŚCIE: zamknięcie pod GLB", "SPRZEDAJ ½ (−20 % od szczytu)", "⚠ hamuje"]);
    assert.deepStrictEqual(positionStatus({ ...pl, stopInit: 90, half: false }, { macd_stop: 105 }, "MACD"), ["WYJŚCIE: pod stopem MACD"]);
    assert.deepStrictEqual(positionStatus({ last: 150, stopInit: 108 }, { macd_stop: 105 }, "MACD"), []);
});
