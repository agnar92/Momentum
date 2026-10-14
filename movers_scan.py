"""Movers — ręczny skan spółek, które dziś rosną, na SAMYCH CENACH (bez fundamentów, EPS i estymat).

Workflow `Movers` (movers.yml) uruchamia ten skrypt na żądanie. Lista spółek pochodzi z jednego skanera Finviz (DEFAULT_FILTERS = skaner użytkownika: kapitalizacja
od 2 mld $, średni wolumen > 1 mln, zmiana dnia > 3 %, cena nad SMA20 / SMA50 / SMA200). Dla każdej spółki z listy pobieramy z yfinance 3 lata cen dziennych
(MOVERS_PERIOD) — z nich liczymy średnie, Dar-Card i wykresy tygodniowe oraz dzienne. Wynik: docs/data/watchlist_movers.json (lista z dzisiejszą zmianą,
wolumenem i metrykami cenowymi) i docs/data/charts_movers.json (wykresy tygodniowe + dzienne) — zakładka Movers w aplikacji czyta te pliki.
Nie rusza watchlist.json / charts.json (lista CANSLIM, pobierana raz w tygodniu) ani migawki raw-data.
"""
import argparse
import json
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import finviz
import watchlist

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "docs" / "data"
MOVERS_PERIOD = "3y"        # 3 lata dziennych cen: SMA 10 / 40 tygodni, SMA 10 / 50 sesji, Dar-Card, wykres słupkowy (tygodniowy i dzienny)
# Skaner użytkownika (Finviz, v=111): kapitalizacja od 2 mld $ (mid cap i więcej), średni wolumen > 1 mln, zmiana dnia > 3 %, cena nad SMA20, SMA50 i SMA200.
DEFAULT_FILTERS = "cap_midover,sh_avgvol_o1000,ta_change_u3,ta_sma20_pa,ta_sma200_pa,ta_sma50_pa"
FREE_LIMIT = 1000           # darmowy screener Finviz nie oddaje wierszy powyżej 1000 (r=1001 -> 403)
# Widok własny Finviz (c=…): kolumny skanera dnia. Nagłówki tak, jak zwraca je strona.
VIEW_COLUMNS = {"Company": "company", "Sector": "sector", "Industry": "industry", "Market Cap": "market_cap", "Price": "price_fv",
                "Change %": "change_pct", "Volume": "volume", "Avg Volume": "avg_volume", "Rel Volume": "rel_volume"}
VIEW_IDS = "0,1,2,3,4,6,65,66,67,63,64"   # No., Ticker, Company, Sector, Industry, Market Cap, Price, Change %, Volume, Avg Volume, Rel Volume
EXTRA_KEYS = ("price_fv", "change_pct", "volume", "avg_volume", "rel_volume")
# Oceny względne (percentyl wśród spółek na liście) nie mają sensu na liście ruchów dnia — zerujemy je, żeby nie wprowadzały w błąd.
RELATIVE_KEYS = ("rs_rating", "accdis_rating", "accdis", "industry_rating", "leader")


@contextmanager
def _movers_view():
    """Na czas pobierania widok własny „152” zwraca kolumny skanera dnia (zmiana, wolumen, wolumen względny…) zamiast kolumn fundamentów."""
    saved = (finviz.VIEW_COLUMNS.get("152"), finviz.VIEW_PARAMS.get("152"), set(finviz.TEXT_KEYS))
    finviz.VIEW_COLUMNS["152"], finviz.VIEW_PARAMS["152"] = dict(VIEW_COLUMNS), {"c": VIEW_IDS}
    finviz.TEXT_KEYS.update({"company", "sector", "industry"})
    try:
        yield
    finally:
        finviz.VIEW_COLUMNS["152"], finviz.VIEW_PARAMS["152"] = saved[0], saved[1]
        finviz.TEXT_KEYS.clear()
        finviz.TEXT_KEYS.update(saved[2])


def fetch_movers(filters, log=print):
    """Lista ze skanera Finviz (widok własny z kolumnami dnia). -> (wiersze, razem według Finviz)."""
    with _movers_view():
        rows, total = finviz.fetch_view("152", filters, FREE_LIMIT)
    if total and total > FREE_LIMIT:
        log(f"⚠️  Finviz ma {total} wyników, a darmowy screener oddaje tylko {FREE_LIMIT} — zawęź filtry.")
    return rows, total


def sanitize_frames(frames, log=print):
    """Usuwa świece z zerową / ujemną / brakującą ceną (Yahoo zdarza się oddać Low = 0) — jedna taka świeca wywala obliczenia dzieleniem przez zero."""
    cols = ["Open", "High", "Low", "Close"]
    out, bad = {}, 0
    for t, df in frames.items():
        try:
            ok = (df[cols] > 0).all(axis=1)
            if not ok.all():
                bad += 1
                attrs = dict(df.attrs)
                df = df[ok]
                df.attrs.update(attrs)
        except Exception:
            pass
        if len(df):
            out[t] = df
    if bad:
        log(f"ℹ️  Usunięto błędne świece (cena ≤ 0) w {bad} spółkach.")
    return out


@contextmanager
def _safe_metrics(log=print):
    """Błąd obliczeń jednej spółki ją pomija, a nie przerywa całego skanu."""
    orig = watchlist.compute_metrics

    def wrapped(df, *a, **k):
        try:
            return orig(df, *a, **k)
        except Exception as e:
            log(f"⚠️  Pominięto spółkę (błąd obliczeń: {type(e).__name__}: {e}).")
            return None
    watchlist.compute_metrics = wrapped
    try:
        yield
    finally:
        watchlist.compute_metrics = orig


def run(data_dir=None, filters=None, log=print):
    """-> 0 / 1. Zapisuje watchlist_movers.json i charts_movers.json w data_dir (przy błędzie zostają poprzednie pliki)."""
    data_dir = Path(data_dir or DATA_DIR)
    filters = filters or DEFAULT_FILTERS
    log(f"Skaner Finviz: {filters}")
    try:
        rows, total = fetch_movers(filters, log)
    except Exception as e:
        log(f"❌ Finviz niedostępny ({e}) — zostają poprzednie pliki.")
        return 1
    if not rows:
        log("❌ Finviz nie zwrócił żadnej spółki (brak ruchów spełniających filtr albo zmiana układu strony) — zostają poprzednie pliki.")
        return 1
    log(f"Finviz: {len(rows)} spółek. Pobieram {MOVERS_PERIOD} cen z yfinance…")
    tickers = [r["ticker"] for r in rows]
    frames = sanitize_frames(watchlist.download_prices(tickers, period=MOVERS_PERIOD), log)
    coverage = len(frames) / len(tickers)
    log(f"Ceny dla {len(frames)}/{len(tickers)} spółek ({coverage:.0%}).")
    if coverage < watchlist.MIN_COVERAGE:
        log(f"❌ Pokrycie cen poniżej {watchlist.MIN_COVERAGE:.0%} — przerywam bez zapisu (zostają poprzednie pliki).")
        return 1
    try:
        benchmark_df = watchlist.download_prices([watchlist.BENCHMARK], period=MOVERS_PERIOD).get(watchlist.BENCHMARK)
    except Exception as e:
        log(f"⚠️  Benchmark {watchlist.BENCHMARK} niedostępny ({e}) — wykresy bez linii S&P 500.")
        benchmark_df = None
    now_utc = datetime.now(timezone.utc)
    now_ts = watchlist.pd.Timestamp(now_utc)
    with _safe_metrics(log):
        stocks = watchlist.build_stocks(rows, frames, now_ts, bench_df=benchmark_df)
    if not stocks:
        log("❌ Żadna spółka nie przeszła obliczeń — nie zapisuję.")
        return 1
    by_ticker = {r["ticker"]: r for r in rows}
    for s in stocks:
        row = by_ticker.get(s["ticker"], {})
        s.update({k: row.get(k) for k in EXTRA_KEYS})
        s.update({k: None for k in RELATIVE_KEYS})
    stocks.sort(key=lambda s: s.get("change_pct") if isinstance(s.get("change_pct"), (int, float)) else float("-inf"), reverse=True)
    charts = watchlist.build_charts([s["ticker"] for s in stocks], frames, benchmark_df, {}, now_ts)
    for s in stocks:
        summary = ((charts or {}).get("stocks", {}).get(s["ticker"]) or {}).get("rs_line") or {}
        s["rs_line_state"] = summary.get("state")
        s["rs_line_dist_pct"] = summary.get("dist_pct")
    payload = {
        "generated_at": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_as_of": max((s["as_of"] for s in stocks), default=None),
        "movers_filters": filters,
        "finviz_total": total,
        "n_stocks": len(stocks),
        "stocks": stocks,
    }
    data_dir.mkdir(parents=True, exist_ok=True)
    out = data_dir / "watchlist_movers.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")
    log(f"💾 Zapisano {out} ({len(stocks)} spółek, dane z sesji {payload['data_as_of']}).")
    if charts is not None:
        cout = data_dir / "charts_movers.json"
        cout.write_text(json.dumps(charts, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")
        log(f"💾 Zapisano {cout} (wykresy tygodniowe i dzienne {len(charts['stocks'])} spółek, {cout.stat().st_size / 1e6:.1f} MB).")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description="Movers: lista ze skanera Finviz + 3 lata cen -> docs/data/watchlist_movers.json + charts_movers.json")
    p.add_argument("--filters", type=str, default=None, help="Filtr Finviz (kody po przecinku); domyślnie skaner użytkownika: " + DEFAULT_FILTERS + ".")
    p.add_argument("--data-dir", type=str, default=None, help="Katalog wyjściowy (domyślnie docs/data).")
    a = p.parse_args(argv)
    return run(a.data_dir, a.filters)


if __name__ == "__main__":
    raise SystemExit(main())
