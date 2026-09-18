// Testy dla czystej logiki w docs/js/strategy.js (strategia sektorowa,
// docs/strategy.html) — patrz komentarz na gorze tego pliku.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { squeezeStatusFor } = require(path.join("..", "..", "docs", "js", "strategy.js"));

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
