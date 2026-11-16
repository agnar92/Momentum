const test = require("node:test");
const assert = require("node:assert");
const { usaCandidates, gpwCandidates, isC8, parseHold, decide } = require("../../docs/js/cem10.js");

const US = [
    { t: "A", sp: true, nq: false, r6: 0.5, dist: 0.1 },
    { t: "B", sp: true, nq: true, r6: 0.9, dist: 0.2 },
    { t: "C", sp: true, nq: false, r6: 0.3, dist: 0.1 },      // 6M nie powyżej +30 %
    { t: "D", sp: false, nq: true, r6: 1.2, dist: 0.3 },      // tylko Nasdaq-100
    { t: "E", sp: true, nq: false, r6: 0.8, dist: -0.01 },    // pod SMA 10
];

test("USA: indeks lidera, 6M > 30 %, nad SMA 10, sortowanie po 6M", () => {
    assert.deepStrictEqual(usaCandidates(US, "SP").map((r) => r.t), ["B", "A"]);
    assert.deepStrictEqual(usaCandidates(US, "NDX").map((r) => r.t), ["D", "B"]);
});

test("GPW: C-8 (3M > 0, 12M > 30 %, nad SMA 10) z obu indeksów, sortowanie po 6M", () => {
    const rows = [
        { t: "X", w20: true, r3: 0.05, r12: 0.4, r6: 0.2, dist: 0.05 },
        { t: "Y", w40: true, r3: 0.01, r12: 0.9, r6: 0.6, dist: 0.1 },
        { t: "Z", w20: true, r3: -0.01, r12: 0.9, r6: 0.7, dist: 0.1 },
        { t: "W", w40: true, r3: 0.1, r12: 0.31, r6: null, dist: 0.0 },
    ];
    assert.deepStrictEqual(gpwCandidates(rows).map((r) => r.t), ["Y", "X"]);
    assert.ok(!isC8(rows[2]) && !isC8(rows[3]));
});

test("lista trzymanych: tekst, JSON, duplikaty; decyzja wg SMA 10", () => {
    assert.deepStrictEqual(parseHold("dell, CRWD;ale  pko\nDELL"), ["DELL", "CRWD", "ALE", "PKO"]);
    assert.deepStrictEqual(parseHold("[\"mu\",\"PKO\"]"), ["MU", "PKO"]);
    assert.deepStrictEqual(parseHold("{\"hold\":\"nvda amd\"}"), ["NVDA", "AMD"]);
    assert.deepStrictEqual(parseHold(""), []);
    assert.strictEqual(decide({ dist: 0.02 }), "trzymaj");
    assert.strictEqual(decide({ dist: -0.02 }), "sprzedaj");
    assert.strictEqual(decide(undefined), "sprawdź");
});

