// ============================================================
// WYKRES W STYLU MARKETSMITH (okienko po kliknięciu spółki na index.html) — czysty SVG, bez bibliotek.
// Dane: docs/data/charts.json (watchlist.py::build_charts) — wspólna lista tygodni, S&P 500 i dla każdej
// spółki tygodniowe OHLC + wolumen + SMA10/SMA40 + kwartalny EPS + linie trendu (dzienny widok: day.*). Panele od góry:
//   1. linia benchmarku (S&P 500),
//   (pasek legendy: średnie, RS Rating, wykryty kształt/wybicie — osobno, żeby nie zasłaniać wykresu),
//   2. słupki OHLC + średnie kroczące + linie trendu (opór/wsparcie) + linia RS (spółka / S&P 500) w dolnej części,
//   3. wolumen,
//   4. linia EPS kwartalnego (wartość + zmiana r/r), znaczniki dat wyników także na panelu cen.
// Logika modelu/skal jest czysta i testowana (tests/js/chart.test.js), rysowanie to tylko składanie SVG.
// ============================================================

if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
}

const CHART_LAYOUT = {
    width: 1000, height: 710, left: 10, right: 66,
    bench: { y: 8, h: 70 }, legend: { y: 86, h: 20 }, price: { y: 110, h: 330 }, volume: { y: 448, h: 80 }, eps: { y: 538, h: 118 },
    axisY: 688,
};
// Układ dla wąskich ekranów (telefon): węższy viewBox + większa czcionka względem niego, żeby po przeskalowaniu
// do szerokości ekranu napisy były czytelne; do tego krótsze okno (COMPACT_WEEKS tygodni) — patrz sliceModel.
const CHART_LAYOUT_COMPACT = {
    width: 560, height: 800, left: 6, right: 46,
    bench: { y: 6, h: 70 }, legend: { y: 80, h: 50 }, price: { y: 134, h: 300 }, volume: { y: 442, h: 84 }, eps: { y: 534, h: 132 },
    axisY: 718,
};
const COMPACT_FONT_SCALE = 1.5;
const COMPACT_WEEKS = 52;
const COMPACT_DAYS = 75;
const SMA_COLORS = { "SMA 10": "#3fbf6e", "SMA 20": "#f5d547", "SMA 50": "#c77dff", "SMA 200": "#e0455a", "SMA 10 tyg.": "#3fbf6e", "SMA 40 tyg.": "#e0455a" };
const CHART_COLORS = {
    up: "#2ecc71", down: "#e0455a", rs: "#4aa3ff", bench: "#c9ced8",
    eps: "#e0b341", res: "#ff9f43", cup: "#d6dbe6", sup: "#9fb3c8", volAvg: "#e8a33d", grid: "#262a35", text: "#8a8f9c", textStrong: "#e8eaed",
};
const MONTHS_PL = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

// "Ładne" wartości osi: ~count znaczników w przedziale [min, max] (kroki 1/2/5·10^n).
function niceTicks(min, max, count = 5) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    if (min === max) return [min];
    const raw = (max - min) / count;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const frac = raw / pow;
    const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10) * pow;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
    return out;
}

// Skala liniowa: wartość -> współrzędna y (większa wartość = wyżej), z ustalonym pudełkiem [top, top+height].
function makeYScale(min, max, top, height) {
    const span = max - min || 1;
    return v => top + height - ((v - min) / span) * height;
}

// Skala logarytmiczna (tylko wartości dodatnie): równe odległości = równe zmiany procentowe.
function makeLogScale(min, max, top, height) {
    const lin = makeYScale(Math.log(min), Math.log(max), top, height);
    return v => lin(Math.log(v));
}

// Znaczniki osi logarytmicznej: 1/2/5 · 10^n w przedziale; przy małej liczbie — gęściej (1,1.5,2,3,...), a w bardzo wąskim zakresie — liniowe.
function logTicks(min, max) {
    if (!(min > 0) || !(max > min)) return [];
    const pick = mults => {
        const out = [];
        for (let p = Math.floor(Math.log10(min)); p <= Math.ceil(Math.log10(max)); p++) {
            mults.forEach(m => { const v = Number((m * Math.pow(10, p)).toPrecision(12)); if (v >= min && v <= max) out.push(v); });
        }
        return out;
    };
    const coarse = pick([1, 2, 5]);
    if (coarse.length >= 4) return coarse;
    const dense = pick([1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9]);
    return dense.length >= 3 ? dense : niceTicks(min, max, 5);   // bardzo wąski zakres: zwykłe, liniowe znaczniki
}

function numericExtent(arrays) {
    let min = Infinity, max = -Infinity;
    arrays.forEach(arr => (arr || []).forEach(v => {
        if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
    }));
    return Number.isFinite(min) ? [min, max] : null;
}

// Indeks tygodnia, w którym wypada data (pierwszy tydzień kończący się nie wcześniej niż data); -1 poza oknem.
function weekIndexForDate(weeks, date) {
    if (!weeks.length) return -1;
    for (let i = 0; i < weeks.length; i++) if (weeks[i] >= date) return i;
    return -1;
}

// Model wykresu jednej spółki: wspólne tablice + linia RS (cena / S&P 500) + pozycje wyników na osi tygodni.
// Widok dzienny (dailyCharts): ta sama struktura, ale oś to ostatnie sesje (charts.days) i średnie SMA 10/20/50/200.
function dailyCharts(charts) {
    if (!charts || !charts.days) return null;
    const stocks = {};
    Object.keys(charts.stocks).forEach(t => {
        const c = charts.stocks[t], d = c.day;
        // wyniki sprzed pierwszej sesji okna wypadłyby na indeks 0 i nałożyły się na siebie — pomijamy je
        if (d) stocks[t] = { ...d, bases: c.bases, eps: (c.eps || []).filter(q => q.d >= charts.days[0]), eps_next: c.eps_next };
    });
    return { weeks: charts.days, spx: charts.spx_d, stocks, daily: true };
}

// Indeks świecy dla daty linii trendu (może wypaść przed oknem — wtedy wartość ujemna, linia jest obcinana przy rysowaniu).
function lineIndex(weeks, date) {
    const i = weekIndexForDate(weeks, date);
    return i >= 0 ? i : weeks.length - 1;
}

function buildChartModel(charts, ticker, stock) {
    const c = charts && charts.stocks && charts.stocks[ticker];
    if (!c) return null;
    const weeks = charts.weeks;
    const spx = charts.spx || null;
    const rs = c.c.map((close, i) => (spx && Number.isFinite(close) && Number.isFinite(spx[i]) && spx[i] > 0) ? close / spx[i] : null);
    const eps = (c.eps || []).map(q => ({ ...q, week: weekIndexForDate(weeks, q.d) })).filter(q => q.week >= 0);
    const smas = charts.daily
        ? [["SMA 10", c.sma10], ["SMA 20", c.sma20], ["SMA 50", c.sma50], ["SMA 200", c.sma200]]
        : [["SMA 10 tyg.", c.sma10], ["SMA 40 tyg.", c.sma40]];
    // Linie trendu (watchlist.py::detect_trendlines): opór/wsparcie jako odcinki (indeks, cena).
    const tl = c.tl || null;
    const lines = tl ? tl.lines.map(l => ({ kind: l.kind, i0: lineIndex(weeks, l.x0), y0: l.y0, i1: lineIndex(weeks, l.x1), y1: l.y1, touches: l.touches })) : [];
    // Miseczki (cup): lewy szczyt, dołek i prawy brzeg w indeksach świec; część może wypadać przed oknem (ujemne indeksy).
    const cups = (c.bases || []).filter(b => b.type === "cup" && b.low_date).map(b => ({
        i0: lineIndex(weeks, b.start), iLow: lineIndex(weeks, b.low_date), i1: lineIndex(weeks, b.end),
        peak: b.peak, low: b.low, right: b.end_close, depth: b.depth_pct, open: b.open,
    })).filter(b => b.i1 > b.i0 && b.iLow > b.i0 && b.iLow <= b.i1);
    const lastIdx = c.c.reduce((acc, v, i) => (Number.isFinite(v) ? i : acc), -1);
    return {
        ticker, daily: !!charts.daily, weeks, n: weeks.length, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v,
        smas: smas.map(([label, values]) => ({ label, values: values || [], color: SMA_COLORS[label] })),
        spx, rs, eps, lines, cups, trend: tl ? { pattern: tl.pattern, state: tl.state } : null,
        epsNext: c.eps_next || null, lastIdx,
        rsNewHigh: rsNewHighFlags(rs), volAvg: rollingMean(c.v, VOL_AVG_WEEKS),
        rsRating: stock && Number.isFinite(stock.rs_rating) ? stock.rs_rating : null,
    };
}

// Ostatnie n tygodni modelu (dla układu kompaktowego); wyniki EPS przesuwają się o odciętą liczbę tygodni.
function sliceModel(m, n) {
    if (m.n <= n) return m;
    const off = m.n - n;
    const cut = arr => arr.slice(off);
    return {
        ...m, weeks: cut(m.weeks), n, o: cut(m.o), h: cut(m.h), l: cut(m.l), c: cut(m.c), v: cut(m.v),
        smas: m.smas.map(x => ({ ...x, values: cut(x.values) })), spx: m.spx ? cut(m.spx) : null, rs: cut(m.rs),
        eps: m.eps.map(q => ({ ...q, week: q.week - off })).filter(q => q.week >= 0),
        lines: m.lines.map(l => ({ ...l, i0: l.i0 - off, i1: l.i1 - off })).filter(l => l.i1 > 0),
        cups: m.cups.map(c => ({ ...c, i0: c.i0 - off, iLow: c.iLow - off, i1: c.i1 - off })).filter(c => c.i1 > 0),
        rsNewHigh: cut(m.rsNewHigh), volAvg: cut(m.volAvg),
        lastIdx: m.lastIdx - off,
    };
}

const VOL_AVG_WEEKS = 10;       // średnia wolumenu ~50 sesji (jak linia średniego wolumenu w MarketSmith)
const RS_HIGH_MIN_WEEKS = 12;   // nowe maksimum linii RS liczymy dopiero po tylu tygodniach historii okna

// Tygodnie, w których linia RS ustanawia nowe maksimum okna (niebieska kropka w MarketSmith: RS przed ceną).
function rsNewHighFlags(rs) {
    let max = -Infinity;
    return rs.map((v, i) => {
        if (!Number.isFinite(v)) return false;
        const flag = i >= RS_HIGH_MIN_WEEKS && v >= max;
        if (v > max) max = v;
        return flag;
    });
}

function rollingMean(values, n) {
    return values.map((_, i) => {
        if (i < n - 1) return null;
        const win = values.slice(i - n + 1, i + 1);
        return win.every(Number.isFinite) ? win.reduce((a, b) => a + b, 0) / n : null;
    });
}

function polyline(points, color, width = 1.4, dash = "") {
    // points: [[x, y] | null, ...] — przerwy (null) dzielą linię na kawałki.
    const segs = [];
    let cur = [];
    points.forEach(p => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } });
    if (cur.length) segs.push(cur);
    return segs.filter(s => s.length > 1).map(s =>
        `<polyline fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""} points="${s.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"/>`
    ).join("");
}

// Etykiety osi: całkowite od 100 wzwyż, inaczej 2 miejsca (spójnie na całej osi).
function fmtAxis(v) {
    if (!Number.isFinite(v)) return "—";
    return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}

function fmtCompact(v) {
    if (!Number.isFinite(v)) return "—";
    if (Math.abs(v) >= 1000) return v.toFixed(0);
    return v.toFixed(2);
}

function chartSvg(m, opts = {}) {
    const L = opts.compact ? CHART_LAYOUT_COMPACT : CHART_LAYOUT;
    const fs = n => +(n * (opts.compact ? COMPACT_FONT_SCALE : 1)).toFixed(1);
    const plotW = L.width - L.left - L.right;
    const step = plotW / m.n;
    const x_ = i => L.left + (i + 0.5) * step;
    const x = x_;
    const barHalf = Math.max(1, Math.min(4, step * 0.32));
    const parts = [];

    // --- siatka czasu + etykiety kwartałów
    const labelWeeks = [];
    m.weeks.forEach((d, i) => {
        const month = Number(d.slice(5, 7)) - 1;
        const prevMonth = i ? Number(m.weeks[i - 1].slice(5, 7)) - 1 : -1;
        if (month !== prevMonth && month % 3 === 0) labelWeeks.push(i);
    });
    labelWeeks.forEach(i => {
        const d = m.weeks[i];
        parts.push(`<line x1="${x(i)}" x2="${x(i)}" y1="${L.bench.y}" y2="${L.eps.y + L.eps.h}" stroke="${CHART_COLORS.grid}" stroke-width="0.7"/>`);
        if (x(i) < L.left + 22) return;   // etykieta przy samej krawędzi byłaby ucięta
        parts.push(`<text x="${x(i)}" y="${L.axisY}" fill="${CHART_COLORS.text}" font-size="${fs(11)}" text-anchor="middle">${MONTHS_PL[Number(d.slice(5, 7)) - 1]} '${d.slice(2, 4)}</text>`);
    });

    // --- 1. benchmark
    const bExt = m.spx ? numericExtent([m.spx]) : null;
    if (bExt) {
        const labelH = fs(11) + 8;   // pas na podpis nad linią, żeby jej nie zasłaniał
        const yB = makeYScale(bExt[0], bExt[1], L.bench.y + labelH, L.bench.h - labelH - 4);
        parts.push(polyline(m.spx.map((v, i) => Number.isFinite(v) ? [x(i), yB(v)] : null), CHART_COLORS.bench, 1.3));
        const last = [...m.spx].reverse().find(Number.isFinite);
        const first = m.spx.find(Number.isFinite);
        const chg = ((last / first - 1) * 100);
        parts.push(`<text x="${L.left + 4}" y="${L.bench.y + 12}" fill="${CHART_COLORS.bench}" font-size="${fs(11)}" font-weight="600">S&amp;P 500 ${fmtCompact(last)} (${chg >= 0 ? "+" : ""}${chg.toFixed(0)}% w oknie)</text>`);
        niceTicks(bExt[0], bExt[1], 2).forEach(t => {
            parts.push(`<text x="${L.width - L.right + 6}" y="${yB(t) + 4}" fill="${CHART_COLORS.text}" font-size="${fs(10)}">${fmtAxis(t)}</text>`);
        });
    } else {
        parts.push(`<text x="${L.left + 4}" y="${L.bench.y + 14}" fill="${CHART_COLORS.text}" font-size="${fs(11)}">Brak danych benchmarku (S&amp;P 500)</text>`);
    }
    parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${L.price.y - 4}" y2="${L.price.y - 4}" stroke="${CHART_COLORS.grid}"/>`);

    // --- 2. cena: słupki OHLC + SMA + RS
    const pExt = numericExtent([m.h, m.l, ...m.smas.map(x => x.values)]) || [0, 1];
    const useLog = !!opts.log && pExt[0] > 0;
    const pad = (pExt[1] - pExt[0]) * 0.04;
    const pMin = useLog ? pExt[0] / 1.04 : pExt[0] - pad;
    const pMax = useLog ? pExt[1] * 1.04 : pExt[1] + pad;
    const yP = useLog ? makeLogScale(pMin, pMax, L.price.y, L.price.h) : makeYScale(pMin, pMax, L.price.y, L.price.h);
    (useLog ? logTicks(pMin, pMax) : niceTicks(pMin, pMax, 6)).forEach(t => {
        parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${yP(t)}" y2="${yP(t)}" stroke="${CHART_COLORS.grid}" stroke-width="0.5"/>`);
        parts.push(`<text x="${L.width - L.right + 6}" y="${yP(t) + 4}" fill="${CHART_COLORS.text}" font-size="${fs(10)}">${fmtAxis(t)}</text>`);
    });
    // miseczki (cup) jako łuk od lewego szczytu przez dołek do prawego brzegu, z głębokością w środku
    parts.push(`<clipPath id="chartPriceClip"><rect x="${L.left}" y="${L.price.y}" width="${L.width - L.left - L.right}" height="${L.price.h}"/></clipPath>`);
    m.cups.forEach(cup => {
        const yL = yP(cup.peak), yB = yP(cup.low), yR = yP(Number.isFinite(cup.right) ? cup.right : cup.peak);
        const pts = [];
        for (let k = 0; k <= 48; k++) {
            const i = cup.i0 + (cup.i1 - cup.i0) * k / 48;
            const t = i <= cup.iLow ? (cup.iLow - i) / Math.max(1e-9, cup.iLow - cup.i0) : (i - cup.iLow) / Math.max(1e-9, cup.i1 - cup.iLow);
            const edge = i <= cup.iLow ? yL : yR;
            pts.push(`${(x(i)).toFixed(1)},${(yB - (yB - edge) * t * t).toFixed(1)}`);
        }
        parts.push(`<polyline clip-path="url(#chartPriceClip)" fill="none" stroke="${CHART_COLORS.cup}" stroke-width="2" stroke-linecap="round" points="${pts.join(" ")}"><title>Cup −${cup.depth}%</title></polyline>`);
        const cx = Math.min(Math.max(x((cup.i0 + cup.i1) / 2), L.left + 24), L.width - L.right - 24);
        parts.push(`<text x="${cx}" y="${yB - (yB - Math.min(yL, yR)) * 0.35}" font-size="${fs(12)}" font-weight="700" fill="${CHART_COLORS.cup}" text-anchor="middle" stroke="#0e0f13" stroke-width="3" paint-order="stroke">−${cup.depth}%</text>`);
    });
    for (let i = 0; i < m.n; i++) {
        if (![m.o[i], m.h[i], m.l[i], m.c[i]].every(Number.isFinite)) continue;
        const col = m.c[i] >= m.o[i] ? CHART_COLORS.up : CHART_COLORS.down;
        parts.push(`<g stroke="${col}" stroke-width="${step > 5 ? 1.6 : 1.1}">`
            + `<line x1="${x(i)}" x2="${x(i)}" y1="${yP(m.h[i])}" y2="${yP(m.l[i])}"/>`
            + `<line x1="${x(i) - barHalf}" x2="${x(i)}" y1="${yP(m.o[i])}" y2="${yP(m.o[i])}"/>`
            + `<line x1="${x(i)}" x2="${x(i) + barHalf}" y1="${yP(m.c[i])}" y2="${yP(m.c[i])}"/></g>`);
    }
    m.smas.forEach(x => parts.push(polyline(x.values.map((v, i) => Number.isFinite(v) ? [x_(i), yP(v)] : null), x.color, 1.4)));
    // linie trendu: opór (pomarańczowa) i wsparcie (szara), od pierwszego dotknięcia do ostatniej świecy
    m.lines.forEach(l => {
        const at = i => l.y0 + (l.y1 - l.y0) * (i - l.i0) / Math.max(1, l.i1 - l.i0);
        const i0 = Math.max(0, l.i0);
        const col = l.kind === "res" ? CHART_COLORS.res : CHART_COLORS.sup;
        const y0 = Math.min(Math.max(yP(at(i0)), L.price.y), L.price.y + L.price.h);
        const y1 = Math.min(Math.max(yP(at(l.i1)), L.price.y), L.price.y + L.price.h);
        parts.push(`<line x1="${x_(i0)}" y1="${y0}" x2="${x_(l.i1)}" y2="${y1}" stroke="${col}" stroke-width="1.6" stroke-dasharray="6 3"><title>${l.kind === "res" ? "Opór" : "Wsparcie"} (${l.touches} dotknięć)</title></line>`);
    });
    if (m.trend && m.trend.state === "wybicie" && Number.isFinite(m.h[m.lastIdx])) {
        const bx = x_(m.lastIdx), by = yP(m.h[m.lastIdx]) - 8;
        parts.push(`<path d="M${bx - 6},${by - 10} L${bx + 6},${by - 10} L${bx},${by} Z" fill="${CHART_COLORS.res}"><title>Wybicie z linii trendu</title></path>`);
    }
    // linia RS w dolnej ~1/3 panelu (własna skala — liczy się kształt/kierunek, nie wartość)
    const rExt = numericExtent([m.rs]);
    if (rExt) {
        const yR = makeYScale(rExt[0], rExt[1], L.price.y + L.price.h * 0.68, L.price.h * 0.3);
        parts.push(polyline(m.rs.map((v, i) => Number.isFinite(v) ? [x(i), yR(v)] : null), CHART_COLORS.rs, 1.6));
        m.rsNewHigh.forEach((flag, i) => {
            if (flag) parts.push(`<circle cx="${x(i)}" cy="${yR(m.rs[i])}" r="${opts.compact ? 3.2 : 2.6}" fill="${CHART_COLORS.rs}"><title>RS na nowym maksimum okna</title></circle>`);
        });
    }
    // znaczniki dat wyników na dole panelu cen
    m.eps.forEach(q => {
        const cx = x(q.week), cy = L.price.y + L.price.h - 6;
        parts.push(`<path d="M${cx - 4},${cy} L${cx + 4},${cy} L${cx},${cy - 8} Z" fill="${CHART_COLORS.textStrong}" opacity="0.7"><title>Wyniki ${q.d}: EPS ${q.e}</title></path>`);
    });
    // pasek legendy nad panelem cen (osobny pas — nic nie zasłania świec)
    const smaItems = m.smas.map(x => `<tspan fill="${x.color}">— ${x.label}</tspan>`);
    const otherItems = [`<tspan fill="${CHART_COLORS.rs}">— RS spółka/S&amp;P${m.rsRating != null ? ` · Rating ${m.rsRating}` : ""}</tspan>`];
    if (m.trend && m.trend.pattern) otherItems.push(`<tspan fill="${CHART_COLORS.res}">▸ ${escapeHtml(m.trend.pattern)}</tspan>`);
    if (m.trend && m.trend.state) otherItems.push(`<tspan fill="${CHART_COLORS.res}" font-weight="700">${m.trend.state === "wybicie" ? "▲ wybicie z linii trendu" : "przy oporze"}</tspan>`);
    if (useLog) otherItems.push("skala log.");
    const legendRows = opts.compact ? [smaItems, otherItems] : [[...smaItems, ...otherItems]];
    legendRows.forEach((row, r) => {
        parts.push(`<text x="${L.left + 4}" y="${L.legend.y + fs(11) + 2 + r * fs(11) * 1.5}" font-size="${fs(11)}" fill="${CHART_COLORS.text}">${row.join("  ")}</text>`);
    });

    // --- 3. wolumen
    const vMax = Math.max(1, ...m.v.filter(Number.isFinite));
    parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${L.volume.y - 4}" y2="${L.volume.y - 4}" stroke="${CHART_COLORS.grid}"/>`);
    for (let i = 0; i < m.n; i++) {
        if (!Number.isFinite(m.v[i])) continue;
        const col = m.c[i] >= m.o[i] ? CHART_COLORS.up : CHART_COLORS.down;
        const h = (m.v[i] / vMax) * (L.volume.h - fs(11) - 4);
        parts.push(`<rect x="${x(i) - barHalf}" y="${L.volume.y + L.volume.h - h}" width="${barHalf * 2}" height="${h}" fill="${col}" opacity="0.75"/>`);
    }
    parts.push(polyline(m.volAvg.map((v, i) => Number.isFinite(v) ? [x(i), L.volume.y + L.volume.h - Math.min(1, v / vMax) * (L.volume.h - fs(11) - 4)] : null), CHART_COLORS.volAvg, 1.3));
    parts.push(`<text x="${L.left + 4}" y="${L.volume.y + fs(11)}" font-size="${fs(11)}" fill="${CHART_COLORS.text}">${m.daily ? "Wolumen dzienny · średnia 10 dni" : "Wolumen tygodniowy · średnia 10 tyg."}</text>`);
    parts.push(`<text x="${L.width - L.right + 6}" y="${L.volume.y + fs(10)}" font-size="${fs(10)}" fill="${CHART_COLORS.text}">${(vMax / 1000).toFixed(1)}${opts.compact ? "M" : " mln"}</text>`);

    // --- 4. EPS kwartalny
    parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${L.eps.y - 4}" y2="${L.eps.y - 4}" stroke="${CHART_COLORS.grid}"/>`);
    parts.push(`<text x="${L.left + 4}" y="${L.eps.y + 10}" font-size="${fs(11)}" fill="${CHART_COLORS.eps}" font-weight="600">EPS kwartalny (zmiana r/r)</text>`);
    if (m.eps.length) {
        const vals = m.eps.map(q => q.e);
        const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
        const yE = makeYScale(lo, hi, L.eps.y + 34, L.eps.h - 50);
        if (lo < 0) parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${yE(0)}" y2="${yE(0)}" stroke="${CHART_COLORS.grid}" stroke-dasharray="3 3"/>`);
        parts.push(polyline(m.eps.map(q => [x(q.week), yE(q.e)]), CHART_COLORS.eps, 1.8));
        m.eps.forEach(q => {
            const cx = x(q.week), cy = yE(q.e);
            parts.push(`<circle cx="${cx}" cy="${cy}" r="3.5" fill="${CHART_COLORS.eps}"/>`);
            parts.push(`<text x="${cx}" y="${cy - 8}" font-size="${fs(11)}" fill="${CHART_COLORS.textStrong}" text-anchor="middle">${q.e}</text>`);
            if (Number.isFinite(q.g)) {
                parts.push(`<text x="${cx}" y="${L.eps.y + L.eps.h - 2}" font-size="${fs(11)}" font-weight="600" text-anchor="middle" fill="${q.g >= 0 ? CHART_COLORS.up : CHART_COLORS.down}">${q.g >= 0 ? "+" : ""}${q.g}%</text>`);
            }
        });
    } else {
        parts.push(`<text x="${L.left + 4}" y="${L.eps.y + 40}" font-size="${fs(11)}" fill="${CHART_COLORS.text}">Brak danych o EPS kwartalnym dla tej spółki.</text>`);
    }

    // --- crosshair (ustawiany w attachChartHover)
    parts.push(`<line id="chartCross" x1="0" x2="0" y1="${L.bench.y}" y2="${L.eps.y + L.eps.h}" stroke="#ffffff" stroke-width="0.8" opacity="0" pointer-events="none"/>`);
    return `<svg id="chartSvg" viewBox="0 0 ${L.width} ${L.height}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Wykres ${m.daily ? "dzienny" : "tygodniowy"} ${escapeHtml(m.ticker)}">${parts.join("")}</svg>`;
}

// Tekst paska nad wykresem dla wskazanego tygodnia.
function chartReadout(m, i) {
    if (i < 0 || i >= m.n || !Number.isFinite(m.c[i])) return "";
    const rs = Number.isFinite(m.rs[i]) ? ` · RS ${m.rs[i].toFixed(3)}` : "";
    const spx = m.spx && Number.isFinite(m.spx[i]) ? ` · S&P ${fmtCompact(m.spx[i])}` : "";
    return `${m.weeks[i]} · O ${fmtCompact(m.o[i])} H ${fmtCompact(m.h[i])} L ${fmtCompact(m.l[i])} C ${fmtCompact(m.c[i])}`
        + ` · wol. ${Number.isFinite(m.v[i]) ? (m.v[i] / 1000).toFixed(1) + " mln" : "—"}${rs}${spx}`;
}

function attachChartHover(container, m, readoutEl, L) {
    const svg = container.querySelector("#chartSvg");
    const cross = container.querySelector("#chartCross");
    if (!svg || !cross) return;
    const plotW = L.width - L.left - L.right;
    svg.addEventListener("mousemove", ev => {
        const rect = svg.getBoundingClientRect();
        const vx = (ev.clientX - rect.left) / rect.width * L.width;
        const i = Math.floor((vx - L.left) / plotW * m.n);
        if (i < 0 || i >= m.n) return;
        const cx = L.left + (i + 0.5) * (plotW / m.n);
        cross.setAttribute("x1", cx);
        cross.setAttribute("x2", cx);
        cross.setAttribute("opacity", "0.45");
        readoutEl.textContent = chartReadout(m, i);
    });
    svg.addEventListener("mouseleave", () => {
        cross.setAttribute("opacity", "0");
        readoutEl.textContent = chartReadout(m, m.lastIdx);
    });
}

// Rysuje wykres w kontenerze; zwraca model (albo null, gdy brak danych dla tickera).
function renderStockChart(container, readoutEl, charts, ticker, stock, opts = {}) {
    let m = buildChartModel(opts.daily ? (dailyCharts(charts) || charts) : charts, ticker, stock);
    if (!m) {
        container.innerHTML = `<div class="empty-state">Brak danych wykresu dla ${escapeHtml(ticker)} — odśwież dane (watchlist.py).</div>`;
        readoutEl.textContent = "";
        return null;
    }
    const full = m;
    if (opts.compact) m = sliceModel(m, m.daily ? COMPACT_DAYS : COMPACT_WEEKS);
    container.innerHTML = chartSvg(m, opts);
    readoutEl.textContent = chartReadout(m, m.lastIdx);
    attachChartHover(container, m, readoutEl, opts.compact ? CHART_LAYOUT_COMPACT : CHART_LAYOUT);
    return full;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        niceTicks, makeYScale, makeLogScale, logTicks, numericExtent, sliceModel, dailyCharts, rsNewHighFlags, rollingMean, weekIndexForDate, buildChartModel, chartSvg, chartReadout, polyline, CHART_LAYOUT,
    };
}
