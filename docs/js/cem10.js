// CEM10 — miesięczna lista zakupów USA + GPW (dane: data/cem10.json z workflow „CEM10 Monthly”). Reguły jak w momentum/cem10.py.
"use strict";

const THR_USA = 0.30, THR_GPW_12M = 0.30, HOLD_KEY = "cem10_hold";

function usaCandidates(rows, lead) {
    const key = lead === "NDX" ? "nq" : "sp";
    return rows.filter((r) => r[key] && r.r6 != null && r.r6 > THR_USA && r.dist != null && r.dist > 0).sort((a, b) => b.r6 - a.r6);
}
function isC8(r) {
    return r.r3 != null && r.r12 != null && r.r3 > 0 && r.r12 > THR_GPW_12M && r.dist != null && r.dist > 0;
}
function gpwCandidates(rows) {
    return rows.filter(isC8).sort((a, b) => (b.r6 ?? -9) - (a.r6 ?? -9));
}
// "DELL, crwd;ALE  pko" -> ["DELL", "CRWD", "ALE", "PKO"]; plik JSON z tablicą albo {hold: "..."} też działa
function parseHold(text) {
    let t = String(text || "");
    try {
        const j = JSON.parse(t);
        if (Array.isArray(j)) t = j.join(" ");
        else if (j && j.hold) t = String(j.hold);
    } catch { /* zwykły tekst */ }
    return [...new Set(t.toUpperCase().split(/[\s,;]+/).filter(Boolean))];
}
// decyzja dla trzymanej spółki: brak notowań -> sprawdź; zamknięcie miesiąca pod SMA 10 -> sprzedaj
function decide(row) {
    if (!row) return "sprawdź";
    return row.dist != null && row.dist >= 0 ? "trzymaj" : "sprzedaj";
}

if (typeof module !== "undefined") module.exports = { usaCandidates, gpwCandidates, isC8, parseHold, decide };

if (typeof document !== "undefined") {
    const $ = (id) => document.getElementById(id);
    const pct = (x, s = true) => x == null ? "–" : (s && x > 0 ? "+" : "") + (x * 100).toFixed(1).replace(".", ",") + " %";
    const num = (x) => x == null ? "–" : x.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cls = (x) => x == null ? "" : (x > 0 ? "pos" : (x < 0 ? "neg" : ""));
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
    const chip = (ok, txt) => `<span class="chip ${ok === true ? "ok" : ok === false ? "no" : ""}"><span class="dot"></span>${txt}</span>`;
    const msg = (t) => { $("expMsg").textContent = t; };
    const getSaved = () => { try { return localStorage.getItem(HOLD_KEY) || ""; } catch { return ""; } };
    const setSaved = (v) => { try { localStorage.setItem(HOLD_KEY, v); } catch { /* brak pamięci przeglądarki */ } };

    function render(D) {
        const U = D.usa, G = D.gpw;
        const [y, m] = D.month.split("-");
        $("asof").textContent = `${m}.${y}`;
        $("rew").textContent = G.rewizja || "–";
        // USA
        const leadName = U.lead === "NDX" ? "Nasdaq‑100" : "S&amp;P 500";
        $("usaChips").innerHTML = chip(null, `Lider: <b>${leadName}</b>`) + chip(!U.bear, U.bear ? "Filtr rynku: <b>brak zakupów</b>" : "Filtr rynku: <b>zakupy dozwolone</b>");
        $("usaNote").innerHTML = `Zwrot 5M: SPY ${pct(U.spy5)}, QQQ ${pct(U.qqq5)}. SPY ${num(U.spy)} wobec SMA 12 ${num(U.spy_sma12)}.`;
        const usaC = usaCandidates(U.rows, U.lead);
        $("usaBuy").innerHTML = usaC.slice(0, 20).map((r, i) => `<tr class="${i < U.n && !U.bear ? "buy" : ""}"><td class="rank">${i + 1}</td><td class="t">${esc(r.t)}</td><td class="nm">${esc(r.n)}</td><td class="n ${cls(r.r6)}">${pct(r.r6)}</td><td class="n">${num(r.c)}</td><td class="n">${num(r.sma)}</td><td class="n">${pct(r.dist)}</td></tr>`).join("") || "<tr><td colspan=\"7\" class=\"empty\">Brak kandydatów.</td></tr>";
        // GPW
        $("gpwChips").innerHTML = chip(null, "Pula: <b>WIG20 + mWIG40</b>") + chip(!G.bear, G.bear ? "Filtr rynku: <b>brak zakupów</b>" : "Filtr rynku: <b>zakupy dozwolone</b>");
        $("gpwNote").innerHTML = `Bez lidera: kandydaci z obu indeksów razem. Średni zwrot 6M składników: WIG20 ${pct(G.w20_6)}, mWIG40 ${pct(G.w40_6)}. Równo ważony indeks koszyka ${G.lv.toFixed(2).replace(".", ",")} wobec SMA 12 ${G.lv12.toFixed(2).replace(".", ",")}.`;
        const gpwC = gpwCandidates(G.rows);
        $("gpwBuy").innerHTML = gpwC.slice(0, 10).map((r, i) => `<tr class="${i < G.n && !G.bear ? "buy" : ""}"><td class="rank">${i + 1}</td><td class="t">${esc(r.t)}</td><td class="nm">${esc(r.n)}</td><td class="n ${cls(r.r6)}">${pct(r.r6)}</td><td class="n ${cls(r.r3)}">${pct(r.r3)}</td><td class="n ${cls(r.r12)}">${pct(r.r12)}</td><td class="n">${num(r.c)}</td><td class="n">${num(r.sma)}</td></tr>`).join("") || "<tr><td colspan=\"8\" class=\"empty\">Brak kandydatów.</td></tr>";
        // pełne listy
        const inLead = (r) => U.lead === "NDX" ? r.nq : r.sp;
        const isCandU = (r) => r.r6 != null && r.r6 > THR_USA && r.dist > 0;
        const idxU = (r) => [r.sp ? "S&amp;P 500" : "", r.nq ? "NDX" : ""].filter(Boolean).join(", ");
        const idxG = (r) => r.w20 ? "WIG20" : "mWIG40";
        const allU = [...U.rows].sort((a, b) => (b.r6 ?? -9) - (a.r6 ?? -9)), allG = [...G.rows].sort((a, b) => (b.r6 ?? -9) - (a.r6 ?? -9));
        $("usaCount").textContent = allU.length; $("gpwCount").textContent = allG.length;
        if (U.index) {
            $("usaAllBox").querySelector("summary").innerHTML = `USA: indeks lidera z Finviz (${U.index.lead === "NDX" ? "Nasdaq‑100" : "S&amp;P 500"}, ${U.index.n} spółek) i Twoje (<span id="usaCount">${allU.length}</span>)`;
        }
        const hit = (r, q) => !q || r.t.includes(q) || r.n.toUpperCase().includes(q);
        const drawU = (q) => { q = q.trim().toUpperCase(); $("usaAll").innerHTML = allU.filter((r) => hit(r, q)).map((r) => `<tr><td class="t">${esc(r.t)}</td><td class="nm">${esc(r.n)}</td><td>${idxU(r)}</td><td class="n ${cls(r.r6)}">${pct(r.r6)}</td><td class="n">${num(r.c)}</td><td class="n">${num(r.sma)}</td><td class="n ${cls(r.dist)}">${pct(r.dist)}</td><td>${isCandU(r) ? (inLead(r) ? "tak" : "tak (drugi indeks)") : ""}</td></tr>`).join(""); };
        const drawG = (q) => { q = q.trim().toUpperCase(); $("gpwAll").innerHTML = allG.filter((r) => hit(r, q)).map((r) => `<tr><td class="t">${esc(r.t)}</td><td class="nm">${esc(r.n)}</td><td>${idxG(r)}</td><td class="n ${cls(r.r6)}">${pct(r.r6)}</td><td class="n ${cls(r.r3)}">${pct(r.r3)}</td><td class="n ${cls(r.r12)}">${pct(r.r12)}</td><td class="n">${num(r.c)}</td><td class="n ${cls(r.dist)}">${pct(r.dist)}</td><td>${isC8(r) ? "tak" : ""}</td></tr>`).join(""); };
        $("usaQ").addEventListener("input", (e) => drawU(e.target.value)); $("gpwQ").addEventListener("input", (e) => drawG(e.target.value)); drawU(""); drawG("");
        // trzymane spółki
        const map = {};
        U.rows.forEach((r) => { map[r.t] = { ...r, m: "USA", idx: idxU(r) }; });
        G.rows.forEach((r) => { if (!map[r.t]) map[r.t] = { ...r, m: "GPW", idx: idxG(r) }; });
        const drawHold = (v) => {
            const ts = parseHold(v);
            if (!ts.length) { $("holdBody").innerHTML = "<tr><td colspan=\"8\" class=\"empty\">Wpisz tickery, aby zobaczyć decyzję dla każdej spółki.</td></tr>"; return; }
            $("holdBody").innerHTML = ts.map((t) => {
                const r = map[t] || map[t.replace(".", "-")];
                if (!r) return `<tr><td class="t">${esc(t)}</td><td class="nm" colspan="6">Brak notowań tej spółki w pobranych danych. Sprawdź ticker; w wersji na komputer zapisz listę do pliku w folderze CEM10 i uruchom CEM10.bat ponownie.</td><td><span class="st s">sprawdź</span></td></tr>`;
                const d = decide(r);
                return `<tr><td class="t">${esc(r.t)}</td><td class="nm">${esc(r.n)}</td><td>${r.m} · ${r.idx}</td><td class="n">${num(r.c)}</td><td class="n">${num(r.sma)}</td><td class="n ${cls(r.dist)}">${pct(r.dist)}</td><td class="n ${cls(r.r6)}">${pct(r.r6)}</td><td><span class="st ${d === "trzymaj" ? "h" : "s"}">${d}</span></td></tr>`;
            }).join("");
        };
        const saved = getSaved();
        $("hold").value = saved; drawHold(saved);
        $("hold").addEventListener("input", (e) => { drawHold(e.target.value); setSaved(e.target.value); });
        // eksport / import
        $("expBtn").addEventListener("click", () => {
            const v = $("hold").value.trim();
            if (!v) { msg("Lista jest pusta."); return; }
            const url = URL.createObjectURL(new Blob([v + "\n"], { type: "text/plain" }));
            const a = document.createElement("a");
            a.href = url; a.download = `cem10_moje_spolki_${new Date().toISOString().slice(0, 10)}.txt`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            msg("Zapisano plik.");
        });
        $("copyBtn").addEventListener("click", async () => {
            const v = $("hold").value.trim();
            if (!v) { msg("Lista jest pusta."); return; }
            try { await navigator.clipboard.writeText(v); msg("Skopiowano. Wklej listę w notatkach."); } catch { $("hold").focus(); $("hold").select(); msg("Zaznaczyłem listę, skopiuj ją ręcznie (Ctrl+C)."); }
        });
        $("impFile").addEventListener("change", async (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const ts = parseHold(await f.text()), v = ts.join(", ");
            $("hold").value = v; drawHold(v); setSaved(v);
            msg(`Wczytano ${ts.length} tickerów.`); e.target.value = "";
        });
    }

    const fail = (t) => { const el = $("err"); el.hidden = false; el.textContent = t; };
    fetch("data/cem10.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(render)
        .catch((e) => fail(`Nie udało się wczytać data/cem10.json (${e.message}). Uruchom workflow „CEM10 Monthly” w GitHub Actions.`));
}
