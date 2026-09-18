// Testy dla czystej logiki w docs/js/app.js (RSM/TTM Squeeze screener +
// wyszukiwarka Ctrl+K — reszta pliku jest scisle sprzezona z DOM/renderowaniem).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    classifyRsm, combinedRsmCandidates, classifyTtmSqueeze, combinedTtmSqueezeCandidates, state,
    findRsEntry, buildSearchIndex, getCmdkIndex,
} = require(path.join("..", "..", "docs", "js", "app.js"));

// compareRows now lives in docs/js/shared.js — see tests/js/shared.test.js.
// rollingMean/alignMansfieldToDates/alignSqueezeToDates/fmtPlDate now live in
// docs/js/chart-render.js — see tests/js/chart-render.test.js.

// ---------- classifyRsm / combinedRsmCandidates (RSM screener) ----------

const RSM_DATES = ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22", "2026-01-29", "2026-02-05"];

test("classifyRsm returns null when the ticker has no mansfield_chart", () => {
    assert.equal(classifyRsm("AAA", "NASDAQ100", {}), null);
});

test("classifyRsm returns null when every week's values are null", () => {
    const c = { mansfield_chart: { dates: ["2026-01-01"], rsm_short: [null], rsm_medium: [null] } };
    assert.equal(classifyRsm("AAA", "NASDAQ100", c), null);
});

test("classifyRsm falls back to the latest week that actually has both values when the newest week is still null", () => {
    // Ostatni (najswiezszy) tydzien czesto wychodzi null, zanim run_query.py
    // dolicza pelne dane dla niego — bez fallbacku spolka znikalaby z ekranu
    // mimo ze poprzedni tydzien ma kwalifikujace sie dane.
    const dates = [...RSM_DATES, "2026-02-12"];
    const c = {
        sector: "Tech", price: 100,
        mansfield_chart: {
            dates,
            rsm_short: [1, 1, 1, 1, 1, 2, null],
            rsm_medium: [3, 4, 5, 6, 7, 8, null],
        },
    };
    const r = classifyRsm("AAA", "NASDAQ100", c);
    assert.equal(r.shortNow, 2);
    assert.equal(r.mediumNow, 8);
    assert.equal(r.isStable, true);
});

test("classifyRsm marks stable growth when 6M leads 3M and is positive", () => {
    const c = {
        sector: "Tech", price: 100,
        mansfield_chart: { dates: RSM_DATES, rsm_short: [1, 1, 1, 1, 1, 2], rsm_medium: [3, 4, 5, 6, 7, 8] },
    };
    const r = classifyRsm("AAA", "NASDAQ100", c);
    assert.equal(r.isStable, true);
    assert.equal(r.isAccelerating, false);
    assert.equal(r.shortNow, 2);
    assert.equal(r.mediumNow, 8);
});

test("classifyRsm marks a sudden trend change when 3M overtakes 6M and both are rising", () => {
    const c = {
        mansfield_chart: { dates: RSM_DATES, rsm_short: [1, 2, 4, 7, 10, 15], rsm_medium: [1, 1.5, 2, 2.5, 3, 3.5] },
    };
    const r = classifyRsm("AAA", "NASDAQ100", c);
    assert.equal(r.isAccelerating, true);
    assert.equal(r.isStable, false);
    assert.equal(r.trend, "rising");
});

test("classifyRsm leaves a ticker unclassified (neither bucket) when 3M leads but neither is rising", () => {
    const c = {
        mansfield_chart: { dates: RSM_DATES, rsm_short: [5, 5, 5, 5, 5, 5], rsm_medium: [1, 1, 1, 1, 1, 1] },
    };
    const r = classifyRsm("AAA", "NASDAQ100", c);
    assert.equal(r.isStable, false);
    assert.equal(r.isAccelerating, false);
    assert.equal(r.trend, "mixed");
});

test("classifyRsm flags a fresh cross above zero within the lookback window", () => {
    const c = {
        mansfield_chart: {
            dates: RSM_DATES,
            rsm_short: [-2, -1, -0.5, 0.2, 0.8, 1.5],  // crosses zero, rising
            rsm_medium: [-1, -1, -1, -1, -1, -2],       // still negative and NOT rising
        },
    };
    const r = classifyRsm("AAA", "NASDAQ100", c);
    assert.equal(r.trend, "fresh_cross");
    assert.equal(r.isStable, false);       // medium still negative
    assert.equal(r.isAccelerating, false); // not both rising
});

function emptyStateData() {
    return {
        SP500: { constituents: [] }, NASDAQ100: { constituents: [] }, DOWJONES: { constituents: [] },
        WIG20: { constituents: [] }, MWIG40: { constituents: [] },
    };
}

test("combinedRsmCandidates merges qualifying tickers across all universes into stable/accelerating buckets", () => {
    state.data = emptyStateData();
    state.data.NASDAQ100.constituents = [
        { ticker: "STABLE1", sector: "Tech", price: 100, mansfield_chart: { dates: RSM_DATES, rsm_short: [1, 1, 1, 1, 1, 2], rsm_medium: [3, 4, 5, 6, 7, 8] } },
        { ticker: "NOPE", sector: "Tech", price: 50, mansfield_chart: { dates: RSM_DATES, rsm_short: [5, 5, 5, 5, 5, 5], rsm_medium: [1, 1, 1, 1, 1, 1] } },
    ];
    state.data.WIG20.constituents = [
        { ticker: "ACCEL1", sector: "Energy", price: 40, mansfield_chart: { dates: RSM_DATES, rsm_short: [1, 2, 4, 7, 10, 15], rsm_medium: [1, 1.5, 2, 2.5, 3, 3.5] } },
    ];

    const { stable, accelerating } = combinedRsmCandidates();
    assert.deepEqual(stable.map(r => r.ticker), ["STABLE1"]);
    assert.deepEqual(accelerating.map(r => r.ticker), ["ACCEL1"]);
    assert.equal(stable[0].universe, "NASDAQ100");
    assert.equal(accelerating[0].universe, "WIG20");
});

test("combinedRsmCandidates sorts the stable bucket by 6M descending", () => {
    state.data = emptyStateData();
    state.data.SP500.constituents = [
        { ticker: "LOW", mansfield_chart: { dates: RSM_DATES, rsm_short: [1, 1, 1, 1, 1, 1], rsm_medium: [2, 2, 2, 2, 2, 3] } },
        { ticker: "HIGH", mansfield_chart: { dates: RSM_DATES, rsm_short: [1, 1, 1, 1, 1, 1], rsm_medium: [5, 5, 5, 5, 5, 9] } },
    ];
    const { stable } = combinedRsmCandidates();
    assert.deepEqual(stable.map(r => r.ticker), ["HIGH", "LOW"]);
});

test("combinedRsmCandidates sorts the accelerating bucket by 3M descending", () => {
    state.data = emptyStateData();
    state.data.DOWJONES.constituents = [
        { ticker: "MILD", mansfield_chart: { dates: RSM_DATES, rsm_short: [1, 2, 3, 4, 5, 6], rsm_medium: [1, 1.1, 1.2, 1.3, 1.4, 1.5] } },
        { ticker: "HOT", mansfield_chart: { dates: RSM_DATES, rsm_short: [1, 3, 6, 9, 12, 15], rsm_medium: [1, 1.1, 1.2, 1.3, 1.4, 1.5] } },
    ];
    const { accelerating } = combinedRsmCandidates();
    assert.deepEqual(accelerating.map(r => r.ticker), ["HOT", "MILD"]);
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
