// Testy dla czystej logiki w docs/js/shared.js — module wspoldzielonym przez
// index.html/rebalance.html/chart.html (patrz komentarz na gorze tego pliku).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    UNIVERSES, UNIVERSE_LABELS, PLN_UNIVERSES, formatPrice, tvSymbolFor, tvUrlFor,
    STAGE_LABELS, STAGE_COLORS, stageCellHtml, compareRows,
    TV_EMBED_BASE, TV_1MIN_VWAP_WIDGET,
} = require(path.join("..", "..", "docs", "js", "shared.js"));

test("UNIVERSES lists all six universes the pipeline computes", () => {
    assert.deepEqual(UNIVERSES, ["SP500", "NASDAQ100", "DOWJONES", "WIG20", "MWIG40", "SWIG80"]);
});

test("UNIVERSE_LABELS has a label for every universe", () => {
    UNIVERSES.forEach((u) => assert.equal(typeof UNIVERSE_LABELS[u], "string"));
});

test("formatPrice renders USD for a non-PLN universe", () => {
    assert.equal(formatPrice(123.4, "SP500"), "$123.40");
});

test("formatPrice renders PLN (zł suffix) for WIG20/mWIG40/sWIG80", () => {
    assert.equal(formatPrice(123.4, "WIG20"), "123.40 zł");
    assert.equal(formatPrice(55, "MWIG40"), "55.00 zł");
    assert.equal(formatPrice(12.3, "SWIG80"), "12.30 zł");
});

test("tvSymbolFor prefixes GPW: only for PLN universes", () => {
    assert.equal(tvSymbolFor("PKN", "WIG20"), "GPW:PKN");
    assert.equal(tvSymbolFor("AAPL", "SP500"), "AAPL");
});

test("tvUrlFor builds a tradingview.com chart URL from tvSymbolFor", () => {
    assert.equal(
        tvUrlFor("PKN", "WIG20"),
        "https://www.tradingview.com/chart/?symbol=GPW%3APKN",
    );
});

test("PLN_UNIVERSES contains exactly WIG20, MWIG40 and SWIG80", () => {
    assert.deepEqual([...PLN_UNIVERSES].sort(), ["MWIG40", "SWIG80", "WIG20"]);
});

test("stageCellHtml renders an em dash for a missing/unknown stage", () => {
    assert.match(stageCellHtml(null), /—/);
    assert.match(stageCellHtml("unknown"), /—/);
});

test("stageCellHtml renders the stage's own color and label as a title", () => {
    const html = stageCellHtml("2A");
    assert.match(html, new RegExp(STAGE_COLORS["2A"]));
    assert.match(html, new RegExp(STAGE_LABELS["2A"]));
    assert.match(html, />2A<\/span>/);
});

test("compareRows sorts numerically ascending/descending", () => {
    const rows = [{ rank: 3 }, { rank: 1 }, { rank: 2 }];
    rows.sort((a, b) => compareRows(a, b, "rank", "asc"));
    assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
    rows.sort((a, b) => compareRows(a, b, "rank", "desc"));
    assert.deepEqual(rows.map((r) => r.rank), [3, 2, 1]);
});

test("compareRows sorts strings case-insensitively", () => {
    const rows = [{ ticker: "banana" }, { ticker: "Apple" }, { ticker: "cherry" }];
    rows.sort((a, b) => compareRows(a, b, "ticker", "asc"));
    assert.deepEqual(rows.map((r) => r.ticker), ["Apple", "banana", "cherry"]);
});

test("compareRows treats equal values as a tie (stable order)", () => {
    const rows = [{ rank: 1, id: "a" }, { rank: 1, id: "b" }];
    assert.equal(compareRows(rows[0], rows[1], "rank", "asc"), 0);
});

test("TV_1MIN_VWAP_WIDGET.config pins interval 1 + VWAP study for the given symbol", () => {
    const cfg = TV_1MIN_VWAP_WIDGET.config("NVDA");
    assert.equal(cfg.symbol, "NVDA");
    assert.equal(cfg.interval, "1");
    assert.deepEqual(cfg.studies, ["VWAP@tv-basicstudies"]);
    assert.equal(TV_1MIN_VWAP_WIDGET.src, `${TV_EMBED_BASE}embed-widget-advanced-chart.js`);
});
