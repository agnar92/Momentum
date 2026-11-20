"""Etap 58: cechy jakości / poprawy wyników a przyszły wzrost fundamentów i ceny (36 / 60 mies.)."""
import os, warnings, numpy as np, pandas as pd, statsmodels.api as sm
from scipy import stats
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
D = pd.read_parquet('/home/user/ndx/panel_finviz.parquet'); D['mp'] = pd.PeriodIndex(D.m, freq='M')
D = D.sort_values(['seria', 'mp']).reset_index(drop=True)
gS = D.groupby('seria')
def sh(c, k):
    """Wartość tej samej spółki k mies. wcześniej (k > 0) lub później (k < 0), tylko przy ciągłości miesięcy."""
    return gS[c].shift(k).where(gS['mp'].shift(k) == D.mp - k)
rev, eps = 'przychody TTM r/r', 'EPS TTM r/r'
X = pd.DataFrame(index=D.index)
POZ = ['przychody 5 lat (CAGR)', 'przychody 3 lata (CAGR)', 'przychody TTM r/r', 'EPS 5 lat (CAGR)', 'EPS 3 lata (CAGR)', 'EPS TTM r/r', 'ROE', 'ROA',
       'ROIC (przybliżenie)', 'marża brutto', 'marża operacyjna', 'marża netto', 'FCF yield', 'P/E', 'PEG (EPS 5 lat)', 'P/S', 'dług / kapitał',
       'quick ratio', 'current ratio', 'log kapitalizacji', 'zwrot 12 mies.']
for c in POZ: X['poziom: ' + c] = D[c]
for c in ('ROE', 'ROIC (przybliżenie)', 'marża operacyjna', 'marża brutto', 'marża netto'): X['poprawa r/r: ' + c] = D[c] - sh(c, 12)
X['przyspieszenie: przychody r/r'] = D[rev] - sh(rev, 12); X['przyspieszenie: EPS r/r'] = D[eps] - sh(eps, 12)
L = {c: np.column_stack([sh(c, 12 * k) if k else D[c] for k in range(5)]) for c in (rev, eps, 'marża operacyjna', 'ROE', 'ROIC (przybliżenie)')}
mo = np.column_stack([D['marża operacyjna'] if k == 0 else sh('marża operacyjna', 12 * k) for k in range(6)])
def licz(A, war):
    ok = np.isfinite(A).all(1); return np.where(ok, war(A).sum(1), np.nan)
X['5 lat: lat z przychodami r/r > 0'] = licz(L[rev], lambda a: a > 0)
X['5 lat: lat z przychodami r/r > 10 %'] = licz(L[rev], lambda a: a > 0.10)
X['5 lat: lat z EPS r/r > 0'] = licz(L[eps], lambda a: a > 0)
X['5 lat: lat z rosnącą marżą oper.'] = np.where(np.isfinite(mo).all(1), (mo[:, :5] > mo[:, 1:]).sum(1), np.nan)
X['5 lat: lat z ROE > 15 %'] = licz(L['ROE'], lambda a: a > 0.15)
X['5 lat: lat z ROIC > 15 %'] = licz(L['ROIC (przybliżenie)'], lambda a: a > 0.15)
X['5 lat: zmienność wzrostu przychodów'] = np.where(np.isfinite(L[rev]).all(1), np.nanstd(L[rev], 1), np.nan)
# cele
Y = {'cena 36 mies.': D['e36'], 'cena 60 mies.': D['e60'],
     'przyszły CAGR przychodów 5 lat': sh('przychody 5 lat (CAGR)', -60), 'przyszły CAGR EPS 5 lat': sh('EPS 5 lat (CAGR)', -60)}
H = {'cena 36 mies.': 36, 'cena 60 mies.': 60, 'przyszły CAGR przychodów 5 lat': 60, 'przyszły CAGR EPS 5 lat': 60}
nw = lambda v, lag: sm.OLS(np.asarray(v), np.ones(len(v))).fit(cov_type='HAC', cov_kwds={'maxlags': lag})
start = (D.mp >= pd.Period('2012-01', 'M')) & (D.mp <= pd.Period('2021-09', 'M'))
pol = np.where(D.mp <= pd.Period('2016-12', 'M'), 1, 2)
def ic(xcol, y, maska):
    v = []; m_ = []
    T = pd.DataFrame({'x': xcol, 'y': y, 'mp': D.mp, 'pol': pol})[maska].dropna()
    for m, g in T.groupby('mp'):
        if len(g) >= 40: v.append(stats.spearmanr(g.x, g.y)[0]); m_.append(g.pol.iloc[0])
    return np.array(v), np.array(m_)
rows = []
for c in X.columns:
    r = {'cecha': c, 'pokrycie': round(float(X[c][start].notna().mean()), 2)}
    for yn, y in Y.items():
        v, p_ = ic(X[c], y, start)
        if len(v) < 24: continue
        r[f'IC {yn}'] = v.mean(); r[f't {yn}'] = nw(v, H[yn]).tvalues[0]
        r[f'IC1 {yn}'] = v[p_ == 1].mean(); r[f'IC2 {yn}'] = v[p_ == 2].mean()
    # kwintyle ceny 60 mies.
    T = pd.DataFrame({'x': X[c], 'y': D['e60'], 'mp': D.mp})[start].dropna(); q = []
    for m, g in T.groupby('mp'):
        if len(g) >= 50: q.append(g.groupby(pd.qcut(g.x.rank(method='first'), 5, labels=False)).y.mean().values)
    if q: Q = np.mean(q, 0); r['K1 60m'], r['K5 60m'] = Q[0], Q[4]
    rows.append(r); print(c, round(r.get('IC cena 60 mies.', np.nan), 3), flush=True)
R = pd.DataFrame(rows)
# wynik złożony: wybór w 1. połowie, sprawdzian w 2.
p1 = start & (pol == 1); p2 = start & (pol == 2)
wyb = []
for c in X.columns:
    v, _ = ic(X[c], D['e60'], p1)
    if len(v) >= 24:
        t = nw(v, 60).tvalues[0]
        if abs(t) > 2: wyb.append((c, np.sign(v.mean())))
rk = pd.DataFrame({c: X[c].groupby(D.mp).rank(pct=True) * s for c, s in wyb})
rk = rk.where(rk >= 0, 1 + rk)          # odwrócone dla znaku ujemnego
W = rk.mean(1, skipna=True).where(rk.notna().sum(1) >= max(3, len(wyb) // 2))
zl = {}
for nm, mk in (('1. połowa (w próbie)', p1), ('2. połowa (poza próbą)', p2)):
    for yn in Y:
        v, _ = ic(W, Y[yn], mk); zl[(nm, yn)] = (v.mean(), nw(v, H[yn]).tvalues[0]) if len(v) > 12 else (np.nan, np.nan)
    T = pd.DataFrame({'x': W, 'y': D['e60'], 'mp': D.mp})[mk].dropna(); q = []
    for m, g in T.groupby('mp'):
        if len(g) >= 50: q.append(g.groupby(pd.qcut(g.x.rank(method='first'), 5, labels=False)).y.mean().values)
    zl[(nm, 'kwintyle 60m')] = np.round(np.mean(q, 0), 3).tolist()
D['wynik_jakosci'] = W; D[['m', 'seria', 'wynik_jakosci']].to_parquet('/home/user/ndx/wynik_jakosci.parquet')
fm = lambda x: f'{x:+.3f}' if pd.notna(x) else ''
cols = ['cecha', 'pokrycie'] + [k for yn in Y for k in (f'IC {yn}', f't {yn}', f'IC1 {yn}', f'IC2 {yn}')] + ['K1 60m', 'K5 60m']
out = ['# Etap 58: cechy jakości i poprawy wyników a przyszły wzrost fundamentów i ceny', '',
       'IC = średnia miesięczna korelacja rang (starty 2012-01..2021-09), t Neweya-Westa, IC1 / IC2 = połowy 2012-16 / 2017-21; cena = nadwyżka nad średnią spółek; '
       'K1 / K5 = nadwyżka 60 mies. najgorszego / najlepszego kwintyla cechy. Istotne po Bonferronim: |t| > 3,2.', '',
       R[cols].sort_values('t cena 60 mies.', ascending=False).round(3).to_markdown(index=False), '',
       '## Wynik złożony (cechy wybrane w 1. połowie: |t| > 2 dla ceny 60 mies.)', '', 'Cechy: ' + ', '.join(f'{c} ({"+" if s > 0 else "−"})' for c, s in wyb), '',
       '\n'.join(f'- {a} / {b}: ' + (str(v) if b == 'kwintyle 60m' else f'IC {fm(v[0])}, t {v[1]:.1f}') for (a, b), v in zl.items()), '']
open(os.path.join(HERE, 'wyniki', 'r80_jakosc_wzrost.md'), 'w').write('\n'.join(out)); print('\n'.join(out[-6:]))
