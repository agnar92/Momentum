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
# Seria = ciągły odcinek notowań tickera; nowa seria po przerwie > 30 dni kalendarzowych (ponowne użycie tickera:
# TCT kończy 2006-03-31 przy 40,59 USD i wraca 2014-12-04 przy 79 000 USD; zwrot przez przerwę jest fikcją),
# albo po spadku > 80 % w jeden dzień przy cenie > 500 USD lub bez skoku wolumenu (>= 3x średniej 20 dni; prawdziwy
# krach ma wybuch wolumenu, błąd jednostek nie: ASRT 68 760 -> 1 USD, ZCZZT 199 999 -> 1 USD),
# albo gdy adj i close rozjeżdżają się > 1,5x w jeden dzień bez rozpoznanego splitu (błędna korekta, np. TWX 1999-02-24:
# close +11 %, adj +100 %),
# albo po dziennym wzroście > +400 % bez powrotu (zmiana jednostek, np. SPM 2012-06: 40 -> 35 600 USD, wolumen / 1000).
con.execute(f"""CREATE OR REPLACE TEMP TABLE dcm AS
  WITH a AS (SELECT ticker, date, open, high, low, close, adj, volume, dv, ({F})::INT AS okf,
                    coalesce((date - lag(date) OVER (PARTITION BY ticker ORDER BY date) > 30
                              OR adj / lag(adj) OVER (PARTITION BY ticker ORDER BY date) > 5
                              OR (NOT split_dzien AND r_adj > -1 AND r_close > -1 AND abs(ln(1 + r_adj) - ln(1 + r_close)) > ln(1.5))
                              OR (adj / lag(adj) OVER (PARTITION BY ticker ORDER BY date) < 0.2
                                  AND (lag(close) OVER (PARTITION BY ticker ORDER BY date) > 500
                                       OR volume < 3 * avg(volume) OVER (PARTITION BY ticker ORDER BY date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING)))
                             )::INT, 0) AS nowa FROM dc)
  SELECT *, ticker || '~' || sum(nowa) OVER (PARTITION BY ticker ORDER BY date ROWS UNBOUNDED PRECEDING) AS seria FROM a""")
print('dcm', f'{time.time()-t0:.0f} s')
for tab, okres in [('w', 'week'), ('m', 'month')]:
    con.execute(f"""CREATE OR REPLACE TABLE {tab} AS
      SELECT ticker, seria, date_trunc('{okres}', date)::DATE AS okres,
        arg_min(open * adj / close, date) AS o, max(high * adj / close) AS h, min(low * adj / close) AS l,
        arg_max(adj, date) AS c, sum(volume) AS vol, sum(dv) AS dv, arg_max(close, date) AS cena,
        arg_max(okf, date) AS ok, count(*) AS ndni, max(date) AS ostatni
      FROM dcm GROUP BY 1, 2, 3""")
    print(tab, con.execute(f'SELECT count(*) FROM {tab}').fetchone()[0], f'{time.time()-t0:.0f} s')

con.execute(f"ATTACH '{SRC}' AS m (READ_ONLY)")
con.execute("""CREATE OR REPLACE TABLE rynek_w AS
  WITH spy AS (SELECT date_trunc('week', date)::DATE okres, arg_max(adjusted_close, date) spy
               FROM m.prices_valid WHERE ticker = 'SPY.US' GROUP BY 1),
  ew AS (SELECT okres, avg(r) ew_r, count(*) n FROM (
           SELECT okres, c / lag(c) OVER (PARTITION BY seria ORDER BY okres) - 1 r,
                  lag(ok) OVER (PARTITION BY seria ORDER BY okres) ok_prev
           FROM w) WHERE ok_prev = 1 AND r IS NOT NULL AND abs(r) < 3 GROUP BY 1)
  SELECT * FROM ew FULL JOIN spy USING (okres) ORDER BY okres""")
print('rynek_w', con.execute('SELECT count(*), min(okres), max(okres) FROM rynek_w').fetchone(), f'{time.time()-t0:.0f} s')
