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

test("krokFavList / krokToggleFav: gwiazdka jak Ulubione w Strategiach", () => {
    const { krokFavList, krokToggleFav, krokRoute } = require("../../docs/js/krok.js");
    assert.deepEqual(krokFavList(null), []);
    const p0 = { scores: { A: { v: 3, t: "x" } }, favs: { B: { v: false, t: "a" } } };
    const p1 = krokToggleFav(p0, "NVDA", "2026-10-19T00:00:00Z");
    assert.deepEqual(p1.favs.NVDA, { v: true, t: "2026-10-19T00:00:00Z" });
    assert.deepEqual(p1.scores, p0.scores);
    assert.equal(p0.favs.NVDA, undefined);
    assert.deepEqual(krokFavList(p1), ["NVDA"]);
    const p2 = krokToggleFav(p1, "NVDA", "2026-10-19T01:00:00Z");
    assert.deepEqual(p2.favs.NVDA, { v: false, t: "2026-10-19T01:00:00Z" });
    assert.deepEqual(krokFavList(p2), []);
    assert.equal(krokRoute("#obserwowane").step, "obserwowane");
});
