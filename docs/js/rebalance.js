
// UNIVERSES/PLN_UNIVERSES/STAGE_LABELS/STAGE_COLORS/stageCellHtml/compareRows
// żyją teraz w js/shared.js, które rebalance.html ładuje PRZED tym plikiem
// (patrz komentarz na górze shared.js). showToast/initConnStatus/
// hideLoadingOverlay żyją analogicznie w js/qol.js (patrz komentarz na górze
// tamtego pliku), ładowanym tuż po shared.js.
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./qol.js"));
}

const TRADE_THRESHOLD_PCT = 0.005; // pomijamy sugestie mniejsze niż 0.5% kapitału docelowego

// ============================================================
// Rebalanser jest teraz W PEŁNI AUTOMATYCZNY, na wyraźną prośbę użytkownika:
// wcześniejszy przepływ etapowy (Krok 1 — wybierz uniwersum wg Global Equity
// Momentum, Krok 2 — ręcznie dodawaj spółki do skumulowanego portfela, patrz
// git history / CLAUDE.md) został zastąpiony jednym ustawieniem — "ile spółek
// ma być w portfelu" — z którego rebalanser sam wybiera TOP N wg momentum i
// sam dobiera wagi. GEM (docs/data/global_equity_momentum.json) nie steruje
// już niczym tutaj — jego jedyną rolą w rebalanserze było wskazywanie, KTÓRE
// uniwersum przeglądać w Kroku 2, a tego kroku już nie ma; pipeline nadal go
// liczy (nic w backendzie się nie zmieniło), po prostu ta strona przestała go
// czytać.
//
// WIG20/mWIG40 zostały usunięte z PULI rebalansera — użytkownik monitoruje
// je sam i trzyma przez osobny ETF, poza tym narzędziem. Zostają w pełni
// obliczane i pokazywane na dashboardzie (index.html), tylko rebalance.js już
// ich nie dotyka. Pula rebalansera to teraz trzy uniwersa, wszystkie w USD
// (stąd też koniec potrzeby mieszania PLN/USD bez przewalutowania gdziekolwiek
// w WYNIKACH tego narzędzia — patrz fmtMoney/currentMoneyFmt niżej):
//  - SP500: `constituents` — to już jest top ~100 spółek wg
//    select_with_buffer/TARGET_QUINTILE w run_query.py (kwintyl z ~500 to i
//    tak dokładnie 100, capped przez MAX_HOLDINGS=100) — dokładnie ten sam
//    rozmiar co S&P 500 Momentum Index/SPMO, o co użytkownik prosił wprost
//    ("top 100 spółek z sp500 jak w SPMO"), plus bonus w postaci bufora 20%
//    zmniejszającego rotację względem tygodnia poprzedniego.
//  - NASDAQ100: `all_constituents` — CAŁY skład (nie tylko kwintyl pipeline'u)
//    — użytkownik chce "cały nasdaq100", nie tylko jego własny top decyl.
//  - DOWJONES: `constituents` — i tak już cały zestaw (DOWJONES jest w
//    EQUAL_WEIGHT_UNIVERSES w run_query.py, bez selekcji kwintylowej), więc
//    to dokładnie "cały DJIA".
// ============================================================
const REBALANCE_UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES"];
const REBALANCE_UNIVERSE_LABELS = { SP500: "S&P 500", NASDAQ100: "Nasdaq 100", DOWJONES: "Dow Jones" };

// ============================================================
// CORE / SATELITA (60/40) — na wyraźną prośbę użytkownika, zastępuje wcześniejszy
// DOWJONES_WEIGHT_MULTIPLIER (jeden globalny mnożnik wagi dla każdej spółki z
// Dow) osobnym, dwuczęściowym podziałem KAPITAŁU:
//  - CORE (CORE_ALLOCATION_PCT = 60% kapitału) — "stabilne blue chipy w fazie
//    wzrostowej": kandydaci to spółki z DOWJONES, z priorytetem dla tych w
//    Etapie 2 (2A/2B — potwierdzony trend wzrostowy, patrz Weinstein stage w
//    CLAUDE.md), posortowane (faza wzrostowa jako pierwsze kryterium, potem
//    momentum_score). Jeśli sam Dow (30 spółek) nie wypełni wszystkich slotów
//    core, DOBIJANE jest z SP500 (tym samym kryterium sortowania) — na
//    wyraźne życzenie użytkownika, NIE z pozostałych spółek Dow spoza Etapu 2
//    i NIE zostawiane puste. Patrz coreCandidateRows/selectCoreSatelliteRows.
//  - SATELITA (pozostałe 40%) — "dynamicznie rosnące spółki": wszystko, co
//    zostało z eligiblePoolRows() po odjęciu core, posortowane wg
//    momentum_score. Dodatkowo faworyzuje spółki z indeksu, który dziś
//    WYGRYWA 12-miesięczny wyścig Global Equity Momentum spośród
//    DOWJONES/SP500/NASDAQ100 (patrz WINNER_INDEX_WEIGHT_MULTIPLIER/
//    gemIndexReturns/satelliteWinnerUniverse niżej) — ten sam mechanizm co
//    dawny GEM-jako-selektor uniwersum (patrz "What this repo is" w
//    CLAUDE.md), tylko że dziś dogrywa WAGĘ wewnątrz satelity zamiast wybierać
//    CAŁE uniwersum do przeglądania.
// Kapitał jest dzielony TWARDO 60/40 między obie grupy (nie tylko liczba
// spółek) — klasyczna definicja strategii core-satellite: core zawsze dostaje
// dokładnie 60% zainwestowanego kapitału niezależnie od tego, jak wypadną
// wagi momentum wewnątrz każdej z grup. Jeśli jedna z grup wyszła pusta
// (skrajny przypadek — np. wykluczono ręcznie wszystkie kandydatury), jej
// kapitał w całości przechodzi do drugiej, wypełnionej grupy zamiast zniknąć.
// Ten mechanizm dotyczy WYŁĄCZNIE wagi/podziału kapitału — SELEKCJA nadal
// bazuje wyłącznie na momentum_score (plus priorytet Etapu 2 w core), zgodnie
// z tą samą zasadą co poprzedni DOWJONES_WEIGHT_MULTIPLIER ("wagi", nie
// "dobór").
// ============================================================
const CORE_ALLOCATION_PCT = 0.6;

// Faworyzuje w satelicie spółki z indeksu, który dziś wygrywa 12-miesięczny
// wyścig GEM (docs/data/global_equity_momentum.json, patrz loadGemReturns
// niżej) — SP500/NASDAQ100/DOWJONES mają realne dane z yfinance (w
// przeciwieństwie do WIG20/mWIG40 w Rebalanserze PL, gdzie yfinance nie ma
// historii dla tickerów-indeksów), więc nie trzeba tu żadnego ręcznego
// wpisywania zwrotów. Ta sama wartość i ten sam mechanizm co dawny
// DOWJONES_WEIGHT_MULTIPLIER (usunięty — core/satelita to teraz jedyny,
// spójny sposób faworyzowania, bez podwójnego nakładania się dwóch
// mechanizmów) — podkręć/przykręć tu, jeśli efekt ma być mocniejszy/słabszy.
const WINNER_INDEX_WEIGHT_MULTIPLIER = 1.5;

const SETTINGS_KEY = "momentum_rebalance_settings";
const HOLDINGS_KEY = "momentum_rebalance_holdings";
const EXCLUDED_KEY = "momentum_rebalance_excluded";
const POOL_COLLAPSED_KEY = "momentum_rebalance_pool_collapsed";
const STAGE_FILTER_KEY = "momentum_rebalance_stage_filter";

// portfolioSize — ile spółek (TOP N z puli, patrz wyżej) ma być w portfelu;
// jedyny "wybór" jaki użytkownik podejmuje, resztą (który to konkretnie
// spółki, jakie wagi) zajmuje się rebalanser sam.
const DEFAULT_SETTINGS = { contribution: 0, portfolioSize: 20 };

let universeData = {};    // { SP500: {...json}, NASDAQ100: {...}, DOWJONES: {...} }
let priceMap = {};        // ticker -> { price, sources: [universe,...] } — dla WSZYSTKICH tickerow (holdingi moga byc z dowolnego indeksu, w tym WIG20/mWIG40)
let equityCurveData = {}; // { SP500: {dates, momentum_index, benchmark_index, ...}, ... }
let gemIndexReturns = {}; // { SP500: 18.98, NASDAQ100: 25.8, DOWJONES: 16.78 } — tylko REBALANCE_UNIVERSES, patrz loadGemReturns/satelliteWinnerUniverse niżej

function loadSettings() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { stored = {}; }
    return { ...DEFAULT_SETTINGS, ...stored };
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function loadHoldings() {
    try {
        return JSON.parse(localStorage.getItem(HOLDINGS_KEY)) || [];
    } catch (e) { return []; }
}
function saveHoldings(h) { localStorage.setItem(HOLDINGS_KEY, JSON.stringify(h)); }

function loadExcluded() {
    try {
        return JSON.parse(localStorage.getItem(EXCLUDED_KEY)) || [];
    } catch (e) { return []; }
}
function saveExcluded() { localStorage.setItem(EXCLUDED_KEY, JSON.stringify(excluded)); }

// Zwinięcie/rozwinięcie rankingu puli (Krok 2, patrz initPoolToggle niżej) —
// domyślnie ZWINIĘTE: pula ma dziś ~150-250 wierszy (SP500 top 100 +
// Nasdaq 100 + Dow Jones), a użytkownik zgłosił, że tyle scrollowania po
// samej tabeli, zanim dotrze do reszty strony (pozycje/sugestia/wykresy),
// jest uciążliwe. Zapamiętywane w localStorage, więc raz rozwinięta tabela
// zostaje rozwinięta między wizytami, dopóki ktoś jej znów nie zwinie.
function loadPoolCollapsed() {
    try {
        const v = localStorage.getItem(POOL_COLLAPSED_KEY);
        return v === null ? true : v === "1"; // brak zapisu -> domyslnie zwinieta
    } catch (e) { return true; }
}
function savePoolCollapsed(v) { localStorage.setItem(POOL_COLLAPSED_KEY, v ? "1" : "0"); }

// Filtr etapu Weinsteina (poolStageFilter, patrz niżej) — zapisywany tym samym
// wzorcem co reszta rebalanserowego stanu (settings/holdings/excluded/
// poolCollapsed), bo skoro filtr REALNIE zawęża, z czego dobierany jest TOP N
// (patrz komentarz przy poolStageFilter), brak zapisu oznaczał realny bug:
// wyjście ze strony i powrót cichcem resetowało filtr do "ALL", więc sugestia/
// wagi po powrocie były policzone z całej, nieprzefiltrowanej puli — mimo że
// użytkownik wciąż widział zaznaczony przycisk filtra sprzed wyjścia (a po
// przeładowaniu strony nawet tego już nie widział, bo UI też wracał do "ALL").
// "ALL" (string) albo lista stage'ów (np. ["1","2"]) — Set nie serializuje się
// do JSON wprost, więc na zapisie/odczycie konwertujemy go do/z tablicy.
function loadPoolStageFilter() {
    try {
        const raw = localStorage.getItem(STAGE_FILTER_KEY);
        if (raw === null) return "ALL";
        const parsed = JSON.parse(raw);
        if (parsed === "ALL") return "ALL";
        if (Array.isArray(parsed) && parsed.length) return new Set(parsed);
        return "ALL";
    } catch (e) { return "ALL"; }
}
function savePoolStageFilter(v) {
    localStorage.setItem(STAGE_FILTER_KEY, JSON.stringify(v === "ALL" ? "ALL" : [...v]));
}

let settings = loadSettings();
let holdings = loadHoldings();
let excluded = loadExcluded();
let poolCollapsed = loadPoolCollapsed();

async function loadUniverseData() {
    for (const u of REBALANCE_UNIVERSES) {
        try {
            const res = await fetch(`data/${u.toLowerCase()}.json`, { cache: "no-store" });
            universeData[u] = await res.json();
        } catch (e) {
            universeData[u] = { universe: u, ref_date: null, constituents: [], all_constituents: [] };
        }
    }

    // Ceny dla WSZYSTKICH spółek we WSZYSTKICH indeksach (nie tylko trzech,
    // z których dobiera pula rebalansera) — żeby móc wycenić dowolną pozycję
    // użytkownika, łącznie ze starą pozycją z WIG20/mWIG40, którą nadal może
    // trzymać nawet jeśli rebalanser już jej nie dobiera.
    priceMap = {};
    try {
        const res = await fetch("data/all_prices.json", { cache: "no-store" });
        const allPrices = await res.json();
        Object.entries(allPrices).forEach(([ticker, info]) => {
            priceMap[ticker] = { price: info.price, sources: info.universes };
        });
    } catch (e) { /* brak pliku — priceMap zostanie uzupełniony niżej z list momentum */ }

    for (const u of REBALANCE_UNIVERSES) {
        (universeData[u].constituents || []).forEach(c => {
            if (!priceMap[c.ticker]) priceMap[c.ticker] = { price: c.price, sources: [u] };
        });
    }

    try {
        const res = await fetch("data/equity_curve.json", { cache: "no-store" });
        equityCurveData = res.ok ? await res.json() : {};
    } catch (e) {
        equityCurveData = {};
    }
}

// GEM (docs/data/global_equity_momentum.json) wraca jako konsument tej strony
// — nie po to, by wskazywać KTÓRE uniwersum przeglądać (jak w dawnym, ręcznym
// designie, patrz "What this repo is" w CLAUDE.md), tylko żeby wiedzieć, który
// z trzech uniwersów puli (SP500/NASDAQ100/DOWJONES) dziś WYGRYWA 12-miesięczny
// wyścig i faworyzować jego spółki wagowo wewnątrz satelity (patrz
// WINNER_INDEX_WEIGHT_MULTIPLIER/satelliteWinnerUniverse). Brak pliku/offline
// -> gemIndexReturns zostaje puste, satelliteWinnerUniverse() zwraca null,
// satelita po prostu nie faworyzuje żadnego konkretnego indeksu (ta sama
// łagodna degradacja co reszta tego modułu).
async function loadGemReturns() {
    gemIndexReturns = {};
    try {
        const res = await fetch("data/global_equity_momentum.json", { cache: "no-store" });
        const data = await res.json();
        (data.indices || []).forEach(idx => {
            if (REBALANCE_UNIVERSES.includes(idx.universe) && typeof idx.return_pct === "number") {
                gemIndexReturns[idx.universe] = idx.return_pct;
            }
        });
    } catch (e) { /* brak pliku/offline — gemIndexReturns zostaje puste */ }
}

// Który z trzech uniwersów puli aktualnie wygrywa 12-miesięczny wyścig GEM —
// null gdy brak danych (np. offline) albo żaden zwrot nie jest jeszcze znany.
function satelliteWinnerUniverse() {
    let winner = null, best = -Infinity;
    REBALANCE_UNIVERSES.forEach(u => {
        if (gemIndexReturns[u] !== undefined && gemIndexReturns[u] > best) {
            best = gemIndexReturns[u];
            winner = u;
        }
    });
    return winner;
}

function fmtMoney(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMoneyPln(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}

// Formatter dla PULI rebalansera i wszystkiego, co z niej wynika (ranking,
// sugestia, statystyki, Monte Carlo, krzywa historyczna) — pula to teraz
// zawsze SP500+NASDAQ100+DOWJONES, czyli zawsze USD, więc nie ma już
// potrzeby wykrywania miksu walut jak wtedy, gdy portfel mógł kumulować
// spółki z WIG20/mWIG40. Zostaje jako osobna funkcja (nie wprost fmtMoney w
// każdym wywołaniu) żeby było jasne w kodzie DLACZEGO to zawsze USD, i żeby
// testy miały jeden punkt zaczepienia.
function currentMoneyFmt() { return fmtMoney; }

// Formatter dla ANALIZY PORTFELA (donut niżej) — dzieli TWOJE OBECNE pozycje
// (holdings), które teoretycznie nadal mogą zawierać starą pozycję z
// WIG20/mWIG40 (rebalanser już ich nie dobiera, ale nie usuwa Ci ich z
// portfela) — bazuje więc na walutach WSZYSTKICH aktualnie trzymanych
// tickerów, nie na (zawsze-USD) puli rebalansera. Przy realnym miksie walut
// spada na fmtMoney (USD), ta sama uproszczona konwencja "miksuj bez
// przewalutowania" co holdingsValue() (patrz CLAUDE.md).
function holdingsMoneyFmt() {
    const tickers = Object.keys(holdingShares());
    if (tickers.length === 0) return fmtMoney;
    if (tickers.every(t => currencyOf(t) === "PLN")) return fmtMoneyPln;
    return fmtMoney;
}

// Formatter dla KONKRETNEGO tickera w tabeli holdingów — pozycje tam mogą
// być z różnych uniwersów/walut naraz (patrz currencyOf).
function moneyFmtForCurrency(currency) { return currency === "PLN" ? fmtMoneyPln : fmtMoney; }

function fmtQty(n) {
    return (Math.round(n * 1000) / 1000).toString().replace(".", ",");
}

// Ile sztuk (ułamkowo) kupić/sprzedać za daną kwotę.
function sharesSuggestion(dollarAmount, price, moneyFmt = fmtMoney) {
    if (!price) return `~${moneyFmt(dollarAmount)} (brak ceny do przeliczenia na sztuki)`;
    const qty = dollarAmount / price;
    return `${fmtQty(qty)} szt. (~${moneyFmt(dollarAmount)})`;
}

// Waluta danego tickera (do formatowania ceny/wartości w tabeli holdingów) —
// na podstawie tego, w jakim uniwersum go znaleziono (patrz priceMap/
// all_prices.json, które nadal pokrywa WSZYSTKIE 5 indeksów, nie tylko
// REBALANCE_UNIVERSES). Nieznany ticker (spoza śledzonych indeksów) domyślnie
// USD.
function currencyOf(ticker) {
    const sources = priceMap[ticker]?.sources || [];
    return sources.some(u => PLN_UNIVERSES.has(u)) ? "PLN" : "USD";
}

function holdingsValue() {
    return holdings.reduce((sum, h) => {
        if (!h.ticker) return sum;
        const price = priceMap[h.ticker]?.price;
        return sum + (price ? price * (h.shares || 0) : 0);
    }, 0);
}

function targetCapital() {
    return holdingsValue() + (settings.contribution || 0);
}

// Wartość pozycji wykluczonych z rebalansu — ten kapitał zostaje "poza
// systemem": nie liczy się do puli, którą alokujemy na TOP N spółek.
function excludedValue() {
    return holdings.reduce((sum, h) => {
        if (!h.ticker || !excluded.includes(h.ticker)) return sum;
        const price = priceMap[h.ticker]?.price;
        return sum + (price ? price * (h.shares || 0) : 0);
    }, 0);
}

// Liczba akcji trzymanych, zgrupowana po tickerze.
function holdingShares() {
    const shares = {};
    holdings.forEach(h => {
        if (h.ticker) shares[h.ticker] = (shares[h.ticker] || 0) + (h.shares || 0);
    });
    return shares;
}

// ============================================================
// WYKLUCZENIA — spółki, których panel nigdy nie ma sugerować kupić ani
// sprzedać, nawet jeśli je importujesz z XTB albo wybierze je automatyczny
// TOP N. Wykluczona spółka znika z puli CAŁKOWICIE (patrz eligiblePoolRows
// niżej) — jeśli była w TOP N, jej miejsce automatycznie zajmuje kolejna w
// rankingu (pula "dopełnia się" do N, nie kurczy).
// ============================================================
function renderExcludedList() {
    const wrap = document.getElementById("excludedList");
    wrap.innerHTML = excluded.length
        ? excluded.map(t => `<span class="exclude-chip">${t}<button class="exclude-chip-remove" data-ticker="${t}" title="Usuń wykluczenie">✕</button></span>`).join("")
        : `<span class="text-faint">Brak wykluczonych spółek.</span>`;
    wrap.querySelectorAll(".exclude-chip-remove").forEach(btn => {
        btn.addEventListener("click", () => {
            excluded = excluded.filter(t => t !== btn.dataset.ticker);
            saveExcluded();
            renderExcludedList();
            renderPoolTable();
            refreshOutputs();
        });
    });
}

function initExcludeForm() {
    const input = document.getElementById("excludeInput");
    const addTicker = () => {
        const t = input.value.trim().toUpperCase();
        input.value = "";
        if (!t || excluded.includes(t)) return;
        excluded.push(t);
        saveExcluded();
        renderExcludedList();
        renderPoolTable();
        refreshOutputs();
    };
    document.getElementById("excludeAddBtn").addEventListener("click", addTicker);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTicker(); } });
}

// ============================================================
// PULA REBALANSERA — SP500 (top ~100) + NASDAQ100 (cały) + DOWJONES (cały),
// połączone w jedną listę i posortowane wg momentum_score malejąco (patrz
// komentarz na górze pliku dla dokładnego uzasadnienia każdego uniwersum).
// Porównywanie momentum_score WPROST między uniwersami to świadome
// uproszczenie — ten sam wskaźnik, liczony niezależnie w każdym z nich
// (get_universe_metrics), ale nie ma dziś globalnego, wspólnego dla
// wszystkich 3 uniwersów rankingu w pipeline; to ta sama konwencja co
// wcześniejsze łączenie ręcznie wybranych spółek z różnych uniwersów w jeden
// portfel (patrz git history / CLAUDE.md).
// ============================================================
function poolRowsForUniverse(universe) {
    const data = universeData[universe] || {};
    if (universe === "NASDAQ100") return data.all_constituents || data.constituents || [];
    return data.constituents || data.all_constituents || [];
}

// Zbiór tickerów rzeczywiście należących do danego uniwersum — używany przez
// core/satelitę (coreCandidateRows) i przez faworyzowanie zwycięzcy GEM w
// satelicie (computeAutoTargets) do rozstrzygania PRAWDZIWEGO członkostwa.
// Świadomie NIE bazujemy na `row.universe` przypisanym przez combinedPoolRows()
// (deduplikacja tam wybiera uniwersum z WYŻSZYM momentum_score, nie z
// "najbardziej wartym boosta/core") — spora część Dow 30 to jednocześnie duże
// spółki SP500/Nasdaq100, więc gdyby liczyć tylko po `row.universe`, wiele
// realnych Dow-owych blue-chipów zostałoby otagowanych jako SP500/NASDAQ100
// (bo tam ich momentum_score wypadło wyżej) i core/faworyzowanie by je ominęło
// — dokładnie odwrotnie od tego, o co prosił użytkownik.
function trueUniverseTickerSet(universe) {
    return new Set(poolRowsForUniverse(universe).map(c => c.ticker));
}

// Ten sam ticker może teoretycznie wystąpić w dwóch uniwersach naraz (duży
// large-cap obecny i w SP500, i w NASDAQ100) — żeby TOP N liczył unikalne
// spółki (a nie dwa sloty dla tej samej firmy), bierzemy tylko wystąpienie z
// wyższym momentum_score.
function combinedPoolRows() {
    const byTicker = new Map();
    REBALANCE_UNIVERSES.forEach(universe => {
        poolRowsForUniverse(universe).forEach(c => {
            const existing = byTicker.get(c.ticker);
            if (!existing || (c.momentum_score || 0) > (existing.momentum_score || 0)) {
                byTicker.set(c.ticker, { ...c, universe });
            }
        });
    });
    return [...byTicker.values()].sort((a, b) => (b.momentum_score || 0) - (a.momentum_score || 0));
}

// Filtr etapow Weinsteina (Krok 2, patrz stage-filter-bar w rebalance.html) —
// MULTI-SELECT (na zyczenie uzytkownika: "czasem chce spolki z stage 1 i
// stage 2"), ten sam wzorzec co dawny, manualny Krok 2. "ALL" to sentinel
// oznaczajacy brak filtra. **Filtr NIE jest czysto kosmetyczny (samo
// przeglądanie tabeli)** — na wyraźną prośbę użytkownika ("jak zaznaczę [filtr]
// to ma TAKI N z tej listy wybrać, po to jest tam to filtrowanie") faktycznie
// zawęża, z czego rebalanser dobiera TOP N: `eligiblePoolRows()` (i przez to
// `autoSelectedRows()`/`computeAutoTargets()`) filtruje po nim, więc
// zaznaczenie np. tylko Etapu 2 realnie oznacza "kupuj tylko spośród spółek w
// Etapie 2", nie tylko "pokaż mi tylko Etap 2 w tabeli". Persystowany w
// localStorage (loadPoolStageFilter/savePoolStageFilter, patrz wyżej) —
// inaczej niż settings/holdings/excluded/poolCollapsed, to pole kiedyś NIE
// przetrwało nawigacji między stronami, co był realny, zgłoszony bug.
let poolStageFilter = loadPoolStageFilter();

function matchesPoolStageFilter(stage) {
    if (poolStageFilter === "ALL") return true;
    if (!stage) return false;
    const bucket = (stage === "2A" || stage === "2B") ? "2" : stage;
    return poolStageFilter.has(bucket);
}

function poolStageFilterLabel() {
    if (poolStageFilter === "ALL") return null;
    const labels = { "1": "1", "2": "2A/2B", "3": "3", "4": "4" };
    return [...poolStageFilter].map(s => labels[s]).join(", ");
}

// Pula bez ręcznie wykluczonych tickerów I (gdy filtr aktywny) bez spółek
// spoza wybranego etapu Weinsteina (matchesPoolStageFilter, powyżej) — z
// numerem pozycji (pool_rank) przydzielonym PO obu tych filtrach, więc jeśli
// spółka z wykluczonej listy/spoza filtra siedziała w top 5, kolejne spółki
// "przesuwają się w górę" i TOP N naprawdę oznacza N różnych, kupowalnych
// spółek pasujących do aktualnego filtra.
function eligiblePoolRows() {
    return combinedPoolRows()
        .filter(c => !excluded.includes(c.ticker))
        .filter(c => matchesPoolStageFilter(c.weekly_chart && c.weekly_chart.current_stage))
        .map((c, i) => ({ ...c, pool_rank: i + 1 }));
}

// Czy spółka jest w potwierdzonym trendzie wzrostowym (Etap 2A/2B, patrz
// Weinstein stage w CLAUDE.md) — kryterium "faza wzrostowa" dla core.
function isGrowthPhase(c) {
    const stage = c.weekly_chart && c.weekly_chart.current_stage;
    return stage === "2A" || stage === "2B";
}

// Kandydaci do CORE (patrz komentarz przy CORE_ALLOCATION_PCT) — DOWJONES
// (prawdziwe członkostwo, nie post-deduplikacyjny tag) jako pierwsza warstwa,
// SP500 jako druga (dobijająca), oba posortowane: faza wzrostowa najpierw,
// potem momentum_score malejąco. `pool` to już eligiblePoolRows() (po
// wykluczeniach i filtrze etapu) — core nigdy nie sięga po spółkę spoza tej
// puli.
function coreCandidateRows(pool) {
    const dowTickers = trueUniverseTickerSet("DOWJONES");
    const sp500Tickers = trueUniverseTickerSet("SP500");
    const byGrowthThenScore = (a, b) => {
        const growthDiff = (isGrowthPhase(b) ? 1 : 0) - (isGrowthPhase(a) ? 1 : 0);
        return growthDiff !== 0 ? growthDiff : (b.momentum_score || 0) - (a.momentum_score || 0);
    };
    const dowRows = pool.filter(c => dowTickers.has(c.ticker)).sort(byGrowthThenScore);
    const sp500Rows = pool.filter(c => sp500Tickers.has(c.ticker) && !dowTickers.has(c.ticker)).sort(byGrowthThenScore);
    return [...dowRows, ...sp500Rows];
}

// Dzieli eligiblePoolRows() na sloty CORE (round(n * CORE_ALLOCATION_PCT),
// patrz coreCandidateRows) i SATELITA (reszta z n, wszystko co zostało z puli
// po odjęciu core, posortowane wg momentum_score) — patrz duży komentarz przy
// CORE_ALLOCATION_PCT dla pełnego uzasadnienia. Jeśli sam DOWJONES+SP500 nie
// wypełni wszystkich slotów core (rzadkie — 30+100 kandydatów to zwykle dużo
// więcej niż round(n*0.6) nawet przy dużym n), core po prostu wychodzi
// mniejszy — computeAutoTargets ma na to osobny bezpiecznik (patrz tam).
function selectCoreSatelliteRows(n) {
    if (!n || n <= 0) return { coreRows: [], satelliteRows: [] };
    const pool = eligiblePoolRows();
    const coreSlots = Math.round(n * CORE_ALLOCATION_PCT);
    const coreRows = coreCandidateRows(pool).slice(0, coreSlots);
    const coreTickers = new Set(coreRows.map(c => c.ticker));
    const satelliteSlots = n - coreRows.length;
    const satelliteRows = pool
        .filter(c => !coreTickers.has(c.ticker))
        .sort((a, b) => (b.momentum_score || 0) - (a.momentum_score || 0))
        .slice(0, satelliteSlots);
    return { coreRows, satelliteRows };
}

// Unia core+satelity — N unikalnych spółek dokładnie jak przed wprowadzeniem
// core/satelity, tylko teraz złożona z dwóch grup zamiast jednej płaskiej
// listy. Zachowane jako osobna funkcja, bo poolRowHtml/testy nadal chcą po
// prostu "czy ten ticker jest dziś w portfelu", bez rozróżniania grupy.
function autoSelectedRows(n) {
    const { coreRows, satelliteRows } = selectCoreSatelliteRows(n);
    return [...coreRows, ...satelliteRows];
}

// ============================================================
// RANKING PULI — pełna, sortowalna, filtrowalna po etapie Weinsteina tabela
// (ta sama tabela co na dashboardzie w duchu, patrz app.js::renderTable) —
// pokazuje z czego rebalanser wybiera i które N pozycji dziś realnie wchodzi
// do portfela (a przy aktywnym filtrze etapu — patrz poolStageFilter powyżej
// — N pozycji spośród przefiltrowanej listy). Nie ma tu już przycisku
// "+ Dodaj" — wybór spółek jest w pełni automatyczny, jedyne co ustawiasz to
// liczbę spółek (Krok 1 powyżej) i, opcjonalnie, filtr etapu.
// ============================================================
let poolSortKey = "pool_rank";
let poolSortDir = "asc";

// `sleeve` — "core"/"satellite"/undefined — wyliczone RAZ na render przez
// renderPoolTable() (patrz sleeveByTicker tam) z selectCoreSatelliteRows(),
// żeby nie liczyć core/satelity osobno dla każdego wiersza.
function poolRowHtml(c, sleeve) {
    const stage = c.weekly_chart && c.weekly_chart.current_stage;
    const sleeveBadge = sleeve === "core"
        ? '<span class="action-badge buy" title="Core — stabilne blue chipy w fazie wzrostowej (60% kapitału)">Core</span>'
        : sleeve === "satellite"
            ? '<span class="action-badge buy" title="Satelita — dynamicznie rosnące spółki (40% kapitału)">Satelita</span>'
            : '<span class="action-badge skip">—</span>';
    return `
        <td><span class="rank-badge">${c.pool_rank}</span></td>
        <td class="ticker-cell">${c.ticker}</td>
        <td>${REBALANCE_UNIVERSE_LABELS[c.universe]}</td>
        <td>${c.sector}</td>
        <td>${fmtMoney(c.price)}</td>
        <td class="${c.momentum_pct >= 0 ? "positive" : "negative"}">${c.momentum_pct.toFixed(2)}%</td>
        <td>${c.momentum_window}</td>
        <td>${c.volatility_pct.toFixed(2)}%</td>
        <td>${c.momentum_score.toFixed(3)}</td>
        <td>${stageCellHtml(stage)}</td>
        <td>${sleeveBadge}</td>
        <td><button type="button" class="tv-row-btn chart-row-btn" data-ticker="${c.ticker}" data-universe="${c.universe}" title="Otwórz wykres ${c.ticker} (chart.html)">📈</button></td>
    `;
}

function updatePoolSortHeaderClasses() {
    document.querySelectorAll("#poolTable thead th").forEach(th => {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.dataset.key === poolSortKey) {
            th.classList.add(poolSortDir === "asc" ? "sort-asc" : "sort-desc");
        }
    });
}

function initPoolSort() {
    document.querySelectorAll("#poolTable thead th").forEach(th => {
        th.addEventListener("click", () => {
            const key = th.dataset.key;
            if (!key) return; // kolumny bez sortowania (Etap, W portfelu, Wykres)
            if (poolSortKey === key) {
                poolSortDir = poolSortDir === "asc" ? "desc" : "asc";
            } else {
                poolSortKey = key;
                poolSortDir = "asc";
            }
            updatePoolSortHeaderClasses();
            renderPoolTable();
        });
    });
}

function updatePoolStageFilterButtons() {
    const bar = document.getElementById("poolStageFilterBar");
    if (!bar) return;
    bar.querySelectorAll(".stage-filter-btn").forEach(b => {
        const stage = b.dataset.stage;
        const active = stage === "ALL"
            ? poolStageFilter === "ALL"
            : (poolStageFilter !== "ALL" && poolStageFilter.has(stage));
        b.classList.toggle("active", active);
    });
}

function initPoolStageFilter() {
    const bar = document.getElementById("poolStageFilterBar");
    if (!bar) return;
    // Odzwierciedla filtr wczytany z localStorage (poolStageFilter mógł być
    // != "ALL" już przy starcie strony) w przyciskach — inaczej UI pokazywał
    // "Wszystkie" jako aktywne mimo że silnik w tle już liczył po zapisanym
    // filtrze, myląco sugerując, że nic nie jest zawężone.
    updatePoolStageFilterButtons();
    bar.querySelectorAll(".stage-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const stage = btn.dataset.stage;
            if (stage === "ALL") {
                poolStageFilter = "ALL";
            } else {
                const current = poolStageFilter === "ALL" ? new Set() : new Set(poolStageFilter);
                if (current.has(stage)) current.delete(stage); else current.add(stage);
                poolStageFilter = current.size ? current : "ALL";
            }
            savePoolStageFilter(poolStageFilter);
            updatePoolStageFilterButtons();
            renderPoolTable();
            // Filtr etapu teraz realnie zawęża pulę wyboru (patrz komentarz przy
            // poolStageFilter powyżej), więc zmiana filtra musi też przeliczyć
            // sugestię/Monte Carlo/krzywą historyczną — nie tylko odświeżyć samą
            // tabelę rankingu.
            refreshOutputs();
        });
    });
}

function poolRefDateNote() {
    const parts = REBALANCE_UNIVERSES
        .map(u => (universeData[u]?.ref_date ? `${REBALANCE_UNIVERSE_LABELS[u]}: ${universeData[u].ref_date}` : null))
        .filter(Boolean);
    return parts.join(" · ");
}

// Zwija/rozwija cały blok pod nagłówkiem Kroku 2 (filtr etapów + tabela) —
// #poolMeta (liczba spółek/ref date w samym nagłówku) zostaje zawsze
// widoczny, więc nawet zwinięta karta mówi, ile spółek jest w puli, bez
// trzeba jej rozwijać. `hidden`, nie `display:none` w CSS — ten sam wzorzec
// co #loadingOverlay (patrz js/qol.js) i inne ukrywane bloki w tym pliku.
function updatePoolToggleUi() {
    const btn = document.getElementById("poolToggleBtn");
    const content = document.getElementById("poolCollapsibleContent");
    if (!btn || !content) return;
    content.hidden = poolCollapsed;
    btn.textContent = poolCollapsed ? "▼ Rozwiń" : "▲ Zwiń";
    btn.title = poolCollapsed ? "Pokaż pełną listę spółek" : "Ukryj listę spółek";
}

function initPoolToggle() {
    const btn = document.getElementById("poolToggleBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
        poolCollapsed = !poolCollapsed;
        savePoolCollapsed(poolCollapsed);
        updatePoolToggleUi();
    });
    updatePoolToggleUi();
}

function renderPoolTable() {
    // allRows to JUŻ przefiltrowana (wykluczenia + etap) lista — eligiblePoolRows()
    // sama filtruje po poolStageFilter (patrz jej komentarz powyżej), więc tu nie
    // ma już osobnego kroku filtrowania (bez `matchesStage` w renderScreenerTable
    // poniżej) — rows === allRows zawsze. `totalUnfiltered` to ta sama pula bez
    // filtra etapu (ale wciąż bez wykluczeń), potrzebna tylko żeby pokazać "z ilu
    // ogółem" w linijce meta, gdy filtr faktycznie coś zawęża.
    const allRows = eligiblePoolRows();
    const filterLabel = poolStageFilterLabel();
    const totalUnfiltered = filterLabel
        ? combinedPoolRows().filter(c => !excluded.includes(c.ticker)).length
        : allRows.length;
    const refDates = poolRefDateNote();
    const n = settings.portfolioSize || 0;

    // Sleeve (core/satelita) każdego dziś wybranego tickera — liczone RAZ tutaj
    // (nie osobno w poolRowHtml na każdy wiersz) z selectCoreSatelliteRows(n).
    const { coreRows, satelliteRows } = selectCoreSatelliteRows(n);
    const sleeveByTicker = new Map();
    coreRows.forEach(c => sleeveByTicker.set(c.ticker, "core"));
    satelliteRows.forEach(c => sleeveByTicker.set(c.ticker, "satellite"));

    renderScreenerTable({
        tbody: document.getElementById("poolTableBody"),
        metaEl: document.getElementById("poolMeta"),
        allRows,
        compareFn: (a, b) => compareRows(a, b, poolSortKey, poolSortDir),
        colspan: 12,
        emptyAllMsg: filterLabel
            ? "Żadna spółka nie pasuje do wybranego etapu."
            : "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).",
        emptyFilteredMsg: "Żadna spółka nie pasuje do wybranego etapu.",
        metaText: () => {
            if (!refDates) return "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).";
            const base = `Pula: ${allRows.length} spółek (Core ${coreRows.length} + Satelita ${satelliteRows.length} = TOP ${n} w portfelu) · ${refDates}`;
            return !filterLabel ? base : `${base} · filtr etapu ${filterLabel} zawęża pulę z ${totalUnfiltered} do ${allRows.length}`;
        },
        rowHtml: c => poolRowHtml(c, sleeveByTicker.get(c.ticker)),
        afterRender: (tbody) => {
            tbody.querySelectorAll(".chart-row-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const params = new URLSearchParams({
                        ticker: btn.dataset.ticker, universe: btn.dataset.universe, back: "rebalance.html",
                    });
                    window.location.href = `chart.html?${params.toString()}`;
                });
            });
        },
    });
}

// Różne warianty raportu XTB nazywają kolumnę z ceną/datą otwarcia inaczej
// (PL/EN) — szukamy po dopasowaniu wzorca, nie dokładnej nazwy.
function findColIndex(header, patterns) {
    for (const p of patterns) {
        const idx = header.findIndex(h => p.test(String(h || "")));
        if (idx !== -1) return idx;
    }
    return -1;
}

// Excel przechowuje daty jako liczbę dni od 1899-12-30 (SheetJS nie
// konwertuje ich automatycznie na Date przy header:1 bez opcji cellDates) —
// obsługujemy zarówno tę liczbę, jak i typowe formaty tekstowe raportu XTB
// ("2024-09-17 0:00:00", "17.09.2024"). Zwraca "YYYY-MM-DD" albo null.
function xtbDateToIso(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number" && !isNaN(v)) {
        const ms = Math.round((v - 25569) * 86400 * 1000);
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    const iso = s.match(/^(\d{4})[-.](\d{2})[-.](\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = s.match(/^(\d{2})[.\/](\d{2})[.\/](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// ============================================================
// POZYCJE (holdings) — dodajesz/usuwasz akcje kiedy chcesz, bez ograniczeń.
// Jedna wspólna lista, niezależna od puli rebalansera — nadal może zawierać
// np. starą pozycję z WIG20/mWIG40, tylko rebalanser już jej nie dobiera na
// nowo.
// ============================================================
// Odświeża tylko kolumny Cena/Wartość dla jednego wiersza — bez przebudowy
// inputów, żeby nie tracić fokusu/kursora w trakcie pisania.
function refreshHoldingRowCells(tr, h) {
    const price = priceMap[h.ticker]?.price ?? null;
    const value = price !== null ? price * (h.shares || 0) : null;
    const moneyFmt = moneyFmtForCurrency(currencyOf(h.ticker));
    tr.querySelector(".h-price").innerHTML = price !== null ? moneyFmt(price) : '<span class="text-faint">brak</span>';
    tr.querySelector(".h-value").textContent = value !== null ? moneyFmt(value) : "—";
}

function renderHoldingsTable() {
    const tbody = document.getElementById("holdingsBody");
    tbody.innerHTML = "";
    holdings.forEach((h, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><input type="text" class="h-ticker" value="${h.ticker || ""}" placeholder="np. AAPL"></td>
            <td><input type="number" class="h-shares" min="0" step="any" value="${h.shares ?? ""}"></td>
            <td class="h-price"></td>
            <td class="h-value"></td>
            <td><button class="remove-row-btn" title="Usuń">✕</button></td>
        `;
        refreshHoldingRowCells(tr, h);
        tr.querySelector(".h-ticker").addEventListener("change", (e) => {
            holdings[i].ticker = e.target.value.trim().toUpperCase();
            e.target.value = holdings[i].ticker;
            saveHoldings(holdings);
            refreshHoldingRowCells(tr, holdings[i]);
            refreshOutputs();
        });
        tr.querySelector(".h-shares").addEventListener("input", (e) => {
            holdings[i].shares = parseFloat(e.target.value) || 0;
            saveHoldings(holdings);
            refreshHoldingRowCells(tr, holdings[i]);
            refreshOutputs();
        });
        tr.querySelector(".remove-row-btn").addEventListener("click", () => {
            holdings.splice(i, 1);
            saveHoldings(holdings);
            renderAll();
        });
        tbody.appendChild(tr);
    });
}

function initHoldingsForm() {
    document.getElementById("addHoldingBtn").addEventListener("click", () => {
        holdings.push({ ticker: "", shares: null });
        saveHoldings(holdings);
        renderAll();
    });
}

// ============================================================
// IMPORT Z RAPORTU XTB (arkusz "Open Positions") — wiersze podsumowania
// pozycji (jeden na ticker) mają pustą kolumnę "Type"; pojedyncze transakcje
// składowe (Type = "BUY"/"SELL") są pomijane, bo ich suma to właśnie wiersz
// podsumowania. Jeśli raport zawiera kolumny z ceną/datą otwarcia, zapisujemy
// je też (openPrice/openDate) — używane przy eksporcie do TradingView
// Portfolio, żeby nie podstawiać wszędzie dzisiejszej daty/ceny (patrz
// buildTvPortfolioCsv niżej). Gdy raport ich nie ma, pola po prostu nie
// występują w obiekcie (nie ustawiamy undefined) — eksport wtedy spada na
// dotychczasowy fallback.
function parseXtbOpenPositions(workbook) {
    const sheetName = workbook.SheetNames.find(n => /open positions/i.test(n));
    if (!sheetName) throw new Error('Nie znaleziono arkusza "Open Positions" w pliku.');
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });

    const headerIdx = rows.findIndex(r => r.includes("Ticker") && r.includes("Volume") && r.includes("Type"));
    if (headerIdx === -1) throw new Error('Nie znaleziono nagłówka z kolumnami Ticker/Volume/Type w arkuszu "Open Positions".');
    const header = rows[headerIdx];
    const idxTicker = header.indexOf("Ticker");
    const idxVolume = header.indexOf("Volume");
    const idxType = header.indexOf("Type");
    const idxOpenPrice = findColIndex(header, [/open\s*price/i, /cena\s*otwarcia/i, /purchase\s*price/i]);
    const idxOpenTime = findColIndex(header, [/open\s*time/i, /czas\s*otwarcia/i, /data\s*otwarcia/i, /open\s*date/i]);

    const imported = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        const ticker = String(r[idxTicker] || "").trim();
        const type = String(r[idxType] || "").trim();
        const volume = parseFloat(r[idxVolume]);
        if (!ticker || type || !volume) continue; // pomijamy wiersze transakcji i puste

        const position = { ticker: ticker.split(".")[0].toUpperCase(), shares: volume };
        if (idxOpenPrice !== -1) {
            const openPrice = parseFloat(r[idxOpenPrice]);
            if (!isNaN(openPrice)) position.openPrice = openPrice;
        }
        if (idxOpenTime !== -1) {
            const openDate = xtbDateToIso(r[idxOpenTime]);
            if (openDate) position.openDate = openDate;
        }
        imported.push(position);
    }
    return imported;
}

function initXtbImport() {
    document.getElementById("xtbFile").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        const status = document.getElementById("importStatus");
        if (!file) return;
        try {
            const buf = await file.arrayBuffer();
            const workbook = XLSX.read(buf, { type: "array" });
            const imported = parseXtbOpenPositions(workbook);
            if (imported.length === 0) throw new Error("Nie znaleziono żadnych otwartych pozycji w raporcie.");

            const summary = imported.map(p => `${p.ticker}: ${fmtQty(p.shares)} szt.`).join("\n");
            const ok = confirm(`Zaimportować ${imported.length} pozycji z raportu XTB? To zastąpi obecną listę pozycji:\n\n${summary}`);
            if (!ok) { status.textContent = "Import anulowany."; return; }

            holdings = imported;
            saveHoldings(holdings);
            renderAll();
            status.textContent = `Zaimportowano ${imported.length} pozycji z raportu XTB.`;
            showToast(`Zaimportowano ${imported.length} pozycji z raportu XTB`, { type: "success" });
        } catch (err) {
            status.textContent = `Błąd importu: ${err.message}`;
            showToast(`Błąd importu XTB: ${err.message}`, { type: "error", duration: 5000 });
        } finally {
            e.target.value = "";
        }
    });
}

// ============================================================
// EKSPORT DO TRADINGVIEW PORTFOLIO — zapisuje obecne pozycje jako CSV w
// formacie importu transakcji TradingView (Symbol,Side,Qty,Fill Price,
// Commission,Closing Time). Gdy pozycja pochodzi z importu XTB i raport
// zawierał kolumny ceny/daty otwarcia (patrz parseXtbOpenPositions wyżej),
// używamy ich — każda pozycja dostaje wtedy swoją prawdziwą datę/cenę
// zakupu zamiast dzisiejszej. Dla pozycji bez tych danych (ręcznie dodane,
// albo starszy import z raportu bez tych kolumn) spadamy na fallback:
// pojedynczy zakup "dziś" po obecnej cenie rynkowej, żeby chociaż odtworzyć
// w TV portfolio Twój bieżący stan posiadania bez fikcyjnego P&L.

// WIG20/mWIG40 są notowane na GPW w TradingView (prefiks "GPW:", tak jak
// tvSymbolFor w app.js) — reszta domyślnie na NASDAQ. Dla spółek z DOWJONES
// notowanych faktycznie na NYSE prefiks może być niepoprawny; kreator
// importu transakcji w TradingView pozwala wtedy ręcznie dopasować symbol.
function tvSymbolFor(ticker) {
    return currencyOf(ticker) === "PLN" ? `GPW:${ticker}` : `NASDAQ:${ticker}`;
}

function csvEscape(v) {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildTvPortfolioCsv() {
    const header = ["Symbol", "Side", "Qty", "Fill Price", "Commission", "Closing Time"];
    const todayIso = new Date().toISOString().slice(0, 10);
    const rows = holdings
        .filter(h => h.ticker && h.shares)
        .map(h => {
            const price = h.openPrice ?? priceMap[h.ticker]?.price;
            const closingTime = `${h.openDate || todayIso} 0:00:00`;
            return [tvSymbolFor(h.ticker), "Buy", h.shares, price ?? "", "0", closingTime];
        });
    return [header, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
}

function exportTvPortfolioCsv() {
    const csv = buildTvPortfolioCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tv_portfolio_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function initTvExport() {
    const btn = document.getElementById("exportTvBtn");
    const status = document.getElementById("importStatus");
    btn.addEventListener("click", () => {
        if (holdings.filter(h => h.ticker && h.shares).length === 0) {
            status.textContent = "Brak pozycji do wyeksportowania.";
            return;
        }
        exportTvPortfolioCsv();
        status.textContent = "Wyeksportowano pozycje do pliku CSV (format TradingView Portfolio).";
    });
}

function renderCapitalHint() {
    const moneyFmt = currentMoneyFmt();
    const current = holdingsValue();
    const contribution = settings.contribution || 0;
    let text = `Masz teraz ${moneyFmt(current)} w akcjach + dopłata ${moneyFmt(contribution)} = kapitał docelowy ${moneyFmt(current + contribution)}`;
    const excludedVal = excludedValue();
    if (excludedVal > 0) {
        text += ` (z czego ${moneyFmt(excludedVal)} w wykluczonych pozycjach — nie bierze udziału w rebalansie)`;
    }
    const hint = document.getElementById("capitalHint");
    if (hint) hint.textContent = text;
}

// Krótki, informacyjny odczyt dzisiejszego podziału core/satelita + który
// indeks (jeśli którykolwiek) faworyzuje satelita — patrz CORE_ALLOCATION_PCT/
// selectCoreSatelliteRows/satelliteWinnerUniverse wyżej dla pełnego
// mechanizmu. Wołane z refreshOutputs, więc odświeża się przy każdej zmianie
// ustawień/wykluczeń/filtra etapu, dokładnie jak reszta sugestii.
function renderCoreSatelliteNote() {
    const el = document.getElementById("coreSatelliteHint");
    if (!el) return;
    const n = settings.portfolioSize || 0;
    const { coreRows, satelliteRows } = selectCoreSatelliteRows(n);
    const winnerUniverse = satelliteWinnerUniverse();
    let text = `Core: ${coreRows.length} spółek (${(CORE_ALLOCATION_PCT * 100).toFixed(0)}% kapitału, blue chipy Dow/SP500 w fazie wzrostowej) `
        + `· Satelita: ${satelliteRows.length} spółek (${((1 - CORE_ALLOCATION_PCT) * 100).toFixed(0)}% kapitału, dynamiczny wzrost)`;
    if (winnerUniverse) {
        const ret = gemIndexReturns[winnerUniverse];
        text += ` — satelita faworyzuje ${REBALANCE_UNIVERSE_LABELS[winnerUniverse]} (12M: ${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%)`;
    }
    el.textContent = text;
}

// ============================================================
// SUGESTIA REBALANSU (to tylko sugestia — Ty decydujesz co i kiedy kupić/sprzedać)
// ============================================================
// Zwraca { targets: {ticker: {...}} } dla automatycznie wybranego core+satelity
// (patrz selectCoreSatelliteRows/CORE_ALLOCATION_PCT) — KAPITAŁ jest dzielony
// TWARDO 60/40 między obie grupy (coreCapital/satelliteCapital), a WEWNĄTRZ
// każdej grupy wagi liczone są tą samą metodą co przed core/satelitą: surowa
// waga = momentum_score, znormalizowany do 100% kapitału danej grupy — dalej
// świadome uproszczenie względem cap-ważenia z pipeline'u (9%/3x cap-weight,
// patrz compute_weights). Satelita dodatkowo mnoży surową wagę spółek
// należących (prawdziwe członkostwo, nie post-deduplikacyjny `row.universe`)
// do aktualnie zwycięskiego w GEM uniwersum przez WINNER_INDEX_WEIGHT_MULTIPLIER
// (patrz ten mechanizm i satelliteWinnerUniverse wyżej). Jeśli core albo
// satelita wyszły puste, cały kapitał (100%) idzie do tej drugiej, wypełnionej
// grupy, żeby żaden kapitał nie "zniknął" tylko dlatego że jedna grupa nie ma
// dziś żadnych kandydatów.
function computeAutoTargets(n, totalCapital) {
    const { coreRows, satelliteRows } = selectCoreSatelliteRows(n);
    const winnerUniverse = satelliteWinnerUniverse();
    const winnerTickers = winnerUniverse ? trueUniverseTickerSet(winnerUniverse) : new Set();

    let coreCapital = totalCapital * CORE_ALLOCATION_PCT;
    let satelliteCapital = totalCapital - coreCapital;
    if (coreRows.length === 0) { satelliteCapital = totalCapital; coreCapital = 0; }
    else if (satelliteRows.length === 0) { coreCapital = totalCapital; satelliteCapital = 0; }

    const raw = {};
    const addSleeve = (rows, sleeveCapital, sleeveName, weightFn) => {
        const weighted = rows.map(c => ({ c, w: weightFn(c) }));
        const totalW = weighted.reduce((s, { w }) => s + w, 0);
        weighted.forEach(({ c, w }) => {
            raw[c.ticker] = {
                ticker: c.ticker, universes: [c.universe], price: c.price,
                target_value: (totalW > 0 && sleeveCapital > 0) ? sleeveCapital * (w / totalW) : 0,
                raw_weight: w, momentum_pct: c.momentum_pct, volatility_pct: c.volatility_pct,
                sleeve: sleeveName,
            };
        });
    };

    addSleeve(coreRows, coreCapital, "core", c => c.momentum_score || 0);
    addSleeve(satelliteRows, satelliteCapital, "satellite", c => (
        (c.momentum_score || 0) * (winnerTickers.has(c.ticker) ? WINNER_INDEX_WEIGHT_MULTIPLIER : 1)
    ));

    return { targets: raw };
}

// Odtwarza, jaki % `targets`-owego kapitału pochodzi z KAŻDEGO uniwersum —
// używane wyłącznie do zblendowania krzywej "Wynik historyczny"
// (blendEquityCurves, patrz niżej) proporcjonalnie do tego, ile portfel dziś
// faktycznie waży w danym uniwersum (zwykle 1-3 uniwersa naraz, w zależności
// od tego, skąd trafiło dzisiejsze TOP N).
function deriveUniverseFractionsFromTargets(targets) {
    const sums = {};
    Object.values(targets).forEach(t => {
        if (!t.target_value || !t.universes.length) return;
        const share = t.target_value / t.universes.length;
        t.universes.forEach(u => { sums[u] = (sums[u] || 0) + share; });
    });
    return sums;
}

// Normalizuje dowolną mapę dodatnich "wag" (tu: surowe kwoty kapitału z
// deriveUniverseFractionsFromTargets) do ułamków sumujących się do 1,
// pomijając wpisy <= 0. Skala wejścia jest bez znaczenia (normalizeWeights
// sam ją usuwa).
function normalizeWeights(weights) {
    const entries = REBALANCE_UNIVERSES
        .map(u => [u, Math.max(0, Number(weights?.[u]) || 0)])
        .filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) return {};
    const out = {};
    entries.forEach(([u, w]) => { out[u] = w / total; });
    return out;
}

// Blenduje krzywe equity_curve.json kilku uniwersów wg podanych wag
// (znormalizowanych przez normalizeWeights) — MOŻLIWE bez żadnej konwersji
// walut, bo każda krzywa jest już znormalizowana do bazy 100 (patrz
// run_query.py::compute_equity_curve), więc uśrednianie wg wagi procentowej
// to czysta matematyka indeksów. Blenduje tylko po datach WSPÓLNYCH dla
// wszystkich ważonych krzywych — zwraca null gdy brak ważonych uniwersów z
// danymi albo za mało wspólnych dat. Z jednym ważonym uniwersum (typowy
// przypadek) to zwyczajnie jego własna, niezmieniona krzywa.
function blendEquityCurves(weights) {
    const fractions = normalizeWeights(weights);
    const entries = Object.entries(fractions).filter(([u]) => {
        const c = equityCurveData[u];
        return c && Array.isArray(c.dates) && c.dates.length >= 2;
    });
    if (entries.length === 0) return null;

    const totalFraction = entries.reduce((s, [, f]) => s + f, 0);
    const dateSets = entries.map(([u]) => new Set(equityCurveData[u].dates));
    const commonDates = equityCurveData[entries[0][0]].dates.filter(d => dateSets.every(s => s.has(d)));
    if (commonDates.length < 2) return null;

    const blendSeries = (field) => commonDates.map(date => (
        entries.reduce((sum, [u, f]) => {
            const idx = equityCurveData[u].dates.indexOf(date);
            return sum + (f / totalFraction) * equityCurveData[u][field][idx];
        }, 0)
    ));

    return { dates: commonDates, momentum_index: blendSeries("momentum_index"), benchmark_index: blendSeries("benchmark_index") };
}

function renderSuggestions() {
    const moneyFmt = currentMoneyFmt();
    const totalCapital = targetCapital();
    const excludedVal = excludedValue();
    const investableCapital = Math.max(0, totalCapital - excludedVal);
    const n = settings.portfolioSize || 0;
    const { targets } = computeAutoTargets(n, investableCapital);
    const threshold = Math.max(investableCapital * TRADE_THRESHOLD_PCT, 5);

    const shares = holdingShares();
    // Trzy różne zbiory tickerów do rozróżnienia POWODU, dla którego trzymana
    // pozycja nie jest w dzisiejszym TOP N (patrz notatka niżej): cały pool
    // (SP500/Nasdaq100/DowJones razem, bez filtra etapu) vs. eligiblePoolRows()
    // (to samo, ale PO filtrze etapu — patrz poolStageFilter/eligiblePoolRows
    // powyżej: to realnie ta pula, z której dziś wybiera silnik).
    const poolTickers = new Set(combinedPoolRows().map(c => c.ticker));
    const eligibleTickers = new Set(eligiblePoolRows().map(c => c.ticker));
    const stageFilterLabel = poolStageFilterLabel();

    const rows = [];
    Object.values(targets).forEach(t => {
        const heldShares = shares[t.ticker] || 0;
        const currentValue = t.price ? t.price * heldShares : 0;
        const sleeveLabel = t.sleeve === "core" ? "Core" : "Satelita";
        const note = `${sleeveLabel} · ${t.universes.map(u => REBALANCE_UNIVERSE_LABELS[u]).join(" + ")}`;
        rows.push({
            ticker: t.ticker,
            note,
            target_value: t.target_value,
            weight_pct: investableCapital ? (t.target_value / investableCapital * 100) : 0,
            current_value: currentValue,
            diff: t.target_value - currentValue,
            price: t.price,
            shares_held: heldShares,
        });
    });

    // Pozycje, które trzymasz, ale nie są (już) w dzisiejszym automatycznym
    // TOP N — cztery możliwe powody, sprawdzane w tej kolejności: wykluczone
    // ręcznie; w puli i pasuje do filtra etapu, ale ranking spadł poza TOP N;
    // w puli, ale filtr etapu (jeśli aktywny) ją odrzuca; albo w ogóle spoza
    // puli rebalansera (np. stara pozycja z WIG20/mWIG40).
    Object.keys(shares).forEach(ticker => {
        if (targets[ticker]) return;
        const price = priceMap[ticker]?.price;
        const currentValue = price ? price * shares[ticker] : null;
        if (excluded.includes(ticker)) {
            rows.push({
                ticker, note: "wykluczone ręcznie", target_value: 0, weight_pct: 0,
                current_value: currentValue, diff: null, excludedRow: true,
                price, shares_held: shares[ticker],
            });
            return;
        }
        let note;
        if (eligibleTickers.has(ticker)) {
            note = `poza TOP ${n}`;
        } else if (poolTickers.has(ticker)) {
            note = `poza filtrem etapu (${stageFilterLabel})`;
        } else {
            note = "poza pulą rebalansera (SP500 / Nasdaq 100 / Dow Jones)";
        }
        rows.push({
            ticker, note, target_value: 0, weight_pct: 0,
            current_value: currentValue, diff: currentValue !== null ? -currentValue : null, dropped: true,
            price, shares_held: shares[ticker],
        });
    });

    rows.sort((a, b) => b.target_value - a.target_value);

    const tbody = document.getElementById("rebalanceBody");
    tbody.innerHTML = "";
    document.getElementById("rebalanceEmpty").style.display = (investableCapital <= 0 || rows.length === 0) ? "block" : "none";

    rows.forEach(r => {
        let actionHtml;
        if (r.excludedRow) {
            actionHtml = `<span class="action-badge excluded">WYKLUCZONE — bez zmian</span>`;
        } else if (r.diff === null) {
            actionHtml = `<span class="action-badge unknown">brak ceny — sprawdź ręcznie</span>`;
        } else if (r.dropped) {
            actionHtml = `<span class="action-badge sell">SPRZEDAJ CAŁOŚĆ: ${fmtQty(r.shares_held)} szt. (~${moneyFmt(r.current_value)})</span>`;
        } else if (r.diff > threshold) {
            actionHtml = `<span class="action-badge buy">KUP ${sharesSuggestion(r.diff, r.price, moneyFmt)}</span>`;
        } else if (r.diff < -threshold) {
            actionHtml = `<span class="action-badge sell">SPRZEDAJ ${sharesSuggestion(-r.diff, r.price, moneyFmt)}</span>`;
        } else if (r.current_value > 0) {
            actionHtml = `<span class="action-badge hold">TRZYMAJ</span>`;
        } else {
            actionHtml = `<span class="action-badge skip">POMIŃ (za mała kwota)</span>`;
        }
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="ticker-cell">${r.ticker}</td>
            <td>${r.note}</td>
            <td>${r.weight_pct.toFixed(2)}%</td>
            <td>${moneyFmt(r.target_value)}</td>
            <td>${r.current_value !== null ? moneyFmt(r.current_value) : "—"}</td>
            <td>${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById("statCurrentValue").textContent = moneyFmt(holdingsValue());
    document.getElementById("statTargetValue").textContent = moneyFmt(totalCapital);
    document.getElementById("statHoldingsCount").textContent = Object.keys(targets).length;

    const refDates = poolRefDateNote();
    document.getElementById("refDateNote").textContent = refDates ? `(wg rebalansów z ${refDates})` : "";

    renderCapitalHint();
    renderMonteCarlo();
    renderPortfolioAnalysisChart();
}

// ============================================================
// ANALIZA PORTFELA — donut wykres podziału OBECNYCH pozycji (nie sugestii
// docelowej) wg wartości, tak żeby na pierwszy rzut oka było widać, co
// faktycznie waży najwięcej w portfelu. Miesza USD/PLN wartościowo bez
// przewalutowania (to tylko wizualny podział wg surowej wartości liczbowej w
// natywnej walucie każdej pozycji) — pozycje bez znanej ceny są pomijane.
// ============================================================
let portfolioAnalysisChart = null;

function renderPortfolioAnalysisChart() {
    const canvas = document.getElementById("portfolioAnalysisChart");
    if (portfolioAnalysisChart) { portfolioAnalysisChart.destroy(); portfolioAnalysisChart = null; }
    if (!canvas) return;

    const moneyFmt = holdingsMoneyFmt();
    const shares = holdingShares();
    const rows = Object.entries(shares)
        .map(([ticker, qty]) => ({ ticker, value: (priceMap[ticker]?.price || 0) * qty }))
        .filter(r => r.value > 0)
        .sort((a, b) => b.value - a.value);

    const total = rows.reduce((s, r) => s + r.value, 0);
    document.getElementById("portfolioAnalysisEmpty").style.display = rows.length === 0 ? "block" : "none";
    if (rows.length === 0 || total <= 0) return;

    const shades = ["#2ecc71", "#26a65b", "#1f8b4d", "#3fd98a", "#17693b", "#5be8a4", "#0f4d2c", "#7bf0bb", "#0a3a20", "#9df5cf"];
    portfolioAnalysisChart = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: rows.map(r => r.ticker),
            datasets: [{ data: rows.map(r => r.value), backgroundColor: rows.map((_, i) => shades[i % shades.length]), borderColor: "#14161c", borderWidth: 2 }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "right", labels: { color: "#8a8f9c", boxWidth: 10, font: { size: 10 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${moneyFmt(ctx.parsed)} (${(ctx.parsed / total * 100).toFixed(1)}%)` } },
            },
        },
    });
}

// ============================================================
// WYNIK HISTORYCZNY PORTFOLIA — equity curve (docs/data/equity_curve.json,
// patrz run_query.py::compute_equity_curve, zbudowane z realnych zapisów
// portfolio_history), zblendowana wg tego, ile portfel dziś faktycznie waży
// w każdym uniwersum (deriveUniverseFractionsFromTargets + blendEquityCurves)
// — z jednym uniwersum w TOP N to po prostu jego własna, niezmieniona
// krzywa; z kilkoma naraz (typowy przypadek — TOP N zwykle łączy nazwy z
// SP500/NASDAQ100/DOWJONES naraz) to ich zblendowana mieszanka, możliwa bez
// konwersji walut, bo obie krzywe są już znormalizowane do bazy 100. To NIE
// jest historia Twoich konkretnych pozycji (tych nie śledzimy wstecz) — to
// przybliżenie: "gdybyś trzymał/a kapitał w tej mieszance przez ten okres".
// ============================================================
let equityChart = null;

function renderEquityCurve() {
    const caption = document.getElementById("equityCurveCaption");
    const noteEl = document.getElementById("equityCurveNote");
    const investableCapital = Math.max(0, targetCapital() - excludedValue());
    const { targets } = computeAutoTargets(settings.portfolioSize || 0, investableCapital);
    const fractions = deriveUniverseFractionsFromTargets(targets);
    const curve = blendEquityCurves(fractions);

    if (equityChart) { equityChart.destroy(); equityChart = null; }

    if (!curve || !curve.dates || curve.dates.length < 2) {
        noteEl.textContent = "";
        caption.textContent = "Za mało zapisanej historii rebalansów, żeby pokazać wykres — rośnie z każdym cotygodniowym uruchomieniem pipeline'u, albo ustaw liczbę spółek w portfelu powyżej.";
        return;
    }

    noteEl.textContent = `${curve.dates[0]} → ${curve.dates[curve.dates.length - 1]}`;

    equityChart = new Chart(document.getElementById("equityCurveChart"), {
        type: "line",
        data: {
            labels: curve.dates,
            datasets: [
                { label: "Selekcja momentum", data: curve.momentum_index, borderColor: "#2ecc71", backgroundColor: "transparent", pointRadius: 0, borderWidth: 2 },
                { label: "Kup i trzymaj indeks", data: curve.benchmark_index, borderColor: "#8a8f9c", backgroundColor: "transparent", pointRadius: 0, borderWidth: 2, borderDash: [4, 3] },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { position: "bottom", labels: { color: "#8a8f9c", boxWidth: 12, font: { size: 10 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}` } },
            },
            scales: {
                x: { ticks: { color: "#8a8f9c", maxTicksLimit: 8 }, grid: { color: "#262a35" } },
                y: { ticks: { color: "#8a8f9c" }, grid: { color: "#262a35" } },
            },
        },
    });

    const activeLabels = Object.keys(deriveUniverseFractionsFromTargets(targets)).map(u => REBALANCE_UNIVERSE_LABELS[u]).join(", ") || "—";
    caption.textContent = `Wynik historyczny (zrealizowany) automatycznie dobranego portfela (${activeLabels}), ważony dokładnie tak, `
        + "jak dziś waży się Twoja alokacja, vs. 'kup i trzymaj' te same indeksy w tych samych proporcjach. Krzywe każdego indeksu są już "
        + "znormalizowane do bazy 100, więc blendowanie wg wagi nie wymaga przewalutowania. To NIE jest historia konkretnie Twoich pozycji "
        + "(tych nie śledzimy wstecz), tylko przybliżenie na bazie zapisanych rebalansów. Dane informacyjne, NIE prognoza ani porada "
        + "inwestycyjna — wyniki z przeszłości nie gwarantują przyszłych zwrotów.";
}

// ============================================================
// MONTE CARLO — statystyczny rozrzut możliwych wartości portfela, NIE
// prognoza. mu/sigma to ważona średnia (wagą = target_value) 12M momentum i
// rocznej zmienności obecnie wybranych spółek — uproszczenie ignorujące
// korelacje między nimi (zwykle zawyża pokazaną zmienność, więc pasmo jest
// raczej szersze niż węższe).
// ============================================================
let mcChart = null;

// Surowe trailing 12M momentum bywa ekstremalne (np. spółka po skoku o
// kilkaset %) i wprost jako roczny "oczekiwany zwrot" byłoby wprowadzające
// w błąd, nawet z zastrzeżeniem w opisie — dlatego ograniczamy je do ±30%/rok
// (szeroki, ale niewybuchowy przedział), zanim wejdzie do symulacji.
const MC_MU_CAP = 0.30;

function weightedMuSigma(targets, totalCapital) {
    let mu = 0, sigma = 0;
    Object.values(targets).forEach(t => {
        const w = totalCapital > 0 ? t.target_value / totalCapital : 0;
        mu += w * (t.momentum_pct || 0) / 100;
        sigma += w * (t.volatility_pct || 0) / 100;
    });
    mu = Math.max(-MC_MU_CAP, Math.min(MC_MU_CAP, mu));
    return { mu, sigma };
}

function randNormal() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function simulateMonteCarlo(startValue, mu, sigma, horizonMonths, nPaths) {
    const dt = 1 / 12;
    const drift = (mu - 0.5 * sigma * sigma) * dt;
    const vol = sigma * Math.sqrt(dt);
    const paths = [];
    for (let p = 0; p < nPaths; p++) {
        let v = startValue;
        const path = [v];
        for (let m = 1; m <= horizonMonths; m++) {
            v *= Math.exp(drift + vol * randNormal());
            path.push(v);
        }
        paths.push(path);
    }
    const p10 = [], p50 = [], p90 = [];
    for (let m = 0; m <= horizonMonths; m++) {
        const vals = paths.map(p => p[m]).sort((a, b) => a - b);
        p10.push(vals[Math.floor(0.10 * (vals.length - 1))]);
        p50.push(vals[Math.floor(0.50 * (vals.length - 1))]);
        p90.push(vals[Math.floor(0.90 * (vals.length - 1))]);
    }
    return { p10, p50, p90 };
}

function renderMonteCarlo() {
    const moneyFmt = currentMoneyFmt();
    // Symulacja obejmuje tylko część aktywnie zarządzaną przez automatyczne
    // TOP N — wykluczone pozycje mają inną charakterystykę ryzyka/zwrotu,
    // więc nie da się ich uczciwie opisać tym samym mu/sigma.
    const investableCapital = Math.max(0, targetCapital() - excludedValue());
    const { targets } = computeAutoTargets(settings.portfolioSize || 0, investableCapital);
    const horizon = parseInt(document.getElementById("mcHorizon").value, 10) || 12;
    const caption = document.getElementById("mcCaption");

    if (investableCapital <= 0 || Object.keys(targets).length === 0) {
        if (mcChart) { mcChart.destroy(); mcChart = null; }
        caption.textContent = "Ustaw dopłatę / liczbę spółek w portfelu, żeby zobaczyć symulację.";
        return;
    }

    const { mu, sigma } = weightedMuSigma(targets, investableCapital);
    const { p10, p50, p90 } = simulateMonteCarlo(investableCapital, mu, sigma, horizon, 300);
    const labels = p50.map((_, i) => i === 0 ? "dziś" : `+${i} mies.`);

    if (mcChart) mcChart.destroy();
    mcChart = new Chart(document.getElementById("monteCarloChart"), {
        type: "line",
        data: {
            labels,
            datasets: [
                { label: "10. percentyl", data: p10, borderColor: "transparent", backgroundColor: "rgba(46,204,113,0.12)", pointRadius: 0 },
                { label: "90. percentyl", data: p90, borderColor: "transparent", backgroundColor: "rgba(46,204,113,0.12)", fill: "-1", pointRadius: 0 },
                { label: "Mediana", data: p50, borderColor: "#2ecc71", backgroundColor: "transparent", fill: false, pointRadius: 0, borderWidth: 2 },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${moneyFmt(ctx.parsed.y)}` } },
            },
            scales: {
                x: { ticks: { color: "#8a8f9c", maxTicksLimit: 8 }, grid: { color: "#262a35" } },
                y: { ticks: { color: "#8a8f9c", callback: moneyFmt }, grid: { color: "#262a35" } },
            },
        },
    });

    caption.textContent = `Symulacja obejmuje kapitał zarządzany przez automatyczne TOP N: ${moneyFmt(investableCapital)}. `
        + `Założenia: oczekiwany zwrot ${(mu * 100).toFixed(1)}%/rok `
        + `(śr. ważona 12M momentum wybranych spółek, ograniczona do ±${MC_MU_CAP * 100}%/rok żeby uniknąć ekstrapolacji `
        + `chwilowych skoków), zmienność ${(sigma * 100).toFixed(1)}%/rok (śr. ważona zmienności rocznej), 300 symulowanych `
        + `ścieżek. Pasmo = zakres 10.–90. percentyla. To NIE jest prognoza ani porada inwestycyjna — pokazuje statystyczny `
        + `rozrzut przy założeniu, że przeszła zmienność i momentum się utrzymają, co nie jest gwarantowane.`;
}

function initSettingsForm() {
    document.getElementById("contribution").value = settings.contribution || "";
    document.getElementById("portfolioSize").value = settings.portfolioSize || "";
    const onChange = () => {
        settings.contribution = parseFloat(document.getElementById("contribution").value) || 0;
        settings.portfolioSize = parseInt(document.getElementById("portfolioSize").value, 10) || 0;
        saveSettings(settings);
        renderPoolTable();
        refreshOutputs();
    };
    document.getElementById("contribution").addEventListener("input", onChange);
    document.getElementById("portfolioSize").addEventListener("input", onChange);
}

// Odświeża sugestię + Monte Carlo + analizę portfela + wykres historyczny
// (renderSuggestions woła te pierwsze trzy) + odczyt core/satelity — wołane
// po każdej zmianie ustawień/holdingów/wykluczeń.
function refreshOutputs() {
    renderSuggestions();
    renderEquityCurve();
    renderCoreSatelliteNote();
}

function renderAll() {
    renderHoldingsTable();
    refreshOutputs();
}

// typeof document check: pozwala wczytać ten plik przez `require()` w testach
// Node (patrz tests/js/) bez uruchamiania inicjalizacji strony — w przeglądarce
// document zawsze istnieje, więc zachowanie się nie zmienia.
if (typeof document !== "undefined") {
    (async function init() {
        initConnStatus();
        await Promise.all([loadUniverseData(), loadGemReturns()]);
        initSettingsForm();
        initHoldingsForm();
        initXtbImport();
        initTvExport();
        initExcludeForm();
        renderExcludedList();
        initPoolSort();
        initPoolStageFilter();
        initPoolToggle();
        updatePoolSortHeaderClasses();
        document.getElementById("mcHorizon").addEventListener("change", () => renderMonteCarlo());
        renderPoolTable();
        renderAll();
        hideLoadingOverlay();
    })();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
}

// Eksport wyłącznie dla test runnera Node (tests/js/) — nie ładowany
// i bez efektu w przeglądarce (module tam nie istnieje).
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        REBALANCE_UNIVERSES, REBALANCE_UNIVERSE_LABELS, PLN_UNIVERSES,
        CORE_ALLOCATION_PCT, WINNER_INDEX_WEIGHT_MULTIPLIER,
        fmtMoney, fmtMoneyPln, currentMoneyFmt, holdingsMoneyFmt, moneyFmtForCurrency, fmtQty, sharesSuggestion,
        currencyOf, combinedPoolRows, eligiblePoolRows, autoSelectedRows, selectCoreSatelliteRows,
        computeAutoTargets, matchesPoolStageFilter, satelliteWinnerUniverse,
        loadPoolStageFilter, savePoolStageFilter,
        deriveUniverseFractionsFromTargets, normalizeWeights, blendEquityCurves, parseXtbOpenPositions,
        weightedMuSigma, simulateMonteCarlo, randNormal,
        tvSymbolFor, buildTvPortfolioCsv, xtbDateToIso,
        // Testy potrzebują ustawić moduł-poziomu stan (universeData/settings/excluded/
        // holdings/priceMap/equityCurveData/gemIndexReturns) bez importu przez window —
        // to jedyny sposób bez przepisywania modułu na klasę.
        _setState(s) {
            if (s.universeData !== undefined) universeData = s.universeData;
            if (s.settings !== undefined) settings = s.settings;
            if (s.excluded !== undefined) excluded = s.excluded;
            if (s.holdings !== undefined) holdings = s.holdings;
            if (s.priceMap !== undefined) priceMap = s.priceMap;
            if (s.equityCurveData !== undefined) equityCurveData = s.equityCurveData;
            if (s.poolStageFilter !== undefined) poolStageFilter = s.poolStageFilter;
            if (s.gemIndexReturns !== undefined) gemIndexReturns = s.gemIndexReturns;
        },
    };
}
