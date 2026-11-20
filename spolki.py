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

from momentum import fundamenty, ocena

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
            r = get(URL, params={"v": v, "f": filters, "r": off}, headers=HEADERS, timeout=30)
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


def sec_wyciagi(tickers, cache=None, log=print, watki=4):
    mapa = {v["ticker"].upper().replace(".", "-"): int(v["cik_str"]) for v in (sec_get("https://www.sec.gov/files/company_tickers.json") or {}).values()}
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
            if ex is None or ex.get("v", 1) < 2 and ex.get("rev"):    # stary format cache (bez waluty / akcji rozwodnionych) -> pobierz ponownie
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


def wybierz(fv, top=500):
    """500 największych wg kapitalizacji BEZ sektorów trudnych do przewidzenia (finanse, surowce, energia, użyteczność publiczna, nieruchomości)."""
    return sorted((r for r in fv.values() if r.get("marketCap") and r.get("sector") not in ocena.SEKTORY_WYKL), key=lambda r: -r["marketCap"])[:top]


def buduj(fv, ex, px, top=500):
    lista = wybierz(fv, top)
    rows = []
    for rank, r in enumerate(lista, 1):
        t = r["ticker"]
        m, hist = ocena.metryki(ex.get(t) or {}, r, splity=(px.get(t) or (None, None, []))[2] if px.get(t) and len(px[t]) > 2 else [])
        sc = ocena.dcf_scenariusze(m, hist, r.get("sector"))
        m["dcf"] = sc["base"]["wartosc"] if sc else None
        m["dcf_pot"] = m["dcf"] / m["price"] - 1 if m.get("dcf") is not None and m.get("price") else None
        rows.append(dict(t=t, n=r.get("company", t), sector=r.get("sector"), industry=r.get("industry"), country=r.get("country"), www=r.get("www"),
                         rank=rank, m=m, hist=hist, dcf=sc, ceny=px.get(t), zw=zwroty(px.get(t))))
    ocena.oceny(rows)
    for r in rows:
        r["typy"] = ocena.typy(r["m"], r["sector"])
        r["strategie"] = ocena.strategie(r["m"], r["sector"])
        r["peg"] = ocena.peg_scenariusze(r["m"].get("pe"), r["m"].get("eps_next5"))
        r["etykieta"] = ocena.etykieta(r["m"].get("dcf_pot"), r["m"].get("peg"))
    return rows


def _czysc(x):
    if isinstance(x, float):
        return round(x, 6) if x == x and abs(x) != float("inf") else None
    if isinstance(x, dict):
        return {k: _czysc(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_czysc(v) for v in x]
    return x


def zapisz(rows, out=OUT, today=None):
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
                          roe=r["m"].get("roe"), de=r["m"].get("de"), eps_next5=r["m"].get("eps_next5"),
                          kp=[r["kompletnosc"]["liczone"], r["kompletnosc"]["wszystkie"], r["kompletnosc"]["niepelne"]]))
        karta = {k: r[k] for k in ("t", "n", "sector", "industry", "country", "www", "rank", "m", "pct", "oceny", "typy", "strategie", "peg", "dcf", "etykieta", "hist", "zw", "kompletnosc", "sektor_med")}
        karta["ceny"] = {"d": r["ceny"][0], "c": r["ceny"][1]} if r["ceny"] else None
        karta["generated_at"] = today.isoformat()
        karta["dcf_param"] = ocena.DCF
        json.dump(_czysc(karta), open(os.path.join(out, "spolki", f"{r['t']}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump(_czysc(ocena.rozklady(rows)), open(os.path.join(out, "sektory.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    json.dump(_czysc(dict(generated_at=today.isoformat(), n=len(lista), sektory=sorted({x["s"] for x in lista if x["s"]}), rows=lista)),
              open(os.path.join(out, "lista.json"), "w"), ensure_ascii=False, separators=(",", ":"))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--top", type=int, default=500)
    ap.add_argument("--cache", default=None, help="katalog podręczny wyciągów SEC (lokalnie, przyspiesza ponowne uruchomienia)")
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args(argv)
    fv = finviz()
    if len(fv) < 400:
        print(f"Finviz zwrócił {len(fv)} spółek — za mało, nic nie zapisuję.")
        return 1
    top = [r["ticker"] for r in wybierz(fv, a.top)]
    if a.cache:
        os.makedirs(a.cache, exist_ok=True)
    ex = sec_wyciagi(top, a.cache)
    if sum(1 for v in ex.values() if v.get("rev")) < 0.7 * len(top):
        print("Za mało danych SEC — nic nie zapisuję.")
        return 1
    px = ceny(top)
    rows = buduj(fv, ex, px, a.top)
    zapisz(rows, a.out)
    print(f"Zapisano {len(rows)} spółek; z danymi SEC {sum(1 for v in ex.values() if v.get('rev'))}, z cenami {len(px)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
