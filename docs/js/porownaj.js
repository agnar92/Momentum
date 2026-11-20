// Porównanie do 4 spółek: oceny (z miejscem w rankingu), składniki ocen z punktami, strategie, wycena. Wybór w adresie: porownaj.html?t=NVDA,SNDK
"use strict";
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    let wyb = (new URLSearchParams(location.search).get("t") || "NVDA,SNDK").toUpperCase().split(",").filter(Boolean).slice(0, 4);
    let LISTA = [];
    const KARTY = {};
    const oc = (x) => `<span class="ocena ${W.klasaOceny(x)}">${W.ok(x) ? W.fmtNum(x, 1) : "–"}</span>`;
    const FMT = { pct: (x) => W.fmtPct(x, 1), num: (x) => W.fmtNum(x, 2), int: (x) => (W.ok(x) ? String(x) : "–") };
    const POLA = { rev_1y: "pct", rev_cagr3: "pct", rev_cagr5: "pct", ni_1y: "pct", ni_5y: "pct", eps_next5: "pct", rev_lata_10: "int", gm: "pct", om: "pct", nm: "pct",
        roe: "pct", roa: "pct", roce: "pct", fcf_margin: "pct", de: "num", qr: "num", net_cash_mc: "pct", pe: "num", peg: "num", ps: "num", pfcf: "num", fcf_yield: "pct", dcf_pot: "pct" };

    function adres() { history.replaceState(null, "", "porownaj.html?t=" + wyb.join(",")); }
    function wiersz(nazwa, komorki, wartosci) {
        // wartosci: liczby do wyboru najlepszej (większa = lepsza); null = nie podświetlaj
        const z = (wartosci || []).filter(W.ok), max = z.length > 1 ? Math.max(...z) : null;
        return `<tr><th style="text-align:left;text-transform:none;font-size:13px;color:var(--tekst)">${nazwa}</th>${komorki.map((k, i) => `<td class="n ${max !== null && wartosci[i] === max ? "naj" : ""}">${k}</td>`).join("")}</tr>`;
    }
    function rysuj() {
        $("wybrane").innerHTML = wyb.map((t) => `<span class="tag">${esc(t)}<button data-usun="${esc(t)}" title="Usuń">✕</button></span>`).join("");
        const K = wyb.map((t) => KARTY[t]).filter(Boolean);
        if (!K.length) { $("tab").innerHTML = ""; return; }
        const sek = (n) => `<tr class="sekcja"><td colspan="${K.length + 1}">${n}</td></tr>`;
        let h = `<thead><tr><th></th>${K.map((k) => `<th class="n" style="text-transform:none;font-size:14px;color:var(--tekst)"><a href="spolka.html?t=${encodeURIComponent(k.t)}">${esc(k.n)}</a><br><span class="mut male">${esc(k.t)} · ${esc(k.sector)}</span></th>`).join("")}</tr></thead><tbody>`;
        h += wiersz("Typ spółki", K.map((k) => esc(k.typy && k.typy[0] ? k.typy[0][0] : "–")));
        h += wiersz("Kompletność danych", K.map((k) => (k.kompletnosc ? `${k.kompletnosc.niepelne ? "⚠ " : ""}${k.kompletnosc.liczone}/${k.kompletnosc.wszystkie}` : "–")), K.map((k) => (k.kompletnosc ? k.kompletnosc.liczone : null)));
        h += wiersz("Kapitalizacja", K.map((k) => W.fmtUsd(k.m.mcap)), K.map((k) => k.m.mcap));
        h += sek("Oceny (0–10, na tle sektora)");
        for (const [g, n] of [["ogolna", "Ocena ogólna"], ["wzrost", "Wzrost"], ["sila", "Siła finansowa"], ["wycena", "Wycena (wyżej = taniej)"]]) {
            h += wiersz(n, K.map((k) => { const r = W.miejsce(LISTA, k.t, (x) => x.o && x.o[g]); return oc(k.oceny[g]) + (r ? `<br><span class="mut male">miejsce ${r.miejsce} z ${r.z}</span>` : ""); }), K.map((k) => k.oceny[g]));
        }
        for (const [g, n] of [["wzrost", "Wzrost — składniki"], ["sila", "Siła finansowa — składniki"], ["wycena", "Wycena — składniki"]]) {
            h += sek(n);
            for (const [pole, nazwa] of W.GRUPY[g]) {
                h += wiersz(nazwa, K.map((k) => { const p = k.pct[pole]; const md = k.sektor_med && W.ok(k.sektor_med[pole]) ? `<br><span class="mut male">sektor: ${FMT[POLA[pole]](k.sektor_med[pole])}</span>` : "";
                    return `${FMT[POLA[pole]](k.m[pole])} <span class="mut male">(${W.ok(p) ? Math.round(100 * p) : "50*"})</span>${md}`; }), K.map((k) => k.pct[pole]));
            }
        }
        h += sek("Strategie (spełnione kryteria)");
        for (const s of Object.keys(K[0].strategie)) {
            h += wiersz(esc(s), K.map((k) => { const kr = k.strategie[s]; return kr ? `${kr.filter((x) => x[2]).length}/${kr.length}` : "–"; }), K.map((k) => (k.strategie[s] ? k.strategie[s].filter((x) => x[2]).length : null)));
        }
        h += sek("Wycena");
        h += wiersz("Cena", K.map((k) => W.fmtCena(k.m.price)));
        h += wiersz("PEG (P/E ÷ prognoza EPS 5 lat)", K.map((k) => (W.ok(k.m.peg) && k.m.peg > 0 ? W.fmtNum(k.m.peg) : "–")), K.map((k) => (W.ok(k.m.peg) && k.m.peg > 0 ? -k.m.peg : null)));
        h += wiersz("Wartość DCF (bazowo)", K.map((k) => W.fmtCena(k.dcf && k.dcf.base ? k.dcf.base.wartosc : null)));
        h += wiersz("Potencjał DCF", K.map((k) => W.fmtPct(k.m.dcf_pot, 0, true)), K.map((k) => k.m.dcf_pot));
        h += wiersz("Etykieta", K.map((k) => esc(k.etykieta || "–")));
        h += wiersz("Zwrot 1 rok", K.map((k) => W.fmtPct(k.zw && k.zw["1r"], 0, true)), K.map((k) => k.zw && k.zw["1r"]));
        $("tab").innerHTML = h + "</tbody>";
    }
    function wczytaj() {
        adres();
        Promise.all(wyb.filter((t) => !KARTY[t]).map((t) => fetch(`data/spolki/${encodeURIComponent(t)}.json`).then((r) => { if (!r.ok) throw new Error(t); return r.json(); })
            .then((k) => { KARTY[t] = k; }).catch(() => { wyb = wyb.filter((x) => x !== t); const e = $("err"); e.hidden = false; e.textContent = `Brak spółki ${t} na liście.`; })))
            .then(rysuj);
    }
    function dodaj() {
        const t = $("dodaj").value.trim().toUpperCase(); $("dodaj").value = "";
        if (!t || wyb.includes(t)) return;
        if (wyb.length >= 4) wyb.shift();
        wyb.push(t); $("err").hidden = true; wczytaj();
    }
    $("dodaj-btn").addEventListener("click", dodaj);
    $("dodaj").addEventListener("change", dodaj);
    $("wybrane").addEventListener("click", (e) => { const b = e.target.closest("[data-usun]"); if (b) { wyb = wyb.filter((x) => x !== b.dataset.usun); adres(); rysuj(); } });
    fetch("data/lista.json").then((r) => r.json()).then((d) => {
        LISTA = d.rows;
        $("tickery").innerHTML = d.rows.map((r) => `<option value="${esc(r.t)}">${esc(r.n)}</option>`).join("");
        wczytaj();
    }).catch((e) => { const el = $("err"); el.hidden = false; el.textContent = "Nie udało się wczytać data/lista.json."; });
})();
