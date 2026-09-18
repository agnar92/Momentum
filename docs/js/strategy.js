
// ============================================================
// strategy.html — testowanie strategii wieloetapowej (na życzenie
// użytkownika): (1) filtr trendu SP500 (SMA200 dzienna LUB SMA40 tygodniowa —
// patrz compute_sp500_trend_filter w run_query.py), (2) siła relatywna
// sektorów SP500 wobec indeksu, (3) w najsilniejszym sektorze — siła
// relatywna spółek wobec ŚREDNIEJ sektora, top 10% (patrz
// compute_sector_relative_strength/export_sector_strategy w run_query.py,
// docs/data/sector_strategy.json). Strona jest CZYSTO informacyjna/do
// przeglądu — Etap Weinsteina i TTM Squeeze dla wybranych liderów NIE są tu
// liczone ponownie, tylko czytane z już wyeksportowanego docs/data/sp500.json
// (all_constituents), tak jak w reszcie dashboardu.
// ============================================================

// UNIVERSES/formatPrice/stageCellHtml zyja w js/shared.js, showToast/
// initConnStatus/hideLoadingOverlay w js/qol.js, renderScreenerTable w
// js/table-render.js — wszystkie trzy ladowane PRZED tym plikiem
// (patrz komentarze na gorze tych modulow). Node (tests/js/) nie laduje
// <script> tagow, wiec odtwarzamy to samo wspoldzielenie globali recznie
// tutaj (ten sam wzorzec co rebalance.js/chart.js).
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./qol.js"));
    Object.assign(globalThis, require("./table-render.js"));
}

let strategyData = null;   // docs/data/sector_strategy.json
let sp500Data = null;      // docs/data/sp500.json (all_constituents, do polaczenia Etap/TTM Squeeze po tickerze)
let trendChartInstance = null;
let trendChartMode = "daily"; // "daily" (SMA200) albo "weekly" (SMA40)

// Te same progi co TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS/TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS
// w run_query.py i w js/app.js (classifyTtmSqueeze) — MUSZĄ zostać zsynchronizowane.
// W odróżnieniu od classifyTtmSqueeze (ekran-screener, filtruje spółki OUT gdy nie
// pasują) ta wersja NIE odrzuca spółek — liderzy sektora tutaj są już wybrani przez
// Krok 2/3 strategii, więc zawsze pokazujemy jakiś status, łącznie z "neutralnym".
const STRATEGY_TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS = 5;
const STRATEGY_TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS = 3;

function squeezeStatusFor(c) {
    const t = c && c.ttm_squeeze_chart;
    if (!t || !t.dates || t.dates.length === 0) return { status: "none" };
    let idx = t.dates.length - 1;
    while (idx >= 0 && t.squeeze_on[idx] == null) idx--;
    if (idx < 0) return { status: "none" };

    const squeezeOn = t.squeeze_on[idx];
    const squeezeCount = t.squeeze_count[idx];
    const weeksSinceFire = t.weeks_since_fire[idx];
    const fireConsolidationWeeks = t.fire_consolidation_weeks[idx];

    const isFired = weeksSinceFire != null && weeksSinceFire <= STRATEGY_TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS
        && fireConsolidationWeeks != null && fireConsolidationWeeks > STRATEGY_TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS;
    if (isFired) return { status: "fired", weeks: weeksSinceFire };

    const isConsolidating = squeezeOn === true && squeezeCount > STRATEGY_TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS;
    if (isConsolidating) return { status: "consolidating", weeks: squeezeCount };

    return { status: "neutral" };
}

function squeezeStatusHtml(s) {
    if (s.status === "fired") return `<span class="squeeze-status squeeze-status-fired">🔥 Wybicie (${s.weeks} tyg. temu)</span>`;
    if (s.status === "consolidating") return `<span class="squeeze-status squeeze-status-consolidating">🌀 Konsolidacja (${s.weeks} tyg.)</span>`;
    if (s.status === "neutral") return `<span style="color:var(--text-faint)">— brak squeeze</span>`;
    return `<span style="color:var(--text-faint)">— brak danych</span>`;
}

async function loadStrategyData() {
    const res = await fetch("data/sector_strategy.json", { cache: "no-store" });
    strategyData = await res.json();
    const res2 = await fetch("data/sp500.json", { cache: "no-store" });
    sp500Data = await res2.json();
}

function sp500ByTicker() {
    const map = {};
    (sp500Data && (sp500Data.all_constituents || sp500Data.constituents) || []).forEach(c => { map[c.ticker] = c; });
    return map;
}

function renderTrend() {
    const trend = strategyData && strategyData.trend;
    const banner = document.getElementById("trendBanner");
    const refDateEl = document.getElementById("trendRefDate");
    refDateEl.textContent = strategyData ? strategyData.ref_date : "";

    if (!trend) {
        banner.className = "trend-banner";
        banner.textContent = "Brak danych trendu SP500 — uruchom pipeline (fetch_data.py + run_query.py).";
        return;
    }

    if (trend.in_growth_phase === true) {
        banner.className = "trend-banner growth";
        banner.textContent = "🟢 SP500 W FAZIE WZROSTU — cena powyżej SMA200 i/lub SMA40 tyg.";
    } else if (trend.in_growth_phase === false) {
        banner.className = "trend-banner no-growth";
        banner.textContent = "🔴 SP500 POZA FAZĄ WZROSTU — strategia sugeruje ostrożność przy szukaniu liderów sektorowych.";
    } else {
        banner.className = "trend-banner";
        banner.textContent = "Za mało historii cen, żeby policzyć SMA200/SMA40 tyg.";
    }

    document.getElementById("trendClose").textContent = trend.close != null ? `$${trend.close.toFixed(2)}` : "—";
    const sma200El = document.getElementById("trendSma200");
    sma200El.textContent = trend.sma200 != null ? `$${trend.sma200.toFixed(2)}` : "—";
    sma200El.className = "value" + (trend.above_sma200 == null ? "" : trend.above_sma200 ? " positive" : " negative");
    const sma40El = document.getElementById("trendSma40w");
    sma40El.textContent = trend.sma40w != null ? `$${trend.sma40w.toFixed(2)}` : "—";
    sma40El.className = "value" + (trend.above_sma40w == null ? "" : trend.above_sma40w ? " positive" : " negative");

    renderTrendChart();
}

function renderTrendChart() {
    const trend = strategyData && strategyData.trend;
    if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }
    if (!trend) return;

    const daily = trendChartMode === "daily";
    const series = daily ? (trend.daily_series || []) : (trend.weekly_series || []);
    const smaKey = daily ? "sma200" : "sma40";
    const smaLabel = daily ? "SMA200" : "SMA40 (tyg.)";
    // Chart.js ladowany z CDN (patrz strategy.html) — jego brak (offline, CDN
    // zablokowany) nie powinien zablokowac reszty strony (banner/stat-cards juz
    // ustawione w renderTrend PRZED tym wywolaniem) ani rzucic niezlapanym
    // wyjatkiem z wnetrza async init() w dole tego pliku.
    if (series.length === 0 || typeof Chart === "undefined") return;

    trendChartInstance = new Chart(document.getElementById("trendChart"), {
        type: "line",
        data: {
            labels: series.map(p => p.date),
            datasets: [
                { label: "SP500", data: series.map(p => p.close), borderColor: "#2ecc71", backgroundColor: "transparent", pointRadius: 0, borderWidth: 2 },
                { label: smaLabel, data: series.map(p => p[smaKey]), borderColor: "#8a8f9c", backgroundColor: "transparent", pointRadius: 0, borderWidth: 2, borderDash: [4, 3] },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { position: "bottom", labels: { color: "#8a8f9c", boxWidth: 12, font: { size: 10 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}` } },
            },
            scales: {
                x: { ticks: { color: "#8a8f9c", maxTicksLimit: 8 }, grid: { color: "#262a35" } },
                y: { ticks: { color: "#8a8f9c" }, grid: { color: "#262a35" } },
            },
        },
    });
}

function initTrendChartToggle() {
    document.getElementById("trendDailyBtn").addEventListener("click", () => {
        trendChartMode = "daily";
        document.getElementById("trendDailyBtn").classList.add("active");
        document.getElementById("trendWeeklyBtn").classList.remove("active");
        renderTrendChart();
    });
    document.getElementById("trendWeeklyBtn").addEventListener("click", () => {
        trendChartMode = "weekly";
        document.getElementById("trendWeeklyBtn").classList.add("active");
        document.getElementById("trendDailyBtn").classList.remove("active");
        renderTrendChart();
    });
}

function sectorRowHtml(s, position) {
    // data_source: "etf" (prawdziwy sektorowy ETF SPDR, patrz SECTOR_ETF_SYMBOLS
    // w fetch_data.py) albo "synthetic_fmc_weighted" (starszy substytut, gdy ETF
    // nie ma jeszcze danych w index_prices) — ten sam "(przybliżenie)" wzorzec
    // przejrzystości co "(ręcznie)" dla GEM-owego manual_entry w rebalance.js.
    const sourceNote = s.data_source === "synthetic_fmc_weighted"
        ? ` <span style="color:var(--text-faint)" title="Brak jeszcze danych sektorowego ETF-u w index_prices — przybliżenie: średnia zwrotów spółek sektora ważona kapitalizacją.">(przybliżenie)</span>`
        : "";
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td>${s.sector}${s.sector === (strategyData.sector_rs && strategyData.sector_rs.strongest_sector) ? " 🏆" : ""}${sourceNote}</td>
        <td>${s.count}</td>
        <td class="${s.momentum_pct >= 0 ? "positive" : "negative"}">${s.momentum_pct.toFixed(2)}%</td>
        <td class="${s.rs_vs_index_pct >= 0 ? "positive" : "negative"}">${s.rs_vs_index_pct >= 0 ? "+" : ""}${s.rs_vs_index_pct.toFixed(2)}%</td>
    `;
}

function renderSectorTable() {
    const sectorRs = strategyData && strategyData.sector_rs;
    const rows = (sectorRs && sectorRs.sectors) || [];
    const metaEl = document.getElementById("sectorMeta");

    renderScreenerTable({
        tbody: document.getElementById("sectorTableBody"),
        metaEl,
        allRows: rows,
        compareFn: () => 0, // juz posortowane malejaco po RS w backendzie (run_query.py)
        colspan: 5,
        emptyAllMsg: "Brak danych sektorowych — uruchom pipeline (fetch_data.py + run_query.py).",
        emptyFilteredMsg: "Brak danych.",
        metaText: () => sectorRs ? `Indeks SP500: ${sectorRs.index_return_pct >= 0 ? "+" : ""}${sectorRs.index_return_pct.toFixed(2)}% (${sectorRs.momentum_window})` : "",
        isSelected: s => sectorRs && s.sector === sectorRs.strongest_sector,
        rowHtml: (s, i) => sectorRowHtml(s, i + 1),
    });
}

function leaderRowHtml(c, position) {
    const stage = c._stage;
    const squeeze = squeezeStatusFor(c._sp500Record || {});
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${c.ticker}</td>
        <td>$${c.price.toFixed(2)}</td>
        <td class="${c.momentum_pct >= 0 ? "positive" : "negative"}">${c.momentum_pct.toFixed(2)}%</td>
        <td class="${c.rs_vs_sector_pct >= 0 ? "positive" : "negative"}">${c.rs_vs_sector_pct >= 0 ? "+" : ""}${c.rs_vs_sector_pct.toFixed(2)}%</td>
        <td>${stageCellHtml(stage)}</td>
        <td>${squeezeStatusHtml(squeeze)}</td>
        <td><button type="button" class="tv-row-btn chart-row-btn" data-ticker="${c.ticker}" title="Otwórz wykres ${c.ticker} (chart.html)">📈</button></td>
    `;
}

function renderLeadersTable() {
    const sectorRs = strategyData && strategyData.sector_rs;
    const sectorLabelEl = document.getElementById("leadersSectorLabel");
    sectorLabelEl.textContent = sectorRs && sectorRs.strongest_sector ? `— ${sectorRs.strongest_sector}` : "";

    const byTicker = sp500ByTicker();
    const rows = ((sectorRs && sectorRs.top_companies) || []).map(c => {
        const rec = byTicker[c.ticker];
        return Object.assign({}, c, {
            _stage: rec && rec.weekly_chart && rec.weekly_chart.current_stage,
            _sp500Record: rec,
        });
    });

    renderScreenerTable({
        tbody: document.getElementById("leadersTableBody"),
        metaEl: document.getElementById("leadersMeta"),
        allRows: rows,
        compareFn: () => 0, // juz posortowane malejaco po RS vs sektora w backendzie
        colspan: 8,
        emptyAllMsg: "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).",
        emptyFilteredMsg: "Brak danych.",
        metaText: () => strategyData ? `Rebalans: ${strategyData.ref_date} · top ${rows.length} spółek` : "",
        rowHtml: (c, i) => leaderRowHtml(c, i + 1),
        afterRender: (tbody) => {
            tbody.querySelectorAll(".chart-row-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const params = new URLSearchParams({
                        ticker: btn.dataset.ticker, universe: "SP500", back: "strategy.html",
                    });
                    window.location.href = `chart.html?${params.toString()}`;
                });
            });
        },
    });
}

function renderAll() {
    // Tabele sektorow/liderow NIE zaleza od Chart.js — renderowane PRZED
    // renderTrend() (ktora na koncu tworzy wykres Chart.js), zeby ewentualny
    // problem z CDN Chart.js (offline, zablokowany hosting) nie zablokowal
    // reszty strony — ten sam porzadek co w rebalance.js::init (wykresy
    // Chart.js na koncu, po tabelach).
    renderSectorTable();
    renderLeadersTable();
    renderTrend();
}

// typeof document check: pozwala wczytac ten plik przez require() w testach
// Node (patrz tests/js/) bez uruchamiania inicjalizacji strony.
if (typeof document !== "undefined") {
    (async function init() {
        initConnStatus();
        initTrendChartToggle();
        try {
            await loadStrategyData();
        } catch (e) {
            strategyData = null;
            sp500Data = null;
        }
        renderAll();
        hideLoadingOverlay();
    })();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
}

// Eksport wylacznie dla test runnera Node (tests/js/) — nie ladowany
// i bez efektu w przegladarce (module tam nie istnieje).
if (typeof module !== "undefined" && module.exports) {
    module.exports = { squeezeStatusFor };
}
