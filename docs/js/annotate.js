// ============================================================
// WŁASNE LINIE TRENDU, KOREKTA CUPÓW I ALERTY (index.html, okno wykresu).
// Adnotacje są zapisane w przeglądarce (localStorage) w DATACH i cenach, więc widać je na wykresie dziennym i tygodniowym.
// Po wejściu w tryb edycji automatycznie wykryte linie/cupy są kopiowane jako własne (z migawką tego, co wykrył algorytm —
// to materiał do nauki i strojenia detektora: eksport JSON w zakładce Alerty). Alert = linia z kierunkiem (nad/pod):
// zakładka 🔔 Alerty porównuje dzisiejszą wartość linii z ostatnim zamknięciem. Bez wysyłania powiadomień.
// Czysta logika (lineValueAt, alertState, autoToDates, alertRows, mergeImport) jest testowana w tests/js/annotate.test.js.
// ============================================================

if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./chart.js"));
}

const ANN_KEY = "momentum_watchlist_annotations";
const ANN_NEAR_PCT = 2;   // "blisko" = do 2% od linii
const ANN_KIND_LABELS = { res: "opór", sup: "wsparcie", free: "linia" };
const ANN_DIR_LABELS = { above: "nad linią", below: "pod linią" };
const ANN_COLORS = { res: "#ff9f43", sup: "#9fb3c8", free: "#c77dff", cup: "#ffffff" };

// ---------- czysta logika ----------

function annNewId() { return Math.random().toString(36).slice(2, 8); }

function annEmptyRecord() {
    return { lines: [], cups: [], hideAutoLines: false, hideAutoCups: false, auto: null, note: "", editedAt: null };
}

// Numer dnia handlowego (pn-pt = kolejne liczby, weekend leży ułamkowo między piątkiem a poniedziałkiem) — dzięki temu linia
// prosta na wykresie (oś = świece, bez weekendów) ma tę samą wartość co w alercie liczonym bez dostępu do szeregu świec.
function bizIndex(date) {
    const m = Math.floor(Date.parse(date + "T00:00:00Z") / 86400000) - 4;   // dni od poniedziałku 1970-01-05
    const w = Math.floor(m / 7), r = m - 7 * w;
    return w * 5 + (r <= 4 ? r : 4 + (r - 4) / 3);
}

// Wartość linii w danym dniu: prosta przez dwa punkty w osi dni handlowych; linia narysowana na skali logarytmicznej
// (line.log) jest prosta w logarytmie ceny (tak jak ją widać na wykresie).
function lineValueAt(line, date) {
    const t0 = bizIndex(line.x0), t1 = bizIndex(line.x1), t = bizIndex(date);
    if (!(t1 > t0)) return line.y0;
    const f = (t - t0) / (t1 - t0);
    if (line.log && line.y0 > 0 && line.y1 > 0) return Math.exp(Math.log(line.y0) + (Math.log(line.y1) - Math.log(line.y0)) * f);
    return line.y0 + (line.y1 - line.y0) * f;
}

// Stan alertu linii względem ceny z dnia asOf: triggered (cena po "złej" stronie linii), near (do ANN_NEAR_PCT% przed linią).
function alertState(line, price, asOf) {
    const value = lineValueAt(line, asOf);
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(price)) return null;
    const dist = (price / value - 1) * 100;                 // > 0: cena nad linią
    const dir = line.alert;
    const triggered = dir === "above" ? price > value : dir === "below" ? price < value : false;
    const near = !triggered && Math.abs(dist) <= ANN_NEAR_PCT;
    return { value, dist, triggered, near };
}

// Wykryte automatycznie linie/cupy z modelu wykresu (indeksy świec) -> daty (do skopiowania jako własne).
function autoToDates(full) {
    const at = i => full.weeks[Math.max(0, Math.min(full.weeks.length - 1, i))];
    return {
        lines: full.lines.map(l => ({ kind: l.kind, x0: at(l.i0), y0: l.y0, x1: at(l.i1), y1: l.y1 })),
        cups: full.cups.map(c => ({ start: at(c.i0), low_date: at(c.iLow), end: at(c.i1), peak: c.peak, low: c.low, right: c.right })),
    };
}

// Przejęcie wyników algorytmu: kopie jako własne + migawka (raz) + ukrycie wersji automatycznej.
function annAdoptAuto(rec, full) {
    const auto = autoToDates(full);
    if (!rec.hideAutoLines && auto.lines.length && !rec.lines.length) {
        rec.lines = auto.lines.map(l => ({ id: annNewId(), ...l, alert: null, fromAuto: true }));
        rec.hideAutoLines = true;
    }
    if (!rec.hideAutoCups && auto.cups.length && !rec.cups.length) {
        rec.cups = auto.cups.map(c => ({ id: annNewId(), ...c, fromAuto: true }));
        rec.hideAutoCups = true;
    }
    if (!rec.auto) {
        rec.auto = { tf: full.daily ? "d" : "w", lines: auto.lines, cups: auto.cups, pattern: full.trend ? full.trend.pattern : null, state: full.trend ? full.trend.state : null };
    }
    return rec;
}

// Wiersze zakładki Alerty: po jednym na linię z alertem (spółki spoza bieżącej listy pomijamy — brak ceny).
function alertRows(store, stocks) {
    const byTicker = new Map(stocks.map(s => [s.ticker, s]));
    const rows = [];
    Object.keys(store).forEach(ticker => {
        const stock = byTicker.get(ticker);
        if (!stock) return;
        (store[ticker].lines || []).forEach(line => {
            if (line.alert !== "above" && line.alert !== "below") return;
            const st = alertState(line, stock.price, stock.as_of);
            if (st) rows.push({ ...stock, alert: { ...line, ...st, ticker } });
        });
    });
    rows.forEach(r => { r.alert.rank = r.alert.triggered && !r.alert.ack ? 0 : r.alert.triggered ? 1 : r.alert.near ? 2 : 3; });
    return rows.sort((a, b) => a.alert.rank - b.alert.rank || Math.abs(a.alert.dist) - Math.abs(b.alert.dist));
}

// Po zmianie danych: linia, która przestała być przebita, odzyskuje "nowość" (ack=false). Zwraca liczbę nowych alertów.
function annRefresh(store, stocks) {
    let fresh = 0;
    alertRows(store, stocks).forEach(r => {
        const line = store[r.alert.ticker].lines.find(l => l.id === r.alert.id);
        if (!line) return;
        if (!r.alert.triggered) line.ack = false;
        else if (!line.ack) fresh++;
    });
    return fresh;
}

// Import (JSON z eksportu): zastępuje adnotacje tickerów obecnych w pliku, resztę zostawia.
function mergeImport(store, text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || typeof data.annotations !== "object") throw new Error("To nie jest eksport adnotacji.");
    const out = { ...store };
    Object.keys(data.annotations).forEach(t => {
        const r = data.annotations[t];
        if (!r || typeof r !== "object") return;
        out[t] = { ...annEmptyRecord(), ...r, lines: Array.isArray(r.lines) ? r.lines : [], cups: Array.isArray(r.cups) ? r.cups : [] };
    });
    return out;
}

function annExportJson(store, now = new Date()) {
    return JSON.stringify({ version: 1, exportedAt: now.toISOString(), annotations: store }, null, 1);
}

// ---------- stan, zapis ----------

let annStore = {};
const annEdit = { on: false, spaceOn: false, tool: null, selected: null, kind: "res", alert: "", ext: true, pending: [], cursor: null };
let annCurrent = null;       // { render, ticker, full } ostatnio narysowanej warstwy
let annOnRedraw = () => {};  // pełne przerysowanie wykresu (np. po ukryciu automatycznych linii)

function annLoad() {
    try {
        const saved = JSON.parse(localStorage.getItem(ANN_KEY) || "{}");
        if (saved && typeof saved === "object") annStore = saved;
    } catch (e) { /* uszkodzony zapis */ }
    return annStore;
}

function annSave() {
    try { localStorage.setItem(ANN_KEY, JSON.stringify(annStore)); } catch (e) { /* brak localStorage */ }
}

function annRecord(ticker, create = false) {
    if (!annStore[ticker] && create) annStore[ticker] = annEmptyRecord();
    return annStore[ticker] || null;
}

function annHide(ticker) {
    const r = annStore[ticker];
    return { lines: !!(r && r.hideAutoLines), cups: !!(r && r.hideAutoCups) };
}

// ---------- warstwa nad wykresem (rysowanie i edycja) ----------

const SVG_NS = "http://www.w3.org/2000/svg";

function annOverlay(ctx) {
    const { plot, m, geom, ticker } = ctx;
    const L = geom.L;
    plot.style.position = "relative";
    const ov = document.createElementNS(SVG_NS, "svg");
    ov.setAttribute("class", "chart-overlay" + (annEdit.on ? " editing" : ""));
    ov.setAttribute("viewBox", `0 0 ${L.width} ${L.height}`);
    ov.setAttribute("preserveAspectRatio", "xMidYMid meet");
    plot.appendChild(ov);

    const rec = () => annStore[ticker] || null;
    const plotRight = L.width - L.right;
    const idxOf = d => dateToIndex(m.weeks, d);
    const priceOfY = y => {
        const f = (L.price.y + L.price.h - y) / L.price.h;
        return geom.useLog ? Math.exp(Math.log(geom.pMin) + f * (Math.log(geom.pMax) - Math.log(geom.pMin))) : geom.pMin + f * (geom.pMax - geom.pMin);
    };
    const r2 = v => Math.round(v * 100) / 100;
    const toSvg = ev => {
        const pt = ov.createSVGPoint();
        pt.x = ev.clientX; pt.y = ev.clientY;
        const p = pt.matrixTransform(ov.getScreenCTM().inverse());
        return { x: p.x, y: p.y };
    };
    // Punkt na wykresie: x przyciągany do świecy, y do High/Low tej świecy, gdy kursor jest blisko.
    const snap = p => {
        const idx = Math.max(0, Math.min(m.n - 1, Math.round((p.x - L.left) / geom.step - 0.5)));
        let price = priceOfY(Math.max(L.price.y, Math.min(L.price.y + L.price.h, p.y)));
        const near = geom.fs(12);
        if (Number.isFinite(m.h[idx]) && Math.abs(p.y - geom.yP(m.h[idx])) < near) price = m.h[idx];
        else if (Number.isFinite(m.l[idx]) && Math.abs(p.y - geom.yP(m.l[idx])) < near) price = m.l[idx];
        return { date: m.weeks[idx], price: r2(price) };
    };

    const pts2s = pts => pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

    const markup = () => {
        const R = rec();
        const sel = annEdit.selected;
        const h = geom.fs(7);
        let body = "";
        (R ? R.lines : []).forEach(line => {
            const i0 = idxOf(line.x0), i1 = idxOf(line.x1);
            const col = ANN_COLORS[line.kind] || ANN_COLORS.free;
            const a = [geom.x(i0), geom.yP(line.y0)], b = [geom.x(i1), geom.yP(line.y1)];
            // zwykła prosta między dwoma punktami + przerywane przedłużenie tej samej prostej do ostatniej świecy
            const main = [a, b];
            const xLast = geom.x(m.n - 1);
            const ext = line.ext !== false && i1 < m.n - 1 && b[0] > a[0] ? [b, [xLast, b[1] + (b[1] - a[1]) * (xLast - b[0]) / (b[0] - a[0])]] : [];
            const isSel = sel && sel.type === "line" && sel.id === line.id;
            body += `<polyline fill="none" stroke="${col}" stroke-width="${isSel ? 3 : 2}" points="${pts2s(main)}"><title>${ANN_KIND_LABELS[line.kind] || "linia"}${line.alert ? " · alert " + ANN_DIR_LABELS[line.alert] : ""}</title></polyline>`;
            if (ext.length > 1) body += `<polyline fill="none" stroke="${col}" stroke-width="1.4" stroke-dasharray="2 4" points="${pts2s(ext)}"/>`;
            if (line.alert) body += `<text x="${Math.min(plotRight - 12, Math.max(L.left + 12, b[0] + 4))}" y="${b[1] - 6}" font-size="${geom.fs(13)}" text-anchor="middle">🔔</text>`;
            if (annEdit.on) {
                body += `<polyline data-line="${line.id}" fill="none" stroke="transparent" stroke-width="16" pointer-events="stroke" points="${pts2s([a, b])}"/>`;
                if (isSel) body += `<circle data-handle="a" data-line="${line.id}" cx="${a[0]}" cy="${a[1]}" r="${h}" fill="#0e0f13" stroke="${col}" stroke-width="2.5"/>`
                    + `<circle data-handle="b" data-line="${line.id}" cx="${b[0]}" cy="${b[1]}" r="${h}" fill="#0e0f13" stroke="${col}" stroke-width="2.5"/>`;
            }
        });
        (R ? R.cups : []).forEach(cu => {
            const cup = { i0: idxOf(cu.start), iLow: idxOf(cu.low_date), i1: idxOf(cu.end), peak: cu.peak, low: cu.low, right: cu.right };
            const { pts, yL, yB, yR } = cupArcPoints(cup, geom.x, geom.yP);
            const depth = cu.peak > 0 ? ((cu.peak - cu.low) / cu.peak * 100).toFixed(1) : "?";
            const isSel = sel && sel.type === "cup" && sel.id === cu.id;
            body += `<polyline fill="none" stroke="${ANN_COLORS.cup}" stroke-width="${isSel ? 3.2 : 2}" stroke-linecap="round" points="${pts2s(pts)}"><title>Cup −${depth}% (własny)</title></polyline>`;
            const cx = Math.min(Math.max(geom.x((cup.i0 + cup.i1) / 2), L.left + 24), plotRight - 24);
            body += `<text x="${cx}" y="${yB - (yB - Math.min(yL, yR)) * 0.35}" font-size="${geom.fs(12)}" font-weight="700" fill="${ANN_COLORS.cup}" text-anchor="middle" stroke="#0e0f13" stroke-width="3" paint-order="stroke">−${depth}%</text>`;
            if (annEdit.on) {
                body += `<polyline data-cup="${cu.id}" fill="none" stroke="transparent" stroke-width="16" pointer-events="stroke" points="${pts2s(pts)}"/>`;
                if (isSel) {
                    [["L", geom.x(cup.i0), yL], ["B", geom.x(cup.iLow), yB], ["R", geom.x(cup.i1), yR]].forEach(([k, hx, hy]) => {
                        body += `<circle data-handle="${k}" data-cup="${cu.id}" cx="${hx}" cy="${hy}" r="${h}" fill="#0e0f13" stroke="#fff" stroke-width="2.5"/>`;
                    });
                }
            }
        });
        // podgląd: punkty już postawione + gumka do kursora
        if (annEdit.on && annEdit.pending.length) {
            const P = annEdit.pending.map(p => [geom.x(idxOf(p.date)), geom.yP(p.price)]);
            const cur = annEdit.cursor ? [geom.x(idxOf(annEdit.cursor.date)), geom.yP(annEdit.cursor.price)] : null;
            body += `<polyline fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="4 3" points="${pts2s(cur ? [...P, cur] : P)}"/>`;
            P.forEach(p => { body += `<circle cx="${p[0]}" cy="${p[1]}" r="${h * 0.7}" fill="#fff"/>`; });
        }
        const catcher = annEdit.on ? `<rect class="ann-catch" x="${L.left}" y="${L.price.y}" width="${plotRight - L.left}" height="${L.price.h}" fill="transparent"/>` : "";
        return `<defs><clipPath id="annClip"><rect x="${L.left}" y="${L.price.y}" width="${plotRight - L.left}" height="${L.price.h}"/></clipPath></defs>${catcher}<g clip-path="url(#annClip)">${body}</g>`;
    };
    const render = () => { ov.innerHTML = markup(); };
    annCurrent = { render, ticker, full: ctx.full };
    render();
    if (!annEdit.on) return;

    const touch = () => { const R = rec(); if (R) R.editedAt = new Date().toISOString(); annSave(); };
    const finishPending = () => {
        const R = annRecord(ticker, true), P = annEdit.pending;
        if (annEdit.tool === "line" && P.length === 2) {
            const [p, q] = P[0].date <= P[1].date ? [P[0], P[1]] : [P[1], P[0]];
            if (p.date !== q.date) {
                const line = { id: annNewId(), kind: annEdit.kind, x0: p.date, y0: p.price, x1: q.date, y1: q.price, alert: annEdit.alert || null, log: !!geom.useLog, ext: annEdit.ext };
                R.lines.push(line);
                annEdit.selected = { type: "line", id: line.id };
            }
            annEdit.pending = []; annEdit.tool = null; touch(); annSyncTools();
        } else if (annEdit.tool === "cup" && P.length === 3) {
            const [a, b, c] = P;
            if (a.date < b.date && b.date < c.date) {
                const cup = { id: annNewId(), start: a.date, low_date: b.date, end: c.date, peak: a.price, low: Math.min(b.price, a.price), right: c.price };
                R.cups.push(cup);
                annEdit.selected = { type: "cup", id: cup.id };
            }
            annEdit.pending = []; annEdit.tool = null; touch(); annSyncTools();
        }
    };
    const dragTo = (target, handle, pt) => {
        const R = rec();
        if (!R) return;
        if (target.type === "line") {
            const l = R.lines.find(x => x.id === target.id);
            if (!l) return;
            if (handle === "a") { l.x0 = pt.date; l.y0 = pt.price; } else { l.x1 = pt.date; l.y1 = pt.price; }
        } else {
            const c = R.cups.find(x => x.id === target.id);
            if (!c) return;
            if (handle === "L") { c.start = pt.date; c.peak = pt.price; }
            else if (handle === "B") { c.low_date = pt.date; c.low = pt.price; }
            else { c.end = pt.date; c.right = pt.price; }
        }
    };

    ov.addEventListener("pointerdown", ev => {
        const t = ev.target;
        const handle = t.dataset && t.dataset.handle;
        if (handle) {
            ev.preventDefault();
            const target = t.dataset.line ? { type: "line", id: t.dataset.line } : { type: "cup", id: t.dataset.cup };
            ov.setPointerCapture(ev.pointerId);
            const move = e => { dragTo(target, handle, snap(toSvg(e))); render(); };
            const up = () => {
                ov.removeEventListener("pointermove", move); ov.removeEventListener("pointerup", up); ov.removeEventListener("pointercancel", up);
                touch(); annSyncTools();
            };
            ov.addEventListener("pointermove", move); ov.addEventListener("pointerup", up); ov.addEventListener("pointercancel", up);
            return;
        }
        if (t.dataset && (t.dataset.line || t.dataset.cup) && !annEdit.tool) {
            annEdit.selected = t.dataset.line ? { type: "line", id: t.dataset.line } : { type: "cup", id: t.dataset.cup };
            annSyncTools(); render();
            return;
        }
        if (!t.classList || !t.classList.contains("ann-catch")) return;
        if (annEdit.tool === "line" || annEdit.tool === "cup") {
            annEdit.pending.push(snap(toSvg(ev)));
            annEdit.cursor = null;
            finishPending();
        } else {
            // bez narzędzia: przeciągnięcie po pustym wykresie rysuje linię (szybkie rysowanie, np. przy trzymanej spacji);
            // samo kliknięcie tylko odznacza
            const startPt = toSvg(ev), start = snap(startPt);
            ov.setPointerCapture(ev.pointerId);
            const move = e => { annEdit.pending = [start]; annEdit.cursor = snap(toSvg(e)); render(); };
            const up = e => {
                ov.removeEventListener("pointermove", move); ov.removeEventListener("pointerup", up); ov.removeEventListener("pointercancel", up);
                const endPt = toSvg(e), end = snap(endPt);
                annEdit.cursor = null;
                if (Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y) > 8) { annEdit.pending = [start, end]; annEdit.tool = "line"; finishPending(); }
                else { annEdit.pending = []; annEdit.selected = null; annSyncTools(); }
                render();
            };
            ov.addEventListener("pointermove", move); ov.addEventListener("pointerup", up); ov.addEventListener("pointercancel", up);
            return;
        }
        render();
    });
    ov.addEventListener("pointermove", ev => {
        if (!annEdit.pending.length) return;
        annEdit.cursor = snap(toSvg(ev));
        render();
    });
}

// ---------- pasek narzędzi w oknie wykresu ----------

function annSelectedObject() {
    if (!annCurrent || !annEdit.selected) return null;
    const R = annStore[annCurrent.ticker];
    if (!R) return null;
    return annEdit.selected.type === "line" ? R.lines.find(l => l.id === annEdit.selected.id) : R.cups.find(c => c.id === annEdit.selected.id);
}

function annSyncTools() {
    const $ = id => document.getElementById(id);
    if (!$("chartTools")) return;
    $("chartTools").hidden = !annEdit.on || annEdit.spaceOn;   // przy trzymanej spacji bez paska (nie przesuwa wykresu)
    $("chartEditBtn").classList.toggle("active", annEdit.on);
    $("chartEditBtn").title = "Rysuj własne linie trendu z alertem i poprawiaj cupy (albo przytrzymaj spację)";
    $("toolLine").classList.toggle("active", annEdit.tool === "line");
    $("toolCup").classList.toggle("active", annEdit.tool === "cup");
    const obj = annSelectedObject();
    const isLine = obj && annEdit.selected.type === "line";
    $("kindSel").value = isLine ? obj.kind : annEdit.kind;
    $("alertSel").value = isLine ? (obj.alert || "") : annEdit.alert;
    $("extChk").checked = isLine ? obj.ext !== false : annEdit.ext;
    $("toolDel").disabled = !obj;
    $("annHint").textContent = annEdit.tool === "line" ? "Kliknij dwa punkty na wykresie (przyciąga do High/Low świecy)."
        : annEdit.tool === "cup" ? "Kliknij trzy punkty: lewy brzeg, dołek, prawy brzeg miseczki."
        : obj ? "Przeciągnij kółka, żeby poprawić; Usuń kasuje zaznaczone." : "Przeciągnij po wykresie, żeby narysować linię, albo wybierz narzędzie / kliknij linię lub cup, żeby ją poprawić.";
    const R = annCurrent && annStore[annCurrent.ticker];
    $("annNote").value = R ? R.note || "" : "";
}

function annInitUI(onRedraw) {
    annOnRedraw = onRedraw;
    const $ = id => document.getElementById(id);
    if (!$("chartEditBtn")) return;
    const tool = name => () => { annEdit.tool = annEdit.tool === name ? null : name; annEdit.pending = []; annEdit.cursor = null; annSyncTools(); if (annCurrent) annCurrent.render(); };
    const setEdit = (on, bySpace) => {
        annEdit.on = on;
        annEdit.spaceOn = on && bySpace;
        annEdit.tool = null; annEdit.pending = []; annEdit.selected = null; annEdit.cursor = null;
        if (on && annCurrent) {   // pierwsze wejście: przejmij automatyczne linie/cupy jako własne (z migawką algorytmu)
            const R = annRecord(annCurrent.ticker, true);
            const hadAuto = R.hideAutoLines || R.hideAutoCups;
            annAdoptAuto(R, annCurrent.full);
            if (!hadAuto) annSave();
        }
        annSyncTools();
        annOnRedraw();
    };
    $("chartEditBtn").addEventListener("click", () => setEdit(!annEdit.on, false));
    // Przytrzymana SPACJA = tymczasowy tryb edycji (po puszczeniu wraca do podglądu); nie działa w polach tekstowych.
    const chartOpen = () => !$("chartModal").hidden;
    const typing = ev => /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName);
    document.addEventListener("keydown", ev => {
        if (ev.key !== " " || !chartOpen() || typing(ev)) return;
        ev.preventDefault();                                   // bez przewijania strony / klikania zogniskowanego przycisku
        if (!ev.repeat && !annEdit.on) setEdit(true, true);
    });
    document.addEventListener("keyup", ev => {
        if (ev.key !== " " || !annEdit.spaceOn) return;
        ev.preventDefault();
        setEdit(false, false);
    });
    window.addEventListener("blur", () => { if (annEdit.spaceOn) setEdit(false, false); });
    $("toolLine").addEventListener("click", tool("line"));
    $("toolCup").addEventListener("click", tool("cup"));
    $("kindSel").addEventListener("change", () => {
        const obj = annSelectedObject();
        if (obj && annEdit.selected.type === "line") { obj.kind = $("kindSel").value; annSave(); } else annEdit.kind = $("kindSel").value;
        if (annCurrent) annCurrent.render();
    });
    $("alertSel").addEventListener("change", () => {
        const obj = annSelectedObject();
        const v = $("alertSel").value || null;
        if (obj && annEdit.selected.type === "line") { obj.alert = v; obj.ack = false; annSave(); } else annEdit.alert = v || "";
        if (annCurrent) annCurrent.render();
    });
    $("extChk").addEventListener("change", () => {
        const obj = annSelectedObject();
        if (obj && annEdit.selected.type === "line") { obj.ext = $("extChk").checked; annSave(); } else annEdit.ext = $("extChk").checked;
        if (annCurrent) annCurrent.render();
    });
    $("toolDel").addEventListener("click", () => {
        const obj = annSelectedObject();
        if (!obj) return;
        const R = annStore[annCurrent.ticker];
        if (annEdit.selected.type === "line") R.lines = R.lines.filter(l => l.id !== obj.id); else R.cups = R.cups.filter(c => c.id !== obj.id);
        R.editedAt = new Date().toISOString();
        annEdit.selected = null; annSave(); annSyncTools(); annCurrent.render();
    });
    $("toolRestore").addEventListener("click", () => {
        if (!annCurrent || !confirm("Usunąć własne linie i cupy tej spółki i wrócić do wykrytych automatycznie? (Alerty na tych liniach znikną.)")) return;
        delete annStore[annCurrent.ticker];
        annEdit.selected = null; annSave(); annSyncTools(); annOnRedraw();
    });
    $("annNote").addEventListener("input", () => {
        if (!annCurrent) return;
        const R = annRecord(annCurrent.ticker, true);
        R.note = $("annNote").value; annSave();
    });
    document.addEventListener("keydown", ev => {
        if ((ev.key === "Delete" || ev.key === "Backspace") && annEdit.on && annSelectedObject() && !/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) $("toolDel").click();
    });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        bizIndex, lineValueAt, alertState, autoToDates, annAdoptAuto, alertRows, annRefresh, mergeImport, annExportJson, annEmptyRecord, ANN_NEAR_PCT,
    };
}
