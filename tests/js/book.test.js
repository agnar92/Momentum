// Testy czystych funkcji opisów „jak w książce” (docs/js/book.js).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { bookLogTicks, bookAxisFmt, tightCloseRuns, marketCorrections, splitLabel, computeBook, shiftBook } = require(path.join("..", "..", "docs", "js", "book.js"));
const { rollingMean } = require(path.join("..", "..", "docs", "js", "chart.js"));

test("bookLogTicks: równe skoki procentowe (jak oś ceny w książce), w granicach zakresu", () => {
    const t = bookLogTicks(4, 180, 14);
    assert.ok(t.length >= 10 && t[0] >= 4 && t[t.length - 1] <= 180);
    const ratios = t.slice(1).map((v, i) => v / t[i]);
    ratios.forEach(r => assert.ok(Math.abs(r - ratios[0]) < 1e-9));
    assert.ok(ratios[0] >= 1.12 && ratios[0] < 1.4);
    assert.deepEqual(bookLogTicks(0, 5), []);
});

test("bookAxisFmt: dwie cyfry znaczące jak na osi z książki", () => {
    assert.equal(bookAxisFmt(100.4), "100");
    assert.equal(bookAxisFmt(33.7), "34");
    assert.equal(bookAxisFmt(4.46), "4.5");
    assert.equal(bookAxisFmt(0.3512), "0.35");
});

test("tightCloseRuns: min. 3 kolejne tygodnie z zamknięciami w 1,5 %", () => {
    const c = [10, 10.1, 10.8, 11.0, 11.05, 11.1, 11.12, 12, 13, 12.9, 12.95];
    const runs = tightCloseRuns(c);
    assert.deepEqual(runs.map(r => [r.i0, r.i1, r.n]), [[3, 6, 4], [8, 10, 3]]);
    assert.deepEqual(tightCloseRuns([10, 11, 12, 13]), []);
});

test("marketCorrections: spadek ≥ 8 % od szczytu do nowego szczytu; płytka korekta się nie liczy", () => {
    const spx = [100, 104, 108, 100, 96, 99, 104, 109, 110, 107, 108];
    const cr = marketCorrections(spx, 8);
    assert.equal(cr.length, 1);
    assert.deepEqual([cr[0].i0, cr[0].iLow, cr[0].i1], [2, 4, 7]);
    assert.ok(cr[0].drop >= 11);
    assert.deepEqual(marketCorrections([100, 103, 99, 104, 101, 106], 8), []);
    // trwająca korekta kończy się na ostatnim punkcie
    assert.equal(marketCorrections([100, 110, 99, 95, null], 8)[0].i1, 3);
});

test("splitLabel: 2/1, 3/2, odwrotny 1/5", () => {
    assert.equal(splitLabel(2), "2/1");
    assert.equal(splitLabel(1.5), "3/2");
    assert.equal(splitLabel(0.2), "1/5");
    assert.equal(splitLabel(1), "");
});

// płaska baza (tyg. 20–35) pod pivotem 21, wybicie w tyg. 36 na wolumenie; trend wzrostowy przed i po
function series() {
    const n = 70, h = [], l = [], c = [], v = [];
    for (let i = 0; i < n; i++) {
        let base = i < 20 ? 10 + i * 0.5 : i < 36 ? 19.5 + (i % 3) * 0.4 : 21.5 + (i - 36) * 0.6;
        c.push(+base.toFixed(2)); h.push(+(base + 0.6).toFixed(2)); l.push(+(base - 0.6).toFixed(2)); v.push(1000);
    }
    v[36] = 2600;             // wybicie na wolumenie
    v[28] = 400;              // wyschnięcie w bazie
    c[36] = 21.6; h[36] = 22.2;
    return { n, h, l, c, v };
}
function model(extra = {}) {
    const s = series();
    return { ...s, weeks: s.c.map((_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`), volAvg: rollingMean(s.v, 10), smas: [{ values: rollingMean(s.c, 10) }, { values: rollingMean(s.c, 40).map(x => x) }], spx: s.c.map(() => 100), bases: [{ type: "flat", i0: 20, i1: 35, pivot: 21, weeks: 16, low: 18.9 }], ...extra };
}

test("computeBook: ramka bazy z liczbą tygodni, punkt kupna na wybiciu z wolumenem, wyschnięcie i strzałka wolumenu", () => {
    const b = computeBook(model());
    assert.equal(b.brackets.length, 1);
    assert.match(b.brackets[0].label, /16-tyg\. flat base/);
    assert.deepEqual(b.buys.map(x => x.i), [36]);
    assert.equal(b.buys[0].pivot, 21);
    assert.ok(b.volUp.some(x => x.i === 36));
    assert.deepEqual(b.dry.map(x => x.i), [28]);
});

test("computeBook: wybicie bez wolumenu nie jest punktem kupna; baza typu korekta nie ma ramki", () => {
    const m = model();
    m.v[36] = 900;
    const b = computeBook({ ...m, volAvg: rollingMean(m.v, 10) });
    assert.deepEqual(b.buys, []);
    assert.deepEqual(computeBook(model({ bases: [{ type: "correction", i0: 20, i1: 35, pivot: 21, weeks: 16, low: 18.9 }] })).brackets, []);
});

test("computeBook: IPO (puste tygodnie na początku) i splity z etykietą", () => {
    const m = model();
    m.c = m.c.map((x, i) => (i < 5 ? null : x));
    const b = computeBook(m, [{ i: 40, r: 2 }, { i: 50, r: 1 }]);
    assert.equal(b.ipo.i, 5);
    assert.deepEqual(b.splits.map(s => [s.i, s.label, s.up]), [[40, "2/1", true]]);
    assert.equal(computeBook(model()).ipo, null);
});

test("shiftBook: przesuwa indeksy o odcięcie okna i odrzuca elementy poza oknem", () => {
    const b = computeBook(model(), [{ i: 40, r: 2 }]);
    const s = shiftBook(b, 30, 30);   // okno [30, 60)
    assert.deepEqual(s.buys.map(x => x.i), [6]);
    assert.equal(s.splits[0].i, 10);
    assert.equal(s.brackets.length, 1);               // baza kończy się w tyg. 35 → widoczna część
    assert.equal(s.brackets[0].i0, -10);
    assert.deepEqual(shiftBook(b, 40, 20).brackets, []);   // okno [40, 60): baza całkiem przed oknem
    assert.equal(shiftBook(null, 0, 10), null);
});

test("computeBook: ciasne zamknięcia tylko w bazie / po kupnie, nie gdziekolwiek", () => {
    const m = model();
    m.smas[1].values = m.c.map(() => 5);   // 40-tygodniowa pod ceną (w teście historia jest krótsza niż 40 tygodni)
    // płaski odcinek zamknięć poza bazą i daleko od kupna (tyg. 55–59) nie dostaje elipsy
    for (let i = 55; i < 60; i++) { m.c[i] = 40; m.h[i] = 40.5; m.l[i] = 39.5; }
    const far = computeBook(m);
    assert.ok(!far.tights.some(t => t.i0 >= 54));
    // zamknięcia w bazie (tyg. 25–28) — tak
    for (let i = 25; i < 29; i++) { m.c[i] = 20; m.h[i] = 20.4; m.l[i] = 19.6; }
    assert.ok(computeBook(m).tights.some(t => t.i0 >= 24 && t.i1 <= 29));
});

test("computeBook: wybicie z dowolnej płaskiej konsolidacji (bez bazy z detect_bases) jest punktem „Kup”", () => {
    const m = model({ bases: [] });
    m.smas[1].values = m.c.map(() => 5);   // 40-tygodniowa pod ceną (w teście historia jest krótsza niż 40 tygodni)
    const b = computeBook(m);
    assert.deepEqual(b.buys.map(x => x.i), [36]);
    assert.ok(b.buys[0].pivot > 20 && b.buys[0].pivot < 21.5);
});

test("computeBook: „Dokup” nie wymaga wcześniejszego „Kup” w oknie — wystarczy trend i odbicie od 10-tygodniowej na wolumenie", () => {
    const n = 70, c = [], h = [], l = [], v = [];
    for (let i = 0; i < n; i++) {
        const base = 10 + i * 0.5 + (i % 7 === 6 ? -3 : 0);   // trend z cofnięciami co 7 tygodni
        c.push(base); h.push(base + 0.4); l.push(i % 7 === 0 && i > 14 ? base - 3 : base - 0.4); v.push(i % 7 === 0 ? 1500 : 1000);
    }
    const b = computeBook({ n, h, l, c, v, weeks: c.map((_, i) => String(i)), volAvg: rollingMean(v, 10), smas: [{ values: rollingMean(c, 10) }, { values: rollingMean(c, 40) }], spx: c.map(() => 100), bases: [] });
    assert.ok(b.adds.length >= 1);
    assert.ok(b.adds.every(a => a.i >= 40));
});

test("computeBook: odbicie po korekcie rynku — pierwsze zamknięcie nad 10-tygodniową daje „Kup po korekcie”", () => {
    const n = 80, c = [], spx = [];
    for (let i = 0; i < n; i++) {
        c.push(i <= 40 ? 10 + i * 0.5 : i <= 50 ? 30 - (i - 40) * 0.4 : 26 + (i - 50) * 0.8);
        spx.push(i <= 40 ? 100 + i * 0.5 : i <= 50 ? 120 - (i - 40) * 2 : 100 + (i - 50) * 0.9);
    }
    const h = c.map(x => x + 0.4), l = c.map(x => x - 0.4), v = c.map(() => 2500);
    const b = computeBook({ n, h, l, c, v, weeks: c.map((_, i) => String(i)), volAvg: rollingMean(v, 10), smas: [{ values: rollingMean(c, 10) }, { values: rollingMean(c, 40) }], spx, bases: [] });
    const rb = b.buys.filter(x => x.label === "Kup po korekcie");
    assert.equal(b.corrections.length >= 1, true);
    assert.equal(rb.length, 1);
    assert.ok(rb[0].i > 50 && rb[0].i <= 62);
    assert.equal(rb[0].pivot, null);
});

test("computeBook: „Dokup” także w mocnym trendzie bez dotknięcia 10-tygodniowej — wznowienie po krótkim cofnięciu na wolumenie", () => {
    const n = 70, c = [], h = [], l = [], v = [];
    for (let i = 0; i < n; i++) {
        c.push(10 + i * 0.8 - (i % 5 === 3 ? 0.9 : 0));   // stromy trend z jednotygodniowym cofnięciem co 5 tygodni
        h.push(c[i] + 0.3); l.push(c[i] - 0.3); v.push(1000 + (i % 5 === 4 ? 600 : 0));
    }
    const sma10 = rollingMean(c, 10);
    assert.ok(c.every((x, i) => i < 20 || l[i] > sma10[i] * 1.04));   // cena nigdy nie wraca do 10-tygodniowej
    const b = computeBook({ n, h, l, c, v, weeks: c.map((_, i) => String(i)), volAvg: rollingMean(v, 10), smas: [{ values: sma10 }, { values: rollingMean(c, 40) }], spx: c.map(() => 100), bases: [] });
    assert.ok(b.adds.length >= 3);
    assert.ok(b.adds.every(a => c[a.i - 1] < c[a.i - 2]));   // zawsze po tygodniu spadkowym
});
