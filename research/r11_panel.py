"""Etap 6a: panel miesięczny spółka-miesiąc na cały okres (cechy jak w r10_statystyka.py + zwroty przyszłe), Parquet poza repo.

Liczone w DuckDB funkcjami okiennymi (wersja w pandas przekraczała pamięć). Definicje cech jak w r10:
zwroty 1/3/6/12 mies., 12-1, sprzed 1-3 lat, odległość od max/min 12 mies. i rekordu, zmienność dzienna 1 mies. i średnia
12 mies., zawężenie, szerokość 3 mies., największy dzienny wzrost, odsetek dni wzrostowych, seria miesięcy wzrostowych,
wolumen / średnia 12 mies., log obrotów, sezonowość własna (średni zwrot tego miesiąca kalendarzowego w poprzednich latach,
>= 3 lata, dla miesiąca t+1, znana w t). Zwroty przyszłe f1..f12: koniec serii = ostatnia cena; brak danych = NULL.
koniec1 = seria kończy się w miesiącu t+1 przed końcem danych (wycofanie / przerwa) -> wariant z karą.
Granic prób pilnują skrypty analizy (uczenie <= 2012, walidacja 2013-07 ... 2018, test >= 2019-07 dopiero w etapie 10).
"""
import os, time, duckdb
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
OUT = os.path.join(os.path.dirname(DB), 'panel_m.parquet')
t0 = time.time()
con = duckdb.connect(DB, read_only=True)
con.execute(f"SET threads=4; SET memory_limit='10GB'; SET preserve_insertion_order=false; SET temp_directory='{os.path.dirname(DB)}/duckdb_tmp'")
con.execute("""CREATE TEMP TABLE dm AS SELECT ticker, date_trunc('month', date)::DATE okres, stddev(r_adj) rv_d, max(r_adj) max_d,
               avg((r_adj > 0)::INT) up_d FROM dc GROUP BY 1, 2""")
print('dm', f'{time.time()-t0:.0f} s', flush=True)
con.execute("""CREATE TEMP TABLE a AS
  SELECT m.ticker, m.seria, m.okres, m.c, m.vol, m.dv, m.ok, dm.rv_d, dm.max_d, dm.up_d,
         m.c / lag(m.c) OVER w - 1 AS r1m,
         row_number() OVER w AS nr
  FROM m LEFT JOIN dm ON dm.ticker = m.ticker AND dm.okres = m.okres
  WINDOW w AS (PARTITION BY m.seria ORDER BY m.okres)""")
con.execute("""CREATE TEMP TABLE a2 AS
  SELECT *, lag(r1m) OVER w > 0 AS up_prev,
    CASE WHEN count(r1m) OVER (PARTITION BY seria, month(okres) ORDER BY okres ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) >= 3
         THEN avg(r1m) OVER (PARTITION BY seria, month(okres) ORDER BY okres ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) END AS s_m
  FROM a WINDOW w AS (PARTITION BY seria ORDER BY okres)""")
con.execute("""CREATE TEMP TABLE b AS
  SELECT *, sum(CASE WHEN (r1m > 0) IS DISTINCT FROM up_prev THEN 1 ELSE 0 END) OVER (PARTITION BY seria ORDER BY okres) AS wysp
  FROM a2""")
print('a, b', f'{time.time()-t0:.0f} s', flush=True)
con.execute(f"""COPY (
  SELECT ticker, seria, okres, c, ok, dv AS dv1, r1m,
    c / lag(c, 3) OVER w - 1 AS r3, c / lag(c, 6) OVER w - 1 AS r6, c / lag(c, 12) OVER w - 1 AS r12,
    lag(c, 1) OVER w / lag(c, 12) OVER w - 1 AS r12_1, lag(c, 12) OVER w / lag(c, 36) OVER w - 1 AS r36_12,
    CASE WHEN nr >= 12 THEN c / max(c) OVER (w ROWS 11 PRECEDING) - 1 END AS od_max12,
    CASE WHEN nr >= 12 THEN c / min(c) OVER (w ROWS 11 PRECEDING) - 1 END AS od_min12,
    c / max(c) OVER (w ROWS UNBOUNDED PRECEDING) - 1 AS od_ath,
    rv_d AS rv1,
    CASE WHEN count(rv_d) OVER (w ROWS 11 PRECEDING) >= 9 THEN avg(rv_d) OVER (w ROWS 11 PRECEDING) END AS rv12,
    rv_d / CASE WHEN count(rv_d) OVER (w ROWS 11 PRECEDING) >= 9 THEN avg(rv_d) OVER (w ROWS 11 PRECEDING) END AS zawezenie,
    CASE WHEN nr >= 3 THEN max(c) OVER (w ROWS 2 PRECEDING) / min(c) OVER (w ROWS 2 PRECEDING) - 1 END AS zakres3,
    max_d, up_d,
    CASE WHEN r1m IS NULL THEN NULL ELSE (row_number() OVER (PARTITION BY seria, wysp ORDER BY okres)) * CASE WHEN r1m > 0 THEN 1 ELSE -1 END END AS seria_wzr,
    vol / CASE WHEN count(vol) OVER (w ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING) >= 9 THEN avg(vol) OVER (w ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING) END AS vol_zm,
    ln(1 + avg(dv) OVER (w ROWS 2 PRECEDING)) AS log_dv,
    lead(s_m) OVER w AS sez_wlasna,
    CASE WHEN lead(c, 1) OVER w IS NOT NULL THEN lead(c, 1) OVER w / c - 1
         WHEN max(okres) OVER (PARTITION BY seria) < max(okres) OVER () THEN last_value(c) OVER wp / c - 1 END AS f1,
    CASE WHEN lead(c, 3) OVER w IS NOT NULL THEN lead(c, 3) OVER w / c - 1
         WHEN max(okres) OVER (PARTITION BY seria) < max(okres) OVER () THEN last_value(c) OVER wp / c - 1 END AS f3,
    CASE WHEN lead(c, 6) OVER w IS NOT NULL THEN lead(c, 6) OVER w / c - 1
         WHEN max(okres) OVER (PARTITION BY seria) < max(okres) OVER () THEN last_value(c) OVER wp / c - 1 END AS f6,
    CASE WHEN lead(c, 12) OVER w IS NOT NULL THEN lead(c, 12) OVER w / c - 1
         WHEN max(okres) OVER (PARTITION BY seria) < max(okres) OVER () THEN last_value(c) OVER wp / c - 1 END AS f12,
    (lead(c, 2) OVER w IS NULL AND lead(c, 1) OVER w IS NOT NULL AND max(okres) OVER (PARTITION BY seria) < max(okres) OVER ())::INT AS koniec1
  FROM b
  WINDOW w AS (PARTITION BY seria ORDER BY okres),
         wp AS (PARTITION BY seria ORDER BY okres ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
) TO '{OUT}' (FORMAT PARQUET)""")
n = con.execute(f"SELECT count(*), sum(ok) FROM '{OUT}'").fetchone()
print('panel', n, OUT, f'{time.time()-t0:.0f} s')
