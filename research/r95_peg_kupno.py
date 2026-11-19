"""Etap 70: kupno przy PEG < 2 i trzymanie 1 / 3 / 5 lat: MSFT, NVDA, spółki z wzorców i wszystkie (top 500 USA)."""
import os, pickle, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); SZ = '/home/user/ndx/szer'
Z = np.load(f'{SZ}/cache.npz', allow_pickle=True); Cv, U = Z['Cv'], Z['U'].astype(bool); PE_, G5 = Z['PE_'], Z['G5']
ms = [pd.Period(x, 'M') for x in Z['mies']]; im_ = {m: i for i, m in enumerate(ms)}; kod = [str(s).split('.US')[0] for s in Z['seria']]
P_, S_, G0, _ = pickle.load(open(f'{SZ}/wzorce.pkl', 'rb'))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0]); spy = etf['SPY']
PEG = np.where((PE_ > 0) & (G5 > 0), PE_ / (100 * G5), np.nan)
def fwd(h):
    F = np.full(Cv.shape, np.nan); F[:-h] = Cv[h:] / Cv[:-h] - 1; return F
F = {h: fwd(h) for h in (12, 36, 60)}
SPF = {h: {m: spy.get(m + h, np.nan) / spy.get(m, np.nan) - 1 for m in ms} for h in (12, 36, 60)}
kosz = lambda p: 'PEG < 1' if 0 < p < 1 else 'PEG 1-2' if 1 <= p < 2 else 'PEG >= 2 lub brak'
out = ['# Etap 70: kupno przy PEG < 2 (PEG = P/E ÷ wzrost EPS 5 lat), zwrot 1 / 3 / 5 lat; top 500 USA', '']
# (a) MSFT, NVDA
for t in ('MSFT', 'NVDA'):
    jj = [j for j, k in enumerate(kod) if k == t]
    rows = []
    for m in ms:
        if not (pd.Period('2012-01', 'M') <= m <= pd.Period('2025-09', 'M')): continue
        i = im_[m]; j = next((j for j in jj if np.isfinite(Cv[i, j])), None)
        if j is None: continue
        r = dict(miesiac=str(m), PEG=PEG[i, j], P_E=PE_[i, j], wzrost_EPS_5l=G5[i, j], koszyk=kosz(PEG[i, j]))
        for h in (12, 36, 60): r[f'zwrot_{h}m'] = F[h][i, j]; r[f'nadwyzka_SPY_{h}m'] = F[h][i, j] - SPF[h][m]
        rows.append(r)
    R = pd.DataFrame(rows)
    T = R.groupby('koszyk').agg(miesiecy=('miesiac', 'size'), **{f'zwrot_{h}m': (f'zwrot_{h}m', 'mean') for h in (12, 36, 60)},
                                **{f'nad_SPY_{h}m': (f'nadwyzka_SPY_{h}m', 'mean') for h in (12, 36, 60)})
    okresy = []
    for k_, g in R.groupby((R.koszyk != R.koszyk.shift()).cumsum()):
        okresy.append(f'{g.miesiac.iloc[0]}..{g.miesiac.iloc[-1]} {g.koszyk.iloc[0]}')
    out += [f'## {t}', '', T.round(3).to_markdown(), '', 'Okresy: ' + '; '.join(okresy), '',
            'Co rok (styczeń): ' + ', '.join(f'{r.miesiac[:4]} PEG {r.PEG:.2f}' if np.isfinite(r.PEG) else f'{r.miesiac[:4]} PEG -' for r in R[R.miesiac.str.endswith('-01')].itertuples()), '']
# (b) przekrój
rows = []
for nm, M in (('STABILNY (typ Microsoft)', S_), ('PARABOLA (typ NVIDIA)', P_), ('wszystkie spółki top 500', U)):
    for h in (12, 36, 60):
        koniec = pd.Period('2021-09' if h == 60 else '2023-09' if h == 36 else '2025-09', 'M')
        for okr, a_, b_ in (('całość', pd.Period('2012-01', 'M'), koniec), ('2012-2016', pd.Period('2012-01', 'M'), pd.Period('2016-12', 'M')), ('2017+', pd.Period('2017-01', 'M'), koniec)):
            acc = {}
            for m in ms:
                if not (a_ <= m <= b_): continue
                i = im_[m]; uni = U[i] & np.isfinite(F[h][i])
                if uni.sum() < 100: continue
                avg = F[h][i, uni].mean()
                for j in np.flatnonzero(M[i] & U[i] & np.isfinite(F[h][i])):
                    acc.setdefault(kosz(PEG[i, j]), []).append((F[h][i, j], F[h][i, j] - avg, F[h][i, j] > SPF[h][m]))
            for k_, v in acc.items():
                v = np.array(v)
                rows.append(dict(grupa=nm, horyzont=f'{h} mies.', starty=okr, koszyk=k_, obserwacji=len(v), sredni_zwrot=v[:, 0].mean(), mediana_zwrotu=np.median(v[:, 0]),
                                 nadwyzka_vs_srednia_spolek=v[:, 1].mean(), mediana_nadwyzki=np.median(v[:, 1]), bije_SPY=v[:, 2].mean()))
T = pd.DataFrame(rows).sort_values(['grupa', 'horyzont', 'starty', 'koszyk'])
out += ['## Przekrój: zwrot naprzód wg PEG w chwili zakupu', '', T.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r95_peg_kupno.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
