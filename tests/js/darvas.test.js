const test = require("node:test");
const assert = require("node:assert/strict");
const { darvasBoxes, darvasScan, darvasTopLines, darvasLineInfo, darvasSvg, darvasBoxInfo, darvasBoxSheetHtml, boxNatr, natrGrade, natrSeries, darvasSma, darvasOverview } = require("../../docs/js/darvas.js");

// schodek: 100 → box 100–110 (dół 104 potwierdzony), wybicie 112 → box 112–120 …
const SERIES = [100, 102, 105, 110, 108, 106, 104, 105, 107, 109, 112, 114, 118, 120, 117, 115, 113, 114, 116, 118, 121];

test("darvasBoxes: góra i dół potwierdzone przez 3 tygodnie, zamknięcie nad górą = wybicie i nowe pudełko", () => {
    const boxes = darvasBoxes(SERIES);
    assert.ok(boxes.length >= 2);
    const first = boxes[0];
    assert.equal(first.top, 110);
    assert.equal(first.bottom, 104);
    assert.equal(first.outcome, "up");
    assert.equal(SERIES[first.i1], 112);
    assert.equal(first.end, boxes[1].i0);                                        // wybity box obowiązuje, aż powstanie nowy wyżej
    assert.ok(boxes[1].top > first.top && boxes[1].bottom > first.bottom);     // schodek w górę
});

test("darvasBoxes: złamanie dołka zamyka pudełko jako „down”; tylko potwierdzone boxy, sam top = linia", () => {
    const down = darvasBoxes([100, 103, 108, 105, 104, 103, 104, 105, 106, 101, 99, 98, 97, 98, 97]);
    assert.equal(down[0].outcome, "down");
    assert.ok(down[0].i1 > down[0].i0);
    assert.deepEqual(darvasBoxes([100, 110, 109, 111, 112, 113, 114, 116, 118, 120, 122]), []);   // czysty trend bez konsolidacji
    const quick = [100, 110, 108, 107, 106, 111, 113];   // góra 110 potwierdzona, dół jeszcze nie — przebicie: tylko linia topu
    assert.deepEqual(darvasBoxes(quick), []);
    assert.deepEqual(darvasTopLines(quick), [{ i0: 1, i1: 5, top: 110, open: false }]);
    assert.deepEqual(darvasTopLines([100, 110, 108, 107, 106]), [{ i0: 1, i1: 4, top: 110, open: true }]);   // top czeka na wybicie
    assert.deepEqual(darvasLineInfo(110), { entry: 110, stop: 101.2, stopPct: 8 });
    assert.deepEqual(darvasBoxes([1, 2]), []);
});

test("darvasBoxes: puste miejsce na osi (null) i otwarte pudełko na końcu", () => {
    const open = darvasBoxes([100, 110, 108, 106, 104, 105, 107, 106, 108, null, null]);
    assert.equal(open.length, 1);
    assert.equal(open[0].outcome, "open");
    assert.equal(open[0].top, 110);
});

test("darvasSvg: pudełka, punkty kupna i stopu; mało danych = komunikat", () => {
    const full = { c: SERIES, weeks: SERIES.map((_, i) => `2026-${String(1 + Math.floor(i / 4)).padStart(2, "0")}-0${1 + (i % 4)}`), n: SERIES.length, ticker: "AAA" };
    const svg = darvasSvg(full, { n: SERIES.length, end: SERIES.length });
    assert.match(svg, /<rect [^>]*stroke="#ffffff"/);
    assert.match(svg, /data-box="110\|104\|up\|1\|3\|10"/);                  // klikalny box z cenami
    assert.doesNotMatch(svg, /kup nad|stop pod|stroke-dasharray="2 3"/);   // bez linii i podpisów
    assert.match(svg, /Box 104–110 · wybite w górę/);
    const withLine = { c: [100, 110, 108, 107, 106, 111, 113], weeks: ["a", "b", "c", "d", "e", "f", "g"], n: 7 };
    const lineSvg = darvasSvg(withLine, { n: 7, end: 7 });
    assert.match(lineSvg, /data-box="110\|101\.2\|linia\|0\|1\|5"/);   // klikalna niebieska linia samego topu (stop 8 %)
    assert.match(lineSvg, /stroke="#3b9cff" stroke-width="2" stroke-dasharray="6 4"/);
    assert.match(lineSvg, /stroke="#ff6b6b" stroke-width="1.6" stroke-dasharray="4 3"/);   // stop 8 % pod linią topu widoczny od razu
    assert.match(lineSvg, /stop 8 % · 101\.2/);
    assert.match(lineSvg, /stroke="#4ee08a" stroke-width="[\d.]+" stroke-linecap="round"/);   // linia cen: zielony odcinek przy wzroście
    assert.match(lineSvg, /stroke="#ff6b6b" stroke-width="[\d.]+" stroke-linecap="round"/);   // czerwony przy spadku
    assert.match(darvasSvg({ c: [1], weeks: ["2026-01-01"], n: 1 }, { n: 1, end: 1 }), /Za mało danych/);
});

test("darvasBoxInfo / darvasBoxSheetHtml: wejście = góra, anulowanie = dół, strefa ryzyka 5 % pod dołem", () => {
    const i = darvasBoxInfo(100, 90);
    assert.deepEqual([i.entry, i.cancel, i.stop, i.stopPct, i.depthPct], [100, 90, 85.5, 14.5, 10]);
    const html = darvasBoxSheetHtml(i, "open", false);
    assert.match(html, /Cena wejścia[\s\S]*100\.00/);
    assert.match(html, /Początek strefy ryzyka[\s\S]*90\.00/);
    assert.match(html, /Exit[\s\S]*85\.50/);
    assert.match(html, /niepotwierdzony/);
});

test("darvasStatus: KUP po wybiciu, TRZYMAJ w najwyższym boxie, SPRZEDAJ po wyższym boxie pod dnem, CZEKAJ w pierwszym", () => {
    const { darvasStatus } = require("../../docs/js/darvas.js");
    const box1 = [100, 104, 108, 110, 108, 106, 104, 105, 107, 106];   // góra 110, dół 104
    assert.equal(darvasStatus(box1).state, "WAIT");
    assert.equal(darvasStatus([...box1, 112]).state, "BUY");
    const box2 = [...box1, 112, 116, 120, 118, 116, 114, 115, 117, 116];   // wyższy box 114–120 po wybiciu
    const hold = darvasStatus(box2);
    assert.equal(hold.state, "HOLD");
    assert.equal(hold.stop, Math.round(114 * 0.95 * 100) / 100);
    assert.equal(darvasStatus([...box2, 110]).state, "SELL");
    assert.equal(darvasStatus([100, 101]).state, "NONE");
});

test("darvasStatus: kontrola wybicia — wolumen ≥ 1,4× i najwyżej 10 % nad górą", () => {
    const { darvasStatus } = require("../../docs/js/darvas.js");
    const box1 = [100, 104, 108, 110, 108, 106, 104, 105, 107, 106];
    const vol = [...box1.map(() => 100), 100];
    assert.equal(darvasStatus([...box1, 112], 5, 3, 3, vol).state, "NOVOL");   // wolumen 1,0× < 1,4×
    assert.equal(darvasStatus([...box1, 112], 5, 3, 3, [...box1.map(() => 100), 160]).state, "BUY");
    assert.equal(darvasStatus([...box1, 118], 5, 3, 3, [...box1.map(() => 100), 160]).state, "BUY");   // 7,3 % nad górą mieści się w limicie 10 %
    assert.equal(darvasStatus([...box1, 125], 5, 3, 3, [...box1.map(() => 100), 160]).state, "LATE");   // 13,6 % nad górą
    assert.equal(darvasStatus([...box1, 125], 5, 3, 3, vol).state, "NOVOL");   // brak wolumenu ma pierwszeństwo przed oddaleniem
    assert.equal(darvasStatus([...box1, 112]).state, "BUY");   // bez danych o wolumenie filtr wolumenu pomijamy
});

test("darvasPinStatus: nad górą / w boxie / w strefie zagrożenia (5 % pod dołem) / exit pod strefą", () => {
    const { darvasPinStatus } = require("../../docs/js/darvas.js");
    const box = { top: 100, bottom: 90 };
    assert.equal(darvasPinStatus(box, 104).state, "ABOVE");
    assert.equal(darvasPinStatus(box, 95).state, "INSIDE");
    assert.equal(darvasPinStatus(box, 88).state, "ZONE");      // strefa 85,5–90
    assert.equal(darvasPinStatus(box, 85).state, "EXIT");
    assert.equal(darvasPinStatus(null, 100).state, "NONE");
});

test("darvasOverview: sekcje monitorowane / nowe / KUP / czekaj, klucz i data początku boxa", () => {
    const { darvasOverview } = require("../../docs/js/darvas.js");
    const weeks = Array.from({ length: 12 }, (_, i) => `2026-0${1 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, "0")}`);
    const box1 = [100, 104, 108, 110, 108, 106, 104, 105, 107, 106];
    const vol = box1.map(() => 100);
    const waiting = { ticker: "AAA", price: 106, c: box1, v: vol };   // góra 110 (tydz. 3) i dół 104 potwierdzone → „nowy” box przez 4 tygodnie
    const breakout = { ticker: "BBB", price: 112, c: [...box1, 112], v: [...vol, 160] };
    const ov = darvasOverview([waiting, breakout], weeks, { AAA: { top: 110, bottom: 104, start: weeks[3] } });
    assert.equal(ov.wait.length, 1);
    assert.equal(ov.wait[0].ticker, "AAA");
    assert.equal(ov.buy.length, 1);
    assert.equal(ov.buy[0].ticker, "BBB");
    assert.equal(ov.pinned.length, 1);
    assert.equal(ov.pinned[0].state, "INSIDE");
    assert.ok(ov.fresh.length >= 1 && /^AAA\|110\|104\|/.test(ov.fresh.find(r => r.ticker === "AAA").key));
    assert.equal(ov.wait[0].box.start, weeks[3]);
});

test("darvasCupGeometry / darvasCupStatus: miska i rączka z zamknięć, pivot = góra rączki", () => {
    const { darvasCupGeometry, darvasCupStatus } = require("../../docs/js/darvas.js");
    //            0    1   2   3   4   5   6   7   8   9   10  11  12
    const c = [100, 96, 90, 84, 80, 82, 88, 94, 99, 97, 96, 98, 99];
    const cup = { i0: 0, iLow: 4, i1: 8, noHandle: false, handle: { iLow: 10, iEnd: 11 } };
    const g = darvasCupGeometry(c, cup);
    assert.deepEqual([g.i0, g.ib, g.i1, g.left, g.bottom, g.rim], [0, 4, 8, 100, 80, 99]);
    assert.deepEqual([g.handle.top, g.handle.bottom, g.pivot, g.depthPct], [99, 96, 99, 20]);
    assert.equal(darvasCupStatus(c, [cup]).state, "WAIT");   // ostatnie zamknięcie 99 = pivot, jeszcze nie nad nim
    assert.equal(darvasCupStatus([...c, 103], [cup]).state, "ABOVE");
    const noH = darvasCupGeometry(c, { i0: 0, iLow: 4, i1: 8, noHandle: true, handle: null });
    assert.ok(noH.noHandle && noH.pivot === 100 && noH.handle === null);
    assert.equal(darvasCupGeometry(c, { i0: 4, iLow: 4, i1: 8 }), null);   // dołek na krawędzi = nie miska
});

test("darvasInitialStop: dokładnie 10 % pod wejściem; BOX FAILUJE przy wejściu w strefę; wyjście MACD", () => {
    const { darvasInitialStop, darvasStatus, darvasMacdBelow } = require("../../docs/js/darvas.js");
    assert.equal(darvasInitialStop(110, 100, 110), 99);
    assert.equal(darvasInitialStop(120, 80, 120), 108);
    assert.equal(darvasInitialStop(110, 100, 112), 100.8);
    const box1 = [100, 104, 108, 110, 108, 106, 104, 105, 107, 106];
    const st = darvasStatus([...box1, 112]);
    assert.equal(st.state, "BUY");
    assert.equal(st.stop, 100.8);
    const rising = Array.from({ length: 60 }, (_, i) => 100 + i ** 1.6);
    assert.equal(darvasMacdBelow(rising), false);
    const falling = [...rising, ...Array.from({ length: 12 }, (_, i) => rising[59] - (i + 1) * 15)];
    assert.equal(darvasMacdBelow(falling), true);
    assert.equal(darvasMacdBelow([1, 2, 3]), null);
});

// --- port reguł z Momentum Desktop (boxy potwierdzone, linie niepotwierdzonych topów, śledzenie wybitego boxa) ---
const DS = [10, 11, 12, 13, 12.5, 12.0, 11.8, 12.2, 12.4, 12.1, 12.3];   // góra 13 (idx 3), dół 11,8 (idx 6) potwierdzony po 3 tygodniach
const MRVL = [66.14, 65.35, 58.92, 60.22, 68.93, 71.44, 75.81, 65.83, 74.06, 73.45, 70.59, 73.0, 73.65, 79.47, 81.22, 84.36, 93.35, 87.41, 92.07, 92.25,
    112.97, 120.19, 111.36, 113.08, 117.61, 113.83, 124.22, 123.49, 112.38, 110.15, 106.05, 103.36, 91.43, 70.54, 68.45, 70.09, 61.77];

test("Desktop: góra i dół potrzebują 3 kolejnych tygodni, spadający nóż nie tworzy boxów", () => {
    const bx = darvasBoxes(DS);
    assert.deepEqual(bx.map(b => [b.i0, b.top, b.bottom, b.outcome]), [[3, 13, 11.8, "open"]]);
    assert.deepEqual(darvasTopLines(DS), []);
    assert.deepEqual(darvasTopLines([10, 11, 12, 13, 12.5, 12.0]), []);   // za wcześnie: tylko 2 tygodnie po topie
    assert.deepEqual(darvasBoxes([10, 11, 12, 13, 12, 11, 10, 9, 8, 7, 6]), []);
});

test("Desktop: sam top = linia, wybicie samego topu daje KUP ze stopem 8 %", () => {
    const { darvasStatus } = require("../../docs/js/darvas.js");
    const c = [10, 11, 12, 13, 12.5, 12.0, 11.8];
    assert.deepEqual(darvasBoxes(c), []);
    const st = darvasStatus(c);
    assert.ok(st.state === "WAIT" && st.stop === 11.96);
    const broken = darvasStatus([...c, 13.5]);
    assert.ok(broken.state === "BUY" && broken.stop === 11.96);
});

test("Desktop: próba przebicia — box obowiązuje do wejścia ceny w jego strefę zagrożenia (wtedy anulowany + SPRZEDAJ)", () => {
    const { darvasStatus } = require("../../docs/js/darvas.js");
    const up = [...DS, 13.5];
    assert.ok(darvasBoxes(up)[0].outcome === "up" && darvasStatus(up).state === "BUY");
    const back = darvasStatus([...up, 12.8, 12.0]);   // powrót do boxa: nadal obowiązuje
    assert.ok(back.state === "HOLD" && /w boxie/.test(back.text));
    const cancelled = [...up, 12.8, 12.0, 11.5];     // zejście pod dno 11,8 = strefa zagrożenia
    const bx = darvasBoxes(cancelled);
    assert.ok(bx[0].cancelled && bx[0].end === up.length + 2);
    assert.equal(darvasStatus(cancelled).state, "SELL");
    assert.match(darvasStatus(cancelled).text, /BOX FAILUJE/);
});

test("Desktop: podwójne wybicie kupuje ponownie, nowy box wyżej przejmuje obowiązywanie", () => {
    const { darvasStatus } = require("../../docs/js/darvas.js");
    const c = [10, 11, 12, 13, 12.5, 12.0, 11.8, 12.2, 12.4, 12.1, 11.9, 13.5, 12.8, 13.6];
    assert.equal(darvasStatus(c.slice(0, 12)).state, "BUY");
    assert.equal(darvasStatus(c.slice(0, 13)).state, "HOLD");
    assert.equal(darvasStatus(c).state, "BUY");
    const [old, nw] = darvasBoxes([...DS, 13.5, 14, 14.5, 14.2, 14.0, 14.1, 14.3, 14.2]);
    assert.ok(old.outcome === "up" && old.end === nw.i0 && nw.i0 === 13 && !old.cancelled);
    assert.deepEqual([nw.top, nw.bottom], [14.5, 14.0]);
});

test("Desktop: box złamany bez wybicia = odwrócony, SPRZEDAJ od razu; powrót nad dno = CZEKAJ", () => {
    const { darvasStatus } = require("../../docs/js/darvas.js");
    const c = [...DS, 11.5];
    const bx = darvasBoxes(c);
    assert.ok(bx[0].outcome === "down" && bx[0].i1 === DS.length);
    assert.equal(darvasStatus(c).state, "SELL");
    assert.equal(darvasStatus([...DS, 11.5, 12.9]).state, "WAIT");
});

test("Desktop (MRVL): wybity box anulowany w strefie zagrożenia, brak wielkiego boxa przez całą korektę", () => {
    const { darvasStatus } = require("../../docs/js/darvas.js");
    const bx = darvasBoxes(MRVL);
    const r = bx.find(b => b.top === 120.19);
    assert.ok(r.outcome === "up" && r.cancelled && r.end === MRVL.indexOf(110.15));
    assert.ok(!bx.some(b => b.top === 124.22));
    assert.ok(Math.max(...bx.map(b => (b.top - b.bottom) / b.top)) < 0.2);
    assert.equal(darvasStatus(MRVL.slice(0, 28)).state, "HOLD");
    assert.equal(darvasStatus(MRVL).state, "SELL");
});

test("Desktop: przypięty sam top ma stop 8 % i nie ma strefy zagrożenia", () => {
    const { darvasPinStatus } = require("../../docs/js/darvas.js");
    const pin = { top: 13, bottom: 11.96, line: true };
    assert.equal(darvasPinStatus(pin, 13.5).state, "ABOVE");
    assert.equal(darvasPinStatus(pin, 12.5).state, "INSIDE");
    assert.equal(darvasPinStatus(pin, 12.0).state, "INSIDE");
    const ex = darvasPinStatus(pin, 11.9);
    assert.ok(ex.state === "EXIT" && /11\.96/.test(ex.text));
});

test("Desktop: Boxy — spółka z samym topem trafia do sekcji z linią jako boxem", () => {
    const { darvasOverview } = require("../../docs/js/darvas.js");
    const weeks = Array.from({ length: 8 }, (_, i) => `w${i}`);
    const ov = darvasOverview([{ ticker: "LIN", price: 111, c: [100, 110, 108, 107, 106, 111, 113], v: [] }], weeks, {});
    const row = [...ov.buy, ...ov.check, ...ov.hold, ...ov.wait].find(r => r.ticker === "LIN");
    assert.ok(row && row.box.line === true && row.box.bottom === 101.2);
});

test("boxNatr: średni True Range tygodni boxa w % średniego zamknięcia, luka się liczy", () => {
    const n = 8, c = Array(n).fill(100), h = Array(n).fill(102), l = Array(n).fill(98);
    assert.equal(boxNatr(h, l, c, 0, n - 1), 4);   // TR = 4 przy cenie 100
    const hg = h.slice(), lg = l.slice(), cg = c.slice();
    hg[5] = 112; lg[5] = 108; cg[5] = 110;   // luka +10 od poprzedniego zamknięcia: TR = 12
    assert.ok(boxNatr(hg, lg, cg, 0, n - 1) > 4);
    assert.equal(boxNatr(h, l, c, 0, 2), null);   // mniej niż 3 tygodnie danych
    assert.equal(boxNatr(h, l, c, 0, n + 5), 4);   // i1 poza danymi jest przycinane
});

test("natrGrade: skala z Blueprintu (< 5 ciasny, < 8 dobry, < 12 luźny, dalej za szeroki)", () => {
    assert.equal(natrGrade(3).key, "tight");
    assert.equal(natrGrade(7.9).key, "ok");
    assert.equal(natrGrade(10).key, "loose");
    assert.equal(natrGrade(20).key, "wide");
    assert.equal(natrGrade(null).key, "na");
});

test("darvasOverview: wiersz niesie NATR boxa, gdy są h i l", () => {
    const c = [100, 102, 105, 110, 108, 106, 104, 105, 107, 109, 112, 114, 118, 120, 117, 115, 113, 114, 116, 118, 121];
    const h = c.map(v => v + 2), l = c.map(v => v - 2);
    const weeks = c.map((_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
    const ov = darvasOverview([{ ticker: "AAA", price: 121, c, v: c.map(() => 1000), h, l }], weeks);
    const rows = Object.values(ov).flat().filter(r => r.ticker === "AAA");
    assert.ok(rows.length > 0 && rows.some(r => Number.isFinite(r.natr) && r.natr > 0));
});

test("natrSeries: zgodna z NATR boxa na stałym zakresie i pusta przed pełnym oknem", () => {
    const n = 30, c = Array(n).fill(100), h = Array(n).fill(102), l = Array(n).fill(98);
    const ns = natrSeries(h, l, c);
    assert.equal(ns[10], null);
    assert.equal(ns[n - 1], 4);
    assert.equal(natrSeries([], [], []).length, 0);
});

test("darvasSma: średnia krocząca, null przed pełnym oknem i przy luce", () => {
    assert.deepEqual(darvasSma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
    assert.deepEqual(darvasSma([1, null, 3, 4], 2), [null, null, null, 3.5]);
});
