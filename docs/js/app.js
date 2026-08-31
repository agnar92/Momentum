
const UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES"];
const UNIVERSE_LABELS = {
    SP500: "S&P 500 Momentum",
    NASDAQ100: "Nasdaq 100 Momentum",
    DOWJONES: "Dow Jones Momentum"
};

const state = {
    data: {},
    gem: { indices: [], leaders: [] },
    rs: { universes: {} },
    selectedTicker: null,
    currentRsEntry: null,
    chartMode: "TV",
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
        const res = await fetch("data/global_equity_momentum.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.gem = await res.json();
    } catch (e) {
        console.error("Nie udało się wczytać danych Global Equity Momentum:", e);
        state.gem = { ref_date: null, indices: [], winner: null, leaders: [] };
    }
    try {
        const res = await fetch("data/relative_strength.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        state.rs = await res.json();
    } catch (e) {
        console.error("Nie udało się wczytać danych siły relatywnej:", e);
        state.rs = { ref_date: null, universes: {} };
    }
}

// Łączy liderów siły relatywnej z obu uniwersów (NASDAQ100 + DOWJONES) w jedną
// listę, każdego z dopisanym uniwersum i zwrotem JEGO indeksu, posortowaną
// malejąco po przewadze (relative_strength_pct) — tak jak prosił użytkownik:
// "posortuję po różnicy procentowej index - akcji".
function combinedRelativeStrengthLeaders() {
    const combined = [];
    Object.entries(state.rs.universes || {}).forEach(([universe, u]) => {
        (u.leaders || []).forEach(r => {
            combined.push({ ...r, universe, index_return_pct: u.index_return_pct });
        });
    });
    combined.sort((a, b) => b.relative_strength_pct - a.relative_strength_pct);
    return combined;
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

// Global Equity Momentum: porownanie zwrotu POZIOMU INDEKSU (nie skladnikow)
// SP500/NASDAQ100/DOWJONES w oknie 12M (docs/data/global_equity_momentum.json /
// run_query.py::compute_index_returns) — wygrywa indeks o najsilniejszym trendzie.
// Kafelki ponizej to top 10 spolek zwycieskiego indeksu wg wkladu w jego zwrot
// (waga w indeksie x zwrot spolki w tym samym oknie), czyli te, ktore realnie
// pchaja cene indeksu w gore. Klik dziala tak samo jak w gornych 3 grupach.
function renderGemPanel() {
    const container = document.getElementById("tiles-GEM");
    if (!container) return;

    const g = state.gem;
    const meta = document.getElementById("gemMeta");
    if (meta) {
        const winnerReturn = (g.indices || []).find(i => i.universe === g.winner);
        meta.textContent = g.ref_date && g.winner
            ? `Zwycięzca: ${UNIVERSE_LABELS[g.winner].replace(" Momentum", "")} `
              + `${winnerReturn ? (winnerReturn.return_pct >= 0 ? "+" : "") + winnerReturn.return_pct.toFixed(2) + "%" : ""} `
              + `(${g.lookback_months || 12}M) · ${(g.leaders || []).length} liderów`
            : "Brak danych — uruchom pipeline.";
        meta.title = g.note || "";
    }

    const returnsEl = document.getElementById("gemIndexReturns");
    if (returnsEl) {
        returnsEl.innerHTML = "";
        (g.indices || []).forEach(i => {
            const row = document.createElement("div");
            row.className = "gem-index-row" + (i.universe === g.winner ? " gem-index-winner" : "");
            row.innerHTML = `
                <span>${i.universe === g.winner ? "🏆 " : ""}${UNIVERSE_LABELS[i.universe].replace(" Momentum", "")}</span>
                <span class="${i.return_pct >= 0 ? "positive" : "negative"}">${i.return_pct >= 0 ? "+" : ""}${i.return_pct.toFixed(2)}%</span>
            `;
            returnsEl.appendChild(row);
        });
    }

    container.innerHTML = "";
    const items = g.leaders || [];
    items.forEach(c => {
        const tile = document.createElement("div");
        tile.className = "ticker-tile";
        tile.textContent = c.ticker;
        tile.title = `${c.ticker} — #${c.rank} · zwrot ${c.return_pct.toFixed(2)}% · waga w indeksie `
            + `${c.weight_in_index_pct.toFixed(2)}% · wkład w zwrot ${c.contribution_pct.toFixed(2)}pp`;
        tile.dataset.ticker = c.ticker;
        tile.dataset.universe = g.winner;
        if (c.ticker === state.selectedTicker) tile.classList.add("selected");
        tile.addEventListener("click", () => selectTicker(c.ticker, g.winner));
        container.appendChild(tile);
    });
    if (items.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
        empty.textContent = "brak danych";
        container.appendChild(empty);
    }
}

// Siła relatywna (YTD): dla NASDAQ100/DOWJONES (docs/data/relative_strength.json /
// run_query.py::compute_relative_strength_leaders) pokazuje spółki, które od
// początku roku rosną szybciej niż sam indeks, posortowane malejąco po przewadze
// (zwrot spółki - zwrot indeksu). Kafelki łączą oba uniwersy w jedną listę.
function renderRelativeStrengthPanel() {
    const container = document.getElementById("tiles-RS");
    if (!container) return;

    const rs = state.rs;
    const combined = combinedRelativeStrengthLeaders();

    const meta = document.getElementById("rsMeta");
    if (meta) {
        meta.textContent = rs.ref_date
            ? `Stan na: ${rs.ref_date} · ${combined.length} spółek bijących swój indeks`
            : "Brak danych — uruchom pipeline.";
        meta.title = rs.note || "";
    }

    const returnsEl = document.getElementById("rsIndexReturns");
    if (returnsEl) {
        returnsEl.innerHTML = "";
        Object.entries(rs.universes || {}).forEach(([universe, u]) => {
            const row = document.createElement("div");
            row.className = "gem-index-row";
            row.innerHTML = `
                <span>${UNIVERSE_LABELS[universe].replace(" Momentum", "")} (YTD)</span>
                <span class="${u.index_return_pct >= 0 ? "positive" : "negative"}">${u.index_return_pct >= 0 ? "+" : ""}${u.index_return_pct.toFixed(2)}%</span>
            `;
            returnsEl.appendChild(row);
        });
    }

    container.innerHTML = "";
    combined.forEach(c => {
        const tile = document.createElement("div");
        tile.className = "ticker-tile";
        tile.textContent = c.ticker;
        tile.title = `${c.ticker} — ${UNIVERSE_LABELS[c.universe].replace(" Momentum", "")} · zwrot YTD `
            + `${c.return_pct.toFixed(2)}% vs indeks ${c.index_return_pct.toFixed(2)}% · przewaga +${c.relative_strength_pct.toFixed(2)}pp`;
        tile.dataset.ticker = c.ticker;
        tile.dataset.universe = c.universe;
        if (c.ticker === state.selectedTicker) tile.classList.add("selected");
        tile.addEventListener("click", () => selectTicker(c.ticker, c.universe, "RS"));
        container.appendChild(tile);
    });
    if (combined.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
        empty.textContent = "brak danych";
        container.appendChild(empty);
    }
}

// preferMode="RS": wywolywane z kafelka/wiersza w panelu Sily Relatywnej — jesli
// ten ticker ma wlasny tygodniowy wykres (weekly_chart), pokaz go od razu zamiast
// TradingView. Kazde inne wywolanie (tabele uniwersow, GEM, Ctrl+K) domyslnie
// pokazuje TradingView, tak jak wczesniej.
function selectTicker(ticker, universe, preferMode) {
    state.selectedTicker = ticker;
    document.querySelectorAll(".ticker-tile").forEach(t => {
        t.classList.toggle("selected", t.dataset.ticker === ticker);
    });
    document.querySelectorAll("#momentumTableBody tr, #gemTableBody tr, #rsTableBody tr").forEach(tr => {
        tr.classList.toggle("row-selected", tr.dataset.ticker === ticker);
    });
    const rsEntry = combinedRelativeStrengthLeaders().find(r => r.ticker === ticker) || null;
    state.currentRsEntry = rsEntry;
    state.chartMode = (preferMode === "RS" && rsEntry && rsEntry.weekly_chart) ? "RS" : "TV";
    updateChartArea();
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
    showDrawerTable(universe);
    selectTicker(ticker, universe);
}

// ============================================================
// OBSZAR WYKRESU: TradingView LUB własny tygodniowy wykres Siły Relatywnej
// (cena spółki vs. indeks, oba w % YTD — patrz renderRelativeStrengthChart).
// Przełącznik (#chartModeToggle) jest aktywny tylko gdy state.currentRsEntry ma
// weekly_chart; w przeciwnym razie zawsze pokazujemy TradingView jak wcześniej.
// ============================================================
let rsChartInstance = null;

function updateChartArea() {
    const symbol = state.selectedTicker;
    const rsEntry = state.currentRsEntry;
    const hasRsChart = !!(rsEntry && rsEntry.weekly_chart);

    const label = document.getElementById("symbolLabel");
    if (label) label.textContent = symbol;

    const tvBtn = document.getElementById("chartModeTvBtn");
    const rsBtn = document.getElementById("chartModeRsBtn");
    if (rsBtn) rsBtn.disabled = !hasRsChart;
    if (!hasRsChart) state.chartMode = "TV";

    const tvContainer = document.getElementById("tv_chart");
    const rsContainer = document.getElementById("rs_chart");
    const showRs = state.chartMode === "RS" && hasRsChart;

    if (tvContainer) tvContainer.hidden = showRs;
    if (rsContainer) rsContainer.hidden = !showRs;
    if (tvBtn) tvBtn.classList.toggle("active", !showRs);
    if (rsBtn) rsBtn.classList.toggle("active", showRs);

    if (showRs) {
        renderRelativeStrengthChart(symbol, rsEntry);
    } else {
        mountWidget("tv_chart", symbol);
    }
}

function initChartModeToggle() {
    const tvBtn = document.getElementById("chartModeTvBtn");
    const rsBtn = document.getElementById("chartModeRsBtn");
    if (tvBtn) tvBtn.addEventListener("click", () => { state.chartMode = "TV"; updateChartArea(); });
    if (rsBtn) rsBtn.addEventListener("click", () => {
        if (rsBtn.disabled) return;
        state.chartMode = "RS";
        updateChartArea();
    });
}

function renderRelativeStrengthChart(symbol, rsEntry) {
    const chartData = rsEntry.weekly_chart;
    const rsContainer = document.getElementById("rs_chart");
    const canvas = document.getElementById("rsChartCanvas");
    if (!canvas || !chartData) return;

    if (typeof Chart === "undefined") {
        if (rsContainer) rsContainer.innerHTML = '<div class="empty-state">Nie udało się załadować biblioteki wykresu (sprawdź połączenie z internetem).</div>';
        return;
    }
    if (rsChartInstance) { rsChartInstance.destroy(); rsChartInstance = null; }

    const indexLabel = UNIVERSE_LABELS[rsEntry.universe] ? UNIVERSE_LABELS[rsEntry.universe].replace(" Momentum", "") : "Indeks";
    rsChartInstance = new Chart(canvas, {
        type: "line",
        data: {
            labels: chartData.dates,
            datasets: [
                { label: `${symbol} (zamknięcie)`, data: chartData.close_pct, borderColor: "#2ecc71", backgroundColor: "transparent", pointRadius: 0, borderWidth: 2 },
                { label: indexLabel, data: chartData.index_pct, borderColor: "#8a8f9c", backgroundColor: "transparent", pointRadius: 0, borderWidth: 2, borderDash: [4, 3] },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { position: "bottom", labels: { color: "#8a8f9c", boxWidth: 12, font: { size: 10 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y == null ? "—" : ctx.parsed.y.toFixed(2) + "%"}` } },
            },
            scales: {
                x: { ticks: { color: "#8a8f9c", maxTicksLimit: 10 }, grid: { color: "#262a35" } },
                y: { ticks: { color: "#8a8f9c", callback: (v) => `${v}%` }, grid: { color: "#262a35" } },
            },
        },
    });
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
            showDrawerTable(state.drawerUniverse);
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

// Przełącza, która z dwóch tabel w drawerze jest widoczna (pełna tabela
// uniwersum vs. Global Equity Momentum — mają inny zestaw kolumn, patrz
// renderGemTable) i renderuje jej zawartość. Na telefonie sidebar z
// kafelkami jest ukryty (patrz CSS @media max-width:640px), więc to
// jedyny sposób dotarcia do GEM w pionie.
function showDrawerTable(universe) {
    const isGem = universe === "GEM";
    const isRs = universe === "RS";
    document.getElementById("momentumTable").hidden = isGem || isRs;
    document.getElementById("gemTable").hidden = !isGem;
    document.getElementById("rsTable").hidden = !isRs;
    document.getElementById("drawerTitle").textContent = isGem
        ? "Pełna tabela — Global Equity Momentum"
        : isRs
            ? "Pełna tabela — Siła Relatywna (YTD)"
            : `Pełna tabela — ${UNIVERSE_LABELS[universe]}`;
    if (isGem) {
        renderGemTable();
    } else if (isRs) {
        renderRelativeStrengthTable();
    } else {
        renderTable();
    }
}

function renderGemTable() {
    const g = state.gem;
    const meta = document.getElementById("drawerMeta");
    if (g.ref_date && g.winner) {
        meta.textContent = `Rebalans: ${g.ref_date} · zwycięzca ${UNIVERSE_LABELS[g.winner].replace(" Momentum", "")} · ${(g.leaders || []).length} liderów`;
        meta.title = g.note || "";
    } else {
        meta.textContent = "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).";
        meta.title = "";
    }

    const rows = g.leaders || [];
    const tbody = document.getElementById("gemTableBody");
    tbody.innerHTML = "";

    if (rows.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="7" class="empty-state">Brak danych.</td>`;
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
            <td class="${r.return_pct >= 0 ? "positive" : "negative"}">${r.return_pct.toFixed(2)}%</td>
            <td>${r.weight_in_index_pct.toFixed(2)}%</td>
            <td>${r.contribution_pct.toFixed(2)}pp</td>
        `;
        tr.addEventListener("click", () => selectTicker(r.ticker, g.winner));
        tbody.appendChild(tr);
    });
}

function renderRelativeStrengthTable() {
    const rs = state.rs;
    const rows = combinedRelativeStrengthLeaders();
    const meta = document.getElementById("drawerMeta");
    if (rs.ref_date) {
        meta.textContent = `Stan na: ${rs.ref_date} · ${rows.length} spółek bijących swój indeks`;
        meta.title = rs.note || "";
    } else {
        meta.textContent = "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).";
        meta.title = "";
    }

    const tbody = document.getElementById("rsTableBody");
    tbody.innerHTML = "";

    if (rows.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="8" class="empty-state">Brak danych.</td>`;
        tbody.appendChild(tr);
        return;
    }

    rows.forEach((r, i) => {
        const tr = document.createElement("tr");
        tr.dataset.ticker = r.ticker;
        if (r.ticker === state.selectedTicker) tr.classList.add("row-selected");
        tr.innerHTML = `
            <td><span class="rank-badge">${i + 1}</span></td>
            <td class="ticker-cell">${r.ticker}</td>
            <td>${UNIVERSE_LABELS[r.universe].replace(" Momentum", "")}</td>
            <td>${r.sector}</td>
            <td>$${r.price.toFixed(2)}</td>
            <td class="${r.return_pct >= 0 ? "positive" : "negative"}">${r.return_pct.toFixed(2)}%</td>
            <td class="${r.index_return_pct >= 0 ? "positive" : "negative"}">${r.index_return_pct.toFixed(2)}%</td>
            <td class="positive">+${r.relative_strength_pct.toFixed(2)}pp</td>
        `;
        tr.addEventListener("click", () => selectTicker(r.ticker, r.universe, "RS"));
        tbody.appendChild(tr);
    });
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
        renderGemPanel();
        renderRelativeStrengthPanel();
        initDrawer();
        initChartModeToggle();
        updateSortHeaderClasses();
        renderTable(); // renderowane od razu (nie tylko po rozwinięciu) — na mobile lista jest domyślnym widokiem
        buildSearchIndex();
        initCmdk();
        document.getElementById("chartBackBtn").addEventListener("click", () => {
            document.querySelector(".workspace").classList.remove("mobile-chart-view");
        });
        state.selectedTicker = "SPY";
        updateChartArea();
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

