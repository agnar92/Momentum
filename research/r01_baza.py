"""Etap 1a: robocza baza dzienna akcji zwykłych (research.duckdb).

Dla każdego dnia: zwroty z close (cena faktyczna) i adjusted_close, obroty w USD,
mediana obrotów z 20 dni (tylko dni do t włącznie), klasa giełdy, flaga QC.
Nic tu nie filtrujemy, filtry stosują kolejne skrypty.
"""
import os, time, duckdb
SRC = os.environ.get('EODHD_DB', '/home/user/ndx/db/eodhd.duckdb')
OUT = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
MAJOR = "('NASDAQ','NYSE','NYSE MKT','AMEX','BATS','NYSE ARCA')"
t0 = time.time()
con = duckdb.connect(OUT)
con.execute("SET threads=4; SET memory_limit='11GB'; SET preserve_insertion_order=false")
con.execute(f"SET temp_directory='{os.path.dirname(OUT)}/duckdb_tmp'")
con.execute(f"ATTACH '{SRC}' AS m (READ_ONLY)")
con.execute(f"""CREATE OR REPLACE TABLE sec AS
  SELECT ticker, exchange, is_delisted, first_date, last_date, n_days,
         CASE WHEN exchange IN {MAJOR} THEN 'gielda' WHEN exchange='US' THEN 'nieznana' ELSE 'OTC' END AS klasa
  FROM m.securities WHERE type='Common Stock'""")
# Wolumen w EODHD jest skorygowany o splity, a close nie (sprawdzone: AAPL 2019-06-03 wolumen 161,6 mln
# zamiast ok. 40 mln przed splitem 4:1). Splity rozpoznajemy po skoku q = adj/close o >= 20 % w jeden dzień
# (dywidendy zmieniają q o ułamki procenta), i tylko gdy close skacze odwrotnie, a adj jest ciągła
# (inaczej to błąd adj, np. FREEF z adj = 999999,9999). ps = close / iloczyn skoków po dniu t = cena skorygowana tylko o splity.
con.execute("""CREATE OR REPLACE TABLE d AS
  WITH q AS (SELECT p.ticker, p.date, p.open, p.high, p.low, p.close, p.adjusted_close AS adj, p.volume,
         ln((p.adjusted_close/p.close) / lag(p.adjusted_close/p.close) OVER w) AS lq,
         p.adjusted_close / lag(p.adjusted_close) OVER w - 1 AS r_adj,
         p.close / lag(p.close) OVER w - 1 AS r_close
       FROM m.prices_valid p JOIN sec s USING (ticker) WHERE p.adjusted_close < 999999  -- adj = 999999,9999 to znacznik braku korekty
       WINDOW w AS (PARTITION BY p.ticker ORDER BY p.date)),
  f AS (SELECT *, coalesce(sum(CASE WHEN abs(lq) > ln(1.2) AND abs(r_adj) < 0.25 AND abs(ln(1 + r_close) + lq) < 0.1 THEN lq ELSE 0 END)
          OVER (PARTITION BY ticker ORDER BY date ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING), 0) AS lsplit
        FROM q)
  SELECT ticker, date, open, high, low, close, adj, volume, r_adj, r_close,
         abs(coalesce(lq,0)) > ln(1.2) AND abs(r_adj) < 0.25 AND abs(ln(1 + r_close) + lq) < 0.1 AS split_dzien,
         -- błąd danych: adj poza zakresem albo skok adj > 50 % bez ruchu close (błąd korekty)
         (adj >= 999999 OR (abs(r_adj) > 0.5 AND abs(r_close) < 0.1)) AS zly,
         -- ps = adj / czynnik dywidendowy, więc musi leżeć w [adj, 20·adj]; poza tym zakresem
         -- wnioskowanie splitów jest błędne (śmieciowe dane) i przyjmujemy dolną granicę adj
         CASE WHEN close / exp(lsplit) BETWEEN adj AND 20*adj THEN close / exp(lsplit) ELSE adj END AS ps,
         CASE WHEN close / exp(lsplit) BETWEEN adj AND 20*adj THEN close / exp(lsplit) ELSE adj END * volume AS dv,
         NOT (close / exp(lsplit) BETWEEN adj AND 20*adj) AS ps_zastepcze,
         median(CASE WHEN close / exp(lsplit) BETWEEN adj AND 20*adj THEN close / exp(lsplit) ELSE adj END * volume) OVER (PARTITION BY ticker ORDER BY date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) AS dv20
  FROM f""")
con.execute("""CREATE OR REPLACE TABLE qc AS SELECT DISTINCT ticker, date FROM m.qc_flags""")
n = con.execute("SELECT count(*) FROM d").fetchone()[0]
print(f'd: {n:,} wierszy, {time.time()-t0:.0f} s')

# Czyszczenie (etap 1). Filtr Hampela: dzień błędny, gdy close różni się > 3x od mediany 21 sesji wokół
# (10 przed, 10 po). Trwały skok ceny nie jest oznaczany (mediana przechodzi na nowy poziom), oznaczane są
# krótkie plateau w złych jednostkach (IBM 1985-09-27, AMX 2001-02, MIDD 1987-07). Używa przyszłych dni,
# ale tylko do czyszczenia danych; wpływ sprawdzamy w teście odporności.
con.execute("""CREATE OR REPLACE TABLE hampel AS
  SELECT ticker, date FROM (
    SELECT ticker, date, close, median(close) OVER (PARTITION BY ticker ORDER BY date ROWS BETWEEN 10 PRECEDING AND 10 FOLLOWING) m21
    FROM d) WHERE abs(ln(close / m21)) > ln(3)""")
# Tickery z niespójnymi jednostkami: po wycięciu złych dni nadal obroty > 150 mld USD w jeden dzień
# (największe realne obroty pojedynczej spółki USA są kilkukrotnie niższe).
con.execute("""CREATE OR REPLACE TABLE zle_tickery AS
  SELECT ticker, max(dv) mx FROM d ANTI JOIN hampel USING (ticker, date) WHERE NOT zly GROUP BY 1 HAVING max(dv) > 1.5e11""")
for t in ['hampel', 'zle_tickery']:
    print(t, con.execute(f'SELECT count(*) FROM {t}').fetchone()[0])

# Tickery z niemożliwym udziałem w obrotach rynku: iteracyjnie ticker-rok > 6 % rocznych obrotów
# wszystkich akcji (realne maksimum pojedynczej spółki USA to ok. 4-5 %: AAPL, TSLA, NVDA).
import pandas as pd
y = con.execute("""SELECT ticker, year(date) r, sum(dv) s FROM d ANTI JOIN hampel USING(ticker,date)
                   WHERE NOT zly AND close >= 1 GROUP BY 1,2""").df()
bad = set()
for _ in range(50):
    z = y[~y.ticker.isin(bad)].copy(); z['sh'] = z.s / z.groupby('r').s.transform('sum')
    new = set(z[z.sh > 0.06].ticker)
    if not new: break
    bad |= new
con.execute("INSERT INTO zle_tickery SELECT ticker, NULL FROM (SELECT unnest(?::VARCHAR[]) ticker) ANTI JOIN zle_tickery USING (ticker)", [sorted(bad)])

# Duplikaty: dwa tickery z tym samym (data, close, wolumen) w >= 20 dniach z próbki (15. dzień miesiąca).
con.execute("""CREATE OR REPLACE TABLE duplikaty AS
  WITH s AS (SELECT ticker, date, close, volume FROM d WHERE day(date) = 15 AND volume > 0),
  p AS (SELECT a.ticker t1, b.ticker t2, count(*) n FROM s a JOIN s b ON a.date=b.date AND a.close=b.close
        AND a.volume=b.volume AND a.ticker < b.ticker GROUP BY 1,2 HAVING count(*) >= 20)
  SELECT p.*, CASE WHEN x.n_days >= y.n_days THEN t2 ELSE t1 END AS usun
  FROM p JOIN sec x ON x.ticker=t1 JOIN sec y ON y.ticker=t2""")

# Płynność niezależna od jednostek (wolumen bywa w innych jednostkach niż cena):
# spread Corwina-Schultza z dwóch dni high/low (wartości ujemne = 0), mediana 20 dni,
# i odsetek dni bez zmiany zamknięcia w 20 dniach.
con.execute("""CREATE OR REPLACE TABLE plyn AS
  WITH a AS (SELECT ticker, date, close, high, low,
      ln(high/low)^2 + ln(lag(high) OVER w / lag(low) OVER w)^2 AS beta,
      ln(greatest(high, lag(high) OVER w) / least(low, lag(low) OVER w))^2 AS gamma,
      (close = lag(close) OVER w)::INT AS zero_r
    FROM d WHERE high > 0 AND low > 0 WINDOW w AS (PARTITION BY ticker ORDER BY date)),
  b AS (SELECT ticker, date, zero_r,
      greatest(0, 2*(exp(((sqrt(2*beta)-sqrt(beta))/(3-2*sqrt(2)) - sqrt(gamma/(3-2*sqrt(2))))) - 1)
               / (1 + exp(((sqrt(2*beta)-sqrt(beta))/(3-2*sqrt(2)) - sqrt(gamma/(3-2*sqrt(2))))))) AS cs
    FROM a WHERE beta IS NOT NULL)
  SELECT ticker, date,
    median(cs) OVER w20 AS spread20, avg(zero_r) OVER w20 AS zero20
  FROM b WINDOW w20 AS (PARTITION BY ticker ORDER BY date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)""")

# Skoki-błędy: dzienny ruch adj > +300 % lub < -80 %, po którym cena w 5 sesjach wraca do 75-133 %
# ceny sprzed skoku (audyt: 74 % skoków > +300 % tak wraca). Wycinamy dzień skoku i 5 kolejnych.
con.execute("""CREATE OR REPLACE TABLE skoki AS
  WITH x AS (SELECT ticker, date, r_adj, lag(adj) OVER w a0,
      max(adj) OVER (w ROWS BETWEEN 1 FOLLOWING AND 5 FOLLOWING) fmax, min(adj) OVER (w ROWS BETWEEN 1 FOLLOWING AND 5 FOLLOWING) fmin,
      lead(date, 5) OVER w d5
    FROM d WINDOW w AS (PARTITION BY ticker ORDER BY date))
  SELECT ticker, date AS od, coalesce(d5, date) AS do_ FROM x
  WHERE (r_adj > 3 AND fmin/a0 BETWEEN 0.75 AND 1.33) OR (r_adj < -0.8 AND fmax/a0 BETWEEN 0.75 AND 1.33)""")

# Widok roboczy po czyszczeniu
con.execute("""CREATE OR REPLACE VIEW dc AS
  SELECT d.*, p.spread20, p.zero20 FROM d
  LEFT JOIN plyn p USING (ticker, date)
  ANTI JOIN hampel USING (ticker, date)
  ANTI JOIN zle_tickery USING (ticker)
  ANTI JOIN skoki k ON k.ticker = d.ticker AND d.date BETWEEN k.od AND k.do_
  WHERE NOT zly AND ticker NOT IN (SELECT usun FROM duplikaty)""")
for t in ['zle_tickery', 'duplikaty', 'plyn', 'skoki']:
    print(t, con.execute(f'SELECT count(*) FROM {t}').fetchone()[0])
print('dc', con.execute('SELECT count(*) FROM dc').fetchone()[0], f'{time.time()-t0:.0f} s')
