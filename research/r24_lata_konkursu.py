"""CEM10 (S&P 500, skład point-in-time) w latach porównywalnych z wynikami Minerviniego: 1997, 1996-2000, 2021.
Symulacja startuje od 1996-01 (pierwszy skład w danych); lata 1996-1997 mają niepełne dane o spółkach wycofanych."""
import os, numpy as np, pandas as pd
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'r21_krzywe_stopy.py')).read()
exec(src.split("WAR = {")[0])
tb = pd.read_csv('/home/user/eodhd-data/pat/tb3ms.csv', parse_dates=['observation_date']).set_index('observation_date')['TB3MS']
bill = pd.Series((tb / 100 / 12).values, index=tb.index.to_period('M'))
spy = etf['SPY']
rows = []
for nm, (a, b) in {'CEM10 (SMA 10)': (False, False), 'CEM10 (SMA 10 + trailing -25 %)': (False, True)}.items():
    e, _ = sim(a, b, od='1996-01'); r = e.pct_change().dropna(); k = (bill.reindex(r.index).ffill() + 0.015 / 12) * (r != 0)
    for L in (1.0, 2.0):
        rl = L * r - (L - 1) * k
        rok = (1 + rl).groupby(rl.index.year).prod() - 1
        for y in (1996, 1997, 1998, 1999, 2000, 2021):
            rows.append(dict(strategia=nm, dzwignia=L, okres=str(y), zwrot=rok.get(y, np.nan)))
        w = rl[(rl.index.year >= 1996) & (rl.index.year <= 2000)]
        rows.append(dict(strategia=nm, dzwignia=L, okres='1996-2000 łącznie', zwrot=(1 + w).prod() - 1))
        rows.append(dict(strategia=nm, dzwignia=L, okres='1996-2000 CAGR', zwrot=(1 + w).prod() ** (12 / len(w)) - 1))
sr = spy.pct_change().dropna(); rs = (1 + sr).groupby(sr.index.year).prod() - 1
for y in (1996, 1997, 1998, 1999, 2000, 2021): rows.append(dict(strategia='SPY', dzwignia=1.0, okres=str(y), zwrot=rs.get(y, np.nan)))
w = sr[(sr.index.year >= 1996) & (sr.index.year <= 2000)]
rows.append(dict(strategia='SPY', dzwignia=1.0, okres='1996-2000 łącznie', zwrot=(1 + w).prod() - 1))
T = pd.DataFrame(rows).pivot_table(index='okres', columns=['strategia', 'dzwignia'], values='zwrot')
print(T.round(3).to_string())
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki', 'r24_lata_konkursu.md'), 'w').write('# CEM10 w latach wyników Minerviniego\n\n' + T.round(3).to_markdown() + '\n')
