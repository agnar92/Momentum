"""Etap 2a: świece tygodniowe i miesięczne z oczyszczonych danych dziennych (widok dc z r01_baza.py).

Tabela w: ticker, tydzien (poniedziałek), o h l c (skorygowane: OHLC * adj/close), vol (akcje, skorygowane o splity),
dv (obroty USD), ok = filtr główny spełniony w ostatnim dniu tygodnia, ndni = liczba sesji, cena = close faktyczny.
Tabela m: to samo miesięcznie. Tabela rynek_w: SPY i indeks równoważony (średni tygodniowy zwrot spółek z ok).
"""
import os, time, duckdb
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
SRC = os.environ.get('EODHD_DB', '/home/user/ndx/db/eodhd.duckdb')
F = "close >= 1 AND dv20 >= 1e6 AND zero20 <= 0.2"
t0 = time.time()
con = duckdb.connect(DB)
con.execute(f"SET threads=4; SET memory_limit='11GB'; SET preserve_insertion_order=false; SET temp_directory='{os.path.dirname(DB)}/duckdb_tmp'")
# widok dc liczy złączenia czyszczące przy każdym użyciu; materializujemy raz potrzebne kolumny
con.execute(f"""CREATE OR REPLACE TEMP TABLE dcm AS SELECT ticker, date, open, high, low, close, adj, volume, dv,
               ({F})::INT AS okf FROM dc""")
print('dcm', f'{time.time()-t0:.0f} s')
for tab, okres in [('w', 'week'), ('m', 'month')]:
    con.execute(f"""CREATE OR REPLACE TABLE {tab} AS
      SELECT ticker, date_trunc('{okres}', date)::DATE AS okres,
        arg_min(open * adj / close, date) AS o, max(high * adj / close) AS h, min(low * adj / close) AS l,
        arg_max(adj, date) AS c, sum(volume) AS vol, sum(dv) AS dv, arg_max(close, date) AS cena,
        arg_max(okf, date) AS ok, count(*) AS ndni, max(date) AS ostatni
      FROM dcm GROUP BY 1, 2""")
    print(tab, con.execute(f'SELECT count(*) FROM {tab}').fetchone()[0], f'{time.time()-t0:.0f} s')

con.execute(f"ATTACH '{SRC}' AS m (READ_ONLY)")
con.execute("""CREATE OR REPLACE TABLE rynek_w AS
  WITH spy AS (SELECT date_trunc('week', date)::DATE okres, arg_max(adjusted_close, date) spy
               FROM m.prices_valid WHERE ticker = 'SPY.US' GROUP BY 1),
  ew AS (SELECT okres, avg(r) ew_r, count(*) n FROM (
           SELECT okres, c / lag(c) OVER (PARTITION BY ticker ORDER BY okres) - 1 r,
                  lag(ok) OVER (PARTITION BY ticker ORDER BY okres) ok_prev
           FROM w) WHERE ok_prev = 1 AND r IS NOT NULL AND abs(r) < 3 GROUP BY 1)
  SELECT * FROM ew FULL JOIN spy USING (okres) ORDER BY okres""")
print('rynek_w', con.execute('SELECT count(*), min(okres), max(okres) FROM rynek_w').fetchone(), f'{time.time()-t0:.0f} s')
