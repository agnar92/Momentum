"""Download historical OHLC CSV data from stooq.pl.

A plain `requests.get(...)` against stooq's CSV export endpoint
(https://stooq.pl/q/d/l/) returns HTTP 403, because stooq rejects the
default "python-requests/x.x" User-Agent while happily serving the exact
same URL to a browser. Sending a browser-like User-Agent (no cookies or
auth needed) is enough to get the real CSV back.

Usage:
    python stooq_download.py ale -i w -o ale.csv
"""
import argparse
import io
import sys

import pandas as pd
import requests

STOOQ_URL = "https://stooq.pl/q/d/l/"

# A bare `requests` User-Agent gets a 403 from stooq; any browser-like
# string is accepted.
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/csv,text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://stooq.pl/",
}


def fetch_stooq_csv(symbol, interval="d", start=None, end=None, timeout=15):
    """Fetch OHLC history for `symbol` from stooq.pl as a DataFrame.

    interval: 'd' (daily), 'w' (weekly), 'm' (monthly), or 'q'/'y' etc.
    start/end: optional 'YYYYMMDD' strings, passed through as stooq's d1/d2.
    Raises ValueError if stooq returns its "no data" HTML page instead of a CSV.
    """
    params = {"s": symbol, "i": interval}
    if start:
        params["d1"] = start
    if end:
        params["d2"] = end

    resp = requests.get(STOOQ_URL, params=params, headers=BROWSER_HEADERS, timeout=timeout)
    resp.raise_for_status()

    text = resp.text
    if not text.strip() or text.lstrip().startswith("<"):
        raise ValueError(f"stooq zwrócił błąd/HTML zamiast CSV dla symbolu '{symbol}': {text[:200]!r}")

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
