"""Etap 19: ranking po wkładzie spółki we wzrost S&P 500 (waga x zwrot), zasady CEM10, 2010-2026 (protokół, etap 19)."""
import os, warnings, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
_src = open(os.path.join(HERE, 'r20_cem10_warianty.py')).read().split("mies = [m for m in C.index")[0]
exec(_src)                     # C, S10, SP, sim, R6m, blok, miary, etf, best_map, sp_m
rng = np.random.default_rng(20261115)
A_ = pd.read_pickle('/home/user/eodhd-data/szeroki/A.pkl'); capm = np.load('/home/user/ndx/pit_cap2.npy'); cols = list(A_.columns)
KLASY = {'GOOG', 'BRK-A', 'FOX', 'NWS', 'UA', 'DISCK', 'BF-A'}
CAP = {}                                                      # (miesiąc, seria) -> kapitalizacja
for i, mm in enumerate(A_.index):
    if mm < pd.Period('2008-01', 'M') or mm not in sp_m: continue
    for k, v in zip(cols, capm[i]):
        if np.isfinite(v) and k in sp_m[mm] and k not in KLASY:
            s = best_map.get((mm, k))
            if s: CAP[(mm, s)] = v
capS = pd.Series(CAP); capS.index = pd.MultiIndex.from_tuples(capS.index); CAPm = capS.unstack().reindex(index=C.index, columns=C.columns)
W_ = CAPm.div(CAPm.sum(axis=1), axis=0)                       # waga w indeksie (członkowie z kapitalizacją)
WK = {k: W_.shift(k) * (C / C.shift(k) - 1) for k in (1, 3, 6, 12)}
print('wagi', CAPm.notna().sum(axis=1).loc[pd.Period('2010-01', 'M'):].describe()[['min', 'mean']].round(0).to_dict(), flush=True)
mies = [m for m in C.index if pd.Period('2010-01', 'M') <= m <= pd.Period('2026-09', 'M')]
spf = lambda m: SP.get(m); bear_m = lambda m: bool(spy_bear.get(m, False))
sma_exit = lambda t, s, p: C.at[t, s] < S10.at[t, s]
krzywe = {}
for N_ in (5, 10):
    N = N_
    globals()['N'] = N_
    krzywe[('CEM10 (6M > 30 %, ranking 6M)', N_)] = sim(mies, spf, lambda t, s: C.at[t, s] > S10.at[t, s] and R6m.at[t, s] > 0.30, lambda t, s: R6m.at[t, s], sma_exit, bear_m, C)[0]
    for k in (1, 3, 6, 12):
        X = WK[k]
        krzywe[(f'wkład we wzrost indeksu, {k} mies.', N_)] = sim(mies, spf, lambda t, s, X=X: C.at[t, s] > S10.at[t, s] and X.at[t, s] > 0,
                                                                    lambda t, s, X=X: X.at[t, s], sma_exit, bear_m, C)[0]
    los = []
    for j in range(20):
        Rl = pd.DataFrame(rng.random(C.shape), index=C.index, columns=C.columns)
        los.append(sim(mies, spf, lambda t, s: C.at[t, s] > S10.at[t, s], lambda t, s, Rl=Rl: Rl.at[t, s], sma_exit, bear_m, C)[0])
    krzywe[('losowy wybór nad SMA 10 (mediana 20 prób)', N_)] = los
    print('N', N_, flush=True)
N = 10


def cagr(e, od=None, do=None):
    e = e[(e.index >= pd.Period(od, 'M')) if od else slice(None)]
    if do: e = e[e.index <= pd.Period(do, 'M')]
    return (e.iloc[-1] / e.iloc[0]) ** (12 / (len(e) - 1)) - 1


rows = []
for (nm, N_), e in krzywe.items():
    if isinstance(e, list):
        cs = [cagr(x) for x in e]; h1 = [cagr(x, None, '2017-12') for x in e]; h2 = [cagr(x, '2017-12') for x in e]
        rows.append(dict(wariant=nm, N=N_, CAGR=np.median(cs), CAGR_10_17=np.median(h1), CAGR_18_26=np.median(h2), maxDD=np.nan, roznica_vs_CEM10='', lepszy=False)); continue
    base = krzywe[('CEM10 (6M > 30 %, ranking 6M)', N_)]
    d = (e.pct_change() - base.pct_change()).dropna()
    lo, hi = blok(d) if d.abs().sum() > 0 else (0, 0)
    c1, c2 = cagr(e, None, '2017-12'), cagr(e, '2017-12')
    b1, b2 = cagr(base, None, '2017-12'), cagr(base, '2017-12')
    rows.append(dict(wariant=nm, N=N_, CAGR=cagr(e), CAGR_10_17=c1, CAGR_18_26=c2, maxDD=(e / e.cummax() - 1).min(),
                     roznica_vs_CEM10=f'{d.mean()*100:+.2f} pp/mies. ({lo*100:.2f}…{hi*100:.2f})', lepszy=(not nm.startswith('CEM10')) and c1 > b1 and c2 > b2 and lo > 0))
for t in ('SPY', 'QQQ'):
    s = etf[t][(etf[t].index >= pd.Period('2010-01', 'M')) & (etf[t].index <= pd.Period('2026-09', 'M'))]
    rows.append(dict(wariant=t, N='-', CAGR=cagr(s), CAGR_10_17=cagr(s, None, '2017-12'), CAGR_18_26=cagr(s, '2017-12'), maxDD=(s / s.cummax() - 1).min()))
T = pd.DataFrame(rows)
out = ['# Etap 19: spółki napędzające wzrost S&P 500 (waga x zwrot), zasady CEM10, 2010-2026', '', T.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r33_napedzajace.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
