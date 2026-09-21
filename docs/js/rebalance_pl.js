// UNIVERSES/PLN_UNIVERSES/STAGE_LABELS/STAGE_COLORS/stageCellHtml/compareRows
// żyją w js/shared.js, które rebalance_pl.html ładuje PRZED tym plikiem
// (patrz komentarz na górze shared.js). showToast/initConnStatus/
// hideLoadingOverlay żyją analogicznie w js/qol.js (patrz komentarz na górze
// tamtego pliku), ładowanym tuż po shared.js.
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./qol.js"));
}

const TRADE_THRESHOLD_PCT = 0.005; // pomijamy sugestie mniejsze niż 0.5% kapitału docelowego

// ============================================================
// REBALANSER PL — bliźniacza kopia rebalance.js/rebalance.html
// ("Rebalanser USA"), ale dla WIG20/mWIG40 zamiast SP500/Nasdaq100/Dow
// Jones. Powstał na wyraźną prośbę użytkownika: zamiast dalej trzymać
// WIG20/mWIG40 poza narzędziem (jak w poprzednim projekcie — patrz
// CLAUDE.md/"What this repo is"), dostają teraz WŁASNY, w pełni
// automatyczny rebalanser, dokładnie tym samym mechanizmem co USA (jedno
// ustawienie — ile spółek w portfelu — reszta: dobór TOP N i wagi wg
// momentum, automatycznie).
//
// To jest CELOWO osobna strona (rebalance_pl.html) i osobny plik JS, nie
// jeden wspólny rebalanser z dwiema pulami do wyboru — z dokładnie tego
// samego powodu, dla którego oryginalny projekt (patrz CLAUDE.md, punkt 1.
// historii projektowej rebalansera) rozdzielił USA/PL na dwie niezależne
// połówki: żeby nigdy nie zsumować kwoty w PLN z kwotą w USD. Ten plik ma
// więc WŁASNE klucze localStorage (holdingi/wykluczenia/ustawienia — osobny
// portfel od Rebalansera USA), a jego pula jest zawsze w 100% PLN, więc —
// w przeciwieństwie do rebalance.js — nie potrzeba tu żadnego mnożnika
// faworyzującego jeden indeks nad drugim (DOWJONES_WEIGHT_MULTIPLIER w
// rebalance.js), bo o coś takiego nikt dla WIG20/mWIG40 nie prosił.
//
// Pula (REBALANCE_UNIVERSES niżej) to WIG20 + mWIG40, oba w CAŁOŚCI: oba są
// EQUAL_WEIGHT_UNIVERSES w run_query.py (bez selekcji kwintylowej — patrz
// CLAUDE.md), więc ich `constituents` to już cały skład indeksu, tak samo
// jak DOWJONES w rebalance.js — nie ma tu odpowiednika NASDAQ100's
// `all_constituents` (które musiało sięgać PO ZA kwintylową selekcję).
// ============================================================
const REBALANCE_UNIVERSES = ["WIG20", "MWIG40"];
const REBALANCE_UNIVERSE_LABELS = { WIG20: "WIG20", MWIG40: "mWIG40" };

const SETTINGS_KEY = "momentum_rebalance_pl_settings";
const HOLDINGS_KEY = "momentum_rebalance_pl_holdings";
const EXCLUDED_KEY = "momentum_rebalance_pl_excluded";
const POOL_COLLAPSED_KEY = "momentum_rebalance_pl_pool_collapsed";

// portfolioSize — ile spółek (TOP N z puli, patrz wyżej) ma być w portfelu;
// jedyny "wybór" jaki użytkownik podejmuje, resztą (który to konkretnie
// spółki, jakie wagi) zajmuje się rebalanser sam. Domyślnie 10 — pula
// WIG20+mWIG40 razem to ok. 55-60 spółek, więc dużo mniejsza niż pula
// Rebalansera USA (~600+), stąd też mniejsza domyślna liczba spółek w
// portfelu.
const DEFAULT_SETTINGS = { contribution: 0, portfolioSize: 10 };

let universeData = {};    // { WIG20: {...json}, MWIG40: {...json} }
let priceMap = {};        // ticker -> { price, sources: [universe,...] } — dla WSZYSTKICH tickerow (holdingi moga byc z dowolnego indeksu)
let equityCurveData = {}; // { WIG20: {dates, momentum_index, benchmark_index, ...}, ... }

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
// domyślnie ZWINIĘTE, ten sam wzorzec/uzasadnienie co w rebalance.js.
function loadPoolCollapsed() {
    try {
        const v = localStorage.getItem(POOL_COLLAPSED_KEY);
        return v === null ? true : v === "1"; // brak zapisu -> domyslnie zwinieta
    } catch (e) { return true; }
}
function savePoolCollapsed(v) { localStorage.setItem(POOL_COLLAPSED_KEY, v ? "1" : "0"); }

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

    // Ceny dla WSZYSTKICH spółek we WSZYSTKICH indeksach (nie tylko WIG20/
    // mWIG40) — żeby móc wycenić dowolną pozycję użytkownika, np. gdyby ktoś
    // ręcznie dodał tu spółkę spoza puli tego rebalansera.
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

function fmtMoney(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMoneyPln(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}

// Formatter dla PULI rebalansera i wszystkiego, co z niej wynika (ranking,
// sugestia, statystyki, Monte Carlo, krzywa historyczna) — pula tego
// rebalansera to zawsze WIG20+MWIG40, czyli zawsze PLN (w przeciwieństwie do
// Rebalansera USA, gdzie ten sam wzorzec zwraca fmtMoney/USD). Zostaje jako
// osobna funkcja (nie wprost fmtMoneyPln w każdym wywołaniu) z tego samego
// powodu co w rebalance.js — jasność w kodzie DLACZEGO to zawsze PLN, jeden
// punkt zaczepienia dla testów.
function currentMoneyFmt() { return fmtMoneyPln; }

// Formatter dla ANALIZY PORTFELA (donut niżej) — dzieli TWOJE OBECNE pozycje
// (holdings) tego rebalansera. Normalnie to zawsze PLN (WIG20/mWIG40), ale
// gdyby ktoś ręcznie dodał tu spółkę spoza tej puli (np. USD), miksujemy bez
// przewalutowania, ta sama uproszczona konwencja co w rebalance.js.
function holdingsMoneyFmt() {
    const tickers = Object.keys(holdingShares());
    if (tickers.length === 0) return fmtMoneyPln;
    if (tickers.every(t => currencyOf(t) === "PLN")) return fmtMoneyPln;
    return fmtMoney;
}

// Formatter dla KONKRETNEGO tickera w tabeli holdingów — pozycje tam mogą
// teoretycznie być z różnych walut naraz (patrz currencyOf).
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
// REBALANCE_UNIVERSES). Nieznany ticker domyślnie USD.
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
// PULA REBALANSERA — WIG20 (cały) + MWIG40 (cały), połączone w jedną listę i
// posortowane wg momentum_score malejąco. Oba uniwersa są w
// EQUAL_WEIGHT_UNIVERSES w run_query.py (patrz CLAUDE.md) — bez selekcji
// kwintylowej, więc `constituents` to już cały skład indeksu w obu
// przypadkach (w przeciwieństwie do rebalance.js, tu nie ma potrzeby
// osobnego przypadku dla `all_constituents`). Porównywanie momentum_score
// WPROST między WIG20 i mWIG40 to to samo świadome uproszczenie co w
// rebalance.js (patrz tamten komentarz / CLAUDE.md).
// ============================================================
function poolRowsForUniverse(universe) {
    const data = universeData[universe] || {};
    return data.constituents || data.all_constituents || [];
}

// Ten sam ticker mógłby teoretycznie wystąpić w obu uniwersach naraz — żeby
// TOP N liczył unikalne spółki (a nie dwa sloty dla tej samej firmy),
// bierzemy tylko wystąpienie z wyższym momentum_score.
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

// Filtr etapow Weinsteina (Krok 2, patrz stage-filter-bar w rebalance_pl.html) —
// MULTI-SELECT, ten sam wzorzec/uzasadnienie co w rebalance.js. "ALL" to
// sentinel oznaczajacy brak filtra. Filtr NIE jest czysto kosmetyczny —
// `eligiblePoolRows()` (i przez to `autoSelectedRows()`/`computeAutoTargets()`)
// filtruje po nim, więc zaznaczenie np. tylko Etapu 2 realnie oznacza "kupuj
// tylko spośród spółek w Etapie 2".
let poolStageFilter = "ALL";

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
// spoza wybranego etapu Weinsteina — z numerem pozycji (pool_rank)
// przydzielonym PO obu tych filtrach, więc TOP N naprawdę oznacza N różnych,
// kupowalnych spółek pasujących do aktualnego filtra.
function eligiblePoolRows() {
    return combinedPoolRows()
        .filter(c => !excluded.includes(c.ticker))
        .filter(c => matchesPoolStageFilter(c.weekly_chart && c.weekly_chart.current_stage))
        .map((c, i) => ({ ...c, pool_rank: i + 1 }));
}

function autoSelectedRows(n) {
    if (!n || n <= 0) return [];
    return eligiblePoolRows().slice(0, n);
}

// ============================================================
// RANKING PULI — pełna, sortowalna, filtrowalna po etapie Weinsteina tabela.
// Nie ma tu przycisku "+ Dodaj" — wybór spółek jest w pełni automatyczny,
// jedyne co ustawiasz to liczbę spółek (Krok 1 powyżej) i, opcjonalnie,
// filtr etapu.
// ============================================================
let poolSortKey = "pool_rank";
let poolSortDir = "asc";

function poolRowHtml(c) {
    const stage = c.weekly_chart && c.weekly_chart.current_stage;
    const inTopN = c.pool_rank <= (settings.portfolioSize || 0);
    return `
        <td><span class="rank-badge">${c.pool_rank}</span></td>
        <td class="ticker-cell">${c.ticker}</td>
        <td>${REBALANCE_UNIVERSE_LABELS[c.universe]}</td>
        <td>${c.sector}</td>
        <td>${fmtMoneyPln(c.price)}</td>
        <td class="${c.momentum_pct >= 0 ? "positive" : "negative"}">${c.momentum_pct.toFixed(2)}%</td>
        <td>${c.momentum_window}</td>
        <td>${c.volatility_pct.toFixed(2)}%</td>
        <td>${c.momentum_score.toFixed(3)}</td>
        <td>${stageCellHtml(stage)}</td>
        <td><span class="action-badge ${inTopN ? "buy" : "skip"}">${inTopN ? "✓ w portfelu" : "—"}</span></td>
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
// ten sam wzorzec co w rebalance.js.
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
    const allRows = eligiblePoolRows();
    const filterLabel = poolStageFilterLabel();
    const totalUnfiltered = filterLabel
        ? combinedPoolRows().filter(c => !excluded.includes(c.ticker)).length
        : allRows.length;
    const refDates = poolRefDateNote();
    const n = settings.portfolioSize || 0;

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
            const base = `Pula: ${allRows.length} spółek (TOP ${n} w portfelu) · ${refDates}`;
            return !filterLabel ? base : `${base} · filtr etapu ${filterLabel} zawęża pulę z ${totalUnfiltered} do ${allRows.length}`;
        },
        rowHtml: c => poolRowHtml(c),
        afterRender: (tbody) => {
            tbody.querySelectorAll(".chart-row-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const params = new URLSearchParams({
                        ticker: btn.dataset.ticker, universe: btn.dataset.universe, back: "rebalance_pl.html",
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
// Jedna wspólna lista, niezależna od puli rebalansera i CAŁKOWICIE osobna od
// Rebalansera USA (własny HOLDINGS_KEY, patrz wyżej).
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
            <td><input type="text" class="h-ticker" value="${h.ticker || ""}" placeholder="np. PKN"></td>
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
// IMPORT Z RAPORTU XTB (arkusz "Open Positions") — identyczna logika co w
// rebalance.js (patrz tamten komentarz dla pełnego uzasadnienia). Zastępuje
// TYLKO holdingi TEGO (PL) rebalansera — Rebalanser USA ma swoją własną,
// niezależną listę pozycji.
// ============================================================
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
// EKSPORT DO TRADINGVIEW PORTFOLIO — identyczna logika co w rebalance.js.
// ============================================================
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
    a.download = `tv_portfolio_pl_${new Date().toISOString().slice(0, 10)}.csv`;
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
// Zwraca { targets: {ticker: {...}} } dla automatycznie wybranego TOP N
// (patrz autoSelectedRows). Waga = AKTUALNY momentum_score z puli, znormalizowany
// do 100% w obrębie wybranego TOP N — to samo świadome uproszczenie względem
// cap-ważenia z pipeline'u co w rebalance.js (patrz tamten komentarz), bez
// żadnego dodatkowego mnożnika (WIG20/mWIG40 traktowane symetrycznie, w
// przeciwieństwie do DOWJONES_WEIGHT_MULTIPLIER w Rebalanserze USA — nikt o
// taki tilt tutaj nie prosił).
function computeAutoTargets(n, totalCapital) {
    const rows = autoSelectedRows(n);
    const raw = {};
    rows.forEach(c => {
        raw[c.ticker] = {
            ticker: c.ticker, universes: [c.universe], price: c.price, target_value: 0,
            raw_weight: c.momentum_score || 0,
            momentum_pct: c.momentum_pct, volatility_pct: c.volatility_pct,
        };
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
// faktycznie waży w danym uniwersum (WIG20 i/lub mWIG40, w zależności od
// tego, skąd trafiło dzisiejsze TOP N).
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
// pomijając wpisy <= 0. Skala wejścia jest bez znaczenia.
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

// Blenduje krzywe equity_curve.json WIG20/mWIG40 wg podanych wag
// (znormalizowanych przez normalizeWeights) — bez żadnej konwersji walut,
// bo obie krzywe są już znormalizowane do bazy 100. Blenduje tylko po
// datach WSPÓLNYCH dla wszystkich ważonych krzywych — zwraca null gdy brak
// ważonych uniwersów z danymi albo za mało wspólnych dat.
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
    // pozycja nie jest w dzisiejszym TOP N — ten sam wzorzec co w rebalance.js.
    const poolTickers = new Set(combinedPoolRows().map(c => c.ticker));
    const eligibleTickers = new Set(eligiblePoolRows().map(c => c.ticker));
    const stageFilterLabel = poolStageFilterLabel();

    const rows = [];
    Object.values(targets).forEach(t => {
        const heldShares = shares[t.ticker] || 0;
        const currentValue = t.price ? t.price * heldShares : 0;
        const note = t.universes.map(u => REBALANCE_UNIVERSE_LABELS[u]).join(" + ");
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
    // puli tego rebalansera (WIG20/mWIG40) — np. spółka z USA.
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
            note = "poza pulą rebalansera (WIG20 / mWIG40)";
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
// faktycznie waży najwięcej w tym (PL) portfelu.
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
// WYNIK HISTORYCZNY PORTFOLIA — equity curve (docs/data/equity_curve.json),
// zblendowana wg tego, ile portfel dziś faktycznie waży w WIG20/mWIG40
// (deriveUniverseFractionsFromTargets + blendEquityCurves) — ten sam wzorzec
// co w rebalance.js. Z jednym uniwersum w TOP N (typowe przy mniejszym
// portfolioSize) to po prostu jego własna, niezmieniona krzywa.
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
// prognoza. Identyczna logika co w rebalance.js.
// ============================================================
let mcChart = null;

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
// (renderSuggestions woła te pierwsze trzy) — wołane po każdej zmianie
// ustawień/holdingów/wykluczeń.
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
        initConnStatus();
        await loadUniverseData();
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
        fmtMoney, fmtMoneyPln, currentMoneyFmt, holdingsMoneyFmt, moneyFmtForCurrency, fmtQty, sharesSuggestion,
        currencyOf, combinedPoolRows, eligiblePoolRows, autoSelectedRows, computeAutoTargets, matchesPoolStageFilter,
        deriveUniverseFractionsFromTargets, normalizeWeights, blendEquityCurves, parseXtbOpenPositions,
        weightedMuSigma, simulateMonteCarlo, randNormal,
        tvSymbolFor, buildTvPortfolioCsv, xtbDateToIso,
        // Testy potrzebują ustawić moduł-poziomu stan (universeData/settings/excluded/
        // holdings/priceMap/equityCurveData) bez importu przez window — to jedyny
        // sposób bez przepisywania modułu na klasę.
        _setState(s) {
            if (s.universeData !== undefined) universeData = s.universeData;
            if (s.settings !== undefined) settings = s.settings;
            if (s.excluded !== undefined) excluded = s.excluded;
            if (s.holdings !== undefined) holdings = s.holdings;
            if (s.priceMap !== undefined) priceMap = s.priceMap;
            if (s.equityCurveData !== undefined) equityCurveData = s.equityCurveData;
            if (s.poolStageFilter !== undefined) poolStageFilter = s.poolStageFilter;
        },
    };
}
