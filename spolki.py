"""Dane strony „Fundamenta — jakość vs wycena”: 500 największych spółek USA (Finviz) + raporty SEC + ceny tygodniowe (yfinance)
-> docs/data/lista.json (tabela) i docs/data/spolki/<TICKER>.json (karta spółki).

Uruchamiany co tydzień przez workflow „Dane spółek” (i ręcznie). Kolejność: sito Finviz cap_largeover (widoki 111 / 121 / 161, wszystkie strony),
500 największych wg kapitalizacji bez sektorów: finanse, surowce, energia, użyteczność publiczna, nieruchomości; CIK z listy SEC; companyfacts każdej spółki (4 wątki); ceny tygodniowe 5 lat; wskaźniki i oceny (momentum/ocena.py)."""
import argparse
import datetime as dt
import json
import os
import re
import sys
import threading
import time

import requests

from momentum import fundamenty, ocena, zdarzenia

OUT = os.path.join("docs", "data")
URL = "https://finviz.com/screener/stocks"
HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
UA = {"User-Agent": os.environ.get("SEC_UA") or "Fundamenta research bot admin@example.com"}
VIEWS = ("111", "121", "161")


def ssr_rows(page):
    m = re.search(r'<script type="application/json" data-ssr-props="[^"]*">(.*?)</script>', page, re.S)
    if not m:
        return [], None
    data = json.loads(m.group(1)).get("data") or {}
    rows = [{**(r.get("text") or {}), **(r.get("numbers") or {})} for r in data.get("rows") or []]
    return [r for r in rows if r.get("ticker")], data.get("totalCount")


def finviz(filters="cap_largeover", log=print, get=None, pause=0.7):
    get = get or requests.Session().get
    out, total = {}, None
    for v in VIEWS:
        off = 1
        for _ in range(80):
            r = None
            for proba, czekaj in enumerate((0, 60, 180, 420)):      # Finviz bywa chwilowo niedostępny (403 / 429 po wielu zapytaniach) — czekamy i ponawiamy
                if czekaj:
                    log(f"Finviz odmówił ({r.status_code}), ponawiam za {czekaj} s (próba {proba + 1})")
                    time.sleep(czekaj)
                r = get(URL, params={"v": v, "f": filters, "r": off}, headers=HEADERS, timeout=30)
                if r.status_code not in (403, 429, 503):
                    break
            r.raise_for_status()
            rows, t = ssr_rows(r.text)
            total = t if t is not None else total
            for x in rows:
                out.setdefault(x["ticker"], {}).update({k: val for k, val in x.items() if val is not None})
            off += 20
            if not rows or (total and off > total):
                break
            time.sleep(pause)
        log(f"Finviz widok {v}: {len(out)} spółek")
    return out


def sec_get(url, tries=5):
    for i in range(tries):
        try:
            r = requests.get(url, headers=UA, timeout=90)
            if r.status_code == 404:
                return None
            if r.status_code == 200:
                return r.json()
        except requests.RequestException:
            pass
        time.sleep(2 ** i)
    return None


def cik_mapa():
    return {v["ticker"].upper().replace(".", "-"): int(v["cik_str"]) for v in (sec_get("https://www.sec.gov/files/company_tickers.json") or {}).values()}


def sec_zdarzenia(tickers, mapa, cache=None, log=print, watki=4):
    """Zdarzenia z raportów 8-K / spóźnionych i poprawionych raportów okresowych (momentum/zdarzenia.py), ostatnie 12 miesięcy."""
    zad = [t for t in tickers if t in mapa]
    out, wyd, lock = {}, {}, threading.Lock()
    def praca():
        while True:
            with lock:
                if not zad:
                    return
                t = zad.pop()
            p = os.path.join(cache, f"{t}.zd.json") if cache else None
            d = json.load(open(p)) if p and os.path.exists(p) and time.time() - os.path.getmtime(p) < 2 * 86400 else None
            if d is None:
                d = sec_get(f"https://data.sec.gov/submissions/CIK{mapa[t]:010d}.json")
                d = {"filings": {"recent": (d or {}).get("filings", {}).get("recent", {})}} if d else None
                if p and d:
                    json.dump(d, open(p, "w"))
                time.sleep(0.25)
            with lock:
                out[t] = zdarzenia.z_submissions(d, mapa[t])
                wyd[t] = zdarzenia.wydzielenie(d)
    th = [threading.Thread(target=praca) for _ in range(watki)]
    [x.start() for x in th]
    [x.join() for x in th]
    log(f"Zdarzenia SEC: {len(out)} spółek, poważne w {sum(1 for v in out.values() if any(z['poz'] == 2 for z in v))}, wydzielone ze spółki matki: {sum(1 for v in wyd.values() if v)}")
    return out, wyd


def insiderzy(cache=None, log=print, kwartaly=4, dzis=None):
    """Lynch: zakupy akcji przez zarząd i radę (członkowie zarządu, dyrektorzy) na rynku w ostatnich 12 mies. — zbiorcze dane SEC z formularzy 3/4/5
    (pliki kwartalne). {cik: {kupno: USD, kupujacy: liczba osób, sprzedaz: USD}}. Kod transakcji P = kupno na rynku, S = sprzedaż."""
    import csv
    import io
    import zipfile
    dzis = dzis or dt.date.today()
    od = dzis - dt.timedelta(days=365)
    try:
        strona = requests.get("https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets", headers=UA, timeout=60).text
    except requests.RequestException as e:
        log(f"Insiderzy: brak listy plików ({e})")
        return {}
    pliki = sorted(set(re.findall(r'href="([^"]*?(\d{4}q\d)_form345\.zip)"', strona)), key=lambda x: x[1], reverse=True)[:kwartaly]
    out = {}
    for url, kw in pliki:
        p = os.path.join(cache, f"form345_{kw}.zip") if cache else None
        if p and os.path.exists(p) and time.time() - os.path.getmtime(p) < 6 * 86400:
            dane = open(p, "rb").read()
        else:
            try:
                r = requests.get("https://www.sec.gov" + url if url.startswith("/") else url, headers=UA, timeout=180)
                r.raise_for_status()
                dane = r.content
            except requests.RequestException as e:
                log(f"Insiderzy {kw}: błąd ({e})")
                continue
            if p:
                open(p, "wb").write(dane)
            time.sleep(0.5)
        z = zipfile.ZipFile(io.BytesIO(dane))
        czytaj = lambda n: csv.DictReader(io.TextIOWrapper(z.open(n), encoding="utf-8", errors="replace"), delimiter="\t")   # noqa: E731
        sub = {r["ACCESSION_NUMBER"]: r["ISSUERCIK"].lstrip("0") for r in czytaj("SUBMISSION.tsv") if r.get("DOCUMENT_TYPE", "").startswith("4")}
        rola = {}
        for r in czytaj("REPORTINGOWNER.tsv"):
            rel = r.get("RPTOWNER_RELATIONSHIP") or ""
            if "Director" in rel or "Officer" in rel:                     # zarząd i rada; sami duzi akcjonariusze (10 %) się nie liczą
                rola.setdefault(r["ACCESSION_NUMBER"], set()).add(r["RPTOWNERCIK"])
        for r in czytaj("NONDERIV_TRANS.tsv"):
            a = r["ACCESSION_NUMBER"]
            if a not in sub or a not in rola or r.get("TRANS_CODE") not in ("P", "S"):
                continue
            try:
                d_ = dt.datetime.strptime(r["TRANS_DATE"][:11], "%d-%b-%Y").date()
                v = float(r["TRANS_SHARES"] or 0) * float(r["TRANS_PRICEPERSHARE"] or 0)
            except ValueError:
                continue
            if d_ < od or v <= 0:
                continue
            o = out.setdefault(sub[a], {"kupno": 0.0, "sprzedaz": 0.0, "kupujacy": set()})
            if r["TRANS_CODE"] == "P":
                o["kupno"] += v
                o["kupujacy"] |= rola[a]
            else:
                o["sprzedaz"] += v
        log(f"Insiderzy {kw}: spółek z transakcjami {len(out)}")
    return {c: {"kupno": o["kupno"], "sprzedaz": o["sprzedaz"], "kupujacy": len(o["kupujacy"])} for c, o in out.items()}


def yf_info(tickers, cache=None, log=print, watki=8):
    """Lynch (13 cech, lista kontrolna): udział funduszy w akcjonariacie i liczba analityków (yfinance info), {t: {inst, analitycy}}."""
    import yfinance as yf
    zad, out, lock = list(tickers), {}, threading.Lock()
    def praca():
        while True:
            with lock:
                if not zad:
                    return
                t = zad.pop()
            p = os.path.join(cache, f"{t}.yi.json") if cache else None
            d = json.load(open(p)) if p and os.path.exists(p) and time.time() - os.path.getmtime(p) < 6 * 86400 else None
            if d is None:
                try:
                    i = yf.Ticker(t.replace(".", "-")).info or {}
                    d = {"inst": i.get("heldPercentInstitutions"), "analitycy": i.get("numberOfAnalystOpinions")}
                except Exception:  # noqa: BLE001 — pojedyncza spółka bez danych nie przerywa pobierania
                    d = {}
                if p and d:
                    json.dump(d, open(p, "w"))
            with lock:
                out[t] = d
    th = [threading.Thread(target=praca) for _ in range(watki)]
    [x.start() for x in th]
    [x.join() for x in th]
    log(f"yfinance info: {sum(1 for v in out.values() if v.get('inst') is not None)} spółek z udziałem funduszy")
    return out


def recesja_2020(tickers, log=print):
    """Lynch: jak spółka zniosła recesję — spadek kursu od szczytu (styczeń–luty 2020) do dołka (marzec–kwiecień 2020) i to samo dla S&P 500 (SPY)."""
    import yfinance as yf
    out = {}
    lst = list(tickers) + ["SPY"]
    for i in range(0, len(lst), 100):
        part = lst[i:i + 100]
        try:
            d = yf.download(part, start="2020-01-01", end="2020-05-01", interval="1d", auto_adjust=True, progress=False, group_by="column", threads=True)["Close"]
        except Exception as e:  # noqa: BLE001
            log(f"recesja 2020: błąd ({e})")
            continue
        for t in part:
            if t in d:
                s_ = d[t].dropna()
                a, b = s_[: "2020-02-29"], s_["2020-03-01":]
                if len(a) > 10 and len(b) > 10:
                    out[t] = float(b.min() / a.max() - 1)
    log(f"recesja 2020: {len(out)} spółek")
    return out


def sec_wyciagi(tickers, cache=None, log=print, watki=4, mapa=None):
    mapa = mapa or cik_mapa()
    zad = [t for t in tickers if t in mapa]
    out, lock = {}, threading.Lock()
    def praca():
        while True:
            with lock:
                if not zad:
                    return
                t = zad.pop()
            p = os.path.join(cache, f"{t}.json") if cache else None
            ex = json.load(open(p)) if p and os.path.exists(p) and time.time() - os.path.getmtime(p) < 6 * 86400 else None
            if ex is None or ex.get("v", 1) < 9 and ex.get("rev"):    # stary format cache (bez waluty / akcji rozwodnionych / SBC, leasingu, skupu akcji, dywidend, SG&A i zobowiązań) -> pobierz ponownie
                d = sec_get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{mapa[t]:010d}.json")
                ex = fundamenty.wyciag(d["facts"]) if d and "facts" in d else {"waluta": None}
                if p:
                    json.dump(ex, open(p, "w"))
                time.sleep(0.25)
            with lock:
                out[t] = ex
                if len(out) % 100 == 0:
                    log(f"SEC: {len(out)}/{len(tickers)}")
    th = [threading.Thread(target=praca) for _ in range(watki)]
    [x.start() for x in th]
    [x.join() for x in th]
    waluty = sorted({ex.get("waluta") for ex in out.values() if ex.get("waluta") not in (None, "USD")})
    k = kursy(waluty, log)
    for t, ex in out.items():
        w = ex.get("waluta")
        if w and w != "USD":
            out[t] = fundamenty.przelicz(ex, k.get(w)) if k.get(w) else {}   # bez kursu nie mieszamy walut
    return out


def kursy(waluty, log=print):
    """{waluta: USD za 1 jednostkę} — bieżący kurs z yfinance (np. TWDUSD=X)."""
    if not waluty:
        return {}
    import yfinance as yf
    out = {}
    try:
        d = yf.download([f"{w}USD=X" for w in waluty], period="10d", interval="1d", progress=False, group_by="column")["Close"]
        for w in waluty:
            s = d[f"{w}USD=X"].dropna() if f"{w}USD=X" in d else []
            if len(s):
                out[w] = float(s.iloc[-1])
    except Exception as e:  # noqa: BLE001
        log(f"kursy walut: błąd ({e})")
    log(f"kursy walut: {', '.join(f'{w} {v:.4g}' for w, v in out.items())}")
    return out


def ceny(tickers, log=print):
    """{ticker: (daty, zamknięcia)} — tygodniowe, 5 lat, skorygowane (yfinance)."""
    import yfinance as yf
    out = {}
    for i in range(0, len(tickers), 100):
        part = tickers[i:i + 100]
        try:
            dd_ = yf.download(part, period="5y", interval="1wk", auto_adjust=True, progress=False, group_by="column", threads=True, actions=True)
            d, spl = dd_["Close"], dd_.get("Stock Splits")
        except Exception as e:  # noqa: BLE001
            log(f"yfinance: błąd ({e})")
            continue
        for t in part:
            if t in d:
                s = d[t].dropna()
                if len(s) > 10:
                    sp = spl[t].fillna(0) if spl is not None and t in spl else None
                    # splity (data, mnożnik liczby akcji) — do porównania liczby akcji w czasie (skup / rozwodnienie)
                    sp = [(x.strftime("%Y-%m-%d"), float(v)) for x, v in sp[sp > 0].items()] if sp is not None else []
                    out[t] = ([x.strftime("%Y-%m-%d") for x in s.index], [round(float(v), 2) for v in s.values], sp)
        log(f"ceny: {min(i + 100, len(tickers))}/{len(tickers)}")
    return out


def zwroty(c):
    if not c or len(c[1]) < 2:
        return {}
    v = c[1]
    def f(k):
        return v[-1] / v[-1 - k] - 1 if len(v) > k and v[-1 - k] > 0 else None
    return {"1t": f(1), "1m": f(4), "1r": f(52), "5l": v[-1] / v[0] - 1 if v[0] > 0 else None}


def finviz_z_kart(out=OUT):
    """Zapas, gdy Finviz blokuje serwery GitHuba (403, listopad 2026): wiersze w formacie Finviz odtworzone z ostatnich kart spółek
    (wskaźniki rynkowe i prognoza EPS z ostatniego udanego odczytu; ceny i wskaźniki zależne od ceny aktualizuje `aktualizuj_ceny`)."""
    d = os.path.join(out, "spolki")
    fv = {}
    pr = lambda x: None if x is None else x * 100        # noqa: E731 — Finviz podaje procenty
    for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        k = json.load(open(os.path.join(d, f)))
        m = k.get("m") or {}
        if not m.get("mcap") or not m.get("price"):
            continue
        fv[k["t"]] = dict(ticker=k["t"], company=k.get("n"), sector=k.get("sector"), industry=k.get("industry"), country=k.get("country"), www=k.get("www"),
                          price=m["price"], marketCap=m["mcap"] / 1e6, PE=m.get("pe"), forwardPE=m.get("fpe"), PS=m.get("ps"), PB=m.get("pb"), PC=m.get("pc"),
                          PFCF=m.get("pfcf"), dividendYield=pr(m.get("div")), estLTGrowth=pr(m.get("eps_next5")), epsYoY1=pr(m.get("eps_ny")),
                          grossMargin=pr(m.get("gm")), operMargin=pr(m.get("om")), netMargin=pr(m.get("nm")), roe=pr(m.get("roe")), roa=pr(m.get("roa")),
                          roi=pr(m.get("roic_fv")), curRatio=m.get("cr"), quickRatio=m.get("qr"), debtEq=m.get("de"),
                          sales5Years=pr(m.get("rev_cagr5")) if m.get("zrodlo_wzrostu") == "Finviz" else None, fv_data=k.get("fv_data") or k.get("generated_at"))
    return fv


def aktualizuj_ceny(fv, px):
    """Wiersze z kart: cena z ostatniego notowania tygodniowego, wskaźniki cena / X i kapitalizacja przeliczone proporcjonalnie, stopa dywidendy odwrotnie."""
    for t, r in fv.items():
        c = px.get(t)
        if not c or not c[1] or not r.get("price"):
            continue
        k = c[1][-1] / r["price"]
        r["price"] = c[1][-1]
        r["marketCap"] *= k
        for p in ("PE", "forwardPE", "PS", "PB", "PC", "PFCF"):
            if r.get(p):
                r[p] *= k
        if r.get("dividendYield"):
            r["dividendYield"] /= k


def wybierz(fv, top=500):
    """500 największych wg kapitalizacji BEZ sektorów trudnych do przewidzenia (finanse, surowce, energia, użyteczność publiczna, nieruchomości)."""
    return sorted((r for r in fv.values() if r.get("marketCap") and r.get("sector") not in ocena.SEKTORY_WYKL), key=lambda r: -r["marketCap"])[:top]


def notowana_5_lat(c, dzis=None):
    """Kurs od co najmniej ~5 lat (pierwsze notowanie tygodniowe ≤ dziś − 4,9 roku); yfinance zwraca maks. 5 lat."""
    if not c or not c[0]:
        return False
    return dt.date.fromisoformat(c[0][0]) <= (dzis or dt.date.today()) - dt.timedelta(days=round(4.9 * 365.25))


def buduj(fv, ex, px, top=500, kandydaci=None, log=print, zd=None, dod=None):
    """500 największych wg kapitalizacji (bez wykluczonych sektorów) spośród spółek notowanych co najmniej 5 lat (użytkownik: „top 500 po kapitalizacji,
    które są minimum 5 lat na rynku”); `kandydaci` = tickery z pobranymi danymi (domyślnie top wg kapitalizacji). Brak kursów (błąd yfinance) -> wiek
    ze sprawozdań: przychody sprzed 5 lat w SEC."""
    kand = set(kandydaci) if kandydaci is not None else {r["ticker"] for r in wybierz(fv, top)}
    lista = [r for r in wybierz(fv, len(fv)) if r["ticker"] in kand]
    rows, pominiete = [], []
    for r in lista:
        if len(rows) >= top:
            break
        t = r["ticker"]
        m, hist = ocena.metryki(ex.get(t) or {}, r, splity=(px.get(t) or (None, None, []))[2] if px.get(t) and len(px[t]) > 2 else [])
        wiek_ok = notowana_5_lat(px.get(t)) if px.get(t) else m.get("rev_cagr5") is not None and m.get("zrodlo_wzrostu") != "Finviz"
        if not wiek_ok:
            pominiete.append(t)
            continue
        rank = len(rows) + 1
        sc = ocena.dcf_scenariusze(m, hist, r.get("sector"))
        m["dcf"] = sc["base"]["wartosc"] if sc else None
        m["dcf_pot"] = m["dcf"] / m["price"] - 1 if m.get("dcf") is not None and m.get("price") else None
        lynch_dodatki(m, t, dod or {}, zwroty(px.get(t)))
        rows.append(dict(t=t, cik=(dod or {}).get("mapa", {}).get(t), fv_data=r.get("fv_data"), n=r.get("company", t), sector=r.get("sector"), industry=r.get("industry"), country=r.get("country"), www=r.get("www"),
                         rank=rank, m=m, hist=hist, dcf=sc, ceny=px.get(t), zw=zwroty(px.get(t)), zdarzenia=(zd or {}).get(t)))
    log(f"Pominięte (krócej niż 5 lat na rynku): {len(pominiete)} — {', '.join(pominiete[:40])}")
    ocena.oceny(rows)
    pes = sorted(r["m"]["pe"] for r in rows if r["m"].get("pe") and r["m"]["pe"] > 0)
    pe67 = pes[int(len(pes) * 2 / 3)] if pes else None
    for r in rows:
        c = r["ceny"]
        if c and len(c[1]) >= 52:
            r["m"]["od_maks_12m"] = c[1][-1] / max(c[1][-52:]) - 1
        r["m"]["pe_gorna_tercyla"] = bool(pe67 and r["m"].get("pe") and r["m"]["pe"] >= pe67)
    for r in rows:
        r["m"]["pe_med5"] = ocena.pe_mediana(r["hist"], r["ceny"], r["m"].get("shares"))
        r["typy"] = ocena.typy(r["m"], r["sector"])
        r["strategie"] = ocena.strategie(r["m"], r["sector"])
        r["peg"] = ocena.peg_scenariusze(r["m"].get("pe"), r["m"].get("eps_next5"))
        r["etykieta"] = ocena.etykieta(r["m"].get("dcf_pot"), r["m"].get("peg"))
        r["ostrzezenia"] = ocena.ostrzezenia(r["m"], r["typy"][0][0] if r["typy"] else None, r["rank"]) + zdarzenia.ostrzezenia(r["zdarzenia"])
    # etap 93 (Lynch): marża netto w górnej 1/3 stabilnie rosnących
    stab = [r for r in rows if r["typy"] and r["typy"][0][0] == "Stabilnie rosnąca" and r["m"].get("nm") is not None]
    nms = sorted(r["m"]["nm"] for r in stab)
    if len(nms) >= 15:
        prog = nms[int(len(nms) * 2 / 3)]
        for r in stab:
            r["m"]["nm_gorna_tercyla_stab"] = r["m"]["nm"] >= prog
    # Lynch (rozdz. 13): marża przed opodatkowaniem na tle branży (mediana; mniej niż 5 spółek w branży → sektor)
    grupy = {}
    for r in rows:
        if r["m"].get("marza_przed") is not None:
            grupy.setdefault(("i", r["industry"]), []).append(r["m"]["marza_przed"])
            grupy.setdefault(("s", r["sector"]), []).append(r["m"]["marza_przed"])
    for r in rows:
        g = grupy.get(("i", r["industry"])) or []
        if len(g) < 5:
            g = grupy.get(("s", r["sector"])) or []
        if len(g) >= 5:
            g = sorted(g)
            r["m"]["marza_przed_med"] = g[len(g) // 2]
    for r in rows:
        r["lynch"] = ocena.lynch(r["m"], r["typy"][0][0] if r["typy"] else None, r.get("zdarzenia"))
    return rows


def lynch_dodatki(m, t, dod, zw=None):
    """Dane spoza raportów spółki do metody Lyncha: zakupy przez zarząd, udział funduszy, analitycy, wydzielenie, recesja 2020, „najgorętsza spółka”."""
    cik = dod.get("mapa", {}).get(t)
    ins = dod.get("insiderzy", {}).get(str(cik)) if cik else None
    if dod.get("insiderzy") and cik:
        ins = ins or {"kupno": 0.0, "sprzedaz": 0.0, "kupujacy": 0}
        m["ins_kupno_12m"], m["ins_sprzedaz_12m"], m["ins_kupujacy"] = ins["kupno"], ins["sprzedaz"], ins["kupujacy"]
    yi = dod.get("yf", {}).get(t) or {}
    m["inst_proc"], m["analitycy"] = yi.get("inst"), yi.get("analitycy")
    w = dod.get("wydzielenia", {}).get(t)
    if w:
        m["wydzielona"] = w
    rc = dod.get("recesja", {})
    if t in rc and "SPY" in rc:
        m["rec_kurs_2020"], m["rec_spy_2020"] = rc[t], rc["SPY"]
    r1 = (zw or {}).get("1r")
    # rozdz. 9 (czego unikać): najgorętsza spółka w gorącej branży — kurs ≥ 2× w rok przy P/E ≥ 50 albo stracie (nasze progi)
    m["goraca"] = bool(r1 is not None and r1 >= 1.0 and (not m.get("pe") or m["pe"] <= 0 or m["pe"] >= 50))


def _czysc(x):
    if isinstance(x, float):
        return round(x, 6) if x == x and abs(x) != float("inf") else None
    if isinstance(x, dict):
        return {k: _czysc(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_czysc(v) for v in x]
    return x


def zapisz(rows, out=OUT, today=None, usdpln=None):
    today = today or dt.date.today()
    os.makedirs(os.path.join(out, "spolki"), exist_ok=True)
    for f in os.listdir(os.path.join(out, "spolki")):
        os.remove(os.path.join(out, "spolki", f))
    lista = []
    for r in rows:
        st = {k: [sum(1 for _, _, ok in v if ok), len(v)] for k, v in r["strategie"].items()}
        lista.append(dict(t=r["t"], n=r["n"], s=r["sector"], i=r["industry"], rank=r["rank"], c=r["m"].get("price"), mc=r["m"].get("mcap"),
                          o=r["oceny"], typ=r["typy"][0][0] if r["typy"] else None, peg=r["m"].get("peg"), pe=r["m"].get("pe"),
                          dcf_pot=r["m"].get("dcf_pot"), et=r["etykieta"], st=st, zw=r["zw"], rev_1y=r["m"].get("rev_1y"), rev_cagr5=r["m"].get("rev_cagr5"),
                          roe=r["m"].get("roe"), de=r["m"].get("de"), eps_next5=r["m"].get("eps_next5"), sp=r["m"].get("spadek_2l"), ow=len(r["ostrzezenia"]) or None, dw=r["m"].get("dywidenda_stabilna") or None, bf=1 if ocena.buffett3(r["m"]) else None, ik=r["m"].get("ins_kupujacy") or None,
                          zd=sum(1 for z in r["zdarzenia"] or [] if z["poz"] == 2) or None, om=r["m"].get("od_maks_12m"),
                          kp=[r["kompletnosc"]["liczone"], r["kompletnosc"]["wszystkie"], r["kompletnosc"]["niepelne"]]))
        karta = {k: r.get(k) for k in ("t", "cik", "n", "sector", "industry", "country", "www", "rank", "m", "pct", "oceny", "typy", "strategie", "peg", "dcf", "etykieta", "hist", "zw", "kompletnosc", "med500", "ostrzezenia", "zdarzenia", "lynch")}
        karta["ceny"] = {"d": r["ceny"][0], "c": r["ceny"][1]} if r["ceny"] else None
        karta["generated_at"] = today.isoformat()
        karta["fv_data"] = r.get("fv_data") or today.isoformat()     # data odczytu wskaźników Finviz (przy zapasie — starsza)
        karta["dcf_param"] = ocena.DCF
        json.dump(_czysc(karta), open(os.path.join(out, "spolki", f"{r['t']}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump(_czysc(ocena.rozklady(rows)), open(os.path.join(out, "sektory.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    fvd = min((r.get("fv_data") or today.isoformat() for r in rows), default=today.isoformat())
    json.dump(_czysc(dict(generated_at=today.isoformat(), fv_data=fvd, usdpln=usdpln, n=len(lista), sektory=sorted({x["s"] for x in lista if x["s"]}), rows=lista)),
              open(os.path.join(out, "lista.json"), "w"), ensure_ascii=False, separators=(",", ":"))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--top", type=int, default=500)
    ap.add_argument("--cache", default=None, help="katalog podręczny wyciągów SEC (lokalnie, przyspiesza ponowne uruchomienia)")
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args(argv)
    try:
        fv = finviz()
    except requests.RequestException as e:
        print(f"Finviz niedostępny ({e}).")
        fv = {}
    zapas = len(fv) < 400
    if zapas:                                               # Finviz blokuje — spółki i wskaźniki rynkowe z ostatnich kart, ceny aktualne z yfinance
        fv = finviz_z_kart(a.out)
        print(f"Zapas: {len(fv)} spółek z ostatnich kart (wskaźniki Finviz z {min((r['fv_data'] for r in fv.values() if r.get('fv_data')), default='?')}).")
        if len(fv) < 400:
            print("Za mało spółek w zapasie — nic nie zapisuję.")
            return 1
    top = [r["ticker"] for r in wybierz(fv, a.top + 200)]       # zapas: część spółek odpada (krócej niż 5 lat na rynku)
    if a.cache:
        os.makedirs(a.cache, exist_ok=True)
    mapa = cik_mapa()
    ex = sec_wyciagi(top, a.cache, mapa=mapa)
    if sum(1 for v in ex.values() if v.get("rev")) < 0.7 * len(top):
        print("Za mało danych SEC — nic nie zapisuję.")
        return 1
    px = ceny(top)
    if zapas:
        aktualizuj_ceny(fv, px)
    zd, wyd = sec_zdarzenia(top, mapa, a.cache)
    dod = dict(mapa=mapa, wydzielenia=wyd, insiderzy=insiderzy(a.cache), yf=yf_info(top, a.cache), recesja=recesja_2020(top))
    rows = buduj(fv, ex, px, a.top, kandydaci=top, zd=zd, dod=dod)
    pln = kursy(["PLN"]).get("PLN")                       # USD za 1 PLN -> kurs USD/PLN do portfela (IKE w złotówkach)
    zapisz(rows, a.out, usdpln=1 / pln if pln else None)
    print(f"Zapisano {len(rows)} spółek; z danymi SEC {sum(1 for v in ex.values() if v.get('rev'))}, z cenami {len(px)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
