// Testy czystej logiki docs/js/watchlist.js (zakładki listy obserwowanej).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    rsLeaders, qullamaggieRows, ptRows, upsideMain, targetMain, recomLabel, fillTargets, mergePrefs, prefsNormalize, applyCommonFilters, scoreInRange, morningstarUrlFor, ratingClass, decorateCell, githubActionsUrl, sortRows,
    fmtMarketCap, fmtVolume, fmtPct, sparkSvg,
} = require(path.join("..", "..", "docs", "js", "watchlist.js"));

function stock(ticker, over = {}) {
    return {
        ticker, company: `${ticker} Inc`, sector: "Tech", price: 100, rs_rating: 50, rs_score: 0.5,
        adr_pct: 6, dollar_volume_avg: 50e6,
        low_ratio_1m: 1.05, low_ratio_3m: 1.12, low_ratio_6m: 1.4,
        ema34_rising: false, ...over,
    };
}

test("rsLeaders keeps ratings at or above the threshold, best first", () => {
    const out = rsLeaders([stock("A", { rs_rating: 90 }), stock("B", { rs_rating: 70 }),
        stock("C", { rs_rating: 99 }), stock("D", { rs_rating: null })], 80);
    assert.deepEqual(out.map(s => s.ticker), ["C", "A"]);
});

test("rsLeaders also filters by EPS Rating and Composite when thresholds are set", () => {
    const rows = [stock("A", { rs_rating: 90, eps_rating: 85, composite_rating: 88 }), stock("B", { rs_rating: 95, eps_rating: 40, composite_rating: 68 }),
        stock("C", { rs_rating: 92, eps_rating: null, composite_rating: null })];
    assert.deepEqual(rsLeaders(rows, 80, 0, 0).map(s => s.ticker), ["B", "C", "A"]);
    assert.deepEqual(rsLeaders(rows, 80, 70, 0).map(s => s.ticker), ["A"]);
    assert.deepEqual(rsLeaders(rows, 80, 0, 80).map(s => s.ticker), ["A"]);
});

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

test("ptRows keeps stocks with a price target, fillTargets adds min/max from estimates", () => {
    const rows = ptRows([stock("A", { pt_mean: 120, pt_upside_pct: 20 }), stock("B"), stock("C", { pt_mean: 80, pt_upside_pct: null })]);
    assert.deepEqual(rows.map(s => s.ticker), ["A"]);
    const few = [stock("X", { pt_mean: 10, pt_upside_pct: 50, analysts: 2 }), stock("Y", { pt_mean: 10, pt_upside_pct: 5, analysts: 8 })];
    assert.deepEqual(ptRows(few, 3).map(s => s.ticker), ["Y"]);
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
    assert.equal(sparkSvg([1]), "");
    assert.match(sparkSvg([0, 1, 2]), /<polyline/);
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

test("morningstarUrlFor builds a ticker search link and encodes the symbol", () => {
    assert.equal(morningstarUrlFor("AAPL"), "https://www.morningstar.com/search?query=AAPL");
    assert.equal(morningstarUrlFor("BRK-B"), "https://www.morningstar.com/search?query=BRK-B");
    assert.equal(morningstarUrlFor("A B"), "https://www.morningstar.com/search?query=A%20B");
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
    // próg analityków dotyczy tylko spółek, dla których znamy ich liczbę (Yahoo)
    const rows = [stock("A", { finviz_upside_pct: 20 }), stock("B", { finviz_upside_pct: 40, analysts: 1 }), stock("C", { finviz_upside_pct: 10, analysts: 9 })];
    assert.deepEqual(ptRows(rows, 3).map(s => s.ticker), ["A", "C"]);
});
