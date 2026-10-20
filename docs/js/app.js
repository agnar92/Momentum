// Strona: jedna lista (skan Finviz + warunki strategii) i jeden wykres tygodniowy — ta sama aplikacja co Momentum Desktop.
// Ctrl+K = dowolny symbol z listy albo z `symbols` w finviz_screen.json. Czyste funkcje na górze (testy w tests/js/app.test.js).
"use strict";

const COLUMNS = [ // [klucz, nagłówek, format]
    ["ticker", "Ticker", "s"], ["company", "Spółka", "s"], ["sector", "Sektor", "s"], ["price", "Cena", "p"],
    ["glb", "Green Line", "p"], ["glb_pct", "Do linii %", "%"], ["glb_state", "GLB", "s"], ["macd", "MACD", "s"],
    ["macd_stop", "Stop MACD", "p"], ["dopm", "Δ marża oper. pp", "%"], ["rev_rr", "Przychody r/r %", "%"],
    ["dgm", "Δ marża brutto pp", "%"], ["quarter", "Kwartał", "s"], ["turnover", "Obrót mln $", "m"], ["ok", "Warunki", "b"],
];
const SIGNAL = ["WYBICIE", "SYGNAŁ"];
const TEXT_COLS = ["ticker", "company", "sector", "glb_state", "macd", "quarter"];
const SETTINGS_KEY = "momentum_glb_settings";
const REPO = "https://github.com/agnar92/Momentum";

function cell(v, f) {
    if (v === null || v === undefined) return "";
    if (f === "p") return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (f === "%") return (v >= 0 ? "+" : "") + v.toFixed(1);
    if (f === "m") return (v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (f === "b") return v ? "✓" : "";
    return String(v);
}

const isSignal = (r) => !!(r.ok && SIGNAL.includes(r.glb_state));

// najpierw spełniające warunki z sygnałem GLB, potem spełniające warunki, w grupie od największej zmiany marży operacyjnej
function defaultCompare(a, b) {
    const ka = [!isSignal(a), !a.ok, -(a.dopm ?? -1e9)], kb = [!isSignal(b), !b.ok, -(b.dopm ?? -1e9)];
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
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

function visibleRows(rows, opts) {
    const q = (opts.search || "").trim().toLowerCase();
    let out = rows.filter((r) => (!opts.onlyOk || r.ok) && (!opts.scanner || (r.scanners || []).includes(opts.scanner)) &&
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

if (typeof module !== "undefined") module.exports = { COLUMNS, cell, defaultCompare, compareBy, visibleRows, fileName, isSignal, weekInProgress };

// ---------- DOM ----------
if (typeof document !== "undefined") (function () {
    const $ = (id) => document.getElementById(id);
    const state = Object.assign({ onlyOk: true, sort: null, recent: [], nShow: null }, readSettings());
    let data = { rows: [], symbols: [] }, shown = [], current = null, geom = null, series = null, end = null, drag = null;
    const weeklyCache = new Map();

    function readSettings() {
        try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ onlyOk: state.onlyOk, sort: state.sort, recent: state.recent, nShow: state.nShow, scanner: state.scanner })); } catch (e) { /* tryb prywatny */ }
    }
    const allRows = () => data.rows.concat(data.symbols || []);
    const rowFor = (t) => allRows().find((r) => r.ticker === t) || null;

    function renderHead() {
        $("thead").innerHTML = "<tr>" + COLUMNS.map(([k, h]) => {
            const arrow = state.sort && state.sort.key === k ? (state.sort.dir > 0 ? " ▲" : " ▼") : "";
            return `<th data-key="${k}" class="${TEXT_COLS.includes(k) ? "" : "num"}">${h}${arrow}</th>`;
        }).join("") + "</tr>";
    }

    function renderTable() {
        shown = visibleRows(data.rows, { onlyOk: state.onlyOk, search: $("search").value, sort: state.sort, scanner: state.scanner });
        $("tbody").innerHTML = shown.map((r) => {
            const cls = [isSignal(r) ? "signal" : "", r.ok ? "" : "dim", r.ticker === current ? "sel" : ""].join(" ");
            return `<tr data-t="${r.ticker}" class="${cls}">` + COLUMNS.map(([k, , f]) =>
                `<td class="${TEXT_COLS.includes(k) ? "" : "num"} c-${k}">${escapeHtml(cell(r[k], f))}</td>`).join("") + "</tr>";
        }).join("") || `<tr><td colspan="${COLUMNS.length}" class="empty">Brak spółek — wyłącz „tylko spełniające warunki” albo zmień wyszukiwanie.</td></tr>`;
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
        if (!weeklyCache.has(t)) weeklyCache.set(t, fetchJson("data/weekly/" + encodeURIComponent(fileName(t)), `Wykres ${t}`));
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
        drawChart();
        const d = await loadWeekly(t);
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
            box.innerHTML = `<p class="note">${series === false ? "Brak danych tygodniowych." : "Ładowanie…"}</p>`;
            return;
        }
        drawSlider();
        const res = chartSvg(series, rowFor(current), Math.max(320, box.clientWidth), Math.max(300, box.clientHeight), state.nShow, end);
        if (!res) { box.innerHTML = '<p class="note">Brak danych.</p>'; return; }
        box.innerHTML = res.svg;
        geom = res.geom;
    }

    function drawSlider() {
        const el = $("slider");
        el.innerHTML = series ? sliderSvg(series.c, state.nShow, end, el.clientWidth, el.clientHeight) : "";
    }

    function setWindow(n, e) {
        const total = series.c.length;
        state.nShow = n >= total ? null : n;
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
        const [x0, x1] = sliderRect(total, state.nShow, end, W);
        let mode = sliderMode(x, x0, x1, ev.pointerType === "mouse" ? 9 : 16);
        if (mode === "jump") { setWindow(...sliderJump(x, total, state.nShow, W)); mode = "move"; }
        drag = { mode, x, start: [state.nShow, end] };
        $("slider").setPointerCapture(ev.pointerId);
        ev.preventDefault();
    }

    function sliderMove(ev) {
        if (!drag || !series) return;
        setWindow(...sliderDrag(drag.mode, drag.start, sliderX(ev) - drag.x, series.c.length, $("slider").clientWidth));
    }

    function zoom(factor) {
        if (series) setWindow(...zoomWindow(series.c.length, state.nShow, end, factor));
    }

    function pan(d) {
        if (!series) return;
        const total = series.c.length, [i0, i1] = windowRange(total, state.nShow, end);
        setWindow(i1 - i0, Math.max(i1 - i0, Math.min(total, i1 + d)));
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
        body.addEventListener("mousemove", onMove);
        body.addEventListener("touchmove", onMove, { passive: true });
        body.addEventListener("mouseleave", () => { $("tip").hidden = true; });
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
            if ($("symDlg").open || e.target.matches("input")) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); step(e.key === "ArrowDown" ? 1 : -1); }
            else if (current && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); pan(e.key === "ArrowLeft" ? -4 : 4); }
            else if (current && (e.key === "+" || e.key === "-")) zoom(e.key === "+" ? 0.85 : 1.18);
            else if (e.key === "Escape") closeChart();
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
        if (window.matchMedia("(min-width: 1000px)").matches && shown.length) openChart(shown[0].ticker);
    }

    init();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
