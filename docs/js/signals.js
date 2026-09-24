
// UNIVERSES/UNIVERSE_LABELS/formatPrice/STAGE_COLORS/stageCellHtml itd. żyją w
// js/shared.js, initConnStatus/hideLoadingOverlay/showToast w js/qol.js,
// mini-wykresy w js/minicharts.js, findRsEntry/selectTicker/decorateTile/
// chart-modal w js/chart-modal.js — wszystkie ładowane PRZED tym plikiem
// (patrz kolejność <script> w signals.html). Node (tests/js/) nie ładuje
// <script> tagów, więc odtwarzamy to samo współdzielenie globali ręcznie tylko tam.
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./qol.js"));
    Object.assign(globalThis, require("./minicharts.js"));
}

// ============================================================
// "Sygnały" (signals.html) — wydzielone z dashboardu (index.html/app.js, teraz
// "Indeksy") na wyraźną prośbę użytkownika: trzy screenery (Wybicie/TTM
// Squeeze/Continuation), które obejmują CAŁE uniwersa i szukają konkretnych
// setupów, dostały własną stronę zamiast dzielić jedną z pełnymi tabelami
// per-uniwersum. Logika samych screenerów (classify*/combined*/render*) jest
// przeniesiona 1:1 z app.js, bez zmian — patrz CLAUDE.md dla pełnej historii
// tej decyzji. Wykres spółki (okienko modalne, panel TradingView, pełny
// ekran) korzysta z DOKŁADNIE tego samego mechanizmu co "Indeksy", wydzielonego
// do współdzielonego js/chart-modal.js. Ctrl+K (wyszukiwarka) NIE jest tu
// duplikowane — to wygoda specyficzna dla przeglądania pełnych tabel
// per-uniwersum na "Indeksach"; tutaj i tak patrzysz na już wyselekcjonowaną,
// znacznie krótszą listę.
// ============================================================

const WYBICIE_DEFAULT_WINDOW_WEEKS = 6;
const WYBICIE_DEFAULT_MONITOR_WEEKS = 6;
const WYBICIE_DEFAULT_MODE = "MACD_RS";
const WYBICIE_SETTINGS_KEY = "momentum_dashboard_wybicie";

// Continuation, przeprojektowany na TYGODNIOWY (patrz nagłówek klasyfikacji
// niżej) — domyślne minimum konsolidacji 6 tyg., BEZ górnego limitu:
// materiał referencyjny o strategii "lateral consolidation breakout" mówi
// wprost "co najmniej 6 tygodni, dłużej często lepiej", więc nie ma sensu
// odcinać dłuższych, wciąż ważnych baz — usunięty na wyraźną prośbę
// użytkownika (wcześniej był praktyczny górny sufit 16 tyg., suwakiem
// dostosowywalny do 30, ale to nigdy nie było regułą z materiału, tylko
// arbitralnym ograniczeniem).
const CONTINUATION_DEFAULT_MIN_CONSOLIDATION_WEEKS = 6;
const CONTINUATION_DEFAULT_FIRE_LOOKBACK_WEEKS = 3;
const CONTINUATION_DEFAULT_MIN_MOMENTUM_PCT = 0;
// Dwa TWARDE kryteria świecy wybicia z materiału referencyjnego (patrz
// classifyContinuation) — nie mają swoich sliderów (nie o to prosił
// użytkownik), tylko fixed constants jak reszta podobnych progów w tym module.
const CONTINUATION_TEN_WEEK_HIGH_WEEKS = 10;
const CONTINUATION_MIN_BREAKOUT_GAIN_PCT = 5;
const CONTINUATION_MAX_BREAKOUT_GAIN_PCT = 20;
const CONTINUATION_SETTINGS_KEY = "momentum_dashboard_continuation";

// Domyślne progi screenera Qullamaggie (patrz klasyfikacja niżej) — 30% na
// wyraźną prośbę użytkownika (ten sam próg co w oryginalnym skanie), 2-8 tyg.
// konsolidacji (poprawione z 4-6 po ponownym przeglądzie ze slajdem "The
// Breakout" — to jest oryginalny zakres bazy Qullamaggiego, nie 4-6), wybicie
// liczone jeszcze przez 3 tyg. po fakcie.
const QM_DEFAULT_MIN_PERF_PCT = 30;
const QM_DEFAULT_MIN_CONSOLIDATION_WEEKS = 2;
const QM_DEFAULT_MAX_CONSOLIDATION_WEEKS = 8;
const QM_DEFAULT_FIRE_LOOKBACK_WEEKS = 3;
const QM_SETTINGS_KEY = "momentum_dashboard_qullamaggie";

// Dodatkowe potwierdzenie dla BARDZO KRÓTKIEJ konsolidacji (1-2 tyg.) — na
// wyraźną prośbę użytkownika po przeglądzie ze slajdem "The Breakout": sama
// długość squeeze'a 4-8 tyg. jest już wystarczającym potwierdzeniem "prawdziwej"
// bazy, ale 1-2-tygodniowy squeeze to za mało samej długości, żeby odróżnić
// realną, ciasną konsolidację od przypadkowego, chwilowego uspokojenia
// zmienności — więc dla niego DODATKOWO wymagamy, żeby cena w tym okresie
// faktycznie oscylowała w wąskim, ale nie mikroskopijnym przedziale (5-20%
// między szczytem a dołkiem konsolidacji, patrz squeezeConsolidationBox() w
// js/minicharts.js — te same, close-owe granice pudełka, które już liczymy
// dla "poziomu do obserwacji"). Poza tym oknem (3-8 tyg. w domyślnych progach)
// długość squeeze'a sama w sobie jest już dobrym potwierdzeniem i nie wymaga
// tego dodatkowego sprawdzenia.
const QM_TIGHT_RANGE_MAX_WEEKS = 2;
const QM_TIGHT_RANGE_MIN_PCT = 5;
const QM_TIGHT_RANGE_MAX_PCT = 20;

// Okna 1/3/6M w TYGODNIACH, do weeksAgoReturnPct() (js/minicharts.js) — patrz
// komentarz przy classifyQullamaggie: zastąpiło dawne daily_squeeze.return_1m_pct/
// return_3m_pct/return_6m_pct (usunięte razem z całą infrastrukturą dziennych
// danych) bez żadnej nowej danej z backendu, licząc z weekly_chart.close_pct.
const QM_RETURN_1M_WEEKS = 4;
const QM_RETURN_3M_WEEKS = 13;
const QM_RETURN_6M_WEEKS = 26;

// Przełącznik okna TTM Squeeze (10 tyg. / 20 tyg.) — na wyraźną prośbę
// użytkownika, PO tym jak TTM_SQUEEZE_BB_WEEKS/TTM_SQUEEZE_KC_WEEKS w
// run_query.py zostały skrócone z 20 na 10 tyg. (żeby łapać krótkie,
// 2-4-tygodniowe flagi ze skanu Qullamaggiego — patrz CLAUDE.md), użytkownik
// czasem wciąż chce poszukać "tego oryginalnego", dłuższego (20-tyg.) squeeze'a
// zamiast bezpowrotnie stracić do niego dostęp. Backend liczy OBA warianty na
// każdą spółkę i eksportuje je jako DWA pola na tym samym rekordzie:
// `ttm_squeeze_chart` (10 tyg., domyślne) i `ttm_squeeze_chart_20w`
// (oryginalne, 20 tyg.) — squeezeChartFor() niżej wybiera, które z nich czyta
// dana klasyfikacja, w zależności od state.squeezeWindow ("10"/"20").
// Obejmuje WSZYSTKIE cztery screenery tej strony (Wybicie/TTM Squeeze/
// Continuation/Qullamaggie) — każdy z nich w jakiś sposób czyta
// ttm_squeeze_chart (histogram, squeeze_on/squeeze_count/fired), więc jeden,
// wspólny przełącznik nad całą szufladą tabel (nie osobny suwak per zakładka)
// jest tu prostszy i spójniejszy niż duplikowanie go cztery razy.
const SQUEEZE_WINDOW_DEFAULT = "10";
const SQUEEZE_WINDOW_SETTINGS_KEY = "momentum_dashboard_squeeze_window";

// Zwraca ttm_squeeze_chart pasujący do aktualnie wybranego okna — z fallbackiem
// do domyślnego (10-tyg.) pola, gdyby `ttm_squeeze_chart_20w` akurat brakowało
// (starszy, jeszcze niezmigrowany cache JSON-a, ten sam wzorzec co `|| constituents`
// gdzie indziej w tej apce) — lepiej pokazać 10-tyg. dane niż nic.
function squeezeChartFor(c) {
    if (state.squeezeWindow === "20") return c.ttm_squeeze_chart_20w || c.ttm_squeeze_chart;
    return c.ttm_squeeze_chart;
}

const state = {
    data: {},
    selectedTicker: null,
    selectedUniverse: null,
    currentRsEntry: null,
    drawerUniverse: "WYBICIE",
    chartView: "own",
    stageFilter: "ALL",
    sortKey: "rank",
    sortDir: "asc",
    wybicieWindowWeeks: WYBICIE_DEFAULT_WINDOW_WEEKS,
    wybicieMonitorWeeks: WYBICIE_DEFAULT_MONITOR_WEEKS,
    wybicieMode: WYBICIE_DEFAULT_MODE,
    contMinConsolidationWeeks: CONTINUATION_DEFAULT_MIN_CONSOLIDATION_WEEKS,
    contFireLookbackWeeks: CONTINUATION_DEFAULT_FIRE_LOOKBACK_WEEKS,
    contMinMomentumPct: CONTINUATION_DEFAULT_MIN_MOMENTUM_PCT,
    qmMinPerfPct: QM_DEFAULT_MIN_PERF_PCT,
    qmMinConsolidationWeeks: QM_DEFAULT_MIN_CONSOLIDATION_WEEKS,
    qmMaxConsolidationWeeks: QM_DEFAULT_MAX_CONSOLIDATION_WEEKS,
    qmFireLookbackWeeks: QM_DEFAULT_FIRE_LOOKBACK_WEEKS,
    marketTrend: null,
    squeezeWindow: SQUEEZE_WINDOW_DEFAULT,
};

async function loadData() {
    // Pobierane RÓWNOLEGLE, nie po kolei — sp500.json sam waży ~20MB (pełne
    // weekly_chart/mansfield_chart/ttm_squeeze_chart/macd_chart dla wszystkich 500
    // spółek, patrz CLAUDE.md pod FULL_COVERAGE_UNIVERSES), więc sekwencyjny fetch
    // (jeden `await` w pętli) potrafił na wolniejszym łączu blokować NASDAQ100/
    // DOWJONES/WIG20/MWIG40/SWIG80 na długo za sobą, zanim ktokolwiek z nich
    // w ogóle zaczął się pobierać — użytkownik widział pusty ekran/spółki spoza
    // SP500 mimo że dane SP500 same w sobie ładowały się poprawnie, po prostu
    // wolno. Promise.allSettled: każdy plik ląduje niezależnie i tak szybko, jak
    // się pobierze, a błąd jednego (np. timeout na sp500.json) nie opóźnia reszty.
    await Promise.allSettled(UNIVERSES.map(async (u) => {
        try {
            const res = await fetch(`data/${u.toLowerCase()}.json`, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            state.data[u] = await res.json();
        } catch (e) {
            console.error(`Nie udało się wczytać danych dla ${u}:`, e);
            state.data[u] = { universe: u, ref_date: null, n_constituents: 0, constituents: [] };
        }
    }));
    // Filtr rynku dla Continuation (10-tyg. EMA SP500 nad 20-tyg. EMA) — na
    // wyraźną prośbę użytkownika po przeglądzie materiału o strategii
    // "lateral consolidation breakout" (patrz CLAUDE.md). Ten sam
    // sector_strategy.json, który już zasila zakładkę Strategia — informacyjny
    // banner, NIE chowa kandydatów (ta sama konwencja co krok 1 w strategy.js).
    try {
        const res = await fetch("data/sector_strategy.json", { cache: "no-store" });
        if (res.ok) {
            const data = await res.json();
            state.marketTrend = data.trend || null;
        }
    } catch (e) { /* brak danych trendu rynku — OK, banner po prostu się nie pokaże */ }
}

// ============================================================
// WYBICIE — SCREENER (zastąpił dawne zakładki "RSM Stabilne"/"RSM Wzrostowe",
// na wyraźną prośbę użytkownika): spółki, u których JEDNOCZEŚNIE
//   1. tygodniowy MACD (macd_chart.macd, patrz compute_macd_chart w
//      run_query.py) przeciął linię zera W GÓRĘ,
//   2. linia RS 52 tyg. z panelu TTM Squeeze (mansfield_chart.rsm_long — ta
//      sama, którą rysuje renderRelativeStrengthChart na panelu TTM Squeeze)
//      przecięła linię zera W GÓRĘ,
//   3. histogram TTM Squeeze (ttm_squeeze_chart.histogram) jest dodatni.
// "Przeciął" = wartość jest TERAZ > 0, a wcześniej była <= 0 — liczymy, ile
// tygodni temu nastąpiło OSTATNIE takie przecięcie (weeksSinceZeroCrossUp).
// Dwa parametry, każdy z własnym suwakiem nad tabelą (#wybicieControls):
//   - OKNO WYBICIA (state.wybicieWindowWeeks): maks. odstęp w tygodniach między
//     przecięciem MACD a przecięciem RS 52 tyg. — oba sygnały muszą przyjść
//     blisko siebie, żeby liczyć się jako jedno wybicie (0 = ten sam tydzień).
//   - MONITOROWANIE PO WYBICIU (state.wybicieMonitorWeeks): przez ile tygodni
//     po wybiciu (= późniejszym z dwóch przecięć, bo dopiero wtedy oba warunki
//     są spełnione) spółka zostaje na liście — pod warunkiem, że MACD, RS 52
//     tyg. i histogram TTM wciąż są nad zerem (spadek któregokolwiek pod zero
//     zdejmuje ją z listy od razu).
// Każdy wskaźnik ma własną tablicę dat, więc "teraz" to ostatni tydzień z
// NIE-null wartością w danej serii (ten sam caveat co w classifyTtmSqueeze —
// najnowszy tydzień bywa null).
//
// TRYB (state.wybicieMode, przełącznik nad tabelą, #wybicieModeMacdRsBtn /
// #wybicieModeMacdOnlyBtn) — dodany na wyraźną prośbę użytkownika ("dodaj
// selector bez wybicia RS 52 tygodnie, samo MACD tygodniowe"):
//   - "MACD_RS" (domyślny, jak opisano wyżej) — wymaga WSZYSTKICH TRZECH
//     warunków 1-3, włącznie z przecięciem RS 52 tyg. blisko przecięcia MACD
//     (OKNO WYBICIA ma tu sens i suwak jest widoczny).
//   - "MACD_ONLY" — pomija warunek 2 (RS 52 tyg.) CAŁKOWICIE: liczy się
//     wyłącznie przecięcie zera w górę przez tygodniowy MACD (warunek 1) i
//     dodatni histogram TTM (warunek 3, bez zmian). OKNO WYBICIA nie ma tu
//     zastosowania (nie ma drugiego przecięcia, z którym porównywać odstęp) —
//     suwak jest wtedy ukryty, breakoutWeeks = macdCrossWeeks wprost. Linia
//     RS 52 tyg. jest nadal liczona i pokazywana w tabeli/kafelkach jako
//     informacja (może być dodatnia bez świeżego przecięcia, ujemna, albo
//     brakująca), po prostu przestaje być warunkiem WEJŚCIA na listę.
// ============================================================

// Ile tygodni temu seria przecięła zero w górę (1 = w ostatnim tygodniu), albo
// null, gdy teraz nie jest > 0 albo w oknie lookbacku (domyślnie cała seria)
// ani razu nie była <= 0.
function weeksSinceZeroCrossUp(arr, lookback = Infinity) {
    const nowIdx = latestNonNullIdx(arr);
    if (nowIdx < 0 || !(arr[nowIdx] > 0)) return null;
    for (let k = 1; k <= lookback; k++) {
        const j = nowIdx - k;
        if (j < 0) return null;
        if (arr[j] != null && arr[j] <= 0) return k;
    }
    return null;
}

// Zwraca null, gdy spółka nie spełnia wszystkich warunków (albo brakuje
// danych) — celowo wyselekcjonowany screener, nie pełna lista.
function classifyWybicie(ticker, universe, c, opts = {}) {
    const mode = opts.mode ?? state.wybicieMode;
    const windowWeeks = opts.windowWeeks ?? state.wybicieWindowWeeks;
    const monitorWeeks = opts.monitorWeeks ?? state.wybicieMonitorWeeks;
    const macd = c.macd_chart && c.macd_chart.macd;
    const rsLong = c.mansfield_chart && c.mansfield_chart.rsm_long;
    const squeezeChart = squeezeChartFor(c);
    const hist = squeezeChart && squeezeChart.histogram;
    if (!macd || !hist) return null;

    const macdCrossWeeks = weeksSinceZeroCrossUp(macd);
    if (macdCrossWeeks == null) return null;

    let rsCrossWeeks = null;
    let breakoutWeeks;
    if (mode === "MACD_ONLY") {
        breakoutWeeks = macdCrossWeeks;
    } else {
        if (!rsLong) return null;
        rsCrossWeeks = weeksSinceZeroCrossUp(rsLong);
        if (rsCrossWeeks == null) return null;
        if (Math.abs(macdCrossWeeks - rsCrossWeeks) > windowWeeks) return null;
        breakoutWeeks = Math.min(macdCrossWeeks, rsCrossWeeks);
    }
    if (breakoutWeeks > monitorWeeks) return null;
    const histIdx = latestNonNullIdx(hist);
    if (histIdx < 0 || !(hist[histIdx] > 0)) return null;

    return {
        ticker, universe, sector: c.sector, price: c.price,
        momentum_pct: c.momentum_pct,
        current_stage: c.weekly_chart && c.weekly_chart.current_stage,
        macdNow: macd[latestNonNullIdx(macd)],
        macdCrossWeeks,
        rsLongNow: rsLong && latestNonNullIdx(rsLong) >= 0 ? rsLong[latestNonNullIdx(rsLong)] : null,
        rsCrossWeeks,
        breakoutWeeks,
        histNow: hist[histIdx],
        ...miniVisualFields(c, squeezeChart),
        mini_macd: macd.slice(-MINI_WEEKS),
        mini_macd_cross: crossIndexInTail(macd, macdCrossWeeks, MINI_WEEKS),
        mini_rs: rsLong ? rsLong.slice(-MINI_WEEKS) : [],
        mini_rs_cross: rsCrossWeeks != null ? crossIndexInTail(rsLong, rsCrossWeeks, MINI_WEEKS) : null,
    };
}

// Lista połączona ze WSZYSTKICH uniwersów (all_constituents — całe uniwersa,
// nie tylko bieżący top-decyl), bez duplikatów: spółka obecna w dwóch
// uniwersach naraz (np. SP500 i NASDAQ100) pojawia się raz, z pierwszego
// uniwersum w kolejności UNIVERSES. Sortowanie: najświeższe wybicie na górze,
// potem mocniejszy histogram.
function combinedWybicieCandidates(opts = {}) {
    const rows = [];
    const seen = new Set();
    UNIVERSES.forEach(u => {
        const universeData = state.data[u] || {};
        (universeData.all_constituents || universeData.constituents || []).forEach(c => {
            if (seen.has(c.ticker)) return;
            const r = classifyWybicie(c.ticker, u, c, opts);
            if (!r) return;
            seen.add(c.ticker);
            rows.push(r);
        });
    });
    rows.sort((a, b) => (a.breakoutWeeks - b.breakoutWeeks) || (b.histNow - a.histNow));
    return rows;
}

// ============================================================
// TTM SQUEEZE — SCREENER: szuka spółek z Momentum (momentum_score > 0),
// które przeszły przez WIELOTYGODNIOWĄ konsolidację (Bollinger Bands ściśnięte
// wewnątrz kanału Kellera — "squeeze", patrz compute_ttm_squeeze_chart w
// run_query.py) i albo WCIĄŻ w niej trwają dłużej niż TTM_SQUEEZE_MIN_
// CONSOLIDATION_WEEKS tygodni (status "consolidating" — kandydat do
// obserwacji), albo WŁAŚNIE z takiej konsolidacji wybiły się w ostatnich
// TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS tygodniach W GÓRĘ (status "fired" — świeży
// początek nowego ruchu, dokładnie to, o co prosił użytkownik: "akcje, które
// zaczynają ruszać po takiej konsolidacji"). "fired" wymaga TERAZ też
// histNow > 0 (aktualny histogram TTM dodatni) — samo wygaśnięcie squeeze
// (`fired` z backendu) nie mówi w którą stronę cena wybiła, więc bez tego
// warunku do listy trafiały też WYBICIA W DÓŁ (histogram ujemny), czyli
// dokładnie odwrotność tego, czego szuka ten screener. Stałe MUSZĄ być
// zsynchronizowane z tymi samymi stałymi w run_query.py.
// ============================================================
const TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS = 5;
const TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS = 3;

// Klasyfikuje jedną spółkę na podstawie jej ttm_squeeze_chart. Zwraca null gdy
// brakuje danych, gdy spółka akurat nie ma Momentum (momentum_score <= 0), albo
// gdy nie pasuje do żadnego z dwóch statusów (squeeze trwający zbyt krótko,
// dawno wygasłe wybicie itd.) — celowo wyselekcjonowany screener, nie pełna
// lista wszystkich spółek.
function classifyTtmSqueeze(ticker, universe, c) {
    if (!(c.momentum_score > 0)) return null;
    const t = squeezeChartFor(c);
    if (!t || !t.dates || t.dates.length === 0) return null;
    // Ostatni element bywa jeszcze niedomknięty (aktualny tydzień bywa null,
    // zanim run_query.py doliczy pełne dane) — cofamy się do ostatniego tygodnia, który faktycznie ma
    // policzony squeeze_on.
    let nowIdx = t.dates.length - 1;
    while (nowIdx >= 0 && t.squeeze_on[nowIdx] == null) nowIdx--;
    if (nowIdx < 0) return null;

    const squeezeOn = t.squeeze_on[nowIdx];
    const squeezeCount = t.squeeze_count[nowIdx];
    const weeksSinceFire = t.weeks_since_fire[nowIdx];
    const fireConsolidationWeeks = t.fire_consolidation_weeks[nowIdx];
    const histNow = t.histogram[nowIdx];

    const isConsolidating = squeezeOn === true && squeezeCount > TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS;
    const isFired = weeksSinceFire != null && weeksSinceFire <= TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS
        && fireConsolidationWeeks != null && fireConsolidationWeeks > TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS
        && histNow != null && histNow > 0;
    if (!isConsolidating && !isFired) return null;

    return {
        ticker, universe, sector: c.sector, price: c.price,
        momentum_pct: c.momentum_pct,
        current_stage: c.weekly_chart && c.weekly_chart.current_stage,
        status: isFired ? "fired" : "consolidating",
        consolidation_weeks: isFired ? fireConsolidationWeeks : squeezeCount,
        weeks_since_fire: isFired ? weeksSinceFire : null,
        histNow,
        ...miniVisualFields(c, t),
    };
}

// Zwraca listę połączoną ze WSZYSTKICH 6 uniwersów (patrz combinedWybicieCandidates
// powyżej — ten sam wzorzec: całe kwalifikujące się uniwersa, nie tylko
// bieżący top-decyl dla SP500/NASDAQ100), posortowaną: najpierw świeże
// wybicia (najnowsze na górze), potem trwające konsolidacje (najdłuższe na
// górze — najbardziej "ściśnięte").
function combinedTtmSqueezeCandidates() {
    const rows = [];
    UNIVERSES.forEach(u => {
        const universeData = state.data[u] || {};
        (universeData.all_constituents || universeData.constituents || []).forEach(c => {
            const r = classifyTtmSqueeze(c.ticker, u, c);
            if (r) rows.push(r);
        });
    });
    rows.sort((a, b) => {
        if (a.status !== b.status) return a.status === "fired" ? -1 : 1;
        if (a.status === "fired") return a.weeks_since_fire - b.weeks_since_fire;
        return b.consolidation_weeks - a.consolidation_weeks;
    });
    return rows;
}

// ============================================================
// QULLAMAGGIE — SCREENER (na wyraźną prośbę użytkownika): replika skanu
// Kristjana Qullamaggie'go — duży wcześniejszy ruch (30%+ w 6 miesięcy — patrz
// UPROSZCZENIE poniżej: to jeden warunek zamiast osobnego OR po 1/3/6M), po
// którym spółka wchodzi w kilkutygodniową konsolidację (TTM Squeeze na wykresie
// TYGODNIOWYM — inaczej niż "Continuation" powyżej, które patrzy na KRÓTKĄ
// pauzę na D1; tu chodzi o dłuższą, kilkutygodniową bazę, klasyczne "2-8
// tygodni" ze skanu — patrz slajd "The Breakout"), a wybicie z niej jest
// potwierdzone wolumenem KUPUJĄCYCH (ten sam próg STAGE_BREAKOUT_VOLUME_RATIO
// co reszta apki).
//
// Sama długość squeeze'a 3-8 tyg. jest już wystarczającym potwierdzeniem
// "prawdziwej" bazy (a nie przypadkowego, chwilowego uspokojenia zmienności);
// dla BARDZO KRÓTKIEJ konsolidacji (1-2 tyg., QM_TIGHT_RANGE_MAX_WEEKS)
// wymagamy DODATKOWO, żeby cena w tym okresie faktycznie oscylowała w
// odpowiednio wąskim przedziale (5-20% między szczytem a dołkiem konsolidacji,
// qmTightRangeConfirmed() poniżej) — inaczej 1-2-tygodniowy "squeeze" zbyt
// łatwo trafiałby na przypadkowy tydzień niskiej zmienności, nie na realną
// bazę.
//
// Wejście na wykresie 1-minutowym (ORB — Opening Range Breakout — z sesyjnym
// VWAP) NIE jest tu automatyzowane: to wymagałoby danych śróddziennych,
// których ten pipeline nie pobiera (tylko dzienne świece, tygodniowy
// cykl odświeżania — patrz CLAUDE.md). Zamiast tego każdy wiersz otwiera,
// przez zwykły przycisk wykresu (📈, patrz ttmSqueezeRowHtml/qmRowHtml),
// tę samą wspólną modalkę wykresu co reszta apki — a w niej trzecią zakładkę
// "⚡ 1 min + VWAP" (patrz js/chart-modal.js) z osadzonym widgetem
// TradingView Advanced Chart na interwale 1 min + studium VWAP: użytkownik
// sam monitoruje wybicie z zakresu otwarcia na żywo, apka tylko wskazuje
// KTÓRE spółki warto obserwować danego dnia.
//
// UPROSZCZENIE (na wyraźną prośbę użytkownika, po przeglądzie): perf_pct to
// TERAZ WYŁĄCZNIE return_6m_pct, nie max(1M, 3M, 6M) — 6-miesięczne okno w
// praktyce OBEJMUJE też ruch, który dopiero co (w 1 lub 3 miesiące) wypchnął
// cenę o 30%+ (cena z przed 6 miesięcy jest zwykle zbliżona do ceny z przed
// 1/3 miesięcy, jeśli w tym czasie nie było odwrotnego ruchu), więc osobny OR
// po trzech oknach był zbędną komplikacją. return_1m_pct/return_3m_pct wciąż
// czytane i pokazywane (tooltip w qmPerfCellHtml) jako informacja — wszystkie
// trzy liczone z weekly_chart (weeksAgoReturnPct(), js/minicharts.js), nie z
// dziennych danych (cała ta infrastruktura, wraz z daily_squeeze/przyciskiem
// "Odśwież dane D1", została usunięta — patrz CLAUDE.md).
function qullamaggieOpts(opts) {
    return {
        minPerfPct: opts.minPerfPct ?? state.qmMinPerfPct,
        minConsolidationWeeks: opts.minConsolidationWeeks ?? state.qmMinConsolidationWeeks,
        maxConsolidationWeeks: opts.maxConsolidationWeeks ?? state.qmMaxConsolidationWeeks,
        fireLookbackWeeks: opts.fireLookbackWeeks ?? state.qmFireLookbackWeeks,
    };
}

// Potwierdzenie dla bardzo krótkiej (<= QM_TIGHT_RANGE_MAX_WEEKS) konsolidacji
// — patrz komentarz przy tej konstancie. Zakres liczymy z TEGO SAMEGO,
// close-owego pudełka co breakoutLevelFor() (squeezeConsolidationBox(), js/
// minicharts.js), nie z realnego dziennego High/Low — Darvas (i cała reszta
// tego modułu) świadomie pracuje na zamknięciach, patrz CLAUDE.md.
function qmTightRangeConfirmed(c) {
    const box = squeezeConsolidationBox(c, squeezeChartFor(c));
    const wc = c.weekly_chart;
    if (!box || box.resistance_pct == null || box.support_pct == null) return false;
    if (!wc || !wc.close_pct || !wc.close_pct.length || !(c.price > 0)) return false;
    const lastPct = wc.close_pct[wc.close_pct.length - 1];
    if (lastPct == null) return false;
    const close0 = c.price / (1 + lastPct / 100);
    const resistance = close0 * (1 + box.resistance_pct / 100);
    const support = close0 * (1 + box.support_pct / 100);
    if (!(support > 0)) return false;
    const rangePct = (resistance - support) / support * 100;
    return rangePct >= QM_TIGHT_RANGE_MIN_PCT && rangePct <= QM_TIGHT_RANGE_MAX_PCT;
}

function classifyQullamaggie(ticker, universe, c, opts = {}) {
    const o = qullamaggieOpts(opts);
    // Uproszczone na wyraźną prośbę użytkownika: sam zwrot 6-miesięczny jest
    // wystarczającym warunkiem (zamiast osobnego OR po 1/3/6M) — 6-miesięczne
    // okno w praktyce OBEJMUJE też ruch, który dopiero co (w ciągu 1 lub 3
    // miesięcy) wypchnął cenę o 30%+, bo cena z przed 6 miesięcy jest zwykle
    // zbliżona do ceny z przed 1/3 miesięcy, jeśli w tym czasie nie było
    // odwrotnego ruchu. Liczone z weekly_chart (weeksAgoReturnPct(), js/
    // minicharts.js) — zastąpiło dawne daily_squeeze.return_6m_pct razem z całą
    // usuniętą infrastrukturą dziennych danych, patrz CLAUDE.md. return_1m_pct/
    // return_3m_pct nadal liczone i pokazywane (tooltip w qmPerfCellHtml) —
    // tylko jako informacja, nie jako osobny warunek bramki.
    const return6m = weeksAgoReturnPct(c, QM_RETURN_6M_WEEKS);
    if (return6m == null) return null;
    const perfPct = return6m;
    if (!(perfPct >= o.minPerfPct)) return null;

    const t = squeezeChartFor(c);
    if (!t || !t.dates || t.dates.length === 0) return null;
    // Ostatni tydzień bywa jeszcze niedomknięty — patrz ten sam caveat w classifyTtmSqueeze.
    let nowIdx = t.dates.length - 1;
    while (nowIdx >= 0 && t.squeeze_on[nowIdx] == null) nowIdx--;
    if (nowIdx < 0) return null;

    const squeezeOn = t.squeeze_on[nowIdx];
    const squeezeCount = t.squeeze_count[nowIdx];
    const weeksSinceFire = t.weeks_since_fire[nowIdx];
    const fireConsolidationWeeks = t.fire_consolidation_weeks[nowIdx];
    const histNow = t.histogram[nowIdx];

    const isConsolidating = squeezeOn === true
        && squeezeCount >= o.minConsolidationWeeks && squeezeCount <= o.maxConsolidationWeeks;
    const isFired = weeksSinceFire != null && weeksSinceFire <= o.fireLookbackWeeks
        && fireConsolidationWeeks != null
        && fireConsolidationWeeks >= o.minConsolidationWeeks && fireConsolidationWeeks <= o.maxConsolidationWeeks
        && histNow != null && histNow > 0;
    if (!isConsolidating && !isFired) return null;

    const consolidationWeeks = isFired ? fireConsolidationWeeks : squeezeCount;
    // Bardzo krótki squeeze (<= QM_TIGHT_RANGE_MAX_WEEKS) potrzebuje dodatkowego
    // potwierdzenia zakresem ceny — patrz komentarz przy tej konstancie i
    // qmTightRangeConfirmed() powyżej. Dłuższy squeeze (typowe 3-8 tyg. w
    // domyślnych progach) jest już wystarczającym potwierdzeniem samą długością.
    if (consolidationWeeks <= QM_TIGHT_RANGE_MAX_WEEKS && !qmTightRangeConfirmed(c)) return null;

    // Potwierdzenie wolumenem kupujących W TYGODNIU WYBICIA — tylko dla
    // "fired" (przy trwającej konsolidacji nie ma jeszcze wybicia do
    // potwierdzenia). ttm_squeeze_chart i weekly_chart mają NIEKONIECZNIE tę
    // samą długość bufora rozgrzewki (patrz alignSqueezeToDates w
    // chart-render.js), więc łączymy je po DACIE, nie po indeksie wprost.
    let breakoutVolumeRatio = null;
    if (isFired) {
        const breakoutDate = t.dates[nowIdx - weeksSinceFire];
        const wc = c.weekly_chart;
        const wcIdx = wc && wc.dates ? wc.dates.indexOf(breakoutDate) : -1;
        if (wcIdx >= 0 && wc.buying_volume_ratio) breakoutVolumeRatio = wc.buying_volume_ratio[wcIdx];
    }
    const breakoutVolumeConfirmed = breakoutVolumeRatio != null && breakoutVolumeRatio >= STAGE_BREAKOUT_VOLUME_RATIO;

    return {
        ticker, universe, sector: c.sector, price: c.price,
        return_1m_pct: weeksAgoReturnPct(c, QM_RETURN_1M_WEEKS),
        return_3m_pct: weeksAgoReturnPct(c, QM_RETURN_3M_WEEKS),
        return_6m_pct: return6m,
        perf_pct: perfPct,
        current_stage: c.weekly_chart && c.weekly_chart.current_stage,
        status: isFired ? "fired" : "consolidating",
        consolidation_weeks: consolidationWeeks,
        weeks_since_fire: isFired ? weeksSinceFire : null,
        histNow,
        breakout_volume_ratio: breakoutVolumeRatio,
        breakout_volume_confirmed: breakoutVolumeConfirmed,
        // Poziom oporu/wsparcia "do obserwowania" (breakoutLevelFor(), js/
        // minicharts.js) — na wyraźną prośbę użytkownika, żeby nie trzeba było
        // zgadywać przy jakiej cenie wypatrywać wybicia na 1-minutowym wykresie
        // (zakładka "⚡ 1 min + VWAP", chart-modal.js). Ten sam pomocnik liczy to
        // dla obu miejsc, z tych samych pól (weekly_chart.pending_base/bases).
        breakout_level: breakoutLevelFor(c, t),
        ...miniVisualFields(c, t),
    };
}

// Zwraca listę połączoną ze WSZYSTKICH 6 uniwersów, bez duplikatów, posortowaną:
// świeże wybicia (najnowsze na górze, potwierdzone wolumenem pierwsze przy
// remisie tygodnia), potem trwające konsolidacje (najdłuższe, czyli
// najbliższe wybicia, na górze).
function combinedQullamaggieCandidates(opts = {}) {
    const rows = [];
    const seen = new Set();
    UNIVERSES.forEach(u => {
        const universeData = state.data[u] || {};
        (universeData.all_constituents || universeData.constituents || []).forEach(c => {
            if (seen.has(c.ticker)) return;
            const r = classifyQullamaggie(c.ticker, u, c, opts);
            if (r) { rows.push(r); seen.add(c.ticker); }
        });
    });
    rows.sort((a, b) => {
        if (a.status !== b.status) return a.status === "fired" ? -1 : 1;
        if (a.status === "fired") {
            if (a.weeks_since_fire !== b.weeks_since_fire) return a.weeks_since_fire - b.weeks_since_fire;
            return (b.breakout_volume_confirmed ? 1 : 0) - (a.breakout_volume_confirmed ? 1 : 0);
        }
        return b.consolidation_weeks - a.consolidation_weeks;
    });
    return rows;
}

// ============================================================
// CONTINUATION — SCREENER, PRZEPROJEKTOWANY NA TYGODNIOWY (na wyraźną prośbę
// użytkownika, po przeglądzie materiału o strategii "lateral consolidation
// breakout" na wykresie tygodniowym, który użytkownik wskazał jako bliski
// temu, co już robimy — patrz CLAUDE.md dla pełnej historii). Wcześniejsza
// wersja patrzyła na krótką pauzę na D1 (dzienny TTM Squeeze) — CAŁA
// infrastruktura dziennych danych (daily_squeeze, docs/data/continuation.json,
// przycisk "Odśwież dane D1", refresh_daily.py) została usunięta: użytkownik
// uznał, że wymaga za dużo zachodu (ręczne odświeżanie, dane "z weekendu"
// nieaktualne w tygodniu) i wolał oprzeć wszystko na tygodniowym cyklu, który
// już i tak jest głównym rytmem tej apki. Spółka jest JUŻ w dynamicznym
// Etapie 2, a konsolidacja/wybicie liczone są z TEGO SAMEGO tygodniowego TTM
// Squeeze co zakładki "🧨 TTM Squeeze"/"🎯 Qullamaggie" (nie z Darvasa) —
// tylko z innymi domyślnymi progami i BEZ wymogu dużego wcześniejszego ruchu
// (to jest to, co odróżnia Continuation od Qullamaggie: tu liczy się WYŁĄCZNIE
// to, że spółka jest już w potwierdzonym trendzie, nie że wcześniej zrobiła
// duży ruch). Tylko filtr sygnałów: wejście/wyjście użytkownik decyduje sam —
// "poziom do obserwacji"/"sugerowany stop" (breakoutLevelFor(), js/
// minicharts.js) to punkt odniesienia, nie automatyczna rekomendacja.
//
// Trend (tydzień, continuationWeeklyGate — NIEZMIENIONE z poprzedniej wersji):
//   current_stage 2A/2B, momentum 12M-1M > 0 (i >= suwak "Min. momentum",
//   domyślnie 0), klasyczny Mansfield RS 52 tyg. (mansfield_chart.rsm_long) > 0
//   (silniejsza od swojego indeksu).
// Konsolidacja (tygodniowy TTM Squeeze, ttm_squeeze_chart — TA SAMA logika co
//   w Qullamaggie/TTM Squeeze, patrz tam, tylko inne domyślne progi):
//   - "squeeze" 🌀 — squeeze trwa co najmniej tyle tygodni, ile suwak "Min.
//     tyg. konsolidacji" — BEZ górnego limitu,
//   - "fired" 🔥 — squeeze odpalił w ostatnich "Wybicie w ciągu" tygodniach po
//     konsolidacji spełniającej to samo minimum, a histogram jest dodatni
//     (wybicie w GÓRĘ, nie w dół).
//   Domyślne minimum to 6 tyg. (NIE 2 jak w Qullamaggie) — materiał
//   referencyjny mówi wprost "co najmniej 6 tygodni, dłużej często lepiej",
//   bez górnego limitu. Wcześniej istniał też praktyczny górny sufit (suwak,
//   domyślnie 16 tyg.) — usunięty na wyraźną prośbę użytkownika: nigdy nie
//   był regułą z materiału, tylko arbitralnym ograniczeniem, a dłuższa baza
//   nie powinna sama w sobie wykluczać spółki z listy.
// Potwierdzenie tygodniowym MACD (macd_chart) — na wzór materiału
//   referencyjnego ("linia MACD nad linią sygnału" jako stały wymóg pozycji):
//   liczone WYŁĄCZNIE dla "fired" (przy trwającej konsolidacji nie ma jeszcze
//   wybicia do potwierdzenia) — macd.macd > macd.signal w tygodniu wybicia,
//   dopasowane po DACIE (ten sam wzorzec co breakout_volume_ratio w
//   Qullamaggie, bo macd_chart i ttm_squeeze_chart mogą mieć różne bufory
//   rozgrzewki). Informacyjne (`macd_confirmed`) — NIE odrzuca wiersza, tak
//   jak wolumen w Qullamaggie: to sygnał jakości, nie twardy warunek.
// ============================================================

function continuationWeeklyGate(c, minMomentumPct) {
    const stage = c.weekly_chart && c.weekly_chart.current_stage;
    if (stage !== "2A" && stage !== "2B") return null;
    if (!(c.momentum_pct > 0) || !(c.momentum_pct >= minMomentumPct)) return null;
    const rsLong = c.mansfield_chart && c.mansfield_chart.rsm_long;
    const rsIdx = latestNonNullIdx(rsLong);
    if (rsIdx < 0 || !(rsLong[rsIdx] > 0)) return null;
    return { stage, rsLong: rsLong[rsIdx] };
}

function continuationOpts(opts) {
    return {
        minConsolidationWeeks: opts.minConsolidationWeeks ?? state.contMinConsolidationWeeks,
        fireLookbackWeeks: opts.fireLookbackWeeks ?? state.contFireLookbackWeeks,
        minMomentumPct: opts.minMomentumPct ?? state.contMinMomentumPct,
    };
}

function classifyContinuation(ticker, universe, c, opts = {}) {
    const o = continuationOpts(opts);
    const gate = continuationWeeklyGate(c, o.minMomentumPct);
    if (!gate) return null;

    const t = squeezeChartFor(c);
    if (!t || !t.dates || t.dates.length === 0) return null;
    // Ostatni tydzień bywa jeszcze niedomknięty — patrz ten sam caveat w classifyTtmSqueeze/classifyQullamaggie.
    let nowIdx = t.dates.length - 1;
    while (nowIdx >= 0 && t.squeeze_on[nowIdx] == null) nowIdx--;
    if (nowIdx < 0) return null;

    const squeezeOn = t.squeeze_on[nowIdx];
    const squeezeCount = t.squeeze_count[nowIdx];
    const weeksSinceFire = t.weeks_since_fire[nowIdx];
    const fireConsolidationWeeks = t.fire_consolidation_weeks[nowIdx];
    const histNow = t.histogram[nowIdx];

    // BEZ górnego limitu na wyraźną prośbę użytkownika — tylko minimum
    // konsolidacji, patrz komentarz przy CONTINUATION_DEFAULT_MIN_CONSOLIDATION_WEEKS.
    const isConsolidating = squeezeOn === true && squeezeCount >= o.minConsolidationWeeks;
    const isFired = weeksSinceFire != null && weeksSinceFire <= o.fireLookbackWeeks
        && fireConsolidationWeeks != null
        && fireConsolidationWeeks >= o.minConsolidationWeeks
        && histNow != null && histNow > 0;
    if (!isConsolidating && !isFired) return null;

    const consolidationWeeks = isFired ? fireConsolidationWeeks : squeezeCount;

    // Potwierdzenie tygodniowym MACD + dwa TWARDE kryteria świecy wybicia z
    // materiału referencyjnego (patrz komentarz nad blokiem klasyfikacji) —
    // wszystkie liczone TYLKO dla "fired", dopasowane po DACIE (macd_chart/
    // weekly_chart mogą mieć różne bufory rozgrzewki niż ttm_squeeze_chart,
    // patrz alignSqueezeToDates/alignMacdToDates w chart-render.js):
    //   - macdConfirmed: informacyjne (jak wolumen w Qullamaggie) — NIE odrzuca wiersza.
    //   - tenWeekHigh: świeca wybicia musi być NAJWYŻSZYM zamknięciem z ostatnich
    //     CONTINUATION_TEN_WEEK_HIGH_WEEKS (10) tygodni — TWARDY warunek, ale
    //     tylko gdy realnie policzony (== false), nie gdy brak historii (null).
    //   - breakoutGainPct: zysk tygodnia wybicia względem poprzedniego zamknięcia
    //     musi wypadać w [MIN, MAX] % (5-20) — też TWARDY warunek pod tym samym
    //     zastrzeżeniem. Oba liczone z już wyeksportowanego weekly_chart.close_pct,
    //     bez żadnej nowej danej z backendu.
    let macdConfirmed = null;
    let tenWeekHigh = null;
    let breakoutGainPct = null;
    if (isFired) {
        const breakoutDate = t.dates[nowIdx - weeksSinceFire];
        const mc = c.macd_chart;
        const mcIdx = mc && mc.dates ? mc.dates.indexOf(breakoutDate) : -1;
        if (mcIdx >= 0 && mc.macd && mc.signal && mc.macd[mcIdx] != null && mc.signal[mcIdx] != null) {
            macdConfirmed = mc.macd[mcIdx] > mc.signal[mcIdx];
        }

        const wc = c.weekly_chart;
        const wcIdx = wc && wc.dates ? wc.dates.indexOf(breakoutDate) : -1;
        if (wcIdx >= 0 && wc.close_pct) {
            const closeNow = wc.close_pct[wcIdx];
            if (closeNow != null && wcIdx >= CONTINUATION_TEN_WEEK_HIGH_WEEKS) {
                const windowVals = wc.close_pct
                    .slice(wcIdx - CONTINUATION_TEN_WEEK_HIGH_WEEKS, wcIdx + 1)
                    .filter(v => v != null);
                tenWeekHigh = closeNow >= Math.max(...windowVals);
            }
            const prevPct = wcIdx > 0 ? wc.close_pct[wcIdx - 1] : null;
            if (closeNow != null && prevPct != null) {
                breakoutGainPct = ((1 + closeNow / 100) / (1 + prevPct / 100) - 1) * 100;
            }
        }
        if (tenWeekHigh === false) return null;
        if (breakoutGainPct != null
            && (breakoutGainPct < CONTINUATION_MIN_BREAKOUT_GAIN_PCT || breakoutGainPct > CONTINUATION_MAX_BREAKOUT_GAIN_PCT)) {
            return null;
        }
    }

    return {
        ticker, universe, sector: c.sector, price: c.price,
        current_stage: gate.stage, rs_long: gate.rsLong, momentum_pct: c.momentum_pct,
        status: isFired ? "fired" : "squeeze",
        consolidation_weeks: consolidationWeeks,
        weeks_since_fire: isFired ? weeksSinceFire : null,
        macd_confirmed: macdConfirmed,
        ten_week_high: tenWeekHigh,
        breakout_gain_pct: breakoutGainPct,
        // Poziom oporu/wsparcia "do obserwowania" + sugerowany stop (dolna
        // granica środkowej tercji pudełka) — ten sam wspólny helper co
        // Qullamaggie, patrz breakoutLevelFor() w js/minicharts.js.
        breakout_level: breakoutLevelFor(c, t),
        ...miniVisualFields(c, t),
    };
}

// Wszystkie uniwersa, bez duplikatów (pierwsze wystąpienie w kolejności
// UNIVERSES wygrywa — jak combinedWybicieCandidates). Kolejność: świeże
// wybicia (najnowsze na górze), potem trwające konsolidacje (najmocniejsze
// momentum 12M na górze) — ten sam wzorzec co combinedTtmSqueezeCandidates/
// combinedQullamaggieCandidates.
function combinedContinuationCandidates(opts = {}) {
    const rows = [];
    const seen = new Set();
    UNIVERSES.forEach(u => {
        const universeData = state.data[u] || {};
        (universeData.all_constituents || universeData.constituents || []).forEach(c => {
            if (seen.has(c.ticker)) return;
            const r = classifyContinuation(c.ticker, u, c, opts);
            if (r) { rows.push(r); seen.add(c.ticker); }
        });
    });
    rows.sort((a, b) => {
        if (a.status !== b.status) return a.status === "fired" ? -1 : 1;
        if (a.status === "fired" && a.weeks_since_fire !== b.weeks_since_fire) return a.weeks_since_fire - b.weeks_since_fire;
        return b.momentum_pct - a.momentum_pct;
    });
    return rows;
}

// ============================================================
// SIDEBAR (kafelki 💥 Wybicie / 🧨 TTM Squeeze / 🚀 Continuation)
// ============================================================

// Sidebar: kafelki screenera Wybicie (patrz combinedWybicieCandidates powyżej).
function renderWybiciePanel() {
    const container = document.getElementById("tiles-WYBICIE");
    if (!container) return;

    const rows = combinedWybicieCandidates();
    const meta = document.getElementById("wybicieMeta");
    if (meta) meta.textContent = `${rows.length} spółek`;

    container.innerHTML = "";
    rows.forEach(r => {
        const tile = document.createElement("div");
        tile.className = "ticker-tile";
        tile.textContent = r.ticker;
        tile.title = `${r.ticker} — ${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")} · `
            + `wybicie ${r.breakoutWeeks} tyg. temu · MACD > 0 od ${r.macdCrossWeeks} tyg. · `
            + (r.rsCrossWeeks != null ? `RS 52 tyg. > 0 od ${r.rsCrossWeeks} tyg. · ` : "")
            + `histogram TTM ${r.histNow.toFixed(2)}`;
        tile.dataset.ticker = r.ticker;
        tile.dataset.universe = r.universe;
        decorateTile(tile, r.current_stage, r.rsLongNow);
        if (r.ticker === state.selectedTicker) tile.classList.add("selected");
        tile.addEventListener("click", () => selectTicker(r.ticker, r.universe));
        container.appendChild(tile);
    });
    if (rows.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
        empty.textContent = "brak danych";
        container.appendChild(empty);
    }
}

// Sidebar: kafelki screenera TTM Squeeze (patrz combinedTtmSqueezeCandidates
// powyżej) — ten sam wzorzec co renderWybiciePanel, jedna wspólna, już posortowana
// lista (świeże wybicia przed trwającymi konsolidacjami).
function renderTtmSqueezePanel() {
    const container = document.getElementById("tiles-TTM-squeeze");
    if (!container) return;

    const rows = combinedTtmSqueezeCandidates();
    const meta = document.getElementById("ttmSqueezeMeta");
    if (meta) meta.textContent = `${rows.length} spółek`;

    container.innerHTML = "";
    rows.forEach(r => {
        const tile = document.createElement("div");
        tile.className = "ticker-tile";
        tile.textContent = r.ticker;
        tile.title = r.status === "fired"
            ? `${r.ticker} — ${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")} · `
                + `wybicie ${r.weeks_since_fire} tyg. temu, po ${r.consolidation_weeks} tyg. konsolidacji`
            : `${r.ticker} — ${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")} · `
                + `w konsolidacji od ${r.consolidation_weeks} tyg.`;
        tile.dataset.ticker = r.ticker;
        tile.dataset.universe = r.universe;
        decorateTile(tile, r.current_stage, r.rs_long);
        if (r.ticker === state.selectedTicker) tile.classList.add("selected");
        tile.addEventListener("click", () => selectTicker(r.ticker, r.universe));
        container.appendChild(tile);
    });
    if (rows.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
        empty.textContent = "brak danych";
        container.appendChild(empty);
    }
}

// Baner filtra rynku dla Continuation (10-tyg. EMA SP500 nad 20-tyg. EMA) —
// czysto informacyjny, nie chowa żadnych kandydatów (patrz komentarz przy
// classifyContinuation/loadData). `state.marketTrend` = pole "trend" z
// docs/data/sector_strategy.json, ładowane raz w loadData().
function renderMarketTrendBanner() {
    const el = document.getElementById("continuationMarketBanner");
    if (!el) return;
    const t = state.marketTrend;
    if (!t || t.weekly_ema_bullish == null) {
        el.className = "trend-banner";
        el.textContent = "Filtr rynku (SP500, 10 vs 20 tyg. EMA): za mało historii, żeby policzyć.";
        return;
    }
    if (t.weekly_ema_bullish) {
        el.className = "trend-banner growth";
        el.textContent = `🟢 SP500 W TRENDZIE WZROSTOWYM — 10-tyg. EMA (${t.ema10w}) nad 20-tyg. EMA (${t.ema20w}), stan na ${t.date}.`;
    } else {
        el.className = "trend-banner no-growth";
        el.textContent = `🔴 SP500 POZA TRENDEM WZROSTOWYM — 10-tyg. EMA (${t.ema10w}) pod 20-tyg. EMA (${t.ema20w}), stan na ${t.date}. Wg materiału referencyjnego to sygnał, żeby zostać w cashu — kandydaci poniżej wciąż widoczni, decyzja jest Twoja.`;
    }
}

// Sidebar: kafelki screenera Continuation (patrz combinedContinuationCandidates).
function renderContinuationPanel() {
    const container = document.getElementById("tiles-CONTINUATION");
    if (!container) return;

    const rows = combinedContinuationCandidates();
    const meta = document.getElementById("continuationMeta");
    if (meta) meta.textContent = `${rows.length} spółek`;

    container.innerHTML = "";
    rows.forEach(r => {
        const tile = document.createElement("div");
        tile.className = "ticker-tile";
        tile.textContent = r.ticker;
        tile.title = `${r.ticker} — ${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")} · Etap ${r.current_stage} · `
            + (r.status === "fired"
                ? `D1 squeeze odpalił ${r.days_since_fire} sesji temu (po ${r.squeeze_days} sesjach)`
                : `D1 squeeze od ${r.squeeze_days} sesji`);
        tile.dataset.ticker = r.ticker;
        tile.dataset.universe = r.universe;
        decorateTile(tile, r.current_stage, r.rs_long);
        if (r.ticker === state.selectedTicker) tile.classList.add("selected");
        tile.addEventListener("click", () => selectTicker(r.ticker, r.universe));
        container.appendChild(tile);
    });
    if (rows.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
        empty.textContent = "brak danych";
        container.appendChild(empty);
    }
}

// Sidebar: kafelki screenera Qullamaggie (patrz combinedQullamaggieCandidates powyżej).
function renderQullamaggiePanel() {
    const container = document.getElementById("tiles-QULLAMAGGIE");
    if (!container) return;

    const rows = combinedQullamaggieCandidates();
    const meta = document.getElementById("qullamaggieMeta");
    if (meta) meta.textContent = `${rows.length} spółek`;

    container.innerHTML = "";
    rows.forEach(r => {
        const tile = document.createElement("div");
        tile.className = "ticker-tile";
        tile.textContent = r.ticker;
        tile.title = `${r.ticker} — ${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")} · `
            + `wynik ${r.perf_pct.toFixed(0)}% (6M) · `
            + (r.status === "fired"
                ? `wybicie ${r.weeks_since_fire} tyg. temu po ${r.consolidation_weeks} tyg. konsolidacji`
                    + (r.breakout_volume_confirmed ? " · wolumen potwierdzony" : "")
                : `w konsolidacji od ${r.consolidation_weeks} tyg.`);
        tile.dataset.ticker = r.ticker;
        tile.dataset.universe = r.universe;
        decorateTile(tile, r.current_stage, null);
        if (r.ticker === state.selectedTicker) tile.classList.add("selected");
        tile.addEventListener("click", () => selectTicker(r.ticker, r.universe));
        container.appendChild(tile);
    });
    if (rows.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
        empty.textContent = "brak danych";
        container.appendChild(empty);
    }
}

// ============================================================
// SZUFLADA TABEL: cztery zakładki (Wybicie / TTM Squeeze / Continuation /
// Qullamaggie), bez pełnej tabeli per-uniwersum (ta zostaje na "Indeksach",
// patrz app.js) — stąd prostszy dispatcher niż showDrawerTable/
// renderActiveDrawerTable w app.js (nie ma tam "if universe is one of
// SIDEBAR_TAB_UNIVERSES" gałęzi, bo tu każda zakładka to zawsze jeden z tych
// czterech screenerów).
// ============================================================
function matchesStageFilter(stage) {
    if (state.stageFilter === "ALL") return true;
    if (!stage) return false;
    if (state.stageFilter === "2") return stage === "2A" || stage === "2B";
    return stage === state.stageFilter;
}

function updateSortHeaderClasses() {
    document.querySelectorAll("table.momentum-table thead th").forEach(th => {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.dataset.key === state.sortKey) {
            th.classList.add(state.sortDir === "asc" ? "sort-asc" : "sort-desc");
        }
    });
}

function showSignalsTable(tab) {
    document.getElementById("wybicieTable").hidden = tab !== "WYBICIE";
    document.getElementById("wybicieControls").hidden = tab !== "WYBICIE";
    document.getElementById("wybicieGuide").hidden = tab !== "WYBICIE";
    document.getElementById("ttmSqueezeTable").hidden = tab !== "TTM_SQUEEZE";
    document.getElementById("ttmSqueezeGuide").hidden = tab !== "TTM_SQUEEZE";
    document.getElementById("continuationTable").hidden = tab !== "CONTINUATION";
    document.getElementById("continuationControls").hidden = tab !== "CONTINUATION";
    document.getElementById("continuationMarketBanner").hidden = tab !== "CONTINUATION";
    document.getElementById("continuationGuide").hidden = tab !== "CONTINUATION";
    document.getElementById("qullamaggieTable").hidden = tab !== "QULLAMAGGIE";
    document.getElementById("qullamaggieControls").hidden = tab !== "QULLAMAGGIE";
    document.getElementById("qullamaggieGuide").hidden = tab !== "QULLAMAGGIE";
    document.getElementById("drawerTitle").textContent = tab === "WYBICIE"
        ? "Pełna tabela — Wybicie"
        : tab === "TTM_SQUEEZE"
            ? "Pełna tabela — TTM Squeeze"
            : tab === "CONTINUATION"
                ? "Continuation — Etap 2 + konsolidacja tygodniowa"
                : "Qullamaggie — duży ruch + konsolidacja + wybicie z wolumenem";
    renderActiveSignalsTable();
}

function renderActiveSignalsTable() {
    if (state.drawerUniverse === "WYBICIE") renderWybicieTable();
    else if (state.drawerUniverse === "TTM_SQUEEZE") renderTtmSqueezeTable();
    else if (state.drawerUniverse === "CONTINUATION") renderContinuationTable();
    else renderQullamaggieTable();
}

function initSignalsDrawer() {
    document.querySelectorAll(".drawer-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".drawer-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            state.drawerUniverse = tab.dataset.universe;
            showSignalsTable(state.drawerUniverse);
        });
    });

    document.querySelectorAll("table.momentum-table thead th").forEach(th => {
        th.addEventListener("click", () => {
            const key = th.dataset.key;
            if (!key) return; // kolumny bez sortowania (Etap, TV)
            if (state.sortKey === key) {
                state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
            } else {
                state.sortKey = key;
                state.sortDir = "asc";
            }
            updateSortHeaderClasses();
            renderActiveSignalsTable();
        });
    });
}

function initStageFilter() {
    const bar = document.getElementById("stageFilterBar");
    if (!bar) return;
    bar.querySelectorAll(".stage-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            state.stageFilter = btn.dataset.stage;
            bar.querySelectorAll(".stage-filter-btn").forEach(b => b.classList.toggle("active", b === btn));
            renderActiveSignalsTable();
        });
    });
}

function crossWeeksHtml(weeks) {
    return weeks === 1 ? "w ost. tyg." : `${weeks} tyg. temu`;
}

function wybicieRowHtml(r, position) {
    // W trybie "MACD_ONLY" (patrz classifyWybicie) RS 52 tyg. nie jest warunkiem
    // wejścia na listę — rsLongNow/rsCrossWeeks bywają wtedy null (brak danych
    // albo po prostu brak świeżego przecięcia). Kolumna pozostaje informacyjna:
    // pokazuje aktualną wartość gdy jest dostępna (kolor wg znaku, nie zawsze
    // "positive"), bez wieku przecięcia gdy go nie ma.
    const rsCell = r.rsLongNow != null
        ? `<span class="cell-spark">${zeroLineSparkSvg(r.mini_rs, r.mini_rs_cross)}<span>${r.rsLongNow.toFixed(2)}`
            + (r.rsCrossWeeks != null ? ` <span class="cross-age">(${crossWeeksHtml(r.rsCrossWeeks)})</span>` : "")
            + `</span></span>`
        : `<span class="spark-empty">—</span>`;
    const rsCellClass = r.rsLongNow == null ? "" : r.rsLongNow >= 0 ? "positive" : "negative";
    const rsTitle = r.rsCrossWeeks != null
        ? `RS 52 tyg. (${MINI_WEEKS} tyg.), złota kropka = przecięcie zera w górę ${crossWeeksHtml(r.rsCrossWeeks)}`
        : `RS 52 tyg. (${MINI_WEEKS} tyg.) — informacyjnie, nie jest wymagane w trybie „Samo MACD tygodniowe”`;
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${r.ticker}</td>
        <td>${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")}</td>
        <td>${r.sector || ""}</td>
        <td>${formatPrice(r.price, r.universe)}</td>
        <td>${crossWeeksHtml(r.breakoutWeeks)}</td>
        <td title="Cena tygodniowa (${MINI_WEEKS} tyg.) + EMA20">${weeklySparkSvg(r.mini_closes, r.mini_ema)}</td>
        <td class="positive" title="MACD tygodniowy (${MINI_WEEKS} tyg.), złota kropka = przecięcie zera w górę ${crossWeeksHtml(r.macdCrossWeeks)}"><span class="cell-spark">${zeroLineSparkSvg(r.mini_macd, r.mini_macd_cross)}<span>${r.macdNow.toFixed(2)} <span class="cross-age">(${crossWeeksHtml(r.macdCrossWeeks)})</span></span></span></td>
        <td class="${rsCellClass}" title="${rsTitle}">${rsCell}</td>
        <td title="TTM Squeeze tygodniowy (${MINI_WEEKS} tyg.)">${ttmMiniSvg(r.mini_hist, r.mini_sq_on, r.mini_fired)}</td>
        <td>${stageCellHtml(r.current_stage)}</td>
        <td>${tvRowButtonHtml(r.ticker, r.universe)}</td>
    `;
}

// Tekst linijki meta nad tabelą, wspólny dla Wybicia i TTM Squeeze — obie
// płaskie, wielo-uniwersalne listy liczą "brak danych" po tym, czy
// JAKIKOLWIEK z uniwersów ma już ref_date (a nie po jednym konkretnym
// uniwersum, jak w renderTable na "Indeksach").
function flatScreenerMetaText(allRows, rows) {
    const refDates = UNIVERSES.map(u => state.data[u].ref_date).filter(Boolean);
    if (!refDates.length) return "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).";
    let text = `Rebalans: ${refDates[0]} · `;
    text += state.stageFilter === "ALL"
        ? `${allRows.length} spółek`
        : `${rows.length} z ${allRows.length} spółek (etap ${state.stageFilter === "2" ? "2A/2B" : state.stageFilter})`;
    return text;
}

// Tabela screenera Wybicie — sortowalna i filtrowalna po etapie, tak jak
// pozostałe tabele, na płaskiej, wielo-uniwersalnej liście z
// combinedWybicieCandidates().
function renderWybicieTable() {
    const allRows = combinedWybicieCandidates();
    const emptyAllMsg = state.wybicieMode === "MACD_ONLY"
        ? `Brak spółek z wybiciem w ostatnich ${state.wybicieMonitorWeeks} tyg. (tygodniowy MACD przeciął zero w górę, histogram TTM dodatni).`
        : `Brak spółek z wybiciem w ostatnich ${state.wybicieMonitorWeeks} tyg. (MACD i RS 52 tyg. przecięły zero w odstępie ≤ ${state.wybicieWindowWeeks} tyg., histogram TTM dodatni).`;

    renderScreenerTable({
        tbody: document.getElementById("wybicieTableBody"),
        metaEl: document.getElementById("drawerMeta"),
        allRows,
        matchesStage: state.stageFilter === "ALL" ? null : (r => matchesStageFilter(r.current_stage)),
        sortKey: state.sortKey, sortDir: state.sortDir,
        colspan: 12,
        emptyAllMsg,
        emptyFilteredMsg: "Żadna spółka nie pasuje do wybranego etapu.",
        metaText: (rows) => flatScreenerMetaText(allRows, rows),
        rowKey: r => r.ticker,
        isSelected: r => r.ticker === state.selectedTicker,
        rowHtml: (r, i) => wybicieRowHtml(r, i + 1),
        onRowClick: r => selectTicker(r.ticker, r.universe),
        afterRender: bindTvRowButtons,
    });
}

// Pokazuje/ukrywa suwak "Okno wybicia" — nie ma zastosowania w trybie
// "MACD_ONLY" (nie ma drugiego przecięcia, z którym porównywać odstęp).
function applyWybicieModeVisibility() {
    const row = document.getElementById("wybicieWindowRow");
    if (row) row.hidden = state.wybicieMode === "MACD_ONLY";
    const macdRsBtn = document.getElementById("wybicieModeMacdRsBtn");
    const macdOnlyBtn = document.getElementById("wybicieModeMacdOnlyBtn");
    if (macdRsBtn) macdRsBtn.classList.toggle("active", state.wybicieMode !== "MACD_ONLY");
    if (macdOnlyBtn) macdOnlyBtn.classList.toggle("active", state.wybicieMode === "MACD_ONLY");
}

// Przełącznik okna TTM Squeeze (#squeezeWindowBar, 10 tyg./20 tyg. — patrz
// komentarz przy SQUEEZE_WINDOW_DEFAULT/squeezeChartFor) — WSPÓLNY dla
// wszystkich czterech screenerów tej strony, więc po zmianie trzeba odświeżyć
// zarówno kafelki w sidebarze WSZYSTKICH czterech grup, jak i aktualnie
// otwartą tabelę w szufladzie (renderActiveSignalsTable — dispatchuje po
// state.drawerUniverse). Zapamiętywane per przeglądarka w localStorage, jak
// reszta suwaków/przełączników na tej stronie.
function initSqueezeWindowControls() {
    try {
        const saved = localStorage.getItem(SQUEEZE_WINDOW_SETTINGS_KEY);
        if (saved === "10" || saved === "20") state.squeezeWindow = saved;
    } catch (e) { /* brak localStorage — zostaje domyślne */ }

    const btn10 = document.getElementById("squeezeWindow10Btn");
    const btn20 = document.getElementById("squeezeWindow20Btn");
    const applyActive = () => {
        if (btn10) btn10.classList.toggle("active", state.squeezeWindow === "10");
        if (btn20) btn20.classList.toggle("active", state.squeezeWindow === "20");
    };
    applyActive();

    [btn10, btn20].forEach(btn => {
        if (!btn) return;
        btn.addEventListener("click", () => {
            if (state.squeezeWindow === btn.dataset.window) return;
            state.squeezeWindow = btn.dataset.window;
            applyActive();
            try { localStorage.setItem(SQUEEZE_WINDOW_SETTINGS_KEY, state.squeezeWindow); } catch (e) { /* ignoruj */ }
            renderWybiciePanel();
            renderTtmSqueezePanel();
            renderContinuationPanel();
            renderQullamaggiePanel();
            renderActiveSignalsTable();
        });
    });
}

// Przełącznik trybu (#wybicieModeMacdRsBtn/#wybicieModeMacdOnlyBtn) i suwaki
// nad tabelą Wybicie (#wybicieControls): tryb, okno wybicia i czas
// monitorowania po wybiciu (patrz opis nad classifyWybicie). Wartości
// zapamiętywane per przeglądarka w localStorage — tylko wygoda, strona działa
// też bez niego (try/catch — tryb prywatny itp.).
function initWybicieControls() {
    try {
        const saved = JSON.parse(localStorage.getItem(WYBICIE_SETTINGS_KEY) || "null");
        if (saved) {
            if (Number.isFinite(saved.windowWeeks)) state.wybicieWindowWeeks = saved.windowWeeks;
            if (Number.isFinite(saved.monitorWeeks)) state.wybicieMonitorWeeks = saved.monitorWeeks;
            if (saved.mode === "MACD_ONLY" || saved.mode === "MACD_RS") state.wybicieMode = saved.mode;
        }
    } catch (e) { /* brak localStorage — zostają domyślne */ }

    const saveMode = () => {
        try {
            localStorage.setItem(WYBICIE_SETTINGS_KEY, JSON.stringify({
                windowWeeks: state.wybicieWindowWeeks, monitorWeeks: state.wybicieMonitorWeeks,
                mode: state.wybicieMode,
            }));
        } catch (e) { /* ignoruj */ }
    };

    applyWybicieModeVisibility();
    [document.getElementById("wybicieModeMacdRsBtn"), document.getElementById("wybicieModeMacdOnlyBtn")]
        .forEach(btn => {
            if (!btn) return;
            btn.addEventListener("click", () => {
                if (state.wybicieMode === btn.dataset.mode) return;
                state.wybicieMode = btn.dataset.mode;
                applyWybicieModeVisibility();
                saveMode();
                renderWybiciePanel();
                if (state.drawerUniverse === "WYBICIE") renderWybicieTable();
            });
        });

    const bind = (inputId, valueId, stateKey) => {
        const input = document.getElementById(inputId);
        const valueEl = document.getElementById(valueId);
        if (!input) return;
        input.value = state[stateKey];
        if (valueEl) valueEl.textContent = `${state[stateKey]} tyg.`;
        input.addEventListener("input", () => {
            state[stateKey] = Number(input.value);
            if (valueEl) valueEl.textContent = `${state[stateKey]} tyg.`;
            saveMode();
            renderWybiciePanel();
            if (state.drawerUniverse === "WYBICIE") renderWybicieTable();
        });
    };
    bind("wybicieWindowInput", "wybicieWindowValue", "wybicieWindowWeeks");
    bind("wybicieMonitorInput", "wybicieMonitorValue", "wybicieMonitorWeeks");
}

function ttmSqueezeStatusHtml(r) {
    return r.status === "fired"
        ? `<span class="squeeze-status squeeze-status-fired">🔥 Wybicie (${r.weeks_since_fire} tyg. temu)</span>`
        : `<span class="squeeze-status squeeze-status-consolidating">🌀 Konsolidacja</span>`;
}

function ttmSqueezeRowHtml(r, position) {
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${r.ticker}</td>
        <td>${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")}</td>
        <td>${r.sector}</td>
        <td>${formatPrice(r.price, r.universe)}</td>
        <td class="${r.momentum_pct >= 0 ? "positive" : "negative"}">${r.momentum_pct.toFixed(2)}%</td>
        <td>${ttmSqueezeStatusHtml(r)}</td>
        <td>${r.consolidation_weeks} tyg.</td>
        <td title="Cena tygodniowa (${MINI_WEEKS} tyg.) + EMA20; czerwone kreski = tygodnie squeeze'a">${weeklySparkSvg(r.mini_closes, r.mini_ema, r.mini_sq_flags)}</td>
        <td title="TTM Squeeze tygodniowy (${MINI_WEEKS} tyg.): słupki = momentum, czerwona kropka = squeeze, złota = wybicie">${ttmMiniSvg(r.mini_hist, r.mini_sq_on, r.mini_fired)}</td>
        <td>${rsBarHtml(r.rs_long)}</td>
        <td>${stageCellHtml(r.current_stage)}</td>
        <td>${tvRowButtonHtml(r.ticker, r.universe)}</td>
    `;
}

// Tabela screenera TTM Squeeze — sortowalna i filtrowalna po etapie, tak jak
// tabela Wybicie, na płaskiej, wielo-uniwersalnej liście z
// combinedTtmSqueezeCandidates() (już posortowanej: wybicia przed
// konsolidacjami — ta kolejność bazowa jest tu nadpisywana sortowaniem
// użytkownika, jeśli jakieś wybrał).
function renderTtmSqueezeTable() {
    const allRows = combinedTtmSqueezeCandidates();

    renderScreenerTable({
        tbody: document.getElementById("ttmSqueezeTableBody"),
        metaEl: document.getElementById("drawerMeta"),
        allRows,
        matchesStage: state.stageFilter === "ALL" ? null : (r => matchesStageFilter(r.current_stage)),
        sortKey: state.sortKey, sortDir: state.sortDir,
        colspan: 13,
        emptyAllMsg: "Brak danych.",
        emptyFilteredMsg: "Żadna spółka nie pasuje do wybranego etapu.",
        metaText: (rows) => flatScreenerMetaText(allRows, rows),
        rowKey: r => r.ticker,
        isSelected: r => r.ticker === state.selectedTicker,
        rowHtml: (r, i) => ttmSqueezeRowHtml(r, i + 1),
        onRowClick: r => selectTicker(r.ticker, r.universe),
        afterRender: bindTvRowButtons,
    });
}

// Wynik 6M (= perf_pct, patrz classifyQullamaggie) — dymek dodatkowo pokazuje
// 1M/3M informacyjnie (nie są już częścią warunku bramki, tylko kontekstem —
// np. czy większość ruchu przyszła niedawno, czy jest rozłożona równomiernie).
function qmReturnHtml(v) {
    return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
}

function qmPerfCellHtml(r) {
    const title = `6M: ${qmReturnHtml(r.perf_pct)} · 1M: ${qmReturnHtml(r.return_1m_pct)} · 3M: ${qmReturnHtml(r.return_3m_pct)}`;
    return `<span class="positive" title="${title}">+${r.perf_pct.toFixed(0)}%</span>`;
}

function qmStatusHtml(r) {
    if (r.status === "fired") {
        const volBadge = r.breakout_volume_confirmed
            ? `<span class="cross-age" title="Wolumen kupujących w tygodniu wybicia ≥ ${STAGE_BREAKOUT_VOLUME_RATIO}x średniej">· wolumen ✓</span>`
            : r.breakout_volume_ratio != null
                ? `<span class="cross-age" title="Wolumen kupujących w tygodniu wybicia poniżej ${STAGE_BREAKOUT_VOLUME_RATIO}x średniej">· wolumen ✗</span>`
                : "";
        return `<span class="squeeze-status squeeze-status-fired">🔥 Wybicie (${r.weeks_since_fire} tyg. temu)</span> ${volBadge}`;
    }
    return `<span class="squeeze-status squeeze-status-consolidating">🌀 Konsolidacja</span>`;
}

// Poziom "do obserwowania" (breakoutLevelFor(), js/minicharts.js): opór
// (▲, zielony) + wsparcie (▼, czerwony) gdy znane. `pending: false` (box już
// skonsumowany przez wcześniejsze wybicie, patrz breakoutLevelFor) obniża
// opacity — to referencyjny, nie aktualny poziom.
function qmLevelCellHtml(r) {
    const lvl = r.breakout_level;
    if (!lvl) return `<span class="spark-empty">—</span>`;
    const style = lvl.pending ? "" : ' style="opacity:0.6"';
    const support = lvl.support != null
        ? ` <span class="orb-level-value negative">▼ ${formatPrice(lvl.support, r.universe)}</span>` : "";
    return `<span${style} title="${lvl.pending ? "Poziom konsolidacji, w której spółka wciąż siedzi" : "Opór ostatniej przełamanej bazy (referencyjnie)"}${lvl.startDate ? ` — baza od ${lvl.startDate}` : ""}">`
        + `<span class="orb-level-value positive">▲ ${formatPrice(lvl.resistance, r.universe)}</span>${support}</span>`;
}

function qmRowHtml(r, position) {
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${r.ticker}</td>
        <td>${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")}</td>
        <td>${r.sector || ""}</td>
        <td>${formatPrice(r.price, r.universe)}</td>
        <td title="Zwrot z ostatnich 6 miesięcy (dymek: także 1M/3M informacyjnie)">${qmPerfCellHtml(r)}</td>
        <td>${qmStatusHtml(r)}</td>
        <td>${r.consolidation_weeks} tyg.</td>
        <td title="Cena, przy której warto obserwować 1-minutowy wykres (zakładka „⚡ 1 min + VWAP” po kliknięciu w wiersz)">${qmLevelCellHtml(r)}</td>
        <td title="Cena tygodniowa (${MINI_WEEKS} tyg.) + EMA20; czerwone kreski = tygodnie squeeze'a">${weeklySparkSvg(r.mini_closes, r.mini_ema, r.mini_sq_flags)}</td>
        <td title="TTM Squeeze tygodniowy (${MINI_WEEKS} tyg.): słupki = momentum, czerwona kropka = squeeze, złota = wybicie">${ttmMiniSvg(r.mini_hist, r.mini_sq_on, r.mini_fired)}</td>
        <td>${stageCellHtml(r.current_stage)}</td>
        <td>${tvRowButtonHtml(r.ticker, r.universe)}</td>
    `;
}

// Tabela screenera Qullamaggie — sortowalna i filtrowalna po etapie, tak jak
// pozostałe tabele, na płaskiej, wielo-uniwersalnej liście z
// combinedQullamaggieCandidates().
function renderQullamaggieTable() {
    const allRows = combinedQullamaggieCandidates();

    renderScreenerTable({
        tbody: document.getElementById("qullamaggieTableBody"),
        metaEl: document.getElementById("drawerMeta"),
        allRows,
        matchesStage: state.stageFilter === "ALL" ? null : (r => matchesStageFilter(r.current_stage)),
        sortKey: state.sortKey, sortDir: state.sortDir,
        colspan: 13,
        emptyAllMsg: `Brak spółek z ruchem ≥ ${state.qmMinPerfPct}% (6M) i konsolidacją ${state.qmMinConsolidationWeeks}-${state.qmMaxConsolidationWeeks} tyg. (trwającą albo świeżo zakończoną wybiciem).`,
        emptyFilteredMsg: "Żadna spółka nie pasuje do wybranego etapu.",
        metaText: (rows) => flatScreenerMetaText(allRows, rows),
        rowKey: r => r.ticker,
        isSelected: r => r.ticker === state.selectedTicker,
        rowHtml: (r, i) => qmRowHtml(r, i + 1),
        onRowClick: r => selectTicker(r.ticker, r.universe),
        afterRender: bindTvRowButtons,
    });
}

// Suwaki nad tabelą Qullamaggie (#qullamaggieControls) — ten sam wzorzec co
// initWybicieControls/initContinuationControls, własny klucz localStorage.
function initQullamaggieControls() {
    try {
        const saved = JSON.parse(localStorage.getItem(QM_SETTINGS_KEY) || "null");
        if (saved) {
            if (Number.isFinite(saved.minPerfPct)) state.qmMinPerfPct = saved.minPerfPct;
            if (Number.isFinite(saved.minConsolidationWeeks)) state.qmMinConsolidationWeeks = saved.minConsolidationWeeks;
            if (Number.isFinite(saved.maxConsolidationWeeks)) state.qmMaxConsolidationWeeks = saved.maxConsolidationWeeks;
            if (Number.isFinite(saved.fireLookbackWeeks)) state.qmFireLookbackWeeks = saved.fireLookbackWeeks;
        }
    } catch (e) { /* brak localStorage — zostają domyślne */ }

    const save = () => {
        try {
            localStorage.setItem(QM_SETTINGS_KEY, JSON.stringify({
                minPerfPct: state.qmMinPerfPct,
                minConsolidationWeeks: state.qmMinConsolidationWeeks,
                maxConsolidationWeeks: state.qmMaxConsolidationWeeks,
                fireLookbackWeeks: state.qmFireLookbackWeeks,
            }));
        } catch (e) { /* ignoruj */ }
    };

    const bind = (inputId, valueId, stateKey, unit) => {
        const input = document.getElementById(inputId);
        const valueEl = document.getElementById(valueId);
        if (!input) return;
        input.value = state[stateKey];
        if (valueEl) valueEl.textContent = `${state[stateKey]}${unit}`;
        input.addEventListener("input", () => {
            state[stateKey] = Number(input.value);
            if (valueEl) valueEl.textContent = `${state[stateKey]}${unit}`;
            save();
            renderQullamaggiePanel();
            if (state.drawerUniverse === "QULLAMAGGIE") renderQullamaggieTable();
        });
    };
    bind("qmMinPerfInput", "qmMinPerfValue", "qmMinPerfPct", "%");
    bind("qmMinConsolidationInput", "qmMinConsolidationValue", "qmMinConsolidationWeeks", " tyg.");
    bind("qmMaxConsolidationInput", "qmMaxConsolidationValue", "qmMaxConsolidationWeeks", " tyg.");
    bind("qmFireLookbackInput", "qmFireLookbackValue", "qmFireLookbackWeeks", " tyg.");
}

// Status + odznaka potwierdzenia tygodniowym MACD dla "fired" (patrz komentarz
// nad classifyContinuation) — ten sam wzorzec co wolumen w qmStatusHtml, tylko
// inne potwierdzenie jakości wybicia.
function continuationStatusHtml(r) {
    if (r.status === "fired") {
        const macdBadge = r.macd_confirmed === true
            ? `<span class="cross-age" title="Tygodniowy MACD nad linią sygnału w tygodniu wybicia">· MACD ✓</span>`
            : r.macd_confirmed === false
                ? `<span class="cross-age" title="Tygodniowy MACD POD linią sygnału w tygodniu wybicia">· MACD ✗</span>`
                : "";
        const gainBadge = r.breakout_gain_pct != null
            ? `<span class="cross-age" title="Zysk tygodnia wybicia względem poprzedniego zamknięcia">· +${r.breakout_gain_pct.toFixed(1)}%</span>`
            : "";
        return `<span class="squeeze-status squeeze-status-fired">🔥 Wybicie (${r.weeks_since_fire} tyg. temu)</span> ${macdBadge} ${gainBadge}`;
    }
    return `<span class="squeeze-status squeeze-status-consolidating">🌀 Konsolidacja</span>`;
}

function continuationRowHtml(r, position) {
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${r.ticker}</td>
        <td>${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")}</td>
        <td>${r.sector || ""}</td>
        <td>${formatPrice(r.price, r.universe)}</td>
        <td class="positive">${r.momentum_pct.toFixed(1)}%</td>
        <td class="positive">${r.rs_long.toFixed(1)}</td>
        <td>${continuationStatusHtml(r)}</td>
        <td>${r.consolidation_weeks} tyg.</td>
        <td title="Cena, przy której warto obserwować wybicie; dymek pokazuje też sugerowany stop (dolna granica środkowej tercji konsolidacji)">${qmLevelCellHtml(r)}</td>
        <td title="Cena tygodniowa (${MINI_WEEKS} tyg.) + EMA20; czerwone kreski = tygodnie squeeze'a">${weeklySparkSvg(r.mini_closes, r.mini_ema, r.mini_sq_flags)}</td>
        <td title="TTM Squeeze tygodniowy (${MINI_WEEKS} tyg.): słupki = momentum, czerwona kropka = squeeze, złota = wybicie">${ttmMiniSvg(r.mini_hist, r.mini_sq_on, r.mini_fired)}</td>
        <td>${stageCellHtml(r.current_stage)}</td>
        <td>${tvRowButtonHtml(r.ticker, r.universe)}</td>
    `;
}

function renderContinuationTable() {
    const allRows = combinedContinuationCandidates();

    renderScreenerTable({
        tbody: document.getElementById("continuationTableBody"),
        metaEl: document.getElementById("drawerMeta"),
        allRows,
        matchesStage: state.stageFilter === "ALL" ? null : (r => matchesStageFilter(r.current_stage)),
        sortKey: state.sortKey, sortDir: state.sortDir,
        colspan: 13,
        emptyAllMsg: `Brak spółek w Etapie 2 (momentum > 0 i ≥ ${state.contMinMomentumPct}%, RS 52 tyg. > 0) z konsolidacją tygodniową ≥ ${state.contMinConsolidationWeeks} tyg. (trwającą albo świeżo zakończoną wybiciem).`,
        emptyFilteredMsg: "Żadna spółka nie pasuje do wybranego etapu.",
        metaText: (rows) => flatScreenerMetaText(allRows, rows),
        rowKey: r => r.ticker,
        isSelected: r => r.ticker === state.selectedTicker,
        rowHtml: (r, i) => continuationRowHtml(r, i + 1),
        onRowClick: r => selectTicker(r.ticker, r.universe),
        afterRender: bindTvRowButtons,
    });
}

// Suwaki nad tabelą Continuation (#continuationControls) — ten sam wzorzec co
// initWybicieControls, własny klucz localStorage.
function initContinuationControls() {
    try {
        const saved = JSON.parse(localStorage.getItem(CONTINUATION_SETTINGS_KEY) || "null");
        if (saved) {
            if (Number.isFinite(saved.minConsolidationWeeks)) state.contMinConsolidationWeeks = saved.minConsolidationWeeks;
            if (Number.isFinite(saved.fireLookbackWeeks)) state.contFireLookbackWeeks = saved.fireLookbackWeeks;
            if (Number.isFinite(saved.minMomentumPct)) state.contMinMomentumPct = saved.minMomentumPct;
        }
    } catch (e) { /* brak localStorage — zostają domyślne */ }

    const bind = (inputId, valueId, stateKey, unit) => {
        const input = document.getElementById(inputId);
        const valueEl = document.getElementById(valueId);
        if (!input) return;
        input.value = state[stateKey];
        if (valueEl) valueEl.textContent = `${state[stateKey]}${unit}`;
        input.addEventListener("input", () => {
            state[stateKey] = Number(input.value);
            if (valueEl) valueEl.textContent = `${state[stateKey]}${unit}`;
            try {
                localStorage.setItem(CONTINUATION_SETTINGS_KEY, JSON.stringify({
                    minConsolidationWeeks: state.contMinConsolidationWeeks,
                    fireLookbackWeeks: state.contFireLookbackWeeks,
                    minMomentumPct: state.contMinMomentumPct,
                }));
            } catch (e) { /* ignoruj */ }
            renderContinuationPanel();
            if (state.drawerUniverse === "CONTINUATION") renderContinuationTable();
        });
    };
    bind("contMinConsolidationInput", "contMinConsolidationValue", "contMinConsolidationWeeks", " tyg.");
    bind("contFireLookbackInput", "contFireLookbackValue", "contFireLookbackWeeks", " tyg.");
    bind("contMinMomentumInput", "contMinMomentumValue", "contMinMomentumPct", "%");
}

// ============================================================
// INIT
// ============================================================
// typeof document check: pozwala wczytać ten plik przez `require()` w testach
// Node (patrz tests/js/) bez uruchamiania inicjalizacji strony — w przeglądarce
// document zawsze istnieje, więc zachowanie się nie zmienia.
if (typeof document !== "undefined") {
    (async function init() {
        initConnStatus();
        await loadData();
        initSqueezeWindowControls();
        initWybicieControls();
        initContinuationControls();
        initQullamaggieControls();
        renderWybiciePanel();
        renderTtmSqueezePanel();
        renderContinuationPanel();
        renderMarketTrendBanner();
        renderQullamaggiePanel();
        initSignalsDrawer();
        initOpenTvButton();
        initResetZoomButton();
        initMansfieldControls();
        initChartViewTabs();
        initChartModal();
        initChartFullscreen();
        initStageFilter();
        initMiniChartHoverPreview();
        updateSortHeaderClasses();
        showSignalsTable(state.drawerUniverse); // domyslnie Wybicie, renderowane od razu
        hideLoadingOverlay();
    })();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
}

// Eksport wyłącznie dla test runnera Node (tests/js/signals.test.js) — nie
// ładowany i bez efektu w przeglądarce (module tam nie istnieje).
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        weeksSinceZeroCrossUp, classifyWybicie, combinedWybicieCandidates, classifyTtmSqueeze, combinedTtmSqueezeCandidates,
        classifyContinuation, combinedContinuationCandidates, state,
        classifyQullamaggie, combinedQullamaggieCandidates, squeezeChartFor,
    };
}
