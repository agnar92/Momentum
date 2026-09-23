// Testy dla czystej logiki w docs/js/signals.js (screenery Wybicie/TTM
// Squeeze/Continuation + odświeżanie D1 przez GitHub Actions — wydzielone z
// docs/js/app.js na osobną stronę "Sygnały", patrz CLAUDE.md; reszta pliku
// jest ściśle sprzężona z DOM/renderowaniem).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    weeksSinceZeroCrossUp, classifyWybicie, combinedWybicieCandidates, classifyTtmSqueeze, combinedTtmSqueezeCandidates, state,
    classifyContinuation, combinedContinuationCandidates,
    effectiveDaily, classifyWeeklyWinner, combinedWeeklyWinners, latestDailyDate,
    githubRepoFromLocation, pickDispatchedRun, refreshProgressFromJobs, refreshStepLabel,
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

// ---------- tryb "MACD_ONLY" (selector "Samo MACD tygodniowe", bez warunku RS 52 tyg.) ----------

test("classifyWybicie MACD_ONLY mode accepts a fresh MACD cross even when RS 52W never crossed", () => {
    const c = wybicieConstituent({ mansfield_chart: { rsm_long: [-3, -2, -1, -0.5] } });
    assert.equal(classifyWybicie("AAA", "SP500", c), null); // domyślny tryb MACD_RS nadal odrzuca
    const r = classifyWybicie("AAA", "SP500", c, { mode: "MACD_ONLY", monitorWeeks: 10 });
    assert.ok(r);
    assert.equal(r.breakoutWeeks, r.macdCrossWeeks);
    assert.equal(r.rsCrossWeeks, null);
    assert.equal(r.rsLongNow, -0.5);
});

test("classifyWybicie MACD_ONLY mode ignores the breakout window entirely", () => {
    // MACD skrzyżował 5 tyg. temu, RS wcale — w trybie MACD_RS okno by to odrzuciło niezależnie od RS.
    const c = wybicieConstituent({ macd_chart: { macd: [-1, 1, 1, 1, 1, 1] }, mansfield_chart: { rsm_long: [-1, -1, -1, -1, -1, -1] } });
    const r = classifyWybicie("AAA", "SP500", c, { mode: "MACD_ONLY", windowWeeks: 0, monitorWeeks: 10 });
    assert.ok(r);
    assert.equal(r.breakoutWeeks, 5);
});

test("classifyWybicie MACD_ONLY mode still requires a positive TTM histogram", () => {
    const c = wybicieConstituent({ ttm_squeeze_chart: { histogram: [1, 1, 1, -0.1] } });
    assert.equal(classifyWybicie("AAA", "SP500", c, { mode: "MACD_ONLY" }), null);
});

test("classifyWybicie MACD_ONLY mode still requires a fresh MACD cross", () => {
    const c = wybicieConstituent({ macd_chart: { macd: [1, 1, 1, 1, 1, 1, 1, 1] } });
    assert.equal(classifyWybicie("AAA", "SP500", c, { mode: "MACD_ONLY" }), null);
});

test("classifyWybicie MACD_ONLY mode tolerates missing RS 52W data entirely", () => {
    const c = wybicieConstituent({ mansfield_chart: null });
    const r = classifyWybicie("AAA", "SP500", c, { mode: "MACD_ONLY", monitorWeeks: 10 });
    assert.ok(r);
    assert.equal(r.rsLongNow, null);
    assert.equal(r.rsCrossWeeks, null);
    assert.deepEqual(r.mini_rs, []);
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

// ---------- classifyContinuation / combinedContinuationCandidates ----------

function continuationConstituent(overrides = {}, dailyOverrides = {}) {
    return {
        sector: "Tech", price: 100, momentum_pct: 40, momentum_score: 2,
        weekly_chart: { current_stage: "2B" },
        mansfield_chart: { rsm_medium: [-1, -2, -3], rsm_long: [1, 2, 3, null] },
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
    assert.equal(r.rs_long, 3, "gate reads RS 52W (rsm_long), not RS 26W");
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

test("classifyContinuation requires Stage 2, positive momentum, RS 52W > 0 and price above daily SMA50", () => {
    const opts = CONT_OPTS;
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ weekly_chart: { current_stage: "1" } }), opts), null);
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ momentum_pct: 10 }), opts), null);
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ mansfield_chart: { rsm_long: [1, -0.5] } }), opts), null);
    assert.equal(classifyContinuation("A", "SP500", continuationConstituent({ momentum_pct: -1 }), { ...opts, minMomentumPct: 0 }), null);
    assert.ok(classifyContinuation("A", "SP500", continuationConstituent({ momentum_pct: 1 }), { ...opts, minMomentumPct: 0 }));
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

// ---------- dzienne odświeżenie (continuation.json) / tygodniowi zwycięzcy ----------

test("effectiveDaily prefers the newer continuation.json summary over the weekly export", () => {
    const saved = state.dailyOverride;
    try {
        const c = { ticker: "AAA", daily_squeeze: { date: "2026-09-21", squeeze_days: 4 } };
        state.dailyOverride = { tickers: { AAA: { date: "2026-09-23", squeeze_days: 6 } } };
        assert.equal(effectiveDaily(c).squeeze_days, 6);
        state.dailyOverride = { tickers: { AAA: { date: "2026-09-18", squeeze_days: 1 } } };
        assert.equal(effectiveDaily(c).squeeze_days, 4);
        state.dailyOverride = null;
        assert.equal(effectiveDaily(c).squeeze_days, 4);
        assert.equal(effectiveDaily({ ticker: "BBB" }), null);
    } finally {
        state.dailyOverride = saved;
    }
});

test("classifyContinuation uses the fresh daily close as price when available", () => {
    const r = classifyContinuation("AAA", "SP500", continuationConstituent({}, { close: 123.45 }), CONT_OPTS);
    assert.equal(r.price, 123.45);
});

test("classifyWeeklyWinner keeps every weekly winner and marks the daily signal", () => {
    const withSignal = classifyWeeklyWinner("AAA", "SP500", continuationConstituent({
        weekly_chart: { current_stage: "2A", close_pct: [0, 5, 10], ema20_pct: [0, 2, 4] },
    }, { spark: { closes: [1, 2, 3], squeeze: [0, 1, 1] } }), CONT_OPTS);
    assert.equal(withSignal.signal, "squeeze");
    assert.equal(withSignal.status_order, 1);
    assert.deepEqual(withSignal.weekly_closes, [0, 5, 10]);
    assert.deepEqual(withSignal.daily_squeeze, [0, 1, 1]);

    const noSetup = classifyWeeklyWinner("BBB", "SP500", continuationConstituent({}, { squeeze_on: false, days_since_fire: 30 }), CONT_OPTS);
    assert.ok(noSetup);
    assert.equal(noSetup.signal, null);
    assert.equal(noSetup.status_order, 2);

    const belowSma = classifyWeeklyWinner("CCC", "SP500", continuationConstituent({}, { sma50_pct: -2 }), CONT_OPTS);
    assert.equal(belowSma.signal, null, "setup below daily SMA50 is not a signal");

    assert.equal(classifyWeeklyWinner("DDD", "SP500", continuationConstituent({ weekly_chart: { current_stage: "3" } }), CONT_OPTS), null);
});

test("combinedWeeklyWinners puts signals first and latestDailyDate finds the newest session", () => {
    const savedData = state.data;
    const savedOverride = state.dailyOverride;
    state.data = { SP500: { all_constituents: [
        { ticker: "NONE", ...continuationConstituent({ momentum_pct: 90 }, { squeeze_on: false, days_since_fire: 30, date: "2026-09-21" }) },
        { ticker: "SQZ", ...continuationConstituent({}, { date: "2026-09-21" }) },
    ] } };
    state.dailyOverride = null;
    try {
        assert.deepEqual(combinedWeeklyWinners(CONT_OPTS).map(r => r.ticker), ["SQZ", "NONE"]);
        assert.equal(latestDailyDate(), "2026-09-21");
        state.dailyOverride = { ref_date: "2026-09-23", tickers: {} };
        assert.equal(latestDailyDate(), "2026-09-23");
    } finally {
        state.data = savedData;
        state.dailyOverride = savedOverride;
    }
});

// ---------- odświeżanie D1 przez GitHub Actions ----------

test("githubRepoFromLocation reads owner/repo from a GitHub Pages URL", () => {
    assert.deepEqual(githubRepoFromLocation({ hostname: "agnar92.github.io", pathname: "/Momentum/index.html" }),
        { owner: "agnar92", repo: "Momentum" });
    assert.deepEqual(githubRepoFromLocation({ hostname: "localhost", pathname: "/index.html" }),
        { owner: "agnar92", repo: "Momentum" });
});

test("pickDispatchedRun picks the newest run created after the click", () => {
    const since = Date.parse("2026-09-23T18:00:00Z");
    const runs = [
        { id: 1, created_at: "2026-09-23T10:00:00Z" },
        { id: 2, created_at: "2026-09-23T18:00:05Z" },
        { id: 3, created_at: "2026-09-23T18:00:20Z" },
    ];
    assert.equal(pickDispatchedRun(runs, since).id, 3);
    assert.equal(pickDispatchedRun([runs[0]], since), null);
});

test("refreshProgressFromJobs reports queued, running step and final result", () => {
    assert.equal(refreshProgressFromJobs({ jobs: [] }).phase, "queued");
    const running = refreshProgressFromJobs({ jobs: [{ status: "in_progress", html_url: "u", steps: [
        { name: "Set up job", status: "completed" },
        { name: "Pobieranie cen dziennych (Yahoo) i liczenie squeeze D1", status: "in_progress" },
        { name: "Zapis danych", status: "queued" },
    ] }] });
    assert.equal(running.phase, "running");
    assert.equal(running.done, 1);
    assert.equal(running.total, 3);
    assert.match(running.current, /Pobieranie cen/);
    assert.equal(refreshProgressFromJobs({ jobs: [{ status: "completed", conclusion: "success", steps: [] }] }).phase, "success");
    assert.equal(refreshProgressFromJobs({ jobs: [{ status: "completed", conclusion: "failure", steps: [] }] }).phase, "failure");
    assert.equal(refreshStepLabel("Set up job"), "Start maszyny");
    assert.equal(refreshStepLabel("Post Pobranie repozytorium"), "Sprzątanie");
});
