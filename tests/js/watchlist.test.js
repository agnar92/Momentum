// Testy czystej logiki docs/js/watchlist.js (zakładki listy obserwowanej).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    rsLeaders, qullamaggieRows, ema34Rows, applyCommonFilters, githubActionsUrl, sortRows,
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

test("ema34Rows keeps only stocks with a strictly rising EMA34", () => {
    const out = ema34Rows([stock("A", { ema34_rising: true }), stock("B", { ema34_rising: false }),
        stock("C", { ema34_rising: null }), stock("D")]);
    assert.deepEqual(out.map(s => s.ticker), ["A"]);
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
