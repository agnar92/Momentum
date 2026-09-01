
const UNIVERSES = ["NASDAQ100", "DOWJONES"];
const UNIVERSE_LABELS = { NASDAQ100: "Nasdaq 100", DOWJONES: "Dow Jones" };
const TRADE_THRESHOLD_PCT = 0.005; // pomijamy sugestie mniejsze niż 0.5% kapitału docelowego

const SETTINGS_KEY = "momentum_rebalance_settings";
const HOLDINGS_KEY = "momentum_rebalance_holdings";
const EXCLUDED_KEY = "momentum_rebalance_excluded";
// Własność portfolio.js — tu tylko odczyt. Spółki otagowane tam jako "core"
// (trzymane długoterminowo poza logiką momentum) są traktowane dokładnie
// tak jak ręczne wykluczenie: nie dostają sugestii kupna/sprzedaży, a ich
// wartość nie wchodzi do puli inwestowalnego kapitału — patrz isCoreTagged().
const PORTFOLIO_TAGS_KEY = "momentum_portfolio_tags";
const DEFAULT_SETTINGS = { contribution: 0, pct: { NASDAQ100: 75, DOWJONES: 25 }, maxHoldings: 20 };

let universeData = {};   // { NASDAQ100: {...json}, ... }
let priceMap = {};       // ticker -> { price, sources: [universe,...] }
let equityCurveData = {}; // { NASDAQ100: {dates, momentum_index, benchmark_index, ...}, ... }

function loadSettings() {
    try {
        return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
    } catch (e) { return { ...DEFAULT_SETTINGS }; }
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

function loadPortfolioTags() {
    try {
        return JSON.parse(localStorage.getItem(PORTFOLIO_TAGS_KEY)) || {};
    } catch (e) { return {}; }
}

let settings = loadSettings();
let holdings = loadHoldings();
let excluded = loadExcluded();
let portfolioTags = loadPortfolioTags();

function coreTaggedTickers() {
    return new Set(Object.keys(portfolioTags).filter(t => portfolioTags[t] === "core"));
}
function isCoreTagged(ticker) { return portfolioTags[ticker] === "core"; }

async function loadUniverseData() {
    for (const u of UNIVERSES) {
        try {
            const res = await fetch(`data/${u.toLowerCase()}.json`, { cache: "no-store" });
            universeData[u] = await res.json();
        } catch (e) {
            universeData[u] = { universe: u, ref_date: null, constituents: [] };
        }
    }

    // Ceny dla WSZYSTKICH spółek w indeksach (nie tylko wybranych do portfela
    // momentum) — żeby móc wycenić dowolną pozycję użytkownika.
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
}

function fmtMoney(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n) {
    return (Math.round(n * 1000) / 1000).toString().replace(".", ",");
}

// Ile sztuk (ułamkowo) kupić/sprzedać za daną kwotę $.
function sharesSuggestion(dollarAmount, price) {
    if (!price) return `~${fmtMoney(dollarAmount)} (brak ceny do przeliczenia na sztuki)`;
    const qty = dollarAmount / price;
    return `${fmtQty(qty)} szt. (~${fmtMoney(dollarAmount)})`;
}

function currentHoldingsValue() {
    return holdings.reduce((sum, h) => {
        const price = priceMap[h.ticker]?.price;
        return sum + (price ? price * (h.shares || 0) : 0);
    }, 0);
}

function targetCapital() {
    return currentHoldingsValue() + (settings.contribution || 0);
}

// Wartość pozycji wykluczonych z rebalansu — ten kapitał zostaje "poza
// systemem": nie liczy się do puli, którą alokujemy na spółki momentum.
// Obejmuje też pozycje otagowane jako Core w Portfolio — ta sama semantyka
// ("trzymam długoterminowo, nie ruszaj tego"), tylko zarządzana z drugiej strony.
function excludedHoldingsValue() {
    return holdings.reduce((sum, h) => {
        if (!h.ticker || (!excluded.includes(h.ticker) && !isCoreTagged(h.ticker))) return sum;
        const price = priceMap[h.ticker]?.price;
        return sum + (price ? price * (h.shares || 0) : 0);
    }, 0);
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
            renderSuggestions();
        });
    });
}

// Spółki otagowane jako Core w Portfolio — wykluczone tak samo jak powyżej,
// ale zarządzane po drugiej stronie, więc bez przycisku usuwania tutaj.
function renderCoreTaggedList() {
    const wrap = document.getElementById("coreTaggedList");
    const coreTagged = [...coreTaggedTickers()];
    wrap.innerHTML = coreTagged.length
        ? coreTagged.map(t => `<span class="exclude-chip core-chip">${t}</span>`).join("")
        : `<span class="text-faint">Brak.</span>`;
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
        renderSuggestions();
    };
    document.getElementById("excludeAddBtn").addEventListener("click", addTicker);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTicker(); } });
}

// ============================================================
// USTAWIENIA
// ============================================================
function initSettingsForm() {
    document.getElementById("contribution").value = settings.contribution || "";
    UNIVERSES.forEach(u => { document.getElementById(`pct-${u}`).value = settings.pct[u]; });
    document.getElementById("maxHoldings").value = settings.maxHoldings;
    document.getElementById("maxHoldingsValue").textContent = settings.maxHoldings;

    const onChange = () => {
        settings.contribution = parseFloat(document.getElementById("contribution").value) || 0;
        UNIVERSES.forEach(u => {
            settings.pct[u] = parseFloat(document.getElementById(`pct-${u}`).value) || 0;
        });
        settings.maxHoldings = parseInt(document.getElementById("maxHoldings").value, 10) || DEFAULT_SETTINGS.maxHoldings;
        document.getElementById("maxHoldingsValue").textContent = settings.maxHoldings;
        saveSettings(settings);
        renderBucketSum();
        renderSuggestions();
        renderEquityCurve();
    };
    document.getElementById("contribution").addEventListener("input", onChange);
    UNIVERSES.forEach(u => document.getElementById(`pct-${u}`).addEventListener("input", onChange));
    document.getElementById("maxHoldings").addEventListener("input", onChange);
}

function renderBucketSum() {
    const sum = UNIVERSES.reduce((a, u) => a + (settings.pct[u] || 0), 0);
    const el = document.getElementById("bucketSum");
    el.textContent = `Suma: ${sum}%`;
    el.className = "bucket-sum" + (sum === 100 ? " ok" : " warn");
    if (sum !== 100) el.textContent += " — powinno wynosić 100%, żeby wykorzystać cały kapitał docelowy.";
}

// ============================================================
// POZYCJE (holdings) — dodajesz/usuwasz akcje kiedy chcesz, bez ograniczeń.
// ============================================================
// Odświeża tylko kolumny Cena/Wartość dla jednego wiersza — bez przebudowy
// inputów, żeby nie tracić fokusu/kursora w trakcie pisania.
function refreshHoldingRowCells(tr, h) {
    const price = priceMap[h.ticker]?.price ?? null;
    const value = price !== null ? price * (h.shares || 0) : null;
    tr.querySelector(".h-price").innerHTML = price !== null ? fmtMoney(price) : '<span class="text-faint">brak</span>';
    tr.querySelector(".h-value").textContent = value !== null ? fmtMoney(value) : "—";
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
            renderCapitalHint();
            renderSuggestions();
        });
        tr.querySelector(".h-shares").addEventListener("input", (e) => {
            holdings[i].shares = parseFloat(e.target.value) || 0;
            saveHoldings(holdings);
            refreshHoldingRowCells(tr, holdings[i]);
            renderCapitalHint();
            renderSuggestions();
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
// (PL/EN) — szukamy po dopasowaniu wzorca, nie dokładnej nazwy, tak jak
// findColIndex w portfolio.js (ten sam problem, osobna implementacja, bo
// oba moduły są ładowane jako niezależne pliki bez wspólnego bundlera).
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
const PLN_SOURCE_UNIVERSES = new Set(["WIG20", "MWIG40"]);

// WIG20/mWIG40 są notowane na GPW w TradingView (prefiks "GPW:", tak jak
// tvSymbolFor w app.js) — reszta domyślnie na NASDAQ. Dla spółek z DOWJONES
// notowanych faktycznie na NYSE prefiks może być niepoprawny; kreator
// importu transakcji w TradingView pozwala wtedy ręcznie dopasować symbol.
function tvSymbolFor(ticker) {
    const sources = priceMap[ticker]?.sources || [];
    return sources.some(u => PLN_SOURCE_UNIVERSES.has(u)) ? `GPW:${ticker}` : `NASDAQ:${ticker}`;
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
    const current = currentHoldingsValue();
    const contribution = settings.contribution || 0;
    let text = `Masz teraz ${fmtMoney(current)} w akcjach + dopłata ${fmtMoney(contribution)} = kapitał docelowy ${fmtMoney(current + contribution)}`;
    const excludedValue = excludedHoldingsValue();
    if (excludedValue > 0) {
        text += ` (z czego ${fmtMoney(excludedValue)} w wykluczonych pozycjach — nie bierze udziału w rebalansie)`;
    }
    document.getElementById("capitalHint").textContent = text;
}

// ============================================================
// SUGESTIA REBALANSU (to tylko sugestia — Ty decydujesz co i kiedy kupić/sprzedać)
// ============================================================
// Zwraca: { targets: {ticker: {...}} przycięte do maxHoldings i przeskalowane
// tak, by sumowały się do totalCapital, oraz momentumSelected: Set tickerów
// wybranych przez strategię momentum (przed przycięciem limitem).
function computeTargets(totalCapital) {
    const raw = {}; // ticker -> { ticker, price, target_value, universes: [] }

    UNIVERSES.forEach(u => {
        const pctAllocation = settings.pct[u] || 0;
        if (pctAllocation <= 0) return; // Pomijamy indeksy z wagą 0%

        const bucketTarget = totalCapital * (pctAllocation / 100);
        // Wykluczone spółki (ręcznie albo otagowane jako Core w Portfolio)
        // znikają z puli momentum całkowicie — ich waga rozkłada się na
        // resztę, tak jakby nigdy nie były w indeksie.
        const constituents = (universeData[u].constituents || []).filter(c => !excluded.includes(c.ticker) && !isCoreTagged(c.ticker));

        // 1. Liczymy sumę wag surowych w pliku JSON dla tego indeksu
        const totalRawWeight = constituents.reduce((sum, c) => sum + (c.weight_pct || 0), 0);

        if (totalRawWeight > 0) {
            constituents.forEach(c => {
                // 2. Normalizujemy wagę spółki wewnątrz jej własnego koszyka do 100%
                const normalizedWeightInBucket = (c.weight_pct || 0) / totalRawWeight;
                // 3. Obliczamy jej realny przydział dolarowy z alokacji tego koszyka
                const contrib = bucketTarget * normalizedWeightInBucket;

                if (!raw[c.ticker]) {
                    raw[c.ticker] = {
                        ticker: c.ticker, price: c.price, target_value: 0, universes: [],
                        momentum_pct: c.momentum_pct, volatility_pct: c.volatility_pct,
                    };
                }
                raw[c.ticker].target_value += contrib;
                raw[c.ticker].universes.push(u);
            });
        }
    });

    const momentumSelected = new Set(Object.keys(raw));
    const maxHoldings = settings.maxHoldings || DEFAULT_SETTINGS.maxHoldings;
    
    // Sortujemy spółki wg obliczonej docelowej wartości dolarowej
    const sorted = Object.values(raw).sort((a, b) => b.target_value - a.target_value);
    const kept = sorted.slice(0, maxHoldings);

    // Jeśli limit maxHoldings odrzucił jakieś spółki, skalujemy zachowane,
    // aby całkowita suma alokacji nadal stanowiła 100% kapitału docelowego
    const keptSum = kept.reduce((s, t) => s + t.target_value, 0);
    if (keptSum > 0 && totalCapital > 0) {
        const scale = totalCapital / keptSum;
        kept.forEach(t => { t.target_value *= scale; });
    }

    const targets = {};
    kept.forEach(t => { targets[t.ticker] = t; });
    return { targets, momentumSelected };
}


function renderSuggestions() {
    const totalCapital = targetCapital();
    const excludedValue = excludedHoldingsValue();
    const investableCapital = Math.max(0, totalCapital - excludedValue);
    const { targets, momentumSelected } = computeTargets(investableCapital);
    const threshold = Math.max(investableCapital * TRADE_THRESHOLD_PCT, 5);

    const holdingShares = {};
    holdings.forEach(h => { if (h.ticker) holdingShares[h.ticker] = (holdingShares[h.ticker] || 0) + (h.shares || 0); });

    const rows = [];
    Object.values(targets).forEach(t => {
        const shares = holdingShares[t.ticker] || 0;
        const currentValue = t.price ? t.price * shares : 0;
        rows.push({
            ticker: t.ticker,
            note: t.universes.map(u => UNIVERSE_LABELS[u]).join(" + "),
            target_value: t.target_value,
            weight_pct: investableCapital ? (t.target_value / investableCapital * 100) : 0,
            current_value: currentValue,
            diff: t.target_value - currentValue,
            price: t.price,
            shares_held: shares,
        });
    });

    // Pozycje, które trzymasz, ale nie mieszczą się w aktualnej sugestii —
    // wykluczone ręcznie, wypadły z selekcji momentum, albo są ponad limit.
    Object.keys(holdingShares).forEach(ticker => {
        if (targets[ticker]) return;
        const price = priceMap[ticker]?.price;
        const currentValue = price ? price * holdingShares[ticker] : null;
        if (excluded.includes(ticker)) {
            rows.push({
                ticker, note: "wykluczone ręcznie", target_value: 0, weight_pct: 0,
                current_value: currentValue, diff: null, excludedRow: true,
                price, shares_held: holdingShares[ticker],
            });
            return;
        }
        if (isCoreTagged(ticker)) {
            rows.push({
                ticker, note: "Core w Portfolio", target_value: 0, weight_pct: 0,
                current_value: currentValue, diff: null, coreRow: true,
                price, shares_held: holdingShares[ticker],
            });
            return;
        }
        const note = momentumSelected.has(ticker) ? `ponad limit ${settings.maxHoldings} spółek` : "poza selekcją momentum";
        rows.push({
            ticker, note, target_value: 0, weight_pct: 0,
            current_value: currentValue, diff: currentValue !== null ? -currentValue : null, dropped: true,
            price, shares_held: holdingShares[ticker],
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
        } else if (r.coreRow) {
            actionHtml = `<span class="action-badge core">CORE (Portfolio) — bez zmian</span>`;
        } else if (r.diff === null) {
            actionHtml = `<span class="action-badge unknown">brak ceny — sprawdź ręcznie</span>`;
        } else if (r.dropped) {
            actionHtml = `<span class="action-badge sell">SPRZEDAJ CAŁOŚĆ: ${fmtQty(r.shares_held)} szt. (~${fmtMoney(r.current_value)})</span>`;
        } else if (r.diff > threshold) {
            actionHtml = `<span class="action-badge buy">KUP ${sharesSuggestion(r.diff, r.price)}</span>`;
        } else if (r.diff < -threshold) {
            actionHtml = `<span class="action-badge sell">SPRZEDAJ ${sharesSuggestion(-r.diff, r.price)}</span>`;
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
            <td>${fmtMoney(r.target_value)}</td>
            <td>${r.current_value !== null ? fmtMoney(r.current_value) : "—"}</td>
            <td>${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById("statCurrentValue").textContent = fmtMoney(currentHoldingsValue());
    document.getElementById("statTargetValue").textContent = fmtMoney(totalCapital);
    document.getElementById("statHoldingsCount").textContent = Object.keys(targets).length;

    const refDates = UNIVERSES.map(u => universeData[u].ref_date).filter(Boolean);
    document.getElementById("refDateNote").textContent = refDates.length
        ? `(wg rebalansu z ${refDates[0]} — kolejny automatycznie 1. dnia miesiąca)` : "";

    renderCapitalHint();
    renderMonteCarlo();
}

// ============================================================
// WYNIK HISTORYCZNY PORTFOLIA — łączy per-uniwersowe equity curves
// (patrz run_query.py::compute_equity_curve, zbudowane z realnych zapisów
// portfolio_history) wg Twojego podziału kapitału między indeksy
// (settings.pct). To NIE jest historia Twoich konkretnych pozycji (tych nie
// śledzimy wstecz) — to przybliżenie: "gdybyś trzymał/a kapitał w tych
// proporcjach między indeksami przez ten okres, wybierając spółki momentum".
// ============================================================
function blendEquityCurves(curveData, pct) {
    const included = UNIVERSES.filter(u => (pct[u] || 0) > 0 && (curveData[u]?.dates?.length || 0) >= 2);
    if (included.length === 0) return null;

    const pctSum = included.reduce((s, u) => s + pct[u], 0);
    if (pctSum <= 0) return null;

    // Przecięcie dat wszystkich uwzględnionych uniwersów — w praktyce
    // identyczne (ten sam miesięczny przebieg pipeline'u), ale przecięcie
    // zabezpiecza przed rozjazdem, gdyby kiedyś jeden uniwersum miał lukę.
    let dates = curveData[included[0]].dates;
    included.slice(1).forEach(u => {
        const set = new Set(curveData[u].dates);
        dates = dates.filter(d => set.has(d));
    });
    if (dates.length < 2) return null;

    const portfolio = [], benchmark = [];
    dates.forEach(d => {
        let pVal = 0, bVal = 0;
        included.forEach(u => {
            const w = pct[u] / pctSum;
            const idx = curveData[u].dates.indexOf(d);
            pVal += w * curveData[u].momentum_index[idx];
            bVal += w * curveData[u].benchmark_index[idx];
        });
        portfolio.push(pVal);
        benchmark.push(bVal);
    });
    return { dates, portfolio, benchmark };
}

let equityChart = null;

function renderEquityCurve() {
    const caption = document.getElementById("equityCurveCaption");
    const noteEl = document.getElementById("equityCurveNote");
    const blended = blendEquityCurves(equityCurveData, settings.pct);

    if (equityChart) { equityChart.destroy(); equityChart = null; }

    if (!blended) {
        noteEl.textContent = "";
        caption.textContent = "Za mało zapisanej historii rebalansów, żeby pokazać wykres — rośnie z każdym miesięcznym uruchomieniem pipeline'u.";
        return;
    }

    noteEl.textContent = `${blended.dates[0]} → ${blended.dates[blended.dates.length - 1]}`;

    equityChart = new Chart(document.getElementById("equityCurveChart"), {
        type: "line",
        data: {
            labels: blended.dates,
            datasets: [
                { label: "Twoje portfolio (wg podziału na indeksy)", data: blended.portfolio, borderColor: "#2ecc71", backgroundColor: "transparent", pointRadius: 0, borderWidth: 2 },
                { label: "Kup i trzymaj te same indeksy", data: blended.benchmark, borderColor: "#8a8f9c", backgroundColor: "transparent", pointRadius: 0, borderWidth: 2, borderDash: [4, 3] },
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

    caption.textContent = "Wynik historyczny (zrealizowany) selekcji momentum w Twoim podziale kapitału między indeksy, "
        + "vs. 'kup i trzymaj' te same indeksy. To NIE jest historia konkretnie Twoich pozycji (tych nie śledzimy wstecz), "
        + "tylko przybliżenie na bazie zapisanych rebalansów. Dane informacyjne, NIE prognoza ani porada inwestycyjna — "
        + "wyniki z przeszłości nie gwarantują przyszłych zwrotów.";
}

// ============================================================
// MONTE CARLO — statystyczny rozrzut możliwych wartości portfela,
// NIE prognoza. mu/sigma to ważona średnia (wagą = target_value)
// 12M momentum i rocznej zmienności obecnie wybranych spółek —
// uproszczenie ignorujące korelacje między nimi (zwykle zawyża
// pokazaną zmienność, więc pasmo jest raczej szersze niż węższe).
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
    // Symulacja obejmuje tylko część aktywnie zarządzaną przez momentum —
    // wykluczone pozycje mają inną charakterystykę ryzyka/zwrotu, więc
    // nie da się ich uczciwie opisać tym samym mu/sigma.
    const investableCapital = Math.max(0, targetCapital() - excludedHoldingsValue());
    const { targets } = computeTargets(investableCapital);
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
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y)}` } },
            },
            scales: {
                x: { ticks: { color: "#8a8f9c", maxTicksLimit: 8 }, grid: { color: "#262a35" } },
                y: { ticks: { color: "#8a8f9c", callback: fmtMoney }, grid: { color: "#262a35" } },
            },
        },
    });

    let caption_text = `Symulacja obejmuje kapitał zarządzany przez momentum: ${fmtMoney(investableCapital)}. `
        + `Założenia: oczekiwany zwrot ${(mu * 100).toFixed(1)}%/rok `
        + `(śr. ważona 12M momentum wybranych spółek, ograniczona do ±${MC_MU_CAP * 100}%/rok żeby uniknąć ekstrapolacji `
        + `chwilowych skoków), zmienność ${(sigma * 100).toFixed(1)}%/rok (śr. ważona zmienności rocznej), 300 symulowanych `
        + `ścieżek. Pasmo = zakres 10.–90. percentyla. To NIE jest prognoza ani porada inwestycyjna — pokazuje statystyczny `
        + `rozrzut przy założeniu, że przeszła zmienność i momentum się utrzymają, co nie jest gwarantowane.`;
    caption.textContent = caption_text;
}

function renderAll() {
    renderBucketSum();
    renderHoldingsTable();
    renderSuggestions(); // wywołuje też renderMonteCarlo()
    renderEquityCurve();
}

// typeof document check: pozwala wczytać ten plik przez `require()` w testach
// Node (patrz tests/js/) bez uruchamiania inicjalizacji strony — w przeglądarce
// document zawsze istnieje, więc zachowanie się nie zmienia.
if (typeof document !== "undefined") {
    (async function init() {
        await loadUniverseData();
        portfolioTags = loadPortfolioTags(); // świeże tagi z Portfolio przy każdym otwarciu strony
        initSettingsForm();
        initHoldingsForm();
        initXtbImport();
        initTvExport();
        initExcludeForm();
        renderExcludedList();
        renderCoreTaggedList();
        document.getElementById("mcHorizon").addEventListener("change", renderMonteCarlo);
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
        fmtMoney, fmtQty, sharesSuggestion,
        computeTargets, parseXtbOpenPositions,
        weightedMuSigma, simulateMonteCarlo, randNormal,
        blendEquityCurves,
        isCoreTagged, coreTaggedTickers,
        tvSymbolFor, buildTvPortfolioCsv, xtbDateToIso,
        // Testy potrzebują ustawić moduł-poziomu stan (universeData/settings/excluded)
        // bez importu przez window — to jedyny sposób bez przepisywania modułu na klasę.
        _setState(s) {
            if (s.universeData !== undefined) universeData = s.universeData;
            if (s.settings !== undefined) settings = s.settings;
            if (s.excluded !== undefined) excluded = s.excluded;
            if (s.portfolioTags !== undefined) portfolioTags = s.portfolioTags;
            if (s.holdings !== undefined) holdings = s.holdings;
            if (s.priceMap !== undefined) priceMap = s.priceMap;
        },
    };
}
