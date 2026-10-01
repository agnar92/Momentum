// Testy dla czystej logiki w docs/js/signals.js (screenery Wybicie/TTM
// Squeeze/Continuation/Qullamaggie — wydzielone z docs/js/app.js na osobną
// stronę "Sygnały", patrz CLAUDE.md; reszta pliku jest ściśle sprzężona z
// DOM/renderowaniem).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    weeksSinceZeroCrossUp, classifyWybicie, combinedWybicieCandidates, combinedTopGainersCandidates, classifyTtmSqueeze, combinedTtmSqueezeCandidates, state,
    classifyContinuation, combinedContinuationCandidates, continuationTrendGate, sectorRsInfo,
    classifyBreakout, combinedBreakoutCandidates, breakoutKellyFraction, breakoutPositionFor,
    breakoutConsolidationFromDarvas,
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

test("combinedTopGainersCandidates returns the top 30 distinct tickers by 52-week return", () => {
    state.data = emptyStateData();
    state.data.SP500.all_constituents = [
        { ticker: "AAA", return_52w_pct: 12, price: 10 },
        { ticker: "DUP", return_52w_pct: 50, price: 10 },
        { ticker: "NO_DATA", price: 10 },
    ];
    state.data.NASDAQ100.all_constituents = [
        { ticker: "DUP", return_52w_pct: 99, price: 10 },
        { ticker: "BBB", return_52w_pct: 40, price: 10 },
    ];
    const rows = combinedTopGainersCandidates();
    assert.deepEqual(rows.map(r => r.ticker), ["DUP", "BBB", "AAA"]);
    assert.equal(rows[0].return_52w_pct, 50);
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

// ---------- classifyBreakout / combinedBreakoutCandidates (replika "MY STRATEGY BLUEPRINT", Gareth Packer/Financial Wisdom) ----------

// Testy poniżej celowo używają consolidationSource: "squeeze" — fixtures tego
// bloku (breakoutConstituent/breakoutFiredConstituent) populują tylko
// ttm_squeeze_chart, nie weekly_chart.bases/pending_base (Darvas), więc pod
// domyślnym źródłem ("darvas", patrz BREAKOUT_DEFAULT_CONSOLIDATION_SOURCE w
// signals.js) zwracałyby null. Testy dla źródła Darvas mają własną sekcję
// niżej (breakoutConsolidationFromDarvas / classifyBreakout z domyślnym
// źródłem).
const BREAKOUT_OPTS = {
    minConsolidationWeeks: 6, fireLookbackWeeks: 3,
    requireNatr: true, requireMacd: true, requireVolumeSpike: false,
    consolidationSource: "squeeze",
};

// Fixture minimalna, "wciąż w konsolidacji" — nie ma jeszcze świecy wybicia,
// więc knot/10-tyg. szczyt/zysk/wolumen nie mają zastosowania (zostają null).
// Trend gate zdany domyślnie (close_pct 10 > ema20_pct 5).
function breakoutConstituent(overrides = {}, squeezeOverrides = {}) {
    const dates = ["2026-01-01"];
    return {
        sector: "Tech", price: 100,
        weekly_chart: {
            current_stage: "2B", dates,
            close_pct: [10], ema20_pct: [5], low_pct: [9], high_pct: [11],
            volume: [1000], buying_volume_ratio: [1.0], bases: [], stop_level_pct: null,
        },
        ttm_squeeze_chart: {
            dates, histogram: [0.2], squeeze_on: [true], squeeze_count: [8],
            fired: [false], weeks_since_fire: [null], fire_consolidation_weeks: [null],
            natr: [5],
            ...squeezeOverrides,
        },
        macd_chart: { dates, macd: [1], signal: [0.5] },
        ...overrides,
    };
}

test("classifyBreakout returns null when price is not above its own EMA20 (trend gate)", () => {
    const c = breakoutConstituent({
        weekly_chart: {
            current_stage: "2B", dates: ["2026-01-01"],
            close_pct: [5], ema20_pct: [10], low_pct: [4], high_pct: [6],
            volume: [1000], buying_volume_ratio: [1.0], bases: [], stop_level_pct: null,
        },
    });
    assert.equal(classifyBreakout("AAA", "SP500", c, BREAKOUT_OPTS), null);
});

test("classifyBreakout marks consolidating (SETUP) once the squeeze has run at least the minimum weeks", () => {
    const r = classifyBreakout("AAA", "SP500", breakoutConstituent(), BREAKOUT_OPTS);
    assert.ok(r);
    assert.equal(r.status, "consolidating");
    assert.equal(r.substatus, "SETUP");
    assert.equal(r.consolidation_weeks, 8);
    assert.equal(r.wick_pct, null, "no breakout candle yet");
});

test("classifyBreakout ignores a squeeze shorter than the minimum consolidation window (blueprint: at least 6 weeks)", () => {
    const c = breakoutConstituent({}, { squeeze_count: [3] });
    assert.equal(classifyBreakout("AAA", "SP500", c, BREAKOUT_OPTS), null);
});

// Fixture "fired" — 10 tygodni płaskiej konsolidacji na 0%, wybicie na
// tygodniu 11. Domyślnie zdaje WSZYSTKIE kroki blueprintu (knot 33% <= 50%,
// 10-tyg. szczyt, zysk 9% w [5,20], wolumen +40% >= 30%, MACD nad sygnałową,
// NATR 5 <= 8) -> ENTRY.
function breakoutFiredConstituent({ gainPct = 9, wickExtra = 0.5, macd = 1, signal = 0.5, natr = 5,
    volumeRatio = 1.4, priorVolume = 1000, bases = [], stopLevelPct = null } = {}) {
    const dates = continuationFireDates(11);
    const closePct = new Array(10).fill(0).concat([gainPct]);
    const emaPct = new Array(11).fill(-10); // zawsze pod cena -> trend gate zawsze zdany
    const lowPct = closePct.map(v => v - 1);
    const highPct = closePct.map((v, i) => i === 10 ? v + wickExtra : v + 1);
    const volume = new Array(9).fill(priorVolume).concat([priorVolume, priorVolume * volumeRatio]);
    return {
        sector: "Tech", price: 100,
        weekly_chart: {
            current_stage: "2A", dates, close_pct: closePct, ema20_pct: emaPct,
            low_pct: lowPct, high_pct: highPct, volume,
            buying_volume_ratio: new Array(11).fill(1.0), bases, stop_level_pct: stopLevelPct,
        },
        ttm_squeeze_chart: {
            dates,
            histogram: new Array(10).fill(0.1).concat([0.5]),
            squeeze_on: new Array(10).fill(true).concat([false]),
            squeeze_count: new Array(10).fill(6).concat([0]),
            fired: new Array(10).fill(false).concat([true]),
            weeks_since_fire: new Array(10).fill(null).concat([0]),
            fire_consolidation_weeks: new Array(10).fill(null).concat([6]),
            natr: new Array(11).fill(natr),
        },
        macd_chart: { dates, macd: new Array(11).fill(macd), signal: new Array(11).fill(signal) },
    };
}

test("classifyBreakout marks a fully-qualifying fire as ENTRY, with every blueprint badge computed", () => {
    const r = classifyBreakout("AAA", "SP500", breakoutFiredConstituent(), BREAKOUT_OPTS);
    assert.ok(r);
    assert.equal(r.status, "fired");
    assert.equal(r.substatus, "ENTRY");
    assert.equal(r.weeks_since_fire, 0);
    assert.equal(r.consolidation_weeks, 6);
    assert.ok(Math.abs(r.wick_pct - 33.33) < 0.1, "wick = 0.5 / 1.5 range = 33%");
    assert.equal(r.ten_week_high, true);
    assert.ok(Math.abs(r.breakout_gain_pct - 9) < 0.01);
    assert.ok(Math.abs(r.volume_increase_pct - 40) < 0.01);
    assert.equal(r.natr_ok, true);
    assert.equal(r.macd_ok, true);
    assert.equal(r.risk_ok, true);
});

test("classifyBreakout rejects a fire whose upper wick exceeds 50% of the candle range", () => {
    // knot = 3 / (3+1) = 75% > 50%.
    const c = breakoutFiredConstituent({ wickExtra: 3 });
    assert.equal(classifyBreakout("AAA", "SP500", c, BREAKOUT_OPTS), null);
});

test("classifyBreakout rejects a fire whose close is not a 10-week high", () => {
    const dates = continuationFireDates(11);
    // 10 tygodni płasko na 20%, potem "wybicie" na 15% — NIE jest nowym szczytem
    // (odrzucane na tym kroku, przed nawet dotarciem do sprawdzenia zysku).
    const closePct = new Array(10).fill(20).concat([15]);
    const c = breakoutConstituent({
        weekly_chart: {
            current_stage: "2A", dates, close_pct: closePct,
            ema20_pct: new Array(11).fill(-10),
            low_pct: closePct.map(v => v - 1), high_pct: closePct.map(v => v + 1),
            volume: new Array(11).fill(1000), buying_volume_ratio: new Array(11).fill(1.0),
            bases: [], stop_level_pct: null,
        },
    }, {
        dates,
        histogram: new Array(10).fill(0.1).concat([0.5]),
        squeeze_on: new Array(10).fill(true).concat([false]),
        squeeze_count: new Array(10).fill(6).concat([0]),
        fired: new Array(10).fill(false).concat([true]),
        weeks_since_fire: new Array(10).fill(null).concat([0]),
        fire_consolidation_weeks: new Array(10).fill(null).concat([6]),
        natr: new Array(11).fill(5),
    });
    c.macd_chart = { dates, macd: new Array(11).fill(1), signal: new Array(11).fill(0.5) };
    assert.equal(classifyBreakout("AAA", "SP500", c, BREAKOUT_OPTS), null);
});

test("classifyBreakout rejects a breakout-week gain outside 5-20%", () => {
    assert.equal(classifyBreakout("AAA", "SP500", breakoutFiredConstituent({ gainPct: 2 }), BREAKOUT_OPTS),
        null, "2% gain is below the 5% floor");
    assert.equal(classifyBreakout("AAA", "SP500", breakoutFiredConstituent({ gainPct: 30 }), BREAKOUT_OPTS),
        null, "30% gain is above the 20% ceiling");
});

test("classifyBreakout ignores a fire with a bearish (negative) histogram", () => {
    const c = breakoutFiredConstituent();
    c.ttm_squeeze_chart.histogram = new Array(10).fill(0.1).concat([-0.5]);
    assert.equal(classifyBreakout("AAA", "SP500", c, BREAKOUT_OPTS), null);
});

test("classifyBreakout flags WAIT_MACD when required and MACD is below its signal, but still enters when not required", () => {
    const c = breakoutFiredConstituent({ macd: 0.2, signal: 0.5 });
    const withGate = classifyBreakout("AAA", "SP500", c, BREAKOUT_OPTS);
    assert.equal(withGate.substatus, "WAIT_MACD");
    const withoutGate = classifyBreakout("AAA", "SP500", c, { ...BREAKOUT_OPTS, requireMacd: false });
    assert.equal(withoutGate.substatus, "ENTRY");
});

test("classifyBreakout flags WAIT_NATR when required and NATR is above the blueprint's threshold (8)", () => {
    const c = breakoutFiredConstituent({ natr: 12 });
    const withGate = classifyBreakout("AAA", "SP500", c, BREAKOUT_OPTS);
    assert.equal(withGate.substatus, "WAIT_NATR");
    const withoutGate = classifyBreakout("AAA", "SP500", c, { ...BREAKOUT_OPTS, requireNatr: false });
    assert.equal(withoutGate.substatus, "ENTRY");
});

test("classifyBreakout flags WAIT_VOLUME only when requireVolumeSpike is explicitly turned on", () => {
    const c = breakoutFiredConstituent({ volumeRatio: 1.1 }); // +10%, below the 30% target
    const informational = classifyBreakout("AAA", "SP500", c, BREAKOUT_OPTS);
    assert.equal(informational.substatus, "ENTRY", "volume spike is informational by default (blueprint: 'some discretion can be applied')");
    assert.equal(informational.volume_spike_ok, false);
    const required = classifyBreakout("AAA", "SP500", c, { ...BREAKOUT_OPTS, requireVolumeSpike: true });
    assert.equal(required.substatus, "WAIT_VOLUME");
});

test("classifyBreakout flags WAIT_RISK when the stop sits further than the blueprint's 20% ceiling", () => {
    // Box spanning 100 (resistance) to 50 (support) at close0=100 -> middle-third
    // stop = 50 + (100-50)/3 ≈ 66.67 -> ~33% below the current price of 100.
    const c = breakoutFiredConstituent({
        bases: [{ resistance_pct: 0, support_pct: -50, end_date: continuationFireDates(11)[8] }],
    });
    const r = classifyBreakout("AAA", "SP500", c, BREAKOUT_OPTS);
    assert.equal(r.substatus, "WAIT_RISK");
    assert.equal(r.risk_ok, false);
    assert.ok(r.stop_distance_pct > 20);
});

test("classifyBreakout sizes the position via breakoutPositionFor once a stop is known", () => {
    const saved = { equity: state.breakoutEquity, winRatePct: state.breakoutWinRatePct, rewardRisk: state.breakoutRewardRisk, kellyFractionPct: state.breakoutKellyFractionPct };
    state.breakoutEquity = 100000;
    state.breakoutWinRatePct = 59;
    state.breakoutRewardRisk = 4.04;
    state.breakoutKellyFractionPct = 33;
    try {
        // Tight box (resistance 5% above close0, support 0%) -> stop close to price -> valid, small-risk position.
        const c = breakoutFiredConstituent({
            bases: [{ resistance_pct: 5, support_pct: 0, end_date: continuationFireDates(11)[8] }],
        });
        const r = classifyBreakout("AAA", "SP500", c, BREAKOUT_OPTS);
        assert.ok(r.kelly, "a valid stop below price should produce a sized position");
        assert.ok(r.kelly.shares > 0);
        assert.ok(Math.abs(r.kelly.riskOnEquityPct - (r.kelly.riskValue / 100000) * 100) < 1e-9);
    } finally {
        state.breakoutEquity = saved.equity;
        state.breakoutWinRatePct = saved.winRatePct;
        state.breakoutRewardRisk = saved.rewardRisk;
        state.breakoutKellyFractionPct = saved.kellyFractionPct;
    }
});

// ---------- breakoutKellyFraction / breakoutPositionFor (kalkulator Kelly Criterion) ----------
// Wartości z przykładu w "MY STRATEGY BLUEPRINT": 59% strike rate, 4.04
// reward/risk, 33% Kelly frakcyjny -> ok. 16% pozycji (dokładnie ten sam
// przykład, który daje domyślne wartości suwaków w signals.js).
test("breakoutKellyFraction matches the blueprint's own worked example (~16% fractional Kelly)", () => {
    const saved = { winRatePct: state.breakoutWinRatePct, rewardRisk: state.breakoutRewardRisk, kellyFractionPct: state.breakoutKellyFractionPct };
    state.breakoutWinRatePct = 59;
    state.breakoutRewardRisk = 4.04;
    state.breakoutKellyFractionPct = 33;
    try {
        const frac = breakoutKellyFraction();
        assert.ok(Math.abs(frac * 100 - 16.12) < 0.1);
    } finally {
        state.breakoutWinRatePct = saved.winRatePct;
        state.breakoutRewardRisk = saved.rewardRisk;
        state.breakoutKellyFractionPct = saved.kellyFractionPct;
    }
});

test("breakoutKellyFraction returns null for a non-positive reward/risk ratio", () => {
    const saved = state.breakoutRewardRisk;
    state.breakoutRewardRisk = 0;
    try {
        assert.equal(breakoutKellyFraction(), null);
    } finally {
        state.breakoutRewardRisk = saved;
    }
});

test("breakoutPositionFor sizes shares from equity * fractional Kelly, never from the risk budget", () => {
    const saved = { equity: state.breakoutEquity, winRatePct: state.breakoutWinRatePct, rewardRisk: state.breakoutRewardRisk, kellyFractionPct: state.breakoutKellyFractionPct };
    state.breakoutEquity = 100000;
    state.breakoutWinRatePct = 59;
    state.breakoutRewardRisk = 4.04;
    state.breakoutKellyFractionPct = 33;
    try {
        const pos = breakoutPositionFor(100, 90);
        assert.ok(pos);
        // positionValue = 100000 * 0.1612 ~= 16120 -> shares = floor(16120/100) = 161.
        assert.equal(pos.shares, 161);
        assert.ok(Math.abs(pos.riskOnEquityPct - (161 * 10 / 100000) * 100) < 1e-6);
    } finally {
        state.breakoutEquity = saved.equity;
        state.breakoutWinRatePct = saved.winRatePct;
        state.breakoutRewardRisk = saved.rewardRisk;
        state.breakoutKellyFractionPct = saved.kellyFractionPct;
    }
});

test("breakoutPositionFor returns null without a valid stop below the price", () => {
    assert.equal(breakoutPositionFor(100, null), null);
    assert.equal(breakoutPositionFor(100, 100), null);
    assert.equal(breakoutPositionFor(100, 110), null);
});

test("combinedBreakoutCandidates merges universes, dedupes tickers, sorts ENTRY first, then WAIT_*, then longest consolidation", () => {
    state.data = emptyStateData();
    state.data.SP500.constituents = [
        { ticker: "ENTRY_ROW", ...breakoutFiredConstituent() },
        { ticker: "COIL_SHORT", ...breakoutConstituent({}, { squeeze_count: [6] }) },
    ];
    state.data.WIG20.constituents = [
        { ticker: "WAIT_ROW", ...breakoutFiredConstituent({ macd: 0.2, signal: 0.5 }) },
        { ticker: "COIL_LONG", ...breakoutConstituent({}, { squeeze_count: [12] }) },
    ];

    const rows = combinedBreakoutCandidates(BREAKOUT_OPTS);
    assert.deepEqual(rows.map(r => r.ticker), ["ENTRY_ROW", "WAIT_ROW", "COIL_LONG", "COIL_SHORT"]);
});

// ---------- breakoutConsolidationFromDarvas (źródło konsolidacji "darvas", domyślne — patrz komentarz nad classifyBreakout) ----------
// Na wyraźną prośbę użytkownika: "3 candles in a row didn't surpass the
// highest close price, and next 3 lowest close you have the box" — dokładnie
// mechanizm Darvasa już istniejący w _compute_weinstein_stage_series
// (run_query.py), tutaj użyty jako alternatywne (i domyślne) źródło
// konsolidacji zamiast TTM Squeeze.

const BREAKOUT_DARVAS_BASE_OPTS = { minConsolidationWeeks: 6, fireLookbackWeeks: 3 };

test("state.breakoutConsolidationSource defaults to darvas", () => {
    assert.equal(state.breakoutConsolidationSource, "darvas");
});

test("breakoutConsolidationFromDarvas marks consolidating when the stock sits in a COMPLETE (BOXED) box", () => {
    const dates = continuationFireDates(8);
    const c = {
        weekly_chart: {
            dates,
            pending_base: { start_date: dates[0], resistance_pct: 10, support_pct: 0, phase: "BOXED" },
            bases: [],
        },
    };
    const consol = breakoutConsolidationFromDarvas(c, BREAKOUT_DARVAS_BASE_OPTS);
    assert.ok(consol);
    assert.equal(consol.isConsolidating, true);
    assert.equal(consol.isFired, false);
    assert.equal(consol.consolidationWeeks, 8);
});

test("breakoutConsolidationFromDarvas does NOT count a box whose bottom isn't confirmed yet (SEEKING_BOTTOM)", () => {
    const dates = continuationFireDates(8);
    const c = {
        weekly_chart: {
            dates,
            pending_base: { start_date: dates[0], resistance_pct: 10, support_pct: null, phase: "SEEKING_BOTTOM" },
            bases: [],
        },
    };
    assert.equal(breakoutConsolidationFromDarvas(c, BREAKOUT_DARVAS_BASE_OPTS), null,
        "box exists only once BOTH edges are confirmed, per the user's own description");
});

test("breakoutConsolidationFromDarvas rejects a box shorter than the minimum consolidation window", () => {
    const dates = continuationFireDates(8);
    const c = {
        weekly_chart: {
            dates,
            pending_base: { start_date: dates[5], resistance_pct: 10, support_pct: 0, phase: "BOXED" }, // 3 weeks only
            bases: [],
        },
    };
    assert.equal(breakoutConsolidationFromDarvas(c, BREAKOUT_DARVAS_BASE_OPTS), null);
});

test("breakoutConsolidationFromDarvas marks fired from the last recorded base breakout, within the lookback window", () => {
    const dates = continuationFireDates(8);
    const c = {
        weekly_chart: {
            dates,
            pending_base: null,
            bases: [{ start_date: dates[0], end_date: dates[6], resistance_pct: 10, support_pct: 0, base_count: 1, kind: "stage2" }],
        },
    };
    const consol = breakoutConsolidationFromDarvas(c, BREAKOUT_DARVAS_BASE_OPTS);
    assert.ok(consol);
    assert.equal(consol.isFired, true);
    assert.equal(consol.weeksSinceFire, 0, "breakout happens the week AFTER the box's own end_date");
    assert.equal(consol.consolidationWeeks, 7);
    assert.equal(consol.fireWeekDate, dates[7]);
});

test("breakoutConsolidationFromDarvas ignores a base breakout older than the fire lookback window", () => {
    const dates = continuationFireDates(12);
    const c = {
        weekly_chart: {
            dates,
            pending_base: null,
            // 7-week box (>= minConsolidationWeeks), but the breakout itself (dates[7]) is 4 weeks
            // before the last displayed week (dates[11]) — outside fireLookbackWeeks (3).
            bases: [{ start_date: dates[0], end_date: dates[6], resistance_pct: 10, support_pct: 0, base_count: 1, kind: "stage2" }],
        },
    };
    assert.equal(breakoutConsolidationFromDarvas(c, BREAKOUT_DARVAS_BASE_OPTS), null);
});

test("breakoutConsolidationFromDarvas falls back to the pending box when the last recorded base is too old/short", () => {
    const dates = continuationFireDates(12);
    const c = {
        weekly_chart: {
            dates,
            // Stale base: only 8 weeks in the past.
            bases: [{ start_date: dates[0], end_date: dates[3], resistance_pct: 5, support_pct: 0, base_count: 1, kind: "stage1" }],
            pending_base: { start_date: dates[5], resistance_pct: 20, support_pct: 15, phase: "BOXED" },
        },
    };
    const consol = breakoutConsolidationFromDarvas(c, BREAKOUT_DARVAS_BASE_OPTS);
    assert.ok(consol);
    assert.equal(consol.isConsolidating, true);
    assert.equal(consol.consolidationWeeks, 7); // dates[5]..dates[11]
});

// classifyBreakout end-to-end with the Darvas source — reuses the same
// candle-criteria code path (wick/10-week-high/gain/volume) as the squeeze
// tests above, just fed by a `bases` entry instead of ttm_squeeze_chart fields.
function breakoutDarvasFiredConstituent({ gainPct = 9, wickExtra = 0.5, macd = 1, signal = 0.5, natr = 5,
    volumeRatio = 1.4, priorVolume = 1000 } = {}) {
    const dates = continuationFireDates(11);
    const closePct = new Array(10).fill(0).concat([gainPct]);
    const emaPct = new Array(11).fill(-10);
    const lowPct = closePct.map(v => v - 1);
    const highPct = closePct.map((v, i) => i === 10 ? v + wickExtra : v + 1);
    const volume = new Array(9).fill(priorVolume).concat([priorVolume, priorVolume * volumeRatio]);
    return {
        sector: "Tech", price: 100,
        weekly_chart: {
            current_stage: "2A", dates, close_pct: closePct, ema20_pct: emaPct,
            low_pct: lowPct, high_pct: highPct, volume,
            buying_volume_ratio: new Array(11).fill(1.0),
            bases: [{ start_date: dates[0], end_date: dates[9], resistance_pct: 0, support_pct: -10, base_count: 1, kind: "stage2" }],
            pending_base: null,
            stop_level_pct: null,
        },
        // squeeze_on/etc. all "off" — squeezeConsolidationBox() (js/minicharts.js, called
        // unconditionally by breakoutLevelFor() for the "Poziom do obserwacji" column,
        // independent of state.breakoutConsolidationSource) needs these arrays to exist
        // even when the Darvas source is what's actually driving classification here.
        ttm_squeeze_chart: {
            dates, natr: new Array(11).fill(natr),
            squeeze_on: new Array(11).fill(false), squeeze_count: new Array(11).fill(0),
            fired: new Array(11).fill(false), weeks_since_fire: new Array(11).fill(null),
            fire_consolidation_weeks: new Array(11).fill(null), histogram: new Array(11).fill(0.1),
        },
        macd_chart: { dates, macd: new Array(11).fill(macd), signal: new Array(11).fill(signal) },
    };
}

const BREAKOUT_DARVAS_OPTS = { ...BREAKOUT_DARVAS_BASE_OPTS, requireNatr: true, requireMacd: true, requireVolumeSpike: false, consolidationSource: "darvas" };

test("classifyBreakout with the Darvas source marks a fully-qualifying box breakout as ENTRY", () => {
    const r = classifyBreakout("AAA", "SP500", breakoutDarvasFiredConstituent(), BREAKOUT_DARVAS_OPTS);
    assert.ok(r);
    assert.equal(r.status, "fired");
    assert.equal(r.substatus, "ENTRY");
    assert.equal(r.consolidation_source, "darvas");
    assert.equal(r.consolidation_weeks, 10);
    assert.equal(r.weeks_since_fire, 0);
    assert.ok(Math.abs(r.wick_pct - 33.33) < 0.1, "same wick/gain/10-week-high logic as the squeeze path");
    assert.equal(r.ten_week_high, true);
    assert.ok(Math.abs(r.breakout_gain_pct - 9) < 0.01);
});

test("classifyBreakout returns null under the Darvas source for a fixture that only populates ttm_squeeze_chart", () => {
    assert.equal(classifyBreakout("AAA", "SP500", breakoutFiredConstituent(), BREAKOUT_DARVAS_OPTS), null,
        "no weekly_chart.bases/pending_base -> nothing for the Darvas source to classify");
});

// ---------- classifyContinuation / combinedContinuationCandidates (WERSJA 4:
// czysty, czterowarunkowy filtr trendu — EMA10 > EMA20, cena > EMA40, RS > 0,
// MACD nad sygnałową, wszystkie jednocześnie — bez żadnego automatu
// konsolidacji/wybicia; patrz nagłówek klasyfikacji w signals.js dla pełnego
// opisu i cytatu z prośby użytkownika) ----------

// Wykorzystywana też przez wcześniejsze bloki testów (classifyBreakout/Darvas) —
// zwykła, rosnąca sekwencja dat tygodniowych, 4 na miesiąc zaczynając od
// października 2025.
function continuationFireDates(n) {
    return Array.from({ length: n }, (_, i) => `2025-${String(10 + Math.floor(i / 4)).padStart(2, "0")}-${String((i % 4) * 7 + 1).padStart(2, "0")}`);
}

// 3 tygodnie: EMA10 (7) > EMA20 (5) na ostatnim tygodniu, cena (2) > EMA40 (1),
// RS 52 tyg. (3) > 0, MACD (0.3) > sygnał (0.2) — wszystkie cztery warunki
// spełnione na ostatnim tygodniu każdej własnej serii.
function continuationWeeklyChart(overrides = {}) {
    const dates = continuationFireDates(3);
    return {
        dates,
        close_pct: [0, 1, 2],
        ema10_pct: [5, 6, 7],
        ema20_pct: [3, 4, 5],
        ema40_pct: [1, 1, 1],
        current_stage: "2B",
        ...overrides,
    };
}

function continuationMacdChart(overrides = {}) {
    return {
        dates: continuationFireDates(3),
        macd: [0.1, 0.2, 0.3],
        signal: [0, 0.1, 0.2],
        ...overrides,
    };
}

function continuationConstituent(overrides = {}) {
    return {
        sector: "Information Technology", price: 100, momentum_pct: 40,
        weekly_chart: continuationWeeklyChart(),
        mansfield_chart: { rsm_long: [1, 2, 3] },
        macd_chart: continuationMacdChart(),
        ...overrides,
    };
}

// ---------- continuationTrendGate (cztery warunki, twarde AND) ----------

test("continuationTrendGate returns null when the stock's own EMA10 is not above its EMA20", () => {
    const c = continuationConstituent({ weekly_chart: continuationWeeklyChart({ ema10_pct: [3, 3, 3], ema20_pct: [5, 5, 5] }) });
    assert.equal(continuationTrendGate(c), null);
});

test("continuationTrendGate returns null when price is not above its own 40-week EMA", () => {
    const c = continuationConstituent({ weekly_chart: continuationWeeklyChart({ ema40_pct: [5, 5, 5] }) }); // close_pct[2]=2 < 5
    assert.equal(continuationTrendGate(c), null);
});

test("continuationTrendGate returns null when RS 52 tyg. is not positive", () => {
    const c = continuationConstituent({ mansfield_chart: { rsm_long: [1, -0.2] } });
    assert.equal(continuationTrendGate(c), null);
});

test("continuationTrendGate returns null when the weekly MACD is not above its own signal line", () => {
    const c = continuationConstituent({ macd_chart: continuationMacdChart({ macd: [0.1, 0.1, 0.1], signal: [0.5, 0.5, 0.5] }) });
    assert.equal(continuationTrendGate(c), null);
});

test("continuationTrendGate returns rsLong/ema10Pct/ema20Pct/ema40Pct/closePct at the latest week when all four conditions pass", () => {
    const g = continuationTrendGate(continuationConstituent());
    assert.ok(g);
    assert.equal(g.rsLong, 3);
    assert.equal(g.ema10Pct, 7);
    assert.equal(g.ema20Pct, 5);
    assert.equal(g.ema40Pct, 1);
    assert.equal(g.closePct, 2);
});

// ---------- classifyContinuation / combinedContinuationCandidates end-to-end ----------

test("classifyContinuation returns null when the trend gate fails", () => {
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ mansfield_chart: { rsm_long: [-1] } })), null);
});

test("classifyContinuation returns spread/MACD/sector-RS fields for a stock passing all four conditions", () => {
    const savedSectorRs = state.sectorRs;
    state.sectorRs = [{ sector: "Information Technology", data_source: "etf", rsm_vs_index_pct: 12.5 }];
    try {
        const r = classifyContinuation("AAA", "SP500", continuationConstituent());
        assert.ok(r);
        assert.equal(r.ticker, "AAA");
        assert.equal(r.current_stage, "2B", "Etap wciąż informacyjny, nie jest częścią gate'u");
        assert.ok(r.ema_spread_pct > 0, "gate wymaga EMA10 > EMA20, więc spread jest zawsze dodatni");
        assert.ok(r.price_vs_ema40_pct > 0, "gate wymaga ceny nad EMA40, więc spread jest zawsze dodatni");
        assert.equal(r.macd_now, 0.3);
        assert.equal(r.sector_rs_pct, 12.5);
        assert.equal(r.rs_long, 3, "rs_long z miniVisualFields, ta sama wartość co gate.rsLong");
    } finally {
        state.sectorRs = savedSectorRs;
    }
});

// ---------- sectorRsInfo (dodatkowy, niewymagany plus) ----------

test("sectorRsInfo returns null without a sectors list or when the sector isn't in it", () => {
    const saved = state.sectorRs;
    try {
        state.sectorRs = null;
        assert.equal(sectorRsInfo("Information Technology"), null);
        state.sectorRs = [{ sector: "Financials", data_source: "etf", rsm_vs_index_pct: 5 }];
        assert.equal(sectorRsInfo("Information Technology"), null, "sector not present in the list");
    } finally {
        state.sectorRs = saved;
    }
});

test("sectorRsInfo returns null for a sector without ETF data, and the RS value otherwise (can be negative)", () => {
    const saved = state.sectorRs;
    try {
        state.sectorRs = [
            { sector: "Energy", data_source: "no_data", rsm_vs_index_pct: null },
            { sector: "Financials", data_source: "etf", rsm_vs_index_pct: -3.2 },
        ];
        assert.equal(sectorRsInfo("Energy"), null);
        assert.equal(sectorRsInfo("Financials"), -3.2);
    } finally {
        state.sectorRs = saved;
    }
});

test("combinedContinuationCandidates dedupes tickers and sorts by RS 52 tyg. descending", () => {
    const savedData = state.data;
    const savedSectorRs = state.sectorRs;
    state.sectorRs = null;
    state.data = {
        SP500: { all_constituents: [
            { ticker: "SQZ", ...continuationConstituent() },
            { ticker: "STRONG", ...continuationConstituent({ mansfield_chart: { rsm_long: [1, 2, 8] } }) },
        ] },
        NASDAQ100: { all_constituents: [{ ticker: "SQZ", ...continuationConstituent() }] },
    };
    try {
        const rows = combinedContinuationCandidates();
        assert.deepEqual(rows.map(r => r.ticker), ["STRONG", "SQZ"]);
        assert.equal(rows[1].universe, "SP500", "first occurrence in UNIVERSES order wins the dedupe");
    } finally {
        state.data = savedData;
        state.sectorRs = savedSectorRs;
    }
});

// ---------------------------------------------------------------
// RS Rating (IBD) + filtr Qullamaggie
// ---------------------------------------------------------------
const rsq = require(path.join("..", "..", "docs", "js", "signals.js"));

function rsRec(ticker, over = {}) {
    return { ticker, sector: "Tech", price: 100, rs_score: 0.5, adr_pct: 6, dollar_volume_avg: 50e6,
        gain_from_low_1m_pct: 5, gain_from_low_3m_pct: 12, gain_from_low_6m_pct: 40, ...over };
}

test("percentileRatings: 1..99, remisy dostaja srednia range", () => {
    const m = rsq.percentileRatings([
        { ticker: "A", rs_score: 0.1 }, { ticker: "B", rs_score: 0.2 },
        { ticker: "C", rs_score: 0.3 }, { ticker: "D", rs_score: 0.3 }, { ticker: "X", rs_score: null },
    ]);
    assert.equal(m.get("A"), 1);
    assert.equal(m.get("B"), 34);
    assert.equal(m.get("C"), 83);
    assert.equal(m.get("D"), 83);
    assert.equal(m.has("X"), false);
});

test("combinedQullamaggieRows: wszystkie progi, wzrost z dowolnego okna", () => {
    rsq.state.data = {
        SP500: { all_constituents: [
            rsRec("OK"),
            rsRec("LOWVOL", { dollar_volume_avg: 1e6 }),
            rsRec("LOWADR", { adr_pct: 2 }),
            rsRec("NOGAIN", { gain_from_low_1m_pct: 1, gain_from_low_3m_pct: 2, gain_from_low_6m_pct: 3 }),
            rsRec("MISSING", { adr_pct: null }),
        ] },
        NASDAQ100: { all_constituents: [rsRec("OK")] }, // duplikat pomijany
    };
    const rows = rsq.combinedQullamaggieRows({ minDollarVolumeM: 20, minAdrPct: 5, minGainPct: 10 }, "USA");
    assert.deepEqual(rows.map(r => r.ticker), ["OK"]);
    assert.equal(rows[0].max_gain_pct, 40);
    // wyzszy prog wzrostu odrzuca
    assert.equal(rsq.combinedQullamaggieRows({ minDollarVolumeM: 20, minAdrPct: 5, minGainPct: 50 }, "USA").length, 0);
});
