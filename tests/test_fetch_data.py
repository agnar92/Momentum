"""
Testy jednostkowe dla czystych funkcji parsujacych w fetch_data.py oraz
integracyjny test dla load_index_constituents (CSV -> DuckDB), zbudowany
na tymczasowych plikach CSV zamiast prawdziwych holdings ETF-ow.
"""
import duckdb
import pandas as pd
import pytest

from fetch_data import (
    INDEX_LEVEL_SYMBOLS,
    PRICES_SCHEMA,
    _download_price_rows,
    _find_column,
    _parse_money,
    _prices_table_has_rows,
    _to_yf_symbol,
    _upsert_price_rows,
    get_full_refresh_range,
    load_index_constituents,
    update_index_prices,
    update_prices_incremental,
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

CNDX_CSV = """Fund holdings as of ignored-metadata-line
Ticker,Sector,Market Value,Asset Class
AAA,Technology,"1,234.50",Equity
BBB,Financials,500.00,Equity
USD,Cash,"1,000,000.00",Cash
FUT,Index Futures,10000.00,Futures
"""


class TestLoadIndexConstituents:
    def test_loads_equity_rows_and_filters_non_equity(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        (tmp_path / "CNDX_holdings.csv").write_text(CNDX_CSV)

        con = duckdb.connect(":memory:")
        load_index_constituents(con)

        rows = con.execute(
            "SELECT Ticker, Index_Name, Sector, fmc_etf FROM index_constituents ORDER BY Ticker"
        ).fetchall()
        tickers = [r[0] for r in rows]
        assert tickers == ["AAA", "BBB"]  # USD (cash) i FUT (futures) odfiltrowane

        by_ticker = {r[0]: r for r in rows}
        assert by_ticker["AAA"][3] == pytest.approx(1234.50)
        assert by_ticker["AAA"][1] == "NASDAQ100"
        assert by_ticker["AAA"][2] == "Technology"

    def test_missing_csv_file_is_skipped_without_raising(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        # Zaden z dwoch plikow CNDX/CIND nie istnieje w tmp_path.
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

    def test_no_market_residual_positions_are_filtered(self, tmp_path, monkeypatch):
        """Rezydualne udzialy bez rynku notowan (np. po wykupie/delistingu) maja
        znikoma wartosc i nigdy nie dostana ceny z yfinance — odfiltrowujemy je
        na etapie wczytywania CSV, tak jak gotowke/futures."""
        monkeypatch.chdir(tmp_path)
        csv_no_market = (
            "metadata\n"
            "Ticker,Sector,Market Value,Asset Class,Exchange\n"
            "GOOD,Technology,1000.00,Equity,NASDAQ\n"
            "STALE,Health Care,5.00,Equity,NO MARKET (E.G. UNLISTED)\n"
        )
        (tmp_path / "CNDX_holdings.csv").write_text(csv_no_market)

        con = duckdb.connect(":memory:")
        load_index_constituents(con)

        tickers = {r[0] for r in con.execute("SELECT Ticker FROM index_constituents").fetchall()}
        assert tickers == {"GOOD"}


# ---------------------------------------------------------------------------
# _to_yf_symbol / _download_price_rows: mapowanie tickerow klas akcji na
# konwencje yfinance (np. "BRKB" -> "BRK-B"), przy zachowaniu kanonicznej
# nazwy tickera (z CSV) w zapisanych wierszach.
# ---------------------------------------------------------------------------

class TestToYfSymbol:
    def test_known_dual_class_tickers_are_translated(self):
        assert _to_yf_symbol("BRKB") == "BRK-B"
        assert _to_yf_symbol("BFB") == "BF-B"

    def test_unmapped_ticker_passes_through_unchanged(self):
        assert _to_yf_symbol("AAPL") == "AAPL"


class TestDownloadPriceRows:
    def test_translates_ticker_for_yfinance_but_stores_canonical_name(self, monkeypatch):
        dates = pd.to_datetime(["2024-01-02", "2024-01-03"])
        columns = pd.MultiIndex.from_product([["AAA", "BRK-B"], ["Close", "Adj Close", "Volume"]])
        fake_data = pd.DataFrame(
            [[10.0, 10.0, 100, 20.0, 20.0, 200],
             [11.0, 11.0, 100, 21.0, 21.0, 200]],
            index=dates, columns=columns,
        )
        captured = {}

        def fake_download(tickers, **kwargs):
            captured["tickers"] = tickers
            return fake_data

        monkeypatch.setattr("fetch_data.yf.download", fake_download)
        rows, fetched, failed = _download_price_rows(["AAA", "BRKB"], "2024-01-02", "2024-01-04")

        assert captured["tickers"] == ["AAA", "BRK-B"]  # BRKB przetlumaczony na potrzeby yfinance
        assert {r[1] for r in rows} == {"AAA", "BRKB"}  # ale zapisany pod kanonicznym tickerem z CSV
        assert fetched == {"AAA", "BRKB"}
        assert failed == []


def _make_prices_con(rows):
    """rows: lista (date_str, ticker, close, adj_close, volume)."""
    con = duckdb.connect(":memory:")
    con.execute(f"CREATE TABLE prices ({PRICES_SCHEMA})")
    if rows:
        df = pd.DataFrame(rows, columns=["Date", "Ticker", "Close", "Adj_Close", "Volume"])  # noqa: F841
        con.execute("INSERT INTO prices SELECT * FROM df")
    return con


class TestPricesTableHasRows:
    def test_false_when_table_missing(self):
        con = duckdb.connect(":memory:")
        assert _prices_table_has_rows(con) is False

    def test_false_when_table_empty(self):
        con = _make_prices_con([])
        assert _prices_table_has_rows(con) is False

    def test_true_when_table_has_rows(self):
        con = _make_prices_con([("2024-01-02", "AAA", 10.0, 10.0, 100)])
        assert _prices_table_has_rows(con) is True


class TestUpsertPriceRows:
    def test_replaces_rows_in_range_for_given_tickers(self):
        con = _make_prices_con([
            ("2024-01-02", "AAA", 10.0, 10.0, 100),
            ("2024-01-03", "AAA", 11.0, 11.0, 100),
        ])
        new_rows = [("2024-01-03", "AAA", 99.0, 99.0, 999)]
        _upsert_price_rows(con, new_rows, ["AAA"], "2024-01-03")

        out = con.execute("SELECT Date, Close FROM prices ORDER BY Date").df()
        assert len(out) == 2
        assert out.iloc[0]["Close"] == pytest.approx(10.0)   # przed zakresem — nietkniete
        assert out.iloc[1]["Close"] == pytest.approx(99.0)   # w zakresie — nadpisane

    def test_does_not_touch_other_tickers(self):
        con = _make_prices_con([
            ("2024-01-03", "AAA", 11.0, 11.0, 100),
            ("2024-01-03", "BBB", 22.0, 22.0, 100),
        ])
        _upsert_price_rows(con, [("2024-01-03", "AAA", 99.0, 99.0, 999)], ["AAA"], "2024-01-01")

        bbb = con.execute("SELECT Close FROM prices WHERE Ticker = 'BBB'").fetchone()[0]
        assert bbb == pytest.approx(22.0)

    def test_empty_ticker_list_is_a_noop(self):
        con = _make_prices_con([("2024-01-03", "AAA", 11.0, 11.0, 100)])
        _upsert_price_rows(con, [], [], "2024-01-01")
        assert con.execute("SELECT COUNT(*) FROM prices").fetchone()[0] == 1


class TestUpdatePricesIncremental:
    def test_failed_catchup_fetch_preserves_existing_data(self, monkeypatch):
        """Gdyby chwilowa awaria yfinance zwrocila 0 wierszy dla znanego tickera,
        jego stare ceny w oknie doszacowania NIE moga zostac skasowane."""
        recent_date = (pd.Timestamp.today() - pd.Timedelta(days=10)).strftime('%Y-%m-%d')
        con = _make_prices_con([(recent_date, "AAA", 10.0, 10.0, 100)])

        def fake_download(tickers, start_date, end_date):
            return [], set(), list(tickers)  # wszystko sie nie udalo

        monkeypatch.setattr("fetch_data._download_price_rows", fake_download)
        update_prices_incremental(con, ["AAA"], retention_months=15)

        out = con.execute("SELECT Close FROM prices WHERE Ticker = 'AAA'").fetchall()
        assert out == [(10.0,)]

    def test_new_ticker_triggers_full_backfill_range_not_catchup_range(self, monkeypatch):
        recent_date = (pd.Timestamp.today() - pd.DateOffset(months=2)).strftime('%Y-%m-%d')
        con = _make_prices_con([(recent_date, "AAA", 10.0, 10.0, 100)])
        calls = []

        def fake_download(tickers, start_date, end_date):
            calls.append((tuple(sorted(tickers)), start_date, end_date))
            return (
                [(end_date, t, 1.0, 1.0, 1) for t in tickers],
                set(tickers),
                [],
            )

        monkeypatch.setattr("fetch_data._download_price_rows", fake_download)
        update_prices_incremental(con, ["AAA", "NEW"], retention_months=15)

        by_tickers = {c[0]: c for c in calls}
        catchup_call = by_tickers[("AAA",)]
        backfill_call = by_tickers[("NEW",)]
        # Backfill nowej spolki siega dalej wstecz niz zwykle doszacowanie.
        assert backfill_call[1] < catchup_call[1]

    def test_trims_history_older_than_retention_window(self, monkeypatch):
        old_date = (pd.Timestamp.today() - pd.DateOffset(months=20)).strftime('%Y-%m-%d')
        recent_date = pd.Timestamp.today().strftime('%Y-%m-%d')
        con = _make_prices_con([
            (old_date, "AAA", 10.0, 10.0, 100),
            (recent_date, "AAA", 11.0, 11.0, 100),
        ])
        monkeypatch.setattr("fetch_data._download_price_rows", lambda t, s, e: ([], set(), []))

        update_prices_incremental(con, ["AAA"], retention_months=15)

        dates_left = [r[0] for r in con.execute("SELECT Date FROM prices").fetchall()]
        assert len(dates_left) == 1
        assert str(dates_left[0]) != old_date


# ---------------------------------------------------------------------------
# update_index_prices: ceny poziomu indeksu (^GSPC/^NDX/^DJI) dla Global
# Equity Momentum — mapowanie symbolu yfinance z powrotem na nazwe uniwersum.
# ---------------------------------------------------------------------------

class TestUpdateIndexPrices:
    def test_maps_yfinance_symbols_back_to_universe_names(self, monkeypatch):
        con = duckdb.connect(":memory:")

        def fake_download(tickers, start_date, end_date):
            rows = [(end_date, t, 100.0, 100.0, 0) for t in tickers]
            return rows, set(tickers), []

        monkeypatch.setattr("fetch_data._download_price_rows", fake_download)
        update_index_prices(con, lookback_months=12)

        rows = con.execute("SELECT Index_Name, Close FROM index_prices ORDER BY Index_Name").fetchall()
        assert {r[0] for r in rows} == set(INDEX_LEVEL_SYMBOLS.keys())
        assert "^GSPC" not in {r[0] for r in rows}  # zapisana kanoniczna nazwa uniwersum, nie symbol yf

    def test_failed_downloads_leave_table_without_those_rows(self, monkeypatch):
        con = duckdb.connect(":memory:")
        monkeypatch.setattr("fetch_data._download_price_rows", lambda t, s, e: ([], set(), list(t)))

        update_index_prices(con, lookback_months=12)

        count = con.execute("""
            SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'index_prices'
        """).fetchone()[0]
        assert count == 1  # tabela stworzona
        assert con.execute("SELECT COUNT(*) FROM index_prices").fetchone()[0] == 0
