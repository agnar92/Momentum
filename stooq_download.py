"""Download historical OHLC CSV data from stooq.pl.

A plain `requests.get(...)` against stooq's CSV export endpoint
(https://stooq.pl/q/d/l/) gets stooq's anti-bot page back instead of a CSV
("This site requires JavaScript to verify your browser..."). That page
turns out to be a client-side proof-of-work challenge, not real
browser/TLS fingerprinting: it hands over a random string `c` and a
difficulty `d`, has the browser brute-force a nonce `n` such that
sha256(c + n) has `d` leading hex zeros, POSTs `{c, n}` to `/__verify`,
then reloads. That's pure hashing — solvable in plain Python with
`hashlib` in a few milliseconds, no real browser or TLS-fingerprint
emulation (cloudscraper, Playwright, etc.) required.

Usage:
    python stooq_download.py ale -i w -o ale.csv
"""
import argparse
import hashlib
import io
import re
import sys
from urllib.parse import urljoin

import pandas as pd
import requests

STOOQ_URL = "https://stooq.pl/q/d/l/"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
}

CHALLENGE_RE = re.compile(r'const c="([^"]+)"\s*,\s*d=(\d+)')

MAX_CHALLENGE_ATTEMPTS = 3


def _solve_pow(challenge, difficulty):
    """Brute-forces the nonce n such that sha256(challenge + n) has
    `difficulty` leading hex-zero digits, mirroring the page's own JS loop."""
    target = "0" * difficulty
    n = 0
    while True:
        digest = hashlib.sha256(f"{challenge}{n}".encode()).hexdigest()
        if digest.startswith(target):
            return n
        n += 1


def _is_pow_challenge(text):
    return "/__verify" in text and 'const c="' in text


def _solve_and_verify(session, html, timeout):
    match = CHALLENGE_RE.search(html)
    if not match:
        raise ValueError("Nie udało się sparsować wyzwania proof-of-work stooq (format strony się zmienił?).")
    challenge, difficulty = match.group(1), int(match.group(2))
    nonce = _solve_pow(challenge, difficulty)
    verify_url = urljoin(STOOQ_URL, "/__verify")
    resp = session.post(
        verify_url,
        data={"c": challenge, "n": str(nonce)},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=timeout,
    )
    resp.raise_for_status()


def fetch_stooq_csv(symbol, interval="d", start=None, end=None, timeout=30):
    """Fetch OHLC history for `symbol` from stooq.pl as a DataFrame.

    interval: 'd' (daily), 'w' (weekly), 'm' (monthly), or 'q'/'y' etc.
    start/end: optional 'YYYYMMDD' strings, passed through as stooq's d1/d2.
    Solves stooq's proof-of-work verification page automatically if served one.
    Raises ValueError if a CSV still can't be obtained after solving it.
    """
    params = {"s": symbol, "i": interval}
    if start:
        params["d1"] = start
    if end:
        params["d2"] = end

    session = requests.Session()
    session.headers.update(BROWSER_HEADERS)

    resp = session.get(STOOQ_URL, params=params, timeout=timeout)
    resp.raise_for_status()

    attempts = 0
    while _is_pow_challenge(resp.text) and attempts < MAX_CHALLENGE_ATTEMPTS:
        _solve_and_verify(session, resp.text, timeout)
        resp = session.get(STOOQ_URL, params=params, timeout=timeout)
        resp.raise_for_status()
        attempts += 1

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
