"""Etap 5a: ślad katalizatora z danych dziennych, zagregowany do tygodnia (tabela kat_w w kat.duckdb).

Dla każdego dnia (tylko dane do dnia t): luka = open/close_poprzedni - 1 (na cenach skorygowanych),
rv = wolumen / średni wolumen z 50 poprzednich sesji, sila_d = (close - low)/(high - low), r_d = zwrot dnia.
Tydzień: max luka, max rv, dzień-katalizator = luka >= 4 % i rv >= 3 (oraz warianty), zwrot dnia z max rv,
liczba dni z rv >= 2. Osobny plik bazy, żeby nie blokować research.duckdb (DuckDB: jeden zapisujący proces).
"""
import os, time, duckdb
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
OUT = os.path.join(os.path.dirname(DB), 'kat.duckdb')
t0 = time.time()
con = duckdb.connect(OUT)
con.execute(f"SET threads=4; SET memory_limit='11GB'; SET preserve_insertion_order=false; SET temp_directory='{os.path.dirname(DB)}/duckdb_tmp'")
con.execute(f"ATTACH '{DB}' AS r (READ_ONLY)")
con.execute("""CREATE OR REPLACE TEMP TABLE dd AS SELECT ticker, date, open*adj/close AS o, high*adj/close AS h, low*adj/close AS l, adj AS c, volume
               FROM r.dc""")
print('dd', f'{time.time()-t0:.0f} s', flush=True)
con.execute("""CREATE OR REPLACE TABLE kat_d AS
  SELECT ticker, date, date_trunc('week', date)::DATE AS okres,
    o / lag(c) OVER w - 1 AS luka,
    volume / nullif(avg(volume) OVER (w ROWS BETWEEN 50 PRECEDING AND 1 PRECEDING), 0) AS rv,
    CASE WHEN h > l THEN (c - l) / (h - l) END AS sila_d,
    c / lag(c) OVER w - 1 AS r_d
  FROM dd WINDOW w AS (PARTITION BY ticker ORDER BY date)""")
print('kat_d', f'{time.time()-t0:.0f} s', flush=True)
con.execute("""CREATE OR REPLACE TABLE kat_w AS
  SELECT ticker, okres,
    max(luka) AS max_luka, max(rv) AS max_rv,
    max((luka >= 0.04 AND rv >= 3)::INT) AS kat_4_3,
    max((luka >= 0.02 AND rv >= 2)::INT) AS kat_2_2,
    max((luka >= 0.08 AND rv >= 5)::INT) AS kat_8_5,
    max((r_d >= 0.08 AND rv >= 3)::INT) AS dzien_8_3,
    arg_max(r_d, rv) AS r_dnia_max_rv, arg_max(sila_d, rv) AS sila_dnia_max_rv,
    sum((rv >= 2)::INT) AS dni_rv2
  FROM kat_d GROUP BY 1, 2""")
print('kat_w', con.execute('SELECT count(*) FROM kat_w').fetchone()[0], f'{time.time()-t0:.0f} s')
con.execute("DROP TABLE kat_d")
