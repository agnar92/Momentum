"""Etap 20b: filtry siły względnej 6 mies. vs RSP i SPY w CEM10 (S&P 500, 2005-2026); rozszerzenie etapu 20."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r20_cem10_warianty.py')).read().split("mies = [m for m in C.index")[0])
mies = [m for m in C.index if pd.Period('2005-01', 'M') <= m <= pd.Period('2026-09', 'M')]
spf = lambda m: SP.get(m); bear_m = lambda m: bool(spy_bear.get(m, False)); sma_exit = lambda t, s, p: C.at[t, s] < S10.at[t, s]
base = lambda t, s: C.at[t, s] > S10.at[t, s] and R6m.at[t, s] > 0.30
F = {}
for nm in ('RSP', 'SPY'):
    I = etf[nm].reindex(C.index)
    RSL = C.div(I, axis=0)                                  # linia RS
    F[f'(a) zwrot 6M > {nm}'] = (C / C.shift(6)).div(I / I.shift(6), axis=0) - 1 > 0
    F[f'(b) linia RS vs {nm} > SMA 6'] = RSL > RSL.rolling(6, min_periods=6).mean()
    F[f'(c) linia RS vs {nm} na max 6M'] = RSL >= RSL.rolling(6, min_periods=6).max() * 0.999
    if nm == 'RSP': RS12 = (C / C.shift(6)).div(I / I.shift(6), axis=0) - 1
def cagr(e, od=None, do=None):
    if od: e = e[e.index >= pd.Period(od, 'M')]
    if do: e = e[e.index <= pd.Period(do, 'M')]
    return (e.iloc[-1] / e.iloc[0]) ** (12 / (len(e) - 1)) - 1
rows = []
for N_ in (5, 10):
    globals()['N'] = N_
    e0 = sim(mies, spf, base, lambda t, s: R6m.at[t, s], sma_exit, bear_m, C)[0]
    war = {'CEM10 (bez filtra RS)': e0, 'ranking RS 6M vs RSP (= ranking 6M), bez progu 6M > 30 %':
           sim(mies, spf, lambda t, s: C.at[t, s] > S10.at[t, s], lambda t, s: RS12.at[t, s], sma_exit, bear_m, C)[0]}
    for nm, Fm in F.items():
        war[f'CEM10 + {nm}'] = sim(mies, spf, lambda t, s, Fm=Fm: base(t, s) and bool(Fm.at[t, s]), lambda t, s: R6m.at[t, s], sma_exit, bear_m, C)[0]
    for nm, e in war.items():
        d = (e.pct_change() - e0.pct_change()).dropna(); lo, hi = blok(d) if d.abs().sum() > 0 else (0, 0)
        c1, c2, b1, b2 = cagr(e, None, '2015-12'), cagr(e, '2015-12'), cagr(e0, None, '2015-12'), cagr(e0, '2015-12')
        rows.append(dict(N=N_, wariant=nm, CAGR=cagr(e), CAGR_05_15=c1, CAGR_16_26=c2, maxDD=(e / e.cummax() - 1).min(),
                         roznica_vs_CEM10=f'{d.mean()*100:+.2f} ({lo*100:.2f}…{hi*100:.2f})', lepszy=nm.startswith('CEM10 +') and c1 > b1 and c2 > b2 and lo > 0))
    print(N_, flush=True)
for t in ('RSP', 'SPY', 'QQQ'):
    s = etf[t][(etf[t].index >= pd.Period('2005-01', 'M')) & (etf[t].index <= pd.Period('2026-09', 'M'))]
    rows.append(dict(N='-', wariant=t, CAGR=cagr(s), CAGR_05_15=cagr(s, None, '2015-12'), CAGR_16_26=cagr(s, '2015-12'), maxDD=(s / s.cummax() - 1).min()))
T = pd.DataFrame(rows)
open(os.path.join(HERE, 'wyniki', 'r35b_rs6.md'), 'w').write('# Etap 20b: siła względna 6 mies. vs RSP i SPY w CEM10 (S&P 500, 2005-2026)\n\n' + T.round(3).to_markdown(index=False) + '\n')
print(T.round(3).to_markdown(index=False))
