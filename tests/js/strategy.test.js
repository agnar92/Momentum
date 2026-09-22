// Testy dla czystej logiki w docs/js/strategy.js (strategia sektorowa,
// docs/strategy.html) — patrz komentarz na gorze tego pliku.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    squeezeStatusFor, indexTrendFromRows, strongSectorSet, stopPriceFor, squeezeMomentum,
    evaluateCandidate, funnelCounts, positionSize, evaluateHolding, parseTickerList,
} = require(path.join("..", "..", "docs", "js", "strategy.js"));

function ttmChart(rows) {
    // rows: [{squeeze_on, squeeze_count, weeks_since_fire, fire_consolidation_weeks}]
    return {
        dates: rows.map((_, i) => `2026-01-${i + 1}`),
        squeeze_on: rows.map(r => r.squeeze_on),
        squeeze_count: rows.map(r => r.squeeze_count),
        weeks_since_fire: rows.map(r => r.weeks_since_fire),
        fire_consolidation_weeks: rows.map(r => r.fire_consolidation_weeks),
    };
}

test("squeezeStatusFor returns none when there is no ttm_squeeze_chart", () => {
    assert.deepEqual(squeezeStatusFor({}), { status: "none" });
});

test("squeezeStatusFor classifies a fresh breakout as fired", () => {
    const c = { ttm_squeeze_chart: ttmChart([
        { squeeze_on: false, squeeze_count: 0, weeks_since_fire: 2, fire_consolidation_weeks: 8 },
    ]) };
    assert.deepEqual(squeezeStatusFor(c), { status: "fired", weeks: 2 });
});

test("squeezeStatusFor classifies an ongoing long squeeze as consolidating", () => {
    const c = { ttm_squeeze_chart: ttmChart([
        { squeeze_on: true, squeeze_count: 7, weeks_since_fire: null, fire_consolidation_weeks: null },
    ]) };
    assert.deepEqual(squeezeStatusFor(c), { status: "consolidating", weeks: 7 });
});

test("squeezeStatusFor is neutral when neither threshold is met", () => {
    const c = { ttm_squeeze_chart: ttmChart([
        { squeeze_on: true, squeeze_count: 2, weeks_since_fire: null, fire_consolidation_weeks: null },
    ]) };
    assert.deepEqual(squeezeStatusFor(c), { status: "neutral" });
});

test("squeezeStatusFor walks back past a not-yet-computed last week", () => {
    const c = { ttm_squeeze_chart: ttmChart([
        { squeeze_on: true, squeeze_count: 9, weeks_since_fire: null, fire_consolidation_weeks: null },
        { squeeze_on: null, squeeze_count: null, weeks_since_fire: null, fire_consolidation_weeks: null },
    ]) };
    assert.deepEqual(squeezeStatusFor(c), { status: "consolidating", weeks: 9 });
});

// ------------------------------------------------------------
// Lejek Stage 2 Continuation
// ------------------------------------------------------------

// Spolka w Etapie 2B, RS > 0, squeeze odpalil 1 tydz. temu po 8 tyg. konsolidacji,
// histogram dodatni i rosnacy; cena 110, close_pct liczony od close0 = 100, stop 90.
function stock(overrides = {}) {
    const base = {
        ticker: "AAA", universe: "SP500", sector: "Information Technology", price: 110, momentum_score: 1.5,
        weekly_chart: {
            dates: ["w1", "w2", "w3"], close_pct: [0, 5, 10], stop_level_pct: [-15, -12, -10],
            base_count: [1, 1, 2], current_stage: "2B", buying_volume_ratio: [1.0, 1.4, 0.9],
            signal: [null, null, null], index_pct: [0, 1, 2],
        },
        mansfield_chart: { rsm_medium: [3, 4, 5], rsm_long: [2, 2, null] },
        ttm_squeeze_chart: ttmChart([
            { squeeze_on: true, squeeze_count: 8, weeks_since_fire: null, fire_consolidation_weeks: null },
            { squeeze_on: false, squeeze_count: 0, weeks_since_fire: 0, fire_consolidation_weeks: 8 },
            { squeeze_on: false, squeeze_count: 0, weeks_since_fire: 1, fire_consolidation_weeks: 8 },
        ]),
    };
    base.ttm_squeeze_chart.histogram = [-1, 2, 3];
    return Object.assign(base, overrides);
}

const usaCtx = (extra = {}) => Object.assign({
    marketOk: true, strongSectors: new Set(["Information Technology"]), topRsTickers: new Set(),
    sp500Sectors: { AAA: "Information Technology" },
}, extra);

test("stopPriceFor converts stop_level_pct back to a price via the close_pct base", () => {
    // close0 = 110 / 1.10 = 100, stop = 100 * 0.90 = 90
    assert.ok(Math.abs(stopPriceFor(stock()) - 90) < 1e-9);
});

test("stopPriceFor returns null when the latest week has no stop (e.g. right after EXIT_STOP)", () => {
    const c = stock();
    c.weekly_chart.stop_level_pct = [-15, -12, null];
    assert.equal(stopPriceFor(c), null);
});

test("squeezeMomentum reports the latest histogram value and whether it is rising", () => {
    assert.deepEqual(squeezeMomentum(stock()), { value: 3, rising: true });
});

test("evaluateCandidate flags a fired squeeze in Stage 2 with rising momentum as ENTRY", () => {
    const e = evaluateCandidate(stock(), usaCtx());
    assert.equal(e.passes, true);
    assert.equal(e.status, "ENTRY");
    assert.equal(e.volumeConfirmed, true); // 1.4x w oknie ostatnich tygodni
});

test("evaluateCandidate downgrades ENTRY to WAIT_MARKET when the market filter is off", () => {
    assert.equal(evaluateCandidate(stock(), usaCtx({ marketOk: false })).status, "WAIT_MARKET");
});

test("evaluateCandidate marks an ongoing long squeeze as SETUP", () => {
    const c = stock({ ttm_squeeze_chart: ttmChart([
        { squeeze_on: true, squeeze_count: 7, weeks_since_fire: null, fire_consolidation_weeks: null },
    ]) });
    assert.equal(evaluateCandidate(c, usaCtx()).status, "SETUP");
});

test("evaluateCandidate does not enter when momentum histogram is falling", () => {
    const c = stock();
    c.ttm_squeeze_chart.histogram = [-1, 3, 2];
    assert.equal(evaluateCandidate(c, usaCtx()).status, "WATCH");
});

test("evaluateCandidate rejects non-Stage-2, negative RS, late bases and weak sectors", () => {
    const stage3 = stock(); stage3.weekly_chart.current_stage = "3";
    assert.equal(evaluateCandidate(stage3, usaCtx()).gates.stage, false);

    const weakRs = stock({ mansfield_chart: { rsm_medium: [1, -2], rsm_long: [1, 1] } });
    assert.equal(evaluateCandidate(weakRs, usaCtx()).gates.rs, false);

    const late = stock(); late.weekly_chart.base_count = [3, 4, 4];
    const lateEval = evaluateCandidate(late, usaCtx());
    assert.equal(lateEval.gates.base, false);
    assert.equal(lateEval.status, null);

    const otherSector = evaluateCandidate(stock(), usaCtx({ strongSectors: new Set(["Energy"]) }));
    assert.equal(otherSector.gates.sector, false);
});

test("evaluateCandidate lets top-RS names and non-SP500 names through the sector gate", () => {
    const ctx = usaCtx({ strongSectors: new Set(["Energy"]), topRsTickers: new Set(["AAA"]) });
    assert.equal(evaluateCandidate(stock(), ctx).gates.sector, true);
    const nasdaqOnly = stock({ ticker: "NDQ", universe: "NASDAQ100" });
    assert.equal(evaluateCandidate(nasdaqOnly, usaCtx({ strongSectors: new Set(["Energy"]) })).gates.sector, true);
});

test("evaluateCandidate skips the sector gate when strongSectors is null (PL)", () => {
    const c = stock({ universe: "WIG20", sector: "Unknown" });
    assert.equal(evaluateCandidate(c, { marketOk: true, strongSectors: null, topRsTickers: new Set(), sp500Sectors: null }).passes, true);
});

test("funnelCounts narrows step by step", () => {
    const pass = evaluateCandidate(stock(), usaCtx());
    const s3 = stock({ ticker: "BBB" }); s3.weekly_chart.current_stage = "3";
    const fail = evaluateCandidate(s3, usaCtx());
    const counts = funnelCounts([pass, fail]);
    assert.equal(counts.universe, 2);
    assert.equal(counts.stage, 1);
    assert.equal(counts.sector, 1);
    assert.equal(counts.entry, 1);
    assert.equal(counts.setup, 0);
});

test("positionSize risks 1% of capital against the stop distance", () => {
    // ryzyko 1000, na akcje 10 -> 100 akcji po 110 = 11000 > 10% (10000) -> limit 90 akcji
    const s = positionSize({ price: 110, stop: 100, capital: 100000 });
    assert.equal(s.shares, 90);
    assert.equal(s.cappedByMax, true);
    assert.equal(s.risk, 900);
    const wide = positionSize({ price: 110, stop: 60, capital: 100000 });
    assert.equal(wide.shares, 20); // 1000 / 50
    assert.equal(wide.cappedByMax, false);
});

test("positionSize returns null without capital or with a stop above price", () => {
    assert.equal(positionSize({ price: 110, stop: 100, capital: null }), null);
    assert.equal(positionSize({ price: 110, stop: 120, capital: 100000 }), null);
});

test("evaluateHolding exits on Stage 4, stop hit or negative RS, warns on MA slowdown", () => {
    assert.equal(evaluateHolding(stock()).action, "HOLD");

    const below = stock({ price: 80 }); // close0 = 80/1.1, stop ~65 — dalej HOLD
    assert.equal(evaluateHolding(below).action, "HOLD");
    const hit = stock(); hit.weekly_chart.stop_level_pct = [0, 0, 20]; // stop 120 > cena 110
    assert.equal(evaluateHolding(hit).action, "EXIT");

    const s4 = stock(); s4.weekly_chart.current_stage = "4";
    assert.deepEqual(evaluateHolding(s4).reasons, ["Etap 4"]);

    const weak = stock({ mansfield_chart: { rsm_medium: [-1] } });
    assert.equal(evaluateHolding(weak).action, "EXIT");

    const slowing = stock(); slowing.weekly_chart.signal = [null, "WARNING_MA_SLOWING", null];
    assert.equal(evaluateHolding(slowing).action, "TIGHTEN");

    assert.equal(evaluateHolding(null).action, "NO_DATA");
});

test("indexTrendFromRows compares the synthetic index to its N-week SMA", () => {
    const rows = [{ weekly_chart: { dates: ["a", "b", "c", "d"], index_pct: [0, 2, 4, 10] } }];
    const t = indexTrendFromRows(rows, 3);
    assert.equal(t.level, 110);
    assert.ok(Math.abs(t.sma - (102 + 104 + 110) / 3) < 1e-9);
    assert.equal(t.above, true);
    assert.equal(indexTrendFromRows(rows, 10), null);
});

test("strongSectorSet keeps top sectors with positive RS and ETF data only", () => {
    const set = strongSectorSet({ sectors: [
        { sector: "A", rsm_vs_index_pct: 5, data_source: "etf" },
        { sector: "B", rsm_vs_index_pct: null, data_source: "no_data" },
        { sector: "C", rsm_vs_index_pct: 2, data_source: "etf" },
        { sector: "D", rsm_vs_index_pct: 1, data_source: "etf" },
        { sector: "E", rsm_vs_index_pct: 0.5, data_source: "etf" },
    ] });
    assert.deepEqual([...set], ["A", "C", "D"]);
    assert.equal(strongSectorSet({ sectors: [{ sector: "X", rsm_vs_index_pct: -1, data_source: "etf" }] }).size, 0);
});

test("parseTickerList splits, uppercases and dedupes", () => {
    assert.deepEqual(parseTickerList(" mu, AMD;nvda  mu\n"), ["MU", "AMD", "NVDA"]);
    assert.deepEqual(parseTickerList(""), []);
});
