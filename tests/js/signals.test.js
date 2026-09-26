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
    classifyBreakout, combinedBreakoutCandidates, breakoutKellyFraction, breakoutPositionFor,
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

// ---------- classifyBreakout / combinedBreakoutCandidates (replika "MY STRATEGY BLUEPRINT", Gareth Packer/Financial Wisdom) ----------

const BREAKOUT_OPTS = {
    minConsolidationWeeks: 6, fireLookbackWeeks: 3,
    requireNatr: true, requireMacd: true, requireVolumeSpike: false,
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
