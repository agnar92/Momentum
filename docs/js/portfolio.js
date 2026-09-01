
// Panel PORTFOLIO — buduje docelowy portfel wg strategii Core-Satellite:
// Core = stabilny, szeroko zdywersyfikowany rdzeń (całe strategie momentum
// Nasdaq 100 / Dow Jones, albo pojedyncze "blue chipy"), Satelita = mniejsza,
// bardziej skoncentrowana część na sektorowe ETF-y lub pojedyncze spółki
// wysokiego przekonania, z capem na pojedynczą pozycję (% całego kapitału),
// żeby jedna obstawiona spółka nie zdominowała ryzyka portfela — to
// standardowa konwencja tej strategii (por. Google Finance/Trading 212
// "pies": relatywne wagi w obrębie koszyka, znormalizowane do 100%).
//
// Pozycje NIE są importowane tu osobno — Portfolio czyta te same holdingi
// (ticker + liczba akcji), które już zaimportowałeś/aś z XTB w Rebalansie
// (localStorage klucz momentum_rebalance_holdings, WŁASNOŚĆ rebalance.js —
// portfolio.js go tylko czyta, nigdy nie zapisuje). Każdy holding dostaje tu
// tag Core/Satelita (momentum_portfolio_tags), który rebalance.js z kolei
// odczytuje, żeby wykluczyć Core-owe pozycje z sugestii kupna/sprzedaży
// momentum — dokładnie tak samo jak ręczne wykluczenie w Rebalansie, bo
// semantyka jest ta sama: "to trzymam długoterminowo, nie ruszaj tego".
//
// Core ograniczony do Nasdaq 100 / Dow Jones (USD) z tego samego powodu co
// w rebalance.js — WIG20/mWIG40 nie mają realnej wagi fmc_etf do selekcji/
// ważenia całym uniwersum, a mieszanie PLN w USD-owy split wymagałoby FX,
// którego tu nie ma — to dotyczy tylko domyślnej klasyfikacji nowych
// holdingów i całych koszyków momentum; pojedyncze tickery (blue chip,
// satelita) mogą być dowolne. Jeśli są w priceMap (all_prices.json), cena
// podciąga się automatycznie; jeśli nie (np. sektorowy ETF albo GPW-owa
// spółka spoza śledzonych indeksów), user wpisuje cenę ręcznie.

const CORE_UNIVERSES = ["NASDAQ100", "DOWJONES"];
const UNIVERSE_LABELS = { NASDAQ100: "Nasdaq 100", DOWJONES: "Dow Jones" };
const PLN_UNIVERSES = new Set(["WIG20", "MWIG40"]);

const SETTINGS_KEY = "momentum_portfolio_settings";
const CORE_KEY = "momentum_portfolio_core_slots";
const SATELLITE_KEY = "momentum_portfolio_satellite_slots";
const TAGS_KEY = "momentum_portfolio_tags";
const HOLDINGS_KEY = "momentum_rebalance_holdings"; // własność rebalance.js — tu tylko odczyt

// contribution = dopłata, którą wpisujesz na bieżąco (jak w Rebalansie);
// wartość obecnego portfela liczy się automatycznie z otagowanych holdingów.
const DEFAULT_SETTINGS = { contribution: 10000, corePct: 80, satelliteCapPct: 5 };
const DEFAULT_CORE_SLOTS = [
    { type: "universe", id: "NASDAQ100", weightPct: 1 },
    { type: "universe", id: "DOWJONES", weightPct: 1 },
];

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
function loadTags() { return loadJSON(TAGS_KEY, {}); }
function saveTags(t) { saveJSON(TAGS_KEY, t); }
function loadHoldings() { return loadJSON(HOLDINGS_KEY, []); }

let settings = loadSettings();
let coreSlots = loadCoreSlots();
let satelliteSlots = loadSatelliteSlots();
let tags = loadTags();

// Wartość slotu pochodzącego z realnego holdingu liczymy zawsze na bieżąco
// z ceny*sztuk (nigdy nie zapisujemy jej jako static weightPct, żeby nie
// robiła się nieaktualna) — ręcznie dodane "planowane" pozycje mają wprost
// wpisaną relatywną wagę, bo nie mają liczby sztuk.
function slotValue(slot, ticker, prices) {
    if (slot.fromHolding) {
        const price = slot.manualPrice ?? prices[ticker]?.price ?? null;
        return price != null ? price * (slot.shares || 0) : 0;
    }
    return Math.max(0, slot.weightPct || 0);
}

function currentHoldingsValue() {
    return [...coreSlots, ...satelliteSlots]
        .filter(s => s.fromHolding)
        .reduce((sum, s) => sum + slotValue(s, s.id || s.ticker, priceMap), 0);
}

function totalCapital() { return currentHoldingsValue() + (settings.contribution || 0); }

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

    const norm = normalizeWeights(slots.map(s => slotValue(s, s.id, prices)));
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
            const label = slot.fromHolding ? "Twoja pozycja" : "blue chip";
            if (!raw[ticker]) raw[ticker] = { ticker, price, target_value: 0, sources: [], bucket: "core" };
            raw[ticker].target_value += slotCapital;
            if (!raw[ticker].sources.includes(label)) raw[ticker].sources.push(label);
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
    validSlots.forEach(s => { weightOf[s.ticker] = slotValue(s, s.ticker, prices); });

    const capValue = totalCapital * (satelliteCapPct / 100);
    const { values, cappedIds, infeasible } = capAndRedistribute(ids, weightOf, satelliteCapital, capValue);

    validSlots.forEach(s => {
        const price = s.manualPrice ?? prices[s.ticker]?.price ?? null;
        rows[s.ticker] = {
            ticker: s.ticker, price, target_value: values[s.ticker] || 0,
            sources: [s.fromHolding ? "Twoja pozycja" : "satelita"], bucket: "satellite", capped: cappedIds.has(s.ticker),
        };
    });
    return { rows, infeasible };
}

// ============================================================
// SYNC Z REBALANSEM — holdingi (ticker + liczba akcji) są własnością
// rebalance.js (import z XTB dzieje się tam); tu tylko czytamy je i
// utrzymujemy dla każdego swój slot Core/Satelita zgodnie z tagiem usera.
// Ręcznie dodane "planowane" pozycje (jeszcze nie kupione blue chipy/
// satelity — patrz initCoreForm/initSatelliteForm) są oznaczone brakiem
// `fromHolding` i sync ich nie rusza.
// ============================================================
function classifyTicker(ticker, univData) {
    for (const u of CORE_UNIVERSES) {
        if (((univData[u] || {}).constituents || []).some(c => c.ticker === ticker)) return u;
    }
    return null;
}
function defaultTagFor(ticker, univData) { return classifyTicker(ticker, univData) ? "core" : "satellite"; }

// Zwraca nowe { coreSlots, satelliteSlots, tags } — czyste, testowalne bez
// dotykania modułowego stanu ani localStorage.
function syncSlotsFromHoldings(holdings, prevCoreSlots, prevSatelliteSlots, prevTags, univData, prices) {
    const existingByTicker = {};
    [...prevCoreSlots, ...prevSatelliteSlots].forEach(s => {
        if (s.fromHolding) existingByTicker[s.id || s.ticker] = s;
    });

    const manualCore = prevCoreSlots.filter(s => !s.fromHolding);
    const manualSatellite = prevSatelliteSlots.filter(s => !s.fromHolding);
    const newTags = { ...prevTags };
    const currentTickers = new Set();
    const newCore = [];
    const newSatellite = [];

    holdings.forEach(h => {
        if (!h.ticker) return;
        currentTickers.add(h.ticker);
        const prev = existingByTicker[h.ticker];
        const manualPrice = prev ? prev.manualPrice : (prices[h.ticker]?.price != null ? undefined : null);
        if (!newTags[h.ticker]) newTags[h.ticker] = defaultTagFor(h.ticker, univData);

        if (newTags[h.ticker] === "core") {
            newCore.push({ type: "ticker", id: h.ticker, shares: h.shares || 0, manualPrice, fromHolding: true });
        } else {
            newSatellite.push({ ticker: h.ticker, shares: h.shares || 0, manualPrice, fromHolding: true });
        }
    });

    // Tagi pozycji, których już nie ma w Rebalansie (sprzedane) — usuwamy,
    // to martwe wpisy bez żadnego holdingu za sobą.
    Object.keys(newTags).forEach(t => { if (!currentTickers.has(t)) delete newTags[t]; });

    return { coreSlots: [...manualCore, ...newCore], satelliteSlots: [...manualSatellite, ...newSatellite], tags: newTags };
}

function refreshFromHoldings() {
    const result = syncSlotsFromHoldings(loadHoldings(), coreSlots, satelliteSlots, tags, universeData, priceMap);
    coreSlots = result.coreSlots;
    satelliteSlots = result.satelliteSlots;
    tags = result.tags;
    saveCoreSlots(coreSlots);
    saveSatelliteSlots(satelliteSlots);
    saveTags(tags);
}

function setHoldingTag(ticker, tag) {
    tags[ticker] = tag;
    saveTags(tags);
    refreshFromHoldings();
}

function setHoldingManualPrice(ticker, price) {
    [...coreSlots, ...satelliteSlots].forEach(s => {
        if ((s.id || s.ticker) === ticker && s.fromHolding) s.manualPrice = price;
    });
    saveCoreSlots(coreSlots);
    saveSatelliteSlots(satelliteSlots);
}

// Resetuje tagi i "planowane" pozycje do stanu początkowego — Twoje
// rzeczywiste holdingi (z Rebalansu) zostają nietknięte, dostają tylko
// domyślną klasyfikację Core/Satelita od nowa.
function resetPortfolio() {
    settings = { ...DEFAULT_SETTINGS };
    tags = {};
    coreSlots = DEFAULT_CORE_SLOTS.map(s => ({ ...s }));
    satelliteSlots = [];
    saveSettings(settings);
    saveTags(tags);
    saveCoreSlots(coreSlots);
    saveSatelliteSlots(satelliteSlots);
    refreshFromHoldings();
}

// ============================================================
// UI
// ============================================================
function initSettingsForm() {
    document.getElementById("pfContribution").value = settings.contribution || "";
    document.getElementById("pfCoreSlider").value = settings.corePct;
    document.getElementById("pfSatCap").value = settings.satelliteCapPct;
    updateSplitLabel();

    const onChange = () => {
        settings.contribution = parseFloat(document.getElementById("pfContribution").value) || 0;
        settings.corePct = parseInt(document.getElementById("pfCoreSlider").value, 10);
        settings.satelliteCapPct = parseFloat(document.getElementById("pfSatCap").value) || 0;
        saveSettings(settings);
        updateSplitLabel();
        renderAll();
    };
    document.getElementById("pfContribution").addEventListener("input", onChange);
    document.getElementById("pfCoreSlider").addEventListener("input", onChange);
    document.getElementById("pfSatCap").addEventListener("input", onChange);
}

function updateSplitLabel() {
    const capital = totalCapital();
    const corePct = settings.corePct;
    const satPct = 100 - corePct;
    document.getElementById("statCurrentHoldingsValue").textContent = fmtMoney(currentHoldingsValue());
    document.getElementById("pfSplitLabel").textContent =
        `Core: ${corePct}% (${fmtMoney(capital * corePct / 100)}) · Satelita: ${satPct}% (${fmtMoney(capital * satPct / 100)})`;
}

// ---------- TWOJE POZYCJE (z Rebalansu) ----------
function renderHoldingsTagTable() {
    const holdings = loadHoldings().filter(h => h.ticker);
    const tbody = document.getElementById("holdingsTagBody");
    tbody.innerHTML = "";
    document.getElementById("holdingsTagEmpty").style.display = holdings.length === 0 ? "block" : "none";

    holdings.forEach(h => {
        const slot = [...coreSlots, ...satelliteSlots].find(s => (s.id || s.ticker) === h.ticker && s.fromHolding);
        const tag = tags[h.ticker] || "satellite";
        const priceKnown = priceMap[h.ticker]?.price != null;
        const price = slot?.manualPrice ?? priceMap[h.ticker]?.price ?? null;
        const value = price != null ? price * (h.shares || 0) : null;
        const priceCell = priceKnown
            ? fmtPrice(h.ticker, priceMap[h.ticker].price)
            : `<input type="number" class="slot-manual-price" min="0" step="0.01" value="${slot?.manualPrice ?? ""}" placeholder="cena $">`;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="ticker-cell">${h.ticker}${isPln(h.ticker) ? ' <span class="text-faint">(PLN)</span>' : ""}</td>
            <td>${fmtQty(h.shares || 0)}</td>
            <td class="slot-price">${priceCell}</td>
            <td>${value !== null ? fmtMoney(value) : "—"}</td>
            <td>
                <button class="tag-btn core ${tag === "core" ? "active" : ""}" data-tag="core">CORE</button>
                <button class="tag-btn satellite ${tag === "satellite" ? "active" : ""}" data-tag="satellite">SATELITA</button>
            </td>
        `;
        if (!priceKnown) {
            tr.querySelector(".slot-manual-price").addEventListener("input", (e) => {
                setHoldingManualPrice(h.ticker, parseFloat(e.target.value) || null);
                renderResults();
            });
        }
        tr.querySelectorAll(".tag-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                setHoldingTag(h.ticker, btn.dataset.tag);
                renderAll();
            });
        });
        tbody.appendChild(tr);
    });
}

function initRefreshButton() {
    document.getElementById("refreshHoldingsBtn").addEventListener("click", () => {
        refreshFromHoldings();
        document.getElementById("importStatus").textContent = "Zaktualizowano z Rebalansu.";
        renderAll();
    });
}

// ---------- CORE SLOTS (ręcznie dodane "planowane" pozycje) ----------
function renderCoreSlots() {
    document.getElementById("coreUniverseNASDAQ100").checked = coreSlots.some(s => s.type === "universe" && s.id === "NASDAQ100");
    document.getElementById("coreUniverseDOWJONES").checked = coreSlots.some(s => s.type === "universe" && s.id === "DOWJONES");

    const manualSlots = coreSlots.filter(s => !s.fromHolding);
    const norm = normalizeWeights(manualSlots.map(s => s.weightPct));
    const tbody = document.getElementById("coreSlotsBody");
    tbody.innerHTML = "";
    manualSlots.forEach((slot, i) => {
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
                slot.manualPrice = parseFloat(e.target.value) || null;
                saveCoreSlots(coreSlots);
                renderResults();
            });
        }
        tr.querySelector(".slot-weight").addEventListener("input", (e) => {
            slot.weightPct = parseFloat(e.target.value) || 0;
            saveCoreSlots(coreSlots);
            renderAll();
        });
        tr.querySelector(".remove-row-btn").addEventListener("click", () => {
            coreSlots.splice(coreSlots.indexOf(slot), 1);
            saveCoreSlots(coreSlots);
            renderAll();
        });
        tbody.appendChild(tr);
    });
    document.getElementById("coreEmpty").style.display = manualSlots.length === 0 ? "block" : "none";
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
        if (loadHoldings().some(h => h.ticker === ticker)) {
            status.textContent = `${ticker} jest już w Twoich pozycjach — otaguj go w tabeli "Twoje pozycje" powyżej.`;
            return;
        }
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

// ---------- SATELLITE SLOTS (ręcznie dodane "planowane" pozycje) ----------
function renderSatelliteSlots() {
    const manualSlots = satelliteSlots.filter(s => !s.fromHolding);
    const norm = normalizeWeights(manualSlots.map(s => s.weightPct));
    const tbody = document.getElementById("satelliteSlotsBody");
    tbody.innerHTML = "";
    manualSlots.forEach((slot, i) => {
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
                slot.manualPrice = parseFloat(e.target.value) || null;
                saveSatelliteSlots(satelliteSlots);
                renderResults();
            });
        }
        tr.querySelector(".slot-weight").addEventListener("input", (e) => {
            slot.weightPct = parseFloat(e.target.value) || 0;
            saveSatelliteSlots(satelliteSlots);
            renderAll();
        });
        tr.querySelector(".remove-row-btn").addEventListener("click", () => {
            satelliteSlots.splice(satelliteSlots.indexOf(slot), 1);
            saveSatelliteSlots(satelliteSlots);
            renderAll();
        });
        tbody.appendChild(tr);
    });
    document.getElementById("satelliteEmpty").style.display = manualSlots.length === 0 ? "block" : "none";
}

function initSatelliteForm() {
    const input = document.getElementById("satellitePickInput");
    const status = document.getElementById("satellitePickStatus");
    document.getElementById("satellitePickAddBtn").addEventListener("click", () => {
        const ticker = input.value.trim().toUpperCase();
        input.value = "";
        status.textContent = "";
        if (!ticker) return;
        if (loadHoldings().some(h => h.ticker === ticker)) {
            status.textContent = `${ticker} jest już w Twoich pozycjach — otaguj go w tabeli "Twoje pozycje" powyżej.`;
            return;
        }
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

function initResetButton() {
    document.getElementById("resetPortfolioBtn").addEventListener("click", () => {
        const ok = confirm("Zresetować portfolio? Usunie to tagi Core/Satelita i wszystkie ręcznie dodane planowane pozycje — Twoje holdingi z Rebalansu zostaną nietknięte, dostaną tylko domyślną klasyfikację od nowa.");
        if (!ok) return;
        resetPortfolio();
        document.getElementById("pfContribution").value = settings.contribution || "";
        document.getElementById("pfCoreSlider").value = settings.corePct;
        document.getElementById("pfSatCap").value = settings.satelliteCapPct;
        document.getElementById("importStatus").textContent = "Portfolio zresetowane.";
        updateSplitLabel();
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
    renderHoldingsTagTable();
    renderCoreSlots();
    renderSatelliteSlots();
    updateSplitLabel();
    renderResults();
}

// typeof document check: pozwala wczytać ten plik przez `require()` w testach
// Node (patrz tests/js/) bez uruchamiania inicjalizacji strony.
if (typeof document !== "undefined") {
    (async function init() {
        await loadPortfolioData();
        refreshFromHoldings(); // podciąga aktualne holdingi z Rebalansu przy każdym otwarciu strony
        initSettingsForm();
        initCoreForm();
        initSatelliteForm();
        initRefreshButton();
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
        classifyTicker, defaultTagFor, syncSlotsFromHoldings, slotValue,
    };
}
