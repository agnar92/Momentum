/* Portfel: pozycje użytkownika (localStorage), budowanie pozycji wg reguły użytkownika (W.dokup): 10 % konta na spółkę, 20 % celu na start, potem 10 % przy PEG 0–2 i ruchu ±7 %. */
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const KLUCZ = "fundamenta_portfel";
    let WIERSZE = {};
    const czytaj = () => { try { return JSON.parse(localStorage.getItem(KLUCZ)) || {}; } catch (e) { return {}; } };
    let S = { pozycje: [], konto: null, budzet: null, kurs: null, ...czytaj() };
    let KURS_DANE = null;                                   // USD/PLN z cotygodniowych danych
    const kurs = () => (W.ok(S.kurs) && S.kurs > 0 ? S.kurs : KURS_DANE || 1);
    const pln = (x) => (W.ok(x) ? `${x.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł` : "–");
    const zapisz = () => { try { localStorage.setItem(KLUCZ, JSON.stringify(S)); } catch (e) { /* tryb prywatny */ } };
    const zl = (x) => (W.ok(x) ? W.fmtCena(x) : "–");
    const pct = (x) => (W.ok(x) ? `<span class="${x > 0 ? "plus" : x < 0 ? "minus" : ""}">${W.fmtPct(x, 1, true)}</span>` : "–");
    const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]+/g, "-");
    const znaczki = (r) => !r ? "" : (W.jakosc77(r) ? ' <span class="jakosc" title="Jakość 7/7">✔</span>' : "") + (r.sp ? ' <span class="spadek" title="Fundamenty słabną 2 lata z rzędu">⬇</span>' : "")
        + (r.ow ? ` <span title="Ostrzeżenia na karcie">❗${r.ow}</span>` : "");

    function rysuj() {
        const d = W.dokup(S.pozycje, WIERSZE, { konto: S.konto, kurs: kurs() });
        const koszt = S.pozycje.reduce((a, p) => a + (p.koszt || 0) * (p.akcje || 0), 0);
        $("pozycje").innerHTML = S.pozycje.length ? `<div class="przewin"><table class="male">
            <thead><tr><th>Spółka</th><th class="n">Akcje</th><th class="n">Śr. koszt (USD)</th><th class="n">Cena (USD)</th><th class="n">Wartość (PLN)</th><th class="n">Udział w koncie</th><th class="n">Zysk</th><th class="n">Ostatni zakup</th><th>Wycena</th><th></th></tr></thead>
            <tbody>${d.pozycje.map((x, k) => { const r = x.r; return `<tr>
              <td><a href="spolka.html?t=${encodeURIComponent(x.t)}"><b>${esc(x.t)}</b></a>${znaczki(r)}<br><span class="mut">${esc(r ? r.n : "brak w danych")}</span></td>
              <td class="n"><input type="number" step="any" min="0" data-k="${k}" data-p="akcje" value="${W.ok(x.akcje) ? +x.akcje.toFixed(4) : ""}" style="width:90px"></td>
              <td class="n"><input type="number" step="any" min="0" data-k="${k}" data-p="koszt" value="${W.ok(x.koszt) ? +x.koszt.toFixed(2) : ""}" style="width:90px"></td>
              <td class="n">${zl(x.cena)}</td><td class="n">${pln(x.wartosc)}</td><td class="n">${W.fmtPct(x.waga, 1)} <span class="mut">/ 10 %</span></td><td class="n">${pct(x.zysk)}</td>
              <td class="n">${x.ost && x.ost.d ? `${esc(x.ost.d)}<br><span class="mut">${zl(x.ost.c)} · ${pct(x.ruch)}</span>` : "–"}</td>
              <td>${r && r.et ? `<span class="pill p-${slug(r.et)}">${esc(r.et)}</span> <span class="mut">PEG ${W.ok(r.peg) ? W.fmtNum(r.peg) : "–"}</span>` : "–"}</td>
              <td><button data-usun="${k}" title="Usuń">✕</button></td></tr>`; }).join("")}</tbody></table></div>
            <div class="liczby" style="margin-top:10px"><div><small>Wartość akcji</small><b>${pln(d.suma)}</b></div><div><small>Koszt zakupu (USD)</small><b>${zl(koszt)}</b></div>
              <div><small>Zysk (w USD)</small><b>${koszt > 0 ? pct(d.suma / kurs() / koszt - 1) : "–"}</b></div><div><small>Spółek</small><b>${S.pozycje.length}</b></div></div>`
            : '<p class="mut">Brak pozycji — otwórz kartę spółki i kliknij „＋ Dodaj do portfela”.</p>';
        document.querySelectorAll("#pozycje input[data-k]").forEach((el) => el.addEventListener("change", () => {
            const v = el.value === "" ? null : +el.value; S.pozycje[+el.dataset.k][el.dataset.p] = v; zapisz(); rysuj();
        }));
        document.querySelectorAll("[data-usun]").forEach((b) => b.addEventListener("click", () => { S.pozycje.splice(+b.dataset.usun, 1); zapisz(); rysuj(); }));
        sugestie(); typyPf();
    }

    // skład portfela wg typów Lyncha (informacyjnie): udział w wartości akcji, podział Lyncha (10 spółek), wynik typu w etapie 86
    // skład portfela wg typów Lyncha: Twój cel (domyślnie 60 / 20 / 10 — użytkownik: „więcej stabilnych, mniej wychodzących z kłopotów i szybko rosnących”),
    // obok podział Lyncha (10 spółek) i wynik typu w etapie 86; tylko informacja — reguły dokupu bez zmian
    const TYPY_PF = [["Stabilnie rosnąca", 60, 20, "+83 %"], ["Szybko rosnąca", 20, 40, "+56 %"], ["Wolno rosnąca", 10, 0, "+63 %"],
        ["Cykliczna", 0, 0, "+78 %"], ["Wychodząca z kłopotów", 0, 40, "+58 %"], ["Ukryte aktywa", 0, 0, "–"]];
    const celTypu = (t, dom) => (S.celTypy && W.ok(S.celTypy[t]) ? S.celTypy[t] : dom);
    function typyPf() {
        const el = $("typy-pf"); if (!el) return;
        const d = W.dokup(S.pozycje, WIERSZE, { konto: S.konto, kurs: kurs() });
        const ud = {}, sp = {};
        if (d.suma > 0) d.pozycje.forEach((x) => { const t = (x.r && x.r.typ) || "brak typu"; ud[t] = (ud[t] || 0) + x.wartosc / d.suma; (sp[t] = sp[t] || []).push(x.t); });
        const suma = TYPY_PF.reduce((a, [t, c]) => a + celTypu(t, c), 0);
        el.innerHTML = `<div class="przewin"><table class="male"><thead><tr><th>Typ</th><th>Twoje spółki</th><th class="n">Teraz</th><th class="n">Twój cel</th><th class="n">Różnica</th><th class="n">Lynch (10 spółek)</th><th class="n">Etap 86: mediana 5 lat</th></tr></thead><tbody>
          ${TYPY_PF.map(([t, c, l, w]) => { const cel = celTypu(t, c), teraz = ud[t] || 0, roz = teraz - cel / 100;
            return `<tr><td>${esc(t)}</td><td class="zawin">${esc((sp[t] || []).join(", ") || "–")}</td><td class="n">${d.suma > 0 ? W.fmtPct(teraz, 0) : "–"}</td>
            <td class="n"><input type="number" min="0" max="100" step="5" data-cel="${esc(t)}" value="${cel}" style="width:64px"> %</td>
            <td class="n">${d.suma > 0 ? `<span class="${Math.abs(roz) >= 0.05 ? (roz > 0 ? "plus" : "minus") : "mut"}">${W.fmtPct(roz, 0, true)}</span>` : "–"}</td>
            <td class="n mut">${l} %</td><td class="n mut">${w}</td></tr>`; }).join("")}
          ${ud["brak typu"] ? `<tr><td>brak typu</td><td>${esc(sp["brak typu"].join(", "))}</td><td class="n">${W.fmtPct(ud["brak typu"], 0)}</td><td></td><td></td><td></td><td></td></tr>` : ""}
          </tbody></table></div>
          <p class="male">Cel razem: <b>${suma} %</b>${suma < 100 ? ` — ${100 - suma} % nieprzypisane (np. gotówka albo inne typy)` : suma > 100 ? " — więcej niż 100 %" : ""}.
            <span class="mut">Tylko informacja — reguły dokupu się nie zmieniają. Lynch: „najpierw wielkość, potem historia spółki”. W naszym teście 2012–2026 najlepiej wypadały stabilnie rosnące; reguła „nie trzymaj stabilnie rosnącej po podwojeniu” się nie potwierdziła (etap 94).</span></p>`;
        el.querySelectorAll("input[data-cel]").forEach((i) => i.addEventListener("change", () => {
            S.celTypy = { ...(S.celTypy || {}), [i.dataset.cel]: i.value === "" ? 0 : +i.value }; zapisz(); typyPf();
        }));
    }

    const opis = (x) => { const c = x.czynniki, r = x.r;
        return (x.pierwszy ? "pierwszy zakup: 20 % z 10 %" : `dokup: 10 % z 10 % (kurs ${W.fmtPct(x.ruch, 1, true)} od ostatniego zakupu)`)
            + (c ? ` · ${W.fmtNum(c.punkty, 1)} pkt (PEG ${W.fmtNum(r.peg)}, ocena ${W.ok(r.o && r.o.ogolna) ? W.fmtNum(r.o.ogolna, 1) : "–"}, #${r.rank})` : ""); };
    function sugestie() {
        const el = $("sugestie");
        if (!S.pozycje.length) { el.innerHTML = ""; return; }
        const d = W.dokup(S.pozycje, WIERSZE, { konto: S.konto, budzet: S.budzet, kurs: kurs() });
        const kup = d.pozycje.filter((x) => x.kwota > 0), nie = d.pozycje.filter((x) => !(x.kwota > 0));
        el.innerHTML = `<p class="male">Konto ${pln(d.konto)}${W.ok(S.konto) ? "" : " <span class=\"mut\">(sama wartość akcji — wpisz wartość konta z gotówką)</span>"} → na spółkę najwyżej <b>${pln(d.cel)}</b>: pierwszy zakup ${pln(0.2 * d.cel)}, kolejne po ${pln(0.1 * d.cel)} · kurs USD/PLN ${W.fmtNum(kurs(), 4)}.
            W tym miesiącu: <b>${pln(d.razem)}</b>${W.ok(S.budzet) && d.potrzeba > d.razem + 0.005 ? ` (reguła chciałaby ${pln(d.potrzeba)} — budżet ${pln(S.budzet)})` : ""}.</p>`
            + (kup.length ? `<div class="przewin"><table class="male"><thead><tr><th>Spółka</th><th class="n">Kwota (PLN)</th><th class="n">≈ akcji</th><th>Dlaczego</th><th></th></tr></thead><tbody>
              ${kup.map((x) => `<tr><td><a href="spolka.html?t=${encodeURIComponent(x.t)}"><b>${esc(x.t)}</b></a>${znaczki(x.r)}</td>
                <td class="n"><b>${pln(x.kwota)}</b></td><td class="n">${W.fmtNum(x.akcjeKup, x.akcjeKup < 10 ? 2 : 1)}</td>
                <td class="zawin">${esc([opis(x), ...x.uwagi].join(" · "))}</td>
                <td><button data-kup="${esc(x.t)}" data-a="${x.akcjeKup}" data-c="${x.cena}" title="Dopisz zakup po bieżącej cenie — przeliczy średni koszt i zapamięta cenę i datę">Kupiłem</button></td></tr>`).join("")}</tbody></table></div>`
              : '<p class="mut">W tym miesiącu nic — czekamy.</p>')
            + (nie.length ? `<details style="margin-top:8px" open><summary class="mut male" style="cursor:pointer">Czekamy (${nie.length})</summary><ul class="male" style="margin:6px 0 0 18px;padding:0">
              ${nie.map((x) => `<li><b>${esc(x.t)}</b> — ${esc(x.powod || x.uwagi.join(" · "))}</li>`).join("")}</ul></details>` : "")
            + '<p class="mut male">Cena z ostatniej aktualizacji danych (co tydzień), liczba akcji orientacyjna. „Kupiłem” dopisuje zakup po tej cenie i zapamiętuje cenę i datę (do progu ±7 % i „raz w miesiącu”) — popraw liczbę akcji i średni koszt w tabeli, jeśli kupiłeś inaczej.</p>';
        document.querySelectorAll("[data-kup]").forEach((b) => b.addEventListener("click", () => {
            const t = b.dataset.kup, a = +b.dataset.a, c = +b.dataset.c;
            const p = S.pozycje.find((x) => x.t === t); if (!p) return;
            p.koszt = W.sredniKoszt(p.akcje || 0, p.koszt || 0, a, c); p.akcje = (p.akcje || 0) + a;
            p.ost = { c, d: new Date().toISOString().slice(0, 10) };
            zapisz(); rysuj();
        }));
    }

    const pole = (id, k) => { $(id).value = W.ok(S[k]) ? S[k] : ""; $(id).addEventListener("input", (e) => { S[k] = e.target.value === "" ? null : +e.target.value; zapisz(); rysuj(); }); };
    pole("konto", "konto"); pole("budzet", "budzet"); pole("kurs", "kurs");

    fetch("data/lista.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
        WIERSZE = Object.fromEntries(d.rows.map((r) => [r.t, r]));
        $("asof").textContent = d.generated_at; KURS_DANE = d.usdpln || null;
        $("kurs").placeholder = KURS_DANE ? W.fmtNum(KURS_DANE, 4) + " (z danych)" : "";
        rysuj();
    }).catch(() => { $("pozycje").innerHTML = '<p class="blad">Nie udało się wczytać danych.</p>'; });
})();
