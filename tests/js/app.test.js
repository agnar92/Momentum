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
    squeezeCyclePosition, squeezeConsolidationBox, breakoutLevelFor,
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

// ---------- breakoutLevelFor (poziom "do obserwowania" na wykresie 1-min./w tabeli Qullamaggie) ----------

test("breakoutLevelFor converts pending_base close0-relative % to a real price, preferring it over bases", () => {
    const c = {
        price: 110,
        weekly_chart: {
            close_pct: [0, 10],  // ostatnia wartosc: cena wzrosla 10% od close0 -> close0 = 110/1.10 = 100
            pending_base: { resistance_pct: 20, support_pct: 10, start_date: "2026-01-05", phase: "BOXED" },
            bases: [{ resistance_pct: 5, support_pct: 0, start_date: "2025-12-01" }],
        },
    };
    const lvl = breakoutLevelFor(c);
    assert.ok(lvl);
    assert.equal(lvl.pending, true);
    assert.equal(lvl.phase, "BOXED");
    assert.equal(lvl.startDate, "2026-01-05");
    assert.ok(Math.abs(lvl.resistance - 120) < 0.01, `expected ~120, got ${lvl.resistance}`);
    assert.ok(Math.abs(lvl.support - 110) < 0.01, `expected ~110, got ${lvl.support}`);
});

test("breakoutLevelFor falls back to the last consumed base when there is no pending box", () => {
    const c = {
        price: 100,
        weekly_chart: {
            close_pct: [0],  // close0 = price = 100
            pending_base: null,
            bases: [
                { resistance_pct: 5, support_pct: 0, start_date: "2025-12-01" },
                { resistance_pct: 10, support_pct: 5, start_date: "2026-01-05" },
            ],
        },
    };
    const lvl = breakoutLevelFor(c);
    assert.ok(lvl);
    assert.equal(lvl.pending, false);
    assert.equal(lvl.startDate, "2026-01-05");  // ostatnia baza, nie pierwsza
    assert.ok(Math.abs(lvl.resistance - 110) < 0.01);
});

test("breakoutLevelFor returns null with no base data, no price, or no weekly_chart", () => {
    assert.equal(breakoutLevelFor({ price: 100, weekly_chart: { close_pct: [0], pending_base: null, bases: [] } }), null);
    assert.equal(breakoutLevelFor({ price: 0, weekly_chart: { close_pct: [0], pending_base: { resistance_pct: 5 } } }), null);
    assert.equal(breakoutLevelFor({ price: 100 }), null);
    assert.equal(breakoutLevelFor(null), null);
});

// ---------- squeezeConsolidationBox (top/bottom drawn from the TTM squeeze's OWN window, not the independent Darvas box) ----------

test("squeezeConsolidationBox takes top/bottom from the same weeks the TTM squeeze itself is flagging as consolidating", () => {
    const dates = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02"];
    const c = {
        weekly_chart: { dates, close_pct: [0, 5, 3, 8, 0] },
        ttm_squeeze_chart: {
            dates,
            squeeze_on: [false, true, true, true, true],
            squeeze_count: [0, 1, 2, 3, 4],
            weeks_since_fire: [null, null, null, null, null],
            fire_consolidation_weeks: [null, null, null, null, null],
        },
    };
    const box = squeezeConsolidationBox(c);
    assert.ok(box);
    assert.equal(box.resistance_pct, 8);
    assert.equal(box.support_pct, 0);
    assert.equal(box.start_date, "2026-01-12");  // pierwszy tydzień squeeze'a (squeeze_count=1), nie cała historia
    assert.equal(box.pending, true);
    assert.equal(box.phase, "SQUEEZE");
});

test("squeezeConsolidationBox takes the window BEFORE the fire week when the squeeze just turned off", () => {
    const dates = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02", "2026-02-09"];
    const c = {
        weekly_chart: { dates, close_pct: [0, 4, 9, 2, 6, 15] },
        ttm_squeeze_chart: {
            dates,
            squeeze_on: [false, true, true, true, true, false],
            squeeze_count: [0, 1, 2, 3, 4, 0],  // dokladnie minWeeks (4) tuz przed wybiciem -> box istnial
            weeks_since_fire: [null, null, null, null, null, 0],
            fire_consolidation_weeks: [null, null, null, null, null, 4],
        },
    };
    const box = squeezeConsolidationBox(c);
    assert.ok(box);
    // Konsolidacja to 4 tygodnie TUŻ PRZED tygodniem wybicia (2026-02-09), czyli
    // 2026-01-12..2026-02-02 — NIE zawiera tygodnia wybicia samego (close_pct=15).
    assert.equal(box.resistance_pct, 9);
    assert.equal(box.support_pct, 2);
    assert.equal(box.start_date, "2026-01-12");
    assert.equal(box.pending, false);
    assert.equal(box.phase, "FIRED");
});

test("squeezeConsolidationBox returns null for a fire after a consolidation shorter than minWeeks", () => {
    // Wybicie po zaledwie 3 tygodniach squeeze'a — box nigdy nie zdazyl sie
    // otworzyc (potrzeba minWeeks=4), wiec nie ma czego pokazac.
    const dates = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"];
    const c = {
        weekly_chart: { dates, close_pct: [0, 4, 9, 15] },
        ttm_squeeze_chart: {
            dates,
            squeeze_on: [false, true, true, false],
            squeeze_count: [0, 1, 2, 0],
            weeks_since_fire: [null, null, null, 0],
            fire_consolidation_weeks: [null, null, null, 2],
        },
    };
    assert.equal(squeezeConsolidationBox(c), null);
});

test("squeezeCyclePosition opens the box at minWeeks, extends it, then resets for a NEW cycle past maxWeeks", () => {
    // minWeeks=4, maxWeeks=6 (domyslne): tyg. 1-3 = brak boxa, tyg. 4-6 = box
    // (pozycja rownolegla dlugosci), tyg. 7-9 (cykl 2) = znowu brak boxa, tyg.
    // 10 = nowy box (pozycja 4 w cyklu 2) — dokladnie "if there is still
    // squeeze monitor new 4 weeks" z prosby uzytkownika.
    assert.equal(squeezeCyclePosition(1), null);
    assert.equal(squeezeCyclePosition(3), null);
    assert.equal(squeezeCyclePosition(4), 4);
    assert.equal(squeezeCyclePosition(5), 5);
    assert.equal(squeezeCyclePosition(6), 6);
    assert.equal(squeezeCyclePosition(7), null);   // cykl 2, pozycja 1 — box jeszcze zamkniety
    assert.equal(squeezeCyclePosition(8), null);   // cykl 2, pozycja 2
    assert.equal(squeezeCyclePosition(9), null);   // cykl 2, pozycja 3
    assert.equal(squeezeCyclePosition(10), 4);     // cykl 2, pozycja 4 — nowy box otwarty
    assert.equal(squeezeCyclePosition(12), 6);     // cykl 2, pozycja 6
    assert.equal(squeezeCyclePosition(13), null);  // cykl 3, pozycja 1
});

test("squeezeCyclePosition respects custom min/max windows", () => {
    assert.equal(squeezeCyclePosition(2, 2, 3), 2);
    assert.equal(squeezeCyclePosition(4, 2, 3), null);  // cykl 2, pozycja 1
    assert.equal(squeezeCyclePosition(5, 2, 3), 2);      // cykl 2, pozycja 2
});

test("squeezeConsolidationBox uses only the CURRENT cycle's weeks for a long-running squeeze, not the whole history", () => {
    // 10 tygodni squeeze'a nieprzerwanie: cykl 1 = tyg. 1-6, cykl 2 = tyg. 7-10
    // (pozycja 4, box wlasnie sie otworzyl). Box MUSI brac tylko tyg. 7-10 —
    // gdyby brac cala historie (stara wersja), zlapalby tez ekstremalne
    // wartosci z tyg. 1-6 ponizej/powyzej.
    const dates = Array.from({ length: 10 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
    const closePct = [100, -100, 50, -50, 80, -80, 3, 9, 2, 15];  // tyg. 1-6 ekstremalne, tyg. 7-10 umiarkowane
    const c = {
        weekly_chart: { dates, close_pct: closePct },
        ttm_squeeze_chart: {
            dates,
            squeeze_on: new Array(10).fill(true),
            squeeze_count: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            weeks_since_fire: new Array(10).fill(null),
            fire_consolidation_weeks: new Array(10).fill(null),
        },
    };
    const box = squeezeConsolidationBox(c);
    assert.ok(box);
    // Okno tyg. 7-10 (indeksy 6-9): close_pct = [3, 9, 2, 15] -> max 15, min 2.
    assert.equal(box.resistance_pct, 15);
    assert.equal(box.support_pct, 2);
    assert.equal(box.start_date, dates[6]);  // tydz. 7, poczatek cyklu 2 — NIE tydz. 1
});

test("squeezeConsolidationBox returns null mid-way through a new cycle's waiting period, even though the squeeze is ongoing", () => {
    // 8 tygodni nieprzerwanego squeeze'a = cykl 2, pozycja 2 (< minWeeks) —
    // box jeszcze nie istnieje w tym cyklu, mimo ze squeeze trwa od dawna.
    const dates = Array.from({ length: 8 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
    const c = {
        weekly_chart: { dates, close_pct: new Array(8).fill(0) },
        ttm_squeeze_chart: {
            dates,
            squeeze_on: new Array(8).fill(true),
            squeeze_count: [1, 2, 3, 4, 5, 6, 7, 8],
            weeks_since_fire: new Array(8).fill(null),
            fire_consolidation_weeks: new Array(8).fill(null),
        },
    };
    assert.equal(squeezeConsolidationBox(c), null);
});

test("squeezeConsolidationBox returns null for a fire that happened in a between-cycles gap", () => {
    // Wybicie po 13 tygodniach konsolidacji: cykl 3, pozycja 1 (< minWeeks) —
    // do wybicia doszlo zanim jakikolwiek box w tym cyklu zdazyl sie otworzyc.
    const dates = Array.from({ length: 14 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
    const c = {
        weekly_chart: { dates, close_pct: new Array(14).fill(0) },
        ttm_squeeze_chart: {
            dates,
            squeeze_on: [...new Array(13).fill(true), false],
            squeeze_count: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 0],
            weeks_since_fire: [...new Array(13).fill(null), 0],
            fire_consolidation_weeks: [...new Array(13).fill(null), 13],
        },
    };
    assert.equal(squeezeConsolidationBox(c), null);
});

test("squeezeConsolidationBox returns null without an active or just-fired squeeze", () => {
    const dates = ["2026-01-05", "2026-01-12"];
    const c = {
        weekly_chart: { dates, close_pct: [0, 4] },
        ttm_squeeze_chart: {
            dates, squeeze_on: [false, false], squeeze_count: [0, 0],
            weeks_since_fire: [null, null], fire_consolidation_weeks: [null, null],
        },
    };
    assert.equal(squeezeConsolidationBox(c), null);
    assert.equal(squeezeConsolidationBox({ weekly_chart: { dates, close_pct: [0, 4] } }), null);  // brak ttm_squeeze_chart
});

test("breakoutLevelFor prefers the squeeze-detected box over the independent Darvas pending_base", () => {
    const dates = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02"];
    const c = {
        price: 106,
        weekly_chart: {
            dates, close_pct: [0, 4, 8, 4, 6],
            // Pudełko Darvasa (niezależny mechanizm) celowo bardzo inne — nie
            // powinno w ogóle zostać użyte, skoro squeeze sam już wskazuje okno.
            pending_base: { resistance_pct: 50, support_pct: 40, start_date: "1999-01-01", phase: "BOXED" },
        },
        ttm_squeeze_chart: {
            dates,
            squeeze_on: [false, true, true, true, true],
            squeeze_count: [0, 1, 2, 3, 4],  // dokladnie 4 tyg. -> box wlasnie sie otworzyl (cykl 1)
            weeks_since_fire: [null, null, null, null, null],
            fire_consolidation_weeks: [null, null, null, null, null],
        },
    };
    const lvl = breakoutLevelFor(c);
    assert.ok(lvl);
    // close0 = 106 / 1.06 = 100; okno boxa (tyg. 2-5, cykl 1) ma close_pct [4, 8, 4, 6].
    assert.ok(Math.abs(lvl.resistance - 108) < 0.01, `expected ~108, got ${lvl.resistance}`);
    assert.ok(Math.abs(lvl.support - 104) < 0.01, `expected ~104, got ${lvl.support}`);
    assert.equal(lvl.pending, true);
});
