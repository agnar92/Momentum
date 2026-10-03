// ============================================================
// WYKRES W STYLU MARKETSMITH (okienko po kliknięciu spółki na index.html) — czysty SVG, bez bibliotek.
// Dane: docs/data/charts.json (watchlist.py::build_charts) — wspólna lista tygodni, S&P 500 i dla każdej
// spółki tygodniowe OHLC + wolumen + SMA10/SMA40 + kwartalny EPS + linie trendu (dzienny widok: day.*). Panele od góry:
//   1. linia benchmarku (S&P 500),
//   (pasek legendy: średnie, RS Rating, wykryty kształt/wybicie — osobno, żeby nie zasłaniać wykresu),
//   2. słupki OHLC + średnie kroczące + linie trendu (opór/wsparcie) + linia RS (spółka / S&P 500) w dolnej części,
//   3. wolumen,
//   4. linia EPS kwartalnego (wartość + zmiana r/r), znaczniki dat wyników także na panelu cen.
// Logika modelu/skal jest czysta i testowana (tests/js/chart.test.js), rysowanie to tylko składanie SVG.
// ============================================================

if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
}

const CHART_LAYOUT = {
    width: 1000, height: 710, left: 10, right: 66,
    bench: { y: 8, h: 70 }, legend: { y: 86, h: 20 }, price: { y: 110, h: 330 }, volume: { y: 448, h: 80 }, eps: { y: 538, h: 118 },
    axisY: 688,
};
// Układ dla wąskich ekranów (telefon): węższy viewBox + większa czcionka względem niego, żeby po przeskalowaniu
// do szerokości ekranu napisy były czytelne; do tego krótsze okno (COMPACT_WEEKS tygodni) — patrz sliceModel.
const CHART_LAYOUT_COMPACT = {
    width: 560, height: 800, left: 6, right: 46,
    bench: { y: 6, h: 70 }, legend: { y: 80, h: 50 }, price: { y: 134, h: 300 }, volume: { y: 442, h: 84 }, eps: { y: 534, h: 132 },
    axisY: 718,
};
// Układ szeroki (pełny ekran na monitorze): więcej miejsca na słupki zamiast pustych pasów po bokach.
const CHART_LAYOUT_WIDE = {
    width: 1600, height: 800, left: 10, right: 70,
    bench: { y: 8, h: 70 }, legend: { y: 86, h: 20 }, price: { y: 110, h: 400 }, volume: { y: 518, h: 90 }, eps: { y: 616, h: 124 },
    axisY: 778,
};
// Układ "dopasowany": viewBox = faktyczny rozmiar komórki w pikselach (siatka dzienny+tygodniowy / 4 spółki), panele proporcjonalnie
// do wysokości, więc wykres wypełnia komórkę bez pustych pasów; czcionki są wtedy w prawdziwych pikselach.
function fitLayout(w, h, noTable = false) {
    const twoRows = w < 560;
    const legendH = twoRows ? 36 : 20;
    const avail = Math.max(120, h - legendH - 56);
    // niski ekran (telefon poziomo): bez paska S&P 500, żeby wykres cen nie zamienił się w kreskę
    const short = avail < 300;
    const dropTable = short || noTable;   // telefon: pasek ↑ EPS pod cenami niesie wartość i zmianę r/r, osobna tabela tylko zabierałaby miejsce pod wolumenem
    const bench = short ? 0 : Math.max(30, Math.round(avail * 0.10)), volume = Math.max(short ? 28 : 36, Math.round(avail * (short ? 0.18 : 0.14))), eps = dropTable ? 0 : Math.max(48, Math.round(avail * 0.17));   // niski ekran: bez tabeli kwartałów (zostaje pasek ↑ EPS z % r/r)
    const price = Math.max(60, avail - bench - volume - eps);
    const L = { width: Math.round(w), left: 6, right: 52, legendRows: twoRows ? 2 : 1 };
    L.bench = { y: 4, h: bench };
    L.legend = { y: L.bench.y + bench + (bench ? 6 : 0), h: legendH };
    L.price = { y: L.legend.y + legendH + 4, h: price };
    L.volume = { y: L.price.y + price + 8, h: volume };
    L.eps = { y: L.volume.y + volume + (eps ? 8 : 0), h: eps };
    L.axisY = L.eps.y + eps + (eps ? 18 : 16);
    L.height = Math.round(L.axisY + 8);
    return L;
}
const COMPACT_FONT_SCALE = 1.5;
const FIT_FONT_SCALE = 1.1;
const COMPACT_WEEKS = 52;
const DAILY_WINDOW_DAYS = 42;   // domyślne okno wykresu dziennego (~2 miesiące); cały rok jest dostępny suwakiem
const MIN_WINDOW = 15;      // najmniejsze okno suwaka (słupków)
// Kolory średnich inne niż świece (zielona/czerwona) i linia RS (niebieska), żeby nie zlewały się ze słupkami.
const SMA_COLORS = { "SMA 10": "#22d3ee", "SMA 20": "#f5d547", "SMA 50": "#ff6b6b", "SMA 200": "#e8eaed", "SMA 10 tyg.": "#22d3ee", "SMA 40 tyg.": "#f472b6" };
const CHART_COLORS = {
    up: "#2ecc71", down: "#e0455a", rs: "#4aa3ff", bench: "#c9ced8",
    eps: "#e0b341", res: "#ff9f43", cup: "#d6dbe6", sup: "#9fb3c8", volAvg: "#e8a33d", grid: "#262a35", text: "#8a8f9c", textStrong: "#e8eaed",
};
const MONTHS_PL = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

// "Ładne" wartości osi: ~count znaczników w przedziale [min, max] (kroki 1/2/5·10^n).
function niceTicks(min, max, count = 5) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    if (min === max) return [min];
    const raw = (max - min) / count;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const frac = raw / pow;
    const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10) * pow;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
    return out;
}

// Skala liniowa: wartość -> współrzędna y (większa wartość = wyżej), z ustalonym pudełkiem [top, top+height].
function makeYScale(min, max, top, height) {
    const span = max - min || 1;
    return v => top + height - ((v - min) / span) * height;
}

// Skala logarytmiczna (tylko wartości dodatnie): równe odległości = równe zmiany procentowe.
function makeLogScale(min, max, top, height) {
    const lin = makeYScale(Math.log(min), Math.log(max), top, height);
    return v => lin(Math.log(v));
}

// Znaczniki osi logarytmicznej: 1/2/5 · 10^n w przedziale; przy małej liczbie — gęściej (1,1.5,2,3,...), a w bardzo wąskim zakresie — liniowe.
function logTicks(min, max) {
    if (!(min > 0) || !(max > min)) return [];
    const pick = mults => {
        const out = [];
        for (let p = Math.floor(Math.log10(min)); p <= Math.ceil(Math.log10(max)); p++) {
            mults.forEach(m => { const v = Number((m * Math.pow(10, p)).toPrecision(12)); if (v >= min && v <= max) out.push(v); });
        }
        return out;
    };
    const coarse = pick([1, 2, 5]);
    if (coarse.length >= 4) return coarse;
    const dense = pick([1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9]);
    return dense.length >= 3 ? dense : niceTicks(min, max, 5);   // bardzo wąski zakres: zwykłe, liniowe znaczniki
}

function numericExtent(arrays) {
    let min = Infinity, max = -Infinity;
    arrays.forEach(arr => (arr || []).forEach(v => {
        if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
    }));
    return Number.isFinite(min) ? [min, max] : null;
}

// Indeks tygodnia, w którym wypada data (pierwszy tydzień kończący się nie wcześniej niż data); -1 poza oknem.
function weekIndexForDate(weeks, date) {
    if (!weeks.length) return -1;
    for (let i = 0; i < weeks.length; i++) if (weeks[i] >= date) return i;
    return -1;
}

// Model wykresu jednej spółki: wspólne tablice + linia RS (cena / S&P 500) + pozycje wyników na osi tygodni.
// Widok dzienny (dailyCharts): ta sama struktura, ale oś to ostatnie sesje (charts.days) i średnie SMA 10/20/50/200.
function dailyCharts(charts) {
    if (!charts || !charts.days) return null;
    const stocks = {};
    Object.keys(charts.stocks).forEach(t => {
        const c = charts.stocks[t], d = c.day;
        // wyniki sprzed pierwszej sesji okna wypadłyby na indeks 0 i nałożyły się na siebie — pomijamy je
        if (d) stocks[t] = { ...d, bases: c.bases, rs_line: c.rs_line, eps: (c.eps || []).filter(q => q.d >= charts.days[0]), eps_next: c.eps_next };
    });
    return { weeks: charts.days, spx: charts.spx_d, stocks, daily: true };
}

// Zmiana linii RS od pierwszej do ostatniej dostępnej wartości okna (%): ile spółka pobiła (lub przegrała z) S&P 500.
function relChange(rs) {
    const vals = rs.filter(Number.isFinite);
    return vals.length >= 2 ? (vals[vals.length - 1] / vals[0] - 1) * 100 : null;
}

// Indeks świecy dla daty linii trendu (może wypaść przed oknem — wtedy wartość ujemna, linia jest obcinana przy rysowaniu).
function lineIndex(weeks, date) {
    const i = weekIndexForDate(weeks, date);
    return i >= 0 ? i : weeks.length - 1;
}

// Puste miejsce z prawej (przyszłe świece): dni handlowe po ostatniej świecy (dziennie) albo kolejne tygodnie.
const FUTURE_PAD_DAILY = 21, FUTURE_PAD_WEEKLY = 4;           // ile przyszłych miejsc da się obejrzeć suwakiem (~miesiąc)
const FUTURE_DEFAULT_DAILY = 6, FUTURE_DEFAULT_WEEKLY = 1;    // ile z nich widać domyślnie
function futureDates(last, count, daily) {
    const out = [];
    let t = dateMs(last);
    while (out.length < count) {
        t += DAY_MS * (daily ? 1 : 7);
        if (daily && [0, 6].includes(new Date(t).getUTCDay())) continue;   // pomijamy weekendy
        out.push(new Date(t).toISOString().slice(0, 10));
    }
    return out;
}

// opts.pad = true: dokłada puste "przyszłe" miejsca na prawo (wszystkie tablice modelu rosną o `pad`, wartości null).
function buildChartModel(charts, ticker, stock, opts = {}) {
    const c = charts && charts.stocks && charts.stocks[ticker];
    if (!c) return null;
    const weeks = charts.weeks;
    const spx = charts.spx || null;
    const rs = c.c.map((close, i) => (spx && Number.isFinite(close) && Number.isFinite(spx[i]) && spx[i] > 0) ? close / spx[i] : null);
    const eps = (c.eps || []).map(q => ({ ...q, week: weekIndexForDate(weeks, q.d) })).filter(q => q.week >= 0);
    const smas = charts.daily
        ? (c.sma50 ? [["SMA 10", c.sma10], ["SMA 50", c.sma50], ["SMA 200", c.sma200]] : [["SMA 10", c.sma10], ["SMA 20", c.sma20]])   // jak w MarketSmith: 10 / 50 / 200 dni
        : [["SMA 10 tyg.", c.sma10], ["SMA 40 tyg.", c.sma40]];
    // Linie trendu (watchlist.py::detect_trendlines): opór/wsparcie jako odcinki (indeks, cena).
    const tl = c.tl || null;
    const lines = tl ? tl.lines.map(l => ({ kind: l.kind, i0: lineIndex(weeks, l.x0), y0: l.y0, i1: lineIndex(weeks, l.x1), y1: l.y1, touches: l.touches })) : [];
    // Miseczki (cup): lewy szczyt, dołek i prawy brzeg w indeksach świec; część może wypadać przed oknem (ujemne indeksy).
    // Daty sprzed pierwszej świecy dają ujemne indeksy (dziennie mamy ~rok historii, miseczka mogła zacząć się wcześniej) —
    // rysujemy wtedy jej widoczną część zamiast gubić całą miseczkę.
    // Miseczka kończy się na prawym brzegu (cup.rim_date, cena rim); rączka (jeśli jest) to krótkie cofnięcie po nim do dziś / wybicia.
    const cups = (c.bases || []).filter(b => b.type === "cup" && b.low_date).map(b => {
        const cp = b.cup || {};
        const h = cp.handle;
        return {
            i0: dateToIndex(weeks, b.start), iLow: dateToIndex(weeks, b.low_date), i1: dateToIndex(weeks, cp.rim_date || b.end),
            peak: b.peak, low: b.low, right: cp.rim != null ? cp.rim : b.end_close, depth: b.depth_pct, open: b.open,
            weeks: cp.cup_weeks, prior: cp.prior_gain_pct, mktDd: cp.mkt_dd_pct, ctx: !!cp.mkt_ctx,
            handle: h ? { iLow: dateToIndex(weeks, h.low_date), low: h.low, iEnd: dateToIndex(weeks, b.end), end: b.end_close, depth: h.depth_pct } : null,
        };
    }).filter(b => b.i1 > b.i0 && b.iLow > b.i0 && b.iLow <= b.i1);
    const lastIdx = c.c.reduce((acc, v, i) => (Number.isFinite(v) ? i : acc), -1);
    const rsNewHigh = c.rs_hi ? c.rs_hi.map(Boolean) : rsNewHighFlags(rs);
    const volAvg = rollingMean(c.v, VOL_AVG_WEEKS);
    const pad = opts.pad ? (charts.daily ? FUTURE_PAD_DAILY : FUTURE_PAD_WEEKLY) : 0;
    const padArr = (arr, fill = null) => (arr ? arr.concat(new Array(pad).fill(fill)) : arr);
    const allWeeks = pad ? weeks.concat(futureDates(weeks[weeks.length - 1], pad, !!charts.daily)) : weeks;
    return {
        ticker, daily: !!charts.daily, weeks: allWeeks, n: allWeeks.length, pad,
        padDefault: pad ? (charts.daily ? FUTURE_DEFAULT_DAILY : FUTURE_DEFAULT_WEEKLY) : 0,
        o: padArr(c.o), h: padArr(c.h), l: padArr(c.l), c: padArr(c.c), v: padArr(c.v),
        smas: smas.map(([label, values]) => ({ label, values: padArr(values || []), color: SMA_COLORS[label] })),
        spx: padArr(spx), rs: padArr(rs), eps, lines, cups, trend: tl ? { pattern: tl.pattern, state: tl.state, breakout: tl.breakout || null, info: tl.info || null } : null,
        pole: tl && tl.info && tl.info.pole_start ? { i0: lineIndex(weeks, tl.info.pole_start), y0: tl.info.pole_low, i1: lineIndex(weeks, tl.info.pole_end), y1: tl.info.pole_high, gain: tl.info.pole_gain } : null,
        epsLast: eps.length ? eps[eps.length - 1] : null,
        epsNext: c.eps_next && c.eps_next.d >= weeks[weeks.length - 1] ? c.eps_next : null,   // przeterminowana prognoza z cache'u to nie "następny" raport
        lastIdx,
        // nowe maksimum RS/ceny względem ostatnich ~52 tygodni liczy watchlist.py na pełnej historii (nie tylko na oknie wykresu)
        rsNewHigh: padArr(rsNewHigh, false),
        pxNewHigh: c.px_hi ? padArr(c.px_hi.map(Boolean), false) : null,
        rsChangePct: relChange(rs),
        rsLine: c.rs_line || null, volAvg: padArr(volAvg),
        rsRating: stock && Number.isFinite(stock.rs_rating) ? stock.rs_rating : null,
        pivot: pivotFromStock(stock, c.bases),
    };
}

// Pivot do narysowania: pivot otwartej bazy (od jej początku) albo, bez bazy, poziom oporu flagi / korytarza dziś.
function pivotFromStock(stock, bases) {
    if (!stock) return null;
    if (stock.base_type && Number.isFinite(stock.pivot)) {
        const open = (bases || []).filter(b => b.open).pop();
        return { price: stock.pivot, date: open ? open.start : null, kind: "baza" };
    }
    if (Number.isFinite(stock.tl_level) && stock.tl_state) return { price: stock.tl_level, date: null, kind: "flaga" };
    return null;
}

// Rozmieszczanie etykiet bez nakładania (telefon!): każda etykieta {text, x, y, anchor, size, bold, prio} dostaje pierwsze wolne miejsce spośród
// kandydatów (przesunięcia w górę / dół / na boki), zawsze w granicach wykresu; etykiety o niższym priorytecie, którym nie starczyło
// miejsca, są pomijane (prio ≥ 8 zostają zawsze, najwyżej nachodząc). `fixed` = prostokąty już zajęte (np. etykiety nieprzesuwalne).
// Zwraca etykiety z ostatecznymi x, y w kolejności wejściowej (pominięte mają dropped = true).
function labelBox(it, x, y) {
    const w = it.size * (it.bold ? 0.62 : 0.56) * String(it.text).length;
    const x0 = it.anchor === "end" ? x - w : it.anchor === "middle" ? x - w / 2 : x;
    return { x0, x1: x0 + w, y0: y - it.size, y1: y + it.size * 0.3 };
}

function placeLabels(items, bounds, fixed = []) {
    const hit = (a, b) => a.x0 < b.x1 + 1 && b.x0 < a.x1 + 1 && a.y0 < b.y1 + 1 && b.y0 < a.y1 + 1;
    const placed = fixed.slice();
    const result = items.map(it => ({ ...it }));
    const order = result.map((it, i) => i).sort((a, b) => (result[b].prio - result[a].prio) || (a - b));
    order.forEach(i => {
        const it = result[i], s = it.size;
        const w = labelBox(it, 0, 0).x1 - labelBox(it, 0, 0).x0;
        const dxs = [0, w * 0.6, -w * 0.6, w * 1.2, -w * 1.2];
        const dys = [0, -s * 1.15, s * 1.15, -s * 2.3, s * 2.3, -s * 3.45, s * 3.45];
        const cands = [];
        dys.forEach(dy => dxs.forEach(dx => cands.push([dx, dy])));
        cands.sort((a, b) => Math.hypot(a[0] / 2, a[1]) - Math.hypot(b[0] / 2, b[1]));
        const fit = (dx, dy) => {
            let x = it.x + dx, y = it.y + dy;
            let b = labelBox(it, x, y);
            if (b.x0 < bounds.x0) x += bounds.x0 - b.x0; else if (b.x1 > bounds.x1) x -= b.x1 - bounds.x1;
            b = labelBox(it, x, y);
            if (b.y0 < bounds.y0) y += bounds.y0 - b.y0; else if (b.y1 > bounds.y1) y -= b.y1 - bounds.y1;
            return { x, y, box: labelBox(it, x, y) };
        };
        for (const [dx, dy] of cands) {
            const f = fit(dx, dy);
            if (!placed.some(p => hit(p, f.box))) { it.x = f.x; it.y = f.y; placed.push(f.box); return; }
        }
        if (it.prio >= 8) { const f = fit(0, 0); it.x = f.x; it.y = f.y; placed.push(f.box); } else it.dropped = true;
    });
    return result;
}

// Szczyty i dołki do podpisania ceną (jak „366.28” przy lokalnych szczytach w MarketSmith): lokalny ekstremum w promieniu k świec;
// ważniejsze (wyższe szczyty, niższe dołki) mają pierwszeństwo, zbyt bliskie sobie odrzucamy.
function swingLabels(h, l, lastIdx, k, maxHigh = 6, maxLow = 5) {
    const pick = (arr, wantMax, max) => {
        const cand = [];
        for (let i = 0; i <= lastIdx; i++) {
            const v = arr[i];
            if (!Number.isFinite(v)) continue;
            let ok = true;
            for (let j = Math.max(0, i - k); j <= Math.min(lastIdx, i + k) && ok; j++) {
                if (j === i || !Number.isFinite(arr[j])) continue;
                if (wantMax ? arr[j] > v : arr[j] < v) ok = false;
                else if (arr[j] === v && j < i) ok = false;   // remis: bierzemy pierwszą świecę
            }
            if (ok) cand.push({ i, price: v, type: wantMax ? "H" : "L" });
        }
        cand.sort((a, b) => (wantMax ? b.price - a.price : a.price - b.price));
        const kept = [];
        cand.forEach(c => { if (kept.length < max && kept.every(x => Math.abs(x.i - c.i) >= k * 2)) kept.push(c); });
        return kept;
    };
    return [...pick(h, true, maxHigh), ...pick(l, false, maxLow)];
}

// Świece z wyraźnie podwyższonym wolumenem do podpisania (np. „14.4M”): najwyższe, co najmniej minRatio × średnia, nie zbyt blisko siebie.
function volumeSpikes(v, avg, count = 4, minRatio = 1.5, minGap = 3) {
    const cand = [];
    v.forEach((val, i) => { if (Number.isFinite(val) && Number.isFinite(avg[i]) && avg[i] > 0 && val >= avg[i] * minRatio) cand.push({ i, val }); });
    cand.sort((a, b) => b.val - a.val);
    const kept = [];
    cand.forEach(c => { if (kept.length < count && kept.every(x => Math.abs(x.i - c.i) >= minGap)) kept.push(c); });
    return kept;
}

// Wolumen jest w tysiącach akcji: „14.4M” albo „820K”.
function fmtVol(thousands) {
    return thousands >= 1000 ? (thousands / 1000).toFixed(1) + "M" : Math.round(thousands) + "K";
}

// Okno n słupków kończące się przed indeksem end (domyślnie: ostatnie n); wyniki EPS/linie przesuwają się o odciętą część.
function sliceModel(m, n, end = m.n) {
    end = Math.max(1, Math.min(m.n, Math.round(end)));
    n = Math.max(1, Math.min(end, Math.round(n)));
    if (n >= m.n) return m;
    const off = end - n;
    const cut = arr => arr.slice(off, end);
    return {
        ...m, weeks: cut(m.weeks), n, o: cut(m.o), h: cut(m.h), l: cut(m.l), c: cut(m.c), v: cut(m.v),
        smas: m.smas.map(x => ({ ...x, values: cut(x.values) })), spx: m.spx ? cut(m.spx) : null, rs: cut(m.rs),
        eps: m.eps.map(q => ({ ...q, week: q.week - off })).filter(q => q.week >= 0 && q.week < n),
        lines: m.lines.map(l => ({ ...l, i0: l.i0 - off, i1: l.i1 - off })).filter(l => l.i1 > 0 && l.i0 < n),
        pole: m.pole ? { ...m.pole, i0: m.pole.i0 - off, i1: m.pole.i1 - off } : null,
        cups: m.cups.map(c => ({ ...c, i0: c.i0 - off, iLow: c.iLow - off, i1: c.i1 - off, handle: c.handle ? { ...c.handle, iLow: c.handle.iLow - off, iEnd: c.handle.iEnd - off } : null })).filter(c => c.i1 > 0 && c.i0 < n),
        rsNewHigh: cut(m.rsNewHigh), pxNewHigh: m.pxNewHigh ? cut(m.pxNewHigh) : null, volAvg: cut(m.volAvg),
        lastIdx: Math.min(m.lastIdx - off, n - 1),
        lastShown: m.lastIdx - off <= n - 1,   // czy ostatnia prawdziwa świeca mieści się w oknie
    };
}

// Normalizuje okno suwaka {n, end} do zakresu danych (n ≥ MIN_WINDOW, end ≤ total); null = domyślne okno.
// Domyślna długość okna suwaka: zapamiętana przez użytkownika (opts.windowLen, osobno dla dziennego i tygodniowego)
// albo wbudowana (dziennie 2 miesiące, tygodniowo całość / 52 tyg. na telefonie).
function defaultWindowLength(full, opts = {}) {
    if (Number.isFinite(opts.windowLen) && opts.windowLen > 0) return opts.windowLen;
    const padDef = full.padDefault || 0;
    return full.daily ? DAILY_WINDOW_DAYS + padDef : ((opts.compact || opts.fit) ? COMPACT_WEEKS + padDef : full.n - (full.pad || 0) + padDef);
}

function clampWindow(w, total, defN, defEnd = total) {
    const minN = Math.min(MIN_WINDOW, total);
    const n = Math.max(minN, Math.min(total, Math.round(w && w.n ? w.n : defN)));
    const end = Math.max(n, Math.min(total, Math.round(w && Number.isFinite(w.end) ? w.end : defEnd)));
    return { n, end };
}

const VOL_AVG_WEEKS = 10;       // średnia wolumenu ~50 sesji (jak linia średniego wolumenu w MarketSmith)
const RS_HIGH_MIN_WEEKS = 12;   // nowe maksimum linii RS liczymy dopiero po tylu tygodniach historii okna

// Tygodnie, w których linia RS ustanawia nowe maksimum okna (niebieska kropka w MarketSmith: RS przed ceną).
function rsNewHighFlags(rs) {
    let max = -Infinity;
    return rs.map((v, i) => {
        if (!Number.isFinite(v)) return false;
        const flag = i >= RS_HIGH_MIN_WEEKS && v >= max;
        if (v > max) max = v;
        return flag;
    });
}

function rollingMean(values, n) {
    return values.map((_, i) => {
        if (i < n - 1) return null;
        const win = values.slice(i - n + 1, i + 1);
        return win.every(Number.isFinite) ? win.reduce((a, b) => a + b, 0) / n : null;
    });
}

function polyline(points, color, width = 1.4, dash = "") {
    // points: [[x, y] | null, ...] — przerwy (null) dzielą linię na kawałki.
    const segs = [];
    let cur = [];
    points.forEach(p => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } });
    if (cur.length) segs.push(cur);
    return segs.filter(s => s.length > 1).map(s =>
        `<polyline fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""} points="${s.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"/>`
    ).join("");
}

// Etykiety osi: całkowite od 100 wzwyż, inaczej 2 miejsca (spójnie na całej osi).
function fmtAxis(v) {
    if (!Number.isFinite(v)) return "—";
    return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}

function fmtCompact(v) {
    if (!Number.isFinite(v)) return "—";
    if (Math.abs(v) >= 1000) return v.toFixed(0);
    return v.toFixed(2);
}

// Układ bez pasa legendy (telefon z wyłączoną legendą): pasek znika, a wolne miejsce dostaje wykres.
function dropLegend(L) {
    const dy = L.legend.h + 4;
    const out = { ...L, legend: { y: L.price.y - dy, h: 0 }, legendRows: 0 };
    ["price", "volume", "eps"].forEach(k => { out[k] = { ...L[k], y: L[k].y - dy }; });
    if (L.axisY != null) out.axisY = L.axisY - dy;
    out.height = L.height - dy;
    return out;
}

// Linia zysków leży na wykresie cen (jak w MarketSmith / MarketSurge), więc dolny panel jest potrzebny tylko na tabelę kwartałów
// (2 wiersze). Tylko w trybie estymat (opts.estimates) zostaje duży panel z konsensusem EPS; wolne miejsce dostaje wykres cen.
function compactEpsPanel(L, opts) {
    if (opts.estimates || L.eps.h < 20) return L;
    const scale = opts.compact ? (opts.fit ? FIT_FONT_SCALE : COMPACT_FONT_SCALE) : (L.fontScale || 1);
    const h = Math.round(scale * 36);
    const delta = L.eps.h - h;
    if (delta <= 0) return L;
    return { ...L, price: { ...L.price, h: L.price.h + delta }, volume: { ...L.volume, y: L.volume.y + delta }, eps: { y: L.eps.y + delta, h } };
}

function pickLayout(opts = {}) {
    if (opts.fit) {
        const noTable = !!opts.compact && !opts.estimates;
        const L = fitLayout(opts.fit.w, opts.fit.h, noTable);
        return compactEpsPanel(opts.hideLabels ? dropLegend(fitLayout(opts.fit.w, opts.fit.h + L.legend.h + 4, noTable)) : L, opts);
    }
    const L = opts.compact ? CHART_LAYOUT_COMPACT : (opts.wide ? CHART_LAYOUT_WIDE : CHART_LAYOUT);
    return compactEpsPanel(opts.hideLabels ? dropLegend(L) : L, opts);
}

// Daty <-> indeks świecy (ułamkowy, interpolacja po kalendarzu; poza zakresem ekstrapolacja średnią odległością świec).
// Używane przez rysowanie własnych linii/cupów (annotate.js): adnotacje są zapisane w datach, więc działają na dziennym i tygodniowym.
const DAY_MS = 86400000;
function dateMs(d) { return Date.parse(d + "T00:00:00Z"); }
function dateToIndex(dates, date) {
    const n = dates.length;
    if (!n) return 0;
    const t = dateMs(date), t0 = dateMs(dates[0]), t1 = dateMs(dates[n - 1]);
    const avg = n > 1 ? (t1 - t0) / (n - 1) : DAY_MS;
    if (t <= t0) return (t - t0) / avg;
    if (t >= t1) return n - 1 + (t - t1) / avg;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (dateMs(dates[mid]) <= t) lo = mid; else hi = mid; }
    const a = dateMs(dates[lo]), b = dateMs(dates[hi]);
    return lo + (t - a) / Math.max(1, b - a);
}
function indexToDate(dates, idx) {
    const n = dates.length;
    const t0 = dateMs(dates[0]), t1 = dateMs(dates[n - 1]);
    const avg = n > 1 ? (t1 - t0) / (n - 1) : DAY_MS;
    let t;
    if (idx <= 0) t = t0 + idx * avg;
    else if (idx >= n - 1) t = t1 + (idx - (n - 1)) * avg;
    else { const lo = Math.floor(idx); t = dateMs(dates[lo]) + (idx - lo) * (dateMs(dates[lo + 1]) - dateMs(dates[lo])); }
    return new Date(Math.round(t / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

// Punkty łuku miseczki (parabola: lewy szczyt -> dołek -> prawy brzeg); cup = {i0, iLow, i1, peak, low, right}.
function cupArcPoints(cup, x, yP, steps = 48) {
    const yL = yP(cup.peak), yB = yP(cup.low), yR = yP(Number.isFinite(cup.right) ? cup.right : cup.peak);
    const pts = [];
    for (let k = 0; k <= steps; k++) {
        const i = cup.i0 + (cup.i1 - cup.i0) * k / steps;
        const t = i <= cup.iLow ? (cup.iLow - i) / Math.max(1e-9, cup.iLow - cup.i0) : (i - cup.iLow) / Math.max(1e-9, cup.i1 - cup.iLow);
        pts.push([x(i), yB - (yB - (i <= cup.iLow ? yL : yR)) * t * t]);
    }
    return { pts, yL, yB, yR };
}

// ---------- estymaty analityków (Yahoo): cena celu + rewizje konsensusu EPS (opts.estimates = wpis z data/estimates.json) ----------
const EST_COLORS = { fy0: "#fbbf24", fy1: "#a78bfa", pt: "#2dd4bf" };
const EST_LABELS = { "0y": "bież. rok", "+1y": "nast. rok" };

// Linie konsensusu EPS (historia punktów [data, wartość]) dla bieżącego i następnego roku; tylko serie z >= 2 punktami.
function estimateSeries(entry) {
    if (!entry || !entry.p) return [];
    return ["0y", "+1y"].map(k => ({ key: k, label: EST_LABELS[k], color: k === "0y" ? EST_COLORS.fy0 : EST_COLORS.fy1, p: entry.p[k], h: (entry.p[k] && entry.p[k].h) || [] }))
        .filter(s => s.h.length >= 2);
}

// Zmiana % konsensusu względem punktu sprzed `days` dni (najbliższy wcześniejszy punkt historii) albo null.
function estimateChange(h, days) {
    if (!h || h.length < 2) return null;
    const last = h[h.length - 1], target = new Date(dateMs(last[0]) - days * DAY_MS).toISOString().slice(0, 10);
    const older = h.filter(pt => pt[0] <= target);
    const base = older.length ? older[older.length - 1][1] : null;
    return base ? (last[1] - base) / Math.abs(base) * 100 : null;
}

// Jednolinijkowe podsumowanie: cena celu (średnia, upside, zakres) i rewizje EPS.
function estimateText(entry, price) {
    if (!entry) return "Brak estymat analityków dla tej spółki.";
    const parts = [];
    const pt = entry.pt;
    if (pt && pt.mean) {
        const up = Number.isFinite(price) && price > 0 ? ` (${(pt.mean / price - 1) * 100 >= 0 ? "+" : ""}${((pt.mean / price - 1) * 100).toFixed(1)}%)` : "";
        parts.push(`Cena celu: śr. $${pt.mean}${up}, zakres $${pt.low}–$${pt.high}`);
    }
    estimateSeries(entry).forEach(sr => {
        const c30 = estimateChange(sr.h, 30), c90 = estimateChange(sr.h, 90);
        const f = v => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
        const rev = sr.key === "0y" && sr.p.u30 !== undefined && sr.p.u30 !== null ? `, rewizje 30d ↑${sr.p.u30} ↓${sr.p.d30 ?? 0}` : "";
        parts.push(`EPS ${sr.label}: ${sr.h[sr.h.length - 1][1]} (30d ${f(c30)}, 90d ${f(c90)}${rev})${sr.p.n ? `, ${sr.p.n} analityków` : ""}`);
    });
    return parts.join(" · ") || "Brak estymat analityków dla tej spółki.";
}

function chartSvg(m, opts = {}) {
    const L = pickLayout(opts);
    // układ fit ma viewBox w prawdziwych pikselach (pełny ekran telefonu, komórki siatki) — tam czcionki ×1,5 byłyby za duże
    const fs = n => +(n * (opts.compact ? (opts.fit ? FIT_FONT_SCALE : COMPACT_FONT_SCALE) : (L.fontScale || 1))).toFixed(1);
    const plotW = L.width - L.left - L.right;
    const step = plotW / m.n;
    const x_ = i => L.left + (i + 0.5) * step;
    const x = x_;
    const barHalf = Math.max(1, Math.min(4, step * 0.32));
    const parts = [];

    // --- siatka czasu + etykiety kwartałów
    const labelWeeks = [];
    m.weeks.forEach((d, i) => {
        const month = Number(d.slice(5, 7)) - 1;
        const prevMonth = i ? Number(m.weeks[i - 1].slice(5, 7)) - 1 : -1;
        if (month !== prevMonth && month % 3 === 0) labelWeeks.push(i);
    });
    labelWeeks.forEach(i => {
        const d = m.weeks[i];
        parts.push(`<line x1="${x(i)}" x2="${x(i)}" y1="${L.bench.y}" y2="${L.eps.y + L.eps.h}" stroke="${CHART_COLORS.grid}" stroke-width="0.7"/>`);
        if (x(i) < L.left + 22) return;   // etykieta przy samej krawędzi byłaby ucięta
        parts.push(`<text x="${x(i)}" y="${L.axisY}" fill="${CHART_COLORS.text}" font-size="${fs(11)}" text-anchor="middle">${MONTHS_PL[Number(d.slice(5, 7)) - 1]} '${d.slice(2, 4)}</text>`);
    });

    // --- 1. benchmark
    const bExt = m.spx ? numericExtent([m.spx]) : null;
    if (L.bench.h < 20) {
        // bez paska benchmarku (niski ekran)
    } else if (bExt) {
        const labelH = fs(11) + 8;   // pas na podpis nad linią, żeby jej nie zasłaniał
        const yB = makeYScale(bExt[0], bExt[1], L.bench.y + labelH, L.bench.h - labelH - 4);
        parts.push(polyline(m.spx.map((v, i) => Number.isFinite(v) ? [x(i), yB(v)] : null), CHART_COLORS.bench, 1.3));
        const last = [...m.spx].reverse().find(Number.isFinite);
        const first = m.spx.find(Number.isFinite);
        const chg = ((last / first - 1) * 100);
        if (!opts.hideLabels) parts.push(`<text x="${L.left + 4}" y="${L.bench.y + 12}" fill="${CHART_COLORS.bench}" font-size="${fs(11)}" font-weight="600">S&amp;P 500 ${fmtCompact(last)} (${chg >= 0 ? "+" : ""}${chg.toFixed(0)}% w oknie)</text>`);
        niceTicks(bExt[0], bExt[1], 2).forEach(t => {
            parts.push(`<text x="${L.width - L.right + 6}" y="${yB(t) + 4}" fill="${CHART_COLORS.text}" font-size="${fs(10)}">${fmtAxis(t)}</text>`);
        });
    } else {
        parts.push(`<text x="${L.left + 4}" y="${L.bench.y + 14}" fill="${CHART_COLORS.text}" font-size="${fs(11)}">Brak danych benchmarku (S&amp;P 500)</text>`);
    }
    parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${L.price.y - 4}" y2="${L.price.y - 4}" stroke="${CHART_COLORS.grid}"/>`);

    // --- 2. cena: słupki OHLC + SMA + RS
    // Pasek znaczników wyników (strzałka ↑ EPS + zmiana r/r, jak w MarketSmith/MarketSurge) leży pod wykresem cen: odejmujemy go od wysokości panelu.
    const labels = [];   // etykiety wykresu cen rozmieszczane bez nakładania (placeLabels) po narysowaniu wszystkiego
    const fixedLabels = [];   // etykiety rysowane na sztywno (miseczki) — tylko zajmują miejsce
    const addLabel = (text, xx, yy, o = {}) => labels.push({ text: String(text), x: xx, y: yy, anchor: o.anchor || "middle", size: o.size || fs(10), fill: o.fill || CHART_COLORS.textStrong, bold: !!o.bold, prio: o.prio === undefined ? 1 : o.prio, title: o.title || "" });
    const reserveLabel = (text, xx, yy, anchor, size, bold) => fixedLabels.push(labelBox({ text: String(text), anchor, size, bold }, xx, yy));
    const hasMarks = m.eps.length > 0 || !!m.epsNext;
    const marksH = hasMarks ? fs(opts.compact ? 28 : 32) : 0;
    const P = { y: L.price.y, h: L.price.h - marksH };
    const marks = { y: P.y + P.h, h: marksH };
    const est = opts.estimates || null;
    // Skrajne ceny celu (np. 2× cena) nie mogą spłaszczyć świec: do skali liczymy je w przedziale [0,65×; 1,6×] ostatniej ceny,
    // a prawdziwe wartości zostają w etykietach (strzałka ↑/↓ przy przyciętym końcu).
    const lastClose = m.c[m.lastIdx];
    const clipT = v => (Number.isFinite(lastClose) ? Math.min(lastClose * 1.6, Math.max(lastClose * 0.65, v)) : v);
    const ptExt = est && est.pt && est.pt.low && est.pt.high ? [clipT(est.pt.low), clipT(est.pt.high), clipT(est.pt.mean || est.pt.high)] : [];
    // Zakres cen: świece + tylko te średnie, które nie uciekają daleko (SMA200 bywa 40 % pod ceną i spłaszczyłaby świece) + pivot, gdy jest blisko ceny.
    const baseExt = numericExtent([m.h, m.l]) || [0, 1];
    const nearSma = m.smas.map(sm => sm.values.map(v => (Number.isFinite(v) && v >= baseExt[0] * 0.88 && v <= baseExt[1] * 1.12 ? v : null)));
    const pivotPx = m.pivot && Number.isFinite(m.pivot.price) ? m.pivot.price : null;
    const lastC = m.c[m.lastIdx];
    const pivotNear = pivotPx !== null && Number.isFinite(lastC) && Math.abs(pivotPx / lastC - 1) <= 0.15;
    const pivotExtra = pivotNear ? [[pivotPx], lastC >= pivotPx * 0.97 ? [pivotPx * 1.05] : []] : [];
    const pExt = numericExtent([m.h, m.l, ...nearSma, ptExt, ...pivotExtra]) || [0, 1];
    const useLog = !!opts.log && pExt[0] > 0;
    const pad = (pExt[1] - pExt[0]) * 0.04;
    const pMin = useLog ? pExt[0] / 1.04 : pExt[0] - pad;
    const pMax = useLog ? pExt[1] * 1.04 : pExt[1] + pad;
    const yP = useLog ? makeLogScale(pMin, pMax, P.y, P.h) : makeYScale(pMin, pMax, P.y, P.h);
    (useLog ? logTicks(pMin, pMax) : niceTicks(pMin, pMax, 6)).forEach(t => {
        parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${yP(t)}" y2="${yP(t)}" stroke="${CHART_COLORS.grid}" stroke-width="0.5"/>`);
        if (yP(t) > P.y + fs(9)) parts.push(`<text x="${L.width - L.right + 6}" y="${yP(t) + 4}" fill="${CHART_COLORS.text}" font-size="${fs(10)}">${fmtAxis(t)}</text>`);   // nie na etykiecie osi S&P tuż nad panelem
    });
    // miseczki (cup) jako łuk od lewego szczytu przez dołek do prawego brzegu, z głębokością w środku
    parts.push(`<clipPath id="chartPriceClip${opts.uid || ""}"><rect x="${L.left}" y="${P.y}" width="${L.width - L.left - L.right}" height="${P.h}"/></clipPath>`);
    (opts.hideAutoCups ? [] : m.cups).forEach(cup => {
        const { pts, yL, yB, yR } = cupArcPoints(cup, x, yP);
        parts.push(`<polyline clip-path="url(#chartPriceClip${opts.uid || ''})" fill="none" stroke="${CHART_COLORS.cup}" stroke-width="2" stroke-linecap="round" points="${pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"><title>Cup −${cup.depth}%${cup.weeks ? ` · ${cup.weeks} tyg.` : ""}${cup.prior != null ? ` · trend przed: +${cup.prior}%` : ""}${cup.mktDd != null ? ` · S&amp;P w tym czasie −${cup.mktDd}%` : ""}</title></polyline>`);
        if (cup.handle) {   // rączka: od prawego brzegu przez dołek rączki do ostatniej świecy bazy
            const hp = [[x(cup.i1), yP(cup.right)], [x(cup.handle.iLow), yP(cup.handle.low)], [x(cup.handle.iEnd), yP(cup.handle.end)]];
            parts.push(`<polyline clip-path="url(#chartPriceClip${opts.uid || ''})" fill="none" stroke="${CHART_COLORS.cup}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${hp.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}"><title>Rączka −${cup.handle.depth}%</title></polyline>`);
            parts.push(`<text x="${hp[1][0]}" y="${hp[1][1] + fs(13)}" font-size="${fs(10)}" font-weight="700" fill="${CHART_COLORS.cup}" text-anchor="middle" stroke="#0e0f13" stroke-width="3" paint-order="stroke">rączka −${cup.handle.depth}%</text>`);
            reserveLabel(`rączka −${cup.handle.depth}%`, hp[1][0], hp[1][1] + fs(13), "middle", fs(10), true);
        }
        // cena monitorowania miseczki = pivot (prawy brzeg)
        const pivot = Number.isFinite(cup.right) ? cup.right : null;
        if (pivot) {
            const px = Math.min(Math.max(x(cup.i1), L.left + fs(80)), L.width - L.right - 4);
            parts.push(`<text x="${px}" y="${Math.max(yP(pivot) - 6, P.y + fs(10))}" font-size="${fs(11)}" font-weight="700" fill="${CHART_COLORS.cup}" text-anchor="end" stroke="#0e0f13" stroke-width="3" paint-order="stroke" pointer-events="none">pivot ${pivot.toFixed(2)}</text>`);
            reserveLabel(`pivot ${pivot.toFixed(2)}`, px, Math.max(yP(pivot) - 6, P.y + fs(10)), "end", fs(11), true);
        }
        const cx = Math.min(Math.max(x((cup.i0 + cup.i1) / 2), L.left + 24), L.width - L.right - 24);
        addLabel(`−${cup.depth}%${cup.ctx ? ` · S&P −${cup.mktDd}%` : ""}`, cx, yB - (yB - Math.min(yL, yR)) * 0.35, { size: fs(12), fill: CHART_COLORS.cup, bold: true, prio: 6 });
    });
    for (let i = 0; i < m.n; i++) {
        if (![m.o[i], m.h[i], m.l[i], m.c[i]].every(Number.isFinite)) continue;
        const col = m.c[i] >= m.o[i] ? CHART_COLORS.up : CHART_COLORS.down;
        parts.push(`<g stroke="${col}" stroke-width="${step > 5 ? 1.6 : 1.1}">`
            + `<line x1="${x(i)}" x2="${x(i)}" y1="${yP(m.h[i])}" y2="${yP(m.l[i])}"/>`
            + `<line x1="${x(i) - barHalf}" x2="${x(i)}" y1="${yP(m.o[i])}" y2="${yP(m.o[i])}"/>`
            + `<line x1="${x(i)}" x2="${x(i) + barHalf}" y1="${yP(m.c[i])}" y2="${yP(m.c[i])}"/></g>`);
    }
    const clipAttr = `clip-path="url(#chartPriceClip${opts.uid || ""})"`;
    m.smas.forEach(x => {
        const pts = x.values.map((v, i) => Number.isFinite(v) ? [x_(i), yP(v)] : null);
        parts.push(polyline(pts, "#0e0f13", 3.6).replace("<polyline", `<polyline ${clipAttr} opacity="0.65"`));   // ciemny obrys: średnia odcina się od świec
        parts.push(polyline(pts, x.color, 1.7).replace(/<polyline/g, `<polyline ${clipAttr}`));
    });
    // pivot (zielona linia przerywana) + strefa zakupu (pivot … +5 %, niebieska) + typowy stop 7–8 % pod pivotem (różowa) — jak w MarketSurge
    if (pivotPx !== null && Number.isFinite(lastC) && m.lastShown !== false) {
        const xr = L.width - L.right, yPv = yP(pivotPx);
        const i0 = m.pivot.date ? Math.max(0, dateToIndex(m.weeks, m.pivot.date)) : Math.max(0, m.lastIdx - 25);
        const zx = x(Math.max(0, m.lastIdx - 14)), zw = Math.max(0, xr - zx);
        const band = (lo, hi, fill, op) => `<rect ${clipAttr} x="${zx}" y="${Math.min(yP(lo), yP(hi))}" width="${zw}" height="${Math.abs(yP(lo) - yP(hi))}" fill="${fill}" opacity="${op}"/>`;
        parts.push(band(pivotPx, pivotPx * 1.05, "#4aa3ff", 0.15), band(pivotPx * 0.92, pivotPx * 0.93, "#ff6b8a", 0.18));
        parts.push(`<line ${clipAttr} x1="${x(i0)}" x2="${xr}" y1="${yPv}" y2="${yPv}" stroke="#2ecc71" stroke-width="1.4" stroke-dasharray="5 3"><title>Pivot (${m.pivot.kind}) ${pivotPx.toFixed(2)}</title></line>`);
        const clampY = v => Math.max(P.y + fs(10), Math.min(P.y + P.h - 3, v));
        addLabel(`pivot ${pivotPx.toFixed(2)}`, Math.max(x(i0), L.left) + 4, Math.max(P.y + fs(10), yPv - 4), { anchor: "start", fill: "#2ecc71", bold: true, prio: 9 });
        addLabel(opts.compact ? "kup do +5 %" : "strefa zakupu do +5 %", zx - 4, clampY(yP(pivotPx * 1.05) - 3), { anchor: "end", fill: "#7ab8ff", bold: true, prio: 4 });
        addLabel(opts.compact ? "stop 7–8 %" : "typowy stop 7–8 %", zx - 4, clampY(yP(pivotPx * 0.92) + fs(11)), { anchor: "end", fill: "#ff8fa8", bold: true, prio: 4 });
    }
    // dzień wybicia: pionowa cyjanowa linia przez cenę i wolumen
    const boI = m.trend && m.trend.breakout ? weekIndexForDate(m.weeks, m.trend.breakout.date) : -1;
    if (boI >= 0) {
        parts.push(`<line x1="${x(boI)}" x2="${x(boI)}" y1="${P.y}" y2="${L.volume.y + L.volume.h}" stroke="#22d3ee" stroke-width="1" stroke-dasharray="3 3" opacity="0.65"><title>Dzień wybicia ${m.trend.breakout.date}</title></line>`);
        addLabel(`wybicie${Number.isFinite(m.trend.breakout.vol_ratio) ? ` ×${m.trend.breakout.vol_ratio} wol.` : ""}`, x(boI) + 4, P.y + fs(11), { anchor: "start", fill: "#22d3ee", bold: true, prio: 6 });
    }
    // ceny lokalnych szczytów i dołków (jak w MarketSmith) — w oknie, bez ostatnich niepotwierdzonych świec
    // na telefonie mniej podpisów (3 szczyty / 2 dołki), na dużym ekranie 6 / 5
    swingLabels(m.h, m.l, m.lastIdx, Math.max(2, Math.min(7, Math.round(m.n / 16))), opts.compact ? 3 : 6, opts.compact ? 2 : 5).forEach(sw => {
        if (pivotPx !== null && Math.abs(sw.price / pivotPx - 1) < 0.003) return;   // ta cena jest już podpisana jako pivot
        addLabel(sw.price.toFixed(2), x(sw.i), sw.type === "H" ? yP(sw.price) - 4 : yP(sw.price) + fs(11), { prio: 2 });
    });
    // linie trendu: opór (pomarańczowa) i wsparcie (szara), od pierwszego dotknięcia do ostatniej świecy
    (opts.hideAutoLines ? [] : m.lines).forEach(l => {
        const at = i => l.y0 + (l.y1 - l.y0) * (i - l.i0) / Math.max(1, l.i1 - l.i0);
        const i0 = Math.max(0, l.i0);
        const col = l.kind === "res" ? CHART_COLORS.res : CHART_COLORS.sup;
        const y0 = Math.min(Math.max(yP(at(i0)), P.y), P.y + P.h);
        const y1 = Math.min(Math.max(yP(at(l.i1)), P.y), P.y + P.h);
        parts.push(`<line x1="${x_(i0)}" y1="${y0}" x2="${x_(l.i1)}" y2="${y1}" stroke="${col}" stroke-width="1.6" stroke-dasharray="6 3"><title>${l.kind === "res" ? "Opór" : "Wsparcie"} (${l.touches} dotknięć)</title></line>`);
        // cena monitorowania: wartość linii na jej końcu (ostatniej świecy) — tu szukamy przebicia
        const lp = at(l.i1);
        if (Number.isFinite(lp) && lp > 0 && l.i1 >= 0) {
            const ly = Math.min(Math.max(y1 + (l.kind === "res" ? -5 : fs(12)), P.y + fs(10)), P.y + P.h - 3);
            addLabel(lp.toFixed(2), Math.min(x_(l.i1), L.width - L.right - 4), ly, { anchor: "end", size: fs(11), fill: col, bold: true, prio: 7 });
        }
    });
    // maszt flagi: pogrubiony odcinek od dołka do szczytu wzrostu poprzedzającego konsolidację + podpis
    if (m.pole && m.pole.i1 > 0) {
        const p0 = Math.max(0, m.pole.i0);
        const py0 = yP(m.pole.y0 + (m.pole.y1 - m.pole.y0) * (p0 - m.pole.i0) / Math.max(1, m.pole.i1 - m.pole.i0));
        parts.push(`<line x1="${x(p0)}" y1="${py0}" x2="${x(m.pole.i1)}" y2="${yP(m.pole.y1)}" stroke="${CHART_COLORS.res}" stroke-width="3" stroke-opacity="0.35" stroke-linecap="round"><title>Maszt +${m.pole.gain}%</title></line>`);
        addLabel(`maszt +${m.pole.gain}%`, x(m.pole.i1) - 6, yP(m.pole.y1) - 4, { anchor: "end", size: fs(11), fill: CHART_COLORS.res, bold: true, prio: 5 });
    }
    if (m.trend && m.trend.state === "wybicie" && m.lastShown !== false && Number.isFinite(m.h[m.lastIdx])) {
        const bx = x_(m.lastIdx), by = yP(m.h[m.lastIdx]) - 8;
        parts.push(`<path d="M${bx - 6},${by - 10} L${bx + 6},${by - 10} L${bx},${by} Z" fill="${CHART_COLORS.res}"><title>Wybicie z linii trendu</title></path>`);
    }
    // cena celu analityków: pionowy zakres low–high z kropką na średniej i kropkowaną linią średniej do prawej krawędzi
    if (est && est.pt && est.pt.mean && Number.isFinite(m.c[m.lastIdx])) {
        const xr = L.width - L.right - 12, last = m.c[m.lastIdx];
        const yMean = yP(clipT(est.pt.mean)), yHi = yP(clipT(est.pt.high)), yLo = yP(clipT(est.pt.low));
        const up = (est.pt.mean / last - 1) * 100;
        const col = EST_COLORS.pt;
        parts.push(`<line x1="${x_(m.lastIdx)}" x2="${xr}" y1="${yMean}" y2="${yMean}" stroke="${col}" stroke-width="1.2" stroke-dasharray="2 4"/>`);
        parts.push(`<line x1="${xr}" x2="${xr}" y1="${yHi}" y2="${yLo}" stroke="${col}" stroke-width="2.5"/>`);
        [yHi, yLo].forEach(yy => parts.push(`<line x1="${xr - 5}" x2="${xr + 5}" y1="${yy}" y2="${yy}" stroke="${col}" stroke-width="2"/>`));
        parts.push(`<circle cx="${xr}" cy="${yMean}" r="${opts.compact ? 4.5 : 4}" fill="${col}"><title>Cena celu analityków: śr. $${est.pt.mean}, zakres $${est.pt.low}–$${est.pt.high}</title></circle>`);
        const lab = (yy, t, bold) => `<text x="${xr - 9}" y="${yy + 4}" text-anchor="end" font-size="${fs(10)}" fill="${col}"${bold ? ' font-weight="700"' : ""} stroke="#0e0f13" stroke-width="3" paint-order="stroke">${t}</text>`;
        parts.push(lab(yHi, (clipT(est.pt.high) < est.pt.high ? "↑ $" : "$") + est.pt.high), lab(yMean, `śr. $${est.pt.mean} (${up >= 0 ? "+" : ""}${up.toFixed(0)}%)`, true), lab(yLo, (clipT(est.pt.low) > est.pt.low ? "↓ $" : "$") + est.pt.low));
    }
    // linia RS w dolnej ~1/3 panelu (własna skala — liczy się kształt/kierunek, nie wartość)
    const rExt = numericExtent([m.rs]);
    if (rExt) {
        const yR = makeYScale(rExt[0], rExt[1], P.y + P.h * 0.68, P.h * 0.3);
        parts.push(polyline(m.rs.map((v, i) => Number.isFinite(v) ? [x(i), yR(v)] : null), CHART_COLORS.rs, 1.6));
        // RS Rating (1–99) na końcu linii RS, jak w MarketSmith — tylko na wykresie tygodniowym
        if (!m.daily && m.rsRating != null) {
            let li = -1;
            m.rs.forEach((v, i) => { if (Number.isFinite(v)) li = i; });
            if (li >= 0) {
                const ex = x(li), ey = yR(m.rs[li]), room = L.width - L.right - ex > fs(44);
                parts.push(`<circle cx="${ex}" cy="${ey}" r="3.2" fill="${CHART_COLORS.rs}"/>`);
                addLabel(`RS ${m.rsRating}`, room ? ex + 7 : ex - 4, room ? ey + 4 : ey - 8, { anchor: room ? "start" : "end", size: fs(12), fill: CHART_COLORS.rs, bold: true, prio: 9, title: `RS Rating ${m.rsRating} (1–99, percentyl siły względnej wśród spółek z listy)` });
            }
        }
        m.rsNewHigh.forEach((flag, i) => {
            if (!flag) return;
            const leads = m.pxNewHigh && !m.pxNewHigh[i];   // RS na maksimum, a cena jeszcze nie — najcenniejszy sygnał
            parts.push(`<circle cx="${x(i)}" cy="${yR(m.rs[i])}" r="${(opts.compact ? 3.2 : 2.6) + (leads ? 1.6 : 0)}" fill="${CHART_COLORS.rs}"${leads ? ` stroke="#fff" stroke-width="1.2"` : ""}><title>${leads ? "RS na maksimum 52 tyg., cena jeszcze nie (RS przed ceną)" : "RS na maksimum 52 tyg."}</title></circle>`);
        });
    }
    // linia zysków (EPS za 4 kwartały, TTM) NA wykresie cen — własna skala po prawej jak linia RS; kółka w tygodniach raportów, przerywany odcinek = prognoza
    const ttmPts = m.eps.filter(q => Number.isFinite(q.t));
    if (ttmPts.length >= 2) {
        const nx = m.epsNext && Number.isFinite(m.epsNext.t) ? m.epsNext : null;
        const nxIdx = nx ? dateToIndex(m.weeks, nx.d) : null;
        const tv = ttmPts.map(q => q.t).concat(nx ? [nx.t] : []);
        const tlo = Math.min(...tv), thi = Math.max(...tv), tpad = (thi - tlo || Math.abs(thi) || 1) * 0.12;
        const yE = makeYScale(tlo - tpad, thi + tpad, P.y + P.h * 0.1, P.h * 0.8);
        const pts = ttmPts.map(q => [x(q.week), yE(q.t)]);
        const ec = CHART_COLORS.eps, r = opts.compact ? 4.4 : 3.6;
        parts.push(polyline(pts, "#0e0f13", 4.2).replace("<polyline", `<polyline ${clipAttr} opacity="0.6"`));
        parts.push(polyline(pts, ec, 2.2).replace("<polyline", `<polyline ${clipAttr}`));
        ttmPts.forEach((q, k) => parts.push(`<circle cx="${pts[k][0]}" cy="${pts[k][1]}" r="${r}" fill="${ec}" stroke="#0e0f13" stroke-width="1"><title>${q.d}: EPS za 4 kwartały ${q.t} (kwartał ${q.e}${Number.isFinite(q.g) ? `, ${q.g >= 0 ? "+" : ""}${q.g}% r/r` : ""})</title></circle>`));
        const lp = pts[pts.length - 1];
        const edge = L.width - L.right;
        let labelX = Math.min(lp[0], edge - 4), anchor = lp[0] > edge - fs(60) ? "end" : "middle";
        if (nx) {
            const nxX = Math.min(x(nxIdx), edge - 6), nxY = yE(nx.t), inside = nxIdx <= m.n - 0.5;
            parts.push(`<line ${clipAttr} x1="${lp[0]}" y1="${lp[1]}" x2="${nxX}" y2="${nxY}" stroke="${ec}" stroke-width="2.2" stroke-dasharray="4 3"/>`);
            parts.push(inside
                ? `<circle cx="${nxX}" cy="${nxY}" r="${r}" fill="#0e0f13" stroke="${ec}" stroke-width="1.8"><title>Prognoza następnego raportu ${nx.d}: EPS ${nx.e}, TTM ${nx.t}</title></circle>`
                : `<path d="M${nxX - 1},${nxY - 5} L${nxX + 6},${nxY} L${nxX - 1},${nxY + 5} Z" fill="${ec}"><title>Następny raport ${nx.d} (poza oknem): prognoza EPS ${nx.e}, TTM ${nx.t}</title></path>`);
            addLabel(`prog. ${nx.t}`, Math.min(nxX, edge - 4), Math.max(P.y + fs(10), nxY - fs(8)), { anchor: "end", fill: ec, bold: true, prio: 8 });
            labelX = lp[0]; anchor = "middle";
        }
        addLabel(`EPS ${ttmPts[ttmPts.length - 1].t}`, labelX, Math.min(P.y + P.h - 3, lp[1] + fs(15)), { anchor, size: fs(11), fill: ec, bold: true, prio: 8 });
    }
    // rozmieszczenie wszystkich etykiet ceny bez nakładania (telefon!) — dopiero teraz, gdy znamy wszystkie
    placeLabels(labels, { x0: L.left + 2, x1: L.width - L.right - 2, y0: P.y + 2, y1: P.y + P.h - 2 }, fixedLabels).forEach(lb => {
        if (lb.dropped) return;
        parts.push(`<text x="${lb.x.toFixed(1)}" y="${lb.y.toFixed(1)}" font-size="${lb.size}" ${lb.bold ? 'font-weight="700"' : ""} fill="${lb.fill}" text-anchor="${lb.anchor}" stroke="#0e0f13" stroke-width="3" paint-order="stroke" pointer-events="none">${lb.title ? `<title>${escapeHtml(lb.title)}</title>` : ""}${escapeHtml(lb.text)}</text>`);
    });
    // pasek znaczników wyników pod cenami: strzałka ↑, „EPS” i zmiana r/r (zielona / czerwona) przy tygodniu raportu; przerywana strzałka = następny raport
    if (marksH) {
        const arrow = (cx, fill, stroke, title) => {
            const a = fs(8), y0 = marks.y + 3;
            return `<path d="M${cx - a * 0.6},${y0 + a} L${cx + a * 0.6},${y0 + a} L${cx},${y0} Z" fill="${fill}" stroke="${stroke}" stroke-width="1"${stroke !== "none" ? ` stroke-dasharray="2 1.5"` : ""}><title>${title}</title></path>`;
        };
        const txt = (cx, yy, t, col, bold) => `<text x="${cx}" y="${yy}" font-size="${fs(9)}" ${bold ? 'font-weight="700"' : ""} fill="${col}" text-anchor="middle" pointer-events="none">${t}</text>`;
        m.eps.forEach(q => {
            const cx = x(q.week), g = Number.isFinite(q.g);
            parts.push(arrow(cx, CHART_COLORS.textStrong, "none", `Wyniki ${q.d}: EPS ${q.e}${g ? ` (${q.g >= 0 ? "+" : ""}${q.g}% r/r)` : ""}`));
            parts.push(txt(cx, marks.y + fs(8) + fs(9) + 4, opts.compact ? `EPS ${q.e}` : "EPS", opts.compact ? CHART_COLORS.textStrong : CHART_COLORS.text, !!opts.compact));
            if (g) parts.push(txt(cx, marks.y + fs(8) + fs(9) * 2 + 5, `${q.g >= 0 ? "+" : ""}${q.g}%`, q.g >= 0 ? CHART_COLORS.up : CHART_COLORS.down, true));
        });
        const ni = m.epsNext ? dateToIndex(m.weeks, m.epsNext.d) : -1;
        if (m.epsNext && ni >= 0 && ni <= m.n - 0.5) {
            const cx = x(ni);
            parts.push(arrow(cx, "none", CHART_COLORS.textStrong, `Następny raport ${m.epsNext.d}${Number.isFinite(m.epsNext.e) ? ` (prognoza EPS ${m.epsNext.e})` : ""}`));
            parts.push(txt(cx, marks.y + fs(8) + fs(9) + 4, "EPS", CHART_COLORS.text, false));
            if (Number.isFinite(m.epsNext.e)) parts.push(txt(cx, marks.y + fs(8) + fs(9) * 2 + 5, `~${m.epsNext.e}`, CHART_COLORS.text, false));
        }
    }
    // pasek legendy nad panelem cen (osobny pas — nic nie zasłania świec)
    const smaItems = m.smas.map(x => `<tspan fill="${x.color}">— ${x.label}</tspan>`);
    const rsPart = [m.rsRating != null ? `Rating ${m.rsRating}` : null,
        Number.isFinite(m.rsChangePct) ? `${m.rsChangePct >= 0 ? "+" : ""}${m.rsChangePct.toFixed(0)}% vs S&amp;P w oknie` : null,
        m.rsLine && m.rsLine.state ? `RS ${m.rsLine.state === "przed ceną" ? "na maks. przed ceną" : "na maks. razem z ceną"}` : null].filter(Boolean);
    const otherItems = [`<tspan fill="${CHART_COLORS.rs}">— RS spółka/S&amp;P${rsPart.length ? " · " + rsPart.join(" · ") : ""}</tspan>`];
    if (ttmPts.length >= 2) otherItems.push(`<tspan fill="${CHART_COLORS.eps}">● EPS (4 kw., TTM)${m.epsNext && Number.isFinite(m.epsNext.t) ? " ┄ prognoza" : ""}</tspan>`);
    if (m.trend && m.trend.pattern) otherItems.push(`<tspan fill="${CHART_COLORS.res}">▸ ${escapeHtml(m.trend.pattern)}</tspan>`);
    if (m.trend && m.trend.state) {
        const bo = m.trend.breakout;
        const vol = bo ? ` · wolumen ×${bo.vol_ratio} śr. ${bo.confirmed ? "✓ potwierdzone" : "— bez potwierdzenia"}` : "";
        otherItems.push(`<tspan fill="${bo && !bo.confirmed ? CHART_COLORS.text : CHART_COLORS.res}" font-weight="700">${m.trend.state === "wybicie" ? "▲ wybicie z linii trendu" + vol : "przy oporze"}</tspan>`);
    }
    if (useLog) otherItems.push("skala log.");
    const legendRows = (opts.compact || L.legendRows === 2) ? [smaItems, otherItems] : [[...smaItems, ...otherItems]];
    if (!opts.hideLabels) legendRows.forEach((row, r) => {
        parts.push(`<text x="${L.left + 4}" y="${L.legend.y + fs(11) + 2 + r * fs(11) * 1.5}" font-size="${fs(11)}" fill="${CHART_COLORS.text}">${row.join("  ")}</text>`);
    });

    // --- 3. wolumen
    const vMax = Math.max(1, ...m.v.filter(Number.isFinite));
    const boIdx = m.trend && m.trend.breakout ? weekIndexForDate(m.weeks, m.trend.breakout.date) : -1;
    parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${L.volume.y - 4}" y2="${L.volume.y - 4}" stroke="${CHART_COLORS.grid}"/>`);
    for (let i = 0; i < m.n; i++) {
        if (!Number.isFinite(m.v[i])) continue;
        const col = m.c[i] >= m.o[i] ? CHART_COLORS.up : CHART_COLORS.down;
        const h = (m.v[i] / vMax) * (L.volume.h - fs(11) - 4);
        const isBreak = boIdx === i;
        parts.push(`<rect x="${x(i) - barHalf}" y="${L.volume.y + L.volume.h - h}" width="${barHalf * 2}" height="${h}" fill="${col}" opacity="0.75"${isBreak ? ` stroke="${CHART_COLORS.res}" stroke-width="1.6"` : ""}/>`);
    }
    volumeSpikes(m.v, m.volAvg, opts.compact ? 3 : 5, 1.5, Math.max(2, Math.round(m.n / 25))).forEach(sp => {
        const h = (sp.val / vMax) * (L.volume.h - fs(11) - 4);
        parts.push(`<text x="${x(sp.i)}" y="${L.volume.y + L.volume.h - h - 2}" font-size="${fs(9)}" fill="${CHART_COLORS.textStrong}" text-anchor="middle" stroke="#0e0f13" stroke-width="2.5" paint-order="stroke" pointer-events="none">${fmtVol(sp.val)}</text>`);
    });
    parts.push(polyline(m.volAvg.map((v, i) => Number.isFinite(v) ? [x(i), L.volume.y + L.volume.h - Math.min(1, v / vMax) * (L.volume.h - fs(11) - 4)] : null), CHART_COLORS.volAvg, 1.3));
    if (!opts.hideLabels) parts.push(`<text x="${L.left + 4}" y="${L.volume.y + fs(11)}" font-size="${fs(11)}" fill="${CHART_COLORS.text}">${m.daily ? "Wolumen dzienny · średnia 10 dni" : "Wolumen tygodniowy · średnia 10 tyg."}</text>`);
    parts.push(`<text x="${L.width - L.right + 6}" y="${L.volume.y + fs(10)}" font-size="${fs(10)}" fill="${CHART_COLORS.text}">${(vMax / 1000).toFixed(1)}${opts.compact ? "M" : " mln"}</text>`);

    // --- 4. EPS kwartalny
    if (L.eps.h >= 20) parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${L.eps.y - 4}" y2="${L.eps.y - 4}" stroke="${CHART_COLORS.grid}"/>`);
    const estSeries = est ? estimateSeries(est) : [];
    if (L.eps.h < 20) {
        // brak miejsca (niski ekran): bez dolnego panelu — pasek ↑ EPS pod cenami niesie zmianę r/r
    } else if (estSeries.length) {
        // tryb estymat: konsensus EPS (rok bieżący / następny) w czasie jako % zmiany względem pierwszego punktu historii —
        // dzięki temu rewizje obu lat widać na jednej skali (poziomy EPS bywają różne o rząd wielkości); w legendzie wartości bezwzględne
        const pctSeries = estSeries.map(sr => ({ ...sr, pct: sr.h.map(([d, v]) => [d, sr.h[0][1] ? (v / sr.h[0][1] - 1) * 100 : 0]) }));
        const vals = pctSeries.flatMap(sr => sr.pct.map(pt => pt[1]).concat(0));
        const lo = Math.min(...vals), hi = Math.max(...vals), padE = (hi - lo || 1) * 0.18;
        const yE = makeYScale(lo - padE, hi + padE, L.eps.y + 22, L.eps.h - 36);
        const legend = estSeries.map(sr => {
            const c90 = estimateChange(sr.h, 90);
            return `<tspan fill="${sr.color}">— EPS ${sr.label}: ${sr.h[sr.h.length - 1][1]}${c90 === null ? "" : ` (${c90 >= 0 ? "+" : ""}${c90.toFixed(0)}% / 90d)`}</tspan>`;
        }).join("  ");
        if (!opts.hideLabels) parts.push(`<text x="${L.left + 4}" y="${L.eps.y + fs(11)}" font-size="${fs(11)}" fill="${CHART_COLORS.text}" font-weight="600">Konsensus EPS (zmiana %):  ${legend}</text>`);
        parts.push(`<line x1="${L.left}" x2="${L.width - L.right}" y1="${yE(0)}" y2="${yE(0)}" stroke="${CHART_COLORS.grid}" stroke-dasharray="3 3"/>`);
        parts.push(`<text x="${L.width - L.right + 6}" y="${yE(0) + 4}" font-size="${fs(10)}" fill="${CHART_COLORS.text}">0%</text>`);
        pctSeries.forEach(sr => {
            const pts = sr.pct.map(([d, v]) => {
                const i = dateToIndex(m.weeks, d);
                return i < -0.5 || i > m.n - 0.5 ? null : [x(i), yE(v)];
            });
            parts.push(polyline(pts, sr.color, 2.2));
            const lastPt = [...pts].reverse().find(Boolean);
            if (lastPt) {
                const v = sr.pct[sr.pct.length - 1][1];
                parts.push(`<circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="3.6" fill="${sr.color}"/>`);
                parts.push(`<text x="${L.width - L.right + 6}" y="${lastPt[1] + 4}" font-size="${fs(10)}" font-weight="700" fill="${sr.color}">${v >= 0 ? "+" : ""}${v.toFixed(0)}%</text>`);
            }
        });
    } else if (m.eps.length) {
        // Dolny panel to tylko tabela kwartałów wyrównana do osi czasu (EPS $ i zmiana r/r); linia zysków jest na wykresie cen.
        const rowH = fs(13), tableY = L.eps.y + 2;
        const nextIdx = m.epsNext ? dateToIndex(m.weeks, m.epsNext.d) : null;
        if (!opts.hideLabels) {
            parts.push(`<text x="${L.width - L.right + 6}" y="${tableY + rowH - 2}" font-size="${fs(9)}" fill="${CHART_COLORS.text}">EPS $</text>`);
            parts.push(`<text x="${L.width - L.right + 6}" y="${tableY + rowH * 2 - 1}" font-size="${fs(9)}" fill="${CHART_COLORS.text}">zm. r/r</text>`);
        }
        const cell = (cx, row, t, col, bold) => `<text x="${cx}" y="${tableY + rowH * row - (row === 1 ? 2 : 1)}" font-size="${fs(11)}" ${bold ? 'font-weight="700"' : ""} fill="${col}" text-anchor="middle">${t}</text>`;
        m.eps.forEach(q => {
            const cx = x(q.week);
            parts.push(cell(cx, 1, q.e, CHART_COLORS.textStrong, false));
            if (Number.isFinite(q.g)) parts.push(cell(cx, 2, `${q.g >= 0 ? "+" : ""}${q.g}%`, q.g >= 0 ? CHART_COLORS.up : CHART_COLORS.down, true));
        });
        if (m.epsNext && nextIdx !== null && nextIdx <= m.n - 0.5 && nextIdx >= 0) {
            parts.push(cell(x(nextIdx), 1, `~${m.epsNext.e}`, CHART_COLORS.text, false));
        }
    } else {
        const ql = m.epsLast, qn = m.epsNext;
        const msg = ql
            ? `Brak raportu w oknie · ostatni ${ql.d}: EPS ${ql.e}${Number.isFinite(ql.g) ? ` (${ql.g >= 0 ? "+" : ""}${ql.g}% r/r)` : ""}${qn ? ` · następny ${qn.d}` : ""}`
            : "Brak danych o EPS kwartalnym dla tej spółki.";
        parts.push(`<text x="${L.left + 4}" y="${L.eps.y + fs(14)}" font-size="${fs(opts.compact ? 10 : 11)}" fill="${CHART_COLORS.text}">${msg}</text>`);
    }

    // --- crosshair (ustawiany w attachChartHover)
    parts.push(`<line id="chartCross" x1="0" x2="0" y1="${L.bench.y}" y2="${L.eps.y + L.eps.h}" stroke="#ffffff" stroke-width="0.8" opacity="0" pointer-events="none"/>`);
    // data wskazanej świecy na dole osi (pokazywana przy najechaniu myszką)
    parts.push(`<text id="chartCrossDate" x="0" y="${L.axisY}" font-size="${fs(12)}" font-weight="700" fill="${CHART_COLORS.textStrong}" stroke="#0e0f13" stroke-width="5" paint-order="stroke" text-anchor="middle" opacity="0" pointer-events="none"></text>`);
    if (opts.geomOut) Object.assign(opts.geomOut, { L: { ...L, price: P, marks }, step, n: m.n, x: x_, yP, pMin, pMax, useLog, fs });
    return `<svg id="chartSvg" viewBox="0 0 ${L.width} ${L.height}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Wykres ${m.daily ? "dzienny" : "tygodniowy"} ${escapeHtml(m.ticker)}">${parts.join("")}</svg>`;
}

// Opis wykrytego wzorca prostym językiem: z czego wynika (maszt, konsolidacja, wolumen, linie) i jaki jest stan wybicia.
function patternExplain(m) {
    const t = m && m.trend, info = t && t.info;
    if (!info) return "";
    const unit = m.daily ? "sesji" : "tygodni";
    const vol = Number.isFinite(info.vol_ratio)
        ? `, wolumen w konsolidacji ${info.vol_ratio}× wolumenu masztu (${info.vol_ratio <= 0.8 ? "schnie — dobry znak" : "nie schnie wyraźnie"})` : "";
    const head = info.type === "flaga"
        ? `Flaga: maszt +${info.pole_gain}% (${info.pole_start} → ${info.pole_end}), potem konsolidacja ${info.length} ${unit}, głębokość −${info.depth}%${vol}.`
        : `Korytarz poziomy: ciasna konsolidacja ${info.length} ${unit}, głębokość −${info.depth}%.`;
    const lines = " Linia oporu przez szczyty konsolidacji" + (m.lines.some(l => l.kind === "sup") ? ", linia wsparcia przez dołki." : ".");
    let tail;
    if (t.state === "wybicie") {
        const bo = t.breakout;
        tail = ` Wybicie: zamknięcie nad linią oporu${bo ? ` ${bo.date}, wolumen ×${bo.vol_ratio} średniej z 50 ${unit} — ${bo.confirmed ? "potwierdzone (≥ 1,5×)" : "bez potwierdzenia wolumenem (< 1,5×), łatwiej o fałszywe wybicie"}` : ""}.`;
    } else if (t.state === "przy oporze") {
        tail = " Cena tuż pod oporem — wybicie dopiero po zamknięciu nad linią, najlepiej z wolumenem ≥ 1,5× średniej.";
    } else {
        tail = " Brak wybicia: cena jest wewnątrz konsolidacji.";
    }
    return head + lines + tail;
}

// Tekst paska nad wykresem dla wskazanego tygodnia.
function chartReadout(m, i) {
    if (i < 0 || i >= m.n || !Number.isFinite(m.c[i])) return "";
    const rs = Number.isFinite(m.rs[i]) ? ` · RS ${m.rs[i].toFixed(3)}` : "";
    const spx = m.spx && Number.isFinite(m.spx[i]) ? ` · S&P ${fmtCompact(m.spx[i])}` : "";
    return `${m.weeks[i]} · O ${fmtCompact(m.o[i])} H ${fmtCompact(m.h[i])} L ${fmtCompact(m.l[i])} C ${fmtCompact(m.c[i])}`
        + ` · wol. ${Number.isFinite(m.v[i]) ? (m.v[i] / 1000).toFixed(1) + " mln" : "—"}${rs}${spx}`;
}

// "2026-08-13" -> "czw 13 sie 2026" (dzień tygodnia tylko na wykresie dziennym; tygodniowa świeca to tydzień kończący się tą datą)
const DAYS_PL = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];
function fmtCrossDate(d, daily) {
    if (!d) return "";
    const dow = daily ? DAYS_PL[new Date(d + "T00:00:00Z").getUTCDay()] + " " : "tydz. do ";
    return `${dow}${Number(d.slice(8, 10))} ${MONTHS_PL[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
}

function attachChartHover(container, m, readoutEl, L) {
    const svg = container.querySelector("#chartSvg");
    const cross = container.querySelector("#chartCross");
    const dateEl = container.querySelector("#chartCrossDate");
    if (!svg || !cross) return;
    const plotW = L.width - L.left - L.right;
    // nasłuch na kontenerze (a nie na svg): działa też, gdy nad wykresem leży warstwa edycji własnych linii
    container.addEventListener("mousemove", ev => {
        const rect = svg.getBoundingClientRect();
        const vx = (ev.clientX - rect.left) / rect.width * L.width;
        const i = Math.floor((vx - L.left) / plotW * m.n);
        if (i < 0 || i >= m.n) return;
        const cx = L.left + (i + 0.5) * (plotW / m.n);
        cross.setAttribute("x1", cx);
        cross.setAttribute("x2", cx);
        cross.setAttribute("opacity", "0.45");
        if (dateEl) {
            dateEl.textContent = fmtCrossDate(m.weeks[i], m.daily);
            dateEl.setAttribute("x", Math.max(L.left + 60, Math.min(L.width - L.right - 60, cx)));
            dateEl.setAttribute("opacity", "1");
        }
        readoutEl.textContent = chartReadout(m, i);
    });
    container.addEventListener("mouseleave", () => {
        cross.setAttribute("opacity", "0");
        if (dateEl) dateEl.setAttribute("opacity", "0");
        readoutEl.textContent = chartReadout(m, m.lastIdx);
    });
}

// Suwak okna czasowego (jak w TC2000): minimapa z całą historią, ramka = widoczne okno.
// Przeciągnięcie środka przesuwa okno, przeciągnięcie krawędzi zmienia jego długość.
function sliderHtml(m) {
    const finite = m.c.filter(Number.isFinite);
    const lo = Math.min(...finite), hi = Math.max(...finite), span = hi - lo || 1;
    const pts = m.c.map((v, i) => (Number.isFinite(v) ? `${(i / (m.n - 1 || 1) * 100).toFixed(2)},${(100 - (v - lo) / span * 100).toFixed(1)}` : null)).filter(Boolean).join(" ");
    return `<div class="wl-range" id="chartRange"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${CHART_COLORS.bench}" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>`
        + `<div class="wl-range-win" id="chartRangeWin" title="Przeciągnij, by przesunąć okno; krawędzie zmieniają jego długość"><span class="wl-range-h wl-range-l" data-h="l"></span><span class="wl-range-h wl-range-r" data-h="r"></span></div></div>`;
}

function attachRangeSlider(root, total, getWin, setWin) {
    const track = root.querySelector("#chartRange"), win = root.querySelector("#chartRangeWin");
    if (!track || !win) return null;
    const paint = () => {
        const w = getWin();
        win.style.left = `${(w.end - w.n) / total * 100}%`;
        win.style.width = `${w.n / total * 100}%`;
    };
    paint();
    win.addEventListener("pointerdown", ev => {
        ev.preventDefault();
        const mode = ev.target.dataset && ev.target.dataset.h ? ev.target.dataset.h : "m";
        const w0 = getWin(), x0 = ev.clientX, perPx = total / track.getBoundingClientRect().width;
        win.setPointerCapture(ev.pointerId);
        const move = e => {
            const d = Math.round((e.clientX - x0) * perPx);
            const start0 = w0.end - w0.n;
            let start = start0, end = w0.end;
            if (mode === "m") { start = Math.max(0, Math.min(total - w0.n, start0 + d)); end = start + w0.n; }
            else if (mode === "l") start = Math.max(0, Math.min(w0.end - MIN_WINDOW, start0 + d));
            else end = Math.min(total, Math.max(start0 + MIN_WINDOW, w0.end + d));
            setWin({ n: end - start, end });
            paint();
        };
        const up = () => { win.removeEventListener("pointermove", move); win.removeEventListener("pointerup", up); win.removeEventListener("pointercancel", up); };
        win.addEventListener("pointermove", move);
        win.addEventListener("pointerup", up);
        win.addEventListener("pointercancel", up);
    });
    track.addEventListener("pointerdown", ev => {
        if (ev.target !== track && ev.target.tagName !== "svg" && ev.target.tagName !== "polyline") return;
        const r = track.getBoundingClientRect(), w = getWin();
        const end = Math.max(w.n, Math.min(total, Math.round((ev.clientX - r.left) / r.width * total + w.n / 2)));
        setWin({ n: w.n, end });
        paint();
    });
    return paint;
}

// Nowe okno po szczypnięciu: długość skaluje odwrotnie do rozstawu palców, a świeca pod środkiem szczypnięcia zostaje w tym samym miejscu ekranu.
// start = { n, end, dist, frac } z początku gestu, dist = obecny rozstaw palców, frac = położenie środka w poziomie wykresu (0..1).
function pinchWindow(start, dist, total) {
    const n = Math.max(MIN_WINDOW, Math.min(total, Math.round(start.n * start.dist / Math.max(1, dist))));
    const anchor = start.end - start.n + start.frac * start.n;
    return clampWindow({ n, end: Math.round(anchor + (1 - start.frac) * n) }, total, n, total);
}

// Przesunięcie jednym palcem: przeciągnięcie w prawo cofa okno w czasie (jak w aplikacjach giełdowych).
function panWindow(start, dx, widthPx, total) {
    const perPx = start.n / Math.max(1, widthPx);
    return clampWindow({ n: start.n, end: Math.round(start.end - dx * perPx) }, total, start.n, total);
}

// Gesty dotykowe na wykresie: szczypnięcie = zoom osi czasu (długość okna), przeciągnięcie jednym palcem = przesuwanie okna. Tylko dotyk;
// enabled() = false (np. tryb rysowania linii) wyłącza gesty, bo wtedy palec rysuje / poprawia obiekty. Odświeżanie scalane w klatkę animacji.
function attachChartGestures(plot, total, getWin, setWin, enabled) {
    const ptrs = new Map();
    let pinch = null, pan = null, raf = 0, pending = null;
    const apply = w => { pending = w; if (!raf) raf = window.requestAnimationFrame(() => { raf = 0; setWin(pending); }); };
    const dist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    plot.addEventListener("pointerdown", ev => {
        if (ev.pointerType !== "touch" || !enabled()) return;
        ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        const w = getWin(), r = plot.getBoundingClientRect();
        if (ptrs.size === 2) {
            const [a, b] = [...ptrs.values()];
            pinch = { n: w.n, end: w.end, dist: dist(), frac: Math.min(1, Math.max(0, ((a.x + b.x) / 2 - r.left) / r.width)) };
            pan = null;
        } else if (ptrs.size === 1) pan = { x: ev.clientX, n: w.n, end: w.end, moved: false };
    });
    plot.addEventListener("pointermove", ev => {
        const p = ptrs.get(ev.pointerId);
        if (!p || !enabled()) return;
        p.x = ev.clientX; p.y = ev.clientY;
        if (pinch && ptrs.size === 2) { apply(pinchWindow(pinch, dist(), total)); return; }
        if (pan && ptrs.size === 1) {
            const dx = ev.clientX - pan.x;
            if (!pan.moved && Math.abs(dx) < 8) return;
            pan.moved = true;
            apply(panWindow(pan, dx, plot.getBoundingClientRect().width, total));
        }
    });
    const end = ev => {
        if (!ptrs.delete(ev.pointerId)) return;
        if (ptrs.size < 2) pinch = null;
        if (ptrs.size === 0) pan = null;
        else if (ptrs.size === 1) { const w = getWin(), q = [...ptrs.values()][0]; pan = { x: q.x, n: w.n, end: w.end, moved: true }; }   // po puszczeniu jednego palca zoom przechodzi w przesuwanie
    };
    plot.addEventListener("pointerup", end);
    plot.addEventListener("pointercancel", end);
}

// Rysuje wykres w kontenerze; zwraca model (albo null, gdy brak danych dla tickera).
// opts.window = {n, end} — okno suwaka (null = domyślne); opts.onWindow(w) — wołane po zmianie okna.
function renderStockChart(container, readoutEl, charts, ticker, stock, opts = {}) {
    const full = buildChartModel(opts.daily ? (dailyCharts(charts) || charts) : charts, ticker, stock, { pad: true });
    if (!full) {
        container.innerHTML = `<div class="empty-state">Brak danych wykresu dla ${escapeHtml(ticker)} — odśwież dane (watchlist.py).</div>`;
        readoutEl.textContent = "";
        return null;
    }
    const L = pickLayout(opts);
    const defN = defaultWindowLength(full, opts);
    const defEnd = full.n - (full.pad || 0) + (full.padDefault || 0);   // domyślnie widać tylko odrobinę pustego miejsca z prawej
    let win = clampWindow(opts.window, full.n, defN, defEnd);
    container.innerHTML = sliderHtml(full) + '<div id="chartPlot"></div>';   // suwak NAD wykresem: na iPhonie dół ekranu to gest "home"/przewijanie
    const plot = container.querySelector("#chartPlot");
    const draw = () => {
        const m = sliceModel(full, win.n, win.end);
        const geom = {};
        plot.innerHTML = chartSvg(m, { ...opts, geomOut: geom });
        readoutEl.textContent = chartReadout(m, m.lastIdx);
        attachChartHover(plot, m, readoutEl, L);
        if (opts.overlay) opts.overlay({ plot, m, geom, full, L });   // własne linie/cupy (annotate.js) — osobna warstwa nad wykresem
    };
    draw();
    const applyWin = w => {
        win = clampWindow(w, full.n, defN, defEnd);
        draw();
        if (opts.onWindow) opts.onWindow(win);
    };
    const paintSlider = attachRangeSlider(container, full.n, () => win, applyWin);
    if (opts.gestures) attachChartGestures(plot, full.n, () => win, w => { applyWin(w); if (paintSlider) paintSlider(); }, opts.gestures);
    return full;
}

// ---------- mini wykres tygodniowy (kafelki na telefonie) w stylu MarketSmith ----------
const MINI_WEEKS = 52;
const MINI_RATING_COLORS = ["#ff5c73", "#ff9a3d", "#f5d547", "#a6e04a", "#3ddc84", "#34e08a"];   // te same przedziały co .rt-0 … .rt-90, ale jaśniejsze (tekst na ciemnym tle)

function miniRatingColor(v) {
    if (!Number.isFinite(v)) return CHART_COLORS.text;
    return MINI_RATING_COLORS[v >= 90 ? 5 : v >= 80 ? 4 : v >= 60 ? 3 : v >= 40 ? 2 : v >= 20 ? 1 : 0];
}

// Mały wykres z tygodniowych danych charts.json: słupki OHLC + SMA10 (zielona) / SMA40 (czerwona), linia RS (spółka / S&P 500, niebieska)
// z numerem RS Rating na końcu, pod spodem kwartalny EPS (wartość i wzrost r/r) i oceny RS / EPS / Composite w rogu.
// src = {weeks, spx, o,h,l,c, sma10, sma40, eps:[{d,e,g}], rsRating, epsRating, compositeRating}. -> tekst SVG ("" bez danych).
function miniChartSvg(src, n = MINI_WEEKS) {
    const total = src && src.c ? src.c.length : 0;
    if (total < 10 || !src.weeks || src.weeks.length !== total) return "";
    const from = Math.max(0, total - n), cnt = total - from;
    const W = 340, H = 292, left = 4, right = 48, plotW = W - left - right, step = plotW / cnt;
    const xi = i => left + (i + 0.5) * step;
    const slice = a => (a || []).slice(from);
    const o = slice(src.o), h = slice(src.h), l = slice(src.l), c = slice(src.c), s10 = slice(src.sma10), s40 = slice(src.sma40);
    const ext = numericExtent([h, l, s10, s40]) || [0, 1];
    const pT = 26, pH = 150, yP = makeYScale(ext[0] - (ext[1] - ext[0]) * 0.04, ext[1] + (ext[1] - ext[0]) * 0.04, pT, pH);
    const parts = [];
    const poly = (vals, color, y, w = 1.2) => {
        const pts = vals.map((v, i) => (Number.isFinite(v) ? `${xi(i).toFixed(1)},${y(v).toFixed(1)}` : null)).filter(Boolean);
        return pts.length > 1 ? `<polyline fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" points="${pts.join(" ")}"/>` : "";
    };
    parts.push(poly(s40, "#f472b6", yP, 1.1), poly(s10, "#22d3ee", yP, 1.1));
    for (let i = 0; i < cnt; i++) {
        if (![o[i], h[i], l[i], c[i]].every(Number.isFinite)) continue;
        const col = c[i] >= o[i] ? CHART_COLORS.up : CHART_COLORS.down;
        parts.push(`<g stroke="${col}" stroke-width="1.5"><line x1="${xi(i)}" x2="${xi(i)}" y1="${yP(h[i])}" y2="${yP(l[i])}"/>`
            + `<line x1="${xi(i) - step * 0.45}" x2="${xi(i)}" y1="${yP(o[i])}" y2="${yP(o[i])}"/><line x1="${xi(i)}" x2="${xi(i) + step * 0.45}" y1="${yP(c[i])}" y2="${yP(c[i])}"/></g>`);
    }
    parts.push(`<text x="${W - right + 4}" y="${yP(c[cnt - 1]) + 4}" font-size="12" fill="${CHART_COLORS.textStrong}">${fmtAxis(c[cnt - 1])}</text>`);
    // linia RS (kształt: cena / S&P 500) w osobnym pasku
    const spx = slice(src.spx);
    const rs = c.map((v, i) => (Number.isFinite(v) && Number.isFinite(spx[i]) && spx[i] > 0 ? v / spx[i] : null));
    const rsExt = numericExtent([rs]);
    const rT = pT + pH + 10, rH = 46;
    if (rsExt) {
        const yR = makeYScale(rsExt[0], rsExt[1] + (rsExt[1] === rsExt[0] ? 1 : 0), rT, rH);
        parts.push(`<rect x="${left}" y="${rT - 2}" width="${plotW}" height="${rH + 4}" fill="#4aa3ff" opacity="0.06"/>`, poly(rs, CHART_COLORS.rs, yR, 1.5));
        const last = rs.length - 1 - [...rs].reverse().findIndex(Number.isFinite);
        if (Number.isFinite(src.rsRating)) {
            parts.push(`<text x="${W - right + 4}" y="${yR(rs[last]) + 3}" font-size="13" font-weight="700" fill="${miniRatingColor(src.rsRating)}">RS ${src.rsRating}</text>`);
        }
    }
    // EPS kwartalny: kropka w tygodniu publikacji, pod nią EPS i wzrost r/r
    const eT = rT + rH + 16;
    const eps = (src.eps || []).filter(q => q && q.d);
    eps.forEach(q => {
        const wk = src.weeks.findIndex(w => w >= q.d);
        if (wk < from || wk < 0) return;
        const x = xi(wk - from);
        const g = Number.isFinite(q.g) ? q.g : null;
        parts.push(`<circle cx="${x}" cy="${eT}" r="4" fill="${CHART_COLORS.eps}"/>`,
            `<text x="${Math.min(Math.max(x, left + 16), W - right - 14)}" y="${eT + 17}" font-size="12.5" text-anchor="middle" fill="${CHART_COLORS.textStrong}">${q.e}</text>`,
            g === null ? "" : `<text x="${Math.min(Math.max(x, left + 16), W - right - 14)}" y="${eT + 32}" font-size="12" font-weight="700" text-anchor="middle" fill="${g >= 0 ? CHART_COLORS.up : CHART_COLORS.down}">${g >= 0 ? "+" : ""}${g}%</text>`);
    });
    // oceny w rogu
    const badge = (x, label, v) => `<text x="${x}" y="16" font-size="13" font-weight="700" fill="${miniRatingColor(v)}">${label} ${Number.isFinite(v) ? v : "—"}</text>`;
    parts.push(badge(left, "RS", src.rsRating), badge(left + 74, "EPS", src.epsRating), badge(left + 154, "Comp", src.compositeRating));
    parts.push(`<text x="${W - right - 2}" y="16" font-size="10" text-anchor="end" fill="${CHART_COLORS.text}">${cnt} tyg.</text>`);
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Mini wykres tygodniowy">${parts.join("")}</svg>`;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        niceTicks, makeYScale, makeLogScale, logTicks, numericExtent, estimateSeries, estimateChange, estimateText, sliceModel, clampWindow, defaultWindowLength, futureDates, pickLayout, fitLayout, CHART_LAYOUT_WIDE, dailyCharts, dateToIndex, indexToDate, cupArcPoints, patternExplain, rsNewHighFlags, rollingMean, weekIndexForDate, buildChartModel, chartSvg, chartReadout, miniChartSvg, miniRatingColor, polyline, CHART_LAYOUT, pivotFromStock, swingLabels, volumeSpikes, fmtVol, placeLabels, labelBox, pinchWindow, panWindow,
    };
}
