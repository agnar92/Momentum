// TV_EMBED_BASE/buildTvWidgetBlock/TV_1MIN_VWAP_WIDGET żyją w js/shared.js
// (ep.html ładuje je PRZED tym plikiem, patrz komentarz na górze shared.js).
// showToast/initConnStatus/hideLoadingOverlay żyją analogicznie w js/qol.js.
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./qol.js"));
}

// ============================================================
// SEKCJA EP (Episodic Pivot) — na wyraźną prośbę użytkownika, jako osobna,
// samodzielna strona (patrz "New standalone page" w CLAUDE.md — ten sam
// wzorzec co chart.html: coś, co nie pasuje do istniejącego kształtu
// screenerów, dostaje własną stronę zamiast zakładki bolted-on do innej).
//
// Reszta apki (Wybicie/TTM Squeeze/Continuation/Qullamaggie na signals.js)
// liczy własne sygnały z cotygodniowo pobieranych danych yfinance (patrz
// CLAUDE.md) — dobre do wykrywania wielotygodniowych wybić, ale bezużyteczne
// do EP: gap przedrynkowy trzeba złapać TEGO SAMEGO DNIA, więc ta strona w
// ogóle nie dotyka pipeline'u/docs/data/*.json. Zamiast tego trzy elementy,
// wszystkie na żywo, wszystkie z darmowych osadzonych widgetów TradingView:
//   1. Skaner (embed-widget-screener.js) — kandydaci na gapujące spółki.
//   2. Top Stories (embed-widget-timeline.js, feedMode:"market") — czy dany
//      ruch ma za sobą newsa/wyniki, czy to "cisza" (podejrzana zmienność
//      bez powodu).
//   3. Dziennik EP (localStorage, ten sam wzorzec co holdings/excluded w
//      rebalance.js) — ręcznie dodajesz tickera, klasyfikujesz TYP EP (żeby
//      z czasem widzieć, które kategorie faktycznie działają) i status.
// Klik w "📈 1 min + VWAP" w dzienniku otwiera ten sam widget co zakładka
// "⚡ 1 min + VWAP" na signals.html (TV_1MIN_VWAP_WIDGET, js/shared.js) —
// tam też NIE ma własnego wykresu (za mało/brak historii minutowej w tym
// pipeline), tylko ta sama filozofia: screener/dziennik wskazuje kandydata,
// dokładny moment wejścia (Opening Range Breakout + sesyjny VWAP)
// obserwujesz sam, na żywo.
//
// WAŻNE OGRANICZENIE DARMOWYCH WIDGETÓW: osadzony Screener/Top Stories to
// zwykły <iframe> bez API do informowania strony-hosta o kliknięciu wiersza
// (to nie to samo co płatna Charting Library z callbackami typu
// onSymbolChange) — więc klik na tickera WEWNĄTRZ tych widgetów nie może
// sam otworzyć naszego okna 1-min+VWAP. Stąd dziennik EP poniżej: ticker,
// który zauważysz w skanerze/newsach, wpisujesz RĘCZNIE do dziennika — a
// KAŻDY wiersz dziennika (własny <button>, nie część widgetu TradingView)
// dostaje działający przycisk otwierający okno 1-min+VWAP dla TEGO tickera.
// ============================================================

// ============================================================
// SKANER GAPÓW — embed-widget-screener.js. Darmowy widget nie ma
// udokumentowanego presetu "gap przedrynkowy" (sprawdzone w dokumentacji
// TradingView — defaultScreen bierze jedną z ustalonych wartości typu
// most_capitalized/top_gainers/unusual_volume/most_volatile/
// earnings_this_week, żadna nie nazywa się wprost "premarket"), więc
// domyślny preset to najbliższe przybliżenie ("🔥 Największe wzrosty"), a
// pozostałe trzy presety (przełączane przyciskami — ten sam wzorzec
// przebudowy widgetu od zera co renderTvOverviewPanel w chart-modal.js,
// bo osadzony <script> nie ma API do podmiany configu w locie) pokrywają
// resztę tego, co realnie sygnalizuje EP. showToolbar:true zostawia
// użytkownikowi WEWNĄTRZ widgetu własny pasek narzędzi TradingView, gdzie
// można dodać kolumnę/filtr "Zmiana od otwarcia %" albo realny "Premarket
// Change %" i posortować po niej ręcznie — patrz panel-hint w ep.html.
// ============================================================
const EP_SCREENER_PRESETS = [
    { key: "top_gainers", label: "🔥 Największe wzrosty" },
    { key: "unusual_volume", label: "📊 Nietypowy wolumen" },
    { key: "earnings_this_week", label: "📅 Wyniki w tym tygodniu" },
    { key: "most_volatile", label: "🌪 Najbardziej zmienne" },
];

const EP_SCREENER_WIDGET = {
    src: `${TV_EMBED_BASE}embed-widget-screener.js`,
    heightPx: 640,
    config: screen => ({
        width: "100%",
        height: "100%",
        defaultColumn: "performance",
        defaultScreen: screen,
        showToolbar: true,
        market: "america",
        colorTheme: "dark",
        isTransparent: true,
        locale: "pl",
    }),
};

// "Top Stories" — sprawdzone (github.com/dsnchz/solid-tradingview-widgets,
// TopStories.tsx) że to ten sam skrypt co zakładka "🏢 Dane spółki"/"oś czasu
// newsów" (embed-widget-timeline.js) na chart-modal.js, tylko z
// feedMode:"market" zamiast "symbol" — ogólny feed newsów rynkowych, nie
// przypięty do jednej spółki (bo tu nie wiadomo z góry, KTÓRA spółka
// gapuje — to właśnie ten news ma podpowiedzieć).
const EP_NEWS_WIDGET = {
    src: `${TV_EMBED_BASE}embed-widget-timeline.js`,
    heightPx: 640,
    config: () => ({
        feedMode: "market",
        width: "100%",
        height: "100%",
        colorTheme: "dark",
        isTransparent: true,
        displayMode: "regular",
        locale: "pl",
    }),
};

let activeScreenerPreset = EP_SCREENER_PRESETS[0].key;

function renderEpScreenerWidget() {
    const container = document.getElementById("epScreenerContainer");
    if (!container) return;
    container.querySelectorAll(".tv-widget-block").forEach(el => el.remove());
    container.appendChild(buildTvWidgetBlock(EP_SCREENER_WIDGET, activeScreenerPreset));
}

function initEpScreenerPresets() {
    const wrap = document.getElementById("epScreenerPresets");
    if (!wrap) return;
    wrap.querySelectorAll(".chart-mode-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (btn.dataset.preset === activeScreenerPreset) return;
            activeScreenerPreset = btn.dataset.preset;
            wrap.querySelectorAll(".chart-mode-btn").forEach(b => b.classList.toggle("active", b === btn));
            renderEpScreenerWidget();
        });
    });
}

function renderEpNewsWidget() {
    const container = document.getElementById("epNewsContainer");
    if (!container) return;
    container.querySelectorAll(".tv-widget-block").forEach(el => el.remove());
    container.appendChild(buildTvWidgetBlock(EP_NEWS_WIDGET, null));
}

// ============================================================
// KLASYFIKACJA TYPU EP — na wyraźną prośbę użytkownika ("confirm what type
// of EP it is to track it"), standardowa taksonomia w stylu Qullamaggie:
// wyniki/prognozy, M&A/kontrakt, zgoda regulacyjna, podniesienie ratingu,
// short squeeze/inne newsy, nieznane. Z czasem (dziennik rośnie tydzień po
// tygodniu) to jedyny sposób, żeby zobaczyć, które kategorie faktycznie
// działają, bez ręcznego przeglądania notatek.
// ============================================================
const EP_TYPES = [
    { value: "earnings", label: "Wyniki / podniesienie prognoz" },
    { value: "ma_contract", label: "Fuzja / przejęcie / kontrakt" },
    { value: "regulatory", label: "Zgoda FDA / regulacyjna" },
    { value: "upgrade", label: "Podniesienie ratingu (analitycy)" },
    { value: "squeeze_other", label: "Short squeeze / inne newsy" },
    { value: "unknown", label: "Nieznane / inne" },
];

const EP_STATUSES = [
    { value: "watching", label: "👀 Obserwuję" },
    { value: "entered", label: "✅ Wszedłem" },
    { value: "passed", label: "⏭ Pominąłem" },
];

function epTypeLabel(value) {
    const found = EP_TYPES.find(t => t.value === value);
    return found ? found.label : EP_TYPES[EP_TYPES.length - 1].label;
}

function epStatusLabel(value) {
    const found = EP_STATUSES.find(s => s.value === value);
    return found ? found.label : EP_STATUSES[0].label;
}

function epTypeOptionsHtml(selected) {
    return EP_TYPES.map(t => `<option value="${t.value}"${t.value === selected ? " selected" : ""}>${t.label}</option>`).join("");
}

function epStatusOptionsHtml(selected) {
    return EP_STATUSES.map(s => `<option value="${s.value}"${s.value === selected ? " selected" : ""}>${s.label}</option>`).join("");
}

// Ticker do WYŁĄCZNIE liter/cyfr/kropki/myślnika (np. "BRK.B") wielkimi
// literami — ten sam duch co excluded.push(...) w rebalance.js (input.value.
// trim().toUpperCase()), tylko dodatkowo odcina znaki, które i tak nigdy nie
// występują w prawdziwym tickerze, żeby notatka wklejona przypadkiem do złego
// pola nie trafiła tu jako "ticker".
function sanitizeTicker(raw) {
    return (raw || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12);
}

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

// Najnowsze na górze (po dacie), przy remisie alfabetycznie po tickerze —
// dziennik rośnie tydzień po tygodniu, świeże wpisy są tym, co realnie
// chcesz widzieć bez przewijania.
function sortEpEntries(entries) {
    return [...entries].sort((a, b) => {
        const byDate = (b.date || "").localeCompare(a.date || "");
        if (byDate !== 0) return byDate;
        return (a.ticker || "").localeCompare(b.ticker || "");
    });
}

// Notatki to jedyne wolne pole tekstowe w dzienniku (ticker jest już
// oczyszczony przez sanitizeTicker) — bez tego cudzysłów wpisany w notatce
// urywałby atrybut value="..." poniżej i psuł resztę wiersza tabeli.
function escAttr(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

const EP_LOG_KEY = "momentum_ep_log";

function loadEpLog() {
    if (typeof localStorage === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(EP_LOG_KEY)) || []; } catch (e) { return []; }
}

function saveEpLog(entries) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(EP_LOG_KEY, JSON.stringify(entries));
}

let epLog = [];

function renderEpLogTable() {
    const tbody = document.getElementById("epLogBody");
    const empty = document.getElementById("epLogEmpty");
    if (!tbody) return;
    const sorted = sortEpEntries(epLog);
    tbody.innerHTML = "";
    if (empty) empty.hidden = sorted.length > 0;
    sorted.forEach(entry => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${entry.date || ""}</td>
            <td class="ep-ticker-cell">${entry.ticker}</td>
            <td><select class="ep-type-select">${epTypeOptionsHtml(entry.type)}</select></td>
            <td><select class="ep-status-select">${epStatusOptionsHtml(entry.status)}</select></td>
            <td><input type="text" class="ep-notes-input" value="${escAttr(entry.notes)}" placeholder="notatki"></td>
            <td><button type="button" class="add-row-btn ep-vwap-btn" title="Otwórz ${entry.ticker} na wykresie 1 min + VWAP">📈 1 min + VWAP</button></td>
            <td><button type="button" class="remove-row-btn" title="Usuń z dziennika">✕</button></td>
        `;
        tr.querySelector(".ep-type-select").addEventListener("change", (e) => {
            entry.type = e.target.value;
            saveEpLog(epLog);
        });
        tr.querySelector(".ep-status-select").addEventListener("change", (e) => {
            entry.status = e.target.value;
            saveEpLog(epLog);
        });
        tr.querySelector(".ep-notes-input").addEventListener("change", (e) => {
            entry.notes = e.target.value.trim();
            saveEpLog(epLog);
        });
        tr.querySelector(".ep-vwap-btn").addEventListener("click", () => openEpChartModal(entry.ticker));
        tr.querySelector(".remove-row-btn").addEventListener("click", () => {
            epLog = epLog.filter(e => e.id !== entry.id);
            saveEpLog(epLog);
            renderEpLogTable();
        });
        tbody.appendChild(tr);
    });
}

function initEpLogForm() {
    const btn = document.getElementById("epAddBtn");
    if (!btn) return;
    const tickerInput = document.getElementById("epTickerInput");
    const typeInput = document.getElementById("epTypeInput");
    const statusInput = document.getElementById("epStatusInput");
    const notesInput = document.getElementById("epNotesInput");
    typeInput.innerHTML = epTypeOptionsHtml(EP_TYPES[0].value);
    statusInput.innerHTML = epStatusOptionsHtml(EP_STATUSES[0].value);

    const addEntry = () => {
        const ticker = sanitizeTicker(tickerInput.value);
        if (!ticker) { tickerInput.focus(); return; }
        epLog.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ticker,
            date: todayIso(),
            type: typeInput.value,
            status: statusInput.value,
            notes: notesInput.value.trim(),
        });
        saveEpLog(epLog);
        tickerInput.value = "";
        notesInput.value = "";
        renderEpLogTable();
        showToast(`${ticker} dodany do dziennika EP`, { type: "success" });
    };
    btn.addEventListener("click", addEntry);
    tickerInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addEntry(); } });
}

// ============================================================
// OKNO "1 min + VWAP" — lekka wersja tego samego modala co #chartModal na
// signals.html (chart-modal.js), ale bez CAŁEJ maszynerii własnego wykresu/
// TradingView "wizytówki" — ta strona w ogóle nie wczytuje docs/data/*.json
// (patrz komentarz na górze pliku), więc dla tickera z dziennika EP nie ma
// tu żadnego state.currentRsEntry do pokazania. Reużywa gotowych klas CSS
// (.chart-modal-backdrop/.charts-area/.chart-modal-close/.chart-mode-toggle/
// .chart-ticker-label/.tv-widget-block) zamiast pisać nowe style — patrz
// style.css, te same klasy stylują #chartModal na signals.html.
// ============================================================
function openEpChartModal(ticker) {
    const modal = document.getElementById("epChartModal");
    const container = document.getElementById("epChartContainer");
    const label = document.getElementById("epChartTickerLabel");
    const tvBtn = document.getElementById("epChartOpenTvBtn");
    if (!modal || !container) return;
    container.querySelectorAll(".tv-widget-block").forEach(el => el.remove());
    if (label) label.textContent = ticker;
    if (tvBtn) tvBtn.dataset.ticker = ticker;
    container.appendChild(buildTvWidgetBlock(TV_1MIN_VWAP_WIDGET, ticker));
    modal.hidden = false;
}

function closeEpChartModal() {
    const modal = document.getElementById("epChartModal");
    if (modal) modal.hidden = true;
}

function initEpChartModal() {
    const modal = document.getElementById("epChartModal");
    if (!modal) return;
    document.getElementById("epChartModalClose").addEventListener("click", closeEpChartModal);
    modal.addEventListener("click", (ev) => { if (ev.target === modal) closeEpChartModal(); });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !modal.hidden) closeEpChartModal(); });
    const tvBtn = document.getElementById("epChartOpenTvBtn");
    if (tvBtn) {
        tvBtn.addEventListener("click", () => {
            if (tvBtn.dataset.ticker) window.open(tvUrlFor(tvBtn.dataset.ticker), "_blank", "noopener");
        });
    }
}

// typeof document check: pozwala wczytać ten plik przez `require()` w
// testach Node (tests/js/ep.test.js) bez uruchamiania inicjalizacji strony —
// w przeglądarce document zawsze istnieje, więc zachowanie się nie zmienia.
if (typeof document !== "undefined") {
    (function init() {
        initConnStatus();
        epLog = loadEpLog();
        initEpScreenerPresets();
        renderEpScreenerWidget();
        renderEpNewsWidget();
        initEpLogForm();
        renderEpLogTable();
        initEpChartModal();
        hideLoadingOverlay();
    })();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
}

// Eksport wyłącznie dla test runnera Node (tests/js/ep.test.js) — nie
// ładowany i bez efektu w przeglądarce (module tam nie istnieje).
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        EP_SCREENER_PRESETS, EP_SCREENER_WIDGET, EP_NEWS_WIDGET,
        EP_TYPES, EP_STATUSES, epTypeLabel, epStatusLabel,
        sanitizeTicker, sortEpEntries, todayIso,
    };
}
