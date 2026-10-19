// 🧭 Krok po kroku: 1) Rynek (S&P 500, Nasdaq 100, Dow Jones), 2) Sektory (ETF SPDR), 3) Akcje z wybranego sektora.
// Wszystko na wykresach TYGODNIOWYCH „10:30” (Weinstein: cena + SMA 10 i SMA 30 tygodni), każdy walor w prostokątnym kafelku
// jak widok TA w skanerze Finviza (wykres + tabelka). Czyste funkcje — testy w tests/js/flow.test.js; rysowanie bez bibliotek (SVG).
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
}

const FLOW_COLORS = { price: "#b4bac4", s10: "#4fc3f7", s30: "#f0b429", up: "#4ee08a", down: "#ff6b6b", grid: "#2b3038", text: "#8a8f9c", bg: "#151920" };
const FLOW_SHOW_WEEKS = 104;     // kafelek pokazuje 2 lata tygodniowych zamknięć
const FLOW_SLOPE_WEEKS = 4;      // nachylenie SMA 30: porównanie z wartością sprzed 4 tygodni
const FLOW_MAX_DIST = 15;        // sygnał „blisko wybicia”: najwyżej 15 % do góry boxa / green line (dalej = brak sygnału)
const FLOW_MRS_WEEKS = 52;       // Mansfield RS: (walor / S&P 500) względem swojej 52-tygodniowej średniej

// SMA z n ostatnich zamknięć; null, dopóki w oknie brakuje danych.
function flowSma(c, n) {
    return c.map((_, i) => {
        if (i < n - 1) return null;
        let s = 0;
        for (let k = i - n + 1; k <= i; k++) {
            if (!Number.isFinite(c[k])) return null;
            s += c[k];
        }
        return s / n;
    });
}

const lastIdx = c => c.reduce((q, v, i) => (Number.isFinite(v) ? i : q), -1);

// Stan „10:30” na ostatnim zamknięciu tygodnia: up = cena nad SMA 30, SMA 10 nad SMA 30 i SMA 30 nie spada; down = odwrotnie; reszta = bez trendu.
function trend1030(c) {
    const i = lastIdx(c || []);
    if (i < 0) return { state: "na" };
    const s10 = flowSma(c, 10), s30 = flowSma(c, 30);
    const close = c[i], a = s10[i], b = s30[i], b4 = s30[i - FLOW_SLOPE_WEEKS];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { state: "na", close };
    const slope = Number.isFinite(b4) ? (b / b4 - 1) * 100 : null;
    const rising = slope === null || slope >= 0;
    const state = close > b && a > b && rising ? "up" : close < b && a < b && !rising ? "down" : "flat";
    return { state, close, s10: a, s30: b, slope, pct10: (close / a - 1) * 100, pct30: (close / b - 1) * 100 };
}
const TREND_LABELS = { up: ["📈 rośnie", "positive"], down: ["📉 spada", "negative"], flat: ["↔ bez trendu", "muted"], na: ["—", "muted"] };

// Mansfield RS (Stan Weinstein): RP = walor / S&P 500, MRS = (RP / średnia 52 tyg. RP − 1) · 100. > 0 = wygrywa z rynkiem.
function mansfieldRS(c, bench, n = FLOW_MRS_WEEKS) {
    if (!c || !bench) return null;
    const rp = c.map((v, k) => (Number.isFinite(v) && Number.isFinite(bench[k]) && bench[k] > 0 ? v / bench[k] : null));
    const avg = flowSma(rp, n), i = lastIdx(rp);
    return i >= 0 && Number.isFinite(avg[i]) && avg[i] > 0 ? (rp[i] / avg[i] - 1) * 100 : null;
}

// Zmiany ceny jak w Finvizie (tygodniowe zamknięcia): tydzień, miesiąc (4), kwartał (13), pół roku (26), rok (52), od początku roku; % od szczytu 52 tyg.
function flowPerf(c, weeks) {
    const i = lastIdx(c || []);
    if (i < 0) return {};
    const ch = k => (i - k >= 0 && Number.isFinite(c[i - k]) && c[i - k] > 0 ? (c[i] / c[i - k] - 1) * 100 : null);
    let ytd = null;
    if (weeks && weeks[i]) {
        const y = weeks[i].slice(0, 4);
        for (let k = i - 1; k >= 0; k--) {
            if (weeks[k] && weeks[k].slice(0, 4) < y && Number.isFinite(c[k])) { ytd = (c[i] / c[k] - 1) * 100; break; }
        }
    }
    const win = c.slice(Math.max(0, i - 51), i + 1).filter(Number.isFinite);
    return { w: ch(1), m: ch(4), q: ch(13), h: ch(26), y: ch(52), ytd, hi52: win.length ? (c[i] / Math.max(...win) - 1) * 100 : null };
}

// Ile brakuje do wybicia: najbliższy z dwóch sygnałów — punkt kupna karty Darvasa (dv_*) i green line (glb_*).
// key: −1 = wybicie w tym tygodniu, potem % do punktu kupna (mniej = bliżej); null = brak sygnału (na koniec listy).
function flowBreakout(s) {
    const c = [];
    if (s.dv_state === "BUY") c.push({ key: -1, src: "box", text: "📦 wybicie z boxa" });
    else if (["READY", "WAIT", "HOLD"].includes(s.dv_state) && Number.isFinite(s.dv_dist) && s.dv_dist >= 0 && s.dv_dist <= FLOW_MAX_DIST) {
        c.push({ key: s.dv_dist, src: "box", text: `📦 ${s.dv_dist.toFixed(1).replace(".", ",")} % do góry boxa` });
    }
    if (s.glb_state === "BREAK") c.push({ key: -1, src: "glb", text: "🟩 wybicie green line" });
    else if (s.glb_state === "WAIT" && Number.isFinite(s.glb_dist) && s.glb_dist <= FLOW_MAX_DIST) c.push({ key: s.glb_dist, src: "glb", text: `🟩 ${s.glb_dist.toFixed(1).replace(".", ",")} % do green line` });
    else if (s.glb_state === "ABOVE" && Number.isFinite(s.glb_dist) && -s.glb_dist <= 5) c.push({ key: 0, src: "glb", text: `🟩 ${(-s.glb_dist).toFixed(1).replace(".", ",")} % nad green line` });
    if (!c.length) return { key: null, text: "" };
    c.sort((a, b) => a.key - b.key);
    return { key: c[0].key, src: c[0].src, text: c.map(x => x.text).join(" · ") };
}
function flowSortStocks(stocks) {
    return stocks.map(s => ({ s, b: flowBreakout(s) }))
        .sort((x, y) => (x.b.key === null) - (y.b.key === null) || (x.b.key ?? 0) - (y.b.key ?? 0) || (y.s.rs_rating ?? -1) - (x.s.rs_rating ?? -1))
        .map(x => Object.assign(x.s, { flow_brk: x.b }));
}

// Wykres 10:30: szara linia zamknięć tygodniowych, SMA 10 (niebieska) i SMA 30 (bursztynowa) liczone na całej historii, oś cen po prawej,
// lata / kwartały na dole, kolorowy znacznik ostatniej ceny (zielony: tydzień w górę, czerwony: w dół).
function chart1030Svg(c, weeks, opts = {}) {
    const W = opts.w || 520, H = opts.h || 230, n0 = opts.weeks || FLOW_SHOW_WEEKS;
    const iL = lastIdx(c || []);
    if (iL < 1) return `<svg viewBox="0 0 ${W} ${H}" width="100%"><text x="12" y="24" fill="${FLOW_COLORS.text}" font-size="12">Brak danych tygodniowych.</text></svg>`;
    const s10 = flowSma(c, 10), s30 = flowSma(c, 30);
    const i0 = Math.max(0, iL - n0 + 1), n = iL - i0 + 1;
    const L = { l: 6, r: 50, t: 8, b: 18 }, pw = W - L.l - L.r, ph = H - L.t - L.b;
    const vals = [];
    for (let i = i0; i <= iL; i++) [c[i], s10[i], s30[i]].forEach(v => { if (Number.isFinite(v)) vals.push(v); });
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.06 || hi * 0.02;
    lo -= pad; hi += pad;
    const x = i => L.l + (pw * (i - i0)) / Math.max(1, n - 1);
    const y = v => L.t + ph * (1 - (v - lo) / (hi - lo));
    const out = [`<rect width="${W}" height="${H}" fill="${FLOW_COLORS.bg}"/>`];
    const ticks = typeof niceTicks === "function" ? niceTicks(lo, hi, 4) : [lo, (lo + hi) / 2, hi];
    ticks.forEach(t => {
        const yy = y(t).toFixed(1);
        out.push(`<line x1="${L.l}" x2="${W - L.r}" y1="${yy}" y2="${yy}" stroke="${FLOW_COLORS.grid}" stroke-width="1"/>`);
        out.push(`<text x="${W - L.r + 4}" y="${(+yy + 3.5).toFixed(1)}" font-size="10" fill="${FLOW_COLORS.text}">${+t.toPrecision(4)}</text>`);
    });
    if (weeks) {
        for (let i = i0 + 1; i <= iL; i++) {
            const a = weeks[i - 1], b = weeks[i];
            if (!a || !b || a.slice(0, 7) === b.slice(0, 7)) continue;
            const m = +b.slice(5, 7);
            if (![1, 4, 7, 10].includes(m)) continue;
            const xx = x(i).toFixed(1);
            out.push(`<line x1="${xx}" x2="${xx}" y1="${L.t}" y2="${H - L.b}" stroke="${FLOW_COLORS.grid}" stroke-width="1" stroke-dasharray="${m === 1 ? "" : "2 3"}"/>`);
            out.push(`<text x="${(+xx + 2).toFixed(1)}" y="${H - 5}" font-size="9.5" fill="${FLOW_COLORS.text}">${m === 1 ? b.slice(0, 4) : ["", "", "", "", "kw2", "", "", "kw3", "", "", "kw4"][m]}</text>`);
        }
    }
    const line = (arr, col, w) => {
        const segs = [];
        let cur = [];
        for (let i = i0; i <= iL; i++) {
            if (Number.isFinite(arr[i])) cur.push(`${x(i).toFixed(1)},${y(arr[i]).toFixed(1)}`);
            else if (cur.length) { segs.push(cur); cur = []; }
        }
        if (cur.length) segs.push(cur);
        return segs.filter(sg => sg.length > 1).map(sg => `<polyline points="${sg.join(" ")}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"/>`).join("");
    };
    out.push(line(s30, FLOW_COLORS.s30, 1.6), line(s10, FLOW_COLORS.s10, 1.4), line(c, FLOW_COLORS.price, 1.8));
    const px = c[iL], prev = c[iL - 1], col = Number.isFinite(prev) && px < prev ? FLOW_COLORS.down : FLOW_COLORS.up, yy = y(px);
    out.push(`<line x1="${L.l}" x2="${W - L.r}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${col}" stroke-width="1" stroke-dasharray="1 3" opacity="0.8"/>`);
    out.push(`<rect x="${W - L.r + 1}" y="${(yy - 8).toFixed(1)}" width="${L.r - 2}" height="16" rx="2" fill="${col}"/><text x="${W - L.r + 4}" y="${(yy + 4).toFixed(1)}" font-size="10.5" font-weight="700" fill="#0b0e13">${+px.toPrecision(5)}</text>`);
    out.push(`<text x="${L.l + 4}" y="${L.t + 11}" font-size="10" fill="${FLOW_COLORS.s10}">SMA 10</text><text x="${L.l + 50}" y="${L.t + 11}" font-size="10" fill="${FLOW_COLORS.s30}">SMA 30</text><text x="${L.l + 96}" y="${L.t + 11}" font-size="10" fill="${FLOW_COLORS.text}">tydzień</text>`);
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" style="display:block">${out.join("")}</svg>`;
}

const pctTxt = v => (Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")} %` : "—");
const pctCls = v => (Number.isFinite(v) ? (v > 0 ? "positive" : v < 0 ? "negative" : "") : "muted");

// Wiersze tabelki kafelka (para etykieta / wartość, z klasą koloru) — jak tabelka TA w Finvizie.
function flowStatRows(c, weeks, bench) {
    const p = flowPerf(c, weeks), t = trend1030(c), mrs = bench ? mansfieldRS(c, bench) : null;
    const rows = [["Tydzień", pctTxt(p.w), pctCls(p.w)], ["Miesiąc", pctTxt(p.m), pctCls(p.m)], ["Kwartał", pctTxt(p.q), pctCls(p.q)],
        ["Pół roku", pctTxt(p.h), pctCls(p.h)], ["Od początku roku", pctTxt(p.ytd), pctCls(p.ytd)], ["Rok", pctTxt(p.y), pctCls(p.y)],
        ["vs SMA 10 tyg.", pctTxt(t.pct10), pctCls(t.pct10)], ["vs SMA 30 tyg.", pctTxt(t.pct30), pctCls(t.pct30)],
        ["SMA 30 (4 tyg.)", Number.isFinite(t.slope) ? (t.slope >= 0 ? "↗ " : "↘ ") + pctTxt(t.slope) : "—", pctCls(t.slope)], ["Od szczytu 52 tyg.", pctTxt(p.hi52), pctCls(p.hi52)]];
    if (bench) rows.push(["Mansfield RS", Number.isFinite(mrs) ? (mrs > 0 ? "+" : "") + mrs.toFixed(1).replace(".", ",") : "—", pctCls(mrs)]);
    return { rows, trend: t, mrs };
}
function flowStatsHtml(rows) {
    return `<div class="ta-stats">${rows.map(([k, v, cls]) => `<span class="ta-k">${escapeHtml(k)}</span><span class="ta-v ${cls || ""}">${v}</span>`).join("")}</div>`;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { flowSma, trend1030, mansfieldRS, flowPerf, flowBreakout, flowSortStocks, chart1030Svg, flowStatRows, flowStatsHtml, TREND_LABELS, FLOW_COLORS };
}
