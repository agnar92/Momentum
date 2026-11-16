const test = require("node:test");
const assert = require("node:assert");
const { sortRows, barsSvg, mergeNotes, fmt, hints } = require("../../docs/js/quality.js");

const R = [
    { t: "A", score: 50, pts: { q: 70 }, roic_hits: 8 },
    { t: "B", score: 80, pts: { q: 20 }, roic_hits: null },
    { t: "C", score: 60, pts: {}, roic_hits: 10 },
];

test("sortowanie: liczby, bloki punktów, braki na końcu", () => {
    assert.deepStrictEqual(sortRows(R, "score", -1).map((r) => r.t), ["B", "C", "A"]);
    assert.deepStrictEqual(sortRows(R, "q", -1).map((r) => r.t), ["A", "B", "C"]);
    assert.deepStrictEqual(sortRows(R, "roic_hits", 1).map((r) => r.t), ["A", "C", "B"]);
    assert.deepStrictEqual(sortRows(R, "t", -1).map((r) => r.t), ["C", "B", "A"]);
});

test("format komórek", () => {
    assert.strictEqual(fmt({ roic_med: 0.2346 }, "roic_med", "p"), "23,5 %");
    assert.strictEqual(fmt({ roic_hits: 7 }, "roic_hits", "h"), "7/10");
    assert.strictEqual(fmt({ pts: { v: 66.6 } }, "v", "b"), 67);
    assert.strictEqual(fmt({}, "gm_med", "p"), "–");
});

test("wykres słupkowy: próg koloruje słupki, brak danych", () => {
    const s = barsSvg([{ y: 2024, roic: 0.2 }, { y: 2025, roic: 0.1 }, { y: 2026, roic: null }], "roic", { thr: 0.15 });
    assert.match(s, /class="bar good"/);
    assert.match(s, /class="bar weak"/);
    assert.match(s, /class="thr"/);
    assert.strictEqual((s.match(/<rect/g) || []).length, 2);
    assert.match(barsSvg([{ y: 2025 }], "gm"), /brak danych/);
});

test("import notatek scala z istniejącymi", () => {
    const cur = { AAA: { q: [true], thesis: "x" } };
    const out = mergeNotes(cur, JSON.stringify({ notes: { bbb: { q: [1, 0, 1, 1, 1], thesis: "teza" } } }));
    assert.deepStrictEqual(Object.keys(out), ["AAA", "BBB"]);
    assert.deepStrictEqual(out.BBB.q, [true, false, true, true]);
    assert.throws(() => mergeNotes(cur, "[1,2]"));
});

test("podpowiedzi do pytań: liczby i AI", () => {
    const r = {
        auto: { q3: { ok: true, why: "wysoki ROIC się trzyma" }, q4: { ok: false, why: "FCF yield 2 % + wzrost 5 % = 7 %" } },
        ai: { biznes: "Sprzedaje buty.", fosa: "silna", fosa_typ: ["marka"], fosa_why: "Marka.", zarzad: "zły", zarzad_why: "Przejęcia." },
    };
    const h = hints(r);
    assert.strictEqual(h[0][0].text, "Sprzedaje buty.");
    assert.strictEqual(h[1][0].ok, true);
    assert.match(h[1][0].text, /fosa: silna \(marka\)/);
    assert.deepStrictEqual(h[2].map((x) => [x.src, x.ok]), [["liczby", true], ["AI", false]]);
    assert.strictEqual(h[3][0].ok, false);
    assert.match(h[3][0].text, /poniżej 9 %/);
    assert.deepStrictEqual(hints({}), [[], [], [], []]);
});
