"""
run_query.py
============
CAŁA logika obliczeniowa (pełna metodologia S&P Momentum: momentum value,
z-score, momentum score, selekcja kwintylowa z buforem, wagi FMC z capami)
ORAZ generowanie statycznej strony (HTML/CSS/JS + eksport danych JSON) do
katalogu docs/ pod GitHub Pages.

Zgodnie z ustaleniami: fetch_data.py odpowiada WYŁĄCZNIE za pobieranie
danych (ceny z yfinance, skład indeksów + FMC z kolumny 'Market Value'
w plikach CSV holdings ETF-ów CSPX/CNDX/CIND). Ten plik odpowiada za
WSZYSTKO inne: obliczenia + generowanie strony.

Kroki obliczeniowe (Appendix A, B, sekcje Constituent Selection/Weightings
metodologii S&P Momentum Indices):
1. Momentum value: (price_M-2 / price_M-14) - 1, fallback 9M jesli brak 14M.
2. Risk-adjusted momentum value: momentum_value / zmiennosc (Appendix A pkt 2).
3. Z-score w obrebie uniwersum, winsoryzacja +/-3 (Appendix B).
4. Momentum score: 1+Z (Z>0) lub 1/(1-Z) (Z<0) (Appendix B).
5. Selekcja: top kwintyl (20%) wg momentum score, z 20% regula bufora
   ograniczajaca obrot (sekcja "Constituent Selection").
6. Wagi: FMC x momentum score, znormalizowane, z capem = min(9%, 3x waga
   kapitalizacyjna w uniwersum), iteracyjnie kapowane z redystrybucja
   nadwyzki (sekcja "Constituent Weightings").
7. Zapis do trwalej tabeli portfolio_history (nigdy niekasowanej przez
   fetch_data.py) — uzywanej m.in. do reguly bufora (current_tickers) oraz
   jako zrodlo docelowych wag dla panelu rebalansu na stronie.
8. Eksport JSON dla strony (docs/data/*.json) + wygenerowanie statycznych
   plikow strony (docs/index.html, docs/rebalance.html, docs/css/*, docs/js/*).
9. Global Equity Momentum: zwrot POZIOMU INDEKSU (tabela index_prices z
   fetch_data.py) dla SP500/NASDAQ100/DOWJONES w oknie GEM_LOOKBACK_MONTHS,
   wybor zwyciezcy (najwyzszy zwrot) i top GEM_TOP_N liderow zwycieskiego
   indeksu wg wkladu w jego zwrot — patrz export_global_equity_momentum.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES"]
TARGET_QUINTILE = 0.20   # top 20% wg momentum score
BUFFER_LOWER = 0.80      # automatyczna selekcja top 80% targetu
BUFFER_UPPER = 1.20      # obecne skladniki reselekcjonowane do 120% targetu
MAX_WEIGHT = 0.09        # 9% max na spolke
CAP_MULTIPLE = 3.0       # nie wiecej niz 3x waga kapitalizacyjna w uniwersum
MAX_HOLDINGS = 100
GEM_LOOKBACK_MONTHS = 12   # okno zwrotu poziomu indeksu dla Global Equity Momentum
GEM_TOP_N = 10             # ilu liderow (najwiekszy wklad w zwrot) pokazujemy dla zwycieskiego indeksu
INDEX_LEVEL_SYMBOLS = {"SP500": "^GSPC", "NASDAQ100": "^NDX", "DOWJONES": "^DJI"}

# 1-2-3-4: METRYKI (SQL) — momentum value, zmienność, eligibility, z-score, score
# ============================================================================
def get_universe_metrics(con, universe, ref_date, min_trading_days, max_staleness_days):
    query = f"""
    WITH params AS (SELECT DATE '{ref_date}' AS ref_date),
    uni_tickers AS (
        SELECT DISTINCT ic.Ticker, ic.Sector, ic.fmc_etf
        FROM index_constituents ic
        WHERE ic.Index_Name = '{universe}'
    ),
    daily_returns AS (
        SELECT p.Ticker, p.Date, p.Close,
               (p.Close / LAG(p.Close) OVER (PARTITION BY p.Ticker ORDER BY p.Date) - 1) AS daily_return
        FROM prices p
        JOIN uni_tickers u ON p.Ticker = u.Ticker
    ),
    price_points AS (
        SELECT
            dr.Ticker,
            MAX(dr.Date) AS last_price_date,
            ARGMAX(dr.Close, dr.Date) FILTER (WHERE dr.Date <= (SELECT ref_date FROM params)) AS price_now,
            ARGMAX(dr.Close, dr.Date) FILTER (WHERE dr.Date <= (SELECT ref_date FROM params) - INTERVAL '2 MONTHS') AS price_m2,
            ARGMAX(dr.Close, dr.Date) FILTER (WHERE dr.Date <= (SELECT ref_date FROM params) - INTERVAL '14 MONTHS') AS price_m14,
            ARGMAX(dr.Close, dr.Date) FILTER (WHERE dr.Date <= (SELECT ref_date FROM params) - INTERVAL '11 MONTHS') AS price_m11,
            -- Appendix A pkt 2 (S&P Momentum Indices Methodology): "Standard deviation of daily
            -- price returns for the SAME date period used in Step 1" -> zmienność musi być liczona
            -- z tego samego okna co momentum_value (M-14..M-2, albo M-11..M-2 dla fallbacku 9M),
            -- a nie z ostatnich 12 miesięcy liczonych od dziś.
            STDDEV(dr.daily_return) FILTER (
                WHERE dr.Date > (SELECT ref_date FROM params) - INTERVAL '14 MONTHS'
                  AND dr.Date <= (SELECT ref_date FROM params) - INTERVAL '2 MONTHS'
            ) * SQRT(252) AS annualized_volatility_12m,
            STDDEV(dr.daily_return) FILTER (
                WHERE dr.Date > (SELECT ref_date FROM params) - INTERVAL '11 MONTHS'
                  AND dr.Date <= (SELECT ref_date FROM params) - INTERVAL '2 MONTHS'
            ) * SQRT(252) AS annualized_volatility_9m,
            COUNT(dr.daily_return) FILTER (
                WHERE dr.Date > (SELECT ref_date FROM params) - INTERVAL '14 MONTHS'
                  AND dr.Date <= (SELECT ref_date FROM params) - INTERVAL '2 MONTHS'
            ) AS trading_days_12m,
            COUNT(dr.daily_return) FILTER (
                WHERE dr.Date > (SELECT ref_date FROM params) - INTERVAL '11 MONTHS'
                  AND dr.Date <= (SELECT ref_date FROM params) - INTERVAL '2 MONTHS'
            ) AS trading_days_9m
        FROM daily_returns dr
        GROUP BY dr.Ticker
    ),
    momentum AS (
        SELECT
            Ticker, last_price_date, price_now,
            CASE WHEN price_m14 IS NOT NULL AND price_m2 IS NOT NULL THEN annualized_volatility_12m
                 WHEN price_m11 IS NOT NULL AND price_m2 IS NOT NULL THEN annualized_volatility_9m
                 ELSE NULL END AS annualized_volatility,
            CASE WHEN price_m14 IS NOT NULL AND price_m2 IS NOT NULL THEN price_m2 / price_m14 - 1
                 WHEN price_m11 IS NOT NULL AND price_m2 IS NOT NULL THEN price_m2 / price_m11 - 1
                 ELSE NULL END AS momentum_value,
            CASE WHEN price_m14 IS NOT NULL AND price_m2 IS NOT NULL THEN '12M'
                 WHEN price_m11 IS NOT NULL AND price_m2 IS NOT NULL THEN '9M (fallback)'
                 ELSE NULL END AS momentum_window,
            CASE WHEN price_m14 IS NOT NULL AND price_m2 IS NOT NULL THEN trading_days_12m
                 ELSE trading_days_9m END AS trading_days_used
        FROM price_points
    )
    SELECT m.Ticker, u.Sector, u.fmc_etf AS fmc, m.price_now, m.momentum_value, m.momentum_window,
           m.annualized_volatility, m.last_price_date
    FROM momentum m
    JOIN uni_tickers u ON m.Ticker = u.Ticker
    WHERE m.momentum_value IS NOT NULL
      AND m.annualized_volatility > 0
      AND u.fmc_etf IS NOT NULL
      AND (
            (m.momentum_window = '12M' AND m.trading_days_used >= {min_trading_days})
         OR (m.momentum_window = '9M (fallback)' AND m.trading_days_used >= {min_trading_days} * 9 / 12)
      )
      AND m.last_price_date >= (SELECT ref_date FROM params) - INTERVAL '{max_staleness_days} DAYS';
    """
    return con.execute(query).df()


def add_zscore_and_momentum_score(df):
    """Appendix B: z-score w obrębie uniwersum, winsoryzacja ±3, momentum score."""
    df = df.copy()
    df["risk_adjusted_momentum"] = df["momentum_value"] / df["annualized_volatility"]
    mu = df["risk_adjusted_momentum"].mean()
    sigma = df["risk_adjusted_momentum"].std()
    if sigma == 0 or pd.isna(sigma):
        df["z_score"] = 0.0
    else:
        df["z_score"] = (df["risk_adjusted_momentum"] - mu) / sigma
    df["z_score_winsorized"] = df["z_score"].clip(-3, 3)
    df["momentum_score"] = np.where(
        df["z_score_winsorized"] > 0, 1 + df["z_score_winsorized"],
        np.where(df["z_score_winsorized"] < 0, 1 / (1 - df["z_score_winsorized"]), 1.0)
    )
    # Dokument nie precyzuje reguly tie-break, ale remisy sa tu gwarantowane
    # (winsoryzacja na +/-3 daje identyczny momentum_score dla wielu spolek) —
    # sortowanie po tickerze jako kluczu pomocniczym zapewnia powtarzalny wynik
    # dla tych samych danych wejsciowych, zamiast zaleznosci od kolejnosci
    # zwroconej przez SQL (ktora nie jest gwarantowana bez ORDER BY).
    df = df.sort_values(["momentum_score", "Ticker"], ascending=[False, True]).reset_index(drop=True)
    df["rank"] = np.arange(1, len(df) + 1)
    return df


# ============================================================================
# 5: SELEKCJA Z REGUŁĄ BUFORA (sekcja "Constituent Selection")
# ============================================================================
def select_with_buffer(df_ranked, current_tickers):
    n = len(df_ranked)
    target_count = min(round(TARGET_QUINTILE * n), MAX_HOLDINGS)
    if target_count <= 0 or n == 0:
        return set(), target_count

    lower_band = math.floor(BUFFER_LOWER * target_count)
    upper_band = math.ceil(BUFFER_UPPER * target_count)

    selected = set(df_ranked[df_ranked["rank"] <= lower_band]["Ticker"])

    if len(selected) < target_count:
        band = df_ranked[(df_ranked["rank"] <= upper_band) & (~df_ranked["Ticker"].isin(selected))]
        band_current = band[band["Ticker"].isin(current_tickers)].sort_values("rank")
        for t in band_current["Ticker"]:
            if len(selected) >= target_count:
                break
            selected.add(t)

    if len(selected) < target_count:
        band = df_ranked[(df_ranked["rank"] > lower_band) & (df_ranked["rank"] <= target_count)
                          & (~df_ranked["Ticker"].isin(selected))]
        band_noncurrent = band.sort_values("rank")
        for t in band_noncurrent["Ticker"]:
            if len(selected) >= target_count:
                break
            selected.add(t)

    return selected, target_count


# ============================================================================
# 6: WAGI (sekcja "Constituent Weightings")
# ============================================================================
def compute_weights(df_selected, universe=None):
    """
    Waga surowa_i = FMC_i * momentum_score_i, znormalizowana do sumy 1.
    Cap_i = min(9%, 3 * waga_kapitalizacyjna_i_w_indeksie).
    Iteracyjna redystrybucja nadwyżki ponad cap do niekapowanych, proporcjonalnie.

    Sekcja "Constituent Weightings": "three times the security's market
    capitalization weight IN THE INDEX" -> mianownik to suma FMC WYSELEKCJONOWANYCH
    (finalnych) skladnikow indeksu, nie calej puli kwalifikowanych spolek sprzed
    selekcji kwintylowej. Wczesniej liczone bledbie wzgledem calego uniwersum
    (df_full_universe), co sztucznie zanizalo capy przy malych selekcjach
    (np. 20 z 100 kwalifikowanych w NASDAQ100).
    """
    df = df_selected.copy()
    n = len(df)

    if universe == "DOWJONES":
       df["weight"] = 1.0/n
       df["cap_scaled_due_to_infeasibility"] = False
       return df

    total_fmc_index = df["fmc"].sum()
    df["cap_weight_index"] = df["fmc"] / total_fmc_index

    raw = df["fmc"] * df["momentum_score"]
    weights = raw / raw.sum()
    caps = np.minimum(MAX_WEIGHT, CAP_MULTIPLE * df["cap_weight_index"].values)
    caps = np.maximum(caps, 0.0)

    # Sprawdzenie wykonalności: przy małych uniwersach (np. DOWJONES: 30 spółek
    # -> kwintyl to tylko 6 wybranych) suma indywidualnych capów po 9% może być
    # < 100% (6x9%=54%), co matematycznie uniemożliwia zsumowanie wag do 100%
    # bez złamania capu. W takim wypadku skalujemy WSZYSTKIE capy proporcjonalnie
    # w górę, tak by ich suma wynosiła dokładnie 100% — zachowuje to relatywne
    # różnice między capami, ale gwarantuje wykonalność ograniczenia.
    cap_sum = caps.sum()
    cap_scaled = False
    if cap_sum < 1.0 and cap_sum > 0:
        scale = 1.0 / cap_sum
        caps = caps * scale
        cap_scaled = True
        print(f"⚠️  Cap 9%/3x niewykonalny dla {len(df)} wybranych spółek "
              f"(suma capów={cap_sum * 100:.1f}% < 100%). Capy przeskalowane x{scale:.2f} "
              f"proporcjonalnie, by suma wag mogła osiągnąć 100%.")
    df["cap_scaled_due_to_infeasibility"] = cap_scaled

    weights = weights.values.astype(float)
    for _ in range(50):
        over = weights > caps + 1e-10
        if not over.any():
            break
        excess = (weights[over] - caps[over]).sum()
        weights[over] = caps[over]
        uncapped = ~over
        if not uncapped.any() or weights[uncapped].sum() == 0:
            break
        weights[uncapped] += excess * (weights[uncapped] / weights[uncapped].sum())

    weights = weights / weights.sum()  # bezpieczna normalizacja końcowa
    df["weight"] = weights
    return df


# ============================================================================
# GŁÓWNY PRZEBIEG DLA JEDNEGO UNIWERSUM
# ============================================================================
def process_universe(con, universe, ref_date, args, docs_data_dir):
    print(f"\n{'=' * 70}\n▶ {universe}\n{'=' * 70}")

    df_metrics = get_universe_metrics(con, universe, ref_date, args.min_trading_days, args.max_staleness_days)
    if df_metrics.empty:
        print(f"❌ Brak kwalifikujących się spółek dla {universe}.")
        return None

    n_missing_fmc = con.execute(f"""
        SELECT COUNT(*) FROM index_constituents
        WHERE Index_Name = '{universe}' AND fmc_etf IS NULL
    """).fetchone()[0]
    if n_missing_fmc > 0:
        print(f"⚠️  {n_missing_fmc} spółek w {universe}_holdings.csv bez wartości Market Value "
              f"— pominięte (brak FMC do wagowania).")

    df_ranked = add_zscore_and_momentum_score(df_metrics)

    con.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_history (
            ref_date DATE, universe VARCHAR, rank_in_universe INTEGER,
            ticker VARCHAR, sector VARCHAR, price_at_rebalance DOUBLE,
            momentum_value DOUBLE, momentum_window VARCHAR, annualized_volatility DOUBLE,
            z_score DOUBLE, momentum_score DOUBLE, weight DOUBLE,
            PRIMARY KEY (ref_date, universe, ticker)
        )
    """)
    prev_ref_date = con.execute(f"""
        SELECT MAX(ref_date) FROM portfolio_history
        WHERE universe = '{universe}' AND ref_date < DATE '{ref_date}'
    """).fetchone()[0]
    current_tickers = set()
    if prev_ref_date is not None:
        current_tickers = set(con.execute(f"""
            SELECT ticker FROM portfolio_history
            WHERE universe = '{universe}' AND ref_date = DATE '{prev_ref_date}'
        """).df()["ticker"])
    # Przed zmianą:
    # selected_tickers, target_count = select_with_buffer(df_ranked, current_tickers)

    # PO ZMIANIE:
    if universe == "DOWJONES":
        selected_tickers = set(df_ranked["Ticker"])
        target_count = len(selected_tickers)
    else:
        selected_tickers, target_count = select_with_buffer(df_ranked, current_tickers)

    #selected_tickers, target_count = select_with_buffer(df_ranked, current_tickers)
    print(f"Uniwersum: {len(df_ranked)} spółek kwalifikowanych. Target (kwintyl 20%): "
          f"{target_count}. Wybrano: {len(selected_tickers)}.")

    df_selected = df_ranked[df_ranked["Ticker"].isin(selected_tickers)].copy()
    if df_selected.empty:
        print(f"❌ Brak wybranych spółek dla {universe}.")
        return None

    df_weighted = compute_weights(df_selected, universe=universe)
    df_weighted = df_weighted.sort_values("weight", ascending=False).reset_index(drop=True)
    df_weighted["rank_in_universe"] = range(1, len(df_weighted) + 1)

    # --- Zapis do trwałej tabeli portfolio_history (universe-aware) ---
    df_hist = df_weighted[[
        "Ticker", "Sector", "price_now", "momentum_value", "momentum_window",
        "annualized_volatility", "z_score", "momentum_score", "weight", "rank_in_universe"
    ]].rename(columns={"Ticker": "ticker", "Sector": "sector", "price_now": "price_at_rebalance"})
    df_hist.insert(0, "universe", universe)
    df_hist.insert(0, "ref_date", pd.Timestamp(ref_date).date())

    con.execute(f"DELETE FROM portfolio_history WHERE ref_date = DATE '{ref_date}' AND universe = '{universe}'")
    con.execute("INSERT INTO portfolio_history SELECT ref_date, universe, rank_in_universe, ticker, sector, "
                "price_at_rebalance, momentum_value, momentum_window, annualized_volatility, z_score, "
                "momentum_score, weight FROM df_hist")

    # --- Turnover (do changeloga na dashboardzie) ---
    added_tickers, dropped_tickers = [], []
    if current_tickers:
        added_tickers = sorted(selected_tickers - current_tickers)
        dropped_tickers = sorted(current_tickers - selected_tickers)
        print(f"🔁 Turnover vs {prev_ref_date}: {len(added_tickers)} nowych, {len(dropped_tickers)} wypadło "
              f"(z {len(current_tickers)} poprzednich).")

    # --- Eksport JSON dla strony ---
    export_json(df_weighted, universe, ref_date, docs_data_dir, n_missing_fmc,
                prev_ref_date, added_tickers, dropped_tickers)

    return df_weighted


def export_json(df_weighted, universe, ref_date, docs_data_dir, n_missing_fmc,
                 prev_ref_date=None, added_tickers=None, dropped_tickers=None):
    records = []
    for _, r in df_weighted.iterrows():
        records.append({
            "rank": int(r["rank_in_universe"]),
            "ticker": r["Ticker"],
            "sector": r["Sector"],
            "price": round(float(r["price_now"]), 2),
            "momentum_pct": round(float(r["momentum_value"]) * 100, 2),
            "momentum_window": r["momentum_window"],
            "volatility_pct": round(float(r["annualized_volatility"]) * 100, 2),
            "z_score": round(float(r["z_score"]), 3),
            "momentum_score": round(float(r["momentum_score"]), 3),
            "weight_pct": round(float(r["weight"]) * 100, 3),
        })
    cap_scaled = bool(df_weighted["cap_scaled_due_to_infeasibility"].iloc[0]) if len(df_weighted) else False
    fmc_note = ("DJIA jest ważona ceną, nie kapitalizacją — wagi FMC odzwierciedlają wagę cenową "
                "spółki w indeksie (za funduszem CIND), nie jej kapitalizację rynkową."
                if universe == "DOWJONES" else
                "FMC pochodzi z kolumny 'Market Value' funduszu ETF replikującego ten indeks "
                "(realna, publikowana waga float-adjusted market cap).")
    payload = {
        "universe": universe,
        "ref_date": ref_date,
        "fmc_note": fmc_note,
        "n_constituents": len(records),
        "n_missing_fmc": int(n_missing_fmc),
        "cap_scaled_due_to_infeasibility": cap_scaled,
        "constituents": records,
        "prev_ref_date": str(prev_ref_date) if prev_ref_date is not None else None,
        "added_tickers": added_tickers or [],
        "dropped_tickers": dropped_tickers or [],
    }
    out_path = Path(docs_data_dir) / f"{universe.lower()}.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"💾 Wyeksportowano {out_path}")


# ============================================================================
# CENY DLA WSZYSTKICH SPÓŁEK W INDEKSACH (nie tylko wybranych do portfela)
# -> docs/data/all_prices.json — pozwala panelowi rebalansu wycenić dowolną
# pozycję użytkownika, nawet spółkę spoza aktualnej top-20 selekcji momentum.
# ============================================================================
def export_all_prices(con, ref_date, docs_data_dir):
    df = con.execute(f"""
        SELECT ic.Ticker AS ticker,
               STRING_AGG(DISTINCT ic.Index_Name, ',') AS universes,
               ARGMAX(p.Close, p.Date) FILTER (WHERE p.Date <= DATE '{ref_date}') AS price
        FROM index_constituents ic
        JOIN prices p ON p.Ticker = ic.Ticker
        GROUP BY ic.Ticker
        HAVING price IS NOT NULL
    """).df()
    payload = {
        row["ticker"]: {"price": round(float(row["price"]), 2), "universes": row["universes"].split(",")}
        for _, row in df.iterrows()
    }
    Path(docs_data_dir, "all_prices.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"💾 Wyeksportowano all_prices.json ({len(payload)} spółek ze wszystkich indeksów).")


# ============================================================================
# EQUITY CURVE (historyczny, zrealizowany wynik strategii vs. benchmark)
# — informacyjne porównanie, NIE prognoza ani porada inwestycyjna.
# ============================================================================
def compute_equity_curve(con, universe):
    """
    Buduje chained equity curve (start=100) ze zrealizowanych wag/cen zapisanych
    w portfolio_history po każdym rebalansie, obok benchmarku "kup i trzymaj cały
    indeks" (wazony biezacym FMC ze wszystkich kwalifikowanych skladnikow, nie
    tylko wybranych do portfela momentum).

    Ograniczenie danych: `prices` to rolling window (patrz fetch_data.py) liczone
    od "dzisiaj" wstecz, a nie od kazdej historycznej daty rebalansu — cena
    spolki, ktora dawno wypadla z selekcji, moze juz nie byc dostepna. W takim
    wypadku jej wklad w danym okresie jest pomijany (aproksymacja: 0%), a okres
    oznaczany jako `approximated=True`, zeby front-end mogl to zasygnalizowac.
    """
    hist = con.execute(f"""
        SELECT ref_date, ticker, weight, price_at_rebalance
        FROM portfolio_history WHERE universe = '{universe}'
        ORDER BY ref_date
    """).df()
    if hist.empty:
        return None
    ref_dates = sorted(hist["ref_date"].unique())
    if len(ref_dates) < 2:
        return None

    by_date = {d: hist[hist["ref_date"] == d].set_index("ticker") for d in ref_dates}

    dates_out = [pd.Timestamp(ref_dates[0]).strftime("%Y-%m-%d")]
    momentum_index = [100.0]
    approximated = [False]

    for t0, t1 in zip(ref_dates[:-1], ref_dates[1:]):
        snap0, snap1 = by_date[t0], by_date[t1]
        period_return = 0.0
        period_approx = False

        held = snap0.index.intersection(snap1.index)
        for t in held:
            w0, p0 = snap0.loc[t, "weight"], snap0.loc[t, "price_at_rebalance"]
            p1 = snap1.loc[t, "price_at_rebalance"]
            period_return += w0 * (p1 / p0 - 1)

        dropped = snap0.index.difference(snap1.index)
        if len(dropped) > 0:
            tickers_sql = ",".join(f"'{t}'" for t in dropped)
            t1_str = pd.Timestamp(t1).strftime("%Y-%m-%d")
            prices_t1 = con.execute(f"""
                SELECT Ticker, ARGMAX(Close, Date) AS price FROM prices
                WHERE Ticker IN ({tickers_sql}) AND Date <= DATE '{t1_str}' GROUP BY Ticker
            """).df().set_index("Ticker")["price"].to_dict()
            for t in dropped:
                w0, p0 = snap0.loc[t, "weight"], snap0.loc[t, "price_at_rebalance"]
                p1 = prices_t1.get(t)
                if p1 is None:
                    period_approx = True
                    continue
                period_return += w0 * (p1 / p0 - 1)

        dates_out.append(pd.Timestamp(t1).strftime("%Y-%m-%d"))
        momentum_index.append(momentum_index[-1] * (1 + period_return))
        approximated.append(period_approx)

    # --- Benchmark: "kup i trzymaj caly indeks", wazony biezacym FMC ---
    universe_df = con.execute(f"""
        SELECT Ticker, fmc_etf AS fmc FROM index_constituents
        WHERE Index_Name = '{universe}' AND fmc_etf IS NOT NULL
    """).df()
    total_fmc = universe_df["fmc"].sum() if not universe_df.empty else 0
    bench_weights = (dict(zip(universe_df["Ticker"], universe_df["fmc"] / total_fmc))
                      if total_fmc else {})

    bench_prices = {}
    if bench_weights:
        tickers_sql = ",".join(f"'{t}'" for t in bench_weights)
        for d in ref_dates:
            d_str = pd.Timestamp(d).strftime("%Y-%m-%d")
            df_p = con.execute(f"""
                SELECT Ticker, ARGMAX(Close, Date) AS price FROM prices
                WHERE Ticker IN ({tickers_sql}) AND Date <= DATE '{d_str}' GROUP BY Ticker
            """).df()
            bench_prices[d] = dict(zip(df_p["Ticker"], df_p["price"]))

    benchmark_index = [100.0]
    for t0, t1 in zip(ref_dates[:-1], ref_dates[1:]):
        p0map, p1map = bench_prices.get(t0, {}), bench_prices.get(t1, {})
        common = set(p0map) & set(p1map) & set(bench_weights)
        w_sum = sum(bench_weights[t] for t in common)
        if w_sum == 0:
            benchmark_index.append(benchmark_index[-1])
            continue
        ret = sum(bench_weights[t] / w_sum * (p1map[t] / p0map[t] - 1) for t in common)
        benchmark_index.append(benchmark_index[-1] * (1 + ret))

    return {
        "dates": dates_out,
        "momentum_index": [round(v, 3) for v in momentum_index],
        "benchmark_index": [round(v, 3) for v in benchmark_index],
        "approximated_periods": approximated,
        "note": ("Wynik historyczny (zrealizowany) selekcji momentum na bazie zapisów po "
                 "kazdym rebalansie, zestawiony z 'kup i trzymaj caly indeks' (wazony biezacym "
                 "FMC). Dane informacyjne, NIE prognoza ani porada inwestycyjna — wyniki z "
                 "przeszlosci nie gwarantuja przyszlych zwrotow. Okresy 'approximated' obejmuja "
                 "spolki, dla ktorych brakuje juz historycznej ceny (rolling window w `prices`)."),
    }


def export_equity_curve(con, docs_data_dir):
    payload = {}
    for universe in UNIVERSES:
        curve = compute_equity_curve(con, universe)
        if curve is not None:
            payload[universe] = curve
    out_path = Path(docs_data_dir) / "equity_curve.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"💾 Wyeksportowano {out_path} ({len(payload)} uniwersów z wystarczającą historią).")


# ============================================================================
# GLOBAL EQUITY MOMENTUM: porównanie zwrotu POZIOMU INDEKSU (nie składników,
# tabela `index_prices` z fetch_data.py) między SP500/NASDAQ100/DOWJONES w
# oknie GEM_LOOKBACK_MONTHS — klasyczna idea "dual/global equity momentum":
# spośród kilku rynków akcji wybierz ten z najsilniejszym trendem. Zwycięzcą
# jest indeks o najwyższym zwrocie; dla niego liczymy TOP liderów — spółki,
# których wzrost ceny realnie "pchnął" indeks w górę (wkład = waga w indeksie
# wg fmc_etf x zwrot spółki w TYM SAMYM oknie), a nie po prostu najsilniejsze
# momentum_score (to faworyzowałoby małe, skrajnie zmienne nazwy bez względu
# na ich realny wpływ na indeks).
# ============================================================================
def compute_index_returns(con, ref_date, lookback_months=GEM_LOOKBACK_MONTHS):
    has_table = con.execute("""
        SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'index_prices'
    """).fetchone()[0] > 0
    if not has_table:
        return []

    df = con.execute(f"""
        WITH params AS (SELECT DATE '{ref_date}' AS ref_date)
        SELECT
            Index_Name,
            ARGMAX(Close, Date) FILTER (WHERE Date <= (SELECT ref_date FROM params)) AS price_now,
            MAX(Date) FILTER (WHERE Date <= (SELECT ref_date FROM params)) AS date_now,
            ARGMAX(Close, Date) FILTER (
                WHERE Date <= (SELECT ref_date FROM params) - INTERVAL '{lookback_months} MONTHS'
            ) AS price_start,
            MAX(Date) FILTER (
                WHERE Date <= (SELECT ref_date FROM params) - INTERVAL '{lookback_months} MONTHS'
            ) AS date_start
        FROM index_prices
        GROUP BY Index_Name
    """).df()

    records = []
    for _, r in df.iterrows():
        if pd.isna(r["price_now"]) or pd.isna(r["price_start"]) or r["price_start"] == 0:
            continue
        records.append({
            "universe": r["Index_Name"],
            "yf_symbol": INDEX_LEVEL_SYMBOLS.get(r["Index_Name"], ""),
            "price_now": round(float(r["price_now"]), 2),
            "date_now": str(r["date_now"]),
            "price_start": round(float(r["price_start"]), 2),
            "date_start": str(r["date_start"]),
            "return_pct": round(float(r["price_now"] / r["price_start"] - 1) * 100, 2),
        })
    return sorted(records, key=lambda r: r["return_pct"], reverse=True)


def compute_index_leaders(con, universe, ref_date, lookback_months=GEM_LOOKBACK_MONTHS, top_n=GEM_TOP_N):
    """Top `top_n` spółek zwycięskiego indeksu wg wkładu w jego zwrot
    (waga_w_indeksie x zwrot_spółki w tym samym oknie co compute_index_returns) —
    to one w tym momencie "pchają" cenę indeksu na nowe szczyty."""
    df = con.execute(f"""
        WITH params AS (SELECT DATE '{ref_date}' AS ref_date),
        uni AS (
            SELECT Ticker, Sector, fmc_etf FROM index_constituents
            WHERE Index_Name = '{universe}' AND fmc_etf IS NOT NULL
        ),
        px AS (
            SELECT p.Ticker,
                   ARGMAX(p.Close, p.Date) FILTER (WHERE p.Date <= (SELECT ref_date FROM params)) AS price_now,
                   ARGMAX(p.Close, p.Date) FILTER (
                       WHERE p.Date <= (SELECT ref_date FROM params) - INTERVAL '{lookback_months} MONTHS'
                   ) AS price_start
            FROM prices p
            JOIN uni u ON p.Ticker = u.Ticker
            GROUP BY p.Ticker
        )
        SELECT u.Ticker, u.Sector, u.fmc_etf, px.price_now, px.price_start
        FROM uni u JOIN px ON px.Ticker = u.Ticker
        WHERE px.price_now IS NOT NULL AND px.price_start IS NOT NULL AND px.price_start > 0
    """).df()
    if df.empty:
        return []

    total_fmc = df["fmc_etf"].sum()
    df["weight_in_index_pct"] = df["fmc_etf"] / total_fmc * 100
    df["return_pct"] = (df["price_now"] / df["price_start"] - 1) * 100
    df["contribution_pct"] = df["fmc_etf"] / total_fmc * (df["price_now"] / df["price_start"] - 1) * 100
    df = df.sort_values("contribution_pct", ascending=False).head(top_n).reset_index(drop=True)

    records = []
    for i, r in df.iterrows():
        records.append({
            "rank": i + 1,
            "ticker": r["Ticker"],
            "sector": r["Sector"],
            "price": round(float(r["price_now"]), 2),
            "return_pct": round(float(r["return_pct"]), 2),
            "weight_in_index_pct": round(float(r["weight_in_index_pct"]), 3),
            "contribution_pct": round(float(r["contribution_pct"]), 3),
        })
    return records


def export_global_equity_momentum(con, ref_date, docs_data_dir,
                                   lookback_months=GEM_LOOKBACK_MONTHS, top_n=GEM_TOP_N):
    index_returns = compute_index_returns(con, ref_date, lookback_months)
    if not index_returns:
        print("❌ Brak danych Global Equity Momentum (index_prices) — uruchom najpierw fetch_data.py.")
        return

    winner = index_returns[0]["universe"]
    leaders = compute_index_leaders(con, winner, ref_date, lookback_months, top_n)

    payload = {
        "ref_date": ref_date,
        "lookback_months": lookback_months,
        "indices": index_returns,
        "winner": winner,
        "leaders": leaders,
        "note": (f"Zwrot POZIOMU INDEKSU (nie pojedynczych składników) w oknie {lookback_months} mies. "
                 "dla SP500/NASDAQ100/DOWJONES — klasyczna idea Global/Dual Equity Momentum: spośród "
                 "kilku rynków wybierz ten z najsilniejszym trendem. Zwycięzcą jest indeks o najwyższym "
                 f"zwrocie. Lista 'leaders' to top {top_n} spółek zwycięskiego indeksu wg wkładu w jego "
                 "zwrot (waga spółki w indeksie x jej zwrot w tym samym oknie) — czyli spółki, które "
                 "realnie pchnęły cenę indeksu w górę, a nie po prostu te o najwyższym własnym zwrocie. "
                 "Dane informacyjne, NIE porada inwestycyjna."),
    }
    out_path = Path(docs_data_dir) / "global_equity_momentum.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"💾 Wyeksportowano {out_path} — zwycięzca: {winner} "
          f"({index_returns[0]['return_pct']:+.2f}%), {len(leaders)} liderów.")


def main():
    parser = argparse.ArgumentParser(
        description="Oblicza S&P-style Momentum dla SP500/NASDAQ100/DOWJONES "
                     "i generuje statyczną stronę (docs/) pod GitHub Pages."
    )
    parser.add_argument("--ref-date", type=str, default=None,
                         help="Data referencyjna rebalansu YYYY-MM-DD. Domyślnie: MAX(Date) w tabeli prices.")
    parser.add_argument("--min-trading-days", type=int, default=150)
    parser.add_argument("--max-staleness-days", type=int, default=10)
    parser.add_argument("--docs-dir", type=str, default="docs",
                         help="Katalog strony pod GitHub Pages (domyślnie 'docs' obok run_query.py).")
    args = parser.parse_args()

    con = duckdb.connect("momentum_data.duckdb")
    # Migracja jednorazowa: koszyk top-momentum zostal usuniety (patrz historia
    # gita) — porzucona tabela z poprzednich uruchomien nie jest juz tworzona
    # ani czytana przez zaden kod, wiec usuwamy ja z trwalej bazy.
    con.execute("DROP TABLE IF EXISTS top_basket_history")

    if args.ref_date:
        ref_date = args.ref_date
    else:
        result = con.execute("SELECT MAX(Date) FROM prices").fetchone()[0]
        if result is None:
            print("❌ Brak danych cenowych. Uruchom najpierw fetch_data.py.")
            sys.exit(1)
        ref_date = pd.to_datetime(result).strftime("%Y-%m-%d")

    print(f"📅 Data referencyjna rebalansu: {ref_date}")

    docs_data_dir = str(Path(args.docs_dir) / "data")
    Path(docs_data_dir).mkdir(parents=True, exist_ok=True)

    for universe in UNIVERSES:
        process_universe(con, universe, ref_date, args, docs_data_dir)

    export_all_prices(con, ref_date, docs_data_dir)
    export_equity_curve(con, docs_data_dir)
    export_global_equity_momentum(con, ref_date, docs_data_dir)
    con.close()


if __name__ == "__main__":
    main()
