"""Etap 1b: audyt danych po czyszczeniu (r01_baza.py). Wyniki -> wyniki/r02_audyt.md

A. czyszczenie: ile wierszy i tickerów usunęła każda reguła,
B. pokrycie po latach i klasach giełd po filtrze głównym,
C. skrajne zmiany dzienne, które zostały po czyszczeniu (powrót w 5 dni = ślad błędu), przedział Wilsona,
D. porównanie z Yahoo: losowe pary spółka-rok z próby uczącej, obroty i dzienne zwroty.
Daty >= 2013-07-01 tylko w zliczeniach pokrycia (bez zwrotów).
"""
import os, warnings, duckdb, numpy as np, pandas as pd
from statsmodels.stats.proportion import proportion_confint
warnings.filterwarnings('ignore')
DB = os.environ.get('RESEARCH_DB', '/home/user/ndx/db/research.duckdb')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki', 'r02_audyt.md')
F = "close >= 1 AND dv20 >= 1e6 AND zero20 <= 0.2"   # filtr główny dnia
UCZ = "date BETWEEN '1995-01-01' AND '2012-12-31'"
con = duckdb.connect(DB, read_only=True); con.execute("SET threads=4; SET memory_limit='11GB'")
out = []
md = lambda df: df.to_markdown(index=False)
wil = lambda k, n: '%.3f (%.3f-%.3f)' % ((k / n,) + proportion_confint(k, n, method='wilson'))

# A. czyszczenie
n_d = con.execute("SELECT count(*), count(DISTINCT ticker) FROM d").fetchone()
rows = [('wszystkie wiersze akcji zwykłych (prices_valid, bez adj = 999999,9999)', *n_d)]
rows.append(('adj skacze > 50 % bez ruchu close (błąd korekty)', *con.execute("SELECT count(*), count(DISTINCT ticker) FROM d WHERE zly").fetchone()))
rows.append(('filtr Hampela: cena > 3x od mediany 21 sesji', *con.execute("SELECT count(*), count(DISTINCT ticker) FROM hampel").fetchone()))
rows.append(('lata spółek z niemożliwymi obrotami (> 150 mld USD/dzień lub > 10 % rynku; tickery = pary ticker-rok)', con.execute("SELECT count(*) FROM d JOIN zle_lata z ON z.ticker=d.ticker AND z.rok=year(d.date)").fetchone()[0], con.execute("SELECT count(*) FROM zle_lata").fetchone()[0]))
rows.append(('duplikaty tickerów (ta sama data, close i wolumen w >= 20 dniach próbki)', *con.execute("SELECT count(*) FROM d WHERE ticker IN (SELECT usun FROM duplikaty)").fetchone(), con.execute("SELECT count(DISTINCT usun) FROM duplikaty").fetchone()[0]))
n_dc = con.execute("SELECT count(*), count(DISTINCT ticker) FROM dc").fetchone()
rows.append(('po czyszczeniu (widok dc)', *n_dc))
n_f = con.execute(f"SELECT count(*), count(DISTINCT ticker) FROM dc WHERE {F}").fetchone()
rows.append(('po filtrze głównym: close >= 1, mediana obrotów 20 dni >= 1 mln USD, dni bez zmiany ceny <= 20 %', *n_f))
a = pd.DataFrame(rows, columns=['krok', 'wiersze', 'tickery'])
out += ['## A. Czyszczenie', '', md(a), '',
        'Obroty liczone z ceny skorygowanej tylko o splity (ps): wolumen w EODHD jest skorygowany o splity, a close nie '
        '(AAPL 2019-06-03: 161,6 mln akcji w bazie, ok. 40 mln faktycznie). Splity rozpoznane po skoku adj/close >= 20 % '
        'z przeciwnym skokiem close i ciągłą adj; ps ograniczone do [adj, 20·adj].', '']

# B. pokrycie
b = con.execute(f"""SELECT year(date) rok, count(DISTINCT CASE WHEN klasa='gielda' THEN ticker END) gielda,
    count(DISTINCT CASE WHEN klasa='OTC' THEN ticker END) otc, count(DISTINCT CASE WHEN is_delisted THEN ticker END) wycofane_pozniej,
    round(sum(dv)/1e12, 1) obroty_bln_usd
  FROM dc JOIN sec USING(ticker) WHERE {F} AND year(date) BETWEEN 1985 AND 2025 GROUP BY 1 ORDER BY 1""").df()
out += ['## B. Pokrycie po filtrze głównym', '', 'Liczba spółek w roku (co najmniej jeden dzień po filtrze) i suma obrotów.', '', md(b), '']
sh = con.execute(f"""SELECT klasa, count(*) dni, round(sum(dv)/sum(sum(dv)) OVER (), 4) udzial_obrotow
  FROM dc JOIN sec USING(ticker) WHERE {F} AND {UCZ} GROUP BY 1 ORDER BY 2 DESC""").df()
out += ['Klasy giełd w próbie uczącej 1995-2012 (giełda = ostatnia giełda notowań; spółki wycofane często kończą na OTC):', '', md(sh), '']

# C. skrajne zmiany, które zostały
con.execute(f"""CREATE TEMP TABLE ex AS
  WITH x AS (SELECT ticker, date, adj, r_adj, close, dv20, zero20, lag(adj) OVER w a_prev, lag(close) OVER w c_prev,
      max(adj) OVER (w ROWS BETWEEN 1 FOLLOWING AND 5 FOLLOWING) a_fmax, min(adj) OVER (w ROWS BETWEEN 1 FOLLOWING AND 5 FOLLOWING) a_fmin
    FROM dc WHERE {UCZ} WINDOW w AS (PARTITION BY ticker ORDER BY date))
  SELECT *, CASE WHEN r_adj > 0 THEN a_fmin/a_prev ELSE a_fmax/a_prev END powrot FROM x
  WHERE (r_adj > 1 OR r_adj < -0.5) AND c_prev >= 1 AND dv20 >= 1e6 AND zero20 <= 0.2""")
nf = con.execute(f"SELECT count(*) FROM dc WHERE {F} AND {UCZ}").fetchone()[0]
c = con.execute("""SELECT CASE WHEN r_adj > 3 THEN '> +300 %' WHEN r_adj > 1 THEN '+100..300 %' WHEN r_adj < -0.8 THEN '< -80 %' ELSE '-50..-80 %' END typ,
   count(*) n, sum((powrot BETWEEN 0.75 AND 1.33)::INT) wraca FROM ex GROUP BY 1 ORDER BY 1""").df()
c['udzial_wraca (95 %)'] = [wil(k, n) for k, n in zip(c.wraca, c.n)]
out += ['## C. Skrajne zmiany dzienne po czyszczeniu (1995-2012, filtr główny)', '',
        f'Dni po filtrze: {nf:,}. "Wraca" = w 5 kolejnych sesjach cena wraca do 75-133 % ceny sprzed skoku. '
        'Dla porównania odsetek powrotów wśród ruchów o +-50..100 % pokazuje, jak często wracają ruchy prawdziwe.', '', md(c), '']

# D. Yahoo
import yfinance as yf
rng = np.random.default_rng(20261110)
pary = con.execute(f"""SELECT ticker, year(date) r, count(*) n FROM dc WHERE {F} AND {UCZ} GROUP BY 1,2 HAVING count(*) >= 100""").df()
pary = pary.iloc[rng.choice(len(pary), size=300, replace=False)]
wyn = []
for t, r in zip(pary.ticker, pary.r):
    sym = t.removesuffix('.US').replace('_old', '')
    try:
        y = yf.download(sym, start=f'{r}-01-01', end=f'{r+1}-01-01', auto_adjust=False, progress=False, threads=False)
    except Exception:
        y = None
    if y is None or len(y) < 50:
        wyn.append((t, r, 'brak w Yahoo', np.nan, np.nan, np.nan)); continue
    y.columns = [x[0] if isinstance(x, tuple) else x for x in y.columns]
    y = y.reset_index()[['Date', 'Close', 'Adj Close', 'Volume']]
    y['Date'] = pd.to_datetime(y['Date']).dt.date
    e = con.execute(f"SELECT date, adj, ps, volume, dv FROM dc WHERE ticker=? AND year(date)=?", [t, int(r)]).df()
    e['date'] = pd.to_datetime(e['date']).dt.date
    m = e.merge(y, left_on='date', right_on='Date').sort_values('date')
    if len(m) < 50:
        wyn.append((t, r, 'za mało wspólnych dni', np.nan, np.nan, np.nan)); continue
    ra, rb = m.adj.pct_change(), m['Adj Close'].pct_change()
    zgod = float(((ra - rb).abs() < 0.005).iloc[1:].mean())
    korel = float(np.corrcoef(ra.iloc[1:], rb.iloc[1:])[0, 1])
    dvy = (m.Close * m.Volume).median()
    wyn.append((t, r, 'ok', zgod, korel, m.dv.median() / dvy if dvy > 0 else np.nan))
w = pd.DataFrame(wyn, columns=['ticker', 'rok', 'status', 'zgodne_zwroty', 'korelacja', 'obroty_eodhd_do_yahoo'])
w.to_csv(OUT.replace('.md', '_yahoo.csv'), index=False)
ok = w[w.status == 'ok']
st = w.status.value_counts().rename_axis('status').reset_index(name='n')
k1 = int((ok.zgodne_zwroty >= 0.95).sum()); k2 = int(ok.obroty_eodhd_do_yahoo.between(0.5, 2).sum())
out += ['## D. Porównanie z Yahoo (300 losowych par spółka-rok z 1995-2012, ziarno 20261110)', '', md(st), '',
        f'Wśród {len(ok)} porównanych: dzienne zwroty zgodne (różnica < 0,5 pp) w >= 95 % dni: {wil(k1, len(ok))}; '
        f'mediana obrotów EODHD w przedziale 0,5-2x Yahoo: {wil(k2, len(ok))}.', '',
        'Rozkład (kwantyle 5 / 25 / 50 / 75 / 95 %):', '',
        md(ok[['zgodne_zwroty', 'korelacja', 'obroty_eodhd_do_yahoo']].quantile([.05, .25, .5, .75, .95]).round(3).reset_index().rename(columns={'index': 'kwantyl'})), '',
        'Najgorsze przypadki:', '', md(ok.sort_values('zgodne_zwroty').head(10).round(3)), '']
open(OUT, 'w').write('# Etap 1: audyt danych\n\n' + '\n'.join(out))
print('\n'.join(out))
