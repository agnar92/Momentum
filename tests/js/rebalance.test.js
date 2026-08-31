// Testy jednostkowe dla czystych funkcji finansowych w docs/js/rebalance.js.
// Uzywaja wbudowanego test runnera Node (node --test) — brak zewnetrznych
// zaleznosci npm, zeby nie dotykac wdrazanej strony (docs/) zadnym build stepem.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// rebalance.js odwoluje sie do localStorage na poziomie modulu (przy pierwszym
// wczytaniu ustawien/holdingow) — w Node go nie ma, ale loadSettings/loadHoldings
// maja try/catch i bezpiecznie spadaja na wartosci domyslne.
const rebalance = require(path.join("..", "..", "docs", "js", "rebalance.js"));

const {
    fmtMoney,
    fmtQty,
    sharesSuggestion,
    computeTargets,
    parseXtbOpenPositions,
    weightedMuSigma,
    simulateMonteCarlo,
    randNormal,
    blendEquityCurves,
    _setState,
} = rebalance;

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

test("sharesSuggestion divides dollar amount by price", () => {
    const out = sharesSuggestion(1000, 50);
    assert.match(out, /^20 szt\./);
});

test("sharesSuggestion reports missing price instead of dividing by zero/undefined", () => {
    const out = sharesSuggestion(1000, 0);
    assert.match(out, /brak ceny/);
});

test("weightedMuSigma caps blended momentum at +/-30%/yr", () => {
    const targets = {
        A: { target_value: 100, momentum_pct: 500, volatility_pct: 20 }, // ekstremalne momentum
    };
    const { mu, sigma } = weightedMuSigma(targets, 100);
    assert.equal(mu, 0.30);
    assert.equal(sigma, 0.20);
});

test("weightedMuSigma blends multiple positions by target-value weight", () => {
    const targets = {
        A: { target_value: 50, momentum_pct: 10, volatility_pct: 10 },
        B: { target_value: 50, momentum_pct: 20, volatility_pct: 30 },
    };
    const { mu, sigma } = weightedMuSigma(targets, 100);
    assert.ok(Math.abs(mu - 0.15) < 1e-9);
    assert.ok(Math.abs(sigma - 0.20) < 1e-9);
});

test("randNormal returns finite numbers across many draws", () => {
    for (let i = 0; i < 200; i++) {
        const v = randNormal();
        assert.equal(Number.isFinite(v), true);
    }
});

test("simulateMonteCarlo keeps percentile bands ordered (p10 <= p50 <= p90)", () => {
    const { p10, p50, p90 } = simulateMonteCarlo(10000, 0.08, 0.15, 12, 300);
    assert.equal(p10.length, 13); // horizonMonths + startValue point
    for (let m = 0; m < p10.length; m++) {
        assert.ok(p10[m] <= p50[m] + 1e-9);
        assert.ok(p50[m] <= p90[m] + 1e-9);
    }
});

test("simulateMonteCarlo with zero volatility collapses all paths to the deterministic drift", () => {
    const { p10, p50, p90 } = simulateMonteCarlo(1000, 0.12, 0, 6, 50);
    for (let m = 0; m < p10.length; m++) {
        assert.ok(Math.abs(p10[m] - p50[m]) < 1e-6);
        assert.ok(Math.abs(p50[m] - p90[m]) < 1e-6);
    }
    // Bez zmiennosci wzrost jest czystym dryfem: startValue * exp(mu*t).
    const expected = 1000 * Math.exp(0.12 * 0.5);
    assert.ok(Math.abs(p50[6] - expected) < 1e-3);
});

test("parseXtbOpenPositions extracts ticker/shares and strips exchange suffix", () => {
    const rowsAfterHeader = [
        ["AAPL.US", "", "1.5"],
        ["MSFT.US", "", "2"],
    ];
    const workbook = {
        SheetNames: ["Open Positions"],
        Sheets: {
            "Open Positions": [
                ["Ticker", "Type", "Volume"],
                ...rowsAfterHeader,
            ],
        },
    };
    // Stub minimalny dla XLSX.utils.sheet_to_json: zwraca dokladnie te wiersze
    // (rzeczywisty parsing xlsx-> array-of-arrays jest odpowiedzialnoscia
    // biblioteki SheetJS, nie logiki filtrowania testowanej tutaj).
    global.XLSX = { utils: { sheet_to_json: (sheet) => sheet } };

    const imported = parseXtbOpenPositions(workbook);
    assert.deepEqual(imported, [
        { ticker: "AAPL", shares: 1.5 },
        { ticker: "MSFT", shares: 2 },
    ]);

    delete global.XLSX;
});

test("parseXtbOpenPositions skips transaction rows (non-empty Type) and zero/empty volume", () => {
    const workbook = {
        SheetNames: ["Open Positions"],
        Sheets: {
            "Open Positions": [
                ["Ticker", "Type", "Volume"],
                ["AAPL.US", "", "1"],
                ["MSFT.US", "BUY", "5"],   // wiersz transakcji -> pomijany
                ["TSLA.US", "", "0"],      // wolumen zerowy -> pomijany
                ["", "", "3"],             // brak tickera -> pomijany
            ],
        },
    };
    global.XLSX = { utils: { sheet_to_json: (sheet) => sheet } };

    const imported = parseXtbOpenPositions(workbook);
    assert.deepEqual(imported, [{ ticker: "AAPL", shares: 1 }]);

    delete global.XLSX;
});

test("parseXtbOpenPositions throws when the Open Positions sheet is missing", () => {
    const workbook = { SheetNames: ["Closed Positions"], Sheets: {} };
    assert.throws(() => parseXtbOpenPositions(workbook), /Open Positions/);
});

test("computeTargets allocates capital across universes by settings.pct, skipping 0% buckets", () => {
    _setState({
        universeData: {
            NASDAQ100: { constituents: [{ ticker: "AAA", weight_pct: 100, price: 10 }] },
            DOWJONES: { constituents: [{ ticker: "BBB", weight_pct: 100, price: 20 }] },
        },
        settings: { pct: { NASDAQ100: 70, DOWJONES: 30 }, maxHoldings: 20 },
        excluded: [],
    });

    const { targets, momentumSelected } = computeTargets(1000);
    assert.equal(momentumSelected.has("AAA"), true);
    assert.equal(momentumSelected.has("BBB"), true);
    assert.ok(Math.abs(targets.AAA.target_value - 700) < 1e-9);
    assert.ok(Math.abs(targets.BBB.target_value - 300) < 1e-9);
});

test("computeTargets excludes tickers in the excluded list entirely", () => {
    _setState({
        universeData: {
            NASDAQ100: {
                constituents: [
                    { ticker: "AAA", weight_pct: 50, price: 10 },
                    { ticker: "EXCLUDED", weight_pct: 50, price: 10 },
                ],
            },
            DOWJONES: { constituents: [] },
        },
        settings: { pct: { NASDAQ100: 100, DOWJONES: 0 }, maxHoldings: 20 },
        excluded: ["EXCLUDED"],
    });

    const { targets } = computeTargets(1000);
    assert.equal("EXCLUDED" in targets, false);
    // Cala pula 1000 trafia do AAA, skoro EXCLUDED zniknal z koszyka calkowicie.
    assert.ok(Math.abs(targets.AAA.target_value - 1000) < 1e-9);
});

test("computeTargets truncates to maxHoldings and rescales survivors back to 100%", () => {
    _setState({
        universeData: {
            NASDAQ100: {
                constituents: [
                    { ticker: "BIG", weight_pct: 60, price: 10 },
                    { ticker: "MID", weight_pct: 30, price: 10 },
                    { ticker: "SMALL", weight_pct: 10, price: 10 },
                ],
            },
            DOWJONES: { constituents: [] },
        },
        settings: { pct: { NASDAQ100: 100, DOWJONES: 0 }, maxHoldings: 2 },
        excluded: [],
    });

    const { targets } = computeTargets(1000);
    assert.equal(Object.keys(targets).length, 2);
    assert.equal("SMALL" in targets, false); // najmniejsza pozycja odrzucona limitem
    const total = Object.values(targets).reduce((s, t) => s + t.target_value, 0);
    assert.ok(Math.abs(total - 1000) < 1e-6); // przeskalowane z powrotem do 100% kapitalu
});

test("blendEquityCurves weights universes by settings.pct", () => {
    const curveData = {
        NASDAQ100: { dates: ["2026-01-01", "2026-02-01"], momentum_index: [100, 110], benchmark_index: [100, 105] },
        DOWJONES: { dates: ["2026-01-01", "2026-02-01"], momentum_index: [100, 90], benchmark_index: [100, 95] },
    };
    const pct = { NASDAQ100: 60, DOWJONES: 40 };
    const blended = blendEquityCurves(curveData, pct);
    assert.deepEqual(blended.dates, ["2026-01-01", "2026-02-01"]);
    // 0.6*110 + 0.4*90 = 66 + 36 = 102
    assert.ok(Math.abs(blended.portfolio[1] - 102) < 1e-9);
    assert.ok(Math.abs(blended.benchmark[1] - 101) < 1e-9);
});

test("blendEquityCurves returns null when no allocated universe has enough history", () => {
    const curveData = { NASDAQ100: { dates: ["2026-01-01"], momentum_index: [100], benchmark_index: [100] } };
    const pct = { NASDAQ100: 100, DOWJONES: 0 };
    assert.equal(blendEquityCurves(curveData, pct), null);
});

test("blendEquityCurves returns null when settings.pct sums to zero", () => {
    const curveData = {
        NASDAQ100: { dates: ["2026-01-01", "2026-02-01"], momentum_index: [100, 110], benchmark_index: [100, 105] },
    };
    assert.equal(blendEquityCurves(curveData, { NASDAQ100: 0, DOWJONES: 0 }), null);
});

test("blendEquityCurves intersects dates when universes have mismatched history", () => {
    const curveData = {
        NASDAQ100: { dates: ["2026-01-01", "2026-02-01", "2026-03-01"], momentum_index: [100, 110, 121], benchmark_index: [100, 105, 110] },
        DOWJONES: { dates: ["2026-02-01", "2026-03-01"], momentum_index: [100, 105], benchmark_index: [100, 102] },
    };
    const blended = blendEquityCurves(curveData, { NASDAQ100: 50, DOWJONES: 50 });
    // Tylko wspolne daty (od 2026-02-01) -> 2 punkty, nie 3.
    assert.deepEqual(blended.dates, ["2026-02-01", "2026-03-01"]);
});
