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

test("darvasStatus: kontrola wybicia — wolumen ≥ 1,4× i najwyżej 5 % nad górą", () => {
    const { darvasStatus } = require("../../docs/js/darvas.js");
    const box1 = [100, 104, 108, 110, 108, 106, 104, 105, 107, 106];
    const vol = [...box1.map(() => 100), 100];
    assert.equal(darvasStatus([...box1, 112], 5, 3, 3, vol).state, "NOVOL");   // wolumen 1,0× < 1,4×
    assert.equal(darvasStatus([...box1, 112], 5, 3, 3, [...box1.map(() => 100), 160]).state, "BUY");
    assert.equal(darvasStatus([...box1, 118], 5, 3, 3, [...box1.map(() => 100), 160]).state, "LATE");   // 7,3 % nad górą
    assert.equal(darvasStatus([...box1, 112]).state, "BUY");   // bez danych o wolumenie filtr wolumenu pomijamy
});
