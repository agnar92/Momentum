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

const { lastClosedMonth, monthMap, yahooSeries, computeFromRaw } = require("../../docs/js/cem10.js");

test("zamknięty miesiąc i świece Yahoo z przesunięciem strefy (czas letni / zimowy)", () => {
    assert.strictEqual(lastClosedMonth("2026-11-02"), "2026-10");
    assert.strictEqual(lastClosedMonth("2027-01-01"), "2026-12");
    // północ 1.10 czasu warszawskiego latem = 30.09 22:00 UTC; gmtoffset zimowy (+1 h) nie może przesunąć świecy na wrzesień
    const oct = Date.UTC(2026, 8, 30, 22) / 1000, nov = Date.UTC(2026, 9, 31, 23) / 1000;
    assert.deepStrictEqual(monthMap([oct, nov], [10, 11], 3600, "2026-10"), { "2026-10": 10 });
    const ys = yahooSeries({ chart: { result: [{ timestamp: [1, 2], meta: { gmtoffset: 0 }, indicators: { quote: [{ close: [5, 6] }], adjclose: [{ adjclose: [4, 5] }] } }] } });
    assert.deepStrictEqual(ys, { t: [1, 2], c: [5, 6], a: [4, 5], o: 0 });
    assert.strictEqual(yahooSeries({ chart: { result: null } }), null);
});

test("computeFromRaw: lider, kandydaci USA i GPW z surowych świec", () => {
    const ts = Array.from({ length: 24 }, (_, i) => Date.UTC(2024, 10 + i, 1, 5) / 1000);   // 2024-11 … 2026-10
    const ser = (f) => ({ t: ts, c: ts.map((_, i) => f(i)), a: ts.map((_, i) => f(i)), o: -18000 });
    const raw = { today: "2026-11-02", members: { sp: { AAA: "A Inc", BBB: "B Inc" }, nq: { AAA: "A Inc" } },
        gpw: { rewizja: "2026-09-18", WIG20: { PKO: "PKO BP" }, mWIG40: { ALE: "Allegro" } },
        px: { SPY: ser((i) => 100 * 1.03 ** i), QQQ: ser(() => 100), AAA: ser((i) => (i < 12 ? 50 : 50 * 1.1 ** (i - 12))), BBB: ser(() => 50),
            "PKO.WA": ser((i) => (i < 12 ? 10 : 10 * 1.06 ** (i - 12))), "ALE.WA": ser(() => 10) } };
    const d = computeFromRaw(raw);
    assert.strictEqual(d.month, "2026-10");
    assert.strictEqual(d.usa.lead, "SP");
    assert.ok(!d.usa.bear && !d.gpw.bear);
    assert.deepStrictEqual(usaCandidates(d.usa.rows, d.usa.lead).map((r) => r.t), ["AAA"]);
    assert.deepStrictEqual(gpwCandidates(d.gpw.rows).map((r) => r.t), ["PKO"]);
});
