// Jeden wykres T / M (port desktop/chart.py z Momentum Desktop): nad ceną RS Line jak w Deepvue (akcja / SPY + średnia, szczyty RS), słupki OHLC w jednym szarym kolorze,
// niebieska SMA 10, Green Line (kropkowana od świecy rekordu) ze strefą kupna 0–10 % nad linią, tło zielone, gdy SPY nad SMA 10 tego interwału, pasek RWB + ● Blue Dot
// + żółta strzałka startu RWB (dokup), linie trendu użytkownika (T / Z i M widoczne wzajemnie), ręczny stop, wolumen ze średnią i MACD (12, 26, 9).
// Z = widok Zangera (tylko T): cena + wolumen + wzorce, to samo tło SPY. Puste świece po prawej (miejsce na linie w przyszłość), ręczna skala ceny.
// Skala ceny logarytmiczna. Suwak nad wykresem (minimapa całej historii) wybiera okno. Średnie i MACD liczymy na całej historii.
// Czyste funkcje (SVG jako tekst) — testy w tests/js/chart.test.js.
"use strict";

const C = {
    bg: "#0e1116", grid: "#1a1f26", dim: "#6b7684", fg: "#d5d9e0", up: "#d5d9e0", down: "#e5484d",
    rs: "#38bdf8", entry: "#ffb020", tline: "#22d3ee", tlineRo: "#6b9fc8", fast: "#e5484d", slow: "#3b82f6", dot: "#4aa3ff", rwbStart: "#f5c518", glb: "#3ddc84", glbHalo: "#0a2e18", stop: "#ff5c5c",
    signal: "#f0b429", volAvg: "#ff9f43", bar: "#a9b1bb", sma: "#2f6bff", regime: "#0f2a1c", zone: "#9aa3ad", volUp: "#1f7a6d", volDown: "#7d3c38",
    macdLine: "#2f6bff", signalLine: "#c850e8", hist: { "1,1": "#00e676", "1,0": "#2e8b57", "0,0": "#ff5252", "0,1": "#8b8f98" },
};
const ZONE_ALPHA = 0.16;   // strefa kupna 0–10 % nad GLB: ZONE zmieszane z tłem w tej proporcji
const CONFIRM_MONTHS = 2;   // Green Line: miesiące zamknięte PO miesiącu szczytu (razem ze szczytem 3 świece)
const FUTURE_STEPS = [0, 6, 12, 20, 30], FUTURE_DEFAULT = { W: 12, M: 6 };   // puste świece po prawej (przycisk ⇥ przełącza po kolei)
const DEFAULT_WEEKS = 156;   // domyślne okno T: 3 lata
const LN = typeof require !== "undefined" ? require("./lines.js") : window;   // dateIndex, slotIndex, lineAt (lines.js ładowany przed chart.js)

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

// RWB (Guppy, Dr Wish): 6 szybkich EMA nad 6 wolnymi — jak calc.gmma / calc.rwb
const GMMA_FAST = [3, 5, 8, 10, 12, 15], GMMA_SLOW = [30, 35, 40, 45, 50, 60];
const gmma = (closes) => [GMMA_FAST.map((n) => ema(closes, n)), GMMA_SLOW.map((n) => ema(closes, n))];
function rwb(closes) {
    const [f, s] = gmma(closes);
    return closes.map((_, i) => Math.min(...f.map((x) => x[i])) > Math.max(...s.map((x) => x[i])));
}

// początki RWB: świece, na których RWB wraca po przerwie (poprzednia świeca bez RWB) — sygnał do dokupienia; jak calc.rwb_starts
function rwbStarts(closes, warmup = 60) {
    const r = rwb(closes), out = [];
    for (let i = Math.max(1, warmup); i < r.length; i++) if (r[i] && !r[i - 1]) out.push(i);
    return out;
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

// Green Line z miesięcznych High ZAMKNIĘTYCH miesięcy -> [poziom, indeks miesiąca rekordu] albo [null, null]; jak calc.green_line
function greenLine(months, confirm = CONFIRM_MONTHS) {
    let level = null, at = null, mx = -Infinity, mi = null;
    months.forEach((c, i) => {
        if (c == null || !isFinite(c)) return;
        if (c > mx) { mx = c; mi = i; }
        if (i - mi >= confirm) { level = mx; at = mi; }
    });
    return [level, at];
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

// liczba akcji (ułamkowych): do 4 miejsc po przecinku, bez zbędnych zer — 20 / 12,5 / 0,3333 (jak chart.shares_text)
const sharesText = (v) => v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");

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

// kolor `top` nałożony na `base` z przezroczystością alpha -> "#rrggbb" (jak chart.mix)
function mix(base, top, alpha) {
    const a = [1, 3, 5].map((k) => parseInt(base.slice(k, k + 2), 16)), b = [1, 3, 5].map((k) => parseInt(top.slice(k, k + 2), 16));
    return "#" + a.map((x, i) => Math.round(x * (1 - alpha) + b[i] * alpha).toString(16).padStart(2, "0")).join("");
}

// n syntetycznych dat po ostatniej świecy (tydzień +7 dni, miesiąc: następne miesiące, ten sam dzień) — miejsce na linie w przyszłość (jak chart.future_dates)
function futureDates(dates, n, period = "W") {
    if (!dates.length || n <= 0) return [];
    const y = +dates[dates.length - 1].slice(0, 4), m = +dates[dates.length - 1].slice(5, 7), d = +dates[dates.length - 1].slice(8, 10), out = [];
    for (let k = 1; k <= n; k++) {
        if (period === "M") {
            const mm = m - 1 + k;
            out.push(`${String(y + Math.floor(mm / 12)).padStart(4, "0")}-${String(mm % 12 + 1).padStart(2, "0")}-${String(Math.min(d, 28)).padStart(2, "0")}`);
        } else out.push(new Date(Date.UTC(y, m - 1, d + 7 * k)).toISOString().slice(0, 10));
    }
    return out;
}

// kopia serii z n pustymi (null) świecami w przyszłości; real = liczba prawdziwych świec (jak chart.extend)
function extendData(data, n, period = "W") {
    const out = { real: data.c.length, d: data.d.concat(futureDates(data.d, n, period)) };
    if (data.nClosed != null) out.nClosed = data.nClosed;   // M: liczba zamkniętych miesięcy (Green Line liczymy bez bieżącego)
    for (const k of ["o", "h", "l", "c", "v"]) out[k] = (data[k] || data.c.map(() => null)).concat(new Array(n).fill(null));
    return out;
}

// widoczny zakres log ceny: z = powiększenie (>1 = węższy), s = przesunięcie w ułamkach domyślnego zakresu (dodatnie = w górę) — jak chart.price_view
function priceView(lmin, lmax, z = 1, s = 0) {
    const rng = lmax - lmin, mid = (lmax + lmin) / 2 + s * rng, half = rng / 2 / Math.max(0.05, z);
    return [mid - half, mid + half];
}

// tło: SPY nad SMA 10 tego samego interwału -> lista true / false / null (brak danych SPY); jak chart.spy_regime
function spyRegime(dates, spx, period = "W", n = 10) {
    if (!spx || !spx.d || !spx.c || !spx.d.length) return dates.map(() => null);
    const s = sma(spx.c.map((v) => (v == null ? 0 : v)), n), maxGap = period === "M" ? 45 : 10, day = (x) => Date.parse(x.slice(0, 10)) / 864e5;
    return dates.map((d) => {
        const k = LN.dateIndex(spx.d, d);
        if (k < 0 || day(d) - day(spx.d[k]) > maxGap || s[k] == null || !spx.c[k]) return null;
        return spx.c[k] > s[k];
    });
}

// poziom Green Line i indeks świecy rekordu: M = z zamkniętych miesięcy wykresu (data.nClosed), T = poziom wiersza i świeca z takim High; jak chart.glb_peak
function glbPeak(data, row, period) {
    const hs = data.h, real = data.real == null ? hs.length : data.real;
    if (period === "M") return greenLine(hs.slice(0, Math.min(real, data.nClosed == null ? real : data.nClosed)));
    const level = row && row.glb;
    if (!level) return [null, null];
    for (let i = real - 1; i >= 0; i--) if (hs[i] && Math.abs(hs[i] / level - 1) < 0.003) return [level, i];
    return [level, null];
}

// seria M (zamknięte miesiące {d: YYYY-MM-01, o, h, l, c, v}) + miesiące po ostatnim zamkniętym zbudowane z tygodniowych (bieżący miesiąc w toku) -> seria z nClosed
function monthlyWithOpen(monthly, weekly) {
    const out = { nClosed: monthly.c.length };
    for (const k of ["d", "o", "h", "l", "c", "v"]) out[k] = monthly[k].slice();
    const lastKey = monthly.d.length ? monthly.d[monthly.d.length - 1].slice(0, 7) : "", groups = new Map();
    if (weekly && weekly.d) weekly.d.forEach((d, i) => {
        const key = d.slice(0, 7);
        if (key > lastKey && weekly.c[i] != null) (groups.get(key) || groups.set(key, []).get(key)).push(i);
    });
    for (const [key, idx] of groups) {
        out.d.push(key + "-01");
        out.o.push(weekly.o[idx[0]]);
        out.h.push(Math.max(...idx.map((i) => weekly.h[i])));
        out.l.push(Math.min(...idx.map((i) => weekly.l[i])));
        out.c.push(weekly.c[idx[idx.length - 1]]);
        out.v.push(idx.reduce((a, i) => a + (weekly.v[i] || 0), 0));
    }
    return out;
}

// panele jak desktop chart.simple_geometry (T / M): RS Line 12 %, cena 52 %, wolumen 11 %, MACD reszta; Z = sama cena 80 % + wolumen (jak chart.geometry)
function geometry(w, h, right = 64, period = "W") {
    const top = 8, ph = h - top - 22;
    if (period === "Z") {
        const p1 = top + ph * 0.80;
        return { rs: null, price: [top, p1], vol: [p1 + 6, h - 22], macd: [h - 22, h - 22], x0: 6, x1: w - right, w, h };
    }
    const s1 = top + ph * 0.12, p0 = s1 + 8, p1 = p0 + ph * 0.52, v0 = p1 + 6, v1 = v0 + ph * 0.11;
    return { rs: [top, s1], price: [p0, p1], vol: [v0, v1], macd: [v1 + 10, h - 22], x0: 6, x1: w - right, w, h };
}

function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------- suwak okna czasu ----------
const MIN_WEEKS = 12;

// -> [i0, i1] okna: nShow świec (min. MIN_WEEKS, domyślnie wszystkie) kończące się na `end` (domyślnie ostatnia świeca)
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

// klik na torze poza ramką: ramka wyśrodkowana na klikniętej świecy
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

// indeksy świec z datami raportów (E): tydzień zawierający raport — jak chart.earnings_indices (dymek świecy)
function earningsIndices(dates, events) {
    const out = new Set();
    for (const ev0 of events || []) {
        const ev = String(ev0).slice(0, 10);
        if (ev.length !== 10 || !dates.length) continue;
        const i = LN.dateIndex(dates, ev);
        if (i >= 0 && (Date.parse(ev) - Date.parse(dates[i])) / 864e5 < 7) out.add(i);
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

const PATTERN_COLORS = { "Cup & Handle": "#4da3ff", "Flat Base": "#f0b429", "Ascending Triangle": "#b084f5", "Flaga/Proporzec": "#2ec4b6", Channel: "#5fd0ff", "Symmetrical Triangle": "#e879f9",
    "Descending Triangle": "#fb923c", "Falling Wedge": "#34d399", "Inverted H&S": "#a3e635", "Head & Shoulders": "#ff6b6b", "Rising Wedge": "#f87171" };
const PARABOLA_COLOR = "#ff4d8d";
const patternLevels = (row) => (((row && row.patterns) || []).map((p) => p.buy)).concat(row && row.parabola ? [row.parabola.exit] : []);

// -> {svg, geom} albo null; full = seria (d, o, h, l, c, v; po `opt.real` świec puste miejsce w przyszłości — extendData), row = wiersz listy (glb, rs, patterns),
// okno = nShow świec do `end`; lines = linie trendu [{id, d1, p1, d2, p2, alert, ro}] (ro = linia z drugiego interwału, tylko do odczytu), sel = id zaznaczonej;
// spx = {d, c} SPY tego samego interwału (RS i tło); period = "W" albo "M"; opt = {rwb, zanger (tylko W), real, pv: [z, s] skala ceny, stop, stopLabel}
function chartSvg(full, row, w, h, nShow, end, lines, sel, spx, period = "W", opt = {}) {
    const M = period === "M", zanger = !!opt.zanger && !M, u = M ? "mies." : "tyg.";
    const total = full.c.length;
    if (total < 2) return null;
    const real = opt.real == null ? total : opt.real, pv = opt.pv || [1, 0];
    const [i0, i1] = windowRange(total, nShow, end);
    const nr = Math.max(2, Math.min(i1, real) - i0);   // prawdziwe świece w oknie
    const cfull = full.c.slice(0, real).map((v) => (v === null ? 0 : v));
    const mdFull = macd(cfull);
    const md = { macd: mdFull.macd.slice(i0, i0 + nr), signal: mdFull.signal.slice(i0, i0 + nr), hist: mdFull.hist.slice(i0, i0 + nr) };
    const sma10 = sma(cfull, 10).slice(i0, i1);
    const vReal = full.v.slice(0, real).map((x) => x || 0), vavg = sma(vReal, 10).slice(i0, i1), rv = relVolume(vReal, 10);
    const data = {};
    for (const k of ["d", "o", "h", "l", "c", "v"]) data[k] = full[k].slice(i0, i1);
    const c = data.c, hi = data.h, lo = data.l, vol = data.v, dates = data.d, n = c.length;
    const fs = w < 600 ? 12 : 11, small = w < 600;
    const g = geometry(w, h, small ? 52 : 64, zanger ? "Z" : period), x0 = g.x0, x1 = g.x1, step = (x1 - x0) / n;
    const xf = (i) => x0 + (i + 0.5) * step;
    const parts = [];
    const text = (x, y, s, fill, extra = "") =>
        parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" font-size="${fs}" ${extra}>${esc(s)}</text>`);
    const line = (a, b, cc, d, stroke, width = 1, extra = "") =>
        parts.push(`<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${cc.toFixed(1)}" y2="${d.toFixed(1)}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`);
    const rect = (x, y, wd, ht, fill, extra = "") => parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, wd).toFixed(1)}" height="${Math.max(0, ht).toFixed(1)}" fill="${fill}" ${extra}/>`);
    const boxText = (x, y, str, fill, extra = "") => {   // napis na tle wykresu (desktop boxed), żeby nie zlewał się ze świecami
        const wd = String(str).length * fs * 0.6 + 4, right = extra.includes("end");
        parts.push(`<rect x="${((right ? x - wd + 2 : x - 2)).toFixed(1)}" y="${(y - fs).toFixed(1)}" width="${wd.toFixed(1)}" height="${fs + 4}" fill="${C.bg}" opacity="0.85"/>`);
        text(x, y, str, fill, extra);
    };
    const poly = (pts, stroke, width) => {
        if (pts.length > 1) parts.push(`<polyline fill="none" stroke="${stroke}" stroke-width="${width}" points="${pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"/>`);
    };

    const [y0, y1] = g.price, [v0, v1] = g.vol;
    const [level, at] = glbPeak(full, row, period);
    const valid = hi.concat(lo).filter((v) => v);
    const lmin0 = Math.min(...valid), hmax0 = Math.max(...valid);
    if (level && level > lmin0 * 0.5 && level < hmax0 * 2) valid.push(level, zanger ? level : level * 1.1);   // strefa kupna 0–10 % nad linią ma się zmieścić w skali
    if (zanger) for (const v of patternLevels(row)) if (v > hmax0 * 0.6 && v < hmax0 * 1.25) valid.push(v);   // kupno wzorców / wyjście z paraboli mają się zmieścić
    const [lmin, lmax] = priceView(Math.log(Math.min(...valid) * 0.97), Math.log(Math.max(...valid) * 1.03), pv[0], pv[1]);   // pv: ręczne powiększenie / przesunięcie skali ceny
    const pmin = Math.exp(lmin), pmax = Math.exp(lmax);
    const yf = (p) => y1 - (Math.log(p) - lmin) / (lmax - lmin) * (y1 - y0);
    const clip = `<g clip-path="url(#pclip)">`;
    const openClip = () => parts.push(clip), closeClip = () => parts.push("</g>");
    parts.push(`<defs><clipPath id="pclip"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/></clipPath></defs>`);

    // tło: zielone, gdy SPY nad SMA 10 tego samego interwału (pod ceną i wolumenem)
    const regime = spyRegime(dates, spx, zanger ? "W" : period);
    const bgBottom = zanger ? v1 : v1;
    let a = null;
    regime.map(Boolean).concat([false]).forEach((on, i) => {
        if (on && a === null) a = i;
        else if (!on && a !== null) { rect(xf(a) - step / 2, y0, xf(i - 1) - xf(a) + step, bgBottom - y0, C.regime); a = null; }
    });

    const lvY = level && level > pmin && level < pmax ? yf(level) : null;
    const xs = at != null && at >= i0 && at < i1 ? xf(at - i0) : x0;   // Green Line i jej strefa zaczynają się na świecy rekordu
    const last0 = full.c[real - 1], last = last0 && last0 > pmin && last0 < pmax ? last0 : null;
    const stop = opt.stop, stopIn = stop && stop > pmin && stop < pmax;
    const [lastY, stopY] = axisSpots(lvY, last ? yf(last) : null, stopIn ? yf(stop) : null);
    const taken = [lvY, lastY, stopY].filter((v) => v != null);
    for (const t of ticks(pmin, pmax)) {
        const y = yf(t);
        line(x0, y, x1, y, C.grid);
        if (taken.every((v) => Math.abs(y - v) >= 13)) text(x1 + 4, y + 4, fmt(t), C.dim);   // podziałka ustępuje Green Line / cenie / stopowi
    }
    if (i1 > real) line(xf(real - 1 - i0) + step / 2, y0, xf(real - 1 - i0) + step / 2, v1, "#3a4654", 1, 'stroke-dasharray="2 4"');   // granica: po prawej puste miejsce w przyszłości
    const yrs = Math.max(1, Math.ceil(60 / Math.max(1e-9, step * 12))), every = Math.max(1, Math.ceil((fs * 6.6 + 8) / Math.max(1e-9, step * 13)));
    let q = 0;
    for (let i = 0; i < n; i++) {   // oś czasu: początek kwartału (T) / styczeń co `yrs` lat (M)
        const m = dates[i].slice(5, 7);
        let mark = ["01", "04", "07", "10"].includes(m) && (i === 0 || dates[i - 1].slice(5, 7) !== m);
        if (M) mark = m === "01" && +dates[i].slice(0, 4) % yrs === 0;
        if (mark) {
            line(xf(i), y0, xf(i), h - 22, C.grid);
            q++;
            if (xf(i) > x0 + 28 && (M || (q - 1) % every === 0)) text(xf(i), h - 8, M ? dates[i].slice(0, 4) : dates[i].slice(0, 7), C.dim, 'text-anchor="middle"');
        }
    }
    if (!zanger && lvY != null) {   // strefa kupna 0–10 % nad Green Line: jednolity, delikatnie jaśniejszy pas (kolor liczony na tle zielonym albo ciemnym) i przerywana na 5 %
        const zt = Math.max(y0, yf(level * 1.1));
        if (zt < lvY) {
            const first = at != null && at >= i0 && at < i1 ? at - i0 : 0, cols = regime.map((on) => mix(on ? C.regime : C.bg, C.zone, ZONE_ALPHA));
            for (let i = first; i < n;) {
                let j = i;
                while (j + 1 < n && cols[j + 1] === cols[i]) j++;
                const xa = i === first ? xs : xf(i) - step / 2, xb = j === n - 1 ? x1 : xf(j) + step / 2;
                rect(xa, zt, xb - xa, Math.min(lvY, y1) - zt, cols[i]);
                i = j + 1;
            }
        }
        const y5 = yf(level * 1.05);
        if (y5 > y0 && y5 < y1) line(xs, y5, x1, y5, C.zone, 1, 'stroke-dasharray="6 4"');
    }
    let dots = [], starts = [];
    if (!zanger && opt.rwb) {   // sam wskaźnik RWB (pasek u dołu ceny) + ● Blue Dot + strzałka startu; bez wachlarza średnich; T i M
        const r = rwb(cfull).slice(i0, i1);
        let b = null;
        r.concat([false]).forEach((on, i) => {
            if (on && b === null) b = i;
            else if (!on && b !== null) { rect(xf(b) - step / 2, y1 - 4, xf(i - 1) - xf(b) + step, 4, C.slow); b = null; }
        });
        dots = blueDots(full.h.slice(0, real), full.l.slice(0, real), full.c.slice(0, real), level).filter((i) => i >= i0 && i < i1);
        starts = rwbStarts(cfull).filter((i) => i >= i0 && i < i1);
    }
    openClip();
    const bw = M ? Math.min(2.5, Math.max(1, step * 0.2)) : Math.max(1, step * 0.25), tickW = Math.min(2, Math.max(1, step * 0.12));
    for (let i = 0; i < n; i++) {
        if (hi[i] === null || lo[i] === null || c[i] === null) continue;
        const x = xf(i);
        if (zanger) {
            line(x, yf(hi[i]), x, yf(lo[i]), C.fg, bw);
            line(x - step * 0.35, yf(c[i]), x + step * 0.35, yf(c[i]), C.fg);
        } else {   // słupki OHLC: jeden szary kolor
            line(x, yf(hi[i]), x, yf(lo[i]), C.bar, bw);
            if (data.o[i]) line(x - step * 0.4, yf(data.o[i]), x, yf(data.o[i]), C.bar, tickW);
            line(x, yf(c[i]), x + step * 0.4, yf(c[i]), C.bar, tickW);
        }
    }
    if (!zanger) poly(sma10.map((v, i) => (v ? [xf(i), yf(v)] : null)).filter(Boolean), C.sma, 2.4);   // SMA 10 (przycięta do panelu ceny)
    closeClip();
    for (const i of starts) {   // początek RWB = sygnał „dokup”: sama żółta strzałka pod Low świecy (bez napisu, żeby było widać całą świecę)
        const lw = full.l[i];
        if (lw && lw > pmin && lw < pmax) {
            const tx = xf(i - i0), ty = yf(lw) + 8;
            parts.push(`<polygon points="${tx.toFixed(1)},${(ty - 5).toFixed(1)} ${(tx - 5).toFixed(1)},${(ty + 4).toFixed(1)} ${(tx + 5).toFixed(1)},${(ty + 4).toFixed(1)}" fill="${C.rwbStart}"><title>RWB START · dokup (stop pod Low ${fmt(lw)})</title></polygon>`);
        }
    }
    for (const i of dots) {   // ● Blue Dot pod świecą
        const lw = full.l[i];
        if (lw && lw > pmin && lw < pmax) parts.push(`<circle cx="${xf(i - i0).toFixed(1)}" cy="${(yf(lw) + 9).toFixed(1)}" r="4" fill="${C.dot}"/>`);
    }
    if (lvY != null) {
        if (zanger) {
            line(x0, lvY, x1, lvY, C.glbHalo, 6);
            line(x0, lvY, x1, lvY, C.glb, 3);
            boxText(x0 + 4, Math.max(y0 + 38, lvY - 11) + 4, small ? `GLB ${fmt(level)} · kupno do ${fmt(level * 1.1)}` : `GREEN LINE ${fmt(level)} · kupno do ${fmt(level * 1.1)}`, C.glb);
            rect(x1 + 1, lvY - 9, w - x1 - 3, 18, C.glb);
            text(x1 + 4, lvY + 4, fmt(level), "#000");
        } else {   // Green Line: kropkowana od świecy rekordu, cena nad świecą i na osi
            line(xs, lvY, x1, lvY, C.glb, 2, 'stroke-dasharray="2 4"');
            if (at != null && at >= i0 && at < i1 && full.h[at] && full.h[at] > pmin && full.h[at] < pmax) parts.push(`<circle cx="${xf(at - i0).toFixed(1)}" cy="${yf(full.h[at]).toFixed(1)}" r="3.5" fill="${C.glb}"/>`);
            const tx = Math.min(Math.max(xs, x0 + 24), x1 - 24), ty = Math.max(y0 + 10, lvY - 12), lab = fmt(level), lw = lab.length * fs * 0.6 + 6;
            rect(tx - lw / 2, ty - fs, lw, fs + 4, C.glb);
            text(tx, ty, lab, "#06210f", 'text-anchor="middle" font-weight="bold"');
            rect(x1 + 1, lvY - 9, w - x1 - 3, 18, "#ffffff");
            text(x1 + 4, lvY + 4, lab, "#000");
            for (const [k, lab2] of [[1.05, "+5 %"], [1.1, "+10 %"]]) {   // opisy granic strefy kupna przy prawej krawędzi
                const yy = yf(level * k);
                if (yy > y0 + 6 && yy < y1 - 4) text(x1 - 4, yy - 3, lab2, C.zone, 'text-anchor="end"');
            }
        }
    }
    if (last) {   // ostatnia cena: cienka kropkowana + znacznik na osi
        line(x0, yf(last), x1, yf(last), "#4b5563", 1, 'stroke-dasharray="1 3"');
        rect(x1 + 1, lastY - 8, w - x1 - 3, 16, "#4b5563");
        text(x1 + 4, lastY + 4, fmt(last), "#ffffff", 'font-weight="bold"');
    }
    // ręczny stop (przeciągany myszą / palcem): czerwona przerywana linia na całą szerokość, napis przy lewej krawędzi, cena na osi; poza skalą — strzałka przy krawędzi
    let stopPx = null;
    if (stop) {
        if (stopIn) {
            const y = yf(stop);
            stopPx = y;
            line(x0, y, x1, y, C.stop, 2, 'stroke-dasharray="7 4"');
            boxText(x0 + 4, (y - 9 > y0 + 8 ? y - 9 : y + 9) + 4, opt.stopLabel || "stop", C.stop);
            rect(x1 + 1, stopY - 8, w - x1 - 3, 16, C.stop);
            text(x1 + 4, stopY + 4, fmt(stop), "#ffffff", 'font-weight="bold"');
        } else boxText(x0 + 4, (stop <= pmin ? y1 - 9 : y0 + 9) + 4, (stop <= pmin ? "▼ " : "▲ ") + (opt.stopLabel || "stop"), C.stop);
    }
    // linia ceny wejścia 📌 pozycji (cena kupna z pozycji, także po edycji): przerywana, bursztynowa; napis przy prawej krawędzi panelu, cena na osi odsunięta od innych napisów; poza skalą — strzałka
    const entry = opt.entry;
    if (entry) {
        const txt = `WEJŚCIE ${fmt(entry)}` + (last0 ? ` · ${last0 / entry - 1 >= 0 ? "+" : ""}${((last0 / entry - 1) * 100).toFixed(1)} %` : "");
        if (entry > pmin && entry < pmax) {
            const y = yf(entry);
            line(x0, y, x1, y, C.entry, 1.6, 'stroke-dasharray="9 4"');
            boxText(x1 - 4, (y - 9 > y0 + 8 ? y - 9 : y + 9) + 4, txt, C.entry, 'text-anchor="end"');
            let ay = y;
            for (const ref of [lvY, lastY, stopY]) if (ref != null && Math.abs(ay - ref) < 16) ay = ay >= ref ? ref + 16 : ref - 16;
            rect(x1 + 1, ay - 8, w - x1 - 3, 16, C.entry);
            text(x1 + 4, ay + 4, fmt(entry), "#000", 'font-weight="bold"');
        } else boxText(x1 - 4, (entry <= pmin ? y1 - 9 : y0 + 9) + 4, (entry <= pmin ? "▼ " : "▲ ") + txt, C.entry, 'text-anchor="end"');
    }
    if (zanger) drawPatterns();
    // linie trendu: odcinek między punktami + przedłużenie (przerywane) do ostatniej świecy okna; ro = z drugiego interwału (blada, przerywana, bez uchwytów)
    const segs = [];
    openClip();
    for (const ln of lines || []) {
        const a2 = LN.slotIndex(full.d, ln.d1), b2 = LN.slotIndex(full.d, ln.d2);
        if (a2 < 0 || b2 < 0 || a2 === b2) continue;
        const [ia, pa, ib, pb] = a2 < b2 ? [a2, ln.p1, b2, ln.p2] : [b2, ln.p2, a2, ln.p1];
        const ie = ln.alert !== false ? Math.max(ib, i1 - 1) : ib, pe = LN.lineAt(ln, full.d, ie);   // przedłużenie tylko przy włączonym alarmie (to ono jest pilnowane)
        if (ln.ro) {
            line(xf(ia - i0), yf(pa), xf(ib - i0), yf(pb), C.tlineRo, 1.6, 'stroke-dasharray="7 3"');
            if (ie > ib && pe) line(xf(ib - i0), yf(pb), xf(ie - i0), yf(pe), C.tlineRo, 1, 'stroke-dasharray="3 4"');
            continue;
        }
        const s = { id: ln.id, x1: xf(a2 - i0), y1: yf(ln.p1), x2: xf(b2 - i0), y2: yf(ln.p2), xe: xf(ie - i0), ye: yf(pe) };
        segs.push(s);
        const on = ln.id === sel;
        line(xf(ia - i0), yf(pa), xf(ib - i0), yf(pb), C.tline, on ? 2.5 : 1.6);
        if (ie > ib) line(xf(ib - i0), yf(pb), s.xe, s.ye, C.tline, 1, 'stroke-dasharray="4 4" opacity="0.7"');
        if (on) for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${C.bg}" stroke="${C.tline}" stroke-width="2"/>`);
    }
    closeClip();
    for (const s of segs) {
        const ln = (lines || []).find((x) => x.id === s.id);
        if ((ln.alert !== false || ln.id === sel) && s.xe >= x1 - step && s.ye > y0 && s.ye < y1) text(x1 + 4, s.ye + 4, (ln.alert !== false ? "🔔 " : "") + fmt(LN.lineAt(ln, full.d, i1 - 1)), C.tline);
    }

    // wolumen + średnia 10
    const vv = vol.map((x) => x || 0), vmax = Math.max(...vv) || 1, tick = step * 0.35;
    const vy = (v) => v1 - v / vmax * (v1 - v0) * (zanger ? 0.85 : 0.9);
    for (let i = 0; i < n; i++) {
        const up = i === 0 || (c[i] || 0) >= (c[i - 1] || 0), col = zanger ? (up ? C.up : C.down) : (up ? C.volUp : C.volDown);
        rect(xf(i) - tick, vy(vv[i]), 2 * tick, v1 - vy(vv[i]), col);
    }
    poly(vavg.map((a2, i) => (a2 ? [xf(i), vy(a2)] : null)).filter(Boolean), zanger ? C.volAvg : C.sma, zanger ? 1.5 : 1.3);
    if (zanger) text(x0 + 4, v0 + 10, small ? `Vol · MA10${rv != null ? ` · RV ${rv.toFixed(1)}×` : ""}` : `Wolumen · śr. 10 tyg.` + (rv != null ? ` · RVol ${rv.toFixed(1)}×` : ""), rv != null && rv >= 1.5 ? C.signal : C.dim);

    // MACD (12, 26, 9): histogram w 4 kolorach (znak × rośnie / maleje), linia MACD i sygnału
    const [m0, m1] = g.macd;
    if (!zanger) {
        const rng = (Math.max(0, ...md.macd.concat(md.signal, md.hist).map(Math.abs)) || 1) * 1.25, mid = (m0 + m1) / 2;
        const ym = (v) => mid - v / rng * (m1 - m0) / 2;
        line(x0, mid, x1, mid, C.grid);
        md.hist.forEach((hv, i) => {
            const rising = i === 0 || hv >= md.hist[i - 1], yy = ym(hv);
            rect(xf(i) - step * 0.3, Math.min(yy, mid), step * 0.6, Math.abs(mid - yy), C.hist[`${hv >= 0 ? 1 : 0},${rising ? 1 : 0}`]);
        });
        poly(md.macd.map((v, i) => [xf(i), ym(v)]), C.macdLine, 1.4);
        poly(md.signal.map((v, i) => [xf(i), ym(v)]), C.signalLine, 1.4);
    }
    const legendParts = zanger ? ["Widok Zangera: cena (log) + wolumen · wzorce: " + (((row && row.patterns) || []).map((p) => p.name).join(", ") || "brak")]
        : [`SMA 10 ${u}` + (regime.some((x) => x !== null) ? "" : " · brak danych SPY"), `zielone tło = SPY nad SMA 10 ${u}`, lvY != null ? "szary pas = 0–10 % nad GLB" : "",
            opt.rwb ? "pasek RWB, ● Blue Dot, ▲ start RWB = dokup" : ""].filter(Boolean);
    let legend = legendParts.join(" · ");
    while (legendParts.length > 1 && legend.length * fs * 0.6 + 8 > x1 - x0) { legendParts.pop(); legend = legendParts.join(" · "); }   // za długa legenda: odcinamy końcówkę, żeby nie wychodziła poza wykres
    boxText(x0 + 4, y0 + 14, legend, zanger ? C.fg : C.sma);

    // RS Line jak w Deepvue nad wykresem: akcja / SPY, średnia 52 tyg. (12 mies.), szczyty RS — jak chart.draw_rs_panel
    if (!zanger) {
        const [s0, s1] = g.rs, lookback = M ? 12 : 52;
        const spxFull = spx && spx.d ? full.d.map((d, i) => { const k = i < real ? LN.dateIndex(spx.d, d) : -1; return k >= 0 ? spx.c[k] : null; }) : [];
        const rsFull = spxFull.length ? rsLine(full.c, spxFull) : [];
        const maFull = rsFull.map((_, i) => {
            if (i < lookback - 1) return null;
            const win = rsFull.slice(i - lookback + 1, i + 1);
            return win.every((v) => v) ? win.reduce((a2, b) => a2 + b, 0) / lookback : null;
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
            const unit = M ? "12 mies." : "52 tyg.", fullLab = `RS Line (akcja / SPY) · średnia ${unit} · ● zielony = nowy szczyt RS · ● różowy = RS przed ceną`;
            boxText(x0 + 4, s0 + 10, x1 - x0 > fullLab.length * fs * 0.62 ? fullLab : `RS / MA ${unit}`, C.rs);
            if (row && row.rs != null) boxText(x1 + 4, pts[pts.length - 1][1] + 4, `${row.rs >= 0 ? "+" : ""}${row.rs.toFixed(0)} pp`, C.rs);
        } else text(x0 + 4, s0 + 10, "RS Line — brak danych SPY", C.dim);
        line(x0, s1 + 3, x1, s1 + 3, C.grid);
    }
    return finish();

    function drawPatterns() {   // jak desktop chart.draw_patterns: kontur wzorca, linia i podpis kupna; Parabolic Curve = krzywa + poziom wyjścia
        const px = (d) => { const j = LN.dateIndex(dates, d); return j < 0 ? null : xf(Math.min(j, n - 1)); };
        const shapes = (items, col) => {
            for (const sh of items) {
                if (sh.kind === "curve") poly(sh.pts.map(([d, p]) => [px(d), yf(p)]).filter(([x], k) => x != null && sh.pts[k][1] > pmin && sh.pts[k][1] < pmax), col, 2);
                else if (sh.kind === "box") {
                    const a2 = px(sh.d1), b = px(sh.d2);
                    if (a2 != null && b != null) parts.push(`<rect x="${(a2 - step * 0.45).toFixed(1)}" y="${yf(Math.min(sh.hi, pmax)).toFixed(1)}" width="${(b - a2 + step * 0.9).toFixed(1)}" height="${Math.max(1, yf(Math.max(sh.lo, pmin)) - yf(Math.min(sh.hi, pmax))).toFixed(1)}" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="4 3"/>`);
                } else if (sh.kind === "mark") {   // LS / H / RS przy szczytach (dołkach) Head & Shoulders
                    const a2 = px(sh.d);
                    if (a2 != null && sh.p > pmin && sh.p < pmax) text(a2, yf(sh.p) + (sh.below ? 18 : -10), sh.text, col, 'text-anchor="middle" font-weight="bold"');
                } else if (sh.kind === "line") {
                    const a2 = px(sh.d1), b = px(sh.d2);
                    if (a2 != null && b != null) {
                        line(a2, yf(sh.p1), b, yf(sh.p2), col, 2);
                        if (sh.label) text(a2 + 5, yf(sh.p1) + 14, sh.label, col, 'font-weight="bold"');   // numer linii (1, 2, 3) przy lewym końcu, jak na schemacie Zangera
                    }
                }
            }
        };
        const usedY = [];
        ((row && row.patterns) || []).forEach((p) => {
            const col = PATTERN_COLORS[p.name] || C.fg;
            shapes(p.shapes, col);
            if (!(p.buy > pmin && p.buy < pmax)) return;
            const y = yf(p.buy), a2 = px(p.end);
            line(a2 != null ? a2 : x0, y, x1, y, col, 2, 'stroke-dasharray="6 3"');
            let ly = Math.max(y - 9, y0 + 32);   // pod legendą u góry wykresu
            for (let t = 0; t < 6 && usedY.some((u2) => Math.abs(ly - u2) < 16); t++) ly = Math.max(y + 9 + 16 * t, y0 + 32);   // podpisy kolejnych wzorców jeden pod drugim
            usedY.push(ly);
            const sell = p.side === "sell";
            boxText(x1 - 6, ly + 4, small ? `${sell ? "⚠ " : ""}${p.name} ${sell ? "" : "> "}${fmt(p.buy)} · ${p.state}` : `${sell ? "⚠ " : ""}${p.name} · ${sell ? "linia" : "kupno >"} ${fmt(p.buy)} · ${p.state} (${p.pct >= 0 ? "+" : ""}${p.pct.toFixed(1)} %)${p.vol_x != null ? ` · wol. ${p.vol_x.toFixed(1)}×` : ""}`, col, 'text-anchor="end"');
        });
        const para = row && row.parabola;
        if (para) {
            shapes(para.shapes, PARABOLA_COLOR);
            if (para.exit > pmin && para.exit < pmax) {
                const y = yf(para.exit);
                line(x0, y, x1, y, PARABOLA_COLOR, 1, 'stroke-dasharray="2 3"');
                boxText(x0 + 4, y + 13, para.state === "ZŁAMANA" ? `PARABOLA · ZŁAMANA najbardziej stroma linia — sprzedaż${para.vol_x ? ` · wol. ${para.vol_x.toFixed(1)}×` : ""}`
                    : `PARABOLA · wyjście: zamknięcie tyg. pod linią 3 (${fmt(para.exit)})`, PARABOLA_COLOR);
            }
        }
    }

    function finish() {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Consolas, Menlo, monospace">` +
            `<rect width="${w}" height="${h}" fill="${C.bg}"/>${parts.join("")}` +
            `<line id="cross" x1="0" y1="${(g.rs || g.price)[0]}" x2="0" y2="${g.macd[1]}" stroke="#3a4654" visibility="hidden"/></svg>`;
        return { svg, geom: { ...g, step, n, i0, lmin, lmax, segs, stopY: stopPx, real } };
    }
}

// miarka (prawy przycisk): zmiana ceny w % od punktu kliknięcia i liczba świec między punktami — jak chart.ruler_text
function rulerText(p1, p2, k1, k2, period = "W") {
    const unit = period === "M" ? "mies." : "tyg.", pct = p1 ? (p2 / p1 - 1) * 100 : 0;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)} % · ${Math.abs(k2 - k1)} ${unit} · ${fmt(p1)} → ${fmt(p2)}`;
}

// dane świecy pod kursorem
function infoLines(data, i, period = "W") {
    const c = data.c, ch = i && c[i] && c[i - 1] ? (c[i] / c[i - 1] - 1) * 100 : null;
    return [`${period === "M" ? "mies." : "tydz."} ${data.d[i]}`, `O ${fmt(data.o[i])}  H ${fmt(data.h[i])}`, `L ${fmt(data.l[i])}  C ${fmt(c[i])}`,
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
    sma, ema, macd, gmma, rwb, rwbStarts, stochK, blueDots, greenLine, rsLine, rsMarkers, earningsIndices, rulerText, relVolume, axisSpots, macdCrossDown, ticks, fmt, fmtVol, sharesText,
    geometry, chartSvg, infoLines, titleText, futureDates, extendData, priceView, spyRegime, glbPeak, monthlyWithOpen, mix, FUTURE_STEPS, FUTURE_DEFAULT, DEFAULT_WEEKS,
    windowRange, sliderRect, sliderMode, sliderDrag, sliderJump, zoomWindow, sliderSvg,
};
