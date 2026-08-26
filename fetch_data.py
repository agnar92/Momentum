import glob
import time
import pandas as pd
import duckdb
import yfinance as yf

INDEX_MAP = {
    "CSPX_holdings.csv": "SP500",
    "CNDX_holdings.csv": "NASDAQ100",
    "CIND_holdings.csv": "DOWJONES"
}

def load_index_constituents(con):
    """Odczytuje pliki CSV i zapisuje skład indeksów oraz sektory do DuckDB."""
    con.execute("""
        CREATE TABLE IF NOT EXISTS index_constituents (
            Ticker VARCHAR,
            Index_Name VARCHAR,
            Sector VARCHAR,
            PRIMARY KEY (Ticker, Index_Name)
        )
    """)
    
    rows = []
    for filepath, index_name in INDEX_MAP.items():
        try:
            df = pd.read_csv(filepath, skiprows=1)
            # Sprawdzenie dostępnych kolumn
            ticker_col = "Ticker" if "Ticker" in df.columns else None
            sector_col = "Sector" if "Sector" in df.columns else None

            if ticker_col:
                for _, row in df.iterrows():
                    t = str(row[ticker_col]).strip() if pd.notna(row[ticker_col]) else None
                    sec = str(row[sector_col]).strip() if sector_col and pd.notna(row[sector_col]) else "Unknown"
                    if t and t != "nan":
                        rows.append((t, index_name, sec))
        except Exception as e:
            print(f"Błąd podczas odczytu {filepath}: {e}")

    if rows:
        df_const = pd.DataFrame(rows, columns=["Ticker", "Index_Name", "Sector"]).drop_duplicates()
        con.execute("DELETE FROM index_constituents")
        con.execute("INSERT INTO index_constituents SELECT * FROM df_const")
        print(f"Zapisano powiązania tickerów i sektorów ({len(df_const)} rekordów).")

def get_unique_tickers(con):
    res = con.execute("SELECT DISTINCT Ticker FROM index_constituents").fetchall()
    return [r[0] for r in res]

def get_fetch_date_range(con):
    today = pd.Timestamp.today()
    first_day_current_month = today.replace(day=1)
    end_date = (first_day_current_month - pd.Timedelta(days=1)).strftime('%Y-%m-%d')
    
    result = con.execute("SELECT MAX(Date) FROM prices").fetchone()[0]
    if result:
        start_date = (pd.to_datetime(result) + pd.Timedelta(days=1)).strftime('%Y-%m-%d')
    else:
        start_date = (today - pd.DateOffset(years=2)).strftime('%Y-%m-%d')
        
    return start_date, end_date

def update_duckdb():
    con = duckdb.connect("momentum_data.duckdb")
    
    load_index_constituents(con)

    con.execute("""
        CREATE TABLE IF NOT EXISTS prices (
            Date DATE,
            Ticker VARCHAR,
            Close DOUBLE,
            Adj_Close DOUBLE,
            Volume BIGINT,
            PRIMARY KEY (Date, Ticker)
        )
    """)

    tickers = get_unique_tickers(con)
    start_date, end_date = get_fetch_date_range(con)

    if pd.to_datetime(start_date) >= pd.to_datetime(end_date):
        print("Baza danych jest już aktualna o najnowszy pełny miesiąc.")
        con.close()
        return

    print(f"Pobieranie cen od {start_date} do {end_date} dla {len(tickers)} tickerów...")

    batch_size = 50
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i + batch_size]
        print(f"Pobieranie paczki {i//batch_size + 1}/{(len(tickers)-1)//batch_size + 1}...")

        try:
            data = yf.download(
                tickers=batch,
                start=start_date,
                end=end_date,
                interval="1d",
                group_by="ticker",
                auto_adjust=False,
                threads=True
            )

            rows = []
            for ticker in batch:
                if len(batch) == 1:
                    df_t = data.copy()
                else:
                    if ticker not in data.columns.levels[0]:
                        continue
                    df_t = data[ticker].dropna(how="all")

                for date, row in df_t.iterrows():
                    if pd.notna(row.get("Close")):
                        rows.append((
                            date.strftime('%Y-%m-%d'),
                            ticker,
                            float(row["Close"]),
                            float(row.get("Adj Close", row["Close"])),
                            int(row["Volume"]) if pd.notna(row.get("Volume")) else 0
                        ))

            if rows:
                df_insert = pd.DataFrame(rows, columns=["Date", "Ticker", "Close", "Adj_Close", "Volume"])
                con.execute("""
                    INSERT INTO prices 
                    SELECT * FROM df_insert 
                    ON CONFLICT(Date, Ticker) DO UPDATE SET 
                        Close = EXCLUDED.Close,
                        Adj_Close = EXCLUDED.Adj_Close,
                        Volume = EXCLUDED.Volume
                """)
                
        except Exception as e:
            print(f"Błąd podczas pobierania paczki {batch}: {e}")

        time.sleep(2)

    con.close()
    print("Aktualizacja zakończona sukcesem!")

if __name__ == "__main__":
    update_duckdb()
