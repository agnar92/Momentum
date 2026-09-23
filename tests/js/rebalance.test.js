// Testy jednostkowe dla czystych funkcji finansowych w docs/js/rebalance.js.
// Uzywaja wbudowanego test runnera Node (node --test) — brak zewnetrznych
// zaleznosci npm, zeby nie dotykac wdrazanej strony (docs/) zadnym build stepem.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// rebalance.js odwoluje sie do localStorage na poziomie modulu (przy pierwszym
// wczytaniu ustawien/holdingow) — w Node go nie ma, ale loadSettings/
// loadHoldings/loadExcluded maja try/catch i bezpiecznie spadaja na wartosci
// domyslne, wiec prawdziwy localStorage nie jest tu w ogole potrzebny.
global.localStorage = {
    _store: {},
    getItem(key) { return Object.prototype.hasOwnProperty.call(this._store, key) ? this._store[key] : null; },
    setItem(key, value) { this._store[key] = String(value); },
    removeItem(key) { delete this._store[key]; },
};

const rebalance = require(path.join("..", "..", "docs", "js", "rebalance.js"));

const {
    fmtMoney,
    fmtMoneyPln,
    moneyFmtForCurrency,
    currentMoneyFmt,
    holdingsMoneyFmt,
    fmtQty,
    sharesSuggestion,
    currencyOf,
    CORE_ALLOCATION_PCT,
    WINNER_INDEX_WEIGHT_MULTIPLIER,
    combinedPoolRows,
    eligiblePoolRows,
    autoSelectedRows,
    selectCoreSatelliteRows,
    satelliteWinnerUniverse,
    computeAutoTargets,
    loadPoolStageFilter,
    savePoolStageFilter,
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

test("fmtMoneyPln formats with 2 decimals, pl-PL separators, and a zł suffix", () => {
    assert.equal(fmtMoneyPln(1234.5), "1234,50 zł");
    assert.equal(fmtMoneyPln(0), "0,00 zł");
});

test("fmtMoneyPln returns an em dash for null/undefined/NaN", () => {
    assert.equal(fmtMoneyPln(null), "—");
    assert.equal(fmtMoneyPln(undefined), "—");
    assert.equal(fmtMoneyPln(NaN), "—");
});

test("moneyFmtForCurrency picks fmtMoneyPln for PLN, fmtMoney otherwise", () => {
    assert.equal(moneyFmtForCurrency("PLN"), fmtMoneyPln);
    assert.equal(moneyFmtForCurrency("USD"), fmtMoney);
});

test("fmtQty rounds to 3 decimals and uses a comma decimal separator", () => {
    assert.equal(fmtQty(1.23456), "1,235");
    assert.equal(fmtQty(2), "2");
});

test("sharesSuggestion divides dollar amount by price, defaulting to fmtMoney", () => {
    const out = sharesSuggestion(1000, 50);
    assert.match(out, /^20 szt\./);
    assert.match(out, /\$1,000\.00/);
});

test("sharesSuggestion accepts an explicit money formatter (e.g. fmtMoneyPln)", () => {
    const out = sharesSuggestion(1000, 50, fmtMoneyPln);
    assert.match(out, /^20 szt\./);
    assert.match(out, /1000,00 zł/);
});

test("sharesSuggestion reports missing price instead of dividing by zero/undefined", () => {
    const out = sharesSuggestion(1000, 0);
    assert.match(out, /brak ceny/);
});

test("currencyOf resolves PLN for WIG20/mWIG40-sourced tickers, USD for everything else (including unknown) — holdings can still carry a legacy GPW position even though the rebalancer pool no longer picks from WIG20/mWIG40", () => {
    _setState({
        priceMap: {
            AAPL: { price: 200, sources: ["NASDAQ100"] },
            CAT: { price: 300, sources: ["DOWJONES"] },
            PKN: { price: 70, sources: ["WIG20"] },
            KGH: { price: 100, sources: ["MWIG40"] },
            UNKNOWN: { price: 1, sources: [] },
        },
    });
    assert.equal(currencyOf("AAPL"), "USD");
    assert.equal(currencyOf("CAT"), "USD");
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

// ---------- Pula rebalansera: combinedPoolRows/eligiblePoolRows/autoSelectedRows ----------
// Rebalanser jest teraz w pelni automatyczny: SP500 (constituents — juz top
// ~100 wg pipeline'u, jak SPMO) + NASDAQ100 (all_constituents — caly sklad)
// + DOWJONES (constituents — i tak juz caly sklad, rownowazony). WIG20/
// mWIG40 nie sa juz czescia tej puli w ogole.

function baseUniverseData() {
    return {
        SP500: {
            ref_date: "2026-09-19",
            constituents: [
                { ticker: "AAA", momentum_score: 2, price: 100, momentum_pct: 20, volatility_pct: 15, sector: "Tech", momentum_window: "M-14/M-2" },
            ],
            all_constituents: [
                { ticker: "AAA", momentum_score: 2, price: 100, momentum_pct: 20, volatility_pct: 15, sector: "Tech", momentum_window: "M-14/M-2" },
                { ticker: "NOT_IN_QUINTILE", momentum_score: 0.1, price: 50, momentum_pct: 1, volatility_pct: 10, sector: "Tech", momentum_window: "M-14/M-2" },
            ],
        },
        NASDAQ100: {
            ref_date: "2026-09-19",
            constituents: [],
            all_constituents: [
                { ticker: "BBB", momentum_score: 3, price: 200, momentum_pct: 30, volatility_pct: 25, sector: "Tech", momentum_window: "M-14/M-2" },
            ],
        },
        DOWJONES: {
            ref_date: "2026-09-19",
            constituents: [
                { ticker: "CCC", momentum_score: 1, price: 300, momentum_pct: 5, volatility_pct: 12, sector: "Industrials", momentum_window: "M-14/M-2" },
            ],
            all_constituents: [],
        },
    };
}

test("combinedPoolRows takes SP500's quintile-selected `constituents` (not all_constituents), NASDAQ100's full `all_constituents`, and DOWJONES's `constituents`", () => {
    _setState({ universeData: baseUniverseData(), excluded: [] });
    const rows = combinedPoolRows();
    const tickers = rows.map(r => r.ticker).sort();
    assert.deepEqual(tickers, ["AAA", "BBB", "CCC"]); // NOT_IN_QUINTILE excluded — SP500 uses constituents, not all_constituents
    _setState({ universeData: {}, excluded: [] });
});

test("combinedPoolRows sorts by momentum_score descending across universes", () => {
    _setState({ universeData: baseUniverseData(), excluded: [] });
    const rows = combinedPoolRows();
    assert.deepEqual(rows.map(r => r.ticker), ["BBB", "AAA", "CCC"]); // momentum_score 3, 2, 1
    _setState({ universeData: {}, excluded: [] });
});

test("combinedPoolRows dedupes a ticker present in two universes, keeping the occurrence with the higher momentum_score", () => {
    _setState({
        universeData: {
            SP500: { constituents: [{ ticker: "AAPL", momentum_score: 1.5, price: 200, universe: "SP500" }] },
            NASDAQ100: { all_constituents: [{ ticker: "AAPL", momentum_score: 2.5, price: 200, universe: "NASDAQ100" }] },
            DOWJONES: { constituents: [] },
        },
        excluded: [],
    });
    const rows = combinedPoolRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].universe, "NASDAQ100"); // higher momentum_score (2.5 > 1.5) wins
    _setState({ universeData: {}, excluded: [] });
});

test("eligiblePoolRows drops manually-excluded tickers and re-numbers pool_rank so TOP N always means N distinct, buyable companies", () => {
    _setState({ universeData: baseUniverseData(), excluded: ["BBB"] });
    const rows = eligiblePoolRows();
    assert.deepEqual(rows.map(r => r.ticker), ["AAA", "CCC"]); // BBB (top by score) is gone
    assert.deepEqual(rows.map(r => r.pool_rank), [1, 2]); // re-numbered, not [2, 3]
    _setState({ universeData: {}, excluded: [] });
});

// The stage filter (poolStageFilter) is not just a display filter for the
// ranking table — it narrows the pool the automatic engine itself selects
// from, per the user's explicit request ("jak zaznaczę [filtr] to ma taki N
// z tej listy wybrać, po to jest tam to filtrowanie").
function stageUniverseData() {
    return {
        SP500: {
            constituents: [
                { ticker: "S1", momentum_score: 3, price: 100, momentum_pct: 10, volatility_pct: 10, weekly_chart: { current_stage: "1" } },
                { ticker: "S2A", momentum_score: 2, price: 100, momentum_pct: 10, volatility_pct: 10, weekly_chart: { current_stage: "2A" } },
            ],
        },
        NASDAQ100: {
            all_constituents: [
                { ticker: "S2B", momentum_score: 1, price: 100, momentum_pct: 10, volatility_pct: 10, weekly_chart: { current_stage: "2B" } },
            ],
        },
        DOWJONES: {
            constituents: [
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
    // S1 (Etap 1) is the ONLY match, even though S2A/S2B/S4 all have higher-or-comparable momentum_score
    // and would otherwise outrank it in the unfiltered pool.
    assert.deepEqual(autoSelectedRows(3).map(r => r.ticker), ["S1"]);
    const { targets } = computeAutoTargets(3, 1000);
    assert.deepEqual(Object.keys(targets), ["S1"]);
    assert.equal(targets.S1.target_value, 1000);
    _setState({ universeData: {}, excluded: [], poolStageFilter: "ALL" });
});

test("eligiblePoolRows returns everything (no narrowing) when poolStageFilter is the ALL sentinel", () => {
    _setState({ universeData: stageUniverseData(), excluded: [], poolStageFilter: "ALL" });
    assert.deepEqual(eligiblePoolRows().map(r => r.ticker), ["S1", "S2A", "S2B", "S4"]); // sorted by momentum_score
    _setState({ universeData: {}, excluded: [] });
});

// ---------- loadPoolStageFilter / savePoolStageFilter (persistence) ----------
// Real bug: poolStageFilter used to be an in-memory-only `let`, never written
// to localStorage like settings/holdings/excluded/poolCollapsed — navigating
// away and back (a fresh page load, fresh module state) silently reset it to
// "ALL", so the suggestion table/weights after returning were computed from
// the full, unfiltered pool even though the user still thought a stage
// filter (e.g. "Etap 2") was active.

test("loadPoolStageFilter defaults to ALL when nothing is stored", () => {
    global.localStorage.removeItem("momentum_rebalance_stage_filter");
    assert.equal(loadPoolStageFilter(), "ALL");
});

test("savePoolStageFilter/loadPoolStageFilter round-trips a Set of stages", () => {
    savePoolStageFilter(new Set(["1", "2"]));
    const loaded = loadPoolStageFilter();
    assert.ok(loaded instanceof Set);
    assert.deepEqual([...loaded].sort(), ["1", "2"]);
    global.localStorage.removeItem("momentum_rebalance_stage_filter");
});

test("savePoolStageFilter/loadPoolStageFilter round-trips the ALL sentinel", () => {
    savePoolStageFilter(new Set(["1"]));
    savePoolStageFilter("ALL");
    assert.equal(loadPoolStageFilter(), "ALL");
});

test("loadPoolStageFilter falls back to ALL on corrupt/invalid stored JSON", () => {
    global.localStorage.setItem("momentum_rebalance_stage_filter", "{not json");
    assert.equal(loadPoolStageFilter(), "ALL");
    global.localStorage.removeItem("momentum_rebalance_stage_filter");
});

test("autoSelectedRows returns the core+satellite union (core first), [] for N <= 0", () => {
    _setState({ universeData: baseUniverseData(), excluded: [] });
    // n=2 -> coreSlots=round(2*0.6)=1: CCC (the only DOWJONES candidate) fills
    // core; BBB (highest remaining momentum_score) fills the 1 satellite slot.
    assert.deepEqual(autoSelectedRows(2).map(r => r.ticker), ["CCC", "BBB"]);
    assert.deepEqual(autoSelectedRows(0), []);
    assert.deepEqual(autoSelectedRows(null), []);
    _setState({ universeData: {}, excluded: [] });
});

// ---------- CORE / SATELITA (60/40) — selectCoreSatelliteRows ----------
// Core (CORE_ALLOCATION_PCT=60%) bierze DOWJONES wg momentum_score, dobijane
// z SP500 gdy Dow nie wystarczy; satelita to reszta puli wg momentum_score,
// faworyzująca dodatkowo zwycięzcę GEM (patrz niżej). Core NIE ma własnego,
// zaszytego na sztywno priorytetu etapu Weinsteina — o to, które etapy w
// ogóle trafiają do puli (i przez to do core), decyduje wyłącznie użytkownik
// przez poolStageFilter (patrz osobny test niżej: "core respects the user's
// own stage filter...").

function coreSatelliteUniverseData() {
    return {
        DOWJONES: {
            constituents: [
                // Wyzszy momentum_score wygrywa w core niezaleznie od etapu —
                // nie ma juz zaszytego priorytetu "faza wzrostowa najpierw".
                { ticker: "DOW_HOT", momentum_score: 5, price: 100, momentum_pct: 10, volatility_pct: 10, weekly_chart: { current_stage: "1" } },
                { ticker: "DOW_MILD", momentum_score: 2, price: 100, momentum_pct: 10, volatility_pct: 10, weekly_chart: { current_stage: "2A" } },
            ],
        },
        SP500: {
            constituents: [
                { ticker: "SPX_BACKUP", momentum_score: 4, price: 100, momentum_pct: 10, volatility_pct: 10, weekly_chart: { current_stage: "2A" } },
            ],
        },
        NASDAQ100: {
            all_constituents: [
                { ticker: "NDX_HOT", momentum_score: 10, price: 100, momentum_pct: 10, volatility_pct: 10 },
            ],
        },
    };
}

test("selectCoreSatelliteRows returns empty sleeves for n <= 0", () => {
    _setState({ universeData: coreSatelliteUniverseData(), excluded: [] });
    assert.deepEqual(selectCoreSatelliteRows(0), { coreRows: [], satelliteRows: [] });
    assert.deepEqual(selectCoreSatelliteRows(null), { coreRows: [], satelliteRows: [] });
    _setState({ universeData: {}, excluded: [] });
});

test("core ranks Dow candidates by momentum_score alone, ignoring Weinstein stage", () => {
    _setState({ universeData: coreSatelliteUniverseData(), excluded: [] });
    // n=1 -> coreSlots=round(0.6)=1. DOW_HOT (score 5, Etap 1) beats
    // DOW_MILD (score 2, Etap 2A) — no growth-phase tiebreak any more.
    const { coreRows } = selectCoreSatelliteRows(1);
    assert.deepEqual(coreRows.map(r => r.ticker), ["DOW_HOT"]);
    _setState({ universeData: {}, excluded: [] });
});

test("core backfills from SP500 by momentum_score once DOWJONES itself can't fill every core slot", () => {
    _setState({ universeData: coreSatelliteUniverseData(), excluded: [] });
    // n=5 -> coreSlots=round(3)=3: both Dow names (2) + the one SP500 backup.
    const { coreRows } = selectCoreSatelliteRows(5);
    assert.deepEqual(coreRows.map(r => r.ticker).sort(), ["DOW_HOT", "DOW_MILD", "SPX_BACKUP"]);
    _setState({ universeData: {}, excluded: [] });
});

test("satellite takes what's left after core, sorted by momentum_score, never re-picking a core ticker", () => {
    _setState({ universeData: coreSatelliteUniverseData(), excluded: [] });
    // n=2 -> coreSlots=1 (DOW_HOT, highest score). Satellite pool excludes
    // DOW_HOT and takes the top-scoring remaining name (NDX_HOT, score 10).
    const { coreRows, satelliteRows } = selectCoreSatelliteRows(2);
    assert.deepEqual(coreRows.map(r => r.ticker), ["DOW_HOT"]);
    assert.deepEqual(satelliteRows.map(r => r.ticker), ["NDX_HOT"]);
    _setState({ universeData: {}, excluded: [] });
});

test("core respects the user's own stage filter — selecting Etap 2 keeps a Stage-1 name (even with a higher score) out of core entirely", () => {
    _setState({ universeData: coreSatelliteUniverseData(), excluded: [], poolStageFilter: new Set(["2"]) });
    // With the Etap 2 filter active, DOW_HOT (Etap 1) never reaches
    // eligiblePoolRows() at all, so core falls through to DOW_MILD (Etap 2A)
    // even though DOW_HOT has the higher raw momentum_score — the user's own
    // filter selection, not a hardcoded stage check, is what decides this.
    const { coreRows } = selectCoreSatelliteRows(1);
    assert.deepEqual(coreRows.map(r => r.ticker), ["DOW_MILD"]);
    _setState({ universeData: {}, excluded: [], poolStageFilter: "ALL" });
});

test("core selection uses TRUE DOWJONES/SP500 membership, not combinedPoolRows' post-dedup universe tag", () => {
    _setState({
        universeData: {
            // MEGA is a real Dow 30 member but also SP500, with a HIGHER score there,
            // so combinedPoolRows() tags it "SP500" — core must still recognize it as Dow.
            SP500: { constituents: [{ ticker: "MEGA", momentum_score: 5, price: 100, momentum_pct: 10, volatility_pct: 10 }] },
            NASDAQ100: { all_constituents: [{ ticker: "OTHER", momentum_score: 5, price: 100, momentum_pct: 10, volatility_pct: 10 }] },
            DOWJONES: { constituents: [{ ticker: "MEGA", momentum_score: 1, price: 100, momentum_pct: 10, volatility_pct: 10 }] },
        },
        excluded: [],
    });
    assert.equal(combinedPoolRows().find(r => r.ticker === "MEGA").universe, "SP500"); // dedup picked the higher-score occurrence

    const { coreRows } = selectCoreSatelliteRows(1); // coreSlots=1
    assert.deepEqual(coreRows.map(r => r.ticker), ["MEGA"]); // still recognized as Dow, takes the core slot over OTHER
    _setState({ universeData: {}, excluded: [] });
});

// ---------- satelliteWinnerUniverse (GEM) ----------

test("satelliteWinnerUniverse returns the REBALANCE_UNIVERSES member with the highest known 12M return", () => {
    _setState({ gemIndexReturns: { SP500: 18.98, NASDAQ100: 25.8, DOWJONES: 16.78 } });
    assert.equal(satelliteWinnerUniverse(), "NASDAQ100");
    _setState({ gemIndexReturns: {} });
});

test("satelliteWinnerUniverse returns null when no GEM data is known (e.g. offline)", () => {
    _setState({ gemIndexReturns: {} });
    assert.equal(satelliteWinnerUniverse(), null);
});

test("satelliteWinnerUniverse returns null on an exact tie between the top two universes, rather than silently favoring whichever comes first in REBALANCE_UNIVERSES", () => {
    _setState({ gemIndexReturns: { SP500: 11.23, NASDAQ100: 11.23, DOWJONES: 9.0 } });
    assert.equal(satelliteWinnerUniverse(), null);
    _setState({ gemIndexReturns: {} });
});

// ---------- computeAutoTargets / deriveUniverseFractionsFromTargets ----------

test("computeAutoTargets splits capital 60/40 between core and satellite, weighting each sleeve by momentum_score internally", () => {
    _setState({
        universeData: {
            DOWJONES: { constituents: [{ ticker: "D1", momentum_score: 1, price: 10, momentum_pct: 10, volatility_pct: 10 }] },
            SP500: { constituents: [] },
            NASDAQ100: { all_constituents: [{ ticker: "N1", momentum_score: 1, price: 10, momentum_pct: 10, volatility_pct: 10 }] },
        },
        excluded: [], gemIndexReturns: {},
    });
    // n=2 -> coreSlots=round(1.2)=1: D1 (the only Dow candidate) fills core;
    // N1 fills the 1 satellite slot. Each sleeve has exactly one member, so it
    // gets its whole sleeve's capital regardless of raw_weight.
    const { targets } = computeAutoTargets(2, 1000);
    assert.equal(targets.D1.sleeve, "core");
    assert.equal(targets.N1.sleeve, "satellite");
    assert.ok(Math.abs(targets.D1.target_value - 1000 * CORE_ALLOCATION_PCT) < 1e-6);
    assert.ok(Math.abs(targets.N1.target_value - 1000 * (1 - CORE_ALLOCATION_PCT)) < 1e-6);
    _setState({ universeData: {}, excluded: [] });
});

test("computeAutoTargets weights multiple satellite picks by momentum_score, normalized within the satellite's own capital", () => {
    _setState({
        universeData: {
            DOWJONES: { constituents: [] }, // no core candidates -> all capital to satellite (separate test below)
            SP500: { constituents: [] },
            NASDAQ100: {
                all_constituents: [
                    { ticker: "BIG", momentum_score: 3, price: 10, momentum_pct: 20, volatility_pct: 15 },
                    { ticker: "MID", momentum_score: 1, price: 10, momentum_pct: 10, volatility_pct: 10 },
                ],
            },
        },
        excluded: [], gemIndexReturns: {},
    });

    const { targets } = computeAutoTargets(2, 1000);
    // Core empty -> satellite gets 100% of capital. Suma surowych wag: 3+1=4 -> BIG 75%, MID 25%.
    assert.ok(Math.abs(targets.BIG.target_value - 750) < 1e-6);
    assert.ok(Math.abs(targets.MID.target_value - 250) < 1e-6);
    const total = Object.values(targets).reduce((s, t) => s + t.target_value, 0);
    assert.ok(Math.abs(total - 1000) < 1e-6);

    _setState({ universeData: {}, excluded: [] });
});

test("computeAutoTargets rolls a sleeve's capital into the other sleeve when it comes up empty, so no capital silently vanishes", () => {
    // Core empty (no Dow/SP500 candidates at all) -> satellite gets 100%.
    _setState({
        universeData: {
            DOWJONES: { constituents: [] },
            SP500: { constituents: [] },
            NASDAQ100: { all_constituents: [{ ticker: "N1", momentum_score: 1, price: 10, momentum_pct: 10, volatility_pct: 10 }] },
        },
        excluded: [], gemIndexReturns: {},
    });
    let { targets } = computeAutoTargets(1, 1000);
    assert.ok(Math.abs(targets.N1.target_value - 1000) < 1e-6);
    _setState({ universeData: {}, excluded: [] });

    // Satellite empty (n exactly matches the number of core candidates) -> core gets 100%.
    _setState({
        universeData: {
            DOWJONES: { constituents: [{ ticker: "D1", momentum_score: 1, price: 10, momentum_pct: 10, volatility_pct: 10 }] },
            SP500: { constituents: [] },
            NASDAQ100: { all_constituents: [] },
        },
        excluded: [], gemIndexReturns: {},
    });
    ({ targets } = computeAutoTargets(1, 1000)); // coreSlots=1, D1 fills it, nothing left for satellite
    assert.ok(Math.abs(targets.D1.target_value - 1000) < 1e-6);
    _setState({ universeData: {}, excluded: [] });
});

test("computeAutoTargets returns no targets when N is 0 or totalCapital is 0", () => {
    _setState({ universeData: baseUniverseData(), excluded: [], gemIndexReturns: {} });
    assert.deepEqual(computeAutoTargets(0, 1000).targets, {});

    const { targets } = computeAutoTargets(1, 0); // coreSlots=1 -> CCC (the only Dow candidate)
    assert.ok("CCC" in targets);
    assert.equal(targets.CCC.target_value, 0); // brak kapitalu -> target_value zostaje na 0

    _setState({ universeData: {}, excluded: [] });
});

test("computeAutoTargets excludes manually-excluded tickers entirely, backfilling from the pool", () => {
    _setState({ universeData: baseUniverseData(), excluded: ["CCC"], gemIndexReturns: {} }); // the only DOWJONES core candidate excluded
    const { targets } = computeAutoTargets(2, 1000);
    // CCC (Dow) is gone -> core's 1 slot backfills from SP500 (AAA) instead;
    // BBB (highest remaining momentum_score) still fills the 1 satellite slot.
    assert.deepEqual(Object.keys(targets).sort(), ["AAA", "BBB"]);
    assert.equal(targets.AAA.sleeve, "core");
    assert.equal(targets.BBB.sleeve, "satellite");
    _setState({ universeData: {}, excluded: [] });
});

test("computeAutoTargets tilts satellite weight toward TRUE members of the GEM-winning universe, not selection", () => {
    _setState({
        universeData: {
            // Two real Dow candidates exactly fill core's slots (coreSlots=2 at n=4
            // below) so core never needs to backfill from SP500 — otherwise SPX_A
            // would get swept into core via backfill instead of staying in satellite.
            DOWJONES: {
                constituents: [
                    { ticker: "D1", momentum_score: 1, price: 100, momentum_pct: 10, volatility_pct: 10 },
                    { ticker: "D2", momentum_score: 1, price: 100, momentum_pct: 10, volatility_pct: 10 },
                ],
            },
            SP500: { constituents: [{ ticker: "SPX_A", momentum_score: 2, price: 100, momentum_pct: 10, volatility_pct: 10 }] },
            NASDAQ100: { all_constituents: [{ ticker: "NDX_A", momentum_score: 2, price: 100, momentum_pct: 10, volatility_pct: 10 }] },
        },
        excluded: [],
        gemIndexReturns: { SP500: 18.98, NASDAQ100: 25.8, DOWJONES: 16.78 }, // NASDAQ100 wins
    });

    // n=4 -> coreSlots=round(2.4)=2, fully satisfied by D1+D2 -> satelliteSlots=2,
    // taking both SPX_A and NDX_A.
    const { targets } = computeAutoTargets(4, 1000);
    assert.equal(targets.SPX_A.sleeve, "satellite");
    assert.equal(targets.NDX_A.sleeve, "satellite");
    // Equal momentum_score (2 vs 2), but NDX_A's universe (NASDAQ100) is winning GEM,
    // so it gets WINNER_INDEX_WEIGHT_MULTIPLIER times the satellite raw weight -> bigger share.
    assert.ok(WINNER_INDEX_WEIGHT_MULTIPLIER > 1);
    assert.ok(targets.NDX_A.target_value > targets.SPX_A.target_value);
    const satelliteCapital = targets.SPX_A.target_value + targets.NDX_A.target_value;
    const expectedNdxShare = WINNER_INDEX_WEIGHT_MULTIPLIER / (WINNER_INDEX_WEIGHT_MULTIPLIER + 1);
    assert.ok(Math.abs(targets.NDX_A.target_value - satelliteCapital * expectedNdxShare) < 1e-6);

    _setState({ universeData: {}, excluded: [], gemIndexReturns: {} });
});

test("deriveUniverseFractionsFromTargets sums target_value per universe, splitting a merged multi-universe ticker evenly", () => {
    const fractions = deriveUniverseFractionsFromTargets({
        AAA: { target_value: 600, universes: ["NASDAQ100"] },
        BBB: { target_value: 400, universes: ["DOWJONES"] },
        SHARED: { target_value: 200, universes: ["NASDAQ100", "SP500"] },
    });
    assert.ok(Math.abs(fractions.NASDAQ100 - 700) < 1e-9); // 600 + 200/2
    assert.ok(Math.abs(fractions.DOWJONES - 400) < 1e-9);
    assert.ok(Math.abs(fractions.SP500 - 100) < 1e-9); // 200/2
});

test("deriveUniverseFractionsFromTargets ignores targets with zero value", () => {
    const fractions = deriveUniverseFractionsFromTargets({
        ZERO: { target_value: 0, universes: ["NASDAQ100"] },
    });
    assert.deepEqual(fractions, {});
});

// ---------- currentMoneyFmt / holdingsMoneyFmt ----------
// currentMoneyFmt drives the auto-selected portfolio's own outputs (ranking,
// suggestion table, stats, Monte Carlo, equity curve) — the pool is always
// SP500+NASDAQ100+DOWJONES, i.e. always USD, so this is now a constant.
// holdingsMoneyFmt is separate and still currency-mix-aware, because the
// holdings table can still carry a legacy WIG20/mWIG40 position even though
// the rebalancer no longer picks from those universes.

test("currentMoneyFmt is always fmtMoney — the rebalancer pool is USD-only now", () => {
    assert.equal(currentMoneyFmt(), fmtMoney);
});

test("holdingsMoneyFmt is fmtMoney when there are no holdings yet", () => {
    _setState({ holdings: [], priceMap: {} });
    assert.equal(holdingsMoneyFmt(), fmtMoney);
});

test("holdingsMoneyFmt is fmtMoneyPln only when every held ticker is PLN, fmtMoney otherwise (including a mix)", () => {
    _setState({
        holdings: [{ ticker: "KGH", shares: 1 }, { ticker: "X", shares: 1 }],
        priceMap: { KGH: { price: 100, sources: ["WIG20"] }, X: { price: 50, sources: ["MWIG40"] } },
    });
    assert.equal(holdingsMoneyFmt(), fmtMoneyPln);

    _setState({
        holdings: [{ ticker: "AAPL", shares: 1 }, { ticker: "CAT", shares: 1 }],
        priceMap: { AAPL: { price: 200, sources: ["NASDAQ100"] }, CAT: { price: 300, sources: ["DOWJONES"] } },
    });
    assert.equal(holdingsMoneyFmt(), fmtMoney);

    _setState({
        holdings: [{ ticker: "AAPL", shares: 1 }, { ticker: "KGH", shares: 1 }],
        priceMap: { AAPL: { price: 200, sources: ["NASDAQ100"] }, KGH: { price: 100, sources: ["WIG20"] } },
    });
    assert.equal(holdingsMoneyFmt(), fmtMoney);

    _setState({ holdings: [], priceMap: {} });
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

// ---------- normalizeWeights / blendEquityCurves (used to blend the equity
// curve across whichever of SP500/NASDAQ100/DOWJONES the current TOP N spans) ----------

test("normalizeWeights normalizes positive weights to fractions summing to 1, dropping zero/negative entries", () => {
    assert.deepEqual(normalizeWeights({ NASDAQ100: 50, DOWJONES: 50 }), { NASDAQ100: 0.5, DOWJONES: 0.5 });
    assert.deepEqual(normalizeWeights({ NASDAQ100: 30, DOWJONES: 30 }), { NASDAQ100: 0.5, DOWJONES: 0.5 });
    assert.deepEqual(normalizeWeights({ NASDAQ100: 100, DOWJONES: 0, SP500: -5 }), { NASDAQ100: 1 });
});

test("normalizeWeights ignores a universe outside REBALANCE_UNIVERSES (e.g. a stray WIG20 key)", () => {
    assert.deepEqual(normalizeWeights({ NASDAQ100: 50, WIG20: 50 }), { NASDAQ100: 1 });
});

test("normalizeWeights returns {} when no weight is positive (e.g. an empty portfolio)", () => {
    assert.deepEqual(normalizeWeights({}), {});
    assert.deepEqual(normalizeWeights({ SP500: 0, NASDAQ100: 0 }), {});
});

test("blendEquityCurves returns a weighted average over dates common to all weighted universes' curves", () => {
    _setState({
        equityCurveData: {
            NASDAQ100: { dates: ["2026-01-01", "2026-01-08"], momentum_index: [100, 110], benchmark_index: [100, 105] },
            DOWJONES: { dates: ["2026-01-01", "2026-01-08"], momentum_index: [100, 90], benchmark_index: [100, 95] },
        },
    });

    const curve = blendEquityCurves({ NASDAQ100: 50, DOWJONES: 50 });
    assert.deepEqual(curve.dates, ["2026-01-01", "2026-01-08"]);
    assert.deepEqual(curve.momentum_index, [100, 100]);
    assert.deepEqual(curve.benchmark_index, [100, 100]);
});

test("blendEquityCurves works with raw target-value sums (not just percentages) since the scale is normalized away", () => {
    _setState({
        equityCurveData: {
            NASDAQ100: { dates: ["2026-01-01", "2026-01-08"], momentum_index: [100, 120], benchmark_index: [100, 110] },
        },
    });
    // Jedno uniwersum w portfelu (typowy przypadek) -> krzywa niezmieniona.
    const curve = blendEquityCurves({ NASDAQ100: 700 });
    assert.deepEqual(curve.momentum_index, [100, 120]);
});

test("blendEquityCurves only uses dates present in every weighted curve, and returns null when fewer than 2 remain", () => {
    _setState({
        equityCurveData: {
            NASDAQ100: { dates: ["2026-01-01", "2026-01-08", "2026-01-15"], momentum_index: [100, 110, 120], benchmark_index: [100, 105, 110] },
            DOWJONES: { dates: ["2026-01-01", "2026-01-15"], momentum_index: [100, 130], benchmark_index: [100, 120] },
        },
    });

    const curve = blendEquityCurves({ NASDAQ100: 50, DOWJONES: 50 });
    assert.deepEqual(curve.dates, ["2026-01-01", "2026-01-15"]);
    assert.deepEqual(curve.momentum_index, [100, 125]);

    _setState({ equityCurveData: { NASDAQ100: { dates: ["2026-01-01"], momentum_index: [100], benchmark_index: [100] } } });
    assert.equal(blendEquityCurves({ NASDAQ100: 100 }), null);

    _setState({ equityCurveData: {} });
});

test("blendEquityCurves returns null when no weighted universe has usable equity-curve data", () => {
    _setState({ equityCurveData: {} });
    assert.equal(blendEquityCurves({ NASDAQ100: 50, DOWJONES: 50 }), null);
    assert.equal(blendEquityCurves({}), null);
});
