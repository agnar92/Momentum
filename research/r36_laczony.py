"""Etap 21: ranking łączony 1M + 6M vs ranking 6M (protokół etap 21)."""
import os, numpy as np, pandas as pd
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'r30_ndx_1m.py')).read().split('rng = np.random')[0]
exec(src)


def mieszany(U, w):
    X = np.full((NT, NS), np.nan)
    for i in range(NT):
        a = np.flatnonzero(U[i] & np.isfinite(R1[i]) & np.isfinite(R6[i]))
        if len(a) < 10: continue
        X[i, a] = w * (pd.Series(R1[i, a]).rank(pct=True).values) + (1 - w) * (pd.Series(R6[i, a]).rank(pct=True).values)
    return X


def sim_eq(U, rk, N, prog, od, do):
    # wersja sim z r28 zwracająca krzywą (kopiuje logikę r28.sim)
    i0, i1 = im[pd.Period(od, 'M')], im[pd.Period(do, 'M')]
    poz, got, eq = {}, 1.0, [1.0]; Rk = RANK[rk]
    for i in range(i0, i1):
        c = Cm[i]; ok = U[i] & np.isfinite(c) & np.isfinite(S10[i]) & (c > S10[i]) & np.isfinite(Rk[i])
        if prog: ok &= np.nan_to_num(R6[i], nan=-9) > 0.30
        kand = np.flatnonzero(ok); kand = kand[np.argsort(-Rk[i, kand])]
        for j in list(poz):
            if not np.isfinite(c[j]) or (np.isfinite(S10[i, j]) and c[j] < S10[i, j]): got += poz.pop(j) * 0.999
        if not BEAR[i] and len(poz) < N:
            wolne = N - len(poz); e = got + sum(poz.values())
            for j in kand:
                if wolne == 0: break
                if j in poz: continue
                k = min(e / N, got)
                if k <= 1e-9: break
                got -= k; poz[j] = k * 0.999; wolne -= 1
        c1 = Cm[i + 1]
        for j in list(poz):
            if np.isfinite(c1[j]) and np.isfinite(c[j]) and c[j] > 0: poz[j] *= c1[j] / c[j]
            else: got += poz.pop(j) * 0.999
        eq.append(got + sum(poz.values()))
    return pd.Series(eq, index=pd.period_range(od, periods=len(eq), freq='M'))


def cagr(e, od=None, do=None):
    if od: e = e[e.index >= pd.Period(od, 'M')]
    if do: e = e[e.index <= pd.Period(do, 'M')]
    return (e.iloc[-1] / e.iloc[0]) ** (12 / (len(e) - 1)) - 1


rows = []
for un, U, od, pol in (('S&P 500', U_SP, '1998-01', '2012-12'), ('NDX', U_ND, '2008-01', '2016-12')):
    RANK['mix50'] = mieszany(U, 0.5); RANK['mix33'] = mieszany(U, 1 / 3)
    for N in (5, 10):
        for prog in (True, False):
            e0 = sim_eq(U, '6M', N, prog, od, '2026-09')
            for rk, nm in (('6M', 'ranking 6M (CEM10)'), ('mix50', '50 % 1M + 50 % 6M'), ('mix33', '1/3 1M + 2/3 6M')):
                e = e0 if rk == '6M' else sim_eq(U, rk, N, prog, od, '2026-09')
                d = (e.pct_change() - e0.pct_change()).dropna(); lo, hi = blok(d.values) if d.abs().sum() > 0 else (0, 0)
                c1, c2, b1, b2 = cagr(e, None, pol), cagr(e, pol), cagr(e0, None, pol), cagr(e0, pol)
                rows.append(dict(indeks=un, N=N, prog_6M_30=prog, ranking=nm, CAGR=cagr(e), pierwsza_polowa=c1, druga_polowa=c2,
                                 maxDD=(e / e.cummax() - 1).min(), roznica_vs_6M=f'{d.mean()*100:+.2f} ({lo*100:.2f}…{hi*100:.2f})',
                                 lepszy=rk != '6M' and c1 > b1 and c2 > b2 and lo > 0))
        print(un, N, flush=True)
T = pd.DataFrame(rows)
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki', 'r36_laczony.md'), 'w').write(
    '# Etap 21: ranking łączony 1M + 6M (połowy: S&P 1998-2012 / 2013-2026, NDX 2008-2016 / 2017-2026)\n\n' + T.round(3).to_markdown(index=False) + '\n')
print(T.round(3).to_markdown(index=False))
