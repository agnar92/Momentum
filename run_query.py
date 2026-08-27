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
   fetch_data.py) + mark-to-market poprzedniego miesiaca do
   portfolio_returns (do liczenia krzywej equity, CAGR, max drawdown).
8. Eksport JSON dla strony (docs/data/*.json) + wygenerowanie statycznych
   plikow strony (docs/index.html, docs/portfolio.html, docs/css/*, docs/js/*).
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
            STDDEV(dr.daily_return) FILTER (
                WHERE dr.Date > (SELECT ref_date FROM params) - INTERVAL '12 MONTHS'
                  AND dr.Date <= (SELECT ref_date FROM params)
            ) * SQRT(252) AS annualized_volatility,
            COUNT(dr.daily_return) FILTER (
                WHERE dr.Date > (SELECT ref_date FROM params) - INTERVAL '12 MONTHS'
                  AND dr.Date <= (SELECT ref_date FROM params)
            ) AS trading_days_12m,
            COUNT(dr.daily_return) FILTER (
                WHERE dr.Date > (SELECT ref_date FROM params) - INTERVAL '9 MONTHS'
                  AND dr.Date <= (SELECT ref_date FROM params)
            ) AS trading_days_9m
        FROM daily_returns dr
        GROUP BY dr.Ticker
    ),
    momentum AS (
        SELECT
            Ticker, last_price_date, price_now, annualized_volatility,
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
    df["rank"] = df["momentum_score"].rank(ascending=False, method="first").astype(int)
    df = df.sort_values("rank")
    return df


# ============================================================================
# 5: SELEKCJA Z REGUŁĄ BUFORA (sekcja "Constituent Selection")
# ============================================================================
def select_with_buffer(df_ranked, current_tickers):
    n = len(df_ranked)
    target_count = round(TARGET_QUINTILE * n)
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
def compute_weights(df_selected, df_full_universe):
    """
    Waga surowa_i = FMC_i * momentum_score_i, znormalizowana do sumy 1.
    Cap_i = min(9%, 3 * waga_kapitalizacyjna_i_w_calym_uniwersum).
    Iteracyjna redystrybucja nadwyżki ponad cap do niekapowanych, proporcjonalnie.
    """
    df = df_selected.copy()
    total_fmc_universe = df_full_universe["fmc"].sum()
    df["cap_weight_universe"] = df["fmc"] / total_fmc_universe

    raw = df["fmc"] * df["momentum_score"]
    weights = raw / raw.sum()
    caps = np.minimum(MAX_WEIGHT, CAP_MULTIPLE * df["cap_weight_universe"].values)
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

    selected_tickers, target_count = select_with_buffer(df_ranked, current_tickers)
    print(f"Uniwersum: {len(df_ranked)} spółek kwalifikowanych. Target (kwintyl 20%): "
          f"{target_count}. Wybrano: {len(selected_tickers)}.")

    df_selected = df_ranked[df_ranked["Ticker"].isin(selected_tickers)].copy()
    if df_selected.empty:
        print(f"❌ Brak wybranych spółek dla {universe}.")
        return None

    df_weighted = compute_weights(df_selected, df_ranked)
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

    # --- Mark-to-market poprzedniego miesiąca -> portfolio_returns ---
    if prev_ref_date is not None:
        compute_realized_return(con, universe, str(prev_ref_date), ref_date)

    # --- Turnover ---
    if current_tickers:
        new_n = len(selected_tickers - current_tickers)
        dropped_n = len(current_tickers - selected_tickers)
        print(f"🔁 Turnover vs {prev_ref_date}: {new_n} nowych, {dropped_n} wypadło "
              f"(z {len(current_tickers)} poprzednich).")

    # --- Eksport JSON dla strony ---
    export_json(df_weighted, universe, ref_date, docs_data_dir, n_missing_fmc)

    return df_weighted


def compute_realized_return(con, universe, prev_ref_date, curr_ref_date):
    """
    Mark-to-market: liczy zrealizowany zwrot portfela z poprzedniego miesiąca
    NA BAZIE aktualnej tabeli `prices` (która wciąż zawiera obie daty, bo
    rolling window ma 15 miesięcy) i PERSYSTUJE go na stałe. Dzięki temu
    krzywa equity przetrwa kolejne comiesięczne reinity tabeli prices.
    """
    con.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_returns (
            period_start DATE, period_end DATE, universe VARCHAR,
            return_pct DOUBLE, n_holdings INTEGER, n_priced INTEGER,
            PRIMARY KEY (period_start, period_end, universe)
        )
    """)
    prev = con.execute(f"""
        SELECT ticker, weight FROM portfolio_history
        WHERE universe = '{universe}' AND ref_date = DATE '{prev_ref_date}'
    """).df()
    if prev.empty:
        return
    tickers = tuple(prev["ticker"]) if len(prev) > 1 else (prev["ticker"].iloc[0], prev["ticker"].iloc[0])
    prices = con.execute(f"""
        SELECT Ticker,
            ARGMAX(Close, Date) FILTER (WHERE Date <= DATE '{prev_ref_date}') AS price_start,
            ARGMAX(Close, Date) FILTER (WHERE Date <= DATE '{curr_ref_date}') AS price_end
        FROM prices WHERE Ticker IN {tickers}
        GROUP BY Ticker
    """).df()
    merged = prev.merge(prices, left_on="ticker", right_on="Ticker", how="left")
    merged["stock_return"] = merged["price_end"] / merged["price_start"] - 1
    missing = merged["stock_return"].isna().sum()
    if missing > 0:
        print(f"⚠️  {missing} spółek bez ceny do mark-to-market (prawdopodobnie delisting/błąd danych) "
              f"— traktowane jako 0% w tym okresie.")
    merged["stock_return"] = merged["stock_return"].fillna(0.0)
    portfolio_return = float((merged["weight"] * merged["stock_return"]).sum())

    con.execute(f"""
        INSERT INTO portfolio_returns VALUES
        (DATE '{prev_ref_date}', DATE '{curr_ref_date}', '{universe}', {portfolio_return},
         {len(merged)}, {int(merged['stock_return'].notna().sum())})
        ON CONFLICT (period_start, period_end, universe)
        DO UPDATE SET return_pct = EXCLUDED.return_pct
    """)
    print(f"💰 Zrealizowany zwrot {universe} za okres {prev_ref_date} → {curr_ref_date}: "
          f"{portfolio_return * 100:.2f}%")


def export_json(df_weighted, universe, ref_date, docs_data_dir, n_missing_fmc):
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
    }
    out_path = Path(docs_data_dir) / f"{universe.lower()}.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"💾 Wyeksportowano {out_path}")


# ============================================================================
# KRZYWA EQUITY / CAGR / MAX DRAWDOWN -> docs/data/portfolio.json
# ============================================================================
def export_portfolio_curve(con, docs_data_dir):
    con.execute("""
        CREATE TABLE IF NOT EXISTS portfolio_returns (
            period_start DATE, period_end DATE, universe VARCHAR,
            return_pct DOUBLE, n_holdings INTEGER, n_priced INTEGER,
            PRIMARY KEY (period_start, period_end, universe)
        )
    """)
    df = con.execute("""
        SELECT period_end, universe, return_pct FROM portfolio_returns ORDER BY period_end
    """).df()
    if df.empty:
        print("ℹ️  Brak jeszcze żadnego zrealizowanego okresu — krzywa equity pojawi się od drugiego rebalansu.")
        payload = {"universes": {}, "blended": {"dates": [], "equity_pct": [], "cagr_pct": None, "max_drawdown_pct": None}}
        Path(docs_data_dir, "portfolio.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return

    result = {"universes": {}}
    all_curves = []

    for universe in df["universe"].unique():
        sub = df[df["universe"] == universe].sort_values("period_end")
        equity = (1 + sub["return_pct"]).cumprod()
        running_max = equity.cummax()
        drawdown = equity / running_max - 1
        n_periods = len(sub)
        n_years = n_periods / 12.0
        cagr = (equity.iloc[-1]) ** (1 / n_years) - 1 if n_years > 0 and equity.iloc[-1] > 0 else None

        result["universes"][universe] = {
            "dates": sub["period_end"].astype(str).tolist(),
            "equity_pct": [round((e - 1) * 100, 3) for e in equity],
            "drawdown_pct": [round(d * 100, 3) for d in drawdown],
            "cagr_pct": round(cagr * 100, 2) if cagr is not None else None,
            "max_drawdown_pct": round(drawdown.min() * 100, 2),
        }
        all_curves.append(sub.set_index("period_end")["return_pct"].rename(universe))

    # Blended = równa waga 3 uniwersów (tam gdzie dane dostępne w danym okresie)
    blended_df = pd.concat(all_curves, axis=1)
    blended_returns = blended_df.mean(axis=1, skipna=True)
    equity_b = (1 + blended_returns).cumprod()
    running_max_b = equity_b.cummax()
    drawdown_b = equity_b / running_max_b - 1
    n_years_b = len(blended_returns) / 12.0
    cagr_b = (equity_b.iloc[-1]) ** (1 / n_years_b) - 1 if n_years_b > 0 and equity_b.iloc[-1] > 0 else None

    result["blended"] = {
        "dates": [pd.Timestamp(d).strftime("%Y-%m-%d") for d in blended_returns.index],
        "equity_pct": [round((e - 1) * 100, 3) for e in equity_b],
        "drawdown_pct": [round(d * 100, 3) for d in drawdown_b],
        "cagr_pct": round(cagr_b * 100, 2) if cagr_b is not None else None,
        "max_drawdown_pct": round(drawdown_b.min() * 100, 2),
    }

    Path(docs_data_dir, "portfolio.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"💾 Wyeksportowano portfolio.json ({len(df)} zrealizowanych okresów łącznie).")


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

    export_portfolio_curve(con, docs_data_dir)
    con.close()


if __name__ == "__main__":
    main()
