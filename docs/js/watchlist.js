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
//   📊 Ratingi    — RS Rating, EPS Rating i Composite (policzone w watchlist.py), filtry min. dla każdego,
//   🎯 Qullamaggie — progi obrotu/ADR + top X% wzrostu z okien 1/3/6M (suma bez
//                    powtórzeń); progi wpisuje użytkownik, liczone tutaj,
//   🎯 Upside — ranking średniej ceny celu analityków (upside do średniej, kolumny Min / Max),
//   🧱 Bazy        — spółki w otwartej bazie/korekcie blisko pivotu (heurystyka watchlist.py::detect_bases),
//   ⭐ Ulubione    — własne ★ użytkownika (localStorage).
// To tylko informacja do przeglądania, nie rekomendacja inwestycyjna.
// ============================================================

const COMPACT_MAX_WIDTH = 640;
const CHART_LOG_KEY = "momentum_watchlist_chart_log";
const CHART_LEGEND_KEY = "momentum_watchlist_chart_legend";
const CHART_EST_KEY = "momentum_watchlist_chart_est";   // "1" = estymaty analityków włączone
const CHART_LAYOUT_KEY = "momentum_watchlist_chart_layout";   // "1" | "dw" | "4"
const ALERTS_TV_KEY = "momentum_watchlist_alerts_tv";          // "0" = w zakładkach Alerty i Bazy bez wykresu TradingView
const TV_TABS = ["ALERTS", "BASES"];                            // zakładki z układem "dzienny + TradingView"
const CHART_WINLEN_KEY = "momentum_watchlist_chart_winlen";   // zapamiętana długość okna suwaka {d, w}
const CHART_DAILY_KEY = "momentum_watchlist_chart_daily";
const FAVS_KEY = "momentum_watchlist_favs";
const SCORES_KEY = "momentum_watchlist_scores";            // własny score spółek wpisywany ręcznie {ticker: liczba}
const SETTINGS_KEY = "momentum_watchlist_settings";
const EARNINGS_SOON_DAYS = 7;
const BASE_LABELS_PL = { flat: "Flat base", cup: "Cup base", correction: "Korekta", deep: "Głęboka korekta" };
const DEFAULT_SETTINGS = {
    tab: "LIST", rsMin: 80, epsMin: 0, compMin: 0, ptMinAnalysts: 3, qm: { minDollarVolumeM: 20, minAdrPct: 4, topPct: 10 }, bases: { maxDistPct: 10, vcpOnly: false },
};
const QM_WINDOWS = [["1M", "low_ratio_1m"], ["3M", "low_ratio_3m"], ["6M", "low_ratio_6m"]];
const TAB_DEFAULT_SORT = {
    LIST: ["ticker", "asc"], RS: ["composite_rating", "desc"], QM: ["max_ratio", "desc"], PT: ["pt_upside_pct", "desc"],
    BASES: ["pct_to_pivot", "asc"], FAV: ["ticker", "asc"], ALERTS: ["alert_rank", "asc"],
};
const TAB_TITLES = {
    LIST: "Lista Finviz", RS: "Ratingi RS / EPS / Composite", QM: "Filtr Qullamaggie", PT: "Ranking upside do ceny celu", BASES: "Bazy blisko pivotu", FAV: "Ulubione", ALERTS: "Alerty na liniach",
};
const FALLBACK_REPO = "agnar92/Momentum";

const state = {
    data: null,
    tab: DEFAULT_SETTINGS.tab,
    rsMin: DEFAULT_SETTINGS.rsMin,
    epsMin: DEFAULT_SETTINGS.epsMin,
    compMin: DEFAULT_SETTINGS.compMin,
    ptMinAnalysts: DEFAULT_SETTINGS.ptMinAnalysts,
    qm: { ...DEFAULT_SETTINGS.qm },
    bases: { ...DEFAULT_SETTINGS.bases },
    favs: new Set(),
    scores: {},
    scoreMin: null,
    scoreMax: null,
    search: "",
    sector: "",
    sortKey: "ticker",
    sortDir: "asc",
};

// ---------- czyste funkcje (testowane w tests/js/watchlist.test.js) ----------

// Liderzy RS: rs_rating >= próg, od najwyższego.
function rsLeaders(stocks, minRating, minEps = 0, minComposite = 0) {
    const atLeast = (v, min) => !(Number(min) > 0) || (Number.isFinite(v) && v >= Number(min));   // próg 0 = bez filtra (brak ratingu przechodzi)
    return stocks
        .filter(s => Number.isFinite(s.rs_rating) && s.rs_rating >= (Number(minRating) || 0)
            && atLeast(s.eps_rating, minEps) && atLeast(s.composite_rating, minComposite))
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

// Ranking cen celu analityków (Yahoo): spółki ze średnią ceną celu, najwyższy upside do średniej na górze;
// min/max = najniższa i najwyższa cena celu. Pola pt_* liczy watchlist.py::estimate_fields.
function ptRows(stocks, minAnalysts = 0) {
    return stocks.filter(s => Number.isFinite(s.pt_mean) && Number.isFinite(s.pt_upside_pct) && (!minAnalysts || s.analysts >= minAnalysts));
}

// Brakujące pt_low/pt_high (starszy watchlist.json sprzed tej kolumny) uzupełniamy z data/estimates.json.
function fillTargets(stocks, estimates) {
    stocks.forEach(s => {
        const pt = estimates && estimates[s.ticker] && estimates[s.ticker].pt;
        if (!pt || s.pt_low !== undefined) return;
        s.pt_low = Number.isFinite(pt.low) ? pt.low : null;
        s.pt_high = Number.isFinite(pt.high) ? pt.high : null;
    });
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
// Własny score (ręczny): od/do — pusty zakres nie filtruje; spółka bez score odpada, gdy ustawiono dowolną granicę.
function scoreInRange(score, min, max) {
    const hasMin = Number.isFinite(min), hasMax = Number.isFinite(max);
    if (!hasMin && !hasMax) return true;
    if (!Number.isFinite(score)) return false;
    return (!hasMin || score >= min) && (!hasMax || score <= max);
}

function applyCommonFilters(stocks, search, sector, scoreMin, scoreMax) {
    const q = (search || "").trim().toLowerCase();
    return stocks.filter(s => {
        if (sector && s.sector !== sector) return false;
        if (!scoreInRange(s.score, scoreMin, scoreMax)) return false;
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

function ratingCell(s, key = "rs_rating") {
    const v = s[key];
    if (!Number.isFinite(v)) return `<td class="muted">—</td>`;
    const cls = v >= 80 ? "positive" : (v < 50 ? "negative" : "");
    return `<td class="${cls}"><strong>${v}</strong></td>`;
}

function earningsCell(s) {
    const days = earningsInDays(s.earnings);
    const soon = days !== null && days >= 0 && days <= EARNINGS_SOON_DAYS;
    return `<td${soon ? ` class="earnings-soon" title="Wyniki za ${days} dni — podwyższone ryzyko luki"` : ""}>${soon ? "⚠ " : ""}${escapeHtml(s.earnings || "—")}</td>`;
}

function baseSummary(s) {
    if (!s.base_type) return "—";
    return `${BASE_LABELS_PL[s.base_type] || s.base_type}${s.base_type === "cup" && s.base_handle ? " z rączką" : ""} −${s.base_depth_pct}% · ${s.base_weeks} tyg.${s.vcp ? " · VCP" : ""}${s.base_mkt_dd_pct >= 7 ? ` · S&P −${s.base_mkt_dd_pct}%` : ""}`;
}

// Kolumny: [nagłówek, klucz sortowania (null = nie sortuje), funkcja komórki, opcjonalny tytuł nagłówka].
const COL = {
    rank: ["#", null, (s, i) => `<td><span class="rank-badge">${i}</span></td>`],
    fav: ["★", null, s => `<td class="fav-cell" data-fav="${escapeHtml(s.ticker)}" title="Dodaj/usuń z ulubionych">${state.favs.has(s.ticker) ? "★" : "☆"}</td>`],
    score: ["Score", "score", s => `<td class="score-cell"><input type="number" step="any" class="score-input" data-score="${escapeHtml(s.ticker)}" value="${Number.isFinite(s.score) ? s.score : ""}" placeholder="–" title="Twój własny score (wpisz ręcznie, po nim można filtrować)"></td>`, "Twój własny score wpisywany ręcznie; filtr „Score od/do” w pasku u góry"],
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
    epsr: ["EPS Rating", "eps_rating", s => ratingCell(s, "eps_rating"), "EPS Rating 1–99 (przybliżenie IBD): wzrost EPS r/r z dwóch ostatnich kwartałów + roczny wzrost EPS (bieżący rok i 5 lat), percentyl wśród spółek z listy"],
    comp: ["Composite", "composite_rating", s => ratingCell(s, "composite_rating"), "Średnia z RS Rating i EPS Rating (po 50 %); puste, gdy brakuje któregoś z nich"],
    epsq: ["EPS kw. r/r", "eps_q0_yoy", s => pctCell(s.eps_q0_yoy), "Wzrost EPS ostatniego zrealizowanego kwartału względem tego samego kwartału rok wcześniej"],
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
    ptMean: ["Śr. cel", "pt_mean", s => `<td title="${s.analysts ? s.analysts + " analityków" : ""}"><strong>${money(s.pt_mean)}</strong></td>`, "Średnia cena celu analityków (Yahoo)"],
    ptLow: ["Min", "pt_low", s => `<td>${money(s.pt_low)}</td>`, "Najniższa cena celu analityków"],
    ptHigh: ["Max", "pt_high", s => `<td>${money(s.pt_high)}</td>`, "Najwyższa cena celu analityków"],
    ptRange: ["Min – max", "pt_low", s => `<td>${Number.isFinite(s.pt_low) && Number.isFinite(s.pt_high) ? `${s.pt_low.toFixed(0)} – ${s.pt_high.toFixed(0)}` : "—"}</td>`, "Najniższa – najwyższa cena celu"],
    analysts: ["Analitycy", "analysts", s => `<td>${Number.isFinite(s.analysts) ? s.analysts : "—"}</td>`, "Liczba analityków w konsensusie EPS"],
    pivot: ["Pivot", "pivot", s => `<td>${money(s.pivot)}</td>`],
    toPivot: ["Do pivotu", "pct_to_pivot", s => pctCell(s.pct_to_pivot)],
    baseType: ["Typ bazy", "base_type", s => `<td>${BASE_LABELS_PL[s.base_type] || "—"}${s.vcp ? ` <span class="positive">VCP</span>` : ""}</td>`],
    depth: ["Głębokość", "base_depth_pct", s => `<td>${Number.isFinite(s.base_depth_pct) ? "−" + s.base_depth_pct + "%" : "—"}</td>`],
    baseWeeks: ["Tygodnie", "base_weeks", s => `<td>${s.base_weeks ?? "—"}</td>`],
    trend: ["Trendlinia", "tl_state", s => `<td${s.tl_state === "wybicie" ? ` class="positive"` : ""}>${s.tl_state ? (s.tl_state === "wybicie" ? `▲ wybicie${Number.isFinite(s.tl_vol_ratio) ? ` ×${s.tl_vol_ratio} wol.${s.tl_vol_ok ? " ✓" : ""}` : ""}` : "przy oporze") : ""}${s.tl_pattern ? ` <span class="muted small">${escapeHtml(s.tl_pattern)}</span>` : (s.tl_state ? "" : "—")}</td>`, "Wybicie / zbliżenie do linii oporu (dzienne, ostatnie ~70 sesji) i wykryty kształt"],
    upside: ["Upside", "pt_upside_pct", s => `<td class="${Number.isFinite(s.pt_upside_pct) ? (s.pt_upside_pct > 0 ? "positive" : "negative") : ""}" title="${Number.isFinite(s.pt_mean) ? "Średnia cena celu analityków $" + s.pt_mean + (s.analysts ? " (" + s.analysts + " analityków)" : "") : ""}">${fmtPct(s.pt_upside_pct, 0)}</td>`, "Różnica między średnią ceną celu analityków a ceną dziś (Yahoo)"],
    rev30: ["Rewizje EPS 30d", "eps_rev30_pct", s => pctCell(s.eps_rev30_pct), "Zmiana konsensusu EPS na bieżący rok obrachunkowy w ostatnich 30 dniach (rewizje w górę = analitycy podnoszą prognozy)"],
    rev90: ["Rewizje EPS 90d", "eps_rev90_pct", s => pctCell(s.eps_rev90_pct), "To samo w ostatnich 90 dniach"],
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
const LEAD = ["rank", "fav", "ticker", "score", "company", "sector"];
const LIST_COLUMNS = [...LEAD, "cap", "price", "sma50", "sma200", "high52", "epsThis", "epsNext", "eps5", "epsNext5", "rs", "epsr", "comp", "rsLine", "upside", "rev30", "rev90", "base", "trend", "spark", "earnings", "tv"];
const TAB_COLUMNS = {
    LIST: LIST_COLUMNS,
    FAV: LIST_COLUMNS,
    RS: [...LEAD, "price", "comp", "rs", "epsr", "epsq", "rsLine", "upside", "rev30", "r3", "r6", "r12", "epsNext", "epsNext5", "spark", "earnings", "tv"],
    QM: [...LEAD, "price", "dollarVol", "adr", "ratio", "rs", "spark", "earnings", "tv"],
    PT: [...LEAD, "price", "ptMean", "upside", "ptLow", "ptHigh", "analysts", "rev30", "rs", "earnings", "tv"],
    ALERTS: ["rank", "ticker", "company", "price", "alKind", "alDir", "alValue", "alDist", "alStatus", "alAct"],
    BASES: [...LEAD, "price", "baseType", "depth", "baseWeeks", "pivot", "toPivot", "high52", "trend", "rs", "spark", "earnings", "tv"],
};

// Widok dzielony (jak w TC2000: wąska lista po lewej, wykres po prawej) — w wąskiej liście tylko kluczowe kolumny.
const SPLIT_MIN_WIDTH = 1000, SPLIT_MIN_HEIGHT = 560;
const TAB_COLUMNS_COMPACT = {
    LIST: ["fav", "ticker", "score", "price", "rs", "high52"],
    FAV: ["fav", "ticker", "score", "price", "rs", "high52"],
    RS: ["fav", "ticker", "score", "comp", "rs", "epsr"],
    QM: ["fav", "ticker", "score", "price", "adr", "ratio"],
    PT: ["fav", "ticker", "score", "ptMean", "upside", "ptRange"],
    BASES: ["fav", "ticker", "score", "price", "baseType", "toPivot"],
    ALERTS: ["ticker", "alValue", "alDist", "alStatus", "alAct"],
};
let splitMode = false;
const columnsFor = tab => (splitMode ? TAB_COLUMNS_COMPACT[tab] : TAB_COLUMNS[tab]);

function renderHeaders() {
    Object.keys(TAB_COLUMNS).forEach(tab => {
        const head = columnsFor(tab).map(id => {
            const [label, key, , title] = COL[id];
            return `<th${key ? ` data-key="${key}"` : ""}${title ? ` title="${title}"` : ""}${id === "tv" ? ` class="tv-col"` : ""}>${label}</th>`;
        }).join("");
        document.querySelector(`#table-${tab} thead`).innerHTML = `<tr>${head}</tr>`;
    });
}

function renderRow(tab, s, i) {
    return columnsFor(tab).map(id => COL[id][2](s, i)).join("");
}

function rowsForTab(tab) {
    state.data.stocks.forEach(s => { s.score = Object.prototype.hasOwnProperty.call(state.scores, s.ticker) ? state.scores[s.ticker] : null; });
    const stocks = applyCommonFilters(state.data.stocks, state.search, state.sector, state.scoreMin, state.scoreMax);
    if (tab === "RS") return rsLeaders(stocks, state.rsMin, state.epsMin, state.compMin);
    if (tab === "QM") return qullamaggieRows(stocks, state.qm);
    if (tab === "PT") return ptRows(stocks, state.ptMinAnalysts);
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
    PT: "Brak spółek z ceną celu analityków przy bieżących filtrach (dane Yahoo ładują się z codziennego odświeżenia).",
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
    markSelectedRow();
    if (splitMode && !currentChart && !chartRequested) {   // jak w TC2000: wykres zawsze pokazuje bieżący symbol z listy
        const first = tbody.querySelector("tr[data-ticker]");
        if (first) openChart(first.dataset.ticker);
        else showChartPlaceholder();
    }
}

// Zaznaczenie wiersza spółki, której wykres jest otwarty (i przewinięcie do niego).
function markSelectedRow(scroll = false) {
    const t = chartRequested;
    document.querySelectorAll("table.momentum-table tbody tr.row-selected").forEach(tr => tr.classList.remove("row-selected"));
    if (!t) return;
    const tr = [...document.querySelectorAll(`#table-${state.tab} tbody tr[data-ticker]`)].find(r => r.dataset.ticker === t);
    if (tr) { tr.classList.add("row-selected"); if (scroll) tr.scrollIntoView({ block: "nearest" }); }
}

// Strzałki ↑/↓ przechodzą po bieżącej liście (jak spacja/strzałki w TC2000) i ładują wykres kolejnej spółki.
function stepChart(delta) {
    const rows = [...document.querySelectorAll(`#table-${state.tab} tbody tr[data-ticker]`)];
    if (!rows.length) return;
    const cur = rows.findIndex(r => r.dataset.ticker === chartRequested);
    const next = rows[Math.max(0, Math.min(rows.length - 1, cur < 0 ? 0 : cur + delta))];
    if (next && next.dataset.ticker !== chartRequested) openChart(next.dataset.ticker);
}

function showChartPlaceholder() {
    const body = document.getElementById("chartBody");
    if (body) body.innerHTML = `<div class="empty-state">Wybierz spółkę z listy (kliknij wiersz albo użyj strzałek ↑ ↓).</div>`;
    document.getElementById("chartTitle").textContent = "";
    document.getElementById("chartSub").textContent = "";
    document.getElementById("chartStats").textContent = "";
    document.getElementById("chartPattern").textContent = "";
}

// Przełączenie układu: widok dzielony (szeroki ekran) <-> wykres w oknie (wąski ekran / telefon).
function applyLayoutMode() {
    const want = window.innerWidth >= SPLIT_MIN_WIDTH && window.innerHeight >= SPLIT_MIN_HEIGHT;
    if (want === splitMode) return;
    splitMode = want;
    document.body.classList.toggle("split", want);
    if (document.getElementById("chartLayoutBtn")) updateLayoutButton();
    if (state.data) {
        renderHeaders();
        if (!want) {
            document.getElementById("chartModal").hidden = true;
            currentChart = null; chartRequested = null; chartToken++;
            if (chartFull) setChartFull(false);
        }
        renderTable();
    }
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
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ tab: state.tab, rsMin: state.rsMin, epsMin: state.epsMin, compMin: state.compMin, ptMinAnalysts: state.ptMinAnalysts, qm: state.qm, bases: state.bases }));
    } catch (e) { /* brak localStorage — ignorujemy */ }
}

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
        if (!saved) return;
        if (TAB_TITLES[saved.tab]) state.tab = saved.tab;
        if (Number.isFinite(saved.rsMin)) state.rsMin = saved.rsMin;
        if (Number.isFinite(saved.epsMin)) state.epsMin = saved.epsMin;
        if (Number.isFinite(saved.compMin)) state.compMin = saved.compMin;
        if (Number.isFinite(saved.ptMinAnalysts)) state.ptMinAnalysts = saved.ptMinAnalysts;
        if (saved.qm) ["minDollarVolumeM", "minAdrPct", "topPct"].forEach(k => {
            if (Number.isFinite(saved.qm[k])) state.qm[k] = saved.qm[k];
        });
        if (saved.bases) {
            if (Number.isFinite(saved.bases.maxDistPct)) state.bases.maxDistPct = saved.bases.maxDistPct;
            state.bases.vcpOnly = saved.bases.vcpOnly === true;
        }
    } catch (e) { /* uszkodzony zapis — zostają domyślne */ }
}

// ---------- własne ustawienia: ulubione ★ i score (synchronizowane z adnotacjami przez Gist) ----------
// prefsStore = { scores: {T: {v: liczba|null, t: ISO}}, favs: {T: {v: true|false, t: ISO}} } — każda wartość ma czas zmiany,
// a usunięcie to wpis z v = null/false (nagrobek), dzięki czemu scalenie z drugim urządzeniem (mergePrefs) wybiera nowszą zmianę.
let prefsStore = { scores: {}, favs: {} };
const PREFS_KEY = "momentum_watchlist_prefs";
const PREFS_EPOCH = "1970-01-01T00:00:00.000Z";   // dane sprzed synchronizacji: przegrywają z każdą świadomą zmianą

function prefsNormalize(p) {
    const out = { scores: {}, favs: {} };
    ["scores", "favs"].forEach(kind => {
        const src = (p && p[kind]) || {};
        Object.keys(src).sort().forEach(t => {
            const e = src[t];
            if (e && typeof e === "object" && typeof e.t === "string") out[kind][t] = { v: kind === "scores" ? (Number.isFinite(e.v) ? e.v : null) : e.v === true, t: e.t };
        });
    });
    return out;
}

// Scalanie po spółce: wygrywa wpis z późniejszym czasem zmiany (przy remisie — bez zmian, wartość z a).
function mergePrefs(a, b) {
    const A = prefsNormalize(a), B = prefsNormalize(b), out = { scores: {}, favs: {} };
    ["scores", "favs"].forEach(kind => {
        [...new Set([...Object.keys(A[kind]), ...Object.keys(B[kind])])].sort().forEach(t => {
            const x = A[kind][t], y = B[kind][t];
            out[kind][t] = !x ? y : !y ? x : (y.t > x.t ? y : x);
        });
    });
    return out;
}

// Z prefsStore odtwarza to, czego używa reszta strony (state.favs / state.scores).
function prefsApply() {
    state.favs = new Set(Object.keys(prefsStore.favs).filter(t => prefsStore.favs[t].v === true));
    state.scores = {};
    Object.keys(prefsStore.scores).forEach(t => { if (Number.isFinite(prefsStore.scores[t].v)) state.scores[t] = prefsStore.scores[t].v; });
}

function prefsWriteLocal() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefsStore)); } catch (e) { /* brak localStorage */ }
}

function loadPrefs() {
    try {
        const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
        if (saved) prefsStore = prefsNormalize(saved);
    } catch (e) { /* uszkodzony zapis */ }
    // jednorazowa migracja z dawnych kluczy (ulubione i score były tylko lokalne)
    try {
        const favs = JSON.parse(localStorage.getItem(FAVS_KEY) || "[]");
        if (Array.isArray(favs)) favs.filter(t => typeof t === "string").forEach(t => { if (!prefsStore.favs[t]) prefsStore.favs[t] = { v: true, t: PREFS_EPOCH }; });
        const scores = JSON.parse(localStorage.getItem(SCORES_KEY) || "{}");
        if (scores && typeof scores === "object") Object.keys(scores).forEach(t => { if (Number.isFinite(scores[t]) && !prefsStore.scores[t]) prefsStore.scores[t] = { v: scores[t], t: PREFS_EPOCH }; });
    } catch (e) { /* uszkodzony zapis */ }
    prefsStore = prefsNormalize(prefsStore);
    prefsWriteLocal();
    prefsApply();
}

// Zapis własnego score (pusty = usunięcie); komórki w tabeli i pole w nagłówku wykresu zapisują tędy.
function setScore(ticker, raw) {
    const v = parseFloat(raw);
    prefsStore.scores[ticker] = { v: Number.isFinite(v) ? v : null, t: new Date().toISOString() };
    prefsWriteLocal(); prefsApply(); annOnSave();
    const box = document.getElementById("chartScore");
    if (box && (chartRequested === ticker || (currentChart && currentChart.ticker === ticker))) box.value = Number.isFinite(v) ? v : "";
    renderTable();
}

function toggleFav(ticker) {
    prefsStore.favs[ticker] = { v: !state.favs.has(ticker), t: new Date().toISOString() };
    prefsWriteLocal(); prefsApply(); annOnSave();
    renderTable();
}

function showTab(tab, resetSort = true) {
    const layoutBefore = effectiveLayout();
    state.tab = tab;
    if (resetSort) [state.sortKey, state.sortDir] = TAB_DEFAULT_SORT[tab];
    document.querySelectorAll(".drawer-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    const activeTab = document.querySelector(".drawer-tab.active");
    if (activeTab && activeTab.scrollIntoView) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
    Object.keys(TAB_TITLES).forEach(t => {
        document.getElementById(`table-${t}`).hidden = t !== tab;
        document.getElementById(`guide-${t}`).hidden = t !== tab;
        document.getElementById(`controls-${t}`).hidden = t !== tab;
    });
    document.getElementById("drawerTitle").textContent = TAB_TITLES[tab];
    saveSettings();
    renderTable();
    // zakładki Alerty i Bazy mają własny układ (dzienny + TradingView) — przerysuj wykres po zmianie zakładki
    if (document.getElementById("chartLayoutBtn")) updateLayoutButton();
    if (currentChart && effectiveLayout() !== layoutBefore) { chartWindows = []; chartActiveCell = 0; drawChart(); }
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
    document.getElementById("ptMinAnalysts").value = state.ptMinAnalysts;
    bind("ptMinAnalysts", v => { state.ptMinAnalysts = v; });
    document.getElementById("epsMin").value = state.epsMin;
    document.getElementById("compMin").value = state.compMin;
    bind("epsMin", v => { state.epsMin = v; });
    bind("compMin", v => { state.compMin = v; });
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
    [["scoreMin", "scoreMin"], ["scoreMax", "scoreMax"]].forEach(([id, key]) => {
        document.getElementById(id).addEventListener("input", e => {
            const v = parseFloat(e.target.value);
            state[key] = Number.isFinite(v) ? v : null;
            renderTable();
        });
    });
    // Score w komórce tabeli: zapis po zatwierdzeniu (Enter / opuszczenie pola), żeby przerysowanie nie zabierało fokusu przy pisaniu
    document.querySelectorAll("table.momentum-table tbody").forEach(tbody => {
        tbody.addEventListener("change", ev => {
            const inp = ev.target.closest && ev.target.closest("input[data-score]");
            if (inp) setScore(inp.dataset.score, inp.value);
        });
        tbody.addEventListener("keydown", ev => {
            if (ev.key === "Enter" && ev.target.matches && ev.target.matches("input[data-score]")) ev.target.blur();
        });
    });
    const sectorSelect = document.getElementById("sectorSelect");
    [...new Set(state.data.stocks.map(s => s.sector).filter(Boolean))].sort().forEach(sec => {
        const opt = document.createElement("option");
        opt.value = sec;
        opt.textContent = sec;
        sectorSelect.appendChild(opt);
    });
    sectorSelect.addEventListener("change", () => { state.sector = sectorSelect.value; renderTable(); });

    document.querySelectorAll(".drawer-tab").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
    // Pasek zakładek przewija się poziomo także kółkiem myszy (na wąskim ekranie nie mieści wszystkich zakładek)
    const tabsBar = document.querySelector(".drawer-tabs");
    if (tabsBar) tabsBar.addEventListener("wheel", e => {
        if (tabsBar.scrollWidth > tabsBar.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            tabsBar.scrollLeft += e.deltaY;
            e.preventDefault();
        }
    }, { passive: false });
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
        if (ev.target.closest("a") || ev.target.closest("input")) return;
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
let chartWinLen = { d: null, w: null };   // długość okna suwaka zapamiętana dla wszystkich spółek (osobno dzienny / tygodniowy)
let chartWindows = [];      // okna suwaków {n, end} po jednym na wykres w siatce (puste = domyślne); zerowane przy nowej spółce / zmianie układu
let chartEstOn = false;      // estymaty analityków na wykresie (cena celu + rewizje konsensusu EPS), przycisk „Estymaty”
let estimatesPromise = null;
let estimatesMap = null;
let estimatesFailed = false;   // data/estimates.json niedostępny (np. jeszcze nie wygenerowany przez workflow)
let chartActiveCell = 0;     // w układzie „dzienny + tygodniowy”: który wykres ma fokus (tylko w nim można rysować linie / poprawiać cupy)
let alertsTvOn = true;      // zakładki Alerty i Bazy (widok dzielony): po prawej wykres TradingView zamiast tygodniowego
let chartLayout = "1";      // układ wykresów w widoku dzielonym: "1" wykres, "dw" dzienny + tygodniowy, "4" cztery spółki
let chartDaily = true;      // wykres dzienny zamiast tygodniowego
let chartLegendOn = false;  // legenda i podpisy paneli na wykresie na telefonie (domyślnie ukryte — mały ekran)
let chartLog = false;       // skala logarytmiczna ceny (zapamiętywana w przeglądarce)
let chartRequested = null;  // ticker, którego wykres jest otwarty lub właśnie się wczytuje (zaznaczenie wiersza, strzałki)
let chartToken = 0;         // numeruje żądania wykresu — spóźniona odpowiedź nie nadpisze nowszej spółki
let chartFull = false;      // okno wykresu na cały ekran (przycisk ⛶ / klawisz F)
let chartWide = false;      // pełny ekran na szerokim monitorze => układ szeroki (chart.js)
let chartCompact = false;   // układ dla wąskiego ekranu (telefon) — patrz chart.js
let currentChart = null;    // { charts, ticker, stock } — do ponownego narysowania po przełączeniu skali
// Estymaty analityków (watchlist.py::update_estimates -> data/estimates.json) — ładowane leniwie przy pierwszym włączeniu.
function loadEstimates() {
    if (!estimatesPromise) {
        estimatesPromise = fetch("data/estimates.json", { cache: "no-store" })
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(d => { estimatesMap = d.stocks || {}; return estimatesMap; })
            .catch(e => { console.error("Nie udało się wczytać data/estimates.json:", e); estimatesPromise = null; estimatesFailed = true; return null; });
    }
    return estimatesPromise;
}

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
    const scoreBox = document.getElementById("chartScore");
    if (scoreBox) scoreBox.value = Number.isFinite(state.scores[ticker]) ? state.scores[ticker] : "";
    document.getElementById("chartTv").href = tvUrlFor(ticker);
    document.getElementById("chartFv").href = `https://finviz.com/stock?t=${encodeURIComponent(ticker)}&ty=fc&p=d&b=1`;
    document.getElementById("chartZx").href = `https://www.zacks.com/stock/quote/${encodeURIComponent(ticker)}`;
    const body = document.getElementById("chartBody");
    chartRequested = ticker;
    chartActiveCell = 0;
    const token = ++chartToken;
    markSelectedRow(true);
    chartCompact = window.innerWidth <= COMPACT_MAX_WIDTH;
    chartWindows = [];
    Object.assign(annEdit, { on: false, tool: null, selected: null, pending: [], cursor: null });   // nowy wykres: poza trybem edycji
    annCurrent = null;
    annSyncTools();
    body.innerHTML = `<div class="empty-state">Ładowanie wykresu…</div>`;
    modal.hidden = false;
    const charts = await loadCharts();
    if (modal.hidden || token !== chartToken) return; // zamknięte w trakcie ładowania albo wybrano już inną spółkę
    if (!charts) { body.innerHTML = `<div class="empty-state">Nie udało się wczytać danych wykresów.</div>`; return; }
    if (chartEstOn) await loadEstimates();
    if (modal.hidden || token !== chartToken) return;
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

// Zmiana DŁUGOŚCI okna suwaka jest zapamiętywana (localStorage) dla wszystkich spółek; samo przesuwanie okna nie.
function rememberWindowLength(n, daily) {
    const key = daily ? "d" : "w";
    if (chartWinLen[key] === n) return;
    chartWinLen[key] = n;
    try { localStorage.setItem(CHART_WINLEN_KEY, JSON.stringify(chartWinLen)); } catch (e) { /* brak localStorage */ }
}

// Spółki widoczne na liście (kolejność jak w tabeli) — dla siatki 4 wykresów i strzałek.
function visibleTickers() {
    return [...document.querySelectorAll(`#table-${state.tab} tbody tr[data-ticker]`)].map(r => r.dataset.ticker);
}

// Komórki siatki wykresów dla bieżącego układu (pierwsza = zaznaczona spółka, jedyna edytowalna).
// Układ wykresów faktycznie używany: w zakładkach Alerty i Bazy (widok dzielony) "dtv" = Twój wykres dzienny z liniami i alertami
// + wykres TradingView (na żywo, z własnymi narzędziami rysowania); w pozostałych zakładkach wybrany przyciskiem.
function effectiveLayout() {
    if (!splitMode) return "1";
    return TV_TABS.includes(state.tab) && alertsTvOn ? "dtv" : chartLayout;
}

// Widget TradingView (Advanced Chart): dzienny, z paskiem narzędzi rysowania. Rysunki w widgecie żyją tylko w tej karcie
// (bez konta TradingView nie są zapisywane) — stałe linie i alerty rysuj na wykresie obok.
const TV_ALERT_WIDGET = {
    src: `${TV_EMBED_BASE}embed-widget-advanced-chart.js`,
    autosizeFill: true,
    config: symbol => ({
        autosize: true, symbol, interval: "D", timezone: "America/New_York", theme: "dark", style: "1", locale: "pl",
        allow_symbol_change: true, hide_side_toolbar: false, withdateranges: true, calendar: false, details: false,
        hide_top_toolbar: false, save_image: true, support_host: "https://www.tradingview.com",
    }),
};
const tvSymbol = ticker => ticker.replace("-", ".");   // BRK-B (Yahoo/Finviz) -> BRK.B (TradingView)

function chartCells() {
    const cur = currentChart.ticker;
    const layout = effectiveLayout();
    if (layout === "dtv") return [{ ticker: cur, daily: true }, { ticker: cur, tv: true }];
    if (layout === "dw") return [{ ticker: cur, daily: true }, { ticker: cur, daily: false }];
    if (layout === "4") {
        const list = visibleTickers(), i = list.indexOf(cur);
        const rest = i >= 0 ? list.slice(i + 1) : list.filter(t => t !== cur);
        return [cur, ...rest].slice(0, 4).map(t => ({ ticker: t, daily: true }));
    }
    return [{ ticker: cur, daily: chartDaily }];
}

function drawChart() {
    if (!currentChart) return null;
    const layout = effectiveLayout();
    const cells = chartCells();
    const activeIdx = layout === "dw" ? Math.min(chartActiveCell, cells.length - 1) : 0;   // komórka z fokusem = edytowalna
    const body = document.getElementById("chartBody");
    const cellHtml = (c, i) => {
        const st = state.data.stocks.find(x => x.ticker === c.ticker);
        const label = c.tv ? `TradingView — na żywo, rysuj własne linie <a href="${tvUrlFor(c.ticker)}" target="_blank" rel="noopener">otwórz ↗</a>`
            : layout === "dtv" ? "dzienny — Twoje linie, cupy i alerty"
            : layout === "dw" ? (c.daily ? "dzienny" : "tygodniowy") : escapeHtml(st && st.company ? st.company : "");
        return `<div class="chart-cell${i === activeIdx ? " primary" : ""}${c.tv ? " tv" : ""}" data-ticker="${escapeHtml(c.ticker)}"><div class="cell-head"><strong>${escapeHtml(c.ticker)}</strong> <span>${label}</span></div>`
            + `<div class="wl-chart-readout cell-readout"></div><div class="cell-body"></div></div>`;
    };
    // Układ z TradingView: widget (iframe) nie może być przebudowywany przy każdym przerysowaniu (np. wejście w tryb edycji
    // spacją) — gubiłby narysowane linie i przeładowywał się. Przy tej samej spółce odświeżamy tylko lewy wykres.
    let grid = body.querySelector(".chart-grid.layout-dtv");
    const keepTv = layout === "dtv" && grid && grid.dataset.ticker === currentChart.ticker && grid.querySelector(".chart-cell.tv .tradingview-widget-container");
    if (keepTv) {
        const tpl = document.createElement("template");
        tpl.innerHTML = cellHtml(cells[0], 0);
        grid.children[0].replaceWith(tpl.content.firstElementChild);
    } else {
        body.innerHTML = `<div class="chart-grid layout-${layout}${layout === "dtv" ? " layout-dw" : ""}" data-ticker="${escapeHtml(currentChart.ticker)}">${cells.map(cellHtml).join("")}</div>`;
        const tvIdx = cells.findIndex(c => c.tv);
        if (tvIdx >= 0) body.querySelectorAll(".chart-cell")[tvIdx].querySelector(".cell-body").appendChild(buildTvWidgetBlock(TV_ALERT_WIDGET, tvSymbol(cells[tvIdx].ticker)));
    }
    let primary = null;
    cells.forEach((c, i) => {
        if (c.tv) return;
        const cell = body.querySelectorAll(".chart-cell")[i];
        const st = state.data.stocks.find(x => x.ticker === c.ticker) || null;
        const opts = {
            log: chartLog, daily: c.daily, uid: "c" + i,
            compact: layout === "1" ? chartCompact : false, wide: layout === "1" && chartWide,
            hideLabels: layout === "1" && !splitMode && !chartLegendOn,
            fit: layout === "1" ? (chartFull && !splitMode ? phoneFullFit() : null) : cellFit(cell),
            window: chartWindows[i], windowLen: c.daily ? chartWinLen.d : chartWinLen.w,
            onWindow: w => { chartWindows[i] = w; rememberWindowLength(w.n, c.daily); },
            estimates: chartEstOn && estimatesMap ? estimatesMap[c.ticker] || null : null,
            hideAutoLines: annHide(c.ticker).lines, hideAutoCups: annHide(c.ticker).cups,
            overlay: oc => annOverlay({ ...oc, ticker: c.ticker, stock: st, readonly: i !== activeIdx, uid: "c" + i }),
        };
        const model = renderStockChart(cell.querySelector(".cell-body"), cell.querySelector(".cell-readout"), currentChart.charts, c.ticker, st, opts);
        if (i === activeIdx) primary = model;
    });
    // klik w nagłówek innego wykresu w siatce 4 spółek zaznacza tę spółkę
    if (layout === "4") {
        body.querySelectorAll(".chart-cell:not(.primary) .cell-head").forEach(h => h.addEventListener("click", () => openChart(h.parentElement.dataset.ticker)));
    } else if (layout === "dw") {
        // kliknięcie w dowolny z dwóch wykresów (poza suwakiem) daje mu fokus — wtedy to w nim rysujesz linie i poprawiasz cupy
        body.querySelectorAll(".chart-cell").forEach((cell, i) => cell.addEventListener("pointerdown", ev => {
            if (i === chartActiveCell || ev.target.closest(".wl-range")) return;
            chartActiveCell = i;
            Object.assign(annEdit, { tool: null, selected: null, pending: [], cursor: null });
            annSyncTools();
            drawChart();
        }, true));
    }
    document.getElementById("chartPattern").textContent = primary ? patternExplain(primary) : "";
    const estEl = document.getElementById("chartEstimates");
    const pst = state.data.stocks.find(x => x.ticker === currentChart.ticker);
    estEl.textContent = chartEstOn ? (estimatesMap ? estimateText(estimatesMap[currentChart.ticker], pst && pst.price) : (estimatesFailed ? "Estymaty analityków jeszcze niedostępne — pojawią się po najbliższym odświeżeniu danych." : "Ładowanie estymat…")) : "";
    return primary;
}

// Telefon, pełny ekran: wykres dostaje cały ekran pod skróconym nagłówkiem (układ liczony w pikselach jak w siatce),
// dzięki temu w poziomie nie jest miniaturą ograniczoną wysokością okna.
function phoneFullFit() {
    const head = document.querySelector("#chartModal .wl-chart-head").getBoundingClientRect();
    return { w: Math.max(260, window.innerWidth - 16), h: Math.max(340, window.innerHeight - head.bottom - 104) };   // min. 340: w poziomie wykres jest minimalnie wyższy niż ekran (przewijasz)   // 104 = odczyt, suwak, odstępy
}

// Rozmiar (px) miejsca na wykres w komórce siatki: wysokość komórki minus nagłówek, odczyt i suwak.
function cellFit(cell) {
    const body = cell.querySelector(".cell-body");
    const r = body.getBoundingClientRect();
    return { w: Math.max(260, r.width), h: Math.max(180, r.height - 34) };   // 34 = suwak okna + odstępy
}

function updateLayoutButton() {
    const btn = document.getElementById("chartLayoutBtn");
    const names = { "1": "Układ: 1 wykres", dw: "Układ: dzienny + tygodniowy", "4": "Układ: 4 spółki" };
    btn.hidden = !splitMode;
    document.getElementById("chartLegendBtn").hidden = splitMode;
    // w zakładkach Alerty i Bazy przycisk włącza / wyłącza wykres TradingView obok Twojego dziennego
    btn.textContent = TV_TABS.includes(state.tab) ? (alertsTvOn ? "Układ: dzienny + TradingView" : "TradingView: wył.") : names[chartLayout];
    document.getElementById("chartTfBtn").hidden = splitMode && effectiveLayout() !== "1";   // interwał dotyczy tylko układu z jednym wykresem
}

// Pełny ekran okna wykresu: klasa CSS (działa wszędzie, także na iPhonie) + prawdziwy pełny ekran przeglądarki, gdy jest dostępny.
function setChartFull(on) {
    chartFull = on;
    const modal = document.getElementById("chartModal");
    modal.querySelector(".wl-chart-box").classList.toggle("full", on);
    modal.querySelector(".wl-chart-box").classList.toggle("phone-full", on && !splitMode);   // telefon: skrócony nagłówek, wykres na cały ekran
    document.getElementById("chartFullBtn").textContent = on ? "⤢ Zamknij pełny ekran" : "⛶ Pełny ekran";
    try {
        if (on && !document.fullscreenElement && modal.requestFullscreen) modal.requestFullscreen().catch(() => {});
        else if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } catch (e) { /* brak Fullscreen API */ }
    chartWide = on && window.innerWidth / window.innerHeight > 1.5 && window.innerWidth > 1100;
    if (currentChart) drawChart();
}

function closeChart() {
    if (chartFull) setChartFull(false);
    document.getElementById("chartModal").hidden = true;
    Object.assign(annEdit, { on: false, tool: null, selected: null, pending: [], cursor: null });
    annSyncTools();
    currentChart = null;
    chartRequested = null;
    chartToken++;
    renderTable();   // zakładka Alerty / licznik mogły się zmienić po edycji linii
}

function updateLogButton() {
    const legendBtn = document.getElementById("chartLegendBtn");
    legendBtn.hidden = splitMode;
    legendBtn.textContent = chartLegendOn ? "Legenda: wł." : "Legenda: wył.";
    document.getElementById("chartLogBtn").textContent = chartLog ? "Skala: logarytmiczna" : "Skala: liniowa";
}

function updateTfButton() {
    document.getElementById("chartTfBtn").textContent = chartDaily ? "Wykres: dzienny" : "Wykres: tygodniowy";
}

function initChartModal() {
    try {
        chartLog = localStorage.getItem(CHART_LOG_KEY) === "1";
        chartLegendOn = localStorage.getItem(CHART_LEGEND_KEY) === "1";
        const saved = JSON.parse(localStorage.getItem(CHART_WINLEN_KEY) || "null");
        if (saved) ["d", "w"].forEach(k => { if (Number.isFinite(saved[k]) && saved[k] > 0) chartWinLen[k] = saved[k]; });
        chartDaily = localStorage.getItem(CHART_DAILY_KEY) !== "0";   // domyślnie dzienny (wybicia i wolumen)
    } catch (e) { /* brak localStorage */ }
    updateLogButton();
    updateTfButton();
    document.getElementById("chartTfBtn").addEventListener("click", () => {
        chartDaily = !chartDaily;
        chartWindows = [];
        try { localStorage.setItem(CHART_DAILY_KEY, chartDaily ? "1" : "0"); } catch (e) { /* ignoruj */ }
        updateTfButton();
        drawChart();
    });
    const chartScore = document.getElementById("chartScore");
    if (chartScore) {
        chartScore.addEventListener("change", () => { if (chartRequested) setScore(chartRequested, chartScore.value); });
        chartScore.addEventListener("keydown", ev => { if (ev.key === "Enter") chartScore.blur(); });
    }
    document.getElementById("chartLegendBtn").addEventListener("click", () => {
        chartLegendOn = !chartLegendOn;
        try { localStorage.setItem(CHART_LEGEND_KEY, chartLegendOn ? "1" : "0"); } catch (e) { /* ignoruj */ }
        updateLogButton();
        if (currentChart) drawChart();
    });
    document.getElementById("chartLogBtn").addEventListener("click", () => {
        chartLog = !chartLog;
        try { localStorage.setItem(CHART_LOG_KEY, chartLog ? "1" : "0"); } catch (e) { /* ignoruj */ }
        updateLogButton();
        drawChart();
    });
    document.getElementById("chartClose").addEventListener("click", closeChart);
    document.getElementById("chartFullBtn").addEventListener("click", () => setChartFull(!chartFull));
    try { chartEstOn = localStorage.getItem(CHART_EST_KEY) === "1"; } catch (e) { /* brak localStorage */ }
    const updateEstButton = () => {
        const b = document.getElementById("chartEstBtn");
        b.textContent = chartEstOn ? "Estymaty: wł." : "Estymaty: wył.";
        b.classList.toggle("active", chartEstOn);
    };
    updateEstButton();
    if (chartEstOn) loadEstimates();
    document.getElementById("chartEstBtn").addEventListener("click", async () => {
        chartEstOn = !chartEstOn;
        try { localStorage.setItem(CHART_EST_KEY, chartEstOn ? "1" : "0"); } catch (e) { /* ignoruj */ }
        updateEstButton();
        if (chartEstOn && !estimatesMap) { estimatesFailed = false; if (currentChart) drawChart(); await loadEstimates(); }   // najpierw "Ładowanie…", potem dane
        if (currentChart) drawChart();
    });
    try { const saved = localStorage.getItem(CHART_LAYOUT_KEY); if (["1", "dw", "4"].includes(saved)) chartLayout = saved; } catch (e) { /* brak localStorage */ }
    try { alertsTvOn = localStorage.getItem(ALERTS_TV_KEY) !== "0"; } catch (e) { /* brak localStorage */ }
    document.getElementById("chartLayoutBtn").addEventListener("click", () => {
        if (TV_TABS.includes(state.tab)) {
            alertsTvOn = !alertsTvOn;
            try { localStorage.setItem(ALERTS_TV_KEY, alertsTvOn ? "1" : "0"); } catch (e) { /* ignoruj */ }
        } else {
            chartLayout = { "1": "dw", dw: "4", "4": "1" }[chartLayout];
            try { localStorage.setItem(CHART_LAYOUT_KEY, chartLayout); } catch (e) { /* ignoruj */ }
        }
        chartWindows = [];
        chartActiveCell = 0;
        updateLayoutButton();
        if (currentChart) drawChart();
    });
    updateLayoutButton();
    // Wyjście z pełnego ekranu klawiszem Esc (obsługuje przeglądarka) synchronizuje stan przycisku i układ.
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && chartFull) setChartFull(false); });
    // Obrót telefonu / zmiana rozmiaru okna przełącza układ kompaktowy bez ponownego otwierania wykresu.
    let resizeTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if (((splitMode && effectiveLayout() !== "1") || (chartFull && !splitMode)) && currentChart) drawChart(); }, 150);   // siatka: nowy rozmiar komórek
        applyLayoutMode();
        const compact = window.innerWidth <= COMPACT_MAX_WIDTH;
        if (!currentChart || compact === chartCompact) return;
        chartCompact = compact;
        chartWindows = [];
        drawChart();
    });
    document.getElementById("chartModal").addEventListener("click", ev => { if (ev.target.id === "chartModal" && !splitMode) closeChart(); });
    document.addEventListener("keydown", ev => {
        if (ev.key === "Escape") { if (chartFull) setChartFull(false); else if (!splitMode) closeChart(); return; }
        const open = !document.getElementById("chartModal").hidden || splitMode;
        const typingNow = /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName);
        if ((ev.key === "ArrowDown" || ev.key === "ArrowUp") && open && !typingNow && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
            ev.preventDefault();
            stepChart(ev.key === "ArrowDown" ? 1 : -1);
            return;
        }
        if ((ev.key === "f" || ev.key === "F") && open && !ev.ctrlKey && !ev.metaKey && !/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) setChartFull(!chartFull);
    });
}

let dataLoadedAt = Date.now();
const DATA_STALE_MS = 10 * 60 * 1000;   // po powrocie do aplikacji dane starsze niż to są pobierane od nowa

async function loadData() {
    try {
        const res = await fetch("data/watchlist.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.data = await res.json();
        dataLoadedAt = Date.now();
    } catch (e) {
        console.error("Nie udało się wczytać data/watchlist.json:", e);
        state.data = { stocks: [], n_stocks: 0 };
    }
}

// Odświeżenie danych bez przeładowania strony: PWA wznowiona z tła nie ładuje się od nowa, więc po powrocie do aplikacji
// (po DATA_STALE_MS) pobieramy watchlist.json ponownie; gdy jest nowsze pobranie, podmieniamy dane i przerysowujemy listę.
async function refreshDataIfStale() {
    if (!state.data || Date.now() - dataLoadedAt < DATA_STALE_MS) return;
    dataLoadedAt = Date.now();
    try {
        const res = await fetch("data/watchlist.json", { cache: "no-store" });
        if (!res.ok) return;
        const fresh = await res.json();
        if (!fresh || !fresh.stocks || !fresh.stocks.length || fresh.generated_at === state.data.generated_at) return;
        state.data = fresh;
        chartsPromise = null; estimatesPromise = null; estimatesMap = null;   // wykresy i estymaty też mogły się zmienić
        loadEstimates().then(map => { if (map) { fillTargets(state.data.stocks, map); renderTable(); } });
        renderDataInfo();
        renderTable();
        if (currentChart) openChart(currentChart.ticker);
        showToast("Dane odświeżone.");
    } catch (e) { /* offline — zostają dotychczasowe dane */ }
}

// typeof document check: pozwala wczytać ten plik przez `require()` w testach Node bez uruchamiania
// inicjalizacji strony — w przeglądarce document zawsze istnieje.
if (typeof document !== "undefined") {
    (async function init() {
        initConnStatus();
        loadSettings();
        loadPrefs();
        annLoad();
        await loadData();
        renderDataInfo();
        applyLayoutMode();
        renderHeaders();
        initControls();
        annInitUI(drawChart);
        initAnnotationIO();
        syncInit(() => { updateAlertBadge(); renderTable(); if (!document.getElementById("chartModal").hidden) drawChart(); });
        showTab(state.tab);
        hideLoadingOverlay();
        loadEstimates().then(map => { if (map) { fillTargets(state.data.stocks, map); renderTable(); } });
    })();

    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshDataIfStale(); });
    window.addEventListener("pageshow", e => { if (e.persisted) refreshDataIfStale(); });

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
}

// Eksport wyłącznie dla test runnera Node (tests/js/watchlist.test.js) — w przeglądarce module nie istnieje.
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        rsLeaders, qullamaggieRows, ptRows, fillTargets, baseRows, earningsInDays, mergePrefs, prefsNormalize, applyCommonFilters, scoreInRange, githubActionsUrl, sortRows,
        fmtMarketCap, fmtVolume, fmtPct, sparkSvg, state, COL, TAB_COLUMNS, TAB_COLUMNS_COMPACT, TAB_TITLES,
    };
}
