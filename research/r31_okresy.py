import os, numpy as np, pandas as pd
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'r30_ndx_1m.py')).read().split('rng = np.random')[0]
exec(src)
OK = [('1998-01', '2007-12'), ('2008-01', '2012-12'), ('2013-01', '2018-12'), ('2019-01', '2026-09'), ('2008-01', '2026-09')]
rows = []
for un, U in (('S&P 500', U_SP), ('NDX', U_ND)):
    for N in (5, 10):
        for rk in ('1M', '6M'):
            d = dict(indeks=un, N=N, ranking=rk)
            for a, b in OK:
                if un == 'NDX' and a < '2008': d[f'{a[:4]}-{b[:4]}'] = ''; continue
                d[f'{a[:4]}-{b[:4]}'] = f"{sim(U, rk, N, False, False, True, a, b, 0.001)['CAGR']*100:.1f} %"
            rows.append(d)
# trwałość liderów: jaki odsetek top-10 wg zwrotu 6M (i 1M) jest nadal w top-10 po 6 miesiącach, i autokorelacja rang
def trwalosc(U, R, k=10, h=6):
    w = []
    for i in range(im[pd.Period('2008-01', 'M')], im[pd.Period('2026-03', 'M')]):
        a = np.flatnonzero(U[i] & np.isfinite(R[i])); b = np.flatnonzero(U[i + h] & np.isfinite(R[i + h]))
        if len(a) < 30 or len(b) < 30: continue
        ta = set(a[np.argsort(-R[i, a])[:k]]); tb = set(b[np.argsort(-R[i + h, b])[:k]]); w.append(len(ta & tb) / k)
    return np.mean(w)
def odwrot(U, k=10):
    """średni zwrot w kolejnym miesiącu (względem średniej członków) spółek top-k wg zwrotu 1M"""
    x = []
    for i in range(im[pd.Period('2008-01', 'M')], im[pd.Period('2026-08', 'M')]):
        a = np.flatnonzero(U[i] & np.isfinite(R1[i]) & np.isfinite(Cm[i + 1]) & np.isfinite(Cm[i]))
        if len(a) < 30: continue
        f = Cm[i + 1, a] / Cm[i, a] - 1; t = np.argsort(-R1[i, a])[:k]; x.append(f[t].mean() - f.mean())
    return np.mean(x) * 100
def zmiennosc(U):
    x = []
    for i in range(im[pd.Period('2008-01', 'M')], im[pd.Period('2026-08', 'M')]):
        a = np.flatnonzero(U[i] & np.isfinite(R1[i])); x.append(np.nanstd(R1[i, a]))
    return np.mean(x) * 100
cech = pd.DataFrame([dict(indeks=un, top10_6M_nadal_po_6M=trwalosc(U, R6), top10_1M_nadal_po_6M=trwalosc(U, R1),
                          nastepny_mies_top10_1M_vs_srednia_pp=odwrot(U), rozrzut_zwrotow_1M_pp=zmiennosc(U)) for un, U in (('S&P 500', U_SP), ('NDX', U_ND))])
out = ['# Ranking 1M vs 6M: S&P 500 i NDX w tych samych okresach (5 / 10 pozycji, SMA 10, filtr rynku)', '', pd.DataFrame(rows).to_markdown(index=False), '',
       '## Cechy indeksów 2008-2026', '', cech.round(3).to_markdown(index=False), '']
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wyniki', 'r31_okresy.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
