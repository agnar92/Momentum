"""Etap 42: ROE jako warunek trzymania / sygnał sprzedaży (z cache r59)."""
import os, json, datetime as dt, numpy as np, pandas as pd, statsmodels.api as sm
from scipy import stats
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # best_map, rng, B (bootstrap)
Z = np.load('/home/user/ndx/wskazniki_cache.npz', allow_pickle=True)
Cv, U, EPS0, PE_, G1, GRW, RQ, MPE, ROE, DE, FCF, S10 = (Z[k] for k in ('Cv', 'U', 'EPS0', 'PE_', 'G1', 'GRW', 'RQ', 'MPE', 'ROE', 'DE', 'FCF', 'S10'))
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = list(Z['seria']); im_ = {m: i for i, m in enumerate(ms)}; cols = {s: j for j, s in enumerate(ser)}
NT, NS = Cv.shape
dd = lambda s: dt.date.fromisoformat(s)
r25 = open(os.path.join(HERE, 'r25_cem10_eps.py')).read(); exec(r25[r25.index('def kwartaly'):r25.index('\n\n\ncechy = {}')])
r39 = open(os.path.join(HERE, 'r39_peg.py')).read(); exec(r39[r39.index('def ttm_serie'):r39.index('\n\n\nTT = {k:')])

lag = lambda X, k: np.vstack([np.full((k, NS), np.nan), X[:-k]])
fwd = lambda k: np.vstack([Cv[k:] / Cv[:-k] - 1, np.full((k, NS), np.nan)])
F12 = fwd(12); MIN6 = np.full((NT, NS), np.nan)
for i in range(NT - 6): MIN6[i] = np.nanmin(Cv[i + 1:i + 7], axis=0) / Cv[i] - 1
R6 = Cv / lag(Cv, 6) - 1
X = np.where(U, F12, np.nan); E12 = F12 - np.nanmean(X, axis=1, keepdims=True)
MI = [m for m in ms if pd.Period('2012-01', 'M') <= m <= pd.Period('2025-09', 'M')]; IDX = np.array([im_[m] for m in MI])
R12 = lag(ROE, 12)
SYG = {'R1 ROE < 10 %': ROE < 0.10, 'R2 przejście poniżej 10 % (rok temu >= 10 %)': (ROE < 0.10) & (R12 >= 0.10),
       'R3 ROE niższe r/r o > 1 pp': (ROE - R12) < -0.01, 'R4 warunek trzymania niespełniony (R1 lub R3)': (ROE < 0.10) | ((ROE - R12) < -0.01),
       'R5 ROE niższe r/r o > 1 pp i < 15 %': ((ROE - R12) < -0.01) & (ROE < 0.15)}
DOST = np.isfinite(ROE) & np.isfinite(R12)
LIDER = (R6 > 0.30) & (Cv > S10)
rows = []
for grupa, G in (('wszyscy', np.ones((NT, NS), bool)), ('liderzy (6M > 30 %, nad SMA 10)', LIDER)):
    for nm, S in SYG.items():
        A = np.zeros((NT, NS), bool); A[IDX] = True
        baza = A & U & G & DOST & np.isfinite(E12)
        on, off = baza & S, baza & ~S
        dm = np.array([np.nanmean(E12[i][on[i]]) - np.nanmean(E12[i][off[i]]) for i in IDX if on[i].sum() >= 3 and off[i].sum() >= 3])
        lo, hi = blok(dm)
        nw = sm.OLS(dm, np.ones(len(dm))).fit(cov_type='HAC', cov_kwds={'maxlags': 12})
        rows.append(dict(grupa=grupa, sygnal=nm, n_sygnal=int(on.sum()), odsetek=on.sum() / baza.sum(), nadwyzka_12m_przy=np.nanmean(E12[on]), nadwyzka_12m_bez=np.nanmean(E12[off]),
                         roznica_12m=dm.mean(), ci95=f'{lo*100:.1f}…{hi*100:.1f} pp', t_NW=nw.tvalues[0], P_spadek25_6m_przy=np.nanmean(MIN6[on] <= -0.25), P_spadek25_6m_bez=np.nanmean(MIN6[off] <= -0.25),
                         P_strata12m_przy=np.mean(F12[on] < 0), P_strata12m_bez=np.mean(F12[off] < 0)))
T = pd.DataFrame(rows)
# (b) reguła wyjścia w strategii
A_ = pd.read_pickle('/home/user/eodhd-data/szeroki/A.pkl'); capm = np.load('/home/user/ndx/pit_cap2.npy'); acol = list(A_.columns)
CAP = np.full((NT, NS), np.nan)
for ia, mm in enumerate(A_.index):
    if mm not in im_ or mm < pd.Period('2015-01', 'M'): continue
    for k, v in zip(acol, capm[ia]):
        if np.isfinite(v):
            s_ = best_map.get((mm, k))
            if s_ in cols: CAP[im_[mm], cols[s_]] = v if not np.isfinite(CAP[im_[mm], cols[s_]]) else max(v, CAP[im_[mm], cols[s_]])
REV5 = Z['REV5']; KOSZT = 0.001; OD = pd.Period('2015-03', 'M'); DO = pd.Period('2026-09', 'M'); POL2 = pd.Period('2020-12', 'M')
mies2 = [m for m in ms if OD <= m <= DO]
OK = (np.nan_to_num(CAP, nan=0) > 10e9) & (np.nan_to_num(DE, nan=9) < 1) & (np.nan_to_num(ROE, nan=-9) > 0.15)


def strat(wyj, N=10):
    poz, got, eq = {}, 1.0, []
    for a, m in enumerate(mies2[:-1]):
        i = im_[m]; i1 = im_[mies2[a + 1]]
        if m.month == 3:
            ok = np.flatnonzero(U[i] & OK[i] & np.isfinite(REV5[i]) & np.isfinite(Cv[i])); ok = ok[np.argsort(-REV5[i, ok])][:N]; cel = set(ok)
            for j in list(poz):
                if j not in cel: got += poz.pop(j) * (1 - KOSZT)
            e = got + sum(poz.values())
            for j in ok:
                if j in poz: continue
                if wyj is not None and wyj(i, j): continue          # nie kupuj spółki z aktywnym sygnałem wyjścia
                kw = min(e / N, got)
                if kw <= 1e-9: break
                got -= kw; poz[j] = kw * (1 - KOSZT)
        elif wyj is not None:
            for j in list(poz):
                if wyj(i, j): got += poz.pop(j) * (1 - KOSZT)
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: got += poz.pop(j) * (1 - KOSZT)
        eq.append((mies2[a + 1], got + sum(poz.values()), sum(poz.values())))
    return pd.Series({m: v for m, v, _ in eq}), np.mean([x / v for _, v, x in eq])


def cg2(e, od=None, do=None):
    e = pd.concat([pd.Series({OD: 1.0}), e])
    if od: e = e[e.index >= od]
    if do: e = e[e.index <= do]
    return (e.iloc[-1] / e.iloc[0]) ** (12 / (len(e) - 1)) - 1


sig = lambda S: (lambda i, j: bool(S[i, j]))
WYJ = {'brak (trzymaj do marca)': None, 'R1 ROE < 10 %': sig(SYG['R1 ROE < 10 %']), 'R3 ROE niższe r/r o > 1 pp': sig(SYG['R3 ROE niższe r/r o > 1 pp']),
       'R4 ROE < 10 % lub niższe r/r': sig(SYG['R4 warunek trzymania niespełniony (R1 lub R3)']), 'R5 ROE niższe r/r i < 15 %': sig(SYG['R5 ROE niższe r/r o > 1 pp i < 15 %']),
       'zamknięcie pod SMA 10': sig(Cv < S10), 'R4 lub pod SMA 10': sig(SYG['R4 warunek trzymania niespełniony (R1 lub R3)'] | (Cv < S10))}
rs = []
for nm, w in WYJ.items():
    e, inw = strat(w); r_ = e.pct_change().dropna(); dd_ = (e / e.cummax() - 1).min(); c = cg2(e)
    rs.append(dict(wyjscie=nm, CAGR=c, CAGR_2015_20=cg2(e, None, POL2), CAGR_2021_26=cg2(e, POL2), maxDD=dd_, Sharpe=r_.mean() / r_.std() * np.sqrt(12), Calmar=c / abs(dd_),
                   sr_zainwestowane=inw, z_10k=round(10000 * e.iloc[-1])))
S_ = pd.DataFrame(rs)
out = ['# Etap 42: ROE jako warunek trzymania / sygnał sprzedaży', '', '## (a) Sygnały ROE a dalszy zwrot (S&P 500 z danymi SEC, 2012-2025)', '', T.round(3).to_markdown(index=False), '',
       '## (b) Reguła wyjścia w strategii (> 10 mld, dług < 1, ROE > 15 %, top 10 po przychodach 5 lat, marzec), 2015-03 ... 2026-09', '',
       'Sprzedane miejsce czeka w gotówce do marca.', '', S_.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r63_roe_wyjscie.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
