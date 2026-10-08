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
const ANN_KIND_LABELS = { res: "opór", sup: "wsparcie", free: "linia", stop: "stop", target: "cel" };
const ANN_DIR_LABELS = { above: "nad linią", below: "pod linią" };
const ANN_COLORS = { res: "#ff9f43", sup: "#9fb3c8", free: "#c77dff", cup: "#ffffff", stop: "#ff5a6a", target: "#2ecc71" };

// ---------- czysta logika ----------

function annNewId() { return Math.random().toString(36).slice(2, 8); }

function annEmptyRecord() {
    return { lines: [], cups: [], pen: [], hideAutoLines: false, hideAutoCups: false, auto: null, note: "", editedAt: null };
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

// ---------- szablony formacji (jedno stuknięcie zamiast rysowania od zera) ----------
// Tablice h/l/dates to PEŁNY model wykresu (świece dzienne albo tygodniowe), indeksy w nich. Wynik zawsze można poprawić uchwytami.

function annExtreme(arr, from, to, wantMax) {
    let k = -1;
    for (let i = Math.max(0, from); i <= to && i < arr.length; i++) {
        if (!Number.isFinite(arr[i])) continue;
        if (k < 0 || (wantMax ? arr[i] > arr[k] : arr[i] < arr[k])) k = i;
    }
    return k;
}

// Flaga / korytarz: stuknięcie = początek konsolidacji (start), koniec = ostatnia świeca. Opór przez szczyty obu połówek (gdy maleją),
// inaczej poziomy na najwyższym High; wsparcie przez dołki obu połówek. Zwraca [{kind,x0,y0,x1,y1}] albo null (za krótko).
function annTemplateFlag(h, l, dates, start, last) {
    if (!(last - start >= 4)) return null;
    const mid = start + Math.floor((last - start) / 2);
    const r2 = v => Math.round(v * 100) / 100;
    const through = (arr, a, b) => ({ x0: dates[a], y0: arr[a], x1: dates[last], y1: arr[a] + (arr[b] - arr[a]) * (last - a) / (b - a) });
    const lines = [];
    const p1 = annExtreme(h, start, mid, true), p2 = annExtreme(h, mid + 1, last, true);
    if (p1 >= 0 && p2 >= 0 && h[p2] <= h[p1]) {
        const ln = through(h, p1, p2);
        if (ln.y1 > 0) lines.push({ kind: "res", ...ln });
    }
    if (!lines.length && p1 >= 0) {
        const top = annExtreme(h, start, last, true);
        lines.push({ kind: "res", x0: dates[start], y0: h[top], x1: dates[last], y1: h[top] });
    }
    const t1 = annExtreme(l, start, mid, false), t2 = annExtreme(l, mid + 1, last, false);
    if (t1 >= 0 && t2 >= 0) {
        const ln = through(l, t1, t2);
        if (ln.y1 > 0) lines.push({ kind: "sup", ...ln });
    }
    return lines.length ? lines.map(x => ({ ...x, y0: r2(x.y0), y1: r2(x.y1) })) : null;
}

// Cup: stuknięcie = dołek. Lewy brzeg = najwyższy High do `lookback` świec przed dołkiem, prawy = najwyższy High po dołku.
// Zwraca { start, low_date, end, peak, low, right } albo null (brak sensownej miseczki: za mało świec, płytka, dołek na brzegu).
function annTemplateCup(h, l, dates, tapIdx, last, lookback) {
    const b = annExtreme(l, tapIdx - 3, Math.min(last, tapIdx + 3), false);
    if (b < 0) return null;
    const a = annExtreme(h, b - lookback, b - 3, true);
    const c = annExtreme(h, b + 3, last, true);
    if (a < 0 || c < 0 || !(a < b && b < c)) return null;
    if (!(h[a] > l[b] * 1.05)) return null;
    return { start: dates[a], low_date: dates[b], end: dates[c], peak: h[a], low: l[b], right: h[c] };
}

// ---------- stop i cel pozycji jako zwykłe linie z alertem ----------
// Stop (alert „pod linią”) i cel (alert „nad linią”) to poziome linie z polem pos = "stop" | "target": widać je na wykresie,
// przebicie trafia do zakładki Alerty. Zmiana lub usunięcie pozycji aktualizuje/usuwa linie (z nagrobkiem, żeby synchronizacja ich nie przywróciła).
// Dopasowanie linii do świec: każdy koniec linii przeskakuje na NAJBLIŻSZY szczyt (High) albo dołek (Low) w oknie ±k świec od miejsca, w które
// użytkownik wskazał (koszt = odległość w świecach + odległość ceny), a para końców musi być „czysta” — żadna świeca między nimi nie przebija
// linii o więcej niż tol (opór po High, wsparcie po Low). Gdy najlepsza para przebija, bierzemy najtańszą czystą z kilku kandydatów; gdy takiej
// nie ma, zostają najbliższe ekstrema, a `pierce` mówi, ile świec przebija. Zwraca {x0,y0,x1,y1,kind,pierce,types} albo null (za mało świec).
function annFitLine(line, h, l, dates, k = 3, tol = 0.008) {
    const n = dates.length;
    if (!n || !h || !l) return null;
    const at = d => { const i = dates.findIndex(x => x >= d); return i < 0 ? n - 1 : i; };
    const i0 = at(line.x0), i1 = at(line.x1);
    const cands = (i, price) => {
        const out = [];
        for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) {
            [["h", h[j]], ["l", l[j]]].forEach(([t, v]) => {
                if (Number.isFinite(v) && v > 0) out.push({ j, t, v, cost: Math.abs(j - i) / k + Math.abs(v / price - 1) * 100 / 2 });
            });
        }
        return out.sort((a, b) => a.cost - b.cost).slice(0, 8);
    };
    let A = cands(i0, line.y0), B = cands(i1, line.y1);
    if (!A.length || !B.length) return null;
    // intencja użytkownika = rodzaj najbliższych ekstremów: gdy oba końce celowały w szczyty (albo w dołki), rozważamy tylko ten rodzaj
    // (linia wsparcia nie zamieni się po cichu w linię oporu tylko dlatego, że ta jest „czystsza”)
    if (A[0].t === B[0].t) { const T = A[0].t; A = A.filter(c => c.t === T); B = B.filter(c => c.t === T); }
    const pierces = (a, b) => {
        if (a.t !== b.t) return 999;   // para szczyt + dołek to nie linia trendu — tylko ostateczność
        if (b.j <= a.j) return 0;
        let bad = 0;
        for (let t = a.j; t <= b.j; t++) {
            const v = a.v + (b.v - a.v) * (t - a.j) / (b.j - a.j);
            if (a.t === "h" ? h[t] > v * (1 + tol) : l[t] < v * (1 - tol)) bad++;
        }
        return bad;
    };
    let best = null;
    A.forEach(a => B.forEach(b => {
        if (b.j <= a.j) return;
        const bad = pierces(a, b), cost = a.cost + b.cost;
        if (!best || (bad === 0 && best.bad > 0) || (bad === 0) === (best.bad === 0) && (bad === 0 ? cost < best.cost : bad < best.bad || (bad === best.bad && cost < best.cost))) best = { a, b, bad, cost };
    }));
    if (!best) return null;
    const { a, b } = best;
    const kind = a.t === "h" && b.t === "h" ? "res" : a.t === "l" && b.t === "l" ? "sup" : line.kind;
    return { x0: dates[a.j], y0: Math.round(a.v * 100) / 100, x1: dates[b.j], y1: Math.round(b.v * 100) / 100, kind, pierce: best.bad, types: a.t + b.t };
}

function annSyncPositionLines(store, ticker, pos, asOf, now = new Date()) {
    const R = store[ticker] || (store[ticker] = annEmptyRecord());
    const want = { stop: pos && pos.stop > 0 ? pos.stop : null, target: null };   // cel (take profit) usunięty na życzenie — użytkownik sam śledzi wyjście; stare linie celu znikają (nagrobek)
    const x0 = new Date(Date.parse(asOf + "T00:00:00Z") - 30 * 86400000).toISOString().slice(0, 10);
    ["stop", "target"].forEach(which => {
        const idx = R.lines.findIndex(l => l.pos === which);
        if (want[which] === null) {
            if (idx >= 0) { const [gone] = R.lines.splice(idx, 1); R.del = { ...(R.del || {}), [gone.id]: now.toISOString() }; }
            return;
        }
        if (idx >= 0) { R.lines[idx].y0 = want[which]; R.lines[idx].y1 = want[which]; R.lines[idx].ack = false; }
        else R.lines.push({ id: annNewId(), kind: which, pos: which, x0, y0: want[which], x1: asOf, y1: want[which], alert: which === "stop" ? "below" : "above", ext: true, log: false });
    });
    R.editedAt = now.toISOString();
    return R;
}

// Aktualna wartość linii stopu / celu (użytkownik mógł ją przeciągnąć na wykresie) albo null.
function annPositionLineValue(store, ticker, which) {
    const line = store[ticker] && (store[ticker].lines || []).find(l => l.pos === which);
    return line ? line.y0 : null;
}

// ---------- cofnij (historia zmian linii i cupów jednej spółki) ----------
// Migawka = linie, cupy i flagi ukrycia automatów; notatki nie wchodzą (pisanie nie zapełnia historii).
function annUndoSnapshot(rec) {
    const r = rec || {};
    return JSON.parse(JSON.stringify({ lines: r.lines || [], cups: r.cups || [], pen: r.pen || [], hideAutoLines: !!r.hideAutoLines, hideAutoCups: !!r.hideAutoCups }));
}

// Przywraca migawkę. Obiekty, które przez cofnięcie znikają, dostają nagrobek (inaczej wróciłyby z synchronizacji z drugiego urządzenia),
// a przywrócone tracą nagrobek.
function annUndoApply(rec, snap, now = new Date()) {
    const snapPen = snap.pen || [];
    const keep = new Set([...snap.lines, ...snap.cups, ...snapPen].map(x => x.id));
    const del = { ...(rec.del || {}) };
    [...rec.lines, ...rec.cups, ...(rec.pen || [])].forEach(x => { if (!keep.has(x.id)) del[x.id] = now.toISOString(); });
    keep.forEach(id => { delete del[id]; });
    rec.lines = snap.lines; rec.cups = snap.cups; rec.pen = snapPen;
    rec.hideAutoLines = snap.hideAutoLines; rec.hideAutoCups = snap.hideAutoCups;
    rec.del = del;
    rec.editedAt = now.toISOString();
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
        out[t] = { ...annEmptyRecord(), ...r, lines: Array.isArray(r.lines) ? r.lines : [], cups: Array.isArray(r.cups) ? r.cups : [], pen: Array.isArray(r.pen) ? r.pen : [], editedAt: new Date().toISOString() };
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
    return { ...other, ...base, lines: union("lines"), cups: union("cups"), pen: union("pen"), del, editedAt: base.editedAt || other.editedAt || null };
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
    return { ...annEmptyRecord(), pen: (rec && rec.pen) || [], del, editedAt: now.toISOString() };   // odręczne rysunki zostają
}

function annExportJson(store, now = new Date()) {
    return JSON.stringify({ version: 1, exportedAt: now.toISOString(), annotations: store }, null, 1);
}

// ---------- stan, zapis ----------

let annStore = {};
const ANN_PEN_COLOR = "#ffd54a";
const ANN_PEN_MAX_PTS = 800;
const annPen = { on: false };   // tryb odręcznego rysowania (osobny od Linia / Cup): rec.pen = [{ id, pts: [[data, ułamek świecy, cena], ...] }]
const annEdit = { on: false, mode: null, spaceOn: false, tool: null, selected: null, kind: "res", alert: "", ext: false, pending: [], cursor: null, spaceHeld: false, menuOpen: false, lastTap: null, pad: null, padTicker: null, kindSet: false };
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

const annUndo = { ticker: null, stack: [], base: "" };   // historia aktualnie otwartej spółki; base = stan po ostatniej zmianie
const ANN_UNDO_MAX = 40;
const annUndoState = ticker => JSON.stringify(annUndoSnapshot(annStore[ticker]));

// Zmiana linii / cupów od ostatniego zapisu => poprzedni stan trafia na stos (jeden wpis na gest, bo zapis jest po puszczeniu palca).
function annTrack() {
    if (!annUndo.ticker) return;
    const now = annUndoState(annUndo.ticker);
    if (now === annUndo.base) return;
    annUndo.stack.push(annUndo.base);
    if (annUndo.stack.length > ANN_UNDO_MAX) annUndo.stack.shift();
    annUndo.base = now;
}

function annUndoFor(ticker) {
    if (annUndo.ticker === ticker) return;
    annUndo.ticker = ticker; annUndo.stack = []; annUndo.base = annUndoState(ticker);
}

function annUndoRun() {
    const t = annUndo.ticker;
    if (!t || !annUndo.stack.length) return false;
    const R = annRecord(t, true);
    annUndoApply(R, JSON.parse(annUndo.stack.pop()));
    annUndo.base = annUndoState(t);
    annEdit.selected = null; annEdit.pending = []; annEdit.cursor = null;
    annWriteLocal(); annOnSave(); annSyncTools();
    if (annCurrent) annCurrent.render();
    return true;
}

function annSave() {
    annTrack();
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
const ANN_TOUCH_MODE_PX = 30;   // w trybie Linia / Cup promień jest nieco mniejszy, żeby dało się założyć nowy obiekt tuż obok istniejącego
const ANN_TOUCH_PX = 38;   // promień (px ekranu), w którym dotyk „łapie” najbliższą linię / cup / uchwyt
const ANN_PAD_OFFSET_PX = 70;    // touchpad: pierwszy kursor pojawia się tyle px NAD palcem (palec nie zasłania punktu)
const ANN_PAD_MOVE_PX = 8;       // ruch palca większy niż tyle px przesuwa kursor; krótsze stuknięcie stawia punkt
const ANN_SNAP_TOUCH_PX = 38;    // magnet na dotyku: High / Low / Close świecy w tym promieniu od kursora przyciąga punkt

function annOverlay(ctx) {
    const { plot, m, geom, ticker } = ctx;
    const editing = annEdit.on && !ctx.readonly;      // w siatce wykresów edytować można tylko pierwszy (zaznaczony) wykres
    const clipId = "annClip" + (ctx.uid || "");
    const L = geom.L;
    plot.style.position = "relative";
    const ov = document.createElementNS(SVG_NS, "svg");
    const penOn = annPen.on && !ctx.readonly && !editing;
    ov.setAttribute("class", "chart-overlay" + (editing ? " editing" : "") + (penOn ? " pen-on" : ""));
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
    // Punkt na wykresie (magnet jak w TradingView): x przyciągany do świecy, a cena do High / Low świec w okolicy (±3; Close celowo pominięty —
    // dla linii trendu ważne są szczyty i dołki, a zamknięcie leżące tuż pod High przejmowało punkt),
    // jeśli któryś jest dość blisko kursora (na dotyku promień większy); inaczej cena swobodna. Promień liczony w pikselach ekranu.
    const pxScale = () => { const r = ov.getBoundingClientRect(); return Math.min(r.width / L.width, r.height / L.height) || 1; };
    const snap = p => {
        const idx = Math.max(0, Math.min(m.n - 1, Math.round((p.x - L.left) / geom.step - 0.5)));
        const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        const near = (coarse ? ANN_SNAP_TOUCH_PX : 14) / pxScale();
        let best = null;
        for (let j = Math.max(0, idx - 3); j <= Math.min(m.n - 1, idx + 3); j++) {
            [m.h[j], m.l[j]].forEach(v => {
                if (!Number.isFinite(v)) return;
                const d = Math.hypot(p.x - geom.x(j), p.y - geom.yP(v));
                if (d <= near && (!best || d < best.d)) best = { d, j, v };
            });
        }
        if (best) return { date: m.weeks[best.j], price: r2(best.v) };
        return { date: m.weeks[idx], price: r2(priceOfY(Math.max(L.price.y, Math.min(L.price.y + L.price.h, p.y)))) };
    };
    if (annEdit.padTicker !== ticker) { annEdit.pad = null; annEdit.padTicker = ticker; }   // kursor touchpada nie przechodzi na inną spółkę
    const padClamp = q => ({ x: Math.max(L.left, Math.min(plotRight, q.x)), y: Math.max(L.price.y, Math.min(L.price.y + L.price.h, q.y)) });

    // Szablony: jedno stuknięcie. flag = początek konsolidacji, cuptap = dołek miseczki. Wynik jest zwykłymi, edytowalnymi obiektami.
    const full = ctx.full;
    const applyTemplate = (tool, pt) => {
        const R = annRecord(ticker, true);
        const i = Math.max(0, Math.min(full.lastIdx, Math.round(dateToIndex(full.weeks, pt.date))));
        const done = (sel, text) => { R.editedAt = new Date().toISOString(); annEdit.selected = sel; annEdit.pending = []; annEdit.cursor = null; annEdit.tool = annEdit.mode; annSave(); annSyncTools(); showToast(text); };
        if (tool === "flag") {
            const lines = annTemplateFlag(full.h, full.l, full.weeks, i, full.lastIdx);
            if (!lines) { showToast("Za mało świec od tego miejsca — stuknij wcześniej (początek konsolidacji)."); return; }
            let first = null;
            lines.forEach(ln => {
                const line = { id: annNewId(), ...ln, alert: ln.kind === "res" ? "above" : null, log: !!geom.useLog, ext: false, tpl: "flag" };
                R.lines.push(line);
                if (!first) first = line;
            });
            done({ type: "line", id: first.id }, "Flaga: opór (z alertem „nad linią”) i wsparcie — popraw końce kółkami.");
        } else {
            const cup = annTemplateCup(full.h, full.l, full.weeks, i, full.lastIdx, full.daily ? 150 : 45);
            if (!cup) { showToast("Nie widzę miseczki wokół tego dołka — stuknij w najniższy punkt po wyraźnym szczycie."); return; }
            const c = { id: annNewId(), ...cup, tpl: "cup" };
            R.cups.push(c);
            done({ type: "cup", id: c.id }, "Cup: lewy brzeg, dołek i prawy brzeg — popraw uchwytami.");
        }
    };
    const isTemplate = () => annEdit.tool === "flag" || annEdit.tool === "cuptap";

    // Shift = linia pozioma: druga cena = cena pierwszego punktu (kąt 0°)
    const level = (pt, ref, ev) => (ev && ev.shiftKey && ref ? { date: pt.date, price: ref.price } : pt);

    const pts2s = pts => pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

    let penLive = [];   // pociągnięcie w trakcie rysowania
    const markup = () => {
        const R = rec();
        const sel = annEdit.selected;
        const h = geom.fs(window.matchMedia && window.matchMedia("(pointer: coarse)").matches ? 11 : 7);
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
            // cena linii na końcu (dziś, jeśli linia sięga ostatniej świecy) — wiadomo, gdzie na TradingView szukać przebicia
            let lastReal = m.n - 1;
            while (lastReal > 0 && !Number.isFinite(m.h[lastReal])) lastReal--;
            const reachesNow = ext.length > 1 || i1 >= lastReal;
            const endPrice = reachesNow ? lineValueAt(line, m.weeks[lastReal]) : line.y1;
            if (Number.isFinite(endPrice) && endPrice > 0) {
                const ex = ext.length > 1 ? ext[1][0] : b[0];
                const lx = Math.min(plotRight - 4, Math.max(L.left + 30, ex));
                const ly = Math.max(L.price.y + geom.fs(12), Math.min(L.price.y + L.price.h - 4, geom.yP(endPrice) - 5));
                body += `<text x="${lx}" y="${ly}" font-size="${geom.fs(11)}" font-weight="700" fill="${col}" text-anchor="end" stroke="#0e0f13" stroke-width="3" paint-order="stroke" pointer-events="none">${endPrice.toFixed(2)}</text>`;
            }
            // stop loss 5 % i 8 % pod linią bazy (O'Neil: sprzedaj przy stracie 7–8 % od zakupu, nie więcej) — tylko dla linii oporu (pivot)
            if (line.kind === "res" && !line.pos && Number.isFinite(endPrice) && endPrice > 0) {
                const ex = ext.length > 1 ? ext[1][0] : b[0];
                const x0 = Math.min(plotRight - 60, Math.max(L.left + 30, ex - geom.fs(70)));
                [[0.05, "−5%"], [0.08, "−8%"]].forEach(([pct, txt]) => {
                    const lvl = endPrice * (1 - pct), y = geom.yP(lvl);
                    if (!(y > L.price.y && y < L.price.y + L.price.h)) return;
                    body += `<line x1="${x0}" x2="${plotRight - 4}" y1="${y}" y2="${y}" stroke="${ANN_COLORS.stop}" stroke-width="1.3" stroke-dasharray="5 4" pointer-events="none"/>`
                        + `<text x="${plotRight - 6}" y="${y + geom.fs(12)}" font-size="${geom.fs(10)}" font-weight="700" fill="${ANN_COLORS.stop}" text-anchor="end" stroke="#0e0f13" stroke-width="3" paint-order="stroke" pointer-events="none">stop ${txt} ${lvl.toFixed(2)}</text>`;
                });
            }
            const hasNote = !!(line.note && line.note.trim());
            if (hasNote) {
                // ikona notatki z lewej strony na początku linii; najechanie na linię lub ikonę (dotyk: stuknięcie ikony) pokazuje treść
                const ix = Math.max(L.left + 12, a[0] - geom.fs(14)), iy = a[1];
                if (!editing) body += `<polyline data-nline="${line.id}" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke" points="${pts2s([a, b])}"/>`;
                body += `<g data-nline="${line.id}" class="ann-note-icon" style="cursor:pointer" pointer-events="all"><circle cx="${ix}" cy="${iy}" r="${geom.fs(9)}" fill="#0e0f13" stroke="${col}" stroke-width="1.3"/><text x="${ix}" y="${iy + geom.fs(4)}" font-size="${geom.fs(11)}" text-anchor="middle" pointer-events="none">📝</text></g>`;
            }
            if (line.alert) body += `<text x="${Math.min(plotRight - 12, Math.max(L.left + 12, b[0] + 4))}" y="${b[1] - 6}" font-size="${geom.fs(13)}" text-anchor="middle">🔔</text>`;
            if (editing && (!annEdit.mode || annEdit.mode === "line")) {
                body += `<polyline data-line="${line.id}" fill="none" stroke="transparent" stroke-width="16" pointer-events="stroke" style="cursor:move" points="${pts2s([a, b])}"/>`;
                if (isSel) body += `<circle data-handle="a" data-line="${line.id}" cx="${a[0]}" cy="${a[1]}" r="${h}" fill="#0e0f13" stroke="${col}" stroke-width="2.5"/>`
                    + `<circle data-handle="b" data-line="${line.id}" cx="${b[0]}" cy="${b[1]}" r="${h}" fill="#0e0f13" stroke="${col}" stroke-width="2.5"/>`;
            }
        });
        const penXY = pts => pts.map(q => [geom.x(idxOf(q[0]) + q[1]), geom.yP(q[2])]);
        const penLine = pts => `<polyline fill="none" stroke="${ANN_PEN_COLOR}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" points="${pts2s(penXY(pts))}"/>`;
        (R && R.pen ? R.pen : []).forEach(st => { if (st.pts && st.pts.length > 1) body += penLine(st.pts); });
        if (penLive.length > 1) body += penLine(penLive);
        (R ? R.cups : []).forEach(cu => {
            const cup = { i0: idxOf(cu.start), iLow: idxOf(cu.low_date), i1: idxOf(cu.end), peak: cu.peak, low: cu.low, right: cu.right };
            const { pts, yL, yB, yR } = cupArcPoints(cup, geom.x, geom.yP);
            const depth = cu.peak > 0 ? ((cu.peak - cu.low) / cu.peak * 100).toFixed(1) : "?";
            const isSel = sel && sel.type === "cup" && sel.id === cu.id;
            body += `<polyline fill="none" stroke="${ANN_COLORS.cup}" stroke-width="${isSel ? 3.2 : 2}" stroke-linecap="round" points="${pts2s(pts)}"><title>Cup −${depth}% (własny)</title></polyline>`;
            const cx = Math.min(Math.max(geom.x((cup.i0 + cup.i1) / 2), L.left + 24), plotRight - 24);
            body += `<text x="${cx}" y="${yB - (yB - Math.min(yL, yR)) * 0.35}" font-size="${geom.fs(12)}" font-weight="700" fill="${ANN_COLORS.cup}" text-anchor="middle" stroke="#0e0f13" stroke-width="3" paint-order="stroke">−${depth}%</text>`;
            if (editing && (!annEdit.mode || annEdit.mode === "cup")) {
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
        // kursor touchpada: krzyżyk w miejscu, w którym PRZYCIĄGNIE się punkt (to samo liczy stuknięcie), z podpisem daty i ceny
        if (editing && annEdit.pad && (annEdit.tool === "line" || annEdit.tool === "cup" || isTemplate())) {
            const sn = snap(annEdit.pad), sx = geom.x(idxOf(sn.date)), sy = geom.yP(sn.price), fsz = geom.fs(11);
            const lbl = `${sn.date.slice(5)}  ${sn.price.toFixed(2)}`;
            const tx = Math.max(L.left + 4, Math.min(plotRight - 4, sx)), anchor = sx > (L.left + plotRight) / 2 ? "end" : "start";
            body += `<g pointer-events="none"><line x1="${L.left}" x2="${plotRight}" y1="${sy}" y2="${sy}" stroke="#fff" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="4 3"/>`
                + `<line x1="${sx}" x2="${sx}" y1="${L.price.y}" y2="${L.price.y + L.price.h}" stroke="#fff" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="4 3"/>`
                + `<circle cx="${sx}" cy="${sy}" r="${h * 0.9}" fill="none" stroke="#ffd54a" stroke-width="2.2"/><circle cx="${sx}" cy="${sy}" r="2.2" fill="#ffd54a"/>`
                + `<text x="${tx + (anchor === "end" ? -8 : 8)}" y="${Math.max(L.price.y + fsz + 2, sy - 10)}" font-size="${fsz}" font-weight="700" fill="#ffd54a" text-anchor="${anchor}" stroke="#0e0f13" stroke-width="3" paint-order="stroke">${lbl}</text></g>`;
        }
        const catcher = penOn ? `<rect class="pen-catch" x="${L.left}" y="${L.price.y}" width="${plotRight - L.left}" height="${L.price.h}" fill="transparent"/>` : editing ? `<rect class="ann-catch" x="${L.left}" y="${L.price.y}" width="${plotRight - L.left}" height="${L.price.h}" fill="transparent"/>` : "";
        return `<defs><clipPath id="${clipId}"><rect x="${L.left}" y="${L.price.y}" width="${plotRight - L.left}" height="${L.price.h}"/></clipPath></defs>${catcher}<g clip-path="url(#${clipId})">${body}</g>`;
    };
    // Lupa: podczas przeciągania punktu (palec zasłania miejsce) w rogu wykresu pojawia się powiększony fragment wokół palca
    // z krzyżykiem i kropką tam, gdzie punkt faktycznie się przyciągnie (do High/Low świecy).
    let loupe = null, chartHtml = null;
    const loupeMarkup = () => {
        if (!loupe) return "";
        if (chartHtml === null) { const el = plot.querySelector("svg:not(.chart-overlay)"); chartHtml = el ? el.innerHTML : ""; }
        const Z = 2.2, R = geom.fs(62), pad = geom.fs(8);
        const raw = loupe.raw, sn = loupe.snap;
        const left = L.left + pad + R, right = plotRight - pad - R;
        const nearLeft = raw.x < left + R + geom.fs(40) && raw.y < L.price.y + 2 * R + geom.fs(40);
        const cx = nearLeft ? right : left, cy = L.price.y + pad + R;
        const dx = cx + (sn.x - raw.x) * Z, dy = cy + (sn.y - raw.y) * Z;
        const id = clipId + "Loupe";
        return `<defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>`
            + `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#0e0f13"/>`
            + `<g clip-path="url(#${id})"><g transform="translate(${cx - raw.x * Z} ${cy - raw.y * Z}) scale(${Z})">${chartHtml}</g>`
            + `<line x1="${cx - R}" x2="${cx + R}" y1="${cy}" y2="${cy}" stroke="#fff" stroke-opacity="0.35"/><line y1="${cy - R}" y2="${cy + R}" x1="${cx}" x2="${cx}" stroke="#fff" stroke-opacity="0.35"/>`
            + `<circle cx="${dx}" cy="${dy}" r="${geom.fs(4)}" fill="#ff5a5a" stroke="#fff" stroke-width="1.2"/></g>`
            + `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#9fb3c8" stroke-width="2" pointer-events="none"/>`;
    };
    const showLoupe = (rawPt, snapped) => {
        const idx = idxOf(snapped.date);
        loupe = { raw: rawPt, snap: { x: geom.x(idx), y: geom.yP(snapped.price) } };
    };
    const render = () => { ov.innerHTML = markup() + loupeMarkup(); };
    if (!ctx.readonly) { annUndoFor(ticker); annCurrent = { render, ticker, full: ctx.full }; }
    render();
    // Dotyk bez trybu edycji: podwójne stuknięcie w wykres włącza edycję i od razu pokazuje wybór „linia / cup”
    if (!editing && !ctx.readonly && !plot.dataset.annDbl) {
        plot.dataset.annDbl = "1";
        let last = null;
        plot.addEventListener("pointerdown", ev => {
            if (ev.pointerType === "mouse" || annEdit.on || annPen.on) return;
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
    if (penOn) {
        const penPoint = p => {
            const raw = (p.x - L.left) / geom.step - 0.5;
            const i = Math.max(0, Math.min(m.n - 1, Math.round(raw)));
            return [m.weeks[i], Math.max(-0.5, Math.min(0.5, Math.round((raw - i) * 100) / 100)), r2(priceOfY(Math.max(L.price.y, Math.min(L.price.y + L.price.h, p.y))))];
        };
        ov.addEventListener("pointerdown", ev => {
            if (ev.pointerType === "mouse" && ev.button !== 0) return;
            ev.preventDefault();
            ov.setPointerCapture(ev.pointerId);
            let last = toSvg(ev);
            penLive = [penPoint(last)];
            const move = e => {
                const p = toSvg(e);
                if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5 || penLive.length >= ANN_PEN_MAX_PTS) return;
                last = p; penLive.push(penPoint(p)); render();
            };
            const up = () => {
                ov.removeEventListener("pointermove", move); ov.removeEventListener("pointerup", up); ov.removeEventListener("pointercancel", up);
                const pts = penLive; penLive = [];
                if (pts.length > 1) {
                    const R = annRecord(ticker, true);
                    if (!Array.isArray(R.pen)) R.pen = [];
                    R.pen.push({ id: annNewId(), pts });
                    R.editedAt = new Date().toISOString();
                    annSave(); annSyncTools();
                }
                render();
            };
            ov.addEventListener("pointermove", move); ov.addEventListener("pointerup", up); ov.addEventListener("pointercancel", up);
        });
        return;
    }
    if (!editing) return;

    const touch = () => { const R = rec(); if (R) R.editedAt = new Date().toISOString(); annSave(); };
    const finishPending = () => {
        const R = annRecord(ticker, true), P = annEdit.pending;
        if (annEdit.tool === "line" && P.length === 2) {
            const [p, q] = P[0].date <= P[1].date ? [P[0], P[1]] : [P[1], P[0]];
            if (p.date !== q.date) {
                const line = { id: annNewId(), kind: annEdit.kind, x0: p.date, y0: p.price, x1: q.date, y1: q.price, alert: annEdit.alert || null, log: !!geom.useLog, ext: annEdit.ext };
                const fit = annFitLine(line, full.h, full.l, full.weeks, full.daily ? 3 : 2);   // nowa linia od razu siada na szczytach / dołkach i nie jest przebijana
                if (fit) { Object.assign(line, { x0: fit.x0, y0: fit.y0, x1: fit.x1, y1: fit.y1, kind: fit.kind === line.kind || annEdit.kindSet ? line.kind : fit.kind }); if (fit.pierce) showToast(`Dopasowano do świec, ale ${fit.pierce} świec przebija linię — sprawdź ustawienie.`); }
                R.lines.push(line);
                annEdit.selected = { type: "line", id: line.id };
            }
            annEdit.pending = []; annEdit.tool = annEdit.mode; touch(); annSyncTools(); annLeaveSpace();
        } else if (annEdit.tool === "cup" && P.length === 3) {
            const [a, b, c] = P;
            if (a.date < b.date && b.date < c.date) {
                const cup = { id: annNewId(), start: a.date, low_date: b.date, end: c.date, peak: a.price, low: Math.min(b.price, a.price), right: c.price };
                R.cups.push(cup);
                annEdit.selected = { type: "cup", id: cup.id };
            }
            annEdit.pending = []; annEdit.tool = annEdit.mode; touch(); annSyncTools(); annLeaveSpace();
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

    // Dotyk: palec jest gruby i zasłania cel, więc zamiast trafiać w cienką linię, wybieramy NAJBLIŻSZY element (uchwyt zaznaczonego
    // obiektu, linię albo cup) w promieniu ~30 px od palca; dopiero gdy nic nie jest blisko, dotyk traktujemy jak puste miejsce.
    const distSeg = (p, a, b) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
        const f = len2 ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / len2)) : 0;
        return Math.hypot(p.x - (a[0] + f * dx), p.y - (a[1] + f * dy));
    };
    const pickNear = p => {
        const rect = ov.getBoundingClientRect();
        const scale = Math.min(rect.width / L.width, rect.height / L.height) || 1;
        const thr = (annEdit.mode ? ANN_TOUCH_MODE_PX : ANN_TOUCH_PX) / scale;
        const R = rec();
        if (!R) return null;
        const lineOk = !annEdit.mode || annEdit.mode === "line", cupOk = !annEdit.mode || annEdit.mode === "cup";
        let best = null;
        const consider = (d, hit) => { if (d <= thr && (!best || d < best.d)) best = { d, ...hit }; };
        const sel = annEdit.selected;
        // uchwyty zaznaczonego obiektu mają pierwszeństwo (łatwo je złapać, żeby przesuwać końce)
        if (sel && sel.type === "line" && lineOk) {
            const l = R.lines.find(x => x.id === sel.id);
            if (l) [["a", l.x0, l.y0], ["b", l.x1, l.y1]].forEach(([k, d, pr]) => consider(Math.hypot(p.x - geom.x(idxOf(d)), p.y - geom.yP(pr)) - thr * 0.35, { handle: k, target: sel }));
        } else if (sel && sel.type === "cup" && cupOk) {
            const c = R.cups.find(x => x.id === sel.id);
            if (c) [["L", c.start, c.peak], ["B", c.low_date, c.low], ["R", c.end, c.right]].forEach(([k, d, pr]) => consider(Math.hypot(p.x - geom.x(idxOf(d)), p.y - geom.yP(pr)) - thr * 0.35, { handle: k, target: sel }));
        }
        // końce KAŻDEJ linii (nie tylko zaznaczonej) łapie się od razu za uchwyt — przesuwa się wtedy jeden koniec, a nie cała linia
        if (lineOk) R.lines.forEach(l => {
            [["a", l.x0, l.y0], ["b", l.x1, l.y1]].forEach(([k, d, pr]) => consider(Math.hypot(p.x - geom.x(idxOf(d)), p.y - geom.yP(pr)) - thr * 0.35, { handle: k, target: { type: "line", id: l.id } }));
            consider(distSeg(p, [geom.x(idxOf(l.x0)), geom.yP(l.y0)], [geom.x(idxOf(l.x1)), geom.yP(l.y1)]), { obj: { type: "line", id: l.id } });
        });
        if (cupOk) R.cups.forEach(cu => {
            const { pts } = cupArcPoints({ i0: idxOf(cu.start), iLow: idxOf(cu.low_date), i1: idxOf(cu.end), peak: cu.peak, low: cu.low, right: cu.right }, geom.x, geom.yP);
            for (let i = 1; i < pts.length; i++) consider(distSeg(p, pts[i - 1], pts[i]), { obj: { type: "cup", id: cu.id } });
        });
        return best;
    };

    ov.addEventListener("pointerdown", ev => {
        if (ev.pointerType === "mouse" && ev.button !== 0) return;   // prawy przycisk obsługuje menu kontekstowe
        const t = ev.target;
        const touchPtr = ev.pointerType !== "mouse";
        let handle = t.dataset && t.dataset.handle;
        let handleTarget = handle ? (t.dataset.line ? { type: "line", id: t.dataset.line } : { type: "cup", id: t.dataset.cup }) : null;
        let hitObj = t.dataset && (t.dataset.line || t.dataset.cup) ? (t.dataset.line ? { type: "line", id: t.dataset.line } : { type: "cup", id: t.dataset.cup }) : null;
        const placing = annEdit.pending.length > 0 || isTemplate();   // trwa stawianie punktów nowego obiektu / szablon — dotyk nie „łapie” istniejących
        if (touchPtr && (!annEdit.tool || annEdit.mode) && !placing && !handle && !hitObj) {
            const pk = pickNear(toSvg(ev));
            if (pk) { if (pk.handle) { handle = pk.handle; handleTarget = pk.target; } else hitObj = pk.obj; }
        }
        if (handle) {
            ev.preventDefault();
            const target = handleTarget;
            ov.setPointerCapture(ev.pointerId);
            // Względne przeciąganie: uchwyt rusza się o tyle, o ile przesunął się palec (bez „skoku” pod palec), a punkt dociąga magnes do High/Low/Close
            const R0 = rec(), obj0 = R0 && (target.type === "line" ? R0.lines.find(x => x.id === target.id) : R0.cups.find(x => x.id === target.id));
            const hd = { a: ["x0", "y0"], b: ["x1", "y1"], L: ["start", "peak"], B: ["low_date", "low"], R: ["end", "right"] }[handle];
            const grab = toSvg(ev), org = obj0 && hd ? { x: geom.x(idxOf(obj0[hd[0]])), y: geom.yP(obj0[hd[1]]) } : null;
            const move = e => {
                const f = toSvg(e);
                const raw = touchPtr && org ? { x: org.x + f.x - grab.x, y: org.y + f.y - grab.y } : f;
                let pt = snap(raw);
                const R = rec(), l = R && target.type === "line" ? R.lines.find(x => x.id === target.id) : null;
                if (l) pt = level(pt, { price: handle === "a" ? l.y1 : l.y0 }, e);
                dragTo(target, handle, pt); showLoupe(raw, pt); render();
            };
            const up = () => {
                ov.removeEventListener("pointermove", move); ov.removeEventListener("pointerup", up); ov.removeEventListener("pointercancel", up);
                loupe = null; render();
                touch(); annSyncTools();
            };
            ov.addEventListener("pointermove", move); ov.addEventListener("pointerup", up); ov.addEventListener("pointercancel", up);
            return;
        }
        if (hitObj && (!annEdit.tool || (annEdit.mode && !placing))) {
            annEdit.selected = hitObj;
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
        if (touchPtr && (annEdit.tool === "line" || annEdit.tool === "cup" || isTemplate())) {
            // TOUCHPAD (jak w TakeProfit / TradingView): kursor-krzyżyk jest osobno od palca. Pierwsze dotknięcie ustawia go ANN_PAD_OFFSET_PX nad palcem,
            // kolejne przesuwają go względnie (palec nie zasłania punktu); krótkie stuknięcie stawia punkt dokładnie tam, gdzie widać pierścień
            // (to samo liczy się z magnesu na High / Low / Close), więc nic nie „ucieka” po puszczeniu palca.
            ev.preventDefault();
            ov.setPointerCapture(ev.pointerId);
            const sc = pxScale(), start = toSvg(ev), t0 = Date.now();
            if (!annEdit.pad) annEdit.pad = padClamp({ x: start.x, y: start.y - ANN_PAD_OFFSET_PX / sc });
            const origin = { ...annEdit.pad };
            let moved = false;
            const preview = () => { annEdit.cursor = annEdit.pending.length ? level(snap(annEdit.pad), annEdit.pending[0], null) : null; };
            const stop = () => { ov.removeEventListener("pointermove", move); ov.removeEventListener("pointerup", up); ov.removeEventListener("pointercancel", cancel); };
            const move = e => {
                const f = toSvg(e), dx = f.x - start.x, dy = f.y - start.y;
                if (!moved && Math.hypot(dx, dy) * sc < ANN_PAD_MOVE_PX) return;
                moved = true;
                annEdit.pad = padClamp({ x: origin.x + dx, y: origin.y + dy });
                preview(); showLoupe(annEdit.pad, snap(annEdit.pad)); render();
            };
            const up = () => {
                stop(); loupe = null;
                if (!moved && Date.now() - t0 < 600) {
                    const pt = snap(annEdit.pad);
                    if (isTemplate()) applyTemplate(annEdit.tool, pt);
                    else { annEdit.pending.push(pt); annEdit.cursor = null; finishPending(); if (annEdit.pending.length) showToast("Punkt 1 postawiony — przesuń kursor i stuknij drugi."); }
                }
                preview(); render();
            };
            const cancel = () => { stop(); loupe = null; render(); };
            ov.addEventListener("pointermove", move); ov.addEventListener("pointerup", up); ov.addEventListener("pointercancel", cancel);
            render();
            return;
        }
        if (isTemplate()) {
            applyTemplate(annEdit.tool, snap(toSvg(ev)));
            loupe = null;
        } else if (annEdit.tool === "line" || annEdit.tool === "cup") {
            annEdit.pending.push(annEdit.tool === "line" && annEdit.pending.length === 1 ? level(snap(toSvg(ev)), annEdit.pending[0], ev) : snap(toSvg(ev)));
            annEdit.cursor = null;
            loupe = null;
            finishPending();
        } else if (touchPtr) {
            // dotyk bez narzędzia: puste miejsce tylko odznacza — nowe linie dodaje się z menu (podwójne stuknięcie), żeby nie rysować przypadkiem
            annEdit.pending = []; annEdit.selected = null; annSyncTools();
        } else {
            // bez narzędzia: przeciągnięcie po pustym wykresie rysuje linię (szybkie rysowanie, np. przy trzymanej spacji);
            // samo kliknięcie tylko odznacza
            const startPt = toSvg(ev), start = snap(startPt);
            ov.setPointerCapture(ev.pointerId);
            const move = e => { annEdit.pending = [start]; annEdit.cursor = level(snap(toSvg(e)), start, e); showLoupe(toSvg(e), annEdit.cursor); render(); };
            const up = e => {
                ov.removeEventListener("pointermove", move); ov.removeEventListener("pointerup", up); ov.removeEventListener("pointercancel", up);
                loupe = null;
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
        showLoupe(toSvg(ev), annEdit.cursor);
        render();
    });
    ov.addEventListener("pointerleave", () => { if (loupe) { loupe = null; render(); } });
    // Prawy przycisk (na dotyku: długie przytrzymanie): menu linii/cupa albo — na pustym wykresie — wybór „linia / cup”
    ov.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        const t = ev.target;
        if (annEdit.tool && !annEdit.mode) return;
        if (t.dataset && (t.dataset.line || t.dataset.cup)) {
            annEdit.selected = t.dataset.line ? { type: "line", id: t.dataset.line } : { type: "cup", id: t.dataset.cup };
            annSyncTools(); render();
            annObjectMenu(ev.clientX, ev.clientY);
        } else if (!annEdit.mode) annAddMenu(ev.clientX, ev.clientY);
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
        { label: "📐 Dopasuj do świec (szczyty / dołki)", run: () => {
            const f = annCurrent && annCurrent.full ? annFitLine(line, annCurrent.full.h, annCurrent.full.l, annCurrent.full.weeks, annCurrent.full.daily ? 3 : 2) : null;
            if (!f) { showToast("Za mało świec, żeby dopasować linię."); return; }
            Object.assign(line, { x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, kind: f.kind });
            annChanged();
            showToast(f.pierce ? `Dopasowano, ale ${f.pierce} świec nadal przebija linię.` : "Linia dopasowana: leży na szczytach / dołkach i nie jest przebijana.");
        } },
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
        null,
        { label: "🚩 Flaga: stuknij początek konsolidacji", run: pick("flag") },
        { label: "🏆 Cup: stuknij dołek", run: pick("cuptap") },
        { label: "⚡ Dodaj wykryte automatycznie", run: () => annAddAuto() },
    ]);
}

// Dodaje do własnych obiektów to, co wykrył algorytm w bieżącym widoku (bez duplikatów); alert „nad” na oporze flagi.
function annAddAuto() {
    if (!annCurrent) return;
    const R = annRecord(annCurrent.ticker, true);
    const auto = autoToDates(annCurrent.full);
    const same = (a, b) => a.x0 === b.x0 && a.x1 === b.x1 && a.kind === b.kind;
    let added = 0, first = null;
    auto.lines.forEach(l => {
        if (R.lines.some(x => same(x, l))) return;
        const line = { id: annNewId(), ...l, alert: l.kind === "res" ? "above" : null, ext: false, fromAuto: true, tpl: "auto" };
        R.lines.push(line); added++; first = first || { type: "line", id: line.id };
    });
    auto.cups.forEach(c => {
        if (R.cups.some(x => x.start === c.start && x.end === c.end)) return;
        const cup = { id: annNewId(), ...c, fromAuto: true, tpl: "auto" };
        R.cups.push(cup); added++; first = first || { type: "cup", id: cup.id };
    });
    if (!added) { showToast("Algorytm nie wykrył w tym widoku nowej flagi / korytarza / cupa (spróbuj widoku dziennego albo narysuj ręcznie)."); return; }
    R.editedAt = new Date().toISOString();
    annEdit.selected = first; annEdit.tool = annEdit.mode;
    annSave(); annSyncTools();
    if (annCurrent) annCurrent.render();
    showToast(`Dodano ${added} wykryte obiekty — popraw je uchwytami.`);
}

// Szablon z paska narzędzi: ustawia narzędzie i tryb zgodny z rodzajem obiektu (żeby nowy obiekt dał się od razu poprawiać).
function annPickTemplate(tool) {
    if (!annApi.setEdit) return;
    if (!annEdit.on || annEdit.spaceOn) annApi.setEdit(true, false);
    if (tool === "flag" && annEdit.mode === "cup") annEdit.mode = "line";
    if (tool === "cuptap" && annEdit.mode === "line") annEdit.mode = "cup";
    if (!annEdit.mode) annEdit.mode = tool === "cuptap" ? "cup" : "line";
    annEdit.tool = annEdit.tool === tool ? annEdit.mode : tool;   // ponowne naciśnięcie wyłącza szablon
    annEdit.pending = []; annEdit.selected = null; annEdit.cursor = null;
    annSyncTools();
    if (annCurrent) annCurrent.render();
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
    const box = document.querySelector(".wl-chart-box");
    if (box) box.classList.toggle("is-editing", annEdit.on && !annEdit.spaceOn);   // telefon: w trakcie rysowania chowamy opisy, wykres dostaje miejsce
    $("chartTools").hidden = !annEdit.on || annEdit.spaceOn;   // przy trzymanej spacji bez paska (nie przesuwa wykresu)
    $("chartLineBtn").classList.toggle("active", annEdit.mode === "line");
    $("chartCupBtn").classList.toggle("active", annEdit.mode === "cup");
    const obj = annSelectedObject();
    const isLine = obj && annEdit.selected.type === "line";
    $("kindSel").value = isLine ? obj.kind : annEdit.kind;
    $("alertSel").value = isLine ? (obj.alert || "") : annEdit.alert;
    $("extChk").checked = isLine ? obj.ext !== false : annEdit.ext;
    $("toolDel").disabled = !obj;
    if ($("toolUndo")) $("toolUndo").disabled = !annUndo.stack.length;
    if ($("toolFlag")) $("toolFlag").classList.toggle("active", annEdit.tool === "flag");
    if ($("toolCupTap")) $("toolCupTap").classList.toggle("active", annEdit.tool === "cuptap");
    if ($("chartPenBtn")) $("chartPenBtn").classList.toggle("active", annPen.on);
    if ($("chartPenClear")) { const R = annCurrent && annStore[annCurrent.ticker]; $("chartPenClear").hidden = !(annPen.on && R && R.pen && R.pen.length); }
    const fab = $("annUndoFab");
    if (fab) fab.hidden = !((annEdit.on || annPen.on) && annUndo.stack.length);
    if ($("toolFlat")) $("toolFlat").disabled = !isLine;
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    $("annHint").textContent = annEdit.mode === "line" && !annEdit.tool ? "Dotknij linię, by ją poprawić. Puste miejsce rysuje nową."
        : annEdit.mode === "cup" && !annEdit.tool ? "Dotknij cup, by go poprawić. Puste miejsce rysuje nowy (3 punkty)."
        : annEdit.tool === "flag" ? "🚩 Stuknij POCZĄTEK konsolidacji (po maszcie) — opór i wsparcie ułożą się same."
        : annEdit.tool === "cuptap" ? "🏆 Stuknij DOŁEK miseczki — brzegi dobiorą się same."
        : annEdit.tool === "line" ? (coarse ? "Przeciągnij palcem — krzyżyk przesuwa się osobno (przyciąga do High/Low/Close). STUKNIJ, by postawić punkt." : "Kliknij dwa punkty (przyciąga do High/Low); Shift = pozioma.")
        : annEdit.tool === "cup" ? (coarse ? "Trzy punkty: lewy brzeg, dołek, prawy brzeg. Przeciągnij, by ustawić krzyżyk; STUKNIJ, by postawić punkt." : "Trzy punkty: lewy brzeg, dołek, prawy brzeg.")
        : obj ? (coarse ? "Przeciągnij kółka, by poprawić; stuknięcie linii = menu (alert, typ, notatka)." : "Przeciągnij kółka, by poprawić (Shift = poziomo); prawy przycisk = menu.")
        : (coarse ? "Podwójne stuknięcie wykresu = wybór linia / cup / szablon." : "Przeciągnij po wykresie, by narysować linię; prawy przycisk = menu.");
    const R = annCurrent && annStore[annCurrent.ticker];
    $("annNote").value = R ? R.note || "" : "";
}

function annInitUI(onRedraw) {
    annOnRedraw = onRedraw;
    const $ = id => document.getElementById(id);
    if (!$("chartLineBtn")) return;
    const setEdit = (on, bySpace) => {
        annEdit.on = on;
        if (on) annPen.on = false;
        annEdit.spaceOn = on && bySpace;
        annEdit.mode = null;
        annEdit.tool = null; annEdit.pending = []; annEdit.selected = null; annEdit.cursor = null; annEdit.pad = null;
        if (on && annCurrent) {   // pierwsze wejście: przejmij automatyczne linie/cupy jako własne (z migawką algorytmu)
            const R = annRecord(annCurrent.ticker, true);
            const hadAuto = R.hideAutoLines || R.hideAutoCups;
            annAdoptAuto(R, annCurrent.full);
            if (!hadAuto) { annSave(); annUndo.stack = []; annUndo.base = annUndoState(annCurrent.ticker); }   // przejęcie automatów nie jest „zmianą do cofnięcia”
        }
        annSyncTools();
        annOnRedraw();
    };
    annApi.setEdit = setEdit;
    // Przyciski Linia / Cup: tryb pracy z jednym rodzajem obiektu — dotyk istniejącego edytuje go, dotyk pustego wykresu zakłada nowy.
    // Ponowne naciśnięcie aktywnego przycisku (albo Esc) kończy edycję.
    const setMode = mode => {
        if (annEdit.mode === mode) { setEdit(false, false); return; }
        if (!annEdit.on || annEdit.spaceOn) setEdit(true, false);
        annEdit.mode = mode; annEdit.tool = mode;
        annEdit.pending = []; annEdit.selected = null; annEdit.cursor = null; annEdit.pad = null;
        annSyncTools();
        if (annCurrent) annCurrent.render();
    };
    $("chartLineBtn").addEventListener("click", () => setMode("line"));
    $("chartCupBtn").addEventListener("click", () => setMode("cup"));
    // ✏️ Rysuj: dowolne pociągnięcia palcem / myszą; wyłącza tryb Linia / Cup (i odwrotnie)
    if ($("chartPenBtn")) {
        $("chartPenBtn").addEventListener("click", () => {
            const on = !annPen.on;
            if (on && annEdit.on) { annEdit.on = false; annEdit.spaceOn = false; annEdit.mode = null; annEdit.tool = null; annEdit.pending = []; annEdit.selected = null; annEdit.cursor = null; }
            annPen.on = on;
            annSyncTools();
            annOnRedraw();
        });
        $("chartPenClear").addEventListener("click", () => {
            const R = annCurrent && annStore[annCurrent.ticker];
            if (!R || !R.pen || !R.pen.length) return;
            const now = new Date().toISOString();
            R.del = { ...(R.del || {}) };
            R.pen.forEach(st => { R.del[st.id] = now; });
            R.pen = []; R.editedAt = now;
            annSave(); annSyncTools(); annCurrent.render();
        });
    }
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
    document.addEventListener("keydown", ev => { if (ev.key === "Escape") { if (annMenuEl) annCloseMenu(); else if (annNoteEl) annCloseNote(); else if (annEdit.mode && annEdit.pending.length) { annEdit.pending = []; annEdit.cursor = null; if (annCurrent) annCurrent.render(); } } });
    window.addEventListener("resize", annCloseMenu);
    if ($("toolUndo")) $("toolUndo").addEventListener("click", annUndoRun);
    if ($("annUndoFab")) $("annUndoFab").addEventListener("click", annUndoRun);
    if ($("toolFlag")) $("toolFlag").addEventListener("click", () => annPickTemplate("flag"));
    if ($("toolCupTap")) $("toolCupTap").addEventListener("click", () => annPickTemplate("cuptap"));
    if ($("toolAuto")) $("toolAuto").addEventListener("click", () => { if (!annEdit.on) setEdit(true, false); annAddAuto(); });
    document.addEventListener("keydown", ev => {   // Ctrl/Cmd+Z cofa ostatnią zmianę linii / cupów
        if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === "z" && annEdit.on && !typing(ev)) { ev.preventDefault(); annUndoRun(); }
    });
    if ($("toolFlat")) $("toolFlat").addEventListener("click", () => { const l = annSelectedLine(); if (l) { annFlatten(l); annChanged(); } });
    $("kindSel").addEventListener("change", () => {
        const obj = annSelectedObject();
        if (obj && annEdit.selected.type === "line") { obj.kind = $("kindSel").value; annSave(); } else { annEdit.kind = $("kindSel").value; annEdit.kindSet = true; }
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
        bizIndex, lineValueAt, alertState, annFlatten, mergeRecords, mergeStores, annResetRecord, autoToDates, annAdoptAuto, alertRows, annRefresh, mergeImport, annExportJson, annEmptyRecord, ANN_NEAR_PCT, annTemplateFlag, annTemplateCup, annFitLine, annUndoSnapshot, annUndoApply, annSyncPositionLines, annPositionLineValue,
    };
}
