import sys
import duckdb
import pandas as pd
from tabulate import tabulate

# 1. Pobranie parametru z konsoli (jeśli nie podano -> None)
MAX_PER_SECTOR = None

if len(sys.argv) > 1:
    try:
        MAX_PER_SECTOR = int(sys.argv[1])
        print(f"🔍 Limit sektorowy dla S&P 500 / NASDAQ 100: max {MAX_PER_SECTOR} spółka/spółki na sektor.")
    except ValueError:
        print("⚠️ Niepoprawny parametr. Uruchamianie bez limitu sektorowego.")
else:
    print("ℹ️ Brak limitu sektorowego. Wybór czysto według wyników Score.")

# Dynamiczne nałożenie limitu sektorowego TYLKO na koszyk S&P 500 / NASDAQ 100
if MAX_PER_SECTOR is not None:
    sector_filter_clause = f"WHERE (Basket = 'DOW JONES') OR (Basket = 'S&P 500 / NASDAQ 100' AND rank_in_sector <= {MAX_PER_SECTOR})"
else:
    sector_filter_clause = ""  # Brak filtrowania sektorowego

# Poprawiona kalkulacja SQL: ARGMAX pobiera cenę z najnowszej daty przed podanym punktem w czasie
BASE_CTE = f"""
WITH daily_returns AS (
    SELECT 
        Ticker,
        Date,
        Adj_Close,
        (Adj_Close / LAG(Adj_Close) OVER (PARTITION BY Ticker ORDER BY Date) - 1) AS daily_return
    FROM prices
),
stats AS (
    SELECT 
        Ticker,
        MAX(Date) AS Last_Date,
        -- Zmienność roczna z ostatnich 12 miesięcy
        STDDEV(daily_return) FILTER (WHERE Date >= CURRENT_DATE - INTERVAL '12 MONTHS') * SQRT(252) AS annualized_volatility,
        
        -- NAPRAWIONE MOMENTUM 12M - 1M:
        -- Pobiera cenę z najnowszego dnia sesyjnego sprzed 1 miesiąca oraz cenę z najnowszego dnia sesyjnego sprzed 12 miesięcy
        (ARGMAX(Adj_Close, Date) FILTER (WHERE Date <= CURRENT_DATE - INTERVAL '1 MONTH') / 
         ARGMAX(Adj_Close, Date) FILTER (WHERE Date <= CURRENT_DATE - INTERVAL '12 MONTHS') - 1) AS momentum_12m_1m
    FROM daily_returns
    GROUP BY Ticker
),
prioritized_constituents AS (
    SELECT 
        Ticker,
        Sector,
        Index_Name,
        CASE 
            WHEN Index_Name = 'DOWJONES' THEN 'DOW JONES'
            WHEN Index_Name IN ('SP500', 'NASDAQ100') THEN 'S&P 500 / NASDAQ 100'
        END AS Basket,
        ROW_NUMBER() OVER (
            PARTITION BY Ticker 
            ORDER BY CASE WHEN Index_Name = 'DOWJONES' THEN 1 ELSE 2 END
        ) AS idx_priority
    FROM index_constituents
),
unique_constituents AS (
    SELECT Ticker, Sector, Basket
    FROM prioritized_constituents
    WHERE idx_priority = 1
),
metrics AS (
    SELECT 
        s.Ticker,
        uc.Sector,
        uc.Basket,
        s.momentum_12m_1m,
        s.annualized_volatility,
        (s.momentum_12m_1m / NULLIF(s.annualized_volatility, 0)) AS risk_adjusted_momentum
    FROM stats s
    JOIN unique_constituents uc ON s.Ticker = uc.Ticker
    WHERE s.annualized_volatility > 0 AND s.momentum_12m_1m IS NOT NULL
),
ranked_by_sector AS (
    SELECT 
        Basket,
        Ticker,
        Sector,
        momentum_12m_1m,
        annualized_volatility,
        risk_adjusted_momentum,
        ROW_NUMBER() OVER (
            PARTITION BY Basket, Sector 
            ORDER BY risk_adjusted_momentum DESC
        ) AS rank_in_sector
    FROM metrics
),
filtered_by_sector AS (
    SELECT * 
    FROM ranked_by_sector
    {sector_filter_clause}
),
final_ranked AS (
    SELECT 
        Basket,
        Ticker,
        Sector,
        momentum_12m_1m,
        annualized_volatility,
        risk_adjusted_momentum,
        ROW_NUMBER() OVER (
            PARTITION BY Basket 
            ORDER BY risk_adjusted_momentum DESC
        ) AS rank_in_basket
    FROM filtered_by_sector
)
"""

con = duckdb.connect("momentum_data.duckdb")

# 2. Pobieranie danych dla S&P 500 / NASDAQ 100 (TOP 6)
query_sp500 = BASE_CTE + """
SELECT 
    rank_in_basket AS "Poz.",
    Ticker AS "Ticker",
    Sector AS "Sektor",
    ROUND(momentum_12m_1m * 100, 2) || '%' AS "Momentum (12M-1M)",
    ROUND(annualized_volatility * 100, 2) || '%' AS "Zmienność (12M)",
    ROUND(risk_adjusted_momentum, 3) AS "Score (SPMO)"
FROM final_ranked
WHERE Basket = 'S&P 500 / NASDAQ 100' AND rank_in_basket <= 6
ORDER BY rank_in_basket ASC;
"""

# 3. Pobieranie danych dla DOW JONES (TOP 4)
query_dow = BASE_CTE + """
SELECT 
    rank_in_basket AS "Poz.",
    Ticker AS "Ticker",
    Sector AS "Sektor",
    ROUND(momentum_12m_1m * 100, 2) || '%' AS "Momentum (12M-1M)",
    ROUND(annualized_volatility * 100, 2) || '%' AS "Zmienność (12M)",
    ROUND(risk_adjusted_momentum, 3) AS "Score (SPMO)"
FROM final_ranked
WHERE Basket = 'DOW JONES' AND rank_in_basket <= 4
ORDER BY rank_in_basket ASC;
"""

df_sp500 = con.execute(query_sp500).df()
df_dow = con.execute(query_dow).df()
con.close()

# 4. Wyświetlanie sformatowanych tabel
print("\n" + "="*80)
print("📊 WYNIKI REBALANSU STRATEGII ADJUSTED MOMENTUM")
print("="*80 + "\n")

print("🔹 KOSZYK 1: S&P 500 / NASDAQ 100 (TOP 6)")
print(tabulate(df_sp500, headers='keys', tablefmt='fancy_grid', showindex=False, numalign='center'))

print("\n🔹 KOSZYK 2: DOW JONES INDUSTRIAL AVERAGE (TOP 4)")
print(tabulate(df_dow, headers='keys', tablefmt='fancy_grid', showindex=False, numalign='center'))

# 5. Zapis obu tabel do jednego pliku HTML
with open("portfel_rebalans.html", "w", encoding="utf-8") as f:
    f.write("<h2>📊 KOSZYK 1: S&P 500 / NASDAQ 100 (TOP 6)</h2>\n")
    f.write(df_sp500.to_html(index=False, classes="table"))
    f.write("<br><hr><br>\n")
    f.write("<h2>📊 KOSZYK 2: DOW JONES (TOP 4)</h2>\n")
    f.write(df_dow.to_html(index=False, classes="table"))

print("\n💾 Zapisano podgląd w pliku: portfel_rebalans.html\n")
