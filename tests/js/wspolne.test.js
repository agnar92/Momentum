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
    assert.strictEqual(W.etykieta(0.5, 3.3), "Bardzo droga");          // PEG ma pierwszeństwo przed DCF
    assert.strictEqual(W.etykieta(-0.5, 1.5), "Wyceniona uczciwie");
    assert.strictEqual(W.pozycjaPeg(2), 0.5);
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
    assert.strictEqual(s.ocena, Math.round(10 * (0.9 + 0.7 + 7 * 0.5) / 9 * 10) / 10);   // 7 brakujących po 50 pkt
    assert.strictEqual(s.liczone, 2);
    assert.strictEqual(s.el.find((x) => x.pole === "rev_1y").pkt, 90);
    const rows = [{ t: "A", o: 5 }, { t: "B", o: 9 }, { t: "C", o: null }];
    assert.deepStrictEqual(W.miejsce(rows, "A", (r) => r.o), { miejsce: 2, z: 2 });
});

test("percentyl i ocenyZ jak w ocena.py", () => {
    const lst = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.strictEqual(W.percentyl(lst, 5, "rev_1y"), 0.45);
    assert.strictEqual(W.percentyl(lst, 5, "pe"), 0.55);
    assert.strictEqual(W.percentyl(lst, -1, "pe"), null);
    assert.strictEqual(W.percentyl([1, 2], 1, "gm"), null);
    const pct = { rev_1y: 1, rev_cagr3: 1, gm: 0.5, om: 0.5, pe: 0.2, peg: 0.4 };
    const o = W.ocenyZ(pct);
    assert.strictEqual(o.wzrost, Math.round(10 * (2 + 0.5 * 7) / 9 * 10) / 10);
    assert.ok(o.ogolna > 0);
});

test("znacznik Jakość 7/7 i filtr", () => {
    const a = { t: "A", n: "A", st: { "Jakość (7 kryteriów)": [7, 7] } }, b = { t: "B", n: "B", st: { "Jakość (7 kryteriów)": [6, 7] } };
    assert.strictEqual(W.jakosc77(a), true);
    assert.strictEqual(W.jakosc77(b), false);
    assert.deepStrictEqual(W.filtruj([a, b], { jakosc: true }).map((r) => r.t), ["A"]);
});

test("dokup: cel 10 % konta, pierwszy zakup 20 % celu, kolejne 10 % raz w miesiącu przy PEG 0–2 i ruchu ±7 %", () => {
    const w = { A: { t: "A", c: 100, peg: 1, o: { ogolna: 6 }, rank: 251 }, B: { t: "B", c: 50, peg: 0.2, o: { ogolna: 10 }, rank: 1 }, C: { t: "C", c: 10, peg: 1, sp: ["przychody"] },
        D: { t: "D", c: 10, peg: 2.5 }, E: { t: "E", c: 107, peg: 1.5 }, F: { t: "F", c: 104, peg: 1 }, G: { t: "G", c: 90, peg: 1 } };
    const p = [{ t: "A", akcje: 0 }, { t: "B", akcje: 0 }, { t: "C", akcje: 1 }, { t: "D", akcje: 0 }, { t: "E", akcje: 1, koszt: 100 },
        { t: "F", akcje: 1, koszt: 100 }, { t: "G", akcje: 1, ost: { c: 100, d: "2026-11-03" } }];
    let d = W.dokup(p, w, { konto: 10000, dzis: "2026-12-05" });
    const k = (d_) => Object.fromEntries(d_.pozycje.map((x) => [x.t, x.kwota]));
    assert.deepStrictEqual(k(d), { A: 200, B: 200, C: 0, D: 0, E: 100, F: 0, G: 100 });   // cel 1000: pierwszy 200, kolejny 100; F ruch +4 % — czeka
    assert.ok(d.pozycje.find((x) => x.t === "F").powod.includes("±7"));
    d = W.dokup(p, w, { konto: 10000, dzis: "2026-11-20" });                               // G już kupione w tym miesiącu
    assert.strictEqual(k(d).G, 0);
    d = W.dokup(p, w, { konto: 10000, dzis: "2026-12-05", budzet: 300 });                   // budżet: najpierw najwięcej punktów (B, potem A …)
    assert.strictEqual(k(d).B, 200); assert.strictEqual(k(d).A + k(d).E + k(d).G, 100);
    assert.ok(Math.abs(W.punkty(w.B).punkty - 29 / 3) < 1e-9); assert.strictEqual(W.punkty(w.D), null);
    d = W.dokup(p, w, { konto: 40000, kurs: 4, dzis: "2026-12-05" });                   // konto w PLN: cel 4000 zł, pierwszy zakup 800 zł = 2 akcje A po 100 USD
    assert.strictEqual(k(d).A, 800); assert.strictEqual(d.pozycje[0].akcjeKup, 2);
    assert.strictEqual(W.sredniKoszt(10, 8, 10, 12), 10);
});


test("fazy rozwoju spółki: okno 3 lat, tylko do przodu, schyłek przy trwałym spadku", () => {
    const f = W.fazyLat({ rev: [10, 20, 40, 70, 90, 100, 110, 120], zysk: [-5, -3, 2, 15, 25, 30, 33, 36], wyplaty: [0, 0, 0, 1, 10, 12, 14, 15] });
    assert.deepStrictEqual(f, [1, 2, 2, 3, 4, 4, 4, 4]);
    // spółka cykliczna (jak MU): rok ze stratą i dołek przychodów nie cofają fazy ani nie dają schyłku
    const c = W.fazyLat({ rev: [30, 23, 21, 28, 31, 15, 25, 37, 133], zysk: [15, 7, 3, 6, 10, -6, 1, 10, 99], wyplaty: [0.1, 2.7, 0.3, 1.3, 2.9, 0.9, 0.8, 0.5, 1.3] });
    assert.deepStrictEqual(c, [3, 3, 3, 4, 4, 4, 4, 4, 4]);
    // trwały spadek przychodów → schyłek
    const s = W.fazyLat({ rev: [100, 100, 100, 95, 90, 85, 80, 75], zysk: [10, 10, 10, 9, 8, 7, 6, 5], wyplaty: [5, 5, 5, 5, 5, 5, 5, 5] });
    assert.deepStrictEqual(s.slice(-2), [5, 5]);
    // schyłek trwa, dopóki przychody i zysk nie przebiją szczytów; potem faza od nowa z bieżących danych
    const o = W.fazyLat({ rev: [100, 110, 120, 100, 90, 85, 80, 115, 130, 150], zysk: [10, 12, 14, 5, 3, 2, 1, 13, 20, 25], wyplaty: [5, 5, 5, 0, 0, 0, 0, 0, 0, 0] });
    assert.deepStrictEqual(o, [4, 4, 4, 4, 4, 5, 5, 5, 3, 3]);

    // wydzielenie spółki (przychody −50 % w rok, marża bez zmian) to nie schyłek
    const w = W.fazyLat({ rev: [80, 82, 84, 86, 88, 40, 42, 44], zysk: [16, 16.4, 16.8, 17.2, 17.6, 8, 8.4, 8.8], wyplaty: [8, 8, 8, 8, 8, 4, 4, 4] });
    assert.ok(!w.includes(5), JSON.stringify(w));
});
