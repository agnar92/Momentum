"""
Testy jednostkowe dla czystych funkcji obliczeniowych w run_query.py
(z-score/momentum score, selekcja z regula bufora, wagi z capami, equity curve) oraz
integracyjne testy logiki rebalansu koszyka top-momentum (na lokalnej bazie DuckDB
:memory:, bez sieci). Wiekszosc funkcji operuje wylacznie na DataFrame'ach;
compute_equity_curve czyta z portfolio_history/prices/index_constituents, a
resolve_top_basket z portfolio_history/top_basket_rebalances, wiec ich testy
uzywaja polaczenia DuckDB ":memory:".
"""
import duckdb
import pandas as pd
import pytest

from run_query import (
    MAX_HOLDINGS,
    MAX_WEIGHT,
    add_zscore_and_momentum_score,
    build_top_basket,
    compute_equity_curve,
    compute_weights,
    resolve_top_basket,
    select_with_buffer,
)


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
# build_top_basket
# ---------------------------------------------------------------------------

def make_weighted_df(rows):
    """rows: list of (ticker, sector, price_now, momentum_value, annualized_volatility, momentum_score)."""
    return pd.DataFrame(rows, columns=[
        "Ticker", "Sector", "price_now", "momentum_value", "annualized_volatility", "momentum_score",
    ])


class TestBuildTopBasket:
    def test_takes_top_n_by_momentum_score_from_each_universe(self):
        sp500 = make_weighted_df([
            ("A", "Tech", 100.0, 0.30, 0.20, 2.5),
            ("B", "Tech", 50.0, 0.10, 0.20, 1.2),
            ("C", "Health", 20.0, -0.05, 0.20, 0.8),
        ])
        nasdaq = make_weighted_df([
            ("D", "Tech", 200.0, 0.40, 0.25, 3.0),
        ])
        out = build_top_basket(sp500, nasdaq, sp500_n=2, nasdaq100_n=1)
        tickers = [r["ticker"] for r in out]
        assert tickers == ["D", "A", "B"]  # posortowane po momentum_pct malejaco
        assert "C" not in tickers  # spoza top 2 wg momentum_score w SP500

    def test_overlapping_ticker_merges_universes_without_duplicate(self):
        sp500 = make_weighted_df([("AAPL", "Tech", 100.0, 0.20, 0.20, 2.0)])
        nasdaq = make_weighted_df([("AAPL", "Tech", 100.0, 0.20, 0.20, 2.2)])
        out = build_top_basket(sp500, nasdaq, sp500_n=5, nasdaq100_n=5)
        assert len(out) == 1
        assert sorted(out[0]["universes"]) == ["NASDAQ100", "SP500"]

    def test_rank_is_assigned_sequentially(self):
        sp500 = make_weighted_df([
            ("A", "Tech", 10.0, 0.10, 0.20, 1.0),
            ("B", "Tech", 10.0, 0.20, 0.20, 2.0),
        ])
        out = build_top_basket(sp500, None, sp500_n=5, nasdaq100_n=5)
        assert [r["rank"] for r in out] == [1, 2]
        assert out[0]["ticker"] == "B"  # wyzszy momentum_pct -> rank 1

    def test_handles_missing_universe_gracefully(self):
        sp500 = make_weighted_df([("A", "Tech", 10.0, 0.10, 0.20, 1.0)])
        out = build_top_basket(sp500, None)
        assert len(out) == 1
        assert out[0]["universes"] == ["SP500"]

        out_empty = build_top_basket(None, None)
        assert out_empty == []


# ---------------------------------------------------------------------------
# resolve_top_basket (rebalans co TOP_BASKET_REBALANCE_MONTHS miesiecy,
# odswiezanie cen/momentum co miesiac niezaleznie od rebalansu)
# ---------------------------------------------------------------------------

def make_portfolio_history_con(rows):
    """rows: list of dict z kluczami ref_date/universe/ticker/sector/price_at_rebalance/
    momentum_value/annualized_volatility (reszta kolumn dostaje sensowny default)."""
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
    for r in rows:
        con.execute(
            "INSERT INTO portfolio_history VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [r["ref_date"], r["universe"], r.get("rank_in_universe", 1), r["ticker"], r["sector"],
             r["price_at_rebalance"], r["momentum_value"], r.get("momentum_window", "14M"),
             r["annualized_volatility"], r.get("z_score", 0.0), r.get("momentum_score", 1.0),
             r.get("weight", 0.1)],
        )
    return con


class TestResolveTopBasket:
    def test_first_run_triggers_rebalance_and_persists(self):
        con = duckdb.connect(":memory:")
        sp500 = make_weighted_df([("A", "Tech", 10.0, 0.10, 0.20, 1.0)])
        records, rebalanced, rebalance_ref_date = resolve_top_basket(con, "2026-01-01", sp500, None)
        assert rebalanced is True
        assert rebalance_ref_date == "2026-01-01"
        assert [r["ticker"] for r in records] == ["A"]
        stored = con.execute(
            "SELECT ticker FROM top_basket_rebalances WHERE ref_date = DATE '2026-01-01'"
        ).df()
        assert stored["ticker"].tolist() == ["A"]

    def test_no_rebalance_before_interval_elapsed_but_metrics_refresh(self):
        con = make_portfolio_history_con([
            dict(ref_date="2026-01-01", universe="SP500", ticker="A", sector="Tech",
                 price_at_rebalance=100.0, momentum_value=0.10, annualized_volatility=0.20),
            dict(ref_date="2026-02-01", universe="SP500", ticker="A", sector="Tech",
                 price_at_rebalance=110.0, momentum_value=0.15, annualized_volatility=0.22),
        ])
        sp500_jan = make_weighted_df([("A", "Tech", 100.0, 0.10, 0.20, 1.0)])
        resolve_top_basket(con, "2026-01-01", sp500_jan, None)  # rebalans na styczen

        # luty: mniej niz 6 miesiecy od stycznia -> bez rebalansu, ale metryki z lutego
        records, rebalanced, rebalance_ref_date = resolve_top_basket(con, "2026-02-01", None, None)
        assert rebalanced is False
        assert rebalance_ref_date == "2026-01-01"
        assert records[0]["price"] == pytest.approx(110.0)
        assert records[0]["momentum_pct"] == pytest.approx(15.0)
        assert records[0]["stale"] is False

    def test_rebalance_after_interval_elapses(self):
        con = make_portfolio_history_con([
            dict(ref_date="2026-01-01", universe="SP500", ticker="A", sector="Tech",
                 price_at_rebalance=100.0, momentum_value=0.10, annualized_volatility=0.20),
        ])
        sp500_jan = make_weighted_df([("A", "Tech", 100.0, 0.10, 0.20, 1.0)])
        resolve_top_basket(con, "2026-01-01", sp500_jan, None)

        sp500_jul = make_weighted_df([("B", "Health", 50.0, 0.30, 0.25, 2.0)])
        records, rebalanced, rebalance_ref_date = resolve_top_basket(con, "2026-07-01", sp500_jul, None)
        assert rebalanced is True
        assert rebalance_ref_date == "2026-07-01"
        assert [r["ticker"] for r in records] == ["B"]

    def test_held_ticker_missing_current_month_data_is_marked_stale(self):
        con = make_portfolio_history_con([
            dict(ref_date="2026-01-01", universe="SP500", ticker="A", sector="Tech",
                 price_at_rebalance=100.0, momentum_value=0.10, annualized_volatility=0.20),
            # brak wiersza na 2026-02-01 dla A (np. wypadla z kwintylowej selekcji w tym miesiacu)
        ])
        sp500_jan = make_weighted_df([("A", "Tech", 100.0, 0.10, 0.20, 1.0)])
        resolve_top_basket(con, "2026-01-01", sp500_jan, None)

        records, rebalanced, _ = resolve_top_basket(con, "2026-02-01", None, None)
        assert rebalanced is False
        assert records[0]["stale"] is True
        assert records[0]["price"] == pytest.approx(100.0)  # ostatnie dostepne dane, sprzed miesiaca


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
        assert compute_equity_curve(con, "SP500") is None

    def test_single_ref_date_returns_none(self):
        con = make_history_con()
        insert_history(con, [("2026-01-01", "SP500", 1, "AAA", 100.0, 1.0)])
        assert compute_equity_curve(con, "SP500") is None

    def test_chained_return_for_fully_held_portfolio(self):
        # AAA +10%, BBB +10%, wagi 0.6/0.4 -> caly portfel +10% w tym okresie.
        con = make_history_con()
        insert_history(con, [
            ("2026-01-01", "SP500", 1, "AAA", 100.0, 0.6),
            ("2026-01-01", "SP500", 2, "BBB", 50.0, 0.4),
            ("2026-02-01", "SP500", 1, "AAA", 110.0, 0.5),
            ("2026-02-01", "SP500", 2, "BBB", 55.0, 0.5),
        ])
        curve = compute_equity_curve(con, "SP500")
        assert curve["dates"] == ["2026-01-01", "2026-02-01"]
        assert curve["momentum_index"] == [100.0, pytest.approx(110.0)]
        assert curve["approximated_periods"] == [False, False]

    def test_benchmark_includes_non_selected_constituents(self):
        # Benchmark (kup i trzymaj caly indeks) musi uwzglednic CCC, mimo ze
        # nie zostal wybrany do portfela momentum (nie ma go w portfolio_history).
        con = make_history_con()
        insert_history(con, [
            ("2026-01-01", "SP500", 1, "AAA", 100.0, 0.6),
            ("2026-01-01", "SP500", 2, "BBB", 50.0, 0.4),
            ("2026-02-01", "SP500", 1, "AAA", 110.0, 0.5),
            ("2026-02-01", "SP500", 2, "BBB", 55.0, 0.5),
        ])
        con.executemany("INSERT INTO index_constituents VALUES (?, 'SP500', 'Tech', ?)", [
            ("AAA", 100.0), ("BBB", 100.0), ("CCC", 200.0),
        ])
        insert_prices(con, [
            ("2026-01-01", "AAA", 100.0), ("2026-02-01", "AAA", 110.0),
            ("2026-01-01", "BBB", 50.0), ("2026-02-01", "BBB", 55.0),
            ("2026-01-01", "CCC", 100.0), ("2026-02-01", "CCC", 90.0),
        ])
        curve = compute_equity_curve(con, "SP500")
        # Momentum: 0.6*10% + 0.4*10% = +10% -> 110.0 (nie widzi CCC wcale)
        assert curve["momentum_index"][1] == pytest.approx(110.0)
        # Benchmark wazony fmc (0.25/0.25/0.5): 0.25*10% + 0.25*10% + 0.5*(-10%) = 0%
        assert curve["benchmark_index"][1] == pytest.approx(100.0)

    def test_dropped_ticker_uses_prices_table_when_available(self):
        # BBB wypada z selekcji do t1, ale jego cena wciaz jest w `prices`
        # (rolling window jeszcze ja obejmuje) -> wklad liczony dokladnie.
        con = make_history_con()
        insert_history(con, [
            ("2026-01-01", "SP500", 1, "AAA", 100.0, 0.5),
            ("2026-01-01", "SP500", 2, "BBB", 50.0, 0.5),
            ("2026-02-01", "SP500", 1, "AAA", 110.0, 1.0),
        ])
        insert_prices(con, [("2026-02-01", "BBB", 55.0)])
        curve = compute_equity_curve(con, "SP500")
        # 0.5*(110/100-1) + 0.5*(55/50-1) = 0.05 + 0.05 = +10%
        assert curve["momentum_index"][1] == pytest.approx(110.0)
        assert curve["approximated_periods"] == [False, False]

    def test_dropped_ticker_without_price_is_flagged_approximated(self):
        # BBB wypada z selekcji i jego cena juz nie istnieje w `prices`
        # (poza rolling window) -> wklad pominiety (0%), okres oznaczony.
        con = make_history_con()
        insert_history(con, [
            ("2026-01-01", "SP500", 1, "AAA", 100.0, 0.5),
            ("2026-01-01", "SP500", 2, "BBB", 50.0, 0.5),
            ("2026-02-01", "SP500", 1, "AAA", 110.0, 1.0),
        ])
        curve = compute_equity_curve(con, "SP500")
        # Tylko AAA liczony: 0.5*(110/100-1) = +5%
        assert curve["momentum_index"][1] == pytest.approx(105.0)
        assert curve["approximated_periods"] == [False, True]
