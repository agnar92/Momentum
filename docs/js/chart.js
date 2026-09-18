
// ============================================================
// chart.html — osobna, pełnoekranowa strona z JEDNYM wykresem stage-analysis
// (patrz komentarz na górze js/chart-render.js dla samego silnika wykresu).
// Powstała na wyraźną prośbę użytkownika: klik w wiersz Kroku 2 rebalansera
// (rebalance.js) ma otwierać wykres jako OSOBNĄ STRONĘ (nie tryb w obrębie
// dashboardu, jak wcześniej) — z przyciskiem "wstecz", który pamięta, skąd
// się tu trafiło.
//
// Ticker/uniwersum/adres powrotu przychodzą w query stringu
// (?ticker=&universe=&back=) — dzięki temu strona przetrwa odświeżenie i
// można ją zakładkować/wysłać komuś jako link, bez żadnego stanu w
// localStorage/sessionStorage. `back` to jawny adres podany przez stronę,
// która tu skierowała (patrz showPickerChart w rebalance.js); gdy go
// brakuje, resolveBackHref spada na document.referrer (tej samej domeny),
// a na końcu na index.html — więc przycisk "Powrót" działa nawet, gdy ktoś
// otworzy ten link bezpośrednio.
// ============================================================

// PLN_UNIVERSES/tvSymbolFor/tvUrlFor/UNIVERSE_LABELS zyja teraz w
// js/shared.js, ktore chart.html laduje PRZED tym plikiem (patrz komentarz
// na gorze shared.js) — nie sa juz wlasna kopia tej strony.
// initConnStatus/hideLoadingOverlay/showToast zyja analogicznie w js/qol.js
// (patrz komentarz na gorze tamtego pliku), ladowanym tuz po shared.js.
// Node (tests/js/) nie laduje <script> tagow, wiec odtwarzamy to samo
// wspoldzielenie globali recznie tutaj (ten sam wzorzec co rebalance.js).
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./qol.js"));
}

let selectedTicker = null;
let selectedUniverse = null;
let chartRangeMode = "3m";
let currentRsEntry = null;

// Adres, pod ktory wraca przycisk "Powrót" — patrz komentarz na gorze pliku.
function resolveBackHref(explicitBack) {
    if (explicitBack) return explicitBack;
    if (document.referrer) {
        try {
            const refUrl = new URL(document.referrer);
            if (refUrl.origin === window.location.origin) return document.referrer;
        } catch (e) { /* referrer nie do sparsowania — spadamy na fallback nizej */ }
    }
    return "index.html";
}

function updateChartTickerLabel() {
    const label = document.getElementById("chartTickerLabel");
    if (!label) return;
    if (!selectedTicker) { label.textContent = ""; return; }
    const parts = [selectedTicker];
    if (selectedUniverse && UNIVERSE_LABELS[selectedUniverse]) parts.push(UNIVERSE_LABELS[selectedUniverse].replace(" Momentum", ""));
    if (currentRsEntry && currentRsEntry.sector) parts.push(currentRsEntry.sector);
    label.textContent = parts.join(" · ");
}

// Odpowiednik updateChartArea() z app.js, ale bez trybu pełnoekranowego i bez
// zakładki "Dane spółki (TradingView)" — tej strony te dwie rzeczy nie
// dotyczą (cała strona i tak już jest "pełnoekranowa", a TV tab to osobna,
// szersza funkcja dashboardu, nie potrzebna tu).
function renderChartPanel() {
    const hasRsChart = !!(currentRsEntry && currentRsEntry.weekly_chart);

    const noChartMsg = document.getElementById("noChartMessage");
    const rsChartPanel = document.getElementById("rsChartPanel");
    const rsVolumePanel = document.getElementById("rsVolumePanel");
    const rsMansfieldPanel = document.getElementById("rsMansfieldPanel");
    const rsSqueezePanel = document.getElementById("rsSqueezePanel");
    const stageLegend = document.getElementById("stageLegend");
    if (noChartMsg) noChartMsg.hidden = hasRsChart;
    if (rsChartPanel) rsChartPanel.hidden = !hasRsChart;
    if (rsVolumePanel) rsVolumePanel.hidden = !hasRsChart;
    if (rsMansfieldPanel) rsMansfieldPanel.hidden = !hasRsChart;
    if (rsSqueezePanel) rsSqueezePanel.hidden = !hasRsChart;
    if (stageLegend) stageLegend.hidden = !hasRsChart;

    if (hasRsChart) {
        renderRelativeStrengthChart(selectedTicker, currentRsEntry, chartRangeMode);
    } else {
        renderStageBadge(null);
        destroyChartInstances();
    }
    updateChartTickerLabel();
}

function initChartRangeToggle() {
    const btn3m = document.getElementById("chartRange3mBtn");
    const btnFull = document.getElementById("chartRangeFullBtn");
    if (!btn3m || !btnFull) return;
    const setMode = (mode) => {
        chartRangeMode = mode;
        btn3m.classList.toggle("active", mode === "3m");
        btnFull.classList.toggle("active", mode === "full");
        renderChartPanel();
    };
    btn3m.addEventListener("click", () => setMode("3m"));
    btnFull.addEventListener("click", () => setMode("full"));
}

function initResetZoomButton() {
    const btn = document.getElementById("resetZoomBtn");
    if (btn) btn.addEventListener("click", resetChartZoom);
}

function initOpenTvButton() {
    const btn = document.getElementById("openTvBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
        if (!selectedTicker) return;
        window.open(tvUrlFor(selectedTicker, selectedUniverse), "_blank", "noopener");
    });
}

async function init() {
    initConnStatus();
    const params = new URLSearchParams(window.location.search);
    selectedTicker = params.get("ticker");
    selectedUniverse = params.get("universe");

    const backHref = resolveBackHref(params.get("back"));
    const backBtn = document.getElementById("chartBackBtn");
    if (backBtn) backBtn.addEventListener("click", () => { window.location.href = backHref; });

    initChartRangeToggle();
    initResetZoomButton();
    initOpenTvButton();

    if (!selectedTicker || !selectedUniverse) {
        const errorState = document.getElementById("chartLoadError");
        if (errorState) errorState.hidden = false;
        hideLoadingOverlay();
        return;
    }

    try {
        const res = await fetch(`data/${selectedUniverse.toLowerCase()}.json`, { cache: "no-store" });
        const data = await res.json();
        const list = data.all_constituents || data.constituents || [];
        const entry = list.find(c => c.ticker === selectedTicker);
        currentRsEntry = entry ? { ...entry, universe: selectedUniverse } : null;
    } catch (e) {
        currentRsEntry = null;
    }

    renderChartPanel();
    hideLoadingOverlay();
}

// typeof document check: pozwala wczytać ten plik przez `require()` w testach
// Node (patrz tests/js/) bez uruchamiania inicjalizacji strony — w przeglądarce
// document zawsze istnieje, więc zachowanie się nie zmienia.
if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
}
