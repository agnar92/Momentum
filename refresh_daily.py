"""Lekkie, DZIENNE odswiezenie sygnalu "Continuation" (dashboard, zakladka
🚀 Continuation) — uruchamiane na zadanie przyciskiem "Odswiez dane D1" na
stronie (workflow .github/workflows/daily_continuation.yml), bez pelnego,
ciezkiego pipeline'u (fetch_data.py + run_query.py liczy sie nadal raz w
tygodniu, w sobote).

1. Wybiera "tygodniowych zwyciezcow" z JUZ wygenerowanych docs/data/{universe}.json
   (sobotni eksport): Etap 2A/2B, momentum_score > 0, ostatni rsm_medium > 0.
   To NADZBIOR bramki trendu z app.js::classifyContinuation — prog momentum
   12M jest suwakiem na stronie, wiec tu go nie stosujemy (front odfiltruje).
2. Pobiera z Yahoo Finance (fetch_data._download_price_rows — ta sama funkcja co
   pelny pipeline) dzienne swiece TYLKO tych spolek (~100 zamiast ~700) i tylko
   za ostatnie run_query.DAILY_SQUEEZE_LOOKBACK_DAYS dni.
3. Liczy dzienny TTM Squeeze TYM SAMYM kodem co pipeline
   (run_query.compute_daily_squeeze) na bazie DuckDB w pamieci — nic nie trafia
   do momentum_data.duckdb.
4. Zapisuje docs/data/continuation.json — front nadpisuje nim daily_squeeze
   spolki, gdy jest swiezszy niz ten z sobotniego eksportu.
"""
import argparse
import datetime
import json
import os

import duckdb
import pandas as pd

import fetch_data
import run_query

OUTPUT_FILE = "continuation.json"
WEEKLY_WINNER_STAGES = {"2A", "2B"}


def _latest_non_null(values):
    for v in reversed(values or []):
        if v is not None:
            return v
    return None


def weekly_winners(docs_data_dir):
    """[(ticker, universe)] spolek, ktore przechodza tygodniowa bramke trendu.
    Duplikaty (spolka w dwoch uniwersach) — pierwsze wystapienie w kolejnosci
    run_query.UNIVERSES wygrywa, tak samo jak combinedContinuationCandidates."""
    winners, seen = [], set()
    for universe in run_query.UNIVERSES:
        path = os.path.join(docs_data_dir, f"{universe.lower()}.json")
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"⚠️  Pomijam {universe}: {e}")
            continue
        for c in data.get("all_constituents") or data.get("constituents") or []:
            ticker = c.get("ticker")
            if not ticker or ticker in seen:
                continue
            stage = (c.get("weekly_chart") or {}).get("current_stage")
            rs_medium = _latest_non_null((c.get("mansfield_chart") or {}).get("rsm_medium"))
            if stage in WEEKLY_WINNER_STAGES and (c.get("momentum_score") or 0) > 0 \
                    and rs_medium is not None and rs_medium > 0:
                winners.append((ticker, universe))
                seen.add(ticker)
    return winners


def build_payload(winners, rows, today):
    """Liczy daily_squeeze dla kazdego zwyciezcy z pobranych wierszy
    (Date, Ticker, Close, Adj_Close, Volume, High, Low) — czysta funkcja bez
    sieci, zeby dalo sie ja przetestowac."""
    con = duckdb.connect(":memory:")
    con.execute("""
        CREATE TABLE prices (
            Date DATE, Ticker VARCHAR, Close DOUBLE, Adj_Close DOUBLE, Volume BIGINT,
            High DOUBLE, Low DOUBLE
        )
    """)
    if rows:
        con.executemany("INSERT INTO prices VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
    ref = con.execute("SELECT MAX(Date) FROM prices").fetchone()[0]
    tickers, missing = {}, []
    for ticker, universe in winners:
        summary = run_query.compute_daily_squeeze(con, ticker, ref) if ref else None
        if summary is None:
            missing.append(ticker)
            continue
        tickers[ticker] = {"universe": universe, **summary}
    return {
        "generated_at": today.isoformat(timespec="seconds"),
        "ref_date": ref.strftime("%Y-%m-%d") if ref else None,
        "source": "Yahoo Finance (yfinance), swiece dzienne",
        "n_candidates": len(winners),
        "missing": missing,
        "tickers": tickers,
    }


def main(argv=None, download_fn=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--docs-dir", default="docs")
    args = parser.parse_args(argv)
    docs_data_dir = os.path.join(args.docs_dir, "data")

    winners = weekly_winners(docs_data_dir)
    print(f"🏆 Tygodniowi zwyciezcy: {len(winners)} spolek.")
    if not winners:
        print("❌ Brak kandydatow — czy docs/data/*.json istnieja?")
        return 1

    # Wypelnia fetch_data.GPW_TICKERS, zeby tickery GPW dostaly sufiks .WA.
    fetch_data._load_json_constituents()
    now = datetime.datetime.now(datetime.timezone.utc)
    start = (pd.Timestamp(now.date()) - pd.Timedelta(days=run_query.DAILY_SQUEEZE_LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    end = (pd.Timestamp(now.date()) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    download = download_fn or fetch_data._download_price_rows
    rows, _fetched, failed = download([t for t, _ in winners], start, end, include_ohlc=True)
    if failed:
        print(f"⚠️  Bez danych z Yahoo: {failed}")

    payload = build_payload(winners, rows, now)
    out_path = os.path.join(docs_data_dir, OUTPUT_FILE)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"💾 Zapisano {out_path}: {len(payload['tickers'])} spolek, ostatnia sesja {payload['ref_date']}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
