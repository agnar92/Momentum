// Współdzielone mini-wizualizacje tabel (inline SVG, bez Chart.js — dziesiątki
// na raz): mini-wykresy ceny, słupki RS wokół zera, mini-wskaźnik TTM Squeeze.
// Zwykły <script> ładowany po js/shared.js na index.html, rebalance.html,
// rebalance_pl.html i strategy.html — ten sam wzorzec globalnych funkcji co
// shared.js/table-render.js (bez modułów/bundlera). Klasy CSS (.spark, .rs-bar,
// .ttm-*) żyją w css/style.css.

// Indeks ostatniej nie-null wartości w serii (-1, gdy brak).
function latestNonNullIdx(arr) {
    if (!arr) return -1;
    let i = arr.length - 1;
    while (i >= 0 && arr[i] == null) i--;
    return i;
}

// Punkty [x, y] dla serii (null = przerwa), skalowane do w×h z marginesem pad.
function sparkPoints(values, w, h, pad = 2, range = null) {
    const nums = (values || []).filter(v => v != null && Number.isFinite(v));
    if (nums.length < 2) return [];
    const lo = range ? range[0] : Math.min(...nums);
    const hi = range ? range[1] : Math.max(...nums);
    const span = hi - lo || 1;
    const n = values.length;
    return values.map((v, i) => (v == null || !Number.isFinite(v)) ? null : [
        +(pad + (i * (w - 2 * pad)) / (n - 1)).toFixed(1),
        +(h - pad - ((v - lo) / span) * (h - 2 * pad)).toFixed(1),
    ]);
}

function sparkPath(points) {
    let d = "";
    let pen = false;
    points.forEach(p => {
        if (!p) { pen = false; return; }
        d += `${pen ? "L" : "M"}${p[0]},${p[1]}`;
        pen = true;
    });
    return d;
}

function seriesRange(...series) {
    const nums = series.flat().filter(v => v != null && Number.isFinite(v));
    return nums.length ? [Math.min(...nums), Math.max(...nums)] : null;
}

// Kreski u dołu mini-wykresu w okresach squeeze'a (1 = squeeze), wyrównane do
// tej samej osi X co n punktów ceny.
function sparkSqueezeBars(squeeze, n, w, h, barH) {
    const step = (w - 4) / Math.max(n - 1, 1);
    return (squeeze || []).map((v, i) => v === 1
        ? `<rect x="${(2 + i * step - step / 2).toFixed(1)}" y="${h - barH}" width="${Math.max(step, 1).toFixed(1)}" height="${barH}" class="spark-sq"/>`
        : "").join("");
}

// Tydzień: cena (% od startu okna) + EMA20 przerywaną linią; opcjonalnie
// czerwone kreski u dołu w tygodniach squeeze'a (zakładka TTM Squeeze).
function weeklySparkSvg(closes, ema, squeeze = []) {
    const w = 110, h = 30, barH = squeeze.length ? 3 : 0;
    const range = seriesRange(closes, ema);
    if (!range) return '<span class="spark-empty">—</span>';
    const plotH = barH ? h - barH - 1 : h;
    const pts = sparkPoints(closes, w, plotH, 2, range);
    const up = closes.length && closes[closes.length - 1] >= closes[0];
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`
        + (barH ? sparkSqueezeBars(squeeze, closes.length, w, h, barH) : "")
        + `<path d="${sparkPath(sparkPoints(ema, w, plotH, 2, range))}" class="spark-ema"/>`
        + `<path d="${sparkPath(pts)}" class="${up ? "spark-up" : "spark-down"}"/></svg>`;
}

// Dzień: cena z 60 sesji + EMA20 (przerywana) + czerwone kreski u dołu w dni
// squeeze'a (jak kropki TV). Cena i EMA na wspólnej skali, żeby było widać pullback.
function dailySparkSvg(closes, squeeze, ema = []) {
    const w = 130, h = 30, barH = 3;
    const range = seriesRange(closes, ema);
    const pts = range ? sparkPoints(closes, w, h - barH - 1, 2, range) : [];
    if (!pts.length) return '<span class="spark-empty">—</span>';
    const n = closes.length;
    const step = (w - 4) / Math.max(n - 1, 1);
    const bars = (squeeze || []).map((v, i) => v === 1
        ? `<rect x="${(2 + i * step - step / 2).toFixed(1)}" y="${h - barH}" width="${Math.max(step, 1).toFixed(1)}" height="${barH}" class="spark-sq"/>`
        : "").join("");
    const up = closes[n - 1] >= closes[0];
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`
        + bars
        + (ema.length ? `<path d="${sparkPath(sparkPoints(ema, w, h - barH - 1, 2, range))}" class="spark-ema"/>` : "")
        + `<path d="${sparkPath(pts)}" class="${up ? "spark-up" : "spark-down"}"/></svg>`;
}

// Słupek RS wokół zera (Mansfield RS 52 tyg.): zielony w prawo = mocniejsza od
// swojego indeksu, czerwony w lewo = słabsza. Skala ucięta na ±RS_BAR_CAP, żeby
// kilka skrajnych wartości (>100) nie spłaszczało reszty.
const RS_BAR_CAP = 50;

function rsBarHtml(v) {
    if (v == null || !Number.isFinite(v)) return '<span class="spark-empty">—</span>';
    const w = 64, h = 12, half = w / 2;
    const len = (Math.min(Math.abs(v), RS_BAR_CAP) / RS_BAR_CAP) * half;
    const x = v >= 0 ? half : half - len;
    return `<span class="rs-bar" title="Mansfield RS 52 tyg.: ${v.toFixed(1)}">`
        + `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`
        + `<rect x="0" y="${h / 2 - 1}" width="${w}" height="2" class="rs-bar-track"/>`
        + `<rect x="${x.toFixed(1)}" y="1" width="${Math.max(len, 1).toFixed(1)}" height="${h - 2}" rx="2" class="${v >= 0 ? "rs-bar-pos" : "rs-bar-neg"}"/>`
        + `<rect x="${half - 0.5}" y="0" width="1" height="${h}" class="rs-bar-zero"/></svg>`
        + `<span class="${v >= 0 ? "positive" : "negative"}">${v >= 0 ? "+" : ""}${v.toFixed(1)}</span></span>`;
}

// Mini-wskaźnik TTM Squeeze jak na TradingView: słupki histogramu wokół zera
// (4 kolory: jasna/ciemna zieleń nad zerem, jasna/ciemna czerwień pod — ten sam
// schemat co histColors w chart-render.js) + kropki na linii zera (czerwona =
// squeeze, złota = wybicie, szara = brak squeeze'a).
function ttmMiniSvg(hist, squeezeOn, fired = []) {
    const n = (hist || []).length;
    const vals = (hist || []).filter(v => v != null && Number.isFinite(v));
    if (!vals.length) return '<span class="spark-empty">—</span>';
    const w = 130, h = 30, mid = h / 2, maxAbs = Math.max(...vals.map(Math.abs)) || 1;
    const step = (w - 4) / n, barW = Math.max(step - 1, 1);
    let out = "";
    hist.forEach((v, i) => {
        if (v == null) return;
        const prev = i > 0 ? hist[i - 1] : null;
        const rising = prev == null || v >= prev;
        const cls = v >= 0 ? (rising ? "ttm-up" : "ttm-up-fade") : (rising ? "ttm-dn-fade" : "ttm-dn");
        const len = (Math.abs(v) / maxAbs) * (mid - 3);
        out += `<rect x="${(2 + i * step).toFixed(1)}" y="${(v >= 0 ? mid - len : mid).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(len, 0.5).toFixed(1)}" class="${cls}"/>`;
    });
    (squeezeOn || []).forEach((on, i) => {
        if (on == null) return;
        const cls = fired[i] ? "ttm-dot-fired" : on ? "ttm-dot-on" : "ttm-dot-off";
        out += `<circle cx="${(2 + i * step + barW / 2).toFixed(1)}" cy="${mid}" r="1.6" class="${cls}"/>`;
    });
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${out}</svg>`;
}

// Oscylator wokół zera (MACD, RS 52 tyg.): linia + przerywana linia zera,
// zielona gdy ostatnia wartość > 0, czerwona gdy < 0; opcjonalna złota kropka
// w punkcie markIdx (np. tydzień przecięcia zera w górę).
function zeroLineSparkSvg(values, markIdx = null) {
    const w = 110, h = 30;
    const vals = (values || []).filter(v => v != null && Number.isFinite(v));
    if (vals.length < 2) return '<span class="spark-empty">—</span>';
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const pts = sparkPoints(values, w, h, 2, [lo, hi]);
    const zeroY = sparkPoints([lo, hi, 0], w, h, 2, [lo, hi])[2][1];
    const last = vals[vals.length - 1];
    const mark = markIdx != null && pts[markIdx]
        ? `<circle cx="${pts[markIdx][0]}" cy="${pts[markIdx][1]}" r="2.6" class="spark-mark"/>` : "";
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`
        + `<line x1="0" x2="${w}" y1="${zeroY}" y2="${zeroY}" class="spark-zero"/>`
        + `<path d="${sparkPath(pts)}" class="${last >= 0 ? "spark-up" : "spark-down"}"/>${mark}</svg>`;
}

// Indeks (w ostatnich n punktach serii) tygodnia, w którym seria przecięła zero
// w górę "weeks" tygodni temu (liczone od ostatniej nie-null wartości, jak
// weeksSinceZeroCrossUp w app.js) — do kropki na zeroLineSparkSvg; null, gdy
// przecięcie wypada przed oknem.
function crossIndexInTail(arr, weeks, n) {
    if (!arr || weeks == null) return null;
    const nowIdx = latestNonNullIdx(arr);
    const crossIdx = nowIdx - weeks + 1;
    const start = Math.max(arr.length - n, 0);
    return crossIdx >= start ? crossIdx - start : null;
}

// Wspólne pola "mini-wizualizacji" wyciągane z tygodniowych wykresów spółki
// (ostatnie MINI_WEEKS tygodni) — tabele uniwersów i zakładka TTM Squeeze.
const MINI_WEEKS = 26;

function miniVisualFields(c) {
    const wc = c.weekly_chart || {};
    const t = c.ttm_squeeze_chart || {};
    const rsLong = c.mansfield_chart && c.mansfield_chart.rsm_long;
    const rsIdx = latestNonNullIdx(rsLong);
    const sqOn = (t.squeeze_on || []).slice(-MINI_WEEKS);
    return {
        rs_long: rsIdx >= 0 ? rsLong[rsIdx] : null,
        mini_closes: (wc.close_pct || []).slice(-MINI_WEEKS),
        mini_ema: (wc.ema20_pct || []).slice(-MINI_WEEKS),
        mini_hist: (t.histogram || []).slice(-MINI_WEEKS),
        mini_sq_on: sqOn,
        mini_sq_flags: sqOn.map(v => v == null ? null : (v ? 1 : 0)),
        mini_fired: (t.fired || []).slice(-MINI_WEEKS),
    };
}

// Rozkład etapów Weinsteina w całym uniwersum (pasek nad tabelą):
// { "1": n, "2": n (2A+2B), "3": n, "4": n, none: n, total }.
function stageBreakdown(rows) {
    const out = { "1": 0, "2": 0, "3": 0, "4": 0, none: 0, total: 0 };
    (rows || []).forEach(c => {
        const st = c.weekly_chart && c.weekly_chart.current_stage;
        const key = st === "2A" || st === "2B" ? "2" : (st === "1" || st === "3" || st === "4") ? st : "none";
        out[key] += 1;
        out.total += 1;
    });
    return out;
}

// Pullback do EMA20 D1: cena 0..PULLBACK_BAND_PCT % nad średnią = klasyczne miejsce
// dołączenia do trendu; daleko nad nią = rozciągnięta, pod nią = trend słabnie.
const PULLBACK_BAND_PCT = 2;

function pullbackHtml(pct) {
    if (pct == null) return "—";
    const txt = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    if (pct >= 0 && pct <= PULLBACK_BAND_PCT) return `<span class="pullback-badge" title="Cena przy EMA20 D1 — pullback">🎯 ${txt}</span>`;
    return `<span class="${pct >= 0 ? "cross-age" : "negative"}">${txt}</span>`;
}

// Rekord spółki po tickerze w danych kilku uniwersów ({ UNIV: json, ... }) —
// all_constituents (całe uniwersum), a gdy go brak, constituents.
function findConstituent(dataByUniverse, ticker) {
    if (!ticker) return null;
    for (const d of Object.values(dataByUniverse || {})) {
        const list = (d && (d.all_constituents || d.constituents)) || [];
        const c = list.find(x => x.ticker === ticker);
        if (c) return c;
    }
    return null;
}

// Pudełko wyznaczone WPROST z okna, które TTM Squeeze (ttm_squeeze_chart, patrz
// compute_ttm_squeeze_chart w run_query.py) sam oznaczył jako konsolidację —
// na wyraźną korektę użytkownika ("wykrywamy squeeze więc czemu nie
// narysować boxa po X tygodniach konsolidacji ... to i tak poda top i
// bottom"): pierwsza wersja tego pomocnika czytała `weekly_chart.pending_base`
// (pudełko Darvasa z NIEZALEŻNEGO mechanizmu w `_compute_weinstein_stage_series`
// — własna definicja szczytu/dołka, 3 tyg. bez nowego rekordu), które mogło
// wskazywać zupełnie INNE tygodnie niż te, które TTM Squeeze akurat oznaczył
// jako konsolidację — więc pokazywany poziom często nie miał związku z tym, co
// użytkownik faktycznie widział jako "squeeze" na ekranie, i większość spółek
// wychodziła bez żadnego poziomu wcale. To poprawka: bierzemy TE SAME tygodnie
// co screener ("trwająca konsolidacja" = ostatnie `squeeze_count` tygodni z
// `squeeze_on`, "świeże wybicie" = `fire_consolidation_weeks` tygodni TUŻ
// PRZED tygodniem `fired`, patrz `since_fire`/`fire_consolidation` w
// `_ttm_squeeze_series`) i bierzemy najwyższe/najniższe TYGODNIOWE zamknięcie
// (`weekly_chart.close_pct`) w tym oknie — dokładnie "narysuj box po X
// tygodniach konsolidacji, top i bottom" z tamtej prośby. `ttm_squeeze_chart`/
// `weekly_chart` mogą mieć inną długość/wyrównanie bufora rozgrzewkowego
// (patrz alignSqueezeToDates w chart-render.js), więc tygodnie są łączone po
// DACIE, nie po indeksie wprost — ten sam wzorzec co breakoutVolumeRatio w
// classifyQullamaggie (signals.js). Zwraca null, gdy nie ma (jeszcze/już)
// żadnej rozpoznanej konsolidacji.
function squeezeConsolidationBox(c) {
    const t = c && c.ttm_squeeze_chart;
    const wc = c && c.weekly_chart;
    if (!t || !t.dates || !t.dates.length || !wc || !wc.dates || !wc.close_pct) return null;

    // Ostatni tydzień bywa jeszcze niedomknięty — ten sam caveat co w classifyTtmSqueeze/classifyQullamaggie.
    let nowIdx = t.dates.length - 1;
    while (nowIdx >= 0 && t.squeeze_on[nowIdx] == null) nowIdx--;
    if (nowIdx < 0) return null;

    const squeezeOn = t.squeeze_on[nowIdx];
    const squeezeCount = t.squeeze_count[nowIdx];
    const weeksSinceFire = t.weeks_since_fire[nowIdx];
    const fireConsolidationWeeks = t.fire_consolidation_weeks[nowIdx];

    let startIdx, endIdx, pending;
    if (squeezeOn === true && squeezeCount > 0) {
        // squeeze_count = kolejne tygodnie TRUE KOŃCZĄCE SIĘ na nowIdx (włącznie).
        endIdx = nowIdx;
        startIdx = Math.max(0, nowIdx - squeezeCount + 1);
        pending = true;
    } else if (weeksSinceFire != null && fireConsolidationWeeks > 0) {
        // fire_consolidation_weeks = squeeze_count SPRZED tygodnia wybicia (fireIdx),
        // czyli konsolidacja to [fireIdx - fireConsolidationWeeks, fireIdx - 1].
        const fireIdx = nowIdx - weeksSinceFire;
        endIdx = fireIdx - 1;
        startIdx = Math.max(0, fireIdx - fireConsolidationWeeks);
        pending = false;
    } else {
        return null;
    }
    if (endIdx < startIdx) return null;

    const wcIndexByDate = new Map(wc.dates.map((d, i) => [d, i]));
    let resistancePct = null, supportPct = null, startDate = null;
    for (let i = startIdx; i <= endIdx; i++) {
        const wi = wcIndexByDate.get(t.dates[i]);
        const pct = wi != null ? wc.close_pct[wi] : null;
        if (pct == null) continue;
        if (startDate == null) startDate = t.dates[i];
        if (resistancePct == null || pct > resistancePct) resistancePct = pct;
        if (supportPct == null || pct < supportPct) supportPct = pct;
    }
    if (resistancePct == null) return null;
    return {
        resistance_pct: resistancePct, support_pct: supportPct, start_date: startDate,
        phase: pending ? "SQUEEZE" : "FIRED",
        pending,
    };
}

// Poziom oporu/wsparcia "do obserwowania" na wykresie 1-minutowym (zakładka
// "⚡ 1 min + VWAP" w js/chart-modal.js) i w screenerze Qullamaggie
// (signals.js) — na wyraźną prośbę użytkownika: bez tego nie było wiadomo,
// jakiego poziomu ceny w ogóle wypatrywać przy wybiciu z konsolidacji.
// Preferuje `squeezeConsolidationBox()` (powyżej) — bezpośrednio z okna, które
// screener sam oznaczył jako squeeze; gdy go brak (spółka nie ma akurat ani
// trwającej, ani świeżo zakończonej konsolidacji — np. otwarta z ogólnej
// tabeli, nie z zakładki Qullamaggie/TTM Squeeze), spada do
// `weekly_chart.pending_base` (pudełko Darvasa, wciąż otwarte), a na końcu do
// OSTATNIEGO wpisu w `weekly_chart.bases` (box, który doprowadził do
// najświeższego wybicia) jako czysto informacyjny punkt odniesienia —
// `pending: false` odróżnia ten ostatni przypadek. `resistance_pct`/
// `support_pct` są zawsze close0-relatywne (ten sam close0 co `close_pct`),
// więc przeliczenie na realną cenę wymaga bieżącej ceny (`c.price`) i
// ostatniej wartości `close_pct` — dokładnie ta sama konwencja co
// `strategyStopFor()` w js/strategy.js. Zwraca null, gdy brak jakichkolwiek
// danych o bazie (np. za mało historii cen).
function breakoutLevelFor(c) {
    const wc = c && c.weekly_chart;
    if (!wc || !wc.close_pct || !wc.close_pct.length || !(c.price > 0)) return null;
    const lastPct = wc.close_pct[wc.close_pct.length - 1];
    if (lastPct == null) return null;
    const close0 = c.price / (1 + lastPct / 100);

    let base = squeezeConsolidationBox(c);
    let pending = base ? base.pending : true;
    if (!base) {
        base = wc.pending_base;
        if (!base && wc.bases && wc.bases.length) {
            base = wc.bases[wc.bases.length - 1];
            pending = false;
        }
    }
    if (!base || base.resistance_pct == null) return null;

    return {
        resistance: close0 * (1 + base.resistance_pct / 100),
        support: base.support_pct != null ? close0 * (1 + base.support_pct / 100) : null,
        startDate: base.start_date,
        pending,
        phase: base.phase || null,
    };
}

// "Mam vs cel": pasek obecnej wartości pozycji na tle docelowej (pionowa kreska
// = cel). Zielony = poniżej celu (do dokupienia), pomarańczowy = powyżej
// (za dużo), szary = w granicach ±BULLET_TOLERANCE_PCT.
const BULLET_TOLERANCE_PCT = 3;

function bulletHtml(current, target) {
    const cur = Math.max(current || 0, 0), tgt = Math.max(target || 0, 0);
    if (!cur && !tgt) return '<span class="spark-empty">—</span>';
    const w = 90, h = 12, max = Math.max(cur, tgt);
    const curW = (cur / max) * w, tgtX = Math.min((tgt / max) * w, w - 1);
    const ratio = tgt ? (cur / tgt) * 100 : null;
    const cls = ratio == null ? "bullet-over"
        : ratio < 100 - BULLET_TOLERANCE_PCT ? "bullet-under"
        : ratio > 100 + BULLET_TOLERANCE_PCT ? "bullet-over" : "bullet-ok";
    const label = ratio == null ? "poza celem" : `${ratio.toFixed(0)}%`;
    return `<span class="bullet" title="Masz ${label} wartości docelowej">`
        + `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`
        + `<rect x="0" y="2" width="${w}" height="${h - 4}" rx="2" class="bullet-track"/>`
        + `<rect x="0" y="2" width="${Math.max(curW, cur ? 1 : 0).toFixed(1)}" height="${h - 4}" rx="2" class="${cls}"/>`
        + (tgt ? `<rect x="${tgtX.toFixed(1)}" y="0" width="2" height="${h}" class="bullet-target"/>` : "")
        + `</svg><span class="bullet-label">${label}</span></span>`;
}

// ============================================================
// PODGLĄD "NA HOVER": najechanie na dowolny mini-wykres (.spark/.rs-bar) w
// tabeli i przytrzymanie przez MINI_PREVIEW_HOVER_DELAY_MS pokazuje pływające
// okienko z WIĘKSZĄ wersją TEGO SAMEGO wykresu, a przy okazji też każdego
// INNEGO mini-wykresu dostępnego w tym samym wierszu (np. najechanie na sam
// pasek RS pokazuje też tygodniowy sparkline i TTM Squeeze tej spółki, jeśli
// wiersz je ma) — krótkie podsumowanie spółki w jednym miejscu, bez klikania
// (na dashboardzie klik w wiersz i tak już otwiera pełny wykres w oknie
// modalnym — to osobny, szybszy "podgląd bez opuszczania tabeli").
// Włączane tylko tam, gdzie się je wywoła (patrz initMiniChartHoverPreview()
// w app.js) — samo dodanie tego pliku do strony nic nie aktywuje.
// Wymaga tr._rowData (patrz renderScreenerTable w table-render.js) — pełnego
// obiektu wiersza, nie tylko tekstowego dataset.ticker, żeby odczytać
// mini_closes/mini_hist/rs_long/daily_* bez osobnego wyszukiwania po tickerze.
// ============================================================
const MINI_PREVIEW_HOVER_DELAY_MS = 700;
let miniPreviewEl = null;
let miniPreviewTimer = null;
let miniPreviewHoveredEl = null;
// Natywny tooltip przeglądarki (atrybut title na <td>, np. "Cena tygodniowa
// (26 tyg.) + EMA20") potrafi wyskoczyć szybciej niż nasze okienko (np.
// ~500ms w Firefoksie) i wtedy oba nachodzą na siebie na ekranie — patrz
// zrzut ekranu w zgłoszeniu. Skoro nasze okienko i tak pokazuje to samo (i
// więcej), na czas hovera nad .spark/.rs-bar wycinamy title z najbliższego
// przodka, który go ma, i przywracamy go przy opuszczeniu elementu.
let miniPreviewSuppressedTitleEl = null;
let miniPreviewSuppressedTitleValue = null;

function getMiniPreviewEl() {
    if (!miniPreviewEl) {
        miniPreviewEl = document.createElement("div");
        miniPreviewEl.className = "mini-preview";
        document.body.appendChild(miniPreviewEl);
    }
    return miniPreviewEl;
}

function hideMiniPreview() {
    if (miniPreviewTimer) { window.clearTimeout(miniPreviewTimer); miniPreviewTimer = null; }
    miniPreviewHoveredEl = null;
    if (miniPreviewEl) miniPreviewEl.classList.remove("mini-preview-visible");
    restoreSuppressedTitle();
}

function suppressNativeTitle(target) {
    const titledEl = target.closest("[title]");
    if (!titledEl) return;
    miniPreviewSuppressedTitleEl = titledEl;
    miniPreviewSuppressedTitleValue = titledEl.getAttribute("title");
    titledEl.removeAttribute("title");
}

function restoreSuppressedTitle() {
    if (!miniPreviewSuppressedTitleEl) return;
    miniPreviewSuppressedTitleEl.setAttribute("title", miniPreviewSuppressedTitleValue);
    miniPreviewSuppressedTitleEl = null;
    miniPreviewSuppressedTitleValue = null;
}

function miniPreviewSectionHtml(label, html) {
    return html ? `<div class="mini-preview-visual"><div class="mini-preview-visual-label">${label}</div>${html}</div>` : "";
}

// Buduje HTML podglądu z SUROWEGO wiersza tabeli (tr._rowData) — czyta
// najpierw miniVisualFields()-owe nazwy (mini_closes/mini_ema/mini_hist/...),
// z fallbackiem na inne nazwy uzywane przez "Tygodniowych zwyciezcow"
// (weekly_closes/weekly_ema — patrz classifyWeeklyWinner w app.js), zeby
// dzialac na kazdej tabeli dashboardu bez wiedzy, ktora to konkretnie
// tabela. Zwraca null, gdy wiersz nie ma ZADNEGO rozpoznanego pola
// wizualnego (np. rzad w tabeli Continuation, ktora nie ma sparklinow).
function buildMiniPreviewHtml(row) {
    const closes = row.mini_closes || row.weekly_closes;
    const ema = row.mini_ema || row.weekly_ema;
    const hist = row.mini_hist;
    const stage = row.current_stage || (row.weekly_chart && row.weekly_chart.current_stage);
    const universe = row.universe;
    const universeLabel = universe && UNIVERSE_LABELS[universe] ? UNIVERSE_LABELS[universe].replace(" Momentum", "") : "";

    let sections = "";
    if (closes && closes.length) {
        sections += miniPreviewSectionHtml(`Tydzień (${closes.length} tyg.)`, weeklySparkSvg(closes, ema || [], row.mini_sq_flags || []));
    }
    if (hist && hist.length) {
        sections += miniPreviewSectionHtml("TTM Squeeze", ttmMiniSvg(hist, row.mini_sq_on || [], row.mini_fired || []));
    }
    if (typeof row.rs_long === "number") {
        sections += miniPreviewSectionHtml(`RS 52 tyg.${universeLabel ? ` vs ${universeLabel}` : ""}`, rsBarHtml(row.rs_long));
    }
    if (row.daily_closes && row.daily_closes.length) {
        sections += miniPreviewSectionHtml(`Dzień (${row.daily_closes.length} ses.)`, dailySparkSvg(row.daily_closes, row.daily_squeeze || [], row.daily_ema || []));
    }
    if (!sections) return null;

    const momentum = typeof row.momentum_pct === "number"
        ? `<span class="${row.momentum_pct >= 0 ? "positive" : "negative"}">${row.momentum_pct >= 0 ? "+" : ""}${row.momentum_pct.toFixed(1)}%</span>` : "";
    const price = typeof row.price === "number" && universe ? formatPrice(row.price, universe) : "";
    const subline = [universeLabel, price, momentum].filter(Boolean).join(" · ");

    return `<div class="mini-preview-header"><span class="mini-preview-ticker">${row.ticker}</span>${stageCellHtml(stage)}</div>`
        + (subline ? `<div class="mini-preview-sub">${subline}</div>` : "")
        + sections;
}

// Pozycjonuje okienko NAD (albo pod, gdy nad nie ma miejsca) najechaną
// komórką, wyśrodkowane poziomo względem niej — CELOWO nie "po prawej od
// kursora" jak w pierwszej wersji: wiersz tabeli ciągnie się dalej w prawo
// (kolejne kolumny — np. RS/TTM obok sparklinu), więc okienko wystawione w
// prawo lądowało dokładnie na nich, zasłaniając to, co użytkownik akurat
// chciał zobaczyć OBOK podglądu. Nad/pod wierszem nie ma tego problemu —
// zasłania co najwyżej sąsiednie wiersze, nie tę samą linię danych.
function positionMiniPreview(el, targetEl) {
    const rect = targetEl.getBoundingClientRect();
    el.style.left = "0px";
    el.style.top = "0px";
    const elRect = el.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - elRect.width / 2;
    if (left < 8) left = 8;
    if (left + elRect.width > window.innerWidth - 8) left = window.innerWidth - elRect.width - 8;

    const gap = 10;
    let top = rect.top - elRect.height - gap; // domyślnie nad wierszem
    if (top < 8) top = rect.bottom + gap; // za mało miejsca nad -> pod wierszem
    if (top + elRect.height > window.innerHeight - 8) top = window.innerHeight - elRect.height - 8;

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function showMiniPreview(row, targetEl) {
    const html = buildMiniPreviewHtml(row);
    if (!html) return;
    const el = getMiniPreviewEl();
    el.innerHTML = html;
    el.classList.add("mini-preview-visible");
    positionMiniPreview(el, targetEl);
}

function initMiniChartHoverPreview() {
    if (typeof document === "undefined") return;
    const findTarget = el => el && el.closest && el.closest(".spark, .rs-bar");

    // mouseover/mouseout (delegowane na document), nie mouseenter/mouseleave —
    // te ostatnie nie bąbelkują, więc nie dałoby się ich powiesić raz na
    // document dla wierszy, które są tworzone/niszczone przy każdym renderze
    // tabeli. e.relatedTarget odróżnia "wciąż w tym samym elemencie" (np.
    // przejście między <path>/<rect> wewnątrz tego samego <svg class="spark">)
    // od faktycznego opuszczenia go.
    document.addEventListener("mouseover", (e) => {
        const target = findTarget(e.target);
        if (!target || target === miniPreviewHoveredEl) return;
        hideMiniPreview();
        miniPreviewHoveredEl = target;
        const tr = target.closest("tr");
        const row = tr && tr._rowData;
        if (!row || !row.ticker) return;
        suppressNativeTitle(target);
        miniPreviewTimer = window.setTimeout(() => showMiniPreview(row, target), MINI_PREVIEW_HOVER_DELAY_MS);
    });

    document.addEventListener("mouseout", (e) => {
        const target = findTarget(e.target);
        if (!target || target !== miniPreviewHoveredEl) return;
        if (target.contains(e.relatedTarget)) return;
        hideMiniPreview();
    });

    // Zabezpieczenie: scroll/klik gdziekolwiek chowa podglad na wszelki
    // wypadek, gdyby mouseout sie nie odpalil (np. scroll kolkiem myszy bez
    // ruchu kursora zostawiajacy okienko "przyklejone" w starym miejscu).
    document.addEventListener("scroll", hideMiniPreview, true);
    document.addEventListener("click", hideMiniPreview, true);
}

// Eksport wyłącznie dla test runnera Node (tests/js/) — bez efektu w przeglądarce.
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        latestNonNullIdx, sparkPoints, sparkPath, seriesRange, sparkSqueezeBars, weeklySparkSvg, dailySparkSvg, RS_BAR_CAP, rsBarHtml, ttmMiniSvg, MINI_WEEKS, miniVisualFields, zeroLineSparkSvg, crossIndexInTail, findConstituent, BULLET_TOLERANCE_PCT, bulletHtml, stageBreakdown, PULLBACK_BAND_PCT, pullbackHtml, squeezeConsolidationBox, breakoutLevelFor,
    };
}
