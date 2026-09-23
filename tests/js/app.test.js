// Testy dla czystej logiki w docs/js/app.js (Wybicie/TTM Squeeze screener +
// wyszukiwarka Ctrl+K — reszta pliku jest scisle sprzezona z DOM/renderowaniem).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    weeksSinceZeroCrossUp, classifyWybicie, combinedWybicieCandidates, classifyTtmSqueeze, combinedTtmSqueezeCandidates, state,
    classifyContinuation, combinedContinuationCandidates,
    findRsEntry, buildSearchIndex, getCmdkIndex,
} = require(path.join("..", "..", "docs", "js", "app.js"));

// compareRows now lives in docs/js/shared.js — see tests/js/shared.test.js.
// rollingMean/alignMansfieldToDates/alignSqueezeToDates/fmtPlDate now live in
// docs/js/chart-render.js — see tests/js/chart-render.test.js.

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

test("classifyWybicie accepts a fresh MACD + RS 52W zero cross with a positive TTM histogram", () => {
    const r = classifyWybicie("AAA", "SP500", wybicieConstituent({}));
    assert.ok(r);
    assert.equal(r.macdCrossWeeks, 2);
    assert.equal(r.rsCrossWeeks, 2);
    assert.equal(r.histNow, 2);
});

test("classifyWybicie rejects when the two crosses are further apart than the breakout window", () => {
    const c = wybicieConstituent({ macd_chart: { macd: [-1, 1, 1, 1, 1, 1] }, mansfield_chart: { rsm_long: [-1, -1, -1, -1, -1, 1] } });
    // MACD 5 tyg. temu, RS 1 tydz. temu -> odstęp 4
    assert.equal(classifyWybicie("AAA", "SP500", c, { windowWeeks: 3, monitorWeeks: 10 }), null);
    const r = classifyWybicie("AAA", "SP500", c, { windowWeeks: 4, monitorWeeks: 10 });
    assert.equal(r.breakoutWeeks, 1);
});

test("classifyWybicie drops a breakout older than the monitoring period", () => {
    const c = wybicieConstituent({ macd_chart: { macd: [-1, 1, 1, 1, 1] }, mansfield_chart: { rsm_long: [-1, 1, 1, 1, 1] } });
    // oba przecięcia 4 tyg. temu
    assert.equal(classifyWybicie("AAA", "SP500", c, { windowWeeks: 0, monitorWeeks: 3 }), null);
    assert.equal(classifyWybicie("AAA", "SP500", c, { windowWeeks: 0, monitorWeeks: 4 }).breakoutWeeks, 4);
});

test("classifyWybicie rejects when the TTM histogram is not positive", () => {
    const c = wybicieConstituent({ ttm_squeeze_chart: { histogram: [1, 1, 1, -0.1] } });
    assert.equal(classifyWybicie("AAA", "SP500", c), null);
});

test("classifyWybicie rejects when MACD never crossed zero in the data", () => {
    const c = wybicieConstituent({ macd_chart: { macd: [1, 1, 1, 1, 1, 1, 1, 1] } });
    assert.equal(classifyWybicie("AAA", "SP500", c), null);
});

test("classifyWybicie rejects when RS 52W is still below zero", () => {
    const c = wybicieConstituent({ mansfield_chart: { rsm_long: [-3, -2, -1, -0.5] } });
    assert.equal(classifyWybicie("AAA", "SP500", c), null);
});

test("classifyWybicie returns null when chart data is missing", () => {
    assert.equal(classifyWybicie("AAA", "SP500", { price: 1 }), null);
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

// findRsEntry / buildSearchIndex: od zmiany na zyczenie uzytkownika ("wszystkie
// spolki z SP500, Nasdaq100" do wyszukiwania/wykresow/RSM) oba czytaja
// all_constituents (CALE uniwersum, patrz run_query.py FULL_COVERAGE_UNIVERSES),
// nie tylko constituents (biezacy decyl) — z fallbackiem na constituents dla
// starszego, jeszcze niezmigrowanego JSON-a w cache service workera.

test("findRsEntry finds a ticker that is only in all_constituents, not in constituents (outside the decile)", () => {
    state.data = emptyStateData();
    state.data.SP500.constituents = [
        { ticker: "AAA", weekly_chart: { dates: [] } },
    ];
    state.data.SP500.all_constituents = [
        { ticker: "AAA", weekly_chart: { dates: [] } },
        { ticker: "TYL", in_selection: false, weekly_chart: { dates: ["2026-01-05"] } },
    ];

    const entry = findRsEntry("TYL", "SP500");
    assert.ok(entry);
    assert.equal(entry.ticker, "TYL");
    assert.equal(entry.universe, "SP500");
});

test("findRsEntry falls back to constituents when all_constituents is absent (equal-weight universe / stale cache)", () => {
    state.data = emptyStateData();
    state.data.DOWJONES.constituents = [
        { ticker: "BBB", weekly_chart: { dates: [] } },
    ];

    const entry = findRsEntry("BBB", "DOWJONES");
    assert.ok(entry);
    assert.equal(entry.ticker, "BBB");
});

test("findRsEntry returns null when the ticker has no weekly_chart", () => {
    state.data = emptyStateData();
    state.data.SP500.all_constituents = [{ ticker: "NOCHART", weekly_chart: null }];
    assert.equal(findRsEntry("NOCHART", "SP500"), null);
});

test("buildSearchIndex indexes tickers from all_constituents, not just the current decile", () => {
    state.data = emptyStateData();
    state.data.SP500.constituents = [
        { ticker: "AAA", sector: "Tech" },
    ];
    state.data.SP500.all_constituents = [
        { ticker: "AAA", sector: "Tech" },
        { ticker: "TYL", sector: "Technology" },
    ];

    buildSearchIndex();
    const tickers = getCmdkIndex().map(i => i.ticker);
    assert.ok(tickers.includes("TYL"), "TYL powinien byc w indeksie, mimo ze jest poza constituents");
    assert.ok(tickers.includes("AAA"));
});

// ---------- classifyContinuation / combinedContinuationCandidates ----------

function continuationConstituent(overrides = {}, dailyOverrides = {}) {
    return {
        sector: "Tech", price: 100, momentum_pct: 40, momentum_score: 2,
        weekly_chart: { current_stage: "2B" },
        mansfield_chart: { rsm_medium: [1, 2, 3, null] },
        daily_squeeze: {
            squeeze_on: true, squeeze_days: 8, days_since_fire: 40, fire_consolidation_days: 12,
            histogram: 1.5, histogram_prev: 1.0, recent_squeeze: [0, 1, 1],
            sma50_pct: 6, high_20d_pct: -2, return_1m_pct: 5,
            ...dailyOverrides,
        },
        ...overrides,
    };
}

const CONT_OPTS = { maxSqueezeDays: 30, fireLookbackDays: 5, minMomentumPct: 20 };

test("classifyContinuation accepts a Stage 2 stock in a short daily squeeze", () => {
    const r = classifyContinuation("AAA", "SP500", continuationConstituent(), CONT_OPTS);
    assert.ok(r);
    assert.equal(r.status, "squeeze");
    assert.equal(r.squeeze_days, 8);
    assert.equal(r.rs_medium, 3);
    assert.equal(r.histogram_rising, true);
});

test("classifyContinuation accepts a fresh upward fire out of a daily squeeze", () => {
    const r = classifyContinuation("AAA", "SP500", continuationConstituent({}, {
        squeeze_on: false, squeeze_days: 0, days_since_fire: 2, fire_consolidation_days: 10, histogram: 0.8,
    }), CONT_OPTS);
    assert.equal(r.status, "fired");
    assert.equal(r.days_since_fire, 2);
    assert.equal(r.squeeze_days, 10);
});

test("classifyContinuation applies the max squeeze length to fires too", () => {
    assert.equal(classifyContinuation("AAA", "SP500", continuationConstituent({}, {
        squeeze_on: false, squeeze_days: 0, days_since_fire: 2, fire_consolidation_days: 42, histogram: 0.8,
    }), CONT_OPTS), null);
});

test("classifyContinuation rejects a fire with a negative daily histogram (breakdown)", () => {
    assert.equal(classifyContinuation("AAA", "SP500", continuationConstituent({}, {
        squeeze_on: false, squeeze_days: 0, days_since_fire: 2, histogram: -0.5,
    }), CONT_OPTS), null);
});

test("classifyContinuation rejects squeezes that are too short or too long", () => {
    assert.equal(classifyContinuation("AAA", "SP500", continuationConstituent({}, { squeeze_days: 2 }), CONT_OPTS), null);
    assert.equal(classifyContinuation("AAA", "SP500", continuationConstituent({}, { squeeze_days: 31 }), CONT_OPTS), null);
});

test("classifyContinuation requires Stage 2, momentum, RS 26W > 0 and price above daily SMA50", () => {
    const opts = CONT_OPTS;
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ weekly_chart: { current_stage: "1" } }), opts), null);
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ momentum_pct: 10 }), opts), null);
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ mansfield_chart: { rsm_medium: [1, -0.5] } }), opts), null);
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({}, { sma50_pct: -1 }), opts), null);
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ daily_squeeze: null }), opts), null);
});

test("combinedContinuationCandidates dedupes tickers and puts fresh fires first", () => {
    const saved = state.data;
    state.data = {
        SP500: { all_constituents: [
            { ticker: "SQZ", ...continuationConstituent() },
            { ticker: "FIRE", ...continuationConstituent({}, { squeeze_on: false, squeeze_days: 0, days_since_fire: 1 }) },
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
