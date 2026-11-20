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

    function rysuj() {
        const [strat, min] = ($("strategia").value || "|").split("|");
        const f = { q: $("q").value, sektor: $("sektor").value, typ: $("typ").value, wycena: $("wycena").value, strategia: strat, min: +min, obserwowane: $("obs").checked, lista: obs };
        const rows = W.sortuj(W.filtruj(D.rows, f), st.sort, st.kier);
        $("ile").textContent = `${rows.length} z ${D.rows.length} spółek`;
        $("lista").innerHTML = rows.map((r) => `<tr data-t="${esc(r.t)}">
            <td><span class="gw ${obs.includes(r.t) ? "" : "off"}" data-gw="${esc(r.t)}" title="Obserwuj">★</span></td>
            <td class="firma"><b>${esc(r.n)}</b><small>${esc(r.t)} · ${esc(r.s || "")} · ${esc(r.i || "")}</small></td>
            <td class="n">${oc(r.o.wzrost)}</td><td class="n">${oc(r.o.sila)}</td><td class="n">${oc(r.o.wycena)}</td><td class="n">${oc(r.o.ogolna)}</td>
            <td>${esc(r.typ || "–")}</td>
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
        ["q", "sektor", "typ", "wycena", "strategia", "obs"].forEach((id) => $(id).addEventListener("input", rysuj));
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
        const [y, m, dd] = d.generated_at.split("-"); $("asof").textContent = `${dd}.${m}.${y}`;
        opcje("sektor", d.sektory);
        opcje("typ", [...new Set(d.rows.map((r) => r.typ).filter(Boolean))].sort());
        opcje("wycena", ["Bardzo tania", "Niedowartościowana", "Wyceniona uczciwie", "Droga", "Bardzo droga"]);
        podlacz(); rysuj();
    }).catch((e) => { const el = $("err"); el.hidden = false; el.textContent = `Nie udało się wczytać data/lista.json (${e.message}). Uruchom workflow „Dane spółek” w GitHub Actions.`; });
})();
