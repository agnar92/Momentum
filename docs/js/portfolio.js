
let portfolioData = null;
let currentUniverse = "blended";
let equityChart = null;
let drawdownChart = null;

const CHART_GREEN = "#2ecc71";
const CHART_RED = "#e0455a";

async function loadPortfolioData() {
    try {
        const res = await fetch("data/portfolio.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        portfolioData = await res.json();
    } catch (e) {
        console.error("Nie udało się wczytać portfolio.json:", e);
        portfolioData = { universes: {}, blended: { dates: [], equity_pct: [], drawdown_pct: [], cagr_pct: null, max_drawdown_pct: null } };
    }
}

function getSeries(universeKey) {
    if (universeKey === "blended") return portfolioData.blended;
    return portfolioData.universes[universeKey] || { dates: [], equity_pct: [], drawdown_pct: [], cagr_pct: null, max_drawdown_pct: null };
}

function fmtPct(v, digits = 2) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function renderStats(series) {
    const totalReturnEl = document.getElementById("statTotalReturn");
    const cagrEl = document.getElementById("statCagr");
    const maxDDEl = document.getElementById("statMaxDD");
    const periodsEl = document.getElementById("statPeriods");

    const lastEquity = series.equity_pct.length ? series.equity_pct[series.equity_pct.length - 1] : null;

    totalReturnEl.textContent = fmtPct(lastEquity);
    totalReturnEl.className = "value " + (lastEquity >= 0 ? "positive" : "negative");

    cagrEl.textContent = fmtPct(series.cagr_pct);
    cagrEl.className = "value " + (series.cagr_pct >= 0 ? "positive" : "negative");

    maxDDEl.textContent = fmtPct(series.max_drawdown_pct);
    maxDDEl.className = "value negative";

    periodsEl.textContent = series.dates.length;
}

function renderCharts(series) {
    const emptyState = document.getElementById("emptyState");
    const hasData = series.dates && series.dates.length > 0;
    document.querySelector(".chart-card:nth-of-type(1)")?.classList.toggle("hidden", !hasData);
    emptyState.style.display = hasData ? "none" : "block";

    if (!hasData) {
        if (equityChart) { equityChart.destroy(); equityChart = null; }
        if (drawdownChart) { drawdownChart.destroy(); drawdownChart = null; }
        return;
    }

    const equityCtx = document.getElementById("equityChart").getContext("2d");
    const ddCtx = document.getElementById("drawdownChart").getContext("2d");

    const lineColor = series.equity_pct[series.equity_pct.length - 1] >= 0 ? CHART_GREEN : CHART_RED;

    if (equityChart) equityChart.destroy();
    equityChart = new Chart(equityCtx, {
        type: "line",
        data: {
            labels: series.dates,
            datasets: [{
                label: "Skumulowany zwrot (%)",
                data: series.equity_pct,
                borderColor: lineColor,
                backgroundColor: lineColor + "22",
                fill: true,
                tension: 0.15,
                pointRadius: 2,
                pointHoverRadius: 4
            }]
        },
        options: chartOptions("%")
    });

    if (drawdownChart) drawdownChart.destroy();
    drawdownChart = new Chart(ddCtx, {
        type: "line",
        data: {
            labels: series.dates,
            datasets: [{
                label: "Drawdown (%)",
                data: series.drawdown_pct,
                borderColor: CHART_RED,
                backgroundColor: CHART_RED + "22",
                fill: true,
                tension: 0.1,
                pointRadius: 2,
                pointHoverRadius: 4
            }]
        },
        options: chartOptions("%")
    });
}

function chartOptions(unitSuffix) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx) => `${ctx.parsed.y.toFixed(2)}${unitSuffix}`
                }
            }
        },
        scales: {
            x: {
                grid: { color: "#262a35" },
                ticks: { color: "#8a8f9c", maxRotation: 0, autoSkip: true }
            },
            y: {
                grid: { color: "#262a35" },
                ticks: { color: "#8a8f9c", callback: (v) => `${v}${unitSuffix}` }
            }
        }
    };
}

function initToggle() {
    document.querySelectorAll("#universeToggle button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#universeToggle button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentUniverse = btn.dataset.universe;
            update();
        });
    });
}

function update() {
    const series = getSeries(currentUniverse);
    renderStats(series);
    renderCharts(series);
}

(async function init() {
    await loadPortfolioData();
    initToggle();
    update();
})();

