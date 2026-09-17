
const UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES", "WIG20", "MWIG40"];
const UNIVERSE_LABELS = {
    SP500: "S&P 500", NASDAQ100: "Nasdaq 100", DOWJONES: "Dow Jones", WIG20: "WIG20", MWIG40: "mWIG40",
};
// WIG20/mWIG40 są notowane w PLN — patrz moneyFmtForUniverse/currencyOf/tvSymbolFor.
const PLN_UNIVERSES = new Set(["WIG20", "MWIG40"]);
const TRADE_THRESHOLD_PCT = 0.005; // pomijamy sugestie mniejsze niż 0.5% kapitału docelowego

// Rebalanser to teraz przepływ ETAPOWY, zbudowany tak, żeby dało się go
// obsłużyć w ~1h/tydzień: KROK 1 — przeglądasz ranking Global Equity Momentum
// (gemData/renderGemWidget) i wybierasz, KTÓREGO z 5 uniwersów (SP500/
// NASDAQ100/DOWJONES/WIG20/MWIG40) spółki chcesz teraz przejrzeć
// (settings.browsingUniverse) — zwycięzca GEM jest tylko podpowiedzią
// (podświetlony 🏆, wybrany domyślnie), można kliknąć dowolny inny wiersz.
// KROK 2 — ten uniwersum ląduje jako pełna, sortowalna, filtrowalna po etapie
// Weinsteina tabela (dokładnie ta sama tabela co na dashboardzie, patrz
// renderPickerTable/pickerRowHtml), a Ty sam RĘCZNIE wybierasz spółki do
// portfela przyciskiem "+ Dodaj" (togglePick) — nie ma już automatycznego
// TOP N. Wybrane spółki (picks, patrz loadPicks/savePicks) KUMULUJĄ SIĘ w
// localStorage niezależnie od tego, które uniwersum jest akurat przeglądane —
// portfel buduje się miesiąc po miesiącu: raz dodana spółka zostaje, dopóki
// jej ręcznie nie usuniesz (renderPicksList), nawet jeśli w kolejnym miesiącu
// przeglądasz inny, akurat wygrywający w GEM uniwersum. Wagi w portfelu
// (computeTargetsFromPicks) liczą się z AKTUALNEGO momentum_score każdej
// wybranej spółki (przeliczanego przez pipeline co tydzień), więc portfel się
// nie "zamraża" — siła każdej pozycji w alokacji odświeża się razem z resztą
// dashboardu. Holdingi (ticker + liczba akcji) i lista wykluczeń pozostają,
// jak dawniej, WSPÓLNE i niezależne od picks/przeglądanego uniwersum.
const SETTINGS_KEY = "momentum_rebalance_settings";
const HOLDINGS_KEY = "momentum_rebalance_holdings";
const EXCLUDED_KEY = "momentum_rebalance_excluded";
const PICKS_KEY = "momentum_rebalance_picks";
const GEM_MANUAL_KEY = "momentum_rebalance_gem_manual";

const DEFAULT_SETTINGS = { contribution: 0, browsingUniverse: null };
// Te dwa uniwersa nie mają realnego, kapitalizacyjnego zwrotu poziomu indeksu
// z zewnętrznego źródła (yfinance nie ma historii dla WIG20.WA/MWIG40.WA,
// a stooq.pl zablokował automatyczne pobieranie od 2026 — patrz CLAUDE.md) —
// jedyne dwa, dla których pole ręcznego zwrotu w widgecie GEM ma sens.
// Musi się zgadzać z run_query.py::GEM_MANUAL_OVERRIDE_UNIVERSES.
const GEM_MANUAL_OVERRIDE_UNIVERSES = ["WIG20", "MWIG40"];

// Klasyfikacja etapow Weinsteina — ta sama STAGE_LABELS/STAGE_COLORS co w
// app.js (celowo zduplikowana: strona nie ma wspolnego modulu miedzy
// index.html/rebalance.html, tak samo jak STAGE_BREAKOUT_VOLUME_RATIO jest
// juz zduplikowane wzgledem run_query.py — patrz CLAUDE.md). Tylko do
// wyswietlania w kolumnie "Etap" tabeli z Kroku 2 (patrz pickerRowHtml).
const STAGE_LABELS = {
    "1": "Etap 1 — Baza",
    "2A": "Etap 2A — Świeże wybicie",
    "2B": "Etap 2B — Kontynuacja trendu",
    "3": "Etap 3 — Szczyt / dystrybucja",
    "4": "Etap 4 — Spadek",
};
const STAGE_COLORS = { "1": "#8a8f9c", "2A": "#2ecc71", "2B": "#26a65b", "3": "#e0a72e", "4": "#e0455a" };

function stageCellHtml(stage) {
    if (!stage || !STAGE_LABELS[stage]) return '<span class="stage-cell" style="color:var(--text-faint)">—</span>';
    return `<span class="stage-cell" style="color:${STAGE_COLORS[stage]}" title="${STAGE_LABELS[stage]}">`
        + `<span class="stage-dot" style="background:${STAGE_COLORS[stage]}"></span>${stage}</span>`;
}

let universeData = {};    // { SP500: {...json}, NASDAQ100: {...}, ... }
let priceMap = {};        // ticker -> { price, sources: [universe,...] }
let equityCurveData = {}; // { NASDAQ100: {dates, momentum_index, benchmark_index, ...}, ... }
let gemData = { ref_date: null, indices: [], winner: null, leaders: [] };
// Kopia gemData.indices TAK JAK PRZYSZŁA z global_equity_momentum.json, przed
// zastosowaniem lokalnego (localStorage) nadpisania z widgetu GEM — potrzebna,
// żeby "wyczyść" mogło wrócić do wartości z pipeline'u, i żeby powtórne
// applyManualGemOverrides() (np. po zapisaniu nowej wartości) nie nadpisywało
// już-nadpisanych danych. Patrz applyManualGemOverrides.
let gemPristineIndices = [];

function loadSettings() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { stored = {}; }
    return { ...DEFAULT_SETTINGS, ...stored };
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

// Ręczne nadpisanie zwrotu 12M dla WIG20/mWIG40 w wyścigu GEM — TYLKO w tej
// przeglądarce (localStorage, tak jak holdingi/wykluczenia/picks), bo
// rebalance.html jest stroną statyczną (GitHub Pages, bez backendu) i nie ma
// sposobu, żeby stąd zapisać coś do repo/pipeline'u. To jest odpowiednik po
// stronie klienta tego, co run_query.py::_load_gem_manual_returns robi po
// stronie pipeline'u z gem_manual_returns.json — niezależny mechanizm, nie
// zapisuje do tego pliku i nie jest przez niego czytany. Patrz
// applyManualGemOverrides/renderGemWidget.
function loadManualGemReturns() {
    try { return JSON.parse(localStorage.getItem(GEM_MANUAL_KEY)) || {}; } catch (e) { return {}; }
}
function saveManualGemReturns(overrides) { localStorage.setItem(GEM_MANUAL_KEY, JSON.stringify(overrides)); }

// Nakłada lokalnie zapisane nadpisania (loadManualGemReturns) na gemPristineIndices
// (dane TAK JAK je zwrócił pipeline) — zastępuje return_pct, oznacza wpis flagą
// manual_entry (ten sam klucz co po stronie backendu, patrz run_query.py — więc
// UI-owy label "(ręcznie)" w renderGemWidget działa identycznie niezależnie od
// tego, czy wartość jest ręczna z pipeline'u czy z tej przeglądarki), po czym
// na nowo sortuje malejąco po return_pct i wyznacza winnera z TYCH wartości —
// więc ręcznie wpisany zwrot realnie decyduje, który uniwersum wygrywa wyścig,
// tak jak po stronie backendu. Wołane po każdym (re)wczytaniu gemData i po
// każdym zapisaniu/wyczyszczeniu wartości w widgecie.
function applyManualGemOverrides() {
    const overrides = loadManualGemReturns();
    const indices = gemPristineIndices.map(rec => {
        const copy = { ...rec };
        if (GEM_MANUAL_OVERRIDE_UNIVERSES.includes(copy.universe)) {
            const ov = overrides[copy.universe];
            if (ov && typeof ov.return_pct === "number" && !isNaN(ov.return_pct)) {
                copy.return_pct = ov.return_pct;
                copy.manual_entry = true;
            }
        }
        return copy;
    });
    indices.sort((a, b) => b.return_pct - a.return_pct);
    gemData.indices = indices;
    gemData.winner = indices.length ? indices[0].universe : null;
}

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

// ============================================================
// PICKS — spółki ręcznie wybrane do portfela w Kroku 2 (patrz
// renderPickerTable/togglePick). Jeden płaski, kumulujący się w czasie zapis
// { ticker, universe, added_date } w localStorage — universe zapamiętuje, z
// KTÓREGO uniwersum dana spółka została dodana (potrzebne do wyceny/momentum
// tej pozycji, patrz computeTargetsFromPicks), więc ta sama spółka teoretycznie
// może być dodana osobno z dwóch uniwersów naraz (np. duży large-cap obecny i
// w SP500, i w NASDAQ100) — computeTargetsFromPicks scala taki przypadek w
// jeden wiersz wyniku.
// ============================================================
function loadPicks() {
    try { return JSON.parse(localStorage.getItem(PICKS_KEY)) || []; } catch (e) { return []; }
}
function savePicks(p) { localStorage.setItem(PICKS_KEY, JSON.stringify(p)); }

function isPicked(ticker, universe) {
    return picks.some(p => p.ticker === ticker && p.universe === universe);
}

function togglePick(ticker, universe) {
    const idx = picks.findIndex(p => p.ticker === ticker && p.universe === universe);
    if (idx !== -1) {
        picks.splice(idx, 1);
    } else {
        picks.push({ ticker, universe, added_date: new Date().toISOString().slice(0, 10) });
    }
    savePicks(picks);
}

let settings = loadSettings();
let holdings = loadHoldings();
let excluded = loadExcluded();
let picks = loadPicks();

async function loadUniverseData() {
    for (const u of UNIVERSES) {
        try {
            const res = await fetch(`data/${u.toLowerCase()}.json`, { cache: "no-store" });
            universeData[u] = await res.json();
        } catch (e) {
            universeData[u] = { universe: u, ref_date: null, constituents: [], all_constituents: [] };
        }
    }

    // Ceny dla WSZYSTKICH spółek w indeksach (nie tylko wybranych do portfela
    // momentum) — żeby móc wycenić dowolną pozycję użytkownika, nawet jedną z
    // uniwersum, które akurat nie jest przeglądane w Kroku 1/2.
    priceMap = {};
    try {
        const res = await fetch("data/all_prices.json", { cache: "no-store" });
        const allPrices = await res.json();
        Object.entries(allPrices).forEach(([ticker, info]) => {
            priceMap[ticker] = { price: info.price, sources: info.universes };
        });
    } catch (e) { /* brak pliku — priceMap zostanie uzupełniony niżej z list momentum */ }

    for (const u of UNIVERSES) {
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

    try {
        const res = await fetch("data/global_equity_momentum.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        gemData = await res.json();
    } catch (e) {
        gemData = { ref_date: null, indices: [], winner: null, leaders: [] };
    }
    gemPristineIndices = (gemData.indices || []).map(rec => ({ ...rec }));
    applyManualGemOverrides();

    // Domyślne uniwersum przeglądane w Kroku 2 to zwycięzca GEM — tylko przy
    // pierwszym uruchomieniu / gdy zapisany wybór jest już nieprawidłowy
    // (stary zapis sprzed dodania/usunięcia uniwersum). Późniejsze kliknięcia
    // w Kroku 1 (renderGemWidget) nadpisują to niezależnie od tego, kto
    // akurat wygrywa w GEM.
    if (!settings.browsingUniverse || !UNIVERSES.includes(settings.browsingUniverse)) {
        settings.browsingUniverse = gemData.winner;
        saveSettings(settings);
    }
}

function fmtMoney(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMoneyPln(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}

// Formatter dla cen w tabeli Kroku 2 — w NATIVE walucie przeglądanego
// uniwersum (nie zależy od tego, co akurat jest w portfelu — to tylko
// wyświetlanie cen konkretnej listy spółek).
function moneyFmtForUniverse(universe) { return PLN_UNIVERSES.has(universe) ? fmtMoneyPln : fmtMoney; }

// Formatter faktycznie używany w sugestiach/statach/Monte Carlo/krzywej —
// wynika z tego, z JAKICH uniwersów pochodzą AKTUALNIE wybrane spółki (picks),
// nie z pojedynczego "zwycięzcy" czy z przeglądanego akurat uniwersum: skoro
// portfel kumuluje się miesiąc po miesiącu, może w danym momencie obejmować
// spółki z więcej niż jednego uniwersum naraz (np. wybrane w zeszłym miesiącu
// z NASDAQ100, w tym miesiącu z WIG20). Jeśli wszystkie są w PLN -> fmtMoneyPln,
// jeśli wszystkie poza PLN -> fmtMoney, a przy realnym miksie obu walut naraz
// spadamy na fmtMoney (USD) jako wspólny mianownik — ta sama, już wcześniej
// przyjęta w aplikacji uproszczona konwencja "miksuj surowe liczby bez
// przewalutowania" co holdingsValue()/donut portfela (patrz CLAUDE.md).
function currentMoneyFmt() {
    const activeUniverses = [...new Set(picks.map(p => p.universe))];
    if (activeUniverses.length === 0) return fmtMoney;
    if (activeUniverses.every(u => PLN_UNIVERSES.has(u))) return fmtMoneyPln;
    return fmtMoney;
}

// Formatter dla KONKRETNEGO tickera niezależnie od zawartości portfela —
// używany w tabeli holdingów, bo tam pozycje mogą być z różnych uniwersów/
// walut naraz (patrz currencyOf).
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

// Waluta danego tickera (do formatowania ceny/wartości w tabeli holdingów,
// niezależnie od zawartości portfela) — na podstawie tego, w jakim uniwersum
// go znaleziono (patrz priceMap/all_prices.json). Nieznany ticker (spoza
// śledzonych indeksów) domyślnie USD.
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
// systemem": nie liczy się do puli, którą alokujemy na wybrane spółki.
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
// sprzedać, nawet jeśli je importujesz z XTB albo dodasz do portfela w
// Kroku 2.
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
            renderPickerTable();
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
        renderPickerTable();
        refreshOutputs();
    };
    document.getElementById("excludeAddBtn").addEventListener("click", addTicker);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTicker(); } });
}

// ============================================================
// KROK 1 — GLOBAL EQUITY MOMENTUM: który indeks (SP500/NASDAQ100/DOWJONES/
// WIG20/mWIG40) ma teraz najsilniejszy trend 12-miesięczny, plus ranking
// pozostałych 4. To PODPOWIEDŹ, nie automatyczny wybór — kliknięcie
// dowolnego wiersza ustawia settings.browsingUniverse, czyli które uniwersum
// ląduje jako tabela w Kroku 2 poniżej (renderPickerTable). Zwycięzca zostaje
// wybrany domyślnie tylko przy pierwszym uruchomieniu (patrz
// loadUniverseData) — użytkownik może zawsze ręcznie przeglądać inny indeks,
// niezależnie od tego, kto akurat wygrywa w GEM.
// ============================================================
function renderGemWidget() {
    const el = document.getElementById("gemWidget");
    if (!el) return;
    if (!gemData.winner) {
        el.innerHTML = `<span class="text-faint">Brak danych — uruchom pipeline (fetch_data.py + run_query.py).</span>`;
        return;
    }
    const browsing = settings.browsingUniverse;
    // manual_entry: WIG20/MWIG40 moga miec return_pct recznie wpisany z gem_manual_returns.json
    // (patrz CLAUDE.md / run_query.py::_load_gem_manual_returns) LUB z pola nizej w tym widgecie
    // (applyManualGemOverrides, TYLKO ta przeglądarka) zamiast liczonego z syntetycznego indeksu —
    // "(ręcznie)" to zwykla transparentnosc pochodzenia danych, tak jak fmc_note gdzie indziej w
    // aplikacji, nie ostrzezenie. Nie rozróżniamy tu która z tych dwóch dróg to ustawiła — obie
    // znaczą to samo dla użytkownika ("to nie jest syntetyczny wskaźnik").
    const rows = (gemData.indices || []).map(i => `
        <div class="gem-index-row${i.universe === gemData.winner ? " gem-index-winner" : ""}${i.universe === browsing ? " gem-index-active" : ""}"
             data-universe="${i.universe}" role="button" tabindex="0"
             title="Kliknij, żeby przeglądać spółki tego indeksu w Kroku 2 poniżej">
            <span>${i.universe === gemData.winner ? "🏆 " : ""}${UNIVERSE_LABELS[i.universe]}${i.manual_entry ? ' <span class="text-faint">(ręcznie)</span>' : ""}${i.universe === browsing ? ' <span class="text-faint">(przeglądasz)</span>' : ""}</span>
            <span class="${i.return_pct >= 0 ? "positive" : "negative"}">${i.return_pct >= 0 ? "+" : ""}${i.return_pct.toFixed(2)}%</span>
        </div>
    `).join("");

    // Pola do wpisania zwrotu WIG20/mWIG40 sprawdzonego ręcznie (np. na stooq.pl) — TYLKO dla
    // uniwersów bez realnego zwrotu z automatycznego źródła (GEM_MANUAL_OVERRIDE_UNIVERSES;
    // SP500/NASDAQ100/DOWJONES mają realne dane z yfinance i nie potrzebują tego pola) i tylko
    // jeśli GEM w ogóle je liczy (są w gemData.indices). Zapisane WYŁĄCZNIE w localStorage tej
    // przeglądarki (patrz saveManualGemReturns) — strona jest statyczna, nie ma jak zapisać tego
    // do repo/gem_manual_returns.json stąd; działa od razu (applyManualGemOverrides), ale tylko na
    // tym urządzeniu, aż wpiszesz to samo gdzie indziej.
    const overrides = loadManualGemReturns();
    const manualFields = (gemData.indices || [])
        .filter(i => GEM_MANUAL_OVERRIDE_UNIVERSES.includes(i.universe))
        .map(i => {
            const ov = overrides[i.universe];
            const hasOverride = ov && typeof ov.return_pct === "number" && !isNaN(ov.return_pct);
            return `
                <div class="gem-manual-row">
                    <label for="gemManual_${i.universe}">${UNIVERSE_LABELS[i.universe]} zwrot 12M (%)</label>
                    <div class="gem-manual-input-group">
                        <input type="number" step="0.01" id="gemManual_${i.universe}" class="gem-manual-input"
                               data-universe="${i.universe}" placeholder="np. 44.84"
                               value="${hasOverride ? ov.return_pct : ""}">
                        <button type="button" class="gem-manual-save-btn add-row-btn" data-universe="${i.universe}">Zapisz</button>
                        ${hasOverride ? `<button type="button" class="gem-manual-clear-btn remove-row-btn" data-universe="${i.universe}" title="Usuń ręczną wartość, wróć do wskaźnika syntetycznego">✕</button>` : ""}
                    </div>
                </div>
            `;
        }).join("");

    const winnerReturn = (gemData.indices || []).find(i => i.universe === gemData.winner);
    const engineNote = `Zwycięzca (najsilniejszy trend ${gemData.lookback_months || 12}M): <strong>${UNIVERSE_LABELS[gemData.winner]}</strong>`
        + `${winnerReturn ? " " + (winnerReturn.return_pct >= 0 ? "+" : "") + winnerReturn.return_pct.toFixed(2) + "%" : ""}. `
        + `To tylko podpowiedź — kliknij dowolny wiersz poniżej, żeby przeglądać JEGO spółki w Kroku 2, `
        + `niezależnie od tego, kto akurat wygrywa w GEM.`;

    el.innerHTML = `
        <div class="sidebar-group-meta">${engineNote}</div>
        <div class="gem-index-returns">${rows}</div>
        <div class="gem-manual-fields">
            <div class="sidebar-group-meta">
                WIG20/mWIG40 nie mają realnego zwrotu z automatycznego źródła (patrz CLAUDE.md) —
                sprawdź sam na stooq.pl (Stopy zwrotu: 1 rok) i wpisz tu, tylko w tej przeglądarce.
            </div>
            ${manualFields}
        </div>
    `;

    el.querySelectorAll(".gem-index-row").forEach(row => {
        const selectRow = () => {
            settings.browsingUniverse = row.dataset.universe;
            saveSettings(settings);
            renderGemWidget();
            renderPickerTable();
        };
        row.addEventListener("click", selectRow);
        row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectRow(); } });
    });

    const applyAndRerender = () => {
        applyManualGemOverrides();
        renderGemWidget();
        refreshOutputs();
    };
    const saveFromInput = (universe) => {
        const input = document.getElementById(`gemManual_${universe}`);
        const value = parseFloat(input.value);
        if (isNaN(value)) return;
        const stored = loadManualGemReturns();
        stored[universe] = { return_pct: value, as_of: new Date().toISOString().slice(0, 10) };
        saveManualGemReturns(stored);
        applyAndRerender();
    };
    el.querySelectorAll(".gem-manual-save-btn").forEach(btn => {
        btn.addEventListener("click", () => saveFromInput(btn.dataset.universe));
    });
    el.querySelectorAll(".gem-manual-clear-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const stored = loadManualGemReturns();
            delete stored[btn.dataset.universe];
            saveManualGemReturns(stored);
            applyAndRerender();
        });
    });
    el.querySelectorAll(".gem-manual-input").forEach(input => {
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); saveFromInput(input.dataset.universe); }
        });
        input.addEventListener("click", (e) => e.stopPropagation());
    });
}

// ============================================================
// KROK 2 — tabela pełnego uniwersum przeglądanego w Kroku 1
// (settings.browsingUniverse), identyczna w duchu do pełnej tabeli momentum
// na dashboardzie (app.js::renderTable) — sortowalna po nagłówkach i
// filtrowalna po etapie Weinsteina — tylko z dodatkową kolumną akcji
// "+ Dodaj" / "✓ W portfelu" (togglePick) zamiast automatycznego TOP N.
// Czyta "all_constituents" (CAŁE kwalifikujące się uniwersum, nie tylko
// bieżącą selekcję kwintylową pipeline'u — patrz CLAUDE.md), więc można
// wybrać do portfela dowolną spółkę, nie tylko dzisiejszy top decyl.
// ============================================================
let pickerSortKey = "rank";
let pickerSortDir = "asc";
// Filtr etapow Kroku 2 — MULTI-SELECT (na zyczenie uzytkownika: "czasem chce
// spolki z stage 1 i stage 2"), nie pojedynczy wybor jak na dashboardzie
// (patrz state.stageFilter w app.js, ktory zostal pojedynczym wyborem celowo
// nie zmieniony — to zyczenie dotyczylo konkretnie tego ekranu). "ALL" to
// sentinel oznaczajacy brak filtra (wszystkie etapy, stan startowy); po
// pierwszym kliknieciu konkretnego etapu zamienia sie w Set zawierajacy
// zaznaczone kubelki ("1"/"2"/"3"/"4", gdzie "2" obejmuje zarowno 2A jak i
// 2B — patrz matchesPickerStageFilter). Kliknięcie "Wszystkie" zawsze wraca
// do sentinela "ALL".
let pickerStageFilter = "ALL";

function pickerRows() {
    const data = universeData[settings.browsingUniverse] || {};
    return data.all_constituents || data.constituents || [];
}

function matchesPickerStageFilter(stage) {
    if (pickerStageFilter === "ALL") return true;
    if (!stage) return false;
    const bucket = (stage === "2A" || stage === "2B") ? "2" : stage;
    return pickerStageFilter.has(bucket);
}

// Etykieta wybranych etapow do linijki meta nad tabela (np. "1, 2A/2B") —
// null gdy filtr jest w stanie "ALL" (brak etykiety, patrz renderPickerTable).
function pickerStageFilterLabel() {
    if (pickerStageFilter === "ALL") return null;
    const labels = { "1": "1", "2": "2A/2B", "3": "3", "4": "4" };
    return [...pickerStageFilter].map(s => labels[s]).join(", ");
}

// Komparator wierszy tabeli Kroku 2: sortowanie tekstowe bez uwzględniania
// wielkości liter, numeryczne dla reszty pól.
function comparePickerRows(a, b, sortKey, sortDir) {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (typeof va === "string") { va = va.toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
}

function pickerRowHtml(c, universe) {
    const stage = c.weekly_chart && c.weekly_chart.current_stage;
    const isExcluded = excluded.includes(c.ticker);
    const picked = isPicked(c.ticker, universe);
    const moneyFmt = moneyFmtForUniverse(universe);
    const actionHtml = isExcluded
        ? `<span class="action-badge excluded" title="Usuń wykluczenie w sekcji &quot;Wyklucz z rebalansu&quot;, żeby móc dodać do portfela">WYKLUCZONE</span>`
        : `<button class="action-badge ${picked ? "buy" : "skip"} pick-toggle-btn" data-ticker="${c.ticker}">${picked ? "✓ W portfelu" : "+ Dodaj"}</button>`;
    return `
        <td><span class="rank-badge">${c.rank}</span></td>
        <td class="ticker-cell">${c.ticker}</td>
        <td>${c.sector}</td>
        <td>${moneyFmt(c.price)}</td>
        <td class="${c.momentum_pct >= 0 ? "positive" : "negative"}">${c.momentum_pct.toFixed(2)}%</td>
        <td>${c.momentum_window}</td>
        <td>${c.volatility_pct.toFixed(2)}%</td>
        <td>${c.momentum_score.toFixed(3)}</td>
        <td>${stageCellHtml(stage)}</td>
        <td>${actionHtml}</td>
    `;
}

function updateSortHeaderClasses() {
    document.querySelectorAll("#pickerTable thead th").forEach(th => {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.dataset.key === pickerSortKey) {
            th.classList.add(pickerSortDir === "asc" ? "sort-asc" : "sort-desc");
        }
    });
}

function initPickerSort() {
    document.querySelectorAll("#pickerTable thead th").forEach(th => {
        th.addEventListener("click", () => {
            const key = th.dataset.key;
            if (!key) return; // kolumny bez sortowania (Etap, Portfel)
            if (pickerSortKey === key) {
                pickerSortDir = pickerSortDir === "asc" ? "desc" : "asc";
            } else {
                pickerSortKey = key;
                pickerSortDir = "asc";
            }
            updateSortHeaderClasses();
            renderPickerTable();
        });
    });
}

// Odswieza klasy .active na przyciskach filtra po kazdej zmianie
// pickerStageFilter — wiele przyciskow moze byc .active naraz (multi-select),
// stad brak "znajdz jeden i podswietl" jak przy zwyklym radio.
function updatePickerStageFilterButtons() {
    const bar = document.getElementById("pickerStageFilterBar");
    if (!bar) return;
    bar.querySelectorAll(".stage-filter-btn").forEach(b => {
        const stage = b.dataset.stage;
        const active = stage === "ALL"
            ? pickerStageFilter === "ALL"
            : (pickerStageFilter !== "ALL" && pickerStageFilter.has(stage));
        b.classList.toggle("active", active);
    });
}

function initPickerStageFilter() {
    const bar = document.getElementById("pickerStageFilterBar");
    if (!bar) return;
    bar.querySelectorAll(".stage-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const stage = btn.dataset.stage;
            if (stage === "ALL") {
                pickerStageFilter = "ALL";
            } else {
                // "ALL" -> pierwszy klik konkretnego etapu zaczyna nowy Set tylko z
                // nim; kolejne kliki togglują przynależność. Odznaczenie ostatniego
                // wybranego etapu wraca do "ALL" (pusty Set pokazywałby zero wierszy
                // bez żadnej wizualnej wskazówki dlaczego — "Wszystkie" i tak zawsze
                // resetuje jednym klikiem).
                const current = pickerStageFilter === "ALL" ? new Set() : new Set(pickerStageFilter);
                if (current.has(stage)) current.delete(stage); else current.add(stage);
                pickerStageFilter = current.size ? current : "ALL";
            }
            updatePickerStageFilterButtons();
            renderPickerTable();
        });
    });
}

function renderPickerTable() {
    const universe = settings.browsingUniverse;
    const titleEl = document.getElementById("pickerUniverseLabel");
    if (titleEl) titleEl.textContent = universe ? UNIVERSE_LABELS[universe] : "—";

    const allRows = pickerRows();
    let rows = allRows.filter(c => matchesPickerStageFilter(c.weekly_chart && c.weekly_chart.current_stage));
    rows.sort((a, b) => comparePickerRows(a, b, pickerSortKey, pickerSortDir));

    const meta = document.getElementById("pickerMeta");
    const data = universeData[universe] || {};
    const filterLabel = pickerStageFilterLabel();
    if (!universe) {
        meta.textContent = "Wybierz uniwersum w Kroku 1 powyżej.";
    } else if (data.ref_date) {
        meta.textContent = !filterLabel
            ? `Rebalans: ${data.ref_date} · ${allRows.length} spółek`
            : `Rebalans: ${data.ref_date} · ${rows.length} z ${allRows.length} spółek (etap ${filterLabel})`;
    } else {
        meta.textContent = "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).";
    }

    const tbody = document.getElementById("pickerTableBody");
    tbody.innerHTML = "";

    if (rows.length === 0) {
        const tr = document.createElement("tr");
        const msg = allRows.length === 0 ? "Brak danych." : "Żadna spółka nie pasuje do wybranego etapu.";
        tr.innerHTML = `<td colspan="10" class="empty-state">${msg}</td>`;
        tbody.appendChild(tr);
        return;
    }

    rows.forEach(c => {
        const tr = document.createElement("tr");
        if (isPicked(c.ticker, universe)) tr.classList.add("row-selected");
        tr.innerHTML = pickerRowHtml(c, universe);
        // Klik w wiersz (poza przyciskiem "+ Dodaj"/"✓ W portfelu", patrz
        // stopPropagation nizej) przekierowuje na chart.html — osobna strona
        // z jednym, pelnoekranowym wykresem tej spolki (patrz komentarz na
        // gorze js/chart.js). "back" niesie adres powrotny wprost w query
        // stringu (przetrwa odswiezenie chart.html), zeby przycisk "Powrót"
        // tam zawsze wracal dokladnie tutaj, do Kroku 2 — nie do samego
        // dashboardu jak we wczesniejszej wersji. Zero duplikowania kodu
        // wykresu na tej stronie (byl tu wczesniej pelny port
        // renderRelativeStrengthChart — usuniety na rzecz wspoldzielonego
        // js/chart-render.js, patrz CLAUDE.md).
        tr.addEventListener("click", () => {
            const params = new URLSearchParams({ ticker: c.ticker, universe, back: "rebalance.html" });
            window.location.href = `chart.html?${params.toString()}`;
        });
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".pick-toggle-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation(); // nie otwieraj wykresu przy klikaniu samego przycisku
            togglePick(btn.dataset.ticker, universe);
            renderPickerTable();
            renderPicksList();
            refreshOutputs();
        });
    });
}

// ============================================================
// TWÓJ PORTFEL (SKUMULOWANY) — płaska lista wszystkich spółek wybranych do
// tej pory w Kroku 2, niezależnie od tego, które uniwersum jest akurat
// przeglądane — to jest widok "co zbudowałem miesiąc po miesiącu", z szybkim
// usunięciem pojedynczej pozycji bez konieczności wracania do jej uniwersum.
// ============================================================
function renderPicksList() {
    const wrap = document.getElementById("portfolioPicksList");
    if (!wrap) return;
    wrap.innerHTML = picks.length
        ? picks.map(p => `<span class="exclude-chip">${p.ticker} <span class="text-faint">(${UNIVERSE_LABELS[p.universe]})</span>`
            + `<button class="exclude-chip-remove" data-ticker="${p.ticker}" data-universe="${p.universe}" title="Usuń z portfela">✕</button></span>`).join("")
        : `<span class="text-faint">Portfel jest jeszcze pusty — wybierz spółki w Kroku 2 powyżej.</span>`;
    wrap.querySelectorAll(".exclude-chip-remove").forEach(btn => {
        btn.addEventListener("click", () => {
            togglePick(btn.dataset.ticker, btn.dataset.universe);
            renderPicksList();
            renderPickerTable();
            refreshOutputs();
        });
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
// Jedna wspólna lista, niezależna od tego, które uniwersum jest akurat
// przeglądane w Kroku 1/2.
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
        } catch (err) {
            status.textContent = `Błąd importu: ${err.message}`;
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

// ============================================================
// SUGESTIA REBALANSU (to tylko sugestia — Ty decydujesz co i kiedy kupić/sprzedać)
// ============================================================
// Zwraca { targets: {ticker: {...}} } dla WSZYSTKICH ręcznie wybranych w
// Kroku 2 spółek (picks, patrz togglePick) — ręcznie wykluczone znikają
// całkowicie. Waga = AKTUALNY momentum_score z all_constituents jej własnego
// uniwersum (świeżo przeliczany przez pipeline co tydzień, patrz
// get_universe_metrics), znormalizowany do 100% w obrębie wszystkich picks —
// to ŚWIADOME uproszczenie względem cap-ważenia z pipeline'u (9%/3x
// cap-weight, patrz compute_weights): jedna, spójna metoda ważenia, ta sama
// niezależnie od tego, z ilu i jakich uniwersów pochodzą wybrane spółki.
// Jeśli ta sama spółka została dodana z dwóch różnych uniwersów naraz
// (rzadkie — duży large-cap obecny i w SP500, i w NASDAQ100), jej wagi się
// sumują, a `universes` zbiera obie nazwy (do wyświetlenia w kolumnie
// "Indeks / uwaga"). Spółka, która wypadła z all_constituents swojego
// uniwersum (np. usunięta z indeksu) dostaje `stale: true` i wagę 0 — nadal
// widoczna w sugestii (żeby dało się ją świadomie sprzedać/usunąć z picks),
// ale nie bierze udziału w nowej alokacji.
function computeTargetsFromPicks(totalCapital) {
    const raw = {};
    picks.forEach(p => {
        if (excluded.includes(p.ticker)) return;
        const rows = (universeData[p.universe] && (universeData[p.universe].all_constituents || universeData[p.universe].constituents)) || [];
        const c = rows.find(r => r.ticker === p.ticker);
        const price = c ? c.price : (priceMap[p.ticker]?.price ?? null);
        const rawWeight = c ? (c.momentum_score || 0) : 0;
        const existing = raw[p.ticker];
        if (existing) {
            existing.raw_weight += rawWeight;
            if (!existing.universes.includes(p.universe)) existing.universes.push(p.universe);
            if (c) existing.stale = false; // znaleziony w co najmniej jednym uniwersum -> nie jest "stale"
        } else {
            raw[p.ticker] = {
                ticker: p.ticker, universes: [p.universe], price, target_value: 0,
                raw_weight: rawWeight,
                momentum_pct: c ? c.momentum_pct : null,
                volatility_pct: c ? c.volatility_pct : null,
                stale: !c,
            };
        }
    });

    const totalRawWeight = Object.values(raw).reduce((s, t) => s + t.raw_weight, 0);
    if (totalRawWeight > 0 && totalCapital > 0) {
        Object.values(raw).forEach(t => { t.target_value = totalCapital * (t.raw_weight / totalRawWeight); });
    }

    return { targets: raw };
}

// Odtwarza, jaki % `targets`-owego kapitału pochodzi z KAŻDEGO uniwersum —
// używane wyłącznie do zblendowania krzywej "Wynik historyczny"
// (blendEquityCurves, patrz niżej) proporcjonalnie do tego, ile portfel dziś
// faktycznie waży w danym uniwersum. Rzadki przypadek spółki dodanej z dwóch
// uniwersów naraz (patrz computeTargetsFromPicks) dzieli jej wartość równo
// między nie — wystarczające przybliżenie na potrzeby samego wykresu.
function deriveUniverseFractionsFromTargets(targets) {
    const sums = {};
    Object.values(targets).forEach(t => {
        if (!t.target_value || !t.universes.length) return;
        const share = t.target_value / t.universes.length;
        t.universes.forEach(u => { sums[u] = (sums[u] || 0) + share; });
    });
    return sums;
}

// Normalizuje dowolną mapę dodatnich "wag" (mogą to być % ustawione ręcznie,
// albo — jak tutaj — surowe kwoty kapitału z deriveUniverseFractionsFromTargets)
// do ułamków sumujących się do 1, pomijając wpisy <= 0. Skala wejścia jest
// bez znaczenia (normalizeWeights sam ją usuwa), więc ta sama funkcja działa
// identycznie dla wag procentowych i dla surowych kwot kapitału.
function normalizeWeights(weights) {
    const entries = UNIVERSES
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
// to czysta matematyka indeksów, nie sumowanie kwot w różnych walutach.
// Blenduje tylko po datach WSPÓLNYCH dla wszystkich ważonych krzywych (te
// same tygodnie w każdym z nich, skoro wszystkie liczy ten sam cotygodniowy
// pipeline) — zwraca null gdy brak ważonych uniwersów z danymi albo za mało
// wspólnych dat. Z jednym ważonym uniwersum (typowy przypadek — cały
// portfel dziś z jednego indeksu) to zwyczajnie jego własna, niezmieniona
// krzywa.
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

function updateContributionUnit() {
    const unitEl = document.getElementById("contributionUnit");
    const activeEl = document.getElementById("portfolioActiveUniverses");
    const activeUniverses = [...new Set(picks.map(p => p.universe))];
    if (unitEl) {
        const allPln = activeUniverses.length > 0 && activeUniverses.every(u => PLN_UNIVERSES.has(u));
        const allUsd = activeUniverses.length > 0 && activeUniverses.every(u => !PLN_UNIVERSES.has(u));
        unitEl.textContent = allPln ? "zł" : allUsd ? "$" : "$ / zł";
    }
    if (activeEl) {
        activeEl.textContent = activeUniverses.length
            ? `(portfel: ${activeUniverses.map(u => UNIVERSE_LABELS[u]).join(", ")})`
            : "(portfel pusty — wybierz spółki w Kroku 2 powyżej)";
    }
}

function renderSuggestions() {
    updateContributionUnit();
    const moneyFmt = currentMoneyFmt();
    const totalCapital = targetCapital();
    const excludedVal = excludedValue();
    const investableCapital = Math.max(0, totalCapital - excludedVal);
    const { targets } = computeTargetsFromPicks(investableCapital);
    const threshold = Math.max(investableCapital * TRADE_THRESHOLD_PCT, 5);

    const shares = holdingShares();

    const rows = [];
    Object.values(targets).forEach(t => {
        const heldShares = shares[t.ticker] || 0;
        const currentValue = t.price ? t.price * heldShares : 0;
        const note = t.universes.map(u => UNIVERSE_LABELS[u]).join(" + ") + (t.stale ? " (brak aktualnych danych)" : "");
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

    // Pozycje, które trzymasz, ale nie są (jeszcze) w portfelu wybranym w
    // Kroku 2 — wykluczone ręcznie, albo po prostu jeszcze nie dodane.
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
        rows.push({
            ticker, note: "nie w portfelu — dodaj w Kroku 2", target_value: 0, weight_pct: 0,
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

    const universesInPlay = [...new Set(picks.map(p => p.universe))];
    const parts = universesInPlay
        .map(u => (universeData[u]?.ref_date ? `${UNIVERSE_LABELS[u]}: ${universeData[u].ref_date}` : null))
        .filter(Boolean);
    document.getElementById("refDateNote").textContent = parts.length ? `(wg rebalansów z ${parts.join(", ")})` : "";

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

    const moneyFmt = currentMoneyFmt();
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
// — z jednym uniwersum w portfelu to po prostu jego własna, niezmieniona
// krzywa; z kilkoma naraz (portfel zbudowany na przestrzeni kilku miesięcy z
// różnych zwycięzców GEM) to ich zblendowana mieszanka, możliwa bez
// konwersji walut, bo obie krzywe są już znormalizowane do bazy 100. To NIE
// jest historia Twoich konkretnych pozycji (tych nie śledzimy wstecz) — to
// przybliżenie: "gdybyś trzymał/a kapitał w spółkach momentum tej mieszanki
// przez ten okres".
// ============================================================
let equityChart = null;

function renderEquityCurve() {
    const caption = document.getElementById("equityCurveCaption");
    const noteEl = document.getElementById("equityCurveNote");
    const investableCapital = Math.max(0, targetCapital() - excludedValue());
    const { targets } = computeTargetsFromPicks(investableCapital);
    const fractions = deriveUniverseFractionsFromTargets(targets);
    const curve = blendEquityCurves(fractions);

    if (equityChart) { equityChart.destroy(); equityChart = null; }

    if (!curve || !curve.dates || curve.dates.length < 2) {
        noteEl.textContent = "";
        caption.textContent = "Za mało zapisanej historii rebalansów, żeby pokazać wykres — rośnie z każdym cotygodniowym uruchomieniem pipeline'u, albo wybierz spółki w Kroku 2.";
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

    const activeLabels = Object.keys(deriveUniverseFractionsFromTargets(targets)).map(u => UNIVERSE_LABELS[u]).join(", ") || "—";
    caption.textContent = `Wynik historyczny (zrealizowany) portfela wybranego w Kroku 2 (${activeLabels}), ważony dokładnie tak, `
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
    // Symulacja obejmuje tylko część aktywnie zarządzaną przez portfel z
    // Kroku 2 — wykluczone pozycje mają inną charakterystykę ryzyka/zwrotu,
    // więc nie da się ich uczciwie opisać tym samym mu/sigma. mu/sigma same
    // są procentowe (nie kwotowe), więc miks walut w investableCapital
    // (patrz currentMoneyFmt) nie wpływa na wynik.
    const investableCapital = Math.max(0, targetCapital() - excludedValue());
    const { targets } = computeTargetsFromPicks(investableCapital);
    const horizon = parseInt(document.getElementById("mcHorizon").value, 10) || 12;
    const caption = document.getElementById("mcCaption");

    if (investableCapital <= 0 || Object.keys(targets).length === 0) {
        if (mcChart) { mcChart.destroy(); mcChart = null; }
        caption.textContent = "Ustaw dopłatę / dodaj pozycje, żeby zobaczyć symulację.";
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

    caption.textContent = `Symulacja obejmuje kapitał zarządzany przez portfel z Kroku 2: ${moneyFmt(investableCapital)}. `
        + `Założenia: oczekiwany zwrot ${(mu * 100).toFixed(1)}%/rok `
        + `(śr. ważona 12M momentum wybranych spółek, ograniczona do ±${MC_MU_CAP * 100}%/rok żeby uniknąć ekstrapolacji `
        + `chwilowych skoków), zmienność ${(sigma * 100).toFixed(1)}%/rok (śr. ważona zmienności rocznej), 300 symulowanych `
        + `ścieżek. Pasmo = zakres 10.–90. percentyla. To NIE jest prognoza ani porada inwestycyjna — pokazuje statystyczny `
        + `rozrzut przy założeniu, że przeszła zmienność i momentum się utrzymają, co nie jest gwarantowane.`;
}

function initSettingsForm() {
    document.getElementById("contribution").value = settings.contribution || "";
    const onChange = () => {
        settings.contribution = parseFloat(document.getElementById("contribution").value) || 0;
        saveSettings(settings);
        refreshOutputs();
    };
    document.getElementById("contribution").addEventListener("input", onChange);
}

// Odświeża sugestię + Monte Carlo + analizę portfela + wykres historyczny
// (renderSuggestions woła te pierwsze trzy) — wołane po każdej zmianie
// ustawień/holdingów/wykluczeń/picks.
function refreshOutputs() {
    renderSuggestions();
    renderEquityCurve();
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
        await loadUniverseData();
        initSettingsForm();
        initHoldingsForm();
        initXtbImport();
        initTvExport();
        initExcludeForm();
        renderExcludedList();
        initPickerSort();
        initPickerStageFilter();
        updateSortHeaderClasses();
        document.getElementById("mcHorizon").addEventListener("change", () => renderMonteCarlo());
        renderGemWidget();
        renderPickerTable();
        renderPicksList();
        renderAll();
    })();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
}

// Eksport wyłącznie dla test runnera Node (tests/js/) — nie ładowany
// i bez efektu w przeglądarce (module tam nie istnieje).
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        UNIVERSES, UNIVERSE_LABELS, PLN_UNIVERSES, GEM_MANUAL_OVERRIDE_UNIVERSES,
        fmtMoney, fmtMoneyPln, moneyFmtForUniverse, moneyFmtForCurrency, currentMoneyFmt, fmtQty, sharesSuggestion,
        currencyOf, computeTargetsFromPicks, deriveUniverseFractionsFromTargets,
        normalizeWeights, blendEquityCurves, parseXtbOpenPositions,
        weightedMuSigma, simulateMonteCarlo, randNormal,
        tvSymbolFor, buildTvPortfolioCsv, xtbDateToIso,
        loadManualGemReturns, saveManualGemReturns, applyManualGemOverrides,
        isPicked, togglePick,
        // Testy nie mają innego sposobu odczytać gemData.winner (nie jest
        // eksportowany bezpośrednio, tylko konsumowany przez renderGemWidget/
        // loadUniverseData) — potrzebne, żeby faktycznie zweryfikować, że
        // applyManualGemOverrides poprawnie przelicza zwycięzcę z nadpisanych
        // wartości, a nie tylko że nie rzuca wyjątku.
        _getGemWinner() { return gemData.winner; },
        // Testy potrzebują ustawić moduł-poziomu stan (universeData/settings/excluded/
        // holdings/picks/priceMap/gemData/gemPristineIndices/equityCurveData) bez
        // importu przez window — to jedyny sposób bez przepisywania modułu na klasę.
        _setState(s) {
            if (s.universeData !== undefined) universeData = s.universeData;
            if (s.settings !== undefined) settings = s.settings;
            if (s.excluded !== undefined) excluded = s.excluded;
            if (s.holdings !== undefined) holdings = s.holdings;
            if (s.picks !== undefined) picks = s.picks;
            if (s.priceMap !== undefined) priceMap = s.priceMap;
            if (s.gemData !== undefined) gemData = s.gemData;
            if (s.gemPristineIndices !== undefined) gemPristineIndices = s.gemPristineIndices;
            if (s.equityCurveData !== undefined) equityCurveData = s.equityCurveData;
        },
    };
}
