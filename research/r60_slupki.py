"""Etap 39: przychody rosną co roku >= 10 % przez 5 lat, > 10 mld, ROE, dług, PEG < 2; miary ryzyka (z cache r59)."""
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
import json, datetime as dt
dd = lambda s: dt.date.fromisoformat(s)
def kwartaly(rows):
    """[start, end, val, filed, form, ...] -> {end: (eps, filed)}; Q4 = rok - Q1..Q3 (jak fund_build.py)."""
    bq, bf = {}, {}
    for r in rows:
        s, e, v, f = r[:4]; ti = r[5] if len(r) > 5 else 0; n = (dd(e) - dd(s)).days
        if 80 <= n <= 100:
            if e not in bq or (ti, f) < bq[e][0]: bq[e] = ((ti, f), (s, v, f))
        elif 350 <= n <= 380:
            if e not in bf or (ti, f) < bf[e][0]: bf[e] = ((ti, f), (s, v, f))
    q = {e: v for e, (k, v) in bq.items()}; out = {e: (v, f) for e, (s, v, f) in q.items()}
    for e, (k, (s, v, f)) in bf.items():
        parts = [vv for ee, (ss, vv, ff) in q.items() if dd(ss) >= dd(s) - dt.timedelta(days=6) and dd(ee) < dd(e) - dt.timedelta(days=60)]
        if len(parts) == 3 and e not in out: out[e] = (v - sum(parts), f)
    return out


def ttm_serie(g):
    """dla każdego kwartału: TTM z 4 kolejnych (odstępy 75-110 dni), data znajomości = max(filed)."""
    g = g.reset_index(drop=True); out = []
    for i in range(3, len(g)):
        z = g.iloc[i - 3:i + 1]
        if all(75 <= (z.end.iloc[j + 1] - z.end.iloc[j]).days <= 110 for j in range(3)):
            out.append((g.end[i], z.eps.sum(), z.filed.max()))
    return pd.DataFrame(out, columns=['end', 'ttm', 'zn'])


SECQ = '/home/user/ndx/sec_q'; SLUPKI = np.zeros((NT, NS), bool); S2 = np.zeros((NT, NS), bool); S3 = np.zeros((NT, NS), bool)
MARZ = [m for m in ms if m.month == 3 and pd.Period('2015-03', 'M') <= m <= pd.Period('2026-09', 'M')]
for fn in os.listdir(SECQ):
    d = json.load(open(os.path.join(SECQ, fn)))
    if not d or 'rev' not in d: continue
    q = kwartaly(d['rev']['rows'])
    if len(q) < 24: continue
    g = pd.DataFrame([(pd.Timestamp(e), v, pd.Timestamp(f)) for e, (v, f) in q.items()], columns=['end', 'eps', 'filed']).sort_values('end')
    T = ttm_serie(g)
    if T.empty: continue
    T = T.set_index('end'); k = fn[:-5].replace('.', '-')
    for m in MARZ:
        s_ = best_map.get((m, k))
        if s_ not in cols: continue
        t = m.to_timestamp(how='end'); z = T[T.zn <= t]
        if z.empty or (t - z.index[-1]).days > 250: continue
        e0 = z.index[-1]; L = []
        for r in range(6):
            c = z[(z.index <= e0 - pd.Timedelta(days=round(365.25 * r) - 45)) & (z.index >= e0 - pd.Timedelta(days=round(365.25 * r) + 45))]
            L.append(c.ttm.iloc[-1] if len(c) else np.nan)
        L = np.array(L)
        if np.isfinite(L).all() and (L > 0).all():
            zm = L[:-1] / L[1:]
            SLUPKI[im_[m], cols[s_]] = (zm >= 1.10).all()
            S2[im_[m], cols[s_]] = (zm >= 1.10).sum() >= 4 and L[0] / L[5] > 1.5
            S3[im_[m], cols[s_]] = (zm > 1.0).all() and L[0] / L[5] > 1.5
print('spółek ze słupkami w marcu (suma po latach)', SLUPKI.sum(), flush=True)
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
rows = []
LACZNIE = REV5 > 1.5 ** 0.2 - 1
for warunek, WR in (('co roku >= +10 % (słupki)', SLUPKI), ('>= +10 % w 4 z 5 lat i łącznie > +50 %', S2), ('bez spadku w żadnym roku i łącznie > +50 %', S3), ('łącznie > +50 % (etap 38b)', LACZNIE)):
    BAZA = WR & (np.nan_to_num(ROE, nan=-9) > 0.15) & (np.nan_to_num(DE, nan=9) < 1) & LARGE
    PA, PB = peg(GRW), peg(G5)
    WAR = {'bez PEG, ranking po przychodach 5 l.': (BAZA, REV5, False),
           'PEG < 2 (estymata użytkownika), ranking po przychodach': (BAZA & (np.nan_to_num(PA, nan=9) < 2), REV5, False),
           'PEG < 2 (estymata użytkownika), ranking po najniższym PEG': (BAZA & (np.nan_to_num(PA, nan=9) < 2), PA, True),
           'PEG < 2 (przeszły CAGR EPS 5 l.), ranking po przychodach': (BAZA & (np.nan_to_num(PB, nan=9) < 2), REV5, False)}
    for nm, (OK, RK, ros) in WAR.items():
        e, inw, ile = roczna(OK, RK, ros)
        r_ = e.pct_change().dropna(); dd_ = (e / e.cummax() - 1).min(); c = cg2(e)
        d = (e.pct_change() - ewL.pct_change()).dropna(); lo, hi = blok(d.values)
        rows.append(dict(przychody=warunek, wariant=nm, kandydatow_w_marcu=f'{min(ile)}-{max(ile)}', CAGR=c, CAGR_2015_20=cg2(e, None, POL2), CAGR_2021_26=cg2(e, POL2),
                         maxDD=dd_, Sharpe=r_.mean() / r_.std() * np.sqrt(12), Calmar=c / abs(dd_), sr_zainwestowane=inw, z_10k=round(10000 * e.iloc[-1]),
                         roznica_vs_rowne_10mld=f'{d.mean()*100:+.2f} ({lo*100:.2f}…{hi*100:.2f})'))
T = pd.DataFrame(rows)
ref = pd.DataFrame([dict(odniesienie=n, CAGR=cg2(x), CAGR_2015_20=cg2(x, None, POL2), CAGR_2021_26=cg2(x, POL2), maxDD=(x / x.cummax() - 1).min(), Sharpe=x.pct_change().mean() / x.pct_change().std() * np.sqrt(12), Calmar=cg2(x) / abs((x / x.cummax() - 1).min())) for n, x in
                    (('równe wagi uniwersum', ew), ('równe wagi spółek > 10 mld', ewL), ('SPY', spy))])
i = im_[pd.Period('2026-03', 'M')]; P = peg(GRW)
OK = S3 & (np.nan_to_num(ROE, nan=-9) > 0.15) & (np.nan_to_num(DE, nan=9) < 1) & LARGE
ok = np.flatnonzero(U[i] & OK[i] & np.isfinite(REV5[i])); ok = ok[np.argsort(-REV5[i, ok])][:15]
ost = pd.DataFrame({'seria': [ser[j] for j in ok], 'kap_mld': CAP[i, ok] / 1e9, 'przychody_5l_%': 100 * ((1 + REV5[i, ok]) ** 5 - 1), 'ROE_%': 100 * ROE[i, ok],
                    'dlug_kapital': DE[i, ok], 'P/E': PE_[i, ok], 'g_estymata_%': 100 * GRW[i, ok], 'PEG_Lynch': P[i, ok]})
out = ['# Etap 39: przychody rosną co roku >= 10 % przez 5 lat, ROE > 15 %, dług < 1, > 10 mld, PEG < 2 jako opcja; 10 spółek co rok (2015-03 ... 2026-09)', '',
       '## Odniesienia', '', ref.round(3).to_markdown(index=False), '', '## Warianty', '', T.round(3).to_markdown(index=False), '',
       '## Lista (bez spadku w żadnym roku i łącznie > +50 %, > 10 mld, bez filtra PEG; PEG dla informacji) na koniec marca 2026', '', ost.round(2).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r60_slupki.md'), 'w').write('\n'.join(out)); print('\n'.join(out))
