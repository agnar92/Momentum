"""Codzienna lista obserwowana: Finviz (lista spółek + fundamenty) -> yfinance (ceny) -> docs/data/watchlist.json.

Przepływ (odpalany codziennie rano, po sesji USA z poprzedniego dnia — patrz
.github/workflows/daily_watchlist.yml; ręcznie: `python watchlist.py` albo "Run workflow" na GitHubie):
  1. finviz.py: spółki nad SMA50 i SMA200 z dodatnim, stabilnym wzrostem EPS i prognozami EPS
     + sektor/branża/kapitalizacja/wzrost EPS/data wyników (wszystko, co da się wziąć z Finviz).
  2. yfinance: dzienne ceny tych spółek (~15 mies.), z których liczymy:
       - RS Rating w stylu IBD (rs_score = 0,4·R3M + 0,2·R6M + 0,2·R9M + 0,2·R12M, potem percentyl 1-99
         względem listy),
       - dane do filtra w stylu Qullamaggie (ADR %, średni obrót dzienny, relacja ceny do minimum z 1/3/6 mies.),
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
ESTIMATES_PATH = ROOT / "docs" / "data" / "estimates.json"

HISTORY_PERIOD = "3y"        # 12M do RS Rating + 104 tyg. wykresu + rozgrzanie SMA40 tygodniowej
BATCH_SIZE = 50
MIN_COVERAGE = 0.7           # minimalny odsetek spółek z Finviz, dla których dostaliśmy ceny
AVG_SESSIONS = 20            # okno ADR% i średniego obrotu (~miesiąc sesji)
MIN_BARS_RS = 252            # tyle sesji potrzeba na 12M (IBD) — młodsze spółki bez RS Rating
SPARK_WEEKS = 26
EPS_WEIGHTS = {"q0": 0.35, "q1": 0.25, "y0": 0.15, "y5": 0.25}   # najnowszy kwartał r/r, poprzedni kwartał r/r, EPS bieżącego roku, EPS 5 lat
EPS_STABILITY_WEIGHT = 0.2   # EPS Rating = 80 % percentyl wzrostu + 20 % percentyl stabilności
EPS_STABILITY_QUARTERS = 8   # stabilność: odsetek ostatnich 8 kwartałów (r/r) z dodatnim wzrostem EPS
EPS_STABILITY_MIN = 4        # min. tyle porównań r/r, żeby liczyć stabilność
COMPOSITE_RS_WEIGHT = 0.5    # Composite = 50 % RS Rating + 50 % EPS Rating
CHART_DAYS = 252             # ile sesji ma wykres dzienny (~rok; domyślne okno suwaka to 1 miesiąc)
CHART_WEEKS = 104            # ile tygodni pokazuje wykres w stylu MarketSmith (~2 lata)
BENCHMARK = "^GSPC"          # benchmark na wykresie (S&P 500)
TL_TOLERANCE = 0.015         # tyle (1,5%) cena może "przekłuć" linię trendu, żeby nadal była to ta sama linia
RS_HIGH_SESSIONS = 252         # "nowe maksimum RS/ceny" = wyższe niż w poprzednich ~52 tygodniach (jak niebieska kropka w MarketSmith)
RS_RECENT_BARS = 5           # sygnał z ostatnich 5 sesji
TL_VOLUME_MULT = 1.5         # wybicie potwierdzone, gdy wolumen >= 1,5x średniej z poprzednich 50 świec
TL_VOLUME_AVG_BARS = 50
TL_NEAR_PCT = 3.0            # cena do 3% pod oporem = "przy oporze"
BASE_MIN_WEEKS = 5           # minimalna długość bazy/korekty (tygodnie od szczytu)
BASE_MIN_DEPTH_PCT = 6       # płytsze konsolidacje nie są raportowane
BASE_MAX_DEPTH_PCT = 50      # głębsze to już nie baza, tylko załamanie
BASE_FLAT_MAX_DEPTH_PCT = 15
BASE_CUP_MAX_DEPTH_PCT = 35
BASE_MAX_SHOWN = 4           # ile ostatnich baz trafia na wykres
# Cup (z rączką) wg kryteriów O'Neila — baza jest "cup" tylko, gdy spełnia je wszystkie (inaczej "korekta"):
CUP_MIN_DEPTH_PCT = 12       # głębokość od lewego szczytu do dołka (płytsze to raczej flat)
CUP_MAX_DEPTH_PCT = 33       # normalnie do ~33 %
CUP_MAX_DEPTH_BEAR_PCT = 50  # w silnej korekcie rynku (S&P >= CUP_BEAR_MKT_DD) dozwolone głębsze miseczki
CUP_BEAR_MKT_DD = 15.0
CUP_MIN_WEEKS = 10           # od lewego szczytu do prawego brzegu (O'Neil: min. 7, tu ostrzej — krótsze to zwykła konsolidacja)
CUP_MAX_WEEKS = 45
CUP_MAX_RETRACE = 0.40       # w trakcie spadku/odbicia żaden ruch „pod prąd” nie może odrobić > 40 % głębokości (to W / zygzak)
CUP_MIN_FIT = 0.60           # dopasowanie paraboli do zamknięć (R²) — miseczka ma być gładką „U”
CUP_PRIOR_GAIN_PCT = 30      # wcześniejszy trend wzrostowy: szczyt >= 30 % ponad dołkiem z poprzednich 52 tyg.
CUP_PRIOR_LOOKBACK = 52
CUP_RIM_RECOVERY = 0.80      # prawy brzeg musi odrobić >= 80 % głębokości miseczki ...
CUP_RIM_MAX_GAP_PCT = 10.0   # ... i być nie dalej niż 10 % pod lewym szczytem
CUP_BOTTOM_WEEKS = 3         # tyle tygodni (zamknięć) w dolnej 1/3 głębokości — to ma być "U", nie "V"
CUP_BOTTOM_FRAC = 0.38       # ... i co najmniej taka część długości miseczki (parabola ~58 %, ostre „V” ~33 %)
CUP_LOW_POS = (0.2, 0.8)     # dołek nie może leżeć tuż przy lewej ani prawej krawędzi
CUP_HANDLE_MAX_WEEKS = 10
CUP_HANDLE_MAX_DEPTH_PCT = 15.0
CUP_MKT_CONTEXT_DD = 7.0     # S&P spadł >= 7 % w trakcie tworzenia miseczki = „pod presją rynku”
ZIGZAG_PCT = 3.0             # minimalne odbicie, od którego liczymy kolejne "skurcze" (VCP)
EPS_CACHE_MAX_AGE_DAYS = 7   # EPS zmienia się raz na kwartał — nie pytamy Yahoo codziennie
EPS_TIME_BUDGET_S = 600
EPS_WORKERS = 4
EST_MAX_AGE_DAYS = 2         # estymaty analityków zmieniają się codziennie, ale pobranie to 4 zapytania na spółkę — co 2 dni wystarcza
EST_TIME_BUDGET_S = 700
EST_HISTORY_DAYS = 400       # ile dni historii konsensusu EPS trzymamy (dopisujemy przy każdym pobraniu)
EST_PERIODS = ("0y", "+1y")  # bieżący i następny rok obrachunkowy (Yahoo nie podaje dalszych)
EST_SEED_DAYS = {"90daysAgo": 90, "60daysAgo": 60, "30daysAgo": 30, "7daysAgo": 7}
FINVIZ_KEYS = ("company", "sector", "industry", "market_cap", "pe", "forward_pe",
               "eps_this_y", "eps_next_y", "eps_past_5y", "eps_next_5y", "roe", "earnings", "recom", "finviz_target")


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


def compute_metrics(df, bench_w=None):
    """Wskaźniki z dziennych świec jednej spółki (kolumny Open/High/Low/Close/Volume, rosnący indeks dat).
    bench_w = tygodniowe zamknięcia S&P 500 (kontekst rynku dla miseczek), opcjonalnie."""
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

    high_52w = float(df["High"].tail(252).max())
    open_base = next((b for b in reversed(detect_bases(weekly_ohlcv(df, asof), bench_w)) if b["open"]), None)

    tl = detect_consolidation(df, DAILY_FLAG) or {}

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
        "pct_from_high_52w": _num((price / high_52w - 1) * 100, 1) if high_52w > 0 else None,
        "base_type": open_base["type"] if open_base else None,
        "base_depth_pct": open_base["depth_pct"] if open_base else None,
        "base_weeks": open_base["weeks"] if open_base else None,
        "base_handle": bool(open_base["cup"]["handle"]) if open_base and open_base.get("cup") else None,
        "base_mkt_dd_pct": open_base["cup"]["mkt_dd_pct"] if open_base and open_base.get("cup") else None,
        "pivot": open_base["pivot"] if open_base else None,
        "pct_to_pivot": _num((open_base["pivot"] / price - 1) * 100, 1) if open_base else None,
        "vcp": open_base["vcp"] if open_base else None,
        "tl_state": tl.get("state"),
        "tl_pattern": tl.get("pattern"),
        "tl_vol_ratio": (tl.get("breakout") or {}).get("vol_ratio"),
        "tl_vol_ok": (tl.get("breakout") or {}).get("confirmed"),
        "spark": spark,
    }


def percentile_rating(stocks, score_key, rating_key):
    """Rating 1-99 = percentyl wyniku score_key wśród spółek listy (remisy: średnia ranga). Spółki bez wyniku -> None."""
    scored = [s for s in stocks if s.get(score_key) is not None]
    for s in stocks:
        s[rating_key] = None
    n = len(scored)
    if n == 0:
        return stocks
    if n == 1:
        scored[0][rating_key] = 50
        return stocks
    ranks = pd.Series([s[score_key] for s in scored]).rank(method="average")
    for s, r in zip(scored, ranks):
        s[rating_key] = int(round(1 + 98 * (r - 1) / (n - 1)))
    return stocks


def add_rs_rating(stocks):
    """RS Rating 1-99 = percentyl rs_score wśród spółek listy (remisy: średnia ranga). Spółki bez rs_score -> None."""
    return percentile_rating(stocks, "rs_score", "rs_rating")


def eps_score(q0, q1, eps_this_y, eps_past_5y):
    """Wynik EPS w stylu IBD (przybliżenie): wzrost EPS r/r z dwóch ostatnich kwartałów + roczny wzrost EPS (bieżący rok
    i średnia z 5 lat, dane Finviz). Surowe procenty, bez obcinania (tak jak zwroty w rs_score) — skrajne wartości
    łagodzi dopiero ranking percentylowy; brakujące składniki pomijamy (wagi się renormalizują), ale najnowszy kwartał jest wymagany
    i potrzebne są min. 2 składniki. -> float albo None."""
    if q0 is None:
        return None
    parts = [(EPS_WEIGHTS["q0"], q0), (EPS_WEIGHTS["q1"], q1), (EPS_WEIGHTS["y0"], eps_this_y), (EPS_WEIGHTS["y5"], eps_past_5y)]
    parts = [(w, v) for w, v in parts if v is not None]
    if len(parts) < 2:
        return None
    total = sum(w for w, _ in parts)
    return _num(sum(w * v for w, v in parts) / total)


def eps_stability(growths):
    """Stabilność wzrostu EPS (0-100 %) = odsetek ostatnich EPS_STABILITY_QUARTERS kwartałów, w których EPS r/r wzrósł (g > 0).
    Spółka z wyraźnym wzrostem co kwartał dostaje ~100, z zygzakiem (zysk, strata, zysk...) wyraźnie mniej. None przy < EPS_STABILITY_MIN
    porównaniach r/r."""
    g = [x for x in growths if x is not None][-EPS_STABILITY_QUARTERS:]
    if len(g) < EPS_STABILITY_MIN:
        return None
    return _num(100 * sum(1 for x in g if x > 0) / len(g), 0)


def add_eps_rating(stocks, eps_cache):
    """EPS Rating 1-99 = 80 % percentyl wzrostu (eps_score) + 20 % percentyl stabilności (eps_stability; bez stabilności — sam wzrost)
    + pola pomocnicze eps_q0_yoy / eps_q1_yoy (wzrost r/r dwóch ostatnich zrealizowanych kwartałów z cache Yahoo).
    Skumulowany Composite = średnia ważona RS Rating i EPS Rating (tylko gdy są oba)."""
    for s in stocks:
        rows = ((eps_cache or {}).get(s["ticker"]) or {}).get("rows") or []
        quarters = [q["g"] for q in eps_quarters(rows)[0]]
        q0 = quarters[-1] if quarters else None
        q1 = quarters[-2] if len(quarters) > 1 else None
        s["eps_q0_yoy"], s["eps_q1_yoy"] = q0, q1
        s["eps_score"] = eps_score(q0, q1, s.get("eps_this_y"), s.get("eps_past_5y"))
        s["eps_stability"] = eps_stability(quarters)
    percentile_rating(stocks, "eps_score", "eps_growth_rating")
    percentile_rating(stocks, "eps_stability", "eps_stability_rating")
    for s in stocks:
        g, st = s.get("eps_growth_rating"), s.get("eps_stability_rating")
        if g is None:
            s["eps_rating"] = None
        elif st is None:
            s["eps_rating"] = g
        else:
            s["eps_rating"] = int(round((1 - EPS_STABILITY_WEIGHT) * g + EPS_STABILITY_WEIGHT * st))
    for s in stocks:
        rs, eps = s.get("rs_rating"), s.get("eps_rating")
        s["composite_rating"] = int(round(COMPOSITE_RS_WEIGHT * rs + (1 - COMPOSITE_RS_WEIGHT) * eps)) if rs is not None and eps is not None else None
    return stocks


# ============================================================================
# BAZY / KOREKTY (głębokość od szczytu, pivot, skurcze VCP) — heurystyka na świecach tygodniowych.
# NIE jest to rozpoznawanie formacji jak w MarketSmith (cup with handle, flagi...) — mierzy po prostu głębokość
# i długość każdej korekty od lokalnego szczytu do ponownego wybicia ponad ten szczyt; typ ("flat"/"cup"/"deep")
# to prosta klasyfikacja po głębokości i odbiciu, orientacyjna.
# ============================================================================
def mkt_drawdown(bench_w, d0, d1):
    """Największy spadek (peak-to-trough, %) benchmarku (tygodniowe zamknięcia) w oknie dat d0..d1; None bez danych."""
    if bench_w is None or not len(bench_w):
        return None
    idx = pd.DatetimeIndex(bench_w.index)
    seg = bench_w[(idx >= pd.Timestamp(d0)) & (idx <= pd.Timestamp(d1))].astype(float).dropna()
    if len(seg) < 2:
        return None
    return float(((seg.cummax() - seg) / seg.cummax()).max() * 100)


def classify_cup(hi, lo, cl, peak, end, dates, bench_w=None):
    """Czy baza (lewy szczyt `peak` .. `end`) jest miseczką z rączką wg O'Neila? Zwraca dict ze szczegółami albo None.
    Warunki: wcześniejszy trend (+30 % w poprzednich 52 tyg.), głębokość 12–33 % (do 50 % przy mocnej korekcie S&P 500),
    7–65 tygodni od szczytu do prawego brzegu, kształt „U” (kilka tygodni przy dnie, dołek nie przy krawędzi),
    prawy brzeg odrabia >= 80 % głębokości (<= 12 % pod szczytem), rączka (opcjonalna) 1–10 tyg., płytsza niż 15 %
    i w górnej połowie miseczki. Kontekst rynku (spadek S&P w tym czasie) jest informacją, nie warunkiem."""
    if end - peak < CUP_MIN_WEEKS:
        return None
    low_i = peak + 1 + int(np.argmin(lo[peak + 1:end + 1]))
    if low_i >= end:
        return None                                               # brak prawej strony
    low = float(lo[low_i])
    top = float(hi[peak])
    depth_abs = top - low
    depth = depth_abs / top * 100
    r = low_i + 1 + int(np.argmax(hi[low_i + 1:end + 1]))        # prawy brzeg = najwyższy szczyt po dołku
    rim = float(hi[r])
    cup_weeks = r - peak
    mkt_dd = mkt_drawdown(bench_w, dates[peak], dates[r])
    max_depth = CUP_MAX_DEPTH_BEAR_PCT if mkt_dd is not None and mkt_dd >= CUP_BEAR_MKT_DD else CUP_MAX_DEPTH_PCT
    if not (CUP_MIN_DEPTH_PCT <= depth <= max_depth) or not (CUP_MIN_WEEKS <= cup_weeks <= CUP_MAX_WEEKS):
        return None
    # wcześniejszy trend wzrostowy (szczyt musi być efektem wzrostu, nie odbiciem po spadku)
    i0 = max(0, peak - CUP_PRIOR_LOOKBACK)
    if peak - i0 < 13:
        return None
    prior_gain = (top / float(lo[i0:peak].min()) - 1) * 100
    if prior_gain < CUP_PRIOR_GAIN_PCT:
        return None
    # kształt „U”: dołek nie przy krawędzi, kilka tygodni w dolnej 1/3, prawa strona nie jest jednym skokiem
    pos = (low_i - peak) / cup_weeks
    bottom = int(np.sum(cl[peak + 1:r + 1] <= low + depth_abs / 3))
    if not (CUP_LOW_POS[0] <= pos <= CUP_LOW_POS[1]) or bottom < max(CUP_BOTTOM_WEEKS, CUP_BOTTOM_FRAC * cup_weeks) or r - low_i < 2:
        return None
    if (rim - low) / depth_abs < CUP_RIM_RECOVERY or (top - rim) / top * 100 > CUP_RIM_MAX_GAP_PCT:
        return None
    # gładkość: brak zygzaków (odbicie w trakcie spadku / cofnięcie w trakcie odbudowy większe niż 40 % głębokości) ...
    left, right = cl[peak:low_i + 1], cl[low_i:r + 1]
    bounce = float(np.max(left - np.minimum.accumulate(left)))                  # największy rajd w trakcie spadku
    dip = float(np.max(np.maximum.accumulate(right) - right))                    # największe cofnięcie w trakcie odbudowy
    if max(bounce, dip) > CUP_MAX_RETRACE * depth_abs:
        return None
    # ... i kształt zbliżony do paraboli o ramionach w górę
    xs = np.arange(peak, r + 1, dtype=float)
    ys = cl[peak:r + 1]
    coef = np.polyfit(xs, ys, 2)
    ss_tot = float(np.sum((ys - ys.mean()) ** 2))
    fit = 1 - float(np.sum((ys - np.polyval(coef, xs)) ** 2)) / ss_tot if ss_tot > 0 else 0.0
    if coef[0] <= 0 or fit < CUP_MIN_FIT:
        return None
    handle = None
    if r < end:
        h_low = float(lo[r + 1:end + 1].min())
        h_depth = (rim - h_low) / rim * 100
        hw = end - r
        if hw > CUP_HANDLE_MAX_WEEKS or h_depth > CUP_HANDLE_MAX_DEPTH_PCT or h_low < low + 0.5 * depth_abs:
            return None
        handle = {"weeks": hw, "low": _num(h_low), "depth_pct": _num(h_depth, 1),
                  "low_date": dates[r + 1 + int(np.argmin(lo[r + 1:end + 1]))].strftime("%Y-%m-%d")}
    return {"rim": _num(rim), "rim_date": dates[r].strftime("%Y-%m-%d"), "cup_weeks": cup_weeks, "handle": handle,
            "prior_gain_pct": _num(prior_gain, 0), "fit": _num(fit, 2), "rim_gap_pct": _num((top - rim) / top * 100, 1),
            "mkt_dd_pct": _num(mkt_dd, 1) if mkt_dd is not None else None,
            "mkt_ctx": bool(mkt_dd is not None and mkt_dd >= CUP_MKT_CONTEXT_DD)}


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


def detect_bases(weekly, bench_w=None):
    """Korekty od lokalnego szczytu (High) do ponownego wybicia ponad ten szczyt (lub do dziś — wtedy open=True).
    Zwraca listę {start, end, peak, low, depth_pct, weeks, type, open, pivot, contractions, vcp} (rosnąco po czasie).
    pivot = szczyt bazy (punkt zakupu w terminologii MarketSmith); vcp = co najmniej 2 kolejne, coraz płytsze skurcze,
    ostatni <= 10 %. Typ "cup" tylko dla miseczek spełniających kryteria O'Neila (classify_cup); bench_w = tygodniowe
    zamknięcia S&P 500 (kontekst rynku)."""
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
        cup = classify_cup(hi, lo, cl, peak, end, dates, bench_w)
        if cup:
            kind = "cup"
        elif depth <= BASE_FLAT_MAX_DEPTH_PCT:
            kind = "flat"
        elif depth <= BASE_CUP_MAX_DEPTH_PCT:
            kind = "correction"
        else:
            kind = "deep"
        drops = zigzag_contractions(list(cl[peak:end + 1]))
        vcp = len(drops) >= 2 and all(drops[k + 1] < drops[k] for k in range(len(drops) - 1)) and drops[-1] <= 10
        bases.append({
            "start": dates[peak].strftime("%Y-%m-%d"), "end": dates[end].strftime("%Y-%m-%d"),
            "peak": _num(hi[peak]), "low": _num(low), "depth_pct": _num(depth, 1), "weeks": weeks, "type": kind,
            "low_date": dates[low_i].strftime("%Y-%m-%d"), "end_close": _num(cl[end]),
            "open": is_open, "pivot": _num(cup["rim"] if cup else hi[peak]), "contractions": drops, "vcp": bool(vcp),
            **({"cup": cup} if cup else {}),
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


def _best_line(values, pivots, check_to, last, highs, min_span, tol=TL_TOLERANCE, slope_range=None):
    """Najdłuższa prosta przez dwa pivoty (indeksy w `values`), której żadna świeca do `check_to` nie przebija o więcej
    niż tol (od góry dla oporu, od dołu dla wsparcia). Kończy się na ostatniej świecy `last`.
    slope_range = (min, max) dozwolonego nachylenia w % na świecę (względem ceny) — odrzuca np. wsparcie opadające
    stromo, gdy opór jest płaski. Zwraca (i0, y0, i1, y1, touches) albo None."""
    best = None
    for ai, a in enumerate(pivots):
        for b in pivots[ai + 1:]:
            if b - a < min_span or b > check_to or values[a] <= 0:
                continue
            slope = (values[b] - values[a]) / (b - a)
            if slope_range and not (slope_range[0] <= slope / values[a] * 100 <= slope_range[1]):
                continue
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


# Parametry wykrywania konsolidacji (świece dzienne / tygodniowe): k = okno pivotu, min/max_len = długość flagi,
# recent = ile ostatnich świec może już być wybiciem, pole_* = maszt (wzrost przed flagą), max_depth = maks. głębokość flagi,
# box_* = korytarz bez masztu (płaska, ciasna konsolidacja).
DAILY_FLAG = dict(k=3, min_len=7, max_len=30, recent=5, pole_lookback=20, pole_min_gain=20.0, max_depth=20.0, box_depth=12.0, box_min_len=12)
WEEKLY_FLAG = dict(k=2, min_len=3, max_len=20, recent=2, pole_lookback=12, pole_min_gain=30.0, max_depth=25.0, box_depth=15.0, box_min_len=5)
FLAG_PARALLEL_PCT = 0.3          # wsparcie może odbiegać nachyleniem od oporu o tyle (% na świecę)
FLAG_MAX_SLOPE_PCT = 0.15        # górna linia flagi może co najwyżej lekko rosnąć (% na świecę)


def _line_value(ln, i):
    return ln[1] + (ln[3] - ln[1]) * (i - ln[0]) / max(1, ln[2] - ln[0])


def detect_consolidation(ohlc, cfg):
    """Flaga (maszt + opadająca/płaska konsolidacja) albo korytarz poziomy z liniami oporu i wsparcia ograniczonymi do
    samej konsolidacji (nie przez cały wykres) oraz stanem wybicia. Zwraca None, gdy nie ma wzorca.
    Wynik: {lines, pattern, state, breakout, info}; info = {type, pole_gain, pole_start, pole_end, pole_low, pole_high,
    length, depth, vol_ratio (średni wolumen flagi / masztu), touches}. breakout = {date, vol_ratio, confirmed}
    (wolumen pierwszej świecy nad oporem / średnia z 50 poprzednich)."""
    n = len(ohlc)
    if n < cfg["min_len"] + cfg["recent"] + 5:
        return None
    dates = [d.strftime("%Y-%m-%d") for d in pd.DatetimeIndex(ohlc.index)]
    hi, lo, cl, vol = (ohlc[c].astype(float).values for c in ("High", "Low", "Close", "Volume"))
    last, recent = n - 1, cfg["recent"]
    end = last - recent                        # ostatnia świeca, która musi mieścić się w konsolidacji
    pivots_hi = _pivot_indices(hi, cfg["k"], True)
    pivots_lo = _pivot_indices(lo, cfg["k"], False)
    best = None
    for s in pivots_hi:
        length = end - s + 1
        if length < cfg["min_len"] or length > cfg["max_len"]:
            continue
        seg_hi, seg_lo = hi[s:end + 1], lo[s:end + 1]
        depth = (seg_hi.max() - seg_lo.min()) / seg_hi.max() * 100
        pole_from = max(0, s - cfg["pole_lookback"])
        pi = pole_from + int(np.argmin(lo[pole_from:s + 1]))
        pole_gain = (hi[s] / lo[pi] - 1) * 100 if lo[pi] > 0 else 0
        is_flag = s - pi >= 3 and pole_gain >= cfg["pole_min_gain"] and depth <= min(cfg["max_depth"], pole_gain * 0.6)
        is_box = depth <= cfg["box_depth"] and length >= cfg["box_min_len"]
        if not (is_flag or is_box):
            continue
        res = _best_line(hi, [q for q in pivots_hi if s <= q <= end], end, last, True, 2)
        if res is None:
            continue
        slope = (res[3] - res[1]) / res[1] / max(1, res[2] - res[0]) * 100
        if slope > FLAG_MAX_SLOPE_PCT or (is_flag and slope < -1.5):
            continue
        sup = _best_line(lo, [q for q in pivots_lo if s <= q <= end], end, last, False, 2,
                         slope_range=(slope - FLAG_PARALLEL_PCT, slope + FLAG_PARALLEL_PCT))   # wsparcie ~równoległe do oporu
        score = (is_flag, res[4] + (sup[4] if sup else 0), length)
        if best is None or score > best[0]:
            best = (score, s, pi, pole_gain, depth, length, res, sup, is_flag)
    if best is None:
        return None
    _, s, pi, pole_gain, depth, length, res, sup, is_flag = best

    lines = [{"kind": "res", "x0": dates[res[0]], "y0": _num(res[1]), "x1": dates[last], "y1": _num(res[3]), "touches": res[4]}]
    if sup:
        lines.append({"kind": "sup", "x0": dates[sup[0]], "y0": _num(sup[1]), "x1": dates[last], "y1": _num(sup[3]), "touches": sup[4]})

    state, breakout = None, None
    broke = [i for i in range(last - recent + 1, n) if cl[i] > _line_value(res, i)]
    if broke:
        state, first = "wybicie", broke[0]
        prev = vol[max(0, first - TL_VOLUME_AVG_BARS):first]
        if len(prev) >= 10 and prev.mean() > 0:
            ratio = _num(vol[first] / prev.mean(), 1)
            breakout = {"date": dates[first], "vol_ratio": ratio, "confirmed": bool(ratio >= TL_VOLUME_MULT)}
    elif cl[-1] < res[3] and (res[3] / cl[-1] - 1) * 100 <= TL_NEAR_PCT:
        state = "przy oporze"

    pole_vol = vol[pi:s + 1].mean() if s >= pi else 0
    flag_vol = vol[s + 1:end + 1].mean() if end > s else 0
    info = {"type": "flaga" if is_flag else "korytarz", "pole_gain": _num(pole_gain, 0) if is_flag else None,
            "pole_start": dates[pi] if is_flag else None, "pole_end": dates[s],
            "pole_low": _num(lo[pi]) if is_flag else None, "pole_high": _num(hi[s]),
            "length": int(length), "depth": _num(depth, 1),
            "vol_ratio": _num(flag_vol / pole_vol, 1) if is_flag and pole_vol > 0 else None, "touches": res[4]}
    return {"lines": lines, "pattern": info["type"], "state": state, "breakout": breakout, "info": info}


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


def rs_line_flags(close, bench_close, window=RS_HIGH_SESSIONS):
    """Linia RS (cena / S&P 500) i flagi: rs_hi = RS wyższe niż w poprzednich `window` świecach (cały dostępny zapis,
    nie tylko widoczne okno), px_hi = to samo dla ceny. Zwraca (rs, rs_hi, px_hi) jako serie."""
    c = close.astype(float)
    b = bench_close.astype(float).reindex(c.index).ffill()
    rs = (c / b).replace([np.inf, -np.inf], np.nan)
    need = int(window * 0.8)
    rs_prev = rs.shift(1).rolling(window, min_periods=need).max()
    px_prev = c.shift(1).rolling(window, min_periods=need).max()
    return rs, (rs >= rs_prev) & rs_prev.notna(), (c >= px_prev) & px_prev.notna()


def rs_line_summary(rs, rs_hi, px_hi, window=RS_HIGH_SESSIONS, recent=RS_RECENT_BARS):
    """Stan linii RS na dziś: 'przed ceną' (RS na maksimum 52 tyg., cena jeszcze nie), 'na szczycie' (oba) albo None;
    do tego odległość RS od jego maksimum (%)."""
    hi = bool(rs_hi.tail(recent).any())
    px = bool(px_hi.tail(recent).any())
    tail = rs.dropna().tail(window)
    dist = (tail.iloc[-1] / tail.max() - 1) * 100 if len(tail) else None
    state = ("przed ceną" if not px else "na szczycie") if hi else None
    return {"state": state, "dist_pct": _num(dist, 1)}


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


# ============================================================================
# ESTYMATY ANALITYKÓW (Yahoo przez yfinance): cena celu, konsensus EPS i jego rewizje — jak linie "EPS Consensus" na Zacks
# ============================================================================
def _clean(v, digits=4):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if (f != f) else round(f, digits)


def fetch_estimates_one(ticker):
    """Surowe dane Yahoo dla jednej spółki: {pt, trend, est, rev} (każde może być puste)."""
    import yfinance as yf
    t = yf.Ticker(ticker)

    def safe(fn):
        try:
            return fn()
        except Exception:
            return None

    def frame(df):
        if df is None or getattr(df, "empty", True):
            return {}
        return {str(k): {c: _clean(v) for c, v in row.items() if c != "currency"} for k, row in df.to_dict("index").items()}

    pt = safe(t.get_analyst_price_targets)
    return {
        "pt": {k: _clean(pt.get(k), 2) for k in ("low", "mean", "median", "high")} if isinstance(pt, dict) else None,
        "trend": frame(safe(t.get_eps_trend)),
        "est": frame(safe(t.get_earnings_estimate)),
        "rev": frame(safe(t.get_eps_revisions)),
    }


def build_estimate_entry(raw, prev, today):
    """Łączy surowe dane Yahoo z poprzednim wpisem: historia konsensusu EPS rośnie z każdym pobraniem (punkty sprzed 7/30/60/90 dni
    z `get_eps_trend` zasilają pierwszy przebieg). Wpis: {f: data pobrania, pt: {low, mean, median, high}, p: {okres: {...}}}."""
    today = pd.Timestamp(today).normalize()
    entry = {"f": today.strftime("%Y-%m-%d"), "pt": raw.get("pt") or None, "p": {}}
    for period in EST_PERIODS:
        tr, es, rv = (raw.get(k, {}).get(period) or {} for k in ("trend", "est", "rev"))
        if not tr and not es:
            continue
        old = ((prev or {}).get("p", {}).get(period) or {}).get("h") or []
        hist = {d: v for d, v in old}
        for key, days in EST_SEED_DAYS.items():                      # punkty wsteczne tylko, gdy ich jeszcze nie mamy
            v = tr.get(key)
            if v is not None:
                hist.setdefault((today - pd.Timedelta(days=days)).strftime("%Y-%m-%d"), v)
        cur = tr.get("current", es.get("avg"))
        if cur is not None:
            hist[today.strftime("%Y-%m-%d")] = cur                    # dzisiejsza wartość zawsze nadpisuje
        cutoff = (today - pd.Timedelta(days=EST_HISTORY_DAYS)).strftime("%Y-%m-%d")
        entry["p"][period] = {
            "avg": es.get("avg", cur), "low": es.get("low"), "high": es.get("high"), "n": es.get("numberOfAnalysts"),
            "g": es.get("growth"), "ya": es.get("yearAgoEps"),
            "u7": rv.get("upLast7days"), "u30": rv.get("upLast30days"), "d30": rv.get("downLast30days"), "d7": rv.get("downLast7Days"),
            "h": [[d, hist[d]] for d in sorted(hist) if d >= cutoff],
        }
    return entry


def _rev_pct(hist, days, today):
    """Zmiana konsensusu (%) względem punktu sprzed ~`days` dni (najbliższy wcześniejszy punkt historii)."""
    if not hist:
        return None
    last = hist[-1][1]
    target = (pd.Timestamp(today) - pd.Timedelta(days=days)).strftime("%Y-%m-%d")
    older = [v for d, v in hist if d <= target]
    base = older[-1] if older else None
    return _num((last - base) / abs(base) * 100, 1) if base else None


def estimate_fields(entry, price, today=None):
    """Płaskie pola do tabeli (watchlist.json): cena celu i upside, rewizje konsensusu EPS bieżącego/następnego roku, liczba rewizji."""
    out = {"pt_mean": None, "pt_low": None, "pt_high": None, "pt_upside_pct": None, "eps_rev30_pct": None, "eps_rev90_pct": None, "eps1_rev30_pct": None,
           "rev_up30": None, "rev_down30": None, "analysts": None}
    if not entry:
        return out
    today = today or entry.get("f")
    pt = entry.get("pt") or {}
    if pt.get("mean") and price:
        out["pt_mean"] = _num(pt["mean"])
        out["pt_upside_pct"] = _num((pt["mean"] / price - 1) * 100, 1)
        out["pt_low"], out["pt_high"] = _num(pt.get("low")), _num(pt.get("high"))
    fy0, fy1 = entry["p"].get("0y") or {}, entry["p"].get("+1y") or {}
    out["eps_rev30_pct"] = _rev_pct(fy0.get("h"), 30, today)
    out["eps_rev90_pct"] = _rev_pct(fy0.get("h"), 90, today)
    out["eps1_rev30_pct"] = _rev_pct(fy1.get("h"), 30, today)
    out["rev_up30"], out["rev_down30"], out["analysts"] = fy0.get("u30"), fy0.get("d30"), fy0.get("n")
    return out


def update_estimates(tickers, path=ESTIMATES_PATH, now=None, fetch=fetch_estimates_one, max_age_days=EST_MAX_AGE_DAYS,
                     time_budget_s=EST_TIME_BUDGET_S):
    """docs/data/estimates.json = {updated, stocks: {ticker: wpis}}; odświeża wpisy starsze niż max_age_days (limit czasu i błędy
    pojedynczych spółek nigdy nie przerywają pipeline'u — brak wpisu = brak estymat na wykresie)."""
    from concurrent.futures import ThreadPoolExecutor
    import time
    now = pd.Timestamp(now if now is not None else datetime.now(timezone.utc)).tz_localize(None)
    try:
        stocks = json.loads(Path(path).read_text(encoding="utf-8")).get("stocks", {})
    except (FileNotFoundError, ValueError):
        stocks = {}
    stale = [t for t in tickers if t not in stocks or (now - pd.Timestamp(stocks[t].get("f", "1970-01-01"))).days >= max_age_days]
    if stale:
        print(f"⏳ Estymaty analityków: pobieram {len(stale)} spółek (limit {time_budget_s}s)...")
        started = time.time()

        def work(t):
            if time.time() - started > time_budget_s:
                return t, None
            try:
                return t, fetch(t)
            except Exception:
                return t, None
        with ThreadPoolExecutor(EPS_WORKERS) as pool:
            for t, raw in pool.map(work, stale):
                if raw is not None:
                    stocks[t] = build_estimate_entry(raw, stocks.get(t), now)
    stocks = {t: v for t, v in stocks.items() if t in set(tickers)}
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"updated": now.strftime("%Y-%m-%d"), "stocks": stocks}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return stocks


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
    bench_w = ref["Close"].astype(float) if bench is not None else None
    day_ref = bench if bench is not None else next(iter(cleaned.values()))
    day_index = pd.DatetimeIndex(day_ref.index).tz_localize(None).normalize()
    day_index = day_index[~day_index.duplicated(keep="last")][-CHART_DAYS:]
    payload["days"] = [d.strftime("%Y-%m-%d") for d in day_index]
    payload["spx_d"] = (_series(bench["Close"].astype(float).set_axis(
        pd.DatetimeIndex(bench.index).tz_localize(None).normalize()).groupby(level=0).last().reindex(day_index))
        if bench is not None else None)
    bench_d = None
    if bench is not None:
        bench_d = bench["Close"].astype(float).set_axis(pd.DatetimeIndex(bench.index).tz_localize(None).normalize()).groupby(level=0).last()
    for t, df in cleaned.items():
        chart = build_chart(weekly_ohlcv(df, last_date), weeks)
        quarters, nxt = eps_quarters((eps_cache.get(t) or {}).get("rows", []))
        first = payload["weeks"][0]
        wk = weekly_ohlcv(df, last_date)
        chart["bases"] = [b for b in detect_bases(wk, bench_w) if b["end"] >= first][-BASE_MAX_SHOWN:]
        chart["eps"] = [q for q in quarters if q["d"] >= first]
        chart["eps_next"] = nxt
        chart["day"] = build_daily(df, day_index)
        if bench_d is not None:
            dd = _daily_ohlc(df)
            rs, rs_hi, px_hi = rs_line_flags(dd["Close"], bench_d)
            idx = pd.DatetimeIndex(day_index)
            chart["day"]["rs_hi"] = [int(bool(v)) for v in rs_hi.reindex(idx).fillna(False)]
            chart["day"]["px_hi"] = [int(bool(v)) for v in px_hi.reindex(idx).fillna(False)]
            chart["rs_line"] = rs_line_summary(rs, rs_hi, px_hi)
            wk_c = wk["Close"]
            wrs, wrs_hi, wpx_hi = rs_line_flags(wk_c, bench_d, window=52)
            widx = pd.DatetimeIndex(payload["weeks"])
            chart["rs_hi"] = [int(bool(v)) for v in wrs_hi.reindex(widx).fillna(False)]
            chart["px_hi"] = [int(bool(v)) for v in wpx_hi.reindex(widx).fillna(False)]
        chart["tl"] = detect_consolidation(wk, WEEKLY_FLAG)
        chart["day"]["tl"] = detect_consolidation(_daily_ohlc(df), DAILY_FLAG)
        payload["stocks"][t] = chart
    return payload


# ============================================================================
# SKŁADANIE I ZAPIS
# ============================================================================
def weekly_close(df):
    """Tygodniowe (piątek) zamknięcia z dziennych świec; None, gdy brak danych."""
    if df is None or not len(df):
        return None
    close = df["Close"].astype(float).copy()
    close.index = pd.DatetimeIndex(close.index).tz_localize(None).normalize()
    return close.resample("W-FRI").last().dropna()


def finviz_upside(target, price):
    """Upside do średniej ceny celu z Finviz (%): (cel / cena − 1)·100; None bez ceny lub celu."""
    if not target or not price or target <= 0 or price <= 0:
        return None
    return _num((target / price - 1) * 100, 1)


def build_stocks(finviz_rows, frames, now_utc=None, bench_df=None):
    stocks = []
    bench_w = weekly_close(drop_incomplete_bar(bench_df, now_utc)) if bench_df is not None and len(bench_df) else None
    for row in finviz_rows:
        df = frames.get(row["ticker"])
        if df is None:
            continue
        metrics = compute_metrics(drop_incomplete_bar(df, now_utc), bench_w)
        if metrics is None:
            continue
        stock = {"ticker": row["ticker"]}
        stock.update({k: row.get(k) for k in FINVIZ_KEYS})
        stock.update(metrics)
        stock["finviz_upside_pct"] = finviz_upside(stock.get("finviz_target"), stock.get("price"))
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

    try:
        bench_frames = download_prices([BENCHMARK])
        benchmark_df = bench_frames.get(BENCHMARK)
    except Exception as e:
        print(f"⚠️  Benchmark {BENCHMARK} niedostępny ({e}) — wykresy bez linii S&P 500.")
        benchmark_df = None
    stocks = build_stocks(finviz_rows, frames, bench_df=benchmark_df)
    try:
        eps_cache = update_eps_cache([s["ticker"] for s in stocks], eps_cache_path)
    except Exception as e:
        print(f"⚠️  Krok EPS pominięty ({e}).")
        eps_cache = {}
    add_eps_rating(stocks, eps_cache)
    try:
        estimates = update_estimates([s["ticker"] for s in stocks], Path(output_path).parent / "estimates.json")
    except Exception as e:
        print(f"⚠️  Krok estymat analityków pominięty ({e}).")
        estimates = {}
    for st in stocks:
        st.update(estimate_fields(estimates.get(st["ticker"]), st.get("price")))
    charts = build_charts([s["ticker"] for s in stocks], frames, benchmark_df, eps_cache)
    for st in stocks:
        summary = ((charts or {}).get("stocks", {}).get(st["ticker"]) or {}).get("rs_line") or {}
        st["rs_line_state"] = summary.get("state")
        st["rs_line_dist_pct"] = summary.get("dist_pct")
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
