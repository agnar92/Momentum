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
        const wyc = K.etykieta ? `<div class="male" style="margin-top:6px">Wycena: <span class="pill p-${slug(K.etykieta)}">${esc(K.etykieta)}</span>${W.ok(m.peg) && m.peg > 0 ? ` PEG ${W.fmtNum(m.peg)}` : ""} · <a href="#wycena">PEG / DCF w podsumowaniu ↓</a></div>` : "";
        $("top").innerHTML = `
          <div class="naglowek"><h1>${esc(K.n)} <span class="tick">${esc(K.t)}</span>${jak77() ? ' <span class="jakosc duzy" title="Spełnia wszystkie 7 kryteriów jakości — szczegóły w sekcji Strategie">✔ Jakość 7/7</span>' : ""}${duz6() ? ' <span class="jakosc duzy duzy-z" title="Duża spółka rosnąca od 10+ lat — PEG 1–2 to cena godziwa">🏛 Duży zwycięzca</span>' : ""}${M.dywidenda_stabilna ? ' <span class="jakosc duzy" title="Dywidenda co roku przez 5 lat, bez cięcia">💰 Stabilna dywidenda</span>' : ""}${W.buffettM(M) ? ' <span class="jakosc duzy" title="Marża netto > 20 % (2 lata), dług długoterminowy ≤ 4 × zysk, SG&A < 30 % zysku brutto — szczegóły w sekcji Strategie">🏰 Przewaga Buffetta</span>' : ""}</h1>
            <div class="mut">${esc(K.sector || "")} · ${esc(K.industry || "")} · ${esc(K.country || "")}${K.www ? ` · <a href="${esc(K.www)}" target="_blank" rel="noopener">strona firmy</a>` : ""}${K.cik ? ` · <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(K.cik)}&type=10-K" target="_blank" rel="noopener">raporty w SEC</a>` : ""}</div>
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
        else $("pf-dodaj").addEventListener("click", () => zapisz({ ...pf, pozycje: (pf.pozycje || []).concat([{ t: K.t, akcje: 0, koszt: null,
            typ0: (K.typy && K.typy[0] && K.typy[0][0]) || null, dod: new Date().toISOString().slice(0, 10) }]) }));
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
            if (/Buffett|akcje własne|4 × zysk|zysku netto \(3 lata\)|SG&A/.test(n) && v >= 99) return /kapitał/.test(n) ? "ujemny kapitał" : "strata";
            if (/4 × zysk/.test(n)) return v <= 0 ? "brak długu" : W.fmtNum(v, 1) + " × zysk";
            if (/Zobowiązania/.test(n)) return W.fmtNum(v);
            if (/≥ 9 z 10 lat/.test(n)) return v + " z " + M.bf_eps_n + (M.bf_eps_zysk === false ? ", była strata" : "");
            if (/Odsetki/.test(n) && v >= 99) return "strata operacyjna";
            if (/Dług|PEG/.test(n)) return W.fmtNum(v);
            if (/FCF > 0/.test(n)) return W.fmtUsd(v);
            if (/Lata|≥ 3 z 5|≥ 2 z 3|z 10 lat/.test(n)) return String(v);
            if (/Kapitalizacja/.test(n)) return W.fmtUsd(v) + " " + WAL;
            if (/2 × w 10 lat/.test(n)) return W.fmtNum(v, 1) + " ×";
            if (/ROE wyższe/.test(n)) return (n.match(/niż (.*)$/) || ["", ""])[1] + " " + W.fmtPct(v, 0) + " → dziś " + W.fmtPct(M.roe_sec, 0);
            return W.fmtPct(v, 1);
        };
        $("strategie").innerHTML = `<h2>Strategie</h2><div class="pod">Kryteria z naszego badania (research/), z filmów autora (Zyskowność, Przepływy pieniężne) i 8 reguł Buffetta z książki Mary Buffett: ile z nich spółka dziś spełnia.</div><div class="kol3">` +
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
        // marża FCFF: FCF po odjęciu wynagrodzeń w akcjach (SBC) + odsetki po podatku (dług odejmujemy od wartości, więc odsetek nie liczymy dwa razy)
        const sm = W.ok(M.sbc_przych) ? M.sbc_przych : 0, om_ = W.ok(M.odsetki_przych) ? M.odsetki_przych : 0;
        const y = (K.hist.y || []).slice(-5).filter((x) => x[1] > 0 && W.ok(x[3])).map((x) => (x[3] - (W.ok(x[4]) ? x[4] : sm * x[1])) / x[1] + om_).sort((a, b) => a - b);
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
            ${W.ok(base) && base > 0 && S.geps > W.LIMIT_LYNCH ? (() => { const p25 = W.peg25(pe, S.geps);
                return `<div class="male" style="margin-top:6px">PEG Lyncha (wzrost liczony najwyżej 25 % rocznie): <b>${W.fmtNum(p25)}</b> — ${esc(W.etykietaPeg(p25) || "")}. Lynch nie ufał, że wzrost szybszy niż 20–25 % rocznie utrzyma się kilka lat (informacyjnie).</div>`; })() : ""}
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
              <div class="chipy">${chip("m", W.ok(M.fcf_margin) ? M.fcf_margin - (W.ok(M.sbc_przych) ? M.sbc_przych : 0) + (W.ok(M.odsetki_przych) ? M.odsetki_przych : 0) : null, "12 mies.")}${chip("m", m5, "mediana 5 lat")}</div>
                <span class="mut male">Wolne przepływy dla firmy (FCFF): FCF po odjęciu wynagrodzeń w akcjach (SBC${W.ok(M.sbc_przych) ? " " + W.fmtPct(M.sbc_przych, 1) + " przychodów" : ""}) plus odsetki po podatku${W.ok(M.odsetki_przych) && M.odsetki_przych > 0 ? " (" + W.fmtPct(M.odsetki_przych, 1) + " przychodów)" : ""}, bo dług odejmujemy od wartości; dług z leasingiem${W.ok(M.leasing) ? " (" + W.fmtUsd(M.leasing) + " USD)" : ""}.</span></label>
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
        // wszystkie sygnały Lyncha liczą się tak samo (użytkownik: „jeżeli Lynch mówi, że działa, to działa”)
        const ikona = (s) => (s === true ? '<b style="color:var(--zielony)">✓</b>' : s === false ? '<b style="color:var(--czerwony)">⚠</b>' : '<span class="mut">–</span>');
        const wsk = L && W.ok(L.wskaznik) ? L.wskaznik : null;
        const ocWsk = wsk === null ? "" : wsk >= 2 ? "bardzo dobrze" : wsk >= 1.5 ? "przyzwoicie" : wsk >= 1 ? "słabo" : "drogo";
        const lista = (L && L.lista) || [];
        const ost = lista.filter((x) => x[2] === false).length;
        el.innerHTML = `<h2>Peter Lynch: typ, faza i kiedy sprzedać</h2><div class="pod">Metoda z książki „One Up on Wall Street” (P. Lynch, 1989). Typ: <b>${esc(typ)}</b>${L && L.faza ? ` · faza: <b>${esc(L.faza[0])}</b> <span class="mut">(${esc(L.faza[1])})</span>` : ""}.</div>
          <div class="siatka2"><div class="male">
            <p style="margin:0 0 8px"><b>Czym jest:</b> ${esc(LYNCH[typ][0])}</p>
            <p style="margin:0 0 8px"><b>Kiedy sprzedać (Lynch):</b> ${esc(LYNCH[typ][1])}</p>
            <p style="margin:0" class="mut">Wskaźnik Lyncha z dywidendą = (wzrost zysku % + stopa dywidendy %) ÷ P/E: poniżej 1 słabo, 1,5 przyzwoicie, 2 i więcej bardzo dobrze.
              ${wsk !== null ? ` Tutaj: <b>${W.fmtNum(wsk)}</b> — ${ocWsk}.` : ""}</p></div>
          <div><div class="mut male" style="margin-bottom:4px">Lista kontrolna z danych${ost ? ` — <b style="color:var(--czerwony)">sygnały ostrzegawcze: ${ost}</b>` : ""}</div>
            ${lista.length ? `<div class="jz">${lista.map(([co, w, s]) => `<div class="ly-w"><span>${ikona(s)}</span><span>${esc(co)}</span><span class="mut ly-wart">${esc(w)}</span></div>`).join("")}</div>`
              : '<p class="mut male">Brak danych do listy kontrolnej (dane odświeżą się przy najbliższej aktualizacji).</p>'}
            <p class="mut male" style="margin-top:6px">✓ w porządku · ⚠ sygnał ostrzegawczy wg Lyncha · – brak danych lub do oceny samemu.</p></div></div>${lynchListy(L)}`;
        podlaczOcenyLynch();
    }
    // --- Lynch: listy z książki (rozdz. 8, 9, 13, 15); punkty „oceń sam” zaznacza użytkownik (localStorage `fundamenta_lynch`) ---
    const LY_KLUCZ = "fundamenta_lynch";
    const czytajLy = () => { try { return (JSON.parse(localStorage.getItem(LY_KLUCZ)) || {})[K.t] || {}; } catch (e) { return {}; } };
    function zapiszLy(k, v) {
        try { const w = JSON.parse(localStorage.getItem(LY_KLUCZ)) || {}; w[K.t] = { ...(w[K.t] || {}), [k]: v }; localStorage.setItem(LY_KLUCZ, JSON.stringify(w)); } catch (e) { /* tryb prywatny */ }
    }
    function lynchListy(L) {
        if (!L || !L.zakup) return "";
        const moje = czytajLy();
        const ik = (s) => (s === true ? '<b style="color:var(--zielony)">✓</b>' : s === false ? '<b style="color:var(--czerwony)">✗</b>' : '<span class="mut">–</span>');
        const wiersz = (sekcja) => ([co, w, s], i) => {
            const klucz = sekcja + ":" + co;
            if (s === null && /oceń sam/.test(w)) {
                const v = moje[klucz];
                return `<div class="ly-w"><span>${v === true ? ik(true) : v === false ? ik(false) : '<span class="mut">?</span>'}</span><span>${esc(co)}</span>
                  <span class="ly-wart ly-moje"><button data-ly="${esc(klucz)}" data-v="1" class="${v === true ? "akt" : ""}">tak</button><button data-ly="${esc(klucz)}" data-v="0" class="${v === false ? "akt" : ""}">nie</button></span></div>`;
            }
            return `<div class="ly-w"><span>${ik(s)}</span><span>${esc(co)}</span><span class="mut ly-wart">${esc(w)}</span></div>`;
        };
        const ile = (l, sek) => `${l.map(([co, w, s]) => (s === null && /oceń sam/.test(w) ? moje[sek + ":" + co] : s)).filter((x) => x === true).length} z ${l.length}`;
        const lista = (tyt, pod, l, sek) => `<div class="ly-blok"><h3>${esc(tyt)} <span class="mut male">${ile(l, sek)}</span></h3><div class="mut male" style="margin-bottom:4px">${pod}</div>
          <div class="jz">${l.map(wiersz(sek)).join("")}</div></div>`;
        const liczby = `<div class="ly-blok"><h3>Liczby, które się liczą</h3><div class="mut male" style="margin-bottom:4px">Rozdz. 13: dziesięć liczb, które Lynch sprawdzał przy każdej spółce.</div>
          <div class="jz">${(L.liczby || []).map(([co, w, s, kom]) => `<div class="ly-w"><span>${ik(s)}</span><span>${esc(co)}<br><span class="mut" style="font-size:11px">${esc(kom)}</span></span><span class="ly-wart"><b>${esc(w)}</b></span></div>`).join("")}</div></div>`;
        return `<div class="ly-listy">
          ${lista("Przed zakupem: lista kontrolna", `Rozdz. 15 („The Final Checklist”) — wspólne punkty i punkty dla typu: <b>${esc((K.typy && K.typy[0] && K.typy[0][0]) || "")}</b>.`, L.zakup, "zakup")}
          ${liczby}
          ${lista("13 cech idealnej spółki", "Rozdz. 8. Im więcej cech, tym lepiej; nie trzeba mieć wszystkich. Punkty „tak / nie” oceniasz sam — zapamiętamy je w tej przeglądarce.", L.cechy, "cechy")}
          ${lista("Czego unikać", "Rozdz. 9. ✓ = brak problemu, ✗ = ostrzeżenie.", L.unikaj, "unikaj")}
        </div>`;
    }
    function podlaczOcenyLynch(root) {
        (root || $("lynch")).querySelectorAll("[data-ly]").forEach((b) => b.addEventListener("click", () => {
            const k = b.dataset.ly, v = b.dataset.v === "1", ter = czytajLy()[k];
            zapiszLy(k, ter === v ? null : v);
            if (szczRys) lynch();
            if ((S.krok || 0) === KROKI.length - 1) { const y = window.scrollY; krok(); window.scrollTo(0, y); }
        }));
    }

    // --- Ocena krok po kroku (użytkownik: „mini ocena spółki … krok po kroku” z kryteriów 7/7): faza, wzrost, rentowność, bezpieczeństwo, wycena, podsumowanie.
    // Tylko fakty z danych i kryteria z testów; bez werdyktu „kup / sprzedaj” (spółki wybiera użytkownik).
    // etapy cyklu życia firmy wg A. Damodarana (opisy etapów jak na jego schemacie, warunki liczbowe nasze — z danych)
    const CYKL = { 1: "Start-up: opracować pomysł na biznes, który zaspokaja niezaspokojoną potrzebę rynku. Sprzedaż już jest, ale spółka nie zarabia, a strata nie maleje.",
        2: "Wczesny wzrost: stworzyć model biznesowy, który przekuwa pomysł w przychody i zyski. Spółka jeszcze traci, ale strata maleje albo sprzedaż rośnie ≥ 25 % rocznie.",
        3: "Szybki wzrost: zbudować firmę, przekuwając przychody potencjalne w faktyczne. Spółka zarabia, a przychody rosną ≥ 20 % rocznie (3 lata). Tu wraca też dojrzała spółka, której sprzedaż znów rośnie tak szybko drugi rok z rzędu (odmłodzenie wg Damodarana).",
        4: "Dojrzały wzrost: rozwijać firmę i jej zyski. Spółka zarabia, przychody rosną wolniej (6–20 % rocznie).",
        5: "Dojrzała stabilizacja: bronić firmy przed zakusami konkurencji i znajdować nowe rynki. Przychody rosną < 6 % rocznie przez 5 lat (dwa lata z rzędu), zwykle z dywidendą lub skupem akcji.",
        6: "Faza schyłkowa: zmniejszać skalę działalności wraz z kurczeniem się rynku. Sprzedaż od dwóch lat niższa niż 5 lat wcześniej; spółka wychodzi z tej fazy dopiero, gdy przychody i zysk przebiją poprzedni szczyt." };
    const KROKI = ["Faza", "Typ", "Wzrost", "Przewaga", "Bezpieczeństwo", "Zarząd", "Wycena", "Werdykt"];
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
    // --- wykresy fazy: tylko dane z raportów (lata obrotowe + ostatnie 12 mies.), każdy punkt to liczba z raportu ---
    function seriaFazy() {
        // fazę liczymy z całej historii (do 12 lat), na wykresie pokazujemy ostatnie lata (telefon 5, komputer 8)
        // zdublowane lata obrotowe (okres przejściowy, korekta) — zostaje późniejszy wpis
        const y = ((K.hist && K.hist.y) || []).filter((r, i, a) => i === a.length - 1 || Date.parse(a[i + 1][0]) - Date.parse(r[0]) > 300 * 864e5), l = K.hist && K.hist.ltm;
        const zLtm = !!(l && l[0] && (!y.length || l[0] > y[y.length - 1][0]));
        const et = y.map((r) => "FY" + r[0].slice(2, 4)).concat(zLtm ? ["12 m"] : []);
        const kol = (iy, il) => y.map((r) => (r.length > iy ? r[iy] : null)).concat(zLtm ? [il === null ? null : l[il]] : []);
        // zysk operacyjny tylko, gdy jest prawie w każdym roku i w ostatnim punkcie; inaczej cała seria z zysku netto (porównania szczytów muszą być spójne)
        const op = kol(5, 2), maOp = op.filter(W.ok).length >= 0.8 * op.length && W.ok(op[op.length - 1]);
        const zysk = maOp ? op : kol(2, null);
        if (!maOp && zLtm && W.ok(M.ni_ttm)) zysk[zysk.length - 1] = M.ni_ttm;
        const rev = kol(1, 1);
        if (zLtm && !W.ok(rev[rev.length - 1]) && W.ok(M.rev_ttm)) rev[rev.length - 1] = M.rev_ttm;
        const skup = kol(6, 3), dyw = kol(7, 4), akcje = kol(8, 5);
        const wyplaty = skup.map((v, i) => (W.ok(v) || W.ok(dyw[i]) ? (v || 0) + (dyw[i] || 0) : null));
        const fazy = W.fazyLat({ rev, zysk, wyplaty, ltm: zLtm });
        const ile = (SZER < 700 ? 5 : 8) + (zLtm ? 1 : 0), o = (a) => a.slice(-ile);
        return { et: o(et), rev: o(rev), zysk: o(zysk), zyskNazwa: maOp ? "zysk operacyjny" : "zysk netto", skup: o(skup), dyw: o(dyw), akcje: o(akcje), wyplaty: o(wyplaty), fazy: o(fazy) };
    }
    function fazaTeraz(sf) {
        const k = sf.fazy.length - 1, nr = sf.fazy[k];
        if (!nr) return null;
        const z = sf.zysk[k], w = sf.wyplaty[k];
        return { nr, nazwa: W.FAZY[nr - 1], pyt: { przychody: W.ok(M.rev_cagr3) ? M.rev_cagr3 >= 0 : null, zysk: W.ok(z) ? z > 0 : null, zwrot: W.ok(w) ? w > 0 : null } };
    }
    const kw = (v) => (v === 0 ? "0" : W.ok(v) ? W.fmtUsd(v) : "–");
    const szt = (v) => (W.ok(v) ? (v >= 1e9 ? W.fmtNum(v / 1e9, 2) + " mld" : W.fmtNum(v / 1e6, 0) + " mln") : "–");
    let SZER = 1000;  // szerokość sekcji w px — wykresy rysujemy w skali 1:1, żeby napisy miały stały rozmiar
    function mini(et, w, kolor, fmt, wys = 130, sz = 300, odZera = true) {
        // wykres liniowy: punkty = wartości z raportów; podpisane pierwsza i ostatnia wartość, oś zera przy wartościach ujemnych
        const p = w.map((v, i) => [i, v]).filter((x) => W.ok(x[1]));
        if (p.length < 2) return '<div class="mut male kr-brak">Brak danych w raportach.</div>';
        const n = et.length, w0 = p.map((x) => x[1]), mx0 = Math.max(...w0), mn0 = Math.min(...w0);
        // liczba akcji: skala od najmniejszej do największej wartości (zmiana o kilka % musi być widoczna); kwoty: od zera
        const mn = odZera ? Math.min(0, mn0) : mn0 - (mx0 - mn0 || mx0 * 0.01) * 0.6, mx = odZera ? mx0 : mx0 + (mx0 - mn0 || mx0 * 0.01) * 0.2, zak = mx - mn || 1;
        const X = (i) => 22 + (i / Math.max(1, n - 1)) * (sz - 44), Y = (v) => 26 + (1 - (v - mn) / zak) * (wys - 52);
        const pierw = p[0], ost = p[p.length - 1];
        const zero = mn < 0 ? `<line x1="10" x2="${sz - 10}" y1="${Y(0)}" y2="${Y(0)}" class="kr-zero"/>` : "";
        const pole = !odZera ? "" : `<path d="M${X(pierw[0])},${Y(Math.max(mn, 0))} ${p.map(([i, v]) => `L${X(i)},${Y(v)}`).join(" ")} L${X(ost[0])},${Y(Math.max(mn, 0))}Z" style="fill:${kolor};opacity:.10"/>`;
        return `<svg viewBox="0 0 ${sz} ${wys}" width="${sz}" height="${wys}" class="kr-mini" role="img">${zero}${pole}
          <polyline points="${p.map(([i, v]) => `${X(i)},${Y(v)}`).join(" ")}" fill="none" stroke-width="2.5" stroke-linejoin="round" style="stroke:${kolor}"/>
          ${p.map(([i, v]) => `<circle cx="${X(i)}" cy="${Y(v)}" r="${i === ost[0] ? 4.5 : 2.5}" style="fill:${kolor}"><title>${esc(et[i])}: ${esc(fmt(v))}</title></circle>`).join("")}
          <text x="${X(pierw[0])}" y="${Y(pierw[1]) - 9}" class="kr-tx" text-anchor="start">${esc(fmt(pierw[1]))}</text>
          <text x="${X(ost[0])}" y="${Y(ost[1]) - 10}" class="kr-tx kr-tx-b" text-anchor="end">${esc(fmt(ost[1]))}</text>
          ${et.map((e, i) => `<text x="${X(i)}" y="${wys - 4}" class="kr-tx kr-tx-os" text-anchor="middle">${esc(e)}</text>`).join("")}</svg>`;
    }
    const KOL_FAZ = { 1: "var(--czerwony)", 2: "var(--zolty)", 3: "var(--niebieski)", 4: "var(--zielony)", 5: "var(--pomarancz)", 6: "var(--tekst2)" };
    function wykresFaz(sf) {
        // jeden wykres jak schemat cyklu, ale z danych spółki: przychody, zysk, wypłaty (dywidendy + skup); tło = faza w danym roku
        const n = sf.et.length, S_ = Math.max(280, SZER - 30), H = SZER < 700 ? 280 : 250, L = 8, R = S_ - 66, gora = 34, dol = H - 26;
        const wsz = [...sf.rev, ...sf.zysk, ...sf.wyplaty].filter(W.ok);
        if (n < 2 || !wsz.length) return "";
        const mn = Math.min(0, ...wsz), mx = Math.max(...wsz), zak = mx - mn || 1, krok = (R - L) / n;
        const X = (i) => L + krok * (i + 0.5), Y = (v) => gora + (1 - (v - mn) / zak) * (dol - gora);
        let pasy = "", et = "";
        for (let i = 0; i < n; i++) {
            const f = sf.fazy[i];
            if (f) pasy += `<rect x="${L + krok * i}" y="${gora - 4}" width="${krok}" height="${dol - gora + 8}" style="fill:${KOL_FAZ[f]};opacity:.09"/>`;
            if (f && f !== sf.fazy[i - 1]) {
                pasy += `<line x1="${L + krok * i}" x2="${L + krok * i}" y1="${gora - 22}" y2="${dol + 4}" style="stroke:${KOL_FAZ[f]};opacity:.5"/>`;
                et += `<text x="${L + krok * i + 4}" y="${gora - 12}" class="kr-tx kr-tx-b" style="fill:${KOL_FAZ[f]}">${f}${krok * (sf.fazy.slice(i).findIndex((x) => x !== f) === -1 ? n - i : sf.fazy.slice(i).findIndex((x) => x !== f)) > 120 ? " " + esc(W.FAZY[f - 1]) : ""}</text>`;
            }
        }
        const zajete = [];
        const etY = (y) => { let v = y; while (zajete.some((z) => Math.abs(z - v) < 13)) v += 13; zajete.push(v); return v; };
        const linia = (w, kolor, gr) => {
            const p = w.map((v, i) => [i, v]).filter((x) => W.ok(x[1]));
            if (p.length < 2) return "";
            const o = p[p.length - 1];
            return `<polyline points="${p.map(([i, v]) => `${X(i)},${Y(v)}`).join(" ")}" fill="none" stroke-width="${gr}" stroke-linejoin="round" style="stroke:${kolor}"/>
              ${p.map(([i, v]) => `<circle cx="${X(i)}" cy="${Y(v)}" r="${i === o[0] ? 4 : 2.5}" style="fill:${kolor}"/>`).join("")}
              <text x="${X(o[0]) + 8}" y="${etY(Y(o[1]) + 4)}" class="kr-tx kr-tx-b" style="fill:${kolor}">${esc(kw(o[1]))}</text>`;
        };
        const tipy = sf.et.map((e, i) => `<rect x="${L + krok * i}" y="${gora - 4}" width="${krok}" height="${dol - gora + 8}" fill="transparent"><title>${esc(e)}${sf.fazy[i] ? " · faza " + sf.fazy[i] + ": " + W.FAZY[sf.fazy[i] - 1] : ""}
przychody: ${kw(sf.rev[i])}
${sf.zyskNazwa}: ${kw(sf.zysk[i])}
dywidendy + skup: ${kw(sf.wyplaty[i])}</title></rect>`).join("");
        return `<svg viewBox="0 0 ${S_} ${H}" width="${S_}" height="${H}" class="kr-tempo" role="img" aria-label="Przychody, zysk i wypłaty dla akcjonariuszy rok po roku">${pasy}${et}
          ${mn < 0 ? `<line x1="${L}" x2="${R}" y1="${Y(0)}" y2="${Y(0)}" class="kr-zero"/>` : `<line x1="${L}" x2="${R}" y1="${Y(0)}" y2="${Y(0)}" class="kr-os"/>`}
          ${linia(sf.rev, "var(--niebieski)", 3)}${linia(sf.zysk, "var(--zielony)", 3)}${linia(sf.wyplaty, "var(--fiolet)", 2.5)}
          ${sf.et.map((e, i) => `<text x="${X(i)}" y="${H - 6}" class="kr-tx kr-tx-os" text-anchor="middle">${esc(e)}</text>`).join("")}${tipy}</svg>
          <div class="kr-leg male"><span style="color:var(--niebieski)">● przychody</span><span style="color:var(--zielony)">● ${esc(sf.zyskNazwa)}</span><span style="color:var(--fiolet)">● dywidendy + skup akcji</span>
            </div>
          <div class="kr-leg male"><span class="mut">Tło — etap cyklu życia wg Damodarana (okno 3 lat, długoterminowo):</span>${Object.entries(KOL_FAZ).map(([k, c]) => `<span style="color:${c}">${k} ${esc(W.FAZY[k - 1])}</span>`).join("")}</div>`;
    }
    function liniaRr(et, serie, wys = 210) {
        // linie z raportów; przy każdym punkcie zmiana rok do roku (zielona / czerwona)
        const S_ = Math.max(280, SZER - 4), n = et.length, L = 10, R = S_ - 66, gora = 26, dol = wys - 26;
        const wsz = serie.flatMap((x) => x.w).filter(W.ok);
        if (n < 2 || !wsz.length) return "";
        const mn = Math.min(0, ...wsz), mx = Math.max(...wsz), zak = mx - mn || 1, kr = (R - L) / n;
        const X = (i) => L + kr * (i + 0.5), Y = (v) => gora + (1 - (v - mn) / zak) * (dol - gora);
        const rr = (w, i) => (i > 0 && W.ok(w[i]) && W.ok(w[i - 1]) && w[i - 1] > 0 ? w[i] / w[i - 1] - 1 : null);
        const lin = serie.map(({ w, kolor }, si) => {
            const p = w.map((v, i) => [i, v]).filter((x) => W.ok(x[1]));
            if (p.length < 2) return "";
            const o = p[p.length - 1];
            return `<polyline points="${p.map(([i, v]) => `${X(i)},${Y(v)}`).join(" ")}" fill="none" stroke-width="3" stroke-linejoin="round" style="stroke:${kolor}"/>
              ${p.map(([i, v]) => { const g = rr(w, i); return `<circle cx="${X(i)}" cy="${Y(v)}" r="${i === o[0] ? 4.5 : 3.5}" style="fill:var(--karta);stroke:${kolor};stroke-width:2"><title>${esc(et[i])}: ${esc(kw(v))}${W.ok(g) ? " (" + W.fmtPct(g, 1, true) + " r/r)" : ""}</title></circle>`
                + (W.ok(g) && kr > 34 ? `<text x="${X(i)}" y="${si === 0 || Y(v) + 17 > dol - 4 ? Y(v) - 9 : Y(v) + 17}" class="kr-tx kr-tx-b" text-anchor="middle" style="fill:${g >= 0 ? "var(--zielony-t)" : "var(--czerwony-t)"}">${esc(W.fmtPct(g, 0, true))}</text>` : ""); }).join("")}
              <text x="${X(o[0]) + 9}" y="${Y(o[1]) + 4}" class="kr-tx kr-tx-b" style="fill:${kolor}">${esc(kw(o[1]))}</text>`;
        }).join("");
        return `<svg viewBox="0 0 ${S_} ${wys}" width="${S_}" height="${wys}" class="kr-tempo" role="img">
          <line x1="${L}" x2="${R}" y1="${Y(0)}" y2="${Y(0)}" class="${mn < 0 ? "kr-zero" : "kr-os"}"/>${lin}
          ${et.map((e, i) => `<text x="${X(i)}" y="${wys - 6}" class="kr-tx kr-tx-os" text-anchor="middle">${esc(e)}</text>`).join("")}</svg>
          <div class="kr-leg male">${serie.map((x) => `<span style="color:${x.kolor}">● ${esc(x.nazwa)}</span>`).join("")}<span class="mut">liczby przy punktach: zmiana rok do roku</span></div>`;
    }
    function peHistoria() {
        // P/E tydzień po tygodniu z 5 lat: kurs ÷ (zysk netto 12 mies. ÷ dzisiejsza liczba akcji); zysk znany ~45 dni po końcu kwartału
        const c = K.ceny && K.ceny.c, d = K.ceny && K.ceny.d, q = (K.hist && K.hist.q) || [], akcje = M.shares;
        if (!c || !d || !W.ok(akcje) || akcje <= 0) return null;
        const ttm = W.ttmSeria(q, 2).filter((x) => W.ok(x[1])).map(([e, v]) => [new Date(new Date(e).getTime() + 45 * 864e5).toISOString().slice(0, 10), v]);
        const pe = [], dd = [];
        let k = -1;
        for (let i = 0; i < c.length; i++) {
            while (k + 1 < ttm.length && ttm[k + 1][0] <= d[i]) k++;
            if (k < 0 || !W.ok(c[i])) continue;
            const eps = ttm[k][1] / akcje;
            if (eps <= 0) continue;
            const v = c[i] / eps;
            if (v > 0 && v < 400) { pe.push(v); dd.push(d[i]); }
        }
        if (pe.length < 52) return null;
        const so = pe.slice().sort((a, b) => a - b), kw_ = (p) => so[Math.floor(p * (so.length - 1))];
        const eps0 = ttm[ttm.length - 1][1] / akcje;
        return { d: dd, pe, t1: kw_(1 / 3), t2: kw_(2 / 3), med: kw_(0.5), teraz: pe[pe.length - 1], eps: eps0 };
    }
    function wykresPe(h) {
        const S_ = Math.max(280, SZER - 4), H = SZER < 700 ? 280 : 240, L = 40, R = S_ - 70, gora = 12, dol = H - 24, n = h.pe.length;
        const mx = Math.max(...h.pe) * 1.05, mn = Math.min(...h.pe) * 0.95;
        // skala logarytmiczna: skoki P/E (np. 250× przy chwilowo niskim zysku) nie spłaszczają reszty wykresu
        const t0 = Date.parse(h.d[0]), t1 = Date.parse(h.d[n - 1]) || t0 + 1, lg = Math.log, X = (i) => L + ((Date.parse(h.d[i]) - t0) / (t1 - t0)) * (R - L), Y = (v) => gora + (1 - (lg(v) - lg(mn)) / (lg(mx) - lg(mn))) * (dol - gora);
        const zaj = [], odsun = (y) => { let v = y; while (zaj.some((z) => Math.abs(z - v) < 13)) v -= 13; zaj.push(v); return v; };
        const pas = (a, b, kl) => `<rect x="${L}" y="${Y(Math.min(b, mx))}" width="${R - L}" height="${Math.max(0, Y(Math.max(a, mn)) - Y(Math.min(b, mx)))}" class="${kl}"/>`;
        const cena = (pe) => W.fmtCena(pe * h.eps);
        const Xd = (t) => L + ((t - t0) / (t1 - t0)) * (R - L), lata = [];
        for (let r = +h.d[0].slice(0, 4) + 1; r <= +h.d[n - 1].slice(0, 4); r++) { const x = Xd(Date.parse(r + "-01-01")); if (x - L > 24 && R - x > 20) lata.push([String(r), x]); }
        return `<svg viewBox="0 0 ${S_} ${H}" width="${S_}" height="${H}" class="kr-tempo" role="img" aria-label="P/E z 5 lat">
          ${pas(mn, h.t1, "kr-pas-t")}${pas(h.t1, h.t2, "kr-pas-n")}${pas(h.t2, mx, "kr-pas-d")}
          ${[h.t1, h.med, h.t2].map((v) => { const ty = odsun(Y(v) + 4); return `<line x1="${L}" x2="${R}" y1="${Y(v)}" y2="${Y(v)}" class="kr-zero"/><text x="${L - 4}" y="${ty}" class="kr-tx" text-anchor="end">${esc(W.fmtNum(v, 1))}×</text>
            <text x="${R + 6}" y="${ty}" class="kr-tx">${esc(cena(v))}</text>`; }).join("")}
          ${(() => { const odc = [[]]; h.pe.forEach((v, i) => { if (i > 0 && Date.parse(h.d[i]) - Date.parse(h.d[i - 1]) > 21 * 864e5) odc.push([]); odc[odc.length - 1].push(`${X(i).toFixed(1)},${Y(v).toFixed(1)}`); });
              return odc.filter((o) => o.length > 1).map((o) => `<polyline points="${o.join(" ")}" fill="none" stroke-width="2" style="stroke:var(--tekst)"/>`).join(""); })()}
          <circle cx="${X(n - 1)}" cy="${Y(h.teraz)}" r="5" style="fill:var(--zolty)"><title>dziś: P/E ${esc(W.fmtNum(h.teraz, 1))}</title></circle>
          ${lata.map(([r, x]) => `<line x1="${x}" x2="${x}" y1="${dol}" y2="${dol + 4}" class="kr-os"/><text x="${x}" y="${H - 6}" class="kr-tx kr-tx-os" text-anchor="middle">${r}</text>`).join("")}</svg>
          <div class="kr-leg male"><span><i class="kr-sw kr-pas-t"></i>tanio (dolna 1/3 P/E z 5 lat)</span><span><i class="kr-sw kr-pas-n"></i>normalnie</span><span><i class="kr-sw kr-pas-d"></i>drogo (górna 1/3)</span>
            <span class="mut">po prawej: cena przy tym P/E i dzisiejszym zysku</span></div>`;
    }
    const naTle = (n, v, med, fmt) => {
        if (!W.ok(v)) return "";
        const mx = Math.max(Math.abs(v), Math.abs(med || 0)) || 1, sz = (x) => Math.max(2, 100 * Math.max(0, x) / mx);
        return `<div class="kr-tlo"><div class="kr-tlo-n">${esc(n)}</div>
          <div class="kr-tlo-p"><i style="width:${sz(v)}%" class="${W.ok(med) && v >= med ? "lep" : "gor"}"></i></div><b>${esc(fmt(v))}</b>
          <div class="mut kr-tlo-n">mediana</div><div class="kr-tlo-p"><i style="width:${sz(med)}%" class="med"></i></div><span class="mut">${W.ok(med) ? esc(fmt(med)) : "–"}</span></div>`;
    };
    const kropki5 = (x) => { const n = W.ok(x) ? Math.round(x / 2) : 0; return `<span class="kr-kropki kr-k5">${[1, 2, 3, 4, 5].map((j) => `<i class="${j <= n ? (n >= 4 ? "on" : n >= 3 ? "sr" : "sl") : ""}"></i>`).join("")}</span>`; };
    function etapy(nr) {
        return `<div class="kr-etapy">${W.FAZY.map((n, i) => `<div class="${i + 1 === nr ? "akt" : i + 1 < nr ? "za" : ""}"><span>${i + 1}</span><small>${esc(n)}</small></div>`).join("")}</div>`;
    }
    const zalicz = (idx) => { const l = lista77(); if (!l) return [0, 0]; const x = idx.map((i) => l[i]).filter(Boolean); return [x.filter((k) => k[2]).length, x.length]; };
    // --- pytania w krokach: jedna linia = ✓/✗ · krótkie pytanie · liczba (użytkownik: „bardziej obrazowo … na pierwszy rzut oka, max 1 minuta”);
    // fakty z danych, reguły Lyncha i Buffetta tak, jak je opisali; progi, których nie podali, są nasze
    const ikona3 = (s) => (s === true ? '<b class="kr-tak">✓</b>' : s === false ? '<b class="kr-nie">✗</b>' : '<span class="mut">–</span>');
    const pytania = (l) => `<div class="kr-pytania">${l.filter(Boolean).map(([q, st, odp, zr]) => `<div class="kr-p"><span class="kr-p-i">${ikona3(st)}</span>
        <span class="kr-p-q">${esc(q)}${zr ? ` <span class="kr-zr">${esc(zr)}</span>` : ""}</span><span class="kr-p-a">${odp}</span></div>`).join("")}</div>`;
    const wiecejTxt = (tyt, html) => `<details class="kr-wiecej-t"><summary>${esc(tyt)}</summary><div class="male">${html}</div></details>`;
    const bfK = (re) => { const l = K.strategie && Object.entries(K.strategie).find(([n]) => n.startsWith("Buffett")); return l ? l[1].find(([co]) => re.test(co)) : null; };
    const bfPyt = (q, re, fmt) => { const x = bfK(re); return x ? [q, x[2], fmt(x[1]), "Buffett"] : null; };
    const ppct = (x, z = 0) => (W.ok(x) ? W.fmtPct(x, z, true) : "–");
    // cykliczne: „PEG 0–2” nie dotyczy (Lynch) — także na kartach sprzed przeliczenia danych
    const kr77 = (nazwa) => { const l = lista77(); return l ? KR_IDX[nazwa].map((j) => l[j]).filter(Boolean).map(([co, v, ok]) => (/^PEG/.test(co) && cykliczna()
        ? ["PEG 0–2 (nie dotyczy cyklicznych)", false, esc(fmtKryt("PEG 0–2", v)), "7/7"] : [co, ok, esc(fmtKryt(co, v)), "7/7"])) : []; };
    // listy pytań kroków (używane też przez przegląd na górze)
    function lWzrost() {
        const fz = (K.lynch && K.lynch.faza) || null;
        return kr77("Wzrost").concat([
            bfPyt("EPS rośnie 9 z 10 lat", /^EPS rósł/, (v) => (W.ok(v) ? `${v} z ${M.bf_eps_n || 10}${M.bf_eps_zysk === false ? ", była strata" : ""}` : "–")),
            ["Zysk rośnie regularnie", W.ok(M.zysk_lata) ? M.zysk_lata >= 4 : null, W.ok(M.zysk_lata) ? `${M.zysk_lata} z 5 lat` : "–", "Lynch"],
            ["Wzrost przyspiesza", W.ok(M.przysp) ? M.przysp >= 0 : null, W.ok(M.przysp) ? (M.przysp >= 0 ? "przyspiesza" : "hamuje") : "–"],
            fz ? ["Szybka ekspansja trwa", fz[0] === "Szybka ekspansja", esc(fz[0]), "Lynch"] : null]).filter(Boolean);
    }
    function lPrzewaga() {
        const mp = M.marza_przed, mm = M.marza_przed_med;
        return kr77("Rentowność").concat([
            bfPyt("Marża brutto > 40 %", /^Marża brutto/, (v) => ppct(v, 0)),
            bfPyt("Marża netto > 20 %", /^Marża netto/, (v) => ppct(v, 0)),
            bfPyt("Koszty SG&A < 30 % zysku brutto", /^SG&A/, (v) => (W.ok(v) && v < 99 ? W.fmtPct(v, 0) : "–")),
            bfPyt("Capex < 25 % zysku", /^Capex/, (v) => (W.ok(v) && v < 99 ? W.fmtPct(v, 0) : v >= 99 ? "strata" : "–")),
            ["Marża wyższa niż w branży", W.ok(mp) && W.ok(mm) ? mp >= mm : null, W.ok(mp) ? `${W.fmtPct(mp, 0)}${W.ok(mm) ? ` vs ${W.fmtPct(mm, 0)}` : ""}` : "–", "Lynch"]]).filter(Boolean);
    }
    function lBezp() {
        const rz = M.rec_zysk, rk = M.rec_kurs_2020, rs = M.rec_spy_2020, dk = M.dlug_krotki, em = M.emerytury_mc;
        return kr77("Bezpieczeństwo").concat([
            bfPyt("Dług spłaci z zysku w ≤ 4 lata", /^Dług długoterminowy/, (v) => (v === 0 ? "brak długu" : W.ok(v) && v < 99 ? W.fmtNum(v, 1) + " roku" : "strata")),
            bfPyt("Odsetki < 15 % zysku operacyjnego", /^Odsetki/, (v) => (W.ok(v) && v < 99 ? W.fmtPct(v, 0) : v >= 99 ? "strata" : "–")),
            bfPyt("Zobowiązania / kapitał < 0,8", /^Zobowiązania/, (v) => (W.ok(v) && v < 99 ? W.fmtNum(v, 2) : v >= 99 ? "ujemny kapitał" : "–")),
            ["Mało długu krótkoterminowego", W.ok(dk) ? dk <= 0.3 : (W.ok(M.debt) && M.debt <= 0 ? true : null), W.ok(dk) ? W.fmtPct(dk, 0) + " długu" : "–", "Lynch"],
            ["Emerytury bez dużego deficytu", W.ok(em) ? em > -0.05 : null, W.ok(em) ? (em < 0 ? `deficyt ${W.fmtPct(-em, 1)}` : "ok") : "–", "Lynch"],
            ["Zysk przetrwał recesję", rz ? rz[1] >= -0.25 : null, rz ? `${rz[0]}: ${W.fmtPct(rz[1], 0, true)}` : "–", "Lynch"],
            ["Krach 2020 lepiej niż S&P 500", W.ok(rk) && W.ok(rs) ? rk >= rs : null, W.ok(rk) ? `${W.fmtPct(rk, 0, true)} vs ${W.fmtPct(rs, 0, true)}` : "–", "Lynch"]]).filter(Boolean);
    }
    function lZarzad() {
        const zm = (K.zdarzenia || []).filter((z) => z.p.some((p) => p[0] === "5.02")).length, ins = M.ins_kupujacy;
        return [
            ["Zarząd kupuje akcje (12 mies.)", W.ok(ins) ? ins > 0 : null, W.ok(ins) ? (ins > 0 ? `${ins} os., ${W.fmtUsd(M.ins_kupno_12m)} USD` : "nikt") : "–", "Lynch"],
            ["Spółka skupuje akcje", W.ok(M.akcje_3l) ? M.akcje_3l < 0 : null, W.ok(M.akcje_3l) ? `akcji ${W.fmtPct(M.akcje_3l, 1, true)} w 3 lata` : "–", "Lynch"],
            ["Stabilna dywidenda", W.ok(M.div) && M.div > 0 ? !!M.dywidenda_stabilna : null, W.ok(M.div) && M.div > 0 ? W.fmtPct(M.div, 1) + (M.dyw_rosnie_5 ? ", rośnie" : "") : "brak"],
            ["Mało funduszy i analityków", W.ok(M.inst_proc) && W.ok(M.analitycy) ? M.inst_proc < 0.5 && M.analitycy <= 10 : null, W.ok(M.inst_proc) ? `${W.fmtPct(M.inst_proc, 0)} · ${W.ok(M.analitycy) ? M.analitycy : "–"} anal.` : "–", "Lynch"],
            K.zdarzenia ? ["Stabilny zarząd (zmiany ≤ 1 w rok)", zm <= 1, `${zm} zmian(y)`] : null].filter(Boolean);
    }
    function pytWzrost() { return pytania(lWzrost()); }
    function pytPrzewaga() { return pytania(lPrzewaga()) + marzeWykres(); }
    function marzeWykres() {
        const y = ((K.hist && K.hist.y) || []).filter((r, i, a) => i === a.length - 1 || Date.parse(a[i + 1][0]) - Date.parse(r[0]) > 300 * 864e5).slice(SZER < 700 ? -5 : -10);
        if (y.length < 3) return "";
        const et = y.map((r) => "FY" + r[0].slice(2, 4)), m = (k) => y.map((r) => (W.ok(r[k]) && r[1] > 0 ? r[k] / r[1] : null));
        const mob = SZER < 700, sz = mob ? SZER - 60 : (SZER - 90) / 2, f = (v) => W.fmtPct(v, 0);
        return `<div class="kr-pyt" style="margin-top:8px"><div class="pole"><div class="mut male">Marża operacyjna w latach</div>${mini(et, m(5), "var(--niebieski)", f, 120, sz, false)}</div>
            <div class="pole"><div class="mut male">Marża netto w latach</div>${mini(et, m(2), "var(--zielony)", f, 120, sz, false)}</div></div>`;
    }
    function pytBezp() {
        const rk = M.rec_kurs_2020, rs = M.rec_spy_2020;
        const krach = W.ok(rk) && W.ok(rs) ? `<p class="mut male" style="margin:8px 0 2px">Krach 2020: spadek od szczytu do dołka</p><div class="kr-krach">${[["spółka", rk], ["S&P 500", rs]].map(([n, v]) => `<div><span>${n}</span><i style="width:${Math.min(100, 100 * Math.abs(v) / 0.7)}%" class="${n === "spółka" ? (v >= rs ? "lep" : "gor") : "med"}"></i><b>${W.fmtPct(v, 0, true)}</b></div>`).join("")}</div>` : "";
        return pytania(lBezp()) + krach;
    }
    function krokZarzad() {
        const SF = seriaFazy(), mob = SZER < 700, szP = mob ? SZER - 80 : (SZER - 140) / 3;
        const pod = (n, w, kolor, fmt, odZera = true) => `<div class="kr-pod"><div class="mut male">${n}</div>${mini(SF.et, w, kolor, fmt, 100, szP, odZera)}</div>`;
        return pytania(lZarzad()) + `<div class="kr-pody">${pod("Skup akcji (rocznie)", SF.skup, "var(--fiolet)", kw)}${pod("Liczba akcji", SF.akcje, "var(--fiolet)", szt, false)}${pod("Dywidendy (rocznie)", SF.dyw, "var(--fiolet)", kw)}</div>`;
    }
    // krok „Typ”: typ wg Lyncha i ostrożna prognoza na 5 lat (W.prognozaTypu); spółka o wyraźnie cyklicznych przychodach (dopasowanie „Cykliczna” ≥ 60)
    // liczona jak cykliczna — od średniego zysku z 5 lat, nie od szczytu cyklu (użytkownik: „rozsądnie, a nie euforia”)
    const fitTypu = (n) => { const c = (K.typy || []).find((x) => x[0] === n); return c ? c[1] : 0; };
    const cyklicznaFit = () => fitTypu("Cykliczna");
    // Lynch: PEG i niskie P/E nie opisują spółek cyklicznych (niskie P/E przy rekordowych zyskach = często szczyt cyklu); M.cykl_peg = ocena.cykliczna
    // (dopasowanie ≥ 60 i ≥ 2 lata spadku przychodów i zysku w 10 latach)
    function cyklSpadki() {     // jak ocena.cykl_spadki: lata (z 10) ze spadkiem przychodów ≥ 5 % i zysku ≥ 30 % (lub stratą)
        const y = ((K.hist && K.hist.y) || []).filter((r) => r[1]).slice(-11);
        let n = 0;
        for (let i = 1; i < y.length; i++) {
            const a = y[i - 1], b = y[i];
            if (a[1] > 0 && b[1] / a[1] - 1 <= -0.05 && (!W.ok(a[2]) || !W.ok(b[2]) || a[2] <= 0 || b[2] <= 0 || b[2] / a[2] - 1 <= -0.3)) n++;
        }
        return n;
    }
    const cykliczna = () => (M.cykl_peg !== undefined ? !!M.cykl_peg : K.sector !== "Healthcare" && cyklicznaFit() >= 60 && cyklSpadki() >= 2);
    // jak ostrzeżenie w ocena.ostrzezenia: cykliczna z zyskiem +50 % r/r i P/E poniżej mediany 5 lat — wg Lyncha często szczyt cyklu
    const cyklSzczyt = () => cykliczna() && W.ok(M.pe) && M.pe > 0 && W.ok(M.ni_1y) && M.ni_1y >= 0.5 && (!W.ok(M.pe_med5) || M.pe < M.pe_med5);
    function typPrognozy() { const ty = K.typy || []; if (!ty[0]) return null; if (cykliczna()) return "Cykliczna"; return duz6() ? W.DUZY : ty[0][0]; }
    function epsBaza(typ) {
        if (typ === "Cykliczna") {      // średni zysk z 5 lat obrotowych na dzisiejszą liczbę akcji
            const y = ((K.hist && K.hist.y) || []).filter((r) => W.ok(r[2])).slice(-5);
            if (y.length >= 3 && W.ok(M.shares) && M.shares > 0) return y.reduce((a, r) => a + r[2], 0) / y.length / M.shares;
        }
        return M.peg_norm_uzyte && W.ok(M.eps_norm) ? M.eps_norm : M.eps;
    }
    // mediana P/E z 5 lat jest liczona od zysku z raportu — gdy prognoza startuje od zysku znormalizowanego, przeliczamy ją na tę samą podstawę
    // (cena ÷ zysk znorm. = P/E × zysk ÷ zysk znorm.), inaczej P/E „spadałoby” tylko przez zmianę definicji zysku (np. KO)
    function medNaBazie(typ) {
        if (!W.ok(M.pe_med5)) return M.pe_med5;
        return typ !== "Cykliczna" && M.peg_norm_uzyte && W.ok(M.eps_norm) && M.eps_norm > 0 && W.ok(M.eps) && M.eps > 0 ? M.pe_med5 * M.eps / M.eps_norm : M.pe_med5;
    }
    function prognozaKarty() {
        const typ = typPrognozy(); if (!typ) return { brak: "brak typu" };
        return W.prognozaTypu({ typ, eps_baza: epsBaza(typ), eps_teraz: typ === "Cykliczna" ? (M.peg_norm_uzyte && W.ok(M.eps_norm) ? M.eps_norm : M.eps) : null, szybka: fitTypu("Szybko rosnąca") >= 60, pe: M.pe, cena: M.price, pe_med5: medNaBazie(typ), rev_cagr3: M.rev_cagr3, rev_cagr5: M.rev_cagr5, eps_next5: GPW ? M.ni_cagr3 : M.eps_next5 });
    }
    function krokTyp() {
        const ty = K.typy || [], typ = duz6() ? W.DUZY : ty[0] && ty[0][0];
        if (!typ) return '<p class="mut">Za mało danych, żeby określić typ spółki.</p>';
        const L = LYNCH[ty[0][0]] || null, tp = typPrognozy(), pr = prognozaKarty();
        const N = { ostrozny: "Ostrożny", bazowy: "Bazowy", lepszy: "Lepszy" };
        return `<div class="kr-typ"><span class="pill kr-typ-p">${esc(typ)}</span><span class="mut male">${ty.slice(duz6() ? 0 : 1, 3).map((x) => `${esc(x[0])} ${x[1]}`).join(" · ")}</span></div>
          ${cykliczna() ? `<p class="mut male" style="margin:2px 0 6px">Cykliczna: w ostatnich 10 latach przychody i zysk spadały razem ${M.cykl_spadki || cyklSpadki()} razy${fitTypu("Szybko rosnąca") >= 60 ? " — dzisiejszy szybki wzrost to faza cyklu, nie trwała cecha (Lynch: cykliczne udają szybko rosnące)" : ""}.</p>` : ""}
          <p class="mut male" style="margin:2px 0 6px">Typ (Lynch) mówi, jak oceniać spółkę; faza z kroku 1 (Damodaran) — na jakim etapie życia jest firma${cykliczna() ? " (dojrzała firma może być cykliczna)" : ""}.</p>
          ${L ? wiecejTxt("Co mówi Lynch: czego oczekiwać i kiedy sprzedać", `<p><b>Czego oczekiwać:</b> ${esc(L[0])}</p><p><b>Kiedy sprzedać:</b> ${esc(L[1])}</p>`) : ""}
          ${pr.brak ? `<p class="mut">Brak prognozy na 5 lat: ${esc(pr.brak)}.</p>` : `
          <div class="kr-scen">${Object.entries(pr.war).map(([k, w]) => `<div class="kr-scen-k kr-scen-${k}"><small>${N[k]}</small><b class="${w.cagr >= 0 ? "plus" : "minus"}">${W.fmtPct(w.cagr, 1, true)}</b><span>rocznie · ${W.fmtCena(w.ceny[5])}</span></div>`).join("")}</div>
          ${wykresPrognozy(pr)}
          ${pr.cykl ? `<p class="mut male" style="margin:2px 0 6px">Spółka cykliczna — trzy drogi cyklu: <b>ostrożny</b> = zysk wraca do średniej z 5 lat (${W.fmtCena(pr.war.ostrozny.eps)} na akcję), <b>bazowy</b> = połowa drogi (${W.fmtCena(pr.war.bazowy.eps)}), <b>lepszy</b> = zysk zostaje jak dziś (${W.fmtCena(pr.war.lepszy.eps)})${pr.szybka ? ` i rośnie jak u szybko rosnącej (${W.fmtPct(pr.war.lepszy.g, 0)} rocznie) — spółka pasuje też do tego typu` : ""}.</p>` : ""}
          ${wiecejTxt("Jak liczymy prognozę", `Zysk ${W.fmtCena(pr.eps0)} na akcję${pr.cykl ? " w wariancie ostrożnym (średnia z 5 lat), w bazowym połowa drogi do dzisiejszego, w lepszym dzisiejszy —" : tp === "Cykliczna" ? " (średnia z 5 lat — spółka cykliczna, nie liczymy od szczytu cyklu)" : M.peg_norm_uzyte ? " (znormalizowany)" : ""} rośnie przez 5 lat w tempie 80 % najniższego z: przychody 3 lata, przychody 5 lat${GPW ? "" : ", prognoza analityków"}, w zakresie realnym dla typu wg Lyncha (${W.fmtPct(pr.zakres[0], 0)}–${W.fmtPct(pr.zakres[1], 0)} rocznie); P/E za 5 lat nie wyższe niż dzisiejsze (liczone od zysku danego wariantu) ani niż mediana z 5 lat. Bez dywidendy${W.ok(M.div) && M.div > 0 ? ` (dochodzi ok. ${W.fmtPct(M.div, 1)} rocznie)` : ""}. To nie jest wycena ani rekomendacja.
            <div class="kr-wsk kr-prog"><div></div><div class="mut male">wzrost zysku</div><div class="mut male">P/E za 5 lat</div><div class="mut male">cena za 5 lat</div><div class="mut male">rocznie</div>
              ${Object.entries(pr.war).map(([k, w]) => `<div class="kr-wsk-n"><i class="kr-prog-${k}"></i>${N[k]}</div><b>${W.fmtPct(w.g, 1)}</b><b>${W.fmtNum(w.pe, 1)}×</b><b>${W.fmtCena(w.ceny[5])}</b><b>${W.fmtPct(w.cagr, 1, true)}</b>`).join("")}</div>`)}`}`;
    }
    // „Ile zarobi akcjonariusz”: rozkład rocznego zwrotu na 5 lat (W.zwrotAkcjonariusza z prognozy wg typu) — paski składników + 10 000 zł po 5 latach
    function zwrotBlok() {
        const pr = prognozaKarty(), z = W.zwrotAkcjonariusza(pr, { cena: M.price, akcje_3l: M.akcje_3l, div: M.div });
        if (!z) return pr && pr.brak ? `<p class="mut male">Ile zarobi akcjonariusz: brak prognozy — ${esc(pr.brak)}.</p>` : "";
        const N = { ostrozny: "Ostrożny", bazowy: "Bazowy", lepszy: "Lepszy" };
        const SK = [["zysk", "wzrost zysku", "var(--zielony, #16a34a)"], ["skup", "skup akcji", "#0ea5e9"], ["dyw", "dywidenda", "#a855f7"], ["pe", "zmiana P/E", "#f59e0b"]];
        const max = Math.max(0.05, ...Object.values(z.war).flatMap((w) => SK.map(([k]) => Math.abs(w[k]))));
        const pasek = (w) => SK.map(([k, n, c]) => { const v = w[k]; if (!W.ok(v) || Math.abs(v) < 0.0005) return "";
            return `<div class="zw-w"><span class="zw-n">${n}</span><span class="zw-p"><i style="width:${(50 * Math.abs(v) / max).toFixed(1)}%;${v < 0 ? "right:50%" : "left:50%"};background:${v < 0 ? "var(--czerwony, #dc2626)" : c}"></i></span><b class="${v < 0 ? "minus" : ""}">${W.fmtPct(v, 1, true)}</b></div>`; }).join("");
        return `<div class="zw"><div class="mut male" style="margin:0 0 6px">Ile może zarobić akcjonariusz — rocznie przez 5 lat (z prognozy wg typu, krok 2)</div>
          <div class="kr-scen">${Object.entries(z.war).map(([k, w]) => `<div class="kr-scen-k kr-scen-${k}"><small>${N[k]}</small><b class="${w.razem >= 0 ? "plus" : "minus"}">${W.fmtPct(w.razem, 1, true)}</b><span>rocznie</span><span class="zw-10k">10 000 → ${Math.round(w.x10k).toLocaleString("pl-PL")}</span></div>`).join("")}</div>
          <div class="zw-sklad">${Object.entries(z.war).map(([k, w]) => `<div><div class="mut male">${N[k]}</div>${pasek(w)}</div>`).join("")}</div>
          ${wiecejTxt("Skąd te liczby", `Zwrot roczny ≈ wzrost zysku spółki × zmiana P/E × skup akcji + dywidenda. <b>Wzrost zysku</b> i <b>P/E za 5 lat</b> jak w prognozie wg typu (P/E nie rośnie ponad dzisiejsze ani medianę z 5 lat). <b>Skup akcji</b> — tempo zmiany liczby akcji z 3 lat (${W.ok(M.akcje_3l) ? W.fmtPct(M.akcje_3l, 1, true) + " w 3 lata" : "brak danych"}), najwyżej ±5 % rocznie; nowe akcje (rozwadnianie) odejmują. <b>Dywidenda</b> — dzisiejsza stopa ${W.fmtPct(z.dyw, 1)}, bez podwyżek, reinwestowana. 10 000 (dowolna waluta) = wartość po 5 latach. Bez podatków i kursu walut. To nie jest rekomendacja.`)}
        </div>`;
    }
    // odwrotny DCF: jaki wzrost przychodów (przy dzisiejszej marży FCF) i jaką marżę (przy dzisiejszym wzroście) „zakłada” dzisiejsza cena
    function odwrotnyDcf() {
        if (K.sector === "Financial" || !W.ok(M.price)) return "";
        if (!W.ok(S.g)) domyslne();
        const p = parDcf(), ig = W.implikowane(p, M.price, "g", -0.3, 0.8), im = W.implikowane(p, M.price, "marza", 0.001, 1);
        if (!W.ok(ig) && !W.ok(im)) return "";
        const h = M.rev_cagr3, kl = W.ok(ig) && W.ok(h) ? (ig <= h * 0.8 ? "kr-tak" : ig > h ? "kr-nie" : "") : "";
        return `<div class="zw"><div class="mut male" style="margin:10px 0 4px">Odwrotny DCF — co musi się wydarzyć, żeby dzisiejsza cena była uczciwa</div>
          <div class="zw-odw">${W.ok(ig) ? `<div><small>Wzrost przychodów przez ${p.lata} lat</small><b class="${kl}">${W.fmtPct(ig, 1)} rocznie</b><span class="mut male">przy marży FCF ${W.fmtPct(p.marza, 1)}</span><span class="mut male">ostatnie 3 lata: ${W.ok(h) ? W.fmtPct(h, 1) + " rocznie" : "–"}</span></div>` : ""}
            ${W.ok(im) ? `<div><small>Marża FCF</small><b>${W.fmtPct(im, 1)}</b><span class="mut male">przy wzroście ${W.fmtPct(p.g, 1)} rocznie</span><span class="mut male">dziś: ${W.fmtPct(p.marza, 1)}</span></div>` : ""}</div>
          ${wiecejTxt("Co to jest odwrotny DCF", "Zwykły DCF liczy wartość z założeń (wzrost, marża). Odwrotny idzie w drugą stronę: szuka takiego wzrostu przychodów (albo marży), przy którym wartość DCF równa się dzisiejszej cenie. Jeśli cena „zakłada” wzrost szybszy niż spółka osiągała dotąd — rynek oczekuje dużo; jeśli wolniejszy — oczekiwania są skromne. Stopa dyskontowa 10 %, wzrost po okresie prognozy 3 %, jak w panelu DCF.")}
        </div>`;
    }
    // przegląd w 1 minutę: 8 kafelków (kolor = udział ✓ wśród sprawdzonych), klik otwiera krok
    function ocenaKafla(l) {
        const z = l.filter((x) => x[1] === true || x[1] === false), t = z.filter((x) => x[1] === true).length;
        return { t, n: z.length, kl: !z.length ? "" : t / z.length >= 0.7 ? "dob" : t / z.length >= 0.4 ? "sr" : "zle" };
    }
    function przeglad() {
        const SF = seriaFazy(), f = fazaTeraz(SF), pr = prognozaKarty(), zp = zaPrzeciwListy();
        const kaf = (i, tyt, glowna, pod, kl) => `<button data-kr="${i}" class="kr-kafel ${kl || ""}"><small>${i + 1}. ${tyt}</small><b>${glowna}</b><span>${pod}</span></button>`;
        const lc = (l) => { const o = ocenaKafla(l); return [o.n ? `${o.t} z ${o.n} ✓` : "brak danych", o.kl]; };
        const [wz, wzk] = lc(lWzrost()), [pw, pwk] = lc(lPrzewaga()), [bz, bzk] = lc(lBezp()), [zr, zrk] = lc(lZarzad());
        const pegKl = cykliczna() ? (cyklSzczyt() ? "zle" : "sr") : !W.ok(M.peg) || M.peg <= 0 ? "" : M.peg < 1 ? "dob" : M.peg < 2 ? "sr" : "zle";
        const zpKl = zp.za.length + zp.przeciw.length ? (zp.za.length / (zp.za.length + zp.przeciw.length) >= 0.7 ? "dob" : zp.za.length / (zp.za.length + zp.przeciw.length) >= 0.5 ? "sr" : "zle") : "";
        const baz = pr.war ? pr.war.bazowy.cagr : null;
        return `<div class="kr-przeglad">
          ${kaf(0, "Faza", f ? `${f.nr}/${W.FAZY.length}` : "–", f ? esc(f.nazwa) : "", f ? (f.nr <= 2 || f.nr === 6 ? "zle" : f.nr === 5 ? "sr" : "dob") : "")}
          ${kaf(1, "Typ", esc(duz6() ? "Duży zwycięzca" : (K.typy && K.typy[0] ? K.typy[0][0] : "–")), (W.ok(baz) ? `prognoza ${W.fmtPct(baz, 0, true)} rocznie` : "bez prognozy") + (cykliczna() && fitTypu("Szybko rosnąca") >= 60 ? " · teraz szybki wzrost" : ""), W.ok(baz) ? (baz >= 0.1 ? "dob" : baz >= 0.04 ? "sr" : "zle") : "")}
          ${kaf(2, "Wzrost", W.ok(M.rev_cagr3) ? `${W.fmtPct(M.rev_cagr3, 0, true)}` : "–", `przychody 3 lata · ${wz}`, wzk)}
          ${kaf(3, "Przewaga", W.ok(M.nm) ? W.fmtPct(M.nm, 0) : "–", `marża netto · ${pw}`, pwk)}
          ${kaf(4, "Bezpieczeństwo", W.ok(M.net_cash) ? (M.net_cash >= 0 ? "gotówka > dług" : "dług > gotówka") : "–", bz, bzk)}
          ${kaf(5, "Zarząd", W.ok(M.ins_kupujacy) && M.ins_kupujacy > 0 ? "kupuje akcje" : W.ok(M.akcje_3l) && M.akcje_3l < 0 ? "skup akcji" : "–", zr, zrk)}
          ${cykliczna() ? kaf(6, "Wycena", cyklSzczyt() ? "⚠ szczyt?" : "PEG nie dotyczy", "spółka cykliczna" + (K.etykieta ? " · " + esc(K.etykieta) : ""), pegKl)
            : kaf(6, "Wycena", W.ok(M.peg) && M.peg > 0 ? `PEG ${W.fmtNum(M.peg)}` : "–", esc(K.etykieta || ""), pegKl)}
          ${kaf(7, "Werdykt", `<span class="plus">${zp.za.length}</span> : <span class="minus">${zp.przeciw.length}</span>`, "za : przeciw", zpKl)}
        </div>`;
    }
    function wykresPrognozy(pr) {
        const c = (K.ceny && K.ceny.c) || [], d = (K.ceny && K.ceny.d) || [];
        const W_ = SZER, H = SZER < 700 ? 260 : 300, L = 10, R = SZER < 700 ? 74 : 96, T = 16, B = 26;
        const t0 = d.length ? Date.parse(d[0]) : Date.now() - 5 * 365.25 * 864e5, tN = Date.now(), tK = tN + 5 * 365.25 * 864e5;
        const X = (t) => L + (W_ - L - R) * (t - t0) / (tK - t0);
        const wsz = c.concat(...Object.values(pr.war).map((w) => w.ceny)).filter((v) => W.ok(v) && v > 0);
        const mn = Math.min(...wsz) * 0.9, mx = Math.max(...wsz) * 1.05, Y = (v) => T + (H - T - B) * (1 - (Math.log(v) - Math.log(mn)) / (Math.log(mx) - Math.log(mn)));
        const hist = c.map((v, i) => `${X(Date.parse(d[i])).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
        const pkt = (w) => w.ceny.map((v, t) => [X(tN + t * 365.25 * 864e5), Y(v)]);
        const kol = { ostrozny: "var(--czerwony)", bazowy: "var(--niebieski)", lepszy: "var(--zielony)" };
        const pas = pkt(pr.war.lepszy).concat(pkt(pr.war.ostrozny).reverse()).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        let lata = "";
        for (let r = new Date(t0).getFullYear() + 1; r <= new Date(tK).getFullYear(); r++) {
            const x = X(Date.parse(`${r}-01-01`)); if (x < L + 20 || x > W_ - R || (SZER < 700 && r % 2)) continue;
            lata += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" class="kr-siatka"/><text x="${x}" y="${H - 8}" class="kr-tx kr-tx-os" text-anchor="middle">${r}</text>`;
        }
        const etk = Object.entries(pr.war).map(([k, w]) => { const [x, y] = pkt(w)[5]; return { k, y, w, x }; }).sort((a, b) => a.y - b.y);
        for (let i = 1; i < etk.length; i++) if (etk[i].y - etk[i - 1].y < 15) etk[i].y = etk[i - 1].y + 15;
        return `<svg class="kr-mini" width="${W_}" height="${H}" viewBox="0 0 ${W_} ${H}" role="img" aria-label="Cena 5 lat wstecz i prognoza na 5 lat">
          ${lata}<line x1="${X(tN)}" x2="${X(tN)}" y1="${T}" y2="${H - B}" style="stroke:var(--tekst2);stroke-dasharray:3 3"/>
          <text x="${X(tN) + 4}" y="${T + 10}" class="kr-tx">dziś</text>
          <polygon points="${pas}" style="fill:var(--niebieski);opacity:.08"/><polyline points="${hist}" style="fill:none;stroke:var(--tekst);stroke-width:2"/>
          ${Object.entries(pr.war).map(([k, w]) => `<polyline points="${pkt(w).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" style="fill:none;stroke:${kol[k]};stroke-width:${k === "bazowy" ? 2.5 : 1.8};stroke-dasharray:${k === "bazowy" ? "0" : "5 4"}"/>`).join("")}
          ${etk.map((e) => `<text x="${e.x + 6}" y="${e.y + 4}" class="kr-tx kr-tx-b" style="fill:${kol[e.k]}">${W.fmtCena(e.w.ceny[5])}</text>`).join("")}
        </svg>`;
    }
    // werdykt: co przemawia za, a co przeciw — zebrane z kryteriów 7/7, Buffetta i list Lyncha (bez ocen własnych) oraz ostrzeżeń
    function zaPrzeciwListy() {
        const za = [], przeciw = [], byl = new Set();
        const dodaj = (co, ok, zr) => { if (ok === null || ok === undefined || byl.has(co)) return; byl.add(co); (ok ? za : przeciw).push([co, zr]); };
        (lista77() || []).forEach(([co, , ok]) => dodaj(co, ok, "7/7"));
        const bf = K.strategie && Object.entries(K.strategie).find(([n]) => n.startsWith("Buffett"));
        (bf ? bf[1] : []).forEach(([co, , ok]) => dodaj(co, ok, "Buffett"));
        const L = K.lynch || {};
        (L.zakup || []).forEach(([co, w, ok]) => { if (!/oceń sam/.test(w)) dodaj(co, ok, "Lynch"); });
        (L.lista || []).forEach(([co, , ok]) => dodaj(co, ok, "Lynch: kiedy sprzedać"));
        (L.unikaj || []).forEach(([co, w, ok]) => { if (!/oceń sam/.test(w) && ok === false) dodaj(co, false, "Lynch: czego unikać"); });
        if (M.spadek_2l) dodaj("Przychody lub zysk spadają 2 lata z rzędu (⬇)", false, "sygnał sprzedaży");
        (K.ostrzezenia || []).forEach((t) => dodaj(typeof t === "string" ? t : (t.t || t[0] || ""), false, "ostrzeżenie"));
        return { za, przeciw };
    }
    function zaPrzeciw() {
        const { za, przeciw } = zaPrzeciwListy();
        const kol = (l, kl, tyt) => `<div class="pole kr-zp ${kl}"><div class="kr-zp-t">${tyt} <span>${l.length}</span></div>${l.map(([co, zr]) => `<div class="kr-zp-w"><span>${kl === "za" ? "✓" : "✗"}</span><span>${esc(co)} <span class="kr-zr">${esc(zr)}</span></span></div>`).join("") || '<p class="mut male">—</p>'}</div>`;
        return `<div class="mut male" style="margin:14px 0 4px"><b>Co przemawia za, a co przeciw</b> — wszystkie sprawdzone reguły (7/7, Buffett, Lynch) i ostrzeżenia z danych</div>
          <div class="siatka2">${kol(za, "za", "Za")}${kol(przeciw, "przeciw", "Przeciw")}</div>`;
    }
    function ocenaWlasna() {
        const L = K.lynch || {}, moje = czytajLy();
        const l = [].concat((L.zakup || []).filter(([, w]) => /oceń sam/.test(w)).map((x) => ["zakup", x[0]]), (L.cechy || []).filter(([, w]) => /oceń sam/.test(w)).map((x) => ["cechy", x[0]]));
        if (!l.length) return "";
        const tak = l.filter(([s, co]) => moje[s + ":" + co] === true).length;
        return `<div class="mut male" style="margin:14px 0 4px"><b>Twoja ocena</b> (Lynch: tego nie policzą żadne dane) — ${tak} z ${l.length} na „tak”</div>
          <div class="jz kr-ocena">${l.map(([s, co]) => { const k = s + ":" + co, v = moje[k];
            return `<div class="ly-w"><span>${v === true ? ikona3(true) : v === false ? ikona3(false) : '<span class="mut">?</span>'}</span><span>${esc(co.replace(" (ocena własna)", ""))}</span>
              <span class="ly-wart ly-moje"><button data-ly="${esc(k)}" data-v="1" class="${v === true ? "akt" : ""}">tak</button><button data-ly="${esc(k)}" data-v="0" class="${v === false ? "akt" : ""}">nie</button></span></div>`; }).join("")}</div>`;
    }
    function krokTresc(i) {
        const SF = seriaFazy(), f = fazaTeraz(SF);
        const cagr = (x, n) => (W.ok(x) && x > -1 ? Math.pow(1 + x, 1 / n) - 1 : null);
        if (i === 0) {
            const p = f ? f.pyt : {}, sf = SF;
            const z = sf.zysk.filter(W.ok), zOst = z[z.length - 1], zRos = z.length >= 2 && zOst > z[z.length - 2];
            const zw = [];
            if (W.ok(M.div) && M.div > 0) zw.push(`dywidenda ${W.fmtPct(M.div, 1)} rocznie`);
            if (W.ok(M.skup_netto_mc) && M.skup_netto_mc > 0) zw.push(`skup netto ${W.fmtPct(M.skup_netto_mc, 1)} kapitalizacji`);
            const mob = SZER < 700, szG = mob ? SZER - 60 : (SZER - 90) / 2, szP = mob ? SZER - 80 : (SZER - 140) / 3;
            const pod = (n, w, kolor, fmt, odZera = true) => `<div class="kr-pod"><div class="mut male">${n}</div>${mini(sf.et, w, kolor, fmt, 110, szP, odZera)}</div>`;
            return `<div class="kr-pyt">
              <div class="pole"><div class="kr-q"><span class="kr-nr">1</span><b>Czy przychody rosną?</b></div>
                <div class="kr-odp">${tn(p.przychody)} ${W.ok(M.rev_cagr3) ? `${W.fmtPct(M.rev_cagr3, 0, true)} rocznie przez 3 lata, ${W.fmtPct(M.rev_1y, 0, true)} w ostatnim roku` : ""}</div>
                ${mini(sf.et, sf.rev, "var(--niebieski)", kw, 150, szG)}</div>
              <div class="pole"><div class="kr-q"><span class="kr-nr">2</span><b>Czy zarabia?</b></div>
                <div class="kr-odp">${tn(p.zysk)} ${W.ok(zOst) ? `${kw(zOst)} ${WAL} ${sf.zyskNazwa}${z.length >= 2 ? (zRos ? ", rośnie" : ", spada") : ""}` : ""}</div>
                ${mini(sf.et, sf.zysk, "var(--zielony)", kw, 150, szG)}</div></div>
              <div class="pole kr-zwrot"><div class="kr-q"><span class="kr-nr">3</span><b>Czy oddaje gotówkę akcjonariuszom?</b></div>
                <div class="kr-odp">${tn(f ? p.zwrot : null)} ${esc(zw.join(", "))}</div>
                <div class="kr-pody">${pod("Skup akcji (rocznie)", sf.skup, "var(--fiolet)", kw)}${pod("Liczba akcji (mniej = skup)", sf.akcje, "var(--fiolet)", szt, false)}${pod("Dywidendy wypłacone (rocznie)", sf.dyw, "var(--fiolet)", kw)}</div></div>
              ${f ? `<div class="kr-faza"><div class="kr-faza-t">${esc(K.t)} jest w fazie <b>${f.nr}: ${esc(f.nazwa)}</b></div>
                ${etapy(f.nr)}<p class="male" style="margin:10px 0 6px">${esc(CYKL[f.nr])}</p>${wykresFaz(sf)}</div>`
                : '<p class="mut">Za mało danych, żeby określić fazę spółki.</p>'}`;
        }
        if (i === 1) return krokTyp();
        if (i === 5) return krokZarzad();
        if (i === 2) {
            const w = (n, a, b, c) => `<div class="pole"><div class="mut male">${n}</div><div class="kr-cagr"><div><small>1 rok</small><b>${W.fmtPct(a, 1, true)}</b></div><div><small>3 lata (rocznie)</small><b>${W.fmtPct(b, 1, true)}</b></div><div><small>5 lat (rocznie)</small><b>${W.fmtPct(c, 1, true)}</b></div></div></div>`;
            return `${pytWzrost()}<div class="siatka2">${w("Przychody", M.rev_1y, M.rev_cagr3, M.rev_cagr5)}${w("Zysk netto", M.ni_1y, cagr(M.ni_3y, 3), cagr(M.ni_5y, 5))}</div>
              <div class="mut male" style="margin-top:12px">Przychody i zysk netto rok po roku (z raportów)</div>
              ${(() => { const sf = seriaFazy(), y = ((K.hist && K.hist.y) || []).slice(SZER < 700 ? -5 : -8), zL = sf.et[sf.et.length - 1] === "12 m";
                const ni = y.map((r) => r[2]).concat(zL ? [W.ok(M.ni_ttm) ? M.ni_ttm : null] : []);
                return liniaRr(sf.et, [{ nazwa: "przychody", kolor: "var(--niebieski)", w: sf.rev }, { nazwa: "zysk netto", kolor: "var(--zielony)", w: ni }]); })()}`;
        }
        if (i === 3) {
            const j = listaJak(), dod = j ? j.filter(([co]) => /ROA|ROCE|3 lata temu/.test(co)) : [];
            return `${pytPrzewaga()}
              ${dod.length ? `<div class="mut male" style="margin:10px 0 4px">Dodatkowo z listy „Jakość (7 kryteriów)” (nie liczone do 7/7):</div><div class="jz">${dod.map(([co, v, ok]) => `<div class="ly-w"><span>${ok ? '<b class="kr-tak">✓</b>' : '<b class="kr-nie">✗</b>'}</span><span>${esc(co)}</span><span class="ly-wart">${esc(fmtKryt(co, v))}</span></div>`).join("")}</div>` : ""}
              <div class="mut male" style="margin:14px 0 6px">Przewaga w liczbach — na tle mediany ${ZB}: wysoka marża brutto = klienci płacą więcej niż u konkurencji (marka, technologia), wysoki ROIC = każdy zainwestowany dolar dużo zarabia</div>
              ${naTle("Marża brutto", M.gm, (K.med500 || {}).gm, (v) => W.fmtPct(v, 1))}${naTle("Marża operacyjna", M.om, (K.med500 || {}).om, (v) => W.fmtPct(v, 1))}
              ${naTle("Marża netto", M.nm, (K.med500 || {}).nm, (v) => W.fmtPct(v, 1))}${naTle("ROIC", M.roic, (K.med500 || {}).roic, (v) => W.fmtPct(v, 1))}`;
        }
        if (i === 4) {
            const s = K.oceny && K.oceny.sila;
            return `${pytBezp()}
              <div class="kr-cagr" style="margin-top:10px"><div><small>Gotówka − dług</small><b class="${M.net_cash >= 0 ? "plus" : "minus"}">${W.ok(M.net_cash) ? W.fmtUsd(M.net_cash) + " " + WAL : "–"}</b></div>
                <div><small>Siła finansowa (0–10)</small><b>${oc(s)}</b></div><div><small>Spadek 2 lata z rzędu (⬇)</small><b class="${M.spadek_2l ? "minus" : ""}">${M.spadek_2l ? "tak" : "nie"}</b></div></div>
`;
        }
        if (i === 6) {
            const peg = M.peg, pr = M.price, B = [0.5, 1, 2, 3], N = ["Bardzo tania", "Niedowartościowana", "Uczciwie", "Droga", "Bardzo droga"];
            let poz = null;
            if (W.ok(peg) && peg > 0) { // pięć równych stref: 0–0,5 / 0,5–1 / 1–2 / 2–3 / 3–4+
                const g = [0, ...B, 4], k = Math.min(4, g.filter((b) => b <= peg).length - 1);
                poz = Math.max(2, Math.min(98, 20 * k + 20 * Math.min(1, (peg - g[k]) / (g[k + 1] - g[k]))));
            }
            const h = peHistoria(), poPe = h ? (h.teraz <= h.t1 ? ["tanio", "kr-tak"] : h.teraz >= h.t2 ? ["drogo", "kr-nie"] : ["normalnie", ""]) : null;
            const wsk = [["P/S (cena / sprzedaż)", M.ps, null], ["P/E (cena / zysk)", M.pe, M.fpe], ["P/FCF (cena / wolne przepływy)", M.pfcf, null]];
            const cyOstr = cykliczna() ? `<div class="ostrzezenie">⚠ <b>Spółka cykliczna — PEG nie dotyczy.</b> Lynch: u cyklicznych niskie P/E przy rekordowych zyskach to często szczyt cyklu, a nie okazja; lepszy moment bywa przy niskich zyskach i wysokim P/E.${cyklSzczyt() ? ` <b>Teraz:</b> zysk ${W.fmtPct(M.ni_1y, 0, true)} r/r, P/E ${W.fmtNum(M.pe, 1)}×${W.ok(M.pe_med5) ? ` (mediana 5 lat ${W.fmtNum(M.pe_med5, 1)}×)` : ""}.` : ""} Ocena wyceny liczona bez PEG, etykieta z DCF.</div>` : "";
            return `${cyOstr}${zwrotBlok()}${odwrotnyDcf()}${pytania(kr77("Wycena"))}
              <div class="mut male" style="margin:12px 0 4px">Wskaźniki: ostatnie 12 mies. i prognoza na przyszły rok${GPW ? " (GPW: brak prognoz)" : ""}</div>
              <div class="kr-wsk"><div></div><div class="mut male">12 mies.</div><div class="mut male">prognoza</div>
                ${wsk.map(([n, a, b]) => `<div class="kr-wsk-n">${esc(n)}</div><b>${W.ok(a) && a > 0 ? W.fmtNum(a, 1) + "×" : "–"}</b><b>${W.ok(b) && b > 0 ? W.fmtNum(b, 1) + "×" : "–"}</b>`).join("")}</div>
              ${h ? `<div class="mut male" style="margin:14px 0 4px">Gdzie jest P/E dziś na tle własnych 5 lat? Dziś <b>${W.fmtNum(h.teraz, 1)}×</b> — <b class="${poPe[1]}">${poPe[0]}</b> (mediana 5 lat ${W.fmtNum(h.med, 1)}×)</div>${wykresPe(h)}` : ""}
              <div class="mut male" style="margin:14px 0 0">PEG — cena względem tempa wzrostu zysku</div>
              ${(() => { const g = GPW ? M.ni_cagr3 : M.eps_next5; if (!(W.ok(peg) && peg > 0 && W.ok(g) && g > W.LIMIT_LYNCH)) return "";
                const p25 = W.peg25(peg * 100 * g, g);
                return `<p class="male" style="margin:4px 0 0">Prognoza wzrostu ${W.fmtPct(g, 0)} rocznie — według Lyncha liczymy najwyżej 25 %: <b>PEG Lyncha ${W.fmtNum(p25)}</b> (${esc(W.etykietaPeg(p25) || "")}).</p>`; })()}
              ${poz !== null ? `<div class="kr-wyc"><div class="kr-wyc-teraz" style="left:${poz}%;transform:translateX(${poz < 15 ? "-8%" : poz > 85 ? "-92%" : "-50%"})">Dziś ${W.fmtCena(pr)}<br>▼</div>
                <div class="kr-pasek">${N.map((n, j) => `<span class="z${j}">${n}</span>`).join("")}</div>
                <div class="kr-ceny mut">${B.map((b, j) => `<span style="left:${20 * (j + 1)}%">${W.fmtCena(pr * b / peg)}</span>`).join("")}</div></div>
                <p class="mut male">Cena, przy której PEG wyniósłby 0,5 / 1 / 2 / 3 (przy dzisiejszym zysku i prognozie wzrostu). PEG ${W.fmtNum(peg)} — <a href="#wycena">szczegóły i zmiana założeń ↓</a></p>`
                : '<p class="mut">Brak PEG (zysk ≤ 0 albo brak prognozy wzrostu) — zob. <a href="#wycena">DCF ↓</a>.</p>'}`;
        }
        const wiersze = ["Wzrost", "Rentowność", "Bezpieczeństwo", "Wycena"].map((n) => { const [a, b] = zalicz(KR_IDX[n]); return [n, a, b]; });
        const suma = wiersze.reduce((s, x) => s + x[1], 0), wsz = wiersze.reduce((s, x) => s + x[2], 0);
        const ow = (K.ostrzezenia || []).length, brak = wiersze.flatMap(([n]) => { const l = lista77(); return l ? KR_IDX[n].map((j) => l[j]).filter((k) => k && !k[2]).map((k) => k[0]) : []; });
        const o = K.oceny || {}, h = peHistoria(), poPe = h ? (h.teraz <= h.t1 ? "tanio" : h.teraz >= h.t2 ? "drogo" : "normalnie") : null;
        const ow5 = (n, x, opis) => `<div class="kr-sum-w"><span>${n}</span>${kropki5(x)}<b>${W.ok(x) ? W.fmtNum(x, 1) : "–"}</b>${opis ? `<span class="mut male kr-sum-o">${esc(opis)}</span>` : ""}</div>`;
        return `<div class="siatka2">
          <div class="pole kr-werd"><div class="mut male kr-werd-t">SPÓŁKA</div>
            <div class="kr-sum-w"><span>Faza rozwoju</span><span></span><b>${f ? `${f.nr} z ${W.FAZY.length}` : "–"}</b><span class="mut male kr-sum-o">${f ? esc(f.nazwa) : ""}</span></div>
            ${ow5("Wzrost", o.wzrost, "ocena 0–10 na tle " + ZB)}${ow5("Siła finansowa", o.sila, "")}${ow5("Wycena", o.wycena, "wysoko = tanio")}${ow5("Ocena ogólna", o.ogolna, "")}
            <div class="kr-sum-w kr-razem"><span>Kryteria 7/7</span>${wsz ? kropki(suma, wsz) : "<span></span>"}<b>${wsz ? `${suma} z ${wsz}` : "–"}</b></div></div>
          <div class="pole kr-werd"><div class="mut male kr-werd-t">WYCENA</div>
            <div class="kr-sum-w"><span>PEG</span><span>${K.etykieta ? `<span class="pill p-${slug(K.etykieta)}">${esc(K.etykieta)}</span>` : ""}</span><b>${W.ok(M.peg) && M.peg > 0 ? W.fmtNum(M.peg) : "–"}</b></div>
            <div class="kr-sum-w"><span>P/E na tle 5 lat</span><span class="mut male">${h ? `mediana ${W.fmtNum(h.med, 1)}×` : ""}</span><b>${h ? `${W.fmtNum(h.teraz, 1)}× · ${poPe}` : "–"}</b></div>
            ${h ? `<div class="kr-zakres"><div class="kr-zakres-p"><span class="t">tanio</span><span class="n">normalnie</span><span class="d">drogo</span>
              <i style="left:${Math.max(2, Math.min(98, h.teraz <= h.t1 ? 33.3 * (h.teraz - Math.min(...h.pe)) / (h.t1 - Math.min(...h.pe) || 1) : h.teraz >= h.t2 ? 66.7 + 33.3 * Math.min(1, (h.teraz - h.t2) / ((Math.max(...h.pe) - h.t2) || 1)) : 33.3 + 33.3 * (h.teraz - h.t1) / (h.t2 - h.t1)))}%"></i></div>
              <div class="kr-zakres-c mut"><span style="left:33.3%">${W.fmtCena(h.t1 * h.eps)}</span><span style="left:66.7%">${W.fmtCena(h.t2 * h.eps)}</span></div>
              <div class="male">Dziś ${W.fmtCena(M.price)}</div></div>` : ""}
          </div></div>
          ${brak.length ? `<p class="male">Nie spełnia: ${esc(brak.join("; "))}.</p>` : wsz ? '<p class="male"><b>Spełnia wszystkie kryteria 7/7.</b></p>' : ""}
          ${M.spadek_2l || ow ? `<p class="male" style="color:var(--czerwony-t)">${M.spadek_2l ? "⬇ Przychody lub zysk spadają 2 lata z rzędu. " : ""}${ow ? `❗ Ostrzeżenia: ${ow} (zob. „Kluczowe liczby”).` : ""}</p>` : ""}
          ${zaPrzeciw()}
          ${ocenaWlasna()}
          <p class="mut male">Zestawienie faktów z danych i reguł z książek — decyzję podejmujesz sam. Swoją „dwuminutową historię” spółki zapisz w <a href="portfel.html">portfelu</a>.</p>
          <div id="wycena" class="kr-wycena"></div>`;
    }
    document.addEventListener("click", (e) => {
        const a = e.target.closest && e.target.closest('a[href="#wycena"]');
        if (!a || !K) return;
        e.preventDefault(); krok(KROKI.length - 1);
        przewinDo($("wycena"));
    });
    // „Więcej”: pełny scoring i szczegóły pod oceną krok po kroku (domyślnie zwinięte; stan w localStorage)
    const SZ_KLUCZ = "fundamenta_szczegoly";
    let szczRys = false;
    function szczegoly(otworz, przewin) {
        const tr = $("szczegoly-tresc"), b = $("wiecej");
        tr.hidden = !otworz;
        b.setAttribute("aria-expanded", String(otworz));
        b.textContent = otworz ? "Zwiń szczegóły ▴" : "Więcej: pełny scoring i szczegóły ▾";
        try { localStorage.setItem(SZ_KLUCZ, otworz ? "1" : "0"); } catch (e) { /* tryb prywatny */ }
        if (otworz && !szczRys) { szczRys = true; liczby(); metryki(); strategie(); zyskZd(); lynch(); wykresCeny("1r"); sprawozdania(GPW ? "y" : "q"); }
        if (otworz && przewin) przewinDo($("szczegoly"));
    }
    function przyciskWiecej() {
        $("wiecej").addEventListener("click", () => szczegoly($("szczegoly-tresc").hidden, true));
        let st = null;
        try { st = localStorage.getItem(SZ_KLUCZ); } catch (e) { /* tryb prywatny */ }
        if (st === "1") szczegoly(true, false);
    }
    function przewinDo(el) {
        // przewiń do początku elementu z uwzględnieniem przyklejonego nagłówka strony
        const g = document.querySelector(".gora"), h = g ? g.getBoundingClientRect().height : 0;
        window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - h - 8), behavior: "smooth" });
    }
    document.addEventListener("click", (e) => {
        const a = e.target.closest && e.target.closest('a[href="#szczegoly"]');
        if (!a) return;
        e.preventDefault(); szczegoly(true, true);
    });
    let krokRozmiar = null;
    window.addEventListener("resize", () => { window.clearTimeout(krokRozmiar); krokRozmiar = window.setTimeout(() => { if (K) krok(); }, 200); });
    function krok(i) {
        if (i !== undefined) S.krok = i;
        const k = S.krok || 0, el = $("krok");
        SZER = el.clientWidth - 32 || 1000;
        el.innerHTML = `<h2>Ocena krok po kroku</h2><div class="pod">Przegląd w minutę: kolor kafelka = ile reguł (7/7, Buffett, Lynch) spółka spełnia — kliknij kafelek, żeby zobaczyć szczegóły. Pozostałe dane i oceny — w <a href="#szczegoly">Szczegółach ↓</a>.</div>
          ${przeglad()}
          <div class="kr-kroki">${KROKI.map((n, j) => `<button data-kr="${j}" class="${j === k ? "akt" : ""}"><span>${j + 1}</span>${n}</button>`).join("")}</div>
          <div class="kr-tresc"><h3>${k + 1}. ${KROKI[k]}</h3>${krokTresc(k)}</div>
          <div class="kr-nawig">${k > 0 ? `<button data-kr="${k - 1}">← ${KROKI[k - 1]}</button>` : "<span></span>"}${k < KROKI.length - 1 ? `<button data-kr="${k + 1}" class="dalej">${KROKI[k + 1]} →</button>` : ""}</div>`;
        el.querySelectorAll("button[data-kr]").forEach((b) => b.addEventListener("click", () => { krok(+b.dataset.kr); przewinDo(el); }));
        if (k === KROKI.length - 1) { wycena(); podlaczOcenyLynch(el); }  // panel PEG / DCF (edytowalny) i ocena własna na końcu
    }

    function sprawozdania(tryb) {
        const el = $("sprawozdania");
        el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><h2>Sprawozdania finansowe</h2><div class="pod">${GPW ? "Rocznie z biznesradar.pl (od 2007 r.), kwartały z Yahoo Finance." : "Z raportów SEC (pierwsza publikacja, bez późniejszych korekt)."}</div></div>
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
        K = k; M = k.m;
        // jak ocena.typy_cykl: spółka cykliczna (≥ 2 lata spadku przychodów i zysku w 10 latach) ma typ „Cykliczna” na pierwszym miejscu, nawet gdy teraz szybko rośnie
        if (cykliczna() && K.typy && K.typy[0] && K.typy[0][0] !== "Cykliczna") K.typy = [...K.typy.filter((x) => x[0] === "Cykliczna"), ...K.typy.filter((x) => x[0] !== "Cykliczna")];
        document.title = `${k.n} (${k.t}) · Fundamenta`;
        ORIG = { pct: { ...k.pct }, oceny: { ...k.oceny }, m: { ...k.m } };
        WL = (czytajWl()[k.t] || {}).w || {};
        if (Object.keys(WL).length) zastosuj();
        if (!GPW) fetch("data/sektory.json").then((r) => r.json()).then((d) => { ROZ = d; if (Object.keys(WL).length) { zastosuj(); odswiez(); } }).catch(() => {});
        domyslne(); top(); krok(0); liczby(); metryki(); strategie(); zyskZd(); lynch(); przyciskWiecej();
    }).catch((e) => { const el = $("err"); el.hidden = false; el.textContent = `Nie ma danych spółki ${t} (${e.message}). ${GPW ? "Lista GPW obejmuje WIG20, mWIG40 i sWIG80 (bez wykluczonych sektorów)." : "Lista obejmuje 500 największych spółek USA."}`; });
})();
