// tvUrlFor/compareRows żyją w js/shared.js, initConnStatus/hideLoadingOverlay w
// js/qol.js — oba ładowane PRZED tym plikiem (patrz kolejność <script> w
// index.html). Node (tests/js/) nie ładuje <script> tagów, więc odtwarzamy to
// samo współdzielenie globali ręcznie tylko tam.
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./qol.js"));
}

// ============================================================
// LISTA OBSERWOWANA (index.html) — czyta docs/data/watchlist.json generowany
// codziennie przez watchlist.py (Finviz: lista spółek + fundamenty, yfinance:
// ceny i wskaźniki). Cztery zakładki nad TĄ SAMĄ listą:
//   📋 Lista      — wszystkie spółki po filtrze Finviz,
//   📊 RS Ranking — liderzy RS Rating (percentyl IBD policzony w watchlist.py),
//   🎯 Qullamaggie — progi obrotu/ADR + top X% wzrostu z okien 1/3/6M (suma bez
//                    powtórzeń); progi wpisuje użytkownik, liczone tutaj,
//   📈 Trend EMA34 — OSOBNY filtr (poza RS i Qullamaggie): EMA34 dzienna rośnie co
//                    5 sesji przez 20 (ema34_rising liczy watchlist.py).
// To tylko informacja do przeglądania, nie rekomendacja inwestycyjna.
// ============================================================

const COMPACT_MAX_WIDTH = 640;
const CHART_LOG_KEY = "momentum_watchlist_chart_log";
const SETTINGS_KEY = "momentum_watchlist_settings";
const DEFAULT_SETTINGS = { tab: "LIST", rsMin: 80, qm: { minDollarVolumeM: 20, minAdrPct: 4, topPct: 10 } };
const QM_WINDOWS = [["1M", "low_ratio_1m"], ["3M", "low_ratio_3m"], ["6M", "low_ratio_6m"]];
const TAB_DEFAULT_SORT = {
    LIST: ["ticker", "asc"], RS: ["rs_rating", "desc"], QM: ["max_ratio", "desc"], EMA34: ["ema34_slope_20d_pct", "desc"],
};
const TAB_TITLES = { LIST: "Lista Finviz", RS: "RS Ranking", QM: "Filtr Qullamaggie", EMA34: "Trend EMA34" };
const FALLBACK_REPO = "agnar92/Momentum";

const state = {
    data: null,
    tab: DEFAULT_SETTINGS.tab,
    rsMin: DEFAULT_SETTINGS.rsMin,
    qm: { ...DEFAULT_SETTINGS.qm },
    search: "",
    sector: "",
    sortKey: "ticker",
    sortDir: "asc",
};

// ---------- czyste funkcje (testowane w tests/js/watchlist.test.js) ----------

// Liderzy RS: rs_rating >= próg, od najwyższego.
function rsLeaders(stocks, minRating) {
    return stocks
        .filter(s => Number.isFinite(s.rs_rating) && s.rs_rating >= (Number(minRating) || 0))
        .sort((a, b) => b.rs_rating - a.rs_rating || b.rs_score - a.rs_score);
}

// Filtr Qullamaggie: progi obrotu (mln) i ADR% odrzucają spółki (brak danych = odrzucone), potem dla
// KAŻDEGO okna 1/3/6M bierzemy top topPct% wg relacji ceny do najniższego Low z okna (cena / minimum —
// bez odejmowania 1, to i tak tylko ranking); wynik to UNIKALNA suma trzech grup (wiersz pamięta,
// w których oknach wszedł do top).
function qullamaggieRows(stocks, params) {
    const minVol = (Number(params.minDollarVolumeM) || 0) * 1e6;
    const minAdr = Number(params.minAdrPct) || 0;
    const topPct = Math.min(100, Math.max(0, Number(params.topPct) || 0));
    const liquid = stocks.filter(s => Number.isFinite(s.dollar_volume_avg) && Number.isFinite(s.adr_pct)
        && s.dollar_volume_avg >= minVol && s.adr_pct >= minAdr);
    const picked = new Map();
    QM_WINDOWS.forEach(([label, key]) => {
        const ranked = liquid.filter(s => Number.isFinite(s[key])).sort((a, b) => b[key] - a[key]);
        const take = ranked.length && topPct > 0 ? Math.max(1, Math.ceil(ranked.length * topPct / 100)) : 0;
        ranked.slice(0, take).forEach(s => {
            if (!picked.has(s.ticker)) picked.set(s.ticker, { stock: s, windows: [] });
            picked.get(s.ticker).windows.push({ label, ratio: s[key] });
        });
    });
    const rows = [];
    picked.forEach(({ stock, windows }) => {
        rows.push({ ...stock, windows, max_ratio: Math.max(...windows.map(w => w.ratio)) });
    });
    return rows.sort((a, b) => b.max_gain_pct - a.max_gain_pct);
}

// Trend EMA34: tylko spółki z ema34_rising === true (wartość liczy watchlist.py::ema34_trend).
function ema34Rows(stocks) {
    return stocks.filter(s => s.ema34_rising === true);
}

// Filtry wspólne dla wszystkich zakładek: tekst (ticker/spółka) i sektor.
function applyCommonFilters(stocks, search, sector) {
    const q = (search || "").trim().toLowerCase();
    return stocks.filter(s => {
        if (sector && s.sector !== sector) return false;
        if (!q) return true;
        return s.ticker.toLowerCase().includes(q) || (s.company || "").toLowerCase().includes(q);
    });
}

// Adres strony GitHub Actions workflow'u (ręczne odpalenie "Run workflow"). Na GitHub Pages
// (owner.github.io/repo/) owner i repo wynikają z adresu; gdzie indziej — wartość awaryjna.
function githubActionsUrl(loc) {
    let slug = FALLBACK_REPO;
    const m = loc && /^([a-z0-9-]+)\.github\.io$/i.test(loc.hostname || "") && (loc.pathname || "").split("/")[1];
    if (m) slug = `${loc.hostname.split(".")[0]}/${loc.pathname.split("/")[1]}`;
    return `https://github.com/${slug}/actions/workflows/daily_watchlist.yml`;
}

function fmtMarketCap(v) {
    if (!Number.isFinite(v)) return "—";
    if (v >= 1e12) return (v / 1e12).toFixed(2) + " bln";
    if (v >= 1e9) return (v / 1e9).toFixed(1) + " mld";
    return (v / 1e6).toFixed(0) + " mln";
}

function fmtVolume(v) {
    if (!Number.isFinite(v)) return "—";
    return v >= 1e9 ? (v / 1e9).toFixed(2) + " mld" : (v / 1e6).toFixed(1) + " mln";
}

function fmtPct(v, digits = 1, sign = true) {
    if (!Number.isFinite(v)) return "—";
    return (sign && v > 0 ? "+" : "") + v.toFixed(digits) + "%";
}

function pctCell(v, digits = 1) {
    const cls = Number.isFinite(v) ? (v > 0 ? "positive" : (v < 0 ? "negative" : "")) : "";
    return `<td class="${cls}">${fmtPct(v, digits)}</td>`;
}

// Sortowanie: puste wartości zawsze na końcu, niezależnie od kierunku.
function sortRows(rows, key, dir) {
    const empty = v => v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
    return rows.slice().sort((a, b) => {
        const ea = empty(a[key]), eb = empty(b[key]);
        if (ea || eb) return ea === eb ? 0 : (ea ? 1 : -1);
        return compareRows(a, b, key, dir);
    });
}

// ---------- renderowanie ----------

function sparkSvg(values) {
    if (!values || values.length < 2) return "";
    const w = 90, h = 24;
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(h - 2 - (v - min) / span * (h - 4)).toFixed(1)}`).join(" ");
    const up = values[values.length - 1] >= values[0];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${up ? "#2ecc71" : "#e0455a"}" stroke-width="1.5" points="${pts}"/></svg>`;
}

function identityCells(s, position) {
    return `<td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${escapeHtml(s.ticker)}</td>
        <td title="${escapeHtml(s.industry || "")}">${escapeHtml(s.company || "")}</td>
        <td>${escapeHtml(s.sector || "")}</td>`;
}

function ratingCell(s) {
    if (!Number.isFinite(s.rs_rating)) return `<td class="muted">—</td>`;
    const cls = s.rs_rating >= 80 ? "positive" : (s.rs_rating < 50 ? "negative" : "");
    return `<td class="${cls}"><strong>${s.rs_rating}</strong></td>`;
}

function tailCells(s, withSpark = true) {
    return `${withSpark ? `<td title="Cena tygodniowa, ostatnie 26 tygodni">${sparkSvg(s.spark)}</td>` : ""}
        <td>${escapeHtml(s.earnings || "—")}</td>
        <td><a class="tv-row-btn" href="${tvUrlFor(s.ticker)}" target="_blank" rel="noopener">TV</a></td>`;
}

const ROW_RENDERERS = {
    LIST: (s, i) => `${identityCells(s, i)}
        <td>${fmtMarketCap(s.market_cap)}</td><td>$${Number(s.price).toFixed(2)}</td>
        ${pctCell(s.pct_above_sma50)}${pctCell(s.pct_above_sma200)}
        ${pctCell(s.eps_this_y)}${pctCell(s.eps_next_y)}${pctCell(s.eps_past_5y)}${pctCell(s.eps_next_5y)}
        ${ratingCell(s)}${tailCells(s)}`,
    RS: (s, i) => `${identityCells(s, i)}
        <td>$${Number(s.price).toFixed(2)}</td>${ratingCell(s)}
        ${pctCell(s.ret_3m_pct)}${pctCell(s.ret_6m_pct)}${pctCell(s.ret_12m_pct)}
        ${pctCell(s.eps_next_y)}${pctCell(s.eps_next_5y)}${tailCells(s)}`,
    QM: (s, i) => {
        const gains = s.windows.map(w => `${w.label}: ×${w.ratio.toFixed(2)}`).join(" · ");
        return `${identityCells(s, i)}
        <td>$${Number(s.price).toFixed(2)}</td><td>${fmtVolume(s.dollar_volume_avg)}</td><td>${s.adr_pct.toFixed(1)}%</td>
        <td class="positive" title="${gains}"><strong>×${s.max_ratio.toFixed(2)}</strong> <span class="muted" style="font-size:10.5px">top ${state.qm.topPct}% w: ${s.windows.map(w => w.label).join(", ")}</span></td>
        ${ratingCell(s)}${tailCells(s)}`;
    },
    EMA34: (s, i) => `${identityCells(s, i)}
        <td>$${Number(s.price).toFixed(2)}</td><td>${Number.isFinite(s.ema34) ? "$" + s.ema34.toFixed(2) : "—"}</td>
        ${pctCell(s.ema34_slope_20d_pct)}${pctCell(s.price_vs_ema34_pct)}${ratingCell(s)}${tailCells(s)}`,
};

function rowsForTab(tab) {
    const stocks = applyCommonFilters(state.data.stocks, state.search, state.sector);
    if (tab === "RS") return rsLeaders(stocks, state.rsMin);
    if (tab === "QM") return qullamaggieRows(stocks, state.qm);
    if (tab === "EMA34") return ema34Rows(stocks);
    return stocks;
}

const EMPTY_MESSAGES = {
    LIST: "Brak spółek (lista Finviz jest pusta albo filtr tekstu/sektora nic nie zostawia).",
    RS: "Żadna spółka nie ma RS Rating powyżej wybranego progu.",
    QM: "Żadna spółka nie spełnia progów — obniż obrót lub ADR% albo zwiększ top %.",
    EMA34: "Żadna spółka nie ma rosnącej EMA34 (co 5 sesji przez 20) przy bieżących filtrach.",
};

function renderTable() {
    if (!state.data) return;
    const tab = state.tab;
    const table = document.getElementById(`table-${tab}`);
    const tbody = table.querySelector("tbody");
    const rows = sortRows(rowsForTab(tab), state.sortKey, state.sortDir);
    const cols = table.querySelectorAll("thead th").length;
    tbody.innerHTML = rows.length
        ? rows.map((s, i) => `<tr data-ticker="${escapeHtml(s.ticker)}">${ROW_RENDERERS[tab](s, i + 1)}</tr>`).join("")
        : `<tr><td colspan="${cols}" class="empty-state">${EMPTY_MESSAGES[tab]}</td></tr>`;
    const meta = document.getElementById("drawerMeta");
    const total = state.data.stocks.length;
    meta.textContent = tab === "QM"
        ? `${rows.length} unikalnych spółek (top ${state.qm.topPct}% z okien 1/3/6M) z ${total}`
        : `${rows.length} z ${total} spółek`;
    updateSortHeaders(table);
}

function updateSortHeaders(table) {
    table.querySelectorAll("thead th").forEach(th => {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.dataset.key === state.sortKey) th.classList.add(state.sortDir === "asc" ? "sort-asc" : "sort-desc");
    });
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ tab: state.tab, rsMin: state.rsMin, qm: state.qm }));
    } catch (e) { /* brak localStorage — ignorujemy */ }
}

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
        if (!saved) return;
        if (TAB_TITLES[saved.tab]) state.tab = saved.tab;
        if (Number.isFinite(saved.rsMin)) state.rsMin = saved.rsMin;
        if (saved.qm) ["minDollarVolumeM", "minAdrPct", "topPct"].forEach(k => {
            if (Number.isFinite(saved.qm[k])) state.qm[k] = saved.qm[k];
        });
    } catch (e) { /* uszkodzony zapis — zostają domyślne */ }
}

function showTab(tab, resetSort = true) {
    state.tab = tab;
    if (resetSort) [state.sortKey, state.sortDir] = TAB_DEFAULT_SORT[tab];
    document.querySelectorAll(".drawer-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    Object.keys(TAB_TITLES).forEach(t => {
        document.getElementById(`table-${t}`).hidden = t !== tab;
        document.getElementById(`guide-${t}`).hidden = t !== tab;
    });
    document.getElementById("drawerTitle").textContent = TAB_TITLES[tab];
    saveSettings();
    renderTable();
}

function renderDataInfo() {
    const d = state.data;
    const info = document.getElementById("dataInfo");
    if (!d || !d.stocks || !d.stocks.length) {
        info.textContent = "Brak danych — uruchom watchlist.py (albo workflow „Daily watchlist” na GitHubie).";
        return;
    }
    const generated = d.generated_at ? d.generated_at.replace("T", " ").replace("Z", " UTC") : "?";
    info.textContent = `Dane z sesji ${d.data_as_of} · pobrano ${generated} · ${d.n_stocks} spółek`
        + (d.finviz_stale ? " · ⚠ lista Finviz z poprzedniego pobrania (Finviz niedostępny)" : "");
}

function initControls() {
    const bind = (id, apply) => {
        const el = document.getElementById(id);
        el.addEventListener("input", () => {
            const v = parseFloat(el.value);
            apply(Number.isFinite(v) && v >= 0 ? v : 0);
            saveSettings();
            renderTable();
        });
    };
    document.getElementById("rsMin").value = state.rsMin;
    document.getElementById("qmMinDollarVolume").value = state.qm.minDollarVolumeM;
    document.getElementById("qmMinAdr").value = state.qm.minAdrPct;
    document.getElementById("qmTopPct").value = state.qm.topPct;
    bind("rsMin", v => { state.rsMin = v; });
    bind("qmMinDollarVolume", v => { state.qm.minDollarVolumeM = v; });
    bind("qmMinAdr", v => { state.qm.minAdrPct = v; });
    bind("qmTopPct", v => { state.qm.topPct = v; });

    document.getElementById("searchInput").addEventListener("input", e => { state.search = e.target.value; renderTable(); });
    const sectorSelect = document.getElementById("sectorSelect");
    [...new Set(state.data.stocks.map(s => s.sector).filter(Boolean))].sort().forEach(sec => {
        const opt = document.createElement("option");
        opt.value = sec;
        opt.textContent = sec;
        sectorSelect.appendChild(opt);
    });
    sectorSelect.addEventListener("change", () => { state.sector = sectorSelect.value; renderTable(); });

    document.querySelectorAll(".drawer-tab").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
    document.querySelectorAll("table.momentum-table thead th").forEach(th => th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (!key) return;
        if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else { state.sortKey = key; state.sortDir = "desc"; }
        renderTable();
    }));
    document.getElementById("refreshLink").href = githubActionsUrl(window.location);
    // Klik w wiersz otwiera wykres w stylu MarketSmith (klik w link "TV" otwiera TradingView i nie otwiera wykresu).
    document.querySelectorAll("table.momentum-table tbody").forEach(tbody => tbody.addEventListener("click", ev => {
        if (ev.target.closest("a")) return;
        const tr = ev.target.closest("tr[data-ticker]");
        if (tr) openChart(tr.dataset.ticker);
    }));
    initChartModal();
}

// ---------- okienko z wykresem (rysowanie: js/chart.js) ----------

let chartsPromise = null;
let chartLog = false;       // skala logarytmiczna ceny (zapamiętywana w przeglądarce)
let chartCompact = false;   // układ dla wąskiego ekranu (telefon) — patrz chart.js
let currentChart = null;    // { charts, ticker, stock } — do ponownego narysowania po przełączeniu skali
function loadCharts() {
    if (!chartsPromise) {
        chartsPromise = fetch("data/charts.json", { cache: "no-store" })
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .catch(e => { console.error("Nie udało się wczytać data/charts.json:", e); chartsPromise = null; return null; });
    }
    return chartsPromise;
}

async function openChart(ticker) {
    const stock = state.data.stocks.find(s => s.ticker === ticker);
    const modal = document.getElementById("chartModal");
    document.getElementById("chartTitle").textContent = `${ticker} — ${stock && stock.company ? stock.company : ""}`;
    document.getElementById("chartSub").textContent = stock
        ? [stock.sector, stock.industry, Number.isFinite(stock.rs_rating) ? `RS Rating ${stock.rs_rating}` : null,
            stock.earnings ? `wyniki: ${stock.earnings}` : null].filter(Boolean).join(" · ")
        : "";
    document.getElementById("chartTv").href = tvUrlFor(ticker);
    const body = document.getElementById("chartBody");
    const readout = document.getElementById("chartReadout");
    chartCompact = window.innerWidth <= COMPACT_MAX_WIDTH;
    body.innerHTML = `<div class="empty-state">Ładowanie wykresu…</div>`;
    modal.hidden = false;
    const charts = await loadCharts();
    if (modal.hidden) return; // zamknięte w trakcie ładowania
    if (!charts) { body.innerHTML = `<div class="empty-state">Nie udało się wczytać danych wykresów.</div>`; return; }
    currentChart = { charts, ticker, stock };
    const model = renderStockChart(body, readout, charts, ticker, stock, { log: chartLog, compact: chartCompact });
    if (model && model.epsNext) {
        document.getElementById("chartSub").textContent += ` · następny raport ${model.epsNext.d} (prognoza EPS ${model.epsNext.e})`;
    }
}

function closeChart() {
    document.getElementById("chartModal").hidden = true;
    currentChart = null;
}

function updateLogButton() {
    document.getElementById("chartLogBtn").textContent = chartLog ? "Skala: logarytmiczna" : "Skala: liniowa";
}

function initChartModal() {
    try { chartLog = localStorage.getItem(CHART_LOG_KEY) === "1"; } catch (e) { /* brak localStorage */ }
    updateLogButton();
    document.getElementById("chartLogBtn").addEventListener("click", () => {
        chartLog = !chartLog;
        try { localStorage.setItem(CHART_LOG_KEY, chartLog ? "1" : "0"); } catch (e) { /* ignoruj */ }
        updateLogButton();
        if (currentChart) {
            renderStockChart(document.getElementById("chartBody"), document.getElementById("chartReadout"),
                currentChart.charts, currentChart.ticker, currentChart.stock, { log: chartLog, compact: chartCompact });
        }
    });
    document.getElementById("chartClose").addEventListener("click", closeChart);
    // Obrót telefonu / zmiana rozmiaru okna przełącza układ kompaktowy bez ponownego otwierania wykresu.
    window.addEventListener("resize", () => {
        const compact = window.innerWidth <= COMPACT_MAX_WIDTH;
        if (!currentChart || compact === chartCompact) return;
        chartCompact = compact;
        renderStockChart(document.getElementById("chartBody"), document.getElementById("chartReadout"),
            currentChart.charts, currentChart.ticker, currentChart.stock, { log: chartLog, compact: chartCompact });
    });
    document.getElementById("chartModal").addEventListener("click", ev => { if (ev.target.id === "chartModal") closeChart(); });
    document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeChart(); });
}

async function loadData() {
    try {
        const res = await fetch("data/watchlist.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.data = await res.json();
    } catch (e) {
        console.error("Nie udało się wczytać data/watchlist.json:", e);
        state.data = { stocks: [], n_stocks: 0 };
    }
}

// typeof document check: pozwala wczytać ten plik przez `require()` w testach Node bez uruchamiania
// inicjalizacji strony — w przeglądarce document zawsze istnieje.
if (typeof document !== "undefined") {
    (async function init() {
        initConnStatus();
        loadSettings();
        await loadData();
        renderDataInfo();
        initControls();
        showTab(state.tab);
        hideLoadingOverlay();
    })();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
}

// Eksport wyłącznie dla test runnera Node (tests/js/watchlist.test.js) — w przeglądarce module nie istnieje.
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        rsLeaders, qullamaggieRows, ema34Rows, applyCommonFilters, githubActionsUrl, sortRows,
        fmtMarketCap, fmtVolume, fmtPct, sparkSvg, state,
    };
}
