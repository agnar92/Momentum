"""Ocena spółki: wskaźniki wzrostu / siły finansowej / wyceny, oceny 0-10 względem sektora, typ spółki (kategorie Lyncha),
dopasowanie do strategii z badania oraz wycena PEG i DCF (te same wzory co docs/js/wspolne.js). Czyste funkcje, bez sieci."""
import datetime as dt
import math
from . import fundamenty as F

SEKTORY_WYKL = {"Financial", "Basic Materials", "Energy", "Utilities", "Real Estate"}   # trudne do przewidzenia — poza listą (spolki.wybierz)
DCF = dict(r=0.10, tg=0.03, lata=5, wygaszanie=5)


def _f(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def _r(x, n=4):
    return None if x is None else round(x, n)


def metryki(ex, fv, dzis=None, splity=()):
    """ex = fundamenty.wyciag(...) (może być {}), fv = wiersz Finviz -> (wskaźniki, historia do wykresów)."""
    if ex.get("rev"):   # nieaktualne raporty SEC (ostatnie przychody > 550 dni temu, np. TM / HMC przestały składać XBRL) -> jak brak danych SEC
        ost = max(r[1] for rows in ex["rev"].values() for r in rows)
        if (dzis or dt.date.today()) - F.D(ost) > dt.timedelta(days=550):
            ex = {}
    p = _f(fv.get("price"))
    pe = _f(fv.get("PE"))
    mc = _f(fv.get("marketCap"))
    m = dict(price=p, mcap=mc * 1e6 if mc else None, pe=pe, fpe=_f(fv.get("forwardPE")), ps=_f(fv.get("PS")), pb=_f(fv.get("PB")),
             pc=_f(fv.get("PC")), pfcf=_f(fv.get("PFCF")), div=_pct(fv.get("dividendYield")), eps_next5=_pct(fv.get("estLTGrowth")),
             eps_ny=_pct(fv.get("epsYoY1")), gm=_pct(fv.get("grossMargin")), om=_pct(fv.get("operMargin")), nm=_pct(fv.get("netMargin")),
             roe=_pct(fv.get("roe")), roa=_pct(fv.get("roa")), roic=_pct(fv.get("roi")), cr=_f(fv.get("curRatio")), qr=_f(fv.get("quickRatio")),
             de=_f(fv.get("debtEq")), eps=p / pe if p and pe and pe > 0 else None)
    m["peg"] = pe / (100 * m["eps_next5"]) if pe and pe > 0 and m["eps_next5"] and m["eps_next5"] > 0 else None
    hist = dict(q=[], y=[])
    q = {k: F.polacz(ex[k], F.kwartalne, k == "rev") for k in ("rev", "ni", "op", "ocf", "capex", "sbc", "skup", "emisja") if ex.get(k)}
    rt = F.ttm(q["rev"]) if "rev" in q else []
    nt = F.ttm(q["ni"]) if "ni" in q else []
    # emitenci zagraniczni (20-F) raportują tylko rocznie: punkty roczne zamiast TTM, jeśli są świeże (<= 15 mies.)
    ra = list(F.polacz(ex["rev"], F.roczne, True).items()) if ex.get("rev") else []
    if (not rt or (ra and F.D(ra[-1][0]) > F.D(rt[-1][0]) + dt.timedelta(days=200))) and len(ra) >= 2:
        rt = ra
        na = list(F.polacz(ex["ni"], F.roczne).items()) if ex.get("ni") else []
        nt = na if len(na) >= 2 else nt
    ot = F.ttm(q["op"]) if "op" in q else []
    fq = {e: q["ocf"][e] - q.get("capex", {}).get(e, 0.0) for e in q.get("ocf", {})}
    ft = F.ttm(fq) if fq else []
    if rt and ra and rt[-1][0] == ra[-1][0] and rt is ra:     # tryb roczny (MSSF / 20-F): zysk operacyjny i FCF też z lat obrotowych
        e = ra[-1][0]
        oa = F.polacz(ex["op"], F.roczne) if ex.get("op") else {}
        if oa.get(e) is not None and (not ot or ot[-1][0] < e):
            ot = list(oa.items())
        ca, xa = (F.polacz(ex[k], F.roczne) if ex.get(k) else {} for k in ("ocf", "capex"))
        if ca.get(e) is not None and (not ft or ft[-1][0] < e):
            ft = [(d, v - xa.get(d, 0.0)) for d, v in ca.items()]
    if rt:
        e, r0 = rt[-1]
        m["rev_ttm"] = r0
        for lat, k in ((1, "rev_1y"), (3, "rev_3y"), (5, "rev_5y")):
            a = F.wartosc_lata_temu(rt, e, lat)
            m[k] = r0 / a - 1 if a and a > 0 else None
        m["rev_cagr3"] = F.cagr(F.wartosc_lata_temu(rt, e, 3), r0, 3)
        m["rev_cagr5"] = F.cagr(F.wartosc_lata_temu(rt, e, 5), r0, 5)
        lq = list(q["rev"].items())
        if len(lq) >= 5:
            ea, va = lq[-1]
            ya = [v for ee, v in lq if abs((F.D(ea) - F.D(ee)).days - 365) <= 45]
            m["rev_q_yoy"] = va / ya[-1] - 1 if ya and ya[-1] > 0 else None
        lata = []
        for k in range(5):
            a, b = F.wartosc_lata_temu(rt, e, k + 1), F.wartosc_lata_temu(rt, e, k) if k else r0
            if a and b and a > 0:
                lata.append(b / a - 1)
        m["rev_lata_10"] = sum(x > 0.10 for x in lata) if len(lata) == 5 else None
        m["rev_lata"] = [_r(x) for x in lata]
    if nt:
        e, n0 = nt[-1]
        m["ni_ttm"] = n0
        for lat, k in ((1, "ni_1y"), (3, "ni_3y"), (5, "ni_5y")):
            a = F.wartosc_lata_temu(nt, e, lat)
            m[k] = n0 / a - 1 if a and a > 0 and n0 > 0 else None
    # reguła użytkownika: fundamenty słabną 2 lata z rzędu (przychody lub zysk TTM r/r < 0 teraz i rok wcześniej) — etap 77: −4 pp w 5 lat
    def _rr(seria, lat):
        if not seria:
            return None
        e, v = seria[-1]
        a = F.wartosc_lata_temu(seria, e, lat) if lat else v
        b = F.wartosc_lata_temu(seria, e, lat + 1)
        return a / b - 1 if a is not None and b and b > 0 else None
    spadki = []
    for nazwa, s in (("przychody", rt), ("zysk netto", nt)):
        r0, r1 = _rr(s, 0), _rr(s, 1)
        if r0 is not None and r1 is not None and r0 < 0 and r1 < 0:
            spadki.append(nazwa)
    m["spadek_2l"] = spadki or None
    # etap 76: lata ze wzrostem zysku netto (z 5) — zysk TTM wyższy niż rok wcześniej
    if nt:
        e, n0 = nt[-1]
        zl = [F.wartosc_lata_temu(nt, e, k) if k else n0 for k in range(6)]
        if all(x is not None for x in zl):
            m["zysk_lata"] = sum(zl[k] > zl[k + 1] for k in range(5))
    if ft:
        m["fcf_ttm"] = ft[-1][1]
        m["fcf_margin"] = ft[-1][1] / m["rev_ttm"] if m.get("rev_ttm") else None
    # wynagrodzenia w akcjach (SBC) — koszt dla akcjonariuszy pominięty w FCF; do ostrożnego DCF (FCF − SBC)
    st = F.ttm(q["sbc"]) if "sbc" in q else []
    if st and m.get("rev_ttm") and rt and abs((F.D(st[-1][0]) - F.D(rt[-1][0])).days) <= 100:
        m["sbc_ttm"] = st[-1][1]
    elif ex.get("sbc") and m.get("rev_ttm") and rt:
        sa = F.polacz(ex["sbc"], F.roczne)
        if sa and abs((F.D(list(sa)[-1]) - F.D(rt[-1][0])).days) <= 200:
            m["sbc_ttm"] = list(sa.values())[-1]
    m["sbc_przych"] = m["sbc_ttm"] / m["rev_ttm"] if m.get("sbc_ttm") is not None and m.get("rev_ttm") else None
    # etap 79: capex / przychody (12 mies.; mniej = lżejszy kapitałowo model) — zapas: ostatni rok obrotowy
    ct = F.ttm(q["capex"]) if "capex" in q else []
    if ct and m.get("rev_ttm") and abs((F.D(ct[-1][0]) - F.D(rt[-1][0])).days) <= 100:
        m["capex_przych"] = ct[-1][1] / m["rev_ttm"]
    elif ex.get("capex") and m.get("rev_ttm"):
        ca_ = F.polacz(ex["capex"], F.roczne)
        if ca_ and rt and abs((F.D(list(ca_)[-1]) - F.D(rt[-1][0])).days) <= 200:
            m["capex_przych"] = list(ca_.values())[-1] / m["rev_ttm"]
    # bilans: ostatni znany i sprzed 5 lat
    ch = {k: F.polacz(ex[k], F.chwilowe) for k in ("cash", "sti", "eq", "assets", "lc") if ex.get(k)}
    if ch.get("eq"):
        e = list(ch["eq"])[-1]
        m["cash"] = (ch.get("cash", {}).get(e) or 0) + (ch.get("sti", {}).get(e) or 0)
        m["debt"] = F.dlug(ex.get("debt", {}), e)
        # leasing operacyjny (zobowiązanie) — do długu w DCF
        ls = {k: F.polacz(ex[k], F.chwilowe) for k in ("lease", "lease_nc", "lease_c") if ex.get(k)}

        def bliskie(k):
            return next((v for dd_, v in sorted(ls.get(k, {}).items(), reverse=True) if abs((F.D(dd_) - F.D(e)).days) <= 100), None)
        lt = bliskie("lease")
        if lt is None and bliskie("lease_nc") is not None:
            lt = bliskie("lease_nc") + (bliskie("lease_c") or 0)
        m["leasing"] = lt
        if not m["cash"]:
            m["cash"] = None
        m["equity"] = ch["eq"][e]
        e3 = F.wartosc_lata_temu(list(ch["eq"].items()), e, 3)       # etap 79: szybki wzrost kapitału (emisje, przejęcia) = gorzej
        m["kapital_3l"] = (m["equity"] / e3) ** (1 / 3) - 1 if e3 and e3 > 0 and m["equity"] > 0 else None
        m["net_cash"] = m["cash"] - m["debt"] if m["cash"] is not None else None
        a, lc = ch.get("assets", {}).get(e), ch.get("lc", {}).get(e)
        m["aktywa"] = a
        if ot and a and lc is not None and a - lc > 0:
            m["roce"] = ot[-1][1] / (a - lc)
        if nt and m["equity"] and m["equity"] > 0:
            m["roe_sec"] = nt[-1][1] / m["equity"]
            # ROE sprzed 3 lat; młodsza spółka: z najstarszego punktu (min. 1 rok wstecz), dla którego są zysk i kapitał
            eqs = list(ch["eq"].items())
            for lat in (3, 2.5, 2, 1.5, 1):
                eqw, nw = F.wartosc_lata_temu(eqs, e, lat), F.wartosc_lata_temu(nt, nt[-1][0], lat)
                if eqw and eqw > 0 and nw is not None:
                    m["roe_wcz"], m["roe_wcz_lat"] = nw / eqw, lat
                    break
    # zapas z Finviz (spółki bez raportów us-gaap, np. emitenci zagraniczni 20-F)
    s5, e5 = _pct(fv.get("sales5Years")), _pct(fv.get("eps5Years"))
    if m.get("rev_cagr5") is None and s5 is not None:
        m["rev_cagr5"] = s5
        m["rev_5y"] = (1 + s5) ** 5 - 1 if s5 > -1 else None
        m["zrodlo_wzrostu"] = "Finviz"
    if m.get("ni_5y") is None and e5 is not None and e5 > -1:
        m["ni_5y"] = (1 + e5) ** 5 - 1
    if m.get("ni_1y") is None:
        m["ni_1y"] = _pct(fv.get("epsYoY"))
    if m.get("fcf_ttm") is None and m.get("mcap") and m.get("pfcf"):
        m["fcf_ttm"] = m["mcap"] / m["pfcf"]
    if m.get("mcap") and m.get("pc"):                       # gotówka + inwestycje krótkoterminowe wg Finviz; gdy SEC ma niepełne tagi (np. zmiana nazwy)
        c_fv = m["mcap"] / m["pc"]
        if m.get("cash") is None or c_fv > 1.2 * m["cash"]:
            m["cash"] = c_fv
            if m.get("debt") is not None:
                m["net_cash"] = m["cash"] - m["debt"]
    if m.get("mcap") and m.get("pb") and m.get("pb") > 0 and m.get("de") is not None:   # dług wg Finviz, gdy SEC go nie ma / zaniża (np. Ford: dług w spółce finansowej)
        d_fv = m["de"] * m["mcap"] / m["pb"]
        if m.get("debt") is None or m["debt"] < 0.5 * d_fv:
            m["debt"] = d_fv
            if m.get("cash") is not None:
                m["net_cash"] = m["cash"] - m["debt"]
    if m.get("net_cash") is None and m.get("cash") is not None and m.get("debt") is not None:
        m["net_cash"] = m["cash"] - m["debt"] if m["cash"] is not None else None
    if m.get("rev_ttm") is None and m.get("mcap") and m.get("ps"):
        m["rev_ttm"] = m["mcap"] / m["ps"]
    if m.get("fcf_margin") is None and m.get("fcf_ttm") and m.get("rev_ttm"):
        m["fcf_margin"] = m["fcf_ttm"] / m["rev_ttm"]
    sh = F.chwilowe(ex.get("shares", [])) if ex.get("shares") else {}
    m["akcje_3l"] = zmiana_akcji(sh, splity)
    if m["akcje_3l"] is None and ex.get("sh_dil"):    # spółki bez dei (kilka klas akcji): średnia rozwodniona liczba akcji, kwartały / lata
        dil = {}
        for s_, e_, v_, f_ in sorted(ex["sh_dil"], key=lambda r: r[3]):
            if (80 <= (F.D(e_) - F.D(s_)).days <= 100 or 350 <= (F.D(e_) - F.D(s_)).days <= 380) and e_ not in dil:
                dil[e_] = v_
        m["akcje_3l"] = zmiana_akcji(dict(sorted(dil.items())), splity)
    s_fv = m["mcap"] / p if m.get("mcap") and p else None
    # liczba akcji do DCF = kapitalizacja ÷ cena (spójna z ceną: wartość na akcję porównujemy z kursem; dei bywa jedną klasą akcji, ADR ma inny przelicznik —
    # np. BABA, QSR, UPS); zapas: dei z SEC
    m["shares"] = s_fv if s_fv else (list(sh.values())[-1] if sh else None)
    # wskaźniki przepływów (filmy autora HelloStocks: 4 filtry przepływów pieniężnych) — 12 mies. zgodne z przychodami, zapas: ostatni rok obrotowy
    def ost12(k):
        tt = F.ttm(q[k]) if k in q else []
        if tt and rt and abs((F.D(tt[-1][0]) - F.D(rt[-1][0])).days) <= 100:
            return tt[-1][1]
        if ex.get(k) and rt:
            ya = F.polacz(ex[k], F.roczne)
            if ya and abs((F.D(list(ya)[-1]) - F.D(rt[-1][0])).days) <= 200:
                return list(ya.values())[-1]
        return None
    ocf, cpx, skup, emis = ost12("ocf"), ost12("capex"), ost12("skup"), ost12("emisja")
    m["ocf_ttm"] = ocf
    if ocf is not None and m.get("debt") is not None:
        m["ocf_dlug"] = ocf / m["debt"] if m["debt"] > 0 else (9.99 if ocf > 0 else None)      # brak długu = spełnione
    m["capex_ocf"] = cpx / ocf if cpx is not None and ocf and ocf > 0 else None
    if m.get("mcap") and (skup is not None or emis is not None) and ex.get("skup"):
        m["skup_netto_mc"] = ((skup or 0) - (emis or 0)) / m["mcap"]
    m["fcf_aktywa"] = m["fcf_ttm"] / m["aktywa"] if m.get("fcf_ttm") is not None and m.get("aktywa") else None
    # rampa capex (etap 86): capex ≥ 2 × capex sprzed 2 lat i ≥ 5 % przychodów; „bogata” = przepływy operacyjne sprzed 2 lat ≥ 3 × ówczesny capex
    ya = {k: F.polacz(ex[k], F.roczne) for k in ("ocf", "capex") if ex.get(k)}
    if ya.get("capex") and ya.get("ocf") and m.get("rev_ttm"):
        ce = list(ya["capex"].items())
        e0, c0 = ce[-1]
        c2 = next((v for d_, v in ce if abs((F.D(d_) - (F.D(e0) - dt.timedelta(days=730))).days) <= 60), None)
        o2 = next((v for d_, v in ya["ocf"].items() if abs((F.D(d_) - (F.D(e0) - dt.timedelta(days=730))).days) <= 60), None)
        if c2 and c2 > 0 and c0 >= 2 * c2 and c0 >= 0.05 * m["rev_ttm"]:
            m["rampa_capex"] = dict(x=c0 / c2, przych=c0 / m["rev_ttm"], bogata=bool(o2 is not None and o2 >= 3 * c2))
    # historia do wykresów: ostatnie 40 kwartałów i lata obrotowe
    ends = sorted(set(q.get("rev", {})) | set(q.get("ni", {})))[-40:]
    for e in ends:
        hist["q"].append([e, _r(q.get("rev", {}).get(e), 0), _r(q.get("ni", {}).get(e), 0), _r(fq.get(e), 0),
                          _r((ch.get("cash", {}).get(e) or 0) + (ch.get("sti", {}).get(e) or 0) if ch.get("cash", {}).get(e) is not None else None, 0),
                          _r(F.dlug(ex.get("debt", {}), e) if ch.get("eq", {}).get(e) is not None else None, 0)])
    yr = {k: F.polacz(ex[k], F.roczne, k == "rev") for k in ("rev", "ni", "ocf", "capex", "sbc") if ex.get(k)}
    for e in list(yr.get("rev", {}))[-12:]:
        ocf, cx = yr.get("ocf", {}).get(e), yr.get("capex", {}).get(e, 0.0)
        hist["y"].append([e, _r(yr["rev"][e], 0), _r(yr.get("ni", {}).get(e), 0), _r(ocf - cx if ocf is not None else None, 0), _r(yr.get("sbc", {}).get(e), 0)])
    return m, hist


def zmiana_akcji(sh, splity=()):
    """Etap 76: zmiana liczby akcji w 3 lata (ujemna = skup, dodatnia = rozwodnienie), skorygowana o splity [(data, mnożnik)]."""
    if not sh:
        return None
    pkt = sorted(sh.items())
    e0, s0 = pkt[-1]
    cel = F.D(e0) - dt.timedelta(days=round(3 * 365.25))
    z = [(e, v) for e, v in pkt if abs((F.D(e) - cel).days) <= 120]
    if not z or not s0:
        return None
    e3, s3 = min(z, key=lambda x: abs((F.D(x[0]) - cel).days))
    mn = 1.0
    for d, r in splity or ():
        if F.D(e3) < F.D(d) <= F.D(e0) and r > 0:
            mn *= r
    zm = s0 / (s3 * mn) - 1 if s3 and s3 > 0 else None
    return zm if zm is not None and -0.6 < zm < 3 else None


def rozklady(rows):
    """{"wszystkie": {pole: posortowane wartości}} — do przeliczenia oceny w przeglądarce, gdy użytkownik wpisze brakujące dane."""
    out = {}
    for g, pola in GRUPY.items():
        for p, _ in pola:
            for r in rows:
                v = r["m"].get(p)
                if v is not None and not (p in ("pe", "peg", "pfcf", "ps") and v <= 0):
                    out.setdefault("wszystkie", {}).setdefault(p, []).append(round(v, 4))
    return {s: {p: sorted(v) for p, v in d.items() if len(v) >= 5} for s, d in out.items()}


def _pct(x):
    x = _f(x)
    return None if x is None else x / 100


# --- oceny względem sektora --------------------------------------------------------------------------------------
GRUPY = {
    "wzrost": [("rev_1y", 1), ("rev_cagr3", 1), ("rev_cagr5", 1), ("ni_1y", 1), ("ni_5y", 1), ("eps_next5", 1), ("rev_lata_10", 1), ("zysk_lata", 1)],
    "sila": [("gm", 1), ("om", 1), ("nm", 1), ("roe", 1), ("roa", 1), ("roce", 1), ("fcf_margin", 1), ("de", -1), ("qr", 1), ("net_cash_mc", 1),
             ("akcje_3l", -1), ("capex_przych", -1), ("kapital_3l", -1)],
    "wycena": [("pe", -1), ("peg", -1), ("ps", -1), ("pfcf", -1), ("fcf_yield", 1), ("dcf_pot", 1)],
}


def percentyle(rows, pole, kier, grupa=None):
    """Dla każdego wiersza: percentyl wartości `pole` wśród wszystkich spółek (grupa=None; etap 77, decyzja użytkownika: odniesienie do całej 500)
    albo w jego grupie (np. grupa="sector"); 0..1, 1 = najlepiej wg kierunku, None gdy brak."""
    klucz = (lambda r: r[grupa]) if grupa else (lambda r: "wszystkie")
    od_sek = {}
    for r in rows:
        v = r["m"].get(pole)
        if v is not None and not (pole in ("pe", "peg", "pfcf", "ps") and v <= 0):
            od_sek.setdefault(klucz(r), []).append(v)
    out = []
    for r in rows:
        v = r["m"].get(pole)
        lst = od_sek.get(klucz(r), [])
        if v is None or len(lst) < 5 or (pole in ("pe", "peg", "pfcf", "ps") and v <= 0):
            out.append(None)
            continue
        mn = sum(x < v for x in lst)
        rw = sum(x == v for x in lst)
        pr = (mn + 0.5 * rw) / len(lst)
        out.append(pr if kier > 0 else 1 - pr)
    return out


BRAK = 0.5                       # punkty (percentyl) za wskaźnik bez danych
POLA_MEDIAN = [p for pola in GRUPY.values() for p, _ in pola] + ["fpe", "pb", "div", "roic"]


def mediany(rows):
    """{pole: mediana wszystkich spółek} — punkt odniesienia przy każdym wskaźniku na karcie (użytkownik: odniesienie do innych akcji, nie do sektorów)."""
    out = {}
    for p in POLA_MEDIAN:
        v = sorted(r["m"][p] for r in rows if r["m"].get(p) is not None and not (p in ("pe", "fpe", "peg", "pfcf", "ps", "pb") and r["m"][p] <= 0))
        out[p] = (v[len(v) // 2] if len(v) % 2 else (v[len(v) // 2 - 1] + v[len(v) // 2]) / 2) if len(v) >= 5 else None
    return out


def oceny(rows):
    """Uzupełnia r['pct'] (percentyle wskaźników), r['oceny'] (wzrost, siła, wycena, ogólna; 0-10) i r['med500'] (mediany wszystkich spółek)."""
    for r in rows:
        m = r["m"]
        m["net_cash_mc"] = m["net_cash"] / m["mcap"] if m.get("net_cash") is not None and m.get("mcap") else None
        m["fcf_yield"] = m["fcf_ttm"] / m["mcap"] if m.get("fcf_ttm") is not None and m.get("mcap") else None
        r["pct"] = {}
    for g, pola in GRUPY.items():
        for pole, kier in pola:
            for r, p in zip(rows, percentyle(rows, pole, kier)):
                r["pct"][pole] = p
    wszystkie = sum(len(p) for p in GRUPY.values())
    for r in rows:
        n = sum(1 for g, pola in GRUPY.items() for p, _ in pola if r["pct"].get(p) is not None)
        o = {}
        for g, pola in GRUPY.items():
            v = [r["pct"][p] for p, _ in pola if r["pct"].get(p) is not None]
            # brak danych = neutralne 50 pkt (środek sektora): brakujące wskaźniki nie zawyżają ani nie zaniżają oceny
            o[g] = round(10 * (sum(v) + BRAK * (len(pola) - len(v))) / len(pola), 1) if len(v) >= 2 else None
        w = [(o[g], wg) for g, wg in (("wzrost", 0.4), ("sila", 0.35), ("wycena", 0.25)) if o[g] is not None]
        o["ogolna"] = round(sum(a * b for a, b in w) / sum(b for _, b in w), 1) if len(w) == 3 or (len(w) == 2 and o["wzrost"] is not None) else None
        r["oceny"] = o
        # niepełne dane (młoda spółka, emitent zagraniczny bez raportów us-gaap): < 75 % wskaźników albo w którejś kategorii < 60 % jej wskaźników
        slabe = [g for g, pola in GRUPY.items() if sum(1 for p, _ in pola if r["pct"].get(p) is not None) < 0.6 * len(pola)]
        r["kompletnosc"] = dict(liczone=n, wszystkie=wszystkie, niepelne=n < 0.75 * wszystkie or bool(slabe), kategorie=slabe)
    med = mediany(rows)
    for r in rows:
        r["med500"] = med
    # stopa bazowa: jaki odsetek spółek z listy miał w ostatnich 5 latach wzrost zysku ≥ prognozie danej spółki
    hist5 = sorted((1 + r["m"]["ni_5y"]) ** 0.2 - 1 for r in rows if r["m"].get("ni_5y") is not None and r["m"]["ni_5y"] > -1)
    for r in rows:
        g = r["m"].get("eps_next5")
        r["m"]["baza_wzrostu"] = sum(x >= g for x in hist5) / len(hist5) if g is not None and len(hist5) >= 50 else None


# --- typ spółki (kategorie Petera Lyncha, reguły własne) -------------------------------------------------------------
def typy(m, sektor):
    """[(typ, dopasowanie 0-100, uzasadnienie)] posortowane malejąco."""
    g5 = m.get("rev_cagr5")
    n5 = m.get("eps_next5")
    mc = m.get("mcap") or 0
    div = m.get("div") or 0
    lata = [x for x in (m.get("rev_lata") or []) if x is not None]
    zm = (max(lata) - min(lata)) if len(lata) >= 3 else None
    out = []
    szyb = max([x for x in (g5, n5) if x is not None], default=None)
    if szyb is not None:
        out.append(("Szybko rosnąca", _clip(100 * (szyb - 0.10) / 0.15), "przychody / prognoza EPS rosną ≥ 20 % rocznie"))
    if g5 is not None:
        stab = 100 - 100 * abs(g5 - 0.12) / 0.08
        if mc < 20e9:
            stab -= 30
        if zm is not None and zm > 0.25:
            stab -= 30
        out.append(("Stabilnie rosnąca", _clip(stab), "duża spółka, przychody +8–18 % rocznie, równo"))
        out.append(("Wolno rosnąca", _clip(100 * (0.08 - g5) / 0.06 + (20 if div > 0.02 else 0)), "przychody < 8 % rocznie, często dywidenda"))
    if zm is not None:
        cyk = 100 * (zm - 0.15) / 0.35 + (20 if sektor in ("Basic Materials", "Energy", "Industrials", "Consumer Cyclical") else 0)
        out.append(("Cykliczna", _clip(cyk), "przychody wahają się mocno z roku na rok"))
    if m.get("ni_ttm") is not None and m.get("ni_1y") is None and m["ni_ttm"] > 0:
        out.append(("Wychodząca z kłopotów", 70.0, "zysk wrócił po stratach"))
    if m.get("pb") and m.get("net_cash_mc") is not None:
        out.append(("Ukryte aktywa", _clip(100 * (m["net_cash_mc"] - 0.1) / 0.3 + (30 if m["pb"] < 1.5 else 0)), "dużo gotówki / niska cena do wartości księgowej"))
    return sorted(out, key=lambda x: -x[1])


def _clip(x):
    return round(max(0.0, min(100.0, x)), 0)


def _ile_lat(x):
    """3 -> „3 lata”, 1 -> „1 rok”, 1.5 -> „1,5 roku”."""
    if x != int(x):
        return f"{x:.1f}".replace(".", ",") + " roku"
    x = int(x)
    return f"{x} {'rok' if x == 1 else 'lata' if x in (2, 3, 4) else 'lat'}"


def W_LAT(m):
    return f"{m['hist_lat']:.1f}".replace(".", ",")


def _pl(x, d=1):
    return f"{x:.{d}f}".replace(".", ",")


def ostrzezenia(m, typ=None, rank=None):
    """Realność prognozy wzrostu (film autora o przewidywaniu zysków): lista ostrzeżeń dla karty spółki."""
    out = []
    g, r5, lata = m.get("eps_next5"), m.get("rev_cagr5"), [x for x in (m.get("rev_lata") or []) if x is not None]
    if g is not None and g >= 0.15 and r5 is not None and r5 < 0.05:
        out.append(f"Prognoza wzrostu EPS {100 * g:.0f} % rocznie przy przychodach rosnących {_pl(100 * r5)} % rocznie przez 5 lat — "
                   "historycznie mało realne (wzrost przychodów najlepiej przewiduje przyszły wzrost zysku).")
    if g is not None and g > 0.25 and len(lata) >= 3 and min(lata) < -0.10:
        out.append(f"Spółka cykliczna (przychody spadały nawet o {100 * -min(lata):.0f} % w roku) z prognozą {100 * g:.0f} % rocznie — u cyklicznych przeszły "
                   "wzrost prawie nie przewiduje przyszłego (etap 86: korelacja 0,11 vs 0,50 u pozostałych); prognoza może łapać szczyt cyklu.")
    if rank is not None and rank <= 30 and g is not None and g > 0.30:
        out.append(f"Jedna z 30 największych spółek z prognozą {100 * g:.0f} % rocznie — im większa firma, tym trudniej utrzymać takie tempo; "
                   "przyjmij ostrożniejszy wzrost w wycenie.")
    if m.get("ni_1y") is not None and m["ni_1y"] > 1.0 and (m.get("rev_1y") or 0) < 0.30:
        out.append(f"Zysk netto +{100 * m['ni_1y']:.0f} % r/r przy przychodach +{100 * (m.get('rev_1y') or 0):.0f} % — możliwe jednorazowe zyski "
                   "(np. przeszacowanie udziałów); P/E i PEG mogą być zaniżone.")
    rc = m.get("rampa_capex")
    if rc and not rc.get("bogata"):
        out.append(f"Capex wzrósł {rc['x']:.1f}× w 2 lata (do {100 * rc['przych']:.0f} % przychodów) przy słabych przepływach wcześniej — takie spółki dały "
                   "w 5 lat medianę ok. 0 % (etap 86; bogate w gotówkę +77 %).".replace(".", ",", 1))
    if m.get("baza_wzrostu") is not None and g is not None and g > 0.15 and m["baza_wzrostu"] < 0.15:
        out.append(f"Wzrost zysku ≥ {100 * g:.0f} % rocznie przez ostatnie 5 lat osiągnęło tylko {100 * m['baza_wzrostu']:.0f} % spółek z listy — sprawdź, "
                   "czy prognoza nie jest zbyt optymistyczna (scenariusz pesymistyczny w PEG).")
    return out


# dobra cena wg typu spółki (Peter Lynch w ujęciu autora filmu o 6 typach)
CENA_TYPU = {"Stabilnie rosnąca": (1.5, "PEG ≤ 1,5 to rozsądna cena (autor); u nas najlepszy typ (mediana 5 lat 83 %), ale efekt progu PEG niestabilny"),
             "Szybko rosnąca": (1.6, "PEG ≤ 1,6, okazja poniżej 1 (autor); u nas próg PEG bez wyraźnego efektu — kluczowe, czy wzrost się utrzyma"),
             "Wolno rosnąca": (None, "autor: P/E w okolicach kilkunastu; u nas wolno rosnące z P/E ≤ 18 wypadały gorzej (43 % vs 65 % w 5 lat)"),
             "Cykliczna": (None, "autor: niskie P/E to pułapka; u nas nie było gorzej (79 % = 79 %), ale prognozy wzrostu są mało wiarygodne"),
             "Wychodząca z kłopotów": (None, "ważne: czy przetrwa (gotówka, dług) i czy plan naprawy działa"),
             "Ukryte aktywa": (None, "wartość w aktywach, nie w zyskach — wymaga cierpliwości")}


# --- strategie z badania -----------------------------------------------------------------------------------------
def strategie(m, sektor):
    """{nazwa: [(kryterium, wartość, spełnione)]}."""
    wykl = sektor in SEKTORY_WYKL
    zl = f" (z {W_LAT(m)} lat)" if m.get("hist_lat") else ""     # młoda spółka: z dostępnych lat
    lr = [("Przychody 5 lat > +50 %" + zl, m.get("rev_5y"), _gt(m.get("rev_5y"), 0.5)),
          ("Przychody 1 rok > 5 %", m.get("rev_1y"), _gt(m.get("rev_1y"), 0.05)),
          ("Zysk 1 rok > 5 %", m.get("ni_1y"), _gt(m.get("ni_1y"), 0.05)),
          ("ROE > 15 %", m.get("roe"), _gt(m.get("roe"), 0.15)),
          ("Dług / kapitał 0–1", m.get("de"), m.get("de") is not None and 0 <= m["de"] < 1),
          ("FCF > 0", m.get("fcf_ttm"), _gt(m.get("fcf_ttm"), 0)),
          ("PEG 0–2", m.get("peg"), m.get("peg") is not None and 0 < m["peg"] < 2)]   # użytkownik: „daj te 7/7 kryteriów PEG do 2” (wcześniej 0–1)
    jak = [("Przychody 5 lat > 8 %/rok" + zl, m.get("rev_cagr5"), _gt(m.get("rev_cagr5"), 0.08)),
           ("Dług / kapitał 0–1", m.get("de"), m.get("de") is not None and 0 <= m["de"] < 1),
           ("FCF > 0", m.get("fcf_ttm"), _gt(m.get("fcf_ttm"), 0)),
           ("ROE > 15 %", m.get("roe"), _gt(m.get("roe"), 0.15)),
           ("ROA > 10 %", m.get("roa"), _gt(m.get("roa"), 0.10)),
           (f"ROE wyższe niż {_ile_lat(m.get('roe_wcz_lat') or 3)} temu",
            m.get("roe_wcz"), m.get("roe_sec") is not None and m.get("roe_wcz") is not None and m["roe_sec"] > m["roe_wcz"]),
           ("ROCE > 15 %", m.get("roce"), _gt(m.get("roce"), 0.15))]
    kon = [("Przychody > 10 % w ≥ 3 z 5 lat" + (f" (przeliczone z {m['rev_lata_n']} lat)" if m.get("rev_lata_n") else ""), m.get("rev_lata_10"), m.get("rev_lata_10") is not None and m["rev_lata_10"] >= 3),
           ("Dług / kapitał 0–1", m.get("de"), m.get("de") is not None and 0 <= m["de"] < 1),
           ("FCF > 0", m.get("fcf_ttm"), _gt(m.get("fcf_ttm"), 0))]
    zys = [("ROE > 15 %", m.get("roe"), _gt(m.get("roe"), 0.15)),
           ("ROA > 10 %", m.get("roa"), _gt(m.get("roa"), 0.10)),
           (f"ROE wyższe niż {_ile_lat(m.get('roe_wcz_lat') or 3)} temu", m.get("roe_wcz"),
            m.get("roe_sec") is not None and m.get("roe_wcz") is not None and m["roe_sec"] > m["roe_wcz"]),
           ("ROCE ≥ 30 %", m.get("roce"), m.get("roce") is not None and m["roce"] >= 0.30)]
    prz = [("Przepływy operacyjne ≥ 30 % długu", m.get("ocf_dlug"), m.get("ocf_dlug") is not None and m["ocf_dlug"] >= 0.30),
           ("Capex < 35 % przepływów operacyjnych", m.get("capex_ocf"), m.get("capex_ocf") is not None and m["capex_ocf"] < 0.35),
           ("Skup akcji netto > 2 % kapitalizacji (12 mies.)", m.get("skup_netto_mc"), _gt(m.get("skup_netto_mc"), 0.02)),
           ("Wolne przepływy > 12 % aktywów", m.get("fcf_aktywa"), _gt(m.get("fcf_aktywa"), 0.12))]
    out = {"Jakość (7 kryteriów)": jak, "Konsekwentny wzrost": kon, "Zyskowność (4 kryteria)": zys, "Przepływy pieniężne (4 kryteria)": prz}
    if not wykl:
        out = {"7/7 (niskie ryzyko)": lr, **out}
    return out


def _gt(x, prog):
    return x is not None and x > prog


# --- wycena: PEG i DCF ---------------------------------------------------------------------------------------------
def peg_scenariusze(pe, g):
    """Bear / base / bull: wzrost EPS ×0,67 / ×1 / ×1,26 -> PEG."""
    if not pe or pe <= 0 or not g or g <= 0:
        return None
    return {k: dict(g=g * f, peg=pe / (100 * g * f)) for k, f in (("bear", 0.67), ("base", 1.0), ("bull", 1.26))}


def dcf(przychody, marza, g, akcje, gotowka=0.0, dlug=0.0, r=DCF["r"], tg=DCF["tg"], lata=DCF["lata"], wygaszanie=DCF["wygaszanie"]):
    """Wartość na akcję: przychody rosną `g` przez `lata`, potem wzrost liniowo spada do `tg` przez `wygaszanie` lat;
    FCF = przychody × marża; wartość końcowa FCF × (1 + tg) / (r − tg); (suma PV + gotówka − dług) / akcje."""
    if not przychody or przychody <= 0 or marza is None or marza <= 0 or not akcje or akcje <= 0 or r <= tg:
        return None
    pv, rev = 0.0, przychody
    n = lata + wygaszanie
    for t in range(1, n + 1):
        gt = g if t <= lata else g + (tg - g) * (t - lata) / wygaszanie
        rev *= 1 + gt
        pv += rev * marza / (1 + r) ** t
    pv += rev * marza * (1 + tg) / (r - tg) / (1 + r) ** n
    return (pv + (gotowka or 0) - (dlug or 0)) / akcje


def dcf_domyslne(m, hist=None):
    """Założenia domyślne (ostrożne): wzrost przychodów = mniejszy z (CAGR przychodów 3 lat, prognoza EPS 5 lat), w [0, 25 %];
    marża FCF = mediana z marży (FCF − SBC) z ostatnich 12 mies. i rocznych z ostatnich 5 lat, w [0, 60 %]."""
    gs = [x for x in (m.get("rev_cagr3") if m.get("rev_cagr3") is not None else m.get("rev_cagr5"), m.get("eps_next5")) if x is not None]
    g = max(0.0, min(0.25, min(gs))) if gs else None
    # marże FCF po odjęciu wynagrodzeń w akcjach (SBC): FCF − SBC (ostrożniej; SBC to realny koszt dla akcjonariuszy)
    sbc_m = m.get("sbc_przych") or 0.0
    mz = [m["fcf_margin"] - sbc_m] if m.get("fcf_margin") is not None else []
    rt = m.get("rev_ttm")
    for row in (hist or {}).get("y", [])[-5:]:
        rev, fcf = row[1], row[3]
        sbc = row[4] if len(row) > 4 and row[4] is not None else (sbc_m * rev if rev else 0)
        if rev and fcf is not None and rev > 0 and (not rt or 0.3 < rev / rt < 2):   # pomijamy lata z nieporównywalnymi przychodami
            mz.append((fcf - sbc) / rev)
    mz = sorted(mz)
    mz = max(0.0, min(0.60, mz[len(mz) // 2])) if mz else None
    return g, mz


def dcf_wejscie(m, hist=None):
    """Przychody i marża FCF do DCF z kontrolą zgodności z Finviz: gdy przychody SEC (12 mies.) różnią się od Finviz (kapitalizacja ÷ P/S) o > 25 %
    (np. raport roczny spółki zagranicznej sprzed roku, przychody z akcyzą, zły znacznik) — przychody z Finviz; gdy FCF z SEC różni się od Finviz
    (kapitalizacja ÷ P/FCF) ponad 2 × (np. brak znacznika nakładów na flotę URI, ramię finansowe GM / DE) — marża FCF z Finviz, bez historii.
    Zwraca (przychody, g, marża, uwagi)."""
    g, mz = dcf_domyslne(m, hist)
    rev, uw = m.get("rev_ttm"), []
    rev_fv = m["mcap"] / m["ps"] if m.get("mcap") and m.get("ps") and m["ps"] > 0 else None
    if rev_fv and (not rev or not 0.8 <= rev / rev_fv <= 1.25):
        uw.append(f"przychody z Finviz ({rev_fv / 1e9:.1f} mld USD; SEC: {rev / 1e9:.1f} mld)" if rev else "przychody z Finviz (brak w SEC)")
        rev = rev_fv
    fcf_fv = m["mcap"] / m["pfcf"] if m.get("mcap") and m.get("pfcf") and m["pfcf"] > 0 else None
    f_sec = m.get("fcf_ttm")
    if fcf_fv and rev and (f_sec is None or f_sec <= 0 or not 0.5 <= f_sec / fcf_fv <= 2):
        nowa = max(0.0, min(0.60, fcf_fv / rev - (m.get("sbc_przych") or 0.0)))
        if f_sec is not None and f_sec > 0:
            uw.append(f"marża FCF z Finviz {100 * nowa:.1f} % (SEC: FCF {f_sec / 1e9:.1f} mld vs Finviz {fcf_fv / 1e9:.1f} mld)")
            mz = nowa
        elif mz is None or mz <= 0:
            mz = nowa
    return rev, g, mz, uw


def dcf_scenariusze(m, hist=None, sektor=None):
    if sektor == "Financial":            # banki / ubezpieczyciele: wolne przepływy nie mierzą wartości (depozyty, rezerwy) — bez DCF
        return None
    rev, g, mz, uw = dcf_wejscie(m, hist)
    m["dcf_rev"], m["dcf_uwagi"], m["dcf_g"], m["dcf_marza"] = rev, uw or None, g, mz     # założenia także dla karty, gdy DCF pominięty
    if g is None or not mz:
        if g is not None and mz is not None:
            m["dcf_brak"] = "marża wolnych przepływów po odjęciu wynagrodzeń w akcjach ≤ 0 (duże inwestycje lub SBC) — DCF pominięty"
        return None
    m["dcf_dlug"] = (m.get("debt") or 0) + (m.get("leasing") or 0)        # dług + leasing operacyjny
    a = (rev, m.get("shares"), m.get("cash") or 0, m["dcf_dlug"])
    out = {}
    for k, fg, fm in (("bear", 0.6, 0.85), ("base", 1.0, 1.0), ("bull", 1.2, 1.1)):
        v = dcf(a[0], mz * fm, g * fg, a[1], a[2], a[3])
        out[k] = dict(g=g * fg, marza=mz * fm, wartosc=v)
    if out["base"]["wartosc"] is not None and out["base"]["wartosc"] <= 0:   # np. GM: dług banku w grupie > wartość przepływów — DCF bez sensu
        m["dcf_brak"] = "wartość DCF ujemna (dług z leasingiem większy niż wartość przepływów, np. bank w grupie) — DCF pominięty"
        return None
    return out if out["base"]["wartosc"] else None


ETYKIETY = [(0.40, "Bardzo tania"), (0.15, "Niedowartościowana"), (-0.15, "Wyceniona uczciwie"), (-0.40, "Droga"), (-9, "Bardzo droga")]


PEG_PROGI = [(0.5, "Bardzo tania"), (1, "Niedowartościowana"), (2, "Wyceniona uczciwie"), (3, "Droga")]


def etykieta(pot, peg=None):
    """Etykieta wyceny: najpierw PEG (użytkownik: „na pierwszym planie PEG”; < 0,5 / < 1 / < 2 / < 3 / ≥ 3), zapas: potencjał DCF."""
    if peg is not None and peg > 0:
        return next((t for p, t in PEG_PROGI if peg < p), "Bardzo droga")
    if pot is not None:
        return next(t for p, t in ETYKIETY if pot >= p)
    return None
