"""GPW (Fundamenta): WIG20 + mWIG40 + sWIG80 bez sektorów trudnych do przewidzenia — wskaźniki z yfinance (roczne ok. 4–5 lat + kwartały), oceny
na tle tych spółek i listy kontrolne z OBNIŻONYMI progami wzrostu (użytkownik: „dla GPW trzeba zmniejszyć procenty wzrostowe, to wolniejszy rynek”).
Progi GPW nie są przetestowane (brak historii danych) — strona to zaznacza. Wynik: docs/data/gpw.json.

python gpw.py [--cache DIR] [--out docs/data/gpw.json]
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import time

import requests

INDEKSY = ("WIG20", "mWIG40", "sWIG80")
SKLAD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs", "data", "gpw_sklad.json")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs", "data", "gpw.json")
SEKTORY_WYKL = {"Financial Services", "Basic Materials", "Energy", "Utilities", "Real Estate"}     # jak w USA (spolki.wybierz)
UA = {"User-Agent": "Mozilla/5.0 (Fundamenta research bot)"}

# progi GPW (obniżone progi wzrostu względem USA; pozostałe jak w USA) — NIETESTOWANE
GPW_PROGI = dict(rev_cagr3=0.05, rev_3y=0.16, rok=0.03, lata_wzrostu=0.06)


def sklad(log=print):
    """Skład indeksów z biznesradar.pl; przy błędzie — ostatni zapisany (docs/data/gpw_sklad.json)."""
    out = {}
    for ind in INDEKSY:
        try:
            h = requests.get(f"https://www.biznesradar.pl/gielda/indeks:{ind}", headers=UA, timeout=30).text
            t = sorted({x for x in re.findall(r'href="/notowania/[A-Z0-9\-]+"[^>]*>\s*([A-Z0-9]{2,6})', h) if x != ind.upper() and x != ind})
            if len(t) >= {"WIG20": 15, "mWIG40": 30, "sWIG80": 60}[ind]:
                out[ind] = t
        except requests.RequestException as e:
            log(f"skład {ind}: błąd ({e})")
    if len(out) == len(INDEKSY):
        json.dump(dict(data=dt.date.today().isoformat(), **out), open(SKLAD, "w"), ensure_ascii=False)
        return out
    log("skład: używam ostatniego zapisanego")
    d = json.load(open(SKLAD)) if os.path.exists(SKLAD) else {}
    return {k: d[k] for k in INDEKSY if k in d}


def _wiersz(df, nazwy):
    for n in nazwy:
        if df is not None and n in df.index:
            s = df.loc[n].dropna()
            if len(s):
                return {c.strftime("%Y-%m-%d"): float(v) for c, v in s.items()}
    return {}


def pobierz(t, cache=None):
    """Surowe dane yfinance dla tickera GPW (z pamięci podręcznej do 6 dni)."""
    p = os.path.join(cache, f"{t}.json") if cache else None
    if p and os.path.exists(p) and time.time() - os.path.getmtime(p) < 6 * 86400:
        return json.load(open(p))
    import yfinance as yf
    tk = yf.Ticker(f"{t}.WA")
    inf = tk.info or {}
    f, b, c, q = tk.financials, tk.balance_sheet, tk.cashflow, tk.quarterly_financials
    h = tk.history(period="5y", interval="1wk", auto_adjust=True)
    d = dict(
        info={k: inf.get(k) for k in ("longName", "shortName", "sector", "industry", "marketCap", "currentPrice", "trailingPE", "dividendYield",
                                       "sharesOutstanding", "currency", "financialCurrency", "website")},
        rev=_wiersz(f, ["Total Revenue", "Operating Revenue"]), ni=_wiersz(f, ["Net Income Common Stockholders", "Net Income"]),
        op=_wiersz(f, ["Operating Income", "EBIT"]), gp=_wiersz(f, ["Gross Profit"]), norm=_wiersz(f, ["Normalized Income"]),
        eq=_wiersz(b, ["Stockholders Equity", "Common Stock Equity"]), assets=_wiersz(b, ["Total Assets"]), lc=_wiersz(b, ["Current Liabilities"]),
        debt=_wiersz(b, ["Total Debt"]), cash=_wiersz(b, ["Cash Cash Equivalents And Short Term Investments", "Cash And Cash Equivalents"]),
        ocf=_wiersz(c, ["Operating Cash Flow"]), capex=_wiersz(c, ["Capital Expenditure"]), fcf=_wiersz(c, ["Free Cash Flow"]),
        div=_wiersz(c, ["Cash Dividends Paid", "Common Stock Dividend Paid"]),
        q_rev=_wiersz(q, ["Total Revenue", "Operating Revenue"]), q_ni=_wiersz(q, ["Net Income Common Stockholders", "Net Income"]),
        ceny=[[x.strftime("%Y-%m-%d"), round(float(v), 2)] for x, v in h["Close"].dropna().items()] if h is not None and len(h) else [])
    if p:
        json.dump(d, open(p, "w"))
    return d


def _lata(s):
    return [v for _, v in sorted(s.items())]


def metryki(d):
    """Wskaźniki z danych rocznych (ostatni rok obrotowy) i kwartalnych (TTM z 4 kwartałów, jeśli są)."""
    inf, m = d.get("info") or {}, {}
    m["mcap"], m["price"], m["pe"] = inf.get("marketCap"), inf.get("currentPrice"), inf.get("trailingPE")
    m["div"] = (inf.get("dividendYield") or 0) / (100 if (inf.get("dividendYield") or 0) > 1 else 1)
    rev, ni = _lata(d.get("rev") or {}), _lata(d.get("ni") or {})
    qr, qn = _lata(d.get("q_rev") or {}), _lata(d.get("q_ni") or {})
    m["rev_ttm"] = sum(qr[-4:]) if len(qr) >= 4 else (rev[-1] if rev else None)
    m["ni_ttm"] = sum(qn[-4:]) if len(qn) >= 4 else (ni[-1] if ni else None)
    g = [rev[k + 1] / rev[k] - 1 for k in range(len(rev) - 1) if rev[k] and rev[k] > 0]
    m["rev_lata"] = g[-4:]
    m["rev_1y"] = g[-1] if g else None
    if len(rev) >= 4 and rev[-4] and rev[-4] > 0 and rev[-1] > 0:
        m["rev_3y"] = rev[-1] / rev[-4] - 1
        m["rev_cagr3"] = (rev[-1] / rev[-4]) ** (1 / 3) - 1
    m["ni_1y"] = ni[-1] / ni[-2] - 1 if len(ni) >= 2 and ni[-2] and ni[-2] > 0 and ni[-1] > 0 else None
    if len(ni) >= 4 and ni[-4] and ni[-4] > 0 and ni[-1] > 0:
        m["ni_cagr3"] = (ni[-1] / ni[-4]) ** (1 / 3) - 1
    m["lata_wzrostu"] = sum(x > GPW_PROGI["lata_wzrostu"] for x in g[-3:]) if len(g) >= 3 else None
    def last(k):
        return _lata(d.get(k) or {})[-1] if d.get(k) else None
    eq, assets, lc, debt, cash = last("eq"), last("assets"), last("lc"), last("debt") or 0.0, last("cash")
    op, gp, fcf, ocf = last("op"), last("gp"), last("fcf"), last("ocf")
    r0 = rev[-1] if rev else None
    if r0:
        m["gm"] = gp / r0 if gp is not None else None
        m["om"] = op / r0 if op is not None else None
        m["nm"] = ni[-1] / r0 if ni else None
        m["fcf_margin"] = fcf / r0 if fcf is not None else None
    if eq and eq > 0 and ni:
        m["roe"] = ni[-1] / eq
        m["de"] = debt / eq
        eqs = _lata(d.get("eq") or {})
        if len(eqs) >= 4 and len(ni) >= 4 and eqs[-4] and eqs[-4] > 0:
            m["roe_wcz"] = ni[-4] / eqs[-4]
    if assets and ni:
        m["roa"] = ni[-1] / assets
        if lc is not None and op is not None and assets - lc > 0:
            m["roce"] = op / (assets - lc)
    if ocf is not None and debt:
        m["ocf_dlug"] = ocf / debt
    if cash is not None and m["mcap"]:
        m["net_cash_mc"] = (cash - debt) / m["mcap"]
    if fcf and m["mcap"] and fcf > 0:
        m["pfcf"] = m["mcap"] / fcf
    if m["rev_ttm"] and m["mcap"]:
        m["ps"] = m["mcap"] / m["rev_ttm"]
    # PEG z przeszłego wzrostu zysku (3 lata) — prognoz analityków na 5 lat dla GPW nie mamy
    if m["pe"] and m["pe"] > 0 and m.get("ni_cagr3") and m["ni_cagr3"] > 0:
        m["peg"] = m["pe"] / (100 * m["ni_cagr3"])
    # zysk znormalizowany (yfinance „Normalized Income”: bez pozycji jednorazowych)
    nr = _lata(d.get("norm") or {})
    if nr and ni and ni[-1] > 0 and nr[-1] > 0 and m["pe"]:
        m["pe_norm"] = m["pe"] * ni[-1] / nr[-1]
    # ⬇ fundamenty słabną 2 lata z rzędu (roczne przychody lub zysk netto)
    sp = []
    for nm_, s in (("przychody", rev), ("zysk netto", ni)):
        if len(s) >= 3 and s[-1] < s[-2] < s[-3]:
            sp.append(nm_)
    m["spadek_2l"] = sp or None
    # pola karty spółki (te same nazwy co w USA)
    m["fcf_ttm"], m["cash"], m["debt"], m["roe_sec"] = fcf, cash, debt, m.get("roe")
    m["shares"] = (m["mcap"] / m["price"]) if m["mcap"] and m["price"] else inf.get("sharesOutstanding")
    m["eps"] = m["price"] / m["pe"] if m["price"] and m["pe"] and m["pe"] > 0 else None
    if cash is not None:
        m["net_cash"] = cash - debt
    if m.get("ni_cagr3") is not None:
        m["ni_3y"] = (1 + m["ni_cagr3"]) ** 3 - 1
    if m.get("pfcf"):
        m["fcf_yield"] = 1 / m["pfcf"]
    if len(g) >= 3:
        m["rev_lata_10"] = sum(x > 0.10 for x in g[-5:])
    c = [x[1] for x in d.get("ceny") or []]
    if len(c) >= 53:
        m["zw_1r"] = c[-1] / c[-53] - 1
    if len(c) >= 52:
        m["od_maks_12m"] = c[-1] / max(c[-52:]) - 1
    if len(c) >= 2:
        def zw_(n):
            return c[-1] / c[-1 - n] - 1 if len(c) > n else None
        m["zw"] = {"1t": zw_(1), "1m": zw_(4), "1r": zw_(52), "5l": zw_(len(c) - 1) if len(c) >= 250 else None}
    return m


def _gt(x, p):
    return x is not None and x > p


def strategie(m):
    """Listy kontrolne z obniżonymi progami wzrostu (GPW): {nazwa: [(kryterium, wartość, spełnione)]}."""
    P = GPW_PROGI
    de_ok = m.get("de") is not None and 0 <= m["de"] < 1
    return {
        "Jakość (7 kryteriów, GPW)": [
            (f"Przychody 3 lata > {100 * P['rev_cagr3']:.0f} % rocznie", m.get("rev_cagr3"), _gt(m.get("rev_cagr3"), P["rev_cagr3"])),
            ("Dług / kapitał 0–1", m.get("de"), de_ok), ("FCF > 0", m.get("fcf_ttm"), _gt(m.get("fcf_margin"), 0)),
            ("ROE > 15 %", m.get("roe"), _gt(m.get("roe"), 0.15)), ("ROA > 10 %", m.get("roa"), _gt(m.get("roa"), 0.10)),
            ("ROE wyższe niż 3 lata temu", m.get("roe_wcz"), m.get("roe") is not None and m.get("roe_wcz") is not None and m["roe"] >= m["roe_wcz"]),
            ("ROCE > 15 %", m.get("roce"), _gt(m.get("roce"), 0.15))],
        "7/7 (niskie ryzyko, GPW)": [
            (f"Przychody 3 lata > +{100 * P['rev_3y']:.0f} %", m.get("rev_3y"), _gt(m.get("rev_3y"), P["rev_3y"])),
            (f"Przychody 1 rok > {100 * P['rok']:.0f} %", m.get("rev_1y"), _gt(m.get("rev_1y"), P["rok"])),
            (f"Zysk 1 rok > {100 * P['rok']:.0f} %", m.get("ni_1y"), _gt(m.get("ni_1y"), P["rok"])),
            ("ROE > 15 %", m.get("roe"), _gt(m.get("roe"), 0.15)), ("Dług / kapitał 0–1", m.get("de"), de_ok),
            ("FCF > 0", m.get("fcf_ttm"), _gt(m.get("fcf_margin"), 0)),
            ("PEG 0–2 (z przeszłego wzrostu zysku)", m.get("peg"), m.get("peg") is not None and 0 < m["peg"] < 2)],
        "Konsekwentny wzrost (GPW)": [
            (f"Przychody > {100 * P['lata_wzrostu']:.0f} % w ≥ 2 z 3 lat", m.get("lata_wzrostu"), m.get("lata_wzrostu") is not None and m["lata_wzrostu"] >= 2),
            ("Dług / kapitał < 1", m.get("de"), m.get("de") is not None and m["de"] < 1), ("FCF > 0", m.get("fcf_ttm"), _gt(m.get("fcf_margin"), 0))],
    }


GRUPY = {"wzrost": [("rev_1y", 1), ("rev_cagr3", 1), ("ni_1y", 1), ("ni_cagr3", 1), ("lata_wzrostu", 1)],
         "sila": [("gm", 1), ("om", 1), ("nm", 1), ("roe", 1), ("roa", 1), ("roce", 1), ("fcf_margin", 1), ("de", -1), ("net_cash_mc", 1)],
         "wycena": [("pe", -1), ("peg", -1), ("ps", -1), ("pfcf", -1)]}
DOD = {"pe", "peg", "ps", "pfcf"}


def oceny(rows):
    """Percentyl każdego wskaźnika wśród spółek GPW z listy; ocena grupy = średnia × 10 (brak = 0,5); ogólna 0,4 / 0,35 / 0,25 (jak w USA)."""
    for gr, pola in GRUPY.items():
        for p, kier in pola:
            v = [(r, r["m"].get(p)) for r in rows]
            ok = [(r, x) for r, x in v if x is not None and (p not in DOD or x > 0) and (p != "de" or x >= 0)]
            s = sorted(x for _, x in ok)
            for r, x in ok:
                lo, eq = sum(1 for y in s if y < x), sum(1 for y in s if y == x)
                pc = (lo + eq / 2) / len(s)
                r.setdefault("pct", {})[p] = pc if kier > 0 else 1 - pc
    for r in rows:
        pc, o = r.get("pct", {}), {}
        for gr, pola in GRUPY.items():
            vals = [pc.get(p, 0.5) for p, _ in pola]
            n_ = sum(1 for p, _ in pola if p in pc)
            o[gr] = round(10 * sum(vals) / len(vals), 1) if n_ >= 2 else None
        if o["wzrost"] is not None and (o["sila"] is not None or o["wycena"] is not None):
            w = [(o[k], wg) for k, wg in (("wzrost", 0.4), ("sila", 0.35), ("wycena", 0.25)) if o[k] is not None]
            o["ogolna"] = round(sum(a * b for a, b in w) / sum(b for _, b in w), 1)
        else:
            o["ogolna"] = None
        r["oceny"] = o


def etykieta(peg):
    if peg is None or peg <= 0:
        return None
    return "Bardzo tania" if peg < 0.5 else "Niedowartościowana" if peg < 1 else "Wyceniona uczciwie" if peg < 2 else "Droga" if peg < 3 else "Bardzo droga"


def _czysc(x):
    if isinstance(x, float):
        return round(x, 6) if x == x and abs(x) != float("inf") else None
    if isinstance(x, dict):
        return {k: _czysc(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_czysc(v) for v in x]
    return x


NAZWY = {"rev_1y": "Przychody 1 rok", "rev_cagr3": "Przychody 3 lata (rocznie)", "ni_1y": "Zysk netto 1 rok", "ni_cagr3": "Zysk netto 3 lata (rocznie)",
         "lata_wzrostu": "Lata ze wzrostem przychodów > 6 % (z 3)", "gm": "Marża brutto", "om": "Marża operacyjna", "nm": "Marża netto", "roe": "ROE", "roa": "ROA",
         "roce": "ROCE", "fcf_margin": "Marża FCF", "de": "Dług / kapitał", "net_cash_mc": "Gotówka netto / kapitalizacja", "pe": "P/E", "peg": "PEG (z przeszłego wzrostu)",
         "ps": "P/S", "pfcf": "P/FCF"}
DANE = {}


def karty(rows, katalog, dane):
    """Karty spółek GPW w formacie karty USA (spolka.html?r=gpw): oceny, typ Lyncha (progi GPW), PEG z przeszłego wzrostu zysku, DCF, sprawozdania, ceny."""
    from momentum import ocena
    os.makedirs(katalog, exist_ok=True)
    for f in os.listdir(katalog):
        os.remove(os.path.join(katalog, f))
    med = {}
    for gr, pola in GRUPY.items():
        for p, _ in pola:
            v = sorted(r["m"][p] for r in rows if r["m"].get(p) is not None)
            if v:
                med[p] = v[len(v) // 2]
    for nr, r in enumerate(rows, 1):
        m, d = r["m"], dane.get(r["t"]) or {}
        # typ Lyncha: wzrost z 3 lat (zamiast 5), progi obniżone o 3 pp, „duża spółka” ≥ 5 mld zł (zamiast 20 mld USD)
        mt = dict(m, rev_cagr5=m.get("rev_cagr3"), eps_next5=None)
        typy = ocena.typy(mt, r["s"], duza=5e9, g_off=0.03)
        zam = (("≥ 20 % rocznie", "≥ 17 % rocznie (próg GPW)"), ("duża spółka, przychody +8–18 % rocznie", "duża jak na GPW (≥ 5 mld zł), przychody +5–15 % rocznie"),
               ("przychody < 8 % rocznie", "przychody < 5 % rocznie (próg GPW)"))
        def _opis(c):
            for o, n in zam:
                c = c.replace(o, n)
            return c
        typy = [(a_, b_, _opis(c_)) for a_, b_, c_ in typy]
        hist = dict(q=[[e, v, (d.get("q_ni") or {}).get(e), None, None, None] for e, v in sorted((d.get("q_rev") or {}).items())],
                    y=[[e, v, (d.get("ni") or {}).get(e), (d.get("fcf") or {}).get(e), None] for e, v in sorted((d.get("rev") or {}).items())])
        try:
            dcf = ocena.dcf_scenariusze(m, hist, r["s"])
        except Exception:  # noqa: BLE001
            dcf = None
        m["dcf"] = dcf["base"]["wartosc"] if dcf else None
        m["dcf_pot"] = m["dcf"] / m["price"] - 1 if m.get("dcf") is not None and m.get("price") else None
        typ = typy[0][0] if typy else None
        n_ = sum(1 for p in NAZWY if p in (r.get("pct") or {}))
        ceny = d.get("ceny") or []
        karta = dict(t=r["t"], n=r["n"], sector=r["s"], industry=r["i"], country="Polska", www=r.get("www"), rank=nr, m=m, pct=r.get("pct") or {}, oceny=r["oceny"],
                     typy=typy, strategie=r["st"], peg=ocena.peg_scenariusze(m.get("pe"), m.get("ni_cagr3")), dcf=dcf, etykieta=r["et"], hist=hist,
                     zw=m.get("zw") or {}, kompletnosc=dict(liczone=n_, wszystkie=len(NAZWY), niepelne=n_ < 0.75 * len(NAZWY), kategorie=[]), med500=med,
                     ostrzezenia=([f"Fundamenty słabną 2 lata z rzędu: {' i '.join(m['spadek_2l'])}."] if m.get("spadek_2l") else []),
                     zdarzenia=None, lynch=ocena.lynch(m, typ, None), ceny={"d": [x[0] for x in ceny], "c": [x[1] for x in ceny]} if ceny else None,
                     grupy={g: [[p, NAZWY[p]] for p, _ in pola] for g, pola in GRUPY.items()}, generated_at=dt.date.today().isoformat(), dcf_param=ocena.DCF, gpw=True)
        r["typ"] = typ
        json.dump(_czysc(karta), open(os.path.join(katalog, f"{r['t']}.json"), "w"), ensure_ascii=False, separators=(",", ":"))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cache", default=None)
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args(argv)
    sk = sklad()
    if not sk:
        print("Brak składu indeksów — nic nie zapisuję.")
        return 1
    ind = {t: i for i in INDEKSY for t in sk.get(i, [])}
    if a.cache:
        os.makedirs(a.cache, exist_ok=True)
    rows, bledy, wykl = [], [], []
    for n, t in enumerate(sorted(ind)):
        try:
            d = pobierz(t, a.cache)
        except Exception as e:  # noqa: BLE001
            bledy.append(t)
            print(f"{t}: błąd ({e})")
            continue
        inf = d.get("info") or {}
        if not d.get("rev") or not inf.get("marketCap"):
            bledy.append(t)
            continue
        if inf.get("sector") in SEKTORY_WYKL:
            wykl.append(t)
            continue
        m = metryki(d)
        DANE[t] = d
        rows.append(dict(t=t, n=inf.get("longName") or inf.get("shortName") or t, s=inf.get("sector"), i=inf.get("industry"), ind=ind[t], www=inf.get("website"),
                         m=m, st=strategie(m), et=etykieta(m.get("peg")), ceny=d.get("ceny")[-260:] if d.get("ceny") else None))
        if (n + 1) % 20 == 0:
            print(f"GPW: {n + 1}/{len(ind)}", flush=True)
        if not a.cache or not os.path.exists(os.path.join(a.cache, f"{t}.json")):
            time.sleep(1.0)
    if len(rows) < 40:
        print(f"Za mało spółek z danymi ({len(rows)}) — nic nie zapisuję.")
        return 1
    oceny(rows)
    rows.sort(key=lambda r: -(r["m"].get("mcap") or 0))
    karty(rows, os.path.join(os.path.dirname(a.out), "gpw", "spolki"), DANE)
    out = dict(generated_at=dt.date.today().isoformat(), progi=GPW_PROGI, wykluczone=wykl, bez_danych=bledy, rows=rows)
    json.dump(_czysc(out), open(a.out, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"Zapisano {len(rows)} spółek GPW; wykluczone sektory: {len(wykl)}; bez danych: {len(bledy)} ({', '.join(bledy[:20])}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
