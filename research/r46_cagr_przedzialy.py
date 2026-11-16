"""Etap 27b: czy przeszły CAGR EPS mówi, ile EPS urośnie w następnym roku / 3 latach (opisowe)."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r39_peg.py')).read().split('\ncols = {s: j')[0])   # TT


def lag(T, e0, lat):
    d = round(365.25 * lat)
    c = T[(T.index >= e0 + pd.Timedelta(days=d - 45)) & (T.index <= e0 + pd.Timedelta(days=d + 45))]
    return c.iloc[0] if len(c) else np.nan


rek = []
for k, T in TT.items():
    T = T.set_index('end').ttm
    if len(T) < 12: continue
    for e0, t0 in T.items():
        if e0 < pd.Timestamp('2012-01-01') or e0 > pd.Timestamp('2025-09-30') or t0 <= 0: continue
        f1, f3 = lag(T, e0, 1), lag(T, e0, 3)
        if not np.isfinite(f1): continue
        r = dict(fakt_1r=f1 / t0 - 1, fakt_cagr_3l=(f3 / t0) ** (1 / 3) - 1 if np.isfinite(f3) and f3 > 0 else np.nan)
        for nm, lat in (('CAGR 3 lata', 3), ('CAGR 5 lat', 5)):
            p = lag(T, e0, -lat)
            r[nm] = (t0 / p) ** (1 / lat) - 1 if np.isfinite(p) and p > 0 else np.nan
        poz = T[(T.index <= e0) & (T > 0)]
        lat = (e0 - poz.index[0]).days / 365.25
        r['CAGR od początku'] = (t0 / poz.iloc[0]) ** (1 / lat) - 1 if lat >= 3 else np.nan
        rek.append(r)
R = pd.DataFrame(rek); R = R[R.fakt_1r.abs() < 10]
B = [-np.inf, 0, .10, .20, .30, .50, np.inf]; LB = ['< 0 %', '0-10 %', '10-20 %', '20-30 %', '30-50 %', '> 50 %']
out = ['# Etap 27b: przeszły CAGR EPS a faktyczny wzrost EPS (spółki S&P z danymi SEC, 2012-2025)', '',
       'fakt_1r = faktyczna zmiana EPS TTM w kolejnym roku; fakt_CAGR_3l = faktyczny CAGR EPS w kolejnych 3 latach.', '']
for c in ('CAGR 3 lata', 'CAGR 5 lat', 'CAGR od początku'):
    X = R.dropna(subset=[c]).copy(); X['przedzial'] = pd.cut(X[c], B, labels=LB)
    T_ = X.groupby('przedzial').apply(lambda g: pd.Series(dict(
        n=len(g), przeszly_CAGR_mediana=g[c].median(), fakt_1r_mediana=g.fakt_1r.median(), fakt_1r_kw25=g.fakt_1r.quantile(.25),
        fakt_1r_kw75=g.fakt_1r.quantile(.75), fakt_1r_ge_CAGR=(g.fakt_1r >= g[c]).mean(), fakt_CAGR_3l_mediana=g.fakt_cagr_3l.median())))
    out += [f'## {c}', '', T_.round(3).to_markdown(), '']
open(os.path.join(HERE, 'wyniki', 'r46_cagr_przedzialy.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
