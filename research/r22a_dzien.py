"""Etap 14a: dzienne cechy Trend Template (Minervini) w osobnym pliku mv.duckdb (tabela mv).

Dane: widok dc (po czyszczeniu), serie dzielone jak w r03 (przerwa > 30 dni, skok adj > 5x, spadek < 0,2x bez
wybuchu wolumenu lub przy cenie > 500, rozjazd adj / close > 1,5x bez splitu). Ceny OHLC skorygowane (x adj/close).
Kolumny: seria, ticker, date, o, h, l, c, v, uni (filtr główny i cena faktyczna >= 5 USD), sma50, sma150, sma200,
sma200_22 (SMA 200 sprzed 22 sesji), min252, max252, rs (0,4 r63 + 0,2 r126 + 0,2 r189 + 0,2 r252), rp (percentyl rs
wśród spółek uniwersum w danym dniu, 0-100), vol50 (średni wolumen 50 poprzednich sesji), tt (wszystkie 10 warunków).
"""
import os, time, duckdb
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
OUT = os.path.join(os.path.dirname(DB), 'mv.duckdb')
F = "close >= 1 AND dv20 >= 1e6 AND zero20 <= 0.2 AND close >= 5"
t0 = time.time()
if os.path.exists(OUT): os.remove(OUT)
con = duckdb.connect(OUT)
con.execute(f"SET threads=4; SET memory_limit='10GB'; SET preserve_insertion_order=false; SET temp_directory='{os.path.dirname(DB)}/duckdb_tmp'")
con.execute(f"ATTACH '{DB}' AS r (READ_ONLY)")
con.execute(f"""CREATE TEMP TABLE tick AS SELECT DISTINCT ticker FROM r.dc WHERE {F}""")
print('tickery', con.execute('SELECT count(*) FROM tick').fetchone()[0], flush=True)
W = 'PARTITION BY seria ORDER BY date'
K = 8   # porcje tickerów (pamięć i miejsce na dysku)
for k in range(K):
    con.execute(f"""{'CREATE TABLE mv AS' if k == 0 else 'INSERT INTO mv'}
      WITH x AS (SELECT ticker, date, open * adj / close o, high * adj / close h, low * adj / close l, adj c, volume v, ({F})::INT uni,
         coalesce((date - lag(date) OVER w > 30 OR adj / lag(adj) OVER w > 5
                   OR (adj / lag(adj) OVER w < 0.2 AND (lag(close) OVER w > 500 OR volume < 3 * avg(volume) OVER (w ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING)))
                   OR (NOT split_dzien AND r_adj > -1 AND r_close > -1 AND abs(ln(1 + r_adj) - ln(1 + r_close)) > ln(1.5)))::INT, 0) nowa
         FROM r.dc SEMI JOIN tick USING (ticker) WHERE date >= '1995-06-01' AND hash(ticker) % {K} = {k}
         WINDOW w AS (PARTITION BY ticker ORDER BY date)),
      a AS (SELECT *, ticker || '~' || sum(nowa) OVER (PARTITION BY ticker ORDER BY date ROWS UNBOUNDED PRECEDING) seria FROM x),
      b AS (SELECT seria, ticker, date, o::FLOAT o, h::FLOAT h, l::FLOAT l, c::FLOAT c, v::FLOAT v, uni::TINYINT uni,
        CASE WHEN count(*) OVER (w ROWS 49 PRECEDING) = 50 THEN avg(c) OVER (w ROWS 49 PRECEDING) END::FLOAT sma50,
        CASE WHEN count(*) OVER (w ROWS 149 PRECEDING) = 150 THEN avg(c) OVER (w ROWS 149 PRECEDING) END::FLOAT sma150,
        CASE WHEN count(*) OVER (w ROWS 199 PRECEDING) = 200 THEN avg(c) OVER (w ROWS 199 PRECEDING) END::FLOAT sma200,
        min(c) OVER (w ROWS 251 PRECEDING)::FLOAT min252, max(c) OVER (w ROWS 251 PRECEDING)::FLOAT max252,
        (0.4 * (c / lag(c, 63) OVER w - 1) + 0.2 * (c / lag(c, 126) OVER w - 1) + 0.2 * (c / lag(c, 189) OVER w - 1) + 0.2 * (c / lag(c, 252) OVER w - 1))::FLOAT rs,
        avg(v) OVER (w ROWS BETWEEN 50 PRECEDING AND 1 PRECEDING)::FLOAT vol50,
        row_number() OVER w nr
       FROM a WINDOW w AS ({W}))
      SELECT *, lag(sma200, 22) OVER (PARTITION BY seria ORDER BY date) sma200_22 FROM b""")
    print('porcja', k, f'{time.time()-t0:.0f} s', flush=True)
con.execute("DELETE FROM mv WHERE date < '1997-01-01'")
con.execute("""CREATE TABLE rpt AS SELECT seria, date, (100 * percent_rank() OVER (PARTITION BY date ORDER BY rs))::FLOAT rp
               FROM mv WHERE uni = 1 AND rs IS NOT NULL""")
con.execute("""CREATE VIEW mvt AS SELECT m.*, r.rp,
   (m.uni = 1 AND r.rp > 70 AND c > sma50 AND c > sma150 AND c > sma200 AND sma50 > sma150 AND sma50 > sma200 AND sma150 > sma200
    AND c >= 1.3 * min252 AND c >= 0.75 * max252 AND sma200 > sma200_22 AND nr >= 252)::TINYINT tt
   FROM mv m LEFT JOIN rpt r USING (seria, date)""")
print('mv', con.execute("SELECT count(*), sum(uni), sum(tt), count(DISTINCT seria) FROM mvt").fetchone(), f'{time.time()-t0:.0f} s')
