// Testy jednostkowe dla czystych funkcji finansowych w docs/js/rebalance.js.
// Uzywaja wbudowanego test runnera Node (node --test) — brak zewnetrznych
// zaleznosci npm, zeby nie dotykac wdrazanej strony (docs/) zadnym build stepem.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// rebalance.js odwoluje sie do localStorage na poziomie modulu (przy pierwszym
// wczytaniu ustawien/holdingow) — w Node go nie ma, ale loadSettings/loadHoldings
// maja try/catch i bezpiecznie spadaja na wartosci domyslne. loadManualGemReturns/
// applyManualGemOverrides (rowniez uzywane przy pierwszym wczytaniu) maja ten sam
// fallback — ale zeby faktycznie PRZETESTOWAC zapis/odczyt recznego zwrotu GEM
// (patrz testy nizej), podstawiamy minimalna, w-pamieci implementacje localStorage
// PRZED require() modulu (ten sam globalny obiekt, ktory uzywalaby prawdziwa
// przegladarka — patrz saveManualGemReturns w rebalance.js).
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
    moneyFmtFor,
    moneyFmtForCurrency,
    fmtQty,
    sharesSuggestion,
    currencyOf,
    selectedConstituents,
    computeTargets,
    parseXtbOpenPositions,
    weightedMuSigma,
    simulateMonteCarlo,
    randNormal,
    tvSymbolFor,
    buildTvPortfolioCsv,
    xtbDateToIso,
    loadManualGemReturns,
    saveManualGemReturns,
    applyManualGemOverrides,
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

test("moneyFmtFor picks fmtMoneyPln when the current GEM winner is WIG20/mWIG40, fmtMoney otherwise (including no winner yet)", () => {
    _setState({ gemData: { winner: "WIG20" } });
    assert.equal(moneyFmtFor(), fmtMoneyPln);
    _setState({ gemData: { winner: "MWIG40" } });
    assert.equal(moneyFmtFor(), fmtMoneyPln);
    _setState({ gemData: { winner: "NASDAQ100" } });
    assert.equal(moneyFmtFor(), fmtMoney);
    _setState({ gemData: { winner: null } });
    assert.equal(moneyFmtFor(), fmtMoney);
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

test("currencyOf resolves PLN for WIG20/mWIG40-sourced tickers, USD for everything else (including unknown)", () => {
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

// ---------- selectedConstituents / computeTargets (GEM-winner-driven, no more regions) ----------

test("selectedConstituents sorts the winning universe's all_constituents by rank ascending and slices to topN", () => {
    _setState({
        gemData: { winner: "NASDAQ100" },
        universeData: {
            NASDAQ100: {
                all_constituents: [
                    { ticker: "THIRD", rank: 3, momentum_score: 1.1, price: 10 },
                    { ticker: "FIRST", rank: 1, momentum_score: 2.0, price: 10 },
                    { ticker: "SECOND", rank: 2, momentum_score: 1.5, price: 10 },
                ],
            },
        },
        excluded: [],
    });

    assert.deepEqual(selectedConstituents(2).map(r => r.ticker), ["FIRST", "SECOND"]);
});

test("selectedConstituents returns [] when there is no GEM winner yet, or topN is 0", () => {
    _setState({ gemData: { winner: null }, universeData: {}, excluded: [] });
    assert.deepEqual(selectedConstituents(5), []);

    _setState({
        gemData: { winner: "NASDAQ100" },
        universeData: { NASDAQ100: { all_constituents: [{ ticker: "A", rank: 1, momentum_score: 1, price: 10 }] } },
        excluded: [],
    });
    assert.deepEqual(selectedConstituents(0), []);
});

test("selectedConstituents excludes manually-excluded tickers before applying topN, so TOP N fills from what remains", () => {
    _setState({
        gemData: { winner: "NASDAQ100" },
        universeData: {
            NASDAQ100: {
                all_constituents: [
                    { ticker: "EXCLUDED", rank: 1, momentum_score: 3, price: 10 },
                    { ticker: "AAA", rank: 2, momentum_score: 2, price: 10 },
                    { ticker: "NEXT", rank: 3, momentum_score: 1, price: 10 },
                ],
            },
        },
        excluded: ["EXCLUDED"],
    });

    assert.deepEqual(selectedConstituents(2).map(r => r.ticker), ["AAA", "NEXT"]);
});

test("selectedConstituents falls back to constituents when all_constituents is absent (equal-weight universe / stale cache)", () => {
    _setState({
        gemData: { winner: "WIG20" },
        universeData: { WIG20: { constituents: [{ ticker: "KGH", rank: 1, momentum_score: 1, price: 100 }] } },
        excluded: [],
    });

    assert.deepEqual(selectedConstituents(5).map(r => r.ticker), ["KGH"]);
});

test("computeTargets weights the TOP N selection by momentum_score (not weight_pct), normalized to totalCapital", () => {
    _setState({
        gemData: { winner: "NASDAQ100" },
        universeData: {
            NASDAQ100: {
                all_constituents: [
                    { ticker: "BIG", rank: 1, momentum_score: 3, price: 10, momentum_pct: 20, volatility_pct: 15 },
                    { ticker: "MID", rank: 2, momentum_score: 1, price: 10, momentum_pct: 10, volatility_pct: 10 },
                ],
            },
        },
        excluded: [],
    });

    const { targets } = computeTargets(2, 1000);
    // Suma surowych wag (momentum_score): 3+1=4 -> BIG 75%, MID 25%.
    assert.ok(Math.abs(targets.BIG.target_value - 750) < 1e-6);
    assert.ok(Math.abs(targets.MID.target_value - 250) < 1e-6);
    const total = Object.values(targets).reduce((s, t) => s + t.target_value, 0);
    assert.ok(Math.abs(total - 1000) < 1e-6);
});

test("computeTargets returns no targets when there is no GEM winner or totalCapital is 0", () => {
    _setState({ gemData: { winner: null }, universeData: {}, excluded: [] });
    assert.deepEqual(computeTargets(5, 1000).targets, {});

    _setState({
        gemData: { winner: "NASDAQ100" },
        universeData: { NASDAQ100: { all_constituents: [{ ticker: "A", rank: 1, momentum_score: 1, price: 10 }] } },
        excluded: [],
    });
    const { targets } = computeTargets(5, 0);
    assert.ok("A" in targets);
    assert.equal(targets.A.target_value, 0); // brak kapitalu -> target_value zostaje na 0
});

test("computeTargets works the same way for a GPW winner (WIG20/mWIG40)", () => {
    _setState({
        gemData: { winner: "WIG20" },
        universeData: {
            WIG20: {
                all_constituents: [
                    { ticker: "KGH", rank: 1, momentum_score: 1, price: 100, momentum_pct: 5, volatility_pct: 20 },
                    { ticker: "PKN", rank: 2, momentum_score: 1, price: 70, momentum_pct: 5, volatility_pct: 20 },
                ],
            },
        },
        excluded: [],
    });

    const { targets } = computeTargets(2, 2000);
    assert.deepEqual(Object.keys(targets).sort(), ["KGH", "PKN"]);
    assert.ok(Math.abs(targets.KGH.target_value - 1000) < 1e-6);
    assert.ok(Math.abs(targets.PKN.target_value - 1000) < 1e-6);
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

// applyManualGemOverrides: recznie wpisany (w widgecie GEM na rebalance.html,
// zapisany w localStorage TEJ przegladarki — patrz renderGemWidget/saveManualGemReturns
// w rebalance.js) zwrot 12M dla WIG20/mWIG40 podmienia return_pct w gemData.indices i
// przelicza winnera z nadpisanych wartosci — analogicznie do run_query.py::
// _load_gem_manual_returns po stronie backendu, tylko po stronie klienta (bez zapisu
// do repo/gem_manual_returns.json, bo strona jest statyczna).
test("applyManualGemOverrides leaves gemData.indices/winner unchanged when no manual override is stored", () => {
    saveManualGemReturns({});
    _setState({
        gemPristineIndices: [
            { universe: "NASDAQ100", return_pct: 30.0 },
            { universe: "WIG20", return_pct: 8.0 },
        ],
        gemData: { winner: null, indices: [] },
    });

    applyManualGemOverrides();

    // rebalance.js nie eksportuje bezposrednio zmiennej gemData do odczytu — sprawdzamy
    // wiec przez efekt uboczny, ktory JEST publiczny: moneyFmtFor czyta gemData.winner.
    assert.equal(moneyFmtFor(), fmtMoney); // NASDAQ100 (USD) zostaje zwyciezca, bez zmian
});

test("applyManualGemOverrides overrides return_pct for WIG20/mWIG40 and re-ranks the winner", () => {
    _setState({
        gemPristineIndices: [
            { universe: "NASDAQ100", return_pct: 30.0 },
            { universe: "WIG20", return_pct: 8.0 }, // syntetyczny, niedoszacowany zwrot
        ],
        gemData: { winner: null, indices: [] },
    });
    saveManualGemReturns({ WIG20: { return_pct: 44.84, as_of: "2026-08-31" } });

    applyManualGemOverrides();

    assert.equal(moneyFmtFor(), fmtMoneyPln); // WIG20 (recznie 44.84%) wygrywa nad NASDAQ100 (30%)

    saveManualGemReturns({});
});

test("applyManualGemOverrides ignores a stored override for a universe outside GEM_MANUAL_OVERRIDE_UNIVERSES", () => {
    _setState({
        gemPristineIndices: [
            { universe: "NASDAQ100", return_pct: 5.0 },
            { universe: "WIG20", return_pct: 8.0 },
        ],
        gemData: { winner: null, indices: [] },
    });
    // SP500 nie jest w GEM_MANUAL_OVERRIDE_UNIVERSES (tylko WIG20/MWIG40) -> ignorowane,
    // nawet gdyby jakims sposobem znalazlo sie w localStorage.
    saveManualGemReturns({ SP500: { return_pct: 999.0 } });

    applyManualGemOverrides();

    assert.equal(moneyFmtFor(), fmtMoneyPln); // WIG20 (8%, bez nadpisania) wygrywa nad NASDAQ100 (5%)

    saveManualGemReturns({});
});

test("loadManualGemReturns returns an empty object when nothing is stored, or after clearing", () => {
    saveManualGemReturns({ WIG20: { return_pct: 10 } });
    assert.deepEqual(loadManualGemReturns(), { WIG20: { return_pct: 10 } });

    saveManualGemReturns({});
    assert.deepEqual(loadManualGemReturns(), {});
});
