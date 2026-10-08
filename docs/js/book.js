// ============================================================
// OPISY JAK W KSIĄŻCE O'NEILA („How to Make Money in Stocks” / „America's Greatest Stock-Picking Secrets”) na wykresie TYGODNIOWYM:
// ramki baz z liczbą tygodni („24-tyg. cup-with-handle”), punkty kupna („Kup” + przerywana linia pivotu), „ciasne zamknięcia” (elipsa),
// „Dokup” przy odbiciu od 10-tygodniowej na wolumenie, strzałki wolumenu (wzrost / wyschnięcie), łuki „Korekta rynku” przy linii S&P 500,
// „IPO”, kółka splitów („2/1”) oraz skala osi jak w książce (równe skoki % na osi logarytmicznej, lewa oś „Cena = 20×EPS”).
// Wszystko to heurystyki z progami dobranymi na oko (nie testowane wstecz) — pomoc w nauce czytania wykresu, nie sygnał transakcyjny.
// Czyste funkcje (computeBook, tightCloseRuns, marketCorrections, bookLogTicks, shiftBook, splitLabel) są testowane w tests/js/book.test.js;
// bookSvg tylko składa SVG. Plik ładowany przed chart.js.
// ============================================================

const BOOK_COLORS = { text: "#e8eaed", dim: "#aab0bd", buy: "#2ecc71", add: "#7be0a1", sell: "#ff4d6d", mkt: "#9aa3b2", vol: "#e8eaed", split: "#f0b429", ipo: "#e8eaed" };
const BOOK_TIGHT_PCT = 1.5;          // „ciasne zamknięcia”: zamknięcia kolejnych tygodni mieszczą się w tylu % (max/min)
const BOOK_TIGHT_MIN_WEEKS = 3;
const BOOK_BUY_VOL = 1.4;            // wybicie z bazy na wolumenie ≥ tyle × średnia z poprzednich tygodni (książka: +40–50 % ponad średnią)
const BOOK_BUY_MAX_EXT = 1.05;       // „Kup” tylko do +5 % nad pivotem (wyżej = za późno, bez znacznika)
const BOOK_PRIOR_UP = 1.3;           // wcześniejszy trend wzrostowy przed bazą ≥ +30 % (flat base: +20 %)
const BOOK_PRIOR_FLAT = 1.2;
const BOOK_MIN_WEEKS = { cup: 7, double_bottom: 7, flat: 5, ascending: 9, htf: 3, square_box: 4, ipo: 3 };   // minimalna długość bazy wg książki
const BOOK_HOLD_GAIN_PCT = 20;       // F: +20 % w ciągu ≤ 3 tygodni od wybicia = trzymaj co najmniej 8 tygodni (reguła 8 tygodni)
const BOOK_HOLD_FAST_WEEKS = 3;
const BOOK_HOLD_WEEKS = 8;
const BOOK_STAGE_RESET_PCT = 20;     // etap bazy zeruje korekta ≥ 20 % od szczytu
const BOOK_FLAT_MIN_WEEKS = 5;       // wybicie z dowolnej konsolidacji (nie tylko z bazy wykrytej przez detect_bases): min. tyle tygodni (3 — „schodki” w mocnym trendzie), głębokość ≤ BOOK_FLAT_DEPTH_PCT
const BOOK_FLAT_MAX_WEEKS = 10;
const BOOK_FLAT_DEPTH_PCT = 15;   // flat base: głębokość High–Low do 15 %
const BOOK_BUY_GAP = 7;              // kolejne punkty „Kup” nie częściej niż co tyle tygodni
const BOOK_REBOUND_WEEKS = 12;       // odbicie po korekcie rynku: do tylu tygodni od dołka S&P 500
const BOOK_REBOUND_DD_X = 2.5;       // ... spółka spadła w korekcie nie więcej niż tyle × spadek S&P 500
const BOOK_TIGHT_AFTER_BUY = 10;     // „ciasne zamknięcia” po kupnie: do tylu tygodni od punktu kupna
const BOOK_ADD_MIN_WEEKS = 4;        // „Dokup” = wybicie z bazy / ciasnych zamknięć trwających min. tyle tygodni (książka: 5 weeks tight, 7-week base, 8-week base)
const BOOK_ADD_AFTER_BUY = 40;       // „Dokup” tylko do tylu tygodni od wcześniejszego „Kup” (dokładamy do trwającego trendu)
const BOOK_ADD_TIGHT_PCT = 4;        // ... a zamknięcia bazy dokupu mieszczą się w ≤ tylu % (+ 0,5 % za każdy tydzień ponad minimum): to prawdziwa pauza, nie sam trend
const BOOK_ADD_VOL = 1.0;            // wolumen wybicia z bazy dokupu ≥ tyle × średnia
const BOOK_ADD_GAP = 6;              // „Dokup” nie częściej niż co tyle tygodni
const BOOK_DRY_RATIO = 0.6;          // wyschnięcie wolumenu: tydzień z wolumenem ≤ tyle × średnia
const BOOK_CORRECTION_PCT = 8;       // korekta rynku: spadek S&P 500 od szczytu o co najmniej tyle % (tygodniowe zamknięcia)
const BOOK_BASE_NAMES = { cup: "cup", double_bottom: "double bottom", flat: "flat base", ascending: "ascending base", htf: "high tight flag", square_box: "square box", ipo: "IPO base" };

// Wartość osi ceny jak w książce: 2 cyfry znaczące (100, 80, 34, 4.5, 0.35).
function bookAxisFmt(v) {
    if (!Number.isFinite(v)) return "";
    if (v >= 10) return String(Math.round(v));
    if (v >= 1) return String(Number(v.toPrecision(2)));
    return String(Number(v.toPrecision(2)));
}

// Znaczniki osi logarytmicznej jak w książce: RÓWNE odstępy (stały skok %) zamiast 1/2/5·10^n — np. 180, 155, 135, 114, 98, 84, 72 …
// Kotwica = potęga 10 nad zakresem, krok = (max/min)^(1/target) (nie mniej niż 12 %, żeby podpisy 2-cyfrowe się nie powtarzały). Zwraca rosnącą listę wartości w [min, max].
function bookLogTicks(min, max, target = 14) {
    if (!(min > 0) || !(max > min)) return [];
    const ratio = Math.max(1.12, Math.pow(max / min, 1 / Math.max(3, target)));
    let v = Math.pow(10, Math.ceil(Math.log10(max)));
    const out = [];
    while (v > max) v /= ratio;
    for (let guard = 0; v >= min && guard < 200; guard++) { out.push(v); v /= ratio; }
    return out.reverse();
}

// Serie kolejnych tygodni z zamknięciami w wąskim przedziale (≥ minWeeks tygodni, max/min ≤ 1 + tolPct %): [{i0, i1, n}].
function tightCloseRuns(c, tolPct = BOOK_TIGHT_PCT, minWeeks = BOOK_TIGHT_MIN_WEEKS) {
    const runs = [], n = c.length;
    let i = 0;
    while (i < n) {
        if (!Number.isFinite(c[i])) { i++; continue; }
        let lo = c[i], hi = c[i], j = i;
        while (j + 1 < n && Number.isFinite(c[j + 1])) {
            const nlo = Math.min(lo, c[j + 1]), nhi = Math.max(hi, c[j + 1]);
            if ((nhi / nlo - 1) * 100 > tolPct) break;
            lo = nlo; hi = nhi; j++;
        }
        if (j - i + 1 >= minWeeks) { runs.push({ i0: i, i1: j, n: j - i + 1 }); i = j + 1; } else i++;
    }
    return runs;
}

// Korekty rynku na linii S&P 500: od szczytu do dołka (spadek ≥ minDrop %), kończą się nowym szczytem albo ostatnim punktem.
function marketCorrections(spx, minDrop = BOOK_CORRECTION_PCT) {
    const out = [];
    let peakI = -1, peakV = -Infinity, troughI = -1, troughV = Infinity, active = false, lastI = -1;
    (spx || []).forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        lastI = i;
        if (v >= peakV) {
            if (active) out.push({ i0: peakI, iLow: troughI, i1: i, drop: +((1 - troughV / peakV) * 100).toFixed(1) });
            peakV = v; peakI = i; troughV = v; troughI = i; active = false;
        } else {
            if (v < troughV) { troughV = v; troughI = i; }
            if ((1 - troughV / peakV) * 100 >= minDrop) active = true;
        }
    });
    if (active) out.push({ i0: peakI, iLow: troughI, i1: lastI, drop: +((1 - troughV / peakV) * 100).toFixed(1) });
    return out;
}

// Ułamek splitu jak na wykresach książki: 2 → „2/1”, 1,5 → „3/2”, odwrotny split 0,2 → „1/5”.
function splitLabel(r) {
    if (!(r > 0) || r === 1) return "";
    const f = r > 1 ? r : 1 / r;
    for (let d = 1; d <= 5; d++) {
        const nu = f * d;
        if (Math.abs(nu - Math.round(nu)) < 1e-6) return r > 1 ? `${Math.round(nu)}/${d}` : `${d}/${Math.round(nu)}`;
    }
    return "";   // nieczytelny ułamek (np. 1,461 — zwykle rozdzielenie / odpisanie, nie klasyczny split): bez znacznika
}

const rowIdx = (arr, i) => (i >= 0 && i < arr.length ? arr[i] : null);

// Wszystkie opisy tygodniowego wykresu liczone na PEŁNYM modelu (przed obcięciem oknem). m: {n, weeks, h, l, c, v, volAvg, smas[0|1].values, spx, bases[], lastIdx}
// bases[] = [{type, i0, i1, iLow, pivot, weeks, low, handle, onBase, stage}] z indeksami świec; splits = [{i, r}], ipo = indeks pierwszej świecy.
function computeBook(m, splits = []) {
    const n = m.n, h = m.h, l = m.l, c = m.c, v = m.v, avg = m.volAvg || [];
    const sma10 = (m.smas && m.smas[0] && m.smas[0].values) || [], sma40 = (m.smas && m.smas[1] && m.smas[1].values) || [];
    const bases = m.bases || [];
    const book = { holds: [], addCands: [], brackets: [], buys: [], adds: [], tights: [], volUp: [], dry: [], corrections: [], ipo: null, splits: [] };
    // ramki baz (nie: korekta / głęboka korekta — to nie bazy do kupna)
    bases.forEach(b => {
        if (!BOOK_BASE_NAMES[b.type]) return;
        const name = b.type === "cup" ? (b.handle ? "cup-with-handle" : b.saucer ? "saucer" : "cup") : BOOK_BASE_NAMES[b.type];
        const weeks = Math.round(b.weeks || (b.i1 - b.i0));
        const label = b.type === "ascending" ? "ascending base (3 cofnięcia)" : b.type === "htf" ? "high tight flag" : `${weeks}-tyg. ${name}`;
        book.brackets.push({ i0: b.i0, i1: b.i1, low: b.low, label: label + (b.onBase ? " · base-on-base" : ""), short: b.type === "cup" ? `${weeks} tyg. ${b.handle ? "cup+rączka" : "cup"}` : `${weeks} tyg. ${name}`, type: b.type });
    });
    // Kryteria z książki (How to Make Money in Stocks): wcześniejszy trend wzrostowy ≥ +30 % (flat base ≥ +20 %), min. długość bazy (cup / double bottom 7 tyg.,
    // flat 5, ascending 9), wybicie na wolumenie ≥ +40 % ponad średnią, zakup do +5 % nad pivotem — w tygodniu wybicia cena musiała zahaczyć o strefę pivot … +5 % (Low ≤ pivot × 1,05); wybicie z luką powyżej strefy = „za późno”, bez znacznika.
    const priorGain = i0 => {   // wzrost przed bazą: szczyt bazy / najniższy Low w ciągu poprzednich 52 tygodni; za mało historii = nie odrzucamy
        if (i0 < 26) return Infinity;
        let lo = Infinity, hi = -Infinity;
        for (let k = Math.max(0, i0 - 52); k <= i0; k++) if (Number.isFinite(l[k])) lo = Math.min(lo, l[k]);
        for (let k = i0; k <= Math.min(n - 1, i0 + 3); k++) if (Number.isFinite(h[k])) hi = Math.max(hi, h[k]);
        return lo > 0 && hi > 0 ? hi / lo : Infinity;
    };
    const nearBuy = (j, gap) => book.buys.some(x => Math.abs(x.i - j) < gap);
    // punkty kupna z baz wykrytych przez detect_bases: pierwsze zamknięcie nad pivotem (poprzednie pod) na wolumenie ≥ BOOK_BUY_VOL × średnia, do +5 % nad pivotem
    bases.forEach(b => {
        if (!BOOK_BASE_NAMES[b.type] || !(b.pivot > 0)) return;
        if ((b.weeks || b.i1 - b.i0) < (BOOK_MIN_WEEKS[b.type] || 5)) return;
        if (b.type !== "htf" && priorGain(b.i0) < (b.type === "flat" ? BOOK_PRIOR_FLAT : BOOK_PRIOR_UP)) return;
        const from = Math.max(1, Math.ceil(b.i0 + Math.max(3, (b.i1 - b.i0) * 0.5)));
        for (let j = from; j <= Math.min(n - 1, Math.ceil(b.i1) + 6); j++) {
            if (!Number.isFinite(c[j]) || !Number.isFinite(c[j - 1])) continue;
            if (c[j - 1] < b.pivot && c[j] >= b.pivot) {
                const a = rowIdx(avg, j - 1);
                if (Number.isFinite(v[j]) && Number.isFinite(a) && a > 0 && v[j] / a >= BOOK_BUY_VOL && l[j] <= b.pivot * BOOK_BUY_MAX_EXT) {
                    if (!book.buys.some(x => x.i === j)) book.buys.push({ i: j, pivot: b.pivot, label: "Kup", src: "base" });
                }
                break;
            }
        }
    });
    // wybicie z konsolidacji spoza detect_bases: (a) flat base z książki — ≥ 5 tygodni, głębokość High–Low ≤ 15 %, po wzroście ≥ +20 %, wolumen ≥ 1,4× → „Kup”;
    // (b) mała baza / ciasne zamknięcia ≥ 4 tygodnie (schodki w mocnym trendzie) → tylko kandydat na „Dokup” (patrz niżej)
    for (let j = 12; j < n; j++) {
        const a = rowIdx(avg, j - 1), s10 = sma10[j], s40 = sma40[j];
        if (![c[j], c[j - 1], v[j], a, s10, s40].every(Number.isFinite) || a <= 0) continue;
        if (!(c[j] > s40 && s10 > s40) || book.buys.some(x => x.i === j)) continue;
        const vol = v[j] / a;
        let flat = null, tight = 0, pivot = null;
        for (let len = BOOK_FLAT_MAX_WEEKS; len >= BOOK_ADD_MIN_WEEKS; len--) {
            let hi = -Infinity, lo = Infinity, cHi = -Infinity, cLo = Infinity;
            for (let k = j - len; k < j; k++) { hi = Math.max(hi, h[k]); lo = Math.min(lo, l[k]); cHi = Math.max(cHi, c[k]); cLo = Math.min(cLo, c[k]); }
            if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= 0 || !(c[j] > hi && c[j - 1] <= hi)) continue;
            if (!flat && len >= BOOK_FLAT_MIN_WEEKS && (hi - lo) / hi * 100 <= BOOK_FLAT_DEPTH_PCT && priorGain(j - len) >= BOOK_PRIOR_FLAT && l[j] <= hi * BOOK_BUY_MAX_EXT) flat = { len, hi };
            if (!tight && (cHi - cLo) / cHi * 100 <= BOOK_ADD_TIGHT_PCT + (len - BOOK_ADD_MIN_WEEKS) * 0.5) { tight = len; pivot = hi; }
        }
        if (flat && vol >= BOOK_BUY_VOL && !nearBuy(j, BOOK_BUY_GAP)) {
            book.buys.push({ i: j, pivot: flat.hi, label: "Kup", src: "flat", len: flat.len });
            if (!book.brackets.some(br => br.i0 < j - 1 && br.i1 > j - flat.len)) {   // bez nakładających się ramek
                book.brackets.push({ i0: j - flat.len, i1: j - 1, low: Math.min(...l.slice(j - flat.len, j).filter(Number.isFinite)), label: `${flat.len}-tyg. flat base`, short: `${flat.len} tyg. flat`, type: "flat" });
            }
        } else if (tight && vol >= BOOK_ADD_VOL) book.addCands.push({ i: j, pivot, len: tight, vol });
    }
    // odbicie po korekcie rynku (jak „base-on-base formed during general market correction” / „general market turns up”): w ciągu BOOK_REBOUND_WEEKS od dołka
    // S&P 500 pierwsze zamknięcie spółki z powrotem nad 10-tygodniową (nad 40-tygodniową) na wolumenie ≥ średniej; spółka w korekcie nie spadła mocniej niż 2,5× indeks
    // i jest lider: nie dalej niż 15 % od szczytu z 52 tygodni
    book.corrections = marketCorrections(m.spx);
    book.corrections.forEach(cr => {
        const dd = (() => {
            let top = -Infinity, low = Infinity;
            for (let i = Math.max(0, cr.i0 - 1); i <= Math.min(n - 1, cr.i0 + 1); i++) if (Number.isFinite(h[i])) top = Math.max(top, h[i]);
            for (let i = Math.max(0, cr.iLow - 2); i <= Math.min(n - 1, cr.iLow + 2); i++) if (Number.isFinite(l[i])) low = Math.min(low, l[i]);
            return top > 0 && Number.isFinite(low) ? (1 - low / top) * 100 : null;
        })();
        if (dd === null || dd > cr.drop * BOOK_REBOUND_DD_X) return;
        for (let j = cr.iLow + 1; j <= Math.min(n - 1, cr.iLow + BOOK_REBOUND_WEEKS); j++) {
            const a = rowIdx(avg, j - 1), s10 = sma10[j], s40 = sma40[j];
            if (![c[j], c[j - 1], v[j], a, s10, s40, sma10[j - 1]].every(Number.isFinite) || a <= 0) continue;
            if (c[j] > s10 && c[j - 1] <= sma10[j - 1] && c[j] > s40 && v[j] >= a) {
                let top52 = -Infinity;
                for (let k = Math.max(0, j - 52); k <= j; k++) if (Number.isFinite(h[k])) top52 = Math.max(top52, h[k]);
                if (!nearBuy(j, 4) && c[j] >= top52 * 0.85) book.buys.push({ i: j, pivot: null, label: "Kup po korekcie", src: "mkt" });
                break;
            }
        }
    });
    book.buys.sort((a, b) => a.i - b.i);
    // numer etapu bazy (O'Neil: bazy 1. i 2. etapu najlepsze, 3. i 4. późne — duża część zawodzi); etap zeruje korekta ≥ 20 % od szczytu między kupnami
    let stage = 0, peak = -Infinity, peakI = 0, prevI = -1;
    book.buys.forEach(bp => {
        if (prevI < 0) stage = 1;
        else {
            for (let k = prevI; k <= bp.i; k++) if (Number.isFinite(h[k]) && h[k] > peak) { peak = h[k]; peakI = k; }
            let lo = Infinity;
            for (let k = peakI; k <= bp.i; k++) if (Number.isFinite(l[k])) lo = Math.min(lo, l[k]);
            stage = lo <= peak * (1 - BOOK_STAGE_RESET_PCT / 100) ? 1 : stage + 1;
        }
        if (stage === 1) { peak = -Infinity; peakI = bp.i; }
        bp.stage = stage; bp.late = stage >= 3; prevI = bp.i;
    });
    // reguła 8 tygodni (F): po wybiciu cena rośnie o ≥ +20 % w ciągu ≤ 3 tygodni → nie sprzedawaj wcześniej niż po 8 tygodniach od zakupu
    book.buys.forEach(bp => {
        const base = bp.pivot > 0 ? bp.pivot : c[bp.i];
        if (!(base > 0)) return;
        for (let j = bp.i; j <= Math.min(n - 1, bp.i + BOOK_HOLD_FAST_WEEKS); j++) {
            if (Number.isFinite(c[j]) && c[j] >= base * (1 + BOOK_HOLD_GAIN_PCT / 100)) {
                book.holds.push({ i0: bp.i, i1: Math.min(n - 1, bp.i + BOOK_HOLD_WEEKS), iHit: j, weeks: BOOK_HOLD_WEEKS });
                break;
            }
        }
    });
    // „Dokup” (jak „Add” w książce: Amgen „5 weeks tight”, Healthcare Compare „8-week base and bounce back above 10-week on volume”, US Surgical „base-on-base”):
    // wybicie z małej bazy / ciasnych zamknięć ≥ BOOK_ADD_MIN_WEEKS tygodni, do BOOK_ADD_AFTER_BUY tygodni po wcześniejszym „Kup”, na wolumenie ≥ BOOK_ADD_VOL × średnia,
    // ≥ BOOK_ADD_GAP tygodni od poprzedniego dokupu. Bez wcześniejszego „Kup” kandydat odpada (dokładamy tylko do trwającej pozycji).
    let lastAdd = -99;
    book.addCands.forEach(cd => {
        const prev = book.buys.filter(x => x.i < cd.i).pop();
        if (!prev || cd.i - prev.i > BOOK_ADD_AFTER_BUY || cd.i - prev.i <= BOOK_ADD_MIN_WEEKS || cd.i - lastAdd < BOOK_ADD_GAP || book.buys.some(x => x.i === cd.i)) return;
        book.adds.push({ i: cd.i, label: "Dokup" }); lastAdd = cd.i;
    });
    // „Dokup” po odbiciu od 10-tygodniowej (jak „Add: bounces off 10-week moving average line on volume” w książce): trend wzrostowy (40-tygodniowa rośnie, 10 > 40,
    // cena nad obiema), dołek tygodnia przy linii (≤ +4 %), poprzedni tydzień przy niej, ten w górę na rosnącym wolumenie — TYLKO do BOOK_ADD_AFTER_BUY tygodni po
    // sygnale „Kup” z patternu (baza / flaga / konsolidacja; „Kup po korekcie” nie liczy się)
    const patBuys = book.buys.filter(x => x.label === "Kup");
    for (let i = 12; i < n; i++) {
        const s10 = sma10[i], s40 = sma40[i];
        if (![s10, s40, sma10[i - 1], sma10[i - 3], sma40[i - 4], h[i], l[i], c[i], c[i - 1], v[i], v[i - 1]].every(Number.isFinite)) continue;
        if (!(s40 > sma40[i - 4]) || book.buys.some(x => x.i === i) || book.adds.some(x => Math.abs(x.i - i) < BOOK_ADD_GAP)) continue;
        if (!(c[i] > s10 && c[i] > s40 && s10 > sma10[i - 3] && s10 > s40)) continue;
        if (!patBuys.some(x => i - x.i > 0 && i - x.i <= BOOK_ADD_AFTER_BUY)) continue;
        if (l[i] <= s10 * 1.04 && c[i - 1] <= sma10[i - 1] * 1.03 && c[i] >= c[i - 1] && v[i] > v[i - 1]) book.adds.push({ i, label: "Dokup" });
    }
    book.adds.sort((a, b) => a.i - b.i);
    // ciasne zamknięcia: tylko w trendzie wzrostowym (nad 10- i 40-tygodniową) i tam, gdzie mają znaczenie dla kupna — w bazie (albo tuż po niej)
    // lub do BOOK_TIGHT_AFTER_BUY tygodni po kupnie (jak w książce: „4 tight closes” przy punkcie kupna / po nim)
    tightCloseRuns(c).forEach(r => {
        const s10 = sma10[r.i1], s40 = sma40[r.i1];
        if (r.i0 < 10 || !Number.isFinite(s10) || !Number.isFinite(s40) || !(c[r.i1] > s40)) return;
        const inBase = bases.some(b => BOOK_BASE_NAMES[b.type] && r.i0 >= b.i0 - 1 && r.i1 <= b.i1 + 2);
        const afterBuy = book.buys.some(x => r.i0 >= x.i - 3 && r.i0 <= x.i + BOOK_TIGHT_AFTER_BUY);
        if (!inBase && !afterBuy) return;
        let lo = Infinity, hi = -Infinity;
        for (let i = r.i0; i <= r.i1; i++) { lo = Math.min(lo, l[i]); hi = Math.max(hi, h[i]); }
        book.tights.push({ i0: r.i0, i1: r.i1, lo, hi, label: `${r.n} tyg. ciasne zamknięcia` });
    });
    // strzałki wolumenu: „wolumen ↑” w tygodniu kupna / dokupu, „wyschnięcie” w bazie (najcichszy tydzień ≤ BOOK_DRY_RATIO × średnia)
    [...book.buys, ...book.adds].forEach(x => {
        const a = rowIdx(avg, x.i - 1);
        if (Number.isFinite(v[x.i]) && Number.isFinite(a) && a > 0 && v[x.i] / a >= 1.2) book.volUp.push({ i: x.i, label: "Wolumen ↑" });
    });
    bases.filter(b => BOOK_BASE_NAMES[b.type]).slice(-4).forEach(b => {
        let best = null;
        for (let i = Math.max(0, Math.ceil(b.i0) + 2); i <= Math.min(n - 1, Math.floor(b.i1)); i++) {
            const a = rowIdx(avg, i);
            if (!Number.isFinite(v[i]) || !Number.isFinite(a) || a <= 0) continue;
            const r = v[i] / a;
            if (r <= BOOK_DRY_RATIO && (!best || r < best.r)) best = { i, r };
        }
        if (best) book.dry.push({ i: best.i, label: "Wyschnięcie" });
    });
    const first = c.findIndex(Number.isFinite);
    if (first >= 2 && first < n - 8) book.ipo = { i: first };   // spółka weszła na giełdę w oknie wykresu (pierwsze tygodnie bez notowań)
    book.splits = (splits || []).filter(s => Number.isFinite(s.i) && splitLabel(s.r)).map(s => ({ i: s.i, label: splitLabel(s.r), up: s.r > 1 }));
    return book;
}

// Przesunięcie opisów po obcięciu modelu oknem (sliceModel): indeksy − off, elementy poza oknem [0, n) odpadają.
function shiftBook(book, off, n) {
    if (!book) return null;
    const pt = arr => arr.map(x => ({ ...x, i: x.i - off })).filter(x => x.i >= 0 && x.i < n);
    const rg = arr => arr.map(x => ({ ...x, i0: x.i0 - off, i1: x.i1 - off, ...(x.iLow !== undefined ? { iLow: x.iLow - off } : {}) })).filter(x => x.i1 >= 0 && x.i0 < n);
    return {
        holds: book.holds.map(x => ({ ...x, i0: x.i0 - off, i1: x.i1 - off, iHit: x.iHit - off })).filter(x => x.i1 >= 0 && x.i0 < n), brackets: rg(book.brackets), buys: pt(book.buys), adds: pt(book.adds), tights: rg(book.tights), volUp: pt(book.volUp), dry: pt(book.dry),
        corrections: rg(book.corrections), ipo: book.ipo && book.ipo.i - off >= 0 && book.ipo.i - off < n ? { i: book.ipo.i - off } : null, splits: pt(book.splits),
    };
}

// SVG opisów (wszystko pointer-events: none). g = {x, yP, yS, P, L, fs, addLabel, clip, compact, step, volTop(i) -> y górnej krawędzi słupka wolumenu}.
function bookSvg(m, g) {
    const bk = m.book;
    if (!bk) return "";
    const { x, yP, P, fs, addLabel, clip, compact } = g;
    const out = [];
    const inY = y => Math.max(P.y + fs(8), Math.min(P.y + P.h - fs(4), y));
    const arrow = (x0, y0, x1, y1, col, w = 1.6) => {
        const a = Math.atan2(y1 - y0, x1 - x0), s = fs(5.5);
        const p1 = [x1 - s * Math.cos(a - 0.45), y1 - s * Math.sin(a - 0.45)], p2 = [x1 - s * Math.cos(a + 0.45), y1 - s * Math.sin(a + 0.45)];
        return `<g pointer-events="none"><line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${col}" stroke-width="${w}"/>`
            + `<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}" fill="${col}"/></g>`;
    };
    // ramki baz: pozioma kreska pod najniższym punktem z krótkimi zakończeniami + podpis „N-tyg. nazwa”
    bk.brackets.forEach(b => {
        const x0 = x(Math.max(0, b.i0)), x1 = x(Math.min(m.n - 1, b.i1)), y = inY(yP(b.low) + fs(9));
        out.push(`<g ${clip} pointer-events="none" stroke="${BOOK_COLORS.text}" stroke-width="1.2" opacity="0.85"><line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/><line x1="${x0}" x2="${x0}" y1="${y - fs(3)}" y2="${y + fs(3)}"/><line x1="${x1}" x2="${x1}" y1="${y - fs(3)}" y2="${y + fs(3)}"/></g>`);
        addLabel(compact ? b.short : b.label, (x0 + x1) / 2, Math.min(P.y + P.h - 3, y + fs(13)), { size: fs(10.5), fill: BOOK_COLORS.text, prio: 6, title: `Baza wg O'Neila: ${b.label}` });
    });
    // punkt kupna: przerywana linia pivotu tuż przed wybiciem + strzałka „Kup” z lewej góry
    bk.buys.forEach(b => {
        const px = x(b.i), py = yP(b.pivot || m.c[b.i]);
        if (b.pivot) out.push(`<line ${clip} x1="${x(Math.max(0, b.i - 6))}" x2="${px}" y1="${py}" y2="${py}" stroke="${BOOK_COLORS.text}" stroke-width="1.3" stroke-dasharray="3 2" pointer-events="none"/>`);
        out.push(arrow(px - fs(26), inY(py - fs(26)), px - fs(3), py - fs(3), b.late ? BOOK_COLORS.dim : BOOK_COLORS.buy));
        addLabel(b.label + (b.stage >= 2 ? (compact ? ` ${b.stage}.` : ` · ${b.stage}. etap${b.late ? " ⚠" : ""}`) : ""), px - fs(28), inY(py - fs(30)), { anchor: "end", size: fs(11.5), fill: b.late ? BOOK_COLORS.dim : BOOK_COLORS.buy, bold: true, prio: 8, title: b.pivot ? "Zamknięcie nad szczytem konsolidacji / pivotem bazy na podwyższonym wolumenie (kupno do +5 % nad pivotem)" : "Pierwsze zamknięcie nad 10-tygodniową po korekcie rynku — spółka trzymała się lepiej niż indeks" });
    });
    bk.holds.forEach(hd => {   // reguła 8 tygodni: poziomy nawias nad wykresem od kupna do +8 tygodni
        const x0 = x(Math.max(0, hd.i0)), x1 = x(Math.min(m.n - 1, hd.i1)), hit = Math.min(m.n - 1, Math.max(0, hd.iHit)), y = inY(yP(m.h[hit]) - fs(16));
        out.push(`<g ${clip} pointer-events="none" stroke="${BOOK_COLORS.add}" stroke-width="1.4"><line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/><line x1="${x0}" x2="${x0}" y1="${y}" y2="${y + fs(5)}"/><line x1="${x1}" x2="${x1}" y1="${y}" y2="${y + fs(5)}"/></g>`);
        addLabel(compact ? "8 tyg." : `Trzymaj 8 tyg. (+20 % w ≤ 3 tyg.)`, (x0 + x1) / 2, y - fs(3), { size: fs(10.5), fill: BOOK_COLORS.add, bold: true, prio: 5, title: "Reguła 8 tygodni (O'Neil): akcja zyskała ≥ 20 % w ciągu 1–3 tygodni od wybicia — trzymaj ją co najmniej 8 pełnych tygodni" });
    });
    bk.adds.forEach(a => {
        const px = x(a.i), py = yP(m.h[a.i]);
        out.push(arrow(px - fs(20), inY(py - fs(24)), px - fs(2), inY(py - fs(4)), BOOK_COLORS.add, 1.3));
        addLabel("Dokup", px - fs(22), inY(py - fs(27)), { anchor: "end", size: fs(10.5), fill: BOOK_COLORS.add, bold: true, prio: 5, title: "Odbicie od 10-tygodniowej średniej na wolumenie w trwającym trendzie — miejsce na dokupienie (tylko do zysku)" });
    });
    bk.tights.forEach(t => {
        const cx = (x(t.i0) + x(t.i1)) / 2, cy = (yP(t.lo) + yP(t.hi)) / 2;
        const rx = (x(t.i1) - x(t.i0)) / 2 + fs(7), ry = Math.abs(yP(t.lo) - yP(t.hi)) / 2 + fs(5);
        out.push(`<ellipse ${clip} cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${BOOK_COLORS.text}" stroke-width="1.2" opacity="0.85" pointer-events="none"><title>${t.label}: zamknięcia w ${BOOK_TIGHT_PCT} % — kupujący trzymają akcje</title></ellipse>`);
        if (!compact) addLabel(t.label, cx, Math.min(P.y + P.h - 3, cy + ry + fs(12)), { size: fs(10), fill: BOOK_COLORS.dim, prio: 4 });
    });
    // strzałki wolumenu nad słupkami
    if (g.volTop) {
        let lastLabel = -99;
        [...bk.volUp.map(x2 => ({ ...x2, col: BOOK_COLORS.vol })), ...bk.dry.map(x2 => ({ ...x2, col: BOOK_COLORS.dim }))].sort((a, b) => a.i - b.i).forEach(vv => {
            const top = g.volTop(vv.i);
            if (!Number.isFinite(top)) return;
            const px = x(vv.i), y1 = top - fs(3), y0 = y1 - fs(15);
            out.push(arrow(px, y0, px, y1, vv.col, 1.3));
            const showLabel = vv.i - lastLabel >= 7 && px > x(0) + fs(215);   // nie nad podpisem panelu wolumenu (lewy górny róg)   // podpis tylko przy pierwszej strzałce z grupy (inaczej napisy się nakładają)
            if (showLabel) lastLabel = vv.i;
            if (!compact && showLabel) out.push(`<text x="${px}" y="${y0 - 3}" font-size="${fs(9.5)}" font-weight="700" fill="${vv.col}" text-anchor="middle" stroke="#0e0f13" stroke-width="2.5" paint-order="stroke" pointer-events="none">${vv.label}</text>`);
        });
    }
    // korekty rynku: łuk pod załamaniem linii S&P 500 + podpis
    if (g.yS) bk.corrections.forEach(cr => {
        const a = Math.max(0, cr.i0), b = Math.min(m.n - 1, cr.i1);
        if (b - a < 2) return;
        const xa = x(a), xb = x(b), yb = g.yS(m.spx[Math.max(0, Math.min(m.n - 1, cr.iLow))]) + fs(8);
        out.push(`<path ${clip} d="M${xa},${yb - fs(10)} Q${(xa + xb) / 2},${yb + fs(14)} ${xb},${yb - fs(10)}" fill="none" stroke="${BOOK_COLORS.mkt}" stroke-width="1.5" pointer-events="none"/>`);
        addLabel(compact ? "Korekta" : `Korekta rynku −${cr.drop}%`, (xa + xb) / 2, yb + fs(26), { size: fs(10), fill: BOOK_COLORS.mkt, prio: 3 });
    });
    if (bk.ipo) {
        const i = bk.ipo.i, py = yP(m.h[i]);
        addLabel("IPO ★", x(i), inY(py - fs(8)), { size: fs(11), fill: BOOK_COLORS.ipo, bold: true, prio: 7, title: "Pierwszy tydzień notowań (początek historii spółki w oknie wykresu)" });
    }
    bk.splits.forEach(s => {
        const r = fs(11), cy = P.y + P.h - r - 3, px = x(s.i);
        out.push(`<g pointer-events="none"><circle cx="${px}" cy="${cy}" r="${r}" fill="#0e0f13" stroke="${BOOK_COLORS.split}" stroke-width="1.5"/>`
            + `<text x="${px}" y="${cy + fs(3.5)}" font-size="${fs(9.5)}" font-weight="700" fill="${BOOK_COLORS.split}" text-anchor="middle">${s.label}</text>`
            + `<path d="M${px - fs(3.5)},${cy - r - fs(1.5)} L${px},${cy - r - fs(7)} L${px + fs(3.5)},${cy - r - fs(1.5)} Z" fill="${BOOK_COLORS.split}"/><title>Split ${s.label}</title></g>`);
    });
    return out.join("");
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { BOOK_COLORS, bookAxisFmt, bookLogTicks, tightCloseRuns, marketCorrections, splitLabel, computeBook, shiftBook, bookSvg };
}
