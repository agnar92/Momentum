"""Etap 71: własna prognoza wzrostu EPS 5 lat w PEG: trafność i zwroty 3 / 5 lat wg PEG."""
import os, pickle, numpy as np, pandas as pd
from scipy import stats
HERE = os.path.dirname(os.path.abspath(__file__)); SZ = '/home/user/ndx/szer'
Z = np.load(f'{SZ}/cache.npz', allow_pickle=True); Cv, U = Z['Cv'], Z['U'].astype(bool)
PE_, G5, REV5, GRW, G1, EPS0 = (Z[k] for k in ('PE_', 'G5', 'REV5', 'GRW', 'G1', 'EPS0'))
ms = [pd.Period(x, 'M') for x in Z['mies']]; im_ = {m: i for i, m in enumerate(ms)}; kod = np.array([str(s).split('.US')[0] for s in Z['seria']])
P_, S_, G0, _ = pickle.load(open(f'{SZ}/wzorce.pkl', 'rb'))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0]); spy = etf['SPY']
NT, NS = Cv.shape
FUT = np.full((NT, NS), np.nan); a, b = EPS0[:-60], EPS0[60:]
FUT[:-60] = np.where((a > 0) & (b > 0), (b / np.where(a > 0, a, 1)) ** 0.2 - 1, np.nan)
cl = lambda x: np.clip(x, -0.5, 1.0)
F = {'F1 historyczny EPS 5 l.': G5, 'F2 przychody 5 l.': REV5, 'F3 przychody ważone (4 kw.)': GRW, 'F4 średnia EPS i przychodów 5 l.': np.nanmean(np.stack([G5, REV5]), 0)}
# F5: regresja na startach 2012-2016
tr = np.zeros((NT, NS), bool)
for m in ms:
    if pd.Period('2012-01', 'M') <= m <= pd.Period('2016-12', 'M'): tr[im_[m]] = U[im_[m]]
X = np.stack([cl(G5), cl(REV5), cl(GRW), cl(G1)], -1)
ok = tr & np.isfinite(X).all(-1) & np.isfinite(FUT)
A = np.column_stack([np.ones(ok.sum()), X[ok]]); beta = np.linalg.lstsq(A, cl(FUT[ok]), rcond=None)[0]
F5 = beta[0] + (X * beta[1:]).sum(-1)
F['F5 model (dopasowany 2012-16)'] = F5
F['F* faktyczny przyszły EPS (nieosiągalne)'] = FUT
F = {k: np.clip(v, 0, 0.6) if not k.startswith('F*') else v for k, v in F.items()}
out = ['# Etap 71: własna prognoza wzrostu EPS 5 lat w PEG (top 500 USA, P/E bieżące)', '',
       f'Model F5: przyszły CAGR EPS 5 l. = {beta[0]:.3f} + {beta[1]:.3f}·EPS 5 l. + {beta[2]:.3f}·przychody 5 l. + {beta[3]:.3f}·przychody ważone + {beta[4]:.3f}·EPS r/r (dopasowany na {ok.sum()} obserwacjach 2012-2016)', '']
# (a) trafność
rows = []
for nm, Fk in F.items():
    if nm.startswith('F*'): continue
    for okr, a_, b_ in (('2012-2016', '2012-01', '2016-12'), ('2017-2021', '2017-01', '2021-09')):
        ic, mae = [], []
        for m in ms:
            if not (pd.Period(a_, 'M') <= m <= pd.Period(b_, 'M')): continue
            i = im_[m]; s = U[i] & np.isfinite(Fk[i]) & np.isfinite(FUT[i])
            if s.sum() < 50: continue
            ic.append(stats.spearmanr(Fk[i, s], FUT[i, s])[0]); mae.append(np.median(np.abs(Fk[i, s] - np.clip(FUT[i, s], -0.5, 1))))
        rows.append(dict(prognoza=nm, starty=okr, IC_z_faktycznym=np.mean(ic), mediana_bledu_pp=100 * np.mean(mae)))
out += ['## Trafność prognozy (vs faktyczny CAGR EPS 5 lat)', '', pd.DataFrame(rows).round(3).to_markdown(index=False), '']
# (b) zwroty wg PEG
def fwd(h):
    R = np.full((NT, NS), np.nan); R[:-h] = Cv[h:] / Cv[:-h] - 1; return R
FW = {h: fwd(h) for h in (36, 60)}
kosz = lambda p: 'PEG < 1' if 0 < p < 1 else 'PEG 1-2' if 1 <= p < 2 else 'PEG >= 2 lub brak'
rows = []
for nm, Fk in F.items():
    PEG = np.where((PE_ > 0) & (Fk > 0), PE_ / (100 * Fk), np.nan)
    for grp, M in (('STABILNY', S_), ('wszystkie', U)):
        for h in (36, 60):
            kon = pd.Period('2021-09' if h == 60 else '2023-09', 'M')
            for okr, a_, b_ in (('całość', pd.Period('2012-01', 'M'), kon), ('2012-2016', pd.Period('2012-01', 'M'), pd.Period('2016-12', 'M')), ('2017+', pd.Period('2017-01', 'M'), kon)):
                acc = {}
                for m in ms:
                    if not (a_ <= m <= b_): continue
                    i = im_[m]; uni = U[i] & np.isfinite(FW[h][i])
                    if uni.sum() < 100: continue
                    avg = FW[h][i, uni].mean(); sr = spy.get(m + h, np.nan) / spy.get(m, np.nan) - 1
                    for j in np.flatnonzero(M[i] & U[i] & np.isfinite(FW[h][i])):
                        acc.setdefault(kosz(PEG[i, j]), []).append((FW[h][i, j] - avg, FW[h][i, j] > sr, kod[j]))
                for k_, v in acc.items():
                    ex = np.array([x[0] for x in v])
                    rows.append(dict(prognoza=nm, grupa=grp, horyzont=f'{h} m', starty=okr, koszyk=k_, obs=len(v), spolek=len({x[2] for x in v}),
                                     nadwyzka_srednia=ex.mean(), nadwyzka_mediana=np.median(ex), bije_SPY=np.mean([x[1] for x in v])))
T = pd.DataFrame(rows)
out += ['## Zwrot 3 / 5 lat wg PEG (nadwyżka nad średnią spółek top 500)', '', T.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r96_peg_prognoza.md'), 'w').write('\n'.join(out)); print('\n'.join(out[:20]))
T.to_csv(os.path.join(HERE, 'wyniki', 'r96_peg_prognoza.csv'), index=False)
