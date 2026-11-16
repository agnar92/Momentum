"""Etap 24b (bazuje na r40): CEM10 z limitem udziału pozycji (przycinanie zwycięzców), protokół etap 24."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r36_laczony.py')).read().split('rows = []
for un, U, od, pol in (('S&P 500', U_SP, '1998-01', '2012-12'), ('NDX', U_ND, '2008-01', '2016-12')):
    for N in (10, 20):
        e0 = sim(U, N, od, '2026-09')
        war = [('CEM10 bez rebalancingu', e0), ('rebalancing raz w roku (grudzień)', sim(U, N, od, '2026-09', rebal={12})),
               ('rebalancing co kwartał', sim(U, N, od, '2026-09', rebal={3, 6, 9, 12})), ('rebalancing co miesiąc', sim(U, N, od, '2026-09', rebal=set(range(1, 13))))]
        for nm, e in war:
            d = (e.pct_change() - e0.pct_change()).dropna(); lo, hi = blok(d.values) if d.abs().sum() > 0 else (0, 0)
            c1, c2, b1, b2 = cagr(e, None, pol), cagr(e, pol), cagr(e0, None, pol), cagr(e0, pol)
            rows.append(dict(indeks=un, N=N, wariant=nm, CAGR=cagr(e), pierwsza_polowa=c1, druga_polowa=c2, maxDD=(e / e.cummax() - 1).min(),
                             z_10k=round(10000 * e.iloc[-1]), roznica=f'{d.mean()*100:+.2f} ({lo*100:.2f}…{hi*100:.2f})',
                             lepszy=nm != 'CEM10 bez rebalancingu' and c1 > b1 and c2 > b2 and lo > 0))
        print(un, N, flush=True)
T = pd.DataFrame(rows)
out = ['# Etap 24b: CEM10 z rebalancingiem raz w roku / co kwartał / co miesiąc', '',
       'roznica = średnia różnica miesięcznego zwrotu vs CEM10 bez rebalancingu, pp (95 % bootstrap blokowy).', '', T.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r41_rebal_rok.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
