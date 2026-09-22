// Testy dla czystej logiki w docs/js/chart-render.js — silnika wykresu
// stage-analysis wspoldzielonego przez docs/js/app.js (dashboard) i
// docs/js/chart.js (osobna strona pelnoekranowego wykresu, patrz komentarz
// na gorze chart-render.js). Reszta tego pliku (renderRelativeStrengthChart
// i wszystko wokol niego) jest scisle sprzezona z DOM/Chart.js.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    rollingMean, alignMansfieldToDates, alignSqueezeToDates, alignMacdToDates, fmtPlDate,
} = require(path.join("..", "..", "docs", "js", "chart-render.js"));

test("rollingMean averages the trailing window, using a shorter window for the first points", () => {
    const values = [10, 20, 30, 40, 50];
    const out = rollingMean(values, 3);
    assert.deepEqual(out, [10, 15, 20, 30, 40]);
});

test("rollingMean skips null values inside the window instead of propagating null", () => {
    const values = [10, null, 30];
    const out = rollingMean(values, 3);
    assert.deepEqual(out, [10, 10, 20]);
});

test("rollingMean returns null only when every value in the window (so far) is null", () => {
    const values = [null, null, 30];
    const out = rollingMean(values, 3);
    assert.deepEqual(out, [null, null, 30]);
});

test("alignMansfieldToDates pads with null before the Mansfield window's own start date", () => {
    const fullDates = ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22"];
    const mansfieldData = {
        dates: ["2026-01-15", "2026-01-22"], rsm_short: [1, 2], rsm_medium: [10, 20], rsm_long: [100, 200],
    };
    const aligned = alignMansfieldToDates(mansfieldData, fullDates);
    assert.deepEqual(aligned.short, [null, null, 1, 2]);
    assert.deepEqual(aligned.medium, [null, null, 10, 20]);
    assert.deepEqual(aligned.long, [null, null, 100, 200]);
});

test("alignMansfieldToDates returns an all-null series when no Mansfield date matches", () => {
    const fullDates = ["2025-01-01", "2025-01-08"];
    const mansfieldData = { dates: ["2026-01-15"], rsm_short: [1], rsm_medium: [10], rsm_long: [100] };
    const aligned = alignMansfieldToDates(mansfieldData, fullDates);
    assert.deepEqual(aligned.short, [null, null]);
    assert.deepEqual(aligned.medium, [null, null]);
    assert.deepEqual(aligned.long, [null, null]);
});

test("alignMansfieldToDates treats a missing rsm_long (older, not-yet-migrated cache) as all-null, not a crash", () => {
    const fullDates = ["2026-01-01", "2026-01-08"];
    const mansfieldData = { dates: ["2026-01-01", "2026-01-08"], rsm_short: [1, 2], rsm_medium: [10, 20] };
    const aligned = alignMansfieldToDates(mansfieldData, fullDates);
    assert.deepEqual(aligned.long, [null, null]);
});

test("alignSqueezeToDates pads with null before the squeeze window's own start date", () => {
    const fullDates = ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22"];
    const squeezeData = {
        dates: ["2026-01-15", "2026-01-22"],
        histogram: [1, 2], squeeze_on: [true, false], fired: [false, true],
    };
    const aligned = alignSqueezeToDates(squeezeData, fullDates);
    assert.deepEqual(aligned.histogram, [null, null, 1, 2]);
    assert.deepEqual(aligned.squeezeOn, [null, null, true, false]);
    assert.deepEqual(aligned.fired, [null, null, false, true]);
});

test("alignSqueezeToDates returns an all-null series when no squeeze date matches", () => {
    const fullDates = ["2025-01-01", "2025-01-08"];
    const squeezeData = { dates: ["2026-01-15"], histogram: [1], squeeze_on: [true], fired: [false] };
    const aligned = alignSqueezeToDates(squeezeData, fullDates);
    assert.deepEqual(aligned.histogram, [null, null]);
    assert.deepEqual(aligned.squeezeOn, [null, null]);
    assert.deepEqual(aligned.fired, [null, null]);
});

test("alignMacdToDates pads with null before the MACD window's own start date", () => {
    const fullDates = ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22"];
    const macdData = {
        dates: ["2026-01-15", "2026-01-22"], macd: [1, 2], signal: [0.5, 1.5], histogram: [0.5, 0.5],
    };
    const aligned = alignMacdToDates(macdData, fullDates);
    assert.deepEqual(aligned.macd, [null, null, 1, 2]);
    assert.deepEqual(aligned.signal, [null, null, 0.5, 1.5]);
    assert.deepEqual(aligned.histogram, [null, null, 0.5, 0.5]);
});

test("alignMacdToDates returns an all-null series when no MACD date matches", () => {
    const fullDates = ["2025-01-01", "2025-01-08"];
    const macdData = { dates: ["2026-01-15"], macd: [1], signal: [0.5], histogram: [0.5] };
    const aligned = alignMacdToDates(macdData, fullDates);
    assert.deepEqual(aligned.macd, [null, null]);
    assert.deepEqual(aligned.signal, [null, null]);
    assert.deepEqual(aligned.histogram, [null, null]);
});

test("fmtPlDate converts an ISO date to dd.mm.yyyy", () => {
    assert.equal(fmtPlDate("2026-03-09"), "09.03.2026");
    assert.equal(fmtPlDate("2026-12-31"), "31.12.2026");
});
