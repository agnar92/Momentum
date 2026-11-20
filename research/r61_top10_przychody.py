"""Etap 40: po prostu top 10 po CAGR przychodów 5 lat (z cache r59)."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # best_map, sp_m, SP, etf, blok
Z = np.load('/home/user/ndx/wskazniki_cache.npz', allow_pickle=True)
Cv, U, EPS0, PE_, GRW, ROE, DE, G5, REV5, GF = (Z[k] for k in ('Cv', 'U', 'EPS0', 'PE_', 'GRW', 'ROE', 'DE', 'G5', 'REV5', 'GF'))
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = list(Z['seria']); im_ = {m: i for i, m in enumerate(ms)}; cols = {s: j for j, s in enumerate(ser)}
NT, NS = Cv.shape
A_ = pd.read_pickle('/home/user/eodhd-data/szeroki/A.pkl'); capm = np.load('/home/user/ndx/pit_cap2.npy'); acol = list(A_.columns)
CAP = np.full((NT, NS), np.nan)
for ia, mm in enumerate(A_.index):
    if mm not in im_ or mm < pd.Period('2014-01', 'M'): continue
    row = capm[ia]
    for k, v in zip(acol, row):
        if np.isfinite(v):
            s = best_map.get((mm, k))
            if s in cols: CAP[im_[mm], cols[s]] = np.nanmax([v, CAP[im_[mm], cols[s]]]) if np.isfinite(CAP[im_[mm], cols[s]]) else v
print('kapitalizacje', np.isfinite(CAP).sum(), flush=True)
KOSZT = 0.001; OD = pd.Period('2015-03', 'M'); DO = pd.Period('2026-09', 'M'); POL2 = pd.Period('2020-12', 'M')
mies2 = [m for m in ms if OD <= m <= DO]
rng_ = np.random.default_rng(20261116); Zc = rng_.standard_normal((NT, NS))   # ten sam strumień losowy co r59
GW = {'A estymata użytkownika (przychody ważone)': GRW, 'B przeszły CAGR EPS 5 lat': G5, 'C jak analityk (nierealne)': GF + 0.05 + 0.10 * Zc}
peg = lambda G: np.where((EPS0 > 0) & (G > 0), PE_ / (100 * G), np.nan)


def roczna(OK, RK, rosnaco, N=10):
    poz, got, eq, ile = {}, 1.0, [], []
    for a, m in enumerate(mies2[:-1]):
        i = im_[m]; i1 = im_[mies2[a + 1]]
        if m.month == 3:
            ok = np.flatnonzero(U[i] & OK[i] & np.isfinite(RK[i]) & np.isfinite(Cv[i])); ile.append(len(ok))
            ok = ok[np.argsort(RK[i, ok] if rosnaco else -RK[i, ok])]; cel = set(ok[:N])
            for j in list(poz):
                if j not in cel: got += poz.pop(j) * (1 - KOSZT)
            e = got + sum(poz.values())
            for j in ok[:N]:
                if j in poz: continue
                kw = min(e / N, got)
                if kw <= 1e-9: break
                got -= kw; poz[j] = kw * (1 - KOSZT)
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: got += poz.pop(j) * (1 - KOSZT)
        eq.append((mies2[a + 1], got + sum(poz.values()), sum(poz.values())))
    return pd.Series({m: v for m, v, _ in eq}), np.mean([x / v for _, v, x in eq]), ile


def rowne(maska=None):
    v, eq = 1.0, []
    for a, m in enumerate(mies2[:-1]):
        i, i1 = im_[m], im_[mies2[a + 1]]
        ok = U[i] & np.isfinite(Cv[i]) & np.isfinite(Cv[i1]) & np.isfinite(PE_).any(axis=0)
        if maska is not None: ok &= maska[i]
        v *= 1 + np.mean(Cv[i1, ok] / Cv[i, ok] - 1); eq.append((mies2[a + 1], v))
    return pd.Series(dict(eq))


def cg2(e, od=None, do=None):
    e = pd.concat([pd.Series({OD: 1.0}), e])
    if od: e = e[e.index >= od]
    if do: e = e[e.index <= do]
    return (e.iloc[-1] / e.iloc[0]) ** (12 / (len(e) - 1)) - 1


LARGE = np.nan_to_num(CAP, nan=0) > 10e9
ew = rowne(); ewL = rowne(LARGE)
sp_ = etf['SPY'][(etf['SPY'].index >= OD) & (etf['SPY'].index <= DO)]; spy = (sp_ / sp_.iloc[0])[1:]


def topN(OK, RK, miesiace, N=10):
    poz, got, eq = {}, 1.0, []
    for a, m in enumerate(mies2[:-1]):
        i = im_[m]; i1 = im_[mies2[a + 1]]
        if m.month in miesiace:
            ok = np.flatnonzero(U[i] & OK[i] & np.isfinite(RK[i]) & np.isfinite(Cv[i])); ok = ok[np.argsort(-RK[i, ok])][:N]; cel = set(ok)
            for j in list(poz):
                if j not in cel: got += poz.pop(j) * (1 - KOSZT)
            e = got + sum(poz.values())
            for j in ok:
                if j in poz: continue
                kw = min(e / N, got)
                if kw <= 1e-9: break
                got -= kw; poz[j] = kw * (1 - KOSZT)
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: got += poz.pop(j) * (1 - KOSZT)
        eq.append((mies2[a + 1], got + sum(poz.values())))
    return pd.Series(dict(eq))


LARGE = np.nan_to_num(CAP, nan=0) > 10e9
LOWD = np.nan_to_num(DE, nan=9) < 1; ROEOK = np.nan_to_num(ROE, nan=-9) > 0.15
ew = rowne(); ewL = rowne(LARGE)
sp_ = etf['SPY'][(etf['SPY'].index >= OD) & (etf['SPY'].index <= DO)]; spy = (sp_ / sp_.iloc[0])[1:]
FIL = {'(a) bez filtrów': np.ones_like(LARGE), '(b) > 10 mld': LARGE, '(c) > 10 mld + dług < 1': LARGE & LOWD, '(d) > 10 mld + dług < 1 + ROE > 15 %': LARGE & LOWD & ROEOK}
rows = []
def miary(e):
    r_ = e.pct_change().dropna(); dd_ = (e / e.cummax() - 1).min(); c = cg2(e)
    return dict(CAGR=c, CAGR_2015_20=cg2(e, None, POL2), CAGR_2021_26=cg2(e, POL2), maxDD=dd_, Sharpe=r_.mean() / r_.std() * np.sqrt(12), Calmar=c / abs(dd_), z_10k=round(10000 * e.iloc[-1]))
for fn_, OK in FIL.items():
    for cz, mm in (('raz w roku (marzec)', {3}), ('co miesiąc', set(range(1, 13)))):
        e = topN(OK, REV5, mm)
        d = (e.pct_change() - ewL.pct_change()).dropna(); lo, hi = blok(d.values)
        rows.append(dict(filtry=fn_, przebudowa=cz, **miary(e), roznica_vs_rowne_10mld=f'{d.mean()*100:+.2f} ({lo*100:.2f}…{hi*100:.2f})'))
T = pd.DataFrame(rows)
ref = pd.DataFrame([dict(odniesienie=n, **miary(x)) for n, x in (('równe wagi uniwersum', ew), ('równe wagi spółek > 10 mld', ewL), ('SPY', spy))])
i = im_[pd.Period('2026-09', 'M')]
ok = np.flatnonzero(U[i] & LARGE[i] & np.isfinite(REV5[i])); ok = ok[np.argsort(-REV5[i, ok])][:15]
ost = pd.DataFrame({'seria': [ser[j] for j in ok], 'kap_mld': CAP[i, ok] / 1e9, 'przychody_CAGR5_%': 100 * REV5[i, ok], 'przychody_5l_lacznie_%': 100 * ((1 + REV5[i, ok]) ** 5 - 1),
                    'dlug_kapital': DE[i, ok], 'ROE_%': 100 * ROE[i, ok]})
out = ['# Etap 40: po prostu top 10 po wzroście przychodów z 5 lat (S&P 500 z danymi SEC, 2015-03 ... 2026-09)', '', '## Odniesienia', '', ref.round(3).to_markdown(index=False), '',
       '## Warianty', '', T.round(3).to_markdown(index=False), '', '## Top 15 (> 10 mld) na koniec września 2026', '', ost.round(2).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r61_top10_przychody.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
