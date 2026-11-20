// Wspólne, czyste funkcje strony „Fundamenta — jakość vs wycena”: formatowanie, wycena DCF / PEG (te same wzory co momentum/ocena.py),
// filtrowanie i sortowanie listy. W przeglądarce: window.W; w testach (node): module.exports.
"use strict";
(function (root) {
    const ok = (x) => x !== null && x !== undefined && Number.isFinite(x);

    function fmtPct(x, d = 1, znak = false) {
        if (!ok(x)) return "–";
        const v = (100 * x).toFixed(d).replace(".", ",");
        return (znak && x > 0 ? "+" : "") + v + " %";
    }
    function fmtNum(x, d = 2) { return ok(x) ? x.toFixed(d).replace(".", ",") : "–"; }
    function fmtUsd(x, d = 1) {
        if (!ok(x)) return "–";
        const a = Math.abs(x), s = x < 0 ? "−" : "";
        if (a >= 1e12) return s + (a / 1e12).toFixed(d).replace(".", ",") + " bln";
        if (a >= 1e9) return s + (a / 1e9).toFixed(d).replace(".", ",") + " mld";
        if (a >= 1e6) return s + (a / 1e6).toFixed(d).replace(".", ",") + " mln";
        return s + a.toFixed(2).replace(".", ",");
    }
    function fmtCena(x) { return ok(x) ? "$" + x.toFixed(2).replace(".", ",") : "–"; }

    // DCF: przychody rosną g przez `lata`, potem wzrost liniowo do tg przez `wyg` lat; FCF = przychody × marża
    function dcf(p) {
        const { rev, marza, g, akcje, gotowka = 0, dlug = 0, r = 0.10, tg = 0.03, lata = 5, wyg = 5 } = p;
        if (!ok(rev) || rev <= 0 || !ok(marza) || marza <= 0 || !ok(akcje) || akcje <= 0 || !ok(g) || r <= tg) return null;
        let pv = 0, v = rev;
        const n = lata + wyg;
        for (let t = 1; t <= n; t++) {
            const gt = t <= lata ? g : g + (tg - g) * (t - lata) / wyg;
            v *= 1 + gt;
            pv += v * marza / Math.pow(1 + r, t);
        }
        pv += v * marza * (1 + tg) / (r - tg) / Math.pow(1 + r, n);
        return (pv + (gotowka || 0) - (dlug || 0)) / akcje;
    }
    // przychody i FCF w kolejnych latach prognozy (do wykresu)
    function prognoza(p) {
        const out = []; let v = p.rev;
        for (let t = 1; t <= p.lata; t++) { v *= 1 + p.g; out.push({ rok: t, rev: v, fcf: v * p.marza }); }
        return out;
    }
    // bisekcja: jaki wzrost (lub marża) daje wartość DCF równą cenie
    function implikowane(p, cena, pole, lo, hi) {
        const f = (x) => dcf({ ...p, [pole]: x });
        if (!ok(cena) || f(lo) === null || f(hi) === null || f(lo) > cena || f(hi) < cena) return null;
        for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) > cena) hi = m; else lo = m; }
        return (lo + hi) / 2;
    }
    function scenariusze(p) {
        return { bear: dcf({ ...p, g: p.g * 0.6, marza: p.marza * 0.85 }), base: dcf(p), bull: dcf({ ...p, g: p.g * 1.2, marza: p.marza * 1.1 }) };
    }
    function pegScen(pe, g) {
        if (!ok(pe) || pe <= 0 || !ok(g) || g <= 0) return null;
        const s = (f) => ({ g: g * f, peg: pe / (100 * g * f) });
        return { bear: s(0.67), base: s(1), bull: s(1.26) };
    }
    function pegEtykieta(peg) {
        if (!ok(peg) || peg <= 0) return "–";
        return peg < 1 ? "Nisko" : peg < 2 ? "Uczciwie" : peg < 3 ? "Drogo" : "Bardzo drogo";
    }
    const ETYKIETY = [[0.40, "Bardzo tania"], [0.15, "Niedowartościowana"], [-0.15, "Wyceniona uczciwie"], [-0.40, "Droga"], [-9, "Bardzo droga"]];
    function etykieta(pot, peg) {
        if (ok(pot)) return ETYKIETY.find(([p]) => pot >= p)[1];
        if (ok(peg) && peg > 0) return peg < 1 ? "Niedowartościowana" : peg < 2 ? "Wyceniona uczciwie" : peg < 3 ? "Droga" : "Bardzo droga";
        return null;
    }
    // pozycja na pasku wyceny (0 = bardzo tania, 1 = bardzo droga) z potencjału
    function pozycjaWyceny(pot) {
        if (!ok(pot)) return null;
        const x = Math.max(-0.8, Math.min(0.8, pot));
        return 0.5 - x / 1.6;
    }
    function opisPercentyla(p) {
        if (!ok(p)) return { t: "brak danych", k: "brak" };
        const top = Math.max(1, Math.round(100 * (1 - p)));
        if (p >= 0.8) return { t: `Bardzo wysoko (top ${top} %)`, k: "b-dobrze" };
        if (p >= 0.6) return { t: `Wysoko (top ${top} %)`, k: "dobrze" };
        if (p >= 0.4) return { t: `Średnio (top ${top} %)`, k: "srednio" };
        if (p >= 0.2) return { t: `Nisko (dolne ${Math.round(100 * p)} %)`, k: "slabo" };
        return { t: `Bardzo nisko (dolne ${Math.max(1, Math.round(100 * p))} %)`, k: "b-slabo" };
    }
    function klasaOceny(o) { return !ok(o) ? "brak" : o >= 8 ? "o-swietna" : o >= 6 ? "o-dobra" : o >= 4 ? "o-srednia" : "o-slaba"; }

    // lista: filtr i sortowanie
    function filtruj(rows, f) {
        const q = (f.q || "").trim().toLowerCase();
        return rows.filter((r) => (!q || r.t.toLowerCase().includes(q) || (r.n || "").toLowerCase().includes(q))
            && (!f.sektor || r.s === f.sektor) && (!f.typ || r.typ === f.typ) && (!f.wycena || r.et === f.wycena)
            && (!f.strategia || (r.st[f.strategia] && r.st[f.strategia][0] >= (f.min || r.st[f.strategia][1])))
            && (!f.obserwowane || (f.lista || []).includes(r.t)));
    }
    const KLUCZE = {
        ogolna: (r) => r.o && r.o.ogolna, wzrost: (r) => r.o && r.o.wzrost, sila: (r) => r.o && r.o.sila, wycena: (r) => r.o && r.o.wycena,
        peg: (r) => r.peg, dcf: (r) => r.dcf_pot, zw: (r) => r.zw && r.zw["1r"], mc: (r) => r.mc, nazwa: (r) => r.n,
        lr: (r) => r.st["7/7 (niskie ryzyko)"] ? r.st["7/7 (niskie ryzyko)"][0] : null, jak: (r) => r.st["Jakość (7 kryteriów)"] ? r.st["Jakość (7 kryteriów)"][0] : null,
    };
    function sortuj(rows, klucz, kier) {
        const f = KLUCZE[klucz] || KLUCZE.ogolna;
        return [...rows].sort((a, b) => {
            const x = f(a), y = f(b);
            if (x === y) return 0;
            if (x === null || x === undefined) return 1;
            if (y === null || y === undefined) return -1;
            if (klucz === "peg") { if (x <= 0) return 1; if (y <= 0) return -1; }
            return (typeof x === "string" ? x.localeCompare(y) : x - y) * kier;
        });
    }
    // seria kwartalna -> TTM (suma 4 ostatnich) i roczna z kwartałów
    function ttmSeria(q, idx) {
        const out = [];
        for (let i = 3; i < q.length; i++) {
            const z = q.slice(i - 3, i + 1).map((x) => x[idx]);
            out.push([q[i][0], z.every(ok) ? z.reduce((a, b) => a + b, 0) : null]);
        }
        return out;
    }

    // składniki ocen (jak GRUPY w momentum/ocena.py): [pole, nazwa]
    const GRUPY = {
        wzrost: [["rev_1y", "Przychody 1 rok"], ["rev_cagr3", "Przychody 3 lata (rocznie)"], ["rev_cagr5", "Przychody 5 lat (rocznie)"], ["ni_1y", "Zysk netto 1 rok"],
            ["ni_5y", "Zysk netto 5 lat"], ["eps_next5", "Prognoza EPS 5 lat"], ["rev_lata_10", "Lata z przychodami > 10 %"]],
        sila: [["gm", "Marża brutto"], ["om", "Marża operacyjna"], ["nm", "Marża netto"], ["roe", "ROE"], ["roa", "ROA"], ["roce", "ROCE"], ["fcf_margin", "Marża FCF"],
            ["de", "Dług / kapitał (mniej = lepiej)"], ["qr", "Quick ratio"], ["net_cash_mc", "Gotówka netto / kapitalizacja"]],
        wycena: [["pe", "P/E (mniej = lepiej)"], ["peg", "PEG (mniej = lepiej)"], ["ps", "P/S (mniej = lepiej)"], ["pfcf", "P/FCF (mniej = lepiej)"],
            ["fcf_yield", "Stopa FCF"], ["dcf_pot", "Potencjał DCF"]],
    };
    // skład oceny grupy: punkty 0-100 każdego wskaźnika (percentyl w sektorze) i ocena = średnia / 10
    function skladOceny(pct, grupa) {
        const el = GRUPY[grupa].map(([p, n]) => ({ pole: p, nazwa: n, pkt: ok(pct[p]) ? Math.round(100 * pct[p]) : null }));
        const z = el.filter((x) => x.pkt !== null);
        const ocena = z.length >= 2 ? Math.round(10 * z.reduce((a, x) => a + pct[x.pole], 0) / z.length * 10) / 10 : null;
        return { el, ocena, liczone: z.length };
    }
    // miejsce w rankingu (1 = najlepsza) wg funkcji klucza wśród wierszy z wartością
    function miejsce(rows, t, f) {
        const z = rows.filter((r) => ok(f(r))).sort((a, b) => f(b) - f(a));
        const i = z.findIndex((r) => r.t === t);
        return i < 0 ? null : { miejsce: i + 1, z: z.length };
    }

    const W = { GRUPY, skladOceny, miejsce, fmtPct, fmtNum, fmtUsd, fmtCena, dcf, prognoza, implikowane, scenariusze, pegScen, pegEtykieta, etykieta, pozycjaWyceny, opisPercentyla, klasaOceny, filtruj, sortuj, ttmSeria, ok };
    if (typeof module !== "undefined" && module.exports) module.exports = W;
    else root.W = W;
})(typeof window !== "undefined" ? window : this);
