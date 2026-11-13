"""Ranking jakości (długoterminowy, raz w roku) -> docs/data/quality.json. Uruchamiany ręcznie albo raz w roku przez workflow „Quality Yearly”.

Sito: Finviz (filtry z finviz_screen.json `quality_filters` albo momentum.quality.QUALITY_FILTERS), widoki 111 (sektor), 121 (wycena),
161 (finanse). Historia roczna: SEC companyfacts (10 lat 10-K). Ranking i top 10: momentum/quality.py."""
import argparse
import datetime as dt
import json
import os
import re
import sys
import time

from momentum import quality, sec
from momentum.finviz import HEADERS, PAGE, URL

OUT = os.path.join("docs", "data", "quality.json")
CONFIG = "finviz_screen.json"
VIEWS = ("111", "121", "161")
MAX_PAGES = 50


def ssr_rows(page):
    """Strona screenera Finviz (układ JSON) -> ([{ticker, text..., liczby...}], łączna liczba)."""
    m = re.search(r'<script type="application/json" data-ssr-props="[^"]*">(.*?)</script>', page, re.S)
    if not m:
        return [], None
    data = json.loads(m.group(1)).get("data") or {}
    rows = [{**(r.get("text") or {}), **(r.get("numbers") or {})} for r in data.get("rows") or []]
    return [r for r in rows if r.get("ticker")], data.get("totalCount")


def finviz_screen(filters, log=print, get=None, pause=0.7):
    """Wszystkie strony sita w widokach 111 / 121 / 161, złączone po tickerze -> ({ticker: wiersz}, łączna liczba)."""
    import requests
    get = get or requests.Session().get
    out, total = {}, None
    for v in VIEWS:
        offset = 1
        for _ in range(MAX_PAGES):
            r = get(URL, params={"v": v, "f": filters, "r": offset}, headers=HEADERS, timeout=30)
            r.raise_for_status()
            rows, t = ssr_rows(r.text)
            total = t if t is not None else total
            for x in rows:
                out.setdefault(x["ticker"], {}).update({k: val for k, val in x.items() if val is not None})
            offset += PAGE
            if not rows or (total is not None and offset > total):
                break
            time.sleep(pause)
        log(f"Finviz widok {v}: {len(out)} spółek (wg Finviz {total})")
    return out, total


def build(fv, hists, filters, total, today):
    rows, skipped = [], []
    for t, x in sorted(fv.items()):
        base = dict(t=t, n=(x.get("company") or "")[:48], sector=x.get("sector"), industry=x.get("industry"))
        if x.get("sector") in quality.EXCLUDED_SECTORS:
            skipped.append(dict(base, why="sektor finansowy / REIT"))
            continue
        h = hists.get(t) or []
        s = quality.summary(h, today)
        if s is None:
            why = ("brak danych SEC" if not h else f"stare dane SEC (ostatni rok {h[-1]['y']})" if not quality.fresh(h, today)
                   else f"za mało danych SEC ({len(h)} lat)")
            skipped.append(dict(base, why=why))
            continue
        hist = [{k: (round(v, 4) if isinstance(v, float) and k not in ("rev", "fcf", "ni", "sh") else v)
                 for k, v in y.items() if k != "end"} for y in h]
        rows.append(dict(base, **quality.finviz_metrics(x), **s, hist=hist))
    quality.score(rows)
    top = quality.pick_top(rows)
    weights = [dict(k=k, b=b, w=w, d=d) for k, b, w, d in quality.WEIGHTS]
    return dict(generated_at=today.isoformat(), filters=filters, finviz_total=total, n=len(rows), top=top, weights=weights,
                blocks=quality.BLOCKS, rules=dict(years=quality.YEARS, min_years=quality.MIN_YEARS, roic_hit=quality.ROIC_HIT,
                                                   top=quality.TOP, sector_cap=quality.SECTOR_CAP),
                rows=rows, skipped=skipped)


def sec_histories(tickers, ua, log=print, pause=0.15):
    ciks = sec.cik_map(ua)
    out = {}
    for n, t in enumerate(tickers, 1):
        cik = ciks.get(t.upper()) or ciks.get(t.upper().replace("-", "."))
        if cik is None:
            log(f"SEC: {t} — brak CIK")
            continue
        try:
            out[t] = quality.history(sec._get(sec.FACTS_URL.format(cik), ua)["facts"])
        except Exception as e:      # jedna spółka bez danych nie przerywa
            log(f"SEC: {t} — {e}")
        if n % 25 == 0 or n == len(tickers):
            log(f"SEC (historia 10 lat): {n}/{len(tickers)}")
        time.sleep(pause)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--filters", help="filtry Finviz (domyślnie z finviz_screen.json `quality_filters`)")
    a = ap.parse_args(argv)
    cfg = json.load(open(CONFIG, encoding="utf-8")) if os.path.exists(CONFIG) else {}
    filters = a.filters or cfg.get("quality_filters") or quality.QUALITY_FILTERS
    ua = os.environ.get("SEC_UA") or cfg.get("sec_ua") or sec.UA
    fv, total = finviz_screen(filters)
    if not fv or (total and len(fv) < 0.9 * total):
        print(f"Finviz zwrócił {len(fv)} z {total} spółek — nic nie zapisuję.")
        return 1
    todo = [t for t, x in fv.items() if x.get("sector") not in quality.EXCLUDED_SECTORS]
    hists = sec_histories(todo, ua)
    if len(hists) < 0.7 * len(todo):
        print(f"Za mało danych SEC: {len(hists)}/{len(todo)} — nic nie zapisuję.")
        return 1
    out = build(fv, hists, filters, total, dt.date.today())
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Ranking: {out['n']} spółek z oceną, {len(out['skipped'])} pominiętych; top {len(out['top'])}: {', '.join(out['top'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
