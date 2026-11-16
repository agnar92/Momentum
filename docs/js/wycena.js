// Wycena — PEG i wartość wewnętrzna (fair value) z prognozy wzrostu EPS oraz tryb DCF (dane: data/wycena.json z workflow „Wycena Monthly”).
// Wzory jak w momentum/wycena.py: PEG = P/E / (100 g), wartość = EPS x 100 g, potencjał = wartość / cena - 1; DCF = dcf_value.
"use strict";

const OPT_KEY = "wycena_opt";
const DEFAULT_OPT = { mode: "peg", pegMax: 1, onlyUnder: true, minAn: 3, idx: "all", top: 20, q: "", sort: "pot", dir: -1,
    r: 9, tg: 2.5, years: 5, gmax: 25 };
const FADE = 5;   // lata wygaszania wzrostu do wzrostu końcowego (jak momentum/wycena.py DCF["fade"])

// DCF dwuetapowy (jak momentum/wycena.dcf_value): fcf, shares, cash, debt w tych samych jednostkach (mln); stopy jako ułamki
function dcfValue(fcf, shares, cash, debt, g, r, tg, years, gmax, fade = FADE) {
    if (fcf == null || fcf <= 0 || !shares || shares <= 0 || r <= tg) return null;
    const g1 = Math.min(Math.max(g == null ? 0 : g, 0), gmax);
    let pv = 0, f = fcf;
    for (let t = 1; t <= years + fade; t++) {
        const gt = t <= years ? g1 : g1 + (tg - g1) * (t - years) / fade;
        f *= 1 + gt;
        pv += f / (1 + r) ** t;
    }
    pv += f * (1 + tg) / (r - tg) / (1 + r) ** (years + fade);
    return (pv + (cash || 0) - (debt || 0)) / shares;
}
// wiersze z wartością DCF dla parametrów strony (o.r, o.tg, o.gmax w %, o.years w latach)
function withDcf(rows, o) {
    return rows.map((r) => {
        const v = dcfValue(r.fcf, r.sh, r.cash, r.debt, r.g, o.r / 100, o.tg / 100, o.years, o.gmax / 100);
        const fy = r.fcf != null && r.sh && r.c ? r.fcf / (r.sh * r.c) : null;
        return { ...r, dcf: v, dpot: v != null && r.c ? v / r.c - 1 : null, fy, gu: r.g == null ? 0 : Math.min(Math.max(r.g, 0), o.gmax / 100) };
    });
}
// filtr listy. Tryb PEG: PEG <= pegMax, wartość > cena (opcjonalnie). Tryb DCF: wartość DCF istnieje, > cena (opcjonalnie).
// Oba: min. analityków, indeks, wyszukiwanie.
function filterRows(rows, o) {
    const q = String(o.q || "").trim().toUpperCase();
    const dcf = o.mode === "dcf";
    return rows.filter((r) => (dcf ? r.dpot != null && (!o.onlyUnder || r.dpot > 0)
        : r.peg != null && r.peg <= o.pegMax && (!o.onlyUnder || (r.pot != null && r.pot > 0)))
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
// ranking po potencjale (miejsce w kolejności malejącego potencjału wśród przefiltrowanych); key = "pot" albo "dpot"
function rankMap(rows, key = "pot") {
    const m = {};
    sortRows(rows, key, -1).forEach((r, i) => { m[r.t] = i + 1; });
    return m;
}

if (typeof module !== "undefined") module.exports = { filterRows, sortRows, rankMap, dcfValue, withDcf, DEFAULT_OPT };

if (typeof document !== "undefined") {
    const $ = (id) => document.getElementById(id);
    const pct = (x, s = true) => x == null ? "–" : (s && x > 0 ? "+" : "") + (x * 100).toFixed(1).replace(".", ",") + " %";
    const num = (x, d = 2) => x == null ? "–" : x.toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d });
    const bn = (x) => x == null ? "–" : (x / 1000).toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const cls = (x) => x == null ? "" : (x > 0 ? "pos" : (x < 0 ? "neg" : ""));
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
    const load = () => { try { return { ...DEFAULT_OPT, ...JSON.parse(localStorage.getItem(OPT_KEY) || "{}"), q: "" }; } catch { return { ...DEFAULT_OPT }; } };
    const save = (o) => { try { localStorage.setItem(OPT_KEY, JSON.stringify({ ...o, q: "" })); } catch { /* brak pamięci przeglądarki */ } };
    const COLS = {
        peg: [["rank", "#", "n"], ["t", "Ticker", ""], ["pot", "Potencjał", "n"], ["c", "Cena", "n"], ["iv", "Wartość", "n"], ["peg", "PEG", "n"],
            ["g", "Wzrost EPS", "n"], ["pe", "P/E", "n"], ["eps", "EPS", "n"], ["fpeg", "Fwd PEG", "n"], ["na", "Analit.", "n"], ["n", "Spółka", ""]],
        dcf: [["rank", "#", "n"], ["t", "Ticker", ""], ["dpot", "Potencjał DCF", "n"], ["c", "Cena", "n"], ["dcf", "Wartość DCF", "n"], ["fy", "FCF yield", "n"],
            ["gu", "Wzrost w DCF", "n"], ["fcf", "FCF (mld)", "n"], ["net", "Gotówka − dług (mld)", "n"], ["pot", "Potencjał PEG", "n"], ["na", "Analit.", "n"], ["n", "Spółka", ""]],
    };
    const TIPS = { pot: "wartość z arkusza (EPS × wzrost w %) / cena − 1", iv: "fair value = EPS × wzrost w %", g: "prognoza wzrostu EPS na następny rok (analitycy)",
        eps: "EPS z ostatnich 12 miesięcy", fpeg: "cena / (EPS × (1 + wzrost)) / wzrost w %", na: "liczba analityków prognozujących następny rok",
        dpot: "wartość DCF / cena − 1", dcf: "zdyskontowane wolne przepływy + gotówka − dług, na akcję", fy: "wolne przepływy z 12 miesięcy / kapitalizacja",
        gu: "wzrost FCF w pierwszych latach: prognoza wzrostu EPS obcięta do 0 … maks.", fcf: "wolne przepływy pieniężne z 12 miesięcy, mld USD",
        net: "gotówka minus dług, mld USD" };
    const LOW_FIRST = new Set(["t", "n", "peg", "fpeg", "pe", "rank"]);
    // ostrzeżenie: bardzo wysoki prognozowany wzrost albo P/E zwykle oznacza odbicie po jednorazowo zaniżonym zysku
    const warn = (r) => (r.g != null && r.g > 1) || (r.pe != null && r.pe > 60);
    // DCF: FCF powyżej 15 % kapitalizacji to zwykle jednorazowe wpływy albo przepływy działalności finansowej (sprawdź raport)
    const warnDcf = (r) => r.fy != null && r.fy > 0.15;
    let D = null, o = load();

    function cells(r, mode) {
        if (mode === "dcf") {
            return `<td class="n ${cls(r.dpot)}"><b>${pct(r.dpot)}</b></td><td class="n">${num(r.c)}</td><td class="n">${num(r.dcf)}</td><td class="n">${pct(r.fy, false)}</td>`
                + `<td class="n">${pct(r.gu)}</td><td class="n">${bn(r.fcf)}</td><td class="n ${cls(r.net)}">${bn(r.net)}</td><td class="n ${cls(r.pot)}">${pct(r.pot)}</td>`;
        }
        return `<td class="n ${cls(r.pot)}"><b>${pct(r.pot)}</b></td><td class="n">${num(r.c)}</td><td class="n">${num(r.iv)}</td><td class="n">${num(r.peg)}</td>`
            + `<td class="n ${cls(r.g)}">${pct(r.g)}</td><td class="n">${num(r.pe, 1)}</td><td class="n">${num(r.eps)}</td><td class="n">${num(r.fpeg)}</td>`;
    }

    function draw() {
        const dcf = o.mode === "dcf", key = dcf ? "dpot" : "pot", cols = COLS[o.mode];
        if (!cols.some(([k]) => k === o.sort)) { o.sort = key; o.dir = -1; }
        const all = withDcf(D.rows, o).map((r) => ({ ...r, net: r.cash != null ? (r.cash || 0) - (r.debt || 0) : null }));
        const f = filterRows(all, o), rk = rankMap(f, key);
        const rows = o.sort === "rank" ? sortRows(f, key, -1) : sortRows(f, o.sort, o.dir);
        $("count").textContent = `${f.length} spółek spełnia warunki (z ${D.rows.length} w S&P 500 i Nasdaq‑100)`;
        $("head").innerHTML = cols.map(([k, l, c]) => `<th class="${c}"${TIPS[k] ? ` title="${TIPS[k]}"` : ""}><button type="button" class="sort" data-k="${k}">${l}${o.sort === k ? (o.dir < 0 ? " ↓" : " ↑") : ""}</button></th>`).join("");
        $("body").innerHTML = rows.map((r) => {
            const i = rk[r.t];
            const w = (!dcf && warn(r)) ? ` <span class="warn" title="Bardzo wysoki wzrost lub P/E: zwykle odbicie po jednorazowo zaniżonym zysku — wartość może być zawyżona">⚠</span>`
                : (dcf && warnDcf(r)) ? ` <span class="warn" title="FCF powyżej 15 % kapitalizacji: zwykle jednorazowe wpływy albo przepływy działalności finansowej — wartość DCF może być zawyżona">⚠</span>` : "";
            return `<tr class="${i <= o.top ? "buy" : ""}"><td class="n rank">${i}</td><td class="t">${esc(r.t)}${w}</td>${cells(r, o.mode)}<td class="n">${r.na ?? "–"}</td><td class="nm">${esc(r.n)}</td></tr>`;
        }).join("") || `<tr><td colspan="${cols.length}" class="empty">Brak spółek przy tych ustawieniach.</td></tr>`;
        document.querySelectorAll("button.sort").forEach((b) => b.addEventListener("click", () => {
            const k = b.dataset.k;
            if (o.sort === k) o.dir = -o.dir; else { o.sort = k; o.dir = LOW_FIRST.has(k) ? 1 : -1; }
            save(o); draw();
        }));
        document.querySelectorAll(".only-peg").forEach((el) => { el.hidden = dcf; });
        document.querySelectorAll(".only-dcf").forEach((el) => { el.hidden = !dcf; });
        document.querySelectorAll("#mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === o.mode)));
    }

    const FIELDS = { pegMax: [0.01, 99], minAn: [0, 99], r: [1, 30], tg: [0, 6], years: [1, 15], gmax: [0, 100] };
    function fill() {
        Object.keys(FIELDS).forEach((k) => { $(k).value = String(o[k]).replace(".", ","); });
        $("onlyUnder").checked = o.onlyUnder; $("idx").value = o.idx; $("top").value = String(o.top);
    }
    function bind() {
        const upd = () => {
            Object.entries(FIELDS).forEach(([k, [lo, hi]]) => {
                const v = parseFloat(String($(k).value).replace(",", "."));
                o[k] = Number.isFinite(v) && v >= lo && v <= hi ? v : DEFAULT_OPT[k];
            });
            if (o.r <= o.tg) o.tg = Math.max(0, o.r - 1);
            o.years = Math.round(o.years);
            o.onlyUnder = $("onlyUnder").checked; o.idx = $("idx").value; o.top = parseInt($("top").value, 10) || 0;
            o.q = $("q").value; save(o); draw();
        };
        [...Object.keys(FIELDS), "q"].forEach((id) => $(id).addEventListener("input", upd));
        ["onlyUnder", "idx", "top"].forEach((id) => $(id).addEventListener("change", upd));
        document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => {
            o.mode = b.dataset.m; o.sort = o.mode === "dcf" ? "dpot" : "pot"; o.dir = -1; save(o); draw();
        }));
        $("reset").addEventListener("click", () => { const m = o.mode; o = { ...DEFAULT_OPT, mode: m, sort: m === "dcf" ? "dpot" : "pot" }; save(o); $("q").value = ""; fill(); draw(); });
    }

    const fail = (t) => { const el = $("err"); el.hidden = false; el.textContent = t; };
    fetch("data/wycena.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then((d) => {
            D = d;
            const [y, m, dd] = d.generated_at.split("-");
            $("asof").textContent = `${dd}.${m}.${y}`;
            fill(); bind(); draw();
        })
        .catch((e) => fail(`Nie udało się wczytać data/wycena.json (${e.message}). Uruchom workflow „Wycena Monthly” w GitHub Actions.`));
}
