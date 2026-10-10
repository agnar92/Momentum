// Testy czystej logiki docs/js/watchlist.js (zakładki listy obserwowanej).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    qullamaggieRows, upsideMain, targetMain, recomLabel, fillTargets, mergePrefs, prefsNormalize, applyCommonFilters, scoreInRange, ratingChips, baseBoxData, positionSize, fmtShares, stopRuleCheck, positionMetrics, tagPositions, positionRows, positionTotals, breakoutInfo, tagBreakouts, readinessLine, swipeDirection, marketLines, MARKET_LABELS, ratingClass, decorateCell, githubActionsUrl, sortRows,
    fmtMarketCap, fmtVolume, fmtPct,
} = require(path.join("..", "..", "docs", "js", "watchlist.js"));

function stock(ticker, over = {}) {
    return {
        ticker, company: `${ticker} Inc`, sector: "Tech", price: 100, rs_rating: 50, rs_score: 0.5,
        adr_pct: 6, dollar_volume_avg: 50e6,
        low_ratio_1m: 1.05, low_ratio_3m: 1.12, low_ratio_6m: 1.4,
        ema34_rising: false, ...over,
    };
}

test("qullamaggieRows: liquidity thresholds, then union of top X% per 1/3/6M window without duplicates", () => {
    const mk = (t, g1, g3, g6, over = {}) => stock(t, {
        low_ratio_1m: g1, low_ratio_3m: g3, low_ratio_6m: g6, ...over,
    });
    const filler = ["E", "F", "G", "H", "I", "J", "K"].map(t => mk(t, 1.01, 1.01, 1.01));
    const stocks = [
        mk("A", 1.9, 1.05, 1.05), mk("B", 1.05, 1.9, 1.05), mk("C", 1.05, 1.05, 1.9),
        mk("LOWVOL", 9.9, 9.9, 9.9, { dollar_volume_avg: 1e6 }),
        mk("LOWADR", 9.9, 9.9, 9.9, { adr_pct: 2 }),
        mk("MISSING", 9.9, 9.9, 9.9, { adr_pct: null }),
        ...filler,
    ];
    const params = { minDollarVolumeM: 20, minAdrPct: 5, topPct: 10 };
    const rows = qullamaggieRows(stocks, params);
    // 10 płynnych spółek, top 10% = 1 na okno => A (1M), B (3M), C (6M)
    assert.deepEqual(rows.map(r => r.ticker).sort(), ["A", "B", "C"]);
    assert.deepEqual(rows.find(r => r.ticker === "A").windows.map(w => w.label), ["1M"]);
    assert.equal(rows.find(r => r.ticker === "A").max_ratio, 1.9);

    // ta sama spółka liderem w kilku oknach => jeden wiersz z kilkoma oknami
    stocks[0] = mk("A", 1.9, 1.95, 1.05);
    const merged = qullamaggieRows(stocks, params);
    assert.equal(merged.filter(r => r.ticker === "A").length, 1);
    assert.deepEqual(merged.find(r => r.ticker === "A").windows.map(w => w.label), ["1M", "3M"]);
    assert.equal(merged.find(r => r.ticker === "A").max_ratio, 1.95);
});

test("qullamaggieRows: empty input and zero topPct give an empty list", () => {
    assert.deepEqual(qullamaggieRows([], { minDollarVolumeM: 0, minAdrPct: 0, topPct: 10 }), []);
    assert.deepEqual(qullamaggieRows([stock("A")], { minDollarVolumeM: 0, minAdrPct: 0, topPct: 0 }), []);
});

test("fillTargets adds min/max from estimates", () => {
    const stocks = [stock("A", { pt_mean: 120 }), stock("B", { pt_low: 5, pt_high: 9 })];
    fillTargets(stocks, { A: { pt: { low: 90, high: 150 } }, B: { pt: { low: 1, high: 2 } } });
    assert.equal(stocks[0].pt_low, 90);
    assert.equal(stocks[0].pt_high, 150);
    assert.equal(stocks[1].pt_low, 5);
});

test("applyCommonFilters matches ticker or company text and sector", () => {
    const stocks = [stock("AAPL", { company: "Apple Inc" }), stock("MSFT", { company: "Microsoft", sector: "Soft" })];
    assert.deepEqual(applyCommonFilters(stocks, "app", "").map(s => s.ticker), ["AAPL"]);
    assert.deepEqual(applyCommonFilters(stocks, "micro", "").map(s => s.ticker), ["MSFT"]);
    assert.deepEqual(applyCommonFilters(stocks, "", "Soft").map(s => s.ticker), ["MSFT"]);
    assert.equal(applyCommonFilters(stocks, "", "").length, 2);
});

test("sortRows puts empty values last in both directions", () => {
    const rows = [stock("A", { rs_rating: null }), stock("B", { rs_rating: 10 }), stock("C", { rs_rating: 30 })];
    assert.deepEqual(sortRows(rows, "rs_rating", "desc").map(r => r.ticker), ["C", "B", "A"]);
    assert.deepEqual(sortRows(rows, "rs_rating", "asc").map(r => r.ticker), ["B", "C", "A"]);
});

test("githubActionsUrl derives owner/repo from GitHub Pages and falls back otherwise", () => {
    assert.equal(githubActionsUrl({ hostname: "agnar92.github.io", pathname: "/Momentum/index.html" }),
        "https://github.com/agnar92/Momentum/actions/workflows/daily_watchlist.yml");
    assert.equal(githubActionsUrl({ hostname: "localhost", pathname: "/" }),
        "https://github.com/agnar92/Momentum/actions/workflows/daily_watchlist.yml");
});

test("formatters", () => {
    assert.equal(fmtMarketCap(47.26e9), "47.3 mld");
    assert.equal(fmtMarketCap(2.5e12), "2.50 bln");
    assert.equal(fmtMarketCap(null), "—");
    assert.equal(fmtVolume(396e6), "396.0 mln");
    assert.equal(fmtPct(5.123), "+5.1%");
    assert.equal(fmtPct(-2), "-2.0%");
    assert.equal(fmtPct(undefined), "—");
});

test("baseRows: dystans do pivotu, VCP i sortowanie", () => {
    const { baseRows } = require("../../docs/js/watchlist.js");
    const stocks = [
        { ticker: "A", base_type: "cup", pct_to_pivot: 8, vcp: false },
        { ticker: "B", base_type: "flat", pct_to_pivot: 2, vcp: true },
        { ticker: "C", base_type: "deep", pct_to_pivot: 30, vcp: true },
        { ticker: "D", base_type: null, pct_to_pivot: null },
    ];
    assert.deepStrictEqual(baseRows(stocks, { maxDistPct: 10, vcpOnly: false }).map(s => s.ticker), ["B", "A"]);
    assert.deepStrictEqual(baseRows(stocks, { maxDistPct: 50, vcpOnly: true }).map(s => s.ticker), ["B", "C"]);
});

test("earningsInDays: parsuje daty Finviz", () => {
    const { earningsInDays } = require("../../docs/js/watchlist.js");
    const now = new Date(2026, 9, 1);
    assert.strictEqual(earningsInDays("Oct 5/a", now), 4);
    assert.strictEqual(earningsInDays("Jan 10/b", now), 101);
    assert.strictEqual(earningsInDays("Sep 20/a", now), -11);
    assert.strictEqual(earningsInDays("-", now), null);
});

test("every tab has full and compact column sets and every column id exists", () => {
    const { COL, TAB_COLUMNS, TAB_COLUMNS_COMPACT, TAB_TITLES } = require(path.join("..", "..", "docs", "js", "watchlist.js"));
    Object.keys(TAB_TITLES).forEach(tab => {
        [TAB_COLUMNS[tab], TAB_COLUMNS_COMPACT[tab]].forEach(cols => {
            assert.ok(cols && cols.length > 0, tab);
            cols.forEach(id => assert.ok(COL[id], `${tab}: ${id}`));
        });
        assert.ok(TAB_COLUMNS_COMPACT[tab].length <= 6, `${tab} compact list stays narrow`);
    });
});

test("scoreInRange: empty range keeps everything, unscored stocks drop out once a bound is set", () => {
    assert.equal(scoreInRange(null, null, null), true);
    assert.equal(scoreInRange(null, 5, null), false);
    assert.equal(scoreInRange(7, 5, null), true);
    assert.equal(scoreInRange(4, 5, null), false);
    assert.equal(scoreInRange(8, null, 7), false);
    assert.equal(scoreInRange(5, 5, 5), true);
});

test("applyCommonFilters filters by the manual score range", () => {
    const stocks = [stock("A", { score: 9 }), stock("B", { score: 4 }), stock("C")];
    assert.deepEqual(applyCommonFilters(stocks, "", "", 5, null).map(s => s.ticker), ["A"]);
    assert.deepEqual(applyCommonFilters(stocks, "", "", null, 5).map(s => s.ticker), ["B"]);
    assert.equal(applyCommonFilters(stocks, "", "").length, 3);
});

test("mergePrefs keeps the newer change per ticker for scores and favourites, and tombstones win when newer", () => {
    const a = { scores: { A: { v: 5, t: "2026-10-01T10:00:00.000Z" }, B: { v: 7, t: "2026-10-01T10:00:00.000Z" } }, favs: { A: { v: true, t: "2026-10-01T10:00:00.000Z" } } };
    const b = { scores: { A: { v: 9, t: "2026-10-02T10:00:00.000Z" }, C: { v: 3, t: "2026-10-01T09:00:00.000Z" } },
        favs: { A: { v: false, t: "2026-10-02T09:00:00.000Z" }, D: { v: true, t: "2026-10-01T08:00:00.000Z" } } };
    const m = mergePrefs(a, b);
    assert.equal(m.scores.A.v, 9);
    assert.equal(m.scores.B.v, 7);
    assert.equal(m.scores.C.v, 3);
    assert.equal(m.favs.A.v, false);            // usunięcie z ulubionych (nowsze) wygrywa
    assert.equal(m.favs.D.v, true);
    assert.deepEqual(mergePrefs(m, a), m);       // idempotentne, a starsze dane nie cofają zmian
    assert.deepEqual(mergePrefs(a, null), prefsNormalize(a));
});

test("prefsNormalize drops malformed entries and sorts tickers deterministically", () => {
    const n = prefsNormalize({ scores: { Z: { v: 1, t: "x" }, A: { v: "oops", t: "y" }, B: 5 }, favs: { Q: { v: 1, t: "z" } } });
    assert.deepEqual(Object.keys(n.scores), ["A", "Z"]);
    assert.equal(n.scores.A.v, null);
    assert.equal(n.favs.Q.v, false);
});

test("ratingClass maps percentile bands to colour classes", () => {
    assert.deepEqual([99, 90, 89, 80, 79, 60, 59, 40, 39, 20, 19, 1].map(ratingClass),
        ["rt-90", "rt-90", "rt-80", "rt-80", "rt-60", "rt-60", "rt-40", "rt-40", "rt-20", "rt-20", "rt-0", "rt-0"]);
    assert.equal(ratingClass(null), "");
});

test("decorateCell adds the column class and label to the first <td> and keeps existing class and attributes", () => {
    assert.equal(decorateCell("<td>1</td>", "price", "Cena"), '<td data-label="Cena" class="c-price">1</td>');
    assert.equal(decorateCell('<td class="positive">1</td>', "rs", "RS"), '<td data-label="RS" class="c-rs positive">1</td>');
    assert.equal(decorateCell('<td title="x">1</td>', "company", "Spółka"), '<td data-label="Spółka" class="c-company" title="x">1</td>');
});

test("Finviz is the primary source of target and upside, Yahoo is the fallback; recomLabel names the scale", () => {
    assert.equal(upsideMain({ finviz_upside_pct: 12, pt_upside_pct: 30 }), 12);
    assert.equal(upsideMain({ finviz_upside_pct: null, pt_upside_pct: 30 }), 30);
    assert.equal(upsideMain({}), null);
    assert.equal(targetMain({ finviz_target: 150, pt_mean: 160 }), 150);
    assert.equal(targetMain({ pt_mean: 160 }), 160);
    assert.deepEqual([1, 1.84, 2.5, 3.2, 4.6].map(recomLabel), ["Strong Buy", "Buy", "Hold", "Hold", "Strong Sell"]);
});

test("marketLines describes both indices", () => {
    const lines = marketLines({ sp500: { pct_vs_sma50: 2.1, pct_vs_sma200: 8.4, sma50_rising: true, dist_days: 3, pct_from_high: -1.2 }, nasdaq: null });
    assert.equal(lines.length, 1);
    assert.ok(lines[0].startsWith("S&P 500: +2.1% vs SMA50, +8.4% vs SMA200, 3 dni dystrybucji"));
    assert.deepEqual(Object.keys(MARKET_LABELS), ["uptrend", "correction"]);
    assert.ok(marketLines({ sp500: { ema_gap_pct: 1.8, pct_vs_sma50: 1, pct_vs_sma200: 2, dist_days: 2, pct_from_high: -1 } })[0].includes("EMA10/EMA20 tyg. +1.8%"));
});

test("all tabs share the same columns; tagStrategies orders Q, B", () => {
    const { TAB_COLUMNS, tagStrategies } = require(path.join("..", "..", "docs", "js", "watchlist.js"));
    ["LIST", "FAV", "QM", "BASES"].forEach(t => assert.deepEqual(TAB_COLUMNS[t], TAB_COLUMNS.LIST, t));
    assert.equal(TAB_COLUMNS.ALERTS, undefined);   // zakładka Alerty usunięta
    const a = stock("A", { rs_rating: 90 }), b = stock("B", { rs_rating: 10 });
    tagStrategies([a, b], [a, b], {
        qm: { minDollarVolumeM: 20, minAdrPct: 4, topPct: 10 }, bases: { maxDistPct: 10, vcpOnly: false } });
    assert.ok(!a.strat.includes("R") && !a.strat.includes("W"));
    assert.deepEqual(b.strat, []);
    assert.equal(b.strat_rank, 2);
});

test("breakoutInfo: flag at resistance, pivot distance, my alert line; rank and sort order", () => {
    assert.equal(breakoutInfo(stock("A"), null, 5), null);
    const flag = breakoutInfo(stock("A", { tlw_state: "przy oporze", tlw_pattern: "flaga", tlw_dist_pct: 1.4 }), null, 5);
    assert.equal(flag.dist, 1.4);
    assert.equal(flag.rank, 1);
    const fresh = breakoutInfo(stock("B", { tlw_state: "wybicie", tlw_pattern: "flaga", tlw_vol_ratio: 2.1, tlw_vol_ok: true }), null, 5);
    assert.equal(fresh.rank, 0);
    assert.equal(fresh.dist, null);
    assert.ok(fresh.reasons[0].text.includes("×2.1") && fresh.reasons[0].text.includes("✓"));
    assert.equal(breakoutInfo(stock("C", { base_type: "cup", pct_to_pivot: 8 }), null, 5), null);
    assert.equal(breakoutInfo(stock("C", { base_type: "cup", pct_to_pivot: 3.2, vcp: true }), null, 5).dist, 3.2);
    const al = breakoutInfo(stock("D"), { alert: "above", triggered: false, dist: -1.9 }, 5);
    assert.ok(Math.abs(al.dist - 1.94) < 0.01);   // cena 1,9 % pod linią => do linii ok. 1,94 %
    assert.equal(breakoutInfo(stock("D"), { alert: "above", triggered: true, dist: 0.5 }, 5).rank, 0);
    assert.equal(breakoutInfo(stock("D"), { alert: "below", triggered: false, dist: -1 }, 5), null);
});

test("tagBreakouts sets brk and brk_sort (fresh breakouts first, then by distance); readinessLine summarises", () => {
    const rows = [stock("A", { tlw_state: "przy oporze", tlw_pattern: "flaga", tlw_dist_pct: 2.5 }), stock("B", { tlw_state: "wybicie", tlw_pattern: "korytarz" }),
        stock("C", { base_type: "flat", pct_to_pivot: 1 }), stock("D")];
    tagBreakouts(rows, [], 5);
    assert.deepEqual(rows.filter(s => s.brk).sort((a, b) => a.brk_sort - b.brk_sort).map(s => s.ticker), ["B", "C", "A"]);
    assert.equal(rows[3].brk, null);
    const line = readinessLine({ ...rows[0], rs_line_state: "przed ceną", earnings: "" }, "correction");
    assert.ok(line.startsWith("Do wybicia: 2.5%") && line.includes("RS przed ceną") && line.includes("rynek w korekcie"));
    assert.ok(readinessLine(rows[3], "uptrend").startsWith("Brak sygnału wybicia"));
    const clean = readinessLine({ ...rows[0], rs_line_state: "przed ceną", earnings: "", base_type: "flat", pct_to_pivot: -2 }, "uptrend", false);
    assert.equal(clean, "RS przed ceną ● · rynek ✓");   // bez analizy wzorców: żadnej bazy, flagi ani wybicia
});

test("swipeDirection needs a long, fast, mostly horizontal move", () => {
    assert.equal(swipeDirection(-90, 10, 200), "left");
    assert.equal(swipeDirection(90, -10, 200), "right");
    assert.equal(swipeDirection(-40, 0, 100), null);      // za krótko
    assert.equal(swipeDirection(-90, 80, 200), null);     // raczej pionowo (przewijanie)
    assert.equal(swipeDirection(-90, 5, 1200), null);     // za wolno (przeciąganie)
});

test("positionSize: konto w PLN, kurs USD/PLN, mniejsza z liczby akcji z % konta i z ryzyka do stopu", () => {
    const acct = { capital: 40000, fx: 4, posPct: 10, riskPct: 0.5 };   // 10 000 $ konta; pozycja ≤ 1000 $, strata przy stopie ≤ 50 $
    const s = positionSize(acct, 100, 95);                               // z pozycji: 10 akcji, z ryzyka: 50 / 5 = 10 akcji
    assert.equal(s.shares, 10);
    assert.equal(s.value_usd, 1000);
    assert.equal(s.value_pln, 4000);
    assert.equal(s.pct_of_capital, 10);
    assert.equal(s.risk_usd, 50);
    assert.equal(s.risk_pln, 200);
    assert.equal(s.risk_pct, 0.5);
    // ryzyko ogranicza, gdy stop jest daleko: stop 90 → 5 akcji (strata 50 $), choć 10 % konta pozwalałoby na 10
    const far = positionSize(acct, 100, 90);
    assert.equal(far.shares, 5);
    assert.equal(far.limited_by, "risk");
    assert.ok(far.risk_pct <= 0.5 + 1e-9);
    // tylko % konta (bez ryzyka): stop opcjonalny
    const posOnly = positionSize({ capital: 40000, fx: 4, posPct: 10 }, 100, null);
    assert.equal(posOnly.shares, 10);
    assert.equal(posOnly.risk_pln, null);
    // tylko ryzyko wymaga stopu poniżej wejścia
    assert.equal(positionSize({ capital: 40000, fx: 4, riskPct: 0.5 }, 100, null), null);
    assert.equal(positionSize({ capital: 40000, fx: 4, riskPct: 0.5 }, 100, 101), null);
    assert.equal(positionSize({ capital: 40000, fx: null, posPct: 10 }, 100, 95), null);   // bez kursu nie przeliczymy
    assert.equal(positionSize({ capital: 0, fx: 4, posPct: 10 }, 100, 95), null);
    assert.equal(positionSize({ capital: 40000, fx: 4 }, 100, 95), null);                    // ani % konta, ani ryzyka
    assert.equal(positionSize({ capital: 1000, fx: 4, riskPct: 0.1 }, 100, 90).shares, 0.02);   // małe ryzyko = ułamek akcji (nie 0)
});

test("positionMetrics: P/L, R multiple, distance to stop and stop hit", () => {
    const m = positionMetrics({ entry: 100, stop: 95, shares: 20 }, 110);
    assert.ok(Math.abs(m.pl_pct - 10) < 1e-9);
    assert.equal(m.pl_usd, 200);
    assert.equal(m.r, 2);
    assert.ok(Math.abs(m.to_stop_pct - (95 / 110 - 1) * 100) < 1e-9);
    assert.equal(m.value, 2200);
    assert.equal(m.risk_usd, 100);
    assert.equal(m.stop_hit, false);
    assert.equal(positionMetrics({ entry: 100, stop: 95 }, 94).stop_hit, true);
    const noStop = positionMetrics({ entry: 100 }, 105);
    assert.equal(noStop.r, null);
    assert.equal(noStop.to_stop_pct, null);
    assert.equal(positionMetrics(null, 100), null);
});

test("tagPositions / positionRows / positionTotals: nearest to stop first and portfolio risk", () => {
    const a = stock("A", { price: 110 }), b = stock("B", { price: 100 }), c = stock("C");
    tagPositions([a, b, c], { A: { entry: 100, stop: 95, shares: 20 }, B: { entry: 100, stop: 98, shares: 10 } });
    assert.equal(c.position, null);
    assert.deepEqual(positionRows([a, b, c]).map(s => s.ticker), ["B", "A"]);   // B: stop −2 %, A: stop −13,6 %
    const t = positionTotals(positionRows([a, b, c]), 40000, 4);   // konto 40 000 zł = 10 000 $
    assert.equal(t.n, 2);
    assert.equal(t.risk, 120);
    assert.equal(t.risk_pct, 1.2);
    assert.equal(t.risk_pln, 480);
    assert.equal(t.value, 2200 + 1000);
    assert.equal(t.value_pln, 12800);
    assert.equal(t.value_pct, 32);
    assert.equal(positionTotals(positionRows([a, b, c]), 40000, null).value_pln, null);   // bez kursu nie przeliczamy
});

test("prefs keep positions and account with newest-wins merge and validate fields", () => {
    const a = { pos: { A: { v: { entry: 10, stop: 9, shares: 5 }, t: "2026-10-01T00:00:00.000Z" } }, acct: { main: { v: { capital: 1000, riskPct: 1, posPct: 10 }, t: "2026-10-01T00:00:00.000Z" } } };
    const b = { pos: { A: { v: null, t: "2026-10-02T00:00:00.000Z" }, B: { v: { entry: "x" }, t: "2026-10-02T00:00:00.000Z" } } };
    const m = mergePrefs(a, b);
    assert.equal(m.pos.A.v, null);            // usunięcie (nowsze) wygrywa
    assert.equal(m.pos.B.v, null);            // wpis bez poprawnego wejścia jest odrzucany
    assert.deepEqual(m.acct.main.v, { capital: 1000, riskPct: 1, posPct: 10, fx: null });
    assert.deepEqual(prefsNormalize({}).pos, {});
});

test("ratingChips: coloured chips for composite, RS, EPS, group, Acc/Dis, stability, institutions and leader", () => {
    const chips = ratingChips({ composite_rating: 91, rs_rating: 85, eps_rating: 55, industry_rating: 30, accdis: "B", accdis_rating: 70, eps_stability: 75, eps_stability_rating: 90, inst_own: 61.2, inst_sponsor: true, leader: true });
    const by = Object.fromEntries(chips.map(c => [c.label, c]));
    assert.equal(by.Comp.cls, "rt-90");
    assert.equal(by.RS.cls, "rt-80");
    assert.equal(by.EPS.cls, "rt-40");
    assert.equal(by.Grupa.cls, "rt-20");
    assert.equal(by["A/D"].value, "B");
    assert.equal(by["A/D"].cls, "rt-60");
    assert.equal(by["Stab."].value, "75%");
    assert.equal(by["Inst."].value, "61%");
    assert.equal(by["Inst."].cls, "rt-80");
    assert.ok(chips.some(c => c.value === "★ Lider"));
    assert.deepEqual(ratingChips({}), []);                                         // brak ocen -> brak pastylek
});

test("baseBoxData describes the open base like the MarketSurge callout; none without a base", () => {
    assert.equal(baseBoxData({}), null);
    const d = baseBoxData({ base_type: "cup", base_handle: true, pivot: 280.9, base_weeks: 11, base_depth_pct: 16, vcp: true, pct_to_pivot: 4.5, base_mkt_dd_pct: 9 });
    assert.equal(d.title, "Cup base z rączką");
    const rows = Object.fromEntries(d.rows);
    assert.equal(rows.Pivot, "$280.90");
    assert.equal(rows["Długość"], "11 tyg.");
    assert.equal(rows["Głębokość"], "16%");
    assert.equal(rows["Rączka"], "tak");
    assert.equal(rows.VCP, "tak");
    assert.equal(rows["S&P w bazie"], "−9%");
    assert.equal(rows["Do pivotu"], "+4.5%");
    assert.equal(Object.fromEntries(baseBoxData({ base_type: "flat", pivot: 10, pct_to_pivot: -2.1 }).rows)["Nad pivotem"], "2.1%");
});

test("readinessLine warns when the price is more than 5% above the pivot", () => {
    const late = readinessLine({ ...stock("L"), base_type: "flat", pct_to_pivot: -7.2, brk: null }, "uptrend");
    assert.ok(late.includes("7.2% nad pivotem") && late.includes("za późno"));
    const ok = readinessLine({ ...stock("O"), base_type: "flat", pct_to_pivot: -3, brk: null }, "uptrend");
    assert.ok(ok.includes("3.0% nad pivotem (strefa zakupu do +5 %)"));
});

test("canslimInfo: seven criteria C A N S L I M, score needs >= 4 known, rows sorted by score", () => {
    const { canslimInfo, tagCanslim, canslimRows } = require("../../docs/js/watchlist.js");
    const good = { ticker: "G", eps_q0_yoy: 40, eps_this_y: 30, pct_from_high_52w: -4, accdis: "B", rs_rating: 92, inst_sponsor: true, composite_rating: 90 };
    const c = canslimInfo(good, "uptrend");
    assert.equal(c.score, 7);
    assert.deepEqual(canslimInfo(good, "correction").flags.M, false);
    assert.equal(canslimInfo(good, "correction").score, 6);
    const weak = { ticker: "W", eps_q0_yoy: 10, eps_this_y: 30, pct_from_high_52w: -30, accdis: "D", rs_rating: 50, inst_sponsor: false };
    const w = canslimInfo(weak, "uptrend");
    assert.deepEqual(w.flags, { C: false, A: true, N: false, S: false, L: false, I: false, M: true });   // A: EPS w tym roku
    assert.equal(w.score, 2);
    const sparse = { ticker: "S", rs_rating: 90 };
    const stocks = [good, weak, sparse];
    tagCanslim(stocks, null);
    assert.equal(sparse.cs, null);                          // znane tylko L → za mało danych
    assert.deepEqual(canslimRows(stocks, 5).map(s => s.ticker), ["G"]);
    assert.deepEqual(canslimRows(stocks, 0).map(s => s.ticker), ["G", "W"]);
});

test("ratingChips / readinessLine warn about a sell climax top", () => {
    const { ratingChips, readinessLine } = require("../../docs/js/watchlist.js");
    const s = { climax_top: true, climax_date: "2026-10-02", climax_runup_pct: 38, climax_week_gain_pct: 21, climax_vol_ratio: 3.2, climax_reversal: true, climax_gap: false, climax_conf: 2 };
    assert.ok(ratingChips(s).some(c => c.value === "⚠ Climax top"));
    assert.match(readinessLine(s, "uptrend"), /sell climax top \(tydz\. 2026-10-02, potwierdzenia 2\/4\)/);
    assert.ok(!ratingChips({ climax_top: false }).some(c => c.value === "⚠ Climax top"));
});

test("canslimExplain: one row per letter with the numbers behind each flag; sheet html mentions values and rules", () => {
    const { canslimExplain, canslimSheetHtml, canslimInfo, ratingChips } = require("../../docs/js/watchlist.js");
    const s = { ticker: "G", eps_q0_yoy: 40, eps_q1_yoy: 28, eps_past_5y: 30, eps_this_y: 35, pct_from_high_52w: -4, accdis: "B", accdis_rating: 72, rs_rating: 92, industry_rating: 70, inst_own: 55, inst_trans: 1.2, inst_sponsor: true, leader: true };
    const e = canslimExplain(s, "uptrend");
    assert.deepEqual(e.rows.map(r => r.key), ["C", "A", "N", "S", "L", "I", "M"]);
    assert.equal(e.score, 7);
    assert.deepEqual(e.rows.map(r => r.ok), Object.values(canslimInfo(s, "uptrend").flags));   // te same flagi co w tabeli
    assert.match(e.rows[0].have, /\+40% r\/r.*\+28%/);
    assert.match(e.rows[2].have, /4% poniżej szczytu/);
    const weak = canslimExplain({ ticker: "W", eps_q0_yoy: 10, pct_from_high_52w: -30 }, "correction");
    assert.equal(weak.rows[0].ok, false);
    assert.equal(weak.rows[3].ok, null);
    assert.match(weak.rows[3].have, /brak/);
    assert.equal(weak.rows[6].ok, false);
    const html = canslimSheetHtml(s, "uptrend");
    assert.match(html, /Spełnione: <b>7\/7<\/b>/);
    assert.match(html, /Reguła:/);
    s.cs = 7; s.canslim = canslimInfo(s, "uptrend");
    assert.equal(ratingChips(s).find(c => c.label === "CANSLIM").action, "canslim");
});

test("breakoutInfo follows O'Neil: a close above the line / pivot needs volume; unconfirmed closes are not fresh breakouts", () => {
    // flaga tygodniowa
    assert.equal(breakoutInfo(stock("A", { tlw_state: "bez wolumenu", tlw_pattern: "flaga", tlw_vol_ratio: 1.1 }), null, 5).rank, 2);
    assert.match(breakoutInfo(stock("A", { tlw_state: "bez wolumenu", tlw_pattern: "flaga", tlw_vol_ratio: 1.1 }), null, 5).reasons[0].text, /niepotwierdzone/);
    const weekly = breakoutInfo(stock("B", { tlw_state: "wybicie", tlw_pattern: "flaga", tlw_vol_ratio: 2.4, tlw_vol_ok: true }), null, 5);
    assert.equal(weekly.rank, 0);
    assert.match(weekly.reasons[0].text, /\(tyg\.\) ×2\.4 wol\. ✓/);
    // pivot: wybicie tylko z wolumenem
    assert.equal(breakoutInfo(stock("C", { base_type: "cup", pct_to_pivot: -1, pivot_state: "wybicie", pivot_vol_ratio: 2, pivot_tf: "W" }), null, 5).rank, 0);
    const weak = breakoutInfo(stock("C", { base_type: "cup", pct_to_pivot: -1, pivot_state: "bez wolumenu", pivot_vol_ratio: 1.1 }), null, 5);
    assert.equal(weak.rank, 2);
    assert.match(weak.reasons[0].text, /bez wolumenu/);
    assert.equal(breakoutInfo(stock("C", { base_type: "cup", pct_to_pivot: -1, pivot_state: null }), null, 5).rank, 2);   // wybicie starsze niż kilka sesji
    assert.equal(breakoutInfo(stock("C", { base_type: "cup", pct_to_pivot: -1 }), null, 5).rank, 0);                        // stary plik bez pivot_state
    // moja linia z alertem: zamknięcie nad nią + wolumen z ostatnich sesji
    assert.equal(breakoutInfo(stock("D", { vol_surge_5d: 2.2 }), { alert: "above", triggered: true, dist: 0.5 }, 5).rank, 0);
    const noVol = breakoutInfo(stock("D", { vol_surge_5d: 1.1 }), { alert: "above", triggered: true, dist: 0.5 }, 5);
    assert.equal(noVol.rank, 2);
    assert.match(noVol.reasons[0].text, /bez wolumenu.*niepotwierdzone/);
});

test("pivot logic only for buyable bases: a deep correction near its old high is not a breakout candidate; callout warns", () => {
    assert.equal(breakoutInfo(stock("S", { base_type: "deep", pct_to_pivot: 2 }), null, 5), null);
    assert.equal(breakoutInfo(stock("S", { base_type: "correction", pct_to_pivot: -1, pivot_state: "wybicie" }), null, 5), null);
    assert.ok(breakoutInfo(stock("S", { base_type: "flat", pct_to_pivot: 2 }), null, 5));
    assert.ok(baseBoxData({ base_type: "deep", pivot: 81.19, pct_to_pivot: 41.8, base_weeks: 18, base_depth_pct: 41.6 }).rows.some(r => r[0] === "Uwaga"));
    assert.ok(!baseBoxData({ base_type: "cup", pivot: 50, pct_to_pivot: 2, base_weeks: 20, base_depth_pct: 25 }).rows.some(r => r[0] === "Uwaga"));
    assert.match(readinessLine({ base_type: "deep", pct_to_pivot: -3 }, "uptrend"), /nie baza do zakupu/);
    assert.doesNotMatch(readinessLine({ base_type: "deep", pct_to_pivot: -8 }, "uptrend"), /za późno/);
});

test("CANSLIM fidelity: I has an upper bound, C needs sales, A needs EPS + ROE, L needs a strong group, M counts distribution days", () => {
    const { canslimInfo, canslimRows, tagCanslim } = require("../../docs/js/watchlist.js");
    const base = { eps_q0_yoy: 40, eps_past_5y: 30, eps_this_y: 35, roe: 20, pct_from_high_52w: -3, accdis: "A", rs_rating: 90, industry_rating: 80, inst_own: 60, inst_trans: 1 };
    assert.equal(canslimInfo(base, "uptrend").score, 7);
    // I: przesadne obłożenie, dane > 100 %, brak napływu
    assert.equal(canslimInfo({ ...base, inst_own: 99.4 }, "uptrend").flags.I, false);
    assert.equal(canslimInfo({ ...base, inst_own: 121 }, "uptrend").flags.I, null);
    assert.equal(canslimInfo({ ...base, inst_own: 15 }, "uptrend").flags.I, false);
    assert.equal(canslimInfo({ ...base, inst_trans: -1 }, "uptrend").flags.I, false);
    // C: zysk bez sprzedaży nie wystarcza, a brak sprzedaży nie karze
    assert.equal(canslimInfo({ ...base, sales_qq: 8 }, "uptrend").flags.C, false);
    assert.equal(canslimInfo({ ...base, sales_qq: 30 }, "uptrend").flags.C, true);
    assert.equal(canslimInfo(base, "uptrend").flags.C, true);
    // A: EPS w tym roku < 25 % albo ROE < 17 % = czerwone; EPS z 5 lat nie wpływa na A (młode spółki, średnia ukrywa słaby rok)
    assert.equal(canslimInfo({ ...base, eps_this_y: 10 }, "uptrend").flags.A, false);
    assert.equal(canslimInfo({ ...base, eps_past_5y: 0.1 }, "uptrend").flags.A, true);
    assert.equal(canslimInfo({ ...base, roe: 9 }, "uptrend").flags.A, false);
    assert.equal(canslimInfo({ ...base, eps_past_5y: null }, "uptrend").flags.A, true);
    assert.equal(canslimInfo({ ...base, eps_past_5y: null, eps_this_y: null, roe: null }, "uptrend").flags.A, null);
    // N: do 10 %; S: zadłużenie; L: grupa
    assert.equal(canslimInfo({ ...base, pct_from_high_52w: -12 }, "uptrend").flags.N, false);
    assert.equal(canslimInfo({ ...base, debt_eq: 2.4 }, "uptrend").flags.S, false);
    assert.equal(canslimInfo({ ...base, industry_rating: 30 }, "uptrend").flags.L, false);
    assert.equal(canslimInfo({ ...base, industry_rating: null }, "uptrend").flags.L, true);
    // M: trend wzrostowy z 5 dniami dystrybucji nie jest zielony
    assert.equal(canslimInfo(base, { regime: "uptrend", distDays: 3 }).flags.M, true);
    assert.equal(canslimInfo(base, { regime: "uptrend", distDays: 5 }).flags.M, false);
    assert.equal(canslimInfo(base, { regime: "correction", distDays: 0 }).flags.M, false);
    // zakładka: C i A obowiązkowe
    const good = { ticker: "G", ...base }, noA = { ticker: "X", ...base, eps_this_y: 10 };
    tagCanslim([good, noA], "uptrend");
    assert.deepEqual(canslimRows([good, noA], 6).map(s => s.ticker), ["G", "X"]);
    assert.deepEqual(canslimRows([good, noA], 6, true).map(s => s.ticker), ["G"]);
});

test("próg RS (litera L) jest ustawiany przez użytkownika", () => {
    const { canslimInfo, setCanslimRs } = require("../../docs/js/watchlist.js");
    const s = { rs_rating: 72, industry_rating: 80 };
    try {
        assert.equal(canslimInfo(s, "uptrend").flags.L, false);   // domyślnie 80
        setCanslimRs(70);
        assert.equal(canslimInfo(s, "uptrend").flags.L, true);
        setCanslimRs(NaN);   // nonsens wraca do wartości domyślnej
        assert.equal(canslimInfo(s, "uptrend").flags.L, false);
    } finally { setCanslimRs(80); }
});

test("actionInfo: bramka C / A działa tylko przy „C i A obowiązkowe”", () => {
    const { actionInfo } = require("../../docs/js/watchlist.js");
    const s = { canslim: { flags: { C: false, A: true } } };
    const up = { regime: "uptrend", distDays: 1 };
    assert.equal(actionInfo(s, up).code, "SKIP");
    assert.equal(actionInfo(s, up, true).code, "SKIP");
    assert.notEqual(actionInfo(s, up, false).code, "SKIP");
});

test("actionInfo: jedna wskazówka — pozycja, rynek, wybicie, baza, trend bez bazy", () => {
    const { actionInfo } = require("../../docs/js/watchlist.js");
    const up = { regime: "uptrend", distDays: 2 };
    const ok = { canslim: { flags: { C: true, A: true, N: true } } };
    const code = (s, m = up) => actionInfo({ ...ok, ...s }, m).code;
    // pozycja ma pierwszeństwo
    assert.equal(code({ position: { stop_hit: true, pl_pct: -8 } }), "SELL");
    assert.equal(code({ position: { stop_hit: false, pl_pct: 20 }, climax_top: true }), "TRIM");
    assert.equal(code({ position: { stop_hit: false, pl_pct: 3 }, pct_above_sma10w: -2 }), "EXIT");
    assert.equal(code({ position: { stop_hit: false, pl_pct: -3 }, pct_above_sma10w: 4 }), "HOLD");   // nie dokupujemy do straty
    assert.equal(code({ position: { stop_hit: false, pl_pct: 3.5 }, pct_above_sma10w: 10 }), "ADD");
    assert.equal(code({ position: { stop_hit: false, pl_pct: 3.5 }, pct_above_sma10w: 10 }, { regime: "uptrend", distDays: 6 }), "HOLD");   // rynek pod presją
    assert.equal(code({ position: { stop_hit: false, pl_pct: 12 }, pct_above_sma10w: 3 }), "ADD");   // odbicie od SMA50
    assert.equal(code({ position: { stop_hit: false, pl_pct: 12 }, pct_above_sma10w: 15 }), "HOLD");
    // bez pozycji: fundamenty i rynek
    assert.equal(code({ canslim: { flags: { C: false, A: true } } }), "SKIP");
    assert.equal(code({}, { regime: "correction", distDays: 0 }), "NOBUY");
    // wybicie z bazy: strefa zakupu, rynek pod presją, za późno
    const brk = { base_type: "cup", pivot_state: "wybicie", pct_to_pivot: -2 };
    assert.equal(code(brk), "BUY");
    assert.equal(code(brk, { regime: "uptrend", distDays: 5 }), "BUY_HALF");
    assert.equal(code({ ...brk, pct_to_pivot: -7 }), "LATE");
    assert.equal(code({ base_type: "flat", pct_to_pivot: -2, pivot_state: "bez wolumenu" }), "NEAR");   // nad pivotem bez wolumenu to nie wybicie
    assert.equal(code({ base_type: "flat", pct_to_pivot: 3 }), "NEAR");
    assert.equal(code({ base_type: "cup", pct_to_pivot: 9 }), "BASE");
    assert.equal(code({ base_type: "deep", pct_to_pivot: 3 }), "WAIT");   // głęboka korekta nie jest bazą do zakupu
    // trend bez bazy
    assert.equal(code({ pct_above_sma10w: 3 }), "PULLBACK");
    assert.equal(code({ pct_above_sma10w: 9 }), "WAIT");
    assert.equal(code({ pct_above_sma10w: 22 }), "LATE");
    // bez bramki C / A (odznaczone „C i A obowiązkowe”): ocena po wzorcu tygodniowym
    const noCore = { canslim: { flags: { C: false, A: false } } };
    assert.equal(actionInfo({ ...noCore, ...brk }, up, false).code, "BUY");
    assert.equal(actionInfo({ ...noCore, base_type: "flat", pct_to_pivot: 3 }, up, false).code, "NEAR");
    assert.equal(actionInfo({ ...noCore }, { regime: "correction", distDays: 0 }, false).code, "NOBUY");
});

test("actionInfo: ocena na wykresie tygodniowym (baza, flaga tygodniowa, 10-tygodniowa), dystrybucja i tagActions", () => {
    const { actionInfo, tagActions } = require("../../docs/js/watchlist.js");
    const up = { regime: "uptrend", distDays: 2 };
    const base = { canslim: { flags: { C: true, A: true, N: true } }, pct_above_sma10w: 9 };
    const w = (s, m = up) => actionInfo({ ...base, ...s }, m).code;
    // cena 7 % nad pivotem bazy = ZA PÓŹNO; tuż nad pivotem na wolumenie = KUP; ½ przy dniach dystrybucji rynku
    assert.equal(w({ base_type: "flat", pivot_state: "wybicie", pct_to_pivot: -7 }), "LATE");
    assert.equal(w({ base_type: "flat", pivot_state: "wybicie", pct_to_pivot: -2 }), "BUY");
    assert.equal(w({ base_type: "flat", pivot_state: "wybicie", pct_to_pivot: -2 }, { regime: "uptrend", distDays: 6 }), "BUY_HALF");
    assert.equal(w({ base_type: "flat", pct_to_pivot: 3 }), "NEAR");
    assert.equal(w({ base_type: "cup", pct_to_pivot: 9 }), "BASE");
    // flaga tygodniowa (tlw_); pola dzienne (tl_, dbase_*) są ignorowane
    assert.equal(w({ tlw_state: "wybicie", tlw_dist_pct: -2 }), "BUY");
    assert.equal(w({ tlw_state: "przy oporze", tlw_dist_pct: 1.5 }), "NEAR");
    assert.equal(w({ tl_state: "wybicie", tl_dist_pct: -2, dbase_type: "cup", dpct_to_pivot: -2, dpivot_state: "wybicie" }), "WAIT");
    // średnia: tygodniowy liczy na 10-tygodniowej (brak pola nie podstawia SMA50); rozciągnięcie od 20 %
    assert.equal(actionInfo({ ...base, pct_above_sma10w: 3, pct_above_sma50: 12 }, up).code, "PULLBACK");
    assert.equal(actionInfo({ ...base, pct_above_sma10w: undefined, pct_above_sma50: 3 }, up).code, "WAIT");
    assert.equal(actionInfo({ ...base, pct_above_sma10w: 17 }, up).code, "WAIT");
    assert.equal(actionInfo({ ...base, pct_above_sma10w: 23 }, up).code, "LATE");
    // pozycja i rynek
    assert.equal(w({ position: { stop_hit: true, pl_pct: -8 } }), "SELL");
    assert.equal(w({}, { regime: "correction", distDays: 0 }), "NOBUY");
    // dystrybucja: bez pozycji = nie kupuj (DIST), z pozycją = realizuj zysk (TRIM)
    const dist = { dist_top: true, dist_date: "2026-10-02", dist_vol_ratio: 2.4 };
    assert.equal(w({ ...dist, base_type: "flat", pivot_state: "wybicie", pct_to_pivot: -2 }), "DIST");
    assert.equal(w({ ...dist, position: { pl_pct: 12, stop_hit: false } }), "TRIM");
    assert.match(actionInfo({ ...base, ...dist }, up).why, /Dystrybucja bez wzrostu ceny/);
    // tagActions: jedna ocena tygodniowa = główna
    const s = { ...base, base_type: "flat", pivot_state: "wybicie", pct_to_pivot: -7 };
    tagActions([s], up);
    assert.equal(s.action_w.code, "LATE");
    assert.equal(s.action.code, "LATE");
    assert.equal(s.action_tf, "W");
    assert.equal(s.action_d, undefined);
    assert.equal(s.act_rank, s.act_rank_w);
});

test("baza na bazie: nazwa w kafelku, podsumowaniu i opisie akcji", () => {
    const { baseBoxData, baseSummary } = require("../../docs/js/watchlist.js");
    const s = { base_type: "flat", pivot: 112, base_weeks: 7, base_depth_pct: 9, pct_to_pivot: 3, base_on_base: true, base_stage: 2 };
    assert.match(baseBoxData(s).title, /baza na bazie/);
    assert.ok(baseBoxData(s).rows.some(r => r[0] === "Etap" && /2\. etap/.test(r[1])));
    assert.match(baseSummary(s), /baza na bazie/);
    assert.doesNotMatch(baseSummary({ ...s, base_on_base: false }), /baza na bazie/);
});

test("positionSize: akcje ułamkowe (w dół do 0,01) i ich formatowanie", () => {
    const s = positionSize({ capital: 1000, fx: 4, posPct: 100 }, 400, null);   // 250 $ konta → 0,625 akcji po 400 $
    assert.equal(s.shares, 0.62);
    assert.ok(s.value_usd <= 250);
    assert.equal(fmtShares(0.62), "0,62");
    assert.equal(fmtShares(12), "12");
    assert.equal(fmtShares(3.5), "3,5");
});

test("stopRuleCheck: stop do 8 % pod ceną zakupu jest OK, głębszy łamie regułę O'Neila (F)", () => {
    assert.equal(stopRuleCheck(100, 92).ok, true);
    assert.equal(stopRuleCheck(100, 93).ok, true);
    assert.equal(stopRuleCheck(100, 91).ok, false);
    assert.ok(Math.abs(stopRuleCheck(100, 91).loss_pct - 9) < 1e-9);
    assert.equal(stopRuleCheck(100, 105), null);
    assert.equal(stopRuleCheck(null, 90), null);
});

test("baseBoxData: pokazuje wzrost przed bazą, strefę kupna, stop −8 %, status i powody odrzucenia", () => {
    const d = baseBoxData({ base_type: "correction", base_prior_uptrend_pct: 45, base_buy_zone_max: 105, base_stop_8pct: 92, base_status: "FAULTY_REJECTED", base_rejection: "cup z wadą rączki; rączka rośnie wzdłuż dołków (wedging handle)", pivot: 100 });
    const rows = Object.fromEntries(d.rows);
    assert.equal(rows["Wzrost przed bazą"], "+45%");
    assert.match(rows["Odrzucona"], /wedging/);
    assert.match(rows["Status"], /ODRZUCONA/);
    const ok = Object.fromEntries(baseBoxData({ base_type: "cup", base_buy_zone_max: 105, base_stop_8pct: 92, base_status: "WATCHLIST", pivot: 100 }).rows);
    assert.match(ok["Strefa kupna do"], /105/);
    assert.match(ok["Stop −8% od pivotu"], /92/);
});

test("CANSLIM A: wzrost EPS ≥ 25 % w każdym znanym z 3 ostatnich lat; akceleracja i skup akcji to chipy i sortowanie, nie wymóg", () => {
    const { canslimInfo, canslimRows, ratingChips, canslimExplain } = require("../../docs/js/watchlist.js");
    const mkt = { regime: "uptrend", distDays: 1 };
    const good = { eps_this_y: 40, roe: 22, eps_yr0: 40, eps_yr1: 30, eps_yr2: 28 };
    assert.equal(canslimInfo(good, mkt).flags.A, true);
    assert.equal(canslimInfo({ ...good, eps_yr1: 12 }, mkt).flags.A, false);             // słaby rok w środku = A nie przechodzi
    assert.equal(canslimInfo({ ...good, eps_yr1: null, eps_yr2: null }, mkt).flags.A, true);   // młoda spółka: nieznane lata pomijamy
    assert.equal(canslimInfo({ eps_yr0: null }, mkt).flags.A, null);
    // akceleracja: C nie zależy od niej, ale chip i sortowanie tak
    const base = { eps_q0_yoy: 40, sales_qq: 30 };
    assert.equal(canslimInfo({ ...base, eps_accel: false }, mkt).flags.C, true);
    const rows = [{ ticker: "A", cs: 6, composite_rating: 90, eps_accel: false, canslim: { flags: { C: true, A: true } } }, { ticker: "B", cs: 6, composite_rating: 70, eps_accel: true, canslim: { flags: { C: true, A: true } } }];
    assert.deepEqual(canslimRows(rows, 5, true).map(r => r.ticker), ["B", "A"]);   // ta sama liczba liter: przyspieszający wyżej niż wyższy Composite
    const labels = ratingChips({ eps_accel: true, eps_q0_yoy: 50, eps_q1_yoy: 25, shares_chg_pct: -6.2, dist_top: true, dist_date: "2026-10-02", dist_vol_ratio: 2.1 }).map(c => c.value);
    assert.ok(labels.includes("↗ Akceleracja") && labels.includes("Skup -6.2%") && labels.includes("⚠ Dystrybucja"));
    assert.ok(!ratingChips({ shares_chg_pct: -2 }).some(c => /Skup/.test(c.value)));   // skup < 5 % to jeszcze nie sygnał
    const e = canslimExplain({ ...good, shares_chg_pct: -7, eps_accel: true, eps_q0_yoy: 50, eps_q1_yoy: 25 }, mkt);
    assert.match(e.rows.find(r => r.key === "S").have, /skup akcji ✓/);
    assert.match(e.rows.find(r => r.key === "A").have, /\+40% \/ \+30% \/ \+28%/);
});

test("hasWeeklyPattern i filtr Qullamaggiego „tylko z wzorcem tygodniowym”", () => {
    const { qullamaggieRows, hasWeeklyPattern } = require("../../docs/js/watchlist.js");
    const mk = (t, extra) => ({ ticker: t, dollar_volume_avg: 5e7, adr_pct: 6, low_ratio_1m: 1.5, low_ratio_3m: 1.5, low_ratio_6m: 1.5, ...extra });
    const rows = [mk("A", { base_type: "flat" }), mk("B", { tlw_pattern: "flaga" }), mk("C", { base_type: "correction" }), mk("D")];
    assert.deepEqual(rows.map(hasWeeklyPattern), [true, true, false, false]);
    const p = { minDollarVolumeM: 20, minAdrPct: 4, topPct: 100 };
    assert.deepEqual(qullamaggieRows(rows, p).map(r => r.ticker).sort(), ["A", "B", "C", "D"]);
    assert.deepEqual(qullamaggieRows(rows, { ...p, patternOnly: true }).map(r => r.ticker).sort(), ["A", "B"]);
});


test("stopAdvice: MACD nad sygnałem = stop bez zmian; po przecięciu w dół i zamknięciu pod sygnałem = podnieś stop pod dołek świecy", () => {
    const { stopAdvice } = require("../../docs/js/watchlist.js");
    const above = { state: "above", histDelta: 0.2, histDelta2: 0.1 };
    assert.equal(stopAdvice({ stop: 90 }, above, 120).code, "KEEP");
    assert.equal(stopAdvice({ stop: 90 }, above, 120).tone, "good");
    assert.equal(stopAdvice({ stop: 90 }, { ...above, histDelta: -0.1, histDelta2: -0.2 }, 120).tone, "watch");   // histogram maleje 2 tygodnie
    const below = { state: "below", crossDown: 50, crossDownDate: "2026-09-25", crossLow: 112.345, weeksSinceDown: 1 };
    const raise = stopAdvice({ stop: 100 }, below, 120);
    assert.equal(raise.code, "RAISE");
    assert.equal(raise.newStop, 112.35);
    assert.match(raise.text, /podnieś stop tuż pod dołek/);
    assert.equal(stopAdvice({ stop: 115 }, below, 120).code, "KEEP");               // stop jest już wyżej niż dołek świecy sygnału
    assert.equal(stopAdvice({ stop: 100 }, below, 111).code, "HIT");                // cena pod dołkiem świecy sygnału
    assert.equal(stopAdvice({ stop: 100 }, { state: "below", crossDown: null }, 120).code, "WARN");
    assert.equal(stopAdvice({ stop: 100 }, null, 120).code, "NA");
    assert.match(stopAdvice({}, below, 120).text, /tyg\. temu|ostatnia zamknięta/);
});

test("pudełko bazy: stop z dołu środkowej 1/3, podział na 3, jakość świecy wybicia i knot > 50 % blokuje KUP", () => {
    const { baseBoxData, actionInfo } = require("../../docs/js/watchlist.js");
    const box = { base_type: "flat", pivot: 100, box_low: 85, box_t1: 90, box_t2: 95, box_stop: 90, box_stop_pct: 10, pct_to_pivot: -2, pivot_state: "wybicie",
        box_brk_wick_pct: 20, box_brk_vol_wow_pct: 45, box_brk_hi10: true, canslim: { flags: { C: true, A: true } }, pct_above_sma10w: 9 };
    const rows = Object.fromEntries(baseBoxData(box).rows);
    assert.match(rows["Stop z bazy (dół środka)"], /\$90.*−10% od pivotu/);
    assert.match(rows["Podział na 3"], /dolna.*za późno.*środek.*stop.*górna.*za wcześnie/);
    assert.match(rows["Świeca wybicia"], /knot 20%.*\+45% vs poprzedni tydzień.*10-tyg\. maksimum ✓/);
    const up = { regime: "uptrend", distDays: 1 };
    const buy = actionInfo(box, up);
    assert.equal(buy.code, "BUY");
    assert.match(buy.why, /Stop z bazy .*90.*−10% od pivotu/);                      // stop ze struktury zamiast stałych 7–8 %
    const wick = actionInfo({ ...box, box_brk_wick_pct: 64 }, up);
    assert.equal(wick.code, "NEAR");
    assert.match(wick.why, /górny knot.*64%.*> 50 %/);
    assert.equal(actionInfo({ ...box, base_type: "cup", box_stop: null }, up).code, "BUY");   // cup (i flaga) nie dostają podziału na 3 ani filtra knota
    assert.match(actionInfo({ ...box, base_type: "cup", box_stop: null, box_brk_wick_pct: 64 }, up).why, /Stop 7–8 %/);
});

test("Follow-Through Day: opis w banerze rynku i M z FTD", () => {
    const { ftdText, canslimInfo, marketLines } = require("../../docs/js/watchlist.js");
    assert.equal(ftdText({ state: "none" }), "");
    assert.match(ftdText({ state: "ftd", date: "2026-06-18", gain_pct: 1.91, vol_ratio: 1.6, day: 6, dist_days: 3 }), /FTD 2026-06-18: \+1\.91% na wolumenie ×1\.6, 6\. dzień/);
    assert.match(ftdText({ state: "attempt", day: 3, drawdown_pct: 9.8, low_date: "2026-03-30" }), /3\. dzień, FTD dopiero od 4\. dnia/);
    assert.match(marketLines({ sp500: { dist_days: 2, pct_vs_sma50: 1, pct_vs_sma200: 2, pct_from_high: -3, ftd: { state: "attempt", day: 2, drawdown_pct: 8, low_date: "2026-03-30" } } })[0], /próba odbicia/);
    // M: regime „uptrend” (efektywny, także przez FTD) + mniej niż 5 dni dystrybucji = ✓; opis wspomina FTD
    const c = canslimInfo({}, { regime: "uptrend", distDays: 1, ftd: true });
    assert.equal(c.flags.M, true);
});

test("prefsNormalize: przypięty box zachowuje górę / dół / datę, nieprawidłowy staje się null", () => {
    const p = prefsNormalize({ box: { A: { v: { top: 20, bottom: 18, start: "2026-05-01", x: 1 }, t: "2026-01-01T00:00:00Z" }, B: { v: { top: 10, bottom: 12, start: "2026-05-01" }, t: "2026-01-01T00:00:00Z" } } });
    assert.deepEqual(p.box.A.v, { top: 20, bottom: 18, start: "2026-05-01" });
    assert.equal(p.box.B.v, null);
});
