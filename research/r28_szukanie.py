"""Etap 18: szukanie prostych strategii miesięcznych 50-100 % rocznie (lista 320 wariantów i procedura w protokole).
Okres wyboru 1998-2012, sprawdzian 2013-2026 (osobne symulacje od zera)."""
import os, itertools, warnings, numpy as np, pandas as pd
from scipy import stats
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # SP (członkowie), etf, spy_bear, DB
pm = pd.read_parquet(os.path.join(os.path.dirname(DB), 'panel_m.parquet'), columns=['seria', 'okres', 'c', 'ok', 'dv1', 'r1m', 'r3', 'r6', 'r12_1'])
pm['m'] = pd.to_datetime(pm.okres).dt.to_period('M')
pm = pm[(pm.m >= pd.Period('1996-01', 'M')) & (pm.m <= pd.Period('2026-10', 'M'))]
pm = pm.sort_values(['seria', 'm']); pm['sma10'] = pm.groupby('seria').c.transform(lambda s: s.rolling(10, min_periods=10).mean())
# 1000 najpłynniejszych (obroty 3 mies.), cena >= 5 USD (cena skorygowana jako przybliżenie), filtr płynności ok
pm['dv3'] = pm.groupby('seria').dv1.transform(lambda s: s.rolling(3, min_periods=1).mean())
el = pm[(pm.ok == 1) & (pm.c >= 5)]
top1000 = el[el.groupby('m').dv3.rank(ascending=False) <= 1000][['m', 'seria']]
ser = sorted(set(pm.seria[pm.seria.isin(set(top1000.seria)) | pm.seria.isin(set().union(*SP.values()))]))
pm = pm[pm.seria.isin(ser)]
ms = pd.period_range('1997-01', '2026-09', freq='M'); im = {m: i for i, m in enumerate(ms)}; isr = {s: j for j, s in enumerate(ser)}
NT, NS = len(ms), len(ser)
def mat(col):
    A = np.full((NT, NS), np.nan)
    x = pm[pm.m.isin(im)]
    A[x.m.map(im).values, x.seria.map(isr).values] = x[col].values
    return A
Cm, S10, R1, R3, R6, R121 = mat('c'), mat('sma10'), mat('r1m'), mat('r3'), mat('r6'), mat('r12_1')
U_SP = np.zeros((NT, NS), bool); U_L = np.zeros((NT, NS), bool)
for m, ss in SP.items():
    if m in im: U_SP[im[m], [isr[s] for s in ss if s in isr]] = True
t1 = top1000[top1000.m.isin(im)]; U_L[t1.m.map(im).values, t1.seria.map(isr).values] = True
BEAR = np.array([bool(spy_bear.get(m, False)) for m in ms])
print('macierze', Cm.shape, flush=True)
RANK = {'1M': R1, '3M': R3, '6M': R6, '12-1': R121}


def sim(U, rk, N, prog, rot, filtr, od, do, koszt):
    i0, i1 = im[pd.Period(od, 'M')], im[pd.Period(do, 'M')]
    poz, got, eq = {}, 1.0, [1.0]
    Rk = RANK[rk]
    for i in range(i0, i1):
        c = Cm[i]; ok = U[i] & np.isfinite(c) & np.isfinite(S10[i]) & (c > S10[i]) & np.isfinite(Rk[i])
        if prog: ok &= np.nan_to_num(R6[i], nan=-9) > 0.30
        kand = np.flatnonzero(ok); kand = kand[np.argsort(-Rk[i, kand])]
        top2 = set(kand[:2 * N]) if rot else None
        for j in list(poz):
            if not np.isfinite(c[j]) or (np.isfinite(S10[i, j]) and c[j] < S10[i, j]) or (rot and j not in top2):
                got += poz.pop(j) * (1 - koszt)
        if not (filtr and BEAR[i]) and len(poz) < N:
            wolne = N - len(poz); e = got + sum(poz.values())
            for j in kand:
                if wolne == 0: break
                if j in poz: continue
                k = min(e / N, got)
                if k <= 1e-9: break
                got -= k; poz[j] = k * (1 - koszt); wolne -= 1
        c1 = Cm[i + 1]
        for j in list(poz):
            if np.isfinite(c1[j]) and np.isfinite(c[j]) and c[j] > 0: poz[j] *= c1[j] / c[j]
            else: got += poz.pop(j) * (1 - koszt)
        eq.append(got + sum(poz.values()))
    eq = np.array(eq); r = eq[1:] / eq[:-1] - 1
    return dict(CAGR=eq[-1] ** (12 / (len(eq) - 1)) - 1, maxDD=(eq / np.maximum.accumulate(eq) - 1).min(), Sharpe=r.mean() / r.std() * np.sqrt(12) if r.std() > 0 else np.nan)


rows = []
for un, rk, N, prog, rot, filtr in itertools.product(['S&P 500', '1000 płynnych'], RANK, [1, 2, 3, 5, 10], [False, True], [False, True], [False, True]):
    U = U_SP if un == 'S&P 500' else U_L; ko = 0.001 if un == 'S&P 500' else 0.0025
    a = sim(U, rk, N, prog, rot, filtr, '1998-01', '2012-12', ko); b = sim(U, rk, N, prog, rot, filtr, '2013-01', '2026-09', ko)
    rows.append(dict(uniwersum=un, ranking=rk, N=N, prog_6M_30=prog, rotacja=rot, filtr_rynku=filtr,
                     CAGR_98_12=a['CAGR'], maxDD_98_12=a['maxDD'], CAGR_13_26=b['CAGR'], maxDD_13_26=b['maxDD'], Sharpe_13_26=b['Sharpe']))
    if len(rows) % 40 == 0: print(len(rows), flush=True)
W = pd.DataFrame(rows)
W.to_csv(os.path.join(HERE, 'wyniki', 'r28_wszystkie_warianty.csv'), index=False)
rho = stats.spearmanr(W.CAGR_98_12, W.CAGR_13_26)
top = W.sort_values('CAGR_98_12', ascending=False).head(10)
naj_test = W.sort_values('CAGR_13_26', ascending=False).head(10)
spyc = lambda od, do: (lambda s: (s.iloc[-1] / s.iloc[0]) ** (12 / (len(s) - 1)) - 1)(etf['SPY'][(etf['SPY'].index >= pd.Period(od, 'M')) & (etf['SPY'].index <= pd.Period(do, 'M'))])
out = ['# Etap 18: szukanie strategii 50-100 % rocznie (320 prostych wariantów miesięcznych)', '',
       f'SPY: 1998-2012 {spyc("1998-01","2012-12")*100:.1f} % rocznie, 2013-2026 {spyc("2013-01","2026-09")*100:.1f} % rocznie.', '',
       f'Wariantów z CAGR >= 50 %: 1998-2012: {(W.CAGR_98_12 >= 0.5).sum()}, 2013-2026: {(W.CAGR_13_26 >= 0.5).sum()}, w obu okresach: {((W.CAGR_98_12 >= 0.5) & (W.CAGR_13_26 >= 0.5)).sum()}.',
       f'Wariantów z CAGR >= 30 % w obu okresach: {((W.CAGR_98_12 >= 0.3) & (W.CAGR_13_26 >= 0.3)).sum()}. Korelacja rang CAGR między okresami: {rho[0]:.2f}.', '',
       'Rozkład CAGR (kwantyle 10 / 50 / 90 / max):', '',
       pd.DataFrame({'1998-2012': W.CAGR_98_12.quantile([.1, .5, .9, 1]).values, '2013-2026': W.CAGR_13_26.quantile([.1, .5, .9, 1]).values},
                    index=['10 %', 'mediana', '90 %', 'max']).round(3).to_markdown(), '',
       '## 10 najlepszych w okresie wyboru (1998-2012) i ich wynik w sprawdzianie (2013-2026)', '', top.round(3).to_markdown(index=False), '',
       '## 10 najlepszych w 2013-2026 (wybór po fakcie, tylko informacyjnie)', '', naj_test.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r28_szukanie.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
