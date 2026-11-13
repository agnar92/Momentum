"""Kontrola: czy ranking po zwrocie 1M (S&P 500, N = 3 / 5, wyjście SMA 10, filtr rynku) wnosi coś ponad losowy wybór
spośród spółek nad SMA 10 przy tych samych zasadach (placebo: 20 losowych rankingów)."""
import os, numpy as np, pandas as pd
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'r28_szukanie.py')).read().split('rows = []')[0]
exec(src)
rng = np.random.default_rng(20261113)
out = []
for N in (3, 5, 10):
    for rk in ('1M', '6M'):
        a = sim(U_SP, rk, N, False, False, True, '1998-01', '2012-12', 0.001); b = sim(U_SP, rk, N, False, False, True, '2013-01', '2026-09', 0.001)
        out.append(dict(ranking=rk, N=N, CAGR_98_12=a['CAGR'], CAGR_13_26=b['CAGR']))
    pa, pb = [], []
    for k in range(20):
        RANK['los'] = rng.random((NT, NS))
        pa.append(sim(U_SP, 'los', N, False, False, True, '1998-01', '2012-12', 0.001)['CAGR'])
        pb.append(sim(U_SP, 'los', N, False, False, True, '2013-01', '2026-09', 0.001)['CAGR'])
    out.append(dict(ranking='losowy (20 prób): mediana [min..max]', N=N, CAGR_98_12=f'{np.median(pa):.3f} [{min(pa):.3f}..{max(pa):.3f}]',
                    CAGR_13_26=f'{np.median(pb):.3f} [{min(pb):.3f}..{max(pb):.3f}]'))
    print(N, flush=True)
T = pd.DataFrame(out)
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki', 'r29_placebo_1m.md'), 'w').write('# Ranking 1M vs losowy wybór (S&P 500, SMA 10, filtr rynku)\n\n' + T.to_markdown(index=False) + '\n')
print(T.to_markdown(index=False))
