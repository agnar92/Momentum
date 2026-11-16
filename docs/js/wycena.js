// Wycena — PEG i wartość wewnętrzna (fair value) z prognozy wzrostu EPS (dane: data/wycena.json z workflow „Wycena Monthly”).
// Wzory jak w momentum/wycena.py: PEG = P/E / (100 g), wartość = EPS x 100 g, potencjał = wartość / cena - 1.
"use strict";

const OPT_KEY = "wycena_opt";
const DEFAULT_OPT = { pegMax: 1, onlyUnder: true, minAn: 3, idx: "all", top: 20, q: "", sort: "pot", dir: -1 };

// filtr listy: PEG <= pegMax, wartość > cena (opcjonalnie), min. analityków, indeks, wyszukiwanie
function filterRows(rows, o) {
    const q = String(o.q || "").trim().toUpperCase();
    return rows.filter((r) => r.peg != null && r.peg <= o.pegMax
        && (!o.onlyUnder || (r.pot != null && r.pot > 0))
        && (r.na || 0) >= o.minAn
        && (o.idx === "all" || (o.idx === "sp" ? r.sp : r.nq))
        && (!q || r.t.includes(q) || String(r.n).toUpperCase().includes(q)));
}
// sortowanie po kolumnie; puste wartości zawsze na końcu
function sortRows(rows, key, dir) {
    return [...rows].sort((a, b) => {
        const x = a[key], y = b[key];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        if (typeof x === "string") return dir * x.localeCompare(y);
        return dir * (x - y);
    });
}
// ranking po potencjale (miejsce w kolejności malejącego potencjału wśród przefiltrowanych)
function rankMap(rows) {
    const m = {};
    sortRows(rows, "pot", -1).forEach((r, i) => { m[r.t] = i + 1; });
    return m;
}

if (typeof module !== "undefined") module.exports = { filterRows, sortRows, rankMap, DEFAULT_OPT };

if (typeof document !== "undefined") {
    const $ = (id) => document.getElementById(id);
    const pct = (x, s = true) => x == null ? "–" : (s && x > 0 ? "+" : "") + (x * 100).toFixed(1).replace(".", ",") + " %";
    const num = (x, d = 2) => x == null ? "–" : x.toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d });
    const cls = (x) => x == null ? "" : (x > 0 ? "pos" : (x < 0 ? "neg" : ""));
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
    const load = () => { try { return { ...DEFAULT_OPT, ...JSON.parse(localStorage.getItem(OPT_KEY) || "{}"), q: "" }; } catch { return { ...DEFAULT_OPT }; } };
    const save = (o) => { try { localStorage.setItem(OPT_KEY, JSON.stringify({ ...o, q: "" })); } catch { /* brak pamięci przeglądarki */ } };
    const COLS = [["rank", "#", "n"], ["t", "Ticker", ""], ["pot", "Potencjał", "n"], ["c", "Cena", "n"], ["iv", "Wartość", "n"], ["peg", "PEG", "n"],
        ["g", "Wzrost EPS", "n"], ["pe", "P/E", "n"], ["eps", "EPS", "n"], ["fpeg", "Fwd PEG", "n"], ["na", "Analit.", "n"], ["n", "Spółka", ""]];
    const TIPS = { pot: "wartość / cena − 1", iv: "fair value = EPS × wzrost w %", g: "prognoza wzrostu EPS na następny rok (analitycy)", eps: "EPS z ostatnich 12 miesięcy",
        fpeg: "cena / (EPS × (1 + wzrost)) / wzrost w %", na: "liczba analityków prognozujących następny rok" };
    // ostrzeżenie: bardzo wysoki prognozowany wzrost albo P/E zwykle oznacza odbicie po jednorazowo zaniżonym zysku
    const warn = (r) => (r.g != null && r.g > 1) || (r.pe != null && r.pe > 60);
    let D = null, o = load();

    function draw() {
        const f = filterRows(D.rows, o), rk = rankMap(f);
        const rows = o.sort === "rank" ? sortRows(f, "pot", -1) : sortRows(f, o.sort, o.dir);
        $("count").textContent = `${f.length} spółek spełnia warunki (z ${D.rows.length} w S&P 500 i Nasdaq‑100)`;
        $("head").innerHTML = COLS.map(([k, l, c]) => `<th class="${c}"${TIPS[k] ? ` title="${TIPS[k]}"` : ""}><button type="button" class="sort" data-k="${k}">${l}${o.sort === k ? (o.dir < 0 ? " ↓" : " ↑") : ""}</button></th>`).join("");
        $("body").innerHTML = rows.map((r) => {
            const i = rk[r.t];
            const w = warn(r) ? ` <span class="warn" title="Bardzo wysoki wzrost lub P/E: zwykle odbicie po jednorazowo zaniżonym zysku — wartość może być zawyżona">⚠</span>` : "";
            return `<tr class="${i <= o.top ? "buy" : ""}"><td class="n rank">${i}</td><td class="t">${esc(r.t)}${w}</td><td class="n ${cls(r.pot)}"><b>${pct(r.pot)}</b></td>`
                + `<td class="n">${num(r.c)}</td><td class="n">${num(r.iv)}</td><td class="n">${num(r.peg)}</td><td class="n ${cls(r.g)}">${pct(r.g)}</td>`
                + `<td class="n">${num(r.pe, 1)}</td><td class="n">${num(r.eps)}</td><td class="n">${num(r.fpeg)}</td><td class="n">${r.na ?? "–"}</td><td class="nm">${esc(r.n)}</td></tr>`;
        }).join("") || `<tr><td colspan="${COLS.length}" class="empty">Brak spółek przy tych ustawieniach.</td></tr>`;
        document.querySelectorAll("button.sort").forEach((b) => b.addEventListener("click", () => {
            const k = b.dataset.k;
            if (o.sort === k) o.dir = -o.dir; else { o.sort = k; o.dir = (k === "t" || k === "n" || k === "peg" || k === "fpeg" || k === "pe" || k === "rank") ? 1 : -1; }
            save(o); draw();
        }));
    }

    function bind() {
        $("pegMax").value = o.pegMax; $("onlyUnder").checked = o.onlyUnder; $("minAn").value = o.minAn; $("idx").value = o.idx; $("top").value = String(o.top);
        const upd = () => {
            const p = parseFloat(String($("pegMax").value).replace(",", "."));
            o.pegMax = Number.isFinite(p) && p > 0 ? p : DEFAULT_OPT.pegMax;
            o.onlyUnder = $("onlyUnder").checked; o.minAn = parseInt($("minAn").value, 10) || 0; o.idx = $("idx").value; o.top = parseInt($("top").value, 10) || 0;
            o.q = $("q").value; save(o); draw();
        };
        ["pegMax", "minAn", "q"].forEach((id) => $(id).addEventListener("input", upd));
        ["onlyUnder", "idx", "top"].forEach((id) => $(id).addEventListener("change", upd));
        $("reset").addEventListener("click", () => { o = { ...DEFAULT_OPT }; save(o); $("q").value = ""; bind(); draw(); });
    }

    const fail = (t) => { const el = $("err"); el.hidden = false; el.textContent = t; };
    fetch("data/wycena.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then((d) => {
            D = d;
            const [y, m, dd] = d.generated_at.split("-");
            $("asof").textContent = `${dd}.${m}.${y}`;
            bind(); draw();
        })
        .catch((e) => fail(`Nie udało się wczytać data/wycena.json (${e.message}). Uruchom workflow „Wycena Monthly” w GitHub Actions.`));
}
