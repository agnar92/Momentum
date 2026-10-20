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
    let out = rows.filter((r) => (!opts.onlyOk || r.ok) &&
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
    const state = Object.assign({ onlyOk: true, sort: null, recent: [] }, readSettings());
    let data = { rows: [], symbols: [] }, shown = [], current = null, geom = null, series = null;
    const weeklyCache = new Map();

    function readSettings() {
        try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ onlyOk: state.onlyOk, sort: state.sort, recent: state.recent })); } catch (e) { /* tryb prywatny */ }
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
        shown = visibleRows(data.rows, { onlyOk: state.onlyOk, search: $("search").value, sort: state.sort });
        $("tbody").innerHTML = shown.map((r) => {
            const cls = [isSignal(r) ? "signal" : "", r.ok ? "" : "dim", r.ticker === current ? "sel" : ""].join(" ");
            return `<tr data-t="${r.ticker}" class="${cls}">` + COLUMNS.map(([k, , f]) =>
                `<td class="${TEXT_COLS.includes(k) ? "" : "num"} c-${k}">${escapeHtml(cell(r[k], f))}</td>`).join("") + "</tr>";
        }).join("") || `<tr><td colspan="${COLUMNS.length}" class="empty">Brak spółek — wyłącz „tylko spełniające warunki” albo zmień wyszukiwanie.</td></tr>`;
        const ok = data.rows.filter((r) => r.ok).length, sig = data.rows.filter(isSignal).length;
        $("counts").textContent = `${shown.length} na liście · ${data.rows.length} spółek z Finviz · warunki spełnia ${ok} · sygnał GLB ${sig}`;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    }

    async function loadWeekly(t) {
        if (!weeklyCache.has(t)) {
            weeklyCache.set(t, fetch("data/weekly/" + encodeURIComponent(fileName(t)), { cache: "no-cache" })
                .then((r) => (r.ok ? r.json() : null)).catch(() => null));
        }
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
        if (!series) { box.innerHTML = `<p class="note">${series === false ? "Brak danych tygodniowych." : "Ładowanie…"}</p>`; return; }
        const res = chartSvg(series, rowFor(current), Math.max(320, box.clientWidth), Math.max(300, box.clientHeight));
        if (!res) { box.innerHTML = '<p class="note">Brak danych.</p>'; return; }
        box.innerHTML = res.svg;
        geom = res.geom;
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
        tip.innerHTML = infoLines(series, i).map(escapeHtml).join("<br>");
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
        let rt = null;
        window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(drawChart, 120); });
        document.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSymbol(); return; }
            if ($("symDlg").open || e.target.matches("input")) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); step(e.key === "ArrowDown" ? 1 : -1); }
            else if (e.key === "Escape") closeChart();
        });
    }

    async function init() {
        initUi();
        try {
            data = await fetch("data/watchlist.json", { cache: "no-cache" }).then((r) => r.json());
        } catch (e) {
            $("status").textContent = "Nie udało się wczytać data/watchlist.json.";
            return;
        }
        const stale = data.finviz_stale ? " · ⚠ Finviz niedostępny — lista z poprzedniego odświeżenia" : "";
        $("status").textContent = `Dane z ${(data.generated_at || "").slice(0, 10)} (ostatni tydzień ${data.data_as_of || "—"}` +
            `${weekInProgress(data.data_as_of, data.generated_at) ? " — w toku, sygnał obowiązuje po zamknięciu piątku" : ""}) · filtr Finviz ${data.finviz_filters}${stale}`;
        renderTable();
        if (window.matchMedia("(min-width: 1000px)").matches && shown.length) openChart(shown[0].ticker);
    }

    init();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
