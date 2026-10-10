const test = require("node:test");
const assert = require("node:assert/strict");
const { darvasBoxes, darvasSvg } = require("../../docs/js/darvas.js");

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
    assert.match(svg, /kup nad|stop pod/);
    assert.match(svg, /Pudełko 104\.00–110\.00 — wybite w górę/);
    assert.match(darvasSvg({ c: [1], weeks: ["2026-01-01"], n: 1 }, { n: 1, end: 1 }), /Za mało danych/);
});
