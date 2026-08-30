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


def fetch_prices(con, tickers, lookback_months, min_coverage):
    start_date, end_date = get_full_refresh_range(lookback_months)
    print(f"🔄 Pełne odświeżenie cen: {start_date} → {end_date} dla {len(tickers)} tickerów...")

    con.execute("DROP TABLE IF EXISTS prices_staging")
    con.execute("""
        CREATE TABLE prices_staging (
            Date DATE, Ticker VARCHAR, Close DOUBLE, Adj_Close DOUBLE, Volume BIGINT,
            PRIMARY KEY (Date, Ticker)
        )
    """)

    failed_tickers, fetched_tickers = [], set()
    batch_size = 50
    n_batches = (len(tickers) - 1) // batch_size + 1

    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i + batch_size]
        print(f"  Ceny — paczka {i // batch_size + 1}/{n_batches}...")
        try:
            data = yf.download(tickers=batch, start=start_date, end=end_date, interval="1d",
                                group_by="ticker", auto_adjust=False, threads=True)
            rows = []
            for ticker in batch:
                df_t = data.copy() if len(batch) == 1 else (
                    data[ticker].dropna(how="all") if ticker in data.columns.levels[0] else pd.DataFrame()
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
            if rows:
                # df_insert wyglada jak niewykorzystana zmienna dla lintera, ale
                # DuckDB odwoluje sie do niej po nazwie wewnatrz zapytania SQL ponizej.
                df_insert = pd.DataFrame(rows, columns=["Date", "Ticker", "Close", "Adj_Close", "Volume"])  # noqa: F841
                con.execute("INSERT INTO prices_staging SELECT * FROM df_insert")
        except Exception as e:
            print(f"❌ Błąd pobierania cen dla paczki {batch}: {e}")
            failed_tickers.extend(batch)
        time.sleep(2)

    coverage = len(fetched_tickers) / len(tickers) if tickers else 0
    if coverage < min_coverage:
        print(f"❌ Pokrycie cen zbyt niskie ({coverage:.0%}). NIE podmieniam tabeli prices.")
        con.execute("DROP TABLE prices_staging")
        return False

    con.execute("DROP TABLE IF EXISTS prices")
    con.execute("ALTER TABLE prices_staging RENAME TO prices")
    print(f"✅ Ceny odświeżone. Pokrycie: {len(fetched_tickers)}/{len(tickers)} ({coverage:.0%}).")
    if failed_tickers:
        print(f"⚠️  Brak cen dla: {sorted(set(failed_tickers))}")
    return True


def update_duckdb(lookback_months=15, min_coverage=0.8):
    con = duckdb.connect("momentum_data.duckdb")
    load_index_constituents(con)
    tickers = get_unique_tickers(con)
    if not tickers:
        print("❌ Brak tickerów. Przerywam.")
        con.close()
        return
    fetch_prices(con, tickers, lookback_months, min_coverage)
    con.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pełne, comiesięczne odświeżenie bazy cen i składu indeksów (CSV).")
    parser.add_argument("--lookback-months", type=int, default=15)
    parser.add_argument("--min-coverage", type=float, default=0.8)
    args = parser.parse_args()
    update_duckdb(lookback_months=args.lookback_months, min_coverage=args.min_coverage)
