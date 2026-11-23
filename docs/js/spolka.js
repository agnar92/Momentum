// Karta spółki: podsumowanie, typ spółki, oceny, wskaźniki na tle 500 spółek (mediana 500 spółek jako odniesienie), strategie, wycena PEG i DCF (edytowalna), sprawozdania.
"use strict";
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const slug = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/\s+/g, "-");
    const t = (new URLSearchParams(location.search).get("t") || "NVDA").toUpperCase();
    // karta spółki GPW (?r=gpw): dane z data/gpw/spolki/, kwoty w zł, porównania na tle spółek GPW (gpw.py)
    const GPW = new URLSearchParams(location.search).get("r") === "gpw";
    if (GPW) W.WALUTA = "zł";
    const WAL = GPW ? "zł" : "USD", ZB = GPW ? "spółek GPW" : "500 spółek", ZB2 = GPW ? "spółek GPW (WIG20 + mWIG40 + sWIG80)" : "500 największych spółek";
    let K = null, M = null;
    const oc = (x) => `<span class="ocena ${W.klasaOceny(x)}">${W.ok(x) ? W.fmtNum(x, 1) : "–"}</span>`;
    const usdOs = (v) => W.fmtUsd(v, 0);

    const duz6 = () => { const s = K.strategie && K.strategie[W.DUZY]; return !!(s && s.length && s.every((x) => x[2])); };
    const jak77 = () => { const s = K.strategie && K.strategie[W.JAKOSC]; return !!(s && s.length && s.every((x) => x[2])); };
    function top() {
        const m = M;
        const fakty = [];
        if (W.ok(m.rev_1y)) fakty.push(`przychody ${W.fmtPct(m.rev_1y, 0, true)} r/r`);
        if (W.ok(m.nm)) fakty.push(`marża netto ${W.fmtPct(m.nm, 0)}`);
        if (W.ok(m.roe)) fakty.push(`ROE ${W.fmtPct(m.roe, 0)}`);
        if (W.ok(m.net_cash) && K.sector !== "Financial") fakty.push(m.net_cash >= 0 ? `więcej gotówki niż długu (${W.fmtUsd(m.net_cash)} ${WAL})` : `dług netto ${W.fmtUsd(-m.net_cash)} ${WAL}`);
        const typ = K.typy && K.typy[0];
        const wyc = K.etykieta ? `<div class="male" style="margin-top:6px">Wycena: <span class="pill p-${slug(K.etykieta)}">${esc(K.etykieta)}</span>${W.ok(m.peg) && m.peg > 0 ? ` PEG ${W.fmtNum(m.peg)}` : ""} · <a href="#wycena">szczegóły PEG / DCF ↓</a></div>` : "";
        $("top").innerHTML = `
          <div class="naglowek"><h1>${esc(K.n)} <span class="tick">${esc(K.t)}</span>${jak77() ? ' <span class="jakosc duzy" title="Spełnia wszystkie 7 kryteriów jakości — szczegóły w sekcji Strategie">✔ Jakość 7/7</span>' : ""}${duz6() ? ' <span class="jakosc duzy duzy-z" title="Duża spółka rosnąca od 10+ lat — PEG 1–2 to cena godziwa">🏛 Duży zwycięzca</span>' : ""}${M.dywidenda_stabilna ? ' <span class="jakosc duzy" title="Dywidenda co roku przez 5 lat, bez cięcia">💰 Stabilna dywidenda</span>' : ""}</h1>
            <div class="mut">${esc(K.sector || "")} · ${esc(K.industry || "")} · ${esc(K.country || "")}${K.www ? ` · <a href="${esc(K.www)}" target="_blank" rel="noopener">strona firmy</a>` : ""}</div>
            <div id="do-portfela" style="margin-top:10px"></div></div>
          <div class="siatka2">
            <div class="pole"><div class="mut male">W skrócie</div><p style="font-size:15px;margin:6px 0">${esc(fakty.join(", ") || "Brak danych z raportów.")}.</p>
              <div class="mut male">Miejsce #${K.rank} wg kapitalizacji · dane z ${esc(K.generated_at)}</div>${wyc}</div>
            <div class="pole"><div class="mut male">Typ spółki</div>
              ${typ ? `<div style="display:flex;justify-content:space-between;margin-top:6px"><b style="font-size:17px">${esc(typ[0])}</b><span class="mut male">dopasowanie ${typ[1]} %</span></div>
              <div class="dopas"><i style="width:${typ[1]}%"></i></div><div class="mut male">${esc(typ[2])}</div>
              <details style="margin-top:8px"><summary class="mut male">Wszystkie typy</summary>${K.typy.map((x) => `<div class="male" style="display:flex;justify-content:space-between"><span>${esc(x[0])}</span><span>${x[1]} %</span></div>`).join("")}</details>` : '<p class="mut">–</p>'}
            </div>
          </div>`;
        przyciskPortfela();
    }

    // --- portfel (localStorage `fundamenta_portfel`, strona portfel.html): spółkę do portfela dodaje użytkownik ---
    const PF_KLUCZ = "fundamenta_portfel";
    const czytajPf = () => { try { return JSON.parse(localStorage.getItem(PF_KLUCZ)) || {}; } catch (e) { return {}; } };
    function przyciskPortfela() {
        const el = $("do-portfela"); if (!el) return;
        if (GPW) { el.innerHTML = '<span class="mut male">Portfel obejmuje na razie spółki z USA.</span>'; return; }
        const pf = czytajPf(), jest = (pf.pozycje || []).some((p) => p.t === K.t);
        el.innerHTML = jest ? `<span class="pill p-niedowartosciowana">✓ W portfelu</span> <a href="portfel.html" style="color:inherit">przejdź do portfela →</a> <button id="pf-usun" class="male" style="margin-left:6px">Usuń z portfela</button>`
            : '<button id="pf-dodaj" class="akt">＋ Dodaj do portfela</button>';
        const zapisz = (v) => { try { localStorage.setItem(PF_KLUCZ, JSON.stringify(v)); } catch (e) { /* tryb prywatny */ } przyciskPortfela(); };
        if (jest) $("pf-usun").addEventListener("click", () => { if (window.confirm(`Usunąć ${K.t} z portfela (razem z liczbą akcji i średnim kosztem)?`)) zapisz({ ...pf, pozycje: pf.pozycje.filter((p) => p.t !== K.t) }); });
        else $("pf-dodaj").addEventListener("click", () => zapisz({ ...pf, pozycje: (pf.pozycje || []).concat([{ t: K.t, akcje: 0, koszt: null }]) }));
    }

    // --- własne dane użytkownika (brakujące wskaźniki, np. młoda spółka): localStorage, ocena przeliczana w przeglądarce ---
    const WL_KLUCZ = "fundamenta_wlasne";
    const czytajWl = () => { try { return JSON.parse(localStorage.getItem(WL_KLUCZ)) || {}; } catch (e) { return {}; } };
    const zapiszWl = (v) => { try { localStorage.setItem(WL_KLUCZ, JSON.stringify(v)); } catch (e) { /* tryb prywatny */ } };
    let ORIG = null, ROZ = null, WL = {};
    function zastosuj() {
        K.pct = { ...ORIG.pct }; K.oceny = { ...ORIG.oceny }; M = { ...ORIG.m }; K.m = M;
        const roz = (ROZ && ROZ.wszystkie) || {};
        Object.entries(WL).forEach(([p, v]) => { M[p] = v; K.pct[p] = W.percentyl(roz[p], v, p); });
        if (Object.keys(WL).length) {
            K.oceny = W.ocenyZ(K.pct);
            const wsz = czytajWl();
            wsz[K.t] = { w: WL, o: K.oceny, d: K.generated_at };
            zapiszWl(wsz);
        }
    }
    function wlasne() {
        if (GPW) return "";
        const brak = W.POLA_WLASNE.filter(([p]) => !W.ok(ORIG.pct[p]) || p in WL);
        if (!brak.length) return "";
        const S = K.med500 || {};
        const wart = (p, j) => { const v = WL[p]; return W.ok(v) ? String(Math.round((j === "%" ? 100 * v : v) * 100) / 100).replace(".", ",") : ""; };
        const med = (p, j) => W.ok(S[p]) ? `mediana ${ZB} ${j === "%" ? W.fmtPct(S[p], 1) : W.fmtNum(S[p])}` : "";
        const n = Object.keys(WL).length;
        return `<details class="wlasne"${n ? " open" : ""}><summary>✎ ${n ? `Ocena uwzględnia Twoje dane (${n})` : "Uzupełnij brakujące dane samodzielnie"}</summary>
          <div class="mut male" style="margin:6px 0">Wpisz wartości, których brakuje (np. z raportu spółki). Ocena przeliczy się na tle wszystkich ${ZB}; dane zostają tylko w tej przeglądarce i widać je też na liście (✎).</div>
          <div class="pola-wlasne">${brak.map(([p, nz, j]) => `<label><span>${esc(nz)}${j ? " (%)" : ""}</span><input data-wl="${p}" data-j="${j}" inputmode="decimal" value="${wart(p, j)}" placeholder="${med(p, j)}"></label>`).join("")}</div>
          <div style="display:flex;gap:8px;margin-top:8px"><button id="wl-zapisz">Przelicz ocenę</button>${n ? '<button id="wl-usun" class="drugi">Usuń moje dane</button>' : ""}</div></details>`;
    }
    function podlaczWlasne() {
        const z = $("wl-zapisz"), u = $("wl-usun");
        if (z) z.addEventListener("click", () => {
            WL = {};
            document.querySelectorAll("[data-wl]").forEach((el) => {
                const s = el.value.trim().replace(/\s/g, "").replace(",", ".").replace("%", "");
                if (s === "" || isNaN(+s)) return;
                WL[el.dataset.wl] = el.dataset.j === "%" ? +s / 100 : +s;
            });
            if (!Object.keys(WL).length) { const wsz = czytajWl(); delete wsz[K.t]; zapiszWl(wsz); }
            zastosuj(); odswiez();
        });
        if (u) u.addEventListener("click", () => { WL = {}; const wsz = czytajWl(); delete wsz[K.t]; zapiszWl(wsz); zastosuj(); odswiez(); });
    }
    function odswiez() { top(); liczby(); metryki(); strategieOk(); }
    const strategieOk = () => { /* kryteria strategii liczone w danych (bez własnych wpisów) */ };

    let LISTA = null;
    function miejsceTxt(k) {
        if (!LISTA) return "";
        const wl = czytajWl();      // miejsca z uwzględnieniem własnych danych (tej i innych spółek)
        const o = (x) => x.t === K.t ? K.oceny : (wl[x.t] && wl[x.t].o) || x.o;
        const r = W.miejsce(LISTA, K.t, (x) => o(x) && o(x)[k]);
        return r ? ` · <span class="mut male">miejsce ${r.miejsce} z ${r.z}</span>` : "";
    }
    function liczby() {
        const m = M, z = K.zw || {}, o = K.oceny || {};
        const zw = (x, n) => `<div><small>${n}</small><b class="${x > 0 ? "plus" : x < 0 ? "minus" : ""}">${W.fmtPct(x, 1, true)}</b></div>`;
        const kp = K.kompletnosc;
        const ostrz = kp && kp.niepelne ? `<div class="ostrzezenie">⚠ <b>Niepełne dane:</b> ${kp.liczone} z ${kp.wszystkie} wskaźników${kp.kategorie && kp.kategorie.length ? ` (za mało w kategorii: ${kp.kategorie.map((g) => ({ wzrost: "Wzrost", sila: "Siła finansowa", wycena: "Wycena" })[g]).join(", ")})` : ""} — ocena może być zaburzona (np. młoda spółka bez historii albo spółka zagraniczna bez raportów w SEC). Sprawdź „Jak powstała ocena” przy wskaźnikach.</div>` : "";
        const sp = m.spadek_2l ? `<div class="ostrzezenie">⬇ <b>Fundamenty słabną 2 lata z rzędu:</b> ${esc(m.spadek_2l.join(" i "))} ${m.spadek_2l.length > 1 ? "spadają" : "spada"} rok do roku teraz i rok wcześniej — wg Twojej reguły sygnał do sprzedaży (badanie, etap 77: takie spółki w 5 lat średnio −4 pp względem średniej).</div>` : "";
        const ow = (K.ostrzezenia || []).length ? `<div class="ostrzezenie">❗ <b>Ostrzeżenia (realność prognozy, jakość zysku, zdarzenia):</b><ul style="margin:4px 0 0 18px;padding:0">${K.ostrzezenia.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
        $("liczby").innerHTML = ostrz + sp + ow + wlasne() + `
          <div class="wynik-glowny"><div><div style="font-size:12px;opacity:.7">OCENA OGÓLNA</div><div style="font-size:13px">na tle ${ZB2}</div></div>${oc(o.ogolna)}</div>
          ${[["Wzrost", o.wzrost, "wzrost"], ["Siła finansowa", o.sila, "sila"], ["Wycena (im wyżej, tym taniej)", o.wycena, "wycena"]].map(([n, v, k]) => `<div class="wiersz-oceny"><span>${n}${miejsceTxt(k)}</span>${oc(v)}</div>`).join("")}
          <div class="mut male" style="margin:6px 0">${miejsceTxt("ogolna").replace(" · ", "Ocena ogólna: ")} ${GPW ? "" : `· <a href="porownaj.html?t=${encodeURIComponent(K.t)}">porównaj z innymi spółkami →</a>`}</div>
          <div class="liczby" style="margin-top:12px">
            <div><small>Cena</small><b>${W.fmtCena(m.price)}</b></div><div><small>EPS (12 mies.)</small><b>${W.fmtNum(m.eps)}</b></div>
            <div><small>Kapitalizacja</small><b>${W.fmtUsd(m.mcap)}</b></div><div><small>Wielkość (kapit.)</small><b>#${K.rank}</b></div>
            ${zw(z["1t"], "1 tydzień")}${zw(z["1m"], "1 miesiąc")}${zw(z["1r"], "1 rok")}${zw(z["5l"], "5 lat")}
          </div>`;
        podlaczWlasne();
    }

    function wykresCeny(okres) {
        const el = $("wykres-ceny");
        el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2>Cena akcji</h2><div class="zakladki">
          <button data-o="1r" class="${okres === "1r" ? "akt" : ""}">1 rok</button><button data-o="5l" class="${okres === "5l" ? "akt" : ""}">5 lat</button></div></div><div id="cena-svg"></div>`;
        if (K.ceny) {
            const n = okres === "1r" ? 53 : K.ceny.c.length;
            WY.linia($("cena-svg"), K.ceny.d.slice(-n), K.ceny.c.slice(-n), (v) => (GPW ? W.fmtNum(v, 0) + " zł" : "$" + W.fmtNum(v, 0)));
        } else $("cena-svg").innerHTML = '<p class="mut">Brak notowań.</p>';
        el.querySelectorAll("button[data-o]").forEach((b) => b.addEventListener("click", () => wykresCeny(b.dataset.o)));
    }

    function metryki() {
        const m = M, p = K.pct || {};
        const S = K.med500 || {};
        // n: nazwa, v: wartość (tekst), pole: percentyl (ocena), med: [pole mediany, formatowanie, dopisek]
        const w = (n, v, pole, med) => {
            if (GPW && !(pole && W.ok(p[pole])) && /^[\s–·%]*(rocznie)?[\s–·%]*$/.test(String(v).replace(/<[^>]+>/g, ""))) return "";     // GPW: wskaźnika brak w danych
            const d = pole ? W.opisPercentyla(p[pole]) : null;
            const mtxt = med && W.ok(S[med[0]]) ? `<span class="mut male">mediana ${ZB}: ${med[1](S[med[0]])}${med[2] ? " " + med[2] : ""}</span>` : "";
            const moje = pole && pole in WL ? ' <span class="moje" title="Twoje dane">✎</span>' : "";
            return `<div class="wiersz"><span>${n}: <b>${v}</b>${moje}<br>${mtxt}</span>${d ? `<span class="${d.k}">${d.t}</span>` : ""}</div>`;
        };
        const zl = W.ok(m.hist_lat) ? ` (z ${W.fmtNum(m.hist_lat, 1)} lat — młoda spółka)` : "";
        const pr = (x) => W.fmtPct(x, 1), pz = (x) => W.fmtPct(x, 1, true), nm2 = (x) => W.fmtNum(x), cal = (x) => W.fmtNum(x, 0);
        const sklad = (g) => {
            const s = W.skladOceny(p, g, K.grupy);
            return `<details class="sklad"><summary>Jak powstała ocena ${W.fmtNum(K.oceny[g], 1)} (${s.liczone} wskaźników)</summary>
              ${s.el.map((x) => `<div class="pkt ${x.pkt === null ? "nie-liczy" : ""}"><span>${esc(x.nazwa)}</span><span class="pas"><i style="width:${x.pkt || 0}%"></i></span><b title="${x.pkt === null ? "brak danych — liczone jako 50 pkt (środek stawki)" : ""}">${x.pkt === null ? "50*" : x.pkt}</b></div>`).join("")}
              <div class="mut" style="margin-top:6px">Punkty = percentyl wśród ${ZB} (100 = najlepsza). Ocena = średnia punktów ÷ 10; 50* = brak danych, liczone neutralnie jako środek stawki (żeby brak danych nie zawyżał ani nie zaniżał oceny).</div></details>`;
        };
        $("metryki").innerHTML = `<h2>Wskaźniki spółki</h2><div class="pod">Porównanie ze wszystkimi ${GPW ? "spółkami GPW z listy" : "500 spółkami"} (top x % = lepiej niż 100 − x % spółek; przy wycenie „wyżej” = taniej). Pod wartością: mediana wszystkich ${ZB} jako punkt odniesienia.</div>
          <div class="kol3">
            <div class="kol k-wzrost"><div class="naglowek-kol">📈 Wzrost</div>
              ${w("Przychody 1 rok (12 mies.)", pz(m.rev_1y), "rev_1y", ["rev_1y", pz])}${w("Przychody kwartał r/r", pz(m.rev_q_yoy))}${w("Zysk netto 1 rok", pz(m.ni_1y), "ni_1y", ["ni_1y", pz])}
              ${w("Przychody 3 lata (łącznie)" + (m.hist_lat < 3 ? zl : ""), pz(m.rev_3y) + " · rocznie " + pr(m.rev_cagr3), "rev_cagr3", ["rev_cagr3", pr, "rocznie"])}${w("Zysk netto 3 lata", pz(m.ni_3y))}
              ${w("Przychody 5 lat (łącznie)" + zl, pz(m.rev_5y) + " · rocznie " + pr(m.rev_cagr5), "rev_cagr5", ["rev_cagr5", pr, "rocznie"])}${w("Zysk netto 5 lat" + (zl && W.ok(m.ni_5y) ? " (przeliczony na 5 lat)" : ""), pz(m.ni_5y), "ni_5y", ["ni_5y", pz])}
              ${w("Prognoza EPS (5 lat, rocznie)", pr(m.eps_next5), "eps_next5", ["eps_next5", pr])}${w("Lata z przychodami > 10 % (z 5)", W.ok(m.rev_lata_10) ? W.fmtNum(m.rev_lata_10, Number.isInteger(m.rev_lata_10) ? 0 : 1) + (m.rev_lata_n ? ` (przeliczone z ${m.rev_lata_n} lat)` : "") : "–", "rev_lata_10", ["rev_lata_10", cal])}
              ${w("Lata ze wzrostem zysku netto (z 5)", W.ok(m.zysk_lata) ? m.zysk_lata : "–", "zysk_lata", ["zysk_lata", cal])}
              ${w("Tempo przychodów (5 lat)", W.ok(m.przysp) ? (m.przysp > 0 ? "przyspiesza" : "zwalnia") + " (" + (m.przysp > 0 ? "+" : "−") + W.fmtNum(Math.abs(100 * m.przysp), 1) + " pp/rok)" : "–", "przysp")}
              <div class="wiersz"><span>Ocena wzrostu</span>${oc(K.oceny.wzrost)}</div>${sklad("wzrost")}</div>
            <div class="kol k-sila"><div class="naglowek-kol">🛡️ Siła finansowa</div>
              ${w("Marża brutto", pr(m.gm), "gm", ["gm", pr])}${w("Marża operacyjna", pr(m.om), "om", ["om", pr])}${w("Marża netto", pr(m.nm), "nm", ["nm", pr])}
              ${w("ROE", pr(m.roe), "roe", ["roe", pr])}${w("ROA", pr(m.roa), "roa", ["roa", pr])}${w("ROIC (zysk oper. po podatku ÷ kapitał zaangażowany)", pr(m.roic), "roic", ["roic", pr])}${w("ROCE", pr(m.roce), "roce", ["roce", pr])}
              ${w("Wolne przepływy (FCF, 12 mies.)", W.fmtUsd(m.fcf_ttm) + " " + WAL + " · marża " + pr(m.fcf_margin), "fcf_margin", ["fcf_margin", pr, "(marża FCF)"])}${w("Dług / kapitał", W.fmtNum(m.de), "de", ["de", nm2])}
              ${w("Gotówka − dług", W.fmtUsd(m.net_cash) + " " + WAL + " · " + pr(m.net_cash_mc) + " kapit.", "net_cash_mc", ["net_cash_mc", pr, "kapitalizacji"])}${w("Quick ratio", W.fmtNum(m.qr), "qr", ["qr", nm2])}${w("Liczba akcji, zmiana 3 lata", W.ok(m.akcje_3l) ? pz(m.akcje_3l) + (m.akcje_3l < -0.005 ? " (skup akcji)" : m.akcje_3l > 0.005 ? " (nowe akcje)" : "") : "–", "akcje_3l", ["akcje_3l", pz])}
              ${w("Capex / przychody (inwestycje w majątek)", pr(m.capex_przych), "capex_przych", ["capex_przych", pr])}${w("Wzrost kapitału własnego 3 lata (rocznie)", pz(m.kapital_3l), "kapital_3l", ["kapital_3l", pz])}
              ${w("Zysk dodatni (lata z 5)", W.ok(m.zysk_dodatni_lata) ? m.zysk_dodatni_lata + " z 5" : "–")}${w("Zmienność zysku 5 lat (mniej = stabilniej)", W.ok(m.zmiennosc_zysku) ? W.fmtNum(m.zmiennosc_zysku) : "–")}
              <div class="wiersz"><span>Ocena siły</span>${oc(K.oceny.sila)}</div>${sklad("sila")}</div>
            <div class="kol k-wycena"><div class="naglowek-kol">🏷️ Wycena</div>
              ${w("P/E", W.fmtNum(m.pe), "pe", ["pe", nm2])}${w("Forward P/E", W.fmtNum(m.fpe), null, ["fpe", nm2])}${w("P/S", W.fmtNum(m.ps), "ps", ["ps", nm2])}${w("P/B", W.fmtNum(m.pb), null, ["pb", nm2])}
              ${w(GPW ? "PEG (P/E ÷ wzrost zysku 3 lata)" : "PEG (P/E ÷ prognoza EPS 5 lat)", W.ok(m.peg) ? W.fmtNum(m.peg) : "–", "peg", ["peg", nm2])}${w("P/FCF", W.fmtNum(m.pfcf), "pfcf", ["pfcf", nm2])}
              ${w("Stopa FCF", pr(m.fcf_yield), "fcf_yield", ["fcf_yield", pr])}${w("Stopa dywidendy", pr(m.div), null, ["div", pr])}${w("Potencjał DCF", pz(m.dcf_pot), "dcf_pot", ["dcf_pot", pz])}
              <div class="wiersz"><span>Ocena wyceny</span>${oc(K.oceny.wycena)}</div>${sklad("wycena")}</div>
          </div>`;
    }

    function strategie() {
        const fv = (n, v) => {
            if (!W.ok(v)) return "–";
            if (/≥ 30 % długu/.test(n) && v >= 9.9) return "brak długu";
            if (/Dług|PEG/.test(n)) return W.fmtNum(v);
            if (/FCF > 0/.test(n)) return W.fmtUsd(v);
            if (/Lata|≥ 3 z 5|≥ 2 z 3|z 10 lat/.test(n)) return String(v);
            if (/Kapitalizacja/.test(n)) return W.fmtUsd(v) + " " + WAL;
            if (/2 × w 10 lat/.test(n)) return W.fmtNum(v, 1) + " ×";
            if (/ROE wyższe/.test(n)) return (n.match(/niż (.*)$/) || ["", ""])[1] + " " + W.fmtPct(v, 0) + " → dziś " + W.fmtPct(M.roe_sec, 0);
            return W.fmtPct(v, 1);
        };
        $("strategie").innerHTML = `<h2>Strategie</h2><div class="pod">Kryteria z naszego badania (research/) i z filmów autora (Zyskowność, Przepływy pieniężne — jeszcze nie sprawdzone u nas w całości): ile z nich spółka dziś spełnia.</div><div class="kol3">` +
            Object.entries(K.strategie).map(([n, kr]) => {
                const ile = kr.filter((x) => x[2]).length;
                return `<div class="kol" style="border:1px solid var(--linia);border-radius:10px;padding:10px"><div style="display:flex;justify-content:space-between"><b>${esc(n)}</b>
                  <span class="ocena ${ile === kr.length ? "o-swietna" : ile >= kr.length - 1 ? "o-dobra" : "o-srednia"}">${ile}/${kr.length}</span></div>
                  ${kr.map(([k, v, ok]) => `<div class="kryt"><span>${esc(k)}</span><span>${fv(k, v)} <span class="${ok ? "tak" : "nie"}">${ok ? "✓" : "✗"}</span></span></div>`).join("")}</div>`;
            }).join("") + (K.strategie["7/7 (niskie ryzyko)"] ? "" : '<p class="mut male">Strategia 7/7 pomija finanse, surowce, energię, użyteczność publiczną i nieruchomości.</p>') + "</div>";
    }

    // --- wycena -------------------------------------------------------------------------------------------------------
    const S = { tab: "peg" };
    function domyslne() {
        const d = K.dcf && K.dcf.base;
        const p = K.dcf_param || { r: 0.10, tg: 0.03, lata: 5, wygaszanie: 5 };
        S.g = d ? d.g : W.ok(M.dcf_g) ? M.dcf_g : (W.ok(M.rev_cagr3) ? Math.max(0, Math.min(0.25, M.rev_cagr3)) : 0.08);
        S.marza = d ? d.marza : W.ok(M.dcf_marza) ? M.dcf_marza : (W.ok(M.fcf_margin) && M.fcf_margin > 0 ? M.fcf_margin : 0.1);
        S.r = p.r; S.tg = p.tg; S.lata = p.lata; S.wyg = p.wygaszanie;
        S.eps = M.peg_norm_uzyte && W.ok(M.eps_norm) ? M.eps_norm : M.eps; S.geps = W.ok(M.eps_next5) ? M.eps_next5 : GPW && W.ok(M.ni_cagr3) ? M.ni_cagr3 : (W.ok(M.rev_cagr5) ? M.rev_cagr5 : 0.1);
    }
    const parDcf = () => ({ rev: W.ok(M.dcf_rev) ? M.dcf_rev : M.rev_ttm, marza: S.marza, g: S.g, akcje: M.shares, gotowka: M.cash || 0, dlug: W.ok(M.dcf_dlug) ? M.dcf_dlug : (M.debt || 0), r: S.r, tg: S.tg, lata: S.lata, wyg: S.wyg });
    function margines5() {
        const sm = W.ok(M.sbc_przych) ? M.sbc_przych : 0;      // marża FCF po odjęciu wynagrodzeń w akcjach (SBC)
        const y = (K.hist.y || []).slice(-5).filter((x) => x[1] > 0 && W.ok(x[3])).map((x) => (x[3] - (W.ok(x[4]) ? x[4] : sm * x[1])) / x[1]).sort((a, b) => a - b);
        return y.length ? y[Math.floor(y.length / 2)] : null;
    }
    function wycena() {
        const el = $("wycena");
        el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><h2>Wycena</h2><div class="pod">Najpierw PEG (cena do wzrostu zysku — moment zakupu dobrej spółki), przełącz na DCF (zdyskontowane wolne przepływy). Zmieniaj założenia.</div></div>
          <div class="zakladki"><button data-tab="peg" class="${S.tab === "peg" ? "akt" : ""}">PEG</button><button data-tab="dcf" class="${S.tab === "dcf" ? "akt" : ""}">DCF</button></div></div><div id="wyc-tresc"></div>`;
        el.querySelectorAll("button[data-tab]").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; wycena(); }));
        if (S.tab === "peg") peg(); else dcfWidok();
    }
    function peg() {
        const pe = W.ok(S.eps) && S.eps > 0 ? M.price / S.eps : null;
        const sc = W.pegScen(pe, S.geps), base = sc && sc.base.peg;
        const poz = W.ok(base) ? Math.min(100, 100 * base / 4) : null;
        $("wyc-tresc").innerHTML = `<div class="siatka2">
          <div class="wej wej-peg">
            <label>Cena<input type="number" value="${W.ok(M.price) ? M.price.toFixed(2) : ""}" disabled><span class="mut">rynek</span></label>
            <label class="szer">EPS (12 mies.)<input id="w-eps" type="number" step="0.01" value="${W.ok(S.eps) ? S.eps.toFixed(2) : ""}"><span class="mut">${GPW ? "z P/E" : "z P/E Finviz"}: ${W.fmtNum(M.eps)}</span>
              ${W.ok(M.eps_norm) ? `<div class="chipy"><button data-e="${M.eps}">z raportu (GAAP) ${W.fmtNum(M.eps)}</button><button data-e="${M.eps_norm}">znormalizowany ${W.fmtNum(M.eps_norm)}</button></div>` : ""}
              ${M.peg_norm_uzyte ? `<div class="male" style="color:var(--brazowy-t);margin-top:4px">Zysk z raportu różni się o ponad 15 % od zysku z podstawowej działalności — domyślnie liczymy PEG ze znormalizowanego (zob. „Jakość zysku”).</div>` : ""}</label>
            <label class="szer">Oczekiwany wzrost EPS rocznie (%)<input id="w-geps" type="number" step="0.5" value="${(100 * S.geps).toFixed(1)}">
              <div class="chipy">${GPW ? `<button data-g="${M.ni_cagr3}">zysk 3 lata ${W.fmtPct(M.ni_cagr3, 0)}</button><button data-g="${M.rev_cagr3}">przychody 3 lata ${W.fmtPct(M.rev_cagr3, 0)}</button><button data-g="${M.rev_1y}">przychody 1 rok ${W.fmtPct(M.rev_1y, 0)}</button>`
                : `<button data-g="${M.eps_next5}">prognoza 5 lat ${W.fmtPct(M.eps_next5, 0)}</button><button data-g="${M.rev_cagr5}">przychody 5 lat ${W.fmtPct(M.rev_cagr5, 0)}</button><button data-g="${M.eps_ny}">EPS przyszły rok ${W.fmtPct(M.eps_ny, 0)}</button>`}</div>
              ${GPW ? '<div class="male mut" style="margin-top:4px">GPW: brak prognoz analityków — domyślnie wzrost zysku z 3 lat (po jednorazowym skoku zysku zaniża PEG; wpisz realny wzrost).</div>' : ""}</label>
            <label>P/E (wyliczone)<input type="number" value="${W.ok(pe) ? pe.toFixed(2) : ""}" disabled><span class="mut">cena ÷ EPS</span></label>
          </div>
          <div class="karta ciemna" style="margin:0">
            <div style="display:flex;gap:14px;align-items:center"><div><div class="mut male">PEG</div><div class="peg-duzy">${W.ok(base) ? W.fmtNum(base) : "–"}</div></div>
              <span class="pill p-${slug(W.etykietaPeg(base) || "")}">${esc(W.etykietaPeg(base) || "–")}</span></div>
            ${(() => { const typ = duz6() ? W.DUZY : K.typy && K.typy[0] && K.typy[0][0], c = typ && W.CENA_TYPU[typ]; if (!c) return "";
                const ok = c[0] !== null && W.ok(base) && base > 0 ? (base <= c[0] ? ' <b style="color:#5eead4">— spełnia</b>' : ' <b style="color:#fca5a5">— nie spełnia</b>') : "";
                return `<div class="male" style="margin-top:6px">Typ: <b>${esc(typ)}</b> — ${esc(c[1])}${ok}</div>`; })()}
            ${W.ok(base) && base > 0 ? `<div class="male" style="margin-top:6px">Cena dziś ${W.fmtCena(M.price)} · przy PEG 1: <b>${W.fmtCena(M.price / base)}</b> · przy PEG 2: <b>${W.fmtCena(2 * M.price / base)}</b></div>` : ""}
            ${sc ? `<div class="scen">${["bear", "base", "bull"].map((k) => `<div class="${k}"><div class="t">${{ bear: "Pesymistycznie", base: "Bazowo", bull: "Optymistycznie" }[k]}</div><b style="font-size:20px">${W.fmtPct(sc[k].g, 1)}</b><div class="mut male">wzrost EPS</div><div>PEG ${W.fmtNum(sc[k].peg)}</div></div>`).join("")}</div>` : ""}
            ${poz !== null ? `<div class="peg-skala"><span class="znak" style="left:${poz}%"></span></div><div class="skala mut"><span>0</span><span>1 · nisko</span><span>2 · uczciwie</span><span>3 · drogo</span><span>4+</span></div>` : ""}
            <p class="mut male">PEG = P/E ÷ (oczekiwany wzrost EPS w %). Poniżej 1 — tanio względem wzrostu, 1–2 — uczciwie, powyżej 3 — drogo.</p>
          </div></div>`;
        $("w-eps").addEventListener("change", (e) => { S.eps = +e.target.value; peg(); });
        $("w-geps").addEventListener("change", (e) => { S.geps = e.target.value / 100; peg(); });
        document.querySelectorAll("[data-e]").forEach((b) => b.addEventListener("click", () => { if (W.ok(+b.dataset.e)) { S.eps = +b.dataset.e; peg(); } }));
        document.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => { if (W.ok(+b.dataset.g)) { S.geps = +b.dataset.g; peg(); } }));
    }
    function dcfWidok() {
        const p = parDcf(), v = K.sector === "Financial" ? null : W.dcf(p), sc = W.scenariusze(p), pot = W.ok(v) && M.price ? v / M.price - 1 : null;
        const et = W.etykieta(pot), poz = W.pozycjaWyceny(pot);
        const ig = W.implikowane(p, M.price, "g", -0.3, 0.8), im = W.implikowane(p, M.price, "marza", 0.001, 1);
        const m5 = margines5();
        const chip = (pole, x, n) => W.ok(x) ? `<button data-${pole}="${x}">${n} ${W.fmtPct(x, 1)}</button>` : "";
        $("wyc-tresc").innerHTML = `<div class="siatka3">
          <div class="karta ciemna" style="margin:0"><div class="mut male">Wartość DCF na akcję</div>
            ${W.ok(v) && v > 0 ? `<span class="pill p-${slug(et)}" style="margin:8px 0">${esc(et)}</span>
            <div style="display:flex;justify-content:space-between;align-items:baseline"><div><div class="mut male">Cena</div><b style="font-size:20px">${W.fmtCena(M.price)}</b></div>
              <div style="text-align:right"><div class="mut male">Wartość DCF</div><b style="font-size:20px;color:#5eead4">${W.fmtCena(v)}</b></div></div>
            <div class="pasek-wyceny"><span class="znak" style="left:${(100 * poz).toFixed(1)}%"></span></div>
            <div class="mut male">Cena jest ${pot >= 0 ? "o " + W.fmtPct(pot / (1 + pot), 1) + " poniżej" : "o " + W.fmtPct(-pot, 1) + " powyżej"} wartości DCF.</div>
            <div class="scen" style="margin-top:12px">${["bear", "base", "bull"].map((k) => `<div class="${k}"><div class="t">${{ bear: "Pesym.", base: "Bazowo", bull: "Optym." }[k]}</div><b>${W.fmtCena(sc[k])}</b></div>`).join("")}</div>
            <div class="pole" style="margin-top:12px"><div class="mut male">Co zakłada dzisiejsza cena</div>
              <div class="male" style="display:flex;justify-content:space-between"><span>wzrost przychodów rocznie</span><b>${W.fmtPct(ig, 1)}</b></div>
              <div class="male" style="display:flex;justify-content:space-between"><span>albo marża FCF</span><b>${W.fmtPct(im, 1)}</b></div></div>`
            : `<p class="mut">${M.dcf_brak ? esc(M.dcf_brak.charAt(0).toUpperCase() + M.dcf_brak.slice(1)) + ". Możesz zmienić założenia obok." : W.ok(v) && v <= 0 ? "Wartość DCF wychodzi ujemna (dług większy niż wartość przepływów) — DCF nie ma tu sensu." : "Za mało danych (przychody, marża FCF > 0, liczba akcji)."}</p>`}
          </div>
          <div><div class="mut male" style="margin-bottom:4px">Przychody i wolne przepływy: historia (lata obrotowe) i prognoza (kreskowane)</div><div id="dcf-wykres"></div>
            ${M.dcf_uwagi ? `<div class="mut male" style="margin-top:6px">Korekta danych: ${esc(M.dcf_uwagi.join("; "))} — dane z SEC odbiegały od Finviz.</div>` : ""}</div>
          <div class="wej" style="grid-template-columns:1fr">
            <label>Wzrost przychodów rocznie (%)<input id="d-g" type="number" step="0.5" value="${(100 * S.g).toFixed(1)}">
              <div class="chipy">${chip("g", K.dcf && K.dcf.base ? K.dcf.base.g : null, "domyślnie")}${chip("g", M.rev_1y, "1 rok")}${chip("g", M.rev_cagr3, "3 lata")}${chip("g", M.rev_cagr5, "5 lat")}${chip("g", M.eps_next5, "prognoza EPS")}</div></label>
            <label>Lata takiego wzrostu<div class="chipy">${[5, 7, 10].map((n) => `<button data-lata="${n}" class="${S.lata === n ? "akt" : ""}">${n} lat</button>`).join("")}</div></label>
            <label>Marża FCF (% przychodów)<input id="d-m" type="number" step="0.5" value="${(100 * S.marza).toFixed(1)}">
              <div class="chipy">${chip("m", W.ok(M.fcf_margin) ? M.fcf_margin - (W.ok(M.sbc_przych) ? M.sbc_przych : 0) : null, "12 mies.")}${chip("m", m5, "mediana 5 lat")}</div>
                <span class="mut male">FCF po odjęciu wynagrodzeń w akcjach (SBC${W.ok(M.sbc_przych) ? " " + W.fmtPct(M.sbc_przych, 1) + " przychodów" : ""}); dług z leasingiem${W.ok(M.leasing) ? " (" + W.fmtUsd(M.leasing) + " USD)" : ""}.</span></label>
            <label>Stopa dyskonta (%)<input id="d-r" type="number" step="0.25" value="${(100 * S.r).toFixed(2)}"></label>
            <label>Wzrost po okresie prognozy (%)<input id="d-tg" type="number" step="0.25" value="${(100 * S.tg).toFixed(2)}"></label>
            <button id="d-reset">Przywróć domyślne</button>
          </div></div>`;
        const hist = (K.hist.y || []).slice(-6), prog = W.ok(v) ? W.prognoza(p) : [];
        const ety = hist.map((x) => x[0].slice(0, 4)).concat(prog.map((x) => `+${x.rok}`));
        const kres = hist.map(() => false).concat(prog.map(() => true));
        WY.slupki($("dcf-wykres"), ety, [
            { nazwa: "Przychody", kolor: "#64748b", w: hist.map((x) => x[1]).concat(prog.map((x) => x.rev)), kreski: kres },
            { nazwa: "Wolne przepływy (FCF)", kolor: "#10b981", w: hist.map((x) => x[3]).concat(prog.map((x) => x.fcf)), kreski: kres },
        ], usdOs, 300);
        const ust = (k, val) => { S[k] = val; dcfWidok(); };
        $("d-g").addEventListener("change", (e) => ust("g", e.target.value / 100));
        $("d-m").addEventListener("change", (e) => ust("marza", e.target.value / 100));
        $("d-r").addEventListener("change", (e) => ust("r", e.target.value / 100));
        $("d-tg").addEventListener("change", (e) => ust("tg", e.target.value / 100));
        document.querySelectorAll("[data-e]").forEach((b) => b.addEventListener("click", () => { if (W.ok(+b.dataset.e)) { S.eps = +b.dataset.e; peg(); } }));
        document.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => ust("g", Math.max(-0.2, Math.min(0.6, +b.dataset.g)))));
        document.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => ust("marza", +b.dataset.m)));
        document.querySelectorAll("[data-lata]").forEach((b) => b.addEventListener("click", () => ust("lata", +b.dataset.lata)));
        $("d-reset").addEventListener("click", () => { domyslne(); dcfWidok(); });
    }

    // --- sprawozdania -------------------------------------------------------------------------------------------------
    // --- jakość zysku i zdarzenia (fakty z SEC, bez interpretacji) ------------------------------------------------------
    function zyskZd() {
        if (GPW) { $("zysk-zd").hidden = true; return; }
        const el = $("zysk-zd"), m = M, zd = K.zdarzenia || [];
        const wr = (n, v, b) => `<div class="jz-w${b ? " jz-suma" : ""}"><span>${n}</span><b>${v}</b></div>`;
        const wr3 = (n, a, b) => `<div class="jz-w jz-3"><span>${n}</span><b>${a}</b><b>${b}</b></div>`;
        const roz = W.ok(m.eps_norm) && W.ok(m.eps) ? m.eps / m.eps_norm - 1 : null;
        const jz = W.ok(m.ni_norm) ? `<div class="jz">
            ${wr("Zysk netto z raportu (GAAP, 12 mies.)", W.fmtUsd(m.ni_ttm))}
            ${wr("Zysk operacyjny (12 mies.)", W.fmtUsd(m.op_ttm))}
            ${wr("− koszty odsetek", W.fmtUsd(m.odsetki_ttm || 0))}
            ${wr(`− podatek (stopa ${W.fmtPct(m.stopa_pod, 0)})`, W.fmtUsd((m.op_ttm - (m.odsetki_ttm || 0)) * m.stopa_pod))}
            ${wr("= Zysk znormalizowany", W.fmtUsd(m.ni_norm), true)}
            ${wr("Różnica: zysk z raportu − znormalizowany", W.fmtUsd(m.roznica_norm))}
            ${W.ok(m.nonop_ttm) ? wr("w tym pozycje nieoperacyjne (inwestycje, sprzedaż aktywów, inne)", W.fmtUsd(m.nonop_ttm)) : ""}
            </div><div class="jz" style="margin-top:10px"><div class="jz-w jz-3 jz-nag"><span></span><span>z raportu</span><span>znormaliz.</span></div>
            ${wr3("EPS", W.fmtNum(m.eps), W.ok(m.eps_norm) ? W.fmtNum(m.eps_norm) : "–")}
            ${W.ok(m.pe_norm) ? wr3("P/E", W.fmtNum(m.pe), W.fmtNum(m.pe_norm)) : ""}
            ${W.ok(m.peg_norm) ? wr3("PEG", W.fmtNum(W.ok(m.peg_gaap) ? m.peg_gaap : m.peg), W.fmtNum(m.peg_norm)) : ""}
          </div>
          <div class="male" style="margin-top:6px">${roz === null ? (m.ni_norm <= 0 && m.eps > 0 ? '<b style="color:var(--czerwony-t)">Zysk z podstawowej działalności jest ujemny — dodatni wynik z raportu pochodzi z pozycji nieoperacyjnych.</b>' : "")
              : Math.abs(roz) > 0.15 ? `<b style="color:var(--czerwony-t)">Zysk z raportu jest ${roz > 0 ? "zawyżony" : "zaniżony"} o ${W.fmtPct(Math.abs(roz), 0)} względem podstawowej działalności</b> — P/E i PEG z raportu ${roz > 0 ? "zaniżają" : "zawyżają"} wycenę.`
              : '<span style="color:var(--zielony-t)">Zysk z raportu zgodny z podstawową działalnością (różnica do 15 %).</span>'}</div>` : '<p class="mut male">Brak danych o zysku operacyjnym w SEC.</p>';
        const kol = ["#64748b", "#d97706", "#dc2626"];
        const li = (z) => `<li class="zd-w"><span class="mut">${esc(z.d)}</span><span>${z.p.map(([k, p, o]) => `<span style="color:${kol[p]};font-weight:${p ? 600 : 400}">● ${esc(o)}</span> <span class="mut male">(${esc(k.includes(".") ? z.f + " pkt " + k : k)})</span>`).join("; ")}
            · <a href="${esc(z.u)}" target="_blank" rel="noopener">raport</a></span></li>`;
        const ul = (a) => `<ul style="list-style:none;margin:0;padding:0">${a.map(li).join("")}</ul>`;
        const lz = zd.length ? ul(zd.slice(0, 6)) + (zd.length > 6 ? `<details><summary class="mut male" style="cursor:pointer;padding:6px 0">Pokaż starsze (${zd.length - 6})</summary>${ul(zd.slice(6))}</details>` : "")
            : '<p class="mut male">Brak zgłoszonych istotnych zdarzeń w ostatnich 12 miesiącach (lub spółka zagraniczna bez raportów 8-K).</p>';
        el.innerHTML = `<h2>Jakość zysku i zdarzenia</h2><div class="pod">Czy zysk z raportu pochodzi z podstawowej działalności, czy z jednorazowych pozycji (np. zyski z wyceny inwestycji), oraz co spółka zgłosiła do SEC w ostatnich 12 miesiącach. Fakty z SEC, bez komentarza.</div>
          <div class="siatka2"><div><div class="mut male" style="margin-bottom:4px">Zysk z raportu a zysk znormalizowany (zysk operacyjny − odsetki, po podatku)</div>${jz}</div>
          <div><div class="mut male" style="margin-bottom:4px">Zdarzenia z raportów bieżących SEC (8-K) · <span style="color:${kol[2]}">● poważne</span> <span style="color:${kol[1]}">● istotne</span> <span style="color:${kol[0]}">● informacyjne</span></div>${lz}</div></div>`;
    }

    // --- Peter Lynch („One Up on Wall Street”): typ, faza wzrostu i kiedy sprzedać — opis metody + lista kontrolna z danych ---
    const LYNCH = {
        "Szybko rosnąca": ["Małe lub średnie, agresywne firmy rosnące 20–25 % rocznie. Na nich da się najwięcej zarobić — i stracić. Przechodzą fazy: start (ryzykowny), szybka ekspansja (najbezpieczniej i najwięcej zysku), dojrzewanie (rynek się nasyca, wzrost hamuje).",
            "Trzymaj, dopóki firma rośnie i ma gdzie się rozwijać (nowe rynki, produkty). Sprzedaj, gdy kończy się szybka ekspansja: sprzedaż hamuje kolejne kwartały, P/E jest absurdalnie wysokie względem wzrostu, odchodzą kluczowi ludzie, a spółkę polecają już wszyscy."],
        "Stabilnie rosnąca": ["Duże, znane firmy rosnące ok. 10–12 % rocznie. Nie dadzą dziesięciokrotności, ale chronią w recesji.",
            "Kupuj przy rozsądnym P/E, licz na 30–50 % zysku, potem sprzedaj i zamień na inną stabilną spółkę, która jeszcze nie wzrosła. Sprzedaj wcześniej, gdy P/E odbiega wysoko od jej normalnego poziomu albo wzrost wyraźnie zwalnia."],
        "Wolno rosnąca": ["Duże, stare firmy rosnące 2–4 % rocznie, w tempie gospodarki; kupuje się je głównie dla dywidendy.",
            "Sprzedaj po 30–50 % zysku albo gdy fundamenty się psują: firma traci rynek 2 lata z rzędu, nie ma nowych produktów, przepłaca za przejęcia („diworsyfikacja”), dywidenda przestaje być pokryta zyskiem lub zostaje obcięta."],
        "Cykliczna": ["Zyski rosną i spadają razem z gospodarką (auta, linie lotnicze, stal, chemia, budownictwo). Najważniejsze jest rozpoznanie, w którym miejscu cyklu jest firma.",
            "Kupuj pod koniec recesji, gdy zyski są niskie. Sprzedaj pod koniec cyklu: zapasy rosną, ceny spadają, firma buduje nowe moce, popyt słabnie. Niskie P/E przy rekordowych zyskach to pułapka, nie okazja."],
        "Wychodząca z kłopotów": ["Firmy pobite i w kłopotach, czasem na granicy upadłości. Odbicie bywa szybkie i duże, a nie zależy od rynku.",
            "Najważniejsze: czy firma przetrwa (gotówka, dług) i czy plan naprawy działa. Sprzedaj, gdy naprawa się dokonała i wszyscy to wiedzą — wtedy to już spółka innego typu. Ostrzeżenia: dług rośnie kwartał po kwartale, zapasy rosną szybciej niż sprzedaż."],
        "Ukryte aktywa": ["Firma ma coś wartościowego, czego rynek nie zauważa: gotówkę, nieruchomości, patenty, udziały w innych firmach.",
            "Czekaj, aż rynek doceni aktywa. Sprzedaj, gdy cena już je odzwierciedla albo zarząd zaczyna je przepalać: emituje akcje, przepłaca za przejęcia."],
    };
    function lynch() {
        const el = $("lynch"), L = K.lynch, typ = K.typy && K.typy[0] && K.typy[0][0];
        if (!typ || !LYNCH[typ]) { el.hidden = true; return; }
        // etap 92: ⚠ tylko dla sygnałów potwierdzonych w teście; niepotwierdzone i nietestowane — szare ○
        const ikona = (s, st) => (s === true ? '<b style="color:var(--zielony)">✓</b>' : s === false ? (st === "potwierdzony" ? '<b style="color:var(--czerwony)">⚠</b>' : '<span class="mut" title="sygnał Lyncha niepotwierdzony w naszym teście">○</span>') : '<span class="mut">–</span>');
        const stTxt = { potwierdzony: "potwierdzony w teście", niepotwierdzony: "niepotwierdzony w teście", nietestowany: "nietestowany" };
        const wsk = L && W.ok(L.wskaznik) ? L.wskaznik : null;
        const ocWsk = wsk === null ? "" : wsk >= 2 ? "bardzo dobrze" : wsk >= 1.5 ? "przyzwoicie" : wsk >= 1 ? "słabo" : "drogo";
        const lista = (L && L.lista) || [];
        const ost = lista.filter((x) => x[2] === false && x[3] === "potwierdzony").length, inne = lista.filter((x) => x[2] === false && x[3] !== "potwierdzony").length;
        el.innerHTML = `<h2>Peter Lynch: typ, faza i kiedy sprzedać</h2><div class="pod">Metoda z książki „One Up on Wall Street” (P. Lynch, 1989). Typ: <b>${esc(typ)}</b>${L && L.faza ? ` · faza: <b>${esc(L.faza[0])}</b> <span class="mut">(${esc(L.faza[1])})</span>` : ""}.</div>
          <div class="siatka2"><div class="male">
            <p style="margin:0 0 8px"><b>Czym jest:</b> ${esc(LYNCH[typ][0])}</p>
            <p style="margin:0 0 8px"><b>Kiedy sprzedać (Lynch):</b> ${esc(LYNCH[typ][1])}</p>
            <p style="margin:0" class="mut">Wskaźnik Lyncha z dywidendą = (wzrost zysku % + stopa dywidendy %) ÷ P/E: poniżej 1 słabo, 1,5 przyzwoicie, 2 i więcej bardzo dobrze.
              ${wsk !== null ? ` Tutaj: <b>${W.fmtNum(wsk)}</b> — ${ocWsk}.` : ""}</p></div>
          <div><div class="mut male" style="margin-bottom:4px">Lista kontrolna z danych${ost ? ` — <b style="color:var(--czerwony)">${ost} potwierdzony sygnał ostrzegawczy</b>` : ""}${inne ? ` · ${inne} sygnał(y) Lyncha niepotwierdzone w teście` : ""}</div>
            ${lista.length ? `<div class="jz">${lista.map(([co, w, s, st]) => `<div class="ly-w"><span>${ikona(s, st)}</span><span>${esc(co)}<br><span class="mut" style="font-size:11px">${esc(stTxt[st] || "")}</span></span><span class="mut ly-wart">${esc(w)}</span></div>`).join("")}</div>`
              : '<p class="mut male">Brak danych do listy kontrolnej (dane odświeżą się przy najbliższej aktualizacji).</p>'}
            <p class="mut male" style="margin-top:6px">✓ w porządku · ⚠ sygnał ostrzegawczy potwierdzony w naszym teście · ○ sygnał wg Lyncha, ale w teście 2012–2026 spółki z nim nie wypadały wyraźnie gorzej (etap 92) · – brak danych lub do oceny samemu. Potwierdzone w testach 2012–2026 (etapy 92–93): u wolno rosnących spadek sprzedaży lub zysku 2 lata z rzędu (−11 pp w 3 lata) i dywidenda rosnąca 5 lat (+11 pp), u stabilnie rosnących wysoka marża netto (+28 pp). Pozostałe reguły Lyncha — w metodzie.</p></div></div>`;
    }

    // --- Ocena krok po kroku (użytkownik: „mini ocena spółki … krok po kroku” z kryteriów 7/7): faza, wzrost, rentowność, bezpieczeństwo, wycena, podsumowanie.
    // Tylko fakty z danych i kryteria z testów; bez werdyktu „kup / sprzedaj” (spółki wybiera użytkownik).
    const KROKI = ["Faza", "Wzrost", "Rentowność", "Bezpieczeństwo", "Wycena", "Podsumowanie"];
    const lista77 = () => { const k = Object.keys(K.strategie || {}).find((x) => x.startsWith("7/7")); return k ? K.strategie[k] : null; };
    const listaJak = () => { const k = Object.keys(K.strategie || {}).find((x) => x.startsWith("Jakość")); return k ? K.strategie[k] : null; };
    const KR_IDX = { Wzrost: [0, 1, 2], "Rentowność": [3], "Bezpieczeństwo": [4, 5], Wycena: [6] };
    function fmtKryt(co, v) {
        if (!W.ok(v)) return "–";
        if (/FCF|Wolne|Kapitalizacja/.test(co)) return W.fmtUsd(v) + " " + WAL;
        if (/PEG|Dług/.test(co)) return W.fmtNum(v);
        if (/ w ≥ | z 10 lat|lat\)$/.test(co) && Math.abs(v) >= 1 && Number.isInteger(v)) return String(v);
        return W.fmtPct(v, 0, true);
    }
    const kropki = (n, z) => `<span class="kr-kropki">${Array.from({ length: z }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
    const tn = (b) => (b === true ? '<b class="kr-tak">Tak.</b>' : b === false ? '<b class="kr-nie">Nie.</b>' : '<b class="mut">Brak danych.</b>');
    function iskra(w, et, kolor) {
        const p = w.map((v, i) => [i, v]).filter((x) => W.ok(x[1]));
        if (p.length < 2) return '<div class="mut male">Za mało danych do wykresu.</div>';
        const mn = Math.min(0, ...p.map((x) => x[1])), mx = Math.max(...p.map((x) => x[1])), zak = mx - mn || 1;
        const X = (i) => 6 + (i / (w.length - 1)) * 188, Y = (v) => 52 - ((v - mn) / zak) * 44;
        const os = mn < 0 ? `<line x1="0" x2="200" y1="${Y(0)}" y2="${Y(0)}" style="stroke:var(--siatka)" stroke-dasharray="3 3"/>` : "";
        const ost = p[p.length - 1];
        return `<svg viewBox="0 0 200 60" class="kr-iskra" preserveAspectRatio="none">${os}<polyline fill="none" stroke-width="2" style="stroke:${kolor}" points="${p.map(([i, v]) => `${X(i)},${Y(v)}`).join(" ")}"/><circle cx="${X(ost[0])}" cy="${Y(ost[1])}" r="3" style="fill:${kolor}"/></svg>
          <div class="kr-osx mut"><span>${esc(et[p[0][0]])}</span><span>${esc(et[ost[0]])}</span></div>`;
    }
    function diagramFaz(nr) {
        // własny schemat: przychody, zysk i wypłaty dla akcjonariuszy w pięciu fazach (poglądowo, bez danych)
        const x = (f) => f * 120;
        const prz = "M0,96 C80,95 140,80 240,62 S400,36 480,30 S560,30 600,40", zys = "M0,100 C40,110 80,122 120,120 S200,104 240,100 S330,72 360,64 S470,54 600,70",
            wyp = "M360,100 C400,96 440,92 480,90 S560,92 600,98";
        return `<svg viewBox="0 0 600 140" class="kr-fazy" preserveAspectRatio="none" role="img" aria-label="Schemat pięciu faz spółki">
          ${[1, 2, 3, 4, 5].map((f) => `<rect x="${x(f - 1)}" y="0" width="120" height="140" style="fill:${f === nr ? "var(--zielony-tlo)" : "transparent"}"/>${f > 1 ? `<line x1="${x(f - 1)}" x2="${x(f - 1)}" y1="0" y2="140" style="stroke:var(--siatka)"/>` : ""}`).join("")}
          <line x1="0" x2="600" y1="100" y2="100" style="stroke:var(--siatka)" stroke-dasharray="4 4"/>
          <path d="${prz}" fill="none" stroke-width="3" vector-effect="non-scaling-stroke" style="stroke:var(--niebieski)"/><path d="${zys}" fill="none" stroke-width="3" vector-effect="non-scaling-stroke" style="stroke:var(--zielony)"/>
          <path d="${wyp}" fill="none" stroke-width="3" vector-effect="non-scaling-stroke" style="stroke:var(--zolty)"/></svg>
          <div class="kr-fazy-et">${W.FAZY.map((n, i) => `<div class="${i + 1 === nr ? "akt" : ""}"><span>${i + 1}</span>${esc(n)}</div>`).join("")}</div>
          <div class="kr-leg male"><span style="color:var(--niebieski)">━ przychody</span> <span style="color:var(--zielony)">━ zysk</span> <span style="color:var(--zolty)">━ dywidendy i skup</span> <span class="mut">(schemat poglądowy)</span></div>`;
    }
    function kryteriaHtml(idx) {
        const l = lista77(); if (!l) return '<p class="mut male">Brak kryteriów 7/7 dla tej spółki.</p>';
        return `<div class="jz">${idx.map((i) => l[i]).filter(Boolean).map(([co, v, ok]) => `<div class="ly-w"><span>${ok ? '<b class="kr-tak">✓</b>' : '<b class="kr-nie">✗</b>'}</span><span>${esc(co)}</span><span class="ly-wart"><b>${esc(fmtKryt(co, v))}</b></span></div>`).join("")}</div>`;
    }
    const zalicz = (idx) => { const l = lista77(); if (!l) return [0, 0]; const x = idx.map((i) => l[i]).filter(Boolean); return [x.filter((k) => k[2]).length, x.length]; };
    function wykresKursu(d, c, ma, nr) {
        // ostatnie 2 lata: kurs (tygodniowo) i średnia 30-tygodniowa
        const n = Math.min(104, c.length), o = c.length - n, cc = c.slice(o), mm = ma.slice(o), dd = d.slice(o);
        const w = [...cc, ...mm].filter(W.ok), mn = Math.min(...w), mx = Math.max(...w), zak = mx - mn || 1;
        const X = (i) => 4 + (i / (n - 1)) * 592, Y = (v) => 8 + (1 - (v - mn) / zak) * 124;
        const pl = (a) => a.map((v, i) => (W.ok(v) ? `${X(i).toFixed(1)},${Y(v).toFixed(1)}` : "")).filter(Boolean).join(" ");
        const kol = { 1: "var(--tekst2)", 2: "var(--zielony)", 3: "var(--zolty)", 4: "var(--czerwony)" }[nr];
        return `<svg viewBox="0 0 600 140" class="kr-fazy" preserveAspectRatio="none" role="img" aria-label="Kurs i średnia 30-tygodniowa">
          <polyline points="${pl(cc)}" fill="none" stroke-width="2" vector-effect="non-scaling-stroke" style="stroke:${kol}"/>
          <polyline points="${pl(mm)}" fill="none" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" style="stroke:var(--niebieski)"/></svg>
          <div class="kr-osx mut"><span>${esc(dd[0])}</span><span>${esc(dd[n - 1])}</span></div>
          <div class="kr-leg male"><span style="color:${kol}">━ kurs (tygodniowo)</span> <span style="color:var(--niebieski)">╌ średnia 30 tygodni</span></div>`;
    }
    function fazaKursuHtml() {
        const c = K.ceny && K.ceny.c, fk = W.fazaKursu(c);
        if (!fk) return '<div class="kr-faza kr-faza-k"><p class="mut male" style="margin:0">Za mało notowań, żeby określić fazę kursu (potrzeba ok. 56 tygodni).</p></div>';
        const t = fk.test, opisy = { 1: "Kurs krąży wokół płaskiej lub opadającej średniej — rynek „buduje bazę”",
            2: "Kurs nad rosnącą średnią — trend wzrostowy (Weinstein: tu się kupuje)",
            3: "Średnia się wypłaszcza po wzroście albo kurs spadł pod rosnącą średnią — możliwy szczyt",
            4: "Kurs pod opadającą średnią — trend spadkowy (Weinstein: tu się nie kupuje)" };
        return `<div class="kr-faza kr-faza-k"><div class="kr-faza-t">Faza kursu (wg Weinsteina): <b>${fk.nr}: ${esc(fk.nazwa)}</b></div>
          <div class="kr-fazy-et kr-4">${W.FAZY_KURSU.map((n, i) => `<div class="${i + 1 === fk.nr ? "akt" : ""}"><span>${i + 1}</span>${esc(n)}</div>`).join("")}</div>
          <p class="male" style="margin:8px 0">${esc(opisy[fk.nr])}. Kurs ${W.fmtPct(fk.odSredniej, 1, true)} względem średniej 30-tygodniowej, średnia ${W.fmtPct(fk.nachylenie, 1, true)} w 5 tygodni.</p>
          ${wykresKursu(K.ceny.d, c, fk.ma, fk.nr)}
          <p class="mut male" style="margin:8px 0 0">Test 2012–2026 (etap 102${GPW ? ", spółki USA" : ""}): spółki w fazie ${fk.nr} po roku — mediana ${t[0] >= 0 ? "+" : ""}${W.fmtNum(t[0], 1)} pp względem mediany wszystkich, strata u ${t[1]} % (wszystkie: 31 %); po 3 latach ${t[2] >= 0 ? "+" : ""}${W.fmtNum(t[2], 1)} pp, strata ${t[3]} % (wszystkie: 22 %).
            ${fk.nr === 4 ? " Faza spadku wypadała gorzej w obu połowach okresu (na 3 lata istotnie, na rok — w granicach przypadku)." : " Pozostałe fazy nie różniły się wyraźnie."} Faza kursu nie wchodzi do kryteriów ani zasad dokupu.</p></div>`;
    }
    function krokTresc(i) {
        const f = W.faza(M, K.hist && K.hist.q), y = (K.hist && K.hist.y) || [];
        const ety = y.map((r) => r[0].slice(0, 4)), cagr = (x, n) => (W.ok(x) && x > -1 ? Math.pow(1 + x, 1 / n) - 1 : null);
        if (i === 0) {
            const p = f ? f.pyt : {};
            const zw = [];
            if (W.ok(M.div) && M.div > 0) zw.push(`dywidenda ${W.fmtPct(M.div, 1)} rocznie`);
            if (W.ok(M.skup_netto_mc)) zw.push(`skup netto ${W.fmtPct(M.skup_netto_mc, 1, true)} kapitalizacji (12 mies.)`);
            if (W.ok(M.akcje_3l)) zw.push(`liczba akcji ${W.fmtPct(M.akcje_3l, 1, true)} w 3 lata`);
            const t = f && f.test;
            return `<div class="kr-pyt">
              <div class="pole"><div class="kr-nr">1</div><b>Czy przychody rosną?</b><div>${tn(p.przychody)} ${W.ok(M.rev_cagr3) ? `${W.fmtPct(M.rev_cagr3, 1, true)} rocznie przez 3 lata` : ""}</div>${iskra(y.map((r) => r[1]), ety, "var(--niebieski)")}</div>
              <div class="pole"><div class="kr-nr">2</div><b>Czy zarabia?</b><div>${tn(p.zysk)} ${f && W.ok(f.om) ? `marża operacyjna ${W.fmtPct(f.om, 1)}` : ""}${W.ok(M.op_ttm) ? `, zysk operacyjny ${W.fmtUsd(M.op_ttm)} ${WAL} (12 mies.)` : ""}${p.poprawa === true ? " — strata się zmniejsza" : p.poprawa === false ? " — strata się nie zmniejsza" : ""}</div>${iskra(y.map((r) => r[2]), ety, "var(--zielony)")}</div>
              <div class="pole"><div class="kr-nr">3</div><b>Czy oddaje kapitał akcjonariuszom?</b><div>${tn(f ? p.zwrot : null)} ${esc(zw.join(", "))}</div></div></div>
              ${f ? `<div class="kr-faza"><div class="kr-faza-t">Faza spółki (cykl życia firmy): <b>${f.nr}: ${esc(f.nazwa)}</b></div>${diagramFaz(f.nr)}
                <p class="mut male" style="margin:8px 0 0">Test 2012–2026 (etap 101, 500 największych spółek USA): sama faza <b>nie mówiła</b>, czy spółka zarobi więcej od innych — różnice w granicach przypadku.
                Faza ${f.nr} po 3 latach: mediana ${t[0] >= 0 ? "+" : ""}${W.fmtNum(t[0], 1)} pp względem mediany wszystkich, strata u ${t[1]} % spółek (wszystkie: 23 %).${f.nr === 1 ? " Spółki na starcie częściej kończyły ze stratą." : ""}${f.nr === 5 ? " Spadające przychody nie oznaczały gorszego wyniku akcji." : ""}</p></div>`
                : '<p class="mut">Za mało danych, żeby określić fazę spółki.</p>'}
              ${fazaKursuHtml()}`;
        }
        if (i === 1) {
            const w = (n, a, b, c) => `<div class="pole"><div class="mut male">${n}</div><div class="kr-cagr"><div><small>1 rok</small><b>${W.fmtPct(a, 1, true)}</b></div><div><small>3 lata (rocznie)</small><b>${W.fmtPct(b, 1, true)}</b></div><div><small>5 lat (rocznie)</small><b>${W.fmtPct(c, 1, true)}</b></div></div></div>`;
            return `<div class="siatka2">${w("Przychody", M.rev_1y, M.rev_cagr3, M.rev_cagr5)}${w("Zysk netto", M.ni_1y, cagr(M.ni_3y, 3), cagr(M.ni_5y, 5))}</div>
              <div style="margin-top:10px">${kryteriaHtml(KR_IDX.Wzrost)}</div><div id="kr-wykres" style="margin-top:10px"></div>`;
        }
        if (i === 2) {
            const j = listaJak(), dod = j ? j.filter(([co]) => /ROA|ROCE|3 lata temu/.test(co)) : [];
            return `${kryteriaHtml(KR_IDX["Rentowność"])}
              ${dod.length ? `<div class="mut male" style="margin:10px 0 4px">Dodatkowo z listy „Jakość (7 kryteriów)” (nie liczone do 7/7):</div><div class="jz">${dod.map(([co, v, ok]) => `<div class="ly-w"><span>${ok ? '<b class="kr-tak">✓</b>' : '<b class="kr-nie">✗</b>'}</span><span>${esc(co)}</span><span class="ly-wart">${esc(fmtKryt(co, v))}</span></div>`).join("")}</div>` : ""}
              <div class="kr-cagr" style="margin-top:10px">${[["Marża brutto", M.gm], ["Marża operacyjna", M.om], ["Marża netto", M.nm]].map(([n, v]) => `<div><small>${n}</small><b>${W.fmtPct(v, 1)}</b></div>`).join("")}</div>`;
        }
        if (i === 3) {
            const s = K.oceny && K.oceny.sila;
            return `${kryteriaHtml(KR_IDX["Bezpieczeństwo"])}
              <div class="kr-cagr" style="margin-top:10px"><div><small>Gotówka − dług</small><b class="${M.net_cash >= 0 ? "plus" : "minus"}">${W.ok(M.net_cash) ? W.fmtUsd(M.net_cash) + " " + WAL : "–"}</b></div>
                <div><small>Siła finansowa (0–10)</small><b>${oc(s)}</b></div><div><small>Spadek 2 lata z rzędu (⬇)</small><b class="${M.spadek_2l ? "minus" : ""}">${M.spadek_2l ? "tak" : "nie"}</b></div></div>
              <p class="mut male">Siła finansowa ≥ 7 to jedyny czynnik z wyraźną przewagą w naszych testach (etap 95: +16 pp w 3 lata).</p>`;
        }
        if (i === 4) {
            const peg = M.peg, pr = M.price, B = [0.5, 1, 2, 3], N = ["Bardzo tania", "Niedowartościowana", "Uczciwie", "Droga", "Bardzo droga"];
            let poz = null;
            if (W.ok(peg) && peg > 0) { // pięć równych stref: 0–0,5 / 0,5–1 / 1–2 / 2–3 / 3–4+
                const g = [0, ...B, 4], k = Math.min(4, g.filter((b) => b <= peg).length - 1);
                poz = Math.max(2, Math.min(98, 20 * k + 20 * Math.min(1, (peg - g[k]) / (g[k + 1] - g[k]))));
            }
            return `${kryteriaHtml(KR_IDX.Wycena)}
              ${poz !== null ? `<div class="kr-wyc"><div class="kr-wyc-teraz" style="left:${poz}%;transform:translateX(${poz < 15 ? "-8%" : poz > 85 ? "-92%" : "-50%"})">Dziś ${W.fmtCena(pr)}<br>▼</div>
                <div class="kr-pasek">${N.map((n, j) => `<span class="z${j}">${n}</span>`).join("")}</div>
                <div class="kr-ceny mut">${B.map((b, j) => `<span style="left:${20 * (j + 1)}%">${W.fmtCena(pr * b / peg)}</span>`).join("")}</div></div>
                <p class="mut male">Cena, przy której PEG wyniósłby 0,5 / 1 / 2 / 3 (przy dzisiejszym zysku i prognozie wzrostu). PEG ${W.fmtNum(peg)} — <a href="#wycena">szczegóły i zmiana założeń ↓</a></p>`
                : '<p class="mut">Brak PEG (zysk ≤ 0 albo brak prognozy wzrostu) — zob. <a href="#wycena">DCF ↓</a>.</p>'}`;
        }
        const wiersze = ["Wzrost", "Rentowność", "Bezpieczeństwo", "Wycena"].map((n) => { const [a, b] = zalicz(KR_IDX[n]); return [n, a, b]; });
        const suma = wiersze.reduce((s, x) => s + x[1], 0), wsz = wiersze.reduce((s, x) => s + x[2], 0);
        const ow = (K.ostrzezenia || []).length, brak = wiersze.flatMap(([n]) => { const l = lista77(); return l ? KR_IDX[n].map((j) => l[j]).filter((k) => k && !k[2]).map((k) => k[0]) : []; });
        return `<div class="kr-sum">
          <div class="kr-sum-w"><span>Faza spółki</span><b>${f ? `${f.nr} z 5 · ${esc(f.nazwa)}` : "–"}</b></div>
          ${(() => { const fk = W.fazaKursu(K.ceny && K.ceny.c); return `<div class="kr-sum-w"><span>Faza kursu (Weinstein)</span><b class="${fk && fk.nr === 4 ? "minus" : ""}">${fk ? `${fk.nr} z 4 · ${esc(fk.nazwa)}` : "–"}</b></div>`; })()}
          ${wiersze.map(([n, a, b]) => `<div class="kr-sum-w"><span>${n}${n === "Wycena" && K.etykieta ? ` <span class="pill p-${slug(K.etykieta)}">${esc(K.etykieta)}</span>` : ""}</span>${b ? kropki(a, b) : ""}<b>${b ? `${a} z ${b}` : "–"}</b></div>`).join("")}
          <div class="kr-sum-w kr-razem"><span>Kryteria 7/7</span>${wsz ? kropki(suma, wsz) : ""}<b>${wsz ? `${suma} z ${wsz}` : "–"}</b></div></div>
          ${brak.length ? `<p class="male">Nie spełnia: ${esc(brak.join("; "))}.</p>` : wsz ? '<p class="male"><b>Spełnia wszystkie kryteria 7/7.</b></p>' : ""}
          ${M.spadek_2l || ow ? `<p class="male" style="color:var(--czerwony-t)">${M.spadek_2l ? "⬇ Przychody lub zysk spadają 2 lata z rzędu. " : ""}${ow ? `❗ Ostrzeżenia: ${ow} (zob. „Kluczowe liczby”).` : ""}</p>` : ""}
          <p class="mut male">To zestawienie faktów, nie rekomendacja — decyzję podejmujesz sam. W testach 2015–2026 portfel spółek 7/7 (PEG 0–1) dawał 18–21 % rocznie wobec 14 % dla S&amp;P 500 (etapy 67–68).</p>`;
    }
    function krok(i) {
        if (i !== undefined) S.krok = i;
        const k = S.krok || 0, el = $("krok");
        el.innerHTML = `<h2>Ocena krok po kroku</h2><div class="pod">Krótka ocena spółki według kryteriów 7/7 — przejdź kolejne kroki albo od razu zobacz podsumowanie.</div>
          <div class="kr-kroki">${KROKI.map((n, j) => `<button data-kr="${j}" class="${j === k ? "akt" : ""}"><span>${j + 1}</span>${n}</button>`).join("")}</div>
          <div class="kr-tresc"><h3>${k + 1}. ${KROKI[k]}</h3>${krokTresc(k)}</div>
          <div class="kr-nawig">${k > 0 ? `<button data-kr="${k - 1}">← ${KROKI[k - 1]}</button>` : "<span></span>"}${k < KROKI.length - 1 ? `<button data-kr="${k + 1}" class="dalej">${KROKI[k + 1]} →</button>` : ""}</div>`;
        el.querySelectorAll("button[data-kr]").forEach((b) => b.addEventListener("click", () => krok(+b.dataset.kr)));
        if (k === 1 && $("kr-wykres")) { const y = (K.hist && K.hist.y) || []; if (y.length) WY.slupki($("kr-wykres"), y.map((r) => r[0].slice(0, 4)), [{ nazwa: "Przychody", kolor: "#2a78d6", w: y.map((r) => r[1]) }, { nazwa: "Zysk netto", kolor: "#16a34a", w: y.map((r) => r[2]) }], usdOs, 220); }
    }

    function sprawozdania(tryb) {
        const el = $("sprawozdania");
        el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><h2>Sprawozdania finansowe</h2><div class="pod">${GPW ? "Z Yahoo Finance (ok. 4–5 lat rocznie, ostatnie kwartały)." : "Z raportów SEC (pierwsza publikacja, bez późniejszych korekt)."}</div></div>
          <div class="zakladki">${[["q", "Kwartalnie"], ["ttm", "12 mies. (TTM)"], ["y", "Rocznie"]].map(([k, n]) => `<button data-tr="${k}" class="${tryb === k ? "akt" : ""}">${n}</button>`).join("")}</div></div>
          <div class="mut male">Rachunek wyników</div><div id="sp-rw"></div>
          <div class="siatka2" style="margin-top:12px"><div><div class="mut male">Wolne przepływy (FCF = przepływy operacyjne − nakłady)</div><div id="sp-cf"></div></div>
            <div><div class="mut male">Bilans: gotówka i inwestycje krótkoterminowe a dług</div><div id="sp-bil"></div></div></div>`;
        el.querySelectorAll("button[data-tr]").forEach((b) => b.addEventListener("click", () => sprawozdania(b.dataset.tr)));
        const q = K.hist.q || [], y = K.hist.y || [];
        let ety, rev, ni, fcf;
        if (tryb === "y") { ety = y.map((x) => x[0].slice(0, 4)); rev = y.map((x) => x[1]); ni = y.map((x) => x[2]); fcf = y.map((x) => x[3]); }
        else if (tryb === "ttm") {
            const a = W.ttmSeria(q, 1), b = W.ttmSeria(q, 2), c = W.ttmSeria(q, 3);
            ety = a.map((x) => x[0].slice(0, 7)); rev = a.map((x) => x[1]); ni = b.map((x) => x[1]); fcf = c.map((x) => x[1]);
        } else { ety = q.map((x) => x[0].slice(0, 7)); rev = q.map((x) => x[1]); ni = q.map((x) => x[2]); fcf = q.map((x) => x[3]); }
        if (!ety.length) { $("sp-rw").innerHTML = '<p class="mut">Brak raportów us-gaap w SEC (np. spółka zagraniczna raportująca wg IFRS).</p>'; return; }
        WY.slupki($("sp-rw"), ety, [{ nazwa: "Przychody", kolor: "#2a78d6", w: rev }, { nazwa: "Zysk netto", kolor: "#16a34a", w: ni }], usdOs, 280);
        WY.slupki($("sp-cf"), ety, [{ nazwa: "FCF", kolor: "#10b981", w: fcf }], usdOs, 220);
        WY.slupki($("sp-bil"), q.map((x) => x[0].slice(0, 7)), [{ nazwa: "Gotówka", kolor: "#2a78d6", w: q.map((x) => x[4]) }, { nazwa: "Dług", kolor: "#eb6834", w: q.map((x) => x[5]) }], usdOs, 220);
    }

    function szukaj() {
        fetch(GPW ? "data/gpw.json" : "data/lista.json").then((r) => r.json()).then((d) => {
            LISTA = GPW ? d.rows.map((r) => ({ t: r.t, n: r.n, o: r.oceny })) : d.rows;
            $("tickery").innerHTML = d.rows.map((r) => `<option value="${esc(r.t)}">${esc(r.n)}</option>`).join("");
            if (K) liczby();
        }).catch(() => {});
        $("q").addEventListener("change", (e) => { const v = e.target.value.trim().toUpperCase(); if (v) location.href = "spolka.html?t=" + encodeURIComponent(v) + (GPW ? "&r=gpw" : ""); });
    }

    szukaj();
    fetch(`data/${GPW ? "gpw/" : ""}spolki/${encodeURIComponent(t)}.json`, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then((k) => {
        K = k; M = k.m; document.title = `${k.n} (${k.t}) · Fundamenta`;
        ORIG = { pct: { ...k.pct }, oceny: { ...k.oceny }, m: { ...k.m } };
        WL = (czytajWl()[k.t] || {}).w || {};
        if (Object.keys(WL).length) zastosuj();
        if (!GPW) fetch("data/sektory.json").then((r) => r.json()).then((d) => { ROZ = d; if (Object.keys(WL).length) { zastosuj(); odswiez(); } }).catch(() => {});
        domyslne(); top(); krok(0); liczby(); wykresCeny("1r"); metryki(); strategie(); wycena(); zyskZd(); lynch(); sprawozdania(GPW ? "y" : "q");
    }).catch((e) => { const el = $("err"); el.hidden = false; el.textContent = `Nie ma danych spółki ${t} (${e.message}). ${GPW ? "Lista GPW obejmuje WIG20, mWIG40 i sWIG80 (bez wykluczonych sektorów)." : "Lista obejmuje 500 największych spółek USA."}`; });
})();
