// Jeden wykres (port desktop/chart.py z Momentum Desktop): tygodniowy słupkowy (High–Low, kreska zamknięcia) z ostatnich 3 lat,
// SMA 10 i 40 tyg., Green Line, stop z MACD, wolumen ze średnią 10 tyg. i MACD (12, 26, 9) ze znacznikiem przecięcia w dół.
// Skala ceny logarytmiczna. Suwak nad wykresem (minimapa całej historii) wybiera okno: przeciągnij ramkę / krawędzie, klik obok = skok,
// kółko = zoom. Średnie i MACD liczymy na całej historii, więc okno nie zmienia ich wartości.
// Czyste funkcje (SVG jako tekst) — testy w tests/js/chart.test.js.
"use strict";

const C = {
    bg: "#0e1116", grid: "#1a1f26", dim: "#6b7684", fg: "#d5d9e0", up: "#d5d9e0", down: "#e5484d",
    sma10: "#e5484d", sma40: "#f0b429", glb: "#3ddc84", glbHalo: "#0a2e18", stop: "#ff5c5c",
    macd: "#4aa3ff", signal: "#f0b429", histUp: "#2f9e5a", histDown: "#a33a3e", volAvg: "#ff9f43",
};
const SMA_PERIODS = [10, 40];

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

// panele: cena 62 %, wolumen 14 %, MACD reszta (oś czasu i odstępy osobno)
function geometry(w, h, right = 64) {
    const top = 22, ph = h - top - 22, p1 = top + ph * 0.62;
    const v0 = p1 + 6, v1 = v0 + ph * 0.14;
    return { price: [top, p1], vol: [v0, v1], macd: [v1 + 8, h - 22], x0: 6, x1: w - right, w, h };
}

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
function sliderSvg(closes, nShow, end, W, H) {
    const vals = closes.filter((v) => v), total = closes.length;
    if (W < 40 || vals.length < 2) return "";
    const lo = Math.log(Math.min(...vals)), hi = Math.log(Math.max(...vals));
    const y = (v) => (hi === lo ? H / 2 : H - 6 - (Math.log(v) - lo) / (hi - lo) * (H - 12));
    const [x0, x1] = sliderRect(total, nShow, end, W), [i0, i1] = windowRange(total, nShow, end);
    const pts = closes.map((v, i) => (v ? `${(4 + (i + 0.5) / total * (W - 8)).toFixed(1)},${y(v).toFixed(1)}` : null)).filter(Boolean).join(" ");
    const right = x1 - x0 > 90;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Consolas, Menlo, monospace">` +
        `<rect width="${W}" height="${H}" fill="${C.bg}"/><rect x="${x0.toFixed(1)}" y="0" width="${(x1 - x0).toFixed(1)}" height="${H}" fill="#16202c"/>` +
        `<polyline fill="none" stroke="#8b95a3" stroke-width="1" points="${pts}"/>` +
        `<rect x="${x0.toFixed(1)}" y="1" width="${(x1 - x0).toFixed(1)}" height="${H - 2}" fill="none" stroke="#4aa3ff" stroke-width="2"/>` +
        [x0, x1].map((x) => `<rect x="${(x - 3).toFixed(1)}" y="${H / 2 - 9}" width="6" height="18" fill="#4aa3ff"/>`).join("") +
        `<text x="${(right ? x1 - 6 : x1 + 6).toFixed(1)}" y="13" fill="${C.fg}" font-size="11" text-anchor="${right ? "end" : "start"}">${i1 - i0} tyg.</text></svg>`;
}

// -> {svg, geom} albo null; data = {d, o, h, l, c, v}, row = wiersz listy (glb, macd_stop); okno = nShow tygodni do `end`
function chartSvg(full, row, w, h, nShow, end) {
    const total = full.c.length;
    if (total < 2) return null;
    const [i0, i1] = windowRange(total, nShow, end);
    const cfull = full.c.map((v) => (v === null ? 0 : v));
    const mdFull = macd(cfull);
    const md = { macd: mdFull.macd.slice(i0, i1), signal: mdFull.signal.slice(i0, i1), hist: mdFull.hist.slice(i0, i1) };
    const smaWin = {};
    for (const k of SMA_PERIODS) smaWin[k] = sma(cfull, k).slice(i0, i1);
    const vavg = sma(full.v.map((x) => x || 0), 10).slice(i0, i1);
    const crosses = macdCrossDown(mdFull.hist).filter((i) => i >= i0 && i < i1).map((i) => i - i0);
    const data = {};
    for (const k of ["d", "o", "h", "l", "c", "v"]) data[k] = full[k].slice(i0, i1);
    const c = data.c, hi = data.h, lo = data.l, vol = data.v, dates = data.d, n = c.length;
    const fs = w < 600 ? 10 : 11, small = w < 600;
    const g = geometry(w, h, small ? 52 : 64), x0 = g.x0, x1 = g.x1, step = (x1 - x0) / n;
    const xf = (i) => x0 + (i + 0.5) * step;
    const parts = [];
    const text = (x, y, s, fill, extra = "") =>
        parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" font-size="${fs}" ${extra}>${esc(s)}</text>`);
    const line = (a, b, cc, d, stroke, width = 1, extra = "") =>
        parts.push(`<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${cc.toFixed(1)}" y2="${d.toFixed(1)}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`);
    const poly = (pts, stroke, width) => {
        if (pts.length > 1) parts.push(`<polyline fill="none" stroke="${stroke}" stroke-width="${width}" points="${pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"/>`);
    };

    const level = row && row.glb;
    const valid = hi.concat(lo).filter((v) => v);
    const lmin0 = Math.min(...lo.filter((v) => v)), hmax0 = Math.max(...hi.filter((v) => v));
    if (level && level > lmin0 * 0.5 && level < hmax0 * 2) valid.push(level);
    const pmin = Math.min(...valid) * 0.97, pmax = Math.max(...valid) * 1.03;
    const [y0, y1] = g.price, lmin = Math.log(pmin), lmax = Math.log(pmax);
    const yf = (p) => y1 - (Math.log(p) - lmin) / (lmax - lmin) * (y1 - y0);

    for (const t of ticks(pmin, pmax)) {
        const y = yf(t);
        line(x0, y, x1, y, C.grid);
        text(x1 + 4, y + 4, fmt(t), C.dim);
    }
    const every = small ? 2 : 1;   // na telefonie co drugi kwartał
    let q = 0;
    for (let i = 0; i < n; i++) {
        const m = dates[i].slice(5, 7);
        if (["01", "04", "07", "10"].includes(m) && (i === 0 || dates[i - 1].slice(5, 7) !== m)) {
            line(xf(i), y0, xf(i), h - 22, C.grid);
            if (q++ % every === 0 && xf(i) > x0 + 28) text(xf(i), h - 8, dates[i].slice(0, 7), C.dim, 'text-anchor="middle"');
        }
    }
    const smaColors = { 10: C.sma10, 40: C.sma40 };
    for (const k of SMA_PERIODS) {
        const s = smaWin[k];
        poly(s.map((v, i) => (v ? [xf(i), yf(v)] : null)).filter(Boolean), smaColors[k], 1.5);
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
        text(x0 + 4, y - 9, `GREEN LINE ${fmt(level)} · kupno do ${fmt(level * 1.1)}`, C.glb);
    }
    const stop = row && row.macd_stop;
    if (stop && stop > pmin && stop < pmax) {
        const y = yf(stop);
        line(x0, y, x1, y, C.stop, 1, 'stroke-dasharray="5 4"');
        text(x1 + 4, y + 4, fmt(stop), C.stop);
    }
    const last = c[n - 1];
    if (last) text(x1 + 4, yf(last) + 4, fmt(last), "#ffffff", 'font-weight="bold"');

    // wolumen + średnia 10 tyg.
    const [v0, v1] = g.vol, vv = vol.map((x) => x || 0), vmax = Math.max(...vv) || 1;
    const vy = (v) => v1 - v / vmax * (v1 - v0) * 0.85;
    for (let i = 0; i < n; i++) {
        const col = i === 0 || (c[i] || 0) >= (c[i - 1] || 0) ? C.up : C.down;
        parts.push(`<rect x="${(xf(i) - tick).toFixed(1)}" y="${vy(vv[i]).toFixed(1)}" width="${(2 * tick).toFixed(1)}" height="${(v1 - vy(vv[i])).toFixed(1)}" fill="${col}"/>`);
    }
    poly(vavg.map((a, i) => (a ? [xf(i), vy(a)] : null)).filter(Boolean), C.volAvg, 1.5);
    text(x0 + 4, v0 + 10, "Wolumen · śr. 10 tyg.", C.dim);

    // MACD
    const [m0, m1] = g.macd;
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
    text(x0 + 4, m0 + 10, small ? "MACD (12, 26, 9) tyg. · ▼ = stop pod Low" : "MACD (12, 26, 9) tyg. · ▼ przecięcie w dół = stop pod Low tego tygodnia", C.dim);
    text(x0 + 4, 14, "SMA 10 tyg.", C.sma10);
    text(x0 + 84, 14, "SMA 40 tyg.", C.sma40);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Consolas, Menlo, monospace">` +
        `<rect width="${w}" height="${h}" fill="${C.bg}"/>${parts.join("")}` +
        `<line id="cross" x1="0" y1="${g.price[0]}" x2="0" y2="${g.macd[1]}" stroke="#3a4654" visibility="hidden"/></svg>`;
    return { svg, geom: { ...g, step, n, i0 } };
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
    sma, ema, macd, macdCrossDown, ticks, fmt, fmtVol, geometry, chartSvg, infoLines, titleText,
    windowRange, sliderRect, sliderMode, sliderDrag, sliderJump, zoomWindow, sliderSvg,
};
