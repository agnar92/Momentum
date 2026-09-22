// ============================================================
// SILNIK WŁASNEGO WYKRESU STAGE-ANALYSIS ("wykres 10:30" + wolumen + MACD +
// TTM Squeeze + Mansfield RS, opcjonalny) — WSPÓLNY dla dashboardu
// (index.html/app.js, wewnątrz #chartPanelOwn) i strony pełnoekranowego
// wykresu (chart.html/chart.js). Wydzielony do osobnego pliku na wyraźną
// prośbę użytkownika: pierwsza wersja tego wykresu poza dashboardem (w
// rebalance.js, zanim istniało chart.html) skopiowała cały ten kod jako drugą,
// niezależną kopię — zamiast tego obie strony ładują TEN SAM
// plik skryptu (zwykły <script>, bez modułów/bundlera — patrz "no build step"
// w CLAUDE.md), więc funkcje/zmienne poniżej są zwykłymi globalami dzielonymi
// między stronami, nigdy zdefiniowanymi dwa razy. `index.html` musi ładować
// ten plik PRZED `js/app.js` (który dalej odwołuje się do tych globali bez
// zmian), a `chart.html` PRZED `js/chart.js`. Obie strony ładują też
// `js/shared.js` PRZED tym plikiem — STAGE_LABELS/STAGE_DESCRIPTIONS/
// STAGE_COLORS/STAGE_BREAKOUT_VOLUME_RATIO/BASE_BOX_COLORS użyte poniżej
// (renderStageBadge) żyją tam, żeby dało się je też współdzielić z
// rebalance.js (patrz komentarz na górze shared.js).
//
// Strony różnią się tylko cienką, WŁASNĄ warstwą "spinającą" (który ticker
// jest wybrany, skąd wziąć dane, jak wygląda przycisk "wstecz") — patrz
// `updateChartArea()` w app.js i `renderChartPanel()` w chart.js — to nie jest
// duplikacja SAMEGO WYKRESU, tylko nieunikniona różnica w tym, skąd każda
// strona bierze "aktualnie wybraną spółkę". `initMansfieldControls()`
// (przełącznik panelu Mansfield RS, patrz niżej) jest już WSPÓLNY — obie
// strony wołają go raz podczas inicjalizacji.
// ============================================================

// Node (tests/js/) nie ładuje <script> tagów — odtwarzamy tu ręcznie to samo
// współdzielenie globali z js/shared.js, które w przeglądarce daje sam
// kolejny <script src="js/shared.js"> przed tym plikiem.
if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
}

let rsChartInstance = null;

let rsVolumeChartInstance = null;
let rsMacdChartInstance = null;
let rsSqueezeChartInstance = null;
let rsMansfieldChartInstance = null;

// Panel Mansfield RS (RSM) jest teraz OPCJONALNY — przeniesiony na sam dół
// (patrz komentarz przy renderRelativeStrengthChart) i domyślnie zwinięty,
// włączany osobnym przyciskiem (#rsMansfieldToggleBtn, patrz
// initMansfieldControls niżej) zarówno w widoku normalnym, jak i
// pełnoekranowym (jeden wspólny przełącznik zamiast osobnego dla trybu
// pełnoekranowego, jak wcześniej — patrz initChartFullscreen w app.js).
// Domyślnie false: panel jest schowany, dopóki użytkownik go sam nie otworzy.
let mansfieldPanelVisible = false;

// Przesuwa widoczny zakres osi X panelu wolumenu tak, zeby dokladnie odpowiadal
// aktualnemu zoom/pan wykresu 10:30 (patrz onZoomComplete/onPanComplete w
// renderRelativeStrengthChart) — oba wykresy dziela dokladnie te sama tablice
// etykiet (chartData.dates), wiec pozycje na osi X (indeksy kategorii) sa
// bezposrednio przenaszalne miedzy nimi bez przeliczania dat.
function syncVolumeXRange(sourceChart) {
    if (!rsVolumeChartInstance) return;
    const xScale = sourceChart.scales.x;
    rsVolumeChartInstance.options.scales.x.min = xScale.min;
    rsVolumeChartInstance.options.scales.x.max = xScale.max;
    rsVolumeChartInstance.update("none");
}

// Resetuje interaktywny zoom/pan (chartjs-plugin-zoom) wykresu 10:30. Panel
// wolumenu nie ma wlasnego stanu zoom/pan (patrz syncVolumeXRange) — jego os X
// jest tylko RECZNIE dopasowywana do wykresu 10:30, wiec reset polega na
// wyczyszczeniu tego recznego min/max, nie na resetZoom(). Kazda strona sama
// podpina ten reset pod swoj wlasny przycisk #resetZoomBtn (initResetZoomButton
// w app.js/chart.js) — dashboard dodatkowo ma #fsResetZoomBtn w trybie
// pelnoekranowym (patrz initChartFullscreen w app.js), ktorego chart.html nie
// potrzebuje (cala strona i tak juz jest pelnoekranowa).
function resetChartZoom() {
    if (rsChartInstance) rsChartInstance.resetZoom();
    if (rsVolumeChartInstance) {
        rsVolumeChartInstance.options.scales.x.min = undefined;
        rsVolumeChartInstance.options.scales.x.max = undefined;
        rsVolumeChartInstance.update();
    }
}

// Niszczy wszystkie 5 instancji Chart.js panelu wykresu (wywołujący sam
// odpowiada za renderStageBadge(null) obok, tak jak dotychczas) — wspólne
// "wyczyść wykres", używane zarówno przez app.js (gdy wybrana spółka nie ma
// weekly_chart) jak i chart.js (ten sam przypadek na osobnej stronie).
function destroyChartInstances() {
    if (rsChartInstance) { rsChartInstance.destroy(); rsChartInstance = null; }
    if (rsVolumeChartInstance) { rsVolumeChartInstance.destroy(); rsVolumeChartInstance = null; }
    if (rsMacdChartInstance) { rsMacdChartInstance.destroy(); rsMacdChartInstance = null; }
    if (rsSqueezeChartInstance) { rsSqueezeChartInstance.destroy(); rsSqueezeChartInstance = null; }
    if (rsMansfieldChartInstance) { rsMansfieldChartInstance.destroy(); rsMansfieldChartInstance = null; }
    applyMansfieldPanelVisibility();
}

// STAGE_LABELS/STAGE_DESCRIPTIONS/STAGE_COLORS/STAGE_BREAKOUT_VOLUME_RATIO/
// BASE_BOX_COLORS zyja teraz w js/shared.js (patrz komentarz na gorze tego
// pliku) — wspoldzielone z app.js i rebalance.js, nie tylko z chart.js.

function renderStageBadge(stage) {
    const badge = document.getElementById("stageBadge");
    if (!badge) return;
    if (!stage || !STAGE_LABELS[stage]) { badge.innerHTML = ""; return; }
    badge.innerHTML = `<span class="stage-dot" style="background:${STAGE_COLORS[stage]}"></span>`
        + `<span style="color:${STAGE_COLORS[stage]}">${STAGE_LABELS[stage]}</span>`
        + `<span class="stage-desc">${STAGE_DESCRIPTIONS[stage]}</span>`;
}

// Średnia krocząca wolumenu — ~50 sesji dziennych przełożone na tygodnie
// (dane są tygodniowe, patrz weekly_chart, więc 50 dni sesyjnych ≈ 10 tygodni
// przy 5 sesjach/tydzień). Zwraca tablicę tej samej długości co `values` —
// dla pierwszych punktów okno jest krótsze (średnia z tego, co dostępne), a
// nie `null`, żeby linia zaczynała się od razu, nie dopiero po 10 tygodniach.
const VOLUME_SMA_WEEKS = 10; // ~50 dni sesyjnych
function rollingMean(values, window) {
    return values.map((_, i) => {
        const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter(v => v != null);
        return slice.length ? slice.reduce((s, v) => s + v, 0) / slice.length : null;
    });
}

// Wykres Mansfield RS ma WŁASNE, znacznie krótsze okno niż wykres 10:30/
// wolumen (patrz compute_mansfield_rs_chart w run_query.py — RS_MANSFIELD_
// DISPLAY_WEEKS = 26 tyg. vs 12-14-miesięczne okno momentum) — bez tego dwa
// wykresy jeden pod drugim mają RÓŻNĄ liczbę tygodni na tej samej szerokości
// canvasu, więc ten sam piksel X odpowiada innej dacie na każdym z nich, i nie
// wiadomo, jakiego okresu w ogóle dotyczy dolny wykres. Zamiast poszerzać samo
// okno Mansfielda (próbowane wcześniej — ponad połowa tygodni wychodziła
// `null` z powodu płytkiej ~15-miesięcznej retencji `prices`, patrz CLAUDE.md),
// dopełniamy go do TEJ SAMEJ tablicy dat co wykres 10:30 (`fullDates`)
// wartościami `null` przed startem własnego okna Mansfielda — obie serie mają
// wtedy identyczną liczbę kategorii na osi X, więc skala (piksele na tydzień)
// jest dokładnie ta sama na obu wykresach, a pusty odcinek z lewej strony
// samej linii RSM od razu pokazuje, od kiedy zaczynają się dane (potwierdzone
// słownie w #rsMansfieldCaption, patrz niżej). mansfieldData.dates to zawsze
// dokładny podzbiór (sufiks) fullDates — sam sposób ich liczenia w backendzie
// resampluje z tych samych dziennych tabel tym samym `DATE_TRUNC('week', ...)`.
// Trzecia linia, "long" (rsm_long, ~12M wygladzenie, RS_MANSFIELD_LONG_WEEKS=52 w
// run_query.py) — teraz rysowana w panelu TTM Squeeze, nie w panelu Mansfielda
// (patrz "RS 52 tyg." w renderRelativeStrengthChart, przeniesiona stamtad na
// wyrazne zyczenie uzytkownika), ale nadal liczona TUTAJ razem z short/medium,
// bo to jedna funkcja dopasowania dla calego mansfield_chart. Ten sam
// padding-do-fullDates dotyczy jej tak samo jak short/medium — z tym ze przy
// obecnej ~22-miesiecznej retencji prices ten konkretny wariant regularnie
// zaczyna jako `null` na sporej czesci wyswietlanego okna (52-tyg. zapas
// rozgrzewkowy nie miesci sie caly przed start_date), patrz komentarz przy
// RS_MANSFIELD_LONG_WEEKS w run_query.py — to oczekiwane, nie blad.
function alignMansfieldToDates(mansfieldData, fullDates) {
    const idxByDate = new Map(mansfieldData.dates.map((d, i) => [d, i]));
    // `series[idx] ?? null` (nie samo `series[idx]`) — dla starszego, jeszcze
    // niezmigrowanego cache'a bez rsm_long (mansfieldData.rsm_long wtedy `undefined`)
    // pick() ma zwracac `null`, tak jak dla brakujacego tygodnia, a nie `undefined`.
    const pick = (series) => fullDates.map(d => (idxByDate.has(d) ? (series[idxByDate.get(d)] ?? null) : null));
    return {
        short: pick(mansfieldData.rsm_short || []),
        medium: pick(mansfieldData.rsm_medium || []),
        long: pick(mansfieldData.rsm_long || []),
    };
}

// Wskaznik TTM Squeeze (ttm_squeeze_chart, patrz compute_ttm_squeeze_chart w
// run_query.py) — ZASTEPUJE dawny wykres surowego wzrostu % 1/3/6 mies.
// (growth_chart, usuniety). Dopelniany do tej samej pelnej tablicy dat co
// wykres 10:30/wolumen/MACD, dokladnie tak samo jak alignMansfieldToDates
// powyzej (ten sam powod: wspolna skala X miedzy panelami).
function alignSqueezeToDates(squeezeData, fullDates) {
    const idxByDate = new Map(squeezeData.dates.map((d, i) => [d, i]));
    const pick = (series) => fullDates.map(d => (idxByDate.has(d) ? series[idxByDate.get(d)] : null));
    return {
        histogram: pick(squeezeData.histogram),
        squeezeOn: pick(squeezeData.squeeze_on),
        fired: pick(squeezeData.fired),
    };
}

// MACD (macd_chart, patrz compute_macd_chart w run_query.py) — panel dodany
// pod wolumenem na wyrazne zyczenie uzytkownika jako pomoc przy wejsciu/
// wyjsciu z pozycji (przeciecia linii MACD/sygnalu, przeciecia histogramu
// przez zero). Ta sama zasada dopelnienia do pelnej tablicy dat co
// alignMansfieldToDates/alignSqueezeToDates powyzej.
function alignMacdToDates(macdData, fullDates) {
    const idxByDate = new Map(macdData.dates.map((d, i) => [d, i]));
    const pick = (series) => fullDates.map(d => (idxByDate.has(d) ? series[idxByDate.get(d)] : null));
    return {
        macd: pick(macdData.macd || []),
        signal: pick(macdData.signal || []),
        histogram: pick(macdData.histogram || []),
    };
}

function fmtPlDate(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
}

// Panel Mansfield RS jest teraz opcjonalny (patrz mansfieldPanelVisible
// powyżej) — ta funkcja jest JEDYNYM miejscem, które ustawia jego widoczność
// (`#rsMansfieldPanel[hidden]`) i etykietę przycisku, wołana zarówno po każdym
// (re)renderze wykresu, jak i z samego przycisku — dzięki temu app.js/chart.js
// nie muszą już same o tym pamiętać (wcześniej robiły to osobno w
// updateChartArea/renderChartPanel, plus osobna, DRUGA wersja tego przełącznika
// żyła tylko w trybie pełnoekranowym — patrz initChartFullscreen w app.js;
// teraz jest już tylko JEDEN wspólny przełącznik, działający tak samo w obu
// trybach, bo #rs_chart wraz z całą zawartością i tak jest fizycznie
// przenoszony do document.body na czas pełnego ekranu). "Czy w ogóle jest
// wykres" ustalamy z samego rsMansfieldChartInstance (null, gdy wybrana spółka
// nie ma własnego wykresu, patrz destroyChartInstances) — nie trzeba tego
// przekazywać osobnym parametrem.
function applyMansfieldPanelVisibility() {
    const panel = document.getElementById("rsMansfieldPanel");
    const btn = document.getElementById("rsMansfieldToggleBtn");
    const hasChart = !!rsMansfieldChartInstance;
    if (panel) panel.hidden = !hasChart || !mansfieldPanelVisible;
    if (btn) {
        btn.disabled = !hasChart;
        btn.classList.toggle("active", mansfieldPanelVisible);
        btn.textContent = mansfieldPanelVisible ? "📉 Ukryj RSM ▲" : "📉 Pokaż RSM ▼";
    }
}

// Podpina przycisk #rsMansfieldToggleBtn — wołane RAZ przez obie strony
// (initChartFullscreen-owe app.js::init() i chart.js::init()) podczas
// inicjalizacji, analogicznie do initResetZoomButton/initOpenTvButton.
function initMansfieldControls() {
    const btn = document.getElementById("rsMansfieldToggleBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
        mansfieldPanelVisible = !mansfieldPanelVisible;
        applyMansfieldPanelVisibility();
    });
    applyMansfieldPanelVisibility();
}

// Współdzielony "crosshair" między wszystkimi panelami wykresu (10:30,
// wolumen, MACD, TTM Squeeze, Mansfield RS) — najechanie na dowolny z nich
// podświetla ten sam tydzień na pozostałych. Działa jako zwykłe dopasowanie po
// indeksie (nie po dacie), bo wszystkie panele dzielą teraz dokładnie tę samą
// tablicę etykiet (chartData.dates — patrz alignMansfieldToDates/
// alignSqueezeToDates/alignMacdToDates powyżej). Datasety oznaczone
// `_syncExempt` (linia zera Mansfielda — czysto wizualna, nie ma sensu jej
// podświetlać) są pomijane; jeśli po odfiltrowaniu nic nie zostanie (np.
// najechanie na tydzień sprzed startu okna Mansfielda, same `null`), wykres
// po prostu nie pokazuje własnego tooltipa — to uczciwie sygnalizuje "tu nie
// ma jeszcze danych", zamiast pokazywać pusty dymek.
function syncChartsCrosshair(charts) {
    const applyToOthers = (sourceChart, dataIndex) => {
        charts.forEach(chart => {
            if (chart === sourceChart) return;
            let elements = [];
            if (dataIndex !== null) {
                elements = chart.data.datasets
                    .map((ds, datasetIndex) => ({ ds, datasetIndex }))
                    .filter(({ ds }) => !ds._syncExempt && ds.data[dataIndex] != null)
                    .map(({ datasetIndex }) => ({ datasetIndex, index: dataIndex }));
            }
            chart.setActiveElements(elements);
            chart.tooltip.setActiveElements(elements, { x: 0, y: 0 });
            chart.update("none");
        });
    };
    charts.forEach(chart => {
        chart.canvas.addEventListener("mousemove", (evt) => {
            const points = chart.getElementsAtEventForMode(evt, "index", { intersect: false }, true);
            applyToOthers(chart, points.length ? points[0].index : null);
        });
        chart.canvas.addEventListener("mouseleave", () => applyToOthers(chart, null));
    });
}

// Pięć wykresów jeden pod drugim (patrz .rs-chart-container w style.css), w stylu
// stage analysis (Stan Weinstein / Dr Eric Wish):
// 1. "Wykres 10:30" — cena tygodniowa spółki + SMA 10-tyg./30-tyg. + VWAP
//    zakotwiczony na początku okna (fioletowa przerywana linia, patrz
//    "vwap_pct" w compute_relative_strength_chart), wszystko przeliczone na %
//    zmiany względem pierwszego wyświetlanego tygodnia OKNA MOMENTUM (patrz
//    compute_relative_strength_chart). Poziom własnego indeksu NIE jest już
//    tu rysowany (usunięty na wyraźną prośbę użytkownika — zamiast dwóch
//    nakładających się linii ceny na jednej skali, porównanie spółki z
//    benchmarkiem przeniosło się w całości do panelu 5 (Mansfield RS)
//    poniżej, patrz tamten opis; backend nadal eksportuje `index_pct` w
//    `weekly_chart` — po prostu nic w tym pliku już go nie rysuje). NIE ma tu
//    też znaczników wejścia/wyjścia ani linii trailing stop-loss (usunięte —
//    zbyt duzo nakładających się elementów na jednym wykresie) — zamiast tego
//    same BAZY (patrz "bases" w weekly_chart, _compute_weinstein_stage_series)
//    są rysowane jako prostokąty (chartjs-plugin-annotation): fioletowy = baza
//    Etapu 1 (prawdziwe dno po Etapie 4), szary = baza kontynuacji Etapu 2 —
//    patrz BASE_BOX_COLORS. Wykres jest interaktywny (chartjs-plugin-zoom):
//    kółko myszy/uszczypnięcie = zoom, przeciąganie = przesuwanie w poziomie,
//    #resetZoomBtn cofa (patrz initResetZoomButton). Siła relatywna względem
//    indeksu NIE wchodzi w klasyfikację etapów (pomysł odrzucony wcześniej ze
//    względu na trudność implementacji).
// 2. Wolumen tygodniowy — osobny, mniejszy panel pod wykresem 10:30 (wcześniej
//    ukryte słupki na dolnej krawędzi tego samego wykresu), z osią X przesuwaną/
//    powiększaną razem z wykresem 10:30 (patrz syncVolumeXRange) — dwa segmenty
//    (stack: "volume") pokazują PROPORCJE kupujący/sprzedający, nie tylko
//    wysokość słupka, patrz komentarz przy buyingColors niżej.
// 3. MACD (macd_chart, patrz compute_macd_chart) — DODANY pod wolumenem na
//    wyraźne życzenie użytkownika jako pomoc przy wejściu/wyjściu z pozycji:
//    linia MACD (szybka EMA 12 tyg. minus wolna EMA 26 tyg.), linia sygnału
//    (EMA 9 tyg. linii MACD) i histogram ich różnicy, kolorowany tak samo jak
//    histogram TTM Squeeze (jaśniejszy/ciemniejszy zielony/czerwony wg znaku i
//    kierunku względem poprzedniego słupka) — przecięcia linii MACD/sygnału i
//    przejścia histogramu przez zero to klasyczne sygnały wejścia/wyjścia.
//    Nieinteraktywny, tak jak panele Squeeze/Mansfield niżej.
// 4. Wskaznik TTM Squeeze (ttm_squeeze_chart, patrz compute_ttm_squeeze_chart)
//    obok MACD — ZASTEPUJE dawny wykres surowego wzrostu % 1/3/6 mies.
//    na zyczenie uzytkownika: zamiast stopy zwrotu pokazuje FAZY KONSOLIDACJI
//    (Bollinger Bands wewnatrz kanalu Kellera) i moment wybicia z nich. Slupki
//    histogramu (momentum-oscylator, kolor wg znaku/kierunku) plus rzad
//    kropek na poziomie zera pod nimi: czerwona = squeeze wlaczony (trwajaca
//    konsolidacja), zlota = tydzien wybicia, szara = squeeze wylaczony (poza
//    tygodniem wybicia). **DODATKOWO niesie linię "RS 52 tyg." (rsm_long,
//    Mansfield RS długoterminowy)** — na wyraźne życzenie użytkownika
//    PRZENIESIONA tutaj z panelu Mansfielda (5, poniżej): oba wskaźniki
//    "oscylują wokół zera", więc jeden wspólny rzut oka na histogram TTM
//    Squeeze (KIEDY momentum przyspiesza/hamuje) razem z tą linią (czy spółka
//    w tym samym oknie jest silniejsza/słabsza od własnego indeksu w długim
//    terminie) czytelniej pokazuje trend niż dwa osobne, w większości
//    schowane panele — patrz rsLongDataset w kodzie dla pełnego uzasadnienia
//    doboru koloru (jasny błękit, żeby nie kolidować z żadnym innym kolorem
//    już użytym w tym panelu ani w panelu 5). Ma własny wpis w legendzie
//    (jedyny dataset tego panelu, który ją dostaje) — histogram/kropki nadal
//    bez legendy, jak dotychczas. Nieinteraktywny.
// 5. Oscylator Mansfield RS w DWÓCH wygładzeniach — krótkoterminowym
//    (~3 mies.) i średnioterminowym (~6 mies.) — jedyne miejsce na tym
//    wykresie pokazujące siłę spółki względem jej własnego benchmarku
//    (indeksu `rsEntry.universe`, odkąd panel 1 przestał rysować jego
//    poziom, patrz wyżej): linia powyżej zera = spółka silniejsza od indeksu
//    w danym oknie, poniżej = słabsza. **Trzecia, długoterminowa linia
//    (~12 mies./52 tyg.) już tu NIE ŻYJE** — przeniesiona do panelu 4 (TTM
//    Squeeze) powyżej, patrz tamten opis. PRZENIESIONY na sam dół i
//    OPCJONALNY na wyraźne życzenie użytkownika: domyślnie schowany (patrz
//    mansfieldPanelVisible/applyMansfieldPanelVisibility/
//    initMansfieldControls powyżej), rozwijany przyciskiem
//    #rsMansfieldToggleBtn tuż nad panelem. Przy KAŻDYM (re)renderze domyślnie
//    widoczna jest TYLKO linia średnioterminowa (dawna rola "zawsze włączonej"
//    linii spadła na nią, skoro długoterminowa się wyprowadziła) — krótkoterminowa
//    startuje schowana (`hidden: true` w definicji datasetu) — pokazanie
//    poszczególnych linii to już wbudowane, domyślne zachowanie legendy
//    Chart.js: klik w pozycję legendy przełącza widoczność TEGO datasetu, więc
//    nie potrzeba tu osobnych przycisków na linię. Nieinteraktywny — własne
//    okno nie wymaga zoom/pan.
//
// `symbol`/`rsEntry` (musi zawierać `.universe`) są przekazywane WPROST przez
// wywołującego (app.js::updateChartArea / chart.js::renderChartPanel) —
// silnik wykresu nie czyta żadnego page-specific `state` sam z siebie. Wykres
// zawsze pokazuje CAŁY dostępny zakres (dawny, dodatkowy tryb "ostatnie 3
// miesiące" — sliceWeeklyChartToRange/#chartRange3mBtn — USUNIĘTY na wyraźne
// życzenie użytkownika: przy ~14-miesięcznym oknie 3 miesiące danych okazały
// się zbyt mało czytelne, nie warte utrzymywania drugiego trybu).
function renderRelativeStrengthChart(symbol, rsEntry) {
    const chartData = rsEntry.weekly_chart;
    const mansfieldData = rsEntry.mansfield_chart;
    const squeezeData = rsEntry.ttm_squeeze_chart;
    const macdData = rsEntry.macd_chart;
    const rsContainer = document.getElementById("rs_chart");
    const canvas = document.getElementById("rsChartCanvas");
    const volumeCanvas = document.getElementById("rsVolumeCanvas");
    const macdCanvas = document.getElementById("rsMacdCanvas");
    const squeezeCanvas = document.getElementById("rsSqueezeCanvas");
    const mansfieldCanvas = document.getElementById("rsMansfieldCanvas");
    if (!canvas || !chartData) return;

    if (typeof Chart === "undefined") {
        if (rsContainer) rsContainer.innerHTML = '<div class="empty-state">Nie udało się załadować biblioteki wykresu (sprawdź połączenie z internetem).</div>';
        return;
    }
    if (rsChartInstance) { rsChartInstance.destroy(); rsChartInstance = null; }
    if (rsVolumeChartInstance) { rsVolumeChartInstance.destroy(); rsVolumeChartInstance = null; }
    if (rsMacdChartInstance) { rsMacdChartInstance.destroy(); rsMacdChartInstance = null; }
    if (rsSqueezeChartInstance) { rsSqueezeChartInstance.destroy(); rsSqueezeChartInstance = null; }
    if (rsMansfieldChartInstance) { rsMansfieldChartInstance.destroy(); rsMansfieldChartInstance = null; }

    renderStageBadge(chartData.current_stage);

    const pctFmt = (v) => (v == null ? "—" : `${v.toFixed(2)}%`);
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

    // Prostokaty baz (patrz "bases" w compute_relative_strength_chart) — kluczowane
    // po indeksie, bo chartjs-plugin-annotation wymaga unikalnych kluczy w obiekcie
    // "annotations". xMin/xMax to daty z tej samej tablicy co etykiety osi X
    // (chartData.dates), wiec pozycjonuja sie dokladnie na tych samych tygodniach
    // co linia ceny.
    const baseAnnotations = {};
    (chartData.bases || []).forEach((base, idx) => {
        const color = BASE_BOX_COLORS[base.kind] || BASE_BOX_COLORS.stage2;
        baseAnnotations[`base${idx}`] = {
            type: "box",
            xMin: base.start_date, xMax: base.end_date,
            yMin: base.support_pct, yMax: base.resistance_pct,
            backgroundColor: `${color}26`, borderColor: color, borderWidth: 1.5, borderDash: [4, 2],
            label: {
                display: true, content: base.kind === "stage1" ? "Etap 1 (dno)" : `Baza ${base.base_count}`,
                position: "start", color, font: { size: 9, weight: "normal" }, backgroundColor: "transparent",
            },
        };
    });

    rsChartInstance = new Chart(canvas, {
        type: "line",
        data: {
            labels: chartData.dates,
            datasets: [
                {
                    label: `${symbol} (zmiana %)`, data: chartData.close_pct, borderColor: "#2ecc71",
                    backgroundColor: "transparent", pointRadius: 0, borderWidth: 2, order: 1,
                },
                { label: "SMA 10-tyg.", data: chartData.sma10_pct, borderColor: "#e0a72e", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5, borderDash: [2, 2], order: 1 },
                { label: "SMA 30-tyg.", data: chartData.sma30_pct, borderColor: "#8a8f9c", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3], order: 1 },
                { label: "VWAP (od początku okna)", data: chartData.vwap_pct, borderColor: "#c084fc", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5, borderDash: [6, 2], order: 1 },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { position: "bottom", labels: { color: "#8a8f9c", boxWidth: 12, font: { size: 10 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${pctFmt(ctx.parsed.y)}` } },
                annotation: { annotations: baseAnnotations },
                // Interaktywny zoom/pan (chartjs-plugin-zoom) — tylko oś X, zeby nie
                // wypaczac skali % na osi Y. onZoomComplete/onPanComplete przesuwaja
                // zakres wolumenu razem z cena (patrz syncVolumeXRange), zeby oba
                // panele zawsze pokazywaly te same tygodnie.
                zoom: {
                    limits: { x: { min: "original", max: "original" } },
                    pan: { enabled: true, mode: "x", onPanComplete: ({ chart }) => syncVolumeXRange(chart) },
                    zoom: {
                        wheel: { enabled: true }, pinch: { enabled: true }, mode: "x",
                        onZoomComplete: ({ chart }) => syncVolumeXRange(chart),
                    },
                },
            },
            scales: {
                x: { ticks: { color: "#8a8f9c", maxTicksLimit: 10 }, grid: { color: "#262a35" } },
                y: { ticks: { color: "#8a8f9c", callback: pctFmt }, grid: { color: "#262a35" } },
            },
        },
    });

    // Slupki tygodniowego wolumenu, skladane z dwoch segmentow (stack: "volume")
    // — dol = wolumen kupujacych, gora = sprzedajacych, zeby od razu bylo widac
    // PROPORCJE, nie tylko wysokosc calego slupka. Segment kupujacych jest
    // jasniejszy, gdy buying_volume_ratio >= STAGE_BREAKOUT_VOLUME_RATIO
    // (potwierdzone wybicie wolumenem KUPUJACYCH — patrz run_query.py). Wlasna,
    // W PELNI WIDOCZNA os (wczesniej ukryta na dolnym pasku wykresu 10:30).
    if (volumeCanvas) {
        const buyingColors = buyingVolumes.map((v, i) => {
            const ratio = buyingVolumeRatios[i];
            return (ratio != null && ratio >= STAGE_BREAKOUT_VOLUME_RATIO) ? "rgba(46, 204, 113, 0.85)" : "rgba(46, 204, 113, 0.35)";
        });
        const sellingColor = "rgba(224, 69, 90, 0.55)";
        const volumeSma = rollingMean(volumes, VOLUME_SMA_WEEKS);
        rsVolumeChartInstance = new Chart(volumeCanvas, {
            type: "bar",
            data: {
                labels: chartData.dates,
                datasets: [
                    { label: "Wolumen kupujących (tyg.)", data: buyingVolumes, backgroundColor: buyingColors, stack: "volume", barPercentage: 0.8, categoryPercentage: 0.9, order: 1 },
                    { label: "Wolumen sprzedających (tyg.)", data: sellingVolumes, backgroundColor: sellingColor, stack: "volume", barPercentage: 0.8, categoryPercentage: 0.9, order: 1 },
                    {
                        type: "line", label: `Śr. wolumenu (${VOLUME_SMA_WEEKS} tyg. ≈ 50 dni)`, data: volumeSma,
                        borderColor: "#e0a72e", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5,
                        borderDash: [3, 2], order: 0,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { position: "bottom", labels: { color: "#8a8f9c", boxWidth: 12, font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.datasetIndex === 0) {
                                    const ratio = buyingVolumeRatios[ctx.dataIndex];
                                    const ratioTxt = ratio != null ? ` (${ratio.toFixed(2)}x śr.)` : "";
                                    return `Kupujący: ${ctx.parsed.y.toLocaleString("pl-PL")}${ratioTxt}`;
                                }
                                if (ctx.datasetIndex === 1) return `Sprzedający: ${ctx.parsed.y.toLocaleString("pl-PL")}`;
                                return `${ctx.dataset.label}: ${ctx.parsed.y == null ? "—" : ctx.parsed.y.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}`;
                            },
                        },
                    },
                },
                scales: {
                    // maxTicksLimit taki sam jak wykres 10:30 — z tymi samymi datami na
                    // osi X (patrz alignMacdToDates/alignSqueezeToDates/alignMansfieldToDates
                    // dla pozostałych paneli) daje to wizualnie spójne, dopasowane
                    // skalowanie między panelami.
                    x: { ticks: { color: "#8a8f9c", maxTicksLimit: 10 }, grid: { color: "#262a35" } },
                    // Same wartości osi Y (miliony akcji) niosą mało informacji i zabierają
                    // sporo poziomego miejsca na wąskich panelach (np. telefon) — słupki i
                    // tak czytelne są proporcjonalnie (patrz tooltip dla dokładnych liczb).
                    y: { stacked: true, ticks: { display: false }, grid: { color: "#262a35" } },
                },
            },
        });
    }

    const macdCaption = document.getElementById("rsMacdCaption");
    if (macdCanvas && macdData) {
        // Ta sama logika dopasowania co panele Squeeze/Mansfield niżej (patrz
        // alignMacdToDates) — wspólna, pełna tablica dat daje spójną skalę X
        // między wszystkimi panelami.
        const aligned = alignMacdToDates(macdData, chartData.dates);
        const zeroLineMacd = chartData.dates.map(() => 0);
        if (macdCaption) {
            macdCaption.textContent = `MACD (12/26/9 tyg.) · ${fmtPlDate(chartData.dates[0])} – ${fmtPlDate(chartData.dates[chartData.dates.length - 1])}`;
        }
        // Ten sam schemat 4 kolorów co histogram TTM Squeeze (patrz histColors
        // niżej) — spójny język wizualny "histogram = momentum-oscylator" na obu
        // panelach.
        const macdHistColors = aligned.histogram.map((v, i) => {
            if (v == null) return "transparent";
            const prev = i > 0 ? aligned.histogram[i - 1] : null;
            const rising = prev == null || v >= prev;
            if (v >= 0) return rising ? "#2ecc71" : "#1f7a4d";
            return rising ? "#7a2020" : "#ff4d4f";
        });
        rsMacdChartInstance = new Chart(macdCanvas, {
            data: {
                labels: chartData.dates,
                datasets: [
                    {
                        type: "bar", label: "Histogram (MACD − sygnał)", data: aligned.histogram,
                        backgroundColor: macdHistColors, borderWidth: 0, order: 3,
                    },
                    { type: "line", label: "MACD (12/26 tyg.)", data: aligned.macd, borderColor: "#4fa6e0", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5, order: 1 },
                    { type: "line", label: "Sygnał (9 tyg.)", data: aligned.signal, borderColor: "#e0a72e", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5, order: 2 },
                    { type: "line", label: "0", data: zeroLineMacd, borderColor: "#565c6b", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1, borderDash: [3, 3], order: 4, _syncExempt: true },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { position: "bottom", labels: { color: "#8a8f9c", boxWidth: 12, font: { size: 10 } } },
                    tooltip: {
                        filter: (ctx) => ctx.datasetIndex !== 3,
                        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y == null ? "—" : ctx.parsed.y.toFixed(3)}` },
                    },
                },
                scales: {
                    // Ta sama liczba etykiet/skala X co pozostałe panele.
                    x: { ticks: { color: "#8a8f9c", maxTicksLimit: 10 }, grid: { color: "#262a35" } },
                    y: { ticks: { color: "#8a8f9c" }, grid: { color: "#262a35" } },
                },
            },
        });
    } else if (macdCanvas) {
        const ctx = macdCanvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, macdCanvas.width, macdCanvas.height);
        if (macdCaption) macdCaption.textContent = "";
    }

    // Dopasowanie Mansfielda do pełnej tablicy dat — liczone RAZ, TUTAJ (przed
    // panelem Squeeze), bo teraz mają go używać DWA panele: Squeeze poniżej
    // czyta tylko `.long` (patrz komentarz przy rsLongDataset), a panel
    // Mansfielda dalej w dół używa `.short`/`.medium` z tego samego obiektu —
    // stąd zmienna musi żyć na poziomie całej funkcji, nie wewnątrz jednego
    // bloku `if`.
    const alignedMansfield = mansfieldData ? alignMansfieldToDates(mansfieldData, chartData.dates) : null;

    const squeezeCaption = document.getElementById("rsSqueezeCaption");
    if (squeezeCanvas && squeezeData) {
        // Ta sama logika dopasowania co panel MACD powyżej (patrz
        // alignSqueezeToDates) — wspólna, pełna tablica dat daje spójną skalę X
        // między wszystkimi panelami.
        const aligned = alignSqueezeToDates(squeezeData, chartData.dates);
        const zeroLineSqueeze = chartData.dates.map(() => 0);
        if (squeezeCaption) {
            // Prefiks "TTM Squeeze" (+ "RS 52 tyg." gdy dostepne) na tej samej
            // zasadzie co "MACD" w panelu powyżej — ten panel od TTM Squeeze
            // samego w sobie nie ma WŁASNEJ legendy Chart.js (histogram/kropki
            // sie nie tlumacza same), ale linia RS juz ma wlasny wpis w legendzie
            // (patrz plugins.legend nizej) — podpis tu tylko potwierdza zakres dat.
            const suffix = alignedMansfield ? ` + RS 52 tyg. vs ${rsEntry.universe}` : "";
            squeezeCaption.textContent = `TTM Squeeze${suffix} · ${fmtPlDate(chartData.dates[0])} – ${fmtPlDate(chartData.dates[chartData.dates.length - 1])}`;
        }
        // Klasyczne 4 kolory histogramu TTM Squeeze: dodatni/rosnący (jaśniejszy
        // zielony) vs dodatni/malejący (ciemniejszy zielony), ujemny/malejący
        // (jaśniejszy czerwony) vs ujemny/rosnący (ciemniejszy czerwony) —
        // kierunek liczony względem poprzedniego SŁUPKA (nie tygodnia
        // kalendarzowego — przy null-ach w rozgrzewce po prostu brak koloru).
        const histColors = aligned.histogram.map((v, i) => {
            if (v == null) return "transparent";
            const prev = i > 0 ? aligned.histogram[i - 1] : null;
            const rising = prev == null || v >= prev;
            if (v >= 0) return rising ? "#2ecc71" : "#1f7a4d";
            return rising ? "#7a2020" : "#ff4d4f";
        });
        // Kropki squeeze na poziomie zera: czerwona = squeeze wlaczony (trwajaca
        // konsolidacja), zlota = tydzien wybicia (fired), szara = squeeze
        // wylaczony poza tygodniem wybicia (ruch juz trwa), przezroczysta = brak
        // danych (rozgrzewka BB/KC).
        const dotColors = aligned.squeezeOn.map((on, i) => {
            if (aligned.fired[i]) return "#ffd23f";
            if (on === true) return "#e74c3c";
            if (on === false) return "#565c6b";
            return "transparent";
        });
        // RS 52 tyg. (Mansfield dlugoterminowy) NA WYRAZNE ZYCZENIE UZYTKOWNIKA
        // przeniesiony tutaj z panelu Mansfielda (ponizej) — wg uzytkownika oba
        // wskazniki "oscyluja wokol zera" i razem pokazuja trend czytelniej niz
        // osobno: histogram TTM Squeeze mowi, KIEDY momentum przyspiesza/hamuje
        // (konsolidacja/wybicie), a ta linia mowi, czy spolka W TYM SAMYM OKNIE
        // jest silniejsza/slabsza od wlasnego indeksu w DLUGIM terminie — jeden
        // wspolny rzut oka zamiast przelaczania miedzy dwoma osobnymi, w
        // wiekszosci schowanymi panelami. Jasny blekit (#38bdf8) celowo NIE
        // powtarza zadnego koloru juz uzywanego w tym panelu (zielen/czerwien
        // histogramu, zlota/czerwona/szara kropka squeeze) ani sasiedniego
        // panelu Mansfielda (niebieski/fioletowy dla short/medium) — ma
        // odrazu rzucac sie w oczy jako osobny, nadrzedny sygnal trendu na tle
        // slupkow. Ten sam wspolny obiekt osi X (chartData.dates) co reszta
        // paneli, wiec linia jest dokladnie wyrownana z histogramem pod nia.
        const rsLongDataset = alignedMansfield ? [{
            type: "line", label: `RS 52 tyg. vs ${rsEntry.universe} (długoterminowy)`, data: alignedMansfield.long,
            borderColor: "#38bdf8", backgroundColor: "transparent", pointRadius: 0, borderWidth: 2.5, order: 0,
        }] : [];
        rsSqueezeChartInstance = new Chart(squeezeCanvas, {
            type: "bar",
            data: {
                labels: chartData.dates,
                datasets: [
                    {
                        type: "bar", label: "Momentum (histogram)", data: aligned.histogram,
                        backgroundColor: histColors, borderWidth: 0, order: 2,
                    },
                    {
                        type: "line", label: "Squeeze", data: zeroLineSqueeze, showLine: false,
                        pointRadius: 4, pointHoverRadius: 5, pointBackgroundColor: dotColors,
                        pointBorderWidth: 0, order: 1,
                    },
                    ...rsLongDataset,
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    // Histogram/kropki nadal bez wlasnej legendy (patrz komentarz
                    // przy squeezeCaption powyzej) — ale linia RS 52 tyg. (jesli
                    // obecna, zawsze index 2 — ostatni w tablicy datasets powyzej)
                    // DOSTAJE wlasny wpis, zeby bylo jasne, czym jest ten nowy,
                    // jasnoniebieski sygnal na tle histogramu.
                    legend: {
                        display: !!alignedMansfield, position: "bottom",
                        labels: { color: "#8a8f9c", boxWidth: 12, font: { size: 10 }, filter: (item) => item.datasetIndex === 2 },
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.datasetIndex === 1) {
                                    if (aligned.fired[ctx.dataIndex]) return "Squeeze: wybicie z konsolidacji";
                                    if (aligned.squeezeOn[ctx.dataIndex] === true) return "Squeeze: włączony (konsolidacja)";
                                    if (aligned.squeezeOn[ctx.dataIndex] === false) return "Squeeze: wyłączony";
                                    return "Squeeze: brak danych";
                                }
                                return `${ctx.dataset.label}: ${ctx.parsed.y == null ? "—" : ctx.parsed.y.toFixed(3)}`;
                            },
                        },
                    },
                },
                scales: {
                    // Ta sama liczba etykiet/skala X co pozostałe panele — patrz
                    // komentarz przy panelu MACD powyżej.
                    x: { ticks: { color: "#8a8f9c", maxTicksLimit: 10 }, grid: { color: "#262a35" } },
                    // JEDNA wspolna os Y dla histogramu i linii RS — obie serie sa
                    // juz z definicji oscylatorami wokol zera (patrz komentarz przy
                    // rsLongDataset powyzej), wiec nie ma potrzeby osobnej,
                    // drugiej osi po prawej stronie tylko dla tej jednej linii.
                    y: { ticks: { color: "#8a8f9c" }, grid: { color: "#262a35" } },
                },
            },
        });
    } else if (squeezeCanvas) {
        const ctx = squeezeCanvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, squeezeCanvas.width, squeezeCanvas.height);
        if (squeezeCaption) squeezeCaption.textContent = "";
    }

    // Mansfield RS — PRZENIESIONY na sam dół (patrz numerowany opis paneli
    // powyżej funkcji) i teraz OPCJONALNY: panel sam w sobie jest budowany
    // niezależnie od tego, czy jest akurat widoczny (spójnie z tym, jak Volume/
    // Squeeze/MACD są budowane niezależnie od trybu pełnoekranowego) —
    // applyMansfieldPanelVisibility() na końcu tej funkcji decyduje o samej
    // widoczności `#rsMansfieldPanel`. **Linia długoterminowa (rsm_long, ~12M/
    // 52-tyg.) już tu NIE ŻYJE** — na wyraźne życzenie użytkownika PRZENIESIONA
    // do panelu TTM Squeeze powyżej (patrz rsLongDataset tam: oba wskaźniki
    // "oscylują wokół zera" i razem czytelniej pokazują trend niż osobno).
    // Zostały więc tylko krótko-/średnioterminowa; skoro nic już nie jest tu
    // "zawsze włączone" z automatu (dawna rola 52-tygodniowej), domyślnie
    // widoczna jest teraz linia ŚREDNIOterminowa (`hidden: false`) — najbliższy
    // odpowiednik "solidnego, mniej szumiącego trendu" spośród tego, co zostało
    // — krótkoterminowa startuje jako `hidden: true`; klik w pozycję legendy
    // Chart.js pokazuje/chowa dowolną z nich.
    const mansfieldCaption = document.getElementById("rsMansfieldCaption");
    if (mansfieldCanvas && mansfieldData) {
        // alignedMansfield policzone RAZ, wyzej w tej funkcji (patrz komentarz
        // tam) — wspolne dla tego panelu i panelu TTM Squeeze powyzej, zeby nie
        // dopasowywac tych samych serii do fullDates dwa razy.
        const aligned = alignedMansfield;
        const zeroLine = chartData.dates.map(() => 0);
        if (mansfieldCaption) {
            // Prefiks "Mansfield RS vs {universe}" dodany na wyraźną prośbę
            // użytkownika: odkąd panel 1 przestał rysować poziom indeksu (patrz
            // wyżej), sam podpis daty pod tym panelem nie mówił jasno, ŻE to jest
            // wykres siły względem benchmarku, ani WZGLĘDEM KTÓREGO indeksu.
            mansfieldCaption.textContent = `Mansfield RS vs ${rsEntry.universe} (indeks) · ${fmtPlDate(chartData.dates[0])} – ${fmtPlDate(chartData.dates[chartData.dates.length - 1])}`;
        }
        rsMansfieldChartInstance = new Chart(mansfieldCanvas, {
            type: "line",
            data: {
                labels: chartData.dates,
                datasets: [
                    { label: `RSM krótkoterminowy vs ${rsEntry.universe} (~3M)`, data: aligned.short, borderColor: "#4fa6e0", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5, hidden: true },
                    { label: `RSM średnioterminowy vs ${rsEntry.universe} (~6M)`, data: aligned.medium, borderColor: "#c77dff", backgroundColor: "transparent", pointRadius: 0, borderWidth: 2, hidden: false },
                    { label: "0", data: zeroLine, borderColor: "#565c6b", backgroundColor: "transparent", pointRadius: 0, borderWidth: 1, borderDash: [3, 3], _syncExempt: true },
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
                    // Ta sama liczba etykiet co pozostałe panele — wspólna tablica dat +
                    // ten sam maxTicksLimit dają spójne, wyrównane skale między panelami.
                    x: { ticks: { color: "#8a8f9c", maxTicksLimit: 10 }, grid: { color: "#262a35" } },
                    y: { ticks: { color: "#8a8f9c" }, grid: { color: "#262a35" } },
                },
            },
        });
    } else if (mansfieldCanvas) {
        const ctx = mansfieldCanvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, mansfieldCanvas.width, mansfieldCanvas.height);
        if (mansfieldCaption) mansfieldCaption.textContent = "";
    }
    applyMansfieldPanelVisibility();

    // Wspólny crosshair (patrz syncChartsCrosshair) — tylko między wykresami,
    // które faktycznie istnieją (MACD/Mansfield/Squeeze mogą być null przy
    // braku danych) — obejmuje też panele schowane w danym momencie
    // (Mansfield domyślnie, patrz applyMansfieldPanelVisibility powyżej):
    // nieszkodliwe, bo taki panel po prostu nie odbiera zdarzeń myszy, dopóki
    // jest `hidden`.
    syncChartsCrosshair([
        rsChartInstance, rsVolumeChartInstance, rsMacdChartInstance, rsSqueezeChartInstance, rsMansfieldChartInstance,
    ].filter(Boolean));
}

// Eksport wyłącznie dla test runnera Node (tests/js/chart-render.test.js) —
// nie ładowany i bez efektu w przeglądarce (module tam nie istnieje). Tylko
// czyste funkcje bez DOM/Chart.js — renderRelativeStrengthChart i wszystko,
// co rysuje na canvasie, nie jest tu testowalne bez pełnego DOM-a.
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        rollingMean, alignMansfieldToDates, alignSqueezeToDates, alignMacdToDates, fmtPlDate,
    };
}
