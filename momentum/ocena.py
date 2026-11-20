"""Ocena spółki: wskaźniki wzrostu / siły finansowej / wyceny, oceny 0-10 względem sektora, typ spółki (kategorie Lyncha),
dopasowanie do strategii z badania oraz wycena PEG i DCF (te same wzory co docs/js/wycena-dcf.js). Czyste funkcje, bez sieci."""
import math
from . import fundamenty as F

SEKTORY_WYKL = {"Financial", "Basic Materials", "Energy", "Utilities", "Real Estate"}
DCF = dict(r=0.10, tg=0.03, lata=5, wygaszanie=5)


def _f(x):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def _r(x, n=4):
    return None if x is None else round(x, n)


def metryki(ex, fv):
    """ex = fundamenty.wyciag(...) (może być {}), fv = wiersz Finviz -> (wskaźniki, historia do wykresów)."""
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
    q = {k: F.polacz(ex[k], F.kwartalne) for k in ("rev", "ni", "op", "ocf", "capex") if ex.get(k)}
    rt = F.ttm(q["rev"]) if "rev" in q else []
    nt = F.ttm(q["ni"]) if "ni" in q else []
    ot = F.ttm(q["op"]) if "op" in q else []
    fq = {e: q["ocf"][e] - q.get("capex", {}).get(e, 0.0) for e in q.get("ocf", {})}
    ft = F.ttm(fq) if fq else []
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
    if ft:
        m["fcf_ttm"] = ft[-1][1]
        m["fcf_margin"] = ft[-1][1] / m["rev_ttm"] if m.get("rev_ttm") else None
    # bilans: ostatni znany i sprzed 5 lat
    ch = {k: F.polacz(ex[k], F.chwilowe) for k in ("cash", "sti", "eq", "assets", "lc") if ex.get(k)}
    if ch.get("eq"):
        e = list(ch["eq"])[-1]
        m["cash"] = (ch.get("cash", {}).get(e) or 0) + (ch.get("sti", {}).get(e) or 0)
        m["debt"] = F.dlug(ex.get("debt", {}), e)
        if not m["cash"]:
            m["cash"] = None
        m["equity"] = ch["eq"][e]
        m["net_cash"] = m["cash"] - m["debt"] if m["cash"] is not None else None
        a, lc = ch.get("assets", {}).get(e), ch.get("lc", {}).get(e)
        if ot and a and lc is not None and a - lc > 0:
            m["roce"] = ot[-1][1] / (a - lc)
        if nt and m["equity"] and m["equity"] > 0:
            m["roe_sec"] = nt[-1][1] / m["equity"]
            e5 = [(ee, v) for ee, v in ch["eq"].items()]
            eq5 = F.wartosc_lata_temu(e5, e, 5)
            n5 = F.wartosc_lata_temu(nt, nt[-1][0], 5)
            m["roe_5l"] = n5 / eq5 if eq5 and eq5 > 0 and n5 is not None else None
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
    if m.get("debt") is None and m.get("mcap") and m.get("pb") and m.get("de") is not None:
        m["debt"] = m["de"] * m["mcap"] / m["pb"]
    if m.get("net_cash") is None and m.get("cash") is not None and m.get("debt") is not None:
        m["net_cash"] = m["cash"] - m["debt"] if m["cash"] is not None else None
    if m.get("rev_ttm") is None and m.get("mcap") and m.get("ps"):
        m["rev_ttm"] = m["mcap"] / m["ps"]
    if m.get("fcf_margin") is None and m.get("fcf_ttm") and m.get("rev_ttm"):
        m["fcf_margin"] = m["fcf_ttm"] / m["rev_ttm"]
    sh = F.chwilowe(ex.get("shares", [])) if ex.get("shares") else {}
    m["shares"] = list(sh.values())[-1] if sh else (m["mcap"] / p if m.get("mcap") and p else None)
    # historia do wykresów: ostatnie 40 kwartałów i lata obrotowe
    ends = sorted(set(q.get("rev", {})) | set(q.get("ni", {})))[-40:]
    for e in ends:
        hist["q"].append([e, _r(q.get("rev", {}).get(e), 0), _r(q.get("ni", {}).get(e), 0), _r(fq.get(e), 0),
                          _r((ch.get("cash", {}).get(e) or 0) + (ch.get("sti", {}).get(e) or 0) if ch.get("cash", {}).get(e) is not None else None, 0),
                          _r(F.dlug(ex.get("debt", {}), e) if ch.get("eq", {}).get(e) is not None else None, 0)])
    yr = {k: F.polacz(ex[k], F.roczne) for k in ("rev", "ni", "ocf", "capex") if ex.get(k)}
    for e in list(yr.get("rev", {}))[-12:]:
        ocf, cx = yr.get("ocf", {}).get(e), yr.get("capex", {}).get(e, 0.0)
        hist["y"].append([e, _r(yr["rev"][e], 0), _r(yr.get("ni", {}).get(e), 0), _r(ocf - cx if ocf is not None else None, 0)])
    return m, hist


def _pct(x):
    x = _f(x)
    return None if x is None else x / 100


# --- oceny względem sektora --------------------------------------------------------------------------------------
GRUPY = {
    "wzrost": [("rev_1y", 1), ("rev_cagr3", 1), ("rev_cagr5", 1), ("ni_1y", 1), ("ni_5y", 1), ("eps_next5", 1), ("rev_lata_10", 1)],
    "sila": [("gm", 1), ("om", 1), ("nm", 1), ("roe", 1), ("roa", 1), ("roce", 1), ("fcf_margin", 1), ("de", -1), ("qr", 1), ("net_cash_mc", 1)],
    "wycena": [("pe", -1), ("peg", -1), ("ps", -1), ("pfcf", -1), ("fcf_yield", 1), ("dcf_pot", 1)],
}


def percentyle(rows, pole, kier, grupa="sector"):
    """Dla każdego wiersza: percentyl wartości `pole` w jego sektorze (0..1, 1 = najlepiej wg kierunku), None gdy brak."""
    od_sek = {}
    for r in rows:
        v = r["m"].get(pole)
        if v is not None and not (pole in ("pe", "peg", "pfcf", "ps") and v <= 0):
            od_sek.setdefault(r[grupa], []).append(v)
    out = []
    for r in rows:
        v = r["m"].get(pole)
        lst = od_sek.get(r[grupa], [])
        if v is None or len(lst) < 5 or (pole in ("pe", "peg", "pfcf", "ps") and v <= 0):
            out.append(None)
            continue
        mn = sum(x < v for x in lst)
        rw = sum(x == v for x in lst)
        pr = (mn + 0.5 * rw) / len(lst)
        out.append(pr if kier > 0 else 1 - pr)
    return out


def oceny(rows):
    """Uzupełnia r['pct'] (percentyle wskaźników) i r['oceny'] (wzrost, siła, wycena, ogólna; 0-10)."""
    for r in rows:
        m = r["m"]
        m["net_cash_mc"] = m["net_cash"] / m["mcap"] if m.get("net_cash") is not None and m.get("mcap") else None
        m["fcf_yield"] = m["fcf_ttm"] / m["mcap"] if m.get("fcf_ttm") is not None and m.get("mcap") else None
        r["pct"] = {}
    for g, pola in GRUPY.items():
        for pole, kier in pola:
            for r, p in zip(rows, percentyle(rows, pole, kier)):
                r["pct"][pole] = p
    for r in rows:
        o = {}
        for g, pola in GRUPY.items():
            v = [r["pct"][p] for p, _ in pola if r["pct"].get(p) is not None]
            o[g] = round(10 * sum(v) / len(v), 1) if len(v) >= 2 else None
        w = [(o[g], wg) for g, wg in (("wzrost", 0.4), ("sila", 0.35), ("wycena", 0.25)) if o[g] is not None]
        o["ogolna"] = round(sum(a * b for a, b in w) / sum(b for _, b in w), 1) if len(w) == 3 or (len(w) == 2 and o["wzrost"] is not None) else None
        r["oceny"] = o


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


# --- strategie z badania -----------------------------------------------------------------------------------------
def strategie(m, sektor):
    """{nazwa: [(kryterium, wartość, spełnione)]}."""
    wykl = sektor in SEKTORY_WYKL
    lr = [("Przychody 5 lat > +50 %", m.get("rev_5y"), _gt(m.get("rev_5y"), 0.5)),
          ("Przychody 1 rok > 5 %", m.get("rev_1y"), _gt(m.get("rev_1y"), 0.05)),
          ("Zysk 1 rok > 5 %", m.get("ni_1y"), _gt(m.get("ni_1y"), 0.05)),
          ("ROE > 15 %", m.get("roe"), _gt(m.get("roe"), 0.15)),
          ("Dług / kapitał 0–1", m.get("de"), m.get("de") is not None and 0 <= m["de"] < 1),
          ("FCF > 0", m.get("fcf_ttm"), _gt(m.get("fcf_ttm"), 0)),
          ("PEG 0–1", m.get("peg"), m.get("peg") is not None and 0 < m["peg"] < 1)]
    jak = [("Przychody 5 lat > 8 %/rok", m.get("rev_cagr5"), _gt(m.get("rev_cagr5"), 0.08)),
           ("Dług / kapitał 0–1", m.get("de"), m.get("de") is not None and 0 <= m["de"] < 1),
           ("FCF > 0", m.get("fcf_ttm"), _gt(m.get("fcf_ttm"), 0)),
           ("ROE > 15 %", m.get("roe"), _gt(m.get("roe"), 0.15)),
           ("ROA > 10 %", m.get("roa"), _gt(m.get("roa"), 0.10)),
           ("ROE wyższe niż 5 lat temu", m.get("roe_5l"), m.get("roe_sec") is not None and m.get("roe_5l") is not None and m["roe_sec"] > m["roe_5l"]),
           ("ROCE > 15 %", m.get("roce"), _gt(m.get("roce"), 0.15))]
    kon = [("Przychody > 10 % w ≥ 3 z 5 lat", m.get("rev_lata_10"), m.get("rev_lata_10") is not None and m["rev_lata_10"] >= 3),
           ("Dług / kapitał 0–1", m.get("de"), m.get("de") is not None and 0 <= m["de"] < 1),
           ("FCF > 0", m.get("fcf_ttm"), _gt(m.get("fcf_ttm"), 0))]
    out = {"Jakość (7 kryteriów)": jak, "Konsekwentny wzrost": kon}
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
    marża FCF = mediana z marży z ostatnich 12 mies. i rocznych marż FCF z ostatnich 5 lat, w [0, 60 %]."""
    gs = [x for x in (m.get("rev_cagr3") if m.get("rev_cagr3") is not None else m.get("rev_cagr5"), m.get("eps_next5")) if x is not None]
    g = max(0.0, min(0.25, min(gs))) if gs else None
    mz = [m["fcf_margin"]] if m.get("fcf_margin") is not None else []
    for _, rev, _, fcf in (hist or {}).get("y", [])[-5:]:
        if rev and fcf is not None and rev > 0:
            mz.append(fcf / rev)
    mz = sorted(mz)
    mz = max(0.0, min(0.60, mz[len(mz) // 2])) if mz else None
    return g, mz


def dcf_scenariusze(m, hist=None, sektor=None):
    if sektor == "Financial":            # banki / ubezpieczyciele: wolne przepływy nie mierzą wartości (depozyty, rezerwy) — bez DCF
        return None
    g, mz = dcf_domyslne(m, hist)
    if g is None or not mz:
        return None
    a = (m.get("rev_ttm"), m.get("shares"), m.get("cash") or 0, m.get("debt") or 0)
    out = {}
    for k, fg, fm in (("bear", 0.6, 0.85), ("base", 1.0, 1.0), ("bull", 1.2, 1.1)):
        v = dcf(a[0], mz * fm, g * fg, a[1], a[2], a[3])
        out[k] = dict(g=g * fg, marza=mz * fm, wartosc=v)
    return out if out["base"]["wartosc"] else None


ETYKIETY = [(0.40, "Bardzo tania"), (0.15, "Niedowartościowana"), (-0.15, "Wyceniona uczciwie"), (-0.40, "Droga"), (-9, "Bardzo droga")]


def etykieta(pot, peg=None):
    """Etykieta wyceny z potencjału DCF (wartość / cena − 1), zapas: PEG."""
    if pot is not None:
        return next(t for p, t in ETYKIETY if pot >= p)
    if peg is not None and peg > 0:
        return "Niedowartościowana" if peg < 1 else "Wyceniona uczciwie" if peg < 2 else "Droga" if peg < 3 else "Bardzo droga"
    return None
