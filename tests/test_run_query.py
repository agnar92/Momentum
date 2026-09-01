"""
Testy jednostkowe dla czystych funkcji obliczeniowych w run_query.py
(z-score/momentum score, selekcja z regula bufora, wagi z capami, equity curve,
Global Equity Momentum, sila relatywna) na lokalnej bazie DuckDB :memory:, bez
sieci. Wiekszosc funkcji operuje wylacznie na DataFrame'ach; compute_equity_curve/
compute_index_returns/compute_index_leaders/compute_index_momentum/
compute_relative_strength_leaders czytaja z portfolio_history/prices/
index_constituents/index_prices, wiec ich testy uzywaja polaczenia DuckDB ":memory:".
"""
import json
import math

import duckdb
import pandas as pd
import pytest

from run_query import (
    EQUAL_WEIGHT_UNIVERSES,
    GEM_UNIVERSES,
    MAX_HOLDINGS,
    MAX_WEIGHT,
    RELATIVE_STRENGTH_UNIVERSES,
    RS_PRICE_SMA_LONG_WEEKS,
    RS_PRICE_SMA_SHORT_WEEKS,
    STAGE_BREAKOUT_VOLUME_RATIO,
    UNIVERSES,
    add_zscore_and_momentum_score,
    compute_equity_curve,
    compute_index_leaders,
    compute_index_momentum,
    compute_index_returns,
    compute_mansfield_rs_chart,
    compute_relative_strength_chart,
    compute_relative_strength_leaders,
    compute_weights,
    export_global_equity_momentum,
    export_json,
    export_relative_strength,
    select_with_buffer,
    _compute_weinstein_stage_series,
)


# ---------------------------------------------------------------------------
# SP500 scope: przywrocony jako pelne uniwersum momentum + ekran Sily
# Relatywnej (stage-analysis charts), ale CELOWO NIE uczestniczy w Global
# Equity Momentum (nie zmienia istniejacego zachowania GEM) ani w
# rebalance.js's UNIVERSES (rebalance.html/rebalance.js, poza zasiegiem tego
# pliku) — dokladnie tak samo jak WIG20/mWIG40 sa dzis scoped.
# ---------------------------------------------------------------------------

class TestSP500Scope:
    def test_sp500_is_a_full_weighted_momentum_universe(self):
        assert "SP500" in UNIVERSES
        assert "SP500" not in EQUAL_WEIGHT_UNIVERSES  # ma realne wagi z CSPX_holdings.csv

    def test_sp500_is_in_relative_strength_but_not_gem(self):
        assert "SP500" in RELATIVE_STRENGTH_UNIVERSES
        assert "SP500" not in GEM_UNIVERSES


def make_metrics_df(rows):
    """rows: list of (ticker, momentum_value, annualized_volatility)."""
    return pd.DataFrame(rows, columns=["Ticker", "momentum_value", "annualized_volatility"])


# ---------------------------------------------------------------------------
# add_zscore_and_momentum_score
# ---------------------------------------------------------------------------

class TestAddZscoreAndMomentumScore:
    def test_positive_and_negative_scores_use_correct_formula(self):
        df = make_metrics_df([
            ("AAA", 0.50, 0.20),   # wysoki risk-adjusted momentum -> Z > 0
            ("BBB", 0.10, 0.20),
            ("CCC", -0.30, 0.20),  # niski -> Z < 0
        ])
        out = add_zscore_and_momentum_score(df)

        for _, row in out.iterrows():
            z = row["z_score_winsorized"]
            if z > 0:
                assert row["momentum_score"] == pytest.approx(1 + z)
            elif z < 0:
                assert row["momentum_score"] == pytest.approx(1 / (1 - z))
            else:
                assert row["momentum_score"] == pytest.approx(1.0)

    def test_winsorization_caps_zscore_at_plus_minus_3(self):
        # Jedna spolka skrajnie odstajaca na tle wiekszej, ciasno skupionej
        # grupy (n=20) -> jej raw z-score musi przekroczyc 3 i zostac obciety.
        normal_values = [0.45 + 0.10 * i / 18 for i in range(19)]  # 0.45..0.55
        rows = [(f"N{i}", v, 0.20) for i, v in enumerate(normal_values)]
        rows.append(("OUTLIER", 10.0, 0.20))
        df = make_metrics_df(rows)
        out = add_zscore_and_momentum_score(df)
        assert out["z_score_winsorized"].max() <= 3.0
        assert out["z_score_winsorized"].min() >= -3.0
        # z_score (nieprzycięty) dla outliera powinien znaczaco przekraczac 3
        outlier_row = out[out["Ticker"] == "OUTLIER"].iloc[0]
        assert outlier_row["z_score"] > 3.0
        assert outlier_row["z_score_winsorized"] == 3.0

    def test_zero_sigma_yields_neutral_zscore(self):
        # Wszystkie spolki maja identyczny risk-adjusted momentum -> std=0.
        df = make_metrics_df([
            ("A", 0.20, 0.20),
            ("B", 0.20, 0.20),
            ("C", 0.20, 0.20),
        ])
        out = add_zscore_and_momentum_score(df)
        assert (out["z_score"] == 0.0).all()
        assert (out["momentum_score"] == 1.0).all()

    def test_single_row_has_nan_std_and_neutral_score(self):
        df = make_metrics_df([("A", 0.20, 0.20)])
        out = add_zscore_and_momentum_score(df)
        assert out.loc[0, "z_score"] == 0.0
        assert out.loc[0, "momentum_score"] == 1.0

    def test_rank_is_assigned_in_descending_score_order(self):
        df = make_metrics_df([
            ("LOW", 0.05, 0.20),
            ("HIGH", 0.90, 0.20),
            ("MID", 0.40, 0.20),
        ])
        out = add_zscore_and_momentum_score(df)
        assert list(out["rank"]) == [1, 2, 3]
        assert out.iloc[0]["Ticker"] == "HIGH"
        assert out.iloc[-1]["Ticker"] == "LOW"

    def test_ties_break_alphabetically_by_ticker_for_reproducibility(self):
        # Skrajne wartosci winsoryzowane do tego samego score -> tie-break po tickerze.
        df = make_metrics_df([
            ("ZEBRA", 100.0, 0.01),
            ("ALPHA", 100.0, 0.01),
            ("MID", 0.20, 0.20),
        ])
        out = add_zscore_and_momentum_score(df)
        tied = out[out["Ticker"].isin(["ZEBRA", "ALPHA"])]
        assert list(tied["Ticker"]) == ["ALPHA", "ZEBRA"]


# ---------------------------------------------------------------------------
# select_with_buffer
# ---------------------------------------------------------------------------

def make_ranked_df(tickers):
    """tickers: ranked list, best first -> rank 1..N."""
    return pd.DataFrame({"Ticker": tickers, "rank": range(1, len(tickers) + 1)})


class TestSelectWithBuffer:
    def test_empty_input_returns_empty_selection(self):
        df = make_ranked_df([])
        selected, target_count = select_with_buffer(df, current_tickers=set())
        assert selected == set()
        assert target_count == 0

    def test_no_buffer_needed_when_target_fits_lower_band_exactly(self):
        # 10 spolek, target = round(0.20*10) = 2, lower_band = floor(0.8*2) = 1,
        # upper_band = ceil(1.2*2) = 3 -> lower band selekcja da tylko 1, wiec
        # dociagniecie z current/nowych jest wymagane by dojsc do target_count=2.
        tickers = [f"T{i}" for i in range(1, 11)]
        df = make_ranked_df(tickers)
        selected, target_count = select_with_buffer(df, current_tickers=set())
        assert target_count == 2
        assert len(selected) == target_count
        # Bez zadnych current holdings, dobierane sa najlepiej rankowane.
        assert selected == {"T1", "T2"}

    def test_existing_holding_in_buffer_band_is_kept_over_new_name(self):
        # target_count=2 (n=10), lower_band=1, upper_band=3.
        # T3 jest obecnym holdingiem w paśmie buforowym (rank<=upper_band) -> powinien
        # zostac zachowany zamiast T2 (nowy), mimo ze T2 jest wyzej rankowany.
        tickers = [f"T{i}" for i in range(1, 11)]
        df = make_ranked_df(tickers)
        selected, target_count = select_with_buffer(df, current_tickers={"T3"})
        assert target_count == 2
        assert "T1" in selected  # zawsze w lower_band
        assert "T3" in selected  # obecny holding w upper_band, dociagniety zamiast T2
        assert "T2" not in selected
        assert len(selected) == target_count

    def test_target_count_capped_by_max_holdings(self):
        n = 2000  # round(0.20 * 2000) = 400 > MAX_HOLDINGS(100)
        tickers = [f"T{i}" for i in range(1, n + 1)]
        df = make_ranked_df(tickers)
        _, target_count = select_with_buffer(df, current_tickers=set())
        assert target_count == MAX_HOLDINGS

    def test_falls_back_to_non_current_names_when_buffer_band_insufficient(self):
        # Brak current holdings w paśmie buforowym -> wypelnienie kolejnymi
        # najlepiej rankowanymi spoza lower_band, aż do target_count.
        tickers = [f"T{i}" for i in range(1, 11)]
        df = make_ranked_df(tickers)
        selected, target_count = select_with_buffer(df, current_tickers={"T9"})
        assert target_count == 2
        # T9 nie miesci sie w upper_band (3) wiec nie jest dociagniety;
        # brakujace miejsce wypelnia T2 (najlepszy pozostały).
        assert selected == {"T1", "T2"}


# ---------------------------------------------------------------------------
# compute_weights
# ---------------------------------------------------------------------------

def make_selected_df(fmc_and_scores, universe=None):
    tickers = [f"T{i}" for i in range(len(fmc_and_scores))]
    fmc = [x[0] for x in fmc_and_scores]
    scores = [x[1] for x in fmc_and_scores]
    return pd.DataFrame({"Ticker": tickers, "fmc": fmc, "momentum_score": scores})


class TestComputeWeights:
    def test_weights_always_sum_to_one(self):
        df = make_selected_df([(100, 1.5), (50, 0.8), (25, 2.0), (10, 1.0)])
        out = compute_weights(df)
        assert out["weight"].sum() == pytest.approx(1.0)

    def test_no_weight_exceeds_the_hard_cap(self):
        # 12 spolek o rownej kapitalizacji (cap_weight_index=1/12 kazda) -> cap
        # per spolka = min(9%, 3*8.33%=25%) = 9%, suma capow = 108% >= 100%,
        # wiec test nie trafia w sciezke "cap_scaled_due_to_infeasibility".
        # Jedna spolka ma dominujacy momentum_score -> jej surowa waga (~90%)
        # musi zostac przycieta do dokladnie 9%, z nadwyzka rozdystrybuowana.
        df = make_selected_df([(100, 100.0)] + [(100, 1.0)] * 11)
        out = compute_weights(df)
        assert not out["cap_scaled_due_to_infeasibility"].iloc[0]
        dominant = out.iloc[0]
        assert dominant["weight"] == pytest.approx(MAX_WEIGHT, abs=1e-6)
        assert out["weight"].max() <= MAX_WEIGHT + 1e-9

    def test_dowjones_uses_equal_weighting_and_skips_caps(self):
        df = make_selected_df([(1, 1), (1000, 5), (1, 0.1)], universe="DOWJONES")
        out = compute_weights(df, universe="DOWJONES")
        assert all(w == pytest.approx(1.0 / len(df)) for w in out["weight"])
        assert not out["cap_scaled_due_to_infeasibility"].any()

    def test_cap_infeasibility_scales_caps_proportionally(self):
        # Selekcja mala (5 spolek rownej kapitalizacji): kazdy cap_weight_index=20%,
        # cap = min(9%, 3*20%=60%) = 9%. Suma capow = 5*9% = 45% < 100%
        # -> matematycznie niewykonalne bez przeskalowania.
        df = make_selected_df([(100, 1.0)] * 5)
        out = compute_weights(df)
        assert out["cap_scaled_due_to_infeasibility"].all()
        assert out["weight"].sum() == pytest.approx(1.0)

    def test_equal_inputs_yield_equal_weights(self):
        df = make_selected_df([(100, 1.0)] * 4)
        out = compute_weights(df)
        assert out["weight"].nunique() == 1
        assert out["weight"].iloc[0] == pytest.approx(0.25)

    def test_higher_momentum_score_yields_higher_raw_weight_share(self):
        # Sama kapitalizacja rowna, ale rozne momentum score -> wieksze score
        # powinno dostac proporcjonalnie wieksza wage (przy braku capowania).
        df = make_selected_df([(100, 1.0), (100, 1.0), (100, 1.0), (100, 3.0)])
        out = compute_weights(df)
        best = out[out["momentum_score"] == 3.0].iloc[0]
        others = out[out["momentum_score"] == 1.0]
        if not out["cap_scaled_due_to_infeasibility"].iloc[0]:
            assert best["weight"] > others["weight"].max()



# ---------------------------------------------------------------------------
# compute_equity_curve
# ---------------------------------------------------------------------------

def make_history_con():
    con = duckdb.connect(":memory:")
    con.execute("""
        CREATE TABLE portfolio_history (
            ref_date DATE, universe VARCHAR, rank_in_universe INTEGER,
            ticker VARCHAR, sector VARCHAR, price_at_rebalance DOUBLE,
            momentum_value DOUBLE, momentum_window VARCHAR, annualized_volatility DOUBLE,
            z_score DOUBLE, momentum_score DOUBLE, weight DOUBLE,
            PRIMARY KEY (ref_date, universe, ticker)
        )
    """)
    con.execute("""
        CREATE TABLE prices (
            Date DATE, Ticker VARCHAR, Close DOUBLE, Adj_Close DOUBLE, Volume BIGINT,
            PRIMARY KEY (Date, Ticker)
        )
    """)
    con.execute("""
        CREATE TABLE index_constituents (
            Ticker VARCHAR, Index_Name VARCHAR, Sector VARCHAR, fmc_etf DOUBLE,
            PRIMARY KEY (Ticker, Index_Name)
        )
    """)
    return con


def insert_history(con, rows):
    """rows: (ref_date, universe, rank, ticker, price_at_rebalance, weight)."""
    con.executemany(
        "INSERT INTO portfolio_history VALUES (?, ?, ?, ?, 'Tech', ?, 0.1, '12M', 0.2, 1.0, 1.5, ?)",
        rows,
    )


def insert_prices(con, rows):
    """rows: (date, ticker, close)."""
    con.executemany(
        "INSERT INTO prices VALUES (?, ?, ?, ?, 0)",
        [(d, t, c, c) for d, t, c in rows],
    )


class TestComputeEquityCurve:
    def test_no_history_returns_none(self):
        con = make_history_con()
        assert compute_equity_curve(con, "NASDAQ100") is None

    def test_single_ref_date_returns_none(self):
        con = make_history_con()
        insert_history(con, [("2026-01-01", "NASDAQ100", 1, "AAA", 100.0, 1.0)])
        assert compute_equity_curve(con, "NASDAQ100") is None

    def test_chained_return_for_fully_held_portfolio(self):
        # AAA +10%, BBB +10%, wagi 0.6/0.4 -> caly portfel +10% w tym okresie.
        con = make_history_con()
        insert_history(con, [
            ("2026-01-01", "NASDAQ100", 1, "AAA", 100.0, 0.6),
            ("2026-01-01", "NASDAQ100", 2, "BBB", 50.0, 0.4),
            ("2026-02-01", "NASDAQ100", 1, "AAA", 110.0, 0.5),
            ("2026-02-01", "NASDAQ100", 2, "BBB", 55.0, 0.5),
        ])
        curve = compute_equity_curve(con, "NASDAQ100")
        assert curve["dates"] == ["2026-01-01", "2026-02-01"]
        assert curve["momentum_index"] == [100.0, pytest.approx(110.0)]
        assert curve["approximated_periods"] == [False, False]

    def test_benchmark_includes_non_selected_constituents(self):
        # Benchmark (kup i trzymaj caly indeks) musi uwzglednic CCC, mimo ze
        # nie zostal wybrany do portfela momentum (nie ma go w portfolio_history).
        con = make_history_con()
        insert_history(con, [
            ("2026-01-01", "NASDAQ100", 1, "AAA", 100.0, 0.6),
            ("2026-01-01", "NASDAQ100", 2, "BBB", 50.0, 0.4),
            ("2026-02-01", "NASDAQ100", 1, "AAA", 110.0, 0.5),
            ("2026-02-01", "NASDAQ100", 2, "BBB", 55.0, 0.5),
        ])
        con.executemany("INSERT INTO index_constituents VALUES (?, 'NASDAQ100', 'Tech', ?)", [
            ("AAA", 100.0), ("BBB", 100.0), ("CCC", 200.0),
        ])
        insert_prices(con, [
            ("2026-01-01", "AAA", 100.0), ("2026-02-01", "AAA", 110.0),
            ("2026-01-01", "BBB", 50.0), ("2026-02-01", "BBB", 55.0),
            ("2026-01-01", "CCC", 100.0), ("2026-02-01", "CCC", 90.0),
        ])
        curve = compute_equity_curve(con, "NASDAQ100")
        # Momentum: 0.6*10% + 0.4*10% = +10% -> 110.0 (nie widzi CCC wcale)
        assert curve["momentum_index"][1] == pytest.approx(110.0)
        # Benchmark wazony fmc (0.25/0.25/0.5): 0.25*10% + 0.25*10% + 0.5*(-10%) = 0%
        assert curve["benchmark_index"][1] == pytest.approx(100.0)

    def test_dropped_ticker_uses_prices_table_when_available(self):
        # BBB wypada z selekcji do t1, ale jego cena wciaz jest w `prices`
        # (rolling window jeszcze ja obejmuje) -> wklad liczony dokladnie.
        con = make_history_con()
        insert_history(con, [
            ("2026-01-01", "NASDAQ100", 1, "AAA", 100.0, 0.5),
            ("2026-01-01", "NASDAQ100", 2, "BBB", 50.0, 0.5),
            ("2026-02-01", "NASDAQ100", 1, "AAA", 110.0, 1.0),
        ])
        insert_prices(con, [("2026-02-01", "BBB", 55.0)])
        curve = compute_equity_curve(con, "NASDAQ100")
        # 0.5*(110/100-1) + 0.5*(55/50-1) = 0.05 + 0.05 = +10%
        assert curve["momentum_index"][1] == pytest.approx(110.0)
        assert curve["approximated_periods"] == [False, False]

    def test_dropped_ticker_without_price_is_flagged_approximated(self):
        # BBB wypada z selekcji i jego cena juz nie istnieje w `prices`
        # (poza rolling window) -> wklad pominiety (0%), okres oznaczony.
        con = make_history_con()
        insert_history(con, [
            ("2026-01-01", "NASDAQ100", 1, "AAA", 100.0, 0.5),
            ("2026-01-01", "NASDAQ100", 2, "BBB", 50.0, 0.5),
            ("2026-02-01", "NASDAQ100", 1, "AAA", 110.0, 1.0),
        ])
        curve = compute_equity_curve(con, "NASDAQ100")
        # Tylko AAA liczony: 0.5*(110/100-1) = +5%
        assert curve["momentum_index"][1] == pytest.approx(105.0)
        assert curve["approximated_periods"] == [False, True]


# ---------------------------------------------------------------------------
# compute_index_returns / compute_index_leaders (Global Equity Momentum)
# ---------------------------------------------------------------------------

def make_gem_con():
    con = duckdb.connect(":memory:")
    con.execute("""
        CREATE TABLE index_prices (
            Date DATE, Index_Name VARCHAR, Close DOUBLE, Adj_Close DOUBLE, Volume BIGINT,
            PRIMARY KEY (Date, Index_Name)
        )
    """)
    con.execute("""
        CREATE TABLE prices (
            Date DATE, Ticker VARCHAR, Close DOUBLE, Adj_Close DOUBLE, Volume BIGINT,
            High DOUBLE, Low DOUBLE,
            PRIMARY KEY (Date, Ticker)
        )
    """)
    con.execute("""
        CREATE TABLE index_constituents (
            Ticker VARCHAR, Index_Name VARCHAR, Sector VARCHAR, fmc_etf DOUBLE,
            PRIMARY KEY (Ticker, Index_Name)
        )
    """)
    return con


class TestComputeIndexReturns:
    def test_no_table_returns_empty_list(self):
        con = duckdb.connect(":memory:")
        assert compute_index_returns(con, "2026-02-01") == []

    def test_ranks_universes_by_return_descending(self):
        con = make_gem_con()
        con.executemany("INSERT INTO index_prices VALUES (?, ?, ?, ?, 0)", [
            ("2025-02-01", "NASDAQ100", 100.0, 100.0),
            ("2026-02-01", "NASDAQ100", 130.0, 130.0),   # +30%
            ("2025-02-01", "DOWJONES", 100.0, 100.0),
            ("2026-02-01", "DOWJONES", 105.0, 105.0),    # +5%
        ])
        out = compute_index_returns(con, "2026-02-01", lookback_months=12)
        assert [r["universe"] for r in out] == ["NASDAQ100", "DOWJONES"]
        assert out[0]["return_pct"] == pytest.approx(30.0)

    def test_universe_missing_lookback_data_is_skipped(self):
        con = make_gem_con()
        con.executemany("INSERT INTO index_prices VALUES (?, ?, ?, ?, 0)", [
            ("2026-01-15", "NASDAQ100", 100.0, 100.0),  # brak ceny sprzed 12 mies. -> pominiete
        ])
        out = compute_index_returns(con, "2026-02-01", lookback_months=12)
        assert out == []


class TestComputeIndexLeaders:
    def test_ranks_by_contribution_not_raw_return(self):
        # SMALL ma wyzszy zwrot, ale znikoma wage w indeksie -> BIG (nizszy zwrot,
        # ale dominujaca waga) powinien miec wiekszy wklad w zwrot indeksu i wygrac.
        con = make_gem_con()
        con.executemany("INSERT INTO index_constituents VALUES (?, 'NASDAQ100', 'Tech', ?)", [
            ("BIG", 900.0), ("SMALL", 10.0),
        ])
        con.executemany("INSERT INTO prices (Date, Ticker, Close, Adj_Close, Volume) VALUES (?, ?, ?, ?, 0)", [
            ("2025-02-01", "BIG", 100.0, 100.0),
            ("2026-02-01", "BIG", 120.0, 120.0),     # +20%, waga ~98.9%
            ("2025-02-01", "SMALL", 100.0, 100.0),
            ("2026-02-01", "SMALL", 300.0, 300.0),   # +200%, waga ~1.1%
        ])
        out = compute_index_leaders(con, "NASDAQ100", "2026-02-01", lookback_months=12, top_n=10)
        assert out[0]["ticker"] == "BIG"
        assert out[0]["rank"] == 1

    def test_top_n_limits_result_count(self):
        con = make_gem_con()
        rows_const = [(f"T{i}", "NASDAQ100", "Tech", 10.0) for i in range(15)]
        con.executemany("INSERT INTO index_constituents VALUES (?, ?, ?, ?)", rows_const)
        rows_px = []
        for i in range(15):
            rows_px.append(("2025-02-01", f"T{i}", 100.0, 100.0, 0))
            rows_px.append(("2026-02-01", f"T{i}", 100.0 + i, 100.0 + i, 0))
        con.executemany("INSERT INTO prices (Date, Ticker, Close, Adj_Close, Volume) VALUES (?, ?, ?, ?, ?)", rows_px)
        out = compute_index_leaders(con, "NASDAQ100", "2026-02-01", lookback_months=12, top_n=5)
        assert len(out) == 5

    def test_missing_price_data_returns_empty_list(self):
        con = make_gem_con()
        assert compute_index_leaders(con, "NASDAQ100", "2026-02-01") == []


# ---------------------------------------------------------------------------
# export_global_equity_momentum: ref_date=None musi sam wziac najswiezsza date
# z index_prices, NIEZALEZNIE od ref_date pipeline'u 3 glownych uniwersow (ktory
# pochodzi z tabeli `prices` skladnikow i odswieza sie tylko raz w miesiacu) —
# to jest to, co pozwala codziennemu workflow (fetch_data.py --indices-only +
# run_query.py --gem-only) faktycznie odswiezac wynik codziennie.
# ---------------------------------------------------------------------------

class TestExportGlobalEquityMomentum:
    def test_auto_derives_ref_date_from_index_prices_watermark(self, tmp_path):
        con = make_gem_con()
        con.executemany("INSERT INTO index_prices VALUES (?, ?, ?, ?, 0)", [
            ("2025-03-15", "NASDAQ100", 100.0, 100.0),
            ("2026-03-15", "NASDAQ100", 120.0, 120.0),   # +20%, najswiezsza data w index_prices
            ("2025-03-15", "DOWJONES", 100.0, 100.0),
            ("2026-03-15", "DOWJONES", 105.0, 105.0),
        ])
        export_global_equity_momentum(con, str(tmp_path))

        payload = json.loads((tmp_path / "global_equity_momentum.json").read_text())
        assert payload["ref_date"] == "2026-03-15"  # nie jakas inna data pipeline'u
        assert payload["winner"] == "NASDAQ100"

    def test_no_index_prices_data_writes_nothing(self, tmp_path):
        con = duckdb.connect(":memory:")
        export_global_equity_momentum(con, str(tmp_path))
        assert not (tmp_path / "global_equity_momentum.json").exists()


# ---------------------------------------------------------------------------
# compute_index_momentum / compute_relative_strength_leaders / export_relative_strength
# (Siła relatywna, NASDAQ100 + DOWJONES, TO SAMO okno co momentum_value skladnikow)
# ---------------------------------------------------------------------------

def insert_daily_series(con, table, id_column, id_value, start_date, end_date, start_price, step_per_day):
    """Wstawia ciag dziennych cen (dni robocze), rosnacych liniowo o step_per_day
    kazdego kolejnego dnia sesyjnego, od start_price w start_date. Zwraca
    {Timestamp: price} do wyliczenia oczekiwanych wartosci w asercjach. Wstawia
    po nazwach kolumn (nie pozycyjnie): `prices` ma tez High/Low (patrz
    make_gem_con), ktorych ta funkcja nie ustawia — zostaja NULL."""
    dates = pd.bdate_range(start=start_date, end=end_date)
    prices, rows = {}, []
    for i, d in enumerate(dates):
        price = start_price + i * step_per_day
        prices[d] = price
        rows.append((d.strftime("%Y-%m-%d"), id_value, price, price, 1000))
    con.executemany(f"INSERT INTO {table} (Date, {id_column}, Close, Adj_Close, Volume) VALUES (?, ?, ?, ?, ?)", rows)
    return prices


def nearest_price_on_or_before(prices, target_date):
    candidates = [d for d in prices if d <= target_date]
    return prices[max(candidates)]


class TestComputeIndexMomentum:
    def test_12m_window_matches_get_universe_metrics_convention(self):
        con = make_gem_con()
        ref_date = pd.Timestamp("2026-03-16")
        prices = insert_daily_series(con, "index_prices", "Index_Name", "NASDAQ100",
                                      "2024-06-01", "2026-03-16", 100.0, 0.1)
        out = compute_index_momentum(con, "NASDAQ100", "2026-03-16")
        assert out is not None
        assert out["momentum_window"] == "12M"
        price_m2 = nearest_price_on_or_before(prices, ref_date - pd.DateOffset(months=2))
        price_m14 = nearest_price_on_or_before(prices, ref_date - pd.DateOffset(months=14))
        assert out["momentum_value"] == pytest.approx(price_m2 / price_m14 - 1)

    def test_falls_back_to_9m_window_when_no_14m_history(self):
        con = make_gem_con()
        ref_date = pd.Timestamp("2026-03-16")
        # Historia siega do 2025-03-01: dalej niz M-11 (2025-04-16), ale krocej niz
        # M-14 (2025-01-16) -> brak M-14, jest M-11 -> fallback do okna 9M.
        prices = insert_daily_series(con, "index_prices", "Index_Name", "NASDAQ100",
                                      "2025-03-01", "2026-03-16", 100.0, 0.1)
        out = compute_index_momentum(con, "NASDAQ100", "2026-03-16")
        assert out is not None
        assert out["momentum_window"] == "9M (fallback)"
        price_m2 = nearest_price_on_or_before(prices, ref_date - pd.DateOffset(months=2))
        price_m11 = nearest_price_on_or_before(prices, ref_date - pd.DateOffset(months=11))
        assert out["momentum_value"] == pytest.approx(price_m2 / price_m11 - 1)

    def test_no_table_returns_none(self):
        con = duckdb.connect(":memory:")
        assert compute_index_momentum(con, "NASDAQ100", "2026-03-16") is None

    def test_insufficient_history_returns_none(self):
        con = make_gem_con()
        insert_daily_series(con, "index_prices", "Index_Name", "NASDAQ100", "2026-02-01", "2026-03-16", 100.0, 0.1)
        assert compute_index_momentum(con, "NASDAQ100", "2026-03-16") is None


class TestComputeRelativeStrengthLeaders:
    def test_only_stocks_beating_index_momentum_are_included_and_sorted_by_edge(self):
        con = make_gem_con()
        con.executemany("INSERT INTO index_constituents VALUES (?, 'NASDAQ100', 'Tech', 100.0)", [
            ("WINNER",), ("LOSER",), ("BARELY",),
        ])
        # Wszystkie maja pelne 14 mies. historii (okno 12M), ale rozny step_per_day ->
        # rozny surowy zwrot: WINNER najszybszy, BARELY srednio, LOSER ledwo rosnie.
        insert_daily_series(con, "prices", "Ticker", "WINNER", "2024-06-01", "2026-03-16", 100.0, 0.30)
        insert_daily_series(con, "prices", "Ticker", "LOSER", "2024-06-01", "2026-03-16", 100.0, 0.02)
        insert_daily_series(con, "prices", "Ticker", "BARELY", "2024-06-01", "2026-03-16", 100.0, 0.15)

        out = compute_relative_strength_leaders(con, "NASDAQ100", "2026-03-16", index_return_pct=20.0,
                                                  min_trading_days=5, max_staleness_days=10)
        assert [r["ticker"] for r in out] == ["WINNER", "BARELY"]
        assert out[0]["relative_strength_pct"] > out[1]["relative_strength_pct"] > 0

    def test_missing_price_data_returns_empty_list(self):
        con = make_gem_con()
        assert compute_relative_strength_leaders(con, "NASDAQ100", "2026-03-16", index_return_pct=10.0,
                                                   min_trading_days=150, max_staleness_days=10) == []


class TestExportRelativeStrength:
    def test_writes_only_nasdaq100_and_dowjones_and_auto_derives_ref_date(self, tmp_path):
        con = make_gem_con()
        prices_by_universe = {
            universe: insert_daily_series(con, "index_prices", "Index_Name", universe,
                                           "2024-06-01", "2026-03-16", 100.0, 0.05)
            for universe in ["NASDAQ100", "DOWJONES"]
        }
        actual_ref_date = max(prices_by_universe["NASDAQ100"]).strftime("%Y-%m-%d")

        con.executemany("INSERT INTO index_constituents VALUES ('WIN', ?, 'Tech', 100.0)", [
            ("NASDAQ100",), ("DOWJONES",),
        ])
        insert_daily_series(con, "prices", "Ticker", "WIN", "2024-06-01", "2026-03-16", 100.0, 1.0)  # bije oba indeksy

        export_relative_strength(con, str(tmp_path))

        payload = json.loads((tmp_path / "relative_strength.json").read_text())
        assert payload["ref_date"] == actual_ref_date
        assert set(payload["universes"].keys()) == {"NASDAQ100", "DOWJONES"}
        assert payload["universes"]["NASDAQ100"]["leaders"][0]["ticker"] == "WIN"
        assert payload["universes"]["DOWJONES"]["leaders"][0]["ticker"] == "WIN"
        assert payload["universes"]["NASDAQ100"]["leaders"][0]["weekly_chart"] is not None
        assert payload["universes"]["NASDAQ100"]["leaders"][0]["mansfield_chart"] is not None

    def test_no_index_prices_writes_nothing(self, tmp_path):
        con = duckdb.connect(":memory:")
        export_relative_strength(con, str(tmp_path))
        assert not (tmp_path / "relative_strength.json").exists()


# ---------------------------------------------------------------------------
# compute_relative_strength_chart: wykres (nie-TradingView) dla panelu Siły
# Relatywnej w stylu stage analysis (Weinstein/Dr Eric Wish) — "wykres 10:30"
# (cena + SMA10/SMA30 tygodniowo) razem z poziomem wlasnego indeksu, wszystko
# przeliczone na % zmiany wzgledem pierwszego wyswietlanego tygodnia.
# ---------------------------------------------------------------------------

def insert_weekly_series(con, table, id_column, id_value, start_monday, n_weeks, start_price, weekly_step):
    """Wstawia n_weeks kolejnych poniedziałkowych cen (start_price, +weekly_step co
    tydzień) do `table` (prices albo index_prices) — DATE_TRUNC('week', ...) na
    dacie poniedziałkowej jest no-opem, więc unikamy niejednoznaczności co do
    konwencji początku tygodnia w DuckDB."""
    mondays = pd.date_range(start=start_monday, periods=n_weeks, freq="7D")
    rows = [
        (d.strftime("%Y-%m-%d"), id_value, start_price + i * weekly_step, start_price + i * weekly_step, 0)
        for i, d in enumerate(mondays)
    ]
    # Kolumny po nazwie (nie pozycyjnie): `prices` ma tez High/Low (patrz make_gem_con),
    # ktorych te testy nie ustawiaja — zostaja NULL, buying_volume liczy sie wtedy
    # na neutralnym 50/50 (patrz CASE w _weekly_close_series), co przy Volume=0 w tych
    # fixture'ach i tak daje buying_volume=0, bez zmiany zachowania testow.
    con.executemany(f"INSERT INTO {table} (Date, {id_column}, Close, Adj_Close, Volume) VALUES (?, ?, ?, ?, ?)", rows)
    return mondays


def insert_weekly_close_list(con, table, id_column, id_value, start_monday, closes):
    """Jak insert_weekly_series, ale przyjmuje jawna liste zamkniec zamiast liniowego
    kroku — potrzebne tam, gdzie fixture musi zawierac prawdziwa pauze (pudelko
    Darvasa nigdy sie nie potwierdza w czysto monotonicznym wzroscie, patrz
    _compute_weinstein_stage_series)."""
    mondays = pd.date_range(start=start_monday, periods=len(closes), freq="7D")
    rows = [(d.strftime("%Y-%m-%d"), id_value, c, c, 0) for d, c in zip(mondays, closes)]
    con.executemany(f"INSERT INTO {table} (Date, {id_column}, Close, Adj_Close, Volume) VALUES (?, ?, ?, ?, ?)", rows)
    return mondays


def darvas_breakout_closes():
    """80 tyg.: 55 tyg. gladkiego wzrostu (NIGDY nie tworzy pudelka — kazdy tydzien
    to nowy rekord, wiec dv_top_age nigdy nie dobija do DARVAS_BOX_CONFIRM_WEEKS),
    potem 10 tyg. ciasnej oscylacji 153/154 tygodnia (tworzy prawdziwe pudelko:
    szczyt potwierdzony po 3 tyg. bez nowego rekordu w tyg. 57, dolek po kolejnych
    3 w tyg. 60), wybicie w tyg. 65 (>= tyg. 60 = start_date, wiec widoczne w
    wyswietlanym oknie), dalszy wzrost do konca 80-tygodniowej serii."""
    closes = [100.0 + i for i in range(55)]
    closes += [153.0, 154.0] * 5
    closes += [160.0]
    closes += [161.0 + i for i in range(14)]
    return closes


class TestComputeRelativeStrengthChart:
    def test_10_30_and_index_pct_have_values_from_first_displayed_week(self):
        con = make_gem_con()
        start_date = pd.Timestamp("2026-01-05")
        ref_date = pd.Timestamp("2026-03-30")
        # Dane siegaja 60 tyg. PRZED start_date -> wiecej niz potrzebny zapas
        # (RS_PRICE_SMA_LONG_WEEKS + 2 = 32 tyg.), zeby SMA30 miala juz wartosc
        # na pierwszym WYSWIETLANYM tygodniu (start_date), nie dopiero pare
        # miesiecy pozniej.
        fixture_start = start_date - pd.Timedelta(weeks=60)
        # AAA rosnie proporcjonalnie szybciej niz NASDAQ100 (1/100 vs 0.3/200
        # tygodniowo) -> po rebase'owaniu do % powinna konczyc wyzej niz indeks.
        insert_weekly_series(con, "prices", "Ticker", "AAA", fixture_start.strftime("%Y-%m-%d"), 80, 100.0, 1.0)
        insert_weekly_series(con, "index_prices", "Index_Name", "NASDAQ100",
                              fixture_start.strftime("%Y-%m-%d"), 80, 200.0, 0.3)

        out = compute_relative_strength_chart(con, "AAA", "NASDAQ100", ref_date.strftime("%Y-%m-%d"),
                                                start_date.strftime("%Y-%m-%d"))
        assert out is not None
        assert out["dates"][0] == "2026-01-05"
        assert out["sma10_pct"][0] is not None
        assert out["sma30_pct"][0] is not None
        # Pierwszy wyswietlany tydzien to punkt odniesienia (rebase) -> 0% dla obu.
        assert out["close_pct"][0] == 0.0
        assert out["index_pct"][0] == 0.0
        assert out["close_pct"][-1] > out["close_pct"][0]
        assert out["index_pct"][-1] > out["index_pct"][0]
        # Spolka silniejsza od rynku w tym oknie -> konczy powyzej linii indeksu.
        assert out["close_pct"][-1] > out["index_pct"][-1]

    def test_insufficient_lookback_leaves_first_week_sma30_as_none(self):
        con = make_gem_con()
        start_date = pd.Timestamp("2026-01-05")
        ref_date = pd.Timestamp("2026-03-30")
        # Tylko 5 tygodni historii PRZED start_date -> za malo na SMA30 przy
        # pierwszym wyswietlanym tygodniu (musi byc None, nie blad).
        fixture_start = start_date - pd.Timedelta(weeks=5)
        insert_weekly_series(con, "prices", "Ticker", "AAA", fixture_start.strftime("%Y-%m-%d"), 17, 100.0, 1.0)
        insert_weekly_series(con, "index_prices", "Index_Name", "NASDAQ100",
                              fixture_start.strftime("%Y-%m-%d"), 17, 200.0, 0.3)

        out = compute_relative_strength_chart(con, "AAA", "NASDAQ100", ref_date.strftime("%Y-%m-%d"),
                                                start_date.strftime("%Y-%m-%d"))
        assert out is not None
        assert out["sma30_pct"][0] is None
        assert out["index_pct"][0] == 0.0

    def test_no_stock_history_returns_none(self):
        con = make_gem_con()
        insert_weekly_series(con, "index_prices", "Index_Name", "NASDAQ100", "2025-01-06", 60, 200.0, 0.3)
        assert compute_relative_strength_chart(con, "NOPE", "NASDAQ100", "2026-03-30", "2026-01-05") is None

    def test_no_index_history_returns_none(self):
        con = make_gem_con()
        insert_weekly_series(con, "prices", "Ticker", "AAA", "2025-01-06", 60, 100.0, 1.0)
        assert compute_relative_strength_chart(con, "AAA", "NASDAQ100", "2026-03-30", "2026-01-05") is None

    def test_output_carries_stage_analysis_fields(self):
        # Integracyjny check: compute_relative_strength_chart faktycznie dolacza
        # wolumen + klasyfikacje etapow (_compute_weinstein_stage_series) do kazdego
        # wyswietlanego tygodnia, nie tylko linie ceny/SMA. Uzywa darvas_breakout_
        # closes() (nie czystego liniowego wzrostu z insert_weekly_series) — prawdziwe
        # pudelko Darvasa nigdy sie nie potwierdza w monotonicznym wzroscie (kazdy
        # tydzien to nowy rekord), wiec bez pauzy w danych "breakout" nigdy by sie
        # nie pojawil i etap zostalby na "1" do konca okna.
        con = make_gem_con()
        start_date = pd.Timestamp("2026-01-05")
        ref_date = pd.Timestamp("2026-03-30")
        fixture_start = start_date - pd.Timedelta(weeks=60)
        insert_weekly_close_list(con, "prices", "Ticker", "AAA", fixture_start.strftime("%Y-%m-%d"),
                                  darvas_breakout_closes())
        insert_weekly_series(con, "index_prices", "Index_Name", "NASDAQ100",
                              fixture_start.strftime("%Y-%m-%d"), 80, 200.0, 0.3)

        out = compute_relative_strength_chart(con, "AAA", "NASDAQ100", ref_date.strftime("%Y-%m-%d"),
                                                start_date.strftime("%Y-%m-%d"))
        assert out is not None
        for key in ("volume", "buying_volume", "buying_volume_ratio", "stage", "signal",
                    "stop_level_pct", "base_count"):
            assert key in out
            assert len(out[key]) == len(out["dates"])
        # Wybicie z pudelka nastepuje w tyg. 65 (patrz darvas_breakout_closes) -> do
        # ref_date spolka powinna byc juz w etapie zaawansowania (2A/2B), nie 1/3/4.
        assert out["current_stage"] in ("2A", "2B")
        # Wolumen jest tu zawsze 0 (insert_weekly_close_list) -> buying_volume=0 i
        # buying_volume_ratio zawsze None (0/0 pominiete w _compute_weinstein_
        # stage_series) -> ENTRY_2A (wymaga jawnego potwierdzenia wolumenem
        # kupujacych) nigdy sie nie pojawia, ale ENTRY_2B (akceptuje brak danych
        # o wolumenie) owszem, przy kolejnych bazach.
        assert all(v == 0 for v in out["buying_volume"])
        assert all(v is None for v in out["buying_volume_ratio"])
        assert all(s != "ENTRY_2A" for s in out["signal"])
        # Regresja na quirk pandas iterrows(), ktory potrafi po cichu zamienic None
        # na NaN przy mieszaniu kolumn float/object w jednym wierszu (patrz komentarz
        # w compute_relative_strength_chart) — NaN w miejsce None wyeksportowalby sie
        # do JSON jako niepoprawny literal `NaN`.
        assert "NaN" not in json.dumps(out)

    def test_output_carries_base_boxes_for_frontend_trendlines(self):
        # "bases" (patrz docstring compute_relative_strength_chart) to geometria
        # wykrytych baz do narysowania jako prostokat/trendlinia na wykresie —
        # integracyjny check, ze faktycznie sie eksportuje i ma sensowny ksztalt.
        # darvas_breakout_closes() zawiera dokladnie jedno potwierdzone pudelko
        # (wybicie w tyg. 65, patrz jego docstring) widoczne w wyswietlanym oknie.
        con = make_gem_con()
        start_date = pd.Timestamp("2026-01-05")
        ref_date = pd.Timestamp("2026-03-30")
        fixture_start = start_date - pd.Timedelta(weeks=60)
        insert_weekly_close_list(con, "prices", "Ticker", "AAA", fixture_start.strftime("%Y-%m-%d"),
                                  darvas_breakout_closes())
        insert_weekly_series(con, "index_prices", "Index_Name", "NASDAQ100",
                              fixture_start.strftime("%Y-%m-%d"), 80, 200.0, 0.3)

        out = compute_relative_strength_chart(con, "AAA", "NASDAQ100", ref_date.strftime("%Y-%m-%d"),
                                                start_date.strftime("%Y-%m-%d"))
        assert out is not None
        assert "bases" in out
        assert out["bases"], "spodziewano sie co najmniej jednej wykrytej bazy (pudelka Darvasa)"
        for base in out["bases"]:
            assert base["kind"] in ("stage1", "stage2")
            assert base["start_date"] in out["dates"]
            assert base["end_date"] in out["dates"]
            assert out["dates"].index(base["start_date"]) <= out["dates"].index(base["end_date"])
            assert base["resistance_pct"] >= base["support_pct"]
        assert "NaN" not in json.dumps(out)


# ---------------------------------------------------------------------------
# _compute_weinstein_stage_series: klasyfikacja etapow Weinsteina (1/2A/2B/3/4)
# + sygnaly wejscia/wyjscia + potwierdzenie wolumenem, na podstawie samej pozycji
# i nachylenia SMA30 wzgledem ceny (patrz uzasadnienie w run_query.py — bez linii
# GLB/dlugoterminowego oporu bazy, z tego samego powodu co reszta wykresu 10:30).
# ---------------------------------------------------------------------------

def make_stage_df(closes, volumes=None, buying_volumes=None):
    """buying_volumes domyslnie = volumes (caly wolumen "kupujacy") — wiekszosc
    testow nie testuje samego rozbicia kupujacy/sprzedajacy tylko reszte logiki
    etapow, wiec to zachowuje ich zamierzona semantyke (STAGE_BREAKOUT_VOLUME_RATIO
    etc. licza sie teraz z buying_volume, patrz run_query.py). Testy, ktore
    faktycznie sprawdzaja rozbicie na kupujacych/sprzedajacych, podaja
    buying_volumes jawnie (mniejsze niz volumes)."""
    volumes = volumes if volumes is not None else [1000] * len(closes)
    buying_volumes = buying_volumes if buying_volumes is not None else volumes
    df = pd.DataFrame({"close": closes, "volume": volumes, "buying_volume": buying_volumes})
    df["sma10"] = df["close"].rolling(RS_PRICE_SMA_SHORT_WEEKS).mean()
    df["sma30"] = df["close"].rolling(RS_PRICE_SMA_LONG_WEEKS).mean()
    return df


class TestComputeWeinsteinStageSeries:
    def test_flat_base_then_breakout_on_volume_is_entry_2a(self):
        # 40 plaskich tygodni (baza, Etap 1) + tydzien wybicia na 3x sredniego wolumenu.
        closes = [100.0] * 41
        closes[-1] = 130.0
        volumes = [1000] * 41
        volumes[-1] = 3000

        rows = _compute_weinstein_stage_series(make_stage_df(closes, volumes))
        assert rows[39]["stage"] == "1"
        assert rows[40]["stage"] == "2A"
        assert rows[40]["signal"] == "ENTRY_2A"
        assert rows[40]["buying_volume_ratio"] == pytest.approx(3.0)

    def test_breakout_without_volume_confirmation_has_no_entry_signal(self):
        # Ten sam breakout, ale wolumen ledwo powyzej sredniej (1.1x < próg 1.5x)
        # -> etap 2A rozpoznany, ale BEZ sygnalu wejscia (brak potwierdzenia).
        closes = [100.0] * 41
        closes[-1] = 130.0
        volumes = [1000] * 41
        volumes[-1] = 1100

        rows = _compute_weinstein_stage_series(make_stage_df(closes, volumes))
        assert rows[40]["stage"] == "2A"
        assert rows[40]["signal"] is None
        assert rows[40]["buying_volume_ratio"] < STAGE_BREAKOUT_VOLUME_RATIO

    def test_breakout_dominated_by_selling_volume_has_no_entry_signal(self):
        # Sedno zgloszonego problemu: TOTAL wolumen moze byc wysoki mimo ze
        # tydzien byl w wiekszosci dystrybucja (sprzedaz), nie akumulacja. Taki
        # tydzien NIE powinien potwierdzac wybicia, mimo ze surowy wolumen
        # przebijalby prog 1.5x — bo liczy sie tylko wolumen KUPUJACYCH.
        closes = [100.0] * 41
        closes[-1] = 130.0
        volumes = [1000] * 41
        volumes[-1] = 3000            # total wolumen 3x sredniej...
        buying_volumes = [1000] * 41
        buying_volumes[-1] = 900      # ...ale wolumen KUPUJACYCH ponizej sredniej (dystrybucja, nie akumulacja)

        rows = _compute_weinstein_stage_series(make_stage_df(closes, volumes, buying_volumes))
        assert rows[40]["stage"] == "2A"
        assert rows[40]["signal"] is None
        assert rows[40]["buying_volume_ratio"] < STAGE_BREAKOUT_VOLUME_RATIO

    def test_breakout_confirmed_by_buying_volume_even_if_total_volume_is_unremarkable(self):
        # Odwrotny przypadek: total wolumen ledwo rusza sie od sredniej, ale
        # niemal caly ten wolumen to kupujacy (bardzo mocna akumulacja) ->
        # powinno to potwierdzic wybicie, mimo ze "surowy" wolumen by nie wystarczyl.
        closes = [100.0] * 41
        closes[-1] = 130.0
        volumes = [1000] * 41
        volumes[-1] = 1600             # total wolumen tylko 1.6x sredniej
        buying_volumes = [1000] * 41
        buying_volumes[-1] = 1600      # ale caly ten wolumen to kupujacy -> 1.6x >= progu 1.5x

        rows = _compute_weinstein_stage_series(make_stage_df(closes, volumes, buying_volumes))
        assert rows[40]["stage"] == "2A"
        assert rows[40]["signal"] == "ENTRY_2A"
        assert rows[40]["buying_volume_ratio"] == pytest.approx(1.6)

    @staticmethod
    def _zigzag_base(level, weeks, amplitude=1.5):
        """Ciasna, oscylujaca 'baza' (trading range) w stylu ksiazkowych rysunkow —
        NIE plaska linia, zeby base_high/base_low mialy realny rozstep."""
        return [level + (amplitude if w % 2 == 0 else -amplitude) for w in range(weeks)]

    def _multi_base_uptrend_fixture(self):
        """Odtwarza ksiazkowy rysunek 'Stage Analysis Investor method — Trailing
        Stop Loss': 40-tyg. rozgrzewka (spadek, zeby SMA30 mialo juz historie),
        potem baza (Etap 1) -> wybicie na wolumenie (2A, tydz. 50) -> 2. baza (2B,
        tydz. 59) -> 3. baza (2B, tydz. 68) -> 4. baza (2B_LATE, tydz. 77, wg
        ksiazki bardziej podatna na niepowodzenie) -> zalamanie przez trailing stop."""
        closes = [60.0 - i * 0.5 for i in range(40)]
        volumes = [1000] * 40
        closes += self._zigzag_base(40, 10)
        volumes += [1000] * 10
        closes += [48]
        volumes += [3000]  # wybicie 1. bazy na wolumenie
        closes += self._zigzag_base(48.5, 8, 1.2)
        volumes += [1000] * 8
        closes += [55]
        volumes += [1600]  # wybicie 2. bazy
        closes += self._zigzag_base(66, 8, 2.5)
        volumes += [1000] * 8
        closes += [78]
        volumes += [1500]  # wybicie 3. bazy
        closes += self._zigzag_base(88, 8, 2.5)
        volumes += [1000] * 8
        closes += [95]
        volumes += [1400]  # wybicie 4. bazy (late)
        closes += [90, 80, 68, 55, 45]  # zalamanie -> przez trailing stop
        volumes += [1000] * 5
        return make_stage_df(closes, volumes)

    def test_first_base_breakout_after_decline_is_entry_2a_with_stop_below_base(self):
        rows = _compute_weinstein_stage_series(self._multi_base_uptrend_fixture())
        assert rows[49]["stage"] == "4"
        assert rows[50]["stage"] == "2A"
        assert rows[50]["signal"] == "ENTRY_2A"
        assert rows[50]["base_count"] == 1
        # Stop musi byc POD baza wybicia (baza oscylowala ok. 38.5-41.5).
        assert rows[50]["stop_level"] == pytest.approx(38.5)

    def test_subsequent_bases_in_same_run_are_entry_2b_with_rising_stop(self):
        rows = _compute_weinstein_stage_series(self._multi_base_uptrend_fixture())
        assert rows[59]["signal"] == "ENTRY_2B"
        assert rows[59]["base_count"] == 2
        assert rows[68]["signal"] == "ENTRY_2B"
        assert rows[68]["base_count"] == 3
        # Trailing stop tylko PODNOSZONY, nigdy obnizany, w miare kolejnych baz.
        assert rows[59]["stop_level"] > rows[50]["stop_level"]
        assert rows[68]["stop_level"] > rows[59]["stop_level"]

    def test_fourth_base_in_same_run_is_flagged_late(self):
        # Ksiazka: "4th & 5th bases within the Stage 2 advance are more prone to
        # failure. So watch for warning signs."
        rows = _compute_weinstein_stage_series(self._multi_base_uptrend_fixture())
        assert rows[77]["base_count"] == 4
        assert rows[77]["signal"] == "ENTRY_2B_LATE"

    def test_trailing_stop_break_after_late_base_triggers_exit_stop(self):
        rows = _compute_weinstein_stage_series(self._multi_base_uptrend_fixture())
        # Trend traci sile (Etap 3) zanim faktycznie zlamie stop.
        assert rows[80]["stage"] == "3"
        assert rows[80]["signal"] is None
        assert rows[81]["signal"] == "EXIT_STOP"
        # Po wyjsciu stan fali jest resetowany.
        assert rows[81]["stop_level"] is None
        assert rows[81]["base_count"] is None

    def test_downtrend_below_falling_sma30_is_stage_4(self):
        closes = [200.0 - i for i in range(60)]
        rows = _compute_weinstein_stage_series(make_stage_df(closes))
        assert rows[59]["stage"] == "4"
        assert rows[59]["signal"] is None

    def test_ma_losing_momentum_warns_before_stop_is_hit(self):
        # Spolka po wybiciu rosnie w tempie wygaszajacym sie (klasyczny wzorzec
        # szczytu) -> WARNING_MA_SLOWING powinno pojawic sie WYRAZNIE wczesniej
        # niz faktyczne zlamanie trailing stopu (EXIT_STOP).
        closes = [60.0 - i * 0.5 for i in range(40)]
        volumes = [1000] * 40
        closes += self._zigzag_base(40, 10)
        volumes += [1000] * 10
        closes += [48]
        volumes += [3000]
        for w in range(60):
            val = 48 + 40 * (1 - math.exp(-w / 15))
            closes.append(val + (1.0 if w % 2 == 0 else -1.0))
            volumes.append(1000)
        # Prawdziwe pudelko Darvasa (patrz _compute_weinstein_stage_series) nigdy tu
        # nie podnosi stopu ponad poziom z pierwszego wybicia (bazy 1) — wygladzajacy
        # sie wzrost przez 60 tyg. nigdy nie tworzy DRUGIEGO potwierdzonego pudelka
        # (kazdy szczyt jest bity w ciagu <3 tyg.), wiec spadek musi byc dosc gleboki,
        # zeby faktycznie zlamac ten pierwotny stop.
        closes += [closes[-1] - 2, closes[-1] - 6, closes[-1] - 12, closes[-1] - 20, closes[-1] - 30,
                   closes[-1] - 45, closes[-1] - 60]
        volumes += [1000] * 7

        rows = _compute_weinstein_stage_series(make_stage_df(closes, volumes))
        warning_weeks = [i for i, r in enumerate(rows) if r["signal"] == "WARNING_MA_SLOWING"]
        exit_weeks = [i for i, r in enumerate(rows) if r["signal"] == "EXIT_STOP"]
        assert warning_weeks, "WARNING_MA_SLOWING nigdy sie nie pojawilo"
        assert exit_weeks, "EXIT_STOP nigdy sie nie pojawilo"
        assert warning_weeks[0] < exit_weeks[0]

    def test_insufficient_history_yields_none_stage(self):
        rows = _compute_weinstein_stage_series(make_stage_df([100.0] * 10))
        assert all(r["stage"] is None and r["signal"] is None and r["buying_volume_ratio"] is None
                   and r["stop_level"] is None and r["base_count"] is None for r in rows)

    def test_base_after_genuine_stage4_decline_is_tagged_stage1(self):
        # Rysunek 'multi-base uptrend' zaczyna sie od realnego 40-tyg. spadku
        # (Etap 4) przed pierwsza baza -> ta baza to prawdziwe dno, "stage1".
        rows = _compute_weinstein_stage_series(self._multi_base_uptrend_fixture())
        assert rows[49]["stage"] == "4"
        assert rows[50]["base_event"]["kind"] == "stage1"
        assert rows[50]["base_event"]["base_count"] == 1

    def test_subsequent_bases_in_same_run_are_tagged_stage2_continuation(self):
        rows = _compute_weinstein_stage_series(self._multi_base_uptrend_fixture())
        for i in (59, 68, 77):
            assert rows[i]["base_event"]["kind"] == "stage2"

    def test_breakout_without_prior_stage4_is_tagged_stage2_not_stage1(self):
        # Baza plaska bez zadnego wczesniejszego Etapu 4 w historii (wybicie od
        # razu na 41. tygodniu, patrz test_flat_base_then_breakout_on_volume_is_
        # entry_2a) -> nie ma potwierdzonego dna, wiec liczy sie jako kontynuacja
        # ("stage2"), nie prawdziwy Etap 1, zgodnie z zasada "Etap 1 tylko po
        # Etapie 4, reszta to kontynuacja Etapu 2".
        closes = [100.0] * 41
        closes[-1] = 130.0
        volumes = [1000] * 41
        volumes[-1] = 3000
        rows = _compute_weinstein_stage_series(make_stage_df(closes, volumes))
        assert rows[40]["base_event"]["kind"] == "stage2"
        assert not any(r["stage"] == "4" for r in rows if r)


# ---------------------------------------------------------------------------
# compute_mansfield_rs_chart: oscylator Mansfield RS w dwoch wygladzeniach
# (krotkoterminowym ~3 mies., srednioterminowym ~6 mies.) na WLASNYM, krotkim
# ostatnim ~6-miesiecznym oknie — celowo ODCZEPIONYM od okna momentum_value
# uzywanego przez compute_relative_strength_chart, zeby oba wygladzenia realnie
# miescily sie w rolling ~15-miesiecznym oknie prices.
# ---------------------------------------------------------------------------

class TestComputeMansfieldRsChart:
    def test_short_and_medium_rsm_have_values_from_first_displayed_week(self):
        con = make_gem_con()
        ref_date = pd.Timestamp("2026-06-29")
        display_start = ref_date - pd.Timedelta(weeks=26)
        # Dane siegaja 44 tyg. PRZED display_start -> wiecej niz potrzebny zapas
        # (RS_MANSFIELD_MEDIUM_WEEKS - 1 = 25 tyg.), zeby oba wygladzenia mialy juz
        # wartosc na pierwszym WYSWIETLANYM tygodniu (display_start), nie dopiero
        # pare miesiecy pozniej.
        fixture_start = display_start - pd.Timedelta(weeks=44)
        # AAA rosnie proporcjonalnie szybciej niz NASDAQ100 (1/100 vs 0.3/200
        # tygodniowo) -> RS (cena/indeks) systematycznie przyspiesza.
        insert_weekly_series(con, "prices", "Ticker", "AAA", fixture_start.strftime("%Y-%m-%d"), 75, 100.0, 1.0)
        insert_weekly_series(con, "index_prices", "Index_Name", "NASDAQ100",
                              fixture_start.strftime("%Y-%m-%d"), 75, 200.0, 0.3)

        out = compute_mansfield_rs_chart(con, "AAA", "NASDAQ100", ref_date.strftime("%Y-%m-%d"))
        assert out is not None
        assert out["dates"][0] == display_start.strftime("%Y-%m-%d")
        assert out["rsm_short"][0] is not None
        assert out["rsm_medium"][0] is not None
        # RS przyspiesza -> pod koniec okna oba wygladzenia sa dodatnie (RS powyzej
        # wlasnej sredniej).
        assert out["rsm_short"][-1] > 0
        assert out["rsm_medium"][-1] > 0

    def test_insufficient_lookback_leaves_medium_none_but_short_populated(self):
        con = make_gem_con()
        ref_date = pd.Timestamp("2026-06-29")
        display_start = ref_date - pd.Timedelta(weeks=26)
        # 15 tyg. historii PRZED display_start: wystarczy na krotkoterminowe
        # wygladzenie (potrzeba RS_MANSFIELD_SHORT_WEEKS - 1 = 12 tyg.), za malo na
        # srednioterminowe (potrzeba RS_MANSFIELD_MEDIUM_WEEKS - 1 = 25 tyg.).
        fixture_start = display_start - pd.Timedelta(weeks=15)
        insert_weekly_series(con, "prices", "Ticker", "AAA", fixture_start.strftime("%Y-%m-%d"), 42, 100.0, 1.0)
        insert_weekly_series(con, "index_prices", "Index_Name", "NASDAQ100",
                              fixture_start.strftime("%Y-%m-%d"), 42, 200.0, 0.3)

        out = compute_mansfield_rs_chart(con, "AAA", "NASDAQ100", ref_date.strftime("%Y-%m-%d"))
        assert out is not None
        assert out["rsm_short"][0] is not None
        assert out["rsm_medium"][0] is None

    def test_no_stock_history_returns_none(self):
        con = make_gem_con()
        insert_weekly_series(con, "index_prices", "Index_Name", "NASDAQ100", "2025-01-06", 60, 200.0, 0.3)
        assert compute_mansfield_rs_chart(con, "NOPE", "NASDAQ100", "2026-03-30") is None

    def test_no_index_history_returns_none(self):
        con = make_gem_con()
        insert_weekly_series(con, "prices", "Ticker", "AAA", "2025-01-06", 60, 100.0, 1.0)
        assert compute_mansfield_rs_chart(con, "AAA", "NASDAQ100", "2026-03-30") is None


# ---------------------------------------------------------------------------
# export_json: kazda spolka w GLOWNYM eksporcie per-uniwersum (docs/data/*.json)
# dostaje teraz wlasny weekly_chart/mansfield_chart (patrz process_universe) —
# nie tylko liderzy panelu Sily Relatywnej (export_relative_strength).
# ---------------------------------------------------------------------------

def make_weighted_df_fixture():
    return pd.DataFrame([
        {"rank_in_universe": 1, "Ticker": "AAA", "Sector": "Tech", "price_now": 123.45,
         "momentum_value": 0.20, "momentum_window": "12M", "annualized_volatility": 0.30,
         "z_score": 1.0, "momentum_score": 2.0, "weight": 0.05,
         "cap_scaled_due_to_infeasibility": False},
        {"rank_in_universe": 2, "Ticker": "BBB", "Sector": "Health", "price_now": 50.0,
         "momentum_value": 0.10, "momentum_window": "9M (fallback)", "annualized_volatility": 0.25,
         "z_score": 0.5, "momentum_score": 1.5, "weight": 0.03,
         "cap_scaled_due_to_infeasibility": False},
    ])


class TestExportJson:
    def test_attaches_weekly_and_mansfield_charts_per_ticker(self, tmp_path):
        df = make_weighted_df_fixture()
        weekly_charts = {"AAA": {"dates": ["2026-01-05"], "close_pct": [0.0]}}
        mansfield_charts = {"AAA": {"dates": ["2026-01-05"], "rsm_short": [1.0], "rsm_medium": [2.0]}}

        export_json(df, "NASDAQ100", "2026-03-30", str(tmp_path), n_missing_fmc=0,
                    weekly_charts=weekly_charts, mansfield_charts=mansfield_charts)

        payload = json.loads((tmp_path / "nasdaq100.json").read_text())
        by_ticker = {c["ticker"]: c for c in payload["constituents"]}
        assert by_ticker["AAA"]["weekly_chart"] == weekly_charts["AAA"]
        assert by_ticker["AAA"]["mansfield_chart"] == mansfield_charts["AAA"]
        # BBB nie ma wpisu w slownikach (np. brak danych indeksu dla tego tickera w
        # danym momencie) -> None w JSON, nie blad.
        assert by_ticker["BBB"]["weekly_chart"] is None
        assert by_ticker["BBB"]["mansfield_chart"] is None

    def test_defaults_to_none_when_charts_not_provided(self, tmp_path):
        df = make_weighted_df_fixture()
        export_json(df, "NASDAQ100", "2026-03-30", str(tmp_path), n_missing_fmc=0)
        payload = json.loads((tmp_path / "nasdaq100.json").read_text())
        assert all(c["weekly_chart"] is None and c["mansfield_chart"] is None
                   for c in payload["constituents"])
