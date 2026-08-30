"""
Testy jednostkowe dla czystych funkcji parsujacych w fetch_data.py oraz
integracyjny test dla load_index_constituents (CSV -> DuckDB), zbudowany
na tymczasowych plikach CSV zamiast prawdziwych holdings ETF-ow.
"""
import duckdb
import pandas as pd
import pytest

from fetch_data import (
    _find_column,
    _parse_money,
    get_full_refresh_range,
    load_index_constituents,
)


# ---------------------------------------------------------------------------
# _parse_money
# ---------------------------------------------------------------------------

class TestParseMoney:
    def test_strips_thousands_separators(self):
        out = _parse_money(pd.Series(["12,365,349,776.05"]))
        assert out.iloc[0] == pytest.approx(12365349776.05)

    def test_strips_surrounding_quotes(self):
        out = _parse_money(pd.Series(['"1,234.50"']))
        assert out.iloc[0] == pytest.approx(1234.50)

    def test_plain_numeric_strings_pass_through(self):
        out = _parse_money(pd.Series(["500.0", "0", "-25.5"]))
        assert list(out) == pytest.approx([500.0, 0.0, -25.5])

    def test_unparseable_values_become_nan(self):
        out = _parse_money(pd.Series(["not-a-number", "", "N/A"]))
        assert out.isna().all()

    def test_already_numeric_input(self):
        out = _parse_money(pd.Series([100, 200.5]))
        assert list(out) == pytest.approx([100.0, 200.5])


# ---------------------------------------------------------------------------
# _find_column
# ---------------------------------------------------------------------------

class TestFindColumn:
    def test_returns_first_matching_candidate_in_priority_order(self):
        df = pd.DataFrame(columns=["Symbol", "Ticker"])
        assert _find_column(df, ["Ticker", "Symbol", "Holding Ticker"]) == "Ticker"

    def test_falls_back_to_later_candidate_when_first_is_absent(self):
        df = pd.DataFrame(columns=["Symbol"])
        assert _find_column(df, ["Ticker", "Symbol", "Holding Ticker"]) == "Symbol"

    def test_returns_none_when_no_candidate_present(self):
        df = pd.DataFrame(columns=["SomethingElse"])
        assert _find_column(df, ["Ticker", "Symbol"]) is None


# ---------------------------------------------------------------------------
# get_full_refresh_range
# ---------------------------------------------------------------------------

class TestGetFullRefreshRange:
    def test_end_date_is_last_day_of_previous_month(self):
        _, end = get_full_refresh_range(lookback_months=12)
        end_ts = pd.Timestamp(end)
        today = pd.Timestamp.today()
        expected_end = today.replace(day=1) - pd.Timedelta(days=1)
        assert end_ts.normalize() == expected_end.normalize()

    def test_start_date_is_lookback_months_before_end_date(self):
        start, end = get_full_refresh_range(lookback_months=15)
        assert pd.Timestamp(start) == pd.Timestamp(end) - pd.DateOffset(months=15)

    def test_zero_lookback_collapses_start_and_end(self):
        start, end = get_full_refresh_range(lookback_months=0)
        assert start == end


# ---------------------------------------------------------------------------
# load_index_constituents (CSV -> DuckDB), z syntetycznymi plikami CSV
# ---------------------------------------------------------------------------

CSPX_CSV = """Fund holdings as of ignored-metadata-line
Ticker,Sector,Market Value,Asset Class
AAA,Technology,"1,234.50",Equity
BBB,Financials,500.00,Equity
USD,Cash,"1,000,000.00",Cash
FUT,Index Futures,10000.00,Futures
"""


class TestLoadIndexConstituents:
    def test_loads_equity_rows_and_filters_non_equity(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        (tmp_path / "CSPX_holdings.csv").write_text(CSPX_CSV)

        con = duckdb.connect(":memory:")
        load_index_constituents(con)

        rows = con.execute(
            "SELECT Ticker, Index_Name, Sector, fmc_etf FROM index_constituents ORDER BY Ticker"
        ).fetchall()
        tickers = [r[0] for r in rows]
        assert tickers == ["AAA", "BBB"]  # USD (cash) i FUT (futures) odfiltrowane

        by_ticker = {r[0]: r for r in rows}
        assert by_ticker["AAA"][3] == pytest.approx(1234.50)
        assert by_ticker["AAA"][1] == "SP500"
        assert by_ticker["AAA"][2] == "Technology"

    def test_missing_csv_file_is_skipped_without_raising(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        # Zaden z trzech plikow CSPX/CNDX/CIND nie istnieje w tmp_path.
        con = duckdb.connect(":memory:")
        load_index_constituents(con)  # nie powinno rzucic wyjatku

        count = con.execute("SELECT COUNT(*) FROM index_constituents").fetchone()[0]
        assert count == 0

    def test_missing_market_value_column_yields_null_fmc(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        csv_no_mv = "metadata\nTicker,Sector,Asset Class\nCCC,Health Care,Equity\n"
        (tmp_path / "CNDX_holdings.csv").write_text(csv_no_mv)

        con = duckdb.connect(":memory:")
        load_index_constituents(con)

        row = con.execute(
            "SELECT Ticker, fmc_etf FROM index_constituents WHERE Ticker = 'CCC'"
        ).fetchone()
        assert row is not None
        assert row[1] is None

    def test_duplicate_ticker_rows_are_deduplicated(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        csv_dupe = (
            "metadata\n"
            "Ticker,Sector,Market Value,Asset Class\n"
            "DUP,Technology,100.00,Equity\n"
            "DUP,Technology,100.00,Equity\n"
        )
        (tmp_path / "CIND_holdings.csv").write_text(csv_dupe)

        con = duckdb.connect(":memory:")
        load_index_constituents(con)

        count = con.execute(
            "SELECT COUNT(*) FROM index_constituents WHERE Ticker = 'DUP'"
        ).fetchone()[0]
        assert count == 1
