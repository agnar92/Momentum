const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    bizIndex, lineValueAt, alertState, autoToDates, annAdoptAuto, alertRows, annRefresh, mergeImport, annExportJson, annEmptyRecord,
} = require(path.join("..", "..", "docs", "js", "annotate.js"));
const { dateToIndex, indexToDate } = require(path.join("..", "..", "docs", "js", "chart.js"));

const LINE = { id: "a1", kind: "res", x0: "2026-01-05", y0: 100, x1: "2026-01-12", y1: 110, alert: "above" };   // pn -> pn: 5 dni handlowych

test("bizIndex counts trading days; weekends sit between Friday and Monday", () => {
    assert.equal(bizIndex("2026-01-12") - bizIndex("2026-01-05"), 5);
    assert.equal(bizIndex("2026-01-09") + 1, bizIndex("2026-01-12"));
    assert.ok(bizIndex("2026-01-10") > bizIndex("2026-01-09") && bizIndex("2026-01-10") < bizIndex("2026-01-12"));
});

test("lineValueAt is a straight line in trading days (log lines straight in ln price)", () => {
    assert.equal(lineValueAt(LINE, "2026-01-05"), 100);
    assert.equal(lineValueAt(LINE, "2026-01-07"), 104);
    assert.equal(lineValueAt(LINE, "2026-01-09"), 108);
    assert.equal(lineValueAt(LINE, "2026-01-12"), 110);      // za weekendem: tylko 1 dzień handlowy po piątku
    assert.equal(lineValueAt(LINE, "2026-01-19"), 120);      // ekstrapolacja za prawy koniec
    const logLine = { ...LINE, log: true, y1: 121 };
    assert.ok(Math.abs(lineValueAt(logLine, "2026-01-08") - 100 * Math.pow(1.21, 3 / 5)) < 1e-9);
});

test("alertState: above/below, near and invalid", () => {
    assert.deepEqual(Object.keys(alertState(LINE, 101, "2026-01-05")).sort(), ["dist", "near", "triggered", "value"]);
    assert.equal(alertState(LINE, 111, "2026-01-12").triggered, true);          // cena nad linią 110
    assert.equal(alertState(LINE, 109, "2026-01-12").triggered, false);
    assert.equal(alertState(LINE, 109, "2026-01-12").near, true);               // < 2% od linii
    assert.equal(alertState(LINE, 90, "2026-01-12").near, false);
    assert.equal(alertState({ ...LINE, alert: "below" }, 99, "2026-01-05").triggered, true);
    assert.equal(alertState(LINE, NaN, "2026-01-05"), null);
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
        { ticker: "AAA", price: 111, as_of: "2026-01-12" },
        { ticker: "BBB", price: 100, as_of: "2026-01-12" },
        { ticker: "CCC", price: 50, as_of: "2026-01-12" },
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

test("annFlatten: oba końce linii na średniej cenie (kąt 0°)", () => {
    const { annFlatten } = require(path.join("..", "..", "docs", "js", "annotate.js"));
    const l = annFlatten({ y0: 100, y1: 104.5 });
    assert.equal(l.y0, 102.25);
    assert.equal(l.y1, 102.25);
});

test("mergeStores: union of lines by id, newer record wins, deletions are final", () => {
    const { mergeStores, annResetRecord } = require(path.join("..", "..", "docs", "js", "annotate.js"));
    const l1 = { id: "a", x0: "2026-01-05", y0: 1, x1: "2026-01-12", y1: 2 }, l2 = { id: "b", x0: "2026-01-05", y0: 3, x1: "2026-01-12", y1: 4 };
    const pc = { ...annEmptyRecord(), lines: [l1], note: "pc", editedAt: "2026-02-01T10:00:00Z" };
    const ph = { ...annEmptyRecord(), lines: [l2, { ...l1, y1: 9 }], note: "tel", editedAt: "2026-02-01T11:00:00Z" };
    const m = mergeStores({ AAA: pc, ZZZ: pc }, { AAA: ph, BBB: ph });
    assert.deepEqual(Object.keys(m).sort(), ["AAA", "BBB", "ZZZ"]);
    assert.equal(m.AAA.note, "tel");
    assert.deepEqual(m.AAA.lines.map(l => l.id).sort(), ["a", "b"]);
    assert.equal(m.AAA.lines.find(l => l.id === "a").y1, 9);   // ta sama linia: wersja z nowszego rekordu
    // usunięcie na PC (nagrobek) nie wraca z telefonu
    const pcDel = { ...pc, lines: [], del: { a: "2026-02-01T12:00:00Z" }, editedAt: "2026-02-01T12:00:00Z" };
    assert.deepEqual(mergeStores({ AAA: pcDel }, { AAA: ph }).AAA.lines.map(l => l.id), ["b"]);
    // „Przywróć auto” czyści też linie z drugiego urządzenia
    const reset = annResetRecord(pc, new Date("2026-02-01T13:00:00Z"));
    assert.deepEqual(mergeStores({ AAA: reset }, { AAA: { ...pc, lines: [l1] } }).AAA.lines, []);
    // pusty lokalny zestaw nigdy nie kasuje zdalnego
    assert.equal(mergeStores({}, { AAA: ph }).AAA.lines.length, 2);
});
