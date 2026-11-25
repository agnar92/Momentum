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
    // waluta kart: USD (domyślnie) albo zł (karta spółki GPW ustawia W.WALUTA = "zł")
    function fmtCena(x) { return !ok(x) ? "–" : (typeof W !== "undefined" && W.WALUTA === "zł") ? x.toFixed(2).replace(".", ",") + " zł" : "$" + x.toFixed(2).replace(".", ","); }

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
    // PEG Lyncha: wzrost do PEG najwyżej 25 % rocznie (Lynch nie ufał trwałości szybszego wzrostu) — tylko informacja (etap 108: limit nie poprawiał wyboru)
    const LIMIT_LYNCH = 0.25;
    function peg25(pe, g) {
        return ok(pe) && pe > 0 && ok(g) && g > 0 ? pe / (100 * Math.min(g, LIMIT_LYNCH)) : null;
    }
    function pegEtykieta(peg) {
        if (!ok(peg) || peg <= 0) return "–";
        return peg < 1 ? "Nisko" : peg < 2 ? "Uczciwie" : peg < 3 ? "Drogo" : "Bardzo drogo";
    }
    const ETYKIETY = [[0.40, "Bardzo tania"], [0.15, "Niedowartościowana"], [-0.15, "Wyceniona uczciwie"], [-0.40, "Droga"], [-9, "Bardzo droga"]];
    // etykieta jak ocena.etykieta: najpierw PEG (< 0,5 / < 1 / < 2 / < 3 / ≥ 3), zapas: potencjał DCF
    const PEG_PROGI = [[0.5, "Bardzo tania"], [1, "Niedowartościowana"], [2, "Wyceniona uczciwie"], [3, "Droga"]];
    function etykietaPeg(peg) {
        if (!ok(peg) || peg <= 0) return null;
        const z = PEG_PROGI.find(([p]) => peg < p);
        return z ? z[1] : "Bardzo droga";
    }
    function etykieta(pot, peg) {
        if (ok(peg) && peg > 0) return etykietaPeg(peg);
        if (ok(pot)) return ETYKIETY.find(([p]) => pot >= p)[1];
        return null;
    }
    // pozycja na pasku dla PEG (0 = bardzo tania, 1 = bardzo droga): skala 0–4
    function pozycjaPeg(peg) {
        if (!ok(peg) || peg <= 0) return null;
        return Math.min(1, peg / 4);
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
            && (!f.obserwowane || (f.lista || []).includes(r.t)) && (!f.jakosc || jakosc77(r)) && (!f.duzy || duzy(r)) && (!f.dyw || !!r.dw) && (!f.buffett || !!r.bf) && (!f.sila || (r.o && ok(r.o.sila) && r.o.sila >= 7)));
    }
    // znacznik jakości: spełnia wszystkie 7 kryteriów listy „Jakość” (etapy 74–75, 83)
    const JAKOSC = "Jakość (7 kryteriów)";
    const DUZY = "Duży zwycięzca (10+ lat)";
    function duzy(r) {
        const s = r && r.st && r.st[DUZY];
        return !!(s && s[0] === s[1] && s[1] > 0);
    }
    // 🏰 Przewaga Buffetta (etap 111): marża netto > 20 % w 2 latach, dług długoterminowy ≤ 4 × zysk netto, SG&A < 30 % zysku brutto
    function buffettM(m) {
        return !!(m && ok(m.bf_nm) && m.bf_nm > 0.2 && ok(m.bf_dlug_lat) && m.bf_dlug_lat <= 4 && ok(m.bf_sga_gp) && m.bf_sga_gp < 0.3);
    }
    function jakosc77(r) {
        const s = r && r.st && r.st[JAKOSC];
        return !!(s && s[0] === s[1] && s[1] > 0);
    }
    // --- portfel: budowanie pozycji wg reguły użytkownika ---------------------------------------------------------------
    // na spółkę najwyżej 10 % konta (cel); pierwszy zakup = 20 % celu, każdy kolejny = 10 % celu — najwyżej raz w miesiącu, tylko gdy spółka jest tania
    // (PEG 0–2) i kurs zmienił się o co najmniej ±7 % od ostatniego zakupu; drogo albo za mały ruch kursu → czekamy. Bez dokupu przy ⬇.
    // Punkty 0–10 (tanio, ocena, wielkość) ustalają kolejność, gdy budżet miesiąca nie wystarcza na wszystko.
    const DOKUP = { limit: 0.10, pierwszy: 0.20, kolejny: 0.10, ruch: 0.07, pegMax: 2, n: 500 };
    function punkty(r) {
        if (!r || !ok(r.peg) || r.peg <= 0 || r.peg >= DOKUP.pegMax) return null;
        const tanio = (DOKUP.pegMax - r.peg) / DOKUP.pegMax;
        const ocena = r.o && ok(r.o.ogolna) ? Math.min(1, Math.max(0, r.o.ogolna / 10)) : 0.5;
        const wielkosc = ok(r.rank) ? Math.max(0, 1 - (r.rank - 1) / DOKUP.n) : 0.5;
        return { tanio, ocena, wielkosc, punkty: 10 * (tanio + ocena + wielkosc) / 3 };
    }
    function dokup(pozycje, wiersze, opcje) {
        const o = { konto: null, budzet: null, kurs: 1, dzis: new Date().toISOString().slice(0, 10), ...(opcje || {}) };
        const kurs = ok(o.kurs) && o.kurs > 0 ? o.kurs : 1;            // waluta konta za 1 USD (IKE: PLN); konto, cel i kwoty w walucie konta, ceny akcji w USD
        const wsz = pozycje.map((p) => ({ ...p, r: wiersze[p.t] || null }));
        wsz.forEach((x) => { x.cena = x.r && ok(x.r.c) ? x.r.c : null; x.wartosc = x.cena !== null ? x.cena * kurs * (x.akcje || 0) : 0; });
        const suma = wsz.reduce((a, x) => a + x.wartosc, 0), konto = ok(o.konto) && o.konto > 0 ? o.konto : suma, cel = DOKUP.limit * konto;
        wsz.forEach((x) => {
            x.waga = konto > 0 ? x.wartosc / konto : 0; x.kwota = 0; x.plan = 0; x.powod = ""; x.uwagi = []; x.czynniki = punkty(x.r); x.mn = x.czynniki ? x.czynniki.punkty : 0;
            x.zysk = x.koszt && x.cena ? x.cena / x.koszt - 1 : null; x.cel = cel;
            const r = x.r, ref = x.ost && ok(x.ost.c) ? x.ost.c : x.koszt;
            x.ruch = ref && x.cena ? x.cena / ref - 1 : null;
            if (r && r.ow) x.uwagi.push(`❗ ostrzeżenia: ${r.ow} — sprawdź kartę`);
            if (!r || x.cena === null) { x.powod = "brak danych (spółka spoza listy 500)"; return; }
            if (r.sp) { x.powod = "⬇ fundamenty słabną 2 lata z rzędu — nie dokupuj"; return; }
            if (!x.czynniki) { x.powod = `drogo (PEG ${ok(r.peg) ? fmtNum(r.peg) : "brak"}, dokup przy 0–2) — czekam`; return; }
            if (cel <= 0) { x.powod = "podaj wartość konta"; return; }
            if (x.wartosc >= cel - 0.005) { x.powod = "pozycja pełna (10 % konta)"; return; }
            const pierwszy = !(x.akcje > 0);
            if (!pierwszy && x.ost && x.ost.d && x.ost.d.slice(0, 7) === o.dzis.slice(0, 7)) { x.powod = `już kupione w tym miesiącu (${x.ost.d})`; return; }
            if (!pierwszy && x.ruch !== null && Math.abs(x.ruch) < DOKUP.ruch) { x.powod = `kurs ${fmtPct(x.ruch, 1, true)} od ostatniego zakupu — czekam na ruch ±${Math.round(100 * DOKUP.ruch)} %`; return; }
            x.pierwszy = pierwszy;
            x.plan = Math.min((pierwszy ? DOKUP.pierwszy : DOKUP.kolejny) * cel, cel - x.wartosc);
        });
        // budżet miesiąca (opcjonalnie): najpierw spółki z największą liczbą punktów
        let zostalo = ok(o.budzet) && o.budzet >= 0 ? o.budzet : Infinity;
        wsz.filter((x) => x.plan > 0).sort((a, b) => b.mn - a.mn).forEach((x) => {
            x.kwota = Math.min(x.plan, zostalo); zostalo -= x.kwota;
            if (x.kwota < x.plan - 0.005) x.uwagi.push(x.kwota > 0 ? "część zakupu — skończył się budżet" : "brak budżetu w tym miesiącu");
        });
        wsz.forEach((x) => { x.akcjeKup = x.cena ? x.kwota / (x.cena * kurs) : 0; });
        const potrzeba = wsz.reduce((a, x) => a + x.plan, 0), razem = wsz.reduce((a, x) => a + x.kwota, 0);
        return { pozycje: wsz, suma, konto, cel, potrzeba, razem, zostaje: Number.isFinite(zostalo) ? zostalo : 0 };
    }
    // średni koszt po dokupieniu (average costing)
    const sredniKoszt = (akcje, koszt, kup, cena) => (akcje + kup > 0 ? ((akcje || 0) * (koszt || 0) + kup * cena) / ((akcje || 0) + kup) : null);
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

    // fazy rozwoju spółki — DŁUGOTERMINOWE, każda raz na cały cykl (użytkownik: „myślałem, że to fazy raz na cały cykl spółki”):
    // każdy rok obrotowy (i ostatnie 12 mies.) oceniamy z okna 3 lat, a fazy 1 → 2 → 3 → 4 tylko idą do przodu:
    //   suma zysku z 3 lat ≤ 0 — 1 Start (2 Hiperwzrost, gdy strata maleje); zysk z 3 lat > 0 — 4 Zwrot kapitału, gdy dywidendy + skup z 3 lat ≥ 20 %
    //   zysku z 3 lat; 2 Hiperwzrost, gdy przychody rosną ≥ 25 % rocznie (3 lata) przy marży < 10 %; inaczej 3 Dźwignia operacyjna;
    //   5 Schyłek — dwa lata z rzędu przychody niższe niż 5 lat wcześniej i średnia przychodów z 3 lat niższa niż z 3 poprzednich lat.
    // Wyjście ze schyłku (użytkownik: „przychody i profit powinny przebić szczyt”) dopiero, gdy przychody I typowy zysk z 3 lat (mediana) przebiją szczyty sprzed
    // schyłku; fazę liczymy wtedy od nowa z bieżących danych (Dickinson 2011: faza wynika z tego, co spółka robi teraz, nie z wieku;
    // Damodaran 2024: odrodzona spółka zachowuje się jak młodsza), a dalej znów tylko do przodu.
    // Zmiana struktury (przychody −30 % w rok bez załamania marży — wydzielenie, zmiana księgowa) nie jest schyłkiem: od tego roku historia od nowa.
    // d.ltm = ostatni punkt to 12 mies. (nakłada się na ostatni rok obrotowy, więc okno to: 12 mies. + 2 lata obrotowe przed ostatnim).
    // etapy cyklu życia firmy wg A. Damodarana („Narrative and Numbers”, 2017; pol. „Wycena firmy. Storytelling i liczby”, 2019, s. 300; „The Corporate Life Cycle”, 2024)
    const FAZY = ["Start-up", "Wczesny wzrost", "Szybki wzrost", "Dojrzały wzrost", "Dojrzała stabilizacja", "Faza schyłkowa"];
    const SCHYLEK = 6;
    function fazyLat(d) {
        const { rev, zysk, wyplaty } = d, n = rev.length, out = [];
        const suma = (a, idx) => { const v = idx.filter((j) => j >= 0 && ok(a[j])).map((j) => a[j]); return v.length ? v.reduce((x, y) => x + y, 0) : null; };
        const srednia = (a, idx) => { const v = idx.filter((j) => j >= 0 && ok(a[j])).map((j) => a[j]); return v.length >= 2 ? v.reduce((x, y) => x + y, 0) / v.length : null; };
        let maks = 0, spadekPoprz = false, schylek = false, szczytR = -Infinity, szczytZ = -Infinity, poczatek = 0, wolnoPoprz = false;
        for (let i = 0; i < n; i++) {
            const r = rev[i], ostatni12 = d.ltm && i === n - 1;
            if (!ok(r) || r <= 0) { out.push(null); continue; }
            // zmiana struktury (wydzielenie spółki, zmiana księgowa): przychody −30 % w rok przy marży ≥ 80 % poprzedniej → historię liczymy od nowa
            const rp = i > 0 ? rev[i - 1] : null, zp = i > 0 ? zysk[i - 1] : null;
            if (!ostatni12 && ok(rp) && rp > 0 && r < 0.7 * rp && ok(zp) && zp > 0 && ok(zysk[i]) && zysk[i] / r >= 0.8 * (zp / rp)) {
                poczatek = i; szczytR = -Infinity; szczytZ = -Infinity; schylek = false; spadekPoprz = false; wolnoPoprz = false;
            }
            const jest = (j) => j >= poczatek;
            const b = ostatni12 ? i - 1 : i, okno = [b - 2, b - 1, i].filter(jest), wczesniej = [b - 5, b - 4, b - 3].filter(jest);
            const r5 = jest(b - 5) && ok(rev[b - 5]) ? rev[b - 5] : null, r3 = jest(b - 3) && ok(rev[b - 3]) ? rev[b - 3] : null;
            const s3 = srednia(rev, okno), s3w = srednia(rev, wczesniej);
            const spadek = !!(s3 !== null && s3w !== null && s3 < s3w && (r5 !== null ? r < r5 : r3 !== null && r < r3));
            const z3 = suma(zysk, okno), w3 = suma(wyplaty, okno), p3 = suma(rev, okno);
            const g3 = r3 !== null && r3 > 0 ? Math.pow(r / r3, 1 / 3) - 1 : (i > 0 && ok(rev[i - 1]) && rev[i - 1] > 0 ? r / rev[i - 1] - 1 : null);
            // wolny wzrost: przychody 5 lat (zapas 3 lata) < 6 % rocznie — dojrzała stabilizacja dopiero, gdy trwa 2 lata z rzędu (cykliczne dołki nie wystarczą)
            const g5 = r5 !== null && r5 > 0 ? Math.pow(r / r5, 1 / 5) - 1 : null;
            const wolno = !!(z3 !== null && z3 > 0 && ok(g5) && g5 < 0.06 && (!ok(g3) || g3 < 0.06));
            let f = null;  // etap z bieżących danych (okno 3 lat)
            if (z3 !== null) {
                if (z3 <= 0) f = (i > 0 && ok(zysk[i - 1]) && ok(zysk[i]) && zysk[i] > zysk[i - 1]) || (ok(g3) && g3 >= 0.25) ? 2 : 1;   // strata maleje / sprzedaż szybko rośnie → wczesny wzrost
                else if (wolno && wolnoPoprz) f = 5;
                else if (ok(g3) && g3 >= 0.20) f = 3;
                else f = 4;
            }
            // „typowy” zysk z 3 lat = mediana (jeden rok z jednorazowym zyskiem nie zawyża szczytu, np. MDLZ 2015); przy 1–2 latach — średnia
            const zw = okno.filter((j) => ok(zysk[j])).map((j) => zysk[j]).sort((x, y) => x - y);
            const zs3 = zw.length >= 3 ? zw[1] : zw.length ? zw.reduce((x, y) => x + y, 0) / zw.length : null;
            if (schylek) {
                // wyjście ze schyłku: przychody i typowy zysk z 3 lat (mediana) powyżej szczytów sprzed schyłku → faza od nowa z bieżących danych
                if (r > szczytR && zs3 !== null && zs3 > szczytZ && f) { schylek = false; maks = f; out.push(f); }
                else out.push(SCHYLEK);
            } else if (spadek && (ostatni12 ? out[i - 1] === SCHYLEK || spadekPoprz : spadekPoprz)) {
                schylek = true; out.push(SCHYLEK);
            } else {
                if (f) maks = Math.max(maks, f);
                out.push(maks || null);
            }
            if (!schylek) { szczytR = Math.max(szczytR, r); if (zw.length >= 3) szczytZ = Math.max(szczytZ, zs3); }  // szczyt zysku tylko z pełnych okien 3 lat
            if (!ostatni12) { spadekPoprz = spadek; wolnoPoprz = wolno; }
        }
        return out;
    }

    // składniki ocen (jak GRUPY w momentum/ocena.py): [pole, nazwa]
    const GRUPY = {
        wzrost: [["rev_1y", "Przychody 1 rok"], ["rev_cagr3", "Przychody 3 lata (rocznie)"], ["rev_cagr5", "Przychody 5 lat (rocznie)"], ["ni_1y", "Zysk netto 1 rok"],
            ["ni_5y", "Zysk netto 5 lat"], ["eps_next5", "Prognoza EPS 5 lat"], ["rev_lata_10", "Lata z przychodami > 10 %"], ["zysk_lata", "Lata ze wzrostem zysku"], ["przysp", "Tempo przychodów (przyspiesza)"]],
        sila: [["gm", "Marża brutto"], ["om", "Marża operacyjna"], ["nm", "Marża netto"], ["roe", "ROE"], ["roa", "ROA"], ["roce", "ROCE"], ["fcf_margin", "Marża FCF"],
            ["de", "Dług / kapitał (mniej = lepiej)"], ["qr", "Quick ratio"], ["net_cash_mc", "Gotówka netto / kapitalizacja"],
            ["akcje_3l", "Zmiana liczby akcji 3 lata (mniej = lepiej)"], ["capex_przych", "Capex / przychody (mniej = lepiej)"],
            ["kapital_3l", "Wzrost kapitału własnego 3 lata (mniej = lepiej)"], ["roic", "ROIC"]],
        wycena: [["pe", "P/E (mniej = lepiej)"], ["peg", "PEG (mniej = lepiej)"], ["ps", "P/S (mniej = lepiej)"], ["pfcf", "P/FCF (mniej = lepiej)"],
            ["fcf_yield", "Stopa FCF"], ["dcf_pot", "Potencjał DCF"]],
    };
    // skład oceny grupy: punkty 0-100 każdego wskaźnika (percentyl wśród 500 spółek); brak danych = neutralne 50 pkt; ocena = średnia / 10
    const BRAK = 0.5;
    function skladOceny(pct, grupa, grupy) {
        const el = (grupy || GRUPY)[grupa].map(([p, n]) => ({ pole: p, nazwa: n, pkt: ok(pct[p]) ? Math.round(100 * pct[p]) : null }));
        const z = el.filter((x) => x.pkt !== null);
        const suma = z.reduce((a, x) => a + pct[x.pole], 0) + BRAK * (el.length - z.length);
        const ocena = z.length >= 2 ? Math.round(10 * suma / el.length * 10) / 10 : null;
        return { el, ocena, liczone: z.length };
    }
    // miejsce w rankingu (1 = najlepsza) wg funkcji klucza wśród wierszy z wartością
    // kierunek wskaźnika (jak GRUPY w ocena.py): 1 = więcej lepiej, -1 = mniej lepiej
    const KIER = { de: -1, pe: -1, peg: -1, ps: -1, pfcf: -1, akcje_3l: -1, capex_przych: -1, kapital_3l: -1 };
    const DODATNIE = ["pe", "peg", "pfcf", "ps"];
    // percentyl wartości v wśród wartości wszystkich spółek (etap 77) (jak ocena.percentyle): (mniejsze + ½ równych) / n, odwrócony dla „mniej lepiej”
    function percentyl(lst, v, pole) {
        if (!ok(v) || !lst || lst.length < 5 || (DODATNIE.includes(pole) && v <= 0)) return null;
        const mn = lst.filter((x) => x < v).length, rw = lst.filter((x) => x === v).length;
        const p = (mn + 0.5 * rw) / lst.length;
        return (KIER[pole] || 1) > 0 ? p : 1 - p;
    }
    // oceny z percentyli (jak ocena.oceny): grupy + ogólna 0,4 / 0,35 / 0,25
    function ocenyZ(pct) {
        const o = {};
        Object.keys(GRUPY).forEach((g) => { o[g] = skladOceny(pct, g).ocena; });
        const w = [["wzrost", 0.4], ["sila", 0.35], ["wycena", 0.25]].filter(([g]) => ok(o[g]));
        o.ogolna = w.length === 3 || (w.length === 2 && ok(o.wzrost)) ? Math.round(10 * w.reduce((a, [g, x]) => a + o[g] * x, 0) / w.reduce((a, [, x]) => a + x, 0)) / 10 : null;
        return o;
    }
    // pola, które użytkownik może uzupełnić sam: [pole, nazwa, jednostka] („%” = wpisywane w procentach)
    const POLA_WLASNE = [["rev_1y", "Przychody 1 rok", "%"], ["rev_cagr3", "Przychody 3 lata, rocznie", "%"], ["rev_cagr5", "Przychody 5 lat, rocznie", "%"],
        ["ni_1y", "Zysk netto 1 rok", "%"], ["ni_5y", "Zysk netto 5 lat, łącznie", "%"], ["eps_next5", "Prognoza EPS 5 lat, rocznie", "%"],
        ["rev_lata_10", "Lata z przychodami > 10 % (z 5)", ""], ["zysk_lata", "Lata ze wzrostem zysku (z 5)", ""], ["gm", "Marża brutto", "%"], ["om", "Marża operacyjna", "%"], ["nm", "Marża netto", "%"],
        ["roe", "ROE", "%"], ["roa", "ROA", "%"], ["roce", "ROCE", "%"], ["roic", "ROIC", "%"], ["fcf_margin", "Marża FCF", "%"], ["de", "Dług / kapitał", ""], ["qr", "Quick ratio", ""],
        ["net_cash_mc", "Gotówka − dług, % kapitalizacji", "%"], ["akcje_3l", "Zmiana liczby akcji 3 lata", "%"], ["capex_przych", "Capex / przychody", "%"], ["kapital_3l", "Wzrost kapitału własnego 3 lata, rocznie", "%"], ["pe", "P/E", ""], ["peg", "PEG", ""], ["ps", "P/S", ""], ["pfcf", "P/FCF", ""], ["fcf_yield", "Stopa FCF", "%"]];

    // dobra cena wg typu spółki (jak ocena.CENA_TYPU): [próg PEG lub null, opis]
    const CENA_TYPU = { "Duży zwycięzca (10+ lat)": [2.0, "PEG 1–2 to cena godziwa, poniżej 1 okazja, powyżej 2 drogo (zasada użytkownika; nie testowana — brak historii prognoz)"],
        "Stabilnie rosnąca": [1.5, "PEG ≤ 1,5 to rozsądna cena (autor); u nas najlepszy typ (mediana 5 lat 83 %); progu PEG z prognozą analityków nie mogliśmy sprawdzić"],
        "Szybko rosnąca": [1.6, "PEG ≤ 1,6, okazja poniżej 1 (autor); progu PEG z prognozą analityków nie mogliśmy sprawdzić — kluczowe, czy wzrost się utrzyma"],
        "Wolno rosnąca": [null, "autor: P/E w okolicach kilkunastu; u nas wolno rosnące z P/E ≤ 18 wypadały gorzej (43 % vs 65 % w 5 lat)"],
        "Cykliczna": [null, "autor: niskie P/E to pułapka; u nas nie było gorzej (79 % = 79 %), ale prognozy wzrostu są mało wiarygodne"],
        "Wychodząca z kłopotów": [null, "ważne: czy przetrwa (gotówka, dług) i czy plan naprawy działa"],
        "Ukryte aktywa": [null, "wartość w aktywach, nie w zyskach — wymaga cierpliwości"] };

    function miejsce(rows, t, f) {
        const z = rows.filter((r) => ok(f(r))).sort((a, b) => f(b) - f(a));
        const i = z.findIndex((r) => r.t === t);
        return i < 0 ? null : { miejsce: i + 1, z: z.length };
    }

    // motyw ciemny / jasny: przycisk w nagłówku, wybór w localStorage `fundamenta_motyw` (bez wyboru — wg systemu)
    if (typeof document !== "undefined") {
        const KM = "fundamenta_motyw", root = document.documentElement;
        const ciemny = () => root.dataset.motyw ? root.dataset.motyw === "ciemny" : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
        const przycisk = () => {
            const w = document.querySelector(".gora .w"); if (!w || document.getElementById("motyw")) return;
            const b = document.createElement("button"); b.id = "motyw"; b.className = "motyw"; b.type = "button";
            const ustaw = () => { b.textContent = ciemny() ? "☀" : "🌙"; b.title = ciemny() ? "Motyw jasny" : "Motyw ciemny"; };
            b.addEventListener("click", () => { root.dataset.motyw = ciemny() ? "jasny" : "ciemny"; try { localStorage.setItem(KM, root.dataset.motyw); } catch (e) { /* tryb prywatny */ } ustaw(); });
            ustaw(); w.appendChild(b);
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", przycisk); else przycisk();
    }
    const W = { WALUTA: "USD", buffettM, dokup, DOKUP, punkty, sredniKoszt, duzy, DUZY, CENA_TYPU, jakosc77, JAKOSC, etykietaPeg, pozycjaPeg, GRUPY, skladOceny, percentyl, ocenyZ, POLA_WLASNE, miejsce, fmtPct, fmtNum, fmtUsd, fmtCena, dcf, prognoza, implikowane, scenariusze, pegScen, pegEtykieta, etykieta, pozycjaWyceny, opisPercentyla, klasaOceny, filtruj, sortuj, ttmSeria, fazyLat, FAZY, peg25, LIMIT_LYNCH, ok };
    if (typeof module !== "undefined" && module.exports) module.exports = W;
    else root.W = W;
})(typeof window !== "undefined" ? window : this);
