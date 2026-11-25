// Lista 500 spółek: filtry, sortowanie, obserwowane (localStorage), przejście do karty spółki.
"use strict";
(function () {
    const $ = (id) => document.getElementById(id);
    const KLUCZ = "momentum_lista_v1", OBS = "momentum_obserwowane";
    const czytaj = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
    const zapisz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* tryb prywatny */ } };
    let D = null, st = czytaj(KLUCZ, { sort: "ogolna", kier: -1 }), obs = czytaj(OBS, []);
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const slug = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/\s+/g, "-");
    const oc = (x) => `<span class="ocena ${W.klasaOceny(x)}">${W.ok(x) ? W.fmtNum(x, 1) : "–"}</span>`;
    const stl = (v) => v ? `${v[0]}/${v[1]}` : "–";

    let MIEJSCA = {};
    function rysuj() {
        const [strat, min] = ($("strategia").value || "|").split("|");
        const f = { q: $("q").value, sektor: $("sektor").value, typ: $("typ").value, wycena: $("wycena").value, strategia: strat, min: +min, obserwowane: $("obs").checked, lista: obs, jakosc: $("jak").checked, duzy: $("duz").checked, dyw: $("dyw").checked, buffett: $("buf").checked, sila: $("sila").checked };
        const rows = W.sortuj(W.filtruj(D.rows, f), st.sort, st.kier);
        $("ile").textContent = `${rows.length} z ${D.rows.length} spółek`;
        $("lista").innerHTML = rows.map((r) => `<tr data-t="${esc(r.t)}">
            <td><span class="gw ${obs.includes(r.t) ? "" : "off"}" data-gw="${esc(r.t)}" title="Obserwuj">★</span></td>
            <td class="n mut">${MIEJSCA[r.t] || "–"}</td>
            <td class="firma"><b>${esc(r.n)}</b>${W.jakosc77(r) ? ' <span class="jakosc" title="Spełnia wszystkie 7 kryteriów jakości">✔ Jakość 7/7</span>' : ""}${W.duzy(r) ? ' <span class="jakosc duzy-z" title="Duża spółka rosnąca od 10+ lat z dobrymi fundamentami — PEG 1–2 to cena godziwa">🏛 Duży zwycięzca</span>' : ""}${r.dw ? ' <span class="dyw" title="Dywidenda wypłacana co roku przez 5 lat, bez cięcia">💰</span>' : ""}${r.bf ? ' <span class="dyw" title="Przewaga Buffetta: marża netto > 20 %, dług długoterminowy ≤ 4 × zysk, SG&A < 30 % zysku brutto">🏰</span>' : ""}<small>${esc(r.t)} · ${esc(r.s || "")} · ${esc(r.i || "")}</small></td>
            <td class="n ogolna">${r.sp ? `<span class="spadek" title="Fundamenty słabną 2 lata z rzędu: ${esc(r.sp.join(" i "))}">⬇</span> ` : ""}${r.moje ? `<span class="moje" title="Ocena z Twoimi danymi (${r.moje})">✎</span> ` : ""}${r.kp && r.kp[2] && !r.moje ? `<span class="uwaga" title="Niepełne dane: ${r.kp[0]} z ${r.kp[1]} wskaźników — ocena może być zaburzona">⚠</span> ` : ""}${oc(r.o.ogolna)}</td>
            <td class="n" data-l="Wzrost">${oc(r.o.wzrost)}</td><td class="n" data-l="Siła">${oc(r.o.sila)}</td><td class="n" data-l="Wycena">${oc(r.o.wycena)}</td>
            <td class="typ">${esc(r.typ || "–")}</td>
            <td class="n">${W.ok(r.peg) && r.peg > 0 ? W.fmtNum(r.peg, 2) : "–"}</td>
            <td class="n ${r.dcf_pot > 0 ? "plus" : r.dcf_pot < 0 ? "minus" : ""}">${W.fmtPct(r.dcf_pot, 0, true)}</td>
            <td>${r.et ? `<span class="pill p-${slug(r.et)}">${esc(r.et)}</span>` : "–"}</td>
            <td class="n">${stl(r.st["7/7 (niskie ryzyko)"])}</td><td class="n">${stl(r.st["Jakość (7 kryteriów)"])}</td>
            <td class="n ${r.zw && r.zw["1r"] > 0 ? "plus" : "minus"}">${W.fmtPct(r.zw && r.zw["1r"], 0, true)}</td>
            <td class="n">${W.fmtUsd(r.mc, 0)}</td></tr>`).join("");
        document.querySelectorAll("th[data-k]").forEach((th) => { th.textContent = th.textContent.replace(/ [▲▼]$/, "") + (th.dataset.k === st.sort ? (st.kier > 0 ? " ▲" : " ▼") : ""); });
    }
    function opcje(id, wartosci) { $(id).insertAdjacentHTML("beforeend", wartosci.map((v) => `<option>${esc(v)}</option>`).join("")); }
    function podlacz() {
        ["q", "sektor", "typ", "wycena", "strategia", "obs", "jak", "duz", "dyw", "buf", "sila"].forEach((id) => $(id).addEventListener("input", rysuj));
        document.querySelectorAll("th[data-k]").forEach((th) => th.addEventListener("click", () => {
            const k = th.dataset.k; st = { sort: k, kier: st.sort === k ? -st.kier : (k === "peg" || k === "nazwa" ? 1 : -1) }; zapisz(KLUCZ, st); rysuj();
        }));
        $("lista").addEventListener("click", (e) => {
            const g = e.target.closest("[data-gw]");
            if (g) { const t = g.dataset.gw; obs = obs.includes(t) ? obs.filter((x) => x !== t) : [...obs, t]; zapisz(OBS, obs); rysuj(); return; }
            const tr = e.target.closest("tr[data-t]"); if (tr) location.href = "spolka.html?t=" + encodeURIComponent(tr.dataset.t);
        });
    }
    fetch("data/lista.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then((d) => {
        D = d;
        const wl = czytaj("fundamenta_wlasne", {});     // własne dane z karty spółki: ocena przeliczona w przeglądarce
        d.rows.forEach((r) => { if (wl[r.t] && wl[r.t].o) { r.o = wl[r.t].o; r.moje = Object.keys(wl[r.t].w || {}).length; } });
        W.sortuj(d.rows, "ogolna", -1).filter((r) => r.o && W.ok(r.o.ogolna)).forEach((r, i) => { MIEJSCA[r.t] = i + 1; });
        const [y, m, dd] = d.generated_at.split("-"); $("asof").textContent = `${dd}.${m}.${y}`;
        opcje("sektor", d.sektory);
        opcje("typ", [...new Set(d.rows.map((r) => r.typ).filter(Boolean))].sort());
        opcje("wycena", ["Bardzo tania", "Niedowartościowana", "Wyceniona uczciwie", "Droga", "Bardzo droga"]);
        podlacz(); rysuj();
    }).catch((e) => { const el = $("err"); el.hidden = false; el.textContent = `Nie udało się wczytać data/lista.json (${e.message}). Uruchom workflow „Dane spółek” w GitHub Actions.`; });
})();
