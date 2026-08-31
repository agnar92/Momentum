"""Download historical OHLC CSV data from stooq.pl.

A plain `requests.get(...)` against stooq's CSV export endpoint
(https://stooq.pl/q/d/l/) gets stooq's own anti-bot page back instead of a
CSV ("Ta strona wymaga JavaScriptu do weryfikacji przeglądarki...") — this
is a real JavaScript browser-verification challenge, not just a
User-Agent check, so plain `requests`/`urllib` can't get through it no
matter what headers are sent. `cloudscraper` (a `requests.Session`
subclass that emulates a browser's TLS/JS fingerprint and solves this
class of challenge automatically) is used here instead.

Usage:
    python stooq_download.py ale -i w -o ale.csv
"""
import argparse
import io
import sys

import cloudscraper
import pandas as pd
import requests

STOOQ_URL = "https://stooq.pl/q/d/l/"


def fetch_stooq_csv(symbol, interval="d", start=None, end=None, timeout=30):
    """Fetch OHLC history for `symbol` from stooq.pl as a DataFrame.

    interval: 'd' (daily), 'w' (weekly), 'm' (monthly), or 'q'/'y' etc.
    start/end: optional 'YYYYMMDD' strings, passed through as stooq's d1/d2.
    Raises ValueError if stooq's JS-verification page comes back instead of a CSV.
    """
    params = {"s": symbol, "i": interval}
    if start:
        params["d1"] = start
    if end:
        params["d2"] = end

    scraper = cloudscraper.create_scraper()
    resp = scraper.get(STOOQ_URL, params=params, timeout=timeout)
    resp.raise_for_status()

    text = resp.text
    if not text.strip() or text.lstrip().startswith("<"):
        raise ValueError(
            f"stooq zwrócił błąd/HTML (prawdopodobnie stronę weryfikacji JS) zamiast CSV "
            f"dla symbolu '{symbol}': {text[:200]!r}"
        )

    df = pd.read_csv(io.StringIO(text))
    if "Data" in df.columns:
        df["Data"] = pd.to_datetime(df["Data"])
    return df


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pobiera dane historyczne CSV ze stooq.pl.")
    parser.add_argument("symbol", help="Symbol tickera na stooq.pl, np. 'ale'")
    parser.add_argument("-i", "--interval", default="d", help="Interwał: d/w/m (domyślnie 'd')")
    parser.add_argument("--start", help="Data początkowa YYYYMMDD")
    parser.add_argument("--end", help="Data końcowa YYYYMMDD")
    parser.add_argument("-o", "--output", help="Ścieżka pliku wyjściowego CSV (domyślnie stdout)")
    args = parser.parse_args()

    try:
        df = fetch_stooq_csv(args.symbol, interval=args.interval, start=args.start, end=args.end)
    except (requests.RequestException, ValueError) as e:
        print(f"❌ {e}", file=sys.stderr)
        sys.exit(1)

    if args.output:
        df.to_csv(args.output, index=False)
        print(f"✅ Zapisano {len(df)} wierszy do {args.output}")
    else:
        print(df.to_csv(index=False))
