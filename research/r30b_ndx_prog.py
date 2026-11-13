import os, numpy as np, pandas as pd
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'r30_ndx_1m.py')).read().split('rng = np.random')[0]
exec(src)
for N in (3, 5, 10):
    for rk in ('1M', '6M'):
        for prog in (False, True):
            r = [sim(U_ND, rk, N, prog, False, True, a, b, 0.001) for a, b in [('2008-01', '2012-12'), ('2013-01', '2026-09'), ('2008-01', '2026-09')]]
            print(f'NDX N={N} {rk} prog6M30={prog}: ' + ' | '.join(f"{x['CAGR']*100:.1f} % (DD {x['maxDD']*100:.0f} %)" for x in r), flush=True)
