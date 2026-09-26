// Testy dla czystej logiki w docs/js/signals.js (screenery Wybicie/TTM
// Squeeze/Continuation/Qullamaggie — wydzielone z docs/js/app.js na osobną
// stronę "Sygnały", patrz CLAUDE.md; reszta pliku jest ściśle sprzężona z
// DOM/renderowaniem).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    weeksSinceZeroCrossUp, classifyWybicie, combinedWybicieCandidates, classifyTtmSqueeze, combinedTtmSqueezeCandidates, state,
    classifyContinuation, combinedContinuationCandidates,
    classifyQullamaggie, combinedQullamaggieCandidates,
} = require(path.join("..", "..", "docs", "js", "signals.js"));

// ---------- weeksSinceZeroCrossUp / classifyWybicie / combinedWybicieCandidates ----------

test("weeksSinceZeroCrossUp counts weeks since the series crossed zero upward", () => {
    assert.equal(weeksSinceZeroCrossUp([-2, -1, 0.5, 1]), 2);
    assert.equal(weeksSinceZeroCrossUp([-2, -1, 1]), 1);
});

test("weeksSinceZeroCrossUp returns null when the series is not above zero now", () => {
    assert.equal(weeksSinceZeroCrossUp([1, 2, -1]), null);
    assert.equal(weeksSinceZeroCrossUp([]), null);
});

test("weeksSinceZeroCrossUp looks through the whole series by default", () => {
    assert.equal(weeksSinceZeroCrossUp([-1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 9);
});

test("weeksSinceZeroCrossUp returns null when the cross is older than the lookback", () => {
    assert.equal(weeksSinceZeroCrossUp([-1, 1, 1, 1, 1], 3), null);
    assert.equal(weeksSinceZeroCrossUp([-1, 1, 1, 1], 3), 3);
});

test("weeksSinceZeroCrossUp skips trailing nulls (current week not closed yet)", () => {
    assert.equal(weeksSinceZeroCrossUp([-1, 2, null]), 1);
});

function wybicieConstituent(overrides) {
    return {
        sector: "Tech", price: 100, momentum_pct: 10,
        macd_chart: { macd: [-1, -0.5, 0.3, 0.8] },
        mansfield_chart: { rsm_long: [-3, -1, 2, 4] },
        ttm_squeeze_chart: { histogram: [-1, 0.5, 1, 2] },
        ...overrides,
    };
}

function noFilters() {
    return { macdCrossZero: false, macdCrossSignal: false, macdAboveZero: false, rsAboveZero: false };
}

test("classifyWybicie combined mode (default) accepts a fresh MACD + RS 52W zero cross with a positive TTM histogram", () => {
    const r = classifyWybicie("AAA", "SP500", wybicieConstituent({}));
    assert.ok(r);
    assert.equal(r.macdCrossWeeks, 2);
    assert.equal(r.rsCrossWeeks, 2);
    assert.equal(r.breakoutWeeks, 2);
    assert.equal(r.histNow, 2);
});

test("classifyWybicie combined mode rejects when the two crosses are further apart than the breakout window", () => {
    const c = wybicieConstituent({ macd_chart: { macd: [-1, 1, 1, 1, 1, 1] }, mansfield_chart: { rsm_long: [-1, -1, -1, -1, -1, 1] } });
    // MACD 5 tyg. temu, RS 1 tydz. temu -> odstęp 4
    assert.equal(classifyWybicie("AAA", "SP500", c, { combinedMode: true, windowWeeks: 3, monitorWeeks: 10 }), null);
    const r = classifyWybicie("AAA", "SP500", c, { combinedMode: true, windowWeeks: 4, monitorWeeks: 10 });
    assert.equal(r.breakoutWeeks, 1);
});

test("classifyWybicie combined mode drops a breakout older than the monitoring period", () => {
    const c = wybicieConstituent({ macd_chart: { macd: [-1, 1, 1, 1, 1] }, mansfield_chart: { rsm_long: [-1, 1, 1, 1, 1] } });
    // oba przecięcia 4 tyg. temu
    assert.equal(classifyWybicie("AAA", "SP500", c, { combinedMode: true, windowWeeks: 0, monitorWeeks: 3 }), null);
    assert.equal(classifyWybicie("AAA", "SP500", c, { combinedMode: true, windowWeeks: 0, monitorWeeks: 4 }).breakoutWeeks, 4);
});

test("classifyWybicie rejects when the TTM histogram is not positive", () => {
    const c = wybicieConstituent({ ttm_squeeze_chart: { histogram: [1, 1, 1, -0.1] } });
    assert.equal(classifyWybicie("AAA", "SP500", c), null);
});

test("classifyWybicie combined mode rejects when MACD never crossed zero in the data", () => {
    const c = wybicieConstituent({ macd_chart: { macd: [1, 1, 1, 1, 1, 1, 1, 1] } });
    assert.equal(classifyWybicie("AAA", "SP500", c), null);
});

test("classifyWybicie combined mode rejects when RS 52W is still below zero", () => {
    const c = wybicieConstituent({ mansfield_chart: { rsm_long: [-3, -2, -1, -0.5] } });
    assert.equal(classifyWybicie("AAA", "SP500", c), null);
});

test("classifyWybicie returns null when chart data is missing", () => {
    assert.equal(classifyWybicie("AAA", "SP500", { price: 1 }), null);
});

// ---------- checkboxy niezależne (combinedMode: false) — patrz nagłówek trybu nad classifyWybicie w signals.js ----------

test("classifyWybicie macdCrossZero filter accepts a fresh MACD cross even when RS 52W never crossed", () => {
    const c = wybicieConstituent({ mansfield_chart: { rsm_long: [-3, -2, -1, -0.5] } });
    assert.equal(classifyWybicie("AAA", "SP500", c), null); // domyślny tryb skojarzony nadal odrzuca
    const r = classifyWybicie("AAA", "SP500", c, {
        combinedMode: false, filters: { ...noFilters(), macdCrossZero: true }, monitorWeeks: 10,
    });
    assert.ok(r);
    assert.equal(r.breakoutWeeks, r.macdCrossWeeks);
    assert.equal(r.rsCrossWeeks, null);
    assert.equal(r.rsLongNow, -0.5);
});

test("classifyWybicie macdCrossZero filter ignores the breakout window entirely", () => {
    // MACD skrzyżował 5 tyg. temu, RS wcale — w trybie skojarzonym okno by to odrzuciło niezależnie od RS.
    const c = wybicieConstituent({ macd_chart: { macd: [-1, 1, 1, 1, 1, 1] }, mansfield_chart: { rsm_long: [-1, -1, -1, -1, -1, -1] } });
    const r = classifyWybicie("AAA", "SP500", c, {
        combinedMode: false, filters: { ...noFilters(), macdCrossZero: true }, windowWeeks: 0, monitorWeeks: 10,
    });
    assert.ok(r);
    assert.equal(r.breakoutWeeks, 5);
});

test("classifyWybicie macdCrossZero filter still requires a positive TTM histogram", () => {
    const c = wybicieConstituent({ ttm_squeeze_chart: { histogram: [1, 1, 1, -0.1] } });
    assert.equal(classifyWybicie("AAA", "SP500", c, { combinedMode: false, filters: { ...noFilters(), macdCrossZero: true } }), null);
});

test("classifyWybicie macdCrossZero filter still requires a fresh MACD cross", () => {
    const c = wybicieConstituent({ macd_chart: { macd: [1, 1, 1, 1, 1, 1, 1, 1] } });
    assert.equal(classifyWybicie("AAA", "SP500", c, { combinedMode: false, filters: { ...noFilters(), macdCrossZero: true } }), null);
});

test("classifyWybicie with only macdCrossZero tolerates missing RS 52W data entirely", () => {
    const c = wybicieConstituent({ mansfield_chart: null });
    const r = classifyWybicie("AAA", "SP500", c, {
        combinedMode: false, filters: { ...noFilters(), macdCrossZero: true }, monitorWeeks: 10,
    });
    assert.ok(r);
    assert.equal(r.rsLongNow, null);
    assert.equal(r.rsCrossWeeks, null);
    assert.deepEqual(r.mini_rs, []);
});

test("classifyWybicie macdAboveZero filter is a pure level check, no cross/age required", () => {
    // MACD nad zerem od zawsze w tym oknie (brak przecięcia) — macdCrossWeeks: null.
    const c = wybicieConstituent({ macd_chart: { macd: [1, 1, 1, 1] } });
    const r = classifyWybicie("AAA", "SP500", c, { combinedMode: false, filters: { ...noFilters(), macdAboveZero: true } });
    assert.ok(r);
    assert.equal(r.macdCrossWeeks, null);
    assert.equal(r.breakoutWeeks, null);
});

test("classifyWybicie macdAboveZero filter rejects when MACD is currently negative", () => {
    const c = wybicieConstituent({ macd_chart: { macd: [1, 1, 1, -0.1] } });
    assert.equal(classifyWybicie("AAA", "SP500", c, { combinedMode: false, filters: { ...noFilters(), macdAboveZero: true } }), null);
});

test("classifyWybicie rsAboveZero filter is a pure level check, no cross/age required", () => {
    const c = wybicieConstituent({ mansfield_chart: { rsm_long: [1, 1, 1, 1] } });
    const r = classifyWybicie("AAA", "SP500", c, { combinedMode: false, filters: { ...noFilters(), rsAboveZero: true } });
    assert.ok(r);
    assert.equal(r.rsCrossWeeks, null);
    assert.equal(r.breakoutWeeks, null);
});

test("classifyWybicie rsAboveZero filter rejects when RS 52W is currently negative", () => {
    const c = wybicieConstituent({ mansfield_chart: { rsm_long: [1, 1, 1, -0.1] } });
    assert.equal(classifyWybicie("AAA", "SP500", c, { combinedMode: false, filters: { ...noFilters(), rsAboveZero: true } }), null);
});

test("classifyWybicie macdCrossSignal filter accepts a bullish MACD/signal cross while MACD is above zero", () => {
    // MACD ujemne aż do tygodnia 2, potem dodatnie i przecina sygnałową w górę w tygodniu 3.
    const c = wybicieConstituent({
        macd_chart: { macd: [-1, -0.5, 0.5, 1], signal: [-0.8, -0.3, 0.6, 0.4] },
    });
    const r = classifyWybicie("AAA", "SP500", c, { combinedMode: false, filters: { ...noFilters(), macdCrossSignal: true } });
    assert.ok(r);
    assert.equal(r.macdSignalCrossWeeks, 1);
    assert.equal(r.breakoutWeeks, 1);
});

test("classifyWybicie macdCrossSignal filter rejects a bullish cross that happens below zero", () => {
    // MACD przecina sygnałową w górę, ale samo MACD jest wciąż ujemne ("zwykłe odbicie z dołka").
    const c = wybicieConstituent({
        macd_chart: { macd: [-2, -1.5, -0.5, -0.2], signal: [-1, -1.2, -0.8, -0.6] },
    });
    assert.equal(classifyWybicie("AAA", "SP500", c, { combinedMode: false, filters: { ...noFilters(), macdCrossSignal: true } }), null);
});

test("classifyWybicie macdCrossSignal filter rejects when there was no crossover", () => {
    const c = wybicieConstituent({ macd_chart: { macd: [1, 1, 1, 1], signal: [1.5, 1.5, 1.5, 1.5] } });
    assert.equal(classifyWybicie("AAA", "SP500", c, { combinedMode: false, filters: { ...noFilters(), macdCrossSignal: true } }), null);
});

test("classifyWybicie combines several independent filters with AND", () => {
    const c = wybicieConstituent({
        macd_chart: { macd: [-1, -0.5, 0.3, 0.8], signal: [-0.9, -0.6, 0.1, 0.2] },
        mansfield_chart: { rsm_long: [-3, -1, 2, 4] },
    });
    const filters = { macdCrossZero: true, macdCrossSignal: false, macdAboveZero: false, rsAboveZero: true };
    const r = classifyWybicie("AAA", "SP500", c, { combinedMode: false, filters, monitorWeeks: 10 });
    assert.ok(r);
    // breakoutWeeks bierze wiek jedynego aktywnego warunku-zdarzenia (macdCrossZero).
    assert.equal(r.breakoutWeeks, r.macdCrossWeeks);
});

test("classifyWybicie combined filters reject when any one of them fails", () => {
    const c = wybicieConstituent({ mansfield_chart: { rsm_long: [-3, -2, -1, -0.5] } }); // RS wciąż ujemne
    const filters = { macdCrossZero: true, macdCrossSignal: false, macdAboveZero: false, rsAboveZero: true };
    assert.equal(classifyWybicie("AAA", "SP500", c, { combinedMode: false, filters, monitorWeeks: 10 }), null);
});

function emptyStateData() {
    return {
        SP500: { constituents: [] }, NASDAQ100: { constituents: [] }, DOWJONES: { constituents: [] },
        WIG20: { constituents: [] }, MWIG40: { constituents: [] }, SWIG80: { constituents: [] },
    };
}

test("combinedWybicieCandidates merges universes, dedupes tickers, and sorts freshest cross first", () => {
    state.data = emptyStateData();
    state.data.SP500.constituents = [
        wybicieConstituent({ ticker: "OLDER" }),
        wybicieConstituent({ ticker: "DUP" }),
        wybicieConstituent({ ticker: "NOPE", ttm_squeeze_chart: { histogram: [-1] } }),
    ];
    state.data.NASDAQ100.constituents = [wybicieConstituent({ ticker: "DUP" })];
    state.data.WIG20.constituents = [
        wybicieConstituent({ ticker: "FRESH", macd_chart: { macd: [-1, 1] }, mansfield_chart: { rsm_long: [-1, 1] } }),
    ];
    const rows = combinedWybicieCandidates();
    assert.deepEqual(rows.map(r => r.ticker), ["FRESH", "OLDER", "DUP"]);
    assert.equal(rows.find(r => r.ticker === "DUP").universe, "SP500");
});

// ---------- classifyTtmSqueeze / combinedTtmSqueezeCandidates (TTM Squeeze screener) ----------

function ttmSqueezeConstituent(overrides) {
    return {
        sector: "Tech", price: 100, momentum_score: 1.5, momentum_pct: 20,
        ttm_squeeze_chart: { dates: [], histogram: [], squeeze_on: [], squeeze_count: [], fired: [], weeks_since_fire: [], fire_consolidation_weeks: [] },
        ...overrides,
    };
}

test("classifyTtmSqueeze returns null when the ticker has no ttm_squeeze_chart", () => {
    assert.equal(classifyTtmSqueeze("AAA", "NASDAQ100", { momentum_score: 1 }), null);
});

test("classifyTtmSqueeze returns null when momentum_score is not positive", () => {
    const c = ttmSqueezeConstituent({
        momentum_score: -0.5,
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [1], squeeze_on: [true], squeeze_count: [6],
            fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
        },
    });
    assert.equal(classifyTtmSqueeze("AAA", "NASDAQ100", c), null);
});

test("classifyTtmSqueeze marks a ticker consolidating when squeeze is on for more than 5 weeks", () => {
    const c = ttmSqueezeConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [0.2], squeeze_on: [true], squeeze_count: [7],
            fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
        },
    });
    const r = classifyTtmSqueeze("AAA", "NASDAQ100", c);
    assert.equal(r.status, "consolidating");
    assert.equal(r.consolidation_weeks, 7);
    assert.equal(r.weeks_since_fire, null);
});

test("classifyTtmSqueeze does not flag a squeeze that has lasted 5 weeks or fewer", () => {
    const c = ttmSqueezeConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [0.2], squeeze_on: [true], squeeze_count: [5],
            fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
        },
    });
    assert.equal(classifyTtmSqueeze("AAA", "NASDAQ100", c), null);
});

test("classifyTtmSqueeze marks a ticker fired when it broke out of a long squeeze within the lookback window", () => {
    const c = ttmSqueezeConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [3.5], squeeze_on: [false], squeeze_count: [0],
            fired: [false], weeks_since_fire: [2], fire_consolidation_weeks: [9],
        },
    });
    const r = classifyTtmSqueeze("AAA", "NASDAQ100", c);
    assert.equal(r.status, "fired");
    assert.equal(r.consolidation_weeks, 9);
    assert.equal(r.weeks_since_fire, 2);
});

test("classifyTtmSqueeze ignores a fire with a negative (bearish) histogram", () => {
    const c = ttmSqueezeConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [-3.5], squeeze_on: [false], squeeze_count: [0],
            fired: [false], weeks_since_fire: [2], fire_consolidation_weeks: [9],
        },
    });
    assert.equal(classifyTtmSqueeze("AAA", "NASDAQ100", c), null);
});

test("classifyTtmSqueeze ignores a fire that is too old (outside the lookback window)", () => {
    const c = ttmSqueezeConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [3.5], squeeze_on: [false], squeeze_count: [0],
            fired: [false], weeks_since_fire: [10], fire_consolidation_weeks: [9],
        },
    });
    assert.equal(classifyTtmSqueeze("AAA", "NASDAQ100", c), null);
});

test("classifyTtmSqueeze ignores a fire that followed too short a consolidation", () => {
    const c = ttmSqueezeConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [3.5], squeeze_on: [false], squeeze_count: [0],
            fired: [false], weeks_since_fire: [1], fire_consolidation_weeks: [3],
        },
    });
    assert.equal(classifyTtmSqueeze("AAA", "NASDAQ100", c), null);
});

test("classifyTtmSqueeze falls back to the latest week that actually has squeeze_on when the newest week is still null", () => {
    const c = ttmSqueezeConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01", "2026-01-08"], histogram: [0.2, null], squeeze_on: [true, null],
            squeeze_count: [7, null], fired: [false, null], weeks_since_fire: [null, null],
            fire_consolidation_weeks: [null, null],
        },
    });
    const r = classifyTtmSqueeze("AAA", "NASDAQ100", c);
    assert.equal(r.status, "consolidating");
    assert.equal(r.consolidation_weeks, 7);
});

test("combinedTtmSqueezeCandidates merges candidates across universes, fired first (most recent), then longest consolidations", () => {
    state.data = emptyStateData();
    state.data.NASDAQ100.constituents = [
        ttmSqueezeConstituent({
            ticker: "FIRED_OLD",
            ttm_squeeze_chart: {
                dates: ["2026-01-01"], histogram: [1], squeeze_on: [false], squeeze_count: [0],
                fired: [false], weeks_since_fire: [3], fire_consolidation_weeks: [8],
            },
        }),
        ttmSqueezeConstituent({
            ticker: "COIL_SHORT",
            ttm_squeeze_chart: {
                dates: ["2026-01-01"], histogram: [0.1], squeeze_on: [true], squeeze_count: [6],
                fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
            },
        }),
    ];
    state.data.WIG20.constituents = [
        ttmSqueezeConstituent({
            ticker: "FIRED_FRESH",
            ttm_squeeze_chart: {
                dates: ["2026-01-01"], histogram: [2], squeeze_on: [false], squeeze_count: [0],
                fired: [false], weeks_since_fire: [0], fire_consolidation_weeks: [12],
            },
        }),
        ttmSqueezeConstituent({
            ticker: "COIL_LONG",
            ttm_squeeze_chart: {
                dates: ["2026-01-01"], histogram: [0.1], squeeze_on: [true], squeeze_count: [10],
                fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
            },
        }),
    ];

    const rows = combinedTtmSqueezeCandidates();
    assert.deepEqual(rows.map(r => r.ticker), ["FIRED_FRESH", "FIRED_OLD", "COIL_LONG", "COIL_SHORT"]);
});

// ---------- classifyQullamaggie / combinedQullamaggieCandidates (replika skanu Qullamaggie) ----------

const QM_OPTS = { minPerfPct: 30, minConsolidationWeeks: 4, maxConsolidationWeeks: 6, fireLookbackWeeks: 3 };

// Zwroty 1M/3M/6M są teraz czytane z weekly_chart.close_pct (weeksAgoReturnPct(),
// js/minicharts.js), nie z usuniętego daily_squeeze — patrz komentarz przy
// classifyQullamaggie w signals.js. qmPastPct() odtwarza dokładnie taki % "N
// tygodni temu", jaki dałby żądany zwrot względem OSTATNIEJ wartości w
// tablicy — niezależnie od tego, czym ta ostatnia wartość akurat jest (może
// być ustawiona przez test na potrzeby squeezeConsolidationBox).
function qmPastPct(lastPct, returnPct) {
    return 100 * ((1 + lastPct / 100) / (1 + returnPct / 100) - 1);
}

const QM_PAD_WEEKS = 30;

function qmPadDates(realDates) {
    return Array.from({ length: QM_PAD_WEEKS }, (_, i) => `__pad_${i}__`).concat(realDates);
}

// Tablica close_pct dlugości >= 27 (PAD placeholderów z przodu + `tail` na
// końcu, dokładnie taki, jaki test faktycznie chce) tak, żeby
// weeksAgoReturnPct(c, 4/13/26) odtworzył podane zwroty 1/3/6M. `rXm: null`
// pomija dany zwrot (placeholder 0 w tej pozycji — realny "brak danych"
// (null) wymaga osobnej, jawnie SKRÓCONEJ tablicy, patrz dedykowany test).
function qmClosePct({ r1m = 10, r3m = 45, r6m = 60 } = {}, tail = [0]) {
    const full = new Array(QM_PAD_WEEKS).fill(0).concat(tail);
    const last = full.length - 1;
    const lastPct = full[last];
    if (r1m != null) full[last - 4] = qmPastPct(lastPct, r1m);
    if (r3m != null) full[last - 13] = qmPastPct(lastPct, r3m);
    if (r6m != null) full[last - 26] = qmPastPct(lastPct, r6m);
    return full;
}

// weekly_chart z realnymi datami (do wyszukiwania buying_volume_ratio po
// dacie wybicia) plus paddingiem, żeby weeksAgoReturnPct miał czego szukać.
function qmWeeklyChart(realDates, { buyingVolumeRatio, closeTail, returns } = {}) {
    return {
        current_stage: "2A",
        dates: qmPadDates(realDates),
        buying_volume_ratio: new Array(QM_PAD_WEEKS).fill(null).concat(buyingVolumeRatio || realDates.map(() => null)),
        close_pct: qmClosePct(returns || {}, closeTail || realDates.map(() => 0)),
    };
}

function qmConstituent(overrides = {}, returns = {}) {
    return {
        sector: "Tech", price: 100,
        weekly_chart: qmWeeklyChart(["2026-01-01"], { buyingVolumeRatio: [2.0], returns }),
        ttm_squeeze_chart: { dates: [], histogram: [], squeeze_on: [], squeeze_count: [], fired: [], weeks_since_fire: [], fire_consolidation_weeks: [] },
        ...overrides,
    };
}

test("classifyQullamaggie returns null without enough weekly price history for a 6-month return", () => {
    const c = qmConstituent({ weekly_chart: { current_stage: "2A", dates: ["2026-01-01"], close_pct: [0] } });
    assert.equal(classifyQullamaggie("AAA", "SP500", c, QM_OPTS), null);
});

test("classifyQullamaggie returns null when the 6-month return doesn't clear the performance threshold", () => {
    const c = qmConstituent({}, { r1m: 5, r3m: 10, r6m: 20 });
    assert.equal(classifyQullamaggie("AAA", "SP500", c, QM_OPTS), null);
});

// Uproszczone na wyraźną prośbę użytkownika: perf_pct = return_6m_pct WYŁĄCZNIE
// (nie max(1M, 3M, 6M) — patrz komentarz przy classifyQullamaggie w signals.js).
// Duży ruch widoczny TYLKO w 1M/3M (a nie w 6M) już NIE kwalifikuje — odwrotnie
// niż w poprzedniej wersji z warunkiem OR.
test("classifyQullamaggie no longer qualifies on a big 1M/3M move alone when the 6-month return is below the threshold", () => {
    const c = qmConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [0.2], squeeze_on: [true], squeeze_count: [5],
            fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
        },
    }, { r1m: 50, r3m: 45, r6m: 20 });
    assert.equal(classifyQullamaggie("AAA", "SP500", c, QM_OPTS), null);
});

test("classifyQullamaggie qualifies on the 6-month return alone, even when 1M/3M are negative", () => {
    const c = qmConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [0.2], squeeze_on: [true], squeeze_count: [5],
            fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
        },
    }, { r1m: -5, r3m: -2, r6m: 35 });
    const r = classifyQullamaggie("AAA", "SP500", c, QM_OPTS);
    assert.ok(r);
    assert.ok(Math.abs(r.perf_pct - 35) < 0.01);
});

test("classifyQullamaggie marks consolidating when the weekly squeeze is inside the min/max week window", () => {
    const c = qmConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [0.2], squeeze_on: [true], squeeze_count: [5],
            fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
        },
    });
    const r = classifyQullamaggie("AAA", "SP500", c, QM_OPTS);
    assert.equal(r.status, "consolidating");
    assert.equal(r.consolidation_weeks, 5);
});

test("classifyQullamaggie ignores a squeeze shorter than the minimum consolidation window", () => {
    const c = qmConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [0.2], squeeze_on: [true], squeeze_count: [2],
            fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
        },
    });
    assert.equal(classifyQullamaggie("AAA", "SP500", c, QM_OPTS), null);
});

test("classifyQullamaggie ignores a squeeze longer than the maximum consolidation window", () => {
    const c = qmConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [0.2], squeeze_on: [true], squeeze_count: [9],
            fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
        },
    });
    assert.equal(classifyQullamaggie("AAA", "SP500", c, QM_OPTS), null);
});

test("classifyQullamaggie marks fired and confirms buying volume at the breakout week", () => {
    const realDates = ["2025-12-11", "2025-12-18", "2026-01-01"];
    const c = qmConstituent({
        weekly_chart: qmWeeklyChart(realDates, { buyingVolumeRatio: [1.0, 1.8, 1.1] }),
        ttm_squeeze_chart: {
            dates: realDates,
            histogram: [0.1, 0.2, 3.5], squeeze_on: [true, false, false], squeeze_count: [5, 0, 0],
            fired: [false, true, false], weeks_since_fire: [null, 0, 1], fire_consolidation_weeks: [null, 5, 5],
        },
    });
    const r = classifyQullamaggie("AAA", "SP500", c, QM_OPTS);
    assert.equal(r.status, "fired");
    assert.equal(r.weeks_since_fire, 1);
    assert.equal(r.consolidation_weeks, 5);
    // Wybicie nastąpiło w tygodniu 2025-12-18 (buying_volume_ratio 1.8 >= STAGE_BREAKOUT_VOLUME_RATIO 1.5x).
    assert.equal(r.breakout_volume_ratio, 1.8);
    assert.equal(r.breakout_volume_confirmed, true);
});

test("classifyQullamaggie flags an unconfirmed breakout when buying volume is below the ratio threshold", () => {
    const realDates = ["2025-12-18", "2026-01-01"];
    const c = qmConstituent({
        weekly_chart: qmWeeklyChart(realDates, { buyingVolumeRatio: [0.9, 1.1] }),
        ttm_squeeze_chart: {
            dates: realDates,
            histogram: [0.2, 3.5], squeeze_on: [false, false], squeeze_count: [0, 0],
            fired: [true, false], weeks_since_fire: [0, 1], fire_consolidation_weeks: [5, 5],
        },
    });
    const r = classifyQullamaggie("AAA", "SP500", c, QM_OPTS);
    assert.equal(r.status, "fired");
    assert.equal(r.breakout_volume_ratio, 0.9);
    assert.equal(r.breakout_volume_confirmed, false);
});

test("classifyQullamaggie ignores a fire with a bearish (negative) histogram", () => {
    const c = qmConstituent({
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [-3.5], squeeze_on: [false], squeeze_count: [0],
            fired: [false], weeks_since_fire: [1], fire_consolidation_weeks: [5],
        },
    });
    assert.equal(classifyQullamaggie("AAA", "SP500", c, QM_OPTS), null);
});

// ---------- potwierdzenie zakresem ceny dla bardzo krótkiej (1-2 tyg.) konsolidacji ----------
// (QM_TIGHT_RANGE_MAX_WEEKS/MIN_PCT/MAX_PCT w signals.js) — na wyraźną prośbę
// użytkownika po przeglądzie ze slajdem "The Breakout": sama długość squeeze'a
// 1-2 tyg. to za mało potwierdzenia, więc dla niej dodatkowo wymagamy, żeby
// szczyt/dołek konsolidacji (squeezeConsolidationBox, close-owy — jak reszta
// modułu) dały zakres 5-20%.
const QM_OPTS_WIDE = { minPerfPct: 30, minConsolidationWeeks: 2, maxConsolidationWeeks: 8, fireLookbackWeeks: 3 };

function qmShortSqueezeConstituent(closePctWindow) {
    const dates = ["2025-12-25", "2026-01-01"];
    return qmConstituent({
        weekly_chart: qmWeeklyChart(dates, { closeTail: closePctWindow }),
        ttm_squeeze_chart: {
            dates, histogram: [0.1, 0.1], squeeze_on: [true, true], squeeze_count: [1, 2],
            fired: [false, false], weeks_since_fire: [null, null], fire_consolidation_weeks: [null, null],
        },
    });
}

test("classifyQullamaggie accepts a 2-week squeeze when the price range is inside 5-20%", () => {
    // close0 = 100 / 1.10 ≈ 90.91 -> support ≈ 90.91, resistance = 100 -> range ≈ 10%.
    const c = qmShortSqueezeConstituent([0, 10]);
    const r = classifyQullamaggie("AAA", "SP500", c, QM_OPTS_WIDE);
    assert.ok(r);
    assert.equal(r.consolidation_weeks, 2);
});

test("classifyQullamaggie rejects a 2-week squeeze when the price range is too wide (> 20%)", () => {
    // close0 = 100 / 1.30 ≈ 76.92 -> range ≈ 30%.
    const c = qmShortSqueezeConstituent([0, 30]);
    assert.equal(classifyQullamaggie("AAA", "SP500", c, QM_OPTS_WIDE), null);
});

test("classifyQullamaggie rejects a 2-week squeeze when the price range is too tight (< 5%)", () => {
    // close0 = 100 / 1.03 ≈ 97.09 -> range ≈ 3%.
    const c = qmShortSqueezeConstituent([0, 3]);
    assert.equal(classifyQullamaggie("AAA", "SP500", c, QM_OPTS_WIDE), null);
});

test("classifyQullamaggie does not require the price-range check once the squeeze is longer than 2 weeks", () => {
    const c = qmConstituent({
        weekly_chart: qmWeeklyChart(["2026-01-01"], { closeTail: [30] }),
        ttm_squeeze_chart: {
            dates: ["2026-01-01"], histogram: [0.1], squeeze_on: [true], squeeze_count: [3],
            fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
        },
    });
    const r = classifyQullamaggie("AAA", "SP500", c, QM_OPTS_WIDE);
    assert.ok(r);
    assert.equal(r.consolidation_weeks, 3);
});

test("combinedQullamaggieCandidates merges universes, dedupes tickers, sorts fired-fresh first then longest consolidation", () => {
    state.data = emptyStateData();
    state.data.SP500.constituents = [
        qmConstituent({
            ticker: "FIRED_OLD",
            ttm_squeeze_chart: {
                dates: ["2026-01-01"], histogram: [1], squeeze_on: [false], squeeze_count: [0],
                fired: [false], weeks_since_fire: [3], fire_consolidation_weeks: [5],
            },
        }),
        qmConstituent({
            ticker: "COIL_SHORT",
            ttm_squeeze_chart: {
                dates: ["2026-01-01"], histogram: [0.1], squeeze_on: [true], squeeze_count: [4],
                fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
            },
        }),
    ];
    state.data.WIG20.constituents = [
        qmConstituent({
            ticker: "FIRED_FRESH",
            ttm_squeeze_chart: {
                dates: ["2026-01-01"], histogram: [2], squeeze_on: [false], squeeze_count: [0],
                fired: [false], weeks_since_fire: [0], fire_consolidation_weeks: [6],
            },
        }),
        qmConstituent({
            ticker: "COIL_LONG",
            ttm_squeeze_chart: {
                dates: ["2026-01-01"], histogram: [0.1], squeeze_on: [true], squeeze_count: [6],
                fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
            },
        }),
    ];

    const rows = combinedQullamaggieCandidates(QM_OPTS);
    assert.deepEqual(rows.map(r => r.ticker), ["FIRED_FRESH", "FIRED_OLD", "COIL_LONG", "COIL_SHORT"]);
});

// ---------- classifyContinuation / combinedContinuationCandidates (przeprojektowany na tygodniowy) ----------

function continuationConstituent(overrides = {}, squeezeOverrides = {}) {
    const dates = ["2026-01-01"];
    return {
        sector: "Tech", price: 100, momentum_pct: 40,
        weekly_chart: { current_stage: "2B", dates, close_pct: [10] },
        mansfield_chart: { rsm_long: [1, 2, 3] },
        ttm_squeeze_chart: {
            dates, histogram: [0.2], squeeze_on: [true], squeeze_count: [8],
            fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
            ...squeezeOverrides,
        },
        ...overrides,
    };
}

const CONT_OPTS = { minConsolidationWeeks: 6, fireLookbackWeeks: 3, minMomentumPct: 20 };

test("classifyContinuation accepts a Stage 2 stock in a weekly squeeze inside the min/max window", () => {
    const r = classifyContinuation("AAA", "SP500", continuationConstituent(), CONT_OPTS);
    assert.ok(r);
    assert.equal(r.status, "squeeze");
    assert.equal(r.consolidation_weeks, 8);
    assert.equal(r.rs_long, 3, "gate reads RS 52W (rsm_long)");
    assert.equal(r.macd_confirmed, null, "no MACD confirmation while still consolidating");
});

test("classifyContinuation accepts a fresh upward fire out of a weekly squeeze, with MACD confirmation", () => {
    const dates = ["2025-11-30", "2025-12-07", "2025-12-14", "2025-12-21"];
    // close_pct: 6 -> 15 na tygodniu wybicia = ok. +8.5% (w [5,20]) i za mało
    // historii (4 tyg.) na sprawdzenie 10-tyg. szczytu, więc ten_week_high
    // zostaje null (nie odrzuca) — patrz dedykowane testy poniżej dla obu progów.
    const c = continuationConstituent({
        weekly_chart: { current_stage: "2B", dates, close_pct: [0, 3, 6, 15] },
        macd_chart: { dates, macd: [-0.1, 0.2, 0.5, 0.8], signal: [0.0, 0.1, 0.3, 0.5] },
    }, {
        dates, histogram: [0.1, 0.2, 0.3, 0.8], squeeze_on: [true, true, true, false],
        squeeze_count: [6, 7, 8, 0], fired: [false, false, false, true],
        weeks_since_fire: [null, null, null, 0], fire_consolidation_weeks: [null, null, null, 8],
    });
    const r = classifyContinuation("AAA", "SP500", c, CONT_OPTS);
    assert.ok(r);
    assert.equal(r.status, "fired");
    assert.equal(r.weeks_since_fire, 0);
    assert.equal(r.consolidation_weeks, 8);
    assert.equal(r.macd_confirmed, true, "MACD (0.8) > signal (0.5) at the fire week");
    assert.equal(r.ten_week_high, null, "too little history to verify -> not rejected");
    assert.ok(Math.abs(r.breakout_gain_pct - 8.49) < 0.01);
});

// ---------- dwa TWARDE kryteria świecy wybicia z materiału referencyjnego ----------
// (CONTINUATION_TEN_WEEK_HIGH_WEEKS/MIN_BREAKOUT_GAIN_PCT/MAX_BREAKOUT_GAIN_PCT) —
// odrzucają wiersz TYLKO gdy realnie zmierzone i naruszone (== false / poza
// zakresem), nigdy z powodu braku historii (null przepuszcza, jak zawsze w tym module).
function continuationFireDates(n) {
    return Array.from({ length: n }, (_, i) => `2025-${String(10 + Math.floor(i / 4)).padStart(2, "0")}-${String((i % 4) * 7 + 1).padStart(2, "0")}`);
}

test("classifyContinuation rejects a fire whose close is not a 10-week high", () => {
    const dates = continuationFireDates(11);
    // 10 tygodni płasko na 20, potem "wybicie" na 15 — NIE jest nowym szczytem.
    const closePct = new Array(10).fill(20).concat([15]);
    const squeezeCount = new Array(10).fill(6).concat([0]);
    const c = continuationConstituent({
        weekly_chart: { current_stage: "2B", dates, close_pct: closePct },
    }, {
        dates, histogram: new Array(10).fill(0.1).concat([0.5]),
        squeeze_on: new Array(10).fill(true).concat([false]),
        squeeze_count: squeezeCount,
        fired: new Array(10).fill(false).concat([true]),
        weeks_since_fire: new Array(10).fill(null).concat([0]),
        fire_consolidation_weeks: new Array(10).fill(null).concat([6]),
    });
    assert.equal(classifyContinuation("AAA", "SP500", c, CONT_OPTS), null);
});

test("classifyContinuation accepts a fire that IS a genuine 10-week high", () => {
    const dates = continuationFireDates(11);
    const closePct = new Array(10).fill(0).concat([9]); // +9% na wybiciu, ponad 10-tyg. plateau na 0
    const c = continuationConstituent({
        weekly_chart: { current_stage: "2B", dates, close_pct: closePct },
    }, {
        dates, histogram: new Array(10).fill(0.1).concat([0.5]),
        squeeze_on: new Array(10).fill(true).concat([false]),
        squeeze_count: new Array(10).fill(6).concat([0]),
        fired: new Array(10).fill(false).concat([true]),
        weeks_since_fire: new Array(10).fill(null).concat([0]),
        fire_consolidation_weeks: new Array(10).fill(null).concat([6]),
    });
    const r = classifyContinuation("AAA", "SP500", c, CONT_OPTS);
    assert.ok(r);
    assert.equal(r.ten_week_high, true);
    assert.ok(Math.abs(r.breakout_gain_pct - 9) < 0.01);
});

test("classifyContinuation rejects a breakout week gain outside 5-20%", () => {
    const tooSmall = continuationConstituent({
        weekly_chart: { current_stage: "2B", dates: ["2026-01-01", "2026-01-08"], close_pct: [0, 2] },
    }, {
        dates: ["2026-01-01", "2026-01-08"], histogram: [0.1, 0.5], squeeze_on: [true, false],
        squeeze_count: [6, 0], fired: [false, true], weeks_since_fire: [null, 0], fire_consolidation_weeks: [null, 6],
    });
    assert.equal(classifyContinuation("AAA", "SP500", tooSmall, CONT_OPTS), null, "2% gain is below the 5% floor");

    const tooBig = continuationConstituent({
        weekly_chart: { current_stage: "2B", dates: ["2026-01-01", "2026-01-08"], close_pct: [0, 30] },
    }, {
        dates: ["2026-01-01", "2026-01-08"], histogram: [0.1, 0.5], squeeze_on: [true, false],
        squeeze_count: [6, 0], fired: [false, true], weeks_since_fire: [null, 0], fire_consolidation_weeks: [null, 6],
    });
    assert.equal(classifyContinuation("AAA", "SP500", tooBig, CONT_OPTS), null, "30% gain is above the 20% ceiling");
});

test("classifyContinuation flags macd_confirmed=false when MACD is below its signal at the fire week", () => {
    const dates = ["2025-12-21"];
    const c = continuationConstituent({
        macd_chart: { dates, macd: [0.1], signal: [0.5] },
    }, {
        dates, histogram: [0.8], squeeze_on: [false], squeeze_count: [0], fired: [true],
        weeks_since_fire: [0], fire_consolidation_weeks: [8],
    });
    const r = classifyContinuation("AAA", "SP500", c, CONT_OPTS);
    assert.equal(r.macd_confirmed, false);
});

test("classifyContinuation rejects a fire with a negative histogram (breakdown)", () => {
    assert.equal(classifyContinuation("AAA", "SP500", continuationConstituent({}, {
        squeeze_on: [false], squeeze_count: [0], fired: [true],
        weeks_since_fire: [1], fire_consolidation_weeks: [8], histogram: [-0.5],
    }), CONT_OPTS), null);
});

test("classifyContinuation rejects a consolidation shorter than the minimum, but accepts one longer with no upper bound", () => {
    assert.equal(classifyContinuation("AAA", "SP500", continuationConstituent({}, { squeeze_count: [3] }), CONT_OPTS), null);
    assert.ok(classifyContinuation("AAA", "SP500", continuationConstituent({}, { squeeze_count: [40] }), CONT_OPTS),
        "no max consolidation weeks any more — a very long, still-valid base must not be rejected");
});

test("classifyContinuation requires Stage 2, positive momentum and RS 52W > 0", () => {
    const opts = CONT_OPTS;
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ weekly_chart: { current_stage: "1", dates: ["2026-01-01"], close_pct: [10] } }), opts), null);
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ momentum_pct: 10 }), opts), null);
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ mansfield_chart: { rsm_long: [1, -0.5] } }), opts), null);
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ momentum_pct: -1 }), { ...opts, minMomentumPct: 0 }), null);
    assert.ok(classifyContinuation("A", "SP500", continuationConstituent({ momentum_pct: 1 }), { ...opts, minMomentumPct: 0 }));
});

test("combinedContinuationCandidates dedupes tickers and puts fresh fires first", () => {
    const saved = state.data;
    state.data = {
        SP500: { all_constituents: [
            { ticker: "SQZ", ...continuationConstituent() },
            { ticker: "FIRE", ...continuationConstituent({}, {
                squeeze_on: [false], squeeze_count: [0], fired: [true],
                weeks_since_fire: [1], fire_consolidation_weeks: [8],
            }) },
        ] },
        NASDAQ100: { all_constituents: [{ ticker: "SQZ", ...continuationConstituent() }] },
    };
    try {
        const rows = combinedContinuationCandidates(CONT_OPTS);
        assert.deepEqual(rows.map(r => r.ticker), ["FIRE", "SQZ"]);
        assert.equal(rows[1].universe, "SP500");
    } finally {
        state.data = saved;
    }
});
