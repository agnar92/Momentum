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
// Wyrównanie linii do poziomu (kąt 0°): oba końce na średniej cenie.
function annFlatten(line) {
    const y = Math.round((line.y0 + line.y1) / 2 * 100) / 100;
    line.y0 = y; line.y1 = y;
    return line;
}

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
        // miseczka może zaczynać się przed pierwszą świecą (ujemny indeks) — data wychodzi z ekstrapolacji, nie z przycięcia do okna
        cups: full.cups.map(c => ({ start: indexToDate(full.weeks, c.i0), low_date: indexToDate(full.weeks, c.iLow), end: indexToDate(full.weeks, c.i1), peak: c.peak, low: c.low, right: c.right })),
    };
}

// Przejęcie wyników algorytmu: kopie jako własne + migawka (raz) + ukrycie wersji automatycznej.
function annAdoptAuto(rec, full) {
    const auto = autoToDates(full);
    if (!rec.hideAutoLines && auto.lines.length && !rec.lines.length) {
        rec.lines = auto.lines.map(l => ({ id: annNewId(), ...l, alert: null, ext: false, fromAuto: true }));
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
        // editedAt = teraz: zaimportowane dane mają wygrać przy późniejszej synchronizacji z innym urządzeniem
        out[t] = { ...annEmptyRecord(), ...r, lines: Array.isArray(r.lines) ? r.lines : [], cups: Array.isArray(r.cups) ? r.cups : [], editedAt: new Date().toISOString() };
    });
    return out;
}

// ---------- scalanie między urządzeniami (synchronizacja) ----------
// Rekord spółki: linie/cupy łączone po id (ta sama linia: wersja z nowszego rekordu), usunięcia pamiętamy jako nagrobki
// rec.del = { id: czas } — usunięta linia nie wraca z drugiego urządzenia. Pola skalarne (notatka, flagi ukrycia, migawka)
// bierzemy z nowszego rekordu (editedAt).
function mergeRecords(a, b) {
    a = { ...annEmptyRecord(), ...a }; b = { ...annEmptyRecord(), ...b };
    const base = (b.editedAt || "") > (a.editedAt || "") ? b : a;
    const other = base === a ? b : a;
    const del = { ...(other.del || {}), ...(base.del || {}) };
    const union = key => {
        const m = new Map();
        [other[key] || [], base[key] || []].forEach(arr => arr.forEach(it => { if (it && it.id && !del[it.id]) m.set(it.id, it); }));
        return [...m.values()];
    };
    return { ...other, ...base, lines: union("lines"), cups: union("cups"), del, editedAt: base.editedAt || other.editedAt || null };
}

function mergeStores(a, b) {
    const out = {};
    new Set([...Object.keys(a || {}), ...Object.keys(b || {})]).forEach(t => {
        out[t] = a && a[t] && b && b[t] ? mergeRecords(a[t], b[t]) : { ...annEmptyRecord(), ...((a && a[t]) || (b && b[t])) };
    });
    return out;
}

// „Przywróć auto”: pusty rekord z nagrobkami wszystkich dotychczasowych linii i cupów (żeby nie wróciły z drugiego urządzenia)
function annResetRecord(rec, now = new Date()) {
    const del = { ...((rec && rec.del) || {}) };
    ((rec && rec.lines) || []).concat((rec && rec.cups) || []).forEach(x => { del[x.id] = now.toISOString(); });
    return { ...annEmptyRecord(), del, editedAt: now.toISOString() };
}

function annExportJson(store, now = new Date()) {
    return JSON.stringify({ version: 1, exportedAt: now.toISOString(), annotations: store }, null, 1);
}

// ---------- stan, zapis ----------

let annStore = {};
const annEdit = { on: false, spaceOn: false, tool: null, selected: null, kind: "res", alert: "", ext: false, pending: [], cursor: null, spaceHeld: false, menuOpen: false, lastTap: null };
let annCurrent = null;       // { render, ticker, full } ostatnio narysowanej warstwy
let annOnRedraw = () => {};  // pełne przerysowanie wykresu (np. po ukryciu automatycznych linii)

function annLoad() {
    try {
        const saved = JSON.parse(localStorage.getItem(ANN_KEY) || "{}");
        if (saved && typeof saved === "object") annStore = saved;
    } catch (e) { /* uszkodzony zapis */ }
    return annStore;
}

let annOnSave = () => {};   // wywoływane po każdej zmianie zapisanej przez użytkownika (synchronizacja: js/sync.js)

function annWriteLocal() {
    try { localStorage.setItem(ANN_KEY, JSON.stringify(annStore)); } catch (e) { /* brak localStorage */ }
}

function annSave() {
    annWriteLocal();
    annOnSave();
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
    const editing = annEdit.on && !ctx.readonly;      // w siatce wykresów edytować można tylko pierwszy (zaznaczony) wykres
    const clipId = "annClip" + (ctx.uid || "");
    const L = geom.L;
    plot.style.position = "relative";
    const ov = document.createElementNS(SVG_NS, "svg");
    ov.setAttribute("class", "chart-overlay" + (editing ? " editing" : ""));
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

    // Shift = linia pozioma: druga cena = cena pierwszego punktu (kąt 0°)
    const level = (pt, ref, ev) => (ev && ev.shiftKey && ref ? { date: pt.date, price: ref.price } : pt);

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
            const hasNote = !!(line.note && line.note.trim());
            if (hasNote) {
                // ikona notatki z lewej strony na początku linii; najechanie na linię lub ikonę (dotyk: stuknięcie ikony) pokazuje treść
                const ix = Math.max(L.left + 12, a[0] - geom.fs(14)), iy = a[1];
                if (!editing) body += `<polyline data-nline="${line.id}" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke" points="${pts2s([a, b])}"/>`;
                body += `<g data-nline="${line.id}" class="ann-note-icon" style="cursor:pointer" pointer-events="all"><circle cx="${ix}" cy="${iy}" r="${geom.fs(9)}" fill="#0e0f13" stroke="${col}" stroke-width="1.3"/><text x="${ix}" y="${iy + geom.fs(4)}" font-size="${geom.fs(11)}" text-anchor="middle" pointer-events="none">📝</text></g>`;
            }
            if (line.alert) body += `<text x="${Math.min(plotRight - 12, Math.max(L.left + 12, b[0] + 4))}" y="${b[1] - 6}" font-size="${geom.fs(13)}" text-anchor="middle">🔔</text>`;
            if (editing) {
                body += `<polyline data-line="${line.id}" fill="none" stroke="transparent" stroke-width="16" pointer-events="stroke" style="cursor:move" points="${pts2s([a, b])}"/>`;
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
            if (editing) {
                body += `<polyline data-cup="${cu.id}" fill="none" stroke="transparent" stroke-width="16" pointer-events="stroke" style="cursor:move" points="${pts2s(pts)}"/>`;
                if (isSel) {
                    [["L", geom.x(cup.i0), yL], ["B", geom.x(cup.iLow), yB], ["R", geom.x(cup.i1), yR]].forEach(([k, hx, hy]) => {
                        body += `<circle data-handle="${k}" data-cup="${cu.id}" cx="${hx}" cy="${hy}" r="${h}" fill="#0e0f13" stroke="#fff" stroke-width="2.5"/>`;
                    });
                }
            }
        });
        // podgląd: punkty już postawione + gumka do kursora
        if (editing && annEdit.pending.length) {
            const P = annEdit.pending.map(p => [geom.x(idxOf(p.date)), geom.yP(p.price)]);
            const cur = annEdit.cursor ? [geom.x(idxOf(annEdit.cursor.date)), geom.yP(annEdit.cursor.price)] : null;
            body += `<polyline fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="4 3" points="${pts2s(cur ? [...P, cur] : P)}"/>`;
            P.forEach(p => { body += `<circle cx="${p[0]}" cy="${p[1]}" r="${h * 0.7}" fill="#fff"/>`; });
        }
        const catcher = editing ? `<rect class="ann-catch" x="${L.left}" y="${L.price.y}" width="${plotRight - L.left}" height="${L.price.h}" fill="transparent"/>` : "";
        return `<defs><clipPath id="${clipId}"><rect x="${L.left}" y="${L.price.y}" width="${plotRight - L.left}" height="${L.price.h}"/></clipPath></defs>${catcher}<g clip-path="url(#${clipId})">${body}</g>`;
    };
    const render = () => { ov.innerHTML = markup(); };
    if (!ctx.readonly) annCurrent = { render, ticker, full: ctx.full };
    render();
    // Dotyk bez trybu edycji: podwójne stuknięcie w wykres włącza edycję i od razu pokazuje wybór „linia / cup”
    if (!editing && !ctx.readonly && !plot.dataset.annDbl) {
        plot.dataset.annDbl = "1";
        let last = null;
        plot.addEventListener("pointerdown", ev => {
            if (ev.pointerType === "mouse" || annEdit.on) return;
            const now = Date.now();
            if (last && now - last.t < 400 && Math.hypot(ev.clientX - last.x, ev.clientY - last.y) < 30) {
                last = null;
                if (annApi.setEdit) { annApi.setEdit(true, false); annAddMenu(ev.clientX, ev.clientY); }
                return;
            }
            last = { t: now, x: ev.clientX, y: ev.clientY };
        });
    }
    // Notatka linii: najechanie myszą na linię/ikonę pokazuje kartę z treścią (edytowalną), ikona działa też stuknięciem
    const noteId = ev => {
        const g = ev.target.closest && ev.target.closest("[data-nline],[data-line]");
        const id = g && (g.dataset.nline || g.dataset.line);
        const line = id && rec() && rec().lines.find(l => l.id === id);
        return line && line.note && line.note.trim() ? id : null;
    };
    ov.addEventListener("mouseover", ev => { const id = noteId(ev); if (id) annShowNote(ev.clientX, ev.clientY, id, false); });
    ov.addEventListener("mouseout", () => annScheduleNoteHide());
    ov.addEventListener("click", ev => {
        const g = ev.target.closest && ev.target.closest(".ann-note-icon");
        if (g) { const id = g.dataset.nline; annShowNote(ev.clientX, ev.clientY, id, true); }
    });
    if (!editing) return;

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
            annEdit.pending = []; annEdit.tool = null; touch(); annSyncTools(); annLeaveSpace();
        } else if (annEdit.tool === "cup" && P.length === 3) {
            const [a, b, c] = P;
            if (a.date < b.date && b.date < c.date) {
                const cup = { id: annNewId(), start: a.date, low_date: b.date, end: c.date, peak: a.price, low: Math.min(b.price, a.price), right: c.price };
                R.cups.push(cup);
                annEdit.selected = { type: "cup", id: cup.id };
            }
            annEdit.pending = []; annEdit.tool = null; touch(); annSyncTools(); annLeaveSpace();
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
        if (ev.pointerType === "mouse" && ev.button !== 0) return;   // prawy przycisk obsługuje menu kontekstowe
        const t = ev.target;
        const handle = t.dataset && t.dataset.handle;
        if (handle) {
            ev.preventDefault();
            const target = t.dataset.line ? { type: "line", id: t.dataset.line } : { type: "cup", id: t.dataset.cup };
            ov.setPointerCapture(ev.pointerId);
            const move = e => {
                let pt = snap(toSvg(e));
                const R = rec(), l = R && target.type === "line" ? R.lines.find(x => x.id === target.id) : null;
                if (l) pt = level(pt, { price: handle === "a" ? l.y1 : l.y0 }, e);
                dragTo(target, handle, pt); render();
            };
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
            // Chwycenie za środek linii/cupa i przeciągnięcie przesuwa całość (o całe świece w poziomie, dowolnie w pionie);
            // samo stuknięcie (dotyk) otwiera menu jak w TradingView
            const R = rec(), target = annEdit.selected;
            const obj = R && (target.type === "line" ? R.lines.find(x => x.id === target.id) : R.cups.find(x => x.id === target.id));
            if (!obj) return;
            ev.preventDefault();
            ov.setPointerCapture(ev.pointerId);
            const start = toSvg(ev), orig = { ...obj };
            const dateKeys = target.type === "line" ? [["x0", "y0"], ["x1", "y1"]] : [["start", "peak"], ["low_date", "low"], ["end", "right"]];
            let moved = false;
            const move = e => {
                const p = toSvg(e);
                if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 5) return;
                moved = true;
                const di = Math.round((p.x - start.x) / geom.step), dy = p.y - start.y;
                dateKeys.forEach(([dk, pk]) => {
                    obj[dk] = indexToDate(m.weeks, idxOf(orig[dk]) + di);
                    obj[pk] = r2(priceOfY(geom.yP(orig[pk]) + dy));
                });
                if (target.type === "cup") obj.low = Math.min(obj.low, obj.peak);
                render();
            };
            const up = e => {
                ov.removeEventListener("pointermove", move); ov.removeEventListener("pointerup", up); ov.removeEventListener("pointercancel", up);
                if (moved) { touch(); annSyncTools(); render(); }
                else if (e.pointerType !== "mouse" && e.type === "pointerup") annObjectMenu(e.clientX, e.clientY);
            };
            ov.addEventListener("pointermove", move); ov.addEventListener("pointerup", up); ov.addEventListener("pointercancel", up);
            return;
        }
        if (!t.classList || !t.classList.contains("ann-catch")) return;
        if (!annEdit.tool && ev.pointerType !== "mouse") {   // dotyk: podwójne stuknięcie w pusty wykres = wybór „linia / cup”
            const lt = annEdit.lastTap, now = Date.now();
            if (lt && now - lt.t < 400 && Math.hypot(ev.clientX - lt.x, ev.clientY - lt.y) < 30) {
                annEdit.lastTap = null;
                ev.preventDefault();
                annAddMenu(ev.clientX, ev.clientY);
                return;
            }
            annEdit.lastTap = { t: now, x: ev.clientX, y: ev.clientY };
        }
        if (annEdit.tool === "line" || annEdit.tool === "cup") {
            annEdit.pending.push(annEdit.tool === "line" && annEdit.pending.length === 1 ? level(snap(toSvg(ev)), annEdit.pending[0], ev) : snap(toSvg(ev)));
            annEdit.cursor = null;
            finishPending();
        } else {
            // bez narzędzia: przeciągnięcie po pustym wykresie rysuje linię (szybkie rysowanie, np. przy trzymanej spacji);
            // samo kliknięcie tylko odznacza
            const startPt = toSvg(ev), start = snap(startPt);
            ov.setPointerCapture(ev.pointerId);
            const move = e => { annEdit.pending = [start]; annEdit.cursor = level(snap(toSvg(e)), start, e); render(); };
            const up = e => {
                ov.removeEventListener("pointermove", move); ov.removeEventListener("pointerup", up); ov.removeEventListener("pointercancel", up);
                const endPt = toSvg(e), end = level(snap(endPt), start, e);
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
        const pt = snap(toSvg(ev));
        annEdit.cursor = annEdit.tool === "line" && annEdit.pending.length === 1 ? level(pt, annEdit.pending[0], ev) : pt;
        render();
    });
    // Prawy przycisk (na dotyku: długie przytrzymanie): menu linii/cupa albo — na pustym wykresie — wybór „linia / cup”
    ov.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        const t = ev.target;
        if (annEdit.tool) return;
        if (t.dataset && (t.dataset.line || t.dataset.cup)) {
            annEdit.selected = t.dataset.line ? { type: "line", id: t.dataset.line } : { type: "cup", id: t.dataset.cup };
            annSyncTools(); render();
            annObjectMenu(ev.clientX, ev.clientY);
        } else annAddMenu(ev.clientX, ev.clientY);
    });
}

// ---------- karta notatki linii ----------

let annNoteEl = null;
let annNoteTimer = null;

function annCloseNote() {
    clearTimeout(annNoteTimer);
    if (annNoteEl) { annNoteEl.remove(); annNoteEl = null; }
}

function annScheduleNoteHide() {
    clearTimeout(annNoteTimer);
    annNoteTimer = setTimeout(() => {
        if (annNoteEl && document.activeElement !== annNoteEl.querySelector("textarea")) annCloseNote();   // pisząc, karta zostaje
    }, 350);
}

// Karta z notatką wybranej linii (podgląd po najechaniu, edycja w polu; zapis na bieżąco, trafia też do synchronizacji).
function annShowNote(x, y, lineId, focus) {
    const R = annCurrent && annStore[annCurrent.ticker];
    const line = R && R.lines.find(l => l.id === lineId);
    if (!line) return;
    clearTimeout(annNoteTimer);
    if (annNoteEl && annNoteEl.dataset.line === lineId) {
        if (focus) annNoteEl.querySelector("textarea").focus();
        return;
    }
    annCloseNote();
    const el = document.createElement("div");
    el.className = "ann-lnote";
    el.dataset.line = lineId;
    el.innerHTML = `<div class="ann-lnote-head"><span>📝 Notatka do linii</span><button type="button" class="ann-lnote-close" aria-label="Zamknij">✕</button></div><textarea rows="4" maxlength="1000" placeholder="Napisz, co ta linia znaczy…"></textarea>`;
    const ta = el.querySelector("textarea");
    ta.value = line.note || "";
    ta.addEventListener("input", () => {
        line.note = ta.value;
        R.editedAt = new Date().toISOString();
        annSave();
        if (annCurrent) annCurrent.render();   // ikona pojawia się / znika razem z treścią
    });
    ta.addEventListener("keydown", ev => { if (ev.key === "Escape") { ev.stopPropagation(); annCloseNote(); } ev.stopPropagation(); });
    ta.addEventListener("keyup", ev => ev.stopPropagation());
    el.querySelector(".ann-lnote-close").addEventListener("click", annCloseNote);
    el.addEventListener("mouseenter", () => clearTimeout(annNoteTimer));
    el.addEventListener("mouseleave", annScheduleNoteHide);
    (document.fullscreenElement || document.body).appendChild(el);
    const r = el.getBoundingClientRect();
    const left = Math.max(4, Math.min(x + 14, window.innerWidth - r.width - 4));
    const top = y + 14 + r.height > window.innerHeight ? Math.max(4, y - r.height - 14) : y + 14;
    el.style.left = left + "px";
    el.style.top = top + "px";
    annNoteEl = el;
    if (focus) ta.focus();
}

// ---------- menu kontekstowe ----------

let annMenuEl = null;
let annMenuOpenedAt = 0;

function annCloseMenu() {
    if (annMenuEl) { annMenuEl.remove(); annMenuEl = null; }
    if (!annEdit.menuOpen) return;
    annEdit.menuOpen = false;
    annLeaveSpace();
}

// items: [{ label, on (✓), danger, run }]; null = separator
function annShowMenu(x, y, items) {
    annCloseMenu();
    const el = document.createElement("div");
    el.className = "ann-menu";
    el.setAttribute("role", "menu");
    items.forEach(it => {
        if (!it) { const hr = document.createElement("div"); hr.className = "ann-menu-sep"; el.appendChild(hr); return; }
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ann-menu-item" + (it.danger ? " danger" : "");
        b.textContent = (it.on ? "✓ " : "") + it.label;
        b.addEventListener("click", () => {
            if (Date.now() - annMenuOpenedAt < 400) return;   // dotyk: „click” po tym samym stuknięciu, które otworzyło menu, nie może go od razu wybrać
            const run = it.run; annEdit.menuOpen = false; annCloseMenu(); run(); annLeaveSpace(); });
        el.appendChild(b);
    });
    // w trybie pełnoekranowym przeglądarka pokazuje tylko element pełnoekranowy — menu musi być w jego środku
    (document.fullscreenElement || document.body).appendChild(el);
    const r = el.getBoundingClientRect();
    const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (touch) y = y - r.height - 28 >= 4 ? y - r.height - 28 : y + 28;   // nad palcem (żeby go nie zasłaniać), a gdy brak miejsca pod nim
    el.style.left = Math.max(4, Math.min(x - (touch ? r.width / 2 : 0), window.innerWidth - r.width - 4)) + "px";
    el.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + "px";
    annMenuOpenedAt = touch ? Date.now() : 0;   // ochrona przed „click” po stuknięciu otwierającym menu dotyczy tylko dotyku
    annMenuEl = el;
    annEdit.menuOpen = true;
}

function annSelectedLine() {
    const obj = annSelectedObject();
    return obj && annEdit.selected.type === "line" ? obj : null;
}

function annChanged() {
    const R = annCurrent && annStore[annCurrent.ticker];
    if (R) R.editedAt = new Date().toISOString();
    annSave(); annSyncTools();
    if (annCurrent) annCurrent.render();
}

function annObjectMenu(x, y) {
    const line = annSelectedLine(), obj = annSelectedObject();
    if (!obj) return;
    const del = { label: "Usuń", danger: true, run: () => { const b = document.getElementById("toolDel"); if (b) b.click(); } };
    if (!line) { annShowMenu(x, y, [del]); return; }
    const setKind = k => () => { line.kind = k; annChanged(); };
    const setAlert = v => () => { line.alert = v; line.ack = false; annChanged(); };
    annShowMenu(x, y, [
        { label: "Wyrównaj poziomo (0°)", run: () => { annFlatten(line); annChanged(); } },
        { label: line.note && line.note.trim() ? "📝 Edytuj notatkę" : "📝 Dodaj notatkę", run: () => annShowNote(x, y, line.id, true) },
        null,
        { label: "Opór", on: line.kind === "res", run: setKind("res") },
        { label: "Wsparcie", on: line.kind === "sup", run: setKind("sup") },
        { label: "Zwykła linia", on: line.kind === "free", run: setKind("free") },
        null,
        { label: "🔔 Alert: cena nad linią", on: line.alert === "above", run: setAlert("above") },
        { label: "🔔 Alert: cena pod linią", on: line.alert === "below", run: setAlert("below") },
        { label: "Bez alertu", on: !line.alert, run: setAlert(null) },
        null,
        { label: "Przedłużenie linii", on: line.ext !== false, run: () => { line.ext = line.ext === false; annChanged(); } },
        null,
        del,
    ]);
}

function annAddMenu(x, y) {
    const pick = tool => () => { annEdit.tool = tool; annEdit.pending = []; annEdit.cursor = null; annEdit.selected = null; annSyncTools(); if (annCurrent) annCurrent.render(); };
    annShowMenu(x, y, [
        { label: window.matchMedia && window.matchMedia("(pointer: coarse)").matches ? "＋ Linia (2 punkty)" : "＋ Linia (2 punkty; Shift = pozioma)", run: pick("line") },
        { label: "＋ Cup (3 punkty)", run: pick("cup") },
    ]);
}

// Tryb edycji włączony spacją kończy się, gdy spacja jest puszczona i nic się już nie rysuje.
function annLeaveSpace() {
    if (annEdit.spaceOn && !annEdit.spaceHeld && !annEdit.tool && !annEdit.pending.length && !annEdit.menuOpen && annApi.setEdit) annApi.setEdit(false, false);
}
const annApi = { setEdit: null };

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
    if ($("toolFlat")) $("toolFlat").disabled = !isLine;
    $("annHint").textContent = annEdit.tool === "line" ? "Kliknij dwa punkty na wykresie (przyciąga do High/Low świecy); Shift = linia pozioma."
        : annEdit.tool === "cup" ? "Kliknij trzy punkty: lewy brzeg, dołek, prawy brzeg miseczki."
        : obj ? "Przeciągnij kółka, żeby poprawić (Shift = poziomo); prawy przycisk / dotknięcie linii = menu." : "Przeciągnij po wykresie, żeby narysować linię, prawy przycisk (na telefonie podwójne stuknięcie) = wybór linia / cup.";
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
    annApi.setEdit = setEdit;
    $("chartEditBtn").addEventListener("click", () => setEdit(!annEdit.on, false));
    // Przytrzymana SPACJA = tymczasowy tryb edycji (po puszczeniu wraca do podglądu); nie działa w polach tekstowych.
    const chartOpen = () => !$("chartModal").hidden;
    const typing = ev => /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName);
    document.addEventListener("keydown", ev => {
        if (ev.key !== " " || !chartOpen() || typing(ev)) return;
        ev.preventDefault();                                   // bez przewijania strony / klikania zogniskowanego przycisku
        annEdit.spaceHeld = true;
        if (!ev.repeat && !annEdit.on) setEdit(true, true);
    });
    document.addEventListener("keyup", ev => {
        if (ev.key !== " ") return;
        annEdit.spaceHeld = false;
        if (!annEdit.spaceOn) return;
        ev.preventDefault();
        annLeaveSpace();   // jeśli właśnie coś się rysuje albo menu jest otwarte, tryb skończy się po zakończeniu
    });
    window.addEventListener("blur", () => { annEdit.spaceHeld = false; if (annEdit.spaceOn) { annEdit.tool = null; annEdit.pending = []; annCloseMenu(); setEdit(false, false); } });
    document.addEventListener("pointerdown", ev => {
        if (annMenuEl && !annMenuEl.contains(ev.target)) annCloseMenu();
        if (annNoteEl && !annNoteEl.contains(ev.target) && !(ev.target.closest && ev.target.closest(".ann-note-icon"))) annCloseNote();
    }, true);
    document.addEventListener("keydown", ev => { if (ev.key === "Escape") { if (annMenuEl) annCloseMenu(); else if (annNoteEl) annCloseNote(); } });
    window.addEventListener("resize", annCloseMenu);
    if ($("toolFlat")) $("toolFlat").addEventListener("click", () => { const l = annSelectedLine(); if (l) { annFlatten(l); annChanged(); } });
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
        R.del = { ...(R.del || {}), [obj.id]: new Date().toISOString() };   // nagrobek, żeby synchronizacja nie przywróciła linii
        R.editedAt = new Date().toISOString();
        annEdit.selected = null; annSave(); annSyncTools(); annCurrent.render();
    });
    $("toolRestore").addEventListener("click", () => {
        if (!annCurrent || !confirm("Usunąć własne linie i cupy tej spółki i wrócić do wykrytych automatycznie? (Alerty na tych liniach znikną.)")) return;
        annStore[annCurrent.ticker] = annResetRecord(annStore[annCurrent.ticker]);
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
        bizIndex, lineValueAt, alertState, annFlatten, mergeRecords, mergeStores, annResetRecord, autoToDates, annAdoptAuto, alertRows, annRefresh, mergeImport, annExportJson, annEmptyRecord, ANN_NEAR_PCT,
    };
}
