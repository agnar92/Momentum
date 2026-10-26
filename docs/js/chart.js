// Jeden wykres (port desktop/chart.py z Momentum Desktop): tygodniowy słupkowy (High–Low, kreska zamknięcia) z ostatnich 3 lat,
// SMA 10 i 30 tyg., Green Line, linie trendu użytkownika, stop z MACD, wolumen ze średnią 10 tyg. i MACD (12, 26, 9) ze znacznikiem przecięcia w dół.
// Skala ceny logarytmiczna. Suwak nad wykresem (minimapa całej historii) wybiera okno: przeciągnij ramkę / krawędzie, klik obok = skok,
// kółko = zoom. Średnie i MACD liczymy na całej historii, więc okno nie zmienia ich wartości.
// Czyste funkcje (SVG jako tekst) — testy w tests/js/chart.test.js.
"use strict";

const C = {
    bg: "#0e1116", grid: "#1a1f26", dim: "#6b7684", fg: "#d5d9e0", up: "#d5d9e0", down: "#e5484d",
    rs: "#38bdf8", sma4: "#22d3ee", sma10: "#e5484d", sma30: "#f0b429", tline: "#22d3ee", spx: "#b392f0", fast: "#e5484d", slow: "#3b82f6", rwbBg: "#232a33", dot: "#4aa3ff", glb: "#3ddc84", glbHalo: "#0a2e18", stop: "#ff5c5c",
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

// Cena / cena sprzed 52 tygodni (lub 252 sesji na wykresie dziennym); null przed pełnym okresem.
const priceRatioLine = (closes, lookback) => closes.map((c, i) => {
    const base = i >= lookback ? closes[i - lookback] : null;
    return c > 0 && base > 0 ? c / base : null;
});
const smaValid = (values, period) => values.map((_, i) => {
    if (i < period - 1) return null;
    const window = values.slice(i - period + 1, i + 1);
    return window.every((v) => Number.isFinite(v) && v > 0) ? window.reduce((a, b) => a + b, 0) / period : null;
});

// panele: RS, cena/cena sprzed 52 tygodni, cena, wolumen, przychody kwartalne i MACD (oś czasu i odstępy osobno);
// dzienny (D): słupki OHLC, opcjonalna nakładka RWB/GMMA + Blue Dot, RS Line i wolumen — bez przychodów i MACD
function geometry(w, h, right = 64, period = "W") {
    const top = 8, ph = h - top - 22;
    // The old stacked percentages left almost no height for MACD. Keep price dominant,
    // trim the auxiliary panels, and explicitly reserve a useful lower pane.
    const rs1 = top + ph * 0.07, s0 = rs1 + 5, s1 = s0 + ph * 0.06, p0 = s1 + 8;
    if (period === "D") {
        const p1 = p0 + ph * 0.69, v0 = p1 + 6, v1 = h - 22;
        return { rs: [top, rs1], spx: [s0, s1], price: [p0, p1], vol: [v0, v1], rev: null, eps: null, macd: [v1, v1], x0: 6, x1: w - right, w, h };
    }
    // Weekly layout: compact RS and 52-week price-ratio panels, price, volume, revenue and EPS, then a readable MACD pane.
    const p1 = p0 + ph * 0.40, v0 = p1 + 6, v1 = v0 + ph * 0.08;
    const r0 = v1 + 6, r1 = r0 + ph * 0.055, e0 = r1 + 6, e1 = e0 + ph * 0.055;
    return { rs: [top, rs1], spx: [s0, s1], price: [p0, p1], vol: [v0, v1], rev: [r0, r1], eps: [e0, e1], macd: [e1 + 6, h - 22], x0: 6, x1: w - right, w, h };
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
function chartSvg(full, row, w, h, nShow, end, lines, sel, spx, period = "W", dailyRwb = true) {
    const D = period === "D", u = D ? "sesji" : "tyg.";
    const total = full.c.length;
    if (total < 2) return null;
    const [i0, i1] = windowRange(total, nShow, end);
    const cfull = full.c.map((v) => (v === null ? 0 : v));
    const mdFull = macd(cfull);
    const md = { macd: mdFull.macd.slice(i0, i1), signal: mdFull.signal.slice(i0, i1), hist: mdFull.hist.slice(i0, i1) };
    const smaWin = {};
    for (const k of SMA_PERIODS) smaWin[k] = sma(cfull, k).slice(i0, i1);
    const nv = D ? 50 : 10;   // średnia wolumenu i wolumen relatywny: dzienny 50 sesji, tygodniowy 10 tygodni
    const vavg = sma(full.v.map((x) => x || 0), nv).slice(i0, i1), rv = relVolume(full.v, nv);
    const crosses = macdCrossDown(mdFull.hist).filter((i) => i >= i0 && i < i1).map((i) => i - i0);
    const data = {};
    for (const k of ["d", "o", "h", "l", "c", "v"]) data[k] = full[k].slice(i0, i1);
    const c = data.c, hi = data.h, lo = data.l, vol = data.v, dates = data.d, n = c.length;
    const fs = w < 600 ? 12 : 11, small = w < 600;
    const g = geometry(w, h, small ? 52 : 64, period), x0 = g.x0, x1 = g.x1, step = (x1 - x0) / n;
    const xf = (i) => x0 + (i + 0.5) * step;
    const parts = [];
    const text = (x, y, s, fill, extra = "") =>
        parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" font-size="${fs}" ${extra}>${esc(s)}</text>`);
    const line = (a, b, cc, d, stroke, width = 1, extra = "") =>
        parts.push(`<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${cc.toFixed(1)}" y2="${d.toFixed(1)}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`);
    const boxText = (x, y, str, fill, extra = "") => {   // napis na tle wykresu, żeby nie zlewał się ze świecami
        parts.push(`<rect x="${(x - 2).toFixed(1)}" y="${(y - fs).toFixed(1)}" width="${(String(str).length * fs * 0.6 + 4).toFixed(1)}" height="${fs + 4}" fill="${C.bg}" opacity="0.85"/>`);
        text(x, y, str, fill, extra);
    };
    const poly = (pts, stroke, width) => {
        if (pts.length > 1) parts.push(`<polyline fill="none" stroke="${stroke}" stroke-width="${width}" points="${pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"/>`);
    };

    const level = row && row.glb, blueLevel = row && row.blb;
    const valid = hi.concat(lo).filter((v) => v);
    const lmin0 = Math.min(...lo.filter((v) => v)), hmax0 = Math.max(...hi.filter((v) => v));
    if (level && level > lmin0 * 0.5 && level < hmax0 * 2) valid.push(level);
    if (blueLevel && blueLevel > 0) valid.push(blueLevel);
    const pmin = Math.min(...valid) * 0.97, pmax = Math.max(...valid) * 1.03;
    const [y0, y1] = g.price, lmin = Math.log(pmin), lmax = Math.log(pmax);
    const yf = (p) => y1 - (Math.log(p) - lmin) / (lmax - lmin) * (y1 - y0);

    const stop0 = row && row.exit !== "GLB" && (row.plan ? Math.max(row.plan.macdStop || 0, row.plan.stopInit || 0) || null : row.macd_stop), last0 = c[n - 1];
    const lvY = level && level > pmin && level < pmax ? yf(level) : null;
    const [lastY, stopY] = axisSpots(lvY, last0 ? yf(last0) : null, stop0 && stop0 > pmin && stop0 < pmax ? yf(stop0) : null);
    const taken = [lvY, lastY, stopY].filter((v) => v != null);
    for (const t of ticks(pmin, pmax)) {
        const y = yf(t);
        line(x0, y, x1, y, C.grid);
        if (taken.every((v) => Math.abs(y - v) >= 13)) text(x1 + 4, y + 4, fmt(t), C.dim);   // podziałka ustępuje Green Line / cenie / stopowi
    }
    const every = Math.max(1, Math.ceil((fs * 6.6 + 8) / Math.max(1e-9, step * (D ? 63 : 13))));   // co który kwartał podpis, żeby daty (7 znaków) się nie nakładały
    let q = 0;
    for (let i = 0; i < n; i++) {
        const m = dates[i].slice(5, 7);
        if (["01", "04", "07", "10"].includes(m) && (i === 0 || dates[i - 1].slice(5, 7) !== m)) {
            line(xf(i), y0, xf(i), h - 22, C.grid);
            if (q++ % every === 0 && xf(i) > x0 + 28) text(xf(i), h - 8, dates[i].slice(0, 7), C.dim, 'text-anchor="middle"');
        }
    }
    const smaColors = { 4: C.sma4, 10: C.sma10, 30: C.sma30 };
    let dots = [];
    if (D && dailyRwb) {   // opcjonalna nakładka RWB/GMMA i Blue Dot na dziennych słupkach
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
        dots = blueDots(full.h, full.l, full.c, level).filter((i) => i >= i0 && i < i1);
    } else if (!D) for (const k of SMA_PERIODS) {
        const s = smaWin[k];
        poly(s.map((v, i) => (v ? [xf(i), yf(v)] : null)).filter(Boolean), smaColors[k], 1.5);
    }
    if (D) {
        // Daily chart overlays are calculated on the complete history, then clipped to the visible window.
        const dailyAverages = [
            { label: small ? "EMA10" : "EMA 10", values: ema(cfull, 10).slice(i0, i1), color: "#f0b429" },
            { label: small ? "SMA20" : "SMA 20", values: sma(cfull, 20).slice(i0, i1), color: "#22d3ee" },
            { label: small ? "SMA50" : "SMA 50", values: sma(cfull, 50).slice(i0, i1), color: "#a78bfa" },
        ];
        for (const avg of dailyAverages) {
            poly(avg.values.map((v, i) => (v ? [xf(i), yf(v)] : null)).filter(Boolean), avg.color, 1.8);
        }
        dailyAverages.forEach((avg, i) => boxText(x0 + 4 + i * (small ? 58 : 76), y0 + 13, avg.label, avg.color));
    }
    const bw = Math.max(1, step * 0.25), tick = step * 0.35;
    for (let i = 0; i < n; i++) {
        if (hi[i] === null || lo[i] === null || c[i] === null) continue;
        const col = i === 0 || c[i - 1] === null || c[i] >= c[i - 1] ? C.up : C.down, x = xf(i);
        line(x, yf(hi[i]), x, yf(lo[i]), col, bw);
        line(x - tick, yf(c[i]), x + tick, yf(c[i]), col);
    }
    if (level && level > pmin && level < pmax) {
        const y = yf(level);
        line(x0, y, x1, y, C.glbHalo, 6);
        line(x0, y, x1, y, C.glb, 3);
        parts.push(`<rect x="${(x1 + 1).toFixed(1)}" y="${(y - 9).toFixed(1)}" width="${(w - x1 - 3).toFixed(1)}" height="18" fill="${C.glb}"/>`);
        text(x1 + 4, y + 4, fmt(level), "#000");
        const aboveGlb = last0 != null && last0 >= level;
        boxText(x0 + 4, y0 + 13, small ? `GLB ${fmt(level)} ${aboveGlb ? "↑" : "↓"}` : `GLB ${fmt(level)} · CENA ${aboveGlb ? "NAD" : "POD"} LINIĄ`, aboveGlb ? C.glb : C.stop);
    }
    if (blueLevel && blueLevel > pmin && blueLevel < pmax) {
        const y = yf(blueLevel);
        line(x0, y, x1, y, "#102d50", 5);
        line(x0, y, x1, y, "#60a5fa", 2);
        parts.push(`<rect x="${(x1 + 1).toFixed(1)}" y="${(y - 9).toFixed(1)}" width="${(w - x1 - 3).toFixed(1)}" height="18" fill="#60a5fa"/>`);
        text(x1 + 4, y + 4, fmt(blueLevel), "#000");
        const aboveBlb = last0 != null && last0 >= blueLevel;
        boxText(x0 + 4, y0 + 27, small ? `BLB ${fmt(blueLevel)} ${aboveBlb ? "↑" : "↓"}` : `BLB ${fmt(blueLevel)} · CENA ${aboveBlb ? "NAD" : "POD"} LINIĄ`, aboveBlb ? "#60a5fa" : C.stop);
    }
    const stop = row && row.exit !== "GLB" && (row.plan ? Math.max(row.plan.macdStop || 0, row.plan.stopInit || 0) || null : row.macd_stop);   // metoda GLB: wyjście = zamknięcie pod Green Line, bez stopu MACD
    if (stop && stop > pmin && stop < pmax) {
        const y = yf(stop);
        line(x0, y, x1, y, C.stop, 1, 'stroke-dasharray="5 4"');
        text(x1 + 4, stopY + 4, fmt(stop), C.stop);
    }
    const pl = row && row.plan;   // 📌 pozycja: stop początkowy −10 % i „sprzedaj połowę” przy −20 % od szczytu
    if (pl) for (const [v, col] of [[pl.stopInit, C.stop], [pl.halfAt, C.signal]]) {
        if (!(v && v > pmin && v < pmax)) continue;
        line(x0, yf(v), x1, yf(v), col, 1, 'stroke-dasharray="2 3"');
        // Linie planu pozostają na wykresie; opisy poziomów trafiają do dymka, nie zasłaniają ceny.
    }
    // linie trendu: odcinek między punktami + przedłużenie (przerywane) do ostatniego tygodnia okna
    const segs = [];
    parts.push(`<defs><clipPath id="pclip"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/></clipPath></defs><g clip-path="url(#pclip)">`);
    for (const ln of lines || []) {
        const a = LN.dateIndex(full.d, ln.d1), b = LN.dateIndex(full.d, ln.d2);
        if (a < 0 || b < 0 || a === b) continue;
        const [ia, pa, ib, pb] = a < b ? [a, ln.p1, b, ln.p2] : [b, ln.p2, a, ln.p1];
        const s = { id: ln.id, x1: xf(a - i0), y1: yf(ln.p1), x2: xf(b - i0), y2: yf(ln.p2) };
        const ie = Math.max(ib, i1 - 1), pe = LN.lineAt(ln, full.d, ie);
        [s.xe, s.ye] = [xf(ie - i0), yf(pe)];
        segs.push(s);
        const on = ln.id === sel, wd = on ? 2.5 : 1.6;
        line(xf(ia - i0), yf(pa), xf(ib - i0), yf(pb), C.tline, wd);
        if (ie > ib) line(xf(ib - i0), yf(pb), s.xe, s.ye, C.tline, 1, `stroke-dasharray="4 4" opacity="0.7"`);
        if (on) for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${C.bg}" stroke="${C.tline}" stroke-width="2"/>`);
    }
    parts.push("</g>");
    for (const s of segs) {
        const ln = (lines || []).find((x) => x.id === s.id);
        if (ln.alert !== false && s.xe >= x1 - step && s.ye > y0 && s.ye < y1) text(x1 + 4, s.ye + 4, "🔔 " + fmt(LN.lineAt(ln, full.d, i1 - 1)), C.tline);
    }
    const last = c[n - 1];
    if (last) text(x1 + 4, lastY + 4, fmt(last), "#ffffff", 'font-weight="bold"');

    // wolumen + średnia 10 tyg.
    const [v0, v1] = g.vol, vv = vol.map((x) => x || 0), vmax = Math.max(...vv) || 1;
    const vy = (v) => v1 - v / vmax * (v1 - v0) * 0.85;
    for (let i = 0; i < n; i++) {
        const col = i === 0 || (c[i] || 0) >= (c[i - 1] || 0) ? C.up : C.down;
        parts.push(`<rect x="${(xf(i) - tick).toFixed(1)}" y="${vy(vv[i]).toFixed(1)}" width="${(2 * tick).toFixed(1)}" height="${(v1 - vy(vv[i])).toFixed(1)}" fill="${col}"/>`);
    }
    poly(vavg.map((a, i) => (a ? [xf(i), vy(a)] : null)).filter(Boolean), C.volAvg, 1.5);
    const volLabel = `Wolumen · śr. ${nv} ${u}` + (rv != null ? ` · RVol ${rv.toFixed(1)}×` : "");
    text(x0 + 4, v0 + 10, small ? `Vol · MA${nv}${rv != null ? ` · RV ${rv.toFixed(1)}×` : ""}` : volLabel, rv != null && rv >= 1.5 ? C.signal : C.dim);
    for (const i of dots) {   // ● Blue Dot pod świecą; stop pod Low ostatniej kropki
        const lw = full.l[i];
        if (lw) parts.push(`<circle cx="${xf(i - i0).toFixed(1)}" cy="${(yf(lw) + 9).toFixed(1)}" r="4" fill="${C.dot}"/>`);
    }
    // Blue Dot pozostaje samą kropką; data i stop będą pokazywane w dymku po najechaniu.

    // MACD (dzienny: bez dolnego panelu — tylko opis RWB / Blue Dot)
    const [m0, m1] = g.macd;
    if (D) {
        text(x0 + 4, y1 - 6, dailyRwb ? (small ? "OHLC · GMMA/RWB · Blue Dot" : "Słupki OHLC · GMMA: szybkie EMA czerwone / wolne niebieskie · RWB · Blue Dot") : "Słupki OHLC · nakładka RWB wyłączona", C.fg);
    } else {
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
        text(x0 + 4, m0 + 10, small ? "MACD 12·26·9 · ▼ stop → Low" : "MACD (12, 26, 9) tyg. · ▼ przecięcie w dół = stop pod Low tego tygodnia", C.dim);
        if (small) {
            boxText(x0 + 4, y0 + 12, "SMA4", C.sma4);
            boxText(x0 + 62, y0 + 12, "SMA10", C.sma10);
            boxText(x0 + 130, y0 + 12, "SMA30", C.sma30);
        } else {
            boxText(x0 + 4, y0 + 12, "SMA 4 tyg.", C.sma4);
            boxText(x0 + 84, y0 + 12, "SMA 10 tyg.", C.sma10);
            boxText(x0 + 174, y0 + 12, "SMA 30 tyg.", C.sma30);
        }
    }

    // Cena/Cena sprzed 52 tygodni (252 sesji na wykresie dziennym), ze średnią i szczytami jak w panelu RS.
    const [s0, s1] = g.spx, ccLookback = D ? 252 : 52;
    const ccFull = priceRatioLine(full.c, ccLookback);
    const ccAvgFull = smaValid(ccFull, ccLookback);
    const cc = ccFull.slice(i0, i1), ccAvg = ccAvgFull.slice(i0, i1);
    const ccOk = cc.filter((v) => v > 0);
    if (ccOk.length > 1) {
        const all = cc.concat(ccAvg).filter((v) => v > 0);
        const lo = Math.log(Math.min(...all)), hi2 = Math.log(Math.max(...all));
        const yc = (v) => s1 - (Math.log(v) - lo) / ((hi2 - lo) || 1) * (s1 - s0 - 4) - 2;
        poly(cc.map((v, i) => (v ? [xf(i), yc(v)] : null)).filter(Boolean), C.spx, 1.4);
        poly(ccAvg.map((v, i) => (v ? [xf(i), yc(v)] : null)).filter(Boolean), "#f0b429", 1.4);
        for (let i = Math.max(i0, ccLookback * 2 - 1); i < i1; i++) {
            const v = ccFull[i];
            if (!(v > 0)) continue;
            const prior = ccFull.slice(Math.max(0, i - ccLookback), i).filter((x) => x > 0);
            if (!prior.length || v <= Math.max(...prior)) continue;
            const priorPriceHighs = full.h.slice(Math.max(0, i - ccLookback), i).filter((x) => x > 0);
            const priceMadeHigh = !priorPriceHighs.length || full.h[i] > Math.max(...priorPriceHighs);
            const x = xf(i - i0), y = yc(v), color = priceMadeHigh ? C.glb : "#f472b6";
            parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${color}"><title>${priceMadeHigh ? "Cena/Cena 52 tyg. — nowy szczyt wskaźnika i ceny" : "Cena/Cena 52 tyg. — nowy szczyt wskaźnika przed ceną"}</title></circle>`);
        }
        const last = ccOk[ccOk.length - 1];
        text(x0 + 4, s0 + 10, small ? `C/C52T ${last.toFixed(2)}×` : `Cena/Cena 52 tyg. ${last.toFixed(2)}× · zielony = szczyt wskaźnika i ceny · różowy = wskaźnik przed ceną`, C.spx);
    } else text(x0 + 4, s0 + 10, small ? "C/C52T —" : "Cena/Cena 52 tyg. — brak pełnej historii", C.dim);
    line(x0, s1 + 3, x1, s1 + 3, C.grid);
    {   // Deepvue-style RS Line: stock / SPY, moving average, RS new-high and RS-new-high-before-price markers.
        const spxFull = spx && spx.d ? full.d.map((d) => { const k = LN.dateIndex(spx.d, d); return k >= 0 ? spx.c[k] : null; }) : [];
        const rsFull = rsLine(full.c, spxFull);
        const lookback = D ? 252 : 52;
        const rsAvgFull = sma(rsFull.map((v) => v == null ? 0 : v), lookback).map((v, i) => i < lookback - 1 || rsFull[i] == null ? null : v);
        const rs = rsFull.slice(i0, i1), rsAvg = rsAvgFull.slice(i0, i1), ok = rs.filter((v) => v > 0);
        if (ok.length > 1) {
            const all = rs.concat(rsAvg).filter((v) => v > 0);
            const [b0, b1] = g.rs, lo = Math.log(Math.min(...all)), hi2 = Math.log(Math.max(...all));
            const yr = (v) => b1 - (Math.log(v) - lo) / ((hi2 - lo) || 1) * (b1 - b0);
            const pts = rs.map((v, i) => (v ? [xf(i), yr(v)] : null));
            poly(pts.filter(Boolean), C.rs, 1.6);
            poly(rsAvg.map((v, i) => (v ? [xf(i), yr(v)] : null)).filter(Boolean), "#f0b429", 1.4);
            for (let i = Math.max(i0, lookback); i < i1; i++) {
                const v = rsFull[i];
                if (!(v > 0)) continue;
                const priorRs = rsFull.slice(Math.max(0, i - lookback), i).filter((x) => x > 0);
                if (!priorRs.length || v <= Math.max(...priorRs)) continue;
                const priorPriceHighs = full.h.slice(Math.max(0, i - lookback), i).filter((x) => x > 0);
                const priceMadeHigh = !priorPriceHighs.length || full.h[i] > Math.max(...priorPriceHighs);
                const x = xf(i - i0), y = yr(v), color = priceMadeHigh ? C.glb : "#f472b6";
                parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${color}"><title>${priceMadeHigh ? "RS new high" : "RS new high before price"}</title></circle>`);
            }
            const lastPt = pts.filter(Boolean).slice(-1)[0];
            const py = lastPt ? lastPt[1] : b1;
            if (row && row.rs != null) boxText(x1 + 4, py + 4, small ? `RS ${row.rs >= 0 ? "+" : ""}${row.rs.toFixed(0)}` : `RS 52W ${row.rs >= 0 ? "+" : ""}${row.rs.toFixed(0)} pp`, C.rs);
            if (row && row.rs_rating != null) boxText(x0 + 4, b0 + 13, small ? `RS ${Math.round(row.rs_rating)}/99` : `RS Rating ${Math.round(row.rs_rating)} / 99`, C.glb);
            text(x0 + 4, b1 - 3, small ? `RS / MA ${D ? "252s" : "52t"}` : `RS Line / MA ${D ? "252 sesji" : "52 tyg."} · zielony = nowy szczyt RS · różowy = RS przed ceną`, "#f0b429");
        }
    }

    // przychody kwartalne (słupki w okresie kwartału) z dynamiką r/r: zielony ≥ +25 %, żółty ≥ +15 %, szary niżej, czerwony < 0
    if (D) return finish();
    const [q0, q1] = g.rev, qs = (row && row.qs) || [];
    const shown = qs.map((q, m) => {
        const b = LN.dateIndex(dates, q.quarter), a = m > 0 ? LN.dateIndex(dates, qs[m - 1].quarter) + 1 : b - 12;
        return { ...q, a: Math.max(0, a), b };
    }).filter((q) => q.b >= 0 && q.a <= n - 1 && q.rev > 0);
    const rmax = Math.max(1, ...shown.map((q) => q.rev));
    for (const q of shown) {
        const xa = xf(q.a) - step * 0.45, xb = xf(Math.min(q.b, n - 1)) + step * 0.45, ht = q.rev / rmax * (q1 - q0 - 24);
        const col = q.rev_rr == null ? C.dim : q.rev_rr >= 25 ? C.glb : q.rev_rr >= 15 ? C.signal : q.rev_rr >= 0 ? "#6b7684" : C.down;
        parts.push(`<rect x="${(xa + 1).toFixed(1)}" y="${(q1 - ht).toFixed(1)}" width="${Math.max(1, xb - xa - 2).toFixed(1)}" height="${ht.toFixed(1)}" fill="${col}" opacity="0.75"/>`);
        if (xb - xa > 30 && q.rev_rr != null) text((xa + xb) / 2, q1 - ht - 2, `${q.rev_rr >= 0 ? "+" : ""}${q.rev_rr.toFixed(0)}%`, col, 'text-anchor="middle"');
    }
    text(x0 + 4, q0 + 2, qs.length
        ? (small ? `Przychody r/r · ${fmtBig(qs[qs.length - 1].rev)}` : `Przychody kw. · r/r % (zielony ≥ 25 %, żółty ≥ 15 %) · ostatni ${fmtBig(qs[qs.length - 1].rev)} $`)
        : (small ? "Przychody: brak danych" : "Przychody kw. — brak danych SEC"), C.dim);
    // EPS kwartalny jako osobne słupki, ze skalą obejmującą wartości dodatnie i ujemne.
    const [e0, e1] = g.eps, eps = ((row && row.eps_q) || []).filter((x) => Array.isArray(x) && x.length >= 2 && Number.isFinite(x[1])).slice().sort((a, b) => a[0].localeCompare(b[0]));
    const epsVisible = eps.map((x) => {
        const next = dates.findIndex((d) => d >= x[0]);
        return { date: x[0], value: x[1], idx: next < 0 ? -1 : Math.max(0, next - 1) };
    }).filter((x) => x.idx >= 0);
    if (epsVisible.length) {
        const vals = epsVisible.map((x) => x.value), emin = Math.min(0, ...vals), emax = Math.max(0, ...vals), erange = emax - emin || 1;
        const ey = (v) => e0 + 5 + (emax - v) / erange * Math.max(4, e1 - e0 - 10);
        const zero = ey(0);
        line(x0, zero, x1, zero, C.grid);
        epsVisible.forEach((x) => {
            const yy = ey(x.value), top = Math.min(zero, yy), height = Math.max(1, Math.abs(zero - yy));
            const prev = eps.find((e) => e[0].slice(0, 4) === String(Number(x.date.slice(0, 4)) - 1) && e[0].slice(5, 7) === x.date.slice(5, 7));
            const growth = prev && prev[1] !== 0 ? (x.value / prev[1] - 1) * 100 : null;
            parts.push(`<rect x="${(xf(x.idx) - Math.max(2, step * 0.28)).toFixed(1)}" y="${top.toFixed(1)}" width="${Math.max(3, step * 0.56).toFixed(1)}" height="${height.toFixed(1)}" fill="${x.value >= 0 ? C.glb : C.down}" opacity="0.85"><title>EPS ${x.value.toFixed(2)}${growth == null ? "" : " · r/r " + growth.toFixed(1) + "%"}</title></rect>`);
        });
        const lastEps = epsVisible[epsVisible.length - 1];
        boxText(x0 + 4, e0 + 11, small ? `EPS kw. ${lastEps.value.toFixed(2)}` : `EPS kwartalny ${lastEps.value.toFixed(2)} · słupki r/r w dymku`, lastEps.value >= 0 ? C.glb : C.down);
    }

    return finish();

    function finish() {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Consolas, Menlo, monospace">` +
            `<rect width="${w}" height="${h}" fill="${C.bg}"/>${parts.join("")}` +
            `<line id="cross" x1="0" y1="${g.spx[0]}" x2="0" y2="${g.macd[1]}" stroke="#3a4654" visibility="hidden"/></svg>`;
        return { svg, geom: { ...g, step, n, i0, lmin, lmax, segs } };
    }
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
    sma, ema, macd, gmma, rwb, stochK, blueDots, rsLine, priceRatioLine, relVolume, axisSpots, macdCrossDown, ticks, fmt, fmtVol, geometry, chartSvg, infoLines, titleText,
    windowRange, sliderRect, sliderMode, sliderDrag, sliderJump, zoomWindow, sliderSvg,
};
