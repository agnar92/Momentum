// Testy dla docs/js/qol.js. showToast/initConnStatus/hideLoadingOverlay sa
// celowo DOM-sprzezone (tworza/modyfikuja elementy), wiec — tak jak
// renderRelativeStrengthChart w chart-render.js — nie sa tu renderowane
// jednostkowo; to, co da sie i warto sprawdzic bez przegladarkowego DOM, to
// ze kazda z nich bezpiecznie nie robi nic (nie rzuca), gdy `document` nie
// istnieje — dokladnie tak, jak dzieje sie to w tescie togglePick()
// (tests/js/rebalance.test.js), ktore wprost wola showToast().
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { showToast, initConnStatus, hideLoadingOverlay } = require(path.join("..", "..", "docs", "js", "qol.js"));

test("showToast does not throw when document is unavailable (Node test environment)", () => {
    assert.doesNotThrow(() => showToast("test message"));
    assert.doesNotThrow(() => showToast("test message", { type: "success", duration: 1 }));
});

test("initConnStatus does not throw when document is unavailable", () => {
    assert.doesNotThrow(() => initConnStatus());
});

test("hideLoadingOverlay does not throw when document is unavailable", () => {
    assert.doesNotThrow(() => hideLoadingOverlay());
});
