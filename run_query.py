"""
run_query.py
============
CAŁA logika obliczeniowa (pełna metodologia S&P Momentum: momentum value,
z-score, momentum score, selekcja kwintylowa z buforem, wagi FMC z capami)
ORAZ generowanie statycznej strony (HTML/CSS/JS + eksport danych JSON) do
katalogu docs/ pod GitHub Pages.

Zgodnie z ustaleniami: fetch_data.py odpowiada WYŁĄCZNIE za pobieranie
danych (ceny z yfinance, skład indeksów + FMC z kolumny 'Market Value'
w plikach CSV holdings ETF-ów CSPX/CNDX/CIND; skład WIG20/mWIG40 z ręcznie
utrzymywanych plików JSON, bez FMC — patrz fetch_data.py::JSON_INDEX_MAP).
Ten plik odpowiada za WSZYSTKO inne: obliczenia + generowanie strony.

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
   Kazda spolka w KAZDYM uniwersum (nie tylko liderzy Sily Relatywnej, patrz pkt
   10) ma tez wlasny "weekly_chart"/"mansfield_chart" — patrz process_universe.
9. Global Equity Momentum: zwrot POZIOMU INDEKSU (tabela index_prices z
   fetch_data.py) dla NASDAQ100/DOWJONES (GEM_UNIVERSES — celowo bez SP500/
   WIG20/mWIG40, patrz komentarz przy GEM_UNIVERSES) w oknie GEM_LOOKBACK_MONTHS,
   wybor zwyciezcy (najwyzszy zwrot) i top GEM_TOP_N liderow zwycieskiego indeksu
   wg wkladu w jego zwrot — patrz export_global_equity_momentum.
10. Sila relatywna dla SP500/NASDAQ100/DOWJONES/WIG20/MWIG40 (RELATIVE_STRENGTH_
    UNIVERSES): momentum kazdej spolki (TO SAMO okno co momentum_value glownych
    uniwersow, M-14/M-2 z fallbackiem M-11/M-2) vs. momentum samego
    indeksu w tym samym oknie, tylko spolki bijace indeks, posortowane malejaco
    po przewadze — patrz export_relative_strength. Kazdy lider ma tez, od poczatku
    tego samego okna, "wykres 10:30" w stylu stage analysis (Weinstein/Dr Eric Wish):
    cena spolki + SMA 10-tyg./30-tyg. i poziom wlasnego indeksu, wszystko przeliczone
    na % zmiany wzgledem poczatku okna (close_pct/sma10_pct/sma30_pct/index_pct), zeby
    jednym spojrzeniem bylo widac czy spolka rosnie szybciej niz jej rynek — plus
    KAZDY wyswietlany tydzien niesie tez wlasna klasyfikacje etapu Weinsteina (Etap
    1/2A/2B/3/4), sygnal wejscia/wyjscia i potwierdzenie wolumenem (volume/
    volume_ratio/stage/signal — patrz _compute_weinstein_stage_series) — patrz
    compute_relative_strength_chart — oraz "mansfield_chart": oscylator Mansfield RS
    w dwoch wygladzeniach (krotkoterminowym ~3 mies. i srednioterminowym ~6 mies.) na
    WLASNYM, znacznie krotszym oknie (ostatnie ~6 mies., odczepione od okna momentum) —
    patrz compute_mansfield_rs_chart — do wykresu innego niz TradingView. Te same dwa
    pola sa tez doliczane KAZDEJ spolce w glownym eksporcie per-uniwersum (nie tylko
    liderom RS, patrz pkt 8/process_universe) — na dashboardzie przelacznik "Sila
    Relatywna" jest wiec dostepny dla kazdej spolki, nie tylko tych z panelu RS.

WIG20 i mWIG40 (GPW) sa uniwersami "rownowagowymi" — tak jak DOWJONES, ale z
innego powodu: nie ma ETF-u z publikowanymi holdings dla indeksow GPW, wiec
skladniki pochodza z reczne utrzymywanego JSON-a bez wag kapitalizacyjnych
(patrz EQUAL_WEIGHT_UNIVERSES, fetch_data.py::JSON_INDEX_MAP). Wszystkie
kwalifikujace sie skladniki sa uzywane bez selekcji kwintylowej (jak DOWJONES),
rownomiernie wazone.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES", "WIG20", "MWIG40"]
TARGET_QUINTILE = 0.20   # top 20% wg momentum score
BUFFER_LOWER = 0.80      # automatyczna selekcja top 80% targetu
BUFFER_UPPER = 1.20      # obecne skladniki reselekcjonowane do 120% targetu
MAX_WEIGHT = 0.09        # 9% max na spolke
CAP_MULTIPLE = 3.0       # nie wiecej niz 3x waga kapitalizacyjna w uniwersum
MAX_HOLDINGS = 100
# Uniwersa bez realnych wag kapitalizacyjnych (fmc_etf) — DOWJONES bo DJIA jest
# indeksem wazonym cena (nie kapitalizacja), WIG20/MWIG40 bo nie ma ETF-u z
# publikowanymi holdings dla indeksow GPW (skladniki wczytywane z reczne
# utrzymywanego JSON, patrz fetch_data.py::JSON_INDEX_MAP) — wszystkie trzy sa
# wiec wazone rownomiernie zamiast FMC x momentum_score, patrz compute_weights.
# SP500 (jak NASDAQ100) ma realne wagi z 'Market Value' (CSPX_holdings.csv),
# wiec NIE jest tutaj — kwintylowa selekcja + wagi FMC x momentum_score.
EQUAL_WEIGHT_UNIVERSES = {"DOWJONES", "WIG20", "MWIG40"}
GEM_LOOKBACK_MONTHS = 12   # okno zwrotu poziomu indeksu dla Global Equity Momentum
GEM_TOP_N = 10             # ilu liderow (najwiekszy wklad w zwrot) pokazujemy dla zwycieskiego indeksu
# Global Equity Momentum porownuje TYLKO te 2 uniwersa (rynek USA, rdzen
# pierwotnego zestawu) miedzy soba — SP500/WIG20/MWIG40 maja wlasne dane w
# index_prices (potrzebne do Sily Relatywnej), ale celowo NIE uczestnicza w tym
# wyscigu: SP500 zostal przywrocony do narzedzia WYLACZNIE jako uniwersum
# momentum + ekran Sily Relatywnej (na zyczenie), bez zmiany istniejacego
# zachowania GEM; WIG20/MWIG40 z tego samego powodu, co dodatkowo nie zmienia
# zachowania GEM przy rozszerzeniu na rynek polski.
GEM_UNIVERSES = ["NASDAQ100", "DOWJONES"]
INDEX_LEVEL_SYMBOLS = {
    "SP500": "^GSPC", "NASDAQ100": "^NDX", "DOWJONES": "^DJI",
    "WIG20": "WIG20.WA", "MWIG40": "MWIG40.WA",
}

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

    if universe in EQUAL_WEIGHT_UNIVERSES:
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
    if universe in EQUAL_WEIGHT_UNIVERSES:
        selected_tickers = set(df_ranked["Ticker"])
        target_count = len(selected_tickers)
    else:
        selected_tickers, target_count = select_with_buffer(df_ranked, current_tickers)
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

    # --- Wykresy "10:30" + Mansfield RS dla KAŻDEJ spółki w uniwersum (nie tylko
    # liderów panelu Siły Relatywnej) — to samo okno co index_mom w
    # export_relative_strength, żeby uniknąć osobnego, rozjeżdżającego się okna. ---
    weekly_charts, mansfield_charts = {}, {}
    index_mom = compute_index_momentum(con, universe, ref_date)
    if index_mom is not None:
        for ticker in df_weighted["Ticker"]:
            weekly_charts[ticker] = compute_relative_strength_chart(con, ticker, universe,
                                                                       ref_date, index_mom["date_start"])
            mansfield_charts[ticker] = compute_mansfield_rs_chart(con, ticker, universe, ref_date)

    # --- Eksport JSON dla strony ---
    export_json(df_weighted, universe, ref_date, docs_data_dir, n_missing_fmc,
                prev_ref_date, added_tickers, dropped_tickers, weekly_charts, mansfield_charts)

    return df_weighted


def export_json(df_weighted, universe, ref_date, docs_data_dir, n_missing_fmc,
                 prev_ref_date=None, added_tickers=None, dropped_tickers=None,
                 weekly_charts=None, mansfield_charts=None):
    weekly_charts = weekly_charts or {}
    mansfield_charts = mansfield_charts or {}
    records = []
    for _, r in df_weighted.iterrows():
        weekly_chart = weekly_charts.get(r["Ticker"])
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
            "weekly_chart": weekly_chart,
            "mansfield_chart": mansfield_charts.get(r["Ticker"]),
        })
    cap_scaled = bool(df_weighted["cap_scaled_due_to_infeasibility"].iloc[0]) if len(df_weighted) else False
    if universe == "DOWJONES":
        fmc_note = ("DJIA jest ważona ceną, nie kapitalizacją — wagi FMC odzwierciedlają wagę cenową "
                     "spółki w indeksie (za funduszem CIND), nie jej kapitalizację rynkową.")
    elif universe in EQUAL_WEIGHT_UNIVERSES:
        fmc_note = ("Brak publicznie dostępnych wag kapitalizacyjnych dla tego indeksu (skład wczytany "
                     "z ręcznie dostarczonej listy tickerów, bez ETF-a referencyjnego z publikowanym "
                     "Market Value) — spółki są więc ważone równomiernie, tak jak DOWJONES.")
    else:
        fmc_note = ("FMC pochodzi z kolumny 'Market Value' funduszu ETF replikującego ten indeks "
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
# tabela `index_prices` z fetch_data.py) między NASDAQ100/DOWJONES w
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

    gem_universes_sql = ",".join(f"'{u}'" for u in GEM_UNIVERSES)
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
        WHERE Index_Name IN ({gem_universes_sql})
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


def export_global_equity_momentum(con, docs_data_dir, ref_date=None,
                                   lookback_months=GEM_LOOKBACK_MONTHS, top_n=GEM_TOP_N):
    """ref_date=None: uzyj najswiezszej daty w index_prices, NIE ref_date z pipeline'u
    3 glownych uniwersow (ktory pochodzi z tabeli `prices` skladnikow i odswieza sie
    tylko raz w miesiacu). GEM ma wlasne, codzienne zrodlo danych (fetch_data.py
    --indices-only + run_query.py --gem-only, patrz .github/workflows/daily_gem.yml),
    wiec jego swiezosc nie powinna byc uwiazana do miesiecznego rebalansu skladnikow —
    compute_index_leaders i tak gracefully sięgnie po ostatnią znaną cenę skladnika
    (ARGMAX ... FILTER WHERE Date <= ref_date), nawet jesli `prices` jest starsze."""
    if ref_date is None:
        has_table = con.execute("""
            SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'index_prices'
        """).fetchone()[0] > 0
        watermark = con.execute("SELECT MAX(Date) FROM index_prices").fetchone()[0] if has_table else None
        if watermark is None:
            print("❌ Brak danych Global Equity Momentum (index_prices) — uruchom najpierw fetch_data.py.")
            return
        ref_date = pd.Timestamp(watermark).strftime("%Y-%m-%d")

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
                 "dla NASDAQ100/DOWJONES — klasyczna idea Global/Dual Equity Momentum: spośród "
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


# ============================================================================
# SIŁA RELATYWNA WZGLĘDEM INDEKSU — dla SP500, NASDAQ100, DOWJONES, WIG20 i
# mWIG40 (w odróżnieniu od GEM_UNIVERSES, SP500/WIG20/mWIG40 TU są objęte —
# ten ekran nie ma tego samego "nie zmieniaj istniejącego zachowania GEM"
# ograniczenia). Zamiast osobnego okna YTD (za mało danych tuż po Nowym Roku),
# używa DOKŁADNIE tego samego okna co momentum_value głównych uniwersów
# (get_universe_metrics: M-14/M-2, fallback M-11/M-2 przy krótszej historii) —
# nie trzeba więc liczyć/pobierać danych dla osobnego okna tylko na potrzeby
# tego ekranu. Zostają tylko spółki, których momentum w tym oknie przebiło
# momentum samego indeksu — posortowane malejąco po przewadze
# (relative_strength_pct = zwrot spółki - zwrot indeksu).
# ============================================================================
RELATIVE_STRENGTH_UNIVERSES = ["SP500", "NASDAQ100", "DOWJONES", "WIG20", "MWIG40"]


def compute_index_momentum(con, universe, ref_date):
    """Momentum POZIOMU INDEKSU w TYM SAMYM oknie co momentum_value składników
    (get_universe_metrics: price[ref-2mies] / price[ref-14mies] - 1, fallback
    9M jeśli brak 14 miesięcy historii) — punkt odniesienia dla Siły Relatywnej."""
    has_table = con.execute("""
        SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'index_prices'
    """).fetchone()[0] > 0
    if not has_table:
        return None

    row = con.execute(f"""
        WITH params AS (SELECT DATE '{ref_date}' AS ref_date)
        SELECT
            ARGMAX(Close, Date) FILTER (WHERE Date <= (SELECT ref_date FROM params) - INTERVAL '2 MONTHS') AS price_m2,
            ARGMAX(Close, Date) FILTER (WHERE Date <= (SELECT ref_date FROM params) - INTERVAL '14 MONTHS') AS price_m14,
            MAX(Date) FILTER (WHERE Date <= (SELECT ref_date FROM params) - INTERVAL '14 MONTHS') AS date_m14,
            ARGMAX(Close, Date) FILTER (WHERE Date <= (SELECT ref_date FROM params) - INTERVAL '11 MONTHS') AS price_m11,
            MAX(Date) FILTER (WHERE Date <= (SELECT ref_date FROM params) - INTERVAL '11 MONTHS') AS date_m11
        FROM index_prices
        WHERE Index_Name = '{universe}'
    """).fetchone()
    if row is None:
        return None
    price_m2, price_m14, date_m14, price_m11, date_m11 = row
    if price_m2 is not None and price_m14 is not None:
        return {"momentum_value": float(price_m2 / price_m14 - 1), "momentum_window": "12M", "date_start": str(date_m14)}
    if price_m2 is not None and price_m11 is not None:
        return {"momentum_value": float(price_m2 / price_m11 - 1), "momentum_window": "9M (fallback)", "date_start": str(date_m11)}
    return None


def compute_relative_strength_leaders(con, universe, ref_date, index_return_pct, min_trading_days, max_staleness_days):
    """Zwraca spółki `universe`, których momentum_value (TEN SAM window co 3 główne
    uniwersa, patrz get_universe_metrics) przebiło momentum samego indeksu
    (index_return_pct, patrz compute_index_momentum), posortowane malejąco po
    przewadze (relative_strength_pct)."""
    df = get_universe_metrics(con, universe, ref_date, min_trading_days, max_staleness_days)
    if df.empty:
        return []

    df = df.copy()
    df["return_pct"] = df["momentum_value"] * 100
    df["relative_strength_pct"] = df["return_pct"] - index_return_pct
    df = df[df["relative_strength_pct"] > 0]
    df = df.sort_values("relative_strength_pct", ascending=False).reset_index(drop=True)

    records = []
    for i, r in df.iterrows():
        records.append({
            "rank": i + 1,
            "ticker": r["Ticker"],
            "sector": r["Sector"],
            "price": round(float(r["price_now"]), 2),
            "return_pct": round(float(r["return_pct"]), 2),
            "momentum_window": r["momentum_window"],
            "relative_strength_pct": round(float(r["relative_strength_pct"]), 2),
        })
    return records


def _weekly_close_series(con, table, id_column, id_value, start_date, end_date, include_buying_volume=False):
    """Tygodniowe zamknięcia (ostatnia cena w tygodniu, DATE_TRUNC('week', Date)) dla
    id_column=id_value (Ticker w `prices` albo Index_Name w `index_prices`), od
    start_date do end_date (włącznie). Dolicza też SUM(Volume) w tygodniu — używane
    tylko przez compute_relative_strength_chart (potwierdzenie wybicia wolumenem,
    patrz _compute_weinstein_stage_series), ignorowane przez pozostałych wywołujących
    (compute_mansfield_rs_chart, wywołania dla index_prices).

    include_buying_volume=True dolicza tez SUM(buying_volume) — DZIENNY rozklad
    tygodniowego wolumenu na "kupujacych"/"sprzedajacych" metoda Close Location
    Value (CLV, klasyka Chaikina — ta sama, na ktorej opiera sie Accumulation/
    Distribution Line): dla kazdego dnia buying_share = ((Close-Low)-(High-Close))
    / (High-Low), przeskalowane do [0,1] jako (CLV+1)/2, i buying_volume_dnia =
    Volume * ten udzial. Liczymy PO DNIACH i sumujemy do tygodnia (nie raz na
    tygodniowym High/Low) — dokladniej oddaje to, ile z tygodniowego wolumenu
    faktycznie towarzyszylo cenie zamykajacej sie blisko szczytu dnia (kupujacy
    "wygrali" ten dzien) wzgledem blisko dolka (sprzedajacy "wygrali"), zamiast
    jednego zgrubnego wyliczenia z zakresu calego tygodnia. Gdy High/Low brakuje
    (NULL — stare wiersze sprzed migracji schematu, patrz fetch_data.py
    _ensure_prices_ohlc_columns) albo High=Low (zerowy zakres, martwy handel),
    dzien dostaje neutralny podzial 50/50, zeby SUM(buying_volume) nigdy nie byl
    NULL i zawsze sumowal sie mniej wiecej do SUM(Volume) (uzywane WYLACZNIE dla
    tabeli `prices` — TYLKO tam sa kolumny High/Low; wywolanie dla `index_prices`
    (bez tego flaga) by sie wywalilo, bo tam ich nie ma)."""
    buying_volume_select = ""
    if include_buying_volume:
        buying_volume_select = """,
               SUM(CASE
                     WHEN High IS NULL OR Low IS NULL OR High <= Low THEN Volume * 0.5
                     ELSE Volume * ((2 * Close - High - Low) / (High - Low) + 1) / 2.0
                   END) AS buying_volume"""
    return con.execute(f"""
        SELECT DATE_TRUNC('week', Date) AS week_start,
               ARGMAX(Close, Date) AS close,
               SUM(Volume) AS volume{buying_volume_select}
        FROM {table}
        WHERE {id_column} = '{id_value}'
          AND Date >= DATE '{start_date}'
          AND Date <= DATE '{end_date}'
        GROUP BY week_start
        ORDER BY week_start
    """).df()


RS_PRICE_SMA_SHORT_WEEKS = 10   # "wykres 10:30" (Dr Eric Wish / stage analysis): 10-tyg. SMA ceny
RS_PRICE_SMA_LONG_WEEKS = 30    # ...i 30-tyg. SMA ceny (klasyczne progi Weinsteina)

# --- Klasyfikacja etapow Weinsteina (Stage Analysis, "Secrets for Profiting in
# Bull and Bear Markets") na wykresie 10:30 — patrz _compute_weinstein_stage_series.
# WERSJA 2: pierwsza wersja tej klasyfikacji wyznaczala wybicie WYLACZNIE z
# przeciecia SMA30 (bez lokalnego oporu bazy) i miala pojedyncza, plaska regule
# wyjscia ("cena ponizej SMA30"). Po pokazaniu oryginalnych rysunkow z ksiazki
# (trading range / resistance zone przy wybiciu, wielokrotne bazy 1./2./3.
# w trakcie Etapu 2, oraz osobny wykres "Trailing Stop Loss" z podnoszonym stopem)
# okazalo sie to za grubym uproszczeniem — ponizsza wersja liczy realny opor
# lokalnej bazy (trading range) i prowadzi trailing stop-loss zamiast plaskiej
# reguly SMA30. Nadal ROZMYSLNIE pominieta jest wieloletnia baza/ATH (jak przy
# usunietej linii GLB, patrz docstring compute_relative_strength_chart) — lokalna
# baza z ostatnich kilku-kilkunastu tygodni miesci sie w rolling ~15-miesiecznym
# oknie `prices`, wieloletni opor juz nie. Sila relatywna CELOWO nie wchodzi w te
# klasyfikacje (pomysl odrzucony wczesniej ze wzgledu na trudnosc implementacji).
STAGE_SLOPE_LOOKBACK_WEEKS = 4       # ile tyg. wstecz porownujemy SMA30 przy ocenie kierunku
STAGE_FLAT_SLOPE_PCT = 1.0           # próg nachylenia SMA30 (w % za STAGE_SLOPE_LOOKBACK_WEEKS) uznawany za "plaskie"
STAGE_VOLUME_LOOKBACK_WEEKS = 10     # okno sredniego tyg. WOLUMENU KUPUJACYCH (CLV) do oceny potwierdzenia wybicia
STAGE_BREAKOUT_VOLUME_RATIO = 1.5    # wybicie bazy (2A) potwierdzone gdy tyg. wolumen KUPUJACYCH >= 1.5x sredniej
STAGE_PULLBACK_VOLUME_RATIO = 1.2    # dla kolejnych baz w trakcie Etapu 2 (2B) wystarczy slabszy wzrost wolumenu kupujacych
STAGE_BASE_LOOKBACK_WEEKS = 8        # okno, w ktorym szukamy "strefy oporu" (max) lokalnej bazy/trading range
STAGE_BASE_MAX_RANGE_PCT = 15.0      # (max-min)/min w tym oknie musi byc <= tyle %, zeby uznac je za "cisna baze"
STAGE_MIN_BASE_GAP_WEEKS = 6         # min. odstep miedzy kolejnymi bazami — bez tego gladki trend bez realnych
                                      # przystankow wybijalby sie z definicji co 1-2 tyg. (zawsze > max z 8 tyg.)
STAGE_LATE_BASE_WARNING_COUNT = 4    # 4., 5. baza w tej samej fali Etapu 2 sa bardziej podatne na niepowodzenie (ksiazka)
STAGE_STOP_NEAR_HIGH_PCT = 3.0       # stop podnosimy tylko gdy cena wrocila w te % okolice poprzedniego szczytu fali
STAGE_MA_SLOWDOWN_RATIO = 0.5        # ostrzezenie "SMA30 traci tempo": biezace nachylenie < tyle x szczytowe w tej fali


def _compute_weinstein_stage_series(stock_df):
    """Klasyfikuje KAZDY tydzien stock_df (posortowany chronologicznie, kolumny
    close/sma30/volume — patrz compute_relative_strength_chart) na etap Weinsteina
    i prowadzi trailing stop-loss dokladnie w stylu ksiazkowego wykresu "Stage
    Analysis Investor method — Trailing Stop Loss":

      Etap 1 (baza)            — cena w poblizu plaskiej SMA30, brak potwierdzonego trendu
                                  (rowniez: cena chwilowo nad JESZCZE opadajaca SMA30 —
                                  traktowana ostroznie, to NIE potwierdzony Etap 2).
      Etap 2A (swieze wybicie) — PIERWSZE wybicie ponad opor cisnej bazy (patrz nizej)
                                  od czasu, gdy spolka nie byla juz w Etapie 2.
      Etap 2B (kontynuacja)    — KAZDE kolejne wybicie ponad opor nowej, cisnej bazy,
                                  gdy spolka jest juz w Etapie 2 — "1. baza", "2. baza"...
                                  z ksiazkowego rysunku (pozniejsze/sekundarne wejscia,
                                  "pyramiding").
      Etap 3 (szczyt)          — po Etapie 2 cena zaczyna schodzic pod SMA30, ktora
                                  jeszcze nie opada (dystrybucja/wyplaszczenie trendu).
      Etap 4 (spadek)          — cena pod opadajaca SMA30.

    Baza/opor: w kazdym tygodniu patrzymy na max/min zamkniec z poprzednich
    STAGE_BASE_LOOKBACK_WEEKS tygodni (BEZ biezacego) — jesli (max-min)/min miesci
    sie w STAGE_BASE_MAX_RANGE_PCT, to okno liczy sie za "cisna baze", a jej "opor"
    to max tego okna. Wybicie = biezace zamkniecie > ten opor. STAGE_MIN_BASE_GAP_WEEKS
    pilnuje, zeby kolejna baza faktycznie zdazyla sie uformowac (patrz komentarz przy
    stalej) zamiast liczyc kazdy tydzien plynnego trendu za nowa baze.

    Trailing stop-loss (pole "stop_level", w jednostkach ceny — compute_relative_
    strength_chart rebase'uje go do "stop_level_pct" tak samo jak close_pct):
      - Przy ENTRY_2A: stop = min(SMA30, dolna granica bazy wybicia) — pod caloscia
        bazy i pod SMA30 rownoczesnie (ksiazka: "stop loss should remain below the
        rising 30-week MA and each significant weekly swing low").
      - Przy kazdej kolejnej bazie (2B): stop PODNOSZONY do min(SMA30, dolna granica
        NOWEJ bazy) — ale TYLKO jesli cena zdazyla juz wrocic w okolice
        (STAGE_STOP_NEAR_HIGH_PCT) poprzedniego szczytu fali (ksiazka: "don't raise
        your stop loss until the price moves back near to the prior swing high").
      - Stop nigdy nie jest obnizany, tylko podnoszony/trzymany.

    Sygnaly (pole "signal", tylko w tygodniu w ktorym faktycznie sie pojawiaja).
    Potwierdzenie wolumenem liczy sie WYLACZNIE z wolumenu KUPUJACYCH (pole
    "buying_volume" w stock_df — patrz _weekly_close_series(include_buying_volume=True)
    / CLV), NIE z calkowitego wolumenu: prawdziwe wybicie napedza agresywne kupowanie,
    a tydzien z wysokim LACZNYM wolumenem moze byc w wiekszosci dystrybucja
    (sprzedaz) — taki tydzien nie powinien wygladac jak potwierdzone wybicie:
      ENTRY_2A        — tydzien pierwszego wybicia bazy z potwierdzeniem wolumenem
                         KUPUJACYCH (>= STAGE_BREAKOUT_VOLUME_RATIO sredniej z
                         STAGE_VOLUME_LOOKBACK_WEEKS tyg. wolumenu kupujacych) —
                         bez potwierdzenia etap nadal jest "2A", ale sygnal wejscia
                         nie jest oznaczany.
      ENTRY_2B        — tydzien wybicia 2., 3. (< STAGE_LATE_BASE_WARNING_COUNT) bazy
                         w tej samej fali Etapu 2, z lagodniejszym potwierdzeniem
                         wolumenem kupujacych (STAGE_PULLBACK_VOLUME_RATIO).
      ENTRY_2B_LATE   — to samo, ale to juz 4. lub kolejna baza w tej fali — ksiazka:
                         "4th & 5th bases within the Stage 2 advance are more prone
                         to failure. So watch for warning signs" — dalej to sygnal
                         wejscia, ale z ostrzezeniem podwyzszonego ryzyka.
      WARNING_MA_SLOWING — nachylenie SMA30 spadlo ponizej STAGE_MA_SLOWDOWN_RATIO
                         swojego szczytu w tej fali Etapu 2, cigle rosnace (nie
                         plaskie/spadajace) — ksiazka: "30 week MA starting to lose
                         momentum. Tactic change to more aggressive SL placement".
                         Odpala sie raz na fale, NIE jest twardym sygnalem wyjscia.
      EXIT_STOP       — biezace zamkniecie zlamalo trailing stop_level opisany wyzej
                         ("Exit Trade: Stop Loss hit as price breaks below support").

    Zwraca liste dictow {"stage", "signal", "buying_volume_ratio", "stop_level",
    "base_count", "base_event"} rownolegla do stock_df. Wszystkie pola (poza
    "base_event") to None dopoki SMA30 (wzglednie STAGE_VOLUME_LOOKBACK_WEEKS tyg.
    historii wolumenu kupujacych, wzglednie STAGE_BASE_LOOKBACK_WEEKS tyg. do
    wyznaczenia bazy) nie sa jeszcze dostepne — ten sam, udokumentowany juz wyzej
    limit plytkiej historii co reszta wykresu 10:30. "base_count" to numer
    biezacej bazy w trwajacej fali Etapu 2 (None poza Etapem 2).

    "base_event" (domyslnie None, wypelniony WYLACZNIE w tygodniu faktycznego
    wybicia bazy, patrz "new_base_event" nizej) opisuje geometrie tej bazy do
    narysowania jej na wykresie jako prostokat/trendlinia zamiast pojedynczego
    znacznika: {"base_start_idx", "base_end_idx" (indeksy w stock_df, baza konczy
    sie tydzien PRZED wybiciem), "resistance", "support" (surowe ceny — opor/dolna
    granica bazy), "base_count", "kind"}. "kind" rozroznia dwa rodzaje bazy z
    ksiazkowych diagramow: "stage1" to baza denna, ktora faktycznie uformowala sie
    PO Etapie 4 (spadku) — prawdziwe dno przed swiezym wybiciem; "stage2" to
    KAZDA inna baza — zarowno kolejne bazy kontynuacji w trakcie trwajacej juz
    fali Etapu 2 (2., 3., 4. baza), jak i pierwsza baza fali, ktora NIE byla
    poprzedzona Etapem 4 (np. wybicie od razu po Etapie 3/szczycie, bez
    potwierdzonego spadku) — taka traktujemy jako kontynuacje, nie nowe dno.
    Pilnuje tego flaga "saw_stage4" (patrz nizej), zerowana przy kazdym
    zuzyciu (ENTRY_2A)."""
    n = len(stock_df)
    closes = stock_df["close"].tolist()
    sma30s = stock_df["sma30"].tolist()
    buying_volumes = stock_df["buying_volume"].tolist()

    results = [None] * n
    prev_stage = None
    stop_level = None
    base_count = 0
    run_peak_slope = None
    high_since_raise = None
    ma_slowdown_flagged = False
    weeks_since_last_base = None
    # Czy Etap 4 (spadek) pojawil sie od czasu ostatniego zuzycia tej flagi (przy
    # ENTRY_2A) — rozstrzyga, czy nadchodzaca baza denna liczy sie jako prawdziwy
    # "stage1" (po spadku) czy jako "stage2" (kontynuacja/wybicie bez potwierdzonego
    # dna, patrz docstring). Celowo NIE zerowana w reset_run_state: Etap 4 i
    # EXIT_STOP moga wystapic w tym samym tygodniu (patrz petla nizej), a flaga ma
    # przetrwac az do kolejnego ENTRY_2A, niezaleznie od resetu stanu fali.
    saw_stage4 = False

    def reset_run_state():
        nonlocal stop_level, base_count, run_peak_slope, high_since_raise, ma_slowdown_flagged, weeks_since_last_base
        stop_level = None
        base_count = 0
        run_peak_slope = None
        high_since_raise = None
        ma_slowdown_flagged = False
        weeks_since_last_base = None

    for i in range(n):
        if pd.isna(sma30s[i]) or pd.isna(closes[i]):
            results[i] = {"stage": None, "signal": None, "buying_volume_ratio": None, "stop_level": None,
                           "base_count": None, "base_event": None}
            prev_stage = None
            reset_run_state()
            continue

        j = i - STAGE_SLOPE_LOOKBACK_WEEKS
        slope_pct = None
        if j >= 0 and not pd.isna(sma30s[j]) and sma30s[j] != 0:
            slope_pct = (sma30s[i] / sma30s[j] - 1) * 100
        if slope_pct is None:
            direction = "UNKNOWN"
        elif slope_pct > STAGE_FLAT_SLOPE_PCT:
            direction = "RISING"
        elif slope_pct < -STAGE_FLAT_SLOPE_PCT:
            direction = "FALLING"
        else:
            direction = "FLAT"

        above = closes[i] > sma30s[i]

        # Opor lokalnej bazy: max/min zamkniec z STAGE_BASE_LOOKBACK_WEEKS tyg. PRZED
        # biezacym tygodniem (bez niego) — musi byc "cisny" (patrz stala), inaczej to
        # nie baza tylko szeroki, chaotyczny ruch i wybicie sie nie liczy.
        base_start = i - STAGE_BASE_LOOKBACK_WEEKS
        breakout = False
        base_low_val = None
        if base_start >= 0:
            window = closes[base_start:i]
            base_high = max(window)
            base_low_val = min(window)
            if base_low_val > 0 and (base_high - base_low_val) / base_low_val <= STAGE_BASE_MAX_RANGE_PCT / 100.0:
                if closes[i] > base_high:
                    breakout = True
        if breakout and weeks_since_last_base is not None and weeks_since_last_base < STAGE_MIN_BASE_GAP_WEEKS:
            breakout = False

        vol_ratio = None
        vol_start = i - STAGE_VOLUME_LOOKBACK_WEEKS
        if vol_start >= 0 and buying_volumes[i] is not None and not pd.isna(buying_volumes[i]):
            window_vols = [v for v in buying_volumes[vol_start:i] if v is not None and not pd.isna(v)]
            if len(window_vols) == STAGE_VOLUME_LOOKBACK_WEEKS:
                avg_vol = sum(window_vols) / len(window_vols)
                if avg_vol > 0:
                    vol_ratio = buying_volumes[i] / avg_vol

        if not above:
            if direction == "FALLING":
                stage = "4"
            elif prev_stage in ("2A", "2B", "3"):
                stage = "3"
            else:
                stage = "1"
        else:
            if breakout and prev_stage not in ("2A", "2B"):
                stage = "2A"
            elif prev_stage in ("2A", "2B"):
                stage = "2B"
            else:
                stage = "1"

        if stage == "4":
            saw_stage4 = True

        signal = None
        new_base_event = False
        base_event = None

        if stage == "2A" and breakout and prev_stage not in ("2A", "2B"):
            new_base_event = True
            base_count = 1
            run_peak_slope = slope_pct
            stop_level = min(sma30s[i], base_low_val) if base_low_val is not None else sma30s[i]
            high_since_raise = closes[i]
            ma_slowdown_flagged = False
            base_event = {
                "base_start_idx": base_start, "base_end_idx": i - 1,
                "resistance": base_high, "support": base_low_val,
                "base_count": base_count, "kind": "stage1" if saw_stage4 else "stage2",
            }
            saw_stage4 = False
            if vol_ratio is not None and vol_ratio >= STAGE_BREAKOUT_VOLUME_RATIO:
                signal = "ENTRY_2A"
        elif stage == "2B" and breakout and prev_stage in ("2A", "2B"):
            new_base_event = True
            base_count += 1
            base_event = {
                "base_start_idx": base_start, "base_end_idx": i - 1,
                "resistance": base_high, "support": base_low_val,
                "base_count": base_count, "kind": "stage2",
            }
            candidate_stop = min(sma30s[i], base_low_val) if base_low_val is not None else sma30s[i]
            if high_since_raise is not None and closes[i] >= high_since_raise * (1 - STAGE_STOP_NEAR_HIGH_PCT / 100.0):
                if stop_level is None or candidate_stop > stop_level:
                    stop_level = candidate_stop
                high_since_raise = closes[i]
            if vol_ratio is None or vol_ratio >= STAGE_PULLBACK_VOLUME_RATIO:
                signal = "ENTRY_2B_LATE" if base_count >= STAGE_LATE_BASE_WARNING_COUNT else "ENTRY_2B"

        weeks_since_last_base = 0 if new_base_event else (
            weeks_since_last_base + 1 if weeks_since_last_base is not None else None)

        if not new_base_event and stage in ("2A", "2B"):
            if high_since_raise is not None and closes[i] > high_since_raise:
                high_since_raise = closes[i]
            if run_peak_slope is not None and slope_pct is not None:
                run_peak_slope = max(run_peak_slope, slope_pct)
                if (not ma_slowdown_flagged and direction == "RISING" and run_peak_slope > 0
                        and slope_pct < run_peak_slope * STAGE_MA_SLOWDOWN_RATIO):
                    signal = "WARNING_MA_SLOWING"
                    ma_slowdown_flagged = True

        if stage in ("1", "3", "4") and stop_level is not None and closes[i] < stop_level:
            signal = "EXIT_STOP"
            reset_run_state()

        results[i] = {
            "stage": stage,
            "signal": signal,
            "buying_volume_ratio": round(vol_ratio, 2) if vol_ratio is not None else None,
            "stop_level": stop_level,
            "base_count": base_count if stage in ("2A", "2B") else None,
            "base_event": base_event,
        }
        prev_stage = stage

    return results


def compute_relative_strength_chart(con, ticker, universe, ref_date, start_date):
    """Wykres 'nie-TradingView' dla panelu Siły Relatywnej, w stylu klasycznej
    metodologii stage analysis (Stan Weinstein / Dr. Eric Wish) — "wykres 10:30":
    tygodniowa cena spółki + SMA 10-tyg. i 30-tyg., razem z poziomem własnego indeksu,
    wszystko przeliczone na % zmiany WZGLĘDEM pierwszego wyświetlanego tygodnia
    (start_date) — nie surowe wartości na osobnych skalach, bo dwie osie utrudniają
    ocenę wzrokiem, która linia rośnie szybciej. Po rebase'owaniu obie linie (spółka
    i indeks) startują z 0% i rozjeżdżają się — spółka POWYŻEJ linii indeksu w danym
    tygodniu = silniejsza od rynku w tym oknie, PONIŻEJ = słabsza.

    Pobiera dodatkowy zapas RS_PRICE_SMA_LONG_WEEKS tygodni PRZED start_date (margines
    na "rozgrzanie" obu średnich, żeby miały już wartość od pierwszego wyświetlanego
    tygodnia — SMA liczone są na SUROWEJ cenie, potem przeliczane na te same jednostki
    % co linia ceny), ale zwraca dane WYŁĄCZNIE od start_date — początek TEGO SAMEGO
    okna momentum_value co reszta pipeline'u (M-14 albo M-11 przy fallbacku, patrz
    compute_index_momentum) — do ref_date (dziś). Zwraca None gdy brakuje danych
    (np. spółka bez wystarczającej historii cen).

    Nie ma tu linii GLB (Green Line Breakout) — usunięta celowo: rolling
    ~15-miesięczne okno `prices` daje za mało historii, żeby "najwyższy szczyt"
    liczony z pobranych danych faktycznie odpowiadał prawdziwemu, wieloletniemu
    szczytowi widocznemu np. na TradingView, więc linia (i status ATH/potwierdzony)
    rozjeżdżała się z rzeczywistością zamiast być wiarygodnym sygnałem. Ten sam limit
    płytkiej historii dotyczy klasyfikacji etapów (Stage 1-4/2A/2B, patrz
    _compute_weinstein_stage_series) — działa wyłącznie na pozycji/nachyleniu SMA30,
    nie na wieloletnim oporze bazy, z tego samego powodu.

    Zwraca też, oprócz linii ceny, klasyfikację etapów Weinsteina + potwierdzenie
    wolumenem + trailing stop-loss dla KAŻDEGO wyświetlanego tygodnia ("volume"/
    "buying_volume"/"buying_volume_ratio"/"stage"/"signal"/"stop_level_pct"/
    "base_count", patrz _compute_weinstein_stage_series) oraz "current_stage" —
    wygodny skrót do etapu ostatniego (najnowszego) tygodnia, do odznaki na
    dashboardzie. "volume" to CAŁKOWITY tygodniowy wolumen (do wysokości słupka na
    wykresie), "buying_volume" to jego część przypisana kupującym metodą Close
    Location Value (patrz _weekly_close_series) — różnica volume-buying_volume to
    wolumen sprzedających (do podziału tego samego słupka na wykresie: dół =
    kupujący, góra = sprzedający). Potwierdzenie wybicia ("buying_volume_ratio")
    patrzy WYŁĄCZNIE na wolumen kupujących, nie na wolumen łączny — patrz
    _compute_weinstein_stage_series. "stop_level_pct" to trailing stop w tych samych
    jednostkach % co close_pct (rebase'owany tym samym close0) — do narysowania
    linii stopu na wykresie, tak jak w książkowym "Trailing Stop Loss" — None poza
    aktywną falą Etapu 2.

    "bases" — lista wykrytych baz (patrz "base_event" w _compute_weinstein_stage_
    series) do narysowania jako prostokąty/trendlinie zamiast pojedynczych
    znaczników wybicia: [{"start_date", "end_date", "resistance_pct", "support_pct",
    "base_count", "kind"}], gdzie *_pct to ten sam close0-relatywny % co close_pct.
    Tylko bazy, których tydzień wybicia mieści się w wyświetlanym oknie (start_date
    może sięgać wstecz w bufor rozgrzewkowy SMA — wtedy przycinana do pierwszego
    wyświetlanego tygodnia)."""
    lookback_weeks = RS_PRICE_SMA_LONG_WEEKS + 2
    extended_start = (pd.Timestamp(start_date) - pd.Timedelta(weeks=lookback_weeks)).strftime("%Y-%m-%d")

    stock_df = _weekly_close_series(con, "prices", "Ticker", ticker, extended_start, ref_date,
                                     include_buying_volume=True)
    index_df = _weekly_close_series(con, "index_prices", "Index_Name", universe, extended_start, ref_date)
    if stock_df.empty or index_df.empty:
        return None

    stock_df = stock_df.sort_values("week_start").reset_index(drop=True)
    stock_df["sma10"] = stock_df["close"].rolling(RS_PRICE_SMA_SHORT_WEEKS).mean()
    stock_df["sma30"] = stock_df["close"].rolling(RS_PRICE_SMA_LONG_WEEKS).mean()

    stage_rows = _compute_weinstein_stage_series(stock_df)
    stock_df["stage"] = [row["stage"] for row in stage_rows]
    stock_df["signal"] = [row["signal"] for row in stage_rows]
    stock_df["buying_vol_ratio"] = [row["buying_volume_ratio"] for row in stage_rows]
    stock_df["stop_level_raw"] = [row["stop_level"] for row in stage_rows]
    stock_df["base_count_raw"] = [row["base_count"] for row in stage_rows]
    stock_df["base_event_raw"] = [row["base_event"] for row in stage_rows]

    index_by_week = dict(zip(index_df["week_start"], index_df["close"]))
    stock_df["index_close"] = stock_df["week_start"].map(index_by_week)

    in_window = stock_df[stock_df["week_start"] >= pd.Timestamp(start_date)].reset_index(drop=True)
    if in_window.empty or pd.isna(in_window["close"].iloc[0]):
        return None

    close0 = float(in_window["close"].iloc[0])
    index_available = in_window["index_close"].dropna()
    index0 = float(index_available.iloc[0]) if not index_available.empty else None
    # Przesuniecie miedzy indeksami stock_df (pelen szereg z buforem rozgrzewkowym
    # SMA przed start_date) a in_window (tylko wyswietlane tygodnie) — in_window
    # jest zawsze koncowka posortowanego chronologicznie stock_df, wiec to zwykle
    # odejmowanie dlugosci wystarcza do przeliczenia "base_start_idx"/"base_end_idx"
    # (indeksy w stock_df, patrz _compute_weinstein_stage_series) na pozycje w
    # dates/close_pct ponizej.
    stock_to_window_offset = len(stock_df) - len(in_window)

    def pct(value, base):
        if base is None or pd.isna(value):
            return None
        return round((float(value) / base - 1) * 100, 2)

    dates, close_pct, sma10_pct, sma30_pct, index_pct = [], [], [], [], []
    volume, buying_volume, buying_volume_ratio, stage, signal = [], [], [], [], []
    stop_level_pct, base_count = [], []
    raw_base_events = []
    for _, r in in_window.iterrows():
        dates.append(r["week_start"].strftime("%Y-%m-%d"))
        close_pct.append(pct(r["close"], close0))
        sma10_pct.append(pct(r["sma10"], close0))
        sma30_pct.append(pct(r["sma30"], close0))
        index_pct.append(pct(r["index_close"], index0))
        volume.append(int(r["volume"]) if pd.notna(r["volume"]) else None)
        buying_volume.append(int(round(r["buying_volume"])) if pd.notna(r["buying_volume"]) else None)
        # UWAGA: r pochodzi z in_window.iterrows() — wiersz miesza kolumny float
        # (close/sma10/...) z object (stage/signal), a pandas przy budowaniu Series
        # per-wiersz potrafi wtedy po cichu zamienic None na NaN (znany quirk
        # iterrows() dla niejednorodnych typow w wierszu). Bez jawnego pd.notna
        # trafiloby to do JSON jako literal `NaN` — niepoprawny JSON (JSON.parse
        # w przegladarce by go odrzucil), zamiast `null`.
        buying_volume_ratio.append(r["buying_vol_ratio"] if pd.notna(r["buying_vol_ratio"]) else None)
        stage.append(r["stage"] if pd.notna(r["stage"]) else None)
        signal.append(r["signal"] if pd.notna(r["signal"]) else None)
        stop_level_pct.append(pct(r["stop_level_raw"], close0) if pd.notna(r["stop_level_raw"]) else None)
        base_count.append(int(r["base_count_raw"]) if pd.notna(r["base_count_raw"]) else None)
        # Ten sam quirk iterrows() co przy stage/signal wyzej (kolumna miesza
        # object z float) — "base_event_raw" to albo None, albo dict; dict
        # przezywa NIETKNIETY (tylko None ryzykuje ciche zamienienie na NaN), wiec
        # isinstance jest tu wystarczajacym, prostszym straznikiem niz pd.notna.
        be = r["base_event_raw"] if isinstance(r["base_event_raw"], dict) else None
        if be is not None:
            raw_base_events.append(be)

    bases = []
    for be in raw_base_events:
        start_pos = max(be["base_start_idx"] - stock_to_window_offset, 0)
        end_pos = be["base_end_idx"] - stock_to_window_offset
        if end_pos < 0 or start_pos > end_pos:
            continue
        bases.append({
            "start_date": dates[start_pos],
            "end_date": dates[end_pos],
            "resistance_pct": pct(be["resistance"], close0),
            "support_pct": pct(be["support"], close0),
            "base_count": be["base_count"],
            "kind": be["kind"],
        })

    return {
        "dates": dates,
        "close_pct": close_pct,
        "sma10_pct": sma10_pct,
        "sma30_pct": sma30_pct,
        "index_pct": index_pct,
        "volume": volume,
        "buying_volume": buying_volume,
        "buying_volume_ratio": buying_volume_ratio,
        "stop_level_pct": stop_level_pct,
        "base_count": base_count,
        "stage": stage,
        "signal": signal,
        "current_stage": stage[-1] if stage else None,
        "bases": bases,
    }


RS_MANSFIELD_DISPLAY_WEEKS = 26   # oscylator pokazuje ostatnie ~6 mies. (NIE okno momentum_value)
RS_MANSFIELD_SHORT_WEEKS = 13     # wygladzanie krotkoterminowe, ~3 mies.
RS_MANSFIELD_MEDIUM_WEEKS = 26    # wygladzanie srednioterminowe, ~6 mies.


def compute_mansfield_rs_chart(con, ticker, universe, ref_date):
    """Oscylator Mansfield Relative Strength (RSM = (RS / SMA(RS, N tyg.) - 1) * 100,
    gdzie RS = cena_spółki / poziom_indeksu — surowa linia RS Weinsteina) w DWÓCH
    wariantach wygładzania na jednym wykresie: krótkoterminowym
    (RS_MANSFIELD_SHORT_WEEKS, ~3 mies.) i średnioterminowym (RS_MANSFIELD_MEDIUM_WEEKS,
    ~6 mies.) — dwa RÓŻNE, celowo NIE nakładające się na siebie horyzonty tego samego
    sygnału (krótkoterminowe przyspieszenie/spowolnienie potrafi wyprzedzać albo
    rozjeżdżać się ze średnioterminowym trendem, więc warto widzieć oba naraz).

    Celowo ODCZEPIONY od okna momentum_value (M-14/M-2) używanego w
    compute_relative_strength_chart: wyświetlany zakres to własne, znacznie krótsze
    ostatnie RS_MANSFIELD_DISPLAY_WEEKS (~6 mies.) liczone od ref_date, żeby oba
    wygładzenia (zwłaszcza 26-tyg.) miały realny zapas historii PRZED pierwszym
    wyświetlanym tygodniem — łącznie potrzeba tylko
    RS_MANSFIELD_DISPLAY_WEEKS + RS_MANSFIELD_MEDIUM_WEEKS (~52 tyg. = ok. rok), co
    mieści się w rolling ~15-miesięcznym oknie `prices` z zapasem. Gdyby ten oscylator
    używał (jak wcześniej) 52-tygodniowego wygładzania na tle 12-14-miesięcznego okna
    momentum, potrzebowałby ~26,5 miesiąca historii — dlatego usunięto tamtą wersję
    (patrz commit historia) i tutaj świadomie użyto krótszych, własnych okien.

    Zwraca None gdy brakuje danych (np. spółka bez wystarczającej historii cen)."""
    lookback_weeks = RS_MANSFIELD_DISPLAY_WEEKS + RS_MANSFIELD_MEDIUM_WEEKS + 2
    extended_start = (pd.Timestamp(ref_date) - pd.Timedelta(weeks=lookback_weeks)).strftime("%Y-%m-%d")

    stock_df = _weekly_close_series(con, "prices", "Ticker", ticker, extended_start, ref_date)
    index_df = _weekly_close_series(con, "index_prices", "Index_Name", universe, extended_start, ref_date)
    if stock_df.empty or index_df.empty:
        return None

    stock_df = stock_df.sort_values("week_start").reset_index(drop=True)
    index_by_week = dict(zip(index_df["week_start"], index_df["close"]))
    stock_df["index_close"] = stock_df["week_start"].map(index_by_week)
    stock_df["rs_raw"] = stock_df["close"] / stock_df["index_close"]
    stock_df["rsm_short"] = (stock_df["rs_raw"] / stock_df["rs_raw"].rolling(RS_MANSFIELD_SHORT_WEEKS).mean() - 1) * 100
    stock_df["rsm_medium"] = (stock_df["rs_raw"] / stock_df["rs_raw"].rolling(RS_MANSFIELD_MEDIUM_WEEKS).mean() - 1) * 100

    display_start = pd.Timestamp(ref_date) - pd.Timedelta(weeks=RS_MANSFIELD_DISPLAY_WEEKS)
    in_window = stock_df[stock_df["week_start"] >= display_start]
    if in_window.empty:
        return None

    def safe(value, digits=2):
        return round(float(value), digits) if pd.notna(value) else None

    dates, rsm_short, rsm_medium = [], [], []
    for _, r in in_window.iterrows():
        dates.append(r["week_start"].strftime("%Y-%m-%d"))
        rsm_short.append(safe(r["rsm_short"]))
        rsm_medium.append(safe(r["rsm_medium"]))

    return {
        "dates": dates,
        "rsm_short": rsm_short,
        "rsm_medium": rsm_medium,
    }


def export_relative_strength(con, docs_data_dir, ref_date=None, min_trading_days=150, max_staleness_days=10):
    """ref_date=None: jak w export_global_equity_momentum — najświeższa data w
    index_prices (odświeżane codziennie), niezależnie od miesięcznego ref_date
    pipeline'u 3 głównych uniwersów."""
    if ref_date is None:
        has_table = con.execute("""
            SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'index_prices'
        """).fetchone()[0] > 0
        watermark = con.execute("SELECT MAX(Date) FROM index_prices").fetchone()[0] if has_table else None
        if watermark is None:
            print("❌ Brak danych siły relatywnej (index_prices) — uruchom najpierw fetch_data.py.")
            return
        ref_date = pd.Timestamp(watermark).strftime("%Y-%m-%d")

    universes_payload = {}
    for universe in RELATIVE_STRENGTH_UNIVERSES:
        index_mom = compute_index_momentum(con, universe, ref_date)
        if index_mom is None:
            continue
        index_return_pct = round(index_mom["momentum_value"] * 100, 2)
        leaders = compute_relative_strength_leaders(con, universe, ref_date, index_return_pct,
                                                      min_trading_days, max_staleness_days)
        for leader in leaders:
            leader["weekly_chart"] = compute_relative_strength_chart(con, leader["ticker"], universe,
                                                                       ref_date, index_mom["date_start"])
            leader["mansfield_chart"] = compute_mansfield_rs_chart(con, leader["ticker"], universe, ref_date)
        universes_payload[universe] = {
            "index_return_pct": index_return_pct,
            "momentum_window": index_mom["momentum_window"],
            "n_outperformers": len(leaders),
            "leaders": leaders,
        }

    if not universes_payload:
        print("❌ Brak danych siły relatywnej dla żadnego uniwersum.")
        return

    payload = {
        "ref_date": ref_date,
        "universes": universes_payload,
        "note": ("Siła relatywna względem indeksu dla SP500/NASDAQ100/DOWJONES/WIG20/mWIG40, w TYM SAMYM "
                 "oknie co momentum_value głównych uniwersów (M-14/M-2, fallback M-11/M-2 przy krótszej "
                 "historii — patrz get_universe_metrics), zamiast osobnego okna YTD, które tuż po "
                 "Nowym Roku miałoby za mało danych. Lista 'leaders' w każdym uniwersum zawiera TYLKO "
                 "spółki, których momentum w tym oknie przebiło momentum samego indeksu (poziom "
                 "indeksu, nie średnia składników), posortowane malejąco po przewadze "
                 "(relative_strength_pct = zwrot spółki - zwrot indeksu). Każdy lider ma też "
                 "'weekly_chart': od początku tego samego okna, 'wykres 10:30' w stylu stage analysis "
                 "(Weinstein/Dr Eric Wish) — cena spółki + SMA 10-tyg./30-tyg. i poziom własnego indeksu, "
                 "wszystko przeliczone na % zmiany względem początku okna (pola close_pct/sma10_pct/"
                 "sma30_pct/index_pct) — patrz compute_relative_strength_chart. Każdy lider ma też "
                 "'mansfield_chart': oscylator Mansfield Relative Strength w DWÓCH wygładzeniach "
                 "(rsm_short ~3 mies., rsm_medium ~6 mies.), na WŁASNYM ostatnim ~6-miesięcznym oknie "
                 "(nie tym samym co momentum_value/weekly_chart) — patrz compute_mansfield_rs_chart. "
                 "Do wykresu innego niż TradingView na dashboardzie. "
                 "Dane informacyjne, NIE porada inwestycyjna."),
    }
    out_path = Path(docs_data_dir) / "relative_strength.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    summary = ", ".join(
        f"{u}: {v['n_outperformers']} (indeks {v['index_return_pct']:+.2f}%)"
        for u, v in universes_payload.items()
    )
    print(f"💾 Wyeksportowano {out_path} — {summary}.")


def main():
    parser = argparse.ArgumentParser(
        description="Oblicza S&P-style Momentum dla SP500/NASDAQ100/DOWJONES/WIG20/MWIG40 "
                     "i generuje statyczną stronę (docs/) pod GitHub Pages."
    )
    parser.add_argument("--ref-date", type=str, default=None,
                         help="Data referencyjna rebalansu YYYY-MM-DD. Domyślnie: MAX(Date) w tabeli prices.")
    parser.add_argument("--min-trading-days", type=int, default=150)
    parser.add_argument("--max-staleness-days", type=int, default=10)
    parser.add_argument("--docs-dir", type=str, default="docs",
                         help="Katalog strony pod GitHub Pages (domyślnie 'docs' obok run_query.py).")
    parser.add_argument("--gem-only", action="store_true",
                         help="Przelicz WYŁĄCZNIE dane zależne od indeksu na poziomie codziennym "
                              "(docs/data/global_equity_momentum.json + docs/data/relative_strength.json), "
                              "pomijając pełne przeliczenie 3 głównych uniwersów — do użycia w codziennym "
                              "workflow (patrz daily_gem.yml) po `fetch_data.py --indices-only`.")
    args = parser.parse_args()

    con = duckdb.connect("momentum_data.duckdb")
    # Migracja jednorazowa: koszyk top-momentum zostal usuniety (patrz historia
    # gita) — porzucona tabela z poprzednich uruchomien nie jest juz tworzona
    # ani czytana przez zaden kod, wiec usuwamy ja z trwalej bazy.
    con.execute("DROP TABLE IF EXISTS top_basket_history")

    if args.gem_only:
        docs_data_dir = str(Path(args.docs_dir) / "data")
        Path(docs_data_dir).mkdir(parents=True, exist_ok=True)
        export_global_equity_momentum(con, docs_data_dir)
        export_relative_strength(con, docs_data_dir, min_trading_days=args.min_trading_days,
                                  max_staleness_days=args.max_staleness_days)
        con.close()
        return

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
    export_global_equity_momentum(con, docs_data_dir)
    export_relative_strength(con, docs_data_dir, min_trading_days=args.min_trading_days,
                              max_staleness_days=args.max_staleness_days)
    con.close()


if __name__ == "__main__":
    main()
