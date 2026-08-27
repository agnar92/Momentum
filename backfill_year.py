import subprocess
import pandas as pd
import duckdb

def get_rebalance_dates(con, months=12):
    """Pobiera ostatni dzień handlowy z każdego z ostatnich N miesięcy."""
    query = f"""
    WITH monthly_dates AS (
        SELECT 
            DATE_TRUNC('month', Date) as month_start,
            MAX(Date) as last_trade_day
        FROM prices
        GROUP BY 1
        ORDER BY month_start DESC
        LIMIT {months + 1}
    )
    SELECT last_trade_day FROM monthly_dates ORDER BY last_trade_day ASC;
    """
    df = con.execute(query).df()
    return [d.strftime('%Y-%m-%d') for d in df['last_trade_day']]

def run_backfill():
    con = duckdb.connect("momentum_data.duckdb")
    dates = get_rebalance_dates(con, months=12)
    con.close()
    
    print(f"🚀 Rozpoczynam symulację wsteczną dla {len(dates)} okresów:")
    for d in dates:
        print(f"\n--- Przetwarzanie daty: {d} ---")
        # Wywołujemy run_query.py z konkretną datą referencyjną
        result = subprocess.run(["python", "run_query.py", "--ref-date", d])
        if result.returncode != 0:
            print(f"❌ Błąd podczas przetwarzania daty {d}")
            break

if __name__ == "__main__":
    run_backfill()