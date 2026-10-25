"""Odświeżenie danych strony (raz w tygodniu w CI, po zamknięciu piątkowej sesji): Finviz (lista) → yfinance tygodniowe 5 lat
(wykres, średnie, MACD, obrót; spółki już zapisane w docs/data/weekly dostają tylko nowe tygodnie) → dla spółek z obrotem ≥ 50 mln $:
yfinance miesięczne High z całej historii (Green Line; tylko nowe zamknięte miesiące) i SEC (fundamenty, z pamięci podręcznej) → docs/data/watchlist.json + docs/data/weekly/<ticker>.json.
Ta sama strategia i te same obliczenia co w Momentum Desktop (agnar92/MomentumDesktop). Funkcje sieciowe można podmienić (testy).

    python watchlist.py                 # pobierz dane i przelicz lokalnie
    python watchlist.py --build-only    # przelicz stronę bez pobierania danych
    python watchlist.py --max-tickers 50
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from momentum import calc, estimates, finviz, prices, sec

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


def price_ratio(closes, sessions=252):
    """Aktualne zamknięcie / zamknięcie sprzed 252 sesji (ok. 52 tygodni); przy krótszej historii użyj najstarszej ceny."""
    if len(closes) < 2:
        return None
    base_i = max(0, len(closes) - (sessions + 1))
    base_close = closes[base_i]
    return closes[-1] / base_close if base_close else None


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


def fetch_scanners(scans, prev, fetch_list, log, min_tickers=MIN_TICKERS):
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
        stale = not rows or (len(rows) < min_tickers and (total is None or total >= min_tickers))
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
    # Zachowaj skanery, których nie odświeżaliśmy w tym uruchomieniu.
    # Dzięki temu zapis nowego linku pod nową nazwą nie usuwa poprzednich list z tabeli.
    refreshed = {sc["name"] for sc in scans}
    previous_meta = prev.get("scanners") or []
    preserved_names = {m.get("name") for m in previous_meta if m.get("name") and m.get("name") not in refreshed}
    for r in prev_rows:
        memberships = [name for name in (r.get("scanners") or []) if name in preserved_names]
        if not memberships:
            continue
        b = base.setdefault(r["ticker"], {**{k: r.get(k) for k in KEYS}, "scanners": []})
        for name in memberships:
            if name not in b["scanners"]:
                b["scanners"].append(name)

    if not base:
        raise RuntimeError("Finviz nie zwrócił spółek, a poprzedniej listy nie ma.")

    # Zachowaj kolejność skanerów z poprzedniego wyniku; zaktualizuj metadane
    # tych odświeżonych i dopisz nowe skanery na końcu.
    updated_meta = {m["name"]: m for m in meta}
    ordered_meta = []
    for old_meta in previous_meta:
        name = old_meta.get("name")
        if name in updated_meta:
            ordered_meta.append(updated_meta.pop(name))
        elif name in preserved_names:
            ordered_meta.append(old_meta)
    ordered_meta.extend(updated_meta.values())
    return list(base.values()), ordered_meta


ABOVE_GLB = ("WYBICIE", "SYGNAŁ", "NAD")   # spółki z wykresem dziennym
BENCH = "SPY"


def run(config, out=OUT, cache_dir=CACHE, log=print, fetch_list=finviz.fetch, weekly=prices.weekly, monthly=prices.monthly,
        fund=sec.update, now=None, daily=prices.daily, est=estimates.update, finviz_url=None, fetch_sec=True, fetch_only=False):
    now = now or dt.datetime.now(dt.timezone.utc)
    symbols = [s.strip().upper() for s in config.get("symbols") or [] if s.strip()]
    if BENCH not in symbols:   # SPY zawsze: siła względna i panel S&P 500
        symbols.append(BENCH)
    ua = os.environ.get("SEC_UA") or config.get("sec_ua") or sec.UA
    prev = load_json(Path(out) / "watchlist.json", {})
    scans = scanners(config)
    if finviz_url:
        clean_url = finviz_url.strip()
        parsed = urlparse(clean_url)
        params = parse_qs(parsed.query)
        filters = (params.get("f") or [None])[0]
        if not filters or not parsed.netloc.lower().endswith("finviz.com") or parsed.scheme not in ("http", "https"):
            raise RuntimeError("Nieprawidłowy link Finviz. Wklej pełny adres screenera Finviz z parametrem f=.")
        saved = {"name": "Finviz", "filters": filters, "url": clean_url, "max_tickers": finviz.MAX_TICKERS}
        config["scanners"] = [saved]
        write_json(CONFIG, config)
        scans = [saved]
        log(f"Zapisano jedyny skaner Finviz; filtry: {filters}")
    else:
        # Zawsze jeden skaner: zapisany URL ma pierwszeństwo; bez niego użyj pierwszego skonfigurowanego filtra.
        custom = [sc for sc in scans if sc.get("url")]
        scans = [custom[-1] if custom else scans[0]]
        log("Odświeżam jedyny skaner: " + (scans[0].get("url") or scans[0]["name"]))
    base, meta = fetch_scanners(scans, prev, fetch_list, log, min_tickers=1 if finviz_url else MIN_TICKERS)
    tickers = [r["ticker"] for r in base]
    extra = [s for s in symbols if s not in tickers]
    log(f"Razem {len(tickers)} spółek ze skanerów; symbole dodatkowe: {', '.join(extra) or '—'}")
    wdir = Path(out) / "weekly"
    saved = {t: load_json(wdir / file_name(t), None) for t in tickers + extra}
    series = weekly(tickers + extra, log=log, cache={t: s for t, s in saved.items() if s})
    # BLB needs all-time weekly highs; keep them separately from the 5-year chart candles.
    wh_path = Path(cache_dir) / "weekly_highs.json"
    wh_cache = load_json(wh_path, {})
    if weekly is prices.weekly:
        try:
            wh_cache = prices.weekly_highs(tickers + extra, cache=wh_cache, log=log, today=now.date())
            write_json(wh_path, wh_cache)
        except Exception as e:
            log(f"⚠ historia tygodniowych High dla BLB niedostępna ({e}) — używam dostępnych świec 5-letnich.")
    else:
        # Testy / wywołania z wstrzykniętym dostawcą cen nie powinny uruchamiać dodatkowych zapytań sieciowych.
        wh_cache = {t: wh_cache.get(t, []) for t in tickers + extra}
    # miesięczne High (Green Line), fundamenty, prognozy i świece dzienne dla wszystkich spółek ze skanerów (bez progu obrotu)
    liquid = [t for t in tickers if t in series]   # bez progu obrotu — płynność ustawia filtr skanera Finviz
    mcache = load_json(Path(cache_dir) / "monthly.json", {})
    scache = load_json(Path(cache_dir) / "sec.json", {}) if fetch_sec else {}
    monthly(liquid + [s for s in extra if s in series], mcache, log=log)
    write_json(Path(cache_dir) / "monthly.json", mcache)
    if fetch_sec:
        try:
            fund(liquid + [s for s in extra if s in series], scache, ua=ua, log=log)
        except Exception as e:
            log(f"⚠ SEC niedostępny ({e}) — używam zapisanych fundamentów.")
        write_json(Path(cache_dir) / "sec.json", scache)
    else:
        log("SEC/raporty fundamentalne: wyłączone na ten moment.")
    ecache = load_json(Path(cache_dir) / "estimates.json", {})   # niespodzianki EPS i rewizja prognoz (yfinance), co 7 dni
    try:
        est(liquid + [s for s in extra if s in series and s != BENCH], ecache, log=log)
    except Exception as e:
        log(f"⚠ prognozy EPS niedostępne ({e}) — używam zapisanych.")
    write_json(Path(cache_dir) / "estimates.json", ecache)

    if fetch_only:
        # Refresh pobiera tylko dane źródłowe/cache. Wskaźniki i końcowy watchlist.json
        # są liczone osobno przez Deploy Pages na podstawie tych zapisanych plików.
        wdir.mkdir(parents=True, exist_ok=True)
        keep = set()
        for ticker, data in series.items():
            name = file_name(ticker)
            keep.add(name)
            write_json(wdir / name, data)
        for path in wdir.glob("*.json"):
            if path.name not in keep:
                path.unlink()

        daily_symbols = list(dict.fromkeys(liquid + [BENCH]))
        daily_cache_dir = Path(cache_dir) / "daily"
        daily_cache = {t: load_json(daily_cache_dir / file_name(t), None) for t in daily_symbols}
        daily_cache = {t: data for t, data in daily_cache.items() if data}
        try:
            dser = daily(daily_symbols, log=log, period="2y", cache=daily_cache, today=now.date()) if daily_symbols else {}
        except Exception as e:
            log(f"⚠ dzienne dane źródłowe niedostępne ({e}) — zachowuję cache.")
            dser = daily_cache
        daily_cache_dir.mkdir(parents=True, exist_ok=True)
        for ticker, data in dser.items():
            if data:
                write_json(daily_cache_dir / file_name(ticker), data)
        write_json(Path(out) / "source_list.json", {
            "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "scanners": meta, "rows": base, "symbols": extra,
        })
        log(f"✓ Dane źródłowe zapisane: {len(series)} serii tygodniowych; bez obliczania wskaźników.")
        return []

    previous_rows = {r.get("ticker"): r for r in (prev.get("rows") or []) if isinstance(r, dict)}
    def row(b):
        ticker = b["ticker"]
        return calc.build_row(b, series[ticker], prices.monthly_highs(mcache.get(ticker)), scache.get(ticker), series.get(BENCH), ecache.get(ticker), weekly_highs=wh_cache.get(ticker), previous_row=previous_rows.get(ticker))
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
    # Świece dzienne z 2 lat dla C/C[252] i RVol dziennego (50 sesji).
    # Do plików wykresu zapisujemy tylko spółki z sygnałem/ponad GLB.
    ddir = Path(out) / "daily"
    above = [r["ticker"] for r in rows if r.get("glb_state") in ABOVE_GLB]
    daily_symbols = list(dict.fromkeys(liquid + [BENCH]))
    daily_cache_dir = Path(cache_dir) / "daily"
    daily_cache = {t: load_json(daily_cache_dir / file_name(t), None) for t in daily_symbols}
    daily_cache = {t: series for t, series in daily_cache.items() if series}
    try:
        if daily_symbols and daily is prices.daily:
            dser = daily(daily_symbols, log=log, period="2y", cache=daily_cache, today=now.date())
        else:
            dser = daily(daily_symbols, log=log, period="2y") if daily_symbols else {}
    except Exception as e:
        log(f"⚠ dzienne (RVol/C/C[250]) niedostępne ({e})")
        dser = daily_cache
    daily_cache_dir.mkdir(parents=True, exist_ok=True)
    for t, sd in dser.items():
        if sd:
            write_json(daily_cache_dir / file_name(t), sd)
    ddir.mkdir(parents=True, exist_ok=True)
    dkeep = set()
    for t in list(dict.fromkeys(above + [BENCH])):
        sd = dser.get(t)
        if sd:
            dkeep.add(file_name(t))
            write_json(ddir / file_name(t), sd)
    for f in ddir.glob("*.json"):
        if f.name not in dkeep:
            f.unlink()
    for r in rows:
        sd = dser.get(r["ticker"])
        r["daily"] = r["ticker"] in above and sd is not None
        closes = sd.get("c", []) if sd else []
        # C/C[52 tyg.]: 252 sesje wstecz; wskaźnik wykresu pozostaje pusty do uzyskania pełnego okresu.
        r["cc52w"] = price_ratio(closes)
        bd = calc.fresh_blue_dot(sd, r.get("glb")) if r.get("glb_state") == "NAD" else None
        if bd:
            r["glb_state"], r["bdot"] = "BLUE DOT", bd
        r["rvol_d"] = calc.rel_volume(sd["v"], calc.RVOL_D) if sd else None
    last = max((series[r["ticker"]]["d"][-1] for r in rows), default=None)
    write_json(Path(out) / "watchlist.json", {
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "data_as_of": last, "scanners": meta,
        "finviz_stale": any(m["stale"] for m in meta), "rules": {"confirm_months": calc.CONFIRM_MONTHS, "entry_max_pct": calc.ENTRY_MAX_PCT,
                                          "min_rev_growth": calc.MIN_REV_GROWTH,
                                          "min_dopm": calc.MIN_DOPM, "max_ps": calc.MAX_PS, "min_rs": calc.MIN_RS, "stop_pct": calc.STOP_PCT},
        "rows": rows, "symbols": sym_rows})
    ok = sum(1 for r in rows if r["ok"])
    sig = sum(1 for r in rows if r["ok"] and r["glb_state"] in ("SYGNAŁ", "WYBICIE"))
    log(f"✓ Gotowe: {len(rows)} spółek, warunki spełnia {ok}, sygnał GLB: {sig}")
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--max-tickers", type=int)
    ap.add_argument("--finviz-url", default=os.environ.get("FINVIZ_URL") or None, help="Link do screenera Finviz; zapisze się w konfiguracji.")
    ap.add_argument("--no-sec", action="store_true", help="Wyłącz pobieranie raportów i fundamentów z SEC.")
    ap.add_argument("--fetch-only", action="store_true", help="Pobierz/uzupełnij źródła danych i cache bez liczenia wskaźników.")
    ap.add_argument("--build-only", action="store_true",
                    help="Przelicz stronę wyłącznie z zapisanych danych; nie odpytuj Finviz, yfinance ani SEC.")
    args = ap.parse_args(argv)
    config = load_json(CONFIG, {})
    if args.max_tickers:   # limit dla każdego skanera (test na małej liście)
        config["max_tickers"] = args.max_tickers
        for sc in config.get("scanners") or []:
            sc["max_tickers"] = args.max_tickers
    try:
        if args.build_only:
            # Deploy Page: deterministyczne przeliczenie wskaźników z zapisanych danych.
            # Dostawcy poniżej czytają JSON/cache i nie wykonują zapytań sieciowych.
            previous = load_json(OUT / "source_list.json", {})
            previous_rows = previous.get("rows") or load_json(OUT / "watchlist.json", {}).get("rows") or []
            if not previous_rows:
                raise RuntimeError("Brak zapisanej listy spółek — uruchom najpierw Weekly Refresh.")

            def offline_fetch(_filters, max_tickers=None, log=print):
                return previous_rows, len(previous_rows)

            def offline_weekly(tickers, log=print, cache=None, **_kwargs):
                out = {}
                for ticker in tickers:
                    series = load_json(OUT / "weekly" / file_name(ticker), None)
                    if series:
                        out[ticker] = series
                return out

            def offline_daily(tickers, log=print, **_kwargs):
                out = {}
                for ticker in tickers:
                    series = load_json(CACHE / "daily" / file_name(ticker), None)
                    if series:
                        out[ticker] = series
                return out

            run(config, fetch_list=offline_fetch, weekly=offline_weekly,
                monthly=lambda _tickers, _cache, **_kwargs: None,
                fund=lambda _tickers, _cache, **_kwargs: None,
                daily=offline_daily, est=lambda _tickers, _cache, **_kwargs: None,
                fetch_sec=True)
        elif args.fetch_only:
            run(config, finviz_url=args.finviz_url, fetch_sec=not args.no_sec, fetch_only=True)
        else:
            run(config, finviz_url=args.finviz_url, fetch_sec=not args.no_sec)
    except RuntimeError as e:
        print(f"❌ {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
