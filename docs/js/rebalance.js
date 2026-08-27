
const UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES"];
const UNIVERSE_LABELS = { SP500: "S&P 500", NASDAQ100: "Nasdaq 100", DOWJONES: "Dow Jones" };
const TRADE_THRESHOLD_PCT = 0.005; // pomijamy sugestie mniejsze niż 0.5% kapitału docelowego

const SETTINGS_KEY = "momentum_rebalance_settings";
const HOLDINGS_KEY = "momentum_rebalance_holdings";

let universeData = {};   // { SP500: {...json}, ... }
let priceMap = {};       // ticker -> { price, sources: [universe,...] }

function loadSettings() {
    try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { totalCapital: null, pct: { SP500: 60, NASDAQ100: 30, DOWJONES: 10 } };
    } catch (e) {
        return { totalCapital: null, pct: { SP500: 60, NASDAQ100: 30, DOWJONES: 10 } };
    }
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
    priceMap = {};
    for (const u of UNIVERSES) {
        (universeData[u].constituents || []).forEach(c => {
            if (!priceMap[c.ticker]) priceMap[c.ticker] = { price: c.price, sources: [] };
            priceMap[c.ticker].sources.push(u);
        });
    }
}

function fmtMoney(v) {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================
// USTAWIENIA
// ============================================================
function initSettingsForm() {
    document.getElementById("totalCapital").value = settings.totalCapital ?? "";
    UNIVERSES.forEach(u => {
        document.getElementById(`pct-${u}`).value = settings.pct[u];
    });

    const onChange = () => {
        settings.totalCapital = parseFloat(document.getElementById("totalCapital").value) || 0;
        UNIVERSES.forEach(u => {
            settings.pct[u] = parseFloat(document.getElementById(`pct-${u}`).value) || 0;
        });
        saveSettings(settings);
        renderBucketSum();
        renderSuggestions();
    };
    document.getElementById("totalCapital").addEventListener("input", onChange);
    UNIVERSES.forEach(u => document.getElementById(`pct-${u}`).addEventListener("input", onChange));
}

function renderBucketSum() {
    const sum = UNIVERSES.reduce((a, u) => a + (settings.pct[u] || 0), 0);
    const el = document.getElementById("bucketSum");
    el.textContent = `Suma: ${sum}%`;
    el.className = "bucket-sum" + (sum === 100 ? " ok" : " warn");
    if (sum !== 100) el.textContent += " — powinno wynosić 100%, żeby wykorzystać cały kapitał docelowy.";
}

// ============================================================
// POZYCJE (holdings)
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
            renderSuggestions();
        });
        tr.querySelector(".h-shares").addEventListener("input", (e) => {
            holdings[i].shares = parseFloat(e.target.value) || 0;
            saveHoldings(holdings);
            refreshHoldingRowCells(tr, holdings[i]);
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

function currentHoldingsValue() {
    return holdings.reduce((sum, h) => {
        const price = priceMap[h.ticker]?.price;
        return sum + (price ? price * (h.shares || 0) : 0);
    }, 0);
}

// ============================================================
// SUGESTIA REBALANSU
// ============================================================
function computeTargets() {
    const totalCapital = settings.totalCapital || 0;
    const targets = {}; // ticker -> { ticker, price, target_value, universes: [] }

    UNIVERSES.forEach(u => {
        const bucketTarget = totalCapital * (settings.pct[u] || 0) / 100;
        (universeData[u].constituents || []).forEach(c => {
            const contrib = bucketTarget * c.weight_pct / 100;
            if (!targets[c.ticker]) targets[c.ticker] = { ticker: c.ticker, price: c.price, target_value: 0, universes: [] };
            targets[c.ticker].target_value += contrib;
            targets[c.ticker].universes.push(u);
        });
    });
    return targets;
}

function renderSuggestions() {
    const targets = computeTargets();
    const totalCapital = settings.totalCapital || 0;
    const threshold = Math.max(totalCapital * TRADE_THRESHOLD_PCT, 5);

    const holdingShares = {};
    holdings.forEach(h => { if (h.ticker) holdingShares[h.ticker] = (holdingShares[h.ticker] || 0) + (h.shares || 0); });

    const rows = [];
    Object.values(targets).forEach(t => {
        const shares = holdingShares[t.ticker] || 0;
        const currentValue = t.price ? t.price * shares : 0;
        rows.push({
            ticker: t.ticker,
            universes: t.universes.map(u => UNIVERSE_LABELS[u]).join(" + "),
            target_value: t.target_value,
            weight_pct: totalCapital ? (t.target_value / totalCapital * 100) : 0,
            current_value: currentValue,
            diff: t.target_value - currentValue,
        });
    });

    // pozycje, które wypadły z listy momentum (trzeba sprzedać w całości)
    Object.keys(holdingShares).forEach(ticker => {
        if (targets[ticker]) return;
        const price = priceMap[ticker]?.price;
        const currentValue = price ? price * holdingShares[ticker] : null;
        rows.push({
            ticker, universes: "poza listą", target_value: 0, weight_pct: 0,
            current_value: currentValue, diff: currentValue !== null ? -currentValue : null, dropped: true,
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
            actionHtml = `<span class="action-badge sell">SPRZEDAJ CAŁOŚĆ (${fmtMoney(r.current_value)})</span>`;
        } else if (r.diff > threshold) {
            actionHtml = `<span class="action-badge buy">KUP ${fmtMoney(r.diff)}</span>`;
        } else if (r.diff < -threshold) {
            actionHtml = `<span class="action-badge sell">SPRZEDAJ ${fmtMoney(-r.diff)}</span>`;
        } else {
            actionHtml = `<span class="action-badge hold">TRZYMAJ</span>`;
        }
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="ticker-cell">${r.ticker}</td>
            <td>${r.universes}</td>
            <td>${r.weight_pct.toFixed(2)}%</td>
            <td>${fmtMoney(r.target_value)}</td>
            <td>${r.current_value !== null ? fmtMoney(r.current_value) : "—"}</td>
            <td>${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    // podsumowanie
    const currentVal = currentHoldingsValue();
    document.getElementById("statCurrentValue").textContent = fmtMoney(currentVal);
    document.getElementById("statTargetValue").textContent = fmtMoney(totalCapital);
    const cashDelta = totalCapital - currentVal;
    const cashEl = document.getElementById("statCashDelta");
    cashEl.textContent = (cashDelta >= 0 ? "+" : "") + fmtMoney(cashDelta);
    cashEl.className = "value " + (cashDelta >= 0 ? "positive" : "negative");

    const refDates = UNIVERSES.map(u => universeData[u].ref_date).filter(Boolean);
    document.getElementById("refDateNote").textContent = refDates.length
        ? `(wg rebalansu z ${refDates[0]} — kolejny automatycznie 1. dnia miesiąca)` : "";
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
    renderAll();
})();
