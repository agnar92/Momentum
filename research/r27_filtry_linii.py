"""Etap 17 (filtry, procedura w protokole) na bazie etapu 16: linie trendu w stylu Tori Trades na świecach miesięcznych (definicje i kryterium w protokole, etap 16).
Strona długa. U1 = top 10 S&P 500 po kapitalizacji (2010-2026), U2 = wszyscy członkowie S&P 500 (1998-2026).
"""
import os, warnings, itertools, duckdb, numpy as np, pandas as pd
warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'r19_cem10.py')).read().split('warianty = {')[0])   # SP, C, etf, blok, DB ...
rng = np.random.default_rng(20261110); KOSZT = 0.001; TOL = 0.03; OKNO = 60
con = duckdb.connect(DB, read_only=True)
ser = sorted(set().union(*SP.values()))
M = con.execute("SELECT seria, okres, o, h, l, c, vol, dv FROM m WHERE seria IN (SELECT unnest(?::VARCHAR[])) ORDER BY seria, okres", [ser]).df()
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
        if best is None or key > best[0]: best = (key, a, nach, lp[a], min(dot))
    if best is None: return None
    _, a, nach, la, pierwszy = best
    return (lambda k: la + nach * (k - a)), pierwszy


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
        RR = linia(PH, hi_, cl_, t, 'H')
        if RR is None: continue
        R, r_first = RR
        if not (cl_[t] > R(t) and cl_[t - 1] <= R(t - 1)): continue
        GG = linia(PL, lo_, cl_, t, 'L')
        if GG is None: continue
        G, _ = GG
        if not (G(t) < R(t)): continue
        cc = np.exp(cl_); vv = g.vol.to_numpy(float); dvv = g.dv.to_numpy(float)
        rr = np.diff(cl_[max(t - 12, 0):t + 1])
        cech = dict(r6=cc[t] / cc[t - 6] - 1, r12=cc[t] / cc[t - 12] - 1, sma10=cc[t - 9:t + 1].mean(), max12=cc[t - 11:t + 1].max(),
                    zm12=rr.std(), vol_x=vv[t] / np.nanmean(vv[t - 12:t]) if np.nanmean(vv[t - 12:t]) > 0 else np.nan,
                    dv3=np.nanmean(dvv[t - 2:t + 1]), dl_linii=t - r_first, c=cc[t])
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
            for wyj in ('B stop',):
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
                               mies=(m_x - m_e).n, powod=pow_, nadwyzka=zw - spy_r, wys_trojkata=np.exp(wys) - 1, **cech))
T = pd.DataFrame(tr)
print('transakcji', len(T), flush=True)
# cechy przekrojowe: mediany zmienności i obrotów wśród członków S&P 500 w danym miesiącu
Mm = M.copy(); Mm['lr'] = np.log(Mm.c).groupby(Mm.seria).diff()
Mm['zm12'] = Mm.groupby('seria').lr.transform(lambda x: x.rolling(12).std()); Mm['dv3'] = Mm.groupby('seria').dv.transform(lambda x: x.rolling(3).mean())
Mm = Mm[[s_ in SP.get(m_, set()) for s_, m_ in zip(Mm.seria, Mm.m)]]
med = Mm.groupby('m')[['zm12', 'dv3']].median()
spy_s10 = spy.rolling(10).mean(); spy12 = spy / spy.shift(12) - 1
T['F1'] = [spy.get(m_, np.nan) > spy_s10.get(m_, np.nan) for m_ in T.przebicie]
T['F2'] = T.r6 > 0; T['F3'] = T.r6 > 0.30; T['F4'] = T.c > T.sma10; T['F5'] = T.c >= 0.85 * T.max12
T['F6'] = [z < med.zm12.get(m_, np.nan) for z, m_ in zip(T.zm12, T.przebicie)]
T['F7'] = T.wys_trojkata >= 0.15; T['F8'] = T.wys_trojkata < 0.15; T['F9'] = T.vol_x >= 1.5
T['F10'] = [d > med.dv3.get(m_, np.nan) for d, m_ in zip(T.dv3, T.przebicie)]
T['F11'] = [r > spy12.get(m_, np.nan) for r, m_ in zip(T.r12, T.przebicie)]
T['F12'] = T.dl_linii >= 24
OPIS = {'F1': 'SPY > SMA 10 mies.', 'F2': 'zwrot 6M > 0', 'F3': 'zwrot 6M > 30 %', 'F4': 'cena > SMA 10 mies.', 'F5': 'cena >= 85 % max 12 mies.',
        'F6': 'zmienność 12M < mediany', 'F7': 'trójkąt >= 15 %', 'F8': 'trójkąt < 15 %', 'F9': 'wolumen przebicia >= 1,5x', 'F10': 'obroty > mediany',
        'F11': 'zwrot 12M > SPY', 'F12': 'czerwona linia >= 24 mies.'}
T['etap'] = np.where(T.wejscie <= pd.Period('2012-12', 'M'), 'szukanie 1998-2012', np.where(T.wejscie >= pd.Period('2013-01', 'M'), 'sprawdzian 2013-2026', ''))


def ci(x, mies, q=2.5):
    x = np.asarray(x); gm = pd.Series(range(len(x))).groupby(np.asarray(mies)).indices; kl = list(gm.values())
    if len(kl) < 3: return (np.nan, np.nan)
    b = [x[np.concatenate([kl[i] for i in rng.integers(0, len(kl), len(kl))])].mean() for _ in range(2000)]
    return np.percentile(b, [q, 100 - q])


def tab(X, filtry, q=2.5):
    rows = []
    for f in ['brak'] + filtry:
        Y = X if f == 'brak' else X[X[f] if isinstance(f, str) else X[list(f)].all(axis=1)]
        nm = 'bez filtra' if f == 'brak' else (OPIS[f] if isinstance(f, str) else ' + '.join(OPIS[x] for x in f))
        if len(Y) < 10: rows.append(dict(filtr=nm, transakcji=len(Y))); continue
        lo, hi = ci(Y.nadwyzka.values, Y.wejscie.astype(str).values, q)
        rows.append(dict(filtr=nm, transakcji=len(Y), trafione=(Y.zwrot > 0).mean(), sr_zwrot=Y.zwrot.mean(), mediana=Y.zwrot.median(),
                         sr_nadwyzka=Y.nadwyzka.mean(), ci_lo=lo, ci_hi=hi))
    return pd.DataFrame(rows)


FL = [f'F{i}' for i in range(1, 13)]
out = ['# Etap 17: filtry dla linii trendu (procedura w protokole: szukanie 1998-2012, sprawdzian 2013-2026)', '',
       'Wyjście: sam stop (zielona linia). nadwyżka = zwrot transakcji minus SPY w tym samym czasie; 95 % z bootstrapu po miesiącach wejścia.', '']
for rt in (True, False):
    X1 = T[(T.etap == 'szukanie 1998-2012') & (T.retest == rt)]; X2 = T[(T.etap == 'sprawdzian 2013-2026') & (T.retest == rt)]
    t1 = tab(X1, FL); t1['f'] = ['brak'] + FL
    kand = t1[(t1.f != 'brak') & t1.ci_lo.notna()].sort_values('ci_lo', ascending=False)
    wyb = list(kand[kand.ci_lo > 0].f) or list(kand.f[:2])
    para = tuple(kand.f[:2])
    wybrane = wyb + [para]
    q2 = 2.5 / len(wybrane)
    t2 = tab(X2, wybrane, q2)
    t2['dziala'] = t2.ci_lo > 0
    tall = tab(X2, FL)
    out += [f'## {"Z retestem" if rt else "Bez retestu"}', '', '### Krok 1: szukanie (1998-2012)', '', t1.drop(columns='f').round(3).to_markdown(index=False), '',
            f'Wybrane do sprawdzianu: {", ".join(OPIS[x] for x in wyb)} oraz kombinacja: {" + ".join(OPIS[x] for x in para)}.', '',
            f'### Krok 2: sprawdzian (2013-2026), przedziały {100 - 2*q2:.2f} % (Bonferroni)', '', t2.round(3).to_markdown(index=False), '',
            '### Wszystkie filtry w okresie sprawdzianu (opisowo, 95 %)', '', tall.round(3).to_markdown(index=False), '']
open(os.path.join(HERE, 'wyniki', 'r27_filtry_linii.md'), 'w').write('\n'.join(out))
print('\n'.join(out))
