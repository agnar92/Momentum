const test = require("node:test");
const assert = require("node:assert/strict");
const { darvasBoxes, darvasSvg, darvasBoxInfo, darvasBoxSheetHtml } = require("../../docs/js/darvas.js");

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
    assert.ok(boxes[1].top > first.top && boxes[1].bottom > first.bottom);     // schodek w górę
});

test("darvasBoxes: złamanie dołka zamyka pudełko jako „down”; szybkie przebicie góry daje pudełko z niepotwierdzonym dołkiem", () => {
    const down = darvasBoxes([100, 103, 108, 105, 104, 103, 104, 105, 106, 101, 99, 98, 97, 98, 97]);
    assert.equal(down[0].outcome, "down");
    assert.ok(down[0].i1 > down[0].i0);
    assert.deepEqual(darvasBoxes([100, 110, 109, 111, 112, 113, 114, 116, 118, 120, 122]), []);   // czysty trend bez konsolidacji
    const quick = darvasBoxes([100, 110, 108, 107, 106, 111, 113]);
    assert.equal(quick.length, 1);
    assert.deepEqual([quick[0].top, quick[0].bottom, quick[0].confirmed, quick[0].outcome], [110, 106, false, "up"]);
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
    assert.match(svg, /Box 104\.00–110\.00 \(wybite w górę\)/);
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
    const waiting = { ticker: "AAA", price: 106, c: box1, v: vol };
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
