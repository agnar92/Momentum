"""Ranking 1M / 3M / 6M / 12-1 vs losowy wybór na Nasdaq-100 (skład point-in-time od 2008), zasady jak w r29:
wejście > SMA 10, wyjście < SMA 10, brak zakupów przy SPY < SMA 12, koszt 0,1 %/stronę. Odniesienie QQQ."""
import os, numpy as np, pandas as pd
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'r28_szukanie.py')).read().split('rows = []')[0]
src = src.replace("pm.seria.isin(set().union(*SP.values()))", "pm.seria.isin(set().union(*SP.values(), *ND.values()))")
exec(src)
U_ND = np.zeros((NT, NS), bool)
for m, ss in ND.items():
    if m in im: U_ND[im[m], [isr[s] for s in ss if s in isr]] = True
rng = np.random.default_rng(20261113)
OKR = [('2008-01', '2012-12'), ('2013-01', '2026-09'), ('2008-01', '2026-09')]
out = []
for N in (3, 5, 10):
    for rk in ('1M', '3M', '6M', '12-1'):
        r_ = {f'{a[:4]}-{b[:4]}': sim(U_ND, rk, N, False, False, True, a, b, 0.001) for a, b in OKR}
        out.append(dict(N=N, ranking=rk, **{k: f"{v['CAGR']*100:.1f} % (DD {v['maxDD']*100:.0f} %)" for k, v in r_.items()}))
    P = {k: [] for k in ('2008-2012', '2013-2026', '2008-2026')}
    for k in range(20):
        RANK['los'] = rng.random((NT, NS))
        for a, b in OKR: P[f'{a[:4]}-{b[:4]}'].append(sim(U_ND, 'los', N, False, False, True, a, b, 0.001)['CAGR'])
    out.append(dict(N=N, ranking='losowy: mediana [min..max]', **{k: f'{np.median(v)*100:.1f} % [{min(v)*100:.1f}..{max(v)*100:.1f}]' for k, v in P.items()}))
    print(N, flush=True)
q = etf['QQQ']
def cagr(s, a, b):
    s = s[(s.index >= pd.Period(a, 'M')) & (s.index <= pd.Period(b, 'M'))]; return (s.iloc[-1] / s.iloc[0]) ** (12 / (len(s) - 1)) - 1
out.append(dict(N='-', ranking='QQQ', **{f'{a[:4]}-{b[:4]}': f'{cagr(q, a, b)*100:.1f} %' for a, b in OKR}))
T = pd.DataFrame(out)
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki', 'r30_ndx_1m.md'), 'w').write('# NDX: ranking vs losowy wybór (SMA 10, filtr rynku)\n\n' + T.to_markdown(index=False) + '\n')
print(T.to_markdown(index=False))
