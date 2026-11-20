const test = require("node:test");
const assert = require("node:assert");
const W = require("../../docs/js/wspolne.js");

test("DCF: te same liczby co Python (tests/test_ocena.py)", () => {
    let pv = 0, rev = 100;
    for (let t = 1; t <= 10; t++) { const g = t <= 5 ? 0.1 : 0.1 + (0.03 - 0.1) * (t - 5) / 5; rev *= 1 + g; pv += rev * 0.2 / Math.pow(1.1, t); }
    pv += rev * 0.2 * 1.03 / 0.07 / Math.pow(1.1, 10);
    const v = W.dcf({ rev: 100, marza: 0.2, g: 0.1, akcje: 10, gotowka: 50, dlug: 20 });
    assert.ok(Math.abs(v - (pv + 30) / 10) < 1e-9);
    assert.strictEqual(W.dcf({ rev: 100, marza: 0, g: 0.1, akcje: 10 }), null);
});

test("implikowany wzrost odtwarza cenę", () => {
    const p = { rev: 100, marza: 0.2, g: 0.1, akcje: 10 };
    const cena = W.dcf(p), g = W.implikowane(p, cena, "g", -0.3, 0.8);
    assert.ok(Math.abs(g - 0.1) < 1e-6);
    assert.strictEqual(W.implikowane(p, 1e9, "g", -0.3, 0.8), null);
});

test("PEG, etykiety, percentyle", () => {
    const s = W.pegScen(30, 0.25);
    assert.ok(Math.abs(s.base.peg - 1.2) < 1e-9 && s.bear.peg > s.bull.peg);
    assert.strictEqual(W.etykieta(0.5), "Bardzo tania");
    assert.strictEqual(W.etykieta(-0.5), "Bardzo droga");
    assert.strictEqual(W.etykieta(null, 0.8), "Niedowartościowana");
    assert.strictEqual(W.opisPercentyla(0.93).k, "b-dobrze");
    assert.strictEqual(W.pozycjaWyceny(0), 0.5);
});

test("formatowanie po polsku", () => {
    assert.strictEqual(W.fmtPct(0.1234, 1, true), "+12,3 %");
    assert.strictEqual(W.fmtUsd(3.5e12), "3,5 bln");
    assert.strictEqual(W.fmtUsd(-2e9), "−2,0 mld");
});

const R = [
    { t: "A", n: "Alfa", s: "T", typ: "Szybko rosnąca", et: "Bardzo tania", o: { ogolna: 8 }, st: { "Jakość (7 kryteriów)": [7, 7] }, peg: 0.5, dcf_pot: 0.5 },
    { t: "B", n: "Beta", s: "F", typ: "Wolno rosnąca", et: "Droga", o: { ogolna: 5 }, st: { "Jakość (7 kryteriów)": [3, 7] }, peg: -1, dcf_pot: -0.2 },
    { t: "C", n: "Gamma", s: "T", typ: "Szybko rosnąca", et: null, o: { ogolna: null }, st: { "Jakość (7 kryteriów)": [6, 7] }, peg: 1.5, dcf_pot: null },
];

test("filtr i sortowanie listy", () => {
    assert.deepStrictEqual(W.filtruj(R, { sektor: "T" }).map((r) => r.t), ["A", "C"]);
    assert.deepStrictEqual(W.filtruj(R, { strategia: "Jakość (7 kryteriów)", min: 6 }).map((r) => r.t), ["A", "C"]);
    assert.deepStrictEqual(W.filtruj(R, { q: "bet" }).map((r) => r.t), ["B"]);
    assert.deepStrictEqual(W.sortuj(R, "ogolna", -1).map((r) => r.t), ["A", "B", "C"]);
    assert.deepStrictEqual(W.sortuj(R, "peg", 1).map((r) => r.t), ["A", "C", "B"]);
});

test("TTM z kwartałów", () => {
    const q = [["q1", 1], ["q2", 2], ["q3", 3], ["q4", 4], ["q5", null]];
    assert.deepStrictEqual(W.ttmSeria(q, 1), [["q4", 10], ["q5", null]]);
});

test("skład oceny = średnia percentyli / 10 (jak Python), miejsce w rankingu", () => {
    const s = W.skladOceny({ rev_1y: 0.9, rev_cagr3: 0.7, ni_1y: null }, "wzrost");
    assert.strictEqual(s.ocena, 8);
    assert.strictEqual(s.liczone, 2);
    assert.strictEqual(s.el.find((x) => x.pole === "rev_1y").pkt, 90);
    const rows = [{ t: "A", o: 5 }, { t: "B", o: 9 }, { t: "C", o: null }];
    assert.deepStrictEqual(W.miejsce(rows, "A", (r) => r.o), { miejsce: 2, z: 2 });
});
