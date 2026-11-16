"""Etap 16: linie trendu w stylu Tori Trades na świecach miesięcznych (definicje i kryterium w protokole, etap 16).
Strona długa. U1 = top 10 S&P 500 po kapitalizacji (2010-2026), U2 = wszyscy członkowie S&P 500 (1998-2026).
"""
import os, warnings, itertools, duckdb, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # SP, C, etf, blok, DB ...
rng = np.random.default_rng(20261110); KOSZT = 0.001; TOL = 0.03; OKNO = 60
con = duckdb.connect(DB, read_only=True)
ser = sorted(set().union(*SP.values()))
M = con.execute("SELECT seria, okres, o, h, l, c FROM m WHERE seria IN (SELECT unnest(?::VARCHAR[])) ORDER BY seria, okres", [ser]).df()
M['m'] = pd.to_datetime(M.okres).dt.to_period('M')
spy = etf['SPY']

# top 10 po kapitalizacji (pit_cap2.npy), klasy akcji jednej spółki raz
A_ = pd.read_pickle('/home/user/eodhd-data/szeroki/A.pkl'); capm = np.load('/home/user/ndx/pit_cap2.npy'); cols = list(A_.columns)
KLASY = {'GOOG': 'GOOGL', 'BRK-A': 'BRK-B', 'FOX': 'FOXA', 'NWS': 'NWSA', 'UA': 'UAA', 'DISCK': 'DISCA', 'BF-A': 'BF-B'}
sp_kody = {m: {t for t in sp_m.get(m, set())} for m in sp_m}
TOP10 = {}
for i, mm in enumerate(A_.index):
    if mm < pd.Period('2010-01', 'M') or mm not in sp_kody: continue
    s = pd.Series(capm[i], index=cols).dropna()
    s = s[[k in sp_kody[mm] and k not in KLASY for k in s.index]].sort_values(ascending=False).head(10)
    TOP10[mm] = {best_map.get((mm, k)) for k in s.index} - {None}


def piv(x, typ):
    out = []
    for i in range(2, len(x) - 2):
        w = x[i - 2:i + 3]
        if np.isfinite(w).all() and ((typ == 'H' and x[i] == w.max()) or (typ == 'L' and x[i] == w.min())): out.append(i)
    return np.array(out, int)


def linia(idx_p, lp, lc, t, typ):
    """Najlepsza linia z danych do t-1: punkty potwierdzone (i <= t-3), >= 3 dotknięcia, brak zamknięcia po złej stronie do t-1."""
    P = idx_p[(idx_p <= t - 3) & (idx_p >= t - OKNO)]
    best = None
    for a, b in itertools.combinations(P, 2):
        nach = (lp[b] - lp[a]) / (b - a)
        if (typ == 'H' and nach > 0) or (typ == 'L' and nach < 0): continue
        val = lambda k: lp[a] + nach * (k - a)
        dot = [k for k in P if abs(lp[k] - val(k)) <= np.log(1 + TOL)]
        if len(dot) < 3 or max(dot) - min(dot) < 6: continue
        rng_ = np.arange(min(dot), t)
        if typ == 'H' and (lc[rng_] > np.array([val(k) for k in rng_]) + 1e-9).any(): continue
        if typ == 'L' and (lc[rng_] < np.array([val(k) for k in rng_]) - 1e-9).any(): continue
        key = (len(dot), max(dot))
        if best is None or key > best[0]: best = (key, a, nach, lp[a])
    if best is None: return None
    _, a, nach, la = best
    return lambda k: la + nach * (k - a)


tr = []
for s, g in M.groupby('seria', sort=False):
    g = g.reset_index(drop=True)
    if len(g) < 40: continue
    lo_, hi_, cl_, op_ = np.log(g.l.to_numpy(float)), np.log(g.h.to_numpy(float)), np.log(g.c.to_numpy(float)), np.log(g.o.to_numpy(float))
    PH, PL = piv(hi_, 'H'), piv(lo_, 'L'); ms = list(g.m)
    for t in range(30, len(g)):
        m = ms[t]
        u2 = m >= pd.Period('1998-01', 'M') and s in SP.get(m, set())
        if not u2: continue
        R = linia(PH, hi_, cl_, t, 'H')
        if R is None or not (cl_[t] > R(t) and cl_[t - 1] <= R(t - 1)): continue
        G = linia(PL, lo_, cl_, t, 'L')
        if G is None or not (G(t) < R(t)): continue
        wys = R(t) - G(t); u1 = s in TOP10.get(m, set())
        for retest in (True, False):
            e_i = None
            if not retest: e_i = t
            else:
                for k in range(t + 1, min(t + 4, len(g))):
                    if cl_[k] < G(k): break
                    if lo_[k] <= R(k) + np.log(1.03) and cl_[k] >= R(k) + np.log(0.97): e_i = k; break
            if e_i is None: continue
            ent = cl_[e_i]
            if G(e_i) >= ent: continue
            for wyj in ('A cel', 'B stop'):
                cel = cl_[t] + wys; x_i, x_p, pow_ = None, None, None
                for d in range(e_i + 1, min(e_i + 61, len(g))):
                    if lo_[d] < G(d):
                        x_i, x_p, pow_ = d, min(G(d), op_[d]), 'stop'; break
                    if wyj == 'A cel' and hi_[d] >= cel:
                        x_i, x_p, pow_ = d, max(cel, op_[d]) if op_[d] > cel else cel, 'cel'; break
                if x_i is None:
                    x_i = min(e_i + 60, len(g) - 1); x_p = cl_[x_i]; pow_ = 'czas/koniec'
                zw = np.exp(x_p - ent) * (1 - KOSZT) ** 2 - 1
                ryz = 1 - np.exp(G(e_i) - ent)
                m_e, m_x = ms[e_i], ms[x_i]
                spy_r = spy.get(m_x, np.nan) / spy.get(m_e, np.nan) - 1
                tr.append(dict(seria=s, przebicie=m, wejscie=m_e, wyjscie=m_x, retest=retest, wyjscie_typ=wyj, u1=u1, zwrot=zw, R=zw / ryz if ryz > 0 else np.nan,
                               mies=(m_x - m_e).n, powod=pow_, nadwyzka=zw - spy_r, wys_trojkata=np.exp(wys) - 1))
T = pd.DataFrame(tr)
print('transakcji', len(T), flush=True)


def ci(x, mies, q):
    x = np.asarray(x); gm = pd.Series(range(len(x))).groupby(np.asarray(mies)).indices; kl = list(gm.values())
    b = [x[np.concatenate([kl[i] for i in rng.integers(0, len(kl), len(kl))])].mean() for _ in range(2000)]
    return np.percentile(b, [q, 100 - q])


rows = []
for (uni, maska) in [('U2 wszyscy S&P 500 (1998-2026)', T.przebicie >= pd.Period('1998-01', 'M')), ('U1 top 10 po kapitalizacji (2010-2026)', T.u1)]:
    for rt in (True, False):
        for wj in ('A cel', 'B stop'):
            X = T[maska & (T.retest == rt) & (T.wyjscie_typ == wj)]
            if len(X) < 3:
                rows.append(dict(uniwersum=uni, retest=rt, wyjscie=wj, transakcji=len(X))); continue
            lo, hi = ci(X.nadwyzka.values, X.wejscie.astype(str).values, 0.625)
            rows.append(dict(uniwersum=uni, retest=rt, wyjscie=wj, transakcji=len(X), trafione=(X.zwrot > 0).mean(), sr_zwrot=X.zwrot.mean(),
                             mediana=X.zwrot.median(), sr_R=X.R.mean(), mediana_mies=X.mies.median(), sr_nadwyzka_vs_SPY=X.nadwyzka.mean(),
                             ci98_75=f'{lo*100:.1f}…{hi*100:.1f} %', stop=(X.powod == 'stop').mean(), cel=(X.powod == 'cel').mean()))
W = pd.DataFrame(rows)
przyk = T[T.u1 & T.retest & (T.wyjscie_typ == 'B stop')].sort_values('przebicie')[['seria', 'przebicie', 'wejscie', 'wyjscie', 'zwrot', 'nadwyzka', 'powod', 'wys_trojkata']]
out = ['# Etap 16: linie trendu (Tori Trades) na wykresach miesięcznych', '',
       'Definicje i kryterium w protokole (etap 16). nadwyżka = zwrot transakcji minus zwrot SPY w tym samym okresie; '
       'przedział 98,75 % (Bonferroni na 4 warianty) z bootstrapu po miesiącach wejścia.', '', W.round(3).to_markdown(index=False), '',
       '## Transakcje w top 10 (z retestem, wyjście: sam stop)', '', przyk.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r26_linie_trendu.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
