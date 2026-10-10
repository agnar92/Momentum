// ============================================================
// WIDOK DAR-CARD (Nicolas Darvas, „How I Made $2,000,000 in the Stock Market”) — alternatywny widok wykresu tygodniowego NA CENACH ZAMKNIĘCIA.
// Zamiast świec: schodkowe „pudełka”. Pudełko = góra (zamknięcie, którego przez `confirm` kolejnych tygodni nie przebito) i dół (najniższe zamknięcie po górze,
// którego przez `confirm` tygodni nie złamano). Zamknięcie NAD górą = punkt kupna i nowe, wyższe pudełko (schodek); zamknięcie POD dołem = pudełko złamane (stop).
// Czyste funkcje (darvasBoxes) są testowane w tests/js/darvas.test.js, darvasSvg tylko składa SVG. Ładowany PO chart.js (używa jego skal).
// ============================================================

if (typeof require === "function" && typeof window === "undefined") {
    Object.assign(globalThis, require("./shared.js"));
    Object.assign(globalThis, require("./chart.js"));
}

const DARVAS_CONFIRM = 3;            // tygodnie potwierdzenia góry i dołu pudełka (reguła Darvasa: 3 sesje; tu 3 tygodnie)
const DARVAS_MIN_HEIGHT_PCT = 1.5;   // pudełko niższe niż 1,5 % ceny to szum

// Pudełko z niepotwierdzonym dołkiem (cena wybiła górę szybciej niż po `confirm` tygodniach) ma confirmed=false i jest rysowane przerywaną ramką.
// Pudełka z zamknięć c (tablica, końcowe null = puste miejsce na osi): [{i0, i1, top, bottom, confirmed, outcome: "up" | "down" | "open"}], rosnąco po czasie.
function darvasBoxes(c, confirm = DARVAS_CONFIRM, bottomConfirm = confirm) {
    let n = c.length;
    while (n > 0 && !Number.isFinite(c[n - 1])) n--;
    const boxes = [];
    let i = 0;
    while (i < n) {
        // góra: zamknięcie będące najwyższym od początku szukania i nieprzebite przez `confirm` kolejnych zamknięć
        let top = null, t = -1, runMax = -Infinity;
        for (let k = i; k < n; k++) {
            if (!Number.isFinite(c[k]) || c[k] < runMax) continue;
            runMax = c[k];
            if (k + confirm < n && c.slice(k + 1, k + confirm + 1).every(v => v <= c[k])) { t = k; top = c[k]; break; }
        }
        if (t < 0) break;
        // dół: najniższe zamknięcie po górze; potwierdzony, gdy przez `confirm` tygodni go nie złamano
        let bottom = Infinity, bi = -1, confirmed = false, end = -1, outcome = "open", j = t + 1;
        for (; j < n; j++) {
            if (c[j] > top) { outcome = "up"; end = j; break; }   // przebicie góry: pudełko z niepotwierdzonym dołkiem (confirmed false) też jest schodkiem — w silnym trendzie to jedyne przerwy
            if (confirmed && c[j] < bottom) { outcome = "down"; end = j; break; }
            if (!confirmed && c[j] < bottom) { bottom = c[j]; bi = j; }
            if (!confirmed && bi >= 0 && j - bi >= bottomConfirm) confirmed = true;
        }
        if (end < 0) end = n - 1;
        if (Number.isFinite(bottom) && (top - bottom) / top * 100 >= DARVAS_MIN_HEIGHT_PCT) boxes.push({ i0: t, i1: end, top, bottom, confirmed, outcome });
        i = outcome === "open" ? n : end;
    }
    return boxes;
}

const DARVAS_STOP_PCT = 5;   // szeroko strefy ryzyka: 5 % poniżej dołu boxa; dół strefy = exit

// Ceny boxa: wejście = góra (kup po zamknięciu tygodnia nad nią), anulowanie = dolna krawędź (zamknięcie pod nią kończy box), stop loss = −stopPct % od wejścia.
function darvasBoxInfo(top, bottom, zonePct = DARVAS_STOP_PCT) {
    const r2 = v => Math.round(v * 100) / 100;
    const stop = r2(bottom * (1 - zonePct / 100)), stopPct = r2((1 - stop / top) * 100);
    return { entry: r2(top), cancel: r2(bottom), stop, stopPct, zonePct, depthPct: r2((top - bottom) / top * 100), stopAboveCancel: stop > bottom };
}

// Treść arkusza po kliknięciu boxa (HTML); state: "up" | "down" | "open" | undefined (box z wykresu świecowego)
function darvasBoxSheetHtml(info, state, confirmed) {
    const st = state === "up" ? "wybity w górę (był sygnał kupna)" : state === "down" ? "złamany w dół (anulowany)" : state === "open" ? "otwarty — czeka na wybicie" : "otwarty (baza flat)";
    return `<div class="darvas-sheet"><p class="muted small">Box ${info.cancel.toFixed(2)}–${info.entry.toFixed(2)} · głębokość ${info.depthPct}% · ${st}${confirmed === false ? " · dół jeszcze niepotwierdzony" : ""}</p>`
        + `<table class="sheet-table" style="width:100%;text-align:left"><tr><th>💚 Cena wejścia</th><td><b>${info.entry.toFixed(2)}</b><br><span class="muted small">kup, gdy tydzień zamknie się NAD górą boxa</span></td></tr>`
        + `<tr><th>⚠️ Początek strefy ryzyka</th><td><b>${info.cancel.toFixed(2)}</b><br><span class="muted small">dolna krawędź boxa; od niej w dół jest szara strefa ryzyka (potencjalny exit)</span></td></tr>`
        + `<tr><th>🛑 Exit (dół strefy ryzyka)</th><td><b>${info.stop.toFixed(2)}</b><br><span class="muted small">dół szarej strefy ryzyka = ${info.zonePct}% pod dołem boxa (${info.stopPct}% pod ceną wejścia); wyjście poniżej tej ceny = exit</span></td></tr></table>`
        + `<p class="muted small">Reguły Darvasa na tygodniowych zamknięciach; heurystyka, nie rekomendacja.</p></div>`;
}

const DARVAS_MAX_EXT_PCT = 10;     // KUP tylko do 10 % nad górą boxa (na zamknięciach tygodniowych 5 % jest za ciasne — backtest); główne potwierdzenie to wolumen
const DARVAS_BREAKOUT_VOL = 1.4;   // wolumen wybicia ≥ 1,4× średniej
const DARVAS_VOL_WEEKS = 10;
const DARVAS_START_STOP_PCT = 10;   // stop początkowy przy pierwszym wybiciu: ok. 10 % pod wejściem

// Stan akcji wg zasad DAR-CARD na ostatnim tygodniowym zamknięciu c: KUP (wybicie nad górę najwyższego boxa w tym tygodniu), TRZYMAJ (jest w najwyższym
// boxie po wcześniejszym wybiciu — wahania w boxie ignorujemy, stop pod strefą zagrożenia), SPRZEDAJ (po wyższym boxie cena spadła pod jego dno = wejście w strefę
// zagrożenia), CZEKAJ (pierwszy box, jeszcze bez wybicia), POZA (box złamany bez wcześniejszego wybicia / brak boxa — brak powodu do trzymania).
function darvasStatus(c, zonePct = DARVAS_STOP_PCT, confirm = DARVAS_CONFIRM, bottomConfirm = confirm, vol = null, maxExtPct = DARVAS_MAX_EXT_PCT) {
    const boxes = darvasBoxes(c, confirm, bottomConfirm);
    let lastReal = -1;
    c.forEach((v, i) => { if (Number.isFinite(v)) lastReal = i; });
    if (!boxes.length || lastReal < 0) return { state: "NONE", text: "brak boxa Darvasa (za mało danych)" };
    const last = boxes[boxes.length - 1], prev = boxes.length > 1 ? boxes[boxes.length - 2] : null;
    const r2 = v => Math.round(v * 100) / 100;
    const hadUp = !!(prev && prev.outcome === "up");
    const zoneFrom = r2(last.bottom), stop = r2(last.bottom * (1 - zonePct / 100));
    const base = { top: r2(last.top), bottom: zoneFrom, zoneFrom, stop };
    if (last.outcome === "up" && last.i1 === lastReal) {
        // kontrola poprawnego wybicia: GŁÓWNE potwierdzenie to wolumen ≥ 1,4× średniej z 10 tygodni (gdy go znamy), dodatkowo cena najwyżej 10 % nad górą boxa
        const over = c[lastReal] / last.top - 1;
        let vr = null;
        if (vol && Number.isFinite(vol[lastReal])) {
            const prevV = vol.slice(Math.max(0, lastReal - DARVAS_VOL_WEEKS), lastReal).filter(Number.isFinite);
            if (prevV.length >= 4) vr = vol[lastReal] / (prevV.reduce((a, b) => a + b, 0) / prevV.length);
        }
        if (vr !== null && vr < DARVAS_BREAKOUT_VOL) return { ...base, state: "NOVOL", vol_ratio: Math.round(vr * 100) / 100, text: `BEZ WOLUMENU — zamknięcie nad górą boxa ${r2(last.top)}, ale wolumen tylko ${vr.toFixed(2)}× średniej (wymagane ${DARVAS_BREAKOUT_VOL}×); niepotwierdzone` };
        if (over > maxExtPct / 100) return { ...base, state: "LATE", text: `ZA PÓŹNO — zamknięcie ${(over * 100).toFixed(1)} % nad górą boxa ${r2(last.top)} (limit ${maxExtPct} %), nie goń` };
        return { ...base, state: "BUY", stop: r2(last.top * (1 - DARVAS_START_STOP_PCT / 100)), vol_ratio: vr === null ? null : Math.round(vr * 100) / 100, text: `KUP — zamknięcie nad górą boxa ${r2(last.top)}${vr === null ? "" : ` na wolumenie ${vr.toFixed(2)}×`}; stop początkowy ok. ${DARVAS_START_STOP_PCT} % pod wejściem (${r2(last.top * (1 - DARVAS_START_STOP_PCT / 100))}), potem pod dnem kolejnych boxów` };
    }
    if (last.outcome === "down") {
        return hadUp
            ? { ...base, state: "SELL", text: `SPRZEDAJ — po wyższym boxie cena spadła pod jego dno ${zoneFrom} (strefa zagrożenia do ${stop})` }
            : { ...base, state: "OUT", text: `POZA — box złamany w dół (dno ${zoneFrom}) bez wcześniejszego wybicia; brak powodu, by trzymać` };
    }
    if (last.outcome === "up") {   // wybicie było wcześniej, nowy box jeszcze się nie uformował
        return { ...base, state: "HOLD", text: `TRZYMAJ — wybicie nad ${r2(last.top)} jest za nami, czekamy na nowy, wyższy box; stop pod dnem ostatniego boxa ${stop}` };
    }
    return hadUp
        ? { ...base, state: "HOLD", text: `TRZYMAJ — cena w najwyższym boxie ${zoneFrom}–${r2(last.top)}, wahania w nim ignorujemy; stop pod strefą zagrożenia ${stop}` }
        : { ...base, state: "WAIT", text: `CZEKAJ — pierwszy box ${zoneFrom}–${r2(last.top)}; kup po zamknięciu tygodnia nad ${r2(last.top)}` };
}

// Status przypiętego (monitorowanego) boxa względem bieżącej ceny: nad górą = wybicie, w boxie, w szarej strefie zagrożenia (5 % pod dołem), pod strefą = exit.
function darvasPinStatus(box, price, zonePct = DARVAS_STOP_PCT) {
    if (!box || !Number.isFinite(price) || !(box.top > box.bottom)) return { state: "NONE", text: "" };
    const r2 = v => Math.round(v * 100) / 100, zone = r2(box.bottom * (1 - zonePct / 100));
    if (price > box.top) return { state: "ABOVE", rank: 1, text: `wybił nad ${r2(box.top)} (+${((price / box.top - 1) * 100).toFixed(1)} %)` };
    if (price >= box.bottom) return { state: "INSIDE", rank: 2, text: `w boxie ${r2(box.bottom)}–${r2(box.top)}, do wybicia ${((box.top / price - 1) * 100).toFixed(1)} %` };
    if (price >= zone) return { state: "ZONE", rank: 0, text: `W STREFIE ZAGROŻENIA ${zone}–${r2(box.bottom)} — potencjalny exit` };
    return { state: "EXIT", rank: 0, text: `EXIT — cena ${r2(price)} poniżej strefy zagrożenia (${zone})` };
}

const DARVAS_NEW_WEEKS = 4;   // box jest „nowy”, gdy jego góra została potwierdzona w ostatnich tylu tygodniach

// Przegląd boxów Darvasa dla wszystkich spółek (podstrona „Boxy”): items = [{ticker, price, c (tyg. zamknięcia), v (wolumen)}], weeks = daty tygodni, pinned = {T: {top, bottom, start}}.
// Zwraca sekcje: pinned (monitorowane), fresh (nowe boxy), buy (wybicie potwierdzone wolumenem), check (wybicie bez wolumenu / za późno), hold, sell, wait — każdy wiersz {ticker, price, state, text, box:{top,bottom,start,i0,i1}, key}.
function darvasOverview(items, weeks, pinned = {}, newWeeks = DARVAS_NEW_WEEKS) {
    const out = { pinned: [], fresh: [], buy: [], check: [], hold: [], sell: [], wait: [] };
    const r2 = v => Math.round(v * 100) / 100;
    (items || []).forEach(it => {
        const c = it.c || [];
        let lastReal = -1;
        c.forEach((v, i) => { if (Number.isFinite(v)) lastReal = i; });
        if (lastReal < 0) return;
        const boxes = darvasBoxes(c);
        const mk = b => ({ top: r2(b.top), bottom: r2(b.bottom), start: (weeks && weeks[b.i0]) || "", i0: b.i0, i1: b.i1 });
        const pin = pinned[it.ticker];
        if (pin) {
            const st = darvasPinStatus(pin, it.price);
            if (st.state !== "NONE") out.pinned.push({ ticker: it.ticker, price: it.price, state: st.state, rank: st.rank, text: st.text, box: { ...pin, i0: -1, i1: -1 }, key: `${it.ticker}|${pin.top}|${pin.bottom}|${pin.start}` });
        }
        const ds = darvasStatus(c, undefined, undefined, undefined, it.v);
        const last = boxes[boxes.length - 1];
        if (ds.state !== "NONE" && last) {
            const row = { ticker: it.ticker, price: it.price, state: ds.state, text: ds.text, box: mk(last), key: `${it.ticker}|${r2(last.top)}|${r2(last.bottom)}|${(weeks && weeks[last.i0]) || ""}` };
            const section = { BUY: "buy", NOVOL: "check", LATE: "check", HOLD: "hold", SELL: "sell", OUT: "sell", WAIT: "wait" }[ds.state];
            if (section) out[section].push(row);
        }
        // nowe boxy: góra potwierdzona (i0 + potwierdzenie) w ostatnich `newWeeks` tygodniach
        const fresh = boxes.filter(b => { const born = b.i0 + DARVAS_CONFIRM; return born <= lastReal && born >= lastReal - (newWeeks - 1); }).pop();
        if (fresh) out.fresh.push({ ticker: it.ticker, price: it.price, state: fresh.outcome === "up" ? "ABOVE" : fresh.outcome === "down" ? "EXIT" : "INSIDE", text: `box ${r2(fresh.bottom)}–${r2(fresh.top)} od ${(weeks && weeks[fresh.i0]) || "?"}${fresh.outcome === "up" ? " — już wybity w górę" : fresh.outcome === "down" ? " — złamany w dół" : ""}`, box: mk(fresh), key: `${it.ticker}|${r2(fresh.top)}|${r2(fresh.bottom)}|${(weeks && weeks[fresh.i0]) || ""}` });
    });
    out.pinned.sort((a, b) => a.rank - b.rank || a.ticker.localeCompare(b.ticker));
    ["fresh", "buy", "check", "hold", "sell", "wait"].forEach(k => out[k].sort((a, b) => a.ticker.localeCompare(b.ticker)));
    return out;
}

// Cup & handle na samych zamknięciach (dla Dar-Card): z miseczki wykrytej przez watchlist.py (`full.cups`: i0 lewy szczyt, i1 prawy brzeg, handle {iEnd}) wyznacza kluczowe poziomy
// z zamknięć tygodniowych: lewy szczyt, dołek miski, prawy brzeg, rączkę jako mały box (góra = najwyższe, dół = najniższe zamknięcie rączki) i pivot (góra rączki; bez rączki — lewy szczyt).
const CUP_STOP_PCT = 8, CUP_BUY_MAX_PCT = 5;
// Kolory boxów wzorców na Dar-Card (strefy zagrożenia mają jeden wspólny kolor — białe kreskowanie)
const PATTERN_COLORS = { "flat base": "#3b9cff", "flaga": "#ff9f43", "korytarz": "#ffd166", "high tight flag": "#b57cff", "cup & handle": "#2ee6c5" };
function darvasCupGeometry(c, cup) {
    const n = c.length;
    if (!cup || !(cup.i1 > cup.i0)) return null;
    const fin = i => (i >= 0 && i < n && Number.isFinite(c[i]) ? c[i] : null);
    const i0 = Math.max(0, cup.i0), i1 = Math.min(cup.i1, n - 1);
    if (!(i1 > i0)) return null;
    let ib = -1, bottom = Infinity;
    for (let i = i0; i <= i1; i++) { const v = fin(i); if (v !== null && v < bottom) { bottom = v; ib = i; } }
    if (ib < 0 || ib === i0 || ib === i1) return null;
    const left = Math.max(...[i0, i0 + 1].map(fin).filter(v => v !== null)), rim = Math.max(...[i1 - 1, i1].map(fin).filter(v => v !== null));
    let handle = null;
    if (cup.handle && !cup.noHandle) {
        const he = Math.min(cup.handle.iEnd, n - 1);
        if (he > i1) {
            const hv = []; for (let i = i1; i <= he; i++) { const v = fin(i); if (v !== null) hv.push(v); }
            if (hv.length >= 2) handle = { i0: i1, i1: he, top: Math.max(...hv), bottom: Math.min(...hv) };
        }
    }
    const r2 = v => Math.round(v * 100) / 100;
    // reguły CANSLIM: kupno na pivocie (do +5 %), twardy stop −8 % od pivotu; box = pivot … dół (rączka wygasa, gdy zamknięcie spadnie pod jej dołek — jeśli rączka jest głębsza niż 8 %, dołem jest stop −8 %)
    const pv = handle ? handle.top : left, stopPx = pv * (1 - CUP_STOP_PCT / 100);
    const boxBottom = handle ? Math.max(handle.bottom, stopPx) : stopPx;
    return { stop: r2(stopPx), boxBottom: r2(boxBottom), buyMax: r2(pv * (1 + CUP_BUY_MAX_PCT / 100)), i0, ib, i1, left: r2(left), bottom: r2(bottom), rim: r2(rim), handle: handle ? { ...handle, top: r2(handle.top), bottom: r2(handle.bottom) } : null, pivot: r2(handle ? handle.top : left), depthPct: r2((left - bottom) / left * 100), noHandle: !handle };
}

// Opis stanu ostatniej miski względem ostatniego zamknięcia (do paska pod Dar-Card): czeka / wybicie.
function darvasCupStatus(c, cups) {
    let lastReal = -1;
    c.forEach((v, i) => { if (Number.isFinite(v)) lastReal = i; });
    const geoms = (cups || []).map(cp => darvasCupGeometry(c, cp)).filter(Boolean);
    if (lastReal < 0 || !geoms.length) return { state: "NONE", text: "" };
    const g = geoms[geoms.length - 1], price = c[lastReal];
    const kind = g.noHandle ? "cup bez rączki ⚠" : "cup & handle";
    const lv = `kup ${g.pivot}–${g.buyMax}, wyjście: zamknięcie pod ${g.boxBottom}, stop −8 % ${g.stop}`;
    if (price < g.boxBottom) return { state: "FAILED", text: `${kind}: zamknięcie ${price} pod dołem boxa ${g.boxBottom} — wzorzec wygasł (${lv})` };
    if (price > g.buyMax) return { state: "LATE", text: `${kind}: ${price} więcej niż 5 % nad pivotem ${g.pivot} — nie goń (${lv})` };
    if (price > g.pivot) return { state: "ABOVE", text: `${kind}: zamknięcie ${price} nad pivotem ${g.pivot} (+${((price / g.pivot - 1) * 100).toFixed(1)} %) — strefa kupna (${lv})` };
    return { state: "WAIT", text: `${kind}: pivot ${g.pivot}, do wybicia ${((g.pivot / price - 1) * 100).toFixed(1)} %, miska −${g.depthPct} % (${lv})` };
}

// Pudełka wzorców na zamknięciach dla Dar-Card: flat base (`full.box`), flaga / korytarz (linia oporu `full.lines` + maszt `full.pole`), high tight flag (`full.htf`).
// Góra = pivot (flaga: dzisiejszy poziom oporu), dół = najniższe zamknięcie. Flaga nakładająca się na flat base jest pomijana (to ten sam box).
function darvasPatternBoxes(full) {
    const out = [];
    const lastReal = full.c.reduce((a, v, i) => (Number.isFinite(v) ? i : a), -1);
    if (full.box && full.box.top > full.box.low) out.push({ name: "flat base", i0: full.box.i0, i1: full.box.i1, top: full.box.top, low: full.box.low });
    if (full.htf) out.push({ name: "high tight flag", i0: full.htf.i0, i1: full.htf.i1, top: full.htf.top, low: full.htf.low });
    const res = (full.lines || []).filter(l => l.kind === "res").pop();
    if (res && full.trend && lastReal >= 0 && Number.isFinite(res.y1)) {
        const i0 = Math.max(0, full.pole ? full.pole.i1 : res.i0);
        const cl = full.c.slice(i0, lastReal + 1).filter(Number.isFinite);
        const overlaps = out.some(p => i0 <= p.i1 && lastReal >= p.i0);
        if (!overlaps && cl.length >= 3 && res.y1 > Math.min(...cl)) out.push({ name: full.trend.pattern === "flaga" ? "flaga" : "korytarz", i0, i1: lastReal, top: Math.round(res.y1 * 100) / 100, low: Math.min(...cl) });
    }
    return out;
}

// Flat base (płaska baza / kwadratowy box wykryty przez watchlist.py, `full.box` na zamknięciach): to samo co Dar-Card — góra = pivot, dół = dołek bazy, stop −8 % od pivotu, strefa kupna do +5 %.
function darvasFlatStatus(c, box, name = "flat base") {
    let lastReal = -1;
    c.forEach((v, i) => { if (Number.isFinite(v)) lastReal = i; });
    if (!box || lastReal < 0) return { state: "NONE", text: "" };
    const price = c[lastReal], top = box.top, low = box.low, stop = Math.round(top * (1 - CUP_STOP_PCT / 100) * 100) / 100, buyMax = Math.round(top * (1 + CUP_BUY_MAX_PCT / 100) * 100) / 100;
    const lv = `kup ${top}–${buyMax}, wyjście: zamknięcie pod ${low}, stop −8 % ${stop}`;
    if (price < low) return { state: "FAILED", text: `${name}: zamknięcie ${price} pod dołem ${low} — baza wygasła (${lv})` };
    if (price > buyMax) return { state: "LATE", text: `${name}: ${price} więcej niż 5 % nad pivotem ${top} — nie goń (${lv})` };
    if (price > top) return { state: "ABOVE", text: `${name}: zamknięcie ${price} nad pivotem ${top} — strefa kupna (${lv})` };
    return { state: "WAIT", text: `${name}: pivot ${top}, do wybicia ${((top / price - 1) * 100).toFixed(1)} % (${lv})` };
}

// Widok Dar-Card dla okna wykresu: full = pełny model z chart.js (c, weeks, n, pad), win = {n, end}; opts: fit {w, h}
function darvasSvg(full, win, opts = {}) {
    const W = opts.fit ? opts.fit.w : 1000, H = opts.fit ? opts.fit.h : 710, compact = !!opts.compact;
    const fs = v => Math.round(v * (compact ? 1.25 : 1) * 10) / 10;
    const L = { left: 8, right: compact ? 46 : 60, top: 14, bottom: 26 };
    const pw = W - L.left - L.right, ph = H - L.top - L.bottom;
    const lastReal = full.c.reduce((a, v, i) => (Number.isFinite(v) ? i : a), -1);
    const start = Math.max(0, Math.min(win.end - win.n, lastReal)), endExcl = Math.max(start + 2, win.end);
    const slots = endExcl - start;
    const x = i => L.left + pw * (i - start + 0.5) / slots;
    const cupGeoms = (full.cups || []).map(cp => darvasCupGeometry(full.c, cp)).filter(Boolean);
    // opts.cupHideBoxes: boxy leżące wewnątrz miski nie są rysowane (miska je zastępuje — mniej bałaganu)
    const boxes = darvasBoxes(full.c).filter(b => b.i1 >= start && b.i0 < endExcl && !(opts.cupHideBoxes && cupGeoms.some(g => b.i0 >= g.i0 && b.i1 <= g.i1 + 1)));
    const shown = [];
    for (let i = start; i < Math.min(endExcl, lastReal + 1); i++) if (Number.isFinite(full.c[i])) shown.push(full.c[i]);
    if (shown.length < 2) return `<svg viewBox="0 0 ${W} ${H}" width="100%"><text x="20" y="30" fill="#8a8f9c" font-size="14">Za mało danych na pudełka Darvasa.</text></svg>`;
    const pin = opts.pinBox && opts.pinBox.top > opts.pinBox.bottom ? opts.pinBox : null;   // przypięty (monitorowany) box: złota obwódka do prawej krawędzi, także po wyjściu ze strefy
    const lo0 = Math.min(...shown, ...darvasPatternBoxes(full).map(p => p.top * (1 - CUP_STOP_PCT / 100)), ...boxes.map(b => b.bottom * (1 - DARVAS_STOP_PCT / 100)), ...(pin ? [pin.bottom * (1 - DARVAS_STOP_PCT / 100)] : [])), hi0 = Math.max(...shown, ...boxes.map(b => b.top), ...darvasPatternBoxes(full).map(p => p.top), ...(pin ? [pin.top] : [])), pad = (hi0 - lo0) * 0.06 || 1;
    const lo = lo0 - pad, hi = hi0 + pad;
    const y = v => L.top + ph * (1 - (v - lo) / (hi - lo));
    const out = [];
    out.push(`<defs><pattern id="darvasHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#ffffff" fill-opacity="0.22"/><line x1="0" y1="0" x2="0" y2="5" stroke="#ffffff" stroke-opacity="0.8" stroke-width="2"/></pattern></defs>`);
    // „papier w linie” jak na Dar-Card: poziome linie co tyle, ile wynosi ~1/80 zakresu; grubsze na okrągłych poziomach
    const ticks = niceTicks(lo, hi, compact ? 6 : 8);
    const step = (hi - lo) / 80;
    for (let v = Math.ceil(lo / step) * step; v < hi; v += step) out.push(`<line x1="${L.left}" x2="${W - L.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#1d212b" stroke-width="1"/>`);
    ticks.forEach(t => {
        out.push(`<line x1="${L.left}" x2="${W - L.right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#2c3140" stroke-width="1.2"/>`);
        out.push(`<text x="${W - L.right + 6}" y="${(y(t) + 4).toFixed(1)}" font-size="${fs(11)}" fill="#8a8f9c">${t}</text>`);
    });
    // osie czasu: etykiety kwartałów
    let lastKey = "";
    for (let i = start; i < Math.min(endExcl, lastReal + 1); i++) {
        const d = full.weeks && full.weeks[i];
        if (!d) continue;
        const key = d.slice(0, 7);
        if (key === lastKey) continue;
        lastKey = key;
        const mon = +d.slice(5, 7);
        if ([1, 4, 7, 10].includes(mon)) out.push(`<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="${fs(11)}" fill="#8a8f9c" text-anchor="middle">${["", "sty", "", "", "kwi", "", "", "lip", "", "", "paź"][mon]} ${d.slice(2, 4)}</text>`);
    }
    const bw = Math.max(2, pw / slots * 0.5);
    boxes.forEach(b => {
        const x0 = x(Math.max(start, b.i0)) - bw / 2, x1 = x(Math.min(endExcl - 1, Math.max(b.i1, b.i0 + 1))) + bw / 2;
        const yT = y(b.top), yB = y(b.bottom), yZ = y(b.bottom * (1 - DARVAS_STOP_PCT / 100));   // dół boxa = najniższe zamknięcie; zacieniona strefa zagrożenia leży 5 % POD nim (jak na Dar-Card)
        const col = b.outcome === "up" ? "#e8eaed" : b.outcome === "down" ? "#ff8a8a" : "#f4f6fa";
        const state = b.outcome === "up" ? "wybite w górę" : b.outcome === "down" ? "złamane w dół" : "otwarte";
        // sam box, bez linii i podpisów: kliknięcie / dotknięcie pokazuje ceny wejścia, anulowania i stop lossa (data-box → arkusz w watchlist.js)
        out.push(`<rect class="box-hit" data-box="${b.top}|${b.bottom}|${b.outcome}|${b.confirmed ? 1 : 0}|${b.i0}|${b.i1}" style="cursor:pointer" x="${x0.toFixed(1)}" y="${yT.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(yB - yT).toFixed(1)}" fill="${col}" fill-opacity="0.92" stroke="#ffffff" stroke-width="1.4"${b.confirmed ? "" : ' stroke-dasharray="3 2"'}><title>Box ${b.bottom.toFixed(2)}–${b.top.toFixed(2)} (${state}) — kliknij po ceny</title></rect>`);
        out.push(`<rect x="${x0.toFixed(1)}" y="${yB.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${Math.max(2, yZ - yB).toFixed(1)}" fill="url(#darvasHatch)" pointer-events="none"/>`);
    });
    // flat base: wyróżniona ramka bazy (niebieska, kreskowana) + pivot do prawej krawędzi, strefa kupna +5 % i stop −8 % jak przy cup & handle
    darvasPatternBoxes(full).forEach(fb => {
        if (!(fb.i1 >= start && fb.i0 < endExcl && fb.top > fb.low)) return;
        const fx0 = x(Math.max(start, fb.i0)) - bw / 2, fx1 = x(Math.min(endExcl - 1, fb.i1)) + bw / 2, fyT = y(fb.top), fyB = y(fb.low), fyS = y(fb.top * (1 - CUP_STOP_PCT / 100));
        const pcol = PATTERN_COLORS[fb.name] || "#3b9cff", fpx1 = W - L.right, fcol = full.c[lastReal] > fb.top ? "#4ee08a" : "#ffffff";
        out.push(`<rect x="${fx0.toFixed(1)}" y="${fyT.toFixed(1)}" width="${Math.max(0, fx1 - fx0).toFixed(1)}" height="${Math.max(2, fyB - fyT).toFixed(1)}" fill="${pcol}" fill-opacity="0.78" stroke="${pcol}" stroke-width="${fs(1.6)}" pointer-events="none"><title>${fb.name}: dół ${fb.low}, pivot ${fb.top}</title></rect>`);
        if (fyS - fyB > 1) out.push(`<rect x="${fx0.toFixed(1)}" y="${fyB.toFixed(1)}" width="${Math.max(0, fx1 - fx0).toFixed(1)}" height="${(fyS - fyB).toFixed(1)}" fill="url(#darvasHatch)" pointer-events="none"/>`);
        out.push(`<text x="${fx1.toFixed(1)}" y="${(fyT - 6).toFixed(1)}" font-size="${fs(12)}" font-weight="700" fill="${pcol}" text-anchor="end" stroke="#0e0f13" stroke-width="4" paint-order="stroke" pointer-events="none">${fb.name} ${fb.i1 - fb.i0 + 1} tyg.</text>`);
        out.push(`<line x1="${fx0.toFixed(1)}" x2="${fpx1}" y1="${fyT.toFixed(1)}" y2="${fyT.toFixed(1)}" stroke="${fcol}" stroke-width="1.4" stroke-dasharray="6 4" opacity="0.85" pointer-events="none"/>`);
        out.push(`<rect x="${W - L.right}" y="${(fyT - fs(7.5)).toFixed(1)}" width="${L.right - 2}" height="${fs(15)}" rx="2" fill="${fcol}" pointer-events="none"/><text x="${W - L.right + 3}" y="${(fyT + fs(4)).toFixed(1)}" font-size="${fs(10)}" font-weight="700" fill="#0e0f13" pointer-events="none">${fb.top.toFixed(2)}</text>`);
        out.push(`<rect x="${W - L.right}" y="${(fyS - fs(7.5)).toFixed(1)}" width="${L.right - 2}" height="${fs(15)}" rx="2" fill="#ff6b6b" pointer-events="none"/><text x="${W - L.right + 3}" y="${(fyS + fs(4)).toFixed(1)}" font-size="${fs(10)}" font-weight="700" fill="#0e0f13" pointer-events="none">${(fb.top * (1 - CUP_STOP_PCT / 100)).toFixed(2)}</text>`);
    });
    // cup & handle na zamknięciach: miska jako gładka krzywa przez lewy szczyt – dołek – prawy brzeg, rączka jako mały box, pivot = góra rączki (bez rączki: lewy szczyt)
    (full.cups || []).forEach(cp => {
        const g = darvasCupGeometry(full.c, cp);
        if (!g || g.i1 < start || g.i0 >= endExcl) return;
        const pts = [];
        for (let t = g.i0; t <= g.i1 + 1e-9; t += 0.25) {
            const v = t <= g.ib ? g.bottom + (g.left - g.bottom) * Math.pow((g.ib - t) / (g.ib - g.i0), 2) : g.bottom + (g.rim - g.bottom) * Math.pow((t - g.ib) / (g.i1 - g.ib), 2);
            pts.push([x(t), y(v)]);
        }
        const cupPoly = pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
        // rączka = dalszy ciąg tej samej krzywej (mała zatoka za prawym brzegiem), nie osobny box
        if (g.handle && g.handle.i1 > g.i1) {
            for (let t = g.i1 + 0.25; t <= g.handle.i1 + 1e-9; t += 0.25) {
                const u = (t - g.i1) / (g.handle.i1 - g.i1);
                pts.push([x(t), y(g.rim - (g.rim - g.handle.bottom) * Math.sin(Math.PI * u))]);
            }
        }
        const poly = pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
        const style = opts.cupStyle || "pivotbox";
        const label = `${g.noHandle ? "cup ⚠" : "cup"} −${g.depthPct}%`;
        const title = `<title>${g.noHandle ? "Cup bez rączki (ryzykowny)" : "Cup & handle"}: miska −${g.depthPct} %, pivot ${g.pivot}</title>`;
        const lblY = y(g.bottom) + fs(15);
        const closeP = `${poly} ${x(g.i0).toFixed(1)},${y(g.left).toFixed(1)}`;
        const topY = y(Math.max(g.left, g.rim)), bowlId = `cupClip${Math.round(g.i0)}`;
        const lastClose = full.c[lastReal];
        const txt = (tx, ty, t, col = "#ffffff", sz = 12) => `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${fs(sz)}" font-weight="700" fill="${col}" text-anchor="middle" stroke="#0e0f13" stroke-width="4" paint-order="stroke" pointer-events="none">${t}</text>`;
        const hatchBase = (cx, half) => `<rect x="${(cx - half).toFixed(1)}" y="${y(g.bottom).toFixed(1)}" width="${(2 * half).toFixed(1)}" height="${Math.max(2, y(g.bottom * (1 - DARVAS_STOP_PCT / 100)) - y(g.bottom)).toFixed(1)}" fill="url(#darvasHatch)" pointer-events="none"/>`;
        if (style === "pivotbox") {   // BOX PIVOTU: cienka miska dla kontekstu + box od rączki do prawej krawędzi: góra = pivot, dół = wygaśnięcie rączki / stop −8 %
            out.push(`<polyline points="${cupPoly}" fill="none" stroke="#2ee6c5" stroke-width="${fs(1.6)}" stroke-dasharray="2 4" stroke-linecap="round" pointer-events="none">${title}</polyline>`);
            const bx0 = x(g.handle ? g.handle.i0 : g.i1) - bw / 2, bx1 = W - L.right, byT = y(g.pivot), byB = y(g.boxBottom), byS = y(g.stop);
            out.push(`<rect x="${bx0.toFixed(1)}" y="${byT.toFixed(1)}" width="${Math.max(0, bx1 - bx0).toFixed(1)}" height="${Math.max(2, byB - byT).toFixed(1)}" fill="${PATTERN_COLORS["cup & handle"]}" fill-opacity="0.78" stroke="${PATTERN_COLORS["cup & handle"]}" stroke-width="1.4" pointer-events="none"><title>Box pivotu ${g.boxBottom}–${g.pivot}</title></rect>`);
            if (byS - byB > 1) out.push(`<rect x="${bx0.toFixed(1)}" y="${byB.toFixed(1)}" width="${Math.max(0, bx1 - bx0).toFixed(1)}" height="${(byS - byB).toFixed(1)}" fill="url(#darvasHatch)" pointer-events="none"/>`);
            out.push(`<rect x="${W - L.right}" y="${(byS - fs(7.5)).toFixed(1)}" width="${L.right - 2}" height="${fs(15)}" rx="2" fill="#ff6b6b" pointer-events="none"/><text x="${W - L.right + 3}" y="${(byS + fs(4)).toFixed(1)}" font-size="${fs(10)}" font-weight="700" fill="#0e0f13" pointer-events="none">${g.stop.toFixed(2)}</text>`);
            out.push(txt(x(g.ib), y(g.bottom) + fs(15), label, PATTERN_COLORS["cup & handle"]));
        } else if (style === "mug") {   // KUBEK: biała czasza z uchem (ucho = rączka) i kreskowaną podstawką pod dnem
            out.push(`<polygon points="${closeP}" fill="#ffffff" fill-opacity="0.22" stroke="#ffffff" stroke-width="${fs(2)}" stroke-linejoin="round" pointer-events="none">${title}</polygon>`);
            if (!g.handle) {
            const ex0 = x(g.i1), ex1 = (g.handle ? x(g.handle.i1) : x(g.i1) + bw * 3) + bw / 2, ey0 = g.handle ? y(g.handle.top) : y(g.rim), ey1 = g.handle ? y(g.handle.bottom) : y(g.rim) + (y(g.bottom) - y(g.rim)) * 0.28;
            out.push(`<path d="M${ex0.toFixed(1)},${ey0.toFixed(1)} H${(ex1 - 6).toFixed(1)} Q${ex1.toFixed(1)},${ey0.toFixed(1)} ${ex1.toFixed(1)},${(ey0 + 6).toFixed(1)} V${(ey1 - 6).toFixed(1)} Q${ex1.toFixed(1)},${ey1.toFixed(1)} ${(ex1 - 6).toFixed(1)},${ey1.toFixed(1)} H${ex0.toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="${fs(3.2)}" stroke-linecap="round" pointer-events="none"/>`);
            }
            out.push(hatchBase(x(g.ib), Math.max(bw, (x(g.i1) - x(g.i0)) * 0.22)));
            out.push(txt(x(g.ib), y(g.bottom) + fs(26), label));
        } else if (style === "cutout") {   // NEGATYW: biała płyta od szczytu do dna, z wyciętym kształtem miski (miska = pusty „kielich”)
            const rx0 = x(g.i0), rx1 = x(g.i1), ry0 = topY - fs(4), ry1 = y(g.bottom) + fs(3);
            out.push(`<path d="M${rx0.toFixed(1)},${ry0.toFixed(1)} H${rx1.toFixed(1)} V${ry1.toFixed(1)} H${rx0.toFixed(1)} Z M${closeP.split(" ").map((p2, i) => (i ? "L" : "") + p2).join(" ")} Z" fill="#ffffff" fill-opacity="0.24" fill-rule="evenodd" stroke="#ffffff" stroke-width="${fs(1.4)}" pointer-events="none">${title}</path>`);
            out.push(txt(x(g.ib), y(g.bottom) + fs(15), label));
        } else if (style === "pipe") {   // PRZEWÓD: gruba biała rura przez lewy szczyt – dołek – brzeg z kołowymi węzłami i podpisami
            out.push(`<polyline points="${poly}" fill="none" stroke="#0e0f13" stroke-opacity="0.9" stroke-width="${fs(9)}" stroke-linecap="round" pointer-events="none"/>`);
            out.push(`<polyline points="${poly}" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="${fs(5)}" stroke-linecap="round" pointer-events="none">${title}</polyline>`);
            [[g.i0, g.left, "szczyt"], [g.ib, g.bottom, "dołek"], [g.i1, g.rim, "brzeg"]].forEach(([ii, vv, nm]) => {
                out.push(`<circle cx="${x(ii).toFixed(1)}" cy="${y(vv).toFixed(1)}" r="${fs(6)}" fill="#0e0f13" stroke="#ffffff" stroke-width="${fs(2.4)}" pointer-events="none"/>`);
                out.push(txt(x(ii), y(vv) + (nm === "dołek" ? fs(20) : -fs(11)), nm, "#d6e6f5", 10));
            });
            out.push(txt(x(g.ib), y(g.bottom) + fs(34), label));
        } else if (style === "glass") {   // SZKLANKA: czasza napełniona „wodą” do poziomu ostatniego zamknięcia — widać, ile miski odrobiono i ile brakuje do brzegu
            const wy = Math.min(Math.max(y(lastClose), topY), y(g.bottom));
            out.push(`<clipPath id="${bowlId}"><polygon points="${closeP}"/></clipPath>`);
            out.push(`<g clip-path="url(#${bowlId})"><rect x="${(x(g.i0) - 2).toFixed(1)}" y="${wy.toFixed(1)}" width="${(x(g.i1) - x(g.i0) + 4).toFixed(1)}" height="${(y(g.bottom) - wy + 4).toFixed(1)}" fill="#2fb4ff" fill-opacity="0.45"/><line x1="${x(g.i0).toFixed(1)}" x2="${x(g.i1).toFixed(1)}" y1="${wy.toFixed(1)}" y2="${wy.toFixed(1)}" stroke="#bfe8ff" stroke-width="${fs(1.6)}"/></g>`);
            out.push(`<polygon points="${closeP}" fill="none" stroke="#ffffff" stroke-width="${fs(2)}" stroke-linejoin="round" pointer-events="none">${title}</polygon>`);
            const fill = Math.round(Math.min(1, Math.max(0, (lastClose - g.bottom) / ((g.pivot - g.bottom) || 1))) * 100);
            out.push(txt(x(g.ib), y(g.bottom) + fs(15), `${label} · napełnienie ${fill}%`));
        } else if (style === "hatch") {   // TEKSTURA: czasza wypełniona tym samym kreskowaniem co strefa zagrożenia, bez obrysu
            out.push(`<polygon points="${closeP}" fill="url(#darvasHatch)" fill-opacity="0.8" pointer-events="none">${title}</polygon>`);
            out.push(txt(x(g.ib), y(g.bottom) + fs(15), label));
        } else if (style === "glow") {   // POŚWIATA: miękki gradient od brzegu (pivot) w dół, bez obrysu — im głębiej, tym jaśniej
            const gid = `cupGlow${Math.round(g.i0)}`;
            out.push(`<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.03"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.55"/></linearGradient></defs>`);
            out.push(`<polygon points="${closeP}" fill="url(#${gid})" pointer-events="none">${title}</polygon>`);
            out.push(txt(x(g.ib), y(g.bottom) + fs(15), label));
        } else if (style === "bowl") {   // miska jak box Dar-Card: biała półprzezroczysta czasza z białą obwódką
            out.push(`<polygon points="${poly} ${x(g.i0).toFixed(1)},${y(g.left).toFixed(1)}" fill="#ffffff" fill-opacity="0.2" stroke="#ffffff" stroke-width="${fs(2)}" stroke-linejoin="round" pointer-events="none">${title}</polygon>`);
            out.push(`<text x="${x(g.ib).toFixed(1)}" y="${(y(g.bottom) - fs(6)).toFixed(1)}" font-size="${fs(12)}" font-weight="700" fill="#ffffff" text-anchor="middle" stroke="#0e0f13" stroke-width="4" paint-order="stroke" pointer-events="none">${label}</text>`);
        } else if (style === "bracket") {   // bez krzywej: nawias nad miską z opisem (szczyt → dołek → brzeg), box rączki jak zwykły box
            const byy = y(Math.max(g.left, g.rim)) - fs(14), bx0 = x(g.i0), bx1 = x(g.i1);
            out.push(`<path d="M${bx0.toFixed(1)},${(byy + fs(7)).toFixed(1)} V${byy.toFixed(1)} H${bx1.toFixed(1)} V${(byy + fs(7)).toFixed(1)}" fill="none" stroke="#2fb4ff" stroke-width="${fs(2)}" pointer-events="none">${title}</path>`);
            out.push(`<circle cx="${x(g.ib).toFixed(1)}" cy="${y(g.bottom).toFixed(1)}" r="${fs(4)}" fill="#2fb4ff" stroke="#0e0f13" stroke-width="1.5" pointer-events="none"/>`);
            out.push(`<text x="${((bx0 + bx1) / 2).toFixed(1)}" y="${(byy - 5).toFixed(1)}" font-size="${fs(12)}" font-weight="700" fill="#7fd0ff" text-anchor="middle" stroke="#0e0f13" stroke-width="4" paint-order="stroke" pointer-events="none">${label} · ${g.i1 - g.i0} tyg.</text>`);
        } else if (style === "thin") {   // minimalnie: cienka kropkowana krzywa bez wypełnienia i bez opisu miski
            out.push(`<polyline points="${poly}" fill="none" stroke="#9adbff" stroke-width="${fs(1.6)}" stroke-dasharray="2 4" stroke-linecap="round" pointer-events="none">${title}</polyline>`);
        } else {   // "arc": gruba niebieska krzywa z ciemnym obrysem i lekkim wypełnieniem
            out.push(`<polygon points="${poly} ${x(g.i0).toFixed(1)},${y(g.left).toFixed(1)}" fill="#2fb4ff" fill-opacity="0.14" pointer-events="none"/>`);
            out.push(`<polyline points="${poly}" fill="none" stroke="#0e0f13" stroke-opacity="0.85" stroke-width="${fs(6)}" stroke-linecap="round" pointer-events="none"/>`);
            out.push(`<polyline points="${poly}" fill="none" stroke="#2fb4ff" stroke-width="${fs(3.2)}" stroke-linecap="round" pointer-events="none">${title}</polyline>`);
            out.push(`<text x="${x(g.ib).toFixed(1)}" y="${lblY.toFixed(1)}" font-size="${fs(12)}" font-weight="700" fill="#7fd0ff" text-anchor="middle" stroke="#0e0f13" stroke-width="4" paint-order="stroke" pointer-events="none">${label}</text>`);
        }
        const px1 = W - L.right;
        if (g.handle && style !== "pivotbox") {
            out.push(txt((x(g.handle.i0) + x(g.handle.i1)) / 2, y(g.handle.top) - fs(8), "rączka", "#ffffff", 10));
        }
        const pyy = y(g.pivot), lastCl = full.c[lastReal], pcol = lastCl > g.pivot ? "#4ee08a" : "#ffffff";
        out.push(`<line x1="${x(g.handle ? g.handle.i0 : g.i0).toFixed(1)}" x2="${px1}" y1="${pyy.toFixed(1)}" y2="${pyy.toFixed(1)}" stroke="${pcol}" stroke-width="1.4" stroke-dasharray="6 4" opacity="0.85" pointer-events="none"/>`);
        out.push(`<rect x="${W - L.right}" y="${(pyy - fs(7.5)).toFixed(1)}" width="${L.right - 2}" height="${fs(15)}" rx="2" fill="${pcol}" pointer-events="none"/><text x="${W - L.right + 3}" y="${(pyy + fs(4)).toFixed(1)}" font-size="${fs(10)}" font-weight="700" fill="#0e0f13" pointer-events="none">${g.pivot.toFixed(2)}</text>`);
    });
    if (pin) {
        const px0 = x(Math.max(start, Math.min(endExcl - 1, pin.i0))) - bw / 2, px1 = W - L.right;
        const pyT = y(pin.top), pyB = y(pin.bottom), pyZ = y(pin.bottom * (1 - DARVAS_STOP_PCT / 100));
        const ps = darvasPinStatus({ top: pin.top, bottom: pin.bottom }, full.c[lastReal]);
        const pcol = ps.state === "ABOVE" ? "#4ee08a" : ps.state === "INSIDE" ? "#ffd166" : "#ff6b6b";
        out.push(`<rect x="${px0.toFixed(1)}" y="${pyB.toFixed(1)}" width="${Math.max(0, px1 - px0).toFixed(1)}" height="${Math.max(2, pyZ - pyB).toFixed(1)}" fill="url(#darvasHatch)" fill-opacity="0.7" pointer-events="none"/>`);
        out.push(`<rect class="${opts.pinFlash ? "pin-flash" : ""}" x="${px0.toFixed(1)}" y="${pyT.toFixed(1)}" width="${Math.max(0, px1 - px0).toFixed(1)}" height="${(pyB - pyT).toFixed(1)}" fill="${pcol}" fill-opacity="0.08" stroke="${pcol}" stroke-width="2.4" stroke-dasharray="7 4" pointer-events="none"><title>📌 Monitorowany box ${pin.bottom}–${pin.top}: ${ps.text}</title></rect>`);
        out.push(`<text x="${(px0 + 4).toFixed(1)}" y="${Math.max(L.top + fs(11), pyT - 5).toFixed(1)}" font-size="${fs(12)}" font-weight="700" fill="${pcol}" stroke="#0e0f13" stroke-width="3" paint-order="stroke" pointer-events="none">📌 ${escapeHtml(ps.state === "ABOVE" ? "wybił" : ps.state === "INSIDE" ? "w boxie" : ps.state === "ZONE" ? "STREFA ZAGROŻENIA" : "EXIT")}</text>`);
        [[pin.top, pcol], [pin.bottom, pcol], [pin.bottom * (1 - DARVAS_STOP_PCT / 100), "#ff6b6b"]].forEach(([v, col]) => {
            const yy = y(v);
            out.push(`<rect x="${W - L.right}" y="${(yy - fs(7.5)).toFixed(1)}" width="${L.right - 2}" height="${fs(15)}" rx="2" fill="${col}" pointer-events="none"/><text x="${W - L.right + 3}" y="${(yy + fs(4)).toFixed(1)}" font-size="${fs(10)}" font-weight="700" fill="#0e0f13" pointer-events="none">${(+v).toFixed(2)}</text>`);
        });
    }
    const lastC = full.c[lastReal];
    if (lastReal >= start && lastReal < endExcl) out.push(`<circle cx="${x(lastReal).toFixed(1)}" cy="${y(lastC).toFixed(1)}" r="${fs(3.5)}" fill="#6ea8ff" stroke="#0e0f13" stroke-width="1" pointer-events="none"><title>Ostatnie zamknięcie ${lastC}</title></circle>`);
    return `<svg id="chartSvg" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Pudełka Darvasa ${escapeHtml(full.ticker || "")}">${out.join("")}</svg>`;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { darvasBoxes, darvasSvg, darvasBoxInfo, darvasBoxSheetHtml, darvasStatus, darvasPinStatus, darvasOverview, darvasCupGeometry, darvasCupStatus, darvasFlatStatus, darvasPatternBoxes, DARVAS_CONFIRM, DARVAS_STOP_PCT };
}
