
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
// Domyślnie: tryb skojarzony (MACD + RS 52 tyg., oba przecinają zero w oknie —
// dotychczasowe, jedyne zachowanie) — patrz nagłówek klasyfikacji niżej dla
// pełnego opisu, dlaczego to jest jeden, wyłączny przełącznik, a reszta to
// niezależne, łączalne checkboxy.
const WYBICIE_DEFAULT_COMBINED_MODE = true;
const WYBICIE_FILTER_KEYS = ["macdCrossZero", "macdCrossSignal", "macdAboveZero", "rsAboveZero"];
const WYBICIE_FILTER_BTN_IDS = {
    macdCrossZero: "wybicieFilterMacdCrossZeroBtn",
    macdCrossSignal: "wybicieFilterMacdCrossSignalBtn",
    macdAboveZero: "wybicieFilterMacdAboveZeroBtn",
    rsAboveZero: "wybicieFilterRsAboveZeroBtn",
};
function defaultWybicieFilters() {
    return { macdCrossZero: false, macdCrossSignal: false, macdAboveZero: false, rsAboveZero: false };
}
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

// ============================================================
// BREAKOUT — replika "MY STRATEGY BLUEPRINT" (Gareth Packer / Financial
// Wisdom — PDF udostępniony przez użytkownika), zastąpiła zakładkę
// "🎯 Qullamaggie" na wyraźną prośbę użytkownika: "zaimplementuj ją zamiast
// Quallamagii zakładki w sygnałach... Nie pomijaj żadnego kroku. Proszę o
// pełną wizualizację." Ten sam materiał już raz zasilił ten kod — lejek
// "Stage 2 Continuation" (strategy.js) używa TEGO SAMEGO stopu/MACD/NATR
// (patrz komentarz w js/minicharts.js, gdzie te mechanizmy mieszkają teraz
// współdzielone) — ale tam to jeden z wielu kroków wieloetapowego lejka
// (rynek -> sektor -> etap -> RS -> ...), tutaj KAŻDY krok blueprintu jest
// odtworzony wprost, jeden po drugim, na WŁASNYM ekranie, z pełną
// wizualizacją każdego warunku w tabeli (nie tylko końcowym statusem
// ENTRY/WAIT_*) — patrz classifyBreakout niżej dla numerowanej listy kroków.
//
// CZEGO TA ZAKŁADKA CELOWO NIE AUTOMATYZUJE:
//   - FUNDAMENTY (ROC/ROE/marża operacyjna/trend przychodów) — materiał
//     opisuje je jako DODATKOWY, jakościowy czynnik ("Often an area traders
//     ignore... nevertheless adding fundamentals has huge benefits"), nie
//     jako twardy, mechaniczny warunek bramki tego konkretnego skanu
//     technicznego. Nowy fetch fundamentów (yfinance .info dla setek
//     tickerów, co tydzień w CI) byłby realną zmianą architektury pipeline'u
//     (nowy koszt/czas wykonania, nowe ryzyko limitów/błędów API — dokładnie
//     ten sam rodzaj ryzyka, który już raz zmusił ten projekt do porzucenia
//     automatycznego fetchu WIG20/mWIG40 z yfinance/stooq.pl na rzecz
//     ręcznego wpisu, patrz gem_manual_returns.json w run_query.py) — a ten
//     kod już ma narzędzie do ręcznej weryfikacji jakości: zakładka
//     "🏢 Dane spółki (TradingView)" w oknie modalnym wykresu
//     (js/chart-modal.js) już pokazuje Company Profile + Financials dla
//     każdego tickera. Zamiast duplikować to nowym fetchem, ten krok jest
//     udokumentowany w #breakoutGuide jako checklist kierujący tam — nie
//     pominięty, tylko podłączony do już istniejącego narzędzia.
//   - WEJŚCIE NA ŻYWO (moment złożenia zlecenia w ciągu tygodnia) — materiał:
//     "the entry would be at the open of the following week" — już spójne z
//     tygodniowym cyklem tej apki (dane odświeżane raz w tygodniu, w
//     sobotę): "Poziom do obserwacji" mówi PRZY JAKIEJ CENIE wypatrywać
//     wybicia, decyzję o złożeniu zlecenia podejmuje użytkownik sam — ta
//     sama filozofia "screener wytypowuje, człowiek decyduje" co reszta apki.
// ============================================================
const BREAKOUT_DEFAULT_MIN_CONSOLIDATION_WEEKS = 6; // blueprint: "at least a minimum 6 weeks... the longer the better" — bez górnego limitu.
const BREAKOUT_DEFAULT_FIRE_LOOKBACK_WEEKS = 3;
const BREAKOUT_TEN_WEEK_HIGH_WEEKS = 10;   // "the breakout candle must be at least a 10-week high (closing prices)"
const BREAKOUT_MIN_GAIN_PCT = 5;
const BREAKOUT_MAX_GAIN_PCT = 20;          // "greater than 5% and less than 20% of the previous weeks closing price"
const BREAKOUT_MAX_WICK_PCT = 50;          // "if the upper weekly candle wick is greater than 50%, we do not take the trade"
const BREAKOUT_MIN_VOLUME_SPIKE_PCT = 30;  // "I want to see at least a 30% volume increase from the prior week"
const BREAKOUT_DEFAULT_REQUIRE_NATR = true;
const BREAKOUT_DEFAULT_REQUIRE_MACD = true;
const BREAKOUT_DEFAULT_REQUIRE_VOLUME_SPIKE = false; // blueprint: "some discretion can be applied pending other criteria"
const BREAKOUT_SETTINGS_KEY = "momentum_dashboard_breakout";

// Kalkulator Kelly Criterion (krok "Optimal Position Size" blueprintu) —
// domyślne wartości to WPROST liczby z przykładu w materiale (59% strike
// rate, 4.04 reward/risk, 33% Kelly frakcyjny -> ok. 16% pozycji), żeby
// kalkulator od razu zgadzał się z przykładem z PDF-a; użytkownik podmienia
// je na własne statystyki. To NIE jest positionSize() z strategy.js (stały
// 1% ryzyka/10% maks. pozycji) — blueprint opisuje wprost Kelly Criterion,
// osobny mechanizm tej zakładki.
const BREAKOUT_DEFAULT_EQUITY = 100000;
const BREAKOUT_DEFAULT_WIN_RATE_PCT = 59;
const BREAKOUT_DEFAULT_REWARD_RISK = 4.04;
const BREAKOUT_DEFAULT_KELLY_FRACTION_PCT = 33;

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
    wybicieCombinedMode: WYBICIE_DEFAULT_COMBINED_MODE,
    wybicieFilters: defaultWybicieFilters(),
    contMinConsolidationWeeks: CONTINUATION_DEFAULT_MIN_CONSOLIDATION_WEEKS,
    contFireLookbackWeeks: CONTINUATION_DEFAULT_FIRE_LOOKBACK_WEEKS,
    contMinMomentumPct: CONTINUATION_DEFAULT_MIN_MOMENTUM_PCT,
    breakoutMinConsolidationWeeks: BREAKOUT_DEFAULT_MIN_CONSOLIDATION_WEEKS,
    breakoutFireLookbackWeeks: BREAKOUT_DEFAULT_FIRE_LOOKBACK_WEEKS,
    breakoutRequireNatr: BREAKOUT_DEFAULT_REQUIRE_NATR,
    breakoutRequireMacd: BREAKOUT_DEFAULT_REQUIRE_MACD,
    breakoutRequireVolumeSpike: BREAKOUT_DEFAULT_REQUIRE_VOLUME_SPIKE,
    breakoutEquity: BREAKOUT_DEFAULT_EQUITY,
    breakoutWinRatePct: BREAKOUT_DEFAULT_WIN_RATE_PCT,
    breakoutRewardRisk: BREAKOUT_DEFAULT_REWARD_RISK,
    breakoutKellyFractionPct: BREAKOUT_DEFAULT_KELLY_FRACTION_PCT,
    marketTrend: null,
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
// TRYB — PRZEPROJEKTOWANY z dwuprzyciskowego "MACD_RS"/"MACD_ONLY" selektora na
// wyraźną, późniejszą prośbę użytkownika: chciał osobno włączać "MACD przecina
// linię sygnałową będąc nad zerem" (bycze nastawienie) i "MACD ponad 0" — a
// resztę warunków (w tym "RS 52 tyg. ponad 0") dało się łączyć swobodnie, np.
// włączyć wszystkie naraz, żeby zawężać listę. Jedyny warunek, który MUSI
// zostać jako pojedynczy, WYŁĄCZNY przełącznik (a nie kolejny checkbox do
// łączenia) jest dokładnie ten, który wcześniej był domyślnym trybem: "MACD
// przecina zero w górę I RS 52 tyg. też, blisko siebie w czasie" — włączenie
// go wyłącza wszystkie poniższe checkboxy, i odwrotnie (checkbox włączony ->
// tryb skojarzony się wyłącza). Stąd dwa niezależne pola stanu:
//   - state.wybicieCombinedMode (domyślnie true) — TEN JEDEN, wyłączny
//     warunek: WSZYSTKIE TRZY warunki 1-3 z akapitu wyżej, włącznie z
//     przecięciem RS 52 tyg. blisko przecięcia MACD (OKNO WYBICIA ma tu sens
//     i suwak jest widoczny). #wybicieCombinedBtn.
//   - state.wybicieFilters (state.wybicieCombinedMode === false) — do CZTERECH
//     niezależnych, łączalnych (logiczne I między włączonymi) checkboxów,
//     WYBICIE_FILTER_KEYS/WYBICIE_FILTER_BTN_IDS:
//       - macdCrossZero — tygodniowy MACD przeciął zero w górę (dawny tryb
//         "Samo MACD tygodniowe", teraz jeden z kilku łączalnych warunków, nie
//         osobny "tryb").
//       - macdCrossSignal — MACD przeciął swoją linię sygnałową W GÓRĘ, W
//         BYCZYM NASTAWIENIU (MACD jest TERAZ nad zerem) — inaczej to zwykłe
//         odbicie z dołka, nie kontynuacja trendu wzrostowego.
//       - macdAboveZero — MACD jest TERAZ nad zerem (bez wymogu żadnego
//         przecięcia — czysty poziom, nie zdarzenie).
//       - rsAboveZero — RS 52 tyg. (mansfield_chart.rsm_long) jest TERAZ nad
//         zerem (też czysty poziom, bez wymogu przecięcia).
//     Warunek 3 (dodatni histogram TTM) jest zawsze wymagany, niezależnie od
//     trybu/checkboxów — to jest podstawa tego, że coś "właśnie rusza", a nie
//     osobny przełącznik. OKNO WYBICIA dotyczy wyłącznie trybu skojarzonego —
//     w checkboxach nie ma dwóch przecięć do porównania odstępem, suwak jest
//     wtedy ukryty. breakoutWeeks (wiek "wydarzenia") liczy się z NAJŚWIEŻSZEGO
//     z aktywnych warunków-ZDARZEŃ (macdCrossZero/macdCrossSignal) — czyste
//     warunki-POZIOMY (macdAboveZero/rsAboveZero) nie mają wieku, więc jeśli
//     żaden warunek-zdarzenie nie jest aktywny, breakoutWeeks jest null (lista
//     nie jest wtedy filtrowana wiekiem — MONITOROWANIE PO WYBICIU nie ma
//     zastosowania) i tabela pokazuje "aktualnie" zamiast liczby tygodni.
//     Odznaczenie OSTATNIEGO aktywnego checkboxa (przy wyłączonym trybie
//     skojarzonym) wraca do trybu skojarzonego — inaczej ekran wpadałby w
//     niejasny stan "brak żadnego warunku MACD/RS" (tylko histogram TTM).
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
    const combinedMode = opts.combinedMode ?? state.wybicieCombinedMode;
    const filters = opts.filters ?? state.wybicieFilters;
    const windowWeeks = opts.windowWeeks ?? state.wybicieWindowWeeks;
    const monitorWeeks = opts.monitorWeeks ?? state.wybicieMonitorWeeks;
    const macd = c.macd_chart && c.macd_chart.macd;
    const signal = c.macd_chart && c.macd_chart.signal;
    const rsLong = c.mansfield_chart && c.mansfield_chart.rsm_long;
    const hist = c.ttm_squeeze_chart && c.ttm_squeeze_chart.histogram;
    if (!macd || !hist) return null;

    const macdIdx = latestNonNullIdx(macd);
    const macdNow = macdIdx >= 0 ? macd[macdIdx] : null;
    const macdCrossWeeks = weeksSinceZeroCrossUp(macd);

    const rsIdx = rsLong ? latestNonNullIdx(rsLong) : -1;
    const rsNow = rsIdx >= 0 ? rsLong[rsIdx] : null;
    const rsCrossWeeks = rsLong ? weeksSinceZeroCrossUp(rsLong) : null;

    // Przecięcie MACD z linią sygnałową w górę, "w byczym nastawieniu" — liczy
    // się tylko, gdy MACD jest TERAZ nad zerem, żeby nie łapać zwykłego
    // odbicia z dołka (patrz nagłówek klasyfikacji wyżej).
    let macdSignalCrossWeeks = null;
    if (signal) {
        const diff = macd.map((v, i) => (v != null && signal[i] != null) ? v - signal[i] : null);
        const crossWeeks = weeksSinceZeroCrossUp(diff);
        if (crossWeeks != null && macdNow > 0) macdSignalCrossWeeks = crossWeeks;
    }

    let breakoutWeeks = null;
    if (combinedMode) {
        if (macdCrossWeeks == null) return null;
        if (!rsLong || rsCrossWeeks == null) return null;
        if (Math.abs(macdCrossWeeks - rsCrossWeeks) > windowWeeks) return null;
        breakoutWeeks = Math.min(macdCrossWeeks, rsCrossWeeks);
    } else {
        const eventAges = [];
        if (filters.macdCrossZero) {
            if (macdCrossWeeks == null) return null;
            eventAges.push(macdCrossWeeks);
        }
        if (filters.macdCrossSignal) {
            if (macdSignalCrossWeeks == null) return null;
            eventAges.push(macdSignalCrossWeeks);
        }
        if (filters.macdAboveZero && !(macdNow > 0)) return null;
        if (filters.rsAboveZero && !(rsNow > 0)) return null;
        if (eventAges.length) breakoutWeeks = Math.min(...eventAges);
    }
    if (breakoutWeeks != null && breakoutWeeks > monitorWeeks) return null;
    const histIdx = latestNonNullIdx(hist);
    if (histIdx < 0 || !(hist[histIdx] > 0)) return null;

    return {
        ticker, universe, sector: c.sector, price: c.price,
        momentum_pct: c.momentum_pct,
        current_stage: c.weekly_chart && c.weekly_chart.current_stage,
        macdNow,
        macdCrossWeeks,
        macdSignalCrossWeeks,
        rsLongNow: rsNow,
        rsCrossWeeks,
        breakoutWeeks,
        histNow: hist[histIdx],
        ...miniVisualFields(c),
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
// potem mocniejszy histogram. breakoutWeeks bywa null (patrz classifyWybicie —
// tylko czyste warunki-poziomy aktywne, brak zdarzenia z wiekiem) — takie
// wiersze lądują na końcu (Infinity), nie mając wieku do porównania.
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
    rows.sort((a, b) => ((a.breakoutWeeks ?? Infinity) - (b.breakoutWeeks ?? Infinity)) || (b.histNow - a.histNow));
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
    const t = c.ttm_squeeze_chart;
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
        ...miniVisualFields(c),
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

// Kalkulator Kelly Criterion — patrz komentarz nad BREAKOUT_DEFAULT_EQUITY.
// Zwraca UŁAMEK kapitału (nie %) albo null, gdy stosunek zysk/strata <= 0
// (dzielenie przez zero/ujemne — nie ma sensu liczyć Kelly'ego).
function breakoutKellyFraction() {
    const r = state.breakoutRewardRisk;
    if (!(r > 0)) return null;
    const w = state.breakoutWinRatePct / 100;
    const fullKelly = w - (1 - w) / r;
    return fullKelly * (state.breakoutKellyFractionPct / 100);
}

// Wielkość pozycji wg Kelly Criterion (kalkulator nad tabelą) dla danej
// ceny/stopu — DOKŁADNIE mechanika z przykładu w blueprincie: wartość
// pozycji = kapitał * Kelly frakcyjny (BEZ dalszego capowania ryzykiem, w
// odróżnieniu od positionSize() w strategy.js, które odwrotnie: WYLICZA
// wielkość pozycji Z budżetu ryzyka) — ryzyko/equity% jest tu WYNIKIEM do
// obserwowania (blueprint: "a 2.43% risk on equity for one position is
// considered high"), nie odgórnym limitem.
function breakoutPositionFor(price, stop) {
    const fracKelly = breakoutKellyFraction();
    if (fracKelly == null || !(fracKelly > 0)) return null;
    if (price == null || stop == null || !(price > stop) || !(state.breakoutEquity > 0)) return null;
    const positionValue = state.breakoutEquity * fracKelly;
    const shares = Math.floor(positionValue / price);
    if (shares <= 0) return null;
    const value = shares * price;
    const riskPerShare = price - stop;
    const riskValue = shares * riskPerShare;
    return { shares, value, riskValue, riskOnEquityPct: (riskValue / state.breakoutEquity) * 100 };
}

// Klasyfikuje jedną spółkę wg WSZYSTKICH kroków "MY STRATEGY BLUEPRINT"
// (Gareth Packer/Financial Wisdom), jeden po drugim:
//   1. TREND — cena TERAZ nad własną 20-tyg. EMA (substytut 20-tyg. MA z
//      materiału — backend eksportuje EMA20, nie SMA, ten sam substytut, co
//      cały wykres "10:30" już stosuje, patrz CLAUDE.md). TWARDY warunek:
//      spółka pod własną EMA20 nie pojawia się na liście WCALE.
//   2. KONSOLIDACJA (min. `minConsolidationWeeks`, domyślnie 6 tyg., "dłużej
//      lepiej", BEZ górnego limitu) — kanał z materiału ("candles touching
//      or closing at a near parallel point") odtworzony tygodniowym TTM
//      Squeeze (ttm_squeeze_chart), tym samym substytutem, który
//      Continuation/dawne Qullamaggie już stosowały.
//   3. NATR < BLUEPRINT_NATR_MAX (js/minicharts.js) — "I require the metric
//      to be below 8". Domyślnie WYMAGANY (`requireNatr`, w odróżnieniu od
//      lejka strategy.js, gdzie to opcjonalny chip) — tutaj to jawny krok
//      blueprintu, nadal wyłączalny suwakiem.
//   4. MACD nad linią sygnałową — "we always want to be in a position with
//      the MACD line above the signal line" (macdConfirmation(),
//      js/minicharts.js). Domyślnie WYMAGANY (`requireMacd`) z tego samego
//      powodu co NATR.
//   5. WYBICIE — tygodniowe zamknięcie POWYŻEJ oporu kanału = koniec
//      squeeze'a (status "fired", ten sam co TTM Squeeze/Continuation).
//   6. GÓRNY KNOT świecy wybicia <= BREAKOUT_MAX_WICK_PCT (50%) jej zakresu
//      — "if the upper weekly candle wick is greater than 50%, we do not
//      take the trade". Wymaga High i Low tygodnia (weekly_chart.high_pct/
//      low_pct — high_pct dodany do run_query.py specjalnie na potrzeby
//      tego kroku). TWARDY warunek, tylko gdy realnie policzony (odrzuca
//      wiersz CAŁKOWICIE, ten sam wzorzec co Continuation).
//   7. Świeca wybicia = co najmniej BREAKOUT_TEN_WEEK_HIGH_WEEKS-tygodniowy
//      szczyt zamknięcia — TA SAMA logika/próg co CONTINUATION_TEN_WEEK_
//      HIGH_WEEKS (ten sam materiał referencyjny).
//   8. Zysk świecy wybicia w [BREAKOUT_MIN_GAIN_PCT, BREAKOUT_MAX_GAIN_PCT]
//      (5%-20%) względem poprzedniego zamknięcia — TA SAMA logika/progi co
//      CONTINUATION_*_BREAKOUT_GAIN_PCT.
//   9. WOLUMEN: wzrost >= BREAKOUT_MIN_VOLUME_SPIKE_PCT (30%) względem
//      poprzedniego tygodnia ("I want to see at least a 30% volume
//      increase... some discretion can be applied") — INFORMACYJNE
//      domyślnie (materiał mówi wprost o dyskrecji), `requireVolumeSpike`
//      pozwala uczynić go wymaganym. Osobno pokazujemy też istniejący
//      wolumen KUPUJĄCYCH (buying_volume_ratio, ten sam próg
//      STAGE_BREAKOUT_VOLUME_RATIO co reszta apki) — informacyjnie, jak w
//      dawnym Qullamaggie.
//   10. STOP/RYZYKO — strategyStopFor() (js/minicharts.js): dolna granica
//       ŚRODKOWEJ TERCJI ostatniego pudełka Darvasa, podnoszony na LOW
//       świecy po każdym przecięciu MACD w dół linii sygnałowej — DOKŁADNIE
//       ten sam mechanizm co krok 4 lejka strategy.js. "if the structure
//       does not allow for a stop loss of less than 20%, we do not take the
//       trade" (BLUEPRINT_MAX_STOP_DISTANCE_PCT) — status WAIT_RISK zamiast
//       ENTRY, gdy przekroczone (wiersz NIE jest chowany — sama informacja
//       "wybicie jest, ale stop za daleko" ma wartość).
//   11. WIELKOŚĆ POZYCJI — Kelly Criterion (breakoutPositionFor() powyżej),
//       NIE stały % ryzyka jak w strategy.js — materiał opisuje wprost Kelly
//       Criterion.
// "Poziom do obserwacji" (opór/wsparcie kanału, breakoutLevelFor()) jest
// czysto informacyjny i może pochodzić z INNEGO okna niż stop powyżej
// (squeezeConsolidationBox vs. weekly_chart.bases/Darvas) — ta sama
// niezależność dwóch pomocników już istnieje między dawnym Qullamaggie i
// lejkiem strategy.js, nie jest nowym problemem wprowadzonym tutaj.
function classifyBreakout(ticker, universe, c, opts = {}) {
    const o = {
        minConsolidationWeeks: opts.minConsolidationWeeks ?? state.breakoutMinConsolidationWeeks,
        fireLookbackWeeks: opts.fireLookbackWeeks ?? state.breakoutFireLookbackWeeks,
        requireNatr: opts.requireNatr ?? state.breakoutRequireNatr,
        requireMacd: opts.requireMacd ?? state.breakoutRequireMacd,
        requireVolumeSpike: opts.requireVolumeSpike ?? state.breakoutRequireVolumeSpike,
    };

    // Krok 1: trend.
    const wc = c.weekly_chart;
    if (!wc || !wc.close_pct || !wc.close_pct.length) return null;
    const priceIdx = latestNonNullIdx(wc.close_pct);
    if (priceIdx < 0) return null;
    const closeNowPct = wc.close_pct[priceIdx];
    const emaNowPct = wc.ema20_pct ? wc.ema20_pct[priceIdx] : null;
    if (emaNowPct == null || !(closeNowPct > emaNowPct)) return null;

    // Krok 2: konsolidacja (TTM Squeeze tygodniowy jako substytut kanału).
    const t = c.ttm_squeeze_chart;
    if (!t || !t.dates || t.dates.length === 0) return null;
    // Ostatni tydzień bywa jeszcze niedomknięty — ten sam caveat co w classifyTtmSqueeze/classifyContinuation.
    let nowIdx = t.dates.length - 1;
    while (nowIdx >= 0 && t.squeeze_on[nowIdx] == null) nowIdx--;
    if (nowIdx < 0) return null;

    const squeezeOn = t.squeeze_on[nowIdx];
    const squeezeCount = t.squeeze_count[nowIdx];
    const weeksSinceFire = t.weeks_since_fire[nowIdx];
    const fireConsolidationWeeks = t.fire_consolidation_weeks[nowIdx];
    const histNow = t.histogram[nowIdx];

    const isConsolidating = squeezeOn === true && squeezeCount >= o.minConsolidationWeeks;
    const isFired = weeksSinceFire != null && weeksSinceFire <= o.fireLookbackWeeks
        && fireConsolidationWeeks != null && fireConsolidationWeeks >= o.minConsolidationWeeks
        && histNow != null && histNow > 0;
    if (!isConsolidating && !isFired) return null;
    const consolidationWeeks = isFired ? fireConsolidationWeeks : squeezeCount;

    // Kroki 3-4: jakość konsolidacji/momentum — informacyjne zawsze,
    // wymagane wg opts.requireNatr/requireMacd.
    const natrValue = currentNatr(c);
    const natrOk = natrValue != null && natrValue <= BLUEPRINT_NATR_MAX;
    const macd = macdConfirmation(c);
    const macdOk = macd.above === true;

    // Kroki 6-9: kryteria świecy wybicia — TYLKO dla "fired", dopasowane po
    // DACIE (ttm_squeeze_chart/weekly_chart mogą mieć inny bufor rozgrzewki
    // — ten sam wzorzec co breakout_volume_ratio w dawnym classifyQullamaggie).
    let wickPct = null, tenWeekHigh = null, breakoutGainPct = null, volumeIncreasePct = null;
    let breakoutVolumeRatio = null;
    if (isFired) {
        const breakoutDate = t.dates[nowIdx - weeksSinceFire];
        const wcIdx = wc.dates ? wc.dates.indexOf(breakoutDate) : -1;
        if (wcIdx >= 0) {
            const closeNow = wc.close_pct[wcIdx];
            const highNow = wc.high_pct ? wc.high_pct[wcIdx] : null;
            const lowNow = wc.low_pct ? wc.low_pct[wcIdx] : null;
            if (closeNow != null && highNow != null && lowNow != null && highNow > lowNow) {
                wickPct = ((highNow - closeNow) / (highNow - lowNow)) * 100;
            }
            if (closeNow != null && wcIdx >= BREAKOUT_TEN_WEEK_HIGH_WEEKS) {
                const windowVals = wc.close_pct
                    .slice(wcIdx - BREAKOUT_TEN_WEEK_HIGH_WEEKS, wcIdx + 1)
                    .filter(v => v != null);
                tenWeekHigh = closeNow >= Math.max(...windowVals);
            }
            const prevPct = wcIdx > 0 ? wc.close_pct[wcIdx - 1] : null;
            if (closeNow != null && prevPct != null) {
                breakoutGainPct = ((1 + closeNow / 100) / (1 + prevPct / 100) - 1) * 100;
            }
            if (wc.volume && wc.volume[wcIdx] != null && wcIdx > 0 && wc.volume[wcIdx - 1] > 0) {
                volumeIncreasePct = (wc.volume[wcIdx] / wc.volume[wcIdx - 1] - 1) * 100;
            }
            if (wc.buying_volume_ratio) breakoutVolumeRatio = wc.buying_volume_ratio[wcIdx];
        }
        // Kroki 6/7/8: TWARDE warunki świecy wybicia — odrzucają wiersz
        // CAŁKOWICIE, tylko gdy realnie policzone (ten sam wzorzec co
        // Continuation, patrz komentarz nad classifyContinuation).
        if (wickPct != null && wickPct > BREAKOUT_MAX_WICK_PCT) return null;
        if (tenWeekHigh === false) return null;
        if (breakoutGainPct != null
            && (breakoutGainPct < BREAKOUT_MIN_GAIN_PCT || breakoutGainPct > BREAKOUT_MAX_GAIN_PCT)) {
            return null;
        }
    }
    const volumeSpikeOk = volumeIncreasePct != null && volumeIncreasePct >= BREAKOUT_MIN_VOLUME_SPIKE_PCT;
    const breakoutVolumeConfirmed = breakoutVolumeRatio != null && breakoutVolumeRatio >= STAGE_BREAKOUT_VOLUME_RATIO;

    // Krok 10: stop/ryzyko.
    const stopInfo = strategyStopFor(c);
    const stop = stopInfo ? stopInfo.stop : null;
    const stopDistancePct = stop != null && c.price > 0 ? ((c.price - stop) / c.price) * 100 : null;
    const riskOk = stopDistancePct == null || stopDistancePct <= BLUEPRINT_MAX_STOP_DISTANCE_PCT;

    let substatus;
    if (isFired) {
        if (o.requireMacd && !macdOk) substatus = "WAIT_MACD";
        else if (o.requireNatr && !natrOk) substatus = "WAIT_NATR";
        else if (!riskOk) substatus = "WAIT_RISK";
        else if (o.requireVolumeSpike && !volumeSpikeOk) substatus = "WAIT_VOLUME";
        else substatus = "ENTRY";
    } else {
        substatus = "SETUP";
    }

    return {
        ticker, universe, sector: c.sector, price: c.price,
        current_stage: wc.current_stage,
        status: isFired ? "fired" : "consolidating",
        substatus,
        consolidation_weeks: consolidationWeeks,
        weeks_since_fire: isFired ? weeksSinceFire : null,
        histNow,
        natr_value: natrValue, natr_ok: natrOk,
        macd_above: macd.above, macd_cross_up_date: macd.crossUpDate, macd_ok: macdOk,
        wick_pct: wickPct,
        ten_week_high: tenWeekHigh,
        breakout_gain_pct: breakoutGainPct,
        volume_increase_pct: volumeIncreasePct, volume_spike_ok: volumeSpikeOk,
        breakout_volume_ratio: breakoutVolumeRatio, breakout_volume_confirmed: breakoutVolumeConfirmed,
        stop, stop_source: stopInfo ? stopInfo.source : null, stop_distance_pct: stopDistancePct, risk_ok: riskOk,
        // Poziom oporu/wsparcia "do obserwowania" — ten sam pomocnik co
        // dawne Continuation/Qullamaggie (breakoutLevelFor(), js/minicharts.js).
        breakout_level: breakoutLevelFor(c),
        kelly: breakoutPositionFor(c.price, stop),
        ...miniVisualFields(c),
    };
}

// Zwraca listę połączoną ze WSZYSTKICH 6 uniwersów, bez duplikatów, posortowaną:
// świeże wybicia gotowe do ENTRY najpierw, potem inne wybicia (WAIT_*, od
// najświeższego), potem trwające konsolidacje (najdłuższe, czyli najbliższe
// wybicia, na górze).
function combinedBreakoutCandidates(opts = {}) {
    const rows = [];
    const seen = new Set();
    UNIVERSES.forEach(u => {
        const universeData = state.data[u] || {};
        (universeData.all_constituents || universeData.constituents || []).forEach(c => {
            if (seen.has(c.ticker)) return;
            const r = classifyBreakout(c.ticker, u, c, opts);
            if (r) { rows.push(r); seen.add(c.ticker); }
        });
    });
    rows.sort((a, b) => {
        if (a.status !== b.status) return a.status === "fired" ? -1 : 1;
        if (a.status === "fired") {
            if (a.substatus === "ENTRY" && b.substatus !== "ENTRY") return -1;
            if (b.substatus === "ENTRY" && a.substatus !== "ENTRY") return 1;
            return a.weeks_since_fire - b.weeks_since_fire;
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

    const t = c.ttm_squeeze_chart;
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
        breakout_level: breakoutLevelFor(c),
        ...miniVisualFields(c),
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
            + (r.breakoutWeeks != null ? `wybicie ${r.breakoutWeeks} tyg. temu · ` : "")
            + (r.macdCrossWeeks != null ? `MACD > 0 od ${r.macdCrossWeeks} tyg. · ` : "")
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

// Sidebar: kafelki screenera Breakout (patrz combinedBreakoutCandidates powyżej).
function renderBreakoutPanel() {
    const container = document.getElementById("tiles-BREAKOUT");
    if (!container) return;

    const rows = combinedBreakoutCandidates();
    const meta = document.getElementById("breakoutMeta");
    if (meta) meta.textContent = `${rows.length} spółek`;

    container.innerHTML = "";
    rows.forEach(r => {
        const tile = document.createElement("div");
        tile.className = "ticker-tile";
        tile.textContent = r.ticker;
        tile.title = `${r.ticker} — ${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")} · `
            + (r.status === "fired"
                ? `${r.substatus === "ENTRY" ? "ENTRY" : "wybicie"} ${r.weeks_since_fire} tyg. temu po ${r.consolidation_weeks} tyg. konsolidacji`
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
// Breakout), bez pełnej tabeli per-uniwersum (ta zostaje na "Indeksach",
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
    document.getElementById("breakoutTable").hidden = tab !== "BREAKOUT";
    document.getElementById("breakoutControls").hidden = tab !== "BREAKOUT";
    document.getElementById("breakoutGuide").hidden = tab !== "BREAKOUT";
    document.getElementById("drawerTitle").textContent = tab === "WYBICIE"
        ? "Pełna tabela — Wybicie"
        : tab === "TTM_SQUEEZE"
            ? "Pełna tabela — TTM Squeeze"
            : tab === "CONTINUATION"
                ? "Continuation — Etap 2 + konsolidacja tygodniowa"
                : "Breakout — replika \"MY STRATEGY BLUEPRINT\" (Gareth Packer/Financial Wisdom)";
    renderActiveSignalsTable();
}

function renderActiveSignalsTable() {
    if (state.drawerUniverse === "WYBICIE") renderWybicieTable();
    else if (state.drawerUniverse === "TTM_SQUEEZE") renderTtmSqueezeTable();
    else if (state.drawerUniverse === "CONTINUATION") renderContinuationTable();
    else renderBreakoutTable();
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

// Odkąd RS 52 tyg. (i, poniżej, MACD) może być tylko informacyjny — checkbox
// "RS 52 tyg. > 0"/"MACD > 0" niekoniecznie jest włączony, ani MACD/RS nie
// muszą mieć świeżego przecięcia — obie kolumny pokazują aktualną wartość, gdy
// jest dostępna (kolor wg znaku, nie zawsze "positive"), z wiekiem przecięcia
// tylko wtedy, gdy jakieś przecięcie faktycznie było.
function wybicieValueCellHtml(now, crossWeeks, miniValues, miniCrossIdx, label) {
    const cell = now != null
        ? `<span class="cell-spark">${zeroLineSparkSvg(miniValues, miniCrossIdx)}<span>${now.toFixed(2)}`
            + (crossWeeks != null ? ` <span class="cross-age">(${crossWeeksHtml(crossWeeks)})</span>` : "")
            + `</span></span>`
        : `<span class="spark-empty">—</span>`;
    const cellClass = now == null ? "" : now >= 0 ? "positive" : "negative";
    const title = crossWeeks != null
        ? `${label} (${MINI_WEEKS} tyg.), złota kropka = przecięcie zera w górę ${crossWeeksHtml(crossWeeks)}`
        : `${label} (${MINI_WEEKS} tyg.) — informacyjnie, nie jest wymagane przy bieżących warunkach`;
    return { cell, cellClass, title };
}

function wybicieRowHtml(r, position) {
    const macdCell = wybicieValueCellHtml(r.macdNow, r.macdCrossWeeks, r.mini_macd, r.mini_macd_cross, "MACD tygodniowy");
    const rsCell = wybicieValueCellHtml(r.rsLongNow, r.rsCrossWeeks, r.mini_rs, r.mini_rs_cross, "RS 52 tyg.");
    const breakoutHtml = r.breakoutWeeks != null ? crossWeeksHtml(r.breakoutWeeks) : "aktualnie";
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${r.ticker}</td>
        <td>${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")}</td>
        <td>${r.sector || ""}</td>
        <td>${formatPrice(r.price, r.universe)}</td>
        <td>${breakoutHtml}</td>
        <td title="Cena tygodniowa (${MINI_WEEKS} tyg.) + EMA20">${weeklySparkSvg(r.mini_closes, r.mini_ema)}</td>
        <td class="${macdCell.cellClass}" title="${macdCell.title}">${macdCell.cell}</td>
        <td class="${rsCell.cellClass}" title="${rsCell.title}">${rsCell.cell}</td>
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

// Opis aktywnych warunków MACD/RS (poza histogramem TTM, zawsze wymaganym) —
// używany w komunikacie "brak wyników" i w podpowiedziach kontrolek.
function wybicieActiveConditionsText() {
    if (state.wybicieCombinedMode) {
        return `MACD i RS 52 tyg. przecięły zero w odstępie ≤ ${state.wybicieWindowWeeks} tyg.`;
    }
    const parts = [];
    if (state.wybicieFilters.macdCrossZero) parts.push("MACD tygodniowy przeciął zero w górę");
    if (state.wybicieFilters.macdCrossSignal) parts.push("MACD przeciął linię sygnałową będąc nad zerem");
    if (state.wybicieFilters.macdAboveZero) parts.push("MACD tygodniowy jest nad zerem");
    if (state.wybicieFilters.rsAboveZero) parts.push("RS 52 tyg. jest nad zerem");
    return parts.length ? parts.join(", ") : "brak dodatkowych warunków MACD/RS";
}

// Czy jakikolwiek aktywny warunek ma "wiek" (zdarzenie-przecięcie), a nie
// tylko czysty poziom — od tego zależy, czy "Monitoruj po wybiciu" ma
// zastosowanie (patrz classifyWybicie/breakoutWeeks).
function wybicieHasAgeBasedFilter() {
    return state.wybicieCombinedMode || state.wybicieFilters.macdCrossZero || state.wybicieFilters.macdCrossSignal;
}

// Tabela screenera Wybicie — sortowalna i filtrowalna po etapie, tak jak
// pozostałe tabele, na płaskiej, wielo-uniwersalnej liście z
// combinedWybicieCandidates().
function renderWybicieTable() {
    const allRows = combinedWybicieCandidates();
    const emptyAllMsg = wybicieHasAgeBasedFilter()
        ? `Brak spółek z wybiciem w ostatnich ${state.wybicieMonitorWeeks} tyg. (${wybicieActiveConditionsText()}, histogram TTM dodatni).`
        : `Brak spółek spełniających wybrane warunki (${wybicieActiveConditionsText()}, histogram TTM dodatni).`;

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

// Pokazuje/ukrywa suwak "Okno wybicia" (tylko tryb skojarzony ma dwa
// przecięcia do porównania odstępem) i "Monitoruj po wybiciu" (tylko gdy
// jakiś aktywny warunek w ogóle ma wiek — patrz wybicieHasAgeBasedFilter), oraz
// odświeża klasę "active" na przycisku skojarzonym i czterech checkboxach.
function applyWybicieModeVisibility() {
    const windowRow = document.getElementById("wybicieWindowRow");
    if (windowRow) windowRow.hidden = !state.wybicieCombinedMode;
    const monitorRow = document.getElementById("wybicieMonitorRow");
    if (monitorRow) monitorRow.hidden = !wybicieHasAgeBasedFilter();
    const combinedBtn = document.getElementById("wybicieCombinedBtn");
    if (combinedBtn) combinedBtn.classList.toggle("active", state.wybicieCombinedMode);
    WYBICIE_FILTER_KEYS.forEach(key => {
        const btn = document.getElementById(WYBICIE_FILTER_BTN_IDS[key]);
        if (btn) btn.classList.toggle("active", !state.wybicieCombinedMode && state.wybicieFilters[key]);
    });
}

// Przełącznik skojarzony (#wybicieCombinedBtn) + cztery niezależne checkboxy
// (WYBICIE_FILTER_BTN_IDS) + suwaki nad tabelą Wybicie (#wybicieControls):
// patrz opis trybu nad classifyWybicie dla pełnej semantyki (wyłączność
// skojarzonego warunku, łączalność checkboxów). Wartości zapamiętywane per
// przeglądarka w localStorage — tylko wygoda, strona działa też bez niego
// (try/catch — tryb prywatny itp.).
function initWybicieControls() {
    try {
        const saved = JSON.parse(localStorage.getItem(WYBICIE_SETTINGS_KEY) || "null");
        if (saved) {
            if (Number.isFinite(saved.windowWeeks)) state.wybicieWindowWeeks = saved.windowWeeks;
            if (Number.isFinite(saved.monitorWeeks)) state.wybicieMonitorWeeks = saved.monitorWeeks;
            if (typeof saved.combinedMode === "boolean") {
                state.wybicieCombinedMode = saved.combinedMode;
                if (saved.filters) {
                    WYBICIE_FILTER_KEYS.forEach(key => {
                        if (typeof saved.filters[key] === "boolean") state.wybicieFilters[key] = saved.filters[key];
                    });
                }
            } else if (saved.mode === "MACD_ONLY") {
                // Migracja starego dwuprzyciskowego formatu: "Samo MACD
                // tygodniowe" znaczyło dokładnie "MACD przecina zero w górę",
                // bez warunku RS — jeden z dzisiejszych checkboxów.
                state.wybicieCombinedMode = false;
                state.wybicieFilters.macdCrossZero = true;
            } else if (saved.mode === "MACD_RS") {
                state.wybicieCombinedMode = true;
            }
        }
    } catch (e) { /* brak localStorage — zostają domyślne */ }

    const saveSettings = () => {
        try {
            localStorage.setItem(WYBICIE_SETTINGS_KEY, JSON.stringify({
                windowWeeks: state.wybicieWindowWeeks, monitorWeeks: state.wybicieMonitorWeeks,
                combinedMode: state.wybicieCombinedMode, filters: state.wybicieFilters,
            }));
        } catch (e) { /* ignoruj */ }
    };

    const rerender = () => {
        applyWybicieModeVisibility();
        saveSettings();
        renderWybiciePanel();
        if (state.drawerUniverse === "WYBICIE") renderWybicieTable();
    };

    applyWybicieModeVisibility();

    const combinedBtn = document.getElementById("wybicieCombinedBtn");
    if (combinedBtn) {
        combinedBtn.addEventListener("click", () => {
            if (state.wybicieCombinedMode) return;
            state.wybicieCombinedMode = true;
            WYBICIE_FILTER_KEYS.forEach(key => { state.wybicieFilters[key] = false; });
            rerender();
        });
    }

    WYBICIE_FILTER_KEYS.forEach(key => {
        const btn = document.getElementById(WYBICIE_FILTER_BTN_IDS[key]);
        if (!btn) return;
        btn.addEventListener("click", () => {
            const turningOn = !state.wybicieFilters[key];
            if (!turningOn && !state.wybicieCombinedMode) {
                // Odznaczenie OSTATNIEGO aktywnego checkboxa (bez trybu
                // skojarzonego) wracałoby do "brak żadnego warunku MACD/RS" —
                // cofamy wtedy do domyślnego trybu skojarzonego zamiast
                // zostawiać ekran w niejasnym stanie.
                const othersActive = WYBICIE_FILTER_KEYS.some(k => k !== key && state.wybicieFilters[k]);
                if (!othersActive) {
                    state.wybicieCombinedMode = true;
                    WYBICIE_FILTER_KEYS.forEach(k => { state.wybicieFilters[k] = false; });
                    rerender();
                    return;
                }
            }
            state.wybicieFilters[key] = turningOn;
            if (turningOn) state.wybicieCombinedMode = false;
            rerender();
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
            saveSettings();
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

// Poziom "do obserwowania" (breakoutLevelFor(), js/minicharts.js): opór
// (▲, zielony) + wsparcie (▼, czerwony) gdy znane. `pending: false` (box już
// skonsumowany przez wcześniejsze wybicie, patrz breakoutLevelFor) obniża
// opacity — to referencyjny, nie aktualny poziom. Wspólne dla Continuation i
// Breakout (dawniej nazwane qmLevelCellHtml, z Qullamaggie — czysto
// techniczna funkcja, przemianowana przy tej samej okazji).
function levelToWatchCellHtml(r) {
    const lvl = r.breakout_level;
    if (!lvl) return `<span class="spark-empty">—</span>`;
    const style = lvl.pending ? "" : ' style="opacity:0.6"';
    const support = lvl.support != null
        ? ` <span class="orb-level-value negative">▼ ${formatPrice(lvl.support, r.universe)}</span>` : "";
    return `<span${style} title="${lvl.pending ? "Poziom konsolidacji, w której spółka wciąż siedzi" : "Opór ostatniej przełamanej bazy (referencyjnie)"}${lvl.startDate ? ` — baza od ${lvl.startDate}` : ""}">`
        + `<span class="orb-level-value positive">▲ ${formatPrice(lvl.resistance, r.universe)}</span>${support}</span>`;
}

const BREAKOUT_SUBSTATUS_LABELS = {
    WAIT_MACD: `<span class="cross-age" title="Tygodniowy MACD nie jest nad linią sygnałową — blueprint: &quot;we always want to be in a position with the MACD line above the signal line&quot;.">⏳ Czekaj na MACD</span>`,
    WAIT_NATR: `<span class="cross-age" title="NATR powyżej ${BLUEPRINT_NATR_MAX} — konsolidacja niewystarczająco ciasna wg tego kryterium.">⏳ NATR za wysoki</span>`,
    WAIT_RISK: `<span class="negative" title="Odległość do stopu przekracza ${BLUEPRINT_MAX_STOP_DISTANCE_PCT}% — blueprint: &quot;if the structure does not allow for a stop loss of less than 20%, we do not take the trade&quot;.">⏳ Stop za daleko</span>`,
    WAIT_VOLUME: `<span class="cross-age" title="Wolumen wzrósł mniej niż ${BREAKOUT_MIN_VOLUME_SPIKE_PCT}% względem poprzedniego tygodnia.">⏳ Wolumen za słaby</span>`,
};

function breakoutStatusHtml(r) {
    if (r.status !== "fired") return `<span class="squeeze-status squeeze-status-consolidating">🌀 Konsolidacja</span>`;
    const fired = `<span class="squeeze-status squeeze-status-fired">${r.substatus === "ENTRY" ? "🎯 ENTRY" : "🔥 Wybicie"} (${r.weeks_since_fire} tyg. temu)</span>`;
    if (r.substatus === "ENTRY") return fired;
    return `${fired} ${BREAKOUT_SUBSTATUS_LABELS[r.substatus] || ""}`;
}

// "Warunki wejścia" — badge'e dla każdego jawnego kroku blueprintu (patrz
// numerowana lista w komentarzu nad classifyBreakout): NATR/MACD zawsze
// widoczne (dotyczą też trwającej konsolidacji — jakość setupu, nie tylko
// samej świecy wybicia), knot/10-tyg. szczyt/zysk/wolumen tylko dla "fired"
// (są policzone WYŁĄCZNIE dla świecy wybicia). Knot/10-tyg. szczyt/zysk są
// tu ZAWSZE ✓ gdy widoczne — wiersz, który je nie spełnił, został już
// odrzucony CAŁKOWICIE w classifyBreakout (TWARDE warunki), więc pojawienie
// się badge'a samo w sobie jest potwierdzeniem, nie oceną.
function breakoutConditionsHtml(r) {
    const natrBadge = r.natr_value != null
        ? `<span class="${r.natr_ok ? "positive" : "negative"}" title="NATR: ${r.natr_value.toFixed(1)} (limit ${BLUEPRINT_NATR_MAX})">NATR ${r.natr_ok ? "✓" : "✗"}</span>`
        : "";
    const macdBadge = r.macd_above != null
        ? `<span class="${r.macd_ok ? "positive" : "negative"}" title="MACD ${r.macd_ok ? "nad" : "pod"} linią sygnałową">MACD ${r.macd_ok ? "✓" : "✗"}</span>`
        : "";
    const badges = [natrBadge, macdBadge];
    if (r.status === "fired") {
        if (r.wick_pct != null) {
            badges.push(`<span class="positive" title="Górny knot świecy wybicia: ${r.wick_pct.toFixed(0)}% zakresu (limit ${BREAKOUT_MAX_WICK_PCT}%)">Knot ✓</span>`);
        }
        if (r.ten_week_high != null) {
            badges.push(`<span class="positive" title="Świeca wybicia = ${BREAKOUT_TEN_WEEK_HIGH_WEEKS}-tyg. szczyt zamknięcia">${BREAKOUT_TEN_WEEK_HIGH_WEEKS} tyg. ✓</span>`);
        }
        if (r.breakout_gain_pct != null) {
            badges.push(`<span class="positive" title="Zysk świecy wybicia: +${r.breakout_gain_pct.toFixed(1)}% (wymagane ${BREAKOUT_MIN_GAIN_PCT}-${BREAKOUT_MAX_GAIN_PCT}%)">Zysk ✓</span>`);
        }
        if (r.volume_increase_pct != null) {
            badges.push(`<span class="${r.volume_spike_ok ? "positive" : "cross-age"}" title="Wolumen: ${r.volume_increase_pct >= 0 ? "+" : ""}${r.volume_increase_pct.toFixed(0)}% względem poprz. tygodnia (cel ${BREAKOUT_MIN_VOLUME_SPIKE_PCT}%+, materiał mówi o dyskrecji)">Wolumen ${r.volume_spike_ok ? "✓" : "~"}</span>`);
        }
        if (r.breakout_volume_confirmed) {
            badges.push(`<span class="cross-age" title="Wolumen kupujących w tygodniu wybicia ≥ ${STAGE_BREAKOUT_VOLUME_RATIO}x średniej">Kupujący ✓</span>`);
        }
    }
    return badges.filter(Boolean).join(" ") || "—";
}

function breakoutStopCellHtml(r) {
    if (r.stop == null) return `<span class="spark-empty">—</span>`;
    const pctTxt = r.stop_distance_pct != null ? `${r.stop_distance_pct.toFixed(1)}%` : "—";
    const cls = r.risk_ok ? "" : "negative";
    const sourceLabel = r.stop_source === "macd" ? "podniesiony po przecięciu MACD w dół"
        : r.stop_source === "box" ? "dolna granica środkowej tercji pudełka"
            : "trailing stop Weinsteina (fallback bez pudełka)";
    return `<span title="Stop: ${formatPrice(r.stop, r.universe)} (${sourceLabel})">`
        + `${formatPrice(r.stop, r.universe)} <span class="${cls}">(${pctTxt})</span></span>`;
}

function breakoutKellyCellHtml(r) {
    if (!r.kelly) return `<span class="spark-empty">—</span>`;
    const k = r.kelly;
    return `<span title="Ryzyko: ${formatPrice(k.riskValue, r.universe)} (${k.riskOnEquityPct.toFixed(2)}% kapitału) — wg kalkulatora Kelly'ego nad tabelą">`
        + `${k.shares} szt. (${formatPrice(k.value, r.universe)})</span>`;
}

function breakoutRowHtml(r, position) {
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${r.ticker}</td>
        <td>${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")}</td>
        <td>${r.sector || ""}</td>
        <td>${formatPrice(r.price, r.universe)}</td>
        <td>${breakoutStatusHtml(r)}</td>
        <td>${r.consolidation_weeks} tyg.</td>
        <td title="Warunki blueprintu: NATR &lt; ${BLUEPRINT_NATR_MAX}, MACD nad sygnałową, górny knot &le; ${BREAKOUT_MAX_WICK_PCT}%, ${BREAKOUT_TEN_WEEK_HIGH_WEEKS}-tyg. szczyt, zysk ${BREAKOUT_MIN_GAIN_PCT}-${BREAKOUT_MAX_GAIN_PCT}%, wolumen +${BREAKOUT_MIN_VOLUME_SPIKE_PCT}%">${breakoutConditionsHtml(r)}</td>
        <td title="Cena, przy której warto obserwować wybicie (opór/wsparcie kanału konsolidacji)">${levelToWatchCellHtml(r)}</td>
        <td title="Stop wg blueprintu: środkowa tercja pudełka, podnoszony po każdym przecięciu MACD w dół">${breakoutStopCellHtml(r)}</td>
        <td title="Wielkość pozycji wg Kelly Criterion (kalkulator nad tabelą)">${breakoutKellyCellHtml(r)}</td>
        <td title="Cena tygodniowa (${MINI_WEEKS} tyg.) + EMA20; czerwone kreski = tygodnie squeeze'a">${weeklySparkSvg(r.mini_closes, r.mini_ema, r.mini_sq_flags)}</td>
        <td title="TTM Squeeze tygodniowy (${MINI_WEEKS} tyg.): słupki = momentum, czerwona kropka = squeeze, złota = wybicie">${ttmMiniSvg(r.mini_hist, r.mini_sq_on, r.mini_fired)}</td>
        <td>${stageCellHtml(r.current_stage)}</td>
        <td>${tvRowButtonHtml(r.ticker, r.universe)}</td>
    `;
}

// Tabela screenera Breakout — sortowalna i filtrowalna po etapie, tak jak
// pozostałe tabele, na płaskiej, wielo-uniwersalnej liście z
// combinedBreakoutCandidates().
function renderBreakoutTable() {
    const allRows = combinedBreakoutCandidates();

    renderScreenerTable({
        tbody: document.getElementById("breakoutTableBody"),
        metaEl: document.getElementById("drawerMeta"),
        allRows,
        matchesStage: state.stageFilter === "ALL" ? null : (r => matchesStageFilter(r.current_stage)),
        sortKey: state.sortKey, sortDir: state.sortDir,
        colspan: 15,
        emptyAllMsg: `Brak spółek nad własną EMA20 z konsolidacją ≥ ${state.breakoutMinConsolidationWeeks} tyg. (trwającą albo świeżo zakończoną wybiciem spełniającym kryteria świecy z blueprintu).`,
        emptyFilteredMsg: "Żadna spółka nie pasuje do wybranego etapu.",
        metaText: (rows) => flatScreenerMetaText(allRows, rows),
        rowKey: r => r.ticker,
        isSelected: r => r.ticker === state.selectedTicker,
        rowHtml: (r, i) => breakoutRowHtml(r, i + 1),
        onRowClick: r => selectTicker(r.ticker, r.universe),
        afterRender: bindTvRowButtons,
    });
}

// Tekst podsumowania kalkulatora Kelly Criterion nad tabelą (#breakoutKellySummary).
function breakoutKellySummaryText() {
    const r = state.breakoutRewardRisk;
    if (!(r > 0)) return "Podaj dodatni stosunek zysk/strata (Reward/Risk).";
    const w = state.breakoutWinRatePct / 100;
    const fullKellyPct = (w - (1 - w) / r) * 100;
    const fracKelly = breakoutKellyFraction();
    if (fracKelly == null || !(fracKelly > 0)) {
        return `Kelly pełny: ${fullKellyPct.toFixed(1)}% — ujemna wartość oczekiwana przy tych statystykach, kalkulator nie zaleca pozycji.`;
    }
    const fracPct = fracKelly * 100;
    const positionValue = state.breakoutEquity * fracKelly;
    return `Kelly pełny: ${fullKellyPct.toFixed(1)}% · Kelly frakcyjny (${state.breakoutKellyFractionPct}%): ${fracPct.toFixed(1)}% kapitału ≈ ${Math.round(positionValue).toLocaleString("pl-PL")} na pozycję.`;
}

function updateBreakoutKellySummary() {
    const el = document.getElementById("breakoutKellySummary");
    if (el) el.textContent = breakoutKellySummaryText();
}

// Suwaki/przełączniki/kalkulator Kelly'ego nad tabelą Breakout
// (#breakoutControls) — ten sam wzorzec co initWybicieControls/
// initContinuationControls, własny klucz localStorage.
function initBreakoutControls() {
    try {
        const saved = JSON.parse(localStorage.getItem(BREAKOUT_SETTINGS_KEY) || "null");
        if (saved) {
            if (Number.isFinite(saved.minConsolidationWeeks)) state.breakoutMinConsolidationWeeks = saved.minConsolidationWeeks;
            if (Number.isFinite(saved.fireLookbackWeeks)) state.breakoutFireLookbackWeeks = saved.fireLookbackWeeks;
            if (typeof saved.requireNatr === "boolean") state.breakoutRequireNatr = saved.requireNatr;
            if (typeof saved.requireMacd === "boolean") state.breakoutRequireMacd = saved.requireMacd;
            if (typeof saved.requireVolumeSpike === "boolean") state.breakoutRequireVolumeSpike = saved.requireVolumeSpike;
            if (Number.isFinite(saved.equity)) state.breakoutEquity = saved.equity;
            if (Number.isFinite(saved.winRatePct)) state.breakoutWinRatePct = saved.winRatePct;
            if (Number.isFinite(saved.rewardRisk)) state.breakoutRewardRisk = saved.rewardRisk;
            if (Number.isFinite(saved.kellyFractionPct)) state.breakoutKellyFractionPct = saved.kellyFractionPct;
        }
    } catch (e) { /* brak localStorage — zostają domyślne */ }

    const save = () => {
        try {
            localStorage.setItem(BREAKOUT_SETTINGS_KEY, JSON.stringify({
                minConsolidationWeeks: state.breakoutMinConsolidationWeeks,
                fireLookbackWeeks: state.breakoutFireLookbackWeeks,
                requireNatr: state.breakoutRequireNatr,
                requireMacd: state.breakoutRequireMacd,
                requireVolumeSpike: state.breakoutRequireVolumeSpike,
                equity: state.breakoutEquity,
                winRatePct: state.breakoutWinRatePct,
                rewardRisk: state.breakoutRewardRisk,
                kellyFractionPct: state.breakoutKellyFractionPct,
            }));
        } catch (e) { /* ignoruj */ }
    };

    const rerender = () => {
        save();
        renderBreakoutPanel();
        if (state.drawerUniverse === "BREAKOUT") renderBreakoutTable();
        updateBreakoutKellySummary();
    };

    const bindSlider = (inputId, valueId, stateKey, unit) => {
        const input = document.getElementById(inputId);
        const valueEl = document.getElementById(valueId);
        if (!input) return;
        input.value = state[stateKey];
        if (valueEl) valueEl.textContent = `${state[stateKey]}${unit}`;
        input.addEventListener("input", () => {
            state[stateKey] = Number(input.value);
            if (valueEl) valueEl.textContent = `${state[stateKey]}${unit}`;
            rerender();
        });
    };
    bindSlider("breakoutMinConsolidationInput", "breakoutMinConsolidationValue", "breakoutMinConsolidationWeeks", " tyg.");
    bindSlider("breakoutFireLookbackInput", "breakoutFireLookbackValue", "breakoutFireLookbackWeeks", " tyg.");

    const bindToggle = (btnId, stateKey) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.classList.toggle("active", state[stateKey]);
        btn.addEventListener("click", () => {
            state[stateKey] = !state[stateKey];
            btn.classList.toggle("active", state[stateKey]);
            rerender();
        });
    };
    bindToggle("breakoutRequireNatrBtn", "breakoutRequireNatr");
    bindToggle("breakoutRequireMacdBtn", "breakoutRequireMacd");
    bindToggle("breakoutRequireVolumeBtn", "breakoutRequireVolumeSpike");

    const bindNumber = (inputId, stateKey) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.value = state[stateKey];
        input.addEventListener("input", () => {
            const v = Number(input.value);
            if (Number.isFinite(v)) state[stateKey] = v;
            rerender();
        });
    };
    bindNumber("breakoutEquityInput", "breakoutEquity");
    bindNumber("breakoutWinRateInput", "breakoutWinRatePct");
    bindNumber("breakoutRewardRiskInput", "breakoutRewardRisk");
    bindNumber("breakoutKellyFractionInput", "breakoutKellyFractionPct");

    updateBreakoutKellySummary();
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
        <td title="Cena, przy której warto obserwować wybicie; dymek pokazuje też sugerowany stop (dolna granica środkowej tercji konsolidacji)">${levelToWatchCellHtml(r)}</td>
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
        initWybicieControls();
        initContinuationControls();
        initBreakoutControls();
        renderWybiciePanel();
        renderTtmSqueezePanel();
        renderContinuationPanel();
        renderMarketTrendBanner();
        renderBreakoutPanel();
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
        classifyBreakout, combinedBreakoutCandidates, breakoutKellyFraction, breakoutPositionFor,
    };
}
