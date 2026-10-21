// Strona: jedna lista (skan Finviz + warunki strategii) i jeden wykres tygodniowy — ta sama aplikacja co Momentum Desktop.
// Ctrl+K = dowolny symbol z listy albo z `symbols` w finviz_screen.json. Czyste funkcje na górze (testy w tests/js/app.test.js).
"use strict";

const COLUMNS = [ // [klucz, nagłówek, format]
    ["ticker", "Ticker", "s"], ["company", "Spółka", "s"], ["sector", "Sektor", "s"], ["price", "Cena", "p"],
    ["glb", "Green Line", "p"], ["glb_pct", "Do linii %", "%"], ["glb_state", "GLB", "s"], ["macd", "MACD", "s"], ["trend", "SMA 10>30", "b"],
    ["macd_stop", "Stop MACD", "p"], ["dopm", "Δ marża oper. pp", "%"], ["rev_rr", "Przychody r/r %", "%"],
    ["ps", "P/S", "x"], ["rs", "RS 52 tyg. pp", "%"], ["surp", "Niesp. EPS %", "%"], ["beat2", "2× nad konsensus", "b"], ["eps_rev", "Rewizja EPS 90 dni %", "%"], ["rvol_w", "RVol tyg.", "x"], ["rvol_d", "RVol dz.", "x"], ["quarter", "Kwartał", "s"], ["turnover", "Obrót mln $", "m"], ["ok", "Warunki", "b"],
    ["slow", "Hamuje", "w"],
];
const SIGNAL = ["WYBICIE", "SYGNAŁ"];
const TEXT_COLS = ["ticker", "company", "sector", "glb_state", "macd", "quarter", "slow"];
const SETTINGS_KEY = "momentum_glb_settings";
const ALERTS_KEY = "momentum_alerts";   // {lines, watch, log, seen}
const REPO = "https://github.com/agnar92/Momentum";

function cell(v, f) {
    if (v === null || v === undefined) return "";
    if (f === "p") return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (f === "%") return (v >= 0 ? "+" : "") + v.toFixed(1);
    if (f === "m") return (v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (f === "b") return v ? "✓" : "";
    if (f === "x") return v.toFixed(1);
    if (f === "w") return v === "HAMUJE+MB" ? "⚠⚠ + marża" : v ? "⚠ hamuje" : "";
    return String(v);
}

const isSignal = (r) => !!(r.ok && SIGNAL.includes(r.glb_state));

// najpierw spełniające warunki z sygnałem GLB, potem spełniające warunki; w grupie od największej siły względnej
function defaultCompare(a, b) {
    const key = (r) => [!isSignal(r), !r.ok, -(r.rs ?? -1e9)];
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
}

// puste wartości zawsze na końcu
function compareBy(key, dir) {
    return (a, b) => {
        const x = a[key], y = b[key];
        if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
        if (y === null || y === undefined) return -1;
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir;
    };
}

// ---------- filtry listy (wszystkie naraz, ORAZ) ----------
// filters = {kolumna: {in: [wartości]} | {min, max}}; kolumny tekstowe = wybór wartości, liczbowe = od / do w jednostkach tabeli (obrót w mln $)
const FILTER_CHOICES = { glb_state: ["WYBICIE", "SYGNAŁ", "NAD", "POD", "BRAK"], macd: ["nad", "pod"], ok: ["tak", "nie"], trend: ["tak", "nie"], beat2: ["tak", "nie"], slow: ["HAMUJE", "HAMUJE+MB", "—"] };
const FILTER_SCALE = { turnover: 1e6 };
const FILTER_PRESETS = [
    ["Sygnał kupna: warunki + 0–10 % nad GLB", { ok: { in: ["tak"] }, glb_state: { in: ["WYBICIE", "SYGNAŁ"] } }],
    ["Liderzy: RS 52 tyg. ≥ 50 pp + nad GLB", { rs: { min: 50 }, glb_state: { in: ["WYBICIE", "SYGNAŁ", "NAD"] } }],
    ["Przebicie GLB + SMA 10 > 30 (dowolnie wysoko)", { trend: { in: ["tak"] }, glb_state: { in: ["WYBICIE", "SYGNAŁ", "NAD"] } }],
    ["Aktywne: RVol tyg. ≥ 1,5 + nad GLB", { rvol_w: { min: 1.5 }, glb_state: { in: ["WYBICIE", "SYGNAŁ", "NAD"] } }],
    ["Nad GLB + MACD dodatni", { glb_state: { in: ["WYBICIE", "SYGNAŁ", "NAD"] }, macd: { in: ["nad"] } }],
    ["Sygnał kupna (0–10 % nad GLB) + MACD dodatni", { glb_state: { in: ["WYBICIE", "SYGNAŁ"] }, macd: { in: ["nad"] } }],
    ["Blisko linii (−10…+10 %)", { glb_pct: { min: -10, max: 10 } }],
];

const filterValue = (r, k) => (k === "ok" || k === "trend" || k === "beat2" ? (r[k] ? "tak" : "nie") : r[k] == null ? "—" : String(r[k]));

function passFilters(r, filters) {
    for (const [k, f] of Object.entries(filters || {})) {
        if (f.in && f.in.length && !f.in.includes(filterValue(r, k))) return false;
        if (f.min == null && f.max == null) continue;
        const v = r[k] == null ? null : r[k] / (FILTER_SCALE[k] || 1);
        if (v === null || (f.min != null && v < f.min) || (f.max != null && v > f.max)) return false;
    }
    return true;
}

const activeFilters = (filters) => Object.values(filters || {}).filter((f) => (f.in && f.in.length) || f.min != null || f.max != null).length;

function visibleRows(rows, opts) {
    const q = (opts.search || "").trim().toLowerCase();
    let out = rows.filter((r) => (!opts.onlyOk || r.ok) && (!opts.scanner || (r.scanners || []).includes(opts.scanner)) && passFilters(r, opts.filters) &&
        (!q || r.ticker.toLowerCase().includes(q) || (r.company || "").toLowerCase().includes(q)));
    out = out.slice().sort(opts.sort ? compareBy(opts.sort.key, opts.sort.dir) : defaultCompare);
    return out;
}

// tydzień świecy (Yahoo datuje go poniedziałkiem) nie był jeszcze zamknięty w chwili pobrania (przed sobotą)
function weekInProgress(weekDate, generatedAt) {
    if (!weekDate || !generatedAt) return false;
    return Date.parse(generatedAt) < Date.parse(weekDate + "T00:00:00Z") + 5 * 864e5;
}

const fileName = (t) => t.replace(/[^A-Za-z0-9.-]/g, "_") + ".json";   // jak watchlist.file_name

if (typeof module !== "undefined") module.exports = { COLUMNS, cell, defaultCompare, compareBy, visibleRows, fileName, isSignal, weekInProgress, passFilters, activeFilters, filterValue, FILTER_PRESETS };

// ---------- DOM ----------
if (typeof document !== "undefined") (function () {
    const $ = (id) => document.getElementById(id);
    const state = Object.assign({ onlyOk: true, sort: null, recent: [], nShow: null, filters: {}, exit: "MACD" }, readSettings());   // exit: MACD / GLB
    let data = { rows: [], symbols: [] }, shown = [], current = null, geom = null, series = null, end = null, drag = null;
    let sel = null, gest = null, rafId = 0, spxData = null;
    let period = "W", dShow = 260;   // W = tygodniowy, D = dzienny (tylko spółki nad Green Line, data/daily/; okno osobne, domyślnie rok)
    const curShow = () => (period === "D" ? dShow : state.nShow);
    const dailyCache = new Map();   // zaznaczona linia trendu, gest na wykresie
    const weeklyCache = new Map(), weeklyData = new Map();   // obietnice pobrania / gotowe serie (plan wyjścia pozycji)
    const ast = readAlerts();   // linie trendu, obserwowane spółki, dziennik alertów

    function readAlerts() {
        let a = {};
        try { a = JSON.parse(localStorage.getItem(ALERTS_KEY)) || {}; } catch (e) { /* tryb prywatny */ }
        return { lines: a.lines || {}, watch: a.watch || {}, pos: a.pos || {}, log: a.log || [], seen: a.seen || "" };
    }
    function saveAlerts() {
        try { localStorage.setItem(ALERTS_KEY, JSON.stringify(ast)); } catch (e) { /* tryb prywatny */ }
    }

    function readSettings() {
        try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ onlyOk: state.onlyOk, sort: state.sort, recent: state.recent, nShow: state.nShow, scanner: state.scanner, filters: state.filters, exit: state.exit })); } catch (e) { /* tryb prywatny */ }
    }
    const allRows = () => data.rows.concat(data.symbols || []);
    const rowFor = (t) => allRows().find((r) => r.ticker === t) || null;
    const planFor = (t) => (ast.pos[t] && weeklyData.get(t) ? positionPlan(ast.pos[t], weeklyData.get(t), rowFor(t)) : null);
    // pozycja do wyjścia wg wybranej metody: MACD = zamknięcie pod stopem MACD, GLB = zamknięcie pod Green Line; zawsze: −20 % od szczytu, hamowanie
    function posWarn(r) {
        const pl = planFor(r.ticker);
        const exitNow = state.exit === "GLB" ? r.glb && r.price < r.glb : r.macd_stop && r.price < r.macd_stop;
        return !!(r.slow || exitNow || (pl && pl.half));
    }

    function renderHead() {
        $("thead").innerHTML = "<tr>" + COLUMNS.map(([k, h]) => {
            const arrow = state.sort && state.sort.key === k ? (state.sort.dir > 0 ? " ▲" : " ▼") : "";
            return `<th data-key="${k}" class="${TEXT_COLS.includes(k) ? "" : "num"}">${h}${arrow}</th>`;
        }).join("") + "</tr>";
    }

    function renderTable() {
        shown = visibleRows(data.rows, { onlyOk: state.onlyOk, search: $("search").value, sort: state.sort, scanner: state.scanner, filters: state.filters });
        const nf = activeFilters(state.filters);
        $("fltBtn").textContent = nf ? `Filtry (${nf})` : "Filtry";
        $("fltBtn").classList.toggle("on", nf > 0);
        $("tbody").innerHTML = shown.map((r) => {
            const held = !!ast.pos[r.ticker], warn = held && posWarn(r);
            const cls = [isSignal(r) ? "signal" : "", r.ok ? "" : "dim", r.ticker === current ? "sel" : "", warn ? "poswarn" : ""].join(" ");
            return `<tr data-t="${r.ticker}" class="${cls}">` + COLUMNS.map(([k, , f]) =>
                `<td class="${TEXT_COLS.includes(k) ? "" : "num"} c-${k}">${k === "ticker" && held ? "📌 " : ""}${escapeHtml(cell(r[k], f))}</td>`).join("") + "</tr>";
        }).join("") || `<tr><td colspan="${COLUMNS.length}" class="empty">Brak spółek — wyłącz „tylko spełniające warunki”, zmień filtry albo wyszukiwanie.</td></tr>`;
        const pool = visibleRows(data.rows, { scanner: state.scanner });
        const ok = pool.filter((r) => r.ok).length, sig = pool.filter(isSignal).length;
        $("counts").textContent = `${shown.length} na liście · ${pool.length} spółek ze skanera · warunki spełnia ${ok} · sygnał GLB ${sig}`;
        renderStatus();
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    }

    // pasek ładowania na dole: etykieta, pobrane MB, procent (gdy serwer poda rozmiar) i czas od startu
    const loads = new Map();
    let loadSeq = 0, loadTimer = null;
    function renderLoad() {
        const bar = $("loadbar");
        if (!loads.size) { bar.hidden = true; clearInterval(loadTimer); loadTimer = null; return; }
        const items = [...loads.values()], done = items.reduce((a, x) => a + x.got, 0), total = items.reduce((a, x) => a + (x.total || 0), 0);
        const known = items.every((x) => x.total), pct = known && total ? Math.min(99, Math.round(done / total * 100)) : null;
        const secs = (Date.now() - Math.min(...items.map((x) => x.t0))) / 1000;
        bar.hidden = false;
        bar.classList.toggle("indet", pct === null);
        $("loadfill").style.width = (pct === null ? 30 : pct) + "%";
        $("loadtext").textContent = `${items.map((x) => x.label).join(" · ")} · ${(done / 1e6).toFixed(1)} MB` +
            (pct === null ? "" : ` · ${pct} %`) + ` · ${secs.toFixed(0)} s`;
    }

    async function fetchJson(url, label) {
        const id = ++loadSeq;
        loads.set(id, { label, got: 0, total: 0, t0: Date.now() });
        if (!loadTimer) loadTimer = setInterval(renderLoad, 500);
        renderLoad();
        try {
            const r = await fetch(url, { cache: "no-cache" });
            if (!r.ok) return null;
            const enc = r.headers.get("content-encoding"), len = +r.headers.get("content-length") || 0;
            loads.get(id).total = enc ? 0 : len;   // skompresowany rozmiar nie pasuje do pobranych bajtów -> bez procentu
            if (!r.body || !r.body.getReader) return await r.json();
            const reader = r.body.getReader(), chunks = [];
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                loads.get(id).got += value.length;
                renderLoad();
            }
            return JSON.parse(new TextDecoder().decode(await new Blob(chunks).arrayBuffer()));
        } catch (e) {
            return null;
        } finally {
            loads.delete(id);
            renderLoad();
        }
    }

    async function loadWeekly(t) {
        if (!weeklyCache.has(t)) weeklyCache.set(t, fetchJson("data/weekly/" + encodeURIComponent(fileName(t)), `Wykres ${t}`).then((d) => { if (d) weeklyData.set(t, d); return d; }));
        return weeklyCache.get(t);
    }

    async function openChart(t) {
        current = t;
        document.body.classList.add("chart-open");
        $("chartTitle").textContent = titleText(t, rowFor(t));
        $("tvLink").href = "https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(t.replace("^", ""));
        document.querySelectorAll("#tbody tr.sel").forEach((tr) => tr.classList.remove("sel"));
        const tr = document.querySelector(`#tbody tr[data-t="${CSS.escape(t)}"]`);
        if (tr) { tr.classList.add("sel"); tr.scrollIntoView({ block: "nearest" }); }
        series = null;
        end = null;   // długość okna zostaje między spółkami, koniec wraca do ostatniego tygodnia
        sel = null;
        gest = null;
        renderTools();
        drawChart();
        const r = rowFor(t);
        if (period === "D" && !(r && r.daily)) period = "W";
        renderPeriod();
        const [d, spx] = await Promise.all([period === "D" ? loadDaily(t) : loadWeekly(t), loadWeekly("SPY")]);
        spxData = spx;
        if (current !== t) return;
        series = d || false;
        drawChart();
    }

    async function loadDaily(t) {
        if (!dailyCache.has(t)) dailyCache.set(t, fetchJson("data/daily/" + encodeURIComponent(fileName(t)), `Dzienny ${t}`));
        return dailyCache.get(t);
    }

    // przyciski T / D (dzienny: RWB Guppy + Blue Dot, tylko do podglądu — w teście słabszy niż GLB tygodniowy; tylko spółki nad Green Line)
    function renderPeriod() {
        const r = current && rowFor(current), ok = !!(r && r.daily);
        $("perD").hidden = !ok;
        $("perW").classList.toggle("on", period === "W");
        $("perD").classList.toggle("on", period === "D");
    }

    async function togglePeriod(to) {
        if (!current || to === period) return;
        period = to || (period === "D" ? "W" : "D");
        dShow = 260;
        end = null;
        sel = null;
        renderPeriod();
        renderTools();
        const t = current;
        series = null;
        drawChart();
        const d = await (period === "D" ? loadDaily(t) : loadWeekly(t));
        if (current !== t) return;
        series = d || false;
        drawChart();
    }

    function drawChart() {
        const box = $("chartBody");
        $("tip").hidden = true;
        if (!current) return;
        if (!series) {
            $("slider").innerHTML = "";
            box.innerHTML = `<p class="note">${series === false ? (period === "D" ? "Brak danych dziennych." : "Brak danych tygodniowych.") : "Ładowanie…"}</p>`;
            return;
        }
        drawSlider();
        const row = rowFor(current) && { ...rowFor(current), exit: state.exit, plan: planFor(current) };
        const res = chartSvg(series, row, Math.max(320, box.clientWidth), Math.max(360, box.clientHeight), curShow(), end, linesOf(current), sel, spxData || null, period);
        if (!res) { box.innerHTML = '<p class="note">Brak danych.</p>'; return; }
        box.innerHTML = res.svg;
        geom = res.geom;
    }

    function drawSlider() {
        const el = $("slider");
        el.innerHTML = series ? sliderSvg(series.c, curShow(), end, el.clientWidth, el.clientHeight, period === "D" ? "sesji" : "tyg.") : "";
    }

    function setWindow(n, e) {
        const total = series.c.length;
        if (period === "D") dShow = n >= total ? null : n; else state.nShow = n >= total ? null : n;
        end = e >= total ? null : e;
        saveSettings();
        drawChart();
    }

    function sliderX(ev) {
        const r = $("slider").getBoundingClientRect();
        return ev.clientX - r.left;
    }

    function sliderDown(ev) {
        if (!series) return;
        const total = series.c.length, W = $("slider").clientWidth, x = sliderX(ev);
        const [x0, x1] = sliderRect(total, curShow(), end, W);
        let mode = sliderMode(x, x0, x1, ev.pointerType === "mouse" ? 9 : 16);
        if (mode === "jump") { setWindow(...sliderJump(x, total, curShow(), W)); mode = "move"; }
        drag = { mode, x, start: [curShow(), end] };
        $("slider").setPointerCapture(ev.pointerId);
        ev.preventDefault();
    }

    function sliderMove(ev) {
        if (!drag || !series) return;
        setWindow(...sliderDrag(drag.mode, drag.start, sliderX(ev) - drag.x, series.c.length, $("slider").clientWidth));
    }

    function zoom(factor) {
        if (series) setWindow(...zoomWindow(series.c.length, curShow(), end, factor));
    }

    function pan(d) {
        if (!series) return;
        const total = series.c.length, [i0, i1] = windowRange(total, curShow(), end);
        setWindow(i1 - i0, Math.max(i1 - i0, Math.min(total, i1 + d)));
    }

    // ---------- linie trendu na wykresie ----------
    // mysz: przeciągnij po pustym miejscu = nowa linia; telefon: przytrzymaj palec ~0,4 s i prowadź = nowa linia (krótki ruch = dane tygodnia).
    // Chwyć koniec linii = zmień punkt, chwyć środek = przesuń całą; klik / dotknięcie linii = zaznacz (🗑 usuń, 🔔 alert); Delete = usuń.
    const linesOf = (t) => ast.lines[t] || [];
    const findLine = (id) => linesOf(current).find((x) => x.id === id);

    function redrawSoon() {
        if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; drawChart(); });
    }

    function chartPt(ev) {
        const svg = $("chartBody").querySelector("svg"), r = svg.getBoundingClientRect();
        return { x: (ev.clientX - r.left) * geom.w / r.width, y: (ev.clientY - r.top) * geom.h / r.height };
    }

    // punkt wykresu -> {d, p} (tydzień + cena); snap = magnes do High / Low tygodnia
    function ptValue(x, y, tol) {
        const [y0, y1] = geom.price, i = Math.max(0, Math.min(geom.n - 1, Math.floor((x - geom.x0) / geom.step))), k = geom.i0 + i;
        const yf = (p) => y1 - (Math.log(p) - geom.lmin) / (geom.lmax - geom.lmin) * (y1 - y0);
        const p = Math.exp(geom.lmin + (y1 - y) / (y1 - y0) * (geom.lmax - geom.lmin));
        return { d: series.d[k], p: +snapPrice(p, series.h[k], series.l[k], yf, y, tol).toPrecision(6), k };
    }

    function saveLines() {
        const ls = linesOf(current).filter((x) => x.d1 !== x.d2);
        if (ls.length) ast.lines[current] = ls; else delete ast.lines[current];
        saveAlerts();
    }

    function chartDown(ev) {
        if (!geom || !series || period === "D" || (ev.pointerType === "mouse" && ev.button !== 0)) return;   // linie trendu tylko na tygodniowym
        const pt = chartPt(ev), touch = ev.pointerType !== "mouse", tol = touch ? 18 : 7;
        const hit = hitLine(geom.segs || [], pt.x, pt.y, tol);
        $("chartBody").setPointerCapture(ev.pointerId);
        if (hit) {
            sel = hit.id;
            const ln = findLine(hit.id);
            gest = { mode: hit.part, x: pt.x, y: pt.y, orig: { ...ln }, ka: series.d.indexOf(ln.d1), kb: series.d.indexOf(ln.d2), tol };
            renderTools();
            redrawSoon();
            ev.preventDefault();
            return;
        }
        if (pt.y < geom.price[0] || pt.y > geom.price[1]) return;
        gest = { mode: touch ? "press" : "pend", x: pt.x, y: pt.y, tol };
        if (touch) {
            gest.timer = setTimeout(() => {
                if (!gest || gest.mode !== "press") return;
                startDraw(gest.x, gest.y);
                if (navigator.vibrate) navigator.vibrate(15);
            }, 380);
            onMove(ev);
        }
        ev.preventDefault();
    }

    function startDraw(x, y) {
        const a = ptValue(x, y, gest.tol), id = Date.now().toString(36);
        ast.lines[current] = linesOf(current).concat([{ id, d1: a.d, p1: a.p, d2: a.d, p2: a.p, alert: true }]);
        sel = id;
        gest.mode = "p2";
        gest.orig = { ...findLine(id) };
        $("tip").hidden = true;
        renderTools();
        redrawSoon();
    }

    function chartMoveGest(ev) {
        if (!gest) return;
        const pt = chartPt(ev), moved = Math.hypot(pt.x - gest.x, pt.y - gest.y);
        if (gest.mode === "press") {
            if (moved > 10) { clearTimeout(gest.timer); gest.mode = "scrub"; }
            onMove(ev);
            return;
        }
        if (gest.mode === "scrub") { onMove(ev); return; }
        if (gest.mode === "pend") {
            if (moved > 4) startDraw(gest.x, gest.y); else return;
        }
        const ln = findLine(sel);
        if (!ln) return;
        if (gest.mode === "p1" || gest.mode === "p2") {
            const v = ptValue(pt.x, pt.y, gest.tol);
            ln["d" + gest.mode[1]] = v.d;
            ln["p" + gest.mode[1]] = v.p;
        } else if (gest.mode === "body" && gest.ka >= 0 && gest.kb >= 0) {
            const last = series.d.length - 1, db = Math.round((pt.x - gest.x) / geom.step);
            const d = Math.max(-Math.min(gest.ka, gest.kb), Math.min(last - Math.max(gest.ka, gest.kb), db));
            const ratio = Math.exp(-(pt.y - gest.y) / (geom.price[1] - geom.price[0]) * (geom.lmax - geom.lmin));
            Object.assign(ln, { d1: series.d[gest.ka + d], d2: series.d[gest.kb + d], p1: +(gest.orig.p1 * ratio).toPrecision(6), p2: +(gest.orig.p2 * ratio).toPrecision(6) });
        }
        ev.preventDefault();
        redrawSoon();
    }

    function chartUp() {
        if (!gest) return;
        clearTimeout(gest.timer);
        if (gest.mode === "press" || gest.mode === "pend") { sel = null; renderTools(); redrawSoon(); }   // dotknięcie / klik obok linii = odznacz
        else if (gest.mode !== "scrub") {
            saveLines();
            if (!findLine(sel)) sel = null;
            renderTools();
            redrawSoon();
        }
        gest = null;
    }

    function deleteSelected() {
        if (!sel) return;
        ast.lines[current] = linesOf(current).filter((x) => x.id !== sel);
        sel = null;
        saveLines();
        renderTools();
        drawChart();
    }

    function toggleLineAlert() {
        const ln = findLine(sel);
        if (!ln) return;
        ln.alert = ln.alert === false;
        saveLines();
        renderTools();
        drawChart();
    }

    function togglePos() {
        if (!current) return;
        const r = rowFor(current) || {};
        if (ast.pos[current]) delete ast.pos[current];
        else {
            ast.pos[current] = { since: data.data_as_of || "", price: r.price };
            if (!ast.watch[current]) ast.watch[current] = snapshot(r);   // pozycja = też alerty strategii (MACD, stop, hamowanie)
        }
        saveAlerts();
        renderTools();
        renderTable();
    }

    function toggleWatch() {
        if (!current) return;
        if (ast.watch[current]) delete ast.watch[current];
        else ast.watch[current] = snapshot(rowFor(current) || {});
        saveAlerts();
        renderTools();
    }

    function renderTools() {
        const ln = sel && findLine(sel);
        $("posBtn").classList.toggle("on", !!(current && ast.pos[current]));
        $("posBtn").textContent = current && ast.pos[current] ? "📌 Mam pozycję" : "📌 Pozycja";
        const r = current && rowFor(current);
        $("potBadge").textContent = r ? `${r.ok ? "✓ warunki" : "✗ warunki"}${r.slow ? " · ⚠ hamuje" : ""}` : "";
        $("potBadge").classList.toggle("warn", !!(r && r.slow));
        $("exitBtn").textContent = state.exit === "GLB" ? "🚪 Wyjście: pod GLB" : "🚪 Wyjście: MACD";
        $("watchBtn").classList.toggle("on", !!(current && ast.watch[current]));
        $("watchBtn").textContent = current && ast.watch[current] ? "🔔 Obserwujesz" : "🔕 Obserwuj";
        $("lineAlertBtn").hidden = $("lineDelBtn").hidden = !ln;
        if (ln) $("lineAlertBtn").textContent = ln.alert === false ? "🔕 alert linii" : "🔔 alert linii";
    }

    // ---------- alerty ----------
    async function checkAlerts() {
        const ts = [...new Set(Object.keys(ast.lines).filter((t) => rowFor(t) && ast.lines[t].some((x) => x.alert !== false))
            .concat(Object.keys(ast.pos).filter((t) => rowFor(t))))];   // pozycje: spadek 20 % od szczytu
        const got = new Map(await Promise.all(ts.map(async (t) => [t, await loadWeekly(t)])));
        const fresh = evalAlerts(ast, rowFor, (t) => got.get(t) || null, new Date().toISOString(), data.data_as_of);
        saveAlerts();
        renderAlertBtn();
        if (Object.keys(ast.pos).length) renderTable();   // ostrzeżenia pozycji po wczytaniu świec
        if (fresh.length) notify(fresh);
    }

    function unread() {
        return ast.log.filter((a) => a.at > ast.seen).length;
    }

    function renderAlertBtn() {
        const n = unread();
        $("alertBtn").textContent = n ? `🔔 Alerty (${n})` : "🔔 Alerty";
        $("alertBtn").classList.toggle("on", n > 0);
    }

    function notify(fresh) {
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
        const title = `Momentum: ${fresh.length} ${fresh.length === 1 ? "alert" : "alerty"}`;
        const body = fresh.slice(0, 5).map((a) => `${a.t}: ${a.msg}`).join("\n");
        const fallback = () => { try { new Notification(title, { body }); } catch (e) { /* telefon: tylko przez service worker */ } };
        if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then((r) => r.showNotification(title, { body, icon: "icons/icon-192.png" })).catch(fallback);
        else fallback();
    }

    function openAlerts() {
        const seen = ast.seen;
        $("alertList").innerHTML = ast.log.map((a) => `<li data-t="${escapeHtml(a.t)}" class="${a.at > seen ? "new" : ""}"><b>${escapeHtml(a.t)}</b> ${escapeHtml(a.msg)}` +
            `<span class="when">tydz. ${escapeHtml(a.week)} · ${escapeHtml(a.at.slice(0, 10))}</span></li>`).join("") || '<li class="none">Brak alertów.</li>';
        const watched = Object.keys(ast.watch), lined = Object.keys(ast.lines), held = Object.keys(ast.pos);
        $("alertInfo").innerHTML = (watched.length ? "Obserwowane: " + watched.map((t) => `<button type="button" data-t="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("") : "Brak obserwowanych spółek (🔕 Obserwuj na wykresie).") +
            "<br>" + (held.length ? "📌 Pozycje: " + held.map((t) => { const r = rowFor(t); return `<button type="button" data-t="${escapeHtml(t)}">${escapeHtml(t)}${r && r.slow ? " ⚠" : ""}</button>`; }).join("") : "Brak pozycji (📌 Pozycja na wykresie).") +
            "<br>" + (lined.length ? "Linie trendu: " + lined.map((t) => `<button type="button" data-t="${escapeHtml(t)}">${escapeHtml(t)} (${ast.lines[t].length})</button>`).join("") : "Brak linii trendu.");
        $("notifyBtn").hidden = typeof Notification === "undefined" || Notification.permission !== "default";
        ast.seen = new Date().toISOString();
        saveAlerts();
        renderAlertBtn();
        $("alertDlg").showModal();
    }

    // ---------- panel: pozycje (plan wyjścia, co zrobić teraz) i obserwowane ----------
    async function openPositions() {
        await Promise.all(Object.keys(ast.pos).filter((t) => rowFor(t)).map((t) => loadWeekly(t)));
        const f = (v) => (v == null ? "—" : v.toFixed(2)), pct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`), e = escapeHtml;
        $("posMethod").textContent = state.exit === "GLB" ? "wyjście: pod GLB (zamknięcie tygodnia pod Green Line)" : "wyjście: MACD (stop pod Low tygodnia przecięcia w dół)";
        const pos = Object.entries(ast.pos).map(([t, p]) => {
            const r = rowFor(t) || {}, pl = positionPlan(p, weeklyData.get(t), r), last = pl.last != null ? pl.last : r.price;
            const st = positionStatus(pl, r, state.exit), ex = state.exit === "GLB" ? r.glb : r.macd_stop;
            return `<tr class="${st.length ? "warn" : ""}"><td><button type="button" data-t="${e(t)}">${e(t)}</button></td><td class="now">${e(st.join(" · ") || "trzymaj")}</td><td>${e(p.since || "")}</td><td>${f(pl.entry)}</td>` +
                `<td>${f(last)}</td><td>${pct(last && pl.entry ? (last / pl.entry - 1) * 100 : null)}</td><td>${f(pl.peak)}</td><td>${f(pl.halfAt)}</td><td>${f(pl.stopInit)}</td>` +
                `<td>${f(ex)}</td><td>${e(r.glb_state || "")}</td><td>${e(r.macd || "")}</td>` +
                `<td><button type="button" data-del-pos="${e(t)}" title="Usuń pozycję">✕</button></td></tr>`;
        });
        $("posTable").innerHTML = "<tr><th>Ticker</th><th>Co teraz</th><th>Od</th><th>Kupno</th><th>Cena</th><th>Zmiana %</th><th>Szczyt</th><th>½ przy</th><th>Stop −10 %</th>" +
            `<th>Wyjście</th><th>GLB</th><th>MACD</th><th></th></tr>` + (pos.join("") || '<tr><td colspan="13">Brak pozycji (📌 Pozycja na wykresie).</td></tr>');
        const watch = Object.keys(ast.watch).filter((t) => !ast.pos[t]).map((t) => {
            const r = rowFor(t) || {};
            return `<tr><td><button type="button" data-t="${e(t)}">${e(t)}</button></td><td>${f(r.price)}</td><td>${f(r.glb)}</td><td>${pct(r.glb_pct)}</td><td>${e(r.glb_state || "")}</td>` +
                `<td>${e(r.macd || "")}</td><td>${r.trend ? "✓" : ""}</td><td>${pct(r.rs)}</td><td>${r.ok ? "✓" : ""}</td>` +
                `<td><button type="button" data-del-watch="${e(t)}" title="Przestań obserwować">✕</button></td></tr>`;
        });
        $("watchTable").innerHTML = "<tr><th>Ticker</th><th>Cena</th><th>Green Line</th><th>Do linii %</th><th>GLB</th><th>MACD</th><th>SMA 10>30</th><th>RS pp</th><th>Warunki</th><th></th></tr>" +
            (watch.join("") || '<tr><td colspan="10">Brak obserwowanych (🔕 Obserwuj na wykresie).</td></tr>');
        if (!$("posDlg").open) $("posDlg").showModal();
    }

    function posListClick(ev) {
        const b = ev.target.closest("button");
        if (!b) return;
        if (b.dataset.t && rowFor(b.dataset.t)) { $("posDlg").close(); openChart(b.dataset.t); return; }
        if (b.dataset.delPos) delete ast.pos[b.dataset.delPos];
        else if (b.dataset.delWatch) delete ast.watch[b.dataset.delWatch];
        else return;
        saveAlerts();
        renderTable();
        openPositions();
    }

    // ---------- poradnik: zasady z badań + lista kontrolna otwartej spółki ----------
    function checklist(r) {
        const yes = (v) => (v === true ? '<b class="ok">✓</b>' : v === false ? '<b class="no">✗</b>' : '<b class="na">—</b>');
        const fmtv = (v, u) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}${u}`);
        const held = ast.pos[r.ticker];
        const rows = [
            [`Przychody kw. ≥ +15 % r/r (${fmtv(r.rev_rr, " %")})`, r.rev_rr == null ? null : r.rev_rr >= 15],
            [`Marża oper. ≥ +3 pp r/r (${fmtv(r.dopm, " pp")})`, r.dopm == null ? null : r.dopm >= 3],
            [`Wycena P/S < 20 (${r.ps != null ? r.ps.toFixed(1) : "—"})`, r.ps == null ? null : r.ps < 20],
            [`Siła względna 52 tyg. ≥ +50 pp nad S&P 500 (${fmtv(r.rs, " pp")})`, r.rs == null ? null : r.rs >= 50],
            [`2 ostatnie raporty powyżej konsensusu EPS (${fmtv(r.surp, " %")}, wcześniej ${fmtv(r.surp_prev, " %")})`, r.beat2 == null ? null : r.beat2],
            [`Rewizja prognozy EPS na przyszły rok, 90 dni: ${fmtv(r.eps_rev, " %")} <small>(podgląd — bez backtestu, yfinance nie ma historii)</small>`, r.eps_rev == null ? null : r.eps_rev > 0],
            [`Green Line: ${r.glb_state || "—"} (${fmtv(r.glb_pct, " %")} od linii; kupno 0–10 % nad)`, ["WYBICIE", "SYGNAŁ"].includes(r.glb_state) ? true : r.glb_state === "NAD" ? null : false],
            [`MACD tyg. ${r.macd || "—"} sygnałem (stop pod ${r.macd_stop != null ? r.macd_stop.toFixed(2) : "—"})`, r.macd === "nad"],
            [`Zamknięcie nad Green Line ${r.glb != null ? r.glb.toFixed(2) : "—"} (wyjście metodą GLB: zamknięcie tygodnia pod linią)`, r.glb == null || r.price == null ? null : r.price >= r.glb],
            [`Brak hamowania (tempo przychodów ${fmtv(r.accel, " pp")}, Δ marży brutto ${fmtv(r.dgm, " pp")})`, r.slow ? false : r.accel == null ? null : true],
        ];
        return `<h4>${escapeHtml(r.ticker)} ${escapeHtml(r.company || "")} — ${r.ok ? "spełnia warunki" : "nie spełnia warunków"}${held ? ` · 📌 pozycja od ${escapeHtml(held.since)} (${held.price != null ? held.price.toFixed(2) : "—"})` : ""}</h4>` +
            `<p class="dimtxt">Przychody: ${fmtv(r.rev_rr, " %")} r/r (kwartał wcześniej ${fmtv(r.rev_rr1, " %")}), Δ marży oper. ${fmtv(r.dopm, " pp")} (wcześniej ${fmtv(r.dopm1, " pp")}), marża oper. ${fmtv(r.opm, " %")} · kwartał ${escapeHtml(r.quarter || "—")}</p>` +
            "<ul class=\"chk\">" + rows.map(([t, v]) => `<li>${yes(v)} ${t}</li>`).join("") + "</ul>" +
            posPlanHtml(r) +
            (held && r.slow ? '<p class="warnbox">⚠ Masz pozycję, a ostatni raport pokazuje hamowanie' + (r.slow === "HAMUJE+MB" ? " i spadek marży brutto" : "") + " — w badaniu po takim raporcie spadek ≥ 20 % w 6 mies. zdarzał się w " + (r.slow === "HAMUJE+MB" ? "50" : "44") + " % przypadków (normalnie 33 %). Rozważ zacieśnienie stopu.</p>" : "");
    }

    // 📌 pozycja: poziomy wyjścia (stop −10 %, ½ przy −20 % od szczytu, metoda MACD albo GLB)
    function posPlanHtml(r) {
        const pl = planFor(r.ticker);
        if (!ast.pos[r.ticker]) return "";
        const f = (v) => (v == null ? "—" : v.toFixed(2));
        if (!pl) return '<p class="dimtxt">Plan wyjścia: wczytuję świece…</p>';
        const exitTxt = state.exit === "GLB" ? `zamknięcie tygodnia pod Green Line ${f(r.glb)}` : `stop MACD ${f(r.macd_stop)} (Low tygodnia przecięcia w dół)`;
        return `<p><b>Plan wyjścia</b> (metoda: ${state.exit === "GLB" ? "pod GLB" : "MACD"}, zmiana przyciskiem 🚪 na wykresie): kupno ${f(pl.entry)} · stop −10 % ${f(pl.stopInit)} · ` +
            `szczyt od wejścia ${f(pl.peak)} → <b>½ przy ${f(pl.halfAt)}</b> (−20 %) · reszta: ${exitTxt}</p>` +
            (pl.half ? `<p class="warnbox">⚠ Zamknięcie ${f(pl.last)} jest ≥ 20 % pod szczytem ${f(pl.peak)} — sprzedaj połowę.</p>` : "") +
            ((state.exit === "GLB" ? pl.glbExit : r.macd_stop && r.price < r.macd_stop) ? `<p class="warnbox">⚠ Sygnał wyjścia (${state.exit === "GLB" ? "zamknięcie pod Green Line" : "zamknięcie pod stopem MACD"}).</p>` : "");
    }

    function openGuide() {
        const r = current && rowFor(current);
        $("guideStock").innerHTML = r ? checklist(r) : '<p class="dimtxt">Otwórz wykres spółki, żeby zobaczyć jej listę kontrolną.</p>';
        $("guideDlg").showModal();
    }

    // ---------- filtry ----------
    function renderFilters() {
        const f = state.filters, choices = filterChoices();
        const head = Object.fromEntries(COLUMNS.map(([k, h]) => [k, h]));
        let html = '<div class="presets">' + FILTER_PRESETS.map(([name], i) => `<button type="button" data-preset="${i}">${escapeHtml(name)}</button>`).join("") + "</div>";
        for (const [k, vals] of Object.entries(choices)) {
            const on = (f[k] && f[k].in) || [];
            html += `<div class="frow"><span>${escapeHtml(head[k])}</span><div class="chips">` +
                vals.map((v) => `<button type="button" class="chip${on.includes(v) ? " on" : ""}" data-k="${k}" data-v="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join("") + "</div></div>";
        }
        for (const [k, h, fm] of COLUMNS) {
            if (!"p%mn".includes(fm)) continue;
            const c = f[k] || {};
            html += `<div class="frow"><span>${escapeHtml(h)}</span><div class="range">` +
                ["min", "max"].map((b) => `<input data-k="${k}" data-b="${b}" inputmode="decimal" placeholder="${b === "min" ? "od" : "do"}" value="${c[b] == null ? "" : c[b]}">`).join(" – ") + "</div></div>";
        }
        $("fltBody").innerHTML = html;
    }

    function filterChoices() {
        return { ...FILTER_CHOICES, sector: [...new Set(data.rows.map((r) => r.sector).filter(Boolean))].sort() };
    }

    function setFilter(k, upd) {
        const f = { ...(state.filters[k] || {}), ...upd };
        if (f.in && !f.in.length) delete f.in;
        for (const b of ["min", "max"]) if (f[b] == null) delete f[b];
        if (Object.keys(f).length) state.filters[k] = f; else delete state.filters[k];
        saveSettings();
        renderTable();
    }

    function fltClick(e) {
        const p = e.target.closest("[data-preset]");
        if (p) {
            state.filters = JSON.parse(JSON.stringify(FILTER_PRESETS[+p.dataset.preset][1]));
            saveSettings(); renderFilters(); renderTable();
            return;
        }
        const b = e.target.closest(".chip");
        if (!b) return;
        const k = b.dataset.k, v = b.dataset.v, cur = (state.filters[k] && state.filters[k].in) || [];
        setFilter(k, { in: cur.includes(v) ? cur.filter((x) => x !== v) : cur.concat([v]) });
        b.classList.toggle("on");
    }

    function fltInput(e) {
        const el = e.target.closest("input[data-k]");
        if (!el) return;
        const raw = el.value.trim().replace(",", "."), v = raw === "" || raw === "-" ? null : parseFloat(raw);
        if (v !== null && !isFinite(v)) return;
        setFilter(el.dataset.k, { [el.dataset.b]: v });
    }

    function closeChart() {
        current = null;
        document.body.classList.remove("chart-open");
        document.querySelectorAll("#tbody tr.sel").forEach((tr) => tr.classList.remove("sel"));
    }

    function step(d) {
        if (!shown.length) return;
        const i = shown.findIndex((r) => r.ticker === current);
        const j = i < 0 ? 0 : Math.min(shown.length - 1, Math.max(0, i + d));
        if (shown[j].ticker !== current) openChart(shown[j].ticker);
    }

    function onMove(e) {
        const svg = $("chartBody").querySelector("svg");
        if (!svg || !geom || !series) return;
        const p = e.touches ? e.touches[0] : e, rect = svg.getBoundingClientRect();
        const x = (p.clientX - rect.left) * geom.w / rect.width;
        const i = Math.floor((x - geom.x0) / geom.step);
        const tip = $("tip"), cross = svg.querySelector("#cross");
        if (i < 0 || i >= geom.n) { tip.hidden = true; cross.setAttribute("visibility", "hidden"); return; }
        cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
        tip.innerHTML = infoLines(series, geom.i0 + i).map(escapeHtml).join("<br>");
        tip.hidden = false;
        const bx = $("chartPane").getBoundingClientRect(), left = p.clientX - bx.left;
        tip.style.left = (left < bx.width - 200 ? left + 14 : left - 190) + "px";
        tip.style.top = (p.clientY - bx.top + 12) + "px";
    }

    function openSymbol() {
        const dlg = $("symDlg");
        $("symList").innerHTML = allRows().map((r) => `<option value="${r.ticker}">${escapeHtml(r.company || "")}</option>`).join("");
        $("symRecent").innerHTML = state.recent.map((t) => `<button type="button" data-t="${t}">${t}</button>`).join("");
        $("symMsg").textContent = "";
        $("symInput").value = "";
        dlg.showModal();
        $("symInput").focus();
    }

    function chooseSymbol(raw) {
        const t = (raw || "").trim().toUpperCase();
        if (!t) return;
        if (!rowFor(t)) {
            $("symMsg").textContent = `${t} nie ma w danych. Dopisz go do „symbols” w finviz_screen.json — pojawi się po następnym odświeżeniu.`;
            return;
        }
        state.recent = [t].concat(state.recent.filter((x) => x !== t)).slice(0, 10);
        saveSettings();
        $("symDlg").close();
        openChart(t);
    }

    function initUi() {
        renderHead();
        $("onlyOk").checked = state.onlyOk;
        $("onlyOk").addEventListener("change", () => { state.onlyOk = $("onlyOk").checked; saveSettings(); renderTable(); });
        $("search").addEventListener("input", renderTable);
        $("scanner").addEventListener("change", () => { state.scanner = $("scanner").value || null; saveSettings(); renderTable(); });
        $("thead").addEventListener("click", (e) => {
            const th = e.target.closest("th");
            if (!th) return;
            const k = th.dataset.key;
            state.sort = state.sort && state.sort.key === k ? (state.sort.dir > 0 ? { key: k, dir: -1 } : null)
                : { key: k, dir: TEXT_COLS.includes(k) ? 1 : -1 };
            saveSettings(); renderHead(); renderTable();
        });
        $("tbody").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-t]"); if (tr) openChart(tr.dataset.t); });
        $("closeChart").addEventListener("click", closeChart);
        $("symBtn").addEventListener("click", openSymbol);
        $("symForm").addEventListener("submit", (e) => { e.preventDefault(); chooseSymbol($("symInput").value); });
        $("symRecent").addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (b) chooseSymbol(b.dataset.t); });
        $("refreshLink").href = REPO + "/actions/workflows/refresh.yml";
        const body = $("chartBody");
        body.addEventListener("mousemove", (e) => { if (!gest) onMove(e); });
        body.addEventListener("mouseleave", () => { $("tip").hidden = true; });
        body.addEventListener("pointerdown", chartDown);
        body.addEventListener("pointermove", chartMoveGest);
        body.addEventListener("pointerup", chartUp);
        body.addEventListener("pointercancel", chartUp);
        body.addEventListener("contextmenu", (e) => e.preventDefault());   // długie przytrzymanie na telefonie nie otwiera menu
        $("watchBtn").addEventListener("click", toggleWatch);
        $("posBtn").addEventListener("click", togglePos);
        $("exitBtn").addEventListener("click", () => {
            state.exit = state.exit === "GLB" ? "MACD" : "GLB";
            saveSettings();
            renderTable();
        });
        $("perW").addEventListener("click", () => togglePeriod("W"));
        $("perD").addEventListener("click", () => togglePeriod("D"));
        $("potBadge").addEventListener("click", openGuide);
        $("guideBtn").addEventListener("click", openGuide);
        $("lineAlertBtn").addEventListener("click", toggleLineAlert);
        $("lineDelBtn").addEventListener("click", deleteSelected);
        $("fltBtn").addEventListener("click", () => { renderFilters(); $("fltDlg").showModal(); });
        $("fltBody").addEventListener("click", fltClick);
        $("fltBody").addEventListener("input", fltInput);
        $("fltClear").addEventListener("click", () => { state.filters = {}; saveSettings(); renderFilters(); renderTable(); });
        $("alertBtn").addEventListener("click", openAlerts);
        $("posListBtn").addEventListener("click", openPositions);
        $("posDlg").addEventListener("click", posListClick);
        $("alertClear").addEventListener("click", () => { ast.log = []; saveAlerts(); openAlerts(); });
        $("notifyBtn").addEventListener("click", () => { Notification.requestPermission().then(() => { $("notifyBtn").hidden = true; }); });
        for (const id of ["alertList", "alertInfo"]) {
            $(id).addEventListener("click", (e) => { const el = e.target.closest("[data-t]"); if (el && rowFor(el.dataset.t)) { $("alertDlg").close(); openChart(el.dataset.t); } });
        }
        const sl = $("slider");
        sl.addEventListener("pointerdown", sliderDown);
        sl.addEventListener("pointermove", sliderMove);
        sl.addEventListener("pointerup", () => { drag = null; });
        sl.addEventListener("pointercancel", () => { drag = null; });
        for (const el of [sl, body]) {
            el.addEventListener("wheel", (e) => { if (!series) return; e.preventDefault(); zoom(e.deltaY < 0 ? 0.85 : 1.18); }, { passive: false });
        }
        let rt = null;
        window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(drawChart, 120); });
        document.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSymbol(); return; }
            if ($("symDlg").open || $("fltDlg").open || $("alertDlg").open || $("posDlg").open || $("guideDlg").open || e.target.matches("input")) return;
            if (current && sel && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); deleteSelected(); return; }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); step(e.key === "ArrowDown" ? 1 : -1); }
            else if (current && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); pan(e.key === "ArrowLeft" ? -4 : 4); }
            else if (current && (e.key === "+" || e.key === "-")) zoom(e.key === "+" ? 0.85 : 1.18);
            else if (e.key === "Escape") { if (sel) { sel = null; renderTools(); drawChart(); } else closeChart(); }
        });
    }

    function renderScanners() {
        const scans = data.scanners || [];
        if (state.scanner && !scans.some((m) => m.name === state.scanner)) state.scanner = null;
        $("scanner").innerHTML = `<option value="">Wszystkie skanery (${data.rows.length})</option>` +
            scans.map((m) => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)} (${m.n})${m.stale ? " ⚠" : ""}</option>`).join("");
        $("scanner").value = state.scanner || "";
    }

    function renderStatus() {
        if (!data.generated_at) return;
        const scans = (data.scanners || []).filter((m) => !state.scanner || m.name === state.scanner);
        const stale = scans.filter((m) => m.stale).map((m) => m.name);
        $("status").textContent = `Dane z ${data.generated_at.slice(0, 10)} (ostatni tydzień ${data.data_as_of || "—"}` +
            `${weekInProgress(data.data_as_of, data.generated_at) ? " — w toku, sygnał obowiązuje po zamknięciu piątku" : ""})` +
            (state.scanner && scans[0] ? ` · filtr Finviz ${scans[0].filters}` : "") +
            (stale.length ? ` · ⚠ Finviz niedostępny dla: ${stale.join(", ")} — lista z poprzedniego odświeżenia` : "");
    }

    async function init() {
        initUi();
        data = await fetchJson("data/watchlist.json", "Lista spółek");
        if (!data) {
            data = { rows: [], symbols: [] };
            $("status").textContent = "Nie udało się wczytać data/watchlist.json.";
            return;
        }
        renderScanners();
        renderTable();
        renderAlertBtn();
        checkAlerts();
        if (window.matchMedia("(min-width: 1000px)").matches && shown.length) openChart(shown[0].ticker);
    }

    init();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
