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

// Eksport wyłącznie dla test runnera Node (tests/js/) — bez efektu w przeglądarce.
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        latestNonNullIdx, sparkPoints, sparkPath, seriesRange, sparkSqueezeBars, weeklySparkSvg, dailySparkSvg, RS_BAR_CAP, rsBarHtml, ttmMiniSvg, MINI_WEEKS, miniVisualFields, zeroLineSparkSvg, crossIndexInTail, findConstituent, BULLET_TOLERANCE_PCT, bulletHtml, stageBreakdown, PULLBACK_BAND_PCT, pullbackHtml,
    };
}
