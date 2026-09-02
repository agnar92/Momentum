// Testy jednostkowe dla czystych funkcji finansowych w docs/js/portfolio.js.
// Uzywaja wbudowanego test runnera Node (node --test) — brak zewnetrznych
// zaleznosci npm, zeby nie dotykac wdrazanej strony (docs/) zadnym build stepem.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const portfolio = require(path.join("..", "..", "docs", "js", "portfolio.js"));

const {
    normalizeWeights,
    computeCoreTargets,
    capAndRedistribute,
    computeSatelliteTargets,
    rebalanceSelectedTickers,
    fmtMoney,
    fmtQty,
    fmtPct,
    classifyTicker,
    defaultTagFor,
    syncSlotsFromHoldings,
    slotValue,
} = portfolio;

test("fmtMoney formats with 2 decimals and thousands separators", () => {
    assert.equal(fmtMoney(1234.5), "$1,234.50");
    assert.equal(fmtMoney(0), "$0.00");
});

test("fmtMoney returns an em dash for null/undefined/NaN", () => {
    assert.equal(fmtMoney(null), "—");
    assert.equal(fmtMoney(undefined), "—");
    assert.equal(fmtMoney(NaN), "—");
});

test("fmtQty rounds to 3 decimals and uses a comma decimal separator", () => {
    assert.equal(fmtQty(1.23456), "1,235");
    assert.equal(fmtQty(2), "2");
});

test("fmtPct rounds to 2 decimals with a percent sign", () => {
    assert.equal(fmtPct(33.33333), "33.33%");
    assert.equal(fmtPct(0), "0.00%");
});

test("normalizeWeights distributes proportionally to relative weights", () => {
    assert.deepEqual(normalizeWeights([1, 1]), [0.5, 0.5]);
    const [a, b] = normalizeWeights([2, 1]);
    assert.ok(Math.abs(a - 2 / 3) < 1e-9);
    assert.ok(Math.abs(b - 1 / 3) < 1e-9);
});

test("normalizeWeights treats negative weights as zero", () => {
    assert.deepEqual(normalizeWeights([1, -5]), [1, 0]);
});

test("normalizeWeights returns all zeros when total weight is zero", () => {
    assert.deepEqual(normalizeWeights([0, 0]), [0, 0]);
});

test("computeCoreTargets splits capital across universe slots by momentum weight_pct", () => {
    const univData = {
        NASDAQ100: { constituents: [{ ticker: "AAA", weight_pct: 100, price: 10 }] },
        DOWJONES: { constituents: [{ ticker: "BBB", weight_pct: 100, price: 20 }] },
    };
    const slots = [
        { type: "universe", id: "NASDAQ100", weightPct: 1 },
        { type: "universe", id: "DOWJONES", weightPct: 1 },
    ];
    const raw = computeCoreTargets(1000, slots, univData, {});
    assert.ok(Math.abs(raw.AAA.target_value - 500) < 1e-9);
    assert.ok(Math.abs(raw.BBB.target_value - 500) < 1e-9);
});

test("computeCoreTargets merges a manual 'blue chip' pick with the same ticker from a universe slot", () => {
    const univData = { NASDAQ100: { constituents: [{ ticker: "AAA", weight_pct: 100, price: 10 }] } };
    const slots = [
        { type: "universe", id: "NASDAQ100", weightPct: 1 },
        { type: "ticker", id: "AAA", weightPct: 1 },
    ];
    const raw = computeCoreTargets(1000, slots, univData, {});
    // Kazdy slot dostaje 50% kapitalu Core (rowne relatywne wagi); oba trafiaja w AAA.
    assert.ok(Math.abs(raw.AAA.target_value - 1000) < 1e-9);
    assert.ok(raw.AAA.sources.includes("blue chip"));
});

test("computeCoreTargets prices a manual ticker pick from priceMap when no manualPrice is set", () => {
    const slots = [{ type: "ticker", id: "XYZ", weightPct: 1 }];
    const raw = computeCoreTargets(500, slots, {}, { XYZ: { price: 42 } });
    assert.equal(raw.XYZ.price, 42);
    assert.ok(Math.abs(raw.XYZ.target_value - 500) < 1e-9);
});

test("computeCoreTargets returns nothing for zero or negative capital", () => {
    const slots = [{ type: "ticker", id: "XYZ", weightPct: 1 }];
    assert.deepEqual(computeCoreTargets(0, slots, {}, {}), {});
});

test("computeCoreTargets restricts a universe slot to rebalanceSelected when provided, instead of every constituent", () => {
    const univData = {
        DOWJONES: { constituents: [
            { ticker: "AAA", weight_pct: 50, price: 10 },
            { ticker: "BBB", weight_pct: 50, price: 20 },
        ] },
    };
    const slots = [{ type: "universe", id: "DOWJONES", weightPct: 1 }];
    // Bez filtra: caly EQUAL_WEIGHT koszyk (jak DOWJONES) wchodzi do Core.
    const unfiltered = computeCoreTargets(1000, slots, univData, {});
    assert.ok(unfiltered.AAA);
    assert.ok(unfiltered.BBB);
    // Z filtrem rebalanceSelected: tylko AAA (BBB odpadloby np. przez limit
    // maxHoldings albo wykluczenie w Rebalansie) - dokladnie ten bug, ktory
    // rebalanceSelectedTickers ma naprawiac.
    const filtered = computeCoreTargets(1000, slots, univData, {}, new Set(["AAA"]));
    assert.equal(filtered.AAA.target_value, 1000);
    assert.equal(filtered.BBB, undefined);
});

// ---------- REBALANCE SELECTION (naprawa buga: Core "caly koszyk momentum"
// pokazywal WSZYSTKIE spolki indeksu, nie te faktycznie wybrane w Rebalansie) ----------

test("rebalanceSelectedTickers reproduces rebalance.js::computeTargets' own pct-weighted maxHoldings truncation", () => {
    const univData = {
        NASDAQ100: { constituents: [
            { ticker: "AAA", weight_pct: 90 },
            { ticker: "BBB", weight_pct: 10 },
        ] },
        DOWJONES: { constituents: [
            { ticker: "CCC", weight_pct: 50 },
            { ticker: "DDD", weight_pct: 50 },
        ] },
    };
    const rebalSettings = { pct: { NASDAQ100: 75, DOWJONES: 25 }, maxHoldings: 3 };
    const selected = rebalanceSelectedTickers(univData, rebalSettings, [], {});
    // Dolarowe udzialy (nominalne, wzgledne): AAA=67.5 BBB=7.5 CCC=12.5 DDD=12.5
    // -> top 3 to AAA, CCC, DDD (kolejnosc miedzy CCC/DDD nieistotna, oba > BBB).
    assert.equal(selected.size, 3);
    assert.ok(selected.has("AAA"));
    assert.ok(!selected.has("BBB"));
    assert.ok(selected.has("CCC"));
    assert.ok(selected.has("DDD"));
});

test("rebalanceSelectedTickers excludes manually-excluded and Core-tagged tickers, same as rebalance.js::isCoreTagged", () => {
    const univData = { NASDAQ100: { constituents: [
        { ticker: "AAA", weight_pct: 50 }, { ticker: "BBB", weight_pct: 50 },
    ] } };
    const rebalSettings = { pct: { NASDAQ100: 100, DOWJONES: 0 }, maxHoldings: 20 };
    const selected = rebalanceSelectedTickers(univData, rebalSettings, ["AAA"], { BBB: "core" });
    assert.equal(selected.size, 0);
});

test("rebalanceSelectedTickers skips a universe with 0% allocation entirely", () => {
    const univData = { DOWJONES: { constituents: [{ ticker: "AAA", weight_pct: 100 }] } };
    const rebalSettings = { pct: { NASDAQ100: 100, DOWJONES: 0 }, maxHoldings: 20 };
    const selected = rebalanceSelectedTickers(univData, rebalSettings, [], {});
    assert.equal(selected.size, 0);
});

test("rebalanceSelectedTickers falls back to a default maxHoldings of 20 when rebalSettings omits it", () => {
    const univData = { NASDAQ100: { constituents: [{ ticker: "AAA", weight_pct: 100 }] } };
    const selected = rebalanceSelectedTickers(univData, { pct: { NASDAQ100: 100 } }, [], {});
    assert.ok(selected.has("AAA"));
});

test("rebalanceSelectedTickers treats a universe missing from rebalSettings.pct as 0% (no tickers selected)", () => {
    const univData = { NASDAQ100: { constituents: [{ ticker: "AAA", weight_pct: 100 }] } };
    const selected = rebalanceSelectedTickers(univData, {}, [], {});
    assert.equal(selected.size, 0);
});

test("capAndRedistribute splits by weight when nobody exceeds the cap", () => {
    const { values, cappedIds, infeasible } = capAndRedistribute(["A", "B"], { A: 1, B: 1 }, 100, 60);
    assert.ok(Math.abs(values.A - 50) < 1e-9);
    assert.ok(Math.abs(values.B - 50) < 1e-9);
    assert.equal(cappedIds.size, 0);
    assert.equal(infeasible, false);
});

test("capAndRedistribute clips an over-weighted position and redistributes the excess", () => {
    // A wants 90% of 100 = 90, capped at 40; excess (50) redistributed to B and C equally.
    const { values, cappedIds } = capAndRedistribute(["A", "B", "C"], { A: 9, B: 0.5, C: 0.5 }, 100, 40);
    assert.equal(values.A, 40);
    assert.ok(Math.abs(values.B - 30) < 1e-9);
    assert.ok(Math.abs(values.C - 30) < 1e-9);
    assert.ok(cappedIds.has("A"));
});

test("capAndRedistribute falls back to an equal split when the cap can't fit the pool (infeasible)", () => {
    // 3 positions, cap 20% each of a 100 pool -> max 60 total, can't reach 100.
    const { values, infeasible } = capAndRedistribute(["A", "B", "C"], { A: 1, B: 1, C: 1 }, 100, 20);
    assert.equal(infeasible, true);
    assert.ok(Math.abs(values.A - 100 / 3) < 1e-9);
    assert.ok(Math.abs(values.B - 100 / 3) < 1e-9);
    assert.ok(Math.abs(values.C - 100 / 3) < 1e-9);
});

test("capAndRedistribute treats a non-positive cap as uncapped", () => {
    const { values } = capAndRedistribute(["A", "B"], { A: 3, B: 1 }, 100, 0);
    assert.ok(Math.abs(values.A - 75) < 1e-9);
    assert.ok(Math.abs(values.B - 25) < 1e-9);
});

test("computeSatelliteTargets applies the per-position cap as a % of TOTAL capital, not just the satellite bucket", () => {
    const slots = [{ ticker: "AAA", weightPct: 9 }, { ticker: "BBB", weightPct: 1 }];
    const prices = { AAA: { price: 10 }, BBB: { price: 20 } };
    // Satelita = 100 (10% z kapitalu 1000), cap = 5% z 1000 = 50 na pozycje.
    const { rows, infeasible } = computeSatelliteTargets(100, slots, 5, 1000, prices);
    assert.equal(rows.AAA.target_value, 50);
    assert.equal(rows.AAA.capped, true);
    assert.ok(Math.abs(rows.BBB.target_value - 50) < 1e-9);
    assert.equal(infeasible, false);
});

test("computeSatelliteTargets ignores slots without a ticker and returns empty for zero capital", () => {
    assert.deepEqual(computeSatelliteTargets(0, [{ ticker: "AAA", weightPct: 1 }], 5, 1000, {}).rows, {});
    assert.deepEqual(computeSatelliteTargets(100, [{ weightPct: 1 }], 5, 1000, {}).rows, {});
});

test("computeSatelliteTargets prefers manualPrice over priceMap when both are set", () => {
    const slots = [{ ticker: "AAA", weightPct: 1, manualPrice: 99 }];
    const { rows } = computeSatelliteTargets(100, slots, 100, 1000, { AAA: { price: 10 } });
    assert.equal(rows.AAA.price, 99);
});

// ---------- SYNC Z HOLDINGAMI REBALANSU (tagi Core/Satelita) ----------

test("classifyTicker returns the universe a ticker belongs to, or null", () => {
    const univData = { NASDAQ100: { constituents: [{ ticker: "AAPL" }] }, DOWJONES: { constituents: [{ ticker: "GS" }] } };
    assert.equal(classifyTicker("AAPL", univData), "NASDAQ100");
    assert.equal(classifyTicker("GS", univData), "DOWJONES");
    assert.equal(classifyTicker("XLK", univData), null);
});

test("defaultTagFor tags tracked-universe tickers as core and everything else as satellite", () => {
    const univData = { NASDAQ100: { constituents: [{ ticker: "AAPL" }] } };
    assert.equal(defaultTagFor("AAPL", univData), "core");
    assert.equal(defaultTagFor("XLK", univData), "satellite");
});

test("slotValue prices a holding-derived slot from shares * price, and returns weightPct for a manual slot", () => {
    const holdingSlot = { fromHolding: true, shares: 3 };
    assert.equal(slotValue(holdingSlot, "AAPL", { AAPL: { price: 10 } }), 30);
    assert.equal(slotValue({ fromHolding: true, shares: 3 }, "ZZZ", {}), 0); // brak ceny -> 0
    assert.equal(slotValue({ weightPct: 42 }, "AAPL", {}), 42);
});

test("syncSlotsFromHoldings builds slots from holdings, classifying by tracked universe, and preserves manual (non-holding) slots", () => {
    const univData = { NASDAQ100: { constituents: [{ ticker: "AAPL" }] }, DOWJONES: { constituents: [] } };
    const holdings = [{ ticker: "AAPL", shares: 2 }, { ticker: "XLK", shares: 5 }];
    const prevCore = [{ type: "universe", id: "NASDAQ100", weightPct: 1 }]; // manualny slot, nie holding
    const result = syncSlotsFromHoldings(holdings, prevCore, [], {}, univData, {});

    assert.equal(result.coreSlots.length, 2); // manualny koszyk momentum + AAPL z holdingu
    assert.ok(result.coreSlots.some(s => s.type === "universe" && s.id === "NASDAQ100"));
    const aapl = result.coreSlots.find(s => s.id === "AAPL");
    assert.equal(aapl.fromHolding, true);
    assert.equal(aapl.shares, 2);

    assert.equal(result.satelliteSlots.length, 1);
    assert.equal(result.satelliteSlots[0].ticker, "XLK");
    assert.equal(result.satelliteSlots[0].fromHolding, true);

    assert.equal(result.tags.AAPL, "core");
    assert.equal(result.tags.XLK, "satellite");
});

test("syncSlotsFromHoldings respects an existing user tag instead of re-classifying by default", () => {
    const univData = { NASDAQ100: { constituents: [{ ticker: "AAPL" }] } };
    const holdings = [{ ticker: "AAPL", shares: 1 }];
    // AAPL is a NASDAQ100 constituent (default "core"), but the user tagged it "satellite".
    const result = syncSlotsFromHoldings(holdings, [], [], { AAPL: "satellite" }, univData, {});
    assert.equal(result.tags.AAPL, "satellite");
    assert.equal(result.coreSlots.length, 0);
    assert.equal(result.satelliteSlots.length, 1);
});

test("syncSlotsFromHoldings preserves a previously-entered manualPrice for a ticker still held", () => {
    const holdings = [{ ticker: "XLK", shares: 5 }];
    const prevSatellite = [{ ticker: "XLK", shares: 5, manualPrice: 210.5, fromHolding: true }];
    const result = syncSlotsFromHoldings(holdings, [], prevSatellite, { XLK: "satellite" }, {}, {});
    assert.equal(result.satelliteSlots[0].manualPrice, 210.5);
});

test("syncSlotsFromHoldings drops tags for tickers no longer held (sold)", () => {
    const result = syncSlotsFromHoldings([], [], [], { OLD: "core" }, {}, {});
    assert.deepEqual(result.tags, {});
    assert.deepEqual(result.coreSlots, []);
});

test("computeCoreTargets and computeSatelliteTargets weight holding-derived slots by current price * shares", () => {
    const coreSlots = [{ type: "ticker", id: "AAPL", shares: 2, fromHolding: true }, { type: "ticker", id: "MSFT", shares: 1, fromHolding: true }];
    const prices = { AAPL: { price: 100 }, MSFT: { price: 200 } }; // wartosci rowne (200 kazdy) -> 50/50 split
    const raw = computeCoreTargets(1000, coreSlots, {}, prices);
    assert.ok(Math.abs(raw.AAPL.target_value - 500) < 1e-9);
    assert.ok(Math.abs(raw.MSFT.target_value - 500) < 1e-9);
    assert.ok(raw.AAPL.sources.includes("Twoja pozycja"));

    const satSlots = [{ ticker: "XLK", shares: 1, fromHolding: true }];
    const { rows } = computeSatelliteTargets(100, satSlots, 100, 1000, { XLK: { price: 50 } });
    assert.equal(rows.XLK.target_value, 100);
    assert.ok(rows.XLK.sources.includes("Twoja pozycja"));
});
