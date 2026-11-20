"""Etap 46: przegląd czynnikowy usprawnień screenera (na bazie etapu 45).
Etap 45: screener 'low risk, high reward' (zrzut użytkownika) z regułą sprzedaży 2 z 3 (z cache r59 + przychody TTM z SEC)."""
import os, json, datetime as dt, numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # best_map, etf, blok
Z = np.load('/home/user/ndx/wskazniki_cache.npz', allow_pickle=True)
Cv, U, PE_, G1, ROE, DE, G5, FCF = (Z[k] for k in ('Cv', 'U', 'PE_', 'G1', 'ROE', 'DE', 'G5', 'FCF'))
ms = [pd.Period(x, 'M') for x in Z['mies']]; ser = list(Z['seria']); im_ = {m: i for i, m in enumerate(ms)}; cols = {s: j for j, s in enumerate(ser)}
NT, NS = Cv.shape
dd = lambda s: dt.date.fromisoformat(s)
r25 = open(os.path.join(HERE, 'r25_cem10_eps.py')).read(); exec(r25[r25.index('def kwartaly'):r25.index('\n\n\ncechy = {}')])
r39 = open(os.path.join(HERE, 'r39_peg.py')).read(); exec(r39[r39.index('def ttm_serie'):r39.index('\n\n\nTT = {k:')])
# przychody TTM: zmiana r/r i łączna 5 lat, znane na koniec miesiąca
RV1 = np.full((NT, NS), np.nan); RV5 = np.full((NT, NS), np.nan)
M0 = [m for m in ms if pd.Period('2014-06', 'M') <= m <= pd.Period('2026-09', 'M')]
for fn in os.listdir('/home/user/ndx/sec_q'):
    d = json.load(open(os.path.join('/home/user/ndx/sec_q', fn)))
    if not d or 'rev' not in d: continue
    q = kwartaly(d['rev']['rows'])
    if len(q) < 8: continue
    g = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end')
    T = ttm_serie(g)
    if T.empty: continue
    T = T.set_index('end'); k = fn[:-5].replace('.', '-')
    for m in M0:
        s_ = best_map.get((m, k))
        if s_ not in cols: continue
        t = m.to_timestamp(how='end'); z = T[T.zn <= t]
        if z.empty or (t - z.index[-1]).days > 250: continue
        e0, a = z.index[-1], z.ttm.iloc[-1]
        for lat, X in ((1, RV1), (5, RV5)):
            c = z[(z.index <= e0 - pd.Timedelta(days=round(365.25 * lat) - 45)) & (z.index >= e0 - pd.Timedelta(days=round(365.25 * lat) + 45))]
            if len(c) and c.ttm.iloc[-1] > 0 and a > 0: X[im_[m], cols[s_]] = a / c.ttm.iloc[-1] - 1
print('przychody', np.isfinite(RV1).sum(), np.isfinite(RV5).sum(), flush=True)
# sektory
g = pd.read_csv('/home/user/eodhd-data/gics.csv'); gics = dict(zip(g.Symbol.str.replace('.', '-'), g['GICS Sector']))
sic = json.load(open('/home/user/ndx/sic.json'))
WYKL = {'Financials', 'Materials', 'Energy', 'Utilities', 'Real Estate'}
def wykluczony(k):
    if k in gics: return gics[k] in WYKL
    s = sic.get(k)
    if not s: return False
    s = int(s)
    return (6000 <= s <= 6799 or 1000 <= s <= 1499 or 2900 <= s <= 2999 or 4900 <= s <= 4949 or 4960 <= s <= 4999 or 2600 <= s <= 2699
            or 2800 <= s <= 2829 or 2840 <= s <= 2899 or 3300 <= s <= 3399 or 2400 <= s <= 2499 or 3200 <= s <= 3299)
SEKT = np.array([not wykluczony(s.split('.US')[0].split('~')[0]) for s in ser])
print('spółek po wykluczeniu sektorów', SEKT.sum(), 'z', NS, flush=True)
f = lambda X: np.nan_to_num(X, nan=0).astype(bool)
PEG = np.where((PE_ > 0) & (G5 > 0), PE_ / (100 * G5), np.inf)
KUP = f(RV5 > 0.5) & f(RV1 > 0.05) & f(G1 > 0.05) & f(ROE > 0.15) & f(DE >= 0) & f(DE < 1) & f(FCF > 0) & (PEG > 0) & (PEG < 1) & np.isfinite(PE_)

S10, BEAR = Z['S10'], Z['BEAR']
A_ = pd.read_pickle('/home/user/eodhd-data/szeroki/A.pkl'); capm = np.load('/home/user/ndx/pit_cap2.npy'); acol = list(A_.columns)
CAP = np.full((NT, NS), np.nan)
for ia, mm in enumerate(A_.index):
    if mm not in im_ or mm < pd.Period('2015-01', 'M'): continue
    for k, v in zip(acol, capm[ia]):
        if np.isfinite(v):
            s_ = best_map.get((mm, k))
            if s_ in cols: CAP[im_[mm], cols[s_]] = v if not np.isfinite(CAP[im_[mm], cols[s_]]) else max(v, CAP[im_[mm], cols[s_]])
REV5c = np.where(np.isfinite(RV5), (1 + RV5) ** 0.2 - 1, np.nan)
BAZA = f(RV5 > 0.5) & f(RV1 > 0.05) & f(G1 > 0.05) & f(ROE > 0.15) & f(DE >= 0) & f(DE < 1) & f(FCF > 0) & (PEG > 0) & np.isfinite(PE_) & SEKT[None, :]
SPRZ = (PEG > 3) | f(RV5 < 0.5) | f(DE > 1)
KOSZT = 0.001


def strat(KUPm, RK, N, rynek, od, do):
    mm = [m for m in ms if pd.Period(od, 'M') <= m <= pd.Period(do, 'M')]
    poz, got, eq = {}, 1.0, []
    for a, m in enumerate(mm[:-1]):
        i = im_[m]; i1 = im_[mm[a + 1]]
        for j in list(poz):
            if SPRZ[i, j]: got += poz.pop(j) * (1 - KOSZT)
        if not (rynek and BEAR[i]):
            ok = np.flatnonzero(U[i] & KUPm[i] & np.isfinite(Cv[i]) & np.isfinite(RK[i])); ok = ok[np.argsort(RK[i, ok])]
            e = got + sum(poz.values())
            for j in ok:
                if len(poz) >= N: break
                if j in poz: continue
                kw = min(e / N, got)
                if kw <= 1e-9: break
                got -= kw; poz[j] = kw * (1 - KOSZT)
        for j in list(poz):
            if np.isfinite(Cv[i1, j]) and np.isfinite(Cv[i, j]): poz[j] *= Cv[i1, j] / Cv[i, j]
            else: got += poz.pop(j) * (1 - KOSZT)
        eq.append(got + sum(poz.values()))
    e = pd.Series([1.0] + eq); r_ = e.pct_change().dropna(); c = e.iloc[-1] ** (12 / (len(e) - 1)) - 1; dd_ = (e / e.cummax() - 1).min()
    return dict(CAGR=c, maxDD=dd_, Calmar=c / abs(dd_) if dd_ < 0 else np.nan, Sharpe=r_.mean() / r_.std() * np.sqrt(12) if r_.std() > 0 else np.nan)


import itertools
OKR = {'wybor': ('2015-03', '2020-12'), 'sprawdzian': ('2021-01', '2026-09')}
rows = []
for rk, prog, trend, duze, rynek, N in itertools.product(('PEG', 'przychody'), (1.0, 1.5, 2.0), (False, True), (False, True), (False, True), (5, 10)):
    K = BAZA & (PEG < prog)
    if trend: K = K & f(Cv > S10)
    if duze: K = K & f(CAP > 10e9)
    RK = PEG if rk == 'PEG' else -REV5c
    r = dict(ranking=rk, prog_PEG=prog, trend_SMA10=trend, kap_10mld=duze, filtr_rynku=rynek, N=N)
    for o, (od, do) in OKR.items():
        for k, v in strat(K, RK, N, rynek, od, do).items(): r[f'{k}_{o}'] = v
    rows.append(r)
    if len(rows) % 12 == 0: print(len(rows), flush=True)
W = pd.DataFrame(rows)
from scipy import stats
rho = stats.spearmanr(W.Calmar_wybor, W.Calmar_sprawdzian)[0]; rhoc = stats.spearmanr(W.CAGR_wybor, W.CAGR_sprawdzian)[0]
top = W.sort_values('Calmar_wybor', ascending=False).head(5)
ef = []
for c, a, b in (('ranking', 'przychody', 'PEG'), ('trend_SMA10', True, False), ('kap_10mld', True, False), ('filtr_rynku', True, False), ('N', 5, 10), ('prog_PEG', 2.0, 1.0)):
    d = {}
    for o in OKR:
        for mtr in ('CAGR', 'maxDD', 'Calmar'):
            d[f'{mtr}_{o}'] = W[W[c] == a][f'{mtr}_{o}'].mean() - W[W[c] == b][f'{mtr}_{o}'].mean()
    ef.append(dict(czynnik=f'{c}: {a} zamiast {b}', **d))
EF = pd.DataFrame(ef)
spy = etf['SPY']; sc = lambda od, do: (lambda s: (s.iloc[-1] / s.iloc[0]) ** (12 / (len(s) - 1)) - 1)(spy[(spy.index >= pd.Period(od, 'M')) & (spy.index <= pd.Period(do, 'M'))])
out = ['# Etap 46: przegląd czynnikowy usprawnień screenera (wybór 2015-2020, sprawdzian 2021-2026)', '',
       f'SPY: 2015-2020 {sc("2015-03","2020-12")*100:.1f} %, 2021-2026 {sc("2021-01","2026-09")*100:.1f} % rocznie. Wariantów: {len(W)}. Korelacja rang między okresami: Calmar {rho:.2f}, CAGR {rhoc:.2f}.', '',
       '## Średni efekt czynników (różnica średnich po wariantach)', '', EF.round(3).to_markdown(index=False), '',
       '## 5 najlepszych wg Calmar w okresie wyboru i ich wynik w sprawdzianie', '', top.round(3).to_markdown(index=False), '',
       '## 10 najlepszych w sprawdzianie (po fakcie, tylko informacyjnie)', '', W.sort_values('Calmar_sprawdzian', ascending=False).head(10).round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r67_usprawnienia.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
W.to_csv(os.path.join(HERE, 'wyniki', 'r67_wszystkie_warianty.csv'), index=False)
