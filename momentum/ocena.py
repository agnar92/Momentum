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
    q = {k: F.polacz(ex[k], F.kwartalne, k == "rev") for k in ("rev", "ni", "op", "ocf", "capex", "sbc", "skup", "emisja", "nonop", "odsetki", "przed_pod", "podatek")
         if ex.get(k)}
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
            qy = []                                          # Lynch: wzrost sprzedaży r/r w ostatnich 3 kwartałach (hamowanie 2 kwartały z rzędu)
            for ea_, va_ in lq[-3:]:
                y_ = [v for ee, v in lq if abs((F.D(ea_) - F.D(ee)).days - 365) <= 45]
                qy.append(va_ / y_[-1] - 1 if y_ and y_[-1] > 0 else None)
            m["rev_q_yoy3"] = [_r(x) for x in qy]
        lata = []
        for k in range(5):
            a, b = F.wartosc_lata_temu(rt, e, k + 1), F.wartosc_lata_temu(rt, e, k) if k else r0
            if a and b and a > 0:
                lata.append(b / a - 1)
        m["rev_lata_10"] = sum(x > 0.10 for x in lata) if len(lata) == 5 else None
        m["rev_lata"] = [_r(x) for x in lata]
        if len(lata) == 5:      # etap 87: tempo przychodów — nachylenie 5 rocznych wzrostów (od najstarszego), > 0 = przyspiesza
            g_ = lata[::-1]
            xs = range(5)
            mx, my = 2.0, sum(g_) / 5
            m["przysp"] = sum((x - mx) * (y - my) for x, y in zip(xs, g_)) / sum((x - mx) ** 2 for x in xs)
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
    ch = {k: F.polacz(ex[k], F.chwilowe) for k in ("cash", "sti", "eq", "assets", "lc", "zapasy") if ex.get(k)}
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
    # ROIC (jak w badaniu, etap 87): zysk operacyjny 12 mies. × 0,79 (po podatku) ÷ (kapitał + dług − gotówka); zapas: Finviz (ROI)
    if ot and m.get("equity") is not None:
        ic = m["equity"] + (m.get("debt") or 0) - (m.get("cash") or 0)
        if ic > 0:
            m["roic_fv"], m["roic"] = m.get("roic"), ot[-1][1] * 0.79 / ic
    # stabilność zysku (etap 87: wysoki ROIC = zysk w każdym roku i mniejsze wahania): lata z dodatnim zyskiem z 5 i zmienność zysku
    if nt:
        e_, n0_ = nt[-1]
        zl5 = [F.wartosc_lata_temu(nt, e_, k) if k else n0_ for k in range(5)]
        if all(x is not None for x in zl5):
            m["zysk_dodatni_lata"] = sum(x > 0 for x in zl5)
            sr_ = sum(zl5) / 5
            m["zmiennosc_zysku"] = (sum((x - sr_) ** 2 for x in zl5) / 5) ** 0.5 / abs(sr_) if sr_ else None
    # zysk znormalizowany (jak „partially normalized EPS”): zysk operacyjny − odsetki, po podatku (efektywna stopa 10–30 %, zapas 21 %);
    # pomija zyski / straty z inwestycji, sprzedaży aktywów i inne pozycje nieoperacyjne, które zawyżają lub zaniżają zysk z raportu (GAAP)
    op12, ods12, pp12, pod12, no12 = ost12("op"), ost12("odsetki"), ost12("przed_pod"), ost12("podatek"), ost12("nonop")
    if op12 is not None and m.get("ni_ttm") is not None:
        st_ = pod12 / pp12 if pod12 is not None and pp12 and pp12 > 0 else 0.21
        # stopa < 10 % to zwykle jednorazowa korzyść podatkowa (np. ALNY: rozwiązanie odpisu na aktywa podatkowe, −1,9 mld) — wtedy ostrożnie 21 %
        st_ = 0.21 if st_ < 0.10 else min(0.30, st_)
        ni_n = (op12 - (ods12 or 0)) * (1 - st_)
        m["ni_norm"], m["stopa_pod"], m["op_ttm"], m["odsetki_ttm"] = ni_n, st_, op12, ods12
        m["roznica_norm"] = m["ni_ttm"] - ni_n                       # o ile zysk z raportu różni się od znormalizowanego
        if no12 is not None:
            m["nonop_ttm"] = no12
        if m.get("eps") and m["ni_ttm"] > 0 and ni_n > 0:
            m["eps_norm"] = m["eps"] * ni_n / m["ni_ttm"]            # ta sama liczba akcji co w EPS z Finviz
            if m.get("price"):
                m["pe_norm"] = m["price"] / m["eps_norm"]
                if m.get("eps_next5") and m["eps_next5"] > 0:
                    m["peg_norm"] = m["pe_norm"] / (100 * m["eps_next5"])
        # PEG z zysku znormalizowanego, gdy zysk z raportu różni się o > 15 % (np. AMZN: zysk z wyceny udziałów) — etykieta, 7/7 i ocena wyceny
        # nie pokazują wtedy fałszywie taniej spółki; PEG z zysku z raportu zostaje jako peg_gaap
        if m.get("eps") and m["eps"] > 0 and m.get("peg") is not None:
            if m.get("eps_norm") and abs(m["eps"] / m["eps_norm"] - 1) > 0.15 and m.get("peg_norm"):
                m["peg_gaap"], m["peg"], m["peg_norm_uzyte"] = m["peg"], m["peg_norm"], True
            elif ni_n <= 0:
                m["peg_gaap"], m["peg"], m["peg_norm_uzyte"] = m["peg"], None, True
    # „Duży zwycięzca (10+ lat)” (użytkownik: duże spółki o dobrych fundamentach rosnące od 10+ lat, np. MSFT, META — PEG 1–2 to cena godziwa)
    yrev = F.polacz(ex["rev"], F.roczne, True) if ex.get("rev") else {}
    yv = list(yrev.values())[-11:]
    if len(yv) == 11 and all(v and v > 0 for v in yv):
        m["przych_lata_wzrostu_10"] = sum(yv[k + 1] > yv[k] for k in range(10))
        m["przych_10l"] = yv[-1] / yv[0]
    # dywidenda: wypłacana w każdym z 5 ostatnich lat obrotowych i bez cięcia o > 20 % (sumy wypłat; skup akcji zmniejsza sumę przy rosnącej dywidendzie na akcję)
    if ex.get("dyw"):
        dv = list(F.polacz(ex["dyw"], F.roczne).items())
        if dv and rt and abs((F.D(dv[-1][0]) - F.D(rt[-1][0])).days) <= 400:
            d5 = [abs(v) for _, v in dv[-5:]]
            m["dywidenda_lata"] = sum(v > 0 for v in d5) if len(d5) == 5 else None
            # lata z dywidendą specjalną (> 1,5 × mediana, np. Costco) pomijamy przy sprawdzaniu cięć
            med_ = sorted(d5)[2] if len(d5) == 5 else None
            reg = [v for v in d5 if med_ and v <= 1.5 * med_]
            m["dywidenda_stabilna"] = bool(len(d5) == 5 and all(v > 0 for v in d5) and all(reg[k + 1] >= 0.8 * reg[k] for k in range(len(reg) - 1)))
            d6 = [abs(v) for _, v in dv[-6:]]                 # etap 93 (Lynch): dywidenda rośnie 5 lat z rzędu — u wolno rosnących +11 pp w 3 lata
            m["dyw_rosnie_5"] = bool(len(d6) == 6 and d6[0] > 0 and all(d6[k + 1] > d6[k] for k in range(5))) if len(d6) == 6 else None
    # rampa capex (etap 86): capex ≥ 2 × capex sprzed 2 lat i ≥ 5 % przychodów; „bogata” = przepływy operacyjne sprzed 2 lat ≥ 3 × ówczesny capex
    ya = {k: F.polacz(ex[k], F.roczne) for k in ("ocf", "capex") if ex.get(k)}
    if ya.get("capex") and ya.get("ocf") and m.get("rev_ttm"):
        ce = list(ya["capex"].items())
        e0, c0 = ce[-1]
        c2 = next((v for d_, v in ce if abs((F.D(d_) - (F.D(e0) - dt.timedelta(days=730))).days) <= 60), None)
        o2 = next((v for d_, v in ya["ocf"].items() if abs((F.D(d_) - (F.D(e0) - dt.timedelta(days=730))).days) <= 60), None)
        if c2 and c2 > 0 and c0 >= 2 * c2 and c0 >= 0.05 * m["rev_ttm"]:
            m["rampa_capex"] = dict(x=c0 / c2, przych=c0 / m["rev_ttm"], bogata=bool(o2 is not None and o2 >= 3 * c2), ocf_przed=o2 / c2 if o2 is not None else None)
    # historia do wykresów: ostatnie 40 kwartałów i lata obrotowe
    ends = sorted(set(q.get("rev", {})) | set(q.get("ni", {})))[-40:]
    for e in ends:
        hist["q"].append([e, _r(q.get("rev", {}).get(e), 0), _r(q.get("ni", {}).get(e), 0), _r(fq.get(e), 0),
                          _r((ch.get("cash", {}).get(e) or 0) + (ch.get("sti", {}).get(e) or 0) if ch.get("cash", {}).get(e) is not None else None, 0),
                          _r(F.dlug(ex.get("debt", {}), e) if ch.get("eq", {}).get(e) is not None else None, 0)])
    # Lynch: zapasy r/r względem sprzedaży r/r; dług rosnący kwartał po kwartale
    if ch.get("zapasy") and m.get("rev_ttm"):
        zs = list(ch["zapasy"].items())
        e_, z0 = zs[-1]
        z1 = next((v for d_, v in reversed(zs) if abs((F.D(e_) - F.D(d_)).days - 365) <= 45), None)
        m["zapasy_przych"] = z0 / m["rev_ttm"]
        if z1 and z1 > 0:
            m["zapasy_1y"] = z0 / z1 - 1
    dq = [x[5] for x in hist["q"] if x[5] is not None]
    if len(dq) >= 2:
        n_ = 0
        for a_, b_ in zip(dq[::-1][1:], dq[::-1]):
            if b_ > a_ * 1.001:
                n_ += 1
            else:
                break
        m["dlug_rosnie_kw"] = n_
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
    "wzrost": [("rev_1y", 1), ("rev_cagr3", 1), ("rev_cagr5", 1), ("ni_1y", 1), ("ni_5y", 1), ("eps_next5", 1), ("rev_lata_10", 1), ("zysk_lata", 1), ("przysp", 1)],
    "sila": [("gm", 1), ("om", 1), ("nm", 1), ("roe", 1), ("roa", 1), ("roce", 1), ("fcf_margin", 1), ("de", -1), ("qr", 1), ("net_cash_mc", 1),
             ("akcje_3l", -1), ("capex_przych", -1), ("kapital_3l", -1), ("roic", 1)],
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
    if m.get("eps_norm") and m.get("eps") and abs(m["eps"] / m["eps_norm"] - 1) > 0.25:
        k_ = "zawyżony" if m["eps"] > m["eps_norm"] else "zaniżony"
        out.append(f"Zysk z raportu (EPS {_pl(m['eps'], 2)}) jest {k_} względem zysku z podstawowej działalności (EPS znormalizowany {_pl(m['eps_norm'], 2)}) — "
                   f"pozycje nieoperacyjne (np. zyski z inwestycji, sprzedaż aktywów, jednorazowy podatek). P/E po normalizacji {_pl(m['pe_norm'])} zamiast "
                   f"{_pl(m['pe']) if m.get('pe') else '–'}" + (f", PEG {_pl(m['peg_norm'], 2)} zamiast {_pl(m['peg_gaap'], 2)} (na stronie liczymy PEG ze znormalizowanego)." if m.get("peg_norm") and m.get("peg_gaap") else "."))
    elif m.get("eps") and m["eps"] > 0 and m.get("ni_norm") is not None and m["ni_norm"] <= 0:
        out.append("Zysk z raportu jest dodatni tylko dzięki pozycjom nieoperacyjnym (np. zyski z inwestycji) — zysk z podstawowej działalności po odsetkach "
                   "i podatku jest ujemny, więc P/E i PEG nie mają sensu.")
    if m.get("ni_1y") is not None and m["ni_1y"] > 1.0 and (m.get("rev_1y") or 0) < 0.30:
        out.append(f"Zysk netto +{100 * m['ni_1y']:.0f} % r/r przy przychodach +{100 * (m.get('rev_1y') or 0):.0f} % — możliwe jednorazowe zyski "
                   "(np. przeszacowanie udziałów); P/E i PEG mogą być zaniżone.")
    rc = m.get("rampa_capex")
    if rc and not rc.get("bogata"):
        przed = f"przepływy operacyjne przed rampą {_pl(rc['ocf_przed'])}× capex, próg 3×" if rc.get("ocf_przed") is not None else "brak danych o przepływach przed rampą"
        out.append(f"Capex wzrósł {_pl(rc['x'])}× w 2 lata (do {100 * rc['przych']:.0f} % przychodów) przy niewystarczających przepływach wcześniej ({przed}) — "
                   "takie spółki dały w 5 lat medianę ok. 0 % (etap 86; bogate w gotówkę +77 %, a te z wysokim zwrotem z nowych aktywów +108 %).")
    if m.get("od_maks_12m") is not None and m["od_maks_12m"] <= -0.40 and m.get("pe_gorna_tercyla"):
        out.append(f"Kurs {100 * m['od_maks_12m']:.0f} % od szczytu z 12 mies., a P/E ({_pl(m['pe'])}) nadal w górnej 1/3 listy — spadek nie oznacza, że jest tanio "
                   "(etap 87: po takim spadku drogie spółki dalej traciły, mediana −40 % w 3 lata vs +19 % tanie; mało przypadków).")
    if m.get("baza_wzrostu") is not None and g is not None and g > 0.15 and m["baza_wzrostu"] < 0.15:
        out.append(f"Wzrost zysku ≥ {100 * g:.0f} % rocznie przez ostatnie 5 lat osiągnęło tylko {100 * m['baza_wzrostu']:.0f} % spółek z listy — sprawdź, "
                   "czy prognoza nie jest zbyt optymistyczna (scenariusz pesymistyczny w PEG).")
    return out


# dobra cena wg typu spółki (Peter Lynch w ujęciu autora filmu o 6 typach)
CENA_TYPU = {"Duży zwycięzca (10+ lat)": (2.0, "PEG 1–2 to cena godziwa, poniżej 1 okazja, powyżej 2 drogo (zasada użytkownika; nie testowana — brak historii prognoz)"),
             "Stabilnie rosnąca": (1.5, "PEG ≤ 1,5 to rozsądna cena (autor); u nas najlepszy typ (mediana 5 lat 83 %); progu PEG z prognozą analityków nie mogliśmy sprawdzić"),
             "Szybko rosnąca": (1.6, "PEG ≤ 1,6, okazja poniżej 1 (autor); progu PEG z prognozą analityków nie mogliśmy sprawdzić — kluczowe, czy wzrost się utrzyma"),
             "Wolno rosnąca": (None, "autor: P/E w okolicach kilkunastu; u nas wolno rosnące z P/E ≤ 18 wypadały gorzej (43 % vs 65 % w 5 lat)"),
             "Cykliczna": (None, "autor: niskie P/E to pułapka; u nas nie było gorzej (79 % = 79 %), ale prognozy wzrostu są mało wiarygodne"),
             "Wychodząca z kłopotów": (None, "ważne: czy przetrwa (gotówka, dług) i czy plan naprawy działa"),
             "Ukryte aktywa": (None, "wartość w aktywach, nie w zyskach — wymaga cierpliwości")}


# --- Peter Lynch („One Up on Wall Street”, 1989): fazy wzrostu, na co patrzeć i kiedy sprzedać, wg typu spółki -------------
def pe_mediana(hist, ceny, akcje):
    """Mediana P/E z ostatnich 5 lat na końcach kwartałów: cena (tygodniowa, skorygowana o splity) × dzisiejsza liczba akcji ÷ zysk TTM
    (przybliżenie — skup akcji lekko zaniża dawne P/E)."""
    if not ceny or not akcje or len(hist.get("q") or []) < 8:
        return None
    d, c = ceny[0], ceny[1]
    q, pes = hist["q"], []
    for i in range(3, len(q)):
        ni = [x[2] for x in q[i - 3:i + 1]]
        if any(v is None for v in ni) or sum(ni) <= 0:
            continue
        e = q[i][0]
        j = max((k for k, x in enumerate(d) if x <= e), default=None)
        if j is None or e < d[0]:
            continue
        pes.append(c[j] * akcje / sum(ni))
    pes.sort()
    return pes[len(pes) // 2] if len(pes) >= 8 else None


FAZY = ("Start", "Szybka ekspansja", "Dojrzewanie")


def faza(m):
    """Lynch: szybko rosnące przechodzą fazy start → szybka ekspansja → dojrzewanie (nasycenie rynku); najwięcej zarabia się w ekspansji."""
    g1, g3, g5, p = m.get("rev_1y"), m.get("rev_cagr3"), m.get("rev_cagr5"), m.get("przysp")
    if g1 is None or g3 is None:
        return None
    if g1 >= 0.15 and g3 >= 0.15 and (p is None or p >= -0.02 or g1 >= g3):
        return ("Szybka ekspansja", "przychody rosną ≥ 15 % rocznie i wzrost nie hamuje")
    if g5 is not None and g5 >= 0.15 and g1 < 0.6 * g5:
        return ("Dojrzewanie", "wzrost wyraźnie wolniejszy niż średnio przez 5 lat — rynek się nasyca")
    if g1 >= 0.15:
        return ("Szybka ekspansja", "przychody rosną ≥ 15 % rocznie, ale tempo spada")
    return None


def lynch(m, typ, zd=None):
    """Lista kontrolna wg Lyncha dla głównego typu: [(co sprawdzamy, wartość / opis, stan)], stan: True = w porządku, False = sygnał ostrzegawczy
    (wg Lyncha: rozważ sprzedaż / nie dokupuj), None = brak danych. Plus wskaźnik Lyncha z dywidendą i faza."""
    def pct(x):
        return f"{100 * x:+.0f} %".replace("+-", "−") if x is not None else "–"
    lista = []
    g1, g5 = m.get("rev_1y"), m.get("rev_cagr5")
    q3 = [x for x in (m.get("rev_q_yoy3") or []) if x is not None]
    hamuje = len(q3) == 3 and q3[2] < q3[1] < q3[0]
    zap, zap_p = m.get("zapasy_1y"), m.get("zapasy_przych")
    zap_ok = None if zap is None or g1 is None or (zap_p or 0) < 0.03 else not (zap > g1 + 0.10)
    zap_txt = f"zapasy {pct(zap)} r/r, sprzedaż {pct(g1)}" if zap is not None else "brak danych o zapasach"
    dl = m.get("dlug_rosnie_kw")
    pe, pm = m.get("pe"), m.get("pe_med5")
    if typ == "Szybko rosnąca":
        lista += [("Faza szybkiej ekspansji trwa", (faza(m) or ("–", ""))[0], (faza(m) or (None,))[0] == "Szybka ekspansja" if faza(m) else None),
                  ("Sprzedaż nie hamuje 2 kwartały z rzędu", " → ".join(pct(x) for x in q3) if q3 else "–", None if len(q3) < 3 else not hamuje),
                  ("P/E nie jest absurdalnie wysokie względem wzrostu (PEG < 2)", f"PEG {m['peg']:.2f}".replace(".", ",") if m.get("peg") else "–",
                   None if m.get("peg") is None else m["peg"] < 2),
                  ("Zapasy nie rosną szybciej niż sprzedaż", zap_txt, zap_ok)]
    elif typ == "Stabilnie rosnąca":
        lista += [("P/E nie odbiegło wysoko od normalnego (≤ 1,3 × mediana z 5 lat)", f"P/E {pe:.1f} vs mediana {pm:.1f}".replace(".", ",") if pe and pm else "–",
                   None if not (pe and pm) else pe <= 1.3 * pm),
                  ("Wzrost przychodów nie hamuje (ostatni rok ≥ średnia 5 lat − 5 pp)", f"{pct(g1)} vs {pct(g5)} rocznie", None if g1 is None or g5 is None else g1 >= g5 - 0.05),
                  ("Fundamenty nie słabną 2 lata z rzędu", "przychody i zysk", not m.get("spadek_2l")),
                  ("Wysoka marża netto (górna 1/3 stabilnie rosnących)", f"{100 * m['nm']:.0f} %" if m.get("nm") is not None else "–", m.get("nm_gorna_tercyla_stab"))]
    elif typ == "Wolno rosnąca":
        dyw_ok = None if not m.get("div") else bool(m.get("dywidenda_stabilna"))
        wypl = m["div"] * m["mcap"] / m["ni_ttm"] if m.get("div") and m.get("mcap") and m.get("ni_ttm") and m["ni_ttm"] > 0 else None
        lista += [("Dywidenda rośnie 5 lat z rzędu", "tak" if m.get("dyw_rosnie_5") else ("brak dywidendy" if not m.get("div") else "nie"),
                   None if not m.get("div") or m.get("dyw_rosnie_5") is None else bool(m["dyw_rosnie_5"]))]
        lista += [("Dywidenda bez cięć przez 5 lat", "tak" if m.get("dywidenda_stabilna") else ("brak dywidendy" if not m.get("div") else "było cięcie / przerwa"), dyw_ok),
                  ("Zysk pokrywa dywidendę (wypłata < 100 % zysku)", f"{100 * wypl:.0f} % zysku" if wypl else "–", None if wypl is None else wypl < 1),
                  ("Sprzedaż nie spada 2 lata z rzędu (utrata rynku)", "przychody i zysk", not m.get("spadek_2l"))]
    elif typ == "Cykliczna":
        lista += [("Zapasy nie rosną szybciej niż sprzedaż (koniec cyklu)", zap_txt, zap_ok),
                  ("Brak gwałtownej rozbudowy mocy (capex ≥ 2× w 2 lata)", "rampa capex" if m.get("rampa_capex") else "nie", not m.get("rampa_capex")),
                  ("Sprzedaż w ostatnim kwartale rośnie r/r", pct(m.get("rev_q_yoy")), None if m.get("rev_q_yoy") is None else m["rev_q_yoy"] >= 0),
                  ("Niskie P/E nie przy zysku na szczycie (zysk +50 % r/r i P/E w dolnej połowie)", f"zysk {pct(m.get('ni_1y'))}, P/E {pe:.1f}".replace(".", ",") if pe else "–",
                   None if m.get("ni_1y") is None or not pe else not (m["ni_1y"] > 0.5 and pm and pe < pm))]
    elif typ == "Wychodząca z kłopotów":
        lista += [("Dług nie rośnie 5 kwartałów z rzędu", f"rośnie {dl} kw. z rzędu" if dl is not None else "–", None if dl is None else dl < 5),
                  ("Zapasy nie rosną szybciej niż sprzedaż", zap_txt, zap_ok),
                  ("Naprawa już się dokonała? (zysk dodatni i rośnie — wtedy to już nie okazja, przeklasyfikuj)", pct(m.get("ni_1y")), None)]
    elif typ == "Ukryte aktywa":
        lista += [("Zarząd nie rozwadnia akcji (liczba akcji 3 lata ≤ +5 %)", pct(m.get("akcje_3l")), None if m.get("akcje_3l") is None else m["akcje_3l"] <= 0.05),
                  ("Gotówka netto dodatnia", f"{100 * m['net_cash_mc']:.0f} % kapitalizacji" if m.get("net_cash_mc") is not None else "–",
                   None if m.get("net_cash_mc") is None else m["net_cash_mc"] > 0)]
    if typ != "Wychodząca z kłopotów" and dl is not None:
        lista.append(("Dług nie rośnie 5 kwartałów z rzędu", f"rośnie {dl} kw. z rzędu", dl < 5))
    zmiany = sum(1 for z in zd or [] for p in z["p"] if p[0] == "5.02")
    if typ == "Szybko rosnąca" and zd is not None:
        lista.append(("Zmiany w zarządzie w 12 mies. (8-K 5.02) — sprawdź, czy nie odchodzą kluczowi ludzie", f"{zmiany} raport(y)", None))
    g = m.get("eps_next5")
    wsk = (100 * g + 100 * (m.get("div") or 0)) / pe if g and pe and pe > 0 else None
    # wynik etapu 92 (research/wyniki/r117_etap92.md): ⚠ tylko dla sygnałów potwierdzonych w teście; reszta = „niepotwierdzony” / „nietestowany”
    lista = [(co, w, s, TEST_LYNCH.get((typ, co), "nietestowany")) for co, w, s in lista]
    return dict(faza=faza(m) if typ == "Szybko rosnąca" else None, lista=lista, wskaznik=wsk)


_NP = "niepotwierdzony"
TEST_LYNCH = {
    ("Szybko rosnąca", "Faza szybkiej ekspansji trwa"): _NP,
    ("Szybko rosnąca", "Sprzedaż nie hamuje 2 kwartały z rzędu"): _NP,
    ("Szybko rosnąca", "P/E nie jest absurdalnie wysokie względem wzrostu (PEG < 2)"): _NP,
    ("Szybko rosnąca", "Zapasy nie rosną szybciej niż sprzedaż"): _NP,
    ("Stabilnie rosnąca", "P/E nie odbiegło wysoko od normalnego (≤ 1,3 × mediana z 5 lat)"): _NP,
    ("Stabilnie rosnąca", "Wzrost przychodów nie hamuje (ostatni rok ≥ średnia 5 lat − 5 pp)"): _NP,
    ("Stabilnie rosnąca", "Fundamenty nie słabną 2 lata z rzędu"): _NP,
    ("Wolno rosnąca", "Sprzedaż nie spada 2 lata z rzędu (utrata rynku)"): "potwierdzony",
    ("Wolno rosnąca", "Dywidenda rośnie 5 lat z rzędu"): "potwierdzony",                       # etap 93: +10,8 pp w 3 lata
    ("Stabilnie rosnąca", "Wysoka marża netto (górna 1/3 stabilnie rosnących)"): "potwierdzony",  # etap 93: +28 pp w 3 lata
    ("Cykliczna", "Zapasy nie rosną szybciej niż sprzedaż (koniec cyklu)"): _NP,
    ("Cykliczna", "Brak gwałtownej rozbudowy mocy (capex ≥ 2× w 2 lata)"): _NP,
    ("Cykliczna", "Sprzedaż w ostatnim kwartale rośnie r/r"): _NP,
    ("Cykliczna", "Niskie P/E nie przy zysku na szczycie (zysk +50 % r/r i P/E w dolnej połowie)"): _NP,
}


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
    duz = [("Kapitalizacja ≥ 100 mld USD", m.get("mcap"), _gt(m.get("mcap"), 100e9 - 1)),
           ("Przychody rosły w ≥ 8 z 10 lat", m.get("przych_lata_wzrostu_10"), (m.get("przych_lata_wzrostu_10") or 0) >= 8),
           ("Przychody ≥ 2 × w 10 lat", m.get("przych_10l"), _gt(m.get("przych_10l"), 2 - 1e-9)),
           ("ROE > 15 %", m.get("roe"), _gt(m.get("roe"), 0.15)),
           ("FCF > 0", m.get("fcf_ttm"), _gt(m.get("fcf_ttm"), 0)),
           ("Dług / kapitał 0–1", m.get("de"), m.get("de") is not None and 0 <= m["de"] < 1)]
    out = {"Jakość (7 kryteriów)": jak, "Konsekwentny wzrost": kon, "Duży zwycięzca (10+ lat)": duz, "Zyskowność (4 kryteria)": zys, "Przepływy pieniężne (4 kryteria)": prz}
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
