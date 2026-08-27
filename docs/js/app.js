
const UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES"];
const UNIVERSE_LABELS = {
    SP500: "S&P 500 Momentum",
    NASDAQ100: "Nasdaq 100 Momentum",
    DOWJONES: "Dow Jones Momentum"
};

const state = {
    data: {},
    selectedTicker: null,
    drawerOpen: false,
    drawerUniverse: "SP500",
    sortKey: "rank",
    sortDir: "asc",
    searchText: "",
    sectorFilter: ""
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

function selectTicker(ticker, universe) {
    state.selectedTicker = ticker;
    document.querySelectorAll(".ticker-tile").forEach(t => {
        t.classList.toggle("selected", t.dataset.ticker === ticker);
    });
    document.querySelectorAll("#momentumTableBody tr").forEach(tr => {
        tr.classList.toggle("row-selected", tr.dataset.ticker === ticker);
    });
    updateChart(ticker);
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
        if (state.drawerOpen) {
            populateSectorFilter();
            renderTable();
        }
    });

    document.querySelectorAll(".drawer-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".drawer-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            state.drawerUniverse = tab.dataset.universe;
            state.sectorFilter = "";
            document.getElementById("drawerTitle").textContent = `Pełna tabela — ${UNIVERSE_LABELS[state.drawerUniverse]}`;
            populateSectorFilter();
            renderTable();
        });
    });

    document.getElementById("tickerSearch").addEventListener("input", (e) => {
        state.searchText = e.target.value.trim().toUpperCase();
        renderTable();
    });

    document.getElementById("sectorFilter").addEventListener("change", (e) => {
        state.sectorFilter = e.target.value;
        renderTable();
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

function populateSectorFilter() {
    const sel = document.getElementById("sectorFilter");
    const sectors = Array.from(new Set(
        (state.data[state.drawerUniverse].constituents || []).map(c => c.sector)
    )).sort();
    const current = state.sectorFilter;
    sel.innerHTML = `<option value="">Wszystkie sektory</option>` +
        sectors.map(s => `<option value="${s}">${s}</option>`).join("");
    sel.value = current;
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

    if (state.searchText) {
        rows = rows.filter(r => r.ticker.toUpperCase().includes(state.searchText));
    }
    if (state.sectorFilter) {
        rows = rows.filter(r => r.sector === state.sectorFilter);
    }

    rows.sort((a, b) => {
        let va = a[state.sortKey];
        let vb = b[state.sortKey];
        if (typeof va === "string") { va = va.toLowerCase(); vb = String(vb).toLowerCase(); }
        if (va < vb) return state.sortDir === "asc" ? -1 : 1;
        if (va > vb) return state.sortDir === "asc" ? 1 : -1;
        return 0;
    });

    const tbody = document.getElementById("momentumTableBody");
    tbody.innerHTML = "";
    const maxWeight = rows.length ? Math.max(...rows.map(r => r.weight_pct), 0.01) : 1;

    if (rows.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="10" class="empty-state">Brak wyników dla wybranych filtrów.</td>`;
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
// INIT
// ============================================================
(async function init() {
    await loadData();
    renderSidebarTiles();
    initDrawer();
    populateSectorFilter();
    updateSortHeaderClasses();
    updateChart("SPY");
})();

