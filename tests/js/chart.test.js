const test = require("node:test");
const assert = require("node:assert");
const CH = require("../../docs/js/chart.js");
const { sma, macd, macdCrossDown, ticks, chartSvg, infoLines, titleText, windowRange, sliderRect, sliderMode, sliderDrag, sliderJump, zoomWindow, sliderSvg } = CH;

test("sma and ticks", () => {
    assert.deepStrictEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
    assert.deepStrictEqual(ticks(10, 100, 7), [20, 40, 60, 80, 100]);
    assert.deepStrictEqual(ticks(0, 10), []);
});

test("macd cross down like calc.macd_cross_down", () => {
    const closes = [];
    for (let i = 1; i < 60; i++) closes.push(i);
    for (let i = 1; i < 15; i++) closes.push(60 - i * 2);
    const h = macd(closes).hist, x = macdCrossDown(h);
    assert.ok(x.length && h[x[x.length - 1]] < 0 && h[x[x.length - 1] - 1] >= 0);
});

// miesięczny SPY od 2023-12 (rosnący albo spadający) — źródło tła na T, M i Z
function spyMonthly(rising = true) {
    const d = Array.from({ length: 60 }, (_, i) => `${2023 + Math.floor((11 + i) / 12)}-${String(1 + ((11 + i) % 12)).padStart(2, "0")}-01`), c = d.map((_, i) => 100 + (rising ? i : -i * 0.3));
    return { d, o: c, h: c, l: c, c, v: c.map(() => 1e9) };
}

function weekly(n) {
    const d = [], c = [];
    for (let i = 0; i < n; i++) {
        d.push(new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10));
        c.push(50 + i);
    }
    return { d, o: c, h: c.map((v) => v + 1), l: c.map((v) => v - 1), c, v: c.map(() => 1e6) };
}

test("T chart: RS panel, grey bars, SMA 10, green line zone 0–10 %, geometry", () => {
    const w = weekly(150), spx = { d: w.d, c: w.c.map((x) => x * 4) };
    const res = chartSvg(w, { glb: 120, rs: 20 }, 1000, 700, null, null, [], null, spx, "W", { spyM: spyMonthly() });
    assert.ok(res.svg.includes('stroke="#a9b1bb"') && res.svg.includes('stroke="#2f6bff"'));   // słupki szare, SMA 10 niebieska
    assert.ok(res.svg.includes("RS Line (akcja / SPY)") && res.svg.includes("+20 pp"));
    assert.ok(res.svg.includes('stroke-dasharray="2 4"') && res.svg.includes("+5 %") && res.svg.includes("+10 %"));   // kropkowana GLB, opisy strefy
    assert.ok(res.svg.includes("zielone tło = SPY mies. nad SMA 10 mies.") && res.svg.includes("szary pas = 0–10 % nad GLB"));
    assert.ok(res.svg.includes('fill="#0f2a1c"'));   // tło SPY > SMA 10
    assert.ok(!res.svg.includes("Przychody kw.") && !res.svg.includes("SMA 4"));
    const g = res.geom;
    assert.strictEqual(g.n, 150);
    assert.ok(g.rs[1] < g.price[0] && g.price[1] < g.vol[0] && g.vol[1] < g.macd[0] && g.macd[1] < 700);
    assert.strictEqual(chartSvg(weekly(1), null, 800, 600), null);
});

test("zone colour is the grey mixed into the background (no alpha)", () => {
    const { mix } = CH;
    assert.strictEqual(mix("#000000", "#ffffff", 0.5), "#808080");
    assert.strictEqual(mix("#0e1116", "#9aa3ad", 0.16), "#24282e");
});

test("info lines and title", () => {
    assert.deepStrictEqual(infoLines(weekly(3), 1).slice(0, 2), ["tydz. 2024-01-08", "O 51.00  H 52.00"]);
    assert.strictEqual(infoLines(weekly(3), 1, "M")[0], "mies. 2024-01-08");
    assert.strictEqual(titleText("X", { company: "Xco", glb_pct: 4, turnover: 6e7 }), "X  ·  Xco  ·  do linii +4.0%  ·  obrót 60 mln $/dzień");
});

test("slider window, drag, jump, zoom", () => {
    assert.deepStrictEqual(windowRange(156), [0, 156]);
    assert.deepStrictEqual(windowRange(156, 5, 40), [28, 40]);            // minimum 12 świec
    const [x0, x1] = sliderRect(156, 52, null, 164);
    assert.deepStrictEqual([x0, x1], [4 + 104 / 156 * 156, 160]);
    assert.strictEqual(sliderMode(x0 + 2, x0, x1), "left");
    assert.strictEqual(sliderMode((x0 + x1) / 2, x0, x1), "move");
    assert.strictEqual(sliderMode(10, x0, x1), "jump");
    assert.deepStrictEqual(sliderDrag("move", [52, null], -1000, 156, 164), [52, 52]);
    assert.deepStrictEqual(sliderDrag("left", [52, null], -52, 156, 164), [104, 156]);
    assert.deepStrictEqual(sliderJump(4, 156, 52, 164), [52, 52]);
    assert.deepStrictEqual(zoomWindow(156, null, null, 0.5), [78, 156]);
    assert.ok(sliderSvg(weekly(156).c, 52, null, 400, 46).includes("52 tyg."));
});

test("chart window keeps indicators from full history", () => {
    const full = chartSvg(weekly(156), null, 1000, 600), win = chartSvg(weekly(156), null, 1000, 600, 52, 100);
    assert.strictEqual(win.geom.n, 52);
    assert.strictEqual(win.geom.i0, 48);
    assert.strictEqual(full.geom.i0, 0);
    assert.deepStrictEqual(infoLines(weekly(156), win.geom.i0)[0], "tydz. " + weekly(156).d[48]);
});

test("RWB, Stochastic, Blue Dot and RWB starts like calc.py", () => {
    const { rwb, blueDots, stochK, rwbStarts } = CH;
    const n = 160, c = [];
    for (let i = 0; i < n; i++) c.push(50 + i * 0.4);
    const top = c[149];
    c.splice(150, 4, top - 3, top - 6, top - 7, top - 1);   // korekta w trendzie i odbicie: %K przecina 20 w górę
    const h = c.map((x) => x + 1), l = c.map((x) => x - 1);
    assert.ok(rwb(c)[148] && !rwb(Array.from({ length: 80 }, (_, i) => 100 - i))[79]);
    assert.ok(stochK(h, l, c)[151] < 20 && stochK(h, l, c)[153] > 20);
    assert.deepStrictEqual(blueDots(h, l, c, 40), [153]);
    assert.deepStrictEqual(blueDots(h, l, c, 1e9), []);
    const t = Array.from({ length: 120 }, (_, i) => 100 + i).concat(Array.from({ length: 25 }, (_, i) => 220 - 3 * i), Array.from({ length: 60 }, (_, i) => 145 + 2 * i));
    const starts = rwbStarts(t), r = rwb(t);
    assert.ok(starts.length && starts.every((i) => r[i] && !r[i - 1] && i >= 60) && starts[starts.length - 1] > 145);
    assert.deepStrictEqual(rwbStarts(Array.from({ length: 50 }, (_, i) => 100 + i)), []);
});

test("RWB strip, Blue Dot and start arrow are drawn only with the RWB toggle; no GMMA fan", () => {
    const t = Array.from({ length: 120 }, (_, i) => 100 + i).concat(Array.from({ length: 25 }, (_, i) => 220 - 3 * i), Array.from({ length: 60 }, (_, i) => 145 + 2 * i));
    const d = t.map((_, i) => new Date(Date.UTC(2020, 0, 6 + 7 * i)).toISOString().slice(0, 10));
    const w = { d, o: t, h: t.map((x) => x + 1), l: t.map((x) => x - 1), c: t, v: t.map(() => 1e6) };
    const off = chartSvg(w, null, 1000, 700), on = chartSvg(w, null, 1000, 700, null, null, [], null, null, "W", { rwb: true });
    assert.ok(!off.svg.includes('fill="#f5c518"') && !off.svg.includes("start RWB"));
    assert.ok(on.svg.includes('fill="#f5c518"') && on.svg.includes("RWB START · dokup") && on.svg.includes('height="4.0" fill="#3b82f6"'));
    assert.ok(on.svg.includes("pasek RWB, ● Blue Dot, ▲ start RWB = dokup") && !on.svg.includes('stroke="#e5484d" stroke-width="1"'));   // sam wskaźnik, bez wachlarza
    assert.ok(!/<text[^>]*>RWB START/.test(on.svg));   // sama strzałka, bez napisu na wykresie (tytuł tylko w dymku)
});

test("earnings, ruler text, RS Line", () => {
    const { earningsIndices, rulerText, rsLine } = CH;
    const w = weekly(60);
    assert.deepStrictEqual(earningsIndices(w.d, [w.d[10], "2024-03-13"]), [10]);   // 2024-03-13 jest w tygodniu od 2024-03-11 (indeks 10)
    assert.strictEqual(rulerText(100, 125, 3, 11, "W"), "+25.0 % · 8 tyg. · 100.00 → 125.00");
    assert.strictEqual(rulerText(100, 125, 3, 11, "M"), "+25.0 % · 8 mies. · 100.00 → 125.00");
    assert.deepStrictEqual(rsLine([10, 20, null], [5, 4, 2]), [2, 5, null]);
    const w2 = weekly(150), spx = { d: w2.d, c: w2.c.map((_, i) => 400 - i) };
    const svg = chartSvg(w2, { rs: 61 }, 1000, 700, null, null, [], null, spx).svg;
    assert.ok(svg.includes("+61 pp") && svg.includes("średnia 52 tyg.") && !svg.includes("RS Rating"));
});

test("mobile layout shortens labels but keeps a readable MACD panel", () => {
    const w = weekly(156), spx = { d: w.d, c: w.c.map((x) => x * 4) };
    const g = CH.geometry(390, 700, 52, "W");
    assert.ok(g.macd[1] - g.macd[0] > 80, "MACD should have a real panel, not a thin strip");
    assert.ok(chartSvg(w, { rs: 61 }, 390, 700, null, null, [], null, spx).svg.includes("RS / MA 52 tyg."));
});

test("relative volume and axis labels", () => {
    const { relVolume, axisSpots } = CH;
    assert.ok(Math.abs(relVolume(Array(10).fill(10).concat([25]), 10) - 2.5) < 1e-9);
    assert.strictEqual(relVolume([10, 10], 10), null);
    assert.deepStrictEqual(axisSpots(100, 105, null), [116, null]);
    assert.deepStrictEqual(axisSpots(100, 95, 300), [84, 300]);
    assert.deepStrictEqual(axisSpots(100, 200, 110), [200, 116]);
});

test("Deepvue-style RS markers: RS high with price (green) and before price (pink)", () => {
    const { rsMarkers } = CH;
    assert.deepStrictEqual(rsMarkers([1, 1, 1, 1.2, 1.3], [10, 10, 10, 11, 9], 3), { 3: true, 4: false });
});

test("future slots: empty candles on the right, lines can be drawn into the future", () => {
    const { futureDates, extendData } = CH;
    const w = weekly(100);
    assert.deepStrictEqual(futureDates(["2024-01-01"], 2, "W"), ["2024-01-08", "2024-01-15"]);
    assert.deepStrictEqual(futureDates(["2025-11-15"], 3, "M"), ["2025-12-15", "2026-01-15", "2026-02-15"]);
    const ext = extendData(w, 12, "W");
    assert.strictEqual(ext.c.length, 112) ; assert.strictEqual(ext.real, 100);
    assert.ok(ext.d[100] > ext.d[99] && ext.c[100] === null && ext.h[111] === null);
    const ln = [{ id: "f", d1: ext.d[80], p1: 130, d2: ext.d[105], p2: 160, alert: false }];
    const res = chartSvg(ext, { glb: 120 }, 1000, 700, null, null, ln, null, null, "W", { real: 100 });
    assert.strictEqual(res.geom.n, 112);
    assert.strictEqual(res.geom.real, 100);
    const s = res.geom.segs[0], boundary = res.geom.x0 + 100 * res.geom.step;
    assert.ok(s.x2 > boundary && s.x1 < boundary);   // linia sięga w przyszłość
    assert.ok(res.svg.includes('stroke-dasharray="2 4"'));   // pionowa granica prawdziwych świec (i kropkowana GLB)
});

test("price view: zoom narrows, pan shifts, defaults keep the auto range", () => {
    const { priceView } = CH;
    assert.deepStrictEqual(priceView(0, 2), [0, 2]);
    assert.deepStrictEqual(priceView(0, 2, 2, 0), [0.5, 1.5]);
    assert.deepStrictEqual(priceView(0, 2, 1, 0.5), [1, 3]);
    const w = weekly(100), auto = chartSvg(w, null, 1000, 700).geom, z = chartSvg(w, null, 1000, 700, null, null, [], null, null, "W", { pv: [2, 0] }).geom;
    assert.ok(Math.abs((z.lmax - z.lmin) * 2 - (auto.lmax - auto.lmin)) < 1e-9);
    const sh = chartSvg(w, null, 1000, 700, null, null, [], null, null, "W", { pv: [1, 0.5] }).geom;
    assert.ok(sh.lmin > auto.lmin);
});

test("manual stop: dashed red line with label and axis price; arrow when outside the scale", () => {
    const w = weekly(100), res = chartSvg(w, { glb: 120 }, 1000, 700, null, null, [], null, null, "W", { stop: 120, stopLabel: "stop 120.00 (−5 %) · 4,5 akcji" });
    assert.ok(res.svg.includes('stroke="#ff5c5c" stroke-width="2" stroke-dasharray="7 4"') && res.svg.includes("stop 120.00 (−5 %) · 4,5 akcji"));
    assert.ok(res.geom.stopY > res.geom.price[0] && res.geom.stopY < res.geom.price[1]);
    const below = chartSvg(w, null, 1000, 700, null, null, [], null, null, "W", { stop: 1, stopLabel: "stop" });
    assert.ok(below.svg.includes("▼ stop") && below.geom.stopY === null);
});

test("SMA 10 and bars are clipped to the price panel when the scale is zoomed away", () => {
    const w = weekly(100), res = chartSvg(w, null, 1000, 700, null, null, [], null, null, "W", { pv: [6, -3] });
    assert.ok(res.svg.includes('clip-path="url(#pclip)"') && res.svg.includes('<clipPath id="pclip">'));
});

test("monthly series: closed months + open month built from weekly candles, Green Line from closed months", () => {
    const { monthlyWithOpen, greenLine, glbPeak } = CH;
    const months = Array.from({ length: 30 }, (_, i) => `${2024 + Math.floor(i / 12)}-${String(1 + (i % 12)).padStart(2, "0")}-01`);
    const hs = months.map((_, i) => (i === 10 ? 200 : 100 + i));
    const mon = { d: months, o: hs.map((x) => x - 1), h: hs, l: hs.map((x) => x - 2), c: hs.map((x) => x - 0.5), v: hs.map(() => 1e6) };
    const wk = { d: ["2026-06-01", "2026-06-08", "2026-06-15"], o: [1, 2, 3], h: [5, 9, 6], l: [0.5, 1, 2], c: [2, 3, 4], v: [10, 20, 30] };   // czerwiec 2026 = po ostatnim zamkniętym (2026-06 = indeks 29)
    const m = monthlyWithOpen({ ...mon, d: mon.d.slice(0, 29), o: mon.o.slice(0, 29), h: mon.h.slice(0, 29), l: mon.l.slice(0, 29), c: mon.c.slice(0, 29), v: mon.v.slice(0, 29) }, wk);
    assert.strictEqual(m.nClosed, 29);
    assert.strictEqual(m.c.length, 30);
    assert.deepStrictEqual([m.d[29], m.o[29], m.h[29], m.l[29], m.c[29], m.v[29]], ["2026-06-01", 1, 9, 0.5, 4, 60]);
    assert.deepStrictEqual(greenLine(hs.slice(0, 29)), [200, 10]);
    assert.deepStrictEqual(greenLine([100, 150, 140]), [null, null]);   // szczyt bez 2 potwierdzających miesięcy
    assert.deepStrictEqual(glbPeak({ ...m, real: 30 }, null, "M"), [200, 10]);
    const res = chartSvg(m, { rs: 5 }, 1000, 700, null, null, [], null, null, "M", { real: 30 });
    assert.ok(res.svg.includes("SMA 10 mies.") && res.svg.includes("RS Line — brak danych SPY") && res.svg.includes(">2025<"));
    assert.ok(res.svg.includes("200.00"));   // Green Line z zamkniętych miesięcy
});

test("weekly lines show on M and monthly lines show on T as pale read-only dashes without handles", () => {
    const w = weekly(100), ln = [{ id: "a", d1: w.d[20], p1: 71, d2: w.d[40], p2: 91, alert: false, ro: true }];
    const res = chartSvg(w, null, 1000, 700, null, null, ln, null);
    assert.ok(res.svg.includes('stroke="#6b9fc8"') && res.svg.includes('stroke-dasharray="7 3"'));
    assert.deepStrictEqual(res.geom.segs, []);   // tylko do odczytu: nie do trafienia myszą
});

test("Zanger view: price + volume only, pattern outline, buy label, parabola exit, SPY background", () => {
    const w = weekly(120), last = w.c[w.c.length - 1], spx = { d: w.d, c: w.c.map((x) => 100 + x) };
    const row = {
        patterns: [{ name: "Flat Base", state: "BUDUJE SIĘ", buy: last * 1.02, pct: -2, end: w.d[w.d.length - 1], vol_x: null,
            shapes: [{ kind: "box", d1: w.d[100], d2: w.d[119], lo: last * 0.95, hi: last * 1.02 }] }],
        parabola: { exit: last * 0.9, shapes: [{ kind: "curve", d1: w.d[90], pts: w.d.slice(90, 120).map((d, k) => [d, last * (0.8 + 0.007 * k)]) }] },
    };
    const z = chartSvg(w, row, 1000, 600, null, null, [], null, spx, "W", { zanger: true, spyM: spyMonthly() });
    assert.ok(z.svg.includes("Flat Base · kupno &gt;") || z.svg.includes("Flat Base · kupno >"));
    assert.ok(z.svg.includes("PARABOLA"));
    assert.ok(!z.svg.includes("MACD") && !z.svg.includes("Przychody kw.") && !z.svg.includes("RS Line"));
    assert.ok(z.svg.includes('fill="#0f2a1c"'));   // tło SPY > SMA 10 także w widoku Z
    assert.strictEqual(z.geom.rs, null);
    const plain = chartSvg(w, row, 1000, 600);
    assert.ok(!plain.svg.includes("PARABOLA") && plain.geom.rs);
});

test("Parabolic Curve draws numbered rising lines and the exit / break label", () => {
    const w = weekly(80), d = w.d, last = w.c[w.c.length - 1];
    const lines = [[10, 60, 1], [30, 70, 2], [50, 76, 3]].map(([a, b, k]) => ({ kind: "line", d1: d[a], d2: d[79], p1: 50 + a, p2: last - 8 + b / 10, label: String(k) }));
    const mk = (state) => chartSvg(w, { parabola: { state, exit: last - 1, vol_x: 1.7, shapes: lines } }, 1000, 600, null, null, [], null, null, "W", { zanger: true }).svg;
    assert.ok(mk("TRWA").includes("wyjście: zamknięcie tyg. pod linią 3") && !mk("TRWA").includes("ZŁAMANA"));
    assert.ok(mk("ZŁAMANA").includes("ZŁAMANA najbardziej stroma linia") && mk("ZŁAMANA").includes("wol. 1.7×"));
    assert.ok(/>1<\/text>/.test(mk("TRWA")) && />3<\/text>/.test(mk("TRWA")));
});

test("Zanger patterns: sell-side label, LS / H / RS marks and the new colours", () => {
    const w = weekly(80), d = w.d, last = w.c[w.c.length - 1];
    const row = {
        patterns: [
            { name: "Head & Shoulders", side: "sell", state: "ZŁAMANA", buy: last + 2, pct: -2.5, end: d[75], vol_x: null, shapes: [
                { kind: "line", d1: d[40], d2: d[79], p1: last - 10, p2: last + 2 }, ...[[50, "LS"], [60, "H"], [70, "RS"]].map(([i, t]) => ({ kind: "mark", d: d[i], p: w.c[i] + 3, text: t, below: false }))] },
            { name: "Falling Wedge", side: "buy", state: "WYBICIE", buy: last - 3, pct: 4, end: d[75], vol_x: 1.4, shapes: [{ kind: "line", d1: d[40], d2: d[79], p1: last + 8, p2: last - 3 }] },
        ],
    };
    const svg = chartSvg(w, row, 1000, 600, null, null, [], null, null, "W", { zanger: true }).svg;
    assert.ok(svg.includes("⚠ Head &amp; Shoulders · linia") && svg.includes("ZŁAMANA") && svg.includes("Falling Wedge · kupno &gt;"));
    for (const t of ["LS", "H", "RS"]) assert.ok(new RegExp(`>${t}</text>`).test(svg), t);
    assert.ok(svg.includes("#ff6b6b") && svg.includes("#34d399"));
});

test("trend line extension is drawn only when its alert is on", () => {
    const w = weekly(60), ln = (alert) => [{ id: "a", d1: w.d[20], p1: 71, d2: w.d[40], p2: 91, alert }];
    const off = chartSvg(w, null, 1000, 600, null, null, ln(false), null), on = chartSvg(w, null, 1000, 600, null, null, ln(true), null);
    assert.ok(!off.svg.includes('stroke-dasharray="4 4"') && on.svg.includes('stroke-dasharray="4 4"'));
    assert.strictEqual(off.geom.segs[0].xe, off.geom.segs[0].x2);
    assert.ok(on.geom.segs[0].xe > on.geom.segs[0].x2);
});

test("shares text: fractional, no trailing zeros", () => {
    const { sharesText } = CH;
    assert.deepStrictEqual([20, 12.5, 0.3333, 0.6666].map(sharesText), ["20", "12,5", "0,3333", "0,6666"]);
});


test("background always comes from SPY on the MONTHLY chart (SMA 10 mies.), also on T and Z", () => {
    const { monthlyRegime } = CH;
    const w = weekly(100), fallingWeekly = { d: w.d, c: w.c.map((_, i) => 400 - i) };   // tygodniowy SPY spada
    const bg = (svg) => svg.includes('fill="#0f2a1c"');
    assert.ok(bg(chartSvg(w, null, 1000, 700, null, null, [], null, fallingWeekly, "W", { spyM: spyMonthly(true) }).svg));    // miesięczny rośnie -> tło mimo spadku tygodniowego
    assert.ok(!bg(chartSvg(w, null, 1000, 700, null, null, [], null, { d: w.d, c: w.c.map((x) => 100 + x) }, "W", { spyM: spyMonthly(false) }).svg));   // miesięczny spada -> brak tła mimo wzrostu tygodniowego
    assert.ok(!bg(chartSvg(w, null, 1000, 700, null, null, [], null, { d: w.d, c: w.c.map((x) => 100 + x) }).svg));   // bez miesięcznego SPY brak tła (nie ma zastępstwa tygodniowym)
    assert.ok(bg(chartSvg(w, null, 1000, 700, null, null, [], null, null, "W", { zanger: true, spyM: spyMonthly(true) }).svg));   // Z: to samo
    const sm = spyMonthly(true);
    assert.deepStrictEqual(monthlyRegime(["2025-03-03", "2025-03-31"], sm, "W"), [true, true]);   // tydzień dostaje stan miesiąca swojego piątku
    assert.deepStrictEqual(monthlyRegime(["2025-03-03"], null, "W"), [null]);
    assert.deepStrictEqual(monthlyRegime(sm.d, sm, "M"), CH.spyRegime(sm.d, sm, "M"));   // na M bez zmian
});
