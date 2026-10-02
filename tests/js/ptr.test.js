// Testy czystej logiki docs/js/pull-to-refresh.js (kiedy gest odświeżania jest zablokowany).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { ptrBlocked } = require(path.join("..", "..", "docs", "js", "pull-to-refresh.js"));

const el = matches => ({ closest: sel => (matches.some(m => sel.includes(m)) ? {} : null) });

test("ptrBlocked: zoomed page never starts pull-to-refresh", () => {
    assert.equal(ptrBlocked(el([]), 1.4), true);
    assert.equal(ptrBlocked(el([]), 1), false);
    assert.equal(ptrBlocked(el([]), 1.005), false);
});

test("ptrBlocked: chart, slider, form fields and menus are excluded", () => {
    ["chart-overlay", "#chartPlot", "wl-range", "input", "select", "textarea"].forEach(m => assert.equal(ptrBlocked(el([m]), 1), true, m));
    assert.equal(ptrBlocked(null, 1), false);
});
