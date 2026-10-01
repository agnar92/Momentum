"""Codzienna lista obserwowana: Finviz (lista spółek + fundamenty) -> yfinance (ceny) -> docs/data/watchlist.json.

Przepływ (odpalany codziennie rano, po sesji USA z poprzedniego dnia — patrz
.github/workflows/daily_watchlist.yml; ręcznie: `python watchlist.py` albo "Run workflow" na GitHubie):
  1. finviz.py: spółki nad SMA50 i SMA200 z dodatnim, stabilnym wzrostem EPS i prognozami EPS
     + sektor/branża/kapitalizacja/wzrost EPS/data wyników (wszystko, co da się wziąć z Finviz).
  2. yfinance: dzienne ceny tych spółek (~15 mies.), z których liczymy:
       - RS Rating w stylu IBD (rs_score = 0,4·R3M + 0,2·R6M + 0,2·R9M + 0,2·R12M, potem percentyl 1-99
         względem listy),
       - dane do filtra w stylu Qullamaggie (ADR %, średni obrót dzienny, relacja ceny do minimum z 1/3/6 mies.),
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
CHARTS_PATH = ROOT / "docs" / "data" / "charts.json"
EPS_CACHE_PATH = ROOT / "docs" / "data" / "eps_cache.json"

HISTORY_PERIOD = "3y"        # 12M do RS Rating + 104 tyg. wykresu + rozgrzanie SMA40 tygodniowej
BATCH_SIZE = 50
MIN_COVERAGE = 0.7           # minimalny odsetek spółek z Finviz, dla których dostaliśmy ceny
AVG_SESSIONS = 20            # okno ADR% i średniego obrotu (~miesiąc sesji)
MIN_BARS_RS = 252            # tyle sesji potrzeba na 12M (IBD) — młodsze spółki bez RS Rating
EMA_SPAN = 34
EMA_LAG_STEP = 5             # EMA34 porównujemy co 5 sesji ...
EMA_LAG_COUNT = 4            # ... 4 razy wstecz (5, 10, 15, 20 sesji temu)
SPARK_WEEKS = 26
CHART_DAYS = 150             # ile sesji pokazuje wykres dzienny (~7 miesięcy)
CHART_WEEKS = 104            # ile tygodni pokazuje wykres w stylu MarketSmith (~2 lata)
BENCHMARK = "^GSPC"          # benchmark na wykresie (S&P 500)
TL_TOLERANCE = 0.015         # tyle (1,5%) cena może "przekłuć" linię trendu, żeby nadal była to ta sama linia
TL_RECENT_BARS = 3           # ostatnie świece, które mogą już być wybiciem (nie psują linii)
TL_VOLUME_MULT = 1.5         # wybicie potwierdzone, gdy wolumen >= 1,5x średniej z poprzednich 50 świec
TL_VOLUME_AVG_BARS = 50
TL_NEAR_PCT = 3.0            # cena do 3% pod oporem = "przy oporze"
BASE_MIN_WEEKS = 5           # minimalna długość bazy/korekty (tygodnie od szczytu)
BASE_MIN_DEPTH_PCT = 6       # płytsze konsolidacje nie są raportowane
BASE_MAX_DEPTH_PCT = 50      # głębsze to już nie baza, tylko załamanie
BASE_FLAT_MAX_DEPTH_PCT = 15
BASE_CUP_MAX_DEPTH_PCT = 35
BASE_MAX_SHOWN = 4           # ile ostatnich baz trafia na wykres
ZIGZAG_PCT = 3.0             # minimalne odbicie, od którego liczymy kolejne "skurcze" (VCP)
EPS_CACHE_MAX_AGE_DAYS = 7   # EPS zmienia się raz na kwartał — nie pytamy Yahoo codziennie
EPS_TIME_BUDGET_S = 600
EPS_WORKERS = 4
FINVIZ_KEYS = ("company", "sector", "industry", "market_cap", "pe", "forward_pe",
               "eps_this_y", "eps_next_y", "eps_past_5y", "eps_next_5y", "roe", "earnings")


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

    # Relacja ceny do najniższego Low z okna (bez odejmowania 1 — to i tak tylko ranking, wystarczy sortować malejąco).
    low_ratio = {}
    for months in (1, 3, 6):
        window = df[df.index > asof - pd.DateOffset(months=months)]["Low"]
        low = float(window.min()) if len(window) else None
        low_ratio[months] = price / low if low and low > 0 else None

    sma50 = float(close.tail(50).mean()) if len(close) >= 50 else None
    sma200 = float(close.tail(200).mean()) if len(close) >= 200 else None
    rising, slope, ema = ema34_trend(close)

    high_52w = float(df["High"].tail(252).max())
    open_base = next((b for b in reversed(detect_bases(weekly_ohlcv(df, asof))) if b["open"]), None)

    tl = detect_trendlines(df, k=3, lookback=70, min_span=8) or {}

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
        "low_ratio_1m": _num(low_ratio[1], 3),
        "low_ratio_3m": _num(low_ratio[3], 3),
        "low_ratio_6m": _num(low_ratio[6], 3),
        "pct_above_sma50": _num((price / sma50 - 1) * 100) if sma50 else None,
        "pct_above_sma200": _num((price / sma200 - 1) * 100) if sma200 else None,
        "ema34": _num(ema),
        "ema34_rising": rising,
        "ema34_slope_20d_pct": _num(slope),
        "price_vs_ema34_pct": _num((price / ema - 1) * 100) if ema else None,
        "pct_from_high_52w": _num((price / high_52w - 1) * 100, 1) if high_52w > 0 else None,
        "base_type": open_base["type"] if open_base else None,
        "base_depth_pct": open_base["depth_pct"] if open_base else None,
        "base_weeks": open_base["weeks"] if open_base else None,
        "pivot": open_base["pivot"] if open_base else None,
        "pct_to_pivot": _num((open_base["pivot"] / price - 1) * 100, 1) if open_base else None,
        "vcp": open_base["vcp"] if open_base else None,
        "tl_state": tl.get("state"),
        "tl_pattern": tl.get("pattern"),
        "tl_vol_ratio": (tl.get("breakout") or {}).get("vol_ratio"),
        "tl_vol_ok": (tl.get("breakout") or {}).get("confirmed"),
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
# BAZY / KOREKTY (głębokość od szczytu, pivot, skurcze VCP) — heurystyka na świecach tygodniowych.
# NIE jest to rozpoznawanie formacji jak w MarketSmith (cup with handle, flagi...) — mierzy po prostu głębokość
# i długość każdej korekty od lokalnego szczytu do ponownego wybicia ponad ten szczyt; typ ("flat"/"cup"/"deep")
# to prosta klasyfikacja po głębokości i odbiciu, orientacyjna.
# ============================================================================
def zigzag_contractions(closes, pct=ZIGZAG_PCT):
    """Kolejne spadki (w %) od lokalnego szczytu do następnego dołka, liczone na zamknięciach; zmiana kierunku
    dopiero po ruchu o >= pct % (drobny szum jest ignorowany)."""
    pivots, direction = [], 0     # direction: +1 w górę (szukamy szczytu), -1 w dół (szukamy dołka)
    hi = lo = (0, closes[0]) if len(closes) else None
    for i, c in enumerate(closes[1:], 1):
        if hi is None:
            break
        if c > hi[1]:
            hi = (i, c)
        if c < lo[1]:
            lo = (i, c)
        if direction >= 0 and hi[1] > 0 and (hi[1] - c) / hi[1] * 100 >= pct:      # zakończony szczyt -> zaczyna się spadek
            pivots.append(("H", hi[1]))
            direction, lo = -1, (i, c)
        elif direction == -1 and lo[1] > 0 and (c - lo[1]) / lo[1] * 100 >= pct:   # zakończony dołek -> zaczyna się wzrost
            pivots.append(("L", lo[1]))
            direction, hi = 1, (i, c)
    if pivots and pivots[-1][0] == "H" and direction == -1:
        pivots.append(("L", lo[1]))   # trwający, jeszcze niepotwierdzony spadek też jest skurczem (aktualny stan bazy)
    drops = []
    for k in range(len(pivots) - 1):
        if pivots[k][0] == "H" and pivots[k + 1][0] == "L":
            drops.append(round(float((pivots[k][1] - pivots[k + 1][1]) / pivots[k][1] * 100), 1))
    return drops


def detect_bases(weekly):
    """Korekty od lokalnego szczytu (High) do ponownego wybicia ponad ten szczyt (lub do dziś — wtedy open=True).
    Zwraca listę {start, end, peak, low, depth_pct, weeks, type, open, pivot, contractions, vcp} (rosnąco po czasie).
    pivot = szczyt bazy (punkt zakupu w terminologii MarketSmith); vcp = co najmniej 2 kolejne, coraz płytsze skurcze,
    ostatni <= 10 %."""
    hi = weekly["High"].astype(float).values
    lo = weekly["Low"].astype(float).values
    cl = weekly["Close"].astype(float).values
    dates = list(weekly.index)
    n = len(hi)
    bases = []

    def record(peak, end, is_open):
        if end <= peak:
            return
        weeks = end - peak + 1
        low_i = peak + 1 + int(np.argmin(lo[peak + 1:end + 1]))
        low = float(lo[low_i])
        depth = (hi[peak] - low) / hi[peak] * 100
        if weeks < BASE_MIN_WEEKS or not (BASE_MIN_DEPTH_PCT <= depth <= BASE_MAX_DEPTH_PCT):
            return
        if depth <= BASE_FLAT_MAX_DEPTH_PCT:
            kind = "flat"
        elif depth <= BASE_CUP_MAX_DEPTH_PCT:
            recovered = (cl[end] - low) / (hi[peak] - low) if hi[peak] > low else 0
            kind = "cup" if recovered >= 0.5 else "correction"
        else:
            kind = "deep"
        drops = zigzag_contractions(list(cl[peak:end + 1]))
        vcp = len(drops) >= 2 and all(drops[k + 1] < drops[k] for k in range(len(drops) - 1)) and drops[-1] <= 10
        bases.append({
            "start": dates[peak].strftime("%Y-%m-%d"), "end": dates[end].strftime("%Y-%m-%d"),
            "peak": _num(hi[peak]), "low": _num(low), "depth_pct": _num(depth, 1), "weeks": weeks, "type": kind,
            "low_date": dates[low_i].strftime("%Y-%m-%d"), "end_close": _num(cl[end]),
            "open": is_open, "pivot": _num(hi[peak]), "contractions": drops, "vcp": bool(vcp),
        })

    peak = 0
    for j in range(1, n):
        if hi[j] > hi[peak]:          # nowy szczyt: poprzednia korekta (jeśli była) właśnie się zakończyła
            record(peak, j - 1, False)
            peak = j
    record(peak, n - 1, True)
    return bases


# ============================================================================
# WYKRES W STYLU MARKETSMITH (docs/data/charts.json): słupki tygodniowe OHLC + wolumen,
# SMA10/SMA40 tygodniowe, linia benchmarku (S&P 500) i linia EPS kwartalnego.
# ============================================================================
def _pivot_indices(values, k, highs):
    """Indeksy lokalnych ekstremów: wartość jest największa (highs) / najmniejsza w oknie ±k świec."""
    out = []
    for i in range(k, len(values) - k):
        window = values[i - k:i + k + 1]
        if (highs and values[i] == window.max()) or (not highs and values[i] == window.min()):
            out.append(i)
    return out


def _best_line(values, pivots, n, highs, min_span, tol=TL_TOLERANCE):
    """Najdłuższa prosta przez dwa pivoty, której żadna świeca (poza ostatnimi TL_RECENT_BARS) nie przebija o więcej
    niż tol. Zwraca (i0, y0, i1, y1, touches) z końcem przedłużonym do ostatniej świecy albo None."""
    last = n - 1
    check_to = last - TL_RECENT_BARS
    best = None
    for ai, a in enumerate(pivots):
        for b in pivots[ai + 1:]:
            if b - a < min_span or values[a] <= 0:
                continue
            slope = (values[b] - values[a]) / (b - a)
            idx = np.arange(a, check_to + 1)
            line = values[a] + slope * (idx - a)
            seg = values[a:check_to + 1]
            bad = (seg > line * (1 + tol)) if highs else (seg < line * (1 - tol))
            if bad.any() or line.min() <= 0:
                continue
            touches = sum(1 for q in pivots if a <= q <= check_to and abs(values[q] - (values[a] + slope * (q - a))) <= tol * values[q])
            cand = (a, float(values[a]), last, float(values[a] + slope * (last - a)), touches)
            if best is None or (touches, last - a) > (best[4], last - best[0]):
                best = cand
        if best is not None and best[0] == a:
            break   # najwcześniejszy punkt startowy, który coś daje — dłuższych linii już nie będzie
    return best


def detect_trendlines(ohlc, k, lookback, min_span):
    """Linie trendu na świecach (daily/weekly): opór przez szczyty, wsparcie przez dołki z ostatnich `lookback` świec.
    Zwraca {lines, pattern, state, breakout} albo None; breakout = {date, vol_ratio, confirmed} (wolumen świecy wybicia / średnia z 50 poprzednich). state: 'wybicie' (cena nad oporem w ostatnich świecach), 'przy oporze'
    (<= TL_NEAR_PCT% pod nim) lub None. pattern: opis kształtu (flaga/handle, kanał, trójkąt...) gdy są obie linie."""
    if len(ohlc) < lookback // 2:
        return None
    df = ohlc.tail(lookback)
    dates = [d.strftime("%Y-%m-%d") for d in pd.DatetimeIndex(df.index)]
    hi, lo, cl = (df[c].astype(float).values for c in ("High", "Low", "Close"))
    n = len(df)
    res = _best_line(hi, _pivot_indices(hi, k, True), n, True, min_span)
    sup = _best_line(lo, _pivot_indices(lo, k, False), n, False, min_span)
    lines = []
    for kind, ln in (("res", res), ("sup", sup)):
        if ln:
            lines.append({"kind": kind, "x0": dates[ln[0]], "y0": _num(ln[1]), "x1": dates[ln[2]], "y1": _num(ln[3]), "touches": ln[4]})
    if not lines:
        return None

    def slope_pct(ln):  # % na świecę względem poziomu ceny
        return (ln[3] - ln[1]) / ln[1] / max(1, ln[2] - ln[0]) * 100

    state, pattern, breakout = None, None, None
    if res:
        res_now = res[3]
        recent = range(n - TL_RECENT_BARS, n)
        broke = any(cl[i] > res[1] + (res[3] - res[1]) * (i - res[0]) / (res[2] - res[0]) for i in recent)
        if broke:
            state = "wybicie"
            first = next(i for i in recent if cl[i] > res[1] + (res[3] - res[1]) * (i - res[0]) / (res[2] - res[0]))
            full = ohlc["Volume"].astype(float).values
            pos = len(full) - n + first                      # indeks tej świecy w pełnej serii
            prev = full[max(0, pos - TL_VOLUME_AVG_BARS):pos]
            if len(prev) >= 10 and prev.mean() > 0:
                breakout = {"date": dates[first], "vol_ratio": _num(full[pos] / prev.mean(), 1)}
                breakout["confirmed"] = bool(breakout["vol_ratio"] >= TL_VOLUME_MULT)
        elif cl[-1] < res_now and (res_now / cl[-1] - 1) * 100 <= TL_NEAR_PCT:
            state = "przy oporze"
    if res and sup:
        sr, ss = slope_pct(res), slope_pct(sup)
        flat = 0.05
        if sr < -flat and ss < -flat and abs(sr - ss) <= abs(sr) * 0.6:
            pattern = "flaga / handle"
        elif abs(sr) <= flat and abs(ss) <= flat:
            pattern = "korytarz poziomy"
        elif sr > flat and ss > flat and abs(sr - ss) <= abs(sr) * 0.6:
            pattern = "kanał wzrostowy"
        elif sr < ss - 0.02:
            pattern = "trójkąt (zbieżne linie)"
    elif res and slope_pct(res) < -0.05:
        pattern = "opadający opór"
    return {"lines": lines, "pattern": pattern, "state": state, "breakout": breakout}


def weekly_ohlcv(df, last_date=None):
    """Dzienne świece -> tygodniowe (piątek). Ostatni, niepełny tydzień dostaje datę ostatniej sesji."""
    df = df.copy()
    df.index = pd.DatetimeIndex(df.index).tz_localize(None).normalize()
    week = df.resample("W-FRI").agg({"Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum"})
    week = week.dropna(subset=["Close"])
    last = pd.Timestamp(last_date) if last_date is not None else df.index[-1]
    week.index = pd.DatetimeIndex([min(d, last) for d in week.index])
    return week[~week.index.duplicated(keep="last")]


def _series(values, digits=2):
    return [_num(v, digits) for v in values]


def build_chart(weekly, weeks):
    """Tablice (wyrównane do wspólnej listy `weeks`, null dla brakujących tygodni) dla jednej spółki."""
    w = weekly.reindex(pd.DatetimeIndex(weeks))
    close_all = weekly["Close"]
    sma10 = close_all.rolling(10).mean().reindex(w.index)
    sma40 = close_all.rolling(40).mean().reindex(w.index)
    return {
        "o": _series(w["Open"]), "h": _series(w["High"]), "l": _series(w["Low"]), "c": _series(w["Close"]),
        "v": [None if pd.isna(x) else int(round(x / 1000)) for x in w["Volume"]],  # wolumen w tysiącach
        "sma10": _series(sma10), "sma40": _series(sma40),
    }


def _daily_ohlc(df):
    df = df.copy()
    df.index = pd.DatetimeIndex(df.index).tz_localize(None).normalize()
    return df[~df.index.duplicated(keep="last")]


def build_daily(df, days):
    """Dzienne świece (ostatnie `days` sesji) + SMA50/SMA200 liczone na pełnej historii, null dla braków."""
    df = df.copy()
    df.index = pd.DatetimeIndex(df.index).tz_localize(None).normalize()
    df = df[~df.index.duplicated(keep="last")]
    idx = pd.DatetimeIndex(days)
    w = df.reindex(idx)
    close = df["Close"].astype(float)
    return {
        "o": _series(w["Open"]), "h": _series(w["High"]), "l": _series(w["Low"]), "c": _series(w["Close"]),
        "v": [None if pd.isna(x) else int(round(x / 1000)) for x in w["Volume"]],
        "sma10": _series(close.rolling(10).mean().reindex(idx)),
        "sma20": _series(close.rolling(20).mean().reindex(idx)),
    }


def eps_quarters(rows):
    """rows: [{'date','eps','est'}...] z Yahoo (eps=None dla przyszłych). -> (zrealizowane kwartały z YoY %, następna prognoza).
    YoY = (EPS − EPS rok wcześniej) / |EPS rok wcześniej| · 100; None, gdy brak/zero poprzedniego."""
    reported = sorted((r for r in rows if r.get("eps") is not None), key=lambda r: r["date"])
    out = []
    for r in reported:
        d = pd.Timestamp(r["date"])
        prev = next((p for p in reported if 330 <= (d - pd.Timestamp(p["date"])).days <= 400), None)
        yoy = None
        if prev and prev["eps"]:
            yoy = _num((r["eps"] - prev["eps"]) / abs(prev["eps"]) * 100, 0)
        out.append({"d": r["date"], "e": _num(r["eps"]), "g": yoy})
    upcoming = sorted((r for r in rows if r.get("eps") is None and r.get("est") is not None), key=lambda r: r["date"])
    nxt = {"d": upcoming[0]["date"], "e": _num(upcoming[0]["est"])} if upcoming else None
    return out, nxt


def fetch_eps_one(ticker):
    import yfinance as yf
    ed = yf.Ticker(ticker).get_earnings_dates(limit=20)
    if ed is None or ed.empty:
        return []
    rows = []
    for ts, r in ed.iterrows():
        rep, est = r.get("Reported EPS"), r.get("EPS Estimate")
        rows.append({"date": pd.Timestamp(ts).strftime("%Y-%m-%d"),
                     "eps": None if pd.isna(rep) else float(rep), "est": None if pd.isna(est) else float(est)})
    return rows


def update_eps_cache(tickers, cache_path=EPS_CACHE_PATH, now=None, fetch=fetch_eps_one,
                     max_age_days=EPS_CACHE_MAX_AGE_DAYS, time_budget_s=EPS_TIME_BUDGET_S):
    """Cache {ticker: {fetched, rows}} w JSON (docs/data/eps_cache.json) — odświeża tylko wpisy starsze niż max_age_days.
    Błąd pojedynczego tickera albo limit czasu nigdy nie przerywa pipeline'u (brak EPS = wykres bez dolnego panelu)."""
    from concurrent.futures import ThreadPoolExecutor
    import time
    now = pd.Timestamp(now if now is not None else datetime.now(timezone.utc)).tz_localize(None)
    try:
        cache = json.loads(Path(cache_path).read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        cache = {}
    stale = [t for t in tickers
             if t not in cache or (now - pd.Timestamp(cache[t].get("fetched", "1970-01-01"))).days >= max_age_days]
    if stale:
        print(f"⏳ EPS: pobieram historię dla {len(stale)} spółek (limit {time_budget_s}s)...")
        started = time.time()

        def work(t):
            if time.time() - started > time_budget_s:
                return t, None
            try:
                return t, fetch(t)
            except Exception:
                return t, None
        with ThreadPoolExecutor(EPS_WORKERS) as pool:
            for t, rows in pool.map(work, stale):
                if rows is not None:
                    cache[t] = {"fetched": now.strftime("%Y-%m-%d"), "rows": rows}
    cache = {t: v for t, v in cache.items() if t in set(tickers)}
    out = Path(cache_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return cache


def build_charts(tickers, frames, benchmark_df, eps_cache, now_utc=None, n_weeks=CHART_WEEKS):
    """Struktura docs/data/charts.json: wspólna lista tygodni + S&P 500 + wykres każdej spółki."""
    bench = drop_incomplete_bar(benchmark_df, now_utc) if benchmark_df is not None and len(benchmark_df) else None
    last_date = None
    cleaned = {}
    for t in tickers:
        if t in frames:
            cleaned[t] = drop_incomplete_bar(frames[t], now_utc)
    if bench is not None:
        last_date = pd.DatetimeIndex(bench.index).tz_localize(None).normalize()[-1]
    elif cleaned:
        last_date = max(pd.DatetimeIndex(df.index).tz_localize(None).normalize()[-1] for df in cleaned.values())
    if last_date is None:
        return None
    ref = weekly_ohlcv(bench, last_date) if bench is not None else weekly_ohlcv(next(iter(cleaned.values())), last_date)
    weeks = list(ref.index[-n_weeks:])
    payload = {
        "benchmark": BENCHMARK if bench is not None else None,
        "weeks": [d.strftime("%Y-%m-%d") for d in weeks],
        "spx": _series(ref["Close"].reindex(pd.DatetimeIndex(weeks))) if bench is not None else None,
        "stocks": {},
    }
    day_ref = bench if bench is not None else next(iter(cleaned.values()))
    day_index = pd.DatetimeIndex(day_ref.index).tz_localize(None).normalize()
    day_index = day_index[~day_index.duplicated(keep="last")][-CHART_DAYS:]
    payload["days"] = [d.strftime("%Y-%m-%d") for d in day_index]
    payload["spx_d"] = (_series(bench["Close"].astype(float).set_axis(
        pd.DatetimeIndex(bench.index).tz_localize(None).normalize()).groupby(level=0).last().reindex(day_index))
        if bench is not None else None)
    for t, df in cleaned.items():
        chart = build_chart(weekly_ohlcv(df, last_date), weeks)
        quarters, nxt = eps_quarters((eps_cache.get(t) or {}).get("rows", []))
        first = payload["weeks"][0]
        wk = weekly_ohlcv(df, last_date)
        chart["bases"] = [b for b in detect_bases(wk) if b["end"] >= first][-BASE_MAX_SHOWN:]
        chart["eps"] = [q for q in quarters if q["d"] >= first]
        chart["eps_next"] = nxt
        chart["day"] = build_daily(df, day_index)
        chart["tl"] = detect_trendlines(wk, k=2, lookback=40, min_span=4)
        chart["day"]["tl"] = detect_trendlines(_daily_ohlc(df), k=3, lookback=70, min_span=8)
        payload["stocks"][t] = chart
    return payload


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


def run(output_path=OUTPUT_PATH, skip_finviz=False, max_tickers=None, charts_path=None, eps_cache_path=None):
    cfg = finviz.load_config()
    max_tickers = max_tickers or cfg["max_tickers"]
    eps_cache_path = eps_cache_path or Path(output_path).parent / "eps_cache.json"
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
    try:
        bench_frames = download_prices([BENCHMARK])
        benchmark_df = bench_frames.get(BENCHMARK)
    except Exception as e:
        print(f"⚠️  Benchmark {BENCHMARK} niedostępny ({e}) — wykresy bez linii S&P 500.")
        benchmark_df = None
    try:
        eps_cache = update_eps_cache([s["ticker"] for s in stocks], eps_cache_path)
    except Exception as e:
        print(f"⚠️  Krok EPS pominięty ({e}).")
        eps_cache = {}
    charts = build_charts([s["ticker"] for s in stocks], frames, benchmark_df, eps_cache)
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
    charts_path = charts_path or out.parent / "charts.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    print(f"💾 Zapisano {out} ({len(stocks)} spółek, dane z sesji {payload['data_as_of']}).")
    if charts is not None:
        charts_out = Path(charts_path)
        charts_out.write_text(json.dumps(charts, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")
        print(f"💾 Zapisano {charts_out} (wykresy tygodniowe {len(charts['stocks'])} spółek, {len(charts['weeks'])} tygodni).")
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
