// Linie trendu i alerty (port desktop/lines.py z Momentum Desktop). Linia = dwa punkty {d1, p1, d2, p2} (data tygodnia + cena), prosta na skali
// logarytmicznej, przedłużona w prawo do ostatniego tygodnia. Alert linii: zamknięcie tygodnia przecięło linię. Obserwowana spółka (🔔): sygnał GLB,
// przecięcie MACD w dół, zamknięcie pod stopem MACD, zamknięcie pod Green Line, spełnione warunki; pozycja (📌): spadek 20 % od szczytu = sprzedaj połowę.
// Czyste funkcje — testy w tests/js/lines.test.js.
"use strict";

const SIGNAL_STATES = ["WYBICIE", "SYGNAŁ"];   // kupno: zamknięcie tygodnia 0–10 % nad Green Line
const MAX_LOG = 200;
const STOP_PCT = 10;    // stop początkowy pod ceną kupna
const HALF_DROP = 20;   // spadek od szczytu (zamknięcia tygodnia od wejścia), przy którym można sprzedać połowę (wynik bez zmian, opcja)
const MAX_POSITIONS = 10;   // portfel: 10 pozycji po równo; wolne miejsca = gotówka w SPY do nowego sygnału

// indeks tygodnia daty: dokładny albo ostatni wcześniejszy; -1, gdy data przed historią
function dateIndex(dates, d) {
    let lo = 0, hi = dates.length - 1, out = -1;
    while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (dates[m] <= d) { out = m; lo = m + 1; } else hi = m - 1;
    }
    return out;
}

// wartość linii w tygodniu j (interpolacja na log ceny); null, gdy punkty nie leżą w historii albo w tym samym tygodniu
function lineAt(line, dates, j) {
    const a = dateIndex(dates, line.d1), b = dateIndex(dates, line.d2);
    if (a < 0 || b < 0 || a === b) return null;
    const la = Math.log(line.p1), lb = Math.log(line.p2);
    return Math.exp(la + (lb - la) * (j - a) / (b - a));
}

// przecięcie zamknięciem w ostatnim tygodniu: "up" / "down" / null (tylko po pierwszym punkcie linii)
function lineCross(line, data) {
    const c = data.c, j = c.length - 1;
    if (j < 1 || c[j] == null || c[j - 1] == null) return null;
    if (j - 1 < Math.min(dateIndex(data.d, line.d1), dateIndex(data.d, line.d2))) return null;
    const v0 = lineAt(line, data.d, j - 1), v1 = lineAt(line, data.d, j);
    if (v0 == null || v1 == null) return null;
    if (c[j - 1] < v0 && c[j] >= v1) return "up";
    if (c[j - 1] >= v0 && c[j] < v1) return "down";
    return null;
}

// odległość punktu od odcinka (px)
function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)) : 0;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// segs = [{id, x1, y1, x2, y2, xe, ye}] (xe/ye = koniec przedłużenia) -> {id, part: "p1" | "p2" | "body"} albo null
function hitLine(segs, x, y, tol) {
    let best = null;
    for (const s of segs) {
        for (const part of ["p1", "p2"]) {
            const d = Math.hypot(x - s["x" + part[1]], y - s["y" + part[1]]);
            if (d <= tol * 1.4 && (!best || d < best.d)) best = { id: s.id, part, d: d - tol };   // uchwyt końca ma pierwszeństwo
        }
        const d = Math.min(segDist(x, y, s.x1, s.y1, s.x2, s.y2), segDist(x, y, s.x2, s.y2, s.xe, s.ye));
        if (d <= tol && (!best || d < best.d)) best = { id: s.id, part: "body", d };
    }
    return best && { id: best.id, part: best.part };
}

// magnes: cena przyciągana do High / Low tygodnia, gdy kursor jest bliżej niż tol px
function snapPrice(price, hi, lo, yf, y, tol) {
    let best = price, bd = tol;
    for (const v of [hi, lo]) {
        if (v == null) continue;
        const d = Math.abs(yf(v) - y);
        if (d <= bd) { best = v; bd = d; }
    }
    return best;
}

// magnes poziomy: cena przyciągana do ceny drugiego końca linii, gdy kursor jest bliżej niż tol px od jej poziomu (-> linia dokładnie pozioma)
function snapHorizontal(price, other, yf, y, tol) {
    return other != null && Math.abs(yf(other) - y) <= tol ? other : price;
}

// zmiany stanu obserwowanej spółki (prev = stan z poprzedniego sprawdzenia) -> lista komunikatów
function stateAlerts(prev, row) {
    const out = [];
    if (!prev || !row) return out;
    if (row.glb_state && SIGNAL_STATES.includes(row.glb_state) && !(row.glb_pct > 10) && !SIGNAL_STATES.includes(prev.glb_state))
        out.push(`sygnał GLB: ${row.glb_state} (Green Line ${row.glb})`);
    if (prev.macd === "nad" && row.macd === "pod") out.push(`MACD tyg. przeciął sygnał w dół — stop pod Low ${row.macd_stop}`);
    if (row.macd_stop && row.price != null && row.price < row.macd_stop && !(prev.price != null && prev.macd_stop && prev.price < prev.macd_stop))
        out.push(`zamknięcie ${row.price} pod stopem MACD ${row.macd_stop}`);
    if (row.glb_state === "POD" && prev.glb_state && prev.glb_state !== "POD" && prev.glb_state !== "BRAK")
        out.push(`zamknięcie tygodnia pod Green Line ${row.glb} — wyjście (metoda GLB)`);
    if (row.ok && !prev.ok) out.push("spełnia warunki strategii");
    if (row.slow && row.slow !== prev.slow) out.push(row.slow === "HAMUJE+MB" ? `⚠ hamowanie: tempo przychodów ${row.accel != null ? row.accel.toFixed(0) : ""} pp i marża brutto spada r/r — zacieśnij stop`
        : `⚠ hamowanie: tempo przychodów ${row.accel != null ? row.accel.toFixed(0) : ""} pp względem kwartału wcześniej`);
    return out;
}

function emaSeries(values, n) {
    const k = 2 / (n + 1), out = [];
    let prev = null;
    for (const v of values) { prev = prev == null ? v : prev + k * (v - prev); out.push(prev); }
    return out;
}

// stop MACD pozycji: Low ostatniego tygodnia, w którym MACD (12, 26, 9) przeciął sygnał w dół PO tygodniu wejścia; null = jeszcze nie było
// (badanie 2011–2025: przecięcia sprzed wejścia obniżały wynik z ≈ 21 % do ≈ 13 % rocznie)
function macdStopSince(data, since) {
    const c = (data && data.c) || [], l = (data && data.l) || [], d = (data && data.d) || [];
    if (c.length < 35 || !l.length) return null;
    const f = emaSeries(c, 12), sl = emaSeries(c, 26), m = f.map((x, i) => x - sl[i]), sg = emaSeries(m, 9), h = m.map((x, i) => x - sg[i]);
    const from = dateIndex(d, since || "");
    let out = null;
    for (let i = Math.max(1, from + 1); i < c.length; i++) if (h[i] < 0 && h[i - 1] >= 0 && l[i] != null) out = l[i];
    return out;
}

// plan wyjścia pozycji: pos = {since, price}, data = tygodniowe {d, c, l}, row = wiersz (glb) ->
// {entry, stopInit (−10 %), macdStop (MACD od wejścia), peak (najwyższe zamknięcie tygodnia od wejścia), halfAt (−20 % od szczytu), half, last, glbExit}
function positionPlan(pos, data, row) {
    const c = (data && data.c) || [], d = (data && data.d) || [], entry = pos && pos.price != null ? pos.price : null;
    let peak = entry;
    for (let i = 0; i < c.length; i++) if (c[i] != null && d[i] >= ((pos && pos.since) || "") && (peak == null || c[i] > peak)) peak = c[i];
    const last = c.length ? c[c.length - 1] : null, halfAt = peak != null ? peak * (1 - HALF_DROP / 100) : null;
    return { entry, stopInit: entry != null ? entry * (1 - STOP_PCT / 100) : null, macdStop: macdStopSince(data, pos && pos.since), peak, halfAt, last,
        half: last != null && halfAt != null && last <= halfAt, glbExit: !!(last != null && row && row.glb && last < row.glb) };
}

// co zrobić z pozycją teraz -> lista komunikatów (pusta = trzymaj): stop −10 %, ½ przy −20 % od szczytu, wyjście wg metody, hamowanie — jak lines.position_status
function positionStatus(pl, row, exit) {
    const out = [], r = row || {}, p = pl || {}, last = p.last;
    if (last != null && p.stopInit != null && last <= p.stopInit) out.push("STOP −10 %");
    if (exit === "GLB" && p.glbExit) out.push("WYJŚCIE: zamknięcie pod GLB");
    const ms = p.macdStop !== undefined ? p.macdStop : r.macd_stop;   // plan pozycji: MACD od wejścia
    if (exit !== "GLB" && ms && last != null && last < ms) out.push("WYJŚCIE: pod stopem MACD");
    if (p.half) out.push("SPRZEDAJ ½ (−20 % od szczytu)");
    for (const p of r.patterns || []) if (p.side === "sell") out.push(`⚠ ${p.name}: ${p.state === "ZŁAMANA" ? "złamana linia — sprzedaż" : `uwaga na linię ${p.buy.toFixed(2)}`}`);   // wzorce niedźwiedzie
    if (r.parabola) out.push(r.parabola.state === "ZŁAMANA" ? "⚠ PARABOLA: złamana najbardziej stroma linia — sprzedaż" : "⚠ PARABOLA: wyjście przy zamknięciu tygodnia pod najbardziej stromą linią");
    if (r.slow) out.push("⚠ hamuje" + (r.slow === "HAMUJE+MB" ? " + marża brutto" : ""));
    return out;
}

const snapshot = (r) => ({ glb_state: r.glb_state, macd: r.macd, macd_stop: r.macd_stop, price: r.price, ok: !!r.ok, slow: r.slow || null });

// st = {lines: {ticker: [linia]}, watch: {ticker: stan}, log: [...]}; rowFor(t) -> wiersz, seriesFor(t) -> świece (albo null), asOf = ostatni tydzień danych
// -> nowe wpisy (st.log i st.watch są aktualizowane); klucz z tygodniem, więc ten sam alert nie wraca przy następnym wczytaniu
function evalAlerts(st, rowFor, seriesFor, now, asOf) {
    const seen = new Set(st.log.map((a) => a.key)), fresh = [];
    const add = (key, t, week, msg) => {
        if (seen.has(key)) return;
        seen.add(key);
        fresh.push({ key, t, week, msg, at: now });
    };
    for (const [t, lines] of Object.entries(st.lines || {})) {
        const data = seriesFor(t);
        if (!data || !data.c || data.c.length < 2) continue;
        const week = data.d[data.d.length - 1];
        for (const ln of lines) {
            if (ln.alert === false) continue;
            const x = lineCross(ln, data);
            if (x) {
                const v = lineAt(ln, data.d, data.c.length - 1);
                add(`L:${t}:${ln.id}:${week}:${x}`, t, week, `zamknięcie ${x === "up" ? "nad linią" : "pod linią"} trendu (${v.toFixed(2)})`);
            }
        }
    }
    for (const [t, p] of Object.entries(st.pos || {})) {   // pozycja: spadek 20 % od szczytu -> sprzedaj połowę (raz na szczyt)
        const data = seriesFor(t);
        if (!data || !data.c || !data.c.length) continue;
        const pl = positionPlan(p, data, rowFor(t)), week = data.d[data.d.length - 1];
        if (pl.half) add(`H:${t}:${pl.peak}`, t, week, `spadek ${HALF_DROP} % od szczytu ${pl.peak.toFixed(2)} (zamknięcie ${pl.last.toFixed(2)}) — sprzedaj połowę`);
    }
    for (const t of Object.keys(st.watch || {})) {
        const row = rowFor(t);
        if (!row) continue;
        const week = asOf || "";
        for (const msg of stateAlerts(st.watch[t], row)) add(`W:${t}:${msg}:${week}`, t, week, msg);
        st.watch[t] = snapshot(row);
    }
    st.log = fresh.slice().reverse().concat(st.log).slice(0, MAX_LOG);
    return fresh;
}

if (typeof module !== "undefined") module.exports = { dateIndex, lineAt, lineCross, segDist, hitLine, snapPrice, snapHorizontal, stateAlerts, snapshot, evalAlerts, positionPlan, positionStatus, macdStopSince, HALF_DROP, STOP_PCT, MAX_POSITIONS };
