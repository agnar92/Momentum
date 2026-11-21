// Karta spółki: podsumowanie, typ spółki, oceny, wskaźniki na tle 500 spółek (mediana 500 spółek jako odniesienie), strategie, wycena PEG i DCF (edytowalna), sprawozdania.
"use strict";
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const slug = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/\s+/g, "-");
    const t = (new URLSearchParams(location.search).get("t") || "NVDA").toUpperCase();
    let K = null, M = null;
    const oc = (x) => `<span class="ocena ${W.klasaOceny(x)}">${W.ok(x) ? W.fmtNum(x, 1) : "–"}</span>`;
    const usdOs = (v) => W.fmtUsd(v, 0);

    const jak77 = () => { const s = K.strategie && K.strategie[W.JAKOSC]; return !!(s && s.length && s.every((x) => x[2])); };
    function top() {
        const m = M;
        const fakty = [];
        if (W.ok(m.rev_1y)) fakty.push(`przychody ${W.fmtPct(m.rev_1y, 0, true)} r/r`);
        if (W.ok(m.nm)) fakty.push(`marża netto ${W.fmtPct(m.nm, 0)}`);
        if (W.ok(m.roe)) fakty.push(`ROE ${W.fmtPct(m.roe, 0)}`);
        if (W.ok(m.net_cash) && K.sector !== "Financial") fakty.push(m.net_cash >= 0 ? `więcej gotówki niż długu (${W.fmtUsd(m.net_cash)} USD)` : `dług netto ${W.fmtUsd(-m.net_cash)} USD`);
        const typ = K.typy && K.typy[0];
        const wyc = K.etykieta ? `<div class="male" style="margin-top:6px">Wycena: <span class="pill p-${slug(K.etykieta)}">${esc(K.etykieta)}</span>${W.ok(m.peg) && m.peg > 0 ? ` PEG ${W.fmtNum(m.peg)}` : ""} · <a href="#wycena">szczegóły PEG / DCF ↓</a></div>` : "";
        $("top").innerHTML = `
          <div class="naglowek"><h1>${esc(K.n)} <span class="tick">${esc(K.t)}</span>${jak77() ? ' <span class="jakosc duzy" title="Spełnia wszystkie 7 kryteriów jakości — szczegóły w sekcji Strategie">✔ Jakość 7/7</span>' : ""}</h1>
            <div class="mut">${esc(K.sector || "")} · ${esc(K.industry || "")} · ${esc(K.country || "")}${K.www ? ` · <a href="${esc(K.www)}" target="_blank" rel="noopener">strona firmy</a>` : ""}</div></div>
          <div class="siatka2">
            <div class="pole"><div class="mut male">W skrócie</div><p style="font-size:15px;margin:6px 0">${esc(fakty.join(", ") || "Brak danych z raportów.")}.</p>
              <div class="mut male">Miejsce #${K.rank} wg kapitalizacji · dane z ${esc(K.generated_at)}</div>${wyc}</div>
            <div class="pole"><div class="mut male">Typ spółki</div>
              ${typ ? `<div style="display:flex;justify-content:space-between;margin-top:6px"><b style="font-size:17px">${esc(typ[0])}</b><span class="mut male">dopasowanie ${typ[1]} %</span></div>
              <div class="dopas"><i style="width:${typ[1]}%"></i></div><div class="mut male">${esc(typ[2])}</div>
              <details style="margin-top:8px"><summary class="mut male">Wszystkie typy</summary>${K.typy.map((x) => `<div class="male" style="display:flex;justify-content:space-between"><span>${esc(x[0])}</span><span>${x[1]} %</span></div>`).join("")}</details>` : '<p class="mut">–</p>'}
            </div>
          </div>`;
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
        const brak = W.POLA_WLASNE.filter(([p]) => !W.ok(ORIG.pct[p]) || p in WL);
        if (!brak.length) return "";
        const S = K.med500 || {};
        const wart = (p, j) => { const v = WL[p]; return W.ok(v) ? String(Math.round((j === "%" ? 100 * v : v) * 100) / 100).replace(".", ",") : ""; };
        const med = (p, j) => W.ok(S[p]) ? `mediana 500 spółek ${j === "%" ? W.fmtPct(S[p], 1) : W.fmtNum(S[p])}` : "";
        const n = Object.keys(WL).length;
        return `<details class="wlasne"${n ? " open" : ""}><summary>✎ ${n ? `Ocena uwzględnia Twoje dane (${n})` : "Uzupełnij brakujące dane samodzielnie"}</summary>
          <div class="mut male" style="margin:6px 0">Wpisz wartości, których brakuje (np. z raportu spółki). Ocena przeliczy się na tle wszystkich 500 spółek; dane zostają tylko w tej przeglądarce i widać je też na liście (✎).</div>
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
        const ow = (K.ostrzezenia || []).length ? `<div class="ostrzezenie">❗ <b>Realność prognozy wzrostu:</b><ul style="margin:4px 0 0 18px;padding:0">${K.ostrzezenia.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
        $("liczby").innerHTML = ostrz + sp + ow + wlasne() + `
          <div class="wynik-glowny"><div><div style="font-size:12px;opacity:.7">OCENA OGÓLNA</div><div style="font-size:13px">na tle 500 największych spółek</div></div>${oc(o.ogolna)}</div>
          ${[["Wzrost", o.wzrost, "wzrost"], ["Siła finansowa", o.sila, "sila"], ["Wycena (im wyżej, tym taniej)", o.wycena, "wycena"]].map(([n, v, k]) => `<div class="wiersz-oceny"><span>${n}${miejsceTxt(k)}</span>${oc(v)}</div>`).join("")}
          <div class="mut male" style="margin:6px 0">${miejsceTxt("ogolna").replace(" · ", "Ocena ogólna: ")} · <a href="porownaj.html?t=${encodeURIComponent(K.t)}">porównaj z innymi spółkami →</a></div>
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
            WY.linia($("cena-svg"), K.ceny.d.slice(-n), K.ceny.c.slice(-n), (v) => "$" + W.fmtNum(v, 0));
        } else $("cena-svg").innerHTML = '<p class="mut">Brak notowań.</p>';
        el.querySelectorAll("button[data-o]").forEach((b) => b.addEventListener("click", () => wykresCeny(b.dataset.o)));
    }

    function metryki() {
        const m = M, p = K.pct || {};
        const S = K.med500 || {};
        // n: nazwa, v: wartość (tekst), pole: percentyl (ocena), med: [pole mediany, formatowanie, dopisek]
        const w = (n, v, pole, med) => {
            const d = pole ? W.opisPercentyla(p[pole]) : null;
            const mtxt = med && W.ok(S[med[0]]) ? `<span class="mut male">mediana 500 spółek: ${med[1](S[med[0]])}${med[2] ? " " + med[2] : ""}</span>` : "";
            const moje = pole && pole in WL ? ' <span class="moje" title="Twoje dane">✎</span>' : "";
            return `<div class="wiersz"><span>${n}: <b>${v}</b>${moje}<br>${mtxt}</span>${d ? `<span class="${d.k}">${d.t}</span>` : ""}</div>`;
        };
        const zl = W.ok(m.hist_lat) ? ` (z ${W.fmtNum(m.hist_lat, 1)} lat — młoda spółka)` : "";
        const pr = (x) => W.fmtPct(x, 1), pz = (x) => W.fmtPct(x, 1, true), nm2 = (x) => W.fmtNum(x), cal = (x) => W.fmtNum(x, 0);
        const sklad = (g) => {
            const s = W.skladOceny(p, g);
            return `<details class="sklad"><summary>Jak powstała ocena ${W.fmtNum(K.oceny[g], 1)} (${s.liczone} wskaźników)</summary>
              ${s.el.map((x) => `<div class="pkt ${x.pkt === null ? "nie-liczy" : ""}"><span>${esc(x.nazwa)}</span><span class="pas"><i style="width:${x.pkt || 0}%"></i></span><b title="${x.pkt === null ? "brak danych — liczone jako 50 pkt (środek stawki)" : ""}">${x.pkt === null ? "50*" : x.pkt}</b></div>`).join("")}
              <div class="mut" style="margin-top:6px">Punkty = percentyl wśród 500 spółek (100 = najlepsza). Ocena = średnia punktów ÷ 10; 50* = brak danych, liczone neutralnie jako środek stawki (żeby brak danych nie zawyżał ani nie zaniżał oceny).</div></details>`;
        };
        $("metryki").innerHTML = `<h2>Wskaźniki spółki</h2><div class="pod">Porównanie ze wszystkimi 500 spółkami (top x % = lepiej niż 100 − x % spółek; przy wycenie „wyżej” = taniej). Pod wartością: mediana wszystkich 500 spółek jako punkt odniesienia.</div>
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
              ${w("Wolne przepływy (FCF, 12 mies.)", W.fmtUsd(m.fcf_ttm) + " USD · marża " + pr(m.fcf_margin), "fcf_margin", ["fcf_margin", pr, "(marża FCF)"])}${w("Dług / kapitał", W.fmtNum(m.de), "de", ["de", nm2])}
              ${w("Gotówka − dług", W.fmtUsd(m.net_cash) + " USD · " + pr(m.net_cash_mc) + " kapit.", "net_cash_mc", ["net_cash_mc", pr, "kapitalizacji"])}${w("Quick ratio", W.fmtNum(m.qr), "qr", ["qr", nm2])}${w("Liczba akcji, zmiana 3 lata", W.ok(m.akcje_3l) ? pz(m.akcje_3l) + (m.akcje_3l < -0.005 ? " (skup akcji)" : m.akcje_3l > 0.005 ? " (nowe akcje)" : "") : "–", "akcje_3l", ["akcje_3l", pz])}
              ${w("Capex / przychody (inwestycje w majątek)", pr(m.capex_przych), "capex_przych", ["capex_przych", pr])}${w("Wzrost kapitału własnego 3 lata (rocznie)", pz(m.kapital_3l), "kapital_3l", ["kapital_3l", pz])}
              ${w("Zysk dodatni (lata z 5)", W.ok(m.zysk_dodatni_lata) ? m.zysk_dodatni_lata + " z 5" : "–")}${w("Zmienność zysku 5 lat (mniej = stabilniej)", W.ok(m.zmiennosc_zysku) ? W.fmtNum(m.zmiennosc_zysku) : "–")}
              <div class="wiersz"><span>Ocena siły</span>${oc(K.oceny.sila)}</div>${sklad("sila")}</div>
            <div class="kol k-wycena"><div class="naglowek-kol">🏷️ Wycena</div>
              ${w("P/E", W.fmtNum(m.pe), "pe", ["pe", nm2])}${w("Forward P/E", W.fmtNum(m.fpe), null, ["fpe", nm2])}${w("P/S", W.fmtNum(m.ps), "ps", ["ps", nm2])}${w("P/B", W.fmtNum(m.pb), null, ["pb", nm2])}
              ${w("PEG (P/E ÷ prognoza EPS 5 lat)", W.ok(m.peg) ? W.fmtNum(m.peg) : "–", "peg", ["peg", nm2])}${w("P/FCF", W.fmtNum(m.pfcf), "pfcf", ["pfcf", nm2])}
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
            if (/Lata|≥ 3 z 5/.test(n)) return String(v);
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
        S.eps = M.eps; S.geps = W.ok(M.eps_next5) ? M.eps_next5 : (W.ok(M.rev_cagr5) ? M.rev_cagr5 : 0.1);
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
          <div class="wej">
            <label>Cena<input type="number" value="${W.ok(M.price) ? M.price.toFixed(2) : ""}" disabled><span class="mut">rynek</span></label>
            <label>EPS (12 mies.)<input id="w-eps" type="number" step="0.01" value="${W.ok(S.eps) ? S.eps.toFixed(2) : ""}"><span class="mut">z P/E Finviz: ${W.fmtNum(M.eps)}</span></label>
            <label>Oczekiwany wzrost EPS rocznie (%)<input id="w-geps" type="number" step="0.5" value="${(100 * S.geps).toFixed(1)}">
              <div class="chipy"><button data-g="${M.eps_next5}">prognoza 5 lat ${W.fmtPct(M.eps_next5, 0)}</button><button data-g="${M.rev_cagr5}">przychody 5 lat ${W.fmtPct(M.rev_cagr5, 0)}</button><button data-g="${M.eps_ny}">EPS przyszły rok ${W.fmtPct(M.eps_ny, 0)}</button></div></label>
            <label>P/E (wyliczone)<input type="number" value="${W.ok(pe) ? pe.toFixed(2) : ""}" disabled><span class="mut">cena ÷ EPS</span></label>
          </div>
          <div class="karta ciemna" style="margin:0">
            <div style="display:flex;gap:14px;align-items:center"><div><div class="mut male">PEG</div><div class="peg-duzy">${W.ok(base) ? W.fmtNum(base) : "–"}</div></div>
              <span class="pill p-${slug(W.etykietaPeg(base) || "")}">${esc(W.etykietaPeg(base) || "–")}</span></div>
            ${(() => { const typ = K.typy && K.typy[0] && K.typy[0][0], c = typ && W.CENA_TYPU[typ]; if (!c) return "";
                const ok = c[0] !== null && W.ok(base) && base > 0 ? (base <= c[0] ? ' <b style="color:#5eead4">— spełnia</b>' : ' <b style="color:#fca5a5">— nie spełnia</b>') : "";
                return `<div class="male" style="margin-top:6px">Typ: <b>${esc(typ)}</b> — ${esc(c[1])}${ok}</div>`; })()}
            ${W.ok(base) && base > 0 ? `<div class="male" style="margin-top:6px">Cena dziś ${W.fmtCena(M.price)} · przy PEG 1: <b>${W.fmtCena(M.price / base)}</b> · przy PEG 2: <b>${W.fmtCena(2 * M.price / base)}</b></div>` : ""}
            ${sc ? `<div class="scen">${["bear", "base", "bull"].map((k) => `<div class="${k}"><div class="t">${{ bear: "Pesymistycznie", base: "Bazowo", bull: "Optymistycznie" }[k]}</div><b style="font-size:20px">${W.fmtPct(sc[k].g, 1)}</b><div class="mut male">wzrost EPS</div><div>PEG ${W.fmtNum(sc[k].peg)}</div></div>`).join("")}</div>` : ""}
            ${poz !== null ? `<div class="peg-skala"><span class="znak" style="left:${poz}%"></span></div><div class="skala mut"><span>0</span><span>1 · nisko</span><span>2 · uczciwie</span><span>3 · drogo</span><span>4+</span></div>` : ""}
            <p class="mut male">PEG = P/E ÷ (oczekiwany wzrost EPS w %). Poniżej 1 — tanio względem wzrostu, 1–2 — uczciwie, powyżej 3 — drogo.</p>
          </div></div>`;
        $("w-eps").addEventListener("change", (e) => { S.eps = +e.target.value; peg(); });
        $("w-geps").addEventListener("change", (e) => { S.geps = e.target.value / 100; peg(); });
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
        document.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => ust("g", Math.max(-0.2, Math.min(0.6, +b.dataset.g)))));
        document.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => ust("marza", +b.dataset.m)));
        document.querySelectorAll("[data-lata]").forEach((b) => b.addEventListener("click", () => ust("lata", +b.dataset.lata)));
        $("d-reset").addEventListener("click", () => { domyslne(); dcfWidok(); });
    }

    // --- sprawozdania -------------------------------------------------------------------------------------------------
    function sprawozdania(tryb) {
        const el = $("sprawozdania");
        el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><h2>Sprawozdania finansowe</h2><div class="pod">Z raportów SEC (pierwsza publikacja, bez późniejszych korekt).</div></div>
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
        fetch("data/lista.json").then((r) => r.json()).then((d) => {
            LISTA = d.rows;
            $("tickery").innerHTML = d.rows.map((r) => `<option value="${esc(r.t)}">${esc(r.n)}</option>`).join("");
            if (K) liczby();
        }).catch(() => {});
        $("q").addEventListener("change", (e) => { const v = e.target.value.trim().toUpperCase(); if (v) location.href = "spolka.html?t=" + encodeURIComponent(v); });
    }

    szukaj();
    fetch(`data/spolki/${encodeURIComponent(t)}.json`, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then((k) => {
        K = k; M = k.m; document.title = `${k.n} (${k.t}) · Fundamenta`;
        ORIG = { pct: { ...k.pct }, oceny: { ...k.oceny }, m: { ...k.m } };
        WL = (czytajWl()[k.t] || {}).w || {};
        if (Object.keys(WL).length) zastosuj();
        fetch("data/sektory.json").then((r) => r.json()).then((d) => { ROZ = d; if (Object.keys(WL).length) { zastosuj(); odswiez(); } }).catch(() => {});
        domyslne(); top(); liczby(); wykresCeny("1r"); metryki(); strategie(); wycena(); sprawozdania("q");
    }).catch((e) => { const el = $("err"); el.hidden = false; el.textContent = `Nie ma danych spółki ${t} (${e.message}). Lista obejmuje 500 największych spółek USA.`; });
})();
