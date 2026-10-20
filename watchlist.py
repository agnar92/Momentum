"""Odświeżenie danych strony (raz w tygodniu w CI, po zamknięciu piątkowej sesji): Finviz (lista) → yfinance tygodniowe 3 lata
(wykres, średnie, MACD, obrót; spółki już zapisane w docs/data/weekly dostają tylko nowe tygodnie) → dla spółek z obrotem ≥ 50 mln $:
yfinance miesięczne High z całej historii (Green Line; tylko nowe zamknięte miesiące) i SEC (fundamenty, z pamięci podręcznej) → docs/data/watchlist.json + docs/data/weekly/<ticker>.json.
Ta sama strategia i te same obliczenia co w Momentum Desktop (agnar92/MomentumDesktop). Funkcje sieciowe można podmienić (testy).

    python watchlist.py                 # pełne odświeżenie
    python watchlist.py --max-tickers 50
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

from momentum import calc, finviz, prices, sec

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "finviz_screen.json"
OUT = ROOT / "docs" / "data"
CACHE = ROOT / "data"
MIN_TICKERS = 15   # mniej spółek z Finviz = blokada albo zmiana strony -> zostaje poprzednia lista


def load_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def write_json(path, data):
    """Zapis atomowy (najpierw plik tymczasowy)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, path)


def file_name(ticker):
    """Nazwa pliku świec: znaki spoza [A-Za-z0-9.-] -> '_' (np. ^GSPC -> _GSPC). Ta sama funkcja jest w docs/js/app.js."""
    return re.sub(r"[^A-Za-z0-9.-]", "_", ticker) + ".json"


def scanners(config):
    """Skanery z finviz_screen.json: [{name, filters, max_tickers}]. Stary zapis (samo `filters`) = jeden skaner „Domyślny”."""
    items = [x for x in config.get("scanners") or [] if isinstance(x, dict) and x.get("filters")]
    if not items:
        items = [{"name": "Domyślny", "filters": config.get("filters") or finviz.DEFAULT_FILTERS, "max_tickers": config.get("max_tickers")}]
    return [{"name": str(x.get("name") or f"Skaner {i + 1}"), "filters": x["filters"], "max_tickers": int(x.get("max_tickers") or finviz.MAX_TICKERS)}
            for i, x in enumerate(items)]


KEYS = ("ticker", "company", "sector", "industry", "market_cap")


def fetch_scanners(scans, prev, fetch_list, log):
    """Każdy skaner osobno w Finviz; spółki łączone po tickerze (pole `scanners` = nazwy skanerów, w których jest).
    Skaner, którego Finviz nie zwrócił (blokada / błąd), dostaje spółki z poprzedniego pliku. -> (spółki, opis skanerów)."""
    base, meta = {}, []
    prev_rows = prev.get("rows") or []
    for sc in scans:
        log(f"Finviz [{sc['name']}]: filtr {sc['filters']}")
        try:
            rows, total = fetch_list(sc["filters"], max_tickers=sc["max_tickers"], log=log)
        except Exception as e:   # Finviz bywa blokowany z serwerów — wtedy poprzednia lista
            log(f"⚠ Finviz [{sc['name']}]: {e}")
            rows, total = [], None
        stale = not rows or (len(rows) < MIN_TICKERS and (total is None or total >= MIN_TICKERS))
        if stale:
            old = [r for r in prev_rows if sc["name"] in (r.get("scanners") or [sc["name"]])]
            log(f"⚠ Finviz [{sc['name']}] zwrócił {len(rows)} spółek — używam poprzedniej listy ({len(old)}).")
            rows = [{k: r.get(k) for k in KEYS} for r in old]
            total = next((m.get("total") for m in prev.get("scanners") or [] if m.get("name") == sc["name"]), prev.get("finviz_total"))
        for r in rows:
            b = base.setdefault(r["ticker"], {**{k: r.get(k) for k in KEYS}, "scanners": []})
            b["scanners"].append(sc["name"])
        meta.append({"name": sc["name"], "filters": sc["filters"], "total": total, "n": len(rows), "stale": stale})
        log(f"Finviz [{sc['name']}]: {len(rows)} spółek{f' z {total}' if total and total != len(rows) else ''}")
    if not base:
        raise RuntimeError("Finviz nie zwrócił spółek, a poprzedniej listy nie ma.")
    return list(base.values()), meta


def run(config, out=OUT, cache_dir=CACHE, log=print, fetch_list=finviz.fetch, weekly=prices.weekly, monthly=prices.monthly,
        fund=sec.update, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    symbols = [s.strip().upper() for s in config.get("symbols") or [] if s.strip()]
    ua = os.environ.get("SEC_UA") or config.get("sec_ua") or sec.UA
    prev = load_json(Path(out) / "watchlist.json", {})
    base, meta = fetch_scanners(scanners(config), prev, fetch_list, log)
    tickers = [r["ticker"] for r in base]
    extra = [s for s in symbols if s not in tickers]
    log(f"Razem {len(tickers)} spółek ze skanerów; symbole dodatkowe: {', '.join(extra) or '—'}")
    wdir = Path(out) / "weekly"
    saved = {t: load_json(wdir / file_name(t), None) for t in tickers + extra}
    series = weekly(tickers + extra, log=log, cache={t: s for t, s in saved.items() if s})
    # fundamenty i całą historię miesięczną pobieramy tylko dla spółek, które przechodzą próg obrotu (reszta i tak odpada)
    liquid = [t for t in tickers if t in series and (calc.turnover(series[t]["c"], series[t]["v"]) or 0) >= calc.MIN_TURNOVER]
    log(f"Obrót ≥ {calc.MIN_TURNOVER / 1e6:.0f} mln $ dziennie: {len(liquid)} spółek")
    mcache = load_json(Path(cache_dir) / "monthly.json", {})
    scache = load_json(Path(cache_dir) / "sec.json", {})
    monthly(liquid + [s for s in extra if s in series], mcache, log=log)
    write_json(Path(cache_dir) / "monthly.json", mcache)
    try:
        fund(liquid + [s for s in extra if s in series], scache, ua=ua, log=log)
    except Exception as e:
        log(f"⚠ SEC niedostępny ({e}) — używam zapisanych fundamentów.")
    write_json(Path(cache_dir) / "sec.json", scache)

    def row(b):
        return calc.build_row(b, series[b["ticker"]], prices.monthly_highs(mcache.get(b["ticker"])), scache.get(b["ticker"]))
    rows = [row(b) for b in base if b["ticker"] in series]
    sym_rows = [row({"ticker": s}) for s in extra if s in series]
    if len(rows) < 0.7 * len(tickers):
        raise RuntimeError(f"Ceny tylko dla {len(rows)} z {len(tickers)} spółek — nic nie zapisuję.")
    wdir.mkdir(parents=True, exist_ok=True)
    keep = set()
    for r in rows + sym_rows:
        name = file_name(r["ticker"])
        keep.add(name)
        write_json(wdir / name, series[r["ticker"]])
    for f in wdir.glob("*.json"):
        if f.name not in keep:
            f.unlink()
    last = max((series[r["ticker"]]["d"][-1] for r in rows), default=None)
    write_json(Path(out) / "watchlist.json", {
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "data_as_of": last, "scanners": meta,
        "finviz_stale": any(m["stale"] for m in meta), "rules": {"confirm_months": calc.CONFIRM_MONTHS, "entry_max_pct": calc.ENTRY_MAX_PCT,
                                          "min_turnover": calc.MIN_TURNOVER, "min_rev_growth": calc.MIN_REV_GROWTH,
                                          "min_dopm": calc.MIN_DOPM, "stop_pct": calc.STOP_PCT},
        "rows": rows, "symbols": sym_rows})
    ok = sum(1 for r in rows if r["ok"])
    sig = sum(1 for r in rows if r["ok"] and r["glb_state"] in ("SYGNAŁ", "WYBICIE"))
    log(f"✓ Gotowe: {len(rows)} spółek, warunki spełnia {ok}, sygnał GLB: {sig}")
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--max-tickers", type=int)
    args = ap.parse_args(argv)
    config = load_json(CONFIG, {})
    if args.max_tickers:   # limit dla każdego skanera (test na małej liście)
        config["max_tickers"] = args.max_tickers
        for sc in config.get("scanners") or []:
            sc["max_tickers"] = args.max_tickers
    try:
        run(config)
    except RuntimeError as e:
        print(f"❌ {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
