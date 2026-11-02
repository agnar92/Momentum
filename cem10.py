"""CEM10: miesięczna lista spółek (USA + GPW) -> docs/data/cem10.json. Uruchamiany 1. dnia miesiąca przez workflow „CEM10 Monthly”.

Skład S&P 500 i Nasdaq-100: tabele z Wikipedii (przy błędzie zostaje skład z poprzedniego pliku). Skład WIG20 i mWIG40: cem10_windows/sklad_gpw.json
(ręcznie po kwartalnej rewizji GPW). Ceny: miesięczne świece yfinance (2 lata: 12M zwrotu + SMA 12 filtra rynku); bieżący, niepełny miesiąc jest odrzucany."""
import argparse
import datetime as dt
import io
import json
import os
import sys

from momentum import cem10
from momentum.prices import last_closed_month

OUT = os.path.join("docs", "data", "cem10.json")
GPW_FILE = os.path.join("cem10_windows", "sklad_gpw.json")
UA = {"User-Agent": "Mozilla/5.0 (Momentum CEM10; +https://github.com/agnar92/Momentum)"}
WIKI = {"sp": ("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", ("Symbol",), ("Security",)),
        "nq": ("https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies", ("Ticker", "Symbol"), ("Company", "Security"))}


def wiki_members(url, tcols, ncols):
    """Tabela składu z Wikipedii -> {ticker: nazwa} (pierwsza tabela z kolumną tickera)."""
    import pandas as pd
    import requests
    html = requests.get(url, headers=UA, timeout=30).text
    for t in pd.read_html(io.StringIO(html)):
        tc = next((c for c in tcols if c in t.columns), None)
        nc = next((c for c in ncols if c in t.columns), None)
        if tc and nc and len(t) >= 90:
            return {str(a).strip().replace(".", "-"): str(b).strip() for a, b in zip(t[tc], t[nc])}
    raise ValueError(f"brak tabeli składu: {url}")


def members(old, log=print):
    out = {}
    for k, (url, tc, nc) in WIKI.items():
        try:
            out[k] = wiki_members(url, tc, nc)
            log(f"Skład {k}: {len(out[k])} spółek (Wikipedia)")
        except Exception as e:
            prev = {r["t"]: r["n"] for r in (old or {}).get("usa", {}).get("rows", []) if r.get(k)}
            if not prev:
                raise
            log(f"Skład {k}: błąd Wikipedii ({e}) — zostaje poprzedni skład ({len(prev)})")
            out[k] = prev
    return out


def download(tickers, log=print):
    """Miesięczne świece (2 lata, ceny surowe + skorygowane) -> {ticker: (daty, adj, raw)}."""
    import yfinance as yf
    out = {}
    for i in range(0, len(tickers), 100):
        part = tickers[i:i + 100]
        df = yf.download(part, period="2y", interval="1mo", auto_adjust=False, group_by="ticker", progress=False, threads=True)
        for t in part:
            try:
                f = df[t] if len(part) > 1 else df
                f = f.dropna(subset=["Close"])
            except KeyError:
                continue
            if len(f):
                out[t] = ([d.strftime("%Y-%m-%d") for d in f.index], list(f["Adj Close"]), list(f["Close"]))
        log(f"Ceny: {min(i + 100, len(tickers))}/{len(tickers)}")
    return out


def monthly(px, upto):
    """{ticker: (daty, adj, raw)} -> {ticker: (miesiące, adj, raw)} dla zamkniętych miesięcy; ostatni miesiąc musi być = upto."""
    out = {}
    for t, (d, a, r) in px.items():
        ma, mr = cem10.month_closes(d, a, upto), cem10.month_closes(d, r, upto)
        ms = sorted(set(ma) & set(mr))
        if ms and ms[-1] == upto:
            out[t] = (ms, [ma[m] for m in ms], [mr[m] for m in ms])
    return out


def build(mem, gpw, px, upto, today):
    m = monthly(px, upto)
    spy, qqq = m["SPY"][1], m["QQQ"][1]
    s5, q5 = cem10.ret(spy, cem10.LEAD_MONTHS), cem10.ret(qqq, cem10.LEAD_MONTHS)
    lead = "NDX" if q5 > s5 else "SP"
    spy12 = cem10.sma(spy, cem10.MKT_N)
    names = {**mem["nq"], **mem["sp"]}
    rows = []
    for t in sorted(set(mem["sp"]) | set(mem["nq"])):
        if t in m and len(m[t][1]) >= cem10.SMA_N:
            rows.append(cem10.stock_row(t, names[t][:40], m[t][1], m[t][2], sp=t in mem["sp"], nq=t in mem["nq"]))
    k = m["SPY"][2][-1] / spy[-1]
    usa = dict(lead=lead, spy5=round(s5, 4), qqq5=round(q5, 4), spy=round(m["SPY"][2][-1], 2), spy_sma12=round(spy12 * k, 2),
               bear=bool(spy[-1] < spy12), n=cem10.N_USA, rows=rows, missing=sorted((set(mem["sp"]) | set(mem["nq"])) - {r["t"] for r in rows}))
    w20, w40 = gpw["WIG20"], gpw["mWIG40"]
    grows, ser = [], {}
    for t in sorted(set(w20) | set(w40)):
        y = t + ".WA"
        if y in m and len(m[y][1]) >= cem10.SMA_N:
            grows.append(cem10.stock_row(t, (w20.get(t) or w40.get(t))[:40], m[y][1], m[y][2], w20=t in w20, w40=t in w40))
            ser[t] = dict(zip(m[y][0], m[y][1]))
    months = sorted({x for s in ser.values() for x in s})[-25:]
    lv = cem10.ew_level(ser, months)
    lv12 = sum(lv[-cem10.MKT_N:]) / cem10.MKT_N

    def avg6(ix):
        v = [r["r6"] for r in grows if r[ix] and r["r6"] is not None]
        return round(sum(v) / len(v), 4) if v else None
    gpw_out = dict(w20_6=avg6("w20"), w40_6=avg6("w40"), lv=round(lv[-1], 4), lv12=round(lv12, 4), bear=bool(lv[-1] < lv12),
                   n=cem10.N_GPW, rows=grows, rewizja=gpw.get("rewizja"), missing=sorted((set(w20) | set(w40)) - {r["t"] for r in grows}))
    return dict(generated_at=today.isoformat(), month=upto, usa=usa, gpw=gpw_out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args(argv)
    old = json.load(open(a.out, encoding="utf-8")) if os.path.exists(a.out) else None
    today = dt.date.today()
    upto = last_closed_month(today)
    mem = members(old)
    gpw = json.load(open(GPW_FILE, encoding="utf-8"))
    us = sorted(set(mem["sp"]) | set(mem["nq"]))
    tickers = ["SPY", "QQQ"] + us + [t + ".WA" for t in sorted(set(gpw["WIG20"]) | set(gpw["mWIG40"]))]
    px = download(tickers)
    have = sum(1 for t in tickers if t in px)
    if have < 0.9 * len(tickers) or "SPY" not in px or "QQQ" not in px:
        print(f"Za mało cen: {have}/{len(tickers)} — nic nie zapisuję.")
        return 1
    out = build(mem, gpw, px, upto, today)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    u, g = out["usa"], out["gpw"]
    print(f"Miesiąc {upto}: USA lider {u['lead']}, filtr rynku {'STOP' if u['bear'] else 'OK'}, kandydatów "
          f"{len(cem10.usa_candidates(u['rows'], u['lead']))}; GPW filtr {'STOP' if g['bear'] else 'OK'}, kandydatów "
          f"{len(cem10.gpw_candidates(g['rows']))}; brak cen USA {len(u['missing'])}, GPW {len(g['missing'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
