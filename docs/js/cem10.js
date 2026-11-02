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
// decyzja dla trzymanej spółki: brak w indeksach -> sprawdź; zamknięcie pod SMA 10 -> sprzedaj
function decide(row) {
    if (!row) return "sprawdź";
    return row.dist != null && row.dist >= 0 ? "trzymaj" : "sprzedaj";
}

// ---- liczenie listy w przeglądarce z surowych danych (wersja na komputer: cem10_windows/cem10.ps1 -> dane.js) ----
// Ten sam wynik co cem10.py (momentum/cem10.py): zamknięte miesiące, zwroty / SMA na cenach skorygowanych, ceny pokazywane surowe.
const SMA_N = 10, MKT_N = 12, LEAD_MONTHS = 5, N_USA = 10, N_GPW = 5;
// poprzedni (ostatni zamknięty) miesiąc dla daty "YYYY-MM-DD"
function lastClosedMonth(today) {
    const [y, m] = today.split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
// świece z Yahoo (sekundy UTC + przesunięcie strefy giełdy) -> {YYYY-MM: wartość} dla miesięcy <= upto (ostatnia wartość miesiąca wygrywa).
// Świeca miesięczna zaczyna się o północy czasu giełdy, a gmtoffset jest z DZISIEJSZEJ strefy (zima / lato), więc +2 h zapasu,
// żeby północ 1. dnia miesiąca nie wypadła o 23:00 poprzedniego dnia.
function monthMap(ts, vals, off, upto) {
    const out = {};
    for (let i = 0; i < ts.length; i++) {
        const v = vals[i];
        if (v == null || !isFinite(v)) continue;
        const ym = new Date((ts[i] + (off || 0) + 7200) * 1000).toISOString().slice(0, 7);
        if (ym <= upto) out[ym] = v;
    }
    return out;
}
// odpowiedź Yahoo /v8/finance/chart (zapisana bez zmian przez cem10.ps1) -> {t, c, a, o}; dane już w tej postaci zostają
function yahooSeries(j) {
    if (!j || j.t) return j;
    const r = j.chart && j.chart.result && j.chart.result[0];
    if (!r || !r.timestamp) return null;
    const q = (r.indicators.quote || [])[0] || {}, adj = (r.indicators.adjclose || [])[0] || {};
    return { t: r.timestamp, c: q.close || [], a: adj.adjclose || q.close || [], o: (r.meta && r.meta.gmtoffset) || 0 };
}
function monthly(px, upto) {
    const out = {};
    for (const [t, j] of Object.entries(px)) {
        const s = yahooSeries(j);
        if (!s || !s.t) continue;
        const ma = monthMap(s.t, s.a, s.o, upto), mr = monthMap(s.t, s.c, s.o, upto);
        const ms = Object.keys(ma).filter((m) => m in mr).sort();
        if (ms.length && ms[ms.length - 1] === upto) out[t] = { m: ms, a: ms.map((m) => ma[m]), r: ms.map((m) => mr[m]) };
    }
    return out;
}
const ret = (c, k) => (c.length > k && c[c.length - 1 - k] ? c[c.length - 1] / c[c.length - 1 - k] - 1 : null);
const smaLast = (c, n) => (c.length >= n ? c.slice(-n).reduce((s, x) => s + x, 0) / n : null);
const rnd = (x, n = 4) => (x == null ? null : Math.round(x * 10 ** n) / 10 ** n);
function stockRow(t, name, adj, raw, flags) {
    const s = smaLast(adj, SMA_N), k = adj[adj.length - 1] ? raw[raw.length - 1] / adj[adj.length - 1] : 1;
    return { t, n: name, c: rnd(raw[raw.length - 1], 2), sma: rnd(s == null ? null : s * k, 2), dist: rnd(s == null ? null : adj[adj.length - 1] / s - 1),
        r3: rnd(ret(adj, 3)), r6: rnd(ret(adj, 6)), r12: rnd(ret(adj, 12)), ...flags };
}
function ewLevel(ser, months) {
    const lv = [1];
    let cur = 1;
    for (let i = 1; i < months.length; i++) {
        const a = months[i - 1], b = months[i], rs = [];
        for (const s of Object.values(ser)) {
            if (a in s && b in s && s[a]) { const r = s[b] / s[a] - 1; if (Math.abs(r) < 1.5) rs.push(r); }
        }
        cur *= 1 + (rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : 0);
        lv.push(cur);
    }
    return lv;
}
// surowe dane {today, members: {sp, nq}, gpw: {rewizja, WIG20, mWIG40}, px: {symbol: {t, c, a, o}}} -> to samo co docs/data/cem10.json
function computeFromRaw(raw) {
    const upto = lastClosedMonth(raw.today), m = monthly(raw.px, upto), mem = raw.members, gpw = raw.gpw;
    if (!m.SPY || !m.QQQ) throw new Error(`brak cen SPY / QQQ za ${upto}`);
    const spy = m.SPY.a, s5 = ret(spy, LEAD_MONTHS), q5 = ret(m.QQQ.a, LEAD_MONTHS), spy12 = smaLast(spy, MKT_N);
    const names = { ...mem.nq, ...mem.sp }, all = [...new Set([...Object.keys(mem.sp), ...Object.keys(mem.nq)])].sort();
    const rows = all.filter((t) => m[t] && m[t].a.length >= SMA_N).map((t) => stockRow(t, String(names[t]).slice(0, 40), m[t].a, m[t].r, { sp: t in mem.sp, nq: t in mem.nq }));
    const k = m.SPY.r[m.SPY.r.length - 1] / spy[spy.length - 1];
    const usa = { lead: q5 > s5 ? "NDX" : "SP", spy5: rnd(s5), qqq5: rnd(q5), spy: rnd(m.SPY.r[m.SPY.r.length - 1], 2), spy_sma12: rnd(spy12 * k, 2),
        bear: spy[spy.length - 1] < spy12, n: N_USA, rows, missing: (raw.requested || all).filter((t) => !rows.some((r) => r.t === t)) };
    if (raw.prefilter) { usa.prefilter = raw.prefilter; usa.all = all; }   // sito Finviz: ceny tylko dla spółek po sicie i Twoich
    const w20 = gpw.WIG20, w40 = gpw.mWIG40, gall = [...new Set([...Object.keys(w20), ...Object.keys(w40)])].sort(), grows = [], ser = {};
    for (const t of gall) {
        const s = m[t + ".WA"];
        if (!s || s.a.length < SMA_N) continue;
        grows.push(stockRow(t, String(w20[t] || w40[t]).slice(0, 40), s.a, s.r, { w20: t in w20, w40: t in w40 }));
        ser[t] = Object.fromEntries(s.m.map((x, i) => [x, s.a[i]]));
    }
    const months = [...new Set(Object.values(ser).flatMap((s) => Object.keys(s)))].sort().slice(-25), lv = ewLevel(ser, months);
    const lv12 = lv.slice(-MKT_N).reduce((a, b) => a + b, 0) / MKT_N;
    const avg6 = (ix) => { const v = grows.filter((r) => r[ix] && r.r6 != null).map((r) => r.r6); return v.length ? rnd(v.reduce((a, b) => a + b, 0) / v.length) : null; };
    const g = { w20_6: avg6("w20"), w40_6: avg6("w40"), lv: rnd(lv[lv.length - 1]), lv12: rnd(lv12), bear: lv[lv.length - 1] < lv12, n: N_GPW, rows: grows,
        rewizja: gpw.rewizja || null, missing: gall.filter((t) => !grows.some((r) => r.t === t)) };
    return { generated_at: raw.today, month: upto, usa, gpw: g };
}

if (typeof module !== "undefined") module.exports = { usaCandidates, gpwCandidates, isC8, parseHold, decide, lastClosedMonth, monthMap, yahooSeries, computeFromRaw };

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
        if (U.prefilter) {
            $("usaAllBox").querySelector("summary").innerHTML = `USA: spółki po sicie Finviz (6M &gt; +20 %: S&amp;P 500 ${U.prefilter.sp}, Nasdaq‑100 ${U.prefilter.nq}) i Twoje (<span id="usaCount">${allU.length}</span>)`;
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
                if (!r && U.all && U.all.includes(t)) return `<tr><td class="t">${esc(t)}</td><td class="nm" colspan="6">Spółka jest w S&amp;P 500 / Nasdaq‑100, ale nie przeszła sita Finviz (6M poniżej +20 %), więc nie ma jej cen. Zapisz listę do pliku w folderze CEM10 i uruchom CEM10.bat ponownie.</td><td><span class="st s">sprawdź</span></td></tr>`;
                if (!r) return `<tr><td class="t">${esc(t)}</td><td class="nm" colspan="6">Nie ma tej spółki w S&amp;P 500, Nasdaq‑100, WIG20 ani mWIG40. W USA wypadnięcie z indeksów oznacza sprzedaż; sprawdź ticker.</td><td><span class="st s">sprawdź</span></td></tr>`;
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
    if (typeof window !== "undefined" && window.CEM10_RAW) {
        // wersja na komputer: dane pobrane przez cem10_windows/CEM10.bat, liczone tutaj
        try {
            const R = window.CEM10_RAW;
            render(computeFromRaw(R));
            $("src").textContent = `Dane pobrane na tym komputerze ${R.today} (CEM10.bat; skład USA: ${R.members_src === "wikipedia" ? "Wikipedia" : "zapisany plik sklad_usa.json"}). Uruchom CEM10.bat ponownie po zamknięciu miesiąca.`;
        } catch (e) { fail(`Nie udało się policzyć listy z pobranych danych (${e.message}). Uruchom CEM10.bat ponownie.`); }
    } else {
        fetch("data/cem10.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(render)
            .catch((e) => fail(`Nie udało się wczytać data/cem10.json (${e.message}). Uruchom workflow „CEM10 Monthly” w GitHub Actions.`));
    }
}
