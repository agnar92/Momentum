// tvUrlFor/compareRows żyją w js/shared.js, initConnStatus/hideLoadingOverlay w
// js/qol.js — oba ładowane PRZED tym plikiem (patrz kolejność <script> w
// index.html). Node (tests/js/) nie ładuje <script> tagów, więc odtwarzamy to
// samo współdzielenie globali ręcznie tylko tam.
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./qol.js"));
    Object.assign(globalThis, require("./annotate.js"));
    Object.assign(globalThis, require("./glb.js"));
}

// ============================================================
// LISTA OBSERWOWANA (index.html) — czyta docs/data/watchlist.json generowany
// codziennie przez watchlist.py (Finviz: lista spółek + fundamenty, yfinance:
// ceny i wskaźniki). Zakładki nad TĄ SAMĄ listą:
//   📋 Lista      — wszystkie spółki po filtrze Finviz,
//   (RS Rating, EPS Rating i Composite zostały kolumnami; zakładki Ratingi i Wybicia usunięto — sortuj w CANSLIM)
//   📑 Watchlisty  — ręczne listy (nazwa + filtr Finviz, workflow „Watchlisty”) z RS / EPS / Composite i wykresami tygodniowymi,
//   🎯 Upside — ranking średniej ceny celu analityków (upside do średniej, kolumny Min / Max),
//   🧱 Bazy        — spółki w otwartej bazie/korekcie blisko pivotu (heurystyka watchlist.py::detect_bases),
//   ⭐ Ulubione    — własne ★ użytkownika (localStorage).
// To tylko informacja do przeglądania, nie rekomendacja inwestycyjna.
// ============================================================

const COMPACT_MAX_WIDTH = 640;
const SWIPE_MIN_PX = 60, SWIPE_MAX_MS = 700;   // przeciągnięcie po tytule wykresu = następna / poprzednia spółka
const CHART_LOG_KEY = "momentum_watchlist_chart_log";
const CHART_LEGEND_KEY = "momentum_watchlist_chart_legend";
const CHART_DARVAS_KEY = "momentum_watchlist_chart_darvas";
const CHART_EST_KEY = "momentum_watchlist_chart_est";   // "1" = estymaty analityków włączone
const CHART_WINLEN_KEY = "momentum_watchlist_chart_winlen";   // zapamiętana długość okna suwaka {w}
const CHART_BOOK_KEY = "momentum_watchlist_chart_book";   // wygląd i opisy jak w książce O'Neila (domyślnie włączone)
const FAVS_KEY = "momentum_watchlist_favs";
const SCORES_KEY = "momentum_watchlist_scores";            // własny score spółek wpisywany ręcznie {ticker: liczba}
const SETTINGS_KEY = "momentum_watchlist_settings";
const EARNINGS_SOON_DAYS = 7;
const BASE_LABELS_PL = { flat: "Flat base", cup: "Cup base", double_bottom: "Double bottom", ascending: "Ascending base", htf: "High tight flag", square_box: "Square box", ipo: "Baza po debiucie (IPO)", correction: "Korekta", deep: "Głęboka korekta" };
const DEFAULT_SETTINGS = {
    tab: "PLAN", csMin: 5, csCore: true, csAccel: true, csRs: 80, bases: { maxDistPct: 10, vcpOnly: false }, brk: { maxDistPct: 5 },
};
// Jedna lista (watchlist.json = skaner CANSLIM z Finviz); zakładki CANSLIM, Bazy… to tylko różne filtry i sortowania tych samych spółek.

// Strategie = zakładki z filtrami (kolumna „Strategie”).
const STRATEGIES = { B: ["B", "Bazy blisko pivotu"] };
const STRATEGY_ORDER = ["B"];
function tagStrategies(allStocks, filtered, st, alerts = []) {
    tagBreakouts(allStocks, alerts, st.brk ? st.brk.maxDistPct : DEFAULT_SETTINGS.brk.maxDistPct);
    const sets = {
        B: new Set(baseRows(filtered, st.bases).map(s => s.ticker)),
    };
    allStocks.forEach(s => {
        s.strat = STRATEGY_ORDER.filter(c => sets[c].has(s.ticker));
        s.strat_rank = s.strat.length ? STRATEGY_ORDER.indexOf(s.strat[0]) : STRATEGY_ORDER.length;
    });
}
const TAB_DEFAULT_SORT = {
    LIST: ["ticker", "asc"], WATCH: ["darvas_rank", "asc"],
    CS: ["cs", "desc"], BASES: ["pct_to_pivot", "asc"], POS: ["pos_to_stop_pct", "desc"], FAV: ["ticker", "asc"],
};
const BOTTOM_NAV_TABS = ["PLAN", "POS", "CS", "BOXES"];   // zakładki z dolnej nawigacji telefonu; reszta jest w menu Więcej
const BOXES_TAB = "BOXES";   // podstrona „Boxy” (bez własnej tabeli) — przegląd boxów Darvasa: monitorowane, nowe, wybicia, trzymaj, sprzedaj; patrz #boxesPanel
const PLAN_TAB = "PLAN";   // 📋 Plan na tydzień (start): pozycje z decyzją + zlecenia kupna Darvasa — patrz #planPanel, renderPlanPanel
const LEAN_HIDDEN_TABS = ["LIST", "WATCH", "BASES", "FAV"];   // schowane po porządkach (Filtry → „Pokaż wszystkie zakładki” je przywraca)
const FILTERS_TAB = "FILTERS";   // zakładka z konfiguracją wyszukiwania (bez własnej tabeli) — patrz #filtersPanel
const TAB_TITLES = {
    LIST: "Lista Finviz", CS: "Lista CANSLIM (C A N S L I M)", POS: "Moje pozycje", WATCH: "Watchlisty (ręczne listy z Finviz)", BASES: "Bazy blisko pivotu", FAV: "Ulubione",
};
const FALLBACK_REPO = "agnar92/Momentum";

const state = {
    data: null,
    tab: DEFAULT_SETTINGS.tab,
    csMin: DEFAULT_SETTINGS.csMin,
    csCore: DEFAULT_SETTINGS.csCore,
    csAccel: DEFAULT_SETTINGS.csAccel,
    csRs: DEFAULT_SETTINGS.csRs,
    bases: { ...DEFAULT_SETTINGS.bases },
    brk: { ...DEFAULT_SETTINGS.brk },
    patterns: true,   // false = bez analizy wzorców: brak zakładki Bazy, kolumn bazowych i rysunków formacji na wykresie (user: „sam będę wykrywał pattern”)
    favs: new Set(),
    scores: {},
    pos: {},
    boxes: {},   // przypięte boxy do monitorowania {T: {top, bottom, start}}
    acct: { capital: null, riskPct: null, posPct: null, fx: null },
    scoreMin: null,
    scoreMax: null,
    natrMax: null,      // filtr listy: maks. tygodniowy NATR spółki (%)
    allTabs: false,     // po porządkach: false = widoczne tylko Plan, Pozycje, CANSLIM, Boxy, Filtry (LEAN_HIDDEN_TABS schowane)
    risingOnly: false,  // filtr listy: tylko akcje z ≥ 2 kolejnymi, rosnącymi pudełkami Dar-Card (s.rise_n z dziennych wykresów)
    boxNatrMax: null,   // filtr zakładki Boxy: maks. NATR samego boxa (%)
    search: "",
    sector: "",
    sortKey: "ticker",
    sortDir: "asc",
};

// ---------- czyste funkcje (testowane w tests/js/watchlist.test.js) ----------

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
// F: sztywny stop — maksymalna strata 7–8 % poniżej ceny zakupu (O'Neil, bez wyjątków). Zwraca {loss_pct, ok} albo null.
const STOP_LOSS_MAX_PCT = 8;
function stopRuleCheck(entry, stop) {
    if (!(entry > 0) || !(stop > 0) || stop >= entry) return null;
    const loss = (entry - stop) / entry * 100;
    return { loss_pct: loss, ok: loss <= STOP_LOSS_MAX_PCT + 1e-9 };
}

// Wielkość pozycji dla konta w PLN (IKE): kapitał PLN ÷ kurs USD/PLN = kapitał w USD. Liczba akcji = mniejsza z dwóch: z % konta na pozycję
// (kapitał · posPct% / wejście) i z ryzyka do stopu (kapitał · riskPct% / (wejście − stop)) — dzięki temu strata przy stopie nigdy nie przekracza
// zadanego ryzyka, a pozycja nie przekracza zadanego % konta. Wystarczy jedno z dwóch (posPct albo riskPct); null, gdy dane nie mają sensu.
// Liczba akcji bez zbędnych zer: 12, 3,5, 0,27 (pozycje mogą być ułamkowe)
function fmtShares(n) { return Number.isFinite(n) ? String(Math.round(n * 100) / 100).replace(".", ",") : "—"; }

function positionSize(acct, entry, stop) {
    const { capital, fx, posPct, riskPct } = acct || {};
    const okPos = Number.isFinite(posPct) && posPct > 0, okRisk = Number.isFinite(riskPct) && riskPct > 0;
    if (![capital, fx, entry].every(Number.isFinite) || capital <= 0 || fx <= 0 || entry <= 0 || (!okPos && !okRisk)) return null;
    const perShare = Number.isFinite(stop) && stop > 0 && stop < entry ? entry - stop : null;
    if (okRisk && !okPos && perShare === null) return null;
    const capUsd = capital / fx;
    const byPos = okPos ? capUsd * posPct / 100 / entry : Infinity;
    const byRisk = okRisk && perShare !== null ? capUsd * riskPct / 100 / perShare : Infinity;
    const shares = Math.floor(Math.min(byPos, byRisk) * 100 + 1e-6) / 100;   // akcje ułamkowe (IKE / broker z ułamkami): zaokrąglenie w dół do 0,01
    if (!Number.isFinite(shares)) return null;
    return {
        shares, limited_by: byRisk < byPos ? "risk" : "pos",
        value_usd: shares * entry, value_pln: shares * entry * fx, pct_of_capital: shares * entry / capUsd * 100,
        risk_usd: perShare !== null ? shares * perShare : null, risk_pln: perShare !== null ? shares * perShare * fx : null,
        risk_pct: perShare !== null ? shares * perShare / capUsd * 100 : null,
    };
}

// Metryki otwartej pozycji względem bieżącej ceny: zysk (%, $), wielokrotność ryzyka R, odległość do stopu, wartość, ryzyko początkowe.
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

// Czy przestawić stop? Reguła z blueprintu: MACD tygodniowy (12, 26, 9) przecina linię sygnału W DÓŁ i tydzień zamyka się pod nią → nowy stop tuż pod dołkiem
// (knotem) tej świecy, bo jest „ostatnią linią obrony” (jeśli ją zjedzą kolejne tygodnie, wychodzimy). Dopóki MACD jest nad sygnałem, stopa nie ruszamy.
// pos = { stop, ... }, st = macdWeeklyState(...) (chart.js), price = ostatnia cena. -> { code, tone, label, short, text, newStop }
function stopAdvice(pos, st, price) {
    const mk = (code, tone, label, text, newStop = null, short = label) => ({ code, tone, label, short, text, newStop });
    if (!st) return mk("NA", "muted", "brak MACD", "Za krótka historia, żeby policzyć MACD tygodniowy.");
    if (st.state === "above") {
        const closing = Number.isFinite(st.histDelta) && st.histDelta < 0 && Number.isFinite(st.histDelta2) && st.histDelta2 < 0;
        return closing
            ? mk("KEEP", "watch", "stop bez zmian, MACD słabnie", "MACD jest jeszcze nad sygnałem, ale histogram maleje od 2 tygodni — zbliża się przecięcie. Stopa nie ruszaj; przygotuj się, że po przecięciu w dół i zamknięciu tygodnia pod sygnałem podniesiesz go pod dołek tej świecy.", null, "MACD słabnie")
            : mk("KEEP", "good", "stop bez zmian", "MACD tygodniowy jest nad linią sygnału — momentum trwa. Nie podnoś stopa.", null, "MACD nad sygnałem");
    }
    if (st.crossDown === null || !Number.isFinite(st.crossLow)) return mk("WARN", "watch", "MACD pod sygnałem", "MACD jest pod linią sygnału, ale przecięcie w dół jest sprzed zakresu danych — sprawdź wykres i ustaw stop pod dołkiem świecy, w której nastąpiło.", null, "MACD pod sygnałem");
    const ago = st.weeksSinceDown, when = `tydzień do ${st.crossDownDate}${ago ? ` (${ago} tyg. temu)` : " (ostatnia zamknięta świeca)"}`;
    const newStop = Math.round(st.crossLow * 100) / 100;
    if (Number.isFinite(price) && price <= newStop) return mk("HIT", "bad", "pod dołkiem świecy sygnału", `MACD zszedł pod sygnał w ${when}, a cena ${money(price)} jest już pod dołkiem tej świecy (${money(newStop)}) — stop z reguły MACD wybity: wyjście.`, newStop, "stop z MACD wybity");
    if (pos && Number.isFinite(pos.stop) && pos.stop >= newStop) return mk("KEEP", "good", "stop już wyżej", `MACD zszedł pod sygnał w ${when}; dołek tej świecy to ${money(newStop)}, a Twój stop ${money(pos.stop)} jest wyżej — nic nie zmieniaj.`, newStop, "stop już wyżej niż dołek sygnału");
    return mk("RAISE", "watch", `podnieś stop do ${money(newStop)}`, `MACD zszedł pod linię sygnału w ${when}. Reguła: podnieś stop tuż pod dołek tej świecy — ${money(newStop)}${pos && Number.isFinite(pos.stop) ? ` (obecny ${money(pos.stop)})` : ""}. Jeśli kolejne tygodnie zjedzą ten dołek, wychodzisz.`, newStop, `podnieś stop do ${money(newStop)}`);
}

// Pozycje mogą dotyczyć spółek spoza listy CANSLIM (np. utworzone z 📋 Zleceń w Watchlistach): bierzemy je z
// watchlists.json, a gdy spółki nie ma w żadnym pliku — wiersz zastępczy z samym tickerem i ceną wejścia.
// Filtry score / NATR / sektor / „≥ 2 rosnące” nie chowają pozycji (tylko wyszukiwarka).
function positionStocks(main) {
    const out = main.slice();
    const seen = new Set((state.data ? state.data.stocks : main).map(s => s.ticker));
    const extra = [];
    if (typeof watchData !== "undefined" && watchData) watchData.stocks.forEach(s => { if (state.pos[s.ticker] && !seen.has(s.ticker)) { seen.add(s.ticker); extra.push(s); } });
    Object.keys(state.pos || {}).forEach(t => { if (!seen.has(t)) { seen.add(t); extra.push({ ticker: t, price: state.pos[t].entry, company: "(spoza list — brak bieżącej ceny)" }); } });
    tagPositions(extra, state.pos);
    return out.concat(extra.filter(s => applyCommonFilters([s], state.search, "", null, null, null, false).length));
}
function positionRows(stocks) {
    return stocks.filter(s => s.position).sort((a, b) => (b.pos_to_stop_pct ?? -Infinity) - (a.pos_to_stop_pct ?? -Infinity));
}

// Podsumowanie portfela: liczba pozycji, wartość, ryzyko do stopów (suma początkowych ryzyk) i jako % kapitału.
// Wartości w USD (jak ceny); capital = kapitał konta w PLN, fx = USD/PLN → dodatkowo przeliczenie na PLN i % konta.
function positionTotals(rows, capital, fx) {
    let value = 0, risk = 0, pl = 0;
    rows.forEach(s => { value += s.pos_value || 0; risk += s.pos_risk_usd || 0; pl += s.position.pl_usd || 0; });
    const capUsd = Number.isFinite(capital) && capital > 0 && Number.isFinite(fx) && fx > 0 ? capital / fx : null;
    return {
        n: rows.length, value, risk, pl, fx: Number.isFinite(fx) ? fx : null,
        value_pln: Number.isFinite(fx) ? value * fx : null, risk_pln: Number.isFinite(fx) ? risk * fx : null, pl_pln: Number.isFinite(fx) ? pl * fx : null,
        risk_pct: capUsd ? risk / capUsd * 100 : null, value_pct: capUsd ? value / capUsd * 100 : null,
    };
}

// Wybicia: spółki tuż PRZED wybiciem (albo świeżo po nim). Powody: flaga / korytarz przy oporze lub świeże wybicie (tlw_state),
// blisko pivotu bazy (pct_to_pivot), własna linia z alertem „nad linią” blisko ceny albo przebita (alerty z annotate.js).
// dist = ile % brakuje do najbliższego poziomu wybicia (null = już po wybiciu); rank 0 = wybicie / przebity alert, 1 = do 2 %, 2 = dalej.
// Wybicie wg O'Neila = ZAMKNIĘCIE tygodnia nad linią / pivotem na podwyższonym wolumenie (≥ 1,5× średniej). Samo przebicie
// maksimum w trakcie świecy to nie wybicie, a zamknięcie nad poziomem bez wolumenu jest tylko „niepotwierdzone” (nie trafia do rank 0).
const BRK_VOL_MULT = 1.5;
const BOX_BASES = ["flat", "square_box"];   // pudełka: podział na 3 części, stop ze środka, ocena świecy wybicia (cup z rączką i flaga — bez tego)
const BUYABLE_BASES = ["flat", "cup", "double_bottom", "square_box", "ascending", "htf", "ipo"];   // pivot do wybicia i strefa zakupu mają sens tylko dla baz kupowalnych (nie „korekta” / „głęboka korekta”)
function breakoutInfo(s, alert, maxDist) {
    const reasons = [];
    const dists = [];
    const vols = [];
    let fresh = false;
    const volTxt = (r, ok) => (Number.isFinite(r) ? ` ×${r} wol.${ok ? " ✓" : ""}` : "");
    // formacje z linią oporu (flaga / korytarz) na świecach tygodniowych
    [["w", "tyg."]].forEach(([p, tf]) => {
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
        const tf = "tyg.";
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
    const bestVol = vols.length ? Math.max(...vols) : (s.tlw_vol_ratio || 0);
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

// Lista kontrolna CANSLIM z danych, które mamy (O'Neil, „How to Make Money in Stocks”; progi to heurystyka, nie historycznie testowana):
// C = EPS ostatniego kwartału r/r ≥ 25 % ORAZ sprzedaż Q/Q r/r ≥ 25 % (gdy znana),
// A = wzrost EPS 5 lat ≥ 25 %, EPS w tym roku ≥ 25 % i ROE ≥ 17 % (każdy ZNANY składnik musi przejść),
// N = do 15 % pod szczytem 52 tyg., S = popyt (Acc/Dis A lub B) i podaż (zadłużenie D/E ≤ 1, gdy znane),
// L = RS Rating ≥ 80 w silnej grupie (grupa ≥ 60, gdy znana), I = instytucje 20–90 % z napływem, M = trend wzrostowy rynku (EMA10 > EMA20 tyg.) i < 5 dni dystrybucji.
const CANSLIM_KEYS = ["C", "A", "N", "S", "L", "I", "M"];
const CANSLIM_HELP = {   // L: tekst z aktualnym progiem RS — patrz canslimHelp
    C: "C — bieżące zyski: EPS ostatniego kwartału r/r ≥ 20 %, sprzedaż r/r ≥ 25 %, tempo wzrostu EPS rośnie w ostatnich 2–3 kwartałach", A: "A — roczne zyski: wzrost EPS TTM ≥ 25 %, wzrost EPS ≥ 25 % w każdym z 3 ostatnich lat obrotowych, ROE ≥ 17 %", N: "N — nowość / szczyt: nie dalej niż 15 % pod szczytem 52 tyg.",
    S: "S — popyt i podaż: Acc/Dis A lub B oraz zadłużenie D/E ≤ 1", L: "L — lider: RS Rating ≥ 80 w silnej grupie branżowej (≥ 60)", I: "I — instytucje: własność 20–90 % i napływ w ostatnim kwartale", M: "M — rynek: S&P 500 i Nasdaq w trendzie wzrostowym (EMA10 > EMA20 tyg.), mniej niż 5 dni dystrybucji",
};
const CANSLIM_THRESHOLDS = { epsQ: 20, epsQStrong: 25, accel: true, sales: 25, epsYear: 25, roe: 17, nearHigh: -15, debtEq: 1, rs: 80, group: 60, instMin: 20, instMax: 90, instData: 100, distDays: 5 };
// I z CANSLIM tak samo jak watchlist.py::institutional_flag (liczymy też tu, żeby nie czekać na odświeżenie danych): przedział 20–90 % + napływ; > 100 % = dane niewiarygodne.
function institutionalFlag(s) {
    const T = CANSLIM_THRESHOLDS;
    if (Number.isFinite(s.inst_own) && Number.isFinite(s.inst_trans)) {
        if (s.inst_own > T.instData) return null;
        return s.inst_own >= T.instMin && s.inst_own <= T.instMax && s.inst_trans > 0;
    }
    return typeof s.inst_sponsor === "boolean" ? s.inst_sponsor : null;
}
// Rynek do litery M: tekst reżimu albo { regime, distDays } (distDays = najwięcej dni dystrybucji wśród S&P 500 i Nasdaq).
function canslimMarket() {
    const m = state.data && state.data.market;
    if (!m) return null;
    // M efektywne z watchlist.py: po korekcie potwierdzony Follow-Through Day też otwiera rynek (dni dystrybucji liczone wtedy od FTD); starsze pliki — reżim techniczny
    const d = [m.sp500, m.nasdaq].map(x => (x ? (Number.isFinite(x.m_dist_days) ? x.m_dist_days : Number.isFinite(x.dist_days) ? x.dist_days : null) : null)).filter(v => v !== null);
    return { regime: m.m_regime || m.regime || null, distDays: d.length ? Math.max(...d) : null, ftd: [m.sp500, m.nasdaq].some(x => x && x.m_via_ftd) };
}
// RS Rating: percentyl względem spółek listy (skaner CANSLIM z Finviz).
function rsBasisText() {
    return "percentyl wśród spółek listy (skaner CANSLIM z Finviz), więc to „top X % tej listy”, a nie całego rynku";
}
// Próg RS (litera L) wpisuje użytkownik w Filtrach; CANSLIM_THRESHOLDS.rs czytają canslimInfo i canslimExplain.
function setCanslimAccel(on) { CANSLIM_THRESHOLDS.accel = !!on; }
function setCanslimRs(v) { CANSLIM_THRESHOLDS.rs = Number.isFinite(v) && v >= 0 && v <= 99 ? v : DEFAULT_SETTINGS.csRs; }
function canslimHelp(k) {
    return k === "L" ? `L — lider: RS Rating ≥ ${CANSLIM_THRESHOLDS.rs} w silnej grupie branżowej (≥ ${CANSLIM_THRESHOLDS.group})` : CANSLIM_HELP[k];
}
// Roczny wzrost EPS dla A: lata obrotowe z Yahoo (eps_fy0..2), a gdy ich brak — suma 4 kwartałów (eps_yr0..2); [najświeższy, rok wcześniej, 2 lata wcześniej].
function annualEpsGrowth(s) {
    const fy = [s.eps_fy0, s.eps_fy1, s.eps_fy2], yr = [s.eps_yr0, s.eps_yr1, s.eps_yr2];
    return fy.some(Number.isFinite) ? { values: fy, basis: "fy" } : { values: yr, basis: "ttm" };
}
function canslimInfo(s, mkt) {
    const T = CANSLIM_THRESHOLDS, num = Number.isFinite;
    const regime = mkt && typeof mkt === "object" ? mkt.regime : mkt;
    const distDays = mkt && typeof mkt === "object" ? mkt.distDays : null;
    // C wg książki O'Neila: EPS ostatniego kwartału r/r ≥ 20 % (minimum z „18–20 %”, najlepiej 25 % i więcej), sprzedaż r/r ≥ 25 % (gdy znana) i przyspieszenie
    // tempa wzrostu EPS w ostatnich 2–3 kwartałach (gdy znane i włączone — Filtry → 🏆); brak EPS = brak danych
    let C = null;
    if (num(s.eps_q0_yoy)) C = s.eps_q0_yoy >= T.epsQ && (!num(s.sales_qq) || s.sales_qq >= T.sales) && !(T.accel && s.eps_accel === false);
    // A wg książki (tylko zysk ZREALIZOWANY, bez prognoz): każdy znany składnik musi przejść: wzrost EPS TTM (suma 4 ostatnich kwartałów vs 4 wcześniejsze, eps_yr0), ROE ≥ 17 % i wzrost EPS roku obrotowego w KAŻDYM z 3 ostatnich lat (eps_fy0..2 z Yahoo, O'Neil: ≥ 25 % co roku);
    // nieznany rok (młoda spółka, ujemna baza) jest pomijany; żaden znany = brak danych. Wzrost EPS z 5 lat to nie kryterium O'Neila, więc go nie używamy.
    const aParts = [num(s.eps_yr0) ? s.eps_yr0 >= T.epsYear : null, num(s.roe) ? s.roe >= T.roe : null,
        ...annualEpsGrowth(s).values.map(v => (num(v) ? v >= T.epsYear : null))].filter(v => v !== null);
    const A = aParts.length ? aParts.every(Boolean) : null;
    const N = num(s.pct_from_high_52w) ? s.pct_from_high_52w >= T.nearHigh : null;
    // S: popyt (Acc/Dis) i podaż (zadłużenie, gdy znane)
    const S = s.accdis ? (s.accdis === "A" || s.accdis === "B") && (!num(s.debt_eq) || s.debt_eq <= T.debtEq) : null;
    const L = num(s.rs_rating) ? s.rs_rating >= T.rs && (!num(s.industry_rating) || s.industry_rating >= T.group) : null;
    const M = regime === "uptrend" ? !(num(distDays) && distDays >= T.distDays) : regime === "correction" ? false : null;
    const flags = { C, A, N, S, L, I: institutionalFlag(s), M };
    const score = CANSLIM_KEYS.filter(k => flags[k] === true).length;
    const known = CANSLIM_KEYS.filter(k => flags[k] !== null).length;
    return { flags, score, known };
}
function tagCanslim(stocks, mkt) {
    stocks.forEach(s => { const c = canslimInfo(s, mkt); s.canslim = c; s.cs = c.known >= 4 ? c.score : null; });
}

// ---------- „Co robić” — jedna jasna wskazówka na spółkę (kolumna „Co robić”, pierwsza część linii gotowości) ----------
// Kolejność: najpierw MOJA POZYCJA (sprzedaj / realizuj / dokup / trzymaj), potem rynek (M), potem sygnał wejścia z bazy lub trendu.
// Zasady wg O'Neila (heurystyka, nie porada): kupuj WYBICIE z bazy na wolumenie ≥ 1,5× do +5 % nad pivotem; dalej nie goń; dokupuj tylko do zysku
// (add-on 2–5 % nad zakupem, max ½ pozycji) albo przy odbiciu od SMA50; nigdy do straty; sprzedaj przy stracie 7–8 % lub zejściu pod SMA50 na wolumenie.
const ACTION_DEFS = {
    SELL: ["✂", "SPRZEDAJ", "bad", 0], TRIM: ["⚠", "REALIZUJ ZYSK", "bad", 1], EXIT: ["⚠", "ROZWAŻ WYJŚCIE", "bad", 2],
    ADD: ["➕", "DOKUP", "good", 3], BUY: ["🎯", "KUP", "good", 4], BUY_HALF: ["🎯", "KUP ½", "good", 5],
    NEAR: ["👀", "ALERT NA PIVOCIE", "watch", 6], PULLBACK: ["👀", "CZEKAJ NA ODBICIE", "watch", 7], BASE: ["⏳", "BAZA W BUDOWIE", "wait", 8],
    WAIT: ["⏳", "CZEKAJ NA BAZĘ", "wait", 9], LATE: ["🚫", "ZA PÓŹNO", "wait", 10], HOLD: ["✔", "TRZYMAJ", "neutral", 11],
    DIST: ["📉", "DYSTRYBUCJA", "bad", 12], NOBUY: ["🛑", "NIE KUPUJ", "bad", 13], SKIP: ["—", "POZA CANSLIM", "muted", 14],
};
// Ocena na wykresie TYGODNIOWYM (baza flat / cup / double bottom…, flaga tygodniowa, 10-tygodniowa średnia) — jedyny wykres w aplikacji. Pozycja, fundamenty i rynek liczą się tak samo.
function actionInfo(s, mkt, requireCore = true) {
    const tf = "W";
    const num = Number.isFinite;
    const regime = mkt && typeof mkt === "object" ? mkt.regime : mkt;
    const distDays = mkt && typeof mkt === "object" ? mkt.distDays : null;
    const pressure = regime === "uptrend" && num(distDays) && distDays >= CANSLIM_THRESHOLDS.distDays;
    const mk = (code, why) => ({ code, tf, icon: ACTION_DEFS[code][0], label: ACTION_DEFS[code][1], tone: ACTION_DEFS[code][2], rank: ACTION_DEFS[code][3], why });
    const above50 = s.pct_above_sma10w;   // tygodniowy wykres liczy się na 10-tygodniowej średniej
    const ma = "10-tygodniowej";
    const extended = 20;   // O'Neil: > 20–25 % nad 10-tygodniową = rozciągnięta
    const days = earningsInDays(s.earnings);
    const earn = days !== null && days >= 0 && days <= EARNINGS_SOON_DAYS ? ` Uwaga: wyniki za ${days} dn. — nie otwieraj nowej pozycji tuż przed raportem.` : "";
    const p = s.position;
    if (p) {   // ---- mam pozycję (ta sama ocena w obu widokach) ----
        if (p.stop_hit) return mk("SELL", "Cena na stopie lub pod nim. Wyjdź zgodnie z planem — nie przesuwaj stopa w dół.");
        if (s.climax_top === true) return mk("TRIM", "Sell climax top (gwałtowne wybicie na szczycie): O'Neil radzi realizować zysk w siłę, a nie czekać na spadek.");
        if (s.dist_top === true) return mk("TRIM", `Dystrybucja bez wzrostu ceny (tydzień do ${s.dist_date}): rekordowy wolumen od początku rajdu ×${s.dist_vol_ratio}, a cena prawie bez zmian albo zamknięta w dolnej połowie zakresu — podaż tłumi popyt. Rozważ realizację zysku albo zacieśnij stop.`);
        if (num(above50) && above50 < 0) return mk("EXIT", `Cena ${Math.abs(above50).toFixed(1)}% pod ${ma}. Zejście pod tę średnią (zwłaszcza na wolumenie) to sygnał słabości — rozważ wyjście lub zacieśnij stop.`);
        if (p.pl_pct < 0) return mk("HOLD", `Pozycja ${fmtPct(p.pl_pct)}. Pilnuj stopa. Nigdy nie dokupuj do straty (nie uśredniaj w dół).`);
        if (regime === "correction" || pressure) return mk("HOLD", `Pozycja ${fmtPct(p.pl_pct)}. Rynek pod presją — nie dokupuj, pilnuj stopa.`);
        if (num(s.pct_to_pivot) && s.pct_to_pivot < -5) return mk("HOLD", `Pozycja ${fmtPct(p.pl_pct)}. Cena ponad 5 % nad pivotem — nie dokupuj (reguła +5 %), pilnuj stopa.`);
        if (p.pl_pct >= 2 && p.pl_pct <= 5) return mk("ADD", `Zysk ${fmtPct(p.pl_pct)} (pierwszy add-on: 2–3 % nad zakupem, najwyżej 5 %). Dokup do ½ początkowej pozycji, jeśli wolumen to potwierdza; każdy kolejny add mniejszy od poprzedniego; łączne ryzyko w limicie.`);
        if (p.pl_pct > 5 && num(above50) && above50 >= 0 && above50 <= 6) return mk("ADD", `Zysk ${fmtPct(p.pl_pct)}, a cena wróciła do ${ma} (+${above50.toFixed(1)}%). Odbicie od tej średniej to klasyczne miejsce na dokupienie — zaczekaj na zamknięcie nad poprzednią świecą.`);
        return mk("HOLD", `Pozycja ${fmtPct(p.pl_pct)}. Trzymaj. Kolejny add: cofnięcie do ${ma} z odbiciem albo wybicie NOWEJ bazy / flagi. Nie dokupuj, gdy cena jest rozciągnięta.`);
    }
    const f = s.canslim && s.canslim.flags;
    // bramka C / A działa tylko przy włączonym „C i A obowiązkowe” (Filtry → 🏆 CANSLIM); bez niej oceniamy wzorzec niezależnie od fundamentów
    if (requireCore && f && (f.C === false || f.A === false)) return mk("SKIP", "Nie spełnia fundamentów CANSLIM (C lub A) — nie jest kandydatem.");
    if (s.dist_top === true) return mk("DIST", `Dystrybucja bez wzrostu ceny (tydzień do ${s.dist_date}): rekordowy tygodniowy wolumen ×${s.dist_vol_ratio} od dołka trendu, a cena prawie bez zmian albo zamknięta w dolnej połowie zakresu. Instytucje sprzedają w siłę — nie kupuj, poczekaj na nową bazę.`);
    if (regime === "correction") return mk("NOBUY", "Rynek w korekcie (EMA10 < EMA20 tygodniowa). 3 na 4 akcje podąża za rynkiem — nie otwieraj nowych pozycji, tylko obserwuj.");
    const boxStop = BOX_BASES.includes(s.base_type) && num(s.box_stop) ? s.box_stop : null;   // pudełko: stop ze środka bazy zamiast stałych 7–8 %
    const stopTxt = boxStop !== null ? `Stop z bazy ${money(boxStop)} (−${s.box_stop_pct}% od pivotu, dół środkowej 1/3 pudełka).` : "Stop 7–8 % pod punktem wejścia.";
    const buy = (over, what) => pressure
        ? mk("BUY_HALF", `Wybicie ${what} na wolumenie (${over.toFixed(1)}% nad poziomem), ale rynek ma ${distDays} dni dystrybucji — max ½ pozycji. ${stopTxt}${earn}`)
        : mk("BUY", `Wybicie ${what} na wolumenie, ${over.toFixed(1)}% nad poziomem (strefa zakupu do +5 %). ${stopTxt}${earn}`);
    const trend = () => {   // trend bez konsolidacji na tym wykresie
        if (num(above50) && above50 >= 0 && above50 <= 5 && (!f || f.N !== false)) return mk("PULLBACK", `Cofnięcie do ${ma} (+${above50.toFixed(1)}%). W trendzie bez bazy to miejsce na dołączenie, ale dopiero na odbiciu: wypatruj zamknięcia nad poprzednią świecą z rosnącym wolumenem.${earn}`);
        if (num(above50) && above50 > extended) return mk("LATE", `Cena ${above50.toFixed(1)}% nad ${ma} — rozciągnięta. Nie goń: czekaj na cofnięcie albo nową bazę.`);
        return mk("WAIT", "Brak bazy na wykresie tygodniowym. Nie kupuj w biegu. Czekaj na nową płaską bazę (≥ 5 tygodni, ≤ 15 % głębokości) i jej wybicie, albo na cofnięcie do 10-tygodniowej z odbiciem.");
    };
    // ---- wykres tygodniowy: baza flat / cup (pivot), flaga tygodniowa ----
    const buyable = BUYABLE_BASES.includes(s.base_type);
    const toPivot = buyable && num(s.pct_to_pivot) ? s.pct_to_pivot : null;   // > 0 = jeszcze pod pivotem, < 0 = nad
    const wOver = num(s.tlw_dist_pct) && s.tlw_state === "wybicie" ? -s.tlw_dist_pct : null;
    const over = toPivot !== null && toPivot < 0 ? -toPivot : wOver;
    if ((s.pivot_state === "wybicie" || s.tlw_state === "wybicie") && over !== null && over <= 5) {
        // blueprint: górny knot świecy wybicia > 50 % jej zakresu = presja sprzedaży — tego wybicia nie bierzemy
        if (BOX_BASES.includes(s.base_type) && num(s.box_brk_wick_pct) && s.box_brk_wick_pct > 50) return mk("NEAR", `Wybicie z bazy, ale górny knot świecy to ${s.box_brk_wick_pct}% jej zakresu (> 50 %) — presja sprzedaży. Nie bierz tego wybicia; poczekaj na mocniejsze zamknięcie (pełny korpus, krótki knot).${earn}`);
        return buy(over, "z bazy tygodniowej");
    }
    if (over !== null && over > 5) return mk("LATE", `${over.toFixed(1)}% nad poziomem wybicia — poza strefą +5 %. Nie goń: poczekaj na cofnięcie do 10-tygodniowej albo na nową bazę.`);
    if (toPivot !== null && toPivot < 0) return mk("NEAR", `Cena nad pivotem, ale bez wolumenu ≥ 1,5× — to jeszcze nie wybicie. Czekaj na tydzień z wolumenem.${earn}`);
    if (toPivot !== null && toPivot >= 0 && toPivot <= 5) return mk("NEAR", `${toPivot.toFixed(1)}% do pivotu (${BASE_LABELS_PL[s.base_type] || s.base_type}${s.vcp ? " + VCP" : ""}). Ustaw alert na pivocie i kupuj dopiero przy wybiciu z wolumenem ≥ 1,5×.${earn}`);
    if (s.tlw_state === "przy oporze") return mk("NEAR", `Przy oporze flagi tygodniowej (${num(s.tlw_dist_pct) ? s.tlw_dist_pct.toFixed(1) + "%" : "blisko"}). Ustaw alert; kupuj dopiero przy wybiciu z wolumenem.${earn}`);
    if (toPivot !== null && toPivot > 5 && toPivot <= 15) return mk("BASE", `Baza w budowie, ${toPivot.toFixed(1)}% do pivotu. Czekaj, aż cena zbliży się do pivotu na malejącym wolumenie.`);
    return trend();
}
// Lista kontrolna wejścia z „My Strategy Blueprint” (tylko informacja, jak kolumna MACD): każda pozycja true / false / null (brak danych); score = liczba spełnionych.
const BLUEPRINT_CHECKS = [
    ["Cena nad 20-tyg. średnią", s => (Number.isFinite(s.pct_above_sma20w) ? s.pct_above_sma20w > 0 : null)],
    ["Tygodniowe MACD nad sygnałem", s => (typeof s.macd_w_above === "boolean" ? s.macd_w_above : null)],
    ["Zamknięcie = najwyższe z 10 tygodni", s => (typeof s.wk_hi10_close === "boolean" ? s.wk_hi10_close : null)],
    ["Świeca tygodnia +5…+20 % (wybicie)", s => (Number.isFinite(s.wk_chg_pct) ? s.wk_chg_pct >= 5 && s.wk_chg_pct <= 20 : null)],
    ["Wolumen ≥ +30 % vs poprzedni tydzień", s => (Number.isFinite(s.wk_vol_wow_pct) ? s.wk_vol_wow_pct >= 30 : null)],
    ["NATR tygodniowy < 8", s => (Number.isFinite(s.natr_w) ? s.natr_w < 8 : null)],
];
function blueprintInfo(s) {
    const checks = BLUEPRINT_CHECKS.map(([label, fn]) => ({ label, ok: fn(s) }));
    const known = checks.filter(c => c.ok !== null).length;
    return { checks, score: checks.filter(c => c.ok === true).length, known, total: checks.length };
}
function tagBlueprint(stocks) {
    stocks.forEach(s => { const b = blueprintInfo(s); s.bp = b; s.bp_score = b.known ? b.score : null; });
}

function tagActions(stocks, mkt, requireCore = true) {
    tagBlueprint(stocks);
    stocks.forEach(s => {
        const w = actionInfo(s, mkt, requireCore);
        s.action_w = w;
        s.act_rank_w = w ? w.rank : null;
        s.action = w;
        s.action_tf = w ? "W" : null;
        s.act_rank = w ? w.rank : null;
    });
}
function actionSheetHtml(s) {
    const a = s.action_w;
    return `<div class="act-sheet"><p class="act-now"><span class="muted">Wykres tygodniowy (baza flat / cup, 10-tyg. średnia)</span><br><strong>${a ? `${a.icon} ${a.label}` : "—"}</strong></p><p>${escapeHtml(a ? a.why : "Brak oceny.")}</p>`
        + `<h4>Jak dołączać do trendu (O'Neil)</h4><ol class="act-rules">`
        + `<li><b>Pierwszy zakup</b> tylko na wybiciu z bazy (cup, flat, flaga) na wolumenie ≥ 1,4–1,5× średniej, do +5 % nad pivotem. Stop 7–8 % pod wejściem.</li>`
        + `<li><b>Add-on</b> (dokupienie) tylko do zysku: gdy cena jest 2–5 % nad zakupem — do ½ początkowej pozycji. Nigdy do straty.</li>`
        + `<li><b>Odbicie od 10-tygodniowej</b>: lider po wybiciu często cofa się do tej średniej. Dołączasz dopiero na odbiciu z wolumenem (nie „łapiesz noża”), ze stopem tuż pod średnią.</li>`
        + `<li><b>Nowa baza</b>: trend bez bazy to nie sygnał. Czekaj na kolejną konsolidację i kupuj jej wybicie — to najczystszy add.</li>`
        + `<li><b>Nie goń</b>: > 5 % nad pivotem albo daleko nad 10-tygodniową = ZA PÓŹNO.</li>`
        + `<li><b>Dystrybucja</b>: rekordowy wolumen tygodniowy bez wzrostu ceny to sprzedaż w siłę — nie kupuj, a w pozycji zacieśnij stop.</li>`
        + `<li><b>Rynek (M)</b>: korekta = nie kupuj nowych; ≥ 5 dni dystrybucji = tylko ½ pozycji.</li></ol>`
        + `<p class="small muted">Heurystyka do nauki, nie porada inwestycyjna.</p></div>`;
}
function openActionSheet(ticker) {
    const s = findStock(ticker);
    if (!s) return;
    showSheet(`${escapeHtml(ticker)} — co robić`, actionSheetHtml(s));
}
// coreRequired: C i A to fundament CANSLIM (O'Neil) — przy włączonym warunku wynik 6/7 nie może mieć czerwonego ani nieznanego C / A.
function canslimRows(stocks, minScore, coreRequired = false) {
    return stocks.filter(s => s.cs !== null && s.cs >= minScore && (!coreRequired || (s.canslim.flags.C === true && s.canslim.flags.A === true))).sort((a, b) => b.cs - a.cs || (b.eps_accel === true) - (a.eps_accel === true) || (b.composite_rating ?? -1) - (a.composite_rating ?? -1));
}
// Wyjaśnienie wyniku CANSLIM litera po literze (okno po kliknięciu etykiety n/7): co zmierzyliśmy, jaka jest reguła, czy spełnione i czego uczy O'Neil.
// Czysta funkcja — pokazuje te same liczby, na których canslimInfo ustala flagi.
function canslimExplain(s, mkt) {
    const c = canslimInfo(s, mkt);
    const T = CANSLIM_THRESHOLDS, num = Number.isFinite;
    const regime = mkt && typeof mkt === "object" ? mkt.regime : mkt;
    const distDays = mkt && typeof mkt === "object" ? mkt.distDays : null;
    const pct = v => `${v > 0 ? "+" : ""}${v}%`;
    const rows = [];
    const add = (key, name, rule, have, lesson) => rows.push({ key, name, ok: c.flags[key], rule, have, lesson });
    const accel = s.eps_accel === true ? "zysk przyspiesza" : s.eps_accel === false ? "bez przyspieszenia" : null;
    add("C", "Current earnings — bieżące zyski", `EPS z ostatniego kwartału wyższy r/r o co najmniej ${T.epsQ} % (najlepiej ${T.epsQStrong} % i więcej), sprzedaż r/r o co najmniej ${T.sales} % (gdy znana)${T.accel ? " i przyspieszenie EPS w ostatnich 2–3 kwartałach (gdy znane)" : ""}`,
        num(s.eps_q0_yoy) ? `EPS ostatniego kwartału ${pct(s.eps_q0_yoy)} r/r${num(s.eps_q1_yoy) ? `, poprzedniego ${pct(s.eps_q1_yoy)}` : ""}${num(s.eps_q2_yoy) ? `, jeszcze wcześniejszego ${pct(s.eps_q2_yoy)}` : ""}${accel ? ` (${accel})` : ""}; sprzedaż ${num(s.sales_qq) ? `${pct(s.sales_qq)} r/r` : "— brak danych (oceniamy tylko EPS)"}` : "brak danych o EPS z ostatniego kwartału",
        "O'Neil: kwartalny EPS co najmniej 18–20 %, najlepsze spółki 25–50 % i więcej; do tego przyspieszenie tempa wzrostu w ostatnich 2–3 kwartałach oraz sprzedaż ≥ 25 % albo przyspieszająca w 3 ostatnich kwartałach. Wzrost zysku bez wzrostu sprzedaży to często cięcie kosztów. Przyspieszenie EPS wymagamy (można wyłączyć w Filtry → 🏆); przyspieszenia SPRZEDAŻY nie sprawdzamy — Yahoo daje za mało kwartałów, mamy tylko ostatni kwartał z Finviza.");
    add("A", "Annual earnings — roczne zyski", `wzrost EPS TTM ≥ ${T.epsYear} %, wzrost EPS ≥ ${T.epsYear} % w każdym z 3 ostatnich lat obrotowych i ROE ≥ ${T.roe} % (każdy znany składnik musi przejść; tylko zysk zrealizowany)`,
        [num(s.eps_yr0) ? `EPS TTM (ost. 4 kwartały vs 4 wcześniejsze) ${pct(s.eps_yr0)}` : null,
            annualEpsGrowth(s).values.some(num) ? `EPS rok do roku (${annualEpsGrowth(s).basis === "fy" ? "lata obrotowe" : "suma 4 kwartałów"}: najnowszy rok, rok wcześniej, 2 lata wcześniej): ${annualEpsGrowth(s).values.map(v => (num(v) ? pct(v) : "—")).join(" / ")}` : null,
            num(s.roe) ? `ROE ${s.roe}%` : null,
            num(s.pretax_margin) ? `marża przed opodatkowaniem ${s.pretax_margin}%${num(s.pretax_margin_chg) ? ` (${pct(s.pretax_margin_chg)} p.p. r/r)` : ""}` : null].filter(Boolean).join("; ") || "brak danych o rocznych zyskach i ROE",
        "O'Neil: roczny wzrost EPS co najmniej 25 % (najlepiej 25–50 % i więcej) w KAŻDYM z 3 ostatnich lat, bez załamań, oraz ROE co najmniej 17 % (najlepsze 25–50 %). Lata to lata obrotowe z Yahoo (income_stmt, ok. 4 lata); gdy ich brak, używamy sumy EPS z 4 kwartałów. Rok bez danych albo z ujemną bazą pomijamy (młode spółki). Marża przed opodatkowaniem to informacja (O'Neil chce marż rosnących, nie podaje progu) — nie jest warunkiem. Średniej z 5 lat celowo nie używamy.");
    add("N", "New — nowe szczyty, produkty, zarząd", `cena nie dalej niż ${Math.abs(T.nearHigh)} % pod szczytem 52 tygodni`,
        num(s.pct_from_high_52w) ? (s.pct_from_high_52w >= 0 ? "cena na szczycie 52 tygodni" : `${Math.abs(s.pct_from_high_52w)}% poniżej szczytu 52 tyg.`) : "brak danych o szczycie 52 tyg.",
        "Nie szukamy „tanich” spółek po spadkach: największe wzrosty zaczynają się blisko nowych szczytów, po zbudowaniu bazy (cup, flat base); kupuje się przy wybiciu z pivotu (kolumna „Wybicie”). Tu mierzymy tylko cenę; „nowość” (produkt, zarząd) oceń sam z newsów.");
    const debt = num(s.debt_eq) ? `zadłużenie D/E ${s.debt_eq}` : "zadłużenie — brak danych";
    const flt = [num(s.shs_float) ? `float ${(s.shs_float / 1e6).toFixed(0)} mln akcji` : null, num(s.insider_own) ? `insiderzy ${s.insider_own}%` : null].filter(Boolean).join(", ");
    add("S", "Supply & demand — popyt i podaż", `popyt: Acc/Dis A lub B; podaż: zadłużenie D/E ≤ ${T.debtEq} (gdy znane); skup akcji ≥ 5 % r/r to dodatkowy plus`,
        `${s.accdis ? `Acc/Dis ${s.accdis}${num(s.accdis_rating) ? ` (percentyl ${s.accdis_rating})` : ""}` : "Acc/Dis — brak oceny"}; ${debt}${flt ? `; ${flt} (informacyjnie)` : ""}; ${num(s.shares_chg_pct) ? `liczba akcji ${pct(s.shares_chg_pct)} r/r${s.shares_chg_pct <= -5 ? " — skup akcji ✓" : ""}` : "skup akcji — brak danych"}`,
        "Ceny rosną, gdy popyt przeważa nad podażą — widać to po wolumenie (Acc/Dis to nasze przybliżenie Chaikina z 13 tyg., nie ocena IBD). O'Neil patrzy też na podaż: mało akcji w obrocie (mały float), wykupy akcji własnych, niskie zadłużenie i udział zarządu. Skup akcji własnych o 5–10 % r/r to silny sygnał zmniejszania podaży — pokazujemy go (kolumna „Skup akcji”, chip), ale nie wymagamy. Float i insiderów też pokazujemy, nie wymagamy (liderzy bywają duzi).");
    add("L", "Leader — lider czy maruda", `RS Rating ≥ ${T.rs} i silna grupa branżowa (≥ ${T.group}, gdy znana)`,
        num(s.rs_rating) ? `RS Rating ${s.rs_rating}${num(s.industry_rating) ? `, grupa branżowa ${s.industry_rating}` : ", grupa — brak danych"}${s.leader ? ", oznaczona jako ★ lider" : ""}` : "brak RS Rating (zbyt krótka historia)",
        `Kupuj liderów branży, nie maruderów — najlepiej lidera w najsilniejszej grupie. RS Rating porównuje 12-miesięczną siłę ceny (z podwójną wagą ostatniego kwartału) z resztą rynku — u nas: ${rsBasisText()}. Próg RS ustawiasz w Filtrach (🏆 CANSLIM).`);
    add("I", "Institutional sponsorship — instytucje", `instytucje posiadają ${T.instMin}–${T.instMax} % akcji i ich udział rośnie`,
        num(s.inst_own) ? `instytucje ${s.inst_own}%${num(s.inst_trans) ? `, zmiana w ostatnim kwartale ${pct(s.inst_trans)}` : ""}${s.inst_own > T.instData ? " — Finviz podaje > 100 %, to dane niewiarygodne (podwójne liczenie)" : s.inst_own > T.instMax ? " — przesadne obłożenie, spółka może być już „wykupiona”" : ""}` : "brak danych o instytucjach",
        "O'Neil szuka kilku solidnych funduszy z dobrymi wynikami i rosnącej ich liczby; brak instytucji to zły znak, ale przesadne obłożenie oznacza, że nie ma kto dokupić. Uwaga: Finviz daje tylko % akcji i jego zmianę, nie liczbę ani jakość funduszy — to słabe przybliżenie, sprawdź je np. w raportach 13F.");
    add("M", "Market direction — kierunek rynku", `S&P 500 i Nasdaq w trendzie wzrostowym (EMA10 > EMA20 tygodniowa) albo po korekcie z potwierdzonym Follow-Through Day, i mniej niż ${T.distDays} dni dystrybucji`,
        regime === "uptrend" ? `rynek w trendzie wzrostowym${mkt && mkt.ftd ? " (przez potwierdzony Follow-Through Day)" : ""}${num(distDays) ? `, dni dystrybucji (max z indeksów${mkt && mkt.ftd ? ", liczone od FTD" : ""}): ${distDays}` : ""}` : regime === "correction" ? "rynek w korekcie (brak potwierdzonego Follow-Through Day)" : "brak danych o rynku",
        "Ok. 3 na 4 akcje podąża za rynkiem. Nawet najlepsza spółka ma małe szanse w korekcie — dlatego przy korekcie wynik nie przekroczy 6/7. O'Neil uznaje 4–5 dni dystrybucji w kilka tygodni za sygnał szczytu rynku (u nas okno 25 sesji), nawet gdy trend jest jeszcze wzrostowy.");
    return { score: c.score, known: c.known, rows };
}

function canslimSheetHtml(s, mkt) {
    const e = canslimExplain(s, mkt);
    const mark = ok => (ok === true ? "✓" : ok === false ? "✗" : "?");
    const verdict = ok => (ok === true ? "spełnione" : ok === false ? "niespełnione" : "brak danych");
    return `<p class="cs-intro">Spełnione: <b>${e.score}/7</b> (znane kryteria: ${e.known}). Poniżej liczby, na których opiera się każda litera, i krótka lekcja z „How to Make Money in Stocks”.</p>`
        + e.rows.map(r => `<section class="cs-row ${r.ok === true ? "ok" : r.ok === false ? "no" : "na"}"><header><span class="cs-key">${r.key}</span><b>${escapeHtml(r.name)}</b><span class="cs-verdict">${mark(r.ok)} ${verdict(r.ok)}</span></header>`
            + `<p><i>Mamy:</i> ${escapeHtml(r.have)}</p><p><i>Reguła:</i> ${escapeHtml(r.rule)}</p><p class="cs-lesson"><i>Czego uczy O'Neil:</i> ${escapeHtml(r.lesson)}</p></section>`).join("")
        + `<p class="cs-note">To heurystyka z danych Finviz / Yahoo, nie dokładne oceny IBD — zweryfikuj na wykresie i w raportach spółki. Informacja pomocnicza, nie rekomendacja.</p>`;
}

function openCanslimSheet(ticker) {
    const s = findStock(ticker);
    if (!s) return;
    const mkt = canslimMarket();
    const c = canslimInfo(s, mkt);
    showSheet(`${escapeHtml(ticker)} — CANSLIM ${c.known >= 4 ? c.score + "/7" : "(za mało danych)"}`, canslimSheetHtml(s, mkt));
}

function canslimLettersHtml(c) {
    return `<span class="cs-letters">${CANSLIM_KEYS.map(k => `<span class="cs-l ${c.flags[k] === true ? "on" : c.flags[k] === false ? "off" : ""}" title="${escapeHtml(canslimHelp(k))}">${k}</span>`).join("")}</span>`;
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
    if (s.eps_accel === true) add("", "↗ Akceleracja", "rt-80", `Tempo wzrostu zysków rośnie: EPS ${s.eps_q0_yoy}% r/r w ostatnim kwartale vs ${s.eps_q1_yoy}% w poprzednim`);
    if (has(s.shares_chg_pct) && s.shares_chg_pct <= -5) add("", `Skup ${s.shares_chg_pct}%`, "rt-80", `Liczba akcji spadła o ${Math.abs(s.shares_chg_pct)}% w rok (skup akcji własnych = mniejsza podaż)`);
    if (s.dist_top === true) add("", "⚠ Dystrybucja", "rt-20", `Dystrybucja bez wzrostu ceny (tydzień do ${s.dist_date}): najwyższy tygodniowy wolumen od dołka trendu (×${s.dist_vol_ratio}), a cena prawie bez zmian albo zamknięta w dolnej połowie zakresu`);
    if (s.leader === true) add("", "★ Lider", "rt-90", "Lider: RS ≥ 80, silna grupa, blisko szczytu 52 tyg.");
    return chips;
}

function ratingChipsHtml(s) {
    return ratingChips(s).map(c => `<span class="rchip ${c.cls}${c.action ? " rchip-link" : ""}"${c.action ? ` data-action="${c.action}" data-ticker="${escapeHtml(s.ticker)}" role="button" tabindex="0"` : ""} title="${escapeHtml(c.title || "")}">${c.label ? `<i>${escapeHtml(c.label)}</i>` : ""}${escapeHtml(c.value)}</span>`).join("");
}

// Ramka formacji jak „Cup with Handle / Flat Base” w MarketSurge: typ, pivot, długość, głębokość, rączka, VCP. "" bez otwartej bazy.
const BASE_STATUS_PL = { WATCHLIST: "WATCHLIST — pod pivotem", VALID_BREAKOUT: "WYBICIE potwierdzone", EXTENDED: "ROZCIĄGNIĘTA (> +5 % nad pivotem)", FAULTY_REJECTED: "ODRZUCONA wg reguł" };

function baseBoxData(s) {
    if (!s.base_type) return null;
    const rows = [["Pivot", Number.isFinite(s.pivot) ? money(s.pivot) : "—"]];
    if (Number.isFinite(s.base_weeks)) rows.push(["Długość", `${s.base_weeks} tyg.`]);
    if (Number.isFinite(s.base_depth_pct)) rows.push(["Głębokość", `${s.base_depth_pct}%`]);
    if (s.base_type === "cup") rows.push(["Rączka", s.base_handle ? "tak" : "brak — ryzykowny setup (z rączką szansa większa)"]);
    if (s.vcp) rows.push(["VCP", "tak"]);
    if (Number.isFinite(s.base_prior_uptrend_pct)) rows.push(["Wzrost przed bazą", `+${s.base_prior_uptrend_pct}%${s.base_prior_uptrend_pct >= 30 ? "" : " (< 30%)"}`]);
    if (s.base_rs_prior_up === true || s.base_rs_prior_up === false) rows.push(["Linia RS przed bazą", s.base_rs_prior_up ? "rosła" : "nie rosła"]);
    if (BUYABLE_BASES.includes(s.base_type) && Number.isFinite(s.base_buy_zone_max)) rows.push(["Strefa kupna do", `${money(s.base_buy_zone_max)} (pivot +5%)`]);
    if (BUYABLE_BASES.includes(s.base_type) && Number.isFinite(s.base_stop_8pct)) rows.push(["Stop −8% od pivotu", money(s.base_stop_8pct)]);
    if (BOX_BASES.includes(s.base_type) && Number.isFinite(s.box_stop)) {
        rows.push(["Stop z bazy (dół środka)", `${money(s.box_stop)} (−${s.box_stop_pct}% od pivotu)`]);
        if (Number.isFinite(s.box_t1) && Number.isFinite(s.box_t2)) rows.push(["Podział na 3", `dolna ${money(s.box_low)}–${money(s.box_t1)} (za późno) · środek ${money(s.box_t1)}–${money(s.box_t2)} (stop) · górna ${money(s.box_t2)}–${money(s.pivot)} (za wcześnie)`]);
    }
    if (BOX_BASES.includes(s.base_type) && Number.isFinite(s.box_brk_wick_pct)) {
        const w = s.box_brk_wick_pct, v = s.box_brk_vol_wow_pct;
        rows.push(["Świeca wybicia", `górny knot ${w}% zakresu${w > 50 ? " ⚠ > 50 % — presja sprzedaży" : ""}; wolumen ${Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v}% vs poprzedni tydzień${v < 30 ? " (< +30 %)" : ""}` : "—"}; ${s.box_brk_hi10 ? "zamknięcie = 10-tyg. maksimum ✓" : "poniżej 10-tyg. maksimum"}`]);
    }
    if (s.base_status) rows.push(["Status", BASE_STATUS_PL[s.base_status] || s.base_status]);
    if (s.base_rejection) rows.push(["Odrzucona", s.base_rejection]);
    if (s.base_on_base) rows.push(["Etap", `baza na bazie (${s.base_stage}. etap)`]);
    if (!BUYABLE_BASES.includes(s.base_type)) rows.push(["Uwaga", "korekta, nie baza do zakupu"]);
    if (Number.isFinite(s.base_mkt_dd_pct) && s.base_mkt_dd_pct >= 7) rows.push(["S&P w bazie", `−${s.base_mkt_dd_pct}%`]);
    if (Number.isFinite(s.pct_to_pivot)) rows.push([s.pct_to_pivot >= 0 ? "Do pivotu" : "Nad pivotem", `${s.pct_to_pivot >= 0 ? "+" : ""}${Math.abs(s.pct_to_pivot)}%`.replace("+-", "")]);
    return { title: `${BASE_LABELS_PL[s.base_type] || s.base_type}${s.base_type === "cup" && s.base_handle ? " z rączką" : s.base_type === "cup" ? " bez rączki" : ""}${s.base_on_base ? " · baza na bazie" : ""}`, rows };
}

function baseBoxHtml(s) {
    const d = baseBoxData(s);
    return d ? `<b>${escapeHtml(d.title)}</b>${d.rows.map(([k, v]) => `<span><i>${escapeHtml(k)}</i>${escapeHtml(v)}</span>`).join("")}` : "";
}

// Jedna linia „czy to już ten moment?” pod tytułem wykresu: dystans do wybicia, baza, wolumen, RS, rynek, wyniki.
function readinessLine(s, regime, patterns = true) {
    const out = [];
    const short = a => `${a.icon} ${a.label} — ${a.why.split(/(?<=[.!?])\s/)[0]}`;   // pierwsze zdanie; całość po kliknięciu etykiety
    if (patterns && s.action_w) out.push(`Tydzień: ${short(s.action_w)}`);
    if (s.position) {
        const p = s.position;
        out.push(`💼 ${fmtPct(p.pl_pct)}${p.r !== null ? ` · ${p.r.toFixed(1)}R` : ""}${p.to_stop_pct !== null ? ` · stop ${p.stop_hit ? "PRZEBITY" : fmtPct(p.to_stop_pct)}` : ""}`);
    }
    if (s.position && s.macd_advice && s.macd_advice.code !== "NA") out.push(`MACD: ${s.macd_advice.short}`);
    if (patterns && s.climax_top === true) out.push(`⚠ sell climax top (tydz. ${s.climax_date}, potwierdzenia ${s.climax_conf ?? 0}/4)`);
    if (patterns && s.dist_top === true && !(s.action_w && ["DIST", "TRIM"].includes(s.action_w.code))) out.push(`⚠ dystrybucja bez wzrostu ceny (tydz. ${s.dist_date}, wolumen ×${s.dist_vol_ratio})`);
    const b = patterns ? s.brk : null;
    if (!patterns) { /* bez analizy wzorców: bez baz, flag i wybicia */ }
    else if (b) out.push(b.dist !== null ? `Do wybicia: ${b.dist.toFixed(1)}%` : (b.rank === 0 ? "Wybicie świeże" : "Przy poziomie"));
    else out.push("Brak sygnału wybicia");
    if (patterns && s.base_type) out.push(BUYABLE_BASES.includes(s.base_type) ? `${BASE_LABELS_PL[s.base_type] || s.base_type}${s.vcp ? " + VCP" : ""}${s.base_on_base ? " (baza na bazie)" : ""}` : `${BASE_LABELS_PL[s.base_type] || s.base_type} (nie baza do zakupu)`);
    if (patterns && BUYABLE_BASES.includes(s.base_type) && Number.isFinite(s.pct_to_pivot) && s.pct_to_pivot < 0) {
        const over = -s.pct_to_pivot;
        out.push(over > 5 ? `⚠ ${over.toFixed(1)}% nad pivotem — za późno wg reguły +5 %` : `${over.toFixed(1)}% nad pivotem (strefa zakupu do +5 %)`);
    }
    if (patterns && s.tlw_pattern) out.push(s.tlw_pattern === "flaga" ? "flaga" : "korytarz");
    if (!patterns) { /* pominięte */ }
    else if (s.tlw_state === "bez wolumenu") out.push("zamknięcie nad oporem bez wolumenu — to jeszcze nie wybicie");
    else if (Number.isFinite(s.tlw_vol_ratio)) out.push(`wolumen wybicia ×${s.tlw_vol_ratio}${s.tlw_vol_ok ? " ✓" : " (słaby)"}`);
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

// NATR (Blueprint: konsolidacja < 8): maks. tygodniowy NATR spółki; bez wartości (za krótka historia) odpada, gdy ustawiono granicę.
function natrOk(natr, max) {
    if (!Number.isFinite(max)) return true;
    return Number.isFinite(natr) && natr <= max;
}

function applyCommonFilters(stocks, search, sector, scoreMin, scoreMax, natrMax, risingOnly = false) {
    const q = (search || "").trim().toLowerCase();
    return stocks.filter(s => {
        if (sector && s.sector !== sector) return false;
        if (!scoreInRange(s.score, scoreMin, scoreMax)) return false;
        if (!natrOk(s.natr_w, natrMax)) return false;
        if (risingOnly && !(s.rise_n >= 2)) return false;   // bez policzonych pudełek (wykresy jeszcze się ładują) odpada
        if (!q) return true;
        return s.ticker.toLowerCase().includes(q) || (s.company || "").toLowerCase().includes(q);
    });
}

// Adres strony GitHub Actions workflow'u (ręczne odpalenie "Run workflow"). Na GitHub Pages
// (owner.github.io/repo/) owner i repo wynikają z adresu; gdzie indziej — wartość awaryjna.
function githubActionsUrl(loc, workflow = "daily_watchlist.yml") {
    let slug = FALLBACK_REPO;
    const m = loc && /^([a-z0-9-]+)\.github\.io$/i.test(loc.hostname || "") && (loc.pathname || "").split("/")[1];
    if (m) slug = `${loc.hostname.split(".")[0]}/${loc.pathname.split("/")[1]}`;
    return `https://github.com/${slug}/actions/workflows/${workflow}`;
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
const pln0 = v => (Number.isFinite(v) ? (v < 0 ? "−" : "") + Math.abs(Math.round(v)).toLocaleString("pl-PL") + " zł" : "—");
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
    return `${BASE_LABELS_PL[s.base_type] || s.base_type}${s.base_type === "cup" && s.base_handle ? " z rączką" : s.base_type === "cup" ? " bez rączki" : ""} −${s.base_depth_pct}% · ${s.base_weeks} tyg.${s.vcp ? " · VCP" : ""}${s.base_on_base ? " · baza na bazie" : ""}${s.base_mkt_dd_pct >= 7 ? ` · S&P −${s.base_mkt_dd_pct}%` : ""}`;
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
    trend: ["Trendlinia", "tlw_state", s => `<td${s.tlw_state === "wybicie" ? ` class="positive"` : ""}>${s.tlw_state ? (s.tlw_state === "wybicie" ? `▲ wybicie${Number.isFinite(s.tlw_vol_ratio) ? ` ×${s.tlw_vol_ratio} wol.${s.tlw_vol_ok ? " ✓" : ""}` : ""}` : "przy oporze") : ""}${s.tlw_pattern ? ` <span class="muted small">${escapeHtml(s.tlw_pattern)}</span>` : (s.tlw_state ? "" : "—")}</td>`, "Wybicie / zbliżenie do linii oporu (flaga / korytarz na świecach tygodniowych) i wykryty kształt"],
    upside: ["Upside", "upside_main", s => {
        const u = upsideMain(s);
        return `<td class="${Number.isFinite(u) ? (u > 0 ? "positive" : "negative") : ""}" title="Cel ${money(targetMain(s))} (${Number.isFinite(s.finviz_upside_pct) ? "Finviz" : "Yahoo"})">${fmtPct(u, 0)}</td>`;
    }, "Różnica między średnią ceną celu analityków (Finviz; Yahoo, gdy brak) a ceną dziś"],
    rev30: ["Rewizje EPS 30d", "eps_rev30_pct", s => pctCell(s.eps_rev30_pct), "Zmiana konsensusu EPS na bieżący rok obrachunkowy w ostatnich 30 dniach (rewizje w górę = analitycy podnoszą prognozy)"],
    rev90: ["Rewizje EPS 90d", "eps_rev90_pct", s => pctCell(s.eps_rev90_pct), "To samo w ostatnich 90 dniach"],
    rsLine: ["Linia RS", "rs_line_dist_pct", s => `<td${s.rs_line_state === "przed ceną" ? ` class="positive"` : ""} title="Linia RS (cena / S&P 500): odległość od maksimum z 52 tyg.; „przed ceną” = RS na maksimum, a cena jeszcze nie">${s.rs_line_state ? (s.rs_line_state === "przed ceną" ? "● RS przed ceną" : "● RS na szczycie") + " " : ""}${Number.isFinite(s.rs_line_dist_pct) ? `<span class="muted small">${fmtPct(s.rs_line_dist_pct)}</span>` : "—"}</td>`, "Linia RS: stan (RS na maksimum 52 tyg. przed/razem z ceną) i odległość od jej maksimum"],
    macd: ["MACD tyg.", "macd_w_above", s => s.macd_w_above === true ? `<td class="positive" title="Tygodniowe MACD (12, 26, 9) leży nad linią sygnałową">Tak</td>` : s.macd_w_above === false ? `<td class="negative" title="Tygodniowe MACD (12, 26, 9) leży pod linią sygnałową">Nie</td>` : `<td class="muted"></td>`,
        "Czy tygodniowe MACD (12, 26, 9) jest nad linią sygnałową — zwykła informacja Tak / Nie, nie wpływa na żadną ocenę"],
    natr: ["NATR", "natr_w", s => {
        const g = natrGrade(s.natr_w), d = Number.isFinite(s.natr_d) ? `, dzienny (ATR z Finviza): ${s.natr_d.toFixed(1)} %` : "";
        return Number.isFinite(s.natr_w) ? `<td class="${g.cls === "warn" ? "" : g.cls}" title="NATR tygodniowy = ATR(14) / cena: ${s.natr_w.toFixed(1)} % (${g.label})${d}. Blueprint: konsolidacja ma mieć NATR < 8.">${s.natr_w.toFixed(1)}%</td>` : `<td class="muted" title="Za krótka historia tygodniowa"></td>`;
    }, "NATR tygodniowy (ATR 14 tyg. w % ceny): im niższy, tym ciaśniejsze i spokojniejsze notowania. Blueprint: konsolidacja < 8 %."],
    glb: ["GLB", "glb_dist", s => {
        const d = GLB_STATE_LABELS[s.glb_state];
        if (!d || !Number.isFinite(s.glb_line)) return `<td class="muted" title="Brak green line (rekord wszech czasów stoi krócej niż 3 miesiące albo brak danych)"></td>`;
        const tip = `Green line ${s.glb_line.toFixed(2)} (rekord z ${s.glb_month}, stoi ${s.glb_age} mies.) · stop ${Number.isFinite(s.glb_stop) ? s.glb_stop.toFixed(2) : "?"}`;
        const dist = s.glb_state === "WAIT" && Number.isFinite(s.glb_dist) ? ` · ${s.glb_dist.toFixed(1).replace(".", ",")} %` : "";
        return `<td class="${d[1]}" title="${escapeHtml(tip)}">${d[0]}${dist}</td>`;
    }],
    darvas: ["Darvas", "darvas_rank", s => {
        const d = DARVAS_STATE_LABELS[s.rise_state];
        if (!d) return `<td class="muted" title="${escapeHtml(s.rise_text || "brak boxów Darvasa")}"></td>`;
        const lvl = Number.isFinite(s.dv_top) ? ` · kup > ${s.dv_top.toFixed(2)}` : "";
        const dist = s.rise_state === "READY" && Number.isFinite(s.rise_dist) ? `${lvl} (${s.rise_dist.toFixed(1).replace(".", ",")} %)` : "";
        return `<td class="${d[1]}" title="${escapeHtml(s.rise_text || "")}">${d[0]}${dist}</td>`;
    }],
    rise2: ["Boxy ↑", "rise_n", s => Number.isFinite(s.rise_n) && s.rise_n >= 1
        ? `<td class="${s.rise_n >= 2 ? "positive" : ""}" title="${escapeHtml(s.rise_n >= 2 ? `Akcja wzrostowa wg Dar-Card: ${s.rise_n} kolejne, coraz wyższe pudełka. ` : "Jedno pudełko — jeszcze bez dwóch rosnących. ")}${escapeHtml(s.rise_text || "")}">${s.rise_n >= 2 ? "↑↑ " : ""}${s.rise_n}</td>` : `<td class="muted"></td>`,
        "Ile kolejnych, coraz wyższych pudełek Darvasa (dzienne zamknięcia, 12 mies.) układa spółka. ≥ 2 = akcja wzrostowa wg Dar-Card (kupno po dwóch rosnących pudełkach). Filtr: Filtry → Boxy"],
    bp: ["Blueprint", "bp_score", s => {
        const b = s.bp || blueprintInfo(s);
        if (!b.known) return `<td class="muted"></td>`;
        const tip = b.checks.map(c => `${c.ok === true ? "✓" : c.ok === false ? "✗" : "?"} ${c.label}`).join("\n");
        const cls = b.score >= 5 ? "positive" : b.score <= 2 ? "negative" : "";
        return `<td class="${cls}" title="${escapeHtml(tip)}">${b.score}/${b.total}</td>`;
    }, "Kryteria wejścia z Blueprintu (informacja): cena nad 20-tyg. średnią, MACD nad sygnałem, zamknięcie = 10-tyg. maksimum, świeca +5…+20 %, wolumen +30 % w/w, NATR < 8. Najedź, by zobaczyć które."],
    dist: ["Dystrybucja", "dist_vol_ratio", s => s.dist_top === true ? `<td class="negative" title="Dystrybucja bez wzrostu ceny (tydzień do ${escapeHtml(s.dist_date || "")}): najwyższy tygodniowy wolumen od dołka trendu ×${s.dist_vol_ratio}, zamknięcie ${fmtPct(s.dist_change_pct)}">⚠ ×${s.dist_vol_ratio}</td>` : `<td class="muted"></td>`,
        "Dystrybucja bez wzrostu ceny („mielenie”, O'Neil, świece tygodniowe): w ostatnich 2 tygodniach najwyższy wolumen tygodniowy od dołka trendu (≥ 1,5× średniej), a cena zamyka się prawie bez zmian albo w dolnej połowie zakresu, blisko szczytu rajdu. Podaż tłumi popyt. Heurystyka — sprawdź wykres"],
    eps3y: ["EPS 3 lata", "eps_fy0", s => annualEpsGrowth(s).values.some(Number.isFinite)
        ? `<td title="Roczny wzrost EPS (lata obrotowe z Yahoo; bez nich suma 4 kwartałów): najnowszy rok / rok wcześniej / 2 lata wcześniej (kryterium A: ≥ 25 % co roku)">${annualEpsGrowth(s).values.map(v => (Number.isFinite(v) ? `<span class="${v >= 25 ? "positive" : "negative"}">${v > 0 ? "+" : ""}${v.toFixed(0)}</span>` : "—")).join(" / ")}</td>` : `<td class="muted">—</td>`,
        "Roczny wzrost EPS (suma 4 kwartałów) w 3 ostatnich latach, od najświeższego; O'Neil: ≥ 25 % w każdym roku"],
    buyback: ["Skup akcji", "shares_chg_pct", s => Number.isFinite(s.shares_chg_pct) ? `<td${s.shares_chg_pct <= -5 ? ` class="positive"` : ""} title="Zmiana liczby akcji w rok (Yahoo); ujemna = skup akcji własnych, ≤ −5 % to silny sygnał zmniejszania podaży">${s.shares_chg_pct > 0 ? "+" : ""}${s.shares_chg_pct.toFixed(1)}%${s.shares_chg_pct <= -5 ? " ✓" : ""}</td>` : `<td class="muted">—</td>`,
        "S z CANSLIM: zmiana liczby akcji r/r; ujemna = skup akcji (≤ −5 % = silny sygnał)"],
    cx: ["Climax", "climax_conf", s => s.climax_top === true ? `<td class="negative" title="Sell climax top (tygodniówka) ${escapeHtml(s.climax_date || "")}: +${s.climax_runup_pct}% w 3 tyg., tydzień +${s.climax_week_gain_pct}%, wolumen ×${s.climax_vol_ratio}">⚠ ${s.climax_conf ?? 0}/4</td>` : `<td class="muted"></td>`,
        "Sell climax top (O'Neil, świece tygodniowe): w ostatnich 2 tygodniach wzrost ≥ 25 % w 1–3 tyg. z największym zyskiem tygodniowym, najszerszym zakresem i najwyższym wolumenem od dołka trendu. Liczba = potwierdzenia z 4: luka wyczerpania, zamknięcie w dolnej połowie, ≥ 70 % nad 200-dniową, 3.+ baza. Heurystyka — sprawdź wykres"],
    cs: ["CANSLIM", "cs", s => s.cs === null || s.cs === undefined ? `<td class="muted"></td>` : `<td class="cs-cell ${s.cs >= 5 ? "positive" : ""}" title="Kliknij, aby zobaczyć wyjaśnienie każdej litery"><strong>${s.cs}/7</strong> ${canslimLettersHtml(s.canslim)}</td>`,
        "Lista CANSLIM: ile z 7 kryteriów C A N S L I M spełnia spółka (zielone litery = spełnione, czerwone = nie, szare = brak danych)"],
    actW: ["Tydz.", "act_rank_w", s => actCell(s, "action_w"), "Co robić wg wykresu TYGODNIOWEGO (baza flat / cup, flaga tygodniowa) — kliknij po uzasadnienie"],
    brk: ["Wybicie", "brk_sort", s => {
        if (!s.brk) return `<td class="muted"></td>`;
        const cls = s.brk.rank === 0 ? "positive" : "";
        const head = s.brk.dist !== null ? `<strong>${s.brk.dist.toFixed(1)}%</strong>` : `<strong>▲</strong>`;
        return `<td class="${cls}" title="${escapeHtml(s.brk.reasons.map(r => r.text).join(" · "))}">${head} <span class="small">${escapeHtml(s.brk.reasons.map(r => r.text).join(" · "))}</span></td>`;
    }, "Ile % brakuje do wybicia (opór flagi / pivot bazy / moja linia z alertem) i powody; ▲ = świeże wybicie"],
    pos: ["Pozycja", "pos_pl_pct", s => s.position
        ? `<td class="${s.position.stop_hit ? "negative" : (s.position.pl_pct >= 0 ? "positive" : "negative")}" title="Moja pozycja: wejście ${money(s.position.entry)}, stop ${money(s.position.stop)}">💼 ${fmtPct(s.position.pl_pct)}${s.position.r !== null ? ` · ${s.position.r.toFixed(1)}R` : ""}</td>`
        : `<td class="muted"></td>`, "Moja pozycja: zysk od wejścia i wielokrotność ryzyka (R)"],
    pbox: ["Box 📌", "pbox_rank", s => s.pbox
        ? `<td class="${s.pbox.state === "ABOVE" ? "positive" : s.pbox.state === "INSIDE" ? "" : "negative"}" title="Przypięty box ${s.pbox.bottom}–${s.pbox.top}: ${escapeHtml(s.pbox.text)}">📌 ${s.pbox.state === "ABOVE" ? "wybił" : s.pbox.state === "INSIDE" ? "w boxie" : s.pbox.state === "ZONE" ? "strefa!" : "EXIT"}</td>`
        : `<td class="muted"></td>`, "Przypięty (przytrzymaj box) box do monitorowania: wybił / w boxie / w strefie zagrożenia / exit"],
    posPl: ["Zysk", "pos_pl_pct", s => s.position
        ? `<td class="${s.position.pl_pct >= 0 ? "positive" : "negative"}"><strong>${fmtPct(s.position.pl_pct)}</strong>${s.position.pl_usd !== null ? ` · <span class="small">${money0(s.position.pl_usd)}</span>` : ""}</td>` : `<td class="muted">—</td>`, "Zysk / strata od ceny wejścia (w % i w $)"],
    posR: ["R", "pos_r", s => s.position && s.position.r !== null ? `<td class="${s.position.r >= 0 ? "positive" : "negative"}"><strong>${s.position.r.toFixed(2)}R</strong></td>` : `<td class="muted">—</td>`, "Zysk w wielokrotnościach początkowego ryzyka (cena − wejście) / (wejście − stop)"],
    posToStop: ["Do stopu", "pos_to_stop_pct", s => s.position && s.position.to_stop_pct !== null
        ? `<td class="${s.position.stop_hit ? "negative" : ""}">${s.position.stop_hit ? "🛑 STOP" : fmtPct(s.position.to_stop_pct)}</td>` : `<td class="muted">—</td>`, "O ile % cena musi spaść do stopu"],
    posMacd: ["MACD / stop", null, s => `<td class="pos-macd" data-pos-macd="${escapeHtml(s.ticker)}"><span class="muted small">…</span></td>`, "Czy przestawić stop: MACD tygodniowy pod sygnałem + zamknięcie tygodnia = stop pod dołek tej świecy"],
    posMini: ["Wykres + MACD", null, s => `<td class="pos-mini" data-pos-mini="${escapeHtml(s.ticker)}"></td>`, "Miniatura tygodniowa: cena, wejście, stop, proponowany stop; pod spodem MACD (histogram, MACD, sygnał); ▼ = przecięcie w dół"],
    posEntry: ["Wejście", "pos_entry", s => `<td>${s.position ? money(s.position.entry) : "—"}</td>`],
    posStop: ["Stop", "pos_stop", s => `<td>${s.position && s.position.stop !== null && s.position.stop !== undefined ? money(s.position.stop) : "—"}</td>`],
    posShares: ["Akcje", "pos_shares", s => `<td>${s.position && s.position.shares !== null ? fmtShares(s.position.shares) : "—"}</td>`],
    posValue: ["Wartość", "pos_value", s => `<td>${s.position && s.position.value !== null ? money0(s.position.value) : "—"}</td>`],
    posRisk: ["Ryzyko do stopu", "pos_risk_usd", s => `<td>${s.position && s.position.risk_usd !== null ? money0(s.position.risk_usd) : "—"}</td>`, "Początkowe ryzyko: (wejście − stop) · liczba akcji"],
    strat: ["Strategie", "strat_rank", s => `<td>${(s.strat || []).map(c => `<span class="strat-chip strat-${c}" title="${STRATEGIES[c][1]}">${STRATEGIES[c][0]}</span>`).join(" ") || `<span class="muted">—</span>`}</td>`, "Z których strategii (zakładek) spółka przechodzi filtry: B = Bazy blisko pivotu"],
    toggle: ["", null, s => `<td class="card-toggle"><button type="button" class="card-chev" aria-label="Pokaż / ukryj szczegóły" aria-expanded="${openCards.has(s.ticker)}">▾</button></td>`],
    fchart: ["", null, s => `<td class="card-fchart" data-fchart="${escapeHtml(s.ticker)}"></td>`],
    earnings: ["Wyniki", "earnings", s => earningsCell(s)],
    tv: ["TV", null, s => `<td><a class="tv-row-btn" href="${tvUrlFor(s.ticker)}" target="_blank" rel="noopener">TV</a></td>`],
};
const actCell = (s, key) => s[key]
    ? `<td class="act-cell act-${s[key].tone}${s.action_tf === s[key].tf ? " act-primary" : ""}" title="${escapeHtml(s[key].why)}"><strong>${s[key].icon} ${s[key].label}</strong><span class="act-why">${escapeHtml(s[key].why.split(/(?<=[.!?])\s/)[0])}</span></td>` : `<td class="muted"></td>`;
const LEAD = ["rank", "fav", "ticker", "score", "company", "sector"];
// Wszystkie zakładki pokazują TE SAME kolumny (zakładka = strategia = inny filtr i inne domyślne sortowanie); kolumna "Strategie" mówi, z których strategii spółka przechodzi.
const ALL_COLUMNS = [...LEAD, "actW", "cs", "cx", "dist", "macd", "natr", "bp", "darvas", "rise2", "glb", "brk", "pos", "pbox", "strat", "toggle", "fchart", "cap", "price", "sma50", "sma200", "high52", "epsThis", "epsNext", "eps5", "epsNext5", "epsq", "eps3y", "epsStab", "buyback", "rs", "epsr", "comp", "leader", "grp", "ad", "inst", "rsLine", "r3", "r6", "r12",
    "dollarVol", "adr", "recom", "upside", "ptMean", "ptLow", "ptHigh", "analysts", "rev30", "rev90", "baseType", "depth", "baseWeeks", "pivot", "toPivot", "base", "trend", "earnings", "tv"];
const POS_COLUMNS = ["posPl", "posR", "posToStop", "posMacd", "posMini", "posEntry", "posStop", "posShares", "posValue", "posRisk"];
const TAB_COLUMNS = {
    LIST: ALL_COLUMNS, CS: ALL_COLUMNS, FAV: ALL_COLUMNS, POS: [...LEAD, ...POS_COLUMNS, ...ALL_COLUMNS.filter(id => !LEAD.includes(id) && id !== "pos")], WATCH: ALL_COLUMNS, BASES: ALL_COLUMNS,
};

// Widok dzielony (jak w TC2000: wąska lista po lewej, wykres po prawej) — w wąskiej liście tylko kluczowe kolumny.
const SPLIT_MIN_WIDTH = 1000, SPLIT_MIN_HEIGHT = 560;
const COMPACT_COLUMNS = ["fav", "ticker", "score", "actW", "cs", "pbox"];
const TAB_COLUMNS_COMPACT = {
    LIST: COMPACT_COLUMNS, CS: ["fav", "ticker", "score", "actW", "cs"], FAV: COMPACT_COLUMNS, POS: ["fav", "ticker", "posPl", "posMacd", "posMini"], WATCH: ["fav", "ticker", "darvas", "rise2", "comp"], BASES: COMPACT_COLUMNS,
};
let splitMode = false;
// Kolumny, które istnieją tylko dzięki analizie wzorców (bazy, pivot, flagi, wybicie, „Co robić”, climax) — znikają po jej wyłączeniu.
const PATTERN_COLUMNS = new Set(["actW", "cx", "dist", "brk", "baseType", "depth", "baseWeeks", "pivot", "toPivot", "base", "trend"]);
const columnsFor = tab => (splitMode ? TAB_COLUMNS_COMPACT[tab] : TAB_COLUMNS[tab]).filter(id => state.patterns || !PATTERN_COLUMNS.has(id));

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

// Zakładka Watchlisty: spółki z watchlists.json (ręczny workflow „Watchlisty”: listy = nazwa + filtr Finviz) z TYMI SAMYMI obliczeniami co główna lista —
// RS Rating, EPS Rating, Composite (percentyle wśród spółek ze wszystkich list), CANSLIM, „Co robić”, bazy — i wykresami tygodniowymi, żeby można było sortować po wynikach.
// Akcje wzrostowe wg Dar-Card: s.rise_n = liczba kolejnych, coraz wyższych pudełek (darvasRisingInfo na dziennych zamknięciach). Wykresy ładują się leniwie,
// więc znaczniki liczymy raz po załadowaniu (osobno dla głównej listy i dla Watchlist) i odświeżamy tabelę.
// risingState[which] = obiekt danych (state.data / watchData), który już otagowano; inny obiekt (np. po refreshDataIfStale, który podmienia dane
// po powrocie aplikacji z tła) = liczymy od nowa. risingPending blokuje równoległe ładowanie tego samego zestawu.
const risingState = { main: null, watch: null };
const risingPending = { main: null, watch: null };
function tagRising(stocks, charts) {
    stocks.forEach(s => {
        const c = charts && charts.stocks && charts.stocks[s.ticker];
        const r = c && Array.isArray(c.c) ? darvasRisingInfo(c.c, c.v) : null;
        s.rise_n = r ? r.n : null; s.rise_state = r ? r.state : null; s.rise_text = r ? r.text : ""; s.rise_dist = r ? r.distPct : null;
        // starszy plik bez pól dv_* z Pythona: poziomy karty z tych samych wykresów, żeby 📋 Zlecenia i kolumna „kup > X” też działały
        if (r && s.dv_tf !== "W") {   // stare pola dzienne nadpisujemy tygodniowymi
            const a = darCardAnalyze(c.c, c.v), st = a.status, tb = a.topmost;
            const natr = tb && Array.isArray(c.h) && Array.isArray(c.l) ? boxNatr(c.h, c.l, c.c, tb.i0, Math.min(tb.end ?? c.c.length - 1, c.c.length - 1)) : null;
            Object.assign(s, { dv_state: st.state, dv_n: r.n, dv_top: st.buyLine ?? null, dv_bottom: st.bottom ?? null, dv_zone: st.zoneLow ?? null, dv_stop: st.stop ?? null, dv_dist: r.distPct, dv_natr: natr, dv_tf: "W" });
        }
        s.darvas_rank = darvasRank(s);
    });
}

// Wyszukiwanie wg Dar-Card (książka, s. 11 i 139–142) — JEDYNY filtr Watchlist w tym trybie (bez score / NATR / sektora):
// „Kup teraz” = pierwsze tygodniowe zamknięcie nad górą najwyższego boxa po dwóch kolejnych rosnących boxach (s. 140);
// „Gotowe do kupna” = dwa kolejne rosnące boxy, cena w najwyższym, jeszcze nie wybita (s. 139 „Ready for buying”);
// „Trzymaj” = akcja w swoim najwyższym boxie albo nad nim po wybiciu, w rosnącej karcie (reguła A).
const DARVAS_STATE_LABELS = { BUY: ["🟢 KUP", "positive"], READY: ["🔵 GOTOWE", ""], HOLD: ["TRZYMAJ", ""], WAIT: ["1. box", "muted"], SELL: ["🔴 SPRZEDAJ", "negative"], OUT: ["poza boxem", "muted"] };
const DARVAS_PICKS = [
    ["go", "Do kupna", "Kup teraz + Gotowe do kupna: co najmniej dwa kolejne rosnące boxy (książka, s. 139–140)"],
    ["buy", "🟢 Kup teraz", "Zamknięcie tego tygodnia nad górą najwyższego boxa po dwóch kolejnych rosnących boxach; stop 10 % od razu"],
    ["ready", "🔵 Gotowe", "Dwa kolejne rosnące boxy, cena w najwyższym — kup po zamknięciu nad jego górą"],
    ["hold", "Trzymaj", "Rosnąca karta, cena w najwyższym boxie albo nad nim — wahania ignoruj (reguła A)"],
    ["all", "Wszystkie", "Bez filtra Darvasa — działają zwykłe filtry (score, NATR, sektor)"],
];
function darvasPick(s) {
    if (!(s.rise_n >= 2)) return null;
    return { BUY: "buy", READY: "ready", HOLD: "hold" }[s.rise_state] || null;
}
function darvasPickRows(stocks, pick) {
    if (pick === "all") return stocks;
    return stocks.filter(s => { const p = darvasPick(s); return pick === "go" ? p === "buy" || p === "ready" : p === pick; });
}
// Zlecenia jak u Darvasa (s. 11, 141): kupno stop tuż nad górą najwyższego boxa i od razu stop loss 10 % pod wejściem.
// Spółki „Gotowe” (zlecenie czeka na wybicie) i „Kup teraz” (wybicie w tym tygodniu — wejście na otwarciu). acct = konto z 💼 Pozycje (PLN), null = bez liczby akcji.
function darvasOrders(stocks, acct = null) {
    return stocks.filter(s => { const p = darvasPick(s); return (p === "ready" || p === "buy") && Number.isFinite(s.dv_top); })
        .map(s => {
            const buy = s.rise_state === "BUY", entry = buy && Number.isFinite(s.price) ? s.price : s.dv_top;
            const stop = Math.round(entry * (1 - DARVAS_ORDER_STOP_PCT / 100) * 100) / 100;
            return { ticker: s.ticker, kind: buy ? "buy" : "ready", entry, stop, dist: s.dv_dist, n: s.dv_n, bottom: s.dv_bottom, natr: s.dv_natr ?? null, size: acct ? positionSize(acct, entry, stop) : null };
        })
        .sort((a, b) => (a.kind === "buy" ? -1 : 0) - (b.kind === "buy" ? -1 : 0) || (a.dist ?? 99) - (b.dist ?? 99));
}
const DARVAS_ORDER_STOP_PCT = 10;
function ordersText(orders) {
    return orders.map(o => `${o.ticker}: ${o.kind === "buy" ? "kup na otwarciu ~" : "kup, gdy cena > "}${o.entry.toFixed(2)} (buy stop); stop loss: sprzedaj, gdy < ${o.stop.toFixed(2)}${o.size ? `, ${fmtShares(o.size.shares)} akcji` : ""}`).join("\n");
}
function ordersRowsHtml(orders, chartLink = false) {
    return orders.map(o => `<tr><td><b>${chartLink ? `<a href="#" data-plan-chart="${escapeHtml(o.ticker)}">${escapeHtml(o.ticker)}</a>` : escapeHtml(o.ticker)}</b>${o.kind === "buy" ? " 🟢" : ""}<small>${o.n}× box ↑${Number.isFinite(o.natr) ? ` · NATR ${o.natr.toFixed(1).replace(".", ",")} %` : ""}</small></td>`
        + `<td><b>${o.kind === "buy" ? "kup ~" : "kup, gdy &gt; "}${o.entry.toFixed(2)}</b><small>${o.kind === "buy" ? "na otwarciu (wybicie w tym tygodniu)" : Number.isFinite(o.dist) ? `cena musi wzrosnąć o ${o.dist.toFixed(1)} %` : ""}</small><small class="dn">sprzedaj, gdy &lt; ${o.stop.toFixed(2)} (−10 %)</small></td>`
        + `<td>${o.size ? `<b>${fmtShares(o.size.shares)}</b><small>${pln0(o.size.value_pln)}</small><small>ryz. ${o.size.risk_pln !== null ? pln0(o.size.risk_pln) : "—"}</small>` : "—"}</td>`
        + `<td><button type="button" class="btn box-mkpos" data-mkpos="${escapeHtml(o.ticker)}|${o.entry}|${o.bottom ?? o.stop}|0" title="Zapisz jako pozycję (wejście, stop 10 %)">💼</button></td></tr>`).join("");
}

// 📋 Plan na tydzień (user: „max 15–30 minut dziennie albo raz w tygodniu”; „przejdźmy całkowicie na tygodniowe ceny zamknięcia”):
// wejście z TYGODNIOWYCH boxów Darvasa (≥ 2 rosnące boxy, bez filtrów NATR / MACD — w teście tylko obniżały wynik) przez zlecenia kupna stop złożone w weekend, stop loss 10 % (Darvas),
// wyjście = przesuwanie stopu pod dołek świecy, w której tygodniowy MACD przeciął sygnał w dół. Nowe kupno tylko przy MACD tyg.
// nad sygnałem. Spółki z otwartą pozycją nie dostają zlecenia kupna. To eksperyment usera na małym kapitale (test S&P 500 PIT: słabiej niż SPY).
function planStocks(main, watch) {
    const seen = new Map();
    [...(main || []), ...(watch || [])].forEach(s => { if (!seen.has(s.ticker)) seen.set(s.ticker, s); });
    return [...seen.values()];
}
// Wyjście = przesuwanie stopu po MACD (Blueprint): gdy tygodniowy MACD przetnie sygnał w dół, stop idzie pod dołek tej świecy
// (macd_w_cross_low z Pythona); zamknięcie pod nim = sprzedaż. Stop początkowy 10 % pod wejściem (Darvas).
function positionDecision(p, s) {
    const price = s && Number.isFinite(s.price) ? s.price : null;
    const stop = Number.isFinite(p.stop) ? p.stop : null;
    const cl = s && Number.isFinite(s.macd_w_cross_low) ? s.macd_w_cross_low : null;
    if (price === null) return { code: "NA", label: "❔ Brak ceny", text: "spółki nie ma na listach — sprawdź ją u brokera" };
    if (stop !== null && price <= stop) return { code: "STOP", label: "✂ Stop", text: `cena ${price.toFixed(2)} ≤ stop ${stop.toFixed(2)} — sprzedaj, jeśli broker jeszcze tego nie zrobił` };
    if (s.macd_w_above === false && cl !== null) {
        const when = s.macd_w_cross_date ? ` (świeca do ${s.macd_w_cross_date})` : "";
        if (price <= cl) return { code: "SELL", label: "🔴 Sprzedaj", text: `cena ${price.toFixed(2)} zamknęła się pod dołkiem świecy, w której MACD tyg. przeciął sygnał w dół (${cl.toFixed(2)}${when}) — sprzedaj` };
        if (stop === null || cl > stop) return { code: "RAISE", label: `⬆ Podnieś stop do ${cl.toFixed(2)}`, text: `tygodniowy MACD przeciął sygnał w dół — stop pod dołek tej świecy${when}${stop !== null ? `, teraz ${stop.toFixed(2)}` : ""}`, newStop: cl };
        return { code: "HOLD", label: "🟢 Trzymaj", text: `MACD tyg. pod sygnałem, ale stop ${stop.toFixed(2)} jest już wyżej niż dołek świecy przecięcia (${cl.toFixed(2)})` };
    }
    if (s.macd_w_above === false) return { code: "HOLD", label: "🟡 Sprawdź stop", text: "MACD tyg. pod sygnałem — ustaw stop pod dołkiem świecy, w której go przeciął (dane po najbliższym odświeżeniu)" };
    if (s.macd_w_above === true) return { code: "HOLD", label: "🟢 Trzymaj", text: `MACD tyg. nad sygnałem${stop !== null ? `; stop ${stop.toFixed(2)} bez zmian` : ""}` };
    return { code: "HOLD", label: "🟢 Trzymaj", text: "brak tygodniowego MACD (krótka historia) — pilnuje tylko stop loss" };
}
function weeklyPlan(stocks, positions, acct = null) {
    const bySym = new Map(stocks.map(s => [s.ticker, s]));
    const held = Object.keys(positions || {}).filter(t => positions[t]);
    const heldSet = new Set(held);
    const all = darvasOrders(stocks.filter(s => !heldSet.has(s.ticker)), acct);
    // wejście: sama karta Darvasa (≥ 2 rosnące boxy) — filtry NATR < 8 i MACD przy wejściu usunięte (test S&P 500 PIT: +4,6 % → +11,3 % rocznie)
    const orders = all;
    const pos = held.map(t => {
        const p = positions[t], s = bySym.get(t) || null;
        const m = s ? positionMetrics(p, s.price) : null;
        return { ticker: t, company: s ? s.company : "", price: s ? s.price : null, entry: p.entry, stop: p.stop, pl: m ? m.pl_pct : null, ...positionDecision(p, s) };
    }).sort((a, b) => ["STOP", "SELL", "RAISE", "NA", "HOLD"].indexOf(a.code) - ["STOP", "SELL", "RAISE", "NA", "HOLD"].indexOf(b.code));
    return { orders, positions: pos };
}

// Widok wykresu: "" (Dar-Card czasowy), "card" (🃏 karta Darvasa z książki) albo "glb" (🟩 karta GLB) — przyciski wykluczają się.
function setChartView(v) {
    chartCardOn = v === "card"; chartGlbOn = v === "glb";
    try { localStorage.setItem("momentum_watchlist_chart_card", chartCardOn ? "1" : "0"); localStorage.setItem("momentum_watchlist_chart_glb", chartGlbOn ? "1" : "0"); } catch (e) { /* ignoruj */ }
    const cb = document.getElementById("chartCardBtn"), gb = document.getElementById("chartGlbBtn");
    if (cb) cb.classList.toggle("active", chartCardOn);
    if (gb) gb.classList.toggle("active", chartGlbOn);
}

function glbRowsHtml(orders) {
    return orders.map(o => `<tr><td><b><a href="#" data-plan-glb="${escapeHtml(o.ticker)}">${escapeHtml(o.ticker)}</a></b>${o.kind === "buy" ? " 🟢" : ""}<small>rekord ${escapeHtml(o.month || "?")}${Number.isFinite(o.age) ? ` · stoi ${o.age} mies.` : ""}</small></td>`
        + `<td><b>${o.kind === "buy" ? "kup ~" : "kup, gdy &gt; "}${o.entry.toFixed(2)}</b><small>${o.kind === "buy" ? "na otwarciu (wybicie w tym tygodniu)" : Number.isFinite(o.dist) ? `cena musi wzrosnąć o ${o.dist.toFixed(1)} %` : ""}</small><small class="dn">sprzedaj, gdy tydzień zamknie się &lt; ${o.stop.toFixed(2)} (1 % pod linią)</small></td>`
        + `<td>${o.size ? `<b>${fmtShares(o.size.shares)}</b><small>${pln0(o.size.value_pln)}</small><small>ryz. ${o.size.risk_pln !== null ? pln0(o.size.risk_pln) : "—"}</small>` : "—"}</td>`
        + `<td><button type="button" class="btn box-mkpos" data-mkpos="${escapeHtml(o.ticker)}|${o.entry}|${o.stop}|1" title="Zapisz jako pozycję (wejście, stop 1 % pod green line)">💼</button></td></tr>`).join("");
}
function glbOrdersText(orders) {
    return orders.map(o => `${o.ticker} (GLB): ${o.kind === "buy" ? "kup na otwarciu ~" : "kup, gdy cena > "}${o.entry.toFixed(2)} (buy stop); stop: sprzedaj, gdy tydzień zamknie się < ${o.stop.toFixed(2)}${o.size ? `, ${fmtShares(o.size.shares)} akcji` : ""}`).join("\n");
}

function renderPlanPanel() {
    const el = document.getElementById("planPanel");
    if (!el || !state.data) return;
    ensureRising("main"); ensureRising("watch");
    const stocks = planStocks(state.data.stocks, watchData ? watchData.stocks : []);
    const plan = weeklyPlan(stocks, state.pos, { ...state.acct, fx: usdPln() });
    const heldSet = new Set(Object.keys(state.pos || {}).filter(t => state.pos[t]));
    const glbAll = glbOrders(stocks.filter(s => !heldSet.has(s.ticker)), { ...state.acct, fx: usdPln() }, positionSize);
    const glbHasData = stocks.some(s => s.glb_state !== undefined);
    const loading = risingPending.main || risingPending.watch;
    const mkt = state.data.market;
    const weak = mkt && (mkt.m_regime || mkt.regime) === "correction";
    const q = (state.search || "").trim().toLowerCase();
    const match = t => !q || t.toLowerCase().includes(q);
    const orders = plan.orders.filter(o => match(o.ticker));
    const glb = glbAll.filter(o => match(o.ticker));
    const acctOk = orders.some(o => o.size);
    const posRows = plan.positions.filter(p => match(p.ticker)).map(p => `<tr class="plan-${p.code.toLowerCase()}"><td><b><a href="#" data-plan-chart="${escapeHtml(p.ticker)}">${escapeHtml(p.ticker)}</a></b>`
        + `<small>${Number.isFinite(p.pl) ? `${p.pl > 0 ? "+" : ""}${p.pl.toFixed(1)} %` : ""}</small></td><td><b>${p.label}</b><small>${escapeHtml(p.text)}</small>`
        + `${p.code === "RAISE" ? `<button type="button" class="btn plan-raise" data-raise="${escapeHtml(p.ticker)}|${p.newStop}">⬆ Ustaw stop ${p.newStop.toFixed(2)}</button>` : ""}</td></tr>`).join("");
    el.innerHTML = `${weak ? `<p class="plan-meta plan-warn">🛑 Rynek w korekcie — Darvas w słabym rynku kupował mniej: rozważ mniejsze pozycje albo przerwę.</p>` : ""}
        <section class="plan-sec"><h3>1. 💼 Twoje pozycje <small>${plan.positions.length}</small></h3>
            ${posRows ? `<table class="orders-table plan-pos"><tbody>${posRows}</tbody></table>` : `<p class="muted">Brak pozycji. Po kupnie dodaj ją przyciskiem 💼 przy zleceniu.</p>`}</section>
        <section class="plan-sec"><h3>2. 🛒 Zlecenia kupna na ten tydzień <small>${orders.length}</small></h3>
            <p class="muted">Dla każdej spółki złóż u brokera <b>kupno stop</b> („kup, gdy &gt; X”, ważne do piątku) i po wykonaniu od razu <b>stop loss</b> („sprzedaj, gdy &lt; Y”, −10 %). Jeśli cena nie dojdzie do X, nic się nie dzieje.
            Lista: spółki z ≥ 2 kolejnymi rosnącymi boxami Darvasa (tygodniowe zamknięcia); NATR boxa jest tylko informacją.</p>
            ${orders.length ? `<table class="orders-table"><thead><tr><th>Spółka</th><th>Zlecenia</th><th>Akcje / wartość</th><th></th></tr></thead><tbody>${ordersRowsHtml(orders, true)}</tbody></table>
                ${acctOk ? "" : `<p class="muted">Ustaw konto (PLN) i % konta / % ryzyka w zakładce 💼 Pozycje, żeby policzyć liczbę akcji.</p>`}
                <button type="button" class="btn" id="planCopy">📋 Kopiuj zlecenia</button>`
            : `<p class="muted">${loading ? "Liczę boxy…" : "W tym tygodniu brak spółek gotowych do kupna — to też jest sygnał: czekamy."}</p>`}</section>
        <section class="plan-sec"><h3>3. 🟩 GLB — zlecenia kupna na green line <small>${glb.length}</small></h3>
            <p class="muted">Green Line Breakout (Dr Wish): <b>green line</b> = rekord wszech czasów na zamknięciach <b>miesięcznych</b>, który stoi co najmniej 3 miesiące. Złóż <b>kupno stop</b> na linii („kup, gdy &gt; X”);
            stop <b>1 % pod linią</b> sprawdzasz sam w weekend — <b>zamknięcie tygodnia</b> pod nim = sprzedaj w poniedziałek (nie wystawiaj go u brokera: dzienne wahania wybijały w teście prawie każde wejście). Potem stop przesuwa tygodniowy MACD jak wyżej.
            Lista: spółki ≤ ${GLB_PLAN_MAX_DIST} % pod linią albo z wybiciem w tym tygodniu (≤ +5 %).</p>
            ${glb.length ? `<table class="orders-table"><thead><tr><th>Spółka</th><th>Zlecenia</th><th>Akcje / wartość</th><th></th></tr></thead><tbody>${glbRowsHtml(glb)}</tbody></table>
                <button type="button" class="btn" id="planGlbCopy">📋 Kopiuj zlecenia GLB</button>`
            : `<p class="muted">${glbHasData ? "W tym tygodniu żadna spółka nie jest blisko swojej green line." : "Dane GLB pojawią się po najbliższym odświeżeniu danych (sobota)."}</p>`}</section>
        <details class="plan-sec plan-help"><summary>Jak to działa — rutyna na weekend (15 min)</summary>
            <ol><li><b>Pozycje</b>: „⬆ Podnieś stop” → stuknij przycisk i zmień zlecenie stop loss u brokera. „🔴 Sprzedaj” → zlecenie sprzedaży na poniedziałek. „✂ Stop” → sprawdź, czy broker sprzedał. „🟢 Trzymaj” → nic nie rób.</li>
            <li><b>Zlecenia</b>: skopiuj i złóż u brokera kupno stop + stop loss 10 % (Darvas). Nie wykonane do piątku? W następny weekend lista będzie nowa.</li>
            <li>Kupione? Stuknij 💼 przy spółce — trafi do pozycji i w kolejnym tygodniu dostaniesz dla niej decyzję.</li>
            <li>Wykres: stuknij ticker (🃏 karta Darvasa na tygodniowych zamknięciach; stuknięcie w box → wykres słupkowy z MACD). Ticker w sekcji GLB otwiera 🟩 kartę GLB.</li></ol>
            <p class="muted small">GLB w teście na historycznym składzie S&amp;P 500 (2015–2026, linia z rekordu miesięcznego, wejście i wyjście tygodniowe po MACD): ok. +10,8 % rocznie wobec +13,6 % SPY, największy spadek ok. −31 %; wersja w pełni miesięczna ok. +11,6 %.</p>
            <p class="muted small">Zasady: boxy Darvasa na TYGODNIOWYCH zamknięciach (top / dół = zamknięcie nieprzebite przez 3 kolejne tygodnie), wejście przy wybiciu z boxa po ≥ 2 rosnących boxach, stop początkowy 10 % pod wejściem, potem stop pod dołkiem świecy, w której tygodniowy MACD przetnie sygnał w dół. Test na historycznym składzie S&amp;P 500 (2015–2026, tygodniowe boxy, wyjście po MACD): ok. +11 % rocznie (10 pozycji; 20 pozycji ok. +8,5 %), największy spadek ok. −24 %, wobec +13,6 % kupna i trzymania SPY (−34 %) — traktuj to jako eksperyment na małym kapitale.</p></details>`;
    const gcp = document.getElementById("planGlbCopy");
    if (gcp) gcp.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(glbOrdersText(glb)); showToast("Skopiowano zlecenia GLB.", { type: "success" }); } catch (e) { showToast("Nie udało się skopiować — zaznacz tabelę ręcznie."); }
    });
    el.querySelectorAll("[data-plan-glb]").forEach(a => a.addEventListener("click", ev => {
        ev.preventDefault();
        setChartView("glb");
        openChart(a.dataset.planGlb);
    }));
    const cp = document.getElementById("planCopy");
    if (cp) cp.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(ordersText(orders)); showToast("Skopiowano zlecenia.", { type: "success" }); } catch (e) { showToast("Nie udało się skopiować — zaznacz tabelę ręcznie."); }
    });
    el.querySelectorAll("[data-raise]").forEach(b => b.addEventListener("click", () => {
        const [t, ns] = b.dataset.raise.split("|"), p = state.pos[t];
        if (!p) return;
        savePosition(t, { ...p, stop: +ns });   // przesunięcie stopu po MACD — pamiętaj też zmienić zlecenie stop u brokera
        showToast(`${t}: stop podniesiony do ${(+ns).toFixed(2)} — zmień też zlecenie stop loss u brokera.`, { type: "success" });
    }));
    el.querySelectorAll("[data-plan-chart]").forEach(a => a.addEventListener("click", ev => {
        ev.preventDefault();
        if (!chartCardOn) setChartView("card");
        openChart(a.dataset.planChart);
    }));
    const meta = document.getElementById("drawerMeta");
    if (meta) meta.textContent = `${plan.positions.length} pozycji · ${orders.length} zleceń kupna · ${glb.length} GLB`;
    const first = el.querySelector("[data-plan-chart]");   // PC (widok dzielony): wykres po prawej od razu pokazuje pierwszą spółkę z planu
    if (splitMode && first && !chartRequested) first.click();
}

function openOrdersSheet() {
    if (!watchData) return;
    const inList = watchList ? watchData.stocks.filter(s => (s.lists || []).includes(watchList)) : watchData.stocks;
    const orders = darvasOrders(inList, { ...state.acct, fx: usdPln() });
    const rows = ordersRowsHtml(orders);
    const acctOk = orders.some(o => o.size);
    showSheet(`📋 Zlecenia wg Darvasa${watchList ? " — " + escapeHtml(watchList) : ""}`, orders.length
        ? `<p class="muted">Dla każdej spółki składasz u brokera <b>dwa zlecenia</b> (Darvas, s. 11, 141):<br>
           1) <b>„kup, gdy &gt; X”</b> — zlecenie kupna <i>stop</i> (buy stop): kupujesz dopiero, gdy cena WZROŚNIE do X (góra boxa). Jeśli nie wzrośnie, nic się nie dzieje.<br>
           2) <b>„sprzedaj, gdy &lt; Y”</b> — <i>stop loss</i>: po kupnie broker sam sprzeda, gdy cena SPADNIE do Y (10 % pod wejściem), żeby ograniczyć stratę.<br>
           „🟢” = wybicie było już w tym tygodniu: kupujesz na otwarciu w poniedziałek, bez czekania. 💼 = zapisz jako pozycję (pojawi się w zakładce 💼 Pozycje).</p>
           <table class="orders-table"><thead><tr><th>Spółka</th><th>Zlecenia</th><th>Akcje / wartość</th><th></th></tr></thead><tbody>${rows}</tbody></table>
           ${acctOk ? "" : `<p class="muted">Ustaw konto (PLN) i % konta / % ryzyka w zakładce 💼 Pozycje, żeby policzyć liczbę akcji.</p>`}
           <button type="button" class="btn" id="ordersCopy">📋 Kopiuj zlecenia</button>`
        : `<p>W tym tygodniu brak spółek „Gotowe” ani „Kup teraz” na tej liście.</p>`);
    const cp = document.getElementById("ordersCopy");
    if (cp) cp.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(ordersText(orders)); showToast("Skopiowano zlecenia.", { type: "success" }); } catch (e) { showToast("Nie udało się skopiować — zaznacz tabelę ręcznie."); }
    });
}

// Kolejność: KUP, potem GOTOWE od najbliższego punktu kupna, TRZYMAJ, pierwszy box, reszta.
function darvasRank(s) {
    const p = darvasPick(s);
    if (p === "buy") return 0;
    if (p === "ready") return 1 + Math.min(Math.max(s.rise_dist ?? 99, 0), 99) / 100;
    if (p === "hold") return 2;
    return { WAIT: 3, BUY: 3, READY: 3, HOLD: 4, SELL: 5, OUT: 6 }[s.rise_state] ?? 7;
}
// Stan karty liczony w Pythonie (watchlist.add_darvas_state, pola dv_* w watchlist*.json — ten sam algorytm co darCardAnalyze, test zgodności
// tests/fixtures/darvas_parity.json): lista „Do kupna” nie musi pobierać wykresów. Starsze pliki bez dv_* → liczymy z wykresów jak dawniej.
function darvasStateText(s) {
    const f = v => Number.isFinite(v) ? v.toFixed(2) : "?";
    switch (s.dv_state) {
        case "BUY": return `KUP — zamknięcie tygodnia nad górą najwyższego boxa ${f(s.dv_top)}${s.dv_n >= 2 ? ` (${s.dv_n} kolejne rosnące boxy)` : " (pierwszy box — książka kupuje po dwóch rosnących)"}; stop 10 %: ${f(s.dv_stop)}`;
        case "READY": return `GOTOWY DO KUPNA — ${s.dv_n} kolejne rosnące boxy; kup po zamknięciu nad ${f(s.dv_top)}${Number.isFinite(s.dv_dist) ? ` (${s.dv_dist.toFixed(1)} % wyżej)` : ""}, stop 10 %: ${f(s.dv_stop)}`;
        case "HOLD": return `TRZYMAJ — najwyższy box ${f(s.dv_bottom)}–${f(s.dv_top)}; wyjście pod strefą zagrożenia ${f(s.dv_zone)}`;
        case "WAIT": return `CZEKAJ — pierwszy box ${f(s.dv_bottom)}–${f(s.dv_top)}; punkt kupna po dwóch kolejnych rosnących boxach`;
        case "SELL": return `SPRZEDAJ — cena spadła pod dół najwyższego boxa ${f(s.dv_bottom)}`;
        case "OUT": return "POZA NAJWYŻSZYM BOXEM — nie kupuj ani nie trzymaj";
        default: return "brak boxa Darvasa";
    }
}
function tagRisingFromFields(stocks) {
    stocks.forEach(s => {
        s.rise_n = s.dv_state ? s.dv_n : null; s.rise_state = s.dv_state || null; s.rise_dist = s.dv_dist ?? null;
        s.rise_text = s.dv_state ? darvasStateText(s) : "";
        s.darvas_rank = darvasRank(s);
    });
}
async function ensureRising(which) {
    if (typeof darvasRisingInfo !== "function") return;
    const target = which === "watch" ? watchData : state.data;
    if (!target || risingState[which] === target || risingPending[which] === target) return;
    if (target.stocks.length && target.stocks.every(s => s.dv_tf === "W")) {   // pola z Pythona (tygodniowe): od razu, bez wykresów
        tagRisingFromFields(target.stocks);
        risingState[which] = target;
        return;
    }
    risingPending[which] = target;
    try {
        const charts = dailyCharts(await (which === "watch" ? loadWatchCharts() : loadCharts()));
        if (charts && target === (which === "watch" ? watchData : state.data)) {
            tagRising(target.stocks, charts);
            risingState[which] = target;
            renderTable();
        }
    } catch (e) { /* brak wykresów — spróbujemy przy następnym renderowaniu */ }
    if (risingPending[which] === target) risingPending[which] = null;
}

function watchTabRows() {
    ensureRising("watch");
    if (!watchData) return [];
    watchData.stocks.forEach(s => {
        s.score = Object.prototype.hasOwnProperty.call(state.scores, s.ticker) ? state.scores[s.ticker] : null;
        s.upside_main = upsideMain(s);
        s.target_main = targetMain(s);
    });
    const inList = watchList && watchData.lists ? watchData.stocks.filter(s => (s.lists || []).includes(watchList)) : watchData.stocks;
    const common = watchDarvas === "all"
        ? applyCommonFilters(inList, state.search, state.sector, state.scoreMin, state.scoreMax, state.natrMax, state.risingOnly)
        : darvasPickRows(applyCommonFilters(inList, state.search), watchDarvas);   // tryb Darvasa: tylko lista + wyszukiwarka + Dar-Card
    tagStrategies(watchData.stocks, common, state, []);
    tagPositions(watchData.stocks, state.pos);
    tagPinnedBoxes(watchData.stocks, state.boxes);
    tagCanslim(watchData.stocks, canslimMarket());
    tagActions(watchData.stocks, canslimMarket(), state.csCore);
    return common;
}

// Podkategorie Watchlist = zapamiętane listy (nazwa + filtr Finviz z workflow „Watchlisty”); starszy plik bez `lists` = jedna lista bez przycisków.
const WATCH_LIST_KEY = "momentum_watchlist_watch_list";
let watchList = "";   // "" = wszystkie listy
try { watchList = localStorage.getItem(WATCH_LIST_KEY) || ""; } catch (e) { /* brak localStorage */ }
const WATCH_DARVAS_KEY = "momentum_watchlist_watch_darvas";
let watchDarvas = "go";   // tryb wyszukiwania Darvasa w Watchlistach (DARVAS_PICKS); "all" = zwykłe filtry
try { const v = localStorage.getItem(WATCH_DARVAS_KEY); if (DARVAS_PICKS.some(p => p[0] === v)) watchDarvas = v; } catch (e) { /* brak localStorage */ }
function setWatchDarvas(pick) {
    watchDarvas = pick;
    try { localStorage.setItem(WATCH_DARVAS_KEY, pick); } catch (e) { /* brak localStorage */ }
    renderTable();
}
function watchListCounts(data = watchData) {
    const lists = (data && data.lists) || [];
    return lists.map(l => ({ name: l.name, filters: l.filters, n: data.stocks.filter(s => (s.lists || []).includes(l.name)).length }));
}
function renderWatchLists() {
    const el = document.getElementById("watchLists");
    if (!el) return;
    const counts = watchData ? watchListCounts() : [];
    el.hidden = state.tab !== "WATCH" || counts.length === 0;
    if (el.hidden) return;
    if (watchList && !counts.some(c => c.name === watchList)) watchList = "";   // lista usunięta w workflow
    const btn = (name, label, n, title) => `<button type="button" class="ml-btn${watchList === name ? " active" : ""}" data-list="${escapeHtml(name)}" title="${escapeHtml(title)}">${escapeHtml(label)}<small>${n}</small></button>`;
    const inList = watchList ? watchData.stocks.filter(s => (s.lists || []).includes(watchList)) : watchData.stocks;
    const loaded = inList.some(s => s.rise_state !== undefined);
    const dbtn = ([k, label, title]) => `<button type="button" class="ml-btn dv-btn${watchDarvas === k ? " active" : ""}" data-darvas="${k}" title="${escapeHtml(title)}">${escapeHtml(label)}${k === "all" ? "" : `<small>${loaded ? darvasPickRows(inList, k).length : "…"}</small>`}</button>`;
    el.innerHTML = `<div class="wl-row">${btn("", "Wszystkie", watchData.n_stocks, "Wszystkie zapamiętane listy razem (spółki bez duplikatów)")
        + counts.map(c => btn(c.name, c.name, c.n, "Filtr Finviz: " + c.filters)).join("")}</div>`
        + `<div class="wl-row"><span class="dv-lbl">📦 Darvas:</span>${DARVAS_PICKS.map(dbtn).join("")}`
        + `<button type="button" class="ml-btn dv-orders" data-orders="1" title="Zlecenia na następną sesję wg Darvasa: kupno stop nad górą boxa + stop loss 10 %">📋 Zlecenia${loaded ? `<small>${darvasOrders(inList).length}</small>` : ""}</button></div>`;
}
function setWatchList(name) {
    watchList = name || "";
    try { localStorage.setItem(WATCH_LIST_KEY, watchList); } catch (e) { /* brak localStorage */ }
    renderTable();
}

function rowsForTab(tab) {
    ensureRising("main");
    state.data.stocks.forEach(s => {
        s.score = Object.prototype.hasOwnProperty.call(state.scores, s.ticker) ? state.scores[s.ticker] : null;
        s.upside_main = upsideMain(s);
        s.target_main = targetMain(s);
    });
    const common = applyCommonFilters(state.data.stocks, state.search, state.sector, state.scoreMin, state.scoreMax, state.natrMax, state.risingOnly);
    const stocks = common;
    tagStrategies(state.data.stocks, common, state, []);
    tagPositions(state.data.stocks, state.pos);
    tagPinnedBoxes(state.data.stocks, state.boxes);
    tagCanslim(state.data.stocks, canslimMarket());
    tagActions(state.data.stocks, canslimMarket(), state.csCore);
    if (tab === "CS") return canslimRows(stocks, state.csMin, state.csCore);
    if (tab === "POS") return positionRows(positionStocks(applyCommonFilters(state.data.stocks, state.search, "", null, null, null, false)));
    if (tab === "WATCH") return watchTabRows();
    if (tab === "BASES") return baseRows(stocks, state.bases);
    if (tab === "FAV") return stocks.filter(s => state.favs.has(s.ticker));
    return stocks;
}

const EMPTY_MESSAGES = {
    CS: "Żadna spółka nie spełnia tylu kryteriów CANSLIM — obniż próg w Filtrach (🏆 CANSLIM). Gdy rynek jest w korekcie albo ma ≥ 5 dni dystrybucji (M czerwone), maksimum to 6/7.",
    LIST: "Brak spółek (lista Finviz jest pusta albo filtr tekstu/sektora nic nie zostawia).",
    BASES: "Brak spółek w bazie w zadanej odległości od pivotu — zwiększ dystans albo odznacz „tylko VCP”.",
    POS: "Brak pozycji — otwórz wykres spółki i kliknij „💼 Pozycja” (wejście, stop, kalkulator wielkości pozycji).",
    FAV: "Brak ulubionych — kliknij ☆ przy spółce na dowolnej liście.",
};

function emptyMessage(tab) {
    if (tab === "WATCH" && watchData && watchDarvas !== "all") {
        if ((state.search || "").trim()) return "Żadna spółka z tego stanu Darvasa nie pasuje do wyszukiwania.";
        const inList = watchList ? watchData.stocks.filter(s => (s.lists || []).includes(watchList)) : watchData.stocks;
        if (!inList.some(s => s.rise_state !== undefined)) return "Liczę boxy Darvasa…";
        const other = DARVAS_PICKS.filter(p => p[0] !== watchDarvas && p[0] !== "all" && p[0] !== "go").map(p => [p[1], darvasPickRows(inList, p[0]).length]).filter(x => x[1] > 0);
        const label = (DARVAS_PICKS.find(p => p[0] === watchDarvas) || [])[1] || "";
        return `W tym tygodniu brak spółek w stanie „${label}”${other.length ? " — zobacz: " + other.map(x => `${x[0]} (${x[1]})`).join(", ") : ""}.`;
    }
    if (tab === "WATCH") return watchData ? "Żadna spółka nie przechodzi filtra tekstu / sektora / score." : "Brak watchlist — uruchom workflow „Watchlisty” (przycisk w opisie zakładki) i dodaj listę z filtrem Finviz.";
    return EMPTY_MESSAGES[tab];
}

// Zakładka Filtry: podsumowanie, ile spółek zostaje po filtrach wspólnych (szukaj / sektor / score) i po progach każdej zakładki.
function renderFiltersSummary() {
    const el = document.getElementById("filtersSummary");
    if (!el) return;
    const common = applyCommonFilters(state.data.stocks, state.search, state.sector, state.scoreMin, state.scoreMax, state.natrMax, state.risingOnly);
    const base = common;
    const counts = [["Lista", base.length],
        ["Watchlisty", watchData ? applyCommonFilters(watchData.stocks, state.search, state.sector, state.scoreMin, state.scoreMax, state.natrMax, state.risingOnly).length : 0], ...(state.patterns ? [["Bazy", baseRows(base, state.bases).length]] : []), ["CANSLIM", canslimRows(base, state.csMin, state.csCore).length]];
    el.innerHTML = counts.map(([name, n]) => `<span class="filter-count"><b>${n}</b> ${name}</span>`).join("");
    document.getElementById("drawerMeta").textContent = `${base.length} z ${state.data.stocks.length} spółek po filtrach wspólnych`;
}

function renderTable() {
    if (!state.data) return;
    const tab = state.tab;
    if (tab === BOXES_TAB) { renderBoxesPanel(); return; }
    if (tab === PLAN_TAB) { renderPlanPanel(); return; }
    if (tab === FILTERS_TAB) {
        state.data.stocks.forEach(s => { s.score = Object.prototype.hasOwnProperty.call(state.scores, s.ticker) ? state.scores[s.ticker] : null; s.upside_main = upsideMain(s); });
        tagBreakouts(state.data.stocks, [], state.brk.maxDistPct);
        tagCanslim(state.data.stocks, canslimMarket());
        renderFiltersSummary();
        return;
    }
    const table = document.getElementById(`table-${tab}`);
    const tbody = table.querySelector("tbody");
    const rows = sortRows(rowsForTab(tab), state.sortKey, state.sortDir);
    const cols = table.querySelectorAll("thead th").length;
    tbody.innerHTML = rows.length
        ? rows.map((s, i) => `<tr data-ticker="${escapeHtml(s.ticker)}"${!splitMode && openCards.has(s.ticker) ? ` class="open"` : ""}>${renderRow(tab, s, i + 1)}</tr>`).join("")
        : `<tr><td colspan="${cols}" class="empty-state">${emptyMessage(tab)}</td></tr>`;
    if (tab === "POS") fillPosMinis();
    renderWatchLists();
    updateAlertBadge();
    const meta = document.getElementById("drawerMeta");
    const total = state.data.stocks.length;
    meta.textContent = tab === "WATCH"
        ? (watchData ? `${rows.length} spółek${watchList ? ` z listy „${watchList}”` : ""} (razem na listach: ${watchData.n_stocks}) · ceny z sesji ${watchData.data_as_of || "?"}, skan ${String(watchData.generated_at || "?").replace("T", " ").replace("Z", " UTC")}` : "Brak watchlist")
        : tab === "POS" ? positionSummary(rows) : `${rows.length} z ${total} spółek`;
    if (tab === "POS") renderPositionControls(rows);
    updateSortHeaders(table);
    updateCardSort(tab);
    markSelectedRow();
    fillFundCharts();
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
function neighborTicker(delta) {
    const rows = [...document.querySelectorAll(`#table-${state.tab} tbody tr[data-ticker]`)];
    if (!rows.length) return null;
    const cur = rows.findIndex(r => r.dataset.ticker === chartRequested);
    const next = rows[Math.max(0, Math.min(rows.length - 1, cur < 0 ? 0 : cur + delta))];
    return next && next.dataset.ticker !== chartRequested ? next.dataset.ticker : null;
}
function stepChart(delta) {
    const t = neighborTicker(delta);
    if (t) openChart(t);
}

// Zmiana spółki przesunięciem palca: animacja karty — stara wyjeżdża w stronę przesunięcia (next = w lewo), nowa wjeżdża z przeciwnej strony.
// Bez animacji, gdy nie ma sąsiedniej spółki (koniec listy) albo użytkownik prosi o mniej ruchu.
let slideBusy = false;
function slideChart(delta) {
    const t = neighborTicker(delta);
    if (!t || slideBusy) return;
    const box = document.querySelector(".wl-chart-box");
    const dir = delta > 0 ? "next" : "prev";
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!box || reduced) { openChart(t); return; }
    slideBusy = true;
    box.classList.remove("card-in-next", "card-in-prev");
    box.classList.add(`card-out-${dir}`);
    setTimeout(() => {
        box.classList.remove(`card-out-${dir}`);
        box.classList.add(`card-in-${dir}`);
        openChart(t);
        setTimeout(() => { box.classList.remove(`card-in-${dir}`); slideBusy = false; }, 280);
    }, 140);
}

// Kierunek przeciągnięcia palcem: "left" / "right" gdy ruch jest głównie poziomy, dość długi i szybki; inaczej null.
function swipeDirection(dx, dy, ms) {
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.8 || ms > SWIPE_MAX_MS) return null;
    return dx < 0 ? "left" : "right";
}

function attachSwipe(el, onLeft, onRight, ignore = null) {
    let start = null;
    el.addEventListener("touchstart", e => {
        const t = e.touches[0];
        start = e.touches.length === 1 && !(ignore && ignore(e)) ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
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
    if (document.getElementById("chartLegendBtn")) updateLayoutButton();
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

// Przeciągany pionowy separator między listą a wykresem (widok dzielony): szerokość listy w px zapisana w localStorage,
// wykres sam się przeskalowuje (viewBox = rzeczywisty rozmiar, `drawChart` po każdym ruchu).
const LIST_W_KEY = "momentum_watchlist_list_width";
const LIST_W_MIN = 320, LIST_W_MIN_CHART = 480;
function clampListWidth(px) {
    const max = Math.max(LIST_W_MIN, window.innerWidth - LIST_W_MIN_CHART);
    return Math.round(Math.min(max, Math.max(LIST_W_MIN, px)));
}
function applyListWidth(px) {
    const root = document.documentElement;
    if (px == null) root.style.removeProperty("--list-w");
    else root.style.setProperty("--list-w", clampListWidth(px) + "px");
}
function initSplitResizer() {
    const bar = document.getElementById("splitResizer");
    if (!bar) return;
    try { const saved = parseFloat(localStorage.getItem(LIST_W_KEY)); if (saved > 0) applyListWidth(saved); } catch (e) { /* brak localStorage */ }
    let raf = 0;
    const redraw = () => { if (currentChart) drawChart(); };
    const widthFromEvent = ev => ev.clientX - document.querySelector(".workspace").getBoundingClientRect().left;
    bar.addEventListener("pointerdown", ev => {
        if (!splitMode) return;
        ev.preventDefault();
        bar.setPointerCapture(ev.pointerId);
        bar.classList.add("dragging");
        document.body.classList.add("resizing");
        const move = e => {
            applyListWidth(widthFromEvent(e));
            window.cancelAnimationFrame(raf);
            raf = window.requestAnimationFrame(redraw);   // żywe przeskalowanie wykresu podczas przeciągania
        };
        const up = e => {
            bar.removeEventListener("pointermove", move);
            bar.removeEventListener("pointerup", up);
            bar.removeEventListener("pointercancel", up);
            bar.classList.remove("dragging");
            document.body.classList.remove("resizing");
            try { localStorage.setItem(LIST_W_KEY, String(clampListWidth(widthFromEvent(e)))); } catch (err) { /* brak localStorage */ }
            redraw();
        };
        bar.addEventListener("pointermove", move);
        bar.addEventListener("pointerup", up);
        bar.addEventListener("pointercancel", up);
    });
    bar.addEventListener("dblclick", () => {
        applyListWidth(null);
        try { localStorage.removeItem(LIST_W_KEY); } catch (e) { /* brak localStorage */ }
        redraw();
    });
    window.addEventListener("resize", () => {   // po zwężeniu okna lista nie może zjeść wykresu
        const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--list-w"));
        if (cur > 0) applyListWidth(cur);
    });
}

// Liczba nowych (przebitych, niezatwierdzonych) alertów na zakładce 🔔.
function updateAlertBadge() { /* alerty na liniach usunięte — zostaje pusta funkcja dla wywołań z sync */ }

function updateSortHeaders(table) {
    table.querySelectorAll("thead th").forEach(th => {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.dataset.key === state.sortKey) th.classList.add(state.sortDir === "asc" ? "sort-asc" : "sort-desc");
    });
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ tab: state.tab, csMin: state.csMin, csCore: state.csCore, csAccel: state.csAccel, csRs: state.csRs, bases: state.bases, brk: state.brk, patterns: state.patterns, natrMax: state.natrMax, boxNatrMax: state.boxNatrMax, risingOnly: state.risingOnly, allTabs: state.allTabs, planSeen: true }));
    } catch (e) { /* brak localStorage — ignorujemy */ }
}

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
        if (!saved) return;
        if (TAB_TITLES[saved.tab] || saved.tab === FILTERS_TAB || saved.tab === BOXES_TAB || saved.tab === PLAN_TAB) state.tab = saved.tab;
        if (saved.allTabs === true) state.allTabs = true;
        if (!saved.planSeen || (!state.allTabs && LEAN_HIDDEN_TABS.includes(state.tab))) state.tab = PLAN_TAB;   // po porządkach start = Plan
        if (Number.isFinite(saved.csMin)) state.csMin = saved.csMin;
        if (typeof saved.csCore === "boolean") state.csCore = saved.csCore;
        if (typeof saved.csAccel === "boolean") { state.csAccel = saved.csAccel; setCanslimAccel(saved.csAccel); }
        if (Number.isFinite(saved.csRs)) { state.csRs = saved.csRs; setCanslimRs(saved.csRs); }
        if (saved.bases) {
            if (Number.isFinite(saved.bases.maxDistPct)) state.bases.maxDistPct = saved.bases.maxDistPct;
            state.bases.vcpOnly = saved.bases.vcpOnly === true;
        }
        if (saved.brk && Number.isFinite(saved.brk.maxDistPct)) state.brk.maxDistPct = saved.brk.maxDistPct;
        if (saved.patterns === false) state.patterns = false;
        if (Number.isFinite(saved.natrMax)) state.natrMax = saved.natrMax;
        if (Number.isFinite(saved.boxNatrMax)) state.boxNatrMax = saved.boxNatrMax;
        if (saved.risingOnly === true) state.risingOnly = true;
        if (!state.patterns && state.tab === "BASES") state.tab = "CS";
    } catch (e) { /* uszkodzony zapis — zostają domyślne */ }
}

// ---------- własne ustawienia: ulubione ★ i score (synchronizowane z adnotacjami przez Gist) ----------
// prefsStore = { scores: {T: {v: liczba|null, t: ISO}}, favs: {T: {v: true|false, t: ISO}} } — każda wartość ma czas zmiany,
// a usunięcie to wpis z v = null/false (nagrobek), dzięki czemu scalenie z drugim urządzeniem (mergePrefs) wybiera nowszą zmianę.
let prefsStore = { scores: {}, favs: {}, pos: {}, acct: {}, box: {} };
const PREFS_KEY = "momentum_watchlist_prefs";
const PREFS_EPOCH = "1970-01-01T00:00:00.000Z";   // dane sprzed synchronizacji: przegrywają z każdą świadomą zmianą

const PREFS_KINDS = ["scores", "favs", "pos", "acct", "box"];
const PREFS_FIELDS = { pos: ["entry", "stop", "shares"], acct: ["capital", "riskPct", "posPct", "fx"] };   // cel (take profit) usunięty; konto w PLN: kapitał, ryzyko %, % konta na pozycję, ręczny kurs USD/PLN
// Wartość wpisu: score = liczba|null, fav = bool, pos (wejście / stop / akcje / cel) i acct (kapitał, ryzyko %) = obiekt liczb albo null.
function prefsValue(kind, v) {
    if (kind === "scores") return Number.isFinite(v) ? v : null;
    if (kind === "favs") return v === true;
    if (kind === "box") return v && typeof v === "object" && Number.isFinite(v.top) && Number.isFinite(v.bottom) && v.top > v.bottom && v.bottom > 0 && typeof v.start === "string" ? { top: v.top, bottom: v.bottom, start: v.start, ...(v.line === true ? { line: true } : {}) } : null;   // przypięty box: góra / dół (zamknięcia) + data początku
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
    state.boxes = {};
    Object.keys(prefsStore.box).forEach(t => { if (prefsStore.box[t].v) state.boxes[t] = prefsStore.box[t].v; });
    state.acct = prefsStore.acct.main && prefsStore.acct.main.v ? { ...prefsStore.acct.main.v } : { capital: null, riskPct: null, posPct: null, fx: null };
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
    const t = positionTotals(rows, state.acct.capital, usdPln());
    if (!t.n) return "brak pozycji";
    if (t.fx === null) return `${t.n} poz. · wartość ${money0(t.value)} · ryzyko do stopów ${money0(t.risk)} · wynik ${money0(t.pl)} (brak kursu USD/PLN)`;
    return `${t.n} poz. · wartość ${pln0(t.value_pln)}${t.value_pct !== null ? ` (${t.value_pct.toFixed(0)}% konta)` : ""} · ryzyko do stopów ${pln0(t.risk_pln)}${t.risk_pct !== null ? ` (${t.risk_pct.toFixed(1)}% konta)` : ""} · wynik ${pln0(t.pl_pln)}`;
}

// Kurs USD/PLN: ręczny (ustawiony w koncie) albo ostatnie zamknięcie z Yahoo zapisane przez watchlist.py (data.fx); null, gdy żadnego nie ma.
function usdPln() {
    if (Number.isFinite(state.acct.fx) && state.acct.fx > 0) return state.acct.fx;
    const f = state.data && state.data.fx;
    return f && Number.isFinite(f.usdpln) && f.usdpln > 0 ? f.usdpln : null;
}
const fxText = () => {
    const f = state.data && state.data.fx, manual = Number.isFinite(state.acct.fx) && state.acct.fx > 0;
    return manual ? `kurs USD/PLN ${state.acct.fx} (ręczny)` : f && Number.isFinite(f.usdpln) ? `kurs USD/PLN ${f.usdpln} (Yahoo, ${f.as_of})` : "brak kursu USD/PLN — wpisz ręcznie";
};

function renderPositionControls() {
    const set = (id, val) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = Number.isFinite(val) ? val : ""; };
    set("acctCapital", state.acct.capital); set("acctPosPct", state.acct.posPct); set("acctRisk", state.acct.riskPct);
    const fx = document.getElementById("acctFx");
    if (fx) fx.textContent = fxText();
}

function saveAcct(capital, riskPct, posPct, fx = state.acct.fx) {
    const pos = x => (Number.isFinite(x) && x > 0 ? x : null);
    prefsStore.acct.main = { v: Number.isFinite(capital) && capital > 0 ? { capital, riskPct: pos(riskPct), posPct: pos(posPct), fx: pos(fx) } : null, t: new Date().toISOString() };
    prefsWriteLocal(); prefsApply(); annOnSave();
}

// Przypina box (góra / dół z zamknięć, data początku) do monitorowania albo odpina, gdy to ten sam box.
function togglePinnedBox(ticker, top, bottom, i0, line = false) {
    const weeks = activeCharts() ? activeCharts().weeks || [] : [];
    const start = weeks[Math.max(0, Math.min(weeks.length - 1, +i0))];
    if (!start || !(top > bottom)) return;
    const cur = state.boxes[ticker];
    if (cur && Math.abs(cur.top - top) < 0.005 && Math.abs(cur.bottom - bottom) < 0.005) { savePinnedBox(ticker, null); showToast("📌 Box odpięty.", { type: "info" }); }
    else { pinFlashUntil = Date.now() + 2500; savePinnedBox(ticker, { top, bottom, start, ...(line ? { line: true } : {}) }); showToast(line ? "📌 Top przypięty do monitorowania (stop 8 % pod topem)." : "📌 Box przypięty do monitorowania — zostaje na wykresie także po wyjściu ze strefy.", { type: "success" }); }
}

// ---------- podstrona 📦 Boxy: przegląd boxów Darvasa wszystkich spółek (sekcje do zwijania) ----------
const BOXES_SEEN_KEY = "momentum_watchlist_boxes_seen", BOXES_OPEN_KEY = "momentum_watchlist_boxes_open";
const BOX_SECTIONS = [   // [klucz, tytuł, domyślnie otwarta, opis]
    ["pinned", "📌 Monitorowane", true, "Przypięte boxy (przytrzymaj box lub 📌 w pasku nad wykresem) — najpierw te w strefie zagrożenia i po exicie."],
    ["fresh", "🆕 Nowe boxy", true, `Boxy, których góra została potwierdzona w ostatnich ${typeof DARVAS_NEW_WEEKS !== "undefined" ? DARVAS_NEW_WEEKS : 4} tygodniach. „NOWE” = jeszcze ich nie widziałeś na tej podstronie.`],
    ["buy", "🚀 Wybicia potwierdzone", true, "Zamknięcie tygodnia nad górą boxa na wolumenie ≥ 1,4× średniej i do 10 % nad górą — stan KUP."],
    ["check", "🔎 Wybicia do sprawdzenia", false, "Zamknięcie nad górą boxa, ale bez wolumenu albo za daleko nad nią."],
    ["hold", "🔒 Trzymaj", false, "W najwyższym boxie po wcześniejszym wybiciu — wahania w boxie ignorujemy, stop pod strefą zagrożenia."],
    ["sell", "⚠️ Sprzedaj / poza boxem", false, "Po wyższym boxie cena weszła w strefę zagrożenia (SPRZEDAJ) albo box złamany bez wybicia (POZA)."],
    ["wait", "⏳ Czekaj na wybicie", false, "Pierwszy box, jeszcze bez zamknięcia nad górą."],
];
const BOX_STATE_LABELS = { ABOVE: ["wybił", "positive"], INSIDE: ["w boxie", ""], ZONE: ["STREFA", "negative"], EXIT: ["EXIT", "negative"], BUY: ["KUP", "positive"], NOVOL: ["bez wol.", ""], LATE: ["za późno", ""], HOLD: ["TRZYMAJ", "positive"], SELL: ["SPRZEDAJ", "negative"], OUT: ["POZA", "negative"], WAIT: ["czekaj", ""] };
let boxesOverviewData = null, boxesNewKeys = null, boxesCharts = null;

function boxesLoadJson(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; } catch (e) { return fallback; } }

// Rozwijana informacja o pozycji liczonej z boxa (Dar-Card): wejście = góra boxa (zamknięcie tygodnia nad nią), stop = dół strefy zagrożenia (5 % pod dołem boxa).
function boxStopFor(top, bottom) {   // stop początkowy: 10 % pod wejściem (wejście = góra boxa)
    return typeof darvasInitialStop === "function" ? darvasInitialStop(top, bottom, top) : Math.round(Math.max((top + bottom) / 2, top * 0.9) * 100) / 100;
}
function boxPositionHtml(top, bottom, ticker, line = false) {
    const stop = line ? bottom : boxStopFor(top, bottom);   // sam top (dół niepotwierdzony): `bottom` = stop 8 % pod topem
    const perShare = top > stop ? (top / stop - 1) * 100 : null;
    const size = positionSize({ ...state.acct, fx: usdPln() }, top, stop);
    const lines = [`Wejście: zamknięcie tygodnia nad <b>${top.toFixed(2)}</b>`, `Stop: pod <b>${stop.toFixed(2)}</b> (${line ? "8 % pod topem" : "10 % pod wejściem"})${perShare !== null ? `, ryzyko ${perShare.toFixed(1)} % na akcję` : ""}`];
    if (size) lines.push(`Pozycja: <b>${fmtShares(size.shares)} akcji</b> = ${pln0(size.value_pln)} (${size.pct_of_capital.toFixed(1)} % konta), strata przy stopie ${pln0(size.risk_pln)} (${size.risk_pct !== null ? size.risk_pct.toFixed(2) : "—"} % konta)${size.limited_by === "risk" ? " — ograniczone ryzykiem" : " — ograniczone % konta"}`);
    else lines.push("Pozycja: ustaw konto (PLN) i % konta / % ryzyka w zakładce 💼 Pozycje, żeby liczyć liczbę akcji.");
    const has = ticker && state.pos[ticker];
    const mk = ticker ? `<button type="button" class="btn box-mkpos" data-mkpos="${escapeHtml(ticker)}|${top}|${bottom}|${line ? 1 : 0}">${has ? "💼 Zastąp pozycję tym boxem" : "💼 Utwórz pozycję z tego boxa"}</button>` : "";
    return lines.map(l => `<div class="box-pos-line">${l}</div>`).join("") + mk;
}

// Automatyczna pozycja z boxa: wejście = góra boxa, stop = połowa boxa, nie głębiej niż 10 % od wejścia, liczba akcji z kalkulatora konta (gdy konto ustawione).
function createPositionFromBox(ticker, top, bottom, line = false) {
    if (!state.data || !(top > bottom)) return;
    const stop = line ? bottom : boxStopFor(top, bottom);
    if (state.pos[ticker] && !window.confirm(`${ticker} ma już pozycję (wejście ${state.pos[ticker].entry}, stop ${state.pos[ticker].stop}). Zastąpić ją pozycją z boxa?`)) return;
    const size = positionSize({ ...state.acct, fx: usdPln() }, top, stop);
    savePosition(ticker, { entry: top, stop, shares: size ? size.shares : null });
    showToast(`💼 Pozycja ${ticker}: wejście ${top.toFixed(2)}, stop ${stop.toFixed(2)}${size ? `, ${fmtShares(size.shares)} akcji` : " (ustaw konto, by policzyć akcje)"} — zobaczysz ją w zakładce 💼 Pozycje.`, { type: "success" });
}
if (typeof document !== "undefined") document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest(".box-mkpos");
    if (!b) return;
    ev.stopPropagation();
    const [tk, top, bottom, ln] = b.dataset.mkpos.split("|");
    createPositionFromBox(tk, +top, +bottom, ln === "1");
    if (state.tab === BOXES_TAB) renderBoxesPanel();
}, true);

// Jakość boxa po NATR: sekcje (poza przypiętymi, które zawsze zostają) tracą boxy o NATR powyżej progu; bez policzonego NATR odpadają, gdy próg jest ustawiony.
function filterBoxesByNatr(ov, max) {
    if (!Number.isFinite(max)) return ov;
    const out = { ...ov };
    Object.keys(out).forEach(k => { if (k !== "pinned") out[k] = out[k].filter(r => natrOk(r.natr, max)); });
    return out;
}
function natrChipHtml(natr) {
    if (!Number.isFinite(natr)) return "";
    const g = natrGrade(natr);
    return ` <span class="box-natr ${g.cls}" title="NATR boxa = średni True Range jego tygodni / cena. Blueprint: konsolidacja < 8 %.">NATR ${natr.toFixed(1)} % · ${g.label}</span>`;
}

function boxRowHtml(r, sec, isNew) {
    const [lab, cls] = BOX_STATE_LABELS[r.state] || [r.state, ""];
    const pinned = state.boxes[r.ticker] && Math.abs(state.boxes[r.ticker].top - r.box.top) < 0.005 && Math.abs(state.boxes[r.ticker].bottom - r.box.bottom) < 0.005;
    const btn = sec === "pinned" ? `<button type="button" class="box-act" data-act="unpin" title="Odepnij box">✕</button>`
        : `<button type="button" class="box-act${pinned ? " on" : ""}" data-act="${pinned ? "unpin" : "pin"}" title="${pinned ? "Odepnij" : "Przypnij do monitorowania"}">📌</button>`;
    return `<div class="box-row" data-ticker="${escapeHtml(r.ticker)}" data-sec="${sec}" data-i="${r.idx}"><span class="box-tk">${escapeHtml(r.ticker)}</span><span class="box-st ${cls}">${escapeHtml(lab)}</span>${isNew ? '<span class="box-new">NOWE</span>' : ""}<span class="box-tx">${escapeHtml(r.text)}${natrChipHtml(r.natr)}</span><span class="box-px">${Number.isFinite(r.price) ? "$" + r.price : ""}</span>${btn}</div>`
        + `<details class="box-pos"><summary>💰 Pozycja z tego boxa</summary>${boxPositionHtml(r.box.top, r.box.bottom, r.ticker, !!r.box.line)}</details>`;
}

async function renderBoxesPanel() {
    const panel = document.getElementById("boxesPanel");
    if (!panel || !state.data) return;
    if (!boxesOverviewData) panel.innerHTML = '<p class="muted small" style="padding:10px">Ładuję boxy…</p>';
    const charts = dailyCharts(await loadCharts());
    if (!charts) { panel.innerHTML = '<p class="muted small" style="padding:10px">Brak danych wykresów (charts.json).</p>'; return; }
    boxesCharts = charts;
    const items = state.data.stocks.map(s => { const c = charts.stocks[s.ticker]; return c ? { ticker: s.ticker, price: s.price, c: c.c, v: c.v, h: c.h, l: c.l } : null; }).filter(Boolean);
    const ov = filterBoxesByNatr(darvasOverview(items, charts.weeks, state.boxes), state.boxNatrMax);
    Object.keys(ov).forEach(k => ov[k].forEach((r, i) => { r.idx = i; }));
    boxesOverviewData = ov;
    if (boxesNewKeys === null) {   // „nowe od ostatniej wizyty”: porównanie z zapamiętanym zestawem, który odświeżamy dopiero po pokazaniu podstrony
        const seen = new Set(boxesLoadJson(BOXES_SEEN_KEY, []));
        boxesNewKeys = new Set(seen.size ? ov.fresh.filter(r => !seen.has(r.key)).map(r => r.key) : []);
    }
    if (state.tab === BOXES_TAB) {
        const seen = new Set(boxesLoadJson(BOXES_SEEN_KEY, []));
        ov.fresh.forEach(r => seen.add(r.key));
        try { localStorage.setItem(BOXES_SEEN_KEY, JSON.stringify([...seen].slice(-600))); } catch (e) { /* brak localStorage */ }
    }
    const open = boxesLoadJson(BOXES_OPEN_KEY, {});
    panel.innerHTML = `<p class="filters-intro">Boxy Darvasa na tygodniowych zamknięciach dla wszystkich spółek z listy. Kliknij wiersz, żeby zobaczyć box na wykresie, 📌 przypina go do monitorowania.</p>`
        + BOX_SECTIONS.map(([key, title, def, desc]) => {
            const rows = ov[key];
            const isOpen = key in open ? open[key] : def;
            return `<details class="box-sec" data-sec="${key}"${isOpen ? " open" : ""}><summary>${title} <span class="box-count">${rows.length}</span></summary><p class="small muted box-desc">${escapeHtml(desc)}</p>`
                + (rows.length ? rows.map(r => boxRowHtml(r, key, key === "fresh" && boxesNewKeys.has(r.key))).join("") : '<p class="small muted box-empty">Brak.</p>') + "</details>";
        }).join("");
    updateBoxesBadge();
    document.getElementById("drawerMeta").textContent = `${ov.pinned.length} monitorowanych · ${ov.fresh.length} nowych · ${ov.buy.length} wybić potwierdzonych`;
}

function updateBoxesBadge() {
    const el = document.getElementById("boxesBadge");
    if (!el || !boxesOverviewData) return;
    const alarm = boxesOverviewData.pinned.filter(r => r.state === "ZONE" || r.state === "EXIT").length;
    const fresh = boxesNewKeys ? boxesOverviewData.fresh.filter(r => boxesNewKeys.has(r.key)).length : 0;
    const n = alarm + fresh;
    el.textContent = n ? ` ${n}` : "";
    el.className = alarm ? "tab-badge alarm" : "tab-badge";
}

// po wczytaniu danych: w tle policz boxy, żeby znaczek przy zakładce pokazywał monitorowane w strefie i nowe boxy
async function refreshBoxesBadge() {
    if (!state.data) return;
    try { await renderBoxesPanelQuiet(); } catch (e) { /* bez wykresów brak znaczka */ }
}
async function renderBoxesPanelQuiet() {
    const charts = dailyCharts(await loadCharts());
    if (!charts) return;
    const items = state.data.stocks.map(s => { const c = charts.stocks[s.ticker]; return c ? { ticker: s.ticker, price: s.price, c: c.c, v: c.v, h: c.h, l: c.l } : null; }).filter(Boolean);
    boxesOverviewData = filterBoxesByNatr(darvasOverview(items, charts.weeks, state.boxes), state.boxNatrMax);
    boxesOverviewData && Object.keys(boxesOverviewData).forEach(k => boxesOverviewData[k].forEach((r, i) => { r.idx = i; }));
    if (boxesNewKeys === null) {
        const seen = new Set(boxesLoadJson(BOXES_SEEN_KEY, []));
        boxesNewKeys = new Set(seen.size ? boxesOverviewData.fresh.filter(r => !seen.has(r.key)).map(r => r.key) : []);
    }
    updateBoxesBadge();
}

// Klik w wiersz: otwiera wykres tej spółki przybliżony na box (jak kliknięcie boxa); 📌 / ✕ przypina i odpina.
async function openBoxRow(ticker, box) {
    const charts = boxesCharts || dailyCharts(await loadCharts());
    const weeks = (charts && charts.weeks) || [];
    const i0 = box.i0 >= 0 ? box.i0 : Math.max(0, dateToIndex(weeks, box.start));
    boxFocus = { ticker, top: box.top, bottom: box.bottom, i0, i1: box.i1 >= 0 ? box.i1 : weeks.length - 1, line: !!box.line };
    await openChart(ticker);
    const end = weeks.length + 6;
    chartWindows[0] = { n: Math.max(15, end - i0 + 14), end };
    if (currentChart && currentChart.ticker === ticker) drawChart();
}

function initBoxesPanel() {
    const panel = document.getElementById("boxesPanel");
    if (!panel) return;
    panel.addEventListener("toggle", ev => {
        const d = ev.target;
        if (!d.classList || !d.classList.contains("box-sec")) return;
        const open = boxesLoadJson(BOXES_OPEN_KEY, {});
        open[d.dataset.sec] = d.open;
        try { localStorage.setItem(BOXES_OPEN_KEY, JSON.stringify(open)); } catch (e) { /* brak localStorage */ }
    }, true);
    panel.addEventListener("click", ev => {
        if (ev.target.closest && ev.target.closest(".box-pos")) return;   // rozwijana pozycja z boxa nie otwiera wykresu
        const row = ev.target.closest && ev.target.closest(".box-row");
        if (!row || !boxesOverviewData) return;
        const r = boxesOverviewData[row.dataset.sec] && boxesOverviewData[row.dataset.sec][+row.dataset.i];
        if (!r) return;
        const act = ev.target.closest && ev.target.closest(".box-act");
        if (act) {
            ev.stopPropagation();
            if (act.dataset.act === "unpin") { savePinnedBox(r.ticker, null); showToast("📌 Box odpięty.", { type: "info" }); }
            else { pinFlashUntil = Date.now() + 2500; savePinnedBox(r.ticker, { top: r.box.top, bottom: r.box.bottom, start: r.box.start, ...(r.box.line ? { line: true } : {}) }); showToast("📌 Box przypięty do monitorowania.", { type: "success" }); }
            return;
        }
        openBoxRow(r.ticker, r.box);
    });
}

// Akcje paska zaznaczonego boxa na Dar-Card (stuknięcie zaznacza; przycisk przybliża albo przypina): `d` = wartość data-box `top|bottom|outcome|conf|i0|i1`.
function focusBoxFromData(d) {
    const [top, bottom, kind, , i0, i1] = String(d).split("|");
    if (!currentChart || !Number.isFinite(+i0) || i0 === undefined || i1 === undefined) return;
    boxFocus = { ticker: currentChart.ticker, top: +top, bottom: +bottom, i0: +i0, i1: +i1, line: kind === "linia" || kind === "przypięta-linia" };
    const end = +i1 + 1 + 6;   // clampWindow ucina do końca danych
    chartWindows[0] = { n: Math.max(15, end - (+i0) + 14), end };
    drawChart();
}

function pinBoxFromData(d) {
    const [top, bottom, kind, , i0] = String(d).split("|");
    if (currentChart) togglePinnedBox(currentChart.ticker, +top, +bottom, +i0, kind === "linia" || kind === "przypięta-linia");
}

function savePinnedBox(ticker, box) {
    prefsStore.box[ticker] = { v: box ? { top: box.top, bottom: box.bottom, start: box.start, ...(box.line ? { line: true } : {}) } : null, t: new Date().toISOString() };
    prefsWriteLocal(); prefsApply(); annOnSave();
    tagPinnedBoxes(state.data.stocks, state.boxes);
    renderTable();
    refreshBoxesBadge();
    if (currentChart && currentChart.ticker === ticker) drawChart();
}

function tagPinnedBoxes(stocks, boxes) {
    stocks.forEach(s => {
        const b = boxes[s.ticker];
        const st = b && typeof darvasPinStatus === "function" ? darvasPinStatus(b, s.price) : null;
        s.pbox = st && st.state !== "NONE" ? { ...b, ...st } : null;
        s.pbox_rank = s.pbox ? s.pbox.rank : null;
    });
}

function savePosition(ticker, pos) {
    const stock = findStock(ticker);
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
    const stock = findStock(ticker);
    if (!stock) return;
    const cur = state.pos[ticker] || {};
    const stop = Number.isFinite(annPositionLineValue(annStore, ticker, "stop")) ? annPositionLineValue(annStore, ticker, "stop") : cur.stop;
    const v = x => (Number.isFinite(x) ? x : "");
    const html = `
        <div class="sheet-grid">
            <label>Wejście ($)<input type="number" inputmode="decimal" step="any" id="posEntryIn" value="${v(cur.entry !== undefined ? cur.entry : stock.price)}"></label>
            <label>Stop ($)<input type="number" inputmode="decimal" step="any" id="posStopIn" value="${v(stop)}"></label>
            <label>Liczba akcji<input type="number" inputmode="decimal" step="any" id="posSharesIn" value="${v(cur.shares)}"></label>
        </div>
        <div class="sheet-quick">Stop: <button type="button" class="chip-btn" data-stop="5">−5%</button><button type="button" class="chip-btn" data-stop="7">−7%</button><button type="button" class="chip-btn" data-stop="8">−8%</button>${Number.isFinite(stock.box_stop) ? `<button type="button" class="chip-btn" data-stop-price="${stock.box_stop}" title="Dół środkowej 1/3 pudełka bazy (${stock.box_low}–${stock.pivot})">z bazy ${money(stock.box_stop)}</button>` : ""}</div>
        <div class="sheet-section"><h4>Wielkość pozycji — konto w PLN (IKE)</h4>
            <div class="sheet-grid">
                <label>Konto (PLN)<input type="number" inputmode="decimal" step="any" id="posCapital" value="${v(state.acct.capital)}" placeholder="np. 50000"></label>
                <label>Pozycja (% konta)<input type="number" inputmode="decimal" step="any" id="posPosPct" value="${v(state.acct.posPct)}" placeholder="np. 10"></label>
                <label>Ryzyko do stopu (% konta)<input type="number" inputmode="decimal" step="any" id="posRiskPct" value="${v(state.acct.riskPct)}" placeholder="np. 0.5"></label>
                <label>Kurs USD/PLN<input type="number" inputmode="decimal" step="any" id="posFx" value="${v(state.acct.fx)}" placeholder="${v(usdPln())}"></label>
            </div>
            <p class="sheet-result small muted" id="posFxInfo">${fxText()} — puste pole = kurs z Yahoo</p>
            <p class="sheet-result" id="posCalc"></p>
        </div>
        <div class="sheet-actions">
            ${state.pos[ticker] ? `<button type="button" class="btn danger" id="posDelete">Usuń pozycję</button>` : ""}
            <button type="button" class="btn primary" id="posSave">Zapisz</button>
        </div>`;
    const body = showSheet(`💼 ${ticker} — pozycja`, html);
    const $ = id => body.querySelector("#" + id);
    const num = id => { const x = parseFloat($(id).value); return Number.isFinite(x) ? x : null; };
    const fxNow = () => num("posFx") || (state.data && state.data.fx && state.data.fx.usdpln) || null;
    const calc = () => {
        const entry = num("posEntryIn"), stopV = num("posStopIn");
        const acct = { capital: num("posCapital"), fx: fxNow(), posPct: num("posPosPct"), riskPct: num("posRiskPct") };
        const size = positionSize(acct, entry, stopV);
        const parts = [];
        if (entry && stopV && stopV < entry) parts.push(`Ryzyko na akcję: ${money(entry - stopV)} (${((entry - stopV) / entry * 100).toFixed(1)}% od wejścia)`);
        else if (entry && stopV) parts.push("Stop musi być poniżej wejścia.");
        const rule = stopRuleCheck(entry, stopV);
        if (rule && !rule.ok) parts.push(`⚠ Stop ${rule.loss_pct.toFixed(1)}% pod ceną zakupu — reguła O'Neila: maksymalna strata 7–8 %, bez wyjątków (kliknij −7 % albo −8 %).`);
        if (size) {
            parts.push(`Sugerowane: <b>${fmtShares(size.shares)} akcji</b> = ${pln0(size.value_pln)} (${money0(size.value_usd)}, ${size.pct_of_capital.toFixed(1)}% konta)`
                + (size.risk_pln !== null ? `<br>Strata przy stopie: <b>${pln0(size.risk_pln)}</b> (${size.risk_pct.toFixed(2)}% konta)` : "")
                + (acct.posPct && acct.riskPct && size.risk_pln !== null ? ` — liczbę akcji ogranicza ${size.limited_by === "risk" ? "ryzyko do stopu" : "% konta na pozycję"}` : "")
                + ` <button type="button" class="chip-btn" id="posUse">Użyj</button>`);
        } else if (!acct.capital || !acct.fx || (!acct.posPct && !acct.riskPct)) parts.push("Wpisz konto (PLN) oraz % konta na pozycję i/lub ryzyko do stopu — podpowiem liczbę akcji.");
        else if (acct.riskPct && !acct.posPct) parts.push("Do liczenia z ryzyka potrzebny jest stop poniżej wejścia.");
        $("posCalc").innerHTML = parts.join("<br>");
        const use = $("posUse");
        if (use) use.addEventListener("click", () => { $("posSharesIn").value = size.shares; calc(); });
    };
    body.addEventListener("input", calc);
    body.addEventListener("click", ev => {
        const tb = ev.target.closest("button[data-stop-price]");
        if (tb) { $("posStopIn").value = Number(tb.dataset.stopPrice).toFixed(2); calc(); return; }
        const t = ev.target.closest("button[data-stop]");
        if (!t) return;
        const entry = num("posEntryIn");
        if (!entry) return;
        $("posStopIn").value = (entry * (1 - Number(t.dataset.stop) / 100)).toFixed(2);
        calc();
    });
    $("posSave").addEventListener("click", () => {
        const entry = num("posEntryIn"), stopV = num("posStopIn");
        if (!entry || entry <= 0) { showToast("Podaj cenę wejścia.", { type: "error" }); return; }
        if (stopV !== null && stopV >= entry) { showToast("Stop musi być poniżej ceny wejścia.", { type: "error" }); return; }
        saveAcct(num("posCapital"), num("posRiskPct"), num("posPosPct"), num("posFx"));
        savePosition(ticker, { entry, stop: stopV, shares: num("posSharesIn") });
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

function applyLeanUi() {
    document.querySelectorAll(".drawer-tab").forEach(b => { if (LEAN_HIDDEN_TABS.includes(b.dataset.tab)) b.classList.toggle("lean-hide", !state.allTabs); });
    const cb = document.getElementById("allTabs");
    if (cb) cb.checked = state.allTabs;
}
function setAllTabs(on) {
    state.allTabs = !!on;
    applyLeanUi();
    if (!state.allTabs && LEAN_HIDDEN_TABS.includes(state.tab)) showTab(PLAN_TAB); else saveSettings();
}

function showTab(tab, resetSort = true) {
    state.tab = tab;
    if (resetSort && TAB_DEFAULT_SORT[tab]) [state.sortKey, state.sortDir] = TAB_DEFAULT_SORT[tab];
    document.querySelectorAll(".drawer-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll("#bottomNav [data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    const navMore = document.getElementById("navMore");
    if (navMore) navMore.classList.toggle("active", !BOTTOM_NAV_TABS.includes(tab));
    const activeTab = document.querySelector(".drawer-tab.active");
    if (activeTab && activeTab.scrollIntoView) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
    const refresh = document.getElementById("refreshLink");   // w zakładce Watchlisty „Odśwież dane” otwiera workflow Watchlisty (akcje add / remove / refresh), w pozostałych tygodniowe odświeżenie CANSLIM
    if (refresh) {
        refresh.href = githubActionsUrl(window.location, tab === "WATCH" ? "watchlists.yml" : "daily_watchlist.yml");
        refresh.title = tab === "WATCH" ? "Watchlisty są ręczne. Ten przycisk otwiera GitHub Actions — kliknij „Run workflow”: add (dodaj / zmień listę: name + filters), remove (usuń listę) albo refresh (odśwież wszystkie)." : refresh.dataset.weeklyTitle;
    }
    Object.keys(TAB_TITLES).forEach(t => {
        document.getElementById(`table-${t}`).hidden = t !== tab;
        document.getElementById(`guide-${t}`).hidden = t !== tab;
        const controls = document.getElementById(`controls-${t}`);
        if (controls) controls.hidden = t !== tab;
    });
    const onFilters = tab === FILTERS_TAB;
    const onBoxes = tab === BOXES_TAB;
    const onPlan = tab === PLAN_TAB;
    document.getElementById("planPanel").hidden = !onPlan;
    document.getElementById("filtersPanel").hidden = !onFilters;
    document.getElementById("boxesPanel").hidden = !onBoxes;
    document.getElementById("cardSortBar").hidden = onFilters || onBoxes || onPlan;
    document.body.classList.toggle("on-plan", onPlan);
    document.getElementById("drawerTitle").textContent = onFilters ? "Filtry" : onBoxes ? "Boxy Darvasa" : onPlan ? "Plan na tydzień" : TAB_TITLES[tab];
    saveSettings();
    renderTable();
}

// M z CANSLIM: stan rynku (S&P 500 i Nasdaq) policzony w watchlist.py::market_state — pasek nad listą.
const MARKET_LABELS = { uptrend: ["✅", "Rynek: uptrend (EMA10 > EMA20 tyg.)", "market-up"], correction: ["🛑", "Rynek: korekta (EMA10 < EMA20 tyg.)", "market-down"] };

// Follow-Through Day: krótki opis stanu po korekcie indeksu (tylko gdy była korekta ≥ 7 %)
function ftdText(f) {
    if (!f || f.state === "none" || !f.state) return "";
    if (f.state === "ftd") return ` · FTD ${f.date}: +${f.gain_pct}% na wolumenie ×${f.vol_ratio}, ${f.day}. dzień próby odbicia, ${f.dist_days} dni dystrybucji od FTD`;
    if (f.state === "attempt") return ` · próba odbicia po korekcie −${f.drawdown_pct}% (dno ${f.low_date}): ${f.day}. dzień, FTD dopiero od 4. dnia`;
    return ` · korekta −${f.drawdown_pct}% (dno ${f.low_date}), bez próby odbicia`;
}
function marketLines(market) {
    const sign = v => (Number.isFinite(v) ? (v > 0 ? "+" : "") + v + "%" : "—");
    return [["sp500", "S&P 500"], ["nasdaq", "Nasdaq"]].filter(([k]) => market && market[k]).map(([k, name]) => {
        const m = market[k];
        const ema = Number.isFinite(m.ema_gap_pct) ? `EMA10/EMA20 tyg. ${sign(m.ema_gap_pct)}, ` : "";
        return `${name}: ${ema}${sign(m.pct_vs_sma50)} vs SMA50, ${sign(m.pct_vs_sma200)} vs SMA200, ${m.dist_days} dni dystrybucji (25 sesji), ${sign(m.pct_from_high)} od szczytu${ftdText(m.ftd)}`;
    });
}

function renderMarket() {
    const el = document.getElementById("marketBanner");
    if (!el) return;
    const market = state.data && state.data.market;
    if (!market || !MARKET_LABELS[market.regime]) { el.hidden = true; return; }
    const viaFtd = market.regime === "correction" && market.m_regime === "uptrend";
    const [icon, label, cls] = viaFtd ? ["🟡", "Rynek: korekta, ale potwierdzony Follow-Through Day (M ✓)", "market-up"] : MARKET_LABELS[market.regime];
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
        info.textContent = "Brak danych — uruchom watchlist.py (albo workflow „Daily Watchlist Refresh” na GitHubie).";
        return;
    }
    const generated = d.generated_at ? d.generated_at.replace("T", " ").replace("Z", " UTC") : "?";
    info.textContent = `Dane z sesji ${d.data_as_of} · pobrano ${generated} · ${d.n_stocks} spółek CANSLIM`
        + (d.finviz_stale ? " · ⚠ lista Finviz z poprzedniego pobrania (Finviz niedostępny)" : "");
}

// Przełącznik analizy wzorców (Filtry → 🧩 i przycisk nad wykresem): wyłączony = czysty wykres (świece, SMA, EPS, wolumen) i brak zakładki Bazy.
function applyPatternsUi() {
    const on = state.patterns;
    document.body.classList.toggle("no-patterns", !on);
    const tab = document.querySelector('.drawer-tab[data-tab="BASES"]');
    if (tab) tab.hidden = !on;
    const cb = document.getElementById("patternsOn");
    if (cb) cb.checked = on;
    const b = document.getElementById("chartPatBtn");
    if (b) { b.textContent = on ? "🧩 Wzorce: wł." : "🧩 Wzorce: wył."; b.classList.toggle("active", on); }
}

function setPatterns(on) {
    state.patterns = !!on;
    applyPatternsUi();
    saveSettings();
    renderHeaders();
    if (!state.patterns && state.tab === "BASES") { showTab("CS"); }
    else renderTable();
    if (currentChart) {
        const st = findStock(currentChart.ticker);
        updateInfoButton(st);
        document.getElementById("chartBase").innerHTML = st && state.patterns ? baseBoxHtml(st) : "";
        document.getElementById("chartReady").textContent = st ? readinessLine(st, state.data.market && (state.data.market.m_regime || state.data.market.regime), state.patterns) : "";
        chartWindows = [];
        drawChart();
    }
}

function initControls() {
    const patCb = document.getElementById("patternsOn");
    if (patCb) patCb.addEventListener("change", () => setPatterns(patCb.checked));
    const patBtn = document.getElementById("chartPatBtn");
    if (patBtn) patBtn.addEventListener("click", () => setPatterns(!state.patterns));
    applyPatternsUi();
    const bind = (id, apply) => {
        const el = document.getElementById(id);
        el.addEventListener("input", () => {
            const v = parseFloat(el.value);
            apply(Number.isFinite(v) && v >= 0 ? v : 0);
            saveSettings();
            renderTable();
        });
    };
    const acctInputs = () => saveAcct(parseFloat(document.getElementById("acctCapital").value), parseFloat(document.getElementById("acctRisk").value), parseFloat(document.getElementById("acctPosPct").value));
    ["acctCapital", "acctPosPct", "acctRisk"].forEach(id => document.getElementById(id).addEventListener("change", () => { acctInputs(); renderTable(); }));
    renderPositionControls();
    document.getElementById("brkMaxDist").value = state.brk.maxDistPct;
    bind("brkMaxDist", v => { state.brk.maxDistPct = v; });
    document.getElementById("csMin").value = state.csMin;
    bind("csMin", v => { state.csMin = v; });
    document.getElementById("csRs").value = state.csRs;
    bind("csRs", v => { state.csRs = Math.min(99, v); setCanslimRs(state.csRs); });
    const csCore = document.getElementById("csCore");
    csCore.checked = state.csCore;
    csCore.addEventListener("change", () => { state.csCore = csCore.checked; saveSettings(); renderTable(); });
    const csAccel = document.getElementById("csAccel");
    csAccel.checked = state.csAccel;
    setCanslimAccel(state.csAccel);
    csAccel.addEventListener("change", () => { state.csAccel = csAccel.checked; setCanslimAccel(state.csAccel); saveSettings(); renderTable(); });
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
    { const cb = document.getElementById("allTabs"); if (cb) cb.addEventListener("change", () => setAllTabs(cb.checked)); }
    { const cb = document.getElementById("risingOnly"); if (cb) { cb.checked = !!state.risingOnly; cb.addEventListener("change", () => { state.risingOnly = cb.checked; saveSettings(); renderTable(); }); } }
    [["natrMax", "natrMax"], ["boxNatrMax", "boxNatrMax"]].forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = Number.isFinite(state[key]) ? state[key] : "";
        el.addEventListener("input", e => {
            const v = parseFloat(e.target.value);
            state[key] = Number.isFinite(v) && v > 0 ? v : null;
            saveSettings();
            if (key === "boxNatrMax") { boxesOverviewData = null; if (state.tab === BOXES_TAB) renderBoxesPanel(); else refreshBoxesBadge(); }
            else renderTable();
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
    const watchLink = document.getElementById("watchRefreshLink");
    if (watchLink) watchLink.href = githubActionsUrl(window.location, "watchlists.yml");
    const watchLists = document.getElementById("watchLists");
    if (watchLists) watchLists.addEventListener("click", ev => {
        const d = ev.target.closest("[data-darvas]");
        if (d) { setWatchDarvas(d.dataset.darvas); return; }
        if (ev.target.closest("[data-orders]")) { openOrdersSheet(); return; }
        const b = ev.target.closest("[data-list]");
        if (b) setWatchList(b.dataset.list);
    });
    // Klik w wiersz otwiera wykres w stylu MarketSmith (klik w link "TV" otwiera TradingView i nie otwiera wykresu).
    document.querySelectorAll("table.momentum-table tbody").forEach(tbody => tbody.addEventListener("click", ev => {
        if (ev.target.closest("a") || ev.target.closest("input")) return;
        const actCell = ev.target.closest("td.act-cell");
        if (actCell) { openActionSheet(actCell.closest("tr[data-ticker]").dataset.ticker); return; }
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
let chartWinLen = { d: null };   // długość okna suwaka (tygodnie) zapamiętana dla wszystkich spółek
let chartWindows = [];      // okna suwaków {n, end} po jednym na wykres w siatce (puste = domyślne); zerowane przy nowej spółce / zmianie układu
let chartEstOn = false;      // estymaty analityków na wykresie (cena celu + rewizje konsensusu EPS), przycisk „Estymaty”
let estimatesPromise = null;
let estimatesMap = null;
let estimatesFailed = false;   // data/estimates.json niedostępny (np. jeszcze nie wygenerowany przez workflow)
let chartBookOn = true;     // 📖 Książka: opisy i oś jak na wykresach z książki O'Neila (tylko tygodniowy)
let chartGlbOn = false;    // 🟩 karta GLB (Green Line Breakout) — wyłącza 🃏 kartę Darvasa i odwrotnie
let chartCardOn = false;   // 🃏 karta Darvasa z książki (drugi widok obok czasowego Dar-Card)
let chartDarvasOn = false;  // 📦 widok Darvasa (Dar-Card): pudełka na cenach zamknięcia zamiast świec
let chartLegendOn = false;  // legenda i podpisy paneli na wykresie na telefonie (domyślnie ukryte — mały ekran)
let chartLog = false;       // skala logarytmiczna ceny (zapamiętywana w przeglądarce)
let chartRequested = null;  // ticker, którego wykres jest otwarty lub właśnie się wczytuje (zaznaczenie wiersza, strzałki)
let chartToken = 0;         // numeruje żądania wykresu — spóźniona odpowiedź nie nadpisze nowszej spółki
let chartFull = false;      // okno wykresu na cały ekran (przycisk ⛶ / klawisz F)
let chartWide = false;      // pełny ekran na szerokim monitorze => układ szeroki (chart.js)
let chartCompact = false;   // układ dla wąskiego ekranu (telefon) — patrz chart.js
let pinFlashUntil = 0;       // krótkie mignięcie przypiętego boxa na wykresie (zamiast wibracji, której iOS nie obsługuje)
let boxAddOn = false;   // tryb „＋ Box” na widoku Dar-Card: przeciągnij poziomo przez tygodnie konsolidacji → własny, przypięty box
let boxLongPressed = false;   // po przytrzymaniu boxa następujące kliknięcie nie otwiera fokusu
let boxFocus = null;        // { ticker, top, bottom, i0, i1 } — po kliknięciu boxa: przybliżenie na jego fragment (świece + wolumen) do tygodniowego monitoringu
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

// Panel pozycji: miniatury tygodniowe z MACD i podpowiedź „czy przestawić stop” — dane z charts.json, ładowane leniwie po narysowaniu tabeli.
async function fillPosMinis() {
    const cells = [...document.querySelectorAll("#table-POS td[data-pos-mini]")];
    if (!cells.length) return;
    const charts = await loadCharts();
    // pozycje spoza listy CANSLIM (np. z 📋 Zleceń w Watchlistach) mają wykres w charts_watchlists.json
    const needWatch = cells.some(td => !(charts && charts.stocks && charts.stocks[td.dataset.posMini]));
    const wcharts = needWatch && watchData ? await loadWatchCharts() : null;
    if (!charts && !wcharts) return;
    cells.forEach(td => {
        const t = td.dataset.posMini, s = findStock(t);
        const src = charts && charts.stocks && charts.stocks[t] ? charts : wcharts, c = src && src.stocks && src.stocks[t];
        const st = c ? macdWeeklyState({ weeks: src.weeks, c: c.c, l: c.l }) : null;
        const adv = s && s.position ? stopAdvice(s.position, st, s.price) : null;
        if (s) s.macd_advice = adv;
        td.innerHTML = st ? posMiniSvg(c, src.weeks, s && s.position, adv, st, { ticker: t }) : `<span class="muted small">brak danych wykresu</span>`;
        const mc = document.querySelector(`#table-POS td[data-pos-macd="${CSS.escape(t)}"]`);
        if (mc) {
            mc.className = `pos-macd adv-${adv ? adv.tone : "muted"}`;
            mc.title = adv ? adv.text : "";
            mc.innerHTML = adv ? `<strong>${adv.code === "RAISE" ? "⬆" : adv.code === "HIT" ? "✂" : adv.code === "NA" ? "—" : "✔"} ${escapeHtml(adv.label)}</strong><span class="act-why">${escapeHtml(adv.text.split(/(?<=[.!?])\s/)[0])}</span>` : "";
        }
    });
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

function fetchJson(url, quiet = false) {
    return fetch(url, { cache: "no-store" })
        .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
        .catch(e => { if (!quiet) console.error(`Nie udało się wczytać ${url}:`, e); return null; });
}

// Watchlisty (workflow „Watchlisty”): watchlists.json (spółki z ratingami, polem `lists` i fundamentami z Finviz) i charts_watchlists.json (wykresy tygodniowe z EPS).
let watchData = null;
let watchChartsPromise = null;
// W zakładce Watchlisty pierwszeństwo mają dane watchlist (ich oceny RS / EPS / Composite są względem list), w pozostałych dane głównej listy CANSLIM.
function findStock(ticker) {
    const main = state.data && state.data.stocks.find(x => x.ticker === ticker);
    const watch = watchData && watchData.stocks.find(x => x.ticker === ticker);
    return (state.tab === "WATCH" ? watch || main : main || watch) || undefined;
}
async function loadWatchData() {
    const d = await fetchJson("data/watchlists.json", true);
    watchData = d && Array.isArray(d.stocks) && d.stocks.length ? d : null;
    return watchData;
}
function loadWatchCharts() {
    if (!watchChartsPromise) {
        watchChartsPromise = fetchJson("data/charts_watchlists.json", true).then(c => { if (!c) { watchChartsPromise = null; return null; } return c; });
    }
    return watchChartsPromise;
}
// Wykresy dla jednej spółki: w zakładce Watchlisty najpierw charts_watchlists.json, w pozostałych charts.json (z EPS); drugi plik jest rezerwą.
async function loadChartsFor(ticker) {
    const has = c => c && c.stocks && c.stocks[ticker];
    const order = state.tab === "WATCH" ? [loadWatchCharts, loadCharts] : [loadCharts, loadWatchCharts];
    let last = null;
    for (const load of order) {
        const c = await load();
        if (has(c)) return c;
        last = last || c;
    }
    return last;
}

// Wykresy tygodniowe wszystkich spółek listy (charts.json).
function loadCharts() {
    if (!chartsPromise) {
        chartsPromise = fetchJson("data/charts.json").then(charts => {
            if (!charts) { chartsPromise = null; return null; }
            return charts;
        });
    }
    return chartsPromise;
}

async function openChart(ticker) {
    if (state.tab === "WATCH" && watchDarvas !== "all" && !chartCardOn) setChartView("card");   // wyszukiwanie wg Darvasa → od razu 🃏 karta (przycisk „Karta” nadal przełącza)
    const stock = findStock(ticker);
    const modal = document.getElementById("chartModal");
    document.getElementById("chartTitle").textContent = `${ticker} — ${stock && stock.company ? stock.company : ""}`;
    document.getElementById("chartSub").textContent = stock
        ? [stock.sector, stock.industry, Number.isFinite(stock.rs_rating) ? `RS Rating ${stock.rs_rating}` : null,
            stock.earnings ? `wyniki: ${stock.earnings}` : null].filter(Boolean).join(" · ")
        : "";
    document.getElementById("chartStats").textContent = stock ? chartStats(stock) : "";
    document.getElementById("chartRatings").innerHTML = stock ? ratingChipsHtml(stock) : "";
    updateInfoButton(stock);
    document.getElementById("chartBase").innerHTML = stock && state.patterns ? baseBoxHtml(stock) : "";
    document.getElementById("chartReady").textContent = stock ? readinessLine(stock, state.data.market && (state.data.market.m_regime || state.data.market.regime), state.patterns) : "";
    updatePosButton();
    const scoreBox = document.getElementById("chartScore");
    if (scoreBox) scoreBox.value = Number.isFinite(state.scores[ticker]) ? state.scores[ticker] : "";
    document.getElementById("chartFv").href = `https://finviz.com/stock?t=${encodeURIComponent(ticker)}&ty=fc&p=d&b=1`;
    document.getElementById("chartZx").href = `https://www.zacks.com/stock/quote/${encodeURIComponent(ticker)}`;
    const body = document.getElementById("chartBody");
    chartRequested = ticker;
    const token = ++chartToken;
    markSelectedRow(true);
    chartCompact = window.innerWidth <= COMPACT_MAX_WIDTH;
    chartWindows = [];
    Object.assign(annEdit, { on: false, mode: null, tool: null, selected: null, pending: [], cursor: null });   // nowy wykres: poza trybem edycji
    annCurrent = null;
    annSyncTools();
    body.innerHTML = `<div class="empty-state">Ładowanie wykresu…</div>`;
    modal.hidden = false;
    const charts = await loadChartsFor(ticker);
    if (modal.hidden || token !== chartToken) return; // zamknięte w trakcie ładowania albo wybrano już inną spółkę
    if (!charts) { body.innerHTML = `<div class="empty-state">Nie udało się wczytać danych wykresów.</div>`; return; }
    if (!(charts.stocks && charts.stocks[ticker])) { body.innerHTML = `<div class="empty-state">Brak wykresu tej spółki.</div>`; return; }
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
        state.patterns && s.base_type ? `baza: ${baseSummary(s)}, pivot ${money(s.pivot)} (${fmtPct(s.pct_to_pivot)})` : null].filter(Boolean).join(" · ");
}

// Zmiana DŁUGOŚCI okna suwaka jest zapamiętywana (localStorage) dla wszystkich spółek; samo przesuwanie okna nie.
function rememberWindowLength(n) {
    if (chartWinLen.d === n) return;
    chartWinLen.d = n;
    try { localStorage.setItem(CHART_WINLEN_KEY, JSON.stringify(chartWinLen)); } catch (e) { /* brak localStorage */ }
}

// Jeden wykres tygodniowy (jak w książce O'Neila); jedna komórka = jedyna edytowalna.
function chartCells() {
    return [{ ticker: currentChart.ticker }];
}

// Dane wykresu aktualnej spółki: DZIENNE (charts.daily, 12 miesięcy — Darvas liczy boxy na dziennych zamknięciach), a do czasu pierwszego odświeżenia
// danych po tej zmianie (brak `daily`) tygodniowe. Miniatury pozycji i karty telefonu zostają tygodniowe (loadCharts).
// Darvas liczy się na TYGODNIOWYCH zamknięciach (Oct 2026, user: „przejdźmy całkowicie na tygodniowe ceny zamknięcia”) — dawny widok dzienny wyłączony.
function dailyCharts(charts) {
    return charts;
}
function activeCharts() {
    return currentChart ? dailyCharts(currentChart.charts) : null;
}

function posStockPin() { return currentChart ? findStock(currentChart.ticker) : null; }

function drawChart() {
    if (!currentChart) return null;
    if (typeof window.syncBoxAddButton === "function") window.syncBoxAddButton();
    const cells = chartCells();
    const activeIdx = 0;   // komórka z fokusem = edytowalna
    const focus = boxFocus && boxFocus.ticker === currentChart.ticker ? boxFocus : null;
    const pinned = state.boxes[currentChart.ticker] || null;   // przypięty box: rysowany zawsze (też po wyjściu z boxa i strefy), do monitorowania
    const pinIdx = pinned ? dateToIndex(activeCharts().weeks || [], pinned.start) : -1;
    const pin = pinned && pinIdx >= 0 && !(focus && Math.abs(focus.top - pinned.top) < 0.005 && Math.abs(focus.bottom - pinned.bottom) < 0.005)
        ? { top: pinned.top, bottom: pinned.bottom, i0: pinIdx, i1: 1e5, ...(pinned.line ? { line: true } : {}) } : null;
    const body = document.getElementById("chartBody");
    const cellHtml = (c, i) => {
        const st = findStock(c.ticker);
        const label = escapeHtml(st && st.company ? st.company : "");
        return `<div class="chart-cell${i === activeIdx ? " primary" : ""}" data-ticker="${escapeHtml(c.ticker)}"><div class="cell-head"><strong>${escapeHtml(c.ticker)}</strong> <span>${label}</span></div>`
            + `<div class="wl-chart-readout cell-readout"></div><div class="cell-body"></div></div>`;
    };
    body.innerHTML = `<div class="chart-grid layout-1" data-ticker="${escapeHtml(currentChart.ticker)}">${cells.map(cellHtml).join("")}</div>`;
    if (focus) {   // pasek nad wykresem (wstawiany PRZED rysowaniem, żeby pomiar miejsca na wykres był prawdziwy — inaczej viewBox jest wyższy niż pole i wykres wraca z pustymi pasami po bokach)
        const stop = focus.line ? focus.bottom : focus.bottom * (1 - DARVAS_STOP_PCT / 100);
        const fc = activeCharts().stocks && activeCharts().stocks[focus.ticker];
        const focusNatr = fc && !focus.line ? boxNatr(fc.h || [], fc.l || [], fc.c || [], focus.i0, focus.i1) : null;
        const bar = document.createElement("div");
        bar.className = "box-focus-bar";
        bar.innerHTML = focus.line ? `<span>📏 Top <b>${focus.top.toFixed(2)}</b> (dół niepotwierdzony) · kupno nad topem · stop <b>${focus.bottom.toFixed(2)}</b> (${DARVAS_LINE_STOP_PCT} % pod topem)</span> <button type="button" id="boxFocusPin">${pinned && pinned.line && Math.abs(pinned.top - focus.top) < 0.005 ? "🗑 Odepnij top" : "📌 Przypnij top"}</button> <button type="button" id="boxFocusBack">← pełny wykres</button>` : `<span>📦 Kupno nad <b>${focus.top.toFixed(2)}</b> · szara strefa ryzyka <b>${focus.bottom.toFixed(2)}</b> → <b>${stop.toFixed(2)}</b> · exit pod <b>${stop.toFixed(2)}</b>${natrChipHtml(focusNatr)}</span> <button type="button" id="boxFocusPin">${pinned && Math.abs(pinned.top - focus.top) < 0.005 && Math.abs(pinned.bottom - focus.bottom) < 0.005 ? "📌 odepnij" : "📌 przypnij"}</button> <button type="button" id="boxFocusBack">← pełny wykres</button>`;
        { const d = document.createElement("details"); d.className = "box-pos"; d.innerHTML = `<summary>💰 Pozycja z tego boxa</summary>${boxPositionHtml(focus.top, focus.bottom, focus.ticker, !!focus.line)}`; bar.appendChild(d); }
        if (state.boxes[focus.ticker] && !(Math.abs(state.boxes[focus.ticker].top - focus.top) < 0.005 && Math.abs(state.boxes[focus.ticker].bottom - focus.bottom) < 0.005)) {   // jest przypięty (np. własny) box inny niż ten w fokusie — da się go usunąć
            const pb = state.boxes[focus.ticker], del = document.createElement("button");
            del.type = "button"; del.className = "btn"; del.textContent = `🗑 Usuń przypięty box ${pb.bottom.toFixed(2)}–${pb.top.toFixed(2)}`;
            del.addEventListener("click", () => { savePinnedBox(focus.ticker, null); showToast("📌 Przypięty box usunięty.", { type: "info" }); });
            bar.appendChild(del);
        }
        bar.querySelector("#boxFocusPin").addEventListener("click", () => togglePinnedBox(focus.ticker, focus.top, focus.bottom, focus.i0, !!focus.line));
        body.insertBefore(bar, body.firstChild);
        bar.querySelector("#boxFocusBack").addEventListener("click", () => { boxFocus = null; chartWindows = []; drawChart(); });
    }
    let primary = null;
    cells.forEach((c, i) => {
        const cell = body.querySelectorAll(".chart-cell")[i];
        const st = findStock(c.ticker) || null;
        const opts = {
            log: chartLog, stack: true, uid: "c" + i,   // osobne wykresy (Cena / Wolumen / MACD / RS / EPS) jeden pod drugim, cena w skali logarytmicznej
            compact: chartCompact, wide: chartWide,
            hideLabels: !splitMode && !chartLegendOn, darvas: chartDarvasOn && !focus, card: chartCardOn, glb: chartGlbOn,
            focusBox: focus,
            pinBox: pin,
            pinFlash: Date.now() < pinFlashUntil,
            noBench: !splitMode && annEdit.on && !annEdit.spaceOn,
            fit: phoneFit(cell),   // jeden wykres: viewBox = prawdziwy rozmiar miejsca (telefon i panel obok listy), bez pustych marginesów
            window: chartWindows[i], windowLen: chartWinLen.d,
            onWindow: w => { chartWindows[i] = w; rememberWindowLength(w.n); },
            gestures: null,   // gesty (szczypnięcie / przeciąganie po wykresie) wyłączone na życzenie — okno czasu zmienia tylko suwak pod wykresem
            estimates: chartEstOn && estimatesMap ? estimatesMap[c.ticker] || null : null,
            hideAutoLines: annHide(c.ticker).lines, patterns: state.patterns,
            userCups: annStore[c.ticker] && annStore[c.ticker].cups ? annStore[c.ticker].cups.filter(u => u.start && u.end) : [],
            book: chartBookOn, bookTitle: `${c.ticker}${st && st.company ? " — " + st.company : ""}`,
            overlay: oc => annOverlay({ ...oc, ticker: c.ticker, stock: st, readonly: i !== activeIdx, uid: "c" + i }),
        };
        const model = renderStockChart(cell.querySelector(".cell-body"), cell.querySelector(".cell-readout"), activeCharts(), c.ticker, st, opts);
        if (i === activeIdx) primary = model;
    });
    document.getElementById("chartPattern").textContent = primary && state.patterns ? patternExplain(primary) : "";
    if (primary && state.patterns && typeof darvasStatus === "function") {   // stan wg zasad DAR-CARD (KUP / TRZYMAJ / SPRZEDAJ) dopisany do opisu formacji
        const ds = darvasStatus(primary.c, undefined, undefined, undefined, primary.v);
        if (ds.state !== "NONE") { const el = document.getElementById("chartPattern"); el.textContent = `${el.textContent ? el.textContent + " · " : ""}📦 Darvas: ${ds.text}`; }
    }
    if (pinned && posStockPin()) { const el = document.getElementById("chartPattern"); const ps = posStockPin().pbox; if (ps) el.textContent = `${el.textContent ? el.textContent + " · " : ""}📌 Box: ${ps.text}`; }
    const posStock = findStock(currentChart.ticker);
    if (primary && posStock && posStock.position) {   // moja pozycja: podpowiedź „czy przestawić stop” z MACD tygodniowego trafia do linii gotowości
        posStock.macd_advice = stopAdvice(posStock.position, macdWeeklyState({ weeks: primary.weeks, c: primary.c, l: primary.l }), posStock.price);
        document.getElementById("chartReady").textContent = readinessLine(posStock, state.data.market && (state.data.market.m_regime || state.data.market.regime), state.patterns);
    }
    const estEl = document.getElementById("chartEstimates");
    const pst = findStock(currentChart.ticker);
    estEl.textContent = chartEstOn ? (estimatesMap ? estimateText(estimatesMap[currentChart.ticker], pst && pst.price) : (estimatesFailed ? "Estymaty analityków jeszcze niedostępne — pojawią się po najbliższym odświeżeniu danych." : "Ładowanie estymat…")) : "";
    return primary;
}

// Telefon: okno wykresu to kolumna na cały ekran (nagłówek, paski informacji, odczyt, suwak, wykres, pasek nawigacji), a wykres
// zajmuje CAŁĄ resztę — układ liczymy w pikselach faktycznie dostępnego miejsca (viewBox = rozmiar na ekranie, bez skalowania 560×800
// do szerokości ekranu), więc nic nie jest miniaturą ani nie ma pustych pasów. Przeliczane po obrocie / zmianie rozmiaru.
const SPLIT_SLIDER_PX = 46;   // komputer: rząd suwaka (44 px minimapa + odstępy)
const PHONE_SLIDER_PX = 30;   // suwak okna czasowego (linia + 2 kulki, 26 px) + odstępy nad wykresem
let lastPhoneFit = null;
const phoneSliderPx = () => (splitMode ? SPLIT_SLIDER_PX : PHONE_SLIDER_PX);
function phoneFit(cell) {
    const r = cell.querySelector(".cell-body").getBoundingClientRect();
    lastPhoneFit = { w: Math.max(260, Math.round(r.width)), h: Math.max(120, Math.round(r.height - phoneSliderPx())) };
    return lastPhoneFit;
}

function updateLayoutButton() {
    document.getElementById("chartLegendBtn").hidden = splitMode;   // legenda: przycisk tylko na telefonie (na dużym ekranie legenda jest zawsze)
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

// Dolna nawigacja telefonu (kciuk dosięga): 4 główne widoki + „Więcej” (arkusz z resztą zakładek i odświeżaniem danych).
function initBottomNav() {
    const nav = document.getElementById("bottomNav");
    if (!nav) return;
    nav.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
    document.getElementById("navMore").addEventListener("click", () => {
        const items = [["FILTERS", "⚙", "Filtry i ustawienia"], ...(state.allTabs ? [["LIST", "📋", "Lista"], ["WATCH", "📑", "Watchlisty"], ...(state.patterns ? [["BASES", "🧱", "Bazy"]] : []), ["FAV", "⭐", "Ulubione"]] : [])];
        const body = showSheet("Więcej", `<div class="sheet-menu">${items.map(([t, i, l]) => `<button type="button" data-tab="${t}"><span>${i}</span>${l}</button>`).join("")}
            <a href="${document.getElementById("refreshLink").href}" target="_blank" rel="noopener"><span>🔄</span>Odśwież dane (GitHub Actions)</a></div>`);
        body.querySelectorAll("button[data-tab]").forEach(b => b.addEventListener("click", () => { closeSheet(); showTab(b.dataset.tab); }));
    });
}

// Telefon: opis spółki, fundamenty i objaśnienie wzorca są pod „⋯” (nad wykresem zostają pastylki ocen, ramka formacji i linia gotowości).
function chartDetailsHtml() {
    const text = id => (document.getElementById(id) ? document.getElementById(id).textContent.trim() : "");
    const blocks = [["Gotowość", text("chartReady")], ["Spółka", text("chartSub")], ["Fundamenty", text("chartStats")], ["Formacja", text("chartPattern")]].filter(b => b[1]);
    const chips = currentChart ? findStock(currentChart.ticker) : null;
    if (chips) blocks.unshift(["Oceny", ratingChips(chips).map(c => `${c.label ? c.label + " " : ""}${c.value}`).join(" · ")]);
    return blocks.length ? `<div class="sheet-section">${blocks.map(([h, t]) => `<h4>${h}</h4><p class="sheet-result">${escapeHtml(t)}</p>`).join("")}</div>` : "";
}

// Przycisk „ⓘ Opis” (też na Dar-Card): wszystkie dane spółki w jednym arkuszu — oceny, gotowość, fundamenty, formacja / baza, litery CANSLIM z liczbami — bez wracania do listy.
function chartInfoHtml() {
    const text = id => (document.getElementById(id) ? document.getElementById(id).textContent.trim() : "");
    const stock = currentChart ? findStock(currentChart.ticker) : null;
    let html = stock && typeof heatmapHtml === "function" ? `<div class="sheet-section">${heatmapHtml(stock, canslimMarket())}</div>` : "";
    html += chartDetailsHtml();
    const base = text("chartBase");
    if (base) html += `<div class="sheet-section"><h4>Baza / wzorzec</h4><p class="sheet-result">${escapeHtml(base)}</p></div>`;
    if (stock) {
        const ex = canslimExplain(stock, canslimMarket());
        const mark = ok => (ok === true ? "✓" : ok === false ? "✗" : "?");
        html += `<div class="sheet-section"><h4>CANSLIM ${Number.isFinite(stock.cs) ? stock.cs + "/7" : "(za mało danych)"}</h4>`
            + ex.rows.map(r => `<p class="sheet-result"><b>${mark(r.ok)} ${escapeHtml(r.key)}</b> — ${escapeHtml(r.have || "brak danych")}<br><span class="muted small">${escapeHtml(r.rule || "")}</span></p>`).join("") + `</div>`;
    }
    return html || `<p class="muted">Brak danych o spółce.</p>`;
}
// Mały przycisk „ⓘ” z kolorową plakietką CANSLIM (zielona ≥ 5/7, żółta 4/7, czerwona poniżej, szara bez danych) — zamiast szerokiego przycisku z tekstem.
function updateInfoButton(stock) {
    const b = document.getElementById("chartInfoBtn");
    if (!b) return;
    const cs = stock && Number.isFinite(stock.cs) ? stock.cs : null;
    const tone = cs === null ? "none" : cs >= 5 ? "good" : cs === 4 ? "mid" : "bad";
    b.className = `btn info-btn info-${tone}`;
    b.innerHTML = `<span class="info-ic">ⓘ</span>${cs === null ? "" : `<span class="info-badge">${cs}/7</span>`}`;
    b.title = cs === null ? "Opis spółki: oceny, fundamenty, formacja, baza" : `Opis spółki — CANSLIM ${cs}/7 (oceny, fundamenty, formacja, baza, litery C A N S L I M)`;
}
function openChartInfo() {
    if (!currentChart) return;
    const st = findStock(currentChart.ticker);
    showSheet(`${escapeHtml(currentChart.ticker)} — opis${st && st.company ? " · " + escapeHtml(st.company) : ""}`, chartInfoHtml());
}

// Telefon: drugorzędne przyciski nagłówka wykresu (skala, estymaty, legenda, pełny ekran, linki, score) są pod „⋯” — arkuszem od dołu.
function openChartMore() {
    const btns = ["chartFullBtn", "chartPatBtn", "chartDarvasBtn", "chartEstBtn", "chartLegendBtn"].map(id => document.getElementById(id)).filter(b => b && !b.hidden);
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
        chartDarvasOn = true;   // Dar-Card jest jedynym widokiem (świece tylko po kliknięciu boxa)
        const saved = JSON.parse(localStorage.getItem(CHART_WINLEN_KEY) || "null");
        if (saved && Number.isFinite(saved.d) && saved.d > 0) chartWinLen.d = saved.d;
        chartBookOn = localStorage.getItem(CHART_BOOK_KEY) !== "0";
    } catch (e) { /* brak localStorage */ }
    // Jedyny wykres to tygodniowy w stylu książki O'Neila (user: „usuń wszystko z wykresami dziennymi”).
    chartBookOn = true; chartLog = false;
    updateLogButton();
    document.getElementById("chartInfoBtn").addEventListener("click", openChartInfo);
    try { chartCardOn = localStorage.getItem("momentum_watchlist_chart_card") === "1"; } catch (e) { /* ignoruj */ }
    const cardBtn = document.getElementById("chartCardBtn");
    cardBtn.classList.toggle("active", chartCardOn);
    cardBtn.addEventListener("click", () => {
        setChartView(chartCardOn ? "" : "card");
        boxFocus = null; drawChart();
    });
    try { chartGlbOn = localStorage.getItem("momentum_watchlist_chart_glb") === "1" && !chartCardOn; } catch (e) { /* ignoruj */ }
    const glbBtn = document.getElementById("chartGlbBtn");
    glbBtn.classList.toggle("active", chartGlbOn);
    glbBtn.addEventListener("click", () => {
        setChartView(chartGlbOn ? "" : "glb");
        boxFocus = null; drawChart();
    });
    document.getElementById("chartPosBtn").addEventListener("click", () => { if (chartRequested) openPositionSheet(chartRequested); });
    // przesunięcie palca w poziomie: w lewo = następna spółka z listy, w prawo = poprzednia (zastąpiło strzałki ◀ ▶);
    // działa na tytule, linii gotowości i na wykresie, ale nie na suwaku (ma własne przeciąganie) ani w trybie rysowania
    const stepNext = () => slideChart(1), stepPrev = () => slideChart(-1);
    attachSwipe(document.getElementById("chartReady"), stepNext, stepPrev);
    attachSwipe(document.querySelector(".wl-chart-titles"), stepNext, stepPrev);
    // wykres: jak w czytnikach — stuknięcie w prawy brzeg = następna spółka, w lewy = poprzednia (tylko dotyk); przesuwanie palcem po wykresie
    // (przełączniki warstw, suwak) nie zmienia już spółki
    document.getElementById("chartBody").addEventListener("click", ev => {
        if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) return;
        if (annEdit.on || annPen.on || boxAddOn || ev.target.closest("button, a, input, select, summary, details, [data-box], .wl-range, .layer-bar, .box-focus-bar, .box-select-bar, .box-pick, .chart-overlay.editing")) return;
        const r = document.getElementById("chartBody").getBoundingClientRect(), f = (ev.clientX - r.left) / r.width;
        if (f >= 0.86) { ev.stopPropagation(); slideChart(1); } else if (f <= 0.14) { ev.stopPropagation(); slideChart(-1); }
    }, true);   // faza przechwytywania: działa też na Dar-Card, której własna obsługa kliknięć w svg zatrzymuje zdarzenie
    try {
        if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches && !localStorage.getItem("momentum_watchlist_edge_hint")) {
            localStorage.setItem("momentum_watchlist_edge_hint", "1");
            showToast("Stuknij prawy brzeg wykresu (ok. 14 % szerokości) = następna spółka, lewy = poprzednia.", { type: "info" });
        }
    } catch (e) { /* brak localStorage */ }
    const chartScore = document.getElementById("chartScore");
    if (chartScore) {
        chartScore.addEventListener("change", () => { if (chartRequested) setScore(chartRequested, chartScore.value); });
        chartScore.addEventListener("keydown", ev => { if (ev.key === "Enter") chartScore.blur(); });
    }
    const updateBookButton = () => {
        const b = document.getElementById("chartBookBtn");
        b.textContent = chartBookOn ? "📖 Książka: wł." : "📖 Książka: wył.";
        b.classList.toggle("active", chartBookOn);
    };
    updateBookButton();
    document.getElementById("chartBookBtn").addEventListener("click", () => {
        chartBookOn = !chartBookOn;
        try { localStorage.setItem(CHART_BOOK_KEY, chartBookOn ? "1" : "0"); } catch (e) { /* ignoruj */ }
        updateBookButton();
        if (currentChart) drawChart();
    });
    const updateDarvasButton = () => {
        const b = document.getElementById("chartDarvasBtn");
        b.textContent = chartDarvasOn ? "📦 Darvas: wł." : "📦 Darvas: wył.";
        b.classList.toggle("active", chartDarvasOn);
    };
    updateDarvasButton();
    // „＋ Box”: własny box na Dar-Card (skrypt nie wyłapuje wąskich konsolidacji) — przeciągnij poziomo po tygodniach, box = najwyższe / najniższe zamknięcie z tego przedziału, zapisuje się jako przypięty
    (() => {
        const btn = document.getElementById("chartBoxAddBtn");
        const body = document.getElementById("chartBody");
        const sync = () => {
            const inFocus = !!(boxFocus && currentChart && boxFocus.ticker === currentChart.ticker);
            btn.hidden = !inFocus;   // własny box rysuje się tylko na wykresie świecowym
            document.querySelector(".wl-chart-box").classList.toggle("focus-view", inFocus);
            const est = document.getElementById("chartEstBtn");   // estymaty analityków: tylko na wykresie słupkowym (po dotknięciu boxa), nie na Dar-Card
            if (est) est.hidden = !(boxFocus && currentChart && boxFocus.ticker === currentChart.ticker);
        };
        window.syncBoxAddButton = sync;
        btn.addEventListener("click", () => { if (annApi.toggleBox) annApi.toggleBox(); });
        annApi.onBox = (ticker, box) => {   // własny box (kursor jak przy Linii / Cup): najwyższe / najniższe zamknięcie z przedziału, zapisany jako przypięty
            if (!currentChart || currentChart.ticker !== ticker) return;
            pinFlashUntil = Date.now() + 2500;
            savePinnedBox(ticker, box);
            showToast("📌 Własny box zapisany i monitorowany.", { type: "success" });
        };
        sync();
    })();
    document.getElementById("chartDarvasBtn").addEventListener("click", () => {
        chartDarvasOn = !chartDarvasOn;
        try { localStorage.setItem(CHART_DARVAS_KEY, chartDarvasOn ? "1" : "0"); } catch (e) { /* ignoruj */ }
        updateDarvasButton();
        if (currentChart) drawChart();
    });
    // przytrzymanie boxa (≈ 0,55 s) przypina go do monitorowania (po kliknięciu fokus, po przytrzymaniu pin); ponowne przytrzymanie tego samego boxa odpina
    (() => {
        const modal = document.getElementById("chartModal");
        let timer = null, sx = 0, sy = 0;
        const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
        modal.addEventListener("pointerdown", ev => {
            const el = ev.target.closest && ev.target.closest("[data-box]");
            if (!el || !currentChart) return;
            sx = ev.clientX; sy = ev.clientY;
            cancel();
            timer = setTimeout(() => {
                timer = null;
                const [top, bottom, , , i0] = el.dataset.box.split("|");
                boxLongPressed = true;
                if (navigator.vibrate) { try { navigator.vibrate(25); } catch (e) { /* brak wibracji */ } }
                togglePinnedBox(currentChart.ticker, +top, +bottom, +i0);
            }, 550);
        });
        modal.addEventListener("pointermove", ev => { if (timer && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) cancel(); });
        ["pointerup", "pointercancel", "pointerleave"].forEach(n => modal.addEventListener(n, cancel));
        modal.addEventListener("contextmenu", ev => { if (ev.target.closest && ev.target.closest("[data-box]")) ev.preventDefault(); });
    })();
    document.getElementById("chartModal").addEventListener("click", ev => {   // kliknięcie boxa (Darvas / baza flat) → ceny wejścia, anulowania, stop loss
        const el = ev.target.closest && ev.target.closest("[data-box]");
        if (!el || typeof darvasBoxInfo !== "function") return;
        if (boxLongPressed) { boxLongPressed = false; return; }   // to było przytrzymanie (przypięcie), nie kliknięcie
        const [top, bottom, outcome, conf, i0, i1] = el.dataset.box.split("|");
        const t = currentChart ? currentChart.ticker : "";
        if (currentChart && Number.isFinite(+i0) && i0 !== undefined && i1 !== undefined) {   // przybliż na box: świece + wolumen od początku boxa do dziś (+ miejsce na kolejne tygodnie)
            boxFocus = { ticker: t, top: +top, bottom: +bottom, i0: +i0, i1: +i1, line: outcome === "linia" || outcome === "przypięta-linia" };
            const end = +i1 + 1 + 6;   // clampWindow ucina do końca danych
            chartWindows[0] = { n: Math.max(15, end - (+i0) + 14), end };
            drawChart();
            return;
        }
        showSheet(`${escapeHtml(t)} — box`, darvasBoxSheetHtml(darvasBoxInfo(+top, +bottom), outcome, conf === "1"));
    });
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
    updateLayoutButton();
    // Wyjście z pełnego ekranu klawiszem Esc (obsługuje przeglądarka) synchronizuje stan przycisku i układ.
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && chartFull) setChartFull(false); });
    // Obrót telefonu / zmiana rozmiaru okna przełącza układ kompaktowy bez ponownego otwierania wykresu.
    let resizeTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!currentChart) return;
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
        const cs = await fetchJson("data/watchlist.json");
        if (!cs) throw new Error("brak watchlist.json");
        state.data = cs;
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
        const cs = await fetchJson("data/watchlist.json");
        const mainNew = !!(cs && cs.stocks && cs.stocks.length && cs.generated_at !== state.data.generated_at);
        const oldWatch = watchData && watchData.generated_at;
        const watch = await loadWatchData();   // workflow „Watchlisty” zapisuje własny plik — jego zmiana też odświeża widok
        const watchNew = !!(watch && watch.generated_at !== oldWatch);
        if (!mainNew && !watchNew) return;
        if (mainNew) state.data = cs;
        chartsPromise = null; watchChartsPromise = null; estimatesPromise = null; estimatesMap = null;   // wykresy i estymaty też mogły się zmienić
        if (mainNew) loadEstimates().then(map => { if (map) { fillTargets(state.data.stocks, map); renderTable(); } });
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
        await loadWatchData();
        renderDataInfo();
        renderMarket();
        applyLayoutMode();
        renderHeaders();
        initControls();
        annInitUI(drawChart);
        initAnnotationIO();
        syncInit(() => { updateAlertBadge(); renderTable(); if (!document.getElementById("chartModal").hidden) drawChart(); });
        initBoxesPanel();
        applyLeanUi();
        initSplitResizer();
        showTab(state.tab);
        hideLoadingOverlay();
        refreshBoxesBadge();
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
        weeklyPlan, positionDecision, planStocks,
        darvasPick, darvasPickRows, darvasRank, darvasOrders, ordersText, darvasStateText, tagRisingFromFields,
        stopAdvice, watchListCounts,
        ratingChips, canslimMarket, ftdText, canslimInfo, canslimExplain, canslimSheetHtml, tagCanslim, canslimRows, setCanslimAccel, annualEpsGrowth, baseBoxData, baseSummary, positionSize, fmtShares, stopRuleCheck, positionMetrics, tagPositions, positionRows, positionTotals, swipeDirection, breakoutInfo, tagBreakouts, readinessLine, upsideMain, targetMain, recomLabel, fillTargets, baseRows, actionInfo, tagActions, ACTION_DEFS, setCanslimRs, earningsInDays, mergePrefs, prefsNormalize, applyCommonFilters, tagRising, scoreInRange, natrOk, filterBoxesByNatr, blueprintInfo, marketLines, MARKET_LABELS, ratingClass, decorateCell, githubActionsUrl, sortRows,
        fmtMarketCap, fmtVolume, fmtPct, state, COL, TAB_COLUMNS, tagStrategies, STRATEGIES, TAB_COLUMNS_COMPACT, TAB_TITLES,
    };
}
