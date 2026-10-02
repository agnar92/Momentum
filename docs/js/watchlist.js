// tvUrlFor/compareRows żyją w js/shared.js, initConnStatus/hideLoadingOverlay w
// js/qol.js — oba ładowane PRZED tym plikiem (patrz kolejność <script> w
// index.html). Node (tests/js/) nie ładuje <script> tagów, więc odtwarzamy to
// samo współdzielenie globali ręcznie tylko tam.
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./qol.js"));
    Object.assign(globalThis, require("./annotate.js"));
}

// ============================================================
// LISTA OBSERWOWANA (index.html) — czyta docs/data/watchlist.json generowany
// codziennie przez watchlist.py (Finviz: lista spółek + fundamenty, yfinance:
// ceny i wskaźniki). Zakładki nad TĄ SAMĄ listą:
//   📋 Lista      — wszystkie spółki po filtrze Finviz,
//   📊 RS Ranking — liderzy RS Rating (percentyl IBD policzony w watchlist.py),
//   🎯 Qullamaggie — progi obrotu/ADR + top X% wzrostu z okien 1/3/6M (suma bez
//                    powtórzeń); progi wpisuje użytkownik, liczone tutaj,
//   📈 Trend EMA34 — OSOBNY filtr (poza RS i Qullamaggie): EMA34 dzienna rośnie co
//                    5 sesji przez 20 (ema34_rising liczy watchlist.py),
//   🧱 Bazy        — spółki w otwartej bazie/korekcie blisko pivotu (heurystyka watchlist.py::detect_bases),
//   ⭐ Ulubione    — własne ★ użytkownika (localStorage).
// To tylko informacja do przeglądania, nie rekomendacja inwestycyjna.
// ============================================================

const COMPACT_MAX_WIDTH = 640;
const CHART_LOG_KEY = "momentum_watchlist_chart_log";
const CHART_DAILY_KEY = "momentum_watchlist_chart_daily";
const FAVS_KEY = "momentum_watchlist_favs";
const SETTINGS_KEY = "momentum_watchlist_settings";
const EARNINGS_SOON_DAYS = 7;
const BASE_LABELS_PL = { flat: "Flat base", cup: "Cup base", correction: "Korekta", deep: "Głęboka korekta" };
const DEFAULT_SETTINGS = {
    tab: "LIST", rsMin: 80, qm: { minDollarVolumeM: 20, minAdrPct: 4, topPct: 10 }, bases: { maxDistPct: 10, vcpOnly: false },
};
const QM_WINDOWS = [["1M", "low_ratio_1m"], ["3M", "low_ratio_3m"], ["6M", "low_ratio_6m"]];
const TAB_DEFAULT_SORT = {
    LIST: ["ticker", "asc"], RS: ["rs_rating", "desc"], QM: ["max_ratio", "desc"], EMA34: ["ema34_slope_20d_pct", "desc"],
    BASES: ["pct_to_pivot", "asc"], FAV: ["ticker", "asc"], ALERTS: ["alert_rank", "asc"],
};
const TAB_TITLES = {
    LIST: "Lista Finviz", RS: "RS Ranking", QM: "Filtr Qullamaggie", EMA34: "Trend EMA34", BASES: "Bazy blisko pivotu", FAV: "Ulubione", ALERTS: "Alerty na liniach",
};
const FALLBACK_REPO = "agnar92/Momentum";

const state = {
    data: null,
    tab: DEFAULT_SETTINGS.tab,
    rsMin: DEFAULT_SETTINGS.rsMin,
    qm: { ...DEFAULT_SETTINGS.qm },
    bases: { ...DEFAULT_SETTINGS.bases },
    favs: new Set(),
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
    return rows.sort((a, b) => b.max_ratio - a.max_ratio);
}

// Trend EMA34: tylko spółki z ema34_rising === true (wartość liczy watchlist.py::ema34_trend).
function ema34Rows(stocks) {
    return stocks.filter(s => s.ema34_rising === true);
}

// Bazy: spółki z otwartą bazą/korektą, którym do pivotu (szczyt bazy) zostało najwyżej maxDistPct%;
// opcjonalnie tylko z flagą VCP (malejące skurcze). Najbliżej pivotu na górze.
function baseRows(stocks, params) {
    const maxDist = Number(params.maxDistPct);
    const limit = Number.isFinite(maxDist) && maxDist >= 0 ? maxDist : Infinity;
    return stocks
        .filter(s => s.base_type && Number.isFinite(s.pct_to_pivot) && s.pct_to_pivot <= limit && (!params.vcpOnly || s.vcp === true))
        .sort((a, b) => a.pct_to_pivot - b.pct_to_pivot);
}

// Dni do wyników z tekstu Finviz ("Oct 22/a", "Aug 26/a"); rok wynika z bieżącej daty. null = brak/nieczytelne.
function earningsInDays(text, now = new Date()) {
    const m = /^([A-Z][a-z]{2}) (\d{1,2})/.exec(text || "");
    const month = m ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(m[1]) : -1;
    if (month < 0) return null;
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    let t = Date.UTC(now.getFullYear(), month, Number(m[2]));
    if (t - today < -30 * 86400000) t = Date.UTC(now.getFullYear() + 1, month, Number(m[2]));
    return Math.round((t - today) / 86400000);
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

const money = v => (Number.isFinite(v) ? "$" + Number(v).toFixed(2) : "—");

function ratingCell(s) {
    if (!Number.isFinite(s.rs_rating)) return `<td class="muted">—</td>`;
    const cls = s.rs_rating >= 80 ? "positive" : (s.rs_rating < 50 ? "negative" : "");
    return `<td class="${cls}"><strong>${s.rs_rating}</strong></td>`;
}

function earningsCell(s) {
    const days = earningsInDays(s.earnings);
    const soon = days !== null && days >= 0 && days <= EARNINGS_SOON_DAYS;
    return `<td${soon ? ` class="earnings-soon" title="Wyniki za ${days} dni — podwyższone ryzyko luki"` : ""}>${soon ? "⚠ " : ""}${escapeHtml(s.earnings || "—")}</td>`;
}

function baseSummary(s) {
    if (!s.base_type) return "—";
    return `${BASE_LABELS_PL[s.base_type] || s.base_type} −${s.base_depth_pct}% · ${s.base_weeks} tyg.${s.vcp ? " · VCP" : ""}`;
}

// Kolumny: [nagłówek, klucz sortowania (null = nie sortuje), funkcja komórki, opcjonalny tytuł nagłówka].
const COL = {
    rank: ["#", null, (s, i) => `<td><span class="rank-badge">${i}</span></td>`],
    fav: ["★", null, s => `<td class="fav-cell" data-fav="${escapeHtml(s.ticker)}" title="Dodaj/usuń z ulubionych">${state.favs.has(s.ticker) ? "★" : "☆"}</td>`],
    ticker: ["Ticker", "ticker", s => `<td class="ticker-cell">${escapeHtml(s.ticker)}</td>`],
    company: ["Spółka", "company", s => `<td title="${escapeHtml(s.industry || "")}">${escapeHtml(s.company || "")}</td>`],
    sector: ["Sektor", "sector", s => `<td>${escapeHtml(s.sector || "")}</td>`],
    cap: ["Kapitalizacja", "market_cap", s => `<td>${fmtMarketCap(s.market_cap)}</td>`],
    price: ["Cena", "price", s => `<td>${money(s.price)}</td>`],
    sma50: ["vs SMA50", "pct_above_sma50", s => pctCell(s.pct_above_sma50)],
    sma200: ["vs SMA200", "pct_above_sma200", s => pctCell(s.pct_above_sma200)],
    high52: ["Od szczytu 52 tyg.", "pct_from_high_52w", s => pctCell(s.pct_from_high_52w)],
    epsThis: ["EPS ten rok", "eps_this_y", s => pctCell(s.eps_this_y)],
    epsNext: ["EPS przyszły rok", "eps_next_y", s => pctCell(s.eps_next_y)],
    eps5: ["EPS 5 lat", "eps_past_5y", s => pctCell(s.eps_past_5y)],
    epsNext5: ["EPS prognoza 5 lat", "eps_next_5y", s => pctCell(s.eps_next_5y)],
    rs: ["RS Rating", "rs_rating", s => ratingCell(s)],
    r3: ["3M", "ret_3m_pct", s => pctCell(s.ret_3m_pct)],
    r6: ["6M", "ret_6m_pct", s => pctCell(s.ret_6m_pct)],
    r12: ["12M", "ret_12m_pct", s => pctCell(s.ret_12m_pct)],
    base: ["Baza", "base_depth_pct", s => `<td>${baseSummary(s)}</td>`],
    dollarVol: ["Obrót dzienny", "dollar_volume_avg", s => `<td>${fmtVolume(s.dollar_volume_avg)}</td>`],
    adr: ["ADR %", "adr_pct", s => `<td>${s.adr_pct.toFixed(1)}%</td>`],
    ratio: ["Cena / minimum", "max_ratio", s => {
        const gains = s.windows.map(w => `${w.label}: ×${w.ratio.toFixed(2)}`).join(" · ");
        return `<td class="positive" title="${gains}"><strong>×${s.max_ratio.toFixed(2)}</strong> <span class="muted small">top ${state.qm.topPct}% w: ${s.windows.map(w => w.label).join(", ")}</span></td>`;
    }, "Cena / najniższy Low z okna (np. ×1.35 = 35% nad minimum)"],
    ema: ["EMA34", "ema34", s => `<td>${money(s.ema34)}</td>`],
    slope: ["Nachylenie 20 sesji", "ema34_slope_20d_pct", s => pctCell(s.ema34_slope_20d_pct)],
    vsEma: ["Cena vs EMA34", "price_vs_ema34_pct", s => pctCell(s.price_vs_ema34_pct)],
    pivot: ["Pivot", "pivot", s => `<td>${money(s.pivot)}</td>`],
    toPivot: ["Do pivotu", "pct_to_pivot", s => pctCell(s.pct_to_pivot)],
    baseType: ["Typ bazy", "base_type", s => `<td>${BASE_LABELS_PL[s.base_type] || "—"}${s.vcp ? ` <span class="positive">VCP</span>` : ""}</td>`],
    depth: ["Głębokość", "base_depth_pct", s => `<td>${Number.isFinite(s.base_depth_pct) ? "−" + s.base_depth_pct + "%" : "—"}</td>`],
    baseWeeks: ["Tygodnie", "base_weeks", s => `<td>${s.base_weeks ?? "—"}</td>`],
    trend: ["Trendlinia", "tl_state", s => `<td${s.tl_state === "wybicie" ? ` class="positive"` : ""}>${s.tl_state ? (s.tl_state === "wybicie" ? `▲ wybicie${Number.isFinite(s.tl_vol_ratio) ? ` ×${s.tl_vol_ratio} wol.${s.tl_vol_ok ? " ✓" : ""}` : ""}` : "przy oporze") : ""}${s.tl_pattern ? ` <span class="muted small">${escapeHtml(s.tl_pattern)}</span>` : (s.tl_state ? "" : "—")}</td>`, "Wybicie / zbliżenie do linii oporu (dzienne, ostatnie ~70 sesji) i wykryty kształt"],
    rsLine: ["Linia RS", "rs_line_dist_pct", s => `<td${s.rs_line_state === "przed ceną" ? ` class="positive"` : ""} title="Linia RS (cena / S&P 500): odległość od maksimum z 52 tyg.; „przed ceną” = RS na maksimum, a cena jeszcze nie">${s.rs_line_state ? (s.rs_line_state === "przed ceną" ? "● RS przed ceną" : "● RS na szczycie") + " " : ""}${Number.isFinite(s.rs_line_dist_pct) ? `<span class="muted small">${fmtPct(s.rs_line_dist_pct)}</span>` : "—"}</td>`, "Linia RS: stan (RS na maksimum 52 tyg. przed/razem z ceną) i odległość od jej maksimum"],
    alKind: ["Linia", "alert_kind", s => `<td>${ANN_KIND_LABELS[s.alert.kind] || "linia"}${s.alert.note ? "" : ""}</td>`],
    alDir: ["Alert", "alert_dir", s => `<td>${ANN_DIR_LABELS[s.alert.alert]}</td>`],
    alValue: ["Linia dziś", "alert_value", s => `<td>${money(s.alert.value)}</td>`],
    alDist: ["Cena vs linia", "alert_dist", s => pctCell(s.alert.dist)],
    alStatus: ["Status", "alert_rank", s => {
        const a = s.alert;
        const txt = a.triggered ? (a.ack ? "przebita (zatwierdzona)" : "🔔 PRZEBITA — nowa") : (a.near ? "blisko linii" : "czeka");
        return `<td class="${a.triggered && !a.ack ? "positive" : ""}"><strong>${txt}</strong></td>`;
    }],
    alAct: ["", null, s => `<td>${s.alert.triggered && !s.alert.ack ? `<button class="mini-btn" data-ack="${s.alert.ticker}|${s.alert.id}">OK</button> ` : ""}<button class="mini-btn" data-delline="${s.alert.ticker}|${s.alert.id}" title="Usuń alert (zostaje sama linia)">🗑</button></td>`],
    spark: ["Cena (26 tyg.)", null, s => `<td title="Cena tygodniowa, ostatnie 26 tygodni">${sparkSvg(s.spark)}</td>`],
    earnings: ["Wyniki", "earnings", s => earningsCell(s)],
    tv: ["TV", null, s => `<td><a class="tv-row-btn" href="${tvUrlFor(s.ticker)}" target="_blank" rel="noopener">TV</a></td>`],
};
const LEAD = ["rank", "fav", "ticker", "company", "sector"];
const LIST_COLUMNS = [...LEAD, "cap", "price", "sma50", "sma200", "high52", "epsThis", "epsNext", "eps5", "epsNext5", "rs", "rsLine", "base", "trend", "spark", "earnings", "tv"];
const TAB_COLUMNS = {
    LIST: LIST_COLUMNS,
    FAV: LIST_COLUMNS,
    RS: [...LEAD, "price", "rs", "rsLine", "r3", "r6", "r12", "epsNext", "epsNext5", "spark", "earnings", "tv"],
    QM: [...LEAD, "price", "dollarVol", "adr", "ratio", "rs", "spark", "earnings", "tv"],
    EMA34: [...LEAD, "price", "ema", "slope", "vsEma", "rs", "spark", "earnings", "tv"],
    ALERTS: ["rank", "ticker", "company", "price", "alKind", "alDir", "alValue", "alDist", "alStatus", "alAct"],
    BASES: [...LEAD, "price", "baseType", "depth", "baseWeeks", "pivot", "toPivot", "high52", "trend", "rs", "spark", "earnings", "tv"],
};

function renderHeaders() {
    Object.keys(TAB_COLUMNS).forEach(tab => {
        const head = TAB_COLUMNS[tab].map(id => {
            const [label, key, , title] = COL[id];
            return `<th${key ? ` data-key="${key}"` : ""}${title ? ` title="${title}"` : ""}${id === "tv" ? ` class="tv-col"` : ""}>${label}</th>`;
        }).join("");
        document.querySelector(`#table-${tab} thead`).innerHTML = `<tr>${head}</tr>`;
    });
}

function renderRow(tab, s, i) {
    return TAB_COLUMNS[tab].map(id => COL[id][2](s, i)).join("");
}

function rowsForTab(tab) {
    const stocks = applyCommonFilters(state.data.stocks, state.search, state.sector);
    if (tab === "RS") return rsLeaders(stocks, state.rsMin);
    if (tab === "QM") return qullamaggieRows(stocks, state.qm);
    if (tab === "EMA34") return ema34Rows(stocks);
    if (tab === "BASES") return baseRows(stocks, state.bases);
    if (tab === "FAV") return stocks.filter(s => state.favs.has(s.ticker));
    if (tab === "ALERTS") {
        return alertRows(annStore, stocks).map(r => ({
            ...r, alert_rank: r.alert.rank, alert_kind: r.alert.kind, alert_dir: r.alert.alert, alert_value: r.alert.value, alert_dist: r.alert.dist,
        }));
    }
    return stocks;
}

const EMPTY_MESSAGES = {
    LIST: "Brak spółek (lista Finviz jest pusta albo filtr tekstu/sektora nic nie zostawia).",
    RS: "Żadna spółka nie ma RS Rating powyżej wybranego progu.",
    QM: "Żadna spółka nie spełnia progów — obniż obrót lub ADR% albo zwiększ top %.",
    EMA34: "Żadna spółka nie ma rosnącej EMA34 (co 5 sesji przez 20) przy bieżących filtrach.",
    BASES: "Brak spółek w bazie w zadanej odległości od pivotu — zwiększ dystans albo odznacz „tylko VCP”.",
    ALERTS: "Brak alertów — w oknie wykresu kliknij ✎ Edytuj, narysuj linię (Linia) i ustaw przy niej Alert.",
    FAV: "Brak ulubionych — kliknij ☆ przy spółce na dowolnej liście.",
};

function renderTable() {
    if (!state.data) return;
    const tab = state.tab;
    const table = document.getElementById(`table-${tab}`);
    const tbody = table.querySelector("tbody");
    const rows = sortRows(rowsForTab(tab), state.sortKey, state.sortDir);
    const cols = table.querySelectorAll("thead th").length;
    tbody.innerHTML = rows.length
        ? rows.map((s, i) => `<tr data-ticker="${escapeHtml(s.ticker)}">${renderRow(tab, s, i + 1)}</tr>`).join("")
        : `<tr><td colspan="${cols}" class="empty-state">${EMPTY_MESSAGES[tab]}</td></tr>`;
    updateAlertBadge();
    const meta = document.getElementById("drawerMeta");
    const total = state.data.stocks.length;
    meta.textContent = tab === "QM"
        ? `${rows.length} unikalnych spółek (top ${state.qm.topPct}% z okien 1/3/6M) z ${total}`
        : `${rows.length} z ${total} spółek`;
    updateSortHeaders(table);
}

// Liczba nowych (przebitych, niezatwierdzonych) alertów na zakładce 🔔.
function updateAlertBadge() {
    if (!state.data) return;
    const n = annRefresh(annStore, state.data.stocks);
    const badge = document.getElementById("alertBadge");
    if (badge) badge.textContent = n ? ` (${n})` : "";
}

function updateSortHeaders(table) {
    table.querySelectorAll("thead th").forEach(th => {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.dataset.key === state.sortKey) th.classList.add(state.sortDir === "asc" ? "sort-asc" : "sort-desc");
    });
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ tab: state.tab, rsMin: state.rsMin, qm: state.qm, bases: state.bases }));
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
        if (saved.bases) {
            if (Number.isFinite(saved.bases.maxDistPct)) state.bases.maxDistPct = saved.bases.maxDistPct;
            state.bases.vcpOnly = saved.bases.vcpOnly === true;
        }
    } catch (e) { /* uszkodzony zapis — zostają domyślne */ }
}

function loadFavs() {
    try {
        const saved = JSON.parse(localStorage.getItem(FAVS_KEY) || "[]");
        if (Array.isArray(saved)) state.favs = new Set(saved.filter(t => typeof t === "string"));
    } catch (e) { /* uszkodzony zapis */ }
}

function toggleFav(ticker) {
    if (!state.favs.delete(ticker)) state.favs.add(ticker);
    try { localStorage.setItem(FAVS_KEY, JSON.stringify([...state.favs].sort())); } catch (e) { /* brak localStorage */ }
    renderTable();
}

function showTab(tab, resetSort = true) {
    state.tab = tab;
    if (resetSort) [state.sortKey, state.sortDir] = TAB_DEFAULT_SORT[tab];
    document.querySelectorAll(".drawer-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    Object.keys(TAB_TITLES).forEach(t => {
        document.getElementById(`table-${t}`).hidden = t !== tab;
        document.getElementById(`guide-${t}`).hidden = t !== tab;
        document.getElementById(`controls-${t}`).hidden = t !== tab;
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
    document.getElementById("baseMaxDist").value = state.bases.maxDistPct;
    bind("baseMaxDist", v => { state.bases.maxDistPct = v; });
    const vcp = document.getElementById("baseVcpOnly");
    vcp.checked = state.bases.vcpOnly;
    vcp.addEventListener("change", () => { state.bases.vcpOnly = vcp.checked; saveSettings(); renderTable(); });

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
    document.querySelectorAll("table.momentum-table thead").forEach(thead => thead.addEventListener("click", ev => {
        const th = ev.target.closest("th");
        const key = th && th.dataset.key;
        if (!key) return;
        if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else { state.sortKey = key; state.sortDir = "desc"; }
        renderTable();
    }));
    document.getElementById("refreshLink").href = githubActionsUrl(window.location);
    // Klik w wiersz otwiera wykres w stylu MarketSmith (klik w link "TV" otwiera TradingView i nie otwiera wykresu).
    document.querySelectorAll("table.momentum-table tbody").forEach(tbody => tbody.addEventListener("click", ev => {
        if (ev.target.closest("a")) return;
        const ack = ev.target.closest("[data-ack]"), del = ev.target.closest("[data-delline]");
        if (ack || del) {
            const [ticker, id] = (ack || del).dataset[ack ? "ack" : "delline"].split("|");
            const line = annStore[ticker] && annStore[ticker].lines.find(l => l.id === id);
            if (line) { if (ack) line.ack = true; else line.alert = null; annSave(); renderTable(); }
            return;
        }
        const star = ev.target.closest("td[data-fav]");
        if (star) { toggleFav(star.dataset.fav); return; }
        const tr = ev.target.closest("tr[data-ticker]");
        if (tr) openChart(tr.dataset.ticker);
    }));
    initChartModal();
}

// Eksport / import adnotacji (kopiowanie JSON do schowka i wklejanie) — kopia zapasowa, przenoszenie między urządzeniami
// i materiał do przeglądu z Claude (porównanie linii/cupów algorytmu z poprawkami użytkownika).
function initAnnotationIO() {
    const text = document.getElementById("annText"), apply = document.getElementById("annApply");
    if (!text) return;
    document.getElementById("annExport").addEventListener("click", async () => {
        const json = annExportJson(annStore);
        text.value = json; text.hidden = false; apply.hidden = true;
        try { await navigator.clipboard.writeText(json); showToast("Adnotacje skopiowane do schowka."); }
        catch (e) { text.select(); showToast("Zaznacz i skopiuj JSON z pola poniżej."); }
    });
    document.getElementById("annImport").addEventListener("click", () => {
        text.value = ""; text.hidden = false; apply.hidden = false; text.placeholder = "Wklej tu JSON z eksportu i kliknij Zastosuj";
    });
    apply.addEventListener("click", () => {
        try {
            annStore = mergeImport(annStore, text.value);
            annSave(); text.hidden = true; apply.hidden = true; renderTable();
            showToast("Zaimportowano adnotacje.");
        } catch (e) { showToast("Nie udało się zaimportować: " + e.message); }
    });
}

// ---------- okienko z wykresem (rysowanie: js/chart.js) ----------

let chartsPromise = null;
let chartWindow = null;     // okno suwaka {n, end} (null = domyślne); zerowane przy nowej spółce / zmianie interwału
let chartDaily = true;      // wykres dzienny zamiast tygodniowego
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
    document.getElementById("chartStats").textContent = stock ? chartStats(stock) : "";
    document.getElementById("chartTv").href = tvUrlFor(ticker);
    const body = document.getElementById("chartBody");
    chartCompact = window.innerWidth <= COMPACT_MAX_WIDTH;
    chartWindow = null;
    Object.assign(annEdit, { on: false, tool: null, selected: null, pending: [], cursor: null });   // nowy wykres: poza trybem edycji
    annCurrent = null;
    annSyncTools();
    body.innerHTML = `<div class="empty-state">Ładowanie wykresu…</div>`;
    modal.hidden = false;
    const charts = await loadCharts();
    if (modal.hidden) return; // zamknięte w trakcie ładowania
    if (!charts) { body.innerHTML = `<div class="empty-state">Nie udało się wczytać danych wykresów.</div>`; return; }
    currentChart = { charts, ticker, stock };
    const model = drawChart();
    if (model && model.epsNext) {
        document.getElementById("chartSub").textContent += ` · następny raport ${model.epsNext.d} (prognoza EPS ${model.epsNext.e})`;
    }
}

// Linia fundamentów pod tytułem okna wykresu.
function chartStats(s) {
    const num = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");
    return [`Kapitalizacja ${fmtMarketCap(s.market_cap)}`, `P/E ${num(s.pe)}`, `Fwd P/E ${num(s.forward_pe)}`,
        `ROE ${fmtPct(s.roe, 1, false)}`, `od szczytu 52 tyg. ${fmtPct(s.pct_from_high_52w)}`,
        s.base_type ? `baza: ${baseSummary(s)}, pivot ${money(s.pivot)} (${fmtPct(s.pct_to_pivot)})` : null].filter(Boolean).join(" · ");
}

function drawChart() {
    if (!currentChart) return null;
    const model = renderStockChart(document.getElementById("chartBody"), document.getElementById("chartReadout"),
        currentChart.charts, currentChart.ticker, currentChart.stock, { log: chartLog, compact: chartCompact, daily: chartDaily,
            window: chartWindow, onWindow: w => { chartWindow = w; },
            hideAutoLines: annHide(currentChart.ticker).lines, hideAutoCups: annHide(currentChart.ticker).cups,
            overlay: c => annOverlay({ ...c, ticker: currentChart.ticker, stock: currentChart.stock }) });
    document.getElementById("chartPattern").textContent = model ? patternExplain(model) : "";
    return model;
}

function closeChart() {
    document.getElementById("chartModal").hidden = true;
    Object.assign(annEdit, { on: false, tool: null, selected: null, pending: [], cursor: null });
    annSyncTools();
    renderTable();   // zakładka Alerty / licznik mogły się zmienić po edycji linii
    currentChart = null;
}

function updateLogButton() {
    document.getElementById("chartLogBtn").textContent = chartLog ? "Skala: logarytmiczna" : "Skala: liniowa";
}

function updateTfButton() {
    document.getElementById("chartTfBtn").textContent = chartDaily ? "Wykres: dzienny" : "Wykres: tygodniowy";
}

function initChartModal() {
    try {
        chartLog = localStorage.getItem(CHART_LOG_KEY) === "1";
        chartDaily = localStorage.getItem(CHART_DAILY_KEY) !== "0";   // domyślnie dzienny (wybicia i wolumen)
    } catch (e) { /* brak localStorage */ }
    updateLogButton();
    updateTfButton();
    document.getElementById("chartTfBtn").addEventListener("click", () => {
        chartDaily = !chartDaily;
        chartWindow = null;
        try { localStorage.setItem(CHART_DAILY_KEY, chartDaily ? "1" : "0"); } catch (e) { /* ignoruj */ }
        updateTfButton();
        drawChart();
    });
    document.getElementById("chartLogBtn").addEventListener("click", () => {
        chartLog = !chartLog;
        try { localStorage.setItem(CHART_LOG_KEY, chartLog ? "1" : "0"); } catch (e) { /* ignoruj */ }
        updateLogButton();
        drawChart();
    });
    document.getElementById("chartClose").addEventListener("click", closeChart);
    // Obrót telefonu / zmiana rozmiaru okna przełącza układ kompaktowy bez ponownego otwierania wykresu.
    window.addEventListener("resize", () => {
        const compact = window.innerWidth <= COMPACT_MAX_WIDTH;
        if (!currentChart || compact === chartCompact) return;
        chartCompact = compact;
        chartWindow = null;
        drawChart();
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
        loadFavs();
        annLoad();
        await loadData();
        renderDataInfo();
        renderHeaders();
        initControls();
        annInitUI(drawChart);
        initAnnotationIO();
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
        rsLeaders, qullamaggieRows, ema34Rows, baseRows, earningsInDays, applyCommonFilters, githubActionsUrl, sortRows,
        fmtMarketCap, fmtVolume, fmtPct, sparkSvg, state,
    };
}
