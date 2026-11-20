"""Etap 44: CEM10 z filtrem dług / kapitał (z cache r59)."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # etf, blok
Z = np.load('/home/user/ndx/wskazniki_cache.npz', allow_pickle=True)
Cv, U, DE, S10, BEAR = (Z[k] for k in ('Cv', 'U', 'DE', 'S10', 'BEAR'))
ms = [pd.Period(x, 'M') for x in Z['mies']]; im_ = {m: i for i, m in enumerate(ms)}; NT, NS = Cv.shape
lag = lambda X, k: np.vstack([np.full((k, NS), np.nan), X[:-k]])
R6 = Cv / lag(Cv, 6) - 1; KOSZT = 0.001


def cem(wej, wyj_dlug=False, od='2011-01', do='2026-09', N=10):
    mm = [m for m in ms if pd.Period(od, 'M') <= m <= pd.Period(do, 'M')]
    poz, got, eq = {}, 1.0, []
    for a, m in enumerate(mm[:-1]):
        i = im_[m]; i1 = im_[mm[a + 1]]; c = Cv[i]
        for j in list(poz):
            if not np.isfinite(c[j]) or c[j] < S10[i, j] or (wyj_dlug and np.isfinite(DE[i, j]) and DE[i, j] > 1): got += poz.pop(j) * (1 - KOSZT)
        if not BEAR[i]:
            ok = U[i] & np.isfinite(c) & (c > S10[i]) & (np.nan_to_num(R6[i], nan=-9) > 0.30) & wej[i]
            kand = np.flatnonzero(ok); kand = kand[np.argsort(-R6[i, kand])]; e = got + sum(poz.values())
            for j in kand:
                if len(poz) >= N: break
                if j in poz: continue
                kw = min(e / N, got)
                if kw <= 1e-9: break
                got -= kw; poz[j] = kw * (1 - KOSZT)
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(c[j]): poz[j] *= Cv[i1, j] / c[j]
            else: got += poz.pop(j) * (1 - KOSZT)
        eq.append((mm[a + 1], got + sum(poz.values())))
    return pd.Series(dict(eq))


def cg(e, od=None, do=None):
    e = e[(e.index >= pd.Period(od, 'M')) if od else slice(None)]
    if do: e = e[e.index <= pd.Period(do, 'M')]
    return (e.iloc[-1] / e.iloc[0]) ** (12 / (len(e) - 1)) - 1


def miary(e, od):
    e = e / e.iloc[0]; r_ = e.pct_change().dropna(); dd_ = (e / e.cummax() - 1).min(); c = cg(e)
    return dict(CAGR=c, maxDD=dd_, Sharpe=r_.mean() / r_.std() * np.sqrt(12), Calmar=c / abs(dd_), z_10k=round(10000 * e.iloc[-1]))


WSZ = np.ones((NT, NS), bool)
WAR = {'CEM10 bez filtra': (WSZ, False), 'dług / kapitał < 1': (np.nan_to_num(DE, nan=9) < 1, False), 'dług / kapitał < 0,5': (np.nan_to_num(DE, nan=9) < 0.5, False),
       'dług / kapitał < 0,5 lub brak danych': (np.nan_to_num(DE, nan=0) < 0.5, False), 'dług < 0,5 przy zakupie + wyjście przy dług > 1': (np.nan_to_num(DE, nan=9) < 0.5, True)}
rows = []
for od, pol in (('2011-01', '2018-12'), ('2015-03', '2020-12')):
    base = cem(WSZ, od=od)
    for nm, (w, wd) in WAR.items():
        e = base if nm == 'CEM10 bez filtra' else cem(w, wd, od=od)
        d = (e.pct_change() - base.pct_change()).dropna(); lo, hi = blok(d.values) if d.abs().sum() > 0 else (0, 0)
        rows.append(dict(okres=f'{od[:4]}-2026', wariant=nm, **miary(e, od), CAGR_pierwsza=cg(e, None, pol), CAGR_druga=cg(e, pol),
                         roznica_vs_CEM10=f'{d.mean()*100:+.2f} ({lo*100:.2f}…{hi*100:.2f})'))
    print(od, flush=True)
T = pd.DataFrame(rows)
ref = []
for od in ('2011-01', '2015-03'):
    s = etf['SPY'][(etf['SPY'].index >= pd.Period(od, 'M')) & (etf['SPY'].index <= pd.Period('2026-09', 'M'))]
    ref.append(dict(okres=f'{od[:4]}-2026', odniesienie='SPY', **miary(s, od)))
out = ['# Etap 44: CEM10 z filtrem dług / kapitał (S&P 500 z danymi SEC)', '', 'Połowy: 2011-2018 / 2019-2026 albo 2015-2020 / 2021-2026.', '',
       pd.DataFrame(ref).round(3).to_markdown(index=False), '', T.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r65_cem10_dlug.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
