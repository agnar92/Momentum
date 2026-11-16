"""Wycena: lista niedowartościowanych spółek S&P 500 + Nasdaq-100 (PEG i wartość wewnętrzna z prognozy wzrostu EPS) -> docs/data/wycena.json.

Uruchamiany 1. dnia miesiąca przez workflow „Wycena Monthly” (i ręcznie). Skład indeksów: Finviz (idx_sp500, idx_ndx). Dla każdej spółki
yfinance: cena, EPS TTM (trailingEps), EPS prognozowany (forwardEps) i Growth Estimates (`+1y` = następny rok, `0y` = bieżący), liczba
analityków z earnings_estimate. Wzory w momentum/wycena.py."""
import argparse
import datetime as dt
import json
import os
import sys
import time

from momentum import wycena

OUT = os.path.join("docs", "data", "wycena.json")


def members(get=None):
    """{ticker: {"n": nazwa, "sp": bool, "nq": bool}} z Finviz; liczba spółek poza zakresem = błąd zadania."""
    from cem10 import finviz_members
    sp, nq = finviz_members("idx_sp500", get=get), finviz_members("idx_ndx", get=get)
    if not 400 <= len(sp) <= 600 or not 80 <= len(nq) <= 120:
        raise ValueError(f"Finviz: S&P 500 {len(sp)}, Nasdaq-100 {len(nq)} spółek — zmieniony układ strony albo blokada")
    out = {}
    for t in sorted(set(sp) | set(nq)):
        out[t] = {"n": (sp.get(t) or nq.get(t) or t)[:40], "sp": t in sp, "nq": t in nq}
    return out


def fetch(ticker, yf=None, tries=3):
    """Dane jednej spółki z yfinance -> dict(price, eps, fwd_eps, g, g0, na); błąd po kilku próbach -> None."""
    if yf is None:
        import yfinance as yf
    for k in range(tries):
        try:
            x = yf.Ticker(ticker)
            info = x.info or {}
            ge = x.growth_estimates
            g = g0 = None
            if ge is not None and len(ge) and "stockTrend" in ge.columns:
                g = ge["stockTrend"].get("+1y")
                g0 = ge["stockTrend"].get("0y")
            na = None
            ee = x.earnings_estimate
            if ee is not None and len(ee) and "numberOfAnalysts" in ee.columns and "+1y" in ee.index:
                na = int(ee.loc["+1y", "numberOfAnalysts"]) if ee.loc["+1y", "numberOfAnalysts"] == ee.loc["+1y", "numberOfAnalysts"] else None
            return dict(price=info.get("currentPrice") or info.get("regularMarketPrice"), eps=info.get("trailingEps"),
                        fwd_eps=info.get("forwardEps"), g=g, g0=g0, na=na)
        except Exception as e:      # noqa: BLE001 — sieć / limit Yahoo: ponów
            if k == tries - 1:
                print(f"{ticker}: błąd yfinance ({e})", flush=True)
                return None
            time.sleep(2 * (k + 1))


def build(mem, data, today):
    rows = []
    for t, m in mem.items():
        d = data.get(t)
        if d and d.get("price"):
            rows.append(wycena.value_row(t, m["n"], d["price"], d["eps"], d["g"], d["g0"], d["na"], d["fwd_eps"], sp=m["sp"], nq=m["nq"]))
    return dict(generated_at=today.isoformat(), peg_max=wycena.PEG_MAX, min_analysts=wycena.MIN_ANALYSTS, rows=rows,
                missing=sorted(set(mem) - {r["t"] for r in rows}))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--max-tickers", type=int, default=0, help="tylko N pierwszych (test)")
    ap.add_argument("--pause", type=float, default=0.3)
    a = ap.parse_args(argv)
    mem = members()
    ts = list(mem)[:a.max_tickers] if a.max_tickers else list(mem)
    data = {}
    for i, t in enumerate(ts, 1):
        d = fetch(t)
        if d:
            data[t] = d
        if i % 50 == 0:
            print(f"yfinance: {i}/{len(ts)}", flush=True)
        time.sleep(a.pause)
    if len(data) < 0.8 * len(ts):
        print(f"Za mało danych: {len(data)}/{len(ts)} — nic nie zapisuję.")
        return 1
    out = build({t: mem[t] for t in ts}, data, dt.date.today())
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    c = wycena.cheap(out["rows"])
    print(f"Wycena: {len(out['rows'])} spółek, tanich (PEG <= 1, wartość > cena, >= {wycena.MIN_ANALYSTS} analityków): {len(c)}; "
          f"top 5: {', '.join(r['t'] for r in c[:5])}; brak danych: {len(out['missing'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
