"""Etap 49: przeszłe przychody / EPS -> przyszły wzrost EPS 5 lat -> cena."""
import os, numpy as np, pandas as pd, statsmodels.api as sm
from scipy import stats
HERE = os.path.dirname(os.path.abspath(__file__))
D = pd.read_parquet('/home/user/ndx/panel_finviz.parquet'); D['mp'] = pd.PeriodIndex(D.m, freq='M')
fut = D[['seria', 'mp', 'EPS 5 lat (CAGR)', 'przychody 5 lat (CAGR)']].copy(); fut['mp'] = fut.mp - 60
fut = fut.rename(columns={'EPS 5 lat (CAGR)': 'EPS_przyszly_5l', 'przychody 5 lat (CAGR)': 'przychody_przyszle_5l'})
X = D.merge(fut, on=['seria', 'mp'], how='inner'); X = X[X.mp <= pd.Period('2021-09', 'M')]
print('obserwacji z przyszłym EPS 5 lat', X.EPS_przyszly_5l.notna().sum(), 'przychodami', X.przychody_przyszle_5l.notna().sum(), flush=True)
PRED = ['przychody 5 lat (CAGR)', 'przychody 3 lata (CAGR)', 'EPS 5 lat (CAGR)', 'EPS 3 lata (CAGR)', 'EPS TTM r/r', 'przychody (estymata ważona)', 'marża operacyjna',
        'ROE', 'quick ratio', 'dług / kapitał', 'P/E']
nw = lambda v: sm.OLS(np.asarray(v), np.ones(len(v))).fit(cov_type='HAC', cov_kwds={'maxlags': 60}).tvalues[0]
rows = []
for cel in ('EPS_przyszly_5l', 'przychody_przyszle_5l', 'e60'):
    for p in PRED:
        v = []
        for m, g in X.groupby('mp'):
            z = g[[p, cel]].dropna()
            if len(z) >= 40: v.append(stats.spearmanr(z[p], z[cel])[0])
        if len(v) < 12: continue
        rows.append(dict(cel=cel, predyktor=p, IC=np.mean(v), t=nw(v), miesiecy=len(v)))
T = pd.DataFrame(rows)
# kwintyle przychodów 5 lat -> mediana przyszłego EPS 5 lat i nadwyżki
Z = X[['mp', 'przychody 5 lat (CAGR)', 'EPS_przyszly_5l', 'przychody_przyszle_5l', 'e60']].dropna(subset=['przychody 5 lat (CAGR)'])
Z['q'] = Z.groupby('mp')['przychody 5 lat (CAGR)'].transform(lambda s: pd.qcut(s.rank(method='first'), 5, labels=False) + 1)
KW = Z.groupby('q').agg(przychody_5l_mediana=('przychody 5 lat (CAGR)', 'median'), EPS_przyszly_mediana=('EPS_przyszly_5l', 'median'),
                         przychody_przyszle_mediana=('przychody_przyszle_5l', 'median'), nadwyzka_ceny_5l_srednia=('e60', 'mean'), n=('e60', 'size'))
# EPS przyszły -> cena (w tych samych 5 latach) i rola P/E na starcie
v1, v2 = [], []
for m, g in X.groupby('mp'):
    z = g[['EPS_przyszly_5l', 'e60', 'P/E']].dropna()
    if len(z) < 40: continue
    v1.append(stats.spearmanr(z.EPS_przyszly_5l, z.e60)[0])
    r = z.rank(); res = sm.OLS(r.e60, sm.add_constant(r[['EPS_przyszly_5l', 'P/E']])).fit(); v2.append(res.params['P/E'] / r.e60.std() * r['P/E'].std())
txt = f'Korelacja rang przyszłego CAGR EPS 5 lat z nadwyżką ceny w tych samych 5 latach: {np.mean(v1):.3f} (t {nw(v1):.1f}). Przy tym samym przyszłym wzroście EPS wyższe P/E na starcie -> nadwyżka: beta rang {np.mean(v2):.3f} (t {nw(v2):.1f}).'
out = ['# Etap 49: przeszłe przychody -> przyszły EPS 5 lat -> cena (S&P 500 z danymi SEC, starty 2012-2021)', '',
       'IC = średnia korelacja rang (po miesiącach startu). EPS_przyszly_5l = CAGR EPS TTM w kolejnych 5 latach (znany w t + 60). e60 = nadwyżka ceny 5 lat.', '',
       T.round(3).to_markdown(index=False), '', '## Kwintyle wzrostu przychodów z 5 lat (K1 najwolniej, K5 najszybciej)', '', KW.round(3).to_markdown(), '', txt, '']
open(os.path.join(HERE, 'wyniki', 'r71_przychody_eps.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
