
const UNIVERSES = ["NASDAQ100", "DOWJONES", "WIG20", "MWIG40"];
const UNIVERSE_LABELS = { NASDAQ100: "Nasdaq 100", DOWJONES: "Dow Jones", WIG20: "WIG20", MWIG40: "mWIG40" };
const TRADE_THRESHOLD_PCT = 0.005; // pomijamy sugestie mniejsze niż 0.5% kapitału docelowego

// Rebalans liczy DWA niezależne portfele obok siebie: USA (Nasdaq 100 + Dow
// Jones, USD) i GPW (WIG20 + mWIG40, PLN) — patrz CLAUDE.md: mieszanie
// PLN-owego kapitału z USD-owym w jednej puli/wadze wymagałoby FX, którego
// tu nie ma. Trzymając je jako dwie osobne sekcje (osobna dopłata, TOP N,
// sugestia, Monte Carlo, wykres historyczny — każde po swojej stronie)
// unikamy w ogóle potrzeby przewalutowania: nic nigdy nie sumuje PLN i USD
// razem. Holdingi (ticker + liczba akcji) i lista wykluczeń zostają
// WSPÓLNE — to jedna lista pozycji użytkownika, tylko dzielona wg
// regionOf(ticker) na potrzeby każdej sekcji z osobna.
const REGIONS = {
    USA: { label: "USA", currency: "USD", universes: ["NASDAQ100", "DOWJONES"] },
    GPW: { label: "GPW", currency: "PLN", universes: ["WIG20", "MWIG40"] },
};
const REGION_LIST = ["USA", "GPW"];

const SETTINGS_KEY = "momentum_rebalance_settings";
const HOLDINGS_KEY = "momentum_rebalance_holdings";
const EXCLUDED_KEY = "momentum_rebalance_excluded";
const DEFAULT_SETTINGS = {
    regions: {
        USA: { contribution: 0, topN: { NASDAQ100: 5, DOWJONES: 5 } },
        GPW: { contribution: 0, topN: { WIG20: 5, MWIG40: 5 } },
    },
};

let universeData = {};   // { NASDAQ100: {...json}, ... }
let priceMap = {};       // ticker -> { price, sources: [universe,...] }
let equityCurveData = {}; // { NASDAQ100: {dates, momentum_index, benchmark_index, ...}, ... }

// Scala zapisane ustawienia z DEFAULT_SETTINGS per-region (nie płytkim spread
// na całym obiekcie) — inaczej brakujący klucz `regions.GPW` w starym zapisie
// (sprzed dodania sekcji GPW) zgubiłby też domyślny `topN` dla NASDAQ100/
// DOWJONES, zamiast tylko dostać świeże wartości domyślne dla GPW.
function loadSettings() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { stored = {}; }
    const merged = { regions: {} };
    REGION_LIST.forEach(region => {
        const storedRegion = (stored.regions && stored.regions[region]) || {};
        merged.regions[region] = {
            ...DEFAULT_SETTINGS.regions[region],
            ...storedRegion,
            topN: { ...DEFAULT_SETTINGS.regions[region].topN, ...(storedRegion.topN || {}) },
        };
    });
    return merged;
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

function fmtMoneyPln(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}

function moneyFmtFor(region) { return REGIONS[region]?.currency === "PLN" ? fmtMoneyPln : fmtMoney; }

function fmtQty(n) {
    return (Math.round(n * 1000) / 1000).toString().replace(".", ",");
}

// Ile sztuk (ułamkowo) kupić/sprzedać za daną kwotę. `moneyFmt` domyślnie $
// (fmtMoney) — sekcja GPW przekazuje fmtMoneyPln, żeby kwota w opisie
// sugestii pokazywała się w złotówkach, nie dolarach.
function sharesSuggestion(dollarAmount, price, moneyFmt = fmtMoney) {
    if (!price) return `~${moneyFmt(dollarAmount)} (brak ceny do przeliczenia na sztuki)`;
    const qty = dollarAmount / price;
    return `${fmtQty(qty)} szt. (~${moneyFmt(dollarAmount)})`;
}

// Region (USA/GPW) danego tickera — na podstawie tego, w jakim uniwersum go
// znaleziono (patrz priceMap/all_prices.json). Nieznany ticker (spoza
// śledzonych indeksów) domyślnie trafia do USA — tak jak wcześniej
// tvSymbolFor domyślnie zakładał NASDAQ dla nierozpoznanych tickerów.
function regionOf(ticker) {
    const sources = priceMap[ticker]?.sources || [];
    return sources.some(u => REGIONS.GPW.universes.includes(u)) ? "GPW" : "USA";
}

function regionHoldingsValue(region) {
    return holdings.reduce((sum, h) => {
        if (!h.ticker || regionOf(h.ticker) !== region) return sum;
        const price = priceMap[h.ticker]?.price;
        return sum + (price ? price * (h.shares || 0) : 0);
    }, 0);
}

function regionTargetCapital(region) {
    return regionHoldingsValue(region) + (settings.regions[region].contribution || 0);
}

// Wartość pozycji wykluczonych z rebalansu w danym regionie — ten kapitał
// zostaje "poza systemem": nie liczy się do puli, którą alokujemy na spółki
// momentum tego regionu.
function regionExcludedValue(region) {
    return holdings.reduce((sum, h) => {
        if (!h.ticker || regionOf(h.ticker) !== region || !excluded.includes(h.ticker)) return sum;
        const price = priceMap[h.ticker]?.price;
        return sum + (price ? price * (h.shares || 0) : 0);
    }, 0);
}

// Liczba akcji trzymanych w danym regionie, zgrupowana po tickerze.
function regionHoldingShares(region) {
    const shares = {};
    holdings.forEach(h => {
        if (h.ticker && regionOf(h.ticker) === region) shares[h.ticker] = (shares[h.ticker] || 0) + (h.shares || 0);
    });
    return shares;
}

// ============================================================
// WYKLUCZENIA — spółki, których panel nigdy nie ma sugerować kupić ani
// sprzedać, nawet jeśli je importujesz z XTB albo wybierze je momentum.
// Lista jest WSPÓLNA dla obu regionów (to zbiór tickerów, nie kwot).
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
            renderRegions();
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
        renderRegions();
    };
    document.getElementById("excludeAddBtn").addEventListener("click", addTicker);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addTicker(); } });
}

// ============================================================
// USTAWIENIA (per region — osobna dopłata i TOP N dla USA i GPW)
// ============================================================
function initSettingsForm(region) {
    const regionSettings = settings.regions[region];
    document.getElementById(`contribution-${region}`).value = regionSettings.contribution || "";
    REGIONS[region].universes.forEach(u => { document.getElementById(`topn-${u}`).value = regionSettings.topN[u]; });

    const onChange = () => {
        regionSettings.contribution = parseFloat(document.getElementById(`contribution-${region}`).value) || 0;
        REGIONS[region].universes.forEach(u => {
            regionSettings.topN[u] = parseInt(document.getElementById(`topn-${u}`).value, 10) || 0;
        });
        saveSettings(settings);
        renderRegion(region);
    };
    document.getElementById(`contribution-${region}`).addEventListener("input", onChange);
    REGIONS[region].universes.forEach(u => document.getElementById(`topn-${u}`).addEventListener("input", onChange));
}

// ============================================================
// POZYCJE (holdings) — dodajesz/usuwasz akcje kiedy chcesz, bez ograniczeń.
// WSPÓLNA lista dla USA i GPW: jeden ticker, jedna liczba akcji, region
// wynika z regionOf(ticker) — nie ma osobnego pola "region" na wierszu.
// ============================================================
// Odświeża tylko kolumny Cena/Wartość dla jednego wiersza — bez przebudowy
// inputów, żeby nie tracić fokusu/kursora w trakcie pisania.
function refreshHoldingRowCells(tr, h) {
    const price = priceMap[h.ticker]?.price ?? null;
    const value = price !== null ? price * (h.shares || 0) : null;
    const moneyFmt = moneyFmtFor(regionOf(h.ticker));
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
            renderRegions();
        });
        tr.querySelector(".h-shares").addEventListener("input", (e) => {
            holdings[i].shares = parseFloat(e.target.value) || 0;
            saveHoldings(holdings);
            refreshHoldingRowCells(tr, holdings[i]);
            renderRegions();
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
    return regionOf(ticker) === "GPW" ? `GPW:${ticker}` : `NASDAQ:${ticker}`;
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

function renderCapitalHint(region) {
    const moneyFmt = moneyFmtFor(region);
    const current = regionHoldingsValue(region);
    const contribution = settings.regions[region].contribution || 0;
    let text = `Masz teraz ${moneyFmt(current)} w akcjach + dopłata ${moneyFmt(contribution)} = kapitał docelowy ${moneyFmt(current + contribution)}`;
    const excludedValue = regionExcludedValue(region);
    if (excludedValue > 0) {
        text += ` (z czego ${moneyFmt(excludedValue)} w wykluczonych pozycjach — nie bierze udziału w rebalansie)`;
    }
    document.getElementById(`capitalHint-${region}`).textContent = text;
}

// ============================================================
// SUGESTIA REBALANSU (to tylko sugestia — Ty decydujesz co i kiedy kupić/sprzedać)
// ============================================================
// TOP N spółek indeksu `u` wg wagi momentum ({universe}.json jest już
// posortowany malejąco wg weight_pct, patrz run_query.py::export_json) —
// ręcznie wykluczone znikają z listy całkowicie, więc TOP N liczy się z
// tego, co zostaje (tak jakby wykluczone nigdy nie były w indeksie).
function selectedConstituents(region, u) {
    const topN = settings.regions[region].topN[u] || 0;
    if (topN <= 0) return [];
    return (universeData[u].constituents || [])
        .filter(c => !excluded.includes(c.ticker))
        .slice(0, topN);
}

// Udział każdego indeksu w łącznej wadze momentum wszystkich wybranych TOP N
// spółek tego regionu razem — używany tylko do wagowania wykresu "Wynik
// historyczny" (blendEquityCurves), tak żeby odzwierciedlał faktyczny
// podział kapitału wynikający z TOP N + wag momentum, skoro nie ma osobno
// ustawianego %.
function universeWeightSharePct(region) {
    const totals = {};
    let grandTotal = 0;
    REGIONS[region].universes.forEach(u => {
        totals[u] = selectedConstituents(region, u).reduce((s, c) => s + (c.weight_pct || 0), 0);
        grandTotal += totals[u];
    });
    const pct = {};
    REGIONS[region].universes.forEach(u => { pct[u] = grandTotal > 0 ? (totals[u] / grandTotal) * 100 : 0; });
    return pct;
}

// Zwraca: { targets: {ticker: {...}} }. Portfel danego regionu = TOP N
// spółek z każdego jego indeksu (patrz selectedConstituents), bez osobnego
// globalnego limitu — wagi dobierane są automatycznie z ich wagi momentum w
// pliku JSON, znormalizowanej do 100% łącznie w obrębie regionu (nie osobno
// per indeks), więc indeks z silniejszym momentum swoich TOP N spółek
// dostaje większą część kapitału tego regionu bez ręcznego ustawiania %.
function computeTargets(region, totalCapital) {
    const raw = {}; // ticker -> { ticker, price, target_value, raw_weight, universes: [] }

    REGIONS[region].universes.forEach(u => {
        selectedConstituents(region, u).forEach(c => {
            if (!raw[c.ticker]) {
                raw[c.ticker] = {
                    ticker: c.ticker, price: c.price, target_value: 0, raw_weight: 0, universes: [],
                    momentum_pct: c.momentum_pct, volatility_pct: c.volatility_pct,
                };
            }
            raw[c.ticker].raw_weight += (c.weight_pct || 0);
            raw[c.ticker].universes.push(u);
        });
    });

    const totalRawWeight = Object.values(raw).reduce((s, t) => s + t.raw_weight, 0);
    if (totalRawWeight > 0 && totalCapital > 0) {
        Object.values(raw).forEach(t => { t.target_value = totalCapital * (t.raw_weight / totalRawWeight); });
    }

    return { targets: raw };
}


function renderSuggestions(region) {
    const moneyFmt = moneyFmtFor(region);
    const totalCapital = regionTargetCapital(region);
    const excludedValue = regionExcludedValue(region);
    const investableCapital = Math.max(0, totalCapital - excludedValue);
    const { targets } = computeTargets(region, investableCapital);
    const threshold = Math.max(investableCapital * TRADE_THRESHOLD_PCT, 5);

    const holdingShares = regionHoldingShares(region);

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

    // Pozycje (tego regionu), które trzymasz, ale nie mieszczą się w
    // aktualnej sugestii — wykluczone ręcznie, albo poza TOP N (w indeksie,
    // ale niżej w rankingu momentum niż ustawione TOP N), albo w ogóle poza
    // śledzonymi indeksami tego regionu.
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
        const homeUniverse = REGIONS[region].universes.find(u => (universeData[u].constituents || []).some(c => c.ticker === ticker));
        const note = homeUniverse
            ? `poza TOP ${settings.regions[region].topN[homeUniverse] || 0} (${UNIVERSE_LABELS[homeUniverse]})`
            : "poza selekcją momentum";
        rows.push({
            ticker, note, target_value: 0, weight_pct: 0,
            current_value: currentValue, diff: currentValue !== null ? -currentValue : null, dropped: true,
            price, shares_held: holdingShares[ticker],
        });
    });

    rows.sort((a, b) => b.target_value - a.target_value);

    const tbody = document.getElementById(`rebalanceBody-${region}`);
    tbody.innerHTML = "";
    document.getElementById(`rebalanceEmpty-${region}`).style.display = (investableCapital <= 0 || rows.length === 0) ? "block" : "none";

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

    document.getElementById(`statCurrentValue-${region}`).textContent = moneyFmt(regionHoldingsValue(region));
    document.getElementById(`statTargetValue-${region}`).textContent = moneyFmt(totalCapital);
    document.getElementById(`statHoldingsCount-${region}`).textContent = Object.keys(targets).length;

    const refDates = REGIONS[region].universes.map(u => universeData[u].ref_date).filter(Boolean);
    document.getElementById(`refDateNote-${region}`).textContent = refDates.length
        ? `(wg rebalansu z ${refDates[0]} — kolejny automatycznie 1. dnia miesiąca)` : "";

    renderCapitalHint(region);
    renderMonteCarlo(region);
    renderPortfolioAnalysisChart(region);
}

// ============================================================
// ANALIZA PORTFELA — donut wykres podziału OBECNYCH pozycji tego regionu
// (nie sugestii docelowej) wg wartości, tak żeby na pierwszy rzut oka było
// widać, co faktycznie waży najwięcej w portfelu. Osobny wykres per region
// (USD i PLN nie da się zsumować w jednym bez FX) — pozycje bez znanej ceny
// (i bez ręcznie wpisanej) są pomijane, bo nie da się policzyć ich wartości.
// ============================================================
const portfolioAnalysisCharts = { USA: null, GPW: null };

function renderPortfolioAnalysisChart(region) {
    const canvas = document.getElementById(`portfolioAnalysisChart-${region}`);
    if (portfolioAnalysisCharts[region]) { portfolioAnalysisCharts[region].destroy(); portfolioAnalysisCharts[region] = null; }
    if (!canvas) return;

    const moneyFmt = moneyFmtFor(region);
    const holdingShares = regionHoldingShares(region);
    const rows = Object.entries(holdingShares)
        .map(([ticker, shares]) => ({ ticker, value: (priceMap[ticker]?.price || 0) * shares }))
        .filter(r => r.value > 0)
        .sort((a, b) => b.value - a.value);

    const total = rows.reduce((s, r) => s + r.value, 0);
    document.getElementById(`portfolioAnalysisEmpty-${region}`).style.display = rows.length === 0 ? "block" : "none";
    if (rows.length === 0 || total <= 0) return;

    const shades = ["#2ecc71", "#26a65b", "#1f8b4d", "#3fd98a", "#17693b", "#5be8a4", "#0f4d2c", "#7bf0bb", "#0a3a20", "#9df5cf"];
    portfolioAnalysisCharts[region] = new Chart(canvas, {
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
// WYNIK HISTORYCZNY PORTFOLIA — łączy per-uniwersowe equity curves (patrz
// run_query.py::compute_equity_curve, zbudowane z realnych zapisów
// portfolio_history) wg podziału kapitału między indeksy TEGO REGIONU,
// wynikającego z TOP N + wag momentum (universeWeightSharePct — nie ma
// osobno ustawianego %). blendEquityCurves() sam przefiltrowuje UNIVERSES do
// tych z pct > 0 — pct z universeWeightSharePct(region) ma klucze tylko dla
// indeksów tego regionu, więc indeksy drugiego regionu naturalnie wypadają
// (pct[u] undefined -> 0), bez potrzeby przekazywania osobnej listy
// uniwersów. To NIE jest historia Twoich konkretnych pozycji (tych nie
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

const equityCharts = { USA: null, GPW: null };

function renderEquityCurve(region) {
    const caption = document.getElementById(`equityCurveCaption-${region}`);
    const noteEl = document.getElementById(`equityCurveNote-${region}`);
    const blended = blendEquityCurves(equityCurveData, universeWeightSharePct(region));

    if (equityCharts[region]) { equityCharts[region].destroy(); equityCharts[region] = null; }

    if (!blended) {
        noteEl.textContent = "";
        caption.textContent = "Za mało zapisanej historii rebalansów, żeby pokazać wykres — rośnie z każdym miesięcznym uruchomieniem pipeline'u.";
        return;
    }

    noteEl.textContent = `${blended.dates[0]} → ${blended.dates[blended.dates.length - 1]}`;

    equityCharts[region] = new Chart(document.getElementById(`equityCurveChart-${region}`), {
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

    caption.textContent = "Wynik historyczny (zrealizowany) selekcji momentum w podziale kapitału między indeksy tego regionu, "
        + "vs. 'kup i trzymaj' te same indeksy. To NIE jest historia konkretnie Twoich pozycji (tych nie śledzimy wstecz), "
        + "tylko przybliżenie na bazie zapisanych rebalansów. Dane informacyjne, NIE prognoza ani porada inwestycyjna — "
        + "wyniki z przeszłości nie gwarantują przyszłych zwrotów.";
}

// ============================================================
// MONTE CARLO — statystyczny rozrzut możliwych wartości portfela (osobno per
// region — inna waluta, inny kapitał), NIE prognoza. mu/sigma to ważona
// średnia (wagą = target_value) 12M momentum i rocznej zmienności obecnie
// wybranych spółek — uproszczenie ignorujące korelacje między nimi (zwykle
// zawyża pokazaną zmienność, więc pasmo jest raczej szersze niż węższe).
// ============================================================
const mcCharts = { USA: null, GPW: null };

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

function renderMonteCarlo(region) {
    const moneyFmt = moneyFmtFor(region);
    // Symulacja obejmuje tylko część aktywnie zarządzaną przez momentum —
    // wykluczone pozycje mają inną charakterystykę ryzyka/zwrotu, więc
    // nie da się ich uczciwie opisać tym samym mu/sigma.
    const investableCapital = Math.max(0, regionTargetCapital(region) - regionExcludedValue(region));
    const { targets } = computeTargets(region, investableCapital);
    const horizon = parseInt(document.getElementById(`mcHorizon-${region}`).value, 10) || 12;
    const caption = document.getElementById(`mcCaption-${region}`);

    if (investableCapital <= 0 || Object.keys(targets).length === 0) {
        if (mcCharts[region]) { mcCharts[region].destroy(); mcCharts[region] = null; }
        caption.textContent = "Ustaw dopłatę / dodaj pozycje, żeby zobaczyć symulację.";
        return;
    }

    const { mu, sigma } = weightedMuSigma(targets, investableCapital);
    const { p10, p50, p90 } = simulateMonteCarlo(investableCapital, mu, sigma, horizon, 300);
    const labels = p50.map((_, i) => i === 0 ? "dziś" : `+${i} mies.`);

    if (mcCharts[region]) mcCharts[region].destroy();
    mcCharts[region] = new Chart(document.getElementById(`monteCarloChart-${region}`), {
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

    let caption_text = `Symulacja obejmuje kapitał zarządzany przez momentum: ${moneyFmt(investableCapital)}. `
        + `Założenia: oczekiwany zwrot ${(mu * 100).toFixed(1)}%/rok `
        + `(śr. ważona 12M momentum wybranych spółek, ograniczona do ±${MC_MU_CAP * 100}%/rok żeby uniknąć ekstrapolacji `
        + `chwilowych skoków), zmienność ${(sigma * 100).toFixed(1)}%/rok (śr. ważona zmienności rocznej), 300 symulowanych `
        + `ścieżek. Pasmo = zakres 10.–90. percentyla. To NIE jest prognoza ani porada inwestycyjna — pokazuje statystyczny `
        + `rozrzut przy założeniu, że przeszła zmienność i momentum się utrzymają, co nie jest gwarantowane.`;
    caption.textContent = caption_text;
}

// Odświeża całą sekcję jednego regionu (sugestia + Monte Carlo + analiza
// portfela + wykres historyczny — renderSuggestions woła te pierwsze trzy).
function renderRegion(region) {
    renderSuggestions(region);
    renderEquityCurve(region);
}

function renderRegions() {
    REGION_LIST.forEach(renderRegion);
}

function renderAll() {
    renderHoldingsTable();
    renderRegions();
}

// typeof document check: pozwala wczytać ten plik przez `require()` w testach
// Node (patrz tests/js/) bez uruchamiania inicjalizacji strony — w przeglądarce
// document zawsze istnieje, więc zachowanie się nie zmienia.
if (typeof document !== "undefined") {
    (async function init() {
        await loadUniverseData();
        REGION_LIST.forEach(initSettingsForm);
        initHoldingsForm();
        initXtbImport();
        initTvExport();
        initExcludeForm();
        renderExcludedList();
        REGION_LIST.forEach(region => {
            document.getElementById(`mcHorizon-${region}`).addEventListener("change", () => renderMonteCarlo(region));
        });
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
        REGIONS, REGION_LIST,
        fmtMoney, fmtMoneyPln, moneyFmtFor, fmtQty, sharesSuggestion,
        regionOf, computeTargets, universeWeightSharePct, parseXtbOpenPositions,
        weightedMuSigma, simulateMonteCarlo, randNormal,
        blendEquityCurves,
        tvSymbolFor, buildTvPortfolioCsv, xtbDateToIso,
        // Testy potrzebują ustawić moduł-poziomu stan (universeData/settings/excluded)
        // bez importu przez window — to jedyny sposób bez przepisywania modułu na klasę.
        _setState(s) {
            if (s.universeData !== undefined) universeData = s.universeData;
            if (s.settings !== undefined) settings = s.settings;
            if (s.excluded !== undefined) excluded = s.excluded;
            if (s.holdings !== undefined) holdings = s.holdings;
            if (s.priceMap !== undefined) priceMap = s.priceMap;
        },
    };
}
