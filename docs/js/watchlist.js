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
//   (RS Rating, EPS Rating i Composite zostały kolumnami; zakładki Ratingi i Wybicia usunięto — sortuj w CANSLIM)
//   🎯 Qullamaggie — progi obrotu/ADR + top X% wzrostu z okien 1/3/6M (suma bez
//                    powtórzeń); progi wpisuje użytkownik, liczone tutaj,
//   🎯 Upside — ranking średniej ceny celu analityków (upside do średniej, kolumny Min / Max),
//   🧱 Bazy        — spółki w otwartej bazie/korekcie blisko pivotu (heurystyka watchlist.py::detect_bases),
//   ⭐ Ulubione    — własne ★ użytkownika (localStorage).
// To tylko informacja do przeglądania, nie rekomendacja inwestycyjna.
// ============================================================

const COMPACT_MAX_WIDTH = 640;
const SWIPE_MIN_PX = 60, SWIPE_MAX_MS = 700;   // przeciągnięcie po tytule wykresu = następna / poprzednia spółka
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
    tab: "LIST", csMin: 6, qm: { minDollarVolumeM: 20, minAdrPct: 4, topPct: 10 }, bases: { maxDistPct: 10, vcpOnly: false }, brk: { maxDistPct: 5 },
};
// Strategie = zakładki z filtrami; kolejność decyduje o grupowaniu w zakładce Alerty (Q, potem B, na końcu spółki bez strategii).
const STRATEGIES = { Q: ["Q", "Qullamaggie"], B: ["B", "Bazy blisko pivotu"] };
const STRATEGY_ORDER = ["Q", "B"];
function tagStrategies(allStocks, filtered, st, alerts = []) {
    tagBreakouts(allStocks, alerts, st.brk ? st.brk.maxDistPct : DEFAULT_SETTINGS.brk.maxDistPct);
    const sets = {
        Q: new Set(qullamaggieRows(filtered, st.qm).map(s => s.ticker)),
        B: new Set(baseRows(filtered, st.bases).map(s => s.ticker)),
    };
    allStocks.forEach(s => {
        s.strat = STRATEGY_ORDER.filter(c => sets[c].has(s.ticker));
        s.strat_rank = s.strat.length ? STRATEGY_ORDER.indexOf(s.strat[0]) : STRATEGY_ORDER.length;
        const ratios = QM_WINDOWS.map(([, key]) => s[key]).filter(Number.isFinite);
        s.max_ratio = ratios.length ? Math.max(...ratios) : null;
    });
}
const QM_WINDOWS = [["1M", "low_ratio_1m"], ["3M", "low_ratio_3m"], ["6M", "low_ratio_6m"]];
const TAB_DEFAULT_SORT = {
    LIST: ["ticker", "asc"], QM: ["max_ratio", "desc"],
    CS: ["cs", "desc"], BASES: ["pct_to_pivot", "asc"], POS: ["pos_to_stop_pct", "desc"], FAV: ["ticker", "asc"], ALERTS: ["alert_group", "asc"],
};
const BOTTOM_NAV_TABS = ["LIST", "CS", "POS", "ALERTS"];   // zakładki z dolnej nawigacji telefonu; reszta jest w menu Więcej
const FILTERS_TAB = "FILTERS";   // zakładka z konfiguracją wyszukiwania (bez własnej tabeli) — patrz #filtersPanel
const TAB_TITLES = {
    LIST: "Lista Finviz", CS: "Lista CANSLIM (C A N S L I M)", POS: "Moje pozycje", QM: "Filtr Qullamaggie", BASES: "Bazy blisko pivotu", FAV: "Ulubione", ALERTS: "Alerty na liniach",
};
const FALLBACK_REPO = "agnar92/Momentum";

const state = {
    data: null,
    tab: DEFAULT_SETTINGS.tab,
    csMin: DEFAULT_SETTINGS.csMin,
    qm: { ...DEFAULT_SETTINGS.qm },
    bases: { ...DEFAULT_SETTINGS.bases },
    brk: { ...DEFAULT_SETTINGS.brk },
    favs: new Set(),
    scores: {},
    pos: {},
    acct: { capital: null, riskPct: null },
    scoreMin: null,
    scoreMax: null,
    search: "",
    sector: "",
    sortKey: "ticker",
    sortDir: "asc",
};

// ---------- czyste funkcje (testowane w tests/js/watchlist.test.js) ----------

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
// Upside i cel: źródłem głównym jest Finviz (stabilniejszy niż Yahoo); gdy starszy watchlist.json go jeszcze nie ma — Yahoo.
function upsideMain(s) {
    if (Number.isFinite(s.finviz_upside_pct)) return s.finviz_upside_pct;
    return Number.isFinite(s.pt_upside_pct) ? s.pt_upside_pct : null;
}

function targetMain(s) {
    if (Number.isFinite(s.finviz_target)) return s.finviz_target;
    return Number.isFinite(s.pt_mean) ? s.pt_mean : null;
}

// Etykieta rekomendacji analityków Finviz (1 = Strong Buy ... 5 = Strong Sell).
function recomLabel(r) {
    if (!Number.isFinite(r)) return "";
    return r < 1.5 ? "Strong Buy" : r < 2.5 ? "Buy" : r < 3.5 ? "Hold" : r < 4.5 ? "Sell" : "Strong Sell";
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

// ---------- pozycje ----------
// Wielkość pozycji z ryzyka: akcje = floor(kapitał · ryzyko% / (wejście − stop)). null, gdy dane nie mają sensu (stop nad wejściem itd.).
function positionSize(capital, riskPct, entry, stop) {
    if (![capital, riskPct, entry, stop].every(Number.isFinite) || capital <= 0 || riskPct <= 0 || entry <= 0 || stop <= 0 || stop >= entry) return null;
    const perShare = entry - stop;
    const shares = Math.floor((capital * riskPct / 100) / perShare);
    return { shares, risk_usd: shares * perShare, value: shares * entry, pct_of_capital: shares * entry / capital * 100 };
}

// Metryki otwartej pozycji względem bieżącej ceny: zysk (%, $), wielokrotność ryzyka R, odległość do stopu, wartość, ryzyko początkowe, R:R celu.
function positionMetrics(pos, price) {
    if (!pos || !Number.isFinite(pos.entry) || pos.entry <= 0 || !Number.isFinite(price)) return null;
    const perShare = Number.isFinite(pos.stop) && pos.stop < pos.entry ? pos.entry - pos.stop : null;
    const shares = Number.isFinite(pos.shares) ? pos.shares : null;
    return {
        pl_pct: (price / pos.entry - 1) * 100,
        pl_usd: shares !== null ? (price - pos.entry) * shares : null,
        r: perShare ? (price - pos.entry) / perShare : null,
        to_stop_pct: Number.isFinite(pos.stop) ? (pos.stop / price - 1) * 100 : null,
        value: shares !== null ? shares * price : null,
        risk_usd: perShare && shares !== null ? perShare * shares : null,
        rr_target: perShare && Number.isFinite(pos.target) ? (pos.target - pos.entry) / perShare : null,
        stop_hit: Number.isFinite(pos.stop) && price <= pos.stop,
    };
}

// Ustawia na każdej spółce s.position (wpis) i płaskie pola pos_* do sortowania; bez pozycji wszystko null.
function tagPositions(stocks, positions) {
    stocks.forEach(s => {
        const p = positions[s.ticker];
        const m = p ? positionMetrics(p, s.price) : null;
        s.position = m ? { ...p, ...m } : null;
        s.pos_pl_pct = m ? m.pl_pct : null;
        s.pos_r = m ? m.r : null;
        s.pos_to_stop_pct = m ? m.to_stop_pct : null;
        s.pos_value = m ? m.value : null;
        s.pos_risk_usd = m ? m.risk_usd : null;
    });
}

function positionRows(stocks) {
    return stocks.filter(s => s.position).sort((a, b) => (b.pos_to_stop_pct ?? -Infinity) - (a.pos_to_stop_pct ?? -Infinity));
}

// Podsumowanie portfela: liczba pozycji, wartość, ryzyko do stopów (suma początkowych ryzyk) i jako % kapitału.
function positionTotals(rows, capital) {
    let value = 0, risk = 0, pl = 0;
    rows.forEach(s => { value += s.pos_value || 0; risk += s.pos_risk_usd || 0; pl += s.position.pl_usd || 0; });
    return { n: rows.length, value, risk, pl, risk_pct: Number.isFinite(capital) && capital > 0 ? risk / capital * 100 : null };
}

// Wybicia: spółki tuż PRZED wybiciem (albo świeżo po nim). Powody: flaga / korytarz przy oporze lub świeże wybicie (tl_state),
// blisko pivotu bazy (pct_to_pivot), własna linia z alertem „nad linią” blisko ceny albo przebita (alerty z annotate.js).
// dist = ile % brakuje do najbliższego poziomu wybicia (null = już po wybiciu); rank 0 = wybicie / przebity alert, 1 = do 2 %, 2 = dalej.
// Wybicie wg O'Neila = ZAMKNIĘCIE (dzienne albo tygodniowe) nad linią / pivotem na podwyższonym wolumenie (≥ 1,5× średniej). Samo przebicie
// maksimum w trakcie świecy to nie wybicie, a zamknięcie nad poziomem bez wolumenu jest tylko „niepotwierdzone” (nie trafia do rank 0).
const BRK_VOL_MULT = 1.5;
const BUYABLE_BASES = ["flat", "cup"];   // pivot do wybicia i strefa zakupu mają sens tylko dla baz kupowalnych (nie „korekta” / „głęboka korekta”)
function breakoutInfo(s, alert, maxDist) {
    const reasons = [];
    const dists = [];
    const vols = [];
    let fresh = false;
    const volTxt = (r, ok) => (Number.isFinite(r) ? ` ×${r} wol.${ok ? " ✓" : ""}` : "");
    // formacje z linią oporu (flaga / korytarz): osobno na świecach dziennych i tygodniowych
    [["", "dz."], ["w", "tyg."]].forEach(([p, tf]) => {
        const state = s[`tl${p}_state`], pattern = s[`tl${p}_pattern`] || "formacji", ratio = s[`tl${p}_vol_ratio`], dist = s[`tl${p}_dist_pct`];
        if (state === "wybicie") {
            fresh = true;
            if (Number.isFinite(ratio)) vols.push(ratio);
            reasons.push({ code: "tl", text: `wybicie z ${pattern} (${tf})${volTxt(ratio, s[`tl${p}_vol_ok`])}` });
        } else if (state === "bez wolumenu") {
            reasons.push({ code: "tl", text: `zamknięcie nad oporem ${pattern} (${tf}) bez wolumenu${volTxt(ratio, false)} — niepotwierdzone` });
        } else if (state === "przy oporze") {
            if (Number.isFinite(dist) && dist > 0) dists.push(dist);
            reasons.push({ code: "tl", text: `przy oporze ${pattern} (${tf})${Number.isFinite(dist) ? ` (${dist.toFixed(1)}%)` : ""}`.trim() });
        }
    });
    if (BUYABLE_BASES.includes(s.base_type) && Number.isFinite(s.pct_to_pivot) && s.pct_to_pivot <= maxDist && s.pct_to_pivot > -3) {
        const tf = s.pivot_tf === "W" ? "tyg." : "dz.";
        if (s.pct_to_pivot >= 0) {
            dists.push(s.pct_to_pivot);
            reasons.push({ code: "pivot", text: `pivot +${s.pct_to_pivot.toFixed(1)}%${s.vcp ? " VCP" : ""}` });
        } else if (s.pivot_state === "wybicie") {
            fresh = true;
            if (Number.isFinite(s.pivot_vol_ratio)) vols.push(s.pivot_vol_ratio);
            reasons.push({ code: "pivot", text: `wybicie pivotu (${tf})${volTxt(s.pivot_vol_ratio, true)}${s.vcp ? " VCP" : ""}` });
        } else if (s.pivot_state === "bez wolumenu") {
            reasons.push({ code: "pivot", text: `zamknięcie nad pivotem (${tf}) bez wolumenu${volTxt(s.pivot_vol_ratio, false)} — niepotwierdzone` });
        } else if (s.pivot_state === undefined) {
            fresh = true;   // starszy watchlist.json bez pola pivot_state: dawna reguła (cena nad pivotem)
            reasons.push({ code: "pivot", text: `pivot ${s.pct_to_pivot.toFixed(1)}%${s.vcp ? " VCP" : ""}` });
        } else {
            reasons.push({ code: "pivot", text: `nad pivotem ${(-s.pct_to_pivot).toFixed(1)}% (wybicie starsze niż kilka sesji)` });
        }
    }
    if (alert && alert.alert === "above") {
        if (alert.triggered) {
            const v = s.vol_surge_5d;
            if (!Number.isFinite(v) || v >= BRK_VOL_MULT) {   // brak danych o wolumenie (starszy plik) = dawna reguła
                fresh = true;
                if (Number.isFinite(v)) vols.push(v);
                reasons.push({ code: "alert", text: `zamknięcie nad moją linią${volTxt(v, true)}` });
            } else {
                reasons.push({ code: "alert", text: `zamknięcie nad moją linią bez wolumenu${volTxt(v, false)} — niepotwierdzone` });
            }
        } else if (alert.dist < 0 && -alert.dist <= Math.max(ANN_NEAR_PCT, maxDist)) {
            const need = (1 / (1 + alert.dist / 100) - 1) * 100;   // ile % wzrostu do linii
            dists.push(need);
            reasons.push({ code: "alert", text: `moja linia ${need.toFixed(1)}%` });
        }
    }
    if (!reasons.length) return null;
    const dist = dists.length ? Math.min(...dists) : null;
    const rank = fresh ? 0 : (dist !== null && dist <= 2 ? 1 : 2);
    const bestVol = vols.length ? Math.max(...vols) : (s.tl_vol_ratio || 0);
    return { reasons, dist, rank, sort: rank * 1000 + (dist !== null ? dist : -bestVol) };   // świeże wybicia: mocniejszy wolumen wyżej
}

// Ustawia s.brk / s.brk_sort na każdej spółce (alerts = wiersze alertRows; bierzemy najbliższy alert „nad” dla spółki).
function tagBreakouts(stocks, alerts, maxDist) {
    const best = new Map();
    alerts.forEach(r => {
        const a = r.alert;
        if (a.alert !== "above" || a.pos) return;   // cel pozycji to nie kandydat na wybicie
        const cur = best.get(r.ticker);
        if (!cur || Math.abs(a.dist) < Math.abs(cur.dist)) best.set(r.ticker, a);
    });
    stocks.forEach(s => {
        s.brk = breakoutInfo(s, best.get(s.ticker), maxDist);
        s.brk_sort = s.brk ? s.brk.sort : null;
    });
}

// Lista kontrolna CANSLIM z danych, które już mamy (heurystyka O'Neila, progi nie testowane historycznie):
// C = EPS ostatniego kwartału r/r ≥ 25 %, A = wzrost EPS 5 lat ≥ 20 % (bez tego: EPS w tym roku ≥ 25 %), N = do 15 % pod szczytem 52 tyg.,
// S = Acc/Dis A lub B (popyt > podaż), L = RS Rating ≥ 80, I = instytucje ≥ 20 % i napływ, M = rynek w trendzie wzrostowym (EMA10 > EMA20 tyg.).
const CANSLIM_KEYS = ["C", "A", "N", "S", "L", "I", "M"];
const CANSLIM_HELP = {
    C: "C — bieżące zyski: EPS ostatniego kwartału r/r ≥ 25 %", A: "A — roczne zyski: wzrost EPS 5 lat ≥ 20 % (albo EPS w tym roku ≥ 25 %)", N: "N — nowość / szczyt: nie dalej niż 15 % pod szczytem 52 tyg.",
    S: "S — popyt i podaż: Acc/Dis A lub B", L: "L — lider: RS Rating ≥ 80", I: "I — instytucje: własność ≥ 20 % i napływ w ostatnim kwartale", M: "M — rynek: S&P 500 i Nasdaq w trendzie wzrostowym (EMA10 > EMA20 tyg.)",
};
function canslimInfo(s, regime) {
    const num = Number.isFinite;
    const tri = (v, test) => (num(v) ? test(v) : null);
    let a = tri(s.eps_past_5y, v => v >= 20);
    if (a === null) a = tri(s.eps_this_y, v => v >= 25);
    const flags = {
        C: tri(s.eps_q0_yoy, v => v >= 25), A: a, N: tri(s.pct_from_high_52w, v => v >= -15),
        S: s.accdis ? s.accdis === "A" || s.accdis === "B" : null, L: tri(s.rs_rating, v => v >= 80),
        I: typeof s.inst_sponsor === "boolean" ? s.inst_sponsor : null, M: regime === "uptrend" ? true : regime === "correction" ? false : null,
    };
    const score = CANSLIM_KEYS.filter(k => flags[k] === true).length;
    const known = CANSLIM_KEYS.filter(k => flags[k] !== null).length;
    return { flags, score, known };
}
function tagCanslim(stocks, regime) {
    stocks.forEach(s => { const c = canslimInfo(s, regime); s.canslim = c; s.cs = c.known >= 4 ? c.score : null; });
}
function canslimRows(stocks, minScore) {
    return stocks.filter(s => s.cs !== null && s.cs >= minScore).sort((a, b) => b.cs - a.cs || (b.composite_rating ?? -1) - (a.composite_rating ?? -1));
}
// Wyjaśnienie wyniku CANSLIM litera po literze (okno po kliknięciu etykiety n/7): co zmierzyliśmy, jaka jest reguła, czy spełnione i czego uczy O'Neil.
// Czysta funkcja — pokazuje te same liczby, na których canslimInfo ustala flagi.
function canslimExplain(s, regime) {
    const c = canslimInfo(s, regime);
    const num = Number.isFinite;
    const pct = v => `${v > 0 ? "+" : ""}${v}%`;
    const rows = [];
    const add = (key, name, rule, have, lesson) => rows.push({ key, name, ok: c.flags[key], rule, have, lesson });
    add("C", "Current earnings — bieżące zyski", "EPS z ostatniego kwartału wyższy r/r o co najmniej 25 %",
        num(s.eps_q0_yoy) ? `EPS ostatniego kwartału ${pct(s.eps_q0_yoy)} r/r${num(s.eps_q1_yoy) ? `, poprzedniego ${pct(s.eps_q1_yoy)}` : ""}` : "brak danych o EPS z ostatniego kwartału",
        "O'Neil szuka przyspieszających zysków: minimum ok. 18–20 %, najlepsze spółki 25–50 % i więcej. Jeszcze lepiej, gdy wzrost przyspiesza z kwartału na kwartał (porównaj oba kwartały).");
    const five = num(s.eps_past_5y), tyEps = num(s.eps_this_y);
    add("A", "Annual earnings — roczne zyski", five ? "średni roczny wzrost EPS z 5 lat co najmniej 20 %" : "brak wzrostu z 5 lat — liczymy EPS za bieżący rok ≥ 25 %",
        five ? `wzrost EPS z 5 lat ${pct(s.eps_past_5y)} rocznie${tyEps ? `, w tym roku ${pct(s.eps_this_y)}` : ""}` : tyEps ? `EPS w tym roku ${pct(s.eps_this_y)}` : "brak danych o rocznym wzroście EPS",
        "Pojedynczy dobry kwartał to za mało — liderzy mają zwykle wzrost zysków ≥ 25 % rok do roku przez kilka lat. Młode spółki mogą nie mieć 5 lat historii, dlatego wtedy patrzymy na bieżący rok.");
    add("N", "New — nowe szczyty, produkty, zarząd", "cena nie dalej niż 15 % pod szczytem 52 tygodni",
        num(s.pct_from_high_52w) ? (s.pct_from_high_52w >= 0 ? "cena na szczycie 52 tygodni" : `${Math.abs(s.pct_from_high_52w)}% poniżej szczytu 52 tyg.`) : "brak danych o szczycie 52 tyg.",
        "Nie szukamy „tanich” spółek po spadkach: największe wzrosty zaczynają się blisko nowych szczytów, po zbudowaniu bazy (cup, flat base). Tu mierzymy tylko cenę; „nowość” (produkt, zarząd) oceń sam z newsów.");
    add("S", "Supply & demand — popyt i podaż", "ocena Acc/Dis A lub B (instytucje kupują częściej niż sprzedają)",
        s.accdis ? `Acc/Dis ${s.accdis}${num(s.accdis_rating) ? ` (percentyl ${s.accdis_rating})` : ""}` : "brak oceny Acc/Dis",
        "Ceny rosną, gdy popyt przeważa nad podażą — widać to po wolumenie. Acc/Dis (nasz wskaźnik Chaikina z 13 tyg.) pokazuje, czy dni wzrostowe mają większy wolumen niż spadkowe. To przybliżenie, nie dokładna ocena IBD.");
    add("L", "Leader — lider czy maruda", "RS Rating co najmniej 80 (silniejsza od 80 % spółek z naszej listy)",
        num(s.rs_rating) ? `RS Rating ${s.rs_rating}${num(s.industry_rating) ? `, grupa branżowa ${s.industry_rating}` : ""}${s.leader ? ", oznaczona jako ★ lider" : ""}` : "brak RS Rating (zbyt krótka historia)",
        "Kupuj liderów branży, nie maruderów. RS Rating porównuje 12-miesięczną siłę ceny z resztą rynku (u nas: z listą po filtrach Finviz, więc to nie jest globalny percentyl).");
    add("I", "Institutional sponsorship — instytucje", "instytucje posiadają co najmniej 20 % akcji i ich udział rośnie",
        num(s.inst_own) ? `instytucje ${s.inst_own}%${num(s.inst_trans) ? `, zmiana w ostatnim kwartale ${pct(s.inst_trans)}` : ""}` : "brak danych o instytucjach",
        "Duży ruch w górę wymaga kupujących z dużym kapitałem. Szukamy kilku solidnych funduszy i rosnącego udziału; nadmiernie obłożona spółka (bardzo wysoki udział) bywa już „wykupiona”.");
    add("M", "Market direction — kierunek rynku", "S&P 500 i Nasdaq w trendzie wzrostowym (EMA10 > EMA20 tygodniowa)",
        regime === "uptrend" ? "rynek w trendzie wzrostowym" : regime === "correction" ? "rynek w korekcie" : "brak danych o rynku",
        "Ok. 3 na 4 akcje podąża za rynkiem. Nawet najlepsza spółka ma małe szanse w korekcie — dlatego przy korekcie wynik nie przekroczy 6/7.");
    return { score: c.score, known: c.known, rows };
}

function canslimSheetHtml(s, regime) {
    const e = canslimExplain(s, regime);
    const mark = ok => (ok === true ? "✓" : ok === false ? "✗" : "?");
    const verdict = ok => (ok === true ? "spełnione" : ok === false ? "niespełnione" : "brak danych");
    return `<p class="cs-intro">Spełnione: <b>${e.score}/7</b> (znane kryteria: ${e.known}). Poniżej liczby, na których opiera się każda litera, i krótka lekcja z „How to Make Money in Stocks”.</p>`
        + e.rows.map(r => `<section class="cs-row ${r.ok === true ? "ok" : r.ok === false ? "no" : "na"}"><header><span class="cs-key">${r.key}</span><b>${escapeHtml(r.name)}</b><span class="cs-verdict">${mark(r.ok)} ${verdict(r.ok)}</span></header>`
            + `<p><i>Mamy:</i> ${escapeHtml(r.have)}</p><p><i>Reguła:</i> ${escapeHtml(r.rule)}</p><p class="cs-lesson"><i>Czego uczy O'Neil:</i> ${escapeHtml(r.lesson)}</p></section>`).join("")
        + `<p class="cs-note">To heurystyka z danych Finviz / Yahoo, nie dokładne oceny IBD — zweryfikuj na wykresie i w raportach spółki. Informacja pomocnicza, nie rekomendacja.</p>`;
}

function openCanslimSheet(ticker) {
    const s = state.data && state.data.stocks.find(x => x.ticker === ticker);
    if (!s) return;
    const regime = (state.data.market && state.data.market.regime) || null;
    const c = canslimInfo(s, regime);
    showSheet(`${escapeHtml(ticker)} — CANSLIM ${c.known >= 4 ? c.score + "/7" : "(za mało danych)"}`, canslimSheetHtml(s, regime));
}

function canslimLettersHtml(c) {
    return `<span class="cs-letters">${CANSLIM_KEYS.map(k => `<span class="cs-l ${c.flags[k] === true ? "on" : c.flags[k] === false ? "off" : ""}" title="${escapeHtml(CANSLIM_HELP[k])}">${k}</span>`).join("")}</span>`;
}

// Pastylki ocen nad wykresem (jak panel ocen w MarketSmith): Composite, RS, EPS, grupa, Acc/Dis, stabilność EPS, instytucje, lider.
function ratingChips(s) {
    const chips = [];
    const add = (label, value, cls, title) => { if (value !== null && value !== undefined && value !== "") chips.push({ label, value: String(value), cls: cls || "", title }); };
    const has = Number.isFinite;
    add("Comp", has(s.composite_rating) ? s.composite_rating : null, ratingClass(s.composite_rating), "Composite = średnia z RS i EPS Rating");
    add("RS", has(s.rs_rating) ? s.rs_rating : null, ratingClass(s.rs_rating), "RS Rating: siła cenowa względem listy (1–99)");
    add("EPS", has(s.eps_rating) ? s.eps_rating : null, ratingClass(s.eps_rating), "EPS Rating: wzrost i stabilność zysków (1–99)");
    add("Grupa", has(s.industry_rating) ? s.industry_rating : null, ratingClass(s.industry_rating), "Siła grupy branżowej (średni RS spółek z branży)");
    add("A/D", s.accdis || null, ratingClass(s.accdis_rating), "Akumulacja / dystrybucja ~13 tyg. (A = silna akumulacja, E = dystrybucja)");
    add("Stab.", has(s.eps_stability) ? s.eps_stability + "%" : null, ratingClass(s.eps_stability_rating), "Odsetek ostatnich kwartałów z dodatnim wzrostem EPS r/r");
    add("Inst.", has(s.inst_own) ? s.inst_own.toFixed(0) + "%" : null, s.inst_sponsor === true ? "rt-80" : "", "Własność instytucji (Finviz); zielona = ≥ 20 % i napływ w ostatnim kwartale");
    if (s.canslim && s.cs !== null) { add("CANSLIM", `${s.cs}/7`, s.cs >= 6 ? "rt-90" : s.cs >= 5 ? "rt-80" : s.cs >= 4 ? "rt-60" : "rt-40", "Kliknij, aby zobaczyć, dlaczego każda litera jest (lub nie) spełniona"); chips[chips.length - 1].action = "canslim"; }
    if (s.climax_top === true) add("", "⚠ Climax top", "rt-0", `Sell climax top (tygodniówka, tydzień do ${s.climax_date}: +${s.climax_runup_pct}% w 3 tyg., tydzień +${s.climax_week_gain_pct}%, wolumen ×${s.climax_vol_ratio}${s.climax_gap ? ", luka wyczerpania" : ""}${s.climax_reversal ? ", zamknięcie w dolnej połowie" : ""}${Number.isFinite(s.climax_ext200_pct) && s.climax_ext200_pct >= 70 ? `, ${s.climax_ext200_pct}% nad 200-dniową` : ""}${s.climax_late ? `, późny etap (${s.climax_stage}. baza)` : ""}; potwierdzenia ${s.climax_conf}/4) — możliwe wyczerpanie popytu`);
    if (s.leader === true) add("", "★ Lider", "rt-90", "Lider: RS ≥ 80, silna grupa, blisko szczytu 52 tyg.");
    return chips;
}

function ratingChipsHtml(s) {
    return ratingChips(s).map(c => `<span class="rchip ${c.cls}${c.action ? " rchip-link" : ""}"${c.action ? ` data-action="${c.action}" data-ticker="${escapeHtml(s.ticker)}" role="button" tabindex="0"` : ""} title="${escapeHtml(c.title || "")}">${c.label ? `<i>${escapeHtml(c.label)}</i>` : ""}${escapeHtml(c.value)}</span>`).join("");
}

// Ramka formacji jak „Cup with Handle / Flat Base” w MarketSurge: typ, pivot, długość, głębokość, rączka, VCP. "" bez otwartej bazy.
function baseBoxData(s) {
    if (!s.base_type) return null;
    const rows = [["Pivot", Number.isFinite(s.pivot) ? money(s.pivot) : "—"]];
    if (Number.isFinite(s.base_weeks)) rows.push(["Długość", `${s.base_weeks} tyg.`]);
    if (Number.isFinite(s.base_depth_pct)) rows.push(["Głębokość", `${s.base_depth_pct}%`]);
    if (s.base_type === "cup") rows.push(["Rączka", s.base_handle ? "tak" : "brak"]);
    if (s.vcp) rows.push(["VCP", "tak"]);
    if (!BUYABLE_BASES.includes(s.base_type)) rows.push(["Uwaga", "korekta, nie baza do zakupu"]);
    if (Number.isFinite(s.base_mkt_dd_pct) && s.base_mkt_dd_pct >= 7) rows.push(["S&P w bazie", `−${s.base_mkt_dd_pct}%`]);
    if (Number.isFinite(s.pct_to_pivot)) rows.push([s.pct_to_pivot >= 0 ? "Do pivotu" : "Nad pivotem", `${s.pct_to_pivot >= 0 ? "+" : ""}${Math.abs(s.pct_to_pivot)}%`.replace("+-", "")]);
    return { title: `${BASE_LABELS_PL[s.base_type] || s.base_type}${s.base_type === "cup" && s.base_handle ? " z rączką" : ""}`, rows };
}

function baseBoxHtml(s) {
    const d = baseBoxData(s);
    return d ? `<b>${escapeHtml(d.title)}</b>${d.rows.map(([k, v]) => `<span><i>${escapeHtml(k)}</i>${escapeHtml(v)}</span>`).join("")}` : "";
}

// Jedna linia „czy to już ten moment?” pod tytułem wykresu: dystans do wybicia, baza, wolumen, RS, rynek, wyniki.
function readinessLine(s, regime) {
    const out = [];
    if (s.position) {
        const p = s.position;
        out.push(`💼 ${fmtPct(p.pl_pct)}${p.r !== null ? ` · ${p.r.toFixed(1)}R` : ""}${p.to_stop_pct !== null ? ` · stop ${p.stop_hit ? "PRZEBITY" : fmtPct(p.to_stop_pct)}` : ""}`);
    }
    if (s.climax_top === true) out.push(`⚠ sell climax top (tydz. ${s.climax_date}, potwierdzenia ${s.climax_conf ?? 0}/4)`);
    const b = s.brk;
    if (b) out.push(b.dist !== null ? `Do wybicia: ${b.dist.toFixed(1)}%` : (b.rank === 0 ? "Wybicie świeże" : "Przy poziomie"));
    else out.push("Brak sygnału wybicia");
    if (s.base_type) out.push(BUYABLE_BASES.includes(s.base_type) ? `${BASE_LABELS_PL[s.base_type] || s.base_type}${s.vcp ? " + VCP" : ""}` : `${BASE_LABELS_PL[s.base_type] || s.base_type} (nie baza do zakupu)`);
    if (BUYABLE_BASES.includes(s.base_type) && Number.isFinite(s.pct_to_pivot) && s.pct_to_pivot < 0) {
        const over = -s.pct_to_pivot;
        out.push(over > 5 ? `⚠ ${over.toFixed(1)}% nad pivotem — za późno wg reguły +5 %` : `${over.toFixed(1)}% nad pivotem (strefa zakupu do +5 %)`);
    }
    if (s.tl_pattern) out.push(s.tl_pattern === "flaga" ? "flaga" : "korytarz");
    if (s.tl_state === "bez wolumenu") out.push("zamknięcie nad oporem bez wolumenu — to jeszcze nie wybicie");
    else if (Number.isFinite(s.tl_vol_ratio)) out.push(`wolumen wybicia ×${s.tl_vol_ratio}${s.tl_vol_ok ? " ✓" : " (słaby)"}`);
    if (s.rs_line_state === "przed ceną") out.push("RS przed ceną ●");
    else if (s.rs_line_state) out.push("RS na szczycie");
    const days = earningsInDays(s.earnings);
    if (days !== null && days >= 0 && days <= EARNINGS_SOON_DAYS) out.push(`⚠ wyniki za ${days} dn.`);
    if (regime === "correction") out.push("⚠ rynek w korekcie");
    else if (regime === "uptrend") out.push("rynek ✓");
    return out.join(" · ");
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

const money = v => (Number.isFinite(v) ? "$" + Number(v).toFixed(2) : "—");
const money0 = v => (Number.isFinite(v) ? (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString("pl-PL") : "—");

// Kolor oceny (RS / EPS / Composite) wg percentyla 1–99: <20 czerwony, 20–39 pomarańczowy, 40–59 żółty, 60–79 limonkowy, 80–89 zielony, 90+ ciemna zieleń.
function ratingClass(v) {
    if (!Number.isFinite(v)) return "";
    return v >= 90 ? "rt-90" : v >= 80 ? "rt-80" : v >= 60 ? "rt-60" : v >= 40 ? "rt-40" : v >= 20 ? "rt-20" : "rt-0";
}

function ratingCell(s, key = "rs_rating") {
    const v = s[key];
    if (!Number.isFinite(v)) return `<td class="muted">—</td>`;
    return `<td class="rt ${ratingClass(v)}"><strong>${v}</strong></td>`;
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
    epsStab: ["Stabilność EPS", "eps_stability", s => `<td${Number.isFinite(s.eps_stability) && s.eps_stability < 60 ? ` class="negative"` : ""}>${Number.isFinite(s.eps_stability) ? s.eps_stability + "%" : "—"}</td>`, "Odsetek ostatnich 8 kwartałów, w których EPS r/r wzrósł (min. 4 porównania); 20 % wagi EPS Rating"],
    grp: ["Grupa", "industry_rating", s => ratingCell(s, "industry_rating"), "Siła grupy branżowej 1–99: średni RS Rating spółek z tej samej branży (min. 3 w liście), percentyl wśród branż"],
    leader: ["Lider", "leader", s => `<td${s.leader ? ` class="positive"` : ""} title="Lider (L z CANSLIM): RS ≥ 80, grupa ≥ 60, nie dalej niż 25 % pod szczytem 52 tyg.">${s.leader ? "★ L" : ""}</td>`, "Lider: RS ≥ 80, mocna grupa (≥ 60) i blisko szczytu 52 tyg."],
    ad: ["Acc/Dis", "accdis_rating", s => s.accdis
        ? `<td class="rt ${ratingClass(s.accdis_rating)}" title="Akumulacja / dystrybucja z ~13 tygodni (wolumen ważony pozycją zamknięcia w zakresie dnia), percentyl wśród listy: A = silna akumulacja, E = dystrybucja"><strong>${s.accdis}</strong></td>`
        : `<td class="muted">—</td>`, "Acc/Dis (A–E): czy instytucje zbierają (A) czy sprzedają (E) — z wolumenu ostatnich ~13 tygodni"],
    inst: ["Instytucje", "inst_own", s => Number.isFinite(s.inst_own)
        ? `<td${s.inst_sponsor ? ` class="positive"` : ""} title="Własność instytucji ${s.inst_own}%, zmiana w ostatnim kwartale ${fmtPct(s.inst_trans)}; I ✓ = własność ≥ 20 % i napływ">${s.inst_own.toFixed(0)}%${Number.isFinite(s.inst_trans) ? ` <span class="small ${s.inst_trans >= 0 ? "positive" : "negative"}">${s.inst_trans > 0 ? "+" : ""}${s.inst_trans.toFixed(1)}</span>` : ""}${s.inst_sponsor ? " ✓" : ""}</td>`
        : `<td class="muted">—</td>`, "I z CANSLIM: własność instytucji (%) i jej zmiana w ostatnim kwartale (Finviz); ✓ = własność ≥ 20 % i napływ"],
    epsq: ["EPS kw. r/r", "eps_q0_yoy", s => pctCell(s.eps_q0_yoy), "Wzrost EPS ostatniego zrealizowanego kwartału względem tego samego kwartału rok wcześniej"],
    r3: ["3M", "ret_3m_pct", s => pctCell(s.ret_3m_pct)],
    r6: ["6M", "ret_6m_pct", s => pctCell(s.ret_6m_pct)],
    r12: ["12M", "ret_12m_pct", s => pctCell(s.ret_12m_pct)],
    base: ["Baza", "base_depth_pct", s => `<td>${baseSummary(s)}</td>`],
    dollarVol: ["Obrót dzienny", "dollar_volume_avg", s => `<td>${fmtVolume(s.dollar_volume_avg)}</td>`],
    adr: ["ADR %", "adr_pct", s => `<td>${Number.isFinite(s.adr_pct) ? s.adr_pct.toFixed(1) + "%" : "—"}</td>`],
    ratio: ["Cena / minimum", "max_ratio", s => {
        if (!Number.isFinite(s.max_ratio)) return `<td class="muted">—</td>`;
        if (!s.windows) return `<td title="Cena / najniższy Low z okien 1/3/6M (największy z nich)">×${s.max_ratio.toFixed(2)}</td>`;
        const gains = s.windows.map(w => `${w.label}: ×${w.ratio.toFixed(2)}`).join(" · ");
        return `<td class="positive" title="${gains}"><strong>×${s.max_ratio.toFixed(2)}</strong> <span class="muted small">top ${state.qm.topPct}% w: ${s.windows.map(w => w.label).join(", ")}</span></td>`;
    }, "Cena / najniższy Low z okna (np. ×1.35 = 35% nad minimum)"],
    ptMean: ["Cel", "target_main", s => `<td title="${Number.isFinite(s.finviz_target) ? "Finviz" : "Yahoo"}${s.analysts ? ", " + s.analysts + " analityków (Yahoo)" : ""}"><strong>${money(targetMain(s))}</strong></td>`, "Średnia cena celu analityków (Finviz; Yahoo, gdy brak)"],
    recom: ["Rekomendacja", "recom", s => Number.isFinite(s.recom)
        ? `<td class="rt ${ratingClass(Math.round((5 - s.recom) / 4 * 99))}" title="Rekomendacja analityków Finviz: 1 = Strong Buy … 5 = Strong Sell"><strong>${s.recom.toFixed(2)}</strong> <span class="small">${recomLabel(s.recom)}</span></td>`
        : `<td class="muted">—</td>`, "Rekomendacja analityków wg Finviz (1 = Strong Buy, 5 = Strong Sell; mniej = lepiej)"],
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
    upside: ["Upside", "upside_main", s => {
        const u = upsideMain(s);
        return `<td class="${Number.isFinite(u) ? (u > 0 ? "positive" : "negative") : ""}" title="Cel ${money(targetMain(s))} (${Number.isFinite(s.finviz_upside_pct) ? "Finviz" : "Yahoo"})">${fmtPct(u, 0)}</td>`;
    }, "Różnica między średnią ceną celu analityków (Finviz; Yahoo, gdy brak) a ceną dziś"],
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
    cx: ["Climax", "climax_conf", s => s.climax_top === true ? `<td class="negative" title="Sell climax top (tygodniówka) ${escapeHtml(s.climax_date || "")}: +${s.climax_runup_pct}% w 3 tyg., tydzień +${s.climax_week_gain_pct}%, wolumen ×${s.climax_vol_ratio}">⚠ ${s.climax_conf ?? 0}/4</td>` : `<td class="muted"></td>`,
        "Sell climax top (O'Neil, świece tygodniowe): w ostatnich 2 tygodniach wzrost ≥ 25 % w 1–3 tyg. z największym zyskiem tygodniowym, najszerszym zakresem i najwyższym wolumenem od dołka trendu. Liczba = potwierdzenia z 4: luka wyczerpania, zamknięcie w dolnej połowie, ≥ 70 % nad 200-dniową, 3.+ baza. Heurystyka — sprawdź wykres"],
    cs: ["CANSLIM", "cs", s => s.cs === null || s.cs === undefined ? `<td class="muted"></td>` : `<td class="cs-cell ${s.cs >= 5 ? "positive" : ""}" title="Kliknij, aby zobaczyć wyjaśnienie każdej litery"><strong>${s.cs}/7</strong> ${canslimLettersHtml(s.canslim)}</td>`,
        "Lista CANSLIM: ile z 7 kryteriów C A N S L I M spełnia spółka (zielone litery = spełnione, czerwone = nie, szare = brak danych)"],
    brk: ["Wybicie", "brk_sort", s => {
        if (!s.brk) return `<td class="muted"></td>`;
        const cls = s.brk.rank === 0 ? "positive" : "";
        const head = s.brk.dist !== null ? `<strong>${s.brk.dist.toFixed(1)}%</strong>` : `<strong>▲</strong>`;
        return `<td class="${cls}" title="${escapeHtml(s.brk.reasons.map(r => r.text).join(" · "))}">${head} <span class="small">${escapeHtml(s.brk.reasons.map(r => r.text).join(" · "))}</span></td>`;
    }, "Ile % brakuje do wybicia (opór flagi / pivot bazy / moja linia z alertem) i powody; ▲ = świeże wybicie"],
    pos: ["Pozycja", "pos_pl_pct", s => s.position
        ? `<td class="${s.position.stop_hit ? "negative" : (s.position.pl_pct >= 0 ? "positive" : "negative")}" title="Moja pozycja: wejście ${money(s.position.entry)}, stop ${money(s.position.stop)}">💼 ${fmtPct(s.position.pl_pct)}${s.position.r !== null ? ` · ${s.position.r.toFixed(1)}R` : ""}</td>`
        : `<td class="muted"></td>`, "Moja pozycja: zysk od wejścia i wielokrotność ryzyka (R)"],
    posPl: ["Zysk", "pos_pl_pct", s => s.position
        ? `<td class="${s.position.pl_pct >= 0 ? "positive" : "negative"}"><strong>${fmtPct(s.position.pl_pct)}</strong>${s.position.pl_usd !== null ? ` <span class="small">${money0(s.position.pl_usd)}</span>` : ""}</td>` : `<td class="muted">—</td>`, "Zysk / strata od ceny wejścia (w % i w $)"],
    posR: ["R", "pos_r", s => s.position && s.position.r !== null ? `<td class="${s.position.r >= 0 ? "positive" : "negative"}"><strong>${s.position.r.toFixed(2)}R</strong></td>` : `<td class="muted">—</td>`, "Zysk w wielokrotnościach początkowego ryzyka (cena − wejście) / (wejście − stop)"],
    posToStop: ["Do stopu", "pos_to_stop_pct", s => s.position && s.position.to_stop_pct !== null
        ? `<td class="${s.position.stop_hit ? "negative" : ""}">${s.position.stop_hit ? "🛑 STOP" : fmtPct(s.position.to_stop_pct)}</td>` : `<td class="muted">—</td>`, "O ile % cena musi spaść do stopu"],
    posEntry: ["Wejście", "pos_entry", s => `<td>${s.position ? money(s.position.entry) : "—"}</td>`],
    posStop: ["Stop", "pos_stop", s => `<td>${s.position && s.position.stop !== null && s.position.stop !== undefined ? money(s.position.stop) : "—"}</td>`],
    posShares: ["Akcje", "pos_shares", s => `<td>${s.position && s.position.shares !== null ? s.position.shares : "—"}</td>`],
    posValue: ["Wartość", "pos_value", s => `<td>${s.position && s.position.value !== null ? money0(s.position.value) : "—"}</td>`],
    posRisk: ["Ryzyko do stopu", "pos_risk_usd", s => `<td>${s.position && s.position.risk_usd !== null ? money0(s.position.risk_usd) : "—"}</td>`, "Początkowe ryzyko: (wejście − stop) · liczba akcji"],
    strat: ["Strategie", "strat_rank", s => `<td>${(s.strat || []).map(c => `<span class="strat-chip strat-${c}" title="${STRATEGIES[c][1]}">${STRATEGIES[c][0]}</span>`).join(" ") || `<span class="muted">—</span>`}</td>`, "Z których strategii (zakładek) spółka przechodzi filtry: R = Ratingi, Q = Qullamaggie, U = Upside, B = Bazy, W = blisko wybicia"],
    toggle: ["", null, s => `<td class="card-toggle"><button type="button" class="card-chev" aria-label="Pokaż / ukryj szczegóły" aria-expanded="${openCards.has(s.ticker)}">▾</button></td>`],
    fchart: ["", null, s => `<td class="card-fchart" data-fchart="${escapeHtml(s.ticker)}"></td>`],
    earnings: ["Wyniki", "earnings", s => earningsCell(s)],
    tv: ["TV", null, s => `<td><a class="tv-row-btn" href="${tvUrlFor(s.ticker)}" target="_blank" rel="noopener">TV</a></td>`],
};
const LEAD = ["rank", "fav", "ticker", "score", "company", "sector"];
// Wszystkie zakładki pokazują TE SAME kolumny (zakładka = strategia = inny filtr i inne domyślne sortowanie); kolumna "Strategie" mówi, z których strategii spółka przechodzi.
const ALL_COLUMNS = [...LEAD, "cs", "cx", "brk", "pos", "strat", "toggle", "fchart", "cap", "price", "sma50", "sma200", "high52", "epsThis", "epsNext", "eps5", "epsNext5", "epsq", "epsStab", "rs", "epsr", "comp", "leader", "grp", "ad", "inst", "rsLine", "r3", "r6", "r12",
    "dollarVol", "adr", "ratio", "recom", "upside", "ptMean", "ptLow", "ptHigh", "analysts", "rev30", "rev90", "baseType", "depth", "baseWeeks", "pivot", "toPivot", "base", "trend", "earnings", "tv"];
const POS_COLUMNS = ["posPl", "posR", "posToStop", "posEntry", "posStop", "posShares", "posValue", "posRisk"];
const ALERT_COLUMNS = ["alKind", "alDir", "alValue", "alDist", "alStatus", "alAct"];
const TAB_COLUMNS = {
    LIST: ALL_COLUMNS, CS: ALL_COLUMNS, FAV: ALL_COLUMNS, POS: [...LEAD, ...POS_COLUMNS, ...ALL_COLUMNS.filter(id => !LEAD.includes(id) && id !== "pos")], QM: ALL_COLUMNS, BASES: ALL_COLUMNS,
    ALERTS: [...LEAD, ...ALERT_COLUMNS, ...ALL_COLUMNS.filter(id => !LEAD.includes(id))],
};

// Widok dzielony (jak w TC2000: wąska lista po lewej, wykres po prawej) — w wąskiej liście tylko kluczowe kolumny.
const SPLIT_MIN_WIDTH = 1000, SPLIT_MIN_HEIGHT = 560;
const COMPACT_COLUMNS = ["fav", "ticker", "score", "comp", "brk", "strat"];
const TAB_COLUMNS_COMPACT = {
    LIST: COMPACT_COLUMNS, CS: ["fav", "ticker", "score", "cs", "comp", "strat"], FAV: COMPACT_COLUMNS, POS: ["fav", "ticker", "posPl", "posR", "posToStop", "strat"], QM: COMPACT_COLUMNS, BASES: COMPACT_COLUMNS,
    ALERTS: ["ticker", "alDist", "alStatus", "alAct", "brk", "strat"],
};
let splitMode = false;
const columnsFor = tab => (splitMode ? TAB_COLUMNS_COMPACT[tab] : TAB_COLUMNS[tab]);

const openCards = new Set();   // rozwinięte kafelki (telefon), przeżywają przerysowanie listy

// Telefon: nagłówków tabeli nie ma (kafelki), więc sortowanie daje lista rozwijana + przycisk kierunku.
function updateCardSort(tab) {
    const sel = document.getElementById("cardSortKey"), dir = document.getElementById("cardSortDir");
    if (!sel || !dir) return;
    const opts = columnsFor(tab).map(id => COL[id]).filter(c => c[1]);
    const seen = new Set();
    const uniq = opts.filter(c => (seen.has(c[1]) ? false : (seen.add(c[1]), true)));
    sel.innerHTML = uniq.map(c => `<option value="${c[1]}">${escapeHtml(c[0])}</option>`).join("");
    sel.value = state.sortKey;
    dir.textContent = state.sortDir === "asc" ? "▲" : "▼";
}

function renderHeaders() {
    Object.keys(TAB_COLUMNS).forEach(tab => {
        const head = columnsFor(tab).map(id => {
            const [label, key, , title] = COL[id];
            return `<th${key ? ` data-key="${key}"` : ""}${title ? ` title="${title}"` : ""}${id === "tv" ? ` class="tv-col"` : ""}>${label}</th>`;
        }).join("");
        document.querySelector(`#table-${tab} thead`).innerHTML = `<tr>${head}</tr>`;
    });
}

// Każda komórka dostaje klasę c-<kolumna> i data-label (etykieta) — na telefonie tabela jest kafelkami (CSS: body:not(.split)),
// a te atrybuty mówią, co pokazać w nagłówku kafelka i jak podpisać pole po rozwinięciu.
function decorateCell(html, id, label) {
    return html.replace(/^<td(?:\s+class="([^"]*)")?/, (m, cls) => `<td data-label="${escapeHtml(label)}" class="c-${id}${cls ? " " + cls : ""}"`);
}

function renderRow(tab, s, i) {
    const cells = columnsFor(tab).map(id => decorateCell(COL[id][2](s, i), id, COL[id][0])).join("");
    return cells;
}

function rowsForTab(tab) {
    state.data.stocks.forEach(s => {
        s.score = Object.prototype.hasOwnProperty.call(state.scores, s.ticker) ? state.scores[s.ticker] : null;
        s.upside_main = upsideMain(s);
        s.target_main = targetMain(s);
    });
    const stocks = applyCommonFilters(state.data.stocks, state.search, state.sector, state.scoreMin, state.scoreMax);
    const alerts = alertRows(annStore, state.data.stocks);
    tagStrategies(state.data.stocks, stocks, state, alerts);
    tagPositions(state.data.stocks, state.pos);
    tagCanslim(state.data.stocks, marketRegime());
    if (tab === "CS") return canslimRows(stocks, state.csMin);
    if (tab === "POS") return positionRows(stocks);
    if (tab === "QM") return qullamaggieRows(stocks, state.qm);
    if (tab === "BASES") return baseRows(stocks, state.bases);
    if (tab === "FAV") return stocks.filter(s => state.favs.has(s.ticker));
    if (tab === "ALERTS") {
        return alertRows(annStore, stocks).map(r => ({
            ...r, alert_rank: r.alert.rank, alert_kind: r.alert.kind, alert_dir: r.alert.alert, alert_value: r.alert.value, alert_dist: r.alert.dist, alert_group: r.strat_rank * 10 + r.alert.rank,
        }));
    }
    return stocks;
}

const marketRegime = () => (state.data && state.data.market && state.data.market.regime) || null;
const EMPTY_MESSAGES = {
    CS: "Żadna spółka nie spełnia tylu kryteriów CANSLIM — obniż próg w Filtrach (🏆 CANSLIM). Przy korekcie rynku (M) maksimum to 6/7.",
    LIST: "Brak spółek (lista Finviz jest pusta albo filtr tekstu/sektora nic nie zostawia).",
    QM: "Żadna spółka nie spełnia progów — obniż obrót lub ADR% albo zwiększ top %.",
    BASES: "Brak spółek w bazie w zadanej odległości od pivotu — zwiększ dystans albo odznacz „tylko VCP”.",
    POS: "Brak pozycji — otwórz wykres spółki i kliknij „💼 Pozycja” (wejście, stop, kalkulator wielkości pozycji).",
    ALERTS: "Brak alertów — w oknie wykresu kliknij ✎ Edytuj, narysuj linię (Linia) i ustaw przy niej Alert.",
    FAV: "Brak ulubionych — kliknij ☆ przy spółce na dowolnej liście.",
};

// Zakładka Filtry: podsumowanie, ile spółek zostaje po filtrach wspólnych (szukaj / sektor / score) i po progach każdej zakładki.
function renderFiltersSummary() {
    const el = document.getElementById("filtersSummary");
    if (!el) return;
    const base = applyCommonFilters(state.data.stocks, state.search, state.sector, state.scoreMin, state.scoreMax);
    const counts = [["Lista", base.length],
        ["Qullamaggie", qullamaggieRows(base, state.qm).length], ["Bazy", baseRows(base, state.bases).length], ["CANSLIM", canslimRows(base, state.csMin).length]];
    el.innerHTML = counts.map(([name, n]) => `<span class="filter-count"><b>${n}</b> ${name}</span>`).join("");
    document.getElementById("drawerMeta").textContent = `${base.length} z ${state.data.stocks.length} spółek po filtrach wspólnych`;
}

function renderTable() {
    if (!state.data) return;
    const tab = state.tab;
    if (tab === FILTERS_TAB) {
        state.data.stocks.forEach(s => { s.score = Object.prototype.hasOwnProperty.call(state.scores, s.ticker) ? state.scores[s.ticker] : null; s.upside_main = upsideMain(s); });
        tagBreakouts(state.data.stocks, alertRows(annStore, state.data.stocks), state.brk.maxDistPct);
        tagCanslim(state.data.stocks, marketRegime());
        renderFiltersSummary();
        return;
    }
    const table = document.getElementById(`table-${tab}`);
    const tbody = table.querySelector("tbody");
    const rows = sortRows(rowsForTab(tab), state.sortKey, state.sortDir);
    const cols = table.querySelectorAll("thead th").length;
    tbody.innerHTML = rows.length
        ? rows.map((s, i) => `<tr data-ticker="${escapeHtml(s.ticker)}"${!splitMode && openCards.has(s.ticker) ? ` class="open"` : ""}>${renderRow(tab, s, i + 1)}</tr>`).join("")
        : `<tr><td colspan="${cols}" class="empty-state">${EMPTY_MESSAGES[tab]}</td></tr>`;
    updateAlertBadge();
    const meta = document.getElementById("drawerMeta");
    const total = state.data.stocks.length;
    meta.textContent = tab === "QM"
        ? `${rows.length} unikalnych spółek (top ${state.qm.topPct}% z okien 1/3/6M) z ${total}`
        : tab === "POS" ? positionSummary(rows) : `${rows.length} z ${total} spółek`;
    if (tab === "POS") renderPositionControls(rows);
    updateSortHeaders(table);
    updateCardSort(tab);
    markSelectedRow();
    fillFundCharts();
    if (chartRequested) updateChartNav(chartRequested);   // pasek ◀ n / N odświeża się po zmianie zakładki, filtra, sortowania
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

// Pasek ◀ 3/27 ▶ pod wykresem: pozycja w bieżącej liście i przejście do sąsiedniej spółki (przycisk albo przeciągnięcie po tytule).
function updateChartNav(ticker) {
    const list = visibleTickers();
    const i = list.indexOf(ticker);
    const pos = document.getElementById("chartNavPos");
    if (pos) pos.textContent = i >= 0 ? `${i + 1} / ${list.length}` : "";
    const prev = document.getElementById("chartPrev"), next = document.getElementById("chartNext");
    if (prev) prev.disabled = i <= 0;
    if (next) next.disabled = i < 0 || i >= list.length - 1;
}

// Kierunek przeciągnięcia palcem: "left" / "right" gdy ruch jest głównie poziomy, dość długi i szybki; inaczej null.
function swipeDirection(dx, dy, ms) {
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.8 || ms > SWIPE_MAX_MS) return null;
    return dx < 0 ? "left" : "right";
}

function attachSwipe(el, onLeft, onRight) {
    let start = null;
    el.addEventListener("touchstart", e => {
        const t = e.touches[0];
        start = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
    }, { passive: true });
    el.addEventListener("touchend", e => {
        if (!start) return;
        const t = e.changedTouches[0];
        const dir = swipeDirection(t.clientX - start.x, t.clientY - start.y, Date.now() - start.t);
        start = null;
        if (dir === "left") onLeft(); else if (dir === "right") onRight();
    }, { passive: true });
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
    if (document.getElementById("chartTfBtn")) updateTfButton();
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
    const navBadge = document.getElementById("alertBadgeNav");
    if (navBadge) navBadge.textContent = n ? String(n) : "";
}

function updateSortHeaders(table) {
    table.querySelectorAll("thead th").forEach(th => {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.dataset.key === state.sortKey) th.classList.add(state.sortDir === "asc" ? "sort-asc" : "sort-desc");
    });
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ tab: state.tab, csMin: state.csMin, qm: state.qm, bases: state.bases, brk: state.brk }));
    } catch (e) { /* brak localStorage — ignorujemy */ }
}

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
        if (!saved) return;
        if (TAB_TITLES[saved.tab] || saved.tab === FILTERS_TAB) state.tab = saved.tab;
        if (Number.isFinite(saved.csMin)) state.csMin = saved.csMin;
        if (saved.qm) ["minDollarVolumeM", "minAdrPct", "topPct"].forEach(k => {
            if (Number.isFinite(saved.qm[k])) state.qm[k] = saved.qm[k];
        });
        if (saved.bases) {
            if (Number.isFinite(saved.bases.maxDistPct)) state.bases.maxDistPct = saved.bases.maxDistPct;
            state.bases.vcpOnly = saved.bases.vcpOnly === true;
        }
        if (saved.brk && Number.isFinite(saved.brk.maxDistPct)) state.brk.maxDistPct = saved.brk.maxDistPct;
    } catch (e) { /* uszkodzony zapis — zostają domyślne */ }
}

// ---------- własne ustawienia: ulubione ★ i score (synchronizowane z adnotacjami przez Gist) ----------
// prefsStore = { scores: {T: {v: liczba|null, t: ISO}}, favs: {T: {v: true|false, t: ISO}} } — każda wartość ma czas zmiany,
// a usunięcie to wpis z v = null/false (nagrobek), dzięki czemu scalenie z drugim urządzeniem (mergePrefs) wybiera nowszą zmianę.
let prefsStore = { scores: {}, favs: {}, pos: {}, acct: {} };
const PREFS_KEY = "momentum_watchlist_prefs";
const PREFS_EPOCH = "1970-01-01T00:00:00.000Z";   // dane sprzed synchronizacji: przegrywają z każdą świadomą zmianą

const PREFS_KINDS = ["scores", "favs", "pos", "acct"];
const PREFS_FIELDS = { pos: ["entry", "stop", "shares", "target"], acct: ["capital", "riskPct"] };
// Wartość wpisu: score = liczba|null, fav = bool, pos (wejście / stop / akcje / cel) i acct (kapitał, ryzyko %) = obiekt liczb albo null.
function prefsValue(kind, v) {
    if (kind === "scores") return Number.isFinite(v) ? v : null;
    if (kind === "favs") return v === true;
    if (!v || typeof v !== "object") return null;
    const o = {};
    PREFS_FIELDS[kind].forEach(k => { o[k] = Number.isFinite(v[k]) && v[k] >= 0 ? v[k] : null; });
    return o[PREFS_FIELDS[kind][0]] !== null ? o : null;
}

function prefsNormalize(p) {
    const out = {};
    PREFS_KINDS.forEach(kind => {
        out[kind] = {};
        const src = (p && p[kind]) || {};
        Object.keys(src).sort().forEach(t => {
            const e = src[t];
            if (e && typeof e === "object" && typeof e.t === "string") out[kind][t] = { v: prefsValue(kind, e.v), t: e.t };
        });
    });
    return out;
}

// Scalanie po spółce: wygrywa wpis z późniejszym czasem zmiany (przy remisie — bez zmian, wartość z a).
function mergePrefs(a, b) {
    const A = prefsNormalize(a), B = prefsNormalize(b), out = {};
    PREFS_KINDS.forEach(kind => {
        out[kind] = {};
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
    state.pos = {};
    Object.keys(prefsStore.pos).forEach(t => { if (prefsStore.pos[t].v) state.pos[t] = prefsStore.pos[t].v; });
    state.acct = prefsStore.acct.main && prefsStore.acct.main.v ? { ...prefsStore.acct.main.v } : { capital: null, riskPct: null };
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

// ---------- pozycje: arkusz „Pozycja” (wejście, stop, akcje, cel + kalkulator wielkości) ----------
function positionSummary(rows) {
    const t = positionTotals(rows, state.acct.capital);
    if (!t.n) return "brak pozycji";
    return `${t.n} poz. · wartość ${money0(t.value)} · ryzyko do stopów ${money0(t.risk)}${t.risk_pct !== null ? ` (${t.risk_pct.toFixed(1)}% kapitału)` : ""} · wynik ${money0(t.pl)}`;
}

function renderPositionControls() {
    const cap = document.getElementById("acctCapital"), risk = document.getElementById("acctRisk");
    if (cap && document.activeElement !== cap) cap.value = Number.isFinite(state.acct.capital) ? state.acct.capital : "";
    if (risk && document.activeElement !== risk) risk.value = Number.isFinite(state.acct.riskPct) ? state.acct.riskPct : "";
}

function saveAcct(capital, riskPct) {
    prefsStore.acct.main = { v: Number.isFinite(capital) && capital > 0 ? { capital, riskPct: Number.isFinite(riskPct) && riskPct > 0 ? riskPct : null } : null, t: new Date().toISOString() };
    prefsWriteLocal(); prefsApply(); annOnSave();
}

function savePosition(ticker, pos) {
    const stock = state.data.stocks.find(s => s.ticker === ticker);
    prefsStore.pos[ticker] = { v: pos, t: new Date().toISOString() };
    prefsWriteLocal(); prefsApply();
    if (stock) annSyncPositionLines(annStore, ticker, pos, stock.as_of);
    annSave();   // także synchronizacja (prefs + linie stopu / celu)
    renderTable();
    if (currentChart && currentChart.ticker === ticker) { chartWindows = []; drawChart(); }
    updatePosButton();
}

function updatePosButton() {
    const b = document.getElementById("chartPosBtn");
    if (b) b.textContent = chartRequested && state.pos[chartRequested] ? "💼 Pozycja ✓" : "💼 Pozycja";
}

function openPositionSheet(ticker) {
    const stock = state.data.stocks.find(s => s.ticker === ticker);
    if (!stock) return;
    const cur = state.pos[ticker] || {};
    const stop = Number.isFinite(annPositionLineValue(annStore, ticker, "stop")) ? annPositionLineValue(annStore, ticker, "stop") : cur.stop;
    const target = Number.isFinite(annPositionLineValue(annStore, ticker, "target")) ? annPositionLineValue(annStore, ticker, "target") : cur.target;
    const v = x => (Number.isFinite(x) ? x : "");
    const html = `
        <div class="sheet-grid">
            <label>Wejście ($)<input type="number" inputmode="decimal" step="any" id="posEntryIn" value="${v(cur.entry !== undefined ? cur.entry : stock.price)}"></label>
            <label>Stop ($)<input type="number" inputmode="decimal" step="any" id="posStopIn" value="${v(stop)}"></label>
            <label>Liczba akcji<input type="number" inputmode="numeric" step="1" id="posSharesIn" value="${v(cur.shares)}"></label>
            <label>Cel ($)<input type="number" inputmode="decimal" step="any" id="posTargetIn" value="${v(target)}"></label>
        </div>
        <div class="sheet-quick">Stop: <button type="button" class="chip-btn" data-stop="5">−5%</button><button type="button" class="chip-btn" data-stop="7">−7%</button><button type="button" class="chip-btn" data-stop="8">−8%</button>
            · Cel: <button type="button" class="chip-btn" data-rr="2">2R</button><button type="button" class="chip-btn" data-rr="3">3R</button></div>
        <div class="sheet-section"><h4>Kalkulator wielkości pozycji</h4>
            <div class="sheet-grid">
                <label>Kapitał ($)<input type="number" inputmode="decimal" step="any" id="posCapital" value="${v(state.acct.capital)}"></label>
                <label>Ryzyko na pozycję (%)<input type="number" inputmode="decimal" step="any" id="posRiskPct" value="${v(state.acct.riskPct)}" placeholder="np. 0.5"></label>
            </div>
            <p class="sheet-result" id="posCalc"></p>
        </div>
        <div class="sheet-actions">
            ${state.pos[ticker] ? `<button type="button" class="btn danger" id="posDelete">Usuń pozycję</button>` : ""}
            <button type="button" class="btn primary" id="posSave">Zapisz</button>
        </div>`;
    const body = showSheet(`💼 ${ticker} — pozycja`, html);
    const $ = id => body.querySelector("#" + id);
    const num = id => { const x = parseFloat($(id).value); return Number.isFinite(x) ? x : null; };
    const calc = () => {
        const entry = num("posEntryIn"), stopV = num("posStopIn"), tgt = num("posTargetIn");
        const size = positionSize(num("posCapital"), num("posRiskPct"), entry, stopV);
        const parts = [];
        if (entry && stopV && stopV < entry) {
            parts.push(`Ryzyko na akcję: ${money(entry - stopV)} (${((entry - stopV) / entry * 100).toFixed(1)}% od wejścia)`);
            if (tgt && tgt > entry) parts.push(`R:R do celu: ${((tgt - entry) / (entry - stopV)).toFixed(1)} : 1`);
        } else if (entry && stopV) parts.push("Stop musi być poniżej wejścia.");
        if (size) parts.push(`Sugerowane: <b>${size.shares} akcji</b> (ryzyko ${money0(size.risk_usd)}, wartość ${money0(size.value)} = ${size.pct_of_capital.toFixed(0)}% kapitału) <button type="button" class="chip-btn" id="posUse">Użyj</button>`);
        else if (!num("posCapital") || !num("posRiskPct")) parts.push("Wpisz kapitał i ryzyko %, a podpowiem liczbę akcji.");
        $("posCalc").innerHTML = parts.join("<br>");
        const use = $("posUse");
        if (use) use.addEventListener("click", () => { $("posSharesIn").value = size.shares; calc(); });
    };
    body.addEventListener("input", calc);
    body.addEventListener("click", ev => {
        const t = ev.target.closest("button[data-stop],button[data-rr]");
        if (!t) return;
        const entry = num("posEntryIn");
        if (!entry) return;
        if (t.dataset.stop) $("posStopIn").value = (entry * (1 - Number(t.dataset.stop) / 100)).toFixed(2);
        else if (num("posStopIn") && num("posStopIn") < entry) $("posTargetIn").value = (entry + Number(t.dataset.rr) * (entry - num("posStopIn"))).toFixed(2);
        calc();
    });
    $("posSave").addEventListener("click", () => {
        const entry = num("posEntryIn"), stopV = num("posStopIn"), tgt = num("posTargetIn");
        if (!entry || entry <= 0) { showToast("Podaj cenę wejścia.", { type: "error" }); return; }
        if (stopV !== null && stopV >= entry) { showToast("Stop musi być poniżej ceny wejścia.", { type: "error" }); return; }
        if (tgt !== null && tgt <= entry) { showToast("Cel musi być powyżej ceny wejścia.", { type: "error" }); return; }
        saveAcct(num("posCapital"), num("posRiskPct"));
        savePosition(ticker, { entry, stop: stopV, shares: num("posSharesIn"), target: tgt });
        closeSheet();
        showToast(`Zapisano pozycję ${ticker}.`);
    });
    const del = $("posDelete");
    if (del) del.addEventListener("click", () => { savePosition(ticker, null); closeSheet(); showToast(`Usunięto pozycję ${ticker}.`); });
    calc();
}

function toggleFav(ticker) {
    prefsStore.favs[ticker] = { v: !state.favs.has(ticker), t: new Date().toISOString() };
    prefsWriteLocal(); prefsApply(); annOnSave();
    renderTable();
}

function showTab(tab, resetSort = true) {
    const layoutBefore = effectiveLayout();
    state.tab = tab;
    if (resetSort && TAB_DEFAULT_SORT[tab]) [state.sortKey, state.sortDir] = TAB_DEFAULT_SORT[tab];
    document.querySelectorAll(".drawer-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll("#bottomNav [data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    const navMore = document.getElementById("navMore");
    if (navMore) navMore.classList.toggle("active", !BOTTOM_NAV_TABS.includes(tab));
    const activeTab = document.querySelector(".drawer-tab.active");
    if (activeTab && activeTab.scrollIntoView) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
    Object.keys(TAB_TITLES).forEach(t => {
        document.getElementById(`table-${t}`).hidden = t !== tab;
        document.getElementById(`guide-${t}`).hidden = t !== tab;
        const controls = document.getElementById(`controls-${t}`);
        if (controls) controls.hidden = t !== tab;
    });
    const onFilters = tab === FILTERS_TAB;
    document.getElementById("filtersPanel").hidden = !onFilters;
    document.getElementById("cardSortBar").hidden = onFilters;
    document.getElementById("drawerTitle").textContent = onFilters ? "Filtry" : TAB_TITLES[tab];
    saveSettings();
    renderTable();
    // zakładki Alerty i Bazy mają własny układ (dzienny + TradingView) — przerysuj wykres po zmianie zakładki
    if (document.getElementById("chartLayoutBtn")) updateLayoutButton();
    if (currentChart && effectiveLayout() !== layoutBefore) { chartWindows = []; chartActiveCell = 0; drawChart(); }
}

// M z CANSLIM: stan rynku (S&P 500 i Nasdaq) policzony w watchlist.py::market_state — pasek nad listą.
const MARKET_LABELS = { uptrend: ["✅", "Rynek: uptrend (EMA10 > EMA20 tyg.)", "market-up"], correction: ["🛑", "Rynek: korekta (EMA10 < EMA20 tyg.)", "market-down"] };

function marketLines(market) {
    const sign = v => (Number.isFinite(v) ? (v > 0 ? "+" : "") + v + "%" : "—");
    return [["sp500", "S&P 500"], ["nasdaq", "Nasdaq"]].filter(([k]) => market && market[k]).map(([k, name]) => {
        const m = market[k];
        const ema = Number.isFinite(m.ema_gap_pct) ? `EMA10/EMA20 tyg. ${sign(m.ema_gap_pct)}, ` : "";
        return `${name}: ${ema}${sign(m.pct_vs_sma50)} vs SMA50, ${sign(m.pct_vs_sma200)} vs SMA200, ${m.dist_days} dni dystrybucji (25 sesji), ${sign(m.pct_from_high)} od szczytu`;
    });
}

function renderMarket() {
    const el = document.getElementById("marketBanner");
    if (!el) return;
    const market = state.data && state.data.market;
    if (!market || !MARKET_LABELS[market.regime]) { el.hidden = true; return; }
    const [icon, label, cls] = MARKET_LABELS[market.regime];
    el.hidden = false;
    el.className = `market-banner ${cls}`;
    el.querySelector("summary").textContent = `${icon} ${label}`;
    el.querySelector(".market-lines").innerHTML = marketLines(market).map(escapeHtml).join("<br>")
        + "<br><span class=\"muted small\">Reżim: uptrend = EMA10 tygodniowa &gt; EMA20 tygodniowa indeksu, korekta w przeciwnym razie; wynik = surowszy z dwóch indeksów. SMA i dni dystrybucji tylko informacyjnie.</span>";
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
    document.getElementById("qmMinDollarVolume").value = state.qm.minDollarVolumeM;
    document.getElementById("qmMinAdr").value = state.qm.minAdrPct;
    document.getElementById("qmTopPct").value = state.qm.topPct;
    bind("qmMinDollarVolume", v => { state.qm.minDollarVolumeM = v; });
    bind("qmMinAdr", v => { state.qm.minAdrPct = v; });
    bind("qmTopPct", v => { state.qm.topPct = v; });
    const acctInputs = () => saveAcct(parseFloat(document.getElementById("acctCapital").value), parseFloat(document.getElementById("acctRisk").value));
    ["acctCapital", "acctRisk"].forEach(id => document.getElementById(id).addEventListener("change", () => { acctInputs(); renderTable(); }));
    renderPositionControls();
    document.getElementById("brkMaxDist").value = state.brk.maxDistPct;
    bind("brkMaxDist", v => { state.brk.maxDistPct = v; });
    document.getElementById("csMin").value = state.csMin;
    bind("csMin", v => { state.csMin = v; });
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
    const cardSortKey = document.getElementById("cardSortKey"), cardSortDir = document.getElementById("cardSortDir");
    if (cardSortKey && cardSortDir) {
        cardSortKey.addEventListener("change", () => { state.sortKey = cardSortKey.value; state.sortDir = "desc"; renderTable(); });
        cardSortDir.addEventListener("click", () => { state.sortDir = state.sortDir === "asc" ? "desc" : "asc"; renderTable(); });
    }
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
        const csCell = ev.target.closest("td.cs-cell");
        if (csCell) { openCanslimSheet(csCell.closest("tr[data-ticker]").dataset.ticker); return; }
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
        if (!tr) return;
        if (splitMode) { openChart(tr.dataset.ticker); return; }
        // telefon: stuknięcie kafelka (nagłówek, miniwykres, pola) od razu otwiera wykres; szczegóły rozwija osobny przycisk ▾
        const t = tr.dataset.ticker;
        const chev = ev.target.closest(".card-chev");
        if (!chev) { openChart(t); return; }
        if (openCards.has(t)) openCards.delete(t); else openCards.add(t);
        tr.classList.toggle("open", openCards.has(t));
        chev.setAttribute("aria-expanded", String(openCards.has(t)));
        fillFundCharts();
        }));
    document.getElementById("chartRatings").addEventListener("click", ev => {
        const chip = ev.target.closest("[data-action=canslim]");
        if (chip) openCanslimSheet(chip.dataset.ticker);
    });
    initChartModal();
    initBottomNav();
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

// Mini wykres fundamentów (cena / EPS / RS) w rozwiniętych kafelkach — dane z charts.json, ładowane leniwie przy pierwszym rozwinięciu.
async function fillFundCharts() {
    if (splitMode || !openCards.size) return;
    const cells = [...document.querySelectorAll("tr.open td.card-fchart")].filter(td => !td.dataset.done);
    if (!cells.length) return;
    const charts = await loadCharts();
    if (!charts) return;
    cells.forEach(td => { td.innerHTML = fundMiniHtml(fundMiniModel(charts, td.dataset.fchart)); td.dataset.done = "1"; });
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
    document.getElementById("chartRatings").innerHTML = stock ? ratingChipsHtml(stock) : "";
    document.getElementById("chartBase").innerHTML = stock ? baseBoxHtml(stock) : "";
    document.getElementById("chartReady").textContent = stock ? readinessLine(stock, state.data.market && state.data.market.regime) : "";
    updateChartNav(ticker);
    updatePosButton();
    const scoreBox = document.getElementById("chartScore");
    if (scoreBox) scoreBox.value = Number.isFinite(state.scores[ticker]) ? state.scores[ticker] : "";
    document.getElementById("chartFv").href = `https://finviz.com/stock?t=${encodeURIComponent(ticker)}&ty=fc&p=d&b=1`;
    document.getElementById("chartZx").href = `https://www.zacks.com/stock/quote/${encodeURIComponent(ticker)}`;
    const body = document.getElementById("chartBody");
    chartRequested = ticker;
    chartActiveCell = 0;
    const token = ++chartToken;
    markSelectedRow(true);
    chartCompact = window.innerWidth <= COMPACT_MAX_WIDTH;
    chartWindows = [];
    Object.assign(annEdit, { on: false, mode: null, tool: null, selected: null, pending: [], cursor: null });   // nowy wykres: poza trybem edycji
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
            fit: layout === "1" ? (splitMode ? null : phoneFit(cell)) : cellFit(cell),
            window: chartWindows[i], windowLen: c.daily ? chartWinLen.d : chartWinLen.w,
            onWindow: w => { chartWindows[i] = w; rememberWindowLength(w.n, c.daily); },
            gestures: layout === "1" && !splitMode ? (() => !annEdit.on) : null,   // telefon: szczypnięcie = zoom osi czasu, przeciągnięcie = przesuwanie okna (poza trybem rysowania)
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
            Object.assign(annEdit, { tool: annEdit.mode, selected: null, pending: [], cursor: null });
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

// Telefon: okno wykresu to kolumna na cały ekran (nagłówek, paski informacji, odczyt, suwak, wykres, pasek nawigacji), a wykres
// zajmuje CAŁĄ resztę — układ liczymy w pikselach faktycznie dostępnego miejsca (viewBox = rozmiar na ekranie, bez skalowania 560×800
// do szerokości ekranu), więc nic nie jest miniaturą ani nie ma pustych pasów. Przeliczane po obrocie / zmianie rozmiaru.
const PHONE_SLIDER_PX = 30;   // suwak okna czasowego (linia + 2 kulki, 26 px) + odstępy nad wykresem
let lastPhoneFit = null;
const phoneSliderPx = () => PHONE_SLIDER_PX;
function phoneFit(cell) {
    const r = cell.querySelector(".cell-body").getBoundingClientRect();
    lastPhoneFit = { w: Math.max(260, Math.round(r.width)), h: Math.max(120, Math.round(r.height - phoneSliderPx())) };
    return lastPhoneFit;
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
    Object.assign(annEdit, { on: false, mode: null, tool: null, selected: null, pending: [], cursor: null });
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
    const label = chartDaily ? "dzienny" : "tygodniowy";
    document.getElementById("chartTfBtn").textContent = splitMode ? `Wykres: ${label}` : label[0].toUpperCase() + label.slice(1);   // telefon: krótko, żeby główne przyciski mieściły się w jednym rzędzie
}

// Dolna nawigacja telefonu (kciuk dosięga): 4 główne widoki + „Więcej” (arkusz z resztą zakładek i odświeżaniem danych).
function initBottomNav() {
    const nav = document.getElementById("bottomNav");
    if (!nav) return;
    nav.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
    document.getElementById("navMore").addEventListener("click", () => {
        const items = [["FILTERS", "🔍", "Filtry"], ["CS", "🏆", "CANSLIM"], ["QM", "🎯", "Qullamaggie"], ["BASES", "🧱", "Bazy"], ["FAV", "⭐", "Ulubione"]];
        const body = showSheet("Więcej", `<div class="sheet-menu">${items.map(([t, i, l]) => `<button type="button" data-tab="${t}"><span>${i}</span>${l}</button>`).join("")}
            <a href="ep.html"><span>⚡</span>Episodic Pivot (EP)</a>
            <a href="${document.getElementById("refreshLink").href}" target="_blank" rel="noopener"><span>🔄</span>Odśwież dane (GitHub Actions)</a></div>`);
        body.querySelectorAll("button[data-tab]").forEach(b => b.addEventListener("click", () => { closeSheet(); showTab(b.dataset.tab); }));
    });
}

// Telefon: opis spółki, fundamenty i objaśnienie wzorca są pod „⋯” (nad wykresem zostają pastylki ocen, ramka formacji i linia gotowości).
function chartDetailsHtml() {
    const text = id => (document.getElementById(id) ? document.getElementById(id).textContent.trim() : "");
    const blocks = [["Gotowość", text("chartReady")], ["Spółka", text("chartSub")], ["Fundamenty", text("chartStats")], ["Formacja", text("chartPattern")]].filter(b => b[1]);
    const chips = currentChart ? state.data.stocks.find(x => x.ticker === currentChart.ticker) : null;
    if (chips) blocks.unshift(["Oceny", ratingChips(chips).map(c => `${c.label ? c.label + " " : ""}${c.value}`).join(" · ")]);
    return blocks.length ? `<div class="sheet-section">${blocks.map(([h, t]) => `<h4>${h}</h4><p class="sheet-result">${escapeHtml(t)}</p>`).join("")}</div>` : "";
}

// Telefon: drugorzędne przyciski nagłówka wykresu (skala, estymaty, legenda, pełny ekran, linki, score) są pod „⋯” — arkuszem od dołu.
function openChartMore() {
    const btns = ["chartFullBtn", "chartEstBtn", "chartLegendBtn", "chartLogBtn"].map(id => document.getElementById(id)).filter(Boolean);
    const body = showSheet("Opcje wykresu", `<div class="sheet-menu">
        ${btns.map(b => `<button type="button" data-click="${b.id}">${escapeHtml(b.textContent)}</button>`).join("")}
        <a href="${document.getElementById("chartFv").href}" target="_blank" rel="noopener">📊 Finviz ↗</a>
        <a href="${document.getElementById("chartZx").href}" target="_blank" rel="noopener">🎯 Zacks ↗</a></div>
        ${chartDetailsHtml()}
        <div class="sheet-section"><div class="sheet-grid"><label>Mój score<input type="number" inputmode="decimal" step="any" id="moreScore" value="${chartRequested && Number.isFinite(state.scores[chartRequested]) ? state.scores[chartRequested] : ""}"></label></div></div>`);
    body.querySelectorAll("button[data-click]").forEach(b => b.addEventListener("click", () => { closeSheet(); document.getElementById(b.dataset.click).click(); }));
    body.querySelector("#moreScore").addEventListener("change", ev => { if (chartRequested) setScore(chartRequested, ev.target.value); });
}

function initChartModal() {
    document.getElementById("chartMoreBtn").addEventListener("click", openChartMore);
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
    document.getElementById("chartPosBtn").addEventListener("click", () => { if (chartRequested) openPositionSheet(chartRequested); });
    document.getElementById("chartPrev").addEventListener("click", () => stepChart(-1));
    document.getElementById("chartNext").addEventListener("click", () => stepChart(1));
    // przeciągnięcie po tytule / pasku nawigacji: w lewo = następna spółka, w prawo = poprzednia (wykres ma własne gesty, więc nie na nim)
    ["chartNav", "chartReady"].forEach(id => attachSwipe(document.getElementById(id), () => stepChart(1), () => stepChart(-1)));
    attachSwipe(document.querySelector(".wl-chart-titles"), () => stepChart(1), () => stepChart(-1));
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
        resizeTimer = setTimeout(() => {
            if (!currentChart) return;
            if (splitMode) { if (effectiveLayout() !== "1") drawChart(); return; }   // siatka: nowy rozmiar komórek
            // telefon: przerysuj tylko przy realnej zmianie miejsca na wykres (obrót, klawiatura), nie przy chowaniu paska adresu o kilka px
            const cell = document.querySelector("#chartBody .chart-cell");
            const now = cell ? cell.querySelector(".cell-body").getBoundingClientRect() : null;
            if (!lastPhoneFit || !now || Math.abs(now.width - lastPhoneFit.w) > 6 || Math.abs(now.height - phoneSliderPx() - lastPhoneFit.h) > 24) drawChart();
        }, 150);
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
        renderMarket();
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
        renderMarket();
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
        ratingChips, canslimInfo, canslimExplain, canslimSheetHtml, tagCanslim, canslimRows, baseBoxData, positionSize, positionMetrics, tagPositions, positionRows, positionTotals, swipeDirection, qullamaggieRows, breakoutInfo, tagBreakouts, readinessLine, upsideMain, targetMain, recomLabel, fillTargets, baseRows, earningsInDays, mergePrefs, prefsNormalize, applyCommonFilters, scoreInRange, marketLines, MARKET_LABELS, ratingClass, decorateCell, githubActionsUrl, sortRows,
        fmtMarketCap, fmtVolume, fmtPct, state, COL, TAB_COLUMNS, tagStrategies, STRATEGIES, TAB_COLUMNS_COMPACT, TAB_TITLES,
    };
}
