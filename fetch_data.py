import argparse
import time
import pandas as pd
import duckdb
import yfinance as yf

# ============================================================================
# HOLDINGS: wyłącznie z ręcznie podmienianych plików CSV (holdings ETF-ów
# CSPX/CNDX/CIND). Próba użycia biblioteki etf_scraper została porzucona —
# pakiet okazał się niewspierany/niedziałający, więc zostajemy przy CSV jako
# jedynym, sprawdzonym źródle.
# ============================================================================
INDEX_MAP = {
    "CSPX_holdings.csv": "SP500",
    "CNDX_holdings.csv": "NASDAQ100",
    "CIND_holdings.csv": "DOWJONES"
}

TICKER_COL_CANDIDATES = ["Ticker", "Symbol", "Holding Ticker"]
SECTOR_COL_CANDIDATES = ["Sector", "Sector Classification", "GICS Sector"]
MARKET_VALUE_COL_CANDIDATES = ["Market Value", "Notional Value"]
ASSET_CLASS_COL_CANDIDATES = ["Asset Class"]
EXCHANGE_COL_CANDIDATES = ["Exchange"]

# Tickery klas akcji uprzywilejowanych/podwojnych w plikach holdings ETF-ow (bez
# separatora, np. "BRKB") nie odpowiadaja konwencji yfinance (z myslnikiem, np.
# "BRK-B"). Bez tego mapowania takie spolki NIGDY nie dostana cen — kazde kolejne
# odswiezenie probowaloby je pobrac na nowo jako "nowe" tickery (patrz
# update_prices_incremental), bez skutku.
YFINANCE_TICKER_OVERRIDES = {
    "BRKB": "BRK-B",  # Berkshire Hathaway Class B
    "BFB": "BF-B",    # Brown-Forman Class B
}

# Poziom INDEKSU (nie skladnikow) dla Global Equity Momentum — porownanie
# zwrotu calego SP500/NASDAQ100/DOWJONES miedzy soba (patrz run_query.py::
# compute_index_returns). ^GSPC/^NDX/^DJI to standardowe symbole yfinance
# dla tych indeksow.
INDEX_LEVEL_SYMBOLS = {
    "SP500": "^GSPC",
    "NASDAQ100": "^NDX",
    "DOWJONES": "^DJI",
}


def _to_yf_symbol(ticker):
    return YFINANCE_TICKER_OVERRIDES.get(ticker, ticker)


def _find_column(df, candidates):
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _parse_money(series):
    """Kolumny takie jak 'Market Value' w CSV holdings ETF-a mają liczby jako
    stringi z separatorem tysięcy (np. '12,365,349,776.05') opakowane w
    cudzysłowy. Trzeba usunąć przecinki przed konwersją na float."""
    return pd.to_numeric(
        series.astype(str).str.replace(",", "", regex=False).str.replace('"', "", regex=False),
        errors="coerce"
    )


def load_index_constituents(con):
    """
    Wczytuje skład indeksów z plików holdings funduszy ETF (CSPX/CNDX/CIND),
    które podmieniasz ręcznie. Oprócz tickera i sektora, wyciąga 'Market
    Value' — realną, publikowaną wagę kapitałową danej spółki w funduszu
    replikującym dany indeks (substytut FMC — patrz wcześniejsze wyjaśnienie
    w rozmowie: dla SP500/NASDAQ100 to float-adjusted market cap, dla
    DOWJONES to waga cenowa, bo DJIA jest indeksem ważonym ceną).
    """
    con.execute("""
        CREATE TABLE IF NOT EXISTS index_constituents (
            Ticker VARCHAR,
            Index_Name VARCHAR,
            Sector VARCHAR,
            fmc_etf DOUBLE,
            PRIMARY KEY (Ticker, Index_Name)
        )
    """)
    rows = []
    for filepath, index_name in INDEX_MAP.items():
        try:
            df = pd.read_csv(filepath, skiprows=1)
        except FileNotFoundError:
            print(f"⚠️  Brak pliku {filepath} — pomijam {index_name}.")
            continue
        except Exception as e:
            print(f"❌ Błąd podczas odczytu {filepath}: {e}")
            continue

        ticker_col = _find_column(df, TICKER_COL_CANDIDATES)
        sector_col = _find_column(df, SECTOR_COL_CANDIDATES)
        mv_col = _find_column(df, MARKET_VALUE_COL_CANDIDATES)
        asset_class_col = _find_column(df, ASSET_CLASS_COL_CANDIDATES)
        exchange_col = _find_column(df, EXCHANGE_COL_CANDIDATES)

        if ticker_col is None:
            print(f"❌ Nie znaleziono kolumny z tickerem w {filepath}. Kolumny: {list(df.columns)}.")
            continue
        if sector_col is None:
            print(f"⚠️  Nie znaleziono kolumny sektora w {filepath}. Sektor = 'Unknown'.")
        if mv_col is None:
            print(f"⚠️  Nie znaleziono kolumny wartości rynkowej w {filepath} "
                  f"(sprawdzone: {MARKET_VALUE_COL_CANDIDATES}). Wagi (FMC) nie będą dostępne dla {index_name}.")
        else:
            df["_mv_parsed"] = _parse_money(df[mv_col])

        # Odfiltrowanie pozycji niebędących akcjami: gotówka, cash collateral,
        # kontrakty futures itp. — te wiersze psułyby sumę FMC uniwersum.
        if asset_class_col is not None:
            n_before_filter = len(df)
            df = df[df[asset_class_col].astype(str).str.strip().str.lower() == "equity"]
            n_filtered = n_before_filter - len(df)
            if n_filtered > 0:
                print(f"ℹ️  {filepath}: odfiltrowano {n_filtered} pozycji nie-akcyjnych "
                      f"(gotówka/futures/cash collateral).")

        # Odfiltrowanie rezydualnych udziałów bez rynku notowań (np. resztkowa
        # pozycja po wykupie/delistingu spółki) — mają znikomą wartość, status
        # Equity, ale zerowy realny wolumen, więc yfinance nigdy im nie da ceny.
        if exchange_col is not None:
            n_before_filter = len(df)
            df = df[~df[exchange_col].astype(str).str.strip().str.upper().str.startswith("NO MARKET")]
            n_filtered = n_before_filter - len(df)
            if n_filtered > 0:
                print(f"ℹ️  {filepath}: odfiltrowano {n_filtered} pozycji bez rynku notowań "
                      f"(Exchange='NO MARKET...' — najczęściej rezydualny udział po wykupie/delistingu).")

        n_before = len(rows)
        for _, row in df.iterrows():
            t = str(row[ticker_col]).strip() if pd.notna(row[ticker_col]) else None
            sec = str(row[sector_col]).strip() if sector_col and pd.notna(row[sector_col]) else "Unknown"
            mv = float(row["_mv_parsed"]) if mv_col and pd.notna(row.get("_mv_parsed")) else None
            if t and t.lower() != "nan":
                rows.append((t, index_name, sec, mv))
        print(f"✅ {filepath}: wczytano {len(rows) - n_before} pozycji jako {index_name}.")

    if rows:
        df_const = pd.DataFrame(rows, columns=["Ticker", "Index_Name", "Sector", "fmc_etf"]).drop_duplicates(
            subset=["Ticker", "Index_Name"]
        )
        n_missing_fmc = df_const["fmc_etf"].isna().sum()
        con.execute("DELETE FROM index_constituents")
        con.execute("INSERT INTO index_constituents SELECT * FROM df_const")
        print(f"Zapisano {len(df_const)} rekordów składu indeksów "
              f"({n_missing_fmc} bez wartości FMC — zostaną pominięte przy wagowaniu).")
    else:
        print("❌ Nie wczytano żadnych składów indeksów.")


def get_unique_tickers(con):
    res = con.execute("SELECT DISTINCT Ticker FROM index_constituents").fetchall()
    return [r[0] for r in res]


def get_full_refresh_range(lookback_months):
    today = pd.Timestamp.today()
    first_day_current_month = today.replace(day=1)
    end_date = first_day_current_month - pd.Timedelta(days=1)
    start_date = end_date - pd.DateOffset(months=lookback_months)
    return start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')


PRICES_SCHEMA = """
    Date DATE, Ticker VARCHAR, Close DOUBLE, Adj_Close DOUBLE, Volume BIGINT,
    PRIMARY KEY (Date, Ticker)
"""

# Ile dni wstecz od ostatniej znanej ceny dogrywać przy odświeżeniu przyrostowym —
# łapie ewentualne korekty/opóźnienia danych z yfinance, bez ryzyka luk przy
# weekendach/świętach. Nadpisywane (upsert), więc nie tworzy duplikatów.
CATCHUP_OVERLAP_DAYS = 7


def _download_price_rows(tickers, start_date, end_date):
    """Pobiera OHLC z yfinance w paczkach po 50 tickerów dla zadanego zakresu dat.
    Zwraca (rows, fetched_tickers, failed_tickers) — sama logika sieciowa/parsująca,
    bez dotykania DuckDB, żeby dało się jej użyć zarówno przy pełnym bootstrapie,
    jak i przy przyrostowym doszacowaniu/backfillu nowych spółek."""
    rows = []
    failed_tickers, fetched_tickers = [], set()
    if not tickers:
        return rows, fetched_tickers, failed_tickers
    batch_size = 50
    n_batches = (len(tickers) - 1) // batch_size + 1

    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i + batch_size]
        yf_batch = [_to_yf_symbol(t) for t in batch]
        print(f"  Ceny — paczka {i // batch_size + 1}/{n_batches} ({start_date} → {end_date})...")
        try:
            data = yf.download(tickers=yf_batch, start=start_date, end=end_date, interval="1d",
                                group_by="ticker", auto_adjust=False, threads=True)
            for ticker, yf_symbol in zip(batch, yf_batch):
                df_t = data.copy() if len(yf_batch) == 1 else (
                    data[yf_symbol].dropna(how="all") if yf_symbol in data.columns.levels[0] else pd.DataFrame()
                )
                if df_t.empty:
                    failed_tickers.append(ticker)
                    continue
                for date, row in df_t.iterrows():
                    if pd.notna(row.get("Close")):
                        rows.append((date.strftime('%Y-%m-%d'), ticker, float(row["Close"]),
                                     float(row.get("Adj Close", row["Close"])),
                                     int(row["Volume"]) if pd.notna(row.get("Volume")) else 0))
                        fetched_tickers.add(ticker)
        except Exception as e:
            print(f"❌ Błąd pobierania cen dla paczki {batch}: {e}")
            failed_tickers.extend(batch)
        time.sleep(2)

    return rows, fetched_tickers, failed_tickers


def bootstrap_prices(con, tickers, lookback_months, min_coverage):
    """Pierwsze, pełne pobranie historii cen (podmiana całej tabeli prices) —
    używane tylko gdy baza jest pusta/nie istnieje jeszcze."""
    start_date, end_date = get_full_refresh_range(lookback_months)
    print(f"🔄 Pełne pobranie cen (bootstrap): {start_date} → {end_date} dla {len(tickers)} tickerów...")

    con.execute("DROP TABLE IF EXISTS prices_staging")
    con.execute(f"CREATE TABLE prices_staging ({PRICES_SCHEMA})")

    rows, fetched_tickers, failed_tickers = _download_price_rows(tickers, start_date, end_date)

    coverage = len(fetched_tickers) / len(tickers) if tickers else 0
    if coverage < min_coverage:
        print(f"❌ Pokrycie cen zbyt niskie ({coverage:.0%}). NIE podmieniam tabeli prices.")
        con.execute("DROP TABLE prices_staging")
        return False

    if rows:
        # df_insert wyglada jak niewykorzystana zmienna dla lintera, ale
        # DuckDB odwoluje sie do niej po nazwie wewnatrz zapytania SQL ponizej.
        df_insert = pd.DataFrame(rows, columns=["Date", "Ticker", "Close", "Adj_Close", "Volume"])  # noqa: F841
        con.execute("INSERT INTO prices_staging SELECT * FROM df_insert")

    con.execute("DROP TABLE IF EXISTS prices")
    con.execute("ALTER TABLE prices_staging RENAME TO prices")
    print(f"✅ Ceny odświeżone. Pokrycie: {len(fetched_tickers)}/{len(tickers)} ({coverage:.0%}).")
    if failed_tickers:
        print(f"⚠️  Brak cen dla: {sorted(set(failed_tickers))}")
    return True


def _upsert_price_rows(con, rows, tickers, start_date):
    """Zastępuje w tabeli prices wiersze dla podanych tickerów od start_date wzwyż
    świeżo pobranymi danymi (usuń stary zakres + wstaw nowy = upsert bez konfliktu
    PRIMARY KEY). Wywoływać WYŁĄCZNIE z tickerami, dla których fetch się faktycznie
    powiódł — inaczej przy chwilowej awarii yfinance skasowalibyśmy dobre, już
    zapisane dane, nie mając czym ich zastąpić."""
    if not tickers:
        return
    con.register("_tickers_tmp", pd.DataFrame({"Ticker": tickers}))
    con.execute(f"""
        DELETE FROM prices
        WHERE Date >= DATE '{start_date}' AND Ticker IN (SELECT Ticker FROM _tickers_tmp)
    """)
    con.unregister("_tickers_tmp")
    if rows:
        df_insert = pd.DataFrame(rows, columns=["Date", "Ticker", "Close", "Adj_Close", "Volume"])  # noqa: F841
        con.execute("INSERT INTO prices SELECT * FROM df_insert")


def update_index_prices(con, lookback_months):
    """Ceny POZIOMU INDEKSU (^GSPC/^NDX/^DJI, nie skladnikow) dla Global Equity
    Momentum — tylko 3 symbole, wiec zamiast przyrostowego smart-refreshu jak
    dla tysiaca tickerow akcji, przy kazdym uruchomieniu podmieniamy caly
    zakres na nowo (koszt pomijalny), reuzywajac _download_price_rows (ta sama
    logika batchowania/retry co ceny akcji)."""
    con.execute("""
        CREATE TABLE IF NOT EXISTS index_prices (
            Date DATE, Index_Name VARCHAR, Close DOUBLE, Adj_Close DOUBLE, Volume BIGINT,
            PRIMARY KEY (Date, Index_Name)
        )
    """)
    start_date, end_date = get_full_refresh_range(lookback_months)
    yf_symbols = list(INDEX_LEVEL_SYMBOLS.values())
    print(f"🔄 Ceny poziomu indeksów (Global Equity Momentum): {start_date} → {end_date} dla {yf_symbols}...")

    rows, fetched, failed = _download_price_rows(yf_symbols, start_date, end_date)
    if failed:
        print(f"⚠️  Brak danych poziomu indeksu dla: {sorted(set(failed))}")
    if not rows:
        print("❌ Nie pobrano żadnych danych poziomu indeksów.")
        return

    symbol_to_index = {v: k for k, v in INDEX_LEVEL_SYMBOLS.items()}
    df_insert = pd.DataFrame(rows, columns=["Date", "Ticker", "Close", "Adj_Close", "Volume"])
    df_insert["Index_Name"] = df_insert["Ticker"].map(symbol_to_index)
    df_insert = df_insert[["Date", "Index_Name", "Close", "Adj_Close", "Volume"]]  # noqa: F841

    con.execute(f"DELETE FROM index_prices WHERE Date >= DATE '{start_date}'")
    con.execute("INSERT INTO index_prices SELECT * FROM df_insert")
    print(f"✅ Zapisano {len(df_insert)} wierszy danych poziomu indeksów ({start_date} → {end_date}).")


def update_prices_incremental(con, tickers, retention_months):
    """Odświeżenie przyrostowe: dogrywa tylko nowe dni dla znanych tickerów (od
    ostatniej znanej ceny wstecz o CATCHUP_OVERLAP_DAYS), robi pełny backfill
    tylko dla tickerów, których jeszcze nie ma w prices (np. nowy skład indeksu
    po podmianie CSV), a na końcu przycina historię do ostatnich retention_months
    miesięcy — tak żeby baza nie rosła w nieskończoność, mając zawsze tyle
    historii, ile potrzebuje momentum_value (M-14) + margines na fallback/staleness."""
    existing_tickers = set(con.execute("SELECT DISTINCT Ticker FROM prices").df()["Ticker"]) & set(tickers)
    new_tickers = [t for t in tickers if t not in existing_tickers]
    watermark = con.execute("SELECT MAX(Date) FROM prices").fetchone()[0]
    end_date = pd.Timestamp.today().strftime('%Y-%m-%d')

    if existing_tickers:
        catchup_start = (pd.Timestamp(watermark) - pd.Timedelta(days=CATCHUP_OVERLAP_DAYS)).strftime('%Y-%m-%d')
        print(f"🔄 Doszacowanie cen: {catchup_start} → {end_date} dla {len(existing_tickers)} znanych tickerów...")
        rows, fetched, failed = _download_price_rows(sorted(existing_tickers), catchup_start, end_date)
        _upsert_price_rows(con, rows, sorted(fetched), catchup_start)
        if failed:
            print(f"⚠️  Brak świeżych cen dla: {sorted(set(failed))} — stare dane pozostają w bazie "
                  f"(zostaną odfiltrowane przez --max-staleness-days w run_query.py, jeśli się zestarzeją).")

    if new_tickers:
        backfill_start, _ = get_full_refresh_range(retention_months)
        print(f"🆕 Pełny backfill historii dla {len(new_tickers)} nowych spółek w indeksie "
              f"({backfill_start} → {end_date})...")
        rows, fetched, failed = _download_price_rows(new_tickers, backfill_start, end_date)
        _upsert_price_rows(con, rows, sorted(fetched), backfill_start)
        if failed:
            print(f"⚠️  Brak historii dla nowych spółek: {sorted(set(failed))}.")

    cutoff = (pd.Timestamp.today() - pd.DateOffset(months=retention_months)).strftime('%Y-%m-%d')
    n_before = con.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
    con.execute(f"DELETE FROM prices WHERE Date < DATE '{cutoff}'")
    n_after = con.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
    print(f"🧹 Przycięto historię cen do ostatnich {retention_months} mies. "
          f"(usunięto {n_before - n_after} wierszy starszych niż {cutoff}).")


def _prices_table_has_rows(con):
    exists = con.execute("""
        SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'prices'
    """).fetchone()[0] > 0
    if not exists:
        return False
    return con.execute("SELECT COUNT(*) FROM prices").fetchone()[0] > 0


def update_duckdb(lookback_months=15, min_coverage=0.8, indices_only=False):
    con = duckdb.connect("momentum_data.duckdb")

    if indices_only:
        # Tylko poziom indeksu (^GSPC/^NDX/^DJI, 3 symbole) dla Global Equity Momentum —
        # pomija skladniki (CSV + setki tickerow z yfinance), zeby moc odswiezac to
        # codziennie bez kosztu/limitow pelnego pobrania cen akcji (patrz workflow
        # daily_gem.yml — GEM ma byc aktualny codziennie, nie tylko raz w miesiacu).
        update_index_prices(con, lookback_months)
        con.close()
        return

    load_index_constituents(con)
    tickers = get_unique_tickers(con)
    if not tickers:
        print("❌ Brak tickerów. Przerywam.")
        con.close()
        return

    if _prices_table_has_rows(con):
        update_prices_incremental(con, tickers, retention_months=lookback_months)
    else:
        bootstrap_prices(con, tickers, lookback_months, min_coverage)

    update_index_prices(con, lookback_months)

    con.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Odświeża bazę cen (bootstrap za pierwszym razem, potem przyrostowo: "
                     "dogrywa nowe dni + przycina historię do --lookback-months) i skład indeksów (CSV)."
    )
    parser.add_argument("--lookback-months", type=int, default=15,
                         help="Ile miesięcy historii cen trzymać w bazie (retencja) oraz zakres "
                              "pierwszego pełnego pobrania / backfillu nowych spółek.")
    parser.add_argument("--min-coverage", type=float, default=0.8,
                         help="Minimalne pokrycie tickerów wymagane przy PIERWSZYM (bootstrap) pobraniu.")
    parser.add_argument("--indices-only", action="store_true",
                         help="Odśwież WYŁĄCZNIE ceny poziomu indeksu (^GSPC/^NDX/^DJI) dla Global Equity "
                              "Momentum — pomija skład indeksów i ceny wszystkich składników. Do użycia w "
                              "codziennym workflow (patrz daily_gem.yml), osobno od pełnego miesięcznego "
                              "odświeżenia.")
    args = parser.parse_args()
    update_duckdb(lookback_months=args.lookback_months, min_coverage=args.min_coverage,
                  indices_only=args.indices_only)
