// Testy jednostkowe dla czystych funkcji finansowych w docs/js/rebalance_pl.js
// — bliźniaczej kopii docs/js/rebalance.js dla WIG20/mWIG40 zamiast SP500/
// Nasdaq100/Dow Jones (patrz komentarz na górze rebalance_pl.js). Uzywaja
// wbudowanego test runnera Node (node --test) — brak zewnetrznych zaleznosci
// npm, zeby nie dotykac wdrazanej strony (docs/) zadnym build stepem.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// rebalance_pl.js odwoluje sie do localStorage na poziomie modulu (przy
// pierwszym wczytaniu ustawien/holdingow) — w Node go nie ma, ale
// loadSettings/loadHoldings/loadExcluded maja try/catch i bezpiecznie
// spadaja na wartosci domyslne, wiec prawdziwy localStorage nie jest tu w
// ogole potrzebny.
global.localStorage = {
    _store: {},
    getItem(key) { return Object.prototype.hasOwnProperty.call(this._store, key) ? this._store[key] : null; },
    setItem(key, value) { this._store[key] = String(value); },
    removeItem(key) { delete this._store[key]; },
};

const rebalancePl = require(path.join("..", "..", "docs", "js", "rebalance_pl.js"));

const {
    fmtMoney,
    fmtMoneyPln,
    moneyFmtForCurrency,
    currentMoneyFmt,
    holdingsMoneyFmt,
    fmtQty,
    sharesSuggestion,
    currencyOf,
    combinedPoolRows,
    eligiblePoolRows,
    autoSelectedRows,
    computeAutoTargets,
    deriveUniverseFractionsFromTargets,
    normalizeWeights,
    blendEquityCurves,
    parseXtbOpenPositions,
    weightedMuSigma,
    simulateMonteCarlo,
    randNormal,
    tvSymbolFor,
    buildTvPortfolioCsv,
    xtbDateToIso,
    _setState,
} = rebalancePl;

test("fmtMoney formats with 2 decimals and thousands separators", () => {
    assert.equal(fmtMoney(1234.5), "$1,234.50");
    assert.equal(fmtMoney(0), "$0.00");
});

test("fmtMoneyPln formats with 2 decimals, pl-PL separators, and a zł suffix", () => {
    assert.equal(fmtMoneyPln(1234.5), "1234,50 zł");
    assert.equal(fmtMoneyPln(0), "0,00 zł");
});

test("moneyFmtForCurrency picks fmtMoneyPln for PLN, fmtMoney otherwise", () => {
    assert.equal(moneyFmtForCurrency("PLN"), fmtMoneyPln);
    assert.equal(moneyFmtForCurrency("USD"), fmtMoney);
});

test("fmtQty rounds to 3 decimals and uses a comma decimal separator", () => {
    assert.equal(fmtQty(1.23456), "1,235");
    assert.equal(fmtQty(2), "2");
});

test("sharesSuggestion divides amount by price, defaulting to fmtMoney unless a formatter is given", () => {
    const out = sharesSuggestion(1000, 50, fmtMoneyPln);
    assert.match(out, /^20 szt\./);
    assert.match(out, /1000,00 zł/);
});

test("sharesSuggestion reports missing price instead of dividing by zero/undefined", () => {
    const out = sharesSuggestion(1000, 0);
    assert.match(out, /brak ceny/);
});

test("currencyOf resolves PLN for WIG20/mWIG40-sourced tickers, USD for everything else (including unknown) — holdings could in theory still carry a non-PL ticker", () => {
    _setState({
        priceMap: {
            AAPL: { price: 200, sources: ["NASDAQ100"] },
            PKN: { price: 70, sources: ["WIG20"] },
            KGH: { price: 100, sources: ["MWIG40"] },
            UNKNOWN: { price: 1, sources: [] },
        },
    });
    assert.equal(currencyOf("AAPL"), "USD");
    assert.equal(currencyOf("PKN"), "PLN");
    assert.equal(currencyOf("KGH"), "PLN");
    assert.equal(currencyOf("UNKNOWN"), "USD");
    _setState({ priceMap: {} });
});

test("weightedMuSigma caps blended momentum at +/-30%/yr", () => {
    const targets = {
        A: { target_value: 100, momentum_pct: 500, volatility_pct: 20 }, // ekstremalne momentum
    };
    const { mu, sigma } = weightedMuSigma(targets, 100);
    assert.equal(mu, 0.30);
    assert.equal(sigma, 0.20);
});

test("randNormal returns finite numbers across many draws", () => {
    for (let i = 0; i < 200; i++) {
        assert.equal(Number.isFinite(randNormal()), true);
    }
});

test("simulateMonteCarlo keeps percentile bands ordered (p10 <= p50 <= p90)", () => {
    const { p10, p50, p90 } = simulateMonteCarlo(10000, 0.08, 0.15, 12, 300);
    assert.equal(p10.length, 13);
    for (let m = 0; m < p10.length; m++) {
        assert.ok(p10[m] <= p50[m] + 1e-9);
        assert.ok(p50[m] <= p90[m] + 1e-9);
    }
});

test("parseXtbOpenPositions extracts ticker/shares and strips exchange suffix", () => {
    const workbook = {
        SheetNames: ["Open Positions"],
        Sheets: {
            "Open Positions": [
                ["Ticker", "Type", "Volume"],
                ["PKN.WA", "", "10"],
                ["KGH.WA", "", "2"],
            ],
        },
    };
    global.XLSX = { utils: { sheet_to_json: (sheet) => sheet } };

    const imported = parseXtbOpenPositions(workbook);
    assert.deepEqual(imported, [
        { ticker: "PKN", shares: 10 },
        { ticker: "KGH", shares: 2 },
    ]);

    delete global.XLSX;
});

test("xtbDateToIso converts an Excel serial date number to YYYY-MM-DD", () => {
    assert.equal(xtbDateToIso(45552), "2024-09-17");
});

// ---------- Pula rebalansera: combinedPoolRows/eligiblePoolRows/autoSelectedRows ----------
// Rebalanser PL wybiera z WIG20 (constituents — caly sklad, EQUAL_WEIGHT_UNIVERSES
// w run_query.py) + MWIG40 (constituents — tak samo caly sklad).

function baseUniverseData() {
    return {
        WIG20: {
            ref_date: "2026-09-19",
            constituents: [
                { ticker: "PKN", momentum_score: 2, price: 70, momentum_pct: 20, volatility_pct: 15, sector: "Energy", momentum_window: "M-14/M-2" },
            ],
        },
        MWIG40: {
            ref_date: "2026-09-19",
            constituents: [
                { ticker: "XTB", momentum_score: 3, price: 40, momentum_pct: 30, volatility_pct: 25, sector: "Financials", momentum_window: "M-14/M-2" },
                { ticker: "GPW", momentum_score: 1, price: 30, momentum_pct: 5, volatility_pct: 12, sector: "Financials", momentum_window: "M-14/M-2" },
            ],
        },
    };
}

test("combinedPoolRows draws WIG20's and MWIG40's full `constituents` (both EQUAL_WEIGHT_UNIVERSES — no quintile selection)", () => {
    _setState({ universeData: baseUniverseData(), excluded: [] });
    const rows = combinedPoolRows();
    assert.deepEqual(rows.map(r => r.ticker).sort(), ["GPW", "PKN", "XTB"]);
    _setState({ universeData: {}, excluded: [] });
});

test("combinedPoolRows sorts by momentum_score descending across WIG20/MWIG40", () => {
    _setState({ universeData: baseUniverseData(), excluded: [] });
    const rows = combinedPoolRows();
    assert.deepEqual(rows.map(r => r.ticker), ["XTB", "PKN", "GPW"]); // momentum_score 3, 2, 1
    _setState({ universeData: {}, excluded: [] });
});

test("combinedPoolRows dedupes a ticker present in both universes, keeping the occurrence with the higher momentum_score", () => {
    _setState({
        universeData: {
            WIG20: { constituents: [{ ticker: "DUAL", momentum_score: 1.5, price: 50, universe: "WIG20" }] },
            MWIG40: { constituents: [{ ticker: "DUAL", momentum_score: 2.5, price: 50, universe: "MWIG40" }] },
        },
        excluded: [],
    });
    const rows = combinedPoolRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].universe, "MWIG40"); // higher momentum_score (2.5 > 1.5) wins
    _setState({ universeData: {}, excluded: [] });
});

test("eligiblePoolRows drops manually-excluded tickers and re-numbers pool_rank so TOP N always means N distinct, buyable companies", () => {
    _setState({ universeData: baseUniverseData(), excluded: ["XTB"] });
    const rows = eligiblePoolRows();
    assert.deepEqual(rows.map(r => r.ticker), ["PKN", "GPW"]); // XTB (top by score) is gone
    assert.deepEqual(rows.map(r => r.pool_rank), [1, 2]); // re-numbered, not [2, 3]
    _setState({ universeData: {}, excluded: [] });
});

function stageUniverseData() {
    return {
        WIG20: {
            constituents: [
                { ticker: "S1", momentum_score: 3, price: 100, momentum_pct: 10, volatility_pct: 10, weekly_chart: { current_stage: "1" } },
                { ticker: "S2A", momentum_score: 2, price: 100, momentum_pct: 10, volatility_pct: 10, weekly_chart: { current_stage: "2A" } },
            ],
        },
        MWIG40: {
            constituents: [
                { ticker: "S2B", momentum_score: 1, price: 100, momentum_pct: 10, volatility_pct: 10, weekly_chart: { current_stage: "2B" } },
                { ticker: "S4", momentum_score: 0.5, price: 100, momentum_pct: 10, volatility_pct: 10, weekly_chart: { current_stage: "4" } },
            ],
        },
    };
}

test("eligiblePoolRows filters by the active stage filter, not just the ranking table's display", () => {
    _setState({ universeData: stageUniverseData(), excluded: [], poolStageFilter: new Set(["2"]) }); // Etap 2 (2A+2B)
    const rows = eligiblePoolRows();
    assert.deepEqual(rows.map(r => r.ticker).sort(), ["S2A", "S2B"]);
    assert.deepEqual(rows.map(r => r.pool_rank), [1, 2]); // re-numbered within the filtered set
    _setState({ universeData: {}, excluded: [], poolStageFilter: "ALL" });
});

test("autoSelectedRows/computeAutoTargets only draw from the stage-filtered pool when a filter is active", () => {
    _setState({ universeData: stageUniverseData(), excluded: [], poolStageFilter: new Set(["1"]) }); // Etap 1 only
    assert.deepEqual(autoSelectedRows(3).map(r => r.ticker), ["S1"]);
    const { targets } = computeAutoTargets(3, 1000);
    assert.deepEqual(Object.keys(targets), ["S1"]);
    assert.equal(targets.S1.target_value, 1000);
    _setState({ universeData: {}, excluded: [], poolStageFilter: "ALL" });
});

test("autoSelectedRows slices the top N eligible rows, returning [] for N <= 0", () => {
    _setState({ universeData: baseUniverseData(), excluded: [] });
    assert.deepEqual(autoSelectedRows(2).map(r => r.ticker), ["XTB", "PKN"]);
    assert.deepEqual(autoSelectedRows(0), []);
    assert.deepEqual(autoSelectedRows(null), []);
    _setState({ universeData: {}, excluded: [] });
});

// ---------- computeAutoTargets / deriveUniverseFractionsFromTargets ----------
// W przeciwienstwie do rebalance.js (Rebalanser USA), tu NIE MA zadnego
// mnoznika faworyzujacego jeden indeks — waga to wprost znormalizowany
// momentum_score, symetrycznie dla WIG20 i mWIG40.

test("computeAutoTargets weights the auto-selected TOP N by CURRENT momentum_score, normalized to totalCapital, with no per-universe multiplier", () => {
    _setState({ universeData: baseUniverseData(), excluded: [] });
    // Suma surowych wag (momentum_score): XTB 3 + PKN 2 = 5 -> XTB 60%, PKN 40%.
    const { targets } = computeAutoTargets(2, 1000);
    assert.ok(Math.abs(targets.XTB.target_value - 600) < 1e-6);
    assert.ok(Math.abs(targets.PKN.target_value - 400) < 1e-6);
    const total = Object.values(targets).reduce((s, t) => s + t.target_value, 0);
    assert.ok(Math.abs(total - 1000) < 1e-6);
    _setState({ universeData: {}, excluded: [] });
});

test("computeAutoTargets gives WIG20 and MWIG40 picks of equal momentum_score an equal share (no DOWJONES-style tilt exists here)", () => {
    _setState({
        universeData: {
            WIG20: { constituents: [{ ticker: "W_A", momentum_score: 2, price: 100, momentum_pct: 10, volatility_pct: 10 }] },
            MWIG40: { constituents: [{ ticker: "M_A", momentum_score: 2, price: 100, momentum_pct: 10, volatility_pct: 10 }] },
        },
        excluded: [],
    });
    const { targets } = computeAutoTargets(2, 1000);
    assert.ok(Math.abs(targets.W_A.target_value - 500) < 1e-6);
    assert.ok(Math.abs(targets.M_A.target_value - 500) < 1e-6);
    _setState({ universeData: {}, excluded: [] });
});

test("computeAutoTargets returns no targets when N is 0 or totalCapital is 0", () => {
    _setState({ universeData: baseUniverseData(), excluded: [] });
    assert.deepEqual(computeAutoTargets(0, 1000).targets, {});

    const { targets } = computeAutoTargets(1, 0);
    assert.ok("XTB" in targets);
    assert.equal(targets.XTB.target_value, 0); // brak kapitalu -> target_value zostaje na 0

    _setState({ universeData: {}, excluded: [] });
});

test("computeAutoTargets excludes manually-excluded tickers entirely, backfilling from the pool", () => {
    _setState({ universeData: baseUniverseData(), excluded: ["XTB"] }); // top-ranked ticker excluded
    const { targets } = computeAutoTargets(2, 1000);
    assert.deepEqual(Object.keys(targets).sort(), ["GPW", "PKN"]); // backfilled instead of shrinking to 1
    _setState({ universeData: {}, excluded: [] });
});

test("deriveUniverseFractionsFromTargets sums target_value per universe, splitting a merged multi-universe ticker evenly", () => {
    const fractions = deriveUniverseFractionsFromTargets({
        AAA: { target_value: 600, universes: ["WIG20"] },
        BBB: { target_value: 400, universes: ["MWIG40"] },
    });
    assert.ok(Math.abs(fractions.WIG20 - 600) < 1e-9);
    assert.ok(Math.abs(fractions.MWIG40 - 400) < 1e-9);
});

// ---------- currentMoneyFmt / holdingsMoneyFmt ----------
// currentMoneyFmt drives the auto-selected portfolio's own outputs (ranking,
// suggestion table, stats, Monte Carlo, equity curve) — the pool here is
// always WIG20+MWIG40, i.e. always PLN, so this is a constant (fmtMoneyPln) —
// the mirror image of rebalance.js's own always-fmtMoney currentMoneyFmt.

test("currentMoneyFmt is always fmtMoneyPln — the PL rebalancer pool is PLN-only", () => {
    assert.equal(currentMoneyFmt(), fmtMoneyPln);
});

test("holdingsMoneyFmt is fmtMoneyPln when there are no holdings yet, and when every held ticker is PLN", () => {
    _setState({ holdings: [], priceMap: {} });
    assert.equal(holdingsMoneyFmt(), fmtMoneyPln);

    _setState({
        holdings: [{ ticker: "PKN", shares: 1 }, { ticker: "KGH", shares: 1 }],
        priceMap: { PKN: { price: 70, sources: ["WIG20"] }, KGH: { price: 100, sources: ["MWIG40"] } },
    });
    assert.equal(holdingsMoneyFmt(), fmtMoneyPln);

    _setState({ holdings: [], priceMap: {} });
});

test("holdingsMoneyFmt falls back to fmtMoney when a held ticker isn't PLN (e.g. manually added outside the PL pool)", () => {
    _setState({
        holdings: [{ ticker: "AAPL", shares: 1 }, { ticker: "PKN", shares: 1 }],
        priceMap: { AAPL: { price: 200, sources: ["NASDAQ100"] }, PKN: { price: 70, sources: ["WIG20"] } },
    });
    assert.equal(holdingsMoneyFmt(), fmtMoney);
    _setState({ holdings: [], priceMap: {} });
});

// ---------- EKSPORT DO TRADINGVIEW PORTFOLIO ----------

test("tvSymbolFor prefixes GPW: for WIG20/mWIG40-sourced tickers, NASDAQ: otherwise", () => {
    _setState({
        priceMap: {
            PKN: { price: 70, sources: ["WIG20"] },
            KGH: { price: 100, sources: ["MWIG40"] },
            AAPL: { price: 200, sources: ["NASDAQ100"] },
        },
    });
    assert.equal(tvSymbolFor("PKN"), "GPW:PKN");
    assert.equal(tvSymbolFor("KGH"), "GPW:KGH");
    assert.equal(tvSymbolFor("AAPL"), "NASDAQ:AAPL");
    _setState({ priceMap: {} });
});

test("buildTvPortfolioCsv exports one Buy row per holding at the current price, skipping empty rows", () => {
    _setState({
        holdings: [
            { ticker: "PKN", shares: 10 },
            { ticker: "", shares: 3 },      // brak tickera -> pomijany
            { ticker: "NOPRICE", shares: 0 }, // brak ilosci -> pomijany
        ],
        priceMap: {
            PKN: { price: 70.5, sources: ["WIG20"] },
        },
    });

    const csv = buildTvPortfolioCsv();
    const lines = csv.split("\n");
    assert.equal(lines[0], "Symbol,Side,Qty,Fill Price,Commission,Closing Time");
    assert.equal(lines.length, 2);
    assert.match(lines[1], /^GPW:PKN,Buy,10,70\.5,0,\d{4}-\d{2}-\d{2} 0:00:00$/);

    _setState({ holdings: [], priceMap: {} });
});

// ---------- normalizeWeights / blendEquityCurves (blends the equity curve
// across whichever of WIG20/MWIG40 the current TOP N spans) ----------

test("normalizeWeights normalizes positive weights to fractions summing to 1, dropping zero/negative entries", () => {
    assert.deepEqual(normalizeWeights({ WIG20: 50, MWIG40: 50 }), { WIG20: 0.5, MWIG40: 0.5 });
    assert.deepEqual(normalizeWeights({ WIG20: 100, MWIG40: 0 }), { WIG20: 1 });
});

test("normalizeWeights ignores a universe outside REBALANCE_UNIVERSES (e.g. a stray SP500 key)", () => {
    assert.deepEqual(normalizeWeights({ WIG20: 50, SP500: 50 }), { WIG20: 1 });
});

test("normalizeWeights returns {} when no weight is positive (e.g. an empty portfolio)", () => {
    assert.deepEqual(normalizeWeights({}), {});
    assert.deepEqual(normalizeWeights({ WIG20: 0, MWIG40: 0 }), {});
});

test("blendEquityCurves returns a weighted average over dates common to all weighted universes' curves", () => {
    _setState({
        equityCurveData: {
            WIG20: { dates: ["2026-01-01", "2026-01-08"], momentum_index: [100, 110], benchmark_index: [100, 105] },
            MWIG40: { dates: ["2026-01-01", "2026-01-08"], momentum_index: [100, 90], benchmark_index: [100, 95] },
        },
    });

    const curve = blendEquityCurves({ WIG20: 50, MWIG40: 50 });
    assert.deepEqual(curve.dates, ["2026-01-01", "2026-01-08"]);
    assert.deepEqual(curve.momentum_index, [100, 100]);
    assert.deepEqual(curve.benchmark_index, [100, 100]);
});

test("blendEquityCurves returns null when no weighted universe has usable equity-curve data", () => {
    _setState({ equityCurveData: {} });
    assert.equal(blendEquityCurves({ WIG20: 50, MWIG40: 50 }), null);
    assert.equal(blendEquityCurves({}), null);
});
