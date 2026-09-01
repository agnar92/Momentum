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
    fmtMoney,
    fmtQty,
    fmtPct,
    parseXtbOpenPositions,
    parseXtbCash,
    classifyTicker,
    buildSlotsFromImport,
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

// ---------- IMPORT XTB (inicjalizacja portfela) ----------

test("parseXtbOpenPositions extracts value from a Market value column when present", () => {
    const workbook = {
        SheetNames: ["Open Positions"],
        Sheets: {
            "Open Positions": [
                ["Ticker", "Type", "Volume", "Market value"],
                ["AAPL.US", "", "2", "500"],
            ],
        },
    };
    global.XLSX = { utils: { sheet_to_json: (sheet) => sheet } };
    const imported = parseXtbOpenPositions(workbook);
    assert.deepEqual(imported, [{ ticker: "AAPL", shares: 2, value: 500 }]);
    delete global.XLSX;
});

test("parseXtbOpenPositions falls back to Market price * Volume, then Open price * Volume", () => {
    const workbook = {
        SheetNames: ["Open Positions"],
        Sheets: {
            "Open Positions": [
                ["Ticker", "Type", "Volume", "Market price"],
                ["AAPL.US", "", "2", "250"],
            ],
        },
    };
    global.XLSX = { utils: { sheet_to_json: (sheet) => sheet } };
    assert.deepEqual(parseXtbOpenPositions(workbook), [{ ticker: "AAPL", shares: 2, value: 500 }]);

    const workbook2 = {
        SheetNames: ["Open Positions"],
        Sheets: {
            "Open Positions": [
                ["Ticker", "Type", "Volume", "Open price"],
                ["MSFT.US", "", "3", "100"],
            ],
        },
    };
    assert.deepEqual(parseXtbOpenPositions(workbook2), [{ ticker: "MSFT", shares: 3, value: 300 }]);
    delete global.XLSX;
});

test("parseXtbOpenPositions returns a null value when no price/value column is present", () => {
    const workbook = {
        SheetNames: ["Open Positions"],
        Sheets: {
            "Open Positions": [
                ["Ticker", "Type", "Volume"],
                ["XLK.US", "", "5"],
            ],
        },
    };
    global.XLSX = { utils: { sheet_to_json: (sheet) => sheet } };
    assert.deepEqual(parseXtbOpenPositions(workbook), [{ ticker: "XLK", shares: 5, value: null }]);
    delete global.XLSX;
});

test("parseXtbCash finds the first number to the right of a recognized cash label, scanning all sheets", () => {
    const workbook = {
        SheetNames: ["Open Positions", "Summary"],
        Sheets: {
            "Open Positions": [["Ticker", "Type", "Volume"], ["AAPL.US", "", "1"]],
            Summary: [["Label", "Value"], ["Free funds", "1234.56"]],
        },
    };
    global.XLSX = { utils: { sheet_to_json: (sheet) => sheet } };
    assert.equal(parseXtbCash(workbook), 1234.56);
    delete global.XLSX;
});

test("parseXtbCash recognizes Polish labels too and returns null when nothing matches", () => {
    const workbook = {
        SheetNames: ["Summary"],
        Sheets: { Summary: [["Wolne środki", "", "777"]] },
    };
    global.XLSX = { utils: { sheet_to_json: (sheet) => sheet } };
    assert.equal(parseXtbCash(workbook), 777);

    const emptyWorkbook = { SheetNames: ["Summary"], Sheets: { Summary: [["Nothing here", "1"]] } };
    assert.equal(parseXtbCash(emptyWorkbook), null);
    delete global.XLSX;
});

test("classifyTicker returns the universe a ticker belongs to, or null", () => {
    const univData = { NASDAQ100: { constituents: [{ ticker: "AAPL" }] }, DOWJONES: { constituents: [{ ticker: "GS" }] } };
    assert.equal(classifyTicker("AAPL", univData), "NASDAQ100");
    assert.equal(classifyTicker("GS", univData), "DOWJONES");
    assert.equal(classifyTicker("XLK", univData), null);
});

test("buildSlotsFromImport classifies tracked-universe tickers as Core and everything else as Satellite", () => {
    const univData = { NASDAQ100: { constituents: [{ ticker: "AAPL" }] }, DOWJONES: { constituents: [] } };
    const positions = [
        { ticker: "AAPL", shares: 2, value: 500 },
        { ticker: "XLK", shares: 5, value: 250 },
    ];
    const { core, satellite, totalValue, unresolvedTickers } = buildSlotsFromImport(positions, univData, {});
    assert.equal(core.length, 1);
    assert.equal(core[0].id, "AAPL");
    assert.equal(core[0].weightPct, 500);
    assert.equal(satellite.length, 1);
    assert.equal(satellite[0].ticker, "XLK");
    assert.equal(totalValue, 750);
    assert.deepEqual(unresolvedTickers, []);
});

test("buildSlotsFromImport prices a position from priceMap when the XTB row itself has no value", () => {
    const positions = [{ ticker: "AAPL", shares: 2, value: null }];
    const { core, totalValue, unresolvedTickers } = buildSlotsFromImport(positions, {}, { AAPL: { price: 100 } });
    assert.equal(totalValue, 200);
    assert.equal(core.length, 0); // AAPL non tracked in the empty univData passed here -> satellite
    assert.deepEqual(unresolvedTickers, []);
});

test("buildSlotsFromImport flags a position as unresolved and falls back to a shares-based placeholder weight when no price is available anywhere", () => {
    const positions = [{ ticker: "ZZZ", shares: 3, value: null }];
    const { satellite, totalValue, unresolvedTickers } = buildSlotsFromImport(positions, {}, {});
    assert.deepEqual(unresolvedTickers, ["ZZZ"]);
    assert.equal(totalValue, 0);
    assert.equal(satellite[0].weightPct, 3);
    assert.equal(satellite[0].manualPrice, null);
});
