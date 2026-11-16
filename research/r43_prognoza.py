"""Etap 25b: czy wartość z arkusza (g x EPS) przewiduje cenę za rok? (protokół etap 25b)."""
import os, numpy as np, pandas as pd, statsmodels.api as sm
from scipy import stats
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r42_arkusz.py')).read().split('\n\ndef sim_prog')[0])
out = ['# Etap 25b: wartość z arkusza (g x EPS) jako prognoza ceny za rok, S&P 500 z danymi SEC, 2011-2025', '']
for K in (3, 5):
    rek, ics = [], []
    for m in mies:
        if m.month not in (2, 5, 8, 11) or m + 12 > DO: continue
        i, i12 = im_[m], im_[m + 12]
        ok = np.flatnonzero(U[i] & np.isfinite(PEG[K][i]) & np.isfinite(Cv[i]) & np.isfinite(Cv[i12]))
        if len(ok) < 30: continue
        pr = 1 / PEG[K][i, ok] - 1; fa = Cv[i12, ok] / Cv[i, ok] - 1
        ics.append(stats.spearmanr(pr, fa)[0])
        rek += [(m, a, b) for a, b in zip(pr, fa)]
    R = pd.DataFrame(rek, columns=['m', 'prognoza', 'faktycznie'])
    R['decyl'] = R.groupby('m').prognoza.transform(lambda x: pd.qcut(x.rank(method='first'), 10, labels=False) + 1)
    D = R.groupby('decyl').agg(n=('prognoza', 'size'), prognoza_mediana=('prognoza', 'median'), faktycznie_mediana=('faktycznie', 'median'),
                               faktycznie_srednia=('faktycznie', 'mean'), cena_za_rok_ge_wartosc=('faktycznie', lambda x: np.nan))
    D['cena_za_rok_ge_wartosc'] = R.assign(t=R.faktycznie >= R.prognoza).groupby('decyl').t.mean()
    ic = np.array(ics); nw = sm.OLS(ic, np.ones(len(ic))).fit(cov_type='HAC', cov_kwds={'maxlags': 4})
    out += [f'## Wzrost średni z {K} lat', '',
            f'Obserwacji: {len(R)}, dat: {len(ic)}. Mediana prognozy: {R.prognoza.median()*100:+.0f} %, mediana faktycznej zmiany: '
            f'{R.faktycznie.median()*100:+.0f} %. Cena za rok >= wartość: {(R.faktycznie >= R.prognoza).mean()*100:.0f} % przypadków. '
            f'Mediana błędu (faktycznie - prognoza): {(R.faktycznie - R.prognoza).median()*100:+.0f} pp. '
            f'Średnie IC (korelacja rang) = {ic.mean():.3f}, t(NW) = {nw.tvalues[0]:.2f}.', '',
            'Decyle prognozy (1 = najniższa wartość / cena, 10 = najwyższa):', '', D.round(3).to_markdown(), '']
open(os.path.join(HERE, 'wyniki', 'r43_prognoza.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
