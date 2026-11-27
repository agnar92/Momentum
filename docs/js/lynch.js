/* Lynch: szybka ocena spółki — 7 pytań z odpowiedzią z danych i małym wykresem, na górze potencjał / cena / wynik; kandydaci wg typów jako przyciski.
   Użytkownik: „proste lekkie narzędzie … pytanie za pytaniem … potencjał wzrostowy i wycena, czy nie przepłacamy”. */
(function () {
    const W = window.W;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    let ROWS = [], IDX = {};
    const ik = (s) => (s === true ? '<b class="kr-tak">✓</b>' : s === false ? '<b class="kr-nie">✗</b>' : '<span class="mut">–</span>');
    // mini słupki SVG: wartości po latach, ujemne na czerwono
    function slupki(et, w, fmt) {
        const z = w.filter(W.ok); if (z.length < 2) return "";
        const S = 260, H = 70, mx = Math.max(0, ...z), mn = Math.min(0, ...z), r = mx - mn || 1, b = S / w.length;
        const Y = (v) => 4 + (H - 18) * (mx - v) / r, y0 = Y(0);
        return `<svg viewBox="0 0 ${S} ${H}" class="ly-mini" role="img">${w.map((v, i) => !W.ok(v) ? "" : `<rect x="${i * b + 3}" width="${b - 6}" y="${Math.min(Y(v), y0)}" height="${Math.max(1, Math.abs(Y(v) - y0))}" class="${v < 0 ? "ly-minus" : "ly-plus"}"><title>${esc(et[i])}: ${esc(fmt(v))}</title></rect>`).join("")}
          ${et.map((e, i) => `<text x="${i * b + b / 2}" y="${H - 2}" text-anchor="middle" class="kr-tx">${esc(e)}</text>`).join("")}</svg>`;
    }
    // poziomy pasek ze strefami (PEG: tanio / uczciwie / drogo)
    function strefy(v, progi, nazwy, max) {
        if (!W.ok(v)) return "";
        const poz = Math.max(1, Math.min(99, 100 * Math.min(v, max) / max));
        return `<div class="ly-pas">${progi.map((p, i) => `<i style="width:${100 * ((p - (progi[i - 1] || 0)) / max)}%" class="ly-z${i}"></i>`).join("")}<span style="left:${poz}%"></span></div>
          <div class="ly-pas-op mut">${nazwy.map((n) => `<span>${esc(n)}</span>`).join("")}</div>`;
    }
    const dwa = (a, an, b, bn, fmt) => {
        const mx = Math.max(Math.abs(a || 0), Math.abs(b || 0)) || 1, sz = (x) => Math.max(2, 100 * Math.abs(x || 0) / mx);
        return `<div class="ly-dwa"><span>${esc(an)}</span><i style="width:${sz(a)}%" class="ly-plus"></i><b>${esc(fmt(a))}</b><span>${esc(bn)}</span><i style="width:${sz(b)}%" class="ly-szary"></i><b>${esc(fmt(b))}</b></div>`;
    };
    const mld = (v) => (W.ok(v) ? W.fmtUsd(v) : "–");
    function typSpolki(K) {
        const m = K.m || {}, ty = K.typy || [];
        if (W.duzy({ st: Object.fromEntries(Object.entries(K.strategie || {}).map(([k, l]) => [k, [l.filter((x) => x[2]).length, l.length]])) })) return W.DUZY;
        if (m.cykl_peg) return "Cykliczna";
        return ty[0] ? ty[0][0] : null;
    }
    function prognoza(K, typ) {
        const m = K.m || {}, y = ((K.hist && K.hist.y) || []).filter((r) => W.ok(r[2])).slice(-5);
        const epsN = m.peg_norm_uzyte && W.ok(m.eps_norm) ? m.eps_norm : m.eps;
        const cykl = typ === "Cykliczna";
        const eps = cykl && y.length >= 3 && W.ok(m.shares) && m.shares > 0 ? y.reduce((a, r) => a + r[2], 0) / y.length / m.shares : epsN;
        const med = W.ok(m.pe_med5) && !cykl && m.peg_norm_uzyte && W.ok(m.eps_norm) && m.eps_norm > 0 && W.ok(m.eps) && m.eps > 0 ? m.pe_med5 * m.eps / m.eps_norm : m.pe_med5;
        const fit = (n) => { const c = (K.typy || []).find((x) => x[0] === n); return c ? c[1] : 0; };
        const pr = W.prognozaTypu({ typ, eps_baza: eps, eps_teraz: cykl ? epsN : null, szybka: fit("Szybko rosnąca") >= 60, pe: m.pe, cena: m.price, pe_med5: med,
            rev_cagr3: m.rev_cagr3, rev_cagr5: m.rev_cagr5, eps_next5: m.eps_next5 });
        return { pr, z: pr.war ? W.zwrotAkcjonariusza(pr, { cena: m.price, akcje_3l: m.akcje_3l, div: m.div }) : null };
    }
    function ocen(K) {
        const m = K.m || {}, hy = ((K.hist && K.hist.y) || []).slice(-6), lat = hy.map((r) => "'" + String(r[0]).slice(2, 4));
        const typ = typSpolki(K), cykl = !!m.cykl_peg, L = K.lynch || {};
        const zak = W.ZAKRES_TYPU[typ] || null, limit = (W.CENA_TYPU[typ] || [])[0] || 2;
        const ni = hy.map((r) => r[2]), rv = hy.map((r) => r[1]);
        const wzr = (w) => { let n = 0, k = 0; for (let i = 1; i < w.length; i++) if (W.ok(w[i]) && W.ok(w[i - 1])) { k++; if (w[i] > w[i - 1]) n++; } return [n, k]; };
        const [zn, zk] = wzr(ni), [rn, rk] = wzr(rv);
        const flagi = [...(L.unikaj || []).filter((x) => x[2] === false).map((x) => x[0]), ...(L.lista || []).filter((x) => x[2] === false).map((x) => "Sprzedaż: " + x[0]), ...(m.spadek_2l ? ["⬇ przychody lub zysk spadają 2 lata z rzędu"] : [])];
        const pe = m.pe, med = m.pe_med5;
        const P = [
            ["Jaki to typ spółki?", null, `<span class="pill">${esc(typ || "–")}</span>`, zak ? `Lynch: oczekuj ok. ${W.fmtPct(zak[0], 0)}–${W.fmtPct(zak[1], 0)} wzrostu zysku rocznie` : "", ""],
            ["Czy zysk rośnie?", zk ? zn >= Math.max(1, zk - 1) : null, `${zn} z ${zk} lat w górę`, "zysk netto, lata obrotowe", slupki(lat, ni, mld)],
            ["Czy sprzedaż rośnie równo?", rk ? rn >= Math.max(1, rk - 1) : null, `${rn} z ${rk} lat w górę`, W.ok(m.rev_cagr5) ? `przychody ${W.fmtPct(m.rev_cagr5, 0, true)} rocznie przez 5 lat` : "", slupki(lat, rv, mld)],
            ["Czy firma jest bezpieczna?", W.ok(m.net_cash) ? m.net_cash >= 0 || (W.ok(m.de) && m.de >= 0 && m.de < 0.5) : null, W.ok(m.net_cash) ? (m.net_cash >= 0 ? "gotówka > dług" : W.ok(m.de) && m.de >= 0 && m.de < 0.5 ? `dług niski (D/E ${W.fmtNum(m.de)})` : "dług > gotówka") : "–", "Lynch: mocny bilans przetrwa kryzys", dwa(m.cash, "gotówka", m.debt, "dług", mld)],
            ["Czy nie przepłacam? (PEG)", cykl ? null : W.ok(m.peg) && m.peg > 0 ? m.peg <= limit : null, cykl ? "nie dotyczy" : W.ok(m.peg) && m.peg > 0 ? `PEG ${W.fmtNum(m.peg)}` : "–",
                cykl ? "spółka cykliczna — Lynch nie ocenia jej po PEG" : `dla typu „${typ}” rozsądnie do ok. ${W.fmtNum(limit, 1)}`, cykl ? "" : strefy(m.peg, [0.5, 1, 2, 3], ["okazja", "tanio", "uczciwie", "drogo"], 3)],
            ["P/E niżej niż zwykle?", W.ok(pe) && pe > 0 && W.ok(med) ? pe <= med : null, W.ok(pe) && pe > 0 ? `P/E ${W.fmtNum(pe, 1)}` : "strata", W.ok(med) ? `mediana z 5 lat ${W.fmtNum(med, 1)}` : "", W.ok(pe) && pe > 0 && W.ok(med) ? dwa(pe, "dziś", med, "zwykle", (v) => W.fmtNum(v, 1) + "×") : ""],
            ["Czy są czerwone flagi?", !flagi.length, flagi.length ? `${flagi.length} ✗` : "brak", "czego unikać i sygnały sprzedaży Lyncha", flagi.length ? `<ul class="ly-flagi">${flagi.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""],
        ];
        const tak = P.filter((x) => x[1] === true).length, spr = P.filter((x) => x[1] === true || x[1] === false).length;
        const { pr, z } = prognoza(K, typ);
        const baz = z && z.war.bazowy ? z.war.bazowy.razem : null;
        const cena = cykl ? ["nie dotyczy (cykliczna)", ""] : !W.ok(m.peg) || m.peg <= 0 ? ["–", ""] : m.peg <= limit ? [m.peg < 1 ? "tanio" : "uczciwie", "dob"] : ["drogo", "zle"];
        return `<div class="ly-naglowek"><a href="spolka.html?t=${encodeURIComponent(K.t)}"><b>${esc(K.t)}</b></a> ${esc(K.n || "")} <span class="mut">· ${W.fmtCena(m.price)}</span></div>
          <div class="kr-scen">
            <div class="kr-scen-k ${W.ok(baz) ? (baz >= 0.1 ? "kr-scen-lepszy" : baz >= 0.04 ? "kr-scen-bazowy" : "kr-scen-ostrozny") : ""}"><small>Potencjał (5 lat, bazowo)</small><b>${W.ok(baz) ? W.fmtPct(baz, 1, true) : "–"}</b><span>${z ? `rocznie · od ${W.fmtPct(z.war.ostrozny.razem, 0, true)} do ${W.fmtPct(z.war.lepszy.razem, 0, true)}` : esc(pr.brak || "")}</span></div>
            <div class="kr-scen-k ${cena[1] === "dob" ? "kr-scen-lepszy" : cena[1] === "zle" ? "kr-scen-ostrozny" : ""}"><small>Cena</small><b>${esc(cena[0])}</b><span>${cykl ? "" : W.ok(m.peg) && m.peg > 0 ? `PEG ${W.fmtNum(m.peg)} · limit ${W.fmtNum(limit, 1)}` : ""}</span></div>
            <div class="kr-scen-k ${tak / (spr || 1) >= 0.7 ? "kr-scen-lepszy" : tak / (spr || 1) >= 0.4 ? "kr-scen-bazowy" : "kr-scen-ostrozny"}"><small>Lynch</small><b>${tak} z ${spr} ✓</b><span>pytań na „tak”</span></div>
          </div>
          <div class="ly-pyt">${P.map(([q, st, odp, pod, wiz], i) => `<div class="ly-p"><div class="ly-p-g"><span class="ly-nr">${i + 1}</span><span class="ly-q">${esc(q)}</span><span class="ly-i">${ik(st)}</span><b class="ly-a">${odp}</b></div>
            ${pod ? `<div class="mut male ly-pod">${esc(pod)}</div>` : ""}${wiz || ""}</div>`).join("")}</div>
          <p class="male"><a href="spolka.html?t=${encodeURIComponent(K.t)}">Pełna karta spółki →</a> <span class="mut">(historia spółki, notatka, DCF)</span></p>`;
    }
    function pokaz(t) {
        t = String(t || "").trim().toUpperCase();
        if (!t) return;
        if (!IDX[t]) { $("ly-wynik").innerHTML = `<p class="mut">Nie ma ${esc(t)} na liście 500 spółek.</p>`; return; }
        $("ly-t").value = t;
        $("ly-wynik").innerHTML = '<p class="mut">Wczytuję…</p>';
        fetch(`data/spolki/${encodeURIComponent(t)}.json`, { cache: "no-cache" }).then((r) => r.json()).then((K) => {
            $("ly-wynik").innerHTML = ocen(K);
            try { window.history.replaceState(null, "", "?t=" + encodeURIComponent(t)); } catch (e) { /* bez historii */ }
        }).catch(() => { $("ly-wynik").innerHTML = '<p class="mut">Nie udało się wczytać danych spółki.</p>'; });
    }
    // lista Buffetta (8 reguł z książki Mary Buffett) → sprawdzian Lyncha (lista kontrolna, sygnały sprzedaży, „czego unikać”, ⬇) → cena (PEG w strefach)
    const BF = "Buffett (8 reguł)";
    let PROG = 7;
    const strefa = (r) => (r.cy ? ["nie dotyczy (cykliczna)", ""] : !W.ok(r.peg) || r.peg <= 0 ? ["–", ""] : r.peg < 1 ? ["tanio", "ly-s-t"] : r.peg <= 2 ? ["uczciwie", "ly-s-u"] : ["drogo", "ly-s-d"]);
    function kandydaci() {
        const l = ROWS.filter((r) => r.st && r.st[BF] && r.st[BF][0] >= PROG)
            .map((r) => ({ r, fl: (r.ls || 0) + (r.lu || 0) + (r.sp ? 1 : 0), lz: r.lz ? r.lz[0] / r.lz[1] : 0 }))
            .sort((a, b) => b.r.st[BF][0] - a.r.st[BF][0] || a.fl - b.fl || b.lz - a.lz);
        $("ly-prog").innerHTML = `<span class="mut male">Reguły Buffetta spełnione:</span> ${[8, 7, 6].map((n) => `<button data-p="${n}" class="${n === PROG ? "akt" : ""}">${n === 8 ? "8 z 8" : `≥ ${n} z 8`}</button>`).join("")}`;
        document.querySelectorAll("#ly-prog [data-p]").forEach((b) => b.addEventListener("click", () => { PROG = +b.dataset.p; kandydaci(); }));
        $("kandydaci").innerHTML = l.length ? `<div class="przewin"><table class="male ly-tab"><thead><tr><th>Spółka</th><th class="n">Buffett</th><th class="n">Lynch</th><th class="n">Flagi</th><th>Cena (PEG)</th></tr></thead><tbody>
          ${l.map(({ r, fl }) => { const [sn, sk] = strefa(r); return `<tr data-t="${esc(r.t)}"><td><b>${esc(r.t)}</b>${r.bf ? " 🏰" : ""}${r.dw ? " 💰" : ""}<br><span class="mut">${esc(r.n)}</span></td>
            <td class="n">${r.st[BF][0]} z 8</td><td class="n">${r.lz ? `${r.lz[0]} z ${r.lz[1]}` : "–"}</td><td class="n">${fl ? `<b class="kr-nie">${fl} ✗</b>` : '<b class="kr-tak">✓</b>'}</td>
            <td><span class="ly-s ${sk}">${esc(sn)}</span> ${W.ok(r.peg) && r.peg > 0 && !r.cy ? `<span class="mut">${W.fmtNum(r.peg)}</span>` : ""}</td></tr>`; }).join("")}</tbody></table></div>
          <p class="mut male">Lynch = punkty jego listy kontrolnej przed zakupem (z tych, które da się policzyć). Flagi = sygnały sprzedaży Lyncha, „czego unikać” i ⬇. Cena: PEG &lt; 1 tanio · 1–2 uczciwie · &gt; 2 drogo.</p>`
            : '<p class="mut">Dziś żadna spółka nie spełnia tylu reguł.</p>';
        document.querySelectorAll("#kandydaci tr[data-t]").forEach((tr) => tr.addEventListener("click", () => { pokaz(tr.dataset.t); $("ocena").scrollIntoView({ behavior: "smooth", block: "start" }); }));
    }
    $("ly-ok").addEventListener("click", () => pokaz($("ly-t").value));
    $("ly-t").addEventListener("keydown", (e) => { if (e.key === "Enter") pokaz($("ly-t").value); });
    fetch("data/lista.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
        ROWS = d.rows || []; ROWS.forEach((r) => { IDX[r.t] = r; });
        $("asof").textContent = d.generated_at || "–";
        $("ly-lista").innerHTML = ROWS.map((r) => `<option value="${esc(r.t)}">${esc(r.n)}</option>`).join("");
        kandydaci();
        const t = new URLSearchParams(window.location.search).get("t");
        if (t) pokaz(t);
    }).catch(() => { $("kandydaci").innerHTML = '<p class="mut">Nie udało się wczytać danych.</p>'; });
})();
