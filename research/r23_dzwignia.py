"""CEM10 S&P 500 (1998-2026) z dźwignią 1 / 1,25 / 1,5 / 2x: zwrot L*r - (L-1)*koszt pożyczki (bony 3M + 1,5 % rocznie,
naliczany tylko w miesiącach z pozycjami). Wyceny miesięczne - spadki w trakcie miesiąca są głębsze niż pokazane."""
import os, numpy as np, pandas as pd
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'r21_krzywe_stopy.py')).read()
exec(src.split("WAR = {")[0])
tb = pd.read_csv('/home/user/eodhd-data/pat/tb3ms.csv', parse_dates=['observation_date']).set_index('observation_date')['TB3MS']
bill = pd.Series((tb / 100 / 12).values, index=tb.index.to_period('M'))
rows, roczne = [], {}
for nm, (a, b) in {'CEM10 (SMA 10)': (False, False), 'CEM10 (SMA 10 + trailing -25 %)': (False, True)}.items():
    e, _ = sim(a, b); r = e.pct_change().dropna()
    koszt = (bill.reindex(r.index).ffill() + 0.015 / 12) * (r != 0)
    for L in (1.0, 1.25, 1.5, 2.0):
        rl = L * r - (L - 1) * koszt
        eq = (1 + rl).cumprod(); dd = eq / eq.cummax() - 1
        rok = (1 + rl).groupby(rl.index.year).prod() - 1
        rows.append(dict(strategia=nm, dzwignia=L, CAGR=eq.iloc[-1] ** (12 / len(rl)) - 1, maxDD=dd.min(), najgorszy_miesiac=rl.min(),
                         najgorszy_rok=rok.min(), najlepszy_rok=rok.max(), lata_ujemne=(rok < 0).sum(), z_10k=10000 * eq.iloc[-1],
                         miesiace_ponizej_minus15=(rl < -0.15).sum()))
        if L in (1.0, 2.0): roczne[f'{nm} {L}x'] = rok
spy = etf['SPY']; sr = spy[(spy.index >= pd.Period('1998-01', 'M')) & (spy.index <= pd.Period('2026-09', 'M'))].pct_change().dropna()
roczne['SPY'] = (1 + sr).groupby(sr.index.year).prod() - 1
T = pd.DataFrame(rows); Y = pd.DataFrame(roczne)
out = ['# CEM10 z dźwignią (S&P 500, 1998-2026, wyceny miesięczne)', '', T.round(3).to_markdown(index=False), '', '## Zwroty roczne', '', Y.round(3).reset_index(names='rok').to_markdown(index=False), '']
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki', 'r23_dzwignia.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
