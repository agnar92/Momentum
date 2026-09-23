// ============================================================
// strategy.html — lejek strategii "Stage 2 Continuation" (na wyrazne
// zyczenie uzytkownika polaczenie kilku testowanych osobno strategii w jedna):
//   Krok 1 — rynek w fazie wzrostu? USA: filtr SP500 (SMA200 dzienna LUB
//            SMA40 tygodniowa, compute_sp500_trend_filter w run_query.py);
//            PL: syntetyczny indeks WIG20/mWIG40 (index_pct z weekly_chart)
//            powyzej 30-tygodniowej SMA, osobno dla kazdego indeksu.
//   Krok 2 — gdzie szukac: 3 najsilniejsze sektory SP500 wg Mansfield RS
//            (sector_strategy.json) + top 10 SP500 wg czystego RS. Dla GPW
//            pominiety (brak danych sektorowych).
//   Krok 3 — lista obserwacyjna: Etap 2, RS 26 i 52 tyg. > 0, momentum > 0,
//            baza <= 3.
//   Krok 4 — wejscie: TTM Squeeze odpalil po konsolidacji, histogram > 0 i
//            rosnie, potwierdzenie: MACD nad linia sygnalu (przeciecie w gore);
//            stop = polowa ostatniego pudelka Darvasa, podnoszony na low swiecy
//            z przeciecia MACD w dol (strategyStopFor); wielkosc
//            pozycji = 1% kapitalu / (cena - stop), maks. 10% kapitalu.
//   Krok 5 — pozycje satelity uzytkownika: HOLD / podciagnij stop / EXIT.
// Portfel: Core = ETF-y, ktore uzytkownik juz ma poza tym narzedziem,
// Satelita = ta strategia (domyslnie 50/50, ryzyko 1%, maks. pozycja 10% —
// wszystkie trzy procenty uzytkownik zmienia polami na stronie). Wszystko liczone po stronie klienta z juz
// eksportowanych docs/data/*.json — pipeline (run_query.py) bez zmian.
// Stare Kroki 3/4 strategii sektorowej (liderzy sektora, top 10 RS) zostaja
// na dole strony jako "Narzedzia pomocnicze" (tylko USA).
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
    Object.assign(globalThis, require("./minicharts.js"));
}

let strategyData = null;   // docs/data/sector_strategy.json
let sp500Data = null;      // docs/data/sp500.json (all_constituents, do polaczenia Etap/TTM Squeeze po tickerze)
let gemData = null;       // docs/data/global_equity_momentum.json (dopłaty do Core -> ETF na zwycięski indeks)
let trendChartInstance = null;
let trendChartMode = "daily"; // "daily" (SMA200) albo "weekly" (SMA40)

// Ktory sektor pokazuje tabela "Liderzy przegladanego sektora" (narzedzia
// pomocnicze na dole strony, dawny Krok 3 strategii sektorowej) — null oznacza "jeszcze nie klikniete, uzyj
// strongest_sector jako podpowiedzi" (ten sam wzorzec co dawny
// settings.browsingUniverse w rebalance.js, zanim rebalanser stal sie w pelni
// automatyczny — patrz CLAUDE.md).
// Na zyczenie uzytkownika: liderzy najsilniejszego sektora nie zawsze sa akurat
// w dobrym etapie Weinsteina/TTM Squeeze, wiec kazdy wiersz Kroku 2 jest teraz
// klikalny i przelacza, ktorego (tez dobrze radzacego sobie) sektora spolki
// pokazuje Krok 3 — backend juz liczy top_companies dla KAZDEGO sektora, nie
// tylko #1 (patrz compute_sector_relative_strength w run_query.py).
let browsedSector = null;

function currentSectorRow() {
    const sectorRs = strategyData && strategyData.sector_rs;
    if (!sectorRs || !sectorRs.sectors.length) return null;
    const wanted = browsedSector || sectorRs.strongest_sector;
    return sectorRs.sectors.find(s => s.sector === wanted) || sectorRs.sectors[0];
}

// Te same progi co TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS/TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS
// w run_query.py i w js/app.js (classifyTtmSqueeze) — MUSZĄ zostać zsynchronizowane.
// W odróżnieniu od classifyTtmSqueeze (ekran-screener, filtruje spółki OUT gdy nie
// pasują) ta wersja NIE odrzuca spółek — liderzy sektora tutaj są już wybrani przez
// Krok 2/3 strategii, więc zawsze pokazujemy jakiś status, łącznie z "neutralnym".
const STRATEGY_TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS = 5;
const STRATEGY_TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS = 3;

function squeezeStatusFor(c, minConsolidationWeeks = STRATEGY_TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS,
    fireLookbackWeeks = STRATEGY_TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS) {
    const t = c && c.ttm_squeeze_chart;
    if (!t || !t.dates || t.dates.length === 0) return { status: "none" };
    let idx = t.dates.length - 1;
    while (idx >= 0 && t.squeeze_on[idx] == null) idx--;
    if (idx < 0) return { status: "none" };

    const squeezeOn = t.squeeze_on[idx];
    const squeezeCount = t.squeeze_count[idx];
    const weeksSinceFire = t.weeks_since_fire[idx];
    const fireConsolidationWeeks = t.fire_consolidation_weeks[idx];

    const isFired = weeksSinceFire != null && weeksSinceFire <= fireLookbackWeeks
        && fireConsolidationWeeks != null && fireConsolidationWeeks > minConsolidationWeeks;
    if (isFired) return { status: "fired", weeks: weeksSinceFire };

    const isConsolidating = squeezeOn === true && squeezeCount > minConsolidationWeeks;
    if (isConsolidating) return { status: "consolidating", weeks: squeezeCount };

    return { status: "neutral" };
}

function squeezeStatusHtml(s) {
    if (s.status === "fired") return `<span class="squeeze-status squeeze-status-fired">🔥 Wybicie (${s.weeks} tyg. temu)</span>`;
    if (s.status === "consolidating") return `<span class="squeeze-status squeeze-status-consolidating">🌀 Konsolidacja (${s.weeks} tyg.)</span>`;
    if (s.status === "neutral") return `<span style="color:var(--text-faint)">— brak squeeze</span>`;
    return `<span style="color:var(--text-faint)">— brak danych</span>`;
}

async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
}

async function loadStrategyData() {
    strategyData = await fetchJson("data/sector_strategy.json");
    sp500Data = await fetchJson("data/sp500.json");
    try {
        gemData = await fetchJson("data/global_equity_momentum.json");
    } catch (e) {
        gemData = null; // karta kapitalu pokaze wtedy "brak danych GEM"
    }
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
        banner.textContent = "🔴 SP500 POZA FAZĄ WZROSTU — brak nowych wejść, otwarte pozycje trzymaj pod stopem.";
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
    // Chart.js jest zvendorowany lokalnie (js/vendor/chart.umd.min.js, patrz
    // strategy.html) wiec normalnie zawsze jest dostepny — ten guard zostaje
    // jako ogolny bezpiecznik (np. uszkodzony plik lokalny), zeby jego brak
    // nie zablokowal reszty strony (banner/stat-cards juz ustawione w
    // renderTrend PRZED tym wywolaniem) ani nie rzucil niezlapanym wyjatkiem
    // z wnetrza async init() w dole tego pliku.
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

// Mini-wykres tygodniowy (26 tyg. + EMA20) spółki z rekordu sp500.json/
// uniwersum — wspólny dla tabel liderów, top 10 RS i listy lejka.
function weeklySparkHtmlFor(rec) {
    if (!rec) return '<span class="spark-empty">—</span>';
    const m = miniVisualFields(rec);
    return `<span title="Cena tygodniowa (${MINI_WEEKS} tyg.) + EMA20">${weeklySparkSvg(m.mini_closes, m.mini_ema)}</span>`;
}

function sectorRowHtml(s, position) {
    // data_source: "etf" (prawdziwy sektorowy ETF SPDR, patrz SECTOR_ETF_SYMBOLS
    // w fetch_data.py) albo "no_data" (ETF jeszcze nie pobrany — bez wlasnego
    // szeregu cenowego nie ma z czego policzyc RS, WIECEJ fallbacku na
    // przyblizenie momentum/trailing-return nie ma, bo to juz nie bylby
    // "czysty RS"; sektor po prostu ladu je na koncu rankingu, rsmPct/
    // top_companies puste).
    const noData = s.data_source === "no_data" || s.rsm_vs_index_pct == null;
    const sourceNote = noData
        ? ` <span style="color:var(--text-faint)" title="Brak jeszcze danych sektorowego ETF-u w index_prices — nie da się policzyć RS dla tego sektora.">(brak danych)</span>`
        : "";
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td>${s.sector}${s.sector === (strategyData.sector_rs && strategyData.sector_rs.strongest_sector) ? " 🏆" : ""}${sourceNote}</td>
        <td>${s.count}</td>
        <td>${noData ? "—" : rsBarHtml(s.rsm_vs_index_pct)}</td>
        <td title="Mansfield RS sektora vs SP500, ostatnie ${(s.rsm_series || []).length} tyg.">${zeroLineSparkSvg(s.rsm_series || [])}</td>
        <td>${strongSectorSet(strategyData.sector_rs).has(s.sector) ? '<span class="positive">✓</span>' : '<span style="color:var(--text-faint)">—</span>'}</td>
    `;
}

function renderSectorTable() {
    const sectorRs = strategyData && strategyData.sector_rs;
    const rows = (sectorRs && sectorRs.sectors) || [];
    const metaEl = document.getElementById("sectorMeta");
    const browsed = currentSectorRow();

    renderScreenerTable({
        tbody: document.getElementById("sectorTableBody"),
        metaEl,
        allRows: rows,
        compareFn: () => 0, // juz posortowane malejaco po RS w backendzie (run_query.py)
        colspan: 6,
        emptyAllMsg: "Brak danych sektorowych — uruchom pipeline (fetch_data.py + run_query.py).",
        emptyFilteredMsg: "Brak danych.",
        metaText: () => sectorRs ? `Mansfield RS (${sectorRs.rsm_weeks} tyg.) wobec SP500 · top ${STRATEGY_TOP_SECTORS} z RS > 0 w lejku` : "",
        isSelected: s => browsed && s.sector === browsed.sector,
        rowHtml: (s, i) => sectorRowHtml(s, i + 1),
        // Klik w dowolny sektor przelacza, ktorego spolki pokazuje tabela liderow —
        // liderzy najsilniejszego sektora nie zawsze sa akurat w dobrym etapie
        // Weinsteina/TTM Squeeze, wiec uzytkownik moze sprawdzic alternatywe.
        onRowClick: s => {
            browsedSector = s.sector;
            renderSectorTable();
            renderLeadersTable();
        },
    });
}

function leaderRowHtml(c, position) {
    const stage = c._stage;
    const squeeze = squeezeStatusFor(c._sp500Record || {});
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${c.ticker}</td>
        <td>$${c.price.toFixed(2)}</td>
        <td>${weeklySparkHtmlFor(c._sp500Record)}</td>
        <td>${rsBarHtml(c.rsm_vs_sector_pct)}</td>
        <td>${stageCellHtml(stage)}</td>
        <td>${squeezeStatusHtml(squeeze)}</td>
        <td><button type="button" class="tv-row-btn chart-row-btn" data-ticker="${c.ticker}" title="Otwórz wykres ${c.ticker} (chart.html)">📈</button></td>
    `;
}

function renderLeadersTable() {
    const sectorRs = strategyData && strategyData.sector_rs;
    const sectorLabelEl = document.getElementById("leadersSectorLabel");
    const browsed = currentSectorRow();
    if (browsed) {
        const isStrongest = browsed.sector === sectorRs.strongest_sector;
        sectorLabelEl.textContent = isStrongest ? `— ${browsed.sector} 🏆` : `— ${browsed.sector} (przeglądasz zamiast lidera ${sectorRs.strongest_sector})`;
    } else {
        sectorLabelEl.textContent = "";
    }

    const byTicker = sp500ByTicker();
    const rows = ((browsed && browsed.top_companies) || []).map(c => {
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

function topRsRowHtml(c, position) {
    const stage = c._stage;
    const squeeze = squeezeStatusFor(c._sp500Record || {});
    return `
        <td><span class="rank-badge">${position}</span></td>
        <td class="ticker-cell">${c.ticker}</td>
        <td>${c.sector}</td>
        <td>$${c.price.toFixed(2)}</td>
        <td>${weeklySparkHtmlFor(c._sp500Record)}</td>
        <td>${rsBarHtml(c.rsm_vs_index_pct)}</td>
        <td>${stageCellHtml(stage)}</td>
        <td>${squeezeStatusHtml(squeeze)}</td>
        <td><button type="button" class="tv-row-btn chart-row-btn" data-ticker="${c.ticker}" title="Otwórz wykres ${c.ticker} (chart.html)">📈</button></td>
    `;
}

// Krok 4 — top SECTOR_STRATEGY_TOP_RS_N (10, patrz run_query.py) spolek CALEGO
// SP500 wg tego samego oscylatora Mansfielda, ale ZAWSZE wobec SP500 (nie
// przegladanego sektora) — na wyrazne zyczenie uzytkownika ("Dodaj jeszcze
// top 10 spółek samego RS z sp500 bez sektorów"). Niezalezne od browsedSector
// — ta lista sie NIE zmienia, kiedy uzytkownik klika inny wiersz w Kroku 2.
function renderTopRsTable() {
    const sectorRs = strategyData && strategyData.sector_rs;
    const byTicker = sp500ByTicker();
    const rows = ((sectorRs && sectorRs.top_rs_companies) || []).map(c => {
        const rec = byTicker[c.ticker];
        return Object.assign({}, c, {
            _stage: rec && rec.weekly_chart && rec.weekly_chart.current_stage,
            _sp500Record: rec,
        });
    });

    renderScreenerTable({
        tbody: document.getElementById("topRsTableBody"),
        metaEl: document.getElementById("topRsMeta"),
        allRows: rows,
        compareFn: () => 0, // juz posortowane malejaco po RS vs SP500 w backendzie
        colspan: 9,
        emptyAllMsg: "Brak danych — uruchom pipeline (fetch_data.py + run_query.py).",
        emptyFilteredMsg: "Brak danych.",
        metaText: () => strategyData ? `Rebalans: ${strategyData.ref_date} · top ${rows.length} spółek SP500` : "",
        rowHtml: (c, i) => topRsRowHtml(c, i + 1),
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

// ============================================================
// LEJEK "STAGE 2 CONTINUATION"
// ============================================================

// Portfel: Core = ETF-y uzytkownika (poza tym narzedziem), Satelita = lejek.
const STRATEGY_SATELLITE_PCT = 0.5;
// Ryzyko na jedna pozycje (od CALEGO kapitalu Core + Satelita) i maks. wartosc
// jednej pozycji — klasyczny risk management 1%, na wyrazne zyczenie uzytkownika.
const STRATEGY_RISK_PER_TRADE_PCT = 0.01;
const STRATEGY_MAX_POSITION_PCT = 0.10;
// Ile najsilniejszych sektorow (z RS > 0) przepuszcza Krok 2.
const STRATEGY_TOP_SECTORS = 3;
// Maks. numer bazy w biezacej fali Etapu 2 — od 4. bazy ksiazka ostrzega przed
// wieksza podatnoscia na porazke (STAGE_LATE_BASE_WARNING_COUNT w run_query.py).
const STRATEGY_MAX_BASE_COUNT = 3;
// Syntetyczny indeks GPW: kurs powyzej 30-tygodniowej SMA (odpowiednik SMA40W/
// SMA200 dla SP500 — 30 tyg. to klasyczna srednia Weinsteina).
const STRATEGY_PL_INDEX_SMA_WEEKS = 30;
// Miekkie potwierdzenie wybicia wolumenem kupujacych (STAGE_PULLBACK_VOLUME_RATIO
// w run_query.py) — pokazywane, nie wymagane.
const STRATEGY_VOLUME_CONFIRM_RATIO = 1.2;
// Maks. liczba pozycji satelity w jednym sektorze (ostrzezenie przy wejsciu).
const STRATEGY_MAX_PER_SECTOR = 3;
// Ile ostatnich tygodni sprawdzac pod katem WARNING_MA_SLOWING dla pozycji.
const STRATEGY_MA_SLOWING_LOOKBACK_WEEKS = 4;

const MARKETS = {
    USA: { universes: ["SP500", "NASDAQ100"], currency: "USD", label: "USA" },
    PL: { universes: ["WIG20", "MWIG40"], currency: "PLN", label: "PL" },
};
const FUNNEL_UNIVERSE_LABELS = { WIG20: "WIG20", MWIG40: "mWIG40", SP500: "S&P 500", NASDAQ100: "Nasdaq 100" };
const STRATEGY_SETTINGS_KEY = "momentum_strategy_settings";

// Procenty kapitalu, ktore uzytkownik ustawia na stronie (pola nad lejkiem),
// w % kapitalu CALKOWITEGO. Domyslne = STRATEGY_*_PCT wyzej.
const DEFAULT_ALLOCATION = {
    satellitePct: STRATEGY_SATELLITE_PCT * 100,
    riskPct: STRATEGY_RISK_PER_TRADE_PCT * 100,
    maxPositionPct: STRATEGY_MAX_POSITION_PCT * 100,
};
const ALLOCATION_LIMITS = { satellitePct: [0, 100], riskPct: [0.1, 10], maxPositionPct: [1, 100] };

// Poprawne liczby w dozwolonych zakresach; zle/puste wartosci -> domyslne.
function sanitizeAllocation(a) {
    const out = Object.assign({}, DEFAULT_ALLOCATION);
    Object.keys(ALLOCATION_LIMITS).forEach(k => {
        const v = a && Number(a[k]);
        if (a && a[k] !== null && a[k] !== "" && isFinite(v)) {
            const [lo, hi] = ALLOCATION_LIMITS[k];
            out[k] = Math.min(hi, Math.max(lo, v));
        }
    });
    return out;
}

function lastNonNullIndex(arr) {
    if (!arr) return -1;
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i;
    return -1;
}

function lastNonNull(arr) {
    const i = lastNonNullIndex(arr);
    return i < 0 ? null : arr[i];
}

// Trend syntetycznego indeksu z `index_pct` wykresu 10:30 (ten sam szereg dla
// kazdej spolki danego uniwersum) — bierzemy spolke z najdluzszym szeregiem.
// Zwraca null, gdy jest mniej niz `weeks` punktow.
function indexTrendFromRows(rows, weeks) {
    let best = null;
    (rows || []).forEach(c => {
        const pct = c.weekly_chart && c.weekly_chart.index_pct;
        if (!pct) return;
        const n = pct.filter(v => v != null).length;
        if (!best || n > best.n) best = { n, pct, dates: c.weekly_chart.dates };
    });
    if (!best || best.n < weeks) return null;
    const levels = [];
    const dates = [];
    best.pct.forEach((v, i) => { if (v != null) { levels.push(100 + v); dates.push(best.dates[i]); } });
    const recent = levels.slice(-weeks);
    const sma = recent.reduce((a, b) => a + b, 0) / recent.length;
    const level = levels[levels.length - 1];
    return { level, sma, above: level > sma, date: dates[dates.length - 1] };
}

// Top N sektorow z RS > 0 (sektory bez danych ETF-u nigdy nie przechodza).
function strongSectorSet(sectorRs, n = STRATEGY_TOP_SECTORS) {
    const set = new Set();
    ((sectorRs && sectorRs.sectors) || [])
        .filter(s => s.data_source !== "no_data" && s.rsm_vs_index_pct != null && s.rsm_vs_index_pct > 0)
        .slice(0, n)
        .forEach(s => set.add(s.sector));
    return set;
}

// Aktualny trailing stop Weinsteina w walucie spolki. stop_level_pct jest
// liczony wzgledem tej samej bazy (close0) co close_pct, wiec
// close0 = cena / (1 + close_pct/100). Bierzemy stop z OSTATNIEGO tygodnia
// z cena — nie cofamy sie dalej, bo po EXIT_STOP stop jest celowo pusty.
function stopPriceFor(c) {
    const w = c && c.weekly_chart;
    if (!w || c.price == null) return null;
    const i = lastNonNullIndex(w.close_pct);
    if (i < 0) return null;
    const stopPct = w.stop_level_pct && w.stop_level_pct[i];
    if (stopPct == null) return null;
    const close0 = c.price / (1 + w.close_pct[i] / 100);
    return close0 * (1 + stopPct / 100);
}

// Stop strategii (na wyrazne zyczenie uzytkownika, zastepuje trailing stop
// Weinsteina z backendu):
//   1. start: POLOWA ostatniego pudelka Darvasa (weekly_chart.bases[-1],
//      (resistance + support) / 2) — pudelko, z ktorego bylo ostatnie wybicie;
//   2. potem, po kazdym przecieciu MACD W DOL linii sygnalu (tygodniowy MACD,
//      macd_chart) PO koncu tego pudelka (MACD NIE musi byc nad zerem — trend
//      potwierdzaja juz Etap 2/TTM Squeeze, MACD to tylko dodatkowa polisa), stop idzie na LOW tej tygodniowej swiecy
//      (weekly_chart.low_pct) — tylko w gore, nigdy w dol.
// Przeciecie MACD W GORE to NIE jest stop — to potwierdzenie wejscia (patrz
// macdConfirmation / status WAIT_MACD w evaluateCandidate).
// Bez pudelka w oknie danych -> fallback na stop Weinsteina (source "weinstein").
// Bez low_pct (stare dane sprzed dodania pola) -> zamkniecie tygodnia
// zamiast low, oznaczone lowApprox=true.
function strategyStopFor(c) {
    const w = c && c.weekly_chart;
    if (!w || c.price == null) return null;
    const iClose = lastNonNullIndex(w.close_pct);
    if (iClose < 0) return null;
    const close0 = c.price / (1 + w.close_pct[iClose] / 100);
    const toPrice = pct => close0 * (1 + pct / 100);

    const bases = (w.bases || []).filter(b => b.resistance_pct != null && b.support_pct != null);
    if (!bases.length) {
        const wStop = stopPriceFor(c);
        return wStop == null ? null : { stop: wStop, source: "weinstein" };
    }
    const box = bases[bases.length - 1];
    const boxMid = toPrice((box.resistance_pct + box.support_pct) / 2);
    const out = { stop: boxMid, source: "box", boxMid, boxEnd: box.end_date, macdDate: null, lowApprox: false };

    const m = c.macd_chart;
    if (!m || !m.dates || !m.macd || !m.signal) return out;
    const weekIdx = {};
    (w.dates || []).forEach((d, i) => { weekIdx[d] = i; });
    for (let k = 1; k < m.dates.length; k++) {
        const date = m.dates[k];
        if (date <= box.end_date) continue;
        const a0 = m.macd[k - 1], s0 = m.signal[k - 1], a1 = m.macd[k], s1 = m.signal[k];
        if (a0 == null || s0 == null || a1 == null || s1 == null) continue;
        if (!(a0 >= s0 && a1 < s1)) continue;
        const j = weekIdx[date];
        if (j == null) continue;
        const hasLow = w.low_pct && w.low_pct[j] != null;
        const lowPct = hasLow ? w.low_pct[j] : w.close_pct[j];
        if (lowPct == null) continue;
        const low = toPrice(lowPct);
        if (low > out.stop) {
            out.stop = low;
            out.source = "macd";
            out.macdDate = date;
            out.lowApprox = !hasLow;
        }
    }
    return out;
}

// Potwierdzenie wejscia MACD: tygodniowy MACD powyzej linii sygnalu (czyli
// przeciecie w gore juz bylo i sie nie odwrocilo) + data ostatniego
// przeciecia w gore.
function macdConfirmation(c) {
    const m = c && c.macd_chart;
    if (!m || !m.macd || !m.signal) return { above: null, crossUpDate: null };
    let i = m.macd.length - 1;
    while (i >= 0 && (m.macd[i] == null || m.signal[i] == null)) i--;
    if (i < 0) return { above: null, crossUpDate: null };
    let crossUpDate = null;
    for (let k = i; k >= 1; k--) {
        const a0 = m.macd[k - 1], s0 = m.signal[k - 1];
        if (a0 == null || s0 == null) break;
        if (a0 <= s0 && m.macd[k] > m.signal[k]) { crossUpDate = m.dates[k]; break; }
    }
    return { above: m.macd[i] > m.signal[i], crossUpDate };
}

// Histogram TTM Squeeze w ostatnim policzonym tygodniu: dodatni? rosnacy?
function squeezeMomentum(c) {
    const t = c && c.ttm_squeeze_chart;
    if (!t || !t.histogram) return { value: null, rising: null };
    const i = lastNonNullIndex(t.histogram);
    if (i < 0) return { value: null, rising: null };
    const prev = i > 0 ? t.histogram[i - 1] : null;
    return { value: t.histogram[i], rising: prev == null ? null : t.histogram[i] > prev };
}

// Najwyzszy stosunek wolumenu kupujacych do sredniej w ostatnich `weeks` tygodniach.
function recentBuyingVolumeRatio(c, weeks) {
    const r = c && c.weekly_chart && c.weekly_chart.buying_volume_ratio;
    if (!r) return null;
    const vals = r.slice(-Math.max(1, weeks)).filter(v => v != null);
    return vals.length ? Math.max(...vals) : null;
}

// Kryteria lejka — kazde da sie zmienic na stronie (chipy przy kazdym kroku
// lejka), zapisywane w localStorage razem z reszta ustawien. Domyslne =
// strategia uzgodniona z uzytkownikiem.
const DEFAULT_CRITERIA = {
    market: true,                 // wymagaj rynku w fazie wzrostu
    sectorTop: STRATEGY_TOP_SECTORS, // 0 = krok wylaczony (tylko USA)
    sectorTopRs: true,            // top 10 SP500 wg RS przechodzi zawsze
    stages: ["2A", "2B"],         // dopuszczalne etapy
    rsWindows: ["medium", "long"], // okna Mansfield RS, ktore musza byc > 0
    momentum: true,               // momentum_score > 0
    maxBase: STRATEGY_MAX_BASE_COUNT, // 0 = bez limitu
    minConsolidation: STRATEGY_TTM_SQUEEZE_MIN_CONSOLIDATION_WEEKS, // squeeze > N tyg.
    fireLookback: STRATEGY_TTM_SQUEEZE_FIRE_LOOKBACK_WEEKS,         // wybicie <= N tyg. temu
    requireMacd: true,            // MACD nad linia sygnalu jako potwierdzenie wejscia
    requireVolume: false,         // wolumen kupujacych >= 1.2x jako warunek wejscia
};

// Kolejne kroki lejka (od gory). "sector" tylko dla USA.
const FUNNEL_GATES = [
    { key: "market", label: "Rynek w fazie wzrostu", icon: "🌐" },
    { key: "sector", label: "Silny sektor", icon: "🏭", usaOnly: true },
    { key: "stage", label: "Etap Weinsteina", icon: "📈" },
    { key: "rs", label: "Mansfield RS > 0", icon: "💪" },
    { key: "momentum", label: "Momentum > 0", icon: "🚀" },
    { key: "base", label: "Numer bazy", icon: "📦" },
    { key: "squeeze", label: "TTM Squeeze", icon: "🌀" },
    { key: "entry", label: "Sygnał wejścia", icon: "🎯" },
];

function gatesForMarket(market) {
    return FUNNEL_GATES.filter(g => !g.usaOnly || market === "USA");
}

// Ocena jednej spolki przez wszystkie bramki lejka.
// ctx: { marketOk: bool|null, strongSectors: Set|null (null = brak danych sektorowych, np. PL),
//        topRsTickers: Set, sp500Sectors: {ticker: sector}|null }
function evaluateCandidate(c, ctx, criteria = DEFAULT_CRITERIA) {
    const cr = Object.assign({}, DEFAULT_CRITERIA, criteria);
    const w = c.weekly_chart || {};
    const m = c.mansfield_chart || {};
    const stage = w.current_stage || null;
    const baseCount = lastNonNull(w.base_count);
    const rsShort = lastNonNull(m.rsm_short);
    const rsMedium = lastNonNull(m.rsm_medium);
    const rsLong = lastNonNull(m.rsm_long);
    const rsValues = { short: rsShort, medium: rsMedium, long: rsLong };
    const sector = (ctx.sp500Sectors && ctx.sp500Sectors[c.ticker]) || c.sector || null;

    let sectorGate = true;
    if (cr.sectorTop > 0 && ctx.strongSectors && ctx.strongSectors.size > 0
        && !(ctx.sp500Sectors && !(c.ticker in ctx.sp500Sectors))) { // spoza SP500 — brak sektora GICS, krok pominiety
        sectorGate = ctx.strongSectors.has(sector) || (cr.sectorTopRs && !!ctx.topRsTickers && ctx.topRsTickers.has(c.ticker));
    }

    const squeeze = squeezeStatusFor(c, cr.minConsolidation, cr.fireLookback);
    const mom = squeezeMomentum(c);
    const stopInfo = strategyStopFor(c);
    const stop = stopInfo ? stopInfo.stop : null;
    const macd = macdConfirmation(c);
    const volumeRatio = squeeze.status === "fired" ? recentBuyingVolumeRatio(c, Math.max(2, squeeze.weeks + 1)) : null;
    const volumeConfirmed = volumeRatio != null && volumeRatio >= STRATEGY_VOLUME_CONFIRM_RATIO;
    const triggered = squeeze.status === "fired" && mom.value != null && mom.value > 0 && mom.rising === true
        && stop != null && c.price > stop;
    const macdOk = !cr.requireMacd || macd.above === true;
    const volumeOk = !cr.requireVolume || volumeConfirmed;

    const gates = {
        market: !cr.market || ctx.marketOk !== false,
        sector: sectorGate,
        stage: cr.stages.includes(stage),
        // RS 52 tyg. bywa jeszcze pusty przy krotkiej historii — wtedy nie blokuje.
        rs: cr.rsWindows.every(k => (k === "long" && rsValues[k] == null) || (rsValues[k] != null && rsValues[k] > 0)),
        momentum: !cr.momentum || (c.momentum_score != null && c.momentum_score > 0),
        base: !(cr.maxBase > 0) || baseCount == null || baseCount <= cr.maxBase,
        squeeze: squeeze.status === "fired" || squeeze.status === "consolidating",
        entry: triggered && macdOk && volumeOk,
    };
    const passes = gates.market && gates.sector && gates.stage && gates.rs && gates.momentum && gates.base;
    const failedAt = FUNNEL_GATES.map(g => g.key).find(k => !gates[k]) || null;

    let status = null;
    if (passes) {
        if (triggered) status = !macdOk ? "WAIT_MACD" : !volumeOk ? "WAIT_VOLUME" : "ENTRY";
        else if (squeeze.status === "consolidating") status = "SETUP";
        else status = "WATCH";
    }

    return {
        ticker: c.ticker, universe: c.universe, sector, price: c.price, record: c,
        stage, baseCount, rsShort, rsMedium, rsLong, squeeze, momentum: mom, stop, stopInfo,
        macd, volumeRatio, volumeConfirmed,
        gates, passes, failedAt, status,
    };
}

function isSignalStatus(status) {
    return status === "ENTRY" || status === "WAIT_MACD" || status === "WAIT_VOLUME";
}

// Kroki lejka: dla kazdej bramki — ile spolek przeszlo (in = weszlo do kroku,
// out = przeszlo dalej). Kazda bramka liczona na wyniku poprzedniej.
function funnelSteps(evaluated, market) {
    let rows = evaluated;
    return gatesForMarket(market).map(g => {
        const before = rows;
        rows = rows.filter(e => e.gates[g.key]);
        return { key: g.key, label: g.label, icon: g.icon, in: before.length, out: rows.length };
    });
}

// Spolki, ktore przeszly krok `key` (passed) albo odpadly dokladnie na nim (dropped).
function rowsAtStep(evaluated, market, key, mode) {
    const keys = gatesForMarket(market).map(g => g.key);
    const idx = keys.indexOf(key);
    if (idx < 0) return [];
    const upTo = keys.slice(0, idx);
    const reached = evaluated.filter(e => upTo.every(k => e.gates[k]));
    return mode === "dropped" ? reached.filter(e => !e.gates[key]) : reached.filter(e => e.gates[key]);
}

// Wielkosc pozycji od ryzyka: akcje = (ryzyko% * kapital) / (cena - stop),
// ale wartosc pozycji <= maxPositionPct * kapital.
function positionSize({ price, stop, capital, riskPct = STRATEGY_RISK_PER_TRADE_PCT, maxPositionPct = STRATEGY_MAX_POSITION_PCT }) {
    if (!(capital > 0) || price == null || stop == null || !(price > 0)) return null;
    const riskPerShare = price - stop;
    if (!(riskPerShare > 0)) return null;
    const byRisk = Math.floor((capital * riskPct) / riskPerShare);
    const byCap = Math.floor((capital * maxPositionPct) / price);
    const shares = Math.max(0, Math.min(byRisk, byCap));
    return {
        shares,
        value: shares * price,
        risk: shares * riskPerShare,
        cappedByMax: byCap < byRisk,
        stopDistancePct: (riskPerShare / price) * 100,
    };
}

// Decyzja dla posiadanej pozycji satelity.
function evaluateHolding(c) {
    if (!c) return { action: "NO_DATA", reasons: ["brak spółki w danych tego rynku"] };
    const w = c.weekly_chart || {};
    const stage = w.current_stage || null;
    const rsMedium = lastNonNull((c.mansfield_chart || {}).rsm_medium);
    const stopInfo = strategyStopFor(c);
    const stop = stopInfo ? stopInfo.stop : null;
    const baseCount = lastNonNull(w.base_count);

    const exit = [];
    if (stop != null && c.price < stop) exit.push("cena pod stopem");
    if (stage === "3" || stage === "4") exit.push(`Etap ${stage}`);
    if (rsMedium != null && rsMedium < 0) exit.push("RS 26 tyg. < 0");
    const recentSignals = (w.signal || []).slice(-STRATEGY_MA_SLOWING_LOOKBACK_WEEKS);
    if (exit.length) return { action: "EXIT", reasons: exit, stop, stopInfo, stage, rsMedium };

    const warn = [];
    if (recentSignals.includes("WARNING_MA_SLOWING")) warn.push("SMA30 traci nachylenie");
    if (baseCount != null && baseCount > STRATEGY_MAX_BASE_COUNT) warn.push(`${baseCount}. baza — nie dokładaj`);
    if (stage === "1") warn.push("Etap 1 — brak trendu");
    if (warn.length) return { action: "TIGHTEN", reasons: warn, stop, stopInfo, stage, rsMedium };

    return { action: "HOLD", reasons: ["trend i RS w porządku"], stop, stopInfo, stage, rsMedium };
}

function parseTickerList(str) {
    const seen = new Set();
    return String(str || "").split(/[\s,;]+/).map(t => t.trim().toUpperCase()).filter(t => {
        if (!t || seen.has(t)) return false;
        seen.add(t);
        return true;
    });
}

function fmtMoneyFor(currency, v) {
    if (v == null || !isFinite(v)) return "—";
    const n = Math.round(v).toLocaleString("pl-PL");
    return currency === "PLN" ? `${n} zł` : `$${n}`;
}

function fmtPriceFor(currency, v) {
    if (v == null || !isFinite(v)) return "—";
    return currency === "PLN" ? `${v.toFixed(2)} zł` : `$${v.toFixed(2)}`;
}

function fmtSigned(v) {
    if (v == null) return '<span style="color:var(--text-faint)">—</span>';
    return `<span class="${v >= 0 ? "positive" : "negative"}">${v >= 0 ? "+" : ""}${v.toFixed(1)}</span>`;
}

// ------------------------------------------------------------
// ZARZADZANIE KAPITALEM Core / Satelita (karta "💰", wszystko w PLN — na
// wyrazne zyczenie uzytkownika jeden wspolny Core dla USA i PL, bez kursu
// walut w aplikacji). Reguly uzgodnione z uzytkownikiem:
//   - dopłaty ida do czesci ponizej celu (bez sprzedazy = bez podatku);
//   - sprzedaz tylko po wyjsciu poza pasmo ±STRATEGY_REBALANCE_BAND_PP i
//     najwyzej raz na kwartal (STRATEGY_REBALANCE_MIN_DAYS);
//   - nadwyzka Satelity -> najpierw z jej gotowki, zwycieskich pozycji nie
//     scinamy (zamyka je stop, nie rebalans);
//   - nie dolewamy do Satelity przy spadku >= STRATEGY_SATELLITE_MAX_DRAWDOWN_PCT
//     od jej szczytu ani gdy lejek nie ma sygnalow wejscia;
//   - czesc Core z dopłat -> ETF na indeks wygrywajacy GEM (wszystkie indeksy
//     z global_equity_momentum.json); gdy wszystkie maja ujemny zwrot 12M
//     (absolute momentum) -> gotowka/obligacje zamiast akcji.
// ------------------------------------------------------------
const STRATEGY_REBALANCE_BAND_PP = 5;
const STRATEGY_REBALANCE_MIN_DAYS = 90;
const STRATEGY_SATELLITE_MAX_DRAWDOWN_PCT = 20;
const GEM_INDEX_LABELS = {
    SP500: "S&P 500", NASDAQ100: "Nasdaq 100", DOWJONES: "Dow Jones",
    WIG20: "WIG20", MWIG40: "mWIG40", SWIG80: "sWIG80",
};

// Ranking GEM (malejaco po zwrocie) + zwyciezca; null gdy brak danych.
function gemRanking(gem) {
    const rows = ((gem && gem.indices) || []).filter(r => r.return_pct != null)
        .slice().sort((a, b) => b.return_pct - a.return_pct);
    if (!rows.length) return null;
    return { rows, winner: rows[0], allNegative: rows[0].return_pct <= 0 };
}

// Plan dzialan dla kapitalu. Kwoty w PLN.
// in: { core, satPositions, satCash, contribution, targetSatPct (0-100),
//       peak (najwyzsza zapamietana wartosc Satelity), hasEntrySignals,
//       daysSinceRebalance (null = nigdy), gem: wynik gemRanking() }
// out: { total, satPct, deviationPp, drawdownPct, contribution: {toCore, toSat},
//        actions: [{kind, text}] } — kind: ok | contribute | move | sell | hold | warn
function capitalPlan(inp) {
    const n = v => (isFinite(v) && v > 0 ? Number(v) : 0);
    const core = n(inp.core), satPos = n(inp.satPositions), satCash = n(inp.satCash), contrib = n(inp.contribution);
    const t = Math.min(100, Math.max(0, Number(inp.targetSatPct))) / 100;
    const sat = satPos + satCash;
    const drawdownPct = inp.peak > 0 && sat < inp.peak ? (1 - sat / inp.peak) * 100 : 0;
    const satFrozen = drawdownPct >= STRATEGY_SATELLITE_MAX_DRAWDOWN_PCT;
    const fmt = v => `${Math.round(v).toLocaleString("pl-PL")} zł`;
    const gemTarget = () => {
        if (!inp.gem) return "ETF na indeks wygrywający GEM (brak danych GEM)";
        if (inp.gem.allNegative) return "gotówkę / obligacje — wszystkie indeksy mają ujemny zwrot 12 mies.";
        const w = inp.gem.winner;
        return `ETF na ${GEM_INDEX_LABELS[w.universe] || w.universe} (wygrywa GEM, ${w.return_pct >= 0 ? "+" : ""}${w.return_pct.toFixed(1)}%)`;
    };
    const actions = [];
    const out = { total: core + sat, satPct: null, deviationPp: null, drawdownPct, contribution: { toCore: 0, toSat: 0 }, actions };
    if (core + sat + contrib <= 0) {
        actions.push({ kind: "warn", text: "Wpisz wartości Core i Satelity, żeby dostać instrukcję." });
        return out;
    }

    // 1) dopłata: najpierw do czesci ponizej celu
    const totalAfter = core + sat + contrib;
    let toSat = 0;
    if (contrib > 0) {
        const gap = totalAfter * t - sat;
        if (gap > 0 && !satFrozen) toSat = Math.min(contrib, gap);
        const toCore = contrib - toSat;
        out.contribution = { toCore, toSat };
        if (toSat > 0) actions.push({ kind: "contribute", text: `Dopłata ${fmt(toSat)} → gotówka Satelity (czeka na sygnały wejścia z lejka).` });
        if (toCore > 0) actions.push({ kind: "contribute", text: `Dopłata ${fmt(toCore)} → Core: ${gemTarget()}.` });
        if (gap > 0 && satFrozen) actions.push({ kind: "hold", text: `Satelita jest ${drawdownPct.toFixed(0)}% pod szczytem — dopłata w całości do Core, Satelity nie dolewamy.` });
    }

    // 2) stan po dopłacie vs pasmo
    const coreAfter = core + out.contribution.toCore;
    const satAfter = sat + out.contribution.toSat;
    const cashAfter = satCash + out.contribution.toSat;
    const satPct = (satAfter / totalAfter) * 100;
    out.total = totalAfter;
    out.satPct = satPct;
    out.deviationPp = satPct - t * 100;
    const band = STRATEGY_REBALANCE_BAND_PP;
    const targetSat = totalAfter * t;

    if (out.deviationPp > band) {
        const excess = satAfter - targetSat;
        const fromCash = Math.min(cashAfter, excess);
        if (fromCash > 0) actions.push({ kind: "move", text: `Satelita ma ${satPct.toFixed(1)}% (cel ${(t * 100).toFixed(0)}%) — przenieś ${fmt(fromCash)} z gotówki Satelity do Core: ${gemTarget()}.` });
        const rest = excess - fromCash;
        if (rest > 0) actions.push({ kind: "hold", text: `Brakujące ${fmt(rest)}: nie otwieraj nowych pozycji, a gotówkę z kolejnych zamknięć na stopie kieruj do Core. Zyskownych pozycji nie ścinaj.` });
    } else if (out.deviationPp < -band) {
        const deficit = targetSat - satAfter;
        const quarterOk = inp.daysSinceRebalance == null || inp.daysSinceRebalance >= STRATEGY_REBALANCE_MIN_DAYS;
        if (satFrozen) {
            actions.push({ kind: "hold", text: `Satelita ma ${satPct.toFixed(1)}%, ale spadła o ${drawdownPct.toFixed(0)}% od szczytu (limit ${STRATEGY_SATELLITE_MAX_DRAWDOWN_PCT}%) — nie dolewaj. Wróć do tego, gdy odrobi straty albo po przeglądzie strategii.` });
        } else if (!inp.hasEntrySignals) {
            actions.push({ kind: "hold", text: `Satelita ma ${satPct.toFixed(1)}%, ale lejek nie ma teraz sygnałów wejścia — nie przenoś pieniędzy, żeby leżały jako gotówka. Wróć, gdy pojawi się sygnał.` });
        } else if (!quarterOk) {
            actions.push({ kind: "hold", text: `Satelita ma ${satPct.toFixed(1)}%, ale ostatni rebalans ze sprzedażą był ${inp.daysSinceRebalance} dni temu (min. ${STRATEGY_REBALANCE_MIN_DAYS}) — wyrównuj dopłatami.` });
        } else {
            actions.push({ kind: "sell", text: `Satelita ma ${satPct.toFixed(1)}% (cel ${(t * 100).toFixed(0)}%) — sprzedaj ${fmt(deficit)} z ETF-ów Core (najpierw z tego, który najsłabiej wypada w GEM) i przenieś do gotówki Satelity pod sygnały z lejka.` });
        }
    } else if (!actions.length) {
        actions.push({ kind: "ok", text: `W paśmie (Satelita ${satPct.toFixed(1)}%, cel ${(t * 100).toFixed(0)}% ±${band} pp) — nic nie rób.` });
    } else {
        actions.push({ kind: "ok", text: `Po dopłacie w paśmie (Satelita ${satPct.toFixed(1)}%, cel ${(t * 100).toFixed(0)}% ±${band} pp).` });
    }
    out.coreAfter = coreAfter;
    out.satAfter = satAfter;
    return out;
}

// ------------------------------------------------------------
// Stan strony
// ------------------------------------------------------------
const marketData = {};     // { UNIVERSE: json }
let settings = loadSettings();

function loadSettings() {
    const defaults = {
        market: "USA", capitalUSA: null, capitalPL: null, heldUSA: "", heldPL: "",
        criteria: Object.assign({}, DEFAULT_CRITERIA), focusStep: "base", focusMode: "passed",
        allocation: Object.assign({}, DEFAULT_ALLOCATION),
        capital: { core: null, satPositions: null, satCash: null, contribution: null, peak: null, lastRebalance: null },
    };
    try {
        const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STRATEGY_SETTINGS_KEY) : null;
        const saved = raw ? JSON.parse(raw) : {};
        const out = Object.assign(defaults, saved);
        out.criteria = Object.assign({}, DEFAULT_CRITERIA, saved.criteria || {});
        out.allocation = sanitizeAllocation(saved.allocation);
        out.capital = Object.assign({}, defaults.capital, saved.capital || {});
        return out;
    } catch (e) {
        return defaults;
    }
}

function saveSettings() {
    try { localStorage.setItem(STRATEGY_SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* brak storage — ustawienia tylko w tej sesji */ }
}

async function ensureMarketData(market) {
    await Promise.all(MARKETS[market].universes.map(async u => {
        if (marketData[u]) return;
        marketData[u] = u === "SP500" && sp500Data ? sp500Data : await fetchJson(`data/${u.toLowerCase()}.json`);
    }));
}

function universeRows(u) {
    const d = marketData[u];
    return ((d && (d.all_constituents || d.constituents)) || []).map(c => Object.assign({ universe: u }, c));
}

// Spolki rynku (bez duplikatow — spolka z SP500 i Nasdaq 100 liczy sie raz, jako SP500).
function marketRows(market) {
    const seen = new Set();
    const out = [];
    MARKETS[market].universes.forEach(u => universeRows(u).forEach(c => {
        if (seen.has(c.ticker)) return;
        seen.add(c.ticker);
        out.push(c);
    }));
    return out;
}

function marketContext(market) {
    if (market === "USA") {
        const sectorRs = strategyData && strategyData.sector_rs;
        const sp500Sectors = {};
        universeRows("SP500").forEach(c => { sp500Sectors[c.ticker] = c.sector; });
        const trend = strategyData && strategyData.trend;
        const ok = trend ? trend.in_growth_phase : null;
        return {
            marketOkFor: () => ok,
            strongSectors: strongSectorSet(sectorRs, settings.criteria.sectorTop),
            topRsTickers: new Set(((sectorRs && sectorRs.top_rs_companies) || []).map(c => c.ticker)),
            sp500Sectors,
        };
    }
    const trends = {};
    MARKETS.PL.universes.forEach(u => { trends[u] = indexTrendFromRows(universeRows(u), STRATEGY_PL_INDEX_SMA_WEEKS); });
    return {
        marketOkFor: u => (trends[u] ? trends[u].above : null),
        strongSectors: null,
        topRsTickers: new Set(),
        sp500Sectors: null,
        trends,
    };
}

function evaluateMarket(market) {
    const ctx = marketContext(market);
    const evaluated = marketRows(market).map(c => evaluateCandidate(c, {
        marketOk: ctx.marketOkFor(c.universe),
        strongSectors: ctx.strongSectors,
        topRsTickers: ctx.topRsTickers,
        sp500Sectors: ctx.sp500Sectors,
    }, settings.criteria));
    return { ctx, evaluated };
}

function capital() {
    const v = settings[`capital${settings.market}`];
    return v != null && v > 0 ? v : null;
}

// ------------------------------------------------------------
// Render
// ------------------------------------------------------------
const STATUS_ORDER = { ENTRY: 0, WAIT_MACD: 1, WAIT_VOLUME: 2, SETUP: 3, WATCH: 4 };

function statusHtml(status) {
    switch (status) {
        case "ENTRY": return '<span class="funnel-status funnel-status-entry">🟢 Wejście</span>';
        case "WAIT_MACD": return '<span class="funnel-status funnel-status-wait" title="Squeeze odpalił, ale tygodniowy MACD jest jeszcze pod linią sygnału — czekaj na przecięcie w górę jako potwierdzenie wejścia.">⏳ Czekaj na MACD</span>';
        case "WAIT_VOLUME": return '<span class="funnel-status funnel-status-wait" title="Squeeze odpalił, ale wolumen kupujących jest poniżej 1,2× średniej.">⏳ Czekaj na wolumen</span>';
        case "SETUP": return '<span class="funnel-status funnel-status-setup">🌀 Setup</span>';
        case "WATCH": return '<span class="funnel-status funnel-status-watch">👀 Obserwuj</span>';
        default: return "—";
    }
}

function holdActionHtml(action) {
    switch (action) {
        case "HOLD": return '<span class="funnel-status funnel-status-entry">✅ Trzymaj</span>';
        case "TIGHTEN": return '<span class="funnel-status funnel-status-wait">⚠ Podciągnij stop</span>';
        case "EXIT": return '<span class="funnel-status funnel-status-exit">🔴 Wyjdź</span>';
        default: return '<span style="color:var(--text-faint)">— brak danych</span>';
    }
}

function macdCellHtml(m) {
    if (!m || m.above == null) return '<span style="color:var(--text-faint)">—</span>';
    if (m.above) return `<span class="positive" title="MACD nad linią sygnału${m.crossUpDate ? ` — przecięcie w górę ${m.crossUpDate}` : ""}.">✓${m.crossUpDate ? ` ${m.crossUpDate.slice(5)}` : ""}</span>`;
    return '<span class="negative" title="MACD pod linią sygnału — brak potwierdzenia.">✗</span>';
}

// Cena stopu + skad pochodzi (polowa pudelka Darvasa / low swiecy z przeciecia MACD).
function stopCellHtml(currency, info) {
    if (!info || info.stop == null) return "—";
    let note;
    if (info.source === "macd") {
        note = `<span class="funnel-note" title="Low tygodniowej świecy, w której MACD przeciął linię sygnału w dół (${info.macdDate})${info.lowApprox ? " — przybliżone zamknięciem tygodnia, brak danych low" : ""}.">MACD↓ ${info.macdDate.slice(5)}${info.lowApprox ? " ≈" : ""}</span>`;
    } else if (info.source === "box") {
        note = `<span class="funnel-note" title="Połowa ostatniego pudełka Darvasa (zakończonego ${info.boxEnd}) — po tym pudełku nie było jeszcze przecięcia MACD w dół z wyższym low.">½ box</span>`;
    } else {
        note = '<span class="funnel-note funnel-note-warn" title="Brak pudełka Darvasa w oknie danych — użyty trailing stop Weinsteina.">Weinstein</span>';
    }
    return `${fmtPriceFor(currency, info.stop)} ${note}`;
}

function chartBtnHtml(ticker, universe) {
    return `<button type="button" class="tv-row-btn chart-row-btn" data-ticker="${ticker}" data-universe="${universe}" title="Otwórz wykres ${ticker} (chart.html)">📈</button>`;
}

function bindChartButtons(tbody) {
    tbody.querySelectorAll(".chart-row-btn").forEach(btn => {
        btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const params = new URLSearchParams({
                ticker: btn.dataset.ticker, universe: btn.dataset.universe || "SP500", back: "strategy.html",
            });
            window.location.href = `chart.html?${params.toString()}`;
        });
    });
}

function renderSettings() {
    const market = settings.market;
    const currency = MARKETS[market].currency;
    document.querySelectorAll("#marketToggle .chart-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.market === market));
    document.getElementById("capitalLabel").textContent = `Kapitał całkowity ${market} (Core + Satelita), ${currency}`;
    const input = document.getElementById("capitalInput");
    const cap = capital();
    if (document.activeElement !== input) input.value = cap != null ? cap : "";
    const al = settings.allocation;
    const fmtPct = v => `${Number(v.toFixed(2)).toLocaleString("pl-PL")}%`;
    document.getElementById("coreLabel").textContent = `Core — Twoje ETF-y (${fmtPct(100 - al.satellitePct)})`;
    document.getElementById("satelliteLabel").textContent = `Satelita — strategia (${fmtPct(al.satellitePct)})`;
    document.getElementById("riskLabel").textContent = `Ryzyko na pozycję (${fmtPct(al.riskPct)})`;
    document.getElementById("maxPositionLabel").textContent = `Maks. pozycja (${fmtPct(al.maxPositionPct)})`;
    [["satellitePctInput", "satellitePct"], ["riskPctInput", "riskPct"], ["maxPositionPctInput", "maxPositionPct"]].forEach(([id, k]) => {
        const el = document.getElementById(id);
        if (document.activeElement !== el) el.value = al[k];
    });
    document.getElementById("coreValue").textContent = cap ? fmtMoneyFor(currency, cap * (100 - al.satellitePct) / 100) : "—";
    document.getElementById("satelliteValue").textContent = cap ? fmtMoneyFor(currency, cap * al.satellitePct / 100) : "—";
    document.getElementById("riskValue").textContent = cap ? fmtMoneyFor(currency, cap * al.riskPct / 100) : "—";
    document.getElementById("maxPositionValue").textContent = cap ? fmtMoneyFor(currency, cap * al.maxPositionPct / 100) : "—";
    const heldInput = document.getElementById("heldInput");
    if (document.activeElement !== heldInput) heldInput.value = settings[`held${market}`] || "";
}

// ------------------------------------------------------------
// Interaktywny lejek: paski z liczba spolek na kazdym kroku + chipy z
// kryteriami (zmiana kryterium od razu przelicza lejek). Klik w krok ustawia,
// ktorych spolek dotyczy lista pod lejkiem (przeszly / odpadly na tym kroku).
// ------------------------------------------------------------
const CRITERIA_CHIPS = {
    market: [{ crit: "market", type: "bool", label: "Wymagaj" }],
    sector: [
        { crit: "sectorTop", type: "single", options: [[0, "Wył."], [1, "Top 1"], [2, "Top 2"], [3, "Top 3"], [5, "Top 5"]] },
        { crit: "sectorTopRs", type: "bool", label: "+ top 10 RS zawsze" },
    ],
    stage: [{ crit: "stages", type: "multi", options: [["1", "1"], ["2A", "2A"], ["2B", "2B"], ["3", "3"]] }],
    rs: [{ crit: "rsWindows", type: "multi", options: [["short", "13 tyg."], ["medium", "26 tyg."], ["long", "52 tyg."]] }],
    momentum: [{ crit: "momentum", type: "bool", label: "Wymagaj" }],
    base: [{ crit: "maxBase", type: "single", options: [[1, "≤ 1"], [2, "≤ 2"], [3, "≤ 3"], [4, "≤ 4"], [0, "bez limitu"]] }],
    squeeze: [
        { crit: "minConsolidation", type: "single", prefix: "konsolidacja >", options: [[3, "3"], [5, "5"], [8, "8 tyg."]] },
        { crit: "fireLookback", type: "single", prefix: "wybicie ≤", options: [[1, "1"], [3, "3"], [5, "5 tyg. temu"]] },
    ],
    entry: [
        { crit: "requireMacd", type: "bool", label: "MACD nad sygnałem" },
        { crit: "requireVolume", type: "bool", label: "Wolumen ≥ 1,2×" },
    ],
};

function chipsHtml(key) {
    const cr = settings.criteria;
    return (CRITERIA_CHIPS[key] || []).map(group => {
        if (group.type === "bool") {
            return `<button type="button" class="funnel-chip${cr[group.crit] ? " active" : ""}" data-crit="${group.crit}" data-type="bool">${cr[group.crit] ? "✓ " : ""}${group.label}</button>`;
        }
        const chips = group.options.map(([val, label]) => {
            const active = group.type === "multi" ? cr[group.crit].includes(val) : cr[group.crit] === val;
            return `<button type="button" class="funnel-chip${active ? " active" : ""}" data-crit="${group.crit}" data-type="${group.type}" data-val="${val}">${label}</button>`;
        }).join("");
        return `<span class="funnel-chip-group">${group.prefix ? `<span class="funnel-chip-prefix">${group.prefix}</span>` : ""}${chips}</span>`;
    }).join("");
}

function stepInfoText(key, market, ctx) {
    const cr = settings.criteria;
    if (key === "market") {
        if (market === "USA") {
            const t = strategyData && strategyData.trend;
            const ok = t ? t.in_growth_phase : null;
            return ok == null ? "SP500: brak danych" : `SP500 ${ok ? "🟢 w fazie wzrostu" : "🔴 poza fazą wzrostu"}`;
        }
        return MARKETS.PL.universes.map(u => {
            const t = ctx.trends && ctx.trends[u];
            return `${FUNNEL_UNIVERSE_LABELS[u]} ${t ? (t.above ? "🟢" : "🔴") : "—"}`;
        }).join(" · ");
    }
    if (key === "sector") {
        if (!(cr.sectorTop > 0)) return "krok wyłączony";
        const names = [...(ctx.strongSectors || [])];
        return names.length ? names.join(", ") : "brak sektorów z RS > 0";
    }
    if (key === "squeeze") return "🌀 konsolidacja lub 🔥 świeże wybicie";
    if (key === "entry") return "wybicie + histogram rośnie + cena nad stopem";
    return "";
}

function renderFunnelViz(evaluated, market, ctx) {
    const steps = funnelSteps(evaluated, market);
    const total = evaluated.length || 1;
    const focus = steps.some(st => st.key === settings.focusStep) ? settings.focusStep : "base";
    const barPct = n => Math.max(6, (n / total) * 100);

    const head = `
        <div class="funnel-row funnel-row-top">
            <div class="funnel-row-head"><span class="funnel-row-title">Wszystkie spółki ${market === "USA" ? "SP500 + Nasdaq 100" : "WIG20 + mWIG40"}</span></div>
            <div class="funnel-bar-track"><div class="funnel-bar funnel-bar-all" style="width:100%"><span>${evaluated.length}</span></div></div>
        </div>`;
    const rows = steps.map((st, i) => {
        const dropped = st.in - st.out;
        const last = i === steps.length - 1;
        const info = stepInfoText(st.key, market, ctx);
        return `
        <div class="funnel-row${st.key === focus ? " focused" : ""}" data-step="${st.key}" role="button" tabindex="0" title="Kliknij, żeby zobaczyć spółki na tym kroku">
            <div class="funnel-row-head">
                <span class="funnel-row-title">${st.icon} ${st.label}</span>
                <span class="funnel-row-drop${dropped ? "" : " zero"}" data-drop="1" title="Odpadło na tym kroku — kliknij, żeby zobaczyć">−${dropped}</span>
            </div>
            <div class="funnel-bar-track"><div class="funnel-bar${last ? " funnel-bar-final" : ""}" style="width:${barPct(st.out)}%"><span>${st.out}</span></div></div>
            ${info ? `<div class="funnel-row-info">${info}</div>` : ""}
            <div class="funnel-chips">${chipsHtml(st.key)}</div>
        </div>`;
    }).join("");
    document.getElementById("funnelViz").innerHTML = head + rows;
    return steps;
}

function applyCriteriaChip(btn) {
    const cr = settings.criteria;
    const crit = btn.dataset.crit;
    const type = btn.dataset.type;
    if (type === "bool") {
        cr[crit] = !cr[crit];
    } else if (type === "single") {
        cr[crit] = Number(btn.dataset.val);
    } else if (type === "multi") {
        const val = btn.dataset.val;
        const set = new Set(cr[crit]);
        if (set.has(val)) set.delete(val); else set.add(val);
        if (crit === "stages" && set.size === 0) return; // co najmniej jeden etap
        cr[crit] = [...set];
    }
    saveSettings();
    renderFunnel();
}

function renderPlTrend(ctx) {
    const el = document.getElementById("plTrendBanners");
    el.innerHTML = MARKETS.PL.universes.map(u => {
        const t = ctx.trends[u];
        const label = FUNNEL_UNIVERSE_LABELS[u];
        if (!t) return `<div class="trend-banner">${label}: za mało historii, żeby policzyć SMA${STRATEGY_PL_INDEX_SMA_WEEKS} tyg.</div>`;
        const diff = ((t.level / t.sma) - 1) * 100;
        return t.above
            ? `<div class="trend-banner growth">🟢 ${label} W FAZIE WZROSTU — indeks ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}% nad SMA${STRATEGY_PL_INDEX_SMA_WEEKS} tyg. (${t.date})</div>`
            : `<div class="trend-banner no-growth">🔴 ${label} POZA FAZĄ WZROSTU — indeks ${diff.toFixed(1)}% pod SMA${STRATEGY_PL_INDEX_SMA_WEEKS} tyg. (${t.date}) — brak nowych wejść w spółki z tego indeksu</div>`;
    }).join("");
}

function failedAtLabel(key) {
    const g = FUNNEL_GATES.find(x => x.key === key);
    return g ? g.label : key;
}

function listStatusHtml(e) {
    if (e.status) return statusHtml(e.status);
    return `<span class="funnel-status funnel-status-drop" title="Pierwszy krok lejka, którego spółka nie przeszła.">✗ ${failedAtLabel(e.failedAt)}</span>`;
}

function watchRowHtml(e, currency) {
    return `
        <td class="ticker-cell">${e.ticker}</td>
        <td>${FUNNEL_UNIVERSE_LABELS[e.universe] || e.universe}</td>
        <td>${e.sector && e.sector !== "Unknown" ? e.sector : '<span style="color:var(--text-faint)">—</span>'}</td>
        <td>${fmtPriceFor(currency, e.price)}</td>
        <td>${weeklySparkHtmlFor(e.record)}</td>
        <td>${stageCellHtml(e.stage)}</td>
        <td>${e.baseCount != null ? e.baseCount : "—"}</td>
        <td>${fmtSigned(e.rsShort)}</td>
        <td>${fmtSigned(e.rsMedium)}</td>
        <td>${fmtSigned(e.rsLong)}</td>
        <td>${squeezeStatusHtml(e.squeeze)}</td>
        <td>${listStatusHtml(e)}</td>
        <td>${chartBtnHtml(e.ticker, e.universe)}</td>
    `;
}

// Sortowanie listy: puste wartosci zawsze na koncu, niezaleznie od kierunku.
function compareListRows(a, b, key, dir) {
    const val = r => key === "statusRank"
        ? (r.status ? STATUS_ORDER[r.status] : 10 + FUNNEL_GATES.findIndex(g => g.key === r.failedAt))
        : r[key];
    const va = val(a), vb = val(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    let cmp;
    if (typeof va === "string") cmp = va.localeCompare(String(vb), "pl");
    else cmp = va < vb ? -1 : va > vb ? 1 : 0;
    if (cmp === 0 && key === "statusRank") cmp = (b.rsMedium || 0) - (a.rsMedium || 0);
    return dir === "asc" ? cmp : -cmp;
}

function renderWatchTable(evaluated, currency, market) {
    const focus = gatesForMarket(market).some(g => g.key === settings.focusStep) ? settings.focusStep : "base";
    const mode = settings.focusMode === "dropped" ? "dropped" : "passed";
    const rows = rowsAtStep(evaluated, market, focus, mode);
    const label = failedAtLabel(focus);
    document.getElementById("watchTitle").textContent = mode === "dropped"
        ? `Odpadły na kroku: ${label}`
        : `Przeszły krok: ${label}`;
    document.querySelectorAll("#listModeToggle .chart-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    const sort = settings.listSort || { key: "statusRank", dir: "asc" };
    document.querySelectorAll("#watchTable thead th[data-key]").forEach(th => {
        th.classList.toggle("sort-asc", th.dataset.key === sort.key && sort.dir === "asc");
        th.classList.toggle("sort-desc", th.dataset.key === sort.key && sort.dir === "desc");
    });

    renderScreenerTable({
        tbody: document.getElementById("watchTableBody"),
        metaEl: document.getElementById("watchMeta"),
        allRows: rows,
        compareFn: (a, b) => compareListRows(a, b, sort.key, sort.dir),
        colspan: 13,
        emptyAllMsg: mode === "dropped" ? "Na tym kroku nic nie odpadło." : "Żadna spółka nie przeszła tego kroku — poluzuj kryteria w lejku.",
        emptyFilteredMsg: "Brak danych.",
        metaText: () => `${rows.length} spółek · ${rows.filter(e => e.status === "SETUP").length} w konsolidacji · ${rows.filter(e => e.status === "ENTRY").length} z sygnałem`,
        rowHtml: e => watchRowHtml(e, currency),
        afterRender: bindChartButtons,
    });
}

function heldSectorCounts(held, evaluatedByTicker) {
    const counts = {};
    held.forEach(t => {
        const e = evaluatedByTicker[t];
        if (e && e.sector && e.sector !== "Unknown") counts[e.sector] = (counts[e.sector] || 0) + 1;
    });
    return counts;
}

function renderEntryTable(evaluated, currency, held, evaluatedByTicker) {
    const cap = capital();
    const heldSet = new Set(held);
    const sectorCounts = heldSectorCounts(held, evaluatedByTicker);
    const rows = evaluated.filter(e => isSignalStatus(e.status)).map(e => Object.assign({}, e, {
        size: positionSize({
            price: e.price, stop: e.stop, capital: cap,
            riskPct: settings.allocation.riskPct / 100, maxPositionPct: settings.allocation.maxPositionPct / 100,
        }),
        alreadyHeld: heldSet.has(e.ticker),
        sectorFull: e.sector && e.sector !== "Unknown" && (sectorCounts[e.sector] || 0) >= STRATEGY_MAX_PER_SECTOR,
    }));
    const satellite = cap ? cap * settings.allocation.satellitePct / 100 : null;
    const totalValue = rows.filter(r => r.status === "ENTRY" && !r.alreadyHeld && r.size).reduce((a, r) => a + r.size.value, 0);

    renderScreenerTable({
        tbody: document.getElementById("entryTableBody"),
        metaEl: document.getElementById("entryMeta"),
        allRows: rows,
        compareFn: (a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || ((b.rsMedium || 0) - (a.rsMedium || 0)),
        colspan: 11,
        emptyAllMsg: "Brak sygnałów wejścia w tym tygodniu — sprawdź spółki w konsolidacji (🌀 Setup) w Kroku 3.",
        emptyFilteredMsg: "Brak danych.",
        metaText: () => cap
            ? `${rows.length} sygnałów · nowe pozycje razem ${fmtMoneyFor(currency, totalValue)} z budżetu satelity ${fmtMoneyFor(currency, satellite)}`
            : `${rows.length} sygnałów · wpisz kapitał powyżej, żeby policzyć wielkość pozycji`,
        rowHtml: e => {
            const s = e.size;
            const notes = [];
            if (e.alreadyHeld) notes.push('<span class="funnel-note">już masz</span>');
            if (e.sectorFull) notes.push(`<span class="funnel-note funnel-note-warn" title="Masz już ${STRATEGY_MAX_PER_SECTOR}+ pozycje w sektorze ${e.sector}.">⚠ sektor pełny</span>`);
            return `
                <td class="ticker-cell">${e.ticker} ${notes.join(" ")}</td>
                <td>${statusHtml(e.status)}</td>
                <td>${fmtPriceFor(currency, e.price)}</td>
                <td>${stopCellHtml(currency, e.stopInfo)}</td>
                <td>${e.stop != null ? `${(((e.price - e.stop) / e.price) * 100).toFixed(1)}%` : "—"}</td>
                <td>${s ? s.shares : "—"}</td>
                <td>${s ? fmtMoneyFor(currency, s.value) + (s.cappedByMax ? ` <span class="funnel-note" title="Ograniczone limitem ${settings.allocation.maxPositionPct}% kapitału na pozycję.">max</span>` : "") : "—"}</td>
                <td>${s ? fmtMoneyFor(currency, s.risk) : "—"}</td>
                <td>${macdCellHtml(e.macd)}</td>
                <td>${e.volumeRatio != null ? `<span class="${e.volumeConfirmed ? "positive" : ""}">${e.volumeRatio.toFixed(1)}×${e.volumeConfirmed ? " ✓" : ""}</span>` : "—"}</td>
                <td>${chartBtnHtml(e.ticker, e.universe)}</td>
            `;
        },
        afterRender: bindChartButtons,
    });
}

function renderHoldTable(market, held, currency) {
    const byTicker = {};
    marketRows(market).forEach(c => { byTicker[c.ticker] = c; });
    const rows = held.map(t => Object.assign({ ticker: t, record: byTicker[t] || null }, evaluateHolding(byTicker[t])));
    const order = { EXIT: 0, TIGHTEN: 1, HOLD: 2, NO_DATA: 3 };

    renderScreenerTable({
        tbody: document.getElementById("holdTableBody"),
        metaEl: document.getElementById("holdMeta"),
        allRows: rows,
        compareFn: (a, b) => order[a.action] - order[b.action],
        colspan: 9,
        emptyAllMsg: "Wpisz powyżej tickery swoich pozycji satelity.",
        emptyFilteredMsg: "Brak danych.",
        metaText: () => rows.length ? `${rows.filter(r => r.action === "EXIT").length} do wyjścia · ${rows.filter(r => r.action === "TIGHTEN").length} do podciągnięcia stopu` : "",
        rowHtml: r => {
            const c = r.record;
            return `
                <td class="ticker-cell">${r.ticker}</td>
                <td>${holdActionHtml(r.action)}</td>
                <td>${c ? fmtPriceFor(currency, c.price) : "—"}</td>
                <td>${stopCellHtml(currency, r.stopInfo)}</td>
                <td>${c && r.stop != null ? `${(((c.price - r.stop) / c.price) * 100).toFixed(1)}%` : "—"}</td>
                <td>${c ? stageCellHtml(r.stage) : "—"}</td>
                <td>${c ? fmtSigned(r.rsMedium) : "—"}</td>
                <td>${r.reasons.join(", ")}</td>
                <td>${c ? chartBtnHtml(r.ticker, c.universe) : ""}</td>
            `;
        },
        afterRender: bindChartButtons,
    });
}

function renderFunnel() {
    const market = settings.market;
    const currency = MARKETS[market].currency;
    renderSettings();

    const usa = market === "USA";
    document.getElementById("marketUsa").hidden = !usa;
    document.getElementById("marketPl").hidden = usa;
    document.getElementById("sectorUsa").hidden = !usa;
    document.getElementById("sectorPl").hidden = usa;
    document.getElementById("helperCards").hidden = !usa;

    const { ctx, evaluated } = evaluateMarket(market);
    const byTicker = {};
    evaluated.forEach(e => { byTicker[e.ticker] = e; });
    const held = parseTickerList(settings[`held${market}`]);

    if (!usa) {
        renderPlTrend(ctx);
        const d = marketData.WIG20;
        document.getElementById("trendRefDate").textContent = d ? d.ref_date : "";
        document.getElementById("sectorMeta").textContent = "";
    }
    renderFunnelViz(evaluated, market, ctx);
    renderWatchTable(evaluated, currency, market);
    renderEntryTable(evaluated, currency, held, byTicker);
    renderHoldTable(market, held, currency);
    renderCapitalCard(evaluated.some(e => e.status === "ENTRY"), market);
}

const CAPITAL_FIELDS = [
    ["capCoreInput", "core"], ["capSatPosInput", "satPositions"],
    ["capSatCashInput", "satCash"], ["capContribInput", "contribution"],
];

function daysSince(isoDate) {
    if (!isoDate) return null;
    const ms = Date.now() - new Date(isoDate + "T00:00:00").getTime();
    return isFinite(ms) ? Math.max(0, Math.floor(ms / 86400000)) : null;
}

function renderCapitalCard(hasEntrySignals, market) {
    const c = settings.capital;
    CAPITAL_FIELDS.forEach(([id, k]) => {
        const el = document.getElementById(id);
        if (document.activeElement !== el) el.value = c[k] != null ? c[k] : "";
    });
    const gem = gemRanking(gemData);
    const plan = capitalPlan({
        core: c.core, satPositions: c.satPositions, satCash: c.satCash, contribution: c.contribution,
        targetSatPct: settings.allocation.satellitePct, peak: c.peak,
        hasEntrySignals, daysSinceRebalance: daysSince(c.lastRebalance), gem,
    });

    const fmt = v => `${Math.round(v).toLocaleString("pl-PL")} zł`;
    const target = settings.allocation.satellitePct;
    const dev = plan.deviationPp;
    const stat = (label, value, cls = "") => `<div class="stat-card"><div class="label">${label}</div><div class="value${cls}">${value}</div></div>`;
    document.getElementById("capitalStats").innerHTML = plan.satPct == null ? "" : [
        stat("Razem (po dopłacie)", fmt(plan.total)),
        stat(`Satelita (cel ${target}%)`, `${plan.satPct.toFixed(1)}%`, Math.abs(dev) > STRATEGY_REBALANCE_BAND_PP ? " negative" : " positive"),
        stat("Odchylenie od celu", `${dev >= 0 ? "+" : ""}${dev.toFixed(1)} pp`),
        stat(`Spadek Satelity od szczytu`, `${plan.drawdownPct.toFixed(1)}%`, plan.drawdownPct >= STRATEGY_SATELLITE_MAX_DRAWDOWN_PCT ? " negative" : ""),
    ].join("");
    const bar = document.getElementById("capitalBar");
    if (plan.satPct == null) {
        bar.innerHTML = "";
    } else {
        const lo = Math.max(0, target - STRATEGY_REBALANCE_BAND_PP), hi = Math.min(100, target + STRATEGY_REBALANCE_BAND_PP);
        bar.innerHTML = `
            <div class="capital-bar-track" title="Zielone pole = pasmo ±${STRATEGY_REBALANCE_BAND_PP} pp wokół celu">
                <div class="capital-bar-core" style="width:${100 - plan.satPct}%">Core ${(100 - plan.satPct).toFixed(0)}%</div>
                <div class="capital-bar-sat" style="width:${plan.satPct}%">Satelita ${plan.satPct.toFixed(0)}%</div>
                <div class="capital-bar-band" style="left:${100 - hi}%;width:${hi - lo}%"></div>
            </div>`;
    }
    const icons = { ok: "✅", contribute: "➕", move: "↔️", sell: "💱", hold: "⏸", warn: "ℹ️" };
    document.getElementById("capitalActions").innerHTML = plan.actions
        .map(a => `<li class="capital-action capital-action-${a.kind}">${icons[a.kind] || ""} ${a.text}</li>`).join("");
    document.getElementById("capitalMeta").textContent = [
        c.lastRebalance ? `ostatni rebalans: ${c.lastRebalance}` : "rebalansu jeszcze nie było",
        `sygnały wejścia (${market}): ${hasEntrySignals ? "są" : "brak"}`,
    ].join(" · ");

    const tbody = document.getElementById("gemTableBody");
    document.getElementById("gemMeta").textContent = gemData ? `okno do ${String((gem && gem.winner.date_now) || gemData.ref_date).slice(0, 10)}` : "";
    tbody.innerHTML = gem ? gem.rows.map((r, i) => `
        <tr${i === 0 ? ' class="row-selected"' : ""}>
            <td><span class="rank-badge">${i + 1}</span></td>
            <td>${GEM_INDEX_LABELS[r.universe] || r.universe}${r.manual_entry ? ' <span style="color:var(--text-faint)">(ręcznie)</span>' : ""}</td>
            <td class="${r.return_pct >= 0 ? "positive" : "negative"}">${r.return_pct >= 0 ? "+" : ""}${r.return_pct.toFixed(1)}%</td>
            <td>${i === 0 ? (gem.allNegative ? "⚠ wszystkie na minusie — gotówka/obligacje" : "🏆 dopłaty do Core tutaj") : ""}</td>
        </tr>`).join("") : '<tr><td colspan="4" class="empty-state">Brak danych GEM.</td></tr>';
}

async function switchMarket(market) {
    settings.market = market;
    saveSettings();
    try {
        await ensureMarketData(market);
    } catch (e) {
        if (typeof showToast === "function") showToast(`Nie udało się wczytać danych ${market}.`, { type: "error" });
    }
    renderFunnel();
    if (market === "USA") renderTrend();
}

function initFunnelControls() {
    document.querySelectorAll("#marketToggle .chart-mode-btn").forEach(btn => {
        btn.addEventListener("click", () => { if (btn.dataset.market !== settings.market) switchMarket(btn.dataset.market); });
    });
    document.getElementById("capitalInput").addEventListener("input", (ev) => {
        const v = parseFloat(ev.target.value);
        settings[`capital${settings.market}`] = isFinite(v) && v > 0 ? v : null;
        saveSettings();
        renderFunnel();
    });
    [["satellitePctInput", "satellitePct"], ["riskPctInput", "riskPct"], ["maxPositionPctInput", "maxPositionPct"]].forEach(([id, k]) => {
        const el = document.getElementById(id);
        el.addEventListener("input", () => {
            if (el.value === "" || !isFinite(Number(el.value))) return; // w trakcie pisania — nie nadpisuj
            settings.allocation = sanitizeAllocation(Object.assign({}, settings.allocation, { [k]: Number(el.value) }));
            saveSettings();
            renderFunnel();
        });
        el.addEventListener("change", () => { el.value = settings.allocation[k]; });
    });
    CAPITAL_FIELDS.forEach(([id, k]) => {
        document.getElementById(id).addEventListener("input", (ev) => {
            const v = parseFloat(ev.target.value);
            settings.capital[k] = isFinite(v) && v >= 0 ? v : null;
            saveSettings();
            renderFunnel();
        });
        // Szczyt Satelity (do limitu spadku) — tylko w gore, aktualizowany
        // dopiero po zatwierdzeniu pola ("change"), nie przy kazdym znaku:
        // inaczej poprawianie liczby (50000 -> 40000) chwilowo zawyzaloby szczyt
        // i falszywie blokowalo dolewanie do Satelity.
        if (k === "satPositions" || k === "satCash") {
            document.getElementById(id).addEventListener("change", () => {
                const c = settings.capital;
                const sat = (Number(c.satPositions) || 0) + (Number(c.satCash) || 0);
                if (sat > 0 && !(c.peak >= sat)) { c.peak = sat; saveSettings(); renderFunnel(); }
            });
        }
    });
    document.getElementById("capRebalancedBtn").addEventListener("click", () => {
        settings.capital.lastRebalance = new Date().toISOString().slice(0, 10);
        saveSettings();
        renderFunnel();
        if (typeof showToast === "function") showToast("Zapisano datę rebalansu — następny ze sprzedażą najwcześniej za kwartał.", { type: "success" });
    });
    document.getElementById("capResetPeakBtn").addEventListener("click", () => {
        const c = settings.capital;
        const sat = (Number(c.satPositions) || 0) + (Number(c.satCash) || 0);
        c.peak = sat > 0 ? sat : null;
        saveSettings();
        renderFunnel();
        if (typeof showToast === "function") showToast("Szczyt Satelity ustawiony na obecną wartość.", { type: "info" });
    });
    const viz = document.getElementById("funnelViz");
    viz.addEventListener("click", (ev) => {
        const chip = ev.target.closest(".funnel-chip");
        if (chip) { applyCriteriaChip(chip); return; }
        const row = ev.target.closest(".funnel-row[data-step]");
        if (!row) return;
        settings.focusStep = row.dataset.step;
        settings.focusMode = ev.target.closest("[data-drop]") ? "dropped" : "passed";
        saveSettings();
        renderFunnel();
        const list = document.getElementById("watchCard");
        if (list && list.scrollIntoView && window.innerWidth <= 640) list.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    viz.addEventListener("keydown", (ev) => {
        if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".funnel-row[data-step]")) { ev.preventDefault(); ev.target.click(); }
    });
    document.getElementById("resetCriteriaBtn").addEventListener("click", () => {
        settings.criteria = Object.assign({}, DEFAULT_CRITERIA);
        saveSettings();
        renderFunnel();
        if (typeof showToast === "function") showToast("Przywrócono domyślne kryteria lejka.", { type: "info" });
    });
    document.querySelectorAll("#listModeToggle .chart-mode-btn").forEach(btn => {
        btn.addEventListener("click", () => { settings.focusMode = btn.dataset.mode; saveSettings(); renderFunnel(); });
    });
    document.querySelectorAll("#watchTable thead th[data-key]").forEach(th => {
        th.addEventListener("click", () => {
            const cur = settings.listSort || { key: "statusRank", dir: "asc" };
            const key = th.dataset.key;
            const textKeys = ["ticker", "universe", "sector", "statusRank", "stage"];
            settings.listSort = cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: textKeys.includes(key) ? "asc" : "desc" };
            saveSettings();
            renderFunnel();
        });
    });
    document.getElementById("heldInput").addEventListener("change", (ev) => {
        settings[`held${settings.market}`] = ev.target.value;
        saveSettings();
        renderFunnel();
    });
}

function renderAll() {
    // Tabele NIE zaleza od Chart.js — renderowane PRZED renderTrend() (ktora na
    // koncu tworzy wykres Chart.js), zeby ewentualny problem z lokalnym plikiem
    // Chart.js (patrz js/vendor/) nie zablokowal reszty strony.
    renderFunnel();
    renderSectorTable();
    renderLeadersTable();
    renderTopRsTable();
    if (settings.market === "USA") renderTrend();
}

// typeof document check: pozwala wczytac ten plik przez require() w testach
// Node (patrz tests/js/) bez uruchamiania inicjalizacji strony.
if (typeof document !== "undefined") {
    (async function init() {
        initConnStatus();
        initTrendChartToggle();
        initFunnelControls();
        try {
            await loadStrategyData();
            await ensureMarketData(settings.market);
        } catch (e) {
            if (typeof showToast === "function") showToast("Nie udało się wczytać części danych strategii.", { type: "error" });
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
    module.exports = {
        squeezeStatusFor, indexTrendFromRows, strongSectorSet, stopPriceFor, strategyStopFor, macdConfirmation, squeezeMomentum,
        evaluateCandidate, funnelSteps, rowsAtStep, compareListRows, DEFAULT_CRITERIA, positionSize, sanitizeAllocation, gemRanking, capitalPlan, evaluateHolding, parseTickerList,
    };
}
