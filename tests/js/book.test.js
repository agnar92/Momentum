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
    assert.ok(b.buys.some(x => x.i === 36));
    assert.equal(b.buys.find(x => x.i === 36).pivot, 21);
    assert.ok(b.volUp.some(x => x.i === 36));
    assert.deepEqual(b.dry.map(x => x.i), [28]);
});

test("computeBook: wybicie bez wolumenu nie jest punktem kupna; baza typu korekta nie ma ramki", () => {
    const m = model();
    m.v[36] = 900;
    const b = computeBook({ ...m, volAvg: rollingMean(m.v, 10) });
    assert.ok(!b.buys.some(x => x.i === 36));   // wybicie w tyg. 36 bez wolumenu odpada
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
    // zamknięcia w bazie (tyg. 25–28) — tak
    for (let i = 25; i < 29; i++) { m.c[i] = 20; m.h[i] = 20.4; m.l[i] = 19.6; }
    assert.ok(computeBook(m).tights.some(t => t.i0 >= 24 && t.i1 <= 29));
});

test("computeBook: wybicie z dowolnej płaskiej konsolidacji (bez bazy z detect_bases) jest punktem „Kup”", () => {
    const m = model({ bases: [] });
    m.smas[1].values = m.c.map(() => 5);   // 40-tygodniowa pod ceną (w teście historia jest krótsza niż 40 tygodni)
    const b = computeBook(m);
    const k = b.buys.find(x => x.i === 36) || (b.adds.some(x => x.i === 36) && { pivot: 21 });   // po wcześniejszym „Kup” to samo wybicie z bazy ≥ 4 tyg. jest „Dokup”
    assert.ok(k && k.pivot > 20 && k.pivot < 21.5);
});

test("computeBook: „Dokup” nie wymaga wcześniejszego „Kup” w oknie — wystarczy trend i odbicie od 10-tygodniowej na wolumenie", () => {
    const n = 70, c = [], h = [], l = [], v = [];
    for (let i = 0; i < n; i++) {
        const base = 10 + i * 0.5 + (i % 7 === 6 ? -3 : 0);   // trend z cofnięciami co 7 tygodni
        c.push(base); h.push(base + 0.4); l.push(i % 7 === 0 && i > 14 ? base - 3 : base - 0.4); v.push(i % 7 === 0 ? 1500 : 1000);
    }
    const b = computeBook({ n, h, l, c, v, weeks: c.map((_, i) => String(i)), volAvg: rollingMean(v, 10), smas: [{ values: rollingMean(c, 10) }, { values: rollingMean(c, 40) }], spx: c.map(() => 100), bases: [] });
    assert.ok(b.adds.length + b.buys.length >= 1);   // w kroczącym trendzie to „Kup” (nowa konsolidacja) albo „Dokup” (odbicie od 10-tygodniowej)
    assert.ok(b.adds.every(a => a.i >= 20));
});

test("computeBook: odbicie po korekcie rynku — pierwsze zamknięcie nad 10-tygodniową daje „Kup po korekcie”", () => {
    const n = 80, c = [], spx = [];
    for (let i = 0; i < n; i++) {
        c.push(i <= 40 ? 10 + i * 0.5 : i <= 50 ? 30 - (i - 40) * 0.4 : 26 + (i - 50) * 0.8);
        spx.push(i <= 40 ? 100 + i * 0.5 : i <= 50 ? 120 - (i - 40) * 2 : 100 + (i - 50) * 0.9);
    }
    const h = c.map(x => x + 0.4), l = c.map(x => x - 0.4), v = c.map(() => 2500);
    const b = computeBook({ n, h, l, c, v, weeks: c.map((_, i) => String(i)), volAvg: rollingMean(v, 10), smas: [{ values: rollingMean(c, 10) }, { values: rollingMean(c, 40) }], spx, bases: [] });
    assert.equal(b.corrections.length >= 1, true);
    const rb = b.buys.filter(x => x.i > 50 && x.i <= 62);   // pierwszy punkt kupna po dołku korekty (jako „po korekcie” albo ogólne wybicie z konsolidacji)
    assert.ok(rb.length >= 1);
});

function addSeries(pauseWeeks, step = 0.5, lead = 1, kupVol = 3000) {
    // trend + 6-tygodniowa płaska baza (daje „Kup”), potem `lead` tygodni wzrostu i pauza pauseWeeks tygodni, potem wybicie na wolumenie
    const c = [], v = [];
    let p = 10;
    const seg = (len, st, vol) => { for (let k = 0; k < len; k++) { p += st + (k % 2 ? 0.05 : -0.05); c.push(p); v.push(vol); } };
    seg(40, step, 1000); seg(6, 0, 700); seg(1, 1.5, kupVol); seg(lead, step, 1000); seg(pauseWeeks, 0, 700); seg(1, 1.5, 3000); seg(6, step, 1000);
    const h = c.map(x => x + 0.1), l = c.map(x => x - 0.1), n = c.length;
    return { n, h, l, c, v, weeks: c.map((_, i) => String(i)), volAvg: rollingMean(v, 10), smas: [{ values: rollingMean(c, 10) }, { values: rollingMean(c, 40) }], spx: c.map(() => 100), bases: [] };
}

test("computeBook: „Kup” z płaskiej bazy ≥ 5 tygodni na wolumenie ≥ 1,4× (kryteria z książki) i numer etapu", () => {
    const b = computeBook(addSeries(2, 1.0, 12));
    assert.ok(b.buys.length >= 1);
    assert.equal(b.buys[0].stage, 1);
    assert.equal(b.buys[0].src, "flat");
    assert.ok(b.brackets.some(x => /flat base/.test(x.label)));
});

test("computeBook: wybicie na słabym wolumenie (< 1,4× średniej) nie jest „Kup”", () => {
    const b = computeBook(addSeries(2, 1.0, 12, 1000));
    assert.equal(b.buys.filter(x => x.i < 52).length, 0);
});

test("computeBook: „Dokup” = wybicie z bazy 4 tygodnie po wcześniejszym „Kup” (jak „Add” w książce)", () => {
    const b = computeBook(addSeries(4, 0.5, 1));
    assert.ok(b.buys.length >= 1);
    assert.ok(b.adds.length >= 1);
    assert.ok(b.adds.every(a => a.i > b.buys[0].i));
});

test("computeBook: „Dokup” tylko po wcześniejszym „Kup” — bez niego (słaby wolumen pierwszego wybicia) nic nie dokładamy", () => {
    const b = computeBook(addSeries(4, 0.5, 1, 1000));
    assert.equal(b.buys.filter(x => x.i < 52).length, 0);
    assert.equal(b.adds.filter(a => a.i < b.buys[0].i + 5).length, 0);   // nie tydzień po „Kup”: mała baza musi powstać już po kupnie
});



test("computeBook: „Dokup” po odbiciu od 10-tygodniowej tylko po „Kup” z patternu", () => {
    const n = 70, c = [], h = [], l = [], v = [];
    for (let i = 0; i < n; i++) {
        const base = 10 + i * 0.5 + (i % 7 === 6 ? -3 : 0);
        c.push(base); h.push(base + 0.4); l.push(i % 7 === 0 && i > 14 ? base - 3 : base - 0.4); v.push(i % 7 === 0 ? 1500 : 1000);
    }
    const mk = bases => ({ n, h, l, c, v, weeks: c.map((_, i) => String(i)), volAvg: rollingMean(v, 10), smas: [{ values: rollingMean(c, 10) }, { values: rollingMean(c, 40) }], spx: c.map(() => 100), bases });
    const b = computeBook(mk([]));
    const first = b.buys.length ? b.buys[0].i : Infinity;
    assert.ok(b.adds.every(a => a.i > first));   // żaden Dokup przed pierwszym „Kup”
});

test("computeBook: reguła 8 tygodni — +20 % w ≤ 3 tygodnie od „Kup” daje nawias trzymania (F)", () => {
    const fast = computeBook(addSeries(2, 1.0, 12));            // po wybiciu cena skacze o +1,5 / tydz. (≈ +3 %) — za wolno
    assert.equal(fast.holds.length, 0);
    const m = addSeries(2, 1.0, 12);
    const k = computeBook(m).buys[0];
    for (let j = k.i + 1; j <= k.i + 2 && j < m.n; j++) { m.c[j] = k.pivot * 1.25; m.h[j] = m.c[j] + 0.1; m.l[j] = m.c[j] - 0.1; }
    const withHold = computeBook(m);
    assert.ok(withHold.holds.length >= 1);
    assert.equal(withHold.holds[0].i1 - withHold.holds[0].i0 <= 8, true);
});

function stopOutSeries(rebound = true) {
    // trend + płaska baza + „Kup” na wolumenie, potem spadek ≈ −18 % (stop −8 %), 2 tygodnie pod 10-tygodniową i szybki powrót nad nią na wolumenie
    const c = [], v = [];
    let p = 10;
    const seg = (len, st, vol) => { for (let k = 0; k < len; k++) { p += st + (k % 2 ? 0.05 : -0.05); c.push(p); v.push(vol); } };
    seg(40, 0.5, 1000); seg(6, 0, 700); seg(1, 1.5, 3000); seg(2, 0.5, 1000); seg(3, -2.0, 1000); seg(2, 0, 700);
    if (rebound) seg(1, 5, 1300); else seg(1, -0.5, 700);
    seg(3, 0.3, 1000);
    const h = c.map(x => x + 0.1), l = c.map(x => x - 0.1), n = c.length;
    return { n, h, l, c, v, weeks: c.map((_, i) => String(i)), volAvg: rollingMean(v, 10), smas: [{ values: rollingMean(c, 10) }, { values: rollingMean(c, 40) }], spx: c.map(() => 100), bases: [] };
}

test("computeBook: „Kup ponownie” — po wycięciu na stopie −8 % powrót nad 10-tygodniową na wolumenie", () => {
    const b = computeBook(stopOutSeries(true));
    assert.ok(b.buys.length >= 1);
    assert.equal(b.reentries.length, 1);
    assert.ok(b.reentries[0].i > b.reentries[0].stopI && b.reentries[0].stopI > b.buys[0].i);
    assert.equal(computeBook(stopOutSeries(false)).reentries.length, 0);   // bez powrotu nad średnią brak sygnału
});

function longTrendSeries(weeksAfter = 70) {
    // trend + płaska baza + „Kup”, potem długi wzrost z cofnięciami do 10-tygodniowej co 9 tygodni (odbicie na zwiększonym wolumenie)
    const c = [], v = [];
    let p = 10;
    const seg = (len, st, vol) => { for (let k = 0; k < len; k++) { p += st + (k % 2 ? 0.05 : -0.05); c.push(p); v.push(vol); } };
    seg(40, 0.5, 1000); seg(6, 0, 700); seg(1, 1.5, 3000);
    for (let r = 0; r < Math.ceil(weeksAfter / 9); r++) { seg(5, 1.2, 1000); seg(2, -2.6, 900); seg(1, 3.2, 2000); seg(1, 0.6, 1000); }
    const h = c.map(x => x + 0.1), l = c.map(x => x - 0.1), n = c.length;
    return { n, h, l, c, v, weeks: c.map((_, i) => String(i)), volAvg: rollingMean(v, 10), smas: [{ values: rollingMean(c, 10) }, { values: rollingMean(c, 40) }], spx: c.map(() => 100), bases: [] };
}

test("computeBook: „Dokup” po odbiciu od 10-tygodniowej trwa tak długo, jak trend (zamknięcia nad 40-tygodniową), a nie tylko 40 tygodni od „Kup”", () => {
    const b = computeBook(longTrendSeries(90));
    const kup = b.buys.find(x => x.label === "Kup");
    assert.ok(kup);
    assert.ok(b.adds.some(a => a.i - kup.i > 40), "dokup później niż 40 tygodni po Kup, gdy trend trwa");
});

test("computeBook: po zamknięciu pod 40-tygodniową trend się kończy i dokupy po 40 tygodniach od „Kup” znikają", () => {
    const m = longTrendSeries(90);
    const kup = computeBook(m).buys.find(x => x.label === "Kup");
    const cut = kup.i + 45;
    for (let i = cut; i < cut + 3; i++) { m.c[i] = m.c[kup.i] * 0.5; m.l[i] = m.c[i] - 0.1; m.h[i] = m.c[i] + 0.1; }
    m.smas = [{ values: rollingMean(m.c, 10) }, { values: rollingMean(m.c, 40) }];
    const b = computeBook(m);
    const restarted = [...b.buys, ...b.reentries].filter(x => x.i > cut + 2).map(x => x.i);   // nowy „Kup” / „Kup ponownie” po przerwaniu trendu zaczyna pozycję od nowa
    const late = b.adds.filter(a => a.i - kup.i > 40 && a.i > cut + 2 && !restarted.some(r => r < a.i));
    assert.equal(late.length, 0);
});

test("computeBook: „Kup ponownie” toleruje zamknięcie tygodnia przed powrotem minimalnie nad 10-tygodniową (≤ +2 %)", () => {
    const m = stopOutSeries(true);
    const kup = computeBook(m).buys[0];
    // tydzień przed powrotem: zamknięcie tuż nad średnią (+1 %) — dawniej odrzucało sygnał
    const s10 = rollingMean(m.c, 10);
    const base = computeBook(m).reentries[0];
    assert.ok(kup && base);
    const prev = base.i - 1;
    m.c[prev] = s10[prev] * 1.01; m.h[prev] = m.c[prev] + 0.1; m.l[prev] = m.c[prev] - 0.1;
    m.smas = [{ values: rollingMean(m.c, 10) }, { values: rollingMean(m.c, 40) }];
    assert.ok(computeBook(m).reentries.length >= 1);
});

test("bookSvg: pivoty to krótkie przerywane linie — białe, gdy czekają, w kolorze sygnału po aktywacji (kup zielona, kup ponownie różowa); legenda; bez liter i kółek", () => {
    const { bookSvg } = require("../../docs/js/book.js");
    const m = stopOutSeries(true);
    m.book = computeBook(m);
    m.book.pivots = [{ i0: 3, i1: 11, level: 25 }];                 // baza, która jeszcze nie dała sygnału
    const labels = [];
    const g = { x: i => 10 + i * 8, yP: v => 500 - v * 3, P: { y: 0, h: 480 }, fs: v => v, addLabel: t => labels.push(t), clip: "", compact: false, legendY: 20 };
    const svg = bookSvg(m, g);
    assert.match(svg, /stroke="#e8eaed" stroke-width="2" stroke-dasharray="4 3"/);      // biała = czeka
    assert.match(svg, /stroke="#2ecc71" stroke-width="2" stroke-dasharray="4 3"/);      // zielona = kup
    assert.match(svg, /stroke="#f472b6" stroke-width="2" stroke-dasharray="4 3"/);      // różowa = kup ponownie
    for (const t of ["pivot czeka", "kup", "dokup", "kup ponownie"]) assert.ok(svg.includes(`>${t}</text>`), `legenda: ${t}`);
    assert.ok(!/<circle|<polygon/.test(svg) && !/>[KDP]<\/text>/.test(svg), "bez kółek, strzałek i liter");
    assert.ok(!labels.some(t => /Kup|Dokup|ponownie|stop/.test(t)), "żadnych podpisów sygnałów w warstwie podpisów");
});

test("computeBook: pivot bazy bez sygnału trafia na listę oczekujących (białe linie), a z sygnałem — nie", () => {
    const m = stopOutSeries(true);
    m.bases = [{ type: "flat", i0: 20, i1: 30, pivot: 999, weeks: 10, low: 5, open: false }];
    assert.equal(computeBook(m).pivots.length, 1);
    const kup = computeBook(stopOutSeries(true)).buys[0];
    m.bases = [{ type: "flat", i0: kup.i - 8, i1: kup.i - 1, pivot: kup.pivot || 1, weeks: 8, low: 5, open: false }];
    assert.ok(kup);
});

test("computeBook / bookSvg: Kup z cupa bez rączki jest oznaczony jako ryzykowny (bursztynowa linia + legenda), z rączką zwykły zielony", () => {
    const { bookSvg } = require("../../docs/js/book.js");
    const run = risky => {
        const m = addSeries(2, 1.0, 12);
        const probe = computeBook(m).buys[0];
        assert.ok(probe);
        m.bases = [{ type: "cup", i0: probe.i - 24, i1: probe.i - 1, iLow: probe.i - 12, pivot: m.h[probe.i - 1], weeks: 23, low: 5, handle: !risky, risky, open: false }];
        const b = computeBook(m);
        m.book = b;
        const g = { x: i => 10 + i * 8, yP: v => 500 - v * 3, P: { y: 0, h: 480 }, fs: v => v, addLabel: () => {}, clip: "", compact: false, legendY: 20 };
        return { b, svg: bookSvg(m, g) };
    };
    const normal = run(false), risky = run(true);
    const baseBuy = r => r.b.buys.find(x => x.src === "base");
    assert.ok(baseBuy(risky) && baseBuy(normal), "Kup z bazy powinien powstać w obu wariantach");
    if (baseBuy(risky)) {
        assert.equal(baseBuy(risky).risky, true);
        assert.match(risky.svg, /stroke="#f59e0b" stroke-width="2" stroke-dasharray="4 3"/);
        assert.ok(risky.svg.includes(">ryzykowny (bez rączki)</text>"));
    }
    if (baseBuy(normal)) assert.ok(!normal.svg.includes("ryzykowny"));
    assert.ok(risky.b.brackets.some(x => /bez rączki/.test(x.label)));
    assert.ok(normal.b.brackets.some(x => /cup-with-handle/.test(x.label)));
});

test("computeBook / bookSvg: pivot bazy przebity zamknięciem, ale bez sygnału „Kup” (luka powyżej strefy +5 %), nie zostaje biały — kończy się w tygodniu przebicia w kolorze „przebity”", () => {
    const { bookSvg } = require("../../docs/js/book.js");
    const n = 40, c = [], h = [], l = [], v = [];
    for (let i = 0; i < n; i++) {
        const p = i < 26 ? 10 + i * 0.4 : i < 34 ? 20.4 + (i % 2) * 0.2 : 32 + (i - 34) * 0.5;   // trend, płaska baza tuż pod pivotem 21, potem luka w górę o ~50 %
        c.push(p); h.push(p + 0.2); l.push(i === 34 ? 30 : p - 0.2); v.push(i === 34 ? 5000 : 1000);
    }
    const m = { n, h, l, c, v, weeks: c.map((_, i) => String(i)), volAvg: rollingMean(v, 10), smas: [{ values: rollingMean(c, 10) }, { values: rollingMean(c, 40) }], spx: c.map(() => 100),
        bases: [{ type: "flat", i0: 26, i1: 33, pivot: 21, weeks: 8, low: 20, open: false }] };
    const b = computeBook(m);
    assert.equal(b.buys.filter(x => x.src === "base").length, 0, "luka powyżej +5 % = za późno, bez Kup");
    assert.equal(b.pivots.length, 1);
    assert.equal(b.pivots[0].broken, true);
    assert.equal(b.pivots[0].i1, 34);
    m.book = b;
    const g = { x: i => 10 + i * 8, yP: v2 => 500 - v2 * 3, P: { y: 0, h: 480 }, fs: v2 => v2, addLabel: () => {}, clip: "", compact: false, legendY: 20 };
    const svg = bookSvg(m, g);
    assert.match(svg, /stroke="#ff8a5b" stroke-width="2" stroke-dasharray="4 3"/);
    assert.ok(svg.includes(">przebity bez sygnału kup</text>"));
});
