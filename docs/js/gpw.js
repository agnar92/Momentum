/* GPW: lista spółek z docs/data/gpw.json (gpw.py), filtry, sortowanie, rozwijane szczegóły w wierszu. */
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/[^a-z0-9]+/g, "-");
    const J = "Jakość (7 kryteriów, GPW)", L7 = "7/7 (niskie ryzyko, GPW)";
    let ROWS = [], SORT = { k: "ogolna", dir: -1 }, OTW = null;
    const sp = (r, k) => (r.st[k] || []).filter((x) => x[2]).length;
    const oc = (v) => (W.ok(v) ? `<span class="ocena ${W.klasaOceny(v)}">${W.fmtNum(v, 1)}</span>` : '<span class="brak">–</span>');
    const mld = (x) => (W.ok(x) ? `${(x / 1e9).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} mld zł` : "–");
    const KL = { ogolna: (r) => r.oceny.ogolna, wzrost: (r) => r.oceny.wzrost, sila: (r) => r.oceny.sila, wycena: (r) => r.oceny.wycena, pe: (r) => r.m.pe, peg: (r) => r.m.peg,
        jak: (r) => sp(r, J), lr: (r) => sp(r, L7), zw: (r) => r.m.zw_1r, mc: (r) => r.m.mcap, nazwa: (r) => r.n };
    const fmt = { pct: (x) => W.fmtPct(x, 1), num: (x) => W.fmtNum(x, 2) };
    const POLA = [["Przychody 1 rok", "rev_1y", "pct"], ["Przychody 3 lata rocznie", "rev_cagr3", "pct"], ["Zysk 1 rok", "ni_1y", "pct"], ["Zysk 3 lata rocznie", "ni_cagr3", "pct"],
        ["Marża brutto", "gm", "pct"], ["Marża operacyjna", "om", "pct"], ["Marża netto", "nm", "pct"], ["ROE", "roe", "pct"], ["ROA", "roa", "pct"], ["ROCE", "roce", "pct"],
        ["Marża FCF", "fcf_margin", "pct"], ["Dług / kapitał", "de", "num"], ["Gotówka netto / kapit.", "net_cash_mc", "pct"], ["P/E", "pe", "num"],
        ["P/E bez pozycji jednorazowych", "pe_norm", "num"], ["PEG (z przeszłego wzrostu)", "peg", "num"], ["P/S", "ps", "num"], ["P/FCF", "pfcf", "num"], ["Stopa dywidendy", "div", "pct"], ["Lata z dywidendą (z 5)", "dywidenda_lata", "num"], ["Skup akcji netto (% kapitalizacji)", "skup_netto_mc", "pct"],
        ["Liczba akcji w 3 lata", "akcje_3l", "pct"], ["Przychody 5 lat (rocznie)", "rev_cagr5", "pct"],
        ["Od szczytu 12 mies.", "od_maks_12m", "pct"]];
    function szczegoly(r) {
        const m = r.m;
        return `<tr class="szczeg"><td colspan="13" style="white-space:normal;background:var(--tlo2)"><div class="siatka2">
          <div><div class="male mut">${esc(r.s || "")} · ${esc(r.i || "")} · ${esc(r.ind)}${r.www ? ` · <a href="${esc(r.www)}" target="_blank" rel="noopener">strona firmy</a>` : ""}</div>
            ${m.spadek_2l ? `<div class="ostrzezenie" style="margin-top:6px">⬇ Fundamenty słabną 2 lata z rzędu: ${esc(m.spadek_2l.join(" i "))} — Twoja reguła sprzedaży.</div>` : ""}
            <div class="jz" style="margin-top:6px">${POLA.filter(([, k]) => W.ok(m[k])).map(([n, k, f]) => `<div class="jz-w"><span>${n}</span><b>${fmt[f](m[k])}</b></div>`).join("")}</div></div>
          <div>${Object.entries(r.st).map(([nm, kr]) => `<div style="margin-bottom:10px"><b class="male">${esc(nm)} — ${kr.filter((x) => x[2]).length}/${kr.length}</b>
            ${kr.map(([k, , ok]) => `<div class="kryt"><span>${esc(k)}</span><span class="${ok ? "tak" : "nie"}">${ok ? "✓" : "✗"}</span></div>`).join("")}</div>`).join("")}</div></div></td></tr>`;
    }
    function rysuj() {
        const q = $("q").value.trim().toLowerCase(), sk = $("sektor").value, ind = $("ind").value;
        let rows = ROWS.filter((r) => (!q || r.t.toLowerCase().includes(q) || r.n.toLowerCase().includes(q)) && (!sk || r.s === sk) && (!ind || r.ind === ind)
            && (!$("jak").checked || sp(r, J) === 7) && (!$("sila").checked || (r.oceny.sila || 0) >= 7) && (!$("bez").checked || !r.m.spadek_2l)
            && (!$("dyw").checked || r.m.dywidenda_stabilna));
        const f = KL[SORT.k];
        rows = rows.slice().sort((a, b) => { const x = f(a), y = f(b); if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * SORT.dir; });
        $("ile").textContent = `${rows.length} z ${ROWS.length} spółek`;
        document.querySelector("#lista-gpw tbody").innerHTML = rows.map((r, i) => `<tr data-t="${esc(r.t)}"><td class="n mut"><span class="podglad" title="Szybki podgląd" style="cursor:pointer">${OTW === r.t ? "▾" : "▸"}</span> ${i + 1}</td>
            <td class="firma"><b>${esc(r.n)}</b>${sp(r, J) === 7 ? ' <span class="jakosc">✔ Jakość 7/7</span>' : ""}${r.m.spadek_2l ? ' <span class="spadek" title="Fundamenty słabną 2 lata z rzędu">⬇</span>' : ""}${r.m.dywidenda_stabilna ? ' <span title="Dywidenda co roku przez 5 lat, bez cięcia o ponad 20 %">💰</span>' : ""}<small>${esc(r.t)} · ${esc(r.ind)} · ${esc(r.s || "")}</small></td>
            <td class="n ogolna" data-l="Ogólna">${oc(r.oceny.ogolna)}</td><td class="n" data-l="Wzrost">${oc(r.oceny.wzrost)}</td><td class="n" data-l="Siła">${oc(r.oceny.sila)}</td><td class="n" data-l="Wycena">${oc(r.oceny.wycena)}</td>
            <td class="n">${W.ok(r.m.pe) ? W.fmtNum(r.m.pe, 1) : "–"}</td><td class="n">${W.ok(r.m.peg) ? W.fmtNum(r.m.peg) : "–"}</td>
            <td>${r.et ? `<span class="pill p-${slug(r.et)}">${esc(r.et)}</span>` : "–"}</td><td class="n">${sp(r, J)}/7</td><td class="n">${sp(r, L7)}/7</td>
            <td class="n ${(r.m.zw_1r || 0) >= 0 ? "plus" : "minus"}">${W.ok(r.m.zw_1r) ? W.fmtPct(r.m.zw_1r, 0, true) : "–"}</td><td class="n">${mld(r.m.mcap)}</td></tr>${OTW === r.t ? szczegoly(r) : ""}`).join("");
        // kliknięcie: pełna karta spółki (jak w USA); ▸ w kolumnie # — szybki podgląd w wierszu
        document.querySelectorAll("#lista-gpw tbody tr[data-t]").forEach((tr) => tr.addEventListener("click", (e) => {
            if (e.target.closest(".podglad")) { OTW = OTW === tr.dataset.t ? null : tr.dataset.t; rysuj(); return; }
            location.href = `spolka.html?t=${encodeURIComponent(tr.dataset.t)}&r=gpw`;
        }));
    }
    document.querySelectorAll("#lista-gpw th[data-k]").forEach((th) => th.addEventListener("click", () => { SORT = { k: th.dataset.k, dir: SORT.k === th.dataset.k ? -SORT.dir : -1 }; rysuj(); }));
    ["q", "sektor", "ind", "jak", "sila", "bez", "dyw"].forEach((id) => $(id).addEventListener("input", rysuj));
    fetch("data/gpw.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
        ROWS = d.rows; $("asof").textContent = d.generated_at;
        $("sektor").innerHTML += [...new Set(ROWS.map((r) => r.s).filter(Boolean))].sort().map((s) => `<option>${esc(s)}</option>`).join("");
        rysuj();
    }).catch(() => { document.querySelector("#lista-gpw tbody").innerHTML = '<tr><td colspan="13" class="blad">Nie udało się wczytać danych GPW.</td></tr>'; });
})();
