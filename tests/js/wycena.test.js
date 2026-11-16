const test = require("node:test");
const assert = require("node:assert");
const { filterRows, sortRows, rankMap, dcfValue, withDcf, DEFAULT_OPT } = require("../../docs/js/wycena.js");

const R = [
    { t: "A", n: "Alfa", peg: 0.6, pot: 0.6, na: 10, sp: true, nq: false, c: 10 },
    { t: "B", n: "Beta", peg: 1.4, pot: -0.3, na: 10, sp: true, nq: true, c: 20 },
    { t: "C", n: "Gamma", peg: 0.4, pot: 1.5, na: 2, sp: false, nq: true, c: null },
    { t: "D", n: "Delta", peg: 0.9, pot: 0.1, na: 5, sp: false, nq: true, c: 5 },
    { t: "E", n: "Eps", peg: null, pot: null, na: 9, sp: true, nq: false, c: 7 },
];

test("filtr: PEG <= max, wartość > cena, analitycy, indeks, szukaj", () => {
    assert.deepStrictEqual(filterRows(R, DEFAULT_OPT).map((r) => r.t), ["A", "D"]);
    assert.deepStrictEqual(filterRows(R, { ...DEFAULT_OPT, minAn: 0 }).map((r) => r.t), ["A", "C", "D"]);
    assert.deepStrictEqual(filterRows(R, { ...DEFAULT_OPT, pegMax: 2, onlyUnder: false }).map((r) => r.t), ["A", "B", "D"]);
    assert.deepStrictEqual(filterRows(R, { ...DEFAULT_OPT, idx: "nq" }).map((r) => r.t), ["D"]);
    assert.deepStrictEqual(filterRows(R, { ...DEFAULT_OPT, q: "alf" }).map((r) => r.t), ["A"]);
});

test("sortowanie: puste na końcu, ranking po potencjale", () => {
    assert.deepStrictEqual(sortRows(R, "c", 1).map((r) => r.t), ["D", "E", "A", "B", "C"]);
    assert.deepStrictEqual(sortRows(R, "pot", -1).map((r) => r.t), ["C", "A", "D", "B", "E"]);
    assert.deepStrictEqual(rankMap(R.slice(0, 4)), { C: 1, A: 2, D: 3, B: 4 });
});

test("DCF: ta sama wartość co momentum/wycena.dcf_value, brak przy ujemnym FCF, tryb DCF filtruje po dpot", () => {
    const v = dcfValue(100, 10, 50, 20, 0.30, 0.09, 0.025, 5, 0.25);
    assert.ok(Math.abs(v - 541.905) < 0.001, String(v));   // = momentum/wycena.dcf_value(100e6, 10e6, 50e6, 20e6, 0.30)
    assert.strictEqual(dcfValue(-5, 10, 0, 0, 0.1, 0.09, 0.025, 5, 0.25), null);
    assert.strictEqual(dcfValue(5, 10, 0, 0, 0.1, 0.02, 0.025, 5, 0.25), null);
    const rows = withDcf([
        { t: "A", n: "A", c: 100, fcf: 100, sh: 10, cash: 50, debt: 20, g: 0.3, na: 5, sp: true, nq: false, peg: 2, pot: -0.5 },
        { t: "B", n: "B", c: 1000, fcf: 100, sh: 10, cash: 0, debt: 0, g: 0.1, na: 5, sp: true, nq: false, peg: 0.5, pot: 1 },
        { t: "C", n: "C", c: 10, fcf: null, sh: 10, cash: 0, debt: 0, g: 0.1, na: 5, sp: true, nq: false, peg: 0.5, pot: 1 },
    ], DEFAULT_OPT);
    assert.ok(Math.abs(rows[0].dpot - 4.41905) < 0.001 && rows[0].fy === 0.1 && rows[0].gu === 0.25);
    assert.deepStrictEqual(filterRows(rows, { ...DEFAULT_OPT, mode: "dcf" }).map((r) => r.t), ["A"]);
    assert.deepStrictEqual(filterRows(rows, DEFAULT_OPT).map((r) => r.t), ["B", "C"]);
    assert.deepStrictEqual(rankMap(rows, "dpot"), { A: 1, B: 2, C: 3 });
});
