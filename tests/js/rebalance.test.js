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
    universeWeightSharePct,
    parseXtbOpenPositions,
    weightedMuSigma,
    simulateMonteCarlo,
    randNormal,
    blendEquityCurves,
    tvSymbolFor,
    buildTvPortfolioCsv,
    xtbDateToIso,
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

test("parseXtbOpenPositions captures Open price / Open time when the report has those columns", () => {
    const workbook = {
        SheetNames: ["Open Positions"],
        Sheets: {
            "Open Positions": [
                ["Ticker", "Type", "Volume", "Open price", "Open time"],
                ["AAPL.US", "", "10", "217", "2024-09-17 0:00:00"],
                ["MSFT.US", "", "2", "410.5", "15.03.2023 9:30:00"],
            ],
        },
    };
    global.XLSX = { utils: { sheet_to_json: (sheet) => sheet } };

    const imported = parseXtbOpenPositions(workbook);
    assert.deepEqual(imported, [
        { ticker: "AAPL", shares: 10, openPrice: 217, openDate: "2024-09-17" },
        { ticker: "MSFT", shares: 2, openPrice: 410.5, openDate: "2023-03-15" },
    ]);

    delete global.XLSX;
});

test("parseXtbOpenPositions recognizes Polish column names for open price/date", () => {
    const workbook = {
        SheetNames: ["Open Positions"],
        Sheets: {
            "Open Positions": [
                ["Ticker", "Type", "Volume", "Cena otwarcia", "Data otwarcia"],
                ["AAPL.US", "", "1", "150", "2022-01-05"],
            ],
        },
    };
    global.XLSX = { utils: { sheet_to_json: (sheet) => sheet } };

    const imported = parseXtbOpenPositions(workbook);
    assert.deepEqual(imported, [{ ticker: "AAPL", shares: 1, openPrice: 150, openDate: "2022-01-05" }]);

    delete global.XLSX;
});

test("xtbDateToIso converts an Excel serial date number to YYYY-MM-DD", () => {
    // 45552 = 2024-09-17 (dni od 1899-12-30, standardowe liczenie Excela)
    assert.equal(xtbDateToIso(45552), "2024-09-17");
});

test("xtbDateToIso returns null for unparseable values", () => {
    assert.equal(xtbDateToIso(""), null);
    assert.equal(xtbDateToIso(null), null);
    assert.equal(xtbDateToIso("not a date"), null);
});

test("computeTargets takes the TOP N constituents per universe (already sorted by weight_pct) and weights the combined pool by raw weight_pct", () => {
    _setState({
        universeData: {
            NASDAQ100: {
                constituents: [
                    { ticker: "BIG", weight_pct: 60, price: 10 },
                    { ticker: "MID", weight_pct: 30, price: 10 },
                    { ticker: "SMALL", weight_pct: 10, price: 10 }, // poza TOP 2
                ],
            },
            DOWJONES: { constituents: [{ ticker: "BBB", weight_pct: 100, price: 20 }] },
        },
        settings: { topN: { NASDAQ100: 2, DOWJONES: 1 } },
        excluded: [],
    });

    const { targets } = computeTargets(1000);
    assert.equal("SMALL" in targets, false);
    // Suma surowych wag wybranych: 60 + 30 + 100 = 190.
    assert.ok(Math.abs(targets.BIG.target_value - 1000 * 60 / 190) < 1e-6);
    assert.ok(Math.abs(targets.MID.target_value - 1000 * 30 / 190) < 1e-6);
    assert.ok(Math.abs(targets.BBB.target_value - 1000 * 100 / 190) < 1e-6);
    const total = Object.values(targets).reduce((s, t) => s + t.target_value, 0);
    assert.ok(Math.abs(total - 1000) < 1e-6);
});

test("computeTargets skips a universe with topN 0 or missing", () => {
    _setState({
        universeData: {
            NASDAQ100: { constituents: [{ ticker: "AAA", weight_pct: 100, price: 10 }] },
            DOWJONES: { constituents: [{ ticker: "BBB", weight_pct: 100, price: 20 }] },
        },
        settings: { topN: { NASDAQ100: 5 } }, // brak DOWJONES -> traktowane jak 0
        excluded: [],
    });

    const { targets } = computeTargets(1000);
    assert.equal("AAA" in targets, true);
    assert.equal("BBB" in targets, false);
    assert.ok(Math.abs(targets.AAA.target_value - 1000) < 1e-9);
});

test("computeTargets excludes tickers in the excluded list entirely, so TOP N is filled from what remains", () => {
    _setState({
        universeData: {
            NASDAQ100: {
                constituents: [
                    { ticker: "EXCLUDED", weight_pct: 60, price: 10 },
                    { ticker: "AAA", weight_pct: 30, price: 10 },
                    { ticker: "NEXT", weight_pct: 10, price: 10 },
                ],
            },
            DOWJONES: { constituents: [] },
        },
        settings: { topN: { NASDAQ100: 2, DOWJONES: 0 } },
        excluded: ["EXCLUDED"],
    });

    const { targets } = computeTargets(1000);
    assert.equal("EXCLUDED" in targets, false);
    // TOP 2 z tego, co zostaje po wykluczeniu: AAA i NEXT (nie AAA sam).
    assert.equal("AAA" in targets, true);
    assert.equal("NEXT" in targets, true);
});

test("universeWeightSharePct splits by the combined raw weight_pct of each universe's TOP N selection", () => {
    _setState({
        universeData: {
            NASDAQ100: {
                constituents: [
                    { ticker: "AAA", weight_pct: 40, price: 10 },
                    { ticker: "BBB", weight_pct: 20, price: 10 },
                ],
            },
            DOWJONES: { constituents: [{ ticker: "CCC", weight_pct: 40, price: 10 }] },
        },
        settings: { topN: { NASDAQ100: 2, DOWJONES: 1 } },
        excluded: [],
    });

    const pct = universeWeightSharePct();
    // NASDAQ100: 40+20=60, DOWJONES: 40 -> suma 100 -> 60% / 40%.
    assert.ok(Math.abs(pct.NASDAQ100 - 60) < 1e-9);
    assert.ok(Math.abs(pct.DOWJONES - 40) < 1e-9);
});

test("universeWeightSharePct returns 0/0 when nothing is selected", () => {
    _setState({
        universeData: { NASDAQ100: { constituents: [] }, DOWJONES: { constituents: [] } },
        settings: { topN: { NASDAQ100: 0, DOWJONES: 0 } },
        excluded: [],
    });

    const pct = universeWeightSharePct();
    assert.equal(pct.NASDAQ100, 0);
    assert.equal(pct.DOWJONES, 0);
});

test("blendEquityCurves weights universes by the given pct split", () => {
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

test("blendEquityCurves returns null when the pct split sums to zero", () => {
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

// ---------- EKSPORT DO TRADINGVIEW PORTFOLIO ----------

test("tvSymbolFor prefixes GPW: for WIG20/mWIG40-sourced tickers, NASDAQ: otherwise", () => {
    _setState({
        priceMap: {
            AAPL: { price: 200, sources: ["NASDAQ100"] },
            PKN: { price: 70, sources: ["WIG20"] },
            KGH: { price: 100, sources: ["MWIG40"] },
            UNKNOWN: { price: 1, sources: [] },
        },
    });
    assert.equal(tvSymbolFor("AAPL"), "NASDAQ:AAPL");
    assert.equal(tvSymbolFor("PKN"), "GPW:PKN");
    assert.equal(tvSymbolFor("KGH"), "GPW:KGH");
    assert.equal(tvSymbolFor("UNKNOWN"), "NASDAQ:UNKNOWN");
    _setState({ priceMap: {} });
});

test("buildTvPortfolioCsv exports one Buy row per holding at the current price, skipping empty rows", () => {
    _setState({
        holdings: [
            { ticker: "AAPL", shares: 10 },
            { ticker: "PKN", shares: 5 },
            { ticker: "", shares: 3 },      // brak tickera -> pomijany
            { ticker: "NOPRICE", shares: 0 }, // brak ilosci -> pomijany
        ],
        priceMap: {
            AAPL: { price: 217, sources: ["NASDAQ100"] },
            PKN: { price: 70.5, sources: ["WIG20"] },
        },
    });

    const csv = buildTvPortfolioCsv();
    const lines = csv.split("\n");
    assert.equal(lines[0], "Symbol,Side,Qty,Fill Price,Commission,Closing Time");
    assert.equal(lines.length, 3);
    assert.match(lines[1], /^NASDAQ:AAPL,Buy,10,217,0,\d{4}-\d{2}-\d{2} 0:00:00$/);
    assert.match(lines[2], /^GPW:PKN,Buy,5,70\.5,0,\d{4}-\d{2}-\d{2} 0:00:00$/);

    _setState({ holdings: [], priceMap: {} });
});

test("buildTvPortfolioCsv leaves Fill Price blank when the ticker has no known price", () => {
    _setState({
        holdings: [{ ticker: "MYSTERY", shares: 2 }],
        priceMap: {},
    });

    const csv = buildTvPortfolioCsv();
    const lines = csv.split("\n");
    assert.match(lines[1], /^NASDAQ:MYSTERY,Buy,2,,0,\d{4}-\d{2}-\d{2} 0:00:00$/);

    _setState({ holdings: [], priceMap: {} });
});

test("buildTvPortfolioCsv uses each holding's own openDate/openPrice from the XTB import instead of today", () => {
    _setState({
        holdings: [
            // Pochodzi z importu XTB z kolumnami Open price/Open time -> prawdziwa data/cena zakupu.
            { ticker: "AAPL", shares: 10, openPrice: 217, openDate: "2024-09-17" },
            // Dodana recznie (albo import ze starszego raportu bez tych kolumn) -> fallback na dzis/obecna cene.
            { ticker: "MSFT", shares: 3 },
        ],
        priceMap: {
            AAPL: { price: 240, sources: ["NASDAQ100"] }, // obecna cena rynkowa - NIE powinna byc uzyta dla AAPL
            MSFT: { price: 410, sources: ["NASDAQ100"] },
        },
    });

    const csv = buildTvPortfolioCsv();
    const lines = csv.split("\n");
    assert.equal(lines[1], "NASDAQ:AAPL,Buy,10,217,0,2024-09-17 0:00:00");
    assert.match(lines[2], /^NASDAQ:MSFT,Buy,3,410,0,\d{4}-\d{2}-\d{2} 0:00:00$/);

    _setState({ holdings: [], priceMap: {} });
});
