// Strona (kopia Momentum Desktop): uniwersum z Finviz, filtry, Green Line i wykresy T (tygodniowy) / M (miesięczny).
// Ctrl+K = dowolny symbol z listy albo z `symbols` w finviz_screen.json. Czyste funkcje na górze (testy w tests/js/app.test.js).
"use strict";

const COLUMNS = [ // [klucz, nagłówek, format] — jak desktop/app.py COLUMNS
    ["ticker", "Ticker", "s"], ["company", "Spółka", "s"], ["sector", "Sektor", "s"], ["sector_rs", "RS sektora %", "%"], ["price", "Cena", "p"],
    ["glb", "Green Line", "p"], ["glb_pct", "Do linii %", "%"], ["glb_state", "GLB", "s"], ["macd", "MACD", "s"], ["trend", "SMA 10>30", "b"], ["rwb_weeks", "RWB tyg.", "i"],
    ["macd_stop", "Stop MACD", "p"], ["dopm", "Δ marża oper. pp", "%"], ["rev_rr", "Przychody r/r %", "%"],
    ["eps_rating", "EPS Rating", "i"], ["dgm", "Δ marża brutto pp", "%"], ["pattern", "Wzorzec Zangera", "s"], ["pattern_pct", "Do kupna wzorca %", "%"], ["pattern_exit", "Ostrzeżenie wzorca", "s"], ["quarter", "Kwartał", "s"], ["turnover", "Obrót mln $", "m"],
    ["ps", "P/S", "x"], ["peg", "PEG", "x2"], ["pegy", "PEGY", "x2"],
    ["rs", "RS 52 tyg. pp", "%"], ["surp", "Niesp. EPS %", "%"], ["beat2", "2× nad konsensus", "b"], ["eps_rev", "Rewizja EPS 90 dni %", "%"],
    ["rvol_w", "RVol tyg.", "x"], ["cc52w", "C/C[52 tyg.]", "r"], ["ok", "Warunki", "b"], ["slow", "Hamuje", "w"],
];
const SIGNAL = ["WYBICIE", "SYGNAŁ"];
const ENTRY_MAX = 10;   // wejście: zamknięcie tygodnia 0–10 % nad Green Line (BLUE DOT i wyżej — tylko informacyjnie)
const TEXT_COLS = ["ticker", "company", "sector", "glb_state", "macd", "quarter", "slow", "pattern", "pattern_exit"];
const SETTINGS_KEY = "momentum_settings_v2";   // nowy klucz: stare filtry odwoływały się do usuniętych kolumn
const NUMERIC_FORMATS = ["p", "%", "m", "r", "x", "x2", "i"];   // kolumny z polami „od – do” w filtrach (też EPS Rating, RWB tyg., RVol, P/S, PEG, C/C[52 tyg.])
const ALERTS_KEY = "momentum_alerts";   // {lines, watch, log, seen}
const REPO = "https://github.com/agnar92/Momentum";

function cell(v, f) {
    if (v === null || v === undefined) return "";
    if (f === "p") return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (f === "%") return (v >= 0 ? "+" : "") + v.toFixed(1);
    if (f === "m") return (v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (f === "b") return v ? "✓" : "";
    if (f === "x") return v.toFixed(1);
    if (f === "r") return v.toFixed(2);
    if (f === "x2") return v.toFixed(2);
    if (f === "i") return v.toFixed(0);
    if (f === "w") return v === "HAMUJE+MB" ? "⚠⚠ + marża" : v ? "⚠ hamuje" : "";
    return String(v);
}

// sygnał kupna = Green Line, zamknięcie tygodnia 0–10 % nad linią (badanie 2011–2025: szersza strefa i Blue Dot dawały mniej) — jak app.is_signal
const isSignal = (r) => SIGNAL.includes(r.glb_state) && (r.glb_pct == null || r.glb_pct <= ENTRY_MAX);

// jak app.default_order: najpierw warunki + sygnał GLB 0–10 %, potem spełniające warunki; w grupie najbliżej Green Line
// (przy nadmiarze sygnałów najbliższe linii: ten sam wynik, mniejsze obsunięcie), potem siła względna.
function defaultCompare(a, b) {
    const key = (r) => [!(r.ok && isSignal(r)), !r.ok, r.glb_pct == null ? 1e9 : Math.abs(r.glb_pct), -(r.rs ?? -1e9)];
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
const BUY_PATTERNS = ["Cup & Handle", "Flat Base", "Ascending Triangle", "Flaga/Proporzec", "Channel", "Symmetrical Triangle", "Descending Triangle", "Falling Wedge", "Inverted H&S"];   // wzorce kupna Zangera (jak calc.PATTERN_NAMES)
const FILTER_CHOICES = { glb_state: ["WYBICIE", "SYGNAŁ", "BLUE DOT", "NAD", "POD", "BRAK"], macd: ["nad", "pod"], ok: ["tak", "nie"], trend: ["tak", "nie"], beat2: ["tak", "nie"], slow: ["HAMUJE", "HAMUJE+MB", "—"], pattern: BUY_PATTERNS, pattern_exit: ["Head & Shoulders", "Rising Wedge", "Parabolic Curve"] };
const FILTER_SCALE = { turnover: 1e6 };
const FILTER_PRESETS = [   // jak desktop/app.py FILTER_PRESETS
    ["Reguły: sygnał GLB 0–10 % + warunki (przychody, marża)", { ok: { in: ["tak"] }, glb_state: { in: ["WYBICIE", "SYGNAŁ"] }, glb_pct: { min: 0, max: 10 } }],
    ["EPS Rating ≥ 80 + sygnał GLB 0–10 %", { eps_rating: { min: 80 }, glb_state: { in: ["WYBICIE", "SYGNAŁ"] }, glb_pct: { min: 0, max: 10 } }],
    ["Wzorzec Zangera: wybicie (0–10 % nad kupnem) + warunki", { ok: { in: ["tak"] }, pattern: { in: BUY_PATTERNS }, pattern_pct: { min: 0, max: 10 } }],
    ["Wzorzec Zangera: budowany, do 3 % pod kupnem", { pattern: { in: BUY_PATTERNS }, pattern_pct: { min: -3, max: 0 } }],
    ["Liderzy: RS 52 tyg. ≥ 50 pp + nad GLB", { rs: { min: 50 }, glb_state: { in: ["WYBICIE", "SYGNAŁ", "BLUE DOT", "NAD"] } }],
    ["Przebicie GLB + SMA 10 > 30 (dowolnie wysoko)", { trend: { in: ["tak"] }, glb_state: { in: ["WYBICIE", "SYGNAŁ", "BLUE DOT", "NAD"] } }],
    ["Aktywne: RVol tyg. ≥ 1,5 + nad GLB", { rvol_w: { min: 1.5 }, glb_state: { in: ["WYBICIE", "SYGNAŁ", "BLUE DOT", "NAD"] } }],
    ["Nad GLB + MACD dodatni", { glb_state: { in: ["WYBICIE", "SYGNAŁ", "BLUE DOT", "NAD"] }, macd: { in: ["nad"] } }],
    ["Sygnał kupna (wybicie / 0–10 % / Blue Dot) + MACD dodatni", { glb_state: { in: ["WYBICIE", "SYGNAŁ", "BLUE DOT"] }, macd: { in: ["nad"] } }],
    ["Blisko linii (−10…+10 %)", { glb_pct: { min: -10, max: 10 } }],
];

const filterValue = (r, k) => (k === "trend" || k === "beat2" || k === "ok" ? (r[k] ? "tak" : "nie") : r[k] == null ? "—" : String(r[k]));

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
    let out = rows.filter((r) => (!opts.scanner || (r.scanners || []).includes(opts.scanner)) && passFilters(r, opts.filters) &&
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

if (typeof module !== "undefined") module.exports = { COLUMNS, NUMERIC_FORMATS, TEXT_COLS, cell, defaultCompare, compareBy, visibleRows, fileName, isSignal, weekInProgress, passFilters, activeFilters, filterValue, FILTER_PRESETS };

// ---------- DOM ----------
if (typeof document !== "undefined") (function () {
    const $ = (id) => document.getElementById(id);
    // exit: MACD / GLB; view = ustawienia widoku osobno dla T (W) i M: {fut: puste świece po prawej, n: długość okna, z / s: skala ceny}; stops = ręczne stopy {ticker: cena}
    const state = Object.assign({ sort: null, recent: [], filters: {}, exit: "MACD", view: {}, stops: {}, rwb: false, capital: 10000, risk: 1, gist: { id: "", mode: "auto" } }, readSettings());
    if (typeof state.view !== "object" || !state.view) state.view = {};
    if (typeof state.stops !== "object" || !state.stops) state.stops = {};
    if (typeof state.gist !== "object" || !state.gist) state.gist = { id: "", mode: "auto" };
    let data = { rows: [], symbols: [] }, shown = [], current = null, geom = null, series = null, end = null, drag = null;
    let sel = null, gest = null, rafId = 0, spxData = null, spyMData = null, drawMode = false, hint = null;
    const lineUndo = new Map();   // ticker -> stos poprzednich stanów linii (JSON), do ↶ / Ctrl+Z
    let period = "W", zanger = false;   // W = tygodniowy (T), M = miesięczny; zanger = widok Zangera (tylko T): cena + wolumen + wzorce
    const viewOf = () => (state.view[period] = state.view[period] || {});
    const futOf = () => (viewOf().fut == null ? FUTURE_DEFAULT[period] : viewOf().fut);
    const nShowOf = () => (viewOf().n == null ? (period === "W" ? DEFAULT_WEEKS : null) : viewOf().n);   // T: domyślnie 3 lata, resztę historii pokazuje suwak
    const pvOf = () => [viewOf().z || 1, viewOf().s || 0];
    const weeklyCache = new Map(), weeklyData = new Map();   // obietnice pobrania / gotowe serie (plan wyjścia pozycji)
    const monthlyCache = new Map(), builtCache = new Map(), extCache = { key: null, val: null };   // miesięczne pliki, zbudowane serie T / M, seria z pustymi świecami
    const FX_KEY = "momentum_fx";   // {usdpln, date}
    let source = { kind: "repo" }, gistInfo = { repo: null, gist: null, error: "" };   // źródło danych: repo (Weekly Refresh) albo gist (wysłany z desktopa), stan do okna ☁ Gist
    const gistChunks = new Map();   // "weekly_01.json" -> obietnica paczki serii z gista
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
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ sort: state.sort, recent: state.recent, scanner: state.scanner, filters: state.filters, exit: state.exit,
                view: state.view, stops: state.stops, rwb: state.rwb, capital: state.capital, risk: state.risk, gist: state.gist }));
        } catch (e) { /* tryb prywatny */ }
    }
    const allRows = () => data.rows.concat(data.symbols || []);
    const rowFor = (t) => allRows().find((r) => r.ticker === t) || null;
    const planFor = (t) => (ast.pos[t] && weeklyData.get(t) ? positionPlan(ast.pos[t], weeklyData.get(t), rowFor(t)) : null);
    // pozycja do wyjścia wg wybranej metody: MACD = zamknięcie pod stopem MACD, GLB = zamknięcie pod Green Line; zawsze: −20 % od szczytu, hamowanie
    function posWarn(r) {
        const pl = planFor(r.ticker);
        const ms = pl ? pl.macdStop : r.macd_stop;
        const exitNow = state.exit === "GLB" ? r.glb && r.price < r.glb : (ms && r.price < ms) || (pl && pl.stopInit != null && r.price <= pl.stopInit);
        return !!(r.slow || exitNow || (pl && pl.half));
    }

    function renderHead() {
        $("thead").innerHTML = "<tr>" + COLUMNS.map(([k, h]) => {
            const arrow = state.sort && state.sort.key === k ? (state.sort.dir > 0 ? " ▲" : " ▼") : "";
            return `<th data-key="${k}" class="${TEXT_COLS.includes(k) ? "" : "num"}">${h}${arrow}</th>`;
        }).join("") + "</tr>";
    }

    function renderTable() {
        const pool = visibleRows(data.rows, { scanner: state.scanner });
        shown = visibleRows(data.rows, { search: $("search").value, sort: state.sort, scanner: state.scanner, filters: state.filters });
        const nf = activeFilters(state.filters);
        $("fltBtn").textContent = nf ? `Filtry (${nf})` : "Filtry";
        $("fltBtn").classList.toggle("on", nf > 0);
        $("tbody").innerHTML = shown.map((r) => {
            const held = !!ast.pos[r.ticker], warn = held && posWarn(r);
            const cls = [isSignal(r) ? "signal" : "", r.ticker === current ? "sel" : "", warn ? "poswarn" : ""].join(" ");
            return `<tr data-t="${r.ticker}" class="${cls}">` + COLUMNS.map(([k, , f]) => {
                const value = k === "cc52w" ? (r.cc52w ?? r.cc250) : r[k]; // zgodność ze starym JSON-em do najbliższego odświeżenia
                return `<td class="${TEXT_COLS.includes(k) ? "" : "num"} c-${k}">${k === "ticker" && held ? "📌 " : ""}${escapeHtml(cell(value, f))}</td>`;
            }).join("") + "</tr>";
        }).join("") || `<tr><td colspan="${COLUMNS.length}" class="empty">Brak spółek — zmień filtry albo wyszukiwanie.</td></tr>`;
        $("counts").textContent = `${shown.length} na liście · ${pool.length} spółek ze skanera · spełnia warunki ${pool.filter((r) => r.ok).length} · sygnał GLB ${pool.filter((r) => r.ok && isSignal(r)).length}`;
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

    // paczka serii z gista (weekly_NN.json / monthly_NN.json = {ticker: seria}); null przy błędzie
    function gistChunk(name) {
        if (!gistChunks.has(name)) gistChunks.set(name, source.files[name] ? fetchJson(source.files[name], `Gist ${name}`) : Promise.resolve(null));
        return gistChunks.get(name);
    }
    async function fromGist(kind, t) {
        const n = source.kind === "gist" && source.manifest.chunks && (source.manifest.chunks[kind] || {})[t];
        if (!n) return null;
        const part = await gistChunk(`${kind}_${String(n).padStart(2, "0")}.json`);
        return (part && part[t]) || null;
    }

    async function loadWeekly(t) {
        if (!weeklyCache.has(t)) weeklyCache.set(t, (async () => {
            const d = (await fromGist("weekly", t)) || (await fetchJson("data/weekly/" + encodeURIComponent(fileName(t)), `Wykres ${t}`));
            if (d) weeklyData.set(t, d);
            return d;
        })());
        return weeklyCache.get(t);
    }

    async function loadMonthly(t) {
        if (!monthlyCache.has(t)) monthlyCache.set(t, (async () => (await fromGist("monthly", t)) || fetchJson("data/monthly/" + encodeURIComponent(fileName(t)), `Miesięczny ${t}`))());
        return monthlyCache.get(t);
    }

    // ---------- źródło danych: repo (Weekly Refresh) albo gist wysłany z desktopa; w trybie auto wygrywa nowsze (generated_at) ----------
    async function loadGist(id) {
        try {
            const r = await fetch("https://api.github.com/gists/" + encodeURIComponent(id), { headers: { Accept: "application/vnd.github+json" } });
            if (!r.ok) return { error: r.status === 404 ? "nie ma gista o takim ID" : r.status === 403 ? "limit zapytań GitHub (spróbuj za chwilę)" : `GitHub ${r.status}` };
            const files = Object.fromEntries(Object.entries((await r.json()).files || {}).map(([n, f]) => [n, f.raw_url]));
            if (!files["momentum.json"]) return { error: "w gistcie brak pliku momentum.json (wyślij dane z desktopa: ☁ Web)" };
            const manifest = await fetchJson(files["momentum.json"], "Gist: lista");
            return manifest && manifest.rows ? { kind: "gist", id, files, manifest } : { error: "nie udało się pobrać momentum.json z gista" };
        } catch (e) {
            return { error: "brak połączenia z GitHub" };
        }
    }

    // wybór źródła: tryb repo = zawsze repo; gist = gist (gdy dostępny); auto = nowsze z obu
    function chooseSource(repo, g) {
        const mode = state.gist.mode;
        if (!g || g.error || mode === "repo") return { kind: "repo" };
        if (mode === "gist" || !repo || (g.manifest.generated_at || "") > (repo.generated_at || "")) return g;
        return { kind: "repo" };
    }

    // seria wykresu: T = tygodniowe świece, M = zamknięte miesiące + bieżący miesiąc zbudowany z tygodniowych; false = brak danych
    async function loadSeries(t, per) {
        const key = per + ":" + t;
        if (builtCache.has(key)) return builtCache.get(key);
        let out;
        if (per === "M") {
            const [m, w] = await Promise.all([loadMonthly(t), loadWeekly(t)]);
            out = m && m.c && m.c.length > 1 ? monthlyWithOpen(m, w) : false;
        } else out = (await loadWeekly(t)) || false;
        builtCache.set(key, out);
        return out;
    }

    // seria z pustymi świecami po prawej (miejsce na linie w przyszłość); odświeżana przy zmianie serii / liczby świec / interwału
    function vseries() {
        if (!series) return null;
        const key = [current, period, futOf(), series.c.length];
        if (extCache.key && extCache.key.join() === key.join() && extCache.src === series) return extCache.val;
        extCache.key = key;
        extCache.src = series;
        extCache.val = extendData(series, futOf(), period);
        return extCache.val;
    }

    function compactChartUI() {
        return window.matchMedia("(max-width: 999px)").matches;
    }

    function chartHeading(t) {
        const r = rowFor(t) || {};
        if (!compactChartUI()) return titleText(t, r);
        const bits = [t];
        if (r.glb_pct !== null && r.glb_pct !== undefined) bits.push(`${r.glb_pct >= 0 ? "+" : ""}${r.glb_pct.toFixed(1)}% do GLB`);
        if (r.turnover) bits.push(`${(r.turnover / 1e6).toFixed(0)}M$/d`);
        return bits.join(" · ");
    }

    async function openChart(t) {
        current = t;
        document.body.classList.add("chart-open");
        $("chartTitle").textContent = chartHeading(t);
        $("tvLink").href = "https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(t.replace("^", ""));
        document.querySelectorAll("#tbody tr.sel").forEach((tr) => tr.classList.remove("sel"));
        const tr = document.querySelector(`#tbody tr[data-t="${CSS.escape(t)}"]`);
        if (tr) { tr.classList.add("sel"); tr.scrollIntoView({ block: "nearest" }); }
        series = null;
        end = null;   // długość okna zostaje między spółkami, koniec wraca do ostatniej świecy
        sel = null;
        gest = null;
        hint = null;
        renderTools();
        drawChart();
        renderPeriod();
        await loadChartData(t);
    }

    // seria i SPY bieżącego interwału; wynik trafia na wykres, o ile użytkownik nie zmienił spółki ani interwału w międzyczasie
    async function loadChartData(t) {
        const per = period;
        const [d, spx, spyM] = await Promise.all([loadSeries(t, per), loadSeries("SPY", per), loadSeries("SPY", "M")]);   // tło zawsze z SPY miesięcznego
        if (current !== t || period !== per) return;
        spxData = spx || null;
        spyMData = spyM || null;
        series = d || false;
        drawChart();
    }

    // przyciski T / M / Z, RWB, ⇥ (puste świece), ⤢ Cena
    function renderPeriod() {
        $("perW").textContent = "T";
        $("perM").textContent = "M";
        $("perW").classList.toggle("on", period === "W");
        $("perM").classList.toggle("on", period === "M");
        $("zangerBtn").classList.toggle("on", zanger && period === "W");
        $("rwbBtn").classList.toggle("on", !!state.rwb);
        $("futBtn").textContent = "⇥ " + futOf();
        $("priceBtn").classList.toggle("on", pvOf()[0] !== 1 || pvOf()[1] !== 0);
    }

    async function toggleZanger() {   // Z: widok Zangera (jak klawisz z w aplikacji desktopowej)
        if (!current) return;
        if (period !== "W") await togglePeriod("W");
        zanger = !zanger;
        renderPeriod();
        drawChart();
    }

    async function togglePeriod(to) {
        if (!current || to === period) return;
        period = to || (period === "M" ? "W" : "M");
        if (period !== "W") zanger = false;
        end = null;
        sel = null;
        renderPeriod();
        renderTools();
        series = null;
        drawChart();
        await loadChartData(current);
    }

    function setView(upd) {
        Object.assign(viewOf(), upd);
        saveSettings();
        renderPeriod();
        drawChart();
    }

    function cycleFuture() {
        const f = futOf(), i = FUTURE_STEPS.indexOf(f);
        end = null;
        setView({ fut: FUTURE_STEPS[(i + 1) % FUTURE_STEPS.length] });
    }

    // ręczny stop bieżącej spółki: etykieta na linii (cena, % od wejścia, liczba akcji z kalkulatora) i opcje wykresu
    function chartOpts() {
        const st = state.stops[current], [entry] = autoSizeDefaults();
        let label = "";
        if (st) {
            label = `STOP ${fmt(st)}` + (entry ? ` · ${st / entry - 1 >= 0 ? "+" : ""}${((st / entry - 1) * 100).toFixed(1)} %` : "");
            const fx = fxRate(), r = fx && entry && state.capital ? positionSize(state.capital, fx, entry, st, state.risk) : null;
            if (r && r.shares) label += ` · ${sharesText(r.shares)} akcji (${money(r.valuePln)} PLN)`;
        }
        const v = vseries();
        return { rwb: !!state.rwb, zanger: zanger && period === "W", spyM: spyMData, real: v ? v.real : undefined, pv: pvOf(), stop: st || null, stopLabel: label };
    }

    function drawChart() {
        const box = $("chartBody");
        $("tip").hidden = true;
        if (!current) return;
        if (!series) {
            $("slider").innerHTML = "";
            box.innerHTML = `<p class="note">${series === false ? (period === "M" ? "Brak danych miesięcznych." : "Brak danych tygodniowych.") : "Ładowanie…"}</p>`;
            return;
        }
        drawSlider();
        const row = rowFor(current) && { ...rowFor(current), exit: state.exit, plan: planFor(current) };
        const res = chartSvg(vseries(), row, Math.max(320, box.clientWidth), Math.max(360, box.clientHeight), nShowOf(), end, shownLines(current), sel, spxData || null, period, chartOpts());
        if (!res) { box.innerHTML = '<p class="note">Brak danych.</p>'; return; }
        box.innerHTML = res.svg;
        geom = res.geom;
        renderHint();
    }

    function drawSlider() {
        const el = $("slider");
        el.innerHTML = series ? sliderSvg(vseries().c, nShowOf(), end, el.clientWidth, el.clientHeight, period === "M" ? "mies." : "tyg.") : "";
    }

    // okno (n świec, koniec) — zawsze ≥ 2 prawdziwe świece w oknie; długość pamiętana osobno dla T i M
    function setWindow(n, e) {
        const v = vseries(), total = v.c.length;
        e = Math.min(e, v.real + Math.max(0, n - 2));
        viewOf().n = n >= total ? 100000 : n;
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
        const total = vseries().c.length, W = $("slider").clientWidth, x = sliderX(ev);
        const [x0, x1] = sliderRect(total, nShowOf(), end, W);
        let mode = sliderMode(x, x0, x1, ev.pointerType === "mouse" ? 9 : 16);
        if (mode === "jump") { setWindow(...sliderJump(x, total, nShowOf(), W)); mode = "move"; }
        drag = { mode, x, start: [nShowOf(), end] };
        $("slider").setPointerCapture(ev.pointerId);
        ev.preventDefault();
    }

    function sliderMove(ev) {
        if (!drag || !series) return;
        setWindow(...sliderDrag(drag.mode, drag.start, sliderX(ev) - drag.x, vseries().c.length, $("slider").clientWidth));
    }

    function zoom(factor) {
        if (series) setWindow(...zoomWindow(vseries().c.length, nShowOf(), end, factor));
    }

    function pan(d) {
        if (!series) return;
        const total = vseries().c.length, [i0, i1] = windowRange(total, nShowOf(), end);
        setWindow(i1 - i0, Math.max(i1 - i0, Math.min(total, i1 + d)));
    }

    // skala ceny: kółko nad osią (po prawej) albo z Shift = powiększ / zmniejsz, przeciąganie osi = przesuń w pionie, dwuklik na osi albo ⤢ Cena = automatyczna
    function priceZoom(factor) {
        setView({ z: Math.max(0.2, Math.min(8, pvOf()[0] * factor)) });
    }

    // ---------- linie trendu na wykresie ----------
    // mysz: przeciągnij po pustym miejscu = nowa linia; telefon: przytrzymaj palec ~0,4 s i prowadź = nowa linia (krótki ruch = dane tygodnia).
    // Chwyć koniec linii = zmień punkt, chwyć środek = przesuń całą; klik / dotknięcie linii = zaznacz (🗑 usuń, 🔔 alert); Delete = usuń.
    // linia ma interwał (period: W = T i widok Z, M); stare linie bez period są tygodniowe. Edytujesz tylko linie bieżącego interwału, drugiego interwału są blade (ro)
    const allLines = (t) => ast.lines[t] || [];
    const periodOf = (ln) => ln.period || "W";
    const linesOf = (t) => allLines(t).filter((x) => periodOf(x) === period);
    const shownLines = (t) => linesOf(t).concat(allLines(t).filter((x) => ["W", "M"].includes(periodOf(x)) && periodOf(x) !== period).map((x) => ({ ...x, ro: true })));
    const findLine = (id) => linesOf(current).find((x) => x.id === id);
    function setOwnLines(t, own) {
        const all = allLines(t).filter((x) => periodOf(x) !== period).concat(own);
        if (all.length) ast.lines[t] = all; else delete ast.lines[t];
    }

    function redrawSoon() {
        if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; drawChart(); });
    }

    function chartPt(ev) {
        const svg = $("chartBody").querySelector("svg"), r = svg.getBoundingClientRect();
        return { x: (ev.clientX - r.left) * geom.w / r.width, y: (ev.clientY - r.top) * geom.h / r.height };
    }

    // punkt wykresu -> {d, p} (tydzień + cena); snap = magnes do High / Low tygodnia
    function ptValue(x, y, tol) {
        const vs = vseries(), [y0, y1] = geom.price, i = Math.max(0, Math.min(geom.n - 1, Math.floor((x - geom.x0) / geom.step))), k = geom.i0 + i;
        const yf = (p) => y1 - (Math.log(p) - geom.lmin) / (geom.lmax - geom.lmin) * (y1 - y0);
        const p = Math.exp(geom.lmin + (y1 - y) / (y1 - y0) * (geom.lmax - geom.lmin));
        return { d: vs.d[k], p: +snapPrice(p, vs.h[k], vs.l[k], yf, y, tol).toPrecision(6), k };
    }

    function saveLines() {
        setOwnLines(current, linesOf(current).filter((x) => x.d1 !== x.d2));
        saveAlerts();
    }

    // miarka (prawy przycisk myszy na panelu ceny): % zmiany ceny i liczba świec od punktu kliknięcia — jak ChartWindow.ruler_move w desktopie
    function rulerPoint(pt) {
        const [y0, y1] = geom.price, y = Math.max(y0, Math.min(y1, pt.y));
        const i = Math.max(0, Math.min(geom.n - 1, Math.floor((pt.x - geom.x0) / geom.step)));
        return { p: Math.exp(geom.lmin + (y1 - y) / (y1 - y0) * (geom.lmax - geom.lmin)), k: geom.i0 + i, x: geom.x0 + (i + 0.5) * geom.step, y };
    }
    function drawRuler(pt) {
        const svg = $("chartBody").querySelector("svg"), old = svg && svg.querySelector("#ruler");
        if (old) old.remove();
        if (!svg || !gest || gest.mode !== "ruler") return;
        const a = gest.a, b = rulerPoint(pt), col = b.p >= a.p ? "#26a65b" : "#e5534b", right = b.x < geom.x1 - 240, txt = rulerText(a.p, b.p, a.k, b.k, period);
        const ty = b.y > a.y ? b.y + 16 : b.y - 8, wd = txt.length * 6.6 + 8, tx = right ? b.x + 10 : b.x - 10 - wd;
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.id = "ruler";
        g.innerHTML = `<rect x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(b.x - a.x)}" height="${Math.abs(b.y - a.y)}" fill="none" stroke="${col}" stroke-dasharray="3 3"/>` +
            `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${col}" stroke-width="1.5"/>` +
            `<rect x="${tx - 2}" y="${ty - 12}" width="${wd}" height="16" fill="#0e1116" opacity="0.9"/><text x="${tx + 2}" y="${ty}" fill="${col}" font-size="11">${escapeHtml(txt)}</text>`;
        svg.appendChild(g);
    }

    function chartDown(ev) {
        if (geom && series && ev.pointerType === "mouse" && ev.button === 1) {   // środkowy przycisk = swobodne przesuwanie wykresu (czas i cena naraz)
            const pt = chartPt(ev), [i0, i1] = windowRange(vseries().c.length, nShowOf(), end);
            $("chartBody").setPointerCapture(ev.pointerId);
            gest = { mode: "free", x: pt.x, y: pt.y, i1, s: pvOf()[1], n: i1 - i0 };
            ev.preventDefault();
            return;
        }
        if (geom && series && (ev.pointerType !== "mouse" || ev.button === 0)) {
            const pt = chartPt(ev), inPrice = pt.y >= geom.price[0] && pt.y <= geom.price[1];
            if (inPrice && pt.x > geom.x1) {   // oś ceny: przeciąganie = przesuwanie skali ceny w pionie
                $("chartBody").setPointerCapture(ev.pointerId);
                gest = { mode: "axis", y: pt.y, s: pvOf()[1] };
                ev.preventDefault();
                return;
            }
            if (inPrice && geom.stopY != null && pt.x >= geom.x0 && pt.x <= geom.x1 && Math.abs(pt.y - geom.stopY) <= (ev.pointerType === "mouse" ? 6 : 14)
                && !hitLine(geom.segs || [], pt.x, pt.y, ev.pointerType === "mouse" ? 9 : 24)) {   // chwycona linia ręcznego stopu: przeciąganie w pionie
                $("chartBody").setPointerCapture(ev.pointerId);
                gest = { mode: "stop" };
                ev.preventDefault();
                return;
            }
        }
        if (geom && series && ev.pointerType === "mouse" && ev.button === 2) {   // prawy przycisk = miarka
            const pt = chartPt(ev);
            if (pt.y < geom.price[0] || pt.y > geom.price[1]) return;
            $("chartBody").setPointerCapture(ev.pointerId);
            gest = { mode: "ruler", a: rulerPoint(pt) };
            ev.preventDefault();
            return;
        }
        if (!geom || !series || (ev.pointerType === "mouse" && ev.button !== 0)) return;
        const pt = chartPt(ev), touch = ev.pointerType !== "mouse", tol = touch ? 24 : 9;
        const hit = hitLine(geom.segs || [], pt.x, pt.y, tol);
        $("chartBody").setPointerCapture(ev.pointerId);
        if (hit) {
            sel = hit.id;
            const ln = findLine(hit.id);
            const vd = vseries().d;
            gest = { mode: hit.part, x: pt.x, y: pt.y, orig: { ...ln }, ka: vd.indexOf(ln.d1), kb: vd.indexOf(ln.d2), tol, snap: JSON.stringify(linesOf(current)) };
            renderTools();
            redrawSoon();
            ev.preventDefault();
            return;
        }
        if (pt.y < geom.price[0] || pt.y > geom.price[1]) return;
        if (drawMode) {   // tryb ✏: jedno przeciągnięcie (mysz albo palec) = nowa linia, bez przytrzymywania
            gest = { mode: "draw", x: pt.x, y: pt.y, tol };
            startDraw(pt.x, pt.y);
            ev.preventDefault();
            return;
        }
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
        setOwnLines(current, linesOf(current).concat([{ id, period, d1: a.d, p1: a.p, d2: a.d, p2: a.p, alert: false }]));   // nowa linia: bez alarmu i przedłużenia — alarm użytkownik włącza sam
        sel = id;
        gest.mode = "p2";
        gest.orig = { ...findLine(id) };
        gest.snap = JSON.stringify(linesOf(current).filter((x) => x.id !== id));   // stan sprzed nowej linii (do ↶)
        $("tip").hidden = true;
        renderTools();
        redrawSoon();
    }

    function chartMoveGest(ev) {
        if (!gest) return;
        if (gest.mode === "ruler") { drawRuler(chartPt(ev)); return; }
        if (gest.mode === "axis") {   // przesunięcie skali ceny (dodatnie s = w górę)
            const [y0, y1] = geom.price;
            viewOf().s = gest.s + (chartPt(ev).y - gest.y) / (y1 - y0) / pvOf()[0];
            renderPeriod();
            redrawSoon();
            return;
        }
        if (gest.mode === "stop") {
            const pt = chartPt(ev), y = Math.max(geom.price[0] + 1, Math.min(geom.price[1] - 1, pt.y));
            state.stops[current] = ptValue(pt.x, y, 8).p;
            redrawSoon();
            return;
        }
        if (gest.mode === "free") {   // środkowy przycisk: czas i cena naraz
            const pt = chartPt(ev), [y0, y1] = geom.price, vs = vseries();
            viewOf().s = gest.s + (pt.y - gest.y) / (y1 - y0) / pvOf()[0];
            const e2 = Math.max(gest.n, Math.min(vs.c.length, gest.i1 - Math.round((pt.x - gest.x) / geom.step)));
            setWindow(gest.n, e2);
            return;
        }
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
            const me = gest.mode[1], other = me === "1" ? "2" : "1", v = ptValue(pt.x, pt.y, gest.tol);
            const [y0, y1] = geom.price, yf = (p) => y1 - (Math.log(p) - geom.lmin) / (geom.lmax - geom.lmin) * (y1 - y0);
            const flat = snapHorizontal(v.p, ln["p" + other], yf, pt.y, gest.tol * 0.6) === ln["p" + other] && ln["d" + other] !== v.d;
            ln["d" + me] = v.d;
            ln["p" + me] = flat ? ln["p" + other] : v.p;
            const k1 = vseries().d.indexOf(ln["d" + other]), k2 = v.k;
            hint = { x: geom.x0 + (k2 - geom.i0 + 0.5) * geom.step, y: yf(ln["p" + me]), flat, text: rulerText(ln["p" + other], ln["p" + me], k1, k2, period) + (flat ? " · poziomo" : "") };
        } else if (gest.mode === "body" && gest.ka >= 0 && gest.kb >= 0) {
            const vd = vseries().d, last = vd.length - 1, db = Math.round((pt.x - gest.x) / geom.step);
            const d = Math.max(-Math.min(gest.ka, gest.kb), Math.min(last - Math.max(gest.ka, gest.kb), db));
            const ratio = Math.exp(-(pt.y - gest.y) / (geom.price[1] - geom.price[0]) * (geom.lmax - geom.lmin));
            Object.assign(ln, { d1: vd[gest.ka + d], d2: vd[gest.kb + d], p1: +(gest.orig.p1 * ratio).toPrecision(6), p2: +(gest.orig.p2 * ratio).toPrecision(6) });
        }
        ev.preventDefault();
        redrawSoon();
    }

    function chartUp() {
        if (!gest) return;
        if (gest.mode === "ruler") { gest = null; drawRuler(null); return; }
        if (["axis", "stop", "free"].includes(gest.mode)) { saveSettings(); gest = null; renderTools(); drawChart(); return; }
        clearTimeout(gest.timer);
        hint = null;
        if (gest.mode === "press" || gest.mode === "pend") { sel = null; renderTools(); redrawSoon(); }   // dotknięcie / klik obok linii = odznacz
        else if (gest.mode !== "scrub") {
            saveLines();
            if (gest.snap !== undefined && gest.snap !== JSON.stringify(linesOf(current))) pushUndo(gest.snap);   // zmiana -> można cofnąć
            if (!findLine(sel)) sel = null;
            renderTools();
            redrawSoon();
        }
        gest = null;
    }

    // ---------- cofanie ----------
    const undoStack = () => { if (!lineUndo.has(current)) lineUndo.set(current, []); return lineUndo.get(current); };
    function pushUndo(snap) {
        const st = undoStack();
        st.push(snap);
        if (st.length > 30) st.shift();
        renderTools();
    }
    function undoLine() {
        const snap = undoStack().pop();
        if (snap === undefined) return;
        setOwnLines(current, JSON.parse(snap));
        sel = null;
        saveAlerts();
        renderTools();
        drawChart();
    }

    // podgląd przy rysowaniu / ciągnięciu końca: kółko w punkcie i napis „% · tygodnie · cena" (jak miarka); „poziomo", gdy zadziałał magnes
    function renderHint() {
        const svg = $("chartBody").querySelector("svg");
        if (!svg || !hint || !gest) return;
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const txt = hint.text, wd = txt.length * 6.6 + 10, right = hint.x < geom.x1 - wd - 14, tx = right ? hint.x + 12 : hint.x - 12 - wd, ty = Math.max(geom.price[0] + 14, hint.y - 14);
        g.innerHTML = `<circle cx="${hint.x}" cy="${hint.y}" r="9" fill="none" stroke="${hint.flat ? "#f0b429" : "#4da3ff"}" stroke-width="2"/>` +
            `<rect x="${tx - 3}" y="${ty - 12}" width="${wd}" height="17" fill="#0e1116" opacity="0.92"/><text x="${tx + 2}" y="${ty}" fill="${hint.flat ? "#f0b429" : "#d6dde6"}" font-size="12">${escapeHtml(txt)}</text>`;
        svg.appendChild(g);
    }

    function deleteSelected() {
        if (!sel) return;
        pushUndo(JSON.stringify(linesOf(current)));
        setOwnLines(current, linesOf(current).filter((x) => x.id !== sel));
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
        const ln = sel && findLine(sel), compact = compactChartUI();
        $("fundBtn").textContent = compact ? "📊 Fund." : "📊 Fundamenty";
        $("tvLink").textContent = compact ? "TV ↗" : "TradingView ↗";
        $("posBtn").classList.toggle("on", !!(current && ast.pos[current]));
        $("posBtn").textContent = compact
            ? (current && ast.pos[current] ? "📌 Mam" : "📌 Pozycja")
            : (current && ast.pos[current] ? "📌 Mam pozycję" : "📌 Pozycja");
        $("exitBtn").textContent = compact
            ? (state.exit === "GLB" ? "🚪 GLB" : "🚪 MACD")
            : (state.exit === "GLB" ? "🚪 Wyjście: pod GLB" : "🚪 Wyjście: MACD");
        const stopOn = !!(current && state.stops[current]);
        $("stopBtn").classList.toggle("on", stopOn);
        $("stopBtn").textContent = compact ? (stopOn ? "🛑 ✕" : "🛑") : (stopOn ? "🛑 Stop ✕" : "🛑 Stop");
        $("sizeBtn").textContent = compact ? "💰" : "💰 Wielkość";
        $("watchBtn").classList.toggle("on", !!(current && ast.watch[current]));
        $("watchBtn").textContent = compact
            ? (current && ast.watch[current] ? "🔔 On" : "🔕 Obserwuj")
            : (current && ast.watch[current] ? "🔔 Obserwujesz" : "🔕 Obserwuj");
        const canDraw = !!current;
        $("drawBtn").hidden = !canDraw;
        $("drawBtn").classList.toggle("on", drawMode && canDraw);
        $("drawBtn").textContent = compact ? "✏" : "✏ Linia";
        $("chartBody").classList.toggle("drawing", drawMode && canDraw);
        $("undoBtn").hidden = !canDraw || !(lineUndo.get(current) || []).length;
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

    // panel fundamentów jak desktop chart.fund_panel_lines (domyślne warunki: przychody + marża; P/S, RS i beat2 wyłączone)
    function openFundamentals(t) {
        const r = rowFor(t);
        if (!r) return;
        const e = escapeHtml, f = (x) => (x == null ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: 2 }));
        const v = (x, u, d = 1) => (x == null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(d) + u);
        const pos = ast.pos[t], pl = planFor(t), out = [];
        const add = (txt, cls) => out.push(`<div class="fl ${cls}">${e(txt)}</div>`);
        const val = (k, x) => out.push(`<div class="fl val"><span>${e(k)}</span><b>${e(x)}</b></div>`);
        add((r.ok ? "✓ spełnia warunki" : "✗ nie spełnia warunków") + (pos ? "   ·   📌 masz pozycję" : ""), r.ok ? "status_ok" : "status_no");
        if (r.slow) add(r.slow === "HAMUJE+MB" ? "⚠⚠ hamuje + marża brutto spada" : "⚠ hamuje (tempo przychodów −10 pp lub więcej)", "warn");
        add(`OSTATNI RAPORT · kwartał ${r.quarter || "—"}`, "sec");
        val("Przychody r/r", v(r.rev_rr, " %")); val("  poprzedni kw.", v(r.rev_rr1, " %")); val("  zmiana tempa", v(r.accel, " pp"));
        val("Δ marży oper. r/r", v(r.dopm, " pp")); val("  poprzedni kw.", v(r.dopm1, " pp")); val("Marża oper.", v(r.opm, " %"));
        val("Δ marży brutto r/r", v(r.dgm, " pp")); val("Wycena P/S", r.ps ? r.ps.toFixed(1) : "—"); val("RS 52 tyg. vs S&P", v(r.rs, " pp"));
        val("RS sektora (ETF / SPY nad SMA 52)", v(r.sector_rs, " %"));
        val("Wzorzec Zangera", r.pattern ? `${r.pattern} · ${r.pattern_state} · ${v(r.pattern_pct, " % do kupna")}` : "—"); val("Ostrzeżenie wzorca", r.pattern_exit || "—"); val("Parabolic Curve (wyjście)", r.parabola ? r.parabola.note : "—"); val("EPS Rating (1–99, przybliżenie IBD)", r.eps_rating == null ? "—" : String(r.eps_rating));
        val("  wzrost EPS 2 ost. kw. r/r", v(r.eps_g2, " %", 0)); val("  EPS 3 lata (TTM, rocznie)", v(r.eps_cagr3, " %", 0));
        val("  stabilność (kw. ze wzrostem r/r)", r.eps_stab == null ? "—" : Math.round(r.eps_stab * 100) + " %");
        val("Niespodzianka EPS", v(r.surp, " %")); val("Rewizja EPS 90 dni", v(r.eps_rev, " %"));
        val("Obrót dzienny", r.turnover ? `${(r.turnover / 1e6).toFixed(0)} mln $` : "—"); val("Do Green Line", v(r.glb_pct, " %"));
        add("LISTA KONTROLNA", "sec");
        const item = (ok, txt) => add((ok === true ? "✓ " : ok === false ? "✗ " : "— ") + txt, ok === true ? "ok" : ok === false ? "no" : "na");
        const cond = (x, test) => (x == null ? null : test(x));
        item(cond(r.rev_rr, (x) => x >= 15), "przychody kw. ≥ +15 % r/r");
        item(cond(r.dopm, (x) => x >= 3), "marża oper. ≥ +3 pp r/r");
        item(null, "wycena P/S — kryterium wyłączone (próg 20)");
        item(null, "siła względna — kryterium wyłączone (próg +50 pp)");
        item(null, "2 ostatnie raporty EPS — kryterium wyłączone");
        item(isSignal(r) ? true : ["NAD", "BLUE DOT", "WYBICIE"].includes(r.glb_state) ? null : false, `Green Line: ${r.glb_state || "—"} (kupno: zamknięcie tygodnia 0–10 % nad linią po przebiciu od dołu)`);
        item(r.macd === "nad", `MACD tyg. ${r.macd || "—"} sygnałem` + (r.macd_stop ? ` · stop ${r.macd_stop.toFixed(2)}` : ""));
        item(r.slow ? false : r.accel == null ? null : true, "brak hamowania przychodów");
        item(r.glb == null || r.price == null ? null : r.price >= r.glb, `zamknięcie nad Green Line ${f(r.glb)} (wyjście metodą GLB: zamknięcie tyg. pod linią)`);
        if (pl) {
            const g = state.exit === "GLB";
            add("PLAN WYJŚCIA · metoda " + (g ? "pod GLB" : "MACD"), "sec");
            val("Kupno", f(pl.entry)); val("Stop −10 %", f(pl.stopInit)); val("Szczyt od wejścia", f(pl.peak)); val("½ przy (−20 %)", f(pl.halfAt));
            val("Reszta", g ? `zamknięcie tyg. pod Green Line ${f(r.glb)}` : `stop MACD od wejścia ${f(pl.macdStop)}`);
            if (pl.half) add(`⚠ Zamknięcie ${f(pl.last)} jest ≥ 20 % pod szczytem ${f(pl.peak)} — sprzedaj połowę.`, "warn");
            if (g ? pl.glbExit : pl.macdStop && (r.price || 0) < pl.macdStop) add("⚠ Sygnał wyjścia (" + (g ? "zamknięcie pod Green Line" : "zamknięcie pod stopem MACD") + ").", "warn");
        }
        if (pos && r.slow) add(`⚠ Masz pozycję, a raport pokazuje hamowanie${r.slow === "HAMUJE+MB" ? " i spadek marży brutto" : ""} — spadek ≥ 20 % w 6 mies. w ${r.slow === "HAMUJE+MB" ? "50" : "44"} % przypadków (normalnie 33 %). Rozważ zacieśnienie stopu.`, "warn");
        $("fundTitle").textContent = t + " · " + (r.company || "") + " · Fundamenty";
        $("fundBody").innerHTML = out.join("") + "<div class='dlg-btns'><button type='button' data-t='" + e(t) + "'>Otwórz wykres</button><button type='button' data-close-fund>Zamknij</button></div>";
        $("fundDlg").showModal();
    }

    // ---------- panel: pozycje (plan wyjścia, co zrobić teraz) i obserwowane ----------
    async function openPositions() {
        await Promise.all(Object.keys(ast.pos).filter((t) => rowFor(t)).map((t) => loadWeekly(t)));
        const f = (v) => (v == null ? "—" : v.toFixed(2)), pct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`), e = escapeHtml;
        const free = Math.max(0, MAX_POSITIONS - Object.keys(ast.pos).length);
        $("posMethod").textContent = (state.exit === "GLB" ? "wyjście: pod GLB (zamknięcie tygodnia pod Green Line)" : "wyjście: MACD (stop pod Low tygodnia przecięcia w dół po wejściu) lub −10 %") +
            ` · wolne miejsca: ${free} z ${MAX_POSITIONS}` + (free ? ` → ok. ${free * 100 / MAX_POSITIONS} % kapitału trzymaj w SPY do nowego sygnału` : "");
        const pos = Object.entries(ast.pos).map(([t, p]) => {
            const r = rowFor(t) || {}, pl = positionPlan(p, weeklyData.get(t), r), last = pl.last != null ? pl.last : r.price;
            const st = positionStatus(pl, r, state.exit), ex = state.exit === "GLB" ? r.glb : pl.macdStop;
            return `<tr class="${st.length ? "warn" : ""}"><td><button type="button" data-t="${e(t)}">${e(t)}</button></td><td class="now">${e(st.join(" · ") || "trzymaj")}</td><td>${e(p.since || "")}</td><td>${f(pl.entry)}</td>` +
                `<td>${f(last)}</td><td>${pct(last && pl.entry ? (last / pl.entry - 1) * 100 : null)}</td><td>${f(pl.peak)}</td><td>${f(pl.halfAt)}</td><td>${f(pl.stopInit)}</td>` +
                `<td>${f(ex)}</td><td>${e(r.glb_state || "")}</td><td>${e(r.macd || "")}</td>` +
                `<td><button type="button" data-edit-pos="${e(t)}" title="Edytuj datę i cenę wejścia">Edytuj</button> <button type="button" data-del-pos="${e(t)}" title="Usuń pozycję">✕</button></td></tr>`;
        });
        $("posTable").innerHTML = "<tr><th>Ticker</th><th>Co teraz</th><th>Od</th><th>Kupno</th><th>Cena</th><th>Zmiana %</th><th>Szczyt</th><th>½ przy</th><th>Stop −10 %</th>" +
            `<th>Wyjście</th><th>GLB</th><th>MACD</th><th></th></tr>` + (pos.join("") || '<tr><td colspan="13">Brak pozycji (📌 Pozycja na wykresie).</td></tr>');
        const watch = Object.keys(ast.watch).filter((t) => !ast.pos[t]).map((t) => {
            const r = rowFor(t) || {};
            return `<tr><td><button type="button" data-t="${e(t)}">${e(t)}</button></td><td>${f(r.price)}</td><td>${f(r.glb)}</td><td>${pct(r.glb_pct)}</td><td>${e(r.glb_state || "")}</td>` +
                `<td>${e(r.macd || "")}</td><td>${r.trend ? "✓" : ""}</td><td>${pct(r.rs)}</td>` +
                `<td><button type="button" data-del-watch="${e(t)}" title="Przestań obserwować">✕</button></td></tr>`;
        });
        $("watchTable").innerHTML = "<tr><th>Ticker</th><th>Cena</th><th>Green Line</th><th>Do linii %</th><th>GLB</th><th>MACD</th><th>SMA 10>30</th><th>RS pp</th><th></th></tr>" +
            (watch.join("") || '<tr><td colspan="9">Brak obserwowanych (🔕 Obserwuj na wykresie).</td></tr>');
        if (!$("posDlg").open) $("posDlg").showModal();
    }

    function posListClick(ev) {
        const b = ev.target.closest("button");
        if (!b) return;
        if (b.dataset.t && rowFor(b.dataset.t)) { $("posDlg").close(); openChart(b.dataset.t); return; }
        if (b.dataset.editPos) {
            const t = b.dataset.editPos, p = ast.pos[t];
            if (!p) return;
            const since = window.prompt("Data wejścia (RRRR-MM-DD):", p.since || "");
            if (since === null) return;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || Number.isNaN(Date.parse(since))) { window.alert("Podaj datę w formacie RRRR-MM-DD."); return; }
            const raw = window.prompt("Rzeczywista cena kupna:", String(p.price ?? ""));
            if (raw === null) return;
            const price = Number(raw.replace(",", "."));
            if (!Number.isFinite(price) || price <= 0) { window.alert("Cena musi być liczbą większą od zera."); return; }
            p.since = since; p.price = price;
        } else if (b.dataset.delPos) delete ast.pos[b.dataset.delPos];
        else if (b.dataset.delWatch) delete ast.watch[b.dataset.delWatch];
        else return;
        saveAlerts();
        renderTable();
        openPositions();
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
            if (!NUMERIC_FORMATS.includes(fm)) continue;
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
        const index = geom.i0 + i, vs = vseries(), activeRow = rowFor(current) || {};
        if (index >= vs.real) {   // puste miejsce w przyszłości: tylko data (tu rysuje się linie)
            tip.innerHTML = escapeHtml(`${vs.d[index]} · przyszłość`);
            tip.hidden = false;
            const bx0 = $("chartPane").getBoundingClientRect(), left0 = p.clientX - bx0.left;
            tip.style.left = (left0 < bx0.width - 200 ? left0 + 14 : left0 - 190) + "px";
            tip.style.top = (p.clientY - bx0.top + 12) + "px";
            return;
        }
        const lines = infoLines(series, index, period);
        if (period === "W") {   // E = raport kwartalny w tym tygodniu: niespodzianka EPS / przychodów (dymek jak earnings_tooltip_lines)
            const pctS = (x) => (x == null ? "N/D" : `${x >= 0 ? "+" : ""}${Number(x).toFixed(1)}%`);
            for (const [d0, es, rs0] of activeRow.earn || []) if (earningsIndices(series.d, [d0]).includes(index)) lines.push(`WYNIKI · ${d0} · EPS ${pctS(es)} · przychody ${pctS(rs0)}`);
        }
        if (state.rwb && !zanger) {   // start RWB = dokup, Blue Dot (tylko do odczytu na świecy)
            const closes = series.c.map((v) => v || 0);
            if (rwbStarts(closes).includes(index)) lines.push(`RWB START · dokup (stop pod Low ${series.l[index] == null ? "—" : series.l[index].toFixed(2)})`);
            const [lvl] = glbPeak({ ...series, real: series.c.length }, activeRow, period);
            if (blueDots(series.h, series.l, series.c, lvl).includes(index)) lines.push("BLUE DOT · " + series.d[index], "Stop pod Low: " + (series.l[index] == null ? "—" : series.l[index].toFixed(2)));
        }
        if (activeRow.glb != null && series.c[index] != null) {
            lines.push(`GLB ${activeRow.glb.toFixed(2)} · cena ${series.c[index] >= activeRow.glb ? "NAD" : "POD"} linią`);
            if (activeRow.plan) {
                if (activeRow.plan.stopInit != null) lines.push(`Stop −10%: ${activeRow.plan.stopInit.toFixed(2)}`);
                if (activeRow.plan.halfAt != null) lines.push(`Sprzedaż połowy: ${activeRow.plan.halfAt.toFixed(2)}`);
            }
        }
        tip.innerHTML = lines.map(escapeHtml).join("<br>");
        tip.hidden = false;
        const bx = $("chartPane").getBoundingClientRect(), left = p.clientX - bx.left;
        tip.style.left = (left < bx.width - 200 ? left + 14 : left - 190) + "px";
        tip.style.top = (p.clientY - bx.top + 12) + "px";
    }

    // ---------- ręczny stop i wielkość pozycji (kapitał w PLN, akcje ułamkowe) — jak desktop PositionSizeDialog ----------
    const money = (v, d = 0) => v.toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[\u00a0\u202f]/g, " ");
    const num = (txt) => { const n = parseFloat(String(txt).replace(/[\s\u00a0]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

    function fxRate() {
        try { const f = JSON.parse(localStorage.getItem(FX_KEY)); return f && f.usdpln > 0 ? f.usdpln : null; } catch (e) { return null; }
    }

    // kurs USD/PLN (NBP, awaryjnie Frankfurter) — przeglądarka nie dostanie Yahoo (CORS); przy braku sieci zostaje poprzedni albo wpisany ręcznie
    async function refreshFx() {
        const sources = [
            ["https://api.nbp.pl/api/exchangerates/rates/a/usd/?format=json", (j) => j.rates[0].mid],
            ["https://api.frankfurter.app/latest?from=USD&to=PLN", (j) => j.rates.PLN],
        ];
        for (const [url, pick] of sources) {
            try {
                const r = await fetch(url);
                if (!r.ok) continue;
                const v = pick(await r.json());
                if (v > 0) {
                    try { localStorage.setItem(FX_KEY, JSON.stringify({ usdpln: v, date: new Date().toISOString().slice(0, 10) })); } catch (e) { /* tryb prywatny */ }
                    return v;
                }
            } catch (e) { /* następne źródło */ }
        }
        return null;
    }

    // wejście i stop z 📌 pozycji (stop = większy z −10 % i MACD od wejścia) albo cena i Green Line / −10 %
    function autoSizeDefaults() {
        const r = rowFor(current) || {}, pos = ast.pos[current];
        if (pos && pos.price) {
            const pl = planFor(current) || {};
            return [pos.price, Math.max(pl.macdStop || 0, pl.stopInit || 0) || null, "📌 pozycja: wejście z chwili kliknięcia, stop = większy z −10 % i stopu MACD od wejścia."];
        }
        const last = r.price || null;
        if (last && r.glb && r.glb < last) return [last, r.glb, "Bez pozycji: wejście = ostatnia cena, stop = Green Line."];
        return [last, last ? last * 0.9 : null, "Bez pozycji: wejście = ostatnia cena, stop = −10 % (Green Line nie jest pod ceną)."];
    }

    function sizeDefaults() {
        const [entry, stop, src] = autoSizeDefaults(), manual = state.stops[current];
        return manual ? [entry, manual, "Stop ręczny z wykresu — przeciągnij czerwoną linię STOP (albo dwuklik na wykresie), aby go zmienić."] : [entry, stop, src];
    }

    // ustawia (price) albo usuwa (null) ręczny stop spółki; ten sam poziom na T, M i Z
    function setStop(price, sync = true) {
        if (price) state.stops[current] = +Number(price).toPrecision(6); else delete state.stops[current];
        saveSettings();
        renderTools();
        drawChart();
        if (sync && $("sizeDlg").open) loadSizeDefaults();
    }

    function toggleStop() {
        if (!current) return;
        if (state.stops[current]) { setStop(null); return; }
        const [entry, stop] = autoSizeDefaults();
        setStop(stop || (entry ? entry * 0.9 : null));
    }

    function sizeLines(r, ticker) {
        if (!r) return ["Podaj kapitał, ryzyko, kurs, cenę wejścia i stop pod ceną wejścia."];
        const out = [`Kapitał ${money(r.capitalUsd)} USD · ryzyko ${money(r.riskPln)} PLN (${money(r.riskUsd)} USD)`, `Strata na akcję przy stopie: ${money(r.perShare, 2)} USD`, ""];
        if (r.shares) out.push(`POZYCJA ${ticker}: ${sharesText(r.shares)} akcji (ogranicza: ${r.limitedBy})`, `Wartość: ${money(r.valueUsd)} USD = ${money(r.valuePln)} PLN (${money(r.valuePct, 1)} % kapitału)`,
            `Strata przy stopie: ${money(r.lossUsd)} USD = ${money(r.lossPln)} PLN (${money(r.lossPct, 2)} % kapitału)`);
        else out.push("POZYCJA: 0 akcji — kapitał albo ryzyko są za małe");
        out.push("", `Cały kapitał: ${sharesText(r.fullShares)} akcji → strata przy stopie ${money(r.fullLossUsd)} USD = ${money(r.fullLossPln)} PLN (${money(r.fullLossPct, 2)} % kapitału)`);
        return out;
    }

    let sizeLoading = false;
    function loadSizeDefaults() {
        const [entry, stop, src] = sizeDefaults();
        sizeLoading = true;
        $("szEntry").value = entry == null ? "" : entry.toFixed(2);
        $("szStop").value = stop == null ? "" : stop.toFixed(2);
        sizeLoading = false;
        $("sizeTitle").textContent = "Wielkość pozycji · " + current;
        $("szNote").textContent = src;
        recalcSize();
    }

    function recalcSize() {
        const v = { capital: num($("szCapital").value), risk: num($("szRisk").value), fx: num($("szFx").value), entry: num($("szEntry").value), stop: num($("szStop").value) };
        if (v.capital > 0 && v.risk != null && v.risk >= 0 && (state.capital !== v.capital || state.risk !== v.risk)) {   // zapamiętujemy kapitał i ryzyko
            state.capital = v.capital;
            state.risk = v.risk;
            saveSettings();
            if (state.stops[current]) drawChart();   // napis na linii stopu pokazuje liczbę akcji dla nowego kapitału / ryzyka
        }
        if (v.fx > 0) try { localStorage.setItem(FX_KEY, JSON.stringify({ usdpln: v.fx, date: new Date().toISOString().slice(0, 10) })); } catch (e) { /* tryb prywatny */ }
        let out = sizeLines(positionSize(v.capital, v.fx, v.entry, v.stop, v.risk), current);
        if (v.entry && v.stop && v.stop >= v.entry) out = ["Stop jest na poziomie ceny wejścia albo nad nią — ryzyka nie da się policzyć (wpisz stop pod ceną wejścia)."];
        $("szOut").textContent = out.join("\n");
    }

    async function openSize() {
        if (!current) return;
        $("szCapital").value = String(state.capital);
        $("szRisk").value = String(state.risk);
        const fx = fxRate();
        $("szFx").value = fx ? fx.toFixed(4) : "";
        loadSizeDefaults();
        if (!$("sizeDlg").open) $("sizeDlg").showModal();
        let today = false;
        try { today = (JSON.parse(localStorage.getItem(FX_KEY)) || {}).date === new Date().toISOString().slice(0, 10); } catch (e) { /* tryb prywatny */ }
        if (!fx || !today) await pullFx();
    }

    async function pullFx() {
        const v = await refreshFx();
        if (v) { $("szFx").value = v.toFixed(4); recalcSize(); if (state.stops[current]) drawChart(); }
        else if (!$("szFx").value) $("szNote").textContent = "Brak sieci — wpisz kurs USD/PLN ręcznie.";
    }

    function szInput(e) {
        if (sizeLoading) return;
        if (e.target.id === "szStop") {   // stop wpisany w oknie = ręczny stop na wykresie (programowe wypełnianie pól go nie ustawia)
            const v = num($("szStop").value);
            if (v && v > 0 && v !== state.stops[current]) setStop(v, false);
        }
        recalcSize();
    }

    // okno ☁ Gist: ID gista z desktopa (☁ Web), tryb wyboru źródła i daty obu źródeł
    function openGist() {
        $("gistId").value = state.gist.id || "";
        $("gistMode").value = state.gist.mode || "auto";
        const d = (x) => (x ? `${x.at ? x.at.slice(0, 16).replace("T", " ") : "—"} · ostatni tydzień ${x.asOf || "—"} · ${x.n} spółek` : "brak");
        $("gistInfo").innerHTML = `Repo (Weekly Refresh): ${escapeHtml(d(gistInfo.repo))}<br>Gist (desktop): ${escapeHtml(gistInfo.gist ? d(gistInfo.gist) : gistInfo.error ? "⚠ " + gistInfo.error : state.gist.id ? "—" : "nie ustawiono")}` +
            `<br>Używane teraz: <b>${source.kind === "gist" ? "gist" : "repo"}</b>`;
        $("gistDlg").showModal();
    }

    function saveGist() {
        state.gist = { id: $("gistId").value.trim(), mode: $("gistMode").value };
        saveSettings();
        $("gistDlg").close();
        window.location.reload();   // lista i serie wczytują się od nowa z wybranego źródła
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
        $("search").addEventListener("input", renderTable);
        $("thead").addEventListener("click", (e) => {
            const th = e.target.closest("th");
            if (!th) return;
            const k = th.dataset.key;
            state.sort = state.sort && state.sort.key === k ? (state.sort.dir > 0 ? { key: k, dir: -1 } : null)
                : { key: k, dir: TEXT_COLS.includes(k) || k === "rwb_weeks" ? 1 : -1 };   // RWB tyg.: najpierw najświeższe starty
            saveSettings(); renderHead(); renderTable();
        });
        $("tbody").addEventListener("click", (e) => {
            const fund = e.target.closest("button[data-fundamentals]");
            if (fund) { e.stopPropagation(); openFundamentals(fund.dataset.fundamentals); return; }
            const tr = e.target.closest("tr[data-t]");
            if (tr) openChart(tr.dataset.t);
        });
        $("fundBody").addEventListener("click", (e) => {
            if (e.target.closest("[data-close-fund]")) { $("fundDlg").close(); return; }
            const b = e.target.closest("button[data-t]");
            if (b && rowFor(b.dataset.t)) { $("fundDlg").close(); openChart(b.dataset.t); }
        });
        $("fundBtn").addEventListener("click", () => { if (current) openFundamentals(current); });
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
        $("perM").addEventListener("click", () => togglePeriod("M"));
        $("zangerBtn").addEventListener("click", toggleZanger);
        $("rwbBtn").addEventListener("click", () => { state.rwb = !state.rwb; saveSettings(); renderPeriod(); drawChart(); });
        $("futBtn").addEventListener("click", cycleFuture);
        $("priceBtn").addEventListener("click", () => setView({ z: 1, s: 0 }));
        $("stopBtn").addEventListener("click", toggleStop);
        $("sizeBtn").addEventListener("click", openSize);
        $("sizeDlg").addEventListener("input", szInput);
        $("szFxBtn").addEventListener("click", pullFx);
        $("szDefaults").addEventListener("click", loadSizeDefaults);
        $("drawBtn").addEventListener("click", () => { drawMode = !drawMode; renderTools(); });
        $("undoBtn").addEventListener("click", undoLine);
        $("lineAlertBtn").addEventListener("click", toggleLineAlert);
        $("lineDelBtn").addEventListener("click", deleteSelected);
        $("fltBtn").addEventListener("click", () => { renderFilters(); $("fltDlg").showModal(); });
        $("gistBtn").addEventListener("click", openGist);
        $("gistSave").addEventListener("click", saveGist);
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
            el.addEventListener("wheel", (e) => {
                if (!series) return;
                e.preventDefault();
                if (el === body && geom && (e.shiftKey || chartPt(e).x > geom.x1)) priceZoom(e.deltaY < 0 ? 1.18 : 0.85);   // nad osią ceny / z Shift: skala ceny
                else zoom(e.deltaY < 0 ? 0.85 : 1.18);
            }, { passive: false });
        }
        body.addEventListener("dblclick", (ev) => {   // dwuklik: na osi ceny = skala automatyczna, na cenie = stop w tym miejscu (magnes do High / Low)
            if (!geom || !series) return;
            const pt = chartPt(ev);
            if (pt.y < geom.price[0] || pt.y > geom.price[1]) return;
            if (pt.x > geom.x1) setView({ z: 1, s: 0 });
            else if (pt.x >= geom.x0) { gest = null; setStop(ptValue(pt.x, pt.y, 8).p); }
        });
        let rt = null;
        window.addEventListener("resize", () => {
            clearTimeout(rt);
            rt = setTimeout(() => {
                if (current) {
                    $("chartTitle").textContent = chartHeading(current);
                    renderTools();
                    renderPeriod();
                }
                drawChart();
            }, 120);
        });
        document.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSymbol(); return; }
            if ($("symDlg").open || $("fltDlg").open || $("alertDlg").open || $("posDlg").open || e.target.matches("input")) return;
            if (current && sel && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); deleteSelected(); return; }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); step(e.key === "ArrowDown" ? 1 : -1); }
            else if (current && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); pan(e.key === "ArrowLeft" ? -4 : 4); }
            else if (current && (e.key === "+" || e.key === "-")) zoom(e.key === "+" ? 0.85 : 1.18);
            else if (current && e.key.toLowerCase() === "z" && !(e.ctrlKey || e.metaKey)) toggleZanger();
            else if (current && e.key.toLowerCase() === "z") { e.preventDefault(); undoLine(); }
            else if (current && e.key.toLowerCase() === "l") { drawMode = !drawMode; renderTools(); }
            else if (current && e.key.toLowerCase() === "m") togglePeriod("M");
            else if (current && e.key.toLowerCase() === "w") togglePeriod("W");
            else if (current && e.key.toLowerCase() === "r") { state.rwb = !state.rwb; saveSettings(); renderPeriod(); drawChart(); }
            else if (e.key === "Escape") { if (sel) { sel = null; renderTools(); drawChart(); } else if (drawMode) { drawMode = false; renderTools(); } else closeChart(); }
        });
    }

    function renderScanners() {
        // Aplikacja korzysta z jednego źródła Finviz; wyczyść ewentualny wybór zapisany w starszej wersji.
        state.scanner = null;
    }

    function renderStatus() {
        if (!data.generated_at) return;
        const scans = (data.scanners || []).filter((m) => !state.scanner || m.name === state.scanner);   // gist: dane z desktopa, filtr Finviz nie jest podany
        const stale = scans.filter((m) => m.stale).map((m) => m.name);
        $("status").textContent = (source.kind === "gist" ? "☁ Gist (z desktopa) · " : "") + `Dane z ${data.generated_at.slice(0, 10)} (ostatni tydzień ${data.data_as_of || "—"}` +
            `${weekInProgress(data.data_as_of, data.generated_at) ? " — w toku, sygnał obowiązuje po zamknięciu piątku" : ""})` +
            (state.scanner && scans[0] ? ` · filtr Finviz ${scans[0].filters}` : "") +
            ((data.sectors || []).some((x) => x.selected) ? ` · sektory top (RS nad SMA 52 tyg.): ${data.sectors.filter((x) => x.selected).map((x) => `${x.etf} ${x.pct >= 0 ? "+" : ""}${x.pct.toFixed(1)} %`).join(", ")}` : "") +
            (stale.length ? ` · ⚠ Finviz niedostępny dla: ${stale.join(", ")} — lista z poprzedniego odświeżenia` : "");
    }

    async function init() {
        initUi();
        const repo = await fetchJson("data/watchlist.json", "Lista spółek");
        const g = state.gist.id && state.gist.mode !== "repo" ? await loadGist(state.gist.id) : null;
        gistInfo = { repo: repo ? { at: repo.generated_at, asOf: repo.data_as_of, n: (repo.rows || []).length } : null,
            gist: g && g.manifest ? { at: g.manifest.generated_at, asOf: g.manifest.data_as_of, n: g.manifest.rows.length } : null, error: g && g.error ? g.error : "" };
        source = chooseSource(repo, g);
        data = source.kind === "gist" ? source.manifest : repo;
        if (!data) {
            data = { rows: [], symbols: [] };
            $("status").textContent = "Nie udało się wczytać data/watchlist.json.";
            return;
        }
        if (!data.symbols) data.symbols = [];
        renderScanners();
        renderTable();
        renderAlertBtn();
        checkAlerts();
        if (window.matchMedia("(min-width: 1000px)").matches && shown.length) openChart(shown[0].ticker);
    }

    init();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
