
// Panel PORTFOLIO — buduje docelowy portfel wg strategii Core-Satellite:
// Core = stabilny, szeroko zdywersyfikowany rdzeń (całe strategie momentum
// Nasdaq 100 / Dow Jones, albo pojedyncze "blue chipy"), Satelita = mniejsza,
// bardziej skoncentrowana część na sektorowe ETF-y lub pojedyncze spółki
// wysokiego przekonania, z capem na pojedynczą pozycję (% całego kapitału),
// żeby jedna obstawiona spółka nie zdominowała ryzyka portfela — to
// standardowa konwencja tej strategii (por. Google Finance/Trading 212
// "pies": relatywne wagi w obrębie koszyka, znormalizowane do 100%).
//
// Core ograniczony do Nasdaq 100 / Dow Jones (USD) z tego samego powodu co
// w rebalance.js — WIG20/mWIG40 nie mają realnej wagi fmc_etf do selekcji/
// ważenia całym uniwersum, a mieszanie PLN w USD-owy split wymagałoby FX,
// którego tu nie ma. Pojedyncze tickery (Core "blue chip" i Satelita) mogą
// być dowolne — jeśli są w priceMap (all_prices.json), cena podciąga się
// automatycznie; jeśli nie (np. sektorowy ETF spoza śledzonych indeksów),
// user wpisuje cenę ręcznie.

const CORE_UNIVERSES = ["NASDAQ100", "DOWJONES"];
const UNIVERSE_LABELS = { NASDAQ100: "Nasdaq 100", DOWJONES: "Dow Jones" };
const PLN_UNIVERSES = new Set(["WIG20", "MWIG40"]);

const SETTINGS_KEY = "momentum_portfolio_settings";
const CORE_KEY = "momentum_portfolio_core_slots";
const SATELLITE_KEY = "momentum_portfolio_satellite_slots";

// baseValue = wartość portfela w chwili ostatniego importu z XTB (pozycje +
// wolna gotówka) — albo wpisana ręcznie, jeśli nie importujesz. contribution
// = dopłata, którą wpisujesz na bieżąco (jak w Rebalansie) — to jedyne pole,
// które w praktyce dotykasz po pierwszym imporcie.
const DEFAULT_SETTINGS = { baseValue: 0, contribution: 10000, corePct: 80, satelliteCapPct: 5 };
const DEFAULT_CORE_SLOTS = [
    { type: "universe", id: "NASDAQ100", weightPct: 1 },
    { type: "universe", id: "DOWJONES", weightPct: 1 },
];
const IMPORT_META_KEY = "momentum_portfolio_import_meta";

let universeData = {}; // { NASDAQ100: {...json}, DOWJONES: {...json} }
let priceMap = {};     // ticker -> { price, sources: [universe,...] }

function loadJSON(key, fallback) {
    try {
        const v = JSON.parse(localStorage.getItem(key));
        return v === null || v === undefined ? fallback : v;
    } catch (e) { return fallback; }
}
function saveJSON(key, v) { localStorage.setItem(key, JSON.stringify(v)); }

function loadSettings() { return { ...DEFAULT_SETTINGS, ...loadJSON(SETTINGS_KEY, {}) }; }
function saveSettings(s) { saveJSON(SETTINGS_KEY, s); }
function loadCoreSlots() { return loadJSON(CORE_KEY, DEFAULT_CORE_SLOTS.map(s => ({ ...s }))); }
function saveCoreSlots(s) { saveJSON(CORE_KEY, s); }
function loadSatelliteSlots() { return loadJSON(SATELLITE_KEY, []); }
function saveSatelliteSlots(s) { saveJSON(SATELLITE_KEY, s); }
function loadImportMeta() { return loadJSON(IMPORT_META_KEY, null); }
function saveImportMeta(m) { saveJSON(IMPORT_META_KEY, m); }

let settings = loadSettings();
let coreSlots = loadCoreSlots();
let satelliteSlots = loadSatelliteSlots();
let importMeta = loadImportMeta(); // { importedAt, positionsCount, positionsValue, cash, unresolvedTickers } | null

function totalCapital() { return (settings.baseValue || 0) + (settings.contribution || 0); }

async function loadPortfolioData() {
    universeData = {};
    for (const u of CORE_UNIVERSES) {
        try {
            const res = await fetch(`data/${u.toLowerCase()}.json`, { cache: "no-store" });
            universeData[u] = await res.json();
        } catch (e) {
            universeData[u] = { universe: u, ref_date: null, constituents: [] };
        }
    }
    priceMap = {};
    try {
        const res = await fetch("data/all_prices.json", { cache: "no-store" });
        const allPrices = await res.json();
        Object.entries(allPrices).forEach(([ticker, info]) => {
            priceMap[ticker] = { price: info.price, sources: info.universes };
        });
    } catch (e) { /* brak pliku — priceMap uzupełni się niżej z list momentum */ }
    CORE_UNIVERSES.forEach(u => {
        (universeData[u].constituents || []).forEach(c => {
            if (!priceMap[c.ticker]) priceMap[c.ticker] = { price: c.price, sources: [u] };
        });
    });
}

function fmtMoney(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtQty(n) {
    return (Math.round(n * 1000) / 1000).toString().replace(".", ",");
}
function fmtPct(n) {
    return (Math.round(n * 100) / 100).toFixed(2) + "%";
}

function isPln(ticker) {
    const sources = priceMap[ticker]?.sources || [];
    return sources.some(u => PLN_UNIVERSES.has(u));
}
function fmtPrice(ticker, price) {
    if (price === null || price === undefined) return "—";
    return isPln(ticker) ? `${price.toFixed(2)} zł` : `$${price.toFixed(2)}`;
}

// ============================================================
// WAGI WZGLĘDNE ("pie slice" jak w Trading 212) — dowolne dodatnie liczby
// w obrębie koszyka, automatycznie znormalizowane do 100% tego koszyka.
// ============================================================
function normalizeWeights(relWeights) {
    const total = relWeights.reduce((s, w) => s + Math.max(0, w || 0), 0);
    if (total <= 0) return relWeights.map(() => 0);
    return relWeights.map(w => Math.max(0, w || 0) / total);
}

// ============================================================
// CORE — całe uniwersa momentum (ważone wewnętrznie ich własną wagą
// momentum, jak w rebalance.js::computeTargets) i/lub pojedyncze
// "blue chip" tickery, każdy jako jeden slot o relatywnej wadze.
// ============================================================
function computeCoreTargets(coreCapital, slots, univData, prices) {
    const raw = {};
    if (coreCapital <= 0 || !slots || slots.length === 0) return raw;

    const norm = normalizeWeights(slots.map(s => s.weightPct));
    slots.forEach((slot, i) => {
        const slotCapital = coreCapital * norm[i];
        if (slotCapital <= 0) return;

        if (slot.type === "universe") {
            const constituents = ((univData[slot.id] || {}).constituents || []);
            const totalRawWeight = constituents.reduce((s, c) => s + (c.weight_pct || 0), 0);
            if (totalRawWeight <= 0) return;
            constituents.forEach(c => {
                const w = (c.weight_pct || 0) / totalRawWeight;
                const contrib = slotCapital * w;
                if (!raw[c.ticker]) {
                    raw[c.ticker] = { ticker: c.ticker, price: c.price, target_value: 0, sources: [], bucket: "core" };
                }
                raw[c.ticker].target_value += contrib;
                if (!raw[c.ticker].sources.includes(UNIVERSE_LABELS[slot.id])) raw[c.ticker].sources.push(UNIVERSE_LABELS[slot.id]);
            });
        } else if (slot.type === "ticker" && slot.id) {
            const ticker = slot.id;
            const price = slot.manualPrice ?? prices[ticker]?.price ?? null;
            if (!raw[ticker]) raw[ticker] = { ticker, price, target_value: 0, sources: [], bucket: "core" };
            raw[ticker].target_value += slotCapital;
            if (!raw[ticker].sources.includes("blue chip")) raw[ticker].sources.push("blue chip");
        }
    });
    return raw;
}

// ============================================================
// CAP + REDYSTRYBUCJA — żadna pojedyncza satelita nie może przekroczyć
// `capValue` (np. 5% CAŁEGO portfela); nadwyżka rozdzielana iteracyjnie
// na pozostałe pozycje, analogicznie do compute_weights w run_query.py.
// Gdy sam limit matematycznie nie mieści `pool` w `ids.length` pozycjach
// (cap*n < pool), cap jest proporcjonalnie podnoszony (tu: równy split) —
// odpowiednik `cap_scaled_due_to_infeasibility`.
// ============================================================
function capAndRedistribute(ids, weightOf, pool, capValue) {
    const values = {};
    if (pool <= 0 || !ids || ids.length === 0) return { values, cappedIds: new Set(), infeasible: false };
    const effectiveCap = capValue > 0 ? capValue : pool;

    if (effectiveCap * ids.length < pool - 1e-9) {
        const eq = pool / ids.length;
        ids.forEach(id => { values[id] = eq; });
        return { values, cappedIds: new Set(ids), infeasible: true };
    }

    let remaining = ids.slice();
    let remainingPool = pool;
    const cappedIds = new Set();
    while (remaining.length > 0) {
        const sumW = remaining.reduce((s, id) => s + Math.max(0, weightOf[id] || 0), 0);
        if (sumW <= 0) {
            const eq = remainingPool / remaining.length;
            remaining.forEach(id => { values[id] = eq; });
            break;
        }
        const overCapped = remaining.filter(id => (remainingPool * Math.max(0, weightOf[id] || 0) / sumW) > effectiveCap + 1e-9);
        if (overCapped.length === 0) {
            remaining.forEach(id => { values[id] = remainingPool * Math.max(0, weightOf[id] || 0) / sumW; });
            break;
        }
        overCapped.forEach(id => {
            values[id] = effectiveCap;
            cappedIds.add(id);
            remainingPool -= effectiveCap;
        });
        remaining = remaining.filter(id => !overCapped.includes(id));
    }
    return { values, cappedIds, infeasible: false };
}

// ============================================================
// SATELITA — lista dowolnych tickerów, każdy jako jeden slot o relatywnej
// wadze w obrębie budżetu satelity, po capie liczonym od CAŁEGO kapitału.
// ============================================================
function computeSatelliteTargets(satelliteCapital, slots, satelliteCapPct, totalCapital, prices) {
    const rows = {};
    const validSlots = (slots || []).filter(s => s.ticker);
    if (satelliteCapital <= 0 || validSlots.length === 0) return { rows, infeasible: false };

    const ids = validSlots.map(s => s.ticker);
    const weightOf = {};
    validSlots.forEach(s => { weightOf[s.ticker] = Math.max(0, s.weightPct || 0); });

    const capValue = totalCapital * (satelliteCapPct / 100);
    const { values, cappedIds, infeasible } = capAndRedistribute(ids, weightOf, satelliteCapital, capValue);

    validSlots.forEach(s => {
        const price = s.manualPrice ?? prices[s.ticker]?.price ?? null;
        rows[s.ticker] = {
            ticker: s.ticker, price, target_value: values[s.ticker] || 0,
            sources: [s.label || "satelita"], bucket: "satellite", capped: cappedIds.has(s.ticker),
        };
    });
    return { rows, infeasible };
}

// ============================================================
// IMPORT Z RAPORTU XTB — inicjalizuje CAŁY portfel (Core + Satelita) z
// realnych pozycji zamiast budować go od zera: arkusz "Open Positions" daje
// tickery/wolumeny (+ wartość/cenę, jeśli raport ją zawiera), reszta arkuszy
// jest przeszukiwana pod kątem wolnej gotówki (etykiety typu "Free funds",
// "Wolne środki", "Balance"). Każdy import ZASTĘPUJE obecne sloty Core/
// Satelita — jak import w Rebalansie zastępuje listę pozycji.
// ============================================================
function findColIndex(header, patterns) {
    for (const p of patterns) {
        const idx = header.findIndex(h => p.test(String(h || "")));
        if (idx !== -1) return idx;
    }
    return -1;
}

// Wiersze transakcji składowych (Type = "BUY"/"SELL") są pomijane — ich suma
// to właśnie wiersz podsumowania pozycji (pusta kolumna "Type").
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
    // Wartość/cena pozycji — różne warianty raportu XTB nazywają te kolumny
    // różnie; próbujemy po kolei najbardziej wiarygodne źródło wyceny.
    const idxMarketValue = findColIndex(header, [/market\s*value/i, /wartość\s*rynkowa/i]);
    const idxMarketPrice = findColIndex(header, [/market\s*price/i, /cena\s*rynkowa/i, /current\s*price/i]);
    const idxOpenPrice = findColIndex(header, [/open\s*price/i, /cena\s*otwarcia/i, /purchase\s*price/i]);

    const imported = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        const ticker = String(r[idxTicker] || "").trim();
        const type = String(r[idxType] || "").trim();
        const volume = parseFloat(r[idxVolume]);
        if (!ticker || type || !volume) continue; // pomijamy wiersze transakcji i puste

        let value = null;
        if (idxMarketValue !== -1 && !isNaN(parseFloat(r[idxMarketValue]))) {
            value = parseFloat(r[idxMarketValue]);
        } else if (idxMarketPrice !== -1 && !isNaN(parseFloat(r[idxMarketPrice]))) {
            value = parseFloat(r[idxMarketPrice]) * volume;
        } else if (idxOpenPrice !== -1 && !isNaN(parseFloat(r[idxOpenPrice]))) {
            value = parseFloat(r[idxOpenPrice]) * volume;
        }
        imported.push({ ticker: ticker.split(".")[0].toUpperCase(), shares: volume, value });
    }
    return imported;
}

// Skanuje WSZYSTKIE arkusze raportu w poszukiwaniu etykiety wolnej gotówki
// (np. "Free funds" / "Wolne środki" / "Balance") i bierze pierwszą liczbę
// na prawo od niej. Heurystyka — różne eksporty XTB różnie nazywają i
// rozmieszczają to pole, dlatego wynik jest zawsze pokazywany do potwierdzenia
// / ręcznej korekty, nigdy wpisywany po cichu.
const CASH_LABEL_RE = /free\s*funds|available\s*funds|wolne\s*środki|dostępne\s*środki|cash\b|gotówka|balance\b|saldo/i;
function parseXtbCash(workbook) {
    for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
        for (const row of rows) {
            for (let c = 0; c < row.length; c++) {
                if (!CASH_LABEL_RE.test(String(row[c] || ""))) continue;
                for (let k = c + 1; k < row.length; k++) {
                    if (row[k] === "") continue;
                    const v = parseFloat(row[k]);
                    if (!isNaN(v)) return v;
                }
            }
        }
    }
    return null;
}

function classifyTicker(ticker, univData) {
    for (const u of CORE_UNIVERSES) {
        if (((univData[u] || {}).constituents || []).some(c => c.ticker === ticker)) return u;
    }
    return null;
}

// Buduje sloty Core/Satelita wprost z zaimportowanych pozycji: waga każdego
// slotu = jego wyceniona wartość $ (relatywne wagi normalizują się same, więc
// to od razu odwzorowuje realny obecny podział). Tickery ze śledzonych
// indeksów (Nasdaq 100 / Dow Jones) trafiają do Core, reszta do Satelity —
// user może to później ręcznie poprawić (przenieść, dodać, usunąć).
function buildSlotsFromImport(positions, univData, prices) {
    const core = [];
    const satellite = [];
    const unresolvedTickers = [];
    let totalValue = 0;

    positions.forEach(p => {
        const trackedPrice = prices[p.ticker]?.price;
        let value = p.value;
        if (value === null || value === undefined) {
            value = trackedPrice != null ? trackedPrice * p.shares : null;
        }
        if (value === null) unresolvedTickers.push(p.ticker);
        totalValue += value || 0;

        // Cena znana z priceMap -> zostawiamy jej bieżące śledzenie (manualPrice
        // pominięty). Cena wynika tylko z wartości podanej w raporcie XTB (ticker
        // spoza śledzonych indeksów) -> zapisujemy ją jako manualPrice, żeby dało
        // się policzyć liczbę sztuk. Brak jakiejkolwiek wyceny -> user uzupełni ręcznie.
        let manualPrice;
        if (trackedPrice != null) manualPrice = undefined;
        else if (value !== null) manualPrice = value / p.shares;
        else manualPrice = null;

        const weightPct = value !== null ? value : Math.max(p.shares, 0.01);
        if (classifyTicker(p.ticker, univData)) {
            core.push({ type: "ticker", id: p.ticker, weightPct, manualPrice });
        } else {
            satellite.push({ ticker: p.ticker, weightPct, manualPrice });
        }
    });
    return { core, satellite, totalValue, unresolvedTickers };
}

function resetPortfolio() {
    settings = { ...DEFAULT_SETTINGS };
    coreSlots = DEFAULT_CORE_SLOTS.map(s => ({ ...s }));
    satelliteSlots = [];
    importMeta = null;
    saveSettings(settings);
    saveCoreSlots(coreSlots);
    saveSatelliteSlots(satelliteSlots);
    saveImportMeta(importMeta);
}

// ============================================================
// UI
// ============================================================
function initSettingsForm() {
    document.getElementById("pfBaseValue").value = settings.baseValue || "";
    document.getElementById("pfContribution").value = settings.contribution || "";
    document.getElementById("pfCoreSlider").value = settings.corePct;
    document.getElementById("pfSatCap").value = settings.satelliteCapPct;
    updateSplitLabel();
    renderImportSummary();

    const onChange = () => {
        settings.baseValue = parseFloat(document.getElementById("pfBaseValue").value) || 0;
        settings.contribution = parseFloat(document.getElementById("pfContribution").value) || 0;
        settings.corePct = parseInt(document.getElementById("pfCoreSlider").value, 10);
        settings.satelliteCapPct = parseFloat(document.getElementById("pfSatCap").value) || 0;
        saveSettings(settings);
        updateSplitLabel();
        renderAll();
    };
    document.getElementById("pfBaseValue").addEventListener("input", onChange);
    document.getElementById("pfContribution").addEventListener("input", onChange);
    document.getElementById("pfCoreSlider").addEventListener("input", onChange);
    document.getElementById("pfSatCap").addEventListener("input", onChange);
}

function updateSplitLabel() {
    const capital = totalCapital();
    const corePct = settings.corePct;
    const satPct = 100 - corePct;
    document.getElementById("pfSplitLabel").textContent =
        `Core: ${corePct}% (${fmtMoney(capital * corePct / 100)}) · Satelita: ${satPct}% (${fmtMoney(capital * satPct / 100)})`;
}

function renderImportSummary() {
    const el = document.getElementById("importSummary");
    if (!importMeta) { el.textContent = ""; return; }
    el.textContent = `Ostatni import: ${importMeta.importedAt} — ${importMeta.positionsCount} pozycji `
        + `(~${fmtMoney(importMeta.positionsValue)}) + gotówka ${fmtMoney(importMeta.cash)}`
        + (importMeta.unresolvedTickers.length ? `. Brak ceny dla: ${importMeta.unresolvedTickers.join(", ")} — uzupełnij ręcznie w tabelach poniżej.` : "");
}

// ---------- CORE SLOTS ----------
function renderCoreSlots() {
    document.getElementById("coreUniverseNASDAQ100").checked = coreSlots.some(s => s.type === "universe" && s.id === "NASDAQ100");
    document.getElementById("coreUniverseDOWJONES").checked = coreSlots.some(s => s.type === "universe" && s.id === "DOWJONES");

    const norm = normalizeWeights(coreSlots.map(s => s.weightPct));
    const tbody = document.getElementById("coreSlotsBody");
    tbody.innerHTML = "";
    coreSlots.forEach((slot, i) => {
        const label = slot.type === "universe" ? `${UNIVERSE_LABELS[slot.id]} (cały koszyk momentum)` : slot.id;
        const priceKnown = slot.type === "universe" || priceMap[slot.id]?.price != null;
        const priceCell = slot.type === "universe"
            ? '<span class="text-faint">wg momentum</span>'
            : (priceKnown
                ? fmtPrice(slot.id, priceMap[slot.id].price)
                : `<input type="number" class="slot-manual-price" min="0" step="0.01" value="${slot.manualPrice ?? ""}" placeholder="cena $">`);
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${label}</td>
            <td class="slot-price">${priceCell}</td>
            <td><input type="number" class="slot-weight" min="0" step="0.1" value="${slot.weightPct}"></td>
            <td>${fmtPct(norm[i] * 100)}</td>
            <td><button class="remove-row-btn" title="Usuń">✕</button></td>
        `;
        if (slot.type === "ticker" && !priceKnown) {
            tr.querySelector(".slot-manual-price").addEventListener("input", (e) => {
                coreSlots[i].manualPrice = parseFloat(e.target.value) || null;
                saveCoreSlots(coreSlots);
                renderResults();
            });
        }
        tr.querySelector(".slot-weight").addEventListener("input", (e) => {
            coreSlots[i].weightPct = parseFloat(e.target.value) || 0;
            saveCoreSlots(coreSlots);
            renderAll();
        });
        tr.querySelector(".remove-row-btn").addEventListener("click", () => {
            coreSlots.splice(i, 1);
            saveCoreSlots(coreSlots);
            renderAll();
        });
        tbody.appendChild(tr);
    });
    document.getElementById("coreEmpty").style.display = coreSlots.length === 0 ? "block" : "none";
}

function toggleCoreUniverse(universe, checked) {
    if (checked) {
        if (!coreSlots.some(s => s.type === "universe" && s.id === universe)) {
            coreSlots.push({ type: "universe", id: universe, weightPct: 1 });
        }
    } else {
        coreSlots = coreSlots.filter(s => !(s.type === "universe" && s.id === universe));
    }
    saveCoreSlots(coreSlots);
    renderAll();
}

function initCoreForm() {
    document.getElementById("coreUniverseNASDAQ100").addEventListener("change", (e) => toggleCoreUniverse("NASDAQ100", e.target.checked));
    document.getElementById("coreUniverseDOWJONES").addEventListener("change", (e) => toggleCoreUniverse("DOWJONES", e.target.checked));

    const input = document.getElementById("corePickInput");
    const status = document.getElementById("corePickStatus");
    document.getElementById("corePickAddBtn").addEventListener("click", () => {
        const ticker = input.value.trim().toUpperCase();
        input.value = "";
        status.textContent = "";
        if (!ticker) return;
        if (coreSlots.some(s => s.type === "ticker" && s.id === ticker)) {
            status.textContent = `${ticker} jest już w Core.`;
            return;
        }
        if (!priceMap[ticker]) status.textContent = `${ticker} nie jest w śledzonych indeksach — podaj cenę ręcznie w tabeli poniżej.`;
        coreSlots.push({ type: "ticker", id: ticker, weightPct: 1 });
        saveCoreSlots(coreSlots);
        renderAll();
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("corePickAddBtn").click(); } });
}

// ---------- SATELLITE SLOTS ----------
function renderSatelliteSlots() {
    const norm = normalizeWeights(satelliteSlots.map(s => s.weightPct));
    const tbody = document.getElementById("satelliteSlotsBody");
    tbody.innerHTML = "";
    satelliteSlots.forEach((slot, i) => {
        const priceKnown = priceMap[slot.ticker]?.price != null;
        const priceCell = priceKnown
            ? fmtPrice(slot.ticker, priceMap[slot.ticker].price)
            : `<input type="number" class="slot-manual-price" min="0" step="0.01" value="${slot.manualPrice ?? ""}" placeholder="cena $">`;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${slot.ticker}${isPln(slot.ticker) ? ' <span class="text-faint">(PLN)</span>' : ""}</td>
            <td class="slot-price">${priceCell}</td>
            <td><input type="number" class="slot-weight" min="0" step="0.1" value="${slot.weightPct}"></td>
            <td>${fmtPct(norm[i] * 100)}</td>
            <td><button class="remove-row-btn" title="Usuń">✕</button></td>
        `;
        if (!priceKnown) {
            tr.querySelector(".slot-manual-price").addEventListener("input", (e) => {
                satelliteSlots[i].manualPrice = parseFloat(e.target.value) || null;
                saveSatelliteSlots(satelliteSlots);
                renderResults();
            });
        }
        tr.querySelector(".slot-weight").addEventListener("input", (e) => {
            satelliteSlots[i].weightPct = parseFloat(e.target.value) || 0;
            saveSatelliteSlots(satelliteSlots);
            renderAll();
        });
        tr.querySelector(".remove-row-btn").addEventListener("click", () => {
            satelliteSlots.splice(i, 1);
            saveSatelliteSlots(satelliteSlots);
            renderAll();
        });
        tbody.appendChild(tr);
    });
    document.getElementById("satelliteEmpty").style.display = satelliteSlots.length === 0 ? "block" : "none";
}

function initSatelliteForm() {
    const input = document.getElementById("satellitePickInput");
    const status = document.getElementById("satellitePickStatus");
    document.getElementById("satellitePickAddBtn").addEventListener("click", () => {
        const ticker = input.value.trim().toUpperCase();
        input.value = "";
        status.textContent = "";
        if (!ticker) return;
        if (satelliteSlots.some(s => s.ticker === ticker)) {
            status.textContent = `${ticker} jest już w Satelicie.`;
            return;
        }
        satelliteSlots.push({ ticker, weightPct: 1 });
        saveSatelliteSlots(satelliteSlots);
        renderAll();
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("satellitePickAddBtn").click(); } });
}

// ---------- IMPORT XTB / RESET ----------
function initXtbImport() {
    document.getElementById("xtbFile").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        const status = document.getElementById("importStatus");
        if (!file) return;
        try {
            const buf = await file.arrayBuffer();
            const workbook = XLSX.read(buf, { type: "array" });
            const positions = parseXtbOpenPositions(workbook);
            if (positions.length === 0) throw new Error("Nie znaleziono żadnych otwartych pozycji w raporcie.");
            const cash = parseXtbCash(workbook);
            const cashValue = cash ?? 0;

            const { core, satellite, totalValue, unresolvedTickers } = buildSlotsFromImport(positions, universeData, priceMap);
            const baseValue = totalValue + cashValue;
            const coreValue = core.reduce((s, x) => s + x.weightPct, 0);
            const satValue = satellite.reduce((s, x) => s + x.weightPct, 0);
            const observedCorePct = (coreValue + satValue) > 0 ? Math.round(coreValue / (coreValue + satValue) * 100) : settings.corePct;

            const summaryLines = [
                `${positions.length} pozycji, wartość ~${fmtMoney(totalValue)}`,
                cash !== null ? `wolna gotówka: ${fmtMoney(cash)} (wykryta automatycznie — sprawdź, czy się zgadza)` : "wolnej gotówki NIE wykryto automatycznie — dopisz ją ręcznie po imporcie",
                `obserwowany podział Core/Satelita: ${observedCorePct}% / ${100 - observedCorePct}%`,
            ];
            if (unresolvedTickers.length) summaryLines.push(`brak ceny dla: ${unresolvedTickers.join(", ")} — uzupełnisz ręcznie w tabeli`);

            const ok = confirm(`Zaimportować z XTB? To ZASTĄPI obecne pozycje Core/Satelita.\n\n${summaryLines.join("\n")}`);
            if (!ok) { status.textContent = "Import anulowany."; return; }

            coreSlots = core;
            satelliteSlots = satellite;
            settings.baseValue = Math.round(baseValue * 100) / 100;
            settings.contribution = 0;
            settings.corePct = observedCorePct;
            importMeta = {
                importedAt: new Date().toLocaleDateString("pl-PL"),
                positionsCount: positions.length,
                positionsValue: totalValue,
                cash: cashValue,
                unresolvedTickers,
            };
            saveSettings(settings);
            saveCoreSlots(coreSlots);
            saveSatelliteSlots(satelliteSlots);
            saveImportMeta(importMeta);

            document.getElementById("pfBaseValue").value = settings.baseValue;
            document.getElementById("pfContribution").value = settings.contribution;
            document.getElementById("pfCoreSlider").value = settings.corePct;
            updateSplitLabel();
            renderImportSummary();
            renderAll();
            status.textContent = `Zaimportowano ${positions.length} pozycji z XTB — od teraz wystarczy uzupełniać tylko dopłatę.`;
        } catch (err) {
            status.textContent = `Błąd importu: ${err.message}`;
        } finally {
            e.target.value = "";
        }
    });
}

function initResetButton() {
    document.getElementById("resetPortfolioBtn").addEventListener("click", () => {
        const ok = confirm("Zresetować portfolio? Usunie to obecny import, wszystkie pozycje Core/Satelita i wagi — wrócisz do stanu początkowego.");
        if (!ok) return;
        resetPortfolio();
        document.getElementById("pfBaseValue").value = settings.baseValue || "";
        document.getElementById("pfContribution").value = settings.contribution || "";
        document.getElementById("pfCoreSlider").value = settings.corePct;
        document.getElementById("pfSatCap").value = settings.satelliteCapPct;
        document.getElementById("importStatus").textContent = "Portfolio zresetowane.";
        updateSplitLabel();
        renderImportSummary();
        renderAll();
    });
}

// ---------- WYNIK ----------
let portfolioChart = null;

function renderResults() {
    const capital = totalCapital();
    const coreCapital = capital * settings.corePct / 100;
    const satelliteCapital = capital * (100 - settings.corePct) / 100;

    const coreTargets = computeCoreTargets(coreCapital, coreSlots, universeData, priceMap);
    const { rows: satelliteTargets, infeasible } = computeSatelliteTargets(satelliteCapital, satelliteSlots, settings.satelliteCapPct, capital, priceMap);

    const allRows = [...Object.values(coreTargets), ...Object.values(satelliteTargets)]
        .filter(r => r.target_value > 0)
        .sort((a, b) => (a.bucket === b.bucket ? b.target_value - a.target_value : (a.bucket === "core" ? -1 : 1)));

    const tbody = document.getElementById("portfolioBody");
    tbody.innerHTML = "";
    document.getElementById("portfolioEmpty").style.display = allRows.length === 0 ? "block" : "none";

    allRows.forEach(r => {
        const weightPct = capital > 0 ? (r.target_value / capital * 100) : 0;
        const bucketBadge = r.bucket === "core"
            ? `<span class="action-badge core">CORE</span>`
            : `<span class="action-badge satellite">SATELITA${r.capped ? " · CAP" : ""}</span>`;
        const shares = r.price ? `${fmtQty(r.target_value / r.price)} szt.` : `<span class="text-faint">brak ceny</span>`;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="ticker-cell">${r.ticker}</td>
            <td>${bucketBadge}</td>
            <td>${r.sources.join(" + ")}</td>
            <td>${fmtPct(weightPct)}</td>
            <td>${fmtMoney(r.target_value)}</td>
            <td>${fmtPrice(r.ticker, r.price)}</td>
            <td>${shares}</td>
        `;
        tbody.appendChild(tr);
    });

    const coreTotal = Object.values(coreTargets).reduce((s, r) => s + r.target_value, 0);
    const satTotal = Object.values(satelliteTargets).reduce((s, r) => s + r.target_value, 0);
    document.getElementById("statCapital").textContent = fmtMoney(capital);
    document.getElementById("statCoreValue").textContent = fmtMoney(coreTotal);
    document.getElementById("statSatelliteValue").textContent = fmtMoney(satTotal);
    document.getElementById("statPositionsCount").textContent = allRows.length;

    const capNote = document.getElementById("satCapNote");
    capNote.textContent = infeasible
        ? `Uwaga: przy tylu pozycjach cap ${settings.satelliteCapPct}% nie mieści budżetu satelity — wagi rozłożono po równo (cap efektywnie podniesiony).`
        : "";

    renderPortfolioChart(allRows, capital);
}

function renderPortfolioChart(rows, capital) {
    const canvas = document.getElementById("portfolioChart");
    if (portfolioChart) { portfolioChart.destroy(); portfolioChart = null; }
    if (!canvas || rows.length === 0 || capital <= 0) return;

    const coreRows = rows.filter(r => r.bucket === "core");
    const satRows = rows.filter(r => r.bucket === "satellite");
    const greenShades = ["#2ecc71", "#26a65b", "#1f8b4d", "#3fd98a", "#17693b"];
    const amberShades = ["#e0a13b", "#e0455a", "#c77b1f", "#f2b95c", "#a83f52"];

    const labels = [], data = [], colors = [];
    coreRows.forEach((r, i) => { labels.push(`${r.ticker} (Core)`); data.push(r.target_value); colors.push(greenShades[i % greenShades.length]); });
    satRows.forEach((r, i) => { labels.push(`${r.ticker} (Satelita)`); data.push(r.target_value); colors.push(amberShades[i % amberShades.length]); });

    portfolioChart = new Chart(canvas, {
        type: "doughnut",
        data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: "#14161c", borderWidth: 2 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "right", labels: { color: "#8a8f9c", boxWidth: 10, font: { size: 10 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${fmtMoney(ctx.parsed)} (${(ctx.parsed / capital * 100).toFixed(1)}%)` } },
            },
        },
    });
}

function renderAll() {
    renderCoreSlots();
    renderSatelliteSlots();
    renderResults();
}

// typeof document check: pozwala wczytać ten plik przez `require()` w testach
// Node (patrz tests/js/) bez uruchamiania inicjalizacji strony.
if (typeof document !== "undefined") {
    (async function init() {
        await loadPortfolioData();
        initSettingsForm();
        initCoreForm();
        initSatelliteForm();
        initXtbImport();
        initResetButton();
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
        normalizeWeights, computeCoreTargets, capAndRedistribute, computeSatelliteTargets,
        fmtMoney, fmtQty, fmtPct,
        parseXtbOpenPositions, parseXtbCash, classifyTicker, buildSlotsFromImport,
    };
}
