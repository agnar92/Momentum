"""
Testy jednostkowe dla czystych funkcji parsujacych w fetch_data.py oraz
integracyjny test dla load_index_constituents (CSV -> DuckDB), zbudowany
na tymczasowych plikach CSV zamiast prawdziwych holdings ETF-ow.
"""
import duckdb
import pandas as pd
import pytest

from fetch_data import (
    PRICES_SCHEMA,
    _compute_synthetic_equal_weight_index,
    _download_price_rows,
    _ensure_prices_ohlc_columns,
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

    def test_cspx_csv_maps_to_sp500(self, tmp_path, monkeypatch):
        # CSPX_holdings.csv -> SP500 (INDEX_MAP), tak samo jak CNDX -> NASDAQ100
        # i CIND -> DOWJONES — SP500 jest wazonym uniwersum (real fmc_etf z
        # 'Market Value'), NIE rownowaznym jak WIG20/mWIG40.
        monkeypatch.chdir(tmp_path)
        (tmp_path / "CSPX_holdings.csv").write_text(CNDX_CSV)

        con = duckdb.connect(":memory:")
        load_index_constituents(con)

        row = con.execute(
            "SELECT Index_Name, fmc_etf FROM index_constituents WHERE Ticker = 'AAA'"
        ).fetchone()
        assert row == ("SP500", pytest.approx(1234.50))

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
        # domyslnie (include_ohlc=False, jak dla index_prices) wiersze zostaja 5-krotkami
        assert all(len(r) == 5 for r in rows)

    def test_include_ohlc_appends_high_low(self, monkeypatch):
        # High/Low sa potrzebne w run_query.py do rozbicia wolumenu na kupujacych/
        # sprzedajacych (CLV) — tylko dla tabeli `prices`, wiec include_ohlc=True
        # dopisuje je na koncu kazdego wiersza zamiast zmieniac domyslny ksztalt.
        # UWAGA: dla pojedynczego tickera w paczce yfinance zwraca PLASKIE kolumny
        # (nie MultiIndex) — tak samo jak w prawdziwym _download_price_rows (patrz
        # galaz `len(yf_batch) == 1` uzywajaca `data.copy()` bez rozpakowywania).
        dates = pd.to_datetime(["2024-01-02"])
        fake_data = pd.DataFrame(
            [[10.0, 10.0, 100, 12.0, 9.0]], index=dates,
            columns=["Close", "Adj Close", "Volume", "High", "Low"],
        )
        monkeypatch.setattr("fetch_data.yf.download", lambda tickers, **kwargs: fake_data)

        rows, fetched, failed = _download_price_rows(["AAA"], "2024-01-02", "2024-01-03", include_ohlc=True)

        assert rows == [("2024-01-02", "AAA", 10.0, 10.0, 100, 12.0, 9.0)]

    def test_include_ohlc_uses_none_when_high_low_missing(self, monkeypatch):
        # yfinance moze czasem nie zwrocic High/Low dla danego dnia — nie powinno
        # to wywalac calego pobrania, tylko dac None (patrz CLV fallback na 50/50
        # w run_query.py, gdy High/Low brakuje).
        dates = pd.to_datetime(["2024-01-02"])
        fake_data = pd.DataFrame([[10.0, 10.0, 100]], index=dates, columns=["Close", "Adj Close", "Volume"])
        monkeypatch.setattr("fetch_data.yf.download", lambda tickers, **kwargs: fake_data)

        rows, fetched, failed = _download_price_rows(["AAA"], "2024-01-02", "2024-01-03", include_ohlc=True)

        assert rows == [("2024-01-02", "AAA", 10.0, 10.0, 100, None, None)]

    def test_ticker_missing_from_batch_is_retried_individually_and_recovered(self, monkeypatch):
        # Real bug this covers: update_index_prices() requests
        # ['^NDX', '^DJI', 'WIG20.WA', 'MWIG40.WA'] in ONE multi-ticker call —
        # yfinance consistently reported "possibly delisted" for WIG20.WA/MWIG40.WA
        # in that mixed-exchange batch even though the same symbols have data when
        # fetched alone, leaving index_prices empty for WIG20/MWIG40 and breaking
        # every WIG20/MWIG40 stock's weekly_chart (compute_relative_strength_chart
        # returns None when its own index has no rows). A ticker missing from the
        # batch result must be retried alone and recovered if that single-symbol
        # call actually has data.
        dates = pd.to_datetime(["2024-01-02"])
        batch_columns = pd.MultiIndex.from_product([["AAA"], ["Close", "Adj Close", "Volume"]])
        batch_data = pd.DataFrame([[10.0, 10.0, 100]], index=dates, columns=batch_columns)
        single_data = pd.DataFrame([[5.0, 5.0, 50]], index=dates, columns=["Close", "Adj Close", "Volume"])
        calls = []

        def fake_download(tickers, **kwargs):
            calls.append(list(tickers))
            if len(tickers) > 1:
                return batch_data  # "BBB" missing entirely from the batch result
            return single_data

        monkeypatch.setattr("fetch_data.yf.download", fake_download)
        monkeypatch.setattr("fetch_data.time.sleep", lambda _: None)

        rows, fetched, failed = _download_price_rows(["AAA", "BBB"], "2024-01-02", "2024-01-03")

        assert calls == [["AAA", "BBB"], ["BBB"]]  # batch, then a solo retry for the missing one
        assert fetched == {"AAA", "BBB"}
        assert failed == []
        assert ("2024-01-02", "BBB", 5.0, 5.0, 50) in rows

    def test_ticker_still_missing_after_solo_retry_ends_up_failed(self, monkeypatch):
        monkeypatch.setattr("fetch_data.yf.download", lambda tickers, **kwargs: pd.DataFrame())
        monkeypatch.setattr("fetch_data.time.sleep", lambda _: None)

        rows, fetched, failed = _download_price_rows(["CCC"], "2024-01-02", "2024-01-03")

        assert rows == []
        assert fetched == set()
        assert failed == ["CCC"]


def _make_prices_con(rows):
    """rows: lista (date_str, ticker, close, adj_close, volume) — 5-krotki, mimo ze
    PRICES_SCHEMA ma tez High/Low: wstawiamy po nazwach kolumn, wiec High/Low
    zostaja NULL, co dla tych testow (nieliczacych CLV) jest wystarczajace."""
    con = duckdb.connect(":memory:")
    con.execute(f"CREATE TABLE prices ({PRICES_SCHEMA})")
    if rows:
        df = pd.DataFrame(rows, columns=["Date", "Ticker", "Close", "Adj_Close", "Volume"])  # noqa: F841
        con.execute("INSERT INTO prices (Date, Ticker, Close, Adj_Close, Volume) SELECT * FROM df")
    return con


class TestEnsurePricesOhlcColumns:
    def test_adds_missing_columns_without_touching_data(self):
        con = duckdb.connect(":memory:")
        con.execute("CREATE TABLE prices (Date DATE, Ticker VARCHAR, Close DOUBLE, Adj_Close DOUBLE, Volume BIGINT)")
        con.execute("INSERT INTO prices VALUES ('2024-01-02', 'AAA', 10.0, 10.0, 100)")

        _ensure_prices_ohlc_columns(con)

        cols = {r[1] for r in con.execute("PRAGMA table_info('prices')").fetchall()}
        assert {"High", "Low"} <= cols
        row = con.execute("SELECT Close, High, Low FROM prices").fetchone()
        assert row == (10.0, None, None)

    def test_idempotent_on_already_migrated_table(self):
        con = duckdb.connect(":memory:")
        con.execute(f"CREATE TABLE prices ({PRICES_SCHEMA})")
        _ensure_prices_ohlc_columns(con)  # nie powinno rzucic bledu "column already exists"


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
        new_rows = [("2024-01-03", "AAA", 99.0, 99.0, 999, None, None)]
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
        _upsert_price_rows(con, [("2024-01-03", "AAA", 99.0, 99.0, 999, None, None)], ["AAA"], "2024-01-01")

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

        def fake_download(tickers, start_date, end_date, include_ohlc=False):
            return [], set(), list(tickers)  # wszystko sie nie udalo

        monkeypatch.setattr("fetch_data._download_price_rows", fake_download)
        update_prices_incremental(con, ["AAA"], retention_months=15)

        out = con.execute("SELECT Close FROM prices WHERE Ticker = 'AAA'").fetchall()
        assert out == [(10.0,)]

    def test_new_ticker_triggers_full_backfill_range_not_catchup_range(self, monkeypatch):
        recent_date = (pd.Timestamp.today() - pd.DateOffset(months=2)).strftime('%Y-%m-%d')
        con = _make_prices_con([(recent_date, "AAA", 10.0, 10.0, 100)])
        calls = []

        def fake_download(tickers, start_date, end_date, include_ohlc=False):
            calls.append((tuple(sorted(tickers)), start_date, end_date))
            return (
                [(end_date, t, 1.0, 1.0, 1, None, None) for t in tickers],
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
        monkeypatch.setattr("fetch_data._download_price_rows", lambda t, s, e, include_ohlc=False: ([], set(), []))

        update_prices_incremental(con, ["AAA"], retention_months=15)

        dates_left = [r[0] for r in con.execute("SELECT Date FROM prices").fetchall()]
        assert len(dates_left) == 1
        assert str(dates_left[0]) != old_date


# ---------------------------------------------------------------------------
# update_index_prices: ceny poziomu indeksu dla Global Equity Momentum / Sily
# Relatywnej. SP500/NASDAQ100/DOWJONES (^GSPC/^NDX/^DJI) MAJA pelna historie u
# yfinance — pobierane i mapowane z powrotem na nazwe uniwersum jak dotychczas.
# WIG20/MWIG40 NIE MAJA zadnej historycznej danej poziomu indeksu u yfinance
# (potwierdzone recznie — patrz docstring _compute_synthetic_equal_weight_index)
# — budowane syntetycznie z wlasnych skladnikow zamiast pobierane.
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
        assert {r[0] for r in rows} == {"SP500", "NASDAQ100", "DOWJONES"}
        assert "^GSPC" not in {r[0] for r in rows}  # zapisana kanoniczna nazwa uniwersum, nie symbol yf

    def test_failed_downloads_leave_table_without_those_rows(self, monkeypatch):
        con = duckdb.connect(":memory:")
        monkeypatch.setattr("fetch_data._download_price_rows", lambda t, s, e: ([], set(), list(t)))

        update_index_prices(con, lookback_months=12)

        count = con.execute("""
            SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'index_prices'
        """).fetchone()[0]
        assert count == 1  # tabela stworzona
        # NASDAQ100/DOWJONES: brak danych z yfinance -> brak wierszy. WIG20/MWIG40:
        # brak index_constituents/prices w tym swiezym con -> synteza tez nic nie da.
        assert con.execute("SELECT COUNT(*) FROM index_prices").fetchone()[0] == 0

    def test_wig20_mwig40_build_synthetic_equal_weight_index_from_constituents(self, monkeypatch):
        # yfinance nie ma historii dla WIG20.WA/MWIG40.WA (patrz docstring
        # _compute_synthetic_equal_weight_index) — te dwa uniwersa NIE polegaja
        # na _download_price_rows w ogole, tylko na wlasnych skladnikach.
        # Daty musza wpasc w okno wyliczane przez get_full_refresh_range(lookback_months)
        # (konczy sie na ostatnim dniu POPRZEDNIEGO miesiaca, nie dzisiaj), inaczej
        # filtr Date BETWEEN w _compute_synthetic_equal_weight_index odetnie wszystko.
        _, end_date_str = get_full_refresh_range(12)
        d1 = end_date_str
        d0 = (pd.Timestamp(end_date_str) - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
        con = duckdb.connect(":memory:")
        con.execute("CREATE TABLE index_constituents (Ticker VARCHAR, Index_Name VARCHAR)")
        con.execute("INSERT INTO index_constituents VALUES ('AAA', 'WIG20'), ('BBB', 'WIG20')")
        con.execute(f"CREATE TABLE prices ({PRICES_SCHEMA})")
        con.execute(f"""
            INSERT INTO prices (Date, Ticker, Close, Adj_Close, Volume) VALUES
                ('{d0}', 'AAA', 10.0, 10.0, 100),
                ('{d1}', 'AAA', 11.0, 11.0, 100),
                ('{d0}', 'BBB', 20.0, 20.0, 100),
                ('{d1}', 'BBB', 19.0, 19.0, 100)
        """)
        monkeypatch.setattr("fetch_data._download_price_rows", lambda t, s, e: ([], set(), list(t)))

        update_index_prices(con, lookback_months=12)

        rows = con.execute(
            "SELECT Date, Close FROM index_prices WHERE Index_Name = 'WIG20' ORDER BY Date"
        ).fetchall()
        assert len(rows) == 2
        # dzien 1: baza = 100 (pierwszy dzien w oknie, brak wczesniejszego zwrotu)
        assert rows[0][1] == pytest.approx(100.0)
        # dzien 2: AAA +10%, BBB -5% -> rownowazony zwrot = +2.5% -> 100 * 1.025
        assert rows[1][1] == pytest.approx(102.5)
        # MWIG40 nie ma skladnikow w index_constituents w tym tescie -> brak wierszy, bez wyjatku
        assert con.execute(
            "SELECT COUNT(*) FROM index_prices WHERE Index_Name = 'MWIG40'"
        ).fetchone()[0] == 0

    def test_synthetic_index_returns_empty_without_crashing_when_tables_missing(self):
        # Swiezy bootstrap: index_constituents/prices jeszcze nie istnieja. Musi
        # sie zachowac łagodnie (pusty wynik), nie rzucic wyjatku katalogowego duckdb.
        con = duckdb.connect(":memory:")
        result = _compute_synthetic_equal_weight_index(con, "WIG20", "2024-01-01", "2024-01-31")
        assert result.empty
