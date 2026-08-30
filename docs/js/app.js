
const UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES"];
const UNIVERSE_LABELS = {
    SP500: "S&P 500 Momentum",
    NASDAQ100: "Nasdaq 100 Momentum",
    DOWJONES: "Dow Jones Momentum"
};

const state = {
    data: {},
    topBasket: { constituents: [] },
    selectedTicker: null,
    drawerOpen: false,
    drawerUniverse: "SP500",
    sortKey: "rank",
    sortDir: "asc"
};

async function loadData() {
    for (const u of UNIVERSES) {
        try {
            const res = await fetch(`data/${u.toLowerCase()}.json`, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            state.data[u] = await res.json();
        } catch (e) {
            console.error(`Nie udało się wczytać danych dla ${u}:`, e);
            state.data[u] = { universe: u, ref_date: null, n_constituents: 0, constituents: [] };
        }
    }
    try {
        const res = await fetch("data/top_basket.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.topBasket = await res.json();
    } catch (e) {
        console.error("Nie udało się wczytać koszyka top-momentum:", e);
        state.topBasket = { ref_date: null, n_tickers: 0, constituents: [] };
    }
}

// ============================================================
// SIDEBAR (kwadraty z top 10 tickerów na indeks)
// ============================================================
function renderSidebarTiles() {
    UNIVERSES.forEach(u => {
        const container = document.getElementById(`tiles-${u}`);
        container.innerHTML = "";
        const top10 = (state.data[u].constituents || []).slice(0, 10);
        top10.forEach(c => {
            const tile = document.createElement("div");
            tile.className = "ticker-tile";
            tile.textContent = c.ticker;
            tile.title = `${c.ticker} — ${UNIVERSE_LABELS[u]} #${c.rank} · waga ${c.weight_pct.toFixed(2)}%`;
            tile.dataset.ticker = c.ticker;
            tile.dataset.universe = u;
            if (c.ticker === state.selectedTicker) tile.classList.add("selected");
            tile.addEventListener("click", () => selectTicker(c.ticker, u));
            container.appendChild(tile);
        });
        if (top10.length === 0) {
            const empty = document.createElement("div");
            empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
            empty.textContent = "brak danych";
            container.appendChild(empty);
        }
    });
}

// Koncentrowany koszyk "top momentum" (SP500 top 20 + NASDAQ100 top 5 wg
// momentum score, patrz docs/data/top_basket.json / run_query.py::build_top_basket).
// Kafelki dzialaja tak samo jak w gornych 3 grupach — klik podmienia wykres.
function renderTopBasketTiles() {
    const container = document.getElementById("tiles-TOPBASKET");
    if (!container) return;

    const meta = document.getElementById("topBasketMeta");
    if (meta) {
        const b = state.topBasket;
        meta.textContent = b.last_rebalance_ref_date
            ? `Rebalans: ${b.last_rebalance_ref_date}${b.rebalanced_today ? " (dziś)" : ""} · kolejny: ~${b.next_rebalance_ref_date} · dane: ${b.ref_date || "—"}`
            : "Brak danych — uruchom pipeline.";
    }

    container.innerHTML = "";
    const items = state.topBasket.constituents || [];
    items.forEach(c => {
        const tile = document.createElement("div");
        tile.className = "ticker-tile";
        tile.textContent = c.ticker;
        const sources = c.universes.map(u => UNIVERSE_LABELS[u].replace(" Momentum", "")).join(" + ");
        const staleNote = c.stale ? " · dane sprzed rebalansu (spółka poza bieżącą selekcją kwintylową)" : "";
        tile.title = `${c.ticker} — #${c.rank} · momentum ${c.momentum_pct != null ? c.momentum_pct.toFixed(2) + "%" : "brak danych"} · ${sources}${staleNote}`;
        if (c.universes.length > 1) tile.classList.add("ticker-tile-overlap");
        if (c.stale) tile.classList.add("ticker-tile-stale");
        tile.dataset.ticker = c.ticker;
        tile.dataset.universe = c.universes[0];
        if (c.ticker === state.selectedTicker) tile.classList.add("selected");
        tile.addEventListener("click", () => selectTicker(c.ticker, c.universes[0]));
        container.appendChild(tile);
    });
    if (items.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
        empty.textContent = "brak danych";
        container.appendChild(empty);
    }
}

function selectTicker(ticker, universe) {
    state.selectedTicker = ticker;
    document.querySelectorAll(".ticker-tile").forEach(t => {
        t.classList.toggle("selected", t.dataset.ticker === ticker);
    });
    document.querySelectorAll("#momentumTableBody tr").forEach(tr => {
        tr.classList.toggle("row-selected", tr.dataset.ticker === ticker);
    });
    updateChart(ticker);
    // Na telefonie nie ma miejsca na tabelę i wykres naraz — wybranie spółki
    // przełącza widok na pełnoekranowy wykres (jak w apce TradingView).
    if (window.matchMedia("(max-width: 640px)").matches) {
        document.querySelector(".workspace").classList.add("mobile-chart-view");
    }
}

// Przełącza zakładkę drawer na uniwersum danego tickera (żeby podświetlenie
// w tabeli/kafelkach było spójne) i pokazuje jego wykres.
function jumpToTicker(ticker, universe) {
    document.querySelectorAll(".drawer-tab").forEach(t => t.classList.toggle("active", t.dataset.universe === universe));
    state.drawerUniverse = universe;
    document.getElementById("drawerTitle").textContent = `Pełna tabela — ${UNIVERSE_LABELS[universe]}`;
    renderTable();
    selectTicker(ticker, universe);
}

// ============================================================
// WYKRES TRADINGVIEW (jeden, pełnoekranowy — TF przełączany w widgecie)
// ============================================================
function updateChart(symbol) {
    const label = document.getElementById("symbolLabel");
    if (label) label.textContent = symbol;
    mountWidget("tv_chart", symbol);
}

function mountWidget(containerId, symbol) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = "";
    if (typeof TradingView === "undefined") {
        el.innerHTML = '<div class="empty-state">Nie udało się załadować widgetu TradingView (sprawdź połączenie z internetem).</div>';
        return;
    }
    // eslint-disable-next-line no-new
    new TradingView.widget({
        autosize: true,
        symbol: symbol,
        details: true,
        interval: "W",              // domyślny interwał — przełączasz w toolbarze widgetu (1D/1W/1M itd.)
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "pl",
        toolbar_bg: "#14161c",
        enable_publishing: false,
        hide_top_toolbar: false,    // toolbar widgetu zawiera przełącznik interwału
        hide_side_toolbar: false,   // pasek z narzędziami do rysowania (linie, fibo itd.) — domyślnie bywa ukryty
        hide_legend: false,
        save_image: true,
        studies: [                  // domyślnie dograne wskaźniki - użytkownik może dodać kolejne ręcznie w UI
            "STD;MA%Ribbon"
        ],
        container_id: containerId
    });
}

// ============================================================
// SZUFLADA TABEL (>>> rozwiń / <<< zwiń)
// ============================================================
function initDrawer() {
    const toggleBtn = document.getElementById("toggleDrawerBtn");
    const drawer = document.getElementById("tableDrawer");

    toggleBtn.addEventListener("click", () => {
        state.drawerOpen = !state.drawerOpen;
        drawer.classList.toggle("open", state.drawerOpen);
        toggleBtn.textContent = state.drawerOpen ? "<<<" : ">>>";
    });

    document.querySelectorAll(".drawer-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".drawer-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            state.drawerUniverse = tab.dataset.universe;
            document.getElementById("drawerTitle").textContent = `Pełna tabela — ${UNIVERSE_LABELS[state.drawerUniverse]}`;
            renderTable();
        });
    });

    document.querySelectorAll("table.momentum-table thead th").forEach(th => {
        th.addEventListener("click", () => {
            const key = th.dataset.key;
            if (state.sortKey === key) {
                state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
            } else {
                state.sortKey = key;
                state.sortDir = "asc";
            }
            updateSortHeaderClasses();
            renderTable();
        });
    });
}

function updateSortHeaderClasses() {
    document.querySelectorAll("table.momentum-table thead th").forEach(th => {
        th.classList.remove("sort-asc", "sort-desc");
        if (th.dataset.key === state.sortKey) {
            th.classList.add(state.sortDir === "asc" ? "sort-asc" : "sort-desc");
        }
    });
}

// Komparator wierszy tabeli: sortowanie tekstowe bez uwzględniania wielkości
// liter, numeryczne dla reszty pól; wydzielony z renderTable, żeby dało się
// go przetestować bez DOM.
function compareRows(a, b, sortKey, sortDir) {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (typeof va === "string") { va = va.toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
}

function renderTable() {
    const d = state.data[state.drawerUniverse];
    const meta = document.getElementById("drawerMeta");
    if (d.ref_date) {
        let text = `Rebalans: ${d.ref_date} · ${d.n_constituents} spółek`;
        if (d.cap_scaled_due_to_infeasibility) {
            text += " · ⚠ cap 9% przeskalowany (za mało spółek by cap był wykonalny)";
        }
        if (d.n_missing_fmc > 0) {
            text += ` · ${d.n_missing_fmc} pominiętych (brak Market Value w CSV)`;
        }
        meta.textContent = text;
        meta.title = d.fmc_note || "";
    } else {
        meta.textContent = "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).";
    }

    let rows = (d.constituents || []).slice();

    rows.sort((a, b) => compareRows(a, b, state.sortKey, state.sortDir));

    const tbody = document.getElementById("momentumTableBody");
    tbody.innerHTML = "";
    const maxWeight = rows.length ? Math.max(...rows.map(r => r.weight_pct), 0.01) : 1;

    if (rows.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="10" class="empty-state">Brak danych.</td>`;
        tbody.appendChild(tr);
        return;
    }

    rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.dataset.ticker = r.ticker;
        if (r.ticker === state.selectedTicker) tr.classList.add("row-selected");
        tr.innerHTML = `
            <td><span class="rank-badge">${r.rank}</span></td>
            <td class="ticker-cell">${r.ticker}</td>
            <td>${r.sector}</td>
            <td>$${r.price.toFixed(2)}</td>
            <td class="${r.momentum_pct >= 0 ? "positive" : "negative"}">${r.momentum_pct.toFixed(2)}%</td>
            <td>${r.momentum_window}</td>
            <td>${r.volatility_pct.toFixed(2)}%</td>
            <td class="${r.z_score >= 0 ? "positive" : "negative"}">${r.z_score.toFixed(3)}</td>
            <td>${r.momentum_score.toFixed(3)}</td>
            <td>
                <span class="weight-bar-bg"><span class="weight-bar-fill" style="width:${(r.weight_pct / maxWeight * 100).toFixed(0)}%"></span></span>
                ${r.weight_pct.toFixed(2)}%
            </td>
        `;
        tr.addEventListener("click", () => selectTicker(r.ticker, state.drawerUniverse));
        tbody.appendChild(tr);
    });
}

// ============================================================
// SZYBKIE SZUKANIE (Ctrl/Cmd+K albo po prostu zacznij pisać) —
// jak paleta poleceń w VSCode/Notion czy wyszukiwarka na TradingView.
// ============================================================
let cmdkIndex = [];
let cmdkMatches = [];
let cmdkSelectedIndex = 0;

function buildSearchIndex() {
    const byTicker = {};
    UNIVERSES.forEach(u => {
        (state.data[u].constituents || []).forEach(c => {
            if (!byTicker[c.ticker]) byTicker[c.ticker] = { ticker: c.ticker, sector: c.sector, universes: [] };
            byTicker[c.ticker].universes.push(u);
        });
    });
    cmdkIndex = Object.values(byTicker).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function openCmdk(seed) {
    const overlay = document.getElementById("cmdkOverlay");
    const input = document.getElementById("cmdkInput");
    overlay.style.display = "flex";
    input.value = seed || "";
    renderCmdkResults(input.value);
    input.focus();
}

function closeCmdk() {
    document.getElementById("cmdkOverlay").style.display = "none";
}

function renderCmdkResults(query) {
    const q = query.trim().toUpperCase();
    cmdkMatches = (q
        ? cmdkIndex.filter(i => i.ticker.includes(q))
            .sort((a, b) => (a.ticker.startsWith(q) === b.ticker.startsWith(q)) ? 0 : (a.ticker.startsWith(q) ? -1 : 1))
        : cmdkIndex
    ).slice(0, 20);
    cmdkSelectedIndex = 0;

    const results = document.getElementById("cmdkResults");
    if (cmdkMatches.length === 0) {
        results.innerHTML = `<div class="cmdk-empty">Brak wyników</div>`;
        return;
    }
    results.innerHTML = cmdkMatches.map((m, i) => `
        <div class="cmdk-result${i === 0 ? " selected" : ""}" data-idx="${i}">
            <span class="cmdk-ticker">${m.ticker}</span>
            <span class="cmdk-sector">${m.sector}</span>
            <span class="cmdk-universe">${m.universes.map(u => UNIVERSE_LABELS[u].replace(" Momentum", "")).join(" + ")}</span>
        </div>
    `).join("");
    results.querySelectorAll(".cmdk-result").forEach(el => {
        el.addEventListener("mouseenter", () => {
            cmdkSelectedIndex = Number(el.dataset.idx);
            updateCmdkSelectionHighlight();
        });
        el.addEventListener("click", () => confirmCmdkSelection());
    });
}

function updateCmdkSelectionHighlight() {
    document.querySelectorAll(".cmdk-result").forEach(el => {
        el.classList.toggle("selected", Number(el.dataset.idx) === cmdkSelectedIndex);
    });
    document.querySelector(".cmdk-result.selected")?.scrollIntoView({ block: "nearest" });
}

function moveCmdkSelection(delta) {
    if (cmdkMatches.length === 0) return;
    cmdkSelectedIndex = (cmdkSelectedIndex + delta + cmdkMatches.length) % cmdkMatches.length;
    updateCmdkSelectionHighlight();
}

function confirmCmdkSelection() {
    const m = cmdkMatches[cmdkSelectedIndex];
    if (!m) return;
    closeCmdk();
    jumpToTicker(m.ticker, m.universes[0]);
}

function initCmdk() {
    const overlay = document.getElementById("cmdkOverlay");
    const input = document.getElementById("cmdkInput");

    document.getElementById("cmdkTrigger").addEventListener("click", () => openCmdk());
    input.addEventListener("input", () => renderCmdkResults(input.value));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeCmdk(); });

    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            openCmdk();
            return;
        }
        const isOpen = overlay.style.display !== "none";
        if (isOpen) {
            if (e.key === "Escape") { closeCmdk(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); moveCmdkSelection(1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); moveCmdkSelection(-1); }
            else if (e.key === "Enter") { e.preventDefault(); confirmCmdkSelection(); }
            return;
        }
        // Nie przechwytuj pisania w polach formularza — zacznij szukać tylko
        // gdy piszesz "po prostu na stronie" (tak jak Spotlight na macOS).
        const tag = document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            openCmdk(e.key);
        }
    });
}

// ============================================================
// INIT
// ============================================================
// typeof document check: pozwala wczytać ten plik przez `require()` w testach
// Node (patrz tests/js/) bez uruchamiania inicjalizacji strony — w przeglądarce
// document zawsze istnieje, więc zachowanie się nie zmienia.
if (typeof document !== "undefined") {
    (async function init() {
        await loadData();
        renderSidebarTiles();
        renderTopBasketTiles();
        initDrawer();
        updateSortHeaderClasses();
        renderTable(); // renderowane od razu (nie tylko po rozwinięciu) — na mobile lista jest domyślnym widokiem
        buildSearchIndex();
        initCmdk();
        document.getElementById("chartBackBtn").addEventListener("click", () => {
            document.querySelector(".workspace").classList.remove("mobile-chart-view");
        });
        updateChart("SPY");
    })();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
}

// Eksport wyłącznie dla test runnera Node (tests/js/) — nie ładowany
// i bez efektu w przeglądarce (module tam nie istnieje).
if (typeof module !== "undefined" && module.exports) {
    module.exports = { compareRows };
}

