
const UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES", "WIG20", "MWIG40"];
const UNIVERSE_LABELS = {
    SP500: "S&P 500 Momentum",
    NASDAQ100: "Nasdaq 100 Momentum",
    DOWJONES: "Dow Jones Momentum",
    WIG20: "WIG20 Momentum",
    MWIG40: "mWIG40 Momentum"
};
// WIG20/mWIG40 są notowane w PLN (a nie USD jak reszta uniwersów) — patrz
// formatPrice — oraz na GPW w TradingView, stąd sufiks "GPW:" w tvSymbolFor.
const PLN_UNIVERSES = new Set(["WIG20", "MWIG40"]);

function formatPrice(price, universe) {
    return PLN_UNIVERSES.has(universe) ? `${price.toFixed(2)} zł` : `$${price.toFixed(2)}`;
}

function tvSymbolFor(ticker, universe) {
    return PLN_UNIVERSES.has(universe) ? `GPW:${ticker}` : ticker;
}

// Link do PEŁNEJ strony TradingView (nie osadzony widget) dla danego tickera —
// otwierany w nowej karcie przyciskiem "Otwórz w TradingView" (patrz
// initOpenTvButton/updateChartArea) i przyciskami "TV" w wierszach tabel.
function tvUrlFor(ticker, universe) {
    return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbolFor(ticker, universe))}`;
}

// Mały przycisk-link "TV" do wiersza tabeli — otwiera tradingview.com w nowej
// karcie, bez zaznaczania wiersza (stopPropagation, zeby klik nie odpalal tez
// selectTicker na <tr>).
function tvRowButtonHtml(ticker, universe) {
    return `<button type="button" class="tv-row-btn" data-ticker="${ticker}" data-universe="${universe}" title="Otwórz ${ticker} w TradingView (nowa karta)">TV</button>`;
}

function bindTvRowButtons(container) {
    container.querySelectorAll(".tv-row-btn").forEach(btn => {
        btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            window.open(tvUrlFor(btn.dataset.ticker, btn.dataset.universe), "_blank", "noopener");
        });
    });
}

const state = {
    data: {},
    gem: { indices: [], leaders: [] },
    rs: { universes: {} },
    selectedTicker: null,
    selectedUniverse: null,
    currentRsEntry: null,
    drawerOpen: false,
    drawerUniverse: "SP500",
    stageFilter: "ALL",
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
// NASDAQ100/DOWJONES w oknie 12M (docs/data/global_equity_momentum.json /
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

// Siła relatywna: dla NASDAQ100/DOWJONES (docs/data/relative_strength.json /
// run_query.py::compute_relative_strength_leaders) pokazuje spółki, których
// momentum (to samo okno co momentum_value 3 głównych uniwersów, M-14/M-2 z
// fallbackiem M-11/M-2) przebiło momentum samego indeksu, posortowane malejąco
// po przewadze (zwrot spółki - zwrot indeksu). Kafelki łączą oba uniwersy w
// jedną listę.
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
                <span>${UNIVERSE_LABELS[universe].replace(" Momentum", "")} (${u.momentum_window})</span>
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
        tile.title = `${c.ticker} — ${UNIVERSE_LABELS[c.universe].replace(" Momentum", "")} · zwrot `
            + `${c.return_pct.toFixed(2)}% vs indeks ${c.index_return_pct.toFixed(2)}% · przewaga +${c.relative_strength_pct.toFixed(2)}pp`;
        tile.dataset.ticker = c.ticker;
        tile.dataset.universe = c.universe;
        if (c.ticker === state.selectedTicker) tile.classList.add("selected");
        tile.addEventListener("click", () => selectTicker(c.ticker, c.universe));
        container.appendChild(tile);
    });
    if (combined.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:10px;color:var(--text-faint);grid-column:1/-1;padding:4px 0;";
        empty.textContent = "brak danych";
        container.appendChild(empty);
    }
}

// Kazdy ticker z glownego uniwersum (state.data[u].constituents) ma teraz wlasny
// weekly_chart/mansfield_chart (patrz process_universe/export_json w run_query.py) —
// nie tylko liderzy panelu Sily Relatywnej. Lider RS ma pierwszenstwo (niesie tez
// relative_strength_pct/index_return_pct), ale dla kazdego innego tickera spadamy
// do jego wlasnego wpisu w state.data[universe].constituents.
function findRsEntry(ticker, universe) {
    const rsLeader = combinedRelativeStrengthLeaders().find(r => r.ticker === ticker);
    if (rsLeader) return rsLeader;
    const universeEntry = ((state.data[universe] && state.data[universe].constituents) || [])
        .find(c => c.ticker === ticker);
    return (universeEntry && universeEntry.weekly_chart) ? { ...universeEntry, universe } : null;
}

function selectTicker(ticker, universe) {
    state.selectedTicker = ticker;
    state.selectedUniverse = universe;
    document.querySelectorAll(".ticker-tile").forEach(t => {
        t.classList.toggle("selected", t.dataset.ticker === ticker);
    });
    document.querySelectorAll("#momentumTableBody tr, #gemTableBody tr, #rsTableBody tr").forEach(tr => {
        tr.classList.toggle("row-selected", tr.dataset.ticker === ticker);
    });
    state.currentRsEntry = findRsEntry(ticker, universe);
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
// OBSZAR WYKRESU: zawsze własny wykres tygodniowy Siły Relatywnej (stage
// analysis — "wykres 10:30" + oscylator Mansfield RS, patrz
// renderRelativeStrengthChart), z jednym przyciskiem "Otwórz w TradingView"
// (#openTvBtn) do pełnej strony tradingview.com w nowej karcie zamiast
// osadzonego widgetu — patrz initOpenTvButton. Gdy dana spółka nie ma
// własnego wykresu (np. za mało historii cen), pokazujemy #noChartMessage
// zamiast pustych paneli — przycisk TV dziala zawsze, niezaleznie od tego.
// ============================================================
let rsChartInstance = null;

function updateChartArea() {
    const symbol = state.selectedTicker;
    const rsEntry = state.currentRsEntry;
    const hasRsChart = !!(rsEntry && rsEntry.weekly_chart);

    const noChartMsg = document.getElementById("noChartMessage");
    const rsChartPanel = document.getElementById("rsChartPanel");
    const rsMansfieldPanel = document.getElementById("rsMansfieldPanel");
    const stageLegend = document.getElementById("stageLegend");
    if (noChartMsg) noChartMsg.hidden = hasRsChart;
    if (rsChartPanel) rsChartPanel.hidden = !hasRsChart;
    if (rsMansfieldPanel) rsMansfieldPanel.hidden = !hasRsChart;
    if (stageLegend) stageLegend.hidden = !hasRsChart;

    if (hasRsChart) {
        renderRelativeStrengthChart(symbol, rsEntry);
    } else {
        renderStageBadge(null);
        if (rsChartInstance) { rsChartInstance.destroy(); rsChartInstance = null; }
        if (rsMansfieldChartInstance) { rsMansfieldChartInstance.destroy(); rsMansfieldChartInstance = null; }
    }
}

function initOpenTvButton() {
    const btn = document.getElementById("openTvBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
        if (!state.selectedTicker) return;
        window.open(tvUrlFor(state.selectedTicker, state.selectedUniverse), "_blank", "noopener");
    });
}

let rsMansfieldChartInstance = null;

// Klasyfikacja etapow Weinsteina (Stage Analysis) dolaczona przez run_query.py
// (_compute_weinstein_stage_series) do kazdego tygodnia wykresu 10:30 — patrz
// weekly_chart.stage/signal/volume/buying_volume/buying_volume_ratio. Etykiety/
// kolory tylko do wyswietlania, logika klasyfikacji zyje wylacznie w backendzie.
const STAGE_LABELS = {
    "1": "Etap 1 — Baza",
    "2A": "Etap 2A — Świeże wybicie",
    "2B": "Etap 2B — Kontynuacja trendu",
    "3": "Etap 3 — Szczyt / dystrybucja",
    "4": "Etap 4 — Spadek",
};
const STAGE_DESCRIPTIONS = {
    "1": "Cena w ciasnej bazie (trading range) w pobliżu SMA30 — czekaj na wybicie ponad opór bazy.",
    "2A": "Świeże wybicie ponad opór bazy, potwierdzone wolumenem — klasyczny punkt wejścia.",
    "2B": "Trend trwa — kolejne wybicia kolejnych baz to punkty dokupienia (\"pyramiding\").",
    "3": "Trend się wypłaszcza po wzroście — rozważ realizację zysków, unikaj nowych wejść.",
    "4": "Cena pod opadającą SMA30 — trend spadkowy, poza rynkiem / bez nowych pozycji.",
};
const STAGE_COLORS = { "1": "#8a8f9c", "2A": "#2ecc71", "2B": "#26a65b", "3": "#e0a72e", "4": "#e0455a" };
// Sygnaly odzwierciedlaja ksiazkowy wykres "Trailing Stop Loss": kazda kolejna
// baza w tej samej fali Etapu 2 podnosi stop, 4./5. baza jest oznaczona jako
// bardziej ryzykowna, a WARNING_MA_SLOWING ostrzega o slabnacym tempie SMA30
// ZANIM stop faktycznie zostanie zlamany (EXIT_STOP).
const SIGNAL_LABELS = {
    ENTRY_2A: "Wejście (2A): wybicie z bazy potwierdzone wolumenem",
    ENTRY_2B: "Wejście (2B): wybicie kolejnej bazy w trwającym trendzie",
    ENTRY_2B_LATE: "Wejście (2B, późna baza): 4.+ baza w tym trendzie — podwyższone ryzyko niepowodzenia",
    WARNING_MA_SLOWING: "Ostrzeżenie: SMA30 traci tempo wzrostu — zacieśnij stop-loss",
    EXIT_STOP: "Wyjście: cena złamała trailing stop-loss",
};
const SIGNAL_MARKER_COLORS = {
    ENTRY_2A: "#2ecc71", ENTRY_2B: "#26a65b", ENTRY_2B_LATE: "#e0a72e",
    WARNING_MA_SLOWING: "#e0a72e", EXIT_STOP: "#e0455a",
};
const STAGE_BREAKOUT_VOLUME_RATIO = 1.5; // musi byc zgodne z STAGE_BREAKOUT_VOLUME_RATIO w run_query.py — koloruje slupki wolumenu

// Mala kropka + skrot etapu do kolumny "Etap" w glownej tabeli momentum (patrz
// renderTable) — ten sam STAGE_COLORS/STAGE_LABELS co odznaka nad wykresem.
function stageCellHtml(stage) {
    if (!stage || !STAGE_LABELS[stage]) return '<span class="stage-cell" style="color:var(--text-faint)">—</span>';
    return `<span class="stage-cell" style="color:${STAGE_COLORS[stage]}" title="${STAGE_LABELS[stage]}">`
        + `<span class="stage-dot" style="background:${STAGE_COLORS[stage]}"></span>${stage}</span>`;
}

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

function renderStageBadge(stage) {
    const badge = document.getElementById("stageBadge");
    if (!badge) return;
    if (!stage || !STAGE_LABELS[stage]) { badge.innerHTML = ""; return; }
    badge.innerHTML = `<span class="stage-dot" style="background:${STAGE_COLORS[stage]}"></span>`
        + `<span style="color:${STAGE_COLORS[stage]}">${STAGE_LABELS[stage]}</span>`
        + `<span class="stage-desc">${STAGE_DESCRIPTIONS[stage]}</span>`;
}

// Dwa wykresy jeden pod drugim (patrz .rs-chart-container w style.css), w stylu
// stage analysis (Stan Weinstein / Dr Eric Wish):
// 1. "Wykres 10:30" — cena tygodniowa spółki + SMA 10-tyg./30-tyg. i poziom
//    własnego indeksu, wszystko przeliczone na % zmiany względem pierwszego
//    wyświetlanego tygodnia OKNA MOMENTUM (patrz compute_relative_strength_chart)
//    — jedna wspólna skala, żeby jednym spojrzeniem było widać, która linia
//    rośnie szybciej: spółka POWYŻEJ linii indeksu = silniejsza od rynku. Dokłada
//    się do niego tygodniowy wolumen (słupki na osobnej, ukrytej skali u dołu —
//    klasyczny układ "cena + wolumen") oraz znaczniki wejścia/wyjścia na linii
//    ceny, wyliczone backendowo (patrz STAGE_LABELS/SIGNAL_LABELS wyżej i
//    _compute_weinstein_stage_series w run_query.py). Siła relatywna względem
//    indeksu NIE wchodzi w tę klasyfikację etapów (pomysł odrzucony wcześniej ze
//    względu na trudność implementacji) — indeks tu służy tylko jako linia
//    porównawcza na wykresie, tak jak wcześniej.
// 2. Oscylator Mansfield RS w dwóch wygładzeniach — krótkoterminowym (~3 mies.)
//    i średnioterminowym (~6 mies.) — na WŁASNYM, znacznie krótszym ostatnim
//    ~6-miesięcznym oknie (patrz compute_mansfield_rs_chart), celowo NIE tym
//    samym co panel 1: dwa różne horyzonty tego samego sygnału, które mogą się
//    rozjeżdżać (krótkoterminowe przyspieszenie/spowolnienie może wyprzedzać
//    średnioterminowy trend).
function renderRelativeStrengthChart(symbol, rsEntry) {
    const chartData = rsEntry.weekly_chart;
    const mansfieldData = rsEntry.mansfield_chart;
    const rsContainer = document.getElementById("rs_chart");
    const canvas = document.getElementById("rsChartCanvas");
    const mansfieldCanvas = document.getElementById("rsMansfieldCanvas");
    if (!canvas || !chartData) return;

    if (typeof Chart === "undefined") {
        if (rsContainer) rsContainer.innerHTML = '<div class="empty-state">Nie udało się załadować biblioteki wykresu (sprawdź połączenie z internetem).</div>';
        return;
    }
    if (rsChartInstance) { rsChartInstance.destroy(); rsChartInstance = null; }
    if (rsMansfieldChartInstance) { rsMansfieldChartInstance.destroy(); rsMansfieldChartInstance = null; }

    renderStageBadge(chartData.current_stage);

    const pctFmt = (v) => (v == null ? "—" : `${v.toFixed(2)}%`);
    const signals = chartData.signal || [];
    const volumes = chartData.volume || [];
    // "buying_volume" to CZESC tygodniowego wolumenu przypisana kupujacym metoda
    // Close Location Value (patrz _weekly_close_series w run_query.py — NIE jest to
    // prawdziwy podzial zlecen kupna/sprzedazy, ktorego zwykle OHLCV nie daje, tylko
    // standardowe przyblizenie: im blizej szczytu tygodnia zamkniecie, tym wiekszy
    // udzial wolumenu liczy sie jako "kupujacy"). Potwierdzenie wybicia patrzy
    // WYLACZNIE na ten wolumen, nie na total — wysoki total wolumen przy dominujacej
    // sprzedazy (dystrybucja) NIE powinien wygladac jak potwierdzone wybicie.
    const buyingVolumes = chartData.buying_volume || [];
    const buyingVolumeRatios = chartData.buying_volume_ratio || [];
    const sellingVolumes = volumes.map((v, i) => (
        v != null && buyingVolumes[i] != null ? Math.max(0, v - buyingVolumes[i]) : null
    ));
    const baseCounts = chartData.base_count || [];

    // Znaczniki wejscia/wyjscia na linii ceny: trojkat w gore (zielony/bursztynowy
    // dla pozniejszej, bardziej ryzykownej bazy) dla wejsc 2A/2B/2B_LATE, trojkat
    // w dol (czerwony) dla EXIT_STOP, kwadrat (bursztynowy) dla ostrzezenia o
    // slabnacym tempie SMA30. Reszta tygodni: bez punktu (radius 0), jak wczesniej.
    const pointStyles = signals.map((s) => (s === "WARNING_MA_SLOWING" ? "rect" : "triangle"));
    const pointRadii = signals.map((s) => (s ? 7 : 0));
    const pointColors = signals.map((s) => SIGNAL_MARKER_COLORS[s] || "#2ecc71");
    const pointRotations = signals.map((s) => (s === "EXIT_STOP" ? 180 : 0));

    // Slupki tygodniowego wolumenu na wlasnej, ukrytej skali (max ustawiony na
    // wielokrotnosc szczytu wolumenu, zeby slupki zajmowaly tylko dolny pasek
    // wykresu — nie konkurowaly wizualnie z liniami % zmiany), skladane z dwoch
    // segmentow (stack: "volume") — dol = wolumen kupujacych, gora = sprzedajacych,
    // zeby od razu bylo widac PROPORCJE, nie tylko wysokosc calego slupka. Segment
    // kupujacych jest jasniejszy, gdy buying_volume_ratio >= STAGE_BREAKOUT_VOLUME_RATIO
    // (potwierdzone wybicie wolumenem KUPUJACYCH — patrz run_query.py).
    const maxVolume = Math.max(1, ...volumes.filter((v) => v != null));
    const buyingColors = buyingVolumes.map((v, i) => {
        const ratio = buyingVolumeRatios[i];
        return (ratio != null && ratio >= STAGE_BREAKOUT_VOLUME_RATIO) ? "rgba(46, 204, 113, 0.85)" : "rgba(46, 204, 113, 0.35)";
    });
    const sellingColor = "rgba(224, 69, 90, 0.35)";

    rsChartInstance = new Chart(canvas, {
        type: "line",
        data: {
            labels: chartData.dates,
            datasets: [
                {
                    label: `${symbol} (zmiana %)`, data: chartData.close_pct, borderColor: "#2ecc71",
                    backgroundColor: "transparent", pointRadius: pointRadii, pointStyle: pointStyles,
                    pointBackgroundColor: pointColors, pointBorderColor: pointColors, pointRotation: pointRotations,
                    borderWidth: 2, order: 1,
                },
                { label: "SMA 10-tyg.", data: chartData.sma10_pct, borderColor: "#e0a72e", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5, borderDash: [2, 2], order: 1 },
                { label: "SMA 30-tyg.", data: chartData.sma30_pct, borderColor: "#8a8f9c", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3], order: 1 },
                { label: `${rsEntry.universe} (indeks, zmiana %)`, data: chartData.index_pct, borderColor: "#4fa6e0", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5, order: 1 },
                {
                    // Trailing stop-loss (patrz "stop_level_pct" w compute_relative_strength_chart) —
                    // ten sam pomysl co ksiazkowy wykres "Trailing Stop Loss": linia podnoszona
                    // wraz z kolejnymi bazami, nigdy obnizana; None poza aktywna fala Etapu 2
                    // (Chart.js domyslnie NIE laczy linii przez null, wiec przerywa sie sama).
                    label: "Trailing stop-loss", data: chartData.stop_level_pct, borderColor: "#e0455a",
                    backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5, borderDash: [6, 3], order: 1,
                },
                {
                    type: "bar", label: "Wolumen kupujących (tyg.)", data: buyingVolumes, backgroundColor: buyingColors,
                    yAxisID: "yVolume", stack: "volume", order: 2, barPercentage: 0.7, categoryPercentage: 0.9,
                },
                {
                    type: "bar", label: "Wolumen sprzedających (tyg.)", data: sellingVolumes, backgroundColor: sellingColor,
                    yAxisID: "yVolume", stack: "volume", order: 2, barPercentage: 0.7, categoryPercentage: 0.9,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    position: "bottom", labels: { color: "#8a8f9c", boxWidth: 12, font: { size: 10 } },
                    filter: (item) => item.text !== "Wolumen kupujących (tyg.)" && item.text !== "Wolumen sprzedających (tyg.)",
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.label === "Wolumen kupujących (tyg.)") {
                                const ratio = buyingVolumeRatios[ctx.dataIndex];
                                const ratioTxt = ratio != null ? ` (${ratio.toFixed(2)}x śr.)` : "";
                                return `Kupujący: ${ctx.parsed.y.toLocaleString("pl-PL")}${ratioTxt}`;
                            }
                            if (ctx.dataset.label === "Wolumen sprzedających (tyg.)") {
                                return `Sprzedający: ${ctx.parsed.y.toLocaleString("pl-PL")}`;
                            }
                            const base = `${ctx.dataset.label}: ${pctFmt(ctx.parsed.y)}`;
                            if (ctx.datasetIndex === 0 && signals[ctx.dataIndex]) {
                                const sig = signals[ctx.dataIndex];
                                const bc = baseCounts[ctx.dataIndex];
                                const sigTxt = (bc != null && (sig === "ENTRY_2B" || sig === "ENTRY_2B_LATE"))
                                    ? `${SIGNAL_LABELS[sig]} (${bc}. baza)` : SIGNAL_LABELS[sig];
                                return [base, sigTxt];
                            }
                            return base;
                        },
                    },
                },
            },
            scales: {
                x: { ticks: { color: "#8a8f9c", maxTicksLimit: 10 }, grid: { color: "#262a35" } },
                y: { ticks: { color: "#8a8f9c", callback: pctFmt }, grid: { color: "#262a35" } },
                yVolume: { display: false, stacked: true, min: 0, max: maxVolume * 4 },
            },
        },
    });

    if (mansfieldCanvas && mansfieldData) {
        const zeroLine = mansfieldData.dates.map(() => 0);
        rsMansfieldChartInstance = new Chart(mansfieldCanvas, {
            type: "line",
            data: {
                labels: mansfieldData.dates,
                datasets: [
                    { label: "RSM krótkoterminowy (~3M)", data: mansfieldData.rsm_short, borderColor: "#4fa6e0", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5 },
                    { label: "RSM średnioterminowy (~6M)", data: mansfieldData.rsm_medium, borderColor: "#c77dff", backgroundColor: "transparent", pointRadius: 0, borderWidth: 2 },
                    { label: "0", data: zeroLine, borderColor: "#565c6b", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1, borderDash: [3, 3] },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { position: "bottom", labels: { color: "#8a8f9c", boxWidth: 12, font: { size: 10 } } },
                    tooltip: {
                        filter: (ctx) => ctx.datasetIndex !== 2,
                        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y == null ? "—" : ctx.parsed.y.toFixed(2)}` },
                    },
                },
                scales: {
                    x: { ticks: { color: "#8a8f9c", maxTicksLimit: 8 }, grid: { color: "#262a35" } },
                    y: { ticks: { color: "#8a8f9c" }, grid: { color: "#262a35" } },
                },
            },
        });
    } else if (mansfieldCanvas) {
        const ctx = mansfieldCanvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, mansfieldCanvas.width, mansfieldCanvas.height);
    }
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
    // Filtr etapow ma sens tylko dla pelnej listy skladnikow jednego uniwersum
    // (GEM/RS to juz odfiltrowane, wybrane podzbiory).
    const stageFilterBar = document.getElementById("stageFilterBar");
    if (stageFilterBar) stageFilterBar.hidden = isGem || isRs;
    document.getElementById("drawerTitle").textContent = isGem
        ? "Pełna tabela — Global Equity Momentum"
        : isRs
            ? "Pełna tabela — Siła Relatywna"
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
        tr.innerHTML = `<td colspan="8" class="empty-state">Brak danych.</td>`;
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
            <td>${tvRowButtonHtml(r.ticker, g.winner)}</td>
        `;
        tr.addEventListener("click", () => selectTicker(r.ticker, g.winner));
        tbody.appendChild(tr);
    });
    bindTvRowButtons(tbody);
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
        tr.innerHTML = `<td colspan="9" class="empty-state">Brak danych.</td>`;
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
            <td>${formatPrice(r.price, r.universe)}</td>
            <td class="${r.return_pct >= 0 ? "positive" : "negative"}">${r.return_pct.toFixed(2)}%</td>
            <td class="${r.index_return_pct >= 0 ? "positive" : "negative"}">${r.index_return_pct.toFixed(2)}%</td>
            <td class="positive">+${r.relative_strength_pct.toFixed(2)}pp</td>
            <td>${tvRowButtonHtml(r.ticker, r.universe)}</td>
        `;
        tr.addEventListener("click", () => selectTicker(r.ticker, r.universe));
        tbody.appendChild(tr);
    });
    bindTvRowButtons(tbody);
}

function renderTable() {
    const d = state.data[state.drawerUniverse];
    const meta = document.getElementById("drawerMeta");
    const allRows = d.constituents || [];
    let rows = state.stageFilter === "ALL"
        ? allRows.slice()
        : allRows.filter(r => matchesStageFilter(r.weekly_chart && r.weekly_chart.current_stage));

    if (d.ref_date) {
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
        meta.textContent = text;
        meta.title = d.fmc_note || "";
    } else {
        meta.textContent = "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).";
    }

    rows.sort((a, b) => compareRows(a, b, state.sortKey, state.sortDir));

    const tbody = document.getElementById("momentumTableBody");
    tbody.innerHTML = "";
    const maxWeight = rows.length ? Math.max(...rows.map(r => r.weight_pct), 0.01) : 1;

    if (rows.length === 0) {
        const tr = document.createElement("tr");
        const msg = allRows.length === 0
            ? "Brak danych."
            : "Żadna spółka nie pasuje do wybranego etapu.";
        tr.innerHTML = `<td colspan="12" class="empty-state">${msg}</td>`;
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
            <td>${stageCellHtml(r.weekly_chart && r.weekly_chart.current_stage)}</td>
            <td>${tvRowButtonHtml(r.ticker, state.drawerUniverse)}</td>
        `;
        tr.addEventListener("click", () => selectTicker(r.ticker, state.drawerUniverse));
        tbody.appendChild(tr);
    });
    bindTvRowButtons(tbody);
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
        initOpenTvButton();
        initStageFilter();
        updateSortHeaderClasses();
        renderTable(); // renderowane od razu (nie tylko po rozwinięciu) — na mobile lista jest domyślnym widokiem
        buildSearchIndex();
        initCmdk();
        document.getElementById("chartBackBtn").addEventListener("click", () => {
            document.querySelector(".workspace").classList.remove("mobile-chart-view");
        });
        state.selectedTicker = "SPY";
        state.selectedUniverse = "SP500";
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

