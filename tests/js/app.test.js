// Testy dla czystej logiki w docs/js/app.js (wyszukiwarka Ctrl+K — reszta
// pliku jest scisle sprzezona z DOM/renderowaniem) oraz dla docs/js/
// minicharts.js (mini-wizualizacje tabel, wspoldzielone przez wszystkie
// strony — wygodnie zaimportowane tu, patrz historia w CLAUDE.md). Wybicie/
// TTM Squeeze/Continuation przeniesione na osobna strone "Sygnaly" — patrz
// tests/js/signals.test.js. findRsEntry przeniesione do js/chart-modal.js —
// patrz tests/js/chart-modal.test.js.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    state, buildSearchIndex, getCmdkIndex,
} = require(path.join("..", "..", "docs", "js", "app.js"));
const {
    sparkPoints, sparkPath, weeklySparkSvg, dailySparkSvg, pullbackHtml,
    rsBarHtml, ttmMiniSvg, miniVisualFields, stageBreakdown,
    zeroLineSparkSvg, crossIndexInTail, findConstituent, bulletHtml,
} = require(path.join("..", "..", "docs", "js", "minicharts.js"));

// compareRows now lives in docs/js/shared.js — see tests/js/shared.test.js.
// rollingMean/alignMansfieldToDates/alignSqueezeToDates/fmtPlDate now live in
// docs/js/chart-render.js — see tests/js/chart-render.test.js.

function emptyStateData() {
    return {
        SP500: { constituents: [] }, NASDAQ100: { constituents: [] }, DOWJONES: { constituents: [] },
        WIG20: { constituents: [] }, MWIG40: { constituents: [] }, SWIG80: { constituents: [] },
    };
}

// buildSearchIndex: od zmiany na zyczenie uzytkownika ("wszystkie spolki z
// SP500, Nasdaq100" do wyszukiwania/wykresow/RSM) czyta all_constituents
// (CALE uniwersum, patrz run_query.py FULL_COVERAGE_UNIVERSES), nie tylko
// constituents (biezacy decyl) — z fallbackiem na constituents dla starszego,
// jeszcze niezmigrowanego JSON-a w cache service workera.

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

// ---------- mini-wizualizacje tabel uniwersów / TTM Squeeze ----------

test("sparkPoints scales a series into the box and keeps null gaps", () => {
    const pts = sparkPoints([0, null, 10], 102, 22, 1);
    assert.deepEqual(pts[0], [1, 21]);
    assert.equal(pts[1], null);
    assert.deepEqual(pts[2], [101, 1]);
    assert.equal(sparkPath(pts), "M1,21M101,1");
    assert.equal(sparkPath(sparkPoints([1, 2, 3], 10, 10, 0)), "M0,10L5,5L10,0");
    assert.deepEqual(sparkPoints([5], 10, 10), []);
});

test("spark SVG helpers render a path, squeeze bars and a placeholder without data", () => {
    assert.match(weeklySparkSvg([0, 3, 6], [0, 1, 2]), /class="spark-up"/);
    assert.match(weeklySparkSvg([6, 3, 0], [2, 1, 0]), /class="spark-down"/);
    assert.match(weeklySparkSvg([], []), /spark-empty/);
    const daily = dailySparkSvg([1, 2, 3, 4], [0, 1, 1, 0]);
    assert.equal((daily.match(/class="spark-sq"/g) || []).length, 2);
    assert.match(dailySparkSvg([], []), /spark-empty/);
    assert.match(dailySparkSvg([1, 2, 3], [0, 0, 1], [1, 1.5, 2]), /class="spark-ema"/);
    assert.doesNotMatch(dailySparkSvg([1, 2, 3], [0, 0, 1]), /spark-ema/);
});

test("pullbackHtml flags price 0-2% above daily EMA20 as a pullback", () => {
    assert.match(pullbackHtml(1.2), /pullback-badge/);
    assert.match(pullbackHtml(0), /pullback-badge/);
    assert.doesNotMatch(pullbackHtml(6), /pullback-badge/);
    assert.match(pullbackHtml(-1.5), /negative/);
    assert.equal(pullbackHtml(null), "—");
});

test("rsBarHtml draws a positive/negative bar around zero and caps extreme values", () => {
    assert.match(rsBarHtml(12.3), /rs-bar-pos/);
    assert.match(rsBarHtml(12.3), /\+12\.3/);
    assert.match(rsBarHtml(-4), /rs-bar-neg/);
    const huge = rsBarHtml(300);
    const width = Number(huge.match(/class="rs-bar-track"\/><rect x="[\d.]+" y="1" width="([\d.]+)"/)[1]);
    assert.equal(width, 32, "capped at half of the 64px bar");
    assert.match(rsBarHtml(null), /spark-empty/);
});

test("ttmMiniSvg colors histogram bars like TradingView and marks squeeze/fire dots", () => {
    const svg = ttmMiniSvg([1, 2, 1.5, -1, -2, -1.5], [true, true, false, false, null, false], [false, false, true, false, false, false]);
    assert.equal((svg.match(/class="ttm-up"/g) || []).length, 2);
    assert.equal((svg.match(/class="ttm-up-fade"/g) || []).length, 1);
    assert.equal((svg.match(/class="ttm-dn"/g) || []).length, 2);
    assert.equal((svg.match(/class="ttm-dn-fade"/g) || []).length, 1);
    assert.equal((svg.match(/ttm-dot-on/g) || []).length, 2);
    assert.equal((svg.match(/ttm-dot-fired/g) || []).length, 1);
    assert.match(ttmMiniSvg([], []), /spark-empty/);
});

test("miniVisualFields takes the last 26 weeks and the latest RS 52W", () => {
    const n = 40;
    const f = miniVisualFields({
        weekly_chart: { close_pct: Array.from({ length: n }, (_, i) => i), ema20_pct: Array.from({ length: n }, (_, i) => i / 2) },
        ttm_squeeze_chart: { histogram: Array(n).fill(1), squeeze_on: Array(n).fill(true), fired: Array(n).fill(false) },
        mansfield_chart: { rsm_long: [1, 2, 7, null] },
    });
    assert.equal(f.mini_closes.length, 26);
    assert.equal(f.mini_closes[25], 39);
    assert.equal(f.rs_long, 7);
    assert.equal(f.mini_sq_flags[0], 1);
    assert.deepEqual(miniVisualFields({}).mini_closes, []);
    assert.equal(miniVisualFields({}).rs_long, null);
});

test("stageBreakdown groups 2A/2B into stage 2 and counts missing stages", () => {
    const b = stageBreakdown([
        { weekly_chart: { current_stage: "2A" } }, { weekly_chart: { current_stage: "2B" } },
        { weekly_chart: { current_stage: "4" } }, {},
    ]);
    assert.equal(b["2"], 2);
    assert.equal(b["4"], 1);
    assert.equal(b.none, 1);
    assert.equal(b.total, 4);
});

test("weeklySparkSvg draws squeeze bars only when a squeeze series is passed", () => {
    assert.equal((weeklySparkSvg([0, 1, 2], [0, 0.5, 1], [0, 1, 1]).match(/spark-sq/g) || []).length, 2);
    assert.doesNotMatch(weeklySparkSvg([0, 1, 2], [0, 0.5, 1]), /spark-sq/);
});

test("zeroLineSparkSvg draws a zero line, colors by the last value and marks a point", () => {
    const up = zeroLineSparkSvg([-2, -1, 1, 2], 2);
    assert.match(up, /spark-zero/);
    assert.match(up, /class="spark-up"/);
    assert.match(up, /spark-mark/);
    assert.match(zeroLineSparkSvg([2, 1, -1]), /class="spark-down"/);
    assert.doesNotMatch(zeroLineSparkSvg([2, 1, -1]), /spark-mark/);
    assert.match(zeroLineSparkSvg([1]), /spark-empty/);
});

test("crossIndexInTail maps a zero-cross 'weeks ago' onto the last n points", () => {
    const arr = [-1, -1, -1, 1, 2, 3, null];   // cross up 3 weeks ago (index 3)
    assert.equal(crossIndexInTail(arr, 3, 5), 1); // tail starts at index 2
    assert.equal(crossIndexInTail(arr, 3, 7), 3);
    assert.equal(crossIndexInTail(arr, 3, 2), null, "cross before the window");
    assert.equal(crossIndexInTail(arr, null, 5), null);
});

test("findConstituent searches all_constituents across universes", () => {
    const data = { A: { all_constituents: [{ ticker: "X" }] }, B: { constituents: [{ ticker: "Y" }] } };
    assert.equal(findConstituent(data, "Y").ticker, "Y");
    assert.equal(findConstituent(data, "Z"), null);
    assert.equal(findConstituent(data, ""), null);
});

test("bulletHtml colors under/at/over target and shows the % of target", () => {
    assert.match(bulletHtml(50, 100), /bullet-under/);
    assert.match(bulletHtml(50, 100), />50%</);
    assert.match(bulletHtml(101, 100), /bullet-ok/);
    assert.match(bulletHtml(150, 100), /bullet-over/);
    assert.match(bulletHtml(80, 0), /poza celem/);
    assert.match(bulletHtml(0, 0), /spark-empty/);
});
