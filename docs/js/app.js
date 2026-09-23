
// UNIVERSES/UNIVERSE_LABELS/PLN_UNIVERSES/formatPrice/tvSymbolFor/tvUrlFor/
// STAGE_LABELS/STAGE_COLORS/stageCellHtml/compareRows żyją teraz w
// js/shared.js, współdzielonym przez index.html/rebalance.html/chart.html
// (patrz komentarz na górze tamtego pliku) — index.html musi ładować
// js/shared.js PRZED tym plikiem. initConnStatus/hideLoadingOverlay/
// showToast żyją analogicznie w js/qol.js (patrz komentarz na górze tamtego
// pliku), ładowanym tuż po shared.js. findRsEntry/selectTicker/decorateTile/
// cały mechanizm okienka z wykresem (openChartModal/updateChartArea/
// initChartFullscreen itd.) żyje w js/chart-modal.js — wydzielony stamtąd,
// bo signals.html ("Sygnały" — ekstrakcja zakładek Wybicie/TTM Squeeze/
// Continuation z tego dashboardu, patrz CLAUDE.md) potrzebuje DOKŁADNIE tego
// samego okienka wykresu dla swoich własnych tabel/kafelków. Node (tests/js/)
// nie ładuje <script> tagów, więc odtwarzamy to samo współdzielenie globali
// ręcznie tylko tam.
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./qol.js"));
    Object.assign(globalThis, require("./minicharts.js"));
}

// Uniwersa z WŁASNĄ zakładką/tabelą momentum w dashboardzie (sidebar + drawer).
// SP500/NASDAQ100 były stąd kiedyś usunięte (ekran RSM je i tak obejmował), ale
// wróciły na życzenie użytkownika jako pełne replikacje indeksów momentum —
// SP500 to replikacja S&P 500 Momentum Index (ETF SPMO), NASDAQ100 analogicznie
// Nasdaq 100 Momentum. Tabela pokazuje `constituents` (selekcja top-kwintyla z
// wagami z compute_weights), nie `all_constituents`.
const SIDEBAR_TAB_UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES", "WIG20", "MWIG40", "SWIG80"];

const state = {
    data: {},
    selectedTicker: null,
    selectedUniverse: null,
    currentRsEntry: null,
    drawerOpen: false,
    drawerUniverse: "SP500",
    chartView: "own",
    stageFilter: "ALL",
    sortKey: "rank",
    sortDir: "asc",
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
    // docs/data/global_equity_momentum.json i docs/data/relative_strength.json NIE
    // są już tu wczytywane — GEM przestał być czymś do oglądania na dashboardzie
    // (przeniesiony jako silnik wyboru do rebalance.js, patrz CLAUDE.md).
    // Wybicie/TTM Squeeze/Continuation (i docs/data/continuation.json, ich
    // opcjonalne dzienne odświeżenie) przeniesione na osobną stronę "Sygnały"
    // (signals.html/signals.js) — patrz CLAUDE.md.
}

// ============================================================
// SIDEBAR (kwadraty z top 10 tickerów na indeks)
// ============================================================
// decorateTile/latestRsLong żyją teraz w js/chart-modal.js (współdzielone z
// signals.js — te same kafelki "mówiące bez klikania" po etapie/RS).
function renderSidebarTiles() {
    SIDEBAR_TAB_UNIVERSES.forEach(u => {
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
            decorateTile(tile, c.weekly_chart && c.weekly_chart.current_stage, latestRsLong(c));
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

// findRsEntry/selectTicker/openChartModal/closeChartModal/initChartModal/
// updateChartArea/updateChartTickerLabel/initOpenTvButton/initResetZoomButton/
// initChartFullscreen/tvRowButtonHtml/bindTvRowButtons/renderTvOverviewPanel/
// initChartViewTabs żyją teraz w js/chart-modal.js, współdzielonym z
// signals.js — patrz komentarz na górze tamtego pliku.

// Przełącza zakładkę drawer na uniwersum danego tickera (żeby podświetlenie
// w tabeli/kafelkach było spójne) i pokazuje jego wykres. Gdy uniwersum nie ma
// własnej zakładki (patrz SIDEBAR_TAB_UNIVERSES), wynik wyszukiwania Ctrl+K
// tylko aktualizuje wybór/wykres, bez przełączania drawera na nieistniejącą
// zakładkę.
function jumpToTicker(ticker, universe) {
    const hasTab = !!document.querySelector(`.drawer-tab[data-universe="${universe}"]`);
    document.querySelectorAll(".drawer-tab").forEach(t => t.classList.toggle("active", t.dataset.universe === universe));
    if (hasTab) {
        state.drawerUniverse = universe;
        showDrawerTable(universe);
    }
    selectTicker(ticker, universe);
}

// STAGE_LABELS/STAGE_DESCRIPTIONS/STAGE_COLORS/STAGE_BREAKOUT_VOLUME_RATIO/
// BASE_BOX_COLORS/stageCellHtml (klasyfikacja etapow Weinsteina dolaczona
// przez run_query.py do kazdego tygodnia wykresu 10:30) zyja teraz w
// js/shared.js, wspoldzielonym przez index.html/rebalance.html/chart.html —
// patrz komentarz na gorze tamtego pliku.

// Filtr etapow nad glowna tabela (#stageFilterBar) — "2" obejmuje zarowno 2A
// jak i 2B (uzytkownik mysli o "Etapie 2" jako calosci, nie osobno o
// swiezym wybiciu vs kontynuacji), reszta to dokladne dopasowanie.
function matchesStageFilter(stage) {
    if (state.stageFilter === "ALL") return true;
    if (!stage) return false;
    if (state.stageFilter === "2") return stage === "2A" || stage === "2B";
    return stage === state.stageFilter;
}

function initStageFilter() {
    const bar = document.getElementById("stageFilterBar");
    if (!bar) return;
    bar.querySelectorAll(".stage-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            state.stageFilter = btn.dataset.stage;
            bar.querySelectorAll(".stage-filter-btn").forEach(b => b.classList.toggle("active", b === btn));
            renderTable();
        });
    });
}

// renderStageBadge/rollingMean/alignMansfieldToDates/alignSqueezeToDates/
// alignMacdToDates/fmtPlDate/syncChartsCrosshair/renderRelativeStrengthChart/
// applyMansfieldPanelVisibility/initMansfieldControls zyja teraz w
// js/chart-render.js, wspoldzielonym z chart.html — patrz komentarz na gorze
// tamtego pliku. updateChartArea() (w js/chart-modal.js) woła
// renderRelativeStrengthChart(symbol, rsEntry) i destroyChartInstances() jak
// dotychczas.

// ============================================================
// SZUFLADA TABEL
// ============================================================
function initDrawer() {
    const toggleBtn = document.getElementById("toggleDrawerBtn");
    const drawer = document.getElementById("tableDrawer");

    // Tabela jest teraz ZAWSZE rozwinięta na cały ekran (wykres otwiera się w
    // okienku — patrz openChartModal), więc dawne rozwijanie/zwijanie
    // przyciskiem >>> i klikiem poza szufladą zniknęło.
    state.drawerOpen = true;
    if (drawer) drawer.classList.add("open");
    if (toggleBtn) toggleBtn.hidden = true;

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
            if (!key) return; // kolumny bez sortowania (Etap, TV)
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

// compareRows (komparator wierszy tabeli, uzywany tu i przez
// renderPickerTable w rebalance.js) zyje teraz w js/shared.js.

// Ustawia tytuł drawera dla wybranego uniwersum i renderuje jego tabelę —
// jedyna tabela tej strony to teraz #momentumTable (Wybicie/TTM Squeeze/
// Continuation przeniesione na signals.html, patrz CLAUDE.md), więc w
// przeciwieństwie do dawnej wersji nie ma tu już przełączania między kilkoma
// różnymi <table>.
function showDrawerTable(universe) {
    document.getElementById("drawerTitle").textContent = `Pełna tabela — ${UNIVERSE_LABELS[universe]}`;
    renderTable();
}

function renderBreadthBar() {
    const el = document.getElementById("breadthBar");
    if (!el) return;
    const isUniverse = SIDEBAR_TAB_UNIVERSES.includes(state.drawerUniverse);
    el.hidden = !isUniverse;
    if (!isUniverse) return;
    const d = state.data[state.drawerUniverse] || {};
    const rows = d.all_constituents || d.constituents || [];
    const b = stageBreakdown(rows);
    if (!b.total) { el.innerHTML = ""; return; }
    const segs = [["2", "Etap 2"], ["1", "Etap 1"], ["3", "Etap 3"], ["4", "Etap 4"], ["none", "brak danych"]]
        .filter(([k]) => b[k] > 0)
        .map(([k, label]) => {
            const pct = (b[k] / b.total) * 100;
            const color = k === "none" ? "#3a3f4b" : STAGE_COLORS[k === "2" ? "2A" : k];
            return `<button type="button" class="breadth-seg" data-stage="${k}" style="flex:${b[k]};background:${color}" title="${label}: ${b[k]} spółek (${pct.toFixed(0)}%)${k !== "none" ? " — kliknij, żeby filtrować" : ""}">${pct >= 7 ? `${label.replace("Etap ", "E")} ${pct.toFixed(0)}%` : ""}</button>`;
        }).join("");
    el.innerHTML = `<span class="breadth-label">Całe ${UNIVERSE_LABELS[state.drawerUniverse].replace(" Momentum", "")} (${b.total}):</span><div class="breadth-track">${segs}</div>`;
    el.querySelectorAll(".breadth-seg").forEach(seg => {
        if (seg.dataset.stage === "none") return;
        seg.addEventListener("click", () => {
            const btn = document.querySelector(`#stageFilterBar .stage-filter-btn[data-stage="${seg.dataset.stage}"]`);
            if (btn) btn.click();
        });
    });
}

function renderTable() {
    const d = state.data[state.drawerUniverse];
    // universe: r.universe — jedyna z wszystkich tabel dashboardu, ktora go
    // wczesniej nie ustawiala (bo w kontekscie jednej zakladki byl caly czas
    // taki sam, wiec niepotrzebny) — teraz potrzebny w initMiniChartHoverPreview
    // (minicharts.js), zeby dobrac walute (formatPrice) i etykiete "RS vs X"
    // bez tamtego pliku siegajacego do globalnego state.
    const allRows = (d.constituents || []).map(c => ({ ...c, ...miniVisualFields(c), universe: state.drawerUniverse }));
    renderBreadthBar();
    // Ustawiane przez beforeRender ponizej, PO filtrze/sortowaniu — pasek wagi
    // skaluje sie wzgledem najwiekszej wagi wsrod AKTUALNIE WIDOCZNYCH wierszy
    // (po filtrze etapu), nie calego uniwersum.
    let maxWeight = 1;

    renderScreenerTable({
        tbody: document.getElementById("momentumTableBody"),
        metaEl: document.getElementById("drawerMeta"),
        allRows,
        matchesStage: state.stageFilter === "ALL" ? null : (r => matchesStageFilter(r.weekly_chart && r.weekly_chart.current_stage)),
        sortKey: state.sortKey, sortDir: state.sortDir,
        colspan: 15,
        emptyAllMsg: "Brak danych.",
        emptyFilteredMsg: "Żadna spółka nie pasuje do wybranego etapu.",
        metaText: (rows) => {
            if (!d.ref_date) return "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).";
            let text = `Rebalans: ${d.ref_date} · `;
            text += state.stageFilter === "ALL"
                ? `${d.n_constituents} spółek`
                : `${rows.length} z ${allRows.length} spółek (etap ${state.stageFilter === "2" ? "2A/2B" : state.stageFilter})`;
            if (d.cap_scaled_due_to_infeasibility) {
                text += " · ⚠ cap 9% przeskalowany (za mało spółek by cap był wykonalny)";
            }
            if (d.n_missing_fmc > 0) {
                text += ` · ${d.n_missing_fmc} pominiętych (brak Market Value w CSV)`;
            }
            return text;
        },
        metaTitle: () => d.fmc_note || "",
        beforeRender: (rows) => { maxWeight = rows.length ? Math.max(...rows.map(r => r.weight_pct), 0.01) : 1; },
        rowKey: r => r.ticker,
        isSelected: r => r.ticker === state.selectedTicker,
        rowHtml: (r) => `
            <td><span class="rank-badge">${r.rank}</span></td>
            <td class="ticker-cell">${r.ticker}</td>
            <td>${r.sector}</td>
            <td>${formatPrice(r.price, state.drawerUniverse)}</td>
            <td class="${r.momentum_pct >= 0 ? "positive" : "negative"}">${r.momentum_pct.toFixed(2)}%</td>
            <td>${r.momentum_window}</td>
            <td>${r.volatility_pct.toFixed(2)}%</td>
            <td class="${r.z_score >= 0 ? "positive" : "negative"}">${r.z_score.toFixed(3)}</td>
            <td>${r.momentum_score.toFixed(3)}</td>
            <td>
                <span class="weight-bar-bg"><span class="weight-bar-fill" style="width:${(r.weight_pct / maxWeight * 100).toFixed(0)}%"></span></span>
                ${r.weight_pct.toFixed(2)}%
            </td>
            <td title="Cena tygodniowa (ostatnie ${MINI_WEEKS} tyg.) + EMA20 (przerywana)">${weeklySparkSvg(r.mini_closes, r.mini_ema)}</td>
            <td>${rsBarHtml(r.rs_long)}</td>
            <td title="TTM Squeeze tygodniowy (ostatnie ${MINI_WEEKS} tyg.): słupki = momentum, czerwona kropka = squeeze, złota = wybicie">${ttmMiniSvg(r.mini_hist, r.mini_sq_on, r.mini_fired)}</td>
            <td>${stageCellHtml(r.weekly_chart && r.weekly_chart.current_stage)}</td>
            <td>${tvRowButtonHtml(r.ticker, state.drawerUniverse)}</td>
        `,
        onRowClick: r => selectTicker(r.ticker, state.drawerUniverse),
        afterRender: bindTvRowButtons,
    });
}

// ============================================================
// SZYBKIE SZUKANIE (Ctrl/Cmd+K albo po prostu zacznij pisać) —
// jak paleta poleceń w VSCode/Notion czy wyszukiwarka na TradingView.
// ============================================================
let cmdkIndex = [];
let cmdkMatches = [];
let cmdkSelectedIndex = 0;

// Indeks szukania obejmuje CALE uniwersum (all_constituents), nie tylko biezacy
// decyl — patrz FULL_COVERAGE_UNIVERSES/_build_full_universe_records w run_query.py.
// Dla uniwersow rownowazonych (DOWJONES/WIG20/MWIG40) all_constituents jest rowne
// constituents, wiec fallback ponizej jest tylko zabezpieczeniem na starszy,
// jeszcze niezmigrowany JSON w cache service workera.
function buildSearchIndex() {
    const byTicker = {};
    UNIVERSES.forEach(u => {
        (state.data[u].all_constituents || state.data[u].constituents || []).forEach(c => {
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

// Getter wylacznie dla test runnera Node (tests/js/) — `cmdkIndex` jest
// modulowym `let`, wiec samo wyeksportowanie jego wartosci przy starcie
// modulu nie odzwierciedlaloby pozniejszych wywolan buildSearchIndex().
function getCmdkIndex() {
    return cmdkIndex;
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
        initConnStatus();
        await loadData();
        renderSidebarTiles();
        initDrawer();
        initOpenTvButton();
        initResetZoomButton();
        initMansfieldControls();
        initChartViewTabs();
        initChartModal();
        initChartFullscreen();
        initStageFilter();
        initMiniChartHoverPreview();
        updateSortHeaderClasses();
        renderTable(); // renderowane od razu (nie tylko po rozwinięciu) — na mobile lista jest domyślnym widokiem
        buildSearchIndex();
        initCmdk();
        // Żadna spółka nie jest wybrana z góry — wykres pokazuje się dopiero w
        // okienku po kliknięciu wiersza/kafelka (patrz selectTicker/openChartModal).
        hideLoadingOverlay();
    })();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
}

// Eksport wyłącznie dla test runnera Node (tests/js/) — nie ładowany
// i bez efektu w przeglądarce (module tam nie istnieje).
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        state, buildSearchIndex, getCmdkIndex,
    };
}
