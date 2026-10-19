"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { krokRoute, marketVerdict } = require("../../docs/js/krok.js");

const ramp = (n, a, b) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

test("krokRoute: krok i sektor z adresu, nieznany = rynek", () => {
    assert.deepEqual(krokRoute("#akcje/xlk"), { step: "akcje", sector: "XLK" });
    assert.deepEqual(krokRoute("#sektory"), { step: "sektory", sector: "" });
    assert.deepEqual(krokRoute(""), { step: "rynek", sector: "" });
    assert.equal(krokRoute("#cokolwiek").step, "rynek");
});

test("marketVerdict: rośnie / mieszany / spada", () => {
    const up = { c: ramp(60, 10, 30) }, down = { c: ramp(60, 30, 10) };
    assert.equal(marketVerdict([up, up, up]).cls, "positive");
    assert.equal(marketVerdict([up, down, down]).cls, "warn");
    assert.equal(marketVerdict([down, down]).cls, "negative");
});
