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
TOP_BASKET_SP500_N = 20      # ile najsilniejszych spolek wg momentum score z SP500 w koszyku
TOP_BASKET_NASDAQ100_N = 5   # jw. dla NASDAQ100 (DOWJONES pominiety - tam nie ma selekcji)
TOP_BASKET_REBALANCE_MONTHS = 6   # sklad koszyka zmienia sie tylko co tyle miesiecy (ograniczenie rotacji);
                                   # ceny/momentum wyswietlane dla trzymanych spolek i tak odswiezane co miesiac

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
    # target_count = round(TARGET_QUINTILE * n)
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
# MAŁY KOSZYK "TOP MOMENTUM" (proxy dla quality bez pobierania danych
# fundamentalnych) — łączy najsilniejsze spółki wg momentum score z SP500
# i NASDAQ100 (DOWJONES pominięty: tam nie ma selekcji kwintylowej, wszystkie
# 30 spółek ma równą wagę). Założenie: liderzy momentum w dużych, płynnych
# indeksach w praktyce mocno pokrywają się z quality (duże, stabilne, zyskowne
# spółki) — bez dokładania nowego źródła danych do pipeline'u.
# ============================================================================
def build_top_basket(df_sp500, df_nasdaq100, sp500_n=TOP_BASKET_SP500_N, nasdaq100_n=TOP_BASKET_NASDAQ100_N):
    sources = []
    if df_sp500 is not None and not df_sp500.empty:
        sources.append(("SP500", df_sp500.sort_values("momentum_score", ascending=False).head(sp500_n)))
    if df_nasdaq100 is not None and not df_nasdaq100.empty:
        sources.append(("NASDAQ100", df_nasdaq100.sort_values("momentum_score", ascending=False).head(nasdaq100_n)))

    combined = {}
    for universe_name, df in sources:
        for _, r in df.iterrows():
            ticker = r["Ticker"]
            entry = combined.get(ticker)
            if entry is None:
                combined[ticker] = {
                    "ticker": ticker,
                    "sector": r["Sector"],
                    "price": float(r["price_now"]),
                    "momentum_pct": float(r["momentum_value"]) * 100,
                    "volatility_pct": float(r["annualized_volatility"]) * 100,
                    "universes": [universe_name],
                    "stale": False,
                }
            else:
                entry["universes"].append(universe_name)

    records = sorted(combined.values(), key=lambda x: x["momentum_pct"], reverse=True)
    for i, rec in enumerate(records, start=1):
        rec["rank"] = i
        rec["price"] = round(rec["price"], 2)
        rec["momentum_pct"] = round(rec["momentum_pct"], 2)
        rec["volatility_pct"] = round(rec["volatility_pct"], 2)
    return records


def _ensure_top_basket_table(con):
    con.execute("""
        CREATE TABLE IF NOT EXISTS top_basket_rebalances (
            ref_date DATE, ticker VARCHAR, sector VARCHAR, universes VARCHAR,
            price DOUBLE, momentum_pct DOUBLE, volatility_pct DOUBLE, rank INTEGER,
            PRIMARY KEY (ref_date, ticker)
        )
    """)


def persist_top_basket_rebalance(con, ref_date, records):
    """Zapisuje sklad koszyka wybrany PRZY REBALANSIE (trwale, jak portfolio_history) —
    to on decyduje, ktore spolki sa 'trzymane' az do kolejnego rebalansu za
    TOP_BASKET_REBALANCE_MONTHS miesiecy, niezaleznie od comiesiecznych przeliczen."""
    _ensure_top_basket_table(con)
    con.execute(f"DELETE FROM top_basket_rebalances WHERE ref_date = DATE '{ref_date}'")
    df = pd.DataFrame([{  # noqa: F841 -- referenced by name in the SQL string below (duckdb frame scan)
        "ref_date": pd.Timestamp(ref_date).date(),
        "ticker": r["ticker"],
        "sector": r["sector"],
        "universes": ",".join(r["universes"]),
        "price": r["price"],
        "momentum_pct": r["momentum_pct"],
        "volatility_pct": r["volatility_pct"],
        "rank": r["rank"],
    } for r in records])
    con.execute("INSERT INTO top_basket_rebalances SELECT * FROM df")


def refresh_top_basket_metrics(con, ref_date, members_df):
    """Dla spolek trzymanych od ostatniego rebalansu koszyka: odswieza cene/momentum/
    zmiennosc z portfolio_history na biezacy ref_date (co dzieje sie co miesiac,
    razem z reszta pipeline'u), bez zmiany SKLADU koszyka. Jesli spolka danego
    miesiaca wypadla z kwintylowej selekcji swojego uniwersum (brak wiersza w
    portfolio_history na ten ref_date), bierzemy jej najswiezsze dostepne dane
    wczesniejsze i oznaczamy rekord jako 'stale'."""
    if members_df.empty:
        return []

    tickers_sql = ", ".join(f"'{t}'" for t in members_df["ticker"])
    df_metrics = con.execute(f"""
        SELECT ticker,
               ARGMAX(price_at_rebalance, ref_date) AS price,
               ARGMAX(momentum_value, ref_date) AS momentum_value,
               ARGMAX(annualized_volatility, ref_date) AS annualized_volatility,
               MAX(ref_date) AS last_data_date
        FROM portfolio_history
        WHERE ticker IN ({tickers_sql}) AND ref_date <= DATE '{ref_date}'
        GROUP BY ticker
    """).df().set_index("ticker")

    ref_date_norm = pd.Timestamp(ref_date).date()
    records = []
    for _, m in members_df.iterrows():
        ticker = m["ticker"]
        rec = {"ticker": ticker, "sector": m["sector"], "universes": m["universes"].split(",")}
        if ticker in df_metrics.index:
            row = df_metrics.loc[ticker]
            rec["price"] = round(float(row["price"]), 2)
            rec["momentum_pct"] = round(float(row["momentum_value"]) * 100, 2)
            rec["volatility_pct"] = round(float(row["annualized_volatility"]) * 100, 2)
            rec["stale"] = pd.Timestamp(row["last_data_date"]).date() != ref_date_norm
        else:
            rec["price"] = None
            rec["momentum_pct"] = None
            rec["volatility_pct"] = None
            rec["stale"] = True
        records.append(rec)

    records.sort(key=lambda r: (r["momentum_pct"] is None, -(r["momentum_pct"] or 0)))
    for i, rec in enumerate(records, start=1):
        rec["rank"] = i
    return records


def resolve_top_basket(con, ref_date, df_sp500, df_nasdaq100, rebalance_every_months=TOP_BASKET_REBALANCE_MONTHS):
    """Decyduje, czy sklad koszyka top-momentum ma zostac dzis PRZEBUDOWANY (rebalans,
    co ~rebalance_every_months miesiecy — to ogranicza rotacje/koszty transakcyjne),
    czy tylko ODSWIEZONY danymi (co dzieje sie co miesiac, przy kazdym uruchomieniu
    run_query.py, niezaleznie od tego czy dzis jest dzien rebalansu)."""
    _ensure_top_basket_table(con)
    last_rebalance_date = con.execute(
        f"SELECT MAX(ref_date) FROM top_basket_rebalances WHERE ref_date <= DATE '{ref_date}'"
    ).fetchone()[0]

    due = last_rebalance_date is None
    months_elapsed = None
    if not due:
        months_elapsed = (pd.Period(pd.Timestamp(ref_date), freq="M")
                           - pd.Period(pd.Timestamp(last_rebalance_date), freq="M")).n
        due = months_elapsed >= rebalance_every_months

    if due:
        records = build_top_basket(df_sp500, df_nasdaq100)
        persist_top_basket_rebalance(con, ref_date, records)
        rebalance_ref_date = ref_date
        print(f"🔁 Koszyk top-momentum: rebalans składu ("
              f"{'pierwszy' if last_rebalance_date is None else f'poprzedni {last_rebalance_date}, {months_elapsed} mies. temu'}"
              f") → {len(records)} spółek wybranych na {ref_date}.")
    else:
        members_df = con.execute(f"""
            SELECT ticker, sector, universes FROM top_basket_rebalances
            WHERE ref_date = DATE '{last_rebalance_date}' ORDER BY rank
        """).df()
        records = refresh_top_basket_metrics(con, ref_date, members_df)
        rebalance_ref_date = str(last_rebalance_date)
        next_due_in = rebalance_every_months - months_elapsed
        print(f"📌 Koszyk top-momentum: bez rebalansu (ostatni {last_rebalance_date}, kolejny za "
              f"{next_due_in} mies.) — odświeżono ceny/momentum {len(records)} trzymanych spółek na {ref_date}.")

    return records, due, rebalance_ref_date


def export_top_basket(records, ref_date, docs_data_dir, rebalanced, rebalance_ref_date,
                       sp500_n=TOP_BASKET_SP500_N, nasdaq100_n=TOP_BASKET_NASDAQ100_N,
                       rebalance_every_months=TOP_BASKET_REBALANCE_MONTHS):
    n_overlap = sum(1 for r in records if len(r["universes"]) > 1)
    next_rebalance_ref_date = (pd.Timestamp(rebalance_ref_date)
                                + pd.DateOffset(months=rebalance_every_months)).date().isoformat()
    payload = {
        "ref_date": ref_date,
        "sp500_top_n": sp500_n,
        "nasdaq100_top_n": nasdaq100_n,
        "rebalance_every_months": rebalance_every_months,
        "rebalanced_today": rebalanced,
        "last_rebalance_ref_date": rebalance_ref_date,
        "next_rebalance_ref_date": next_rebalance_ref_date,
        "n_tickers": len(records),
        "n_overlap": n_overlap,
        "note": (f"Koncentrowany koszyk łączący top-momentum liderów z SP500 (top {sp500_n}) "
                 f"i NASDAQ100 (top {nasdaq100_n}) wg momentum score. Bez DOWJONES (tam nie ma "
                 "selekcji kwintylowej). Nie jest to osobna strategia quality - to proxy: liderzy "
                 "momentum w dużych indeksach zwykle pokrywają się z dużymi, stabilnymi, "
                 f"zyskownymi spółkami, bez pobierania dodatkowych danych fundamentalnych. Skład "
                 f"koszyka zmienia się (rebalans) tylko raz na {rebalance_every_months} miesięcy, żeby "
                 "ograniczyć rotację — ceny/momentum/zmienność wyświetlane dla trzymanych spółek są "
                 "mimo to odświeżane co miesiąc, razem z resztą danych."),
        "constituents": records,
    }
    out_path = Path(docs_data_dir) / "top_basket.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"💾 Wyeksportowano {out_path} ({len(records)} spółek, {n_overlap} pokrywających się w obu indeksach).")


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

    results = {}
    for universe in UNIVERSES:
        results[universe] = process_universe(con, universe, ref_date, args, docs_data_dir)

    top_basket_records, top_basket_rebalanced, top_basket_rebalance_ref_date = resolve_top_basket(
        con, ref_date, results.get("SP500"), results.get("NASDAQ100")
    )
    export_top_basket(top_basket_records, ref_date, docs_data_dir,
                       rebalanced=top_basket_rebalanced, rebalance_ref_date=top_basket_rebalance_ref_date)

    export_all_prices(con, ref_date, docs_data_dir)
    con.close()


if __name__ == "__main__":
    main()
