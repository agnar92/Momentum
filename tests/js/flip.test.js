const test = require("node:test");
const assert = require("node:assert");
const { ladderPlan, valueNow, tvod, parsePositions } = require("../../docs/js/flip.js");

const R = { first: 0.4, tranches: 10, step: 0.07 };

test("plan transz: 40 % na start, 10 transz, ±7 % od najwyższego / najniższego zakupu", () => {
    const p0 = ladderPlan([], 500, R);
    assert.strictEqual(p0.first, 200);
    assert.strictEqual(p0.tranche, 30);
    const p = ladderPlan([{ price: 100, amount: 200 }, { price: 110, amount: 30 }], 500, R);
    assert.strictEqual(p.spent, 230);
    assert.ok(Math.abs(p.up - 117.7) < 1e-9 && Math.abs(p.down - 93) < 1e-9);
    assert.strictEqual(ladderPlan([{ price: 100, amount: 500 }], 500, R).up, null);
});

test("wartość pozycji rośnie jak cena od każdego zakupu", () => {
    assert.strictEqual(valueNow([{ price: 100, amount: 200 }, { price: 50, amount: 30 }], 100), 260);
});

test("TVOD: dokupienie, T, V, O, D", () => {
    const rows = [{ t: "A", pick: true, margin: -0.2, flip: true, checks: {} }, { t: "B", pick: true, margin: 0.2, flip: true, checks: {} }];
    const row = { t: "A", flip: true, t_state: "słabnie", t_txt: "przychody +5 % r/r", req: 0.4, act: 0.2, margin: -0.2, checks: {} };
    const pos = { t: "A", budget: 500, buys: [{ price: 100, amount: 200 }], took: false };
    const k = tvod(pos, 220, row, rows, R).signals.map((s) => s.k);
    assert.deepStrictEqual(k, ["KUP", "T", "V", "O", "D"]);
    assert.deepStrictEqual(tvod({ ...pos, took: true }, 100, { ...row, t_state: "dobre", req: 0.2 }, rows.slice(0, 1), R).signals, []);
    const down = tvod(pos, 92, null, null, R).signals[0];
    assert.strictEqual(down.k, "KUP");
    assert.match(down.txt, /dokup 30 zł/);
});

test("import pozycji z pliku", () => {
    const p = parsePositions(JSON.stringify({ positions: [{ t: "nvda", budget: "600", buys: [{ price: "120", amount: "240" }, { price: 0, amount: 5 }] }] }));
    assert.deepStrictEqual(p, [{ t: "NVDA", budget: 600, took: false, buys: [{ d: "", price: 120, amount: 240 }] }]);
    assert.throws(() => parsePositions("{}"));
});
