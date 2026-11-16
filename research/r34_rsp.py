"""Napędzający RSP (równe wagi) = ranking po zwrocie k mies.; porównanie z wkładem w S&P 500 (waga kapitalizacji x zwrot), 2010-2026, N = 5."""
import os, numpy as np, pandas as pd
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'r33_napedzajace.py')).read().split("krzywe = {}")[0]
exec(src)
globals()['N'] = 5
def cagr(e, od=None, do=None):
    if od: e = e[e.index >= pd.Period(od, 'M')]
    if do: e = e[e.index <= pd.Period(do, 'M')]
    return (e.iloc[-1] / e.iloc[0]) ** (12 / (len(e) - 1)) - 1
rows = []
for k in (1, 3, 6, 12):
    R = C / C.shift(k) - 1
    for nm, X in ((f'napędzające RSP (zwrot {k} mies.)', R), (f'napędzające S&P 500 (waga x zwrot {k} mies.)', WK[k])):
        e = sim(mies, spf, lambda t, s, X=X: C.at[t, s] > S10.at[t, s] and X.at[t, s] > 0, lambda t, s, X=X: X.at[t, s], sma_exit, bear_m, C)[0]
        rows.append(dict(wariant=nm, CAGR=cagr(e), CAGR_10_17=cagr(e, None, '2017-12'), CAGR_18_26=cagr(e, '2017-12'), maxDD=(e / e.cummax() - 1).min()))
    print(k, flush=True)
for t in ('RSP', 'SPY', 'QQQ'):
    s = etf[t][(etf[t].index >= pd.Period('2010-01', 'M')) & (etf[t].index <= pd.Period('2026-09', 'M'))]
    rows.append(dict(wariant=t, CAGR=cagr(s), CAGR_10_17=cagr(s, None, '2017-12'), CAGR_18_26=cagr(s, '2017-12'), maxDD=(s / s.cummax() - 1).min()))
T = pd.DataFrame(rows)
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki', 'r34_rsp.md'), 'w').write('# Napędzający RSP vs S&P 500 (5 pozycji, SMA 10, filtr rynku, 2010-2026)\n\n' + T.round(3).to_markdown(index=False) + '\n')
print(T.round(3).to_markdown(index=False))
