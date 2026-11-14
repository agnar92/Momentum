// Ranking jakości — długoterminowy wybór spółek raz w roku (dane: data/quality.json z workflow „Quality Yearly”). Reguły w momentum/quality.py.
"use strict";

const NOTES_KEY = "quality_notes";
const QUESTIONS = [
    "Rozumiem ten biznes: wiem, kto płaci, za co i dlaczego nie odejdzie do konkurencji.",
    "Ma fosę: markę, koszt zmiany, efekt sieci, przewagę kosztową albo licencję.",
    "Zarząd dobrze wydaje gotówkę: reinwestuje przy wysokim ROIC, skupuje akcje, bez drogich przejęć.",
    "Cena jest rozsądna: FCF yield + realny wzrost daje co najmniej ~9 % rocznie.",
];
// kolumny tabeli rankingu: [klucz, nagłówek, format, kierunek domyślnego sortowania (-1 = malejąco)]
const COLS = [
    ["rank", "#", "i", 1], ["t", "Ticker", "s", 1], ["n", "Spółka", "s", 1], ["sector", "Sektor", "s", 1], ["score", "Wynik", "x", -1],
    ["q", "Jakość", "b", -1], ["v", "Wycena", "b", -1], ["g", "Wzrost", "b", -1], ["b", "Kapitał", "b", -1],
    ["roic_hits", "ROIC ≥ 15 %", "h", -1], ["roic_med", "ROIC med.", "p", -1], ["gm_med", "Marża brutto", "p", -1],
    ["fcf_yield", "FCF yield", "p", -1], ["rev_cagr", "Przychody / rok", "p", -1], ["sh_cagr", "Akcje / rok", "p", 1],
    ["exp_ret", "Oczek. zwrot", "p", -1], ["fosa", "Fosa (AI)", "s", 1],
];

function val(r, k) {
    if (k === "fosa") return r.ai ? r.ai.fosa : null;
    return ["q", "v", "g", "b"].includes(k) ? (r.pts || {})[k] : r[k];
}
// podpowiedzi do 4 pytań: [{ok: true/false/null, src: "liczby" | "AI", text}] na pytanie; pytania 1–2 tylko z AI, 3 z liczb + AI, 4 z liczb
function hints(r) {
    const a = r.ai, au = r.auto || {}, out = [[], [], [], []];
    const okOf = (v, good, bad) => v === good ? true : v === bad ? false : null;
    if (a) {
        out[0].push({ ok: null, src: "AI", text: a.biznes });
        out[1].push({ ok: okOf(a.fosa, "silna", "brak"), src: "AI", text: `fosa: ${a.fosa}${a.fosa_typ && a.fosa_typ.length ? " (" + a.fosa_typ.join(", ") + ")" : ""}. ${a.fosa_why || ""}`.trim() });
    }
    if (au.q3) out[2].push({ ok: au.q3.ok, src: "liczby", text: au.q3.why });
    if (a) out[2].push({ ok: okOf(a.zarzad, "dobry", "zły"), src: "AI", text: `zarząd: ${a.zarzad}. ${a.zarzad_why || ""}`.trim() });
    if (au.q4) out[3].push({ ok: au.q4.ok, src: "liczby", text: au.q4.why + (au.q4.ok === false ? " (poniżej 9 %)" : "") });
    return out;
}
// sortowanie: brakujące wartości zawsze na końcu
function sortRows(rows, key, dir) {
    return [...rows].sort((a, b) => {
        const x = val(a, key), y = val(b, key);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        if (typeof x === "string") return dir * x.localeCompare(y, "pl");
        return dir * (x - y);
    });
}
const pct = (x, d = 1) => x == null ? "–" : (x * 100).toFixed(d).replace(".", ",") + " %";
const num = (x, d = 1) => x == null ? "–" : x.toFixed(d).replace(".", ",");
function fmt(r, k, f) {
    const v = val(r, k);
    if (f === "p") return pct(v);
    if (f === "x" || f === "b") return v == null ? "–" : Math.round(v);
    if (f === "h") return v == null ? "–" : `${v}/10`;
    return v == null ? "–" : String(v);
}
// mini wykres słupkowy lat -> SVG; thr = linia progu (np. ROIC 15 %), good = słupek ≥ thr na zielono
function barsSvg(hist, key, opt = {}) {
    const W = 300, H = 96, pad = 16, vals = hist.map((h) => h[key]);
    const ok = vals.filter((v) => v != null);
    if (!ok.length) return "<p class=\"mut\">brak danych</p>";
    const hi = Math.max(0, opt.thr ?? 0, ...ok), lo = Math.min(0, ...ok), span = hi - lo || 1;
    const y = (v) => pad + (hi - v) / span * (H - 2 * pad), bw = (W - 8) / hist.length;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opt.label || key}" class="bars">`;
    s += `<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="axis"/>`;
    hist.forEach((h, i) => {
        const v = h[key], x = 4 + i * bw;
        if (v != null) {
            const c = opt.thr == null ? "bar" : (v >= opt.thr ? "bar good" : "bar weak");
            s += `<rect x="${(x + bw * 0.15).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" y="${Math.min(y(v), y(0)).toFixed(1)}" height="${Math.max(1, Math.abs(y(v) - y(0))).toFixed(1)}" class="${c}"><title>${h.y}: ${opt.fmt ? opt.fmt(v) : v}</title></rect>`;
        }
        if (i === 0 || i === hist.length - 1) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 2}" text-anchor="middle" class="lbl">${h.y}</text>`;
    });
    if (opt.thr != null) s += `<line x1="0" x2="${W}" y1="${y(opt.thr)}" y2="${y(opt.thr)}" class="thr"/>`;
    const last = ok[ok.length - 1];
    s += `<text x="${W - 2}" y="11" text-anchor="end" class="lbl">ost. ${opt.fmt ? opt.fmt(last) : last}</text>`;
    return s + "</svg>";
}
// notatki: {ticker: {q: [bool x4], thesis: "..."}}; import z pliku JSON scala z istniejącymi
function mergeNotes(cur, text) {
    const j = JSON.parse(text);
    const src = j && j.notes ? j.notes : j;
    if (!src || typeof src !== "object" || Array.isArray(src)) throw new Error("zły format pliku");
    const out = { ...cur };
    for (const [t, n] of Object.entries(src)) {
        if (n && typeof n === "object") out[t.toUpperCase()] = { q: Array.isArray(n.q) ? n.q.slice(0, 4).map(Boolean) : [], thesis: String(n.thesis || "") };
    }
    return out;
}

if (typeof module !== "undefined") module.exports = { sortRows, barsSvg, mergeNotes, fmt, val, hints };

if (typeof document !== "undefined") {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
    const loadNotes = () => { try { return JSON.parse(localStorage.getItem(NOTES_KEY) || "{}") || {}; } catch { return {}; } };
    const saveNotes = (n) => { try { localStorage.setItem(NOTES_KEY, JSON.stringify(n)); } catch { /* brak pamięci przeglądarki */ } };
    let notes = loadNotes();
    const done = (t) => { const n = notes[t]; return n ? (n.q || []).filter(Boolean).length : 0; };
    const msg = (t) => { $("expMsg").textContent = t; };
    const bn = (x) => x == null ? "–" : (Math.abs(x) >= 1e9 ? num(x / 1e9, 1) + " mld" : num(x / 1e6, 0) + " mln");

    function render(D) {
        $("asof").textContent = D.generated_at;
        $("meta").innerHTML = `Sito Finviz: ${D.finviz_total ?? "?"} spółek, z oceną ${D.n}, pominięte ${D.skipped.length}. ` +
            `<a href="https://finviz.com/screener.ashx?v=161&amp;f=${esc(D.filters)}" target="_blank" rel="noopener">Otwórz sito w Finviz</a>.`;
        const byT = Object.fromEntries(D.rows.map((r) => [r.t, r]));
        const head = (cols) => cols.map(([k, h, f]) => `<th data-k="${k}" class="${"pxbhi".includes(f) ? "n" : ""}" tabindex="0" aria-sort="none">${h}</th>`).join("");
        const cells = (r, cols) => cols.map(([k, , f]) => {
            const c = k === "t" ? "t" : k === "n" ? "nm" : "pxbhi".includes(f) ? "n" : "";
            return `<td class="${c}">${k === "t" ? esc(r.t) + (done(r.t) ? ` <span class="nd" title="pytania z analizy: ${done(r.t)}/4">${done(r.t)}/4</span>` : "") : esc(fmt(r, k, f))}</td>`;
        }).join("");
        // top 10
        const top = D.top.map((t) => byT[t]);
        $("topHead").innerHTML = head(COLS);
        $("topBody").innerHTML = top.map((r) => `<tr class="buy" data-t="${esc(r.t)}" tabindex="0">${cells(r, COLS)}</tr>`).join("");
        // pełny ranking
        let key = "rank", dir = 1;
        $("allHead").innerHTML = head(COLS);
        $("allCount").textContent = D.rows.length;
        const drawAll = () => {
            const q = $("q").value.trim().toUpperCase();
            const rows = sortRows(D.rows, key, dir).filter((r) => !q || r.t.includes(q) || r.n.toUpperCase().includes(q) || (r.sector || "").toUpperCase().includes(q));
            $("allBody").innerHTML = rows.map((r) => `<tr class="${r.top ? "buy" : ""}" data-t="${esc(r.t)}" tabindex="0">${cells(r, COLS)}</tr>`).join("") || "<tr><td colspan=\"15\" class=\"empty\">Brak spółek.</td></tr>";
            $("allHead").querySelectorAll("th").forEach((th) => th.setAttribute("aria-sort", th.dataset.k === key ? (dir > 0 ? "ascending" : "descending") : "none"));
        };
        const sortBy = (k) => {
            if (k === key) dir = -dir;
            else { key = k; dir = COLS.find((c) => c[0] === k)[3]; }
            drawAll();
        };
        $("allHead").addEventListener("click", (e) => { const th = e.target.closest("th"); if (th) sortBy(th.dataset.k); });
        $("allHead").addEventListener("keydown", (e) => { const th = e.target.closest("th"); if (th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); sortBy(th.dataset.k); } });
        $("q").addEventListener("input", drawAll);
        drawAll();
        // pominięte
        $("skipCount").textContent = D.skipped.length;
        $("skipBody").innerHTML = D.skipped.map((s) => `<tr><td class="t">${esc(s.t)}</td><td class="nm">${esc(s.n)}</td><td>${esc(s.sector)}</td><td>${esc(s.why)}</td></tr>`).join("");
        // wagi
        $("weights").innerHTML = Object.entries(D.blocks).map(([b, name]) => {
            const ws = D.weights.filter((w) => w.b === b);
            return `<li><b>${esc(name)} (${ws.reduce((s, w) => s + w.w, 0)} %):</b> ${ws.map((w) => `${WNAME[w.k] || w.k} ${w.w}${w.d < 0 ? " (mniej = lepiej)" : ""}`).join(", ")}</li>`;
        }).join("");
        // karta spółki
        const open = (t) => {
            const r = byT[t];
            if (!r) return;
            $("cTitle").textContent = `${r.t} · ${r.n}`;
            $("cSub").textContent = `${r.sector || ""} · ${r.industry || ""} · miejsce ${r.rank} z ${D.rows.length}${r.top ? " · TOP 10" : ""}`;
            $("cChips").innerHTML = [["Wynik", r.score], ...Object.entries(D.blocks).map(([b, nme]) => [nme, (r.pts || {})[b]])]
                .map(([k, v]) => `<span class="chip"><b>${esc(k)}</b> ${v == null ? "–" : Math.round(v)}</span>`).join("");
            const h = r.hist || [];
            $("cCharts").innerHTML = [
                ["ROIC (próg 15 %)", barsSvg(h, "roic", { thr: 0.15, fmt: pct, label: "ROIC" }), `${r.roic_hits}/10 lat ≥ 15 %, mediana ${pct(r.roic_med)}, ost. 3 lata ${pct(r.roic_recent)}`],
                ["Marża brutto", barsSvg(h, "gm", { fmt: pct, label: "marża brutto" }), `mediana ${pct(r.gm_med)}, rozrzut ±${pct(r.gm_sd)}`],
                ["Marża FCF", barsSvg(h, "fcfm", { fmt: pct, label: "marża FCF" }), `mediana ${pct(r.fcfm_med)}, FCF / zysk netto ${pct(r.fcf_conv, 0)}`],
                ["Przychody", barsSvg(h, "rev", { fmt: bn, label: "przychody" }), `${pct(r.rev_cagr)} rocznie (${r.years} lat)`],
                ["Liczba akcji", barsSvg(h, "sh", { fmt: bn, label: "liczba akcji" }), r.sh_cagr == null ? "–" : `${pct(r.sh_cagr)} rocznie (${r.sh_cagr < 0 ? "skup akcji" : "rozwodnienie"})`],
            ].map(([t, svg, cap]) => `<figure><figcaption><b>${t}</b><span class="mut">${cap}</span></figcaption>${svg}</figure>`).join("");
            $("cNums").innerHTML = [["P/FCF", num(r.pfcf)], ["FCF yield", pct(r.fcf_yield)], ["Forward P/E", num(r.fwd_pe)], ["P/E", num(r.pe)],
                ["Wzrost EPS 5 l. (prognoza)", pct(r.est_lt)], ["Debt/Eq", num(r.debt_eq, 2)], ["Current ratio", num(r.cur_ratio, 2)],
                ["Kapitalizacja", r.mcap == null ? "–" : num(r.mcap / 1000, 1) + " mld $"]]
                .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
            $("cLinks").innerHTML = `<a href="https://finviz.com/quote.ashx?t=${encodeURIComponent(r.t)}" target="_blank" rel="noopener">Finviz</a> · ` +
                `<a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;type=10-K&amp;CIK=${encodeURIComponent(r.t)}" target="_blank" rel="noopener">Raporty 10-K (SEC)</a> · ` +
                `<a href="https://stockanalysis.com/stocks/${encodeURIComponent(r.t.toLowerCase())}/financials/" target="_blank" rel="noopener">Stock Analysis</a>`;
            const n = notes[r.t] || {}; n.q = n.q || [];
            const hs = hints(r), mark = (ok) => ok === true ? "✓" : ok === false ? "✗" : "•";
            $("cQs").innerHTML = QUESTIONS.map((q, i) => `<div class="qrow"><label><input type="checkbox" data-i="${i}" ${n.q[i] ? "checked" : ""}> ${q}</label>` +
                hs[i].map((h) => `<p class="hint ${h.ok === true ? "ok" : h.ok === false ? "no" : ""}"><b>${mark(h.ok)} ${h.src}:</b> ${esc(h.text)}</p>`).join("") + "</div>").join("");
            const a = r.ai;
            $("cAi").hidden = !a;
            $("cAi").innerHTML = a ? `<p><b>Ryzyka (AI):</b> ${esc((a.ryzyka || []).join(" · ") || "–")}</p><p><b>Teza (AI):</b> ${esc(a.teza || "–")}</p>` +
                `<p class="mut">Podpowiedź ${esc(a.model || "AI")} z ${esc(a.at)}. Model może się mylić albo mieć nieaktualną wiedzę; zaznacz pytanie dopiero, gdy sam to sprawdzisz.</p>` +
                "<button type=\"button\" class=\"sec\" id=\"cUseAi\">Wstaw tezę AI do swojej tezy</button>" : "";
            if (a) $("cUseAi").addEventListener("click", () => { const t = $("cThesis"); t.value = (t.value.trim() ? t.value.trim() + "\n" : "") + a.teza; saveCard(); });
            $("cThesis").value = n.thesis || "";
            $("card").dataset.t = r.t;
            $("card").showModal();
            document.body.classList.add("modal");          // iOS: strona pod kartą się nie przewija
        };
        const saveCard = () => {
            const t = $("card").dataset.t;
            const q = [...$("cQs").querySelectorAll("input")].map((x) => x.checked);
            const thesis = $("cThesis").value;
            if (!q.some(Boolean) && !thesis.trim()) delete notes[t]; else notes[t] = { q, thesis };
            saveNotes(notes);
        };
        $("cQs").addEventListener("change", saveCard);
        $("cThesis").addEventListener("input", saveCard);
        $("card").addEventListener("close", () => {
            document.body.classList.remove("modal"); $("topBody").innerHTML = top.map((r) => `<tr class="buy" data-t="${esc(r.t)}" tabindex="0">${cells(r, COLS)}</tr>`).join(""); drawAll(); });
        $("cClose").addEventListener("click", () => $("card").close());
        for (const id of ["topBody", "allBody"]) {
            $(id).addEventListener("click", (e) => { const tr = e.target.closest("tr[data-t]"); if (tr) open(tr.dataset.t); });
            $(id).addEventListener("keydown", (e) => { const tr = e.target.closest("tr[data-t]"); if (tr && e.key === "Enter") open(tr.dataset.t); });
        }
        // eksport / import
        const download = (name, text, type) => {
            const url = URL.createObjectURL(new Blob([text], { type }));
            const a = document.createElement("a");
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        const day = new Date().toISOString().slice(0, 10);
        $("copyTop").addEventListener("click", async () => {
            const v = D.top.join(", ");
            try { await navigator.clipboard.writeText(v); msg(`Skopiowano: ${v}`); } catch { msg(v); }
        });
        $("csvBtn").addEventListener("click", () => {
            const keys = ["rank", "t", "n", "sector", "score", "q", "v", "g", "b", "roic_hits", "roic_med", "gm_med", "fcfm_med", "fcf_yield", "rev_cagr", "sh_cagr", "pfcf", "fwd_pe", "debt_eq", "top"];
            const q = (x) => { const s = x == null ? "" : String(x); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s; };
            const lines = [keys.join(";"), ...D.rows.map((r) => keys.map((k) => q(val(r, k))).join(";"))];
            download(`ranking_jakosci_${D.generated_at}.csv`, lines.join("\n") + "\n", "text/csv");
            msg("Zapisano ranking (CSV, separator ;).");
        });
        $("notesBtn").addEventListener("click", () => {
            download(`ranking_jakosci_notatki_${day}.json`, JSON.stringify({ notes }, null, 1), "application/json");
            msg(`Zapisano notatki (${Object.keys(notes).length} spółek).`);
        });
        $("impFile").addEventListener("change", async (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            try { notes = mergeNotes(notes, await f.text()); saveNotes(notes); drawAll(); msg(`Wczytano notatki (${Object.keys(notes).length} spółek).`); } catch (err) { msg(`Nie wczytano: ${err.message}`); }
            e.target.value = "";
        });
    }
    const WNAME = {
        roic_hits: "lata z ROIC ≥ 15 %", roic_med: "mediana ROIC", roic_recent: "ROIC ost. 3 lata", gm_med: "mediana marży brutto", gm_sd: "rozrzut marży brutto",
        fcfm_med: "mediana marży FCF", fcf_conv: "FCF / zysk netto", fcf_yield: "FCF yield (1 / P/FCF)", fwd_ey: "1 / Forward P/E", ey: "1 / P/E",
        rev_cagr: "wzrost przychodów rocznie", est_lt: "prognoza wzrostu EPS 5 lat", sh_cagr: "zmiana liczby akcji", debt_eq: "Debt/Eq", cur_ratio: "current ratio",
    };

    fetch("data/quality.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(render)
        .catch((e) => { const el = $("err"); el.hidden = false; el.textContent = `Nie udało się wczytać data/quality.json (${e.message}). Uruchom workflow „Quality Yearly” w GitHub Actions.`; });
}
