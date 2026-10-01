"""Codzienna lista obserwowana: Finviz (lista spółek + fundamenty) -> yfinance (ceny) -> docs/data/watchlist.json.

Przepływ (odpalany codziennie rano, po sesji USA z poprzedniego dnia — patrz
.github/workflows/daily_watchlist.yml; ręcznie: `python watchlist.py` albo "Run workflow" na GitHubie):
  1. finviz.py: spółki nad SMA50 i SMA200 z dodatnim, stabilnym wzrostem EPS i prognozami EPS
     + sektor/branża/kapitalizacja/wzrost EPS/data wyników (wszystko, co da się wziąć z Finviz).
  2. yfinance: dzienne ceny tych spółek (~15 mies.), z których liczymy:
       - RS Rating w stylu IBD (rs_score = 0,4·R3M + 0,2·R6M + 0,2·R9M + 0,2·R12M, potem percentyl 1-99
         względem listy),
       - dane do filtra w stylu Qullamaggie (ADR %, średni obrót dzienny, wzrost od minimum z 1/3/6 mies.),
       - trend EMA34 (EMA34 dzienna rośnie: teraz > 5 > 10 > 15 > 20 sesji temu).
  3. Zapis docs/data/watchlist.json (czytane przez docs/index.html).
Wszystko to informacja do przeglądania, nie rekomendacja inwestycyjna.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

import finviz

ROOT = Path(__file__).resolve().parent
OUTPUT_PATH = ROOT / "docs" / "data" / "watchlist.json"

HISTORY_PERIOD = "15mo"      # 12M do RS Rating + zapas na rozgrzanie EMA/SMA200
BATCH_SIZE = 50
MIN_COVERAGE = 0.7           # minimalny odsetek spółek z Finviz, dla których dostaliśmy ceny
AVG_SESSIONS = 20            # okno ADR% i średniego obrotu (~miesiąc sesji)
MIN_BARS_RS = 252            # tyle sesji potrzeba na 12M (IBD) — młodsze spółki bez RS Rating
EMA_SPAN = 34
EMA_LAG_STEP = 5             # EMA34 porównujemy co 5 sesji ...
EMA_LAG_COUNT = 4            # ... 4 razy wstecz (5, 10, 15, 20 sesji temu)
SPARK_WEEKS = 26
FINVIZ_KEYS = ("company", "sector", "industry", "country", "market_cap", "pe", "forward_pe", "peg",
               "eps_this_y", "eps_next_y", "eps_past_5y", "eps_next_5y", "sales_past_5y",
               "roe", "oper_margin", "profit_margin", "earnings")


# ============================================================================
# POBIERANIE CEN
# ============================================================================
def _extract_frames(data, tickers):
    """yf.download(group_by="ticker") -> {ticker: DataFrame[Open,High,Low,Close,Volume]}."""
    frames = {}
    if data is None or data.empty:
        return frames
    for t in tickers:
        try:
            df = data[t] if isinstance(data.columns, pd.MultiIndex) else data
            df = df[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"])
        except KeyError:
            continue
        if len(df):
            frames[t] = df
    return frames


def download_prices(tickers, period=HISTORY_PERIOD, batch_size=BATCH_SIZE):
    import yfinance as yf
    frames = {}
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i + batch_size]
        print(f"  Ceny — paczka {i // batch_size + 1}/{-(-len(tickers) // batch_size)} ({len(batch)} spółek)...")
        try:
            data = yf.download(batch, period=period, interval="1d", auto_adjust=True, group_by="ticker",
                               threads=True, progress=False)
        except Exception as e:
            print(f"⚠️  Paczka nieudana ({e}).")
            continue
        frames.update(_extract_frames(data, batch))
    return frames


def drop_incomplete_bar(df, now_utc=None):
    """Usuwa dzisiejszą (jeszcze trwającą) sesję USA — ręczne odpalenie w trakcie sesji nie może wciągnąć
    niepełnej świecy jako 'dzisiejszego zamknięcia'."""
    if df.empty:
        return df
    now = pd.Timestamp(now_utc if now_utc is not None else datetime.now(timezone.utc))
    now_et = now.tz_convert("America/New_York") if now.tzinfo else now.tz_localize("UTC").tz_convert("America/New_York")
    last = pd.Timestamp(df.index[-1]).tz_localize(None).normalize()
    session_open = now_et.hour * 60 + now_et.minute < 16 * 60 + 30
    if last == pd.Timestamp(now_et.date()) and session_open:
        return df.iloc[:-1]
    return df


# ============================================================================
# WSKAŹNIKI
# ============================================================================
def _num(v, digits=2):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, digits) if np.isfinite(f) else None


def _price_at_or_before(close, ts):
    s = close[close.index <= ts]
    return float(s.iloc[-1]) if len(s) else None


def ema34_trend(close):
    """-> (rośnie?, nachylenie 20 sesji w %, aktualna EMA34). Rośnie = ema[-1] > ema[-6] > ema[-11] > ema[-16] > ema[-21]
    (EMA34 dzienna sprawdzana co 5 sesji, 20 sesji wstecz); None, gdy za mało danych na rozgrzanie EMA."""
    need = EMA_LAG_STEP * EMA_LAG_COUNT + 1
    if len(close) < EMA_SPAN * 2 or len(close) < need:
        return None, None, None
    ema = close.ewm(span=EMA_SPAN, adjust=False).mean()
    points = [float(ema.iloc[-1 - EMA_LAG_STEP * k]) for k in range(EMA_LAG_COUNT + 1)]  # teraz, -5, -10, -15, -20
    rising = all(points[k] > points[k + 1] for k in range(EMA_LAG_COUNT))
    return rising, (points[0] / points[-1] - 1) * 100, points[0]


def compute_metrics(df):
    """Wskaźniki z dziennych świec jednej spółki (kolumny Open/High/Low/Close/Volume, rosnący indeks dat)."""
    df = df.copy()
    df.index = pd.DatetimeIndex(df.index).tz_localize(None)
    close = df["Close"].astype(float)
    if len(close) < 30:
        return None
    asof = close.index[-1]
    price = float(close.iloc[-1])

    def back(months):
        return _price_at_or_before(close, asof - pd.DateOffset(months=months))

    p3, p6, p9, p12 = back(3), back(6), back(9), back(12)
    have_12m = len(close) >= MIN_BARS_RS and all(p and p > 0 for p in (p3, p6, p9, p12))
    rets = {m: (price / p - 1) if p and p > 0 else None for m, p in ((3, p3), (6, p6), (9, p9), (12, p12))}
    rs_score = (0.4 * rets[3] + 0.2 * rets[6] + 0.2 * rets[9] + 0.2 * rets[12]) if have_12m else None

    tail = df.tail(AVG_SESSIONS)
    ratio = (tail["High"] / tail["Low"].replace(0, np.nan)).replace([np.inf, -np.inf], np.nan).dropna()
    adr = (ratio.mean() - 1) * 100 if len(ratio) else None
    dollar_volume = float((tail["Close"] * tail["Volume"]).mean()) if len(tail) else None

    gains = {}
    for months in (1, 3, 6):
        window = df[df.index > asof - pd.DateOffset(months=months)]["Low"]
        low = float(window.min()) if len(window) else None
        gains[months] = (price / low - 1) * 100 if low and low > 0 else None

    sma50 = float(close.tail(50).mean()) if len(close) >= 50 else None
    sma200 = float(close.tail(200).mean()) if len(close) >= 200 else None
    rising, slope, ema = ema34_trend(close)

    weekly = close.resample("W-FRI").last().dropna().tail(SPARK_WEEKS)
    spark = [round((v / weekly.iloc[0] - 1) * 100, 1) for v in weekly] if len(weekly) >= 5 else []

    return {
        "price": _num(price),
        "as_of": asof.strftime("%Y-%m-%d"),
        "ret_3m_pct": _num(rets[3] * 100, 1) if rets[3] is not None else None,
        "ret_6m_pct": _num(rets[6] * 100, 1) if rets[6] is not None else None,
        "ret_12m_pct": _num(rets[12] * 100, 1) if rets[12] is not None else None,
        "rs_score": _num(rs_score, 4),
        "adr_pct": _num(adr),
        "dollar_volume_avg": _num(dollar_volume, 0),
        "gain_from_low_1m_pct": _num(gains[1]),
        "gain_from_low_3m_pct": _num(gains[3]),
        "gain_from_low_6m_pct": _num(gains[6]),
        "pct_above_sma50": _num((price / sma50 - 1) * 100) if sma50 else None,
        "pct_above_sma200": _num((price / sma200 - 1) * 100) if sma200 else None,
        "ema34": _num(ema),
        "ema34_rising": rising,
        "ema34_slope_20d_pct": _num(slope),
        "price_vs_ema34_pct": _num((price / ema - 1) * 100) if ema else None,
        "spark": spark,
    }


def add_rs_rating(stocks):
    """RS Rating 1-99 = percentyl rs_score wśród spółek listy (remisy: średnia ranga). Spółki bez rs_score -> None."""
    scored = [s for s in stocks if s.get("rs_score") is not None]
    for s in stocks:
        s["rs_rating"] = None
    n = len(scored)
    if n == 0:
        return stocks
    if n == 1:
        scored[0]["rs_rating"] = 50
        return stocks
    ranks = pd.Series([s["rs_score"] for s in scored]).rank(method="average")
    for s, r in zip(scored, ranks):
        s["rs_rating"] = int(round(1 + 98 * (r - 1) / (n - 1)))
    return stocks


# ============================================================================
# SKŁADANIE I ZAPIS
# ============================================================================
def build_stocks(finviz_rows, frames, now_utc=None):
    stocks = []
    for row in finviz_rows:
        df = frames.get(row["ticker"])
        if df is None:
            continue
        metrics = compute_metrics(drop_incomplete_bar(df, now_utc))
        if metrics is None:
            continue
        stock = {"ticker": row["ticker"]}
        stock.update({k: row.get(k) for k in FINVIZ_KEYS})
        stock.update(metrics)
        stocks.append(stock)
    add_rs_rating(stocks)
    return stocks


def load_previous(path=OUTPUT_PATH):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return None
    return data if isinstance(data, dict) and data.get("stocks") else None


def run(output_path=OUTPUT_PATH, skip_finviz=False, max_tickers=None):
    cfg = finviz.load_config()
    max_tickers = max_tickers or cfg["max_tickers"]
    previous = load_previous(output_path)
    finviz_rows, finviz_total, finviz_stale = [], None, False

    if not skip_finviz:
        try:
            finviz_rows, finviz_total = finviz.fetch_watchlist(cfg["filters"], max_tickers)
        except Exception as e:
            print(f"⚠️  Finviz niedostępny ({e}).")
        if len(finviz_rows) < finviz.MIN_TICKERS:
            print(f"⚠️  Finviz zwrócił {len(finviz_rows)} spółek (<{finviz.MIN_TICKERS}) — wygląda na blokadę/zmianę strony.")
            finviz_rows = []
    if not finviz_rows:
        if previous is None:
            print("❌ Brak listy z Finviz i brak poprzedniego watchlist.json — nie ma co liczyć.")
            return 1
        print("ℹ️  Używam listy spółek (i danych Finviz) z poprzedniego watchlist.json.")
        finviz_rows = [{k: v for k, v in s.items() if k == "ticker" or k in FINVIZ_KEYS} for s in previous["stocks"]]
        finviz_total, finviz_stale = previous.get("finviz_total"), True
    else:
        print(f"✅ Finviz: {len(finviz_rows)} spółek (filtry: {cfg['filters']}).")

    tickers = [r["ticker"] for r in finviz_rows]
    frames = download_prices(tickers)
    coverage = len(frames) / len(tickers) if tickers else 0
    print(f"ℹ️  Ceny dla {len(frames)}/{len(tickers)} spółek ({coverage:.0%}).")
    if coverage < MIN_COVERAGE:
        print(f"❌ Pokrycie cen poniżej {MIN_COVERAGE:.0%} — przerywam bez zapisu (zostaje poprzedni plik).")
        return 1

    stocks = build_stocks(finviz_rows, frames)
    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_as_of": max((s["as_of"] for s in stocks), default=None),
        "finviz_filters": cfg["filters"] if not finviz_stale else (previous or {}).get("finviz_filters"),
        "finviz_total": finviz_total,
        "finviz_stale": finviz_stale,
        "n_stocks": len(stocks),
        "stocks": stocks,
    }
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    print(f"💾 Zapisano {out} ({len(stocks)} spółek, dane z sesji {payload['data_as_of']}).")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Odświeża listę obserwowaną (Finviz + yfinance) -> docs/data/watchlist.json")
    parser.add_argument("--skip-finviz", action="store_true",
                        help="Nie pytaj Finviz — użyj listy spółek z poprzedniego watchlist.json (tylko odśwież ceny).")
    parser.add_argument("--max-tickers", type=int, default=None, help="Limit liczby spółek (domyślnie z finviz_screen.json).")
    parser.add_argument("--output", type=str, default=str(OUTPUT_PATH))
    args = parser.parse_args(argv)
    return run(args.output, args.skip_finviz, args.max_tickers)


if __name__ == "__main__":
    sys.exit(main())
