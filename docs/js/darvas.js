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

const DARVAS_CONFIRM = 3;            // góra / dół = zamknięcie, którego nie przebija (nie jest niższe od) kolejne 3 tygodnie (jak w Momentum Desktop; tydzień samego szczytu NIE wlicza się do tych 3)
const DARVAS_MIN_HEIGHT_PCT = 0;   // wg książki (karta Darvasa) box nie ma minimalnej wysokości
const DARVAS_MIN_WEEKS = 0;   // wg książki box nie ma minimalnej długości (tylko 3 okresy na górę i dół); parametr zostaje w darvasScan

// Skan zamknięć c (port z Momentum Desktop, desktop/darvas.py::_scan): zwraca { boxes, lines }.
// BOX = GÓRA (zamknięcie będące lokalnym szczytem — wyższe od `confirm` poprzednich zamknięć — którego nie przebiły `confirm` KOLEJNYCH zamknięć) + DÓŁ (najniższe
// zamknięcie po górze, niezłamane przez `confirm` kolejnych zamknięć). Rysujemy tylko POTWIERDZONE boxy; góra bez potwierdzonego dołu to tylko LINIA (`lines`: przerywana
// od topu do wybicia, stop 8 % pod topem). Zamknięcie nad górą = próba przebicia (outcome "up"): box NADAL obowiązuje (`end` = dokąd; także po powrocie ceny do boxa), aż powstanie nowy box
// wyżej; zejście pod jego dno (strefa zagrożenia) ANULUJE go (`cancelled`) i szukamy od nowa. Box nie wybity, którego dół przebito = outcome "down" (odwrócony box).
// Pola: i0 (tydzień góry), i1 (tydzień wybicia / złamania albo ostatni), end (dokąd obowiązuje), top, bottom, confirmed (zawsze true), outcome, cancelled?.
function darvasScan(c, confirm = DARVAS_CONFIRM, bottomConfirm = confirm, minWeeks = DARVAS_MIN_WEEKS) {
    let n = c.length;
    while (n > 0 && !Number.isFinite(c[n - 1])) n--;
    const bxs = [], lines = [];
    let i = 0, ref = null;   // ref = indeks wybitego boxa, który nadal obowiązuje (do utworzenia nowego boxa wyżej)
    while (i < n) {
        const refTop = ref !== null ? bxs[ref].top : null, refBot = ref !== null ? bxs[ref].bottom : null;
        let top = null, t = -1, runMax = -Infinity;
        for (let k = i; k < n; k++) {
            if (!Number.isFinite(c[k]) || c[k] < runMax || (refTop !== null && c[k] <= refTop)) continue;
            runMax = c[k];
            if (k + confirm - 1 < n) {   // szczyt = tydzień zerowy + (confirm − 1) kolejnych tygodni, które go nie przebiły (razem `confirm` tygodni)
                let ok = true;   // luka w danych (null) nie potwierdza szczytu
                for (let m = k + 1; m <= k + confirm - 1; m++) if (!(Number.isFinite(c[m]) && c[m] <= c[k])) { ok = false; break; }
                if (ok) { t = k; top = c[k]; break; }
            }
        }
        if (ref !== null) {   // cena zeszła w strefę zagrożenia wybitego boxa, zanim powstał nowy box nad nim: box anulowany, szukamy od nowa
            const lim = t >= 0 ? t : n - 1;
            let hit = -1;
            for (let k = i; k <= lim; k++) if (Number.isFinite(c[k]) && c[k] < refBot) { hit = k; break; }
            if (hit >= 0) { bxs[ref].end = hit; bxs[ref].cancelled = true; ref = null; i = hit; continue; }
        }
        if (t < 0) break;
        let bottom = Infinity, bi = -1, confirmed = false, end = -1, outcome = "open", cancel = null;
        for (let j = t + 1; j < n; j++) {
            const v = c[j], ok = Number.isFinite(v);   // tydzień bez notowania nie zmienia boxa, ale upływ czasu liczy się do potwierdzenia dołu
            if (ok && v > top) { outcome = "up"; end = j; break; }
            if (ok && ref !== null && !confirmed && v < refBot) { cancel = j; break; }
            if (confirmed && ok && v < bottom) { outcome = "down"; end = j; break; }
            if (!confirmed && ok && v < bottom) { bottom = v; bi = j; }
            if (!confirmed && bi >= 0 && j - bi >= bottomConfirm - 1) confirmed = true;   // dół: tydzień dołka + (bottomConfirm − 1) kolejnych bez nowego minimum
        }
        if (cancel !== null) { bxs[ref].end = cancel; bxs[ref].cancelled = true; ref = null; i = cancel; continue; }
        if (end < 0) end = n - 1;
        // box potwierdzony musi obejmować co najmniej DARVAS_MIN_WEEKS tygodni (świec od szczytu do ostatniego tygodnia w boxie; tydzień wybicia już do niego nie należy)
        const weeksIn = outcome === "open" ? n - t : end - t;
        const good = confirmed && Number.isFinite(bottom) && top > bottom && (top - bottom) / top * 100 >= DARVAS_MIN_HEIGHT_PCT && weeksIn >= minWeeks;
        if (!confirmed || (Number.isFinite(bottom) && weeksIn < minWeeks)) lines.push({ i0: t, i1: end, top, open: outcome === "open" });
        else if (good) {
            if (ref !== null) bxs[ref].end = t;   // nowy box (nad starym) przejmuje obowiązywanie
            bxs.push({ i0: t, i1: end, end, top, bottom, confirmed: true, outcome });
            ref = outcome === "up" ? bxs.length - 1 : null;
        }
        if (outcome === "open") break;
        i = end;
    }
    if (ref !== null && !bxs[ref].cancelled) bxs[ref].end = n - 1;
    return { boxes: bxs, lines };
}

// Potwierdzone boxy (rosnąco po czasie) — patrz darvasScan. `confirmed` zostaje w polach dla zgodności (zawsze true).
function darvasBoxes(c, confirm = DARVAS_CONFIRM, bottomConfirm = confirm) {
    return darvasScan(c, confirm, bottomConfirm).boxes;
}

// Same topy bez potwierdzonego dołu: [{i0, i1, top, open}] — przerywana linia od topu do wybicia (open = jeszcze nie przebity).
function darvasTopLines(c, confirm = DARVAS_CONFIRM, bottomConfirm = confirm) {
    return darvasScan(c, confirm, bottomConfirm).lines;
}

const DARVAS_LINE_STOP_PCT = 8;   // sam top (bez potwierdzonego dołu): stop 8 % pod topem
// Sam top: wejście = zamknięcie nad topem, stop = 8 % pod topem.
function darvasLineInfo(top, stopPct = DARVAS_LINE_STOP_PCT) {
    const r2 = v => Math.round(v * 100) / 100;
    return { entry: r2(top), stop: r2(top * (1 - stopPct / 100)), stopPct };
}

const DARVAS_STOP_PCT = 5;   // szeroko strefy ryzyka: 5 % poniżej dołu boxa; dół strefy = exit

// Ceny boxa: wejście = góra (kup po zamknięciu tygodnia nad nią), anulowanie = dolna krawędź (zamknięcie pod nią kończy box), stop loss = −stopPct % od wejścia.
function darvasBoxInfo(top, bottom, zonePct = DARVAS_STOP_PCT) {
    const r2 = v => Math.round(v * 100) / 100;
    const stop = r2(bottom * (1 - zonePct / 100)), stopPct = r2((1 - stop / top) * 100);
    return { entry: r2(top), cancel: r2(bottom), stop, stopPct, zonePct, depthPct: r2((top - bottom) / top * 100), stopAboveCancel: stop > bottom, initStop: darvasInitialStop(top, bottom, top) };
}

// Treść arkusza po kliknięciu boxa (HTML); state: "up" | "down" | "open" | undefined (box z wykresu świecowego)
function darvasBoxSheetHtml(info, state, confirmed) {
    const st = state === "up" ? "wybity w górę (był sygnał kupna)" : state === "down" ? "złamany w dół (anulowany)" : state === "open" ? "otwarty — czeka na wybicie" : "otwarty (baza flat)";
    return `<div class="darvas-sheet"><p class="muted small">Box ${info.cancel.toFixed(2)}–${info.entry.toFixed(2)} · głębokość ${info.depthPct}% · ${st}${confirmed === false ? " · dół jeszcze niepotwierdzony" : ""}</p>`
        + `<table class="sheet-table" style="width:100%;text-align:left"><tr><th>💚 Cena wejścia</th><td><b>${info.entry.toFixed(2)}</b><br><span class="muted small">kup, gdy tydzień zamknie się NAD górą boxa</span></td></tr>`
        + `<tr><th>🛑 Stop początkowy</th><td><b>${info.initStop.toFixed(2)}</b><br><span class="muted small">${DARVAS_START_STOP_PCT}% pod wejściem; po wyższym boxie stop idzie pod jego dół −${info.zonePct}%</span></td></tr>`
        + `<tr><th>⚠️ Początek strefy ryzyka</th><td><b>${info.cancel.toFixed(2)}</b><br><span class="muted small">dolna krawędź boxa; od niej w dół jest szara strefa ryzyka (potencjalny exit)</span></td></tr>`
        + `<tr><th>🛑 Exit (dół strefy ryzyka)</th><td><b>${info.stop.toFixed(2)}</b><br><span class="muted small">dół szarej strefy ryzyka = ${info.zonePct}% pod dołem boxa (${info.stopPct}% pod ceną wejścia); wyjście poniżej tej ceny = exit</span></td></tr></table>`
        + `<p class="muted small">Reguły Darvasa na tygodniowych zamknięciach; heurystyka, nie rekomendacja.</p></div>`;
}

const DARVAS_MAX_EXT_PCT = 10;     // KUP tylko do 10 % nad górą boxa (na zamknięciach tygodniowych 5 % jest za ciasne — backtest); główne potwierdzenie to wolumen
const DARVAS_BREAKOUT_VOL = 1.4;   // wolumen wybicia ≥ 1,4× średniej
const DARVAS_VOL_WEEKS = 10;
const DARVAS_START_STOP_PCT = 10;   // stop początkowy: nie głębiej niż 10 % pod wejściem

// Stop początkowy po wybiciu = DOKŁADNIE capPct % (domyślnie 10 %) pod wejściem — reguła z teorii pudełek Darvasa (user: „dodaj ten 10 % stop jak mamy wejście początkowe”).
// Parametry top / bottom zostają dla zgodności wywołań (stop nie zależy już od wysokości boxa). Wyjście: MACD tygodniowy pod sygnałem albo wejście w strefę zagrożenia (box failuje).
function darvasInitialStop(top, bottom, entry = top, capPct = DARVAS_START_STOP_PCT) {
    return Math.round(entry * (1 - capPct / 100) * 100) / 100;
}

// Wyjście z MACD: tygodniowy MACD (12, 26, 9) pod linią sygnału na ostatniej prawdziwej świecy. null = za krótka historia / brak funkcji z chart.js.
function darvasMacdBelow(c) {
    if (typeof macdSeries !== "function") return null;
    const { hist } = macdSeries(c);
    let last = -1;
    c.forEach((v, i) => { if (Number.isFinite(v) && hist[i] !== null) last = i; });
    return last < 0 ? null : hist[last] < 0;
}

// Stan akcji wg zasad DAR-CARD na ostatnim tygodniowym zamknięciu c: KUP (wybicie nad górę najwyższego boxa w tym tygodniu), TRZYMAJ (jest w najwyższym
// boxie po wcześniejszym wybiciu — wahania w boxie ignorujemy, stop pod strefą zagrożenia), SPRZEDAJ (po wyższym boxie cena spadła pod jego dno = wejście w strefę
// zagrożenia), CZEKAJ (pierwszy box, jeszcze bez wybicia), POZA (box złamany bez wcześniejszego wybicia / brak boxa — brak powodu do trzymania).
function darvasStatus(c, zonePct = DARVAS_STOP_PCT, confirm = DARVAS_CONFIRM, bottomConfirm = confirm, vol = null, maxExtPct = DARVAS_MAX_EXT_PCT) {
    // Gdy są boxy, status = reguły z książki Darvasa (karta, s. 11): KUP / TRZYMAJ / SPRZEDAJ / POZA; wolumen, +10 % i MACD to tylko ostrzeżenia w tekście.
    if (darvasScan(c, confirm, bottomConfirm).boxes.length) {
        const a = darCardAnalyze(c, vol), st = a.status;
        return { ...st, state: st.state === "READY" ? "WAIT" : st.state, zoneFrom: st.bottom, text: st.text + (st.warnings.length ? " · ⚠ " + st.warnings.join("; ") : "") };
    }
    const st = darvasStatusCore(c, zonePct, confirm, bottomConfirm, vol, maxExtPct);
    if ((st.state === "HOLD" || st.state === "BUY") && darvasMacdBelow(c) === true) {
        return { ...st, macdExit: true, text: `${st.text} · ⚠ WYJŚCIE: tygodniowy MACD jest pod linią sygnału` };
    }
    return st;
}

function darvasStatusCore(c, zonePct, confirm, bottomConfirm, vol, maxExtPct) {
    const { boxes: bx, lines: ln } = darvasScan(c, confirm, bottomConfirm);
    let lr = -1;
    c.forEach((v, i) => { if (Number.isFinite(v)) lr = i; });
    if (lr < 0 || (!bx.length && !ln.length)) return { state: "NONE", text: "brak boxa Darvasa (za mało danych)" };
    const r2 = v => Math.round(v * 100) / 100;
    const px = c[lr], prevPx = lr > 0 && Number.isFinite(c[lr - 1]) ? c[lr - 1] : null;
    // wybicie nad `top` w ostatnim tygodniu: GŁÓWNE potwierdzenie to wolumen ≥ 1,4× średniej z 10 tygodni (gdy go znamy), dodatkowo cena najwyżej 10 % nad topem
    const buy = (top, base, stop, stopTxt, what) => {
        const over = px / top - 1;
        let vr = null;
        if (vol && Number.isFinite(vol[lr])) {
            const prevV = vol.slice(Math.max(0, lr - DARVAS_VOL_WEEKS), lr).filter(Number.isFinite);
            if (prevV.length >= 4) vr = vol[lr] / (prevV.reduce((a, b) => a + b, 0) / prevV.length);
        }
        if (vr !== null && vr < DARVAS_BREAKOUT_VOL) return { ...base, state: "NOVOL", vol_ratio: Math.round(vr * 100) / 100, text: `BEZ WOLUMENU — zamknięcie nad ${what} ${r2(top)}, ale wolumen tylko ${vr.toFixed(2)}× średniej (wymagane ${DARVAS_BREAKOUT_VOL}×); niepotwierdzone` };
        if (over > maxExtPct / 100) return { ...base, state: "LATE", text: `ZA PÓŹNO — zamknięcie ${(over * 100).toFixed(1)} % nad ${what} ${r2(top)} (limit ${maxExtPct} %), nie goń` };
        return { ...base, state: "BUY", stop, vol_ratio: vr === null ? null : Math.round(vr * 100) / 100, text: `KUP — zamknięcie nad ${what} ${r2(top)}${vr === null ? "" : ` na wolumenie ${vr.toFixed(2)}×`}; ${stopTxt}` };
    };
    const last = bx.length ? bx[bx.length - 1] : null;
    const lineTxt = li => `sam top bez potwierdzonego dołu, stop ${DARVAS_LINE_STOP_PCT} % pod topem (${li.stop})`;
    if (!last) {   // jest tylko top, bez potwierdzonego dołu
        const tl = ln[ln.length - 1], li = darvasLineInfo(tl.top), base = { top: li.entry, stop: li.stop };
        if (!tl.open && tl.i1 === lr) return buy(tl.top, base, li.stop, lineTxt(li), "topem");
        if (tl.open) return { ...base, state: "WAIT", text: `CZEKAJ — jest tylko top ${li.entry} (dół jeszcze niepotwierdzony); kup po zamknięciu tygodnia nad nim, stop ${DARVAS_LINE_STOP_PCT} % (${li.stop})` };
        return { ...base, state: "HOLD", text: `TRZYMAJ — top ${li.entry} przebity, czekamy na potwierdzony box; stop ${DARVAS_LINE_STOP_PCT} % pod topem (${li.stop})` };
    }
    const { top, bottom } = last, zoneFrom = r2(bottom), stop = r2(bottom * (1 - zonePct / 100));
    const base = { top: r2(top), bottom: zoneFrom, zoneFrom, stop };
    const tracked = last.outcome === "up" && !last.cancelled && last.end >= lr;   // wybity box nadal obowiązuje
    const nl = ln.length ? ln[ln.length - 1] : null;
    if (nl && nl.i0 > last.i0 && !nl.open && nl.i1 === lr && !last.cancelled) {   // wybity top nowego, jeszcze niepotwierdzonego boxa
        const li = darvasLineInfo(nl.top);
        return buy(nl.top, { ...base, top: li.entry }, li.stop, lineTxt(li), "topem");
    }
    if (last.outcome === "up" && (last.i1 === lr || (tracked && px > top && prevPx !== null && prevPx <= top))) {   // próba przebicia: pierwsza albo kolejna
        const initStop = darvasInitialStop(top, bottom, px);
        return buy(top, base, initStop, `stop początkowy ${DARVAS_START_STOP_PCT} % pod wejściem (${initStop}), potem pod dnem kolejnych boxów; wyjście: MACD tygodniowy pod sygnałem lub wejście w strefę zagrożenia`, "górą boxa");
    }
    if (last.outcome === "down" || last.cancelled || (last.outcome === "up" && !tracked)) {
        if (px < bottom) return { ...base, state: "SELL", text: `SPRZEDAJ — BOX FAILUJE: cena weszła w strefę zagrożenia (box ${zoneFrom}–${r2(top)} anulowany, strefa ${stop}–${zoneFrom}); szukamy nowego boxa` };
        return { ...base, state: "WAIT", text: `CZEKAJ — box ${zoneFrom}–${r2(top)} anulowany, czekamy na nowy` };
    }
    if (tracked) return { ...base, state: "HOLD", text: `TRZYMAJ — cena ${px > top ? "nad górą boxa" : "w boxie"} ${zoneFrom}–${r2(top)}; box obowiązuje do utworzenia nowego wyżej, anuluje go zejście pod dno ${zoneFrom} (strefa zagrożenia ${stop}–${zoneFrom})` };
    const hadUp = bx.length > 1 && bx[bx.length - 2].outcome === "up";
    if (hadUp) return { ...base, state: "HOLD", text: `TRZYMAJ — cena w nowym boxie ${zoneFrom}–${r2(top)}; stop pod strefą zagrożenia ${stop}` };
    return { ...base, state: "WAIT", text: `CZEKAJ — box ${zoneFrom}–${r2(top)}; kup po zamknięciu tygodnia nad ${r2(top)}` };
}

// Status przypiętego (monitorowanego) boxa względem bieżącej ceny: nad górą = wybicie, w boxie, w szarej strefie zagrożenia (5 % pod dołem), pod strefą = exit.
function darvasPinStatus(box, price, zonePct = DARVAS_STOP_PCT) {
    if (!box || !Number.isFinite(price) || !(box.top > box.bottom)) return { state: "NONE", text: "" };
    const r2 = v => Math.round(v * 100) / 100, zone = r2(box.bottom * (1 - zonePct / 100));
    if (box.line) {   // przypięty sam top: bottom = stop 8 % pod topem, bez strefy zagrożenia
        if (price > box.top) return { state: "ABOVE", rank: 1, text: `top ${r2(box.top)} przebity (+${((price / box.top - 1) * 100).toFixed(1)} %), stop ${r2(box.bottom)}` };
        if (price >= box.bottom) return { state: "INSIDE", rank: 2, text: `pod topem ${r2(box.top)}, do wybicia ${((box.top / price - 1) * 100).toFixed(1)} %, stop ${r2(box.bottom)}` };
        return { state: "EXIT", rank: 0, text: `EXIT — cena ${r2(price)} poniżej stopu ${r2(box.bottom)} (${DARVAS_LINE_STOP_PCT} % pod topem ${r2(box.top)})` };
    }
    if (price > box.top) return { state: "ABOVE", rank: 1, text: `wybił nad ${r2(box.top)} (+${((price / box.top - 1) * 100).toFixed(1)} %)` };
    if (price >= box.bottom) return { state: "INSIDE", rank: 2, text: `w boxie ${r2(box.bottom)}–${r2(box.top)}, do wybicia ${((box.top / price - 1) * 100).toFixed(1)} %` };
    if (price >= zone) return { state: "ZONE", rank: 0, text: `W STREFIE ZAGROŻENIA ${zone}–${r2(box.bottom)} — potencjalny exit` };
    return { state: "EXIT", rank: 0, text: `EXIT — cena ${r2(price)} poniżej strefy zagrożenia (${zone})` };
}

// NATR boxa (Blueprint: konsolidacja ma mieć NATR < 8, im niższy tym ciaśniejsza i czystsza): średni True Range tygodni boxa (i0…i1) jako % ich średniego zamknięcia.
// True Range = max(High − Low, |High − poprzednie Close|, |Low − poprzednie Close|); luki z poprzedniego tygodnia się liczą. null, gdy box ma < 3 tygodnie z danymi.
const NATR_GOOD = 8;   // próg z Blueprintu
function boxNatr(h, l, c, i0, i1) {
    const tr = [], cl = [];
    for (let i = Math.max(1, i0); i <= Math.min(i1, c.length - 1); i++) {
        if (!Number.isFinite(h[i]) || !Number.isFinite(l[i]) || !Number.isFinite(c[i]) || !Number.isFinite(c[i - 1])) continue;
        tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
        cl.push(c[i]);
    }
    if (tr.length < 3) return null;
    const avgC = cl.reduce((a, b) => a + b, 0) / cl.length;
    return avgC > 0 ? Math.round(tr.reduce((a, b) => a + b, 0) / tr.length / avgC * 1000) / 10 : null;
}
// Prosta średnia krocząca z zamknięć (null przed pełnym oknem i przy luce w danych).
function darvasSma(c, n) {
    return c.map((_, i) => {
        if (i < n - 1) return null;
        let sum = 0;
        for (let j = i - n + 1; j <= i; j++) { if (!Number.isFinite(c[j])) return null; sum += c[j]; }
        return sum / n;
    });
}
// Seria NATR (%) dla wykresu: ATR(n) z True Range (RMA z ziarnem SMA jak ta.atr) / zamknięcie; null przed pierwszym pełnym oknem i w lukach danych.
function natrSeries(h, l, c, n = 14) {
    const out = new Array(c.length).fill(null), tr = [];
    let atr = null;
    for (let i = 1; i < c.length; i++) {
        if (![h[i], l[i], c[i], c[i - 1]].every(Number.isFinite)) continue;
        const t = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
        if (atr === null) { tr.push(t); if (tr.length === n) atr = tr.reduce((a, b) => a + b, 0) / n; }
        else atr = (atr * (n - 1) + t) / n;
        if (atr !== null && c[i] > 0) out[i] = atr / c[i] * 100;
    }
    return out;
}
// Ocena jakości boxa po NATR (skala skanera z Blueprintu: ~5 % = pełna ocena, 20 % = najgorsza; wymagane < 8).
function natrGrade(v) {
    if (!Number.isFinite(v)) return { key: "na", label: "—", cls: "muted" };
    if (v < 5) return { key: "tight", label: "ciasny", cls: "positive" };
    if (v < NATR_GOOD) return { key: "ok", label: "dobry", cls: "positive" };
    if (v < 12) return { key: "loose", label: "luźny", cls: "warn" };
    return { key: "wide", label: "za szeroki", cls: "negative" };
}

const DARVAS_NEW_WEEKS = 4;   // box jest „nowy”, gdy jego góra została potwierdzona w ostatnich tylu tygodniach

// Przegląd boxów Darvasa dla wszystkich spółek (podstrona „Boxy”): items = [{ticker, price, c (tyg. zamknięcia), v (wolumen), h / l (opcjonalnie, dla NATR boxa)}], weeks = daty tygodni, pinned = {T: {top, bottom, start}}.
// Zwraca sekcje: pinned (monitorowane), fresh (nowe boxy), buy (wybicie potwierdzone wolumenem), check (wybicie bez wolumenu / za późno), hold, sell, wait — każdy wiersz {ticker, price, state, text, box:{top,bottom,start,i0,i1}, key}.
function darvasOverview(items, weeks, pinned = {}, newWeeks = DARVAS_NEW_WEEKS) {
    const out = { pinned: [], fresh: [], buy: [], check: [], hold: [], sell: [], wait: [] };
    const r2 = v => Math.round(v * 100) / 100;
    (items || []).forEach(it => {
        const c = it.c || [];
        let lastReal = -1;
        c.forEach((v, i) => { if (Number.isFinite(v)) lastReal = i; });
        if (lastReal < 0) return;
        const { boxes, lines } = darvasScan(c);
        const mk = b => ({ top: r2(b.top), bottom: r2(b.bottom), start: (weeks && weeks[b.i0]) || "", i0: b.i0, i1: b.i1, ...(b.line ? { line: true } : {}) });
        const natrOf = b => (it.h && it.l ? boxNatr(it.h, it.l, c, b.i0, Math.min(b.i1, lastReal)) : null);
        const pin = pinned[it.ticker];
        if (pin) {
            const st = darvasPinStatus(pin, it.price);
            if (st.state !== "NONE") out.pinned.push({ ticker: it.ticker, price: it.price, state: st.state, rank: st.rank, text: st.text, box: { ...pin, i0: -1, i1: -1 }, key: `${it.ticker}|${pin.top}|${pin.bottom}|${pin.start}` });
        }
        const ds = darvasStatus(c, undefined, undefined, undefined, it.v);
        const lastBox = boxes[boxes.length - 1], lastLine = lines[lines.length - 1];
        // sam top (dół niepotwierdzony) jest „boxem” wiersza, gdy powstał po ostatnim potwierdzonym boxie (albo box w ogóle nie istnieje); bottom = stop 8 % pod topem
        const last = lastLine && (!lastBox || lastLine.i0 > lastBox.i0) ? { top: lastLine.top, bottom: darvasLineInfo(lastLine.top).stop, i0: lastLine.i0, i1: lastLine.i1, line: true } : lastBox;
        if (ds.state !== "NONE" && last) {
            const row = { ticker: it.ticker, price: it.price, state: ds.state, text: ds.text, natr: natrOf(last), box: mk(last), key: `${it.ticker}|${r2(last.top)}|${r2(last.bottom)}|${(weeks && weeks[last.i0]) || ""}` };
            const section = { BUY: "buy", NOVOL: "check", LATE: "check", HOLD: "hold", SELL: "sell", OUT: "sell", WAIT: "wait" }[ds.state];
            if (section) out[section].push(row);
        }
        // nowe boxy: góra potwierdzona (i0 + potwierdzenie) w ostatnich `newWeeks` tygodniach
        const fresh = boxes.filter(b => { const born = b.i0 + DARVAS_CONFIRM; return born <= lastReal && born >= lastReal - (newWeeks - 1); }).pop();
        if (fresh) out.fresh.push({ ticker: it.ticker, price: it.price, natr: natrOf(fresh), state: fresh.outcome === "up" ? "ABOVE" : fresh.outcome === "down" ? "EXIT" : "INSIDE", text: `box ${r2(fresh.bottom)}–${r2(fresh.top)} od ${(weeks && weeks[fresh.i0]) || "?"}${fresh.outcome === "up" ? " — już wybity w górę" : fresh.outcome === "down" ? " — złamany w dół" : ""}`, box: mk(fresh), key: `${it.ticker}|${r2(fresh.top)}|${r2(fresh.bottom)}|${(weeks && weeks[fresh.i0]) || ""}` });
    });
    out.pinned.sort((a, b) => a.rank - b.rank || a.ticker.localeCompare(b.ticker));
    ["fresh", "buy", "check", "hold", "sell", "wait"].forEach(k => out[k].sort((a, b) => a.ticker.localeCompare(b.ticker)));
    return out;
}

// Cup & handle na samych zamknięciach (dla Dar-Card): z miseczki wykrytej przez watchlist.py (`full.cups`: i0 lewy szczyt, i1 prawy brzeg, handle {iEnd}) wyznacza kluczowe poziomy
// z zamknięć tygodniowych: lewy szczyt, dołek miski, prawy brzeg, rączkę jako mały box (góra = najwyższe, dół = najniższe zamknięcie rączki) i pivot (góra rączki; bez rączki — lewy szczyt).
const CUP_STOP_PCT = 8, CUP_BUY_MAX_PCT = 5, PATTERN_ZONE_PCT = 5;   // strefa zagrożenia boxów wzorców: 5 % pod dołem boxa (jak przy pudełkach Darvasa)
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
    return { stop: r2(boxBottom * (1 - PATTERN_ZONE_PCT / 100)), boxBottom: r2(boxBottom), buyMax: r2(pv * (1 + CUP_BUY_MAX_PCT / 100)), i0, ib, i1, left: r2(left), bottom: r2(bottom), rim: r2(rim), handle: handle ? { ...handle, top: r2(handle.top), bottom: r2(handle.bottom) } : null, pivot: r2(handle ? handle.top : left), depthPct: r2((left - bottom) / left * 100), noHandle: !handle };
}

// Opis stanu ostatniej miski względem ostatniego zamknięcia (do paska pod Dar-Card): czeka / wybicie.
function darvasCupStatus(c, cups) {
    let lastReal = -1;
    c.forEach((v, i) => { if (Number.isFinite(v)) lastReal = i; });
    const geoms = (cups || []).map(cp => darvasCupGeometry(c, cp)).filter(Boolean);
    if (lastReal < 0 || !geoms.length) return { state: "NONE", text: "" };
    const g = geoms[geoms.length - 1], price = c[lastReal];
    const kind = g.noHandle ? "cup bez rączki ⚠" : "cup & handle";
    const lv = `kup ${g.pivot}–${g.buyMax}, wyjście: zamknięcie pod ${g.boxBottom}, strefa zagrożenia do ${g.stop}`;
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
    const price = c[lastReal], top = box.top, low = box.low, stop = Math.round(low * (1 - PATTERN_ZONE_PCT / 100) * 100) / 100, buyMax = Math.round(top * (1 + CUP_BUY_MAX_PCT / 100) * 100) / 100;
    const lv = `kup ${top}–${buyMax}, wyjście: zamknięcie pod ${low}, strefa zagrożenia do ${stop}`;
    if (price < low) return { state: "FAILED", text: `${name}: zamknięcie ${price} pod dołem ${low} — baza wygasła (${lv})` };
    if (price > buyMax) return { state: "LATE", text: `${name}: ${price} więcej niż 5 % nad pivotem ${top} — nie goń (${lv})` };
    if (price > top) return { state: "ABOVE", text: `${name}: zamknięcie ${price} nad pivotem ${top} — strefa kupna (${lv})` };
    return { state: "WAIT", text: `${name}: pivot ${top}, do wybicia ${((top / price - 1) * 100).toFixed(1)} % (${lv})` };
}

// Widok Dar-Card dla okna wykresu: full = pełny model z chart.js (c, weeks, n, pad), win = {n, end}; opts: fit {w, h}
function darvasSvg(full, win, opts = {}) {
    const W = opts.fit ? opts.fit.w : 1000, H = opts.fit ? opts.fit.h : 710, compact = !!opts.compact;
    const fs = v => Math.round(v * (compact ? 1.25 : 1) * 10) / 10;
    const L = { left: 2, right: compact ? 48 : 56, top: 14, bottom: 24 };   // wąskie marginesy: wykres wypełnia szerokość, podpisy osi są drobniejsze
    const pw = W - L.left - L.right, ph = H - L.top - L.bottom;
    const lastReal = full.c.reduce((a, v, i) => (Number.isFinite(v) ? i : a), -1);
    const start = Math.max(0, Math.min(win.end - win.n, lastReal)), endExcl = Math.max(start + 2, win.end);
    const slots = endExcl - start;
    const x = i => L.left + pw * (i - start + 0.5) / slots;
    const cupGeoms = (full.cups || []).map(cp => darvasCupGeometry(full.c, cp)).filter(Boolean);
    // opts.cupHideBoxes: boxy leżące wewnątrz miski nie są rysowane (miska je zastępuje — mniej bałaganu)
    const scan = darvasScan(full.c);
    const boxes = scan.boxes.filter(b => (b.end ?? b.i1) >= start && b.i0 < endExcl && !(opts.cupHideBoxes && cupGeoms.some(g => b.i0 >= g.i0 && b.i1 <= g.i1 + 1)));
    const topLines = scan.lines.filter(l => l.i1 >= start && l.i0 < endExcl);   // same topy bez potwierdzonego dołu: niebieska przerywana linia (stop 8 %)
    const shown = [];
    for (let i = start; i < Math.min(endExcl, lastReal + 1); i++) if (Number.isFinite(full.c[i])) shown.push(full.c[i]);
    if (shown.length < 2) return `<svg viewBox="0 0 ${W} ${H}" width="100%"><text x="20" y="30" fill="#8a8f9c" font-size="14">Za mało danych na pudełka Darvasa.</text></svg>`;
    const pin = opts.pinBox && opts.pinBox.top > opts.pinBox.bottom ? opts.pinBox : null;   // przypięty (monitorowany) box: złota obwódka do prawej krawędzi, także po wyjściu ze strefy
    const lo0 = Math.min(...shown, ...darvasPatternBoxes(full).map(p => p.low * (1 - PATTERN_ZONE_PCT / 100)), ...boxes.map(b => b.bottom * (1 - DARVAS_STOP_PCT / 100)), ...topLines.map(l => l.top * (1 - DARVAS_LINE_STOP_PCT / 100)), ...(pin ? [pin.line ? pin.bottom : pin.bottom * (1 - DARVAS_STOP_PCT / 100)] : [])), hi0 = Math.max(...shown, ...boxes.map(b => b.outcome === "down" ? b.top * (1 + DARVAS_STOP_PCT / 100) : b.top), ...topLines.map(l => l.top), ...darvasPatternBoxes(full).map(p => p.top), ...(pin ? [pin.top] : [])), pad = (hi0 - lo0) * 0.06 || 1;
    // skala LOGARYTMICZNA (równe % to równa wysokość): przy dużym zakresie cen stare boxy nie są sprasowane, a strefa zagrożenia 5 % ma stałą wysokość
    const logSpan = Math.log(hi0 / lo0) || 0.1;
    const lo = lo0 > 0 ? lo0 * Math.exp(-0.06 * logSpan) : lo0 - pad, hi = lo0 > 0 ? hi0 * Math.exp(0.06 * logSpan) : hi0 + pad;
    const y = v => L.top + ph * (1 - Math.log(v / lo) / Math.log(hi / lo));
    const out = [];
    out.push(`<defs><pattern id="darvasHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#ffffff" fill-opacity="0.22"/><line x1="0" y1="0" x2="0" y2="5" stroke="#ffffff" stroke-opacity="0.8" stroke-width="2"/></pattern></defs>`);
    // „papier w linie” jak na Dar-Card: poziome linie co tyle, ile wynosi ~1/80 zakresu; grubsze na okrągłych poziomach
    const ticks = logTicks(lo, hi).length >= 3 ? logTicks(lo, hi) : niceTicks(lo, hi, compact ? 6 : 8);
    const qStep = Math.exp(Math.log(hi / lo) / 80);   // ~1/80 zakresu w skali log.
    for (let v = lo * qStep; v < hi; v *= qStep) out.push(`<line x1="${L.left}" x2="${W - L.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#1d212b" stroke-width="1"/>`);
    ticks.forEach(t => {
        out.push(`<line x1="${L.left}" x2="${W - L.right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#2c3140" stroke-width="1.2"/>`);
        out.push(`<text x="${W - L.right + 4}" y="${(y(t) + 3.5).toFixed(1)}" font-size="${fs(9.5)}" fill="#8a8f9c">${t}</text>`);
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
        if ([1, 4, 7, 10].includes(mon)) out.push(`<text x="${x(i).toFixed(1)}" y="${H - 7}" font-size="${fs(9.5)}" fill="#8a8f9c" text-anchor="middle">${["", "sty", "", "", "kwi", "", "", "lip", "", "", "paź"][mon]} ${d.slice(2, 4)}</text>`);
    }
    const bw = Math.max(2, pw / slots * 0.5);
    boxes.forEach(b => {
        const bEnd = b.outcome === "open" ? lastReal : (b.end ?? b.i1);   // wybity box obowiązuje do `end` (nowy box wyżej albo zejście pod dno), nie tylko do tygodnia wybicia
        const x0 = x(Math.max(start, b.i0)) - bw / 2, x1 = x(Math.min(endExcl - 1, Math.max(bEnd, b.i0 + 1))) + bw / 2;
        const bad = b.outcome === "down";   // odwrócony box (dół przebity bez wybicia): strefa zagrożenia leży 5 % NAD górą
        const yT = y(b.top), yB = y(b.bottom), yZ = bad ? y(b.top * (1 + DARVAS_STOP_PCT / 100)) : y(b.bottom * (1 - DARVAS_STOP_PCT / 100));   // dół boxa = najniższe zamknięcie; zacieniona strefa zagrożenia leży 5 % POD nim (jak na Dar-Card)
        const col = b.cancelled ? "#9aa0ab" : b.outcome === "up" ? "#e8eaed" : bad ? "#ff8a8a" : "#f4f6fa";
        const state = b.cancelled ? "anulowany (cena zeszła pod dno)" : b.outcome === "up" ? "wybite w górę — obowiązuje do nowego boxa wyżej" : bad ? "złamane w dół (odwrócony box)" : "otwarte";
        // sam box, bez linii i podpisów: kliknięcie / dotknięcie pokazuje ceny wejścia, anulowania i stop lossa (data-box → arkusz w watchlist.js)
        out.push(`<rect class="box-hit" data-box="${b.top}|${b.bottom}|${b.outcome}|1|${b.i0}|${b.i1}" style="cursor:pointer" x="${x0.toFixed(1)}" y="${yT.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(yB - yT).toFixed(1)}" fill="${col}" fill-opacity="${b.cancelled ? 0.5 : 0.92}" stroke="#ffffff" stroke-width="1.4"><title>Box ${b.bottom}–${b.top} · ${state} — kliknij: ceny i stop</title></rect>`);
        const zy0 = bad ? yZ : yB, zh = bad ? yT - yZ : yZ - yB;
        out.push(`<rect x="${x0.toFixed(1)}" y="${zy0.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${Math.max(2, zh).toFixed(1)}" fill="url(#darvasHatch)" pointer-events="none"/>`);
    });
    // sam top (potwierdzony przez 3 tygodnie, ale dół jeszcze nie): niebieska przerywana linia od topu do wybicia (open = do prawej krawędzi); klik = wejście i stop 8 %
    topLines.forEach(l => {
        const x0 = x(Math.max(start, l.i0)) - bw / 2, x1 = l.open ? W - L.right : x(Math.min(endExcl - 1, l.i1)) + bw / 2, yy = y(l.top), li = darvasLineInfo(l.top);
        out.push(`<line x1="${x0.toFixed(1)}" x2="${x1.toFixed(1)}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="#3b9cff" stroke-width="2" stroke-dasharray="6 4" pointer-events="none"/>`);
        // stop 8 % pod linią NIE jest rysowany na stałe: pokazuje się po stuknięciu w linię (podświetlenie poziomów w attachDarvasHover) albo gdy linia jest przypięta
        out.push(`<rect class="box-hit line-hit" data-box="${l.top}|${li.stop}|linia|0|${l.i0}|${l.i1}" style="cursor:pointer" x="${x0.toFixed(1)}" y="${(yy - 6).toFixed(1)}" width="${Math.max(2, x1 - x0).toFixed(1)}" height="12" fill="transparent"><title>Top ${li.entry} bez potwierdzonego dołu${l.open ? "" : " — przebity"} · stop ${DARVAS_LINE_STOP_PCT} % = ${li.stop} — kliknij</title></rect>`);
    });
    // podpisy boxów nie mogą się nakładać (flat base + przypięty box leżą często w tym samym miejscu): kolejny podpis ucieka w górę o wysokość wiersza
    const takenLabels = [];
    const placeLabelY = (lx, ly, text, size, anchor) => {
        const w = String(text).length * size * 0.62, h = size * 1.15, x0 = anchor === "end" ? lx - w : anchor === "middle" ? lx - w / 2 : lx;
        let yy = ly;
        for (let k = 0; k < 8 && takenLabels.some(r => x0 < r.x1 && x0 + w > r.x0 && yy - h < r.y1 && yy > r.y0); k++) yy -= h + 2;
        yy = Math.max(L.top + h, yy);
        takenLabels.push({ x0, x1: x0 + w, y0: yy - h, y1: yy });
        return yy;
    };
    // podpis WEWNĄTRZ boxa, gdy się mieści (tam jest wolne miejsce); inaczej wraca do podpisu nad boxem (placeLabelY)
    const fitsInside = (text, size, boxW, boxH) => String(text).length * size * 0.62 + 8 <= boxW && size * 1.3 + 4 <= boxH;
    // flat base: wyróżniona ramka bazy (niebieska, kreskowana) + pivot do prawej krawędzi, strefa kupna +5 % i stop −8 % jak przy cup & handle
    darvasPatternBoxes(full).forEach(fb => {
        if (!(fb.i1 >= start && fb.i0 < endExcl && fb.top > fb.low)) return;
        const fx0 = x(Math.max(start, fb.i0)) - bw / 2, fx1 = x(Math.min(endExcl - 1, fb.i1)) + bw / 2, fyT = y(fb.top), fyB = y(fb.low), fyS = y(fb.low * (1 - PATTERN_ZONE_PCT / 100));
        const pcol = PATTERN_COLORS[fb.name] || "#3b9cff", fpx1 = W - L.right, fcol = full.c[lastReal] > fb.top ? "#4ee08a" : "#ffffff";
        out.push(`<rect x="${fx0.toFixed(1)}" y="${fyT.toFixed(1)}" width="${Math.max(0, fx1 - fx0).toFixed(1)}" height="${Math.max(2, fyB - fyT).toFixed(1)}" fill="${pcol}" fill-opacity="0.78" stroke="${pcol}" stroke-width="${fs(1.6)}" pointer-events="none"><title>${fb.name}: dół ${fb.low}, pivot ${fb.top}</title></rect>`);
        if (fyS - fyB > 1) out.push(`<rect x="${fx0.toFixed(1)}" y="${fyB.toFixed(1)}" width="${Math.max(0, fx1 - fx0).toFixed(1)}" height="${(fyS - fyB).toFixed(1)}" fill="url(#darvasHatch)" pointer-events="none"/>`);
        out.push(`<rect class="box-hit" data-box="${fb.top}|${fb.low}|wzorzec|1|${fb.i0}|${fb.i1}" style="cursor:pointer" x="${fx0.toFixed(1)}" y="${fyT.toFixed(1)}" width="${Math.max(0, fx1 - fx0).toFixed(1)}" height="${Math.max(2, fyS - fyT).toFixed(1)}" fill="transparent"><title>${fb.name} ${fb.low}–${fb.top} — kliknij: przybliż, przytrzymaj: przypnij</title></rect>`);
        const fbText = `${fb.name} ${fb.i1 - fb.i0 + 1} tyg.`, fbShort = `${fb.i1 - fb.i0 + 1} tyg.`;
        const fbInside = [fbText, fbShort].find(t => fitsInside(t, fs(12), fx1 - fx0, fyB - fyT));
        if (fbInside) {   // wewnątrz boxa: ciemny napis w lewym górnym rogu
            const fcx = (fx0 + fx1) / 2, fcy = (fyT + fyB) / 2 + fs(12) * 0.35, fw = fbInside.length * fs(12) * 0.62;
            takenLabels.push({ x0: fcx - fw / 2, x1: fcx + fw / 2, y0: fcy - fs(12) * 1.05, y1: fcy + fs(12) * 0.25 });
            out.push(`<text x="${fcx.toFixed(1)}" y="${fcy.toFixed(1)}" font-size="${fs(12)}" font-weight="700" fill="#0b0d10" text-anchor="middle" pointer-events="none">${fbInside}</text>`);
        }   // nie mieści się w środku: bez podpisu (nazwa i długość są w dymku i w pasku odczytu po zaznaczeniu boxa) — mniej nakładających się napisów
        out.push(`<line x1="${fx0.toFixed(1)}" x2="${fpx1}" y1="${fyT.toFixed(1)}" y2="${fyT.toFixed(1)}" stroke="${fcol}" stroke-width="1.4" stroke-dasharray="6 4" opacity="0.85" pointer-events="none"/>`);
        out.push(`<rect x="${W - L.right}" y="${(fyT - fs(7.5)).toFixed(1)}" width="${L.right - 2}" height="${fs(15)}" rx="2" fill="${fcol}" pointer-events="none"/><text x="${W - L.right + 3}" y="${(fyT + fs(4)).toFixed(1)}" font-size="${fs(10)}" font-weight="700" fill="#0e0f13" pointer-events="none">${fb.top.toFixed(2)}</text>`);
        out.push(`<rect x="${W - L.right}" y="${(fyS - fs(7.5)).toFixed(1)}" width="${L.right - 2}" height="${fs(15)}" rx="2" fill="#ff6b6b" pointer-events="none"/><text x="${W - L.right + 3}" y="${(fyS + fs(4)).toFixed(1)}" font-size="${fs(10)}" font-weight="700" fill="#0e0f13" pointer-events="none">${(fb.low * (1 - PATTERN_ZONE_PCT / 100)).toFixed(2)}</text>`);
    });
    // cup & handle na zamknięciach: miska jako gładka krzywa przez lewy szczyt – dołek – prawy brzeg, rączka jako mały box, pivot = góra rączki (bez rączki: lewy szczyt)
    // własne cupy użytkownika (narysowane ręcznie) traktujemy jak wykryte: ten sam box pivotu (bez rączki — pivot = lewy szczyt)
    const userCups = (opts.userCups || []).map(u => ({ i0: dateToIndex(full.weeks, u.start), i1: dateToIndex(full.weeks, u.end), noHandle: true, user: true })).filter(u => u.i0 >= 0 && u.i1 > u.i0);
    (full.cups || []).concat(userCups).forEach(cp => {
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
            out.push(`<rect class="box-hit" data-box="${g.pivot}|${g.boxBottom}|wzorzec|1|${g.handle ? g.handle.i0 : g.i1}|${lastReal}" style="cursor:pointer" x="${bx0.toFixed(1)}" y="${byT.toFixed(1)}" width="${Math.max(0, bx1 - bx0).toFixed(1)}" height="${Math.max(2, byS - byT).toFixed(1)}" fill="transparent"><title>Cup & handle: pivot ${g.pivot}, dół ${g.boxBottom} — kliknij: przybliż, przytrzymaj: przypnij</title></rect>`);
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
    if (pin && pin.line) {   // przypięty sam top: przerywana linia topu (kolor statusu) + czerwony stop 8 %, bez strefy zagrożenia
        const lx0 = x(Math.max(start, Math.min(endExcl - 1, pin.i0))) - bw / 2, lx1 = W - L.right, lyT = y(pin.top), lyS = y(pin.bottom);
        const ls = darvasPinStatus({ top: pin.top, bottom: pin.bottom, line: true }, full.c[lastReal]);
        const lcol = ls.state === "ABOVE" ? "#4ee08a" : ls.state === "INSIDE" ? "#3b9cff" : "#ff6b6b";
        out.push(`<line class="${opts.pinFlash ? "pin-flash" : ""}" x1="${lx0.toFixed(1)}" x2="${lx1}" y1="${lyT.toFixed(1)}" y2="${lyT.toFixed(1)}" stroke="${lcol}" stroke-width="2.4" stroke-dasharray="7 4" pointer-events="none"><title>📌 Monitorowany top ${pin.top}: ${ls.text}</title></line>`);
        out.push(`<line x1="${lx0.toFixed(1)}" x2="${lx1}" y1="${lyS.toFixed(1)}" y2="${lyS.toFixed(1)}" stroke="#ff6b6b" stroke-width="1.2" stroke-dasharray="3 3" pointer-events="none"/>`);
        out.push(`<rect class="box-hit line-hit" data-box="${pin.top}|${pin.bottom}|przypięta-linia|1|${pin.i0}|${lastReal}" style="cursor:pointer" x="${lx0.toFixed(1)}" y="${(lyT - 6).toFixed(1)}" width="${Math.max(2, lx1 - lx0).toFixed(1)}" height="${Math.max(12, lyS - lyT + 12).toFixed(1)}" fill="transparent"><title>📌 Dotknij, by wybrać (przybliż / odepnij)</title></rect>`);
        [[pin.top, lcol], [pin.bottom, "#ff6b6b"]].forEach(([v, col]) => {
            const yy = y(v);
            out.push(`<rect x="${W - L.right}" y="${(yy - fs(7.5)).toFixed(1)}" width="${L.right - 2}" height="${fs(15)}" rx="2" fill="${col}" pointer-events="none"/><text x="${W - L.right + 3}" y="${(yy + fs(4)).toFixed(1)}" font-size="${fs(10)}" font-weight="700" fill="#0e0f13" pointer-events="none">${(+v).toFixed(2)}</text>`);
        });
    } else if (pin) {
        const px0 = x(Math.max(start, Math.min(endExcl - 1, pin.i0))) - bw / 2, px1 = W - L.right;
        const pyT = y(pin.top), pyB = y(pin.bottom), pyZ = y(pin.bottom * (1 - DARVAS_STOP_PCT / 100));
        const ps = darvasPinStatus({ top: pin.top, bottom: pin.bottom }, full.c[lastReal]);
        const pcol = ps.state === "ABOVE" ? "#4ee08a" : ps.state === "INSIDE" ? "#ffd166" : "#ff6b6b";
        out.push(`<rect x="${px0.toFixed(1)}" y="${pyB.toFixed(1)}" width="${Math.max(0, px1 - px0).toFixed(1)}" height="${Math.max(2, pyZ - pyB).toFixed(1)}" fill="url(#darvasHatch)" fill-opacity="0.7" pointer-events="none"/>`);
        out.push(`<rect class="${opts.pinFlash ? "pin-flash" : ""}" x="${px0.toFixed(1)}" y="${pyT.toFixed(1)}" width="${Math.max(0, px1 - px0).toFixed(1)}" height="${(pyB - pyT).toFixed(1)}" fill="${pcol}" fill-opacity="0.08" stroke="${pcol}" stroke-width="2.4" stroke-dasharray="7 4" pointer-events="none"><title>📌 Monitorowany box ${pin.bottom}–${pin.top}: ${ps.text}</title></rect>`);
        out.push(`<rect class="box-hit" data-box="${pin.top}|${pin.bottom}|przypięty|1|${pin.i0}|${lastReal}" style="cursor:pointer" x="${px0.toFixed(1)}" y="${pyT.toFixed(1)}" width="${Math.max(0, px1 - px0).toFixed(1)}" height="${Math.max(2, pyZ - pyT).toFixed(1)}" fill="transparent"><title>📌 Dotknij, by wybrać (przybliż / odepnij)</title></rect>`);   // przypięty box też da się wybrać: pasek akcji ma wtedy „Odepnij”
        const pinWord = ps.state === "ABOVE" ? "wybił" : ps.state === "INSIDE" ? "w boxie" : ps.state === "ZONE" ? "STREFA ZAGROŻENIA" : "EXIT";
        const pinText = `📌 ${pinWord}`, pinSz = fs(12), pinW = pinText.length * pinSz * 0.62;
        const pinCx = (px0 + px1) / 2, pinCy = (pyT + pyB) / 2 + pinSz * 0.35;
        const pinSpots = [pinCy, pyB - 5];   // najpierw środek boxa; gdy zajęty przez inny podpis (np. nazwa wzorca) — przy dolnej krawędzi
        const free = yy => !takenLabels.some(r => pinCx - pinW / 2 < r.x1 && pinCx + pinW / 2 > r.x0 && yy - pinSz * 1.15 < r.y1 && yy > r.y0);
        const inY = pinSpots.find(free), inOk = fitsInside(pinText, pinSz, px1 - px0, pyB - pyT) && inY !== undefined;
        const pinAttr = `font-size="${pinSz}" font-weight="700" fill="${pcol}" stroke="#0e0f13" stroke-width="3" paint-order="stroke" pointer-events="none"`;
        if (inOk) {   // wewnątrz przypiętego boxa, przy dolnej krawędzi (u góry zwykle jest podpis wzorca)
            takenLabels.push({ x0: pinCx - pinW / 2, x1: pinCx + pinW / 2, y0: inY - pinSz * 1.15, y1: inY });
            out.push(`<text x="${pinCx.toFixed(1)}" y="${inY.toFixed(1)}" text-anchor="middle" ${pinAttr}>${escapeHtml(pinText)}</text>`);
        } else if (ps.state === "ZONE" || ps.state === "EXIT") {   // ostrzeżenia zostają zawsze, nad boxem; zwykły status koloruje obrys (zielony / złoty)
            const pinX = Math.max(L.left + 2, Math.min(px0 + 4, W - L.right - pinW - 2));   // podpis nie wychodzi na oś cen
            out.push(`<text x="${pinX.toFixed(1)}" y="${placeLabelY(pinX, Math.max(L.top + fs(11), pyT - 5), pinText, pinSz, "start").toFixed(1)}" ${pinAttr}>${escapeHtml(pinText)}</text>`);
        }
        [[pin.top, pcol], [pin.bottom, pcol], [pin.bottom * (1 - DARVAS_STOP_PCT / 100), "#ff6b6b"]].forEach(([v, col]) => {
            const yy = y(v);
            out.push(`<rect x="${W - L.right}" y="${(yy - fs(7.5)).toFixed(1)}" width="${L.right - 2}" height="${fs(15)}" rx="2" fill="${col}" pointer-events="none"/><text x="${W - L.right + 3}" y="${(yy + fs(4)).toFixed(1)}" font-size="${fs(10)}" font-weight="700" fill="#0e0f13" pointer-events="none">${(+v).toFixed(2)}</text>`);
        });
    }
    // wykres liniowy punktowy cen zamknięcia tygodni — rysowany tylko POZA boxami (maska wycina prostokąty boxów), więc widać, czy wybicie to pierwsze zamknięcie
    // nad boxem, czy cena jest już daleko ponad; linia biegnie też nad boxami (kolorowe boxy są czytelne)
    {
        const pts = [];
        for (let i = start; i < Math.min(endExcl, lastReal + 1); i++) if (Number.isFinite(full.c[i])) pts.push([x(i), y(full.c[i]), i]);
        if (pts.length > 1) {
            const line = pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
            const UP = "#4ee08a", DOWN = "#ff6b6b", FLAT = "#9aa0ab";
            const dir = k => k === 0 ? FLAT : full.c[pts[k][2]] >= full.c[pts[k - 1][2]] ? UP : DOWN;   // kolor odcinka i kropki: zielony = zamknięcie wyżej niż poprzednie, czerwony = niżej
            out.push(`<g pointer-events="none">`
                + `<polyline points="${line}" fill="none" stroke="#0e0f13" stroke-width="${fs(3.4)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.55"/>`
                + pts.slice(1).map((p, k) => `<line x1="${pts[k][0].toFixed(1)}" y1="${pts[k][1].toFixed(1)}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="${dir(k + 1)}" stroke-width="${fs(1.8)}" stroke-linecap="round"/>`).join("")
                + pts.map((p, k) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${fs(2.6)}" fill="${dir(k)}" stroke="#0e0f13" stroke-width="0.8"><title>${full.weeks && full.weeks[p[2]] ? full.weeks[p[2]] + " · " : ""}zamknięcie ${full.c[p[2]]}</title></circle>`).join("")
                + `</g>`);
        }
    }
    // SMA 20 tygodni z zamknięć (liczona na całej historii, więc okno / suwak nie zmienia wartości); poza skalą ceny jest przycięta, nie wpływa na zakres osi
    {
        const sm = darvasSma(full.c, 20), pts = [];
        for (let i = start; i < Math.min(endExcl, lastReal + 1); i++) if (sm[i] !== null) pts.push(`${x(i).toFixed(1)},${y(sm[i]).toFixed(1)}`);
        if (pts.length > 1) {
            const lastI = (() => { for (let i = Math.min(endExcl, lastReal + 1) - 1; i >= start; i--) if (sm[i] !== null) return i; return -1; })();
            out.push(`<clipPath id="darvasSmaClip"><rect x="${L.left}" y="${L.top}" width="${W - L.left - L.right}" height="${ph}"/></clipPath>`
                + `<g clip-path="url(#darvasSmaClip)" pointer-events="none"><polyline points="${pts.join(" ")}" fill="none" stroke="#0e0f13" stroke-width="${fs(3.2)}" opacity="0.5" stroke-linejoin="round"/>`
                + `<polyline points="${pts.join(" ")}" fill="none" stroke="#f0b429" stroke-width="${fs(1.5)}" stroke-linejoin="round"><title>SMA 20 tygodni</title></polyline>`
                + `</g>`
                + (lastI >= 0 && Number.isFinite(sm[lastI]) && y(sm[lastI]) > L.top + 10 && y(sm[lastI]) < L.top + ph ? `<text x="${(x(lastI) - 6).toFixed(1)}" y="${(y(sm[lastI]) + 14).toFixed(1)}" text-anchor="end" font-size="${fs(9)}" font-weight="700" fill="#f0b429" stroke="#0e0f13" stroke-width="2.5" paint-order="stroke" pointer-events="none">SMA 20</text>` : ""));
        }
    }
    const lastC = full.c[lastReal], lastPrev = (() => { for (let i = lastReal - 1; i >= 0; i--) if (Number.isFinite(full.c[i])) return full.c[i]; return null; })();
    if (lastReal >= start && lastReal < endExcl) out.push(`<circle cx="${x(lastReal).toFixed(1)}" cy="${y(lastC).toFixed(1)}" r="${fs(3.5)}" fill="${lastPrev === null ? "#9aa0ab" : lastC >= lastPrev ? "#4ee08a" : "#ff6b6b"}" stroke="#0e0f13" stroke-width="1" pointer-events="none"><title>Ostatnie zamknięcie ${lastC}</title></circle>`);
    // podświetlenie poziomów (ustawiane w attachDarvasHover): 3 linie podziałki (góra boxa, dół, dół strefy zagrożenia) z ceną na osi — widoczne tylko przy najechaniu / przytrzymaniu boxa
    for (let k = 0; k < 3; k++) {
        out.push(`<line id="dHl${k}" x1="${L.left}" x2="${W - L.right}" y1="0" y2="0" stroke="#ffffff" stroke-width="1.6" opacity="0" pointer-events="none"/>`);
        out.push(`<g id="dHt${k}" opacity="0" pointer-events="none"><rect x="${W - L.right}" y="0" width="${L.right - 1}" height="${fs(14)}" rx="2" fill="#ffffff"/><text x="${W - L.right + 3}" y="0" font-size="${fs(9.5)}" font-weight="700" fill="#0e0f13"></text></g>`);
    }
    // panel pod wykresem, ukryty, pokazuje się po zaznaczeniu boxa (attachDarvasHover): trzy pasma — MACD (12, 26, 9) tygodniowy, wolumen tygodnia i NATR (14 tyg.) — żeby było widać,
    // gdzie leżą linie MACD i sygnału, czy wybicie miało wolumen i czy box jest ciasny (NATR < 8) względem boxa. Zakres tygodni zaznaczonego boxa jest podświetlony (dMacdSpan).
    // Oś czasu ta sama co wykres, panel zasłania tylko dół obszaru wykresu na czas zaznaczenia.
    if (typeof macdSeries === "function") {
        const ms = macdSeries(full.c), pH = Math.max(150, Math.min(250, ph * 0.44)), pY1 = H - L.bottom - 58, pY0 = pY1 - pH, pW = W - L.left - L.right;
        const mH = pH * 0.5, vH = pH * 0.25, nH = pH * 0.25, vY0 = pY0 + mH, nY0 = vY0 + vH;
        const idx = []; for (let i = start; i < Math.min(endExcl, lastReal + 1); i++) if (ms.macd[i] !== null) idx.push(i);
        if (idx.length > 2) {
            const vals = idx.flatMap(i => [ms.macd[i], ms.signal[i] ?? 0, ms.hist[i] ?? 0]);
            const amp = Math.max(...vals.map(Math.abs)) * 1.1 || 1, ym = v => pY0 + 6 + (mH - 12) * (1 - (v + amp) / (2 * amp));
            const lab = (yy, txt) => `<text x="${L.left + 6}" y="${(yy + fs(11)).toFixed(1)}" font-size="${fs(10)}" font-weight="700" fill="#cfd5e0" stroke="#0f141a" stroke-width="3" paint-order="stroke">${txt}</text>`;
            const g = [`<g id="dMacd" opacity="0" pointer-events="none">`, `<rect x="${L.left}" y="${pY0.toFixed(1)}" width="${pW}" height="${pH.toFixed(1)}" fill="#0f141a" fill-opacity="0.95" stroke="#2c3140"/>`,
                `<rect id="dMacdSpan" x="0" y="${pY0.toFixed(1)}" width="0" height="${pH.toFixed(1)}" fill="#ffd54a" fill-opacity="0.16"/>`,
                `<line x1="${L.left}" x2="${W - L.right}" y1="${ym(0).toFixed(1)}" y2="${ym(0).toFixed(1)}" stroke="#4a5262" stroke-dasharray="3 3"/>`,
                `<line x1="${L.left}" x2="${W - L.right}" y1="${vY0.toFixed(1)}" y2="${vY0.toFixed(1)}" stroke="#2c3140"/>`, `<line x1="${L.left}" x2="${W - L.right}" y1="${nY0.toFixed(1)}" y2="${nY0.toFixed(1)}" stroke="#2c3140"/>`];
            const bwm = Math.max(1, pw / slots * 0.6);
            idx.forEach(i => { const h = ms.hist[i]; if (h === null) return; const yy = ym(h), y0 = ym(0); g.push(`<rect x="${(x(i) - bwm / 2).toFixed(1)}" y="${Math.min(yy, y0).toFixed(1)}" width="${bwm.toFixed(1)}" height="${Math.max(0.5, Math.abs(yy - y0)).toFixed(1)}" fill="${h >= 0 ? "#2e9e5b" : "#c0504d"}" fill-opacity="0.8"/>`); });
            const poly = arr => idx.filter(i => arr[i] !== null).map(i => `${x(i).toFixed(1)},${ym(arr[i]).toFixed(1)}`).join(" ");
            g.push(`<polyline points="${poly(ms.macd)}" fill="none" stroke="#6ea8ff" stroke-width="${fs(1.8)}" stroke-linejoin="round"/>`, `<polyline points="${poly(ms.signal)}" fill="none" stroke="#ff9f43" stroke-width="${fs(1.6)}" stroke-linejoin="round"/>`);
            idx.forEach(i => {   // przecięcia: ▼ czerwony (MACD w dół pod sygnał = wyjście), ▲ zielony
                const a = ms.hist[i - 1], b = ms.hist[i];
                if (a === null || a === undefined || b === null) return;
                if (a >= 0 && b < 0) g.push(`<path d="M${x(i).toFixed(1)},${(ym(ms.macd[i]) + 3).toFixed(1)} l-4,-7 h8 z" fill="#ff6b6b" transform="rotate(180 ${x(i).toFixed(1)} ${(ym(ms.macd[i]) - 0.5).toFixed(1)})"/>`);
                else if (a < 0 && b >= 0) g.push(`<path d="M${x(i).toFixed(1)},${(ym(ms.macd[i]) - 3).toFixed(1)} l-4,7 h8 z" fill="#4ee08a"/>`);
            });
            g.push(lab(pY0, `MACD (12, 26, 9) tyg. · <tspan fill="#6ea8ff">MACD</tspan> · <tspan fill="#ff9f43">sygnał</tspan> · ▼ MACD pod sygnałem = wyjście`));
            // wolumen tygodnia: słupki zielone / czerwone wg kierunku zamknięcia, przerywana średnia z 10 poprzednich tygodni, złota obwódka = wolumen ≥ 1,4× średniej (reguła wybicia)
            const vv = full.v || [], cc = full.c || [];
            const wk = []; for (let i = start; i < Math.min(endExcl, lastReal + 1); i++) if (Number.isFinite(vv[i])) wk.push(i);
            if (wk.length > 2) {
                const vmax = Math.max(...wk.map(i => vv[i])) * 1.08 || 1, yv = v => vY0 + vH - 3 - (vH - 18) * (v / vmax);
                const avgAt = i => { const prev = []; for (let j = i - 10; j < i; j++) if (Number.isFinite(vv[j])) prev.push(vv[j]); return prev.length >= 5 ? prev.reduce((a, b2) => a + b2, 0) / prev.length : null; };
                wk.forEach(i => {
                    const up = !(Number.isFinite(cc[i - 1]) && cc[i] < cc[i - 1]), av = avgAt(i), big = av !== null && vv[i] >= DARVAS_BREAKOUT_VOL * av, yy = yv(vv[i]);
                    g.push(`<rect x="${(x(i) - bwm / 2).toFixed(1)}" y="${yy.toFixed(1)}" width="${bwm.toFixed(1)}" height="${Math.max(0.5, vY0 + vH - 3 - yy).toFixed(1)}" fill="${up ? "#2e9e5b" : "#c0504d"}" fill-opacity="0.85"${big ? ` stroke="#ffd54a" stroke-width="1.4"` : ""}/>`);
                });
                const avgPts = wk.map(i => [i, avgAt(i)]).filter(p2 => p2[1] !== null).map(p2 => `${x(p2[0]).toFixed(1)},${yv(p2[1]).toFixed(1)}`).join(" ");
                if (avgPts) g.push(`<polyline points="${avgPts}" fill="none" stroke="#cfd5e0" stroke-width="${fs(1.2)}" stroke-dasharray="4 3"/>`);
                g.push(lab(vY0, `Wolumen tyg. · przerywana = średnia 10 tyg. · złota obwódka ≥ ${DARVAS_BREAKOUT_VOL}× średniej`));
            }
            // NATR (14 tyg.): linia, zielona strefa poniżej 8 (Blueprint), przerywany próg 8
            const nt = natrSeries(full.h || [], full.l || [], full.c || []);
            const ni = []; for (let i = start; i < Math.min(endExcl, lastReal + 1); i++) if (nt[i] !== null) ni.push(i);
            if (ni.length > 2) {
                const nmax = Math.max(12, ...ni.map(i => nt[i])) * 1.1, yn = v => nY0 + nH - 3 - (nH - 18) * (v / nmax);
                g.push(`<rect x="${L.left}" y="${yn(NATR_GOOD).toFixed(1)}" width="${pW}" height="${(nY0 + nH - 3 - yn(NATR_GOOD)).toFixed(1)}" fill="#2e9e5b" fill-opacity="0.12"/>`,
                    `<line x1="${L.left}" x2="${W - L.right}" y1="${yn(NATR_GOOD).toFixed(1)}" y2="${yn(NATR_GOOD).toFixed(1)}" stroke="#4ee08a" stroke-dasharray="4 3" stroke-opacity="0.7"/>`,
                    `<polyline points="${ni.map(i => `${x(i).toFixed(1)},${yn(nt[i]).toFixed(1)}`).join(" ")}" fill="none" stroke="#b57cff" stroke-width="${fs(1.8)}" stroke-linejoin="round"/>`);
                g.push(lab(nY0, `NATR (14 tyg.) · zielone pole = poniżej ${NATR_GOOD} (ciasna konsolidacja) · teraz ${nt[ni[ni.length - 1]].toFixed(1)} %`));
            }
            g.push(`</g>`);
            out.push(g.join(""));
        }
    }
    return `<svg id="chartSvg" data-geom="${[W, H, L.left, L.right, L.top, L.bottom, start, slots, lo, hi].join(",")}" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Pudełka Darvasa ${escapeHtml(full.ticker || "")}">${out.join("")}</svg>`;
}

// Zaznaczanie boxa na Dar-Card (stuknięcie / kliknięcie, bez przytrzymania): podświetla istniejące poziome linie podziałki najbliżej góry boxa, jego dołu i dołu strefy zagrożenia
// (z ceną na osi) i pokazuje pasek akcji „🔍 Przybliż / 📌 Przypnij / ✕”. Stuknięcie w puste miejsce odznacza. Na komputerze podświetlenie działa też przy samym najechaniu.
// Poza zaznaczonym boxem nic nie jest rysowane — wykres zostaje czysty.
function attachDarvasHover(container, full, readoutEl) {
    const svg = container.querySelector("svg#chartSvg");
    if (!svg || !svg.dataset.geom) return;
    const g = svg.dataset.geom.split(",").map(Number);
    if (g.length < 10 || g.some(v => !Number.isFinite(v))) return;
    const [, H, , , top, bottom, , , lo, hi] = g;
    const ph = H - top - bottom, qStep = Math.exp(Math.log(hi / lo) / 80);
    const yOf = v => top + ph * (1 - Math.log(v / lo) / Math.log(hi / lo));
    const lines = [0, 1, 2].map(k => svg.querySelector("#dHl" + k)), tags = [0, 1, 2].map(k => svg.querySelector("#dHt" + k));
    const cols = ["#4ee08a", "#ffffff", "#ff6b6b"];
    let base = null, shown = null, selected = null;
    const bar = document.createElement("div");
    bar.className = "box-select-bar"; bar.hidden = true;
    container.appendChild(bar);
    const clear = () => {
        shown = null;
        lines.concat(tags).forEach(e => e.setAttribute("opacity", "0"));
        if (readoutEl && base !== null) readoutEl.textContent = base;
    };
    const isLineBox = el => ["linia", "przypięta-linia"].includes(el.dataset.box.split("|")[2]);
    const show = el => {
        const [t, bt] = el.dataset.box.split("|").map(Number);
        if (!(t > bt) || shown === el) return;
        shown = el;
        if (base === null && readoutEl) base = readoutEl.textContent;
        const isLine = isLineBox(el);
        const lv = isLine ? [t, bt] : [t, bt, bt * (1 - DARVAS_STOP_PCT / 100)];   // sam top: wejście i stop 8 %, bez strefy zagrożenia
        if (isLine) { lines[2].setAttribute("opacity", "0"); tags[2].setAttribute("opacity", "0"); lines[1].setAttribute("stroke", "#ff6b6b"); }
        lv.forEach((v, k) => {
            const ys = yOf(qStep > 1 ? lo * Math.pow(qStep, Math.round(Math.log(v / lo) / Math.log(qStep))) : v);   // najbliższa linia podziałki
            lines[k].setAttribute("y1", ys.toFixed(1)); lines[k].setAttribute("y2", ys.toFixed(1)); lines[k].setAttribute("stroke", isLine ? ["#3b9cff", "#ff6b6b"][k] : cols[k]); lines[k].setAttribute("opacity", "0.95");
            const rect = tags[k].querySelector("rect"), txt = tags[k].querySelector("text"), th = +rect.getAttribute("height");
            rect.setAttribute("y", (ys - th / 2).toFixed(1)); rect.setAttribute("fill", isLine ? ["#3b9cff", "#ff6b6b"][k] : cols[k]);
            txt.setAttribute("y", (ys + th / 3).toFixed(1)); txt.textContent = v.toFixed(2); tags[k].setAttribute("opacity", "1");
        });
        if (readoutEl) readoutEl.textContent = isLine ? `top ${t.toFixed(2)} (dół niepotwierdzony) · stop ${DARVAS_LINE_STOP_PCT} % = ${bt.toFixed(2)}` : `box ${bt.toFixed(2)}–${t.toFixed(2)} · strefa zagrożenia do ${lv[2].toFixed(2)}`;
    };
    const mark = el => {
        svg.querySelectorAll("[data-sel]").forEach(e => {
            ["stroke", "stroke-width", "stroke-dasharray"].forEach((a, i) => { const v = e.dataset["o" + i]; if (v === undefined || v === "") e.removeAttribute(a); else e.setAttribute(a, v); });
            delete e.dataset.sel;
        });
        if (!el) return;
        ["stroke", "stroke-width", "stroke-dasharray"].forEach((a, i) => { el.dataset["o" + i] = el.getAttribute(a) || ""; });
        el.dataset.sel = "1";
        el.setAttribute("stroke", "#ffd54a"); el.setAttribute("stroke-width", "2.6"); el.setAttribute("stroke-dasharray", "6 3");
    };
    const macdG = svg.querySelector("#dMacd"), macdSpan = svg.querySelector("#dMacdSpan");
    const macdShow = el => {   // panel MACD pod wykresem + podświetlony zakres tygodni zaznaczonego boxa
        if (!macdG) return;
        if (!el) { macdG.setAttribute("opacity", "0"); return; }
        const f = el.dataset.box.split("|"), i0 = +f[4], i1 = +f[5], [W0, , gl, gr, , , st, sl] = g, pw0 = W0 - gl - gr;
        if (macdSpan && Number.isFinite(i0) && Number.isFinite(i1)) {
            const xa = gl + pw0 * (Math.max(st, i0) - st) / sl, xb = gl + pw0 * (Math.min(st + sl - 1, Math.max(i1, i0 + 1)) - st + 1) / sl;
            macdSpan.setAttribute("x", xa.toFixed(1)); macdSpan.setAttribute("width", Math.max(2, xb - xa).toFixed(1));
        }
        macdG.setAttribute("opacity", "1");
    };
    const deselect = () => { mark(null); selected = null; bar.hidden = true; clear(); macdShow(null); };
    const select = el => {
        mark(el);   // wybrany box dostaje złotą obwódkę
        selected = el; show(el); macdShow(el);
        const [t, bt] = el.dataset.box.split("|").map(Number);
        const isPinned = el.dataset.box.split("|")[2].startsWith("przypięt");
        bar.innerHTML = `<span>${isLineBox(el) ? `📏 top ${t.toFixed(2)} · stop ${bt.toFixed(2)}` : `📦 ${bt.toFixed(2)} – ${t.toFixed(2)}`}</span><button type="button" data-act="zoom">🔍 Przybliż</button><button type="button" data-act="pin">${isPinned ? "🗑 Odepnij" : "📌 Przypnij"}</button><button type="button" data-act="close" aria-label="Odznacz">✕</button>`;
        bar.hidden = false;
    };
    bar.addEventListener("click", ev => {
        const b = ev.target.closest("button");
        if (!b || !selected) return;
        ev.stopPropagation();
        const d = selected.dataset.box;
        if (b.dataset.act === "zoom" && typeof focusBoxFromData === "function") focusBoxFromData(d);
        else if (b.dataset.act === "pin" && typeof pinBoxFromData === "function") pinBoxFromData(d);
        else deselect();
    });
    let pick = null;
    const closePick = () => { if (pick) { pick.remove(); pick = null; } };
    const boxName = el => {
        const f = el.dataset.box.split("|");
        const ti = el.querySelector("title");
        const nm = f[2] === "przypięta-linia" ? "📌 Przypięty top" : f[2] === "linia" ? "Top bez potwierdzonego dołu" : f[2] === "przypięty" ? "📌 Przypięty box" : f[2] === "wzorzec" ? ((ti && ti.textContent.split(/[\n·]/)[0].trim()) || "Wzorzec") : "Box Darvasa";
        return f[2].endsWith("linia") ? `${nm} · ${(+f[0]).toFixed(2)} (stop ${(+f[1]).toFixed(2)})` : `${nm} · ${(+f[1]).toFixed(2)}–${(+f[0]).toFixed(2)}`;
    };
    const pickBox = (hits, ev) => {   // pop-out menu przy palcu: lista nakładających się boxów, wybór zaznacza (podświetla) dany box
        pick = document.createElement("div");
        pick.className = "box-pick";
        pick.innerHTML = `<div class="box-pick-title">Które pudełko podświetlić?</div>` + hits.map((h, i) => `<button type="button" data-i="${i}">${escapeHtml(boxName(h))}</button>`).join("");
        const cr = container.getBoundingClientRect();
        container.appendChild(pick);
        const w = pick.offsetWidth, hgt = pick.offsetHeight;
        pick.style.left = Math.max(4, Math.min(cr.width - w - 4, ev.clientX - cr.left - w / 2)) + "px";
        pick.style.top = Math.max(4, Math.min(cr.height - hgt - 70, ev.clientY - cr.top - hgt - 12)) + "px";
        pick.addEventListener("click", e => {
            const b = e.target.closest("button");
            e.stopPropagation();
            if (b) { const el2 = hits[+b.dataset.i]; closePick(); select(el2); }
        });
    };
    const addMode = () => typeof boxAddOn !== "undefined" && boxAddOn;   // tryb „＋ Box”: przeciąganie ma pierwszeństwo
    // zwykłe stuknięcie / kliknięcie nie przybliża i nie przypina (robi to pasek akcji) — przechwytujemy je przed delegowanymi obsługami w watchlist.js
    ["pointerdown", "click"].forEach(n => svg.addEventListener(n, ev => {
        if (addMode()) return;
        const el = ev.target.closest && ev.target.closest("[data-box]");
        if (n === "click") {
            closePick();
            // boxy leżą jeden na drugim: wszystkie pod palcem → gdy jest ich kilka, wyskakuje menu wyboru, który podświetlić
            const hits = [];
            (document.elementsFromPoint ? document.elementsFromPoint(ev.clientX, ev.clientY) : [el]).forEach(e => {
                const b = e && e.closest && e.closest("[data-box]");
                if (b && svg.contains(b) && !hits.some(h => h.dataset.box === b.dataset.box)) hits.push(b);
            });
            if (hits.length > 1) pickBox(hits, ev);
            else if (el && svg.contains(el)) select(el);
            else deselect();
        }
        ev.stopPropagation();
    }, true));
    svg.addEventListener("pointermove", ev => {
        if (selected || addMode() || ev.pointerType !== "mouse") return;
        const el = ev.target.closest && ev.target.closest("[data-box]");
        if (el && svg.contains(el)) show(el); else if (shown) clear();
    });
    svg.addEventListener("pointerleave", () => { if (!selected && shown) clear(); });
}

// ============================================================
// KARTA Z KSIĄŻKI („You Can Still Make It In The Market”, Darvas, rozdz. „How I draw / use the Dar-Card”) — drugi widok obok czasowego Dar-Card.
// Reguły z książki: góra = punkt oporu, którego cena nie przebija 3 kolejne okresy; dół = jak wyżej po spadku z góry; strefa zagrożenia = 5 % pod dołem.
// Używanie: akcja w najwyższym boxie = TRZYMAJ (wahania ignoruj); cena nad górą najwyższego boxa = KUP (stop 10 % przy pierwszym wybiciu);
// po utworzeniu NOWEGO, wyższego boxa cena pod jego dołem (w zacieniowanej strefie) = SPRZEDAJ; akcji spoza najwyższego boxa nie kupuj ani nie trzymaj.
// Punkt kupna „po dwóch kolejnych rosnących boxach” (s. 140). Dodatki spoza książki (wolumen, +10 %, MACD) są tylko OSTRZEŻENIAMI. Brak: wersja dla shortów.
// ============================================================
const DARCARD_WEEKS = 156;   // karta pokazuje boxy z ostatnich 3 lat (156 tygodni); przy krótszej historii (IPO) tyle, ile spółka istnieje

// Analiza karty: { boxes: łańcuch rosnących boxów (od najstarszego), topmost, rising (≥ 2 kolejne wyższe), status: {state, text, warnings[], top, bottom, zoneLow, stop, buyLine} }
// states: BUY (pierwsze zamknięcie nad górą), HOLD, READY (w pierwszym boxie, gotowy do kupna), SELL, OUT (poza najwyższym boxem), NONE
function darCardAnalyze(c, vol = null) {
    const all = darvasScan(c).boxes;   // TE SAME boxy co na Dar-Card (user: karta to tylko inna reprezentacja wyników)
    let lr = -1;
    c.forEach((v, i) => { if (Number.isFinite(v)) lr = i; });
    if (lr < 0 || !all.length) return { boxes: [], topmost: null, rising: false, status: { state: "NONE", text: "brak boxa Darvasa (za mało danych)", warnings: [] } };
    const chain = [all[all.length - 1]];
    for (let k = all.length - 2; k >= 0; k--) {
        const prev = all[k], cur = chain[0];
        if (prev.top < cur.top && !prev.cancelled && prev.outcome === "up") chain.unshift(prev); else break;
    }
    const from = lr - DARCARD_WEEKS + 1;   // okno 3 lat (min. rok to i tak mieści się w oknie); IPO: from < 0 = cała historia
    const boxes = all.filter(b => (b.end ?? b.i1) >= from).map(b => ({ ...b, inChain: chain.includes(b) })), topmost = chain[chain.length - 1], rising = chain.length >= 2;
    const r2 = v => Math.round(v * 100) / 100;
    const px = c[lr], prevPx = lr > 0 && Number.isFinite(c[lr - 1]) ? c[lr - 1] : null;
    const top = topmost.top, bottom = topmost.bottom, zoneLow = bottom * (1 - DARVAS_STOP_PCT / 100);
    const base = { top: r2(top), bottom: r2(bottom), zoneLow: r2(zoneLow), buyLine: r2(top) };
    const warnings = [];
    let state, text, stop = null;
    if (px > top) {
        const entry = prevPx !== null && prevPx <= top ? px : top;
        if (prevPx !== null && prevPx <= top) {
            state = "BUY"; stop = darvasInitialStop(top, bottom, px);
            text = `KUP — zamknięcie nad górą najwyższego boxa ${r2(top)}${rising ? " (po dwóch kolejnych wyższych boxach)" : ""}; stop ${DARVAS_START_STOP_PCT} % przy pierwszym wybiciu: ${stop}`;
            if (vol && Number.isFinite(vol[lr])) {
                const pv = vol.slice(Math.max(0, lr - DARVAS_VOL_WEEKS), lr).filter(Number.isFinite);
                if (pv.length >= 4) { const vr = vol[lr] / (pv.reduce((a, b) => a + b, 0) / pv.length); if (vr < DARVAS_BREAKOUT_VOL) warnings.push(`wolumen wybicia tylko ${vr.toFixed(2)}× średniej (zwykle ≥ ${DARVAS_BREAKOUT_VOL}×)`); }
            }
        } else { state = "HOLD"; text = `TRZYMAJ — cena nad górą boxa ${r2(top)}, czekamy na nowy wyższy box; ignoruj wahania`; stop = r2(zoneLow); }
        if ((px / top - 1) * 100 > DARVAS_MAX_EXT_PCT) warnings.push(`cena ${((px / top - 1) * 100).toFixed(1)} % nad górą — nie goń`);
        void entry;
    } else if (px >= bottom) {
        if (rising || topmost.outcome === "up") { state = "HOLD"; text = `TRZYMAJ — cena w najwyższym boxie ${r2(bottom)}–${r2(top)}; ignoruj wahania, stop pod strefą zagrożenia ${r2(zoneLow)}`; stop = r2(zoneLow); }
        else { state = "READY"; text = `GOTOWY DO KUPNA — cena w pierwszym boxie ${r2(bottom)}–${r2(top)}; kup po zamknięciu nad ${r2(top)}, stop ${DARVAS_START_STOP_PCT} % (${r2(top * (1 - DARVAS_START_STOP_PCT / 100))})`; stop = r2(top * (1 - DARVAS_START_STOP_PCT / 100)); }
    } else if (rising || topmost.outcome === "up") {
        state = "SELL"; text = `SPRZEDAJ — ${rising ? "po nowym, wyższym boxie " : "po wybiciu "}cena spadła pod dół boxa ${r2(bottom)}${px >= zoneLow ? " (w zacieniowanej strefie zagrożenia)" : " (pod strefą zagrożenia)"}`;
    } else {
        state = "OUT"; text = `POZA BOXEM — cena ${r2(px)} pod dołem ${r2(bottom)}; nie ma powodu, by trzymać ani kupować akcję spoza najwyższego boxa`;
    }
    if ((state === "HOLD" || state === "BUY") && typeof darvasMacdBelow === "function" && darvasMacdBelow(c) === true) warnings.push("tygodniowy MACD pod linią sygnału");
    return { boxes, topmost, rising, status: { ...base, state, text, stop, warnings } };
}

// „Past Price Range” z dołu karty: max / min zamknięć w kolejnych latach kalendarzowych (do 4 ostatnich).
function darCardPastRange(weeks, c) {
    const by = {};
    c.forEach((v, i) => { const d = weeks && weeks[i]; if (!d || !Number.isFinite(v)) return; const y = d.slice(0, 4), e = by[y] || (by[y] = { hi: v, lo: v }); e.hi = Math.max(e.hi, v); e.lo = Math.min(e.lo, v); });
    return Object.keys(by).sort().slice(-4).map(y => ({ year: y, hi: Math.round(by[y].hi * 100) / 100, lo: Math.round(by[y].lo * 100) / 100 }));
}

// Karta jak w książce: papier w linie, oś cen po lewej, boxy OBOK SIEBIE od najstarszego (nie w skali czasu), biały box + ciemny pas strefy zagrożenia pod dołem,
// cienka linia punktu kupna tuż nad górą najwyższego boxa, kropka = bieżące zamknięcie, u dołu spółka i tabelka „Past Price Range”.
function darCardSvg(full, opts = {}) {
    const W = opts.fit ? opts.fit.w : 1000, H = opts.fit ? opts.fit.h : 710, compact = !!opts.compact;
    const fs = v => Math.round(v * (compact ? 1.25 : 1) * 10) / 10;
    const a = darCardAnalyze(full.c, full.v);
    if (!a.boxes.length) return `<svg viewBox="0 0 ${W} ${H}" width="100%"><text x="20" y="30" fill="#8a8f9c" font-size="14">Za mało danych na kartę Darvasa.</text></svg>`;
    const range = darCardPastRange(full.weeks, full.c);
    const tableH = fs(16) * (range.length + 1) + 8;
    const L = { left: compact ? 40 : 48, right: 8, top: fs(44), bottom: tableH + fs(36) };
    const pw = W - L.left - L.right, ph = H - L.top - L.bottom;
    const lastReal = full.c.reduce((q, v, i) => (Number.isFinite(v) ? i : q), -1), px = full.c[lastReal];
    const st = a.status;
    const lo0 = Math.min(px, ...a.boxes.map(b => b.bottom * (1 - DARVAS_STOP_PCT / 100))), hi0 = Math.max(px, ...a.boxes.map(b => b.top));
    const span = Math.log(hi0 / lo0) || 0.1, lo = lo0 * Math.exp(-0.08 * span), hi = hi0 * Math.exp(0.08 * span);
    const y = v => L.top + ph * (1 - Math.log(v / lo) / Math.log(hi / lo));
    const out = [`<defs><pattern id="dcHatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#111"/><line x1="0" y1="0" x2="0" y2="4" stroke="#000" stroke-width="2.2"/></pattern></defs>`];
    out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#e9e4d2"/>`);   // kartka papieru
    const qStep = Math.exp(Math.log(hi / lo) / 70);
    for (let v = lo * qStep; v < hi; v *= qStep) out.push(`<line x1="${L.left}" x2="${W - L.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#b9b49f" stroke-width="0.7"/>`);
    const ticks = logTicks(lo, hi).length >= 3 ? logTicks(lo, hi) : niceTicks(lo, hi, compact ? 6 : 8);
    ticks.forEach(t => {
        out.push(`<line x1="${L.left}" x2="${W - L.right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#8b8670" stroke-width="1"/>`);
        out.push(`<text x="${L.left - 4}" y="${(y(t) + 3.5).toFixed(1)}" font-size="${fs(9.5)}" fill="#3a3730" text-anchor="end">${t}</text>`);
    });
    out.push(`<text x="${L.left + 6}" y="${fs(16)}" font-size="${fs(14)}" font-weight="800" fill="#2b2a24" letter-spacing="2">DAR·CARD</text><text x="${W - L.right - 4}" y="${fs(16)}" font-size="${fs(10)}" fill="#5a574a" text-anchor="end">${Math.min(3, Math.round((lastReal + 1) / 52 * 10) / 10)} l.</text>`);
    const n = a.boxes.length, slot = pw / Math.max(n, 3), bw = slot * 0.72;
    const mon = i => { const d = full.weeks && full.weeks[i]; return d ? `${d.slice(5, 7)}/${d.slice(2, 4)}` : ""; };
    a.boxes.forEach((b, k) => {
        const x0 = L.left + slot * k + (slot - bw) / 2, yT = y(b.top), yB = y(b.bottom), yZ = y(b.bottom * (1 - DARVAS_STOP_PCT / 100));
        const topmost = b.i0 === a.topmost.i0;
        out.push(`<rect x="${x0.toFixed(1)}" y="${yT.toFixed(1)}" width="${bw.toFixed(1)}" height="${(yB - yT).toFixed(1)}" fill="#ffffff" stroke="${b.inChain || topmost ? "#111" : "#8b8670"}" stroke-width="${topmost ? 2.2 : 1.4}"${b.inChain || topmost ? "" : ' fill-opacity="0.6"'}/>`);
        out.push(`<text x="${(x0 + bw / 2).toFixed(1)}" y="${(H - tableH - fs(30)).toFixed(1)}" font-size="${fs(8.5)}" fill="#5a574a" text-anchor="middle">${mon(b.i0)}</text>`);
        out.push(`<rect x="${x0.toFixed(1)}" y="${yB.toFixed(1)}" width="${bw.toFixed(1)}" height="${(yZ - yB).toFixed(1)}" fill="url(#dcHatch)" stroke="#111" stroke-width="1"/>`);
        out.push(`<text x="${(x0 + bw / 2).toFixed(1)}" y="${(yT + fs(11)).toFixed(1)}" font-size="${fs(9)}" fill="#2b2a24" text-anchor="middle">${Math.round(b.top * 100) / 100}</text>`);
        out.push(`<text x="${(x0 + bw / 2).toFixed(1)}" y="${(yZ + fs(10)).toFixed(1)}" font-size="${fs(9)}" fill="#2b2a24" text-anchor="middle">${Math.round(b.bottom * 100) / 100}</text>`);
        if (topmost) {   // punkt kupna: cienka linia tuż nad górą najwyższego boxa + opis; kropka = bieżące zamknięcie
            const yb = y(b.top * 1.007), colr = st.state === "BUY" ? "#0a8f3c" : st.state === "SELL" ? "#c0262d" : "#1b5fbf";
            out.push(`<line x1="${(x0 - 6).toFixed(1)}" x2="${(x0 + bw + 6).toFixed(1)}" y1="${yb.toFixed(1)}" y2="${yb.toFixed(1)}" stroke="${colr}" stroke-width="2"/>`);
            const lbl = st.state === "BUY" ? "Kup — wybicie" : st.state === "SELL" ? "Sprzedaj" : st.state === "READY" || a.rising ? "Gotowy do kupna" : "Kup nad górą";
            out.push(`<text x="${(x0 + bw / 2).toFixed(1)}" y="${(yb - fs(14)).toFixed(1)}" font-size="${fs(10)}" font-weight="700" fill="${colr}" text-anchor="middle">${lbl}</text>`);
            out.push(`<circle cx="${(x0 + bw / 2).toFixed(1)}" cy="${y(px).toFixed(1)}" r="${fs(4.5)}" fill="#d4a017" stroke="#111" stroke-width="1.2"><title>Zamknięcie ${Math.round(px * 100) / 100}</title></circle>`);
        }
    });
    const ty = H - tableH - 4;   // dół karty: spółka i „Past Price Range”
    out.push(`<text x="${L.left + 6}" y="${ty - 4}" font-size="${fs(11)}" font-weight="700" fill="#2b2a24">${escapeHtml(opts.bookTitle || "")}</text>`);
    out.push(`<text x="${L.left + 6}" y="${ty + fs(13)}" font-size="${fs(10)}" font-weight="700" fill="#2b2a24">Past Price Range</text><text x="${L.left + 110 * (compact ? 1.25 : 1)}" y="${ty + fs(13)}" font-size="${fs(10)}" fill="#2b2a24">High</text><text x="${L.left + 160 * (compact ? 1.25 : 1)}" y="${ty + fs(13)}" font-size="${fs(10)}" fill="#2b2a24">Low</text>`);
    range.forEach((r, i) => {
        const yy = ty + fs(13) + fs(14) * (i + 1);
        out.push(`<text x="${L.left + 6}" y="${yy}" font-size="${fs(10)}" fill="#2b2a24">${r.year}</text><text x="${L.left + 110 * (compact ? 1.25 : 1)}" y="${yy}" font-size="${fs(10)}" fill="#2b2a24">${r.hi}</text><text x="${L.left + 160 * (compact ? 1.25 : 1)}" y="${yy}" font-size="${fs(10)}" fill="#2b2a24">${r.lo}</text>`);
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${out.join("")}</svg>`;
}

function darCardReadout(full) {
    const st = darCardAnalyze(full.c, full.v).status;
    return "Karta Darvasa (wg książki): " + st.text + (st.warnings.length ? " · ⚠ " + st.warnings.join("; ") : "");
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { darCardAnalyze, darCardPastRange, darCardSvg, darCardReadout, attachDarvasHover, darvasBoxes, darvasScan, darvasTopLines, darvasLineInfo, darvasSvg, darvasBoxInfo, darvasBoxSheetHtml, darvasStatus, darvasMacdBelow, darvasInitialStop, darvasPinStatus, darvasOverview, boxNatr, natrSeries, darvasSma, natrGrade, NATR_GOOD, darvasCupGeometry, darvasCupStatus, darvasFlatStatus, darvasPatternBoxes, DARVAS_CONFIRM, DARVAS_LINE_STOP_PCT, DARVAS_STOP_PCT, DARVAS_START_STOP_PCT, DARVAS_MIN_WEEKS };
}
