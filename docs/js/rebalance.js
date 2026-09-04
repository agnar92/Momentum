
const UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES", "WIG20", "MWIG40"];
const UNIVERSE_LABELS = {
    SP500: "S&P 500", NASDAQ100: "Nasdaq 100", DOWJONES: "Dow Jones", WIG20: "WIG20", MWIG40: "mWIG40",
};
// WIG20/mWIG40 są notowane w PLN — patrz moneyFmtFor/currencyOf/tvSymbolFor.
const PLN_UNIVERSES = new Set(["WIG20", "MWIG40"]);
const TRADE_THRESHOLD_PCT = 0.005; // pomijamy sugestie mniejsze niż 0.5% kapitału docelowego

// Rebalanser to teraz JEDEN wspólny przepływ, bez podziału na regiony USA/GPW
// (wcześniejsza architektura — patrz git history / CLAUDE.md). Użytkownik
// podaje tylko kapitał (dopłatę) i liczbę spółek (TOP N); rebalanser sam
// wybiera, KTÓRY z 5 uniwersów (SP500/NASDAQ100/DOWJONES/WIG20/MWIG40) brać —
// zwycięzca Global Equity Momentum (docs/data/global_equity_momentum.json,
// patrz gemData/renderGemWidget), zwrot % w pełnym 12-miesięcznym oknie — a z
// niego TOP N spółek wg tej samej logiki momentum, którą liczy pipeline
// (momentum_score/rank z get_universe_metrics, patrz selectedConstituents).
// Waluta wyświetlania (USD/PLN) wynika z tego, który indeks akurat wygrywa —
// patrz moneyFmtFor. Holdingi (ticker + liczba akcji) i lista wykluczeń
// pozostają WSPÓLNE i niezależne od zwycięzcy: stara pozycja z uniwersum, które
// akurat nie wygrywa, jest nadal poprawnie wyceniona i widoczna (do
// sprzedania) — tylko nowe sugestie kupna celują wyłącznie w zwycięzcę.
const SETTINGS_KEY = "momentum_rebalance_settings";
const HOLDINGS_KEY = "momentum_rebalance_holdings";
const EXCLUDED_KEY = "momentum_rebalance_excluded";
const DEFAULT_SETTINGS = { contribution: 0, topN: 10 };

let universeData = {};    // { SP500: {...json}, NASDAQ100: {...}, ... }
let priceMap = {};        // ticker -> { price, sources: [universe,...] }
let equityCurveData = {}; // { NASDAQ100: {dates, momentum_index, benchmark_index, ...}, ... }
let gemData = { ref_date: null, indices: [], winner: null, leaders: [] };

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

let settings = loadSettings();
let holdings = loadHoldings();
let excluded = loadExcluded();

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
    // uniwersum, które akurat nie wygrywa w GEM.
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
}

function fmtMoney(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMoneyPln(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}

// Waluta wyświetlania wynika z tego, KTÓRY indeks akurat wygrywa w GEM (patrz
// gemData.winner) — nie z regionu (regiony już nie istnieją). Gdy nie ma
// jeszcze danych GEM, domyślnie USD.
function moneyFmtFor() { return PLN_UNIVERSES.has(gemData.winner) ? fmtMoneyPln : fmtMoney; }

// Formatter dla KONKRETNEGO tickera niezależnie od zwycięzcy GEM — używany w
// tabeli holdingów, bo tam pozycje mogą być z różnych uniwersów/walut naraz
// (patrz currencyOf).
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
// niezależnie od tego, który indeks akurat wygrywa w GEM) — na podstawie
// tego, w jakim uniwersum go znaleziono (patrz priceMap/all_prices.json).
// Nieznany ticker (spoza śledzonych indeksów) domyślnie USD.
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
// sprzedać, nawet jeśli je importujesz z XTB albo wybierze je momentum.
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
        refreshOutputs();
    };
    document.getElementById("excludeAddBtn").addEventListener("click", addTicker);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTicker(); } });
}

// ============================================================
// GLOBAL EQUITY MOMENTUM — mały, tylko-do-odczytu widget: który indeks
// (SP500/NASDAQ100/DOWJONES/WIG20/mWIG40) akurat wygrywa i jaki jest jego
// zwrot, plus ranking pozostałych 4. To jest silnik wyboru dla TOP N poniżej
// (patrz selectedConstituents) — kiedyś była to osobna zakładka na
// dashboardzie (app.js), teraz przeniesiona tutaj.
// ============================================================
function renderGemWidget() {
    const el = document.getElementById("gemWidget");
    if (!el) return;
    if (!gemData.winner) {
        el.innerHTML = `<span class="text-faint">Brak danych — uruchom pipeline (fetch_data.py + run_query.py).</span>`;
        return;
    }
    const winnerReturn = (gemData.indices || []).find(i => i.universe === gemData.winner);
    // manual_entry: WIG20/MWIG40 moga miec return_pct recznie wpisany z gem_manual_returns.json
    // (patrz CLAUDE.md / run_query.py::_load_gem_manual_returns) zamiast liczonego z syntetycznego
    // indeksu — "(ręcznie)" to zwykla transparentnosc pochodzenia danych, tak jak fmc_note gdzie
    // indziej w aplikacji, nie ostrzezenie.
    const rows = (gemData.indices || []).map(i => `
        <div class="gem-index-row${i.universe === gemData.winner ? " gem-index-winner" : ""}">
            <span>${i.universe === gemData.winner ? "🏆 " : ""}${UNIVERSE_LABELS[i.universe]}${i.manual_entry ? ' <span class="text-faint">(ręcznie)</span>' : ""}</span>
            <span class="${i.return_pct >= 0 ? "positive" : "negative"}">${i.return_pct >= 0 ? "+" : ""}${i.return_pct.toFixed(2)}%</span>
        </div>
    `).join("");
    el.innerHTML = `
        <div class="sidebar-group-meta">
            Zwycięzca: ${UNIVERSE_LABELS[gemData.winner]}
            ${winnerReturn ? (winnerReturn.return_pct >= 0 ? "+" : "") + winnerReturn.return_pct.toFixed(2) + "%" : ""}
            (${gemData.lookback_months || 12}M) — z niego bierzemy TOP N spółek poniżej.
        </div>
        <div class="gem-index-returns">${rows}</div>
    `;
}

// ============================================================
// POZYCJE (holdings) — dodajesz/usuwasz akcje kiedy chcesz, bez ograniczeń.
// Jedna wspólna lista, niezależna od tego, który indeks akurat wygrywa w GEM.
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
    const moneyFmt = moneyFmtFor();
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
// TOP N spółek WYŁĄCZNIE ze zwycięskiego w GEM indeksu (gemData.winner),
// posortowanych po `rank` (ranking wg momentum_score z get_universe_metrics,
// ta sama logika, którą pipeline liczy dla selekcji portfela — patrz
// run_query.py::_build_full_universe_records/export_json). Czyta
// "all_constituents" (CAŁE kwalifikujące się uniwersum, nie tylko dzisiejszą
// selekcję kwintylową) — winner może się zmieniać miesiąc do miesiąca, a
// TOP N ma wynikać bezpośrednio z rankingu momentum, nie z przynależności do
// bieżącej selekcji pipeline'u. Ręcznie wykluczone znikają z listy
// całkowicie, więc TOP N liczy się z tego, co zostaje.
function selectedConstituents(topN) {
    const winner = gemData.winner;
    if (!winner || topN <= 0) return [];
    const data = universeData[winner] || {};
    const rows = data.all_constituents || data.constituents || [];
    return rows
        .filter(c => !excluded.includes(c.ticker))
        .slice()
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
        .slice(0, topN);
}

// Zwraca: { targets: {ticker: {...}} }. Wagi ważone `momentum_score` (zawsze
// > 0 z konstrukcji — patrz add_zscore_and_momentum_score w run_query.py),
// znormalizowane do 100% w obrębie wybranego TOP N. To jest ŚWIADOME
// uproszczenie względem cap-ważenia z pipeline'u (9%/3x cap-weight, patrz
// compute_weights) — `weight_pct` z pipeline'u NIE jest tu użyte, bo dla
// uniwersów równoważonych (DOWJONES/WIG20/MWIG40) to i tak tylko równa waga
// 1/n (nie wg momentum), a `all_constituents` w ogóle nie eksportuje
// `weight_pct` dla spółek poza bieżącą selekcją pipeline'u. Ważenie po
// momentum_score jest więc jedną, spójną metodą działającą identycznie dla
// każdego z 5 uniwersów, niezależnie od tego, jak pipeline waży go u siebie.
function computeTargets(topN, totalCapital) {
    const rows = selectedConstituents(topN);
    const raw = {};
    rows.forEach(c => {
        raw[c.ticker] = {
            ticker: c.ticker, price: c.price, target_value: 0,
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

function updateContributionUnit() {
    const unitEl = document.getElementById("contributionUnit");
    if (unitEl) unitEl.textContent = PLN_UNIVERSES.has(gemData.winner) ? "zł" : "$";
    const activeEl = document.getElementById("topnActiveUniverse");
    if (activeEl) activeEl.textContent = gemData.winner ? `(aktualnie: ${UNIVERSE_LABELS[gemData.winner]})` : "";
}

function renderSuggestions() {
    updateContributionUnit();
    const moneyFmt = moneyFmtFor();
    const winner = gemData.winner;
    const totalCapital = targetCapital();
    const excludedVal = excludedValue();
    const investableCapital = Math.max(0, totalCapital - excludedVal);
    const topN = settings.topN || 0;
    const { targets } = computeTargets(topN, investableCapital);
    const threshold = Math.max(investableCapital * TRADE_THRESHOLD_PCT, 5);

    const shares = holdingShares();

    const rows = [];
    Object.values(targets).forEach(t => {
        const heldShares = shares[t.ticker] || 0;
        const currentValue = t.price ? t.price * heldShares : 0;
        rows.push({
            ticker: t.ticker,
            note: winner ? UNIVERSE_LABELS[winner] : "",
            target_value: t.target_value,
            weight_pct: investableCapital ? (t.target_value / investableCapital * 100) : 0,
            current_value: currentValue,
            diff: t.target_value - currentValue,
            price: t.price,
            shares_held: heldShares,
        });
    });

    // Pozycje, które trzymasz, ale nie mieszczą się w aktualnej sugestii —
    // wykluczone ręcznie, poza TOP N w zwycięskim indeksie, albo z uniwersum,
    // które akurat NIE jest tegomiesięcznym zwycięzcą GEM (a więc nie brane
    // pod uwagę w ogóle, niezależnie od TOP N).
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
        const tickerUniverses = priceMap[ticker]?.sources || [];
        const note = (winner && tickerUniverses.includes(winner))
            ? `poza TOP ${topN}`
            : `poza aktywnym indeksem GEM (obecnie: ${winner ? UNIVERSE_LABELS[winner] : "—"})`;
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

    const refDate = winner ? universeData[winner]?.ref_date : null;
    document.getElementById("refDateNote").textContent = refDate
        ? `(wg rebalansu z ${refDate} — kolejny automatycznie 1. dnia miesiąca)` : "";

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

    const moneyFmt = moneyFmtFor();
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
// WYNIK HISTORYCZNY PORTFOLIA — equity curve DOKŁADNIE zwycięskiego w GEM
// indeksu (docs/data/equity_curve.json, patrz run_query.py::compute_equity_curve,
// zbudowane z realnych zapisów portfolio_history). Bez regionów/blendowania
// wielu uniwersów naraz (to była logika dwuregionowej architektury) — z
// JEDNYM aktywnym uniwersum na raz krzywa to po prostu jego własna historia.
// To NIE jest historia Twoich konkretnych pozycji (tych nie śledzimy wstecz)
// — to przybliżenie: "gdybyś trzymał/a kapitał w spółkach momentum tego
// indeksu przez ten okres".
// ============================================================
let equityChart = null;

function renderEquityCurve() {
    const caption = document.getElementById("equityCurveCaption");
    const noteEl = document.getElementById("equityCurveNote");
    const winner = gemData.winner;
    const curve = winner ? equityCurveData[winner] : null;

    if (equityChart) { equityChart.destroy(); equityChart = null; }

    if (!curve || !curve.dates || curve.dates.length < 2) {
        noteEl.textContent = "";
        caption.textContent = "Za mało zapisanej historii rebalansów, żeby pokazać wykres — rośnie z każdym miesięcznym uruchomieniem pipeline'u.";
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

    caption.textContent = `Wynik historyczny (zrealizowany) selekcji momentum indeksu ${UNIVERSE_LABELS[winner]} `
        + "(aktualny zwycięzca GEM) vs. 'kup i trzymaj' ten sam indeks. To NIE jest historia konkretnie Twoich pozycji "
        + "(tych nie śledzimy wstecz), tylko przybliżenie na bazie zapisanych rebalansów. Dane informacyjne, NIE prognoza "
        + "ani porada inwestycyjna — wyniki z przeszłości nie gwarantują przyszłych zwrotów.";
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
    const moneyFmt = moneyFmtFor();
    // Symulacja obejmuje tylko część aktywnie zarządzaną przez momentum —
    // wykluczone pozycje mają inną charakterystykę ryzyka/zwrotu, więc
    // nie da się ich uczciwie opisać tym samym mu/sigma.
    const investableCapital = Math.max(0, targetCapital() - excludedValue());
    const { targets } = computeTargets(settings.topN || 0, investableCapital);
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

    caption.textContent = `Symulacja obejmuje kapitał zarządzany przez momentum: ${moneyFmt(investableCapital)}. `
        + `Założenia: oczekiwany zwrot ${(mu * 100).toFixed(1)}%/rok `
        + `(śr. ważona 12M momentum wybranych spółek, ograniczona do ±${MC_MU_CAP * 100}%/rok żeby uniknąć ekstrapolacji `
        + `chwilowych skoków), zmienność ${(sigma * 100).toFixed(1)}%/rok (śr. ważona zmienności rocznej), 300 symulowanych `
        + `ścieżek. Pasmo = zakres 10.–90. percentyla. To NIE jest prognoza ani porada inwestycyjna — pokazuje statystyczny `
        + `rozrzut przy założeniu, że przeszła zmienność i momentum się utrzymają, co nie jest gwarantowane.`;
}

function initSettingsForm() {
    document.getElementById("contribution").value = settings.contribution || "";
    document.getElementById("topn").value = settings.topN;

    const onChange = () => {
        settings.contribution = parseFloat(document.getElementById("contribution").value) || 0;
        settings.topN = parseInt(document.getElementById("topn").value, 10) || 0;
        saveSettings(settings);
        refreshOutputs();
    };
    document.getElementById("contribution").addEventListener("input", onChange);
    document.getElementById("topn").addEventListener("input", onChange);
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
        await loadUniverseData();
        initSettingsForm();
        initHoldingsForm();
        initXtbImport();
        initTvExport();
        initExcludeForm();
        renderExcludedList();
        document.getElementById("mcHorizon").addEventListener("change", () => renderMonteCarlo());
        renderGemWidget();
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
        UNIVERSES, UNIVERSE_LABELS, PLN_UNIVERSES,
        fmtMoney, fmtMoneyPln, moneyFmtFor, moneyFmtForCurrency, fmtQty, sharesSuggestion,
        currencyOf, selectedConstituents, computeTargets, parseXtbOpenPositions,
        weightedMuSigma, simulateMonteCarlo, randNormal,
        tvSymbolFor, buildTvPortfolioCsv, xtbDateToIso,
        // Testy potrzebują ustawić moduł-poziomu stan (universeData/settings/excluded/
        // gemData) bez importu przez window — to jedyny sposób bez przepisywania modułu
        // na klasę.
        _setState(s) {
            if (s.universeData !== undefined) universeData = s.universeData;
            if (s.settings !== undefined) settings = s.settings;
            if (s.excluded !== undefined) excluded = s.excluded;
            if (s.holdings !== undefined) holdings = s.holdings;
            if (s.priceMap !== undefined) priceMap = s.priceMap;
            if (s.gemData !== undefined) gemData = s.gemData;
        },
    };
}
