const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    lineValueAt, alertState, autoToDates, annAdoptAuto, alertRows, annRefresh, mergeImport, annExportJson, annEmptyRecord,
} = require(path.join("..", "..", "docs", "js", "annotate.js"));
const { dateToIndex, indexToDate } = require(path.join("..", "..", "docs", "js", "chart.js"));

const LINE = { id: "a1", kind: "res", x0: "2026-01-01", y0: 100, x1: "2026-01-11", y1: 110, alert: "above" };

test("lineValueAt interpolates and extrapolates by calendar days", () => {
    assert.equal(lineValueAt(LINE, "2026-01-01"), 100);
    assert.equal(lineValueAt(LINE, "2026-01-06"), 105);
    assert.equal(lineValueAt(LINE, "2026-01-21"), 120);   // ekstrapolacja za prawy koniec
});

test("alertState: above/below, near and invalid", () => {
    assert.deepEqual(Object.keys(alertState(LINE, 101, "2026-01-01")).sort(), ["dist", "near", "triggered", "value"]);
    assert.equal(alertState(LINE, 111, "2026-01-11").triggered, true);          // cena nad linią 110
    assert.equal(alertState(LINE, 109, "2026-01-11").triggered, false);
    assert.equal(alertState(LINE, 109, "2026-01-11").near, true);               // < 2% od linii
    assert.equal(alertState(LINE, 90, "2026-01-11").near, false);
    assert.equal(alertState({ ...LINE, alert: "below" }, 99, "2026-01-01").triggered, true);
    assert.equal(alertState(LINE, NaN, "2026-01-01"), null);
});

test("dateToIndex / indexToDate round trip, extrapolate and stay inside bars", () => {
    const dates = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-12"];
    assert.equal(dateToIndex(dates, "2026-01-07"), 2);
    assert.ok(Math.abs(dateToIndex(dates, "2026-01-10") - 4.333) < 0.01);   // weekend: między piątkiem a poniedziałkiem
    assert.ok(dateToIndex(dates, "2026-01-02") < 0);
    assert.equal(indexToDate(dates, 3), "2026-01-08");
    assert.equal(indexToDate(dates, 0), "2026-01-05");
});

test("autoToDates + annAdoptAuto copy auto lines/cups once and keep a snapshot", () => {
    const full = {
        daily: true, weeks: ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"],
        lines: [{ kind: "res", i0: 0, y0: 10, i1: 3, y1: 12 }],
        cups: [{ i0: 0, iLow: 1, i1: 3, peak: 12, low: 8, right: 11 }],
        trend: { pattern: "flaga", state: "wybicie" },
    };
    assert.deepEqual(autoToDates(full).lines[0], { kind: "res", x0: "2026-01-02", y0: 10, x1: "2026-01-07", y1: 12 });
    const rec = annAdoptAuto(annEmptyRecord(), full);
    assert.equal(rec.lines.length, 1);
    assert.equal(rec.cups[0].low_date, "2026-01-05");
    assert.ok(rec.hideAutoLines && rec.hideAutoCups && rec.lines[0].fromAuto);
    assert.equal(rec.auto.pattern, "flaga");
    const again = annAdoptAuto(rec, { ...full, lines: [{ kind: "sup", i0: 0, y0: 1, i1: 1, y1: 1 }] });
    assert.equal(again.lines.length, 1);                      // drugie wejście niczego nie dubluje
    assert.equal(again.auto.lines[0].kind, "res");            // migawka z pierwszego razu
});

test("alertRows ranks new triggers first; annRefresh counts them and resets ack when no longer triggered", () => {
    const stocks = [
        { ticker: "AAA", price: 111, as_of: "2026-01-11" },
        { ticker: "BBB", price: 100, as_of: "2026-01-11" },
        { ticker: "CCC", price: 50, as_of: "2026-01-11" },
    ];
    const store = {
        AAA: { ...annEmptyRecord(), lines: [{ ...LINE }] },
        BBB: { ...annEmptyRecord(), lines: [{ ...LINE, id: "b" }] },
        CCC: { ...annEmptyRecord(), lines: [{ ...LINE, id: "c", ack: true }, { ...LINE, id: "no-alert", alert: null }] },
        ZZZ: { ...annEmptyRecord(), lines: [{ ...LINE }] },   // poza listą
    };
    const rows = alertRows(store, stocks);
    assert.deepEqual(rows.map(r => r.ticker), ["AAA", "BBB", "CCC"]);
    assert.equal(rows[0].alert.rank, 0);
    assert.equal(annRefresh(store, stocks), 1);
    assert.equal(store.CCC.lines[0].ack, false);              // nieprzebita => ack wyzerowane
    store.AAA.lines[0].ack = true;
    assert.equal(annRefresh(store, stocks), 0);
});

test("export/import round trip merges per ticker and rejects garbage", () => {
    const store = { AAA: { ...annEmptyRecord(), note: "x", lines: [{ ...LINE }] } };
    const json = annExportJson(store, new Date("2026-02-01T00:00:00Z"));
    const merged = mergeImport({ BBB: annEmptyRecord() }, json);
    assert.equal(merged.AAA.lines.length, 1);
    assert.ok(merged.BBB);
    assert.throws(() => mergeImport({}, "{\"foo\": 1}"));
    assert.throws(() => mergeImport({}, "not json"));
});
