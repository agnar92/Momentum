
const UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES"];
const UNIVERSE_LABELS = { SP500: "S&P 500", NASDAQ100: "Nasdaq 100", DOWJONES: "Dow Jones" };
const TRADE_THRESHOLD_PCT = 0.005; // pomijamy sugestie mniejsze niż 0.5% kapitału docelowego

const SETTINGS_KEY = "momentum_rebalance_settings";
const HOLDINGS_KEY = "momentum_rebalance_holdings";
const DEFAULT_SETTINGS = { contribution: 0, pct: { SP500: 60, NASDAQ100: 30, DOWJONES: 10 }, maxHoldings: 20 };

let universeData = {};   // { SP500: {...json}, ... }
let priceMap = {};       // ticker -> { price, sources: [universe,...] }

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

let settings = loadSettings();
let holdings = loadHoldings();

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

// ============================================================
// IMPORT Z RAPORTU XTB (arkusz "Open Positions") — wiersze podsumowania
// pozycji (jeden na ticker) mają pustą kolumnę "Type"; pojedyncze transakcje
// składowe (Type = "BUY"/"SELL") są pomijane, bo ich suma to właśnie wiersz
// podsumowania.
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

    const imported = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        const ticker = String(r[idxTicker] || "").trim();
        const type = String(r[idxType] || "").trim();
        const volume = parseFloat(r[idxVolume]);
        if (!ticker || type || !volume) continue; // pomijamy wiersze transakcji i puste
        imported.push({ ticker: ticker.split(".")[0].toUpperCase(), shares: volume });
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

function renderCapitalHint() {
    const current = currentHoldingsValue();
    const contribution = settings.contribution || 0;
    document.getElementById("capitalHint").textContent =
        `Masz teraz ${fmtMoney(current)} w akcjach + dopłata ${fmtMoney(contribution)} = kapitał docelowy ${fmtMoney(current + contribution)}`;
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
        if (pctAllocation <= 0) return; // Pomijamy indeksy z wagą 0% (np. SP500)

        const bucketTarget = totalCapital * (pctAllocation / 100);
        const constituents = universeData[u].constituents || [];

        // 1. Liczymy sumę wag surowych w pliku JSON dla tego indeksu
        const totalRawWeight = constituents.reduce((sum, c) => sum + (c.weight_pct || 0), 0);

        if (totalRawWeight > 0) {
            constituents.forEach(c => {
                // 2. Normalizujemy wagę spółki wewnątrz jej własnego koszyka do 100%
                const normalizedWeightInBucket = (c.weight_pct || 0) / totalRawWeight;
                // 3. Obliczamy jej realny przydział dolarowy z alokacji tego koszyka
                const contrib = bucketTarget * normalizedWeightInBucket;

                if (!raw[c.ticker]) {
                    raw[c.ticker] = { ticker: c.ticker, price: c.price, target_value: 0, universes: [] };
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
    const { targets, momentumSelected } = computeTargets(totalCapital);
    const threshold = Math.max(totalCapital * TRADE_THRESHOLD_PCT, 5);

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
            weight_pct: totalCapital ? (t.target_value / totalCapital * 100) : 0,
            current_value: currentValue,
            diff: t.target_value - currentValue,
            price: t.price,
            shares_held: shares,
        });
    });

    // Pozycje, które trzymasz, ale nie mieszczą się w aktualnej sugestii —
    // albo wypadły z selekcji momentum, albo są ponad Twój limit spółek.
    Object.keys(holdingShares).forEach(ticker => {
        if (targets[ticker]) return;
        const price = priceMap[ticker]?.price;
        const currentValue = price ? price * holdingShares[ticker] : null;
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
    document.getElementById("rebalanceEmpty").style.display = (totalCapital <= 0 || rows.length === 0) ? "block" : "none";

    rows.forEach(r => {
        let actionHtml;
        if (r.diff === null) {
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
}

function renderAll() {
    renderBucketSum();
    renderHoldingsTable();
    renderSuggestions();
}

(async function init() {
    await loadUniverseData();
    initSettingsForm();
    initHoldingsForm();
    initXtbImport();
    renderAll();
})();

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
