// ============================================================
// WIDOK DAR-CARD (Nicolas Darvas, „How I Made $2,000,000 in the Stock Market”) — alternatywny widok wykresu tygodniowego NA CENACH ZAMKNIĘCIA.
// Zamiast świec: schodkowe „pudełka”. Pudełko = góra (zamknięcie, którego przez `confirm` kolejnych tygodni nie przebito) i dół (najniższe zamknięcie po górze,
// którego przez `confirm` tygodni nie złamano). Zamknięcie NAD górą = punkt kupna i nowe, wyższe pudełko (schodek); zamknięcie POD dołem = pudełko złamane (stop).
// Czyste funkcje (darvasBoxes) są testowane w tests/js/darvas.test.js, darvasSvg tylko składa SVG. Ładowany PO chart.js (używa jego skal).
// ============================================================

if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./chart.js"));
}

const DARVAS_CONFIRM = 3;            // tygodnie potwierdzenia góry i dołu pudełka (reguła Darvasa: 3 sesje; tu 3 tygodnie)
const DARVAS_MIN_HEIGHT_PCT = 1.5;   // pudełko niższe niż 1,5 % ceny to szum

// Pudełko z niepotwierdzonym dołkiem (cena wybiła górę szybciej niż po `confirm` tygodniach) ma confirmed=false i jest rysowane przerywaną ramką.
// Pudełka z zamknięć c (tablica, końcowe null = puste miejsce na osi): [{i0, i1, top, bottom, confirmed, outcome: "up" | "down" | "open"}], rosnąco po czasie.
function darvasBoxes(c, confirm = DARVAS_CONFIRM) {
    let n = c.length;
    while (n > 0 && !Number.isFinite(c[n - 1])) n--;
    const boxes = [];
    let i = 0;
    while (i < n) {
        // góra: zamknięcie będące najwyższym od początku szukania i nieprzebite przez `confirm` kolejnych zamknięć
        let top = null, t = -1, runMax = -Infinity;
        for (let k = i; k < n; k++) {
            if (!Number.isFinite(c[k]) || c[k] < runMax) continue;
            runMax = c[k];
            if (k + confirm < n && c.slice(k + 1, k + confirm + 1).every(v => v <= c[k])) { t = k; top = c[k]; break; }
        }
        if (t < 0) break;
        // dół: najniższe zamknięcie po górze; potwierdzony, gdy przez `confirm` tygodni go nie złamano
        let bottom = Infinity, bi = -1, confirmed = false, end = -1, outcome = "open", j = t + 1;
        for (; j < n; j++) {
            if (c[j] > top) { outcome = "up"; end = j; break; }   // przebicie góry: pudełko z niepotwierdzonym dołkiem (confirmed false) też jest schodkiem — w silnym trendzie to jedyne przerwy
            if (confirmed && c[j] < bottom) { outcome = "down"; end = j; break; }
            if (!confirmed && c[j] < bottom) { bottom = c[j]; bi = j; }
            if (!confirmed && bi >= 0 && j - bi >= confirm) confirmed = true;
        }
        if (end < 0) end = n - 1;
        if (Number.isFinite(bottom) && (top - bottom) / top * 100 >= DARVAS_MIN_HEIGHT_PCT) boxes.push({ i0: t, i1: end, top, bottom, confirmed, outcome });
        i = outcome === "open" ? n : end;
    }
    return boxes;
}

const DARVAS_STOP_PCT = 8;   // stop loss: −8 % od ceny wejścia (góry boxa)

// Ceny boxa: wejście = góra (kup po zamknięciu tygodnia nad nią), anulowanie = dolna krawędź (zamknięcie pod nią kończy box), stop loss = −stopPct % od wejścia.
function darvasBoxInfo(top, bottom, stopPct = DARVAS_STOP_PCT) {
    const r2 = v => Math.round(v * 100) / 100;
    const stop = r2(top * (1 - stopPct / 100));
    return { entry: r2(top), cancel: r2(bottom), stop, stopPct, depthPct: r2((top - bottom) / top * 100), stopAboveCancel: stop > bottom };
}

// Treść arkusza po kliknięciu boxa (HTML); state: "up" | "down" | "open" | undefined (box z wykresu świecowego)
function darvasBoxSheetHtml(info, state, confirmed) {
    const st = state === "up" ? "wybity w górę (był sygnał kupna)" : state === "down" ? "złamany w dół (anulowany)" : state === "open" ? "otwarty — czeka na wybicie" : "otwarty (baza flat)";
    return `<div class="darvas-sheet"><p class="muted small">Box ${info.cancel.toFixed(2)}–${info.entry.toFixed(2)} · głębokość ${info.depthPct}% · ${st}${confirmed === false ? " · dół jeszcze niepotwierdzony" : ""}</p>`
        + `<table class="sheet-table" style="width:100%;text-align:left"><tr><th>💚 Cena wejścia</th><td><b>${info.entry.toFixed(2)}</b><br><span class="muted small">kup, gdy tydzień zamknie się NAD górą boxa</span></td></tr>`
        + `<tr><th>⛔ Anulowanie boxa</th><td><b>${info.cancel.toFixed(2)}</b><br><span class="muted small">dolna krawędź — zamknięcie tygodnia pod nią kończy box</span></td></tr>`
        + `<tr><th>🛑 Stop loss</th><td><b>${info.stop.toFixed(2)}</b><br><span class="muted small">−${info.stopPct}% od ceny wejścia${info.stopAboveCancel ? " — stop jest wyżej niż dół boxa, więc zadziała, zanim box zostanie anulowany" : " — dół boxa jest wyżej niż stop, więc box anuluje się, zanim dojdzie do stopu"}</span></td></tr></table>`
        + `<p class="muted small">Reguły Darvasa na tygodniowych zamknięciach; heurystyka, nie rekomendacja.</p></div>`;
}

// Widok Dar-Card dla okna wykresu: full = pełny model z chart.js (c, weeks, n, pad), win = {n, end}; opts: fit {w, h}
function darvasSvg(full, win, opts = {}) {
    const W = opts.fit ? opts.fit.w : 1000, H = opts.fit ? opts.fit.h : 710, compact = !!opts.compact;
    const fs = v => Math.round(v * (compact ? 1.25 : 1) * 10) / 10;
    const L = { left: 8, right: compact ? 46 : 60, top: 14, bottom: 26 };
    const pw = W - L.left - L.right, ph = H - L.top - L.bottom;
    const lastReal = full.c.reduce((a, v, i) => (Number.isFinite(v) ? i : a), -1);
    const start = Math.max(0, Math.min(win.end - win.n, lastReal)), endExcl = Math.max(start + 2, win.end);
    const slots = endExcl - start;
    const x = i => L.left + pw * (i - start + 0.5) / slots;
    const boxes = darvasBoxes(full.c).filter(b => b.i1 >= start && b.i0 < endExcl);
    const shown = [];
    for (let i = start; i < Math.min(endExcl, lastReal + 1); i++) if (Number.isFinite(full.c[i])) shown.push(full.c[i]);
    if (shown.length < 2) return `<svg viewBox="0 0 ${W} ${H}" width="100%"><text x="20" y="30" fill="#8a8f9c" font-size="14">Za mało danych na pudełka Darvasa.</text></svg>`;
    const lo0 = Math.min(...shown, ...boxes.map(b => b.bottom)), hi0 = Math.max(...shown, ...boxes.map(b => b.top)), pad = (hi0 - lo0) * 0.06 || 1;
    const lo = lo0 - pad, hi = hi0 + pad;
    const y = v => L.top + ph * (1 - (v - lo) / (hi - lo));
    const out = [];
    out.push(`<defs><pattern id="darvasHatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#3a3f4d"/><line x1="0" y1="0" x2="0" y2="4" stroke="#8a8f9c" stroke-width="1.4"/></pattern></defs>`);
    // „papier w linie” jak na Dar-Card: poziome linie co tyle, ile wynosi ~1/80 zakresu; grubsze na okrągłych poziomach
    const ticks = niceTicks(lo, hi, compact ? 6 : 8);
    const step = (hi - lo) / 80;
    for (let v = Math.ceil(lo / step) * step; v < hi; v += step) out.push(`<line x1="${L.left}" x2="${W - L.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#1d212b" stroke-width="1"/>`);
    ticks.forEach(t => {
        out.push(`<line x1="${L.left}" x2="${W - L.right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#2c3140" stroke-width="1.2"/>`);
        out.push(`<text x="${W - L.right + 6}" y="${(y(t) + 4).toFixed(1)}" font-size="${fs(11)}" fill="#8a8f9c">${t}</text>`);
    });
    // osie czasu: etykiety kwartałów
    let lastKey = "";
    for (let i = start; i < Math.min(endExcl, lastReal + 1); i++) {
        const d = full.weeks && full.weeks[i];
        if (!d) continue;
        const key = d.slice(0, 7);
        if (key === lastKey) continue;
        lastKey = key;
        const mon = +d.slice(5, 7);
        if ([1, 4, 7, 10].includes(mon)) out.push(`<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="${fs(11)}" fill="#8a8f9c" text-anchor="middle">${["", "sty", "", "", "kwi", "", "", "lip", "", "", "paź"][mon]} ${d.slice(2, 4)}</text>`);
    }
    const bw = Math.max(2, pw / slots * 0.5);
    boxes.forEach(b => {
        const x0 = x(Math.max(start, b.i0)) - bw / 2, x1 = x(Math.min(endExcl - 1, Math.max(b.i1, b.i0 + 1))) + bw / 2;
        const yT = y(b.top), yB = y(b.bottom), hatchH = Math.max(3, (yB - yT) * 0.07);
        const col = b.outcome === "up" ? "#e8eaed" : b.outcome === "down" ? "#ff8a8a" : "#f4f6fa";
        const state = b.outcome === "up" ? "wybite w górę" : b.outcome === "down" ? "złamane w dół" : "otwarte";
        // sam box, bez linii i podpisów: kliknięcie / dotknięcie pokazuje ceny wejścia, anulowania i stop lossa (data-box → arkusz w watchlist.js)
        out.push(`<rect class="box-hit" data-box="${b.top}|${b.bottom}|${b.outcome}|${b.confirmed ? 1 : 0}" style="cursor:pointer" x="${x0.toFixed(1)}" y="${yT.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(yB - yT).toFixed(1)}" fill="${col}" fill-opacity="0.92" stroke="#ffffff" stroke-width="1.4"${b.confirmed ? "" : ' stroke-dasharray="3 2"'}><title>Box ${b.bottom.toFixed(2)}–${b.top.toFixed(2)} (${state}) — kliknij po ceny</title></rect>`);
        out.push(`<rect x="${x0.toFixed(1)}" y="${(yB - hatchH).toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${hatchH.toFixed(1)}" fill="url(#darvasHatch)" pointer-events="none"/>`);
    });
    const lastC = full.c[lastReal];
    if (lastReal >= start && lastReal < endExcl) out.push(`<circle cx="${x(lastReal).toFixed(1)}" cy="${y(lastC).toFixed(1)}" r="${fs(3.5)}" fill="#6ea8ff" stroke="#0e0f13" stroke-width="1" pointer-events="none"><title>Ostatnie zamknięcie ${lastC}</title></circle>`);
    return `<svg id="chartSvg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Pudełka Darvasa ${escapeHtml(full.ticker || "")}">${out.join("")}</svg>`;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { darvasBoxes, darvasSvg, darvasBoxInfo, darvasBoxSheetHtml, DARVAS_CONFIRM, DARVAS_STOP_PCT };
}
