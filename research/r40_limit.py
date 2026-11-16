"""Etap 24: CEM10 z limitem udziału pozycji (przycinanie zwycięzców), protokół etap 24."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r36_laczony.py')).read().split('rows = []')[0])   # macierze, U_SP, U_ND, blok, cagr, etf
SPYm = etf['SPY']
spr = np.array([SPYm.get(ms[i + 1], np.nan) / SPYm.get(ms[i], np.nan) - 1 if i + 1 < NT else 0 for i in range(NT)])


def sim(U, N, od, do, L=None, spy=False, rebal=False, k=0.001):
    i0, i1 = im[pd.Period(od, 'M')], im[pd.Period(do, 'M')]
    poz, got, eq, obrot = {}, 1.0, [1.0], 0.0
    for i in range(i0, i1):
        c = Cm[i]
        for j in list(poz):
            if not np.isfinite(c[j]) or (np.isfinite(S10[i, j]) and c[j] < S10[i, j]): got += poz.pop(j) * (1 - k)
        e = got + sum(poz.values())
        if L is not None:
            for j in poz:
                if poz[j] > L * e:
                    x = poz[j] - L * e; poz[j] -= x; got += x * (1 - k); obrot += x / e
        ok = U[i] & np.isfinite(c) & np.isfinite(S10[i]) & (c > S10[i]) & (np.nan_to_num(R6[i], nan=-9) > 0.30)
        kand = np.flatnonzero(ok); kand = kand[np.argsort(-R6[i, kand])]
        if not BEAR[i]:
            e = got + sum(poz.values())
            for j in kand:
                if len(poz) >= N: break
                if j in poz: continue
                kw = min(e / N, got)
                if kw <= 1e-9: break
                got -= kw; poz[j] = kw * (1 - k)
        if rebal and poz:
            e = got + sum(poz.values()); cel = e / N
            for j in poz:
                d = cel - poz[j]
                if d > 0: d = min(d, got)
                got -= d; poz[j] += d - abs(d) * k
        c1 = Cm[i + 1]
        for j in list(poz):
            if np.isfinite(c1[j]) and np.isfinite(c[j]) and c[j] > 0: poz[j] *= c1[j] / c[j]
            else: got += poz.pop(j) * (1 - k)
        if spy and np.isfinite(spr[i]): got *= 1 + spr[i]
        eq.append(got + sum(poz.values()))
    return pd.Series(eq, index=pd.period_range(od, periods=len(eq), freq='M'))


rows = []
for un, U, od, pol in (('S&P 500', U_SP, '1998-01', '2012-12'), ('NDX', U_ND, '2008-01', '2016-12')):
    for N in (10, 20):
        e0 = sim(U, N, od, '2026-09')
        war = [('CEM10 bez limitu', e0), ('rebalancing do równych wag co miesiąc', sim(U, N, od, '2026-09', rebal=True))]
        for L in (0.10, 0.15, 0.20):
            war.append((f'limit {int(L*100)} %, nadwyżka w gotówce', sim(U, N, od, '2026-09', L)))
            war.append((f'limit {int(L*100)} %, nadwyżka w SPY', sim(U, N, od, '2026-09', L, spy=True)))
        for nm, e in war:
            d = (e.pct_change() - e0.pct_change()).dropna(); lo, hi = blok(d.values) if d.abs().sum() > 0 else (0, 0)
            c1, c2, b1, b2 = cagr(e, None, pol), cagr(e, pol), cagr(e0, None, pol), cagr(e0, pol)
            rows.append(dict(indeks=un, N=N, wariant=nm, CAGR=cagr(e), pierwsza_polowa=c1, druga_polowa=c2, maxDD=(e / e.cummax() - 1).min(),
                             z_10k=10000 * e.iloc[-1], roznica=f'{d.mean()*100:+.2f} ({lo*100:.2f}…{hi*100:.2f})',
                             lepszy=nm != 'CEM10 bez limitu' and c1 > b1 and c2 > b2 and lo > 0))
        print(un, N, flush=True)
T = pd.DataFrame(rows)
out = ['# Etap 24: CEM10 z limitem udziału pozycji (S&P 500 1998-2026, NDX 2008-2026)', '',
       'roznica = średnia różnica miesięcznego zwrotu vs CEM10 bez limitu, pp (95 % bootstrap blokowy).', '', T.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r40_limit.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
