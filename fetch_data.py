import os
import duckdb
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta

DB_FILE = "momentum_data.duckdb"
CSV_FILE = "holdings.csv"

# ==========================================
# 1. SPRAWDZANIE CZY POTRZEBNE JEST POBIERANIE
# ==========================================
now = datetime.now()
current_year = now.year
current_month = now.month

if os.path.exists(DB_FILE):
    try:
        con = duckdb.connect(DB_FILE)
        # Sprawdzamy najnowszą datę w tabeli prices
        max_date_res = con.execute("SELECT MAX(Date) FROM prices").fetchone()[0]
        con.close()
        
        if max_date_res:
            if isinstance(max_date_res, str):
                max_date = datetime.strptime(max_date_res, "%Y-%m-%d").date()
            else:
                max_date = max_date_res

            # Jeśli najnowsza data w bazie jest z tego samego miesiąca i roku co dzisiaj
            if max_date.year == current_year and max_date.month == current_month:
                print(f"⚡ Dane są już aktualne (ostatnia data w bazie: {max_date}). W tym miesiącu dane zostały już pobrane. Pomijanie fetch_data.")
                exit(0) # Kończymy działanie skryptu sukcesem bez wykonywania zapytań
    except Exception as e:
        print(f"⚠️ Nie można odczytać istniejącej bazy, pobieranie zostanie wykonane od nowa. Błąd: {e}")

print("🔄 Wymagane pobranie nowych danych...")

# ==========================================
# 2. WCZYTANIE TICKERÓW I AUTOMATYCZNE SEKTORY
# ==========================================
print(f"📂 Wczytywanie tickerów z {CSV_FILE}...")
df_input = pd.read_csv(CSV_FILE)

# Czyszczenie tickerów
df_input['Ticker'] = df_input['Ticker'].astype(str).str.strip().str.upper()
tickers = list(df_input['Ticker'].unique())

print(f"Znaleziono {len(tickers)} tickerów. Pobieranie informacji o sektorach z Yahoo Finance...")

sectors_map = {}
for t in tickers:
    try:
        info = yf.Ticker(t).info
        sectors_map[t] = info.get('sector', 'Unknown')
    except Exception:
        sectors_map[t] = 'Unknown'

df_input['Sector'] = df_input['Ticker'].map(sectors_map)

# Upewniamy się, że kolumna Index_Name istnieje (jeśli nie było jej w CSV)
if 'Index_Name' not in df_input.columns:
    df_input['Index_Name'] = 'ETF_HOLDINGS'

df_constituents = df_input[['Ticker', 'Sector', 'Index_Name']]

# ==========================================
# 3. POBIERANIE HISTORII CEN Z YAHOO FINANCE
# ==========================================
start_date = now - timedelta(days=730)

print(f"📈 Pobieranie historycznych cen dla {len(tickers)} spółek...")
data = yf.download(tickers, start=start_date.strftime('%Y-%m-%d'), end=now.strftime('%Y-%m-%d'))['Adj Close']

# Formatowanie do tabeli (Long format)
if isinstance(data, pd.Series):
    df_prices = data.reset_index()
    df_prices.columns = ['Date', 'Adj_Close']
    df_prices['Ticker'] = tickers[0]
else:
    df_prices = data.reset_index().melt(id_vars=['Date'], var_name='Ticker', value_name='Adj_Close')

df_prices['Date'] = pd.to_datetime(df_prices['Date']).dt.date
df_prices = df_prices.dropna(subset=['Adj_Close'])

# ==========================================
# 4. ZAPIS DO BAZY DUCKDB
# ==========================================
con = duckdb.connect(DB_FILE)

con.execute("CREATE OR REPLACE TABLE index_constituents AS SELECT * FROM df_constituents")
con.execute("CREATE OR REPLACE TABLE prices AS SELECT * FROM df_prices")

con.close()

print(f"✅ Baza {DB_FILE} została zaktualizowana dla miesiąca {current_month}/{current_year}!")
