"""Etap 43: trzymanie długoterminowe ze sprzedażą przy załamaniu fundamentów / przewartościowaniu (z cache r59)."""
import os, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # best_map, etf, blok
Z = np.load('/home/user/ndx/wskazniki_cache.npz', allow_pickle=True)
Cv, U, PE_, G1, RQ, ROE, DE, REV5 = (Z[k] for k in ('Cv', 'U', 'PE_', 'G1', 'RQ', 'ROE', 'DE', 'REV5'))
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = list(Z['seria']); im_ = {m: i for i, m in enumerate(ms)}; cols = {s: j for j, s in enumerate(ser)}
NT, NS = Cv.shape
A_ = pd.read_pickle('/home/user/eodhd-data/szeroki/A.pkl'); capm = np.load('/home/user/ndx/pit_cap2.npy'); acol = list(A_.columns)
CAP = np.full((NT, NS), np.nan)
for ia, mm in enumerate(A_.index):
    if mm not in im_ or mm < pd.Period('2015-01', 'M'): continue
    for k, v in zip(acol, capm[ia]):
        if np.isfinite(v):
            s_ = best_map.get((mm, k))
            if s_ in cols: CAP[im_[mm], cols[s_]] = v if not np.isfinite(CAP[im_[mm], cols[s_]]) else max(v, CAP[im_[mm], cols[s_]])
lag = lambda X, k: np.vstack([np.full((k, NS), np.nan), X[:-k]])
MPE5 = pd.DataFrame(np.where(PE_ > 0, PE_, np.nan)).rolling(60, min_periods=36).median().to_numpy()
MEPS = np.nanmedian(np.stack([lag(G1, 12 * k) if k else G1 for k in range(5)]), axis=0)      # mediana 5 rocznych zmian EPS TTM r/r
MREV = np.nanmedian(np.stack([lag(RQ, 12 * k) if k else RQ for k in range(5)]), axis=0)      # mediana 5 rocznych zmian przychodów (kwartał r/r)
NEPS = np.sum(np.stack([np.isfinite(lag(G1, 12 * k) if k else G1) for k in range(5)]), axis=0)
PEGm = np.where((PE_ > 0) & (MEPS > 0), PE_ / (100 * MEPS), np.inf)
PEGb = np.where((PE_ > 0) & (G1 > 0), PE_ / (100 * G1), np.inf)
f = lambda X: np.nan_to_num(X, nan=0).astype(bool)
X5 = f(G1 < 0); X6 = f(DE > 1); X7 = f((RQ < 0) & (MREV > 0)); X2 = f(PE_ > 2 * MPE5)
SYG = {'X1 P/E > 1,5 x mediana 5 lat': f(PE_ > 1.5 * MPE5), 'X2 P/E > 2 x mediana 5 lat': X2,
       'X3 PEG (mediana wzrostu EPS 5 lat) > 2': f((PEGm > 2) & (NEPS >= 3) & np.isfinite(PE_)), 'X4 PEG (bieżący wzrost EPS) > 2': f((PEGb > 2) & (G1 > 0)),
       'X5 EPS TTM r/r < 0': X5, 'X6 dług / kapitał > 1': X6, 'X7 przychody r/r < 0 wbrew normie': X7,
       'X8 załamanie (X5 lub X6 lub X7)': X5 | X6 | X7, 'X9 załamanie lub P/E > 2 x mediana': X5 | X6 | X7 | X2}
KOSZT = 0.001; OD = pd.Period('2015-03', 'M'); DO = pd.Period('2026-09', 'M'); POL2 = pd.Period('2020-12', 'M')
mies2 = [m for m in ms if OD <= m <= DO]
OK = f(CAP > 10e9) & f(DE < 1) & f(ROE > 0.15) & np.isfinite(REV5)
KONTROLA = {2, 5, 8, 11}


def strat(S, potw=False, roczna=False, nigdy=False, N=10):
    poz, got, eq, czasy, nsell, licz = {}, 1.0, [], [], 0, {}
    for a, m in enumerate(mies2[:-1]):
        i = im_[m]; i1 = im_[mies2[a + 1]]
        if roczna and m.month == 3:
            ok = np.flatnonzero(U[i] & OK[i] & np.isfinite(Cv[i])); ok = ok[np.argsort(-REV5[i, ok])][:N]; cel = set(ok)
            for j in list(poz):
                if j not in cel: got += poz.pop(j)['v'] * (1 - KOSZT); nsell += 1
        if not roczna and not nigdy and S is not None and m.month in KONTROLA:
            for j in list(poz):
                hit = S[i, j]
                licz[j] = licz.get(j, 0) + 1 if hit else 0
                if (licz[j] >= 2) if potw else hit:
                    p = poz.pop(j); got += p['v'] * (1 - KOSZT); czasy.append((m - p['od']).n); nsell += 1
        if (m == mies2[0]) or (m.month in KONTROLA | {3} and len(poz) < N and not (nigdy and m != mies2[0])) or (roczna and m.month == 3):
            ok = np.flatnonzero(U[i] & OK[i] & np.isfinite(Cv[i])); ok = ok[np.argsort(-REV5[i, ok])]
            e = got + sum(p['v'] for p in poz.values())
            for j in ok:
                if len(poz) >= N: break
                if j in poz or (S is not None and not roczna and S[i, j]): continue
                kw = min(e / N, got)
                if kw <= 1e-9: break
                got -= kw; poz[j] = {'v': kw * (1 - KOSZT), 'od': m}
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j]['v'] *= Cv[i1, j] / Cv[i, j]
            else: p = poz.pop(j); got += p['v'] * (1 - KOSZT); czasy.append((m - p['od']).n)
        eq.append((mies2[a + 1], got + sum(p['v'] for p in poz.values()), sum(p['v'] for p in poz.values())))
    czasy += [(mies2[-1] - p['od']).n for p in poz.values()]
    return pd.Series({m: v for m, v, _ in eq}), np.mean([x / v for _, v, x in eq]), np.median(czasy) / 12 if czasy else np.nan, nsell


def cg2(e, od=None, do=None):
    e = pd.concat([pd.Series({OD: 1.0}), e])
    if od: e = e[e.index >= od]
    if do: e = e[e.index <= do]
    return (e.iloc[-1] / e.iloc[0]) ** (12 / (len(e) - 1)) - 1


def miary(e):
    r_ = e.pct_change().dropna(); dd_ = (e / e.cummax() - 1).min(); c = cg2(e)
    return dict(CAGR=c, CAGR_2015_20=cg2(e, None, POL2), CAGR_2021_26=cg2(e, POL2), maxDD=dd_, Sharpe=r_.mean() / r_.std() * np.sqrt(12), Calmar=c / abs(dd_), z_10k=round(10000 * e.iloc[-1]))


rows = []
for nm, kw in [('kupno i trzymanie bez sprzedaży', dict(S=None, nigdy=True)), ('coroczna wymiana na nową dziesiątkę (etap 38b)', dict(S=None, roczna=True))] + \
              [(k, dict(S=v)) for k, v in SYG.items()] + [('X10 EPS TTM r/r < 0 w 2 kolejnych kontrolach', dict(S=X5, potw=True))]:
    e, inw, czas, ns = strat(**kw)
    rows.append(dict(sprzedaz=nm, **miary(e), sr_zainwestowane=inw, mediana_lat_trzymania=czas, sprzedazy=ns))
    print(nm, round(miary(e)['CAGR'], 3), flush=True)
T = pd.DataFrame(rows)
ewL_v, eq = 1.0, []
for a, m in enumerate(mies2[:-1]):
    i, i1 = im_[m], im_[mies2[a + 1]]
    ok = U[i] & f(CAP[i] > 10e9) & np.isfinite(Cv[i]) & np.isfinite(Cv[i1])
    ewL_v *= 1 + np.mean(Cv[i1, ok] / Cv[i, ok] - 1); eq.append((mies2[a + 1], ewL_v))
ewL = pd.Series(dict(eq)); sp_ = etf['SPY'][(etf['SPY'].index >= OD) & (etf['SPY'].index <= DO)]; spy = (sp_ / sp_.iloc[0])[1:]
ref = pd.DataFrame([dict(odniesienie=n, **miary(x)) for n, x in (('równe wagi spółek > 10 mld', ewL), ('SPY', spy))])
out = ['# Etap 43: trzymanie długoterminowe, sprzedaż przy załamaniu fundamentów lub przewartościowaniu (2015-03 ... 2026-09)', '',
       'Wybór: > 10 mld, dług < 1, ROE > 15 %, ranking po CAGR przychodów 5 lat, maks. 10 pozycji; kontrola co kwartał (luty, maj, sierpień, listopad); wolne miejsca uzupełniane.', '',
       '## Odniesienia', '', ref.round(3).to_markdown(index=False), '', '## Reguły sprzedaży', '', T.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r64_dlugoterminowo.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
