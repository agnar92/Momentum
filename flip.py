"""Lista FLIP -> docs/data/flip.json. Uruchamiany przez workflow „FLIP Monthly” (2. dnia miesiąca + ręcznie).

1) Finviz: wszystkie spółki > 10 mld $ (cap_largeover, widok 111) -> branża, kapitalizacja, cena (cena służy też do kontroli Twoich pozycji);
2) kandydaci = branże z flip_config.json + `include` -> widoki 121 / 131 / 161 (P/FCF, P/C, P/B, Debt/Eq, insiderzy, marża, wzrost);
3) SEC: ostatni kwartał (przychody r/r, zmiana marży op.) dla spółek z zielonym FLIP — to „T” z TVOD;
4) reguły w momentum/flip.py."""
import argparse
import datetime as dt
import json
import os
import sys
import time

from momentum import flip, sec
from momentum.finviz import HEADERS, PAGE, URL
from quality import ssr_rows

OUT = os.path.join("docs", "data", "flip.json")
CONFIG = "flip_config.json"
SEC_CACHE = os.path.join("data", "flip_sec.json")


def screen(get, filters, view="111", pause=0.7, log=print):
    out, offset, total = [], 1, None
    while True:
        r = get(URL, params={"v": view, "f": filters, "r": offset}, headers=HEADERS, timeout=30)
        r.raise_for_status()
        rows, t = ssr_rows(r.text)
        total = t if t is not None else total
        out += rows
        offset += PAGE
        if not rows or (total is not None and offset > total):
            break
        time.sleep(pause)
    log(f"Finviz {filters}: {len(out)} z {total}")
    return out, total


def details(get, tickers, pause=0.7):
    """Widoki 121 / 131 / 161 dla listy tickerów (po 20) -> {ticker: pola}."""
    out = {}
    for v in ("121", "131", "161"):
        for i in range(0, len(tickers), 20):
            r = get(URL, params={"v": v, "t": ",".join(tickers[i:i + 20])}, headers=HEADERS, timeout=30)
            r.raise_for_status()
            for x in ssr_rows(r.text)[0]:
                out.setdefault(x["ticker"], {}).update(x)
            time.sleep(pause)
    return out


def build(base, det, cfg, secd, today):
    ind_max = {}
    for x in base:
        ind = x.get("industry")
        if ind and (x.get("marketCap") or 0) > ind_max.get(ind, 0):
            ind_max[ind] = x["marketCap"]
    ind_max = {k: v * 1e6 for k, v in ind_max.items()}
    rows, seen = [], {}
    for x in sorted(base, key=lambda x: (x["ticker"] not in (cfg.get("founders") or {}), -(x.get("averageVolume") or 0))):
        t = x["ticker"]
        if t not in det or t in (cfg.get("exclude") or []) or seen.get(x.get("company")):
            continue               # dwie klasy akcji tej samej spółki (GOOG / GOOGL) — jedna
        seen[x.get("company")] = t
        r = {**x, **det[t]}
        c = flip.checks(r, cfg, ind_max)
        m, cash, debt, fcf = flip.money(r)
        req, act = flip.required_growth(r.get("PFCF")), flip.actual_growth(r)
        ts, tt = flip.report_state(secd.get(t))
        tb, tbt = flip.thesis_broken(secd.get(t))
        rows.append(dict(t=t, n=(r.get("company") or "")[:40], ind=r.get("industry"), mcap=round(m / 1e9, 1), price=r.get("price"),
                         cash=None if cash is None else round(cash / 1e9, 1), debt=None if debt is None else round(debt / 1e9, 1),
                         fcf=None if fcf is None else round(fcf / 1e9, 2), ins=r.get("insiderOwn"), opm=r.get("operMargin"),
                         pfcf=r.get("PFCF"), fpe=r.get("forwardPE"), s5=r.get("sales5Years"), e5=r.get("estLTGrowth"),
                         req=None if req is None else round(req, 4), act=None if act is None else round(act, 4),
                         margin=None if req is None or act is None else round(act - req, 4),
                         checks={k: [v[0], v[1]] for k, v in c.items()}, flip=all(v[0] for v in c.values()),
                         t_state=ts, t_txt=tt, t_exit=tb, t_exit_txt=tbt, quarter=(secd.get(t) or {}).get("quarter")))
    flip.rank(rows)
    rows.sort(key=lambda r: (r["rank"] is None, r["rank"] or 0, -r["mcap"]))
    prices = {x["ticker"]: x.get("price") for x in base if x.get("price")}
    return dict(generated_at=today.isoformat(), rules=dict(top=flip.TOP, step=flip.STEP, first=flip.FIRST_PCT, tranches=flip.TRANCHES,
                                                            insider_min=flip.INSIDER_MIN, leader_ratio=flip.LEADER_RATIO),
                n_large=len(base), rows=rows, prices=prices)


def main(argv=None):
    import requests
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args(argv)
    cfg = json.load(open(CONFIG, encoding="utf-8"))
    get = requests.Session().get
    base, total = screen(get, "cap_largeover")
    if not base or (total and len(base) < 0.9 * total):
        print("Finviz zwrócił za mało spółek — nic nie zapisuję.")
        return 1
    inds, inc = set(cfg.get("industries") or []), set(cfg.get("include") or {}) | set(cfg.get("founders") or {})
    cand = [x["ticker"] for x in base if x.get("industry") in inds or x["ticker"] in inc]
    det = details(get, cand)
    print(f"Kandydaci (kluczowe branże + include + founders): {len(cand)}")
    # SEC tylko dla spółek, które przechodzą F, L, I, P (ostatni kwartał = „T”)
    tmp = build(base, det, cfg, {}, dt.date.today())
    passers = [r["t"] for r in tmp["rows"] if r["flip"]]
    cache = json.load(open(SEC_CACHE, encoding="utf-8")) if os.path.exists(SEC_CACHE) else {}
    sfg = json.load(open("finviz_screen.json", encoding="utf-8")) if os.path.exists("finviz_screen.json") else {}
    try:
        sec.update(passers, cache, ua=os.environ.get("SEC_UA") or sfg.get("sec_ua") or sec.UA)
        os.makedirs(os.path.dirname(SEC_CACHE), exist_ok=True)
        json.dump(cache, open(SEC_CACHE, "w", encoding="utf-8"), separators=(",", ":"))
    except Exception as e:      # bez SEC lista dalej działa, tylko bez „T”
        print(f"SEC niedostępny ({e}) — bez danych kwartalnych.")
    out = build(base, det, cfg, cache, dt.date.today())
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    picks = [r["t"] for r in out["rows"] if r["pick"]]
    print(f"FLIP: {sum(r['flip'] for r in out['rows'])} spółek z 4 zielonymi literami; lista: {', '.join(picks)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
