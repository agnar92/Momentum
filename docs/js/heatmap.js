// ============================================================
// MAPA CIEPLNA SPÓŁKI (styl Finviz Map): spółka = „indeks”, podkategorie wg TYPU parametru (wzrost, rentowność, wycena, analitycy, własność, momentum, trend, płynność, ostrzeżenia, rynek) = „sektory”,
// pojedyncze wskaźniki = kafelki. Wielkość kafelka = waga wskaźnika (litery CANSLIM ważą więcej), kolor = „ciepło” (czerwony zły … zielony dobry, szary brak danych).
// Progi to heurystyki (O'Neil / CANSLIM), nie porada. Czyste funkcje (heatMetrics, squarify, heatmapHtml) są testowane w tests/js/heatmap.test.js.
// ============================================================

if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
}

const HEAT_HEADER_UNITS = 4.2;   // wysokość nagłówka podkategorii w jednostkach kontenera (szerokość = 100)

const heatTh = (bad, mid, good) => v => (v == null ? null : v <= bad ? -1 : v >= good ? 1 : v >= mid ? 0.4 : -0.4);
const heatRange = (lo, hi) => v => (v == null ? null : Math.max(-1, Math.min(1, (v - (lo + hi) / 2) / ((hi - lo) / 2))));
const heatPct = v => (v == null ? "–" : Math.abs(v) >= 1000 ? Math.round(v) + "%" : v.toFixed(Math.abs(v) < 10 ? 1 : 0) + "%");
const heatNum = d => v => (v == null ? "–" : Number(v).toFixed(d));
const heatTx = v => (v == null ? "–" : String(v));
const heatYn = k => s => (s[k] == null ? null : s[k] ? "tak" : "nie");

// Wzrost EPS rok do roku: lata obrotowe (eps_fy*), a bez nich suma 4 kwartałów (eps_yr*) — jak annualEpsGrowth w watchlist.js.
const heatAnnual = s => ([s.eps_fy0, s.eps_fy1, s.eps_fy2].some(Number.isFinite) ? [s.eps_fy0, s.eps_fy1, s.eps_fy2] : [s.eps_yr0, s.eps_yr1, s.eps_yr2]);

const heatUsd = v => (v == null ? "–" : v >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "B" : "$" + Math.round(v / 1e6) + "M");
const heatLow = (good, ok, bad) => v => (v == null ? null : v <= 0 ? -0.6 : v <= good ? 1 : v <= ok ? 0.3 : v <= bad ? -0.3 : -1);   // im mniej tym lepiej (wycena)

// Podkategorie wg TYPU parametru (nie wg liter CANSLIM): [etykieta, pobranie wartości (pole lub funkcja), format, ocena −1…+1, waga]
const HEAT_GROUPS = [
    ["Wzrost zysków", [
        ["EPS kw. r/r", "eps_q0_yoy", heatPct, heatTh(0, 20, 25), 3], ["EPS poprz. kw.", "eps_q1_yoy", heatPct, heatTh(0, 20, 25), 2],
        ["Przyspieszenie", heatYn("eps_accel"), heatTx, v => (v == null ? null : v === "tak" ? 1 : -0.6), 1.5],
        ["EPS TTM r/r", s => heatAnnual(s)[0], heatPct, heatTh(0, 25, 25), 2.5], ["EPS rok −1", s => heatAnnual(s)[1], heatPct, heatTh(0, 25, 25), 2],
        ["EPS rok −2", s => heatAnnual(s)[2], heatPct, heatTh(0, 25, 25), 2], ["EPS 5 lat", "eps_past_5y", heatPct, heatTh(0, 15, 25), 1.5],
        ["Stabilność EPS", "eps_stability", heatPct, heatTh(40, 60, 75), 1]]],
    ["Wzrost sprzedaży", [
        ["Sprzedaż kw. r/r", "sales_qq", heatPct, heatTh(0, 20, 25), 3], ["Sprzedaż 5 lat", "sales_past_5y", heatPct, heatTh(0, 10, 20), 1.5]]],
    ["Rentowność i kondycja", [
        ["ROE", "roe", heatPct, heatTh(0, 17, 17), 3], ["Marża przed opod.", "pretax_margin", heatPct, heatTh(0, 10, 20), 2],
        ["Zmiana marży", "pretax_margin_chg", heatPct, v => (v == null ? null : v > 0 ? 1 : -0.7), 1], ["Dług / kapitał", "debt_eq", heatNum(2), v => (v == null ? null : v <= 0.5 ? 1 : v <= 1 ? 0.3 : -0.8), 2]]],
    ["Wycena", [
        ["P/E", "pe", heatNum(1), heatLow(25, 45, 80), 2], ["Forward P/E", "forward_pe", heatNum(1), heatLow(20, 35, 60), 2],
        ["Wzrost EPS za rok", "eps_next_y", heatPct, heatTh(0, 15, 25), 1.5]]],
    ["Analitycy", [
        ["Rekomendacja", "recom", heatNum(1), v => (v == null ? null : v <= 1.8 ? 1 : v <= 2.4 ? 0.5 : v <= 3 ? -0.2 : -1), 2], ["Upside do celu", "pt_upside_pct", heatPct, heatRange(-10, 40), 2.5],
        ["Rewizje EPS 30d", "eps_rev30_pct", heatPct, v => (v == null ? null : v > 0 ? 1 : v < 0 ? -0.8 : 0), 2], ["Rewizje EPS 90d", "eps_rev90_pct", heatPct, v => (v == null ? null : v > 0 ? 1 : v < 0 ? -0.8 : 0), 1.5],
        ["Rewizje w górę", s => (Number.isFinite(s.rev_up30) && Number.isFinite(s.rev_down30) ? s.rev_up30 - s.rev_down30 : null), heatTx, v => (v == null ? null : v > 0 ? 1 : v < 0 ? -0.8 : 0), 1]]],
    ["Własność i popyt", [
        ["Instytucje", "inst_own", heatPct, v => (v == null ? null : v < 20 || v > 90 ? -0.7 : 1), 2], ["Zmiana inst.", "inst_trans", heatPct, v => (v == null ? null : v > 0 ? 1 : -0.7), 1.5],
        ["Insiderzy", "insider_own", heatPct, v => (v == null ? null : v >= 5 ? 1 : v >= 1 ? 0.3 : -0.1), 1], ["Liczba akcji", "shares_chg_pct", heatPct, v => (v == null ? null : v <= -5 ? 1 : v <= 1 ? 0.2 : -0.8), 1.5],
        ["Acc/Dis", "accdis", heatTx, v => ({ A: 1, B: 0.6, C: 0, D: -0.5, E: -1 })[v] ?? null, 2.5], ["Wolumen 5d", "vol_surge_5d", heatNum(1), heatTh(0.7, 1, 1.5), 1.5]]],
    ["Momentum", [
        ["Zwrot 3m", "ret_3m_pct", heatPct, heatRange(-20, 40), 2], ["Zwrot 6m", "ret_6m_pct", heatPct, heatRange(-20, 70), 2], ["Zwrot 12m", "ret_12m_pct", heatPct, heatRange(-20, 100), 2],
        ["RS Rating", "rs_rating", heatNum(0), heatTh(40, 60, 80), 3], ["Linia RS", s => s.rs_line_state || null, heatTx, v => (v == null ? null : 1), 1]]],
    ["Trend techniczny", [
        ["Od szczytu 52t", "pct_from_high_52w", heatPct, heatTh(-30, -15, -15), 3], ["vs SMA50", "pct_above_sma50", heatPct, v => (v == null ? null : v < 0 ? -1 : v > 25 ? -0.2 : 1), 1.5],
        ["vs SMA200", "pct_above_sma200", heatPct, v => (v == null ? null : v < 0 ? -1 : v > 60 ? -0.1 : 0.8), 1.5], ["vs 10 tyg.", "pct_above_sma10w", heatPct, v => (v == null ? null : v < 0 ? -1 : v > 20 ? -0.3 : 1), 1.5],
        ["vs 40 tyg.", "pct_above_sma40w", heatPct, v => (v == null ? null : v < 0 ? -1 : v > 60 ? -0.1 : 0.8), 1.5]]],
    ["Oceny względne", [
        ["EPS Rating", "eps_rating", heatNum(0), heatTh(40, 60, 80), 2.5], ["Composite", "composite_rating", heatNum(0), heatTh(40, 60, 80), 2.5],
        ["Grupa branżowa", "industry_rating", heatNum(0), heatTh(40, 60, 60), 2], ["Lider", s => (s.leader == null ? null : s.leader ? "★" : "nie"), heatTx, v => (v == null ? null : v === "★" ? 1 : -0.2), 1]]],
    ["Płynność i zmienność", [
        ["Obrót dzienny", "dollar_volume_avg", heatUsd, v => (v == null ? null : v >= 5e7 ? 1 : v >= 2e7 ? 0.5 : v >= 5e6 ? -0.2 : -0.8), 2],
        ["Kapitalizacja", "market_cap", heatUsd, v => (v == null ? null : v >= 2e9 ? 0.6 : v >= 3e8 ? 0.1 : -0.7), 1.5],
        ["Akcje w obrocie", "shs_float", heatNum(0), v => (v == null ? null : 0.2), 0.8], ["ADR", "adr_pct", heatPct, v => (v == null ? null : v > 12 ? -0.5 : v >= 3 ? 0.6 : -0.1), 1.5]]],
    ["Ostrzeżenia", [
        ["Climax top", s => (s.climax_top == null ? null : s.climax_top ? "TAK" : "nie"), heatTx, v => (v == null ? null : v === "TAK" ? -1 : 0.8), 2],
        ["Dystrybucja", s => (s.dist_top == null ? null : s.dist_top ? "TAK" : "nie"), heatTx, v => (v == null ? null : v === "TAK" ? -1 : 0.8), 2]]],
    ["Rynek", [
        ["Reżim", (s, m) => (m && m.regime) || null, heatTx, v => (v == null ? null : v === "uptrend" ? 1 : -1), 3],
        ["Dni dystr.", (s, m) => (m && Number.isFinite(m.distDays) ? m.distDays : null), heatTx, v => (v == null ? null : v < 5 ? 0.8 : -0.8), 2]]],
];

// Dane do mapy: [{title, score, weight, items: [{label, txt, score, w}]}]. Wskaźnik bez danych zostaje jako szary kafelek o połowie wagi.
function heatMetrics(s, mkt) {
    return HEAT_GROUPS.map(([title, defs]) => {
        const items = defs.map(([label, get, fmt, rate, w]) => {
            const v = typeof get === "function" ? get(s, mkt) : (s[get] == null || s[get] === "" ? null : s[get]);
            const val = v === undefined ? null : v;
            return { label, txt: fmt(val), score: val == null ? null : rate(val), w: val == null ? w * 0.5 : w };
        });
        const known = items.filter(i => i.score != null);
        const wsum = known.reduce((a, i) => a + i.w, 0);
        const score = wsum ? known.reduce((a, i) => a + i.score * i.w, 0) / wsum : null;
        return { title, score, weight: items.reduce((a, i) => a + i.w, 0), items };
    });
}

// Układ „squarified treemap” (Bruls): elementy {w, ...} → te same obiekty z x, y, dw, dh w prostokącie (x, y, W, H); powierzchnia ∝ w.
function squarify(items, x, y, W, H) {
    const list = items.filter(i => i.w > 0).slice().sort((a, b) => b.w - a.w);
    const total = list.reduce((a, i) => a + i.w, 0);
    const out = [];
    if (!total || W <= 0 || H <= 0) return out;
    const scale = (W * H) / total;
    let rest = list.map(i => ({ it: i, area: i.w * scale }));
    let rx = x, ry = y, rw = W, rh = H;
    const worst = (row, side) => {
        const s = row.reduce((a, r) => a + r.area, 0);
        let mx = 0, mn = Infinity;
        for (const r of row) { mx = Math.max(mx, r.area); mn = Math.min(mn, r.area); }
        return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    };
    while (rest.length) {
        const side = Math.min(rw, rh);
        const row = [rest[0]];
        let k = 1;
        while (k < rest.length && worst(row.concat(rest[k]), side) <= worst(row, side)) { row.push(rest[k]); k++; }
        rest = rest.slice(k);
        const s = row.reduce((a, r) => a + r.area, 0);
        if (rw >= rh) {                       // wiersz jako kolumna po lewej
            const cw = s / rh; let cy = ry;
            for (const r of row) { const h = r.area / cw; out.push(Object.assign({}, r.it, { x: rx, y: cy, dw: cw, dh: h })); cy += h; }
            rx += cw; rw -= cw;
        } else {                              // wiersz jako pas u góry
            const ch = s / rw; let cx = rx;
            for (const r of row) { const w = r.area / ch; out.push(Object.assign({}, r.it, { x: cx, y: ry, dw: w, dh: ch })); cx += w; }
            ry += ch; rh -= ch;
        }
    }
    return out;
}

const HEAT_COLORS = ["#b3342a", "#8f4a3f", "#4b5260", "#3f7a4f", "#1f9d55"];   // czerwony … szary … zielony (jak Finviz: bliskie zera = ciemnoszare)
function heatColor(score) {
    if (score == null) return "#3a3f49";
    const t = Math.max(-1, Math.min(1, score));
    const stops = [[-1, [200, 48, 40]], [-0.35, [150, 70, 62]], [0, [75, 82, 96]], [0.35, [63, 130, 82]], [1, [28, 170, 90]]];
    for (let i = 1; i < stops.length; i++) {
        if (t <= stops[i][0]) {
            const [a, ca] = stops[i - 1], [b, cb] = stops[i], f = (t - a) / (b - a);
            return "rgb(" + ca.map((c, j) => Math.round(c + (cb[j] - c) * f)).join(",") + ")";
        }
    }
    return HEAT_COLORS[4];
}

// HTML mapy: kontener o stałej proporcji, grupy i kafelki pozycjonowane procentowo (bez JS po stronie przeglądarki, działa w arkuszu).
function heatmapHtml(s, mkt, aspect = 1.45, px = 360) {
    const groups = heatMetrics(s, mkt);
    const H = 100 * aspect;
    const fmtScore = v => (v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(1));
    const gl = squarify(groups.map(g => Object.assign({}, g, { w: g.weight })), 0, 0, 100, H);
    const pctX = v => (v / 100 * 100).toFixed(3) + "%", pctY = v => (v / H * 100).toFixed(3) + "%";
    const all = groups.filter(g => g.score != null);
    const wsum = all.reduce((a, g) => a + g.weight, 0);
    const total = wsum ? all.reduce((a, g) => a + g.score * g.weight, 0) / wsum : null;
    const html = gl.map(g => {
        const hh = Math.min(HEAT_HEADER_UNITS, g.dh * 0.4);
        const tiles = squarify(g.items, 0, 0, g.dw, Math.max(0.1, g.dh - hh));
        const inner = tiles.map(t => {
            const wpx = t.dw * px / 100, hpx = (t.dh) * px / 100;
            const big = wpx >= 74 && hpx >= 46, mid = wpx >= 44 && hpx >= 30;
            return `<div class="hm-t${big ? " hm-big" : mid ? " hm-mid" : " hm-sm"}" style="left:${(t.x / g.dw * 100).toFixed(3)}%;top:${(t.y / Math.max(0.1, g.dh - hh) * 100).toFixed(3)}%;width:${(t.dw / g.dw * 100).toFixed(3)}%;height:${(t.dh / Math.max(0.1, g.dh - hh) * 100).toFixed(3)}%;background:${heatColor(t.score)}" title="${escapeHtml(t.label)}: ${escapeHtml(t.txt)}">${wpx >= 30 && hpx >= 18 ? `<span class="hm-l">${escapeHtml(t.label)}</span>` : ""}<b>${escapeHtml(t.txt)}</b></div>`;
        }).join("");
        return `<div class="hm-g" style="left:${pctX(g.x)};top:${pctY(g.y)};width:${pctX(g.dw)};height:${pctY(g.dh)}"><div class="hm-h" style="height:${(hh / g.dh * 100).toFixed(2)}%"><span>${escapeHtml(g.title)}</span><i style="color:${heatColor(g.score)}">${fmtScore(g.score)}</i></div><div class="hm-b" style="top:${(hh / g.dh * 100).toFixed(2)}%">${inner}</div></div>`;
    }).join("");
    return `<div class="hm-wrap"><div class="hm-total">Ogólnie <b style="color:${heatColor(total)}">${fmtScore(total)}</b> <span class="muted small">(−1 słabo … +1 mocno; kolor = ciepło, wielkość = waga)</span></div><div class="hm" style="padding-top:${(aspect * 100).toFixed(1)}%">${html}</div><div class="hm-leg"><i style="background:${heatColor(-1)}"></i><i style="background:${heatColor(-0.35)}"></i><i style="background:${heatColor(0)}"></i><i style="background:${heatColor(0.35)}"></i><i style="background:${heatColor(1)}"></i><span>zły → dobry · szary = brak danych</span></div></div>`;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { heatMetrics, squarify, heatColor, heatmapHtml, HEAT_GROUPS };
}
