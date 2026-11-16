const test = require("node:test");
const assert = require("node:assert");
const { filterRows, sortRows, rankMap, DEFAULT_OPT } = require("../../docs/js/wycena.js");

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
