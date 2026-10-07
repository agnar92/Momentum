// Testy dla czystej logiki w docs/js/shared.js (moduł współdzielony przez
// index.html/watchlist.js).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { tvUrlFor, compareRows } =
    require(path.join("..", "..", "docs", "js", "shared.js"));

test("tvUrlFor builds a full TradingView chart URL and escapes the symbol", () => {
    assert.equal(tvUrlFor("AAPL"), "https://www.tradingview.com/chart/?symbol=AAPL");
    assert.equal(tvUrlFor("BRK-B"), "https://www.tradingview.com/chart/?symbol=BRK-B");
    assert.equal(tvUrlFor("A B"), "https://www.tradingview.com/chart/?symbol=A%20B");
});

test("compareRows sorts strings case-insensitively and numbers numerically", () => {
    assert.ok(compareRows({ t: "abc" }, { t: "ABD" }, "t", "asc") < 0);
    assert.ok(compareRows({ n: 2 }, { n: 10 }, "n", "asc") < 0);
    assert.ok(compareRows({ n: 2 }, { n: 10 }, "n", "desc") > 0);
    assert.equal(compareRows({ n: 5 }, { n: 5 }, "n", "asc"), 0);
});
