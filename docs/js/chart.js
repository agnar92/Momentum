// Jeden wykres (port desktop/chart.py z Momentum Desktop): nad ceną RS Line jak w Deepvue (akcja / SPY + średnia, szczyty RS), tygodniowy słupkowy
// (High–Low, kreska zamknięcia), SMA 4 / 10 / 30 tyg., Green Line, linie trendu użytkownika, stop (MACD / pozycja), E = raporty, wolumen ze średnią,
// przychody kwartalne i MACD (12, 26, 9) ze znacznikiem przecięcia w dół; dzienny: linia + RWB / GMMA + Blue Dot albo słupki + EMA 8/10/20, SMA 50.
// Skala ceny logarytmiczna. Suwak nad wykresem (minimapa całej historii) wybiera okno. Średnie i MACD liczymy na całej historii.
// Czyste funkcje (SVG jako tekst) — testy w tests/js/chart.test.js.
"use strict";

const C = {
    bg: "#0e1116", grid: "#1a1f26", dim: "#6b7684", fg: "#d5d9e0", up: "#d5d9e0", down: "#e5484d",
    rs: "#38bdf8", sma4: "#22d3ee", sma10: "#e5484d", sma30: "#f0b429", tline: "#22d3ee", fast: "#e5484d", slow: "#3b82f6", rwbBg: "#232a33", dot: "#4aa3ff", glb: "#3ddc84", glbHalo: "#0a2e18", stop: "#ff5c5c",
    macd: "#4aa3ff", signal: "#f0b429", histUp: "#2f9e5a", histDown: "#a33a3e", volAvg: "#ff9f43",
};
const SMA_PERIODS = [4, 10, 30];
const LN = typeof require !== "undefined" ? require("./lines.js") : window;   // dateIndex, lineAt (lines.js ładowany przed chart.js)

function sma(values, n) {
    const out = [];
    let s = 0;
    for (let i = 0; i < values.length; i++) {
        s += values[i];
        if (i >= n) s -= values[i - n];
        out.push(i >= n - 1 ? s / n : null);
    }
    return out;
}

function ema(values, n) {
    const k = 2 / (n + 1), out = [];
    let prev = null;
    for (const v of values) {
        prev = prev === null ? v : prev + k * (v - prev);
        out.push(prev);
    }
    return out;
}

// -> {macd, signal, hist}; tak samo jak calc.macd w Pythonie (EMA od pierwszej wartości)
function macd(closes, fast = 12, slow = 26, sig = 9) {
    const f = ema(closes, fast), s = ema(closes, slow);
    const m = f.map((v, i) => v - s[i]);
    const sg = ema(m, sig);
    return { macd: m, signal: sg, hist: m.map((v, i) => v - sg[i]) };
}

// RWB (Guppy, Dr Wish): 6 szybkich EMA (czerwone) nad 6 wolnymi (niebieskie) — jak calc.gmma / calc.rwb
const GMMA_FAST = [3, 5, 8, 10, 12, 15], GMMA_SLOW = [30, 35, 40, 45, 50, 60];
const gmma = (closes) => [GMMA_FAST.map((n) => ema(closes, n)), GMMA_SLOW.map((n) => ema(closes, n))];
function rwb(closes) {
    const [f, s] = gmma(closes);
    return closes.map((_, i) => Math.min(...f.map((x) => x[i])) > Math.max(...s.map((x) => x[i])));
}

// Stochastic (n, 1) %K (null bez n świec albo przy zerowym zakresie) — jak calc.stoch_k
function stochK(highs, lows, closes, n = 10) {
    return closes.map((c, i) => {
        if (i < n - 1 || c == null) return null;
        const hh = Math.max(...highs.slice(i - n + 1, i + 1).filter((v) => v != null)), ll = Math.min(...lows.slice(i - n + 1, i + 1).filter((v) => v != null));
        return isFinite(hh) && isFinite(ll) && hh > ll ? (c - ll) / (hh - ll) * 100 : null;
    });
}

// Blue Dot: %K przecina `lvl` od dołu przy RWB i zamknięciu nad Green Line -> indeksy świec (jak calc.blue_dots)
function blueDots(highs, lows, closes, level, lvl = 20) {
    const k = stochK(highs, lows, closes), r = rwb(closes.map((c) => c || 0)), out = [];
    for (let i = 1; i < closes.length; i++)
        if (k[i] != null && k[i - 1] != null && k[i - 1] < lvl && k[i] >= lvl && r[i] && level && closes[i] >= level) out.push(i);
    return out;
}

// tygodnie, w których histogram przeszedł z ≥ 0 na < 0 (MACD przeciął sygnał w dół)
function macdCrossDown(hist) {
    const out = [];
    for (let i = 1; i < hist.length; i++) if (hist[i] < 0 && hist[i - 1] >= 0) out.push(i);
    return out;
}

// podziałka ceny: okrągłe wartości 1/2/5 × 10^k w zakresie
function ticks(lo, hi, n = 7) {
    if (!(hi > lo && lo > 0)) return [];
    let step = Math.pow(10, Math.floor(Math.log10((hi - lo) / n || 1)));
    for (const m of [1, 2, 5, 10]) {
        if ((hi - lo) / (step * m) <= n) { step *= m; break; }
    }
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toPrecision(12));
    return out;
}

function fmt(v) {
    if (v === null || v === undefined || !isFinite(v)) return "—";
    return Math.abs(v) < 1000 ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtVol(v) {
    if (v === null || v === undefined) return "—";
    return v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : (v / 1e3).toFixed(0) + "K";
}

// wolumen relatywny: ostatni / średnia n poprzednich (null przy braku danych) — jak calc.rel_volume
function relVolume(vols, n) {
    if (vols.length < n + 1 || !vols[vols.length - 1]) return null;
    const prev = vols.slice(-1 - n, -1).filter((x) => x != null && isFinite(x)), avg = prev.length >= n * 0.8 ? prev.reduce((a, b) => a + b, 0) / prev.length : 0;
    return avg > 0 ? vols[vols.length - 1] / avg : null;
}

// pozycje napisów na prawej osi: Green Line zostaje, ostatnia cena i stop odsuwają się, gdy nachodzą — jak chart.axis_spots
function axisSpots(levelY, lastY, stopY, gap = 16) {
    const away = (y, ref) => (y == null || ref == null || Math.abs(y - ref) >= gap ? y : y >= ref ? ref + gap : ref - gap);
    const l = away(lastY, levelY);
    return [l, away(away(stopY, levelY), l)];
}

// linia siły relatywnej jak w IBD: zamknięcie akcji / zamknięcie S&P 500 w tym samym tygodniu (null, gdy brak) — jak chart.rs_line
const rsLine = (closes, spx) => closes.map((c, i) => (c && spx[i] ? c / spx[i] : null));

// panele jak desktop chart.geometry: RS Line (Deepvue) 10 %, cena 50 %, wolumen 10 %, przychody kwartalne 11 %, MACD reszta;
// dzienny (D): RS Line, cena (linia zamknięć + RWB + Blue Dot albo słupki + średnie) i wolumen — bez przychodów i MACD
function geometry(w, h, right = 64, period = "W") {
    const top = 8, ph = h - top - 22, s1 = top + ph * 0.10, p0 = s1 + 8;
    if (period === "Z") {   // widok Zangera: sama cena (log) i wolumen, bez RS / przychodów / MACD
        const p1 = top + ph * 0.80;
        return { rs: null, price: [top, p1], vol: [p1 + 6, h - 22], rev: null, macd: [h - 22, h - 22], x0: 6, x1: w - right, w, h };
    }
    if (period === "D") {
        const p1 = p0 + ph * 0.74;
        return { rs: [top, s1], price: [p0, p1], vol: [p1 + 6, h - 22], rev: null, macd: [h - 22, h - 22], x0: 6, x1: w - right, w, h };
    }
    const p1 = p0 + ph * 0.50, v0 = p1 + 6, v1 = v0 + ph * 0.10, r0 = v1 + 8, r1 = r0 + ph * 0.11;
    return { rs: [top, s1], price: [p0, p1], vol: [v0, v1], rev: [r0, r1], macd: [r1 + 8, h - 22], x0: 6, x1: w - right, w, h };
}

const fmtBig = (v) => (v >= 1e9 ? (v / 1e9).toFixed(1) + " mld" : (v / 1e6).toFixed(0) + " mln");

function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------- suwak okna czasu ----------
const MIN_WEEKS = 12;

// -> [i0, i1] okna: nShow tygodni (min. MIN_WEEKS, domyślnie wszystkie) kończące się na `end` (domyślnie ostatni tydzień)
function windowRange(total, nShow, end) {
    const n = nShow == null ? total : Math.max(Math.min(MIN_WEEKS, total), Math.min(Math.round(nShow), total));
    const e = end == null ? total : Math.max(n, Math.min(Math.round(end), total));
    return [e - n, e];
}

function sliderRect(total, nShow, end, width, pad = 4) {
    const [i0, i1] = windowRange(total, nShow, end), w = Math.max(1, width - 2 * pad);
    return [pad + i0 / total * w, pad + i1 / total * w];
}

// co chwycono: left / right (krawędzie), move (ramka) albo jump (tor poza ramką)
function sliderMode(x, x0, x1, edge = 9) {
    if (Math.abs(x - x0) <= edge) return "left";
    if (Math.abs(x - x1) <= edge) return "right";
    return x > x0 && x < x1 ? "move" : "jump";
}

// nowe [nShow, end] po przeciągnięciu o dx px; start = [nShow, end] z chwili chwycenia
function sliderDrag(mode, start, dx, total, width, pad = 4) {
    let [i0, i1] = windowRange(total, start[0], start[1]);
    const n0 = i1 - i0, d = Math.round(dx * total / Math.max(1, width - 2 * pad));
    if (mode === "move") {
        i0 += d; i1 += d;
        if (i0 < 0) { i0 = 0; i1 = n0; }
        if (i1 > total) { i0 = total - n0; i1 = total; }
    } else if (mode === "left") i0 = Math.max(0, Math.min(i0 + d, i1 - MIN_WEEKS));
    else i1 = Math.min(total, Math.max(i1 + d, i0 + MIN_WEEKS));
    return [i1 - i0, i1];
}

// klik na torze poza ramką: ramka wyśrodkowana na klikniętym tygodniu
function sliderJump(x, total, nShow, width, pad = 4) {
    const [i0, i1] = windowRange(total, nShow), n = i1 - i0;
    const centre = (x - pad) / Math.max(1, width - 2 * pad) * total;
    return [n, Math.max(n, Math.min(total, Math.round(centre + n / 2)))];
}

// zoom: długość okna × factor, prawy brzeg zostaje
function zoomWindow(total, nShow, end, factor) {
    const [i0, i1] = windowRange(total, nShow, end);
    return [Math.max(Math.min(MIN_WEEKS, total), Math.min(total, Math.round((i1 - i0) * factor))), i1];
}

// minimapa zamknięć (skala log) + ramka okna z uchwytami i długością
function sliderSvg(closes, nShow, end, W, H, unit = "tyg.") {
    const total = closes.length;
    if (W < 40 || total < 2) return "";
    const [x0, x1] = sliderRect(total, nShow, end, W), [i0, i1] = windowRange(total, nShow, end);
    const cy = H / 2, left = 5, right = W - 5, label = `${i1 - i0} ${unit}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Consolas, Menlo, monospace">` +
        `<rect width="${W}" height="${H}" fill="${C.bg}"/>` +
        `<line x1="${left}" y1="${cy}" x2="${right}" y2="${cy}" stroke="#354150" stroke-width="3" stroke-linecap="round"/>` +
        `<line x1="${x0.toFixed(1)}" y1="${cy}" x2="${x1.toFixed(1)}" y2="${cy}" stroke="#4aa3ff" stroke-width="3" stroke-linecap="round"/>` +
        [x0, x1].map((x) => `<circle cx="${x.toFixed(1)}" cy="${cy}" r="5" fill="#4aa3ff" stroke="${C.bg}" stroke-width="1.5"/>`).join("") +
        `<text x="${Math.max(8, Math.min(W - 8, (x0 + x1) / 2)).toFixed(1)}" y="${Math.max(10, cy - 5).toFixed(1)}" fill="${C.fg}" font-size="10" text-anchor="middle">${label}</text></svg>`;
}

// -> {svg, geom} albo null; data = {d, o, h, l, c, v}, row = wiersz listy (glb, macd_stop); okno = nShow tygodni do `end`;
// lines = linie trendu [{id, d1, p1, d2, p2, alert}] (lines.js), sel = id zaznaczonej (uchwyty na końcach); geom.segs = linie w px (do trafienia)
// spx = tygodniowe {d, c} SPY do obliczania RS; górny panel pokazuje cenę/cenę sprzed 52 tygodni; row.qs = kwartały [{quarter, rev, rev_rr}] do panelu przychodów
// period = "W" (tygodniowy) albo "D" (dzienny: linia zamknięć, RWB + Blue Dot + GLB, bez SMA, MACD, przychodów i Stochastic)
// indeksy świec z datami raportów (E): dzienny = ta sama / następna sesja, tygodniowy = tydzień zawierający raport — jak chart.earnings_indices
function earningsIndices(dates, events, period = "W") {
    const out = new Set();
    for (const ev0 of events || []) {
        const ev = String(ev0).slice(0, 10);
        if (ev.length !== 10 || !dates.length) continue;
        if (period === "D") {
            if (ev < dates[0] || ev > dates[dates.length - 1]) continue;
            const i = dates.findIndex((d) => d >= ev);
            if (i >= 0) out.add(i);
        } else {
            const i = LN.dateIndex(dates, ev);
            if (i >= 0 && (Date.parse(ev) - Date.parse(dates[i])) / 864e5 < 7) out.add(i);
        }
    }
    return [...out].sort((a, b) => a - b);
}

// szczyty RS Line jak w Deepvue: {indeks: true (nowy szczyt RS i ceny) / false (RS przed ceną)} — jak chart.rs_markers
function rsMarkers(rs, highs, lookback) {
    const out = {};
    for (let i = lookback; i < rs.length; i++) {
        const v = rs[i], prior = rs.slice(i - lookback, i).filter((x) => x);
        if (!v || !prior.length || v <= Math.max(...prior)) continue;
        const ph = highs.slice(i - lookback, i).filter((x) => x);
        out[i] = !ph.length || (highs[i] || 0) > Math.max(...ph);
    }
    return out;
}

const DAILY_MA = [["EMA 8", 8, "#e5484d", "ema"], ["EMA 10", 10, "#f0b429", "ema"], ["EMA 20", 20, "#3b82f6", "ema"], ["SMA 50", 50, "#22d3ee", "sma"]];

// port desktop chart.draw: dailyRwb = styl dzienny „linia + RWB/GMMA + Blue Dot” (inaczej słupki OHLC + EMA 8/10/20 + SMA 50)
const PATTERN_COLORS = { "Cup & Handle": "#4da3ff", "Flat Base": "#f0b429", "Ascending Triangle": "#b084f5", "Flaga/Proporzec": "#2ec4b6" };
const PARABOLA_COLOR = "#ff4d8d";
const patternLevels = (row) => (((row && row.patterns) || []).map((p) => p.buy)).concat(row && row.parabola ? [row.parabola.exit] : []);

function chartSvg(full, row, w, h, nShow, end, lines, sel, spx, period = "W", dailyRwb = true, zanger = false) {
    const D = period === "D", u = D ? "sesji" : "tyg.";
    const total = full.c.length;
    if (total < 2) return null;
    const [i0, i1] = windowRange(total, nShow, end);
    const cfull = full.c.map((v) => (v === null ? 0 : v));
    const mdFull = macd(cfull);
    const md = { macd: mdFull.macd.slice(i0, i1), signal: mdFull.signal.slice(i0, i1), hist: mdFull.hist.slice(i0, i1) };
    const nv = D ? 50 : 10;   // średnia wolumenu i wolumen relatywny: dzienny 50 sesji, tygodniowy 10 tygodni
    const vavg = sma(full.v.map((x) => x || 0), nv).slice(i0, i1), rv = relVolume(full.v, nv);
    const crosses = macdCrossDown(mdFull.hist).filter((i) => i >= i0 && i < i1).map((i) => i - i0);
    const data = {};
    for (const k of ["d", "o", "h", "l", "c", "v"]) data[k] = full[k].slice(i0, i1);
    const c = data.c, hi = data.h, lo = data.l, vol = data.v, dates = data.d, n = c.length;
    // E = raport kwartalny: row.earn = [[data, niespodzianka EPS %, niespodzianka przychodów %]] (yfinance) — dymek jak chart.earnings_tooltip_lines
    const earnTip = {}, pctS = (x) => (x == null ? "N/D" : `${x >= 0 ? "+" : ""}${Number(x).toFixed(1)}%`);
    for (const [d0, es, rs0] of (row && row.earn) || [])
        for (const i of earningsIndices(full.d, [d0], period))
            if (i >= i0 && i < i1) earnTip[i - i0] = (earnTip[i - i0] ? earnTip[i - i0] + "\n" : "") + `WYNIKI · ${d0} · EPS ${pctS(es)} · przychody ${pctS(rs0)}`;
    const earn = new Set(Object.keys(earnTip).map(Number));
    const fs = w < 600 ? 12 : 11, small = w < 600;
    const g = geometry(w, h, small ? 52 : 64, zanger ? "Z" : period), x0 = g.x0, x1 = g.x1, step = (x1 - x0) / n;
    const xf = (i) => x0 + (i + 0.5) * step;
    const parts = [];
    const text = (x, y, s, fill, extra = "") =>
        parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" font-size="${fs}" ${extra}>${esc(s)}</text>`);
    const line = (a, b, cc, d, stroke, width = 1, extra = "") =>
        parts.push(`<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${cc.toFixed(1)}" y2="${d.toFixed(1)}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`);
    const boxText = (x, y, str, fill, extra = "") => {   // napis na tle wykresu (desktop boxed), żeby nie zlewał się ze świecami
        const wd = String(str).length * fs * 0.6 + 4, right = extra.includes("end");
        parts.push(`<rect x="${((right ? x - wd + 2 : x - 2)).toFixed(1)}" y="${(y - fs).toFixed(1)}" width="${wd.toFixed(1)}" height="${fs + 4}" fill="${C.bg}" opacity="0.85"/>`);
        text(x, y, str, fill, extra);
    };
    const poly = (pts, stroke, width) => {
        if (pts.length > 1) parts.push(`<polyline fill="none" stroke="${stroke}" stroke-width="${width}" points="${pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"/>`);
    };

    const level = row && row.glb;
    const valid = hi.concat(lo).filter((v) => v);
    const lmin0 = Math.min(...lo.filter((v) => v)), hmax0 = Math.max(...hi.filter((v) => v));
    if (level && level > lmin0 * 0.5 && level < hmax0 * 2) valid.push(level);
    if (zanger) for (const v of patternLevels(row)) if (v > hmax0 * 0.6 && v < hmax0 * 1.25) valid.push(v);   // kupno wzorców / wyjście z paraboli mają się zmieścić
    const pmin = Math.min(...valid) * (earn.size ? 0.92 : 0.97), pmax = Math.max(...valid) * 1.03;   // margines pod E tylko przy raportach
    const [y0, y1] = g.price, lmin = Math.log(pmin), lmax = Math.log(pmax);
    const yf = (p) => y1 - (Math.log(p) - lmin) / (lmax - lmin) * (y1 - y0);

    const stop0 = stopLevel(row), last0 = c[n - 1];
    const lvY = level && level > pmin && level < pmax ? yf(level) : null;
    const [lastY, stopY] = axisSpots(lvY, last0 ? yf(last0) : null, stop0 && stop0 > pmin && stop0 < pmax ? yf(stop0) : null);
    const taken = [lvY, lastY, stopY].filter((v) => v != null);
    for (const t of ticks(pmin, pmax)) {
        const y = yf(t);
        line(x0, y, x1, y, C.grid);
        if (taken.every((v) => Math.abs(y - v) >= 13)) text(x1 + 4, y + 4, fmt(t), C.dim);   // podziałka ustępuje Green Line / cenie / stopowi
    }
    const every = Math.max(1, Math.ceil((fs * 6.6 + 8) / Math.max(1e-9, step * (D ? 63 : 13))));   // co który kwartał podpis, żeby daty się nie nakładały
    let q = 0;
    for (let i = 0; i < n; i++) {
        const m = dates[i].slice(5, 7);
        if (["01", "04", "07", "10"].includes(m) && (i === 0 || dates[i - 1].slice(5, 7) !== m)) {
            line(xf(i), y0, xf(i), h - 22, C.grid);
            if (q++ % every === 0 && xf(i) > x0 + 28) text(xf(i), h - 8, dates[i].slice(0, 7), C.dim, 'text-anchor="middle"');
        }
    }
    let dots = [];
    if (D && dailyRwb) {   // linia zamknięć + tło RWB + GMMA (szybkie czerwone / wolne niebieskie) + Blue Dot
        const rw = rwb(cfull).slice(i0, i1);
        let a = null;
        rw.concat([false]).forEach((on, i) => {
            if (on && a === null) a = i;
            else if (!on && a !== null) {
                parts.push(`<rect x="${(xf(a) - step / 2).toFixed(1)}" y="${y0}" width="${(xf(i - 1) - xf(a) + step).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" fill="${C.rwbBg}"/>`);
                a = null;
            }
        });
        const [fast, slow] = gmma(cfull);
        for (const [ls, col] of [[slow, C.slow], [fast, C.fast]])
            for (const e of ls) poly(e.slice(i0, i1).map((v, i) => (v ? [xf(i), yf(v)] : null)).filter(Boolean), col, 1);
        poly(c.map((v, i) => (v ? [xf(i), yf(v)] : null)).filter(Boolean), C.fg, 1.6);
    } else if (D) {
        for (const [, k, col, kind] of DAILY_MA)
            poly((kind === "ema" ? ema(cfull, k) : sma(cfull, k)).slice(i0, i1).map((v, i) => (v ? [xf(i), yf(v)] : null)).filter(Boolean), col, 1.5);
    } else if (!zanger) {
        const smaColors = { 4: C.sma4, 10: C.sma10, 30: C.sma30 };
        for (const k of SMA_PERIODS) poly(sma(cfull, k).slice(i0, i1).map((v, i) => (v ? [xf(i), yf(v)] : null)).filter(Boolean), smaColors[k], 1.5);
    }
    if (D) dots = blueDots(full.h, full.l, full.c, level).filter((i) => i >= i0 && i < i1);
    const bw = Math.max(1, step * 0.25), tick = step * 0.35;
    if (!(D && dailyRwb)) for (let i = 0; i < n; i++) {
        if (hi[i] === null || lo[i] === null || c[i] === null) continue;
        const col = zanger ? C.fg : i === 0 || c[i - 1] === null || c[i] >= c[i - 1] ? C.up : C.down, x = xf(i);   // widok Zangera: słupki jednokolorowe
        line(x, yf(hi[i]), x, yf(lo[i]), col, bw);
        if (D) {
            if (data.o[i]) line(x - step * 0.3, yf(data.o[i]), x, yf(data.o[i]), col);
            line(x, yf(c[i]), x + step * 0.3, yf(c[i]), col);
        } else line(x - tick, yf(c[i]), x + tick, yf(c[i]), col);
    }
    for (const i of dots) {   // ● Blue Dot pod świecą
        const lw = full.l[i];
        if (lw) parts.push(`<circle cx="${xf(i - i0).toFixed(1)}" cy="${(yf(lw) + 9).toFixed(1)}" r="4" fill="${C.dot}"/>`);
    }
    for (const i of earn) if (lo[i]) {   // E = raport kwartalny, pod Low świecy
        const tip = earnTip[i];
        parts.push(`<text x="${xf(i).toFixed(1)}" y="${(yf(lo[i]) + 5 + fs).toFixed(1)}" fill="#f0b429" font-size="${fs}" font-weight="bold" text-anchor="middle">E${tip ? `<title>${esc(tip)}</title>` : ""}</text>`);
    }
    if (level && level > pmin && level < pmax) {
        const y = yf(level);
        line(x0, y, x1, y, C.glbHalo, 6);
        line(x0, y, x1, y, C.glb, 3);
        parts.push(`<rect x="${(x1 + 1).toFixed(1)}" y="${(y - 9).toFixed(1)}" width="${(w - x1 - 3).toFixed(1)}" height="18" fill="${C.glb}"/>`);
        text(x1 + 4, y + 4, fmt(level), "#000");
        // etykieta pod linią, z dala od legendy średnich u góry (desktop: max(y0 + 38, y − 11))
        boxText(x0 + 4, Math.max(y0 + 38, y - 11) + 4, small ? `GLB ${fmt(level)} · kupno do ${fmt(level * 1.1)}`
            : `GREEN LINE ${fmt(level)} · kupno do ${fmt(level * 1.1)}` + (row && row.exit === "GLB" ? " · wyjście: zamknięcie tyg. pod linią" : ""), C.glb);
    }
    if (stop0 && stop0 > pmin && stop0 < pmax) {
        const y = yf(stop0);
        line(x0, y, x1, y, C.stop, 1, 'stroke-dasharray="5 4"');
        text(x1 + 4, stopY + 4, fmt(stop0), C.stop);
    }
    const pl = row && row.plan;   // 📌 pozycja: stop −10 % i „sprzedaj połowę” przy −20 % od szczytu, z opisami w osobnych wierszach
    const used = [];
    if (pl) for (const [v, col, lab] of [[pl.stopInit, C.stop, `stop −10 % ${fmt(pl.stopInit)}`], [pl.halfAt, C.signal, `½ przy ${fmt(pl.halfAt)} (−20 % od szczytu ${fmt(pl.peak)})`]]) {
        if (!(v && v > pmin && v < pmax)) continue;
        const yy = yf(v);
        line(x0, yy, x1, yy, col, 1, 'stroke-dasharray="2 3"');
        let ly = yy - 8;
        if (used.some((u2) => Math.abs(ly - u2) < 16)) ly = Math.max(y0 + 38, Math.min(y1 - 10, ly + 17));
        used.push(ly);
        boxText(x0 + 4, ly + 4, lab, col);
    }
    if (zanger) drawPatterns();
    // linie trendu: odcinek między punktami + przedłużenie (przerywane) do ostatniego tygodnia okna
    const segs = [];
    parts.push(`<defs><clipPath id="pclip"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/></clipPath></defs><g clip-path="url(#pclip)">`);
    for (const ln of lines || []) {
        const a = LN.dateIndex(full.d, ln.d1), b = LN.dateIndex(full.d, ln.d2);
        if (a < 0 || b < 0 || a === b) continue;
        const [ia, pa, ib, pb] = a < b ? [a, ln.p1, b, ln.p2] : [b, ln.p2, a, ln.p1];
        const s = { id: ln.id, x1: xf(a - i0), y1: yf(ln.p1), x2: xf(b - i0), y2: yf(ln.p2) };
        const ie = ln.alert !== false ? Math.max(ib, i1 - 1) : ib, pe = LN.lineAt(ln, full.d, ie);   // przedłużenie tylko przy włączonym alarmie (to ono jest pilnowane)
        [s.xe, s.ye] = [xf(ie - i0), yf(pe)];
        segs.push(s);
        const on = ln.id === sel, wd = on ? 2.5 : 1.6;
        line(xf(ia - i0), yf(pa), xf(ib - i0), yf(pb), C.tline, wd);
        if (ie > ib) line(xf(ib - i0), yf(pb), s.xe, s.ye, C.tline, 1, `stroke-dasharray="4 4" opacity="0.7"`);
        if (on) for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${C.bg}" stroke="${C.tline}" stroke-width="2"/>`);
    }
    parts.push("</g>");
    for (const s of segs) {
        const ln = (lines || []).find((x) => x.id === s.id);
        if ((ln.alert !== false || ln.id === sel) && s.xe >= x1 - step && s.ye > y0 && s.ye < y1) text(x1 + 4, s.ye + 4, (ln.alert !== false ? "🔔 " : "") + fmt(LN.lineAt(ln, full.d, i1 - 1)), C.tline);
    }
    const last = c[n - 1];
    if (last) text(x1 + 4, lastY + 4, fmt(last), "#ffffff", 'font-weight="bold"');

    // wolumen + średnia (10 tyg. / 50 sesji)
    const [v0, v1] = g.vol, vv = vol.map((x) => x || 0), vmax = Math.max(...vv) || 1;
    const vy = (v) => v1 - v / vmax * (v1 - v0) * 0.85;
    for (let i = 0; i < n; i++) {
        const col = i === 0 || (c[i] || 0) >= (c[i - 1] || 0) ? C.up : C.down;
        parts.push(`<rect x="${(xf(i) - tick).toFixed(1)}" y="${vy(vv[i]).toFixed(1)}" width="${(2 * tick).toFixed(1)}" height="${(v1 - vy(vv[i])).toFixed(1)}" fill="${col}"/>`);
    }
    poly(vavg.map((a, i) => (a ? [xf(i), vy(a)] : null)).filter(Boolean), C.volAvg, 1.5);
    text(x0 + 4, v0 + 10, small ? `Vol · MA${nv}${rv != null ? ` · RV ${rv.toFixed(1)}×` : ""}` : `Wolumen · śr. ${nv} ${u}` + (rv != null ? ` · RVol ${rv.toFixed(1)}×` : ""),
        rv != null && rv >= 1.5 ? C.signal : C.dim);

    // MACD (dzienny: bez dolnego panelu — wyjście i tak po tygodniowym MACD)
    const [m0, m1] = g.macd;
    if (!D && !zanger) {
        const rng = (Math.max(...md.macd.concat(md.signal, md.hist).map(Math.abs)) || 1) * 1.25, mid = (m0 + m1) / 2;
        const ym = (v) => mid - v / rng * (m1 - m0) / 2;
        line(x0, mid, x1, mid, C.grid);
        for (let i = 0; i < n; i++) {
            const a = ym(md.hist[i]);
            parts.push(`<rect x="${(xf(i) - step * 0.3).toFixed(1)}" y="${Math.min(a, mid).toFixed(1)}" width="${(step * 0.6).toFixed(1)}" height="${Math.abs(mid - a).toFixed(1)}" fill="${md.hist[i] >= 0 ? C.histUp : C.histDown}"/>`);
        }
        poly(md.macd.map((v, i) => [xf(i), ym(v)]), C.macd, 1.3);
        poly(md.signal.map((v, i) => [xf(i), ym(v)]), C.signal, 1.3);
        for (const i of crosses) text(xf(i), m1 - 4, "▼", C.stop, 'text-anchor="middle"');
        text(x0 + 4, m0 + 10, small ? "MACD 12·26·9 · ▼ stop → Low" : `MACD (12, 26, 9) ${u} · ▼ = stop pod Low tygodnia przecięcia`, C.dim);
    }
    const legend = D ? (dailyRwb ? (small ? "GMMA · RWB · ● Blue Dot" : "GMMA: szybkie EMA (czerwone) / wolne (niebieskie) · jasne tło = RWB · ● Blue Dot")
        : DAILY_MA.map((x) => x[0]).join("  ") + " · ● Blue Dot") : SMA_PERIODS.map((k) => `SMA ${k} ${u}`).join("  ");
    boxText(x0 + 4, D ? y1 - 6 : y0 + 14, zanger ? "Widok Zangera: cena (log) + wolumen · wzorce: " + (((row && row.patterns) || []).map((p) => p.name).join(", ") || "brak") : legend, C.fg);

    // RS Line jak w Deepvue nad wykresem: akcja / SPY, średnia 52 tyg. (252 sesje), szczyty RS — jak chart.draw_rs_panel
    if (!zanger) {
        const [s0, s1] = g.rs, lookback = D ? 252 : 52;
        const spxFull = spx && spx.d ? full.d.map((d) => { const k = LN.dateIndex(spx.d, d); return k >= 0 ? spx.c[k] : null; }) : [];
        const rsFull = spxFull.length ? rsLine(full.c, spxFull) : [];
        const maFull = rsFull.map((_, i) => {
            if (i < lookback - 1) return null;
            const win = rsFull.slice(i - lookback + 1, i + 1);
            return win.every((v) => v) ? win.reduce((a, b) => a + b, 0) / lookback : null;
        });
        const rs = rsFull.slice(i0, i1), ma = maFull.slice(i0, i1), ok = rs.filter((v) => v);
        if (ok.length > 1) {
            const vals = ok.concat(ma.filter((v) => v)), lo2 = Math.log(Math.min(...vals)), hi2 = Math.log(Math.max(...vals));
            const yr = (v) => s1 - (Math.log(v) - lo2) / ((hi2 - lo2) || 1) * (s1 - s0 - 4) - 2;
            const pts = rs.map((v, i) => (v ? [xf(i), yr(v)] : null)).filter(Boolean);
            poly(pts, C.rs, 1.6);
            poly(ma.map((v, i) => (v ? [xf(i), yr(v)] : null)).filter(Boolean), "#f0b429", 1.3);
            for (const [k, withPrice] of Object.entries(rsMarkers(rsFull, full.h, lookback))) {
                const i = +k;
                if (i < i0 || i >= i1) continue;
                parts.push(`<circle cx="${xf(i - i0).toFixed(1)}" cy="${yr(rsFull[i]).toFixed(1)}" r="3.5" fill="${withPrice ? C.glb : "#f472b6"}"><title>${withPrice ? "nowy szczyt RS i ceny" : "szczyt RS przed ceną"}</title></circle>`);
            }
            const unit = D ? "252 sesji" : "52 tyg.", fullLab = `RS Line (akcja / SPY) · średnia ${unit} · ● zielony = nowy szczyt RS · ● różowy = RS przed ceną`;
            boxText(x0 + 4, s0 + 10, x1 - x0 > fullLab.length * fs * 0.62 ? fullLab : `RS / MA ${unit}`, C.rs);
            if (row && row.rs != null) boxText(x1 + 4, pts[pts.length - 1][1] + 4, `${row.rs >= 0 ? "+" : ""}${row.rs.toFixed(0)} pp`, C.rs);
        } else text(x0 + 4, s0 + 10, "RS Line — brak danych SPY", C.dim);
        line(x0, s1 + 3, x1, s1 + 3, C.grid);
    }

    // przychody kwartalne (słupki w okresie kwartału) z dynamiką r/r: zielony ≥ +25 %, żółty ≥ +15 %, szary niżej, czerwony < 0 (dzienny: bez)
    if (D || zanger) return finish();
    const [q0, q1] = g.rev, qs = (row && row.qs) || [];
    const shown = qs.map((qq, m) => {
        const b = LN.dateIndex(dates, qq.quarter), a = m > 0 ? LN.dateIndex(dates, qs[m - 1].quarter) + 1 : b - 12;
        return { ...qq, a: Math.max(0, a), b };
    }).filter((qq) => qq.b >= 0 && qq.a <= n - 1 && qq.rev > 0);
    const rmax = Math.max(1, ...shown.map((qq) => qq.rev));
    for (const qq of shown) {
        const xa = xf(qq.a) - step * 0.45, xb = xf(Math.min(qq.b, n - 1)) + step * 0.45, ht = qq.rev / rmax * (q1 - q0 - 26);
        const col = qq.rev_rr == null ? C.dim : qq.rev_rr >= 25 ? C.glb : qq.rev_rr >= 15 ? C.signal : qq.rev_rr >= 0 ? "#6b7684" : C.down;
        parts.push(`<rect x="${(xa + 1).toFixed(1)}" y="${(q1 - ht).toFixed(1)}" width="${Math.max(1, xb - xa - 2).toFixed(1)}" height="${ht.toFixed(1)}" fill="${col}" opacity="0.75"/>`);
        if (xb - xa > 22 && qq.rev_rr != null) text((xa + xb) / 2, q1 - ht - 2, `${qq.rev_rr >= 0 ? "+" : ""}${qq.rev_rr.toFixed(0)}%`, col, 'text-anchor="middle"');
    }
    text(x0 + 4, q0 + 10, qs.length
        ? (small ? `Przychody r/r · ${fmtBig(qs[qs.length - 1].rev)}` : `Przychody kw. · r/r % (zielony ≥ 25 %, żółty ≥ 15 %) · ostatni ${fmtBig(qs[qs.length - 1].rev)} $`)
        : (small ? "Przychody: brak danych" : "Przychody kw. — brak danych SEC"), C.dim);
    return finish();

    function drawPatterns() {   // jak desktop chart.draw_patterns: kontur wzorca, linia i podpis kupna; Parabolic Curve = krzywa + poziom wyjścia
        const px = (d) => { const j = LN.dateIndex(dates, d); return j < 0 ? null : xf(Math.min(j, n - 1)); };
        const shapes = (items, col) => {
            for (const sh of items) {
                if (sh.kind === "curve") poly(sh.pts.map(([d, p]) => [px(d), yf(p)]).filter(([x, y], k) => x != null && sh.pts[k][1] > pmin && sh.pts[k][1] < pmax), col, 2);
                else if (sh.kind === "box") {
                    const a = px(sh.d1), b = px(sh.d2);
                    if (a != null && b != null) parts.push(`<rect x="${(a - step * 0.45).toFixed(1)}" y="${yf(Math.min(sh.hi, pmax)).toFixed(1)}" width="${(b - a + step * 0.9).toFixed(1)}" height="${Math.max(1, yf(Math.max(sh.lo, pmin)) - yf(Math.min(sh.hi, pmax))).toFixed(1)}" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="4 3"/>`);
                } else if (sh.kind === "line") {
                    const a = px(sh.d1), b = px(sh.d2);
                    if (a != null && b != null) line(a, yf(sh.p1), b, yf(sh.p2), col, 2);
                }
            }
        };
        const usedY = [];
        ((row && row.patterns) || []).forEach((p) => {
            const col = PATTERN_COLORS[p.name] || C.fg;
            shapes(p.shapes, col);
            if (!(p.buy > pmin && p.buy < pmax)) return;
            const y = yf(p.buy), a = px(p.end);
            line(a != null ? a : x0, y, x1, y, col, 2, 'stroke-dasharray="6 3"');
            let ly = y - 9;
            for (let t = 0; t < 6 && usedY.some((u2) => Math.abs(ly - u2) < 16); t++) ly = y + 9 + 16 * t;   // podpisy kolejnych wzorców jeden pod drugim
            usedY.push(ly);
            boxText(x1 - 6, ly + 4, small ? `${p.name} > ${fmt(p.buy)} · ${p.state}` : `${p.name} · kupno > ${fmt(p.buy)} · ${p.state} (${p.pct >= 0 ? "+" : ""}${p.pct.toFixed(1)} %)${p.vol_x != null ? ` · wol. ${p.vol_x.toFixed(1)}×` : ""}`, col, 'text-anchor="end"');
        });
        const para = row && row.parabola;
        if (para) {
            shapes(para.shapes, PARABOLA_COLOR);
            if (para.exit > pmin && para.exit < pmax) {
                const y = yf(para.exit);
                line(x0, y, x1, y, PARABOLA_COLOR, 1, 'stroke-dasharray="2 3"');
                boxText(x0 + 4, y + 13, `PARABOLA · wyjście: zamknięcie tyg. pod SMA 10 ${fmt(para.exit)}`, PARABOLA_COLOR);
            }
        }
    }

    function finish() {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Consolas, Menlo, monospace">` +
            `<rect width="${w}" height="${h}" fill="${C.bg}"/>${parts.join("")}` +
            `<line id="cross" x1="0" y1="${(g.rs || g.price)[0]}" x2="0" y2="${g.macd[1]}" stroke="#3a4654" visibility="hidden"/></svg>`;
        return { svg, geom: { ...g, step, n, i0, lmin, lmax, segs } };
    }
}

// linia stopu: dla 📌 pozycji max(−10 %, MACD od wejścia), bez pozycji stop MACD wiersza; metoda GLB — brak (jak chart._stop_level)
function stopLevel(row) {
    if (!row || row.exit === "GLB") return null;
    if (row.plan) return Math.max(row.plan.macdStop || 0, row.plan.stopInit || 0) || null;
    return row.macd_stop || null;
}

// miarka (prawy przycisk): zmiana ceny w % od punktu kliknięcia i liczba świec między punktami — jak chart.ruler_text
function rulerText(p1, p2, k1, k2, period = "W") {
    const unit = period === "D" ? "sesji" : "tyg.", pct = p1 ? (p2 / p1 - 1) * 100 : 0;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)} % · ${Math.abs(k2 - k1)} ${unit} · ${fmt(p1)} → ${fmt(p2)}`;
}

// dane tygodnia pod kursorem
function infoLines(data, i) {
    const c = data.c, ch = i && c[i] && c[i - 1] ? (c[i] / c[i - 1] - 1) * 100 : null;
    return [`tydz. ${data.d[i]}`, `O ${fmt(data.o[i])}  H ${fmt(data.h[i])}`, `L ${fmt(data.l[i])}  C ${fmt(c[i])}`,
        ch === null ? "" : `zmiana ${ch >= 0 ? "+" : ""}${ch.toFixed(1)} %`, `wolumen ${fmtVol(data.v[i])}`].filter(Boolean);
}

function titleText(t, row) {
    if (!row) return t;
    const parts = [t, row.company || ""];
    const sign = (v) => (v >= 0 ? "+" : "") + v.toFixed(1);
    for (const [k, lab, unit] of [["glb_pct", "do linii", "%"], ["dopm", "Δ marża oper.", " pp"], ["rev_rr", "przychody r/r", "%"]]) {
        if (row[k] !== null && row[k] !== undefined) parts.push(`${lab} ${sign(row[k])}${unit}`);
    }
    if (row.turnover) parts.push(`obrót ${(row.turnover / 1e6).toFixed(0)} mln $/dzień`);
    return parts.filter(Boolean).join("  ·  ");
}

if (typeof module !== "undefined") module.exports = {
    sma, ema, macd, gmma, rwb, stochK, blueDots, rsLine, rsMarkers, earningsIndices, stopLevel, rulerText, relVolume, axisSpots, macdCrossDown, ticks, fmt, fmtVol, geometry, chartSvg, infoLines, titleText,
    windowRange, sliderRect, sliderMode, sliderDrag, sliderJump, zoomWindow, sliderSvg,
};
