// Testy dla czystej logiki w docs/js/ep.js (strona EP — Episodic Pivot,
// patrz komentarz na górze tego pliku). DOM-owe kawałki (renderEpLogTable,
// openEpChartModal, ...) zostają nietestowane, tak jak w reszcie tego
// codebase'u (patrz chart-modal.js/chart-render.js).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    EP_SCREENER_PRESETS, EP_SCREENER_WIDGET, EP_NEWS_WIDGET,
    EP_TYPES, EP_STATUSES, epTypeLabel, epStatusLabel,
    sanitizeTicker, sortEpEntries, todayIso,
} = require(path.join("..", "..", "docs", "js", "ep.js"));

test("EP_SCREENER_PRESETS has exactly 2 distinct presets (gap + breakout)", () => {
    assert.equal(EP_SCREENER_PRESETS.length, 2);
    const keys = EP_SCREENER_PRESETS.map(p => p.key);
    assert.deepEqual(keys, ["gap", "breakout"]);
    EP_SCREENER_PRESETS.forEach(p => {
        assert.equal(typeof p.label, "string");
        assert.equal(typeof p.screen, "string");
        assert.equal(typeof p.column, "string");
    });
});

test("EP_SCREENER_WIDGET.config wires the chosen preset's screen+column", () => {
    const breakout = EP_SCREENER_PRESETS.find(p => p.key === "breakout");
    const cfg = EP_SCREENER_WIDGET.config(breakout);
    assert.equal(cfg.defaultScreen, "unusual_volume");
    assert.equal(cfg.defaultColumn, "moving_averages");
    assert.equal(cfg.market, "america");
    assert.equal(cfg.showToolbar, true);
});

test("the breakout preset surfaces the moving-averages column view (EMA 10/20/50/100/200 stack)", () => {
    const breakout = EP_SCREENER_PRESETS.find(p => p.key === "breakout");
    assert.equal(breakout.column, "moving_averages");
});

test("the gap preset targets the premarket-gap approximation (top gainers by performance)", () => {
    const gap = EP_SCREENER_PRESETS.find(p => p.key === "gap");
    assert.equal(gap.screen, "top_gainers");
    assert.equal(gap.column, "performance");
});

test("EP_NEWS_WIDGET.config uses feedMode market (general feed, not one symbol)", () => {
    const cfg = EP_NEWS_WIDGET.config();
    assert.equal(cfg.feedMode, "market");
    assert.equal(cfg.symbol, undefined);
});

test("EP_TYPES/EP_STATUSES have distinct, non-empty values", () => {
    [EP_TYPES, EP_STATUSES].forEach(list => {
        const values = list.map(x => x.value);
        assert.equal(new Set(values).size, values.length);
        list.forEach(x => assert.equal(typeof x.label, "string"));
    });
});

test("epTypeLabel/epStatusLabel resolve a known value and fall back for an unknown one", () => {
    assert.equal(epTypeLabel("earnings"), EP_TYPES[0].label);
    assert.equal(epTypeLabel("nope"), EP_TYPES[EP_TYPES.length - 1].label);
    assert.equal(epStatusLabel("entered"), EP_STATUSES[1].label);
    assert.equal(epStatusLabel("nope"), EP_STATUSES[0].label);
});

test("sanitizeTicker uppercases, trims, strips invalid characters and caps length", () => {
    assert.equal(sanitizeTicker("  nvda "), "NVDA");
    assert.equal(sanitizeTicker("brk.b"), "BRK.B");
    assert.equal(sanitizeTicker("bad!ticker#1"), "BADTICKER1");
    assert.equal(sanitizeTicker(""), "");
    assert.equal(sanitizeTicker(null), "");
    assert.equal(sanitizeTicker("ABCDEFGHIJKLMNOP"), "ABCDEFGHIJKL");
});

test("sortEpEntries sorts newest date first, then ticker alphabetically", () => {
    const entries = [
        { date: "2026-09-20", ticker: "ZZZ" },
        { date: "2026-09-25", ticker: "BBB" },
        { date: "2026-09-25", ticker: "AAA" },
    ];
    const sorted = sortEpEntries(entries);
    assert.deepEqual(sorted.map(e => e.ticker), ["AAA", "BBB", "ZZZ"]);
});

test("sortEpEntries does not mutate the input array", () => {
    const entries = [{ date: "2026-09-20", ticker: "B" }, { date: "2026-09-25", ticker: "A" }];
    const copy = [...entries];
    sortEpEntries(entries);
    assert.deepEqual(entries, copy);
});

test("todayIso returns a YYYY-MM-DD string", () => {
    assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
});
