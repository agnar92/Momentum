// FLIP + TVOD — lista spółek (data/flip.json z workflow „FLIP Monthly”) i Twoje pozycje: plan transz ±7 % i sygnały wyjścia. Reguły: momentum/flip.py.
"use strict";

const POS_KEY = "flip_positions";
const V_GAP = 0.15;      // V: cena zakłada wzrost o ponad 15 pp wyższy, niż spółka daje
const O_GAP = 0.10;      // O: na liście jest spółka z zapasem wzrostu większym o 10 pp

// plan budowania pozycji: buys = [{price, amount}] (cena w $, kwota w zł)
function ladderPlan(buys, budget, rules) {
    const first = budget * rules.first, tr = budget * (1 - rules.first) / rules.tranches;
    const spent = buys.reduce((s, b) => s + b.amount, 0), left = Math.max(budget - spent, 0);
    if (!buys.length) return { spent: 0, left: budget, first, tranche: tr, up: null, down: null };
    const prices = buys.map((b) => b.price);
    const can = left > 0.01;
    return { spent, left, first, tranche: Math.min(tr, left), up: can ? Math.max(...prices) * (1 + rules.step) : null, down: can ? Math.min(...prices) * (1 - rules.step) : null };
}
// wartość pozycji dziś w zł (bez zmiany kursu walut): każda kwota rośnie jak cena akcji od zakupu
function valueNow(buys, price) {
    return buys.reduce((s, b) => s + b.amount * price / b.price, 0);
}
// TVOD dla pozycji: zwraca listę sygnałów [{k, txt}] i akcję dokupienia
function tvod(pos, price, row, rows, rules) {
    const out = [], plan = ladderPlan(pos.buys, pos.budget, rules);
    if (price && plan.up && price >= plan.up) out.push({ k: "KUP", txt: `kurs ${price.toFixed(2)} $ ≥ ${plan.up.toFixed(2)} $ (+7 % od najwyższego zakupu): dokup ${plan.tranche.toFixed(0)} zł` });
    if (price && plan.down && price <= plan.down) out.push({ k: "KUP", txt: `kurs ${price.toFixed(2)} $ ≤ ${plan.down.toFixed(2)} $ (−7 % od najniższego zakupu): dokup ${plan.tranche.toFixed(0)} zł` });
    if (row && row.t_state === "słabnie") out.push({ k: "T", txt: `teza: raporty słabną (${row.t_txt}) — sprawdź, czy powód zakupu jest aktualny` });
    if (row && !row.flip) out.push({ k: "T", txt: `nie przechodzi już FLIP (${Object.entries(row.checks).filter(([, v]) => !v[0]).map(([k, v]) => `${k}: ${v[1]}`).join("; ")})` });
    if (row && row.req != null && row.act != null && row.req - row.act > V_GAP) out.push({ k: "V", txt: `wycena: cena zakłada ${(row.req * 100).toFixed(0)} % wzrostu rocznie, spółka daje ok. ${(row.act * 100).toFixed(0)} %` });
    if (row && rows) {
        const best = rows.filter((r) => r.pick && r.t !== row.t && r.margin != null).sort((a, b) => b.margin - a.margin)[0];
        if (best && (row.margin == null || best.margin - row.margin > O_GAP)) out.push({ k: "O", txt: `lepsza okazja na liście: ${best.t} (zapas ${(best.margin * 100).toFixed(0)} pp wobec ${row.margin == null ? "–" : (row.margin * 100).toFixed(0) + " pp"})` });
    }
    const inv = plan.spent;
    if (price && inv > 0 && valueNow(pos.buys, price) >= 2 * inv && !pos.took) out.push({ k: "D", txt: `podwojenie: pozycja ${valueNow(pos.buys, price).toFixed(0)} zł przy włożonych ${inv.toFixed(0)} zł — wyjmij 30–50 % włożonych (${(inv * 0.3).toFixed(0)}–${(inv * 0.5).toFixed(0)} zł) albo całość` });
    return { plan, signals: out };
}
// import pozycji z pliku JSON ({positions: [...]} albo tablica)
function parsePositions(text) {
    const j = JSON.parse(text);
    const arr = Array.isArray(j) ? j : j && j.positions;
    if (!Array.isArray(arr)) throw new Error("zły format pliku");
    return arr.filter((p) => p && p.t).map((p) => ({ t: String(p.t).toUpperCase(), budget: +p.budget || 500, took: !!p.took,
        buys: (p.buys || []).filter((b) => b && +b.price > 0 && +b.amount > 0).map((b) => ({ d: b.d || "", price: +b.price, amount: +b.amount })) }));
}

if (typeof module !== "undefined") module.exports = { ladderPlan, valueNow, tvod, parsePositions };

if (typeof document !== "undefined") {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
    const pct = (x) => x == null ? "–" : (x * 100).toFixed(0) + " %";
    const num = (x, d = 1) => x == null ? "–" : Number(x).toFixed(d).replace(".", ",");
    const load = () => { try { return parsePositions(localStorage.getItem(POS_KEY) || "[]"); } catch { return []; } };
    const save = (p) => { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* brak pamięci przeglądarki */ } };
    let positions = load(), D = null;
    const light = (c) => `<span class="lt ${c[0] ? "ok" : "no"}" title="${esc(c[1])}">${c[0] ? "●" : "○"}</span>`;
    const valCls = (r) => r.margin == null ? "" : r.margin >= 0.05 ? "pos" : r.margin < -0.05 ? "neg" : "";
    const valTxt = (r) => r.margin == null ? "–" : r.margin >= 0.05 ? "zapas" : r.margin < -0.05 ? "drogo" : "pełna";
    const tCls = (s) => s === "dobre" ? "pos" : s === "słabnie" ? "neg" : "";
    function rowHtml(r, i) {
        const L = "FLIP".split("").map((k) => light(r.checks[k])).join("");
        return `<tr class="${r.pick ? "buy" : ""}" data-t="${esc(r.t)}" tabindex="0"><td class="rank">${i ?? (r.rank ?? "")}</td><td class="t">${esc(r.t)}</td><td class="nm">${esc(r.n)}</td><td class="lts">${L}</td>` +
            `<td class="${tCls(r.t_state)}">${esc(r.t_state)}</td><td class="n">${pct(r.req)}</td><td class="n">${pct(r.act)}</td><td class="n ${valCls(r)}">${valTxt(r)}</td>` +
            `<td class="n">${num(r.pfcf, 0)}</td><td class="n">${num(r.mcap, 0)}</td></tr>`;
    }
    function detail(r) {
        const c = r.checks;
        return `<b>${esc(r.t)} · ${esc(r.n)}</b> <span class="mut">(${esc(r.ind)})</span><ul>` +
            [["F – finanse", c.F], ["L – liderzy", c.L], ["I – branża", c.I], ["P – pozycja i zyski", c.P]].map(([k, v]) => `<li>${v[0] ? "✓" : "✗"} <b>${k}:</b> ${esc(v[1])}</li>`).join("") +
            `<li><b>T – ostatni raport</b> (${esc(r.quarter || "–")}): ${esc(r.t_txt)}</li>` +
            `<li><b>Wycena:</b> P/FCF ${num(r.pfcf, 0)} — cena zakłada wzrost wolnej gotówki ok. ${pct(r.req)} rocznie przez 10 lat; spółka rośnie ok. ${pct(r.act)} (sprzedaż 5 lat ${num(r.s5, 0)} %, prognoza EPS 5 lat ${num(r.e5, 0)} %).</li></ul>` +
            `<a href="https://finviz.com/quote.ashx?t=${encodeURIComponent(r.t)}" target="_blank" rel="noopener">Finviz</a>`;
    }
    function bindRows(tbodyId, boxId) {
        $(tbodyId).addEventListener("click", (e) => {
            const tr = e.target.closest("tr[data-t]"); if (!tr) return;
            const r = D.rows.find((x) => x.t === tr.dataset.t); const box = $(boxId);
            box.innerHTML = detail(r); box.hidden = false; box.scrollIntoView({ block: "nearest" });
        });
    }
    function renderLists() {
        $("asof").textContent = D.generated_at;
        const picks = D.rows.filter((r) => r.pick);
        $("pickBody").innerHTML = picks.map((r, i) => rowHtml(r, i + 1)).join("") || "<tr><td colspan=\"10\" class=\"empty\">Brak spółek z czterema zielonymi literami.</td></tr>";
        $("pickNote").textContent = `${picks.length} z ${D.rules.top} miejsc: tyle spółek przechodzi FLIP i ma dobre lub neutralne raporty. ` +
            `Wszystkich z czterema zielonymi literami: ${D.rows.filter((r) => r.flip).length}; sprawdzonych kandydatów: ${D.rows.length} (z ${D.n_large} spółek > 10 mld $).`;
        const draw = () => {
            const q = $("q").value.trim().toUpperCase(), only = $("onlyFlip").checked;
            $("allBody").innerHTML = D.rows.filter((r) => (!only || r.flip) && (!q || r.t.includes(q) || r.n.toUpperCase().includes(q) || (r.ind || "").toUpperCase().includes(q)))
                .map((r) => rowHtml(r)).join("");
        };
        $("q").addEventListener("input", draw); $("onlyFlip").addEventListener("change", draw); draw();
        bindRows("pickBody", "pickDetail"); bindRows("allBody", "allDetail");
    }
    // ---- moje pozycje
    function renderPositions() {
        const byT = Object.fromEntries((D ? D.rows : []).map((r) => [r.t, r]));
        const R = D ? D.rules : { first: 0.4, tranches: 10, step: 0.07 };
        $("posList").innerHTML = positions.map((p, i) => {
            const price = D && D.prices[p.t], row = byT[p.t], res = tvod(p, price, row, D && D.rows, R), pl = res.plan;
            const val = price && p.buys.length ? valueNow(p.buys, price) : null;
            const buys = p.buys.map((b, j) => `<li>${esc(b.d)} ${num(b.price, 2)} $ · ${num(b.amount, 0)} zł <button type="button" class="x" data-i="${i}" data-j="${j}" aria-label="Usuń zakup">✕</button></li>`).join("");
            const sig = res.signals.map((s) => `<li class="sig ${s.k === "KUP" ? "k" : "w"}"><b>${s.k}</b> ${esc(s.txt)}</li>`).join("") || "<li class=\"sig ok\">Bez sygnałów: trzymaj i czekaj na ruch ±7 %.</li>";
            return `<div class="pos"><div class="phead"><b class="t">${esc(p.t)}</b><span class="mut">${row ? esc(row.n) : "spoza listy FLIP"}</span>` +
                `<button type="button" class="sec del" data-i="${i}">Usuń pozycję</button></div>` +
                `<div class="pgrid"><div><dt>Budżet</dt><dd>${num(p.budget, 0)} zł</dd></div><div><dt>Włożone</dt><dd>${num(pl.spent, 0)} zł</dd></div><div><dt>Zostało</dt><dd>${num(pl.left, 0)} zł</dd></div>` +
                `<div><dt>Wartość dziś</dt><dd>${val == null ? "–" : num(val, 0) + " zł"}</dd></div><div><dt>Kurs</dt><dd>${price ? num(price, 2) + " $" : "–"}</dd></div>` +
                `<div><dt>Następny zakup</dt><dd>${pl.up ? "≥ " + num(pl.up, 2) + " $ lub ≤ " + num(pl.down, 2) + " $" : (p.buys.length ? "budżet wykorzystany" : "pierwszy: " + num(pl.first, 0) + " zł")}</dd></div>` +
                `<div><dt>Transza</dt><dd>${num(pl.tranche, 0)} zł</dd></div></div>` +
                `<ul class="sigs">${sig}</ul><details><summary>Zakupy (${p.buys.length})</summary><ul class="buys">${buys}</ul>` +
                `<form class="addbuy" data-i="${i}"><input type="date" name="d" aria-label="Data"><input type="number" step="0.01" min="0" name="price" placeholder="cena $" aria-label="Cena w dolarach" required>` +
                `<input type="number" step="1" min="1" name="amount" placeholder="kwota zł" aria-label="Kwota w złotych" value="${Math.round(p.buys.length ? pl.tranche : pl.first)}" required><button type="submit">Dodaj zakup</button></form>` +
                `<label class="mut"><input type="checkbox" class="took" data-i="${i}" ${p.took ? "checked" : ""}> włożone pieniądze już wyjęte (sygnał D wyłączony)</label></details></div>`;
        }).join("") || "<p class=\"empty\">Brak pozycji. Dodaj spółkę poniżej.</p>";
    }
    function bindPositions() {
        $("posList").addEventListener("click", (e) => {
            const b = e.target.closest("button"); if (!b) return;
            if (b.classList.contains("del")) { if (window.confirm("Usunąć pozycję?")) { positions.splice(+b.dataset.i, 1); save(positions); renderPositions(); } }
            if (b.classList.contains("x")) { positions[+b.dataset.i].buys.splice(+b.dataset.j, 1); save(positions); renderPositions(); }
        });
        $("posList").addEventListener("change", (e) => {
            if (e.target.classList.contains("took")) { positions[+e.target.dataset.i].took = e.target.checked; save(positions); renderPositions(); }
        });
        $("posList").addEventListener("submit", (e) => {
            e.preventDefault(); const f = e.target, i = +f.dataset.i;
            positions[i].buys.push({ d: f.d.value || new Date().toISOString().slice(0, 10), price: +f.price.value, amount: +f.amount.value });
            save(positions); renderPositions();
        });
        $("addPos").addEventListener("submit", (e) => {
            e.preventDefault(); const t = $("newT").value.trim().toUpperCase(); if (!t) return;
            positions.push({ t, budget: +$("newB").value || 500, buys: [], took: false }); save(positions); $("newT").value = ""; renderPositions();
        });
        const msg = (t) => { $("posMsg").textContent = t; };
        $("expBtn").addEventListener("click", () => {
            const url = URL.createObjectURL(new Blob([JSON.stringify({ positions }, null, 1)], { type: "application/json" }));
            const a = document.createElement("a"); a.href = url; a.download = `flip_pozycje_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); msg("Zapisano plik.");
        });
        $("impFile").addEventListener("change", async (e) => {
            const f = e.target.files && e.target.files[0]; if (!f) return;
            try { positions = parsePositions(await f.text()); save(positions); renderPositions(); msg(`Wczytano ${positions.length} pozycji.`); } catch (err) { msg(`Nie wczytano: ${err.message}`); }
            e.target.value = "";
        });
    }
    $("tickers").innerHTML = "";
    bindPositions(); renderPositions();
    fetch("data/flip.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then((d) => { D = d; renderLists(); renderPositions(); $("tickers").innerHTML = Object.keys(d.prices).map((t) => `<option value="${esc(t)}">`).join(""); })
        .catch((e) => { const el = $("err"); el.hidden = false; el.textContent = `Nie udało się wczytać data/flip.json (${e.message}). Uruchom workflow „FLIP Monthly” w GitHub Actions.`; });
}
