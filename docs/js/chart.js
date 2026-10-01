// ============================================================
// WYKRES W STYLU MARKETSMITH (okienko po kliknięciu spółki na index.html) — czysty SVG, bez bibliotek.
// Dane: docs/data/charts.json (watchlist.py::build_charts) — wspólna lista tygodni, S&P 500 i dla każdej
// spółki tygodniowe OHLC + wolumen + SMA10/SMA40 + kwartalny EPS. Panele od góry:
//   1. linia benchmarku (S&P 500),
//   2. słupki OHLC + SMA10 (zielona) / SMA40 (czerwona) + linia RS (spółka / S&P 500, niebieska) w dolnej części,
//   3. wolumen,
//   4. linia EPS kwartalnego (wartość + zmiana r/r), znaczniki dat wyników także na panelu cen.
// Logika modelu/skal jest czysta i testowana (tests/js/chart.test.js), rysowanie to tylko składanie SVG.
// ============================================================

const CHART_LAYOUT = {
    width: 1000, height: 690, left: 10, right: 66,
    bench: { y: 8, h: 70 }, price: { y: 88, h: 340 }, volume: { y: 436, h: 78 }, eps: { y: 526, h: 118 },
    axisY: 668,
};
const CHART_COLORS = {
    up: "#2ecc71", down: "#e0455a", sma10: "#3fbf6e", sma40: "#e0455a", rs: "#4aa3ff", bench: "#c9ced8",
    eps: "#e0b341", grid: "#262a35", text: "#8a8f9c", textStrong: "#e8eaed",
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
function buildChartModel(charts, ticker, stock) {
    const c = charts && charts.stocks && charts.stocks[ticker];
    if (!c) return null;
    const weeks = charts.weeks;
    const spx = charts.spx || null;
    const rs = c.c.map((close, i) => (spx && Number.isFinite(close) && Number.isFinite(spx[i]) && spx[i] > 0) ? close / spx[i] : null);
    const eps = (c.eps || []).map(q => ({ ...q, week: weekIndexForDate(weeks, q.d) })).filter(q => q.week >= 0);
    const lastIdx = c.c.reduce((acc, v, i) => (Number.isFinite(v) ? i : acc), -1);
    return {
        ticker, weeks, n: weeks.length, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v, sma10: c.sma10, sma40: c.sma40,
        spx, rs, eps, epsNext: c.eps_next || null, lastIdx,
        rsRating: stock && Number.isFinite(stock.rs_rating) ? stock.rs_rating : null,
    };
}

function chartEsc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
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

function chartSvg(m) {
    const L = CHART_LAYOUT;
    const plotW = L.width - L.left - L.right;
    const step = plotW / m.n;
    const x = i => L.left + (i + 0.5) * step;
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
        parts.push(`<text x="${x(i)}" y="${L.axisY}" fill="${CHART_COLORS.text}" font-size="11" text-anchor="middle">${MONTHS_PL[Number(d.slice(5, 7)) - 1]} '${d.slice(2, 4)}</text>`);
    });

    // --- 1. benchmark
    const bExt = m.spx ? numericExtent([m.spx]) : null;
    if (bExt) {
        const yB = makeYScale(bExt[0], bExt[1], L.bench.y + 4, L.bench.h - 8);
        parts.push(polyline(m.spx.map((v, i) => Number.isFinite(v) ? [x(i), yB(v)] : null), CHART_COLORS.bench, 1.3));
        const last = [...m.spx].reverse().find(Number.isFinite);
        const first = m.spx.find(Number.isFinite);
        const chg = ((last / first - 1) * 100);
        parts.push(`<text x="${L.left + 4}" y="${L.bench.y + 12}" fill="${CHART_COLORS.bench}" font-size="11" font-weight="600">S&amp;P 500 ${fmtCompact(last)} (${chg >= 0 ? "+" : ""}${chg.toFixed(0)}% w oknie)</text>`);
        niceTicks(bExt[0], bExt[1], 2).forEach(t => {
            parts.push(`<text x="${L.width - L.right + 6}" y="${yB(t) + 4}" fill="${CHART_COLORS.text}" font-size="10">${fmtAxis(t)}</text>`);
        });
    } else {
        parts.push(`<text x="${L.left + 4}" y="${L.bench.y + 14}" fill="${CHART_COLORS.text}" font-size="11">Brak danych benchmarku (S&amp;P 500)</text>`);
    }
    parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${L.price.y - 4}" y2="${L.price.y - 4}" stroke="${CHART_COLORS.grid}"/>`);

    // --- 2. cena: słupki OHLC + SMA + RS
    const pExt = numericExtent([m.h, m.l, m.sma10, m.sma40]) || [0, 1];
    const pad = (pExt[1] - pExt[0]) * 0.04;
    const pMin = pExt[0] - pad, pMax = pExt[1] + pad;
    const yP = makeYScale(pMin, pMax, L.price.y, L.price.h);
    niceTicks(pMin, pMax, 6).forEach(t => {
        parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${yP(t)}" y2="${yP(t)}" stroke="${CHART_COLORS.grid}" stroke-width="0.5"/>`);
        parts.push(`<text x="${L.width - L.right + 6}" y="${yP(t) + 4}" fill="${CHART_COLORS.text}" font-size="10">${fmtAxis(t)}</text>`);
    });
    for (let i = 0; i < m.n; i++) {
        if (![m.o[i], m.h[i], m.l[i], m.c[i]].every(Number.isFinite)) continue;
        const col = m.c[i] >= m.o[i] ? CHART_COLORS.up : CHART_COLORS.down;
        parts.push(`<g stroke="${col}" stroke-width="${step > 5 ? 1.6 : 1.1}">`
            + `<line x1="${x(i)}" x2="${x(i)}" y1="${yP(m.h[i])}" y2="${yP(m.l[i])}"/>`
            + `<line x1="${x(i) - barHalf}" x2="${x(i)}" y1="${yP(m.o[i])}" y2="${yP(m.o[i])}"/>`
            + `<line x1="${x(i)}" x2="${x(i) + barHalf}" y1="${yP(m.c[i])}" y2="${yP(m.c[i])}"/></g>`);
    }
    parts.push(polyline(m.sma10.map((v, i) => Number.isFinite(v) ? [x(i), yP(v)] : null), CHART_COLORS.sma10, 1.4));
    parts.push(polyline(m.sma40.map((v, i) => Number.isFinite(v) ? [x(i), yP(v)] : null), CHART_COLORS.sma40, 1.4));
    // linia RS w dolnej ~1/3 panelu (własna skala — liczy się kształt/kierunek, nie wartość)
    const rExt = numericExtent([m.rs]);
    if (rExt) {
        const yR = makeYScale(rExt[0], rExt[1], L.price.y + L.price.h * 0.68, L.price.h * 0.3);
        parts.push(polyline(m.rs.map((v, i) => Number.isFinite(v) ? [x(i), yR(v)] : null), CHART_COLORS.rs, 1.6));
        const lastRs = [...m.rs].reverse().findIndex(Number.isFinite);
        if (lastRs >= 0 && m.rsRating != null) {
            const li = m.n - 1 - lastRs;
            parts.push(`<text x="${x(li) - 4}" y="${yR(m.rs[li]) - 8}" fill="${CHART_COLORS.rs}" font-size="12" font-weight="700" text-anchor="end">RS Rating ${m.rsRating}</text>`);
        }
    }
    // znaczniki dat wyników na dole panelu cen
    m.eps.forEach(q => {
        const cx = x(q.week), cy = L.price.y + L.price.h - 6;
        parts.push(`<path d="M${cx - 4},${cy} L${cx + 4},${cy} L${cx},${cy - 8} Z" fill="${CHART_COLORS.textStrong}" opacity="0.7"><title>Wyniki ${q.d}: EPS ${q.e}</title></path>`);
    });
    parts.push(`<text x="${L.left + 4}" y="${L.price.y + 12}" font-size="11" fill="${CHART_COLORS.text}">`
        + `<tspan fill="${CHART_COLORS.sma10}">— SMA 10 tyg.</tspan>  <tspan fill="${CHART_COLORS.sma40}">— SMA 40 tyg.</tspan>  <tspan fill="${CHART_COLORS.rs}">— RS (spółka / S&amp;P 500)</tspan></text>`);

    // --- 3. wolumen
    const vMax = Math.max(1, ...m.v.filter(Number.isFinite));
    parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${L.volume.y - 4}" y2="${L.volume.y - 4}" stroke="${CHART_COLORS.grid}"/>`);
    for (let i = 0; i < m.n; i++) {
        if (!Number.isFinite(m.v[i])) continue;
        const col = m.c[i] >= m.o[i] ? CHART_COLORS.up : CHART_COLORS.down;
        const h = (m.v[i] / vMax) * L.volume.h;
        parts.push(`<rect x="${x(i) - barHalf}" y="${L.volume.y + L.volume.h - h}" width="${barHalf * 2}" height="${h}" fill="${col}" opacity="0.75"/>`);
    }
    parts.push(`<text x="${L.left + 4}" y="${L.volume.y + 10}" font-size="11" fill="${CHART_COLORS.text}">Wolumen tygodniowy</text>`);
    parts.push(`<text x="${L.width - L.right + 6}" y="${L.volume.y + 10}" font-size="10" fill="${CHART_COLORS.text}">${(vMax / 1000).toFixed(1)} mln</text>`);

    // --- 4. EPS kwartalny
    parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${L.eps.y - 4}" y2="${L.eps.y - 4}" stroke="${CHART_COLORS.grid}"/>`);
    parts.push(`<text x="${L.left + 4}" y="${L.eps.y + 10}" font-size="11" fill="${CHART_COLORS.eps}" font-weight="600">EPS kwartalny (zmiana r/r)</text>`);
    if (m.eps.length) {
        const vals = m.eps.map(q => q.e);
        const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
        const yE = makeYScale(lo, hi, L.eps.y + 34, L.eps.h - 50);
        if (lo < 0) parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${yE(0)}" y2="${yE(0)}" stroke="${CHART_COLORS.grid}" stroke-dasharray="3 3"/>`);
        parts.push(polyline(m.eps.map(q => [x(q.week), yE(q.e)]), CHART_COLORS.eps, 1.8));
        m.eps.forEach(q => {
            const cx = x(q.week), cy = yE(q.e);
            parts.push(`<circle cx="${cx}" cy="${cy}" r="3.5" fill="${CHART_COLORS.eps}"/>`);
            parts.push(`<text x="${cx}" y="${cy - 8}" font-size="11" fill="${CHART_COLORS.textStrong}" text-anchor="middle">${q.e}</text>`);
            if (Number.isFinite(q.g)) {
                parts.push(`<text x="${cx}" y="${L.eps.y + L.eps.h - 2}" font-size="11" font-weight="600" text-anchor="middle" fill="${q.g >= 0 ? CHART_COLORS.up : CHART_COLORS.down}">${q.g >= 0 ? "+" : ""}${q.g}%</text>`);
            }
        });
    } else {
        parts.push(`<text x="${L.left + 4}" y="${L.eps.y + 40}" font-size="11" fill="${CHART_COLORS.text}">Brak danych o EPS kwartalnym dla tej spółki.</text>`);
    }

    // --- crosshair (ustawiany w attachChartHover)
    parts.push(`<line id="chartCross" x1="0" x2="0" y1="${L.bench.y}" y2="${L.eps.y + L.eps.h}" stroke="#ffffff" stroke-width="0.8" opacity="0" pointer-events="none"/>`);
    return `<svg id="chartSvg" viewBox="0 0 ${L.width} ${L.height}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Wykres tygodniowy ${chartEsc(m.ticker)}">${parts.join("")}</svg>`;
}

// Tekst paska nad wykresem dla wskazanego tygodnia.
function chartReadout(m, i) {
    if (i < 0 || i >= m.n || !Number.isFinite(m.c[i])) return "";
    const rs = Number.isFinite(m.rs[i]) ? ` · RS ${m.rs[i].toFixed(3)}` : "";
    const spx = m.spx && Number.isFinite(m.spx[i]) ? ` · S&P ${fmtCompact(m.spx[i])}` : "";
    return `${m.weeks[i]} · O ${fmtCompact(m.o[i])} H ${fmtCompact(m.h[i])} L ${fmtCompact(m.l[i])} C ${fmtCompact(m.c[i])}`
        + ` · wol. ${Number.isFinite(m.v[i]) ? (m.v[i] / 1000).toFixed(1) + " mln" : "—"}${rs}${spx}`;
}

function attachChartHover(container, m, readoutEl) {
    const svg = container.querySelector("#chartSvg");
    const cross = container.querySelector("#chartCross");
    if (!svg || !cross) return;
    const L = CHART_LAYOUT;
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
function renderStockChart(container, readoutEl, charts, ticker, stock) {
    const m = buildChartModel(charts, ticker, stock);
    if (!m) {
        container.innerHTML = `<div class="empty-state">Brak danych wykresu dla ${chartEsc(ticker)} — odśwież dane (watchlist.py).</div>`;
        readoutEl.textContent = "";
        return null;
    }
    container.innerHTML = chartSvg(m);
    readoutEl.textContent = chartReadout(m, m.lastIdx);
    attachChartHover(container, m, readoutEl);
    return m;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        niceTicks, makeYScale, numericExtent, weekIndexForDate, buildChartModel, chartSvg, chartReadout, polyline, CHART_LAYOUT,
    };
}
